// PluginContext 构造
import type { PlatformAdapter } from '../platform/types';
import type { Disposable, PluginContext, PluginManifest, PluginStorage } from './types';
import type { ExtensionRegistry } from './registry';
import { createSandboxedAdapter } from './permissions';

export interface CreateCtxDeps {
  pluginId: string;
  manifest: PluginManifest;
  adapter: PlatformAdapter;
  config: Record<string, unknown>;
  registry: ExtensionRegistry;
  storage: PluginStorage;
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => Disposable;
  log?: (...args: unknown[]) => void;
}

/** 构造受限的 PluginContext（adapter 按 permissions 过滤） */
export function createPluginContext(deps: CreateCtxDeps): PluginContext {
  const adapter = createSandboxedAdapter(deps.adapter, deps.manifest.permissions || []);
  return {
    id: deps.pluginId,
    log: deps.log || ((...args) => console.log(`[plugin:${deps.pluginId}]`, ...args)),
    adapter,
    config: deps.config,
    registerTool: (def) => deps.registry.registerTool(deps.pluginId, def),
    registerBackendRoute: (setup) => deps.registry.registerBackendRoute(deps.pluginId, setup),
    storage: deps.storage,
    emit: deps.emit,
    on: deps.on,
  };
}