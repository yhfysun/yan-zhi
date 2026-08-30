import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerScheduledTaskTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('scheduled-task', [
    {
      name: 'api_scheduled_task_list',
      description: '列出当前用户的定时任务（名称/调度/启用状态/上次与下次运行时间）',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_scheduled_task_create',
      description: '创建定时任务：需指定 name 与 prompt，调度方式二选一——intervalMinutes（每隔 N 分钟）或 cronExpr（5 字段分钟粒度，如 "30 9 * * *" 表示每天 9:30）。可绑定 agentId/platformId/modelId/spaceId/conversationId，创建后默认启用',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称' },
          prompt: { type: 'string', description: '每次触发时交给智能体执行的提示词' },
          intervalMinutes: { type: 'number', description: '每隔多少分钟执行一次；与 cronExpr 二选一' },
          cronExpr: { type: 'string', description: 'cron 表达式（5 字段分钟粒度）；与 intervalMinutes 二选一' },
          agentId: { type: 'string', description: '可选，指定执行该任务的智能体 id' },
          platformId: { type: 'string', description: '可选，模型平台 id' },
          modelId: { type: 'string', description: '可选，模型 id' },
          spaceId: { type: 'string', description: '可选，空间 id' },
          conversationId: { type: 'string', description: '可选，复用已有会话（必须是当前用户自己的会话，否则会被忽略）' },
          enabled: { type: 'boolean', description: '是否启用，默认 true' },
        },
        required: ['name', 'prompt'],
      },
    },
    {
      name: 'api_scheduled_task_update',
      description: '更新定时任务（改名/改提示词/改调度/启用或停用）。改调度或重新启用时，下次运行时间会从现在起重算；停用会清空下次运行时间',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          prompt: { type: 'string' },
          intervalMinutes: { type: 'number' },
          cronExpr: { type: 'string' },
          agentId: { type: 'string' },
          platformId: { type: 'string' },
          modelId: { type: 'string' },
          spaceId: { type: 'string' },
          conversationId: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_scheduled_task_delete',
      description: '删除定时任务（不会影响该任务已产生的会话）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_scheduled_task_run',
      description: '立即运行一次定时任务（不等到下次触发时间），返回执行结果与产生的 conversationId',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ]);
}
