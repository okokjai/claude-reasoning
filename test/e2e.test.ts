import { afterAll, beforeAll, describe, test, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PipelineExecutor, createExecutor } from '../src/kernel/executor';
import type { AppConfig } from '../src/kernel/config-loader';

const fixtureSource = String.raw`
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'e2e-fixture', version: '1' } };
  } else if (request.method === 'tools/call') {
    const args = request.params.arguments || {};
    if (request.params.name === 'search') {
      const negative = String(args.query).includes('limitations') || String(args.query).includes('drawbacks');
      result = { content: [{ type: 'text', text: JSON.stringify([
        { url: 'https://e2e.test/' + (negative ? 'limitations' : 'evidence'), title: 'E2E evidence', snippet: 'fixture evidence', source_engine: 'fixture' },
        { url: 'https://e2e.test/independent', title: 'Independent evidence', snippet: 'fixture evidence', source_engine: 'fixture' },
      ]) }] };
    } else if (request.params.name === 'scrape') {
      result = { content: [{ type: 'text', text: JSON.stringify({ url: args.url, title: 'E2E page', content: 'Fixture evidence.', content_ok: true, engine_used: 'fixture' }) }] };
    } else result = { content: [{ type: 'text', text: JSON.stringify({ available: true }) }] };
  } else result = { tools: [] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
`;

const testExecutor = () => createExecutor(fixtureConfig);

let fixtureDirectory: string;
let fixtureConfig: AppConfig;
let executor: PipelineExecutor;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'cr-reasoning-e2e-'));
  const server = join(fixtureDirectory, 'server.cjs');
  await writeFile(server, fixtureSource, 'utf8');
  fixtureConfig = {
    version: '2.0', paradigm: 'auto',
    tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
    router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [
      { condition: 'scale=small', paradigm: 'cot' },
      { condition: 'risk=high AND domain=investment', paradigm: 'dac' },
    ], soft_rules: [] },
    mcp_servers: { 'unified-fetch': { command: process.execPath, args: [server] } },
  };
  executor = createExecutor(fixtureConfig);
});

afterAll(async () => {
  await executor.close();
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe('Pipeline Executor — Skeleton Mode', () => {
  const executor = () => testExecutor();

  test('runs skeleton pipeline with CoT', async () => {
    const result = await testExecutor().run({
      question: 'Best lens brand for high index prescription?',
      scale: 'small',
      domain: 'tech',
      user_specified: 'cot',
    }, 'skeleton');

    expect(result.paradigm).toBe('cot');
    expect(result.p0_passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('runs skeleton pipeline with ToT', async () => {
    const result = await testExecutor().run({
      question: 'Compare cloud providers for startup',
      scale: 'large',
      domain: 'tech',
      user_specified: 'tot',
    }, 'skeleton');

    expect(result.paradigm).toBe('tot');
    expect(result.p0_passed).toBe(true);
  });

  test('runs skeleton pipeline with ReAct', async () => {
    const result = await testExecutor().run({
      question: 'Debug production server crash',
      scale: 'medium',
      domain: 'tech',
      user_specified: 'react',
    }, 'skeleton');

    expect(result.paradigm).toBe('react');
    expect(result.p0_passed).toBe(true);
  });

  test('runs skeleton pipeline with DAC', async () => {
    const result = await testExecutor().run({
      question: 'Investment portfolio allocation 2026',
      scale: 'large',
      domain: 'investment',
      risk: 'high',
      user_specified: 'dac',
    }, 'skeleton');

    expect(result.paradigm).toBe('dac');
    expect(result.p0_passed).toBe(true);
  });

  test('Router auto-selects CoT for small scale', async () => {
    const result = await testExecutor().run({
      question: 'Simple fact lookup',
      scale: 'small',
      domain: 'general',
      risk: 'low',
    }, 'skeleton');

    expect(result.paradigm).toBe('cot');
    expect(result.p0_passed).toBe(true);
  });

  test('Router auto-selects DAC for high risk investment', async () => {
    const result = await testExecutor().run({
      question: 'Should I invest in Bitcoin?',
      scale: 'large',
      domain: 'investment',
      risk: 'high',
    }, 'skeleton');

    expect(result.paradigm).toBe('dac');
    expect(result.p0_passed).toBe(true);
  });

  test('execution graph contains all mandatory stages', async () => {
    const result = await testExecutor().run({ question: 'Test' }, 'skeleton');
    const nodes = result.execution_graph.nodes;
    expect(nodes).toContain('S5.5');
    expect(nodes).toContain('S6');
    expect(nodes).toContain('S0');
  });

  test('execution graph has S5.5 → S6 edge', async () => {
    const result = await testExecutor().run({ question: 'Test' }, 'skeleton');
    const edges = result.execution_graph.edges;
    const s6Edge = edges.find(e => e.to === 'S6');
    expect(s6Edge).toBeDefined();
    expect(s6Edge!.from).toBe('S5.5');
  });
});

describe('Pipeline Executor — Full Mode', () => {
  const fullExecutor = () => createExecutor(fixtureConfig);

  test('full pipeline produces hallucination gate and conclusion gates', async () => {
    const result = await testExecutor().run({
      question: 'Best cloud provider for startup under $500/month',
      scale: 'medium',
      domain: 'tech',
      user_specified: 'cot',
    }, 'full');

    expect(result.hallucination_gate).not.toBeNull();
    expect(result.conclusion_gates).not.toBeNull();
    expect(result.precision_audit).not.toBeNull();
    expect(result.hallucination_gate.pass).toBe(true);
    expect(result.hallucination_gate.failure_route).toBeNull();
    expect(result.conclusion_gates.all_pass).toBe(true);
  });

  test('full pipeline collects stage outputs', async () => {
    const result = await testExecutor().run({
      question: 'Compare React vs Vue',
      scale: 'small',
      domain: 'tech',
      user_specified: 'dac',
    }, 'full');

    expect(result.stage_outputs.A1).toBeDefined();
    expect(result.stage_outputs.A0).toBeDefined();
    expect(result.stage_outputs.A2).toBeDefined();
    expect(result.stage_outputs.C0).toBeDefined();
    expect(result.stage_outputs.S0).toBeDefined();
    expect(result.stage_outputs.S1).toBeDefined();
    expect(result.stage_outputs.S2).toBeDefined();
    expect(result.stage_outputs.S3).toBeDefined();
    expect(result.stage_outputs.S4).toBeDefined();
    expect(result.stage_outputs.S5).toBeDefined();
  });

  test('full ToT and ReAct traversals reach both P0 gates', async () => {
    for (const paradigm of ['tot', 'react']) {
      const result = await testExecutor().run({
        question: `Trace ${paradigm} conditional execution`,
        scale: 'large',
        domain: 'tech',
        user_specified: paradigm,
      }, 'full');

      expect(result.stage_execution).toContain('S5.5');
      expect(result.stage_execution).toContain('S6');
      expect(result.stage_execution.indexOf('S5.5')).toBeLessThan(result.stage_execution.indexOf('S6'));
    }
  });

  test('stage_execution preserves graph traversal order', async () => {
    const result = await testExecutor().run({
      question: 'Traversal order',
      user_specified: 'cot',
    }, 'full');

    expect(result.stage_execution).toEqual(result.stage_execution.filter((stage, index, stages) =>
      index === 0 || stage !== stages[index - 1]));
    expect(result.stage_execution).toContain('S5.5');
    expect(result.stage_execution).toContain('S6');
  });
  test('p0_passed is false when fixture lacks entity triple evidence', async () => {
    const result = await testExecutor().run({
      question: 'Best laptop for programming',
      scale: 'small',
      domain: 'tech',
      user_specified: 'cot',
    }, 'full');

    expect(result.precision_audit.entity_triple_check).toBe(false);
    expect(result.precision_audit.passed).toBe(false);
    expect(result.p0_passed).toBe(false);
  });
});

describe('Config validation', () => {
  test('invalid algorithm is caught in errors array', async () => {
    const executor = createExecutor({
      version: '2.0',
      paradigm: 'nonexistent',
      tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
      router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
      mcp_servers: {},
    });

    const result = await executor.run({ question: 'test' }, 'skeleton');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some(e => e.includes('Unknown algorithm'))).toBe(true);
  });
});