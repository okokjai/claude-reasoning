import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
// Bun runs test files in parallel, and two concurrent `bun test` invocations
// must not share files either — the pid keeps each process to its own state.
const STATE_FILE = join(CWD, "tests", `.think_state.example-replay-${process.pid}.json`);
process.env.THINK_STATE_FILE = STATE_FILE;
const EXAMPLE = join(CWD, "references", "example-path-b-verify.md");
const README = join(CWD, "README.md");

/**
 * Worked examples are executable documentation: every ```bash block in
 * references/example-path-b-verify.md is a command the reader is told to run.
 * This suite replays them in file order and fails on the first non-zero exit,
 * so the example cannot drift out of sync with the CLI again.
 */

/** Extract fenced bash blocks in document order. Tolerates CRLF checkouts
 *  (git core.autocrlf on Windows) so the parser is line-ending agnostic. */
function bashBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```bash\r?\n([\s\S]*?)```/g)].map(m => m[1]);
}

/** Split a block into individual think.ts invocations (a block may hold several). */
function invocations(block: string): string[][] {
  const lines = block.split("\n");
  const out: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue; // comment / documented output
    if (trimmed === "") {
      if (current.length > 0) {
        out.push(current);
        current = [];
      }
      continue;
    }
    if (trimmed.startsWith("bun scripts/think.ts")) {
      if (current.length > 0) out.push(current);
      current = [trimmed];
      continue;
    }
    if (current.length > 0 && trimmed.startsWith("--")) {
      current.push(trimmed);
      continue;
    }
    if (current.length > 0) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Split a shell-ish argv string on whitespace, honouring double quotes. */
function argvOf(tokens: string[]): string[] {
  const joined = tokens
    .map(t => (t.endsWith("\\") ? t.slice(0, -1) : t))
    .join(" ");
  const argv: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    argv.push(m[1] ?? m[2] ?? m[3]);
  }
  // Drop the leading interpreter + script path; keep the flags.
  return argv.filter((_, i) => i >= 2);
}

function run(argv: string[]): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? 1 };
}

beforeEach(() => {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f);
      } catch {}
    }
  }
});

describe("references/example-path-b-verify.md is executable", () => {
  it("runs every bash invocation in document order without a non-zero exit", () => {
    const blocks = bashBlocks(readFileSync(EXAMPLE, "utf-8"));
    expect(blocks.length).toBeGreaterThan(0);

    const failures: string[] = [];
    let commandCount = 0;

    for (const block of blocks) {
      for (const tokens of invocations(block)) {
        const argv = argvOf(tokens);
        commandCount++;
        const res = run(argv);
        if (res.code !== 0) {
          failures.push(`exit ${res.code}: ${argv.join(" ")}\n    ${res.stderr.trim().split("\n")[0]}`);
        }
      }
    }

    expect(commandCount).toBe(21);
    expect(failures).toEqual([]);
  });

  it("every `# Output:` line matches what the command actually prints", () => {
    // Exit-code-only replay can document a phantom field (e.g. `"supports"` on
    // registerClaim) forever; compare each documented output against reality.
    const failures: string[] = [];
    for (const block of bashBlocks(readFileSync(EXAMPLE, "utf-8"))) {
      // Pair each invocation with the `# Output:` line that follows it.
      const lines = block.split("\n");
      let pending: string[] = [];
      let expected: string | null = null;
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith("bun scripts/think.ts")) pending = [line];
        else if (line.startsWith("--")) pending.push(line);
        else if (line.startsWith("# Output:")) {
          expected = line.slice("# Output:".length).trim();
          const res = run(argvOf(pending));
          if (expected.startsWith("{")) {
            // JSON: documented key/value pairs must both appear on the real
            // object — a phantom key or a wrong value is a doc bug. Capture
            // both quoted strings and bare scalars (numbers, true/false/null)
            // so `"met": true` or `"count": 5` is verified too.
            const real = JSON.parse(res.stdout);
            const stringPairs = [...expected.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)].map(m => [m[1], m[2]] as const);
            for (const [k, v] of stringPairs) {
              if (!(k in real)) failures.push(`phantom key "${k}" for: ${argvOf(pending).join(" ").slice(0, 60)}`);
              else if (real[k] !== v && !/\.{3}/.test(v)) failures.push(`value mismatch "${k}": documented "${v}", real ${JSON.stringify(real[k])} for: ${argvOf(pending).join(" ").slice(0, 60)}`);
            }
            const scalarPairs = [...expected.matchAll(/"([^"]+)"\s*:\s*(true|false|null|-?\d+(?:\.\d+)?)\s*[,}]/g)].map(m => [m[1], m[2]] as const);
            for (const [k, v] of scalarPairs) {
              const documented = v === "true" ? true : v === "false" ? false : v === "null" ? null : Number(v);
              if (!(k in real)) failures.push(`phantom key "${k}" for: ${argvOf(pending).join(" ").slice(0, 60)}`);
              else if (real[k] !== documented) failures.push(`value mismatch "${k}": documented ${v}, real ${JSON.stringify(real[k])} for: ${argvOf(pending).join(" ").slice(0, 60)}`);
            }
          } else {
            // status line: every documented token must appear verbatim.
            for (const token of expected.split(/\s+/)) {
              if (!res.stdout.includes(token)) failures.push(`missing token "${token}" for: ${argvOf(pending).join(" ").slice(0, 60)}`);
            }
          }
          pending = [];
          expected = null;
        } else if (line.startsWith("#")) {
          /* plain comment */
        } else if (line === "") {
          pending = [];
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("documents verified claims with --claimTier, --claimQuote, --negativeQuery and --negativeFinding", () => {
    const text = readFileSync(EXAMPLE, "utf-8");
    const verifiedBlocks = bashBlocks(text).filter(b => b.includes('--claimStatus verified'));
    expect(verifiedBlocks.length).toBeGreaterThan(0);
    for (const block of verifiedBlocks) {
      expect(block).toContain("--claimTier");
      expect(block).toContain("--claimQuote");
      expect(block).toContain("--negativeQuery");
      expect(block).toContain("--negativeFinding");
    }
  });

  it("Path B example declares --kind on the first thought and applies lenses before resolution", () => {
    const text = readFileSync(EXAMPLE, "utf-8");
    const blocks = bashBlocks(text);

    // The first --thought submission must declare the problem kind so
    // kind-core lens guidance applies from the start of the session.
    const firstThought = blocks
      .flatMap(b => invocations(b))
      .find(tokens => tokens.join(" ").includes("--thought") && !tokens.join(" ").includes("--isRevision"));
    expect(firstThought).toBeDefined();
    expect(firstThought!.join(" ")).toContain("--kind decision");

    // Lens evaluation happens BEFORE hypothesis resolution: recording a lens
    // after --resolveHypothesis is post-hoc labeling, not evaluation.
    const joined = blocks.join("\n");
    const firstLensIdx = Math.min(
      ...["--recordLens", "--analyze"].map(k => {
        const i = joined.indexOf(k);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    const firstResolveIdx = joined.indexOf("--resolveHypothesis");
    expect(firstLensIdx).toBeLessThan(firstResolveIdx);

    // Every lens finding anchors to a registered artifact (hyp-N / crit-N) —
    // the lint report flags unanchored findings with an INFO notice.
    for (const m of text.matchAll(/--finding "([^"]+)"/g)) {
      expect(/\b(?:hyp|crit)-\d+\b/i.test(m[1])).toBe(true);
    }

    // falsificationResult follows the survived:/falsified: convention, and a
    // selected hypothesis carries its --flipIf reversal condition.
    for (const m of text.matchAll(/--falsificationResult\s+["']([^"']+)["']/g)) {
      expect(m[1]).toMatch(/^(survived|falsified):/);
    }
    const resolveBlocks = blocks.filter(b => b.includes("--hypothesisStatus selected") || b.includes("--hypothesisStatus synthesized"));
    expect(resolveBlocks.length).toBeGreaterThan(0);
    for (const b of resolveBlocks) {
      expect(b).toContain("--flipIf");
    }

    // The status-line contract: each thought documents ready=/blockers= so the
    // reader sees real-time termination readiness, not just next=true.
    expect(text).toMatch(/# Output:.*ready=(yes|no)/);
  });
});

describe("README capability summary lists every verified-claim requirement", () => {
  it("names --claimTier alongside the evidence trio in the feature list", () => {
    const line = readFileSync(README, "utf-8")
      .split("\n")
      .find(l => l.includes("External verification module"));
    expect(line).toBeDefined();
    expect(line).toContain("--claimTier");
    expect(line).toContain("--claimQuote");
  });
});
