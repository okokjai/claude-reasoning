import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const GATE = join(import.meta.dir, "..", ".claude", "hooks", "reasoning-gate.mjs");

let dir: string;
let state: string;

async function runGate(
  tool_name: string,
  tool_input: Record<string, unknown>,
): Promise<{ stdout: string; code: number }> {
  const proc = Bun.spawn({
    cmd: [process.execPath, GATE],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, REASONING_GATE_STATE: state },
  });
  proc.stdin.write(JSON.stringify({ tool_name, tool_input, cwd: join(import.meta.dir, "..") }));
  proc.stdin.end();
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { stdout: stdout.trim(), code };
}

function decision(res: { stdout: string }): string | undefined {
  const parsed = JSON.parse(res.stdout);
  return parsed.hookSpecificOutput?.permissionDecision;
}

function convergedState(): unknown {
  return {
    mode: "path-a",
    thoughtHistory: [
      { thought: "T1", thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: false },
    ],
    branches: {},
    claims: {},
    hypotheses: {},
    auditTrail: [],
  };
}

function unconvergedState(): unknown {
  const s = convergedState() as { thoughtHistory: Array<{ nextThoughtNeeded: boolean }> };
  s.thoughtHistory[0].nextThoughtNeeded = true;
  return s;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gate-"));
  state = join(dir, "state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("reasoning-gate: blocks mutations without a converged state", () => {
  it("blocks Edit when no state file exists", async () => {
    const res = await runGate("Edit", { file_path: "scripts/think.ts" });
    expect(decision(res)).toBe("deny");
    expect(JSON.parse(res.stdout).hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(res.stdout).toContain("REASONING_GATE");
  });

  it("blocks Write when no state file exists", async () => {
    const res = await runGate("Write", { file_path: "README.md" });
    expect(decision(res)).toBe("deny");
  });

  it("blocks mutating Bash when no state file exists", async () => {
    const res = await runGate("Bash", { command: 'echo "x" > file.txt' });
    expect(decision(res)).toBe("deny");
  });

  it("denies think.ts chained with a mutating command (&& bypass)", async () => {
    const res = await runGate("Bash", {
      command: "bun scripts/think.ts --reset && echo hijack > f.txt",
    });
    expect(decision(res)).toBe("deny");
  });

  it("blocks Edit when last thought is unconverged (nextThoughtNeeded true)", async () => {
    writeFileSync(state, JSON.stringify(unconvergedState()));
    const res = await runGate("Edit", { file_path: "scripts/think.ts" });
    expect(decision(res)).toBe("deny");
  });
});

describe("reasoning-gate: allows when state is converged or action is not a mutation", () => {
  it("allows Edit when last thought converged", async () => {
    writeFileSync(state, JSON.stringify(convergedState()));
    const res = await runGate("Edit", { file_path: "scripts/think.ts" });
    expect(decision(res)).not.toBe("block");
  });

  it("allows the think.ts invocation itself (Bash) with no state", async () => {
    const res = await runGate("Bash", {
      command: "bun scripts/think.ts --mode path-a --thought T1 --thoughtNumber 1 --totalThoughts 3 --nextThoughtNeeded true",
    });
    expect(decision(res)).not.toBe("block");
  });

  it("allows non-mutating Bash (bun test) with no state", async () => {
    const res = await runGate("Bash", { command: "bun test" });
    expect(decision(res)).not.toBe("block");
  });

  it("allows reading the state file itself (Write to .think_state.json)", async () => {
    const res = await runGate("Write", { file_path: "scripts/.think_state.json" });
    expect(decision(res)).not.toBe("block");
  });

  it("allows modifying gate self-files under .claude/ with no state", async () => {
    const res = await runGate("Write", { file_path: ".claude/settings.json" });
    expect(decision(res)).not.toBe("block");
  });

  it("ignores non-gated tools (Read) with no state", async () => {
    const res = await runGate("Read", { file_path: "README.md" });
    expect(decision(res)).not.toBe("deny");
  });

  it("settings.json hook command is portable (${CLAUDE_PROJECT_DIR}, no drive path)", () => {
    const settings = readFileSync(
      join(import.meta.dir, "..", ".claude", "settings.json"),
      "utf-8",
    );
    expect(settings).toContain("${CLAUDE_PROJECT_DIR}");
    expect(settings).not.toMatch(/[A-Z]:\//);
  });
});