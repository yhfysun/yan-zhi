// 插件 WebSocket 端点分发（纯函数，便于单测）。
//
// 为什么单独成文件：这段逻辑跑在 http 的 `upgrade` 事件里，而承载它的 index.ts
// 一 import 就会启动整个后端（连库、起服务）。抽成纯函数后，路径匹配的边界
// （query、尾斜杠、前缀相似、未注册）能被直接测到，不必先拉起一个真服务。
import type { PluginWsRoute } from '@yan-zhi/core';

/** 插件端点的完整路径：`/api/plugin/<pluginId><mountPath>`（mountPath 已归一化） */
export function pluginWsPath(route: Pick<PluginWsRoute, 'pluginId' | 'mountPath'>): string {
  const base = `/api/plugin/${route.pluginId}`;
  return route.mountPath === '/' ? base : `${base}${route.mountPath}`;
}

/**
 * 按路径匹配已注册的插件 WS 端点；没匹配到返回 null（调用方据此销毁 socket）。
 * 请求路径里的 query 与尾斜杠都要先抹掉，否则 `/term/ws?x=1` 永远匹配不上 ——
 * 症状是终端一直连不上，但日志里什么都看不到。
 */
export function matchPluginWsRoute(routes: PluginWsRoute[], rawUrl: string): PluginWsRoute | null {
  const pathname = (rawUrl.split('?')[0] || '').replace(/\/+$/, '') || '/';
  for (const r of routes) {
    if (pluginWsPath(r) === pathname) return r;
  }
  return null;
}
