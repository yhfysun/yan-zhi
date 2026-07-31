import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerToolTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('tool', [
    { name: 'api_custom_tool_list', description: '列出所有自定义工具', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_custom_tool_get', description: '获取自定义工具详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_create', description: '创建自定义工具（Node.js沙箱）', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, inputSchema: { type: 'object' }, entry: { type: 'string' }, code: { type: 'string' }, timeout: { type: 'number' } }, required: ['name', 'inputSchema', 'entry', 'code'] } },
    { name: 'api_custom_tool_update', description: '更新自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_delete', description: '删除自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_toggle', description: '启用/禁用自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] } },
    { name: 'api_builtin_tool_list', description: '列出所有内置工具', inputSchema: { type: 'object', properties: {}, required: [] } },
  ]);
}
