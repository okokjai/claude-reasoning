# Design: Lens & Reasoning Redesign (v3.2.0)

Date: 2026-10-08 · Target release: 3.2.0 · Status: approved-in-chat, pending spec review

## Problem

`claude-reasoning` (v3.0.9) has 4 architectural deficiencies in its lenses and reasoning subsystem:

1. **Lenses lack teeth & semantic linkage (Facts 2, 3, 5):**
   - `--recordLens` only checks that `--lens` and `--finding` are non-empty. Gate 8 only checks `distinctLenses.size >= 2`.
   - Lenses are unconnected to hypotheses, criteria, or claims; dummy lenses like `a` / `.` pass Gate 8. Tests use throwaway strings (`L1`, `a`, `devil`), so strict whitelisting would break backwards compatibility.
   - CHANGELOG 3.0.6 documented "lens gate checks structure not content" as a known intentional limitation.

2. **No proactive guidance (Fact 4, P1):**
   - The CLI state machine only rejects upon termination (`exit 1` at final thought).
   - Models wander without knowing what is missing until the very end, resulting in high termination rejection rates.

3. **Prose declaration instead of computation (Facts 6, 10, P2):**
   - Sensitivity analysis, Pareto frontiers, and hypothesis elimination are written in prose rather than computed.
   - Example 6 demonstrates post-hoc labeling: Sensitivity claims "<5% cost swing" with zero numbers; hypotheses are declared resolved before lenses are even evaluated.

4. **Document drift & inconsistent lens taxonomy (Facts 7, 8):**
   - `critical-lenses.md` has 12 lenses, `SKILL.md` lists 7, `README.md` mentions non-existent lenses ("Red-Team Attack", "Edge Case").
   - `today()` runs on local time (`think.ts:112`), but `SKILL.md:18` and `hallucination-gates.md:23` claim UTC.
   - `think.ts` header is stale (3.0.8).

## Principles

- **P1. Real-time feedback at every step:** Every command outputs `ready=yes|no blockers=...` or `next: [...]` indicating unmet prerequisites.
- **P2. Computation over self-reporting:** Script deterministically computes Lens 6 (Sensitivity), Lens 7 (Pareto), and Lens 8 (ACH).
- **P3. Suggest first, block later:** Round 1 introduces recommendations, lint WARNs, and guidance without new `exit 1` blockers.
- **P4. Pure addition & backwards compatibility:** Unflagged sessions retain legacy behavior; Path A remains untouched.

---

## Decisions (Locked in Brainstorming)

1. **Normalization with 5% threshold:**
   - In Lens 6/7/8 calculations, when `(max - min) / max < 0.05`, alternatives are treated as equivalent (no artificial gap magnification).
2. **`pendingActions` architecture:**
   - Implemented as an independent pure function `pendingActions(state): string[]`.
   - Verified by strict consistency tests: `pendingActions(state).length === 0 <=> Gate termination passes`.
3. **Safe output channel:**
   - JSON output: Add `next: string[]` to side-command JSON.
   - Thought status line: Append `ready=<yes|no> blockers=<count>` at the end.
   - `--status`: Add `pending: string[]`.
   - Strictly avoid trailing text after JSON to protect `JSON.parse` callers.
4. **Lens Catalog & Kind system:**
   - 11 formal lenses defined in a machine-readable catalog (`src/catalog.ts` or `scripts/think.ts`).
   - `--kind <kind>` option for Path B's first thought; mixes core lenses and optional lenses.
   - Risk declaration (`--risk <low|high>`) guides suggested lens count (2 vs 3-4).
5. **Deterministic `--analyze` side-command:**
   - Subcommands: `sensitivity`, `pareto`, `ach`.
   - Automatically writes to `state.lenses` marked with `computed: true` and renders into Reasoning Trace.
6. **`falsificationResult` convention:**
   - Standard prefix `survived:` or `falsified:`.
   - Lint warns on contradictions (e.g. `selected` with `falsified:`, or `rejected` with `survived:` without `[PREFERENCE]`).

---

## Changes

### 1. Lens Catalog & Problem Kinds

#### Catalog Structure
11 lenses (Lens 12 deferred to Round 2):
- `lens-1`: First Principles & Constraint Reduction (`prose`)
- `lens-2`: Pre-Mortem & Active Red Team (`state-delta`)
- `lens-3`: Contrarian & Worst-Option Defense (`state-delta`)
- `lens-4`: Reversal & Assumption Inversion (`state-delta`)
- `lens-5`: Scale & Boundary Stress (`prose`)
- `lens-6`: Sensitivity Analysis (`computed`)
- `lens-7`: Pareto Frontier (`computed`)
- `lens-8`: Differential Elimination / ACH (`computed`)
- `lens-9`: Second-Order & Incentive Effects (`state-delta`)
- `lens-10`: Reversibility & One-Way Doors (`state-delta`)
- `lens-11`: Blast Radius & Degraded Mode (`state-delta`)

#### Problem Kinds Mapping Table
| kind | Core Lenses | Optional (+1) | Required Artifact | Verification |
|---|---|---|---|---|
| `diagnostic` | 8 (ACH), 1 | 5, 11 | Evidence x Hypotheses matrix; >=1 eliminated | computed + state |
| `decision` | 6 (Sensitivity), 10, 3 | 2, 9 | Winner stability under +/-20%; defense of worst | computed + state |
| `design` | 7 (Pareto), 5, 11 | 2, 10 | Explicit trade-offs & sacrifices | computed + criterion |
| `optimization`| 7 (Pareto), 6, 5 | 1 | Quantitative bottleneck measurement | prose + measurement |
| `innovation` | 1, 4, 3 | 2 | Solution overthrowing default assumptions | state |
| `planning` | 9, 2, 10 | 3 | Failure branches & unwind cost | state |

- `--kind`: Accepted on Thought 1 in Path B; Path A exits 1. Immutable thereafter.
- `--listLenses`: Prints catalog formatted by kind.

### 2. Guidance Engine: `pendingActions(state)`

Checks:
- Gate 3/3b: Active hypotheses count < 2 or any hypothesis pending.
- Gate 6: Criteria count == 0 or any criterion unchecked.
- Gate 7: Unmet criteria missing revision or `--newInsightNotes` rationale.
- Gate 8: Distinct lenses < 2.
- Gate 9: Termination missing convergence declaration or prior exploration.
- Gate 10: Resolved hypothesis missing `falsificationResult`.
- Gate 11: Unclosed branch.
- Claims: Unlinked or pending verification claims.

Outputs:
- Side commands: `{"next": [...]}`
- Thought status line: `... ready=yes|no blockers=...`
- `--status`: `{"pending": [...]}`

### 3. Computation Engine: `--analyze`

Syntax:
`bun scripts/think.ts --analyze <sensitivity|pareto|ach> --data '<json>'`

1. **`sensitivity`**:
   - Input: candidates, criteria with weights, candidate scores per criterion.
   - Algorithm: Perturbs weights and scores by $\pm 20\%$. Checks if top candidate rank flips. 5% span threshold.
2. **`pareto`**:
   - Input: candidates with multi-objective metrics (maximize/minimize flags).
   - Algorithm: Computes non-dominated set. Flags dominated choices.
3. **`ach`**:
   - Input: hypotheses and evidence items (credibility, weight, consistency matrix: C/I/N).
   - Algorithm: Calculates inconsistency scores. Sorts hypotheses by least contradictory evidence.

Output:
- Persists result to `state.lenses` as `{ lens, finding, computed: true }`.
- Injects formatted markdown table into `Reasoning Trace`.

### 4. Hypothesis Hardening: `--flipIf` & Falsification Linting

- `--flipIf "<observable condition>"`: Optional flag on `--updateHypothesis`. Warns if missing when selecting a hypothesis.
- Added as a column in Reasoning Trace Hypotheses table.
- `falsificationResult` convention:
  - If `selected`/`synthesized` starts with `falsified:`, emit WARN.
  - If `rejected` starts with `survived:` and notes lack `[PREFERENCE]`, emit WARN.

### 5. Lint Heuristics (Soft WARNs)

- Lens finding or `--newInsightNotes` < 20 characters.
- Duplicate findings across different lenses.
- Lens name not recognized in catalog (suggests standard alias).
- Finding mentions no hypothesis or criterion ID (INFO).

### 6. Doc & Reference Updates

- Refresh `references/example-path-b-verify.md` with realistic numbers and proper execution sequence.
- Synchronize lens lists across `SKILL.md`, `README.md`, and `critical-lenses.md`.
- Remove stale "Stage 5 & Modes" references.
- Align date references to local time (`today()`).
- Bump version to `3.2.0` across all 5 surfaces.

---

## Verification & Acceptance Criteria

1. **Deterministic Test Suite (`tests/round7.test.ts`):**
   - Consistency assertion: `pendingActions(state).length === 0 <=> termination succeeds`.
   - Single-character lens warnings.
   - Path A rejects `--kind` or `--analyze` with `exit 1`.
   - `--analyze` produces deterministic output and records to lenses and trace.
   - Full test suite passes without regressions (289 pass + new tests).
2. **Trace & Audit Trail Metrics:**
   - Measure termination rejection reduction.
   - Verification of state changes following lens evaluation.
3. **Golden Problem Set A/B Testing:**
   - 6 test cases (1 per kind) run in independent sessions with clean state files.
4. **Clean typecheck and test runs:**
   - `bun run typecheck` passes with 0 errors.
   - `bun test` passes completely.
