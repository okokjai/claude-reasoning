import { describe, it, expect } from "vitest";
import { deriveConfidenceBucket, runStage3 } from "../../src/kernel/executor.js";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";
import type { ToolAdapter } from "../../src/kernel/tool-adapter.js";

const state = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ session_id: "s", raw_question: "q", ...over });

const fixed = (...urls: string[]): ToolAdapter => ({
  search: async () => urls.map((url, i) => ({ url, title: `t${i}`, snippet: `s${i}` })),
});

describe("deriveConfidenceBucket", () => {
  it("never returns high", () => {
    for (const n of [0, 1, 2, 5, 50]) {
      expect(deriveConfidenceBucket(n)).not.toBe("high");
    }
  });
  it("is medium at >=2 hosts, low at 0 or 1", () => {
    expect(deriveConfidenceBucket(0)).toBe("low");
    expect(deriveConfidenceBucket(1)).toBe("low");
    expect(deriveConfidenceBucket(2)).toBe("medium");
  });
});

describe("runStage3", () => {
  it("emits zero evidence and marks unverified when the adapter returns nothing", async () => {
    const out = await runStage3(state({ hypotheses: ["h1", "h2"] }), { search: async () => [] });
    expect(out.evidence_matrix).toEqual([]);
    expect(out.unverified_hypotheses).toEqual(["h1", "h2"]);
    expect(out.verification_complete).toBe(false);
    expect(out.evidence_quality).toBe("Insufficient");
  });

  it("anchors every evidence entry to a real returned URL", async () => {
    const adapter = fixed("https://a.example/x", "https://b.example/y");
    const out = await runStage3(state({ hypotheses: ["h1"] }), adapter);
    const anchors = (out.evidence_matrix ?? []).map((e) => e.source_anchor);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(["https://a.example/x", "https://b.example/y"]).toContain(a);
  });

  it("never marks confidence_bucket high", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    for (const e of out.evidence_matrix ?? []) expect(e.confidence_bucket).not.toBe("high");
  });

  it("records one tool_call per hypothesis dispatch", async () => {
    const out = await runStage3(state({ hypotheses: ["h1", "h2", "h3"] }), fixed("https://a.example/x"));
    expect(out.tool_calls).toHaveLength(3);
    expect((out.tool_calls ?? []).map((c) => c.sequence)).toEqual([1, 2, 3]);
  });

  it("sets verification_complete true when at least one search returned results", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    expect(out.verification_complete).toBe(true);
    expect(out.evidence_quality).toBe("Sufficient");
  });

  it("records cross_validation as not assessable", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    expect(out.cross_validation?.has_discrepancy_over_20pct).toBe(false);
    expect(out.data_gap_list ?? []).toContain("cross_validation not assessable without content reading");
  });
});
