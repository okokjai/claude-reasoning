import { describe, test, expect } from 'vitest';
import {
  antiHallucinationGate,
  conclusionGates,
  resolveRoute,
  entityExistenceCheck,
  sourceVerificationCheck,
  crossReferenceCheck,
} from '../src/kernel/gates';

// ============================================================
// S5.5 三檢
// ============================================================

describe('S5.5 Anti-Hallucination Gate', () => {
  describe('entityExistenceCheck', () => {
    test('passes when all entities are sourced', () => {
      const result = entityExistenceCheck({
        entities: ['Zeiss', 'Sightline Optical'],
        has_map_lookup: true,
        has_business_registry: true,
        has_review_platform: true,
        unsourced_count: 0,
        sourced_count: 2,
        recommended_entities: ['Zeiss'],
      });
      expect(result.pass).toBe(true);
      expect(result.hallucinated_entities).toHaveLength(0);
    });

    test('fails when unsourced entities exist', () => {
      const result = entityExistenceCheck({
        entities: ['Fake Brand'],
        has_map_lookup: false,
        has_business_registry: false,
        has_review_platform: false,
        unsourced_count: 1,
        sourced_count: 0,
        recommended_entities: ['Fake Brand'],
      });
      expect(result.pass).toBe(false);
      expect(result.hallucinated_entities.length).toBeGreaterThan(0);
    });
  });

  describe('sourceVerificationCheck', () => {
    test('zero tolerance for fabricated citations', () => {
      const result = sourceVerificationCheck({
        citations: [],
        citation_real: 0,
        citation_fabricated: 1,
        citation_misused: 0,
        source_tier_issues: 0,
      });
      expect(result.pass).toBe(false);
    });

    test('zero tolerance for misused citations', () => {
      const result = sourceVerificationCheck({
        citations: [],
        citation_real: 0,
        citation_fabricated: 0,
        citation_misused: 1,
        source_tier_issues: 0,
      });
      expect(result.pass).toBe(false);
    });

    test('passes with clean citations', () => {
      const result = sourceVerificationCheck({
        citations: [{ claim: 'test', url: 'https://example.com', tier: 'T1' }],
        citation_real: 1,
        citation_fabricated: 0,
        citation_misused: 0,
        source_tier_issues: 0,
      });
      expect(result.pass).toBe(true);
    });
  });

  describe('crossReferenceCheck', () => {
    test('zero tolerance for concealed contradictions', () => {
      const result = crossReferenceCheck({
        single_source_claims: 0,
        conflicting_claims: 0,
        concealed_conflicts: 1,
        isolated_judgments: 0,
      });
      expect(result.pass).toBe(false);
    });

    test('passes when no concealed contradictions', () => {
      const result = crossReferenceCheck({
        single_source_claims: 1,
        conflicting_claims: 0,
        concealed_conflicts: 0,
        isolated_judgments: 0,
      });
      expect(result.pass).toBe(true);
      expect(result.pass_details[0]).toContain('single-source');
    });
  });

  describe('antiHallucinationGate (integration)', () => {
    test('passes when all three checks pass', () => {
      const result = antiHallucinationGate({
        entity: {
          entities: ['Zeiss'],
          has_map_lookup: true,
          has_business_registry: true,
          has_review_platform: true,
          unsourced_count: 0,
          sourced_count: 1,
          recommended_entities: [],
        },
        source: {
          citations: [{ claim: 'test', url: 'https://example.com', tier: 'T1' }],
          citation_real: 1,
          citation_fabricated: 0,
          citation_misused: 0,
          source_tier_issues: 0,
        },
        cross_ref: {
          single_source_claims: 0,
          conflicting_claims: 0,
          concealed_conflicts: 0,
          isolated_judgments: 0,
        },
      });
      expect(result.pass).toBe(true);
      expect(result.failure_route).toBeNull();
    });

    test('fails and routes to stage-3 on entity hallucination', () => {
      const result = antiHallucinationGate({
        entity: {
          entities: ['Fake Brand'],
          has_map_lookup: false,
          has_business_registry: false,
          has_review_platform: false,
          unsourced_count: 1,
          sourced_count: 0,
          recommended_entities: ['Fake Brand'],
        },
        source: {
          citations: [],
          citation_real: 0,
          citation_fabricated: 0,
          citation_misused: 0,
          source_tier_issues: 0,
        },
        cross_ref: {
          single_source_claims: 0,
          conflicting_claims: 0,
          concealed_conflicts: 0,
          isolated_judgments: 0,
        },
      });
      expect(result.pass).toBe(false);
      expect(result.failure_route).toBe('stage-3');
    });
  });
});

// ============================================================
// S6 四閘門
// ============================================================

describe('S6 Conclusion Gates', () => {
  test('all gates pass with sufficient evidence', () => {
    const result = conclusionGates({
      evidence_quality: 'Sufficient',
      hallucination_pass: true,
      platform_mode: 'CLI-Full',
      evidence_score: 5,
      confidence: 'high',
    });
    expect(result.gate_1_pass).toBe(true);
    expect(result.gate_2_pass).toBe(true);
    expect(result.all_pass).toBe(true);
  });

  test('gate 1 fails on insufficient evidence', () => {
    const result = conclusionGates({
      evidence_quality: 'Insufficient',
      hallucination_pass: true,
      platform_mode: 'CLI-Full',
      evidence_score: 1,
      confidence: 'high',
    });
    expect(result.gate_1_pass).toBe(false);
    expect(result.all_pass).toBe(false);
  });

  test('gate 2 fails on hallucination', () => {
    const result = conclusionGates({
      evidence_quality: 'Sufficient',
      hallucination_pass: false,
      platform_mode: 'CLI-Full',
      evidence_score: 5,
      confidence: 'high',
    });
    expect(result.gate_2_pass).toBe(false);
    expect(result.all_pass).toBe(false);
  });

  test('confidence is capped at medium when evidence_score <= 3', () => {
    const result = conclusionGates({
      evidence_quality: 'Sufficient',
      hallucination_pass: true,
      platform_mode: 'CLI-Full',
      evidence_score: 3,
      confidence: 'high',
    });
    expect(result.confidence_capped).toBe('medium');
  });

  test('confidence stays high when evidence_score > 3', () => {
    const result = conclusionGates({
      evidence_quality: 'Sufficient',
      hallucination_pass: true,
      platform_mode: 'CLI-Full',
      evidence_score: 5,
      confidence: 'high',
    });
    expect(result.confidence_capped).toBe('high');
  });
});

// ============================================================
// C2 路由
// ============================================================

describe('C2 Route Resolution', () => {
  test('framing_defect allowed when stage_0_revision_count < 1', () => {
    const result = resolveRoute({
      failure_class: 'framing_defect',
      revision_count: 0,
      stage_0_revision_count: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.target).toBe('S0');
  });

  test('framing_defect blocked when stage_0_revision_count >= 1', () => {
    const result = resolveRoute({
      failure_class: 'framing_defect',
      revision_count: 0,
      stage_0_revision_count: 1,
    });
    expect(result.allowed).toBe(false);
  });

  test('hypothesis_defect allowed when revision_count < 3', () => {
    const result = resolveRoute({
      failure_class: 'hypothesis_defect',
      revision_count: 2,
      stage_0_revision_count: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.target).toBe('S2');
  });

  test('hypothesis_defect blocked when revision_count >= 3', () => {
    const result = resolveRoute({
      failure_class: 'hypothesis_defect',
      revision_count: 3,
      stage_0_revision_count: 0,
    });
    expect(result.allowed).toBe(false);
  });

  test('post_gate_decomp blocked after one revision', () => {
    const result = resolveRoute({
      failure_class: 'post_gate_decomp',
      revision_count: 1,
      stage_0_revision_count: 0,
    });
    expect(result.allowed).toBe(false);
  });

  test('decomposition has no bound', () => {
    const result = resolveRoute({
      failure_class: 'decomposition',
      revision_count: 100,
      stage_0_revision_count: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.target).toBe('S1');
  });
});