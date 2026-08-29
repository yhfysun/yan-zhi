export * from './types';
export * from './registry';
export * from './builtin/index';
export * from './builtin/api-tools/index';
export * from './sandbox';

import { ToolRegistry } from './registry';
import { registerBuiltInTools } from './builtin/index';
import { DuckDuckGoSearchBackend, ServerSearchBackend } from './builtin/web-search';
import type { SearchBackend } from './builtin/web-search';

let _registry: ToolRegistry | null = null;

/**
 * 内置工具注册中心单例（懒初始化，首次获取时注册所有内置工具）。
 * 未传 searchBackend 时按环境选默认后端：
 * - 浏览器环境（有 window）：ServerSearchBackend，走服务端 /api/search 代理（规避 CORS）
 * - Node 环境：DuckDuckGoSearchBackend，直接 fetch DuckDuckGo
 * 保证前端无参调用也能正常 web_search，避免「no search backend configured」。
 */
export function getToolRegistry(searchBackend?: SearchBackend): ToolRegistry {
  if (!_registry) {
    _registry = new ToolRegistry();
    const defaultBackend = typeof window !== 'undefined'
      ? new ServerSearchBackend()
      : new DuckDuckGoSearchBackend();
    registerBuiltInTools(_registry, searchBackend ?? defaultBackend);
  }
  return _registry;
}
