// ============================================================
// CoT — Chain of Thought（線性推理鏈）
// 最基礎的範式：S0→S1→S2→S3→S4→S5→S5.5→S6，一環扣一環。
// ============================================================
import { AlgorithmPlugin, ExecutionGraph, StageRegistry } from '../../src/kernel/types';

export class CoTAlgorithm implements AlgorithmPlugin {
  id = 'cot';
  label = 'Chain of Thought';
  description = 'Linear reasoning chain — cheapest, fastest, no exploration';

  cost_model = {
    base_cost: 5_000,
    per_hypothesis: 1_000,
    time_multiplier: 1.0,
    quality_multiplier: 1.0,
  };

  build_graph(_stages: StageRegistry): ExecutionGraph {
    return {
      nodes: ['A1', 'A0', 'A2', 'C0', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'A2' },
        { from: 'A2', to: 'C0' },
        { from: 'C0', to: 'S0' },
        { from: 'S0', to: 'S1' },
        { from: 'S1', to: 'S2' },
        { from: 'S2', to: 'S3' },
        { from: 'S3', to: 'S4' },
        { from: 'S4', to: 'S5' },
        { from: 'S5', to: 'S5.5' },
        { from: 'S5.5', to: 'S6', condition: 'hallucination_pass' },
      ],
      parallel_groups: undefined,
      loops: undefined,
      description: 'Linear chain: CoT 線性推理，無回溯、無並行。',
    };
  }
}

export default CoTAlgorithm;