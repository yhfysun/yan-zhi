import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerPlatformTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('platform', [
    { name: 'api_platform_list', description: '列出所有模型平台', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_platform_create', description: '添加模型平台', inputSchema: { type: 'object', properties: { name: { type: 'string' }, protocol: { type: 'string', enum: ['openai', 'anthropic', 'custom'] }, apiUrl: { type: 'string' }, apiKeyEnc: { type: 'string' } }, required: ['name'] } },
    { name: 'api_platform_update', description: '更新平台配置', inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, apiUrl: { type: 'string' } }, required: ['id'] } },
    { name: 'api_platform_delete', description: '删除平台及模型', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_model_list', description: '列出模型', inputSchema: { type: 'object', properties: { platformId: { type: 'string' } }, required: [] } },
    { name: 'api_model_create', description: '添加模型', inputSchema: { type: 'object', properties: { platformId: { type: 'string' }, modelId: { type: 'string' }, alias: { type: 'string' }, type: { type: 'string' }, contextWindow: { type: 'number' } }, required: ['platformId', 'modelId'] } },
    { name: 'api_model_update', description: '更新模型', inputSchema: { type: 'object', properties: { id: { type: 'string' }, alias: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id'] } },
    { name: 'api_model_delete', description: '删除模型', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}
