// 服务端浏览器「写操作串行锁」——回归测试（2026-10-09）。
//
// 背景（真缺陷）：服务端 Playwright 是**进程级单例**（browserInstance / pageInstance /
// activeTabId 都是模块级单值）。多个 pageAgent 或一批并发 browser_* 同时操作会互相抢活动页，
// 表现为「多个 pageAgent 只有一个在动 / 结果错乱」。
//
// 这里钉住：
//   1) 写操作路由确实被 withBrowserLock 包上（navigate/action/back/forward/refresh/close/focus）；
//   2) 读操作（state/screenshot/...）**不**串行（否则 UI 轮询会排队卡住）；
//   3) 锁实现是 FIFO 排队 + finally 释放（异常也不丢锁）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, '../src/routes/browser.ts'), 'utf8');

describe('服务端浏览器写操作串行', () => {
  it('★ 写路由被 withBrowserLock 包上（原 7 个 + 2026-10-09 补的 3 个旁路写入口）', () => {
    // ★ 2026-10-09：从 7 个增至 10 个 —— 补了三个**真正的写操作**（此前按"HTTP 方法"判定而漏掉）：
    //   · `/render`：GET 却在 `page.goto()`（**导航就是写**，且被预览面板高频调用）
    //   · `/login-saved`：goto + click
    //   · `/passwords/:id/fill`：locator().fill()
    //   原断言 `toBe(7)` 是**等值**断言 → 正常增强后必红。改为**逐个列出 + 下界**：
    //   漏一个就红（强度不降），新增一个也不会假红。
    const n = (SRC.match(/withBrowserLock\(async/g) || []).length;
    expect(n, '★ 被锁包裹的 handler 数不得少于 10（漏一个就跨会话错页）').toBeGreaterThanOrEqual(10);
    for (const p of ['/navigate', '/action', '/back', '/forward', '/refresh', '/close', '/focus']) {
      expect(SRC).toContain(`router.post('${p}', withBrowserLock(`);
    }
    // ★ 新增的三个：两个精确路径 + 一个带参路径
    expect(SRC, '★ /render 未进锁（GET 但会 page.goto，是写）').toContain(`router.get('/render', withBrowserLock(`);
    expect(SRC, '★ /login-saved 未进锁').toContain(`router.post('/login-saved', withBrowserLock(`);
    expect(SRC, '★ /passwords/:id/fill 未进锁').toContain(`router.post('/passwords/:id/fill', withBrowserLock(`);
  });

  it('★ 读操作不串行（避免 UI 轮询排在长操作后）', () => {
    for (const p of ['/state', '/screenshot', '/downloads', '/history', '/stats']) {
      expect(SRC).not.toContain(`router.get('${p}', withBrowserLock(`);
    }
  });

  it('锁用白名单判定：只有写操作进队列', () => {
    const i = SRC.indexOf('const BROWSER_SERIAL_PATHS');
    expect(i).toBeGreaterThan(-1);
    const win = SRC.slice(i, i + 800);
    expect(win).toContain("'/navigate'");
    expect(win).toContain("'/action'");
    // ★ 2026-10-09 收敛：判定出口由 `BROWSER_SERIAL_PATHS.has(req.path)` 改为
    //   `isBrowserSerialPath(req.path)` —— 因为 `/passwords/:id/fill` 是**带参路径**，
    //   精确 Set 匹不上，必须叠加正则；判定只能有一个出口（两处判定必然漂移）。
    expect(win, '★ 白名单判定出口缺失（带参路由无法进锁）').toContain('isBrowserSerialPath');
    expect(win, '★ 带参写路由的正则缺失').toContain('BROWSER_SERIAL_PATTERN');
  });

  it('★ 锁在 finally 释放（异常也不丢锁，否则永久阻塞）', () => {
    const i = SRC.indexOf('function withBrowserLock');
    expect(i).toBeGreaterThan(-1);
    const win = SRC.slice(i, i + 1200);
    expect(win).toContain('finally');
    expect(win).toContain('browserQueue.shift()');
    expect(win).toContain('browserBusy = false');
  });
});