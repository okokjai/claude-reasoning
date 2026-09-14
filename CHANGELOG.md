# Changelog

All notable changes to `claude-reasoning` (`cr-reasoning`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.3] - 2026-09-15

Prompt-to-schema alignment: C0 contract (`prompts/contracts/C0.md`) instructs the model to emit `clarification_needed` as a question list, while the schema previously required a strict boolean — causing every real-model run to fail validation, trigger `fallbackValue: { clarification_needed: true }`, and halt at C0 via `interrupt()`.

### Fixed
- **C0 `clarification_needed` schema union (`src/kernel/executor.ts`)**: `outSchema.clarification_needed` now accepts `z.union([z.boolean(), z.array(z.string()).transform(a => a.length > 0)])`. A non-empty list of questions maps to `true` (triggering HITL clarification routing), an empty list maps to `false` (proceeding to Stage 0), and raw boolean values remain fully supported. Byte-for-byte SHA-256 prompt immutability is preserved.

### Documentation
- **MCP timeout guideline (`README.md`)**: documented that a full reasoning run traverses 8–10 LLM stages plus retrieval, typically requiring 60–120+ seconds, which exceeds the default 60s timeout of strict MCP clients. Clients must configure a minimum 180s request timeout.

### Added
- `test/integration/c0-array-contract.test.ts` — 2 tests verifying that array-shaped `clarification_needed` correctly triggers HITL pause when non-empty and continues to Stage 0 when empty.

### Breaking Changes
None.

## [2.2.2] - 2026-09-15

Empty LLM replies now fail loud at the transport boundary instead of surfacing as a cryptic `strictParse failed: SyntaxError: Unexpected end of JSON input` two layers up (observed in a v2.0.0-era run: an Anthropic thinking-model completion returned an empty `text` block and the C0 stage burned its repair retry on garbage).

### Fixed
- **Empty-reply fail loud (`src/adapters/http-invoker.ts` `extractReply`)**: an empty or whitespace-only reply (missing `choices`, empty `text` block, truncated completion) previously returned `""` silently. It now throws `SchemaViolationError` immediately, so the existing node-factory single repair retry handles it and the failure message names the transport, not the parser. Replies whose `content[]` starts with non-text blocks (e.g. `type:"thinking"`) now resolve to the first `text` block instead of `""`.
- **Forced JSON output (`src/adapters/http-invoker.ts` `buildRequest`)**: OpenAI-protocol requests now send `response_format: { type: "json_object" }` by default; the existing 400-retry path drops it for endpoints that reject the parameter. Response shapes are validated via Zod schemas (`AnthropicReply` / `OpenAIReply`) instead of inline casts.

### Added
- `test/unit/http-invoker-protocol.test.ts` — 5 new assertions: first-text-block extraction past thinking blocks, and empty-reply throw on empty `text` block / missing `choices` / whitespace-only content; plus the `json_object` default pin. The prior `returns empty string on unknown shape` expectation (which pinned the bug) is replaced by the fail-loud contract.

### Investigation notes (no code change)
- **Repair-retry context (`src/kernel/node-factory.ts`)**: `raw-llm.log` (v2.0.0-era, 2026-09-12) suggested the repair turn dropped the original `[STAGE:c0]` user message. The log writer records only the *last* user message per call; at current HEAD the repair `invoke` includes the full original messages. Log observation, not a bug.
- **"CLI hang" without env vars**: `resolveInvoker` correctly resolves credentials from `~/.claude/claude-reasoning/config.yaml` and the CLI legitimately blocks on real LLM generation; an interrupted foreground run (kill after N seconds) is expected behavior, not a hang. With-env control (`http://127.0.0.1:1`) fails fast with `fetch failed` as designed.

### Breaking Changes
None. (`extractReply` was silently returning `""`; the new throw is strictly a contract tightening at a previously undefined boundary.)

## [2.2.1] - 2026-09-14

Engine-mode MCP unblocked: `tools/list` was broadcasting an empty `inputSchema` (so clients sent `{}` and got `-32602 Required at question`), and the CLI 401'd whenever `npx claude-reasoning` ran from a cwd without a local `config.yaml`.

### Fixed
- **MCP `inputSchema` broadcast (`src/mcp.ts`)**: `unwrapArgs` returned `z.preprocess(...)` (a `ZodEffects`), which `McpServer`'s `normalizeObjectSchema()` cannot introspect. `tools/list` therefore fell back to `EMPTY_OBJECT_JSON_SCHEMA` — `properties:{}` — while the runtime still required `question`. Every real call from a strict client failed with `-32602`. `unwrapArgs` now returns a `ZodObject` whose `parse`/`parseAsync`/`safeParse`/`safeParseAsync`/`spa` are overridden on the instance to unwrap `{arguments:{...}}` before delegating to the prototype. `_def.typeName === "ZodObject"` and `.shape` are preserved, so the advertised schema is correct and the double-wrap tolerance is retained.
- **CLI 401 from non-repo cwd (`src/adapters/invoker-resolver.ts`)**: the implicit config default was `./config.yaml` only; from any other directory `apiKey` resolved to `undefined` and the remote endpoint rejected with `HttpInvoker: 401 Unauthorized`. The implicit lookup now per-field merges `./config.yaml` over `~/.claude/claude-reasoning/config.yaml`, and treats empty strings (`""`) as unset at both file AND env layer — so a repo-shipped placeholder (`baseUrl: ""`) or a stray `CR_REASONING_API_KEY=` no longer shadows real credentials. Explicit `--config` / `CR_REASONING_CONFIG` still fails loud on a missing path (no silent fallback).

### Added
- `test/unit/mcp-schema-broadcast.test.ts` — pins `tools/list` to expose `question`/`mode`/`threadId`/`input` properties AND keeps the `{arguments:{...}}` double-wrap tolerance.
- `test/unit/invoker-resolver-fallback.test.ts` — pins the user-level config fallback, the cwd-wins ordering, the explicit-path-fails-loud contract, AND the empty-string-as-unset behavior at both file and env layers.
- `test/unit/dist-freshness.test.ts` — new assertion: `dist/mcp.js` must not regress to `z.preprocess` inside `unwrapArgs`.

### Doc-sync Phase 4 alignment (post-release audit)
- `src/mcp.ts` `McpServer` version `2.2.0` → `2.2.1` (was hardcoded).
- `src/cli.ts` `--help` banner `v2.0.0` → `v2.2.1`.
- `README.md` prose: 5 stale `v2.0.0` → `v2.2.1`; v1.2.0 comparison row kept.
- `README.md` §Configuration now documents the new resolution semantics: empty-as-unset, the 3-step `config.yaml` lookup order, and per-field merge.
- `config.yaml` ships as pure placeholder so the fallback chain resolves cleanly inside the repo.

### Breaking Changes
None.

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
