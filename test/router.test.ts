import { describe, test, expect } from 'vitest';
import { DefaultRouter } from '../plugins/routers/default';
import { validateConfig } from '../src/kernel/config-loader';

describe('Default Router', () => {
  const router = new DefaultRouter();

  test('user_specified overrides everything', () => {
    const result = router.route({
      scale: 'small',
      domain: 'general',
      risk: 'low',
      user_specified: 'tot',
    });
    expect(result.paradigm).toBe('tot');
    expect(result.confidence).toBe('high');
  });

  test('small scale routes to CoT (cheapest)', () => {
    const result = router.route({
      scale: 'small',
      domain: 'general',
      risk: 'low',
    });
    expect(result.paradigm).toBe('cot');
    expect(result.rationale).toContain('scale=small');
  });

  test('high risk investment routes to DAC (strictest)', () => {
    const result = router.route({
      scale: 'large',
      domain: 'investment',
      risk: 'high',
    });
    expect(result.paradigm).toBe('dac');
    expect(result.rationale).toContain('high risk investment');
  });

  test('budget exhausted downgrades to CoT', () => {
    const result = router.route({
      scale: 'large',
      domain: 'tech',
      risk: 'medium',
      budget_remaining: 5_000,
    });
    expect(result.paradigm).toBe('cot');
    expect(result.rationale).toContain('Budget exhausted');
  });

  test('tool-intensive task favors ReAct via soft rule', () => {
    const result = router.route({
      scale: 'large',
      domain: 'tech',
      risk: 'medium',
      task_type: 'tool-intensive',
      budget_remaining: 100_000,
    });
    // ReAct 有 soft bonus 0.5，應為最高分
    expect(result.paradigm).toBe('react');
  });

  test('exploration task favors ToT via soft rule', () => {
    const result = router.route({
      scale: 'large',
      domain: 'tech',
      risk: 'medium',
      task_type: 'exploration',
      budget_remaining: 100_000,
    });
    expect(result.paradigm).toBe('tot');
  });

  test('cost weight 0.6 favors cheaper algorithms', () => {
    const costRouter = new DefaultRouter({
      weights: { cost: 0.6, quality: 0.2, time: 0.2 },
    });
    const result = costRouter.route({
      scale: 'large',
      domain: 'tech',
      risk: 'low',
      task_type: 'analysis',
      budget_remaining: 100_000,
    });
    // 成本權重高 → CoT 最便宜，應勝出
    expect(result.paradigm).toBe('cot');
  });
});

describe('Config Validation', () => {
  test('validates missing algorithm', () => {
    const errors = validateConfig({
      version: '2.0',
      paradigm: 'nonexistent',
      tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
      router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
      mcp_servers: {},
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('paradigm');
  });

  test('validates missing tool', () => {
    const errors = validateConfig({
      version: '2.0',
      paradigm: 'cot',
      tools: { 'reasoning-logger': 'nonexistent', search: 'unified-fetch', scrape: 'unified-fetch' },
      router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
      mcp_servers: {},
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('tools.reasoning-logger');
  });

  test('validates weights sum to 1.0', () => {
    const errors = validateConfig({
      version: '2.0',
      paradigm: 'cot',
      tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
      router: { weights: { cost: 1.0, quality: 1.0, time: 1.0 }, hard_rules: [], soft_rules: [] },
      mcp_servers: {},
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === 'router.weights')).toBe(true);
  });

  test('valid config passes', () => {
    const errors = validateConfig({
      version: '2.0',
      paradigm: 'auto',
      tools: { 'reasoning-logger': 'dsh-log', search: 'unified-fetch', scrape: 'unified-fetch' },
      router: { weights: { cost: 0.4, quality: 0.3, time: 0.3 }, hard_rules: [], soft_rules: [] },
      mcp_servers: {},
    });
    expect(errors).toHaveLength(0);
  });
});