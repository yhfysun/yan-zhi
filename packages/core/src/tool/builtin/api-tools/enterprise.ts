import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerEnterpriseTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('enterprise', [
    {
      name: 'api_enterprise_resources',
      description: '列出当前用户可见的团队模型、Skill、专家、工具、规则和 MCP 连接。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_enterprise_mcp_connectors',
      description: '列出当前用户被授权的集中式 MCP 连接。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_enterprise_design_resources',
      description: '列出当前用户可见的团队设计模板、风格和设计系统。',
      inputSchema: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['template', 'style', 'design-system', 'direction'] } },
        required: [],
      },
    },
    {
      name: 'api_enterprise_mcp_tools',
      description: '读取一个集中式 MCP 连接下已启用的工具目录。',
      inputSchema: {
        type: 'object',
        properties: { connectorId: { type: 'string' } },
        required: ['connectorId'],
      },
    },
    {
      name: 'api_enterprise_mcp_call',
      description: '调用当前用户被授权的集中式 MCP 工具；上游凭证和额度扣减都在服务端完成。',
      inputSchema: {
        type: 'object',
        properties: {
          connectorId: { type: 'string' },
          toolName: { type: 'string' },
          arguments: { type: 'object' },
        },
        required: ['connectorId', 'toolName'],
      },
    },
    {
      name: 'api_enterprise_runtime_nodes',
      description: '列出当前用户可用的工作节点及在线状态。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_enterprise_runtime_task_create',
      description: '向工作节点下发命令任务，返回任务 ID。关闭页面后任务仍在节点继续执行。',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
        required: ['nodeId', 'command'],
      },
    },
    {
      name: 'api_enterprise_runtime_task_status',
      description: '查询远程任务状态、结果和最近事件。',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          includeEvents: { type: 'boolean' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'api_enterprise_workspace_create',
      description: '在指定工作节点上创建带 TTL 的云工作区。',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          name: { type: 'string' },
          ttlMinutes: { type: 'number' },
        },
        required: ['nodeId', 'name'],
      },
    },
  ]);
}
