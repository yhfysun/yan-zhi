/**
 * 前端静态资源解析守门测试（2026-10-11，根治「dev 前端被旧快照冒充」）。
 *
 * ── 背景（用户实据痛点）───────────────────────────────────────────────────────
 *   用户原话：「一运行整个页面卡死」「浏览器操作不知道修复没」。
 *   实测铁证链：
 *     · 主进程日志：`[web] 前端静态资源已托管: C:\...\apps\desktop\dist`
 *     · 3001 返回的 index.html 引用 `./assets/index-aKw4O86.js`（**Oct 8 的构建产物**）
 *     · 该文件里 `componentAlive` 出现 **0 次** ⇒ 当天 BrowserPanel 全部修复
 *       （componentAlive 重置 / 监听器前移 / scope 放宽 / tab 上限收口）**一个都没被加载**
 *     · 于是 11:04 / 11:26 / 11:43 反复 `wc=NULL(8s 超时)`、tab 号跳格 —— 全是旧构建的锅。
 *
 *   根因：`resolveWebDist()` 曾有**两级优先级** ——
 *     ① `WEB_DIST` 环境变量；② 从源码目录向上爬 6 层找 `apps/web/dist`、`apps/desktop/dist`。
 *   第 ② 条是灾难：dev 下 `main.cjs` 注入的 `WEB_DIST=apps/web/dist` **该目录根本不存在**
 *   （monorepo 源码相对路径，仓库从没构建过）⇒ 第 ① 条落空 ⇒ 第 ② 条爬目录 ⇒
 *   **恰好爬中 `apps/desktop/dist`（陈旧快照）** ⇒ 托管它 ⇒ 盖掉 Vite (1420)。
 *
 * ── 本测试钉 ────────────────────────────────────────────────────────────────
 *   ① `resolveWebDist` 源码中**不存在**任何"向上爬目录猜 dist"的逻辑（防回退）；
 *   ② 只认两个显式来源：`WEB_DIST`（生产注入）、`YZ_SERVE_WEB_DIST`（dev 显式开关）；
 *   ③ 两条都没给时**必须返回 null**（dev 默认不托管 → 窗口走 Vite）；
 *   ④ `main.cjs` 的 dev 分支**不得**再注入 WEB_DIST（生产分支必须保留）；
 *   ⑤ `bin/dev.mjs` 具备"前端来源实测断言"（第二道防线）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_SRC = readFileSync(resolve(__dirname, '..', 'src', 'index.ts'), 'utf8');
const MAIN_SRC = readFileSync(resolve(__dirname, '..', '..', 'desktop', 'main.cjs'), 'utf8');
const DEV_MJS = readFileSync(resolve(__dirname, '..', '..', '..', 'bin', 'dev.mjs'), 'utf8');

/** 抽出 resolveWebDist 函数体（从声明到第一个顶层 `}` 收口） */
function extractResolveWebDist(src: string): string {
  const start = src.indexOf('function resolveWebDist()');
  expect(start, '★ 未找到 resolveWebDist 声明 —— 函数被改名/删除？').toBeGreaterThan(-1);
  // 以 "\n}" 作为顶层收口（函数内缩进均为 2 空格，故 "\n}" 必为函数结尾）
  const end = src.indexOf('\n}', start);
  expect(end, '★ resolveWebDist 未能定位结尾').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('前端静态资源解析（2026-10-11 根治 dev 被旧快照冒充）', () => {
  const FN = extractResolveWebDist(INDEX_SRC);

  it('★★★ 绝不允许"向上爬目录猜 dist"的逻辑存在（本次事故的直接根源）', () => {
    // 旧的爬目录骨架：for 循环 + path.dirname 向上 + 拼 apps/web/dist、apps/desktop/dist
    expect(FN, '★ 检测到 for 循环爬目录（向上查找 dist）—— 这正是"旧快照冒充 dev 前端"的元凶')
      .not.toMatch(/for\s*\(/);
    expect(FN, '★ 检测到向上取父目录（path.dirname(dir) 式爬升）')
      .not.toMatch(/path\.dirname\(\s*dir\s*\)/);
    expect(FN, '★ 检测到硬编码 app 源码目录下的 dist 路径（apps/web/dist 或 apps/desktop/dist）')
      .not.toMatch(/apps[\\/](web|desktop)[\\/]dist/);
  });

  it('★ 只认两个显式来源：WEB_DIST 与 YZ_SERVE_WEB_DIST', () => {
    expect(FN, '★ 缺少 WEB_DIST（生产注入）来源').toContain('process.env.WEB_DIST');
    expect(FN, '★ 缺少 YZ_SERVE_WEB_DIST（dev 显式开关）来源').toContain('process.env.YZ_SERVE_WEB_DIST');
  });

  it('★ 未显式提供来源时必须返回 null（dev 默认不托管 → 窗口走 Vite）', () => {
    // 函数尾部必须是 `return null`（两条显式来源都不命中时的兜底）
    expect(FN, '★ resolveWebDist 未以 return null 兜底 —— dev 可能又去"猜"前端')
      .toMatch(/return null;\s*$/);
    // 且不得有任何其它非显式的返回路径（除两个 if 内的 return 外）
    const returns = FN.match(/return\s+[^;]+;/g) || [];
    expect(returns.length, '★ 返回路径数量异常（预期：WEB_DIST 命中 / 开关命中 / null 兜底）')
      .toBeLessThanOrEqual(4);
  });

  it('★★ main.cjs：dev 分支不得注入 WEB_DIST，生产分支必须保留', () => {
    // 统计 WEB_DIST 赋值点：只应剩生产分支那一处
    const assigns = MAIN_SRC.match(/WEB_DIST:\s*path\.join\(/g) || [];
    expect(assigns.length, '★ main.cjs 中 WEB_DIST 注入点数量异常（预期仅生产分支 1 处）')
      .toBe(1);
    expect(MAIN_SRC, '★ 生产分支的 WEB_DIST 注入丢失 —— 安装版局域网访问会失效')
      .toContain("WEB_DIST: path.join(process.resourcesPath, 'server', 'web-dist')");
    // dev 分支那个从未存在的 apps/web/dist 相对路径不得再出现
    expect(MAIN_SRC, "★ dev 分支仍在注入 apps/web/dist（该目录从不存在的死路径）")
      .not.toMatch(/WEB_DIST:\s*path\.join\(\s*__dirname\s*,\s*'\.\.'\s*,\s*'\.\.'\s*,\s*'apps'\s*,\s*'web'\s*,\s*'dist'\s*\)/);
  });

  it('★★ bin/dev.mjs：具备"后端是否在托管打包快照"的实测断言（第二道防线）', () => {
    expect(DEV_MJS, '★ 缺少 assertFrontendServedByVite 断言函数')
      .toContain('assertFrontendServedByVite');
    expect(DEV_MJS, '★ 断言函数未纳入启动流程（定义但未调用）')
      .toMatch(/await\s+assertFrontendServedByVite\(/);
    // 断言必须能识别"打包产物特征"（./assets/index-*.js）与"Vite 特征"（/@vite/client）
    expect(DEV_MJS, '★ 断言未识别打包产物特征 assets/index-*.js')
      .toMatch(/assets\/index-/);
    expect(DEV_MJS, '★ 断言未识别 Vite 特征 /@vite/client')
      .toContain('/@vite/client');
  });

  it('★ 未托管分支必须留下可观测日志（排障命门：能一眼看出 3001 有没有提供前端）', () => {
    expect(INDEX_SRC, '★ "未托管"分支静默 —— 出事故时无法从日志判断前端来源')
      .toMatch(/未托管前端静态资源/);
  });
});
