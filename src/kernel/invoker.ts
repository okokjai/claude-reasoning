// src/kernel/invoker.ts
import { z } from "zod";

/** LLMs are strictly passive: the engine owns every prompt and parses every response. */
export interface LlmInvoker {
  invoke(messages: { system: string; user: string }[]): Promise<string>;
}

export class SchemaViolationError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "SchemaViolationError";
    this.raw = raw;
  }
}

/** Extract the first balanced `{...}` block, tolerating braces inside strings. */
function extractJsonObject(raw: string): string | undefined {
  const start = raw.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Strip ``` fences if the whole payload (or the extracted block) is fenced. */
function stripFences(text: string): string {
  return text.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Fail-loud ACL: every parse/validate failure throws SchemaViolationError with
 * the raw LLM output attached. Callers may retry at most once, then must fail.
 */
export function strictParse<T>(raw: string, schema: { parse(data: unknown): T }): T {
  let candidate = stripFences(raw.trim());
  const block = extractJsonObject(candidate);
  if (block !== undefined) candidate = block;
  candidate = removeTrailingCommas(candidate);
  try {
    return schema.parse(JSON.parse(candidate));
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(err);
    throw new SchemaViolationError(`strictParse failed: ${detail}`, raw);
  }
}
