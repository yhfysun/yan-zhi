import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerImTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('im', [
    {
      name: 'api_im_connector_list',
      description: '列出微信/飞书连接器',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_im_connector_create',
      description: '创建微信或飞书连接器',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['wechat', 'feishu'] },
          name: { type: 'string' },
          config: { type: 'object' },
          enabled: { type: 'boolean' },
        },
        required: ['provider', 'name'],
      },
    },
    {
      name: 'api_im_connector_update',
      description: '更新微信/飞书连接器配置',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          config: { type: 'object' },
          enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_im_connector_delete',
      description: '删除微信/飞书连接器',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_im_send',
      description: '通过微信/飞书连接器发送文本或文件',
      inputSchema: {
        type: 'object',
        properties: {
          connectorId: { type: 'string' },
          to: { type: 'string' },
          content: { type: 'string' },
          file: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              data: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
          receiveIdType: { type: 'string' },
        },
        required: ['connectorId', 'to'],
      },
    },
    {
      name: 'api_im_connector_test',
      description: '测试微信/飞书连接器的配置是否可用（凭证是否有效、能否连通）。配置连接器后建议先测试再启用',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '连接器 id' } },
        required: ['id'],
      },
    },
  ]);
}

