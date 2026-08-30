import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

const REPO = { type: 'string', description: '仓库本地路径（绝对路径）' } as const;

export function registerGitTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('git', [
    {
      name: 'api_git_status',
      description: '查看 Git 仓库当前状态：已修改/新增/删除的文件、暂存区与未跟踪文件。需要先知道仓库路径',
      inputSchema: {
        type: 'object',
        properties: { repo: REPO },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_diff',
      description: '查看 Git 仓库的文本差异。不传 file 则看全部改动；staged=true 看暂存区差异',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          file: { type: 'string', description: '可选，只看指定文件的差异' },
          staged: { type: 'boolean', description: '可选，true 表示查看已暂存的差异' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_log',
      description: '查看 Git 提交历史',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          branch: { type: 'string', description: '可选，指定分支；默认当前分支' },
          n: { type: 'number', description: '可选，返回条数，默认 50' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_branches',
      description: '列出 Git 仓库的分支',
      inputSchema: {
        type: 'object',
        properties: { repo: REPO },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_add',
      description: '把文件加入 Git 暂存区。files 为空数组表示暂存全部改动',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          files: { type: 'array', items: { type: 'string' }, description: '要暂存的文件路径；空数组=全部' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_commit',
      description: '提交 Git 改动。可选 files 指定只提交部分文件（会先暂存这些文件）',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          message: { type: 'string', description: '提交信息' },
          files: { type: 'array', items: { type: 'string' }, description: '可选，只提交这些文件' },
        },
        required: ['repo', 'message'],
      },
    },
    {
      name: 'api_git_push',
      description: '把本地提交推送到远程仓库',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          branch: { type: 'string', description: '可选，远程分支名；默认当前分支' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_pull',
      description: '从远程仓库拉取更新',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          branch: { type: 'string', description: '可选，分支名；默认当前分支' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'api_git_checkout',
      description: '切换 Git 分支',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          branch: { type: 'string', description: '要切换到的分支名' },
        },
        required: ['repo', 'branch'],
      },
    },
    {
      name: 'api_git_restore',
      description: '丢弃工作区文件的未提交改动（恢复到最后一次提交/暂存的状态）。此操作不可逆，使用前请确认',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          files: { type: 'array', items: { type: 'string' }, description: '要恢复的文件路径列表' },
        },
        required: ['repo', 'files'],
      },
    },
    {
      name: 'api_git_read_file',
      description: '读取 Git 仓库中某个工作区文件的内容',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          path: { type: 'string', description: '相对仓库根目录的文件路径' },
        },
        required: ['repo', 'path'],
      },
    },
    {
      name: 'api_git_show',
      description: '查看 Git 仓库中某个文件在指定提交（ref，默认 HEAD）时的内容',
      inputSchema: {
        type: 'object',
        properties: {
          repo: REPO,
          path: { type: 'string', description: '相对仓库根目录的文件路径' },
          ref: { type: 'string', description: '可选，提交/分支/tag，默认 HEAD' },
        },
        required: ['repo', 'path'],
      },
    },
  ]);
}
