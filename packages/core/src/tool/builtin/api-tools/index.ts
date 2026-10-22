// API 工具注册 — 按模块组织接口工具定义
import type { ToolDefinition } from '../../types';
import { registerAgentTools } from './agent';
import { registerConversationTools } from './conversation';
import { registerDataTools } from './data';
import { registerExperienceTools } from './experience';
import { registerFileTools } from './file';
import { registerImTools } from './im';
import { registerKnowledgeTools } from './knowledge';
import { registerMarketplaceTools } from './marketplace';
import { registerMcpTools } from './mcp';
import { registerMediaTools } from './media';
import { registerMemoryTools } from './memory';
import { registerMessageTools } from './message';
import { registerOllamaTools } from './ollama';
import { registerPeerTools } from './peer';
import { registerPlatformTools } from './platform';
import { registerPluginTools } from './plugin';
import { registerScheduledTaskTools } from './scheduled-task';
import { registerSkillTools } from './skill';
import { registerSpaceTools } from './space';
import { registerTaskTypeTools } from './task-type';
import { registerGitTools } from './git';
import { registerToolTools } from './tool';
import { registerVerificationTools } from './verification';
import { registerWorkspaceTools } from './workspace';
// 工具发现：查详情 / 关键词搜索（2026-10-22）。分类浏览与分页在 get_api_tools 内置工具里。
import { registerDiscoveryTools } from './discovery';

export type ApiModuleName =
  | 'agent'
  | 'conversation'
  | 'message'
  | 'platform'
  | 'mcp'
  | 'skill'
  | 'tool'
  | 'marketplace'
  | 'media'
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
  | 'task-type'
  | 'verification'
  | 'data'
  | 'experience'
  | 'discovery';

export const API_MODULES: ApiModuleName[] = [
  'agent',
  'conversation',
  'message',
  'platform',
  'mcp',
  'skill',
  'tool',
  'marketplace',
  'media',
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
  'task-type',
  'verification',
  'data',
  'experience',
  'discovery',
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
  registerMediaTools(registry);
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
  registerTaskTypeTools(registry);
  registerVerificationTools(registry);
  registerDataTools(registry);
  registerExperienceTools(registry);
  // 发现工具最后注册：它描述的是「其它工具」，放最后读起来顺
  registerDiscoveryTools(registry);
  _instance = registry;
}
