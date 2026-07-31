// API 工具注册 — 按模块组织接口工具定义
import type { ToolDefinition } from '../../types';

export type ApiModuleName =
  | 'agent'
  | 'conversation'
  | 'message'
  | 'platform'
  | 'mcp'
  | 'skill'
  | 'tool'
  | 'marketplace'
  | 'workspace'
  | 'memory';

export const API_MODULES: ApiModuleName[] = [
  'agent', 'conversation', 'message', 'platform', 'mcp', 'skill', 'tool',
  'marketplace', 'workspace', 'memory',
];

export function createApiToolRegistry(): Map<ApiModuleName, ToolDefinition[]> {
  return new Map();
}

let _instance: Map<ApiModuleName, ToolDefinition[]> | null = null;

export function getApiToolRegistry(): Map<ApiModuleName, ToolDefinition[]> {
  if (!_instance) {
    _instance = createApiToolRegistry();
    import('./agent').then(m => m.registerAgentTools(_instance!));
    import('./conversation').then(m => m.registerConversationTools(_instance!));
    import('./platform').then(m => m.registerPlatformTools(_instance!));
    import('./mcp').then(m => m.registerMcpTools(_instance!));
    import('./skill').then(m => m.registerSkillTools(_instance!));
    import('./tool').then(m => m.registerToolTools(_instance!));
    import('./marketplace').then(m => m.registerMarketplaceTools(_instance!));
    import('./workspace').then(m => m.registerWorkspaceTools(_instance!));
    import('./memory').then(m => m.registerMemoryTools(_instance!));
  }
  return _instance;
}

/** 同步注册所有模块 — 在应用启动时调用 */
export function initApiToolRegistry(): void {
  _instance = createApiToolRegistry();
  const { registerAgentTools } = require('./agent');
  const { registerConversationTools } = require('./conversation');
  const { registerMessageTools } = require('./message');
  const { registerPlatformTools } = require('./platform');
  const { registerMcpTools } = require('./mcp');
  const { registerSkillTools } = require('./skill');
  const { registerToolTools } = require('./tool');
  const { registerMarketplaceTools } = require('./marketplace');
  const { registerWorkspaceTools } = require('./workspace');
  const { registerMemoryTools } = require('./memory');
  registerAgentTools(_instance);
  registerConversationTools(_instance);
  registerMessageTools(_instance);
  registerPlatformTools(_instance);
  registerMcpTools(_instance);
  registerSkillTools(_instance);
  registerToolTools(_instance);
  registerMarketplaceTools(_instance);
  registerWorkspaceTools(_instance);
  registerMemoryTools(_instance);
}
