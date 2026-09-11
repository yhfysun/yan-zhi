import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMemoryTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('memory', [
    { name: 'api_memory_search', description: '按语义检索用户的记忆库（个人画像、长期偏好、历史结论等）。当用户问到与自身相关的信息、或需要上下文连续性时使用', inputSchema: { type: 'object', properties: { query: { type: 'string' }, agentId: { type: 'string' }, topK: { type: 'number' } }, required: ['query'] } },
    { name: 'api_memory_list', description: '列出用户最近的记忆条目（可按智能体过滤）', inputSchema: { type: 'object', properties: { agentId: { type: 'string' }, limit: { type: 'number' } }, required: [] } },
    { name: 'api_memory_create', description: '把值得长期记住的用户事实/偏好/重要结论写入记忆库（一句话一条，简洁明确）', inputSchema: { type: 'object', properties: { content: { type: 'string' }, agentId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['content'] } },
    { name: 'api_memory_delete', description: '删除一条过时或错误的记忆', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    // 空间记忆文件：每个空间一份 MEMORY.md，跨会话、该空间下所有智能体共享
    { name: 'api_space_memory_read', description: '读取当前空间的记忆文件（MEMORY.md，跨会话长期有效、该空间下所有智能体共享）。开始处理空间内任务、需要了解空间背景/约定/长期目标时使用', inputSchema: { type: 'object', properties: { spaceId: { type: 'string', description: '空间 ID，省略时默认当前会话所属空间' } }, required: [] } },
    { name: 'api_space_memory_append', description: '向当前空间的记忆文件追加一条长期记忆（一行一条，跨会话、所有智能体共享）。用于沉淀项目约定、关键决策、重要事实等空间级长期信息', inputSchema: { type: 'object', properties: { spaceId: { type: 'string', description: '空间 ID，省略时默认当前会话所属空间' }, content: { type: 'string', description: '一条简洁的记忆内容（一句话）' } }, required: ['content'] } },
    // 浏览器记忆：浏览使用记录 + 智能体浏览器操作的持久化记录（按天落盘，跨会话，按需召回）
    { name: 'api_browser_memory_read', description: '按需读取浏览器记忆（不自动注入，需要时才调用）：近几天的网页浏览记录与智能体浏览器操作记录，含当日 AI 浏览分析摘要。当任务与网页/调研/浏览历史相关、需要了解用户最近浏览过什么或此前自动化操作进行到哪一步时使用', inputSchema: { type: 'object', properties: { days: { type: 'number', description: '回看天数（默认 3，上限 30）' } }, required: [] } },
  ]);
}
