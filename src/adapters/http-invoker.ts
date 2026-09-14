// src/adapters/http-invoker.ts
import { z } from "zod";
import type { LlmInvoker } from "../kernel/invoker.js";
import { SchemaViolationError } from "../kernel/invoker.js";
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
  // Force JSON output: structured stages parse strict JSON; endpoints that reject
  // response_format fall back below via the existing 400-retry path.
  if (config.responseFormat === undefined) payload.response_format = { type: "json_object" };
  return { url: `${config.baseUrl}/chat/completions`, init: { method: "POST", headers, body: JSON.stringify(payload) } };
}

const AnthropicReply = z.object({
  content: z.array(z.object({ text: z.string().optional() }).passthrough()).min(1).optional(),
});
const OpenAIReply = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().optional() }).passthrough() })).min(1).optional(),
});

export function extractReply(data: unknown, protocol: "anthropic" | "openai"): string {
  let reply = "";
  if (protocol === "anthropic") {
    // content[] may carry non-text blocks (e.g. type:"thinking"); take the first text block.
    const parsed = AnthropicReply.safeParse(data);
    const textBlock = parsed.success ? parsed.data.content?.find((b) => typeof b.text === "string") : undefined;
    reply = textBlock?.text ?? "";
  } else {
    const parsed = OpenAIReply.safeParse(data);
    reply = parsed.success ? parsed.data.choices?.[0]?.message?.content ?? "" : "";
  }
  // Fail loud: an empty/whitespace reply (truncated or blocked completion) must not
  // silently become a strictParse "Unexpected end of JSON input" two layers up.
  if (reply.trim() === "") {
    throw new SchemaViolationError("HttpInvoker: empty reply from LLM endpoint", "");
  }
  return reply;
}

/** Production adapter: an OpenAI-compatible or Anthropic-protocol endpoint. Offline tests never construct this. */
export class HttpInvoker implements LlmInvoker {
  constructor(private readonly config: HttpInvokerConfig) {}

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
}
