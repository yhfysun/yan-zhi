import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerSpaceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('space', [
    {
      name: 'api_space_list',
      description: '列出当前用户的所有空间（工作空间）。空间用于把会话按项目/主题归类，可绑定一个工作目录 dirPath',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_space_create',
      description: '创建空间：name 为必填；dirPath 可绑定一个本地工作目录，之后该空间下的文件操作默认在此目录',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '空间名称' },
          dirPath: { type: 'string', description: '可选，关联的本地目录绝对路径' },
          description: { type: 'string', description: '可选，空间描述' },
          sortOrder: { type: 'number', description: '可选，排序序号，默认 0（小的在前）' },
        },
        required: ['name'],
      },
    },
    {
      name: 'api_space_update',
      description: '更新空间的名称、工作目录、描述或排序',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          dirPath: { type: 'string' },
          description: { type: 'string' },
          sortOrder: { type: 'number' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_space_delete',
      description: '删除空间。其下会话不会被删除，只是 space_id 置空、归到"未归类"；工作目录里的实际文件不受影响',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ]);
}
