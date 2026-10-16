/**
 * 插件 WebSocket 端点分发（matchPluginWsRoute / pluginWsPath）正式测试类。
 *
 * 背景：ws 的 upgrade 不经过 Express 中间件链，插件的 WS 端点只能由服务端在
 * http `upgrade` 事件里按路径认领。这段匹配跑在真服务的启动路径上（index.ts），
 * 所以抽成纯函数单独测 —— 匹配错了的症状是「终端一直连不上，但日志里什么都没有」。
 */
import { describe, it, expect } from 'vitest';
import { matchPluginWsRoute, pluginWsPath } from '../src/plugin-ws-dispatch.js';

const route = (pluginId: string, mountPath: string) =>
  ({ pluginId, mountPath, onConnection: () => {} });

const TERM = route('ops-shell', '/term/ws');

describe('pluginWsPath · 完整路径拼接', () => {
  it('普通挂载点拼成 /api/plugin/<id><path>', () => {
    expect(pluginWsPath(TERM)).toBe('/api/plugin/ops-shell/term/ws');
  });

  it('挂载点是根时不补多余斜杠', () => {
    expect(pluginWsPath(route('demo', '/'))).toBe('/api/plugin/demo');
  });
});

describe('matchPluginWsRoute · 路径匹配', () => {
  it('精确匹配', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell/term/ws')).toBe(TERM);
  });

  it('★ 带 query 也能匹配（真实请求一定带 connectionId）', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell/term/ws?connectionId=ops-1&cols=120')).toBe(TERM);
  });

  it('★ 带尾斜杠也能匹配', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell/term/ws/')).toBe(TERM);
  });

  it('根挂载点匹配插件根路径', () => {
    const r = route('demo', '/');
    expect(matchPluginWsRoute([r], '/api/plugin/demo')).toBe(r);
    expect(matchPluginWsRoute([r], '/api/plugin/demo/')).toBe(r);
  });

  it('★ 前缀相似但更短的路径不匹配（否则会认领没注册的端点）', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell/term')).toBeNull();
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell')).toBeNull();
  });

  it('★ 前缀相似但更长的路径不匹配', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/ops-shell/term/ws/extra')).toBeNull();
  });

  it('不认识的插件或路径 → null（调用方据此销毁 socket，避免连接悬挂）', () => {
    expect(matchPluginWsRoute([TERM], '/api/plugin/other/term/ws')).toBeNull();
    expect(matchPluginWsRoute([TERM], '/api/conversations')).toBeNull();
    expect(matchPluginWsRoute([], '/api/plugin/ops-shell/term/ws')).toBeNull();
  });

  it('多个端点时各自归位（不能串到别的插件）', () => {
    const a = route('demo-a', '/x');
    const b = route('demo-b', '/x');
    const routes = [TERM, a, b];
    expect(matchPluginWsRoute(routes, '/api/plugin/demo-b/x')).toBe(b);
    expect(matchPluginWsRoute(routes, '/api/plugin/demo-a/x')).toBe(a);
    expect(matchPluginWsRoute(routes, '/api/plugin/ops-shell/term/ws')).toBe(TERM);
  });

  it('pluginId 含连字符 / 挂载点含多段都能匹配', () => {
    const r = route('my-plugin-2', '/a/b/c');
    expect(matchPluginWsRoute([r], '/api/plugin/my-plugin-2/a/b/c?tab=1')).toBe(r);
  });

  it('空 URL 不匹配任何端点（不抛错）', () => {
    expect(matchPluginWsRoute([TERM], '')).toBeNull();
  });
});
