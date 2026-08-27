<div align="center">

# 🧠 Claude-Reasoning v2.0.1

**Plugin-Based Parallel DAG — Algorithm Hotswap, Smart Router, MCP Unified Toolchain**

[![Test Status](https://img.shields.io/badge/tests-135%2F135-passing-green)]()
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

L5: Prompt resources (canonical skill paths + compatibility bundle)
  ├─ Root contracts/stages/modes/quality: current Claude Code skill paths
  └─ prompts/: retained compatibility/prompt bundle; architecture and MCP references preserve runtime details
```

## Install as a Claude Code Skill

The Claude Code integration uses the repository's `SKILL.md` entry point and its root-level prompt resources. Install or link the repository according to your Claude Code skill workflow; `pnpm install` is not a substitute for installing the skill.

The skill reads these paths relative to the skill root:

```text
SKILL.md
contracts/
stages/
modes/
quality/
architecture.md
mcp-toolchain.md
output-spec.md
memory-integration.md
```

The `prompts/` tree is retained as a compatibility/prompt bundle. It is not a replacement for the root paths currently referenced by `SKILL.md` and `scripts/sync-check.sh`. Do not edit only one mirrored copy without running the repository consistency checks.

## Run the TypeScript Runtime / CLI

```bash
pnpm install
pnpm build
pnpm cli --question "Compare two options" --mode full --json
```

The CLI accepts `--config <path>` to load an explicit YAML configuration. Full mode exits with status 1 when a P0 gate fails; skeleton mode only validates graph reachability. MCP server commands are launched as configured child processes. The checked-in default `unified-fetch` command points to `C:/Users/PaulPaul/Projects/unified-fetch/unified-fetch-server.py`, which is machine-specific; override `mcp_servers.unified-fetch` in an external config on other machines. The optional reasoning logger uses the `@modelcontextprotocol/server-sequential-thinking` package when configured.

Runtime strategy records `can_branch=true|false`; `can_branch=false` uses linear mode without skipping mandatory stages. Stage 0 emits bounded packet invariants: `candidate_frame_count` is 0–4, `selected_frame_count` is 0–2, and `no_new_angle=true` implies `iteration_count=0`. The claim lifecycle runs from Stage 2 `claim_registry` through Stage 3 verification and Stage 5/5.5 gates; bounded `failure_route` values control evidence or critique reroutes.

## Configure MCP

The runtime reads the YAML file supplied with `--config`, or `config.yaml` from the current working directory when no path is supplied. Configure `mcp_servers` with the command and arguments for the MCP servers available on the host. The repository does not silently install or relocate those external servers.

## Development and Tests

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck
```

See [`docs/release-manifest.md`](docs/release-manifest.md) for the role of each source, skill, compatibility, test, and development path.

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

## Add a Plugin

V2 supports three plugin areas:

```text
plugins/algorithms/  # reasoning graph strategies: cot, tot, react, dac
plugins/tools/       # MCP and local tool adapters
plugins/routers/     # algorithm selection rules
```

### Algorithm plugin

1. Create an `AlgorithmPlugin` implementation in `plugins/algorithms/`.
2. Register its ID in `plugins/algorithms/index.ts`.
3. Ensure its graph reaches both mandatory P0 gates: `S5.5` and `S6`.
4. Select it in `config.yaml`:

```yaml
paradigm: my-algorithm
```

The graph remains subject to conditional-edge and loop bounds; a plugin cannot bypass the kernel gates.

### MCP tool plugin

1. Create a tool adapter in `plugins/tools/` implementing the required capability (`reasoning-logger`, `search`, or `scrape`).
2. Register or bind its ID in `plugins/tools/index.ts`.
3. Configure the capability and its MCP stdio server:

```yaml
tools:
  search: my-fetch
  scrape: my-fetch

mcp_servers:
  my-fetch:
    command: node
    args: ["/absolute/path/to/server.js"]
```

The server must support the MCP JSON-RPC lifecycle used by the runtime (`initialize`, `tools/list`, and `tools/call`). Stage 3 only promotes real, verifiable HTTP(S) sources to evidence; unavailable or synthetic results remain `Insufficient` and cannot bypass P0 validation.

For the complete file-role and compatibility boundaries, see [`docs/release-manifest.md`](docs/release-manifest.md).

## Performance

| Item | Expected | Mechanism |
|------|----------|-----------|
| Stage 3 verification (60-80% of e2e) | 3-4x | subagent fan-out |
| Small questions | 30-50% token saved | Router auto-selects CoT |
| **e2e total** | **2-4x** | Phase 1 delivery |
| Future: pipeline + cache | Toward 10x | Phase 2+ |

The maintenance helper `scripts/memory-cleanup.sh` is retained for memory hygiene and is not part of the runtime execution path.

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
├── prompts/                           # Compatibility/prompt bundle; do not edit one mirror alone
│   ├── contracts/ (8), stages/ (8), modes/ (5), quality/
├── contracts/, stages/, modes/, quality/ # Current Claude Code skill paths
├── scripts/                            # Claude Code integration and validation helpers
├── docs/release-manifest.md             # Release file-role inventory
├── test/                               # Runtime regression tests
└── package.json                        # Runtime/CLI package metadata
```

## License

MIT