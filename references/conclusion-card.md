# Conclusion Card & Evidence Calibration (from claude-reasoning Stage 6)

Every **Path B** reasoning task must close with a standardized **Conclusion Card**. It provides a structured summary with calibrated confidence and explicit residual uncertainty, replacing arbitrary numeric scores with verifiable prose.

---

## Evidence Language Calibration Labels

Every key conclusion statement or bullet must begin with a standardized calibration tag:

| Tag | Criteria | Meaning |
|---|---|---|
| **`[Confirmed]`** | $\ge 2$ independent Tier 1 / Tier 2 sources; zero contradictions. | Established fact verified by primary documentation. |
| **`[Probable]`** | 1 reliable Tier 1 / Tier 2 source, or multiple consistent Tier 3 sources. | High likelihood, but lacks independent dual confirmation. |
| **`[Plausible]`** | Grounded deduction or architectural inference without direct empirical measurement. | Reasonable engineering deduction based on known first principles. |
| **`[Contested]`** | Sources directly disagree (e.g. docs say X, community benchmarks show Y). | Disputed claim; both sides must be documented with sources. |
| **`[Unverified]`** | Search yielded no public records, or no search tools available in session. | Explicitly unknown or unconfirmed claim. |

---

## Conclusion Card Format

```markdown
### 📋 Conclusion Card

- **Primary Recommendation / Finding**:
  - [Confirmed / Probable] Clear, 1-2 sentence core answer to the user's question.

- **Calibrated Findings**:
  - `[Confirmed]` Finding 1 (Source A, Source B)
  - `[Probable]` Finding 2 (Source C — single source)
  - `[Contested]` Finding 3 (Source D claims X, while Source E claims Y)
  - `[Unverified]` Finding 4 (Queried 3 phrasings, no public documentation found)

- **Confidence Assessment**:
  - **Level**: `High` | `Medium` | `Low` (Choose one based on evidence quality)
  - **Rationale**: [2-3 sentences explaining why, referencing the presence or absence of Tier 1/2 corroboration. NEVER use numbers like "8/10" or "85%".]

- **Key Evidence Sources**:
  - `claim-1`: [URL or Document Identifier] (Tier 1)
  - `claim-1`: [URL or Document Identifier] (Tier 2)

- **Residual Uncertainty & Blind Spots**:
  - What remains unknown or unverified?
  - What condition or future change would invalidate this conclusion?

- **Actionable Next Steps / Exit Conditions**:
  - 1. Concrete verification or implementation action.
  - 2. Trigger condition for revisiting this decision.
```

---

## Prohibited Patterns
- ❌ **No pseudo-quantitative scores**: Do not include "Confidence Score: 85%", "Quality: 4/5", or "Evidence Sufficiency: 3/3".
- ❌ **No unsubstantiated [Confirmed] tags**: A claim with only 1 source or internal inference must never be tagged `[Confirmed]`.
- ❌ **No concealed contradictions**: If two sources diverge, tag as `[Contested]` and record both in the card.
