import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveUpstreamUrl } from './api-path.js';

/**
 * ★ 真跑验证（验收标准 3 的第一半）：起一个**真实的 HTTP server**，把 `resolveUpstreamUrl`
 * 产出的 URL 真的发出去，断言 **server 实际收到的 path** 是厂商文档里的那个。
 *
 * 为什么不用纯字符串断言就够了：字符串断言只能证明"拼出来的字面量对"，
 * 证明不了它跟 `fetch` 组合起来仍对（例如 base 带尾斜杠、带端口、base 里有 query 的情况）。
 * 而本项目的故障形态正是"发出去了但 404"，所以必须看到对端收到的东西。
 *
 * ★ 不实例化 LlmClient：它依赖 `getPlatformAdapter()`（electron / keyring / 授权码），
 *   在 vitest 里加载不了（本项目「宿主无法在测试加载 ⇒ 抽纯函数」的既定套路）。
 *   这里验证的是"URL 生成 + 真实请求"这一段，协议解析另有单测覆盖。
 */
describe('真跑：请求确实打到了厂商文档里的路径', () => {
  let server: Server;
  let origin = '';
  const seen: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push(req.url || '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, data: [] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  /** 用不同形态的 base（含厂商真实路径段）真的打一次，返回 server 侧看到的 path */
  async function probe(baseSuffix: string, kind: Parameters<typeof resolveUpstreamUrl>[1]): Promise<string> {
    seen.length = 0;
    const url = resolveUpstreamUrl(`${origin}${baseSuffix}`, kind);
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    return seen[0] || '';
  }

  it('火山方舟形态：/api/v3 ⇒ 收到 /api/v3/chat/completions（不是 /api/v3/v1/...）', async () => {
    expect(await probe('/api/v3', 'chat')).toBe('/api/v3/chat/completions');
  });

  it('智谱形态：/api/paas/v4 ⇒ /api/paas/v4/chat/completions', async () => {
    expect(await probe('/api/paas/v4', 'chat')).toBe('/api/paas/v4/chat/completions');
  });

  it('百炼形态：/compatible-mode/v1 ⇒ /compatible-mode/v1/chat/completions', async () => {
    expect(await probe('/compatible-mode/v1', 'chat')).toBe('/compatible-mode/v1/chat/completions');
  });

  it('DeepSeek/OpenAI 形态：无路径 ⇒ /v1/chat/completions', async () => {
    expect(await probe('', 'chat')).toBe('/v1/chat/completions');
  });

  it('Kimi 的 Anthropic 兼容端点：/anthropic ⇒ /anthropic/v1/messages', async () => {
    expect(await probe('/anthropic', 'messages')).toBe('/anthropic/v1/messages');
  });

  it('★ 尾斜杠不产生双斜杠（真实请求里 // 会被服务端当不同路径）', async () => {
    expect(await probe('/api/v3/', 'chat')).toBe('/api/v3/chat/completions');
  });

  it('模型列表与聊天走同一套规则（国内厂商最先 404 的就是拉模型）', async () => {
    expect(await probe('/api/paas/v4', 'models')).toBe('/api/paas/v4/models');
  });
});
