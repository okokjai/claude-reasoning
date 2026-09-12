# Changelog

All notable changes to `claude-reasoning` (`cr-reasoning`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
