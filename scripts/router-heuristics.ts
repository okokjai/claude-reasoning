/**
 * scripts/router-heuristics.ts
 *
 * Explicit-only activation for the claude-reasoning skill.
 *
 * The gate holds exactly one rule: inject the directive only when the user's
 * own last message explicitly names the skill. Every heuristic trigger
 * (contrast shapes, open-ended phrasing, failure bursts, dotted-token
 * scanning) was removed — those guesses fired on ordinary work, and because
 * the runtime never persists a `context`-hook injection, any "already
 * injected" memory built from transcript scanning was unreachable anyway.
 *
 * No I/O, no model calls — unit-testable in isolation.
 */

export interface ChatMessage {
  role: string;
  content?: unknown;
}

export const INJECTION_MARKER = "claude-reasoning-deterministic-gate";

export const INJECTION_TEXT =
  `[${INJECTION_MARKER}] You asked for the claude-reasoning skill. ` +
  `MUST read skill://claude-reasoning before analysis or edits.`;

/**
 * Matches an opting-in request: the skill name (hyphen / underscore / space)
 * preceded by a verb that asks for it, or a direct `skill://` reference.
 * A bare mention ("this skill is noisy") is not a designation.
 */
export const EXPLICIT_REQUEST_RE =
  /(?:(?:use|run|invoke|read|load|apply|activate|enable|switch\s+to|指定|使用|啟用|改用|套用|載入|讀取|用)\s*(?:the\s+)?(?:skill\s+)?(?:claude[-_ ]reasoning|skill:\/\/claude-reasoning))|(?:skill:\/\/claude-reasoning)/i;

/** Complaint/negation adjacent to the skill name vetoes the match:
 *  "老是用claude reasoning skill !?" is an accusation, not a designation. */
const NEGATION_RE =
  /(?:不再|不要|不用|別|勿|老是|總是|never|don'?t|stop|avoid|remove|disable|uninstall|討厭|煩|吵|關掉|關閉)\s*[^，。！？!.,;:]{0,8}(?:claude[-_ ]reasoning|skill)/i;

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

/**
 * The last user turn, skipping the gate's own injected directive so the
 * directive can never be mistaken for a new user request.
 */
export function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const t = messageText(messages[i]);
    if (t.includes(INJECTION_MARKER)) continue;
    return t;
  }
  return "";
}

export function shouldInject(messages: ChatMessage[]): { inject: boolean; reason: string } {
  const text = lastUserText(messages);
  if (!text) return { inject: false, reason: "no user turn" };
  if (!EXPLICIT_REQUEST_RE.test(text) || NEGATION_RE.test(text))
    return { inject: false, reason: "user did not request claude-reasoning" };

  // Idempotency when the directive IS in the transcript (e.g. tests, or a
  // persisted copy). The runtime latch lives in extensions/skill-router.ts.
  const alreadyPresent = messages.some(m => messageText(m).includes(INJECTION_MARKER));
  if (alreadyPresent) return { inject: false, reason: "directive already in context" };

  return { inject: true, reason: "user explicitly requested claude-reasoning" };
}
