import { describe, expect, test } from 'vitest';
import {
  executeGraph,
  verifyP0Reachability,
  type GraphStageHandler,
} from '../src/kernel/executor';
import type { ExecutionGraph, StageName } from '../src/kernel/types';

const graph = (overrides: Partial<ExecutionGraph>): ExecutionGraph => ({
  nodes: ['A1', 'A0', 'S5.5', 'S6'],
  edges: [
    { from: 'A1', to: 'A0' },
    { from: 'A0', to: 'S5.5' },
    { from: 'S5.5', to: 'S6' },
  ],
  description: 'test graph',
  ...overrides,
});

const handlers = (order: string[], values: Record<string, any> = {}): Record<string, GraphStageHandler> =>
  Object.fromEntries(['A1', 'A0', 'A2', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6', 'C0', 'C1', 'C2', 'QUALITY']
    .map(name => [name, async () => { order.push(name); return values[name]; }]));

describe('graph-driven execution', () => {
  test('follows declared edge order instead of node order', async () => {
    const order: string[] = [];
    await executeGraph(graph({
      nodes: ['A1', 'A0', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'S5.5' },
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S5.5' },
        { from: 'S5.5', to: 'S6' },
      ],
    }), handlers(order));
    expect(order).toEqual(['A1', 'S5.5', 'A0', 'S6']);
  });

  test('evaluates conditional edges from stage state', async () => {
    const order: string[] = [];
    await executeGraph(graph({
      nodes: ['A1', 'A0', 'S1', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S1', condition: 'take_alternate' },
        { from: 'A0', to: 'S5.5' },
        { from: 'S1', to: 'S5.5' },
        { from: 'S5.5', to: 'S6' },
      ],
    }), handlers(order, { A0: { take_alternate: true } }));
    expect(order).toEqual(['A1', 'A0', 'S1', 'S5.5', 'S6']);
  });

  test('evaluates equality conditions with one or two equals signs', async () => {
    const order: string[] = [];
    await executeGraph(graph({
      nodes: ['A1', 'A0', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S5.5', condition: 'route === true' },
        { from: 'A0', to: 'S5.5', condition: 'route = true' },
        { from: 'S5.5', to: 'S6' },
      ],
    }), handlers(order, { A0: { route: true } }));
    expect(order).toEqual(['A1', 'A0', 'S5.5', 'S6']);
  });

  test('returns the actual traversal in execution', async () => {
    const order: string[] = [];
    const result = await executeGraph(graph({}), handlers(order));
    expect(result.execution).toEqual(order);
  });

  test('executes parallel groups and records deterministic group order', async () => {
    const order: string[] = [];
    await executeGraph(graph({
      nodes: ['A1', 'A0', 'S1', 'S2', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S1' },
        { from: 'S1', to: 'S2' },
        { from: 'S1', to: 'S5.5' },
        { from: 'S2', to: 'S5.5' },
        { from: 'S5.5', to: 'S6' },
      ],
      parallel_groups: [['S2', 'S5.5']],
    }), handlers(order));
    expect(order).toEqual(['A1', 'A0', 'S1', 'S2', 'S5.5', 'S6']);
  });

  test('bounds loop iterations', async () => {
    const order: string[] = [];
    const result = await executeGraph(graph({
      nodes: ['A1', 'A0', 'S1', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S1' },
        { from: 'S1', to: 'S1', condition: 'retry' },
        { from: 'S1', to: 'S5.5' },
        { from: 'S5.5', to: 'S6' },
      ],
      loops: [{ from: 'S1', to: 'S1', condition: 'retry', max: 2 }],
    }), handlers(order, { S1: { retry: true } }));
    expect(order.filter(stage => stage === 'S1')).toHaveLength(3);
    expect(result.loop_counts['S1->S1']).toBe(2);
  });

  test('reruns downstream stages when a loop returns to an already completed stage', async () => {
    const order: string[] = [];
    let retries = 0;
    const result = await executeGraph(graph({
      nodes: ['A1', 'A0', 'S1', 'S2', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S1' },
        { from: 'S1', to: 'S2' },
        { from: 'S2', to: 'S1', condition: 'retry' },
        { from: 'S2', to: 'S5.5', condition: 'done' },
        { from: 'S5.5', to: 'S6' },
      ],
      loops: [{ from: 'S2', to: 'S1', condition: 'retry', max: 1 }],
    }), {
      ...handlers(order),
      S1: async () => { order.push('S1'); return { retry: retries++ === 0 }; },
      S2: async () => { order.push('S2'); return { done: retries > 1, retry: retries === 1 }; },
    });
    expect(order).toEqual(['A1', 'A0', 'S1', 'S2', 'S1', 'S2', 'S5.5', 'S6']);
    expect(result.loop_counts['S2->S1']).toBe(1);
  });

  test('expands an edge into its bounded branch count', async () => {
    const order: string[] = [];
    await executeGraph(graph({
      nodes: ['A1', 'A0', 'S1', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' },
        { from: 'A0', to: 'S1', expand: { mode: 'multi-path', count: 3, parallel: true } },
        { from: 'S1', to: 'S5.5' },
        { from: 'S5.5', to: 'S6' },
      ],
    }), handlers(order));
    expect(order.filter(stage => stage === 'S1')).toHaveLength(3);
    expect(order).toEqual(['A1', 'A0', 'S1', 'S1', 'S1', 'S5.5', 'S6']);
  });

  test('rejects graphs that cannot reach mandatory P0 gates', () => {
    const check = verifyP0Reachability(graph({
      nodes: ['A1', 'A0', 'S5.5', 'S6'],
      edges: [{ from: 'A1', to: 'A0' }],
    }));
    expect(check.ok).toBe(false);
    expect(check.error).toContain('S5.5');
  });

  test('reports missing handlers instead of silently skipping reachable stages', async () => {
    await expect(executeGraph(graph({}), { A1: async () => ({}) })).rejects.toThrow(/missing handler.*A0/i);
  });

  test('rejects when conditional P0 path stops before S5.5', async () => {
    await expect(executeGraph(graph({
      nodes: ['A1', 'A0', 'S2', 'S3', 'S4', 'S5', 'S5.5', 'S6'],
      edges: [
        { from: 'A1', to: 'A0' }, { from: 'A0', to: 'S2' },
        { from: 'S2', to: 'S3', condition: 'action-needed' },
        { from: 'S3', to: 'S4', condition: 'evidence-sufficient' },
        { from: 'S4', to: 'S5' }, { from: 'S5', to: 'S5.5' },
        { from: 'S5.5', to: 'S6', condition: 'hallucination_pass' },
      ],
    }), handlers([]))).rejects.toThrow(/P0 gate S5\.5 was not executed/i);
  });
});
