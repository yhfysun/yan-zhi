// 内置插件源码模板：导出功能的数据源。
// 内置插件以内存模块注册，运行时无法反序列化源码，故在此维护与源码同步的模板副本。
// 注意：修改对应插件源码时须同步更新此处的模板字符串。
import type { PluginManifest } from '@yan-zhi/core';

export interface PluginTemplate {
  manifest: PluginManifest;
  /** 插件主入口源码（TypeScript） */
  code: string;
  readme: string;
}

const GIT_EXPLORER_CODE = `// git-explorer 内置插件：manifest + 入口模块（注册 git 工具供 LLM 调用）
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
`;

const SCAFFOLD_CODE = `// 插件脚手架：复制本文件到 apps/server/src/plugins/<你的插件id>.ts，
// 在 apps/server/src/index.ts 中 registerBuiltin 注册即可。
// 已安装插件（.yzp）则只需 manifest.json + 编译后的 main 入口 JS。
import type { PluginManifest, PluginModule } from '@yan-zhi/core';

export const myPluginManifest: PluginManifest = {
  id: 'my-plugin',            // kebab-case，全局唯一
  name: '我的插件',
  version: '0.1.0',
  description: '一句话说明插件能力',
  // 可选权限：fs | shell | git | db | network | clipboard | desktop-input
  permissions: [],
  // 向 LLM 声明本插件注册的工具名（文档性，实际注册在 activate 里）
  contributes: {
    tools: ['my_tool_hello'],
  },
};

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const myPluginModule: PluginModule = {
  activate: (ctx) => {
    // 1. 注册工具（LLM 可调用的执行体）
    ctx.registerTool({
      name: 'my_tool_hello',
      description: '示例工具：返回问候语',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: '要问候的名字' } },
        required: ['name'],
      },
      execute: async (args) => textResult({ hello: String(args.name) }),
    });

    // 2. 可选：挂后端 HTTP 路由（挂载在 /api/plugin/my-plugin/*）
    // ctx.registerBackendRoute((app) => {
    //   app.get('/ping', (_req: unknown, res: { json: (d: unknown) => void }) => res.json({ pong: true }));
    // });

    // 3. 可选：插件私有存储（按 plugin_id 持久化 KV）
    // await ctx.storage.set('lastRun', Date.now());
    // const last = await ctx.storage.get<number>('lastRun');

    // 4. 可选：事件（emit 发出，on 订阅；插件禁用时 dispose）
    // const off = ctx.on('some-event', (payload) => ctx.log('收到事件', payload));

    ctx.log('my-plugin 已激活');
  },
  deactivate: () => {
    // 清理非 Disposable 管理的资源（registerTool/registerBackendRoute 返回的句柄会自动 dispose）
  },
};
`;

const SCAFFOLD_README = `# yan-zhi 插件开发模板

## 两种形态
1. **内置插件**（源码随主程序）：把 main.ts 复制到 \`apps/server/src/plugins/<id>.ts\`，
   在 \`apps/server/src/index.ts\` 中 \`mgr.registerBuiltin(manifest, module)\` 注册。
2. **安装插件**（.yzp 包）：zip 包含 \`manifest.json\` + \`main\` 指定的入口 JS（CommonJS 或 ESM），
   在「插件管理」页安装。入口通过 \`module.exports\` / \`export\` 提供 \`{ activate, deactivate? }\`。

## PluginContext API（activate 注入）
- \`ctx.registerTool(def)\` — 注册 LLM 可调用工具，\`def.execute\` 返回 \`{ content: [{ type: 'text', text }] }\`
- \`ctx.registerBackendRoute(setup)\` — 挂后端路由，运行在 \`/api/plugin/<id>/*\`
- \`ctx.storage.get/set/delete\` — 按 plugin_id 持久化 KV
- \`ctx.adapter\` — 受权限过滤的平台能力（fs/shell/db 等，未声明的权限会被屏蔽）
- \`ctx.config\` — 插件配置（管理页「配置」编辑的 JSON）
- \`ctx.emit / ctx.on\` — 事件
- \`ctx.log\` — 日志

## 权限
manifest.permissions 声明后生效：fs / shell / git / db / network / clipboard / desktop-input。
desktop-input 允许控制本机鼠标键盘与截屏，属高危权限，启用时需用户确认。

## 参考实现
内置插件 git-explorer：注册工具 + 调用 service 的标准写法（可在插件管理页导出查看）。
`;

export const PLUGIN_TEMPLATES: Record<string, PluginTemplate> = {
  'git-explorer': {
    manifest: {
      id: 'git-explorer',
      name: 'Git 文件管理',
      version: '1.0.0',
      description: '文件树浏览、Git 状态/差异/提交管理，对话中可打开目录',
      permissions: ['fs', 'shell', 'git'],
      contributes: { tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_file_tree'] },
    },
    code: GIT_EXPLORER_CODE,
    readme: '内置插件 git-explorer 源码：registerTool 注册 git 工具 + 调用 server service 的标准写法。',
  },
  template: {
    manifest: {
      id: 'my-plugin',
      name: '插件开发模板',
      version: '0.1.0',
      description: '新插件脚手架：registerTool / registerBackendRoute / storage / 事件 用法示例',
      permissions: [],
      contributes: { tools: ['my_tool_hello'] },
    },
    code: SCAFFOLD_CODE,
    readme: SCAFFOLD_README,
  },
};
