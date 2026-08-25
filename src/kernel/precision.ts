// ============================================================
// Precision — Stage 3 P0 子規則 checklist + 扣分邏輯
// 所有 v1.2.0 stage-3.md 的 P0 子規則都在這裡強制檢查。
// ============================================================
import { Stage3Checklist, ClaimRegistry, SourceTier } from './types';

export interface PrecisionAudit {
  entity_triple_check: boolean;
  negative_search: boolean;
  source_tier_annotated: boolean;
  cross_validation: boolean;
  domain_paths_complete: boolean;
  retry_within_limit: boolean;
  math_checklist: boolean;
  passed: boolean;
  issues: PrecisionIssue[];
  score: number;
}

export interface PrecisionIssue {
  rule: keyof Stage3Checklist;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  deduction: number;
}

// 扣分規則（同 v1.2.0）
const DEDUCTIONS: Record<string, number> = {
  missing_domain_path: -5,
  missing_negative_search: -3,
  t3_not_annotated: -2,
  data_gap_not_listed: -2,
  single_source_marked_verified: -5,
};

/**
 * 執行 Stage 3 P0 子規則檢查
 */
export function runPrecisionAudit(
  checklist: Partial<Stage3Checklist>,
  claimRegistry?: ClaimRegistry,
): PrecisionAudit {
  const issues: PrecisionIssue[] = [];
  let score = 0;

  // 1. 實體三查（地圖+工商+評論）
  if (!checklist.entity_triple_check) {
    issues.push({
      rule: 'entity_triple_check',
      severity: 'critical',
      description: 'Entity triple check not completed (map + business registry + reviews)',
      deduction: DEDUCTIONS.missing_domain_path,
    });
  }

  // 2. 負面搜尋（逢正必反）
  if (!checklist.negative_search) {
    issues.push({
      rule: 'negative_search',
      severity: 'major',
      description: 'Negative search not performed (falsification search required for every positive claim)',
      deduction: DEDUCTIONS.missing_negative_search,
    });
  }

  // 3. T1-T5 來源標註
  if (!checklist.source_tier_annotated) {
    issues.push({
      rule: 'source_tier_annotated',
      severity: 'major',
      description: 'Source tiers not annotated (T1-T5 required for every evidence piece)',
      deduction: DEDUCTIONS.t3_not_annotated,
    });
  }

  // 4. 跨來源驗證
  if (!checklist.cross_validation) {
    issues.push({
      rule: 'cross_validation',
      severity: 'major',
      description: 'Cross-validation not performed (≥2 independent sources required)',
      deduction: DEDUCTIONS.missing_domain_path,
    });
  }

  // 5. Domain-aware 搜尋路徑
  if (!checklist.domain_paths_complete) {
    issues.push({
      rule: 'domain_paths_complete',
      severity: 'critical',
      description: 'Domain-aware search paths not complete (all 4 paths must be run)',
      deduction: DEDUCTIONS.missing_domain_path,
    });
  }

  // 6. 重試上限
  if (!checklist.retry_within_limit) {
    issues.push({
      rule: 'retry_within_limit',
      severity: 'minor',
      description: 'Retry limit exceeded (max 2 retries per hypothesis)',
      deduction: 0,
    });
  }

  // 7. 數學 checklist
  if (!checklist.math_checklist) {
    issues.push({
      rule: 'math_checklist',
      severity: 'minor',
      description: 'Mathematical derivation checklist incomplete',
      deduction: 0,
    });
  }

  // 8. Claim Registry 檢查（如有提供）
  if (claimRegistry) {
    for (const entry of claimRegistry.entries) {
      if (entry.type === 'A' && entry.verification_status === 'passed') {
        // 檢查 Type A 是否有足夠來源
        if (entry.sources_found.length < 1) {
          issues.push({
            rule: 'entity_triple_check',
            severity: 'critical',
            description: `Type A claim "${entry.claim.slice(0, 50)}" marked passed but has no sources`,
            deduction: DEDUCTIONS.single_source_marked_verified,
          });
        }
      }
    }
  }

  // 計算分數（從 100 開始扣）
  score = 100;
  for (const issue of issues) {
    score += issue.deduction;
  }
  score = Math.max(0, score);

  // P0 critical rules — 任一失敗 = 直接 fail（不只看分數）
  // 對齊 v1.2.0：實體三查 / domain 路徑 / 負面搜尋 / 跨來源 是 P0 gate
  const criticalRules: (keyof Stage3Checklist)[] = [
    'entity_triple_check',
    'domain_paths_complete',
    'negative_search',
    'cross_validation',
  ];
  const criticalPassed = criticalRules.every(r => checklist[r] === true);
  const passed = criticalPassed && score >= 70;

  return {
    entity_triple_check: checklist.entity_triple_check ?? false,
    negative_search: checklist.negative_search ?? false,
    source_tier_annotated: checklist.source_tier_annotated ?? false,
    cross_validation: checklist.cross_validation ?? false,
    domain_paths_complete: checklist.domain_paths_complete ?? false,
    retry_within_limit: checklist.retry_within_limit ?? false,
    math_checklist: checklist.math_checklist ?? false,
    passed,
    issues,
    score,
  };
}

/**
 * 來源層級評估（T1-T5）
 */
export function assessSourceTier(url: string): SourceTier {
  if (url.includes('google.com/maps') || url.includes('openstreetmap') || url.includes('opencorporates') || url.includes('crunchbase')) {
    return 'T1';
  }
  if (url.includes('yelp') || url.includes('tripadvisor') || url.includes('reddit') || url.includes('trustpilot')) {
    return 'T2';
  }
  if (url.includes('amazon') || url.includes('youtube') || url.includes('instagram')) {
    return 'T3';
  }
  if (url.includes('quora') || url.includes('facebook') || url.includes('forum')) {
    return 'T4';
  }
  return 'T5';
}

/**
 * 行銷內容偵測
 */
export function detectMarketingContent(text: string): {
  is_marketing: boolean;
  indicators: string[];
} {
  const indicators: string[] = [];
  const marketingKeywords = [
    'game changer', 'best-in-class', 'unbeatable', 'the GOAT',
    'revolutionary', 'number one', 'world\'s thinnest', 'world\'s lightest',
  ];

  for (const kw of marketingKeywords) {
    if (text.toLowerCase().includes(kw)) {
      indicators.push(`Exaggerated adjective: "${kw}"`);
    }
  }

  // 超過 3 個特徵 = 行銷內容
  return {
    is_marketing: indicators.length >= 3,
    indicators,
  };
}