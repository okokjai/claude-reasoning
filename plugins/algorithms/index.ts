// ============================================================
// Algorithm Plugins — Registry
// 所有演算法都在這裡註冊，config.yaml 選 id。
// 新增演算法：export 一個 class implements AlgorithmPlugin → 加入 registry
// ============================================================
import { AlgorithmPlugin, StageRegistry } from '../../src/kernel/types';
import { CoTAlgorithm } from './cot';
import { ToTAlgorithm } from './tot';
import { ReActAlgorithm } from './react';
import { DACAlgorithm } from './dac';

// Registry：所有演算法 map
const registry: Record<string, AlgorithmPlugin> = {
  cot: new CoTAlgorithm(),
  tot: new ToTAlgorithm(),
  react: new ReActAlgorithm(),
  dac: new DACAlgorithm(),
};

/** 依 id 取得演算法 plugin */
export function getAlgorithm(id: string): AlgorithmPlugin | undefined {
  return registry[id];
}

/** 列出所有已註冊演算法 */
export function listAlgorithms(): AlgorithmPlugin[] {
  return Object.values(registry);
}

/** 依 id 建立執行圖（方便測試和 kernel 呼叫） */
export function buildGraph(id: string, stages: StageRegistry): any {
  const algo = getAlgorithm(id);
  if (!algo) throw new Error(`Unknown algorithm: ${id}`);
  return algo.build_graph(stages);
}