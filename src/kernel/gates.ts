// ============================================================
// P0 Gates — S5.5 三檢 + S6 四閘門
// 不可繞過、不可 plugin。kernel 內建，所有推理範式必須通過。
// ============================================================
import { StageName, C2_ROUTES, FailureClass, ClaimRegistry, SourceTier } from './types';

// ============================================================
// S5.5 三檢：Anti-Hallucination Gate
// ============================================================

// --- 檢查 1: 實體存在檢查 ---
export interface EntityCheckInput {
  entities: string[];               // 結論中所有具體實體
  has_map_lookup: boolean;          // 是否已查地圖
  has_business_registry: boolean;   // 是否已查工商登記
  has_review_platform: boolean;     // 是否已查評論平台
  recommended_entities: string[];   // 推薦給使用者的實體
  sourced_count: number;
  unsourced_count: number;
}

export interface EntityCheckResult {
  pass: boolean;
  entity_count: number;
  sourced_count: number;
  unsourced_count: number;
  hallucinated_entities: { name: string; reason: string }[];
  recommended_verified: number;
  recommended_total: number;
}

export function entityExistenceCheck(input: EntityCheckInput): EntityCheckResult {
  const hallucinated_entities: { name: string; reason: string }[] = [];

  // 規則：實體必須至少有一個獨立來源
  if (input.unsourced_count > 0) {
    for (const entity of input.entities) {
      // 無法追蹤來源的實體 → 標記為幻覺
      hallucinated_entities.push({ name: entity, reason: 'No source found' });
    }
  }

  // 規則：推薦的實體必須通過三查
  const recommended_verified = input.recommended_entities.filter(e => {
    return input.has_map_lookup && input.has_business_registry && input.has_review_platform;
  }).length;

  const pass =
    hallucinated_entities.length === 0 &&
    recommended_verified === input.recommended_entities.length;

  return {
    pass,
    entity_count: input.entities.length,
    sourced_count: input.sourced_count,
    unsourced_count: input.unsourced_count,
    hallucinated_entities,
    recommended_verified,
    recommended_total: input.recommended_entities.length,
  };
}

// --- 檢查 2: 來源驗證 ---
export interface SourceCheckInput {
  citations: { claim: string; url: string; tier: SourceTier }[];
  citation_real: number;
  citation_fabricated: number;
  citation_misused: number;
  source_tier_issues: number;
}

export interface SourceCheckResult {
  pass: boolean;
  citation_count: number;
  citation_real: number;
  citation_fabricated: number;
  citation_misused: number;
  source_tier_issues: number;
  pass_details: string[];
}

export function sourceVerificationCheck(input: SourceCheckInput): SourceCheckResult {
  const pass_details: string[] = [];

  // 零容忍：引用幻覺
  if (input.citation_fabricated > 0) {
    pass_details.push(`FAIL: ${input.citation_fabricated} fabricated citations (zero tolerance)`);
  }

  // 零容忍：來源誤用
  if (input.citation_misused > 0) {
    pass_details.push(`FAIL: ${input.citation_misused} misused citations (zero tolerance)`);
  }

  // 來源層級問題
  if (input.source_tier_issues > 0) {
    pass_details.push(`WARN: ${input.source_tier_issues} source tier issues (must be annotated)`);
  }

  const pass = input.citation_fabricated === 0 && input.citation_misused === 0;

  return {
    pass,
    citation_count: input.citations.length,
    citation_real: input.citation_real,
    citation_fabricated: input.citation_fabricated,
    citation_misused: input.citation_misused,
    source_tier_issues: input.source_tier_issues,
    pass_details,
  };
}

// --- 檢查 3: 交叉參照 ---
export interface CrossRefCheckInput {
  single_source_claims: number;
  conflicting_claims: number;
  concealed_conflicts: number;
  isolated_judgments: number;
}

export interface CrossRefCheckResult {
  pass: boolean;
  single_source_claims: number;
  conflicting_claims: number;
  concealed_conflicts: number;
  isolated_judgments: number;
  pass_details: string[];
}

export function crossReferenceCheck(input: CrossRefCheckInput): CrossRefCheckResult {
  const pass_details: string[] = [];

  // 零容忍：隱藏矛盾
  if (input.concealed_conflicts > 0) {
    pass_details.push(`FAIL: ${input.concealed_conflicts} concealed contradictions (zero tolerance)`);
  }

  // 單一來源依賴可通過但需標註
  if (input.single_source_claims > 0) {
    pass_details.push(`NOTE: ${input.single_source_claims} single-source claims (must be annotated)`);
  }

  const pass = input.concealed_conflicts === 0;

  return {
    pass,
    single_source_claims: input.single_source_claims,
    conflicting_claims: input.conflicting_claims,
    concealed_conflicts: input.concealed_conflicts,
    isolated_judgments: input.isolated_judgments,
    pass_details,
  };
}

// --- 整合閘門 ---
export interface HallucinationGateInput {
  entity: EntityCheckInput;
  source: SourceCheckInput;
  cross_ref: CrossRefCheckInput;
}

export interface HallucinationGateResult {
  pass: boolean;
  failure_route: 'stage-3' | 'stage-5' | null;
  entity_check: EntityCheckResult;
  source_check: SourceCheckResult;
  cross_ref_check: CrossRefCheckResult;
  details: string[];
}

export function antiHallucinationGate(input: HallucinationGateInput): HallucinationGateResult {
  const entity_result = entityExistenceCheck(input.entity);
  const source_result = sourceVerificationCheck(input.source);
  const cross_ref_result = crossReferenceCheck(input.cross_ref);

  const pass = entity_result.pass && source_result.pass && cross_ref_result.pass;

  // 決定 failure route
  let failure_route: 'stage-3' | 'stage-5' | null = null;
  if (!pass) {
    // 實體/來源/證據缺失 → Stage 3
    if (!entity_result.pass || !source_result.pass || !cross_ref_result.pass) {
      failure_route = 'stage-3';
    }
    // 結論措辭/精確度/標註問題 → Stage 5
    if (entity_result.pass && source_result.pass && !cross_ref_result.pass) {
      failure_route = 'stage-5';
    }
  }

  const details = [
    ...entity_result.hallucinated_entities.map(e => `Entity: ${e.name} (${e.reason})`),
    ...source_result.pass_details,
    ...cross_ref_result.pass_details,
  ];

  return {
    pass,
    failure_route,
    entity_check: entity_result,
    source_check: source_result,
    cross_ref_check: cross_ref_result,
    details,
  };
}

// ============================================================
// S6 四閘門：Conclusion Gates
// ============================================================

export interface ConclusionGateInput {
  evidence_quality: 'Sufficient' | 'Insufficient' | 'Contradictory';
  hallucination_pass: boolean;
  platform_mode: 'CLI-Full' | 'Desktop';
  evidence_score: number;          // 證據分數 1-5
  confidence: string;              // 原始信心度
}

export interface ConclusionGateResult {
  gate_1_pass: boolean;            // 證據充分性 ≥3
  gate_2_pass: boolean;            // 幻覺檢測通過
  gate_3_pass: boolean;            // 輸出合規
  gate_4_pass: boolean;            // 信心在上限內
  all_pass: boolean;
  confidence_capped: string;
  details: string[];
}

export function conclusionGates(input: ConclusionGateInput): ConclusionGateResult {
  const details: string[] = [];

  // Gate 1: 證據充分性
  const gate_1_pass = input.evidence_quality !== 'Insufficient' && input.evidence_score >= 3;
  if (!gate_1_pass) details.push('GATE 1 FAIL: Evidence insufficient');

  // Gate 2: 幻覺檢測
  const gate_2_pass = input.hallucination_pass;
  if (!gate_2_pass) details.push('GATE 2 FAIL: Hallucination detected');

  // Gate 3: 輸出合規
  let gate_3_pass = true;
  if (input.platform_mode === 'Desktop') {
    // Desktop Mode 禁止具體名稱/價格/地址
    gate_3_pass = false; // 需要外部檢查，這裡只做 flag
    details.push('GATE 3: Desktop Mode — requires external entity check');
  }

  // Gate 4: 信心上限
  // 證據分數 ≤3 → 信心上限 medium
  const confidence_capped = input.evidence_score <= 3 ? 'medium' : input.confidence;
  const gate_4_pass = true; // 信心 cap 是調整不是擋

  return {
    gate_1_pass,
    gate_2_pass,
    gate_3_pass,
    gate_4_pass,
    all_pass: gate_1_pass && gate_2_pass && gate_3_pass,
    confidence_capped,
    details,
  };
}

// ============================================================
// C2 路由解析
// ============================================================

export interface RouteRequest {
  failure_class: FailureClass;
  revision_count: number;
  stage_0_revision_count: number;
}

export interface RouteResult {
  target: StageName;
  allowed: boolean;
  blocked_reason?: string;
}

export function resolveRoute(request: RouteRequest): RouteResult {
  const rule = C2_ROUTES[request.failure_class];

  if (!rule) {
    return { target: 'S6', allowed: false, blocked_reason: `Unknown failure class: ${request.failure_class}` };
  }

  // 檢查 bound
  if (request.failure_class === 'framing_defect') {
    if (request.stage_0_revision_count >= rule.bound) {
      return {
        target: rule.target,
        allowed: false,
        blocked_reason: `Stage 0 revision count ${request.stage_0_revision_count} >= bound ${rule.bound}`,
      };
    }
  } else if (request.failure_class === 'post_gate_decomp') {
    if (request.revision_count >= rule.bound) {
      return {
        target: rule.target,
        allowed: false,
        blocked_reason: `Revision count ${request.revision_count} >= bound ${rule.bound}`,
      };
    }
  } else if (request.failure_class === 'hypothesis_defect' || request.failure_class === 'conclusion_defect') {
    if (request.revision_count >= rule.bound) {
      return {
        target: rule.target,
        allowed: false,
        blocked_reason: `Revision count ${request.revision_count} >= bound ${rule.bound}`,
      };
    }
  }

  return { target: rule.target, allowed: true };
}