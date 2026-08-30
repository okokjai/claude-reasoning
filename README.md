# 🧠 Claude-Reasoning v2.0.4

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/okokjai/claude-reasoning?style=flat&logo=github)](https://github.com/okokjai/claude-reasoning)
[![GitHub Release](https://img.shields.io/github/v/release/okokjai/claude-reasoning?style=flat&logo=github)](https://github.com/okokjai/claude-reasoning/releases)
[![Platform: Claude Code](https://img.shields.io/badge/Platform-Claude%20Code-8A2BE2?style=flat&logo=anthropic)](https://claude.ai/code)
[![Tests: 140/140](https://img.shields.io/badge/tests-140%2F140-passing-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue)]()
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)]()

**Graph-based reasoning pipeline for Claude Code — a Markdown skill layer that drives real reasoning, plus a TypeScript DAG runtime (`cr-reasoning`) that enforces structure and P0 gates. Hot-swappable algorithms and MCP tools, smart router, zero Python in this repo.**

```
A1 → A0 → A2 → C0 → Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 5.5 → Stage 6 → Quality
classify · route · strategy · capture · brainstorm · decompose · hypothesize · verify · synthesize · critique · gate · conclude
```

> **What this is (and is not).** Not a LangGraph orchestrator, not a free-form brainstorm. It's a **forward DAG-shaped pipeline + bounded conditional control-flow**: contracts classify and plan, bounded stages execute, and two **program-enforced P0 gates** (S5.5 anti-hallucination, S6 conclusion) block weak answers. `sequential-thinking` (when configured) is a **node logger** for branching/backtracking visualization; Stage 3 is the only stage that calls the real search/scrape tool (`unified-fetch`).

---

## ✨ Features

| Capability | Description |
|---|---|
| 🧠 **Dual layer** | Claude Code skill (Markdown contracts/stages/modes, model-driven) + TypeScript runtime (DAG engine, gates, tests) sharing the same semantics |
| 🔄 **Algorithm hotswap** | CoT / ToT / ReAct / DAC swapped via one line in `config.yaml` — no code change |
| 🔧 **Tool hotswap** | Search/scrape/reasoning-logger bound to any MCP server in `config.yaml` |
| 🧭 **Smart Router** | Cost-weighted auto-selection + hard rules + budget downgrade; `user_specified > config.paradigm > Router` |
| 🛡️ **P0 gates enforced** | S5.5 + S6 are code-checked for presence and reachability — a plugin cannot bypass them |
| 🚫 **Anti-hallucination** | Entity triple-check (map + registry + reviews), fabricated-citation zero tolerance, concealed-contradiction zero tolerance |
| 🧪 **140/140 tests** | e2e, graph traversal, gates, router, tools, MCP stdio client, CLI |
| 📦 **Zero config run** | Default `config.yaml`; no API keys; graceful fallback when MCP servers are unavailable |

---

## 🚀 Install

### As a Claude Code skill

Clone or link the repository into your Claude Code skills directory. `pnpm install` is **not** a substitute for installing the skill — the skill entry point is `SKILL.md`. The skill reads paths relative to the skill root (`contracts/`, `stages/`, `modes/`, `quality/`, `architecture.md`, `mcp-toolchain.md`, `output-spec.md`, `memory-integration.md`).

```bash
git clone https://github.com/okokjai/claude-reasoning.git
# link or copy into your Claude Code skills directory, then:
/skill claude-reasoning <question description>
```

### As a TypeScript CLI

```bash
pnpm install
pnpm build
pnpm cli --question "Compare two options" --mode full --json
```

- `--mode full` — runs the pipeline; exits with status `1` when a P0 gate fails, `2` on error, `0` on pass.
- `--mode skeleton` — validates the config and DAG reachability only (an invalid `paradigm` or unreachable P0 gate is rejected loudly).
- `--config <path>` — loads an explicit YAML config; otherwise `config.yaml` is read from the current working directory.

### MCP servers

The runtime launches MCP servers as configured child processes (JSON-RPC 2.0 over stdio).

```json
{
  "mcpServers": {
    "unified-fetch": {
      "command": "python3",
      "args": ["C:/Users/PaulPaul/.claude/unified-fetch/unified-fetch-server.py"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

> The checked-in `unified-fetch` command points to a machine-specific path; on other machines override `mcp_servers.unified-fetch` in an external config. The optional reasoning logger can also be swapped for the built-in `dsh-log` (no server needed).

---

## ✅ Verified Results (2026-08-30)

| Verification | Result | Evidence |
|---|---|---|
| Functional tests | **140/140 (11 files)** | e2e, graph traversal, gates, router, tools, MCP stdio, CLI |
| `config.paradigm` hotswap (v2.0.3) | **5 e2e cases pass** | config selects ToT/DAC; `auto` defers to Router; `user_specified` overrides; empty value falls through to Router |
| P0 gate enforcement | **S5.5 → S6 edge asserted** | e2e fails if graph bypasses or misses a gate; invalid paradigms rejected loudly |
| Build + typecheck | `tsc` exit 0 | `pnpm build` / `pnpm typecheck` |
| Repo consistency | **sync-check all pass** | memory index integrity, contract semantics, README alignment, release/tag status |

---

## 🔧 Pipeline: contracts, stages, modes

| Node | File | Tool |
|---|---|---|
| Contracts A1–A4 | `contracts/A1.md` … `A4.md` | None (classification, claims, source tiers) |
| Contracts C0/C1/C2 | `contracts/C0.md`, `C1.md`, `C2.md` | None (context, skip strategy, transfer edges) |
| Stage 0: Mini Brainstorming | `stages/stage-0-mini-brainstorming.md` | `sequentialthinking` + linear fallback |
| Stage 1: Decomposition | `stages/stage-1-decomposition.md` | `sequentialthinking` |
| Stage 2: Hypothesis | `stages/stage-2-hypothesis.md` | `sequentialthinking` |
| Stage 3: Verification | `stages/stage-3-verification.md` | `unified-fetch` (search + scrape) |
| Stage 4: Synthesis | `stages/stage-4-synthesis.md` | None (pure reasoning) |
| Stage 5: Critique | `stages/stage-5-critique.md` | `sequentialthinking`; includes Problem Reframing Check |
| Stage 5.5: Anti-Hallucination | `stages/stage-5.5-hallucination-harness.md` | None (**P0 gate**, 3 checks) |
| Stage 6: Conclusion | `stages/stage-6-conclusion.md` | None (**P0 gate** + Conclusion Card) |
| Quality Self-Assessment | `quality/self-assessment.md` | Scoring → Memory |

**Contract handoff** is defined by `contracts/C2.md`: every edge names its mandatory transfer fields (`claim_registry`, `evidence_matrix`, `source_quality_matrix`, `hallucination_pass`, …), and the C2 route table (`types.ts`) maps each `failure_class` to a bounded rerun target (`framing_defect → Stage 0 ×1`, `hypothesis_defect → Stage 2 ×3`, `evidence_defect → Stage 3`, `conclusion_defect → Stage 5 ×3`, `post_gate_decomp → Stage 1 ×1`).

---

## 🧩 Plugins & Hotswap

Three plugin areas, all hot-swappable at runtime — no process restart:

```text
plugins/algorithms/   # reasoning graph strategies: cot, tot, react, dac
plugins/tools/        # MCP and local tool adapters
plugins/routers/      # algorithm selection rules
```

### Algorithms — `AlgorithmPlugin { build_graph(stages) + cost_model }`

| Algorithm | Graph shape | base / time / quality | Use for |
|---|---|---|---|
| **CoT** | Linear chain, no backtrack, no parallel | 5k / 1.0 / 1.0 | Cheapest; small questions |
| **ToT** | S1→S2→S3 multi-path parallel expansion + S3↔S2 backtrack (≤2) | 15k / 3.0 / 1.8 | Exploration, option comparison |
| **ReAct** | S2↔S3 reason↔act alternation (≤5), then converge to S4 | 10k / 2.5 / 1.3 | Tool-intensive, debugging |
| **DAC** | Bounded Stage 0 brainstorm + S5 critique reroutes (S0/S2/S3) | 8k / 1.5 / 2.0 | Highest quality; high-risk decisions |

**Selection priority** (v2.0.3 enforced):

```text
user_specified  >  config.paradigm (non-empty, ≠ "auto")  >  Router
Router:  hard_rules (scale=small→CoT, risk=high+investment→DAC)
       → budget < 10k → downgrade to CoT
       → weighted score (cost×0.4 + quality×0.3 + time×0.3 + soft-rule bonus)
```

### Tools — MCP adapters

| Plugin | Capabilities | Server |
|---|---|---|
| `unified-fetch` | `search`, `scrape`, `status` | External Python MCP server (machine-specific path) |
| `seq-thinking` | `reasoning-logger` | `npx @modelcontextprotocol/server-sequential-thinking` |
| `dsh-log` | `reasoning-logger` | Built-in, no server |

### What you maintain (only 2 things)

| Action | What to Write | Config Change |
|---|---|---|
| Add algorithm | `plugins/algorithms/my-algo.ts` (~50 lines: `build_graph` + `cost_model`) | `paradigm: my-algo` |
| Add MCP tool | `plugins/tools/my-tool.ts` (~30-line adapter) | `tools.search: my-tool` + `mcp_servers.my-tool` |

**Kernel never changes. P0 gates never change. Prompts never change.** A plugin graph must reach both gates; the kernel refuses graphs that don't.

---

## 🛡️ P0 Gates (cannot bypass)

Verified in code (`src/kernel/gates.ts`, `executor.ts`): preflight reachability check + post-execution assertion that `S5.5` and `S6` actually ran.

**S5.5 — Anti-Hallucination (3 checks)**
1. **Entity existence** — every entity needs ≥1 independent source; recommended entities need map + business registry + independent reviews.
2. **Source verification** — fabricated citations: **zero tolerance**; source misuse: **zero tolerance**; Tier T3 data must be annotated.
3. **Cross-reference** — concealed contradictions: **zero tolerance**; single-source/isolated judgments may pass only with annotation.

On failure, `failure_route` sends the run back: `stage-3` for entity/source/evidence defects, `stage-5` for conclusion wording/precision/annotation defects.

**S6 — Conclusion (4 gates)**
1. Evidence sufficiency `≥ 3` (else redo)
2. Hallucination gate passed (S5.5)
3. Output compliance (Desktop Mode forbids specific names/prices/addresses)
4. Confidence within cap (evidence ≤ 3 → cap at `medium`)

Every conclusion point carries an evidence level: `[Confirmed]` / `[Partially Confirmed]` / `[Speculative]` / `[Unknown]` / `[Contested]` (derived from A3 claim type + A4 source tier).

---

## 📐 Contracts

### Claim types (A3) — registered before any search (P0)

| Type | Meaning | Verification threshold |
|---|---|---|
| A | Objective fact | ≥2 independent sources (≥1 T1/T2) or ≥2 consistent T3/T4/T5 marked `not independently verified`; single-source or all-T3 = verification failed |
| B | Quality assessment | ≥1 independent media + ≥3 consumer reviews |
| C | Channel relationship | ≥2 different search paths find the relationship |
| D | Promotional/quote | Mark source + time; must confirm with store/official |
| E | Speculation/inference | Clearly marked `speculative`, never cited as fact |

### Source tiers (A4)

| Tier | Weight | Type | Examples |
|---|---|---|---|
| T1 | 100% | Independent media / official | Investigative reporting, government records, business registry |
| T2 | 70% | Consumer media / review platform | TripAdvisor, Yelp, Google Reviews, Reddit |
| T3 | 30% | KOL / paid promotion | Sponsored posts, SEO marketing articles |
| T4 | 50% | Community discussion / forum | Reddit, Quora, Facebook groups |
| T5 | 20% | Merchant self-claim | Store's own page, in-store price list |

### Domain verification paths (A2)

| Domain | 4 Search Paths | Negative Search |
|---|---|---|
| investment | price · financials · news/risk · analyst rating | `asset+scam+controversy` |
| finance | rates/fees · comparison/review · institution complaints · terms | `product+pitfalls+risk` |
| career | role+city+salary · skills+requirements · company+layoffs · trends | `role+drawbacks+risk` |
| learning | course+rating · price+comparison · learning path · platform reviews | `course+drawbacks+scam` |
| relationship | advice+methods · effect+reviews · book+resources · expert opinion | `method+side effects+risk` |
| tech | version+comparison · ecosystem+toolchain · benchmark · learning cost | `technology+limitations+drawbacks` |
| daily | product+city+price · store+brand+rating · distributor+city · product line | `product+pitfalls+bad reviews` |
| general | latest+news · analysis+opinion · controversy+criticism · alternatives | `topic+drawbacks+risk` |

---

## 💡 Usage Patterns

### As a skill

```
/skill claude-reasoning analyze Bitcoin market conditions for H2 2026
/skill claude-reasoning recommend a hotel near downtown Austin under $120
/skill claude-reasoning diagnostic production server crashed at 3am
/skill claude-reasoning optimization reduce cloud costs without changing architecture
```

### As a CLI

```bash
pnpm cli --question "Best lens brand for high index prescription?" --mode full --json
pnpm cli --question "Compare cloud providers for a startup" --mode skeleton --config ./my-config.yaml
```

### Reasoning modes (auto-routed by `contracts/A0.md`, 10 priority rules)

| Mode | Core Mechanism | Use For |
|---|---|---|
| Diagnostic | Symptoms → candidate causes → elimination → minimal intervention | Bug fixes, system failures |
| Design | Requirements → constraints → solution space → Pareto frontier | Architecture, API design |
| Decision | Options × criteria → weighted scoring → sensitivity analysis | Tech/vendor selection |
| Optimization | Current state → gradient → step size → convergence | Performance/cost tuning |
| Innovation | Break assumptions → recombine → new combinations | Bottlenecks, new features |

### Config hotswap switches

```yaml
paradigm: auto          # auto | cot | tot | react | dac
tools:
  reasoning-logger: sequential-thinking   # or dsh-log (built-in)
  search: unified-fetch                   # or any MCP server
  scrape: unified-fetch
router:
  weights: { cost: 0.4, quality: 0.3, time: 0.3 }   # economy > algorithm = raise cost
```

---

## ⚠️ Known Limits (Honest Limits)

### Verified boundaries

| Item | Behavior |
|---|---|
| Stage 3 (verification) | Only stage that calls real tools (`unified-fetch`); multi-engine search + scrape with graceful fallback |
| `can_branch=false` | Linear mode: same stages, same node labels, same schemas — sequential-thinking calls recorded as text, **no stage skipped** |
| `can_branch=true` | Stage 0 emits bounded packet: `candidate_frame_count` 0–4, `selected_frame_count` 0–2, `no_new_angle` requires `iteration_count=0` |
| Desktop Mode (no unified-fetch) | Evidence cap 3/5, quality cap 24/30, conclusion forbids specific names/prices/addresses |
| Budget exhaustion | Router downgrades to CoT below 10k tokens |

### Known gaps

| Item | Status |
|---|---|
| TypeScript stage handlers for S0/S1/S2/S4/S5 | **Structural stubs** — they produce schema-shaped packets for graph/gate/CLI testing. Full-depth reasoning lives in the Skill layer (model reads the stage markdown). The TS layer's value is structure, gates, and regression tests |
| `prompts/` tree | Compatibility mirror of `contracts/`/`stages/`/`modes/`/`quality/`. Do **not** edit one mirrored copy alone — run `scripts/sync-check.sh` |
| unified-fetch upstream | DataDome/Akamai/interactive Turnstile may block; login walls not bypassed (see unified-fetch README) |
| `package.json` version | Tracks the CLI package (`2.0.x`); the skill release version lives in `SKILL.md` + `CHANGELOG.md` (v2.0.3) |

---

## 🚫 Gotchas

- **`pnpm install` does not install the skill.** The Claude Code skill is the repo rooted at `SKILL.md`; link/copy it into your skills dir.
- **`sequential-thinking` runs via `npx`** and needs network on first use. Unavailable → `can_branch=false` linear mode; Stage 0 remains mandatory.
- **Edit docs → run `bash scripts/sync-check.sh`.** Step 7 validates this README itself (terminology, packages, packet invariants); the script exits 1 on any FAIL.
- **Do not edit a single `prompts/` mirror** without running the consistency checks afterwards.
- **CLI exit codes are CI-friendly**: `0` pass, `1` P0 gate failure (full mode), `2` error.
- **Memory writes** go to `${CLAUDE_MEMORY_DIR}` — resolved by `scripts/resolve-memory-dir.py` (settings.json env → env var → default).

---

## 📦 Project Structure

```
claude-reasoning/
├── SKILL.md                       # Claude Code skill entry (router)
├── config.yaml                    # all hotswap switches
├── contracts/                     # A1–A4, C0–C2 (classification, routing, claims, tiers, transfer)
├── stages/                        # Stage 0 – Stage 6 (+5.5)
├── modes/                         # 5 reasoning modes
├── quality/                       # self-assessment (/50 full, /36 simplified)
├── architecture.md                # DAG diagram, stage rules, backtracking mechanism
├── mcp-toolchain.md               # tool mapping + execution enforcement hooks
├── output-spec.md                 # conclusion card + evidence language calibration
├── memory-integration.md          # memory write paths + cross-topic cache table
├── src/                           # TypeScript kernel (fixed by design)
│   ├── cli.ts                     # cr-reasoning CLI
│   └── kernel/                    # types, gates, executor, precision, s3-parallel,
│                                 #   adapters, config-loader, mcp-stdio-client
├── plugins/                       # hot-swappable
│   ├── algorithms/                # cot.ts · tot.ts · react.ts · dac.ts · index.ts
│   ├── tools/                     # seq-thinking.ts · unified-fetch.ts · dsh-log.ts · index.ts
│   └── routers/default.ts         # smart router
├── prompts/                       # compatibility mirror of contracts/stages/modes/quality
├── scripts/                       # sync-check.sh · resolve-memory-dir.py · memory-cleanup.sh
│                                 #   · contract-gen.py · gate-check.py/.sh · trail-log.sh
├── test/                          # 140 tests across 11 files
├── docs/                          # release-manifest.md · plans/
├── CHANGELOG.md
└── package.json
```

---

## 🔗 Related

- Search/scrape engine: [unified-fetch](https://github.com/okokjai/unified-fetch) — multi-engine search + CDP stealth browser MCP
- Full DAG + stage rules: [`architecture.md`](architecture.md)
- Tool mapping + execution enforcement: [`mcp-toolchain.md`](mcp-toolchain.md)
- File-role inventory: [`docs/release-manifest.md`](docs/release-manifest.md)
- Version history: [`CHANGELOG.md`](CHANGELOG.md)

---

## 📄 License

MIT

---

*Last updated: 2026-08-30*
*Author: PaulPaul + Claude Code*
*License: MIT · Platform: Claude Code · Zero Python in repo · TypeScript runtime*