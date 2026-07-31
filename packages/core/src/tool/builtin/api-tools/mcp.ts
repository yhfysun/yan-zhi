import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMcpTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('mcp', [
    { name: 'api_mcp_server_list', description: '列出所有MCP服务', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_mcp_server_create', description: '添加MCP服务', inputSchema: { type: 'object', properties: { name: { type: 'string' }, transport: { type: 'string', enum: ['stdio', 'sse', 'http'] }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, url: { type: 'string' } }, required: ['name', 'transport'] } },
    { name: 'api_mcp_server_update', description: '更新MCP服务', inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' } }, required: ['id'] } },
    { name: 'api_mcp_server_delete', description: '删除MCP服务', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_mcp_tool_list', description: '列出MCP服务的工具', inputSchema: { type: 'object', properties: { serverId: { type: 'string' } }, required: ['serverId'] } },
    { name: 'api_mcp_tool_toggle', description: '启用/禁用MCP工具', inputSchema: { type: 'object', properties: { serverId: { type: 'string' }, toolName: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['serverId', 'toolName', 'enabled'] } },
  ]);
}
