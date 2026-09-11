// test/integration/gate-intercept.test.ts
// Regression coverage for gate interception (plan Task 9 scenarios 3–4):
//   - Stage 5.5 entity failure routes back to Stage 3, which re-runs and
//     supplies a sourced conclusion so the gate passes to Stage 6
//   - Stage 6 with insufficient evidence fails gate_1 and yields "Redo"
import { describe, it, expect } from "vitest";
import { reason } from "../../src/kernel/executor.js";
import { scriptInvoker } from "../mocks/fixture-script.js";
import { tempDb } from "../mocks/temp-db.js";

const C0 = '{"immutable_constraints":[],"assumptions":[],"clarification_needed":false}';
const STAGE0 = JSON.stringify({
  pain_statement: "p",
  original_frame: "of",
  selected_frame: "AlphaWorks is good",
  backup_frame: "bf",
  candidate_frame_count: 1,
  selected_frame_count: 1,
  cheapest_falsifier: "cf",
  iteration_count: 0,
  framing_status: "confirmed",
});
const STAGE1 = '{"core_problem":"AlphaWorks is good","sub_problems":[],"known_facts":[]}';
const STAGE2 = '{"hypotheses":["AlphaWorks is good"],"claim_registry":[]}';
const PASS_CRITIQUE =
  '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}';

// Scenario 3: the first synthesis introduces an unsourced entity ("Solaris"),
// which the anti-hallucination gate rejects. Stage 3 re-runs (pure TS, no LLM)
// and on the second pass the conclusion is sourced, so the gate clears to S6.
const UNSOURCED_CONCLUSION = JSON.stringify({
  preliminary_conclusion: "AlphaWorks is good but Solaris is untested [src-0]",
  conclusion_card: "card",
  conclusion_points: [{ point: "AlphaWorks is good but Solaris is untested", level: "[Confirmed]" }],
});
const SOURCED_CONCLUSION = JSON.stringify({
  preliminary_conclusion: "AlphaWorks is good [src-0]",
  conclusion_card: "card",
  conclusion_points: [{ point: "AlphaWorks is good", level: "[Confirmed]" }],
});
const STAGE6 = JSON.stringify({
  conclusion_card: "final card",
  conclusion_points: [{ point: "AlphaWorks is good", level: "[Confirmed]" }],
  evidence_quality: "Sufficient",
});
const INSUFFICIENT_STAGE6 = JSON.stringify({
  conclusion_card: "final card",
  conclusion_points: [{ point: "AlphaWorks is good", level: "[Confirmed]" }],
  evidence_quality: "Insufficient",
});

describe("gate interception (Task 9 scenarios 3–4)", () => {
  it("routes an unsourced entity back to Stage 3, then clears when re-sourced", async () => {
    const db = tempDb();
    try {
      const invoker = scriptInvoker({
        c0: [C0],
        "stage-0": [STAGE0],
        "stage-1": [STAGE1],
        "stage-2": [STAGE2],
        "stage-4": [UNSOURCED_CONCLUSION, SOURCED_CONCLUSION],
        "stage-5": [PASS_CRITIQUE],
        "stage-6": [STAGE6],
      });

      const { state } = await reason("Should we adopt AlphaWorks?", { dbPath: db.dbPath, invoker });

      expect(state.hallucination_result?.pass).toBe(true);
      expect(state.conclusion_card).toBe("final card");
      // Stage 4 ran twice: once unsourced (rejected) and once sourced (cleared).
      expect(invoker.calls.filter((s) => s === "stage-4")).toHaveLength(2);
      expect(state.backtrack_count).toBe(1);
    } finally {
      db.cleanup();
    }
  });

  it("redoes when Stage 6 evidence is insufficient (gate_1 no)", async () => {
    const db = tempDb();
    try {
      const invoker = scriptInvoker({
        c0: [C0],
        "stage-0": [STAGE0],
        "stage-1": [STAGE1],
        "stage-2": [STAGE2],
        "stage-4": [SOURCED_CONCLUSION],
        "stage-5": [PASS_CRITIQUE],
        "stage-6": [INSUFFICIENT_STAGE6],
      });

      const { state } = await reason("Should we adopt AlphaWorks?", { dbPath: db.dbPath, invoker });

      // gate_1 is the evidence check: "Insufficient" fails it, and the quality
      // node must record the Redo verdict rather than scoring a partial pass.
      expect(state.quality_score?.total).toBe(0);
      expect(state.evidence_quality).toBe("Insufficient");
    } finally {
      db.cleanup();
    }
  });
});
