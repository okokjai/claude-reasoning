// test/mocks/flaky-invoker.ts
// Wraps a healthy fixture set and fails the Nth invocation whose user message
// contains `stageTag`, simulating a mid-pipeline crash. Subsequent invocations
// succeed, so re-invoking the same thread must resume from the last checkpoint.
import type { LlmInvoker } from "../../src/kernel/invoker.js";
import { MockLlmInvoker } from "./mock-invoker.js";

export class FlakyLlmInvoker implements LlmInvoker {
  private matches = 0;

  constructor(
    private readonly inner: { invoke(m: { system: string; user: string }[]): Promise<string> },
    private readonly stageTag: string,
    private readonly failOnMatch: number
  ) {}

  async invoke(messages: { system: string; user: string }[]): Promise<string> {
    const user = messages[messages.length - 1]?.user ?? "";
    if (user.includes(this.stageTag)) {
      this.matches += 1;
      if (this.matches === this.failOnMatch) {
        throw new Error(`FlakyLlmInvoker: simulated crash in ${this.stageTag}`);
      }
    }
    return this.inner.invoke(messages);
  }
}

export function healthyFixtures(): Record<string, string> {
  return {
    "[STAGE:c0]": '{"immutable_constraints":[],"assumptions":[],"clarification_needed":false}',
    "[STAGE:stage-0]":
      '{"pain_statement":"p","original_frame":"of","selected_frame":"sf","backup_frame":"bf",' +
      '"candidate_frame_count":1,"selected_frame_count":1,"cheapest_falsifier":"cf",' +
      '"iteration_count":0,"framing_status":"confirmed"}',
    "[STAGE:stage-1]": '{"core_problem":"core","sub_problems":[],"known_facts":[]}',
    "[STAGE:stage-2]": '{"hypotheses":["h"],"claim_registry":[]}',
    "[STAGE:stage-4]": '{"preliminary_conclusion":"x","conclusion_card":"card","conclusion_points":[]}',
    "[STAGE:stage-5]": '{"needs_revision":false,"revision_target":"none","residual_uncertainty":""}',
    "[STAGE:stage-6]":
      '{"conclusion_card":"final card","conclusion_points":[],"evidence_quality":"Sufficient"}',
  };
}

export function flakyInvoker(stageTag: string, failOnMatch = 1): LlmInvoker {
  return new FlakyLlmInvoker(new MockLlmInvoker(healthyFixtures()), stageTag, failOnMatch);
}
