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
- `brainstorm_packet` — Mandatory candidate framing packet from Stage 0
- `stage_0_uncertainty` — (optional) Residual uncertainty from Stage 0
- `disclaimer_text` — (optional) Disclaimer text from A2 contract output
- `can_branch` — sequential-thinking availability flag (yes/no) from A2 contract output
- `user_constraints` — (optional) User constraints from C0 contract output
- `success_criteria` — (optional) Success criteria from C0 contract output

**Input handling**:
- Require `brainstorm_packet` before decomposition; if it is missing or incomplete, return to Stage 0 rather than proceeding.
- Use `brainstorm_packet.selected_frame` as the initial framing of `core_problem`.
- Preserve `original_frame`, `backup_frame`, `hidden_constraints`, and `cheapest_falsifier` as decomposition context, including any `stage_0_uncertainty`.
- Translate the selected framing into `core_problem`, `sub_problems`, and `immutable_constraints` without silently changing its material scope.
- Treat every brainstorm frame and other packet content as candidate input only; never elevate it into a verified claim or evidence. Claims and evidence remain subject to Stage 2, Stage 3, Stage 5.5, and Stage 6 gates.
- Compare the resulting decomposition with the packet. Record any material mismatch as a `handoff_issue` and return to Stage 0 for framing revision; do not silently reconcile a material mismatch in Stage 1.

**Output (mandatory)**
- `core_problem` — One-sentence summary of the core problem
- `sub_problems` — List of sub-problems, each containing `{name, description, dependencies, data_type, tool_required, tool_primary, tool_fallback, mandatory, freshness_days}`
- `known_facts` — Known facts
- `unknown_facts` — Uncertain information
- `immutable_constraints` — Immutable constraints
- `user_constraints` — (optional, from C0) User-provided constraints
- `sequential_branches` — sequential-thinking branchId for each sub-problem
- `handoff_issue` — (when present) recorded mismatch between the Stage 0 framing and Stage 1 decomposition, with materiality and return-to-Stage-0 status