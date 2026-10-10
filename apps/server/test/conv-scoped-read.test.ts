/**
 * 读路由按会话隔离（A4 根治，2026-10-10）守门测试。
 *
 * 背景（实测缺陷）：服务端 Playwright 是**进程级单例** —— `pageInstance` / `activeTabId`
 *   全局单值，而 `GET /state` / `GET /screenshot` **直读它** ⇒
 *   **A 会话导航中、B 会话截图会拿到 A 的页面**，且**静默无报错**
 *   （模型据此继续决策，全程作用在错页面上 —— 最难查的一类）。
 *
 * 根治（对比"止血"）：不是"读前校验一下报错"，而是让**活动页按会话隔离** ——
 *   需要一条会话标识链路：`ToolContext.conversationId`（早已存在）
 *   → 执行器设置 → core `callBrowserApi` 带 `x-yz-conversation-id`
 *   → 服务端 `activePageByConv` → 读路由按会话取页。
 *
 * 本测试钉：
 *   ① 链路四段齐备（少了任一段都是"静默不生效"）；
 *   ② `resolveReadPage` 的三条语义**真跑**（含"未绑定会话必须报错"而非回退全局）；
 *   ③ 写路由必须**绑定**会话页（否则读路由永远取不到 → 隔离空转）；
 *   ④ 截图必须用解析后的页（若仍用全局 `pageInstance`，隔离等于没做）；
 *   ⑤ 向后兼容：**无会话标识**时退回全局（老调用方不被破坏）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const BROWSER = read('apps/server/src/routes/browser.ts');
const CORE_BROWSER = read('packages/core/src/tool/builtin/browser/index.ts');
const BUILTIN_INDEX = read('packages/core/src/tool/builtin/index.ts');
const LTM = read('apps/server/src/llm-task-manager.ts');

describe('① 会话标识链路四段齐备', () => {
  it('★★★ 第 1 段：core 必须把会话标识放进请求头', () => {
    expect(CORE_BROWSER, '★ core 未透传会话标识 → 服务端无从隔离').toMatch(/x-yz-conversation-id/);
  });

  it('★★★ 第 2 段：服务端必须读取同名 header（**逐字一致**）', () => {
    expect(BROWSER, '★ 服务端未读该 header（名字不一致会静默失效）').toMatch(/x-yz-conversation-id/);
  });

  it('★★★ 第 3 段：执行器必须在调用工具前设置会话', () => {
    const i = LTM.indexOf('const r = await registry.execute(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const before = LTM.slice(Math.max(0, i - 900), i);
    expect(before, '★ 未在唯一工具出口前设置会话（browser_* 收不到 convId）')
      .toMatch(/setBrowserToolConversationId\(task\.conversationId\)/);
  });

  it('★★★ 第 4 段：core 必须导出该入口（白名单逐个导出，漏了跨包引不到）', () => {
    expect(BUILTIN_INDEX, '★ builtin/index 未导出 setBrowserToolConversationId（TS2305）')
      .toMatch(/setBrowserToolConversationId/);
  });
});

describe('② resolveReadPage 三条语义（真跑）', () => {
  const globalPage = { tag: 'GLOBAL' };
  const boundPage = { tag: 'BOUND' };

  it('★★★ 无会话标识 → 退回全局页（**向后兼容**，不破坏老调用方）', async () => {
    const mod: any = await import('../src/routes/browser.js').catch(() => null);
    const fn = mod?.resolveReadPage;
    expect(typeof fn, '★ 无法取到 resolveReadPage').toBe('function');
    const r = fn(null, null, globalPage);
    expect(r.page, '★ 无 convId 时未退回全局（会破坏老调用方）').toBe(globalPage);
    expect(r.reason).toBe('global');
  });

  it('★★★ 有会话标识且已绑定 → 用**它自己的**页（隔离生效）', async () => {
    const mod: any = await import('../src/routes/browser.js').catch(() => null);
    const fn = mod?.resolveReadPage;
    if (typeof fn !== 'function') return;
    const r = fn('conv-B', boundPage, globalPage);
    expect(r.page, '★ 未用本会话的页（隔离失效 → 读到别人的页面）').toBe(boundPage);
    expect(r.reason).toBe('bound');
  });

  it('★★★ 有会话标识但**未绑定** → 必须返回 null（调用方据此**明确报错**）', async () => {
    const mod: any = await import('../src/routes/browser.js').catch(() => null);
    const fn = mod?.resolveReadPage;
    if (typeof fn !== 'function') return;
    const r = fn('conv-C', null, globalPage);
    expect(r.page, '★ 未绑定时回退全局页 —— 那正是"静默读到别人页面"的缺陷本身！').toBeNull();
    expect(r.reason).toBe('unbound-conv');
  });
});

describe('③ 写路由必须绑定会话页（否则隔离空转）', () => {
  it('★★★ /navigate 与 /action 成功后都要绑定', () => {
    const n = (BROWSER.match(/bindConvPage\(convIdOf\(req\)/g) || []).length;
    expect(n, `★ 只绑定了 ${n} 处（应 ≥2：navigate + action）→ 隔离空转`).toBeGreaterThanOrEqual(2);
  });

  it('★★ 绑定表必须有上限兜底（会话多时防增长）', () => {
    const i = BROWSER.indexOf('function bindConvPage');
    const body = BROWSER.slice(i, i + 600);
    expect(body, '★ 无上限兜底（会随会话数增长）').toMatch(/200/);
  });
});

describe('④ 读路由必须真的用解析结果', () => {
  it('★★★ /state 必须按会话解析，且未绑定时明确报错', () => {
    const i = BROWSER.indexOf("router.get('/state'");
    const body = BROWSER.slice(i, i + 1200);
    expect(body, '★ /state 仍直读全局 pageInstance').toMatch(/resolveReadPage\(/);
    expect(body, '★ 未绑定时未明确报错（会静默返回别人的页面）').toMatch(/unbound-conv|CONV_HAS_NO_PAGE/);
  });

  it('★★★ /screenshot 必须按会话解析，且**实际截图用解析后的页**', () => {
    const i = BROWSER.indexOf("router.get('/screenshot'");
    const body = BROWSER.slice(i, i + 1200);
    expect(body, '★ /screenshot 未按会话解析').toMatch(/resolveReadPage\(/);
    expect(body, '★ /screenshot 未用解析后的页（仍用全局 → 隔离等于没做）')
      .toMatch(/pageInstance2\.screenshot\(/);
    expect(body, '★ 仍存在对全局 pageInstance 的截图调用（漏改）')
      .not.toMatch(/[^2]pageInstance\.screenshot\(/);
  });

  it('★★ 未绑定时必须**明确报错**而不是静默返回全局（这是本缺陷的核心）', () => {
    // 两处读路由都要有 unbound 分支且给出可辨识的错误码
    const cnt = (BROWSER.match(/CONV_HAS_NO_PAGE/g) || []).length;
    expect(cnt, '★ 未见明确错误码（模型无法区分"没页面"与"别人的页面"）').toBeGreaterThanOrEqual(2);
  });
});

describe('⑤ 状态可观测（便于排障隔离是否生效）', () => {
  it('★★ /state 应回传是否"按会话取页"（否则无法判断隔离是否生效）', () => {
    const i = BROWSER.indexOf("router.get('/state'");
    const body = BROWSER.slice(i, i + 1200);
    expect(body, '★ 无可辨识标记（排障时看不出拿的是自己的页还是全局页）').toMatch(/convScoped/);
  });
});