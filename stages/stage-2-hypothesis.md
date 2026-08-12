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
- `primary_mode` — Reasoning mode
- `scale` — Problem scale
- `hypothesis_count` — Number of hypotheses to generate
- `can_branch` — sequential-thinking availability flag (yes/no)

**Output (mandatory)**
- `hypothesis_a` — Hypothesis A — `{description, verification_method, risk_level}`
- `hypothesis_b` — Hypothesis B — `{description, verification_method, risk_level}`
- `hypothesis_c` — (optional) Hypothesis C (most dangerous/extreme) — `{description, verification_method, risk_level}`
- `null_hypothesis` — Null hypothesis (status quo / no difference / baseline)
- `most_dangerous_hypothesis` — Least likely but most consequential hypothesis
- `verification_plan` — Verification plan for each hypothesis, containing `{hypothesis, tool, query, expected_evidence}`
- `sequential_branches` — sequential-thinking branchId for each hypothesis