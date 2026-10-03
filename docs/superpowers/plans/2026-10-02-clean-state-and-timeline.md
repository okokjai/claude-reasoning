# Clean State & Temporal Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: Completed** — Tasks 1–3 landed as `1979dc8`, `30b9655`, `6bd8b9d` (v3.0.3) and `3d6092b`, `1c8903d` (v3.0.4); v3.0.5 extended the same scope.

**Goal:** Decouple physical timeline (`historyIndex`) from user `thoughtNumber`; extract a named `projectHypothesisForStatus` factory; remove rigid test counters from CHANGELOG.

**Architecture:** `scripts/think.ts` single-file state machine. `ThoughtData` gains `historyIndex` (1-based position); `AcceptanceCriterion` gains `checkedAtHistoryIndex` (renamed from `checkedAtThought`, legacy migrated on load); `resolveHypothesis` delegates to a pure projection factory.

**Tech Stack:** Bun 1.4+, TypeScript, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-02-clean-state-and-timeline-design.md`

## Global Constraints

- `SCHEMA_VERSION` 2 → 3; legacy state files must auto-migrate (no manual `--reset` required).
- All 198 existing tests must stay green; add ≥2 new regression tests.
- CLI output JSON keys may gain `checkedAtHistoryIndex` but must NOT remove `checkedAtThought` (back-compat for consumers).
- Every task ends with `bun test tests/round3.test.ts` (or full suite when touching shared paths) passing.
- No `TBD`/`TODO` placeholders; every step contains the exact code.

---

### Task 1: `historyIndex` + `checkedAtHistoryIndex` fields and migration

**Files:**
- Modify: `scripts/think.ts` — `ThoughtData` (~line 18), `AcceptanceCriterion` (~line 60), `loadState` (~line 101), `checkCriterion` handler (~line 955), thought push (~line 1383), Gate 7 (~line 1332), lint WARN (~line 304), status render (~line 398)
- Test: `tests/round3.test.ts` (new cases appended in round-8 describe)

**Interfaces:**
- Produces: `AcceptanceCriterion.checkedAtHistoryIndex?: number` (primary), `checkedAtThought?: number` (written in parallel for back-compat); `ThoughtData.historyIndex: number` (required on new pushes, backfilled on load).

- [x] **Step 1: Write failing tests**

Append to the `"round-8 review"` describe in `tests/round3.test.ts`:

```ts
  it("migrates a legacy checkedAtThought criterion and gate 7 still enforces revision-after-check", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--addCriterion", "must be covered"]);
    run(["--checkCriterion", "crit-1", "--met", "false"]);
    // Hand-edit the state file: strip checkedAtHistoryIndex, leave only the
    // legacy checkedAtThought — simulates a v2 state file.
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    delete s.acceptanceCriteria[0].checkedAtHistoryIndex;
    writeFileSync(STATE_FILE, JSON.stringify(s));
    // Next invocation should migrate the field on load.
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    const after = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(after.acceptanceCriteria[0].checkedAtHistoryIndex).toBe(1);
    // And gate 7 must still block termination (no revision since check).
    run(["--recordLens", "--lens", "a", "--finding", "x"]);
    run(["--recordLens", "--lens", "b", "--finding", "x"]);
    const blocked = run(["--thought", "end", "--thoughtNumber", "4", "--totalThoughts", "4", "--nextThoughtNeeded", "false", "--newInsight", "false"]);
    expect(blocked.code).toBe(1);
  });

  it("records historyIndex sequentially on every pushed thought", () => {
    run(["--mode", "path-a", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
    const s = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(s.thoughtHistory.map((t: any) => t.historyIndex)).toEqual([1, 2]);
  });
```

`writeFileSync` needs to be added to the existing `import { existsSync, readFileSync, unlinkSync } from "fs"` at the top of the test file.

- [x] **Step 2: Run tests to verify they fail**

Run: `bun test tests/round3.test.ts`
Expected: FAIL — `checkedAtHistoryIndex` undefined; `historyIndex` undefined.

- [x] **Step 3: Implement**

(a) `ThoughtData` — add field after `nextThoughtNeeded`:
```ts
  historyIndex?: number; // 1-based physical position; set on push, backfilled on load
```
(optional field to keep hand-constructed `ThoughtData` literals in tests compiling; write path always sets it)

(b) `AcceptanceCriterion` — replace `checkedAtThought` comment block:
```ts
  checkedAtHistoryIndex?: number; // history length (position of next thought) when checked; gate 7 compares revisions after this
  /** @deprecated legacy v2 field — migrated to checkedAtHistoryIndex on load; still written for back-compat */
  checkedAtThought?: number;
```

(c) `loadState` migration — inside `migrated` construction, map both collections:
```ts
        acceptanceCriteria: (data.acceptanceCriteria || []).map((c: AcceptanceCriterion) =>
          c.checkedAtHistoryIndex == null && c.checkedAtThought != null
            ? { ...c, checkedAtHistoryIndex: c.checkedAtThought }
            : c),
        thoughtHistory: (data.thoughtHistory || []).map((t: ThoughtData, i: number) =>
          t.historyIndex == null ? { ...t, historyIndex: i + 1 } : t),
```

(d) `checkCriterion` handler (line ~955) — write both fields:
```ts
  crit.checkedAtHistoryIndex = state.thoughtHistory.length;
  crit.checkedAtThought = state.thoughtHistory.length;
```

(e) Thought push (line ~1383) — set before `state.thoughtHistory.push(thoughtData)`:
```ts
  thoughtData.historyIndex = state.thoughtHistory.length + 1;
```
Insert right before the `if (!thoughtData.isRevision && ...)` duplicate check.

(f) Gate 7 (~line 1332) — dual-read:
```ts
          const checkedAt = unmet.checkedAtHistoryIndex ?? unmet.checkedAtThought ?? -1;
```

(g) Lint WARN (~line 304):
```ts
      const revised = history.some((t, idx) => t.isRevision === true && idx + 1 > (cr.checkedAtHistoryIndex ?? cr.checkedAtThought ?? Infinity));
```
and line ~307: `checkedAtThought=${cr.checkedAtHistoryIndex ?? cr.checkedAtThought ?? "?"}`.

(h) Status render (~line 398): replace both `cr.checkedAtThought` occurrences with `cr.checkedAtHistoryIndex ?? cr.checkedAtThought`.

(i) Bump `const SCHEMA_VERSION = 2;` → `3`.

- [x] **Step 4: Run tests**

Run: `bun test tests/round3.test.ts` — new tests PASS; then `bun test` full suite — 200/0.

- [x] **Step 5: Commit**

```bash
git add scripts/think.ts tests/round3.test.ts
git commit -m "refactor: introduce historyIndex and checkedAtHistoryIndex, migrate schema v2→v3"
```

---

### Task 2: Extract `projectHypothesisForStatus` factory

**Files:**
- Modify: `scripts/think.ts` — add function near top-level helpers (~line 200); `resolveHypothesis` branches (~lines 874-898)

**Interfaces:**
- Produces: `projectHypothesisForStatus(base, status, fields) → Hypothesis`.

- [x] **Step 1: Write failing test**

Append to round-8 describe:

```ts
  it("re-resolving a merged hypothesis to rejected keeps no mergedInto", () => {
    run(["--mode", "path-b", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "4", "--nextThoughtNeeded", "true"]);
    run(["--registerHypothesis", "H1", "--falsification", "f1 clause long enough"]);
    run(["--registerHypothesis", "H2", "--falsification", "f2 clause long enough"]);
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "merged", "--mergedInto", "hyp-2", "--hypothesisNotes", "absorbed"]);
    // Re-point requires no absorbed members; hyp-1 merges INTO hyp-2 so hyp-1 has no members — re-resolve allowed? No: hyp-1 is the absorbed one. This test verifies the survivor direction instead:
    const s1 = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(s1.hypotheses["hyp-1"].status).toBe("merged");
    expect(s1.hypotheses["hyp-1"].falsificationResult).toBeUndefined();
  });
```

Wait — verify the merge chain invariant first: hyp-1 merged into hyp-2 means hyp-1 is absorbed; re-resolving hyp-1 to another status is allowed? The code only blocks re-resolve on a *survivor that absorbs members*. hyp-1 has no members pointing to it, so `hyp-1 → rejected` is allowed and its `mergedInto` must be cleared by projection. Simpler assertion: after merge, hyp-1 has `mergedInto` and no `falsificationResult`. Then re-resolve hyp-1 → rejected (needs notes+falsificationResult) and assert `mergedInto` gone:

```ts
    run(["--resolveHypothesis", "hyp-1", "--hypothesisStatus", "rejected", "--hypothesisNotes", "bad idea", "--falsificationResult", "broken"]);
    const s2 = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    expect(s2.hypotheses["hyp-1"].status).toBe("rejected");
    expect(s2.hypotheses["hyp-1"].mergedInto).toBeUndefined();
    expect(s2.hypotheses["hyp-1"].falsificationResult).toBe("broken");
```

This should already pass on baseline (projection exists); the test locks the invariant while the code is restructured. Run it against baseline first: expected PASS (guarding regression, not driving new code — acceptable since behavior is preserved, per TDD refactor rules where tests pin behavior before restructuring).

- [x] **Step 2: Extract factory and delegate**

Add before `resolveHypothesis` handler (near other helpers, ~line 780):

```ts
// Projects the subset of fields legal for a target hypothesis status. A merged
// node carries mergedInto (+optional notes) but never a falsification outcome;
// terminal non-merge statuses carry notes + falsificationResult; pending
// carries neither. Replaces mutate-then-delete so stale fields cannot survive.
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

Replace merged branch (lines ~874-879):
```ts
    state.hypotheses![hyp.id] = projectHypothesisForStatus(hyp, status, {
      mergedInto: target, notes: values.hypothesisNotes,
    });
```

Replace non-merged branch (lines ~895-898):
```ts
    state.hypotheses![hyp.id] = projectHypothesisForStatus(hyp, status, {
      notes: values.hypothesisNotes, falsificationResult: values.falsificationResult,
    });
```

- [x] **Step 3: Run tests**

Run: `bun test` — expect same pass count (200/0), no behavior change.

- [x] **Step 4: Commit**

```bash
git add scripts/think.ts tests/round3.test.ts
git commit -m "refactor: extract projectHypothesisForStatus factory for hypothesis transitions"
```

---

### Task 3: CHANGELOG + README doc decoupling + v3.0.3 section

**Files:**
- Modify: `CHANGELOG.md` (v3.0.2 lines 12, 50; prepend new v3.0.3 section)
- Modify: `README.md` (confirm `190+` already sufficient — no change expected)
- Modify: `package.json`, `SKILL.md` header — version bump `3.0.2 → 3.0.3`; `scripts/think.ts` version string (locate via `grep -n "3.0.2" scripts/think.ts`)

- [x] **Step 1: Locate version strings**

Run: `grep -rn "3\.0\.2" --include="*.ts" --include="*.json" --include="*.md" .`
Update each to `3.0.3` (CHANGELOG stays — it documents released versions).

- [x] **Step 2: Decouple fragile counters in CHANGELOG v3.0.2 section**

- Line ~12: `both finish 198/0.` → `both finish with zero failures.`
- Line ~50: `Suite now **198 tests across 6 files**.` → `Suite covers … across 6 files.` (keep the descriptive prefix, drop the bold count).

- [x] **Step 3: Prepend v3.0.3 section to CHANGELOG**

```markdown
## [3.0.3] - 2026-10-02

### Changed

- **Temporal index is now explicit.** `ThoughtData` carries `historyIndex` (1-based physical position in `thoughtHistory`) and `AcceptanceCriterion` records `checkedAtHistoryIndex` (renamed from `checkedAtThought`, which was a history length conflated with the user-facing `thoughtNumber`). Gate 7 and the lint WARN now read the renamed field; `thoughtNumber` is no longer referenced by any temporal-position check.
- **Hypothesis transitions delegate to `projectHypothesisForStatus`.** The allowed-fields-per-status rule that previously lived inline in `resolveHypothesis` is now a named pure function, so the invariant is greppable and cannot be silently bypassed by a future `delete` patch.

### Fixed

- **`example-replay.test.ts` failed on CRLF checkouts.** Git's `core.autocrlf` on Windows converts `references/*.md` to CRLF, and the fenced-block parser matched only `\n`, producing zero bash blocks. The parser now tolerates `\r\n`, and `.gitattributes` enforces `eol=lf` on text files.

### Schema

- State file schema bumps to `SCHEMA_VERSION = 3`. Legacy v2 files auto-migrate on load: `checkedAtThought` is copied to `checkedAtHistoryIndex`, and `historyIndex` is backfilled to each thought's array position. No `--reset` required; the migrated form is persisted back.
```

- [x] **Step 4: Verify**

Run: `bun test` — all green; `grep -rn "198 tests\|198/0" CHANGELOG.md` — zero hits in 3.0.2/3.0.3 sections (older history may keep its counts — that's fine, they're historical records).

- [x] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md SKILL.md package.json scripts/think.ts
git commit -m "docs: release notes for 3.0.3; decouple fragile test counters"
```
