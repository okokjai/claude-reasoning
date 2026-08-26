// ============================================================
// Config Loader — 讀取 config.yaml，驗證 schema
// ============================================================
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { getAlgorithm } from '../../plugins/algorithms';
import { getTool } from '../../plugins/tools';

export interface AppConfig {
  version: string;
  paradigm: string;
  tools: {
    'reasoning-logger': string;
    search: string;
    scrape: string;
  };
  router: {
    weights: { cost: number; quality: number; time: number };
    hard_rules: { condition: string; paradigm: string }[];
    soft_rules: { task: string; paradigm: string }[];
  };
  budget?: {
    max_tokens: number;
    downgrade_to: string;
  };
  mcp_servers: Record<string, {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeout?: number;
  }>;
}

const DEFAULT_CONFIG: AppConfig = {
  version: '2.0',
  paradigm: 'auto',
  tools: {
    'reasoning-logger': 'sequential-thinking',
    search: 'unified-fetch',
    scrape: 'unified-fetch',
  },
  router: {
    weights: { cost: 0.4, quality: 0.3, time: 0.3 },
    hard_rules: [
      { condition: 'scale=small', paradigm: 'cot' },
      { condition: 'risk=high AND domain=investment', paradigm: 'dac' },
    ],
    soft_rules: [
      { task: 'tool-intensive', paradigm: 'react' },
      { task: 'exploration', paradigm: 'tot' },
      { task: 'decision', paradigm: 'dac' },
    ],
  },
  mcp_servers: {},
};

export interface ValidationError {
  field: string;
  message: string;
}

export function loadConfig(path?: string): AppConfig {
  // 使用預設 config（如果沒有 yaml 檔案）
  if (!path) return { ...DEFAULT_CONFIG };

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = yaml.load(raw) as any;
    if (!parsed) return { ...DEFAULT_CONFIG };

    // 合併預設值
    const config: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      tools: { ...DEFAULT_CONFIG.tools, ...(parsed.tools || {}) },
      router: {
        ...DEFAULT_CONFIG.router,
        ...(parsed.router || {}),
        weights: { ...DEFAULT_CONFIG.router.weights, ...(parsed.router?.weights || {}) },
      },
    };

    return config;
  } catch (e) {
    // 無法讀取時回退預設
    return { ...DEFAULT_CONFIG };
  }
}

export function validateConfig(config: AppConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // 驗證 version
  if (config.version !== '2.0') {
    errors.push({ field: 'version', message: `Expected 2.0, got ${config.version}` });
  }

  // 驗證 paradigm
  if (config.paradigm !== 'auto' && !getAlgorithm(config.paradigm)) {
    errors.push({ field: 'paradigm', message: `Unknown algorithm: ${config.paradigm}` });
  }

  // 驗證 tools
  for (const [capability, toolId] of Object.entries(config.tools)) {
    const tool = getTool(toolId);
    if (!tool) {
      errors.push({ field: `tools.${capability}`, message: `Unknown tool: ${toolId}` });
    } else if (!tool.capabilities.includes(capability)) {
      errors.push({ field: `tools.${capability}`, message: `Tool ${toolId} does not support capability ${capability}` });
    }
  }

  // 驗證 weights
  const { weights } = config.router;
  const total = weights.cost + weights.quality + weights.time;
  if (Math.abs(total - 1.0) > 0.01) {
    errors.push({ field: 'router.weights', message: `Weights must sum to 1.0, got ${total}` });
  }

  return errors;
}