# Architecture Spec: Clean State & Temporal Timeline Refactoring (v3.0.3)

## Status: Approved (revised after baseline audit)
Date: 2026-10-02 · Branch: `refactor/clean-state-and-timeline`
Worktree: `C:/tmp/DONE/claude-reasoning-refactor`

---

## 1. Problem Statement & Motivation

Prior iterations fixed edge cases via localized patches ("whack-a-mole"). Baseline audit on the refactor worktree confirms:

1. **Temporal index ambiguity — CONFIRMED REAL.** `AcceptanceCriterion.checkedAtThought` stores `state.thoughtHistory.length` (a physical count) but its name conflates it with the user-facing `thoughtNumber` (reusable by revisions). `ThoughtData` has no explicit physical index field; position is implicit in array order.

2. **Delete-patching — ALREADY RESOLVED in v3.0.2.** `grep "delete" scripts/think.ts` → 0 hits. `resolveHypothesis` (874-898) and `verifyClaim` (1173-1187) already project clean objects per status. Residual risk is *implicit* logic: no named Factory encapsulates the allowed-fields-per-status rule.

3. **Rigid doc counters — CONFIRMED REAL.** `CHANGELOG.md` line 12 (`finish 198/0`) and line 50 (`Suite now **198 tests**`) hardcode numbers that go stale on every test addition.

**Net new work for v3.0.3:** temporal-index field rename + `historyIndex` on `ThoughtData` + optional Factory extraction + doc counter cleanup.

---

## 2. Design

### 2.1 Unified Temporal Timeline

**Data model:**

```ts
export interface ThoughtData {
  thought: string;
  thoughtNumber: number;      // user-supplied; may repeat on revisions
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  historyIndex: number;       // NEW: 1-based physical position in thoughtHistory
  isRevision?: boolean;
  // ...existing fields unchanged
}

export interface AcceptanceCriterion {
  id: string;
  criterion: string;
  met?: boolean;
  notes?: string;
  checkedAtHistoryIndex?: number; // NEW primary field
  /** @deprecated legacy field; migrated on load, still written for back-compat */
  checkedAtThought?: number;
}
```

**Migration in `loadState()` (schema v2 → v3):**
- For each criterion: `checkedAtHistoryIndex ??= checkedAtThought`.
- For each thought in `thoughtHistory`: `historyIndex ??= index + 1`.
- `SCHEMA_VERSION` bump `2 → 3`; existing `data.schemaVersion !== SCHEMA_VERSION` check persists the migrated form.

**Write paths:**
- `checkCriterion` handler: `crit.checkedAtHistoryIndex = state.thoughtHistory.length; crit.checkedAtThought = state.thoughtHistory.length;` (same value; `checkedAt` semantics = "history length at check time" = position of the next thought — preserved verbatim).
- Thought push: `thoughtData.historyIndex = state.thoughtHistory.length + 1` before `push()`.

**Read paths (Gate 7 + lint WARN + status render):**
- `checkedAt` dual-read: `unmet.checkedAtHistoryIndex ?? unmet.checkedAtThought ?? -1` (Gate 7) and `cr.checkedAtHistoryIndex ?? cr.checkedAtThought` (lint WARN + status render).
- **v3.0.4:** Gate 7 and the lint WARN now compare `t.historyIndex` — not `idx + 1` — against `checkedAt`, so a stored-but-reordered `thoughtHistory` cannot fool the temporal check. `historyIndex` is the semantic timeline; array order is presentation.

### 2.2 State Projection Factory (optional hardening)

Status quo already projects clean objects. Hardening wraps the per-status allowed-fields rule in a named pure function so the invariant is greppable and future edits can't reintroduce `delete`:

```ts
function projectHypothesisForStatus(
  base: Pick<Hypothesis, "id" | "statement" | "falsification">,
  status: HypothesisStatus,
  fields: { notes?: string; falsificationResult?: string; mergedInto?: string },
): Hypothesis {
  const out: Hypothesis = { id: base.id, statement: base.statement, status, falsification: base.falsification };
  if (status === "merged") {
    if (fields.mergedInto != null) out.mergedInto = fields.mergedInto;
    if (fields.notes != null) out.notes = fields.notes;
  } else if (status !== "pending") {
    if (fields.notes != null) out.notes = fields.notes;
    if (fields.falsificationResult != null) out.falsificationResult = fields.falsificationResult;
  }
  return out;
}
```

`resolveHypothesis` delegates both branches. `verifyClaim` already projects correctly; extracting it to a factory is **out of scope** (claim projection has conditional keep-prior-fields logic — sources/tiers — that doesn't fit a clean per-status whitelist; leave as-is).

### 2.3 Documentation Decoupling

- `README.md`: keep `190+ tests across 6 files`.
- `CHANGELOG.md` v3.0.2 section: replace `both finish 198/0` → `both finish with zero failures`; `Suite now **198 tests across 6 files**` → `Suite covers … across 6 files` (descriptive, count-free).
- New v3.0.3 section: no absolute test counts; describe modules and behavior changes only.

---

## 3. Non-Goals

- Gate 7 *comparison value* is unchanged (`> checkedAt`); v3.0.4 swaps the operand from array `idx + 1` to the persisted `t.historyIndex`. This is a semantic-source fix, not a semantics change — the field now actually carries the timeline the spec promised.
- No `verifyClaim` factory extraction (see 2.2).
- No changes to `thoughtNumber` validation, duplicate checks, or branch logic.

## 4. Verification

- `bun test` must pass 198/0 plus any new regression tests added.
- New regression tests: (a) legacy state file with `checkedAtThought` only → Gate 7 still evaluates correctly after migration; (b) `historyIndex` present and sequential on all `thoughtHistory` entries after migration and after new pushes; (c) Gate 7 reads `t.historyIndex`, not `idx + 1` — a revision relocated to array index 0 with `historyIndex=2` still satisfies the gate.
- `bun scripts/think.ts --status` on a migrated state shows no behavioral difference.
