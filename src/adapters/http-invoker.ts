// src/adapters/http-invoker.ts
import type { LlmInvoker } from "../kernel/invoker.js";

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
