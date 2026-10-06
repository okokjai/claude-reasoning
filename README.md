# claude-reasoning 3.0.9

[![GitHub Stars](https://img.shields.io/github/stars/okokjai/claude-reasoning?style=flat-square&logo=github)](https://github.com/okokjai/claude-reasoning/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Latest Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning?style=flat-square)](https://github.com/okokjai/claude-reasoning/releases/latest)
[![CI Status](https://img.shields.io/github/actions/workflow/status/okokjai/claude-reasoning/ci.yml?branch=master&style=flat-square&logo=githubactions&logoColor=white)](https://github.com/okokjai/claude-reasoning/actions)
[![Last Commit](https://img.shields.io/github/last-commit/okokjai/claude-reasoning?style=flat-square)](https://github.com/okokjai/claude-reasoning/commits/master)
[![skills.sh](https://img.shields.io/badge/skills.sh-claude--reasoning-brightgreen?style=flat-square)](https://skills.sh)

A Claude Code skill for **structurally adaptive reasoning** with **claim-gated external verification**. No MCP server required.

## What it does

- **Step 0 — Structural classifier.** Routes by the *structure* of the question (closed-form vs open-ended), never by topic keywords. `--mode` is **required on the first thought** and immutable for the rest of the session.
- **Path A — closed-form.** 3–5 thoughts: restate and surface hidden definitions → derive → cross-validate with an independent method → stop. No claims, no external search, no padding. Termination before 3 thoughts is rejected; depth beyond 5 is rejected. Claims and hypotheses are forbidden in Path A.
- **Path B — open-ended.** Decompose → ≥2 competing hypotheses (registered via `--registerHypothesis` with a required `--falsification` clause, resolved via `--resolveHypothesis` with `--hypothesisNotes` and `--falsificationResult`) → 2–4 critical lenses chosen for the task, recorded via `--recordLens --lens … --finding …` → converge at the first round with no new insight. Termination is rejected while fewer than 2 hypotheses exist, any remains `pending`, fewer than 2 thoughts precede the concluding thought, the previous thought flagged `--needsMoreThoughts`, merges leave fewer than 2 distinct surviving hypotheses, **every resolved hypothesis is `rejected`** (at least one must be `selected` or `synthesized`), or any of gates 6–11 fails (unchecked acceptance criteria, an unmet criterion without revision or `--newInsightNotes`, fewer than 2 distinct lens names, no convergence declaration with history lacking a revision/branch, a resolved non-merged hypothesis without `falsificationResult`, or a branch opened with no main-line thought after it).
- **External verification module.** Fires only when a Path B argument depends on a real-world factual claim. Enforces pre-registration before search (with a required `--supports <hyp-id>` link, and optional `--polarity supports|refutes` to record whether evidence confirms or refutes the hypothesis; refuting claims yield `Linked-refuted` in export), ≥2 independent sources for `verified` classified by `--claimTier` against `references/source-tiers.md` (at least two from Tier 1/2), plus a recorded `--claimQuote`, `--negativeQuery`, and `--negativeFinding`, per-source publication dates via `--claimDate` (aligned to `--claimSource`; the lint warns when a verified claim's newest date is >180 days old), explicit `single_source` / `unverified` / `not_found` outcomes, and blocks termination while any claim is unresolved.
- **Tier shape validation on every status.** A `--claimTier` supplied with any `--claimStatus` must be an integer 1–4 and one per `--claimSource`; a non-conforming vector exits 1 rather than persisting `NaN`/out-of-range tiers on a `single_source`, `unverified`, or `not_found` claim.
- **Session clock & reasoning trace.** Every session is stamped (`startedAt`/`endedAt`) with a `today()` local calendar date exposed via `--status`. `--export` (and termination) prints a `buildLintReport` fact sheet led by a `Session Clock` line and, when a hypothesis/lens/criterion exists, a `## Reasoning Trace` section of machine-derived tables (hypotheses with their falsification outcomes, lens findings, criteria). The fact sheet also carries CRIT residuals an active gate should have blocked, WARN entries (missing rationale, disabled gates, thin lens coverage, stale source dates), INFO escape surfaces, acceptance-criterion status, lens findings, and the block-quoted final thought — headed by the standing warning that this is the script's view of state, not the final answer.
- **Zero MCP.** A single TypeScript state machine (`scripts/think.ts`) persisting to `scripts/.think_state.json`.
- **Integrated High-Value References (ported & cleaned from 1.2.0):**
  - `references/source-tiers.md`: 4-tier credibility hierarchy (Tier 1 Primary to Tier 4 AI Summaries) with 2-source corroboration rule.
  - `references/critical-lenses.md`: 12 critical red-team evaluation perspectives (First Principles, Red-Team Attack, Edge Case, Pareto, etc.).
  - `references/hallucination-gates.md`: 5 P0 semantic anti-hallucination gates (Verifier Separation, Entity Check, Honest Tool Absence).
  - `references/conclusion-card.md`: conclusion-first card with 5 calibrated confidence labels (`Confirmed`, `Probable`, `Plausible`, `Unverified`, `Contested`), a findings table with per-source dates, and a mandatory verbatim-pasted Reasoning Trace.

## Install

Requires [Bun](https://bun.sh) (tested on 1.4.2) or Node.js ≥ 18 with `npx tsx`.

```bash
cp -r claude-reasoning-* ~/.claude/skills/claude-reasoning
```

Or use the skill directly from this directory.

### Update an existing install

If installed via git, pull updates directly into the skills directory:

```bash
cd ~/.claude/skills/claude-reasoning
git pull
```

## Dev tooling

```bash
bun install    # devDependencies: typescript, @types/node, @types/bun
bun run typecheck   # tsc --noEmit
```

`tsconfig.json` (bun defaults, strict) gives editors/tsserver the project root for LSP type intelligence; `bunx tsc --noEmit` typechecks clean.

## Usage

```bash
cd claude-reasoning-*

# Start a session
bun scripts/think.ts --reset

# Path A: declare --mode path-a on the first thought; termination before 3 thoughts is rejected
bun scripts/think.ts --mode path-a --thought "Restate + implicit definitions" --thoughtNumber 1 --totalThoughts 3 --nextThoughtNeeded true
bun scripts/think.ts --thought "Primary derivation"             --thoughtNumber 2 --totalThoughts 3 --nextThoughtNeeded true
bun scripts/think.ts --thought "Independent cross-validation"   --thoughtNumber 3 --totalThoughts 3 --nextThoughtNeeded false

# Path B: declare --mode path-b on the first thought
bun scripts/think.ts --mode path-b --thought "Deconstruct open-ended problem" --thoughtNumber 1 --totalThoughts 5 --nextThoughtNeeded true

# Register ≥2 competing hypotheses with a falsification clause (required before Path B termination)
bun scripts/think.ts --registerHypothesis "Direct API is superior for developer agility" \
  --falsification "Managed-service egress costs stay under $100/mo at our volume"
bun scripts/think.ts --registerHypothesis "Managed service is superior for enterprise governance" \
  --falsification "Direct API passes the SOC 2 evidence audit without added controls"

# Acceptance criteria and lenses (Path B termination gates 6 and 8)
bun scripts/think.ts --addCriterion "Cost delta backed by two independent sources"
bun scripts/think.ts --checkCriterion crit-1 --met true
bun scripts/think.ts --recordLens --lens "first-principles" --finding "egress is 40% of the delta"

# Pre-register a claim BEFORE searching — --supports links it to a hypothesis
bun scripts/think.ts --registerClaim "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet" --supports hyp-1
bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
  --claimSource "https://aws.amazon.com/bedrock/pricing/" \
  --claimSource "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" \
  --claimTier 1 --claimTier 1 \
  --claimQuote "Prompt caching is supported on Amazon Bedrock" \
  --negativeQuery "bedrock prompt caching unsupported regions" \
  --negativeFinding "None found; docs confirm support in all commercial regions."

# Resolve hypotheses before concluding — terminal statuses need notes + falsificationResult
bun scripts/think.ts --resolveHypothesis hyp-1 --hypothesisStatus selected \
  --hypothesisNotes "latency + feature parity" --falsificationResult broken
bun scripts/think.ts --resolveHypothesis hyp-2 --hypothesisStatus rejected \
  --hypothesisNotes "governance edge does not offset lock-in" --falsificationResult held

# If two hypotheses turn out to be the same mechanism viewed differently,
# merge rather than forcing one to "win" — requires --mergedInto + --hypothesisNotes
bun scripts/think.ts --resolveHypothesis hyp-3 --hypothesisStatus merged --mergedInto hyp-1 \
  --hypothesisNotes "same mechanism as hyp-1, different framing"

# Synthesize at least one more round (Path B requires ≥ 2 prior thoughts; a
# --needsMoreThoughts flag on the last thought blocks termination too)
bun scripts/think.ts --thought "Critique + verify against lenses" --thoughtNumber 2 --totalThoughts 5 --nextThoughtNeeded true

# Conclude — declare convergence; termination gates 6-11 are checked here
# (THINK_GATES_OFF=criteria,lenses disables individual gates for ablation)
bun scripts/think.ts --thought "Synthesize into Conclusion Card" --thoughtNumber 5 --totalThoughts 5 \
  --nextThoughtNeeded false --newInsight false --newInsightNotes "first synthesis round surfaced no new insight"

# Inspect state
bun scripts/think.ts --status

# Emit a markdown fact sheet (also auto-printed on session termination)
# Must run alone — combined with any other flag it exits 1
bun scripts/think.ts --export
```

See [`SKILL.md`](SKILL.md) for the full protocol and flag reference.

## Enforced invariants

These are checked in code, not just documented:

| Invariant | Behavior on violation |
|---|---|
| `--mode` required on the first thought; immutable thereafter | Exit code 1 |
| `--registerClaim`, `--verifyClaim`, `--registerHypothesis`, or `--resolveHypothesis` while session mode is `path-a` | Exit code 1 — Path A forbids claims and hypotheses |
| Claims or hypotheses registered before the first thought established `--mode` | Exit code 1 — mode must exist first |
| Submitting a 6th thought in `path-a` | Exit code 1 — Path A depth is capped at 5 |
| `--nextThoughtNeeded false` in `path-a` before thought 3 | Exit code 1 — Path A requires ≥ 3 thoughts |
| `--nextThoughtNeeded false` in `path-b` with fewer than 2 registered hypotheses | Exit code 1 |
| `--nextThoughtNeeded false` in `path-b` with any `pending` hypothesis | Exit code 1, lists the pending hypothesis ids |
| `--nextThoughtNeeded false` in `path-b` with fewer than 2 prior thoughts | Exit code 1 — Path B requires ≥ 1 decompose + ≥ 1 synthesis round |
| `--nextThoughtNeeded false` in `path-b` when the previous thought set `--needsMoreThoughts` | Exit code 1 — cannot flag depth expansion then conclude immediately |
| `--claimStatus verified` requires ≥ 2 `--claimSource` values from distinct root domains (IP-safe, multi-segment-suffix-aware, trailing root dot normalised) | Exit code 1, error names the shortfall |
| `--claimStatus verified` requires `--claimTier <1-4>` for every `--claimSource` (positionally aligned) and ≥ 2 sources at Tier 1/2 | Exit code 1 — multiple Tier 3/4 sources cannot elevate a claim to `verified` (`references/source-tiers.md`) |
| `--claimStatus` of any value other than `verified` on a `verified` claim | Exit code 1 — verified claims are final |
| `--claimStatus` of `single_source` / `unverified` / `not_found` without `--claimNotes` | Exit code 1 — negative resolutions require a recorded caveat |
| `--hypothesisStatus merged` without `--mergedInto` | Exit code 1 |
| `--mergedInto` referencing the hypothesis being resolved or a nonexistent id | Exit code 1 |
| `--mergedInto` referencing an already-merged hypothesis (merge chain) | Exit code 1 |
| `--hypothesisStatus merged` on a hypothesis that already absorbs a merge (two-hop chain) | Exit code 1 |
| `--resolveHypothesis` to `rejected`/`pending` on a survivor that still absorbs a merged member | Exit code 1 — re-point the member's `mergedInto` first |
| `--mergedInto` passed with `--hypothesisStatus` other than `merged` | Exit code 1 |
| `--falsificationResult` passed with `--hypothesisStatus merged` | Exit code 1 — a merge is documented by `--mergedInto` alone; the survivor keeps the falsification outcome |
| `--resolveHypothesis` re-resolving a node to a non-`merged` status | Clears stale `mergedInto`/`notes`/`falsificationResult` — a node only carries the fields its current resolution wrote |
| `--resolveHypothesis` to `merged` on a node that already resolved | Clears stale `falsificationResult` — the absorbed node has no falsification outcome of its own |
| `--verifyClaim` re-verifying a claim back to `pending` | Clears resolution-scoped `tiers`/`claimDates`/`notes`/`quote`/`negativeQuery`/`negativeFinding` — a pending claim carries no verification outcome (recorded `sources` are kept, since re-verification reuses them) |
| `--nextThoughtNeeded false` in `path-b` when merges leave fewer than 2 distinct hypotheses | Exit code 1 — Path B requires ≥ 2 distinct hypotheses after merges |
| `--nextThoughtNeeded false` with any `pending` claim | Exit code 1, lists the pending claim ids |
| `--registerHypothesis` without a non-empty `--falsification` | Exit code 1 — a hypothesis without a falsification clause cannot be tested |
| `--resolveHypothesis` to `selected` / `rejected` / `synthesized` without `--hypothesisNotes` or without `--falsificationResult` | Exit code 1 — terminal resolutions carry the falsification audit trail (`merged` is exempt: the surviving hypothesis keeps its own) |
| `--registerClaim` without `--supports <hyp-id>`, or with a nonexistent target | Exit code 1 |
| `--claimStatus verified` without `--claimQuote`, `--negativeQuery`, or `--negativeFinding` | Exit code 1 — verified claims record verbatim evidence and the counter-evidence search |
| `--claimStatus verified` without `--claimTier`, with a tier outside 1-4, or with a tier count ≠ source count | Exit code 1 |
| `--claimDate` not `YYYY-MM-DD`, later than the session's `today`, or a count ≠ `--claimSource` count | Exit code 1 — dates must be real, non-future, and positionally aligned with the sources |
| `--checkCriterion` with an unknown id, or without `--met true`/`--met false` | Exit code 1 |
| `--recordLens` without `--lens` or without `--finding` | Exit code 1 |
| `--newInsight` set to anything other than `false` | Exit code 1 — `true` would duplicate `--nextThoughtNeeded` and silently skip the convergence gate |
| `--nextThoughtNeeded false` in `path-b` failing termination gate 6 (≥ 1 acceptance criterion, all checked), 7 (unmet criterion without later revision or `--newInsightNotes`), 8 (< 2 distinct lens names), 9 (no `--newInsight false` with non-empty notes and no revision/branch in history), 10 (resolved non-merged hypothesis without `falsificationResult`), or 11 (a branch opened with no main-line thought after it) | Exit code 1 — gates 6–11 are switchable via `THINK_GATES_OFF` (names or `all`); a disabled gate's violation surfaces as `[WARN]` in the lint report instead |
| Side-commands (`--addCriterion` / `--checkCriterion` / `--recordLens` included) submitted after the session terminated | Exit code 1 — terminated sessions are immutable; `--reset` starts a new one |
| `--isRevision` without `--revisesThought` | Exit code 1 |
| `--isRevision` together with `--branchFromThought` | Exit code 1 — mutually exclusive |
| `--revisesThought` referencing a nonexistent thought | Exit code 1 |
| A non-revision `--thoughtNumber` that already exists in history, or that does not exceed every prior non-revision number | Exit code 1 — revisions are exempt: a revision reuses the number it revises and keeps its timeline position in `historyIndex` |
| `--branchFromThought` without `--branchId` | Exit code 1 |
| `--branchFromThought` referencing a nonexistent thought | Exit code 1 |
| `--mergedInto` referencing an already-rejected hypothesis | Exit code 1 |
| `--reset` combined with any other operation | Exit code 1 |
| Malformed or unparseable URL in `--claimSource` | Exit code 1 |
| Missing `--thought`, `--thoughtNumber`, `--totalThoughts`, or `--nextThoughtNeeded` on a thought submission | Exit code 1, specifies the missing flag |
| `--nextThoughtNeeded` not literally `true`/`false` (e.g. `ture`, `yes`, `1`) | Exit code 1 — any other value would silently terminate the session |
| A thought or side-command (`--registerClaim` / `--verifyClaim` / `--registerHypothesis` / `--resolveHypothesis` / `--addCriterion` / `--checkCriterion` / `--recordLens`) submitted after the session terminated (last recorded thought had `--nextThoughtNeeded false`) | Exit code 1 — terminated sessions are immutable; `--reset` starts a new one |
| `scripts/.think_state.json` corrupt or not valid JSON | Not fatal: warns on stderr, renames the file to `.think_state.json.bak`, starts a fresh session |
| `--export` combined with any other flag | Exit code 1 — must run alone |
| Empty `--thought` string (`""`) | Exit code 1 — `--thought cannot be empty` |
| `--revisesThought` or `--branchFromThought` not a positive safe integer | Exit code 1 |
| Referencing a claim or hypothesis id not present in state | Exit code 1, names the missing target |
| Unknown `--claimStatus` or `--hypothesisStatus` value | Exit code 1 |
| Malformed CLI flags or numeric arguments with scientific, hex, or decimal notation | Exit code 1, clean error message |

## State file

The session clock is stamped by the script: `startedAt` on the first thought, `endedAt` at termination, and a `today()` helper emitting the local calendar date (`YYYY-MM-DD`) exposed as `today` in `--status` / `--reset`. Source publication dates are recorded per claim as `claimDates[]` (aligned to `sources[]`); the lint report warns when a verified claim's newest date is more than 180 days before `today`.

`scripts/.think_state.json` is schema **`v3`**. `ThoughtData` carries `historyIndex` — the 1-based position in the *timeline*, distinct from the caller-supplied `thoughtNumber` (a revision re-enters history without renumbering it). `AcceptanceCriterion` carries `checkedAtHistoryIndex`, the timeline position at which it was last checked. Any file whose `schemaVersion` differs from the current `SCHEMA_VERSION` (v1 or v2) is migrated automatically on load and written back in the current form. Tools reading the file directly should key on `historyIndex`, not `thoughtNumber`.

## Tests

```bash
bun run typecheck && bun test
```
Tests live in `tests/` — offline, no network calls, no API keys. Each suite pins `THINK_STATE_FILE` to a per-process path so concurrent `bun test` invocations cannot share a state file. Covers the thinking loop (submit / revise / branch), terminated-session immutability, corrupt-state backup, mode declaration and immutability, Path A minimum-depth, maximum-depth cap (5), and side-command prohibitions (claims, hypotheses, acceptance criteria, and lens records), Path B hypothesis lifecycle and convergence gates (including the all-rejected termination block, merge-chain and stale-survivor handling), the `--thought` standalone-mode guard, and the v3.0.8 surfaces (session clock, `--claimDate` alignment/freshness, reasoning-trace tables, `escapeCell` escaping). `bun test` runs the comprehensive regression suite across 11 files.

## Design notes

- **Adaptive depth, not fixed frameworks.** Earlier attempts to run closed-form logic through a fixed multi-node framework produced trail entries with zero captured insight. Here, depth is earned by disagreement (Path A) or by novel insight (Path B).
- **Structural classification, not keyword routing.** Topic-based routers misroute pure logic puzzles into "decision matrix" modes. This skill decides on the shape of the question.
- **No pseudo-quantitative scoring.** Output is prose and concrete facts. No "confidence 8/10", no severity stars.
- **Honest scope.** This README describes the state machine and the test suite as they exist. There is no benchmark or eval score for this skill.

## Attribution

`scripts/think.ts` is derived from [thedotmack/sequential-thinking-skill](https://github.com/thedotmack/sequential-thinking-skill) (MIT License, Copyright © 2026 thedotmack), with the claim registry, verification guardrails, and termination gate added. See [`LICENSE`](LICENSE).

## License

MIT
