# Reasoning Trace + Session Clock + Conclusion-Card Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-generated `Reasoning Trace` (hypotheses/lenses/criteria tables), a session clock (`today` + `startedAt`/`endedAt`), per-source `--claimDate` freshness enforcement, and a conclusion-first conclusion-card template — so the final card shows dated, visible reasoning instead of only structure.

**Architecture:** All logic lives in `scripts/think.ts` (the single state machine). New data is additive-optional on `State` (`startedAt`, `endedAt`) and `Claim` (`claimDates[]`); no `SCHEMA_VERSION` bump. `buildLintReport` emits the trace; `conclusion-card.md` requires pasting it. Docs get the date source + trace mandate.

**Tech Stack:** Bun, TypeScript (`scripts/think.ts`), `bun:test`, `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-10-05-reasoning-trace-and-clock-design.md`

## Global Constraints

- `SCHEMA_VERSION` stays `3` — all new fields optional (`startedAt?`, `endedAt?`, `claimDates?`).
- `today()` = `new Date().toISOString().slice(0,10)` (UTC `YYYY-MM-DD`).
- `--claimDate` aligned to `--claimSource` exactly like `--claimTier` (positionally, count-match exits 1); digits-only `YYYY-MM-DD`; date after `today` exits 1.
- Freshness: WARN when a `verified` claim's newest `claimDate` is >180 days before `today`; soft WARN when verified has no `claimDates`.
- All user text in the trace passes `escapeHeadings`, and `|` inside cell text escaped to `\|`.
- Version surfaces bump to `3.0.8` at the end (package.json, SKILL.md frontmatter+title, README, think.ts header). CHANGELOG `## [3.0.8]`.
- TDD: real RED log before each implementation. Existing 252-test suite must stay green.

---

### Task 1: Session clock — `today()`, `startedAt`/`endedAt`, `--status`/`--reset`/lint-report clock

**Files:**
- Modify: `scripts/think.ts` — `State` iface (~line 87), add `today()` helper, set `startedAt`/`endedAt` in thought write path (~1460+ / status-block region), `--status` response (~918), `--reset` (~827), `buildLintReport` header (~503).
- Test: `tests/round6.test.ts` (new)

**Interfaces:**
- Produces: `today(): string` → `YYYY-MM-DD`; `State.startedAt?: string`, `State.endedAt?: string`.

- [ ] **Step 1: Write failing test** — `tests/round6.test.ts`

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { execFileSync } from "child_process";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const STATE = join(ROOT, "tests", `.think_state.round6-${process.pid}.json`);
const ENV = { ...process.env, THINK_STATE_FILE: STATE };

function run(args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("bun", ["scripts/think.ts", ...args], { cwd: ROOT, env: ENV, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e: any) {
    return { code: e.status ?? 1, out: e.stdout?.toString() ?? "", err: e.stderr?.toString() ?? "" };
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("Session clock", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  it("--status on a fresh session reports today's date", () => {
    const r = run(["--status"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.today).toMatch(ISO);
  });

  it("--reset reports today's date", () => {
    const r = run(["--reset"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).today).toMatch(ISO);
  });

  it("first thought sets startedAt; terminating thought sets endedAt", () => {
    run(["--thought", "t1", "--thoughtNumber", "1", "--totalThoughts", "2", "--nextThoughtNeeded", "true", "--mode", "path-a"]);
    run(["--thought", "t2", "--thoughtNumber", "2", "--totalThoughts", "2", "--nextThoughtNeeded", "true"]);
    const t = run(["--thought", "t3", "--thoughtNumber", "3", "--totalThoughts", "3", "--nextThoughtNeeded", "false"]);
    expect(t.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE, "utf-8"));
    expect(s.startedAt).toMatch(ISO);
    expect(s.endedAt).toMatch(ISO);
  });
});
```

- [ ] **Step 2: Run test → RED**

Run: `bun test tests/round6.test.ts`
Expected: FAIL — `j.today` is `undefined`, `s.startedAt` undefined.

- [ ] **Step 3: Implement**

- `State` iface: add `startedAt?: string;   // ISO YYYY-MM-DD, set on first thought` and `endedAt?: string;     // ISO YYYY-MM-DD, set on terminating thought`.
- Add `function today(): string { return new Date().toISOString().slice(0,10); }` near the top helpers.
- Where the thought is pushed into `thoughtHistory` (before `saveState`): `if (state.startedAt == null) state.startedAt = today();` and when `nextThoughtNeeded === false` → `state.endedAt = today();`.
- `--status` response object: add `today: today()`. `--reset` JSON: add `today`.
- `buildLintReport` header line: after the title, emit `Session Clock: started ${state.startedAt ?? "?"} · ended ${state.endedAt ?? "?"} · today ${today()}`.

- [ ] **Step 4: Run test → GREEN**

Run: `bun test tests/round6.test.ts` — expect PASS (3/3). Run `bun test` — full suite stays green.

- [ ] **Step 5: Commit**

```bash
git add tests/round6.test.ts scripts/think.ts
git commit -m "feat: session clock — today/startedAt/endedAt in status, reset, lint report"
```

---

### Task 2: `--claimDate` per-source freshness

**Files:**
- Modify: `scripts/think.ts` — `Claim` iface (~35), `ParsedArgs` (~629), `parseArgs` options (~685), dup-scanner exemption (~722), `FLAG_REQUIRES` (~836), verifyClaim validation+projection (~1332-1430), lint WARN (~456 region).
- Test: `tests/round6.test.ts` (append)

**Interfaces:**
- Consumes: `today()` from Task 1.
- Produces: `Claim.claimDates?: string[]` aligned to `sources[]`; flag `--claimDate` (multiple).

- [ ] **Step 1: Write failing tests** (append to round6)

```ts
describe("--claimDate", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  function seed(): void {
    run(["--mode","path-b","--registerHypothesis","h1","--falsification","f1"]);
    run(["--registerClaim","c1","--supports","hyp-1"]);
  }

  it("requires --verifyClaim", () => {
    seed();
    const r = run(["--claimDate","2025-01-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/claimDate requires --verifyClaim/i);
  });

  it("rejects a non-ISO date", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","not-a-date"]);
    expect(r.code).toBe(1);
  });

  it("rejects a future date", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2999-01-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/future|after|today/i);
  });

  it("rejects a count mismatch with --claimSource", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2025-01-01","--claimDate","2025-02-01"]);
    expect(r.code).toBe(1);
    expect(r.err + r.out).toMatch(/one --claimDate per --claimSource|per --claimSource/i);
  });

  it("persists claimDates aligned to sources", () => {
    seed();
    const r = run(["--verifyClaim","claim-1","--claimStatus","single_source","--claimSource","https://a.com","--claimNotes","n","--claimDate","2025-06-01"]);
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(STATE,"utf-8"));
    expect(s.claims["claim-1"].claimDates).toEqual(["2025-06-01"]);
  });
});
```

- [ ] **Step 2: Run → RED**

Run: `bun test tests/round6.test.ts` — the five `--claimDate` cases FAIL (flag unknown / not required / not validated / not persisted).

- [ ] **Step 3: Implement**

- `Claim`: add `claimDates?: string[];   // publish date per source, aligned to sources[]`.
- `ParsedArgs`: add `claimDate?: string[];`. `parseArgs` options: `claimDate: { type: "string", multiple: true },`.
- Dup-scanner exemption: `if (name === "claimSource" || name === "claimTier" || name === "claimDate") continue;` and update the fail message's "Repeatable flags are only …" list.
- `FLAG_REQUIRES`: add `["claimDate", "--verifyClaim"],`.
- In verifyClaim (beside the tier shape-check, runs for every status): if `values.claimDate` supplied → each must match `^\d{4}-\d{2}-\d{2}$` and `!isNaN(Date.parse(v))` else exit 1; each must be `<= today()` else exit 1 (`--claimDate <d> is in the future (today is <today>)`); count must equal `sources.length` → `--claimDate must have one --claimDate per --claimSource`.
- Projection: `if (values.claimDate != null && values.claimDate.length > 0) projected.claimDates = values.claimDate; else if (claim.claimDates != null) projected.claimDates = claim.claimDates;` (inside the `status !== "pending"` block, mirroring the tiers rule).
- Lint WARN in `buildLintReport`: for each verified claim — if `claimDates` present, compute `newest = max(claimDates)`; if `today - newest > 180d` push `` `'${id}' newest source is N days old (>180d) re-check for updates (Gate 3)` ``; if absent push `` `'${id}' verified but source publish dates not recorded (--claimDate)` ``.

- [ ] **Step 4: Run → GREEN** — `bun test tests/round6.test.ts` PASS; `bun test` full green.

- [ ] **Step 5: Commit**

```bash
git add tests/round6.test.ts scripts/think.ts
git commit -m "feat: --claimDate per-source publish dates with 180-day freshness warning"
```

---

### Task 3: Reasoning Trace in `buildLintReport`

**Files:**
- Modify: `scripts/think.ts` — `buildLintReport` sections (~503+); add a `escapeCell` helper next to `escapeHeadings`.
- Test: `tests/round6.test.ts` (append)

**Interfaces:**
- Consumes: `escapeHeadings`; hypotheses/lenses/criteria state.
- Produces: a `## Reasoning Trace` section in the lint report.

- [ ] **Step 1: Write failing test**

```ts
describe("Reasoning trace", () => {
  beforeEach(() => { if (existsSync(STATE)) unlinkSync(STATE); });

  it("--export emits hypotheses/lenses/criteria tables", () => {
    run(["--mode","path-b","--registerHypothesis","h1","--falsification","f1"]);
    run(["--registerHypothesis","h2","--falsification","f2"]);
    run(["--resolveHypothesis","hyp-1","--hypothesisStatus","selected","--hypothesisNotes","why1","--falsificationResult","held"]);
    run(["--resolveHypothesis","hyp-2","--hypothesisStatus","rejected","--hypothesisNotes","why2","--falsificationResult","broke"]);
    run(["--recordLens","--lens","adversarial","--finding","residual-u"]);
    run(["--addCriterion","crit-x"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Reasoning Trace/);
    expect(r.out).toMatch(/hyp-1/);
    expect(r.out).toMatch(/falsification/);
    expect(r.out).toMatch(/adversarial/);
    expect(r.out).toMatch(/crit-x|crit-1/);
  });

  it("escapes a pipe inside user text so the table does not break", () => {
    run(["--mode","path-b","--registerHypothesis","a | b","--falsification","f"]);
    const r = run(["--export"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/a \\| b/);
  });
});
```

- [ ] **Step 2: Run → RED** — no `Reasoning Trace` section.

- [ ] **Step 3: Implement**

- Add `function escapeCell(s: string): string { return escapeHeadings(s).replace(/\|/g, "\\|"); }`.
- In `buildLintReport`, after the `## Hypotheses`/`## Claims`/`## Lens Findings` sections, append a `## Reasoning Trace` section with three tables (render only when the collection is non-empty):
  - `### Hypotheses` — header `| id | statement | falsification | result | status | reason |`; rows `| ${h.id} | ${escapeCell(h.statement)} | ${escapeCell(h.falsification ?? "")} | ${escapeCell(h.falsificationResult ?? "")} | ${h.status}${h.mergedInto ? ` → ${h.mergedInto}` : ""} | ${escapeCell(h.notes ?? "")} |`.
  - `### Lenses` — `| lens | finding |`; `| ${escapeCell(l.lens)} | ${escapeCell(l.finding)} |`.
  - `### Criteria` — `| id | criterion | met | reason |`; `| ${cr.id} | ${escapeCell(cr.criterion)} | ${cr.met ?? "?"} | ${escapeCell(cr.notes ?? "")} |`.

- [ ] **Step 4: Run → GREEN** — `bun test tests/round6.test.ts` PASS; `bun test` green.

- [ ] **Step 5: Commit**

```bash
git add tests/round6.test.ts scripts/think.ts
git commit -m "feat: emit reasoning-trace tables (hypotheses/lenses/criteria) in --export"
```

---

### Task 4: Docs — card restructure, gate/date refs, SKILL Step -2

**Files:**
- Modify: `references/conclusion-card.md`, `references/hallucination-gates.md` (Gate 3 ~line 25), `references/example-path-b-verify.md` (line 107 + card block), `SKILL.md` (Step -2 before Step -1 ~line 15; Ground Rule ~285; Path B step 6 ~line 86; `--claimDate` flag row).
- Test: `tests/skill-frontmatter.test.ts` (assert Step -2 + `--claimDate` row), `tests/example-replay.test.ts` (update expected output).

- [ ] **Step 1: Write failing test** (extend skill-frontmatter)

```ts
it("SKILL.md documents clock calibration and the --claimDate flag", () => {
  const md = readFileSync(join(ROOT, "SKILL.md"), "utf-8");
  expect(md).toMatch(/Step -2|Calibrate.*clock|script.*today/i);
  expect(md).toMatch(/--claimDate/);
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement**
  - `conclusion-card.md`: reorder to conclusion-first; add a mandatory `**Reasoning Trace**` section ("paste the script-generated tables verbatim; do not summarize away"); findings become a table with a `Source date` column fed by `claimDates`; add rules — no raw long URLs mid-sentence, one row per entity, consistent language.
  - `hallucination-gates.md` Gate 3: name `today` as the reference; "latest" queries carry the current month; empty window reported as "no result in window".
  - `example-path-b-verify.md`: replace `late 2024` with `<YYYY-MM-DD>` placeholders + a note they are not literal; update the example card to the new format.
  - `SKILL.md`: add `## Step -2: Calibrate clock` before Step -1 ("run `--status`; the script's `today` is the only date source"); Ground Rule "dates come from the script"; Path B step 6 requires the card to include the reasoning trace; add a `--claimDate` flag-reference row.

- [ ] **Step 4: Run → GREEN** — `bun test tests/skill-frontmatter.test.ts tests/example-replay.test.ts` PASS; `bun test` green.

- [ ] **Step 5: Commit**

```bash
git add references/ SKILL.md tests/
git commit -m "docs: conclusion-first card with mandatory reasoning trace; clock calibration step; --claimDate"
```

---

### Task 5: Version 3.0.8 bump + CHANGELOG

**Files:**
- Modify: `package.json:3`, `SKILL.md` (frontmatter `version:` + title), `README.md` title, `scripts/think.ts` header (~line 3), `CHANGELOG.md` (new `## [3.0.8]` section at top).

- [ ] **Step 1:** Bump the five version surfaces to `3.0.8`.
- [ ] **Step 2:** Add `## [3.0.8] - 2026-10-05` with `### Added` (session clock, `--claimDate`, reasoning trace), `### Changed` (conclusion-card restructure), `### Documentation` (Step -2, Gate 3 date reference, example refresh).
- [ ] **Step 3:** `bun test` (expect the suite incl. changelog-structure to pass; changelog headings unique) + `bun run typecheck`.
- [ ] **Step 4:** Commit `chore: bump version to 3.0.8`.

---

### Task 6: Docs & Invariant Sync (final phase)

- [ ] Run the 4-item doc review matrix: (1) test-count/badges — update if suite count moved (it will: round6 adds ~10); (2) interface contracts — `--claimDate` row, trace section, clock in `--status`/`--reset` all documented; (3) architecture semantics — Gate 3 date source, freshness rule; (4) CHANGELOG — complete 3.0.8 entry.
- [ ] Full `bun test` + `bun run typecheck` fresh run; report evidence.

## Self-Review

- **Spec coverage:** clock (T1), `--claimDate` (T2), trace (T3), card/gates/example/SKILL (T4), version+changelog (T5), doc-sync (T6). All spec sections map.
- **Placeholders:** none — every step has concrete code/diffs.
- **Type consistency:** `today()`, `State.startedAt/endedAt`, `Claim.claimDates`, `escapeCell` named identically across tasks.
- **Non-goal guard:** no HTML/page artifact, no SCHEMA_VERSION bump — matches spec.
