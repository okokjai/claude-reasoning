import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/kernel/config-loader';
import { PipelineExecutor } from '../src/kernel/executor';

const serverSource = String.raw`
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'stage3-fake', version: '1.0' } };
  } else if (request.method === 'tools/call') {
    const args = request.params.arguments || {};
    if (request.params.name === 'search') {
      const query = args.query;
      const negative = query.includes('limitations') || query.includes('drawbacks');
      result = { content: [{ type: 'text', text: JSON.stringify([
        { url: 'https://real.test/' + (negative ? 'negative' : 'positive'), title: negative ? 'Limitations' : 'Evidence', snippet: negative ? 'Known limitation' : 'Verified evidence', source_engine: 'fake-mcp' },
      ]) }] };
    } else if (request.params.name === 'scrape') {
      result = { content: [{ type: 'text', text: JSON.stringify({ url: args.url, title: 'Fetched evidence', content: 'Evidence fetched from the temporary MCP server.', content_ok: true, engine_used: 'fake-mcp' }) }] };
    } else {
      result = { content: [{ type: 'text', text: JSON.stringify({ available: true }) }] };
    }
  } else {
    result = { tools: [] };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
`;

const config = (server: AppConfig['mcp_servers']): AppConfig => ({
  version: '2.0',
  paradigm: 'cot',
  tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
  router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
  mcp_servers: server,
});

let directory: string;
let server: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'stage3-mcp-execution-'));
  server = join(directory, 'fake-server.cjs');
  await writeFile(server, serverSource, 'utf8');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('Stage 3 MCP execution', () => {
  test('does not merge search-only evidence when scrape fails', async () => {
    const failingServer = join(directory, 'failing-server.cjs');
    await writeFile(failingServer, serverSource.replace("result = { content: [{ type: 'text', text: JSON.stringify({ url: args.url, title: 'Fetched evidence', content: 'Evidence fetched from the temporary MCP server.', content_ok: true, engine_used: 'fake-mcp' }) }] };", "throw new Error('scrape unavailable');"), 'utf8');
    const result = await new PipelineExecutor(config({ 'unified-fetch': { command: process.execPath, args: [failingServer] } })).run({ question: 'scrape failure', task_type: 'analysis' });
    expect(result.stage_outputs.S3.evidence_matrix).toHaveLength(0);
    expect(result.stage_outputs.S3.tool_calls.some((call: any) => call.operation === 'scrape' && call.status === 'failed')).toBe(true);
    expect(result.stage_outputs.S3.evidence_quality).toBe('Insufficient');
  });

  test('does not treat synthetic fallback as available evidence', async () => {
    const result = await new PipelineExecutor(config({})).run({ question: 'fallback evidence', task_type: 'analysis' });
    expect(result.stage_outputs.S3.evidence_quality).toBe('Insufficient');
    expect(result.stage_outputs.S3.evidence_matrix).toHaveLength(0);
    expect(result.p0_passed).toBe(false);
  });

  test('calls search and scrape and records traceable real evidence', async () => {
    const result = await new PipelineExecutor(config({
      'unified-fetch': { command: process.execPath, args: [server] },
    })).run({ question: 'compare reliable options', task_type: 'analysis' });

    const stage3 = result.stage_outputs.S3;
    expect(stage3.tool_calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'search', tool: 'unified-fetch' }),
      expect.objectContaining({ operation: 'scrape', tool: 'unified-fetch' }),
    ]));
    expect(stage3.evidence_matrix[0].sources[0].url).toMatch(/^https:\/\/real\.test\//);
    expect(stage3.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringMatching(/^https:\/\/real\.test\//) }),
    ]));
    const stage4 = result.stage_outputs.S4;
    expect(stage4.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringMatching(/^https:\/\/real\.test\//) }),
    ]));
    expect(stage3.claim_registry.entries.length).toBeGreaterThan(0);
    expect(stage3.claim_registry.entries[0].sources_found.length).toBeGreaterThan(0);
    expect(stage3.negative_search_status).toBe('completed');
    expect(stage3.evidence_matrix[0].has_negative_evidence).toBe(true);
    expect(stage3.evidence_matrix[0].negative_evidence).toContain('Evidence fetched from the temporary MCP server.');
    expect(stage3.citations.every((citation: any) => /^https:\/\/real\.test\//.test(citation.url))).toBe(true);
  });

  test('rejects P0 when MCP service is unavailable without fabricated evidence', async () => {
    const result = await new PipelineExecutor(config({
      'unified-fetch': { command: process.execPath + '-missing', args: [server] },
    })).run({ question: 'compare reliable options', task_type: 'analysis' });

    const stage3 = result.stage_outputs.S3;
    expect(stage3.evidence_quality).toBe('Insufficient');
    expect(stage3.evidence_matrix).toHaveLength(0);
    expect(stage3.citation_fabricated).toBe(0);
    expect(stage3.checklist).not.toEqual({
      entity_triple_check: true,
      negative_search: true,
      source_tier_annotated: true,
      cross_validation: true,
      domain_paths_complete: true,
      retry_within_limit: true,
      math_checklist: true,
    });
    expect(result.p0_passed).toBe(false);
  });
});
