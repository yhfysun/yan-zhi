// 极简 DAP（Debug Adapter Protocol）客户端。
// 协议：Header 为 "Content-Length: N\r\n\r\n"，随后 N 字节 UTF-8 JSON；请求/响应/事件三类消息。
// 传输层是一对任意可读/可写流 —— 既可以是 spawn 出的子进程 stdio，也可以是 debugpy 的 TCP socket。
// 不引入 @vscode/debugprotocol：只需要这些字段，自实现比引依赖更轻。
import type { Readable, Writable } from 'node:stream';

export interface DapMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
  command?: string;
  event?: string;
  request_seq?: number;
  success?: boolean;
  message?: string;
  body?: any;
}

export class DapClient {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private eventHandlers = new Set<(msg: DapMessage) => void>();
  private closed = false;

  constructor(private output: Writable, private input: Readable, private onClose?: () => void) {
    this.input.on('data', (chunk: Buffer) => this.onData(chunk));
    this.input.once('close', () => this.shutdown());
    this.input.once('error', () => this.shutdown());
  }

  get isClosed() { return this.closed; }

  private shutdown() {
    if (this.closed) return;
    this.closed = true;
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('调试适配器已断开')); }
    this.pending.clear();
    this.onClose?.();
  }

  private onData(chunk: Buffer) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) { this.buffer = this.buffer.subarray(headerEnd + 4); continue; }
      const len = parseInt(m[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + len) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + len).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + len);
      let msg: DapMessage;
      try { msg = JSON.parse(body) as DapMessage; } catch { continue; }
      this.dispatch(msg);
    }
  }

  private dispatch(msg: DapMessage) {
    if (msg.type === 'event') {
      for (const h of this.eventHandlers) {
        try { h(msg); } catch { /* 单个消费者异常不影响其他 */ }
      }
      return;
    }
    if (msg.type === 'response' && msg.request_seq !== undefined) {
      const p = this.pending.get(msg.request_seq);
      if (!p) return;
      this.pending.delete(msg.request_seq);
      clearTimeout(p.timer);
      if (msg.success === false) p.reject(new Error(msg.message || msg.body?.error?.format || '调试请求失败'));
      else p.resolve(msg.body);
    }
  }

  onEvent(handler: (msg: DapMessage) => void): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  request<T = any>(command: string, args?: any, timeoutMs = 20000): Promise<T> {
    const seq = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`调试请求 ${command} 超时`));
      }, timeoutMs);
      this.pending.set(seq, { resolve, reject, timer });
      this.writeFrame({ seq, type: 'request', command, arguments: args });
    });
  }

  private writeFrame(msg: Record<string, unknown>) {
    if (this.closed) return;
    const data = Buffer.from(JSON.stringify(msg), 'utf8');
    try {
      this.output.write(`Content-Length: ${data.length}\r\n\r\n`);
      this.output.write(data);
    } catch { /* 流已关闭忽略 */ }
  }

  dispose() {
    this.shutdown();
    this.eventHandlers.clear();
  }
}
