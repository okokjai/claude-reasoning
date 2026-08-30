import { afterAll, beforeAll, describe, test, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExecutor } from '../src/kernel/executor';
import type { AppConfig } from '../src/kernel/config-loader';

// C4 regression guard: A2 contract execution rule 3 requires checking whether
// sequential-thinking is available before filling can_branch. executor.ts used
// to hard-code can_branch: true. These tests pin the availability check.

const fixtureSource = String.raw`
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'a2-fixture', version: '1' } };
  } else if (request.method === 'tools/call') {
    const args = request.params.arguments || {};
    if (request.params.name === 'search') {
      result = { content: [{ type: 'text', text: JSON.stringify([
        { url: 'https://a2.test/evidence', title: 'A2 evidence', snippet: 'fixture', source_engine: 'fixture' },
        { url: 'https://a2.test/independent', title: 'Independent', snippet: 'fixture', source_engine: 'fixture' },
      ]) }] };
    } else if (request.params.name === 'scrape') {
      result = { content: [{ type: 'text', text: JSON.stringify({ url: args.url, title: 'A2 page', content: 'Fixture.', content_ok: true, engine_used: 'fixture' }) }] };
    } else result = { content: [{ type: 'text', text: JSON.stringify({ available: true }) }] };
  } else result = { tools: [] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
`;

const baseRouter = { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] };
const baseTools = { search: 'unified-fetch', scrape: 'unified-fetch' };

let fixtureDirectory: string;
let fixtureServer: string;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'cr-reasoning-a2-'));
  fixtureServer = join(fixtureDirectory, 'server.cjs');
  await writeFile(fixtureServer, fixtureSource, 'utf8');
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

const withConfig = (overrides: Partial<AppConfig>): AppConfig => ({
  version: '2.0',
  paradigm: 'auto',
  tools: { ...baseTools, 'reasoning-logger': 'dsh-log' },
  router: baseRouter,
  mcp_servers: { 'unified-fetch': { command: process.execPath, args: [fixtureServer] } },
  ...overrides,
});

describe('A2 can_branch availability check (C4)', () => {
  test('reasoning-logger=dsh-log → can_branch=false (dsh-log is a linear logger, no branching)', async () => {
    const executor = createExecutor(withConfig({}));
    try {
      const result = await executor.run({ question: 'C4 dsh-log binding', scale: 'small', domain: 'tech' }, 'full');
      expect(result.stage_outputs.A2.can_branch).toBe(false);
    } finally {
      await executor.close();
    }
  });

  test('reasoning-logger=sequential-thinking + mcp_servers configured → can_branch=true', async () => {
    const executor = createExecutor(withConfig({
      tools: { ...baseTools, 'reasoning-logger': 'sequential-thinking' },
      mcp_servers: {
        'unified-fetch': { command: process.execPath, args: [fixtureServer] },
        'sequential-thinking': { command: process.execPath, args: [fixtureServer] },
      },
    }));
    try {
      const result = await executor.run({ question: 'C4 sequential-thinking configured', scale: 'small', domain: 'tech' }, 'full');
      expect(result.stage_outputs.A2.can_branch).toBe(true);
    } finally {
      await executor.close();
    }
  });

  test('reasoning-logger=sequential-thinking but no mcp_servers entry → can_branch=false (bound but not configured)', async () => {
    const executor = createExecutor(withConfig({
      tools: { ...baseTools, 'reasoning-logger': 'sequential-thinking' },
    }));
    try {
      const result = await executor.run({ question: 'C4 sequential-thinking missing config', scale: 'small', domain: 'tech' }, 'full');
      expect(result.stage_outputs.A2.can_branch).toBe(false);
    } finally {
      await executor.close();
    }
  });
});
