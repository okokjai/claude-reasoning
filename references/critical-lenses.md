# 12 Critical Lenses Menu (from claude-reasoning Stage 5 & Modes)

In **Path B (Open-Ended Reasoning)**, select **2–4** lenses that specifically challenge the problem's critical failure modes. Never enable all lenses reflexively.

---

## Core Red-Team & Dialectic Lenses

### 1. First Principles & Constraint Reduction
- **Focus**: Strip away conventions, analogies, and industry "best practices".
- **Question**: What are the irreducible physical, computational, or legal constraints? What assumptions are historical artifacts rather than actual limits?

### 2. Pre-Mortem & Active Red Team
- **Focus**: Assume the chosen approach has failed catastrophically 12 months in the future.
- **Question**: What killed it? What single unmonitored assumption caused the chain collapse?

### 3. Contrarian & Worst-Option Defense
- **Focus**: Forcibly argue the strongest possible case for the option initially ranked worst.
- **Question**: Under what specific boundary conditions or market shifts does the "bad" option become optimal?

### 4. Reversal & Assumption Inversion
- **Focus**: Take the central load-bearing assumption and invert it.
- **Question**: If latency matters 10× more than cost (or vice versa), how does the architecture change?

---

## Systemic, Scale & Boundary Lenses

### 5. Scale & Boundary Stress (0.01× / 100×)
- **Focus**: Evaluate the system at extremes.
- **Question**: Does this design hold at 100× load or 0.01× data volume? Where is the first non-linear cliff or degenerate failure mode?

### 6. Sensitivity Analysis (±20% Jitter)
- **Focus**: From Decision Mode. Perturb key quantitative assumptions (prices, latencies, failure rates, team capacity) by ±20%.
- **Question**: Does the ranking of options flip? If a ±10% shift changes the decision, the decision is brittle.

### 7. Pareto Frontier & Trade-off Explicitization
- **Focus**: From Optimization Mode. Identify the efficient frontier where no attribute can improve without degrading another.
- **Question**: What is explicitly traded away (e.g. consistency for availability, latency for simplicity)? Does any option dominate across all dimensions?

### 8. Differential Elimination (Diagnostic)
- **Focus**: From Diagnostic Mode. When debugging or choosing between competing explanations.
- **Question**: What evidence is inconsistent with Hypothesis A but consistent with Hypothesis B? Eliminate hypotheses that contradict verified observations.

---

## Operational & Governance Lenses

### 9. Second-Order & Incentive Effects
- **Focus**: What behavior will humans or downstream systems adopt once this choice is active?
- **Question**: Will engineers bypass this guardrail? Will upstream services throttle us? What perverse incentives are created?

### 10. Reversibility & One-Way Doors
- **Focus**: Jeff Bezos' Type 1 (irreversible) vs Type 2 (reversible) decisions.
- **Question**: How painful and costly is it to unwind this decision 6 months from now? Can we run a bounded experiment before committing?

### 11. Blast Radius & Degraded Mode
- **Focus**: Graceful degradation when external dependencies fail.
- **Question**: If the external API / database goes down for 4 hours, does the system fail safe, fail silent, or cascade crash?

### 12. Verifier Separation (Anti-Self-Serving Bias)
- **Focus**: The reasoning agent must not be its own uncritical cheerleader.
- **Rule**: Explicitly separate the *generator* of the proposal from the *critic*. When evaluating a proposal, audit it from the perspective of an adversarial auditor or downstream consumer.
