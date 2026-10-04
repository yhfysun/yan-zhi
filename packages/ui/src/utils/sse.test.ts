import { describe, it, expect } from 'vitest';
import { extractSsePayloads, parseSseJson } from './sse';

describe('extractSsePayloads', () => {
  it('完整帧 → 抽出 data 载荷，rest 为空', () => {
    const r = extractSsePayloads('data: {"type":"chunk"}\n\n');
    expect(r.payloads).toEqual(['{"type":"chunk"}']);
    expect(r.rest).toBe('');
  });

  it('跨 chunk 粘包：多帧一次抽出，不完整帧留在 rest', () => {
    const r = extractSsePayloads('data: a\n\ndata: b\n\ndata: c');
    expect(r.payloads).toEqual(['a', 'b']);
    expect(r.rest).toBe('data: c');
  });

  it('帧内多行：取第一条 data: 行，忽略其他字段行', () => {
    const r = extractSsePayloads('event: message\ndata: hello\nid: 1\n\n');
    expect(r.payloads).toEqual(['hello']);
  });

  it('注释帧（:connected 等）不投递', () => {
    const r = extractSsePayloads('data: :connected\n\ndata: real\n\n');
    expect(r.payloads).toEqual(['real']);
  });

  it('无 data 行的帧跳过；payload 裁剪首尾空白', () => {
    const r = extractSsePayloads('event: ping\n\ndata:   spaced  \n\n');
    expect(r.payloads).toEqual(['spaced']);
  });

  it('base64 载荷不受 trim 影响（前后无空白原样返回）', () => {
    const b64 = 'aGVsbG8=';
    const r = extractSsePayloads(`data: ${b64}\n\n`);
    expect(r.payloads).toEqual([b64]);
  });
});

describe('parseSseJson', () => {
  it('合法 JSON 解析成功', () => {
    expect(parseSseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it('非法 JSON 返回 null 不抛错', () => {
    expect(parseSseJson('not-json')).toBeNull();
  });
});
