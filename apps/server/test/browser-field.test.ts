/**
 * 办公模式「浏览器现场」提示词注入测试（2026-10-25）。
 *
 * 覆盖三层：
 *   ① 真跑拼装：起**真实桥**（loopback HTTP，做法同 browser-bridge-e2e.test.ts），
 *      server 侧 loadBrowserFieldContext 真发请求 → 验证段落内容
 *      （面板展开/收起两态、tabId/标题/URL、用户页勿关标注、快照说明）。
 *   ② 降级：桥 env 缺失 / 指向死端口 / 业务错（HTTP 200 + {error}）→ 一律返回 ''，绝不抛错。
 *   ③ 源码守门（防"注入点被顺手删掉 / 另写一份清单格式化"）：
 *      - llm-task-manager 两个注入点（createTask 主循环 + runSubAgentImpl 子智能体合流点）
 *        都存在且都有 office 门控（预览面板只存在于办公模式，见 ChatPreviewPane）；
 *      - main.cjs 的 get_tabs 响应带 panelVisible（桌面端数据源不能丢）；
 *      - browser-field.ts 复用 formatBridgeResult（同一语义只有一处实现）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { loadBrowserFieldContext } from '../src/services/browser-field.js';
// ★ 路径必须逐字一致（守门测试盯着的那个约定）：主进程注入的是 `state.url + BRIDGE_PATH`，
//   测试同样要带上 —— 光用 st.url 会打到根路径被 deny 成 404，表现为"桥怎么都不通"。
import { BRIDGE_PATH } from '../src/browser-bridge.js';

const require = createRequire(import.meta.url);
const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

/** 去掉注释（防"注释满足断言"那类假绿 —— 本项目反复栽过的坑） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

// ── 桥桩：只实现 get_tabs，返回可控载荷 ──
let stubTabs: any = { tabs: [], activeTabId: null, panelVisible: true };

let bridge: any;
const SAVED: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const k of ['YZ_BROWSER_BRIDGE', 'YZ_BROWSER_BRIDGE_URL', 'YZ_BROWSER_BRIDGE_TOKEN']) {
    SAVED[k] = process.env[k];
  }
  process.env.YZ_BROWSER_BRIDGE = 'on';
  bridge = require(resolve(REPO, 'apps/desktop/browser-bridge.cjs'));
  bridge.attach({
    runAction: async (_convId: string, _tabId: string | null, action: string) => {
      if (action !== 'get_tabs') return { error: 'unexpected action: ' + action };
      return stubTabs;
    },
    allowedActions: ['get_tabs'],
    log: () => {},   // 静音（避免污染测试输出）
    warn: () => {},
  });
  const st = await bridge.start();
  process.env.YZ_BROWSER_BRIDGE_URL = st.url + BRIDGE_PATH;
  process.env.YZ_BROWSER_BRIDGE_TOKEN = st.token;
});

afterAll(() => {
  try { bridge.close(); } catch { /* ignore */ }
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

/** 两页现场：tab-1 用户手开且当前激活（勿关），tab-2 agent 开的且在加载中 */
const TWO_TABS = {
  activeTabId: 'tab-1',
  panelVisible: true,
  tabs: [
    { tabId: 'tab-1', url: 'https://example.com/report', title: '月度报表', scope: 'preview', agentOpened: false, active: true, suspended: false, loading: false },
    { tabId: 'tab-2', url: 'https://search.example.com/?q=%E6%8A%A5%E8%A1%A8', title: '搜索结果', scope: 'preview', agentOpened: true, active: false, suspended: false, loading: true },
  ],
};

describe('① 真跑拼装（真实桥 + 真实 fetch）', () => {
  it('★ 展开 + 两页：段落含面板状态 / tabId / 标题 / URL / 勿关标注', async () => {
    stubTabs = TWO_TABS;
    const out = await loadBrowserFieldContext('conv-test');
    expect(out, '★ 应注入非空段落').toContain('## 浏览器现场');
    expect(out).toContain('预览面板：展开');
    // tab 清单来自 formatBridgeResult('get_tabs')：字段与工具结果同口径
    expect(out).toContain('tab-1');
    expect(out).toContain('月度报表');
    expect(out).toContain('https://example.com/report');
    expect(out).toContain('[用户页·勿关]');
    expect(out).toContain('tab-2');
    expect(out).toContain('[可关]');
    expect(out).toContain('搜索结果');
    // 收尾说明：告诉模型这是快照、怎么拿最新、怎么定点操作
    expect(out).toContain('browser_get_tabs');
    expect(out).toContain('tabId');
  });

  it('★ 收起：状态行为"收起"且带隐藏态指引（引导用户展开，而不是盲试读取）', async () => {
    stubTabs = { ...TWO_TABS, panelVisible: false };
    const out = await loadBrowserFieldContext('conv-test');
    expect(out).toContain('预览面板：收起');
    expect(out).toContain('展开预览面板');
  });

  it('★ panelVisible 缺失（旧桌面端）：按展开兜底，不误报"收起"', async () => {
    const { panelVisible: _omit, ...legacy } = TWO_TABS as any;
    stubTabs = legacy;
    const out = await loadBrowserFieldContext('conv-test');
    expect(out).toContain('预览面板：展开');
    expect(out).not.toContain('预览面板：收起');
  });

  it('★ 空列表：仍有面板状态行与"浏览页 0 个"', async () => {
    stubTabs = { tabs: [], activeTabId: null, panelVisible: true };
    const out = await loadBrowserFieldContext('conv-test');
    expect(out).toContain('预览面板：展开');
    expect(out).toContain('浏览页 0 个');
  });
});

describe('② 降级（任何失败都不注入、不抛错）', () => {
  it('★ 桥 env 缺失（web/移动端/独立 server）→ 空串', async () => {
    const savedUrl = process.env.YZ_BROWSER_BRIDGE_URL;
    delete process.env.YZ_BROWSER_BRIDGE_URL;
    try {
      const out = await loadBrowserFieldContext('conv-test');
      expect(out).toBe('');
    } finally {
      process.env.YZ_BROWSER_BRIDGE_URL = savedUrl;
    }
  });

  it('★ 桥指向死端口（传输层失败）→ 空串', async () => {
    const savedUrl = process.env.YZ_BROWSER_BRIDGE_URL;
    process.env.YZ_BROWSER_BRIDGE_URL = 'http://127.0.0.1:9'; // 端口 9（discard）无人监听
    try {
      const out = await loadBrowserFieldContext('conv-test');
      expect(out).toBe('');
    } finally {
      process.env.YZ_BROWSER_BRIDGE_URL = savedUrl;
    }
  });

  it('★ 业务错（HTTP 200 + {error}）→ 空串', async () => {
    stubTabs = { error: '页面未就绪' };
    const out = await loadBrowserFieldContext('conv-test');
    expect(out).toBe('');
  });
});

describe('③ 源码守门（注入点与数据源不能被顺手删掉）', () => {
  const LTM = stripComments(read('apps/server/src/llm-task-manager.ts'));
  const MAIN = stripComments(read('apps/desktop/main.cjs'));
  const FIELD = stripComments(read('apps/server/src/services/browser-field.ts'));

  it('★★ 两个注入点都在：createTask 主循环 + runSubAgentImpl 子智能体合流点', () => {
    const n = (LTM.match(/await loadBrowserFieldContext\(/g) || []).length;
    expect(n, `★ 注入点应为 2 处（主循环 + 子智能体），实际 ${n}`).toBe(2);
  });

  it('★ 两处都有 office 门控（预览面板只存在于办公模式）', () => {
    expect(LTM, '★ 主循环缺 office 门控').toMatch(/resolveConversationMode\(convId\) === 'office'/);
    expect(LTM, '★ 子智能体合流点缺 office 门控').toMatch(/resolveConversationMode\(task\.conversationId\) === 'office'/);
  });

  it('★ 桌面端数据源：get_tabs 响应带 panelVisible（按实时可见性计算）', () => {
    // 2026-10-26：返回体改成多行，且 panelVisible 不再回缓存（多窗口下会被另一窗口的
    // hide() 永久置假）—— 守门改为切块断言，避免把"修复"误判成"字段被删"。
    const start = MAIN.indexOf("case 'get_tabs'");
    expect(start, '★ 找不到 main.cjs 的 get_tabs 分支').toBeGreaterThanOrEqual(0);
    const end = MAIN.indexOf("case 'wait_for_request'", start + 1);
    const block = MAIN.slice(start, end > start ? end : undefined);
    expect(block, '★ main.cjs get_tabs 丢了 panelVisible').toMatch(/panelVisible:/);
    expect(block, '★ panelVisible 不得回缓存，必须走 panelReallyHidden 现算').toMatch(
      /panelVisible:\s*!panelReallyHidden\(/,
    );
  });

  it('★ tab 清单复用 formatBridgeResult（不得另写第二份清单格式化）', () => {
    expect(FIELD, '★ browser-field 必须复用 formatBridgeResult').toMatch(/formatBridgeResult\('get_tabs'/);
    expect(FIELD, '★ 不应在 browser-field 里另写 tab 行拼接').not.toMatch(/join\('\\n'\).*tabId|tabId.*join\('\\n'\)/);
  });
});
