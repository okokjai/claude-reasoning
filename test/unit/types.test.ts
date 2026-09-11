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
