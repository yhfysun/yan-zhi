# 言智 右栏 / 目录选择 / Git 面板 / 会话输入区 详细改造方案

> 起草：2026-09-02 · 状态：**Phase A/B/C 已全部落地（2026-09-02）**，模块 D（§6.5 会话输入区 ask_user 接管 / `/` 命令 / `@` 引用）待拍板
> 覆盖四块：① 右侧预览面板（多 tab 化 + 内置浏览器）② 工作目录选择器 ③ Git 面板 ④ 会话输入区（对标 WorkBuddy）
> 所有行号基于当前 master 工作区快照，动手前需再次核对

---

## 0. 结论摘要

| 模块 | 一句话诊断 | 核心改造 | 风险 |
|---|---|---|---|
| 右栏预览 | **不是缺功能，是数据模型错了**：3 个互斥 tab 位硬编码，无法并存 | 换成 `previewTabs[]` 数组 + `activeTabId` | 🟡 中 |
| 内置浏览器 | 能力选对了（原生 BrowserView），但**生命周期状态机有缝** | 主进程双保险 + 渲染层单一闸门 | 🟠 中高 |
| 工作目录选择 | 只有「上一级」的**单路径线性导航** | 最近使用 + 可点面包屑 + 搜索 + Git 标记 | 🟢 低 |
| Git 面板 | 是**单层列表 + 固定比例下栏**，不是树；已 fetch 的 log 没渲染 | 三视图切换 + 变更统计 + 内嵌 diff | 🟡 中 |
| 文件预览 | 4 种类型、硬编码浅色高亮主题，**深色模式炸** | 行号/复制/TOC/主题同步 | 🟢 低 |

---

## 1. 现状盘点（基于实际代码）

### 1.1 右栏预览面板

**数据模型** — `packages/ui/src/stores/chat.ts`

```ts
L176  const browserSteps = ref<Array<{action:string;result:string;time:number}>>([]);
L179  const rightPanelOpen = ref(true);              // 已于 2026-09-02 从 false 改 true
L183  const rightPanelTab = ref<'file'|'browser'|'git'>('file');   // ← 三态互斥
L185  const previewingFile = ref<{name:string;path:string}|null>(null);  // ← 只能存一个
L187  const currentBrowserUrl = ref('');             // ← 只能存一个
```

**结构性问题**：`rightPanelTab` 是三态枚举 + `previewingFile` 是单值 ref，两者组合 ⇒
**物理上不可能同时打开 2 个文件**。这不是样式问题，是数据模型上限。

**渲染层** — `components/chat/ChatPreviewPane.vue`（74 行，全文关键段）

```vue
L4   <div v-if="store.previewingFile" ... :class="{active: rightPanelTab==='file'}">      ← 文件 tab 位（唯一）
L8   <div v-if="browserActive || rightPanelTab==='browser'" ...>                          ← 浏览器 tab 位（唯一）
L12  <div v-if="hasWorkspaceDir || rightPanelTab==='git'" ...>                            ← Git tab 位（唯一，硬编码标题"Git 文件"）
L23  <div v-show="rightPanelTab==='file'"><FilePreview/></div>
L28  <div v-show="rightPanelTab==='browser'"><BrowserPanel/></div>
L32  <div v-show="rightPanelTab==='git'"><ChatGitPanel/></div>
```

**关闭逻辑写死优先级**（L55-72）：关文件 tab → 有浏览器就切浏览器，否则收面板；关 Git → 先看文件再看浏览器。
这是「三选一」模型逼出来的补丁式代码，多 tab 化后整段删除。

**写入点清单**（全部需要迁移，共 9 处）

| # | 位置 | 当前写法 | 迁移为 |
|---|---|---|---|
| 1 | `stores/chat.ts:738-741` | LLM 调 `browser_navigate` → 设 tab/url/push step | `pushTab({kind:'browser'})` |
| 2 | `useChat.ts:385-390` | watch `browserSteps.length` 联动 tab | 删除（tab 激活即隐式可见） |
| 3 | `useChat.ts:564-565` | Git 面板入口 | `pushTab({kind:'git'})` |
| 4 | `useChat.ts:687-691` | 点击链接 → 设 `currentBrowserUrl`（先置空再设以触发 watch） | `pushTab({kind:'browser', url})` + `activateTab` |
| 5 | `useChat.ts:1022-1024` | `previewInPopup` 文件弹窗预览 | `pushTab({kind:'file'})` |
| 6 | `useChat.ts:1579-1581` | `previewFile` 工作区文件预览 | `pushTab({kind:'file'})` |
| 7 | `ChatMessageList.vue:416-417` | `openInGit(path)` | `pushTab({kind:'git', path})` |
| 8 | `ChatPreviewPane.vue:55-72` | 三个 closeXxxTab 补丁 | `closeTab(id)` |
| 9 | `ChatTopbar.vue:50-59` | 下拉菜单三选项 | 改为「打开…」子菜单 |

**读取点清单**（迁移后需兼容或改读 `activeTab`）

- `BrowserPanel.vue:498` — `visible = rightPanelOpen && rightPanelTab==='browser'`
- `BrowserPanel.vue:999` — `watch(() => chatStore.currentBrowserUrl)` 触发导航
- `BrowserPanel.vue:1342` — `onNavigated` 可见性守卫
- `ChatFilePanel.vue:36` — `:class="{active: previewingFile?.path === f.path}"`
- `Chat.vue:22,57` — 拖拽 handle 与 body class 写入

### 1.2 内置浏览器（Electron 原生 BrowserView）

**主进程** — `apps/desktop/main.cjs`，`browserViews: Map<tabId, {view, cacheClearPromise, scrollbarCssKey, hidden}>`

已修（2026-09-02）：

| 位置 | 问题 | 修复 |
|---|---|---|
| `resize` handler L538 | `if (entry.hidden) return;` 墓碑闸门，hide 后无人改回 false | 移除闸门；0 尺寸走 hide 路径；始终 `setBrowserView(entry.view)` 重附 |
| `activateTab` L372 | 只 `setBounds(0,0,0,0)` 不摘除，切 tab 残留 | 先 `setBrowserView(null)` 再重附目标 |
| `closeTab` L468 | 仅 `!entry.hidden` 才摘除 | 始终先摘除 |
| `hide` handler L563 | 只有 `setBrowserView(null)` | 追加 `removeBrowserView(entry.view)` 双保险 |

**仍未解决的缝隙（方案里要补）**

1. **状态字段冗余** — `entry.hidden` 与「是否已 attach 到主窗口」是两个概念，现混用为一个字段。
   `before-input-event`（L233-239）用它拦键盘，resize/hide 用它判断可见性。建议拆成
   `entry.attached`（实际挂载态）与 `entry.visible`（业务可见态）。
2. **渲染层无单一闸门** — `BrowserPanel.vue:498` 与 `:1342` 各写一遍
   `rightPanelOpen && rightPanelTab==='browser'`，多点判断易漂移。
3. **右栏拖拽时** — `Chat.vue:22` 的 `rs-handle` 拖拽过程中 resize 高频触发，无节流。
4. **路由离开** — `Chat.vue:72` 只在 `onBeforeUnmount` hide 一次；若 window resize / 全屏切换未覆盖。
5. **Web 端分支** — `BrowserPanel.vue:154` 的 iframe 走的是另一套路径（自绘滚动条 L158-162），
   主进程加固对 Web 端无效，需分别验收。

### 1.3 工作目录选择器

**文件** — `packages/ui/src/components/WorkspaceDirDialog.vue`（312 行）

| 维度 | 现状 | 问题 |
|---|---|---|
| 导航 | 只有 `goUp()`（L219）逐级向上 + 双击进入（L35） | 8 层深的目录要双击/上移十几次；**不能跳中间层** |
| 面包屑 | L20-25，只有一个「↑」按钮 + 纯文本路径 | 路径段**不可点击** |
| 历史 | 无 | 每次从 `C:\`（L104）或 `workspace`（L106）重新开始 |
| 搜索 | 无 | 大目录（node_modules）找不到目标 |
| 列表信息 | 只有图标 + 名称（L37-42） | 无大小 / 修改时间 / 子项数 / **是否 Git 仓库** |
| 文件 | 展示但**不可选**（L205-209 只处理 isDir） | 用户点文件无反应，是"死交互" |
| 平台差异 | 桌面端 `listDirEntries`（L123）；Web 端 `readDir` + 逐个 `readDir` 判 isDir（L138-150） | Web 端 N 次 IO，大目录卡死 |
| 错误处理 | `catch` 后 `entries=[]` 静默（L157-159） | 权限拒绝 / 路径不存在时用户看到"空目录"误导 |

### 1.4 Git 面板

**文件** — `packages/ui/src/components/chat/ChatGitPanel.vue`（304 行）

| 维度 | 现状 | 问题 |
|---|---|---|
| 结构 | 工具栏 + 面包屑 + 单层文件列表 + 固定 45% 下栏（L261） | 下栏比例**写死不可调** |
| 文件导航 | 面包屑 + `fetchFileTree(repo, subPath)` 单层展开 | 不是树，无法一次看全目录结构 |
| 分支 | `el-select` 占 `flex:1`（L5）挤压其他按钮 | 分支名长时挤爆 |
| 拉/推 | 文字按钮"拉""推"（L8-9） | 无 ahead/behind 数字，用户不知道有没有东西要同步 |
| 变更列表 | checkbox + 状态字母 + path（L62-66） | 无 **+/- 行数统计**，看不到改动规模 |
| Diff | 切到 `diff` tab 才显示（L57） | 要点两下才能看到 diff，且下半区被占满 |
| 提交历史 | `fetchLog` 已调用（L134）但**结果从未渲染** | 死代码，白跑一次 IO |
| 暂存 | `staged[path]` 勾选（L97） | 无「全部暂存」/「撤销暂存」 |
| 文件类型 | `detectLanguage` 只认 js/ts/json/md（L121-127） | 其余文件无高亮 |

### 1.5 文件预览

**文件** — `packages/ui/src/components/FilePreview.vue`（145 行）

| 维度 | 现状 | 问题 |
|---|---|---|
| 类型支持 | image / pdf / text / binary 四种 | 无 csv 表格化、无 json 树、无 xlsx/docx |
| 代码高亮 | highlight.js **硬编码浅色主题** | 深色模式下黑底白字，对比度崩 |
| 大文件 | 500KB 截断到 100KB | 大 CSV/JSON 看不全且无提示 |
| PDF | 裸 `<iframe>` | 无缩放 / 页码 / 目录 |
| 元信息 | 无 | 看不到大小、修改时间、编码 |
| Markdown | markdown-it 基础渲染 | 无 TOC、无代码块复制、无 Mermaid |

---

## 2. 目标架构

### 2.1 统一的预览 tab 数据模型（核心）

替换 `stores/chat.ts:176-187` 那组分散 ref：

```ts
export type PreviewTab =
  | { id: string; kind: 'file';    name: string; path: string; }
  | { id: string; kind: 'browser'; url: string;  title: string; tabId: string; }
  | { id: string; kind: 'git';     repoPath: string; branch: string; };

const previewTabs  = ref<PreviewTab[]>([]);
const activeTabId  = ref<string | null>(null);
const rightPanelOpen = ref(true);
```

**四个 helper（store return 出去）**

| 方法 | 语义 | 幂等规则 |
|---|---|---|
| `openTab(tab: Omit<PreviewTab,'id'>)` | 打开并激活 | 同 key（file=path / browser=tabId / git=repoPath）已存在则**只激活不新增** |
| `activateTab(id)` | 激活 | id 不存在时 no-op |
| `closeTab(id)` | 关闭 | 关的是激活项则激活左邻 → 右邻 → null |
| `closeAllTabs()` | 全关 | 保留 `rightPanelOpen=true`，内容区显示空态 |

**保留的兼容字段**（避免一次性改爆）：`previewingFile` / `currentBrowserUrl` / `rightPanelTab`
改为 `computed`，从 `activeTab` 派生，只读。迁移期读取点（§1.1 表）可不改也能跑通；
`BrowserPanel.vue:498/1342` 的可见性判断改为读 `activeTabIsBrowser` computed。

### 2.2 内置浏览器生命周期：单一闸门 + 双状态

**主进程**（`main.cjs`）把 `entry.hidden` 拆成两个：

```ts
entry = { view, cacheClearPromise, scrollbarCssKey, attached: boolean, visible: boolean }
```

- `attached` — BrowserView 是否挂在 BrowserWindow 上（`setBrowserView` / `removeBrowserView` 维护）
- `visible` — 业务上是否应该可见（渲染层说了算）

**唯一收敛函数**（主进程内所有 handler 都调它，禁止各自 setBounds）：

```
applyVisibility(entry):
  shouldShow = entry.visible && hasNonZeroBounds(entry)
  if shouldShow && !entry.attached:
      mainWindow.setBrowserView(entry.view); entry.attached = true
      entry.view.setBounds(entry.pendingBounds)
  if !shouldShow && entry.attached:
      mainWindow.removeBrowserView(entry.view)      // 不是 setBrowserView(null)
      mainWindow.setBrowserView(null)               // 双保险
      entry.attached = false
```

**渲染层单一闸门**（`BrowserPanel.vue`）：

```ts
const shouldBeVisible = computed(() =>
  chatStore.rightPanelOpen && chatStore.activeTab?.kind === 'browser'
);
watch(shouldBeVisible, (v) => v ? api.resize(...) : api.hide(), { flush: 'post' });
```

配合 `ResizeObserver` 节流（100ms rAF）与 `Chat.vue` 的 `onBeforeUnmount` 兜底。

**契约**：渲染层只说「我要不要可见 + 我的矩形」，主进程负责「怎么挂 / 怎么摘」。
任何地方都不再出现 `setBounds(0,0,0,0)` 作为隐藏手段。

---

## 3. 模块 A ｜ 右侧预览面板（详细规格）

### 3.1 Tab 条视觉规格

| 项 | 规格 |
|---|---|
| 高度 | 34px（现 `.right-panel-tab` 无显式高度，靠 padding 撑） |
| 内边距 | `0 10px`，gap 6px |
| 分隔 | `border-right: 0.5px solid var(--glass-border)`，取代现在的间距 |
| 图标 | 13×13，按类型着色：文件按扩展名（md 紫 / ts-js 蓝 / json 琥珀 / 图 绿 / 其他 灰） |
| 标题 | 12px / 500 激活、400 非激活；`max-width: 200px` 省略号；**永远显示真实文件名或 hostname** |
| 关闭 × | 默认 `opacity: 0`，hover 该 tab 或激活时显示（tab 数 ≤ 1 时隐藏） |
| 激活态 | 背景 `var(--color-background-primary)` + `box-shadow: inset 0 -2px 0 var(--color-primary)` |
| 脏标记 | browser tab 有未读变化 / git tab 有变更 → 标题右侧 6px 橙点 |
| 溢出 | tab 总数宽度超容器 → 容器 `overflow-x: auto`，滚动条 3px；不再无限挤压 |
| 右侧动作 | `+`（新建：下拉选文件/网页/Git）、`›`（收起面板），24×24 图标按钮 |
| 移动端 | 保持底部抽屉形态，tab 条高度 40px（触控友好） |

**空态**（`previewTabs` 为空时）：不要 `el-empty` 占位图。改为两行引导 + 三个入口卡片
（打开文件 / 打开网页 / 打开 Git）。文案禁止"file preview"这类占位文字。

### 3.2 内容区容器

```
.preview-body           flex:1, min-height:0, overflow:hidden
  .preview-toolbar      面包屑 + 元信息 + 视图切换（32px，非激活 tab 复用同一容器）
  .preview-content      flex:1, overflow:auto
```

**关键**：三个内容组件（FilePreview / BrowserPanel / ChatGitPanel）全部用
`<KeepAlive>` 包裹 + `v-show` 切换，切 tab 不销毁状态（浏览器的滚动位置、Git 的展开目录都保留）。

⚠️ 例外：BrowserPanel 在 Electron 下是**原生图层**，不能用 `v-show`，必须靠主进程摘挂。
所以 `KeepAlive` 只对 file / git 生效，browser 走 §2.2 生命周期。

### 3.3 拖拽与尺寸

- 宽度沿用 `useResizable('chat_right', 480, 320, 1200)`（`Chat.vue:50`）
- 拖拽时**先**给 `.right-panel` 加 `.dragging { transition: none; user-select: none }`，rAF 节流 resize
- 拖拽结束再同步一次 BrowserView bounds（避免松手瞬间错位）
- 宽度 < 420px 时 tab 标题 `max-width` 降到 120px，只留图标（渐进降级）

### 3.4 迁移步骤（有序，每步可单独验证）

1. store 加 `previewTabs` / `activeTabId` / 4 helper + 3 个兼容 computed，**先不删旧字段**
2. `ChatPreviewPane.vue` 重写为多 tab 容器（tab 条 + KeepAlive 内容区）
3. 迁移写入点 §1.1 表 1-9（每改一处跑一次 typecheck）
4. 迁移读取点：BrowserPanel `shouldBeVisible`、ChatFilePanel active 判断
5. 删除 `previewingFile` / `currentBrowserUrl` / `rightPanelTab` 的写路径，只留 computed
6. 删除 `ChatPreviewPane` 三个 closeXxxTab 补丁

---

## 4. 模块 B ｜ 工作目录选择器（详细规格）

### 4.1 结构（自上而下）

| 区 | 内容 | 高度 |
|---|---|---|
| 标题栏 | 「选择工作目录」+ × | 44px |
| 最近使用 | 横排 chip，最多 5 个，持久化到 `settings.recentWorkspaceDirs` | 自动 |
| 工具行 | 「浏览电脑目录」按钮（仅桌面端）+ 搜索框 | 36px |
| 面包屑 | **每一段可点跳转**，末段为当前目录（不可点） | 32px |
| 列表 | 目录在前（含子项数 + Git 分支徽章）、文件在后（含大小/时间），**文件灰色不可点** | 300px 滚动 |
| 底栏 | 当前完整路径（等宽字体省略号）+ 清除 + 选择此目录 | 56px |

### 4.2 交互细节

- **双击进入目录**（保持现状，`@dblclick`），**单击选中目录**（保持现状）
- 新增：选中目录后**底栏实时更新路径**，「选择此目录」按钮始终可点（选中子目录时指子目录）
- 新增：面包屑任意段点击 → 直接 `loadEntries(该段路径)`
- 新增：搜索框 `debounce 200ms` 前端过滤 `entries`（只过滤当前层，不做递归搜索——避免 Web 端 IO 爆炸）
- 新增：`↑` / `Backspace` 上一级；`Enter` 进入选中目录；`Esc` 关闭
- 新增：列表项右击 → 「复制路径」（桌面端）

### 4.3 Git 标记

- 目录项右侧：若 `/.git` 存在 → 显示分支徽章（分支图标 + 分支名）
- 检测方式：桌面端 `adapter.fs.exists(path + '/.git')`；Web 端跳过（IO 太贵）
- **异步并发限制**：最多同时 8 个，避免大目录 N 次 IO 卡 UI

### 4.4 Web 端性能修复

现状（L138-150）对每个 entry 跑一次 `readDir` 判 isDir → 改为：

1. 桌面端已有 `listDirEntries` 一次返回结构化数据，走快路径
2. Web 端：优先调后端 `GET /api/fs/list?path=`（需确认是否有此端点；没有则新增，
   比前端 N 次 `readDir` 快一个数量级）
3. 兜底：保留逐个 `readDir`，但加**并发上限 6** + 首屏先渲染已解析项

### 4.5 错误处理

现状 catch 后静默置空（L157-159），改为三态提示：

| 情况 | 提示 |
|---|---|
| 路径不存在 | 「路径不存在，已回到上一级」并自动回退 |
| 权限不足 | 「无权限访问此目录」 |
| 真·空目录 | 「此目录为空」 |

---

## 5. 模块 C ｜ Git 面板（详细规格）

### 5.1 结构（自上而下）

| 区 | 内容 | 高度 |
|---|---|---|
| 仓库头 | Git 图标 + 仓库目录名 + 分支切换器 + `↓n ↑m` + 拉取 / 推送 / 刷新 | 40px |
| 视图 tab | 变更(N) ｜ 文件树 ｜ 历史 | 32px |
| 主体 | 按视图切换（见下） | flex:1 |
| 提交区 | textarea（2 行）+ 已选计数 + 全部暂存 + 提交 | 自动，仅「变更」视图显示 |

### 5.2 三个视图

**① 变更**（默认）
- 每行：`[checkbox] [状态字母] [路径] [+n] [−m]`
- 状态字母配色：`M` 琥珀 / `A` 绿 / `D` 红 / `?` 灰 / `U` 红
- **点击行 → 行下方内嵌展开 diff**（不再切 tab），再点收起
- `+n / −m` 由 `git diff --numstat` 提供（需 store 补 `fetchNumstat`）
- 已暂存 / 未暂存**分组**（现 `staged` 是前端局部状态 L97，需与后端 index 对齐）

**② 文件树**
- **真树**：el-tree，节点懒加载，带层级缩进与展开记忆
- 节点右侧 git 状态徽章（`fetchStatus` 结果按路径建 Map，O(1) 查）
- 点击文件 → 右侧内嵌内容预览（复用 CodeEditor，非下半区）
- 替代现在的「面包屑 + 单层列表」（L16-40）

**③ 历史**
- 渲染**已 fetch 但从未使用的 `gitStore.log`**（L134 白跑）
- 每行：提交信息 + 作者 + 相对时间 + 短 hash
- 点击 → 展开该 commit 的变更文件列表

### 5.3 分支切换器

- 现状 `el-select` 占 `flex:1` 挤压（L5）→ 改为**自适应宽度**（内容宽度 + 16px，最大 140px）
- 下拉项：本地分支 / 远程分支分组；顶部有「新建分支」输入行
- 切换前若有未提交变更 → 二次确认

### 5.4 拉取 / 推送

- 现状文字按钮「拉」「推」（L8-9）→ 改为图标按钮 + **数字徽章**
- `↓2 ↑3` 表示落后 2 个 / 领先 3 个提交（需 store 补 `fetchAheadBehind`）
- 拉取/推送中按钮转 disabled + 文案变为进行中态，完成后刷新状态

### 5.5 提交区

- `textarea` 占位提示「提交信息（Ctrl+Enter 提交）」
- 底部：已选 N / 总数 + 「全部暂存」 + 「提交」
- 提交后：清空输入框 + 清空 staged + 刷新三个视图

### 5.6 需要新增的 store 能力（`stores/git.ts`）

| 方法 | git 命令 | 用途 |
|---|---|---|
| `fetchNumstat(repo)` | `git diff --numstat` | 变更行 +/- 统计 |
| `fetchAheadBehind(repo, branch)` | `rev-list --left-right --count` | ↓n ↑m |
| `fetchStatusPorcelain(repo)` | `git status --porcelain=v1 -z` | 精确解析暂存/未暂存（`-z` 避免路径含空格出错） |
| `stageFiles(repo, paths)` / `unstageFiles` | `git add / reset` | 分组暂存 |
| `createBranch(repo, name)` | `git checkout -b` | 分支切换器 |
| `fetchTree(repo)` | `git ls-tree -r` 或递归读目录 | 文件树一次取全 |

---

## 6. 文件预览升级（FilePreview.vue）

| 项 | 现状 | 目标 |
|---|---|---|
| 高亮主题 | 硬编码浅色 | 跟随 `settings.darkMode`，两套 CSS 变量切换 |
| 行号 | 无 | 左侧 34px 固定列，等宽字体，`user-select: none` |
| 代码块复制 | 无 | hover 右上角出现复制按钮，仅在 `<pre>` 块 |
| Markdown | 基础渲染 | + TOC（h2/h3 抽取，右侧浮动）+ Mermaid（懒加载） |
| CSV | 按 text 渲染 | 表格化（首行为表头，>1000 行虚拟滚动） |
| JSON | 按 text 渲染 | 树形折叠（默认展开 2 层） |
| 大文件 | 500KB 截断 100KB | 提升到 2MB；超限显示「文件过大，已显示前 N 行」 |
| 元信息条 | 无 | 面包屑 + 类型徽章 + 大小 + 修改时间 |
| 视图切换 | 无 | 渲染 / 源码（Markdown 类） |

---

## 6.5 模块 D ｜ 会话输入区（对标 WorkBuddy / TraeWork）

### D.0 现状盘点（基于实际代码）

**入口组件** — `packages/ui/src/components/chat/ChatInputArea.vue`（167 行）

| 能力 | 现状 | 位置 | 与 WorkBuddy 差距 |
|---|---|---|---|
| 智能体选择 | ✅ `el-select` + 编辑按钮 | L5-26 | 形态可用，视觉待统一 |
| Skill 挂载 | ✅ popover + 角标数字 | L58-63 + `ChatSkillCards.vue` | 形态可用 |
| 文件上传 | ✅ chips 展示 | L138-150 | 无 `@` 快捷引用 |
| ask_user | ⚠️ **弹窗表单**（单选/多选/补充说明） | `useChat.ts:89-139` + `chat.ts:190-207` | **WorkBuddy 是覆盖输入框** ← 最大差距 |
| confirm_user 向导 | ⚠️ 弹窗表单（多页） | `useChat.ts:141-190` | 同上 |
| `/` 命令菜单 | ❌ 无 | — | 缺 |
| `@` 文件引用 | ❌ 无 | — | 缺 |

后端能力完备：`ask-user.ts`（`packages/core/src/tool/builtin/`）schema 已支持
`question/options/multiSelect/allowSupplement`，前端改造不涉及后端。

### D.1 ask_user：弹窗 → 输入框接管（核心改造）

**目标形态**（TraeWork 式）：`pendingQuestion` 存在时，输入框被「接管」：

```
┌──────────────────────────────────────────────┐
│ 🤖 智能体提问 · 单选                    [×跳过] │  ← 接管条（48px，主题色左边框）
│ 「用哪个方案？」                                │
│ ● 方案A  ○ 方案B  ○ 方案C   [+ 自定义回答]     │  ← 选项 chips（单选/多选）
├──────────────────────────────────────────────┤
│ [原 textarea，placeholder 变为「输入补充说明…」] │  ← 补充说明区
├──────────────────────────────────────────────┤
│ [上传][目录][MCP][Skill]      [跳过] [✈ 提交回答]│  ← 工具栏：提交替换发送
└──────────────────────────────────────────────┘
```

**状态机**（`useChat.ts` 改造）：

```ts
// 接管态 = pendingQuestion 非空（已有 store 字段，直接复用）
const askTakeover = computed(() => !!store.pendingQuestion);
// 提交逻辑复用现有 onAskSubmit 的答案组装（useChat.ts:108-126），
// 只把数据源从弹窗表单 ref 换成：chips 选中态 + input 补充说明
```

**规则：**
- 接管期间禁用普通发送（Enter 改为提交回答），`store.streaming` 逻辑不变
- 选项 chips 点击即选中（单选互斥/多选叠加），「+ 自定义回答」聚焦 textarea
- 已有 `onAskDialogClose`（关闭=未作答）语义映射到「跳过」按钮
- **弹窗不删**：`askDialogVisible` 保留但仅移动端使用（小屏 chips 放不下）
- 消息流内同步插入一条问题气泡（含用户最终回答），保证历史可追溯

### D.2 `/` 命令菜单

输入 `/` 开头时在输入框上方浮出菜单：

| 命令 | 行为 |
|---|---|
| `/agent <名>` | 切换智能体（列出 agentStore.agents，键盘上下选） |
| `/skill <名>` | 挂载/卸载 Skill（复用 mountedSkillIds） |
| `/new` | 新建会话 |
| `/model <名>` | 切换模型 |
| `/dir` | 打开工作目录选择 |

实现：ChatInputArea 内监听 `input`，`/^\/(\w*)$/` 触发浮层（绝对定位于输入框上方），
Enter 选中执行并清除命令文本，Esc 关闭。**纯前端，无后端改动。**

### D.3 `@` 文件引用

输入 `@` 触发文件浮层（同 D.2 容器）：
- 数据源：工作目录下文件（复用 WorkspaceDirDialog 的列目录能力，扁平模糊匹配前 20 项）
- 选中后在 textarea 插入 `@文件名` token，发送时自动把该文件加入 uploadedFiles
- 无工作目录时提示「先设置工作目录」

### D.4 视觉统一（WorkBuddy 靠齐）

- 智能体选择从 `el-select` 改为**头像 + 名称的下拉卡片**（含 description 第二行）
- 工具栏按钮统一 28×28、8px 圆角、hover 浮起；角标改为右上角 14px 圆点数字
- 接管条用 `--color-primary` 3px 左边框 + 浅色底，与普通输入态明显区分
- 文件 chips 加类型图标（按扩展名着色，同 §3.1 tab 图标规则）

### D.5 分期

| # | 内容 | 风险 |
|---|---|---|
| D1 | ask_user 接管态（store 复用 + ChatInputArea 接管 UI） | 🟢 低（不动后端） |
| D2 | `/` 命令菜单 | 🟢 低 |
| D3 | `@` 文件引用 | 🟡 中（列目录 IO） |
| D4 | 视觉统一 | 🟢 低 |

验收：ask_user 触发后不弹窗、输入框直接变接管态、chips 选择 + Enter 提交、
流内可看到问答记录；移动端仍走弹窗。

---

## 7. 分期与风险

### Phase A（🟢 低风险，约 0.5~1 天）

| # | 内容 | 文件 |
|---|---|---|
| A1 | 主进程 `applyVisibility` 收敛 + `attached/visible` 拆分 | `apps/desktop/main.cjs` |
| A2 | 渲染层单一闸门 `shouldBeVisible` + resize 节流 | `BrowserPanel.vue` |
| A3 | FilePreview：深色主题同步 + 行号 + 代码块复制 | `FilePreview.vue` |
| A4 | 目录选择：可点面包屑 + 搜索 + 错误三态 | `WorkspaceDirDialog.vue` |

### Phase B（🟡 中风险，约 1~2 天）

| # | 内容 | 文件 |
|---|---|---|
| B1 | store 多 tab 数据模型 + 4 helper + 兼容 computed | `stores/chat.ts` |
| B2 | `ChatPreviewPane` 重写为多 tab 容器 + KeepAlive + 空态 | `ChatPreviewPane.vue` |
| B3 | 写入点迁移（§1.1 表 1-9） | `useChat.ts` / `ChatMessageList.vue` / `ChatTopbar.vue` |
| B4 | 读取点迁移 + 删除兼容字段写路径 | `BrowserPanel.vue` / `ChatFilePanel.vue` |
| B5 | Tab 条 CSS 规格（§3.1） | `views/chat.css` |

### Phase C（🟡 中风险，约 1~2 天）

| # | 内容 | 文件 |
|---|---|---|
| C1 | Git store 新增 6 个能力（§5.6） | `stores/git.ts` |
| C2 | Git 面板三视图重写 | `ChatGitPanel.vue` |
| C3 | FilePreview CSV/JSON/大文件/元信息 | `FilePreview.vue` |
| C4 | 目录选择：最近使用 + Git 标记 + Web 端性能 | `WorkspaceDirDialog.vue` / `stores/settings.ts` |

### 风险分级

| 风险 | 级别 | 缓解 |
|---|---|---|
| 多 tab 化动到 LLM 工具链 `browser_navigate` 桥接 | 🟠 高 | B3 每改一处跑 `vue-tsc --noEmit`；保留 `currentBrowserUrl` computed 兼容 |
| BrowserView 桌面端残留（Windows GPU） | 🟠 高 | A1/A2 后需**真机冷启动复现**（低端 Windows + 关闭 GPU 两种场景） |
| Git store 改动影响 `/browser`、`GitExplorer.vue` 另一处调用方 | 🟡 中 | 先 grep 全部 `useGitStore` 调用点；只增方法不改签名 |
| Web 端 iframe 路径与主进程加固不共享 | 🟡 中 | 验收清单分桌面 / Web 两套 |
| KeepAlive 缓存 BrowserPanel 导致状态错乱 | 🟡 中 | browser **不进** KeepAlive（§3.2 已标注例外） |

---

## 8. 验收清单

### 桌面端（Electron）

- [ ] 打开 2 个文件 + 1 个网页 + 1 个 Git，四个 tab 并存且标题为真实名
- [ ] 切 tab 后文件滚动位置保持、Git 展开目录保持、网页不重载
- [ ] 关闭中间 tab → 激活右邻；关闭激活 tab → 激活左邻
- [ ] **收起右栏 → 网页图层彻底消失（可见区域无任何残留）**
- [ ] **再展开右栏 → 网页正常回来且可交互**
- [ ] 切到「文件」tab 时网页不可见；切回时网页仍在原滚动位置
- [ ] 拖拽右栏宽度过程中网页跟随不撕裂；松手后 bounds 对齐
- [ ] 从 `/chat` 路由跳 `/settings` → 网页不残留
- [ ] 关闭 GPU 加速（`--disable-gpu`）下重跑以上 4 条

### Web 端

- [ ] iframe 预览路径不受主进程改动影响（回归）
- [ ] 自绘滚动条仍正常（L158-162 区域）

### 目录选择

- [ ] 面包屑中间段可点跳转
- [ ] 搜索过滤当前层生效（200ms debounce）
- [ ] 目录带 Git 分支徽章（桌面端）
- [ ] 权限不足 / 路径不存在有明确提示（不再是"空目录"）
- [ ] 最近使用 chip 持久化，重开应用仍在

### Git

- [ ] 变更列表显示 `+n / −m`
- [ ] 点击行内嵌展开 diff，不再切 tab
- [ ] 分支切换器自适应宽度，可新建分支
- [ ] `↓n ↑m` 正确反映 ahead/behind
- [ ] 历史视图有内容（不再白跑 fetchLog）
- [ ] 文件树为可展开层级的树，非面包屑单层

---

## 9. 明确不做

- ❌ 不动 BrowserView 的存在性（仍是原生 BrowserView，不退化成 iframe —— 那是能力倒退）
- ❌ 不动 LLM / MCP / 工具后端调用链（B3 只改前端 store 与渲染层）
- ❌ 不新增用户侧提示气泡、引导 tip、浮动按钮（用户明确偏好）
- ❌ 不重写 `stores/git.ts` 已有方法签名，只新增
- ❌ 目录选择不做递归全盘搜索（Web 端 IO 代价不可接受）
