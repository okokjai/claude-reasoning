import { describe, test, expect } from 'vitest';
import { getAlgorithm, listAlgorithms } from '../plugins/algorithms';
import { AlgorithmPlugin, ExecutionGraph, StageName } from '../src/kernel/types';

function assertP0GatesReachable(graph: ExecutionGraph) {
  // 驗證：從起點出發，S5.5 和 S6 都必須在最終路徑上
  expect(graph.nodes).toContain('S5.5');
  expect(graph.nodes).toContain('S6');

  // 驗證：存在 S5.5 → S6 的邊
  const edgeToS6 = graph.edges.find(e => e.to === 'S6');
  expect(edgeToS6).toBeDefined();
  expect(edgeToS6!.from).toBe('S5.5');
}

describe('Algorithm Plugins', () => {
  test('all 4 algorithms are registered', () => {
    const algos = listAlgorithms();
    expect(algos.map(a => a.id).sort()).toEqual(['cot', 'dac', 'react', 'tot']);
  });

  describe('CoT (Chain of Thought)', () => {
    test('builds linear graph with all stages', () => {
      const cot = getAlgorithm('cot') as AlgorithmPlugin;
      const graph = cot.build_graph({ stages: {} });

      // 線性鏈：A1→A0→A2→C0→S0→S1→S2→S3→S4→S5→S5.5→S6
      expect(graph.nodes).toEqual([
        'A1', 'A0', 'A2', 'C0', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6',
      ]);
      // 沒有並行群、沒有回溯循環
      expect(graph.parallel_groups).toBeUndefined();
      expect(graph.loops).toBeUndefined();
      // P0 gates 可達
      assertP0GatesReachable(graph);
    });

    test('cost model is cheapest', () => {
      const cot = getAlgorithm('cot') as AlgorithmPlugin;
      expect(cot.cost_model.time_multiplier).toBeLessThanOrEqual(1.2);
    });
  });

  describe('ToT (Tree of Thought)', () => {
    test('builds tree graph with multi-path expansion in S2->S3', () => {
      const tot = getAlgorithm('tot') as AlgorithmPlugin;
      const graph = tot.build_graph({ stages: {} });

      // S1 → S2 有多路徑展開
      const s1ToS2 = graph.edges.find(e => e.from === 'S1' && e.to === 'S2');
      expect(s1ToS2?.expand).toBeDefined();
      expect(s1ToS2!.expand!.mode).toBe('multi-path');
      expect(s1ToS2!.expand!.count).toBeGreaterThanOrEqual(3);
      expect(s1ToS2!.expand!.parallel).toBe(true);

      // 有回溯（backtrack）規則
      expect(graph.loops).toBeDefined();
      expect(graph.loops!.length).toBeGreaterThanOrEqual(1);

      // P0 gates 可達
      assertP0GatesReachable(graph);
    });

    test('has parallel groups for tree expansion', () => {
      const tot = getAlgorithm('tot') as AlgorithmPlugin;
      const graph = tot.build_graph({ stages: {} });
      expect(graph.parallel_groups).toBeDefined();
      expect(graph.parallel_groups!.some(g => g.includes('S2') && g.includes('S3'))).toBe(true);
    });
  });

  describe('ReAct (Reasoning + Acting)', () => {
    test('builds alternating reasoning-action loop between S2 and S3', () => {
      const react = getAlgorithm('react') as AlgorithmPlugin;
      const graph = react.build_graph({ stages: {} });

      // 有 S2→S3 和 S3→S2 的循環（推理↔行動交替）
      const s2ToS3 = graph.edges.find(e => e.from === 'S2' && e.to === 'S3');
      const s3ToS2 = graph.edges.find(e => e.from === 'S3' && e.to === 'S2');
      expect(s2ToS3).toBeDefined();
      expect(s3ToS2).toBeDefined();

      // 循環有條件：行動結果觀察到需要再思考時繼續
      expect(s3ToS2!.condition).toBeDefined();

      // P0 gates 可達
      assertP0GatesReachable(graph);
    });
  });

  describe('DAC (DIVERGE-ATTEND-CONVERGE)', () => {
    test('builds default graph with DIVERGE-ATTEND-CONVERGE phases', () => {
      const dac = getAlgorithm('dac') as AlgorithmPlugin;
      const graph = dac.build_graph({ stages: {} });

      // DAC 是 claude-reasoning 預設：完整線性 + S0 bounded brainstorm
      expect(graph.nodes).toContain('S0');
      expect(graph.description).toContain('DIVERGE');
      expect(graph.description).toContain('CONVERGE');

      // P0 gates 可達
      assertP0GatesReachable(graph);
    });

    test('has highest quality multiplier', () => {
      const dac = getAlgorithm('dac') as AlgorithmPlugin;
      expect(dac.cost_model.quality_multiplier).toBeGreaterThanOrEqual(1.5);
    });
  });
});

describe('Graph invariants (all algorithms)', () => {
  const all = listAlgorithms();

  for (const algo of all) {
    test(`${algo.id}: no stage appears twice in nodes`, () => {
      const graph = algo.build_graph({ stages: {} });
      const seen = new Set<StageName>();
      for (const node of graph.nodes) {
        expect(seen.has(node)).toBe(false);
        seen.add(node);
      }
    });

    test(`${algo.id}: every edge endpoint exists in nodes`, () => {
      const graph = algo.build_graph({ stages: {} });
      for (const edge of graph.edges) {
        expect(graph.nodes).toContain(edge.from);
        expect(graph.nodes).toContain(edge.to);
      }
    });
  }
});