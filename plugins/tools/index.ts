// ============================================================
// Tool Plugins — Registry
// 所有工具都在這裡註冊，config.yaml 選 id。
// 新增工具：export 一個 class implements ToolPlugin → 加入 registry
// ============================================================
import { ToolPlugin } from '../../src/kernel/types';
import { SeqThinkingTool } from './seq-thinking';
import { UnifiedFetchTool } from './unified-fetch';
import { DshLogTool } from './dsh-log';

const registry: Record<string, ToolPlugin> = {
  'sequential-thinking': new SeqThinkingTool(),
  'unified-fetch': new UnifiedFetchTool(),
  'dsh-log': new DshLogTool(),
};

/** 依 id 取得工具 plugin */
export function getTool(id: string): ToolPlugin | undefined {
  return registry[id];
}

/** 列出所有已註冊工具 */
export function listTools(): ToolPlugin[] {
  return Object.values(registry);
}

/** 依能力過濾工具 */
export function getToolsByCapability(capability: string): ToolPlugin[] {
  return Object.values(registry).filter(t => t.capabilities.includes(capability));
}