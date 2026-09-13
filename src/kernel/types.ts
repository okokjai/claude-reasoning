import { z } from "zod";
import { Annotation } from "@langchain/langgraph";

// ---------------------------------------------------------------------------
// Enums — binding values from task-2-schema-authority.md (controller ruling)
// ---------------------------------------------------------------------------

const DataType = z.enum([
  "external-data",
  "pure-computation",
  "theoretical-derivation",
  "personal-context",
  "mixed",
]);

const PrimaryDomain = z.enum([
  "investment",
  "finance",
  "career",
  "learning",
  "relationship",
  "tech",
  "daily",
  "general",
]);

const PrimaryMode = z.enum(["decision", "design", "diagnostic", "innovation", "optimization"]);

const Scale = z.enum(["small", "medium", "large"]);

const PlatformMode = z.enum(["desktop", "cli", "mcp"]);

const RevisionTarget = z.enum(["none", "stage-0", "stage-1", "stage-2", "stage-3"]);

const FailureRoute = z.enum(["stage-3", "stage-5"]);

const EvidenceLevel = z.enum([
  "[Confirmed]",
  "[Partially Confirmed]",
  "[Speculative]",
  "[Unknown]",
  "[Contested]",
]);

const VerificationStatus = z.enum(["passed", "partial", "failed", "unverified"]);

const ClaimType = z.enum(["A", "B", "C", "D", "E"]);

const SourceTier = z.enum(["T1", "T2", "T3", "T4", "T5"]);

const ConfidenceBucket = z.enum(["low", "medium", "high"]);

const EvidenceQuality = z.enum(["Sufficient", "Insufficient", "Contradictory"]);

const FramingStatus = z.enum(["confirmed", "assumed", "uncertain"]);

const QualityScale = z.enum(["full_50", "simplified_36"]);

// ---------------------------------------------------------------------------
// Sub-object schemas
// ---------------------------------------------------------------------------

const ClaimEntry = z.object({
  claim: z.string(),
  type: ClaimType,
  verification_threshold: z.string(),
  sources_found: z.array(z.string()),
  verification_status: VerificationStatus,
  notes: z.string().optional(),
});

const EvidenceMatrixEntry = z.object({
  hypothesis: z.string(),
  evidence_summary: z.string(),
  confidence_bucket: ConfidenceBucket,
  source_anchor: z.string(),
  date: z.string(),
});

const ToolCallEntry = z.object({
  sequence: z.number().int(),
  tool: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  summary: z.string(),
  engine: z.string(),
  duration_seconds: z.number(),
});

const CrossValidation = z.object({
  has_multiple_sources: z.boolean(),
  has_discrepancy_over_20pct: z.boolean(),
  discrepancy_list: z.array(z.string()),
  discrepancy_root_cause: z.string(),
  consensus_range: z.string(),
});

const BrainstormPacket = z.object({
  pain_statement: z.string(),
  original_frame: z.string(),
  selected_frame: z.string(),
  backup_frame: z.string(),
  candidate_frame_count: z.number().int().min(0).max(4),
  selected_frame_count: z.number().int().min(0).max(2),
  cheapest_falsifier: z.string(),
  iteration_count: z.number().int().min(0).max(1),
  framing_status: FramingStatus,
});

const ConclusionPoint = z.object({
  point: z.string(),
  level: EvidenceLevel,
});

const HallucinationResult = z.object({
  pass: z.boolean(),
  entity_check: z.boolean(),
  source_check: z.boolean(),
  cross_reference_check: z.boolean(),
  fail_reason: z.string().optional(),
  failure_route: FailureRoute.optional(),
});

const SourceTierEntry = z.object({
  hypothesis: z.string(),
  source_anchor: z.string(),
});

// ---------------------------------------------------------------------------
// GraphState
// ---------------------------------------------------------------------------

export const GraphStateSchema = z.object({
  // 1. Session & task context
  session_id: z.string(),
  raw_question: z.string(),
  data_type: DataType.default("mixed"),
  primary_domain: PrimaryDomain.default("general"),
  primary_mode: PrimaryMode.default("decision"),
  scale: Scale.default("small"),
  platform_mode: PlatformMode.default("cli"),
  can_branch: z.boolean().default(true),
  evidence_cap: z.number().int().default(5),
  quality_cap: z.number().int().default(45),

  // 2. C0 user context
  immutable_constraints: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  clarification_needed: z.boolean().default(false),
  user_clarification: z.string().optional(),

  // 3. Pipeline artifacts (C2 transfer)
  brainstorm_packet: BrainstormPacket.optional(),
  core_problem: z.string().optional(),
  sub_problems: z.array(z.string()).default([]),
  known_facts: z.array(z.string()).default([]),
  hypotheses: z.array(z.string()).default([]),
  claim_registry: z.array(ClaimEntry).default([]),
  search_paths_required: z.array(z.string()).default([]),
  negative_search_queries: z.array(z.string()).default([]),
  evidence_matrix: z.array(EvidenceMatrixEntry).default([]),
  source_quality_matrix: z.record(z.string(), z.unknown()).default({}),
  data_gap_list: z.array(z.string()).default([]),
  preliminary_conclusion: z.string().optional(),
  evidence_quality: EvidenceQuality.optional(),
  verification_complete: z.boolean().optional(),
  browse_verified: z.boolean().optional(),
  unverified_hypotheses: z.array(z.string()).default([]),
  tool_calls: z.array(ToolCallEntry).default([]),
  cross_validation: CrossValidation.optional(),
  contradictory_evidence_ref: z.array(SourceTierEntry).default([]),

  // 4. Stage 5 critique write-back
  needs_revision: z.boolean().default(false),
  revision_target: RevisionTarget.default("none"),
  residual_uncertainty: z.string().default(""),

  // 5. Counters (single-writer, §11.2.3)
  backtrack_count: z.number().int().min(0).max(3).default(0),
  stage_0_revision_count: z.number().int().min(0).max(1).default(0),
  stage_6_revision_count: z.number().int().min(0).max(1).default(0),

  // 6. Gates & outputs
  hallucination_result: HallucinationResult.optional(),
  stage_6_gate_passed: z.boolean().optional(),
  conclusion_card: z.string().optional(),
  conclusion_points: z.array(ConclusionPoint).default([]),
  quality_score: z
    .object({
      total: z.number(),
      scale: QualityScale,
      dimension_scores: z.record(z.string(), z.number()),
    })
    .optional(),

  // 7. Execution
  step_execution_log: z.array(z.string()).default([]),
});

export type DataType = z.infer<typeof DataType>;
export type PrimaryDomain = z.infer<typeof PrimaryDomain>;
export type PrimaryMode = z.infer<typeof PrimaryMode>;
export type Scale = z.infer<typeof Scale>;
export type PlatformMode = z.infer<typeof PlatformMode>;
export type RevisionTarget = z.infer<typeof RevisionTarget>;
export type FailureRoute = z.infer<typeof FailureRoute>;
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;
export type VerificationStatus = z.infer<typeof VerificationStatus>;
export type ClaimType = z.infer<typeof ClaimType>;
export type SourceTier = z.infer<typeof SourceTier>;
export type ConfidenceBucket = z.infer<typeof ConfidenceBucket>;
export type EvidenceQuality = z.infer<typeof EvidenceQuality>;
export type FramingStatus = z.infer<typeof FramingStatus>;
export type QualityScale = z.infer<typeof QualityScale>;
export type ClaimEntry = z.infer<typeof ClaimEntry>;
export type EvidenceMatrixEntry = z.infer<typeof EvidenceMatrixEntry>;
export type BrainstormPacket = z.infer<typeof BrainstormPacket>;
export type ConclusionPoint = z.infer<typeof ConclusionPoint>;
export type HallucinationResult = z.infer<typeof HallucinationResult>;
export type ToolCallEntry = z.infer<typeof ToolCallEntry>;
export type CrossValidation = z.infer<typeof CrossValidation>;

export type GraphState = z.infer<typeof GraphStateSchema>;

// ---------------------------------------------------------------------------
// LangGraph channels — one channel per field; reducers preserve untouched
// fields when a node returns Partial<GraphState>.
// ---------------------------------------------------------------------------

const scalar = <T>() => Annotation<T>({ reducer: (a, b) => (b === undefined ? a : b) });
const replaceList = <T>() =>
  Annotation<T[]>({
    reducer: (a, b) => (b === undefined ? a : b),
    default: () => [] as T[],
  });
const appendList = <T>() =>
  Annotation<T[]>({
    reducer: (a, b) => (b === undefined ? a : a.concat(b)),
    default: () => [] as T[],
  });
const counter = () =>
  Annotation<number>({ reducer: (a, b) => (b === undefined ? a : b), default: () => 0 });
export const GraphStateChannels = Annotation.Root({
  // 1. Session & task context
  session_id: scalar<string>(),
  raw_question: scalar<string>(),
  data_type: scalar<z.infer<typeof DataType>>(),
  primary_domain: scalar<z.infer<typeof PrimaryDomain>>(),
  primary_mode: scalar<z.infer<typeof PrimaryMode>>(),
  scale: scalar<z.infer<typeof Scale>>(),
  platform_mode: scalar<z.infer<typeof PlatformMode>>(),
  can_branch: scalar<boolean>(),
  evidence_cap: Annotation<number>({ reducer: (a, b) => (b === undefined ? a : b), default: () => 5 }),
  quality_cap: Annotation<number>({ reducer: (a, b) => (b === undefined ? a : b), default: () => 45 }),

  // 2. C0 user context
  immutable_constraints: replaceList<string>(),
  assumptions: replaceList<string>(),
  clarification_needed: scalar<boolean>(),
  user_clarification: scalar<string | undefined>(),

  // 3. Pipeline artifacts (C2 transfer)
  brainstorm_packet: scalar<z.infer<typeof BrainstormPacket> | undefined>(),
  core_problem: scalar<string | undefined>(),
  sub_problems: replaceList<string>(),
  known_facts: replaceList<string>(),
  hypotheses: replaceList<string>(),
  claim_registry: replaceList<z.infer<typeof ClaimEntry>>(),
  search_paths_required: replaceList<string>(),
  negative_search_queries: replaceList<string>(),
  evidence_matrix: replaceList<z.infer<typeof EvidenceMatrixEntry>>(),
  source_quality_matrix: Annotation<Record<string, unknown>>({
    reducer: (a, b) => (b === undefined ? a : { ...a, ...b }),
    default: () => ({}),
  }),
  data_gap_list: replaceList<string>(),
  preliminary_conclusion: scalar<string | undefined>(),
  evidence_quality: scalar<z.infer<typeof EvidenceQuality> | undefined>(),
  verification_complete: scalar<boolean | undefined>(),
  browse_verified: scalar<boolean | undefined>(),
  contradictory_evidence_ref: replaceList<z.infer<typeof SourceTierEntry>>(),
  unverified_hypotheses: replaceList<string>(),
  tool_calls: replaceList<z.infer<typeof ToolCallEntry>>(),
  cross_validation: scalar<z.infer<typeof CrossValidation> | undefined>(),

  // 4. Stage 5 critique write-back
  needs_revision: scalar<boolean>(),
  revision_target: scalar<z.infer<typeof RevisionTarget>>(),
  residual_uncertainty: scalar<string>(),

  // 5. Counters (single-writer, §11.2.3)
  backtrack_count: counter(),
  stage_0_revision_count: counter(),
  stage_6_revision_count: counter(),

  // 6. Gates & outputs
  hallucination_result: scalar<z.infer<typeof HallucinationResult> | undefined>(),
  stage_6_gate_passed: scalar<boolean | undefined>(),
  conclusion_card: scalar<string | undefined>(),
  conclusion_points: replaceList<z.infer<typeof ConclusionPoint>>(),
  quality_score: scalar<
    { total: number; scale: z.infer<typeof QualityScale>; dimension_scores: Record<string, number> } | undefined
  >(),

  // 7. Execution
  step_execution_log: appendList<string>(),
});
