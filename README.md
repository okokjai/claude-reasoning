<div align="center">

# 🧠 Claude Reasoning

**Structured reasoning pipeline for Claude Code**
**contracts · bounded forward control-flow · 5 reasoning modes · zero Python**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/okokjai/claude-reasoning?style=social)](https://github.com/okokjai/claude-reasoning)
[![GitHub Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning)](https://github.com/okokjai/claude-reasoning/releases)
[![Platform: Claude Code](https://img.shields.io/badge/Platform-Claude%20Code-000000.svg?logo=claude)](https://claude.com/claude-code)
[![Zero Python](https://img.shields.io/badge/Zero-Python%20Dependency-blue.svg)]()
[![MCP](https://img.shields.io/badge/MCP-Ready-orange.svg)]()

A contract-driven reasoning pipeline built from Markdown templates and MCP tools. It adds bounded framing, competing hypotheses, evidence verification, independent critique, anti-hallucination checks, and quality assessment without a Python runtime.

</div>

---

## 🎯 Why Claude Reasoning?

Most long prompts and flat expert panels produce a plausible answer in one pass. Claude Reasoning turns that pass into a **bounded, inspectable reasoning process**: define the problem, challenge competing explanations, verify claims, critique the result, and gate the conclusion before presenting it.

### What the Update Adds

| Capability | What it changes for the user |
|------------|------------------------------|
| **Problem framing before analysis** | Mandatory Stage 0 tests the problem definition before decomposition, with up to 4 candidate frames, 2 selected frames, and 1 bounded iteration. |
| **Competing explanations** | Stage 2 registers multiple hypotheses, including a null hypothesis, before any search begins. |
| **Evidence before conclusions** | Stage 3 verifies claims with multi-engine search/scraping, negative searches, entity checks, and T1–T5 source annotation. |
| **Independent hallucination gate** | Stage 5.5 separately checks entity existence, source support, and cross-reference integrity; it is not self-reported by the main critique. |
| **Targeted correction instead of blind retry** | Failure routes send a defect back to the responsible stage with `failure_context`, while revision limits prevent unbounded loops. |
| **Same reasoning without branching MCP** | `can_branch=false` switches to linear mode but keeps the same stages, contracts, schemas, and mandatory Stage 0. |
| **Environment-backed enforcement** | Contract → Trail → Gate hooks record the expected flow and flag missing required steps. |

### The Practical Result

You get a conclusion that is easier to inspect and challenge: the framing is explicit, claims are registered before research, evidence and counter-evidence are recorded, uncertainty is carried forward, and the final answer is labeled by evidence strength. This is a process improvement, not an unverified claim that it always outperforms a single long prompt.

---

## 🔍 What Makes It Different

| Dimension | Typical long prompt or flat panel | Claude Reasoning |
|-----------|----------------------------------|------------------|
| **Starting point** | Jumps directly to solution generation | Stage 0 frames the problem before decomposition |
| **Hypotheses** | One-pass answer or implicit assumptions | Competing hypotheses + null hypothesis + `claim_registry` |
| **Research** | Evidence gathered opportunistically | Required search paths, negative search, and source-tier annotation |
| **Quality control** | Same perspective writes and judges the answer | Independent Stage 5.5 entity/source/cross-reference gate |
| **Corrections** | Retry the whole prompt or patch the final wording | Bounded `failure_route` to the affected stage |
| **Fallback** | Tool failure changes the prompt ad hoc | Linear mode preserves stages, contracts, and output schemas |
| **Runtime claim** | Often implies a hidden orchestration engine | Honest Markdown contract pipeline; MCP tools record nodes and fetch evidence |

---

## ✨ Features

| Category | Capabilities |
|----------|-------------|
| 🏗️ **Pipeline Architecture** | 8 contracts (A0-A4 + C0-C2), 8 execution stages, 5 reasoning modes, and 1 quality layer — a forward DAG-shaped pipeline with bounded conditional control-flow |
| 📋 **Structured Contracts** | Native Markdown templates with explicit inputs, outputs, transfer fields, and validation rules |
| 🧭 **Bounded Framing** | Mandatory Stage 0 mini-brainstorm: at most 4 candidate frames, 2 selections, and 1 bounded iteration |
| 🌲 **Reasoning Traceability** | `sequential-thinking` records reasoning nodes, branches, and bounded backtracking when available |
| 🔍 **Evidence Verification** | [**unified-fetch**](https://github.com/okokjai/unified-fetch) provides multi-engine search and scraping, negative searches, and source-tier annotation |
| 🛡️ **Anti-Hallucination** | Independent Stage 5.5 P0 gate for entity existence, source verification, and cross-reference checks |
| 🔬 **Verifier Separation** | Gates, scores, and hallucination judgments are produced independently from the main verification perspective |
| 🐍 **Zero Python** | Pure Markdown plus MCP tools; no Python dependency is required by the skill itself |

---

## 🧩 5 Reasoning Modes

| Mode | Mechanism | Use For |
|------|-----------|---------|
| 🔍 **Diagnostic** | Symptoms → Candidate Causes → Elimination → Minimal Intervention | Bug fixes, system failures, data anomalies |
| 🏛️ **Design** | Requirements → Constraints → Solution Space → Pareto Frontier | Architecture, API design, refactoring |
| ⚖️ **Decision** | Options × Criteria → Weighted Scoring → Sensitivity Analysis | Technology selection, vendor selection, ranking |
| ⚡ **Optimization** | Current State → Gradient Direction → Step Size → Convergence | Performance tuning, cost optimization |
| 💡 **Innovation** | Break Assumptions → Recombine Elements → New Combinations | Breaking bottlenecks, new features |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Contract Framework Layer                          │
│   A1 → A0 → A2 → C0 → C1 → C2                                      │
│   Classification → routing → strategy → context → transfer rules    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage Execution Pipeline                          │
│                                                                     │
│   Stage 0: Mini Brainstorm ──→ bounded framing + falsifier          │
│        │                                                            │
│        ▼                                                            │
│   Stage 1: Decomposition  ──→ sub-problems and dependencies         │
│        │                                                            │
│        ▼                                                            │
│   Stage 2: Hypothesis     ──→ competing hypotheses + claim_registry  │
│        │                                                            │
│        ▼                                                            │
│   Stage 3: Verification   ──→ unified-fetch + negative search        │
│        │                                                            │
│        ▼                                                            │
│   Stage 4: Synthesis      ──→ evidence merge + preliminary result    │
│        │                                                            │
│        ▼                                                            │
│   Stage 5: Critique       ──→ perspectives + precision audit         │
│        │                 └─→ bounded routes to Stage 0/1/2/3        │
│        ▼                                                            │
│   Stage 5.5: P0 Gate      ──→ entity/source/cross-reference checks   │
│        │                 └─→ failure_route to Stage 3 or Stage 5    │
│        ▼                                                            │
│   Stage 6: Conclusion     ──→ gates + Conclusion Card + Memory       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Quality Self-Assessment                           │
│        Full scale (/50 or /55) or simplified scale (/36)             │
└─────────────────────────────────────────────────────────────────────┘
```

This is a **forward DAG-shaped pipeline with bounded conditional control-flow**, not a runtime DAG engine. The pipeline uses the LLM to read contract templates and transfer structured outputs between stages. `sequential-thinking` is a reasoning node logger; when `can_branch=false`, the same stages and schemas run in linear mode and no stage is skipped.

---

## 🚀 Quick Start

### Requirements

- **Claude Code CLI** (Desktop or CLI mode)
- **MCP Servers** (recommended):
  - [`sequential-thinking`](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) — reasoning node logging and branching
  - [`unified-fetch`](https://github.com/okokjai/unified-fetch) — multi-engine search and scraping

### Installation

```bash
# Clone into the skills directory
git clone https://github.com/okokjai/claude-reasoning.git ~/.claude/skills/claude-reasoning

# Verify installation
bash ~/.claude/skills/claude-reasoning/scripts/sync-check.sh
```

### MCP Configuration

Add the servers to `~/.claude.json` (Windows: `C:/Users/<USERNAME>/.claude.json`) or `~/.claude/mcp_servers.json`:

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

### Dependencies

> **🧰 Recommended companion**: [**unified-fetch**](https://github.com/okokjai/unified-fetch) — multi-engine web search and scraping MCP server with 4 search engines, 6 scrape engines, adaptive fallback, and zero API keys.

---

## ⚠️ MCP Fallback

The skill auto-detects available tools and adapts:

| Feature | With MCP (CLI Full Mode) | Without MCP (Desktop Mode) | Hook Enforcement |
|---------|--------------------------|----------------------------|------------------|
| Reasoning branching | ✅ Branching + bounded backtracking | ⚠️ Linear mode (text records) | ✅ Contract + Trail + Gate |
| Search | ✅ unified-fetch (4 engines) | ⚠️ Built-in WebSearch (1 engine) | ✅ Contract + Trail + Gate |
| Scraping | ✅ unified-fetch (6 engines) | ⚠️ Built-in WebFetch | ✅ Contract + Trail + Gate |
| Evidence cap | 5/5 | 3/5 | ✅ Contract + Trail + Gate |
| Quality assessment cap | 45/45 | 24/30 | ✅ Contract + Trail + Gate |

`can_branch=false` changes execution, not pipeline presence. Stage 0 remains mandatory; only the skip rules in `contracts/C1.md` may shorten later stages under their documented conditions.

**Tip**: Even without `unified-fetch`, the full reasoning pipeline can still run. Install `sequential-thinking` for the best branching experience:

```bash
npx -y @modelcontextprotocol/server-sequential-thinking
```

---

## 🛠️ Usage

```bash
/skill claude-reasoning [your question or task description]
```

### Examples

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

### Claim Lifecycle and Failure Routes

`claim_registry` is the single source of truth for verifiable claims:

```
Stage 2 (register) → Stage 3 (verify) → Stage 4/5 (synthesize and critique) → Stage 5.5 (P0 gate)
```

| Route | Trigger | Payload |
|-------|---------|---------|
| Stage 5.5 → Stage 3 | Entity, source, or evidence verification is missing | `failure_route=stage-3` + `failure_context` |
| Stage 5.5 → Stage 5 | Wording, precision, annotation, or concealed-conflict defect | `failure_route=stage-5` + `failure_context` |
| Stage 6 → Stage 1 | Post-gate decomposition correction, at most once | `gate_failure_class` + `fix_requirements` |
| Stage 5 → Stage 0/1/2/3 | Framing, decomposition, hypothesis, or evidence defect | `fix_requirements` + `revision_branches` |

Revision limits are bounded: at most 3 revisions per round, at most 1 Stage 0 return, and `no_new_angle=true` requires `iteration_count=0`.

---

## 🛡️ Execution Enforcement

The reasoning flow is enforced by the environment, not by model self-discipline:

| Hook | Role | Mechanism |
|------|------|-----------|
| `UserPromptSubmit` | Contract generation | Detects `/claude-reasoning` → generates `~/.claude/reasoning-contracts/{session}.json` with the expected tool sequence |
| `PostToolUse` | Trail recording | Every tool call → environment appends to `~/.claude/reasoning-trail/{session}.jsonl` |
| `Stop` | Gate | Before the model stops, compares the trail with the contract and reports missing items |

The hard contract requires an actual `mcp__unified-fetch__status` call for platform detection. Stage 3 search/scrape and `sequential-thinking` calls are audited by `sync-check.sh --runtime` as advisory checks. Sessions without a generated contract are unaffected.

---

## 📦 Stage 0 Packet Invariants

| Field | Range | Rule |
|-------|-------|------|
| `candidate_frame_count` | `0..4` | At most four materially distinct candidate frames |
| `selected_frame_count` | `0..2` | One primary frame and at most one backup; equals the number of non-null selections |
| `iteration_count` | `0..1` | `0` with `no_new_angle=true`; `1` only after the single bounded loop |
| `no_new_angle` | `true|false` | `true` requires `iteration_count=0` |
| `framing_status` | `confirmed|assumed|uncertain` | Canonical Stage 0 uncertainty field |

---

## 📁 Project Structure

```
claude-reasoning/
├── SKILL.md                    # Skill router and usage
├── CHANGELOG.md                # Version history
│
├── contracts/                  # Contract framework layer
│   ├── A0.md → A4.md           # Classification → source quality
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
├── architecture.md             # Pipeline topology and stage rules
├── mcp-toolchain.md            # Tool mapping and enforcement hooks
├── output-spec.md              # Conclusion Card and evidence calibration
├── memory-integration.md       # Memory write paths and cache table
└── scripts/                    # Validation and maintenance
    ├── sync-check.sh           # Structure, semantic, and release checks
    └── memory-cleanup.sh       # Reasoning log rotation (dry-run supported)
```

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
