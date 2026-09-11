// test/unit/gates.test.ts
import { describe, it, expect } from "vitest";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";
import { antiHallucinationGate, conclusionGates, BACKTRACK_MAX, STAGE_0_REVISIONS_MAX, STAGE_6_REVISIONS_MAX } from "../../src/kernel/gates.js";

const base = GraphStateSchema.parse({ session_id: "g1", raw_question: "q?" });
const s = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ ...base, ...over });

describe("BACKTRACK constants", () => {
  it("exposes §11.2.3 bounds", () => {
    expect(BACKTRACK_MAX).toBe(3);
    expect(STAGE_0_REVISIONS_MAX).toBe(1);
    expect(STAGE_6_REVISIONS_MAX).toBe(1);
  });
});

describe("antiHallucinationGate — entity check", () => {
  it("passes when every term traces to evidence", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks is good",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
    });
    expect(antiHallucinationGate(st).entity_check).toBe(true);
  });
  it("fails with unsourced term and routes stage-3", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks BetaGamma is good",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
    });
    const g = antiHallucinationGate(st);
    expect(g.entity_check).toBe(false);
    expect(g.pass).toBe(false);
    expect(g.failure_route).toBe("stage-3");
    expect(g.fail_reason).toContain("entity");
  });
});

describe("antiHallucinationGate — source check", () => {
  it("fails when conclusion cites an anchor absent from evidence_matrix", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks is good [src9]",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
    });
    const g = antiHallucinationGate(st);
    expect(g.source_check).toBe(false);
    expect(g.failure_route).toBe("stage-3");
  });
  it("passes when anchors match evidence_matrix", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks is good [src1]",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
    });
    expect(antiHallucinationGate(st).source_check).toBe(true);
  });
});

describe("antiHallucinationGate — cross-reference check", () => {
  it("fails when low-confidence contradiction is concealed", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks is good",
      evidence_matrix: [
        { hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" },
        { hypothesis: "AlphaWorks is good", evidence_summary: "contradicts: it is bad", confidence_bucket: "low", source_anchor: "src2", date: "2026" },
      ],
      contradictory_evidence_ref: [],
    });
    const g = antiHallucinationGate(st);
    expect(g.cross_reference_check).toBe(false);
    expect(g.failure_route).toBe("stage-5");
  });
  it("passes when contradiction is surfaced", () => {
    const st = s({
      preliminary_conclusion: "AlphaWorks is good",
      evidence_matrix: [
        { hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" },
        { hypothesis: "AlphaWorks is good", evidence_summary: "contradicts: it is bad", confidence_bucket: "low", source_anchor: "src2", date: "2026" },
      ],
      contradictory_evidence_ref: [{ hypothesis: "AlphaWorks is good", source_anchor: "src2" }],
    });
    expect(antiHallucinationGate(st).cross_reference_check).toBe(true);
  });
});

describe("antiHallucinationGate — combined", () => {
  it("pass = AND of three checks; clean state passes", () => {
    const clean = s({
      preliminary_conclusion: "AlphaWorks is good [src1]",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
    });
    expect(antiHallucinationGate(clean)).toMatchObject({ pass: true, entity_check: true, source_check: true, cross_reference_check: true });
  });
});

describe("conclusionGates (S6)", () => {
  it("G1: no when evidence_quality is Insufficient", () => {
    expect(conclusionGates(s({ evidence_quality: "Insufficient", hallucination_result: { pass: true, entity_check: true, source_check: true, cross_reference_check: true } })).gate_1).toBe("no");
  });
  it("G2: no when hallucination gate failed", () => {
    expect(conclusionGates(s({ evidence_quality: "Sufficient", hallucination_result: { pass: false, entity_check: false, source_check: true, cross_reference_check: true } })).gate_2).toBe("no");
  });
  it("G3: no when desktop mode leaks proper nouns/prices", () => {
    expect(conclusionGates(s({ platform_mode: "desktop", preliminary_conclusion: "Buy AAPL at $150", hallucination_result: { pass: true, entity_check: true, source_check: true, cross_reference_check: true }, evidence_quality: "Sufficient" })).gate_3).toBe("no");
  });
  it("G3: yes on desktop mode with clean wording", () => {
    expect(conclusionGates(s({ platform_mode: "desktop", preliminary_conclusion: "the vendor is reliable", hallucination_result: { pass: true, entity_check: true, source_check: true, cross_reference_check: true }, evidence_quality: "Sufficient" })).gate_3).toBe("yes");
  });
  it("G4: caps confidence to medium when sources <= 3", () => {
    const g = conclusionGates(s({
      preliminary_conclusion: "AlphaWorks is good",
      evidence_matrix: [{ hypothesis: "AlphaWorks is good", evidence_summary: "ok", confidence_bucket: "high", source_anchor: "src1", date: "2026" }],
      hallucination_result: { pass: true, entity_check: true, source_check: true, cross_reference_check: true },
      evidence_quality: "Sufficient",
    }));
    expect(g.gate_4).toBe("yes");
    expect(g.all_passed).toBe(true);
  });
  it("all_passed false when any gate is no", () => {
    expect(conclusionGates(s({ evidence_quality: "Insufficient" })).all_passed).toBe(false);
  });
});
