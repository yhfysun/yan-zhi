/**
 * 插件前端运行时装载器（mode-pluginization）。
 *
 * 插件前端 bundle 的物理来源：
 *  · Electron：yz://plugin/<id>/<entry>（main.cjs protocol.handle 定位 builtin/installed 插件目录）
 *  · Web：     <API_BASE>/plugin-assets/<id>/<entry>（express 静态；P0 仅预留，服务端插件目录
 *              静态服务在 P1 随试点补齐）
 *
 * 装载契约（插件前端 bundle 默认导出，P1 试点定稿）：
 *   export default { views?: Record<string, Component>, install?(host: YzHostBridge): void }
 *
 * 失败兜底：任何装载错误都吞掉并返回 undefined —— 调用方走 RouteFallback，绝不黑屏；
 * 办公模式（基座视图）不走本装载器，永不依赖远程模块。
 */
import type { PluginManifest } from '@yan-zhi/core';
import { API_BASE } from './api/client';

/** 是否 Electron 渲染层（desktop 入口注入的 electronAPI） */
export function isElectronHost(): boolean {
  return typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI;
}

/** 插件包内资源地址：electron 走 yz:// 协议，web 走后端静态服务 */
export function pluginFrontendUrl(pluginId: string, entry: string): string {
  const clean = entry.replace(/^\.?\//, '');
  return isElectronHost()
    ? `yz://plugin/${pluginId}/${clean}`
    : `${API_BASE}/plugin-assets/${pluginId}/${clean}`;
}

/** manifest 声明的前端入口：优先 contributes.mode.entry，回落 ui.entry（新形态对象） */
export function resolvePluginFrontendEntry(manifest: PluginManifest): string | undefined {
  const modeEntry = manifest.contributes?.mode?.entry;
  if (modeEntry) return modeEntry;
  const ui = manifest.ui;
  if (typeof ui === 'object' && ui !== null && typeof ui.entry === 'string') return ui.entry;
  return undefined;
}

const loaded = new Map<string, Promise<unknown> | undefined>();

/** 装载插件前端模块（带缓存与失败兜底）。返回 undefined = 装载失败，调用方降级。 */
export async function loadPluginFrontend(pluginId: string, entry: string): Promise<unknown | undefined> {
  const key = `${pluginId}#${entry}`;
  const cached = loaded.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const url = pluginFrontendUrl(pluginId, entry);
    try {
      return await import(/* @vite-ignore */ url);
    } catch (e) {
      console.warn(`[plugin-runtime] 装载插件前端失败: ${pluginId} ${entry}`, e);
      loaded.delete(key); // 失败不缓存，下次（如插件重装后）可重试
      return undefined;
    }
  })();
  loaded.set(key, pending);
  return pending;
}

/** 插件更新/卸载后清除缓存（P1 起由插件 store 的变更回调调用） */
export function invalidatePluginFrontendCache(pluginId?: string): void {
  if (!pluginId) {
    loaded.clear();
    return;
  }
  for (const key of [...loaded.keys()]) {
    if (key.startsWith(`${pluginId}#`)) loaded.delete(key);
  }
}
