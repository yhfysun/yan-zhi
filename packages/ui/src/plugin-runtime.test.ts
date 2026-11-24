// 插件前端装载来源守门：
//   file:// Electron → yz://（离线包内直读）
//   http:// Electron dev → 本机 API HTTP（Chromium 不允许 http 页面 import 自定义协议）
//   Web / Capacitor → 当前 API_BASE
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'plugin-runtime.ts'), 'utf8');

describe('pluginFrontendUrl 运行时来源', () => {
  it('仅在 Electron file:// 页面使用 yz://', () => {
    expect(SRC).toContain("window.location.protocol === 'file:'");
    expect(SRC).toContain('return `yz://plugin/${pluginId}/${clean}`');
  });

  it('Electron dev 走本机 API，Web/Capacitor 走当前 API_BASE', () => {
    expect(SRC).toContain('const base = isElectronHost() ? LOCAL_API_BASE : API_BASE');
    expect(SRC).toContain('withMediaAuthQuery(`${base}/plugin-assets/${pluginId}/${clean}`)');
  });

  it('HTTP 插件模块 URL 必须带媒体查询鉴权（multi 模式模块请求无法带 Authorization 头）', () => {
    expect(SRC).toContain('withMediaAuthQuery');
  });
});

describe('插件宿主桥时序', () => {
  it('宿主桥未就绪时不 import 依赖 shim 的插件 bundle', () => {
    const fn = SRC.match(/export async function loadPluginFrontend\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).not.toBe('');
    const guardAt = fn.indexOf('if (!isPluginHostBridgeReady()) return undefined;');
    const importAt = fn.indexOf('await import(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(importAt).toBeGreaterThan(guardAt);
  });

  it('Web、移动和桌面入口都在挂载路由前初始化宿主桥', () => {
    const entries = [
      resolve(__dirname, '../../../apps/web/src/main.ts'),
      resolve(__dirname, '../../../apps/mobile/src/main.ts'),
      resolve(__dirname, '../../../apps/desktop/src/main.ts'),
    ];
    for (const path of entries) {
      const source = readFileSync(path, 'utf8');
      const bridgeAt = source.indexOf('initPluginHostBridge();');
      const routerAt = source.indexOf('app.use(router);');
      expect(bridgeAt, `${path} 未初始化插件宿主桥`).toBeGreaterThan(-1);
      expect(routerAt, `${path} 未挂载路由`).toBeGreaterThan(-1);
      expect(bridgeAt, `${path} 在路由挂载后才初始化宿主桥`).toBeLessThan(routerAt);
    }
  });
});
