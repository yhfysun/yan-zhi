# 言智 (Yan-Zhi)

语言可控的个人 AI 工作台 — 面向个人开发者的一站式**工作 / 开发 / 运维**助手：把重复性事务（签到、数据查询、部署运维、代码提交、文档生成）交给智能体定时自动执行，临时任务则用自然语言即席调度浏览器、电脑键鼠、SSH 终端、数据库等真实工具，随机应变。覆盖桌面（Electron）、Web（PWA）、移动端（Capacitor）三端，统一一套 Vue 3 代码库。

## 核心理念

- **语言即界面**：项目所有管理操作都是大模型可直接调用的工具，用户通过聊天即可配置模型、管理工具、安装 Skill、创建智能体
- **重复的交给定时，突发的交给对话**：周期性事务由定时任务驱动智能体自动执行（cron 到点开会话跑任务）；临时需求用自然语言即席调度工具与子智能体，随机应变
- **真实工具触达**：不止聊天——浏览器自动化、电脑键鼠操作（computer-use）、SSH / Docker / 数据库（ops-shell）、Git、Python 执行，动作落在真实系统上
- **协议开放**：模型接入遵循 OpenAI 兼容协议，商城互联使用标准化 REST API
- **数据后端化（单库）**：业务数据（会话 / 智能体 / Skill / 平台模型 / 记忆 / 工作流执行）统一存内置服务端 `data.db`，前端只做交互、不存数据不跑引擎——关掉页面任务照常在后端执行；本机 UI 偏好（主题/布局/工作目录等）与本地文件仍存本机
- **无登录体系（本地单用户）**：本地模式下鉴权已屏蔽，业务数据统一归属内置 `guest` 用户，前端登录态不影响数据归属；后续接入用户体系后再按 `user_id` 隔离
- **节点互联 / 局域网访问**：每个言智节点既是客户端也是服务端，可连接其他节点获取工具 / Skill / 智能体；后端监听 `0.0.0.0`，局域网内其它设备可用浏览器直接访问本节点的 Web 界面

## 技术栈

- Vue 3.5 + TypeScript + Vite 5
- Electron（桌面，electron-builder 打包）/ Capacitor 6（移动）/ PWA（Web）
- Element Plus + Vue Router + Pinia + Vue Flow（工作流画布）
- SQLite + better-sqlite3（内置服务端 `data.db`，业务数据单库统一）+ sqlite-vec（本地向量记忆）/ Dexie（Web 端历史兼容）
- 内置 Express 后端（apps/server）统一承载**全部业务数据**（会话/智能体/Skill/平台模型/记忆/工作流，guest 单用户），并托管前端静态资源供局域网访问
- 内置本地模型：qwen2.5-1.5b（对话）+ bge-small-zh（语义向量，知识库/记忆检索）
- Express（后端 API）+ JWT / bcrypt（鉴权）
- Playwright（内置浏览器自动化）
- OpenAI 兼容协议 + Anthropic 协议 + MCP（Model Context Protocol）

## 项目结构

```
yan-zhi/
├── apps/
│   ├── desktop/      # Electron 桌面端（本地 SQLite + WebView2 Chromium）
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
| 局域网访问 | ✅ 已完成 | 后端 0.0.0.0 + 托管前端静态资源，局域网内设备浏览器访问 Node Web 界面（设置页含 IP 展示 + 打开浏览器按钮） |
| 聊天接口工具化 | ✅ 已完成 | 模型 / MCP / 工具 / Skill / 智能体 / 商城 / 会话等管理接口注册为 LLM 可调用的工具 |
| 空间 / 工作目录 | ✅ 已完成 | 选目录自动建空间，空间目录上下文注入对话 |
| 文件分类与预览 | ✅ 已完成 | 上传 / 中间 / 交付三类，右侧预览面板内联预览 |
| 内置浏览器 + pageAgent | ✅ 已完成 | 真实鼠标 / 键盘模拟；需本机有显示环境 |
| 子智能体与记忆 | ✅ 已完成 | `call_agent` 委派子智能体；滑动窗口 + sqlite-vec 向量记忆 |
| 消息中心 | ✅ 已完成 | 多会话聊天中心：应用内助手 + 言智节点互聊（Peers）+ IM 渠道聚合 |
| 对话模式开关 | ✅ 已完成 | 深度思考 / 计划 / 仅回答（输入框「+」菜单，前后端 modeFlags） |
| IM 集成 | ✅ 代码就绪 | 飞书闭环 + 企业微信（AES 解密/XML）+ 个人微信通道；真实联调需开放平台账号与公网回调 |
| 插件系统 | ✅ 已完成 | `.yzp` 插件包，8 类扩展点（工具/皮肤/布局/路由/设置/对话增强/后端路由），权限声明、安装/导出/启停 |
| 皮肤系统 | ✅ 已完成 | 皮肤即插件：壁纸/遮罩/毛玻璃、分类预览，皮肤库切换，可二改重装自定义 |
| ops-shell 运维插件 | ✅ 已完成 | SSH 命令 / SFTP / Docker / 数据库只读查询 / xterm 终端 + 运维智能体，护栏与全量审计 |
| computer-use 电脑操作 | ✅ 已完成 | 鼠标/键盘/窗口/截屏/启动应用（Windows 实现），急停与黑名单护栏，默认关闭 |
| 定时任务 | ✅ 已完成 | cron / 固定间隔，到点自动创建会话执行；配合预置 skill 形成每日自动化链路 |
| Git 集成 | ✅ 已完成 | 对话内 Git 面板 + `git_status/diff/log/commit/file_tree` LLM 工具 |
| 五维记忆管理 | ✅ 已完成 | 画像/智能体/会话/每日/空间五维 + 管理界面 + 自动整理（去重/矛盾清理/提拔） |
| 网络工具族 | ✅ 已完成 | `port_scan` / `lan_scan` / `dns_lookup` / `tcp` / `udp`（授权运维场景） |
| Python 执行 | ✅ 已完成 | `python_exec` 自动装依赖，数据分析 / 文档生成 |
| LLM 代理与 Token 池 | ✅ 已完成 | OpenAI/Anthropic 双协议转发，多 key 轮换 / 熔断 / 重试 / 调用日志 |
| License 授权 | ✅ 已完成 | RSA 验签 + MAC 机器绑定 + 90 天试用码（商用闭环） |
| 数据本体智能体 | 🚧 代码就绪 | 多数据源（MySQL/PG/达梦/Oracle/SQLite/CSV/HTTP-JSON）+ 语义层（LLM 出 DSL、引擎拼 SQL）+ SQL 控制台 + 数据分析智能体 |

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
- 桌面端「预览面板」打开网页走 **Electron 原生 BrowserView**（应用自带 Chromium，无需额外下载）
- 服务端另用 **Playwright 无头 Chromium** 执行浏览器自动化 / `web_search` 抓取（该 Chromium 为独立二进制，需 `npx playwright install chromium`）
- pageAgent 为内置 harness 子智能体，默认 AI 助理经 `call_agent` 挂载并委派浏览器任务
- 右侧预览面板「浏览器」模式显示操作步骤日志，可聚焦 / 打开浏览器窗口
- 运行前提：服务端需本机有显示环境（本地开发 / 桌面天然满足）

### 子智能体与记忆（已实现）
- 子智能体注册与并行调度
- 三层自动记忆：**每日记忆**（按自然天聚合）/ **会话记忆**（当前会话，不串台）/ **智能体记忆**（跨会话长期）；对话中自动抽取、对话前自动注入（可配置抽取模型，默认本地）
- 短期记忆滑动窗口 + 长期记忆向量检索（sqlite-vec）
- 上下文自动压缩

### 知识库（已实现，含语义检索）
- 创建 / 编辑 / 删除知识库，添加文档自动切块并向量化
- 检索升级：内置 **bge-small-zh** 向量模型做余弦相似度语义排序；模型缺失时自动降级为关键词检索
- **一套数据库 + 共享级别**：知识库统一存服务端一套 DB；不登录（guest）自动以访客身份访问，托管 public 库；登录用户可建 private / public 共享（跨用户可见）。旧本地库方案已废弃。
- 应用使用知识（内置指南可自定义）+ 三层记忆 + 知识库命中片段，都会在对话前注入提示词，帮助模型回答「怎么用这个应用」等问题

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

### 插件系统（已实现）
- 插件包 `.yzp`（zip 格式）：声明式贡献 8 类扩展点——**工具 / 主题皮肤 / 布局 / 侧栏入口 / 前端路由 / 设置面板 / 对话增强器 / 后端路由**
- 权限声明（fs / shell / git / db / network / clipboard / desktop-input / remote-shell）+ 安装 / 导出 / 启用禁用
- **皮肤即插件**：壁纸 / 遮罩 / 毛玻璃、分类（动漫/风景/美图/简约）与预览图，设置→皮肤库切换；可下载源码包二改后重装实现自定义
- 内置插件：ops-shell（运维）、computer-use（电脑操作）、git-explorer（Git）等

### 运维插件 ops-shell（已实现）
- SSH 命令执行、SFTP 上传下载、Docker 容器管理（over SSH）、数据库只读查询（mysql / postgres，仅 SELECT 类语句）
- 双模式：**xterm 交互终端**（SSE 实时）+ **运维智能体对话**（自然语言下指令）
- 护栏：危险命令黑名单、生产连接写操作二次确认、空闲会话回收、连接信息 AES-256-GCM 密文存储、全量操作审计

### 电脑操作 computer-use（已实现，默认关闭）
- 智能体操作本机：鼠标点击 / 移动 / 拖拽、键盘输入 / 快捷键、窗口激活 / 枚举、截屏、启动应用
- Windows 用 PowerShell + Win32 P/Invoke 实现，零原生依赖
- 护栏：10 分钟滚动窗口操作上限、危险组合键 / 进程黑名单、急停（Ctrl+Alt+Esc）、默认禁止操作应用自身窗口、全操作审计

### 定时任务与自动化（已实现）
- cron 表达式（分钟粒度）或固定间隔，绑定会话 / 智能体 / 平台模型 / 空间，到点自动创建会话执行
- 支持立即运行、启停、下次执行时间预览与调度器热刷新
- 与预置 skill 配合形成「每日自动执行」链路：**网站自动化任务**（pageAgent 登录 / 签到 / 领积分 / 填表单）、**即梦每日签到**（登录态持久化 + 定时执行）

### Git 集成（已实现）
- 对话内 Git 面板：分支切换、ahead/behind、拉取 / 推送 / 新建分支、变更 / 文件树 / 历史三视图、内联 diff、暂存操作
- `git_status / git_diff / git_log / git_commit / git_file_tree` 注册为 LLM 可调用工具，自然语言即可提交代码

### 五维记忆管理（已实现）
- 记忆分五维：**用户画像 / 智能体记忆 / 会话记忆 / 每日记忆 / 空间记忆**（每空间一份 MEMORY.md）
- 记忆管理界面：关键词搜索、手动增删
- 「立即整理」（memory-dreaming）：自动去重、矛盾清理、过期淘汰、短期记忆提拔为长期，附整理记录日志

### 数据本体与多数据源（代码就绪）
- 多数据源接入：MySQL / PostgreSQL / 达梦 / Oracle / SQLite / 内置库 / CSV / HTTP-JSON（连接加密、测试连接、拉取库表结构）
- 语义层 Text2Semantic2SQL：LLM 只输出受控 DSL（code / 选择器 / 过滤器 / 属性），引擎确定性拼 SQL；启动时自动扫描项目库生成全表本体
- SQL 控制台（多语句 / 分页导出 / 只读拦截）+ 数据查询分析智能体 + 对话内动态看板（query contract，参数化执行不走大模型）

### 其他实用工具（已实现）
- **Python 执行**：`python_exec` 自动探测解释器、按需 pip 装依赖后执行（数据分析 / PPT / Word / Excel / PDF 生成）
- **网络工具族**：`port_scan`（并发端口扫描）、`lan_scan`（网段主机发现）、`dns_lookup`、`tcp_send` / `udp_send`——面向局域网运维场景
- **商品比价**：`compare_products` 同款对齐（标题核心词 + 规格）、到手价归一、可信度评分、价格异常检测
- **LLM 代理**：对外 OpenAI / Anthropic 双协议转发，Token 池多 key 轮换 / 失败熔断 / 重试 / 调用日志

### 局域网访问（已实现）
- 后端监听 `0.0.0.0`（`YZ_HOST` 可改回 `127.0.0.1` 仅本机），局域网内其它设备（手机 / 电脑）可用浏览器访问本节点的完整 Web 界面
- 后端 `express.static` 托管前端静态资源（`WEB_DIST` 指向构建产物），访问 `http://<本机IP>:3001` 即用
- 设置页「局域网访问」tab：展示本机局域网 IP + 端口，可「复制」或「打开浏览器」（桌面端用系统默认浏览器）
- 无登录体系，局域网访问无需登录（数据归属本地 guest 用户）

## 三端差异化

| 能力 | 桌面（Electron） | Web（PWA） | 移动（Capacitor） |
|------|--------------|-----------|------------------|
| 业务数据存储 | 服务端 data.db（单库） | 服务端 data.db（单库） | 服务端 data.db（单库） |
| 本机偏好/文件 | keyring + 文件系统 | localStorage | keyring + 应用沙箱目录 |
| MCP stdio 子进程 | 完整支持 | 仅远程 SSE/HTTP | 仅远程 SSE/HTTP |
| 文件系统访问 | 完整 | File System API | 受限目录 |
| Skill 本地目录 | 文件系统 | 服务端 DB | 应用沙箱目录 |
| 系统托盘/通知 | 支持 | 不支持 | 支持 |
| 离线可用 | 支持 | 需 PWA 安装 | 支持 |
| 自动更新 | electron-updater | Service Worker | 应用商店 |
| 内置浏览器自动化 | 支持 | 需本机服务端 | 不支持 |
| 局域网访问 | 后端监听 0.0.0.0，其它设备浏览器访问 | 同左（访问节点 IP） | 同左 |

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

## 打包

```bash
# 桌面端（生成 .exe 安装包，需 MSVC Build Tools + electron-builder）
# 所有桌面端产物统一输出到根目录 dist-release/，靠 artifactName 区分 lite/full/mac
pnpm build:desktop
#   默认（electron-builder.full.yml）产物：dist-release/言智-Setup-<version>-<arch>-full.exe
#   完整版：内嵌后端服务与本地模型（models/），不带模型的完整功能，安装包较大

# 精简版（electron-builder.lite.yml，不含本地模型）
pnpm --filter @yan-zhi/desktop electron:build:lite
#   产物：dist-release/言智-Setup-<version>-<arch>-lite.exe

# macOS 版（electron-builder.mac.yml，需在 macOS 上构建）
pnpm --filter @yan-zhi/desktop electron:build:mac
#   产物：dist-release/言智-<version>-<arch>-mac.dmg / .zip

# 构建步骤（桌面端共用）：先 server build → vite build → prepare-server-runtime（打平后端依赖）→ electron-builder
# `pnpm build:desktop` 等价 `pnpm --filter @yan-zhi/desktop electron:build:full`

# 移动端 Android（APK 构建后自动拷贝到 dist-release/）
pnpm build:mobile:android
#   产物：dist-release/*.apk（由 scripts/copy-apk.cjs 从 Gradle 输出目录拷入）

# 移动端 iOS（需 macOS + Xcode）
pnpm build:mobile:ios

# Web 端
pnpm build:web
```

### 桌面端打包前提

- **MSVC Build Tools**（含 C++ 构建工具）：`apps/desktop` 依赖 `better-sqlite3` 等原生模块，`electron-rebuild` 需要 C++ 编译环境
- 受限网络下 `electron-builder` 下载 Electron 二进制与 NSIS 打包器可能失败，需配置国内镜像（如 `ELECTRON_MIRROR` / npmmirror）
- 安装程序会自动处理 WebView2 / VC++ 运行库（若无）

### 完整版 vs 精简版

| 版本 | 配置 | 内嵌模型 | 典型体积 |
|------|------|---------|---------|
| 完整版（full） | `electron-builder.full.yml` | qwen 对话模型 + bge 向量模型（整个 `server/models`） | 约 1GB+ |
| 精简版（lite） | `electron-builder.lite.yml` | 仅 bge 向量模型（排除 qwen，约 26MB） | 约 200MB |

> - **精简版也内嵌 bge 向量模型**：语义检索（知识库/记忆）开箱即用，无需联网下载；两者差异主要在不带 1.1GB 的 qwen 本地对话模型。
> - 精简版不含 qwen，本地对话默认不可用，需通过模型平台配置外部 LLM（OpenAI / Anthropic 兼容网关）。

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

GitHub Actions（`.github/workflows/build-desktop.yml`）在构建前会自动执行 `download:models`，并产出轻量版安装包到 `dist-release/`（完整版需本地手动 `pnpm build:desktop:full` 触发）。

## 数据存储

**单库后端化**：业务数据统一存内置服务端一套 `data.db`（前端只交互，不存数据不跑引擎）。仅本机 UI 偏好（主题/布局/工作目录/默认模型等）与本地文件留在本机。

| 端 | 存储方式 |
|----|---------|
| 桌面端 | Electron 界面 + 内置 server（`apps/server/data.db`，业务数据单库）；本机偏好走 keyring，本地文件走文件系统 |
| 移动端 | Capacitor 界面 + 服务端（`data.db`，业务数据） |
| Web 端 | 浏览器界面 + 服务端（`data.db`，业务数据；局域网内浏览器直接访问后端托管的前端静态资源） |
| 后端   | better-sqlite3（`apps/server/data.db`）：user / platform / model / agent / skill / conversation / message / memory / workflow_run 等全部业务表 |

> 单库收敛后前端不再持有数据副本（历史遗留的 yan-zhi.db / Dexie 分支已废弃）。本地单用户模式下业务数据归属内置 `guest` 用户，`user_id` 全程携带，后续接入用户体系可按 `user_id` 天然隔离。

## 文档导航

- 需求与实现规划：`.trae/documents/four-features-plan.md`、` .trae/documents/implementation-tasklist.md`
- 设计与任务规划：`docs/design.md`、`docs/tasks.md`
- 变更管理：遵循 `openspec/` 的 OpenSpec 流程（`openspec/changes/` 下按变更组织 spec）

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
