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
const OPEN_ENDED_RE = /\b(?:why|how should|which|trade.?offs?|pros and cons|root.?cause|debug|bug|crash(?:ed)?)\b|如何|該|為什麼|有什麼(?:問題|風險|優缺點)/i;
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
