// tcp_send 内置工具 — 发送原始 TCP 报文并接收响应（Banner 抓取 / 协议探测，仅限授权目标）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { encodePayload, previewBuffer, type PayloadEncoding } from './raw-payload';

export class TcpSendTool implements BuiltInTool {
  name = 'tcp_send';
  description = '向 host:port 发送原始 TCP 报文并捕获响应（banner 抓取、协议探测、仅授权目标）。payload 支持 \\\\r\\\\n 换行转义；encoding 可选 text（默认）/ hex / base64。响应到达或超时后连接关闭。';

  inputSchema = {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Target host (IP or hostname).' },
      port: { type: 'number', description: 'Target port, 1-65535.' },
      payload: { type: 'string', description: 'Payload to send. Use \\r\\n for line breaks, e.g. "GET / HTTP/1.0\\r\\n\\r\\n". Empty payload = connect only (banner grab).' },
      encoding: { type: 'string', enum: ['text', 'hex', 'base64'], description: 'Payload encoding (default text).' },
      timeout: { type: 'number', description: 'Wait-for-response timeout in ms (default 5000, max 30000).' },
      maxResponseBytes: { type: 'number', description: 'Max response bytes to collect (default 8192, max 65536).' },
    },
    required: ['host', 'port', 'payload'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const host = args.host as string;
    const port = Number(args.port);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { content: [{ type: 'text', text: 'Error: host 和 port(1-65535) 必填' }], isError: true };
    }
    const payload = String(args.payload ?? '');
    const encoding = (args.encoding as PayloadEncoding) || 'text';
    const timeout = Math.min(Math.max(Number(args.timeout) || 5000, 500), 30000);
    const maxBytes = Math.min(Math.max(Number(args.maxResponseBytes) || 8192, 64), 65536);

    let net: typeof import('node:net');
    try { net = await import('node:net'); } catch {
      return { content: [{ type: 'text', text: 'Error: tcp_send 需要服务端或桌面端环境（Node net）。浏览器端不支持。' }], isError: true };
    }

    const start = Date.now();
    return await new Promise<McpCallResult>((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const socket = new net.Socket();

      const finish = (result: McpCallResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => {
        const buf = Buffer.concat(chunks);
        const head = buf.length > 0
          ? `响应(超时截断, ${buf.length}B, ${Date.now() - start}ms):\n${previewBuffer(buf)}`
          : `已发送 payload，${timeout}ms 内无响应`;
        finish({ content: [{ type: 'text', text: head }] });
      }, timeout);

      socket.setTimeout(timeout);
      socket.once('connect', () => {
        if (payload.length === 0) return; // 仅连接：等 banner
        try { socket.write(encodePayload(payload, encoding)); } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          finish({ content: [{ type: 'text', text: `发送失败: ${msg}` }], isError: true });
        }
      });
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        total += chunk.length;
        if (total >= maxBytes) {
          finish({
            content: [{ type: 'text', text: `响应(${total}B 达上限, ${Date.now() - start}ms):\n${previewBuffer(Buffer.concat(chunks))}` }],
          });
        }
      });
      socket.once('end', () => {
        const buf = Buffer.concat(chunks);
        finish({
          content: [{ type: 'text', text: `响应(对端关闭, ${buf.length}B, ${Date.now() - start}ms):\n${buf.length > 0 ? previewBuffer(buf) : '(无响应数据)'}` }],
        });
      });
      socket.once('error', (err: NodeJS.ErrnoException) => {
        const buf = Buffer.concat(chunks);
        if (buf.length > 0) {
          finish({ content: [{ type: 'text', text: `响应(${err.code || 'error'}前 ${buf.length}B):\n${previewBuffer(buf)}` }] });
        } else {
          finish({ content: [{ type: 'text', text: `连接失败: ${err.message} (${err.code || 'unknown'})` }], isError: true });
        }
      });
      try { socket.connect(port, host); } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        finish({ content: [{ type: 'text', text: `连接失败: ${msg}` }], isError: true });
      }
    });
  }
}
