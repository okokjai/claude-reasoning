// src/kernel/precision.ts
// Precision audit ported from v1.2.0 stages/stage-5-critique.md deduction rules.
// Pure function — deterministic for checkpoint replay.
import type { GraphState } from "./types.js";

export interface PrecisionAudit {
  precision_score: number;
  issues_found: string[];
  four_path_complete: boolean;
  negative_search_complete: boolean;
  source_quality_annotated: boolean;
  data_gaps_listed: boolean;
  confidence_aligned: boolean;
}

export function runPrecisionAudit(state: GraphState): PrecisionAudit {
  const issues: string[] = [];
  let fourPathComplete = true;
  let negativeSearchComplete = true;
  let sourceQualityAnnotated = true;
  let dataGapsListed = true;
  let confidenceAligned = true;

  // Rule 1: missing verification path −5 (A2 mandates ≥1 path per domain; four for standard domains)
  if (state.search_paths_required.length === 0) {
    issues.push("missing verification path: -5");
    fourPathComplete = false;
  }

  // Rule 2: missing negative search −3
  if (state.negative_search_queries.length === 0) {
    issues.push("missing negative search: -3");
    negativeSearchComplete = false;
  }

  // Rule 3: unannotated T3 −2
  for (const [anchor, meta] of Object.entries(state.source_quality_matrix)) {
    const m = meta as { tier?: string; annotated?: boolean } | null | undefined;
    if (m?.tier === "T3" && m.annotated !== true) {
      issues.push(`unannotated T3 source ${anchor}: -2`);
      sourceQualityAnnotated = false;
    }
  }

  // Rule 4: unlisted data gap −2 (residual uncertainty must appear in data_gap_list)
  const residual = state.residual_uncertainty.trim().toLowerCase();
  if (residual !== "" && !state.data_gap_list.some((g) => g.toLowerCase().includes(residual) || residual.includes(g.toLowerCase()))) {
    issues.push("residual uncertainty not listed as data gap: -2");
    dataGapsListed = false;
  }

  // Rule 5: single-source Type-A marked verified −5
  for (const claim of state.claim_registry) {
    if (claim.type === "A" && claim.verification_status === "passed" && claim.sources_found.length <= 1) {
      issues.push("single-source Type-A claim marked verified: -5");
      confidenceAligned = false;
    }
  }

  const deductions = issues.reduce((sum, issue) => {
    const match = issue.match(/-(\d+)$/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  return {
    precision_score: Math.max(0, 5 - deductions),
    issues_found: issues,
    four_path_complete: fourPathComplete,
    negative_search_complete: negativeSearchComplete,
    source_quality_annotated: sourceQualityAnnotated,
    data_gaps_listed: dataGapsListed,
    confidence_aligned: confidenceAligned,
  };
}
