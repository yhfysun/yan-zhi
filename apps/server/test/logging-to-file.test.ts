/**
 * 日志落盘守门测试（2026-10-10，用户实据痛点）。
 *
 * ── 背景 ────────────────────────────────────────────────────────────────────
 *   用户原话：「你写的应用都不打印日志啊……这不都是问题？」
 *   排查 2026-10-10 那次「pageAgent 打不开页面」时，**三端日志全都拿不到**：
 *     · 服务端（`services/logger.ts`）：只写 stdout —— dev 由 `bin/dev.mjs` 以
 *       `stdio:'inherit'` 打到终端，**不落任何文件**；终端一关现场就没了；
 *     · 主进程（`main.cjs`）：50 处 `console.*` 只进终端；且**只有打包分支**有
 *       `server.log` 落盘，dev 分支完全没有；
 *     · 渲染进程：`console.*` 只在 devtools，关了就没。
 *   ⇒ 结果：排障只能"读数据库反推"，极易归因错误（本会话已实际踩到）。
 *
 * ── 本测试钉 ────────────────────────────────────────────────────────────────
 *   ① 服务端 logger 真能落盘，且落盘失败时**不影响业务**（降级为仅控制台）；
 *   ② 服务端启动序列真的调用了 `configureLogger`（防回退）；
 *   ③ 主进程日志模块存在、导出齐全、且 `main.cjs` 在 **setPath 之后**安装它；
 *   ④ 渲染进程 console 被接管（否则浏览器面板的日志永远看不见）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureLogger, createLogger, currentLogFile } from '../src/services/logger.js';

const INDEX_SRC = readFileSync(resolve(__dirname, '..', 'src', 'index.ts'), 'utf8');
const MAIN_SRC = readFileSync(resolve(__dirname, '..', '..', 'desktop', 'main.cjs'), 'utf8');
const MAIN_LOG_PATH = resolve(__dirname, '..', '..', 'desktop', 'main-log.cjs');

describe('服务端日志落盘（2026-10-10 实据）', () => {
  it('★★ 配置目录后，日志真的写进文件（此前只有 stdout，重启即丢）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yz-log-'));
    try {
      configureLogger(dir);
      const logger = createLogger('test-module');
      logger.info('hello 落盘检查', { a: 1 });
      logger.warn('warn 也要落盘');
      // createWriteStream 是异步 flush —— 给一个事件循环轮次
      await new Promise((r) => setTimeout(r, 120));
      const fp = currentLogFile();
      expect(fp, '★ currentLogFile 应指向当天日志文件').toBeTruthy();
      expect(existsSync(fp!), '★ 日志文件未创建 —— 落盘根本没生效').toBe(true);
      const text = readFileSync(fp!, 'utf8');
      expect(text, '★ info 内容未落盘').toContain('hello 落盘检查');
      expect(text, '★ warn 内容未落盘').toContain('warn 也要落盘');
      expect(text, '★ 落盘行缺少模块名（无法按模块过滤）').toContain('[test-module]');
      expect(text, '★ 落盘行缺少级别标记').toContain('[INFO]');
      // 文件名必须是"按天切分"形态（便于按出事时间点直接翻）
      const files = readdirSync(dir).filter((f) => f.startsWith('server-'));
      expect(files.some((f) => /^server-\d{4}-\d{2}-\d{2}\.log$/.test(f)), '★ 日志文件名未按天切分').toBe(true);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不影响断言 */ }
    }
  }, 20000);

  it('★ 落盘失败不得影响业务 —— 目录非法时降级为仅控制台，不抛错', () => {
    // 用一个必然无法创建的路径（Windows 下非法字符）
    expect(() => configureLogger('Z:\\\0invalid\\path')).not.toThrow();
    expect(() => {
      const l = createLogger('degraded');
      l.info('这条只进控制台，不应抛错');
      l.error('error 同样不抛');
    }).not.toThrow();
  });

  it('★ 源码层：启动序列必须配置日志目录（否则只有控制台输出）', () => {
    expect(INDEX_SRC, '★ index.ts 未调用 configureLogger —— 服务端日志不会落盘').toMatch(/configureLogger\(/);
    expect(INDEX_SRC, '★ configureLogger 未传 logs 目录').toMatch(/configureLogger\(\s*path\.join\(dataDir,\s*'logs'\)/);
  });
});

describe('主进程 / 渲染进程日志落盘（2026-10-10 实据）', () => {
  it('★ 主进程日志模块存在且导出齐全', () => {
    expect(existsSync(MAIN_LOG_PATH), '★ apps/desktop/main-log.cjs 缺失').toBe(true);
    const src = readFileSync(MAIN_LOG_PATH, 'utf8');
    expect(src, '★ 缺 installMainLogger 导出').toMatch(/installMainLogger/);
    expect(src, '★ 缺 attachRendererConsole 导出（渲染层日志收不进来）').toMatch(/attachRendererConsole/);
    expect(src, '★ 未接管 console（50 处既有调用点会全部漏掉）').toMatch(/console\[level\]\s*=/);
  });

  it('★★ main.cjs 必须在 setPath 之后安装主进程日志（否则收不到启动过程）', () => {
    const setPathIdx = MAIN_SRC.indexOf("app.setPath('userData'");
    const installIdx = MAIN_SRC.indexOf('installMainLogger(');
    expect(setPathIdx, '★ 找不到 app.setPath(userData) 调用点').toBeGreaterThan(-1);
    expect(installIdx, '★ main.cjs 未安装主进程日志 —— 50 处 console 仍只进终端').toBeGreaterThan(-1);
    expect(installIdx, '★ 主进程日志安装时机早于 setPath：会落到错误的 userData 目录').toBeGreaterThan(setPathIdx);
  });

  it('★ 渲染进程 console 必须被接管（浏览器面板排除依赖它）', () => {
    expect(MAIN_SRC, '★ 未接管渲染进程 console —— 面板日志永远查不到').toMatch(/attachRendererConsole\(/);
  });

  it('★ 浏览器动作必须有全链路日志（"面板开了却没导航"类静默失效的唯一线索）', () => {
    expect(MAIN_SRC, '★ runBrowserAction 无日志 —— 又回到"只能读代码猜"').toMatch(/\[browser-action\]/);
  });
});
