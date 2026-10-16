/**
 * 插件 WebSocket 端点注册（ExtensionRegistry）正式测试类。
 *
 * 背景：交互终端要从 SSE + POST 换成 WebSocket，而 ws 的 upgrade **不经过 Express
 * 中间件链** —— 插件无法用 registerBackendRoute 拿到 upgrade 事件。为此在插件系统
 * 里加了 registerWebSocket，由服务端的 upgrade 分发层统一认领并做授权校验。
 * 本文件守住注册表的几条契约：路径归一化、dispose、随插件下架清理。
 */
import { describe, it, expect } from 'vitest';
import { ExtensionRegistry, normalizeWsMountPath } from './registry';

describe('normalizeWsMountPath · 挂载路径归一化', () => {
  it('补前导斜杠', () => {
    expect(normalizeWsMountPath('term/ws')).toBe('/term/ws');
  });

  it('去掉尾部斜杠（否则与分发层的路径比对永远不相等）', () => {
    expect(normalizeWsMountPath('/term/ws/')).toBe('/term/ws');
    expect(normalizeWsMountPath('/term/ws///')).toBe('/term/ws');
  });

  it('空串与纯斜杠都归为根路径', () => {
    expect(normalizeWsMountPath('')).toBe('/');
    expect(normalizeWsMountPath('   ')).toBe('/');
    expect(normalizeWsMountPath('///')).toBe('/');
  });
});

describe('ExtensionRegistry · registerWebSocket', () => {
  const noop = () => { /* 不关心回调体 */ };

  it('注册后可读到，且带上 pluginId 与归一化后的路径', () => {
    const reg = new ExtensionRegistry();
    reg.registerWebSocket('ops-shell', 'term/ws', noop);
    expect(reg.wsRoutes).toHaveLength(1);
    expect(reg.wsRoutes[0].pluginId).toBe('ops-shell');
    expect(reg.wsRoutes[0].mountPath).toBe('/term/ws');
  });

  it('dispose 后端点被移除（插件停用时不能再被认领）', () => {
    const reg = new ExtensionRegistry();
    const d = reg.registerWebSocket('ops-shell', '/term/ws', noop);
    d.dispose();
    expect(reg.wsRoutes).toHaveLength(0);
  });

  it('★ 插件下架时 WS 端点一并清理（否则禁用插件后端点仍挂着）', () => {
    const reg = new ExtensionRegistry();
    reg.registerWebSocket('a', '/x', noop);
    reg.registerWebSocket('b', '/y', noop);
    reg.removeByPlugin('a');
    expect(reg.wsRoutes.map((r) => r.pluginId)).toEqual(['b']);
  });

  it('多个插件可各自注册，互不影响', () => {
    const reg = new ExtensionRegistry();
    reg.registerWebSocket('a', '/x', noop);
    reg.registerWebSocket('b', '/x', noop);
    expect(reg.wsRoutes).toHaveLength(2);
  });

  it('snapshot 暴露挂载点，便于诊断「这个端点到底注册上没有」', () => {
    const reg = new ExtensionRegistry();
    reg.registerWebSocket('ops-shell', '/term/ws', noop);
    expect(reg.snapshot().wsRoutes).toEqual(['ops-shell/term/ws']);
  });
});
