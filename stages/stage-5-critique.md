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
  Critique perspective (Hallucination Detection) — produces hallucination_check
  Correctness perspective (P0 Gate) — independently verifies passing_gate_1 ~ gate_4 before the Conclusion stage
  The two must not share the same self-assessment paragraph
```

**Input**
- `preliminary_conclusion` — Preliminary conclusion from Synthesis stage output
- `evidence_matrix` — Evidence matrix from Verification stage output
- `primary_mode` — Reasoning mode
- `primary_domain` — Domain
- `scale` — Problem scale
- `can_branch` — sequential-thinking availability flag (yes/no)

**Output (mandatory)**
- `perspectives` — Critique perspective results, each containing `{name, challenge, blind_spot, analysis(>=2 sentences)}`
- `required_perspectives` — List of executed perspectives
- `hallucination_check` — Hallucination detection results — `{entity_count, entity_sourced, entity_unsourced, citation_count, citation_real, citation_fabricated, non_quantitative_factors_listed, pass}`
- `price_notes` — (optional) Price presentation check — `{unit_defined, currency_defined, occupancy_noted, disclaimer_added}`
- `fix_requirements` — Revision requirements based on blind spot findings
- `needs_revision` — Whether revision is needed (yes/no)
- `revision_branches` — (optional) Backtrack revision records, each containing `{original_hypothesis, revision_reason, new_branch_id}`

**Linear Degradation Output (used when can_branch=false)**
- `perspectives` — Recorded as text (not sequential-thinking branches), each containing `{name, analysis(>=2 sentences)}`
- `hallucination_check` — Same as above (hallucination detection produced independently by the critique perspective)
- `revision_branches` — Each entry containing `{original_hypothesis, revision_reason, linear_note}` (text record, no sequential-thinking branches created)

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

Small problems: 5 core perspectives (Correctness, Completeness, Risk, Hallucination Detection, Execution Feasibility)

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