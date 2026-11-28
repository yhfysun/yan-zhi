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
    {
      name: 'api_artifact_save',
      description:
        '把远端 URL 或 base64 数据流保存为当前会话的交付文件（自动落交付目录并登记到文件面板）。' +
        'url 与 data 二选一：url 支持 http/https 直链；data 支持裸 base64 或 data URL。' +
        'file_name 必填（如 "封面.png"）。只用于二进制/媒体成品；纯文本请用 file_write。',
      inputSchema: {
        type: 'object',
        properties: {
          file_name: {
            type: 'string',
            description: '保存文件名（含扩展名），如 "海报.png"、"成片.mp4"、"报告.pdf"。',
          },
          url: {
            type: 'string',
            description: '可选，http/https 文件直链。与 data 只能传一个。',
          },
          data: {
            type: 'string',
            description: '可选，裸 base64 或 data URL（如 data:image/png;base64,...）。与 url 只能传一个。',
          },
          mime_type: {
            type: 'string',
            description: '可选，数据 MIME 类型；不传时从 data URL 或文件扩展名推断。',
          },
          max_bytes: {
            type: 'number',
            description: '可选，体积上限（字节），默认 512MB。超过会明确报错，不截断。',
          },
        },
        required: ['file_name'],
      },
    },
  ]);
}
