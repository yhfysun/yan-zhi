# AI Assistant

本地优先的跨端 AI 助手应用，覆盖桌面（Tauri）、Web（PWA）、移动端（Capacitor）三端，统一一套 Vue 3 代码库。

## 技术栈

- Vue 3.5 + TypeScript + Vite
- Tauri 2（桌面）/ Capacitor 6（移动）/ PWA（Web）
- Element Plus + Vue Flow
- SQLite + sqlite-vec（本地存储）
- OpenAI 兼容协议 + MCP（Model Context Protocol）

## 项目结构

```
ai-assistant/
├── apps/
│   ├── desktop/      # Tauri 桌面端（本地 SQLite）
│   ├── mobile/       # Capacitor 移动端（本地 SQLite）
│   ├── server/       # Express API 服务（独立后端）
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

- 模型平台管理（OpenAI 协议，支持多平台）
- MCP 服务管理（stdio / SSE / HTTP）
- 聊天工作台（流式、工具挂载、多会话）
- Skill 商店与自建
- 智能体编排（工作流画布）
- 子智能体管理
- 记忆与上下文压缩

详见 `.trae/documents/PRD.md` 和 `.trae/documents/TechnicalArchitecture.md`。

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
