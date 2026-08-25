// ============================================================
// Default Router — 智能路由
// 成本權重驅動的演算法選擇器。
// 「經濟 > 演算法」= weights.cost 調高
// ============================================================
import {
  RouterPlugin,
  RouterContext,
  RouteDecision,
  AlgorithmPlugin,
} from '../../src/kernel/types';
import { getAlgorithm } from '../algorithms';

export interface RouterConfig {
  weights: {
    cost: number;      // 成本權重（0-1）
    quality: number;   // 質量權重（0-1）
    time: number;      // 時間權重（0-1）
  };
  hard_rules: HardRule[];
  soft_rules: SoftRule[];
}

interface HardRule {
  condition: string;   // 'scale=small' | 'risk=high AND domain=investment' | etc.
  paradigm: string;
}

interface SoftRule {
  task: string;        // 'tool-intensive' | 'exploration' | 'decision' | 'diagnosis' | 'analysis'
  paradigm: string;
}

export class DefaultRouter implements RouterPlugin {
  id = 'default';

  private config: RouterConfig = {
    weights: { cost: 0.4, quality: 0.3, time: 0.3 },
    hard_rules: [
      { condition: 'scale=small', paradigm: 'cot' },
      { condition: 'risk=high AND domain=investment', paradigm: 'dac' },
      { condition: 'user_specified', paradigm: 'user_specified' },
    ],
    soft_rules: [
      { task: 'tool-intensive', paradigm: 'react' },
      { task: 'exploration', paradigm: 'tot' },
      { task: 'decision', paradigm: 'dac' },
      { task: 'diagnosis', paradigm: 'dac' },
      { task: 'analysis', paradigm: 'cot' },
    ],
  };

  constructor(config?: Partial<RouterConfig>) {
    if (config) {
      this.config = { ...this.config, ...config, weights: { ...this.config.weights, ...config.weights } };
    }
  }

  route(context: RouterContext): RouteDecision {
    // 1. 使用者指定 → 優先
    if (context.user_specified) {
      return {
        paradigm: context.user_specified,
        tools: { 'reasoning-logger': 'sequential-thinking', search: 'unified-fetch', scrape: 'unified-fetch' },
        confidence: 'high',
        rationale: `User specified: ${context.user_specified}`,
      };
    }

    // 2. Hard rules（不可覆蓋）
    for (const rule of this.config.hard_rules) {
      if (rule.condition === 'scale=small' && context.scale === 'small') {
        return {
          paradigm: rule.paradigm,
          tools: this.defaultTools(),
          confidence: 'high',
          rationale: `Hard rule: scale=small → ${rule.paradigm} (cheapest)`,
        };
      }
      if (rule.condition === 'risk=high AND domain=investment' && context.risk === 'high' && context.domain === 'investment') {
        return {
          paradigm: rule.paradigm,
          tools: this.defaultTools(),
          confidence: 'high',
          rationale: `Hard rule: high risk investment → ${rule.paradigm} (strictest quality)`,
        };
      }
    }

    // 3. Budget check：預算不足時自動降級
    if (context.budget_remaining !== undefined && context.budget_remaining < 10_000) {
      return {
        paradigm: 'cot',
        tools: this.defaultTools(),
        confidence: 'medium',
        rationale: `Budget exhausted (${context.budget_remaining}), downgraded to CoT`,
      };
    }

    // 4. Soft rules + 加權計算
    const scores = this.scoreAlgorithms(context);
    const best = scores.sort((a, b) => b.score - a.score)[0];

    return {
      paradigm: best.paradigm,
      tools: this.defaultTools(),
      confidence: 'medium',
      rationale: `Weighted score: ${scores.map(s => `${s.paradigm}=${s.score.toFixed(2)}`).join(', ')}`,
    };
  }

  private scoreAlgorithms(context: RouterContext): { paradigm: string; score: number }[] {
    const algos = ['cot', 'tot', 'react', 'dac'];
    const { weights } = this.config;

    // 軟規則匹配：找 task 對應的 paradigm
    const softMatch = this.config.soft_rules.find(r => r.task === context.task_type);

    return algos.map(id => {
      const algo = getAlgorithm(id) as AlgorithmPlugin;
      if (!algo) return { paradigm: id, score: 0 };

      // 正規化成本：越低越好
      const costScore = algo.cost_model.time_multiplier <= 1.2 ? 1.0
        : algo.cost_model.time_multiplier <= 2.0 ? 0.6
        : 0.3;

      // 質量分數：越高越好
      const qualityScore = algo.cost_model.quality_multiplier >= 1.8 ? 1.0
        : algo.cost_model.quality_multiplier >= 1.3 ? 0.6
        : 0.3;

      // 時間分數：越快越好
      const timeScore = algo.cost_model.time_multiplier <= 1.2 ? 1.0
        : algo.cost_model.time_multiplier <= 2.0 ? 0.6
        : 0.3;

      // 軟規則加分
      const softBonus = softMatch && softMatch.paradigm === id ? 0.5 : 0;

      const score = costScore * weights.cost + qualityScore * weights.quality + timeScore * weights.time + softBonus;

      return { paradigm: id, score };
    });
  }

  private defaultTools() {
    return {
      'reasoning-logger': 'sequential-thinking',
      search: 'unified-fetch',
      scrape: 'unified-fetch',
    };
  }
}

export default DefaultRouter;