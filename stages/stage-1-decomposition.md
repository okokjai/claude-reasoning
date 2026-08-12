# Stage 1: Decomposition (using sequential-thinking)

**Execution**: Invoke the `sequentialthinking` tool, opening a separate branch for each sub-problem.

**Precondition Check**: If `can_branch=false`, skip the sequentialthinking call and proceed with linear reasoning output; record branches as text in the `sequential_branches` field instead.

```
sequentialthinking call example:
  thought: "Decomposition: core problem is [one sentence]. Sub-problem A: [description]"
  thoughtNumber: 1
  totalThoughts: 4
  nextThoughtNeeded: true
  branchId: "core"

  thought: "Decomposition: Sub-problem B: [description]"
  thoughtNumber: 2
  totalThoughts: 4
  branchFromThought: 1
  branchId: "sub-B"
  nextThoughtNeeded: true

  thought: "Decomposition: Sub-problem C: [description]"
  thoughtNumber: 3
  totalThoughts: 4
  branchFromThought: 1
  branchId: "sub-C"
  nextThoughtNeeded: true
```

**Input**
- `raw_question` — User's original question
- `data_type` — Data type from A1 contract output
- `primary_mode` — Primary mode from A2 contract output
- `scale` — Problem scale from A2 contract output
- `platform_mode` — Platform mode from A2 contract output
- `primary_domain` — Primary domain from A1 contract output
- `disclaimer_text` — (optional) Disclaimer text from A2 contract output
- `can_branch` — sequential-thinking availability flag (yes/no) from A2 contract output
- `user_constraints` — (optional) User constraints from C0 contract output

**Output (mandatory)**
- `core_problem` — One-sentence summary of the core problem
- `sub_problems` — List of sub-problems, each containing `{name, description, dependencies, data_type, tool_required, tool_primary, tool_fallback, mandatory, freshness_days}`
- `known_facts` — Known facts
- `unknown_facts` — Uncertain information
- `immutable_constraints` — Immutable constraints
- `user_constraints` — (optional, from C0) User-provided constraints
- `sequential_branches` — sequential-thinking branchId for each sub-problem