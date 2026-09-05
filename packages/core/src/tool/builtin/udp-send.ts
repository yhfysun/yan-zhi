// udp_send 内置工具 — 发送 UDP 数据报并等待响应（DNS 探测 / 服务发现，仅限授权目标）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { encodePayload, previewBuffer, type PayloadEncoding } from './raw-payload';

export class UdpSendTool implements BuiltInTool {
  name = 'udp_send';
  description = 'Send a UDP datagram to host:port and wait for a response (DNS probes, service discovery, authorized targets only). encoding: text (default) / hex / base64. Reports "sent, no response" if nothing comes back within timeout.';

  inputSchema = {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Target host (IP or hostname).' },
      port: { type: 'number', description: 'Target port, 1-65535.' },
      payload: { type: 'string', description: 'Payload to send (raw bytes per encoding).' },
      encoding: { type: 'string', enum: ['text', 'hex', 'base64'], description: 'Payload encoding (default text).' },
      timeout: { type: 'number', description: 'Wait-for-response timeout in ms (default 3000, max 30000).' },
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
    const timeout = Math.min(Math.max(Number(args.timeout) || 3000, 200), 30000);

    let dgram: typeof import('node:dgram');
    try { dgram = await import('node:dgram'); } catch {
      return { content: [{ type: 'text', text: 'Error: udp_send 需要服务端或桌面端环境（Node dgram）。浏览器端不支持。' }], isError: true };
    }

    const start = Date.now();
    return await new Promise<McpCallResult>((resolve) => {
      const socket = dgram.createSocket('udp4');
      let settled = false;
      const finish = (result: McpCallResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { socket.close(); } catch {}
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish({ content: [{ type: 'text', text: `已发送 ${Buffer.byteLength(encodePayload(payload, encoding))}B 到 ${host}:${port}，${timeout}ms 内无响应（UDP 无连接，属正常）` }] });
      }, timeout);

      socket.once('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
        finish({
          content: [{ type: 'text', text: `响应来自 ${rinfo.address}:${rinfo.port} (${msg.length}B, ${Date.now() - start}ms):\n${previewBuffer(msg)}` }],
        });
      });
      socket.once('error', (err: Error) => {
        finish({ content: [{ type: 'text', text: `UDP 错误: ${err.message}` }], isError: true });
      });

      const buf = encodePayload(payload, encoding);
      socket.send(buf, port, host, (err) => {
        if (err) finish({ content: [{ type: 'text', text: `发送失败: ${err.message}` }], isError: true });
      });
    });
  }
}
