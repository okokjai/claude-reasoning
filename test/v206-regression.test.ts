import { describe, test, expect } from 'vitest';
import { DACAlgorithm } from '../plugins/algorithms/dac';
import { runPrecisionAudit } from '../src/kernel/precision';
import type { StageRegistry } from '../src/kernel/types';

describe('v2.0.6 regression tests', () => {
  test('DAC algorithm graph edges include loop backtrack edges', () => {
    const dac = new DACAlgorithm();
    const emptyRegistry: StageRegistry = { stages: {} };
    const graph = dac.build_graph(emptyRegistry);
    const loopEdgeS0 = graph.edges.find(e => e.from === 'S5' && e.to === 'S0' && e.condition === 'framing-defect');
    const loopEdgeS2 = graph.edges.find(e => e.from === 'S5' && e.to === 'S2' && e.condition === 'hypothesis-defect');
    const loopEdgeS3 = graph.edges.find(e => e.from === 'S5' && e.to === 'S3' && e.condition === 'evidence-defect');
    
    expect(loopEdgeS0).toBeDefined();
    expect(loopEdgeS2).toBeDefined();
    expect(loopEdgeS3).toBeDefined();
  });

  test('precision audit flags Type A claim with single source as insufficient', () => {
    const audit = runPrecisionAudit(
      {
        entity_triple_check: true,
        negative_search: true,
        source_tier_annotated: true,
        cross_validation: true,
        domain_paths_complete: true,
        retry_within_limit: true,
        math_checklist: true,
      },
      {
        entries: [
          {
            claim: 'Single source claim',
            type: 'A',
            verification_threshold: '≥2 sources',
            sources_found: ['https://example.com/source-1'],
            verification_status: 'passed',
            notes: '',
          },
        ],
      }
    );

    expect(audit.issues.some(i => i.description.includes('insufficient sources (1 < 2)'))).toBe(true);
  });
});
