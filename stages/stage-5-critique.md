# Stage 5: Critique (using sequential-thinking)

**Execution**: Invoke the `sequentialthinking` tool, opening a separate branch for each critique perspective. If a blind spot is discovered, **backtrack and revise the corresponding hypothesis branch from the Hypothesis stage**.

**Precondition Check**: If `can_branch=false`, skip the sequentialthinking call and proceed with linear reasoning output; record perspectives as text, and record revisions in `revision_branches` as text.

```
sequentialthinking call example (perspective branches):
  thought: "L4: Correctness perspective — [analysis]"
  thoughtNumber: 9
  totalThoughts: 14
  branchFromThought: 1
  branchId: "critique-correctness"
  nextThoughtNeeded: true

  thought: "L4: Risk perspective — [analysis]"
  thoughtNumber: 10
  totalThoughts: 14
  branchFromThought: 1
  branchId: "critique-risk"
  nextThoughtNeeded: true
```

```
sequentialthinking call example (blind spot found, backtrack and revise):
  // Backtracking only uses sequential-thinking when can_branch=true
  // If can_branch=false, record as text in revision_branches
  thought: "Critique: blind spot — Hypothesis A ignored inflation"
  thoughtNumber: 11
  totalThoughts: 14
  branchFromThought: 4         // From Hypothesis stage, Hypothesis A branch
  branchId: "revision-A"
  isRevision: true
  revisesThought: 4
  nextThoughtNeeded: true

  thought: "Hypothesis stage (revised): Hypothesis A now includes inflation adjustment..."
  thoughtNumber: 12
  totalThoughts: 14
  branchFromThought: 4
  branchId: "revision-A"
  isRevision: true
  revisesThought: 4
  nextThoughtNeeded: true

  // After revision, re-execute the Verification stage
  // -> Invoke unified-fetch to verify the revised hypothesis
  // -> Write results into revision-A branch
  thought: "Verification stage (revised verification): Re-verifying Hypothesis A (post-inflation adjustment)..."
  thoughtNumber: 13
  totalThoughts: 14
  branchFromThought: 4
  branchId: "revision-A"
  nextThoughtNeeded: true
```

**Backtrack Termination Condition**: Revision limit of 3 per round; beyond that, force progression to the Conclusion stage, accept residual uncertainty, and explicitly mark unaddressed blind spots in `residual_uncertainty`.

### Verifier Separation Rules (P0)

```
Critique Stage internal perspective division:
  Critique perspective (Preliminary Hallucination Screen) — produces `hallucination_check` as a non-authoritative diagnostic
  Correctness perspective (P0 Gate) — independently verifies passing_gate_1 ~ gate_4 before the Conclusion stage
  The two must not share the same self-assessment paragraph
```

**Problem Reframing Check (required for every mode)**

Run one lightweight framing stress test in addition to the existing critique perspectives. This perspective is separate from Hallucination Detection and must consume the Stage 0 candidate framing without treating it as evidence. Select exactly one `stress_axis` from `risk`, `scale`, `time`, `constraint`, or `stakeholder`, then create exactly one `harder_frame` that preserves the question while making that axis harder. Test whether the `preliminary_conclusion` survives against the harder frame. Do not rerun Stage 0's DIVERGE, ATTEND, or CONVERGE phases here.

The Stage 0 route is bounded by `stage_0_revision_count < 1`. Set `revision_target: stage-0` only when the problem definition itself is invalid (for example, the selected frame does not represent the user's problem or a material constraint makes the question ill-posed); this is a framing revision, not a normal hypothesis revision. A framing mismatch that can be handled without changing the problem definition is a separately classified decomposition mismatch and may target Stage 1. If `stage_0_revision_count == 1` and the defect is still a framing defect, set `revision_target: none` and record the unresolved framing issue in `residual_uncertainty`; do not route that defect to Stage 1. Preserve the existing routes: a hypothesis defect targets Stage 2, and an evidence defect targets Stage 3. Never route a framing defect to Stage 2 or Stage 3 merely because its consequences appear there.

```yaml
problem_reframing_check:
  original_frame: ...
  harder_frame: ...
  stress_axis: risk|scale|time|constraint|stakeholder
  conclusion_survives: yes|no|uncertain
  blind_spot: ...
  revision_required: yes|no
  revision_target: none|stage-0|stage-1|stage-2|stage-3
```

The output must contain exactly one stress axis and one harder frame. `revision_target: stage-0` is allowed at most once per reasoning run. If `stage_0_revision_count == 1` and the defect remains a framing defect, record the unresolved framing issue in `blind_spot` and `residual_uncertainty`, set `revision_target: none`, and continue without another Stage 0 route. Only a separately classified decomposition mismatch may target Stage 1; hypothesis and evidence defects retain their Stage 2 and Stage 3 targets respectively.

**Input**
- `brainstorm_packet` — Candidate framing packet from Stage 0 (`selected_frame` is the original frame; it is not evidence)
- `preliminary_conclusion` — Preliminary conclusion from Synthesis stage output
- `confirmed_facts` — Confirmed facts from Synthesis stage output
- `residual_uncertainty` — Residual uncertainty from Synthesis stage output; required even when empty
- `evidence_matrix` — Evidence matrix from Verification stage output
- `source_quality_matrix` — Source quality matrix from Verification stage output
- `claim_verification_status` — Claim verification status from Verification stage output
- `claim_registry` — Updated claim registry carried from Stage 4 and used to align critique claims with verification status
- `data_gap_list` — Data gaps from Verification stage output
- `primary_mode` — Reasoning mode from A2
- `primary_domain` — Domain from A1
- `scale` — Problem scale from A2
- `can_branch` — sequential-thinking availability flag (`true`/`false`)
- `stage_0_revision_count` — Number of Stage 0 returns already used in this reasoning run (must be less than 1 for a Stage 0 route)
- `failure_route` — (conditional) `stage-5` route marker when re-entering after a Stage 5.5 conclusion/precision failure
- `failure_context` — (conditional) `{affected_claims, failure_reason, required_changes, evidence_snapshot, claim_registry_snapshot}` consumed on a Stage 5 rerun

When re-entering from Stage 5.5 with `failure_route=stage-5`, consume `failure_context`, preserve the current evidence and registry snapshots, and revise only the affected conclusion wording, precision, or annotations before rerunning the independent Stage 5.5 gate.

**Output (mandatory)**
- `perspectives` — Critique perspective results, each containing `{name, challenge, blind_spot, analysis(>=2 sentences)}`
- `required_perspectives` — List of executed perspectives; includes `Problem Reframing Check` for every mode
- `problem_reframing_check` — Exactly one-axis, one-harder-frame result with the fields defined above
- `hallucination_check` — Preliminary hallucination screen only; it is not the Stage 5.5 gate and must not be used as the final hallucination judgment
- `confidence_table` — Mandatory confidence annotation table passed to Stage 6; each entry contains `{claim, source_tier, cross_validation_count, confidence, notes}`
- `price_notes` — (optional) Price presentation check — `{unit_defined, currency_defined, occupancy_noted, disclaimer_added}`
- `fix_requirements` — Revision requirements based on blind spot findings, including the defect class and `revision_target` (`stage-0` only for an invalid problem definition when `stage_0_revision_count < 1`; `stage-1` only for a separately classified decomposition mismatch with a valid problem definition; `stage-2` for hypothesis defects; `stage-3` for evidence defects; otherwise `none` with residual uncertainty recorded)
- `needs_revision` — Whether revision is needed (yes/no)
- `residual_uncertainty` — Mandatory record of unresolved framing issues or other blind spots accepted when no permitted revision route remains; use an explicit empty value when none remains
- `framing_revision_request` — (conditional, Stage 0 route only) top-level return payload with shape `{reason, affected_fields, invalid_frame, requested_change, stage_0_revision_count}`; omit when no Stage 0 return is requested
- `revision_branches` — (optional) Backtrack revision records. Framing records contain `{revision_kind: framing, revision_target: stage-0, revision_reason, stage_0_revision_count, new_branch_id}` only when the counter is below 1; when the counter is 1, the framing record must instead use `revision_target: none` and include `residual_uncertainty` (and must not target Stage 1). Decomposition-mismatch records that target Stage 1 contain `{revision_kind: decomposition-mismatch, revision_target: stage-1, revision_reason, affected_fields, new_branch_id}` and mean the problem definition remains valid but the decomposition must be corrected. Hypothesis/evidence records retain `{original_hypothesis, revision_reason, new_branch_id}` and target Stage 2/3 respectively. The Stage 0 framing record references the top-level `framing_revision_request` only by an explicitly named `framing_revision_request_record` field, never by an ambiguous nested `framing_revision_request` path.

**Linear Degradation Output (used when can_branch=false)**
- `perspectives` — Recorded as text (not sequential-thinking branches), each containing `{name, analysis(>=2 sentences)}`
- `problem_reframing_check` — The same required fields, with exactly one `stress_axis` and one `harder_frame`; record the check linearly and do not call sequential-thinking
- `hallucination_check` — Same as above (hallucination detection produced independently by the critique perspective)
- `revision_branches` — Framing entries contain `{revision_kind: framing, revision_target: stage-0, revision_reason, stage_0_revision_count, new_branch_id}` only while the counter is below 1; at `stage_0_revision_count == 1`, use `{revision_kind: framing, revision_target: none, revision_reason, stage_0_revision_count, residual_uncertainty, linear_note}` and do not route to Stage 1. The framing entry references the top-level `framing_revision_request` only through an explicitly named `framing_revision_request_record` field. Separately classified decomposition-mismatch entries may target Stage 1 and contain `{revision_kind: decomposition-mismatch, revision_target: stage-1, revision_reason, affected_fields, linear_note}`; hypothesis/evidence entries retain `{original_hypothesis, revision_reason, linear_note}` and their Stage 2/3 targets (text records, no sequential-thinking branches created)

### Perspective-Mode Mapping Table

| Perspective | Decision | Diagnostic | Design | Optimization | Innovation |
|-------------|----------|------------|--------|--------------|------------|
| Correctness | Required | Required | Required | Required | Required |
| Completeness | Required | Required | Required | Required | Required |
| Risk | Required | Required | Required | Required | Required |
| Assumption Challenge | Required | Required | Required | Required | **Core** |
| Contrarian | Required | Required | Required | Optional | Required |
| Time | Required | Optional | Required | Required | Optional |
| External Perspective | Required | Required | Required | Required | Required |
| Hallucination Detection | Required | Required | Required | Required | Required |
| Execution Feasibility | Required | Action-only | Required | Required | Required |
| Non-Quantitative Factors | Required | Optional | Optional | Optional | Optional |
| **Precision** | **Required** | **Required** | **Required** | **Required** | **Required** |
| **Problem Reframing Check** | **Required** | **Required** | **Required** | **Required** | **Required** |

Small problems: 5 original core perspectives (Correctness, Completeness, Risk, Hallucination Detection, Execution Feasibility) plus the always-required Problem Reframing Check

### Hallucination Detection Rules

- [ ] Each specific name -> source: {URL / user-provided / inference}
  - If source is URL -> further check: is it marketing content or independent review?
- [ ] Each specific price -> source: {URL / user-provided / inference}
- [ ] Each specific address -> source: {URL / user-provided / inference}
  - Address must be locatable on a map (Google Maps / OpenStreetMap)
- [ ] Each citation/case/paper -> verify real existence
- [ ] Non-quantitative factor weights -> mark as "user self-assessment" not "model-assigned"
- [ ] **Marketing content identification (P0)**:
  - Check the review sources for each recommended entity (store/product/service)
  - If all sources exhibit the following characteristics -> mark as "possible marketing hallucination":
    1. Exaggerated adjectives ("game changer", "best-in-class", "unbeatable", "the GOAT")
    2. Multiple similar articles using identical keyword combinations
    3. No specific experience details (no first-person descriptions like "I went there", "I used it")
    4. Contains purchase links or booking buttons
    5. Source websites belong to the same content-marketing network
  - If marked as "possible marketing hallucination" -> must execute entity existence verification (business registry + map + independent reviews)

### Price Presentation Rules

- [ ] Currency noted (USD/EUR/GBP per user locale; foreign-currency quotes include local-currency equivalent)
- [ ] "Starting from" must add "lowest price, actual price confirmed at source"
- [ ] Hotel price notes "per room per night" and occupancy
- [ ] Foreign-currency quotes include local-currency equivalent

### Contrarian Perspective Safety Rules

- [ ] Mark evidence strength for inverted proposition (strong consensus / academic debate / fringe / disproven)
- [ ] If fringe or disproven -> must annotate
- [ ] If involving public health/safety -> include mainstream scientific consensus comparison

---

## Precision Perspective (P0)

**Purpose**: Ensure all claims have undergone complete search paths and verification processes, preventing conclusion errors due to search strategy bias.

### Checklist

```
[ ] Domain-aware search completeness:
  -> Did each brand/store/product/target run all paths defined in A2 contract `verification_paths`?
  -> Path definitions vary by primary_domain (e.g., daily = product+city+price / store+brand+rating / brand+distributor+city / product line+city)
  -> If any entity concluded after only running path (1) -> mark as "search incomplete"

[ ] Negative search execution:
  -> Does each positive search have a corresponding negative search?
  -> Is the negative search query recorded in tool_calls?

[ ] Source quality annotation:
  -> Does each Type A claim have >=1 T1/T2 or >=2 T3/T4/T5 sources?
  -> Are T3 source numbers annotated "not independently verified"?
  -> Are any sources annotated with marketing_indicators?

[ ] Data gaps:
  -> Are there unfound addresses/prices/phone numbers?
  -> Are data gaps recorded in data_gap_list?

[ ] Confidence alignment:
  -> Is each claim's confidence level consistent with actual evidence strength?
  -> Are T3 single-source claims annotated with "low" confidence?
  -> Are Type A claims with only a single source annotated "verification failed"?

[ ] Claim registration:
  -> Are there unregistered claims entering the conclusion?
  -> Is each claim's verification_status updated?
```

### Output

```
precision_audit = {
  four_path_complete: true/false,
  negative_search_complete: true/false,
  source_quality_annotated: true/false,
  data_gaps_listed: true/false,
  confidence_aligned: true/false,
  issues_found: [
    {
      issue: "Specific issue description",
      affected_claim: "Affected claim",
      root_cause: "Root cause (which step was missed)",
      fix: "Fix method"
    }
  ],
  precision_score: 1-5
}
```

### Deduction Rules

```
- Missing domain-aware search path: -5 points
- Missing negative search: -3 points
- T3 data not annotated "not independently verified": -2 points
- Data gaps not listed: -2 points
- Type A claim with single source marked "Verified": -5 points
```

### Backtrack Revision

If the precision audit reveals a serious issue (e.g., a "not available" conclusion based on incomplete search), trigger a backtrack revision to the corresponding hypothesis branch in Stage 2, supplement the search paths, and re-verify.