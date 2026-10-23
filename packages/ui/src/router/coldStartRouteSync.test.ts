// 冷启动插件路由竞态守门测试 —— 防「直开 /ops 黑屏」回归。
//
// 背景（2026-10-16，前后两版）：
//   `/ops`、`/sec`、`/shop` 的模式路由是**插件贡献**的（各插件 manifest 的 contributes.routes），
//   RouteRecord 要等 `onMounted → pluginStore.refresh() → syncPluginRoutes()` 才 addRoute。
//   冷启动时用户一上来就落在这条路径上（桌面端上次会话的窗口 URL、书签、外部跳转、
//   移动端 deep link、多窗口的第二个窗口）→ 首次导航跑在 addRoute 之前。
//
//   ★ 第一版兜底是「守卫里 `await waitForPluginRoutes()`（3s，dev 曾放宽到 10s）再重导航」。
//     2026-10-16 用户实报「切到运维模式整块黑屏、控制台只有一条 No match found」后撤掉：
//       · **等待期间内容区什么都没有** —— 导航挂在 pending，`<router-view>` 不渲染，
//         深色主题下看就是"黑屏"，这段时间点哪都没反应（导航被占住）；
//       · 等待有上限，超时后照样落在「没这条路由」上 —— 后端慢（dev 现编译）时只是把黑屏推迟。
//
//   ★ 现方案（不阻塞）：让这次导航按「没匹配上」走完 → 末尾的兜底路由接住 →
//     渲染 RouteFallback（"还在载入 / 没有这个页面" + 重试 + 回对话），
//     插件路由一注册完（syncPluginRoutes → markPluginRoutesSynced）就**自动**再进一次。
//     冷启动 / 后端慢 / 插件被禁用三种情况走的是同一条路径，没有三套时序假设。
//
// 为什么是「读源码断言」而不是渲染测试：判据全是**结构可判**的
//   （信号有没有出口、守卫里有没有阻塞等待、兜底路由在不在末尾、自愈有没有防环），
//   而真跑起来要拉 pinia + 授权 store + 插件 store 并打真实接口，成本远高于收益。
//   同口径见 composables/mobilePackagingAndColdStart.test.ts 顶部说明。
// ★ 每条断言都做过变异测试（见文件末尾记录）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
const FALLBACK = readFileSync(resolve(__dirname, '../views/RouteFallback.vue'), 'utf8');

/** 去注释，避免被说明性注释绊倒（注释里同样会出现 MODE_ROUTE_KEYS / /ops 等词）。 */
const CODE = SRC
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*/gm, '');
const FALLBACK_CODE = FALLBACK
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*/gm, '');

/** 守卫体：从 beforeEach 起点到 syncPluginRoutes 定义为止。 */
const GUARD = CODE.slice(
  CODE.indexOf('router.beforeEach('),
  CODE.indexOf('export async function syncPluginRoutes'),
);
/** 同步函数体：从 syncPluginRoutes 定义到文件末尾。 */
const SYNC = CODE.slice(CODE.indexOf('export async function syncPluginRoutes'));

describe('插件路由同步信号', () => {
  it('导出 whenPluginRoutesSynced()，未同步返回待定 promise、已同步立即 resolve', () => {
    expect(CODE, '缺少导出').toMatch(/export function whenPluginRoutesSynced\(\)\s*:\s*Promise<void>/);
    expect(CODE, '已同步分支缺失').toMatch(
      /return pluginRoutesSynced \? Promise\.resolve\(\) : pluginRoutesSyncedSignal/,
    );
  });

  it('导出 arePluginRoutesSynced()：兜底页靠它区分「还在加载」与「确实没有」', () => {
    expect(CODE, '缺少导出').toMatch(/export function arePluginRoutesSynced\(\)\s*:\s*boolean/);
    expect(CODE, '不是读同一个标记').toMatch(/return pluginRoutesSynced/);
  });

  it('syncPluginRoutes() 成功跑完后点亮信号，且在 addRoute 循环之后、try 内', () => {
    // 提前标记 = 路由还没注册就宣布"就绪"（兜底页会立刻重试并再次落空）；catch 里标记 = 把失败当成功
    const loopIdx = SYNC.indexOf('router.addRoute(');
    const markIdx = SYNC.indexOf('markPluginRoutesSynced()');
    const catchIdx = SYNC.indexOf('} catch');
    expect(loopIdx, '找不到 addRoute 循环').toBeGreaterThan(-1);
    expect(markIdx, 'syncPluginRoutes 未点亮同步信号').toBeGreaterThan(loopIdx);
    expect(markIdx, '标记必须在 try 内（catch 里标记等于把失败当成功）').toBeLessThan(catchIdx);
  });

  it('★ 注册完就地自愈：当前停在无匹配页时重导航一次', () => {
    const markIdx = SYNC.indexOf('markPluginRoutesSynced()');
    const recIdx = SYNC.indexOf('recoverIfCurrentRouteUnmatched()');
    expect(recIdx, 'syncPluginRoutes 未调用自愈').toBeGreaterThan(markIdx);
    // 自愈必须"只认模式路由 + 目标确已注册"，否则会把 START_LOCATION 改写成回首页
    const fn = CODE.match(/function recoverIfCurrentRouteUnmatched\(\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到自愈函数体').not.toBe('');
    expect(fn, '自愈未认 meta.fallback（只看 matched.length 会被兜底路由喂饱）').toContain('isFallbackRoute(cur)');
    expect(fn, '自愈未限定模式路由').toContain('MODE_ROUTE_KEYS[cur.path]');
    expect(fn, '自愈未确认目标路由已注册').toContain('isModeRouteRegistered(');
    // replace 而不是 push：自愈是"修页面"，不该往历史栈里多塞一条同样的地址
    expect(fn, '自愈未用 replace（会在历史里多留一条）').toContain('router.replace({ path: cur.path');
  });
});

describe('beforeEach 不得再阻塞等插件路由（黑屏的直接成因）', () => {
  it('守卫体切片可获取', () => {
    expect(GUARD, '缺少守卫体切片').not.toBe('');
  });

  it('★ 守卫里没有 waitForPluginRoutes —— 等待期间就是黑屏', () => {
    expect(GUARD, '守卫仍在阻塞等插件路由').not.toContain('waitForPluginRoutes');
    expect(CODE, '等待函数仍存在于源码里').not.toContain('function waitForPluginRoutes');
  });

  it('★ 守卫里没有 coldStartRetried 那套重导航（与自愈/兜底页两处重复且会互相打架）', () => {
    expect(GUARD, '守卫仍在做冷启动重导航').not.toContain('coldStartRetried');
  });

  it('★ 模式记忆重定向不许指向"还没注册"的模式路由（否则每次回对话都被弹回空白页）', () => {
    // 2026-10-23 随打包裁剪改名：守卫判据从 isModeLicensed 升级为 isModeAvailable
    // （授权 ∩ 编译模式）。测试同步认新名；isModeLicensed 语义未废，仍在 store 导出。
    const at = GUARD.indexOf('isModeAvailable(activeMode.value)');
    expect(at, '找不到模式记忆重定向').toBeGreaterThan(-1);
    const cond = GUARD.slice(at, at + 260);
    expect(cond, '模式记忆重定向未确认目标路由已注册').toContain('isModeRouteRegistered(activeMode.value)');
  });

  it('授权与版本档门禁仍在守卫里（撤等待不能连着把门禁一起撤掉）', () => {
    expect(GUARD).toContain('licenseStore.init()');
    // 2026-10-23 随打包裁剪改名：isModeAvailable = 授权门禁 ∩ 构建期模式裁剪
    expect(GUARD).toContain('isModeAvailable(targetMode)');
  });
});

describe('兜底路由（无匹配时的唯一出口）', () => {
  it('★ 注册了 catch-all，且挂在 routes 数组最后（前面先命中）', () => {
    const catchIdx = CODE.indexOf("path: '/:pathMatch(.*)*'");
    const settingsIdx = CODE.indexOf("path: '/settings'");
    expect(catchIdx, '没有 catch-all 兜底路由').toBeGreaterThan(-1);
    expect(settingsIdx, '找不到 /settings（用于定位数组末尾）').toBeGreaterThan(-1);
    expect(catchIdx, 'catch-all 不在数组末尾（会抢掉后面注册的路由）').toBeGreaterThan(settingsIdx);
  });

  it('兜底路由带 meta.fallback 标记并懒加载 RouteFallback.vue', () => {
    const start = CODE.indexOf("path: '/:pathMatch(.*)*'");
    const rec = CODE.slice(start, start + 400);
    expect(rec, '兜底路由未标 meta.fallback').toContain('fallback: true');
    expect(rec, '兜底路由未指向 RouteFallback.vue').toContain("import('../views/RouteFallback.vue')");
    // 不给 guest：未激活授权时无匹配路径仍应被弹到 /license（与挂兜底页之前一致）
    expect(rec, '兜底路由不该给 guest').not.toContain('guest: true');
  });

  it('★ isFallbackRoute 认 meta.fallback，而不是只看 matched.length === 0', () => {
    // 挂了兜底路由之后任何路径都会 matched 到它 ⇒ length 恒 ≥1，旧判据全部失效
    const fn = CODE.match(/function isFallbackRoute\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到 isFallbackRoute').not.toBe('');
    expect(fn).toContain('meta?.fallback');
    expect(fn, '丢掉了"真的没有兜底路由"这一支').toContain('matched.length === 0');
  });
});

describe('兜底页自己的重试也要防环', () => {
  it('★ 自动重进同一个地址只做一次（否则 兜底页→重导航→兜底页 会转不出来）', () => {
    expect(FALLBACK_CODE, '找不到自动重试').toContain('async function autoRetry');
    expect(FALLBACK_CODE, '缺一次性闸门').toContain('new Set<string>()');
    expect(FALLBACK_CODE, '未判重试过').toContain('autoRetried.has(');
    expect(FALLBACK_CODE, '未登记已重试').toContain('autoRetried.add(');
    // replace：兜底页的重试是"修页面"而不是用户导航，不该进历史栈
    expect(FALLBACK_CODE, '自动重试未用 replace').toMatch(/router\.replace\(\{ path: route\.path/);
  });

  it('插件路由就绪后自动重进，而不是等用户手点', () => {
    expect(FALLBACK_CODE, '未订阅同步信号').toContain('whenPluginRoutesSynced()');
    expect(FALLBACK_CODE, '未在同步后触发自动重试').toMatch(/whenPluginRoutesSynced\(\)\.then\([\s\S]{0,140}autoRetry\(\)/);
  });
});

// ---- 变异测试记录（临时改源码 → 对应断言必须报红，改回后全绿）----
//
// | 变异                                                    | 触发断言 |
// |---------------------------------------------------------|----------|
// | 守卫里加回 `await waitForPluginRoutes()`                 | 守卫没有阻塞等待 |
// | 删掉 catch-all 兜底路由                                  | 注册了 catch-all |
// | isFallbackRoute 改回只看 `matched.length === 0`          | 认 meta.fallback |
// | 自愈里去掉 `isModeRouteRegistered(...)`                  | 自愈确认目标已注册 |
// | 自愈里去掉 `MODE_ROUTE_KEYS[cur.path]`                   | 自愈限定模式路由 |
// | 模式记忆重定向去掉 `isModeRouteRegistered(...)`           | 重定向确认已注册 |
// | 兜底页 autoRetry 去掉 `autoRetried.has(...)`             | 一次性闸门 |
// | syncPluginRoutes 里去掉 recoverIfCurrentRouteUnmatched() | 就地自愈 |
// | 把 markPluginRoutesSynced() 挪进 catch                   | try 内标记 |
