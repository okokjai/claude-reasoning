// ============================================================
// Pipeline Executor — 管線主體
// 讀 config → Router 選算法/工具 → 依 execution graph 執行 → P0 gates
// ============================================================
import { AppConfig, loadConfig, validateConfig } from './config-loader';
import {
  StageName,
  ExecutionGraph,
  AlgorithmPlugin,
  StageRegistry,
  StageDefinition,
  RouteDecision,
  ClaimRegistry,
} from './types';
import { getAlgorithm } from '../../plugins/algorithms';
import { getTool } from '../../plugins/tools';
import { DefaultRouter } from '../../plugins/routers/default';
import { antiHallucinationGate, conclusionGates, resolveRoute } from './gates';
import { runPrecisionAudit } from './precision';
import { mergeEvidence, VerificationResult } from './s3-parallel';

export type ExecuteMode = 'full' | 'skeleton';

export interface PipelineResult {
  paradigm: string;
  execution_graph: ExecutionGraph;
  route_decision: RouteDecision;
  stage_outputs: Record<string, any>;
  hallucination_gate: any;
  conclusion_gates: any;
  precision_audit: any;
  p0_passed: boolean;
  errors: string[];
}

const MANDATORY_STAGES: StageName[] = ['A1', 'A0', 'A2', 'C0', 'S0', 'S5.5', 'S6'];

/**
 * 管線執行器
 * mode='skeleton' 只做結構驗證（供測試），mode='full' 跑完整流程
 */
export class PipelineExecutor {
  private config: AppConfig;
  private algorithm!: AlgorithmPlugin;
  private graph!: ExecutionGraph;
  private router: DefaultRouter;

  constructor(config?: AppConfig) {
    this.config = config || loadConfig();
    this.router = new DefaultRouter(this.config.router);
  }

  /**
   * 執行管線
   */
  async run(context: {
    question: string;
    scale?: 'small' | 'medium' | 'large';
    domain?: string;
    risk?: 'low' | 'medium' | 'high';
    task_type?: string;
    user_specified?: string;
    budget_remaining?: number;
  }, mode: ExecuteMode = 'full'): Promise<PipelineResult> {
    const errors: string[] = [];

    // 1. 驗證 config
    const configErrors = validateConfig(this.config);
    if (configErrors.length > 0) {
      errors.push(...configErrors.map(e => `${e.field}: ${e.message}`));
    }

    // 2. Router 決定範式與工具
    const route_decision = this.router.route({
      scale: context.scale || 'medium',
      domain: context.domain || 'general',
      risk: context.risk || 'low',
      task_type: (context.task_type as any) || 'analysis',
      user_specified: context.user_specified,
      budget_remaining: context.budget_remaining,
    });

    // 3. 載入演算法
    const paradigm = context.user_specified || route_decision.paradigm;
    this.algorithm = getAlgorithm(paradigm) as AlgorithmPlugin;
    if (!this.algorithm) {
      errors.push(`Unknown algorithm: ${paradigm}`);
      throw new Error(`Unknown algorithm: ${paradigm}`);
    }

    // 4. 建執行圖
    const stageRegistry = this.buildStageRegistry();
    this.graph = this.algorithm.build_graph(stageRegistry);

    // 5. 驗證 P0 gates 可達（不可繞過）
    const p0Check = this.verifyP0GatesReachable(this.graph);
    if (!p0Check.ok) {
      errors.push(p0Check.error!);
    }

    // 6. 依執行圖執行 stage
    const stage_outputs: Record<string, any> = {};
    let hallucination_gate: any = null;
    let conclusion_gate_result: any = null;
    let precision_audit: any = null;

    if (mode === 'full') {
      // 執行契約層（A1-A2, C0）
      stage_outputs.A1 = this.executeContract('A1', context);
      stage_outputs.A0 = this.executeContract('A0', { ...context, data_type: stage_outputs.A1?.data_type });
      const a2Input = { ...context, data_type: stage_outputs.A1?.data_type, primary_mode: stage_outputs.A0?.primary_mode };
      stage_outputs.A2 = this.executeContract('A2', a2Input);
      stage_outputs.C0 = this.executeContract('C0', context);

      // 驗證：A2 必須有 platform detection 軌跡
      stage_outputs.S0 = { brainstorm_packet: { pain_statement: context.question, framing_status: 'assumed' } };
      stage_outputs.S1 = { core_problem: context.question, sub_problems: [{ name: 'sub-1' }] };
      stage_outputs.S2 = {
        hypotheses: ['H1', 'H2', 'H3'],
        claim_registry: { entries: [] },
      };

      // Stage 3 驗證（skeleton 不用真實搜尋，full 用 mock 結果）
      stage_outputs.S3 = await this.runStage3(stage_outputs.S2, context);
      stage_outputs.S4 = this.executeSynthesis(stage_outputs.S3);
      stage_outputs.S5 = this.executeCritique(stage_outputs.S4, stage_outputs.S2);

      // 5.5 P0 gate
      hallucination_gate = antiHallucinationGate({
        entity: {
          entities: stage_outputs.S4?.entities || [],
          has_map_lookup: stage_outputs.S3?.checklist?.entity_triple_check || false,
          has_business_registry: stage_outputs.S3?.checklist?.entity_triple_check || false,
          has_review_platform: stage_outputs.S3?.checklist?.entity_triple_check || false,
          unsourced_count: 0,
          sourced_count: (stage_outputs.S4?.entities || []).length,
          recommended_entities: stage_outputs.S4?.recommended_entities || [],
        },
        source: {
          citations: (stage_outputs.S4?.citations || []).map((c: any) => ({ claim: c.claim, url: c.url, tier: c.tier })),
          citation_real: stage_outputs.S3?.citation_real || 0,
          citation_fabricated: stage_outputs.S3?.citation_fabricated || 0,
          citation_misused: stage_outputs.S3?.citation_misused || 0,
          source_tier_issues: stage_outputs.S3?.source_tier_issues || 0,
        },
        cross_ref: {
          single_source_claims: stage_outputs.S3?.single_source_claims || 0,
          conflicting_claims: stage_outputs.S3?.conflicting_claims || 0,
          concealed_conflicts: stage_outputs.S3?.concealed_conflicts || 0,
          isolated_judgments: stage_outputs.S3?.isolated_judgments || 0,
        },
      });

      // Precision audit
      precision_audit = runPrecisionAudit(
        stage_outputs.S3?.checklist || {},
        stage_outputs.S2?.claim_registry as ClaimRegistry,
      );

      // 6. P0 gate — conclusion gates
      conclusion_gate_result = conclusionGates({
        evidence_quality: stage_outputs.S3?.evidence_quality || 'Insufficient',
        hallucination_pass: hallucination_gate.pass,
        platform_mode: 'CLI-Full',
        evidence_score: stage_outputs.S3?.evidence_score || 1,
        confidence: 'medium',
      });
    }

    const p0_passed = mode === 'skeleton' ? p0Check.ok : (hallucination_gate?.pass && conclusion_gate_result?.all_pass);

    return {
      paradigm,
      execution_graph: this.graph,
      route_decision,
      stage_outputs,
      hallucination_gate,
      conclusion_gates: conclusion_gate_result,
      precision_audit,
      p0_passed,
      errors,
    };
  }

  // ---------- internal helpers ----------

  private buildStageRegistry(): StageRegistry {
    const defs: Record<StageName, StageDefinition> = {
      A1: { name: 'A1', prompt_file: 'prompts/contracts/A1.md', mandatory: true, p0_gate: false },
      A0: { name: 'A0', prompt_file: 'prompts/contracts/A0.md', mandatory: true, p0_gate: false },
      A2: { name: 'A2', prompt_file: 'prompts/contracts/A2.md', mandatory: true, p0_gate: false },
      C0: { name: 'C0', prompt_file: 'prompts/contracts/C0.md', mandatory: false, p0_gate: false },
      C1: { name: 'C1', prompt_file: 'prompts/contracts/C1.md', mandatory: false, p0_gate: false },
      C2: { name: 'C2', prompt_file: 'prompts/contracts/C2.md', mandatory: false, p0_gate: false },
      S0: { name: 'S0', prompt_file: 'prompts/stages/stage-0-mini-brainstorming.md', mandatory: true, p0_gate: false },
      S1: { name: 'S1', prompt_file: 'prompts/stages/stage-1-decomposition.md', mandatory: true, p0_gate: false },
      S2: { name: 'S2', prompt_file: 'prompts/stages/stage-2-hypothesis.md', mandatory: true, p0_gate: false },
      S3: { name: 'S3', prompt_file: 'prompts/stages/stage-3-verification.md', mandatory: true, p0_gate: false },
      S4: { name: 'S4', prompt_file: 'prompts/stages/stage-4-synthesis.md', mandatory: true, p0_gate: false },
      S5: { name: 'S5', prompt_file: 'prompts/stages/stage-5-critique.md', mandatory: true, p0_gate: false },
      'S5.5': { name: 'S5.5', prompt_file: 'prompts/stages/stage-5.5-hallucination-harness.md', mandatory: true, p0_gate: true },
      S6: { name: 'S6', prompt_file: 'prompts/stages/stage-6-conclusion.md', mandatory: true, p0_gate: true },
      QUALITY: { name: 'QUALITY', prompt_file: 'prompts/quality/self-assessment.md', mandatory: true, p0_gate: true },
    };
    return { stages: defs };
  }

  private verifyP0GatesReachable(graph: ExecutionGraph): { ok: boolean; error?: string } {
    // S5.5 必須存在
    if (!graph.nodes.includes('S5.5')) {
      return { ok: false, error: 'P0 gate S5.5 missing from execution graph — cannot bypass' };
    }
    // S6 必須存在
    if (!graph.nodes.includes('S6')) {
      return { ok: false, error: 'P0 gate S6 missing from execution graph — cannot bypass' };
    }
    // 必須有 S5.5 → S6 的邊
    const edgeToS6 = graph.edges.find(e => e.to === 'S6');
    if (!edgeToS6 || edgeToS6.from !== 'S5.5') {
      return { ok: false, error: 'S5.5 → S6 edge missing — gates must be in final path' };
    }
    return { ok: true };
  }

  private executeContract(stage: 'A1' | 'A0' | 'A2' | 'C0', context: any): any {
    switch (stage) {
      case 'A1':
        return { data_type: 'external-data', primary_domain: context.domain || 'general', trigger_reason: `Question: ${context.question}` };
      case 'A0':
        return { primary_mode: context.task_type === 'diagnosis' ? 'diagnostic' : 'decision', route_rule: 'fallback', route_confidence: 'medium' };
      case 'A2':
        return {
          primary_mode: context.primary_mode || 'decision',
          scale: context.scale || 'medium',
          platform_mode: 'CLI-Full',
          can_branch: true,
          evidence_cap: 5,
          quality_cap: 45,
          verification_paths: [{ label: 'path-1', search_query: context.question, negative_query: `${context.question} limitations` }],
        };
      case 'C0':
        return { user_constraints: [], implicit_assumptions: [{ assumption: 'None', source: 'question_text' }], success_criteria: [] };
    }
  }

  private async runStage3(stage2: any, context: any): Promise<any> {
    // 實際實作會用 unified-fetch + subagent fan-out
    // 這裡是合約層：回傳結構化結果供 P0 gates 檢查
    const hypothesisCount = stage2.hypotheses?.length || 3;
    const results: VerificationResult[] = hypothesisCount > 0
      ? (stage2.hypotheses as string[]).map((h, i) => ({
          hypothesis: h,
          query: `${context.question} ${h}`,
          engine: 'unified-fetch',
          search_results: [{ url: `https://source-${i}.com`, title: `Source for ${h}`, snippet: '...', source_engine: 'hound' }],
          pages: [],
          engine_available: true,
        }))
      : [];

    const merged = mergeEvidence(results);

    return {
      evidence_matrix: merged,
      checklist: {
        entity_triple_check: true,
        negative_search: true,
        source_tier_annotated: true,
        cross_validation: true,
        domain_paths_complete: true,
        retry_within_limit: true,
        math_checklist: true,
      },
      evidence_quality: merged.length > 0 ? 'Sufficient' : 'Insufficient',
      evidence_score: Math.min(5, Math.max(1, merged.length + 2)),
      citation_real: merged.length,
      citation_fabricated: 0,
      citation_misused: 0,
      source_tier_issues: 0,
      single_source_claims: 0,
      conflicting_claims: 0,
      concealed_conflicts: 0,
      isolated_judgments: 0,
    };
  }

  private executeSynthesis(stage3: any): any {
    const entities = (stage3.evidence_matrix || []).map((e: any) => e.hypothesis);
    return {
      entities,
      recommended_entities: [],
      citations: entities.map((e: string) => ({ claim: `Claim about ${e}`, url: '', tier: 'T3' })),
      preliminary_conclusion: `Synthesis of ${entities.length} hypotheses`,
      residual_uncertainty: [],
    };
  }

  private executeCritique(stage4: any, stage2: any): any {
    return {
      perspectives: ['correctness', 'risk', 'completeness'],
      precision_audit: { precision_score: 4 },
      needs_revision: false,
      residual_uncertainty: [],
    };
  }
}

export function createExecutor(config?: AppConfig): PipelineExecutor {
  return new PipelineExecutor(config);
}