/**
 * 代理 CONNECT 隧道的数据交接测试。
 *
 * 背景（真实回归，2026-09-17）：parseinel CONNECT 响应时只保留状态码、丢弃了同包剩余字节。
 * 但 CONNECT 响应头与 TLS ServerHello 经常在同一个 TCP 包里到达 —— 丢掉剩余字节 = 丢 TLS 握手数据。
 * 症状极隐蔽：小文件偶尔能过，大文件必然 ECONNRESET。
 *
 * 这里把「从 head 中切出 leftover」的逻辑提成纯函数并钉住，因为它在真实网络里几乎无法复现验证。
 */
import { describe, it, expect } from 'vitest';
import { splitConnectResponse } from '../src/services/media-fetch';

describe('splitConnectResponse · CONNECT 响应与 TLS 数据分离', () => {
  it('同一包里既有响应头又有 TLS 数据 → 剩余字节完整保留', () => {
    const tlsData = Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00]); // TLS handshake record 头
    const head = Buffer.concat([
      Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n', 'latin1'),
      tlsData,
    ]);
    const r = splitConnectResponse(head);
    expect(r.status).toBe(200);
    expect(r.leftover.equals(tlsData)).toBe(true);
  });

  it('只有响应头（TLS 数据还没到）→ 剩余为空', () => {
    const head = Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n', 'latin1');
    const r = splitConnectResponse(head);
    expect(r.status).toBe(200);
    expect(r.leftover.length).toBe(0);
  });

  it('响应头未收全（无 \\r\\n\\r\\n）→ status=0，调用方应继续等', () => {
    const r = splitConnectResponse(Buffer.from('HTTP/1.1 200 Conne', 'latin1'));
    expect(r.status).toBe(0);
    expect(r.leftover.length).toBe(0);
  });

  it('失败状态码被正确识别（407 代理需认证等）', () => {
    const head = Buffer.from('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n', 'latin1');
    expect(splitConnectResponse(head).status).toBe(407);
  });

  it('响应头后恰好无剩余时不会切出垃圾字节（边界）', () => {
    const head = Buffer.from('HTTP/1.1 200 OK\r\n\r\n', 'latin1');
    const r = splitConnectResponse(head);
    expect(r.status).toBe(200);
    expect(r.leftover.length).toBe(0);
  });

  it('多余字节按原始内容保留（多字节二进制不被字符串编码破坏）', () => {
    const tlsData = Buffer.from([0xff, 0x00, 0x16, 0x80, 0xfe]);
    const head = Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\n\r\n', 'latin1'), tlsData]);
    expect(splitConnectResponse(head).leftover.equals(tlsData)).toBe(true);
  });
});