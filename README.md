<div align="center">

# 🧠 Claude-Reasoning v2.0

**Plugin-Based Parallel DAG — Algorithm Hotswap, Smart Router, MCP Unified Toolchain**

[![Test Status](https://img.shields.io/badge/tests-96%2F96-passing-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue)]()
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

</div>

---

## What This Is

Claude-Reasoning v2.0 is a **structured reasoning pipeline** with plugin-based architecture. It chains problem classification → framing → decomposition → hypothesis → verification → synthesis → critique → hallucination gate → conclusion, with **hot-swappable algorithms and tools**.

**Inspired by DeepSeek Harness "Everything is a Plugin" philosophy**, but implemented as a lightweight TypeScript harness (~2600 lines kernel) — no heavy runtime dependency.

## What Makes It Different

| Dimension | v1.2.0 (Markdown) | v2.0 (TypeScript) |
|-----------|-------------------|-------------------|
| **Algorithm** | Fixed DAC | **Hotswap**: CoT / ToT / ReAct / DAC |
| **Tools** | Fixed tool integration | **Configurable MCP**: swap server commands in config |
| **Router** | Manual | **Smart Router**: cost-weighted auto-selection |
| **P0 Gates** | Model self-discipline | **TS-enforced**: S5.5 + S6, cannot bypass |
| **Stage 3** | Serial | **Parallel**: subagent fan-out |
| **Execution** | Hook-enforced | **Program-enforced**: orchestrator controls flow |

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
pnpm install
pnpm build
pnpm cli --question "Compare two options" --mode full --json
```

The CLI accepts `--config <path>` to load an explicit YAML configuration. Full mode exits with status 1 when a P0 gate fails; skeleton mode only validates graph reachability. MCP server commands are launched as configured child processes. The checked-in default `unified-fetch` command points to `C:/Users/PaulPaul/Projects/unified-fetch/unified-fetch-server.py`, which is machine-specific; override `mcp_servers.unified-fetch` in an external config on other machines.

```bash
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
cr-reasoning-v2/
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