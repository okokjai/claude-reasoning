# Architecture: Graph-Based Reasoning Pipeline

## Design Philosophy

This skill uses **native Markdown structured prompt templates** (explicit input/output fields + validation rules) with the **sequential-thinking MCP Server** forward DAG-shaped pipeline + bounded conditional control-flow engine (branching/backtracking/visualization). This is a "contract template"-driven reasoning chain architecture with zero Python dependency — usable directly in any environment.

**Graph structure**: Contracts (node types) → Stages (execution nodes) → Quality Self-Assessment (terminal nodes), with C2 contract defining edges (required/optional transfer fields).

---

## Core Architecture

```
+-------------------------------------------------------------------+
|                     Contract Framework Layer (Skeleton)             |
|   Responsibilities: problem classification, reasoning strategy,     |
|   P0 gates, quality self-assessment, memory writes                  |
|   Contracts: A1, A0, A2, C0, A3, A4                                |
+-------------------------------------------------------------------+
|                                                                     |
|  A1 → A0 → A2 → C0 → Stage 0 → Stage 1 → Stage 2 → Stage 3 →     |
|  Stage 4 → Stage 5 → Stage 5.5 → Stage 6                              |
|                                                                     |
|  stages/stage-0-mini-brainstorming.md -> bounded mini brainstorm   |
|       |  +-- DIVERGE: at most four distinct frames                |
|       |  +-- ATTEND: compare constraints and conflicts             |
|       |  +-- CONVERGE: one primary, at most one backup             |
|       |  +-- FALSIFIER / one bounded ITERATE or no_new_angle       |
|       |                                                             |
|       v                                                             |
|  stages/stage-1-decomposition.md -> sequential-thinking decomposit. |
|       |  +-- Sub-problem A (independent branch)                    |
|       |  +-- Sub-problem B (independent branch)                    |
|       |  +-- Sub-problem C (independent branch)                    |
|       |                                                             |
|       v                                                             |
|  stages/stage-2-hypothesis.md -> sequential-thinking hypotheses    |
|       |  +-- Hypothesis A (branch)                                  |
|       |  +-- Hypothesis B (branch)                                  |
|       |  +-- Hypothesis C (branch)                                  |
|       |  +-- null hypothesis (branch)                               |
|       |                                                             |
|       v                                                             |
|  stages/stage-3-verification.md -> unified-fetch verification      |
|       |  <- each hypothesis verified independently, results written |
|       |     back to sequential-thinking nodes                       |
|       |                                                             |
|       v                                                             |
|  stages/stage-4-synthesis.md -> pure reasoning, evidence merge     |
|       |                                                             |
|       v                                                             |
|  stages/stage-5-critique.md -> sequential-thinking critique        |
|       |  +-- Correctness perspective (branch)                       |
|       |  +-- Risk perspective (branch)                              |
|       |  +-- Problem Reframing Check (one lightweight harder frame)  |
|       |  +-- framing defect -> Stage 0 at most once                 |
|       |  +-- hypothesis defect -> Stage 2; evidence defect -> Stage 3 |
|       |                                                             |
|       v                                                             |
|  stages/stage-5.5-hallucination-harness.md -> independent          |
|       |  anti-hallucination gate                                    |
|       |  +-- Check 1: Entity existence                              |
|       |  +-- Check 2: Source verification                           |
|       |  +-- Check 3: Cross-reference                               |
|       |                                                             |
|       v                                                             |
|  stages/stage-6-conclusion.md -> P0 gate + Conclusion Card         |
|       |                                                             |
|       v                                                             |
|  quality/self-assessment.md -> Quality self-assessment -> memory   |
|                                                                     |
+-------------------------------------------------------------------+
```

> **Stage path**: `A1 → A0 → A2 → C0 → Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 5.5 → Stage 6`.
>
> **Topology note**: Forward DAG-shaped pipeline with bounded conditional control-flow: the single `B9 → B5 → B6 → B7 → B8 → B9` loop and the `Stage 5/5.5/6` bounded reroutes are conditional edges with `revision_count`/`stage_0_revision_count` bounds, not a free DAG.
>
> **Fallback path**: If `can_branch=false` (sequential-thinking unavailable at runtime), Stage 0, Stages 1/2/5 revert to linear mode. The same phases, node labels, and bounded decisions are recorded as text in place of sequential-thinking calls; no stage is skipped.

---

## Stage Rules

| Stage | Tool Used | Reason |
|-------|-----------|--------|
| Contracts A1 + A2 | Contract templates (problem characteristics + reasoning strategy) | Classification and strategy only |
| Contract C0 | Contract template (user context capture) | Structured user constraints |
| Stage 0: Mini Brainstorming | `sequentialthinking` with linear fallback | Mandatory bounded framing before decomposition |
| Stage 1: Decomposition | `sequentialthinking` | Sub-problems need independent branch development |
| Stage 2: Hypothesis | `sequentialthinking` | Each hypothesis needs independent branch; Stage 5 can backtrack to revise here |
| Stage 3: Verification | `unified-fetch` | Requires actual search/browse/scrape |
| Stage 4: Synthesis | None (pure reasoning) | Merging evidence does not need tools |
| Stage 5: Critique | `sequentialthinking` | Multi-perspective branching + backtracking revision; includes one lightweight Problem Reframing Check |
| Stage 5.5: Anti-Hallucination Harness | None (pure reasoning) | Independent P0 gate, three checks: entity/source/cross-reference |
| Stage 6: Conclusion | None (P0 gate check) | Final judgment does not need tools |

---

## Backtracking Revision Mechanism

Stage 0 is mandatory for every reasoning task after C0 and before Stage 1. Its full mini brainstorm is distinct from Stage 5's lightweight Problem Reframing Check: Stage 0 runs the bounded DIVERGE → ATTEND → EVALUATE → CONVERGE → FALSIFIER path, with at most one explicit B9 → B5 → B6 → B7 → B8 → B9 loop, while Stage 5 creates one harder frame on exactly one stress axis and does not rerun those phases. A Stage 5 framing defect may return to Stage 0 at most once; hypothesis and evidence defects retain their Stage 2/3 routes.

Stage 0 uses a fixed budget: no more than four divergent frames, no more than two selected frames (one primary and at most one backup), and no more than one iteration. `no_new_angle` is a valid terminal result when no material framing defect, changed hard constraint, or changed falsifier warrants iteration.

**Backtracking termination condition**: each reasoning round has a revision limit of 3; beyond that, force entry into the conclusion stage, accept residual uncertainty, and explicitly mark unresolved blind spots in `residual_uncertainty`.

---

## Principles

- **Decompose first, then hypothesize** — do not skip steps; mandatory Stage 0 first clarifies the framing before decomposition
- **Stage 0 is bounded control-flow** — at most 4 divergent frames, 2 selected frames, and 1 bounded iteration
- **Stage 5 reframing is lightweight** — one harder frame, not a full rerun
- **At least 2 competing hypotheses per sub-problem** — avoid confirmation bias
- **Critique layer is mandatory** — at least 3 perspectives for high-risk problems
- **Branches can be backtracked and revised** — when a blind spot is found during critique, backtrack to the hypothesis stage
- **Forward propagation** — each stage's judgment passes to the next
- **Record the full reasoning chain** — including the sequential-thinking node tree
- **Deposit success patterns to Memory** — call them directly next time
- **Verifier Separation** — gates/scores/hallucination judgments are produced by independent perspectives