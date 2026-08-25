// ============================================================
// DAC — DIVERGE-ATTEND-CONVERGE（claude-reasoning 預設）
// 完整 Stage 0 mini brainstorm + 線性後續，質量最高。
// ============================================================
import { AlgorithmPlugin, ExecutionGraph, StageRegistry } from '../../src/kernel/types';

export class DACAlgorithm implements AlgorithmPlugin {
  id = 'dac';
  label = 'DIVERGE-ATTEND-CONVERGE';
  description = 'Claude-reasoning default — bounded brainstorm (DIVERGE→ATTEND→CONVERGE→FALSIFIER→ITERATE) + linear chain';

  cost_model = {
    base_cost: 8_000,
    per_hypothesis: 1_500,
    time_multiplier: 1.5,
    quality_multiplier: 2.0,
  };

  build_graph(_stages: StageRegistry): ExecutionGraph {
    return {
      nodes: ['A1', 'A0', 'A2', 'C0', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'A2' },
        { from: 'A2', to: 'C0' },
        { from: 'C0', to: 'S0' },
        // S0 是 bounded brainstorm：DIVERGE(≤4)→ATTEND→EVALUATE→CONVERGE(≤2)→FALSIFIER→ITERATE(≤1)
        { from: 'S0', to: 'S1' },
        { from: 'S1', to: 'S2' },
        { from: 'S2', to: 'S3' },
        { from: 'S3', to: 'S4' },
        { from: 'S4', to: 'S5' },
        { from: 'S5', to: 'S5.5' },
        { from: 'S5.5', to: 'S6', condition: 'hallucination_pass' },
      ],
      parallel_groups: undefined,
      loops: [
        { from: 'S5', to: 'S0', condition: 'framing-defect', max: 1 },  // stage_0_revision_count ≤ 1
        { from: 'S5', to: 'S2', condition: 'hypothesis-defect', max: 3 },
        { from: 'S5', to: 'S3', condition: 'evidence-defect', max: 3 },
      ],
      description: 'DAC: DIVERGE(≤4)→ATTEND→CONVERGE(≤2)→FALSIFIER→ITERATE(≤1)，質量最高，成本中等。',
    };
  }
}

export default DACAlgorithm;