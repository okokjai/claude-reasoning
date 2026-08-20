# Stage 0: Mini Brainstorming (mandatory bounded control-flow graph)

**Position**: Mandatory for every reasoning task after C0 and before Stage 1.

**Purpose**: Clarify the problem worth solving before decomposition. This stage produces bounded candidate framings, compares them, and hands one selected framing to Stage 1. It does not perform decomposition, register claims, or verify evidence.

## Inputs

- `raw_question` — User's original question.
- `primary_mode` — Primary reasoning mode from A2.
- `primary_domain` — Primary domain from A1.
- `scale` — Problem scale from A2.
- `platform_mode` — Platform or execution mode from A2.
- `can_branch` — Sequential-thinking availability flag from A2 (`true`/`false`).
- `user_constraints` — Structured constraints captured by C0.
- `implicit_assumptions` — Assumptions captured by C0, with their source.
- `success_criteria` — Success criteria captured by C0.

## Preconditions and placement

All C0 and A2 fields required by this contract must be available before `brainstorm-core` runs. If a field is missing, record it as `unknown` or return to the prior contract that owns the field; never silently invent it. A missing mandatory Stage 0 packet blocks Stage 1.

The forward path is fixed and bounded. B9 has two mutually exclusive exits:

```text
B8 → B9 → no_new_angle → Stage 1
B9 (iteration_count=0 and material change)
   → B5 → B6 → B7 → B8 → B9 → Stage 1
```

The second line is the only permitted loop. It returns to comparison at B5 rather than creating a new B1–B4 branch family. After that one loop, Stage 0 must enter Stage 1; a second B9 iteration is not run. This bounded loop is part of the control-flow graph, not an invitation to create an unbounded DAG.

| B node | Branch ID | Phase | Required action |
|---|---|---|---|
| B0 | `brainstorm-core` | CORE | Restate the pain and target outcome from the inputs; preserve the original framing. |
| B1 | `frame-pain` | DIVERGE | Frame the problem from the user's pain, including pain, target outcome, broken assumption, and distinction basis. |
| B2 | `frame-constraints` | DIVERGE | Frame the problem from hard constraints and success criteria, including pain, target outcome, broken assumption, and distinction basis. |
| B3 | `frame-counterfactual` | DIVERGE | Frame the problem by challenging a key assumption, including pain, target outcome, broken assumption, and distinction basis. |
| B4 | `frame-baseline` | DIVERGE | Frame the problem from the current/baseline state, including pain, target outcome, broken assumption, and distinction basis. |
| B5 | `frame-attend` | ATTEND | Record shared constraints, complementary insights, conflicts, duplicate frames, and missing information across the candidate frames. |
| B6 | `frame-evaluate` | EVALUATE | Compare surviving frames for relevance, falsifiability, feasibility, and risk. |
| B7 | `frame-converge` | CONVERGE | Select one primary frame and at most one backup; retire every other frame with a reason. |
| B8 | `frame-falsifier` | FALSIFIER | Record the cheapest experiment, the result that would change the selected frame, and the result that would preserve it. |
| B9 | `frame-iterate` | ITERATE | Revisit the framing only when the bounded iteration rule below permits it; otherwise emit `no_new_angle`. |

### Bounded control-flow and expansion

When `can_branch=true`, execute the bounded control-flow graph with the B labels above through sequential-thinking. `B1`–`B4` may produce **at most four** materially distinct frames; do not create additional divergence nodes. A frame is materially distinct only when its pain, target outcome, broken assumption, or distinction basis differs in a way that could change the solution space. `B7` may select no more than two frames total: exactly one primary and at most one backup.

`B9` permits **at most one** iteration. If `iteration_count=0` and one of the permitted material changes is present, follow exactly `B9 → B5 → B6 → B7 → B8 → B9 → Stage 1`; do not recreate `B1`–`B4`. If none applies, follow `B8 → B9 → no_new_angle → Stage 1`. If `iteration_count=1`, do not run B9 again; record any remaining issue in residual uncertainty and terminate Stage 0. Iteration and branch limits terminate expansion and record residual uncertainty instead of generating more nodes.

## Phase behavior

### DIVERGE (B1–B4)

Generate at most four materially distinct candidate frames. Every candidate must state:

- `pain` — The problem or cost that matters.
- `target_outcome` — The outcome sought.
- `broken_assumption` — The assumption being questioned.
- `distinction_basis` — Why this frame is materially different from the others.

Do not turn a candidate framing into a verified fact or claim.

### ATTEND (B5)

Attend to the set as a whole and record:

- shared constraints;
- complementary insights;
- conflicts between frames;
- duplicate or materially indistinct frames;
- missing information that affects comparison.

### EVALUATE and CONVERGE (B6–B7)

Use the ATTEND record to compare candidates on relevance to `raw_question` and `success_criteria`, falsifiability, feasibility under `user_constraints` and `scale`, and risk. Select one `selected_frame` as primary and at most one `backup_frame`. Retire all unselected frames with explicit reasons. Selection is a framing judgment, not evidence.

### FALSIFIER (B8)

For the selected frame, record:

- the cheapest experiment or check that could test the framing;
- the result that would change or reject the frame;
- the result that would preserve the frame.

The falsifier is a test design only. It does not execute verification or register evidence.

### ITERATE (B9)

Use the single permitted iteration only when a material framing defect, changed hard constraint, or changed falsifier is identified. With `iteration_count=0`, run `B9 → B5 → B6 → B7 → B8 → B9`, increment `iteration_count`, and then enter Stage 1 without another loop. Otherwise set `no_new_angle: true`, retain the current framing, and continue without expanding the graph. A second requested iteration is not run; record the residual uncertainty and terminate Stage 0.

## Clarification rule

Do not ask a user question when a conservative assumption is safe. Record the assumption in `implicit_assumptions`, preserve its uncertainty in the packet, and continue. Ask **at most one** question, and only when unresolved ambiguity materially changes the solution space. If no answer is available, record the unresolved ambiguity and stop expansion rather than inventing an answer.

## Output: `brainstorm_packet`

Stage 0 must emit this structured packet before Stage 1:

```yaml
brainstorm_packet:
  pain_statement: ...
  original_frame: ...
  selected_frame: ...
  backup_frame: ...
  candidate_frame_count: 0..4
  selected_frame_count: 0..2
  hidden_constraints: []
  frame_comparison: ...
  cheapest_falsifier: ...
  no_new_angle: false
  iteration_count: 0
  framing_status: confirmed|assumed|uncertain
  residual_uncertainty: ...
  sequential_branches: []
```

`hidden_constraints` records constraints discovered during ATTEND or comparison. `candidate_frame_count` is an integer from `0` through `4`; `selected_frame_count` is an integer from `0` through `2` and must equal the number of non-null primary/backup selections. `frame_comparison` includes the surviving and retired frames plus relevance, falsifiability, feasibility, and risk rationale. `cheapest_falsifier` includes the experiment, change-result, and preserve-result. `iteration_count` is an integer from `0` through `1`. It remains `0` when B9 emits `no_new_angle`; it becomes `1` only after the single permitted material-change loop completes. `framing_status` is `confirmed` only when the framing is supported by the available context, `assumed` when it relies on a conservative assumption, and `uncertain` when material ambiguity remains. `residual_uncertainty` records unresolved issues when a bounded limit prevents another iteration. `sequential_branches` records each fixed B node's branch ID and phase, in execution order.

## Safety boundary

This packet contains candidate framings only. It cannot register claims, supply evidence, or bypass Stage 3 verification, Stage 5.5 hallucination checks, or Stage 6 conclusion controls. Stage 1 must treat every framing, constraint discovery, and falsifier as context for investigation rather than as a verified claim.

## Linear degradation when `can_branch=false`

When `can_branch=false`, do not call sequential-thinking. Execute the same fixed phases and node labels as linear text, preserving the B node IDs, phase labels, decisions, limits, and uncertainty in `sequential_branches`. The output schema and all safety boundaries remain unchanged. Linear degradation is not permission to add branches, exceed the four-frame limit, select more than two frames, or iterate more than once.

## Termination behavior

Terminate Stage 0 after `B8` and either the single permitted `B9` iteration or `no_new_angle`. Missing mandatory packet fields block Stage 1 and return to Stage 0 or the prior owning contract for correction. When the frame, constraint, or falsifier limits are reached, stop expansion and record residual uncertainty in `framing_status`, `hidden_constraints`, or `frame_comparison`; never silently discard it. Only a complete `brainstorm_packet` may be handed to Stage 1.
