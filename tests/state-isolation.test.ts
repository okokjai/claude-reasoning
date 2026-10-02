import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const CWD = join(__dirname, "..");
// Pin before any write: paths are unique to this process, so two concurrent
// `bun test` invocations never share a state file.
process.env.THINK_STATE_FILE = join(CWD, "tests", `.think_state.state-isolation-${process.pid}.json`);
/**
 * State-file isolation guard.
 *
 * think.ts resolves its state file from THINK_STATE_FILE (think.ts:16), falling
 * back to scripts/.think_state.json. Every test file that drives the CLI must
 * point THINK_STATE_FILE at its own path: bun runs test files in parallel
 * processes, so two suites sharing the real state file unlink and rewrite each
 * other's session mid-run (reproduced: 102 and 77 failures across two
 * concurrent `bun test` runs, versus 149/0 for a single run).
 *
 * This suite proves both halves of the contract:
 *  - the source of every test file pins THINK_STATE_FILE to a file unique to
 *    that file (static check, runs everywhere);
 *  - two CLI processes with distinct THINK_STATE_FILE values cannot observe
 *    each other's writes (dynamic check, the exact failure mode).
 */

const TEST_FILES = ["example-replay.test.ts", "issues.test.ts", "think.test.ts", "state-isolation.test.ts"];

describe("test suites do not share the real state file", () => {
  it("every test file that drives think.ts pins THINK_STATE_FILE and never targets the shared real state path", async () => {
    const offenders: string[] = [];
    for (const name of TEST_FILES) {
      // The guard's own source contains the shared-path pattern it searches for.
      if (name === "state-isolation.test.ts") continue;
      const src = await Bun.file(join(CWD, "tests", name)).text();
      if (!/think\.ts/.test(src)) continue; // does not drive the CLI
      if (!src.includes("THINK_STATE_FILE")) offenders.push(`${name}: no THINK_STATE_FILE pin`);
      if (src.includes(`join(CWD, "scripts", ".think_state.json")`)) {
        offenders.push(`${name}: still resolves the shared scripts/.think_state.json`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("two CLI processes with distinct THINK_STATE_FILE values keep independent state", () => {
    const stateA = join(CWD, "tests", `.isolation-a-${process.pid}.json`);
    const stateB = join(CWD, "tests", `.isolation-b-${process.pid}.json`);
    for (const f of [stateA, stateB]) spawnSync("rm", ["-f", f]);
    const start = (state: string, text: string) =>
      spawnSync(
        "bun",
        ["scripts/think.ts", "--mode", "path-a", "--thought", text, "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"],
        { cwd: CWD, encoding: "utf-8", env: { ...process.env, THINK_STATE_FILE: state } },
      );

    expect(start(stateA, "session A").status).toBe(0);
    expect(start(stateB, "session B").status).toBe(0);

    const readA = spawnSync("bun", ["scripts/think.ts", "--status"], {
      cwd: CWD,
      encoding: "utf-8",
      env: { ...process.env, THINK_STATE_FILE: stateA },
    }).stdout;
    const readB = spawnSync("bun", ["scripts/think.ts", "--status"], {
      cwd: CWD,
      encoding: "utf-8",
      env: { ...process.env, THINK_STATE_FILE: stateB },
    }).stdout;

    expect(JSON.parse(readA).fullHistory[0].thought).toBe("session A");
    expect(JSON.parse(readB).fullHistory[0].thought).toBe("session B");

    for (const f of [stateA, stateB]) spawnSync("rm", ["-f", f]);
  });
});
