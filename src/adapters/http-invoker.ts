// src/adapters/http-invoker.ts
import type { LlmInvoker } from "../kernel/invoker.js";

export interface HttpInvokerConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  responseFormat?: "json_object" | "text";
}

/** Production adapter: any OpenAI-compatible chat-completions endpoint. Offline tests never construct this. */
export class HttpInvoker implements LlmInvoker {
  constructor(private readonly config: HttpInvokerConfig) {}

  async invoke(messages: { system: string; user: string }[]): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;

    // Construct OpenAI-compatible messages without dropping prior user turns or duplicating system turns blindly
    const apiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    const initialSystem = messages[0]?.system;
    if (initialSystem) {
      apiMessages.push({ role: "system", content: initialSystem });
    }
    for (const m of messages) {
      if (m.user) {
        apiMessages.push({ role: "user", content: m.user });
      }
    }

    const payload: Record<string, unknown> = {
      model: this.config.model,
      messages: apiMessages,
    };
    if (this.config.temperature !== undefined) {
      payload.temperature = this.config.temperature;
    }
    if (this.config.responseFormat === "json_object") {
      payload.response_format = { type: "json_object" };
    }

    let res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // Fallback if the endpoint rejects response_format (e.g. 400 Bad Request)
    if (!res.ok && res.status === 400 && payload.response_format) {
      delete payload.response_format;
      res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      throw new Error(`HttpInvoker: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
