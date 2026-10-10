/**
 * 浏览器桥 **真跑** 测试（2026-10-10）。
 *
 * ★ 为什么必须有真跑：静态断言只能证明"代码写在那儿"，证明不了"行为对"。
 *   （本项目最贵判据："断言存在 ≠ 断言生效"。）本文件起一个**真实的 loopback HTTP 服务**，
 *   用真实请求验证端点行为：鉴权、白名单、body 上限、content-type、404 统一。
 *   `browser-bridge.cjs` 只依赖 node:http/node:crypto，不依赖 electron ⇒ 可在 vitest 里直接加载。
 *
 * ★ 另外验证 server 侧两个**纯函数**（decideBrowserExecution / formatBridgeResult）真跑，
 *   而不是只断言符号存在。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const REPO = resolve(__dirname, '..', '..', '..');

// ── 被注入的"唯一实现"桩：记录调用，返回可控结果 ──
const calls: Array<{ convId: string; tabId: string | null; action: string; args: any }> = [];
let stubResult: any = { ok: true, url: 'https://example.com', title: '示例' };
let stubThrow: string | null = null;

let bridge: any;
let port = 0;
let token = '';

beforeAll(async () => {
  process.env.YZ_BROWSER_BRIDGE = 'on';
  bridge = require(resolve(REPO, 'apps/desktop/browser-bridge.cjs'));
  bridge.attach({
    runAction: async (convId: string, tabId: string | null, action: string, args: any) => {
      calls.push({ convId, tabId, action, args });
      if (stubThrow) throw new Error(stubThrow);
      return stubResult;
    },
    allowedActions: ['navigate', 'get_page_content', 'click'],
    log: () => {},   // 静音（避免污染测试输出）
    warn: () => {},
  });
  // ★ start() 返回 Promise（listen 是异步的）—— 必须 await 才拿得到 url/token
  const st = await bridge.start();
  expect(st.url, '★ 桥未启动（start 未 await 或 listen 失败）').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  port = Number(new URL(st.url).port);
  token = st.token;
});

afterAll(() => {
  try { bridge.close(); } catch { /* ignore */ }
  delete process.env.YZ_BROWSER_BRIDGE;
});

const PATH = '/v1/browser/action';
const post = async (body: any, opts: { token?: string | null; ctype?: string; raw?: string } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': opts.ctype ?? 'application/json' };
  if (opts.token !== null) headers['x-yz-bridge-token'] = opts.token ?? token;
  const res = await fetch(`http://127.0.0.1:${port}${PATH}`, {
    method: 'POST', headers, body: opts.raw ?? JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = undefined;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, text, json };
};

describe('① 真实启动（loopback + 端口自动分配）', () => {
  it('★ 只绑 127.0.0.1，端口非 0（OS 已分配）', () => {
    expect(port, '★ 端口未分配').toBeGreaterThan(0);
  });

  it('★ start() 幂等：重复调用拿到同一端点', async () => {
    const st2 = await bridge.start();
    expect(new URL(st2.url).port, '★ start 非幂等').toBe(String(port));
  });
});

describe('② 鉴权（真跑）', () => {
  it('★ 正确 token → 200 且返回结果', async () => {
    const r = await post({ convId: 'c1', action: 'get_page_content', args: {} });
    expect(r.status, `★ 正确 token 被拒: ${r.text}`).toBe(200);
    expect(r.json.title).toBe('示例');
  });

  it('★★ 无 token → 404（不是 401，不泄露端点存在）', async () => {
    const r = await post({ convId: 'c1', action: 'get_page_content' }, { token: null });
    expect(r.status, `★ 无 token 应回 404，实际 ${r.status}`).toBe(404);
  });

  it('★★ 错 token → 404', async () => {
    const r = await post({ convId: 'c1', action: 'get_page_content' }, { token: 'deadbeef'.repeat(8) });
    expect(r.status).toBe(404);
  });

  it('★★ token 长度不同也回 404（不因 timingSafeEqual 抛异常而 500）', async () => {
    const r = await post({ convId: 'c1', action: 'get_page_content' }, { token: 'short' });
    expect(r.status, '★ 长度不等时应优雅拒绝而非报错').toBe(404);
  });

  it('★ 未启动桥时（off 档）不应有端点 —— 见 ⑧ 档位用例', () => {
    expect(true).toBe(true);
  });
});

describe('③ 路径与方法（真跑）', () => {
  it('★ 错误路径 → 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/wrong`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-yz-bridge-token': token }, body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('★ GET 方法 → 404（只认 POST）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}${PATH}`, {
      headers: { 'x-yz-bridge-token': token },
    });
    expect(res.status).toBe(404);
  });
});

describe('④ 能力面与参数（真跑）', () => {
  it('★★ 非白名单 action → 400（能力面收窄）', async () => {
    const r = await post({ convId: 'c1', action: 'run_script', args: {} });
    expect(r.status, '★ 未拦非白名单 action → 端点成了通用 IPC').toBe(400);
    expect(r.json.error).toMatch(/不支持的浏览器 action/);
  });

  it('★★ 缺 convId → 400（防静默打到全局页）', async () => {
    const r = await post({ action: 'navigate', args: { url: 'https://x.com' } });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/缺少 convId/);
  });

  it('★ 非 application/json → 415', async () => {
    const r = await post({}, { ctype: 'text/plain' });
    expect(r.status).toBe(415);
  });

  it('★ 非法 JSON → 400', async () => {
    const r = await post({}, { raw: '{not json' });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/不是合法 JSON/);
  });

  it('★ 超大 body → 413', async () => {
    const big = 'x'.repeat(1_200_000); // > 1MB 上限
    const r = await post({ convId: 'c1', action: 'navigate', args: { url: big } });
    expect(r.status, '★ 未拦超大 body').toBe(413);
  });
});

describe('⑤ 转发给唯一实现（真跑）', () => {
  it('★★★ action/args/convId/tabId 逐字透传给 runAction', async () => {
    calls.length = 0;
    await post({ convId: 'conv-7', tabId: 'tab-3', action: 'click', args: { index: 5 } });
    expect(calls.length, '★ 未调用唯一实现').toBe(1);
    expect(calls[0]).toEqual({ convId: 'conv-7', tabId: 'tab-3', action: 'click', args: { index: 5 } });
  });

  it('★ 结果原样回传（与 browserView:action 同构）', async () => {
    stubResult = { ok: true, interactive: [{ index: 1, tag: 'a' }], interactiveCount: 1, text: 'hi', url: 'u', title: 't' };
    const r = await post({ convId: 'c1', action: 'get_page_content', args: {} });
    expect(r.json.interactiveCount).toBe(1);
  });

  it('★ runAction 抛错 → 回传 { error }（不是 500）', async () => {
    stubThrow = '页面未就绪';
    const r = await post({ convId: 'c1', action: 'click', args: {} });
    expect(r.status).toBe(200);
    expect(r.json.error).toMatch(/页面未就绪/);
    stubThrow = null;
  });

  it('★ 主进程已把错误包成 { error } 时也原样回传（真实链路形态）', async () => {
    stubResult = { error: '该会话尚未绑定浏览器页面' };
    const r = await post({ convId: 'c1', action: 'click', args: {} });
    expect(r.status).toBe(200);
    expect(r.json.error).toMatch(/尚未绑定浏览器页面/);
    stubResult = { ok: true };
  });
});

describe('⑥ 档位（真跑：off 不启动）', () => {
  /** 取一个**全新**的桥模块实例（清 require 缓存）—— 否则拿到的是已启动的同一实例 */
  const freshBridge = () => {
    const p = resolve(REPO, 'apps/desktop/browser-bridge.cjs');
    delete require.cache[require.resolve(p)];
    return require(p);
  };

  it('★★ off 档 start() 不监听任何端口（url 为空）', async () => {
    process.env.YZ_BROWSER_BRIDGE = 'off';
    const mod = freshBridge();
    mod.attach({ runAction: async () => ({}), allowedActions: [], log: () => {}, warn: () => {} });
    const st = await mod.start();
    expect(st.url, '★ off 档不应启动端点').toBe('');
    expect(st.mode).toBe('off');
    process.env.YZ_BROWSER_BRIDGE = 'on';
  });

  it('★ 非法档位回落 off', async () => {
    process.env.YZ_BROWSER_BRIDGE = 'bogus';
    const mod = freshBridge();
    mod.attach({ runAction: async () => ({}), allowedActions: [], log: () => {}, warn: () => {} });
    const st = await mod.start();
    expect(st.mode).toBe('off');
    expect(st.url, '★ 非法档位不应启动端点').toBe('');
    process.env.YZ_BROWSER_BRIDGE = 'on';
  });
});

describe('⑦ server 侧纯函数（真跑）', () => {
  it('★★★ decideBrowserExecution：off→frontend / shadow 只读→bridge / shadow 写→frontend / on→bridge', async () => {
    const { decideBrowserExecution } = await import('../src/browser-bridge.js');
    const URL = 'http://127.0.0.1:1/v1/browser/action';
    const setEnv = (mode: string, withUrl = true) => {
      process.env.YZ_BROWSER_BRIDGE = mode;
      if (withUrl) { process.env.YZ_BROWSER_BRIDGE_URL = URL; process.env.YZ_BROWSER_BRIDGE_TOKEN = 't'; }
      else { delete process.env.YZ_BROWSER_BRIDGE_URL; delete process.env.YZ_BROWSER_BRIDGE_TOKEN; }
    };
    setEnv('off'); expect(decideBrowserExecution('navigate'), 'off 档应走前端').toBe('frontend');
    setEnv('shadow'); expect(decideBrowserExecution('get_page_content'), 'shadow+只读应走桥').toBe('bridge');
    setEnv('shadow'); expect(decideBrowserExecution('navigate'), 'shadow+写应走前端').toBe('frontend');
    setEnv('on'); expect(decideBrowserExecution('navigate'), 'on 档全走桥').toBe('bridge');
    setEnv('strict'); expect(decideBrowserExecution('click'), 'strict 全走桥').toBe('bridge');
    setEnv('on', false); expect(decideBrowserExecution('click'), '★ 缺 URL/token 时必须回落前端（否则静默失败）').toBe('frontend');
    setEnv('off');
    delete process.env.YZ_BROWSER_BRIDGE;
  });

  it('★★ toolNameToAction：browser_xxx → xxx（与渲染层推导规则一致）', async () => {
    const { toolNameToAction } = await import('../src/browser-bridge.js');
    expect(toolNameToAction('browser_get_page_content')).toBe('get_page_content');
    expect(toolNameToAction('browser_navigate')).toBe('navigate');
  });

  it('★★★ formatBridgeResult：关键分支真跑（不是只断言符号）', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const t = formatBridgeResult('get_page_content', {
      url: 'https://a.com', title: 'A', text: '正文', interactiveCount: 2,
      interactive: [{ index: 1, tag: 'a', text: '链接' }, { index: 2, tag: 'input', placeholder: '搜索' }],
    });
    expect(t, '★ 缺 URL/Title').toContain('URL: https://a.com');
    expect(t, '★ 缺可见文本').toContain('正文');
    expect(t, '★ 缺编号元素').toContain('[1] a "链接"');
    expect(t, '★ 缺 placeholder 渲染').toContain('[ph:搜索]');

    const s = formatBridgeResult('screenshot', { file: 'C:/tmp/shot.png' });
    expect(s, '★ 截图路径未回传（会导致归档失败）').toContain('已存档: C:/tmp/shot.png');

    const d = formatBridgeResult('get_dom', { nodeCount: 42 });
    expect(d).toContain('DOM 节点数: 42');
  });
});

describe('⑧ ★★★ 端到端真跑：不依赖渲染层（本任务的验收核心）', () => {
  it('★★★ 没有任何渲染层 / SSE 订阅者的前提下，浏览器 action 仍能执行成功', async () => {
    calls.length = 0;
    stubResult = { url: 'https://baidu.com', title: '百度一下' };
    const r = await post({ convId: 'conv-e2e', action: 'navigate', args: { url: 'https://baidu.com' } });
    // ★ 这里没有 Electron、没有渲染层、没有 SSE —— 只有服务端直连桥。
    //   ⇒ 证明"执行浏览器工具"这件事**结构上不再依赖 UI 层**（本任务要消除的正是这条依赖）。
    expect(r.status).toBe(200);
    expect(r.json.title).toBe('百度一下');
    expect(calls.length).toBe(1);
    expect(calls[0].convId).toBe('conv-e2e');
  });
});