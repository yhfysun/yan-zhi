# Context

本变更依赖第一批 `redesign-chat-and-nav` 已落地的 5 项导航与设置抽屉骨架。当前 IM 能力缺口（已在 proposal 逐条查证）：
- 后端 `im.ts` 路由只有 connectors CRUD / 单发 / inbound webhook，无 OAuth 生命周期、无 conversations 会话 API。
- 服务层只有应用级 `tenant_access_token` / `gettoken`，无用户 OAuth（code 换 token）。
- `BrowserPanel` 仅导航，无回调拦截。
- 前端 `/peers`（节点轮询）、`/connections`（配置+单发）均非完整 IM 中枢，无会话列表/历史数据模型。

本变更补齐上述能力。第一批已明确：IM 中枢与 OAuth **不在第一批**，本文件是其落地设计。

# Goals / Non-Goals

**Goals:**

- 建立 IM 会话数据模型 + API（内置/微信/飞书三类会话的列表、历史、收发）。
- 微信/飞书接入支持 OAuth 授权（方案 A 或 B，决策 1 拍板；推荐 B 起步）。
- `ChatHub.vue` 由占位升级为完整 IM 中枢（内置/微信/飞书切换，内置纯 IM 不调 AI）。
- 设置「聊天」面板含默认模式 + 授权状态；「IM 连接」面板承载绑定。

**Non-Goals:**

- 不重写对话页（LLM）逻辑。
- 不做微信/飞书官方 SDK 深度封装；仅做 OAuth 授权流 + 凭证持久化 + 会话拉取/收发。
- 不处理企业微信/飞书机器人 Webhook 之外的消息推送通道（inbound 已存在，保持）。
- 扫码登录（微信网站应用 QR Connect）仅在已配网站应用时支持；无资质时走网页授权/手动回填。

# Decisions

## 1. OAuth 落地方式（必须先拍板）

**推荐 (B) 手动授权码回填**作为首批落地，理由：
- 无需公网 `redirect_uri` 回调域名（本地应用难配）；
- 不依赖 `BrowserPanel` 原生回调拦截（当前不支持，`BrowserPanel.vue:432` 仅 `navigate`）；
- 风险与后端改动最小，可立即工作；
- 升级路径清晰：后续如需无感授权，再加方案 A 的回调端点与 BrowserPanel 拦截。

若选 (A) 完整后端 OAuth，需额外：① 后端 `GET /api/im/oauth/:provider/start` 返回授权 URL+state（state 防 CSRF，存会话/keyring）；② `GET /api/im/oauth/:provider/callback` 接收 code→换 token→持久化；③ `BrowserPanel` 拦截 `redirect_uri` 并把 code 回传前端（经 `electronAPI` 或 postMessage）。

**无论 A/B，凭证持久化走 keyring/DB，与现有 `adapter.keyring` 一致（非 localStorage）。**

## 2. IM 会话数据模型

新增（后端）会话实体，区分 `channel`：`builtin` / `wechat` / `feishu`。
- `conversations`: `{ id, channel, peerId/accountId, title, lastMessageAt, unread }`
- `messages`: `{ id, conversationId, role: user|peer|system, content, createdAt }`
- 内置（builtin）消息存本地（DB 或 keyring 命名空间）；微信/飞书在绑定后按需从平台拉取/经 inbound webhook 写入。
- API：`GET /api/im/conversations`、`POST /api/im/conversations`、`GET /api/im/conversations/:id/messages`、`POST /api/im/conversations/:id/messages`（内置走本地；微信/飞书经现有 send 通道）。

## 3. 前端 IM 中枢 ChatHub.vue（升级占位）

顶栏分段控件 `内置(默认)/微信/飞书`：
- **内置**：读 `conversations`(channel=builtin) 渲染会话列表+消息区，发送走 `POST .../messages`，**不调用 AI**。
- **微信/飞书**：未绑定→引导「去 设置 → IM 连接 绑定」；已绑定→渲染对应 channel 会话（拉取/历史）。
- 复用第一批已建的「聊天」导航项与 `/chat-hub` 路由占位。

## 4. 设置面板

- 「聊天」面板：默认模式（内置/微信/飞书）+ 微信/飞书「去授权」按钮（绿点=已绑定/灰点=未绑定）。方案 B 下按钮=在内置浏览器打开授权页并提示「复制 code 回填」；方案 A 下按钮=拉起授权、回调自动写回。
- 「IM 连接」面板：在现有 `Connections.vue` 连接器 CRUD 基础上，增加「用户 OAuth 绑定」维度（与应用级 `tenant_access_token` 区分），写入用户凭证。

# Risks / Trade-offs

- **OAuth 方式未定**：决策 1 必须先拍板，否则后端端点无法定稿（推荐 B）。
- **回调域名**：方案 A 需公网/内网可回调地址，本地桌面难配，是 A 的主要阻力；B 规避。
- **凭证安全**：用户 OAuth token 走 keyring 持久化，避免明文落库；刷新 token 策略（微信/飞书有效期）需设计。
- **会话数据来源**：微信/飞书会话历史依赖平台 API 权限，可能仅能拉近期；明确范围避免过度承诺。
- **与 `/peers` 区分**：`/peers` 是节点间通信，IM 中枢是用户面向 IM 账号，数据模型独立，不混用。

# 验证（落地后）

- `openspec validate --all`
- `pnpm --filter @yan-zhi/server typecheck` 与 `pnpm --filter @yan-zhi/ui typecheck`
- `agent-browser` 核验：ChatHub 三模式、内置收发（无 AI）、微信/飞书授权流（A 回调或 B 手动回填）、设置面板绑定状态、三端。
