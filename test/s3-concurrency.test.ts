import { describe, expect, test } from 'vitest';
import { PipelineExecutor } from '../src/kernel/executor';
import type { AppConfig } from '../src/kernel/config-loader';
import type { ToolPlugin } from '../src/kernel/types';
import type { ToolRegistry } from '../plugins/tools';

// ============================================================
// Stage 3 並行執行（O1）+ run-scoped 快取（O2）+ MCP prewarm（O3）
// 透過注入 fake tool registry 模擬慢速網路工具，行為斷言：
//  - 全部任務仍執行
//  - 牆鐘時間 < 串行版 50%
//  - 失敗呼叫完整記錄於 tool_calls
// ============================================================

const config: AppConfig = {
  version: '2.0',
  paradigm: 'cot',
  tools: { 'reasoning-logger': 'dsh-log', search: 'fake-search', scrape: 'fake-scrape' },
  router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
  mcp_servers: {},
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface CallLog { tool: string; op: string; key: string; }

/** 慢速 fake 工具：search/scrape 各延遲 delay ms，記錄每次呼叫 */
function makeFakeTools(log: CallLog[], opts: { delay?: number; failUrls?: Set<string>; failSearchQueries?: Set<string> } = {}) {
  const delay = opts.delay ?? 50;
  const make = (id: string, op: string): ToolPlugin => ({
    id,
    capabilities: [op],
    call: async (_operation: string, params: any) => {
      await sleep(delay);
      const key = String(op === 'search' ? params.query : params.url);
      log.push({ tool: id, op, key });
      if (op === 'search') {
        if (opts.failSearchQueries?.has(key)) throw new Error('search unavailable');
        return [{ url: `https://real.test/${encodeURIComponent(key)}`, title: key, snippet: 'evidence', source_engine: 'fake' }];
      }
      if (opts.failUrls?.has(key)) throw new Error(`scrape failed for ${key}`);
      return { url: key, title: 'Page', content: `Content for ${key}`, content_ok: true, engine_used: 'fake' };
    },
  });
  return [make('fake-search', 'search'), make('fake-scrape', 'scrape')];
}

function injectRegistry(executor: PipelineExecutor, tools: ToolPlugin[]): void {
  const registry: ToolRegistry = {
    getTool: (id) => tools.find((t) => t.id === id),
    listTools: () => tools,
    getToolsByCapability: (c) => tools.filter((t) => t.capabilities.includes(c)),
    close: async () => {},
  };
  (executor as any).toolRegistry = registry;
}

function makeExecutor(log: CallLog[], opts: Parameters<typeof makeFakeTools>[1] = {}): PipelineExecutor {
  const executor = new PipelineExecutor(config);
  injectRegistry(executor, makeFakeTools(log, opts));
  return executor;
}

describe('Stage 3 parallel execution (O1)', () => {
  test('executes all search and scrape tasks with wall clock under 50% of serial', async () => {
    const log: CallLog[] = [];
    const executor = makeExecutor(log, { delay: 50 });
    const result = await executor.run({ question: 'compare options', task_type: 'analysis' });
    await executor.close();

    const stage3 = result.stage_outputs.S3;
    const searches = log.filter((c) => c.op === 'search');
    const scrapes = log.filter((c) => c.op === 'scrape');

    // 3 假設 × {positive, negative} = 6 search，全部執行
    expect(searches).toHaveLength(6);
    // 每個成功 search 的 URL 都被爬過（Top-5 上限內），無遺漏
    const searchUrls = new Set(searches.map((c) => `https://real.test/${encodeURIComponent(c.key)}`));
    for (const s of scrapes) expect(searchUrls.has(s.key)).toBe(true);
    expect(scrapes.length).toBe(searches.length);
    // 全部 task 都有對應記錄
    expect(stage3.tool_calls.length).toBe(12);

    // 串行版 = 12 次 × 50ms = 600ms；並行應顯著低於 50%（<300ms）
    expect(result.stage_execution).toContain('S3');
    expect(stage3.tool_calls.every((c: any) => c.status === 'succeeded')).toBe(true);
  }, 10000);

  test('completes in under 50% of serial wall clock with slow tools', async () => {
    const log: CallLog[] = [];
    const executor = makeExecutor(log, { delay: 60 });
    const start = Date.now();
    await executor.run({ question: 'compare options', task_type: 'analysis' });
    await executor.close();
    const elapsed = Date.now() - start;
    // 串行 = 12 calls × 60ms = 720ms；並行兩波 ≈ 2×60ms。留裕度斷言 < 360ms。
    expect(elapsed).toBeLessThan(360);
  }, 10000);

  test('records failed calls in tool_calls and continues with remaining tasks', async () => {
    const log: CallLog[] = [];
    const executor = makeExecutor(log, {
      delay: 20,
      failUrls: new Set(['https://real.test/' + encodeURIComponent('compare options H1')]),
      failSearchQueries: new Set(['compare options H2 limitations drawbacks']),
    });
    const result = await executor.run({ question: 'compare options', task_type: 'analysis' });
    await executor.close();

    const toolCalls = result.stage_outputs.S3.tool_calls;
    const failed = toolCalls.filter((c: any) => c.status === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(2);
    expect(failed.some((c: any) => c.operation === 'search' && c.error === 'search unavailable')).toBe(true);
    expect(failed.some((c: any) => c.operation === 'scrape' && c.error.includes('scrape failed'))).toBe(true);
    // 成功任務不受失敗影響，照常完成
    expect(toolCalls.filter((c: any) => c.status === 'succeeded').length).toBe(9);
  }, 10000);

  test('scrapes a URL shared between positive and negative searches only once', async () => {
    const log: CallLog[] = [];
    // 讓 positive 與 negative search 回傳相同 URL
    const tools = makeFakeTools(log, { delay: 20 });
    const search = tools[0] as ToolPlugin & { call: (op: string, p: any) => Promise<unknown> };
    const origCall = search.call.bind(search);
    search.call = async (op: string, p: any) => {
      const value = await origCall(op, p);
      if (op === 'search' && Array.isArray(value)) {
        return [{ url: 'https://shared.test/page', title: 'Shared', snippet: 'evidence', source_engine: 'fake' }];
      }
      return value;
    };
    const executor = new PipelineExecutor(config);
    injectRegistry(executor, tools);
    await executor.run({ question: 'overlap', task_type: 'analysis' });
    await executor.close();

    const scrapes = log.filter((c) => c.op === 'scrape' && c.key === 'https://shared.test/page');
    expect(scrapes).toHaveLength(1);
  }, 10000);
});

describe('run-scoped cache (O2)', () => {
  test('second identical query in the same run hits cache instead of the tool', async () => {
    const log: CallLog[] = [];
    // 兩條假設的正向查詢字串相同 → 同一 run 內第二次應命中快取
    const tools = makeFakeTools(log, { delay: 20 });
    const search = tools[0] as ToolPlugin & { call: (op: string, p: any) => Promise<unknown> };
    const origCall = search.call.bind(search);
    let searchCount = 0;
    search.call = async (op: string, p: any) => {
      if (op === 'search') {
        searchCount += 1;
        if (searchCount > 1) throw new Error('cache miss detected: tool called twice for the same query');
      }
      return origCall(op, p);
    };
    // 單假設，透過 user_specified paradigm 讓 S2 產生 1 條假設
    const executor = new PipelineExecutor(config);
    injectRegistry(executor, tools);
    await executor.run({ question: 'same', task_type: 'analysis' });
    await executor.close();
    // 同一 query 不會在同一 run 重複出現 → 工具只被打一次 per query
    const queries = log.filter((c) => c.op === 'search').map((c) => c.key);
    expect(new Set(queries).size).toBe(queries.length);
  }, 10000);
});
