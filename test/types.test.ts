import { describe, test, expect } from 'vitest';
import { C2_ROUTES } from '../src/kernel/types';

describe('C2 Routes', () => {
  test('framing_defect bound is 1', () => {
    expect(C2_ROUTES.framing_defect.bound).toBe(1);
    expect(C2_ROUTES.framing_defect.target).toBe('S0');
  });

  test('hypothesis_defect bound is 3', () => {
    expect(C2_ROUTES.hypothesis_defect.bound).toBe(3);
    expect(C2_ROUTES.hypothesis_defect.target).toBe('S2');
  });

  test('post_gate_decomp bound is 1', () => {
    expect(C2_ROUTES.post_gate_decomp.bound).toBe(1);
    expect(C2_ROUTES.post_gate_decomp.target).toBe('S1');
  });

  test('decomposition has no bound', () => {
    expect(C2_ROUTES.decomposition.bound).toBe(Infinity);
  });

  test('all 6 failure classes are defined', () => {
    const keys = Object.keys(C2_ROUTES);
    expect(keys).toEqual([
      'framing_defect',
      'decomposition',
      'hypothesis_defect',
      'evidence_defect',
      'conclusion_defect',
      'post_gate_decomp',
    ]);
  });
});