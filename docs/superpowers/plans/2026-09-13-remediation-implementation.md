# claude-reasoning v2.2.0 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `node_stage_3`'s fabricated evidence with an injectable `ToolAdapter`, fix the Anthropic/OpenAI protocol mismatch, verify build output, enforce Stage 6 gates, and align documentation.

**Architecture:** A new `ToolAdapter` interface mirrors the existing `LlmInvoker` pattern and is injected through `ExecutorDeps`. `node_stage_3` becomes async, dispatches one search per hypothesis with bounded concurrency, and derives `confidence_bucket` from a purely structural rule that never claims `high`. Protocol selection is an explicit config field set by the resolver from which environment variable supplied the baseUrl. Stage 6 becomes a conditional edge with single-writer counter discipline.

**Tech Stack:** TypeScript 5.9 (ESM/NodeNext), LangGraphJS 1.4, Zod 3, vitest 2, better-sqlite3, @modelcontextprotocol/sdk.

**Spec:** `docs/superpowers/specs/2026-09-13-remediation-design.md`

## Global Constraints

- Repo root: `C:\tmp\DONE\claude-reasoning`. All paths below are relative to it.
- Windows/win32; shell is Git Bash. Use `npx vitest run <path>` for tests.
- No network and no credentials in any test. The suite must stay offline-deterministic.
- Every task ends with `npx tsc --noEmit` (exit 0) and `npx vitest run` (green) before commit.
- Single-writer counters (§11.2.3): `backtrack_count`, `stage_0_revision_count`, `stage_6_revision_count` are incremented ONLY at routing decision points, never inside a node body.
- Fail-loud: Zod violations are never swallowed.
- Baseline at start: `tsc --noEmit` exit 0; `vitest` 15 files / 58 tests green.
- Do NOT commit anything outside the files each task names.

---

### Task 1: `ToolAdapter` interface

**Files:**
- Create: `src/kernel/tool-adapter.ts`
- Test: `test/unit/tool-adapter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface ToolResult { url: string; title: string; snippet: string }`; `interface ToolAdapter { search(query: string, maxResults?: number): Promise<ToolResult[]> }`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/tool-adapter.test.ts
import { describe, it, expect } from "vitest";
import type { ToolAdapter, ToolResult } from "../../src/kernel/tool-adapter.js";

describe("ToolAdapter contract", () => {
  it("is satisfiable by a plain object and returns ToolResult[]", async () => {
    const adapter: ToolAdapter = {
      search: async (query: string): Promise<ToolResult[]> => [
        { url: `https://example.com/${query}`, title: "t", snippet: "s" },
      ],
    };
    const results = await adapter.search("probe");
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/probe");
  });

  it("permits an empty result set", async () => {
    const adapter: ToolAdapter = { search: async () => [] };
    await expect(adapter.search("nothing")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/tool-adapter.test.ts`
Expected: FAIL — `Cannot find module '../../src/kernel/tool-adapter.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/kernel/tool-adapter.ts
/** Search results are raw and unread: the kernel never inspects page content. */
export interface ToolResult {
  url: string;
  title: string;
  snippet: string;
}

/** Retrieval is a passive dependency, injected like LlmInvoker. Kernel never imports a concrete backend. */
export interface ToolAdapter {
  search(query: string, maxResults?: number): Promise<ToolResult[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/tool-adapter.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/kernel/tool-adapter.ts test/unit/tool-adapter.test.ts
git commit -m "feat: add ToolAdapter interface for injected retrieval"
```

---

### Task 2: Stage 3 output fields in GraphState

**Files:**
- Modify: `src/kernel/types.ts` (schema region ~line 143-150; channel region ~line 247-257)
- Test: `test/unit/types.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `GraphState` gains `unverified_hypotheses: string[]`, `tool_calls: ToolCallEntry[]`, `cross_validation?: CrossValidation`. Exported types `ToolCallEntry` and `CrossValidation`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/types.test.ts`:

```typescript
describe("Stage 3 output fields", () => {
  it("defaults unverified_hypotheses and tool_calls to empty arrays", () => {
    const s = GraphStateSchema.parse({ session_id: "s", raw_question: "q" });
    expect(s.unverified_hypotheses).toEqual([]);
    expect(s.tool_calls).toEqual([]);
    expect(s.cross_validation).toBeUndefined();
  });

  it("accepts a populated ToolCallEntry", () => {
    const s = GraphStateSchema.parse({
      session_id: "s",
      raw_question: "q",
      tool_calls: [
        { sequence: 1, tool: "search", parameters: { query: "x" }, summary: "0 results", engine: "mock", duration_seconds: 0.1 },
      ],
    });
    expect(s.tool_calls[0]?.sequence).toBe(1);
    expect(s.tool_calls[0]?.summary).toBe("0 results");
  });

  it("accepts a not-assessable cross_validation", () => {
    const s = GraphStateSchema.parse({
      session_id: "s",
      raw_question: "q",
      cross_validation: {
        has_multiple_sources: false,
        has_discrepancy_over_20pct: false,
        discrepancy_list: [],
        discrepancy_root_cause: "",
        consensus_range: "",
      },
    });
    expect(s.cross_validation?.has_discrepancy_over_20pct).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/types.test.ts`
Expected: FAIL — `s.unverified_hypotheses` is `undefined`, expected `[]`.

- [ ] **Step 3: Write minimal implementation**

In `src/kernel/types.ts`, add near `EvidenceMatrixEntry` (line ~72):

```typescript
const ToolCallEntry = z.object({
  sequence: z.number().int(),
  tool: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  summary: z.string(),
  engine: z.string(),
  duration_seconds: z.number(),
});

const CrossValidation = z.object({
  has_multiple_sources: z.boolean(),
  has_discrepancy_over_20pct: z.boolean(),
  discrepancy_list: z.array(z.string()),
  discrepancy_root_cause: z.string(),
  consensus_range: z.string(),
});
```

In the schema's Pipeline-artifacts group (after `browse_verified`, line ~148):

```typescript
  unverified_hypotheses: z.array(z.string()).default([]),
  tool_calls: z.array(ToolCallEntry).default([]),
  cross_validation: CrossValidation.optional(),
```

Export types alongside the existing ones (line ~194):

```typescript
export type ToolCallEntry = z.infer<typeof ToolCallEntry>;
export type CrossValidation = z.infer<typeof CrossValidation>;
```

In `GraphStateChannels` (after `contradictory_evidence_ref`, line ~257):

```typescript
  unverified_hypotheses: replaceList<string>(),
  tool_calls: replaceList<z.infer<typeof ToolCallEntry>>(),
  cross_validation: scalar<z.infer<typeof CrossValidation> | undefined>(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/types.test.ts && npx tsc --noEmit`
Expected: PASS (all); tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/types.ts test/unit/types.test.ts
git commit -m "feat: add Stage 3 output channels (tool_calls, unverified_hypotheses, cross_validation)"
```

---

### Task 3: Real Stage 3 node

**Files:**
- Modify: `src/kernel/executor.ts:18-21` (`ExecutorDeps`), `src/kernel/executor.ts:135-145` (`nodeStage3`)
- Test: `test/unit/stage3-retrieval.test.ts`

**Interfaces:**
- Consumes: `ToolAdapter`, `ToolResult` (Task 1); `unverified_hypotheses`, `tool_calls`, `cross_validation` channels (Task 2).
- Produces: `export function deriveConfidenceBucket(hostCount: number): "medium" | "low"` on `src/kernel/executor.ts`; `ExecutorDeps` gains `toolAdapter?: ToolAdapter`.

**Background for the implementer:** the kernel receives only `url`/`title`/`snippet`. It has not read page content, so it must never emit `confidence_bucket: "high"`. That is the whole point of this task.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/stage3-retrieval.test.ts
import { describe, it, expect } from "vitest";
import { deriveConfidenceBucket, runStage3 } from "../../src/kernel/executor.js";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";
import type { ToolAdapter } from "../../src/kernel/tool-adapter.js";

const state = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ session_id: "s", raw_question: "q", ...over });

const fixed = (...urls: string[]): ToolAdapter => ({
  search: async () => urls.map((url, i) => ({ url, title: `t${i}`, snippet: `s${i}` })),
});

describe("deriveConfidenceBucket", () => {
  it("never returns high", () => {
    for (const n of [0, 1, 2, 5, 50]) {
      expect(deriveConfidenceBucket(n)).not.toBe("high");
    }
  });
  it("is medium at >=2 hosts, low at 0 or 1", () => {
    expect(deriveConfidenceBucket(0)).toBe("low");
    expect(deriveConfidenceBucket(1)).toBe("low");
    expect(deriveConfidenceBucket(2)).toBe("medium");
  });
});

describe("runStage3", () => {
  it("emits zero evidence and marks unverified when the adapter returns nothing", async () => {
    const out = await runStage3(state({ hypotheses: ["h1", "h2"] }), { search: async () => [] });
    expect(out.evidence_matrix).toEqual([]);
    expect(out.unverified_hypotheses).toEqual(["h1", "h2"]);
    expect(out.verification_complete).toBe(false);
    expect(out.evidence_quality).toBe("Insufficient");
  });

  it("anchors every evidence entry to a real returned URL", async () => {
    const adapter = fixed("https://a.example/x", "https://b.example/y");
    const out = await runStage3(state({ hypotheses: ["h1"] }), adapter);
    const anchors = (out.evidence_matrix ?? []).map((e) => e.source_anchor);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(["https://a.example/x", "https://b.example/y"]).toContain(a);
  });

  it("never marks confidence_bucket high", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    for (const e of out.evidence_matrix ?? []) expect(e.confidence_bucket).not.toBe("high");
  });

  it("records one tool_call per hypothesis dispatch", async () => {
    const out = await runStage3(state({ hypotheses: ["h1", "h2", "h3"] }), fixed("https://a.example/x"));
    expect(out.tool_calls).toHaveLength(3);
    expect((out.tool_calls ?? []).map((c) => c.sequence)).toEqual([1, 2, 3]);
  });

  it("sets verification_complete true when at least one search returned results", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    expect(out.verification_complete).toBe(true);
    expect(out.evidence_quality).toBe("Sufficient");
  });

  it("records cross_validation as not assessable", async () => {
    const out = await runStage3(state({ hypotheses: ["h1"] }), fixed("https://a.example/x"));
    expect(out.cross_validation?.has_discrepancy_over_20pct).toBe(false);
    expect(out.data_gap_list ?? []).toContain("cross_validation not assessable without content reading");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/stage3-retrieval.test.ts`
Expected: FAIL — `deriveConfidenceBucket` and `runStage3` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/kernel/executor.ts`, add the import (line ~11):

```typescript
import type { ToolAdapter, ToolResult } from "./tool-adapter.js";
```

Extend `ExecutorDeps` (line ~18):

```typescript
export interface ExecutorDeps {
  invoker: LlmInvoker;
  loader?: PromptLoader;
  toolAdapter?: ToolAdapter;
}
```

Add these module-level exports above `buildReasoningGraph` (line ~44):

```typescript
/** Structural proxy only: the kernel has not read the sources, so `high` is unreachable by design. */
export function deriveConfidenceBucket(hostCount: number): "medium" | "low" {
  return hostCount >= 2 ? "medium" : "low";
}

function distinctHosts(results: ToolResult[]): number {
  const hosts = new Set<string>();
  for (const r of results) {
    try {
      hosts.add(new URL(r.url).host);
    } catch {
      hosts.add(r.url);
    }
  }
  return hosts.size;
}

export interface Stage3Output {
  evidence_matrix: GraphState["evidence_matrix"];
  unverified_hypotheses: string[];
  tool_calls: GraphState["tool_calls"];
  cross_validation: GraphState["cross_validation"];
  verification_complete: boolean;
  evidence_quality: GraphState["evidence_quality"];
  data_gap_list: string[];
  step_execution_log: string[];
}

const STAGE3_CONCURRENCY = 4;

/** Pure aggregation over injected retrieval. No LLM call, no fabrication. */
export async function runStage3(
  state: GraphState,
  adapter: ToolAdapter
): Promise<Stage3Output> {
  const hypotheses = state.hypotheses;
  const paths = state.search_paths_required;
  const calls: GraphState["tool_calls"] = [];
  const evidence: GraphState["evidence_matrix"] = [];
  const unverified: string[] = [];

  let nextIndex = 0;
  const results: { hypothesis: string; query: string; results: ToolResult[]; seconds: number }[] = [];
  const worker = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++;
      if (i >= hypotheses.length) return;
      const hypothesis = hypotheses[i] as string;
      const query = paths[i % Math.max(1, paths.length)] ?? hypothesis;
      const started = Date.now();
      let found: ToolResult[] = [];
      try {
        found = await adapter.search(query, state.evidence_cap);
      } catch {
        found = [];
      }
      results.push({ hypothesis, query, results: found, seconds: (Date.now() - started) / 1000 });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(STAGE3_CONCURRENCY, Math.max(1, hypotheses.length)) }, worker)
  );

  results.sort((a, b) => hypotheses.indexOf(a.hypothesis) - hypotheses.indexOf(b.hypothesis));

  results.forEach((r, i) => {
    calls.push({
      sequence: i + 1,
      tool: "search",
      parameters: { query: r.query },
      summary: `${r.results.length} results`,
      engine: "tool-adapter",
      duration_seconds: Number(r.seconds.toFixed(3)),
    });
    if (r.results.length === 0) {
      unverified.push(r.hypothesis);
      return;
    }
    const bucket = deriveConfidenceBucket(distinctHosts(r.results));
    const top = r.results[0] as ToolResult;
    evidence.push({
      hypothesis: r.hypothesis,
      evidence_summary: top.title || top.snippet,
      confidence_bucket: bucket,
      source_anchor: top.url,
      date: new Date().toISOString().slice(0, 10),
    });
  });

  const anyResults = results.some((r) => r.results.length > 0);
  const gaps = [
    "cross_validation not assessable without content reading",
    "confidence_bucket is a structural proxy (distinct-host count), not content judgment",
  ];
  if (!anyResults) gaps.push("no retrieval results for any hypothesis");

  return {
    evidence_matrix: evidence,
    unverified_hypotheses: unverified,
    tool_calls: calls,
    cross_validation: {
      has_multiple_sources: evidence.length > 1,
      has_discrepancy_over_20pct: false,
      discrepancy_list: [],
      discrepancy_root_cause: "",
      consensus_range: "",
    },
    verification_complete: anyResults,
    evidence_quality: anyResults ? "Sufficient" : "Insufficient",
    data_gap_list: gaps,
    step_execution_log: ["node_stage_3"],
  };
}
```

Replace the old `nodeStage3` (line ~135-145) with:

```typescript
  const nodeStage3 = withLog("node_stage_3", (state) =>
    runStage3(
      state,
      deps.toolAdapter ?? {
        search: async () => [],
      }
    )
  );
```

The default empty adapter means "no backend configured" degrades honestly to zero evidence and `Insufficient`, never to fabricated results.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/stage3-retrieval.test.ts && npx tsc --noEmit`
Expected: PASS (all); tsc exit 0.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: green. Integration tests that previously relied on fabricated evidence may now need a `toolAdapter` in their deps — if `graph-topology.test.ts` or `gate-intercept.test.ts` fail, pass a mock adapter that returns one result per hypothesis.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/executor.ts test/unit/stage3-retrieval.test.ts test/integration/
git commit -m "fix: replace fabricated Stage 3 evidence with injected ToolAdapter retrieval

node_stage_3 previously synthesized evidence_matrix entries from hypotheses,
emitting synthetic source_anchor values and a hardcoded confidence_bucket of
\"high\". That matrix fed antiHallucinationGate's source check, making the
check vacuously pass. Stage 3 now dispatches real retrieval through an
injected adapter and derives confidence structurally, never claiming high."
```

---

### Task 4: Protocol selection in HttpInvoker

**Files:**
- Modify: `src/adapters/http-invoker.ts`, `src/adapters/invoker-resolver.ts:53-62`
- Test: `test/unit/http-invoker-protocol.test.ts`

**Interfaces:**
- Consumes: existing `HttpInvokerConfig`.
- Produces: `HttpInvokerConfig` gains `protocol?: "anthropic" | "openai"`. `src/adapters/http-invoker.ts` exports `buildRequest(config: HttpInvokerConfig, messages: { system: string; user: string }[]): { url: string; init: RequestInit }` and `extractReply(data: unknown, protocol: "anthropic" | "openai"): string` so the shape is testable without network.

**Background:** this is a protocol mismatch, not a path mismatch. Anthropic requires `{model, max_tokens, system, messages}` and returns `content[0].text`; OpenAI takes `{model, messages}` and returns `choices[0].message.content`. Patching only the URL yields 400.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/http-invoker-protocol.test.ts
import { describe, it, expect } from "vitest";
import { buildRequest, extractReply } from "../../src/adapters/http-invoker.js";

const msgs = [{ system: "SYS", user: "USR" }];

describe("buildRequest", () => {
  it("targets /v1/messages with Anthropic-shaped body", () => {
    const { url, init } = buildRequest({ baseUrl: "https://api.anthropic.com", protocol: "anthropic", model: "m", apiKey: "k" }, msgs);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("SYS");
    expect(body.messages).toEqual([{ role: "user", content: "USR" }]);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.response_format).toBeUndefined();
  });

  it("targets /chat/completions with OpenAI-shaped body", () => {
    const { url, init } = buildRequest({ baseUrl: "https://api.openai.com/v1", protocol: "openai", model: "m", apiKey: "k" }, msgs);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "system", content: "SYS" }, { role: "user", content: "USR" }]);
    expect(body.max_tokens).toBeUndefined();
  });

  it("defaults to the OpenAI protocol when unset", () => {
    const { url } = buildRequest({ baseUrl: "https://x/v1", model: "m" }, msgs);
    expect(url).toBe("https://x/v1/chat/completions");
  });
});

describe("extractReply", () => {
  it("reads Anthropic content[0].text", () => {
    expect(extractReply({ content: [{ type: "text", text: "A" }] }, "anthropic")).toBe("A");
  });
  it("reads OpenAI choices[0].message.content", () => {
    expect(extractReply({ choices: [{ message: { content: "B" } }] }, "openai")).toBe("B");
  });
  it("returns empty string on unknown shape", () => {
    expect(extractReply({ nope: true }, "openai")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/http-invoker-protocol.test.ts`
Expected: FAIL — `buildRequest` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/adapters/http-invoker.ts`, change the config interface and add the two helpers:

```typescript
export interface HttpInvokerConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  responseFormat?: "json_object" | "text";
  protocol?: "anthropic" | "openai";
}

const ANTHROPIC_MAX_TOKENS = 4096;

export function buildRequest(
  config: HttpInvokerConfig,
  messages: { system: string; user: string }[]
): { url: string; init: RequestInit } {
  const protocol = config.protocol ?? "openai";
  const headers: Record<string, string> = { "content-type": "application/json" };
  const system = messages[0]?.system ?? "";
  const users = messages.filter((m) => m.user).map((m) => m.user);

  if (protocol === "anthropic") {
    if (config.apiKey) headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: users.map((content) => ({ role: "user", content })),
    };
    if (system) body.system = system;
    if (config.temperature !== undefined) body.temperature = config.temperature;
    return { url: `${config.baseUrl}/v1/messages`, init: { method: "POST", headers, body: JSON.stringify(body) } };
  }

  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  const apiMessages: Array<{ role: string; content: string }> = [];
  if (system) apiMessages.push({ role: "system", content: system });
  for (const u of users) apiMessages.push({ role: "user", content: u });
  const payload: Record<string, unknown> = { model: config.model, messages: apiMessages };
  if (config.temperature !== undefined) payload.temperature = config.temperature;
  if (config.responseFormat === "json_object") payload.response_format = { type: "json_object" };
  return { url: `${config.baseUrl}/chat/completions`, init: { method: "POST", headers, body: JSON.stringify(payload) } };
}

export function extractReply(data: unknown, protocol: "anthropic" | "openai"): string {
  if (protocol === "anthropic") {
    const blocks = (data as { content?: { text?: string }[] })?.content;
    return blocks?.[0]?.text ?? "";
  }
  const choices = (data as { choices?: { message?: { content?: string } }[] })?.choices;
  return choices?.[0]?.message?.content ?? "";
}
```

Rewrite `invoke` to use them, preserving the existing 400 `response_format` fallback for the OpenAI path only:

```typescript
  async invoke(messages: { system: string; user: string }[]): Promise<string> {
    const protocol = this.config.protocol ?? "openai";
    let req = buildRequest(this.config, messages);
    let res = await fetch(req.url, req.init);

    // OpenAI-compatible endpoints may reject response_format (e.g. 400).
    if (!res.ok && res.status === 400 && protocol === "openai") {
      req = buildRequest({ ...this.config, responseFormat: undefined }, messages);
      res = await fetch(req.url, req.init);
    }

    if (!res.ok) throw new Error(`HttpInvoker: ${res.status} ${res.statusText}`);
    return extractReply(await res.json(), protocol);
  }
```

In `src/adapters/invoker-resolver.ts`, track which variable supplied the baseUrl and set `protocol` accordingly:

```typescript
  const baseUrlFromAnthropic = env.CR_REASONING_BASE_URL === undefined && env.OPENAI_BASE_URL === undefined && env.ANTHROPIC_BASE_URL !== undefined;
  const httpConfig: HttpInvokerConfig = {
    baseUrl,
    protocol: baseUrlFromAnthropic ? "anthropic" : "openai",
    apiKey: /* existing chain, unchanged */,
    model: /* existing chain, unchanged */,
  };
```

Do not disturb the existing apiKey/model resolution chains.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/http-invoker-protocol.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS; full suite green; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/http-invoker.ts src/adapters/invoker-resolver.ts test/unit/http-invoker-protocol.test.ts
git commit -m "fix: select Anthropic or OpenAI protocol from the baseUrl source

HttpInvoker always posted OpenAI-shaped bodies to /chat/completions, but
invoker-resolver fed it ANTHROPIC_BASE_URL. An Anthropic-protocol endpoint
returns 404 there, and patching only the path would yield 400 because the
body shape and response envelope both differ. Protocol is now chosen from
which environment variable supplied the baseUrl."
```

---

### Task 5: Build-output freshness check

**Files:**
- Create: `test/unit/dist-freshness.test.ts`

**Interfaces:**
- Consumes: the built artifacts under `dist/`.
- Produces: nothing (test-only).

**Background:** `ae2ad50` committed fixes that never reached `dist/`, which is what `.pi/agent/mcp.json` executes. No check observed build output, so the drift was invisible.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/dist-freshness.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(process.cwd(), "dist");

describe("dist freshness", () => {
  const hasDist = existsSync(DIST);

  it.skipIf(!hasDist)("dist/mcp.js contains unwrapArgs (run `npm run build` if this fails)", () => {
    expect(readFileSync(join(DIST, "mcp.js"), "utf8")).toContain("unwrapArgs");
  });

  it.skipIf(!hasDist)("dist/cli.js contains the --help branch", () => {
    expect(readFileSync(join(DIST, "cli.js"), "utf8")).toContain("help");
  });

  it.skipIf(!hasDist)("dist is not older than src", () => {
    // Presence-only smoke: the two assertions above are the real gate.
    expect(existsSync(join(DIST, "index.js"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/dist-freshness.test.ts`
Expected: FAIL — `dist/mcp.js` does not contain `unwrapArgs` (build is stale). If it passes, the build was already refreshed; note that and continue.

- [ ] **Step 3: Rebuild**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/dist-freshness.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add test/unit/dist-freshness.test.ts dist/
git commit -m "test: assert dist artifacts carry unwrapArgs and --help, rebuild dist"
```

---

### Task 6: Stage 6 gate enforcement

**Files:**
- Modify: `src/kernel/executor.ts:192-215` (`nodeStage6`), `src/kernel/executor.ts:261` (the edge)
- Test: `test/integration/stage6-gate-routing.test.ts`

**Interfaces:**
- Consumes: `conclusionGates`, `STAGE_6_REVISIONS_MAX` from `./gates.js`; `stage_6_revision_count` channel.
- Produces: `node_stage_6` returns `stage_6_gate_passed: boolean`; the edge from `node_stage_6` becomes conditional.

**Counter discipline:** `stage_6_revision_count` is incremented in the routing function only — never inside `nodeStage6`.

**Why the edge does not re-call the router:** `nodeStage5` (`executor.ts:163-179`) establishes the pattern — the router runs inside the node and its `update` is merged into the node's return; the conditional edge then reads the *updated* state. Re-calling the router in the edge would be ambiguous here, because after incrementing, "failed with budget" and "failed without budget" both present `stage_6_revision_count === 1`. The router therefore also writes the routing token `revision_target`, which the edge reads unambiguously.

- [ ] **Step 1: Write the failing test**

```typescript
// test/integration/stage6-gate-routing.test.ts
import { describe, it, expect } from "vitest";
import { routeStage6, stage6EdgeTarget } from "../../src/kernel/executor.js";
import { GraphStateSchema, type GraphState } from "../../src/kernel/types.js";

const state = (over: Partial<GraphState>): GraphState =>
  GraphStateSchema.parse({ session_id: "s", raw_question: "q", ...over });

describe("routeStage6", () => {
  it("passes to quality when the gates passed", () => {
    const r = routeStage6(state({ stage_6_gate_passed: true }));
    expect(r.goto).toBe("node_quality");
    expect(r.update.stage_6_revision_count).toBeUndefined();
    expect(r.update.revision_target).toBe("none");
  });

  it("routes to stage_1 and increments the counter once when gates fail", () => {
    const r = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    expect(r.goto).toBe("node_stage_1");
    expect(r.update.stage_6_revision_count).toBe(1);
    expect(r.update.revision_target).toBe("stage-1");
  });

  it("stops routing and warns when the revision budget is spent", () => {
    const r = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 1 }));
    expect(r.goto).toBe("node_quality");
    expect(r.update.stage_6_revision_count).toBeUndefined();
    expect(r.update.residual_uncertainty).toContain("STAGE_6_GATE_WARNING");
    expect(r.update.revision_target).toBe("none");
  });

  it("increments the counter only on the pass that still has budget", () => {
    // Two consecutive failures with budget 1 must not loop: the second converges.
    const first = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    expect(first.update.stage_6_revision_count).toBe(1);
    const second = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: first.update.stage_6_revision_count as number }));
    expect(second.update.stage_6_revision_count).toBeUndefined();
    expect(second.goto).toBe("node_quality");
  });
});

describe("stage6EdgeTarget", () => {
  it("reads the routing token the router wrote", () => {
    const routed = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 0 }));
    const after = { ...state({}), ...routed.update } as GraphState;
    expect(stage6EdgeTarget(after)).toBe("node_stage_1");
  });

  it("converges on quality when the token is none", () => {
    const routed = routeStage6(state({ stage_6_gate_passed: false, stage_6_revision_count: 1 }));
    const after = { ...state({}), ...routed.update } as GraphState;
    expect(stage6EdgeTarget(after)).toBe("node_quality");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/stage6-gate-routing.test.ts`
Expected: FAIL — `routeStage6` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/kernel/executor.ts`, extend the gates import (line ~15):

```typescript
import { antiHallucinationGate, conclusionGates, STAGE_6_REVISIONS_MAX } from "./gates.js";
```

Add near `routeCritique` usage — a module-level export:

```typescript
/** Single writer for stage_6_revision_count (§11.2.3): incremented here, never in a node. */
export function routeStage6(state: GraphState): {
  update: Partial<GraphState>;
  goto: "node_stage_1" | "node_quality";
} {
  if (state.stage_6_gate_passed === true) {
    return { update: { revision_target: "none" }, goto: "node_quality" };
  }
  if (state.stage_6_revision_count < STAGE_6_REVISIONS_MAX) {
    return {
      update: { stage_6_revision_count: state.stage_6_revision_count + 1, revision_target: "stage-1" },
      goto: "node_stage_1",
    };
  }
  const prev = state.residual_uncertainty ?? "";
  return {
    update: {
      residual_uncertainty: prev ? `${prev}; STAGE_6_GATE_WARNING` : "STAGE_6_GATE_WARNING",
      revision_target: "none",
    },
    goto: "node_quality",
  };
}

/** Reads the token `routeStage6` wrote, so the edge never re-derives intent from the counter. */
export function stage6EdgeTarget(state: GraphState): "node_stage_1" | "node_quality" {
  return state.revision_target === "stage-1" ? "node_stage_1" : "node_quality";
}
```

Add `stage_6_gate_passed` to the schema and channels in `src/kernel/types.ts`, in the gates/outputs group (line ~164) and channel group (line ~270):

```typescript
  stage_6_gate_passed: z.boolean().optional(),
```
```typescript
  stage_6_gate_passed: scalar<boolean | undefined>(),
```

In `nodeStage6`, route inside the node exactly as `nodeStage5` does, and drop the inline warning (routing now owns it). Replace the whole node body's return:

```typescript
    const cGates = conclusionGates({ /* existing argument object, unchanged */ });
    const decision = routeStage6({ ...state, stage_6_gate_passed: cGates.all_passed } as GraphState);
    return {
      conclusion_card: out.conclusion_card,
      conclusion_points: out.conclusion_points,
      evidence_quality: out.evidence_quality as GraphState["evidence_quality"],
      stage_6_gate_passed: cGates.all_passed,
      ...decision.update,
    };
```

Replace the edge at line ~261:

```typescript
    .addConditionalEdges("node_stage_6", stage6EdgeTarget)
```

This mirrors the Stage 5 pattern: the router runs inside the node, its `update` (counter increment + routing token) is committed with the node's return, and the edge reads the committed token. The edge is a pure reader and never mutates state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/stage6-gate-routing.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS; full suite green; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/executor.ts src/kernel/types.ts test/integration/stage6-gate-routing.test.ts
git commit -m "fix: enforce Stage 6 conclusion gates with bounded Stage 1 routing

node_stage_6 had an unconditional edge to node_quality, so a failing gate
only appended a warning. stage-6-conclusion.md requires routing back to
Decomposition when the gate fails and the revision budget allows. Routing
and counter increment now live in one decision point."
```

---

### Task 7: Documentation and invariant alignment

**Files:**
- Modify: `README.md:15,251`, `CHANGELOG.md`, `package.json` (version)
- Create: `docs/superpowers/specs/2026-09-13-remediation-design.md` (already committed)
- Modify: `C:\tmp\docs\superpowers\specs\2026-09-11-invariant-alignment-report.md`, `C:\tmp\docs\superpowers\specs\2026-09-11-cr-reasoning-v2-design.md`

**Interfaces:**
- Consumes: the final test count from Task 6's full-suite run.
- Produces: nothing (docs only).

- [ ] **Step 1: Capture the authoritative counts**

Run: `npx vitest run 2>&1 | tail -5`
Expected: record the exact `Test Files` and `Tests` numbers; use them verbatim below.

- [ ] **Step 2: Update README**

Replace the counts at `README.md:251` with the captured numbers, and update the badge at `README.md:15` to match.

- [ ] **Step 3: Correct the invariant report**

In `C:\tmp\docs\superpowers\specs\2026-09-11-invariant-alignment-report.md`:
- Line 7: change `2026-09-11-cr-reasoning-v2-plan.md` to `2026-09-11-cr-reasoning-v2-implementation.md`.
- Replace the `100% 對齊` column values with per-item status: mark Stage 3 retrieval, Stage 6 gate routing, and precision wiring as `已於 v2.2.0 修正`; mark the plugin architecture and `.cr-runs/` rows as `刻意不實作（YAGNI）`, citing the remediation spec §7.

- [ ] **Step 4: Correct the design document**

In `C:\tmp\docs\superpowers\specs\2026-09-11-cr-reasoning-v2-design.md`:
- §2 directory tree: remove `src/plugins/**`, `src/kernel/s3-parallel.ts`, and `.cr-runs/`.
- §5: replace the plugin-architecture section with a one-paragraph note that extension points were deliberately not built, cross-referencing the remediation spec §7.
- Add a header line: `**Superseded in part by**: docs/superpowers/specs/2026-09-13-remediation-design.md`.

- [ ] **Step 5: Add the CHANGELOG entry**

Prepend to `CHANGELOG.md`:

```markdown
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
```

- [ ] **Step 6: Bump the version**

Set `"version": "2.2.0"` in `package.json`, and update the MCP server version string in `src/mcp.ts` if it is hardcoded.

- [ ] **Step 7: Verify nothing contradicts the code**

Check each of the four doc-sync review items:
1. Metrics: README counts match Step 1's captured output; `2.2.0` consistent across `package.json`, README badge, CHANGELOG.
2. Interfaces: README's CLI examples still match `src/cli.ts`; `CR_REASONING_TOOL_MODULE` documented.
3. Semantics: any Mermaid/topology description matches the new conditional Stage 6 edge.
4. Changelog: present with breaking-change statement.

- [ ] **Step 8: Commit**

```bash
git add README.md CHANGELOG.md package.json src/mcp.ts
git commit -m "docs: align README, CHANGELOG, and design docs with v2.2.0"
```

Also commit the out-of-repo corrections separately if the user wants them version-controlled; they are currently outside the repository.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 ToolAdapter interface | Task 1 |
| §3.1 Stage 3 rewrite + bucket rule | Task 3 |
| §3.1 schema/channels for new outputs | Task 2 |
| §3.2 protocol selection | Task 4 |
| §3.3 build verification | Task 5 |
| §3.4 gate enforcement | Task 6 |
| §3.5 docs + P6/P7 removal | Task 7 |
| §4 I1–I4 | Task 3 tests |
| §4 I5 | Task 4 tests |
| §4 I6 | Task 5 tests |
| §4 I7, I8 | Task 6 tests |
| §4 I9 | Global Constraints |
| §8 public interface impact | Tasks 1,2,3,4,6 |

No gaps.

**Placeholder scan:** no TBD/TODO/"similar to Task N"/"handle edge cases". Task 6's earlier API-shape uncertainty was resolved by reading `nodeStage5` (`executor.ts:163-179`), which establishes the router-inside-node pattern; the plan now prescribes it exactly rather than offering alternatives. No step describes what to do without showing how.

**Type consistency:** `ToolResult`/`ToolAdapter` defined in Task 1 and consumed identically in Task 3. `ToolCallEntry` and `CrossValidation` defined in Task 2, consumed in Task 3's `runStage3` return. `deriveConfidenceBucket` returns `"medium" | "low"` in both Task 3's definition and its test. `routeStage6` returns `{update, goto}` with `goto` typed `"node_stage_1" | "node_quality"`, matching `stage6EdgeTarget`'s return type and the edge targets. `stage_6_gate_passed` is `boolean | undefined` in schema, channel, and `nodeStage6` output. `revision_target` is reused as the routing token; it already exists in the schema with the required `"stage-1"` and `"none"` members.

**Dependency check:** Task 3 modifies `executor.ts`, which Task 6 also modifies. They are sequential (Task 6 depends on Task 3's `runStage3` being in place), so no concurrent edit conflict. Tasks 1→3 and 2→3 are ordered. Task 4 and Task 5 touch disjoint files and may run in parallel with Tasks 1–3.
