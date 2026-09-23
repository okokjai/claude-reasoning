---
name: claude-reasoning
version: 2.1.4
description: "Structurally adaptive reasoning with claim-gated external verification. Routes by problem structure (closed-form vs open-ended), never by keyword or domain matching. Path A (closed-form): 3-5 thoughts with independent cross-validation, zero claim overhead. Path B (open-ended): adaptive depth, competing hypotheses, 2-4 critical lenses, conditional claim pre-registration with dual-source enforcement. Zero MCP dependencies. Use when reasoning through a bug, a decision, a design critique, an architecture tradeoff, a multi-step analysis, or any open-ended question needing verified external facts — before answering, not after."
---

# claude-reasoning 2.1.4

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

**Prohibited in Path A**: `--registerClaim`, `--verifyClaim`, any external search, depth expansion beyond 5.

Terminate as soon as the two independent methods agree: `--nextThoughtNeeded false`.

Rationale, measured: closed-form logic questions that were run through a fixed 11-node framework produced 6 of 6 trail entries with zero captured insight. Depth must be earned by disagreement, not scheduled.

---

## Path B: Open-Ended Adaptive Reasoning

**No fixed round count. Converge when a round yields no new insight.**

1. **Decompose** — Split into essential sub-questions. Discard sub-questions that cannot change the decision.
2. **Competing hypotheses** — For each load-bearing sub-question, state **≥ 2 mutually competing** hypotheses or options. A single option is not reasoning. Register each via `--registerHypothesis` and resolve each before terminating (`selected`, `rejected`, `synthesized`, or `merged`); Path B termination is rejected while fewer than 2 hypotheses are registered, any remains `pending`, or merges leave fewer than 2 distinct surviving hypotheses. Use `merged` (with `--mergedInto <id>`) when a hypothesis turns out to be the same underlying mechanism as another, viewed from a different angle — this is a decomposition correction, not a competing explanation, and should be recorded as such rather than forced into `synthesized`. `--mergedInto` rejects self-references, nonexistent ids, and already-merged targets (no merge chains); a hypothesis that already absorbs another merge likewise cannot be merged onward. Passing it with any status other than `merged` is rejected.
3. **Critical lenses** — Choose **2–4** that the task actually needs from `references/critical-lenses.md`; never enable all by reflex:
   - **First principles & constraint reduction** — reduce to irreducible constraints.
   - **Pre-mortem & active red team** — assume catastrophic failure 12 months out; identify what killed it.
   - **Sensitivity analysis (±20% perturbation)** — perturb key numerical or capacity assumptions; check if rankings flip.
   - **Scale & boundary stress (0.01× / 100×)** — evaluate non-linear cliffs at degenerate extremes.
   - **Pareto frontier & trade-off explicitization** — make sacrifice explicit; identify non-dominated options.
   - **Differential elimination** — systematically rule out hypotheses contradicted by verified facts.
   - **External verification** — **condition-gated, see below.**
4. **Anti-Hallucination Semantic Gates** — Before concluding, audit findings against the 5 P0 gates in `references/hallucination-gates.md`:
   - Entity & metric grounding (no unsourced prices or numbers).
   - Dual-source independence (no syndicated echo-chambers).
   - Temporal currency (verify version and recency).
   - **Negative search & disconfirmation** (actively query for counter-evidence, e.g. limitations or issues).
   - Honest tool absence reporting.
5. **Standardized Conclusion Card** — Output final delivery using the calibrated structure from `references/conclusion-card.md` with explicit tags (`[Confirmed]`, `[Probable]`, `[Plausible]`, `[Contested]`, `[Unverified]`), qualitative confidence, and residual uncertainty. Never emit numeric scores.

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
   bun scripts/think.ts --registerClaim "AWS Bedrock supports prompt caching for Claude 3.5 Sonnet"
   ```
   Registration happens *before* any search call. Formulating a claim after seeing results is post-hoc rationalization and is prohibited by this contract.

   **Quoting:** any `--thought`, `--registerClaim`, `--claimNotes`, or `--hypothesisNotes` value containing `$`, a backtick, or `\` must use **single quotes** (`'...'`). Inside double quotes, bash silently expands `$<digit>` as a positional parameter — `$53K` arrives as `3K` with no warning and no error. Values without those characters may keep double quotes, as in the examples below.

2. **Probe the session's real capabilities.**
   Use only search/fetch tools that are actually present in the current environment — whatever the session's native web search, URL fetch, browser, or installed MCP fetch tool happens to be (names differ per runtime; probe, don't assume). If none is available:
   ```bash
   bun scripts/think.ts --verifyClaim claim-1 --claimStatus unverified --claimNotes "No search or fetch tool available in this session"
   ```
   Never emit a search call that cannot run, and never describe a source you did not retrieve.

   If every available provider fails on the same query, switch to a different retrieval tool in the session (a second search backend, an MCP fetch/search tool, or a browser). Do not retry the same tool with rephrased queries — a full-provider failure is a tool problem, not a phrasing problem.

3. **Dual independent sources & Source Tiers.**
   - Consult `references/source-tiers.md` to classify sources into Tier 1 (primary/official), Tier 2 (reputable media/papers), Tier 3 (community blogs), or Tier 4 (disallowed AI summaries/farms).
   - `verified` — requires **≥ 2 independent sources** from Tier 1 or Tier 2 (different root domains, not syndicated). The state machine rejects `verified` with fewer than 2 `--claimSource` values or with sources sharing the same root domain.
     ```bash
     bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
       --claimSource "https://docs.aws.amazon.com/bedrock/..." \
       --claimSource "https://docs.anthropic.com/en/docs/..."
     ```
   - `single_source` — exactly one reliable source. Must be carried into the final answer with its uncertainty intact. `--claimNotes` is **required** for `single_source`, `unverified`, and `not_found` — the state machine rejects negative resolutions without a recorded caveat.
     ```bash
     bun scripts/think.ts --verifyClaim claim-2 --claimStatus single_source \
       --claimSource "https://example.com/blog/..." --claimNotes "Only one third-party blog; no official confirmation"
     ```

4. **Negative Search Query (Active Falsification).**
   Before confirming a major factual proposition, perform at least one search query targeting counter-evidence or known failure modes (e.g. `"<subject> limitations known bugs issue"`). Record any discovered caveats.

5. **A negative result is a legitimate result.**
   `not_found` and `unverified` are successful verification outcomes. Report them as such. Never trade a precise "could not verify" for vague authoritative-sounding prose.
   ```bash
   bun scripts/think.ts --verifyClaim claim-3 --claimStatus not_found --claimNotes "Queried 3 phrasings; no public record"
   ```

6. **Termination is gated.**
   `--nextThoughtNeeded false` fails while any claim is still `pending`. Every pre-registered claim must reach an explicit resolution before the session can close. In Path B, termination additionally requires **≥ 2 prior thoughts** (at least one decompose and one synthesis round) and is rejected if the immediately preceding thought set `--needsMoreThoughts` — you cannot flag depth expansion and then conclude without another round.

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
bun scripts/think.ts --registerHypothesis "<competing option or hypothesis>"
bun scripts/think.ts --resolveHypothesis hyp-1 --hypothesisStatus selected --hypothesisNotes "wins on latency and ops cost"

# Claim lifecycle
bun scripts/think.ts --registerClaim "<pre-registered factual statement>"
bun scripts/think.ts --verifyClaim claim-1 --claimStatus verified \
  --claimSource "https://a.example" --claimSource "https://b.example"
bun scripts/think.ts --verifyClaim claim-2 --claimStatus single_source \
  --claimSource "https://c.example" --claimNotes "only one source"
bun scripts/think.ts --verifyClaim claim-3 --claimStatus not_found --claimNotes "no public record"
bun scripts/think.ts --verifyClaim claim-4 --claimStatus unverified --claimNotes "no search tool in session"

# Inspect full state (thoughts, branches, claims)
bun scripts/think.ts --status
```

Status line returned after each thought:

```
[3/7] history=3 branches=alt-approach claims=claim-1,claim-2 next=true
```

### Flag reference

| Flag | Type | Notes |
|---|---|---|
| `--mode` | enum | `path-a` \| `path-b` — **required on the first thought**; immutable for the session |
| `--thought` | string | Thought content |
| `--thoughtNumber` | int ≥ 1 | Current index |
| `--totalThoughts` | int ≥ 1 | Estimate; auto-raised when `thoughtNumber` exceeds it |
| `--nextThoughtNeeded` | bool | `false` terminates — blocked while claims are pending |
| `--isRevision` / `--revisesThought N` | flag / int | Both required together |
| `--branchFromThought N` / `--branchId label` | int / string | Both required together |
| `--needsMoreThoughts` | flag | Signals depth expansion |
| `--registerHypothesis` | string | Registers a competing hypothesis; assigns `hyp-N`, status `pending` |
| `--resolveHypothesis` | string | Target hypothesis id |
| `--hypothesisStatus` | enum | `selected` \| `rejected` \| `synthesized` \| `merged` |
| `--hypothesisNotes` | string | Optional rationale recorded on the hypothesis |
| `--mergedInto` | string | **Required** when `--hypothesisStatus merged`; names the surviving hypothesis. Rejected with any other status, and for self-references, nonexistent ids, already-merged targets, or a resolving hypothesis that already absorbs another merge |
| `--registerClaim` | string | Pre-registration; assigns `claim-N`, status `pending` |
| `--verifyClaim` | string | Target claim id |
| `--claimStatus` | enum | `verified` \| `single_source` \| `unverified` \| `not_found` |
| `--claimSource` | string, repeatable | ≥ 2 from distinct root domains required **only** for `verified` |
| `--claimNotes` | string | **Required** for `single_source` / `unverified` / `not_found`; optional for `verified` |
| `--status` | flag | Full JSON state |
| `--reset` | flag | Clears state for a new session |

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

`scripts/.think_state.json` — append-only `thoughtHistory`, `branches` keyed by branch id, `claims` keyed by claim id, and `auditTrail` recording every side-command (`registerClaim`, `verifyClaim`, `registerHypothesis`, `resolveHypothesis`) in invocation order. Survives across invocations; `--reset` clears it. `--status` exposes `auditTrail` alongside `fullHistory`, `branchDetails`, and `claimDetails`.
