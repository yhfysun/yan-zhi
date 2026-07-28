# 言智 (Yan-Zhi)

语言可控的智能体平台 — 一款所有管理功能均可通过自然语言操控的跨端 AI 助手应用，覆盖桌面（Tauri）、Web（PWA）、移动端（Capacitor）三端，统一一套 Vue 3 代码库。

## 核心理念

- **语言即界面**：项目所有管理接口都是大模型可直接调用的工具，用户通过聊天即可配置模型、管理工具、安装 Skill、创建智能体
- **协议开放**：模型接入遵循 OpenAI 兼容协议，商城互联使用标准化 REST API
- **数据本地**：对话、配置、记忆全部本地存储，隐私可控
- **节点互联**：每个言智节点既是客户端也是服务端，可连接其他节点获取工具/Skill/智能体

## 技术栈

- Vue 3.5 + TypeScript + Vite
- Tauri 2（桌面）/ Capacitor 6（移动）/ PWA（Web）
- Element Plus + Vue Flow
- SQLite + sqlite-vec（本地存储）
- OpenAI 兼容协议 + MCP（Model Context Protocol）

## 项目结构

```
yan-zhi/
├── apps/
│   ├── desktop/      # Tauri 桌面端（本地 SQLite）
│   ├── mobile/       # Capacitor 移动端（本地 SQLite）
│   ├── server/       # Express API 服务（独立后端 + 商城服务端）
│   └── web/          # 纯 Web PWA
├── packages/
│   ├── ui/           # 共享 Vue 组件、路由、视图
│   ├── core/         # 业务核心逻辑（平台无关）
│   └── shared/       # 类型与工具
├── .trae/documents/  # PRD 与技术架构文档
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动后端服务
pnpm dev                # http://localhost:3001

# 启动 Web 端
pnpm dev:web            # http://localhost:5176

# 启动桌面端（需 Rust 环境）
pnpm dev:desktop

# 启动移动端（需 Xcode / Android Studio）
pnpm dev:mobile
```

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
| Web 端 | 浏览器 IndexedDB |
| 后端   | better-sqlite3（`apps/server/data.db`） |

## 核心功能

### 聊天工作台（已实现）
- 流式对话，Markdown 渲染，代码高亮
- 多会话管理，话题分叉
- 工具调用可视化（入参/结果折叠展示）
- 思考链展示、多模态输入

### 模型平台配置（已实现）
- OpenAI 兼容协议，支持多平台
- 模型自动拉取 / 手动添加
- 连通性测试、健康检查

### MCP 服务管理（已有，保留）
- 三种传输协议：stdio（仅桌面端）/ SSE / Streamable HTTP
- 工具列表预览、连接日志、按会话启用统计
- 此模块保持不变，不被工具商城替代

### 工具管理（新增自定义工具 + 同源商城）
- **内置工具**（已有）：file_read、file_write、web_search 等，所有节点编译自带
- **自定义工具**（新增）：JS 代码沙箱执行，统一 CustomTool 协议，预留 Python/Java 扩展
- **同源商城工具**（新增）：连接其他言智节点，只拉取对方的「自定义工具」——内置工具每个节点都有，无需传输
- 从同源商城下载的工具在本地沙箱执行，不依赖远程节点

### Skill 商城（现有，将升级支持远程）
- 本地 Skill 管理：内置 Skill + 用户自建，Markdown 格式（front-matter + body）
- 新建远程 Skill 商城：配置 URL + 认证，分页拉取 Skill 列表
- 远程下载到本地：一键复制远程 Skill 到本地
- 标准化 Skill Marketplace Protocol（分页/详情/搜索/分类接口）

### 智能体商城（待开发）
- 本地智能体管理：工作流画布（Vue Flow），支持 LLM/工具/条件/循环/子智能体节点
- 新建远程智能体商城：浏览远程智能体，一键复制到本地
- 标准化 Agent Marketplace Protocol

### 商城服务端（待开发）
- 本节点可作为商城服务端，暴露标准化 API
- 其他言智节点连接本节点获取工具/Skill/智能体
- 支持内容可见性控制（公开/私有）、多种认证方式

### 子智能体与记忆
- 子智能体注册与并行调度
- 短期记忆滑动窗口 + 长期记忆向量检索（sqlite-vec）
- 上下文自动压缩

### 聊天接口工具化（待开发）
- 所有管理操作注册为 LLM 可调用的工具函数
- 用户通过自然语言即可完成模型配置、工具管理、Skill 安装、智能体创建

详见 `.trae/documents/PRD.md` 和 `.trae/documents/TechnicalArchitecture.md`。

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
