import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerSkillTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('skill', [
    { name: 'api_skill_list', description: '列出所有已安装Skill', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_skill_get', description: '获取Skill详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_skill_toggle', description: '启用/禁用Skill', inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] } },
    { name: 'api_skill_install', description: '从商城安装Skill', inputSchema: { type: 'object', properties: { marketplaceId: { type: 'string' } }, required: ['marketplaceId'] } },
    { name: 'api_skill_delete', description: '删除Skill', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}
