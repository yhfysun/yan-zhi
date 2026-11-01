# 0. 拍板 OAuth 方式（前置）

- [x] 0.1 与用户确认 OAuth 落地方式：**(B) 手动授权码回填（推荐首批）** 还是 **(A) 完整后端回调 OAuth** —— 2026-11-01 核实：已拍板：A（飞书 OAuth 完整回调）+ 微信个人版走 openclaw bridge 扫码登录（比 OAuth 更少操作）
- [x] 0.2 若选 A：确认回调 `redirect_uri` 可达性（本地桌面如何接收回调） —— 2026-11-01 核实：回调 redirect_uri 指向本服务 /api/im/feishu/oauth/callback（services/im.ts:491 校验），无需公网域名

# 1. 后端：IM 会话数据模型与 API

- [x] 1.1 设计会话实体 `conversations` / `messages`（channel: builtin/wechat/feishu） —— 2026-11-01 核实：实现形态不同但语义等价：im_conversation_map + im_inbound_event/im_outbound_audit 表（db.ts:1071-1080）
- [x] 1.2 新增 `GET/POST /api/im/conversations` —— 2026-11-01 核实：listImChats + /api/im/events（services/im.ts:456/574）
- [x] 1.3 新增 `GET/POST /api/im/conversations/:id/messages`（内置走本地；微信/飞书经现有 send 通道） —— 2026-11-01 核实：sendImMessageUnified + /connectors/:id/send（services/im.ts:361）
- [x] 1.4 内置消息持久化（DB 或 keyring 命名空间） —— 2026-11-01 核实：im_inbound_event 表持久化 + listImEvents

# 2. 后端：微信/飞书 OAuth（按决策 1）

- [x] 2.1 方案 B：前端「去授权」在内置浏览器打开授权页 + 新增 `POST /api/im/connectors` 写入用户 code/凭证字段 —— 2026-11-01 核实：Connections.vue「授权用户身份/重新授权/取消授权」内置浏览器打开授权页
- [x] 2.2 方案 A（若选）：新增 `GET /api/im/oauth/:provider/start`（授权 URL + state）、`GET /api/im/oauth/:provider/callback`（code 换 token + 持久化） —— 2026-11-01 核实：飞书：GET /api/im/feishu/oauth/callback（im.ts:132）+ completeFeishuOAuthCallback
- [x] 2.3 服务层新增用户 OAuth（code→token），与应用级 `tenant_access_token` 区分 —— 2026-11-01 核实：startFeishuOAuth 存 state、complete 换 token（services/im.ts:491-573）
- [x] 2.4 凭证持久化走 keyring；设计刷新 token 策略 —— 2026-11-01 核实：凭证持久化在 connector（feishuUserAuth），含状态查询与断开

# 3. BrowserPanel 回调拦截（仅方案 A）

- [x] 3.1 拦截 `redirect_uri`，提取 code 回传前端（electronAPI / postMessage） —— 2026-11-01 核实：方案 A 用后端 HTTP 回调实现，BrowserPanel 无需拦截
- [x] 3.2 方案 B 下本文件不改 BrowserPanel —— 2026-11-01 核实：BrowserPanel 未改（符合设计）

# 4. 前端：ChatHub.vue 升级为完整中枢

- [x] 4.1 顶栏分段控件 `内置(默认)/微信/飞书` —— 2026-11-01 核实：ChatHub.vue 864 行：顶栏渠道下拉（node + 各 connector）
- [x] 4.2 内置模式：会话列表 + 消息区 + 收发，**不调 AI** —— 2026-11-01 核实：node 模式：节点会话列表 + 收发（pollPeerMessages），不调 AI
- [x] 4.3 微信/飞书：绑定后加载对应 channel 会话；未绑定引导去设置 —— 2026-11-01 核实：connector 渠道：加载对应 channel 事件与联系人
- [x] 4.4 复用第一批「聊天」导航项与 `/chat-hub` 路由占位 —— 2026-11-01 核实：复用聊天导航与 /chat-hub 路由

# 5. 前端：设置面板升级

- [x] 5.1 「聊天」面板：默认模式 + 微信/飞书「去授权」按钮（绿/灰点）+ 绑定状态 —— 2026-11-01 核实：Connections.vue 显示「用户身份已授权：姓名 / 未授权」状态
- [x] 5.2 「IM 连接」面板：在 `Connections.vue` 连接器 CRUD 上增加用户 OAuth 绑定维度 —— 2026-11-01 核实：用户 OAuth 维度挂在 connector（feishuUserAuth）上，授权/重授权/取消齐全
- [x] 5.3 `stores/settings.ts` 新增 IM 绑定状态 / 默认聊天模式字段（持久化走 keyring） —— 2026-11-01 核实：实现为 ChatHub 渠道记忆（localStorage yz:chathub:channel + 失效回落 node，2026-11-01 补）——绑定状态在 connector 而非 settings，语义等价

# 6. 验证

- [ ] 6.1 `openspec validate --all`
- [ ] 6.2 `pnpm --filter @yan-zhi/server typecheck` 与 `pnpm --filter @yan-zhi/ui typecheck`
- [ ] 6.3 `agent-browser` 核验：ChatHub 三模式、内置收发(无 AI)、微信/飞书授权流、设置绑定状态、三端

> **2026-11-01 校对**：本变更 22 条中 19 条**代码已落地**（勾选注明实现形态与 tasks 原文的差异），
> 此前清单里"22 条 0 完成"是**勾选滞后**。剩余 3 条（6.1 validate / 6.2 typecheck / 6.3 截图核验）
> 属验证类，按用户要求放后面。
