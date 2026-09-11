// test/unit/precision.test.ts
import { describe, it, expect } from "vitest";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";
import { runPrecisionAudit } from "../../src/kernel/precision.js";
const base = GraphStateSchema.parse({
  session_id: "p1",
  raw_question: "q?",
  // stage-3 complete baseline: otherwise the missing-path (-5) and missing-negative (-3)
  // deductions fire on every fixture; plan requires "missing negative search only -> 2".
  search_paths_required: ["topic+latest+news", "topic+analysis+opinion", "topic+controversy", "topic+comparison"],
  negative_search_queries: ["topic+drawbacks+risk"],
});
const s = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ ...base, ...over });

describe("runPrecisionAudit — clean state", () => {
  it("scores 5 with no issues", () => {
    const r = runPrecisionAudit(s({}));
    expect(r.precision_score).toBe(5);
    expect(r.issues_found).toEqual([]);
    expect(r.four_path_complete).toBe(true);
    expect(r.negative_search_complete).toBe(true);
    expect(r.source_quality_annotated).toBe(true);
    expect(r.data_gaps_listed).toBe(true);
    expect(r.confidence_aligned).toBe(true);
  });
});

describe("deduction rules (exact values)", () => {
  it("missing verification path: -5", () => {
    const r = runPrecisionAudit(s({ search_paths_required: [] }));
    expect(r.precision_score).toBe(0);
    expect(r.issues_found).toContain("missing verification path: -5");
    expect(r.four_path_complete).toBe(false);
  });
  it("missing negative search: -3", () => {
    const r = runPrecisionAudit(s({ negative_search_queries: [] }));
    expect(r.precision_score).toBe(2);
    expect(r.issues_found).toContain("missing negative search: -3");
    expect(r.negative_search_complete).toBe(false);
  });
  it("unannotated T3: -2", () => {
    const r = runPrecisionAudit(
      s({ source_quality_matrix: { "src9": { tier: "T3", annotated: false } } })
    );
    expect(r.precision_score).toBe(3);
    expect(r.issues_found).toContain("unannotated T3 source src9: -2");
    expect(r.source_quality_annotated).toBe(false);
  });
  it("unlisted data gap: -2", () => {
    const r = runPrecisionAudit(
      s({ data_gap_list: [], residual_uncertainty: "unknown vendor pricing" })
    );
    expect(r.precision_score).toBe(3);
    expect(r.issues_found).toContain("residual uncertainty not listed as data gap: -2");
    expect(r.data_gaps_listed).toBe(false);
  });
  it("single-source Type-A marked verified: -5", () => {
    const r = runPrecisionAudit(
      s({
        claim_registry: [
          { claim: "X is true", type: "A", verification_threshold: "t", sources_found: ["only1"], verification_status: "passed" },
        ],
      })
    );
    expect(r.precision_score).toBe(0);
    expect(r.issues_found).toContain("single-source Type-A claim marked verified: -5");
    expect(r.confidence_aligned).toBe(false);
  });
  it("multiple deductions sum and floor at 0", () => {
    const r = runPrecisionAudit(
      s({ negative_search_queries: [], data_gap_list: [], residual_uncertainty: "gap here" })
    );
    expect(r.precision_score).toBe(0);
    expect(r.issues_found).toHaveLength(2);
  });
});
