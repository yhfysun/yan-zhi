# 为什么

产品要求（2026-10-25 拍板）：

1. **模式插件化**：除办公（应用主模式，功能不能受任何影响）外，全部模式（开发/工作流/剪辑/运维/安全/店铺运营）都要拆成插件形式，前后端都拆；后端拆不出去的部分留在基座，前端一律拆出。
2. **打包可选**：打包时可以逐个勾选包含哪些插件——皮肤插件、每个模式插件单独选、功能插件。
3. **单独打包**：插件可以单独打成 .yzp，**后期直接安装进现有应用**（用户原话："插件肯定要可以后期直接安装，要不然分开干嘛"）。

现状与需求之间有四个结构性缺口：

1. **内置插件 = 编译进主程序**：后端插件源码编译进 server 产物（`apps/server/dist`），`apps/server/src/index.ts:789-810` 硬编码注册序列，**永远全量进包**，打包无法裁剪；增删内置插件必须改注册代码。
2. **插件前端带不出去**：插件的前端视图必须预先编译进主 UI（`PLUGIN_VIEW_LOADERS` 构建期白名单），第三方 .yzp 带不进任何前端（manifest `ui` 字段声明了但全仓无消费者）。
3. **模式是构建期一等公民**：模式定义硬编码五处（`stores/mode.ts` AppMode 联合、`license.ts` EDITION_MODES、`build/modes.catalog.json`、router `MODE_ROUTE_KEYS`、`conversations.ts` VALID_MODES），新模式的"进包/授权/路由"要改五处。
4. **分发只有一条路**：换插件必须重出整个安装包；.yzp 只支持"导出源码 → 本地导入"，无版本/兼容校验。

# 改什么

**核心架构决策：把"内置插件"统一成"预构建插件包 + 运行时装载"，与 .yzp 同构。**

- 同一个插件包目录结构，三种输出：随包分发（打包脚本拷进安装包）/ 单独分发（zip 成 .yzp）/ 运行时安装（现有 `registerInstalled` 链路）。"打包是否包含" = 拷不拷目录，物理裁剪。
- **共享依赖宿主注入、不复制**：前端经 `window.__YZ_HOST__`（vue/pinia/element-plus/共享 store 白名单）+ `yz://` 自定义协议装载插件前端 bundle；后端经 `@yz/server-host` 桥（dev 直连、打包 shim 双形态）。
- **模式 = 插件运行时贡献**（manifest `contributes.mode`），放行 = 物理在包 ∩ 用户启用 ∩ 授权档（EDITION_MODES 不动）∩ 构建选择。办公（office）为基座 core 模式，永不裁剪。
- 办公模式的承重墙（Chat.vue、components/chat/**、useChat/stores/chat、conversations/messages 路由、场景系统）**一行不动**；既有守门测试全保留。

本变更按用户选定的路线落地：**运行时动态装载**（而非纯构建期组合），工程量更大但"装了就有"；同时沿用现有构建期裁剪机制做"打包时包含选择"。

# 影响

- **新增**：`build/plugins.catalog.json`（统一插件清单）、`apps/server/src/host-bridge.ts`（`@yz/server-host` dev 直连形态）、`apps/desktop/scripts/build-plugins.mjs`（插件构建器）、`apps/desktop/scripts/generate-host-shims.mjs`（共享 shim 生成）、`apps/desktop/host-shims/`（生成物）、`packages/ui/src/plugin-host-bridge.ts` + `plugin-runtime.ts`（前端桥与装载器）、`scripts/package-plugin.cjs`（单独打包）。
- **扩展**：`packages/core/src/plugin/types.ts`（manifest 增 engine/ui.entry/contributes.mode/ownedTables）、`main.cjs`（yz:// 协议）、`plugins.catalog.json` 驱动的打包脚本 `--plugins=` 选择、extraResources 按选裁剪、`verify-mode-prune` 升级 `verify-plugin-prune`。
- **逐插件迁移**（P1-P4）：9 个现有内置插件 + 6 个模式插件的前后端代码归位到 `plugins/<id>/` 目录，前端视图转独立 bundle；modes.catalog.json 在 P3 退役合并进 plugins.catalog.json。
- **不受影响**：办公模式全部功能、会话隔离 SQL（`conversation-mode.test.ts` 钉住）、授权档位语义、mobile 的 MOBILE_MODE 跳过逻辑、remote-control 的 preload `rc:*` 专用通道。

详细技术设计见 design.md，任务分解见 tasks.md。
