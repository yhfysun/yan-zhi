# 言智（yan-zhi）优化变更方案（详细 · OpenSpec 兼容）

> 日期：2026-08-27
> 定位：本文件是"方案文档"，结构对齐 OpenSpec（proposal / specs / design / tasks），确认范围后由 `openspec new change` 落地为实际变更。
> 关键纪律：**先归档建立 `specs/` 基线，再把 3 个打架的布局变更合并为 1 个，禁止再新增互相冲突的 active 变更。**

---

## 0. Skill 适用总览（每个方案都会标注）

| Skill | 作用 | 本项目是否适用 | 适用方案 |
|-------|------|----------------|----------|
| **`openspec`** | 变更管理：new / instructions / validate / archive，统一 proposal+schema | ✅ 必需 | 全部方案（A–F） |
| **`agent-browser`** | 浏览器自动化：预览页面、截图核对布局、点击验证交互 | ✅ 验证用 | B / C / D / E / F（所有 UI 类） |
| **`skill-creator`** | 把可复用模式沉淀为 Skill（如"Vue 巨页拆分""市场模板复用"） | 🟡 可选 | C / F（执行后可沉淀） |
| **`find-skills`** | 当某方案缺能力时检索更多 Skill | 🟡 按需 | 任意（兜底） |
| `makers-deploy` / `makers-cli` / `makers-*` | EdgeOne Makers 部署 | ❌ **不适用** | —（yan-zhi 是 Electron/Capacitor 本地应用，非 Makers 项目） |
| `tencent-docs*` / `tencent-pptx` / `wb-finance-skill` 等 | 文档/表格/PPT/金融 | ❌ 不适用 | — |

> 说明：本项目的实际代码实现（Vue3/TS/Rust/Node）是通用工程，**没有"写 Vue 代码"专用 Skill**。唯一直接相关的执行型 Skill 是 `openspec`（结构）+ `agent-browser`（验证）。这是实话，不编造。

---

## 方案 A：建立 specs 基线（归档已完成市场改版）【P0 · 前置】

**Why**：`openspec/specs/` 为空，所有行为定义散落在未归档变更里，导致后续改动无锚点、布局方向反复横跳。已归档的 5 个市场改版（agent/skill/tool/marketplace UI）实质已完成，应先并入基线。

**Scope**：
- 复核 `changes/archive/` 下 5 个市场改版是否真已完成（对比代码）
- 用 `openspec archive <name> --yes` 将已完成项并入 `specs/`
- 手写一份 `specs/` 基线摘要：三端共用 `packages/ui`、导航项、市场子系统边界

**Tasks**：
- [ ] 逐一对 5 个归档项做代码核对（grep 对应组件是否存在且非桩）
- [ ] `openspec archive 2026-07-28-agent-market-ui-redesign --yes`
- [ ] `openspec archive 2026-07-28-skill-market-ui-redesign --yes`
- [ ] `openspec archive 2026-07-28-tool-market-ui-redesign --yes`
- [ ] `openspec archive 2026-07-28-model-name-matching-and-chat-ui-enhance --yes`
- [ ] `openspec archive 2026-07-28-yan-zhi-platform-marketplace --yes`
- [ ] 生成 `specs/PLATFORM.md` 基线（导航/市场边界/平台适配契约）

**涉及文件**：`openspec/specs/`（新建）、`openspec/changes/archive/*`
**所需 Skill**：`openspec`（必需）
**验收**：`openspec/specs/` 非空；`openspec list --specs` 能看到平台基线；`openspec validate --all` 通过

---

## 方案 B：ui-consolidation（合并 3 个布局变更，统一设计方向）【P0】

**Why**：`optimize-page-layout`（去左栏→右上角菜单）、`optimize-mobile-responsiveness`（底部 TabBar+抽屉）、`fix-layout-regressions`（修回退）三者方向冲突且均未归档，形成"改→改坏→修"拉锯。合并为 1 个 coherent 方向：先定"导航去哪"，再统一三端。

**Design（统一方向，先决）**：
- 桌面端：保留左侧 icon 导航（52px）**或** 改为右上角菜单——二选一，本方案默认**保留左侧 dock**（回归稳定，放弃"去左栏"实验），移动端用底部 TabBar
- 建立 1 套响应式断点（xs/sm/md/lg/xl）+ 全局 CSS 变量（语义色/阴影/圆角）
- 统一 Toast 位置（右上）、统一骨架屏、统一页面切换动画
- 删除"移动适配引入的圆形无文字 FAB"回归（按钮恢复文字）

**Tasks**：
- [ ] 在 `design.md` 拍板导航形态（默认保留左 dock）
- [ ] 统一 `App.vue` 响应式断点 + CSS 变量（`packages/ui/src/App.vue` / `styles/`）
- [ ] 修复 `fix-layout-regressions` 列出的回退：按钮文字、content 对称间距、卡片列宽
- [ ] 移动端 `SideNav.vue` 底部 TabBar + 抽屉（`SideNav.vue:92-104` 已有雏形，补齐）
- [ ] 统一各页 FAB/对话框 `@media` 覆盖
- [ ] 删除原 3 个 active 变更（`optimize-page-layout` / `optimize-mobile-responsiveness` / `fix-layout-regressions`），其有效内容并入本方案

**涉及文件**：`packages/ui/src/App.vue`、`SideNav.vue`、`styles/*`、各 list 页（`Models.vue`/`Mcp.vue`/`Agents.vue`/`ToolMarket.vue`/`Skills.vue`/`Settings.vue`/`Login.vue`）
**所需 Skill**：`openspec`（必需）、`agent-browser`（验证布局/截图）、`skill-creator`（可选，沉淀"响应式布局基线"）
**验收**：三端导航形态一致且稳定；无圆形无文字按钮；`openspec validate` 通过；`agent-browser` 截图三端无重叠/无遮挡

---

## 方案 C：decompose-chat-view（拆分 Chat.vue 3695 行巨页）【P1】

**Why**：`Chat.vue` 3695 行单文件塞进会话列表+智能体列表+空间选择+批量模式+文件管理弹窗(三段)+右侧预览面板+Skill 卡片，是"乱"的首要体感源。

**Design（拆分边界）**：
- `ChatConversationList.vue`：会话列表 + 批量模式
- `ChatAgentPicker.vue`：智能体列表 + 空间选择
- `ChatFilePanel.vue`：右侧文件管理面板（预览/上传/删除）
- `ChatFileManagerModal.vue`：文件管理弹窗（已上传/中间文件/已交付 三段）
- `ChatPreviewPane.vue`：预览窗（FilePreview + BrowserPanel）
- `ChatSkillCards.vue`：Skill 卡片区
- `Chat.vue` 仅保留编排 + 消息流 + 输入栏

**Tasks**：
- [ ] 抽 `ChatFilePanel` / `ChatFileManagerModal`（原文件管理弹窗逻辑）
- [ ] 抽 `ChatAgentPicker` + `ChatConversationList`
- [ ] 抽 `ChatPreviewPane` + `ChatSkillCards`
- [ ] 主文件降行数至 < 600 行，逻辑迁移不丢功能
- [ ] 用 `agent-browser` 逐块截图回归（确保功能等价）

**涉及文件**：`packages/ui/src/views/Chat.vue`（重写）、`packages/ui/src/components/chat/*`（新建）
**所需 Skill**：`openspec`（必需）、`agent-browser`（验证等价性/截图）、`skill-creator`（可选，沉淀"Vue 巨页拆分"模式）
**验收**：`Chat.vue` < 600 行；拆出的组件单测/交互与原文等价；`agent-browser` 回归无功能丢失

---

## 方案 D：merge-tools-mcp（合并 MCP 管理入口，去除重叠）【P1】

**Why**：`ToolMarket.vue` 内部重写了 MCP 服务器增删 + 工具预览（`showMcpTools` / `mcpCurrentTools`），与 `Mcp.vue` 直接重叠——同一件事两个入口，用户困惑。

**Design**：
- MCP 服务器管理**只在 `Mcp.vue` 一处**（stdio/SSE/HTTP 全生命周期）
- `ToolMarket.vue` 仅保留"工具市场"职责：浏览/安装/启用工具；工具来源可引用 MCP server 已注册的工具，但**不重复管理服务器**
- 抽取共享 `McpServerPicker` 组件供两处复用（只读引用）

**Tasks**：
- [ ] 从 `ToolMarket.vue` 移除 MCP 服务器增删逻辑，改为引用 `Mcp.vue` 数据
- [ ] 抽 `McpServerPicker.vue` 共享组件
- [ ] 统一工具"来源"展示（内置/自定义/MCP/Skill）

**涉及文件**：`packages/ui/src/views/ToolMarket.vue`、`Mcp.vue`、`components/McpServerPicker.vue`（新建）
**所需 Skill**：`openspec`（必需）、`agent-browser`（验证两页跳转/数据一致）
**验收**：MCP 服务器无双入口；工具市场不再能增删 MCP server；`agent-browser` 走查通过

---

## 方案 E：web-platform-stubs（补齐 Web 端真桩）【P2】

**Why**：Web 端文件读写、持久化是桩，桌面 Rust MCP stdio 未实现，服务端 `api_*` 工具未接线——这些是"功能没完善好"的真桩。

**Tasks**：
- [ ] `apps/web/src/platform.ts` `WebFs`：改用 File System Access API（用户授权后）或 IndexedDB 兜底，去掉全 `throw`
- [ ] `WebDatabase`：补齐 Dexie 支持的 SQL 子集或改为明确的能力声明，去掉静默 `console.warn` 忽略
- [ ] `apps/desktop/src-tauri/src/commands/mcp.rs:41`：实现 JSON-RPC over stdio（或明确标注为"仅 SSE/HTTP 支持"并在 UI 禁用 stdio）
- [ ] `apps/server/src/mcp/api-tool-executor.ts:519`：为缺省 `api_*` 工具补实现或显式返回"不支持"清单并在智能体配置时禁用
- [ ] `packages/core/src/llm/client.ts`：标注 Anthropic embeddings 不支持，UI 层对 Anthropic 模型隐藏 embedding 相关入口

**涉及文件**：`apps/web/src/platform.ts`、`apps/desktop/src-tauri/src/commands/mcp.rs`、`apps/server/src/mcp/api-tool-executor.ts`、`packages/core/src/llm/client.ts`
**所需 Skill**：`openspec`（必需）、`agent-browser`（验证 Web 端文件/持久化行为）
**验收**：Web 端文件上传/读取可用或明确降级提示；`api_*` 工具要么可用要么 UI 禁用；无静默 `throw`/`warn` 吞错

---

## 方案 F：shared-marketplace（抽取公共市场模板）【P2】

**Why**：skills / tools / agents 各有一套"本地+远程+商城"市场脚手架，约 3 倍重复，风格易漂移。

**Design**：抽 `MarketplaceShell.vue`（搜索栏 + 分类 Tab + 卡片网格 + 本地/远程/商城切换），三处组合复用。

**Tasks**：
- [ ] 抽 `MarketplaceShell.vue` + `MarketplaceCard.vue` 通用组件
- [ ] `Skills.vue` / `ToolMarket.vue` / `Agents.vue` 改为引用通用壳，仅传数据源
- [ ] 统一空态/加载态/错误态

**涉及文件**：`packages/ui/src/components/marketplace/*`（新建）、`Skills.vue`/`ToolMarket.vue`/`Agents.vue`
**所需 Skill**：`openspec`（必需）、`agent-browser`（验证三页视觉一致）、`skill-creator`（可选，沉淀"市场模板"组件）
**验收**：三页市场区视觉/交互一致；重复脚手架代码下降；`agent-browser` 三页截图对比无风格漂移

---

## 执行顺序与依赖

```
A（建基线）──► B（统布局方向）──► C（拆 Chat）──► D（合 MCP）
                  │                    │
                  └──► F（市场模板）    └── E（补 Web 桩，可并行）
```

- A 必须先做（没有基线，B 无法判定"是否符合现状"）
- B 必须早于 C/D/F（C/D/F 的组件要在统一布局变量下写）
- E 与前三者无强依赖，可并行

## 风险与回滚

- **B 风险**：合并 3 个冲突变更易引入新回退 → 每步用 `agent-browser` 截图回归，保留 git 分支
- **C 风险**：拆页丢功能 → 先建组件再切引用，逐步验证而非一次性重写
- **E 风险**：WebFs 用 File System Access API 需用户手势授权 → 提供 IndexedDB 兜底，避免 Web 端完全不可用
- 所有方案均经 `openspec validate` 后才 `archive`，未验证不归档（避免重演 specs 空洞）
