import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerAgentTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('agent', [
    { name: 'api_agent_list', description: '列出所有智能体', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_agent_get', description: '获取指定智能体详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_agent_create', description: '创建新智能体', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, systemPrompt: { type: 'string' }, type: { type: 'string', enum: ['harness', 'workflow'] } }, required: ['name'] } },
    { name: 'api_agent_update', description: '更新智能体', inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, systemPrompt: { type: 'string' } }, required: ['id'] } },
    { name: 'api_agent_delete', description: '删除智能体', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_agent_mount', description: '更新智能体挂载配置（工具/Skill/子智能体）', inputSchema: { type: 'object', properties: { id: { type: 'string' }, builtinToolIds: { type: 'array', items: { type: 'string' } }, customToolIds: { type: 'array', items: { type: 'string' } }, mcpToolMounts: { type: 'array', items: { type: 'object' } }, skillIds: { type: 'array', items: { type: 'string' } }, subAgentIds: { type: 'array', items: { type: 'string' } } }, required: ['id'] } },
  ]);
}
