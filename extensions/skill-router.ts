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

interface ExtensionAPI {
  on(event: "context", handler: (event: { messages?: unknown[] }) => Promise<{ messages?: unknown[] } | void>): void;
}

// ---- begin synced block: router-heuristics ----
interface ChatMessage { role: string; content?: unknown }
const INJECTION_MARKER = "claude-reasoning-deterministic-gate";
const INJECTION_TEXT =
  `[${INJECTION_MARKER}] This session has hit signals that warrant ` +
  `structured reasoning (open-ended structure or repeated failed attempts). ` +
  `MUST read skill://claude-reasoning before further analysis or edits. ` +
  `Skip only if the task is trivially closed-form.`;
const CONTRAST_RE = /\b(?:vs\.?|versus)\b|(?:\b\w+\b\s+or\s+\b\w+\b)|[比較對比]|哪個|哪一種|該選|怎麼挑|A\s*跟\s*B/i;
const OPEN_ENDED_RE = /\b(?:why|how should|which|trade.?offs?|pros and cons|root.?cause|debug|bug|crash(?:ed)?)\b|如何|該|為什麼|有什麼(?:問題|風險|優缺點)/i;
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
