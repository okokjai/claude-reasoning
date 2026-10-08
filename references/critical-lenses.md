# Critical Lenses Menu (11-Lens Catalog)

In **Path B (Open-Ended Reasoning)**, select **2–4** lenses that specifically challenge the problem's critical failure modes. Never enable all lenses reflexively.

The menu below mirrors `LENS_CATALOG` in `scripts/think.ts` — the same list is printed by `bun scripts/think.ts --listLenses` (optionally `--kind <kind>` to sort a problem kind's core lenses first). Three lenses are **computed**: `--analyze sensitivity|pareto|ach --data '<json>'` produces a deterministic result persisted as a lens finding.

---

## Core Red-Team & Dialectic Lenses

### lens-1. First Principles & Constraint Reduction (`prose`)
- **Focus**: Strip away conventions, analogies, and industry "best practices".
- **Question**: What are the irreducible physical, computational, or legal constraints? What assumptions are historical artifacts rather than actual limits?
- **Primary kinds**: `diagnostic`, `innovation`, `optimization`

### lens-2. Pre-Mortem & Active Red Team (`state-delta`)
- **Focus**: Assume the chosen approach has failed catastrophically 12 months in the future.
- **Question**: What killed it? What single unmonitored assumption caused the chain collapse?
- **Primary kinds**: `decision`, `design`, `innovation`, `planning`

### lens-3. Contrarian & Worst-Option Defense (`state-delta`)
- **Focus**: Forcibly argue the strongest possible case for the option initially ranked worst.
- **Question**: Under what specific boundary conditions or market shifts does the "bad" option become optimal?
- **Primary kinds**: `decision`, `innovation`, `planning`

### lens-4. Reversal & Assumption Inversion (`state-delta`)
- **Focus**: Take the central load-bearing assumption and invert it.
- **Question**: If latency matters 10× more than cost (or vice versa), how does the architecture change?
- **Primary kinds**: `innovation`

---

## Systemic, Scale & Boundary Lenses

### lens-5. Scale & Boundary Stress (`prose`, 0.01× / 100×)
- **Focus**: Evaluate the system at extremes.
- **Question**: Does this design hold at 100× load or 0.01× data volume? Where is the first non-linear cliff or degenerate failure mode?
- **Primary kinds**: `diagnostic`, `design`, `optimization`

### lens-6. Sensitivity Analysis (`computed`, ±20% Jitter)
- **Focus**: Perturb key quantitative assumptions (prices, latencies, failure rates, team capacity) by ±20% — run via `--analyze sensitivity --data '{"candidates":[...],"criteria":[...]}'`.
- **Question**: Does the ranking of options flip? If a ±10% shift changes the decision, the decision is brittle.
- **Primary kinds**: `decision`, `optimization`

### lens-7. Pareto Frontier (`computed`)
- **Focus**: Identify the efficient frontier where no attribute can improve without degrading another — run via `--analyze pareto --data '{"candidates":[...],"objectives":[...]}'`.
- **Question**: What is explicitly traded away (e.g. consistency for availability, latency for simplicity)? Does any option dominate across all dimensions?
- **Primary kinds**: `design`, `optimization`

### lens-8. Differential Elimination / ACH (`computed`)
- **Focus**: When debugging or choosing between competing explanations — run via `--analyze ach --data '{"hypotheses":[...],"evidence":[...]}'` (matrix entries `C`/`I`/`N`).
- **Question**: What evidence is inconsistent with Hypothesis A but consistent with Hypothesis B? Eliminate hypotheses that contradict verified observations.
- **Primary kinds**: `diagnostic`

---

## Operational & Governance Lenses

### lens-9. Second-Order & Incentive Effects (`state-delta`)
- **Focus**: What behavior will humans or downstream systems adopt once this choice is active?
- **Question**: Will engineers bypass this guardrail? Will upstream services throttle us? What perverse incentives are created?
- **Primary kinds**: `decision`, `planning`

### lens-10. Reversibility & One-Way Doors (`state-delta`)
- **Focus**: Jeff Bezos' Type 1 (irreversible) vs Type 2 (reversible) decisions.
- **Question**: How painful and costly is it to unwind this decision 6 months from now? Can we run a bounded experiment before committing?
- **Primary kinds**: `decision`, `design`, `planning`

### lens-11. Blast Radius & Degraded Mode (`state-delta`)
- **Focus**: Graceful degradation when external dependencies fail.
- **Question**: If the external API / database goes down for 4 hours, does the system fail safe, fail silent, or cascade crash?
- **Primary kinds**: `diagnostic`, `design`
