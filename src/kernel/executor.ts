// src/kernel/executor.ts
// Graph assembly: START -> node_init -> node_c0 -> s0 -> s1 -> s2 -> s3 -> s4
// -> s5 -(conditional)-> node_stage_5_5 -(conditional)-> s6 -(conditional)->
//    node_quality -> END.
// SQLite checkpointing via SqliteSaver enables HITL interrupt + crash resume.
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { StateGraph, Annotation, START, END, Command, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { z } from "zod";
import type { LlmInvoker } from "./invoker.js";
import type { ToolAdapter, ToolResult } from "./tool-adapter.js";
import { PromptLoader } from "./prompt-loader.js";
import { GraphStateChannels, GraphStateSchema, type GraphState } from "./types.js";
import { makeStageNode, routeCritique, routeGateFailure } from "./node-factory.js";
import { antiHallucinationGate, conclusionGates, STAGE_6_REVISIONS_MAX } from "./gates.js";
import { runPrecisionAudit } from "./precision.js";

export interface ExecutorDeps {
  invoker: LlmInvoker;
  loader?: PromptLoader;
  toolAdapter?: ToolAdapter;
}

/** Structural proxy only: the kernel has not read the sources, so `high` is unreachable by design. */
export function deriveConfidenceBucket(hostCount: number): "medium" | "low" {
  return hostCount >= 2 ? "medium" : "low";
}

function distinctHosts(results: ToolResult[]): number {
  const hosts = new Set<string>();
  for (const r of results) {
    try {
      hosts.add(new URL(r.url).host);
    } catch {
      hosts.add(r.url);
    }
  }
  return hosts.size;
}

export interface Stage3Output {
  evidence_matrix: GraphState["evidence_matrix"];
  unverified_hypotheses: string[];
  tool_calls: GraphState["tool_calls"];
  cross_validation: GraphState["cross_validation"];
  verification_complete: boolean;
  evidence_quality: GraphState["evidence_quality"];
  data_gap_list: string[];
  step_execution_log: string[];
}

const STAGE3_CONCURRENCY = 4;

/** Pure aggregation over injected retrieval. No LLM call, no fabrication. */
export async function runStage3(
  state: GraphState,
  adapter: ToolAdapter
): Promise<Stage3Output> {
  const hypotheses = state.hypotheses;
  const paths = state.search_paths_required;
  const calls: GraphState["tool_calls"] = [];
  const evidence: GraphState["evidence_matrix"] = [];
  const unverified: string[] = [];

  let nextIndex = 0;
  const results: { hypothesis: string; query: string; results: ToolResult[]; seconds: number }[] = [];
  const worker = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++;
      if (i >= hypotheses.length) return;
      const hypothesis = hypotheses[i] as string;
      const query = paths[i % Math.max(1, paths.length)] ?? hypothesis;
      const started = Date.now();
      let found: ToolResult[] = [];
      try {
        found = await adapter.search(query, state.evidence_cap);
      } catch {
        found = [];
      }
      results.push({ hypothesis, query, results: found, seconds: (Date.now() - started) / 1000 });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(STAGE3_CONCURRENCY, Math.max(1, hypotheses.length)) }, worker)
  );

  results.sort((a, b) => hypotheses.indexOf(a.hypothesis) - hypotheses.indexOf(b.hypothesis));

  results.forEach((r, i) => {
    calls.push({
      sequence: i + 1,
      tool: "search",
      parameters: { query: r.query },
      summary: `${r.results.length} results`,
      engine: "tool-adapter",
      duration_seconds: Number(r.seconds.toFixed(3)),
    });
    if (r.results.length === 0) {
      unverified.push(r.hypothesis);
      return;
    }
    const bucket = deriveConfidenceBucket(distinctHosts(r.results));
    const top = r.results[0] as ToolResult;
    evidence.push({
      hypothesis: r.hypothesis,
      evidence_summary: top.title || top.snippet,
      confidence_bucket: bucket,
      source_anchor: top.url,
      date: new Date().toISOString().slice(0, 10),
    });
  });

  const anyResults = results.some((r) => r.results.length > 0);
  const gaps = [
    "cross_validation not assessable without content reading",
    "confidence_bucket is a structural proxy (distinct-host count), not content judgment",
  ];
  if (!anyResults) gaps.push("no retrieval results for any hypothesis");

  return {
    evidence_matrix: evidence,
    unverified_hypotheses: unverified,
    tool_calls: calls,
    cross_validation: {
      has_multiple_sources: evidence.length > 1,
      has_discrepancy_over_20pct: false,
      discrepancy_list: [],
      discrepancy_root_cause: "",
      consensus_range: "",
    },
    verification_complete: anyResults,
    evidence_quality: anyResults ? "Sufficient" : "Insufficient",
    data_gap_list: gaps,
    step_execution_log: ["node_stage_3"],
  };
}

const S6Out = z.object({
  conclusion_card: z.string(),
  conclusion_points: z.array(z.object({ point: z.string(), level: z.string() })),
  evidence_quality: z.string(),
});

/** Default durable checkpoint store — shared so `reason` and `resume` see the same thread. */
const DEFAULT_DB_PATH = join(tmpdir(), "claude-reasoning-checkpoints.sqlite");

function log(state: GraphState, node: string): Pick<GraphState, "step_execution_log"> {
  return { step_execution_log: [node] };
}

/** Append `node` to step_execution_log and merge partial results — the idempotent node wrapper. */
function withLog(node: string, fn: (state: GraphState) => Promise<Partial<GraphState>> | Partial<GraphState>) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const out = await fn(state);
    return { ...out, ...log(state, node) };
  };
}

/** Single writer for stage_6_revision_count (§11.2.3): incremented here, never in a node. */
export function routeStage6(state: GraphState): {
  update: Partial<GraphState>;
  goto: "node_stage_1" | "node_quality";
} {
  if (state.stage_6_gate_passed === true) {
    return { update: { revision_target: "none" }, goto: "node_quality" };
  }
  if (state.stage_6_revision_count < STAGE_6_REVISIONS_MAX) {
    return {
      update: { stage_6_revision_count: state.stage_6_revision_count + 1, revision_target: "stage-1" },
      goto: "node_stage_1",
    };
  }
  const prev = state.residual_uncertainty ?? "";
  return {
    update: {
      residual_uncertainty: prev ? `${prev}; STAGE_6_GATE_WARNING` : "STAGE_6_GATE_WARNING",
      revision_target: "none",
    },
    goto: "node_quality",
  };
}

/** Reads the token `routeStage6` wrote, so the edge never re-derives intent from the counter. */
export function stage6EdgeTarget(state: GraphState): "node_stage_1" | "node_quality" {
  return state.revision_target === "stage-1" ? "node_stage_1" : "node_quality";
}

export function buildReasoningGraph(deps: ExecutorDeps) {
  const loader = deps.loader ?? new PromptLoader(fileURLToPath(new URL("../../prompts", import.meta.url)));
  const { invoker } = deps;

  const nodeInit = withLog("node_init", (state) => ({
    session_id: state.session_id,
  }));

  const nodeC0 = withLog("node_c0", async (state) => {
    const c0 = makeStageNode({
      stage: "c0",
      promptPath: "contracts/C0.md",
      outSchema: z.object({
        immutable_constraints: z.array(z.string()).default([]),
        assumptions: z.array(z.string()).default([]),
        // The zero-migration C0 prompt (prompts/contracts/C0.md) instructs the
        // model to emit clarification_needed as a LIST of questions. Accept both
        // shapes: a non-empty list means "clarification needed", an empty list
        // or explicit false/true behaves as the boolean the router expects.
        clarification_needed: z
          .union([z.boolean(), z.array(z.string()).transform((a) => a.length > 0)])
          .default(false),
      }),
      fallbackValue: { immutable_constraints: [], assumptions: [], clarification_needed: true },
      invoker,
      loader,
    });
    return c0(state);
  });

  // HITL pause point. Deliberately NOT wrapped in `withLog`: it is not a pipeline
  // stage, and on resume this body re-executes from its start, so logging here
  // would append a duplicate entry. C0 has already committed its writes by the
  // time the router selects this node, so `clarification_needed` survives the pause.
  const nodeHitlClarify = async (state: GraphState): Promise<Partial<GraphState>> => {
    const answer = interrupt<{ reason: string; question: string; assumptions: string[] }, string>({
      reason: "clarification_needed",
      question: state.raw_question,
      assumptions: state.assumptions,
    });
    return { user_clarification: answer, clarification_needed: false };
  };

  const nodeStage0 = withLog("node_stage_0", makeStageNode({
    stage: "stage-0",
    promptPath: "stages/stage-0-mini-brainstorming.md",
    outSchema: z.object({
      pain_statement: z.string(),
      original_frame: z.string(),
      selected_frame: z.string(),
      backup_frame: z.string(),
      candidate_frame_count: z.number().int().min(0).max(4),
      selected_frame_count: z.number().int().min(0).max(2),
      cheapest_falsifier: z.string(),
      iteration_count: z.number().int().min(0).max(1),
      framing_status: z.enum(["confirmed", "assumed", "uncertain"]),
    }),
    fallbackValue: {
      pain_statement: "",
      original_frame: "",
      selected_frame: "",
      backup_frame: "",
      candidate_frame_count: 1,
      selected_frame_count: 1,
      cheapest_falsifier: "",
      iteration_count: 0,
      framing_status: "uncertain",
    },
    invoker,
    loader,
  }));

  const nodeStage1 = withLog("node_stage_1", makeStageNode({
    stage: "stage-1",
    promptPath: "stages/stage-1-decomposition.md",
    outSchema: z.object({
      core_problem: z.string(),
      sub_problems: z.array(z.string()).default([]),
      known_facts: z.array(z.string()).default([]),
    }),
    fallbackValue: { core_problem: "", sub_problems: [], known_facts: [] },
    invoker,
    loader,
  }));

  const nodeStage2 = withLog("node_stage_2", makeStageNode({
    stage: "stage-2",
    promptPath: "stages/stage-2-hypothesis.md",
    outSchema: z.object({
      hypotheses: z.array(z.string()).default([]),
      claim_registry: GraphStateSchema.shape.claim_registry,
    }),
    fallbackValue: { hypotheses: [], claim_registry: [] },
    invoker,
    loader,
  }));

  const nodeStage3 = withLog("node_stage_3", (state) =>
    runStage3(
      state,
      deps.toolAdapter ?? {
        search: async () => [],
      }
    )
  );

  const nodeStage4 = withLog("node_stage_4", makeStageNode({
    stage: "stage-4",
    promptPath: "stages/stage-4-synthesis.md",
    outSchema: z.object({
      preliminary_conclusion: z.string(),
      conclusion_card: z.string(),
      conclusion_points: z.array(z.object({ point: z.string(), level: z.string() })).default([]),
    }),
    fallbackValue: { preliminary_conclusion: "", conclusion_card: "", conclusion_points: [] },
    invoker,
    loader,
  }));

  // Stage 5 runs the critique through routeCritique — the sole counter writer —
  // and the conditional edge consumes the same decision's `goto`, so a permitted
  // backtrack re-enters the target stage instead of silently falling through.
  const nodeStage5 = withLog("node_stage_5", async (state) => {
    const critique = makeStageNode({
      stage: "stage-5",
      promptPath: "stages/stage-5-critique.md",
      outSchema: z.object({
        needs_revision: z.boolean(),
        revision_target: z.enum(["none", "stage-0", "stage-1", "stage-2", "stage-3"]).default("none"),
        residual_uncertainty: z.string().default(""),
      }),
      fallbackValue: { needs_revision: true, revision_target: "none", residual_uncertainty: "STAGE_5_SCHEMA_FALLBACK" },
      invoker,
      loader,
    });
    const critiqueOut = await critique(state);
    const decision = routeCritique({ ...state, ...critiqueOut } as GraphState);
    return { ...critiqueOut, ...decision.update };
  });
  // Stage 5.5 gate: on failure the conditional edge routes to the gate's
  // failure_route (stage-3 source fixes / stage-5 wording fixes) while the
  // backtrack budget allows; at the budget the run converges on the conclusion.
  const nodeStage55 = withLog("node_stage_5_5", (state) => {
    const result = antiHallucinationGate(state);
    if (result.pass !== true) {
      const decision = routeGateFailure(state);
      return { hallucination_result: result, ...decision.update };
    }
    return { hallucination_result: result };
  });

  const nodeStage6 = withLog("node_stage_6", async (state) => {
    const s6 = makeStageNode({
      stage: "stage-6",
      promptPath: "stages/stage-6-conclusion.md",
      outSchema: S6Out,
      fallbackValue: { conclusion_card: "", conclusion_points: [], evidence_quality: "Insufficient" },
      invoker,
      loader,
    });
    const out = await s6(state);
    const cGates = conclusionGates({
      ...state,
      preliminary_conclusion: state.preliminary_conclusion ?? out.conclusion_card,
      evidence_quality: out.evidence_quality as GraphState["evidence_quality"],
    });
    const decision = routeStage6({ ...state, stage_6_gate_passed: cGates.all_passed } as GraphState);
    return {
      conclusion_card: out.conclusion_card,
      conclusion_points: out.conclusion_points,
      evidence_quality: out.evidence_quality as GraphState["evidence_quality"],
      stage_6_gate_passed: cGates.all_passed,
      ...decision.update,
    };
  });

  const nodeQuality = withLog("node_quality", (state) => {
    const audit = runQualityScore(state);
    return { quality_score: audit };
  });
  const workflow = new StateGraph(GraphStateChannels)
    .addNode("node_init", nodeInit)
    .addNode("node_c0", nodeC0)
    .addNode("node_hitl_clarify", nodeHitlClarify)
    .addNode("node_stage_0", nodeStage0)
    .addNode("node_stage_1", nodeStage1)
    .addNode("node_stage_2", nodeStage2)
    .addNode("node_stage_3", nodeStage3)
    .addNode("node_stage_4", nodeStage4)
    .addNode("node_stage_5", nodeStage5)
    .addNode("node_stage_5_5", nodeStage55)
    .addNode("node_stage_6", nodeStage6)
    .addNode("node_quality", nodeQuality)
    .addEdge(START, "node_init")
    .addEdge("node_init", "node_c0")
    .addConditionalEdges("node_c0", (state: GraphState) =>
      state.clarification_needed && !state.user_clarification ? "node_hitl_clarify" : "node_stage_0"
    )
    .addEdge("node_hitl_clarify", "node_stage_0")
    .addEdge("node_stage_0", "node_stage_1")
    .addEdge("node_stage_1", "node_stage_2")
    .addEdge("node_stage_2", "node_stage_3")
    .addEdge("node_stage_3", "node_stage_4")
    .addEdge("node_stage_4", "node_stage_5")
    .addConditionalEdges("node_stage_5", (state: GraphState) => {
      if (!state.needs_revision || state.revision_target === "none") {
        return "node_stage_5_5";
      }
      return `node_${state.revision_target.replace(/-/g, "_")}`;
    })
    .addConditionalEdges("node_stage_5_5", (state: GraphState) => {
      if (state.hallucination_result?.pass !== true) {
        const route = state.hallucination_result?.failure_route;
        if (state.backtrack_count >= 3) {
          return "node_quality";
        }
        return route === "stage-5" ? "node_stage_5" : "node_stage_3";
      }
      return "node_stage_6";
    })
    .addConditionalEdges("node_stage_6", stage6EdgeTarget)
    .addEdge("node_quality", END);

  return workflow;
}


function runQualityScore(state: GraphState): NonNullable<GraphState["quality_score"]> {
  const precision = runPrecisionAudit(state);
  if (state.evidence_quality === "Insufficient") {
    return {
      total: 0,
      scale: "full_50",
      dimension_scores: { evidence: 0, conclusion: 0, precision: precision.precision_score },
    };
  }
  const base = 40;
  const bonus = (state.conclusion_points?.length ?? 0) > 0 ? 5 : 0;
  const precisionBonus = Math.min(5, precision.precision_score);
  const total = Math.min(50, base + bonus + (precisionBonus > 3 ? 5 : 0));
  return {
    total,
    scale: "full_50",
    dimension_scores: {
      evidence: base,
      conclusion: bonus,
      precision: precision.precision_score,
    },
  };
}

export async function reason(
  question: string,
  opts?: {
    threadId?: string;
    dbPath?: string;
    invoker?: LlmInvoker;
    toolAdapter?: ToolAdapter;
    mode?: GraphState["primary_mode"];
  }
): Promise<{ threadId: string; state: GraphState }> {
  const threadId = opts?.threadId ?? `cr-${Date.now()}`;
  const invoker = opts?.invoker;
  if (!invoker) throw new Error("reason(): invoker is required");
  const saver = SqliteSaver.fromConnString(opts?.dbPath ?? DEFAULT_DB_PATH);
  const graph = buildReasoningGraph({ invoker, toolAdapter: opts?.toolAdapter }).compile({
    checkpointer: saver,
  });
  const input = GraphStateSchema.parse({
    session_id: threadId,
    raw_question: question,
    primary_mode: opts?.mode,
  });
  const result = await graph.invoke(input, { configurable: { thread_id: threadId } });
  return { threadId, state: GraphStateSchema.parse(result) };
}

export async function resume(
  threadId: string,
  input?: string,
  opts?: { dbPath?: string; invoker?: LlmInvoker; toolAdapter?: ToolAdapter }
): Promise<{ threadId: string; state: GraphState }> {
  const invoker = opts?.invoker;
  if (!invoker) throw new Error("resume(): invoker is required");
  const saver = SqliteSaver.fromConnString(opts?.dbPath ?? DEFAULT_DB_PATH);
  const graph = buildReasoningGraph({ invoker, toolAdapter: opts?.toolAdapter }).compile({
    checkpointer: saver,
  });
  // Post-crash continuation re-enters with a `null` payload so the checkpoint is
  // the sole source of truth: an empty string would be falsy (the Command
  // rejects it) and a fresh object would replay `node_init` and clobber state.
  const result =
    input === undefined
      ? await graph.invoke(null, { configurable: { thread_id: threadId } })
      : await graph.invoke(new Command({ resume: input }), { configurable: { thread_id: threadId } });
  return { threadId, state: GraphStateSchema.parse(result) };
}
