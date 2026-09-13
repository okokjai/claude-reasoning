# claude-reasoning v2.2.0 Remediation — Stage 3 Integrity, Protocol Selection, Gate Enforcement

- **Date**: 2026-09-13
- **Status**: Draft (Awaiting User Review)
- **Base**: `C:\tmp\DONE\claude-reasoning` @ `ae2ad50` (v2.1.0)
- **Trigger**: Native-mode full run of 2026-09-13 surfaced a fabricated-evidence path in `node_stage_3`, plus protocol, build, and documentation drift.
- **Supersedes (partially)**: `C:\tmp\docs\superpowers\specs\2026-09-11-cr-reasoning-v2-design.md` §2 (directory structure), §4.3 (s3-parallel), §5 (plugin architecture)

---

## 1. Executive Summary

A native-mode end-to-end run exposed that `node_stage_3` does not perform retrieval. It fabricates an `evidence_matrix` from `state.hypotheses`, emitting synthetic `source_anchor` values (`src-0`, `src-1`, …) and a hardcoded `confidence_bucket: "high"`.

This is not a missing feature. It is a **circular self-validation**: the fabricated matrix flows into `antiHallucinationGate`, whose source check verifies that conclusions cite entries present in that same matrix. The check therefore always passes. Engine mode's conclusions are currently grounded in invented sources.

This spec covers five workstreams, ordered so that integrity is restored before the paths that depend on it.

### Non-Goals (explicitly deferred)

- Wiring a production retrieval backend (MCP client for `unified-fetch`). This spec delivers the injectable seam, a mock, and honest degradation. Backend wiring is a separate sub-project.
- `plugins/{algorithms,tools,routers}` extension architecture — **removed** from the design, not implemented (§7).
- `.cr-runs/*.jsonl` execution trail — **removed**, superseded by in-state `step_execution_log` (§7).
- Cross-encoder or LLM-based contradiction detection in Stage 3.

---

## 2. Problem Statement

### 2.1 P5 — Stage 3 fabricates evidence (critical)

`src/kernel/executor.ts:136-145`:

```typescript
const nodeStage3 = withLog("node_stage_3", (state) => ({
  evidence_matrix: state.hypotheses.map((h, i) => ({
    hypothesis: h,
    evidence_summary: `synthesized from search path ${state.search_paths_required[i % …] ?? "default"}`,
    confidence_bucket: "high" as const,
    source_anchor: `src-${i}`,
    date: new Date().toISOString().slice(0, 10),
  })),
  verification_complete: true,
}));
```

Three defects in six lines:

| Defect | Consequence |
|---|---|
| `source_anchor: \`src-${i}\`` | Synthesized URL-shaped string, not a retrievable source |
| `confidence_bucket: "high"` | Constant claim of high confidence with zero evidence read |
| `verification_complete: true` | Asserts completion without any search |

Downstream, `antiHallucinationGate` checks that conclusion citations appear in `evidence_matrix`. Since the matrix is fabricated, the check is vacuous.

### 2.2 P1 — Protocol mismatch, not just path mismatch

`src/adapters/http-invoker.ts:43` posts to `${baseUrl}/chat/completions`. `src/adapters/invoker-resolver.ts:45` falls back to `env.ANTHROPIC_BASE_URL`.

An Anthropic-protocol endpoint does not serve `/chat/completions` (returns 404). Verified: `POST http://127.0.0.1:18080/chat/completions → 404`, `POST /v1/messages → 401` (route exists).

The mismatch is **protocol-level**, not path-level: Anthropic requires `{model, max_tokens, system, messages}`, an `x-api-key`/`anthropic-version` header pair, and returns `content[0].text`. Patching only the path would produce a 400.

### 2.3 P2 — `dist/` is stale and unverified

`dist/mcp.js` contains no `unwrapArgs`; `dist/cli.js` contains no `--help`. Committed fixes at `ae2ad50` never reached the artifacts that `.pi/agent/mcp.json` actually executes.

Root cause: **no check observes `dist/`**. The test suite compiles from `src/` via `tsx`/vitest and never inspects build output.

### 2.4 P3 — Stage 6 gates detect but do not enforce

`executor.ts:202-214` calls `conclusionGates` and appends `STAGE_6_GATE_WARNING` to `residual_uncertainty` on failure. But `executor.ts:261` is `.addEdge("node_stage_6", "node_quality")` — an unconditional edge.

`prompts/stages/stage-6-conclusion.md:77` requires: *"When it requires decomposition correction, emit `gate_failure_class`, `fix_requirements`, and `revision_count` and route to Stage 1 / Decomposition through the C2 conditional edge."* The implementation annotates; the contract mandates routing.

### 2.5 P4 — Documentation drift

| Location | Claim | Reality |
|---|---|---|
| `README.md:251` | `14 passed (14 Files), 56 passed (56 Tests)` | 15 files / 58 tests |
| `README.md:15` | badge `Tests-56%2F56` | 58 |
| `2026-09-11-invariant-alignment-report.md:7` | links `...-v2-plan.md` | file is `...-v2-implementation.md` |
| `invariant-alignment-report.md` §1 | 10× "100% 對齊" | ≥4 items are 0% |
| `2026-09-11-cr-reasoning-v2-design.md` §2, §5 | `src/plugins/**`, `s3-parallel.ts`, `.cr-runs/` | none exist |

Structural cause: specifications live at `C:\tmp\docs\superpowers\`, **outside** the git repository at `C:\tmp\DONE\claude-reasoning\`. Drift cannot be detected by any repo-local check.

---

## 3. Design

### 3.1 P5 — Injectable `ToolAdapter`

New file `src/kernel/tool-adapter.ts`, deliberately mirroring the shape and injection style of `src/kernel/invoker.ts`:

```typescript
export interface ToolResult {
  url: string;
  title: string;
  snippet: string;
}

export interface ToolAdapter {
  search(query: string, maxResults?: number): Promise<ToolResult[]>;
}
```

Injected through the existing `ExecutorDeps` interface (`executor.ts:18`), at the same level as `invoker`. Production wiring uses a `CR_REASONING_TOOL_MODULE` environment seam, following the established `CR_REASONING_INVOKER_MODULE` precedent (`test/fixtures/offline-invoker.mjs`).

`node_stage_3` becomes asynchronous and:

1. Derives one query per hypothesis from `search_paths_required` (falling back to the hypothesis text).
2. Dispatches via `Promise.allSettled`, bounded at 4 concurrent calls.
3. Records a real `tool_calls` entry per dispatch: `{sequence, tool, parameters, summary, engine, duration_seconds}`.
4. Maps results into `evidence_matrix` entries.

#### Confidence bucket derivation (the central judgment)

The kernel receives `url`/`title`/`snippet`. **It has not read the source content.** The bucket is therefore a *structural proxy*, never a semantic judgment:

| Condition | `confidence_bucket` |
|---|---|
| ≥2 distinct hosts returned | `medium` |
| exactly 1 host returned | `low` |
| 0 results | `low`, and the hypothesis is added to `unverified_hypotheses` |

**The kernel never emits `high`.** `high` requires content judgment the kernel cannot make. This is the direct inversion of the current stub's behaviour.

`cross_validation.has_discrepancy_over_20pct` is **not fabricated**. Without reading content the kernel cannot assess contradiction; the field is set to `false` and the limitation is recorded in `data_gap_list` as `"cross_validation not assessable without content reading"`.

Every degraded field is listed in `data_gap_list`. The governing principle: **emit "unknown" rather than invent "high".**

#### `evidence_quality` aggregation

| Condition | Value |
|---|---|
| Every hypothesis returned 0 results | `Insufficient` |
| At least one hypothesis returned results | `Sufficient` |

`Contradictory` is **not** produced by the kernel — it requires content reading, which is out of scope.

### 3.2 P1 — Protocol selection

`HttpInvokerConfig` gains `protocol: "anthropic" | "openai"` (default `"openai"` for backward compatibility).

- `"anthropic"` → `POST ${baseUrl}/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type`. Body `{model, max_tokens: 4096, system, messages: [{role:"user", content}]}`. Response read from `content[0].text`.
- `"openai"` → existing `/chat/completions` path, unchanged, including the `responseFormat` + 400-fallback behaviour.

`invoker-resolver.ts` sets `protocol` from **which environment variable supplied the baseUrl** — an explicit signal, not URL string guessing:

| baseUrl source | protocol |
|---|---|
| `CR_REASONING_BASE_URL`, `OPENAI_BASE_URL`, `config.yaml` | `openai` |
| `ANTHROPIC_BASE_URL` | `anthropic` |

`max_tokens` is required by the Anthropic Messages API; 4096 is chosen as a fixed value because stage outputs are structured JSON payloads well under that bound.

### 3.3 P2 — Build output verification

Add `test/unit/dist-freshness.test.ts` asserting, after a build:

- `dist/mcp.js` contains `unwrapArgs`
- `dist/cli.js` contains `--help`

The test **skips with a loud message** when `dist/` is absent, so a fresh clone does not fail. It fails only when `dist/` exists and is stale. This closes the gap that allowed `ae2ad50` to land without effect.

### 3.4 P3 — Stage 6 gate enforcement

Replace `executor.ts:261`:

```typescript
.addEdge("node_stage_6", "node_quality")
```

with:

```typescript
.addConditionalEdges("node_stage_6", (state: GraphState) => {
  if (state.stage_6_gate_passed === true) return "node_quality";
  if (state.stage_6_revision_count < STAGE_6_REVISIONS_MAX) return "node_stage_1";
  return "node_quality";
})
```

Counter discipline (design §11.2.3, single-writer): `stage_6_revision_count` is incremented **only in this routing decision**, never inside a node. On the final (budget-exhausted) pass, `STAGE_6_GATE_WARNING` is appended — preserving the existing annotation behaviour as the terminal state.

`node_stage_6` gains one output field, `stage_6_gate_passed: boolean`, derived from `cGates.all_passed`. It does not touch the counter.

### 3.5 P4 — Documentation alignment, P6/P7 removal

- `README.md`: test counts 56→58, files 14→15; badge updated.
- `2026-09-11-invariant-alignment-report.md`: dead link corrected; "100% 對齊" replaced with a per-item status table distinguishing *implemented*, *deliberately not implemented*, and *misdescribed*.
- `2026-09-11-cr-reasoning-v2-design.md`: remove `src/plugins/**`, `s3-parallel.ts`, and `.cr-runs/` from §2's directory tree and §5's plugin section; record the removal rationale inline.
- `CHANGELOG.md`: new `[2.2.0]` entry.

**Spec relocation**: this document is written to `docs/superpowers/specs/` **inside the repository**, so specifications travel with the artifact and become diffable.

---

## 4. Invariants

| ID | Invariant | Verification |
|---|---|---|
| I1 | Stage 3 emits zero `evidence_matrix` entries when the adapter returns zero results | Unit test with empty mock adapter |
| I2 | Stage 3 never emits `confidence_bucket: "high"` | Unit test asserting bucket ∈ {`medium`,`low`} across fixtures |
| I3 | Every `evidence_matrix.source_anchor` originates from a `ToolResult.url` | Unit test comparing anchors to mock URLs |
| I4 | `verification_complete` is `false` when all hypotheses return zero results | Unit test |
| I5 | Anthropic protocol targets `/v1/messages`; OpenAI targets `/chat/completions` | Unit test on both configs |
| I6 | `dist/` artifacts contain `unwrapArgs` and `--help` when `dist/` exists | `dist-freshness.test.ts` |
| I7 | A failing Stage 6 gate with budget available routes to `node_stage_1` | Integration test |
| I8 | `stage_6_revision_count` increments exactly once per routing decision, never inside a node | Integration test asserting count after gate failure |
| I9 | The full suite runs offline with no network and no credentials | Existing constraint, preserved |

---

## 5. Testing Strategy

All work follows RED → GREEN. The failing log must be captured before implementation.

| Workstream | RED test | Expected RED failure |
|---|---|---|
| P5 | `test/unit/tool-adapter.test.ts` — empty adapter ⇒ 0 evidence, `verification_complete: false` | Current stub returns N entries with `"high"` |
| P5 | bucket-never-high assertion | Current stub returns `"high"` |
| P1 | `test/unit/http-invoker-protocol.test.ts` — anthropic config ⇒ `/v1/messages` | Current code always calls `/chat/completions` |
| P2 | `test/unit/dist-freshness.test.ts` | `dist/mcp.js` lacks `unwrapArgs` |
| P3 | `test/integration/stage6-gate-routing.test.ts` — gate fail ⇒ `node_stage_1` | Current edge always goes to `node_quality` |

---

## 6. Ordering and Dependencies

```
P5 (integrity)  ──→  P3 (enforcement)
P1 (protocol)       P2 (build)          ──→  P4 (docs)
```

- P5 and P1/P2 are independent and may proceed in parallel.
- P3 depends on P5: enforcing gates over fabricated evidence would enforce nothing.
- P4 is last; it documents the final state.

---

## 7. Deliberate Removals (P6, P7)

Recorded here so the design document can be corrected rather than silently diverging.

| Removed | Rationale |
|---|---|
| `src/plugins/{algorithms,tools,routers}/` | No consumer exists. LangGraph topology is kernel-owned by the design's own statement (design §1: *"graph topology remains kernel-owned"*). An extension point with no extender is speculative abstraction. |
| `.cr-runs/*.jsonl` | Duplicates `step_execution_log`, which already travels in graph state and is checkpointed by `SqliteSaver`. A second, unsynchronised trail adds a failure mode without adding information. |
| `src/kernel/s3-parallel.ts` (as a separate module) | Its intended responsibility is now served by `node_stage_3` + `ToolAdapter`. A separate module for a single caller is a forwarding wrapper. |

---

## 8. Public Interface Impact

| Surface | Change | Compatibility |
|---|---|---|
| `tool-adapter.ts` | new export | additive |
| `ExecutorDeps` | gains `toolAdapter?: ToolAdapter` | additive, optional |
| `HttpInvokerConfig` | gains `protocol?: "anthropic" \| "openai"` | additive, defaults to `"openai"` (current behaviour) |
| `GraphStateSchema` | gains `stage_6_gate_passed?: boolean` | additive, optional |
| `CR_REASONING_TOOL_MODULE` | new env seam | additive |
| CLI / MCP tool signatures | unchanged | — |

No breaking changes. Version bumps to `2.2.0` (minor).

---

## 9. Self-Review

- **Placeholder scan**: no TBD/TODO; every invariant has a named test.
- **Internal consistency**: §3.1's "never emit `high`" matches I2; §3.4's single-writer rule matches I8; §6's ordering matches the P3→P5 dependency stated in §1.
- **Scope**: five bounded workstreams under one spec; production backend wiring explicitly excluded (§1 Non-Goals) because it is a distinct sub-system.
- **Ambiguity**: the `confidence_bucket` rule is stated as an exhaustive three-row table with no residual case. `evidence_quality` is likewise exhaustive over kernel-reachable values.
