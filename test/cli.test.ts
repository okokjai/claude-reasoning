import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const cli = join(process.cwd(), 'dist', 'src', 'cli.js');
const directories: string[] = [];

const runCli = async (...args: string[]) => {
  try {
    const result = await run(process.execPath, [cli, ...args], { cwd: process.cwd() });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('CLI smoke tests', () => {
  test('loads the explicitly supplied config path and emits JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cr-reasoning-cli-'));
    directories.push(directory);
    const config = join(directory, 'custom.yaml');
    await writeFile(config, 'version: "2.0"\nparadigm: cot\n', 'utf8');

    const result = await runCli('--config', config, '--question', 'config path smoke', '--mode', 'skeleton', '--json');

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.paradigm).toBe('cot');
    expect(output.p0_passed).toBe(true);
  });

  test('returns a nonzero exit code when a full run fails a P0 gate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cr-reasoning-cli-'));
    directories.push(directory);
    const config = join(directory, 'unavailable.yaml');
    await writeFile(config, [
      'version: "2.0"',
      'paradigm: cot',
      'mcp_servers:',
      '  unified-fetch:',
      '    command: command-that-does-not-exist-cr-reasoning',
    ].join('\n'), 'utf8');

    const result = await runCli('--config', config, '--question', 'P0 failure smoke', '--mode', 'full', '--json');

    expect(result.code).not.toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.p0_passed).toBe(false);
    expect(output.stage_outputs.S3.evidence_quality).toBe('Insufficient');
  });

  test('runs full execution through an injected MCP server and reports its evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cr-reasoning-cli-'));
    directories.push(directory);
    const server = join(directory, 'fake-server.cjs');
    await writeFile(server, `
      const readline = require('node:readline');
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', (line) => {
        const request = JSON.parse(line);
        if (request.method === 'notifications/initialized') return;
        let result;
        if (request.method === 'initialize') {
          result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'cli-fake', version: '1' } };
        } else if (request.method === 'tools/call') {
          const args = request.params.arguments || {};
          if (request.params.name === 'search') {
            const negative = args.query.includes('limitations') || args.query.includes('drawbacks');
            result = { content: [{ type: 'text', text: JSON.stringify([{ url: 'https://cli.test/' + (negative ? 'limitations' : 'evidence'), title: 'CLI evidence', snippet: 'verified', source_engine: 'fake' }]) }] };
          } else if (request.params.name === 'scrape') {
            result = { content: [{ type: 'text', text: JSON.stringify({ url: args.url, title: 'CLI page', content: 'verified', content_ok: true, engine_used: 'fake' }) }] };
          } else {
            result = { content: [{ type: 'text', text: JSON.stringify({ available: true }) }] };
          }
        } else {
          result = { tools: [] };
        }
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
      });
    `, 'utf8');
    const config = join(directory, 'fake.yaml');
    await writeFile(config, [
      'version: "2.0"',
      'paradigm: cot',
      'mcp_servers:',
      '  unified-fetch:',
      `    command: ${JSON.stringify(process.execPath.replaceAll('\\', '/'))}`,
      `    args: [${JSON.stringify(server.replaceAll('\\', '/'))}]`,
    ].join('\n'), 'utf8');

    const result = await runCli('--config', config, '--question', 'injected MCP smoke', '--mode', 'full', '--json');

    expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.p0_passed).toBe(false);
    expect(output.stage_outputs.S3.citations[0].url).toBe('https://cli.test/evidence');
  });
});
