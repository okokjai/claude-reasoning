// test/integration/hitl-interrupt.test.ts
// Contract (plan Task 8, spec §3.2/§10.3): when C0 reports `clarification_needed`,
// the graph must pause via `interrupt()`, persist the checkpoint through SqliteSaver,
// and only continue once `resume()` supplies the user's clarification.
import { describe, it, expect } from "vitest";
import { reason, resume } from "../../src/kernel/executor.js";
import { ambiguousInvoker, clarifiedInvoker } from "../mocks/hitl-invoker.js";
import { tempDb } from "../mocks/temp-db.js";

describe("HITL: C0 ambiguity pause/resume via SQLite", () => {
  it("pauses on clarification_needed, resumes with user answer, completes", async () => {
    const { dbPath, cleanup } = tempDb();
    const threadId = "t-hitl";

    try {
      const first = await reason("ambiguous question", {
        threadId,
        dbPath,
        invoker: ambiguousInvoker(),
      });

      expect(first.state.clarification_needed).toBe(true);
      // Pipeline must stop at C0: no downstream stage may have executed.
      expect(first.state.step_execution_log).toEqual(["node_init", "node_c0"]);

      const second = await resume(threadId, "Budget 10k, on-prem required", {
        dbPath,
        invoker: clarifiedInvoker(),
      });

      expect(second.state.clarification_needed).toBe(false);
      expect(second.state.user_clarification).toBe("Budget 10k, on-prem required");
      expect(second.state.conclusion_card).toBeTruthy();
      expect(second.state.step_execution_log).toEqual([
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
    } finally {
      cleanup();
    }
  });
});
