# 言智 (Yan-Zhi)

语言可控的跨端 AI 智能体平台，覆盖桌面（Electron）、Web（PWA）和移动端（Capacitor），统一一套 Vue 3 代码库。

当前产品主线是“多模式工作台 + 通用智能体能力”：桌面端提供办公、开发、运维、安全、工作流、自动化、剪辑、店铺运营、学习九种内置模式；移动端收敛为办公、店铺、运维、安全、学习五种。学习模式坚持“总览层导航 + 全屏单步沉浸学习”，详细约束见 `docs/学习模式设计准则.md`。

## 核心理念

- **语言即界面**：项目所有管理接口都是大模型可直接调用的工具，用户通过聊天即可配置模型、管理工具、安装 Skill、创建智能体
- **协议开放**：模型接入遵循 OpenAI 兼容协议，商城互联使用标准化 REST API
- **数据分层**：会话、偏好和本机文件默认本地存储；知识库、账号和共享数据落在内置或远程言智后端，支持 guest / 多用户模式及 public / private 可见范围
- **节点互联**：每个言智节点既是客户端也是服务端，可连接其他节点获取工具 / Skill / 智能体
- **许可边界**：本软件是专有商业软件，不按 Apache-2.0、MIT 等开源协议发布；使用范围以根目录 `LICENSE` 和授权码为准

## 技术栈

- Vue 3.5 + TypeScript + Vite 5
- Electron 44（桌面，electron-builder 打包）/ Capacitor 8（移动）/ PWA（Web）
- Element Plus + Vue Router + Pinia + Vue Flow（工作流画布）
- SQLite + better-sqlite3（本地会话/配置）+ sqlite-vec（本地向量记忆）/ Dexie（Web 端 IndexedDB）
- 内置 Express 后端（apps/server）统一承载**共享数据**（知识库等，guest/登录都走服务端一套 DB，支持 public/private 共享）
- 内置本地模型：qwen2.5-1.5b（对话）+ bge-small-zh（语义向量，知识库/记忆检索）
- Express（后端 API）+ JWT / bcrypt（鉴权）
- Electron BrowserView + pageAgent（桌面浏览器自动化）/ Playwright（服务端抓取）
- OpenAI 兼容协议 + Anthropic 协议 + MCP（Model Context Protocol）

## 项目结构

```
yan-zhi/
├── apps/
│   ├── desktop/      # Electron 桌面壳、主进程、浏览器桥与打包脚本
│   ├── mobile/       # Capacitor 移动端与内嵌 Node 后端运行时
│   ├── server/       # Express API、数据、插件、商城服务端与学习内容
│   └── web/          # Web PWA、静态资源与 IndexedDB/Dexie 适配
├── packages/
│   ├── ui/           # 共享 Vue 组件、路由、工作台、学习 UI 与 stores
│   ├── core/         # LLM、MCP、工具注册与沙箱、工作流、记忆等核心逻辑
│   └── shared/       # 跨端类型、学习课程和通用纯函数
├── docs/             # 设计文档与方案
├── openspec/         # OpenSpec 规格与变更管理
├── scripts/          # 构建、模式裁剪、授权码、打包与验证脚本
├── assets/           # 应用图标（icon.png / icon.ico / icon.icns）
├── .github/workflows/ # GitHub Actions（桌面/移动打包、类型检查与测试）
└── dist-release/     # 打包产物：desktop/<档>/<版本>/ 与 android/<版本>/（.gitignore）
```

## 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 多模式工作台 | ✅ 已完成 | 桌面九种内置模式（办公/开发/运维/安全/工作流/自动化/剪辑/店铺/学习），移动端开放办公/店铺/运维/安全/学习；支持插件运行时贡献模式 |
| 聊天工作台 | ✅ 已完成 | 流式对话、Markdown 渲染、多会话、工具调用可视化 |
| 模型平台配置 | ✅ 已完成 | OpenAI 与 Anthropic 双协议、模型候选池、健康路由、多 Key 轮换；上游不支持 /v1/models 时需手动添加模型 |
| 本地模型与网关 | ✅ 已完成 | Ollama/本地模型统一安装入口；本地网关发放受限客户端密钥并记录调用与配额 |
| MCP 服务管理 | ✅ 已完成 | stdio（桌面）/ SSE / Streamable HTTP 三种传输 |
| 工具管理 | ✅ 已完成 | 内置工具 + 自定义 JS 沙箱工具 + 同源商城工具 |
| Skill 商城 | ✅ 已完成 | 本地管理 + 远程商城（分页 / 详情 / 搜索 / 分类） |
| 智能体管理 | ✅ 已完成 | harness 与 workflow 两种类型，Vue Flow 工作流画布 |
| 智能体商城 | ✅ 已完成 | 远程浏览并一键复制到本地 |
| 商城服务端 | ✅ 已完成 | 本节点作为服务端暴露标准化 API + 可见性 / 鉴权控制 |
| 聊天接口工具化 | ✅ 已完成 | 模型 / MCP / 工具 / Skill / 智能体 / 商城 / 会话等管理接口注册为 LLM 可调用的工具 |
| 空间 / 工作目录 | ✅ 已完成 | 选目录自动建空间，空间目录上下文注入对话 |
| 文件分类与预览 | ✅ 已完成 | 上传 / 中间 / 交付三类，右侧预览面板内联预览 |
| 内置浏览器 + pageAgent | ✅ 已完成 | 执行面直连化（桌面端服务端直连主进程，不再依赖渲染层）；真实鼠标 / 键盘模拟；需本机有显示环境 |
| 子智能体与记忆 | ✅ 已完成 | `call_agent` 同步/后台委派；五维记忆 + 滑动窗口 + sqlite-vec 向量检索 |
| 消息中心 | ✅ 已完成 | 多会话聊天中心：应用内助手 + 言智节点互聊（Peers）+ IM 渠道聚合 |
| 对话模式开关 | ✅ 已完成 | 深度思考 / 计划 / 仅回答（输入框「+」菜单，前后端 modeFlags） |
| IM 集成 | ✅ 代码就绪 | 飞书闭环 + 企业微信（AES 解密/XML）+ 个人微信通道；真实联调需开放平台账号与公网回调 |
| 数据本体与查询 | ✅ 已完成 | 本体、标准属性、数据源、QueryContract、参数化受控执行与动态看板；SQL 方言覆盖 mysql/postgres/dm/oracle/sqlite |
| 局域网访问 | ✅ 已完成 | 后端 0.0.0.0 + 托管前端静态资源，局域网内设备浏览器访问 Node Web 界面（设置页含 IP 展示 + 打开浏览器按钮）；可扫描同网段其他言智节点，移动端一键设为后端 |
| 插件系统 | ✅ 已完成 | `.yzp` 插件包，支持工具/皮肤/布局/路由/设置/对话增强/后端路由/模式扩展，含权限声明、版本校验、安装/导出/启停 |
| 企业工作台 | ✅ 已完成 | 团队规则/专家 Manifest/资源版本、周期额度与流水、管理审计、集中式 MCP、设计资源、工作节点与云工作区 |
| 皮肤系统 | ✅ 已完成 | 主题色与皮肤分层；内置系列 + 插件皮肤，支持壁纸/玻璃/边框/部件纹理、源码包二改与重新安装 |
| ops-shell 运维插件 | ✅ 已完成 | SSH 命令 / SFTP 文件管理 / Docker / 数据库只读查询 / xterm 终端 / 常驻巡检与通知 / 版本化与定时 Runbook（生产写需显式长期授权）+ 运维智能体，护栏与全量审计 |
| computer-use 电脑操作 | ✅ 已完成 | 鼠标/键盘/窗口/截屏/启动应用（Windows 实现），急停与黑名单护栏，默认关闭 |
| remote-control 远程控制 | ✅ 已完成 | 手机/局域网实时观看并操作本机，WebRTC/JPEG 双通道、授权码配对、剪贴板/文件/隐私屏/多显示器与审计 |
| 定时任务 | ✅ 已完成 | cron / 固定间隔，到点自动创建会话执行；配合预置 skill 形成每日自动化链路 |
| Git 集成 | ✅ 已完成 | 对话内 Git 面板 + `git_status/diff/log/commit/file_tree` LLM 工具 + 三栏式冲突解决 |
| 五维记忆管理 | ✅ 已完成 | 画像/智能体/会话/每日/空间五维 + 管理界面 + 自动整理（去重/矛盾清理/提拔） |
| 网络工具族 | ✅ 已完成 | `port_scan` / `lan_scan` / `dns_lookup` / `tcp` / `udp`（授权运维场景） |
| Python 执行 | ✅ 已完成 | 内置 python-build-standalone 运行时（离线随包）+ `python_exec` 自动装依赖 + doyz 文档/网安工具 |
| LLM 代理与 Token 池 | ✅ 已完成 | OpenAI/Anthropic 双协议转发，多 key 轮换 / 熔断 / 重试 / 调用日志 |
| License 授权 | ✅ 已完成 | RSA 验签 + MAC 机器绑定 + 90 天试用码（商用闭环） |
| 数据查询契约 / 动态看板 | ✅ 已完成 | 大模型产 QueryContract + 参数化受控执行（不走大模型）+ 对话内动态看板 |
| 代码工作台（/code） | ✅ 已完成 | IDE 风格代码模式：目录树懒加载、CodeMirror 多语言高亮、文件 tab、环境配置分 tab、任务面板改造为工作台 |
| 文档预览与转换 | ✅ 已完成 | `file_to_markdown` 内置工具（Word/Excel/PDF→Markdown）+ Excel 样式化预览 + PDF 渲染 |
| 插件分类 | ✅ 已完成 | 功能 / 皮肤 / 操作 / 自定义四类分组，插件市场按类浏览 |
| 智能体改名助手 | ✅ 已完成 | 内置智能体统一改名为「助手」，对齐用户心智模型 |
| 学习 V2 | ✅ 已完成 | 21 科课程、编程 17 个课程包、算法独立学科、全屏单步沉浸学习、代码运行、原理动画与公共图书馆 |
| 移动端应用 | ✅ 已完成 | Capacitor 8 + 原生 SQLite/文件/偏好适配 + 内嵌 Node 后端（五模式双 ABI 正式包与完整调试包两套构建链） |
| 多用户与共享服务 | ✅ 已完成 | 组织/角色/权限、共享模型平台、完整桌面版导出轻量壳、局域网共享主机与账号隔离 |

> 仍存边界：桌面浏览器自动化和电脑操作依赖本机图形环境；部分 Anthropic 兼容网关不支持 `/v1/models`；移动端只开放五个模式，开发/工作流/自动化/剪辑等重工作台不在一级模式露出；iOS 构建仍需 macOS/Xcode。

## 核心功能

### 多模式工作台与学习 V2（已实现）
- 桌面端九种内置模式：办公、开发、运维、安全、工作流、自动化、剪辑、店铺运营、学习；模式共享会话、空间和工作目录，切换时保留各自界面状态
- 移动端一级模式收敛为办公、店铺、运维、安全、学习，重工作台继续留在桌面端
- 学习模式覆盖 21 科，编程与算法为独立学科；课程总览与沉浸学习分层，进入知识点后一次只显示当前步骤
- Learning V2 提供课程地图、实践/测评、复习、AI 陪练、代码运行、原理动画和公共图书馆；正式学习 UI 约束见 `docs/学习模式设计准则.md`
- 模式可见性由构建档、授权档、用户权限和插件启用状态共同决定

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

> 注意：「拉取模型」依赖上游实现 /v1/models（Anthropic 官方 API 已支持，走 x-api-key 鉴权）；不支持的兼容网关会返回空，需手动添加模型 ID。

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
- 桌面端「预览面板」打开网页走 **Electron 原生 BrowserView**（应用自带 Chromium，无需额外下载）
- 服务端另用 **Playwright 无头 Chromium** 执行浏览器自动化 / `web_search` 抓取（该 Chromium 为独立二进制，需 `npx playwright install chromium`）
- pageAgent 为内置 harness 子智能体，默认 AI 助理经 `call_agent` 挂载并委派浏览器任务
- 右侧预览面板「浏览器」模式显示操作步骤日志，可聚焦 / 打开浏览器窗口
- **执行面直连化（桌面端）**：桌面端由**服务端经 loopback 本地端点直连主进程**驱动浏览器，不再依赖渲染层存活与 SSE 订阅 —— 窗口关掉 / 页面刷新 / 路由切走时浏览器工具仍可继续执行；端点仅绑 `127.0.0.1` + 每启动随机令牌 + action 白名单，会话与标签页锚定下沉主进程。灰度开关 `YZ_BROWSER_BRIDGE = off | shadow | on | strict`，当前默认 `on`，并按构建档裁剪执行模块。
- 运行前提：服务端需本机有显示环境（本地开发 / 桌面天然满足）

### 子智能体与记忆（已实现）
- 子智能体注册、同步调用、后台并行任务、并发上限与中止级联
- 五维记忆：**用户画像** / **每日记忆** / **会话记忆** / **智能体记忆** / **空间记忆**；对话中自动抽取、对话前按需注入
- 短期记忆滑动窗口 + 长期记忆向量检索（sqlite-vec）
- 上下文自动压缩

### 知识库（已实现，含语义检索）
- 创建 / 编辑 / 删除知识库，添加文档自动切分并建立分片
- 语义检索可使用全局 embedding 模型或 **bge-small-zh**；模型缺失时自动降级为关键词检索
- **一套数据库 + 共享级别**：知识库统一存服务端一套 DB；不登录（guest）自动以访客身份访问，托管 public 库；登录用户可建 private / public 共享（跨用户可见）。旧本地库方案已废弃。
- 内置「应用使用说明」按功能拆分文档并带版本标记，升级后可自动刷新；应用使用知识、五维记忆和知识库命中片段都会在对话前按需注入

### 消息中心与节点互聊（已实现）
- 统一聊天中心：应用内助手会话 / 言智节点互聊（Peers）/ IM 渠道消息聚合
- 节点互聊：与互联言智客户端对发消息，可远程调用对方工具 / Skill / 智能体
- 右栏结果区 + 多 tab 预览（文件 / 网站 / Git），预览标签显示真实文件名 / 网站名

### IM 集成（代码就绪，待真实联调）
- **飞书**：自建应用事件回调，收消息 → 建/复会话跑任务 → 结果自动回发（单聊 open_id / 群聊 chat_id）
- **企业微信**：自写 AES-256-CBC 解密 + XML 解析 + 签名校验（零额外依赖），支持加密 / 明文两种回调模式
- **个人微信**：ClawBot 扫码通道（依赖外部 CLI，接口确认后闭环）
- 运行前提：开放平台账号 + 回调公网可达（内网需穿透）

### 对话模式开关（已实现）
- 输入框「+」菜单：**深度思考**（提示词层强化推理）/ **计划**（task_plan 先出计划再执行）/ **仅回答**（后端清空工具列表，禁一切工具调用）
- 前后端 `modeFlags` 透传，模式指令由后端统一追加（前端/后端组装两条路径都生效）

### 聊天接口工具化（已实现）
- 模型 / MCP / 自定义工具 / Skill / 智能体 / 商城 / 会话等管理操作注册为 LLM 可调用的工具函数
- 用户通过自然语言即可完成模型配置、工具管理、Skill 安装、智能体创建

## 三端差异化

| 能力 | 桌面（Electron） | Web（PWA） | 移动（Capacitor） |
|------|--------------|-----------|------------------|
| 本地数据存储 | SQLite (原生) | IndexedDB (Dexie) | SQLite (原生插件) |
| MCP stdio 子进程 | 完整支持 | 仅远程 SSE/HTTP | 仅远程 SSE/HTTP |
| 文件系统访问 | 完整 | File System API | 受限目录 |
| Skill 本地目录 | 文件系统 | IndexedDB 虚拟 FS | 应用沙箱目录 |
| 系统托盘/通知 | 支持 | 不支持 | 支持 |
| 离线可用 | 支持 | 需 PWA 安装 | 支持 |
| 自动更新 | electron-updater | Service Worker | 应用商店 |
| 内置浏览器自动化 | 支持 | 需本机服务端 | 不支持 |
| 一级工作模式 | 九种内置 + 插件模式 | 按 Web 能力开放 | 办公 / 店铺 / 运维 / 安全 / 学习 |
| 学习沉浸台 | 支持 | 支持 | 支持 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动后端服务（Express，默认 http://localhost:3001）
pnpm dev

# 启动 Web 端（Vite 开发端口 http://localhost:5173）
pnpm dev:web

# 启动桌面端（Electron dev，前端 Vite 端口 1420，/api 代理到 3001）
pnpm dev:desktop

# 启动移动端（需 Xcode / Android Studio）
pnpm dev:mobile
```

> 端口约定：后端 `3001`；桌面前端 `1420`、Web 前端 `5173`，两者均通过 `/api` 代理到后端 `3001`。

### 企业工作台与工作节点

- 管理端入口：`/admin/enterprise`
- 成员入口：`/team`
- 工作节点 Agent：管理端创建一个节点后，在节点机器设置 `YZ_RUNTIME_SERVER`、`YZ_RUNTIME_TOKEN`，然后运行：

```bash
pnpm --filter @yan-zhi/server enterprise:node
```

节点 Agent 会注册上线、拉取命令/云工作区任务，并实时回传 stdout/stderr、结果和产物。

## 打包

```bash
# 桌面端（生成 .exe 安装包，需 MSVC Build Tools + electron-builder）
# 所有桌面端产物统一输出到根目录 dist-release/desktop/<档>/<版本>/，靠目录与 artifactName 区分版本档
#
# ★ 版本档（能力分级）：lite / basic / pro，决定这个包能开哪些模式。
#   打包脚本内部会先跑 set-edition.cjs 写 apps/desktop/edition.json，
#   再注入 YZ_ARTIFACT_SUFFIX 决定产物名后缀 —— 三档共用同一份 yml。
pnpm --filter @yan-zhi/desktop electron:build:basic   # 基础版（默认）
#   产物：dist-release/desktop/basic/<version>/yan-zhi-Setup-<version>-<arch>-basic.exe
pnpm --filter @yan-zhi/desktop electron:build:lite    # 阉割版
#   产物：dist-release/desktop/lite/<version>/yan-zhi-Setup-<version>-<arch>-lite.exe
pnpm --filter @yan-zhi/desktop electron:build:pro     # 高级版（全量）
#   产物：dist-release/desktop/pro/<version>/yan-zhi-Setup-<version>-<arch>-pro.exe
pnpm build:desktop                                    # 等价 electron:build:basic

# macOS 版（electron-builder.mac.yml，需在 macOS 上构建）
pnpm --filter @yan-zhi/desktop electron:build:mac
#   产物：dist-release/desktop/basic/<version>/yan-zhi-<version>-<arch>-mac-basic.dmg / .zip

# 构建步骤（桌面端共用）：先 server build → vite build → prepare-server-runtime（打平后端依赖）
#                       → set-edition（写版本档）→ electron-builder

# 移动端 Android 正式发行（五模式、逐 ABI 分包，配置见 build/mobile.catalog.json）
pnpm package:android
#   产物：dist-release/android/<version>/yan-zhi-<version>-arm64-v8a.apk
#         dist-release/android/<version>/yan-zhi-<version>-armeabi-v7a.apk
#   两个包均使用固定 keystore 的 assembleRelease，非 debug 包；
#   签名、家庭电脑迁移和上架备案见 docs/安卓正式签名与上架备案操作手册.md

# 移动端 iOS（需 macOS + Xcode）
pnpm build:mobile:ios

# Web 端
pnpm build:web
```

### 桌面端打包前提

- **MSVC Build Tools**（含 C++ 构建工具）：`apps/desktop` 依赖 `better-sqlite3` 等原生模块，`electron-rebuild` 需要 C++ 编译环境
- 受限网络下 `electron-builder` 下载 Electron 二进制与 NSIS 打包器可能失败，需配置国内镜像（如 `ELECTRON_MIRROR` / npmmirror）
- 安装程序会自动处理 WebView2 / VC++ 运行库（若无）

### 版本档（能力分级）

三档由 `apps/desktop/edition.json`（打包期由 `scripts/set-edition.cjs` 生成）区分，控制**模式可见性**：

| 版本档 | 命令 | 放行的模式 | 开箱默认授权码 |
|--------|------|-----------|---------------|
| 阉割版 `lite` | `electron:build:lite` | 仅办公 | lite 码（**90 天**） |
| 基础版 `basic` | `electron:build:basic` | 办公 · 工作流 · 开发 · 自动化 | basic 码（**90 天**） |
| 高级版 `pro` | `electron:build:pro` | 全部九个内置模式 | **basic 码**（需 pro 码解锁全量） |

> - **实际放行 = 构建档 ∩ 授权档**：阉割版即使拿到 pro 码也只有办公模式；高级版拿 basic 码只有四个基础模式。
> - 授权码档位由签发时勾选（`gen-license.mjs --edition` / `license-manager.html` 的「版本」单选组）。
> - **存量老码无 `edition` 字段 → 按高级版处理**，保证已发出的码不掉权限。
> - **预置码为 90 天试用口径、不绑机器**（绑了会让所有用户的包开箱即失效）。
>   到期后需重新签发替换 `apps/server/src/license.ts` 的 `DEFAULT_LICENSE_BY_EDITION`。
>   时长口径由 `test/license-edition.test.ts` 的守门用例钉住（85~95 天），改错会立刻变红。
>
> **打包不含后端源码**：`extraResources` 刻意不打包 `../server/src`。
> 生产模式只运行 `server/dist/...` 的编译产物 —— 源码随包等于把 `license.ts` 的验签逻辑
> 明文交给客户，改一行即可绕过授权。

### 模型版本（与上表无关）

> ⚠️ 下表的 full / lite 指**是否内嵌本地 qwen 模型**，与上面的能力档位无关，两者曾是同名但语义不同的维度。

| 版本 | 配置 | 内嵌模型 | 典型体积 |
|------|------|---------|---------|
| 完整版（full） | `electron-builder.full.yml` | qwen 对话模型 + bge 向量模型（整个 `server/models`） | 约 1GB+ |
| 精简版（lite） | `electron-builder.lite.yml` | 仅 bge 向量模型（排除 qwen，约 26MB） | 约 200MB |

> - **精简版也内嵌 bge 向量模型**：语义检索（知识库/记忆）开箱即用，无需联网下载；两者差异主要在不带 1.1GB 的 qwen 本地对话模型。
> - 精简版不含 qwen，本地对话默认不可用，需通过模型平台配置外部 LLM（OpenAI / Anthropic 兼容网关）。

### 内置 Python 运行时

桌面端打包时由 `scripts/build-python-runtime.mjs` 拉取 **python-build-standalone**（各平台预编译独立 Python），随包分发到 `resources/python/`，离线可用。随包还附带 `resources/python-tools/`（doyz 文档处理 / 网安工具 / PDF 预览脚本 + 预烤 site-packages）。受限网络下可通过仓库 Secrets `YZ_PYTHON_STANDALONE_MIRROR` / `YZ_PIP_INDEX_URL` 覆盖下载源。

### 内置模型（qwen / bge）与国内下载

模型文件被 `.gitignore` 排除（`apps/server/models/`、`*.gguf`），不随仓库分发。构建或开发前需先补齐：

```bash
# 下载全部内置模型（qwen 对话 + bge 向量）
pnpm --filter @yan-zhi/server download:models
# 只下载向量模型（轻量版/仅需语义检索时）
pnpm --filter @yan-zhi/server download:models --embedding
# 只下载对话模型
pnpm --filter @yan-zhi/server download:models --llm
```

下载源：国内魔搭（ModelScope）直链优先、hf-mirror 兜底，源逐个尝试直到成功，断点续传。
- `qwen2.5-1.5b-instruct-q4_k_m.gguf`（1.1GB）— 本地对话模型
- `bge-small-zh-v1.5-q8_0.gguf`（26MB）— 中文语义向量模型（知识库/记忆检索）

GitHub Actions（`.github/workflows/build-desktop.yml`）在 push 到 `master` / `dev0.1` 或手动触发时，分别于 macOS 和 Windows runner 上构建**轻量版**安装包（.dmg / .exe），产物上传为 artifact。CI 不跑完整版（体积大、内嵌模型），完整版需本地手动 `pnpm build:desktop:full` 触发。另有 `.github/workflows/ci.yml` 在 PR 和 push 时跑 typecheck / lint / test 做质量卡关。

## 数据存储

**分层**：对话、笔记、配置、本地文件按端本地存储；**知识库等可共享数据统一存内置服务端一套 DB**（guest/登录都走服务端，`public/private` 决定可见性）。

| 端 | 存储方式 |
|----|---------|
| 桌面端 | Electron + better-sqlite3（本地会话/配置/文件）+ 内置 server（`apps/server/data.db`，知识库等共享数据） |
| 移动端 | Capacitor SQLite（本地会话/配置）+ 服务端（共享数据） |
| Web 端 | 浏览器 IndexedDB（Dexie，本地会话/配置）+ 服务端（共享数据） |
| 后端   | better-sqlite3（`apps/server/data.db`）：user / platform / 知识库(含 public/private) / 记忆 等 |

**敏感值加密**：桌面端 keyring（`userData/keyring.json`）里的授权码与平台 API Key 用 Electron `safeStorage` 加密后落盘（底层 Windows DPAPI / macOS Keychain / Linux libsecret），密钥绑当前用户账户 —— 复制该文件到其他机器或账户解不开。加解密纯逻辑在 `apps/desktop/keyring-crypto.cjs`（单测：`pnpm --filter @yan-zhi/desktop test`）。界面偏好（主题、工作目录等）保持明文，便于人工排查。

## 授权体系

**RSA-2048 签名授权码，应用侧只验签、无签发能力**：

| 侧 | 位置 | 说明 |
|----|------|------|
| 验签（应用内） | `apps/server/src/license.ts` + `license-public-key.pem` | 只有 `crypto.createVerify`，**全仓库无 `createSign`**（除签发脚本） |
| 门禁 | `apps/server/src/license-guard.ts` | 校验 `x-license` 头；**默认关闭**，`YZ_LICENSE_GUARD=1` 开启（局域网/多用户部署用） |
| 绑定 | `machineId`（主板 UUID 哈希）优先，`mac` 兜底 | 抗网卡变动；两者都空 = 不限机器。老码不失效 |
| 签发（**不入库**） | `scripts/gen-license.mjs` + `license-private-key.pem` | 私钥与签发工具仅存在于签发者本机，见 `.gitignore` |

> ⚠️ 签发侧（私钥 + 生成工具）**不随仓库分发**，也不打进任何安装包。换机器签发需手工搬私钥，切勿复制到构建机。

签发授权码（在持有私钥的机器上执行，工具不在库中，需手工放置）：

```bash
node scripts/gen-license.mjs --days 30                                    # 30 天有效、不限机器（默认基础版）
node scripts/gen-license.mjs --days 365 --machine-id <授权页「机器标识」>   # 绑定机器（推荐）
node scripts/gen-license.mjs --forever --edition pro                      # 永不过期 + 高级版
```

**`--edition` 勾选版本档**（默认 `basic`）：

| 取值 | 放行的模式 |
|------|-----------|
| `lite` | 仅办公 |
| `basic` | 办公 · 工作流 · 开发 · 自动化 |
| `pro` | 全部九个内置模式：办公 · 工作流 · 开发 · 自动化 · 剪辑 · 运维 · 安全 · 店铺运营 · 学习 |

> 浏览器版签发工具 `scripts/license-manager.html` 有对应的「版本」单选组，并会在解析授权码时展示档位（无该字段的老码显示「按高级版处理」）。

`--machine-id` 与 `--mac` 二选一：前者按机器标识绑定（抗网卡变动），后者是给已发出的老客户端补码用的旧口径。机器标识从应用的授权页直接复制。

## 文档导航

- 设计与任务规划：`docs/design.md`、`docs/tasks.md`
- 方案与修复文档：`docs/` 下按主题组织（浏览器重构 / **浏览器执行面直连化** / 皮肤与运维插件 / 数据源收敛 / 桌面端自动更新 / 移动端内嵌后端 等）
- 变更管理：遵循 `openspec/` 的 OpenSpec 流程（`openspec/changes/` 下按变更组织 spec）
- 近期更新与风险分析：`项目近期更新与风险分析.md`（随版本快照更新）
- 变更日志：`CHANGELOG.md`

## 项目重命名指南

修改项目名称时，需要改动以下文件：

### 桌面端 (Electron) — 影响 EXE / 安装包名称

| 文件 | 字段 | 说明 |
|------|------|------|
| `apps/desktop/electron-builder.full.yml` | `productName` | **决定 EXE 文件名和 NSIS 安装包名称**（完整版） |
| `apps/desktop/electron-builder.lite.yml` | `productName` | 决定 EXE / 安装包名称（精简版） |
| `apps/desktop/electron-builder.*.yml` | `appId` | 应用唯一标识，建议同步修改 |
| `apps/desktop/main.cjs` | `BrowserWindow title` | 窗口标题栏文字 |
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

## 许可证

本项目**不是开源软件**，采用自定义 **YAN-ZHI 商业授权协议**（见根目录 `LICENSE`）。

- **任何使用（含个人学习、研究、评测、非商业用途）均须事先取得版权人 yhfysun 的书面商业授权并支付许可费用**，未授权不得使用、复制、修改、分发或用于任何目的。
- 商业授权通过授权码（License Key）/ 授权文件授予，与内置的 lite / basic / pro 版本档激活体系配合使用，详见上文「授权体系」一节。
- 第三方依赖、模型、字体、图标和素材可能分别采用自己的许可证；第三方许可证不改变本应用的专有商业授权边界。
- 需要商业授权请联系：yhfysun（仓库 https://github.com/yhfysun/yan-zhi ）。
