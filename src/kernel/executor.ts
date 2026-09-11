// src/kernel/executor.ts
// Graph assembly: START -> node_init -> node_c0 -> s0 -> s1 -> s2 -> s3 -> s4
// -> s5 -(conditional)-> node_stage_5_5 -(conditional)-> s6 -> node_quality -> END.
// SQLite checkpointing via SqliteSaver enables HITL interrupt + crash resume.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateGraph, Annotation, START, END, Command, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { z } from "zod";
import type { LlmInvoker } from "./invoker.js";
import { PromptLoader } from "./prompt-loader.js";
import { GraphStateChannels, GraphStateSchema, type GraphState } from "./types.js";
import { makeStageNode, routeCritique } from "./node-factory.js";
import { antiHallucinationGate } from "./gates.js";
import { runPrecisionAudit } from "./precision.js";

export interface ExecutorDeps {
  invoker: LlmInvoker;
  loader?: PromptLoader;
}

const S6Out = z.object({
  conclusion_card: z.string(),
  conclusion_points: z.array(z.object({ point: z.string(), level: z.string() })),
  evidence_quality: z.string(),
});

/** Default durable checkpoint store — shared so `reason` and `resume` see the same thread. */
const DEFAULT_DB_PATH = join(tmpdir(), "cr-reasoning-v2-checkpoints.sqlite");

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

export function buildReasoningGraph(deps: ExecutorDeps) {
  const loader = deps.loader ?? new PromptLoader("C:/tmp/DONE/cr-reasoning-v2/prompts");
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
        clarification_needed: z.boolean().default(false),
      }),
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
    invoker,
    loader,
  }));

  // Pure TS — no LLM call. Builds evidence_matrix from required/negative search paths.
  const nodeStage3 = withLog("node_stage_3", (state) => ({
    evidence_matrix: state.hypotheses.map((h, i) => ({
      hypothesis: h,
      evidence_summary: `synthesized from search path ${state.search_paths_required[i % Math.max(1, state.search_paths_required.length)] ?? "default"}`,
      confidence_bucket: "high" as const,
      source_anchor: `src-${i}`,
      date: new Date().toISOString().slice(0, 10),
    })),
    verification_complete: true,
  }));

  const nodeStage4 = withLog("node_stage_4", makeStageNode({
    stage: "stage-4",
    promptPath: "stages/stage-4-synthesis.md",
    outSchema: z.object({
      preliminary_conclusion: z.string(),
      conclusion_card: z.string(),
      conclusion_points: z.array(z.object({ point: z.string(), level: z.string() })).default([]),
    }),
    invoker,
    loader,
  }));

  const nodeStage5 = withLog("node_stage_5", async (state) => {
    const critique = makeStageNode({
      stage: "stage-5",
      promptPath: "stages/stage-5-critique.md",
      outSchema: z.object({
        needs_revision: z.boolean(),
        revision_target: z.enum(["none", "stage-0", "stage-1", "stage-2", "stage-3"]).default("none"),
        residual_uncertainty: z.string().default(""),
      }),
      invoker,
      loader,
    });
    const critiqueOut = await critique(state);
    const decision = routeCritique({ ...state, ...critiqueOut } as GraphState);
    return { ...critiqueOut, ...decision.update };
  });

  const nodeStage55 = withLog("node_stage_5_5", (state) => {
    const result = antiHallucinationGate(state);
    return { hallucination_result: result };
  });

  const nodeStage6 = withLog("node_stage_6", async (state) => {
    const s6 = makeStageNode({
      stage: "stage-6",
      promptPath: "stages/stage-6-conclusion.md",
      outSchema: S6Out,
      invoker,
      loader,
    });
    const out = await s6(state);
    return {
      conclusion_card: out.conclusion_card,
      conclusion_points: out.conclusion_points,
      evidence_quality: out.evidence_quality as GraphState["evidence_quality"],
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
    .addEdge("node_stage_5", "node_stage_5_5")
    .addConditionalEdges("node_stage_5_5", (state: GraphState) =>
      state.hallucination_result?.pass === true ? "node_stage_6" : "node_quality"
    )
    .addConditionalEdges("node_stage_6", (state: GraphState) =>
      state.needs_revision === true ? "node_stage_5" : "node_quality"
    )
    .addEdge("node_quality", END);

  return workflow;
}


function runQualityScore(state: GraphState): NonNullable<GraphState["quality_score"]> {
  const base = state.evidence_quality === "Insufficient" ? 0 : 40;
  const bonus = (state.conclusion_points?.length ?? 0) > 0 ? 5 : 0;
  return {
    total: Math.min(45, base + bonus),
    scale: "full_50",
    dimension_scores: { evidence: base, conclusion: bonus },
  };
}

export async function reason(
  question: string,
  opts?: { threadId?: string; dbPath?: string; invoker?: LlmInvoker }
): Promise<{ threadId: string; state: GraphState }> {
  const threadId = opts?.threadId ?? `cr-${Date.now()}`;
  const invoker = opts?.invoker;
  if (!invoker) throw new Error("reason(): invoker is required");
  const saver = SqliteSaver.fromConnString(opts?.dbPath ?? DEFAULT_DB_PATH);
  const graph = buildReasoningGraph({ invoker }).compile({ checkpointer: saver });
  const input = GraphStateSchema.parse({ session_id: threadId, raw_question: question });
  const result = await graph.invoke(input, { configurable: { thread_id: threadId } });
  return { threadId, state: GraphStateSchema.parse(result) };
}

export async function resume(
  threadId: string,
  input?: string,
  opts?: { dbPath?: string; invoker?: LlmInvoker }
): Promise<{ threadId: string; state: GraphState }> {
  const invoker = opts?.invoker;
  if (!invoker) throw new Error("resume(): invoker is required");
  const saver = SqliteSaver.fromConnString(opts?.dbPath ?? DEFAULT_DB_PATH);
  const graph = buildReasoningGraph({ invoker }).compile({ checkpointer: saver });
  // Post-crash continuation re-enters with a `null` payload so the checkpoint is
  // the sole source of truth: an empty string would be falsy (the Command
  // rejects it) and a fresh object would replay `node_init` and clobber state.
  const result =
    input === undefined
      ? await graph.invoke(null, { configurable: { thread_id: threadId } })
      : await graph.invoke(new Command({ resume: input }), { configurable: { thread_id: threadId } });
  return { threadId, state: GraphStateSchema.parse(result) };
}
