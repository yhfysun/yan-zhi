/**
 * 个人微信主动外发（sendWechatPersonal）行为测试。
 *
 * 判据（2026-10-17 扒 openclaw 源码 + 文档核实）：
 *   - 出站唯一可靠入口是 OpenClaw Gateway 的 HTTP RPC：POST /tools/invoke（带 Bearer 令牌）。
 *   - 调核心 message 工具：action=send, channel=weixin, target=<某人/群>, message/media/buffer。
 *   - 文件优先走本地路径（args.media）规避 /tools/invoke 2MB body 限制；无路径才 base64 data URL。
 *   - 网关不可达 / 缺令牌 必须给出可定位的中文错误，而不是把底层异常原样抛。
 *
 * 用 mock 的 global.fetch 验证请求形态与错误分支，不依赖本机是否真装了 openclaw。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendWechatPersonal } from '../src/services/im';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = process.env.OPENCLAW_GATEWAY_TOKEN;

function mockFetch(handler: (url: string, init: any) => any) {
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => handler(url, init));
}

beforeEach(() => {
  // 用固定令牌，保证 token 解析分支确定（resolveOpenclawGatewayToken 先读 env）
  process.env.OPENCLAW_GATEWAY_TOKEN = 'test-gateway-token';
});

afterEach(() => {
  (globalThis as any).fetch = ORIGINAL_FETCH;
  if (ORIGINAL_ENV === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
  else process.env.OPENCLAW_GATEWAY_TOKEN = ORIGINAL_ENV;
});

describe('sendWechatPersonal：网关可达性 + 鉴权前置', () => {
  it('★ 网关不可达（/ 探活 reject）→ 抛「未在本机运行」', async () => {
    mockFetch((url: string) => {
      if (url.endsWith('/')) throw new Error('connect ECONNREFUSED');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    await expect(
      sendWechatPersonal({}, { to: 'wxid_abc', content: 'hi' }),
    ).rejects.toThrow(/未在本机运行|127\.0\.0\.1:18789/);
  });

  it('★★ 缺令牌（env 与 openclaw.json 均无）→ 抛「未配置鉴权令牌」', async () => {
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    // 探活成功，但令牌解析为 null
    mockFetch(() => new Response('ok', { status: 200 }));
    await expect(
      sendWechatPersonal({}, { to: 'wxid_abc', content: 'hi' }),
    ).rejects.toThrow(/未配置鉴权令牌|装配桥接/);
  });
});

describe('sendWechatPersonal：文本出站请求形态', () => {
  it('★★ 调 /tools/invoke，带 Bearer 令牌，message 工具 action=send channel=weixin target=to', async () => {
    let captured: any = null;
    mockFetch((url: string, init: any) => {
      if (url.endsWith('/')) return new Response('ok', { status: 200 });
      captured = { url, init };
      return new Response(JSON.stringify({ ok: true, result: { delivered: true } }), { status: 200 });
    });

    const res = await sendWechatPersonal({}, { to: 'wxid_friend', content: '你好' });

    expect(captured.url).toBe('http://127.0.0.1:18789/tools/invoke');
    const auth = captured.init.headers.Authorization;
    expect(auth).toBe('Bearer test-gateway-token');
    const body = JSON.parse(captured.init.body);
    expect(body.tool).toBe('message');
    expect(body.args.action).toBe('send');
    expect(body.args.channel).toBe('weixin');
    expect(body.args.target).toBe('wxid_friend');
    expect(body.args.message).toBe('你好');
    expect(res).toEqual({ delivered: true });
  });

  it('★ 网关返回 ok:false → 抛「发送失败」带后端原因', async () => {
    mockFetch((url: string) => {
      if (url.endsWith('/')) return new Response('ok', { status: 200 });
      return new Response(JSON.stringify({ ok: false, error: { message: 'weixin: no accounts registered' } }), { status: 200 });
    });
    await expect(
      sendWechatPersonal({}, { to: 'wxid_x', content: 'hi' }),
    ).rejects.toThrow(/发送失败.*no accounts registered/);
  });

  it('★ 网关 401 → 抛「鉴权失败」（令牌不匹配）', async () => {
    mockFetch((url: string) => {
      if (url.endsWith('/')) return new Response('ok', { status: 200 });
      return new Response(JSON.stringify({ ok: false, error: { message: 'unauthorized' } }), { status: 401 });
    });
    await expect(
      sendWechatPersonal({}, { to: 'wxid_x', content: 'hi' }),
    ).rejects.toThrow(/鉴权失败|401/);
  });
});

describe('sendWechatPersonal：文件出站（优先本地路径，规避 2MB body 限制）', () => {
  it('★★ 有本地路径 → args.media 为路径，且不发 buffer（大文件也不撑爆 body）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp-send-'));
    const filePath = join(dir, 'report.pdf');
    writeFileSync(filePath, '%PDF-1.4 fake');

    let captured: any = null;
    mockFetch((url: string, init: any) => {
      if (url.endsWith('/')) return new Response('ok', { status: 200 });
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    });

    await sendWechatPersonal(
      {},
      { to: 'wxid_friend', content: '看附件', file: { name: 'report.pdf', path: filePath, mimeType: 'application/pdf' } },
    );

    expect(captured.args.media).toBe(filePath);
    expect(captured.args.buffer).toBeUndefined();
    expect(captured.args.filename).toBe('report.pdf');
    expect(captured.args.mimeType).toBe('application/pdf');
  });

  it('★ 无本地路径（仅 base64）→ 走 data URL buffer', async () => {
    const b64 = Buffer.from('hello').toString('base64');
    let captured: any = null;
    mockFetch((url: string, init: any) => {
      if (url.endsWith('/')) return new Response('ok', { status: 200 });
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    });

    await sendWechatPersonal(
      {},
      { to: 'wxid_friend', file: { name: 'note.txt', data: `data:text/plain;base64,${b64}`, mimeType: 'text/plain' } },
    );

    expect(captured.args.buffer).toBe(`data:text/plain;base64,${b64}`);
    expect(captured.args.media).toBeUndefined();
    expect(captured.args.filename).toBe('note.txt');
  });
});
