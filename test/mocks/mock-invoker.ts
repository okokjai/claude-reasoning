// test/mocks/mock-invoker.ts
import type { LlmInvoker } from "../../src/kernel/invoker.js";

export class MockLlmInvoker implements LlmInvoker {
  constructor(private readonly fixtures: Record<string, string>) {}

  invoke(messages: { system: string; user: string }[]): Promise<string> {
    const user = messages[messages.length - 1]?.user ?? "";
    const key = Object.keys(this.fixtures).find((k) => user.includes(k));
    if (key === undefined) {
      return Promise.reject(
        new Error(`MockLlmInvoker: no fixture matches user message (first 80 chars: ${JSON.stringify(user.slice(0, 80))})`)
      );
    }
    return Promise.resolve(this.fixtures[key]);
  }
}
