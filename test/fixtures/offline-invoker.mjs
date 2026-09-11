// test/fixtures/offline-invoker.mjs
// Offline invoker for entry-point tests. `cli.ts`/`mcp.ts` load their invoker
// from this module when CR_REASONING_INVOKER_MODULE is set, which keeps the
// production adapters (HTTP, credentialed) out of the test process entirely —
// no network, no API keys, same guarantee as the in-process MockLlmInvoker.
//
// Speaks the `mock-invoker.v1` protocol: each fixture line is `<match>\t<json>`,
// first substring hit on the user message wins.
import { readFileSync } from "node:fs";

export class FixtureInvoker {
  constructor(fixtures) {
    this.fixtures = fixtures;
  }

  invoke(messages) {
    const user = messages[messages.length - 1]?.user ?? "";
    const key = Object.keys(this.fixtures).find((k) => user.includes(k));
    if (key === undefined) {
      return Promise.reject(
        new Error(`FixtureInvoker: no fixture matches user message (first 80 chars: ${JSON.stringify(user.slice(0, 80))})`)
      );
    }
    return Promise.resolve(this.fixtures[key]);
  }
}

export function createInvoker(env) {
  const path = env.CR_REASONING_FIXTURES;
  if (!path) throw new Error("fixture invoker: CR_REASONING_FIXTURES is required");
  const fixtures = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    fixtures[line.slice(0, tab)] = line.slice(tab + 1);
  }
  return new FixtureInvoker(fixtures);
}
