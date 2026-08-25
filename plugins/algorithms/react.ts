// ============================================================
// ReAct — Reasoning + Acting（推理↔行動交替）
// S2 推理 → S3 工具調用 → 觀察結果 → 回到 S2 再推理。
// ============================================================
import { AlgorithmPlugin, ExecutionGraph, StageRegistry } from '../../src/kernel/types';

export class ReActAlgorithm implements AlgorithmPlugin {
  id = 'react';
  label = 'ReAct (Reasoning + Acting)';
  description = 'Reasoning↔Action alternation — think, act, observe, repeat';

  cost_model = {
    base_cost: 10_000,
    per_hypothesis: 2_000,
    time_multiplier: 2.5,
    quality_multiplier: 1.3,
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
        // S2 ↔ S3 交替循環
        { from: 'S1', to: 'S2' },
        { from: 'S2', to: 'S3', condition: 'action-needed' },       // 推理 → 行動
        { from: 'S3', to: 'S2', condition: 'observation-requires-reasoning' }, // 行動 → 再推理
        // 收斂：推理完成不須行動時前進
        { from: 'S2', to: 'S4', condition: 'reasoning-complete' },
        { from: 'S4', to: 'S5' },
        { from: 'S5', to: 'S5.5' },
        { from: 'S5.5', to: 'S6', condition: 'hallucination_pass' },
      ],
      parallel_groups: [
        ['S2', 'S3'],  // 推理和行動交替，但同一時間只有一個活躍
      ],
      loops: [
        { from: 'S3', to: 'S2', condition: 'observation-requires-reasoning', max: 5 },
      ],
      description: 'Alternating: ReAct 推理↔行動交替，最多 5 次循環後收斂。',
    };
  }
}

export default ReActAlgorithm;