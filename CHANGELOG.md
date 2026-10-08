# Changelog

All notable changes to this skill are documented here.


## [3.2.0] - 2026-10-08

### Added

- **11-lens `LENS_CATALOG` and `--listLenses`.** `scripts/think.ts` now carries a machine-readable catalog of 11 lenses (`lens-1`…`lens-11`) with id, name, aliases, type (`prose`/`state-delta`/`computed`), primary problem kinds, and required artifact. `--listLenses [--kind <kind>]` prints the catalog as JSON, sorting the kind's core lenses first.
- **`--kind` problem kinds on Path B.** The first Path B thought may declare `--kind diagnostic|decision|design|optimization|innovation|planning` (immutable thereafter; Path A rejects it). Each kind maps to core and optional lenses (`KIND_CORE_LENSES`/`KIND_OPTIONAL_LENSES`); `pending` guidance names a kind's uncovered core lenses until they are recorded.
- **`pendingActions(state)` per-step guidance.** A pure function previews every unmet termination prerequisite without blocking: pending claims/hypotheses, minimum-thought floor, `--needsMoreThoughts` expansion, unchecked/unmet criteria, distinct-lens count, kind-core lens coverage, convergence declaration, falsification results, and unclosed branches. Surfaced as `next: string[]` in every side-command's JSON output, `pending: string[]` in `--status`, and `ready=<yes|no> blockers=<n>` appended to every thought's status line.
- **`--analyze` deterministic computed lenses.** `--analyze sensitivity|pareto|ach --data '<json>'` computes sensitivity rank-flip analysis (±20% weight/score perturbation with a 5% equivalence span), Pareto non-dominated frontier, or ACH inconsistency ranking. Results persist to `state.lenses` as `{ lens: "analyze:<kind>", computed: true, analysis }` and render into the `## Reasoning Trace` as a `Computed Analysis` table.
- **`--flipIf` observable reversal condition.** Optional flag on `--resolveHypothesis` recorded on `Hypothesis.flipIf`, rendered as a `flipIf` column in the Reasoning Trace hypotheses table; a `selected`/`synthesized` hypothesis without it emits a lint WARN.
- **`falsificationResult` convention linting.** Results conventionally prefix `survived:`/`falsified:`; the lint report warns on contradictions — `selected`/`synthesized` with `falsified:`, or `rejected` with `survived:` lacking a `[PREFERENCE]` marker in `--hypothesisNotes`.
- **Weak-content lens WARNs.** The lint report flags lens findings under 20 characters, identical finding text shared across distinct lens names, lens names absent from `LENS_CATALOG` (INFO, suggests `--listLenses`), findings that cite no `hyp-N`/`crit-N` anchor (INFO), and short `--newInsightNotes` (<20 chars).

### Fixed

- **`pendingActions` convergence check ignored the terminating thought's declaration.** The gate-9 preview listed "Declare convergence…" even after the final thought recorded `--newInsight false` with notes; it now treats a recorded convergence declaration like a revision/branch in history, so `ready=yes blockers=0` is reachable after a converged termination.

### Documentation

- **`references/example-path-b-verify.md` rewritten** to the current execution contract: `--status` clock calibration first, `--kind decision` on the first thought, lenses (computed `--analyze sensitivity` plus catalog-named `--recordLens` findings anchored to `hyp-N`/`crit-N`) applied *before* `--resolveHypothesis`, `survived:`/`falsified:` falsification results, `--flipIf` on the selected hypothesis, `ready=`/`blockers=`/`next:` shown in documented outputs, and a Reasoning Trace mock carrying the `flipIf` column.
- **`references/critical-lenses.md` aligned to the catalog** — 11 lenses keyed by `lens-N` id with types and primary kinds; the stale "Stage 5 & Modes" provenance and the unimplemented "Verifier Separation" lens are gone.
- **`SKILL.md`** — Step -2 now states `today` is the **local** calendar date (not UTC); the Path B lens step lists all 11 catalog lenses and the `--kind`/`--listLenses`/`--analyze` surfaces; the flag reference gains `--kind`, `--flipIf`, `--listLenses`, `--analyze`, and `--data` rows; the status-line example shows `ready=`/`blockers=`.
- **`README.md`** — lens bullet names the real 11-lens catalog (the phantom "Red-Team Attack"/"Edge Case" entries are removed), the usage block demos `--kind`/`--analyze`/`--flipIf` and the `survived:`/`falsified:` convention, and the tests paragraph lists the v3.2.0 surfaces.
- **`references/hallucination-gates.md`** — Gate 3's reference-date line now says local calendar date, and the stale "Stage 5.5" subtitle is removed.
- **`scripts/think.ts --help`** prints the new Path B helper flags (`--kind`, `--listLenses`, `--analyze`, `--flipIf`).

## [3.0.9] - 2026-10-07

### Added

- **`--polarity` support on `--registerClaim`.** `--registerClaim` accepts `--polarity supports|refutes` (default `supports`), allowing claims to explicitly refute a hypothesis rather than implicitly support it. Refuting claims project their polarity through `--verifyClaim` and render `link-status: Linked-refuted` in `--export` when all linked claims refute.
- **`tests/bugs.test.ts`** — 22 regression tests covering all 15 diagnostic claims, polarity behavior, and concurrency fixes.

### Fixed

- **Gate 11 branch closure pre-push evaluation (B5).** Gate 11's `lastMainIndex` computation now evaluates over `historyWithCurrent` instead of only persisted `state.thoughtHistory`, allowing a concluding mainline thought to close an earlier opened branch without requiring an extra unneeded thought.
- **`today()` local calendar date (B1).** Replaced UTC slice with local `getFullYear()`, `getMonth()`, and `getDate()` formatting so sessions correctly reflect the local date across timezone boundaries.
- **SSRF / host validation on non-verified claim statuses (B2).** Guardrail 0 now runs `rootDomain` on every provided `--claimSource` eagerly before status branching, preventing invalid or malicious hostnames on `pending`, `single_source`, `unverified`, or `not_found` claims.
- **Section heading injection in `--export` sources and branches (B2, B3).** User-supplied sources in claim listings and branch identifiers in Session Trace are now escaped via `escapeHeadings`, preventing markdown heading spoofing.
- **Stale `claimDates` on source swap (B4).** Swapping sources in `--verifyClaim` without supplying new `--claimDate` values now drops the previous dates instead of misaligning them with the new sources.
- **Terminating thought `--isRevision` support in Gates 7 and 9 (B6).** Gates 7 and 9 evaluate against `historyWithCurrent`, allowing a concluding thought to resolve an unmet criterion revision requirement.
- **Acceptance criteria mid-session warning severity (B7).** Mid-session unmet criteria now emit `[INFO]` instead of `[CRIT]`, reserving `[CRIT]` for terminated sessions where gates should have blocked conclusion.
- **Hypothesis `notes` and `falsificationResult` preservation on `pending` (B9).** Re-resolving or projecting a hypothesis as `pending` preserves its recorded notes and falsification results.
- **Empty `## Reasoning Trace` omitted (B10).** The `## Reasoning Trace` heading in `--export` is now conditionally emitted only when hypotheses, lenses, or acceptance criteria actually exist in state.
- **Rollover date bypass prevention (B11).** Added strict ISO date round-trip validation (`YYYY-MM-DD` matched against parsed UTC ISO date string) to reject invalid dates like `2026-02-31`.
- **Migration write isolation in `loadState` (B12).** Schema migration save failure is now isolated with try-catch so a transient disk/write issue does not cause valid existing state to be backed up and wiped.
- **Process signal handlers for lock release (B13).** Registered `SIGINT`, `SIGTERM`, and `SIGHUP` listeners to ensure the `.lock` directory is released if the process receives a termination signal.
- **`--help` flag conflict guard (B14).** Combining `--help` with operational action flags now exits with code 1 instead of silently executing help and ignoring the action.
- **TOCTOU race in stale lock reclamation.** Re-verifies lock directory `mtimeMs` before removal during stale lock stealing to prevent races with active processes.
- **Documentation discrepancies (B15).** Corrected `SKILL.md` to include `pending` in `hypothesisStatus` with properly escaped markdown table pipes, listed all 7 operations in `auditTrail`, documented `--polarity` in README and SKILL, and aligned local date semantics across documents.
## [3.0.8] - 2026-10-05

### Added

- **Session clock.** Every thought now stamps the session: `State.startedAt` on the first thought and `State.endedAt` when the session terminates, alongside a `today()` helper emitting the UTC date (`YYYY-MM-DD`). `--status` and `--reset` expose `today` in their JSON, and `buildLintReport` prints a `Session Clock: started <d> · ended <d> · today <d>` line as the second section of the fact sheet. The clock is the single reference date for every freshness judgement — it is never inferred from a source page or memory.
- **`--claimDate` per-source publication dates.** `--verifyClaim` accepts `--claimDate <YYYY-MM-DD>`, repeatable and aligned one-to-one with `--claimSource` (mirroring `--claimTier`). Every date is validated (`YYYY-MM-DD` regex plus `Date.parse`); a date later than the session's `today` exits 1, and a count that does not match `--claimSource` exits 1. Recorded as `Claim.claimDates[]` and projected only for non-`pending` statuses. The lint report warns `'<id>' newest source is N days old (>180d)` when a verified claim's newest date is more than 180 days before `today`, and notes when dates were never recorded.
- **`## Reasoning Trace` tables in `--export`.** `buildLintReport` now emits a `## Reasoning Trace` section with three machine-derived sub-tables — `### Hypotheses` (statement, falsification clause, result, status, decision reason), `### Lenses` (lens, finding), and `### Criteria` (criterion, met, reason) — each rendered only when its collection is non-empty. A new `escapeCell` helper neutralizes headings, escapes `|`, and collapses newlines so user text cannot split a row or forge a section. The trace is the evidence that reasoning happened; the conclusion card must paste it verbatim.

### Changed

- **The conclusion card is now conclusion-first.** `references/conclusion-card.md` reorders every Path B delivery: primary recommendation, then a Calibrated Findings table with a `Source date` column fed by `claimDates`, then the mandatory `Reasoning Trace`, then residuals and next steps. New layout rules enforce one row per entity in comparisons, no raw long URLs mid-sentence, and a single language per card. The old `- Thoughts: N` counter block in the fact sheet was renamed `## Session Trace` so the spec-mandated `## Reasoning Trace` heading unambiguously names the paste target (the `## Primary Finding` splice anchors were re-pointed to `## Session Trace`).

### Documentation

- **SKILL.md gains `## Step -2: Calibrate clock`** (run `--status`; its `today` is the only date source), a `--claimDate` flag-reference row, a new Ground Rule ("dates come from the script"), and a Path B step 6 that requires the card to contain the reasoning trace.
- **`references/hallucination-gates.md` Gate 3** now names the script's `today` as the reference date, requires source publish dates as `--claimDate`, states that a "latest" query carries the current month, and reports an empty window as "no result in window" rather than substituting an older result.
- **`references/example-path-b-verify.md`** replaces the literal `late 2024` with `<YYYY-MM-DD>` placeholders and refreshes the worked card to the conclusion-first format with the mandatory trace and source dates.

## [3.0.7] - 2026-10-05

### Fixed

- **Two side-commands in one invocation silently dropped all but the first.** `--registerClaim … --registerHypothesis …` exited 0 and persisted only the claim — each handler early-exits, so the rest never ran. A new guard rejects any invocation carrying more than one side-command (`--registerClaim`, `--verifyClaim`, `--registerHypothesis`, `--resolveHypothesis`, `--addCriterion`, `--checkCriterion`, `--recordLens`) with exit 1 before any handler fires.
- **A stale lock that could not be removed busy-spun at 100% CPU.** The steal path did `rmdirSync` then `continue` unconditionally; when the lock path was a plain file or a non-empty directory, `rmdirSync` always failed and the `continue` skipped the deadline check and the sleep, so the loop never terminated. The `continue` now happens only after a successful steal — an unremovable lock falls through to the deadline check and sleeps, timing out with a readable message.
- **The lock wait expired before a crashed process's lock could be stolen.** `LOCK_WAIT_MS` (15s) was shorter than `LOCK_STALE_MS` (30s), so a lock left by a crash could not be stolen before the waiter gave up and told the user to delete it by hand. `LOCK_WAIT_MS` is now `LOCK_STALE_MS + 10_000`, guaranteeing at least one steal attempt.
- **A re-verify without `--claimSource` wiped the persisted sources while keeping their tiers.** The source projection only preserved prior sources for `pending`; any other status replaced them with the (empty) current list, leaving `sources: []` next to a surviving `tiers: [...]`. Sources are now kept whenever none are supplied, matching the existing tier rule — the two can no longer drift apart.
- **`single_source` accepted zero sources, and whitespace-only `--claimNotes` passed.** `--claimStatus single_source` had no arity check, so a claim with no sources was recorded as `single_source []`; `--claimNotes "   "` was truthy and bypassed the caveat guard that `--hypothesisNotes` already trimmed. `single_source` now requires exactly one `--claimSource`, and negative statuses require non-empty trimmed notes.
- **Claims under a merged hypothesis did not count as coverage for the survivor.** Both the lint's "no claim support" WARN and the `[Uncovered]` residual tested `c.supports === h.id`, so after `hyp-2` merged into `hyp-1`, a claim backing `hyp-2` left `hyp-1` flagged `No external coverage` and `[Uncovered]`. The lookup now expands the absorbed member set before matching.
- **User-supplied text could forge a section heading in the lint report.** Hypothesis statements/notes, claim fields, criterion text, and lens findings were interpolated raw, so a value containing `\n## Confidence Assessment` rendered as a real `##` section. A new `escapeHeadings` helper neutralizes line-leading `#` runs in every interpolated user string.
- **A lock-path failure surfaced as a raw stack trace.** `mkdirSync` failures other than `EEXIST` (EPERM/EACCES/ENOTDIR/…) were rethrown straight out of `acquireLock`. They now print `Error: cannot create state lock … (CODE); check that the state directory exists and is writable.` and exit 1.
- **thoughtNumber had no ordering check.** A session could record 1, 2, 9, then 4. Non-revision thoughts must now be strictly greater than every prior non-revision number. Revisions keep their documented exemption: a revision carries its temporal position in `historyIndex` and may reuse the number it revises (pinned by `tests/round3.test.ts` round-8 tests).
- **A repeated single-value flag silently kept the last value.** `--registerClaim A --registerClaim B` exited 0 with only `B` persisted. A post-`parseArgs` scan now fails on any repeated flag except `--claimSource`/`--claimTier`, the only legitimately multiple options.
- **Boolean flags disagreed on case.** `--nextThoughtNeeded TRUE` was accepted (it lowercases) while `--met TRUE` and `--newInsight FALSE` were rejected by exact string comparison. All three now compare lowercased values, so case handling is uniform.
- **`localhost` and `127.0.0.1` counted as two independent origins, and an unclosed branch could terminate.** Loopback/reserved hosts (`localhost`, `*.localhost`, `127.x.x.x`, `::1`, `*.invalid`, `*.test`) collapsed to a single sentinel so they can never satisfy the two-domain rule; and a new `branchClosure` gate blocks termination when a branch was opened but no main-line thought followed it.

### Added

- **`tests/round5.test.ts`** — 16 regression tests covering the twelve behavior changes behind the eleven `Fixed` bullets above (the last bullet bundles the loopback-origin sentinel and the `branchClosure` gate) plus the SKILL.md `verifyClaim` example.

### Documentation

- **SKILL.md `verifyClaim` example is now executable as written** — it was missing the required `--negativeFinding` and its trailing backslash continued the next command's `bun` into the argument list.
- **SKILL.md convergence docs now match the code** — `--newInsight false` requires a non-empty `--newInsightNotes` unless history already contains a revision or a branch.
- **SKILL.md gates table extended to 6–11** to include the new `branchClosure` gate.
- **Documented `escapeHeadings` scope** — it neutralizes only line-leading `#` to protect the report's section headings; list/table/fence markers are intentionally unescaped as cosmetic artifacts in plain-text output.

## [3.0.6] - 2026-10-03

### Fixed

- **Cross-process writes could lose data.** Concurrent invocations raced on a fixed `STATE_FILE.tmp` + `renameSync` cycle — two processes could read the same snapshot, each write, and one overwrite the other's mutations. The lock now serializes every state-touching invocation via `mkdir`-as-mutex (`STATE_FILE.lock`), the tmp filename is per-process (`${pid}.tmp`), and a stale lock (from a crashed process, `>30s` old) is stolen rather than deadlocking.
- **`--claimStatus verified` accepted two Tier 1 sources on the same domain.** The Tier check counted *sources*, not *domains*, so `nature.com/a` + `nature.com/b` (both Tier 1) + one Tier 3 blog passed `verified`. The check now requires ≥2 distinct root domains *among* the Tier 1/2 sources only — `nature.com/a` + `nature.com/b` is one trusted origin, not two.
- **Disabled gates left no trace after termination.** `THINK_GATES_OFF` bypasses were recorded only in memory; a later `--export` could not see them. Violations are now persisted to `state.gateBypasses` so they survive into any subsequent export.
- **`--claimSource example.com:8080/x` was misidentified as a non-http URL.** The scheme-detector regex `[a-zA-Z][a-zA-Z0-9+.-]*:` treated `example.com:8080` as a scheme (`example.com:`), not a host:port. A bare host with a port is now correctly parsed when no `://` follows.
- **`--negativeFinding '<command>\n<output>'` never satisfied the two-line lint.** Shells do not expand `\n` inside quotes, so the literal backslash-n arrived as one line and the lint WARN could never clear. The string is now converted to a real newline before the lint check.
- **`gov.au`-style ccTLD agencies were collapsed into one domain.** `abs.gov.au` and `ato.gov.au` (different agencies under `gov.au`) were treated as the same root domain, so two Tier 1 sources on different agencies failed the distinct-domain check. A `GENERIC_SECOND_LEVEL` lookup now expands `gov`/`edu`/`ac`/`co`/`com`/`org`/`net`/`go`/`or`/`ne`/`mil`/`sch`/`nhs`/`ltd`/`plc`/`gob` under any 2-letter ccTLD, so `abs.gov.au` and `ato.gov.au` stay distinct.

- **Orphaned thought flags were silently dropped.** `--thoughtNumber`, `--totalThoughts`, `--nextThoughtNeeded`, `isRevision`, and `--mode` could be passed without `--thought` and exited 0 — the values never reached `thoughtHistory`. `FLAG_REQUIRES` now maps all five to `--thought`; any of the five without `--thought` exits 1 with `--<flag> requires --thought; the argument would otherwise be ignored.`

### Added

- **`tests/round4.test.ts`** — 13 regression tests covering the Tier-1/2 domain independence bug, concurrent-write loss, `THINK_GATES_OFF` trace persistence, the `host:port` URL parsing fix, the `\n`-in-`--negativeFinding` fix, and the `gov.au` ccTLD fix.
- **`.gitignore`** covers the new `STATE_FILE.lock` directory and per-process `.tmp` files.

### Notes

- Medium/low-severity issues confirmed but **not** patched in this release: lens gate checks structure not content (`.`/`-` pass), `newInsightNotes "."` bypasses Gate 7, criterion met-flip requires no evidence, Path A accepts 3 single-character thoughts, `thoughtNumber` has no ordering check **(fixed in 3.0.7)**, `localhost`/`127.0.0.1`/`*.invalid`/`google.co.jp` treated as independent sources **(fixed in 3.0.7 — loopback/reserved hosts now collapse to one origin; `google.co.jp` stays a distinct registrable domain by design)**, `--mode` persists before first thought, `--mergedInto ""` silently ignored, revision-closing-thought miscounts Gate 7/9, `-`-prefixed thoughts rejected, `auditTrail` 7 vs documented 4 ops.

## [3.0.5] - 2026-10-03

### Tooling

- **`bun run typecheck` (`tsc --noEmit`) and a CI workflow.** `bun test` does not typecheck, so a type-only defect (see the `historyIndex` literal below) passes every test. The script makes the check a one-liner; README wires it into the documented test command; `.github/workflows/ci.yml` runs `bun install --frozen-lockfile`, `typecheck`, and `test` on push/PR.

### Fixed

- **Coverage WARN fired for every hypothesis, not just survivors.** The no-claim warning ran over all hypotheses including `rejected`/`merged`/`pending` ones, so a rejected hypothesis was told its "load-bearing proposition is unverified" — a contradiction, since a rejected proposition is not carried forward. The warning is now scoped to `selected`/`synthesized`, matching the Blind Spots survivor filter.
- **`--thought` combined with a side-command was silently discarded.** Every side-command handler (`--registerClaim`, `--registerHypothesis`, `--resolveHypothesis`, `--addCriterion`, `--checkCriterion`, `--recordLens`, `--verifyClaim`) early-exits before the thought block, so a `--thought` passed alongside one was parsed, dropped, and the command still exited 0 with normal output — the thought never reached `thoughtHistory`. The user-visible symptom was a later `history=N` far below the thoughts submitted, tripping the termination gates. The combination now exits 1 with `--thought cannot be combined with <flags>; the thought would be silently discarded.`
- **`--recordLens` `atThought` desynchronized after a dropped thought.** With the silent drop above, a lens's `atThought` (recorded as the current history length) froze at a stale value. Fixed transitively: thoughts can no longer vanish, so `atThought` tracks the real history.
- **`ThoughtData` literal omitted the now-required `historyIndex`.** v3.0.4 made `historyIndex` required, but the thought-submission literal assigned it *after* construction, so the object did not satisfy `ThoughtData` — a type error, never a runtime one. `bun test` does not typecheck, so no test caught it, and README's claim that `bunx tsc --noEmit` typechecks clean was false (dependencies had to be installed in the worktree before `tsc` could resolve `fs`/`path`/`process` at all). `historyIndex` is now set in the literal (`state.thoughtHistory.length + 1`) and the late assignment is gone. `bunx tsc --noEmit` is now genuinely clean.

### Added

- **`## Step -1: Load Contract` in SKILL.md.** The four `references/*.md` files were cited passively throughout the Path B steps with no ordering requirement, so the model often reached the step needing one only after its context had been diluted. Step -1 lists all four with the point at which each must be read, and Path B gates its first thought on it. The state machine cannot verify a file was read; this makes the contract explicit and regressable (`tests/skill-frontmatter.test.ts` asserts the section and its four paths exist).
- **`[INFERENCE]` coverage marker.** Appending the token `[INFERENCE]` to a hypothesis's `--hypothesisNotes` declares "this load-bearing proposition came from reasoning, not retrieval". It does not block termination and does not assert correctness — it makes the absence of external coverage explicit, so a confidently-asserted-but-unretrieved conclusion is distinguishable from a covered one in both the state file and the lint card.
- **`tests/changelog-structure.test.ts`.** Asserts no duplicate `### Heading` within a single `## [x.y.z]` version block — the merge-remnant guard for CHANGELOG.md.

### Changed

- **Coverage is now machine-visible.** A surviving (`selected`/`synthesized`) hypothesis with no linked claim previously produced the silent lint line `blind spots … None recorded by script.` and a `link-status: Plausible` label — zero evidence was presented as "plausible" while a hypothesis backed by a *pending* claim was labelled `Fragile`. Now:
  - `linkStatus` returns `No external coverage` (not `Plausible`) when a hypothesis has no linked claim.
  - `buildLintReport` lists every uncovered surviving hypothesis in **Residual Uncertainty & Blind Spots** — as `[Uncovered]` when it is unmarked, or `[Inference]` when its `--hypothesisNotes` carries the `[INFERENCE]` token.
  - The no-claim WARN names the marker state: `has no claim support (NOT marked [INFERENCE])`.
  - The `claims=0` fallback line no longer reads "None recorded by script."
- **State-file schema `v3` is now documented in README and SKILL.** The 3.0.3 schema change (`ThoughtData.historyIndex`, `AcceptanceCriterion.checkedAtHistoryIndex`, `SCHEMA_VERSION` 2→3 auto-migration) was recorded only here, so any external tool reading `scripts/.think_state.json` had no user-facing description of it. Both docs now carry a State-file section naming the fields, the timeline-vs-`thoughtNumber` distinction, and the auto-migration. The stale `// 2` comment on `State.schemaVersion` is corrected to `3`.
- **README no longer hardcodes a test count.** `190+ tests across 6 files` was stale (actual count has moved past it) and contradicted 3.0.3's deliberate decoupling of fragile counters. It now points at `tests/` with no absolute number.

### Notes

- Coverage remains **not** a hard gate: `--supports` validates only that the target hypothesis exists, so the script cannot judge relevance or know which propositions should have been registered (see SKILL.md §Coverage). This release closes the *visibility* gap, not the *judgment* gap.

## [3.0.4] - 2026-10-03

### Fixed

- **Gate 7 and the lint WARN compared `idx + 1`, not `t.historyIndex`.** The v3.0.3 refactor introduced `historyIndex` as the explicit physical timeline but left the two temporal-position checks reading array index — a stored `thoughtHistory` reordered by an external tool (or any future writer that did not maintain index==position) would silently defeat the revision-after-check invariant. Both sites now read `(t.historyIndex ?? 0) > checkedAt`.
- **`ThoughtData.historyIndex` was typed optional.** The spec declared it required; the optional type let a hypothetical writer skip the field without a type error. It is now `historyIndex: number` — set unconditionally on push and backfilled on load for pre-v3 files, so every persisted entry carries it.


## [3.0.3] - 2026-10-02

### Changed

- **Temporal index is now explicit.** `ThoughtData` carries `historyIndex` (1-based physical position in `thoughtHistory`) and `AcceptanceCriterion` records `checkedAtHistoryIndex` (renamed from `checkedAtThought`, which was a history length conflated with the user-facing `thoughtNumber`). Gate 7 and the lint WARN now read the renamed field; `thoughtNumber` is no longer referenced by any temporal-position check.
- **Hypothesis transitions delegate to `projectHypothesisForStatus`.** The allowed-fields-per-status rule that previously lived inline in `resolveHypothesis` is now a named pure function, so the invariant is greppable and cannot be silently bypassed by a future `delete` patch.

### Fixed

- **`example-replay.test.ts` failed on CRLF checkouts.** Git's `core.autocrlf` on Windows converts `references/*.md` to CRLF, and the fenced-block parser matched only `\n`, producing zero bash blocks. The parser now tolerates `\r\n`, and `.gitattributes` enforces `eol=lf` on text files.

### Schema

- State file schema bumps to `SCHEMA_VERSION = 3`. Legacy v2 files auto-migrate on load: `checkedAtThought` is copied to `checkedAtHistoryIndex`, and `historyIndex` is backfilled to each thought's array position. No `--reset` required; the migrated form is persisted back.


## [3.0.2] - 2026-10-02

### Fixed

- **Tier-3-only claims could reach `verified` (enforcement gap).** `--verifyClaim --claimStatus verified` enforced only source count and root-domain diversity, so four distinct Tier 3 domains (aggregators, exchange blogs, community posts) passed the guardrail and produced `[Confirmed]` cards. `references/source-tiers.md:40` ("even multiple Tier 3 sources cannot elevate a claim to verified") lived only in prose. `--verifyClaim` now requires one `--claimTier <1-4>` per `--claimSource` (positionally aligned) and rejects `verified` unless at least 2 sources are Tier 1/2. Tiers persist on the claim as `tiers[]`.
- **`--claimTier` was only shape-validated on `verified`.** Supplying `--claimTier` with a non-`verified` status skipped every check, so a typo or a stray count persisted garbage into state: `--claimTier abc` wrote `tiers: [null]` (NaN serialized to null), `--claimTier 5 --claimTier 0` wrote `tiers: [5, 0]`, and a tier count with no matching source wrote `tiers: [2, 2, 2]` against `sources: []`. Shape validation (integer 1-4, one tier per source) is now hoisted above the `verified`-only block and runs for every status; a non-conforming tier vector exits 1 instead of being written.
- **`references/example-path-b-verify.md` examples were unrunnable.** Every `bash` block in the worked example exited 1: `--registerClaim` without the required `--supports` link, `--registerHypothesis` without `--falsification`, both `--verifyClaim` calls without `--claimTier` and the quote/negative-search trio, `--resolveHypothesis` without `--falsificationResult`, and a terminating thought with no acceptance criterion, lens records, or `--newInsight` declaration. The file predated the 3.0.0 guardrails; it is now rewritten against the current CLI and replayed by a test. Claim registration is documented after hypothesis registration because `--supports` requires the target to already exist.
- **Test suites shared the real state file.** `tests/think.test.ts`, `tests/issues.test.ts`, and the new `tests/example-replay.test.ts` all wrote to `scripts/.think_state.json` and `beforeEach`-unlinked it; `bun test` runs files in parallel processes, so two concurrent `bun test` invocations produced ~50% failures. Every suite now pins `THINK_STATE_FILE` to a per-process path (`tests/.think_state.<file>-<pid>.json`), and a new `tests/state-isolation.test.ts` regression-guards both the per-file pin and cross-process independence. Verified: two concurrent `bun test` runs both finish with zero failures.
- **The worked-example `# Output:` lines were never checked.** `example-replay.test.ts` only asserted exit 0, so the documented `"supports": "hyp-1"` field on `--registerClaim` — which `think.ts` does not emit — would have stayed wrong forever. The replay test now also parses every `# Output:` line: JSON bodies must match the real stdout object's keys **and values** (a `"resolved": "WRONG"` doc is caught), and status lines must appear verbatim; the phantom `supports` keys are removed from the example, and the terminating-thought output is rewritten as free prose (`# stdout:`) since a fresh process cannot reproduce a populated session card.
- **Re-verifying without `--claimTier` wiped stored tiers.** `claim.tiers = tiers` ran unconditionally for non-`pending` statuses, so `verifyClaim … --claimStatus single_source` (no tiers) after a prior tiered verify persisted `tiers: []`. Now only `tiers.length > 0` overwrites — an un-tiered re-verify preserves the recorded tiers.
- **Verification-only flags were silently dropped without `--verifyClaim`.** `--claimTier 1` or `--claimNotes note` passed alongside `--registerClaim` was parsed, ignored, and the command exited 0 — the claim registered with no tier or note attached. Any of `--claimStatus`, `--claimSource`, `--claimTier`, `--claimQuote`, `--negativeQuery`, `--negativeFinding`, `--claimNotes` without `--verifyClaim` now exits 1.
- **`--claimTier` accepted non-canonical integers via `Number()`.** `Number("+1")=1`, `Number("1e0")=1`, `Number("0x1")=1`, `Number("01")=1` all passed shape validation and persisted as `1`. The check is now `String(Number(s)) !== s` — digits-only, matching the `thoughtNumber` convention — so `1e0`, `0x1`, `+1`, `01` all exit 1.
- **Whitespace-only statements registered as non-empty.** `--registerClaim "   "`, `--registerHypothesis "   "`, and `--thought "   "` all passed the `=== ""` emptiness check, producing blank claims/hypotheses/thoughts. All three now `trim()` before the empty check, matching `--addCriterion`/`--lens`/`--finding`.
- **`--status` silently swallowed a combined operation.** `--export` and `--reset` reject combination with any other operation, but `--status` had no guard: `--status --registerClaim x` printed status JSON and exited 0 without registering. `--status` now runs the same `otherOps` check and exits 1 on combination.
- **Path A accepted acceptance criteria and lens records.** `--addCriterion`, `--checkCriterion`, and `--recordLens` only ran `requireModeEstablished`, so a Path A session could register Path B constructs. All three now fail in Path A — criteria and lenses are Path B constructs.
- **`--claimSource` accepted non-URL values.** `new URL("file:///etc/passwd")` parses with an empty hostname and `foo/file` tolerated to `https://foo/file`, so arbitrary strings bypassed the origin-domain check. `rootDomain` now rejects any non-http(s) scheme, and any bare value whose leading token contains no dot and is not an IPv4 address.
- **`a.com.tr`/`b.com.tr` collapsed to one root domain.** `com.tr`, `com.ar`, `co.il`, `co.th`, `com.ua`, `com.my` and their common second-level companions were absent from `MULTI_SEGMENT_SUFFIXES`, so two distinct registrable domains bucketed under `com.tr` and satisfied the ≥2-distinct-root-domain rule with one operator. The suffix table now covers them.
- **Not-found `--supports` error printed `hyp-hyp-9`.** The message interpolated `hyp-${values.supports}` around an id already carrying the `hyp-` prefix. The parenthetical is removed.
- **Path B terminated with every hypothesis rejected.** Gate 3 required all hypotheses resolved and ≥2 distinct survivors, but nothing blocked a conclusion where all resolved hypotheses are `rejected` — a verdict with nothing carried forward. Termination now requires at least one `selected` or `synthesized` hypothesis.
- **`.gitignore` leaked per-process test state files.** The isolation pinning writes `tests/.think_state.<name>-<pid>.json` and `tests/.isolation-<pid>.json`, which surfaced as untracked files. Both patterns are now ignored.
- **Re-resolving a merge survivor left a stale `mergedInto`.** A survivor still absorbing a merged member could be re-resolved to `rejected`/`pending`, stranding the member's `mergedInto` on a node that no longer holds the survivor role — `--status`/`--export` then rendered `Merged: hyp-3 → hyp-1` pointing at a rejected hypothesis. Re-resolving such a survivor now exits 1 (`re-point '<member>' to another survivor first`); `selected`/`synthesized` stay allowed since the survivor remains a valid merge target.
- **Re-resolving a hypothesis left stale resolution fields.** The non-`merged` branch cleared only `mergedInto`; a node re-resolved to `pending` after being `selected` kept its old `notes`/`falsificationResult`, leaving a pending hypothesis carrying a falsification outcome. The branch now also deletes `notes` and `falsificationResult`.
- **`--falsificationResult` was silently stored on a `merged` resolution.** The `merged` branch never validated the flag, so an absorbed node recorded a falsification outcome even though a merge is documented by `--mergedInto` alone (the survivor keeps the result). Supplying `--falsificationResult` with `--hypothesisStatus merged` now exits 1.
- **Re-resolving a resolved node to `merged` left a stale `falsificationResult`.** The `merged` branch set `mergedInto` but never cleared `falsificationResult`, so a node resolved to `selected` (`falsificationResult:"held"`) then re-resolved to `merged` kept the stale outcome — contradicting the invariant that an absorbed node has no falsification outcome of its own. The branch now deletes `falsificationResult` after setting `mergedInto`.
- **Re-verifying a claim back to `pending` left the resolution-scoped evidence fields.** The claim write path only assigned (`claim.quote = …`, `claim.tiers = …`, …) and never cleared, so a claim taken to `single_source` (or `verified`) with a quote/tiers/negative-search then re-verified to `pending` kept every field — a pending claim carrying a full verification outcome, the same invariant violation fixed on the hypothesis side. A `pending` re-verify now deletes `tiers`/`notes`/`quote`/`negativeQuery`/`negativeFinding` after the assignments; recorded `sources` are still kept unless new ones are supplied.
- **Gate 7 compared a revision's `thoughtNumber` against `checkedAtThought` instead of its position in history.** A revision submitted via `--isRevision --revisesThought N` after a criterion was checked could reuse a lower `thoughtNumber` than `checkedAtThought` and be wrongly rejected. `checkedAtThought` is a history length (temporal position), so the comparison now uses `idx + 1` — the 1-based index of each thought in `thoughtHistory`. The identical check inside `buildLintReport`'s WARN path is fixed the same way.
- **`--branchId` without `--branchFromThought` exited 0 silently.** The flag was parsed but never read, so the invocation produced a plain thought with no branch recorded and no error. A `fail()` guard now rejects the orphan flag.
- **`--revisesThought` without `--isRevision` exited 0 silently.** Same shape as `--branchId`: parsed, ignored, zero feedback. A `fail()` guard now rejects the orphan flag.
- **Orphan sub-flags are now rejected by a central dependency matrix.** `FLAG_REQUIRES` declares every parent→child pair (`--supports`→`--registerClaim`, `--falsification`→`--registerHypothesis`, `--hypothesisStatus`/`--hypothesisNotes`/`--mergedInto`/`--falsificationResult`→`--resolveHypothesis`, `--met`/`--criterionNotes`→`--checkCriterion`, `--lens`/`--finding`→`--recordLens`, plus the verifyClaim and branch/revision families). Supplying any child without its parent exits 1 with `--X requires --Y`, replacing the per-branch hand-written checks.
- **Hypothesis and claim transitions rebuild objects by projection instead of mutate-then-delete.** `resolveHypothesis` and `verifyClaim` now construct a fresh record carrying only the fields valid for the target status, so a stale `mergedInto`/`falsificationResult`/`notes`/`quote`/`tiers` can never survive a state change regardless of which earlier transition wrote it.
- **An empty-string parent flag bypassed `FLAG_REQUIRES`.** `--checkCriterion "" --met true` was parsed as "parent supplied" because `"" != null`, so `--met` slipped past the dependency matrix and the run crashed later inside the `checkCriterion` branch on a missing criterion id instead of exiting 1 with `--met requires --checkCriterion`. The parent check now treats `""` as absent; a whitespace-only parent stays present so the command's own empty-value error still fires first.
- **`--help` threw an unknown option error instead of showing usage.** `parseArgs` in `scripts/think.ts` had no `help` flag declared under `strict: true`, causing `bun scripts/think.ts --help` to fail with `Error: Invalid arguments: Unknown option '--help'`. Declared `help: { type: "boolean", default: false }` and added early exit handler that prints usage summary with exit code 0.

### Breaking Changes

- `--claimStatus verified` without `--claimTier`, with a tier outside 1-4, or with a tier count that does not match `--claimSource` now exits 1. Any status supplied with a `--claimTier` outside 1-4 or with a count that does not match `--claimSource` also exits 1 (previously only `verified` enforced this). `1e0`/`0x1`/`+1`/`01` spellings exit 1 (non-canonical). Any `--claimStatus`/`--claimSource`/`--claimTier`/`--claimQuote`/`--negativeQuery`/`--negativeFinding`/`--claimNotes` without `--verifyClaim` now exits 1. `--status` combined with any other operation exits 1. Whitespace-only `--thought`/`--registerClaim`/`--registerHypothesis` values exit 1. In Path A, `--addCriterion`/`--checkCriterion`/`--recordLens` now exit 1. A `--claimSource` that is not an http(s) URL or a bare `host/path` naming a domain (`file:///…`, `foo/file`, single-label) exits 1. Path B termination with every hypothesis `rejected` exits 1. Re-resolving a merge survivor to `rejected`/`pending` while it still absorbs a member exits 1. `--falsificationResult` with `--hypothesisStatus merged` exits 1. Re-resolving to a non-`merged` status clears `mergedInto`/`notes`/`falsificationResult`; re-resolving to `merged` clears `falsificationResult`. Re-verifying a claim to `pending` clears `tiers`/`notes`/`quote`/`negativeQuery`/`negativeFinding` (recorded `sources` are kept). `schemaVersion` stays 2: `Claim.tiers` is optional, so pre-3.0.2 state files load unchanged.

### Changed

- **`negativeFinding` WARN wording.** The single-line warning no longer implies the script can detect an execution record: it states that the check is purely "contains a newline" and asks for `--negativeFinding "<command>\n<output>"`. `references/hallucination-gates.md` Gate 1 now names person handles/usernames/author names, affiliations, version numbers, and URLs as specific entities, and adds a no-expansion rule — never complete an entity's name, identity, or affiliation beyond what the source states verbatim; an unresolvable detail is demoted or removed, not filled from memory.
- The lint report emits `[WARN] '<claim>' verified without --claimTier` for any verified claim with no recorded tiers (legacy state), instead of validating silently.

### Tests

- `tests/issues.test.ts`: new `Audit 5` block (8 cases) — four distinct Tier 3 domains rejected; 1×Tier1 + 1×Tier3 rejected; 2×Tier1/2 accepted; tier/source count mismatch rejected; out-of-range tier rejected; missing `--claimTier` rejected; `single_source` unaffected; a hand-written legacy verified claim with no `tiers[]` produces the lint WARN. Plus 4 cases for non-verified tier shape validation (non-numeric, out-of-range, count mismatch, and an aligned tier that persists), a regression test locking the anti-heuristic decision, and three new cases: un-tiered re-verify preserves stored tiers, verification flags without `--verifyClaim` exit 1, non-canonical tier spellings (`1e0`,`0x1`,`+1`,`01`) exit 1. New `tests/example-replay.test.ts` executes every command in `references/example-path-b-verify.md` in document order, asserts exit 0, and matches each `# Output:` line against real stdout (documented JSON key/value pairs must both appear on the real object; verbatim tokens for status lines). New `tests/state-isolation.test.ts` guards per-process `THINK_STATE_FILE` isolation. `tests/round3.test.ts` covers the round-3 silent-failure/bypass fixes plus the merge-chain, stale-survivor, re-resolve field cleanup, merged `falsificationResult` rejection, claim `pending` re-verify evidence cleanup, empty-string parent-flag gap, and `--help` CLI support. Existing `verified` call sites migrated to pass `--claimTier`.

- `tests/round3.test.ts` additions cover the empty-string parent-flag gap, `--help` CLI support, and the new temporal-index/schema-v3 migration regressions.

### Files

`scripts/think.ts` (`Claim.tiers`, `--claimTier` flag + Guardrail 1c, tier shape validation on all statuses, canonical-integer check, tier-persistence fix, claim `pending` re-verify evidence cleanup, verification-flag binding incl. `--claimNotes`, whitespace-trim on statements, `--status`/`--export`/`--reset` combination guards, Path A criteria/lens prohibition, `rootDomain` URL strictness + `com.tr`/`com.ar`/`co.il`/`co.th`/`com.ua`/`com.my` suffixes, all-rejected termination gate, merge-survivor stale-pointer guard, `merged` `--falsificationResult` rejection + stale-`falsificationResult` clear on re-resolve, re-resolve field cleanup, `--supports` message fix, lint WARN wording, version 3.0.2) · `.gitignore` (per-process test state patterns) · `references/hallucination-gates.md` (Gate 1 entity list + no-expansion rule) · `references/source-tiers.md` (`--claimTier` enforcement rule + verification checklist item 4) · `references/example-path-b-verify.md` (rewritten against the 3.0.0+ CLI, phantom `supports` removed) · `SKILL.md` (protocol step 3, Path A/B prohibitions, flag table, version 3.0.2) · `README.md` (example, invariant rows, 174 tests across 6 files, version 3.0.2) · `package.json` + `think.ts` header (version 3.0.2) · `tests/think.test.ts` (per-pid state pin, `--claimTier` on verified call sites, conclusion-card test now selects one hypothesis for the all-rejected gate) · `tests/issues.test.ts` (removed a duplicated `Issue 2 & 15` describe block) · `tests/example-replay.test.ts` (value-equality `# Output:` check incl. non-string scalars, exact `commandCount`) · `tests/state-isolation.test.ts` · `tests/round3.test.ts` (merge-chain, stale-survivor, re-resolve field cleanup, merged `falsificationResult` rejection + stale clear on re-resolve, claim `pending` re-verify evidence cleanup) · `CHANGELOG.md`.

## [3.0.1] - 2026-10-01

### Fixed

- **Gate 9 convergence declaration**: require non-empty `--newInsightNotes` when `--newInsight false` is declared in absence of branch/revision exploration history.
- **Merged hypothesis notes**: `--hypothesisNotes` is now strictly required on all terminal statuses including `merged` (while keeping `falsificationResult` exempt).
- **Lint report (§7)**: emit `[WARN]` when verified claims have a single-line `negativeFinding`. The check is purely structural — it looks for a newline and does **not** verify that a command ran; the message says so explicitly.
- **Audit trail (§3.4)**: `recordAudit` now records `atThought`, correctly isolating state change counting to the final thought round.
- **Documentation truthfulness**: corrected `SKILL.md` and `CHANGELOG.md` to specify `falsificationResult` as free-text evidence rather than a restrictive `held|broken` enum.

## [3.0.0] - 2026-10-01

### Added

- **Falsification-driven hypothesis lifecycle.** `--registerHypothesis` now requires `--falsification <condition>` (the concrete condition that would falsify the hypothesis). Terminal resolutions (`selected` / `rejected` / `synthesized`) require `--hypothesisNotes <why>` **and** `--falsificationResult <evidence/outcome>` (concrete description of whether the falsification clause held or broke); `merged` is exempt from `--falsificationResult` (the surviving hypothesis keeps its own) but still requires `--hypothesisNotes`. `--mergedInto` cross-checks (self-reference, nonexistent id, already-merged target, rejected target, merge chains, mismatch with `merged` status) now run before the notes/result checks so merge-specific errors surface first.
- **Acceptance criteria (gates 6–7).** New side-commands `--addCriterion "<text>"` and `--checkCriterion crit-N --met true|false [--criterionNotes ...]`. Gate 6 blocks Path B termination with zero criteria or any unchecked criterion; gate 7 blocks termination on `met=false` without a subsequent `--isRevision` thought or an explicit `--newInsightNotes` rationale.
- **Critical lens records (gate 8).** New side-command `--recordLens --lens "<name>" --finding "<residual uncertainty>"`; gate 8 blocks Path B termination with fewer than 2 distinct (NFKC/case-normalized) lens names.
- **Convergence declaration (gate 9).** `--newInsight false` (with optional `--newInsightNotes`) is the convergence declaration on the terminating thought; any other `--newInsight` value exits 1. Gate 9 blocks termination without a declaration unless history contains a revision or branch.
- **Quote verification (gate 10).** `--verifyClaim ... --claimStatus verified` now requires `--claimQuote`, `--negativeQuery`, and `--negativeFinding` alongside the dual-source rule. Gate 10 blocks termination while any resolved non-merged hypothesis lacks a `falsificationResult`.
- **Claim–hypothesis linking.** `--registerClaim` requires `--supports <hyp-id>` naming the hypothesis the claim bears on; nonexistent targets exit 1.
- **`THINK_GATES_OFF` ablation switch.** Gates 6–10 accept a comma-separated list of gate names or `all`. A disabled gate records its would-be violation and surfaces it as a `[WARN] gate <name> disabled: ...` line in the lint report instead of failing. Definition-layer checks (registration/resolution trio, merge validation) stay always on.
- **Lint-report card export.** New `buildLintReport(state)` replaces the raw verdict-style card: CRIT residuals an active gate should have blocked, WARN entries (disabled gates, missing rationale, thin lens coverage), INFO escape surfaces, acceptance-criterion status, lens findings, and the block-quoted final thought, under a "script's view of state, not the final answer" header. `--export` prints it, and it is auto-emitted after the status line when a session terminates.
- **Schema v2.** State gains `schemaVersion`, `acceptanceCriteria[]`, `lenses[]`, claim `supports`/`quote`/`negativeQuery`/`negativeFinding`, hypothesis `falsification`/`falsificationResult`/`notes`/`mergedInto`, thought `newInsight`/`newInsightNotes`; v1 files migrate with defaults filled on load. `saveState` is atomic (tmp file + rename).

### Breaking Changes

- `--registerHypothesis` without `--falsification`, terminal `--resolveHypothesis` without `--hypothesisNotes`/`--falsificationResult`, `--registerClaim` without `--supports`, and `verified` verification without the quote/negative-finding trio now exit 1.
- Path B termination additionally requires: ≥1 checked acceptance criterion, revision or rationale for unmet criteria, ≥2 distinct lens names, a convergence declaration, and falsification results on all resolved hypotheses (gates 6–10).
- The `--export` card is now a CRIT/WARN/INFO fact sheet, not a confidence verdict.

### Tests

- `tests/think.test.ts` + `tests/issues.test.ts` migrated to the new API (`--falsification`, `--supports`, `--hypothesisNotes`/`--falsificationResult`, verification trio, `THINK_GATES_OFF` on terminating thoughts) and extended: merge semantics, disabled-gate warnings, criterion checks, lens records, quote verification. Suite now **133 tests across 3 files**.

### Files

`scripts/think.ts` (schema v2, gates 6–10, new side-commands, `buildLintReport`) · `tests/think.test.ts` · `tests/issues.test.ts` · `SKILL.md` (Path B protocol, gates table, flag reference, version 3.0.0) · `README.md` (invariants, lint card, 129 tests) · `package.json` + `think.ts` header (version 3.0.0) · `CHANGELOG.md`.

## [2.2.6] - 2026-09-30

### Fixed

- **Terminated sessions are now immutable.** A session whose last recorded thought carried `--nextThoughtNeeded false` accepted further thoughts, silently extending a concluded run. `think.ts` now exits 1 with the thought number and a `--reset` hint (`scripts/think.ts`, termination guard). This covers side-commands too: `--registerClaim`, `--verifyClaim`, `--registerHypothesis`, and `--resolveHypothesis` run before the thought-submission gate, so each of the four now hits the same terminated check (shared `requireModeEstablished` entry) and exits 1 instead of mutating a concluded session.
- **Corrupt state file no longer resets silently.** A non-JSON `scripts/.think_state.json` was caught and replaced with an empty state, destroying the previous session with no trace. The machine now warns on stderr, renames the corrupt file to `scripts/.think_state.json.bak` for forensics (best-effort) and starts a fresh session — the same contract as "no state file".

### Tests

- `tests/think.test.ts`: 3 new regression tests — corrupt state warns and backs up to `.bak`; a thought submitted after termination exits 1; side-commands on a terminated session exit 1. Suite now 97 tests across 3 files.

### Breaking Changes

- A `--thought` or side-command (`--registerClaim` / `--verifyClaim` / `--registerHypothesis` / `--resolveHypothesis`) submitted after `--nextThoughtNeeded false` now exits 1. Sessions that previously continued past a conclusion must `--reset` first. Flag and state schema unchanged.
- A corrupt `scripts/.think_state.json` now emits a stderr warning and is renamed to `scripts/.think_state.json.bak` instead of being silently replaced; the fresh-session behavior is unchanged.

### Files

`scripts/think.ts` (termination guard incl. side-commands, corrupt-state backup) · `tests/think.test.ts` (+3 cases) · `SKILL.md` (guards, `--thought=` leading-dash convention, single global state + `THINK_STATE_FILE`, `verified` self-attested) · `package.json` + `SKILL.md` (version 2.2.6) · `README.md` (invariant rows, 97 tests / 3 files) · `CHANGELOG.md`.

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
