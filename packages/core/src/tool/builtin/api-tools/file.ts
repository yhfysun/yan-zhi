import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerFileTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('file', [
    {
      name: 'api_file_list',
      description: '列出当前会话的所有文件，可按分类过滤（upload/intermediate/deliverable）',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '按分类过滤：upload（用户上传）、intermediate（中间产物）、deliverable（交付物）。不传则返回全部。',
            enum: ['upload', 'intermediate', 'deliverable'],
          },
        },
      },
    },
    {
      name: 'api_file_set_category',
      description: '修改会话文件的分类（如将中间产物标记为交付物）',
      inputSchema: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '文件记录 ID' },
          category: {
            type: 'string',
            description: '目标分类',
            enum: ['intermediate', 'deliverable'],
          },
        },
        required: ['fileId', 'category'],
      },
    },
  ]);
}
