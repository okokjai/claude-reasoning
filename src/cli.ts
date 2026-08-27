#!/usr/bin/env node
import { loadConfig } from './kernel/config-loader';
import { createExecutor, ExecuteMode, PipelineResult } from './kernel/executor';

interface CliOptions {
  config?: string;
  question?: string;
  mode: ExecuteMode;
  json: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { mode: 'full', json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config' || arg === '-c') options.config = args[++index];
    else if (arg === '--question' || arg === '-q') options.question = args[++index];
    else if (arg === '--mode') {
      const mode = args[++index];
      if (mode !== 'full' && mode !== 'skeleton') throw new Error(`Invalid mode: ${mode}`);
      options.mode = mode;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: cr-reasoning --question <text> [--config <path>] [--mode full|skeleton] [--json]\n');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.question) throw new Error('A question is required (--question)');
  return options;
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(args);
    const executor = createExecutor(loadConfig(options.config));
    try {
      const result = await executor.run(
        { question: options.question! },
        options.mode,
      );
      const output = JSON.stringify(result, null, options.json ? 2 : 0);
      process.stdout.write(`${output}\n`);
      return result.p0_passed ? 0 : 1;
    } finally {
      await executor.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

if (require.main === module) {
  runCli().then((code) => { process.exitCode = code; });
}
