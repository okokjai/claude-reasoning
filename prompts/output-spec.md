# Output Specification

## Required Outputs Per Invocation

```
## Reasoning Log
- Mode used: [mode name]
- Domain: [domain name]
- Stage execution summary: [one sentence per stage]
- Key turning points: [where reasoning path changed, including backtracking records]
- sequential-thinking tree: [branch count, backtracking revision count, revision attempts]
- Residual uncertainty: [unresolved questions]

## Conclusion Card
- Conclusion:
- Core evidence:
- Key evidence sources: [URL list]
- Confidence: [high/medium/low]
- Recommended actions:

## Pattern Asset (saved to Memory)
- Domain:
- Mode type:
- Core mechanism:
- Key lessons from this case:
- Reusable abstraction:
- Backtracking experience: [reason and method of this revision]
```

---

## Evidence Language Calibration

Each point in the conclusion card must carry an evidence level label:

| Condition | Evidence Level |
|-----------|---------------|
| Type A claim + >=2 independent sources (at least 1 T1/T2) or >=2 consistent T3/T4/T5 | `[Confirmed]` |
| Type A claim + single source (any tier) or all-T3 | `[Unknown]` / `verification failed` |
| Type B claim | `[Partially Confirmed]` |
| Type E claim | `[Speculative]` |
| Verification failed (no source) | `[Unknown]` |
| Sources contradict each other | `[Contested]` |

### Format Example

```
- [Confirmed] Zeiss has 3 authorized retail partners in New York
- [Partially Confirmed] Hotel X offers good value (Yelp 4.5, but single T2 source)
- [Speculative] Local eyewear prices may run 30-50% below regional average
- [Unknown] Brand X's 2027 model release date (no data found)
- [Contested] Store rating diverges sharply across platforms (TripAdvisor 4.8 vs Booking 3.2)
```

---

## Pattern Asset Format

```markdown
# Pattern: {pattern-name}
**Domain**: {domain}
**Mode**: {mode}
**Problem**: {brief description}
**Core mechanism**: {3-5 key steps}
**Success**: {yes/no}
**Key lessons**: {learnings from this case}
**Tools used**: {unified-fetch search / unified-fetch scrape / sequentialthinking}
**Reusable for**: {list of similar scenarios}
```

## Anti-Pattern Format

```markdown
# Anti-Pattern: {pattern-name}
**Problem type**: {hallucination/over-reasoning/tool-not-used/insufficient-evidence}
**Scenario**: {specific scenario description}
**Failure mode**: {specific error manifestation}
**Root cause**: {why it happened}
**Prevention**: {how to avoid}
```