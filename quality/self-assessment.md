# Reasoning Quality Self-Assessment

## Full Scale (Medium/Large Problems, 10 Dimensions, /50)

**Input**
- `logic_closed` — Logical closure from Stage 6 output (yes/no)
- `evidence_sufficient` — Evidence sufficiency from Stage 6 output (yes/no)
- `hallucination_clean` — Hallucination detection passed from Stage 6 output (yes/no)
- `hypothesis_count` — Hypothesis count from A2 contract output
- `primary_domain` — Primary domain from A1 contract output

**Output (mandatory)**
- `logic_score` — Logical closure (1-5)
- `evidence_score` — Evidence sufficiency (1-5)
- `freshness_score` — (optional) Data freshness (1-5, external data type only)
- `consistency_score` — Data consistency (1-5)
- `hypothesis_diversity` — Hypothesis diversity (1-5)
- `critique_depth` — Critique depth (1-5)
- `blind_spot_discovery` — Blind spot discovery (1-5)
- `actionability` — Conclusion actionability (1-5)
- `coverage_score` — Tool/theory coverage (1-5)
- `domain_fitness` — Domain fitness (1-5)
- `precision_score` — Precision (1-5)
- `total_score` — Total score
- `denominator` — Denominator (after deducting N/A dimensions). Rule: only external data type may deduct freshness_score (10 dimensions -> 9 dimensions -> /45); all other dimensions are mandatory, always /50
- `passing` — Whether passed (>=80% x quality_cap) (yes/no)
- `verdict` — Final determination (`Pass` / `Needs Improvement` / `Redo`)

## Simplified Scale (Small Problems, 5 Dimensions, /30)

**Input**
- `logic_closed` — Logical closure from Stage 6 output (yes/no)
- `evidence_sufficient` — Evidence sufficiency from Stage 6 output (yes/no)
- `hallucination_clean` — Hallucination detection passed from Stage 6 output (yes/no)
- `hypothesis_count` — Hypothesis count from A2 contract output
- `primary_domain` — Primary domain from A1 contract output

**Output (mandatory)**
- `logic_score` — Logical closure (1-6)
- `evidence_score` — Evidence sufficiency (1-6)
- `hypothesis_diversity` — Hypothesis diversity (1-6)
- `critique_depth` — Critique depth (1-6)
- `actionability` — Conclusion actionability (1-6)
- `precision_score` — Precision (1-6)
- `total_score` — Total score
- `denominator` — 30
- `passing` — Whether passed (>=80% x quality_cap) (yes/no)
- `verdict` — Final determination (`Pass` / `Needs Improvement` / `Redo`)

## Precision Scoring Criteria

| Score | Criteria |
|-------|----------|
| 5 | All domain-aware search paths completed + all negative searches executed + all Type A claims >=2 independent sources + all T3 data annotated + all data gaps listed |
| 4 | All domain-aware search paths completed + most negative searches executed + most Type A claims >=2 sources + most T3 data annotated |
| 3 | Most domain-aware search paths completed + negative searches executed + some Type A claims >=2 sources + some T3 data annotated |
| 2 | Some domain-aware search paths completed + some negative searches executed + some Type A claims with single source only + T3 data not annotated |
| 1 | Domain-aware search paths not completed + no negative searches + multiple Type A claims with single source only + significant T3 data unannotated |

## Precision Deduction Rules

> The canonical definition of deduction rules is in `stages/stage-5-critique.md` under the "Precision Perspective" section. Not repeated here; when modifying, refer to stage-5.

## Domain Fitness Scoring Criteria

| Domain | 5 Points | 3 Points | 1 Point |
|--------|----------|----------|---------|
| investment | Includes risk-adjusted return, Sharpe ratio, max drawdown | Has risk but no quantification | No risk analysis |
| finance | Includes tax efficiency, inflation adjustment, liquidity | Partial consideration | No consideration |
| career | Includes market trends, skill depreciation, geographic differences | Partial analysis | No market data |
| learning | Includes learning curve, prerequisite knowledge, time planning | Partial planning | Unstructured |
| relationship | Non-quantitative factors clearly marked as user self-assessment | Mentioned but incomplete | Model-assigned weights |
| tech | Includes technology maturity, ecosystem, learning cost | Partial analysis | No technical assessment |
| daily | Includes price reasonableness, timeliness, localization | Partial consideration | No timeliness |
| general | Logical closure + execution feasibility | Basically complete | Missing key elements |

## Self-Assessment Prerequisite Checks (P0)

```
Execution order: Check A -> B -> C -> D -> Scoring Dimensions
Prerequisite check not passed -> do not fill scores, output "Redo" directly
```

**Check A: Tool Availability**
- [ ] unified-fetch/Desktop available? {unified-fetch / Desktop}
- [ ] If unavailable -> evidence sufficiency cap applies automatically

**Check B: Hallucination Detection (produced by Stage 5.5 Anti-Hallucination Harness)**
- [ ] `hallucination_pass` = yes? (Stage 5.5 all three checks passed)
- [ ] Unsourced entity hallucinations >= 3 or citation hallucinations >= 1 -> directly determine "Redo"

**Check C: Case-Rule Cross-Reference**
- [ ] Does each specific entity have a URL source?
- [ ] Unsourced specific entities > 0 and tool available -> supplement research/browse

**Check D: Verifier Separation**
- [ ] Are the verified fields (evidence score/hallucination/gates) sourced from a different perspective than the verification perspective?
- [ ] If the same text produces both evidence score and hallucination determination -> treat as self-reporting, reassign perspectives
- [ ] **Recommended entity verification (P0)**: If the conclusion includes specific entities recommended for consumer visits/purchases
  -> Must have independent entity existence verification records (map + business registry + independent reviews, all three passed)
  -> Any one not passed -> that entity must not be recommended
  -> If all candidate entities fail -> **directly determine "Redo"**

**Check E: Precision (P0)**
- [ ] Are all domain-aware search paths completed? (Refer to A2 contract `verification_paths`, generated per `primary_domain`)
- [ ] Were negative searches executed? (Each positive search has a corresponding negative search)
- [ ] Are source quality annotations completed? (Each piece of evidence has a T1-T5 tier)
- [ ] Are T3 source numbers annotated "not independently verified"?
- [ ] Are data gaps listed?
- [ ] Is the precision score >=3 (5-point scale) or >=4 (6-point scale)?
- [ ] Any one not passed -> deduct points and annotate the issue