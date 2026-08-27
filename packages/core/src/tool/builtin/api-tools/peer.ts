import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerPeerTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('peer', [
    {
      name: 'api_peer_register',
      description: '注册当前客户端节点，其他客户端可以发现该节点',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '客户端唯一节点 ID' },
          name: { type: 'string', description: '显示名称' },
          baseUrl: { type: 'string', description: '客户端可回调的 HTTP 地址' },
          capabilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['nodeId', 'name', 'baseUrl'],
      },
    },
    {
      name: 'api_peer_list',
      description: '列出已注册且在线的客户端节点',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_peer_ping',
      description: '刷新客户端节点的在线时间',
      inputSchema: {
        type: 'object',
        properties: { nodeId: { type: 'string' } },
        required: ['nodeId'],
      },
    },
    {
      name: 'api_chat_send',
      description: '向已注册的客户端节点发送消息，可附带文件元数据',
      inputSchema: {
        type: 'object',
        properties: {
          fromPeerId: { type: 'string' },
          toPeerId: { type: 'string' },
          content: { type: 'string' },
          file: { type: 'object' },
          senderName: { type: 'string' },
        },
        required: ['fromPeerId', 'toPeerId'],
      },
    },
    {
      name: 'api_chat_poll',
      description: '拉取发送给当前节点的新消息',
      inputSchema: {
        type: 'object',
        properties: {
          peerId: { type: 'string' },
          since: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['peerId'],
      },
    },
  ]);
}

