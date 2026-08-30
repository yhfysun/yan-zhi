import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerSkillTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('skill', [
    { name: 'api_skill_list', description: '列出所有已安装Skill', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_skill_get', description: '获取Skill详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_skill_toggle', description: '启用/禁用Skill', inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] } },
    { name: 'api_skill_install', description: '从商城安装Skill', inputSchema: { type: 'object', properties: { marketplaceId: { type: 'string' } }, required: ['marketplaceId'] } },
    { name: 'api_skill_delete', description: '删除Skill', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    {
      name: 'api_skill_create',
      description: '新建本地 Skill。name 与 body 为必填：body 是命中触发词后注入给模型的技能正文（操作步骤/规范）；triggers 为触发词数组，用于判断何时加载该技能',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill 名称' },
          body: { type: 'string', description: 'Skill 正文（Markdown 步骤说明）' },
          description: { type: 'string', description: '可选，一句话描述该技能用途' },
          triggers: { type: 'array', items: { type: 'string' }, description: '可选，触发关键词数组' },
          category: { type: 'string', description: '可选，分类名' },
        },
        required: ['name', 'body'],
      },
    },
    {
      name: 'api_skill_update',
      description: '更新本地 Skill 的名称、正文、触发词、分类或启用状态',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          body: { type: 'string' },
          description: { type: 'string' },
          triggers: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          enabled: { type: 'boolean' },
          isPublic: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
  ]);
}
