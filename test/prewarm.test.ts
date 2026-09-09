import { describe, expect, test } from 'vitest';
import { PipelineExecutor } from '../src/kernel/executor';
import type { ToolPlugin } from '../src/kernel/types';

// O3: MCP prewarm — run() 開頭應對每個工具觸發 'status'（→ initialize()），不阻塞主流程。

describe('MCP prewarm (O3)', () => {
  test('triggers status/initialize on every registered tool when run starts', async () => {
    const calls: string[] = [];
    const makeTool = (id: string): ToolPlugin => ({
      id,
      capabilities: ['search'],
      call: async (operation: string) => {
        calls.push(`${id}:${operation}`);
        return {};
      },
    });
    const tools = [makeTool('fake-a'), makeTool('fake-b')];
    const executor = new PipelineExecutor(undefined);
    const registry = {
      getTool: (id: string) => tools.find((t) => t.id === id),
      listTools: () => tools,
      getToolsByCapability: () => [],
      close: async () => {},
    };
    Object.defineProperty(executor, 'toolRegistry', { value: registry });
    await executor.run({ question: 'q', task_type: 'analysis' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(calls.filter((c) => c.endsWith(':status')).length).toBe(2);
  });
});
