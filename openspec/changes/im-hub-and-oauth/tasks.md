# 0. 拍板 OAuth 方式（前置）

- [ ] 0.1 与用户确认 OAuth 落地方式：**(B) 手动授权码回填（推荐首批）** 还是 **(A) 完整后端回调 OAuth**
- [ ] 0.2 若选 A：确认回调 `redirect_uri` 可达性（本地桌面如何接收回调）

# 1. 后端：IM 会话数据模型与 API

- [ ] 1.1 设计会话实体 `conversations` / `messages`（channel: builtin/wechat/feishu）
- [ ] 1.2 新增 `GET/POST /api/im/conversations`
- [ ] 1.3 新增 `GET/POST /api/im/conversations/:id/messages`（内置走本地；微信/飞书经现有 send 通道）
- [ ] 1.4 内置消息持久化（DB 或 keyring 命名空间）

# 2. 后端：微信/飞书 OAuth（按决策 1）

- [ ] 2.1 方案 B：前端「去授权」在内置浏览器打开授权页 + 新增 `POST /api/im/connectors` 写入用户 code/凭证字段
- [ ] 2.2 方案 A（若选）：新增 `GET /api/im/oauth/:provider/start`（授权 URL + state）、`GET /api/im/oauth/:provider/callback`（code 换 token + 持久化）
- [ ] 2.3 服务层新增用户 OAuth（code→token），与应用级 `tenant_access_token` 区分
- [ ] 2.4 凭证持久化走 keyring；设计刷新 token 策略

# 3. BrowserPanel 回调拦截（仅方案 A）

- [ ] 3.1 拦截 `redirect_uri`，提取 code 回传前端（electronAPI / postMessage）
- [ ] 3.2 方案 B 下本文件不改 BrowserPanel

# 4. 前端：ChatHub.vue 升级为完整中枢

- [ ] 4.1 顶栏分段控件 `内置(默认)/微信/飞书`
- [ ] 4.2 内置模式：会话列表 + 消息区 + 收发，**不调 AI**
- [ ] 4.3 微信/飞书：绑定后加载对应 channel 会话；未绑定引导去设置
- [ ] 4.4 复用第一批「聊天」导航项与 `/chat-hub` 路由占位

# 5. 前端：设置面板升级

- [ ] 5.1 「聊天」面板：默认模式 + 微信/飞书「去授权」按钮（绿/灰点）+ 绑定状态
- [ ] 5.2 「IM 连接」面板：在 `Connections.vue` 连接器 CRUD 上增加用户 OAuth 绑定维度
- [ ] 5.3 `stores/settings.ts` 新增 IM 绑定状态 / 默认聊天模式字段（持久化走 keyring）

# 6. 验证

- [ ] 6.1 `openspec validate --all`
- [ ] 6.2 `pnpm --filter @yan-zhi/server typecheck` 与 `pnpm --filter @yan-zhi/ui typecheck`
- [ ] 6.3 `agent-browser` 核验：ChatHub 三模式、内置收发(无 AI)、微信/飞书授权流、设置绑定状态、三端
