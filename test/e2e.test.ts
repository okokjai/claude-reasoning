import { describe, test, expect } from 'vitest';
import { PipelineExecutor, createExecutor } from '../src/kernel/executor';

describe('Pipeline Executor — Skeleton Mode', () => {
  const executor = createExecutor();

  test('runs skeleton pipeline with CoT', async () => {
    const result = await executor.run({
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
    const result = await executor.run({
      question: 'Compare cloud providers for startup',
      scale: 'large',
      domain: 'tech',
      user_specified: 'tot',
    }, 'skeleton');

    expect(result.paradigm).toBe('tot');
    expect(result.p0_passed).toBe(true);
  });

  test('runs skeleton pipeline with ReAct', async () => {
    const result = await executor.run({
      question: 'Debug production server crash',
      scale: 'medium',
      domain: 'tech',
      user_specified: 'react',
    }, 'skeleton');

    expect(result.paradigm).toBe('react');
    expect(result.p0_passed).toBe(true);
  });

  test('runs skeleton pipeline with DAC', async () => {
    const result = await executor.run({
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
    const result = await executor.run({
      question: 'Simple fact lookup',
      scale: 'small',
      domain: 'general',
      risk: 'low',
    }, 'skeleton');

    expect(result.paradigm).toBe('cot');
    expect(result.p0_passed).toBe(true);
  });

  test('Router auto-selects DAC for high risk investment', async () => {
    const result = await executor.run({
      question: 'Should I invest in Bitcoin?',
      scale: 'large',
      domain: 'investment',
      risk: 'high',
    }, 'skeleton');

    expect(result.paradigm).toBe('dac');
    expect(result.p0_passed).toBe(true);
  });

  test('execution graph contains all mandatory stages', async () => {
    const result = await executor.run({ question: 'Test' }, 'skeleton');
    const nodes = result.execution_graph.nodes;
    expect(nodes).toContain('S5.5');
    expect(nodes).toContain('S6');
    expect(nodes).toContain('S0');
  });

  test('execution graph has S5.5 → S6 edge', async () => {
    const result = await executor.run({ question: 'Test' }, 'skeleton');
    const edges = result.execution_graph.edges;
    const s6Edge = edges.find(e => e.to === 'S6');
    expect(s6Edge).toBeDefined();
    expect(s6Edge!.from).toBe('S5.5');
  });
});

describe('Pipeline Executor — Full Mode', () => {
  const executor = createExecutor();

  test('full pipeline produces hallucination gate and conclusion gates', async () => {
    const result = await executor.run({
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
    const result = await executor.run({
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

  test('p0_passed is true when all gates pass', async () => {
    const result = await executor.run({
      question: 'Best laptop for programming',
      scale: 'small',
      domain: 'tech',
      user_specified: 'cot',
    }, 'full');

    expect(result.p0_passed).toBe(true);
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