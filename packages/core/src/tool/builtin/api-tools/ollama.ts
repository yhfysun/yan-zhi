import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerOllamaTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('ollama', [
    {
      name: 'api_ollama_list',
      description: '列出本机 Ollama 的模型市场：含可选模型目录（体积/参数量/适用场景/硬件要求）、已在本机的模型（onDisk）、以及正在进行的拉取进度。用于判断本地模型是否可用或需要先拉取',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_ollama_pull',
      description: '触发拉取（下载）一个本地模型，立即返回，不阻塞。模型较大，下载需较长时间；用 api_ollama_pull_status 查询进度',
      inputSchema: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Ollama 模型名，如 qwen2.5:3b / bge-m3，取 api_ollama_list 中的 key' },
        },
        required: ['model'],
      },
    },
    {
      name: 'api_ollama_pull_status',
      description: '查询某个模型的拉取进度（state: downloading/done/error，progress 0..1）。本地模型需拉取完成后才可用',
      inputSchema: {
        type: 'object',
        properties: { model: { type: 'string' } },
        required: ['model'],
      },
    },
    {
      name: 'api_ollama_delete',
      description: '删除本机已拉取的 Ollama 模型，释放磁盘空间',
      inputSchema: {
        type: 'object',
        properties: { model: { type: 'string' } },
        required: ['model'],
      },
    },
    {
      name: 'api_ollama_test',
      description: '用一句简单对话测试本机某个 Ollama 模型是否可正常响应（返回模型回复内容）。用于排查本地模型不可用问题',
      inputSchema: {
        type: 'object',
        properties: { model: { type: 'string' } },
        required: ['model'],
      },
    },
  ]);
}
