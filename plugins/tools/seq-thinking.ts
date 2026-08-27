import { ToolPlugin, Thought } from '../../src/kernel/types';
import { MCPStdioClient, MCPStdioClientOptions } from '../../src/kernel/mcp-stdio-client';

export class SeqThinkingTool implements ToolPlugin {
  id = 'sequential-thinking';
  capabilities = ['reasoning-logger'];
  private readonly client?: MCPStdioClient;

  constructor(options?: MCPStdioClientOptions) { this.client = options ? new MCPStdioClient(options) : undefined; }

  async call(operation: string, params: any): Promise<any> {
    if (operation === 'record') return this.record(params as Thought);
    throw new Error(`Unknown operation: ${operation}`);
  }

  private async record(thought: Thought): Promise<any> {
    if (!thought.thought) throw new Error('Thought content is required');
    if (this.client) {
      await this.client.initialize();
      return this.unwrap(await this.client.callTool('sequentialthinking', { ...thought }));
    }
    return { tool: 'sequential-thinking', operation: 'record', thoughtNumber: thought.thoughtNumber ?? 1, totalThoughts: thought.totalThoughts ?? 1, nextThoughtNeeded: thought.nextThoughtNeeded ?? true, branchId: thought.branchId };
  }

  async close(): Promise<void> { await this.client?.close(); }

  private unwrap(result: any): any {
    if (result && Array.isArray(result.content)) {
      const text = result.content.find((item: any) => item.type === 'text')?.text;
      if (typeof text === 'string') { try { return JSON.parse(text); } catch { return text; } }
    }
    return result;
  }
}

export default SeqThinkingTool;
