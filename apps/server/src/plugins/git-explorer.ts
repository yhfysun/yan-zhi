// git-explorer 内置插件：manifest + 入口模块（注册 git 工具供 LLM 调用）
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { gitService } from '../services/git.js';

export const gitExplorerManifest: PluginManifest = {
  id: 'git-explorer',
  name: 'Git 文件管理',
  version: '1.0.0',
  description: '文件树浏览、Git 状态/差异/提交管理，对话中可打开目录',
  permissions: ['fs', 'shell', 'git'],
  contributes: {
    tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_file_tree'],
  },
};

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const gitExplorerModule: PluginModule = {
  activate: (ctx) => {
    ctx.registerTool({
      name: 'git_status',
      description: '获取指定 Git 仓库的当前状态（变更文件、暂存区等）',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string', description: '仓库绝对路径' } },
        required: ['repo'],
      },
      execute: async (args) => textResult(await gitService.status(String(args.repo))),
    });

    ctx.registerTool({
      name: 'git_diff',
      description: '获取 Git 差异内容',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          file: { type: 'string', description: '指定文件路径（可选）' },
          staged: { type: 'boolean', description: '是否仅看暂存区差异' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(
          await gitService.diff(String(args.repo), {
            file: args.file as string | undefined,
            staged: !!args.staged,
          }),
        ),
    });

    ctx.registerTool({
      name: 'git_log',
      description: '获取 Git 提交历史',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string' },
          n: { type: 'number', description: '条数，默认 50' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(
          await gitService.log(String(args.repo), {
            branch: args.branch as string | undefined,
            n: args.n as number | undefined,
          }),
        ),
    });

    ctx.registerTool({
      name: 'git_commit',
      description: '提交变更到 Git 仓库',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          message: { type: 'string', description: '提交信息' },
          files: { type: 'array', items: { type: 'string' }, description: '要暂存并提交的文件（可选，不传则提交所有已暂存）' },
        },
        required: ['repo', 'message'],
      },
      execute: async (args) => {
        await gitService.commit(String(args.repo), String(args.message), args.files as string[] | undefined);
        return textResult({ ok: true });
      },
    });

    ctx.registerTool({
      name: 'git_file_tree',
      description: '获取仓库目录文件树（带 Git 状态标注）',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string', description: '子目录相对路径（可选）' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(await gitService.fileTree(String(args.repo), (args.path as string) || '')),
    });

    ctx.log('git-explorer 插件已激活，注册 5 个 git 工具');
  },
};