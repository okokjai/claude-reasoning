<div align="center">

# 🧠 Claude Reasoning

**Graph-based reasoning pipeline for Claude Code**
**structured contracts · DAG orchestration · 5 reasoning modes · zero Python**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/okokjai/claude-reasoning?style=social)](https://github.com/okokjai/claude-reasoning)
[![GitHub Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning)](https://github.com/okokjai/claude-reasoning/releases)
[![Platform: Claude Code](https://img.shields.io/badge/Platform-Claude%20Code-000000.svg?logo=claude)](https://claude.com/claude-code)
[![Zero Python](https://img.shields.io/badge/Zero-Python%20Dependency-blue.svg)]()
[![MCP](https://img.shields.io/badge/MCP-Ready-orange.svg)]()

A comprehensive reasoning engine that chains structured contract templates with DAG orchestration via `sequential-thinking` MCP. Zero Python dependency — pure Markdown + MCP tools.

</div>

---

## ✨ Features

| Category | Capabilities |
|----------|-------------|
| 🏗️ **Graph Architecture** | 8 contracts, 7 stages, 5 reasoning modes, 1 quality layer — DAG orchestration |
| 📋 **Structured Contracts** | Native Markdown templates with explicit input/output fields + validation rules |
| 🌲 **DAG Branching** | Sequential-thinking for full reasoning traceability with backtracking revision |
| 🔍 **Multi-Engine Search** | Integrated with [**unified-fetch**](https://github.com/okokjai/unified-fetch) — 4 search engines + 6 scrape engines |
| 🛡️ **Anti-Hallucination** | Three-check P0 gate (entity existence, source verification, cross-reference) |
| 🔬 **Verifier Separation** | Gates, scores, and hallucination judgments from independent perspectives |
| 🐍 **Zero Python** | Pure Markdown + MCP tools — no Python dependencies |

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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Contract Framework Layer                          │
│   A1 → A0 → A2 → C0 → C1 → A3 → A4                                  │
│   Problem classification → Mode routing → Strategy → Verification    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Stage Execution Pipeline                          │
│                                                                      │
│   Stage 1: Decomposition   ──→ sequential-thinking (branching)       │
│        │                                                             │
│        ▼                                                             │
│   Stage 2: Hypothesis      ──→ sequential-thinking (branching)       │
│        │                                                             │
│        ▼                                                             │
│   Stage 3: Verification    ──→ unified-fetch (search + scrape)       │
│        │                     ──→ Entity existence check (P0)         │
│        │                     ──→ Negative search (falsification)     │
│        │                     ──→ Source quality annotation (T1-T5)   │
│        ▼                                                             │
│   Stage 4: Synthesis       ──→ Pure reasoning (evidence merge)       │
│        │                                                             │
│        ▼                                                             │
│   Stage 5: Critique        ──→ sequential-thinking (multi-perspective│
│        │                     ──→ Backtrack revision (if blind spot)  │
│        ▼                                                             │
│   Stage 5.5: Anti-Halluc.  ──→ P0 gate (entity/source/cross-ref)    │
│        │                                                             │
│        ▼                                                             │
│   Stage 6: Conclusion      ──→ P0 gates + Conclusion Card + Memory   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Quality Self-Assessment                          │
│   Full scale (/50) or simplified scale (/30) → verdict → memory      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Requirements

- **Claude Code CLI** (Desktop or CLI mode)
- **MCP Servers** (recommended):
  - [`sequential-thinking`](https://github.com/anthropics/mcp-server-sequential-thinking) — Reasoning DAG engine
  - [`unified-fetch`](https://github.com/okokjai/unified-fetch) — Multi-engine search & scrape

### Installation

```bash
# Clone into skills directory
git clone https://github.com/okokjai/claude-reasoning.git ~/.claude/skills/claude-reasoning

# Verify installation
bash ~/.claude/skills/claude-reasoning/scripts/sync-check.sh
```

### MCP Configuration

Add to your `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-sequential-thinking"]
    },
    "unified-fetch": {
      "command": "python3",
      "args": ["path/to/unified-fetch-server.py"]
    }
  }
}
```

### Dependencies

> **🧰 Recommended companion**: [**unified-fetch**](https://github.com/okokjai/unified-fetch) — multi-engine web search & scraping MCP server. 4 search engines, 6 scrape engines, adaptive fallback, zero API keys.

---

## ⚠️ MCP Fallback

The skill auto-detects available tools and degrades gracefully:

| Feature | With MCP (CLI Full Mode) | Without MCP (Desktop Mode) |
|---------|--------------------------|----------------------------|
| Reasoning branching | ✅ Branching + backtracking | ❌ Linear reasoning (text-only) |
| Search | ✅ unified-fetch (4 engines) | ⚠️ Built-in WebSearch (1 engine) |
| Scraping | ✅ unified-fetch (6 engines) | ⚠️ Built-in WebFetch |
| Evidence cap | 5/5 | 3/5 |
| Quality assessment cap | 45/45 | 24/30 |

**Tip**: Even without `unified-fetch`, you can still run the full reasoning pipeline. Install just `sequential-thinking` for the best experience:

```bash
npx -y @anthropic-ai/mcp-server-sequential-thinking
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
├── stages/                     # Execution pipeline (7 stages)
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
└── scripts/                    # Validation & maintenance
```

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.