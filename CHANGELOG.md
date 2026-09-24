# Changelog

All notable changes to this skill are documented here.

## [Unreleased]

**Breaking Changes: None.**

### Fixed

- **`bun.lock` registry** — rewrote all 5 resolved package URLs from `registry.npmmirror.com` to `registry.npmjs.org` (same versions, same integrity hashes). Installers in networks without access to the CN mirror can now `bun install --frozen-lockfile` successfully.
- **Root-domain heuristic documented** — `--claimStatus verified` computes root domains from the hostname's last two labels (a conservative heuristic). Documented the boundary at `SKILL.md` Contract step 3, `README.md` invariant row, and `references/source-tiers.md` Dual-Source Independence Test: distinct second-level ccTLD registrations (`.co.uk`, `.com.au`) are treated as one root and rejected — a conservative over-rejection, never an unsafe under-rejection. New regression test locks the behavior (`treats two *.co.uk sources as one root domain`).
- **`SKILL.md` state-file paragraph** — now enumerates `mode` and `hypotheses keyed by hypothesis id` alongside `thoughtHistory` / `branches` / `claims` / `auditTrail`, and notes that `bun test` leaves a gitignored `.think_state.json` in the work tree. New docs-consistency test locks the enumeration. Suite 60 → 62.

### Added

- **PreToolUse reasoning gate** — `.claude/settings.json` + `.claude/hooks/reasoning-gate.mjs`: a hard enforcement hook for Claude Code sessions that blocks `Edit` / `Write` / mutating `Bash` until `scripts/.think_state.json` converges (`nextThoughtNeeded=false`). Previously the "read SKILL.md first" discipline was prompt text only (CLAUDE.md router, `<skills>` block, 35 in-script `fail()` checks) — none of it physically enforced. The hook intercepts at the only point a runtime can block a tool call before execution. Exempts the `think.ts` invocation, state-file writes, `.claude/` self-edits, and read-only commands. 10 new tests (`tests/reasoning-gate.test.ts`); suite 50 → 60.
- **Gate review fixes (G1–G5)** — `reasoning-gate.mjs` and `.claude/settings.json` brought in line with the official Claude Code PreToolUse contract and hardened:
  - G1: deny decision now emitted as `hookSpecificOutput.permissionDecision: "deny"` + `hookEventName: "PreToolUse"` + `permissionDecisionReason` (top-level `decision: "block"` is deprecated for PreToolUse; a schema-invalid response is a non-blocking error and the action proceeds — the previous shape was a no-op). README hard-enforcement paragraph synced to the same wording (it still quoted the deprecated shape; `git` exemption narrowed to `git status, git diff`).
  - G2: the `think.ts` exemption now applies only to a single un-chained invocation (`think.ts … && rm -rf .` is denied).
  - G3: hook command uses portable `${CLAUDE_PROJECT_DIR}/…` instead of a hardcoded drive path.
  - G4: project-level scope documented in README (gate registers only when the session root is this repo).
  - G5: mutation heuristic extended (`touch`, `mkdir`, `curl -o`, `git reset --hard`/`checkout --`/`clean`, installs, `tar -`/`unzip`, Windows `del`/`copy`/`move`/`ren`/`xcopy`) and its conservative boundary documented. Gate tests 10 → 12; plus one README gate-wording lock in `think.test.ts`; suite 62 → 65.

### Fixed

- **`--status` response** — added the missing `hypothesisDetails` field (`state.hypotheses`), symmetric with `branchDetails`/`claimDetails`. The response exposed claim and branch registries but omitted the hypothesis registry. New test (`exposes hypothesisDetails in --status alongside claimDetails`) covers the contract. Also synced the `SKILL.md` `--status` example comment (`# Inspect full state (thoughts, branches, hypotheses, claims)`).

## [2.1.5] - 2026-09-25

### Fixed — documentation accuracy (no code behavior changes)

- **`SKILL.md` Examples index** — corrected the `example-path-a.md` thought count from `4 thoughts` to `3 thoughts`. The example passes `--totalThoughts 4` as the upper bound but converges in 3 thoughts by setting `--nextThoughtNeeded false` on Thought 3 (the bound is the max allowed, not the count executed).
- **`SKILL.md` Path A rationale** — removed an unbacked quantitative claim (`measured: ... produced 6 of 6 trail entries with zero captured insight` referencing a `fixed 11-node framework`). No benchmark data exists in the repo; the claim violated the skill's own Ground Rules 1 (no pseudo-quantitative scoring) and 5 (no unbacked claims in documentation). Rewritten as a qualitative design rationale consistent with `README.md`'s `Honest scope` note.
- **`references/example-path-a.md`** — corrected all three recorded `*Output*` blocks to match real `think.ts` output:
  - Status-line field order fixed to `history=N mode=path-a` (was `mode=path-a history=1` on T1; `mode=` was silently dropped on T2/T3).
  - T3 status corrected to `next=false` (the example passes `--nextThoughtNeeded false` but had recorded `next=true`, a direct contradiction).
  - Each output block is now labeled `*Output (stdout)*` with a note that stderr separately emits the formatted `💭 Thought N/M` echo — `think.ts` sends `formatThought()` to stderr via `console.error` and the one-line status to stdout via `console.log`.
- **`references/example-path-b-verify.md`** — corrected all status-line outputs to match real `think.ts` output (same class of drift as `example-path-a.md`, missed in the first pass):
  - Field order fixed to `history=N mode=path-b` (was `mode=path-b history=N` on lines 21, 28, 32).
  - `--registerClaim`/`--registerHypothesis` outputs corrected from fabricated `[N/M] ... registered ...` status lines to the real JSON shape (`{"registered": "claim-N", "statement": ..., "status": "pending"}` / `{"resolved": "hyp-N", "status": ...}`) — side-commands print JSON via `console.log`, not the status line.
  - Final termination status corrected to `claims=claim-1,claim-2 hypotheses=hyp-1,hyp-2` — `think.ts` prints bare IDs in these lists, never `id:status` suffixes (was `claim-1:verified`, `hyp-1:selected`, etc.).
  - Claim-1's second `--claimSource` replaced with `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching` — both previous sources resolved to root domain `amazon.com`, so the recorded `verified` outcome was unreachable: `--claimStatus verified` requires ≥2 distinct root domains and `think.ts` would have failed with `distinct root domains`.
- **`SKILL.md` status-line example** — added the missing `mode=path-b` field (was `[3/7] history=3 branches=...`; every status line after the mandatory first `--mode` declaration carries `mode=`).
- **`SKILL.md` Examples index** — `example-path-b-verify.md` description corrected from `mixed verification outcomes` to `dual-source verified outcomes`; both claims in the example resolve `verified`, there are no `single_source`/`unverified`/`not_found` outcomes to call "mixed".
- **`README.md`** —
  - Install/`cd` commands: replaced the `claude-reasoning-*` glob with the literal `claude-reasoning` directory name (the glob breaks when the extracted directory is already named `claude-reasoning`).
  - Added a shell-quoting note at the top of Usage (previously only in `SKILL.md`): values containing `$`, backticks, or `\` must use single quotes — inside double quotes bash silently expands `$<digit>` as a positional parameter (`$50K` → `0K`). README Usage examples all use double quotes, so readers could hit this silently.
  - Reworded the `Enforced invariants` intro: `think.ts` enforces 35 fail-fast checks total; the 19-row table documents the state-machine rules (several rows consolidate multiple checks), while the remaining checks are upfront argument validation (required flags, integer bounds, enum values, entity lookups, paired-flag requirements).
  - Tests section: count updated to 49 and the example-path-b description synced to `dual-source verified outcomes`.

### Added

- **10 doc-consistency tests** in `tests/think.test.ts` (`docs consistency: docs match think.ts observable behavior`) that read `SKILL.md`, `README.md`, `references/example-path-a.md`, and `references/example-path-b-verify.md` and assert they match `think.ts` observable behavior: the Path A example's actual thought count, absence of unbacked quantitative claims, the real stdout status-line format (`history=N mode=path-[ab] …`, bare IDs in `claims=`/`hypotheses=`/`branches=` lists, JSON output for register/resolve side-commands, stderr note for `💭 Thought N/M`), the single-quote warning in README, no stale `claude-reasoning-*` glob, the SKILL.md example index matching the referenced files' actual outcomes, and verified claims using sources with distinct root domains. 49 tests total, up from 39.

## [2.1.4] - 2026-09-24

### Fixed

- **`scripts/think.ts`** — `registeredAtThought` now records the number of completed thoughts at registration time (was `length + 1`, a future index with no corresponding thought). A claim registered after Thought 1 now reads `1` instead of `2`; on an empty session it reads `0` instead of `1`.
- **`SKILL.md`** — added quoting guidance: `--thought`, `--registerClaim`, `--claimNotes`, and `--hypothesisNotes` values containing `$`, a backtick, or `\` must use single quotes; inside double quotes bash silently expands `$<digit>` as a positional parameter (`$53K` → `3K`). Also added a provider-fallback rule to External Verification Contract step 2: when every available search provider fails the same query, switch retrieval tools rather than retrying with rephrased queries.

### Added

- **`merged` hypothesis status** — `--resolveHypothesis` now accepts `merged` (alongside `selected`, `rejected`, `synthesized`), for the case where two registered hypotheses turn out, mid-derivation, to be the same underlying mechanism viewed from different angles rather than genuinely competing explanations. Requires `--mergedInto <hypothesisId>` naming which surviving hypothesis absorbed it; rejects self-references, nonexistent targets, already-merged targets (preventing merge chains), and `--mergedInto` passed with non-`merged` status. Re-resolving a previously merged hypothesis to a non-merged status cleanly clears `mergedInto`. A merged hypothesis counts as resolved for Path B termination, but termination is rejected if merges leave fewer than 2 distinct surviving hypotheses. A hypothesis that already absorbs another merge cannot itself be merged onward — that would strand a `mergedInto` pointer on a merged node (two-hop chain).
- 7 new tests covering the `merged` status guardrails, merge-chain rejection (forward and backward), stale `mergedInto` cleanup, surviving-hypothesis termination gating, its interaction with Path B termination, and the `registeredAtThought` regression (39 tests total, up from 32).
- **`$`-storage regression test** — `stores $-containing flag values byte-for-byte` registers a claim and a thought containing `$500K`/`$186K`/`$1.15M`/`$3` and asserts the stored statement/thought text is identical to what was passed. Locks the no-shell-expansion contract.

### Changed

- **`tests/think.test.ts` harness** — `run()` now executes `bun scripts/think.ts` via `execFileSync` with an argv array instead of `execSync` shell-string interpolation. On POSIX shells `$<digit>` inside quoted values was silently expanded as positional parameters (`"$500K"` → `"00K"`), meaning tests could not detect `$`-corruption and would false-pass on Linux. All 134 call sites converted.
- **`SKILL.md` frontmatter description / `package.json` description** — appended trigger-language sentence ("Use when reasoning through a bug, a decision, a design critique…") so the description surfaces not just what the skill is but when to invoke it, aligning with how users phrase requests during skill retrieval. Both fields kept identical.
- **`references/example-path-b-verify.md`** — Thought 4's `--thought` value switched to single quotes so its `$3`/`$15` literals survive POSIX shells byte-for-byte, matching the new quoting guidance.

### Breaking Changes

None. All changes are additive or internal; no public API, CLI flag, or state-file contract was removed or altered incompatibly.

## [2.1.3] - 2026-09-22

### Changed

- **Version bump only.** `package.json`, `SKILL.md` frontmatter and H1, `README.md` H1, and `scripts/think.ts` header synchronized to 2.1.3. No code, contract, or test changes.

## [2.1.2] - 2026-09-22

### Fixed

- **`SKILL.md` / `references/example-path-b-verify.md`** — External Verification Contract and Path B example no longer name runtime-specific tools (`WebSearch`, `WebFetch`). Wording now directs agents to probe the session's actual search/fetch capability regardless of runtime, removing a portability trap for non-Claude-Code harnesses.
- **`README.md`** - install/test commands now use the version-agnostic `claude-reasoning-*` directory glob instead of a hardcoded `claude-reasoning-2.1.0` path, eliminating stale version references in usage instructions.

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
