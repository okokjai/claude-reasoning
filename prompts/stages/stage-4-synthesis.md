# Stage 4: Synthesis

**Execution**: Pure reasoning, merging evidence from all branches. No tools used.

**Input**
- `evidence_matrix` — Evidence matrix from Verification stage output
- `cross_validation` — Cross-validation results from Verification stage output
- `evidence_quality` — Evidence quality determination from Verification stage output
- `claim_registry` — Updated claim registry from Verification stage output
- `source_quality_matrix` — Source quality matrix from Verification stage output
- `claim_verification_status` — Claim verification status aggregate from Verification stage output
- `data_gap_list` — Data gap list from Verification stage output

**Output (mandatory)**
- `confirmed_facts` — Facts well-supported by evidence
- `contradictory_evidence_ref` — Contradictory evidence reference — refers to entries from Stage 3 evidence_matrix where `confidence_bucket`=`low`; no longer recorded independently
- `insufficient_evidence` — Matters with insufficient evidence requiring judgment
- `preliminary_conclusion` — Coherent preliminary conclusion
- `residual_uncertainty` — Unresolved issues and risks
- `source_quality_matrix` — Source quality matrix carried into critique
- `claim_verification_status` — Claim verification status carried into critique
- `data_gap_list` — Data gaps carried into critique
- `claim_registry` — Updated claim registry carried to Stage 5.5
- `domain_specific_analysis` — (optional) Domain-specific analysis (e.g., risk-adjusted return for investments, non-quantitative factors for interpersonal matters)

> **Note**: `contradictory_evidence_ref` is a reference index to the Stage 3 evidence_matrix, avoiding duplicate recording of contradictory evidence in both Stage 3 and Stage 4. Format: `[{hypothesis, source_anchor}]` (referencing entries from Stage 3 where `confidence_bucket`=`low`).