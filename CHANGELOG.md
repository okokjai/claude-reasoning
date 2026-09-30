# Changelog

All notable changes to this skill are documented here.

## [Unreleased]

## [2.2.5] - 2026-09-30

### Fixed

- **Skill-selection invisibility: `description` frontmatter reordered.** The harness truncates skill descriptions to ~100 chars when rendering the skills list; the `Use when …` use-condition previously began at char ~425, so the selector saw only a self-description and the skill was never invoked. `Use when` now opens the description (SKILL.md:4 and the identical `package.json` copy). New regression suite `tests/skill-frontmatter.test.ts` asserts the trigger stays inside the window and the two copies remain byte-identical.
- **`--export` no longer issues a confidence verdict it cannot support.** Claims are not linked to hypotheses, so an unrelated verified fact previously produced `[Confirmed]` + High on a judgment call. The primary finding is now `[Plausible]` (reasoning-derived); claim statistics are labelled "fact-check coverage only".
- **`--export` Path A / zero-claim handling.** Path A no longer gets `[Unverified]`/Low or a `--registerClaim` suggestion (which Path A forbids); Path B with no claims reports "not rated by script".
- **`--export` completeness.** Card now carries `--hypothesisNotes` rationale, claim notes (including verified), every selected/synthesized hypothesis, merged hypotheses with targets, a trace line (thoughts/revisions/branches) and the final thought.
- **`--export` injection.** Free text (final thought) is block-quoted so multi-line thoughts cannot forge card headings.
- **`--export` single_source consistency** (primary tag no longer contradicts the rationale).
- **`--export` must run alone**; combining it with `--thought`, `--registerClaim`, `--status`, etc. exits 1 instead of silently dropping them, and `--reset --export` no longer wipes state silently.
- **`--nextThoughtNeeded` is strict** (`true`/`false`); typos such as `ture`/`yes`/`1` previously terminated the session.
- **`rootDomain()`** strips the trailing root dot so `example.com.` and `example.com` count as one source.

### Changed

- **`--export` is documented as a fact sheet**; the final answer remains the model-written card.

### Known gaps (not addressed)

`verified` is still self-attested (sources are never fetched); corrupt state file is silently reset; terminated sessions accept further thoughts; `--thought` values starting with `-` need `--thought=...`; single global state file.

### Breaking Changes

None to state or flags. Callers passing non-boolean `--nextThoughtNeeded` values, or combining `--export` with other flags, now get exit 1.

### Files

`scripts/think.ts` (fact-sheet `--export`, `quoteBlock()` injection guard, strict `--nextThoughtNeeded`, `--export` exclusivity, trailing-dot root domain) · `tests/think.test.ts` (+8 cases) · `tests/skill-frontmatter.test.ts` (new, +2 cases) · `SKILL.md` + `package.json` (description reorder, version 2.2.5) · `README.md` (fact-sheet docs, 2 invariant rows, trailing-dot note, 94 tests / 3 files) · `CHANGELOG.md`.

## [2.2.4] - 2026-09-30

### Added

- **`scripts/think.ts` — `--export` conclusion card** — a new side-command prints a markdown conclusion card derived purely from persisted state (no invented content): primary finding = the `selected`/`synthesized` hypothesis statement (else last thought), per-claim calibrated findings (`[Confirmed]`=verified, `[Probable]`=single_source, `[Unverified]`=pending/unverified/not_found), a High/Medium/Low confidence level driven by verified-claim ratio, the decision matrix (selected/rejected/pending hypotheses), deduplicated evidence source URLs, residual uncertainty (unverified claims + pending hypotheses + notes), and actionable next steps. The same card is auto-printed after the status line whenever a submitted thought sets `--nextThoughtNeeded false`, closing the "reasoning lives in `.think_state.json` but nothing exports it" gap. Implements `references/conclusion-card.md`.
- **`tests/think.test.ts`** — 3 new tests: `--export` card content on a terminated Path B session, auto-emission after the status line on termination, and mid-session `[Unverified]` residual marking. Total: 84 across 2 files (43 in think.test.ts, 41 in issues.test.ts).

### Breaking Changes

- **None.** `--export` is a new opt-in flag; termination output gains a trailing markdown block on stdout after the status line. Scripts that parse only the final stdout line of a terminating thought must read the first line instead.

## [2.2.3] - 2026-09-30

### Changed

- **`SKILL.md` / `package.json` frontmatter description** — removed `a bug` from the trigger list. The skill is for open-ended reasoning and verified external facts; routing it onto local-code debugging sessions caused Path A/B ceremony (thought caps, hypothesis registration, claim gates) to crowd out actual debugging. Debugging belongs to the systematic-debugging workflow, not this skill.

## [2.2.2] - 2026-09-28

### Changed

- **`README.md`** — added `### Update an existing install` instructions for git-clone deployments.

## [2.2.1] - 2026-09-28

### Fixed

- **`scripts/think.ts` — `--claimSource` URLs must be parseable** — `rootDomain()` previously returned unparseable strings as their own domain buckets, so two garbage strings or two scheme-less URLs on the same domain (e.g. `example.com/a` vs `example.com/b`) passed the `verified` dual-source check. Missing schemes are now tolerated via `https://` retry (`example.com/x` vs `other.org/y` still counts as two distinct roots), and completely unparseable values exit 1 ("not a parseable URL; sources must name their origin domain.").
- **`scripts/think.ts` — first thought must declare `--mode`** — `resolveMode()` previously persisted `--mode` supplied on any invocation, so `--mode path-b --registerHypothesis …` established mode on an empty history and the real thought 1 then skipped the mode requirement. Side-commands may still carry `--mode` to pre-establish the session mode (enabling pre-thought registration), but a first thought submitted without `--mode` now exits 1 ("--mode is required on the first thought") even when `state.mode` was already set — the documented invariant is enforced by the flag on the submission itself, not by session state inheritance.
- **`scripts/think.ts` — expanded multi-segment suffix coverage** — `MULTI_SEGMENT_SUFFIXES` now covers common hosted-platform and ccTLD-style suffixes (`co.nz`, `co.in`, `com.br`, `co.za`, `co.kr`, `com.cn`, `netlify.app`, `web.app`, `onrender.com`, `railway.app`, `fly.dev`, etc.), so e.g. `a.co.nz` vs `b.co.nz` and `foo.netlify.app` vs `bar.netlify.app` are correctly recognized as distinct roots. Whitelist remains finite; `localhost` stays self-bucketing.
- **`scripts/think.ts` — `totalThoughts` auto-adjust now visible** — when `thoughtNumber` exceeds `totalThoughts`, the adjustment is still applied (upstream sequential-thinking semantics) but now emits `totalThoughts adjusted N->M` on stderr instead of silently rewriting state.
- **`scripts/think.ts` — `--branchFromThought` existence check** — branching from a `thoughtNumber` not present in `thoughtHistory` now exits 1 ("Cannot branch from thought N: not found in history"), matching the existing `--revisesThought` guard.
- **`scripts/think.ts` — `--mergedInto` rejected-target guard** — merging a hypothesis into an already-`rejected` hypothesis now exits 1; previously it produced a logically contradictory state. Merging into `pending`, `selected`, or `synthesized` targets remains allowed.
- **`scripts/think.ts` — `--reset` runs alone** — `--reset` combined with any other flag (`--status`, `--thought`, side-commands, etc.) now exits 1 instead of silently discarding the other operations and clearing the session.
- **`scripts/think.ts` — strict integer flags** — `--thoughtNumber`, `--totalThoughts`, `--revisesThought`, and `--branchFromThought` now require `^\d+$`; scientific notation (`1e1`), hex (`0x10`), decimals, and whitespace-padded values are rejected.

### Added

- **`tests/issues.test.ts`** — 17 new regression tests covering: unparseable and scheme-less claim sources, mode-on-side-command and undeclared-mode first thoughts, new suffix coverage (positive and negative cases), `totalThoughts` adjust notice, nonexistent `branchFromThought`, rejected `mergedInto` target, `--reset` exclusivity, and non-decimal numeric flags. Total: 80 tests across 2 files (up from 63).

### Changed

- **`SKILL.md`** — version 2.2.1; flag reference documents `--claimSource` parseability + missing-scheme tolerance, `--mode` thought-only restriction, the `totalThoughts adjusted` notice, `--branchFromThought`/`--revisesThought` existence requirements, `--mergedInto` rejected-target block, and `--reset` exclusivity.
- **`README.md`** — version 2.2.1; invariants table adds the seven new guards; test count updated to 80 across 2 files.
- **`tests/think.test.ts`** — byte-for-byte output test now declares `--mode path-b` on its first thought (previously relied on the side-command mode bypass).

### Breaking Changes

None. All changes tighten previously unenforced documented invariants; no public flag, output field, or state-file contract was removed.

## [2.2.0] - 2026-09-28

### Fixed

- **`scripts/think.ts` — Path A now forbids all side-commands** — `--verifyClaim`, `--registerHypothesis`, and `--resolveHypothesis` are rejected while session mode is `path-a`, matching the existing `--registerClaim` prohibition and the documented Path A contract. Previously only claim *registration* was blocked; hypothesis lifecycle commands silently mutated Path A sessions.
- **`scripts/think.ts` — Path A depth cap** — submitting a 6th thought in `path-a` now exits 1 ("Path A depth exceeds 5 thoughts (X/5); conclude or escalate to Path B via --reset."). Previously Path A had a minimum depth (≥3) but no maximum, contradicting the documented 3–5 bound.
- **`scripts/think.ts` — side-commands require an established mode** — `--registerClaim`, `--verifyClaim`, `--registerHypothesis`, and `--resolveHypothesis` on an empty state (before any thought has set `--mode`) now exit 1 with "--mode must be established" instead of silently mutating a mode-less session.
- **`scripts/think.ts` — verified claims cannot be demoted** — `--verifyClaim claim-N --claimStatus <status>` on a claim already `verified` exits 1 ("cannot demote verified claim to <status>; verification results are final.") for any non-`verified` status, preventing evidence-backed resolutions and their source URLs from being quietly erased.
- **`references/example-path-b-verify.md`** — claim-1 verification example fixed to use distinct root domains (`docs.aws.amazon.com` + `docs.anthropic.com`), resolving an exit 1 under the dual-source distinct-root-domain guardrail. Status lines corrected to real CLI output: Thought 1 matches `[1/6] history=1 mode=path-b next=true` field order, registerClaim outputs replaced with actual JSON returned by the CLI, and Thought 6 status line corrected to `[6/6] history=6 mode=path-b claims=claim-1,claim-2 hypotheses=hyp-1,hyp-2 next=false` (prior sample fabricated `:verified`/`:selected` suffixes).
- **`references/example-path-a.md`** — Thought status samples corrected to match actual CLI field order (`[N/T] history=N mode=path-a next=...`), and Thought 3 correctly shows `next=false` (was `next=true`).
- **`SKILL.md`** — status-line sample now includes the `mode=` field that `think.ts` emits on every thought status line.
- **`scripts/think.ts` — `--status` reports `hypothesisDetails`** — hypothesis statements and metadata are now surfaced alongside `claimDetails`, `branchDetails`, and `auditTrail`; previously hypotheses were only visible as ids/counts.
- **`scripts/think.ts` — robust `rootDomain()`** — bare IPv4/IPv6 literals compare by full address (previously mangled by label-slicing), and a `MULTI_SEGMENT_SUFFIXES` table (`co.uk`, `com.tw`, `github.io`, etc.) makes eTLD+1-style extraction suffix-aware, so `bbc.co.uk` vs `itv.co.uk` are correctly recognized as distinct roots for the `verified` dual-source check.
- **`scripts/think.ts` — clean CLI errors** — `parseArgs` failures are caught and reported as `Error: Invalid arguments: …` without a stack trace; unknown flags and malformed values no longer crash with a raw exception dump.
- **`scripts/think.ts` — integer validation** — `--thoughtNumber`/`--totalThoughts` must be positive safe integers; values exceeding `Number.MAX_SAFE_INTEGER`, non-integers, and `< 1` are rejected with a clean validation error.
- **`scripts/think.ts` — empty-string flag values** — flag entry points now use `!= null` checks instead of falsy checks, so `--thought ""` and `--registerClaim ""` produce specific validation errors rather than being treated as missing flags.
- **`scripts/think.ts` — revision/branch integrity** — `--revisesThought N` must reference a thoughtNumber already in `thoughtHistory`; a non-revision submission reusing an existing `--thoughtNumber` is rejected; `--isRevision` and `--branchFromThought` are mutually exclusive.
- **`bun.lock` / `.bunfig.toml`** — lockfile regenerated and registry pinned to `registry.npmjs.org` via a new `.bunfig.toml`, removing stale registry references.

### Added

- **`tests/issues.test.ts`** — new suite with 24 regression tests covering all guards above: Path A side-command prohibition and depth cap, mode-before-registration, verified→any-non-verified demotion, `hypothesisDetails` in `--status`, IP/multi-segment-suffix root domains, clean CLI errors, safe-integer validation, empty-string values, nonexistent `revisesThought`, duplicate `thoughtNumber`, and `isRevision`/`branchFromThought` mutual exclusion. Total: 63 tests across 2 files (up from 39).

### Changed

- **`tests/think.test.ts`** — side-command tests now establish `--mode` first to satisfy the new registration gate; the Path B early-termination test registers mode at thought 1 and terminates at thought 2 ("requires at least 2 prior thoughts"). All existing test intents preserved.
- **`SKILL.md`** — version 2.2.0; Path A prohibition now lists all four side-commands; flag reference documents the verified→any-non-verified demotion block (verified claims are final), IP/eTLD+1-style root-domain semantics, `--claimSource` preservation on `pending` transitions, and `hypothesisDetails` in `--status` output.
- **`README.md`** — version 2.2.0; invariants table expanded with all user-triggerable guards including required-flag validation, empty `--thought`, integer bounds for `revisesThought`/`branchFromThought`, and not-found claim/hypothesis id errors; test count updated to 63 across 2 files.

### Breaking Changes

None. All changes tighten previously unenforced documented invariants; no public flag, output field, or state-file contract was removed.

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
