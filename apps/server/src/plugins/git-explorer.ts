// git-explorer 内置插件：manifest + 入口模块（注册 git 工具供 LLM 调用）
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { gitService } from '../services/git.js';

export const gitExplorerManifest: PluginManifest = {
  id: 'git-explorer',
  name: 'Git 文件管理',
  version: '1.0.0',
  category: '功能',
  description: '文件树浏览、Git 状态/差异/提交管理，对话中可打开目录',
  permissions: ['fs', 'shell', 'git'],
  contributes: {
    tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_file_tree'],
    routes: [
      { path: '/git-explorer', name: 'git-explorer', component: 'views/plugin/GitExplorer.vue', meta: { desktopOnly: true } },
    ],
    // 不挂侧栏/「更多」入口：Git 统一走对话页 Git 面板与代码模式侧栏，避免导航里出现重复项
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

    ctx.registerTool({
      name: 'git_fetch',
      description: '从远程抓取更新（不合并）',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' } },
        required: ['repo'],
      },
      execute: async (args) => textResult(await gitService.fetch(String(args.repo), (args.remote as string) || 'origin', args.branch as string | undefined)),
    });

    ctx.registerTool({
      name: 'git_stash_save',
      description: '储藏当前改动',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, message: { type: 'string' } },
        required: ['repo'],
      },
      execute: async (args) => textResult(await gitService.stashSave(String(args.repo), args.message as string | undefined)),
    });

    ctx.registerTool({
      name: 'git_stash_list',
      description: '列出所有储藏',
      inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] },
      execute: async (args) => textResult(await gitService.stashList(String(args.repo))),
    });

    ctx.registerTool({
      name: 'git_stash_pop',
      description: '弹出储藏',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, index: { type: 'number' } },
        required: ['repo'],
      },
      execute: async (args) => textResult(await gitService.stashPop(String(args.repo), (args.index as number) || 0)),
    });

    ctx.registerTool({
      name: 'git_tag_create',
      description: '创建标签',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, name: { type: 'string' }, message: { type: 'string' } },
        required: ['repo', 'name'],
      },
      execute: async (args) => { await gitService.tagCreate(String(args.repo), String(args.name), args.message as string | undefined); return textResult({ ok: true }); },
    });

    ctx.registerTool({
      name: 'git_tag_list',
      description: '列出所有标签',
      inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] },
      execute: async (args) => textResult(await gitService.tagList(String(args.repo))),
    });

    ctx.registerTool({
      name: 'git_blame',
      description: '追溯文件每行的修改信息',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, file: { type: 'string' } },
        required: ['repo', 'file'],
      },
      execute: async (args) => textResult(await gitService.blame(String(args.repo), String(args.file))),
    });

    ctx.registerTool({
      name: 'git_revert',
      description: '撤销指定提交（产生反向提交）',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, commit: { type: 'string' } },
        required: ['repo', 'commit'],
      },
      execute: async (args) => textResult(await gitService.revert(String(args.repo), String(args.commit))),
    });

    ctx.registerTool({
      name: 'git_reset',
      description: '重置 HEAD 到指定目标',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, mode: { type: 'string', enum: ['soft', 'mixed', 'hard'] }, target: { type: 'string' } },
        required: ['repo', 'mode', 'target'],
      },
      execute: async (args) => textResult(await gitService.reset(String(args.repo), args.mode as 'soft' | 'mixed' | 'hard', String(args.target))),
    });

    ctx.registerTool({
      name: 'git_cherry_pick',
      description: '挑选提交到当前分支',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, commit: { type: 'string' } },
        required: ['repo', 'commit'],
      },
      execute: async (args) => textResult(await gitService.cherryPick(String(args.repo), String(args.commit))),
    });

    ctx.registerTool({
      name: 'git_rebase',
      description: '变基到指定分支',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, branch: { type: 'string' } },
        required: ['repo', 'branch'],
      },
      execute: async (args) => textResult(await gitService.rebase(String(args.repo), String(args.branch))),
    });

    ctx.registerTool({
      name: 'git_merge',
      description: '合并指定分支到当前分支',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, branch: { type: 'string' } },
        required: ['repo', 'branch'],
      },
      execute: async (args) => textResult(await gitService.merge(String(args.repo), String(args.branch))),
    });

    ctx.registerTool({
      name: 'git_branches',
      description: '列出本地和远程分支',
      inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] },
      execute: async (args) => textResult({ local: await gitService.branches(String(args.repo)), remote: await gitService.remoteBranches(String(args.repo)) }),
    });

    ctx.log('git-explorer 插件已激活，注册 git 工具');
  },
};