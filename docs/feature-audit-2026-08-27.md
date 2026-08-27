# 言智（yan-zhi）功能审计与页面整治分析

> 分析日期：2026-08-27
> 方法：基于源码实地核查 + OpenSpec 变更状态梳理
> 结论先行：**功能数量本身并不离谱（三端共用一份 `packages/ui`，约 20 条路由 / 13 个导航项），真正的问题是「单页过载 + 功能重叠 + 4 个互相打架的布局变更从未归档」，这才是"乱"的体感来源。**

---

## 一、项目结构真相（先澄清一个误解）

三端不是三套 UI，而是**同一个 Vue3 SPA（`packages/ui`）被三个薄壳导入**：

- `apps/web/src` 仅 2 文件、`apps/desktop/src` 仅 4 文件、`apps/mobile/src` 仅 2 文件
- 三端共用 `packages/ui/src` 的全部 views/components/router/stores，仅通过平台适配器（`*Adapter`）和 CSS 变量切换布局

所以"功能太多"是**同一份功能集的体感**，不是 3 倍膨胀；"页面乱"的根因全部在 `packages/ui` 内部。

---

## 二、功能完成度清单（基于真实代码）

### ✅ 已完成（主体可用，无需误报）

| 功能 | 文件 | 说明 |
|------|------|------|
| 首页 / 登录 | `Home.vue` / `Login.vue` | 完成 |
| 会话 / 智能体列表 / 空间 | `Chat.vue` | 功能完整（但单页过载，见下） |
| 伙伴（Peers） | `Peers.vue` | 完成，空态 `el-empty` |
| 连接（飞书/企微） | `Connections.vue` | 完成 |
| 知识库 | `Knowledge.vue` | 完成 |
| 模型 / 平台 | `Models.vue` / `PlatformDetail.vue` | 完成 |
| MCP 服务器 | `Mcp.vue` | stdio/SSE/HTTP 三种，完成 |
| 技能市场 | `Skills.vue` | 完成（本地+远程+商城） |
| 技能蒸馏 | `SkillDistill.vue` | 三屏蒸馏 UI，完成 |
| 智能体画布 | `Agents.vue` / `AgentCanvas.vue` | DAG 工作流编辑器，9 类节点，完成 |
| 内置浏览器 | `Browser.vue` → `BrowserPanel.vue` | 桌面端完整（收藏/历史/AI 分析） |
| 设置 | `Settings.vue` | 完成 |
| **服务端 LLM 双协议** | `packages/core/src/llm/client.ts` | OpenAI + Anthropic 均实现 |

### 🟡 半完成 / 受适配器限制（功能被悄悄削弱）

| 问题 | 位置 | 影响 |
|------|------|------|
| **Web 端文件系统是桩** | `apps/web/src/platform.ts:164-170` `WebFs.read/writeFile` 全部 `throw "Web 端文件系统访问需要用户授权"` | Web 端文件读写实质不可用，只有桌面（Node fs）/ 移动（Capacitor）能用 |
| **Web 端持久化是伪 SQL** | `apps/web/src/platform.ts:111,118` `WebDatabase` 对不支持 SQL `console.warn` 静默忽略 | Web 端 DB 能力受限，store 里 `agent.ts:234` 为此加了占位补丁 |
| 桌面 Rust MCP stdio 桩 | `apps/desktop/src-tauri/src/commands/mcp.rs:41` `// TODO: 实现完整的 JSON-RPC over stdio 协议` | 桌面 MCP stdio 未真正打通 |
| 服务端 API 工具未接线 | `apps/server/src/mcp/api-tool-executor.ts:519` `default: return fail('未实现的 API 工具')` | 仅显式 case 的 `api_*` 工具可用，其余直接报错，限制 agent 可调工具 |
| Anthropic 不支持 embeddings | `packages/core/src/llm/client.ts:330-343` | 仅 OpenAI 有 embeddings |

### 🔴 真正的半成品（注意与"合理 disabled 守卫"区分）

> grep 命中的 `:disabled` 绝大多数是合理前置守卫（未连接 / 流式生成中 / 无模型），**不是**半成品。上面 🟡 表的 5 项才是真桩。

---

## 三、"页面乱"的 5 大根因

1. **单页过载（最严重）**：`Chat.vue` **3695 行** 一个文件塞进会话列表 + 智能体列表 + 空间选择 + 批量模式 + 文件管理弹窗（三段分类）+ 右侧预览面板 + Skill 卡片。`SkillDistill.vue` 1123 行、`AgentCanvas.vue` 915 行、`ToolMarket.vue` 1003 行。这些是"乱"的主因。

2. **功能重叠**：`ToolMarket.vue` 内部重写了 MCP 服务器增删 + 工具预览（`showMcpTools` / `mcpCurrentTools`），与 `Mcp.vue` 直接重叠——同一件事两个入口。

3. **三套市场模板重复**：skills / tools / agents 各自有一套"本地 + 远程 + 商城"市场脚手架，重复约 3 倍代码，UI 风格易漂移。

4. **三端功能可见性不一致**：`SideNav.vue:60,95` 在 web/移动隐藏 `/browser` 与 `/mcp`，桌面全开。同一份 UI 在不同端露出不同功能，给人"混乱"感。

5. **⚠️ OpenSpec 规格空洞 + 4 个互相打架的布局变更**（元问题，见第四节）。

---

## 四、元问题：OpenSpec 本身也"乱"了

- `openspec/specs/` **目录为空** → 没有"源真相规格"，所有行为定义散落在未归档变更里。
- 当前 4 个 **active** 变更：`optimize-page-layout`、`optimize-mobile-responsiveness`、`fix-layout-regressions`、`improve-agent-tool-system`。
- 其中前 3 个**高度重叠且方向相互冲突**：
  - `optimize-page-layout` 想把左侧导航**移除**、收纳到右上角圆形菜单；
  - `optimize-mobile-responsiveness` 又要在移动端用**底部 TabBar** + 抽屉；
  - `fix-layout-regressions` 是在修"移动端适配"引入的回退（按钮变纯图标、间距不对称）。
  - 三者形成"改 → 改坏 → 修"的拉锯，且无统一设计基线，所以视觉上反复横跳。
- 已归档的 5 个变更全是"市场 UI 改版"（agent/skill/tool/marketplace），说明团队已多次做局部 UI 整治，但**从未把它们归档进 `specs/`**，导致基线一直没建立。

---

## 五、优化优先级路线图（建议）

| 优先级 | 动作 | 收益 |
|--------|------|------|
| P0 | **归档已完成的 5 个市场改版 → 建立 `specs/` 基线**，再决定布局方向 | 结束"无真相"状态，后续改动有锚点 |
| P0 | **合并 3 个布局变更为 1 个 coherent 设计方向**（先定"导航去哪"，再统一 web/桌面/移动） | 消除反复横跳，根治"乱" |
| P1 | **拆分 `Chat.vue`**：把文件管理弹窗、预览面板、智能体列表抽成独立组件/子视图 | 3695→可控，降低"乱"的体感 |
| P1 | **合并 `/tools` 与 `/mcp` 的 MCP 管理**：MCP 服务器只在一处管理，工具市场只管工具 | 去掉重叠入口 |
| P2 | **抽公共市场模板**：skills/tools/agents 共用一套 marketplace 组件 | 去 3 倍重复，统一风格 |
| P2 | **补齐真桩**：WebFs 用 File System Access API / IndexedDB、Rust MCP stdio、服务端 `api_*` 工具接线 | 让 web/桌面功能真正可用 |
| P3 | 统一三端功能可见性策略（明确哪些功能天然仅桌面） | 减少"不同端看到不同东西"的困惑 |

---

## 六、基于 OpenSpec 的下一步建议（待你确认范围）

1. **`openspec archive`** 已完成的 5 个市场改版，生成 `specs/` 基线。
2. **新建 1 个 `ui-consolidation` 变更**，吸收并替代 `optimize-page-layout` / `optimize-mobile-responsiveness` / `fix-layout-regressions`，先写一份统一的导航/布局 design 再动手。
3. **新建 `decompose-chat-view` 变更**，把 `Chat.vue` 拆成可维护组件。

> 以上 1-3 都是范围决策，建议先确认方向再执行，避免又产生一个互相冲突的 active 变更。
