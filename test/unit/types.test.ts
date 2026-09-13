import { describe, it, expect } from "vitest";
import { GraphStateSchema } from "../../src/kernel/types.js";

const minimal = { session_id: "s1", raw_question: "Should we migrate DB?" };

describe("GraphStateSchema", () => {
  it("applies defaults for minimal input", () => {
    const s = GraphStateSchema.parse(minimal);
    expect(s.scale).toBe("small");
    expect(s.backtrack_count).toBe(0);
    expect(s.stage_0_revision_count).toBe(0);
    expect(s.stage_6_revision_count).toBe(0);
    expect(s.can_branch).toBe(true);
    expect(s.evidence_cap).toBe(5);
    expect(s.quality_cap).toBe(45);
  });
  it("rejects invalid data_type", () => {
    expect(() => GraphStateSchema.parse({ ...minimal, data_type: "nope" })).toThrow();
  });
  it("stores bounded counters as integers", () => {
    const s = GraphStateSchema.parse({ ...minimal, backtrack_count: 3 });
    expect(s.backtrack_count).toBe(3);
  });
  it("pins the 5-enum evidence level", () => {
    expect(() =>
      GraphStateSchema.parse({ ...minimal, conclusion_points: [{ point: "x", level: "[Proven]" }] })
    ).toThrow();
    const s = GraphStateSchema.parse({ ...minimal, conclusion_points: [{ point: "x", level: "[Confirmed]" }] });
    expect(s.conclusion_points[0].level).toBe("[Confirmed]");
  });
});

describe("Stage 3 output fields", () => {
  it("defaults unverified_hypotheses and tool_calls to empty arrays", () => {
    const s = GraphStateSchema.parse({ session_id: "s", raw_question: "q" });
    expect(s.unverified_hypotheses).toEqual([]);
    expect(s.tool_calls).toEqual([]);
    expect(s.cross_validation).toBeUndefined();
  });

  it("accepts a populated ToolCallEntry", () => {
    const s = GraphStateSchema.parse({
      session_id: "s",
      raw_question: "q",
      tool_calls: [
        { sequence: 1, tool: "search", parameters: { query: "x" }, summary: "0 results", engine: "mock", duration_seconds: 0.1 },
      ],
    });
    expect(s.tool_calls[0]?.sequence).toBe(1);
    expect(s.tool_calls[0]?.summary).toBe("0 results");
  });

  it("accepts a not-assessable cross_validation", () => {
    const s = GraphStateSchema.parse({
      session_id: "s",
      raw_question: "q",
      cross_validation: {
        has_multiple_sources: false,
        has_discrepancy_over_20pct: false,
        discrepancy_list: [],
        discrepancy_root_cause: "",
        consensus_range: "",
      },
    });
    expect(s.cross_validation?.has_discrepancy_over_20pct).toBe(false);
  });
});
