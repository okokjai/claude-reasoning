// src/kernel/node-factory.ts
// §11.2 function-node disciplines:
// 1. Idempotent write-back — nodes return Partial<GraphState> only.
// 2. Fail-loud ACL — schema violation triggers at most ONE repair retry
//    (re-invoke with prior invalid output + Zod issue list). A second failure
//    degrades to the node's deterministic `fallbackValue` when provided, and
//    otherwise throws SchemaViolationError.
// 3. Zero counter mutation — counters and the step log are written ONLY by
//    routeCritique at routing decision points.
// 4. Deps injected — invoker/loader passed in, so tests run offline.
import type { ZodTypeAny, z } from "zod";
import type { LlmInvoker } from "./invoker.js";
import { strictParse, SchemaViolationError } from "./invoker.js";
import type { PromptLoader } from "./prompt-loader.js";
import type { GraphState } from "./types.js";
import { BACKTRACK_MAX, STAGE_0_REVISIONS_MAX } from "./gates.js";

export interface StageNodeOpts {
  stage: string;
  promptPath: string;
  outSchema: ZodTypeAny;
  invoker: LlmInvoker;
  loader: PromptLoader;
  fallbackValue?: Record<string, unknown>;
}

export function makeStageNode(opts: StageNodeOpts): (state: GraphState) => Promise<Partial<GraphState>> {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const system = opts.loader.renderStage(opts.promptPath, {});
    // Prepend deterministic stage marker so MockLlmInvoker can match fixtures
    const user = `[STAGE:${opts.stage}]\n${JSON.stringify(state, null, 2)}`;

    const first = await opts.invoker.invoke([
      { system, user },
    ]);
    try {
      return strictParse(first, opts.outSchema) as Partial<GraphState>;
    } catch (err) {
      if (!(err instanceof SchemaViolationError)) throw err;
      // ONE repair retry: prior invalid output + Zod issue list appended.
      const repair = await opts.invoker.invoke([
        { system, user },
        { system, user: `Your previous response was invalid.\nRAW OUTPUT:\n${err.raw}\n\nERRORS:\n${err.message}\n\nRespond with EXACTLY ONE valid JSON object matching the schema. No fences, no commentary.` },
      ]);
      try {
        return strictParse(repair, opts.outSchema) as Partial<GraphState>;
      } catch (err2) {
        if (!(err2 instanceof SchemaViolationError)) throw err2;
        if (opts.fallbackValue !== undefined) {
          const fallback = { ...opts.fallbackValue } as Record<string, unknown>;
          const degradedTag = `[DEGRADED_${opts.stage.toUpperCase().replace(/-/g, "_")}]`;
          if ("residual_uncertainty" in fallback) {
            const prev = (fallback.residual_uncertainty as string) || "";
            fallback.residual_uncertainty = prev ? `${prev}; ${degradedTag}` : degradedTag;
          } else if (state.residual_uncertainty !== undefined) {
            fallback.residual_uncertainty = state.residual_uncertainty
              ? `${state.residual_uncertainty}; ${degradedTag}`
              : degradedTag;
          }
          return fallback as Partial<GraphState>;
        }
        throw new SchemaViolationError(
          `${opts.stage}: schema violation after 1 repair retry: ${err2.message}`,
          err2.raw
        );
      }
    }
  };
}

export interface RouteDecision {
  update: Partial<GraphState>;
  goto: string;
}

/**
 * Sole counter writer. Called only at the critique routing decision point.
 * - needs_revision=false → pass through to 5.5, no counter writes.
 * - backtrack_count >= BACKTRACK_MAX(3) → failsafe: goto 5.5, append
 *   BACKTRACK_LIMIT_EXCEEDED to residual_uncertainty.
 * - revision_target="stage-0" requires stage_0_revision_count < 1, else force
 *   target "none" and proceed to 5.5.
 */
export function routeCritique(state: GraphState): RouteDecision {
  if (!state.needs_revision) {
    return { update: {}, goto: "node_stage_5_5" };
  }
  if (state.backtrack_count >= BACKTRACK_MAX) {
    return {
      update: {
        residual_uncertainty:
          (state.residual_uncertainty ? state.residual_uncertainty + "; " : "") +
          "BACKTRACK_LIMIT_EXCEEDED",
        needs_revision: false,
      },
      goto: "node_stage_5_5",
    };
  }
  const target = state.revision_target;
  if (target === "stage-0" && state.stage_0_revision_count >= STAGE_0_REVISIONS_MAX) {
    return {
      update: { revision_target: "none", needs_revision: false },
      goto: "node_stage_5_5",
    };
  }
  const update: Partial<GraphState> = { backtrack_count: state.backtrack_count + 1 };
  if (target === "stage-0") {
    update.stage_0_revision_count = state.stage_0_revision_count + 1;
  }
  return { update, goto: `node_${target.replace(/-/g, "_")}` };
}
export function routeGateFailure(state: GraphState): RouteDecision {
  if (state.backtrack_count >= BACKTRACK_MAX) {
    return {
      update: {
        residual_uncertainty:
          (state.residual_uncertainty ? state.residual_uncertainty + "; " : "") +
          "BACKTRACK_LIMIT_EXCEEDED",
        needs_revision: false,
      },
      goto: "node_quality",
    };
  }
  const next = state.backtrack_count + 1;
  const route = state.hallucination_result?.failure_route;
  const target = route === "stage-5" ? "node_stage_5" : "node_stage_3";
  return { update: { backtrack_count: next }, goto: target };
}

export type ZodInfer<T extends ZodTypeAny> = z.infer<T>;
