# 任务状态

## 当前状态

- 分支：`dev0.1-mobile`
- 状态：企业工作台第一阶段已完成；Task 1 / 2 / 3 / 4 已实现并通过验证，改动**尚未提交/推送**
- 远端分支：`origin/dev0.1-mobile`
- 远端提交：以 `git log -1 --oneline` 为准
- 工作区状态：Task 1–3 改动都在工作区（具体文件以 `git status --short` 为准）
- 新会话入口：先读本文件，再读 `tasks/plan.md`
- 方案文档：`docs/baizhi-monkeyai-feature-migration-plan-2026-11-05.md`

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

## 待办

- [ ] Task 5：实时节点通道升级
- [ ] Task 6：OIDC / 企业 SSO
- [ ] Task 7：PostgreSQL repository 适配

## 已推送提交

- `d1238dcb`：企业资源治理、额度、MCP、工作节点与远程运行时
- `6c34512b`：企业管理端与成员团队工作台
- `f9310276`：实施记录、交接方案和后续任务清单

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
