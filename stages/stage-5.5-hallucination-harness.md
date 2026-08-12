# Stage 5.5: Anti-Hallucination Harness

**Execution**: Pure reasoning (no tools). Runs as a P0 gate independent of the Stage 5 critique perspectives. All three checks must pass before entering Stage 6.

**Design Purpose**: Separate hallucination detection from the Stage 5 critique perspectives, preventing it from being diluted by other perspectives. This stage is an independent gate and does not share its output window with other perspectives.

---

**Input**
- `preliminary_conclusion` — Preliminary conclusion from Stage 4 output
- `evidence_matrix` — Evidence matrix from Stage 3 output
- `source_quality_matrix` — Source quality matrix from Stage 3 output
- `claim_registry` — Claim registry from Stage 2 output
- `scale` — Problem scale from A2 contract output
- `primary_domain` — Primary domain from A1 contract output

**Output (mandatory)**
- `entity_check` — Entity existence check results
- `source_check` — Source verification check results
- `cross_reference_check` — Cross-reference check results
- `hallucination_pass` — All three checks passed (yes/no)
- `hallucination_fail_reason` — Failure reason if not passed
- `hallucination_details` — Detailed records for each check

---

## Three-Check Protocol

### Check (1): Entity Existence

**Scope**: All specific entities in the conclusion (brands, stores, products, prices, addresses, person names, organization names)

**Check Rules**:

```
For each specific entity:
  [ ] Does the entity appear in at least 1 independent source?
      -> Sources include unified-fetch search results, known URLs, official materials
      -> If only appears in model inference (no source whatsoever) -> mark as "hallucinated entity"

  [ ] If it is a recommended entity (recommended for consumer visits/purchases):
      -> Must have 3 independent verifications:
         (1) Map existence (Google Maps / OpenStreetMap searchable)
         (2) Business/official information (Crunchbase / OpenCorporates / official website searchable)
         (3) Independent reviews (non-marketing consumer reviews)
      -> Any one not passed -> that entity must not be recommended

  [ ] If it is a price-related entity:
      -> Must have a source URL and timestamp
      -> Price number without source -> mark as "hallucinated price"
```

**Output**: `{entity_count, sourced_count, unsourced_count, recommended_count, recommended_verified, hallucination_entities: [name, reason]}`

### Check (2): Source Verification

**Scope**: All claims in the conclusion that "cite a source"

**Check Rules**:

```
For each source-citing claim:
  [ ] Can the source URL be traced to the specified webpage?
      -> If the URL is in the format "example.com/..." but has no corresponding unified-fetch result -> mark as "citation hallucination"

  [ ] Does the source content support the claim?
      -> If the source URL exists but the content does not support the claim -> mark as "source misuse"

  [ ] Is the source marketing content (T3)?
      -> If all sources are T3 (KOL/paid promotion) -> mark as "untrustworthy source"

  [ ] Citation hallucination -> zero tolerance (>=1 triggers gate failure)
```

**Output**: `{citation_count, citation_real, citation_fabricated, citation_misused, source_tier_issues, pass}`

### Check (3): Cross-Reference

**Scope**: All judgments in the conclusion that "depend on other perspectives"

**Check Rules**:

```
For each key judgment:
  [ ] Is the judgment supported by at least 2 independent perspectives/sources?
      -> If supported by only a single source -> mark as "single-source dependency"

  [ ] If the judgment is questioned or contradicted by other perspectives -> mark as "perspective conflict"

  [ ] If there is a perspective conflict but the conclusion does not mention it -> mark as "concealed contradiction"

  [ ] If the judgment has no other perspective addressing it at all -> mark as "isolated judgment"

  [ ] If any flag exists -> gate degrades to "needs annotation", but does not fail outright
      (The conclusion must carry the conflict/isolation annotation)
```

**Output**: `{single_source_claims, conflicting_claims, concealed_conflicts, isolated_judgments, pass}`

---

## Gate Determination

```
hallucination_pass = entity_check.pass AND source_check.pass AND cross_reference_check.pass

entity_check.pass conditions:
  - unsourced_count = 0 (no hallucinated entities)
  AND
  - Recommended entities: recommended_verified = all passed (auto-pass if none recommended)
  AND
  - hallucination_entities = [] (no hallucinated entity list)

source_check.pass conditions:
  - citation_fabricated = 0 (zero tolerance for citation hallucination)
  AND
  - citation_misused = 0 (no source misuse)
  AND
  - source_tier_issues = 0 or annotated (T3 issues can pass with annotation, but not concealed)

cross_reference_check.pass conditions:
  - Single-source dependencies and isolated judgments allowed to pass (but must be annotated)
  - concealed_conflicts = 0 (zero tolerance for concealed contradictions)

Any failure -> gate blocks, return to Stage 3 for supplemental verification or Stage 5 for conclusion revision
```

---

## Relationship with Stage 5

| Item | Stage 5 Critique Perspective | Stage 5.5 Anti-Hallucination Harness |
|------|-----------------------------|--------------------------------------|
| Role | Find blind spots, propose revisions | Verify entity/source/cross-reference authenticity |
| Output | `fix_requirements`, `blind_spots_handled` | `hallucination_pass`, `hallucination_fail_reason` |
| Failure handling | Backtrack revision to Stage 2 | Return to Stage 3 or Stage 5 |
| Substitutability | Not substitutable | Not substitutable (independent gate) |

**Execution Order**: Stage 5 (Critique) -> Stage 5.5 (Anti-Hallucination Harness) -> Stage 6 (Conclusion)

If Stage 5 finds that backtrack revision is needed, complete the revision first, then enter Stage 5.5.

---

## Relationship with Quality Self-Assessment

Quality self-assessment's **Check B: Hallucination Detection** no longer directly references Stage 5's `hallucination_check`; instead, it references Stage 5.5's `hallucination_pass`:

```
Check B: Hallucination Detection (produced by Stage 5.5 Anti-Hallucination Harness)
  [ ] hallucination_pass = yes?
  [ ] If no -> directly determine "Redo"
```

This implements the "Verifier Separation" principle — hallucination detection is no longer self-reported by Stage 5, but produced by an independent gate.