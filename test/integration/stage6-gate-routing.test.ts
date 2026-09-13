import { describe, it, expect } from "vitest";
import { routeStage6, stage6EdgeTarget } from "../../src/kernel/executor.js";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";

const state = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ session_id: "s", raw_question: "q", ...over });

describe("routeStage6", () => {
  it("passes to quality when the gates passed", () => {
    const r = routeStage6(state({ stage_6_gate_passed: true }));
    expect(r.goto).toBe("node_quality");
    expect(r.update.stage_6_revision_count).toBeUndefined();
    expect(r.update.revision_target).toBe("none");
  });

  it("routes to stage_1 and increments the counter once when gates fail", () => {
    const r = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    expect(r.goto).toBe("node_stage_1");
    expect(r.update.stage_6_revision_count).toBe(1);
    expect(r.update.revision_target).toBe("stage-1");
  });

  it("stops routing and warns when the revision budget is spent", () => {
    const r = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 1 }));
    expect(r.goto).toBe("node_quality");
    expect(r.update.stage_6_revision_count).toBeUndefined();
    expect(r.update.residual_uncertainty).toContain("STAGE_6_GATE_WARNING");
    expect(r.update.revision_target).toBe("none");
  });

  it("increments the counter only on the pass that still has budget", () => {
    // Two consecutive failures with budget 1 must not loop: the second converges.
    const first = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    expect(first.update.stage_6_revision_count).toBe(1);
    const second = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: first.update.stage_6_revision_count as number }));
    expect(second.update.stage_6_revision_count).toBeUndefined();
    expect(second.goto).toBe("node_quality");
  });
});

describe("stage6EdgeTarget", () => {
  it("reads the routing token the router wrote", () => {
    const routed = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    const after = { ...state({}), ...routed.update } as GraphState;
    expect(stage6EdgeTarget(after)).toBe("node_stage_1");
  });

  it("converges on quality when the token is none", () => {
    const routed = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 1 }));
    const after = { ...state({}), ...routed.update } as GraphState;
    expect(stage6EdgeTarget(after)).toBe("node_quality");
  });
});
