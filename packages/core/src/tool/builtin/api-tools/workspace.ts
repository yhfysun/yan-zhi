import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerWorkspaceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('workspace', [
    { name: 'api_workspace_list_dir', description: '列出目录内容', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'api_workspace_search_files', description: '搜索文件（glob匹配）', inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
    { name: 'api_code_semantic_search', description: '在工作区代码库里做语义检索（embedding 向量相似度）：用自然语言描述要找的逻辑（如"处理 token 轮换的逻辑"），返回最相关的 文件:行号 + 代码片段。首次调用会自动构建索引（几百个文件约需一两分钟），之后增量更新；file_grep/code_search 找不到语义级目标时用它。需要已配置 embedding 模型（知识库同款）。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural-language description of the code to find, e.g. "token pool rotation and circuit breaker".' },
          path: { type: 'string', description: 'Workspace root (absolute or relative). Defaults to the current workspace.' },
          top_k: { type: 'number', description: 'Max results (default 8, max 30).' },
          reindex: { type: 'boolean', description: 'Force full rebuild of the index (use when files changed a lot and results look stale).' },
        },
        required: ['query'],
      } },
  ]);
}
