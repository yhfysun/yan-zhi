// 后端原生 stdio MCP 客户端 —— child_process + JSON-RPC over stdin/stdout
//
// 为什么不用 core 的 McpClient 走 PlatformAdapter.mcp：
//  McpClient.connectStdio() 只调 adapter.mcp.start() 就返回，既没发 initialize 握手，
// 又把 start() 返回的 childId 丢了、后续 call()/kill() 用 server.id 当 key，
//  导致 stdio 传输实际不可用（unknown childId）。后端这里直接自己管进程。
import { spawn, type ChildProcess } from 'node:child_process';
import type { McpServer, McpTool } from '@yan-zhi/shared';
import { serverState } from '../state.js';

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RPC_TIMEOUT = 60000;
const CONNECT_TIMEOUT = 30000;

export class StdioMcpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buf = '';
  private exited = false;

  constructor(private server: McpServer) {}

  get isConnected(): boolean {
    return !!this.child && !this.exited;
  }

  async connect(): Promise<void> {
    if (this.child) return;
    if (!this.server.command) throw new Error('stdio 传输需要 command');

    const child = spawn(this.server.command, this.server.args || [], {
      env: { ...process.env, ...(this.server.env || {}) },
      cwd: serverState.workspaceDir || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    this.child = child;
    this.exited = false;

    child.stdout?.on('data', (chunk: Buffer) => this.onStdout(chunk));
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      if (text) console.error(`[mcp:stdio:${this.server.id}] ${text}`);
    });
    child.on('error', (err) => this.failAll(new Error(`MCP 进程启动失败: ${err.message}`)));
    child.on('exit', (code, signal) => {
      this.exited = true;
      this.failAll(new Error(`MCP 进程退出 (code=${code} signal=${signal})`));
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'yan-zhi-server', version: '0.1.0' },
    }, CONNECT_TIMEOUT);
    await this.notify('notifications/initialized', {});
  }

  private onStdout(chunk: Buffer) {
    this.buf += chunk.toString('utf-8');
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; } // 非 JSON 行（日志）忽略
      if (msg.id === undefined) continue; // 通知类消息
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || 'MCP JSON-RPC error'));
      else p.resolve(msg.result);
    }
  }

  private failAll(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private notify(method: string, params: unknown): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params: params ?? null });
    try { this.child?.stdin?.write(msg + '\n'); } catch {}
  }

  private request(method: string, params: unknown, timeoutMs = RPC_TIMEOUT): Promise<any> {
    if (!this.child || this.exited) throw new Error('MCP 进程未运行');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP 调用超时(${timeoutMs / 1000}s): ${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? null }) + '\n');
      } catch (e: any) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`MCP 写入失败: ${e?.message || e}`));
      }
    });
  }

  async listTools(): Promise<McpTool[]> {
    const r = await this.request('tools/list', {});
    return (r?.tools || []).map((t: any) => ({
      id: `${this.server.id}:${t.name}`,
      mcpServerId: this.server.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    return await this.request('tools/call', { name, arguments: args || {} }) as McpCallResult;
  }

  async listResources(): Promise<any[]> {
    const r = await this.request('resources/list', {});
    return r?.resources || [];
  }

  async readResource(uri: string): Promise<any[]> {
    const r = await this.request('resources/read', { uri });
    return r?.contents || [];
  }

  async disconnect(): Promise<void> {
    this.failAll(new Error('MCP 连接已关闭'));
    this.child?.stdin?.end();
    try { this.child?.kill(); } catch {}
    this.child = null;
  }
}
