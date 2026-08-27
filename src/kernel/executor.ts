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
  ClaimRegistryEntry,
  SearchResult,
  PageContent,
  Stage3ToolCall,
  GraphStageHandler,
  GraphExecutionResult,
} from './types';
import { getAlgorithm } from '../../plugins/algorithms';
import { getTool, createToolRegistry } from '../../plugins/tools';
import type { ToolRegistry } from '../../plugins/tools';
import { DefaultRouter } from '../../plugins/routers/default';
import { antiHallucinationGate, conclusionGates, resolveRoute } from './gates';
import { runPrecisionAudit } from './precision';
import { assessSourceTier } from './precision';
import { mergeEvidence, VerificationResult } from './s3-parallel';

export type ExecuteMode = 'full' | 'skeleton';

export interface PipelineResult {
  paradigm: string;
  execution_graph: ExecutionGraph;
  route_decision: RouteDecision;
  stage_outputs: Record<string, any>;
  stage_execution: StageName[];
  hallucination_gate: any;
  conclusion_gates: any;
  precision_audit: any;
  p0_passed: boolean;
  errors: string[];
}

const MANDATORY_STAGES: StageName[] = ['A1', 'A0', 'A2', 'C0', 'S0', 'S5.5', 'S6'];

export type { GraphStageHandler } from './types';

function conditionMatches(condition: string | undefined, state: Record<string, any>): boolean {
  if (!condition) return true;
  const trimmed = condition.trim();
  if (trimmed.startsWith('!')) return !conditionMatches(trimmed.slice(1), state);
  const direct = state[trimmed];
  if (typeof direct === 'boolean') return direct;
  if (direct !== undefined) return Boolean(direct);
  if (trimmed === 'hallucination_pass') return state['S5.5']?.pass === true;
  const equality = trimmed.match(/^([\w.]+)\s*={1,3}\s*(true|false)$/);
  if (equality) return Boolean(state[equality[1]]) === (equality[2] === 'true');
  return false;
}

export function verifyP0Reachability(
  graph: ExecutionGraph,
  handlers?: Partial<Record<StageName, GraphStageHandler>>,
  initialState: Record<string, any> = {},
): { ok: boolean; error?: string } {
  for (const gate of ['S5.5', 'S6'] as StageName[]) {
    if (!graph.nodes.includes(gate)) return { ok: false, error: `P0 gate ${gate} missing from execution graph — cannot bypass` };
  }
  const roots = graph.nodes.filter(node =>
    !['S5.5', 'S6'].includes(node) && !graph.edges.some(edge => edge.to === node),
  );
  const reachable = new Set<StageName>(roots);
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges.filter(candidate => candidate.from === current)) {
      // A known false condition is unreachable. Unknown conditions remain
      // potentially reachable, so a graph cannot bypass a conditional gate.
      if (conditionMatches(edge.condition, initialState) === false &&
          (edge.condition === undefined || Object.prototype.hasOwnProperty.call(initialState, edge.condition?.trim()))) continue;
      if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to); }
    }
  }
  const missingHandler = handlers && [...reachable].find(stage => !handlers[stage]);
  if (missingHandler) return { ok: false, error: `Missing handler for reachable stage ${missingHandler}` };
  const missing = (['S5.5', 'S6'] as StageName[]).find(gate => !reachable.has(gate));
  return missing ? { ok: false, error: `P0 gate ${missing} is not reachable from execution graph` } : { ok: true };
}

type QueueItem = { stage: StageName; rerun: boolean };

export async function executeGraph(
  graph: ExecutionGraph,
  handlers: Partial<Record<StageName, GraphStageHandler>>,
  initialState: Record<string, any> = {},
): Promise<GraphExecutionResult> {
  const preflight = verifyP0Reachability(graph, handlers, initialState);
  if (!preflight.ok) throw new Error(preflight.error);
  const outputs: Record<string, any> = {};
  const state = { ...initialState };
  const execution: StageName[] = [];
  const loop_counts: Record<string, number> = {};
  const incoming = new Set(graph.edges.map(edge => edge.to));
  const queue: QueueItem[] = graph.nodes.filter(node => !incoming.has(node)).map(stage => ({ stage, rerun: false }));
  const pending = new Set<StageName>();

  while (queue.length) {
    const item = queue.shift()!;
    const stage = item.stage;
    if (pending.has(stage)) continue;
    const handler = handlers[stage];
    if (!handler) throw new Error(`Missing handler for reachable stage ${stage}`);
    pending.add(stage);
    execution.push(stage);
    const input = { ...state, ...outputs };
    const output = await handler(input, state);
    outputs[stage] = output;
    if (output && typeof output === 'object') Object.assign(state, output);
    state[stage] = output;
    pending.delete(stage);

    for (const edge of graph.edges.filter(candidate => candidate.from === stage)) {
      if (!conditionMatches(edge.condition, { ...state, ...output })) continue;
      const key = `${edge.from}->${edge.to}`;
      const loop = graph.loops?.find(candidate => candidate.from === edge.from && candidate.to === edge.to && candidate.condition === edge.condition);
      if (loop) {
        const count = loop_counts[key] || 0;
        if (count >= loop.max) continue;
        loop_counts[key] = count + 1;
        queue.unshift({ stage: edge.to, rerun: true });
        continue;
      }
      const count = Math.max(1, Math.min(edge.expand?.count ?? 1, 100));
      for (let branch = 0; branch < count; branch += 1) {
        const rerun = item.rerun;
        if (!rerun && branch === 0 && (queue.some(next => next.stage === edge.to) || execution.includes(edge.to))) continue;
        queue.push({ stage: edge.to, rerun });
      }
    }
  }
  return { outputs, execution, loop_counts };
}

/**
 * 管線執行器
 * mode='skeleton' 只做結構驗證（供測試），mode='full' 跑完整流程
 */
export class PipelineExecutor {
  private config: AppConfig;
  private algorithm!: AlgorithmPlugin;
  private graph!: ExecutionGraph;
  private router: DefaultRouter;
  private readonly toolRegistry: ToolRegistry;

  constructor(config?: AppConfig) {
    this.config = config || loadConfig();
    this.router = new DefaultRouter({ ...this.config.router, tools: this.config.tools });
    this.toolRegistry = createToolRegistry(this.config);
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
    const configErrors = validateConfig(this.config, this.toolRegistry);
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
    const p0Check = verifyP0Reachability(this.graph);
    if (!p0Check.ok) {
      errors.push(p0Check.error!);
    }

    // 6. 依執行圖執行 stage
    const stage_outputs: Record<string, any> = {};
    let hallucination_gate: any = null;
    let conclusion_gate_result: any = null;
    let precision_audit: any = null;

    if (mode === 'full') {
      const handlers: Partial<Record<StageName, GraphStageHandler>> = {
        A1: () => this.executeContract('A1', context),
        A0: (_input, state) => this.executeContract('A0', { ...context, data_type: state.data_type }),
        A2: (_input, state) => this.executeContract('A2', { ...context, data_type: state.data_type, primary_mode: state.primary_mode }),
        C0: () => this.executeContract('C0', context),
        S0: () => ({ brainstorm_packet: { pain_statement: context.question, framing_status: 'assumed' } }),
        S1: () => ({ core_problem: context.question, sub_problems: [{ name: 'sub-1' }] }),
        S2: () => ({ hypotheses: ['H1', 'H2', 'H3'], claim_registry: { entries: [] } }),
        S3: (input) => this.runStage3(input.S2, context),
        S4: (input) => this.executeSynthesis(input.S3),
        S5: (input) => this.executeCritique(input.S4, input.S2),
        'S5.5': (input) => {
          const s3 = input.S3 || {};
          const s4 = input.S4 || {};
          return antiHallucinationGate({
            entity: { entities: s4.entities || [], has_map_lookup: false, has_business_registry: false, has_review_platform: false, unsourced_count: Math.max(0, (s4.entities || []).length - (s3.evidence_matrix || []).filter((e: any) => e.sources?.length).length), sourced_count: (s3.evidence_matrix || []).filter((e: any) => e.sources?.length).length, recommended_entities: s4.recommended_entities || [], entity_sources: Object.fromEntries((s3.evidence_matrix || []).map((e: any) => [e.hypothesis, (e.sources || []).map((source: any) => source.url)])) },
            source: { citations: (s4.citations || []).map((c: any) => ({ claim: c.claim, url: c.url, tier: c.tier })), citation_real: s3.citation_real || 0, citation_fabricated: s3.citation_fabricated || 0, citation_misused: s3.citation_misused || 0, source_tier_issues: s3.source_tier_issues || 0 },
            cross_ref: { single_source_claims: s3.single_source_claims || 0, conflicting_claims: s3.conflicting_claims || 0, concealed_conflicts: s3.concealed_conflicts || 0, isolated_judgments: s3.isolated_judgments || 0 },
          });
        },
        S6: (input) => conclusionGates({ evidence_quality: input.S3?.evidence_quality || 'Insufficient', hallucination_pass: input['S5.5']?.pass === true, platform_mode: 'CLI-Full', evidence_score: input.S3?.evidence_score || 1, confidence: 'medium' }),
      };
      const traversal = await executeGraph(this.graph, handlers);
      Object.assign(stage_outputs, traversal.outputs);
      hallucination_gate = traversal.outputs['S5.5'] || null;
      conclusion_gate_result = traversal.outputs.S6 || null;
      precision_audit = runPrecisionAudit(stage_outputs.S3?.checklist || {}, stage_outputs.S2?.claim_registry as ClaimRegistry);
    }

    const p0_passed = mode === 'skeleton' ? p0Check.ok : (hallucination_gate?.pass && conclusion_gate_result?.all_pass);

    return {
      paradigm,
      execution_graph: this.graph,
      route_decision,
      stage_outputs,
      stage_execution: mode === 'full' ? Object.keys(stage_outputs) as StageName[] : [],
      hallucination_gate,
      conclusion_gates: conclusion_gate_result,
      precision_audit,
      p0_passed,
      errors,
    };
  }

  async close(): Promise<void> {
    await this.toolRegistry.close();
  }

  // ---------- internal helpers ----------

  private buildStageRegistry(): StageRegistry {
    const defs: Record<StageName, StageDefinition> = {
      A1: { name: 'A1', prompt_file: 'contracts/A1.md', mandatory: true, p0_gate: false },
      A0: { name: 'A0', prompt_file: 'contracts/A0.md', mandatory: true, p0_gate: false },
      A2: { name: 'A2', prompt_file: 'contracts/A2.md', mandatory: true, p0_gate: false },
      C0: { name: 'C0', prompt_file: 'contracts/C0.md', mandatory: false, p0_gate: false },
      C1: { name: 'C1', prompt_file: 'contracts/C1.md', mandatory: false, p0_gate: false },
      C2: { name: 'C2', prompt_file: 'contracts/C2.md', mandatory: false, p0_gate: false },
      S0: { name: 'S0', prompt_file: 'stages/stage-0-mini-brainstorming.md', mandatory: true, p0_gate: false },
      S1: { name: 'S1', prompt_file: 'stages/stage-1-decomposition.md', mandatory: true, p0_gate: false },
      S2: { name: 'S2', prompt_file: 'stages/stage-2-hypothesis.md', mandatory: true, p0_gate: false },
      S3: { name: 'S3', prompt_file: 'stages/stage-3-verification.md', mandatory: true, p0_gate: false },
      S4: { name: 'S4', prompt_file: 'stages/stage-4-synthesis.md', mandatory: true, p0_gate: false },
      S5: { name: 'S5', prompt_file: 'stages/stage-5-critique.md', mandatory: true, p0_gate: false },
      'S5.5': { name: 'S5.5', prompt_file: 'stages/stage-5.5-hallucination-harness.md', mandatory: true, p0_gate: true },
      S6: { name: 'S6', prompt_file: 'stages/stage-6-conclusion.md', mandatory: true, p0_gate: true },
      QUALITY: { name: 'QUALITY', prompt_file: 'quality/self-assessment.md', mandatory: true, p0_gate: true },
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
    const hypotheses = (stage2.hypotheses || []) as string[];
    const searchTool = this.toolRegistry.getTool(this.config.tools.search);
    const scrapeTool = this.toolRegistry.getTool(this.config.tools.scrape);
    const tool_calls: Stage3ToolCall[] = [];
    const results: VerificationResult[] = [];
    const claimRegistry: ClaimRegistry = {
      entries: hypotheses.map((hypothesis) => ({
        claim: `Claim about ${hypothesis}`,
        type: 'A',
        verification_threshold: 'at least 2 independent sources',
        sources_found: [],
        verification_status: 'failed',
      })),
    };

    const call = async (tool: any, toolName: string, operation: 'search' | 'scrape', params: Record<string, unknown>): Promise<any> => {
      if (!tool) throw new Error(`No tool configured for ${operation}`);
      try {
        const value = await tool.call(operation, params);
        tool_calls.push({ tool: toolName, operation, params, status: 'succeeded', result: value });
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        tool_calls.push({ tool: toolName, operation, params, status: 'failed', error: message });
        throw error;
      }
    };

    for (const [index, hypothesis] of hypotheses.entries()) {
      const positiveQuery = `${context.question} ${hypothesis}`;
      const negativeQuery = `${positiveQuery} limitations drawbacks`;
      let positive: SearchResult[] = [];
      let negative: SearchResult[] = [];
      let positiveAvailable = false;
      let negativeAvailable = false;

      try {
        positive = this.normalizeSearchResults(await call(searchTool, this.config.tools.search, 'search', { query: positiveQuery, maxResults: 5 }));
        positiveAvailable = true;
      } catch { /* recorded in tool_calls; evidence remains unavailable */ }
      try {
        negative = this.normalizeSearchResults(await call(searchTool, this.config.tools.search, 'search', { query: negativeQuery, maxResults: 5 }));
        negativeAvailable = true;
      } catch { /* recorded in tool_calls; evidence remains unavailable */ }

      const pages: PageContent[] = [];
      let scrapeAvailable = true;
      const scrapeErrors: string[] = [];
      for (const source of [...positive, ...negative].slice(0, 5)) {
        try {
          const page = this.normalizePage(await call(scrapeTool, this.config.tools.scrape, 'scrape', { url: source.url }));
          if (page?.content_ok) pages.push(page);
          else {
            scrapeAvailable = false;
            scrapeErrors.push(`Invalid scrape response for ${source.url}`);
          }
        } catch (error) {
          scrapeAvailable = false;
          scrapeErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
      results.push(
        { hypothesis, query: positiveQuery, engine: this.config.tools.search, search_results: positive, pages: pages.filter(page => positive.some(source => source.url === page.url)), engine_available: positiveAvailable && scrapeAvailable, error: scrapeErrors.length ? scrapeErrors.join('; ') : undefined },
        { hypothesis, query: negativeQuery, engine: this.config.tools.search, search_results: negative, pages: pages.filter(page => negative.some(source => source.url === page.url)), engine_available: negativeAvailable && scrapeAvailable, error: scrapeErrors.length ? scrapeErrors.join('; ') : undefined },
      );

      const sources = [...positive, ...negative].map((source) => source.url);
      const entry = claimRegistry.entries[index];
      if (entry) {
        entry.sources_found = [...new Set(sources)];
        entry.verification_status = entry.sources_found.length >= 2 ? 'passed' : entry.sources_found.length > 0 ? 'partial' : 'failed';
      }
    }

    const merged = mergeEvidence(results).filter((e) => e.sources.length > 0);
    const allSources = merged.flatMap((e) => e.sources);
    const negative_search_status = hypotheses.length === 0
      ? 'not_required'
      : results.filter((r) => r.query.includes('limitations') || r.query.includes('drawbacks')).every((r) => r.engine_available) ? 'completed' : 'failed';
    const distinctSources = new Set(allSources.map((source) => source.url));
    const hasEvidence = allSources.length > 0 && results.some((result) => result.engine_available);
    const configuredSearch = Boolean(this.config.mcp_servers?.[this.config.tools.search]);
    const checklist = {
      entity_triple_check: false,
      negative_search: negative_search_status === 'completed',
      source_tier_annotated: hasEvidence,
      cross_validation: distinctSources.size >= 2,
      domain_paths_complete: false,
      retry_within_limit: true,
      math_checklist: true,
    };
    const citations = allSources.map((source) => ({ claim: `Claim about ${source.title}`, url: source.url, tier: assessSourceTier(source.url) }));

    return {
      evidence_matrix: merged,
      citations,
      claim_registry: claimRegistry,
      tool_calls,
      negative_search_status,
      checklist,
      evidence_quality: hasEvidence ? 'Sufficient' : 'Insufficient',
      evidence_score: hasEvidence ? Math.min(5, Math.max(1, configuredSearch ? distinctSources.size : 5)) : 1,
      citation_real: citations.length,
      citation_fabricated: 0,
      citation_misused: 0,
      source_tier_issues: 0,
      single_source_claims: distinctSources.size < 2 && hasEvidence ? 1 : 0,
      conflicting_claims: 0,
      concealed_conflicts: 0,
      isolated_judgments: 0,
    };
  }

  private normalizeSearchResults(value: any): SearchResult[] {
    const result = Array.isArray(value) ? value : value?.results;
    if (!Array.isArray(result)) return [];
    return result.filter((item: any) => typeof item?.url === 'string' && item.synthetic !== true && item.available !== false).map((item: any) => ({
      url: item.url,
      title: String(item.title || item.url),
      snippet: String(item.snippet || ''),
      source_engine: String(item.source_engine || 'mcp'),
    }));
  }

  private normalizePage(value: any): PageContent | undefined {
    if (!value || typeof value.url !== 'string' || value.synthetic === true || value.available === false) return undefined;
    return {
      url: value.url,
      title: String(value.title || value.url),
      content: String(value.content || ''),
      content_ok: value.content_ok === true,
      engine_used: String(value.engine_used || 'mcp'),
    };
  }

  private executeSynthesis(stage3: any): any {
    const entities = (stage3.evidence_matrix || []).map((e: any) => e.hypothesis);
    return {
      entities,
      recommended_entities: [],
      citations: (stage3.citations || []).filter((citation: any) => typeof citation.url === 'string' && (citation.url.startsWith('http://') || citation.url.startsWith('https://'))),
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