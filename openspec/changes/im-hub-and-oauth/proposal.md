# 为什么

`redesign-chat-and-nav`（第一批）已将主导航收敛为 5 项，但刻意**不构建 IM 消息中枢与微信/飞书 OAuth 授权流**——因为当前代码不具备这两项能力，强行在第一批「不新增后端」前提下塞入会自相矛盾（详见第一批 design.md 风险与用户评审）。本变更（第二批）承接被抽出的范围，明确补齐缺口。

经代码核查，现状缺口如下：
- 后端 `apps/server/src/routes/im.ts` 仅有 connectors **CRUD / 单发消息 / inbound webhook**，无 OAuth 发起、无 `redirect_uri` 回调、无 code 换 token、无用户凭证持久化（`im.ts:16-57`）。
- 服务层 `apps/server/src/services/im.ts` 只有飞书/企业微信的 `tenant_access_token` / `gettoken`（应用级凭证，`im.ts:193,206`），**不是用户 OAuth**。
- `BrowserPanel.vue` 仅导航与 BrowserView 加载，无授权回调拦截或写回设置（`BrowserPanel.vue:432`）。
- 前端 `/peers` 是节点间轮询发消息（无应用自有会话列表，`Peers.vue:174`）、`/connections` 是连接器配置 + 一次性发消息（无微信/飞书会话列表，`Connections.vue:5`）——均不是完整 IM 中枢，需新建数据模型与 API。

# 改什么

1. **IM 会话数据模型与 API（后端新增）**：内置/微信/飞书三类会话的会话列表、消息历史、收发。至少新增 `GET/POST /api/im/conversations`、`GET/POST /api/im/conversations/:id/messages`；内置模式走本地存储，微信/飞书模式在绑定后拉取对应平台会话。
2. **微信/飞书 OAuth 授权流（后端新增）**：二选一，落地前必须拍板（见决策 1）：
   - **(A) 完整后端 OAuth**：新增 `GET /api/im/oauth/:provider/start`（返回授权 URL + state）、`GET /api/im/oauth/:provider/callback`（接收 `redirect_uri`、用 code 换 token、持久化用户凭证到 keyring/DB）。
   - **(B) 手动授权码回填（推荐首批）**：不建回调端点，前端「去授权」按钮在内置浏览器打开平台授权页，用户复制 `code`/授权结果手动粘贴回设置面板，前端调 `POST /api/im/connectors` 写入凭证。风险低、无需公网回调域名，后续可平滑升级到 (A)。
3. **BrowserPanel 授权回调拦截（仅方案 A 需要）**：拦截 `redirect_uri` 并回写凭证/code；方案 B 不需要。
4. **前端 IM 中枢 `ChatHub.vue`（由占位升级为完整）**：顶栏分段控件 `内置(默认)/微信/飞书`；内置=应用自有会话+消息区（纯 IM，不调 AI）；微信/飞书绑定后接入对应会话；未绑定引导去设置。
5. **设置「聊天」面板升级**：默认模式选择 + 微信/飞书「去授权」按钮（绿/灰点）+ 绑定状态；「IM 连接」面板承接账号绑定。

# 影响

- `apps/server/src/routes/im.ts`：新增 OAuth 与 conversations 路由（方案 A 或 B 决定具体端点）。
- `apps/server/src/services/im.ts`：新增用户 OAuth（code 换 token）、conversations 读写；保留现有 `tenant_access_token` 应用级逻辑。
- `packages/ui/src/components/BrowserPanel.vue`：方案 A 需加回调拦截（方案 B 不改）。
- `packages/ui/src/views/ChatHub.vue`：由占位升级为完整 IM 中枢。
- `packages/ui/src/stores/settings.ts`：新增 IM 绑定状态 / 默认聊天模式字段（持久化仍走 keyring）。
- 依赖第一批 `redesign-chat-and-nav` 已落地（导航 5 项 + 设置抽屉骨架），本变更在其「聊天」占位与「IM 连接」面板之上构建。

# 与第一批及旧变更的关系

- 依赖 `redesign-chat-and-nav`（第一批）已落地导航 5 项与设置抽屉骨架；本变更填充其「聊天」占位与「IM 连接」面板。
- 复用 `connections` 连接器 CRUD 作为绑定基座，但新增用户 OAuth 维度（与应用级 `tenant_access_token` 区分）。
- 不改动对话页（LLM）、市场/工具/MCP 业务逻辑。

# 所需 Skill 标注

- **`openspec`**（必需）：编写与 `openspec validate` 校验。
- **`agent-browser`**（必需，落地后）：对 IM 中枢三模式、OAuth 授权流（内置浏览器拉起/回调或手动回填）截图核验。
- **`skill-creator`**（可选）：沉淀「本地应用接入 IM OAuth（回调 vs 手动回填权衡）」模式。
- ❌ **Makers 系列不适用**：本地 Electron/Capacitor 应用。
