// ============================================================
// ToT — Tree of Thought（樹狀推理）
// S1→S2→S3 變成樹狀探索：多路徑並行展開 + 回溯 + 裁剪。
// ============================================================
import { AlgorithmPlugin, ExecutionGraph, StageRegistry } from '../../src/kernel/types';

export class ToTAlgorithm implements AlgorithmPlugin {
  id = 'tot';
  label = 'Tree of Thought';
  description = 'Tree exploration — multi-path parallel expansion, backtracking, pruning';

  cost_model = {
    base_cost: 15_000,
    per_hypothesis: 3_000,
    time_multiplier: 3.0,
    quality_multiplier: 1.8,
  };

  build_graph(_stages: StageRegistry): ExecutionGraph {
    return {
      nodes: ['A1', 'A0', 'A2', 'C0', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'A2' },
        { from: 'A2', to: 'C0' },
        { from: 'C0', to: 'S0' },
        // S1 → S2 → S3 樹狀展開：多路徑 + 可並行
        { from: 'S0', to: 'S1' },
        { from: 'S1', to: 'S2', expand: { mode: 'multi-path', count: 3, parallel: true } },
        { from: 'S2', to: 'S3', expand: { mode: 'per-branch', count: 3, parallel: true } },
        // 回溯：路徑證據弱時回到 S2
        { from: 'S3', to: 'S2', condition: 'backtrack-on-weak-evidence' },
        // 收斂：證據足夠時前進
        { from: 'S3', to: 'S4', condition: 'evidence-sufficient' },
        { from: 'S4', to: 'S5' },
        { from: 'S5', to: 'S5.5' },
        { from: 'S5.5', to: 'S6', condition: 'hallucination_pass' },
      ],
      parallel_groups: [
        ['S2', 'S3'],  // S2 和 S3 可並行展開（多路徑 × 多分支）
      ],
      loops: [
        { from: 'S3', to: 'S2', condition: 'backtrack-on-weak-evidence', max: 2 },
      ],
      description: 'Tree: ToT 樹狀探索，S1→S2→S3 多路徑並行展開，最多 2 次回溯。',
    };
  }
}

export default ToTAlgorithm;