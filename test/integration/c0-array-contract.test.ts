// test/integration/c0-array-contract.test.ts
// Contract (prompts/contracts/C0.md §Outputs-Optional): the zero-migration C0
// prompt instructs the model to emit `clarification_needed` as a LIST of
// questions. The executor schema must accept that shape and treat a non-empty
// list as "clarification needed", or every real (non-mock) run burns its
// repair retry, hits the fallbackValue `clarification_needed: true`, and
// interrupts at C0 — the pipeline never reaches Stage 0.
import { describe, it, expect } from "vitest";
import { reason } from "../../src/kernel/executor.js";
import { MockLlmInvoker } from "../mocks/mock-invoker.js";
import { mockToolAdapter } from "../mocks/mock-adapter.js";
import { tempDb } from "../mocks/temp-db.js";

// Real-model C0 shape: clarification_needed as an array of question strings,
// per prompts/contracts/C0.md. All other stages return minimal valid output.
const C0_ARRAY = JSON.stringify({
  immutable_constraints: [],
  assumptions: [],
  clarification_needed: ["Budget not specified", "Deployment target unclear"],
});
const CONCLUSION = '{"conclusion_card":"final card","conclusion_points":[],"evidence_quality":"Sufficient"}';
const STAGE_5 = '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}';
const STAGE_4 = '{"preliminary_conclusion":"x","conclusion_card":"card","conclusion_points":[]}';
const STAGE_2 = '{"hypotheses":["h"],"claim_registry":[]}';
const STAGE_1 = '{"core_problem":"core","sub_problems":[],"known_facts":[]}';
const STAGE_0 =
  '{"pain_statement":"p","original_frame":"of","selected_frame":"sf","backup_frame":"bf",' +
  '"candidate_frame_count":1,"selected_frame_count":1,"cheapest_falsifier":"cf",' +
  '"iteration_count":0,"framing_status":"confirmed"}';

describe("C0: array-shaped clarification_needed from the zero-migration prompt", () => {
  it("pauses at C0 when the model outputs a non-empty question list", async () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const invoker = new MockLlmInvoker({
        "[STAGE:c0]": C0_ARRAY,
        "[STAGE:stage-0]": STAGE_0,
        "[STAGE:stage-1]": STAGE_1,
        "[STAGE:stage-2]": STAGE_2,
        "[STAGE:stage-4]": STAGE_4,
        "[STAGE:stage-5]": STAGE_5,
        "[STAGE:stage-6]": CONCLUSION,
      });
      const first = await reason("ambiguous question", {
        threadId: "t-c0-array",
        dbPath,
        invoker,
        toolAdapter: mockToolAdapter(),
      });
      expect(first.state.clarification_needed).toBe(true);
      expect(first.state.step_execution_log).toEqual(["node_init", "node_c0"]);
    } finally {
      cleanup();
    }
  });

  it("proceeds past C0 when the model outputs an empty question list", async () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const invoker = new MockLlmInvoker({
        "[STAGE:c0]": JSON.stringify({
          immutable_constraints: [],
          assumptions: [],
          clarification_needed: [],
        }),
        "[STAGE:stage-0]": STAGE_0,
        "[STAGE:stage-1]": STAGE_1,
        "[STAGE:stage-2]": STAGE_2,
        "[STAGE:stage-3]": '{"tool_calls":[],"unverified_hypotheses":[],"cross_validation":[]}',
        "[STAGE:stage-4]": STAGE_4,
        "[STAGE:stage-5]": STAGE_5,
        "[STAGE:stage-6]": CONCLUSION,
      });
      const result = await reason("clear question", {
        threadId: "t-c0-empty",
        dbPath,
        invoker,
        toolAdapter: mockToolAdapter(),
      });
      expect(result.state.clarification_needed).toBe(false);
      expect(result.state.conclusion_card).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
