# Design: Design Space Exploration

**Core Mechanism**: Requirements -> Constraints -> Solution Space -> Pareto Frontier

**Applicability**: Architecture design, API design, system refactoring, technical proposals

**Integration with Stages**:

| Stage | Mode Impact |
|-------|-------------|
| Stage 1 Decomposition | Decompose along three dimensions: functional requirements / non-functional requirements / constraints |
| Stage 2 Hypothesis | 3-5 heterogeneous solutions (must not be homogeneous); each solution is an independent hypothesis |
| Stage 3 Verification | Verify each solution's feasibility and constraint satisfaction, not "correctness" |
| Stage 4 Synthesis | Pareto ranking: when no solution dominates across all dimensions, annotate trade-offs |
| Stage 5 Critique | Required "Execution Feasibility" perspective: can the solution be implemented? "Time" perspective: solution decay over time |
| Stage 6 Conclusion | Recommendation + alternatives + implementation path, including migration cost assessment |

**Output Characteristics**: Solution comparison table + Pareto frontier + Implementation plan