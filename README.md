<div align="center">

# 🧠 Claude Reasoning v2.0

**Plugin-based parallel reasoning pipeline for Claude Code — algorithm and MCP capability hot-swapping**

[![Test Status](https://img.shields.io/badge/tests-96%2F96-passing-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue)]()
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

</div>

---

## What This Is

Claude Reasoning v2.0 is the current **plugin-based reasoning pipeline** for Claude Code. A fixed kernel protects the reasoning contract and quality gates while a configurable Router selects algorithm and tool plugins for each run.

The original Markdown contracts, stages, modes, and quality rules remain the prompt specification layer. v2 changes the execution harness around them: algorithms define execution topology, MCP adapters provide capabilities, and the Router chooses a cost/quality/time trade-off.

## Core Features

| Layer | What v2 provides |
|-------|------------------|
| **Fixed Kernel** | Mandatory Stage 0, Stage 5.5 anti-hallucination checks, Stage 6 conclusion gates, C2 route bounds, Stage 3 precision checks, and evidence-language calibration cannot be bypassed by a plugin. |
| **Algorithm Plugins** | CoT, ToT, ReAct, and DAC are registered algorithms. Select one directly or let the Router choose. |
| **Tool Plugins** | Reasoning logger, search engine, and scraper are capability interfaces backed by MCP adapters or local fallbacks. |
| **Smart Router** | Chooses a paradigm using user override, hard rules, task context, budget, and configurable cost/quality/time weights. |
| **Parallel Verification** | Stage 3 fans out across hypotheses, engines, scraping, and negative searches before evidence is merged. |
| **Prompt Compatibility** | The original contracts and stage prompts remain the specification layer; quality rules are not rewritten for each algorithm. |

## Algorithm Hot-Swapping

Set one value in `config.yaml`:

```yaml
paradigm: tot   # auto | cot | tot | react | dac
```

| Algorithm | Execution topology | Best fit |
|-----------|--------------------|----------|
| **CoT** (Chain of Thought) | Linear stage chain; cheapest and fastest | Small, well-scoped tasks |
| **ToT** (Tree of Thought) | Multi-path tree expansion, parallel branches, pruning, and bounded backtracking | Exploration and competing solution paths |
| **ReAct** | Reasoning ↔ action alternation with bounded observation loops | Tool-intensive tasks |
| **DAC** | DIVERGE → ATTEND → CONVERGE → FALSIFIER → bounded ITERATE | Default high-rigor framing and decision work |

Changing `paradigm` changes the execution topology, not the stage contracts or P0 gates. ToT cannot skip Stage 3 verification, Stage 5.5, or Stage 6.

## Tool Hot-Swapping

Stages request capabilities rather than naming a concrete MCP server:

```yaml
tools:
  reasoning-logger: sequential-thinking
  search: unified-fetch
  scrape: unified-fetch
```

To use another provider, register an adapter and change only the capability binding:

```yaml
tools:
  reasoning-logger: my-reasoning-mcp
  search: my-search-mcp
  scrape: my-search-mcp
```

`modelcontextprotocol/servers` is a collection of servers, not one drop-in tool. Select a specific server and provide an adapter implementing the required capability (`ReasoningLogger`, `SearchEngine`, or `Scraper`). The kernel and Markdown prompts do not change. Local `dsh-log` and linear fallback adapters can be used when no reasoning MCP is available.

## Smart Routing

Use `paradigm: auto` to let the Router choose. Routing priority is:

```text
user override → hard rules → task/domain/scale → cost/quality/time weights → default
```

Example policy:

```yaml
router:
  weights: { cost: 0.4, quality: 0.3, time: 0.3 }
  hard_rules:
    - condition: "scale=small"
      paradigm: cot
    - condition: "risk=high AND domain=investment"
      paradigm: dac
  soft_rules:
    - task: tool-intensive
      paradigm: react
    - task: exploration
      paradigm: tot
```

Raise `weights.cost` when economy is the priority. A remaining budget can trigger the configured `downgrade_to` fallback. Router decisions never disable fixed P0 gates.

## Architecture (5 Layers)

```
L1: Kernel (fixed, ~2600 lines)
  ├─ P0 gates: S5.5 anti-hallucination + S6 conclusion gates
  ├─ C2 route table: failure_route + revision bounds
  ├─ Stage 3 checklist: entity triple check, negative search, T1-T5, domain paths
  └─ Precision scoring: 4 deduction rules

L2: Router (hot-swappable)
  ├─ Cost-weighted algorithm selection (economy > quality = adjust cost weight)
  ├─ Hard rules: scale=small→CoT, risk=high+investment→DAC
  └─ Soft rules: tool-intensive→ReAct, exploration→ToT

L3: Algorithm Plugins (hot-swappable, ~50 lines each)
  ├─ CoT: Linear chain (cheapest, fastest)
  ├─ ToT: Tree exploration (multi-path parallel + backtracking)
  ├─ ReAct: Reasoning↔Action alternation
  └─ DAC: DIVERGE→ATTEND→CONVERGE (strictest quality)

L4: Tool Plugins (MCP unified, hot-swappable, ~30 lines each)
  ├─ sequential-thinking MCP (or swap to dsh-log internal logger)
  └─ unified-fetch MCP (search + scrape, or swap to any MCP server)

L5: Prompts (original .md, zero migration cost)
  └─ 8 contracts + 8 stages + 5 modes + quality + output-spec
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Configuration

All hotswap switches in `config.yaml`:

```yaml
# Switch algorithm
paradigm: auto          # auto | cot | tot | react | dac

# Switch tools (MCP hotswap)
tools:
  reasoning-logger: sequential-thinking   # or dsh-log
  search: unified-fetch                   # or any MCP server
  scrape: unified-fetch

# Economy > Algorithm: adjust cost weight
router:
  weights:
    cost: 0.4            # higher = economy first
    quality: 0.3
    time: 0.3
```

## What You Maintain (Only 2 Things)

| Action | What to Write | Config Change |
|--------|--------------|---------------|
| Add algorithm | `plugins/algorithms/my-algo.ts` (~50 lines) | `paradigm: my-algo` |
| Add MCP tool | `plugins/tools/my-tool.ts` (~30 lines adapter) | `search: my-tool` |

**Kernel never changes. P0 gates never change. Prompts never change.**

## Performance

| Item | Expected | Mechanism |
|------|----------|-----------|
| Stage 3 verification (60-80% of e2e) | 3-4x | subagent fan-out |
| Small questions | 30-50% token saved | Router auto-selects CoT |
| **e2e total** | **2-4x** | Phase 1 delivery |
| Future: pipeline + cache | Toward 10x | Phase 2+ |

## Project Structure

```
claude-reasoning/
├── config.yaml                        # All hotswap switches
├── src/kernel/                        # Kernel (fixed, never changes)
│   ├── types.ts, gates.ts, executor.ts, precision.ts, s3-parallel.ts
│   ├── adapters.ts, config-loader.ts
├── plugins/
│   ├── algorithms/                    # Algorithm plugins
│   │   ├── cot.ts, tot.ts, react.ts, dac.ts
│   ├── tools/                         # MCP tool plugins
│   │   ├── seq-thinking.ts, unified-fetch.ts, dsh-log.ts
│   └── routers/
│       └── default.ts                 # Smart router
├── prompts/                           # Original .md (zero migration)
│   ├── contracts/ (8), stages/ (8), modes/ (5), quality/
├── test/                              # 7 test files, 96 tests
└── package.json
```

## License

MIT