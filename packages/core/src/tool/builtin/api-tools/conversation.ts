import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerConversationTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('conversation', [
    { name: 'api_conversation_list', description: '列出所有会话', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_conversation_get', description: '获取指定会话详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_conversation_create', description: '创建新会话', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agentId: { type: 'string' }, modelId: { type: 'string' } }, required: ['title'] } },
    { name: 'api_conversation_update', description: '更新会话', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, pinned: { type: 'boolean' } }, required: ['id'] } },
    { name: 'api_conversation_delete', description: '删除会话及其消息', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    {
      name: 'api_conversation_setup',
      description:
        '设置**当前会话**的智能体 / 技能 / 工作模式。用户说"你现在按翻译助手来""这个会话挂上口播技能""切到工作流模式"时用它。' +
        '默认作用于当前会话（conversationId 可省略）。三项都可单独或同时设置：' +
        'agentId 换会话智能体（可先 list_sub_agents / api_agent_list 查可选值）；' +
        'skillIds 覆盖会话级技能挂载（与智能体自带技能取并集，可先 api_skill_list 查可选值）；' +
        'mode 切工作模式（office 办公 / dev 开发 / ops 运维 / sec 安全 / wf 工作流）。' +
        '★ 工作流型智能体（a_wf_* 流水线）**不能**作为会话智能体 —— 它没有对话人格与工具；' +
        '要跑流水线请用 wf_<id> 工具或 call_agent 委派。传错会被明确拒绝并说明正确用法。' +
        '★ 自己临时造了自定义工具（api_custom_tool_create）后，用 customToolIds 挂到当前会话即可调用 —— ' +
        '无需改智能体本体（不污染全局），下轮生效。' +
        '设置下一轮对话生效。',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: '会话 id；省略则用当前会话' },
          agentId: { type: 'string', description: '要切换到的智能体 id' },
          skillIds: { type: 'array', items: { type: 'string' }, description: '会话级技能 id 列表（覆盖，非追加）' },
          customToolIds: { type: 'array', items: { type: 'string' }, description: '会话级自定义工具 id 列表（覆盖，非追加）。用于把 api_custom_tool_create 造出来的工具只挂到当前会话，不改智能体全局挂载' },
          mode: { type: 'string', enum: ['office', 'dev', 'ops', 'sec', 'wf'], description: '工作模式' },
        },
        required: [],
      },
    },
    { name: 'api_conversation_file_list', description: '列出会话的文件记录（upload/intermediate/deliverable 三类）', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' } }, required: ['conversationId'] } },
    {
      name: 'api_conversation_file_add',
      description: '把磁盘上已存在的文件登记为会话文件（只写元数据，不搬运字节；产出交付物后用它挂到会话上）',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          name: { type: 'string', description: '文件名' },
          path: { type: 'string', description: '磁盘绝对路径' },
          category: { type: 'string', enum: ['upload', 'intermediate', 'deliverable'], description: '默认 intermediate' },
          mimeType: { type: 'string' },
          size: { type: 'number' },
          source: { type: 'string', description: '来源标记，默认 agent' },
          messageId: { type: 'string' },
        },
        required: ['conversationId', 'name', 'path'],
      },
    },
    {
      name: 'api_conversation_file_update',
      description: '修改会话文件记录（改分类 / 重命名 / 改路径）',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          fileId: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          category: { type: 'string', enum: ['upload', 'intermediate', 'deliverable'] },
        },
        required: ['conversationId', 'fileId'],
      },
    },
    { name: 'api_conversation_file_delete', description: '删除会话文件记录（只删记录，物理文件需自行处理）', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, fileId: { type: 'string' } }, required: ['conversationId', 'fileId'] } },
  ]);
}
