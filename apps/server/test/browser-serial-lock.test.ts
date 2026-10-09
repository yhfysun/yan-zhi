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
  it('★ 写路由被 withBrowserLock 包上（7 个入口全覆盖）', () => {
    const n = (SRC.match(/withBrowserLock\(async/g) || []).length;
    expect(n).toBe(7);
    for (const p of ['/navigate', '/action', '/back', '/forward', '/refresh', '/close', '/focus']) {
      expect(SRC).toContain(`router.post('${p}', withBrowserLock(`);
    }
  });

  it('★ 读操作不串行（避免 UI 轮询排在长操作后）', () => {
    for (const p of ['/state', '/screenshot', '/downloads', '/history', '/stats']) {
      expect(SRC).not.toContain(`router.get('${p}', withBrowserLock(`);
    }
  });

  it('锁用白名单判定：只有写操作进队列', () => {
    const i = SRC.indexOf('const BROWSER_SERIAL_PATHS');
    expect(i).toBeGreaterThan(-1);
    const win = SRC.slice(i, i + 400);
    expect(win).toContain("'/navigate'");
    expect(win).toContain("'/action'");
    expect(win).toContain('BROWSER_SERIAL_PATHS.has(req.path)');
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