// ============================================================
// DSH 內建 Logger（不需要 MCP server）
// 當沒有 sequential-thinking server 時，直接用 DSH session log。
// ============================================================
import { ToolPlugin, Thought } from '../../src/kernel/types';

export class DshLogTool implements ToolPlugin {
  id = 'dsh-log';
  capabilities = ['reasoning-logger'];

  private history: Thought[] = [];

  async call(operation: string, params: any): Promise<any> {
    if (operation === 'record') {
      return this.record(params as Thought);
    }
    if (operation === 'getHistory') {
      return this.history;
    }
    throw new Error(`Unknown operation: ${operation}`);
  }

  private async record(thought: Thought): Promise<any> {
    if (!thought.thought) throw new Error('Thought content is required');

    // 直接寫入 DSH session log（append-only）
    this.history.push(thought);

    return {
      tool: 'dsh-log',
      operation: 'record',
      thoughtNumber: thought.thoughtNumber ?? 1,
      totalThoughts: thought.totalThoughts ?? 1,
      thoughtHistoryLength: this.history.length,
    };
  }
}

export default DshLogTool;