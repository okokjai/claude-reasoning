# Changelog

All notable changes to `claude-reasoning` (`cr-reasoning`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-09-13

Stage 3 evidence integrity, protocol selection, and gate enforcement.

### Fixed
- **Stage 3 no longer fabricates evidence (`src/kernel/executor.ts`)**: `node_stage_3` synthesized `evidence_matrix` entries from `state.hypotheses`, emitting synthetic `source_anchor` values (`src-0`, …) and a hardcoded `confidence_bucket: "high"`. Because `antiHallucinationGate`'s source check validates against that same matrix, the check passed vacuously. Retrieval now runs through an injected `ToolAdapter`.
- **`confidence_bucket` is a structural proxy**: `high` is unreachable — the kernel has not read source content, so it derives `medium` at ≥2 distinct hosts and `low` otherwise, and records the limitation in `data_gap_list`.
- **Protocol mismatch (`src/adapters/http-invoker.ts`)**: the adapter always posted OpenAI-shaped bodies to `/chat/completions` while `invoker-resolver` supplied `ANTHROPIC_BASE_URL`. Protocol is now selected from the variable that supplied `baseUrl`.
- **Stage 6 gates now enforce (`src/kernel/executor.ts`)**: the unconditional edge to `node_quality` became a conditional edge routing to Stage 1 while the revision budget allows.

### Added
- `ToolAdapter` interface (`src/kernel/tool-adapter.ts`) and `ExecutorDeps.toolAdapter`.
- `CR_REASONING_TOOL_MODULE` seam (mirrors `CR_REASONING_INVOKER_MODULE`).
- `test/unit/dist-freshness.test.ts` — the build output now has an observer.

### Changed
- Specifications moved into the repository at `docs/superpowers/`, where drift is diffable.

### Removed
- `plugins/{algorithms,tools,routers}` extension architecture and `.cr-runs/*.jsonl` trail were never implemented and are now removed from the design (remediation spec §7): no consumer existed, and `step_execution_log` already covers the trail.

### Breaking Changes
None. All additions are optional and `protocol` defaults to the prior `"openai"` behaviour.

## [2.1.0] - 2026-09-13

Dual-mode execution: the skill degrades gracefully from engine mode (MCP/CLI + SQLite) to native in-session execution when no backend is reachable, and the invoker now inherits ambient provider credentials.

### Added
- **Dual-Mode Router (`SKILL.md`)**: engine mode (MCP `claude_reason`/`cr_reason`, then CLI) is preferred; on engine failure (timeout, missing backend, non-zero exit) the skill replays the same `prompts/` stage contracts in-session instead of erroring.
- **Ambient Env Inheritance (`src/adapters/invoker-resolver.ts`)**: per-field resolution order is now `CR_REASONING_*` env → generic `ANTHROPIC_*` / `OPENAI_*` env → `config.yaml`. New generic fallbacks: `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_MODEL`.

### Changed
- **`config.yaml` is now optional**: when `baseUrl` resolves from env the file is not consulted; a missing file no longer throws. Missing `baseUrl` from all sources still fails loud with a clearer error.
- **Env precedence inversion**: env vars now beat `config.yaml` field values (previously `baseUrl` in config won over `CR_REASONING_BASE_URL`). Explicit env configuration always wins.

## [2.0.0] - 2026-09-12

Major architectural upgrade migrating from prompt-chained agent execution (`claude-reasoning-1.2.0`) to a deterministic TypeScript host backed by LangGraphJS and SQLite checkpointer persistence.

### Breaking Changes vs v1.2.0
- **Identity Unification**: package, CLI, MCP server, and repository adopted the single name `claude-reasoning`; `cr-reasoning` / `cr-reasoning-mcp` are preserved as bin and MCP-tool aliases (`cr_reason`, `cr_resume`). `SKILL.md` is demoted to a thin trigger invoking the CLI binary or MCP stdio service. Graph execution, state transitions, and verifications are strictly managed by the TypeScript runtime.
- **Strict Structured Outputs**: Stage nodes use Zod schemas for input/output parsing. Missing or invalid keys trigger a single fail-loud repair retry before failing with `SchemaViolationError`.
- **Runtime Enforced State**: State updates are managed by LangGraph channels (`GraphStateChannels`) and validated via `GraphStateSchema` at pipeline boundaries.

### Added
- **LangGraphJS Orchestrator**: Deterministic DAG execution (`START` -> `node_init` -> `node_c0` -> `node_stage_0..6` -> `node_quality` -> `END`).
- **SQLite Checkpointing**: `SqliteSaver` integration persisting every super-step, enabling idempotent crash recovery and durable pause/resume.
- **HITL Interrupt Flow**: `node_hitl_clarify` interrupts execution on ambiguity (`clarification_needed && !user_clarification`) and resumes cleanly with user input.
- **Deterministic Gates & Scoring**:
  - `antiHallucinationGate` (P0 triple check for entity corpus containment, citation anchors, and cross-reference disclosure).
  - 4 Stage 6 conclusion gates (`gate_1_evidence`, `gate_2_boundary`, `gate_3_counter_evidence`, `gate_4_confidence`).
  - Redo verdict handling in `runQualityScore`: `evidence_quality: "Insufficient"` yields `total: 0`.
- **Bounded Backtracking & Single-Writer Routing**:
  - Global backtrack counter capped at 3 (`BACKTRACK_MAX`).
  - Stage 0 framing revision counter capped at 1 (`STAGE_0_REVISIONS_MAX`).
  - Single-writer discipline: counters mutated exclusively at routing decision points (`routeCritique`, `routeGateFailure`).
  - Safe convergence to `node_quality` with `BACKTRACK_LIMIT_EXCEEDED` on budget exhaustion.
- **Dual Entry Points**:
  - CLI (`claude-reasoning run "<q>"`, `claude-reasoning resume <threadId> --input "<answer>"`; `cr-reasoning` alias).
  - MCP Stdio Server (`claude_reason`/`claude_resume`, aliased `cr_reason`/`cr_resume`).
  - Shared SQLite thread namespace allowing cross-interface resumes.
- **Passive LLM Invoker Contract**: `LlmInvoker` with strict JSON parser, native HTTP adapters (Anthropic/OpenAI compatible), and `CR_REASONING_INVOKER_MODULE` offline test seam.
- **Zero-Migration Prompts**: Bit-for-bit SHA256 preservation of all 22 prompt assets from `claude-reasoning-1.2.0`.
- **Full Test Suite**: 56 unit and integration tests across 14 test suites covering topology, HITL, crash recovery, bounded backtracking, and gate interception.
