// 空白 tab（about:blank）不得被当成"已打开网页"的守门测试 —— 防 2026-10-16 用户实报回归。
//
// 背景（用户实报）：「浏览器有bug关闭唯一一个tab后。。。」——关掉最后一个标签页后，
//   浏览器没有回到起始主页，而是一片空黑，地址栏与 tab 标题都写着 about:blank。
//
// 根因（实测证据）：
//   ① 关最后一个 tab 的兜底是 `ensureTabExists()` → `newTab()`（浏览器常保 ≥1 个 tab），
//      新 tab 没有网址 ⇒ 模板里 `:src="t.srcUrl || 'about:blank'"` 让它真的去加载 about:blank；
//   ② Electron 的 `<webview src="about:blank">` **会**在渲染层触发 `did-navigate "about:blank"`
//      （本次用 electron@44 实测：新建 guest 即出该事件，日志 `blank did-navigate "about:blank"`）；
//   ③ `onWebviewNavigated` → `applyNavigated(tid, 'about:blank')` 把空白页当真实网址写回
//      `tab.url / urlInput / history` ⇒ `showHome` 变 false ⇒ 起始主页被顶掉，只剩黑底空白页，
//      且本地历史栈多一条连后退都回不去的 about:blank。
//
// 修法：`applyNavigated` 入口用 `isBlankPageUrl` 拦下空白页，把该 tab 归位成"没有页面的空标签页"
//   （清 url/urlInput/srcUrl + 清历史栈 + 清前进后退可用性），空白页**永不进历史栈**。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');

/** 按大括号配平截取具名函数的完整源码（比正则安全：函数体里可能出现 `{`） */
function fnSource(name: string): string {
  const start = PANEL.indexOf(`function ${name}(`);
  expect(start, `未找到 function ${name}(`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = PANEL.indexOf('{', start); i < PANEL.length; i++) {
    if (PANEL[i] === '{') depth++;
    else if (PANEL[i] === '}' && --depth === 0) return PANEL.slice(start, i + 1);
  }
  throw new Error(`function ${name} 大括号未配平`);
}

/** 取出 applyNavigated 函数体（到下一个顶层 function / 生命周期之前） */
function applyNavigatedBody(): string {
  const start = PANEL.indexOf('function applyNavigated(');
  expect(start, '未找到 function applyNavigated(').toBeGreaterThanOrEqual(0);
  const rest = PANEL.slice(start + 1);
  const next = rest.search(/\n(function|async function|watch|onMounted)\b/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

/** 把源码里的 TS 注解剥掉后直接求值 —— 行为断言比文本断言更硬 */
function loadIsBlankPageUrl(): (url: unknown) => boolean {
  const src = fnSource('isBlankPageUrl').replace(/\(url: string\)/, '(url)');
  const factory = new Function(`${src}; return isBlankPageUrl;`);
  return factory() as (url: unknown) => boolean;
}

describe('★ 空白页（about:blank）不是页面导航', () => {
  it('isBlankPageUrl：about:blank / 空串 判真，真实网址判假', () => {
    const isBlank = loadIsBlankPageUrl();
    // Arrange / Act / Assert —— 空白页各种形态（含大小写、锚点、前后空白）
    for (const blank of ['about:blank', 'ABOUT:BLANK', 'about:blank#x', ' about:blank ', '', '   ', null, undefined]) {
      expect(isBlank(blank), `${JSON.stringify(blank)} 应判为空白页`).toBe(true);
    }
    for (const real of ['https://www.baidu.com', 'http://127.0.0.1:5173/x', 'about:config', 'data:text/html,<b>x</b>', 'about:blank.example.com']) {
      expect(isBlank(real), `${real} 不应判为空白页`).toBe(false);
    }
  });

  it('applyNavigated 在写入 url/历史栈之前先拦下空白页并 return', () => {
    const body = applyNavigatedBody();
    const guardIdx = body.indexOf('isBlankPageUrl(url)');
    expect(guardIdx, 'applyNavigated 未用 isBlankPageUrl 拦空白页 —— about:blank 会再次写回 tab').toBeGreaterThanOrEqual(0);
    const stackIdx = body.indexOf('syncStackFromNavigation(');
    expect(stackIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx, '空白页判据必须在写历史栈之前').toBeLessThan(stackIdx);
    expect(
      body.slice(guardIdx, stackIdx),
      '空白页分支必须 return —— 否则会继续走"把 url 写回 tab"的主流程',
    ).toMatch(/return;/);
  });

  it('空白页分支把 tab 归位成空标签页（url 清空 ⇒ showHome 重新为真，起始主页可见）', () => {
    const body = applyNavigatedBody();
    const guard = body.slice(body.indexOf('isBlankPageUrl(url)'), body.indexOf('syncStackFromNavigation('));
    expect(guard, '未清 tab.url —— showHome 仍为 false，起始主页依旧被黑页顶掉').toMatch(/activeTab\.value\.url = ''/);
    expect(guard, '未清 srcUrl —— <webview> 会留在 about:blank 的黑页上').toMatch(/activeTab\.value\.srcUrl = ''/);
    expect(guard, '未清地址栏 —— 地址栏会写死 about:blank').toMatch(/urlInput\.value = ''/);
    expect(guard, '未清历史栈 —— 会多一条退不掉的 about:blank').toMatch(/history\.value = \[\]/);
    expect(guard).toMatch(/histIndex\.value = -1/);
  });

  it('空白页不污染浏览记录（recordVisit 只看 currentUrl，currentUrl 由历史栈驱动）', () => {
    // currentUrl = history[histIndex]；空白页分支清空了历史栈 ⇒ currentUrl 为空 ⇒ watch(currentUrl) 直接 return
    expect(PANEL).toMatch(/const currentUrl = computed\(\(\) => history\.value\[histIndex\.value\] \|\| ''\)/);
    expect(PANEL).toMatch(/watch\(currentUrl, \(u\) => \{\s*\n\s*if \(!u\) return;/);
  });
});
