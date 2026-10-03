import { describe, it, expect, beforeEach } from "bun:test";
import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const SCRIPT = join(CWD, "scripts", "think.ts");
const STATE_FILE = join(CWD, "tests", `.think_state.round4-${process.pid}.json`);
process.env.THINK_STATE_FILE = STATE_FILE;

function run(argv: string[], env?: Record<string, string>): { stdout: string; stderr: string; code: number } {
  const res = spawnSync("bun", [SCRIPT, ...argv], {
    cwd: CWD,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? 1 };
}

function clean(): void {
  for (const f of [STATE_FILE, STATE_FILE + ".bak"]) rmSync(f, { force: true });
  rmSync(STATE_FILE + ".lock", { force: true, recursive: true });
}

beforeEach(clean);

function startPathB(): void {
  run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
  run(["--registerHypothesis", "H", "--falsification", "falsification clause long enough"]);
  run(["--registerClaim", "c", "--supports", "hyp-1"]);
}

function verify(sources: string[], tiers: number[], extra: string[] = []): ReturnType<typeof run> {
  const argv = ["--verifyClaim", "claim-1", "--claimStatus", "verified"];
  for (const s of sources) argv.push("--claimSource", s);
  for (const t of tiers) argv.push("--claimTier", String(t));
  argv.push("--claimQuote", "a verbatim quote from the source", "--negativeQuery", "nq", "--negativeFinding", "none found", ...extra);
  return run(argv);
}

describe("round-4: verified independence must hold among Tier 1/2 sources", () => {
  it("rejects two pages on one Tier 1 domain plus a Tier 3 blog on another domain", () => {
    startPathB();
    const res = verify(
      ["https://nature.com/a", "https://nature.com/b", "https://random-blog.org/x"],
      [1, 1, 3],
    );
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("distinct root domains");
  });

  it("accepts two Tier 1/2 sources on different domains", () => {
    startPathB();
    expect(verify(["https://nature.com/a", "https://science.org/b"], [1, 2]).code).toBe(0);
  });

  it("accepts Tier 1/2 sources plus an extra Tier 3 source", () => {
    startPathB();
    expect(verify(["https://nature.com/a", "https://science.org/b", "https://blog.example/x"], [1, 1, 3]).code).toBe(0);
  });
});

describe("round-4: root-domain derivation", () => {
  it.each([
    ["https://www.abs.gov.au/x", "https://www.ato.gov.au/y"],
    ["https://www.nus.edu.sg/x", "https://www.ntu.edu.sg/y"],
    ["https://www.u-tokyo.ac.jp/x", "https://www.kyoto-u.ac.jp/y"],
  ])("treats %s and %s as distinct organisations", (a, b) => {
    startPathB();
    expect(verify([a, b], [1, 1]).code).toBe(0);
  });

  it("still collapses two pages of one gov.au agency into one domain", () => {
    startPathB();
    const res = verify(["https://www.abs.gov.au/x", "https://www.abs.gov.au/y"], [1, 1]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("1 root domain");
  });

  it("accepts a bare host with a port instead of mistaking it for a URL scheme", () => {
    startPathB();
    expect(verify(["example.com:8080/x", "other.org/y"], [1, 1]).code).toBe(0);
  });

  it("still rejects real non-http schemes", () => {
    startPathB();
    expect(verify(["file:///etc/passwd", "https://b.example/y"], [1, 1]).code).toBe(1);
  });
});

describe("round-4: documented two-line --negativeFinding form", () => {
  it("turns a literal \\n into a real newline so the single-line WARN can clear", () => {
    startPathB();
    expect(verify(["https://a.example/x", "https://b.example/y"], [1, 1]).code).toBe(0);
    // Re-verify with the documented syntax: backslash-n arrives literally from a shell.
    const argv = [
      "--verifyClaim", "claim-1", "--claimStatus", "verified",
      "--claimSource", "https://a.example/x", "--claimSource", "https://b.example/y",
      "--claimTier", "1", "--claimTier", "1",
      "--claimQuote", "a verbatim quote from the source", "--negativeQuery", "nq",
      "--negativeFinding", "grep -r foo .\\nno matches",
    ];
    expect(run(argv).code).toBe(0);
    const stored = JSON.parse(readFileSync(STATE_FILE, "utf-8")).claims["claim-1"].negativeFinding as string;
    expect(stored).toContain("\n");
    expect(run(["--export"]).stdout).not.toContain("single-line negativeFinding");
  });
});

describe("round-4: gate bypass leaves a persistent trace", () => {
  it("a later --export still reports gates that THINK_GATES_OFF disabled", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "A", "--falsification", "falsification A condition xx"]);
    run(["--registerHypothesis", "B", "--falsification", "falsification B condition xx"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "selected", "--hypothesisNotes", "n", "--falsificationResult", "held ok"]);
    run(["--resolveHypothesis", "hyp-2", "--hypothesisStatus", "rejected", "--hypothesisNotes", "n", "--falsificationResult", "broken ok"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const end = run(
      ["--thought", "done", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"],
      { THINK_GATES_OFF: "all" },
    );
    expect(end.code).toBe(0);
    const later = run(["--export"]); // separate process, env var NOT set
    expect(later.stdout).toContain("gate criteria disabled");
    expect(later.stdout).toContain("gate lenses disabled");
  });
});

describe("round-4: concurrent invocations do not lose writes", () => {
  it("12 parallel --registerHypothesis calls all persist with unique ids", async () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        new Promise<{ code: number; out: string }>((resolve) => {
          const p = spawn("bun", [SCRIPT, "--registerHypothesis", `parallel ${i}`, "--falsification", `falsification clause number ${i}`], {
            cwd: CWD,
            env: process.env,
          });
          let out = "";
          p.stdout.on("data", (d) => (out += d));
          p.on("close", (code) => resolve({ code: code ?? 1, out }));
        }),
      ),
    );
    expect(results.every((r) => r.code === 0)).toBe(true);
    const ids = results.map((r) => JSON.parse(r.out).registered as string);
    expect(new Set(ids).size).toBe(N);
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(Object.keys(state.hypotheses).length).toBe(N);
    expect(existsSync(STATE_FILE + ".lock")).toBe(false);
  }, 60_000);

  it("steals a stale lock left by a crashed process", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    spawnSync("mkdir", [STATE_FILE + ".lock"]);
    spawnSync("touch", ["-d", "2 minutes ago", STATE_FILE + ".lock"]);
    expect(run(["--status"]).code).toBe(0);
    expect(existsSync(STATE_FILE + ".lock")).toBe(false);
  });
});
