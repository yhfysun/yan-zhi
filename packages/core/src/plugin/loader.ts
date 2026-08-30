// 插件模块加载器（仅后端 Node 环境使用）
import type { PluginModule } from './types';

export class PluginLoadError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PluginLoadError';
  }
}

/**
 * 后端加载插件入口模块。
 * 优先 ESM dynamic import，失败回退 CJS createRequire。
 * 前端（有 window）禁止调用。
 */
export async function loadPluginModule(entryPath: string): Promise<PluginModule> {
  if (typeof window !== 'undefined') {
    throw new PluginLoadError('前端不支持加载后端插件模块');
  }
  try {
    const mod = await import(/* @vite-ignore */ entryPath);
    return (mod as { default?: PluginModule }).default || (mod as unknown as PluginModule);
  } catch (e) {
    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const m = req(entryPath) as { default?: PluginModule };
      return m.default || (m as unknown as PluginModule);
    } catch (e2) {
      throw new PluginLoadError(`加载插件入口失败 ${entryPath}: ${(e as Error).message} / ${(e2 as Error).message}`);
    }
  }
}