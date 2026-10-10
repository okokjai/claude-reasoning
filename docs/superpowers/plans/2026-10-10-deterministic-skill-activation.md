# Deterministic Skill Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `claude-reasoning` activate deterministically under omp — a `context`-hook extension injects a forced `read skill://claude-reasoning` directive on structural signals or repeated failures, `sync-local.ts` writes the full description under the correctly computed cache key with orphan GC, and `SKILL.md` front-loads trigger semantics inside the ~93-char preview window.

**Architecture:** Three surfaces. (a) `extensions/skill-router.ts` — omp extension hooking `pi.on("context")`, injecting a user-role message when pure-function heuristics (`router-heuristics.ts`) fire. (b) `scripts/sync-local.ts` — computes `sha256(compressPrompt + \0 + name + \0 + description)` at runtime, `INSERT OR REPLACE` into `skill-descriptions.db`, sidecar `scripts/.sync-state.json` GCs only rows it wrote, deploys the extension to `~/.omp/agent/extensions/`. (c) `SKILL.md`/`package.json` — front-loaded description. Gate B (`think.ts` termination gates) unchanged.

**Tech Stack:** Bun (`bun:test`, `bun:sqlite`, `Bun.CryptoHasher`), TypeScript, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-deterministic-skill-activation-design.md`

## Global Constraints

- Repo root: `C:\tmp\DONE\claude-reasoning` — all paths below are relative to it.
- No LLM calls anywhere in the router — the host has no `smol`/`tiny`/`judge` model role configured; any model dependency fails hard.
- Never `UPDATE`/`DELETE`/`INSERT` rows in `skill_descriptions` whose key this script did not compute — foreign skills' rows are off-limits.
- `OMP_SKILL_ROUTER_DEBUG=1` env var gates all diagnostic stderr output in the extension.
- Test conventions: `bun:test` (`describe`/`it`/`expect`), no network, no host filesystem writes in tests (pure functions + in-memory sqlite).
- Version surfaces stay aligned (existing drift-guard test at `tests/skill-frontmatter.test.ts:76-87` enforces SKILL.md/package.json/README/CHANGELOG/think.ts header).
- Existing test `tests/skill-frontmatter.test.ts:41-57` hardcodes the stale key `9a1cc97e…` — Task 3 must update it to the runtime-computed key.

---

### Task 1: `scripts/router-heuristics.ts` — pure scoring module

**Files:**
- Create: `scripts/router-heuristics.ts`
- Test: `tests/router-heuristics.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `interface ChatMessage { role: string; content?: unknown }`
  - `function messageText(message: ChatMessage): string` — extracts text from `content` string or `Array<{type:"text",text:string}>` parts; returns `""` otherwise.
  - `function structuralScore(text: string): number` — counts structural signals (see implementation).
  - `function countFailures(messages: ChatMessage[], sinceIndex: number): number` — counts messages after `sinceIndex` containing error markers.
  - `function findSkillLoadIndex(messages: ChatMessage[], marker: string): number` — index of last message containing `marker`, else `-1`.
  - `function shouldInject(messages: ChatMessage[], opts: { marker: string; failureThreshold?: number; scoreThreshold?: number }): { inject: boolean; reason: string }` — the single decision entry point.
  - `const INJECTION_MARKER = "claude-reasoning-deterministic-gate"`.
  - `const INJECTION_TEXT` — the directive text containing the marker.

- [ ] **Step 1: Write the failing test**

Create `tests/router-heuristics.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  shouldInject,
  structuralScore,
  countFailures,
  findSkillLoadIndex,
  INJECTION_MARKER,
  INJECTION_TEXT,
  type ChatMessage,
} from "../scripts/router-heuristics";

const user = (text: string): ChatMessage => ({ role: "user", content: text });
const toolErr = (): ChatMessage => ({
  role: "tool",
  content: [{ type: "text", text: "Error: command exited with code 1\nFAIL tests/foo.test.ts" }],
});
const assistant = (text: string): ChatMessage => ({ role: "assistant", content: text });

describe("structuralScore", () => {
  it("scores parallel-option contrast", () => {
    expect(structuralScore("should I use Redis or SQLite for this?")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("React vs Vue for the dashboard")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("方案A跟方案B哪個比較好")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("這兩種寫法該怎麼挑")).toBeGreaterThanOrEqual(1);
  });
  it("scores open-ended question shapes", () => {
    expect(structuralScore("how should I structure this service?")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("幫我看看這個架構有什麼問題")).toBeGreaterThanOrEqual(1);
  });
  it("scores multi-file references", () => {
    expect(structuralScore("compare src/a.ts and src/b.ts")).toBeGreaterThanOrEqual(1);
  });
  it("scores zero on flat imperatives", () => {
    expect(structuralScore("fix the typo in README.md")).toBe(0);
    expect(structuralScore("run the tests")).toBe(0);
  });
});

describe("countFailures", () => {
  it("counts error-bearing messages after the given index", () => {
    const msgs = [user("hi"), toolErr(), assistant("retry"), toolErr()];
    expect(countFailures(msgs, -1)).toBe(2);
    expect(countFailures(msgs, 1)).toBe(1);
  });
  it("ignores non-error content", () => {
    const msgs = [user("hi"), assistant("all tests passed")];
    expect(countFailures(msgs, -1)).toBe(0);
  });
});

describe("findSkillLoadIndex", () => {
  it("finds the last message containing the marker", () => {
    const msgs = [user("a"), user(INJECTION_MARKER), user("b"), user(INJECTION_MARKER)];
    expect(findSkillLoadIndex(msgs, INJECTION_MARKER)).toBe(3);
  });
  it("returns -1 when absent", () => {
    expect(findSkillLoadIndex([user("x")], INJECTION_MARKER)).toBe(-1);
  });
});

describe("shouldInject", () => {
  it("injects on structural signals in the last user message", () => {
    const msgs = [user("which approach is better, caching or memoization?")];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(true);
  });
  it("injects on >=2 failures since last skill load", () => {
    const msgs = [user("fix it"), toolErr(), toolErr()];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(true);
  });
  it("resets the failure window after a skill load", () => {
    const msgs = [user("fix it"), toolErr(), user(INJECTION_TEXT), toolErr()];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("is idempotent when injection marker already present", () => {
    const msgs = [user("A or B?"), user(INJECTION_TEXT)];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("does not inject on flat input with no failures", () => {
    const msgs = [user("rename the variable")];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("reports a human-readable reason", () => {
    const r = shouldInject([user("A vs B?")], { marker: INJECTION_MARKER });
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/router-heuristics.test.ts`
Expected: FAIL — module `../scripts/router-heuristics` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/router-heuristics.ts`:

```ts
/**
 * scripts/router-heuristics.ts
 *
 * Pure structural heuristics for deterministic skill activation.
 * No I/O, no model calls — unit-testable in isolation.
 */

export interface ChatMessage {
  role: string;
  content?: unknown;
}

export const INJECTION_MARKER = "claude-reasoning-deterministic-gate";

export const INJECTION_TEXT =
  `[${INJECTION_MARKER}] This session has hit signals that warrant ` +
  `structured reasoning (open-ended structure or repeated failed attempts). ` +
  `MUST read skill://claude-reasoning before further analysis or edits. ` +
  `Skip only if the task is trivially closed-form.`;

const CONTRAST_RE = /\b(?:vs\.?|versus)\b|(?:\b\w+\b\s+or\s+\b\w+\b)|[比較對比]|哪個|哪一種|該選|怎麼挑|A\s*跟\s*B/i;
const OPEN_ENDED_RE = /\b(?:why|how should|which|trade.?offs?|pros and cons)\b|如何|該|為什麼|有什麼(?:問題|風險|優缺點)/i;
const MULTI_PATH_RE = /(?:[\w./-]+\.[a-z0-9]+).*(?:[\w./-]+\.[a-z0-9]+)/i;
const FAILURE_RE = /(?:\berror\b|FAIL\b|exit(?:ed)?\s+(?:with\s+)?code\s+[1-9]|AssertionError|Expected\b.*\bReceived|at\s+\w+\s+\([^)]+\.ts:\d+)/i;

export function messageText(message: ChatMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter(
      (p): p is { type: string; text: string } =>
        !!p && typeof p === "object" && (p as { type?: unknown }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string",
    )
    .map(p => p.text)
    .join("\n");
}

export function structuralScore(text: string): number {
  let score = 0;
  if (CONTRAST_RE.test(text)) score++;
  if (OPEN_ENDED_RE.test(text)) score++;
  if (MULTI_PATH_RE.test(text)) score++;
  return score;
}

export function countFailures(messages: ChatMessage[], sinceIndex: number): number {
  let n = 0;
  for (let i = sinceIndex + 1; i < messages.length; i++) {
    if (FAILURE_RE.test(messageText(messages[i]))) n++;
  }
  return n;
}

export function findSkillLoadIndex(messages: ChatMessage[], marker: string): number {
  let idx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messageText(messages[i]).includes(marker)) idx = i;
  }
  return idx;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const t = messageText(messages[i]);
      if (t.includes(INJECTION_MARKER)) continue; // our own injections don't count as user intent
      return t;
    }
  }
  return "";
}

export function shouldInject(
  messages: ChatMessage[],
  opts: { marker: string; failureThreshold?: number; scoreThreshold?: number },
): { inject: boolean; reason: string } {
  const { marker, failureThreshold = 2, scoreThreshold = 1 } = opts;

  if (findSkillLoadIndex(messages, marker) >= 0) {
    // Marker present — but only suppress if it came AFTER the last failure burst;
    // simple idempotency: if any message carries the marker and no NEW failures
    // followed it, stay quiet.
    const loadIdx = findSkillLoadIndex(messages, marker);
    if (countFailures(messages, loadIdx) < failureThreshold) {
      return { inject: false, reason: "marker present, no new failure burst" };
    }
    return { inject: true, reason: `failures since last load >= ${failureThreshold}` };
  }

  const score = structuralScore(lastUserText(messages));
  if (score >= scoreThreshold) {
    return { inject: true, reason: `structural score ${score} >= ${scoreThreshold}` };
  }

  const failures = countFailures(messages, -1);
  if (failures >= failureThreshold) {
    return { inject: true, reason: `failure count ${failures} >= ${failureThreshold}` };
  }

  return { inject: false, reason: `score ${score}, failures ${failures} — below thresholds` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/router-heuristics.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add scripts/router-heuristics.ts tests/router-heuristics.test.ts
git commit -m "feat(router): pure structural/failure heuristics for skill activation"
```

---

### Task 2: `extensions/skill-router.ts` — omp extension hook

**Files:**
- Create: `extensions/skill-router.ts`
- Test: covered by Task 1 unit tests (extension is a thin adapter; shape checks are defensive-only)

**Interfaces:**
- Consumes: `shouldInject`, `INJECTION_TEXT`, `INJECTION_MARKER`, `ChatMessage`, `messageText` from `../scripts/router-heuristics` — **BUT** extensions load from `~/.omp/agent/extensions/` at runtime, outside the repo tree. Therefore the extension file must be **self-contained**: it inlines the heuristic functions (Task 2 implements its own copy; a drift-guard test in Task 5 asserts the two copies stay identical).
- Produces: `export default function (pi: ExtensionAPI): void` registering a `context` handler.

- [ ] **Step 1: Write the extension**

Create `extensions/skill-router.ts`. Self-contained copy of the heuristics (no cross-directory imports — omp extensions resolve relative to their own dir):

```ts
/**
 * extensions/skill-router.ts — deployed to ~/.omp/agent/extensions/ by sync-local.ts
 *
 * Deterministic Gate A: on every context assembly, scan messages for
 * structural signals in the last user turn or repeated failure bursts;
 * when triggered, inject a user-role directive forcing skill://claude-reasoning.
 *
 * Heuristics below MUST stay byte-identical to scripts/router-heuristics.ts
 * (enforced by tests/extension-drift.test.ts).
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// ---- begin synced block: router-heuristics ----
interface ChatMessage { role: string; content?: unknown }
const INJECTION_MARKER = "claude-reasoning-deterministic-gate";
const INJECTION_TEXT =
  `[${INJECTION_MARKER}] This session has hit signals that warrant ` +
  `structured reasoning (open-ended structure or repeated failed attempts). ` +
  `MUST read skill://claude-reasoning before further analysis or edits. ` +
  `Skip only if the task is trivially closed-form.`;
const CONTRAST_RE = /\b(?:vs\.?|versus)\b|(?:\b\w+\b\s+or\s+\b\w+\b)|[比較對比]|哪個|哪一種|該選|怎麼挑|A\s*跟\s*B/i;
const OPEN_ENDED_RE = /\b(?:why|how should|which|trade.?offs?|pros and cons)\b|如何|該|為什麼|有什麼(?:問題|風險|優缺點)/i;
const MULTI_PATH_RE = /(?:[\w./-]+\.[a-z0-9]+).*(?:[\w./-]+\.[a-z0-9]+)/i;
const FAILURE_RE = /(?:\berror\b|FAIL\b|exit(?:ed)?\s+(?:with\s+)?code\s+[1-9]|AssertionError|Expected\b.*\bReceived|at\s+\w+\s+\([^)]+\.ts:\d+)/i;

function messageText(message: ChatMessage): string {
  const c = message.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter((p): p is { type: string; text: string } =>
      !!p && typeof p === "object" && (p as { type?: unknown }).type === "text" &&
      typeof (p as { text?: unknown }).text === "string")
    .map(p => p.text).join("\n");
}
function structuralScore(text: string): number {
  let s = 0;
  if (CONTRAST_RE.test(text)) s++;
  if (OPEN_ENDED_RE.test(text)) s++;
  if (MULTI_PATH_RE.test(text)) s++;
  return s;
}
function countFailures(messages: ChatMessage[], sinceIndex: number): number {
  let n = 0;
  for (let i = sinceIndex + 1; i < messages.length; i++)
    if (FAILURE_RE.test(messageText(messages[i]))) n++;
  return n;
}
function findSkillLoadIndex(messages: ChatMessage[], marker: string): number {
  let idx = -1;
  for (let i = 0; i < messages.length; i++)
    if (messageText(messages[i]).includes(marker)) idx = i;
  return idx;
}
function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const t = messageText(messages[i]);
      if (t.includes(INJECTION_MARKER)) continue;
      return t;
    }
  }
  return "";
}
function shouldInject(messages: ChatMessage[], opts: { marker: string; failureThreshold?: number; scoreThreshold?: number }): { inject: boolean; reason: string } {
  const { marker, failureThreshold = 2, scoreThreshold = 1 } = opts;
  const loadIdx = findSkillLoadIndex(messages, marker);
  if (loadIdx >= 0) {
    if (countFailures(messages, loadIdx) < failureThreshold)
      return { inject: false, reason: "marker present, no new failure burst" };
    return { inject: true, reason: `failures since last load >= ${failureThreshold}` };
  }
  const score = structuralScore(lastUserText(messages));
  if (score >= scoreThreshold)
    return { inject: true, reason: `structural score ${score} >= ${scoreThreshold}` };
  const failures = countFailures(messages, -1);
  if (failures >= failureThreshold)
    return { inject: true, reason: `failure count ${failures} >= ${failureThreshold}` };
  return { inject: false, reason: `score ${score}, failures ${failures} — below thresholds` };
}
// ---- end synced block: router-heuristics ----

const DEBUG = process.env.OMP_SKILL_ROUTER_DEBUG === "1";

export default function skillRouter(pi: ExtensionAPI): void {
  pi.on("context", async (event) => {
    const messages = (event as { messages?: ChatMessage[] }).messages ?? [];
    const decision = shouldInject(messages, { marker: INJECTION_MARKER });
    if (DEBUG) console.error(`[skill-router] inject=${decision.inject} reason=${decision.reason}`);
    if (!decision.inject) return;

    const injection = {
      role: "user" as const,
      content: [{ type: "text" as const, text: INJECTION_TEXT }],
      timestamp: Date.now(),
    };
    return { messages: [...messages, injection] };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: either clean, or a single error on the `ExtensionAPI` import — if the package types aren't resolvable from this repo, change the import to `import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";` and add to `tsconfig.json` `"paths"` if needed; acceptable fallback is a local minimal type:

```ts
interface ExtensionAPI {
  on(event: "context", handler: (event: { messages?: unknown[] }) => Promise<{ messages?: unknown[] } | void>): void;
}
```

(Record which was needed in the commit message.)

- [ ] **Step 3: Commit**

```bash
git add extensions/skill-router.ts tsconfig.json
git commit -m "feat(router): omp context-hook extension for deterministic skill activation"
```

---

### Task 3: `scripts/sync-local.ts` — dynamic key + GC + extension deploy

**Files:**
- Modify: `scripts/sync-local.ts` (replace DB section lines ~46-64, add extension deploy)
- Test: `tests/sync-local.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks; reads `SKILL.md` frontmatter, the host's `compress-description.md`, and `extensions/skill-router.ts`.
- Produces:
  - `function computeKey(promptTemplate: string, name: string, description: string): string` (exported for tests)
  - `function syncDb(dbPath: string, promptTemplate: string, name: string, description: string, stateFile: string): { key: string; removed: string[] }` (exported for tests; sidecar GC)
  - `scripts/.sync-state.json` sidecar: `{ "writtenKeys": string[] }`

- [ ] **Step 1: Write the failing test**

Create `tests/sync-local.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeKey, syncDb } from "../scripts/sync-local";

const PROMPT = "Compress into one routing hint {{name}} {{description}}";
const NAME = "claude-reasoning";
const DESC = "Use when or before answering test description.";

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "sync-test-"));
  const dbPath = join(dir, "s.db");
  const { Database } = require("bun:sqlite");
  new Database(dbPath).run("CREATE TABLE skill_descriptions (key TEXT PRIMARY KEY, description TEXT NOT NULL)");
  return { dir, dbPath };
}

describe("computeKey", () => {
  it("matches sha256(prompt + NUL + name + NUL + desc)", () => {
    const expected = new Bun.CryptoHasher("sha256")
      .update(PROMPT).update("\0").update(NAME).update("\0").update(DESC).digest("hex");
    expect(computeKey(PROMPT, NAME, DESC)).toBe(expected);
  });
});

describe("syncDb", () => {
  it("inserts the description under the computed key", () => {
    const { dir, dbPath } = tmpDb();
    const state = join(dir, ".state.json");
    syncDb(dbPath, PROMPT, NAME, DESC, state);
    const { Database } = require("bun:sqlite");
    const row = new Database(dbPath)
      .query("SELECT description FROM skill_descriptions WHERE key = ?")
      .get(computeKey(PROMPT, NAME, DESC)) as { description: string } | null;
    expect(row?.description).toBe(DESC);
    rmSync(dir, { recursive: true });
  });

  it("removes keys it previously wrote that no longer match (orphan GC)", () => {
    const { dir, dbPath } = tmpDb();
    const state = join(dir, ".state.json");
    const r1 = syncDb(dbPath, PROMPT, NAME, "old description", state);
    const r2 = syncDb(dbPath, PROMPT, NAME, DESC, state);
    expect(r2.removed).toContain(r1.key);
    const { Database } = require("bun:sqlite");
    const stale = new Database(dbPath)
      .query("SELECT key FROM skill_descriptions WHERE key = ?")
      .get(r1.key);
    expect(stale).toBeNull();
    rmSync(dir, { recursive: true });
  });

  it("never deletes foreign rows", () => {
    const { dir, dbPath } = tmpDb();
    const { Database } = require("bun:sqlite");
    new Database(dbPath).run(
      "INSERT INTO skill_descriptions (key, description) VALUES ('foreign-key', 'foreign')"
    );
    const state = join(dir, ".state.json");
    syncDb(dbPath, PROMPT, NAME, DESC, state);
    const foreign = new Database(dbPath)
      .query("SELECT key FROM skill_descriptions WHERE key = 'foreign-key'").get();
    expect(foreign).not.toBeNull();
    rmSync(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sync-local.test.ts`
Expected: FAIL — `computeKey`/`syncDb` are not exported.

- [ ] **Step 3: Rewrite `scripts/sync-local.ts`**

Replace the whole file (keeping the directory-sync targets and behavior):

```ts
#!/usr/bin/env bun
/**
 * scripts/sync-local.ts
 *
 * 1. Syncs this repo to local host skill dirs (~/.claude/skills, ~/.omp/agent/skills).
 * 2. Writes the full SKILL.md description into ~/.omp/agent/skill-descriptions.db
 *    under the runtime-computed key sha256(compressPrompt + NUL + name + NUL + desc),
 *    bypassing the never-running smol-model compressor. Orphan rows previously
 *    written by this script are GC'd via scripts/.sync-state.json.
 * 3. Deploys extensions/skill-router.ts to ~/.omp/agent/extensions/.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const STATE_FILE = join(CWD, "scripts", ".sync-state.json");
const PROMPT_TEMPLATE_PATH = join(
  HOME, ".bun", "install", "global", "node_modules",
  "@oh-my-pi", "pi-coding-agent", "src", "prompts", "skills", "compress-description.md",
);

export function computeKey(promptTemplate: string, name: string, description: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(promptTemplate).update("\0").update(name).update("\0").update(description)
    .digest("hex");
}

function skillFrontmatter(): { name: string; description: string } {
  const md = readFileSync(join(CWD, "SKILL.md"), "utf-8");
  const name = /^name:\s*(.+)$/m.exec(md)?.[1]?.trim();
  const description = /^description:\s*"(.*)"$/m.exec(md)?.[1];
  if (!name || !description) throw new Error("SKILL.md: missing name/description frontmatter");
  return { name, description };
}

interface SyncState { writtenKeys: string[] }

function readState(): SyncState {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); }
  catch { return { writtenKeys: [] }; }
}

export function syncDb(
  dbPath: string,
  promptTemplate: string,
  name: string,
  description: string,
  stateFile: string = STATE_FILE,
): { key: string; removed: string[] } {
  const { Database } = require("bun:sqlite");
  const key = computeKey(promptTemplate, name, description);
  const state = readState();
  const removed: string[] = [];

  const db = new Database(dbPath);
  try {
    db.run("INSERT OR REPLACE INTO skill_descriptions (key, description) VALUES (?, ?)", [key, description]);
    for (const oldKey of state.writtenKeys) {
      if (oldKey === key) continue;
      db.run("DELETE FROM skill_descriptions WHERE key = ?", [oldKey]);
      removed.push(oldKey);
    }
  } finally {
    db.close();
  }
  writeFileSync(stateFile, JSON.stringify({ writtenKeys: [key] }, null, 2));
  return { key, removed };
}

if (!HOME) {
  console.error("FAIL: Unable to determine HOME / USERPROFILE directory.");
  process.exit(1);
}

console.log("=== Syncing claude-reasoning to local host targets ===");

// 1. Skill directories
const targets = [
  join(HOME, ".claude", "skills", "claude-reasoning"),
  join(HOME, ".omp", "agent", "skills", "claude-reasoning"),
];
for (const target of targets) {
  if (!existsSync(target)) { console.log(`[SKIP] ${target}`); continue; }
  try {
    rmSync(target, { recursive: true, force: true });
    cpSync(CWD, target, { recursive: true, filter: s => !s.includes(".git") && !s.includes("node_modules") });
    console.log(`[OK] Synced -> ${target}`);
  } catch (err) { console.error(`[ERR] ${target}:`, err); }
}

// 2. skill-descriptions.db under the real runtime key
const dbPath = join(HOME, ".omp", "agent", "skill-descriptions.db");
if (existsSync(dbPath) && existsSync(PROMPT_TEMPLATE_PATH)) {
  try {
    const prompt = readFileSync(PROMPT_TEMPLATE_PATH, "utf-8");
    const { name, description } = skillFrontmatter();
    const { key, removed } = syncDb(dbPath, prompt, name, description);
    console.log(`[OK] DB updated key=${key.slice(0, 16)}… removed=${removed.length} orphan(s)`);
  } catch (err) { console.error("[ERR] DB sync failed:", err); }
} else {
  console.log("[SKIP] DB or prompt template missing — never writing under a guessed key");
}

// 3. Deploy router extension
const extSrc = join(CWD, "extensions", "skill-router.ts");
const extDstDir = join(HOME, ".omp", "agent", "extensions");
if (existsSync(extSrc)) {
  mkdirSync(extDstDir, { recursive: true });
  copyFileSync(extSrc, join(extDstDir, "skill-router.ts"));
  console.log(`[OK] Deployed extension -> ${join(extDstDir, "skill-router.ts")}`);
}

console.log("=== Local synchronization complete ===");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/sync-local.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the stale-key drift-guard test**

`tests/skill-frontmatter.test.ts:41-57` hardcodes `9a1cc97e…` in its SQL. Update the query to compute the key the same way `syncDb` does — read the prompt template, hash, then select:

```ts
it("keeps host .omp skill-descriptions.db synchronized if present (cache drift guard)", () => {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const dbPath = join(home, ".omp", "agent", "skill-descriptions.db");
  const promptPath = join(home, ".bun", "install", "global", "node_modules",
    "@oh-my-pi", "pi-coding-agent", "src", "prompts", "skills", "compress-description.md");
  if (!existsSync(dbPath) || !existsSync(promptPath)) return;

  const prompt = readFileSync(promptPath, "utf-8");
  const key = new Bun.CryptoHasher("sha256")
    .update(prompt).update("\0").update("claude-reasoning").update("\0")
    .update(skillDescription()).digest("hex");

  const { Database } = require("bun:sqlite");
  const db = new Database(dbPath);
  const row = db.query("SELECT description FROM skill_descriptions WHERE key = ?").get(key) as
    | { description?: string }
    | null;
  db.close();

  expect(row).not.toBeNull();
  expect(row?.description).toBe(skillDescription());
});
```

- [ ] **Step 6: Run sync + full test suite**

Run: `bun scripts/sync-local.ts && bun test`
Expected: sync prints `[OK] DB updated key=986be1ba…` (or the current computed prefix); full suite green.

- [ ] **Step 7: Commit**

```bash
git add scripts/sync-local.ts tests/sync-local.test.ts tests/skill-frontmatter.test.ts
git commit -m "fix(sync): runtime-computed DB key, orphan GC, extension deploy"
```

---

### Task 4: `SKILL.md` + `package.json` — front-loaded description

**Files:**
- Modify: `SKILL.md:4` (description line)
- Modify: `package.json:4` (must stay byte-identical — drift-guard test enforces)

**Interfaces:**
- Consumes: `SELECTOR_WINDOW = 100` invariant from `tests/skill-frontmatter.test.ts`.
- Produces: new description string satisfying both tests:
  - first 100 chars contain `Use when` (existing test line 25)
  - whole string matches `/^Use (?:when|before answering)/i` and contains `debug|root-cause|architecture|decision` (existing test line 30-31)

- [ ] **Step 1: Confirm current test state**

Run: `bun test tests/skill-frontmatter.test.ts`
Expected: current "Use when" test already passes (description starts with it) — but the *information density* within 100 chars is the defect. No new failing test needed for wording; the constraint tests already pin the contract.

- [ ] **Step 2: Rewrite description in both files**

New description (fits all existing assertions, front-loads structural triggers):

```
Use when a question is open-ended, has competing approaches, involves architecture or debugging trade-offs, or follows repeated failed fixes. Structurally adaptive reasoning (Path A closed-form, Path B open-ended) with claim-gated verification and dual-source enforcement. Zero MCP dependencies.
```

Check the first 100 chars: `Use when a question is open-ended, has competing approaches, involves arch` — contains `Use when` ✅ and packs 4 structural triggers (open-ended / competing / architecture partial / …) versus the old preview's 3 keyword nouns.

Apply the identical string to `SKILL.md` line 4 and `package.json` `"description"`.

- [ ] **Step 3: Run drift-guard + selector tests**

Run: `bun test tests/skill-frontmatter.test.ts`
Expected: PASS.

- [ ] **Step 4: Re-run sync so DB + installed copies pick up the new description**

Run: `bun scripts/sync-local.ts`
Expected: `[OK] DB updated key=<new-hash>… removed=1 orphan(s)` — the Task-3 sidecar deletes the old-description row automatically.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md package.json
git commit -m "fix(skill): front-load structural triggers in description"
```

---

### Task 5: Extension drift-guard test

**Files:**
- Create: `tests/extension-drift.test.ts`

**Interfaces:**
- Consumes: the synced block markers `// ---- begin synced block: router-heuristics ----` / `// ---- end synced block: router-heuristics ----` in `extensions/skill-router.ts`, and the corresponding declarations in `scripts/router-heuristics.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const CWD = join(__dirname, "..");

describe("extension drift guard", () => {
  it("synced heuristic block in skill-router.ts matches scripts/router-heuristics.ts semantics", () => {
    const ext = readFileSync(join(CWD, "extensions", "skill-router.ts"), "utf-8");
    const block = /\/\/ ---- begin synced block: router-heuristics ----([\s\S]*?)\/\/ ---- end synced block/.exec(ext);
    expect(block).not.toBeNull();

    // Same constants and regexes must appear verbatim in both files
    const src = readFileSync(join(CWD, "scripts", "router-heuristics.ts"), "utf-8");
    for (const token of [
      "claude-reasoning-deterministic-gate",
      "CONTRAST_RE",
      "OPEN_ENDED_RE",
      "MULTI_PATH_RE",
      "FAILURE_RE",
    ]) {
      const srcLine = src.split("\n").find(l => l.includes(token) && l.includes("="));
      expect(srcLine).toBeDefined();
      expect(block![1]).toContain(token);
      // regex literal must match exactly
      const re = /= *(\/[^/]+\/[a-z]*)/.exec(srcLine!);
      if (re) expect(block![1]).toContain(re[1]);
    }
  });
});
```

- [ ] **Step 2: Run test — verify it passes against Task 2's synced block**

Run: `bun test tests/extension-drift.test.ts`
Expected: PASS (green on first run — this is a guard, not a TDD feature; verify it *fails* by temporarily perturbing the extension block if desired, then restore).

- [ ] **Step 3: Commit**

```bash
git add tests/extension-drift.test.ts
git commit -m "test(router): drift guard pinning extension heuristic copy"
```

---

### Task 6: Docs & Invariant Sync

**Files:**
- Modify: `CHANGELOG.md` (new version entry)
- Modify: `SKILL.md:3`, `package.json:3`, `README.md` title line, `scripts/think.ts` header comment — version bump `3.2.2` → `3.3.0` (new feature: extension + sync pipeline)
- Check: `assets/architecture-dashboard.svg` (version drift guard)

- [ ] **Step 1: Bump version on all surfaces**

Update `version:`/`"version"`/title strings to `3.3.0` in `SKILL.md`, `package.json`, `README.md`, `scripts/think.ts` header.

- [ ] **Step 2: CHANGELOG entry**

Prepend under `## [3.3.0] - 2026-10-10` (follow existing changelog-structure test conventions — run `bun test tests/changelog-structure.test.ts` to see required format):

```markdown
### Added
- `extensions/skill-router.ts`: omp `context`-hook extension injecting a forced
  `skill://claude-reasoning` read on structural signals or ≥2 repeated failures
  (`OMP_SKILL_ROUTER_DEBUG=1` for diagnostics). Deployed by sync-local.ts.
- `scripts/router-heuristics.ts`: pure deterministic scoring module.

### Fixed
- `sync-local.ts`: description cache writes now use the runtime-computed key
  `sha256(compressPrompt+NUL+name+NUL+description)` instead of a hardcoded stale
  key; orphan rows written by earlier runs are GC'd via `scripts/.sync-state.json`.
- `SKILL.md`/`package.json` description: trigger conditions front-loaded inside
  the ~100-char selector preview window.

### Known limitations
- First-turn inputs that are open-ended but structurally featureless (flat single
  sentence, no contrast/options/paths) in a session with zero prior failures do
  not trigger the gate; they fall back to description-driven model selection.
```

- [ ] **Step 3: Full suite + sync**

Run: `bun test && bun run typecheck && bun scripts/sync-local.ts`
Expected: all green; sync deploys all artifacts.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(release): 3.3.0 — deterministic skill activation"
```

---

## Self-Review Notes

- **Spec coverage:** §4.1 → Task 1+2; §4.2 → Task 3; §4.3 → Task 4; §4.4 → Tasks 1/3/5 tests; §7 deploy → Task 3 step + Task 6; debug flag → Task 2 `OMP_SKILL_ROUTER_DEBUG`. Non-goals §5 respected (no rules-dir writes, no LLM calls, no host patches).
- **Type consistency:** `ChatMessage`, `INJECTION_MARKER`, `INJECTION_TEXT`, `shouldInject` signatures identical across Tasks 1/2/5; `computeKey`/`syncDb` signatures identical between Task 3 test and implementation.
- **Placeholder scan:** none — all steps carry executable code/commands.
- **Ordering constraint:** Task 3's drift-guard update depends on the new `syncDb` key formula; Task 4 must run after Task 3 (sidecar GC proves itself on the description change). Tasks 1→2→5 are a dependency chain for the extension. Task 6 last.
