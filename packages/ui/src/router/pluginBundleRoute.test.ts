// 前端 bundle 化接线守门（mode-pluginization P4）。
//
// 三处断了都会「静默回退」：视图看起来还能开（走构建期装载表），但 bundle 化其实没生效。
// 这里钉住链路：插件 store 带上 pluginId/entry → router 优先 loadPluginView → 失败才回落。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const ROUTER = read('router/index.ts');
const STORE = read('stores/plugin.ts');
const RUNTIME = read('plugin-runtime.ts');

describe('插件 store：路由带上运行时装载所需信息', () => {
  it('routes 计算属性附 pluginId 与 frontendEntry', () => {
    expect(STORE).toContain('resolvePluginFrontendEntry(p.manifest)');
    expect(STORE).toMatch(/pluginId:\s*p\.manifest\.id/);
  });
});

describe('router：bundle 优先、装载表兜底', () => {
  it('syncPluginRoutes 用统一解析函数挂组件（不再直接塞构建期 loader）', () => {
    expect(ROUTER).toContain('resolvePluginRouteComponent(r, built)');
    // 只认构建期 loader 的旧写法必须消失（否则 bundle 永远走不到）
    expect(ROUTER).not.toContain('component: comp as () => Promise<unknown>');
  });

  it('解析顺序：loadPluginView → 构建期 loader → 兜底页', () => {
    const fn = ROUTER.match(/async function resolvePluginRouteComponent\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, '找不到解析函数').not.toBe('');
    const bundleAt = fn.indexOf('loadPluginView(');
    const builtAt = fn.indexOf('if (built)');
    const fallbackAt = fn.indexOf('RouteFallback.vue');
    expect(bundleAt, '未尝试插件 bundle').toBeGreaterThan(-1);
    expect(builtAt, '没有构建期兜底').toBeGreaterThan(bundleAt);
    expect(fallbackAt, '没有最终兜底页').toBeGreaterThan(builtAt);
    // 装载失败必须被吞掉转向兜底，而不是把错误抛给路由
    expect(fn).toMatch(/loadPluginView\([\s\S]{0,200}catch\(/);
  });

  it('插件没声明前端入口时仍能挂（纯视图/旧包）', () => {
    expect(ROUTER).toContain('r.pluginId && r.frontendEntry && r.component');
    expect(ROUTER).toContain('if (!built && !canBundle) continue');
  });
});

describe('plugin-runtime：视图与样式', () => {
  it('导出 loadPluginView，按 component 路径从 bundle.views 取组件', () => {
    expect(RUNTIME).toMatch(/export async function loadPluginView\(/);
    expect(RUNTIME).toContain('mod?.views?.[componentPath]');
  });

  it('样式只注入一次（frontend/index.css）', () => {
    expect(RUNTIME).toContain('yz-plugin-css-');
    expect(RUNTIME).toContain("'frontend/index.css'");
    expect(RUNTIME).toMatch(/getElementById\(id\)\) return/);
  });
});
