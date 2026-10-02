# Architecture Spec: Clean State & Temporal Timeline Refactoring (v3.0.3)

## Status: Proposed (Brainstorming Phase)
Date: 2026-10-02
Scope: Architectural Refactoring

---

## 1. Problem Statement & Motivation

Prior iterations fixed edge cases via localized patches ("whack-a-mole"):
1. **Temporal Index Ambiguity:** `checkedAtThought` in `AcceptanceCriterion` stored physical history length (`thoughtHistory.length`), but its name and semantic documentation suggested it compared with `thoughtNumber`. When revisions reuse a previous `thoughtNumber` (e.g. revision of thought 2 occurring at history step 4), this conflation caused Gate 7 to miscalculate temporal ordering.
2. **In-place Mutation & Delete Patching:** State updates on `Hypothesis` and `Claim` previously mutated existing state and deleted disallowed fields manually (`delete hyp.notes`, `delete claim.tiers`). This allowed stale attributes to linger across state transitions.
3. **Rigid Test Count Coupling in Documentation:** Documents like `CHANGELOG.md` hardcoded dynamic test numbers (`Verified: two concurrent bun test runs both finish 198/0`, `Suite now 198 tests`), causing doc review gates to fail on every incremental test addition.

---

## 2. Proposed Architecture & Solutions

### Section 2.1: Unified Temporal Timeline (`historyIndex`)
- **Core Concept:** Distinguish between user-declared sequential counter (`thoughtNumber`) and immutable physical event timeline (`historyIndex`).
- **Data Model:**
  ```ts
  export interface ThoughtData {
    thought: string;
    thoughtNumber: number;
    totalThoughts: number;
    nextThoughtNeeded: boolean;
    historyIndex: number; // 1-based physical chronological index
    // ...
  }

  export interface AcceptanceCriterion {
    id: string;
    criterion: string;
    met?: boolean;
    notes?: string;
    checkedAtHistoryIndex?: number; // 1-based history position when checked
    /** @deprecated backward-compat alias for checkedAtHistoryIndex */
    checkedAtThought?: number;
  }
  ```
- **Backward Compatibility:**
  When loading persisted state in `loadState()`:
  - If `c.checkedAtHistoryIndex` is undefined but `c.checkedAtThought` exists, migrate: `c.checkedAtHistoryIndex = c.checkedAtThought`.
  - Maintain getter/setter or populate both during `checkCriterion` execution so external scripts/tests expecting either field remain green.
- **Gate 7 & Lint Evaluation:**
  - Evaluates `(idx + 1) > (criterion.checkedAtHistoryIndex ?? -1)`. Clear, unambiguous physical index check.

### Section 2.2: Pure State Projection Factories
- **Core Concept:** Complete replacement of `delete` operations with declarative, pure projection factories.
- **Factory Definitions:**
  ```ts
  export function projectHypothesis(
    base: { id: string; statement: string; falsification?: string },
    targetStatus: HypothesisStatus,
    fields: {
      notes?: string;
      falsificationResult?: string;
      mergedInto?: string;
    }
  ): Hypothesis {
    switch (targetStatus) {
      case "pending":
        return {
          id: base.id,
          statement: base.statement,
          status: "pending",
          falsification: base.falsification,
        };
      case "selected":
      case "rejected":
      case "synthesized":
        return {
          id: base.id,
          statement: base.statement,
          status: targetStatus,
          falsification: base.falsification,
          notes: fields.notes,
          falsificationResult: fields.falsificationResult,
        };
      case "merged":
        return {
          id: base.id,
          statement: base.statement,
          status: "merged",
          falsification: base.falsification,
          mergedInto: fields.mergedInto,
          ...(fields.notes ? { notes: fields.notes } : {}),
        };
    }
  }
  ```
  ```ts
  export function projectClaim(
    base: { id: string; claim: string; supports?: string },
    targetStatus: ClaimStatus,
    evidence: {
      sources?: string[];
      tiers?: number[];
      quote?: string;
      negativeQuery?: string;
      negativeFinding?: string;
      notes?: string;
    }
  ): Claim {
    // Only includes evidence fields legally permitted for targetStatus
    // Eliminates any possibility of residual tiers/quotes in pending status.
  }
  ```

### Section 2.3: Decoupled Documentation & Invariant Rules
- **Policy:**
  - `README.md` and `SKILL.md` use lower-bound milestone counters: `190+ tests across 6 files`.
  - `CHANGELOG.md` entry descriptions focus on feature behavior and breaking changes. Remove fragile inline counters like `both finish 198/0` in changelog prose; state metrics only in summary headers or milestone releases where appropriate.

---

## 3. Compatibility & Verification Matrix
- **Existing Tests:** All 198 tests must continue to pass without regressions.
- **Replay & Isolations:** `tests/example-replay.test.ts` and `tests/state-isolation.test.ts` verify that CLI outputs and serialized schemas stay consistent.
- **New Regression Tests:**
  - Test verifying backward compatibility of loading state with legacy `checkedAtThought`.
  - Test verifying `projectHypothesis` and `projectClaim` produce clean objects devoid of unapproved keys across all valid transitions.
