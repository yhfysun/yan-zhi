# 言智 — 插件系统与 Git 管理插件 设计文档

> 版本：v1.0  日期：2026-08-30  状态：设计评审中
> 范围：统一插件框架、配色/布局扩展、Git 核心服务、Git 管理插件、插件管理菜单

---

## 1. 背景与目标

### 1.1 背景

言智当前已有 4 套分散的扩展机制：

| 机制 | 位置 | 说明 |
|------|------|------|
| 工具注册中心 | `packages/core/src/tool/registry.ts:5` | 内置工具 + 自定义工具 |
| 自定义工具沙箱 | `packages/core/src/tool/sandbox.ts:4` | DB 表 `custom_tool`，`node:vm` 执行 |
| MCP 服务 | `packages/core/src/mcp/client.ts:21` | stdio/sse/http 外部工具 |
| 工作流节点 | `packages/core/src/workflow/engine.ts:37` | `NodeHandler` 注册 |
| Skill | `packages/core/src/skill/loader.ts:12` | Markdown + YAML frontmatter |

问题：**没有统一插件抽象层**，扩展点分散，无法让一个第三方包同时贡献工具+配色+布局+页面+对话增强。同时项目**完全没有 Git 功能**（仅 `cmd-exec` 工具可间接跑 git 命令）。

### 1.2 目标

1. **统一插件系统**：一个插件包可声明式贡献多个扩展点（工具/配色/布局/侧栏/路由/设置面板/对话增强/后端路由）。
2. **配色与布局可插件化**：插件能注册新主题调色板和新布局壳。
3. **Git 核心能力**：后端提供 Git 服务（status/diff/log/branch/commit/pull/push/checkout/文件树）。
4. **Git 管理插件**：仿 AI 编码应用，对话中选文件夹可打开目录文件树 + Git 面板。
5. **插件管理菜单**：设置内有独立菜单管理插件（启用/禁用/配置/安装/卸载/权限）。
6. **三端兼容**：沿 `PlatformAdapter` 抽象，Electron 全功能，Web/Mobile 优雅降级。

### 1.3 非目标

- 不做插件市场（远程下载源）v1，仅支持本地内置 + 本地 .yzp 包安装。
- 不实现插件热重载（v1 重启生效）。
- 不做插件间依赖解析（v1 假设插件独立）。

### 1.4 术语

| 术语 | 含义 |
|------|------|
| Extension Point（扩展点） | 插件可挂载的具名位置，如 `tools`/`themes` |
| Contributes | 插件清单中声明要挂载的扩展点集合 |
| PluginContext | 激活时注入插件的 API 句柄 |
| .yzp | 言智插件包格式（zip） |
| Plugin-backend | 插件在 Node 进程运行的部分 |
| Plugin-ui | 插件在 Vue 渲染进程运行的部分 |

---

## 2. 总体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         言智应用进程                                 │
│                                                                     │
│  ┌─ 渲染进程 (Vue) ──────────────────────────────────────────────┐  │
│  │  usePluginStore (Pinia)                                       │  │
│  │  ├─ 聚合所有激活插件 contributes                              │  │
│  │  ├─ themes  → useSettingsStore.THEMES                         │  │
│  │  ├─ layouts → App.vue 布局切换                                │  │
│  │  ├─ sidebar → SideNav.vue                                     │  │
│  │  ├─ routes  → router.addRoute()                               │  │
│  │  ├─ settingsTabs → SettingsDrawer.vue                         │  │
│  │  ├─ chatEnhancers → ChatMessageList.vue                       │  │
│  │  └─ tools(元数据) → 工具选择 UI                              │  │
│  │                                                              │  │
│  │  插件 UI 模块 (import.meta.glob + 动态 import)               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↕ HTTP REST / IPC                      │
│  ┌─ Node 后端进程 ──────────────────────────────────────────────┐  │
│  │  PluginManager                                              │  │
│  │  ├─ loader (require / 沙箱)                                 │  │
│  │  ├─ registry (扩展点注册表)                                 │  │
│  │  ├─ permissions (adapter 代理过滤)                          │  │
│  │  └─ 生命周期 activate/deactivate                            │  │
│  │                                                              │  │
│  │  GitService (simple-git)  →  /api/git/*                      │  │
│  │  插件后端路由  →  /api/plugin/<id>/*                         │  │
│  │  插件工具执行体  →  ToolRegistry                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  PlatformAdapter 抽象三端差异 (fs/shell/db/keyring/mcp)             │
└─────────────────────────────────────────────────────────────────────┘

插件来源：
  ├─ 内置 plugins/         (随应用分发，构建时打包)
  └─ 已安装 userData/plugins/<id>/  (Electron 解压 .yzp，动态 import)
```

### 2.2 核心数据流（以 Git 插件工具调用为例）

```
LLM 决定调用 git_status 工具
   ↓
chat.ts:616 dispatchToolCall()
   ↓
ToolRegistry.execute('git_status', {repo})
   ↓
PluginManager 路由到 git-explorer 插件的 tool 实现
   ↓
插件通过 PluginContext.adapter.shell 调 simple-git
   ↓ (权限校验：permissions 含 'shell')
   ↓
GitService.status(repo) → 路径白名单校验 → simple-git
   ↓
返回 status 结果 → LLM
```

### 2.3 核心数据流（配色插件生效）

```
插件 activate() → ctx.registerTheme(palette)
   ↓
PluginManager.registry.themes.add(palette)
   ↓ (HTTP 推送 / 同进程)
usePluginStore.themes 更新
   ↓
useSettingsStore.THEMES = builtinThemes ⊕ pluginThemes
   ↓
用户在设置选择该主题 → applyTheme() 写 CSS 变量 (settings.ts:260)
   ↓
App.vue 全局样式生效（零改造，已是 CSS 变量驱动）
```

---

## 3. 插件清单规范

### 3.1 `plugin.json` 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 全局唯一，kebab-case，如 `git-explorer` |
| `name` | string | 是 | 显示名（中文本地化） |
| `version` | string | 是 | semver |
| `author` | string | 否 | 作者 |
| `description` | string | 否 | 描述 |
| `minAppVersion` | string | 否 | 兼容的最低应用版本 |
| `main` | string | 否 | 后端入口相对路径（Node） |
| `ui` | string | 否 | 前端入口相对路径（Vue） |
| `permissions` | string[] | 否 | `fs`/`shell`/`git`/`db`/`network`/`clipboard` |
| `contributes` | object | 否 | 扩展点声明（见下） |
| `config` | object | 否 | 默认配置 schema（JSON Schema） |

### 3.2 contributes 扩展点

| 扩展点 | 值类型 | 说明 |
|--------|--------|------|
| `tools` | string[] | 工具定义文件 glob，注册到 ToolRegistry |
| `themes` | string[] | 调色板 json 文件 glob |
| `layouts` | object[] | `{id, name, component, icon}` 布局组件 |
| `sidebar` | object[] | `{id, icon, route, label, order}` 侧栏入口 |
| `routes` | object[] | `{path, name, component, meta}` 前端路由 |
| `settingsTabs` | object[] | `{id, label, icon, component}` 设置面板 |
| `chatEnhancers` | string[] | 对话渲染增强器文件 glob |
| `backendRoutes` | string[] | 后端 Express 路由文件 glob |

### 3.3 示例（git-explorer）

```json
{
  "id": "git-explorer",
  "name": "Git 文件管理",
  "version": "1.0.0",
  "description": "文件树浏览、Git 状态/差异/提交管理，对话中可打开目录",
  "main": "server/index.ts",
  "ui": "ui/index.ts",
  "permissions": ["fs", "shell", "git"],
  "contributes": {
    "tools": ["tools/*.ts"],
    "sidebar": [{ "id": "git", "icon": "GitBranch", "route": "/git-explorer", "label": "Git 管理", "order": 50 }],
    "routes": [{ "path": "/git-explorer", "name": "git-explorer", "component": "views/GitExplorer.vue" }],
    "settingsTabs": [{ "id": "git", "label": "Git", "icon": "GitBranch", "component": "panels/GitSettings.vue" }],
    "chatEnhancers": ["chat/folderPreview.ts"],
    "backendRoutes": ["server/routes/git.ts"]
  },
  "config": {
    "type": "object",
    "properties": {
      "defaultRepo": { "type": "string" },
      "excludePatterns": { "type": "array", "items": {"type":"string"} }
    }
  }
}
```

---

## 4. PluginManager 详细设计

### 4.1 模块组成

```
packages/core/src/plugin/
  ├── types.ts          # 类型定义
  ├── api.ts            # PluginContext 接口与构造
  ├── manifest.ts       # 清单加载与校验
  ├── loader.ts         # 加载器（后端 require / 前端 import）
  ├── registry.ts       # 扩展点注册表
  ├── permissions.ts    # adapter 权限过滤代理
  ├── manager.ts        # PluginManager 主类
  └── index.ts          # 单例 getPluginManager()
```

### 4.2 PluginManager 接口

```ts
class PluginManager {
  // 生命周期
  loadBuiltin(pluginsDir: string): Promise<void>      // 启动时加载内置
  install(packagePath: string): Promise<Plugin>       // 安装 .yzp
  uninstall(id: string): Promise<void>
  enable(id: string): Promise<void>                   // 激活
  disable(id: string): Promise<void>                  // 停用
  reload(id: string): Promise<void>

  // 查询
  list(): Plugin[]
  get(id: string): Plugin | undefined
  registry: ExtensionRegistry                          // 各扩展点注册表

  // 事件
  on(event: 'enabled'|'disabled'|'installed'|'uninstalled', cb): Disposable
}

interface Plugin {
  manifest: PluginManifest
  state: 'installed' | 'enabled' | 'disabled' | 'error'
  error?: string
  config: Record<string, any>
  disposables: Disposable[]                           // activate 注册的资源，deactivate 时清理
}
```

### 4.3 生命周期

```
install(.yzp)
  → 解压到 userData/plugins/<id>/
  → 校验 manifest（schema + minAppVersion + 权限）
  → 权限确认弹窗（UI 层）
  → 写 DB plugin 表 (state='installed')
  → enable(id)

enable(id)
  → load main 模块 (require / 沙箱)
  → 构造 PluginContext（按 permissions 过滤 adapter）
  → 调 plugin.activate(ctx)
  → 插件调 ctx.registerXxx() → 写入 registry
  → state='enabled'
  → 推送 contributes 到前端 usePluginStore（HTTP / 同进程）

disable(id)
  → 调 plugin.deactivate()
  → 清理 disposables（从 registry 移除该插件所有注册项）
  → state='disabled'
  → 通知前端移除 contributes
```

### 4.4 扩展点注册表

```ts
class ExtensionRegistry {
  tools: Map<string, ToolDefinition & { pluginId: string }>
  themes: Map<string, ThemePalette & { pluginId: string }>
  layouts: Map<string, LayoutDef & { pluginId: string }>
  sidebar: SidebarItem[]
  routes: RouteConfig[]
  settingsTabs: SettingsTab[]
  chatEnhancers: ChatEnhancer[]
  backendRoutes: Map<string, (app: Express) => void>

  register(pluginId, point, item): Disposable   // 返回 Disposable，调用即移除
  byPlugin(pluginId): RegistrySlice              // 卸载时批量清理
}
```

### 4.5 权限过滤代理

`permissions.ts` 包裹 `PlatformAdapter`，按清单 `permissions` 字段拦截：

```ts
function createSandboxedAdapter(adapter: PlatformAdapter, perms: string[]): PlatformAdapter {
  return new Proxy(adapter, {
    get(target, prop) {
      if (prop === 'shell' && !perms.includes('shell')) throw new PermissionDenied('shell')
      if (prop === 'fs' && !perms.includes('fs')) throw new PermissionDenied('fs')
      // ...
      return target[prop]
    }
  })
}
```

---

## 5. 插件 API（PluginContext）

激活时注入插件的唯一入口，插件不直接访问平台 API：

```ts
export interface PluginContext {
  id: string
  log: (...args: any[]) => void
  adapter: PlatformAdapter              // 已按 permissions 过滤
  config: Record<string, any>           // 插件配置（从 DB 读取）

  // 扩展点注册（均返回 Disposable）
  registerTool(def: ToolDefinition): Disposable
  registerTheme(theme: ThemePalette): Disposable
  registerLayout(opts: { id: string; name: string; component: Component }): Disposable
  registerSidebar(item: SidebarItem): Disposable
  registerRoute(route: RouteConfig): Disposable
  registerSettingsTab(tab: SettingsTab): Disposable
  registerChatEnhancer(enhancer: ChatEnhancer): Disposable
  registerBackendRoute(setup: (app: Express) => void): Disposable  // 仅后端插件

  // 插件私有存储
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
  }

  // 事件总线（插件间通信，可选）
  emit(event: string, payload?: any): void
  on(event: string, handler: Function): Disposable

  // 国际化（可选）
  t(key: string, params?: object): string
}

// 插件入口模块导出
export interface PluginModule {
  activate(ctx: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
```

### 5.1 插件入口示例

```ts
// plugins/git-explorer/server/index.ts
import type { PluginModule } from '@yanzhi/plugin-api'
import { gitStatusTool, gitDiffTool, gitCommitTool } from './tools'
import { registerGitRoutes } from './routes/git'

export const activate: PluginModule['activate'] = async (ctx) => {
  ctx.registerTool(gitStatusTool(ctx))
  ctx.registerTool(gitDiffTool(ctx))
  ctx.registerTool(gitCommitTool(ctx))
  ctx.registerBackendRoute((app) => registerGitRoutes(app, ctx))
  ctx.log('git-explorer 已激活')
}

export const deactivate = () => { /* 清理 */ }
```

---

## 6. 扩展点详细对接

### 6.1 tools（工具）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/core/src/tool/registry.ts:5` |
| 改造 | `registerBuiltInTools()` 后追加 `pluginManager.registry.tools` 逐个 register |
| 工具命名 | 加前缀 `plugin_<id>__<name>`，避免与内置/MCP 冲突（沿用 `chat.ts:621` 的前缀约定） |
| 执行体 | 插件提供，经 `PluginContext.adapter` 访问平台能力 |
| 沙箱 | 第三方插件工具执行体跑在 `vm` 沙箱（复用 `sandbox.ts`）；内置插件直接 require |
| UI | 工具选择列表合并 `pluginManager.registry.tools` 的元数据 |

### 6.2 themes（配色）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/stores/settings.ts:176` |
| 改造 | `THEMES` 改为 getter：`builtinThemes ⊕ pluginThemes`；`ThemeName` 类型扩展为 `string`（不再固定枚举） |
| 生效 | `applyTheme()`（`settings.ts:260`）已写 CSS 变量，**零改造** |
| 调色板结构 | 复用现有：`{primary, primaryLight, primaryDark, accent, gradient, orb1, orb2, orb3}` |
| 深色 | 插件可提供 `palette.dark` 覆盖深色下的变量 |

### 6.3 layouts（布局）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/App.vue:1` |
| 改造 | `App.vue` 增加 `currentLayout` 状态；布局组件接收 `<slot>`（内容区 = router-view），自行组织侧栏/顶栏/主区 |
| 默认 | 内置布局 `default`（现有 App.vue 结构） |
| 切换 | 设置页布局选择器，存 `settings.layout` |
| 约束 | 布局组件必须渲染 `<slot/>`，否则路由内容不显示 |

### 6.4 sidebar（侧栏入口）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/components/SideNav.vue:1` |
| 改造 | nav 列表 = 内置 nav + `pluginStore.sidebar`（按 `order` 排序） |
| 字段 | `{id, icon, route, label, order, badge?}` |
| 权限 | 可配 `when` 函数控制显隐（如仅桌面端显示） |

### 6.5 routes（前端路由）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/router/index.ts:5` |
| 改造 | `router.afterEach` 阶段或启动时对 `pluginStore.routes` 调 `router.addRoute()` |
| 懒加载 | 组件用 `() => import(path)` |
| 守卫 | 插件路由默认套用现有 license 守卫 |
| 卸载 | `router.removeRoute(name)` |

### 6.6 settingsTabs（设置面板）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/components/SettingsDrawer.vue:1` |
| 改造 | tab 列表 = 内置 tab + `pluginStore.settingsTabs` |
| 字段 | `{id, label, icon, component}` |
| 组件 | 接收 `pluginConfig` props，可读写插件配置 |

### 6.7 chatEnhancers（对话增强）

| 项 | 内容 |
|----|------|
| 消费方 | `packages/ui/src/components/chat/ChatMessageList.vue:1` |
| 改造 | 渲染管线挂增强器：`enhancer(message, render) → render'` |
| 用途 | 文件夹路径结果追加「在 Git 管理器中打开」按钮；代码块加「应用此补丁」按钮等 |
| 接口 | `ChatEnhancer = (ctx: { message, toolResult, h }) => VNode | null` |

### 6.8 backendRoutes（后端路由）

| 项 | 内容 |
|----|------|
| 消费方 | `apps/server/src/index.ts:45` |
| 改造 | 启动时遍历 `pluginManager.registry.backendRoutes`，调 `setup(app)` 挂载 |
| 路径前缀 | 强制挂载在 `/api/plugin/<id>/` 下，插件无法越权 |
| 鉴权 | 默认套用 `authMiddleware` |

---

## 7. 配色与布局插件对接

### 7.1 配色插件

插件 `contributes.themes` 提供调色板 JSON：

```json
{
  "id": "nord",
  "name": "Nord 极地",
  "palette": {
    "primary": "#5E81AC",
    "primaryLight": "#81A1C1",
    "primaryDark": "#4C566A",
    "accent": "#88C0D0",
    "gradient": "linear-gradient(135deg, #5E81AC, #88C0D0)",
    "orb1": "#5E81AC", "orb2": "#88C0D0", "orb3": "#A3BE8C",
    "dark": { "primary": "#81A1C1", "background": "#2E3440" }
  }
}
```

合并进 `useSettingsStore.THEMES`，设置页主题 chip 自动多出该选项。可选附带「主题编辑器」面板（`settingsTabs`）让用户自定义调色板并保存到 `plugin_storage`。

### 7.2 布局插件

插件 `contributes.layouts` 提供 Vue 组件：

```vue
<!-- plugins/zen-layout/layouts/Zen.vue -->
<template>
  <div class="zen-layout">
    <header class="zen-topbar"><slot name="topbar"/></header>
    <main class="zen-main"><slot/></main>   <!-- router-view -->
  </div>
</template>
```

`App.vue` 改造：

```vue
<component :is="currentLayoutComponent">
  <router-view />
</component>
```

`currentLayoutComponent` 从 `pluginStore.layouts` 按 `settings.layout` 取，默认内置布局。切换只换壳，路由不动，保证状态不丢。

---

## 8. Git 核心服务

### 8.1 依赖

新增 `simple-git`（Promise API，轻量，调用系统 git）到 `apps/server`。

### 8.2 服务模块 `apps/server/src/services/git.ts`

```ts
import simpleGit from 'simple-git'

class GitService {
  private repos = new Map<string, SimpleGit>()   // repo path → git 实例

  open(repo: string): SimpleGit {
    this.assertWithinWorkspace(repo)             // 路径白名单
    if (!this.repos.has(repo)) this.repos.set(repo, simpleGit(repo))
    return this.repos.get(repo)!
  }

  async discover(dir: string): Promise<string | null>   // 向上找 .git
  async status(repo: string): Promise<StatusResult>
  async diff(repo: string, opts: { file?: string; staged?: boolean }): Promise<string>
  async log(repo: string, opts: { branch?: string; n?: number }): Promise<LogEntry[]>
  async branches(repo: string): Promise<Branch[]>
  async fileTree(repo: string, path?: string): Promise<FileNode[]>   // 带 git 状态
  async commit(repo: string, message: string, files?: string[]): Promise<void>
  async pull(repo: string, branch?: string): Promise<void>
  async push(repo: string, branch?: string): Promise<void>
  async checkout(repo: string, branch: string): Promise<void>
  async add(repo: string, files: string[]): Promise<void>
  async restore(repo: string, files: string[]): Promise<void>   // 撤销修改

  private assertWithinWorkspace(repo: string) {
    const ws = settings.workspaceDir
    if (!path.resolve(repo).startsWith(path.resolve(ws))) throw new PathNotAllowed(repo)
  }
}
```

### 8.3 路由 `apps/server/src/routes/git.ts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/git/capability` | 平台是否支持 git |
| GET | `/api/git/discover?dir=` | 查找仓库 |
| GET | `/api/git/status?repo=` | 状态 |
| GET | `/api/git/diff?repo=&file=&staged=` | 差异 |
| GET | `/api/git/log?repo=&branch=&n=` | 提交历史 |
| GET | `/api/git/branches?repo=` | 分支列表 |
| GET | `/api/git/fileTree?repo=&path=` | 文件树（带状态） |
| POST | `/api/git/commit` | `{repo, message, files?}` |
| POST | `/api/git/add` | `{repo, files}` |
| POST | `/api/git/restore` | `{repo, files}` |
| POST | `/api/git/pull` | `{repo, branch?}` |
| POST | `/api/git/push` | `{repo, branch?}` |
| POST | `/api/git/checkout` | `{repo, branch}` |

### 8.4 FileNode 结构（带 git 状态）

```ts
interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  gitStatus?: 'modified' | 'untracked' | 'staged' | 'added' | 'deleted' | 'renamed' | 'conflict' | 'clean'
  size?: number
  children?: FileNode[]
}
```

### 8.5 三端降级

启动时检测 `adapter.shell`：
- 可用（Electron/Server）→ 注册全部路由
- 不可用（Web/Mobile）→ 仅注册 `/api/git/capability` 返回 `{ supported: false }`，其余路由返回 501

前端 `useGitStore` 先查 capability，不支持时 Git 插件页面显示占位提示「当前平台不支持本地 Git，请在桌面端使用」。

---

## 9. Git 管理插件

### 9.1 插件结构

```
plugins/git-explorer/
  ├── plugin.json
  ├── server/
  │   ├── index.ts              # PluginModule 入口
  │   ├── routes/git.ts         # 后端路由（挂 /api/plugin/git-explorer/）
  │   └── tools/{git_status,git_diff,git_log,git_commit,git_file_tree}.ts
  └── ui/
      ├── index.ts              # 前端入口（注册侧栏/路由/增强器）
      ├── views/GitExplorer.vue # 主页面
      ├── components/
      │   ├── FileTree.vue      # 文件树（带 git 状态图标）
      │   ├── FileEditor.vue    # CodeMirror 编辑器
      │   ├── DiffViewer.vue    # diff 视图
      │   ├── GitPanel.vue      # 右侧 git 面板
      │   ├── BranchSwitcher.vue
      │   └── RepoPicker.vue
      ├── chat/folderPreview.ts # 对话增强器
      └── stores/git.ts         # useGitStore
```

### 9.2 主页面布局（三栏）

```
┌──────────────────────────────────────────────────────────────┐
│  仓库选择 ▼   分支: main ▼          [拉取] [推送] [同步]      │ 顶栏
├────────────┬───────────────────────────┬────────────────────┤
│ 文件树      │  文件预览/编辑            │  Git 面板          │
│            │                           │                    │
│ 📁 src     │  CodeMirror 6             │  变更 (3)          │
│  📄 a.ts M │  ┌─────────────────────┐ │  □ a.ts    (M)     │
│  📄 b.ts U │  │ 代码内容/高亮/diff  │ │  □ b.ts    (U)     │
│ 📁 docs    │  │                     │ │  □ c.ts    (A)     │
│  📄 ...    │  └─────────────────────┘ │                    │
│            │                           │  [暂存全部] [提交]  │
│            │                           │  提交信息: ________ │
│            │                           │                    │
│            │                           │  历史              │
│            │                           │  • fix: xxx (2h)   │
│            │                           │  • feat: yyy (1d)  │
└────────────┴───────────────────────────┴────────────────────┘
```

- **左栏 FileTree**：递归文件树，每项前缀 git 状态徽标（`M`橙/`U`灰/`A`绿/`!`红冲突），点击文件加载到中栏
- **中栏 FileEditor**：CodeMirror 6，支持编辑+语法高亮；切换到 diff 模式显示 `git diff`；保存时写文件并刷新状态
- **右栏 GitPanel**：变更列表（勾选暂存）、提交信息输入、暂存/提交/拉取/推送/撤销按钮、提交历史列表
- **顶栏**：仓库选择器（从 `settings.workspaceDir` 扫已发现仓库）、分支切换、同步操作

### 9.3 对话集成（chatEnhancer）

`chat/folderPreview.ts`：拦截工具结果中出现的文件夹路径（`file_read`/`git_file_tree` 等返回的 dir 路径），在渲染结果下方追加按钮：

```
[📁 在 Git 管理器中打开]
```

点击 → `router.push('/git-explorer?repo=' + encodeURIComponent(path))`，GitExplorer 页面 `onMounted` 读 query 自动加载该仓库文件树。

识别规则：工具结果为目录路径（`adapter.fs.readDir` 成功）或结构化结果含 `{ type: 'directory', path }`。

### 9.4 插件工具（供 LLM 调用）

| 工具名 | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `git_status` | `{repo}` | status 结构 | 当前变更状态 |
| `git_diff` | `{repo, file?, staged?}` | diff 文本 | 差异 |
| `git_log` | `{repo, branch?, n?}` | 提交列表 | 历史 |
| `git_commit` | `{repo, message, files?}` | `{success}` | 提交 |
| `git_file_tree` | `{repo, path?}` | FileNode[] | 带状态的文件树 |

工具命名注册为 `plugin_git-explorer__git_status` 等，LLM 可按描述选用。

---

## 10. 插件管理菜单 UI（详细）

### 10.1 入口

设置抽屉 `SettingsDrawer.vue` 新增独立菜单项「插件管理」，与「通用」「数据」等 tab 平级。同时设置页 `Settings.vue` 顶部 tab 也加「插件」。

```
设置
├─ 通用
├─ 数据
├─ 插件管理   ← 新增
└─ ...
```

### 10.2 插件管理页面布局

```
┌──────────────────────────────────────────────────────────────┐
│  插件管理                                                     │
│  ┌─────────────┐  搜索: [__________]   [📦 安装插件(.yzp)]    │
│  │ 已启用 (2)   │                                              │
│  │ 已禁用 (0)   │  ┌──────────────────────────────────────┐   │
│  │ 可安装       │  │ 🧩 Git 文件管理          v1.0  [启用●] │   │
│  │              │  │ 文件树浏览、Git 状态/差异/提交管理...   │   │
│  │              │  │ 权限: fs · shell · git                 │   │
│  │              │  │ [配置] [详情] [禁用] [卸载]            │   │
│  │              │  └──────────────────────────────────────┘   │
│  │              │  ┌──────────────────────────────────────┐   │
│  │              │  │ 🎨 Nord 主题            v1.0  [启用●] │   │
│  │              │  └──────────────────────────────────────┘   │
│  └─────────────┘                                              │
└──────────────────────────────────────────────────────────────┘
```

### 10.3 组件结构

```
packages/ui/src/components/plugin/
  ├── PluginManager.vue       # 主页面
  ├── PluginCard.vue          # 插件卡片
  ├── PluginConfigDialog.vue  # 配置弹窗（按 manifest.config schema 动态表单）
  ├── PluginDetailDialog.vue  # 详情（清单、权限、日志）
  ├── PluginInstallDialog.vue # 安装向导（选 .yzp → 权限确认 → 安装）
  └── PermissionConfirm.vue   # 权限确认弹窗
```

### 10.4 插件卡片字段

| 字段 | 来源 | 说明 |
|------|------|------|
| 图标 | manifest.icon 或默认 🧩 | |
| 名称 | manifest.name | 中文本地化 |
| 版本 | manifest.version | |
| 描述 | manifest.description | |
| 启用开关 | plugin.state | 切换 enable/disable |
| 权限标签 | manifest.permissions | `fs`/`shell`/`git` 等 chip |
| 操作按钮 | — | 配置 / 详情 / 禁用 / 卸载 |
| 错误标记 | plugin.error | 激活失败时显示红标 + 错误信息 |

### 10.5 交互流程

**启用/禁用**：点击开关 → 调 `POST /api/plugins/:id/enable|disable` → 后端 `PluginManager` → 刷新 store。失败显示错误。

**配置**：点「配置」→ `PluginConfigDialog` 按 `manifest.config`（JSON Schema）动态渲染表单（复用 Element Plus 表单 + 现有 schema 表单模式）→ 保存到 `plugin.config`。

**安装**：点「安装插件」→ `PluginInstallDialog`：
1. 选 `.yzp` 文件（Electron dialog）
2. 解析清单预览（名称/权限/版本）
3. **权限确认**（`PermissionConfirm` 列出申请的权限，用户逐项勾选允许）
4. 确认 → `POST /api/plugins/install` → 解压 → 写 DB → 激活
5. 成功提示 + 刷新列表

**卸载**：点「卸载」→ 二次确认 → `DELETE /api/plugins/:id` → `PluginManager.uninstall` → 移除文件 + DB + 注册项。

**详情**：点「详情」→ `PluginDetailDialog` 显示完整清单、权限、激活日志、配置。

### 10.6 后端管理路由 `apps/server/src/routes/plugins.ts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plugins` | 列出所有插件及状态 |
| GET | `/api/plugins/:id` | 插件详情 |
| POST | `/api/plugins/install` | 安装（multipart .yzp） |
| DELETE | `/api/plugins/:id` | 卸载 |
| POST | `/api/plugins/:id/enable` | 启用 |
| POST | `/api/plugins/:id/disable` | 禁用 |
| PUT | `/api/plugins/:id/config` | 更新配置 |
| GET | `/api/plugins/:id/config` | 读取配置 |

### 10.7 usePluginStore（前端）

```ts
const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<Plugin[]>([])
  // 聚合的 contributes（供各消费方读取）
  const themes = computed(() => plugins.value.flatMap(p => p.contributes.themes))
  const layouts = computed(() => plugins.value.flatMap(p => p.contributes.layouts))
  const sidebar = computed(() => plugins.value.flatMap(p => p.contributes.sidebar).sort(byOrder))
  const routes = computed(() => plugins.value.flatMap(p => p.contributes.routes))
  const settingsTabs = computed(() => plugins.value.flatMap(p => p.contributes.settingsTabs))
  const chatEnhancers = computed(() => plugins.value.flatMap(p => p.contributes.chatEnhancers))

  async function refresh() { plugins.value = await api.get('/plugins') }
  async function enable(id) { await api.post(`/plugins/${id}/enable`); await refresh() }
  async function disable(id) { await api.post(`/plugins/${id}/disable`); await refresh() }
  // ...
  return { plugins, themes, layouts, sidebar, routes, settingsTabs, chatEnhancers, refresh, enable, disable, ... }
})
```

启动时 `refresh()`，之后各消费方响应式读取 computed。

---

## 11. 三端兼容策略

### 11.1 能力矩阵

| 能力 | Electron | Web | Mobile |
|------|----------|-----|--------|
| 内置插件加载 | ✅ 本地 `plugins/` | ✅ 打包进 bundle | ✅ 打包进 bundle |
| 第三方 .yzp 安装 | ✅ 解压到 `userData/plugins/` | ❌ 无 fs | ⚠️ Capacitor Filesystem 限定目录（v1 不开） |
| 插件后端代码 | ✅ Node require | ❌ 无后端 | ❌ |
| 插件前端代码 | ✅ | ✅ | ✅ |
| Git 操作 | ✅ simple-git | ❌ | ❌ |
| 文件树/编辑 | ✅ 本地路径 | ⚠️ 浏览器虚拟文件 | ⚠️ Capacitor FS |
| 后端路由扩展 | ✅ | ❌ | ❌ |
| IPC handler | ✅ | — | — |

### 11.2 加载器差异

| 端 | 内置插件前端代码 | 第三方插件前端代码 | 后端代码 |
|----|------------------|--------------------|----------|
| Electron | Vite `import.meta.glob('plugins/**/ui/index.ts')` 构建时打包 | 运行时 `import('file:///userData/plugins/x/ui/index.js')`（main.cjs 放开 webSecurity 例外） | `require(userData/plugins/x/server/index.js)` |
| Web | 同上 | 不支持 | 不支持 |
| Mobile | 同上 | 不支持 | 不支持 |

### 11.3 降级原则

- 后端不可用的端：插件只跑 `ui` 部分，`contributes.tools` 的执行体、`backendRoutes` 自动跳过
- Git 不可用：`/api/git/capability` 返回 `false`，前端显示占位
- 安装入口不可用：插件管理页隐藏「安装插件」按钮，仅显示内置插件列表

---

## 12. .yzp 包格式与安装

### 12.1 包结构

```
my-plugin.yzp (zip)
├── plugin.json
├── server/        # 后端代码（.js 构建产物）
├── ui/            # 前端代码（.js 构建产物）
├── assets/        # 图标等静态资源
└── README.md
```

### 12.2 安装流程（仅 Electron）

```
1. 用户在插件管理页选 .yzp
2. IPC plugin:install (filePath)
3. 主进程解压到临时目录，读取 plugin.json
4. 校验：
   - manifest schema 合法
   - minAppVersion <= 当前版本
   - id 不与已装插件冲突
5. 权限确认弹窗（渲染进程，列 permissions）
6. 用户确认 → 移动到 userData/plugins/<id>/
7. PluginManager.install() → 写 DB plugin 表
8. enable() → 激活
9. 通知渲染进程刷新 usePluginStore
```

### 12.3 签名（可选，v2）

`.yzp` 可附 `SIGNATURE` 文件，安装时校验签名（需预置公钥）。v1 不强制。

---

## 13. 安全模型

| 风险 | 缓解措施 |
|------|----------|
| 第三方插件恶意代码 | 安装时权限确认；后端插件跑 `vm` 沙箱（复用 `sandbox.ts`）；adapter 按权限过滤 |
| 路径穿越（git repo 参数） | `GitService.assertWithinWorkspace` 校验路径必须在 `settings.workspaceDir` 子树内 |
| 任意 shell 执行 | git 操作只调 simple-git 受限 API，不拼 shell；插件 `shell` 权限默认不给，需用户显式允许 |
| 插件互相污染 | 每个插件独立 PluginContext；storage 隔离到 `plugin_storage(plugin_id, key, value)` |
| 后端路由越权 | 强制挂载 `/api/plugin/<id>/` 前缀，无法访问其他插件路由 |
| 清单伪造 | 安装时校验 id 格式、version semver、permissions 白名单 |

---

## 14. DB Schema 变更

`packages/core/src/db/schema.ts` 新增两表：

```sql
CREATE TABLE IF NOT EXISTS plugin (
  id          TEXT PRIMARY KEY,
  manifest    TEXT NOT NULL,        -- JSON
  state       TEXT NOT NULL,        -- installed/enabled/disabled/error
  config      TEXT,                 -- JSON
  version     TEXT NOT NULL,
  source      TEXT NOT NULL,        -- builtin/installed
  error       TEXT,
  installed_at INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plugin_storage (
  plugin_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT,                 -- JSON
  PRIMARY KEY (plugin_id, key),
  FOREIGN KEY (plugin_id) REFERENCES plugin(id) ON DELETE CASCADE
);
```

---

## 15. 错误处理与降级

| 场景 | 处理 |
|------|------|
| 插件 activate 抛错 | state='error'，记录 error，不影响其他插件 |
| 插件工具执行抛错 | 返回 `{ error }` 给 LLM，不中断对话 |
| Git 操作失败（非仓库/无权限） | 返回结构化错误，前端 toast 提示 |
| 平台不支持某扩展点 | 该扩展点注册静默跳过，日志记录 |
| 插件路由组件加载失败 | router 显示错误占位，不崩应用 |
| 权限不足 | 抛 PermissionDenied，插件捕获或上报 |

---

## 16. 测试策略

| 层 | 测试 |
|----|------|
| PluginManager | 单元：加载/启用/禁用/卸载、权限过滤、沙箱隔离 |
| 扩展点 | 单元：各 registry 注册/移除、前端 store 聚合 |
| GitService | 单元：mock simple-git，验证路径白名单、status/diff 解析 |
| Git 路由 | 集成：临时 git 仓库，全 API 端到端 |
| 插件管理 UI | 组件：卡片渲染、启用/禁用、配置表单、安装向导 |
| 三端降级 | 集成：Web 端 git capability=false、安装入口隐藏 |
| 端到端 | Git 插件完整流程：打开仓库→文件树→编辑→提交→对话集成 |

---

## 17. 实施分阶段

| 阶段 | 内容 | 产出 | 验收 |
|------|------|------|------|
| 0 | 插件骨架：PluginManager + DB 表 + usePluginStore + manifest 规范 + PluginContext API | 可加载空插件 | 内置空插件能 enable/disable |
| 1 | 扩展点对接：tools/themes/layouts/sidebar/routes/settingsTabs/chatEnhancers/backendRoutes | 6+ 扩展点全通 | 写一个 demo 插件验证各扩展点 |
| 2 | Git 核心服务：simple-git + GitService + /api/git 路由 + 路径白名单 | git API 可用 | curl 全 API 通过 |
| 3 | Git 插件：文件树 + CodeMirror 编辑 + git 面板 + 对话集成 + 插件工具 | 首个完整插件落地 | 打开仓库→提交全流程跑通 |
| 4 | 插件管理菜单 UI：PluginManager 页 + 卡片 + 配置 + 安装向导 + 权限确认 | 用户自助管理 | 安装 .yzp、启用/禁用/配置/卸载全通 |
| 5 | 三端降级打磨：Web/Mobile 占位、能力检测、安装入口隐藏 | 三端不崩 | Web 端打开 git 页显示占位 |

依赖：0 → 1 → (2 ∥ 4) → 3 → 5。阶段 2 与 4 可并行。

---

## 18. 新增目录结构

```
packages/core/src/plugin/
  ├── types.ts
  ├── api.ts
  ├── manifest.ts
  ├── loader.ts
  ├── registry.ts
  ├── permissions.ts
  ├── manager.ts
  └── index.ts

packages/ui/src/stores/plugin.ts
packages/ui/src/components/plugin/
  ├── PluginManager.vue
  ├── PluginCard.vue
  ├── PluginConfigDialog.vue
  ├── PluginDetailDialog.vue
  ├── PluginInstallDialog.vue
  └── PermissionConfirm.vue
packages/ui/src/components/editor/CodeEditor.vue   # CodeMirror 6 封装

apps/server/src/services/git.ts
apps/server/src/routes/git.ts
apps/server/src/routes/plugins.ts

plugins/git-explorer/
  ├── plugin.json
  ├── server/{index.ts, routes/git.ts, tools/*.ts}
  └── ui/{index.ts, views/GitExplorer.vue, components/*, chat/folderPreview.ts, stores/git.ts}

packages/core/src/db/schema.ts        # 新增 plugin / plugin_storage 表
packages/ui/src/views/Settings.vue    # 新增「插件」tab
packages/ui/src/components/SettingsDrawer.vue  # 新增「插件管理」菜单
```

---

## 19. 依赖新增

| 包 | 位置 | 用途 |
|----|------|------|
| `simple-git` | `apps/server` | Git 操作 |
| `@codemirror/state` `@codemirror/view` `@codemirror/lang-*` `@codemirror/merge` `@codemirror/commands` | `packages/ui` | 编辑器 + diff |

均按需懒加载，不影响首屏体积。

---

## 20. 风险与开放问题

| 风险 | 影响 | 缓解 |
|------|------|------|
| Vite 对运行时动态 import 第三方插件路径的支持 | 第三方插件前端加载 | Electron `file://` 下可动态 import；需在 main.cjs 放开 webSecurity 例外，限定到 `userData/plugins/` |
| simple-git 依赖系统 git 已安装 | 桌面端 git 不可用 | 启动检测 git 版本，不可用时 capability=false 并提示安装 |
| 插件 API 稳定性 | 后续破坏第三方插件 | v1 标注 experimental，语义化版本管理 PluginContext |
| 大仓库文件树性能 | 文件树卡顿 | 增量加载 + 虚拟滚动；git status 限制深度 |
| CodeMirror 体积 | bundle 变大 | 懒加载，仅进 Git 页面时 import |

**开放问题**：
- 是否需要插件市场（远程源）？v2 再议。
- 插件间依赖/通信？v1 假设独立，事件总线已预留。
- 移动端是否开放 Capacitor Filesystem 安装？v1 不开。

---

## 21. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 插件来源 | 内置目录 + 可装第三方 | git 插件走内置，未来可开放生态 |
| Git 实现库 | simple-git | Promise API、轻量、开发成本最低 |
| 文件编辑器 | CodeMirror 6 | 轻量、支持编辑+高亮+diff、懒加载 |
| 文档与实施顺序 | 先出详细文档，再实施，注意三端兼容 | 用户偏好先看方案 |
| 插件管理入口 | 设置内独立菜单 + Settings tab | 用户明确要求 |