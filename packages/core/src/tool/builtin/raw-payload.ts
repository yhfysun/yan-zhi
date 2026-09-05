// tcp_send / udp_send 内置工具 — 原始 TCP/UDP 报文收发（Banner 抓取 / 协议探测，仅限授权目标）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export type PayloadEncoding = 'text' | 'hex' | 'base64';

export function encodePayload(payload: string, encoding: PayloadEncoding): Buffer {
  if (encoding === 'hex') return Buffer.from(payload.replace(/[^0-9a-fA-F]/g, ''), 'hex');
  if (encoding === 'base64') return Buffer.from(payload, 'base64');
  // text 模式：兼容字面转义（LLM/用户传 "\\r\\n" 字符串时还原为真实控制字符）
  const unescaped = payload
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\0/g, '\0');
  return Buffer.from(unescaped, 'utf8');
}

/** 生成可打印预览：优先文本（不可见字符转义），附带 hex 前 64 字节 */
export function previewBuffer(buf: Buffer): string {
  const maxBytes = Math.min(buf.length, 2048);
  const slice = buf.subarray(0, maxBytes);
  const text = JSON.stringify(slice.toString('utf8'));
  const hex = slice.subarray(0, 64).toString('hex').replace(/(..)/g, '$1 ').trim();
  const note = buf.length > maxBytes ? `\n... [共 ${buf.length} 字节，仅显示前 ${maxBytes}]` : '';
  return `Text: ${text}${note}\nHex(head 64B): ${hex}`;
}
