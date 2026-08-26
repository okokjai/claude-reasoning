// ============================================================
// Core Types — Claude-Reasoning v2.0
// 五層架構的基座。Algorithm/Tool/Router plugin 共用這些型別。
// ============================================================

// ---------- Stage 命名（整個管線的節點） ----------
export type StageName =
  | 'A1' | 'A0' | 'A2' | 'C0' | 'C1' | 'C2'   // 契約層
  | 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5'   // 執行層
  | 'S5.5' | 'S6'                              // 閘門層
  | 'QUALITY';                                  // 品質層

// ---------- 邊（執行圖的連接） ----------
export interface StageEdge {
  from: StageName;
  to: StageName;
  condition?: string;              // 條件邊（例：S5.5 → S6 需 hallucination_pass）
  expand?: {                       // 展開邊（ToT 多路徑）
    mode: 'multi-path' | 'per-branch';
    count: number;
    parallel?: boolean;
  };
}

export interface LoopSpec {
  from: StageName;
  to: StageName;
  condition: string;               // 回溯條件
  max: number;                     // 最大回溯次數
}

// ---------- 執行圖（Algorithm plugin 的輸出） ----------
export interface ExecutionGraph {
  nodes: StageName[];
  edges: StageEdge[];
  parallel_groups?: StageName[][]; // 可並行群（如 Stage 3 的假設×引擎）
  loops?: LoopSpec[];              // 回溯規則（ToT backtrace）
  description: string;
}

export type GraphStageHandler = (
  input: Record<string, any>,
  state: Record<string, any>,
) => any | Promise<any>;

export interface GraphExecutionResult {
  outputs: Record<string, any>;
  execution: StageName[];
  loop_counts: Record<string, number>;
}

// ---------- 成本模型（給 Router 用） ----------
export interface CostModel {
  base_cost: number;               // 基礎 token 消耗
  per_hypothesis: number;          // 每多一個假設多多少
  time_multiplier: number;         // 相對時間（CoT=1, ToT=3, ReAct=2.5）
  quality_multiplier: number;      // 質量提升倍率（DAC=2, ToT=1.8, CoT=1）
}

// ---------- Algorithm Plugin 介面 ----------
export interface AlgorithmPlugin {
  id: 'cot' | 'tot' | 'react' | 'dac' | (string & {});
  label: string;
  description: string;
  build_graph(stages: StageRegistry): ExecutionGraph;
  cost_model: CostModel;
}

// ---------- Stage 註冊表（kernel 提供，plugin 查詢） ----------
export interface StageRegistry {
  stages: Partial<Record<StageName, StageDefinition>>;
}

export interface StageDefinition {
  name: StageName;
  prompt_file: string;             // 對應 prompts/stages/*.md
  tool_required?: string[];        // 需要的工具能力（如 ['search']）
  mandatory: boolean;
  p0_gate: boolean;                // 是否為不可繞過的 P0 gate
}

// ---------- 能力介面（Tool plugin 實作） ----------
export interface ReasoningLogger {
  record(thought: Thought): void;
}

export interface SearchEngine {
  search(query: string): Promise<SearchResult[]>;
}

export interface Scraper {
  scrape(url: string): Promise<PageContent>;
}

export interface Thought {
  thought: string;
  thoughtNumber?: number;
  totalThoughts?: number;
  nextThoughtNeeded?: boolean;
  branchId?: string;
  isRevision?: boolean;
  revisesThought?: number;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source_engine: string;
}

export interface PageContent {
  url: string;
  title: string;
  content: string;
  content_ok: boolean;
  engine_used: string;
}

// ---------- Tool Plugin 介面 ----------
export interface ToolPlugin {
  id: string;
  capabilities: string[];          // ['reasoning-logger'] | ['search','scrape']
  call(operation: string, params: any): Promise<any>;
  fallback?: ToolPlugin;
}

// ---------- Router ----------
export interface RouterContext {
  scale: 'small' | 'medium' | 'large';
  domain: string;
  risk: 'low' | 'medium' | 'high';
  user_specified?: string;
  budget_remaining?: number;
  task_type?: 'analysis' | 'tool-intensive' | 'exploration' | 'decision' | 'diagnosis';
}

export interface RouteDecision {
  paradigm: string;
  tools: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface RouterPlugin {
  id: string;
  route(context: RouterContext): RouteDecision;
}

// ---------- Stage 輸入/輸出 ----------
export interface StageInput {
  [key: string]: any;
}

export interface StageOutput {
  [key: string]: any;
}

// ---------- 契約型別（原 contracts/*.md 的程式化） ----------
export type DataType = 'external-data' | 'pure-computation' | 'theoretical-derivation' | 'personal-context' | 'mixed';
export type PrimaryDomain = 'investment' | 'finance' | 'career' | 'learning' | 'relationship' | 'tech' | 'daily' | 'general';
export type Scale = 'small' | 'medium' | 'large';
export type PlatformMode = 'CLI-Full' | 'Desktop';
export type ClaimType = 'A' | 'B' | 'C' | 'D' | 'E';
export type SourceTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
export type VerificationStatus = 'failed' | 'partial' | 'passed';
export type ConfidenceBucket = 'high' | 'medium' | 'low';

// ---------- Claim Registry（Stage 2 → 3 → 5.5 的單一事實來源） ----------
export interface ClaimRegistryEntry {
  claim: string;
  type: ClaimType;
  verification_threshold: string;
  sources_found: string[];
  verification_status: VerificationStatus;
  notes?: string;
}

export interface ClaimRegistry {
  entries: ClaimRegistryEntry[];
}

export interface Stage3ToolCall {
  tool: string;
  operation: 'search' | 'scrape';
  params: Record<string, unknown>;
  status: 'succeeded' | 'failed';
  result?: unknown;
  error?: string;
}

// ---------- Stage 3 P0 子規則 checklist ----------
export interface Stage3Checklist {
  entity_triple_check: boolean;     // 地圖+工商+評論
  negative_search: boolean;         // 逢正必反
  source_tier_annotated: boolean;   // T1-T5 標註
  cross_validation: boolean;        // ≥2 獨立來源
  domain_paths_complete: boolean;   // 4 paths 全跑
  retry_within_limit: boolean;      // 重試 ≤2 次
  math_checklist: boolean;          // 參數/維度/邊界/單位/代換
}

// ---------- C2 路由表（kernel 內建，不可 plugin） ----------
export type FailureClass =
  | 'framing_defect'
  | 'decomposition'
  | 'hypothesis_defect'
  | 'evidence_defect'
  | 'conclusion_defect'
  | 'post_gate_decomp';

export interface RouteRule {
  target: StageName;
  bound: number;                    // Infinity = 無上限
}

export const C2_ROUTES: Record<FailureClass, RouteRule> = {
  framing_defect:    { target: 'S0', bound: 1 },
  decomposition:     { target: 'S1', bound: Infinity },
  hypothesis_defect: { target: 'S2', bound: 3 },
  evidence_defect:   { target: 'S3', bound: Infinity },
  conclusion_defect: { target: 'S5', bound: 3 },
  post_gate_decomp:  { target: 'S1', bound: 1 },
};