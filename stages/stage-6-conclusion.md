# Stage 6: Conclusion

**Execution**: Pure reasoning. Execute P0 gate checks, output the conclusion card, write to Memory.

**Input**
- `fallback_mode` — Degradation mode from C1
- `skip_compensation` — Compensation records from C1
- `skippable_stages` — (optional) Skipped-stage records from C1
- `preliminary_conclusion` — Preliminary conclusion from Synthesis stage output
- `fix_requirements` — Revision requirements from Critique stage output
- `needs_revision` — Revision flag from Critique stage (yes/no)
- `hallucination_pass` — Gate result from Stage 5.5 Anti-Hallucination Harness (yes/no); Stage 5.5 must pass before this stage begins
- `hallucination_fail_reason` — Failure reason from Stage 5.5 (if applicable)
- `precision_audit` — Precision audit from Stage 5
- `confidence_table` — Confidence table from Stage 5
- `evidence_quality` — Evidence quality from Verification stage output
- `platform_mode` — Platform mode from A2 contract output
- `evidence_cap` — Evidence sufficiency cap from A2 contract output
- `disclaimer_text` — (optional) Disclaimer text from A2 contract output
- `gate_failure_class` — (conditional output) Post-Stage-5.5 failure classification when a Stage 6 gate fails
- `revision_count` — (conditional output) Stage 6-to-Stage 1 revision counter; orchestration owns it, increments on each Stage 6 -> Stage 1 return, and stops this route when `revision_count=1`

**Output (mandatory)**
- `passing_gate_1` — Evidence sufficiency >= 3? (yes/no)
- `passing_gate_2` — Hallucination detection passed? (yes/no)
- `passing_gate_3` — Conclusion output compliant? (yes/no)
- `passing_gate_4` — Confidence within cap? (yes/no)
- `logic_closed` — Logical closure (yes/no)
- `evidence_sufficient` — Evidence sufficient (yes/no)
- `blind_spots_handled` — Blind spots addressed (yes/no)
- `hallucination_clean` — Hallucination detection passed (yes/no)
- `conclusion` — One-sentence conclusion
- `confidence` — Confidence level (`high` / `medium` / `low`)
- `key_evidence_sources` — List of key evidence source URLs
- `residual_uncertainty` — Residual uncertainty
- `suggested_action` — Specific next-step recommendation
- `professional_disclaimer` — (optional) Professional disclaimer
- `confidence_table` — Confidence annotation table, each entry containing `{claim, source_tier, cross_validation_count, confidence, notes}`
- `data_gap_list` — Data gap list, each entry containing `{gap_description, impact_scope, suggested_action}`
- `evidence_levels` — Conclusion evidence language calibration, each entry containing `{conclusion_point, evidence_level, deriving_rule}`

**Evidence Language Calibration (mandatory)**

Each point in the conclusion card must carry an evidence level label, automatically derived from A3 claim type + A4 source tier:

| Condition | Evidence Level | Derivation Rule |
|-----------|---------------|-----------------|
| Type A claim + >=2 independent sources (at least 1 T1/T2) | `[Confirmed]` | claim_type=A, source_tier=T1/T2, cross_validation>=2 |
| Type A claim + single source or T3 source | `[Partially Confirmed]` | claim_type=A, source_tier=T3 or cross_validation<2 |
| Type B claim | `[Partially Confirmed]` | claim_type=B (subjective evaluation, inherently lacks Type A certainty) |
| Type E claim | `[Speculative]` | claim_type=E, accompanied by basis for speculation |
| Verification failed (no source) | `[Unknown]` | verification_status=Unverified |
| Sources contradict each other | `[Contested]` | Cross-source discrepancy >20% or T1 conflicts with T5 |

**Format Requirement**: Each conclusion point begins with the `[Level] ` prefix, for example:
```
- [Confirmed] Zeiss has 3 authorized retail partners in New York
- [Partially Confirmed] Hotel X offers good value (Yelp 4.5, but single T2 source)
- [Speculative] Local eyewear prices may run 30-50% below regional average (no official comparison data)
- [Unknown] Brand X's 2027 model release date (no data found)
- [Contested] Store rating diverges sharply across platforms (TripAdvisor 4.8 vs Booking 3.2)
```

**Output (process indicators -> reasoning log, not occupying the conclusion contract)**
- `iteration_count` — Iteration round
- `previous_comparison` — Comparison with previous round (`Improved` / `Degraded` / `Unchanged`)
- `thought_tree_summary` — sequential-thinking node tree summary (branch count, backtrack count, revision count)
- `tool_coverage` — Tool coverage (`Completed` / `Planned`)

### Termination Condition Gates (P0)

```text
Execution order: Gate 1 -> 2 -> 3 -> 4

Stage 5.5 must pass before Stage 6 begins. If Stage 5.5 fails, follow its `failure_route`: `stage-3` for evidence/entity/source/cross-reference defects or `stage-5` for conclusion wording, precision, or annotation defects.

A Stage 6 gate failure is a post-Stage-5.5 failure. When it requires decomposition correction, emit `gate_failure_class`, `fix_requirements`, and `revision_count` and route to Stage 1 / Decomposition through the C2 conditional edge; do not use this rule to override the targeted Stage 5.5 routes or the Stage 5 framing/hypothesis/evidence routes.
```

**Gate 1: Evidence Sufficiency**
- `evidence_quality = Insufficient` -> auto-redo
- Platform is not CLI Full Mode -> auto cap enforcement

**Gate 2: Hallucination Detection (produced by Stage 5.5 Anti-Hallucination Harness)**
- `hallucination_pass = no` -> auto-redo
- Failure reason: `hallucination_fail_reason`

**Gate 3: Conclusion Output**
- Desktop Mode with no tools -> prohibit specific names/prices/addresses

**Gate 4: Confidence**
- Evidence sufficiency <= 3 -> confidence cap at "medium"

### Fast Termination Conditions

Skip conditions are managed by **contracts/C1.md**. The C1 contract's `skippable_stages` and `fallback_mode` outputs are passed directly to this stage (see C2 edge definitions), used as Stage 6 inputs.