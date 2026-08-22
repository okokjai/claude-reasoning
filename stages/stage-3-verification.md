# Stage 3: Verification

**Execution**: Invoke the `unified-fetch` tool to verify each hypothesis. unified-fetch has built-in 4-engine search (Hound -> DDG -> Google -> Direct) and 6-engine scrape (Hound -> newspaper3k -> Trafilatura -> readability -> jusText -> DirectFetch) adaptive fallback — a single tool handles both search and browse.

**Input**
- `verification_plan` — Verification plan from Hypothesis stage output
- `failure_route` — (conditional) `stage-3` route marker when re-entering after a Stage 5.5 evidence/source failure
- `failure_context` — (conditional) `{affected_claims, failure_reason, required_changes, evidence_snapshot, claim_registry_snapshot}` consumed on a Stage 3 rerun
- `hypotheses` — Aggregated hypotheses from Stage 2
- `claim_registry` — Mandatory pre-search claim registry from Stage 2; update every entry after verification
- `search_paths_required` — Required positive search paths from Stage 2
- `negative_search_queries` — Paired negative search queries from Stage 2
- `verification_paths` — Domain-aware verification paths from A2 contract output
- `platform_mode` — Platform mode from A2 contract output
- `primary_tool` — Primary search tool from A2 contract output
- `evidence_cap` — Evidence sufficiency cap from A2 contract output

**Output (mandatory)**
- `tool_calls` — Actual tool call records, each containing `{sequence, tool, parameters, summary, engine, duration_seconds}`
- `evidence_matrix` — Evidence matrix, each entry containing `{hypothesis, evidence_summary, confidence_bucket, source_anchor, date}`
  - `evidence_summary` — One-sentence summary of supporting/refuting evidence
  - `confidence_bucket` — Confidence bucket (`high` / `medium` / `low`)
  - `source_anchor` — Primary source URL
  - `date` — Data date
- `cross_validation` — Cross-validation results — `{has_multiple_sources, has_discrepancy_over_20pct, discrepancy_list, discrepancy_root_cause, consensus_range}`
- `unverified_hypotheses` — List of hypotheses that could not be verified
- `evidence_quality` — Evidence quality determination (`Sufficient` / `Insufficient` / `Contradictory`)
- `verification_complete` — Search calls completed? (yes/no)
- `browse_verified` — Scrape secondary verification completed? (yes/no)
- `browse_skip_reason` — (optional) Reason for skipping scrape
- `source_quality_matrix` — Source tier and marketing annotation for each evidence source
- `claim_verification_status` — Aggregated verification status by registered claim
- `claim_registry` — Complete updated claim registry passed to Stage 5.5
- `data_gap_list` — Data gaps discovered during verification

When re-entering from Stage 5.5 with `failure_route=stage-3`, consume `failure_context`, preserve unaffected evidence and registry entries, and rerun the required verification paths for every affected claim before emitting the updated aggregates and claim registry.

```
1. unified-fetch search(query, max_results=5)
   -> Platform: CLI Full Mode preferred
   -> Auto-trigger: results auto-populate the evidence matrix
   -> Built-in engines: Hound -> DuckDuckGo -> Google Search -> DirectFetch

2. unified-fetch scrape(url)
   -> Rule: after search returns, scrape at least 1 of the top 2 results
   -> Built-in engines: Hound -> newspaper3k -> Trafilatura -> readability -> jusText -> DirectFetch

3. Desktop Mode (unified-fetch unavailable):
   -> WebSearch(query) + WebFetch(url)
```

### Cross-Validation Rules

- [ ] Does the same fact have >=2 **independent sources** (at least 1 T1/T2; or >=2 consistent T3/T4/T5 marked `not independently verified`)?
  - Independent source definition: different websites, different authors, different organizations — not part of the same marketing network
  - If multiple sources are actually the same marketing campaign (same writing style, same keyword stacks, same site group) -> treat as single source
  - Single-source Type A -> `verification failed` (see A3); all-T3 Type A -> `verification failed` (see A4)
- [ ] Data discrepancy >20% across sources -> flag as "major contradiction"
- [ ] Price/prediction data -> take multi-source median, annotate "consensus range"
- [ ] Comparison data -> returns must be annotated with corresponding risk
- [ ] Marketing content identification: if all sources are marketing content (SEO articles, recommendation blurbs, paid sponsored posts) -> flag as "untrustworthy source"

### Prediction Time Horizon Marking

- [ ] Short-term (<1 year) -> confidence up to 5/5
- [ ] Medium-term (1-3 years) -> confidence cap at 4/5
- [ ] Long-term (3+ years) -> confidence cap at 3/5

### Entity Existence Verification (P0 — Hallucination Eradication)

> **Rule: Any specific entity (store, restaurant, hotel, attraction, institution) recommended for consumer visits/purchases must be verified for real existence.**

```
[ ] Map lookup: Google Maps / OpenStreetMap search for entity name
  -> Not found -> mark as "existence unverified", must not recommend
[ ] Business registry: Crunchbase / OpenCorporates / official business registry
  -> Applicable to: businesses, companies, institutions
  -> Not found / newly registered (<1 year) / abnormally low registered capital -> flag warning
[ ] Review platforms: Yelp / Google Reviews / Amazon / App Store
  -> Distinguish "marketing content" vs "real user reviews":
    - Marketing content indicators: exaggerated adjectives, multiple similar articles, no specific experience details, contains purchase links
    - Real user review indicators: specific experience descriptions, photos, timestamps, mentions of shortcomings
  -> If all reviews are marketing content -> flag as "untrustworthy reviews"
```

**Execution timing**: After the evidence matrix is populated, before cross-validation.
**Failure handling**: If entity existence is unverified -> mark in `unverified_hypotheses`; **that entity must not enter the conclusion recommendation list**. If all candidate entities fail existence verification -> set `needs_revision = yes`, return to stage 2 to find alternatives.

### Midway Checkpoint (Evidence Quality Threshold)

Self-checkpoint during Stage 3 execution, after research calls complete, before browse verification:

| Checkpoint | Condition | Action |
|------------|-----------|--------|
| Coverage insufficient | All hypotheses have `confidence_bucket` = `low` | Rewrite query and re-search (max 1 attempt) |
| Empty results | A hypothesis search returns 0 relevant results | unified-fetch built-in 4-engine fallback, no manual switch needed |
| Single-source bias | A fact has only 1 source | Re-search with different query to find a 2nd source |
| Engine unavailable | All unified-fetch calls fail | Degrade to Desktop Mode (WebSearch/WebFetch), do not interrupt flow |
| Entity path incomplete | An entity (brand/store/target) has only run partial paths in `verification_paths` before concluding | Force-complete the missing paths; ensure the "exists/does not exist/channel available" determination for that entity rests on all paths |

**Execution Rules**:
1. When a checkpoint triggers, record `{checkpoint_triggered, action_taken, retry_count}` in `tool_calls`
2. Each hypothesis retries at most 2 times (1 engine swap + 1 query rewrite)
3. Exceeding retry limit with no results -> mark the hypothesis as `unverified_hypotheses`, note "engine unavailable / no relevant data"
4. All hypotheses unverifiable -> `evidence_quality = Insufficient`

### Mathematical Derivation Checklist

- [ ] Parameter completeness? [ ] Dimensional consistency? [ ] Boundary conditions reasonable? [ ] Units consistent? [ ] Substitution verification?

---

## Mandatory Claim Type Registration (P0)

**Before the first search call**, claim registration must be completed. Unregistered claims must not enter verification.

**Input**: `claim_registry` — claim registry from Stage 2
**Output**: Each claim annotated with `type` (A/B/C/D/E), `verification_threshold`, `verification_status`

### Registration Template

```
claim_registry = [
  {
    claim: "Specific claim content",
    type: "A/B/C/D/E",
    verification_threshold: "Corresponding threshold (see A3 contract)",
    sources_found: [],
    verification_status: "failed/partial/passed",
    notes: "Special notes"
  }
]
```

### Execution Rules

1. Break down each hypothesis into multiple verifiable claims
2. Annotate each claim with type (A/B/C/D/E)
3. Set verification threshold per A3 contract
4. Update `verification_status` after verification completes
5. **Unverified Type A claims must not enter the conclusion recommendation list**

---

## Domain-Aware Search Protocol (P0)

**For every "does this entity exist" question regarding a brand/product/store/channel/target, all paths defined in the A2 contract `verification_paths` must be completed before concluding.**

### Path Definition

Generated dynamically by the A2 contract based on `primary_domain`. Current domain templates:

| Domain | Path Template |
|--------|---------------|
| `investment` | (1) Target + price (2) Target + financials + latest (3) Target + news + risk (4) Target + analyst + rating |
| `daily` | (1) Product + city + price (2) Store + brand + rating (3) Brand + distributor + city (4) Product line + city |
| `career` | (1) Position + city + salary (2) Position + skills + demand (3) Company + layoffs + news (4) Position + employment rate + trend |
| Other | See contracts/A2.md `verification_paths` generation rules |

### Execution Rules

1. **All paths must be completed before concluding "it exists / it doesn't"**
2. Concluding after running path (1) only = **unacceptable**; remaining paths must be supplemented
3. Each path's search query is recorded in `tool_calls`
4. `search_paths_required` is passed from the C2 contract, enforced
5. If a path returns no results -> annotate "no findings for this path", do not count as complete

### Counterexample (Unacceptable)

```
[X] Search "Acme Vision Austin" -> zero results -> conclude "Not available in Austin"
   (Only ran path (1), missing all other paths)

[OK] Search "Acme Vision Austin" -> zero results
     Search "Sightline Optical Acme" -> found they carry it (path (2))
     Search "Acme distributor Austin" -> found a dealer (path (3))
     Search "Acme 1.74 Austin" -> found the product (path (4))
     -> Conclusion: "Available in Austin, but only through Sightline Optical as the sole channel"
```

---

## Negative Search (Falsification Search, P0)

**Before reaching a positive conclusion, force one reverse search.**

### Execution Timing

After positive search completes, before the evidence matrix is filled.

### Search Format

```
Negative Search (1): `store name + discontinued/stopped + brand name`
   -> catches: evidence that a store has stopped carrying a brand

Negative Search (2): `brand name + city + complaints/counterfeit/fake`
   -> catches: consumer complaints/return records, counterfeit warnings, authorization revocation news

Negative Search (3): `brand name + exit/withdraw + city/region`
   -> catches: brand exiting the market, authorization revoked
```

### Execution Rules

1. Each positive search corresponds to >=1 negative search
2. Negative search results are recorded in `tool_calls`
3. If negative search finds counter-evidence -> update `claim_verification_status` to "Partially Verified" or "Unverified"
4. If negative search yields no results -> annotate "negative search found no counter-evidence" (does not equal "confirmed no counter-evidence")

### Output

```
negative_search_results = [
  {
    query: "Negative search query",
    result: "Search result summary",
    counter_evidence_found: true/false,
    impact_on_claim: "Impact on the claim"
  }
]
```

---

## Source Quality Annotation (P0)

**Every piece of evidence must be annotated with a source tier (T1-T5), per the A4 contract.**

### Annotation Format

```
source_quality_matrix = [
  {
    claim: "Corresponding claim",
    source_url: "Source URL",
    source_tier: "T1/T2/T3/T4/T5",
    source_type: "Independent media/KOL/store self-claim/...",
    is_paid_promotion: true/false,
    date: "Data date",
    marketing_indicators: ["Exaggerated adjectives", "Contains purchase links"],
    verification_contribution: "This source's contribution to claim verification"
  }
]
```

### Type A Claim Verification Threshold

```
[ ] At least 1 T1 or T2 source
    -> or
[ ] At least 2 T3/T4/T5 sources with consistent content
    -> but T3 source numbers must be annotated as "not independently verified"
[ ] If all sources are T3 -> mark as "verification failed"
[ ] If source tiers differ significantly (T1 says X, T5 says Y) -> defer to T1, annotate discrepancy
```

### Type D Claim Special Rules

```
[ ] All Type D claims must be annotated with:
  - Source tier (T1-T5)
  - Publication date
  - Whether it is a promotional/time-limited offer
  - "Not independently verified" (if source is T3)
[ ] Do not cite promotional prices as regular prices
[ ] In the final output, Type D claims must be accompanied by "actual prices subject to store quote"
```

---

## Midway Checkpoint (Updated)

In addition to the original checkpoints, add:

| Checkpoint | Condition | Action |
|------------|-----------|--------|
| Negative search missing | Positive search completed but no corresponding negative search | Execute negative search immediately |
| T3 data unannotated | T3 source numbers not annotated "not independently verified" | Add annotation immediately |
| Claim unregistered | Unregistered claim enters the evidence matrix | Return to claim registration step |