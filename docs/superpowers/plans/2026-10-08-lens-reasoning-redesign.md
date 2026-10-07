# Lens & Reasoning Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lenses and reasoning rules actually applied — cheapest implementation, highest effect. Give every command a real-time "what's missing" report; let the script compute the quantitative lenses itself; add lint WARNs and a problem-kind lens catalog without breaking any existing behavior.

**Architecture:** All logic lives in `scripts/think.ts` (the single state machine). New data is additive-optional on `State` (`kind`, `risk`, `flipIf` on hypotheses, `computed`/`analysis` on lenses); no `SCHEMA_VERSION` bump. `pendingActions(state)` is an independent pure function verified by a consistency test (empty ⇔ termination succeeds). `--analyze` is a new side-command that computes sensitivity/pareto/ach and writes results into `state.lenses` marked `computed: true`.

**Tech Stack:** Bun, TypeScript (`scripts/think.ts`), `bun:test`, `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-10-08-lens-reasoning-redesign.md`

## Global Constraints

- `SCHEMA_VERSION` stays `3` — all new fields optional (`kind?`, `risk?`, `flipIf?`, `computed?`, `analysis?`).
- `today()` stays local-time (`think.ts:112`); fix docs to match.
- No new `exit 1` blockers in Round 1 — only WARN/INFO lint items.
- Output compatibility: JSON side-command output adds `next: string[]`; thought status line appends `ready=<yes|no> blockers=<count>`; `--status` adds `pending: string[]`. Never append text after JSON.
- `THINK_GATES_OFF` continues to bypass all termination gates.
- Version surfaces bump to `3.2.0` at the end (package.json, SKILL.md frontmatter+title, README, think.ts header). CHANGELOG `## [3.2.0]`.
- TDD: real RED log before each implementation. Existing 289-test suite must stay green.
- New tests live in `tests/round7.test.ts`.

---

## Phase 1: Lens Catalog & Kind System

### Task 1: Lens catalog data structure + `--listLenses`

**Files:**
- Modify: `scripts/think.ts` — add `LensCatalogEntry` interface, `LENS_CATALOG` constant (11 lenses), `parseKind` helper.
- Test: `tests/round7.test.ts` (new file, first tests).

**Interfaces:**
- Produces: `LensCatalogEntry { id, name, aliases[], type: "computed"|"state-delta"|"prose", primaryKinds[], requiredArtifact, description }`; `LENS_CATALOG: LensCatalogEntry[]`; `ProblemKind = "diagnostic"|"decision"|"design"|"optimization"|"innovation"|"planning"`.
- `--listLenses`: prints JSON `{ lenses: [{id, name, type, kinds[], requiredArtifact}] }`; when `--kind` also supplied, sorts core lenses first.

- [ ] **Step 1: Write failing test** — `tests/round7.test.ts`

```ts
it("--listLenses returns catalog with 11 lenses", () => {
  const r = run(["--listLenses"]);
  expect(r.code).toBe(0);
  const j = JSON.parse(r.out);
  expect(j.lenses).toHaveLength(11);
  expect(j.lenses.map(l => l.id)).toContain("lens-6");
});
it("--listLenses --kind decision puts core lenses first", () => {
  const r = run(["--listLenses", "--kind", "decision"]);
  const j = JSON.parse(r.out);
  // decision core: 6, 10, 3
  expect(j.lenses[0].id).toBe("lens-6");
});
```

- [ ] **Step 2: Run test** — `bun test tests/round7.test.ts` → expect FAIL (no `--listLenses` handler).
- [ ] **Step 3: Implement** — Add `LensCatalogEntry` iface, `LENS_CATALOG` array, `parseKind` helper, `--listLenses` handler block.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: add lens catalog and --listLenses command`.

### Task 2: `--kind` flag on Path B

**Files:**
- Modify: `scripts/think.ts` — `State` gains `kind?: ProblemKind`; flag parsing adds `kind`; thought handler validates Path A prohibition + immutability.
- Test: `tests/round7.test.ts` — extend.

- [ ] **Step 1: Write failing test**

```ts
it("Path A rejects --kind with exit 1", () => {
  run(["--mode", "path-a", "--kind", "decision", "--thought", "test", "--thoughtNumber", "1", "--totalThoughts", "3", "--nextThoughtNeeded", "true"]);
  // expect exit 1
});
it("Path B accepts --kind on first thought, stores in state", () => {
  const r = run(["--mode", "path-b", "--kind", "decision", "--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "5", "--nextThoughtNeeded", "true"]);
  expect(r.code).toBe(0);
  const s = run(["--status"]);
  const j = JSON.parse(s.out);
  expect(j.kind).toBe("decision");
});
it("--kind immutable after first thought", () => {
  // set kind=decision, then thought 2 with --kind diagnostic → exit 1
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — `State.kind?: ProblemKind`; flag parse `kind`; thought handler validates Path A → `fail()`, stores on first Path B thought only.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: --kind flag for Path B problem kind`.

---

## Phase 2: Pending Actions (`pendingActions`)

### Task 3: `pendingActions(state)` pure function

**Files:**
- Modify: `scripts/think.ts` — add `pendingActions(state): string[]` pure function; integrate into thought status line, side-command JSON (`next`), `--status` (`pending`).
- Test: `tests/round7.test.ts` — consistency test + integration tests.

**Interfaces:**
- Produces: `pendingActions(state: State): string[]` — returns array of pending action descriptions.

- [ ] **Step 1: Write failing test**

```ts
it("pendingActions empty ⇔ termination succeeds", () => {
  // Build a complete Path B session (hyps resolved, criteria checked, lenses recorded)
  // Assert pendingActions returns [] AND termination exits 0
});
it("pendingActions returns blockers for incomplete session", () => {
  // Incomplete state → non-empty pendingActions AND termination exit 1
});
it("thought status line includes ready= and blockers=", () => {
  const r = run([...thought1args]);
  expect(r.out).toMatch(/ready=(yes|no) blockers=\d+/);
});
it("side-command JSON includes next array", () => {
  const r = run(["--registerHypothesis", "test", "--falsification", "f"]);
  const j = JSON.parse(r.out);
  expect(j.next).toBeArrayOfSize > 0;
});
it("--status includes pending array", () => {
  const s = run(["--status"]);
  const j = JSON.parse(s.out);
  expect(j.pending).toBeDefined();
});
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — `pendingActions(state)` checks Gates 3/3b, 6, 7, 8, 9, 10, 11 + pending claims/hypotheses; integrates into output paths.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: pendingActions per-step guidance`.

---

## Phase 3: Lint WARNs & Falsification Convention

### Task 4: Weak-content WARNs + falsification convention

**Files:**
- Modify: `scripts/think.ts` — `buildLintReport` gains new WARN/INFO items.
- Test: `tests/round7.test.ts`.

- [ ] **Step 1: Write failing test**

```ts
it("lens finding <20 chars triggers WARN", () => {
  // record lens with finding "x", expect WARN in lint
});
it("duplicate findings across lenses trigger WARN", () => { ... });
it("unknown lens name triggers INFO suggesting catalog", () => { ... });
it("selected hypothesis with falsified: prefix triggers WARN", () => { ... });
it("rejected with survived: and no [PREFERENCE] triggers WARN", () => { ... });
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — Add WARN/INFO pushes in `buildLintReport`.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: lint WARNs for weak lens content and falsification convention`.

### Task 5: `--flipIf` flag on `--updateHypothesis`

**Files:**
- Modify: `scripts/think.ts` — `Hypothesis` gains `flipIf?: string`; flag parsing adds `flipIf`; Reasoning Trace hypotheses table adds flipIf column; `--status` shows it.
- Test: `tests/round7.test.ts`.

- [ ] **Step 1: Write failing test**

```ts
it("selected hypothesis without --flipIf triggers WARN", () => { ... });
it("--flipIf stored on hypothesis and shown in trace", () => { ... });
it("conclusion-card template includes flipIf row", () => { ... });
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — Add `flipIf` to `Hypothesis`, flag parse, trace table column, WARN on selected without flipIf.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: --flipIf observable reversal condition`.

---

## Phase 4: `--analyze` Computation Engine

### Task 6: `--analyze sensitivity` + `--analyze pareto` + `--analyze ach`

**Files:**
- Modify: `scripts/think.ts` — new `--analyze` side-command; `--data` JSON flag; sensitivity/pareto/ach algorithms; writes `computed: true` lens entries.
- Test: `tests/round7.test.ts`.

**Interfaces:**
- `--analyze <sensitivity|pareto|ach> --data '<json>'`: deterministic, zero-dependency algorithms.
- 5% normalization threshold: `(max - min) / max < 0.05` → treat as equivalent.

- [ ] **Step 1: Write failing test**

```ts
it("--analyze sensitivity with known input produces deterministic output", () => {
  // fixed input → assert exact JSON output + lens recorded with computed: true
});
it("--analyze pareto identifies non-dominated set", () => { ... });
it("--analyze ach ranks hypotheses by least contradiction", () => { ... });
it("--analyze writes to Reasoning Trace", () => { ... });
it("--analyze rejected in Path A", () => { ... });
```

- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — Three algorithms + `--data` flag parsing + lens record injection + trace table.
- [ ] **Step 4: Run test** → GREEN.
- [ ] **Step 5: Commit** `feat: --analyze sensitivity/pareto/ach computation engine`.

---

## Phase 5: Docs, Examples, Version Bump

### Task 7: Example fix + doc alignment + version bump + CHANGELOG

**Files:**
- Modify: `references/example-path-b-verify.md` — lenses before hypothesis resolution, real numbers, consistent falsificationResult, real-time feedback.
- Modify: `tests/example-replay.test.ts` — update commandCount and assertions.
- Modify: `SKILL.md` — unify lens list (11), fix UTC→local, Step -2 text.
- Modify: `README.md` — unify lens names, remove "Red-Team Attack"/"Edge Case", update version.
- Modify: `references/critical-lenses.md` — remove "Stage 5 & Modes", align with catalog.
- Modify: `package.json` version → `3.2.0`; `SKILL.md` frontmatter+title; `README.md` title; `scripts/think.ts` header.
- Modify: `CHANGELOG.md` — `## [3.2.0]` entry.

- [ ] **Step 1: Write failing test** — example-replay updated assertions.
- [ ] **Step 2: Run test** → FAIL.
- [ ] **Step 3: Implement** — rewrite example, update replay test, sync all docs, bump version, write CHANGELOG.
- [ ] **Step 4: Run test** → GREEN (example-replay passes, changelog-structure passes).
- [ ] **Step 5: Commit** `docs: fix example, sync lens lists, bump 3.2.0`.

### Task 8: Full verification + doc review matrix

- [ ] Run `bun test` full suite (expect all green including 289+ new tests).
- [ ] Run `bun run typecheck` (expect 0 errors).
- [ ] Run the 4-item doc review matrix:
  1. Test count changed? Update README badge/table if needed.
  2. Interface contracts — `--kind`, `--listLenses`, `--analyze`, `--flipIf` documented.
  3. Architecture semantics — pendingActions, catalog, analyze in docs.
  4. CHANGELOG — complete 3.2.0 entry.
- [ ] Report evidence with actual output, not "should pass".

---

## Self-Review

- **Schema compatibility:** all new fields optional, no `SCHEMA_VERSION` bump.
- **Backwards compatibility:** unflagged sessions unchanged; Path A untouched; old state files load fine.
- **No new blockers:** all Round 1 items are WARN/INFO or additive-optional.
- **Non-goal guard:** no SCHEMA_VERSION bump, no subagent dependency in the skill itself.
- **Consistency test is the safety net:** `pendingActions` empty ⇔ termination succeeds prevents prompt-gate drift.
- **Round 2 deferred:** blocking upgrades, `--phase` ordering, lens-12 critic round — all gated on A/B metrics from Round 1.
