import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerToolTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('tool', [
    { name: 'api_custom_tool_list', description: '列出所有自定义工具', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_custom_tool_get', description: '获取自定义工具详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_create', description: '创建自定义工具（Node.js沙箱）', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, inputSchema: { type: 'object' }, entry: { type: 'string' }, code: { type: 'string' }, timeout: { type: 'number' } }, required: ['name', 'inputSchema', 'entry', 'code'] } },
    { name: 'api_custom_tool_update', description: '更新自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_delete', description: '删除自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_toggle', description: '启用/禁用自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] } },
    { name: 'api_builtin_tool_list', description: '列出所有内置工具', inputSchema: { type: 'object', properties: {}, required: [] } },
    {
      name: 'api_custom_tool_execute',
      description: '执行一个已启用的自定义工具（在服务端 node:vm 沙箱中运行，受 timeout 限制）。args 需符合该工具的 inputSchema，可先用 api_custom_tool_get 查看定义',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '自定义工具 id' },
          args: { type: 'object', description: '传给工具的参数对象' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_tool_ocr',
      description: '对图片做 OCR 文字识别（截图、扫描件、图片中的表格等）。传 path 读取本地图片文件，或传 image（base64）直接在内存中识别',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '本地图片文件绝对路径' },
          image: { type: 'string', description: '可选，图片内容的 base64 编码（与 path 二选一，优先用 image）' },
          lang: { type: 'string', description: '可选，识别语言，默认 chi_sim+eng（中英文）' },
        },
        required: [],
      },
    },
    {
      name: 'api_tool_install',
      description: '从已配置的远程商城源安装一个工具到本地。需先通过 api_marketplace_sources 拿到 remoteSourceId',
      inputSchema: {
        type: 'object',
        properties: {
          remoteSourceId: { type: 'string', description: '远程商城源 id' },
          toolId: { type: 'string', description: '远程工具 id' },
        },
        required: ['remoteSourceId', 'toolId'],
      },
    },
  ]);
}
