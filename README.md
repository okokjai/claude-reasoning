# Claude Reasoning v1.0.0

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stars](https://img.shields.io/github/stars/okokjai/claude-reasoning?style=social)](https://github.com/okokjai/claude-reasoning)
[![GitHub Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning)](https://github.com/okokjai/claude-reasoning/releases)
[![Platform: Claude Code](https://img.shields.io/badge/Platform-Claude%20Code-000000.svg?logo=claude)](https://claude.com/claude-code)
[![Zero Python](https://img.shields.io/badge/Zero-Python%20Dependency-blue.svg)]()
[![MCP](https://img.shields.io/badge/MCP-Ready-orange.svg)]()

**Graph-Based Reasoning Pipeline for Claude Code**

A comprehensive reasoning engine that chains structured contract templates with DAG orchestration via `sequential-thinking` MCP. Zero Python dependency — pure Markdown + MCP tools.

> This is the English international version. The original Chinese version is available in the [claude-reasoning-distillation](https://github.com/okokjai/claude-reasoning-distillation) repository.

---

## Features

- **Graph Architecture** — 8 contracts, 7 stages, 5 reasoning modes, 1 quality layer in separate files with DAG orchestration
- **Structured Contract Templates** — Native Markdown with explicit input/output fields + validation rules
- **DAG Branching & Backtracking** — Sequential-thinking for full reasoning traceability with revision support
- **5 Reasoning Modes** — Diagnostic, Design, Decision, Optimization, Innovation
- **8 Domain-Aware Verification Paths** — Investment, Finance, Career, Learning, Relationship, Tech, Daily, General
- **Multi-Engine Search & Scrape** — Integrated with `unified-fetch` MCP (Hound → DuckDuckGo → Google → DirectFetch)
- **Anti-Hallucination Harness** — Three-check P0 gate (entity existence, source verification, cross-reference)
- **Verifier Separation** — Gates, scores, and hallucination judgments produced by independent perspectives
- **Zero Python Dependency** — Pure Markdown + MCP tools, usable in any environment

---

## Requirements

- **Claude Code CLI** (Desktop or CLI mode)
- **MCP Servers** (recommended, configured in `mcp_servers.json`):
  - `sequential-thinking` — Reasoning node DAG engine (branching/backtracking/visualization)
  - `unified-fetch` — Multi-engine search (4 engines) + scrape (6 engines) with adaptive fallback

---

## ⚠️ MCP Dependencies & Fallback

**This skill is designed for MCP-enabled environments**, but has built-in fallback paths.

### With MCP (Recommended — Full Power)

| Feature | Tool | Stage |
|---------|------|-------|
| Reasoning branching & backtracking | `sequential-thinking` | Decomposition, Hypothesis, Critique |
| Multi-engine search (4 engines) | `unified-fetch search` | Verification |
| Multi-engine web scraping (6 engines) | `unified-fetch scrape` | Verification |

### Without MCP (Degraded Mode)

The skill auto-detects available tools and degrades gracefully:

| Feature | With MCP (CLI Full Mode) | Without MCP (Desktop Mode) |
|---------|--------------------------|----------------------------|
| Reasoning branching | ✅ Branching + backtracking | ❌ Linear reasoning (text-only) |
| Search | ✅ unified-fetch (4 engines) | ⚠️ Built-in WebSearch (1 engine) |
| Scraping | ✅ unified-fetch (6 engines) | ⚠️ Built-in WebFetch |
| Evidence cap | 5/5 | 3/5 |
| Quality assessment cap | 45/45 | 24/30 |

**Fallback logic** is defined in:
- `contracts/A2.md` — Platform detection (CLI Full Mode vs Desktop Mode)
- `contracts/C1.md` — Skip strategy (scale-adaptive degradation)
- `stages/stage-1-decomposition.md` — `can_branch=false` precondition check

> **Tip**: Even without `unified-fetch`, you can still run the full reasoning pipeline. Install just `sequential-thinking` for the best experience:
> ```bash
> npx -y @anthropic-ai/mcp-server-sequential-thinking
> ```
> Then add it to your `mcp_servers.json`.

---

## Installation

1. **Clone this repository** into your Claude Code skills directory:

   ```bash
   # Linux / macOS
   git clone https://github.com/okokjai/claude-reasoning.git ~/.claude/skills/claude-reasoning

   # Windows (Git Bash)
   git clone https://github.com/okokjai/claude-reasoning.git "$HOME/.claude/skills/claude-reasoning"
   ```

2. **Configure MCP Servers** in `~/.claude/mcp_servers.json`:

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

3. **Verify installation**:

   ```bash
   bash ~/.claude/skills/claude-reasoning/scripts/sync-check.sh
   ```

---

## Usage

Invoke the skill in Claude Code with the `/skill` command:

```bash
/skill claude-reasoning [your question or task description]
```

### Modes (auto-routed, or specify manually)

| Mode | Purpose | Example |
|------|---------|---------|
| `diagnostic` | System failures, bugs, root cause | `/skill claude-reasoning diagnostic production server crashed at 3am` |
| `design` | Architecture, API, system design | `/skill claude-reasoning design microservice migration plan` |
| `decision` | Technology selection, option comparison | `/skill claude-reasoning decision compare AWS Lambda vs Cloudflare Workers` |
| `optimization` | Performance tuning, cost optimization | `/skill claude-reasoning optimization reduce cloud costs without changing architecture` |
| `innovation` | Breaking bottlenecks, new approaches | `/skill claude-reasoning innovation reimagine file upload UX` |

### Domains (auto-detected)

| Domain | Description |
|--------|-------------|
| `investment` | Stocks, crypto, funds, real estate |
| `finance` | Budgeting, tax, insurance, retirement |
| `career` | Planning, negotiation, learning paths |
| `learning` | Knowledge management, skill acquisition |
| `relationship` | Communication, conflict, emotions |
| `tech` | Technical solutions, automation, tool selection |
| `daily` | Shopping, dining, travel, weather |
| `general` | General reasoning (retains all 5 modes) |

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Contract Framework Layer (Skeleton)              │
│   Contracts: A1 → A0 → A2 → C0 → C1 → A3 → A4                      │
│   - A1: Problem characteristics (data_type / domain)                │
│   - A0: Mode routing (inferred from A1 output)                      │
│   - A2: Reasoning strategy + platform detection + verification paths│
│   - A3: Claim types (A/B/C/D/E + verification thresholds)           │
│   - A4: Source quality tiers (T1-T5 + marketing detection)          │
│   - C0: User context capture                                        │
│   - C1: Skip strategy (scale-adaptive)                              │
│   - C2: Inter-stage transfer edge definitions                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Stage Layer (Execution Pipeline)                  │
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

### Fallback Path

When `sequential-thinking` is unavailable (`can_branch=false`), Stages 1/2/5 degrade to linear reasoning. Branches are recorded as text instead of `sequentialthinking` calls. See `contracts/C1.md` for the full skip strategy.

---

## Project Structure

```
claude-reasoning/
├── SKILL.md                    # Skill definition, usage, architecture overview
├── README.md                   # This file
├── LICENSE                     # MIT License
├── CHANGELOG.md                # Version history
├── .gitignore                  # Git exclusion rules
│
├── contracts/                  # Contract framework layer (node types)
│   ├── A0.md                   # Mode routing
│   ├── A1.md                   # Problem characteristics
│   ├── A2.md                   # Reasoning strategy + platform detection
│   ├── A3.md                   # Claim type definitions
│   ├── A4.md                   # Source quality tiers
│   ├── C0.md                   # User context capture
│   ├── C1.md                   # Skip strategy
│   └── C2.md                   # Inter-stage transfer edges
│
├── stages/                     # Execution pipeline
│   ├── stage-1-decomposition.md
│   ├── stage-2-hypothesis.md
│   ├── stage-3-verification.md
│   ├── stage-4-synthesis.md
│   ├── stage-5-critique.md
│   ├── stage-5.5-hallucination-harness.md
│   └── stage-6-conclusion.md
│
├── modes/                      # Reasoning mode templates
│   ├── diagnostic.md
│   ├── design.md
│   ├── decision.md
│   ├── optimization.md
│   └── innovation.md
│
├── quality/
│   └── self-assessment.md      # Quality self-assessment framework
│
└── scripts/
    ├── sync-check.sh           # Comprehensive integrity validation
    └── memory-cleanup.sh       # Reasoning memory cleanup & rotation
```

---

## MCP Toolchain

| Tool | Purpose | Stage |
|------|---------|-------|
| `sequential-thinking` | Reasoning nodes (branching/backtracking/visualization) | Decomposition, Hypothesis, Critique |
| `unified-fetch search` | Multi-engine search (4 engines, adaptive fallback) | Verification |
| `unified-fetch scrape` | Multi-engine web scraping (6 engines, adaptive fallback) | Verification |

### Platform Modes

| Mode | Search | Browse | Reasoning |
|------|--------|--------|-----------|
| CLI Full Mode | `unified-fetch search` | `unified-fetch scrape` | `sequential-thinking` |
| Desktop Mode | `WebSearch` | `WebFetch` | None (linear only) |

---

## 5 Reasoning Modes

### 1. Diagnostic — Differential Diagnosis
**Core**: Symptoms → Candidate Causes → Elimination Verification → Minimal Intervention
**Use for**: Bug fixes, system failures, performance issues, data anomalies

### 2. Design — Design Space Exploration
**Core**: Requirements → Constraints → Solution Space → Pareto Frontier
**Use for**: Architecture design, API design, system refactoring, technical proposals

### 3. Decision — Decision Matrix
**Core**: Options × Criteria → Weighted Scoring → Sensitivity Analysis
**Use for**: Technology selection, vendor selection, priority ranking

### 4. Optimization — Gradient Descent Thinking
**Core**: Current State → Gradient Direction → Step Size → Convergence Check
**Use for**: Performance optimization, cost optimization, process optimization

### 5. Innovation — Lateral Thinking
**Core**: Break Assumptions → Recombine Elements → New Combinations
**Use for**: Breaking bottlenecks, new feature ideation, non-traditional solutions

---

## Principles

- **Decompose first, then hypothesize** — never skip steps
- **At least 2 competing hypotheses per sub-problem** — avoid confirmation bias
- **Critique layer is mandatory** — at least 3 perspectives for high-risk problems
- **Backtrack and revise** — when a blind spot is found, backtrack to hypothesis stage, not start over
- **Forward propagation** — each stage's judgment passes to the next
- **Record the full reasoning chain** — including the sequential-thinking node tree
- **Verifier Separation** — gates, scores, and hallucination judgments are produced by independent perspectives
- **Post-edit, always reconcile** — after modifying any node, reconcile MEMORY.md index and check related file references

---

## License

MIT — see [LICENSE](LICENSE) for details.