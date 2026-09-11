// src/adapters/http-invoker.ts
import type { LlmInvoker } from "../kernel/invoker.js";

export interface HttpInvokerConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

/** Production adapter: any OpenAI-compatible chat-completions endpoint. Offline tests never construct this. */
export class HttpInvoker implements LlmInvoker {
  constructor(private readonly config: HttpInvokerConfig) {}

  async invoke(messages: { system: string; user: string }[]): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({ role: "system", content: m.system })).concat({
          role: "user",
          content: messages[messages.length - 1]?.user ?? "",
        }),
      }),
    });
    if (!res.ok) {
      throw new Error(`HttpInvoker: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
