<div align="center">

# 🧠 Claude Reasoning

**Structured reasoning pipeline for Claude Code — not another flat expert panel.**

**Contracts · Forward DAG-shaped pipeline · 5 reasoning modes · Zero Python dependency**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning)](https://github.com/okokjai/claude-reasoning/releases)
[![Platform: Claude Code](https://img.shields.io/badge/Platform-Claude%20Code-000000.svg?logo=claude)](https://claude.com/claude-code)
[![Zero Python](https://img.shields.io/badge/Zero-Python%20Dependency-blue.svg)]()
[![MCP](https://img.shields.io/badge/MCP-Ready-orange.svg)]()

</div>

---

## What This Is (and Is Not)

This is a **structured reasoning pipeline**: 8 contracts, 8 stages, 5 reasoning modes, and 1 quality layer — all driven by Markdown contract templates and MCP tools. It chains problem classification → framing → decomposition → hypothesis → verification → synthesis → critique → hallucination gate → conclusion, with bounded backtracking between stages.

Most multi-agent reasoning systems give you breadth through parallelism. Claude Reasoning gives you **depth through structured iteration, bounded control-flow, and verifier separation**.

**What this is not:**
- It is **not** a LangGraph-based Python orchestrator. The "DAG" is a **forward DAG-shaped pipeline with bounded conditional control-flow** — executed by the LLM reading contract templates, not by a runtime state machine.
- It is **not** a free-form brainstorming canvas. Stage 0 is bounded: at most 4 frames, 2 selected, 1 iteration.
- `sequential-thinking` is a **node logger**, not a DAG engine. `can_branch=false` removes branch visualization, not core reasoning. All stages, contracts, and output schemas are identical in both modes.
- Output quality versus a single long prompt is **unevaluated**. See [`CHANGELOG.md`](CHANGELOG.md) for the evolution history.

---

## The Core Problem with Flat Expert Panels

Typical "expert panel" reasoning setups work like this:

- Spawn N agents with static personas.
- Run them in parallel or loose conversation.
- Synthesize once.
- Done.

You get diversity of perspective, but no **structured depth**: no decomposition-first approach, no falsification search, no independent hallucination gate, no verifier separation. The agents do not become meaningfully better at the *specific* problem over time.

Claude Reasoning treats reasoning as a **structured pipeline of contract-driven stages**, each with explicit input/output schemas, validation rules, and bounded control-flow. The result is compounding depth rather than repeated breadth.

---

## What Makes Claude Reasoning Different

| Dimension | Typical Expert Panel | Claude Reasoning |
|-----------|--------------------|------------------|
| **Orchestration** | Loose conversation or flat parallel | Forward DAG-shaped pipeline + bounded conditional control-flow |
| **Framing** | Implicit or none | Mandatory Stage 0: bounded DIVERGE→ATTEND→CONVERGE→FALSIFIER→ITERATE, at most 4 frames, 1 iteration |
| **Decomposition** | Ad-hoc per agent | Stage 1 structured decomposition before any hypothesis |
| **Hypothesis** | Single-sweep generation | Stage 2: ≥2 competing hypotheses + null hypothesis + `claim_registry` |
| **Verification** | Trust agent reports | Stage 3: multi-engine search + entity existence check (P0) + negative search (falsification) + T1–T5 source annotation |
| **Critique** | Self-reported | Stage 5: multi-perspective (6–12) + independent Problem Reframing Check |
| **Hallucination gate** | None | Stage 5.5: independent P0 gate (entity/source/cross-reference), not self-reported |
| **Conclusion** | Single answer | Stage 6: P0 gates + evidence language calibration (`[Confirmed]`/`[Partially Confirmed]`/`[Speculative]`/`[Unknown]`/`[Contested]`) |
| **Quality** | Implicit | Full /50 or simplified /36 self-assessment → Memory |
| **Backtrack bounds** | None | ≤3 revisions per round, Stage 0 ≤1 return, `no_new_angle` ⇒ `iteration_count=0` |
| **Failure routes** | Manual retry | Structured: Stage 5.5→Stage 3/5, Stage 5→Stage 0/1/2/3, Stage 6→Stage 1, each with `failure_context` |
| **Verifier separation** | Same perspective | Gates, scores, and hallucination judgments from independent perspectives |

---

## 🧩 5 Reasoning Modes

| Mode | Mechanism | Use For |
|------|-----------|---------|
| 🔍 **Diagnostic** | Symptoms → Candidate Causes → Elimination → Minimal Intervention | Bug fixes, system failures, data anomalies |
| 🏛️ **Design** | Requirements → Constraints → Solution Space → Pareto Frontier | Architecture, API design, refactoring |
| ⚖️ **Decision** | Options × Criteria → Weighted Scoring → Sensitivity Analysis | Tech selection, vendor selection, ranking |
| ⚡ **Optimization** | Current State → Gradient Direction → Step Size → Convergence | Performance tuning, cost optimization |
| 💡 **Innovation** | Break Assumptions → Recombine Elements → New Combinations | Breaking bottlenecks, new features |

---

## Stage-by-Stage Breakdown

| Stage | Tool | Key Mechanism | Output |
|-------|------|---------------|--------|
| **A1** | None | Classify `data_type` / `primary_domain`; non-trigger conditions exit early | Classification record |
| **A0** | None | Route `primary_mode` via priority rules (10 rules, high→low confidence) | Routed mode |
| **A2** | `unified-fetch status` | Detect platform mode; generate `verification_paths` per domain; set `can_branch` | Reasoning strategy plan |
| **C0** | None | Capture user constraints, implicit assumptions, success criteria | Structured context |
| **Stage 0** | `sequential-thinking` | Bounded control-flow: DIVERGE (≤4 frames) → ATTEND → EVALUATE → CONVERGE (≤2) → FALSIFIER → ITERATE (≤1) | `brainstorm_packet` (candidate only, never evidence) |
| **Stage 1** | `sequential-thinking` | Decompose core problem into sub-problems with dependencies and tool requirements | `core_problem` + `sub_problems` |
| **Stage 2** | `sequential-thinking` | Generate ≥2 competing hypotheses + null hypothesis; complete `claim_registry` (P0, before any search) | Hypotheses + `verification_plan` + `claim_registry` |
| **Stage 3** | `unified-fetch` | Multi-engine search + scrape; entity existence check (P0); negative search (falsification); T1–T5 source annotation | `evidence_matrix` + `source_quality_matrix` + `claim_verification_status` |
| **Stage 4** | None | Merge evidence, resolve contradictions, emit `preliminary_conclusion` | `confirmed_facts` + `preliminary_conclusion` + `residual_uncertainty` |
| **Stage 5** | `sequential-thinking` | Multi-perspective critique (6–12, per mode mapping) + Problem Reframing Check + precision audit ± backtrack | `fix_requirements` + `revision_branches` + `precision_audit` |
| **Stage 5.5** | None | Independent P0 gate: entity existence check + source verification + cross-reference check | `hallucination_pass` (yes/no) + `failure_route` on fail |
| **Stage 6** | None | P0 gates (evidence sufficiency, hallucination, output compliance, confidence) + Conclusion Card with evidence language calibration | Conclusion + `evidence_levels` + Memory write |
| **Quality** | None | Self-assessment /50 or /36; write Pattern Asset to Memory | `verdict` (`Pass`/`Needs Improvement`/`Redo`) |

---

## 🔄 Claim Lifecycle & Failure Routes

`claim_registry` is the single source of truth for verifiable claims:

```
Stage 2 (register) → Stage 3 (verify + negative search + T1-T5) → Stage 4/5 (synthesize/critique) → Stage 5.5 (P0 gate)
```

Failure routes (bounded, with `failure_context` + `revision bounds`):

| Route | Trigger | Payload |
|-------|---------|---------|
| Stage 5.5 → Stage 3 | entity/source missing or cross-ref needs evidence | `failure_route=stage-3`, `failure_context{...}` |
| Stage 5.5 → Stage 5 | wording/precision/annotation or concealed conflict | `failure_route=stage-5`, `failure_context{...}` |
| Stage 6 → Stage 1 | post-gate decomposition fix (≤1, `revision_count 0..1`) | `gate_failure_class` + `fix_requirements` |
| Stage 5 → Stage 0/1/2/3 | framing → Stage 0 (≤1, `stage_0_revision_count 0..1`), hypothesis → Stage 2, evidence → Stage 3 | `fix_requirements` + `revision_branches` |

Bounds: per-round revision limit ≤3, `stage_0_revision_count` ≤1, `no_new_angle=true` ⇒ `iteration_count=0`. See `contracts/C2.md` for the full edge table.

---

## 🔀 Branching Control: `can_branch`

| `can_branch` | Engine | Behavior |
|--------------|--------|----------|
| `true` | `sequential-thinking` available | Full branching/backtracking via MCP |
| `false` | unavailable (Desktop / session-injected missing) | **Linear mode**: same stages, same `B0-B9` labels and `brainstorm_packet` schema, recorded as text; **no stage is skipped** (Stage 0 stays mandatory) |

`can_branch=false` changes execution, not presence. `contracts/C1.md` owns skip rules; only `C1` may shorten later stages under listed conditions.

---

## 📦 Stage 0 Packet Invariants

| Field | Range | Rule |
|-------|-------|------|
| `candidate_frame_count` | `0..4` | `B1-B4` at most four materially distinct frames |
| `selected_frame_count` | `0..2` | `1` primary + at most `1` backup; equals number of non-null selections |
| `iteration_count` | `0..1` | `0` with `no_new_angle=true`, `1` after the single `B9 → B5 → B6 → B7 → B8 → B9` loop |
| `no_new_angle` | `true|false` | `true` ⇒ `iteration_count` must be `0` |
| `framing_status` | `confirmed|assumed|uncertain` | canonical Stage 0 uncertainty field (no `stage_0_uncertainty` alias) |

---

## 🚀 Quick Start

### Requirements

- **Claude Code CLI** (Desktop or CLI mode)
- **MCP Servers** (recommended):
  - [`sequential-thinking`](https://github.com/anthropics/mcp-server-sequential-thinking) — Reasoning node logger
  - [`unified-fetch`](https://github.com/okokjai/unified-fetch) — Multi-engine search & scrape

### Installation

```bash
# Clone into skills directory
git clone https://github.com/okokjai/claude-reasoning.git ~/.claude/skills/claude-reasoning

# Verify installation
bash ~/.claude/skills/claude-reasoning/scripts/sync-check.sh
```

### MCP Configuration

Add to your `~/.claude.json` (Windows: `C:/Users/<you>/.claude.json`) or `~/.claude/mcp_servers.json` (both are checked):

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "unified-fetch": {
      "command": "python3",
      "args": ["path/to/unified-fetch-server.py"]
    }
  }
}
```

### Usage

```bash
/skill claude-reasoning [your question or task description]
```

Examples:

```bash
# Decision: technology comparison
/skill claude-reasoning recommend a cloud database for a startup with $500/month budget

# Diagnostic: root cause analysis
/skill claude-reasoning diagnostic API latency spikes every hour at :00

# Daily: shopping decision
/skill claude-reasoning recommend a clean hotel near downtown Austin under $120

# Investment analysis
/skill claude-reasoning analyze Bitcoin market conditions for H2 2026
```

---

## ⚠️ MCP Fallback

The skill auto-detects available tools and adapts:

| Feature | With MCP (CLI Full Mode) | Without MCP (Desktop Mode) | Hook Enforcement |
|---------|--------------------------|----------------------------|------------------|
| Reasoning branching | ✅ Branching + backtracking | ❌ Linear reasoning (text-only) | ✅ Contract + Trail + Gate |
| Search | ✅ unified-fetch (4 engines) | ⚠️ Built-in WebSearch (1 engine) | ✅ Contract + Trail + Gate |
| Scraping | ✅ unified-fetch (6 engines) | ⚠️ Built-in WebFetch | ✅ Contract + Trail + Gate |
| Evidence cap | 5/5 | 3/5 | ✅ Contract + Trail + Gate |
| Quality assessment cap | 45/45 | 24/30 | ✅ Contract + Trail + Gate |

**Tip**: Even without `unified-fetch`, you can still run the full reasoning pipeline. Install just `sequential-thinking` for the best experience:

```bash
npx -y @modelcontextprotocol/server-sequential-thinking
```

---

## 🛡️ Execution Enforcement

The reasoning flow is enforced by the environment, not by model self-discipline:

| Hook | Role | Mechanism |
|------|------|-----------|
| `UserPromptSubmit` | Contract generation | Detects `/claude-reasoning` → generates `~/.claude/reasoning-contracts/{session}.json` (required tool sequence) |
| `PostToolUse` | Trail recording | Every tool call → environment appends to `~/.claude/reasoning-trail/{session}.jsonl` (model does not participate) |
| `Stop` | Gate | Before model stops, compares trail vs contract → missing items block + inject missing list |

**Hard contract**: A2 execution rule 1's `mcp__unified-fetch__status` must be actually called (no exceptions).
**Soft contract**: Stage 3 search/scrape and sequential-thinking calls are audited by `sync-check.sh --runtime` as WARN.
**Kill switch**: Sessions without a contract are completely unaffected; adversarial tampering (model using tools to modify trail) is physically unpreventable — honest declaration.

---

## 📁 Project Structure

```
claude-reasoning/
├── SKILL.md                    # Skill definition & architecture
├── CHANGELOG.md                # Version history
│
├── contracts/                  # Contract framework layer
│   ├── A0.md → A4.md           # Problem classification → Source quality
│   ├── C0.md                   # User context capture
│   ├── C1.md                   # Skip strategy
│   └── C2.md                   # Inter-stage transfer edges
│
├── stages/                     # Execution pipeline (8 stages)
│   ├── stage-0-mini-brainstorming.md
│   ├── stage-1-decomposition.md
│   ├── stage-2-hypothesis.md
│   ├── stage-3-verification.md
│   ├── stage-4-synthesis.md
│   ├── stage-5-critique.md
│   ├── stage-5.5-hallucination-harness.md
│   └── stage-6-conclusion.md
│
├── modes/                      # 5 reasoning mode templates
├── quality/                    # Quality self-assessment
├── architecture.md             # DAG diagram + topology (progressive disclosure)
├── mcp-toolchain.md            # Tool mapping + enforcement hooks
├── output-spec.md              # Conclusion Card + evidence calibration
├── memory-integration.md       # Memory write paths + cache table
└── scripts/                    # Validation & maintenance
    ├── sync-check.sh           # Structure + semantic + release checks
    └── memory-cleanup.sh       # Reasoning log rotation (dry-run supported)
```

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.