// test/mocks/fixture-script.ts
// Fixture script builder for regression scenarios.
//
// MockLlmInvoker is first-match-wins on an unordered object, but the scenario
// tests need *staged* answers: e.g. the critique says "framing defect" once,
// then "no revision" on the replay. This invoker consumes a per-stage queue
// instead, and records every call so tests can assert which stages actually
// re-ran.
import type { LlmInvoker } from "../../src/kernel/invoker.js";

export interface FixtureInvoker {
  invoke(messages: Array<{ system: string; user: string }>): Promise<string>;
  /** Stage tags in call order, e.g. ["c0", "stage-0", "stage-1", ...]. */
  readonly calls: string[];
}

function stageTagOf(user: string): string {
  const match = /\[STAGE:([^\]]+)\]/.exec(user);
  if (!match) throw new Error(`fixture script: user message has no [STAGE:…] tag: ${user.slice(0, 120)}`);
  return match[1];
}

/**
 * `script` maps a stage tag to a queue of payloads. Each call with that tag
 * shifts the next payload; exhausting a queue repeats the last one, which keeps
 * long happy-path tails from needing a line per call.
 */
export function scriptInvoker(script: Record<string, string[]>): FixtureInvoker {
  const queues = new Map<string, string[]>(
    Object.entries(script).map(([stage, payloads]) => [stage, [...payloads]])
  );
  const calls: string[] = [];

  return {
    calls,
    invoke(messages) {
      const stage = stageTagOf(messages[messages.length - 1].user);
      calls.push(stage);
      const queue = queues.get(stage);
      if (!queue || queue.length === 0) {
        throw new Error(`fixture script: no payload left for stage ${stage} (call #${calls.length})`);
      }
      return Promise.resolve(queue.length === 1 ? queue[0] : (queue.shift() as string));
    },
  };
}
