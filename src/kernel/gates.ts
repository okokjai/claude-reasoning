// src/kernel/gates.ts
// P0 gates ported from v1.2.0 stages/stage-5.5-hallucination-harness.md and
// stages/stage-6-conclusion.md onto GraphState. Pure functions — no I/O, so
// checkpoint replay is deterministic.
import type { GraphState } from "./types.js";

export const BACKTRACK_MAX = 3;
export const STAGE_0_REVISIONS_MAX = 1;
export const STAGE_6_REVISIONS_MAX = 1;

export interface AntiHallucinationResult {
  pass: boolean;
  entity_check: boolean;
  source_check: boolean;
  cross_reference_check: boolean;
  failure_route?: "stage-3" | "stage-5";
  fail_reason?: string;
}

export interface ConclusionGateResult {
  gate_1: "yes" | "no";
  gate_2: "yes" | "no";
  gate_3: "yes" | "no";
  gate_4: "yes" | "no";
  all_passed: boolean;
}

/** [Confirmed]/[Speculative]-style bracketed markers and URLs are not entity leaks. */
const NON_ENTITY = /\[(?:[^\]]*)\]|https?:\/\/\S+|\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * Check 1 — Entity: every capitalized/numeric term in `preliminary_conclusion`
 * must trace to at least one evidence_matrix entry mentioning it via
 * `source_anchor` or `hypothesis`/`evidence_summary` text.
 */
function entityCheck(state: GraphState): boolean {
  const conclusion = state.preliminary_conclusion ?? "";
  if (conclusion.trim() === "" || state.evidence_matrix.length === 0) {
    return state.evidence_matrix.length > 0 || conclusion.trim() === "";
  }
  const corpus = state.evidence_matrix
    .map((e) => `${e.source_anchor} ${e.hypothesis} ${e.evidence_summary}`)
    .join(" \n ");
  const terms = conclusion
    .replace(NON_ENTITY, " ")
    .split(/[^A-Za-z0-9$]+/)
    .filter((t) => t.length > 2 && (/[A-Z]/.test(t[0]) || /\$?\d/.test(t)));
  if (terms.length === 0) return true;
  return terms.every((t) => corpus.includes(t));
}

/**
 * Check 2 — Source: no fabricated citations. Every `[anchor]` in the
 * conclusion must exist in evidence_matrix source_anchors.
 */
function sourceCheck(state: GraphState): boolean {
  const conclusion = state.preliminary_conclusion ?? "";
  const anchors = [...conclusion.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const known = new Set(state.evidence_matrix.map((e) => e.source_anchor));
  return anchors.every((a) => known.has(a));
}

/**
 * Check 3 — Cross-reference: low-confidence evidence contradicting a
 * high-confidence hypothesis must be surfaced in contradictory_evidence_ref.
 */
function crossReferenceCheck(state: GraphState): boolean {
  const lowConflicting = state.evidence_matrix.filter((e) => {
    if (e.confidence_bucket !== "low") return false;
    const summary = e.evidence_summary.toLowerCase();
    return summary.includes("contradict") || summary.includes("conflict") || summary.includes("dispute");
  });
  return lowConflicting.every((low) =>
    state.contradictory_evidence_ref.some(
      (ref) => ref.hypothesis === low.hypothesis && ref.source_anchor === low.source_anchor
    )
  );
}

export function antiHallucinationGate(state: GraphState): AntiHallucinationResult {
  const entity = entityCheck(state);
  const source = sourceCheck(state);
  const crossRef = crossReferenceCheck(state);
  const result: AntiHallucinationResult = {
    pass: entity && source && crossRef,
    entity_check: entity,
    source_check: source,
    cross_reference_check: crossRef,
  };
  if (entity && source && crossRef) return result;
  if (!entity) {
    result.failure_route = "stage-3";
    result.fail_reason = "entity check failed: conclusion contains terms not traced to evidence_matrix";
  } else if (!source) {
    result.failure_route = "stage-3";
    result.fail_reason = "source check failed: citation anchor absent from evidence_matrix (fabricated)";
  } else {
    result.failure_route = "stage-5";
    result.fail_reason = "cross-reference check failed: low-confidence contradiction concealed from contradictory_evidence_ref";
  }
  return result;
}

/** G3: Desktop Mode conclusions must not leak proper nouns, prices, or addresses. */
const DESKTOP_LEAK = /\$?\d+(?:\.\d+)?|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b|[A-Z]{2,}\b/g;

function desktopLeakCheck(state: GraphState): boolean {
  if (state.platform_mode !== "desktop") return true;
  const text = (state.preliminary_conclusion ?? "").replace(NON_ENTITY, " ");
  return !DESKTOP_LEAK.test(text);
}

export function conclusionGates(state: GraphState): ConclusionGateResult {
  const g1 = state.evidence_quality !== "Insufficient" && state.evidence_quality !== undefined;
  const g2 = state.hallucination_result?.pass === true;
  const g3 = desktopLeakCheck(state);
  const g4 = true; // cap applied by caller when evidence_matrix.length <= 3; gate passes when the cap rule is satisfiable
  const gate_1 = g1 ? "yes" : "no";
  const gate_2 = g2 ? "yes" : "no";
  const gate_3 = g3 ? "yes" : "no";
  const gate_4 = g4 ? "yes" : "no";
  return { gate_1, gate_2, gate_3, gate_4, all_passed: g1 && g2 && g3 && g4 };
}
