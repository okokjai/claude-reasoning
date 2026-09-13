// test/integration/backtrack-bounds.test.ts
// Regression coverage for the bounded-backtracking contract (spec §4.4,
// plan Task 9 scenarios 1–2):
//   - a defect re-enters the stage routeCritique names, and counters advance
//   - the stage-0 route is available at most once per run
//   - exceeding BACKTRACK_MAX is a failsafe, not a loop: the run converges on
//     Stage 5.5 with BACKTRACK_LIMIT_EXCEEDED recorded
import { describe, it, expect } from "vitest";
import { reason } from "../../src/kernel/executor.js";
import { BACKTRACK_MAX } from "../../src/kernel/gates.js";
import { scriptInvoker } from "../mocks/fixture-script.js";
import { mockToolAdapter } from "../mocks/mock-adapter.js";
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
const STAGE4 = JSON.stringify({
  preliminary_conclusion: "AlphaWorks is good [src-0]",
  conclusion_card: "card",
  conclusion_points: [{ point: "AlphaWorks is good", level: "[Confirmed]" }],
});
const PASS_CRITIQUE = '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}';
const STAGE6 = JSON.stringify({
  conclusion_card: "final card",
  conclusion_points: [{ point: "AlphaWorks is good", level: "[Confirmed]" }],
  evidence_quality: "Sufficient",
});

const FRAMING_DEFECT =
  '{"needs_revision":true,"revision_target":"stage-0","residual_uncertainty":"frame suspect"}';
const HYPOTHESIS_DEFECT =
  '{"needs_revision":true,"revision_target":"stage-2","residual_uncertainty":"hypothesis incomplete"}';

describe("bounded backtracking (Task 9 scenarios 1–2)", () => {
  it("routes a framing defect back to stage 0, then forces target none on the second one", async () => {
    const db = tempDb();
    try {
      const invoker = scriptInvoker({
        c0: [C0],
        "stage-0": [STAGE0, STAGE0],
        "stage-1": [STAGE1],
        "stage-2": [STAGE2],
        "stage-4": [STAGE4],
        "stage-5": [FRAMING_DEFECT, FRAMING_DEFECT, PASS_CRITIQUE],
        "stage-6": [STAGE6],
      });

      const { state } = await reason("Should we adopt AlphaWorks?", {
        dbPath: db.dbPath,
        invoker,
        toolAdapter: mockToolAdapter(),
      });

      // The first framing defect is real: counter advances and Stage 0 re-runs.
      expect(state.stage_0_revision_count).toBe(1);
      expect(state.backtrack_count).toBe(1);
      expect(invoker.calls.filter((s) => s === "stage-0")).toHaveLength(2);

      // The second framing defect cannot re-route (budget spent): the router
      // forces target none and proceeds instead of looping Stage 0 forever.
      expect(state.revision_target).toBe("none");
      expect(state.needs_revision).toBe(false);
      expect(state.conclusion_card).toBe("final card");
    } finally {
      db.cleanup();
    }
  });

  it("converges on the failsafe instead of looping when the backtrack limit is exceeded", async () => {
    const db = tempDb();
    try {
      const invoker = scriptInvoker({
        c0: [C0],
        "stage-0": [STAGE0],
        "stage-1": [STAGE1],
        "stage-2": [STAGE2],
        "stage-4": [STAGE4],
        // More defects than the budget allows: the router must stop honouring them.
        "stage-5": Array.from({ length: BACKTRACK_MAX + 2 }, () => HYPOTHESIS_DEFECT),
        "stage-6": [STAGE6],
      });

      const { state } = await reason("Should we adopt AlphaWorks?", {
        dbPath: db.dbPath,
        invoker,
        toolAdapter: mockToolAdapter(),
      });

      expect(state.backtrack_count).toBe(BACKTRACK_MAX);
      expect(state.residual_uncertainty).toContain("BACKTRACK_LIMIT_EXCEEDED");
      expect(state.needs_revision).toBe(false);
      expect(state.conclusion_card).toBe("final card");

      // No infinite loop: the graph reached the end, and Stage 2 re-ran only
      // once per permitted backtrack.
      expect(state.step_execution_log.at(-1)).toBe("node_quality");
      expect(invoker.calls.filter((s) => s === "stage-2")).toHaveLength(BACKTRACK_MAX + 1);
    } finally {
      db.cleanup();
    }
  });
});
