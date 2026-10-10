# Deterministic Skill Activation — Design Spec

**Date:** 2026-10-10
**Repo:** `claude-reasoning`
**Status:** Approved scope (Layer A only — no `~/.omp/agent/rules/` modifications)

## 1. Problem

omp's skill activation chain has four confirmed defects, verified against
`pi-coding-agent` source (`src/extensibility/skill-descriptions.ts`,
`src/system-prompt.ts`, `src/export/ttsr.ts`) and live session state:

1. **Keyword witchcraft** — `previewSkillDescription()` truncates the routing
   signal to ~93 chars (`MAX_PREVIEW_CHARS = 100`). The model only ever sees
   "Use when or before answering any architecture tradeoff, debugging,
   root-cause investigation,…" — everything after the ellipsis is invisible.
   The model compressor (`createSkillDescriptionCompressor`) requires a
   `smol`/`tiny` model role that this host's `config.yml` does not define, so
   compression never runs and the truncated preview is permanent.

2. **Rule starvation** — `~/.omp/agent/rules/*.md` render as one-line entries
   in `<domain-rules>`; selection is attention-driven, not enforced. There is
   no code-level first-match short-circuit, but there is also no escalation:
   a session stuck in failed local fixes has no mechanism that pushes it to
   deep reasoning.

3. **Cache black hole** — `scripts/sync-local.ts` writes the description with
   `UPDATE ... WHERE key = '9a1cc97e…'` (hardcoded). The real key is computed
   as `sha256(compressPrompt + \0 + name + \0 + description)`; the current
   correct key is `986be1ba…`. The UPDATE hits a zombie row that is never
   queried (or no-ops). Orphaned rows from template/description drift have no
   GC.

4. **Probabilistic dice** — Skill selection is the model reading `<skills>`
   and choosing to `read skill://<name>`. No deterministic pre-routing hook
   exists upstream. TTSR exists but watches the model *output* stream — a
   post-hoc brake, not a router.

## 2. Root Constraint

`claude-reasoning` cannot add host primitives. The only verified
deterministic injection point is the omp extension API event
`pi.on("context")` — the same mechanism superpowers uses to force-inject its
bootstrap message into `event.messages` before the model turn
(`plugins/node_modules/superpowers/.pi/extensions/superpowers.ts`).

## 3. Architecture

Three surfaces, two deterministic gates, one full-bandwidth signal channel:

```
user input
   │
   ▼
Signal channel (session start, soft)
   sync-local.ts writes the FULL description to skill-descriptions.db
   under the correctly computed key → model sees 366 chars, not 93
   SKILL.md description front-loaded: structural criteria first
   │
   ▼
Gate A (per-turn, hard) — extensions/skill-router.ts
   pi.on("context"):
     a) structural heuristics on last user message
        (parallel options, "vs/or/compare" contrast, open-ended question
         shape, multi-file/multi-module references)
     b) session failure counter: ≥2 tool results containing error /
        failing test / nonzero exit since last successful reasoning session
   → inject user-role message: "MUST read skill://claude-reasoning"
   Idempotent: skip if messages already contain the skill body marker.
   │
   ▼
Gate B (inside skill, hard) — existing
   think.ts termination gates (≥2 hypotheses, falsification results,
   lenses, criteria) already enforce process integrity once inside.
```

The catastrophic path — model guesses shallowly and is never stopped — is
deterministically closed: failed attempts themselves become the trigger.

## 4. Components

### 4.1 `extensions/skill-router.ts` (new)

omp extension, default-exported function taking the ExtensionAPI.

- Registers `pi.on("context", handler)`.
- Handler inspects `event.messages`:
  - Finds last `role: "user"` message; extracts text parts.
  - Scores structural signals (deterministic, no model call):
    - parallel-option markers: `/\b(vs\.?|versus|or)\b/` between capitalized
      tokens, numbered/bulleted alternatives, "A or B" shapes
    - open-ended question shape: wh-questions not answerable by lookup
      (`怎麼|如何|該|比較|選|why|how should|which|trade.?off`)
    - multi-scope references: ≥2 distinct file paths or module names
  - Counts failure signals in `messages`: tool results / assistant messages
    containing `error`, `FAIL`, `exit code [^0]`, `AssertionError`,
    `Expected`, stack-trace markers — since the last claude-reasoning load.
  - If `score >= threshold` OR `failures >= 2`: return modified
    `{ messages }` with an injected user-role message directing the model to
    `read skill://claude-reasoning` before proceeding.
  - Idempotency: scan for the injection marker text; skip if present.
- Marker constant + message-shape guards copied from superpowers'
  `messageContainsBootstrap` pattern (defensive against content being
  string vs. array-of-parts).

Threshold policy: conservative (prefer false negatives). Missed first-turn
inputs fall back to the full-description soft path — strictly better than
today's 93-char preview.

### 4.2 `scripts/sync-local.ts` (rewrite of DB section)

- Compute the real key at runtime:
  `sha256(compressPromptTemplate + \0 + name + \0 + description)` where the
  template is read from the installed pi-coding-agent:
  `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/prompts/skills/compress-description.md`
  Fallback: if the template file is unreadable, skip DB writes with a
  warning (never write under a guessed key).
- `INSERT OR REPLACE INTO skill_descriptions (key, description)` with the
  raw frontmatter description — bypasses the never-running compressor.
- Sidecar file `scripts/.sync-state.json` records `{ writtenKeys: [] }`.
  On each run: delete previously written keys not equal to the new key
  (self-collecting orphans; only rows this script wrote — foreign rows are
  never touched).
- Deploy `extensions/skill-router.ts` → `~/.omp/agent/extensions/skill-router.ts`
  (overwrite; report byte count).
- Keep the existing directory-sync behavior (`~/.claude/skills/`,
  `~/.omp/agent/skills/`).

### 4.3 `SKILL.md` frontmatter

Rewrite `description` so the decisive structural signal sits inside the
first ~80 chars (the preview window), keyword list second:

```
description: "Auto-start deep reasoning: open-ended questions, competing
approaches, architecture or debugging trade-offs, repeated failed fixes.
Structurally adaptive reasoning (Path A/B), claim-gated verification,
dual-source enforcement. Zero MCP dependencies."
```

(Exact wording finalized at implementation; invariant: the "when" clause —
not the marketing clause — must survive a 90-char cut.)

### 4.4 Tests

- `tests/router-heuristics.test.ts` — unit tests for the scoring function
  and failure counter, extracted as pure functions:
  - positive: "A or B?" / "這兩種寫法怎麼挑" / numbered options → inject
  - negative: single-imperative edit request → no inject
  - idempotent: marker already in messages → no inject
  - failure counter: two error results since last skill load → inject;
    counter resets after skill load
- `tests/sync-local.test.ts` — key computation against a fixture template;
  orphan GC logic against an in-memory sqlite db (`bun:sqlite`).

## 5. Non-Goals

- No changes to `~/.omp/agent/rules/*` (Layer B rejected: redundant under
  Gate A, and those files are overwritten by upstream plugin updates).
- No LLM-based classification — the host has no `smol`/`tiny` role
  configured; any model-call approach fails in this environment.
- No host-level router state machine — omp exposes no `before_turn`/
  `route` hook (verified in `ExtensionAPI` types).

## 6. Known Limitations

A first-turn input that is (a) open-ended, (b) structurally featureless
(flat single sentence, no contrast/options/multi-scope marks), and (c) in a
session with no prior failures will not trigger Gate A. The model may then
answer shallowly with nothing ever failing — so no trigger ever fires.
Mitigation: the full-description soft path improves the model's autonomous
selection odds. True closure requires an upstream pre-turn hook or a
configured `smol`/`judge` role. This is accepted, documented, and strictly
better than today (93-char truncated description, dead DB row, no gate).

## 7. Deployment & Verification

- `bun scripts/sync-local.ts` — syncs files, writes DB under correct key,
  GCs its own orphan rows, deploys extension.
- In-repo: `bun test` covers heuristics + sync logic.
- Out-of-repo (user action): restart an omp session; Gate A verification
  requires observing the injected message in a real turn. A diagnostic
  mode (`OMP_SKILL_ROUTER_DEBUG=1`) logs each context event's scoring
  decision to stderr for the first verification run.

## 8. Risks

- `context` event message shape is inferred from superpowers' usage; the
  debug flag exists to confirm tool-result representation on the real host.
- Extension API drift: if omp changes the hook contract, the extension is a
  single small file — recovery cost is low.
- False-positive injection adds a `read skill://` instruction + potential
  33KB skill load. Conservative thresholds keep this rare; the injected
  text itself instructs the model to skip loading when clearly inapplicable.
