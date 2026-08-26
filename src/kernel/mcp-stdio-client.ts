import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

export interface MCPStdioClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface JSONRPCResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: TResult;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export class MCPStdioClient {
  private readonly options: Required<Pick<MCPStdioClientOptions, 'args' | 'timeout'>> & MCPStdioClientOptions;
  private process?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private nextId = 0;
  private readonly pending = new Map<number | string, PendingRequest>();
  private stderr = '';
  private fatalError?: Error;
  private closePromise?: Promise<void>;
  private closed = false;

  public constructor(options: MCPStdioClientOptions) {
    if (!options.command) throw new Error('MCP command is required');
    this.options = { ...options, args: options.args ?? [], timeout: options.timeout ?? 30_000 };
  }

  /** The most recently allocated request ID, useful for diagnostics and tests. */
  public get nextRequestId(): number {
    return this.nextId;
  }

  public async initialize(): Promise<unknown> {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cr-reasoning-v2', version: '2.0.0' },
    });
    await this.notify('notifications/initialized');
    return result;
  }

  public listTools(): Promise<unknown> {
    return this.request('tools/list');
  }

  public callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  public request<TResult = unknown>(method: string, params?: unknown, timeout = this.options.timeout): Promise<TResult> {
    if (this.closed) return Promise.reject(new Error('MCP client is closed'));
    if (this.fatalError) return Promise.reject(this.fatalError);
    this.ensureProcess();
    const id = ++this.nextId;
    const message = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`MCP request ${method} (${id}) timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.process!.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        this.rejectRequest(id, this.asError(error));
      }
    });
  }

  public async notify(method: string, params?: unknown): Promise<void> {
    if (this.closed) throw new Error('MCP client is closed');
    if (this.fatalError) throw this.fatalError;
    this.ensureProcess();
    const message = { jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) };
    this.process!.stdin.write(`${JSON.stringify(message)}\n`);
  }

  public close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = new Promise<void>((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }
      const child = this.process;
      const finish = () => {
        this.lines?.close();
        this.lines = undefined;
        this.process = undefined;
        resolve();
      };
      child.once('close', finish);
      child.stdin.destroy();
      child.kill();
      // A process that has already exited may not emit another close event.
      if (child.exitCode !== null || child.signalCode !== null) finish();
    });
    this.rejectAll(new Error('MCP client closed'));
    return this.closePromise;
  }

  private ensureProcess(): void {
    if (this.process) return;
    if (this.closed) throw new Error('MCP client is closed');
    const env = this.options.env ? { ...process.env, ...this.options.env } : process.env;
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk: Buffer | string) => {
      this.stderr += chunk.toString();
    });
    child.once('error', (error) => this.fail(new Error(`MCP server process error: ${error.message}`)));
    child.once('close', (code, signal) => {
      if (this.closed) return;
      const detail = this.stderr.trim();
      const suffix = detail ? `: ${detail}` : '';
      this.fail(new Error(`MCP server exited${code === null ? ` by ${signal ?? 'signal'}` : ` with code ${code}`}${suffix}`));
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let response: JSONRPCResponse;
    try {
      response = JSON.parse(line) as JSONRPCResponse;
    } catch {
      this.fail(new Error(`Malformed MCP JSON-RPC response: ${line}`));
      return;
    }
    if (response.id === undefined || response.id === null) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (response.error) {
      pending.reject(new Error(`MCP error ${response.error.code}: ${response.error.message}`));
    } else if ('result' in response) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error('Malformed MCP JSON-RPC response: missing result or error'));
    }
  }

  private fail(error: Error): void {
    if (this.fatalError) return;
    this.fatalError = error;
    this.rejectAll(error);
  }

  private rejectRequest(id: number | string, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export default MCPStdioClient;
