/**
 * page 重建时恢复 URL（#14，2026-10-09）守门测试。
 *
 * 背景（实测）：
 *   · `getBrowser()` **已**做浏览器级探活+重建（`isBrowserAlive` 真发一次 `version()`，
 *     假死则 `resetBrowser()` + 重连；CDP 模式带 3 次退避重试）—— 这条**本来就是通的**；
 *   · 真正的缺口在 `getPage()`：page 假死重建时**不恢复 URL**。
 *     `createTabPage` 在 CDP 模式走 `pickCdpPage`（挑任意真实网页 target）、
 *     launch 模式是全新 `about:blank` → "page 坏掉重建"会把任务**静默换到另一个页面**，
 *     模型后续点击/读取都作用在错页面上且**不报错**。
 *   · `recordPageState` 早已记录 `lastKnownUrl`、`recoverSession` 早已实现"导航回去"，
 *     但二者**从未被接线**。
 *
 * 本测试钉：
 *   ① 重建时必须恢复 `lastKnownUrl`；
 *   ② **必须用 `hadPage` 门控** —— 首次创建 / 空闲超时清空后**不得**导航到旧 URL
 *      （否则新任务会凭空跳到上个任务的页面）；
 *   ③ 恢复失败必须**不阻塞**本次调用（fail-safe）；
 *   ④ `recoverSession` 不得被**整体替换**进 getPage（它会丢掉 `ensureWebviewViaShell` 兜底）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const BROWSER = strip(read('apps/server/src/routes/browser.ts'));
/** 带注释的原始源码 —— 凡是断言"注释里写了什么"的用例必须用它（strip 会把注释删掉 → 假红） */
const BROWSER_RAW = read('apps/server/src/routes/browser.ts');

function bodyOf(s: string, needle: string, what: string): string {
  const i = s.indexOf(needle);
  expect(i, `锚点不存在：${what} → ${needle}`).toBeGreaterThan(-1);
  const rest = s.slice(i);
  const end = rest.indexOf('\n}');
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 3000);
}

describe('① 重建必须恢复 URL', () => {
  it('★★ getPage 重建路径必须导航回 lastKnownUrl', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    expect(body, '★ 重建 page 不恢复 URL → 任务被静默换到别的页面（且不报错）')
      .toMatch(/lastKnownUrl/);
    expect(body, '★ 未真正执行导航（只是读了变量）').toMatch(/page\.goto\(lastKnownUrl/);
  });

  it('★★ 导航必须带超时（假死页面上 goto 会永久挂起）', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    expect(body, '★ 恢复导航未包超时（会挂死整个调用）').toMatch(/withTimeout/);
  });

  it('★★ 已在目标 URL 时不得重复导航（该判定在纯函数里，见 ②）', () => {
    // 逻辑已抽到 `shouldRestorePageUrl`（② 组真跑验证）；
    // 这里只钉"getPage 确实委托给那个纯函数"，避免有人把判定又内联回来（内联就无法真跑验证）。
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    expect(body, '★ 判定被内联回 getPage（无法真跑验证语义）').toMatch(/shouldRestorePageUrl\(/);
  });
});

describe('② hadPage 门控（防止新任务跳到旧页面）', () => {
  // ★★★ 真跑纯函数 —— 这一组是**变异验证补出来的**：
  //   第一版只做字符串断言（"源码里有 hadPage 吗"），把 `hadPage` 写死成 `false`
  //   （恢复永不发生）时 **测试全绿** —— 典型的"断言了存在性、没断言语义"。
  //   ⇒ 判定抽成 `shouldRestorePageUrl` 纯函数，这里对**四种组合**逐个真跑。
  it('★★★ shouldRestorePageUrl：四种组合的语义必须正确', async () => {
    const mod = await import('../src/routes/browser.js').catch(() => null);
    const fn = (mod as any)?.shouldRestorePageUrl;
    expect(typeof fn, '★ 无法取到 shouldRestorePageUrl（判定未抽成可验证的纯函数）').toBe('function');
    // ① 首次创建（hadPage=false）→ **绝不**恢复（否则新任务被拽到上个任务的页面）
    expect(fn(false, 'https://a.com', 'about:blank'), '★ hadPage=false 时仍会恢复 → 新任务跳到旧页面').toBe(false);
    // ② 坏了重建 + 有 URL + 不在该 URL → 恢复
    expect(fn(true, 'https://a.com', 'about:blank'), '★ 应恢复却不恢复（缺口未真正修好）').toBe(true);
    // ③ 已在目标 URL → 不重复导航
    expect(fn(true, 'https://a.com', 'https://a.com'), '★ 已在目标 URL 仍重载').toBe(false);
    // ④ 无记录 URL → 无可恢复
    expect(fn(true, '', 'about:blank'), '★ 无 lastKnownUrl 却尝试恢复').toBe(false);
    // ⑤ 拿不到当前 URL（异常页）→ 尝试恢复更安全
    expect(fn(true, 'https://a.com', ''), '★ 当前 URL 不可读时未尝试恢复').toBe(true);
  });

  it('★★ 门控必须先于导航（且 getPage 里不得写死条件）', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    expect(body, '★ 未用纯函数门控').toMatch(/shouldRestorePageUrl\(/);
    const gateIdx = body.indexOf('shouldRestorePageUrl(');
    const gotoIdx = body.indexOf('page.goto(lastKnownUrl');
    expect(gateIdx, '★ 门控在导航之后（等于没门控）').toBeLessThan(gotoIdx);
    // ★ 不得出现"写死条件"的形态（变异验证抓过 `if (false)`）
    expect(body, '★ 出现写死的恢复条件（如 if(false)/恒真）').not.toMatch(/if \(false\)/);
  });

  it('★★ hadPage 必须在清空 pageInstance **之前**取值（否则恒为 false）', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    const hadIdx = body.indexOf('const hadPage');
    // 找"关闭旧 page 并置空"的位置
    const nullIdx = body.indexOf('pageInstance = null');
    expect(hadIdx, '★ 锚点缺失：hadPage').toBeGreaterThan(-1);
    expect(nullIdx, '★ 锚点缺失：pageInstance = null').toBeGreaterThan(-1);
    expect(hadIdx, '★ hadPage 取值在置空之后 → 恒 false，恢复永远不会发生（静默失效）')
      .toBeLessThan(nullIdx);
  });

  it('★★ hadPage 必须真的源自 pageInstance（不得写死）', () => {
    expect(BROWSER, '★ hadPage 未取自 pageInstance（写死会让恢复永不发生）')
      .toMatch(/const hadPage = !!pageInstance/);
  });
});

describe('③ fail-safe 与 recoverSession 定位', () => {
  it('★★ 恢复失败不得阻塞本次调用', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    // goto 后面必须 .catch 兜住
    expect(body, '★ goto 未兜错（恢复失败会冒泡，把一次普通操作变成失败）')
      .toMatch(/\.catch\(/);
    expect(body, '★ 无 catch 兜底注释/逻辑').toMatch(/不阻塞本次调用|不影响本次调用/);
  });

  it('★★★ 不得把 recoverSession 整体替换进 getPage（会丢 ensureWebviewViaShell 兜底）', () => {
    const body = bodyOf(BROWSER, 'async function getPage()', 'getPage');
    expect(body, '★ getPage 改用了 recoverSession —— 它会丢掉"自动驱动应用壳开预览面板"的兜底，是能力倒退')
      .not.toMatch(/recoverSession\(\)/);
    // 反向确认：createTabPage 的自动开面板兜底仍在
    const ctp = bodyOf(BROWSER, 'async function createTabPage', 'createTabPage');
    expect(ctp, '★ ensureWebviewViaShell 兜底消失（全自动任务会卡在浏览器连接层）')
      .toMatch(/ensureWebviewViaShell/);
  });

  it('★★ recoverSession 必须被显式标注"已接线/保留原因"（否则后人又当死代码删掉）', () => {
    // ★ 必须用**带注释的原始源码**：本断言查的就是注释内容，
    //   而 strip() 会把注释删掉 → 用 strip 后的源码必然假红（第一版就踩了）。
    const i = BROWSER_RAW.indexOf('async function recoverSession');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const before = BROWSER_RAW.slice(Math.max(0, i - 2200), i);
    expect(before, '★ 未标注接线状态（会被后来者当作死代码处理）').toMatch(/接线状态|不再是死代码/);
  });
});

describe('④ 浏览器级探活（本来就通，防回归）', () => {
  it('★★ getBrowser 必须保持"真发一次请求"级别的探活', () => {
    const body = bodyOf(BROWSER, 'async function getBrowser', 'getBrowser');
    expect(body, '★ 探活退化成只看 isConnected（不够，连接对象活着但实例可能已假死）')
      .toMatch(/isBrowserAlive/);
  });

  it('★ CDP 连接必须保持退避重试', () => {
    const body = bodyOf(BROWSER, 'async function connectCdpWithRetry', 'CDP 重试');
    expect(body, '★ 缺退避重试（一次抖动就杀死长任务）').toMatch(/setTimeout/);
  });
});