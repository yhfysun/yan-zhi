// API 工具注册 — 按模块组织接口工具定义
import type { ToolDefinition } from '../../types';
import { registerAgentTools } from './agent';
import { registerConversationTools } from './conversation';
import { registerDataTools } from './data';
import { registerFileTools } from './file';
import { registerImTools } from './im';
import { registerKnowledgeTools } from './knowledge';
import { registerMarketplaceTools } from './marketplace';
import { registerMcpTools } from './mcp';
import { registerMemoryTools } from './memory';
import { registerMessageTools } from './message';
import { registerOllamaTools } from './ollama';
import { registerPeerTools } from './peer';
import { registerPlatformTools } from './platform';
import { registerPluginTools } from './plugin';
import { registerScheduledTaskTools } from './scheduled-task';
import { registerSkillTools } from './skill';
import { registerSpaceTools } from './space';
import { registerGitTools } from './git';
import { registerToolTools } from './tool';
import { registerWorkspaceTools } from './workspace';

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
  | 'memory'
  | 'file'
  | 'peer'
  | 'im'
  | 'knowledge'
  | 'scheduled-task'
  | 'ollama'
  | 'git'
  | 'plugin'
  | 'space'
  | 'data';

export const API_MODULES: ApiModuleName[] = [
  'agent',
  'conversation',
  'message',
  'platform',
  'mcp',
  'skill',
  'tool',
  'marketplace',
  'workspace',
  'memory',
  'file',
  'peer',
  'im',
  'knowledge',
  'scheduled-task',
  'ollama',
  'git',
  'plugin',
  'space',
  'data',
];

export function createApiToolRegistry(): Map<ApiModuleName, ToolDefinition[]> {
  return new Map();
}

let _instance: Map<ApiModuleName, ToolDefinition[]> | null = null;

export function getApiToolRegistry(): Map<ApiModuleName, ToolDefinition[]> {
  if (!_instance) {
    initApiToolRegistry();
  }
  return _instance!;
}

/** 同步注册所有模块 — 避免动态 import 造成 MCP tools/list 首次调用时注册未完成。 */
export function initApiToolRegistry(): void {
  const registry = createApiToolRegistry();
  registerAgentTools(registry);
  registerConversationTools(registry);
  registerMessageTools(registry);
  registerPlatformTools(registry);
  registerMcpTools(registry);
  registerSkillTools(registry);
  registerToolTools(registry);
  registerMarketplaceTools(registry);
  registerWorkspaceTools(registry);
  registerMemoryTools(registry);
  registerFileTools(registry);
  registerPeerTools(registry);
  registerImTools(registry);
  registerKnowledgeTools(registry);
  registerScheduledTaskTools(registry);
  registerOllamaTools(registry);
  registerGitTools(registry);
  registerPluginTools(registry);
  registerSpaceTools(registry);
  registerDataTools(registry);
  _instance = registry;
}
