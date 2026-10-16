// 冷启动插件路由竞态守门测试 —— 防「直开 /ops 白屏」回归。
//
// 背景（2026-10-16）：
//   `/ops`、`/sec`、`/shop` 的模式路由是**插件贡献**的（各插件 manifest 的 contributes.routes），
//   RouteRecord 要等 `onMounted → pluginStore.refresh() → syncPluginRoutes()` 才 addRoute。
//   冷启动时用户一上来就落在这条路径上（桌面端上次会话的窗口 URL、书签、外部跳转、
//   移动端 deep link、多窗口的第二个窗口）→ 首次导航跑在 addRoute 之前 → `to.matched` 为空
//   → 无匹配 → 空白页，用户观感是「点了没反应 / 白屏」。
//
// 为什么是「读源码断言」而不是渲染测试：这件事的判据全是**结构可判**的
//   （信号有没有出口、守卫里有没有这段分支、分支在门禁前还是后、有没有超时与防环），
//   而真跑起来要拉 pinia + 授权 store + 插件 store 并打真实接口，成本远高于收益。
//   同口径见 composables/mobilePackagingAndColdStart.test.ts 顶部说明。
// ★ 每条断言都做过变异测试（见文件末尾记录）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

/** 去注释，避免被说明性注释绊倒（注释里同样会出现 MODE_ROUTE_KEYS / /ops 等词）。 */
const CODE = SRC
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
    // 已同步走 Promise.resolve()，未同步走挂起信号 —— 少了前者会让同步后的每次导航都去 await 一个已决 promise（无害但语义不对）
    expect(CODE, '已同步分支缺失').toMatch(
      /return pluginRoutesSynced \? Promise\.resolve\(\) : pluginRoutesSyncedSignal/,
    );
  });

  it('syncPluginRoutes() 成功跑完后点亮信号（否则冷启动会白等满 3s）', () => {
    // 必须落在 try 内、addRoute 循环之后：提前标记 = 路由还没注册就放行重导航（等于没修）
    const loopIdx = SYNC.indexOf('router.addRoute(');
    const markIdx = SYNC.indexOf('markPluginRoutesSynced()');
    const catchIdx = SYNC.indexOf('} catch');
    expect(loopIdx, '找不到 addRoute 循环').toBeGreaterThan(-1);
    expect(markIdx, 'syncPluginRoutes 未点亮同步信号').toBeGreaterThan(loopIdx);
    expect(markIdx, '标记必须在 try 内（catch 里标记等于把失败当成功）').toBeLessThan(catchIdx);
  });
});

describe('beforeEach 冷启动重试', () => {
  it('守卫里存在「未匹配 + 属于 MODE_ROUTE_KEYS」分支', () => {
    expect(GUARD, '缺少守卫体切片').not.toBe('');
    const coldIdx = GUARD.indexOf('if (to.matched.length === 0');
    expect(coldIdx, '守卫里没有「未匹配」条件').toBeGreaterThan(-1);
    // ★ 只在**这个 if 的条件窗口**里断言：`MODE_ROUTE_KEYS[to.path]` 在守卫上方还有一处
    //   （版本档门禁的 `const targetMode = ...`），整段断言会被那一处喂饱（变异测试实测踩过）。
    const cond = GUARD.slice(coldIdx, coldIdx + 200);
    expect(cond, '未限定模式路由（会把所有 404 都拖进来）').toContain('MODE_ROUTE_KEYS[to.path]');
    expect(cond, '未在条件里判重试过（缺了就是死循环）').toContain('!coldStartRetried.has(to.fullPath)');
  });

  it('等信号后重导航，且用 replace', () => {
    expect(GUARD, '未等待插件路由同步').toContain('await waitForPluginRoutes()');
    // replace: 冷启动的首跳不该在历史里多留一条
    const ret = GUARD.match(/return \{ path: to\.path[^}]*\}/)?.[0] ?? '';
    expect(ret, '重导航未回到原路径').toContain('query: to.query');
    expect(ret, '重导航未带 replace（返回键会退到同一页）').toContain('replace: true');
  });

  it('同一个路径只重试一次，防「等 → 重导航」死循环', () => {
    // vue-router 的无限重定向保护只在 dev 生效，线上会真死循环
    expect(GUARD, '未登记已重试路径').toMatch(/coldStartRetried\.add\(to\.fullPath\)/);
    expect(GUARD, '未判重试过（缺了就是死循环）').toMatch(/!coldStartRetried\.has\(to\.fullPath\)/);
  });

  it('★ 分支位置在授权门禁与版本档门禁之后（不该陪跑这几秒）', () => {
    const at = (s: string, label: string) => {
      const i = GUARD.indexOf(s);
      expect(i, `守卫里找不到 ${label}`).toBeGreaterThan(-1);
      return i;
    };
    const cold = at('coldStartRetried.has(', '冷启动分支');
    // 未激活时 /plugins 是 403 → 永远等不到同步完成，会把授权页拖后 3s
    expect(cold, '冷启动等待跑在授权门禁之前了').toBeGreaterThan(at('licenseStore.init()', '授权门禁'));
    expect(cold, '冷启动等待跑在版本档门禁之前了').toBeGreaterThan(at('isModeLicensed(targetMode)', '版本档门禁'));
  });
});

describe('冷启动等待的超时兜底', () => {
  it('超时上限 3s，且真的套在等待上', () => {
    expect(CODE, '超时常量不是 3000').toMatch(/PLUGIN_ROUTES_SYNC_TIMEOUT_MS\s*=\s*3000/);
    expect(CODE, '默认参数未引用常量').toMatch(/waitForPluginRoutes\(maxMs\s*=\s*PLUGIN_ROUTES_SYNC_TIMEOUT_MS\)/);
    expect(CODE, '定时器未挂兜底').toMatch(/setTimeout\(done,\s*maxMs\)/);
    // 信号先到 → 清掉定时器立即放行（否则每次冷启动都会被按满 3s）
    expect(CODE, '未在信号到达时提前放行').toMatch(/whenPluginRoutesSynced\(\)\.then\(done,\s*done\)/);
    expect(CODE, '未清理定时器').toMatch(/clearTimeout\(timer\)/);
  });
});

// ---- 变异测试记录（临时改源码 → 对应断言必须报红，改回后全绿）----
//
// | 变异                                          | 触发断言 |
// |-----------------------------------------------|----------|
// | 去掉 `&& MODE_ROUTE_KEYS[to.path]`             | 唯一限定模式路由 |
// | 把等待分支挪到 `licenseStore.init()` 之前       | 分支位置在门禁之后 |
// | 重导航去掉 `replace: true`                     | 用 replace |
// | 去掉 `!coldStartRetried.has(to.fullPath)`      | 只重试一次 |
// | `PLUGIN_ROUTES_SYNC_TIMEOUT_MS` 改 500         | 超时上限 3s |
// | 去掉 `whenPluginRoutesSynced().then(done...)`  | 提前放行 |
// | 把 `markPluginRoutesSynced()` 挪进 catch       | try 内标记 |
