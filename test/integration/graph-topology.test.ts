// test/integration/graph-topology.test.ts
import { describe, it, expect } from "vitest";
import { MockLlmInvoker } from "../mocks/mock-invoker.js";
import { mockToolAdapter } from "../mocks/mock-adapter.js";
import { tempDb } from "../mocks/temp-db.js";
import { reason } from "../../src/kernel/executor.js";
import { conclusionGates } from "../../src/kernel/gates.js";

const fixtures: Record<string, string> = {
  "[STAGE:c0]": '{"immutable_constraints":[],"assumptions":[],"clarification_needed":false}',
  "[STAGE:stage-0]": '{"pain_statement":"p","original_frame":"of","selected_frame":"AlphaWorks is good","backup_frame":"bf","candidate_frame_count":1,"selected_frame_count":1,"cheapest_falsifier":"cf","iteration_count":0,"framing_status":"confirmed"}',
  "[STAGE:stage-1]": '{"core_problem":"AlphaWorks is good","sub_problems":[],"known_facts":[]}',
  "[STAGE:stage-2]": '{"hypotheses":["AlphaWorks is good"],"claim_registry":[]}',
  "[STAGE:stage-4]": '{"preliminary_conclusion":"AlphaWorks is good [src-0]","conclusion_card":"card","conclusion_points":[{"point":"AlphaWorks is good","level":"[Confirmed]"}]}',
  "[STAGE:stage-5]": '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}',
  "[STAGE:stage-6]": '{"conclusion_card":"final card","conclusion_points":[{"point":"AlphaWorks is good","level":"[Confirmed]"}],"evidence_quality":"Sufficient"}',
};

const HAPPY_LOG = [
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
];

describe("happy-path topology", () => {
  it("runs START to END through SqliteSaver with exact node sequence", async () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const { state, threadId } = await reason("Should we adopt AlphaWorks?", {
        threadId: "t-topo-1",
        dbPath,
        invoker: new MockLlmInvoker(fixtures),
        toolAdapter: mockToolAdapter(),
      });
      expect(threadId).toBe("t-topo-1");
      expect(state.conclusion_card).toBeTruthy();
      expect(state.hallucination_result?.pass).toBe(true);
      expect(state.quality_score?.total).toBeGreaterThan(0);
      expect(state.step_execution_log).toEqual(HAPPY_LOG);
    } finally {
      cleanup();
    }
  });

  it("all 4 S6 gates are yes on the happy path", async () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const { state } = await reason("q?", {
        threadId: "t-topo-2",
        dbPath,
        invoker: new MockLlmInvoker(fixtures),
        toolAdapter: mockToolAdapter(),
      });
      const gates = conclusionGates(state);
      expect(gates).toEqual({ gate_1: "yes", gate_2: "yes", gate_3: "yes", gate_4: "yes", all_passed: true });
    } finally {
      cleanup();
    }
  });
});
