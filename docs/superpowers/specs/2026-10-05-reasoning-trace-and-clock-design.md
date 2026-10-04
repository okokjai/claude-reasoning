# Design: Reasoning Trace + Session Clock + Conclusion-Card Restructure

Date: 2026-10-05 · Target release: 3.0.8 · Status: approved-in-chat, pending spec review

## Problem

Three independent defects share one theme — the script produces *structure* but no *visible, dated reasoning*:

1. **No clock.** `think.ts` records no timestamp; nothing supplies "today". Gate 3's "> 6 months" check has no reference date, so the model guesses dates from search snippets. `example-path-b-verify.md:107` even writes `Verified as of late 2024`, which the model mimics.
2. **Invisible reasoning.** The reasoning lives in state (hypotheses, falsification results, lens findings, criteria) and in the lint report — neither is the user-facing answer. `conclusion-card.md` has no field requiring the hypotheses / falsification outcomes / lens findings be shown, so a card can pass every gate yet never display the reasoning.
3. **Poor layout.** The card template has no ordering or formatting rules → nested bullets, long URLs mid-sentence, conclusion buried, mixed 简/繁.

## Decisions (locked in chat)

- **Reasoning trace source**: *both* — script emits a `Reasoning Trace` table in `--export`, AND `conclusion-card.md` requires pasting it as a dedicated section. Machine-derived data (can't be misremembered) + doc makes inclusion mandatory.
- **Clock enforcement**: script emits `today` + records first/last thought timestamps, **and** `--verifyClaim` gains `--claimDate` (per-source publish dates) with freshness enforcement.
- **`--claimDate` shape**: per-source, positionally aligned like `--claimTier`. Persist `claimDates[]` on the claim (parallel to `tiers[]`).
- **Layout**: conclusion-first restructure + findings table with a *source-date* column. No HTML page / `<details>` artifact — the card stays markdown pasted into chat.

## Changes

### A. Session clock (`scripts/think.ts`)

- `today()` helper → `new Date().toISOString().slice(0,10)` (UTC `YYYY-MM-DD`).
- `State` gains `startedAt?: string`, `endedAt?: string` (ISO date). Set `startedAt` on first thought; `endedAt` on the terminating thought (`nextThoughtNeeded:false`). Backfill-compatible: absent on old state files.
- `--status` and `--reset` JSON include `today`.
- `buildLintReport` header gains a `Session Clock: started <d> · ended <d> · today <d>` line (omit absent fields).

### B. `--claimDate` (Problem 1 hardening)

- New flag `--claimDate <ISO YYYY-MM-DD>`, `multiple: true`, requires `--verifyClaim`, positionally aligned with `--claimSource` (i-th date = i-th source's publish date), exempt from the single-value-duplicate scanner like `claimSource`/`claimTier`.
- `Claim` gains `claimDates?: string[]` aligned to `sources[]`.
- Validation: each must match `^\d{4}-\d{2}-\d{2}$` and parse as a real date; a date **after `today` exits 1**; count must equal `--claimSource` count when both supplied (aligned array).
- Lint WARN: a `verified` claim whose newest `claimDate` is **> 180 days** before `today` → `'<id>' newest source is N days old (>180d)`; a `verified` claim with no `claimDates` → soft WARN that freshness is unrecorded.

### C. Reasoning Trace (`scripts/think.ts` + `conclusion-card.md`)

- `buildLintReport` adds a `### Reasoning Trace` block:
  - **Hypotheses** table: `id | statement | falsification | result | status | reason` (reason = `notes`; merged rows show `mergedInto`).
  - **Lenses** table: `lens | finding (atThought)`.
  - **Criteria** table: `id | criterion | met/unmet/unchecked | notes`.
  - All user text passes `escapeHeadings` (and `|` inside text is escaped to `\|` to protect table cells).
- `conclusion-card.md`: insert a mandatory `**Reasoning Trace**` section instructing the model to paste the script-generated table verbatim; forbid summarizing it away.

### D. Conclusion-card restructure (`references/conclusion-card.md`)

- Reorder: **conclusion first** → findings table → reasoning trace → residuals → next steps.
- Findings rendered as a table with a `Source date` column fed by `claimDates`.
- One row per entity for multi-entity comparisons.
- Add rules: no raw long URLs mid-sentence (use reference links); consistent language (no 简/繁 mixing).

### E. Supporting docs

- `references/hallucination-gates.md` Gate 3: name `today` as the reference date; state that "latest" queries must carry the current month and that an empty window is reported as "no result in window", not silently older.
- `references/example-path-b-verify.md`: remove `late 2024`; use `<YYYY-MM-DD>` placeholders with a note they must not be copied literally; refresh example card to the new format.
- `SKILL.md`: add **Step -2: Calibrate clock** ("the script's `today` is the only date source"); Ground Rule "dates come from the script"; Path B step 6 requires the card to contain the reasoning trace.

## Data / schema

- `ThoughtData`: unchanged (timestamps live on `State`, not per-thought — avoids touching every thought write).
- `State`: `+startedAt?: string; +endedAt?: string` — no `SCHEMA_VERSION` bump needed; absent fields on old files simply render as omitted.
- `Claim`: `+claimDates?: string[]`.

## Edge cases

- `--claimDate` on non-`verified` statuses: same aligned-array validation runs for every status (like `claimTier`), so a malformed vector exits 1 rather than persisting.
- Old state files: `claimDates`/`startedAt`/`endedAt` absent → WARN/paths treat as "unrecorded", never crash.
- `claimDates` length vs `sources`: mismatch exits 1 (same as tiers).
- Path A: unaffected (no claims/hypotheses); clock still emitted.

## Testing

- `tests/round6.test.ts` (new): `--claimDate` count mismatch → exit 1; future date → exit 1; non-ISO → exit 1; >180d newest source → WARN; missing `claimDates` on verified → WARN; per-source alignment persists; `startedAt`/`endedAt` set on first/last thought; `--status`/`--reset` include `today`.
- `tests/example-replay.test.ts`: update expected card/trace output.
- `tests/skill-frontmatter.test.ts`: assert Step -2 exists.
- Extend `tests/changelog-structure.test.ts` gate-range guard unaffected.

## Non-goals

- No `--details`/HTML page rendering (card stays chat-pasted markdown).
- No content-level gate on the trace (script can't judge reasoning quality — only that the table is emitted).
- No `SCHEMA_VERSION` bump; changes are additive-optional.
