# 导航与工具信息架构优化方案（2026-09-05）

## 现状问题

### 问题 1：桌面端「更多」菜单 12 项平铺

`apps/desktop/src/components/TitleBar.vue:147` 的 `moreMenus`：

| # | 入口 | # | 入口 |
|---|---|---|---|
| 1 | 知识库 | 7 | 智能体 |
| 2 | 模型平台 | 8 | IM 连接 |
| 3 | MCP 连接 | 9 | 数据源 |
| 4 | 工具 | 10 | 本体管理 |
| 5 | Skill | 11 | SQL 控制台 |
| 6 | Skill 蒸馏 | 12 | 客户端节点 |

再加记忆管理、插件管理、设置，以及插件动态注入项 —— 单层下拉 15+ 项，无分组、无层级，远超 7±2 的短时记忆容量。

### 问题 2：工具与 MCP 职责重叠

`/tools`（`views/ToolMarket.vue`，标题"工具管理"）顶部有一个 **MCP 服务只读概览区**（13-28 行），列出全部 MCP 服务器（`McpServerPicker`），并挂「前往管理」跳 `/mcp`。

而 `/mcp`（`views/Mcp.vue`，711 行）是完整的 MCP 管理页：新增服务、连接/断开、工具列表、资源、提示词、连接日志。

**同一个 MCP 服务器在两个页面各出现一次**，用户无法判断"我该去哪配"。根因：MCP 既是**工具的来源**，又是**需要独立管理的外部连接**，两个身份没有收敛。

---

## 方案 A：「更多」菜单分类 + hover 下一级

### A1. 分组结构（12 项 → 3 组，每组 ≤5）

| 分组 | 成员 | 语义 |
|---|---|---|
| **能力** | 智能体、Skill、Skill 蒸馏、工具（含 MCP） | AI 能做什么 |
| **数据** | 知识库、数据源、本体管理、SQL 控制台 | AI 知道什么 |
| **连接** | 模型平台、IM 连接、客户端节点 | 接了哪些外部系统 |

分隔线以下保持独立：记忆管理、插件管理、设置。

若方案 B 采纳「MCP 并入工具」，「能力」组为 4 项，菜单入口从 12 降到 11。

### A2. 交互：hover 展开二级

与聊天输入区「+」菜单（`ChatInputArea.vue:140` 的 `hoverSub` 实现）保持一致的交互：

- hover 一级项 → 右侧展开二级面板（`absolute left: calc(100% + 8px)`）
- 二级面板顶部固定显示分组名 + 该组项数
- `mouseleave` 150ms 延迟关闭，避免鼠标斜穿时误关
- 一级项带 `ArrowRight` 箭头指示可展开
- 点击一级项 = 展开二级（等同 hover，兼容触屏）

### A3. 需要抽的组件

现状：hover 子菜单逻辑写在 `ChatInputArea.vue` 内部，TitleBar 是 `apps/desktop` 下的组件，无法直接复用。

**新增 `packages/ui/src/components/HoverMenu.vue`**，把现有逻辑参数化：

```ts
interface HoverMenuItem {
  label: string;
  icon?: Component;
  path?: string;        // 叶子节点：路由
  desc?: string;        // 右侧次要说明
  children?: HoverMenuItem[];
}
```

Props：`items`、`width`、`placement`；Events：`@select(item)`。

收益：TitleBar「更多」与聊天「+」菜单交互完全统一，后续新增入口只需往 `items` 里加数据。

> 是否顺带把 `ChatInputArea` 迁到 `HoverMenu`：建议**单独排期**，不阻塞本次。当前 plus 菜单已能正常工作，迁移动作有回归风险。

---

## 方案 B：工具与 MCP 收敛

### B1（推荐）MCP 并入工具页，改为一级 tab

`/tools` 页面标题改为「工具与连接」，顶部三 tab：

| Tab | 内容 | 来源 |
|---|---|---|
| 工具库 | 内置工具（分组折叠）+ 自定义工具（增删改） | 现 `/tools` 本地商城 |
| MCP 服务 | 服务器卡片、连接/断开、工具/资源/提示词/日志 | 现 `/mcp` 全部内容 |
| 远程商城 | 远程工具商城列表与进入 | 现 `/tools` 远程商城 |

- `/mcp` 路由保留，重定向到 `/tools?tab=mcp`（兼容已有链接、插件注入、外部跳转）
- 「更多」菜单删除「MCP 连接」项
- `views/Mcp.vue` → 改造为 `components/McpPanel.vue`（去掉 `page-top` 外壳），由 ToolMarket 条件渲染

优点：彻底消除同一对象两处入口；用户心智模型统一为"我能调用什么 + 从哪来"；菜单少一项。

成本：`Mcp.vue` 711 行含 6 个弹窗，去外壳改造需逐项验证弹窗在 tab 内的 z-index 与 teleport 行为。

### B2 各自独立，工具页删掉 MCP 概览区

- `/tools` 只管工具，删除顶部 MCP 只读区（13-28 行）
- `/mcp` 保持独立管理页
- 菜单保留两项但语义清晰：**工具 = 可调用的函数；MCP = 提供函数的连接**

优点：改动最小（删 16 行）。缺点：用户要给智能体挂 MCP 工具时，需自行知道先去 `/mcp` 连服务器。

### B3 工具页的 MCP 区升级为可管理

保留概览区，但把只读卡片升级为支持行内连接/断开/新增，详情仍跳 `/mcp`。

优点：不改动 `/mcp`。缺点：**同一对象仍有两处入口**，只是其中一处变强了，重叠问题未根治。不推荐。

---

## 实施顺序（若采纳 A + B1）

1. 抽 `HoverMenu.vue`（packages/ui/src/components/）
2. TitleBar `moreMenus` 改为分组数据 + 接入 HoverMenu，删除 MCP 项
3. `Mcp.vue` → `McpPanel.vue`（去外壳）
4. `ToolMarket.vue` 加三 tab，接 McpPanel，删顶部只读概览区
5. 路由：`/mcp` → 重定向 `/tools?tab=mcp`
6. 回归：
   - MCP 六个弹窗在 tab 内的 z-index / teleport
   - 插件注入项（`TitleBar.vue:170` `pluginMenus`）在分组菜单里的落位
   - 移动端 TabBar 是否同步（当前 TabBar 只有 4 项，不含工具/MCP）
   - `vue-tsc --noEmit`（packages/ui + apps/web）+ 桌面端实机点一遍

## 实施记录（2026-09-05 已落地 A + B1）

用户决策：B1 并入工具页；分组按「能力 / 数据 / 连接」；聊天「+」菜单本次不迁移（单独排期）。

- ✅ `packages/ui/src/components/HoverMenu.vue`：通用分组 hover 二级菜单（items 树 + 150ms 延迟关闭 + 触屏点击展开 + divider/check 支持，自含样式不依赖 chat.css）
- ✅ `apps/desktop/src/components/TitleBar.vue`：「更多」改为三组 hover 二级 + 底部独立项；**删除 MCP 连接项**；popper 样式自带（不再依赖聊天页的 plus-menu-popper）；插件注入项落分组底部
- ✅ `packages/ui/src/components/McpPanel.vue`：原 Mcp.vue 去外壳（page-top → 工具栏），新增按名称过滤（原搜索框是死的）、`focusServerId` prop 支持深链
- ✅ `views/Mcp.vue` 已删除；路由 `/mcp` → 重定向 `/tools?tab=mcp`，`/mcp/:id` → `/tools?tab=mcp&focus=<id>`
- ✅ `views/ToolMarket.vue` 重构为三 tab（工具库 / MCP 服务 / 远程商城）：本地商城内容直出（少一层钻入）、远程商城 tab 内钻入；删除顶部 MCP 只读概览区与 McpServerPicker 引用
- ✅ `SettingsDrawer.vue`：mcp 分区并入 tools 分区（改「工具与连接」）；App.vue ROUTE_TITLES 同步
- 遗留：Home 页「MCP 连接」瓦片保留（点击走 /mcp 重定向）；ChatMountDialog「前往配置」走重定向；`/tools` 三 tab 在桌面端实机冒烟未做
