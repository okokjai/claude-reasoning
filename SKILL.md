---
name: claude-reasoning
version: 3.0.2
description: "Use when reasoning through a decision, a design critique, an architecture tradeoff, a multi-step analysis, or an open-ended question needing verified external facts — before answering, not after. Structurally adaptive reasoning with claim-gated external verification. Routes by problem structure (closed-form vs open-ended), never by keyword or domain matching. Path A (closed-form): 3-5 thoughts with independent cross-validation, zero claim overhead. Path B (open-ended): adaptive depth, competing hypotheses, 2-4 critical lenses, conditional claim pre-registration with dual-source enforcement. Zero MCP dependencies."
---

# claude-reasoning 3.0.2

Reasoning cost is allocated by **problem structure**, not by fixed frameworks or keyword routing.

State machine: `scripts/think.ts` (TypeScript, runs on `bun` or `npx tsx`). Persistent state: `scripts/.think_state.json`. No MCP server required.

---

## Step 0: Structural Classifier

Classify by **the structure of the question**, never by topic keywords (finance / tech / career / health). Keyword routing misclassifies — decide by asking: *is there a unique objectively verifiable answer within bounded rules?*

| Structure | Route | Signal |
|---|---|---|
| **Closed-form** | Path A | Unique verifiable answer; bounded rules; derivation or enumeration settles it |
| **Open-ended** | Path B | Requires judgment, trade-offs, design, critique, or real-world facts |

Announce the classification in Thought 1 so the routing is inspectable. Pass it as `--mode path-a` or `--mode path-b` on the first thought; the state machine rejects a first thought without `--mode`, and the mode is immutable for the rest of the session (changing it requires `--reset`).

---

## Path A: Closed-Form Lean Verification

**3–5 thoughts. Never pad to fill a framework.**

1. **Thought 1** — Restate the problem. Surface hidden or ambiguous definitions, boundary conditions, and the trap the question is actually testing.
2. **Thought 2** — Execute the primary derivation.
3. **Thought 3** — **Independently cross-validate with a different method**: reverse deduction, extreme-value substitution, set/complement enumeration, or brute-force state space.
4. **Thoughts 4–5** — Only when Steps 2 and 3 disagree. Resolve the conflict, then terminate immediately.

**Prohibited in Path A**: `--registerClaim`, `--verifyClaim`, `--registerHypothesis`, `--resolveHypothesis`, `--addCriterion`, `--checkCriterion`, `--recordLens`, any external search, depth expansion beyond 5. All seven side-commands are rejected with a Path A error — acceptance criteria and lens records are Path B constructs.

Terminate as soon as the two independent methods agree: `--nextThoughtNeeded false`.

Rationale, measured: closed-form logic questions that were run through a fixed 11-node framework produced 6 of 6 trail entries with zero captured insight. Depth must be earned by disagreement, not scheduled.

---

## Path B: Open-Ended Adaptive Reasoning

**No fixed round count. Converge when a round yields no new insight.**

1. **Decompose** — Split into essential sub-questions. Discard sub-questions that cannot change the decision.
2. **Competing hypotheses** — For each load-bearing sub-question, state **≥ 2 mutually competing** hypotheses or options. A single option is not reasoning. Register each via `--registerHypothesis "<statement>" --falsification "<condition>"` (both flags required) and resolve each before terminating (`selected`, `rejected`, `synthesized`, or `merged`). Path B termination is rejected while fewer than 2 hypotheses are registered, any remains `pending`, merges leave fewer than 2 distinct surviving hypotheses, or **every resolved hypothesis is `rejected`** — at least one must be `selected` or `synthesized` to conclude. Terminal resolutions (`selected`/`rejected`/`synthesized`) **require `--hypothesisNotes <why>` and `--falsificationResult "<evidence/outcome>"`** (concrete description of whether the falsification condition held or broke). Use `merged` (with `--mergedInto…
3. **Critical lenses** — Choose **2–4** that the task actually needs from `references/critical-lenses.md`; record via `--recordLens --lens "<name>" --finding "<residual uncertainty>"`. Path B termination blocks with fewer than 2 distinct lens names recorded (Gate 8):
   - **First principles & constraint reduction** — reduce to irreducible constraints.
   - **Pre-mortem & active red team** — assume catastrophic failure 12 months out; identify what killed it.
   - **Sensitivity analysis (±20% perturbation)** — perturb key numerical or capacity assumptions; check if rankings flip.
   - **Scale & boundary stress (0.01× / 100×)** — evaluate non-linear cliffs at degenerate extremes.
   - **Pareto frontier & trade-off explicitization** — make sacrifice explicit; identify non-dominated options.
   - **Differential elimination** — systematically rule out hypotheses contradicted by verified facts.
   - **External verification** — **condition-gated, see below.**
4. **Acceptance criteria** — Add target requirements via `--addCriterion "<text>"`. Check them as met or unmet via `--checkCriterion crit-N --met true|false [--criterionNotes "..."]`. Gate 6 blocks termination with no criterion registered or any unchecked criterion; Gate 7 blocks termination with an unmet criterion unless followed by a revision thought or explicit `--newInsightNotes` justification.
5. **Anti-Hallucination Semantic Gates** — Before concluding, audit findings against the 5 P0 gates in `references/hallucination-gates.md`:
   - Entity & metric grounding (no unsourced prices or numbers).
   - Dual-source independence (no syndicated echo-chambers).
   - Temporal currency (verify version and recency).
   - **Negative search & disconfirmation** (actively query for counter-evidence via `--negativeQuery` and `--negativeFinding`).
   - Honest tool absence reporting.
6. **Standardized Conclusion Card** — Output final delivery using the calibrated structure from `references/conclusion-card.md` with explicit tags (`[Confirmed]`, `[Probable]`, `[Plausible]`, `[Contested]`, `[Unverified]`), qualitative confidence, and residual uncertainty. Never emit numeric scores. Session termination auto-emits the `buildLintReport` card summary.

---

## External Verification Contract

### Trigger (must be true, all of it)
- The task is **Path B** — never Path A.
- The argument depends on a **real-world factual claim**: a price, a statistic, a company fact, a release date, a support-matrix entry, or "does X still hold".
- The claim is **load-bearing**: if it flipped, the conclusion would change.

If the open-ended sub-questions are purely internal (design taste, team fit, architectural preference), the module **must not fire**.

### Protocol

1. **Pre-register before searching.**
   ```bash
   bun scripts/think.ts --registerClaim "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet" --supports hyp-1
   ```
   `--supports <hyp-id>` links the claim to the hypothesis it bears on; registering without it (or naming a nonexistent hypothesis) exits 1. Registration happens *before* any search call. Formulating a claim after seeing results is post-hoc rationalization and is prohibited by this contract.

   **Quoting:** any `--thought`, `--registerClaim`, `--claimNotes`, or `--hypothesisNotes` value containing `$`, a backtick, or `\` must use **single quotes** (`'...'`). Inside double quotes, bash silently expands `$<digit>` as a positional parameter — `$53K` arrives as `3K` with no warning and no error. Values without those characters may keep double quotes, as in the examples below.

   **Leading dash:** a value that starts with `-` must be bound with `=`. `--thought "--reset wipes state"` is rejected with `Option '--thought' argument is ambiguous` (exit 1); `--thought="--reset wipes state"` is accepted. The same applies to every string flag.

2. **Probe the session's real capabilities.**
   Use only search/fetch tools that are actually present in the current environment — whatever the session's native web search, URL fetch, browser, or installed MCP fetch tool happens to be (names differ per runtime; probe, don't assume). If none is available:
   ```bash
   bun scripts/think.ts --verifyClaim claim-1 --claimStatus unverified --claimNotes "No search or fetch tool available in this session"
   ```
   Never emit a search call that cannot run, and never describe a source you did not retrieve.

   If every available provider fails on the same query, switch to a different retrieval tool in the session (a second search backend, an MCP fetch/search tool, or a browser). Do not retry the same tool with rephrased queries — a full-provider failure is a tool problem, not a phrasing problem.

3. **Dual independent sources & Source Tiers.**
   - Consult `references/source-tiers.md` to classify sources into Tier 1 (primary/official), Tier 2 (reputable media/papers), Tier 3 (community blogs), or Tier 4 (disallowed AI summaries/farms).
   - `verified` — requires **≥ 2 independent sources** from Tier 1 or Tier 2 (different root domains, not syndicated), plus a `--claimTier <1-4>` per `--claimSource` classifying it against `references/source-tiers.md`, plus the evidence trio: a verbatim `--claimQuote`, the `--negativeQuery` you ran against the claim, and its `--negativeFinding`. The state machine rejects `verified` with fewer than 2 `--claimSource` values, with sources sharing the same root domain, with fewer than 2 sources at Tier 1/2 (multiple Tier 3/4 sources cannot elevate a claim), when `--claimTier` is missing, out of 1-4, or not one-per-`--claimSource`, or with any trio field missing.
     ```bash
     bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
       --claimSource "https://docs.aws.amazon.com/bedrock/..." \
       --claimSource "https://docs.anthropic.com/en/docs/..." \
       --claimTier 1 --claimTier 1 \
       --claimQuote "Prompt caching is available on Amazon Bedrock" \
       --negativeQuery "bedrock prompt caching unsupported" \
       --negativeFinding "None found; docs confirm support."
     ```
   - `single_source` — exactly one reliable source. Must be carried into the final answer with its uncertainty intact. `--claimNotes` is **required** for `single_source`, `unverified`, and `not_found` — the state machine rejects negative resolutions without a recorded caveat.
     ```bash
     bun scripts/think.ts --verifyClaim claim-2 --claimStatus single_source \
       --claimSource "https://example.com/blog/..." --claimNotes "Only one third-party blog; no official confirmation"
     ```

   **`verified` is self-attested.** `think.ts` never fetches a source. It enforces source *count*, root-domain independence, and the caller-declared `--claimTier` (a Tier 1/2 floor) and nothing else — whether a URL actually supports the claim it is attached to is the model's assertion, unverifiable from state.

4. **Negative Search Query (Active Falsification).**
   Before confirming a major factual proposition, perform at least one search query targeting counter-evidence or known failure modes (e.g. `"<subject> limitations known bugs issue"`). Record any discovered caveats.

5. **A negative result is a legitimate result.**
   `not_found` and `unverified` are successful verification outcomes. Report them as such. Never trade a precise "could not verify" for vague authoritative-sounding prose.
   ```bash
   bun scripts/think.ts --verifyClaim claim-3 --claimStatus not_found --claimNotes "Queried 3 phrasings; no public record"
   ```

6. **Termination is gated.**
   `--nextThoughtNeeded false` fails while any claim is still `pending`. Every pre-registered claim must reach an explicit resolution before the session can close. In Path B, termination additionally requires **≥ 2 prior thoughts** (at least one decompose and one synthesis round) and is rejected if the immediately preceding thought set `--needsMoreThoughts` — you cannot flag depth expansion and then conclude without another round.

   ### Termination gates 6–10 (Path B)

   | # | Gate name | Blocks termination while… |
   |---|---|---|
   | 6 | `criteria` | no `--addCriterion` entry exists, or any criterion is unchecked |
   | 7 | `criteriaRevision` | a criterion is `met=false` with no later `--isRevision` thought and the terminating thought carries no `--newInsightNotes` |
   | 8 | `lenses` | fewer than 2 distinct `--lens` names recorded via `--recordLens` |
   | 9 | `convergence` | the terminating thought does not declare `--newInsight false` and history has no revision/branch |
   | 10 | `falsificationResult` | any resolved (non-`merged`) hypothesis lacks a non-empty `--falsificationResult` |

   These five gates are switchable for evaluation ablation: `THINK_GATES_OFF` accepts a comma-separated list of gate names or `all`. A disabled gate's would-be violation is recorded and surfaced as a `[WARN]` line in the lint report instead of failing. The earlier gates (pending claims/hypotheses, minimum thought count, `--needsMoreThoughts`) are always on and cannot be disabled.

---

## CLI Reference

```bash
# Start a session (run before every new task)
bun scripts/think.ts --reset

# Submit a thought (--mode required on the first thought of a session)
bun scripts/think.ts \
  --mode path-b \
  --thought "analysis for this step" \
  --thoughtNumber 1 --totalThoughts 5 --nextThoughtNeeded true

# Revise an earlier thought (original is retained)
bun scripts/think.ts --thought "corrected analysis" \
  --thoughtNumber 3 --totalThoughts 5 --nextThoughtNeeded true \
  --isRevision --revisesThought 1

# Branch into an alternative line
bun scripts/think.ts --thought "alternative path" \
  --thoughtNumber 4 --totalThoughts 7 --nextThoughtNeeded true \
  --branchFromThought 2 --branchId alt-approach

# Expand depth beyond the original estimate
bun scripts/think.ts --thought "scope is larger than estimated" \
  --thoughtNumber 6 --totalThoughts 8 --nextThoughtNeeded true --needsMoreThoughts

# Hypothesis lifecycle (Path B)
bun scripts/think.ts --registerHypothesis "<competing option or hypothesis>" --falsification "<condition that would falsify it>"
bun scripts/think.ts --resolveHypothesis hyp-1 --hypothesisStatus selected \
  --hypothesisNotes "wins on latency and ops cost" --falsificationResult broken

# Acceptance criteria and lenses (termination gates 6-8)
bun scripts/think.ts --addCriterion "<target requirement>"
bun scripts/think.ts --checkCriterion crit-1 --met true --criterionNotes "backed by two sources"
bun scripts/think.ts --recordLens --lens "<lens name>" --finding "<residual uncertainty>"

# Claim lifecycle — --supports links each claim to a hypothesis
bun scripts/think.ts --registerClaim "<pre-registered factual statement>" --supports hyp-1
bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
  --claimSource "https://a.example" --claimSource "https://b.example" \
  --claimTier 1 --claimTier 1 \
  --claimQuote "<verbatim quote>" --negativeQuery "<counter-evidence query>" \
bun scripts/think.ts --verifyClaim claim-2 --claimStatus single_source \
  --claimSource "https://c.example" --claimNotes "only one source"
bun scripts/think.ts --verifyClaim claim-3 --claimStatus not_found --claimNotes "no public record"
bun scripts/think.ts --verifyClaim claim-4 --claimStatus unverified --claimNotes "no search tool in session"

# Converge and terminate (gate 9: declare --newInsight false, optional notes)
bun scripts/think.ts --thought "<synthesis>" --thoughtNumber 5 --totalThoughts 5 \
  --nextThoughtNeeded false --newInsight false --newInsightNotes "<why exploration is complete>"
# Ablation: disable gates 6-10 for evaluation runs
# THINK_GATES_OFF=criteria,lenses  or  THINK_GATES_OFF=all

# Inspect full state (thoughts, branches, claims)
bun scripts/think.ts --status
```

Status line returned after each thought:

```
[3/7] history=3 mode=path-b branches=alt-approach claims=claim-1,claim-2 next=true
```

### Flag reference

| Flag | Type | Notes |
|---|---|---|
| `--mode` | enum | `path-a` \| `path-b` — **required on the first thought**; immutable for the session |
| `--thought` | string | Thought content; a value starting with `-` needs `--thought=<value>` |
| `--thoughtNumber` | int ≥ 1 | Current index |
| `--totalThoughts` | int ≥ 1 | Estimate; auto-raised when `thoughtNumber` exceeds it (emits a `totalThoughts adjusted N->M` notice on stderr) |
| `--nextThoughtNeeded` | `true`\|`false` | `false` terminates — blocked while claims are pending or termination gates fail; any other value (e.g. `ture`, `yes`) exits 1 |
| `--isRevision` | flag | Marks this thought as a revision; requires `--revisesThought` |
| `--revisesThought` | int | Target thought index to revise; **requires `--isRevision`**; must exist in history |
| `--branchFromThought` | int | Target thought index to branch from; requires `--branchId`; must exist in history |
| `--branchId` | string | Branch label; **requires `--branchFromThought`** |
| `--needsMoreThoughts` | flag | Signals depth expansion |
| `--newInsight` | `true`\|`false` | Path B convergence gate 9: declaring `false` signals convergence; can include `--newInsightNotes` |
| `--newInsightNotes` | string | Rationale for convergence or absence of new insight |
| `--registerHypothesis` | string | Registers a competing hypothesis; assigns `hyp-N`, status `pending`; **requires `--falsification`** |
| `--falsification` | string | Concrete condition that would falsify the hypothesis; **requires `--registerHypothesis`** |
| `--resolveHypothesis` | string | Target hypothesis id |
| `--hypothesisStatus` | enum | `selected` \| `rejected` \| `synthesized` \| `merged`; **requires `--resolveHypothesis`** |
| `--hypothesisNotes` | string | Rationale recorded on the hypothesis; **requires `--resolveHypothesis`**; **required** for terminal resolutions (`selected`/`rejected`/`synthesized`) and `merged` |
| `--falsificationResult` | string | Outcome of falsification test (`held`/`broken`); **requires `--resolveHypothesis`**; **required** for terminal resolutions (`selected`/`rejected`/`synthesized`); **rejected** on `merged` — a merge is documented by `--mergedInto` alone, and a stale value is cleared when a resolved node is re-resolved to `merged` |
| `--mergedInto` | string | **Requires `--resolveHypothesis`**; **required** when `--hypothesisStatus merged`; names the surviving hypothesis. Rejected with any other status, and for self-references, nonexistent ids, already-merged targets, already-rejected targets, or a resolving hypothesis that already absorbs another merge. A survivor still absorbing a member cannot itself be re-resolved to `rejected`/`pending` (re-point the member first) — `selected`/`synthesized` stay allowed |
| `--addCriterion` | string | Registers an acceptance criterion for the session (assigns `crit-N`) |
| `--checkCriterion` | string | Criterion id to mark |
| `--met` | `true`\|`false` | Mark criterion as met or unmet; **requires `--checkCriterion`** |
| `--criterionNotes` | string | Context/notes for the criterion check; **requires `--checkCriterion`** |
| `--recordLens` | flag | Records a critical evaluation lens; requires `--lens` and `--finding` |
| `--lens` | string | Lens name (e.g. `pre-mortem`, `devil's advocate`); **requires `--recordLens`** |
| `--finding` | string | Key finding/residual uncertainty from applying the lens; **requires `--recordLens`** |
| `--registerClaim` | string | Pre-registration; assigns `claim-N`, status `pending`; **requires `--supports <hyp-id>`** in Path B |
| `--supports` | string | Target hypothesis id this claim provides evidence for; **requires `--registerClaim`** (required on registration in Path B) |
| `--verifyClaim` | string | Target claim id |
| `--claimStatus` | enum | `pending` \| `verified` \| `single_source` \| `unverified` \| `not_found`; **requires `--verifyClaim`** — `verified` claims are final; re-verification to any other status is rejected |
| `--claimSource` | string, repeatable | **Requires `--verifyClaim`**; ≥ 2 from distinct root domains (eTLD+1) required **only** for `verified`; IP literals compare by full address; a trailing root dot is normalised (`example.com.` = `example.com`); each value must be an http(s) URL or a bare `host/path` that names a domain (a `file:///`/`data:`/`foo/file`/single-label value is rejected); recorded `sources` are kept on a `pending` re-verify unless new ones are supplied |
| `--claimTier` | int 1-4, repeatable | **Requires `--verifyClaim`**; **required** for `verified`, one per `--claimSource` in the same order: the i-th tier classifies the i-th source against `references/source-tiers.md`. `verified` needs ≥ 2 sources at Tier 1/2 (multiple Tier 3/4 sources cannot elevate a claim). Optional for `single_source` / `unverified` / `not_found`, but whenever supplied it must be a canonical integer `1`–`4` (digits only — `1e0`/`0x1`/`+1`/`01` rejected) and one per `--claimSource` — a malformed vector exits 1 rather than being persisted; on a `pending` re-verify the recorded tiers are cleared |
| `--claimQuote` | string | Verbatim quote from source (required for `verified`); **requires `--verifyClaim`**; cleared on a `pending` re-verify |
| `--negativeQuery` | string | Search query targeting counter-evidence (required for `verified`); **requires `--verifyClaim`**; cleared on a `pending` re-verify |
| `--negativeFinding` | string | Caveats/contradictions found or statement of none (required for `verified`); **requires `--verifyClaim`**; cleared on a `pending` re-verify. Record it as two lines — `--negativeFinding "<command>\n<output>"` — so the search is auditable; the lint report flags single-line values, but only checks for the newline, it cannot verify a command ran |
| `--claimNotes` | string | **Requires `--verifyClaim`**; **required** for `single_source` / `unverified` / `not_found`; optional for `verified`; cleared on a `pending` re-verify |
| `--status` | flag | Full JSON state. Must run alone — combining with any other operation exits 1 |
| `--export` | flag | Prints a **lint report / fact sheet** (`buildLintReport`) derived from persisted state (CRIT/WARN/INFO sections, residuals, trace shape, evidence). Must run alone. Also auto-emitted after status line on termination |
| `--reset` | flag | Clears state for a new session; **must run alone** — combined with any other flag it exits 1 |
| `--help` | flag | Prints CLI usage summary and exits 0 |

**Verification-only flags require `--verifyClaim`.** `--claimStatus`, `--claimSource`, `--claimTier`, `--claimQuote`, `--negativeQuery`, `--negativeFinding`, and `--claimNotes` only have meaning inside the claim-verification branch; supplying any of them without `--verifyClaim` exits 1 rather than being parsed and ignored.

---

## Ground Rules

1. **No pseudo-quantitative scoring.** Never "confidence 8/10", "severity 3/3", "score 11/15". Numbers of that kind impersonate evidence. State the concrete fact or the concrete doubt in prose.
2. **No keyword/domain routing.** Classification is structural. A pure logic puzzle is Path A regardless of whether it mentions money or careers.
3. **No fixed framework quota.** Path A stops at agreement; Path B stops at the first round without new insight.
4. **No fabricated capabilities.** Use only tools demonstrably present in the session. A missing tool is reported, not simulated.
5. **No unbacked claims in documentation.** This skill's docs describe what `think.ts` and the tests actually do. They are not benchmarked or eval-scored.

---

## Examples

- `references/example-path-a.md` — closed-form kinship trap, 4 thoughts, zero claims.
- `references/example-path-b-verify.md` — open-ended architecture decision with pre-registration and mixed verification outcomes.

## State file

`scripts/.think_state.json` — append-only `thoughtHistory`, `branches` keyed by branch id, `claims` keyed by claim id, and `auditTrail` recording every side-command (`registerClaim`, `verifyClaim`, `registerHypothesis`, `resolveHypothesis`) in invocation order. Survives across invocations; `--reset` clears it. `--status` exposes `auditTrail` alongside `fullHistory`, `branchDetails`, `claimDetails`, and `hypothesisDetails`.

Two guards protect the file itself:

- **Terminated sessions are immutable.** Once a thought is recorded with `--nextThoughtNeeded false`, any further thought submission or side-command (`--registerClaim`, `--verifyClaim`, `--registerHypothesis`, `--resolveHypothesis`) exits 1 — restart with `--reset`. The machine cannot be driven past its own conclusion.
- **Corrupt state is never silently swallowed.** If the file is not valid JSON, the machine warns on stderr, renames it to `scripts/.think_state.json.bak` (forensics, best-effort) and starts a fresh session — the same contract as "no state file".

One path, shared by everything: the state file lives at one fixed location next to the script — it is not per-task or per-session. Concurrent reasoning tasks (or two sessions working in the same checkout) interleave into the same file, so `--reset` before each new task. `THINK_STATE_FILE` overrides the path when a session needs isolation.
