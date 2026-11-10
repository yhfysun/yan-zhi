# 任务状态

## 当前状态

- 分支：`dev0.1-mobile`
- 状态：Task 1-7 代码均已交付并推送；**Task 7 的 PG 全仓迁移与 PG 一致性验证仍未完成，见待办与边界说明**
- 远端分支：`origin/dev0.1-mobile`
- 远端提交：以 `git log -1 --oneline` 为准（2026-11-09 收尾提交 + 交接文档提交均已推送）；本地与远端 **0 ahead / 0 behind**
- 工作区状态：**干净**，2026-11-08/09 的改动（含学习模式、共享服务/导出壳）已全部提交推送，无并行会话在途改动
- 新会话入口：**先读 `docs/交接-项目接手说明-2026-11-09.md`（自包含交接，clone 后可读）**，再读本文件与 `tasks/plan.md`
- 方案文档：`docs/baizhi-monkeyai-feature-migration-plan-2026-11-05.md`、`docs/英语学习模式方案-2026-11-08.md`

## 已完成

- [x] 企业工作台管理端 `/admin/enterprise`
- [x] 成员团队工作台 `/team`
- [x] 团队规则、专家 Manifest、资源版本
- [x] 组织/用户周期额度、额度账户、消费流水、模型调用拦截
- [x] 管理操作审计
- [x] 集中式 MCP Provider/Connector、加密共享凭证、工具发现、工具策略、调用日志
- [x] 工作节点 Agent、注册、心跳、远程命令任务、事件回传、产物登记
- [x] 云工作区目录、创建/停止、TTL 巡检
- [x] 设计资源库与设计助手提示词注入
- [x] 团队资源/MCP/节点/任务模型工具
- [x] 服务端类型检查和生产构建
- [x] UI 类型检查和生产构建
- [x] 服务端全量测试：408 文件，5026 通过，12 跳过
- [x] UI 全量测试：238 文件，2618 通过
- [x] 真实 HTTP 冒烟
- [x] 真实节点 Agent 冒烟：`enterprise-real-agent-ok`
- [x] Task 1：集中式 MCP OAuth 授权闭环（授权发起/回调、state + PKCE + issuer 来源校验、加密 token、刷新/撤销/重新授权、管理端入口）
- [x] Task 2：容器化云工作区（带 image 优先容器、无 Docker 明确失败不回退、停止移除容器 + 目录保留策略、TTL 清理）
- [x] Task 3：云工作区端口预览（登记端口受控代理、权限/状态/TTL 校验、失效即摘端口、SSRF 与凭证头拦截）
- [x] Task 4：团队资源进入常规选择器（模型/Skill/智能体选择器显示「团队」标签、撤权后缓存失效、公开与 ACL 标签一致）
- [x] Task 5：实时节点通道升级（WS 控制通道：token 认证、ready 认领下发、事件 seq 幂等、断线续传、立即离线收敛、HTTP 轮询降级共存）
- [x] Task 6：OIDC / 企业 SSO（授权码 + PKCE、state/nonce/签名/iss/aud/exp/iat 全校验、账号映射幂等、内置账号共存、故障不吞错）
- [x] Task 7：PostgreSQL repository 适配（repository 收口、SQLite 默认行为不变、PG 可选后端 + 明确失败、事务/JSON/时间戳一致性；**边界见下**）

## 待办

- [x] Task 7 企业运行时域代码收口：节点、任务、事件、产物、工作区、端口预览、WS、MCP 工具与巡检全部经 repository
- [ ] Task 7 后续非运行时域：团队资源 / 配额 / 审计 / MCP 管理 / 设计资源等管理端 SQL 仍为 SQLite，需独立迁移
- [x] 2026-11-10 用临时 `postgres:16-alpine` 实例跑通 `enterprise-repository-pg.test.ts`，12/12 通过

## 已推送提交（Task 1-4）

- `c65d9882`：feat(enterprise) — OAuth 闭环 / 容器工作区 / 端口预览 / 团队来源（Task 1-4 功能与测试）
- `41f9dfd0`：style(admin) — 企业管理端视觉改版（含 --color-bg-secondary 未定义的根因修复）
- `28927fe2`：docs(tasks) — Task 1-4 验证记录
- `0c8929a5`：fix(enterprise) — 补 c65d9882 漏掉的 node-agent 容器接线与 team-origin 契约测试

## 提交经验（本机必读）

- 工作区与并行会话共存时，用**临时 index（GIT_INDEX_FILE + read-tree + update-index + write-tree + commit-tree + update-ref）**
  精确构造提交，工作区与并行会话的主 index 均不受影响；`index.ts` 这类混入他人在途改动的文件
  先构造"HEAD+我的改动"的中间版本 blob（`git hash-object -w --path`）再 update-index。
- ★ 提交后必须 `git show --stat` 逐文件核对，**新文件漏 add 是真实发生过的事故**（0c8929a5 即补漏提交）。
- ★ 并行会话可能在任意时刻推进 HEAD：本次操作间隙 learning 两个提交落地，导致首个 C1 的
  index.ts 误用旧版本（learning 挂载被退回），已重建提交修复。提交前后的 HEAD 短哈希都要核对。
- 提交完成后主 index 可能残留旧条目（`MM` 状态），需对**自己的文件**逐个 `git restore --staged`
  同步到 HEAD，否则并行会话 `git add -A && git commit` 会把旧内容倒退回去。

## Task 1 验证记录（2026-11-08）

- 新增 `apps/server/test/enterprise-mcp-oauth.test.ts`：16 个真 HTTP 验收用例全过
  （授权发起、回调 state/PKCE/issuer/redirect_uri/重放/过期、token 加密不回显、工具发现与调用、刷新、撤销与重新授权）。
- 三项类型检查全绿：`pnpm exec tsc -p apps/server/tsconfig.json --noEmit`、
  `pnpm --filter @yan-zhi/core typecheck`、`pnpm --filter @yan-zhi/ui typecheck`。
- `pnpm --filter @yan-zhi/ui test`：238 文件 / 2618 通过；`pnpm build:web` 成功。
- 服务端全量（单 worker）：409 文件、406 通过。3 个环境性失败
  （`clip-matte-render` / `clip-matte` / `java-debug-jdi`：沙箱禁止 spawn 外部进程、
  Windows 控制台中文编码、缺 JDK），单独复跑结果相同，且与本任务模块无 import 关系。
- ⚠️ 本机多 worker 并发跑 vitest 会触发沙箱 fs 代理 `EPERM` 并**静默丢弃测试文件**
  （5 个文件只跑 3 个却不报错）。本机一律加 `--no-file-parallelism`。
- 改动文件：`apps/server/src/enterprise/{mcp-oauth.ts(新),mcp-hub.ts,schema.ts}`、
  `apps/server/src/{routes/enterprise.ts,index.ts,license-guard.ts}`、
  `packages/ui/src/{api/enterprise.ts,views/admin/enterprise/McpPanel.vue}`、
  `apps/server/test/enterprise-mcp-oauth.test.ts(新)`。

## Task 2 验证记录（2026-11-08）

- 新增 `apps/server/scripts/enterprise-workspace-runtime.cjs`：节点生命周期收口，宿主 `.mjs`
  与测试都 `require` 同一份实现（docker 命令通过 runner 注入，不依赖本机装 Docker）。
- 新增 `apps/server/test/enterprise-workspace-container.test.ts`：19 个用例全过，覆盖
  模式判定、非 root/只读根/cap-drop/CPU/内存/挂载参数、Docker 探测失败不回退、
  run 失败不留半截状态、停止 `docker rm -f` + keepDir 策略、元数据回读容器 ID、
  `docker ps` 状态解析，以及控制面 create/stop/TTL 三类 payload 都带清理信息。
- 安全默认：非 root、只读根文件系统、cap-drop ALL、no-new-privileges、默认无网络
  （端口预览留到 Task 3 显式开放）、CPU/内存限额、仅挂载本工作区目录。
- 三项 typecheck 全绿；企业相关 4 个测试文件 48/48 通过；UI test 238 文件 / 2618 通过；
  `pnpm build:web` 成功。UI 侧两个入口（`TeamHub.vue` / `RuntimePanel.vue`）都加了
  镜像/CPU/内存/保留目录输入与运行模式、失败原因展示。
- ⚠️ 关于 JDI 用例的更正：本机**有** JDK 17（`C:\APP\Java\jdk-17.0.11`，`jdb` 可用），
  `java-debug-jdi.test.ts` 失败是 JDI 未暂停在断点（`"status":"terminated"`、
  `"lastError":"目标进程退出（0）"`），不是缺 JDK；`clip-matte-render` 是 60s 超时、
  `clip-matte` 是控制台中文编码。三者均与本迁移任务无 import 关系。

## Task 3 验证记录（2026-11-08）

- 新增 `apps/server/test/enterprise-workspace-preview.test.ts`：11 个**真实 HTTP 代理**用例全过
  （登记端口可预览 + 子路径/query 保留、越权、未登记端口、停止、TTL 到期、SSRF host 黑名单、
  不跟随 3xx、不透传 Authorization/Cookie/Set-Cookie、端口关闭后 502 并摘掉登记）。
- `resolveWorkspacePreviewTarget()` 是唯一判定出口：目标只能由「节点上报的 `preview_host`
  + 工作区已登记端口」拼成，请求方无法指定任意目标地址。节点 host 拒绝 scheme/路径/端口/
  云元数据地址；路由只透传安全响应头、限 GET/HEAD、不跟随重定向、响应体上限 2MB。
- 容器侧：`buildDockerRunArgs` 支持 `publishPorts`，只在有登记端口时开 bridge 并
  `-p 127.0.0.1:p:p`；无端口仍 `--network none`。节点注册上报 `YZ_RUNTIME_PREVIEW_HOST`。
- UI 两个入口都加了「预览」按钮（仅 running 且有登记端口时出现），链接带 `?token=` 走
  authMiddleware 的 query 令牌通道。
- 验证：server/core/ui 三项 typecheck 全绿；企业相关 4 个测试文件 57/57 通过；
  UI test 238 文件 / 2618 通过；`pnpm build:web` 成功。
- 服务端全量（单 worker）：411 文件 / 408 通过。3 个失败文件仍是 Task 1 记录的
  `clip-matte-render` / `clip-matte` / `java-debug-jdi`，与本次改动零 import 关系，无新增回归。

## Task 4 验证记录（2026-11-08）

- 来源判定**收口在服务端 SQL**：`/platforms/all-models`、`/platforms/:pid/models`（两分支）、
  `/api/skills`、`/api/agents` 的 SELECT 统一加 `(COALESCE(user_id,'') <> ?) AS shared`
  （可见但非本人拥有 = 公开共享 ∪ ACL 授权，与平台列表既有 `shared` 字段同语义），
  出口统一转布尔；前端只读展示，不允许自行比对 user_id。不改 ORDER BY，个人资源排序与默认选择不变。
- 新增 `apps/server/test/team-origin-shared.test.ts`：4 个真 HTTP 用例全过
  （自己的=false、别人公开=true、共享平台内=true、ACL 授权=true，skills/agents 同）。
- 前端：`Model`/`Agent`（shared types）、`Skill` 接口加 `shared`，三个 store 行映射透传；
  新增 `invalidateModels/invalidateSkills/invalidateAgents`；`ResourceAclDialog` 保存名单后
  立即失效三份缓存（撤权后选择器重新拉取，被撤资源消失）。
- 选择器接线：`AgentPicker.vue`（智能体）、`ChatSkillCards.vue`（挂载 Skill）、
  `ChatInputArea.vue` 桌面+移动两个模型 popover；标签样式收口在 `views/chat.css` 的
  `.yz-team-tag` 一处，组件内零 scoped 副本。
- 新增 `packages/ui/src/stores/team-origin.test.ts`：8 个契约用例全过（渲染接线 ×3、
  样式唯一出口、store 映射、缓存失效、个人资源渲染路径不变）。
- 验证：server/shared/ui 三处 typecheck 全绿；`build:web` 成功；UI 全量 239 文件，
  2625 通过、**1 失败 = `p3Consistency.test.ts` 报 `/views/Learning.vue` 暗色硬编码 ——
  Learning.vue 是并行会话的新文件（untracked），不是本任务改动，未处理**。

## Task 5 验证记录（2026-11-08）

- 协议：`/api/runtime/v1/ws`（HTTP Upgrade，yzn.* 节点令牌认证 + license 校验；**必须挂在
  通用 multi JWT 闸之前** —— 节点令牌不是 JWT）。帧：`ready`（认领触发兼心跳）/ `task` /
  `events`（seq 幂等）/ `complete` / `heartbeat` / `workspace_state` / `events_acked` / `registered`。
- 服务端收口 `apps/server/src/enterprise/runtime-ws.ts`：帧处理唯一出口 `handleRuntimeFrame`
  （传输层只收发）；任务下发复用 `claimRuntimeTask` 原子认领（queued→running 事务内完成，
  不会双下发）；事件复用 `appendRuntimeEvents` 的 UNIQUE(task, seq) + INSERT OR IGNORE
  （重复事件不重复执行）；连接断开该节点**立即离线**（janitor 2 分钟兜底保留）；
  一节点重连顶掉旧连接。
- agent 协议层 `apps/server/scripts/enterprise-node-ws.mjs`：`createRuntimeWsChannel`
  （注册、ready 节律、pending 事件缓存 + 重连续传、无限运行期重连、`isActive` 降级信号）。
  修复了"被顶掉的旧连接 close 也安排重连"的重连风暴。宿主 agent：WS 活跃时事件即时走
  WS、跳过 HTTP 轮询/心跳；失效自动回落轮询（降级共存），complete 仍走 HTTP（幂等低频）。
- 新增 `apps/server/test/enterprise-runtime-ws.test.ts`：**9 个真 ws 用例全过**
  （错误 token 拒绝、registered、ready 原子认领、事件幂等重放、断开立即离线、
  断线重连续传 + complete、HTTP 轮询共存、agent 通道重连续传、无 WS 端点如实降级）。
  ★ 测试坑：ws 客户端的 message 监听必须在 **open 之前**挂上，否则服务端首帧（registered）
  在 open resolve 的间隙丢失 —— helper 用"缓冲 + waiter"模式。
- 企业相关 4 文件 50/50 通过；server tsc 全绿；Task 5 无 UI 改动（agent/服务端协议层）。

## Task 6 验证记录（2026-11-08）

- 服务端 `routes/oidc.ts`（新）：授权码 + PKCE(S256)、state/nonce 只存哈希、verifier 加密、
  一次性 + TTL + redirect_uri 绑定、iss 校验（RFC 9207）。ID Token 只接受 **RS256**，
  JWKS kid 匹配 + RSA 验签（kid 未命中强制刷新一次）、iss/aud/exp/iat/sub/nonce 全校验
  （±60s 时钟偏移）；算法混淆（none/HS256）与签名篡改一律拒绝。
  账号映射唯一出口 `findOrCreateOidcUser`：`user_oidc_identity` 以 **(issuer, sub)** 为主键，
  首次事务内建号、再次不重复创建；本地 JWT 复用 `auth.ts#issueAuthToken` 唯一签发出口。
  配置/上游故障全部抛带稳定 code 的 `OidcError`（JWKS_UNREACHABLE / TOKEN_EXCHANGE_FAILED /
  OIDC_NOT_CONFIGURED 等），绝不吞错。
- 配置：`YZ_OIDC_ISSUER` / `CLIENT_ID` / `CLIENT_SECRET`（必填），
  `AUTHORIZATION_URL` / `TOKEN_URL` / `JWKS_URL` / `REDIRECT_URI` / `SCOPES`（可选）。
  `GET /api/auth/oidc/config` 只回 enabled/issuer/clientId，**不回显密钥**。
- UI：`Login.vue` 启用时显示「企业账号单点登录」；回调 `?oidc_token=` → `setToken` → 整页刷新；
  内置账号登录路径零改动。
- 测试（`apps/server/test/auth-oidc.test.ts`）：mock IdP 用**真 RSA-2048** 签 RS256 ID Token +
  真 JWKS/token/authorize，**25 个真跑用例全过**：全流程 + PKCE 匹配、账号映射幂等、
  跨 issuer 不串号、内置账号共存、state 未知/重放/过期、iss/redirect_uri、用户取消、
  签名篡改、alg=none/HS256、nonce、iss/aud/exp/iat/sub 六类 claim、kid 未知、ID Token 缺失、
  JWKS 500、token 端点 500、配置缺失、config 不回显密钥。
  UI 契约测试 `packages/ui/src/views/oidc-login.test.ts` 5/5（入口/令牌落地/内置路径不改/接线守卫）。
- 验证：server/ui/core/shared 四项 typecheck 全绿；服务端相关 45/45；`build:web` 成功；
  服务端全量 421 文件 / 418 通过（3 个失败仍是环境基线，无新回归）；
  UI 全量 2 个失败（`mode.test.ts` 多出 learning 模式、`p3Consistency` 的 `Learning.vue` 硬编码）
  **均为并行会话 learning 功能引入**，与本任务无关。
- 已知边界：OIDC 回调 302 到**同域** `/login?oidc_token=`；轻量壳（`file://` + 远程后端）
  场景暂不支持 SSO（需让回调落到前端域）。

## Task 7 验证记录与已知边界（2026-11-08）

- 新增 `src/enterprise/repository.ts`：`EnterpriseRepository` 接口 + **SQLite 实现（委托
  runtime.ts 的唯一实现，零 SQL 复制，默认行为完全不变）** + **PostgreSQL 实现**
  （`pg.Pool`、企业运行时域 4 张表的 PG 方言 DDL、参数化 $n 查询、BEGIN/COMMIT/ROLLBACK）。
  视图层复用 `workspaceView`（JSON 列 / 布尔列 / 时间戳 / 空值归一），两后端语义一致。
- 工厂 `createEnterpriseRepository`：`YZ_DB_BACKEND` + `DATABASE_URL`；
  配置缺失 / URL 非法 / 连接失败 / **迁移失败一律抛 `RepositoryError` 稳定 code**，
  绝不静默回落 SQLite。启动接线：PG 模式启动即连接+迁移，失败 `process.exit(1)`。
  真实接线：`GET /enterprise/runtime/workspaces` 走 repository；新增 admin
  `GET /enterprise/repository/health`。
- 测试 `test/enterprise-repository.test.ts`：**14 个用例全过**（默认后端、health、
  实现方法集合、JSON/布尔/时间戳/加密列不回显、参数化防注入、事件 seq/limit、
  withTransaction 提交与回滚、PG 配置缺失/URL 非法/连接失败明确报错、路由与启动接线守卫）。
- 测试 `test/enterprise-repository-pg.test.ts`：按 plan.md 要求「有实例跑一致性、
  **无实例必须如实失败（不能静默跳过）**」实现 —— 无 `YZ_TEST_PG_URL` 时抛明确错误，
  故本机全量测试会多一个**预期失败**（不是回归，也不伪装成绿色）。
- 验证：server tsc 全绿；企业相关 5 文件 75/75；SQLite repository 契约 14/14。
- ★ **已知边界（不宣称全仓已迁 PG）**：全仓仍有数百处 `db.prepare` 的 SQLite 同步 API
  与方言 SQL（`INSERT OR IGNORE` / `json_extract` / `?` 占位符等）。当前 PG 后端只覆盖
  **企业运行时域（工作区/任务/事件）**；其余管理端路由在 PG 模式下仍走 SQLite，
  完整多后端需要按 repository 逐路由异步化 + 方言化（已列入待办）。
  `pg@8.23.0` 已在 `apps/server/package.json`，无需新增依赖。
- 2026-11-10 增量：运行时读取路径已继续收口到 repository —— 管理端工作区/任务列表、
  用户端工作区详情、任务列表/详情/事件/产物均经 `EnterpriseRepository`；PG 侧补齐任务
  JSONB/BIGINT 归一、产物表及 `conversation_id` / `task_id` / `exit_code` 幂等迁移。
  验证：repository 契约 15/15、企业相关 4 文件 51/51、server tsc 干净。
- 2026-11-10 写路径增量：任务取消与工作区停止改走 repository；SQLite/PG 均加事务边界，
  重复停止不再重复入队，越权与已结束任务保持幂等。新增真实 Express 路由测试覆盖成功、
  越权、重复取消、重复停止和不存在任务；PG 事务绑定 repository 复用同一连接，外层回滚
  可撤销嵌套写。验证：repository 契约 20/20、写路由 6/6、企业相关 5 文件 62/62、
  临时 PG 16 实例 9/9、server tsc 与 build 通过。
- 2026-11-10 运行时控制面收口：节点创建/认证/注册/心跳/更新/删除、任务创建/领取/事件/完成/产物、
  工作区创建/状态回传/TTL 停止、端口预览/注销、WS 帧、MCP API 工具与后台巡检全部经 repository。
  真实 HTTP 覆盖管理端、用户端和节点 Agent 全链路；企业测试 9 文件 106/106，临时 PG 16 实例
  12/12，server tsc 与 build 通过。运行时域不再存在生产路由直连 SQLite。
- 2026-11-10 现场日志回归（下载 / 白屏）：
  - 下载实报：18:56:06 点击导出，18:56:46 文件已保存到「言知下载」，但 pageAgent 在
    18:56:15/21 用无参数或仅 limit 的 `browser_download` 查询时仍被当成 `download`，无法读取记录。
    现改为无 url/selector/index 一律走 `downloads`；下载开始即登记路径，点击回执最多等 10 秒，
    以 `state=completed` 且 `exists=true` 为成功，`progressing` 明确提示仍在写入。
  - 下载目录：未配置时首次下载暂停并弹原生目录选择器；选定后持久化到 host-config，后续直接使用。
    用户取消则本次回退默认目录且本会话不再重复打断；设置页新增「浏览器下载目录」选择/清除入口。
  - 非标准上传补强：browser_upload 新增 dropSelector/dropIndex/dropX/dropY 拖放模式；点击上传按钮后
    若 filechooser 与 file input 都落空，自动把真实文件拖到点击区域。隐藏 input 改为扫描 flattened DOM，
    覆盖 Shadow DOM 与嵌套文档。真实 Chromium 已验证自定义 drop zone、Shadow DOM input、延迟 blob
    下载和 iframe 下载。
  - 白屏实报：19:00:44 后端因 tesseract.js 的 `wasm-feature-detect` 在 Node 24 下解析
    `import.source` 而 code=1 退出，主窗只能无限重连。现固定兼容版本 1.8.0，并增加非守护模式
    后端异常退出自动重启（最多 2 次）与恢复后的主窗刷新。
  - pageAgent 新增办公文件跨系统流转闭环：浏览器下载 -> 文件校验 -> browser_upload ->
    提交回读 -> 报告源路径和更新条数；技能同步补充报表、流水、工单、发票、CRM、采购等场景。
  - 验证：server 相关 64/64、desktop 626/626、UI 相关 10/10；server/core/shared/ui/desktop
    typecheck 通过。

- 已知边界（原"轻量壳不支持 SSO"）**已修复**：回调支持 popup 模式（postMessage(token)+自动
  关闭 + CSP），`Login.vue` 弹窗接入并校验 event.origin=后端源，弹窗被拦时整页跳转兜底；
  302 模式落点可用 `YZ_OIDC_POST_LOGIN_REDIRECT` 配置（只允许 http(s)，防开放重定向）。
  轻量壳 file:// / Capacitor 现在都能走 SSO。

## 新会话启动方式

1. 阅读 `tasks/todo.md`、`tasks/plan.md` 和 `docs/baizhi-monkeyai-feature-migration-plan-2026-11-05.md`。
2. 检查 `git status --short --branch`，确认分支和工作区。
3. 从本文件第一个未完成任务开始，不要重做已完成模块。
4. 每个任务先写验收测试，再实现，完成后更新本文件。
5. 每个任务结束至少运行：

```bash
pnpm exec tsc -p apps/server/tsconfig.json --noEmit
pnpm --filter @yan-zhi/core typecheck
pnpm --filter @yan-zhi/ui typecheck
```

涉及服务端行为时再跑：

```bash
pnpm --filter @yan-zhi/server exec vitest run --no-file-parallelism
```

涉及 UI 时再跑：

```bash
pnpm --filter @yan-zhi/ui test
pnpm build:web
```

## 已知边界

- 本阶段工作区是节点目录隔离，不是 Docker/KVM 云电脑。
- MCP OAuth 授权闭环已完成；未配置 refresh_token 的 Provider 过期后必须重新授权。
- 节点 Agent 当前使用 HTTP 轮询，不是 WebSocket 实时通道。
- OIDC/SSO 和 PostgreSQL 多实例适配不在本阶段代码内。
