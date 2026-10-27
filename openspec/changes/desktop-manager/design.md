# 技术设计：桌面管理插件（可后装形态）

> 对应 proposal.md。三条硬约束：① **默认打包不带，可运行时安装**；② 基座只加通用能力；③ 文件操作只移不删、全程可回滚。

## 1. 交付形态与装载

### 1.1 打包：默认不含

- `build/plugins.catalog.json` **不加** `desktop-manager` 条目 —— 该文件是打包真相源，`build-plugins.mjs` 只构建目录内插件。
- 产物 `desktop-manager-0.1.0.yzp` 单独分发；安装走既有链路：`POST /api/plugins/install`（adm-zip 解到 `plugins/installed/desktop-manager/`）。
- 安装后的物理形态与内置包**完全一致**（design/mode-pluginization 已定死）：

```
plugins/installed/desktop-manager/
  manifest.json              # id / version / engine / permissions / contributes
  backend/index.js           # esbuild 产物（工具 + 路由 + WS + 定时）
  frontend/index.mjs         # 设置页 / 方案确认页（插件管理里打开的常规页面）
  frontend/fence.html        # 围栏渲染页（被 pluginWindow 打开的独立入口）
  frontend/fence.mjs
  frontend/widgets.mjs       # 组件渲染器（白名单在包内，宿主不认识）
  assets/…                   # 图标、示例壁纸
```

### 1.2 装载

- 后端：`POST /api/plugins/install` 解包到 `plugins/installed/<id>/` 后**直接 `registerInstalled(manifest, entryUrl)`，安装即热装载、无需重启**（`routes/plugins.ts:99`）；重启后由 `index.ts` 的 `rebindAndReactivate` 恢复入口绑定。
- 前端：宿主装载器按 manifest `ui.entry` 走 `yz://plugin/desktop-manager/frontend/index.mjs`；围栏页走独立入口 `yz://plugin/desktop-manager/frontend/fence.html`。
- 兼容门禁：`"engine": "^0.2"` —— 低于该版本的宿主要么没有 `pluginWindow` API，要么没有 `desktop-shell` 权限，安装在预览页直接拒绝。

### 1.3 卸载 / 停用

`deactivate()` 必须：关闭全部围栏/组件窗口 → 恢复系统图标 → 落最终 oplog。即使插件没做，基座也要兜（见 §3.4）。

## 2. 分层：基座能力 vs 插件业务

```
┌──────────────────────────────────────────────────────────────┐
│ 插件 desktop-manager（.yzp，可后装）                           │
│  工具：desktop_scan / plan / apply / undo / fence_* / widget_*│
│  后端：归类规则、oplog、围栏与组件数据、组件 JSON 校验          │
│  前端：围栏渲染页、组件渲染器、设置页、方案确认页               │
└───────────────┬──────────────────────────────────────────────┘
                │ 插件宿主桥 window.__YZ_HOST__.api（既有）
                │  · electronAPI（既有，含新增 pluginWindow/desktopShell）
                │  · llm（新增，通用模型调用入口；AI 模式用）
                │  · /api/plugin/desktop-manager/*（插件自己的路由）
┌───────────────▼──────────────────────────────────────────────┐
│ 基座（随应用发布，仅通用能力）                                  │
│  pluginWindow：开/改/关 插件窗口（desktop | overlay | normal）  │
│  desktopShell：系统图标显隐、文件图标、openPath、会话级恢复      │
│  llm：统一模型入口（默认模型解析 + 非流式 JSON 调用）            │
│  C# 助手：Progman/WorkerW/SetParent/WM_COMMAND（通用 Win32 层）│
└──────────────────────────────────────────────────────────────┘
```

**判断标准**：能被任何插件使用的 → 基座；只对"整理桌面/围栏/组件"有意义的 → 插件。据此，扫文件、归类规则、围栏数据、组件规范全在插件内。

## 3. 基座新增（唯一改动）

### 3.1 `pluginWindow`（preload → IPC）

```ts
pluginWindow.open({
  entry: 'fence.html',            // 只允许本插件包内相对路径
  placement: 'desktop' | 'overlay' | 'normal',
  rect: { x: number; y: number; w: number; h: number },
  transparent?: boolean,          // 默认 true（desktop/overlay）
  clickThrough?: boolean,         // 空白区穿透（渲染层分段开启）
  focusable?: boolean,            // overlay 默认 false
  displayId?: string,             // 多屏定位
}): Promise<{ ok: boolean; windowId?: string; error?: string }>

pluginWindow.update(windowId, { rect?, clickThrough?, visible? })
pluginWindow.close(windowId)
pluginWindow.list(): Promise<Array<{ windowId, placement, rect }>>
pluginWindow.on('moved' | 'closed', cb)
```

- **入口白名单**：`entry` 解析后必须落在 `yz://plugin/<调用方 pluginId>/` 内 —— 插件 A 不能开插件 B 的页面。调用方 id 由宿主按当前插件上下文注入，不信任渲染层传参。
- **placement 语义**：
  - `desktop`：主进程发 `0x052C` 生成 `WorkerW` → `SetParent` 钉到壁纸层；失败返回 `{ok:false, error:'pin-failed'}`（**不静默降级**，由插件决定是否用 normal 重试）。
  - `overlay`：置顶 + `skipTaskbar` + `focusable:false` + 全屏应用时自动隐藏。
  - `normal`：普通无边框窗（用于设置预览、调试）。
- **审计**：每次 open/close 进 `pushPluginAudit`（既有通道），含 pluginId、placement、rect。

### 3.2 `desktopShell`

```ts
desktopShell.iconsVisible(): Promise<boolean>
desktopShell.setIconsVisible(v: boolean): Promise<{ ok: boolean; error?: string }>
desktopShell.fileIcon(path: string, size?: 'small'|'normal'|'large'): Promise<string>  // dataURL
desktopShell.openPath(path: string): Promise<{ ok: boolean; error?: string }>
desktopShell.query(): Promise<{ progman: number; defView: number; workerW: number }>
```

内部复用 `app.getFileIcon`、`shell.openPath`；图标显隐与钉窗走 §3.3 的 C# 助手。

### 3.3 C# 助手扩展

沿用 `ensureGdiCapExe` 的「csc 运行时编译 + userData/bin 缓存 + 版本化文件名」管线，抽出通用 `ensureHelperExe(name, src)`；新增 `yz-desktop.exe`：

```
--progman               句柄树（Progman / SHELLDLL_DefView / WorkerW）
--spawn-workerw         发 0x052C 并等待 WorkerW 出现
--pin <hwnd>            SetParent 到目标 WorkerW
--toggle-icons [0|1]    读/写「显示桌面图标」
--icons-visible         查询
```

输出统一 JSON 行，主进程解析（与 `parseWindowListLine` 同风格）。

### 3.4 会话级恢复（基座兜底，不依赖插件）

主进程维护 `desktopShellRefCount` 与 `iconsHiddenByUs`：

- 所有插件窗口关闭 / 插件 deactivate / 宿主 `before-quit` 与 `app.exit` → 若 `iconsHiddenByUs` 则恢复。
- `pluginWindow` 的窗口 `render-process-gone` / `closed` → 通知插件；插件 3 秒内不重建则基座回收并恢复图标。
- 启动自检：若图标已隐藏且非本会话所设 → 标记 `iconsHiddenByUs=false`，不接管。

### 3.5 `llm`（通用能力，AI 整理模式用）

```ts
llm.json({
  system: string,
  user: string,
  schema?: object,          // 期望的 JSON 形状（宿主只透传，不代替插件校验）
  maxTokens?: number,
  timeoutMs?: number,
}): Promise<
  | { ok: true; text: string; data?: unknown; tokens: number }
  | { ok: false; code: 'no-model' | 'timeout' | 'bad-json' | 'upstream'; error: string }
>
```

- 内部复用既有 `chatViaRow` + `findModelRow`（默认模型），不新造调用链；
- 权限 `llm`：manifest 未声明即拒绝；每次调用进插件审计（pluginId / tokens / 耗时，**不记 prompt 正文**）；
- 只给"调默认模型"这一件事：插件不能指定平台/模型，避免绕过宿主模型配置。

## 4. 插件数据模型（插件自有表，manifest `ownedTables`）

```jsonc
// desktop_fence
{ "id": "f-work", "label": "工作文档", "color": "#5b8cff",
  "rect": { "x": 40, "y": 40, "w": 400, "h": 270 }, "displayId": "primary",
  "sort": "name", "members": ["报价单-final.xlsx", "需求说明.docx"],
  "style": { "radius": 18, "opacity": 0.55 } }

// desktop_widget
{ "id": "w-todo", "type": "list", "source": { "contract": "tasks.today" },
  "pos": { "x": 880, "y": 176, "w": 340, "h": 300 },
  "layer": "desktop", "config": { "max": 6 } }

// desktop_oplog
{ "id": "op-...", "at": "2026-10-26T15:04:05Z", "kind": "move",
  "ops": [{ "from": "桌面/报价单.xlsx", "to": "桌面/工作文档/报价单.xlsx" }],
  "fencesBefore": [/* 布局快照 */] }
```

`members` 存文件名而非绝对路径；文件改名/移动后按 mtime+模糊名匹配，配不上落 `inbox` 围栏并提示，绝不静默丢图标。

## 5. 两种整理策略（插件后端，P0-A）

### 5.0 为什么两种

| 策略 | 好处 | 坏处 |
|---|---|---|
| 纯规则 | 零成本、离线、确定性、可复现、可单测 | 规则覆盖不到的文件只能进「待归类」，组名也死板 |
| 纯 AI | 分组和命名更贴合语义 | 每次都有成本与延迟；输出不稳定；无模型时完全不可用 |
| **规则默认 + AI 增强（采用）** | 基础分类永远正确且零成本，AI 只补边界 | 需要一套回落与校验机制 |

### 5.1 规则模式（默认，**不调用大模型**）

- 管线：采集 → 过滤 → 判定 → 目标目录 → 冲突处理 → 方案。
- 判定顺序（首个命中即止）：**用户自定义规则（按 priority）→ 项目关键词 → 时间簇 → 内置扩展名表 → 待归类**。
- 特性：零网络、确定性、**幂等**（同输入两次运行结果完全一致，可直接写断言）。
- 规则可配置（设置页，存插件配置）：

```jsonc
{
  "rules": [
    { "match": "*.pdf",  "group": "文档",      "priority": 10 },
    { "match": "星图*",   "group": "项目·星图", "priority": 50 },
    { "match": "*.png",  "group": "图片",      "priority": 20 }
  ],
  "projects": ["星图", "青岚"],
  "timeCluster": { "enabled": true, "windowDays": 7 },
  "keep": ["*.lnk", "desktop.ini"],
  "targetRoot": "_整理"
}
```

- 不猜：规则覆盖不到的文件如实进 `待归类`，方案页标注「规则未覆盖 N 个」，由用户或 AI 模式再处理。

### 5.2 AI 模式（模型**只做增强**，不接管全流程）

1. 先跑规则，得到基础方案（保证不会乱、成本最低）。
2. 只把「规则未覆盖的文件名 + 已有组名摘要」交给模型 —— **不含路径、不含文件内容**。
3. 模型输出严格 JSON：`{ "groups": [{ "name": "...", "files": ["..."] }], "keep": ["..."] }`。
4. 校验（**任何一条不过 → AI 结果整体作废**，不是部分采纳）：
   - 文件名必须来自输入集合（禁止编造/新增）
   - 组名字符集与长度合法、总组数 ≤ 8、每组文件 ≤ 30
   - 受保护文件不得出现在任何组
   - 目标目录不得越出 Desktop / 插件自建目录
5. 与规则已有组同名 → 合并进该组，不产生重复围栏。

### 5.3 回落与成本护栏

- 触发回落：未配置模型 / `no-model` / 超时 / 返回非 JSON / 校验不过。
- 回落表现：方案页顶部标注「**AI 不可用，已按规则生成**」+ 具体原因；不弹错误框打断流程。
- 护栏：单次最多 200 个文件名、`maxTokens` 上限、超时默认 20s、同一批文件 10 分钟内不重复请求（按文件名集合 hash 缓存）。

### 5.4 工具面与入口

| 工具 | 入参 | 说明 |
|---|---|---|
| `desktop_scan` | `{ strategy? }` | 只读；策略只影响是否附带「规则未覆盖」清单 |
| `desktop_plan` | `{ strategy?: 'rules'\|'ai', intent? }` | 缺省读设置（默认 `rules`）；AI 失败自动回落并在方案里标注 |
| `desktop_apply` | `{ planId, confirmed: true }` | 不感知策略，只执行方案 |
| `desktop_undo` | `{ opId, confirmed: true }` | 同上 |

- 设置页：默认策略（规则 / AI）、规则表编辑、glob 测试框、目标目录前缀。
- 会话内补充路径：智能体可以自己分组，直接按 `desktop_plan` 产出的结构执行（不依赖 `llm` 桥）。

### 5.5 AI 模式怎么拿到模型（两条路径对比）

| 路径 | 好处 | 坏处 |
|---|---|---|
| **基座新增通用 `llm` 桥（采用）** | 一键整理 / 定时任务可无会话执行；任何插件可复用；模型配置统一 | 扩大插件能力面 → 需权限 `llm` + 审计 + 成本护栏 |
| 让智能体在会话里分组（仅作补充） | 基座零改动；模型上下文最全 | 必须有人开对话；定时/一键场景用不了；失败无结构化回落 |

### 5.6 安全红线（两种模式共同）

只动 Desktop / 公共 Desktop / 插件自建目录；**只移不删**（清理 = 移入 `归档/<年月>/`）；隐藏文件与 `desktop.ini` 不动，`.lnk` 默认保留；先写 oplog 再动作；冲突改 `name (2).ext` 不覆盖；**AI 模式不获得任何额外权限**——它只产出「组名 + 成员 + 目标目录」，由规则执行器校验后执行。

## 6. 围栏（插件前端 + 基座窗口能力）

渲染页 `fence.html` 被 `pluginWindow.open({placement:'desktop'})` 打开，每显示器一个：

1. 拉 `/api/plugin/desktop-manager/fences` + `/desktop/list`（插件路由）。
2. 用 `desktopShell.fileIcon` 取图标（带缓存）。
3. 画围栏框 + 网格；空白区 `clickThrough`，围栏标题/图标区可交互。
4. 双击 → `desktopShell.openPath`。
5. 拖入文件 → 调插件 `POST /desktop/fence/:id/members`（真实移动文件）。
6. `fs.watch`（插件后端）+ WS 推 `desktop:changed` → 渲染页重算。

模式切换（围栏 / 系统桌面）：`desktopShell.setIconsVisible` + 关/开窗口；全局热键由插件在 activate 时注册（基座提供 `registerHotkey` 还是前端？→ **v1 用插件设置页里的开关 + 托盘菜单**，热键列为 P1，避免再加一个基座 API）。

## 7. 组件（插件前端，P1）

- 渲染器（clock/list/metric/status/text/link）**全在插件 bundle**，宿主不认识具体类型。
- 实例 JSON 校验器也在插件内，照 `ydash` 范式（类型白名单、契约存在、边界钳制、单实例不抛异常）。
- 层级：`desktop`（与围栏同层）/ `overlay`（置顶、全屏自动隐藏）。
- 智能体工具 `desktop_widget_set` / `desktop_widget_list` 由插件提供；`list` 回传可用类型 + config schema 供模型自描述。

## 8. 两层组件并存（P2）

1. 模型在 `plugins/installed/<id>/` 生成草稿，manifest `enabled: false`。
2. 审核页：权限清单、代码 diff、来源模型/时间；人工启用才装载。
3. 铁律：未审核草稿不可被工具调用，模型不能 self-enable。

## 9. 测试与验收

- 基座：`pluginWindow` 入口白名单（跨插件拒绝）、placement 分支、会话恢复状态机、C# 命令解析 —— node --test。
- 插件后端：规则引擎幂等性（同输入两次结果逐字段相等）、规则优先级、冲突重命名、回滚、越界拒绝；AI 输出五道校验与回落分支（伪造文件名/非法组名/超量/受保护文件/无模型）；组件校验器（照 ydash 用例）。
- 安装链路：打 `.yzp` → 卸载 → 安装 → 启用 → 围栏可用；老版本宿主安装被 `engine` 拒绝。
- 手动：杀渲染进程图标恢复；退出宿主恢复；卸载插件恢复；双屏各自围栏；100 文件流畅。

## 10. 阶段

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0-0** | 基座通用能力：`pluginWindow` + `desktopShell` + `desktop-shell` 权限 + C# 助手 + 会话恢复 | 无 |
| **P0-A** | 插件骨架 + `.yzp` 打包安装链路 + **规则引擎（默认）** + **AI 增强与回落** + 执行/回滚 | P0-0（安装与 `llm` 桥验证） |
| **P0-B** | 围栏渲染页 + 真实图标 + 拖拽 + 刷新 | P0-0、P0-A |
| **P0-C** | 联调：整理后围栏自动刷新、设置页、卸载恢复 | P0-B |
| **P1** | 组件六种渲染器 + 智能体工具 + 热键 | P0-B |
| **P2** | 代码组件审核流 + 市场分发 | P1 |
