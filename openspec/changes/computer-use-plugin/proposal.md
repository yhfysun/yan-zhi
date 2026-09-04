# 方案：插件导出 + 电脑使用（computer-use）插件

> 状态：P1/P2/P3(部分) 已实施（2026-09-04）| 选型定案：B（PowerShell/Win32 零原生依赖，nut-js 适配器留待后续）

## 一、现状调研结论（基于实际源码）

- 插件体系：`packages/core/src/plugin/`（manifest/loader/registry/permissions/api），后端管理器 `PluginManager`，路由 `apps/server/src/routes/plugins.ts`（install/enable/disable/config）。
- **目前只有一个内置插件**：`git-explorer`（`apps/server/src/plugins/git-explorer.ts`），通过 `registerBuiltin(manifest, module)` 注册，**模块是内存中的对象，没有源码落盘，也没有任何导出路由**。
- 已安装插件入口为磁盘文件路径（`registerInstalled`），但同样没有 export/download 路由。
- 系统级输入控制：**不存在**。`playwright ^1.62.1` 只作用于内置浏览器 BrowserView 页面（`routes/browser.ts` 的 page.mouse/keyboard），desktop 依赖里无 robotjs/nut-js。
- 工具执行链路已闭环：插件 `ctx.registerTool()` → `ToolRegistry` → `buildToolsForBackend()` 转 OpenAI function → LLM 自主多轮调用循环（task + SSE）已具备。**即：只要注册工具，智能体就能在任务里循环使用它**，无需新建执行框架。

## 二、需求 1：插件导出（给开发者可参考的范例）

### 目标
让用户/开发者能导出内置插件源码作为写新插件的参考模板，并下载自定义插件。

### 方案

| 项 | 内容 |
|---|---|
| 后端路由 | `GET /api/plugins/:id/export` —— 返回 zip（manifest.json + main 源码 + README.md）；`GET /api/plugins/template` —— 返回新插件脚手架（manifest + index.ts 骨架，含 registerTool/registerBackendRoute/storage 用法注释） |
| 内置插件源码 | 在 `apps/server/src/plugins/templates/` 维护与源码同步的模板副本（git-explorer、computer-use），导出即取模板。内置模块是内存对象无法序列化，必须落一份可读源码 |
| 已安装插件 | `registerInstalled` 已有入口文件路径，直接读文件打包导出 |
| 前端 | 插件管理页每项加「导出」按钮；插件市场/设置页加「插件开发指南」入口（展示 template + git-explorer 导出） |
| zip 依赖 | 用 `archiver`（纯 JS，无原生编译）或最小化直接返回 JSON（manifest + code 内联）——**建议 JSON 起步，zip 后续再说** |

### 关键决策
- ✅ 起步用「单文件 JSON 导出」（manifest + code + readme 字段），零新依赖；zip 打包列入后续优化。
- ✅ 内置插件源码模板放 `plugins/templates/`，CI/人工约定与实际注册源码保持同步（同一文件两个引用点，改动需双写或用构建脚本复制）。

## 三、需求 2：computer-use 插件

### 目标
安装后智能体可操作系统软件：鼠标点击/拖拽、键盘输入/快捷键、启动应用、列窗口、截图观察。对标 Codex / Claude computer use 的「观察(截图) → 行动」循环。

### 形态
内置插件 `computer-use`（与 git-explorer 同形态）：`apps/server/src/plugins/computer-use.ts`，`registerBuiltin` 注册，**默认 disabled，设置页显式开启**。

### 工具集（注册到 ToolRegistry，LLM 自动可见）

| 工具 | 说明 |
|---|---|
| computer_screenshot | 全屏/指定窗口截图，返回图片给 LLM 观察（复用聊天图片通道） |
| computer_mouse_click | x/y 坐标点击（left/right/double） |
| computer_mouse_move / drag | 移动 / 按住拖拽 |
| computer_scroll | 滚动（方向 + 格数） |
| computer_type | 键入文本 |
| computer_press_key | 组合键（如 "ctrl+shift+t"） |
| computer_list_windows | 枚举可见窗口（标题/进程名/pid） |
| computer_activate_window | 按标题激活/前置窗口 |
| computer_open_app | 启动应用（走 shell，受权限约束） |

### 技术选型（核心决策点，二选一）

| 方案 | 优点 | 风险点 | 建议 |
|---|---|---|---|
| A. `@nut-tree-fork/nut-js`（预编译二进制，纯 Node 进程加载） | 功能全：像素级鼠标/键盘/截图/窗口查找；调用快（无进程 spawn） | 原生 .node 模块，需确认 prebuilt 与打包后 Node ABI 匹配；装包体积 ~几十 MB | **推荐**（先小样验证 prebuilt 可加载，失败落 B） |
| B. PowerShell/.NET（Add-Type P/Invoke，零新依赖） | 零依赖、零编译风险；与本机「受限网络 + ABI 坑多」环境契合 | 每次操作 spawn 一个 powershell（200~500ms，computer-use 高频操作太慢）；仅 Windows | 兜底方案；mac 端另走 osascript |

> A 方案前置验证项：在 managed Node 22.22.2 下 `require('@nut-tree-fork/nut-js')` 成功 + 打包产物（server-runtime 内嵌）可加载。任一失败即切 B，接口层（`ComputerInputAdapter`）先抽象好，两者可替换。

### 权限模型
- `PluginPermission` 新增 `'desktop-input'` 类型（`packages/core/src/plugin/types.ts` + manifest 校验白名单）。
- computer-use manifest 声明 `permissions: ['desktop-input', 'shell']`，安装/启用时前端弹确认（高权限能力，说明文案写清"将允许智能体控制本机鼠标键盘"）。

### 安全护栏（hard requirements，非可选）

1. **默认关闭**：`registerBuiltin(manifest, module, false)`，需在插件管理页手动开启。
2. **急停热键**：开启插件后注册全局监听（desktop 端 globalShortcut），按 `Ctrl+Alt+Esc` 立即中断当前任务并禁用输入工具，状态回写插件页。
3. **操作上限**：单次 task 内输入类工具调用次数上限（默认 50 次，可配），超限返回结构化错误要求用户确认续跑。
4. **黑名单拦截**：`computer_press_key`/`computer_open_app` 过滤危险组合与命令（如关机/任务管理器强杀系统进程/删盘命令），命中即拒绝并审计。
5. **审计日志**：每次输入操作写 `plugin_storage` 或独立审计表（时间/工具/参数摘要/taskId），插件页可查看最近操作。
6. **不自伤**：点击坐标落在 yan-zhi 自身窗口时默认拒绝（避免智能体点掉自己的开关），可通过配置放宽。

## 四、分期任务

### P1 插件导出（小，先收）
- [ ] `routes/plugins.ts` 加 `GET /:id/export`（JSON 格式）与 `GET /template`
- [ ] `apps/server/src/plugins/templates/` 落 git-explorer 模板源码
- [ ] 前端插件管理页加导出按钮 + 模板下载入口
- [ ] tsc 校验 + 手测导出→本地可用参考

### P2 computer-use 基础（Windows 先行）
- [ ] 前置验证：nut-js prebuilt 在 managed Node 与打包产物中可加载（半天 spike，结论决定 A/B）
- [ ] `PluginPermission` 加 `desktop-input`；manifest 校验同步
- [ ] `computer-use.ts` 插件：InputAdapter 接口 + A/B 实现 + 9 个工具注册
- [ ] screenshot 图片回传 LLM 的通道打通（复用现有图片消息结构）
- [ ] 默认 disabled + 启用确认弹窗

### P3 护栏与体验
- [ ] 急停热键 + 操作上限 + 黑名单 + 审计日志 + 自窗点击拒绝
- [ ] 插件页显示审计记录与使用说明
- [ ] mac 端 osascript 适配（可后置，先 Windows）

## 五、风险分级

- **High**：nut-js 原生模块在打包后 server-runtime 的 ABI/加载兼容性（P2 spike 先行验证）；智能体误操作系统——靠默认关闭 + 急停 + 上限 + 审计兜底。
- **Medium**：内置插件源码模板与实际注册代码漂移（双写约定或构建脚本复制）；screenshot 图片体积对上下文的开销（压缩 + 限制分辨率）。
- **Low**：JSON 导出格式后续要迁 zip 的兼容（version 字段预留）；多用户下插件态隔离（当前 plugin 表无 user_id，与现状一致，不在本次扩大范围）。

## 六、明确不做（本次范围外）

- 不做视觉理解模型接入（截图直接走现有多模态消息，模型看不看得懂取决于所用模型）。
- 不做 iOS/Android 模拟输入（移动端无此能力基础）。
- 不做远程电脑控制（仅本机）。
