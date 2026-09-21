# claude-reasoning 2.0.0

A Claude Code skill for **structurally adaptive reasoning** with **claim-gated external verification**. No MCP server required.

## What it does

- **Step 0 — Structural classifier.** Routes by the *structure* of the question (closed-form vs open-ended), never by topic keywords.
- **Path A — closed-form.** 3–5 thoughts: restate and surface hidden definitions → derive → cross-validate with an independent method → stop. No claims, no external search, no padding.
- **Path B — open-ended.** Decompose → ≥2 competing hypotheses → 2–4 critical lenses chosen for the task → converge at the first round with no new insight.
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
cp -r claude-reasoning-2.0.0 ~/.claude/skills/claude-reasoning
```

Or use the skill directly from this directory.

## Usage

```bash
cd claude-reasoning-2.0.0

# Start a session
bun scripts/think.ts --reset

# Path A: three thoughts, then terminate
bun scripts/think.ts --thought "Restate + implicit definitions" --thoughtNumber 1 --totalThoughts 3 --nextThoughtNeeded true
bun scripts/think.ts --thought "Primary derivation"             --thoughtNumber 2 --totalThoughts 3 --nextThoughtNeeded true
bun scripts/think.ts --thought "Independent cross-validation"   --thoughtNumber 3 --totalThoughts 3 --nextThoughtNeeded false

# Path B: pre-register a claim BEFORE searching
bun scripts/think.ts --registerClaim "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet"
bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
  --claimSource "https://aws.amazon.com/bedrock/pricing/" \
  --claimSource "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"

# Inspect state
bun scripts/think.ts --status
```

See [`SKILL.md`](SKILL.md) for the full protocol and flag reference.

## Enforced invariants

These are checked in code, not just documented:

| Invariant | Behavior on violation |
|---|---|
| `--claimStatus verified` requires ≥ 2 `--claimSource` values | Exit code 1, error names the shortfall |
| `--nextThoughtNeeded false` with any `pending` claim | Exit code 1, lists the pending claim ids |
| `--isRevision` without `--revisesThought` | Exit code 1 |
| `--branchFromThought` without `--branchId` | Exit code 1 |
| Unknown `--claimStatus` value | Exit code 1 |

## Tests

```bash
bun test
```

11 tests, offline, no network calls, no API keys. Covers the thinking loop (submit / revise / branch), claim lifecycle and pre-registration, both guardrails above, and two end-to-end scenarios: a closed-form kinship logic trap (3 thoughts, 0 claims) and an open-ended architecture decision with pre-registration, mixed verification outcomes, and a blocked premature termination.

## Design notes

- **Adaptive depth, not fixed frameworks.** Earlier attempts to run closed-form logic through a fixed multi-node framework produced trail entries with zero captured insight. Here, depth is earned by disagreement (Path A) or by novel insight (Path B).
- **Structural classification, not keyword routing.** Topic-based routers misroute pure logic puzzles into "decision matrix" modes. This skill decides on the shape of the question.
- **No pseudo-quantitative scoring.** Output is prose and concrete facts. No "confidence 8/10", no severity stars.
- **Honest scope.** This README describes the state machine and the test suite as they exist. There is no benchmark or eval score for this skill.

## Attribution

`scripts/think.ts` is derived from [thedotmack/sequential-thinking-skill](https://github.com/thedotmack/sequential-thinking-skill) (MIT License, Copyright © 2026 thedotmack), with the claim registry, verification guardrails, and termination gate added. See [`LICENSE`](LICENSE).

## License

MIT
