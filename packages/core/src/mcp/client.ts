// MCP 客户端 - 完整 SSE + Streamable HTTP 实现
import type { McpServer, McpTool } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../platform/types';

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface PendingEvent {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const SSE_CONNECT_TIMEOUT = 30000;
const MCP_RPC_TIMEOUT = 60000;

/** MCP 标准协议客户端 */
export class McpClient {
  private connected = false;
  private sseUrl: string | null = null;
  private postUrl: string | null = null;
  private eventId = 0;
  private pending = new Map<string | number, PendingEvent>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private abortController: AbortController | null = null;

  constructor(private server: McpServer) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    switch (this.server.transport) {
      case 'stdio': await this.connectStdio(); break;
      case 'sse':   await this.connectSse();   break;
      case 'http':  await this.connectHttp();  break;
    }
    this.connected = true;
  }

  private async connectStdio(): Promise<void> {
    const adapter = getPlatformAdapter();
    if (!adapter.mcp) throw new Error('stdio 仅桌面端');
    if (!this.server.command) throw new Error('stdio 需要 command');
    await adapter.mcp.start(this.server.command, this.server.args || [], this.server.env || {});
  }

  // ---- SSE ----
  private async connectSse(): Promise<void> {
    this.sseUrl = this.server.url!.replace(/\/$/, '');
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const fetchHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      ...(this.server.headers || {}),
    };

    const res = await fetch(this.sseUrl, { headers: fetchHeaders, signal, mode: 'cors' });
    if (!res.ok) throw new Error(`SSE GET ${this.sseUrl} 返回 HTTP ${res.status}`);
    if (!res.body) throw new Error('SSE 无响应体（可能被 CORS 拦截）');

    this.reader = res.body.getReader();

    // 读取 endpoint 事件，最多等 10 秒；没有就用 SSE URL
    let endpoint: string;
    try {
      endpoint = await this.waitForEndpoint(10000);
    } catch {
      endpoint = this.sseUrl;
    }

    // 标准化 POST URL
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      this.postUrl = endpoint;
    } else if (endpoint.startsWith('/')) {
      const u = new URL(this.sseUrl);
      this.postUrl = `${u.origin}${endpoint}`;
    } else {
      this.postUrl = `${this.sseUrl}/${endpoint}`;
    }

    // 先启动 SSE 后台读取，再发 initialize
    // 因为服务器通过 SSE 流返回 JSON-RPC 响应，必须先开始读
    this.loopReadSse();

    await this.sendJsonRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'yan-zhi', version: '0.1.0' },
    }, 15000);
    await this.sendJsonRpcNotification('notifications/initialized', {});
  }

  /** 等待 endpoint 事件，超时则抛出 */
  private waitForEndpoint(timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`等待 endpoint 超时（${timeoutMs}ms），使用 SSE URL 作为 POST 地址`));
      }, timeoutMs);

      const doRead = () => {
        if (this.abortController?.signal.aborted) {
          clearTimeout(timer);
          reject(new Error('连接已取消'));
          return;
        }
        this.reader!.read().then(({ done, value }) => {
          if (done) {
            clearTimeout(timer);
            return;
          }
          const text = this.decoder.decode(value, { stream: true });
          const endpoint = this.extractEndpoint(text);
          if (endpoint !== null) {
            clearTimeout(timer);
            resolve(endpoint);
          } else {
            doRead();
          }
        }).catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
      };
      doRead();
    });
  }

  /** 从 SSE 文本中提取 endpoint，没有则返回 null */
  private extractEndpoint(text: string): string | null {
    const lines = text.split('\n');
    let eventType = '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith(':')) continue;
      if (t.startsWith('event:')) {
        eventType = t.slice(6).trim();
      } else if (t.startsWith('data:')) {
        const data = t.slice(5).trim();
        if (eventType === 'endpoint') return data;
        eventType = '';
      }
    }
    return null;
  }

  /** 后台循环读取 SSE 流，将 JSON-RPC 响应路由到对应 Promise */
  private async loopReadSse() {
    let buf = '';
    let eventType = '';
    try {
      while (this.reader) {
        const { done, value } = await this.reader.read();
        if (done) break;
        buf += this.decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || t.startsWith(':')) continue;
          if (t.startsWith('event:')) {
            eventType = t.slice(6).trim();
          } else if (t.startsWith('data:')) {
            const raw = t.slice(5).trim();
            eventType = '';
            try {
              const json = JSON.parse(raw);
              const pending = this.pending.get(json.id);
              if (pending) {
                this.pending.delete(json.id);
                if (json.error) pending.reject(new Error(json.error.message || 'JSON-RPC error'));
                else pending.resolve(json.result);
              }
            } catch { /* 非 JSON */ }
          }
        }
      }
    } catch { /* 流中断 */ }
  }

  /** 通过 POST 发送 JSON-RPC，结果通过 SSE 流返回 */
  private sendJsonRpc(method: string, params: unknown, timeoutMs = MCP_RPC_TIMEOUT): Promise<unknown> {
    const id = ++this.eventId;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP 调用超时(${timeoutMs / 1000}s): ${method}`));
        }
      }, timeoutMs);

      fetch(this.postUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.server.headers || {}) },
        body,
        mode: 'cors',
      }).then((res) => {
        if (!res.ok && res.status !== 202) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`MCP POST ${this.postUrl} 返回 HTTP ${res.status}`));
        }
      }).catch((e) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      });
    });
  }

  private async sendJsonRpcNotification(method: string, params: unknown) {
    try {
      await fetch(this.postUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.server.headers || {}) },
        body: JSON.stringify({ jsonrpc: '2.0', method, params }),
        mode: 'cors',
      });
    } catch {}
  }

  // ---- Streamable HTTP ----
  private async connectHttp(): Promise<void> {
    this.postUrl = this.server.url!.replace(/\/$/, '');
    await this.rpcCallHttp('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'yan-zhi', version: '0.1.0' },
    });
  }

  private async rpcCallHttp(method: string, params: unknown): Promise<unknown> {
    const id = ++this.eventId;
    const res = await fetch(this.server.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.server.headers || {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      mode: 'cors',
    });
    if (res.status === 202 && res.body) {
      return this.parseHttpSse(res.body, id);
    }
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/event-stream') && res.body) {
      return this.parseHttpSse(res.body, id);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'JSON-RPC error');
    return json.result;
  }

  private async parseHttpSse(stream: ReadableStream<Uint8Array>, expectedId: number): Promise<unknown> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const raw = t.slice(5).trim();
          try {
            const json = JSON.parse(raw);
            if (json.id === expectedId) {
              if (json.error) throw new Error(json.error.message);
              return json.result;
            }
          } catch (e: any) { throw e; }
        }
      }
    } finally { reader.releaseLock(); }
    throw new Error('SSE 流未返回结果');
  }

  // ---- 公共 API ----

  async listTools(): Promise<McpTool[]> {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      const r = (await a.mcp.call(this.server.id, 'tools/list', {})) as { tools: any[] };
      return (r.tools || []).map((t) => ({ id: `${this.server.id}:${t.name}`, mcpServerId: this.server.id, name: t.name, description: t.description, inputSchema: t.inputSchema }));
    }
    const r = this.server.transport === 'sse'
      ? await this.sendJsonRpc('tools/list', {})
      : await this.rpcCallHttp('tools/list', {});
    return ((r as any).tools || []).map((t: any) => ({ id: `${this.server.id}:${t.name}`, mcpServerId: this.server.id, name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      return await a.mcp.call(this.server.id, 'tools/call', { name, arguments: args }) as McpCallResult;
    }
    return (this.server.transport === 'sse'
      ? await this.sendJsonRpc('tools/call', { name, arguments: args })
      : await this.rpcCallHttp('tools/call', { name, arguments: args })) as McpCallResult;
  }

  async listResources() {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      const r = (await a.mcp.call(this.server.id, 'resources/list', {})) as any;
      return r.resources || [];
    }
    const r = this.server.transport === 'sse'
      ? await this.sendJsonRpc('resources/list', {})
      : await this.rpcCallHttp('resources/list', {});
    return ((r as any).resources || []) as any[];
  }

  async readResource(uri: string) {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      const r = (await a.mcp.call(this.server.id, 'resources/read', { uri })) as any;
      return r.contents || [];
    }
    const r = this.server.transport === 'sse'
      ? await this.sendJsonRpc('resources/read', { uri })
      : await this.rpcCallHttp('resources/read', { uri });
    return ((r as any).contents || []) as any[];
  }

  async listPrompts() {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      const r = (await a.mcp.call(this.server.id, 'prompts/list', {})) as any;
      return r.prompts || [];
    }
    const r = this.server.transport === 'sse'
      ? await this.sendJsonRpc('prompts/list', {})
      : await this.rpcCallHttp('prompts/list', {});
    return ((r as any).prompts || []) as any[];
  }

  async getPrompt(name: string, args?: Record<string, string>) {
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (!a.mcp) throw new Error('stdio 仅桌面端');
      return await a.mcp.call(this.server.id, 'prompts/get', { name, arguments: args || {} });
    }
    return this.server.transport === 'sse'
      ? await this.sendJsonRpc('prompts/get', { name, arguments: args || {} })
      : await this.rpcCallHttp('prompts/get', { name, arguments: args || {} });
  }

  abort() { this.abortController?.abort(); }

  async disconnect() {
    this.abort();
    if (this.server.transport === 'stdio') {
      const a = getPlatformAdapter();
      if (a.mcp) { try { await a.mcp.kill(this.server.id); } catch {} }
    } else {
      try { this.reader?.cancel(); } catch {}
      this.reader = null;
    }
    this.pending.clear();
    this.connected = false;
  }
}
