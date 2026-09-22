# claude-reasoning 2.1.3

A Claude Code skill for **structurally adaptive reasoning** with **claim-gated external verification**. No MCP server required.

## What it does

- **Step 0 — Structural classifier.** Routes by the *structure* of the question (closed-form vs open-ended), never by topic keywords. `--mode` is **required on the first thought** and immutable for the rest of the session.
- **Path A — closed-form.** 3–5 thoughts: restate and surface hidden definitions → derive → cross-validate with an independent method → stop. No claims, no external search, no padding. Termination before 3 thoughts is rejected.
- **Path B — open-ended.** Decompose → ≥2 competing hypotheses (registered via `--registerHypothesis`, resolved via `--resolveHypothesis`) → 2–4 critical lenses chosen for the task → converge at the first round with no new insight. Termination is rejected while fewer than 2 hypotheses exist, any remains `pending`, fewer than 2 thoughts precede the concluding thought, or the previous thought flagged `--needsMoreThoughts`.
- **External verification module.** Fires only when a Path B argument depends on a real-world factual claim. Enforces pre-registration before search, ≥2 independent sources for `verified`, explicit `single_source` / `unverified` / `not_found` outcomes, and blocks termination while any claim is unresolved.
- **Zero MCP.** A single TypeScript state machine (`scripts/think.ts`) persisting to `scripts/.think_state.json`.
- **Integrated High-Value References (ported & cleaned from 1.2.0):**
  - `references/source-tiers.md`: 4-tier credibility hierarchy (Tier 1 Primary to Tier 4 AI Summaries) with 2-source corroboration rule.
  - `references/critical-lenses.md`: 12 critical red-team evaluation perspectives (First Principles, Red-Team Attack, Edge Case, Pareto, etc.).
  - `references/hallucination-gates.md`: 5 P0 semantic anti-hallucination gates (Verifier Separation, Entity Check, Honest Tool Absence).
  - `references/conclusion-card.md`: Standardized conclusion card with 5 calibrated confidence levels (`Confirmed`, `Probable`, `Plausible`, `Unverified`, `Contested`).

## Install

Requires [Bun](https://bun.sh) (tested on 1.4.2) or Node.js ≥ 18 with `npx tsx`.

```bash
cp -r claude-reasoning-* ~/.claude/skills/claude-reasoning
```

Or use the skill directly from this directory.

## Dev tooling

```bash
bun install   # installs devDependencies: typescript, @types/node, @types/bun
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

# Register ≥2 competing hypotheses (required before Path B termination)
bun scripts/think.ts --registerHypothesis "Direct API is superior for developer agility"
bun scripts/think.ts --registerHypothesis "Managed service is superior for enterprise governance"

# Pre-register a claim BEFORE searching
bun scripts/think.ts --registerClaim "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet"
bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
  --claimSource "https://aws.amazon.com/bedrock/pricing/" \
  --claimSource "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"

# Resolve hypotheses before concluding
bun scripts/think.ts --resolveHypothesis hyp-1 --hypothesisStatus selected
bun scripts/think.ts --resolveHypothesis hyp-2 --hypothesisStatus rejected

# Synthesize at least one more round (Path B requires ≥ 2 prior thoughts; a
# --needsMoreThoughts flag on the last thought blocks termination too)
bun scripts/think.ts --thought "Critique + verify against lenses" --thoughtNumber 2 --totalThoughts 5 --nextThoughtNeeded true

# Conclude
bun scripts/think.ts --thought "Synthesize into Conclusion Card" --thoughtNumber 5 --totalThoughts 5 --nextThoughtNeeded false

# Inspect state
bun scripts/think.ts --status
```

See [`SKILL.md`](SKILL.md) for the full protocol and flag reference.

## Enforced invariants

These are checked in code, not just documented:

| Invariant | Behavior on violation |
|---|---|
| `--mode` required on the first thought; immutable thereafter | Exit code 1 |
| `--registerClaim` while session mode is `path-a` | Exit code 1 — Path A forbids external claims |
| `--nextThoughtNeeded false` in `path-a` before thought 3 | Exit code 1 — Path A requires ≥ 3 thoughts |
| `--nextThoughtNeeded false` in `path-b` with fewer than 2 registered hypotheses | Exit code 1 |
| `--nextThoughtNeeded false` in `path-b` with any `pending` hypothesis | Exit code 1, lists the pending hypothesis ids |
| `--nextThoughtNeeded false` in `path-b` with fewer than 2 prior thoughts | Exit code 1 — Path B requires ≥ 1 decompose + ≥ 1 synthesis round |
| `--nextThoughtNeeded false` in `path-b` when the previous thought set `--needsMoreThoughts` | Exit code 1 — cannot flag depth expansion then conclude immediately |
| `--claimStatus verified` requires ≥ 2 `--claimSource` values from distinct root domains | Exit code 1, error names the shortfall |
| `--claimStatus` of `single_source` / `unverified` / `not_found` without `--claimNotes` | Exit code 1 — negative resolutions require a recorded caveat |
| `--nextThoughtNeeded false` with any `pending` claim | Exit code 1, lists the pending claim ids |
| `--isRevision` without `--revisesThought` | Exit code 1 |
| `--branchFromThought` without `--branchId` | Exit code 1 |
| Unknown `--claimStatus` or `--hypothesisStatus` value | Exit code 1 |

## Tests

```bash
bun test
```

27 tests, offline, no network calls, no API keys. Covers the thinking loop (submit / revise / branch), mode declaration and immutability, Path A minimum-depth and claim prohibition, Path B hypothesis lifecycle and convergence gates, claim lifecycle and pre-registration, all guardrails above (including distinct-root-domain rejection for `verified` and `--claimNotes` enforcement for negative resolutions), the `--status` audit trail for side-commands, and two end-to-end scenarios: a closed-form kinship logic trap (3 thoughts, 0 claims) and an open-ended architecture decision with pre-registration, mixed verification outcomes, and a blocked premature termination.

## Design notes

- **Adaptive depth, not fixed frameworks.** Earlier attempts to run closed-form logic through a fixed multi-node framework produced trail entries with zero captured insight. Here, depth is earned by disagreement (Path A) or by novel insight (Path B).
- **Structural classification, not keyword routing.** Topic-based routers misroute pure logic puzzles into "decision matrix" modes. This skill decides on the shape of the question.
- **No pseudo-quantitative scoring.** Output is prose and concrete facts. No "confidence 8/10", no severity stars.
- **Honest scope.** This README describes the state machine and the test suite as they exist. There is no benchmark or eval score for this skill.

## Attribution

`scripts/think.ts` is derived from [thedotmack/sequential-thinking-skill](https://github.com/thedotmack/sequential-thinking-skill) (MIT License, Copyright © 2026 thedotmack), with the claim registry, verification guardrails, and termination gate added. See [`LICENSE`](LICENSE).

## License

MIT
