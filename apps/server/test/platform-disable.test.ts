/**
 * 平台级禁用闸行为测试（2026-10-18）。
 *
 * ★ 钉的验收：平台 `llm_enabled=0`（UI「禁用」）之后，
 *   - 所有上游模型调用端点（chat/completions 等）必须 **403 拒绝**，
 *     不能再对着 Token 过期的上游发注定 401 的请求；
 *   - 启用状态的平台不受影响（闸门放行，走到正常转发路径）；
 *   - PATCH llmEnabled=false 对内置厂商平台也可用（使用偏好 ≠ 连接配置）。
 *
 * ★ 为什么钉在 llm-proxy：它是 chat/messages/responses/embeddings/images/videos
 *   六个调用端点的唯一转发出口（proxyWithRetry），在这里拦一次等于全拦。
 *   下拉/选型过滤只解决"不再选它"，拦不住存量会话钉在禁用平台上的调用。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import platformsRouter from '../src/routes/platforms.js';
import llmProxyRouter from '../src/routes/llm-proxy.js';

const app = express();
app.use(express.json());
app.use('/api/platforms', platformsRouter);
app.use('/api/llm', llmProxyRouter);

let server: Server | null = null;
let platformBase = '';
let proxyBase = '';

beforeAll(async () => {
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  const port = (server!.address() as any).port;
  platformBase = `http://127.0.0.1:${port}/api/platforms`;
  proxyBase = `http://127.0.0.1:${port}/api/llm`;
});

afterAll(async () => {
  await new Promise<void>((r) => server!.close(() => r()));
});

beforeEach(() => {
  const rows = db.prepare("SELECT id FROM platform WHERE user_id = 'guest' AND name LIKE '测试禁用%'").all() as any[];
  for (const r of rows) {
    db.prepare('DELETE FROM model WHERE platform_id = ?').run(r.id);
    db.prepare('DELETE FROM platform_api_key WHERE platform_id = ?').run(r.id);
    db.prepare('DELETE FROM platform WHERE id = ?').run(r.id);
  }
});

const json = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

/** 造一个平台：api_url 指向必然连接失败的地址（端口 9 discard），启用的平台走到转发层必 502 而非 403 */
async function makePlatform(llmEnabled: boolean): Promise<string> {
  const res = await json('POST', `${platformBase}/`, {
    name: '测试禁用平台', protocol: 'openai', apiUrl: 'http://127.0.0.1:9/v1',
  });
  const pid = res.json.data.id;
  await json('PATCH', `${platformBase}/${pid}`, { llmEnabled });
  return pid;
}

describe('★ 禁用平台不能调用（llm-proxy 禁用闸）', () => {
  it('llm_enabled=0 的平台：chat/completions 403 拒绝', async () => {
    const pid = await makePlatform(false);
    const r = await json('POST', `${proxyBase}/chat/completions`, { platformId: pid, payload: { model: 'x', messages: [] } });
    expect(r.status).toBe(403);
    expect(String(r.json.error)).toContain('已禁用');
  });

  it('llm_enabled=0 的平台：embeddings / images 同样 403（同一出口拦全）', async () => {
    const pid = await makePlatform(false);
    expect((await json('POST', `${proxyBase}/embeddings`, { platformId: pid, payload: {} })).status).toBe(403);
    expect((await json('POST', `${proxyBase}/images/generations`, { platformId: pid, payload: {} })).status).toBe(403);
  });

  it('★ 启用的平台闸门放行：不 403，走正常转发（假上游 → 502 代理请求失败）', async () => {
    const pid = await makePlatform(true);
    const r = await json('POST', `${proxyBase}/chat/completions`, { platformId: pid, payload: { model: 'x', messages: [] } });
    expect(r.status).not.toBe(403);
    expect(r.status).toBe(502);
  });
});

describe('PATCH llmEnabled 往返', () => {
  it('禁用后 llm_enabled 落库为 0，再启用回 1（内置厂商平台同样可切）', async () => {
    // 用 from-preset 造内置厂商平台，验证「使用偏好」对内置平台开放
    const created = await json('POST', `${platformBase}/from-preset`, { presetKey: 'deepseek' });
    const pid = created.json.data.id as string;
    await json('PATCH', `${platformBase}/${pid}`, { llmEnabled: false });
    expect((db.prepare('SELECT llm_enabled FROM platform WHERE id = ?').get(pid) as any).llm_enabled).toBe(0);
    await json('PATCH', `${platformBase}/${pid}`, { llmEnabled: true });
    expect((db.prepare('SELECT llm_enabled FROM platform WHERE id = ?').get(pid) as any).llm_enabled).toBe(1);
    // 清理（beforeEach 按「测试禁用%」名称清不到目录平台，这里手动删）
    db.prepare('DELETE FROM platform_api_key WHERE platform_id = ?').run(pid);
    db.prepare('DELETE FROM platform WHERE id = ?').run(pid);
  });
});

describe('★ Token 级：池内全停用不得从 api_key_enc 复活', () => {
  /** 造平台 + 两把入池 Token（api_key_enc 同时持有同值，模拟建池快照） */
  async function makePlatformWithPool(allDisabled: boolean): Promise<string> {
    const res = await json('POST', `${platformBase}/`, {
      name: '测试禁用平台', protocol: 'openai', apiUrl: 'http://127.0.0.1:9/v1', apiKeyEnc: 'sk-expired',
    });
    const pid = res.json.data.id as string;
    const keys = db.prepare('SELECT id FROM platform_api_key WHERE platform_id = ?').all(pid) as any[];
    expect(keys.length).toBeGreaterThanOrEqual(1); // apiKeyEnc 应已入池
    if (allDisabled) {
      for (const k of keys) db.prepare('UPDATE platform_api_key SET enabled = 0 WHERE id = ?').run(k.id);
    }
    return pid;
  }

  it('★ 建过池 + 全部停用 ⇒ 403（不允许退 api_key_enc 兜底复活过期 Key）', async () => {
    const pid = await makePlatformWithPool(true);
    const r = await json('POST', `${proxyBase}/chat/completions`, { platformId: pid, payload: { model: 'x', messages: [] } });
    expect(r.status).toBe(403);
    expect(String(r.json.error)).toContain('Token 均已停用');
  });

  it('建过池 + 有启用 Token ⇒ 闸门放行（假上游 → 502）', async () => {
    const pid = await makePlatformWithPool(false);
    const r = await json('POST', `${proxyBase}/chat/completions`, { platformId: pid, payload: { model: 'x', messages: [] } });
    expect(r.status).not.toBe(403);
    expect(r.status).toBe(502);
  });
});
