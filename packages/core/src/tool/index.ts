export * from './types';
export * from './registry';
export * from './builtin/index';
export * from './builtin/api-tools/index';
export * from './sandbox';

import { ToolRegistry } from './registry';
import { registerBuiltInTools } from './builtin/index';
import type { SearchBackend } from './builtin/web-search';

let _registry: ToolRegistry | null = null;

/** 内置工具注册中心单例（懒初始化，首次获取时注册所有内置工具） */
export function getToolRegistry(searchBackend?: SearchBackend): ToolRegistry {
  if (!_registry) {
    _registry = new ToolRegistry();
    registerBuiltInTools(_registry, searchBackend);
  }
  return _registry;
}
