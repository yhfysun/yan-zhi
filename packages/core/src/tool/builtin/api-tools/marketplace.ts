import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMarketplaceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('marketplace', [
    { name: 'api_marketplace_sources', description: '列出远程商城源', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['skill', 'agent', 'tool'] } }, required: [] } },
    { name: 'api_marketplace_add_source', description: '添加远程商城源', inputSchema: { type: 'object', properties: { name: { type: 'string' }, baseUrl: { type: 'string' }, type: { type: 'string' }, authType: { type: 'string', enum: ['none', 'bearer', 'api-key'] } }, required: ['name', 'baseUrl', 'type'] } },
    { name: 'api_marketplace_delete_source', description: '删除远程商城源', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_marketplace_browse', description: '浏览远程商城项目', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, page: { type: 'number' } }, required: ['sourceId'] } },
    { name: 'api_marketplace_install', description: '从商城安装到本地', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, itemId: { type: 'string' } }, required: ['sourceId', 'itemId'] } },
  ]);
}
