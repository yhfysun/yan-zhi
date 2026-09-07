export * from './types';
export * from './registry';
export * from './builtin/index';
export * from './builtin/api-tools/index';
export * from './sandbox';

import { ToolRegistry } from './registry';
import { registerBuiltInTools } from './builtin/index';

let _registry: ToolRegistry | null = null;

/**
 * 内置工具注册中心单例（懒初始化，首次获取时注册所有内置工具）。
 * 注：web_search / web_fetch 工具已从项目移除，联网检索与网页内容获取
 * 统一委派 pageAgent（真实浏览器 browser_get_page_content 抓取页面正文）。
 */
export function getToolRegistry(): ToolRegistry {
  if (!_registry) {
    _registry = new ToolRegistry();
    registerBuiltInTools(_registry);
  }
  return _registry;
}
