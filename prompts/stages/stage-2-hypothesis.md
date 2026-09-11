# Stage 2: Hypothesis (using sequential-thinking)

**Execution**: Invoke the `sequentialthinking` tool, opening a separate branch for each hypothesis, extending from the sub-problem branches established in the Decomposition stage.

**Precondition Check**: If `can_branch=false`, skip the sequentialthinking call and proceed with linear reasoning output; record branches as text in the `sequential_branches` field instead.

```
sequentialthinking call example:
  thought: "Hypothesis stage: Hypothesis A — [description]"
  thoughtNumber: 4
  totalThoughts: 8
  branchFromThought: 1
  branchId: "hypo-A"
  nextThoughtNeeded: true

  thought: "Hypothesis stage: Hypothesis B — [description]"
  thoughtNumber: 5
  totalThoughts: 8
  branchFromThought: 1
  branchId: "hypo-B"
  nextThoughtNeeded: true

  thought: "Hypothesis stage: Hypothesis C — [description]"
  thoughtNumber: 6
  totalThoughts: 8
  branchFromThought: 1
  branchId: "hypo-C"
  nextThoughtNeeded: true
```

**Input**
- `core_problem` — Core problem from Decomposition stage output
- `sub_problems` — List of sub-problems from Decomposition stage output
- `known_facts` — Known facts from Decomposition stage output
- `immutable_constraints` — Immutable constraints from Decomposition stage output
- `primary_mode` — Reasoning mode
- `scale` — Problem scale
- `hypothesis_count` — Number of hypotheses to generate
- `can_branch` — sequential-thinking availability flag (`true`/`false`)
- `verification_paths` — Domain-aware verification paths from A2 contract output
- `negative_search_queries` — Negative search queries derived from the verification paths

**Output (mandatory)**
- `hypothesis_a` — Hypothesis A — `{description, verification_method, risk_level}`
- `hypothesis_b` — Hypothesis B — `{description, verification_method, risk_level}`
- `hypothesis_c` — (optional) Hypothesis C (most dangerous/extreme) — `{description, verification_method, risk_level}`
- `null_hypothesis` — Null hypothesis (status quo / no difference / baseline)
- `most_dangerous_hypothesis` — Least likely but most consequential hypothesis
- `verification_plan` — Verification plan for each hypothesis, containing `{hypothesis, tool, query, expected_evidence}`
- `hypotheses` — Aggregated hypothesis list used by the Stage 2 -> Stage 3 transfer
- `claim_registry` — Completed claim registration for every claim entering verification, each containing `{claim, type, verification_threshold, sources_found, verification_status, notes}`. Use the canonical status values `failed`, `partial`, or `passed`.
- `search_paths_required` — Required positive search paths from `verification_paths`
- `negative_search_queries` — Negative search queries paired with the required positive paths
- `sequential_branches` — sequential-thinking branchId for each hypothesis