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
