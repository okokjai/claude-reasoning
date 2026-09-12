// test/integration/cli.test.ts
// Contract (plan Task 8b, spec §10.2):
// - `claude-reasoning run "<q>" [--mode m] [--json]` (and `cr-reasoning` alias)
// - `claude-reasoning resume <thread_id> --input "<t>" [--json]`
// - offline execution via CR_REASONING_INVOKER_MODULE / CR_REASONING_FIXTURES
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { tempDb } from "../mocks/temp-db.js";

const CLI_PATH = resolve("src/cli.ts");
const INVOKER_MODULE = resolve("test/fixtures/offline-invoker.mjs");
const FIXTURES_FILE = resolve("test/fixtures/happy-path.tsv");

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const tsxCli = resolve("node_modules/tsx/dist/cli.mjs");
  const res = spawnSync(process.execPath, [tsxCli, CLI_PATH, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CR_REASONING_INVOKER_MODULE: INVOKER_MODULE,
      CR_REASONING_FIXTURES: FIXTURES_FILE,
      ...envOverrides,
    },
  });
  return res;
}

describe("CLI entry point (Task 8b)", () => {
  it("runs pipeline end-to-end with --json and outputs conclusion_card", () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const res = runCli(["run", "Should we adopt AlphaWorks?", "--mode", "decision", "--json"], {
        CR_REASONING_DB_PATH: dbPath,
      });

      expect(res.status, `CLI exited with ${res.status}, stderr: ${res.stderr}`).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.threadId).toMatch(/^cr-/);
      expect(json.state.conclusion_card).toBe("final card");
      expect(json.state.primary_mode).toBe("decision");
      expect(json.state.step_execution_log).toContain("node_quality");
    } finally {
      cleanup();
    }
  });

  it("fails loud when question is missing from run command", () => {
    const res = runCli(["run"]);
    expect(res.status).not.toBe(0);
  });
});
