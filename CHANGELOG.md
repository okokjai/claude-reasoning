# Changelog

All notable changes to this skill are documented here.

## [2.1.1] - 2026-09-22

### Added

- **Side-command audit trail** — every `registerClaim` / `verifyClaim` / `registerHypothesis` / `resolveHypothesis` invocation is appended to `state.auditTrail` (in invocation order, with target id and detail) and surfaced in `--status`. Side-commands still exit without touching `thoughtHistory`; the audit trail gives them a persistent, inspectable record without polluting thought semantics.

### Enforced invariants added

- `--claimStatus` of `single_source`, `unverified`, or `not_found` without `--claimNotes` → exit 1. Negative resolutions must carry a recorded caveat, matching the examples already shown in `SKILL.md`.
- `--nextThoughtNeeded false` in `path-b` with fewer than 2 prior thoughts in `thoughtHistory` → exit 1. Path B convergence requires at least one decompose and one synthesis round.
- `--nextThoughtNeeded false` in `path-b` when the immediately preceding thought set `--needsMoreThoughts` → exit 1. Depth expansion cannot be followed by an immediate conclusion without an intervening round.

### Changed

- **`tests/think.test.ts`** — suite grows 20 → 27 tests: caveat enforcement for negative claim resolutions, Path B convergence gates (minimum prior thoughts, `needsMoreThoughts` trailing flag), `--status` audit trail ordering, and one pre-existing test updated to satisfy the new convergence contract.
- **`SKILL.md`** — protocol and flag reference updated: `--claimNotes` is required for negative resolutions; termination gate documents the two new Path B convergence checks; state file documents `auditTrail`.
- **`README.md`** — version 2.1.1; invariant table lists all 13 enforced guards; test count updated to 27.

## [2.1.0] - 2026-09-21

### Added

- **Session modes (`--mode`)** — `path-a` (closed-form) or `path-b` (open-ended) is now **required on the first thought** and immutable for the rest of the session; Step 0 classification is enforced in code, not just prompt-level.
- **Hypothesis lifecycle for Path B** — `--registerHypothesis` (auto-id `hyp-N`, repeatable) and `--resolveHypothesis hyp-N --hypothesisStatus <selected|rejected|synthesized> [--hypothesisNotes "..."]`. `--status` reports `hypotheses` and `pendingHypotheses`.

### Enforced invariants added

- `--mode` missing on first thought → exit 1; conflicting `--mode` after declaration → exit 1.
- `--registerClaim` in `path-a` → exit 1 (Path A forbids external claims).
- `--nextThoughtNeeded false` in `path-a` before thought 3 → exit 1.
- `--nextThoughtNeeded false` in `path-b` with fewer than 2 registered hypotheses, or with any `pending` hypothesis → exit 1.
- Unknown `--hypothesisStatus` → exit 1.

### Changed

- **`tests/think.test.ts`** — suite grows 12 → 20 tests: mode declaration/immutability, Path A minimum-depth rejection, Path A claim prohibition, hypothesis registration/resolution, Path B pending-hypothesis termination rejection.
- **`references/example-path-b-verify.md`** — updated to demonstrate `--mode path-b`, `--registerHypothesis`, and `--resolveHypothesis` before termination.
- **`README.md`** — version 2.1.0; usage section covers `--mode`, hypothesis lifecycle; invariants table lists all 10 enforced guards.

## [2.0.1] - 2026-09-21

### Added

- **Dev tooling** — `tsconfig.json` (bun defaults, strict) and devDependencies `typescript@5`, `@types/node`, `@types/bun`; `bunx tsc --noEmit` typechecks clean, enabling LSP type intelligence over `scripts/` and `tests/`.

### Fixed

- **`scripts/think.ts` Guardrail 1** — `--claimStatus verified` now enforces root-domain independence in addition to source count. Two `--claimSource` URLs sharing the same root domain (e.g. `docs.aws.amazon.com` + `aws.amazon.com`) are rejected with exit 1, aligning code with the documented dual-source contract in `SKILL.md` and Gate 2 of `references/hallucination-gates.md`.
- **`tests/think.test.ts`** — suite grows 11 → 12 tests; added regression test "rejects verified when 2 sources share the same root domain".

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
