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
- `primary_domain` — Primary domain from A1 contract output (ambient A1/user context)
- `brainstorm_packet` — Mandatory candidate framing packet from Stage 0
- `disclaimer_text` — (optional) Disclaimer text from A2 contract output
- `can_branch` — sequential-thinking availability flag (`true`/`false`) from A2 contract output
- `user_constraints` — Required C0-shaped context field; empty list is the explicit default when C0 does not trigger
- `implicit_assumptions` — Required C0-shaped context field; empty list is the explicit default when C0 does not trigger
- `success_criteria` — Required C0-shaped context field; empty list is the explicit default when C0 does not trigger

If `gate_failure_class` and `revision_count` are present, correct only the affected decomposition fields from `fix_requirements`; the orchestration layer owns the counter and must not re-enter this route after the bounded retry limit.
- Require `brainstorm_packet` before decomposition; if it is missing or incomplete, return to Stage 0 rather than proceeding.
- Use `brainstorm_packet.selected_frame` as the initial framing of `core_problem`.
- Preserve `original_frame`, `backup_frame`, `hidden_constraints`, and `cheapest_falsifier` as decomposition context. Use `brainstorm_packet.framing_status`, `brainstorm_packet.hidden_constraints`, and `brainstorm_packet.frame_comparison` as the canonical Stage 0 uncertainty/framing-status sources.
- Translate the selected framing into `core_problem`, `sub_problems`, and `immutable_constraints` without silently changing its material scope.
- Treat every brainstorm frame and other packet content as candidate input only; never elevate it into a verified claim or evidence. Claims and evidence remain subject to Stage 2, Stage 3, Stage 5.5, and Stage 6 gates.
- Compare the resulting decomposition with the packet. When a mismatch is present, emit a conditional `handoff_issue` only if the mismatch is material. Its required shape is `{kind, summary, affected_fields, materiality, route, framing_revision_request_record}`; `route` is `Stage 0` when the framing is invalid and `Stage 1` when the framing is valid but the decomposition is invalid. Follow the corresponding C2 route semantics; do not silently reconcile a material mismatch. `framing_revision_request_record` is only a reference to the top-level output record defined below.

**Output (mandatory)**
- `core_problem` — One-sentence summary of the core problem
- `sub_problems` — List of sub-problems, each containing `{name, description, dependencies, data_type, tool_required, tool_primary, tool_fallback, mandatory, freshness_days}`
- `known_facts` — Known facts
- `unknown_facts` — Uncertain information
- `immutable_constraints` — Immutable constraints
- `user_constraints` — Required C0 pass-through; preserve the structured list, or emit `[]` when C0 does not trigger
- `implicit_assumptions` — Required C0 pass-through; preserve the structured list, or emit `[]` when C0 does not trigger
- `success_criteria` — Required C0 pass-through; preserve the structured list, or emit `[]` when C0 does not trigger
- `gate_failure_class` — (conditional) Stage 6 post-gate classification when re-entering for decomposition correction
- `revision_count` — (conditional) Stage 6-to-Stage 1 counter; stop this route when the bounded retry limit is reached
- `sequential_branches` — sequential-thinking branchId for each sub-problem
- `framing_revision_request` — (conditional, Stage 0 route only) top-level return payload with shape `{reason, affected_fields, invalid_frame, requested_change, stage_0_revision_count}`; omit when no Stage 0 return is requested
- `handoff_issue` — (conditional, omit when no material mismatch) mismatch between the Stage 0 framing and Stage 1 decomposition, with required shape `{kind, summary, affected_fields, materiality, route, framing_revision_request_record}`; the reference is not a nested duplicate
