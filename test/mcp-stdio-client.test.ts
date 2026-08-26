import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCPStdioClient } from '../src/kernel/mcp-stdio-client';

const serverSource = String.raw`
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
process.stderr.write('fake-server-started\n');
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  if (request.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {
      protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1.0' }
    } }) + '\n');
  } else if (request.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'add', description: 'adds', inputSchema: { type: 'object' } }] } }) + '\n');
  } else if (request.method === 'tools/call') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(request.params) }] } }) + '\n');
  } else if (request.method === 'slow') {
    setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true } }) + '\\n'), 250);
  } else if (request.method === 'malformed') {
    process.stdout.write('not-json\\n');
  } else if (request.method === 'server-error') {
    process.stderr.write('server exploded\\n');
    process.exit(23);
  } else if (request.method === 'exit') {
    process.exit(17);
  }
});
`;

let directory: string;
let command: string;
let args: string[];

let activeClients: MCPStdioClient[] = [];

beforeEach(async () => {
  activeClients = [];
  directory = await mkdtemp(join(tmpdir(), 'mcp-stdio-client-'));
  const server = join(directory, 'fake-server.cjs');
  await writeFile(server, serverSource, 'utf8');
  command = process.execPath;
  args = [server];
});

afterEach(async () => {
  await Promise.all(activeClients.map((mcp) => mcp.close()));
  await rm(directory, { recursive: true, force: true });
});

function client(timeout = 1000) {
  const mcp = new MCPStdioClient({ command, args, cwd: directory, timeout });
  activeClients.push(mcp);
  return mcp;
}

describe('MCPStdioClient', () => {
  test('initializes and sends initialized notification', async () => {
    const mcp = client();
    await expect(mcp.initialize()).resolves.toMatchObject({ protocolVersion: '2024-11-05' });
    await mcp.close();
  });

  test('lists tools and calls a tool over JSON-RPC lines', async () => {
    const mcp = client();
    await mcp.initialize();
    await expect(mcp.listTools()).resolves.toEqual({ tools: [{ name: 'add', description: 'adds', inputSchema: { type: 'object' } }] });
    await expect(mcp.callTool('add', { a: 1, b: 2 })).resolves.toEqual({ content: [{ type: 'text', text: JSON.stringify({ name: 'add', arguments: { a: 1, b: 2 } }) }] });
    await mcp.close();
  });

  test('uses unique request IDs for concurrent requests', async () => {
    const mcp = client();
    await mcp.initialize();
    const [one, two] = await Promise.all([mcp.request('tools/list'), mcp.request('tools/list')]);
    expect(one).toEqual(two);
    expect(mcp.nextRequestId).toBe(3);
    await mcp.close();
  });

  test('times out an unresponsive request', async () => {
    const mcp = client();
    await mcp.initialize();
    await expect(mcp.request('slow', undefined, 30)).rejects.toThrow(/timed out/i);
    await mcp.close();
  });

  test('rejects malformed JSON responses', async () => {
    const mcp = client();
    await mcp.initialize();
    await expect(mcp.request('malformed')).rejects.toThrow(/malformed/i);
    await mcp.close();
  });

  test('surfaces server stderr and exit as request failure', async () => {
    const mcp = client();
    await mcp.initialize();
    await expect(mcp.request('server-error')).rejects.toThrow(/server exploded|exit/i);
    await expect(mcp.request('tools/list')).rejects.toThrow(/closed|exit|server exploded/i);
  });

  test('rejects pending requests when the process exits and close is idempotent', async () => {
    const mcp = client();
    await mcp.initialize();
    await expect(mcp.request('exit')).rejects.toThrow(/exit/i);
    await expect(mcp.close()).resolves.toBeUndefined();
    await expect(mcp.close()).resolves.toBeUndefined();
  });
});
