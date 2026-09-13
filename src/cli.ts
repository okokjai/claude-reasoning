#!/usr/bin/env node
// src/cli.ts — claude-reasoning (spec §10.2). `cr-reasoning` is a bin alias.
//   claude-reasoning run "<q>" [--mode m] [--json] [--config config.yaml]
//   claude-reasoning resume <thread_id> --input "<t>" [--json]
import { reason, resume } from "./kernel/executor.js";
import { resolveInvoker, resolveDbPath } from "./adapters/invoker-resolver.js";
import { resolveToolAdapter } from "./adapters/tool-adapter-resolver.js";
import type { PrimaryMode } from "./kernel/types.js";

const MODES: readonly PrimaryMode[] = ["decision", "design", "diagnostic", "innovation", "optimization"];

/** Parsed flags; a bare `--flag` (no value) records `true`. */
type CliArgs = Record<string, string | true> & { json?: boolean };

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
      i++;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      out[key] = argv[i + 1] ?? "";
      i += 2;
    } else {
      out.positional = arg;
      i++;
    }
  }
  return out;
}

function stringArg(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function fail(message: string): never {
  console.error(`claude-reasoning: ${message}`);
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "--help" || command === "-h" || command === "help") {
    console.log(`claude-reasoning CLI (v2.0.0)

Usage:
  claude-reasoning run "<question>" [--mode m] [--json] [--config config.yaml]
  claude-reasoning resume <thread_id> --input "<text>" [--json]

Options:
  --mode <m>       Reasoning mode: decision (default), design, diagnostic, innovation, optimization
  --json           Output result as JSON with threadId and state
  --config <path>  YAML config file path (default: ./config.yaml or CR_REASONING_CONFIG)
  --threadId <id>  Custom session/thread identifier
`);
    return;
  }

  if (command !== "run" && command !== "resume") {
    fail(`unknown command ${JSON.stringify(command)}; expected "run", "resume", or "--help"`);
  }
  const invoker = await resolveInvoker(stringArg(args, "config"));
  const toolAdapter = await resolveToolAdapter();
  const dbPath = resolveDbPath();

  if (command === "run") {
    const question = stringArg(args, "positional");
    if (!question) fail('usage: claude-reasoning run "<question>" [--mode m] [--json]');
    const mode = stringArg(args, "mode") ?? "decision";
    if (!MODES.includes(mode as PrimaryMode)) {
      fail(`invalid --mode ${JSON.stringify(mode)}; expected one of: ${MODES.join(", ")}`);
    }
    const { threadId, state } = await reason(question, {
      dbPath,
      invoker,
      toolAdapter,
      threadId: stringArg(args, "threadId"),
      mode: mode as PrimaryMode,
    });
    if (args.json) {
      console.log(JSON.stringify({ threadId, state }));
    } else {
      console.log(`thread: ${threadId}`);
      console.log(state.conclusion_card ?? "(interrupted: clarification needed — run `claude-reasoning resume <threadId> --input \"<answer>\"`)");
    }
    return;
  }

  // resume
  const threadId = stringArg(args, "positional");
  if (!threadId) fail("usage: claude-reasoning resume <thread_id> --input \"<text>\" [--json]");
  const input = stringArg(args, "input");
  const { state } = await resume(threadId, input, { dbPath, invoker, toolAdapter });
  if (args.json) {
    console.log(JSON.stringify({ threadId, state }));
  } else {
    console.log(state.conclusion_card ?? "(interrupted: clarification needed — run `claude-reasoning resume <threadId> --input \"<answer>\"`)");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
