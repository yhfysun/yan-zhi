/**
 * 文件类工具的路径入参解析 —— 兼容主流编码助手的参数命名（2026-10-21）。
 *
 * ★ 为什么需要（用户要求「文件格式对齐 trae / codex / claude code」）：
 *   同一个「文件路径」在三家生态里叫法不同，模型按训练时的习惯发参数就必然错位：
 *     - Claude Code：`file_path`（Read / Edit / Write）
 *     - Codex：`file_path`（apply_patch 之外的读写工具）
 *     - Cline / Trae：`path`
 *   本仓历史实现只认 `path`（早期还用过 `filePath`）→ 模型发 `file_path` 时被判"缺参"，
 *   于是反复重试/降级成整文件重写。**一个入口统一认这些别名**，别在每个工具里各写一份。
 */
const PATH_KEYS = ['path', 'file_path', 'filePath', 'target_file'] as const;

/** 取路径参数（任一别名），没有则返回空串 */
export function readPathArg(args: Record<string, unknown> | null | undefined): string {
  if (!args) return '';
  for (const key of PATH_KEYS) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * 声明给模型看的 schema 片段：主参数仍叫 `path`，并把别名写进 properties。
 * 返回值直接展开进 `inputSchema.properties`。
 */
export const PATH_ARG_SCHEMA = {
  path: {
    type: 'string',
    description: '文件路径（绝对或相对工作目录）。也接受 file_path / filePath（Claude Code、Codex 的命名），三者等价。',
  },
  file_path: {
    type: 'string',
    description: '`path` 的别名，兼容 Claude Code / Codex 的 file_path 命名。',
  },
} as const;
