// ============================================================
// sequential-thinking MCP Tool Plugin
// 透過 MCP 呼叫 sequential-thinking server 記錄推理節點。
// ============================================================
import { ToolPlugin, Thought, SearchResult, PageContent } from '../../src/kernel/types';

/**
 * 此 adapter 封裝對 mcp__sequential-thinking__sequentialthinking 的呼叫。
 * 在實際執行環境中，這些呼叫會由 Claude Code 的 MCP client 處理。
 * 這個實作是「合約層」— 定義介面，實際呼叫由 harness runtime 完成。
 */
export class SeqThinkingTool implements ToolPlugin {
  id = 'sequential-thinking';
  capabilities = ['reasoning-logger'];

  async call(operation: string, params: any): Promise<any> {
    if (operation === 'record') {
      return this.record(params as Thought);
    }
    throw new Error(`Unknown operation: ${operation}`);
  }

  private async record(thought: Thought): Promise<any> {
    // 在實際執行中，這個方法會呼叫：
    // mcp__sequential-thinking__sequentialthinking({
    //   thought: thought.thought,
    //   thoughtNumber: thought.thoughtNumber,
    //   totalThoughts: thought.totalThoughts,
    //   nextThoughtNeeded: thought.nextThoughtNeeded,
    //   branchId: thought.branchId,
    //   isRevision: thought.isRevision,
    //   revisesThought: thought.revisesThought,
    // })
    //
    // 這裡只做合約驗證
    if (!thought.thought) throw new Error('Thought content is required');

    return {
      tool: 'sequential-thinking',
      operation: 'record',
      thoughtNumber: thought.thoughtNumber ?? 1,
      totalThoughts: thought.totalThoughts ?? 1,
      nextThoughtNeeded: thought.nextThoughtNeeded ?? true,
      branchId: thought.branchId,
    };
  }
}

export default SeqThinkingTool;