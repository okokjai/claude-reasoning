// test/unit/node-factory.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { PromptLoader } from "../../src/kernel/prompt-loader.js";
import { makeStageNode, routeCritique } from "../../src/kernel/node-factory.js";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";

const Out = z.object({ foo: z.string() });
const loader = new PromptLoader("C:/tmp/DONE/cr-reasoning-v2/prompts");
const state = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ session_id: "s", raw_question: "q", ...over });

describe("makeStageNode", () => {
  it("repairs exactly once on schema violation then succeeds", async () => {
    let calls = 0;
    const invoker = { invoke: vi.fn(async () => (++calls === 1 ? "BAD" : '{"foo":"ok"}')) };
    const node = makeStageNode({ stage: "t", promptPath: "stages/stage-4-synthesis.md", outSchema: Out, invoker, loader });
    const out = await node(state({}));
    expect(invoker.invoke).toHaveBeenCalledTimes(2);
    expect(out.foo).toBe("ok");
  });
  it("throws after repair budget exhausted — invalid state never written", async () => {
    const invoker = { invoke: vi.fn(async () => "BAD") };
    const node = makeStageNode({ stage: "t", promptPath: "stages/stage-4-synthesis.md", outSchema: Out, invoker, loader });
    await expect(node(state({}))).rejects.toThrow();
    expect(invoker.invoke).toHaveBeenCalledTimes(2);
  });
  it("zero counter mutation: node output never touches counters or log", async () => {
    const invoker = { invoke: vi.fn(async () => '{"foo":"ok"}') };
    const node = makeStageNode({ stage: "t", promptPath: "stages/stage-4-synthesis.md", outSchema: Out, invoker, loader });
    const out = await node(state({ backtrack_count: 2 }));
    expect(Object.keys(out)).not.toContain("backtrack_count");
    expect(Object.keys(out)).not.toContain("step_execution_log");
  });
  it("invokes with rendered prompt containing OUTPUT_OVERRIDE", async () => {
    const invoker = { invoke: vi.fn(async () => '{"foo":"ok"}') };
    const node = makeStageNode({ stage: "t", promptPath: "stages/stage-4-synthesis.md", outSchema: Out, invoker, loader });
    await node(state({}));
    const call = invoker.invoke.mock.calls[0][0];
    expect(call[0].system).toContain("SYSTEM OVERRIDE: OUTPUT PROTOCOL");
  });
});

describe("routeCritique single-writer counters", () => {
  it("increments backtrack_count once and routes to target", () => {
    const r = routeCritique(state({ backtrack_count: 0, revision_target: "stage-2", needs_revision: true }));
    expect(r.update.backtrack_count).toBe(1);
    expect(r.goto).toBe("node_stage_2");
  });
  it("failsafe at count 3: routes to 5.5 with BACKTRACK_LIMIT_EXCEEDED", () => {
    const r = routeCritique(state({ backtrack_count: 3, revision_target: "stage-2", needs_revision: true }));
    expect(r.goto).toBe("node_stage_5_5");
    expect(r.update.residual_uncertainty).toContain("BACKTRACK_LIMIT_EXCEEDED");
  });
  it("stage-0 revision blocked when already used once", () => {
    const r = routeCritique(state({ stage_0_revision_count: 1, revision_target: "stage-0", needs_revision: true }));
    expect(r.goto).toBe("node_stage_5_5");
    expect(r.update.revision_target).toBe("none");
  });
  it("no revision needed: passes through to 5.5 without counter writes", () => {
    const r = routeCritique(state({ needs_revision: false }));
    expect(r.goto).toBe("node_stage_5_5");
    expect(r.update.backtrack_count).toBeUndefined();
  });
  it("stage-3 revision increments backtrack and routes", () => {
    const r = routeCritique(state({ backtrack_count: 1, revision_target: "stage-3", needs_revision: true }));
    expect(r.update.backtrack_count).toBe(2);
    expect(r.goto).toBe("node_stage_3");
  });
});
