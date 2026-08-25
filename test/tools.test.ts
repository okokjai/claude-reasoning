import { describe, test, expect } from 'vitest';
import { getTool, listTools, getToolsByCapability } from '../plugins/tools';
import { C2_ROUTES } from '../src/kernel/types';

// ============================================================
// Tool Plugins
// ============================================================

describe('Tool Plugins Registry', () => {
  test('all 3 tools are registered', () => {
    const tools = listTools();
    expect(tools.map(t => t.id).sort()).toEqual(['dsh-log', 'sequential-thinking', 'unified-fetch']);
  });

  test('sequential-thinking provides reasoning-logger capability', () => {
    const tool = getTool('sequential-thinking')!;
    expect(tool.capabilities).toContain('reasoning-logger');
  });

  test('unified-fetch provides search and scrape capabilities', () => {
    const tool = getTool('unified-fetch')!;
    expect(tool.capabilities).toContain('search');
    expect(tool.capabilities).toContain('scrape');
  });

  test('dsh-log provides reasoning-logger capability without MCP', () => {
    const tool = getTool('dsh-log')!;
    expect(tool.capabilities).toContain('reasoning-logger');
  });

  test('getToolsByCapability("search") returns unified-fetch', () => {
    const tools = getToolsByCapability('search');
    expect(tools.map(t => t.id)).toContain('unified-fetch');
  });

  test('getToolsByCapability("reasoning-logger") returns both loggers', () => {
    const tools = getToolsByCapability('reasoning-logger');
    expect(tools.map(t => t.id).sort()).toEqual(['dsh-log', 'sequential-thinking']);
  });
});

describe('Tool Plugin Behavior', () => {
  test('dsh-log records thoughts and keeps history', async () => {
    const tool = getTool('dsh-log')!;
    await tool.call('record', { thought: 'First thought', thoughtNumber: 1, totalThoughts: 2 });
    await tool.call('record', { thought: 'Second thought', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false });
    const history = await tool.call('getHistory', {});
    expect(history).toHaveLength(2);
    expect(history[0].thought).toBe('First thought');
    expect(history[1].thought).toBe('Second thought');
  });

  test('dsh-log rejects empty thoughts', async () => {
    const tool = getTool('dsh-log')!;
    await expect(tool.call('record', {})).rejects.toThrow('Thought content is required');
  });

  test('sequential-thinking validates thought content', async () => {
    const tool = getTool('sequential-thinking')!;
    const result = await tool.call('record', { thought: 'Test', thoughtNumber: 1, totalThoughts: 1 });
    expect(result.thoughtNumber).toBe(1);
    await expect(tool.call('record', {})).rejects.toThrow('Thought content is required');
  });

  test('unified-fetch rejects empty search query', async () => {
    const tool = getTool('unified-fetch')!;
    await expect(tool.call('search', { query: '' })).rejects.toThrow('Search query is required');
  });

  test('unified-fetch validates status operation', async () => {
    const tool = getTool('unified-fetch')!;
    const status = await tool.call('status', {});
    expect(status.available).toBe(true);
    expect(status.engines).toContain('hound');
  });

  test('unknown operation throws', async () => {
    const tool = getTool('unified-fetch')!;
    await expect(tool.call('nonexistent', {})).rejects.toThrow('Unknown operation');
  });
});

// ============================================================
// 工具熱插拔：同一能力換不同工具
// ============================================================

describe('Tool Hotswap (capability bindings)', () => {
  test('reasoning-logger can swap between dsh-log and sequential-thinking', () => {
    // config.yaml 只是換 binding：
    //   tools: { reasoning-logger: dsh-log }  → 內建
    //   tools: { reasoning-logger: sequential-thinking } → MCP server
    const dsh = getTool('dsh-log')!;
    const seq = getTool('sequential-thinking')!;
    expect(dsh.capabilities).toEqual(seq.capabilities);
  });

  test('stage only depends on capability, not specific tool', () => {
    // 這個測試驗證：S0/S1/S2/S5 需要的 reasoning-logger 能力，
    // 無論綁定哪個工具（dsh-log 或 sequential-thinking）都可用
    const capability = 'reasoning-logger';
    const available = getToolsByCapability(capability);
    expect(available.length).toBeGreaterThanOrEqual(2); // 至少有 2 個選擇
  });
});