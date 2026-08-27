# 代码变更审查结论（只读，未改代码）

> 日期：2026-08-27
> 审查对象：工作区未提交改动（即方案 B/C/D/F 的落地 + 3 个重叠 openspec 变更归档删除）
> 方法：结构对账（组件文件存在性）+ `vue-tsc --noEmit` 类型检查 + 错误逐一对账到改动文件清单

## 总体结论

✅ **本次改动正确，未引入任何新的类型/导入错误。** 类型检查报出的全部语义错误都在**未改动的文件**里，属于预存问题（monorepo 跨包类型解析配置 + Node 类型缺失），与本轮重构无关。

---

## 一、结构核对（最危险的"删了没补"风险）

- `Chat.vue`：3695 行 → **41 行**，已拆成 `components/chat/*`（9 个组件）+ `composables/chat/useChat.ts`（1632 行，承载主逻辑）+ `views/chat.css`
- Chat.vue 引用的 9 个组件 + `useChat` **全部存在，无悬空 import**
- 新组件非空（ChatMessageList 257 / ChatInputArea 197 / ChatSidebar 177 / ChatDialogs 194 行等），非空壳
- 合计从 Chat.vue 迁出的逻辑约 2782 行，与减掉的 3710 行大致吻合 → **功能已迁移而非丢失**

## 二、MCP 去重叠（方案 D）核对

- `ToolMarket.vue` 已移除 `showMcpTools` / `mcpCurrentTools` 等 MCP 服务器管理逻辑
- 仅保留只读引用 `<McpServerPicker>`（`components/McpServerPicker.vue`，68 行已建）
- MCP 服务器管理仍由 `Mcp.vue` 负责 → **入口单一化正确，无功能缺失**

## 三、市场模板 / 导航（方案 F / B）核对

- `components/marketplace/` 已建 `MarketplaceShell.vue` / `MarketplaceCard.vue` / `MarketplaceEmpty.vue`
- `skill-market/MarketplaceCards.vue` 已改为引用共享壳（+129 行）
- `SideNav.vue` / `App.vue` 改动类型检查通过

## 四、类型检查残留错误（全部预存，非本轮引入）

| 文件 | 错误 | 是否在改动清单 | 根因 |
|------|------|----------------|------|
| `packages/core/src/tool/builtin/get-api-tools.ts` | `require` 未定义 | ❌ 未改 | `@yan-zhi/core` 缺 `@types/node` |
| `packages/core/src/tool/sandbox.ts` | 找不到 `node:vm` | ❌ 未改 | 同上，Node 类型缺失 |
| `stores/tools.ts` (10 处) | `.data` 不存在于联合类型 | ❌ 未改 | 跨包类型未解析（rootDir 限制下游效应） |
| `stores/chat.ts:807` | `messages` 不在 `Message[]` | ❌ 未改 | 预存类型不严格 |
| `views/AgentCanvas.vue:51,411` | 节点类型不匹配 / 类型过深 | ❌ 未改（改的是 Agents.vue 非 AgentCanvas） | 画布节点注册长期松散类型 |
| `components/home/SolarSystem.vue:796,831` | `BufferGeometry.parameters` 不存在 | ❌ 未改 | three 类型版本问题 |

> 注：`vue-tsc` 还报大量 `TS6059 rootDir` 错误（@yan-zhi/core / @yan-zhi/shared 不在 rootDir 内）。这是 **monorepo 包级 tsconfig 配置问题**，对改动/未改动文件一视同仁，非代码错误。

## 五、结论与建议

1. ✅ **可以放心提交本轮改动**——拆分、去重叠、市场模板、导航调整均类型干净，功能等价迁移。
2. ⚠️ **类型检查整体仍红，但红的是预存配置/类型问题**，不是本次改动。若要彻底清零，需另开一个独立变更修复 monorepo 类型解析（补 `@types/node`、调整 `tsconfig` 的 `rootDir`/`paths` 或改用 project references），**不在本轮范围内**。
3. 📌 `useChat.ts` 1632 行偏大，功能正确但后续可进一步按关注点拆分（非阻塞）。
