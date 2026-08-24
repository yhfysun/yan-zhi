# 言智 (Yan-Zhi)

语言可控的智能体平台 — 一款所有管理功能均可通过自然语言操控的跨端 AI 助手应用，覆盖桌面（Tauri）、Web（PWA）、移动端（Capacitor）三端，统一一套 Vue 3 代码库。

## 核心理念

- **语言即界面**：项目所有管理接口都是大模型可直接调用的工具，用户通过聊天即可配置模型、管理工具、安装 Skill、创建智能体
- **协议开放**：模型接入遵循 OpenAI 兼容协议，商城互联使用标准化 REST API
- **数据本地**：对话、配置、记忆默认本地存储，隐私可控
- **节点互联**：每个言智节点既是客户端也是服务端，可连接其他节点获取工具 / Skill / 智能体

## 技术栈

- Vue 3.5 + TypeScript + Vite 5
- Tauri 2（桌面）/ Capacitor 6（移动）/ PWA（Web）
- Element Plus + Vue Router + Pinia + Vue Flow（工作流画布）
- SQLite + better-sqlite3 + sqlite-vec（本地存储与向量记忆）/ Dexie（Web 端 IndexedDB）
- Express（后端 API）+ JWT / bcrypt（鉴权）
- Playwright（内置浏览器自动化）
- OpenAI 兼容协议 + MCP（Model Context Protocol）

## 项目结构

```
yan-zhi/
├── apps/
│   ├── desktop/      # Tauri 桌面端（本地 SQLite + WebView2）
│   ├── mobile/       # Capacitor 移动端（SQLite 插件 + 应用沙箱）
│   ├── server/       # Express API 服务（独立后端 + 商城服务端 + Playwright 浏览器）
│   └── web/          # 纯 Web PWA（Dexie / IndexedDB）
├── packages/
│   ├── ui/           # 共享 Vue 组件、路由、视图、状态管理（stores）
│   ├── core/         # 业务核心：LLM 客户端、MCP、工具注册与沙箱、工作流、记忆
│   └── shared/       # 类型定义与通用工具
├── docs/             # 设计文档（design.md）/ 任务规划（tasks.md）
├── .trae/documents/  # 需求规划（four-features-plan.md / implementation-tasklist.md）
├── openspec/         # OpenSpec 变更管理（changes/）
├── assets/           # 应用图标（icon.png / icon.ico）
├── pnpm-workspace.yaml
└── package.json
```

## 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 聊天工作台 | ✅ 已完成 | 流式对话、Markdown 渲染、多会话、工具调用可视化 |
| 模型平台配置 | ✅ 已完成 | OpenAI 与 Anthropic 双协议；Anthropic 官方无模型列表接口，需手动添加模型 |
| MCP 服务管理 | ✅ 已完成 | stdio（桌面）/ SSE / Streamable HTTP 三种传输 |
| 工具管理 | ✅ 已完成 | 内置工具 + 自定义 JS 沙箱工具 + 同源商城工具 |
| Skill 商城 | ✅ 已完成 | 本地管理 + 远程商城（分页 / 详情 / 搜索 / 分类） |
| 智能体管理 | ✅ 已完成 | harness 与 workflow 两种类型，Vue Flow 工作流画布 |
| 智能体商城 | ✅ 已完成 | 远程浏览并一键复制到本地 |
| 商城服务端 | ✅ 已完成 | 本节点作为服务端暴露标准化 API + 可见性 / 鉴权控制 |
| 聊天接口工具化 | ✅ 已完成 | 模型 / MCP / 工具 / Skill / 智能体 / 商城 / 会话等管理接口注册为 LLM 可调用的工具 |
| 空间 / 工作目录 | ✅ 已完成 | 选目录自动建空间，空间目录上下文注入对话 |
| 文件分类与预览 | ✅ 已完成 | 上传 / 中间 / 交付三类，右侧预览面板内联预览 |
| 内置浏览器 + pageAgent | ✅ 已完成 | 真实鼠标 / 键盘模拟；需本机有显示环境 |
| 子智能体与记忆 | ✅ 已完成 | `call_agent` 委派子智能体；滑动窗口 + sqlite-vec 向量记忆 |

> 已知缺口：浏览器自动化依赖本机显示环境，远程无头服务器需 Xvfb，移动端已屏蔽；Anthropic 官方无公开模型列表接口（部分兼容网关支持），因此「拉取模型」对纯 Anthropic 平台可能为空，需手动添加模型。

## 核心功能

### 聊天工作台（已实现）
- 流式对话，Markdown 渲染，代码高亮
- 多会话管理，话题分叉
- 工具调用可视化（入参 / 结果折叠展示）
- 思考链展示、多模态输入
- 右侧统一预览面板：在「文件」与「浏览器」两种模式间切换

### 模型平台配置（已实现，OpenAI / Anthropic 双协议）
- 支持两种协议：`openai`（OpenAI Chat Completions 约定）与 `anthropic`（Anthropic Messages API 约定），在平台配置中选择
- OpenAI：端点 `/v1/chat/completions`，Bearer 鉴权
- Anthropic：端点 `/v1/messages`，使用 `x-api-key` + `anthropic-version` 鉴权；自动完成 system 提取、tool_use / tool_result 转换、tool 输入 JSON 流式拼装
- 模型自动拉取 / 手动添加
- 连通性测试、健康检查

> 注意：Anthropic 官方无公开模型列表接口，因此「拉取模型」对纯 Anthropic 平台可能返回空，需手动添加模型 ID；兼容网关（如 OpenRouter）通常支持列表拉取。

### MCP 服务管理（已实现）
- 三种传输协议：stdio（仅桌面端）/ SSE / Streamable HTTP
- 工具列表预览、连接日志、按会话启用统计

### 工具管理（已实现）
- **内置工具**：`file_read`、`file_write`、`web_search`、`cmd_exec` 等，编译自带
- **自定义工具**：JS 代码沙箱执行，统一 CustomTool 协议，预留 Python / Java 扩展
- **同源商城工具**：连接其他言智节点，只拉取对方的「自定义工具」——内置工具每个节点都有，无需传输；下载后在本地沙箱执行，不依赖远程节点

### Skill 商城（已实现，本地 + 远程）
- 本地 Skill 管理：内置 Skill + 用户自建，Markdown 格式（front-matter + body）
- 远程 Skill 商城：配置 URL + 认证，分页拉取 Skill 列表，一键复制到本地
- 标准化 Skill Marketplace Protocol（分页 / 详情 / 搜索 / 分类接口）

### 智能体与工作流（已实现）
- 两种智能体类型：
  - **harness**：挂载内置 / 自定义 / MCP 工具，由对话循环驱动（默认 AI 助理即此类型）
  - **workflow**：Vue Flow 画布，支持 LLM / 工具 / 条件 / 循环 / 子智能体节点
- 智能体商城：远程浏览并一键复制到本地
- 子智能体调度：`call_agent` 工具委派 harness 子智能体（如内置的 pageAgent），带调用栈防环

### 商城服务端（已实现）
- 本节点可作为商城服务端，暴露标准化 API（握手 / 列表 / 详情 / 搜索 / 分类 / 安装）
- 其他言智节点连接本节点获取工具 / Skill / 智能体
- 内容可见性控制（`is_public` 发布开关）、多种认证方式（none / bearer / api-key）

### 空间 / 工作目录（已实现）
- 选目录 → 自动建空间（Space）；会话归属于空间
- 当前空间目录树（递归、带安全上限）注入 system prompt，让大模型用对路径
- 旧会话无空间时降级为「未归类」，使用全局工作目录兜底

### 文件分类与预览（已实现）
- 每个会话的文件分三类：**上传**（用户上传）/ **中间**（大模型中间产物）/ **交付**（最终交付）
- 右侧预览面板内联预览图片 / Markdown / 代码，替代旧弹窗
- 文件面板默认折叠为分类列表，点击文件展开预览

### 内置浏览器 + pageAgent（已实现）
- 服务端用 Playwright 启动有头 Chromium 独立窗口，浏览器工具做真实鼠标 / 键盘模拟
- pageAgent 为内置 harness 子智能体，默认 AI 助理经 `call_agent` 挂载并委派浏览器任务
- 右侧预览面板「浏览器」模式显示操作步骤日志，可聚焦 / 打开浏览器窗口
- 运行前提：服务端需本机有显示环境（本地开发 / 桌面天然满足）

### 子智能体与记忆（已实现）
- 子智能体注册与并行调度
- 短期记忆滑动窗口 + 长期记忆向量检索（sqlite-vec）
- 上下文自动压缩

### 聊天接口工具化（已实现）
- 模型 / MCP / 自定义工具 / Skill / 智能体 / 商城 / 会话等管理操作注册为 LLM 可调用的工具函数
- 用户通过自然语言即可完成模型配置、工具管理、Skill 安装、智能体创建

## 三端差异化

| 能力 | 桌面（Tauri） | Web（PWA） | 移动（Capacitor） |
|------|--------------|-----------|------------------|
| 本地数据存储 | SQLite (原生) | IndexedDB (Dexie) | SQLite (原生插件) |
| MCP stdio 子进程 | 完整支持 | 仅远程 SSE/HTTP | 仅远程 SSE/HTTP |
| 文件系统访问 | 完整 | File System API | 受限目录 |
| Skill 本地目录 | 文件系统 | IndexedDB 虚拟 FS | 应用沙箱目录 |
| 系统托盘/通知 | 支持 | 不支持 | 支持 |
| 离线可用 | 支持 | 需 PWA 安装 | 支持 |
| 自动更新 | Tauri Updater | Service Worker | 应用商店 |
| 内置浏览器自动化 | 支持 | 需本机服务端 | 不支持 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动后端服务（Express，默认 http://localhost:3001）
pnpm dev

# 启动 Web 端（Vite 开发端口 http://localhost:5173）
pnpm dev:web

# 启动桌面端（Tauri dev，前端 Vite 端口 1420，/api 代理到 3001，需 Rust 环境）
pnpm dev:desktop

# 启动移动端（需 Xcode / Android Studio）
pnpm dev:mobile
```

> 端口约定：后端 `3001`；桌面前端 `1420`、Web 前端 `5173`，两者均通过 `/api` 代理到后端 `3001`。

## 打包

```bash
# 桌面端（生成 .exe 安装包，需 Rust + MinGW-w64）
pnpm build:desktop
# 产物：apps/desktop/src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/

# 移动端 Android
pnpm build:mobile:android

# 移动端 iOS（需 macOS + Xcode）
pnpm build:mobile:ios

# Web 端
pnpm build:web
```

### 桌面端打包前提

- Rust 工具链（MSVC 或 GNU）：`rustup install stable-x86_64-pc-windows-gnu`
- MinGW-w64（GNU 工具链时需要）
- 系统没有 VS Build Tools 会自动使用 GNU 工具链（`apps/desktop/src-tauri/.cargo/config.toml` 已配置）
- 安装程序会自动安装 WebView2 Runtime（若无）

### 图标

应用图标统一放在 `assets/icons/`，打包时自动引用：
- `assets/icons/icon.png` — 用于打包元数据
- `assets/icons/icon.ico` — 用于 Windows 可执行文件图标

替换图标文件后重新 `pnpm build:desktop` 即可生效。

## 数据存储

各端数据独立存储，互不依赖：

| 端 | 存储方式 |
|----|---------|
| 桌面端 | Tauri + better-sqlite3（本地文件） |
| 移动端 | Capacitor SQLite（设备本地） |
| Web 端 | 浏览器 IndexedDB（Dexie） |
| 后端   | better-sqlite3（`apps/server/data.db`） |

## 文档导航

- 需求与实现规划：`.trae/documents/four-features-plan.md`、` .trae/documents/implementation-tasklist.md`
- 设计与任务规划：`docs/design.md`、`docs/tasks.md`
- 变更管理：遵循 `openspec/` 的 OpenSpec 流程（`openspec/changes/` 下按变更组织 spec）

## 项目重命名指南

修改项目名称时，需要改动以下文件：

### 桌面端 (Tauri) — 影响 EXE 名称

| 文件 | 字段 | 说明 |
|------|------|------|
| `apps/desktop/src-tauri/tauri.conf.json` | `productName` | **决定 EXE 文件名和 NSIS 安装包名称** |
| `apps/desktop/src-tauri/tauri.conf.json` | `identifier` | 应用唯一标识，建议同步修改 |
| `apps/desktop/src-tauri/tauri.conf.json` | `app.windows[0].title` | 窗口标题栏文字 |
| `apps/desktop/src-tauri/Cargo.toml` | `package.name` | Rust crate 名称（不影响 EXE 输出） |
| `apps/desktop/index.html` | `<title>` | 浏览器标签页标题 |

### Web 端

| 文件 | 字段 | 说明 |
|------|------|------|
| `apps/web/index.html` | `<title>` | 浏览器标签页标题 |
| `apps/web/public/manifest.json` | `name` / `short_name` | PWA 应用名称 |
| `apps/web/public/manifest.json` | `description` | PWA 描述 |

### 移动端 (Capacitor)

| 文件 | 字段 | 说明 |
|------|------|------|
| `apps/mobile/capacitor.config.ts` | `appName` | **移动端 App 安装后的显示名称** |
| `apps/mobile/capacitor.config.ts` | `appId` | App 唯一标识（如 `com.xxx.mobile`） |
| `apps/mobile/index.html` | `<title>` | WebView 页面标题 |

### 根目录（可选）

| 文件 | 字段 | 说明 |
|------|------|------|
| `package.json` | `name` / `description` | 项目根 npm 包信息 |
