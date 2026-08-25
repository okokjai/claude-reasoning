import { describe, test, expect } from 'vitest';
import {
  createVerificationTasks,
  mergeEvidence,
  crossValidate,
} from '../src/kernel/s3-parallel';
import {
  runPrecisionAudit,
  assessSourceTier,
  detectMarketingContent,
} from '../src/kernel/precision';

// ============================================================
// Stage 3 平行化
// ============================================================

describe('s3-parallel: createVerificationTasks', () => {
  test('creates tasks for each hypothesis × engine', () => {
    const tasks = createVerificationTasks(
      ['Zeiss', 'Essilor'],
      'lens brand',
      ['unified-fetch', 'websearch'],
    );
    // 2 hypotheses × 2 engines × 2 (positive + negative) = 8
    expect(tasks).toHaveLength(8);
  });

  test('includes negative search for each hypothesis', () => {
    const tasks = createVerificationTasks(['Zeiss'], 'lens brand');
    const negativeTasks = tasks.filter(t => t.query.includes('limitations'));
    expect(negativeTasks.length).toBeGreaterThanOrEqual(1);
  });

  test('includes domain suffix when provided', () => {
    const tasks = createVerificationTasks(['Zeiss'], 'lens brand', ['unified-fetch'], 'tech');
    expect(tasks[0].query).toContain('tech');
  });
});

describe('s3-parallel: mergeEvidence', () => {
  test('merges results by hypothesis', () => {
    const merged = mergeEvidence([
      {
        hypothesis: 'Zeiss',
        query: 'Zeiss lenses',
        engine: 'unified-fetch',
        search_results: [{ url: 'https://example.com/zeiss', title: 'Zeiss', snippet: 'Great', source_engine: 'hound' }],
        pages: [],
        engine_available: true,
      },
      {
        hypothesis: 'Zeiss',
        query: 'Zeiss limitations',
        engine: 'unified-fetch',
        search_results: [{ url: 'https://example.com/zeiss-limits', title: 'Zeiss limits', snippet: 'Expensive', source_engine: 'hound' }],
        pages: [{ url: 'https://example.com/zeiss-limits', title: 'Zeiss limits', content: 'Zeiss is expensive', content_ok: true, engine_used: 'newspaper' }],
        engine_available: true,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].hypothesis).toBe('Zeiss');
    expect(merged[0].sources.length).toBeGreaterThanOrEqual(1);
    expect(merged[0].has_negative_evidence).toBe(true);
  });

  test('confidence is high with 3+ sources', () => {
    const merged = mergeEvidence([
      { hypothesis: 'X', query: 'X', engine: 'e1', search_results: [1,2,3].map(i => ({ url: `https://x.com/${i}`, title: `X${i}`, snippet: 'x', source_engine: 'hound' })), pages: [], engine_available: true },
    ]);
    expect(merged[0].confidence_bucket).toBe('high');
  });
});

// ============================================================
// Precision
// ============================================================

describe('precision: runPrecisionAudit', () => {
  test('passes when all checks pass', () => {
    const audit = runPrecisionAudit({
      entity_triple_check: true,
      negative_search: true,
      source_tier_annotated: true,
      cross_validation: true,
      domain_paths_complete: true,
      retry_within_limit: true,
      math_checklist: true,
    });
    expect(audit.passed).toBe(true);
    expect(audit.issues).toHaveLength(0);
    expect(audit.score).toBe(100);
  });

  test('fails on missing entity triple check', () => {
    const audit = runPrecisionAudit({
      entity_triple_check: false,
      negative_search: true,
      source_tier_annotated: true,
      cross_validation: true,
      domain_paths_complete: true,
      retry_within_limit: true,
      math_checklist: true,
    });
    expect(audit.passed).toBe(false);
    expect(audit.issues.some(i => i.rule === 'entity_triple_check')).toBe(true);
    expect(audit.score).toBeLessThan(100);
  });

  test('fails on missing negative search', () => {
    const audit = runPrecisionAudit({
      entity_triple_check: true,
      negative_search: false,
      source_tier_annotated: true,
      cross_validation: true,
      domain_paths_complete: true,
      retry_within_limit: true,
      math_checklist: true,
    });
    expect(audit.issues.some(i => i.rule === 'negative_search')).toBe(true);
    expect(audit.score).toBeLessThan(100);
  });

  test('fails on missing domain paths', () => {
    const audit = runPrecisionAudit({
      entity_triple_check: true,
      negative_search: true,
      source_tier_annotated: true,
      cross_validation: true,
      domain_paths_complete: false,
      retry_within_limit: true,
      math_checklist: true,
    });
    expect(audit.issues.some(i => i.rule === 'domain_paths_complete')).toBe(true);
  });

  test('score is 80 when all checks fail (100 - 5 - 3 - 2 - 5 - 5)', () => {
    const audit = runPrecisionAudit({});
    expect(audit.score).toBe(80);
    expect(audit.issues.length).toBeGreaterThanOrEqual(3);
    expect(audit.passed).toBe(false); // P0 critical rules failed
  });

  test('single source marked verified is detected', () => {
    const audit = runPrecisionAudit(
      { entity_triple_check: true, negative_search: true, source_tier_annotated: true, cross_validation: true, domain_paths_complete: true, retry_within_limit: true, math_checklist: true },
      { entries: [{ claim: 'Zeiss has 3 stores', type: 'A', verification_threshold: '≥2 sources', sources_found: [], verification_status: 'passed', notes: '' }] },
    );
    expect(audit.issues.some(i => i.description.includes('no sources'))).toBe(true);
  });
});

describe('precision: assessSourceTier', () => {
  test('google maps is T1', () => {
    expect(assessSourceTier('https://google.com/maps/place/Zeiss')).toBe('T1');
  });
  test('yelp is T2', () => {
    expect(assessSourceTier('https://yelp.com/biz/zeiss')).toBe('T2');
  });
  test('youtube is T3', () => {
    expect(assessSourceTier('https://youtube.com/watch?v=zeiss')).toBe('T3');
  });
  test('quora is T4', () => {
    expect(assessSourceTier('https://quora.com/zeiss')).toBe('T4');
  });
  test('unknown is T5', () => {
    expect(assessSourceTier('https://unknown-blog.com/zeiss')).toBe('T5');
  });
});

describe('precision: detectMarketingContent', () => {
  test('detects 3+ marketing keywords', () => {
    const text = 'This is a game changer! The best-in-class, unbeatable, revolutionary product.';
    const result = detectMarketingContent(text);
    expect(result.is_marketing).toBe(true);
    expect(result.indicators.length).toBeGreaterThanOrEqual(3);
  });

  test('clean text passes', () => {
    const text = 'I visited the store and found their service acceptable. The price was reasonable.';
    const result = detectMarketingContent(text);
    expect(result.is_marketing).toBe(false);
  });
});