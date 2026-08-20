# Stage 0 Mini Brainstorm and Stage 5 Reframing Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Add a mandatory, bounded Stage 0 sequential-thinking brainstorm that clarifies the problem before decomposition, plus a lightweight Stage 5 problem-reframing check, while preserving existing verification, anti-hallucination, fallback, and quality gates.

**Architecture:** Insert a fixed Stage 0 DAG after C0 and before Stage 1. Stage 0 generates a small set of distinct framings, compares them, converges on a primary framing and falsifier, and permits at most one bounded iteration. Pass its structured `brainstorm_packet` into Stage 1. Extend Stage 5 with one lightweight harder-frame check; only a framing defect may route once back to Stage 0, while hypothesis and evidence defects retain the existing Stage 2/3 routes. When `can_branch=false`, both additions record the same nodes as linear text without sequential-thinking calls.

**Tech Stack:** Markdown skill contracts and stage templates; sequential-thinking MCP when available; existing shell-based `scripts/sync-check.sh`; no new runtime dependency or executable code.

---

### Task 1: Add the Stage 0 contract and bounded control-flow graph

**Files:**
- Create: `stages/stage-0-mini-brainstorming.md`

**Step 1: Write the failing structural check**

Add a temporary shell assertion (run from the repository root) that expects the new stage file and required terms:

```bash
test -f stages/stage-0-mini-brainstorming.md
grep -q "brainstorm_packet" stages/stage-0-mini-brainstorming.md
grep -q "DIVERGE" stages/stage-0-mini-brainstorming.md
grep -q "can_branch=false" stages/stage-0-mini-brainstorming.md
```

Run:

```bash
bash -c 'test -f stages/stage-0-mini-brainstorming.md && grep -q "brainstorm_packet" stages/stage-0-mini-brainstorming.md && grep -q "DIVERGE" stages/stage-0-mini-brainstorming.md && grep -q "can_branch=false" stages/stage-0-mini-brainstorming.md'
```

Expected: FAIL because the stage file does not yet exist.

**Step 2: Create the stage template**

Define the stage as mandatory after C0 and before Stage 1. Include:

- Inputs: `raw_question`, `primary_mode`, `primary_domain`, `scale`, `platform_mode`, `can_branch`, `user_constraints`, `implicit_assumptions`, `success_criteria`.
- Precondition: all C0/A2 fields must be available; missing fields are recorded as unknown or returned to the prior contract, not silently invented.
- Bounded control-flow graph and branch IDs: `brainstorm-core`, `frame-pain`, `frame-constraints`, `frame-counterfactual`, `frame-baseline`, `frame-attend`, `frame-evaluate`, `frame-converge`, `frame-falsifier`, `frame-iterate`. The only permitted loop is `B9 → B5 → B6 → B7 → B8 → B9`; no second B9 is run.
- DIVERGE: generate at most four materially distinct frames; require a pain, target outcome, broken assumption, and distinction basis.
- ATTEND: record shared constraints, complementary insights, conflicts, duplicate frames, and missing information.
- CONVERGE: select one primary and at most one backup; retire others with reasons; include relevance, falsifiability, feasibility, and risk rationale.
- Falsifier: record the cheapest experiment, what result would change the frame, and what result preserves it.
- The bounded control-flow graph, with the only permitted iteration explicitly returning `B9 → B5 → B6 → B7 → B8 → B9`; no new B1–B4 branch family is created and a second B9 is not run.
- Output schema:

```yaml
brainstorm_packet:
  pain_statement: ...
  original_frame: ...
  selected_frame: ...
  backup_frame: ...
  hidden_constraints: []
  frame_comparison: ...
  cheapest_falsifier: ...
  no_new_angle: false
  iteration_count: 0
  framing_status: confirmed|assumed|uncertain
  sequential_branches: []
```

- Safety boundary: this packet contains candidate framings only; it cannot register claims, supply evidence, or bypass Stage 3, Stage 5.5, or Stage 6.
- Clarification rule: do not ask a user question when a conservative assumption is safe; ask at most one question only when unresolved ambiguity materially changes the solution space. Record assumptions and uncertainty otherwise.
- Linear degradation: with `can_branch=false`, keep the phase and node labels as text in `sequential_branches`; do not call sequential-thinking.
- Termination: missing packet fields block Stage 1; iteration and branch limits stop expansion and record residual uncertainty.

**Step 3: Run the structural check**

Run:

```bash
bash -c 'test -f stages/stage-0-mini-brainstorming.md && grep -q "brainstorm_packet" stages/stage-0-mini-brainstorming.md && grep -q "DIVERGE" stages/stage-0-mini-brainstorming.md && grep -q "can_branch=false" stages/stage-0-mini-brainstorming.md'
```

Expected: PASS.

**Step 4: Commit**

```bash
git add stages/stage-0-mini-brainstorming.md
git commit -m "feat: add stage zero mini brainstorm contract"
```

---

### Task 2: Extend the inter-stage contract and Stage 1 handoff

**Files:**
- Modify: `contracts/C2.md:10-18`
- Modify: `stages/stage-1-decomposition.md:30-48`

**Step 1: Write the failing contract assertions**

Run:

```bash
bash -c 'grep -q "Stage 0" contracts/C2.md && grep -q "brainstorm_packet" contracts/C2.md && grep -q "brainstorm_packet" stages/stage-1-decomposition.md'
```

Expected: FAIL because the current contract starts Stage 1 directly from A2/C0 and Stage 1 has no brainstorm input.

**Step 2: Update C2 edges**

Add these rows without removing existing safety fields:

```text
C0 -> Stage 0: user_constraints, success_criteria | implicit_assumptions
A2 -> Stage 0: primary_mode, scale, platform_mode, can_branch | disclaimer_text, evidence_cap, quality_cap
- Stage 0 -> Stage 1: `brainstorm_packet` is mandatory; uncertainty is read from its canonical framing fields, with no separate `stage_0_uncertainty` transfer.
Stage 5 -> Stage 0: framing_revision_request | only when problem framing is invalid and stage_0_revision_count < 1
```

Clarify that Stage 0 is mandatory for reasoning tasks, its packet is a candidate input rather than evidence, and a missing mandatory packet returns to Stage 0.

**Step 3: Update Stage 1 input and behavior**

Add mandatory input `brainstorm_packet` and optional `stage_0_uncertainty`. State that Stage 1 must:

- use `selected_frame` as the initial core-problem framing;
- preserve `original_frame`, `backup_frame`, hidden constraints, and falsifier as context;
- translate the framing into `core_problem`, `sub_problems`, and `immutable_constraints`;
- never elevate brainstorm candidates into verified claims;
- record a mismatch between Stage 0 and Stage 1 as a handoff issue and return to Stage 0 when material.

**Step 4: Run assertions**

Run:

```bash
bash -c 'grep -q "Stage 0" contracts/C2.md && grep -q "brainstorm_packet" contracts/C2.md && grep -q "brainstorm_packet" stages/stage-1-decomposition.md'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add contracts/C2.md stages/stage-1-decomposition.md
git commit -m "feat: hand off brainstorm packet to decomposition"
```

---

### Task 3: Add the lightweight Stage 5 problem-reframing check

**Files:**
- Modify: `stages/stage-5-critique.md:1-106`

**Step 1: Write the failing assertions**

Run:

```bash
bash -c 'grep -q "Problem Reframing Check" stages/stage-5-critique.md && grep -q "harder_frame" stages/stage-5-critique.md && grep -q "revision_target" stages/stage-5-critique.md'
```

Expected: FAIL because the current Stage 5 has no lightweight framing check or Stage 0 return target.

**Step 2: Add the perspective and bounded behavior**

Add `Problem Reframing Check` as a required perspective for all modes, separate from hallucination detection. It must:

- consume `brainstorm_packet`, `preliminary_conclusion`, `evidence_matrix`, `primary_mode`, `primary_domain`, and `can_branch`;
- select exactly one stress axis (`risk`, `scale`, `time`, `constraint`, or `stakeholder`);
- create one harder frame;
- test whether the preliminary conclusion survives;
- output:

```yaml
problem_reframing_check:
  original_frame: ...
  harder_frame: ...
  stress_axis: risk|scale|time|constraint|stakeholder
  conclusion_survives: yes|no|uncertain
  blind_spot: ...
  revision_required: yes|no
  revision_target: none|stage-0|stage-1|stage-2|stage-3
```

- not rerun DIVERGE/ATTEND/CONVERGE;
- route to Stage 0 only when the problem definition itself is invalid, and only once per reasoning run;
- retain current Stage 2 route for hypothesis defects and Stage 3 route for evidence defects;
- with `can_branch=false`, record the check linearly and preserve the same output fields.

Add the output to Stage 5's mandatory outputs and `revision_branches` semantics. Update the perspective mapping table and document that the Stage 0 return is a framing revision, not a normal hypothesis revision.

**Step 3: Run assertions**

Run:

```bash
bash -c 'grep -q "Problem Reframing Check" stages/stage-5-critique.md && grep -q "harder_frame" stages/stage-5-critique.md && grep -q "revision_target" stages/stage-5-critique.md'
```

Expected: PASS.

**Step 4: Commit**

```bash
git add stages/stage-5-critique.md
git commit -m "feat: add lightweight stage five reframing check"
```

---

### Task 4: Reconcile the top-level skill graph and forced Stage 0 rules

**Files:**
- Modify: `SKILL.md:65-147,221-262,394-404`

**Step 1: Write the failing assertions**

Run:

```bash
bash -c 'grep -q "Stage 0" SKILL.md && grep -q "stage-0-mini-brainstorming.md" SKILL.md && grep -q "Problem Reframing Check" SKILL.md'
```

Expected: FAIL because the top-level graph and node tables currently begin at Stage 1 and list only seven stages.

**Step 2: Update the graph and rules**

Update the architecture diagram and stage rules to show:

```text
A1 → A0 → A2 → C0 → Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 5.5 → Stage 6
```

Add Stage 0 to the tool mapping as sequential-thinking with linear fallback. Explain that Stage 0 is mandatory for every reasoning task, but fixed-budget and bounded:

- max four divergent frames;
- max two selected frames;
- max one iteration;
- `no_new_angle` is valid;
- no user question unless a material ambiguity cannot be safely assumed.

Document Stage 5 as the lightweight reframe check and distinguish it from Stage 0's full brainstorm. Add the new stage path to the stage table and update counts from seven stages to eight stages where applicable. Preserve all existing P0 gates, fallback rules, and revision limit language.

**Step 3: Run assertions**

Run:

```bash
bash -c 'grep -q "Stage 0" SKILL.md && grep -q "stage-0-mini-brainstorming.md" SKILL.md && grep -q "Problem Reframing Check" SKILL.md'
```

Expected: PASS.

**Step 4: Commit**

```bash
git add SKILL.md
git commit -m "docs: register mandatory stage zero in reasoning graph"
```

---

### Task 5: Update README and changelog documentation

**Files:**
- Modify: `README.md:21-31,47-89,181-205`
- Modify: `CHANGELOG.md:1-11`

**Step 1: Write the failing documentation assertions**

Run:

```bash
bash -c 'grep -q "Mini Brainstorm" README.md && grep -q "stage-0-mini-brainstorming.md" README.md && grep -q "Stage 0" CHANGELOG.md'
```

Expected: FAIL because neither file documents Stage 0.

**Step 2: Update README**

Document:

- Stage 0's purpose: identify the problem worth solving before decomposition, using the bounded control-flow graph and its fixed limits.
- The bounded control-flow graph and its one-loop budget.
- Stage 5's lightweight harder-frame check.
- The fact that Stage 0 output is a candidate packet and cannot bypass verification.
- Linear fallback when sequential-thinking is unavailable.
- Updated architecture and project tree counts.

Do not claim that source projects' named algorithms are literally implemented or that quality improvement is benchmark-proven.

**Step 3: Add changelog entry**

Add a new top entry (using the repository's existing version style) describing the Stage 0 mini brainstorm, Stage 5 lightweight reframe check, fixed budgets, and fallback behavior. Do not change the current version identifier until the implementation's release version is decided; if the repository policy requires a version bump, keep frontmatter, title, and changelog synchronized.

**Step 4: Run assertions**

Run:

```bash
bash -c 'grep -q "Mini Brainstorm" README.md && grep -q "stage-0-mini-brainstorming.md" README.md && grep -q "Stage 0" CHANGELOG.md'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document stage zero brainstorm and reframing"
```

---

### Task 6: Extend synchronization checks for the new graph node

**Files:**
- Modify: `scripts/sync-check.sh:52-72`

**Step 1: Write the failing check**

Run:

```bash
bash -c 'grep -q "stages/stage-0-mini-brainstorming.md" scripts/sync-check.sh'
```

Expected: FAIL because the script currently checks seven stage files and reports seven stages.

**Step 2: Update graph completeness checks**

Add `stages/stage-0-mini-brainstorming.md` to the stage list and update the success message to eight stages. Keep all existing checks intact. Do not add a check that requires a specific runtime MCP server when the script already allows session injection.

**Step 3: Run the synchronization script**

Run:

```bash
bash scripts/sync-check.sh
```

Expected: PASS with a graph completeness message reporting eight stages and `=== All checks passed ===`.

**Step 4: Commit**

```bash
git add scripts/sync-check.sh
git commit -m "test: include stage zero in synchronization checks"
```

---

### Task 7: Run the complete verification suite and reconcile references

**Files:**
- Verify: `contracts/C2.md`, `stages/stage-0-mini-brainstorming.md`, `stages/stage-1-decomposition.md`, `stages/stage-5-critique.md`, `SKILL.md`, `README.md`, `CHANGELOG.md`, `scripts/sync-check.sh`

**Step 1: Run whitespace verification**

```bash
git diff --check
```

Expected: no output and exit code 0.

**Step 2: Verify every referenced graph file exists**

```bash
for f in contracts/A0.md contracts/A1.md contracts/A2.md contracts/A3.md contracts/A4.md contracts/C0.md contracts/C1.md contracts/C2.md stages/stage-0-mini-brainstorming.md stages/stage-1-decomposition.md stages/stage-2-hypothesis.md stages/stage-3-verification.md stages/stage-4-synthesis.md stages/stage-5-critique.md stages/stage-5.5-hallucination-harness.md stages/stage-6-conclusion.md modes/diagnostic.md modes/design.md modes/decision.md modes/optimization.md modes/innovation.md quality/self-assessment.md CHANGELOG.md; do test -f "$f" || exit 1; done
```

Expected: no output and exit code 0.

**Step 3: Check safety-boundary references**

```bash
grep -RniE 'claim registration|Stage 3|Stage 5\.5|Stage 6|can_branch=false|no_new_angle|revision_target' stages/stage-0-mini-brainstorming.md stages/stage-5-critique.md contracts/C2.md
```

Expected: output showing the packet boundary, fallback, no-new-angle behavior, and bounded reframe routing.

**Step 4: Run the authoritative synchronization check**

```bash
bash scripts/sync-check.sh
```

Expected: exit code 0 and complete output ending with:

```text
=== All checks passed ===
```

**Step 5: Verify the worktree state**

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: the feature branch is clean after the planned commits, with no untracked generated files. If implementation is intentionally left uncommitted, report that explicitly rather than claiming completion.

**Step 6: Commit any final reconciliation**

If the preceding checks require a documentation or reference correction, make only that correction, rerun Steps 1–4, then commit:

```bash
git add contracts/C2.md stages/stage-0-mini-brainstorming.md stages/stage-1-decomposition.md stages/stage-5-critique.md SKILL.md README.md CHANGELOG.md scripts/sync-check.sh
git commit -m "chore: reconcile stage zero reasoning graph"
```

Do not claim the feature is complete until the fresh synchronization output has been read in full.
