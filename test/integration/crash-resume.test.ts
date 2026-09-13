// test/integration/crash-resume.test.ts
// Contract (plan Task 8, spec §10.3): a crash mid-pipeline must leave the SQLite
// checkpoint at the last completed node. Re-invoking the same thread_id resumes
// from that point — completed nodes do not re-execute, so `step_execution_log`
// carries no duplicates and single-writer counters are preserved.
import { describe, it, expect } from "vitest";
import { reason, resume } from "../../src/kernel/executor.js";
import { flakyInvoker } from "../mocks/flaky-invoker.js";
import { mockToolAdapter } from "../mocks/mock-adapter.js";
import { tempDb } from "../mocks/temp-db.js";

describe("Crash resume: SQLite checkpoint idempotency", () => {
  it("resumes after a mid-pipeline crash without re-running completed nodes", async () => {
    const { dbPath, cleanup } = tempDb();
    const threadId = "t-crash";

    try {
      // Crash on the first stage-4 invocation, i.e. after stage-3 committed.
      await expect(
        reason("does a crash resume work?", {
          threadId,
          dbPath,
          invoker: flakyInvoker("[STAGE:stage-4]", 1),
          toolAdapter: mockToolAdapter(),
        })
      ).rejects.toThrow(/simulated crash/);

      // Same thread, healthy invoker: continue from the last committed checkpoint.
      const resumed = await resume(threadId, undefined, {
        dbPath,
        invoker: flakyInvoker("[STAGE:stage-6]", 340),
        toolAdapter: mockToolAdapter(),
      });

      const log = resumed.state.step_execution_log;
      expect(log).toEqual([
        "node_init",
        "node_c0",
        "node_stage_0",
        "node_stage_1",
        "node_stage_2",
        "node_stage_3",
        "node_stage_4",
        "node_stage_5",
        "node_stage_5_5",
        "node_stage_6",
        "node_quality",
      ]);
      // No node ran twice across the crash boundary.
      expect(new Set(log).size).toBe(log.length);
      expect(resumed.state.conclusion_card).toBe("final card");
      expect(resumed.state.quality_score).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("keeps single-writer counters at their pre-crash values", async () => {
    const { dbPath, cleanup } = tempDb();
    const threadId = "t-crash-counters";

    try {
      await expect(
        reason("counter preservation", {
          threadId,
          dbPath,
          invoker: flakyInvoker("[STAGE:stage-5]", 1),
          toolAdapter: mockToolAdapter(),
        })
      ).rejects.toThrow(/simulated crash/);

      const resumed = await resume(threadId, undefined, {
        dbPath,
        invoker: flakyInvoker("[STAGE:stage-6]", 340),
        toolAdapter: mockToolAdapter(),
      });

      expect(resumed.state.stage_0_revision_count).toBe(0);
      expect(resumed.state.stage_6_revision_count).toBe(0);
      expect(resumed.state.backtrack_count).toBe(0);
      expect(resumed.state.step_execution_log.filter((n) => n === "node_stage_5")).toEqual(["node_stage_5"]);
    } finally {
      cleanup();
    }
  });
});
