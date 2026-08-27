# Diagnostic: Differential Diagnosis

**Core Mechanism**: Symptoms -> Candidate Causes -> Elimination Verification -> Minimal Intervention

**Applicability**: Bug fixes, system failures, performance issues, data anomalies

**Integration with Stages**:

| Stage | Mode Impact |
|-------|-------------|
| Stage 1 Decomposition | Decompose by symptom clustering; group sub-problems by time/location/module conditions |
| Stage 2 Hypothesis | At least 3 competing causal hypotheses per sub-problem + null hypothesis (no anomaly) |
| Stage 3 Verification | Elimination-based core: verify most likely cause first, then most dangerous cause |
| Stage 4 Synthesis | Converge to root cause; distinguish direct cause vs root cause |
| Stage 5 Critique | Required "Contrarian" perspective: does the evidence support other causes? "Assumption Challenge": are there unconsidered common causes? |
| Stage 6 Conclusion | Minimal intervention principle: fix only the root cause, not the symptoms |

**Output Characteristics**: Root cause statement + Reproduction path + Minimal fix solution