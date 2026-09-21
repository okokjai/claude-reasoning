# Changelog

All notable changes to this skill are documented here.

## [2.0.0] - 2026-09-21

### Added

- **`scripts/think.ts`** — TypeScript state machine, zero MCP dependencies, persistent state in `scripts/.think_state.json`.
  - Claim lifecycle: `--registerClaim`, `--verifyClaim`, `--claimStatus`, `--claimSource` (repeatable), `--claimNotes`.
  - `--status` now reports `claims` and `pendingClaims`.
- **`SKILL.md`** — Step 0 structural classifier (closed-form vs open-ended, structural not keyword-based), Path A contract (3–5 thoughts, independent cross-validation, claims prohibited), Path B contract (decomposition, ≥2 competing hypotheses, 2–4 adaptive critical lenses, convergence by marginal insight), external verification contract, negative search queries, CLI reference, ground rules.
- **`references/source-tiers.md`** — Ported from 1.2.0 A4 contract: Tier 1 to Tier 4 hierarchy, independence rules, no syndication duplicates.
- **`references/critical-lenses.md`** — Ported from 1.2.0 Stage 5: 12 adaptive red-team lenses (First Principles, Red-Team Attack, Edge Case, Pareto Frontier, etc.).
- **`references/hallucination-gates.md`** — Ported from 1.2.0 Stage 5.5: 5 P0 semantic gates (Verifier Separation, Entity Check, Temporal Drift, Reverse Search, Tool Absence Reporting).
- **`references/conclusion-card.md`** — Ported from 1.2.0 Stage 6: Standardized Conclusion Card with 5 confidence levels (`Confirmed`, `Probable`, `Plausible`, `Unverified`, `Contested`).
- **`references/example-path-a.md`** — worked closed-form kinship logic trap: 3 thoughts, 0 claims.
- **`references/example-path-b-verify.md`** — worked open-ended architecture decision: pre-registration, negative search, source tier attribution, mixed verification outcomes, and Conclusion Card delivery.
- **`tests/think.test.ts`** — 11 tests: thinking loop, revision/branching, claim lifecycle, both guardrails, and 2 end-to-end scenarios.

### Enforced invariants (code-level, not advisory)

- `--claimStatus verified` requires ≥ 2 `--claimSource` values; otherwise exit 1.
- `--nextThoughtNeeded false` is rejected while any claim remains `pending`; error lists pending claim ids.
- `--isRevision` requires `--revisesThought`; `--branchFromThought` requires `--branchId`; unknown `--claimStatus` rejected.

### Changed from claude-reasoning 1.2.0

- **Removed the `sequential-thinking` MCP server dependency.** Reasoning state is now a self-contained Bun/TypeScript script; no MCP process, no `claude_desktop_config.json` edits.
- **Removed fixed round counts.** Path A is bounded at 3–5 thoughts and terminates on independent agreement; Path B terminates on the first round producing no new insight.
- **Replaced domain/keyword routing with structural classification.**
- **Removed fixed 11-node contract pipeline** in favor of two structural paths with a conditionally triggered verification module.

### Attribution

`scripts/think.ts` is derived from [thedotmack/sequential-thinking-skill](https://github.com/thedotmack/sequential-thinking-skill) (MIT, © 2026 thedotmack). Upstream provided the sequential-thought state machine, revision, branching, and depth adjustment; v2.0.0 adds the claim registry, dual-source guardrail, termination gate, and pending-claim reporting.
