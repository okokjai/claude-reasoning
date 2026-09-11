// test/mocks/hitl-invoker.ts
// Two-phase MockLlmInvoker for the HITL scenario:
//   phase 1 — C0 reports `clarification_needed: true`; the graph must interrupt.
//   phase 2 — after `resume()`, the same C0 call must observe `user_clarification`
//             and report `clarification_needed: false`, letting the pipeline finish.
import type { LlmInvoker } from "../../src/kernel/invoker.js";
import { MockLlmInvoker } from "./mock-invoker.js";

const LATEST_CONCLUSION = '{"conclusion_card":"final card","conclusion_points":[],"evidence_quality":"Sufficient"}';
const STAGE_5 = '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}';
const STAGE_4 = '{"preliminary_conclusion":"x","conclusion_card":"card","conclusion_points":[]}';
const STAGE_2 = '{"hypotheses":["h"],"claim_registry":[]}';
const STAGE_1 = '{"core_problem":"core","sub_problems":[],"known_facts":[]}';
const STAGE_0 =
  '{"pain_statement":"p","original_frame":"of","selected_frame":"sf","backup_frame":"bf",' +
  '"candidate_frame_count":1,"selected_frame_count":1,"cheapest_falsifier":"cf",' +
  '"iteration_count":0,"framing_status":"confirmed"}';

/** Phase 1: C0 demands clarification. */
export function ambiguousInvoker(): LlmInvoker {
  return new MockLlmInvoker({
    "[STAGE:c0]": '{"immutable_constraints":[],"assumptions":[],"clarification_needed":true}',
    "[STAGE:stage-0]": STAGE_0,
    "[STAGE:stage-1]": STAGE_1,
    "[STAGE:stage-2]": STAGE_2,
    "[STAGE:stage-4]": STAGE_4,
    "[STAGE:stage-5]": STAGE_5,
    "[STAGE:stage-6]": LATEST_CONCLUSION,
  });
}

/** Phase 2: C0 sees the user's answer and clears the ambiguity. */
export function clarifiedInvoker(): LlmInvoker {
  return new MockLlmInvoker({
    "[STAGE:c0]": '{"immutable_constraints":[],"assumptions":[],"clarification_needed":false}',
    "[STAGE:stage-0]": STAGE_0,
    "[STAGE:stage-1]": STAGE_1,
    "[STAGE:stage-2]": STAGE_2,
    "[STAGE:stage-4]": STAGE_4,
    "[STAGE:stage-5]": STAGE_5,
    "[STAGE:stage-6]": LATEST_CONCLUSION,
  });
}
