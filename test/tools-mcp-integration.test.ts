import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../src/kernel/config-loader';
import { createToolRegistry } from '../plugins/tools';

const serverSource = String.raw`
const readline = require('node:readline');
const label = process.env.FAKE_MCP_LABEL || 'default';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: label, version: '1.0' } };
  } else if (request.method === 'tools/call') {
    result = { label, tool: request.params.name, arguments: request.params.arguments || {} };
  } else {
    result = { tools: [] };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
`;

const baseConfig = (server: AppConfig['mcp_servers']): AppConfig => ({
  version: '2.0',
  paradigm: 'auto',
  tools: { 'reasoning-logger': 'sequential-thinking', search: 'unified-fetch', scrape: 'unified-fetch' },
  router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
  mcp_servers: server,
});

let directory: string;
let server: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tools-mcp-integration-'));
  server = join(directory, 'fake-server.cjs');
  await writeFile(server, serverSource, 'utf8');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('configured MCP tool registry', () => {
  test('configured server definitions create clients and return MCP capability results', async () => {
    const registry = createToolRegistry(baseConfig({
      'unified-fetch': { command: process.execPath, args: [server], env: { FAKE_MCP_LABEL: 'configured' } },
      'sequential-thinking': { command: process.execPath, args: [server], env: { FAKE_MCP_LABEL: 'configured' } },
    }));

    await expect(registry.getTool('unified-fetch')!.call('search', { query: 'hello', maxResults: 2 }))
      .resolves.toEqual({ label: 'configured', tool: 'search', arguments: { query: 'hello', max_results: 2 } });
    await expect(registry.getTool('sequential-thinking')!.call('record', { thought: 'hello' }))
      .resolves.toEqual({ label: 'configured', tool: 'sequentialthinking', arguments: { thought: 'hello' } });
    await registry.close();
  });

  test('config hot-swap creates a new binding rather than reusing stale clients', async () => {
    const first = createToolRegistry(baseConfig({
      'unified-fetch': { command: process.execPath, args: [server], env: { FAKE_MCP_LABEL: 'first' } },
    }));
    await expect(first.getTool('unified-fetch')!.call('search', { query: 'one' }))
      .resolves.toMatchObject({ label: 'first' });
    await first.close();

    const second = createToolRegistry(baseConfig({
      'unified-fetch': { command: process.execPath, args: [server], env: { FAKE_MCP_LABEL: 'second' } },
    }));
    await expect(second.getTool('unified-fetch')!.call('search', { query: 'two' }))
      .resolves.toMatchObject({ label: 'second' });
    await second.close();
  });

  test('no configured server preserves local fallback behavior', async () => {
    const registry = createToolRegistry(baseConfig({}));
    await expect(registry.getTool('unified-fetch')!.call('search', { query: 'fallback' }))
      .resolves.toEqual(expect.arrayContaining([expect.objectContaining({ source_engine: 'unified-fetch' })]));
    await expect(registry.getTool('sequential-thinking')!.call('record', { thought: 'fallback' }))
      .resolves.toMatchObject({ tool: 'sequential-thinking' });
    await registry.close();
  });
});
