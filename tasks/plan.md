# Implementation Plan: 企业工作台后续任务

## Overview

言智企业工作台第一阶段已经完成并验证：团队规则、专家 Manifest、资源版本、周期额度、管理审计、集中式 MCP、工作节点、远程命令任务、云工作区基础能力和设计资源库均已落地。

本计划只覆盖下一阶段。新会话应先读 `tasks/todo.md`，再按本文件的依赖顺序执行，不要重新实现已经完成的模块。

## Current Baseline

- 管理端入口：`/admin/enterprise`
- 成员入口：`/team`
- 节点 Agent：`pnpm --filter @yan-zhi/server enterprise:node`
- 方案与现状：`docs/baizhi-monkeyai-feature-migration-plan-2026-11-05.md`
- 核心后端：`apps/server/src/enterprise/`
- 企业 API：`apps/server/src/routes/enterprise.ts`
- 企业 UI：`packages/ui/src/views/admin/Enterprise.vue`
- 团队 UI：`packages/ui/src/views/TeamHub.vue`

## Architecture Decisions

- 团队资源继续复用现有 `resource_acl`，不建立第二套权限体系。
- 专家继续复用现有 `agent` 执行体，不建立第二套 Agent Runtime。
- 节点协议暂时使用 HTTP 轮询；升级实时通道时保留轮询兼容。
- 云工作区先支持目录隔离，再增加 Docker 容器和端口预览。
- SSO、PostgreSQL 和多实例属于部署能力，不在主业务代码里硬编码供应商。

## Task 1: 集中式 MCP OAuth 授权闭环

**Description:** 当前集中式 MCP 已支持 Provider、Connector、共享凭证加密、工具发现和调用，但 OAuth 仍只有存储字段，没有完整授权、回调和刷新流程。

**Acceptance criteria:**
- 管理员可从连接配置发起 OAuth 授权。
- 回调必须校验 state、PKCE 和来源。
- Token 只保存加密值，不在 API、审计和日志中回显。
- Token 过期或撤销后，下一次调用返回可行动错误并进入重新授权状态。

**Verification:**
- 新增 route/service 单测。
- `pnpm --filter @yan-zhi/server test`
- 用测试 OAuth MCP 完成授权、工具发现和工具调用。

**Dependencies:** 无

**Files likely touched:**
- `apps/server/src/enterprise/mcp-hub.ts`
- `apps/server/src/routes/enterprise.ts`
- `packages/ui/src/views/admin/enterprise/McpPanel.vue`
- `apps/server/test/enterprise-workbench.test.ts`

**Estimated scope:** Large，拆成“授权发起/回调”和“Token 刷新/状态”两条提交。

## Task 2: 容器化云工作区

**Description:** 当前工作区是节点侧目录。增加 Docker 容器模式，支持镜像、CPU/内存限制、工作目录挂载和停止清理。

**Acceptance criteria:**
- 创建带 `image` 的工作区时优先启动容器。
- 节点未安装 Docker 时返回明确错误，不回退成静默目录模式。
- 停止工作区会移除容器，目录保留策略可配置。
- TTL 到期能够停止容器并清理临时资源。

**Verification:**
- 无 Docker 环境必须如实失败。
- Docker 可用时检查 `docker ps`、工作目录和容器状态。
- `pnpm --filter @yan-zhi/server test`

**Dependencies:** 无

**Files likely touched:**
- `apps/server/scripts/enterprise-node-agent.mjs`
- `apps/server/src/enterprise/runtime.ts`
- `apps/server/test/enterprise-workbench.test.ts`

**Estimated scope:** Medium

## Task 3: 云工作区端口预览

**Description:** 当前只保存工作区端口列表，没有受控预览代理。增加端口发现、预览 URL、授权校验和过期回收。

**Acceptance criteria:**
- 节点上报端口后，成员只能预览自己有权访问的工作区端口。
- 预览入口必须校验工作区状态、端口和用户权限。
- 端口关闭、工作区停止或 TTL 到期后预览立即失效。
- 不允许任意内网代理。

**Verification:**
- 真实 HTTP 代理测试。
- 越权访问测试。
- `pnpm build:web`
- `pnpm --filter @yan-zhi/server test`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/server/src/enterprise/runtime.ts`
- `apps/server/src/routes/enterprise.ts`
- `packages/ui/src/views/admin/enterprise/RuntimePanel.vue`
- `packages/ui/src/views/TeamHub.vue`

**Estimated scope:** Medium

## Task 4: 团队资源进入常规选择器

**Description:** 团队资源目前在 `/team` 和企业工作台可见，但聊天、模型、Skill、智能体选择器还没有统一的团队来源标记。

**Acceptance criteria:**
- 常规模型、Skill、智能体选择器显示团队来源。
- 撤权后选择器缓存同步失效。
- 公开资源和 ACL 资源来源标签一致。
- 不改变个人资源现有排序和默认选择。

**Verification:**
- UI 类型检查和组件测试。
- 手工切换团队/个人资源。
- `pnpm --filter @yan-zhi/ui test`

**Dependencies:** 无

**Files likely touched:**
- `packages/ui/src/components/chat/`
- `packages/ui/src/stores/`
- `packages/ui/src/views/TeamHub.vue`

**Estimated scope:** Medium

## Task 5: 实时节点通道升级

**Description:** 当前节点 Agent 使用 HTTP 拉取任务和回传事件。升级为 WebSocket 控制通道，同时保留 HTTP 轮询兼容。

**Acceptance criteria:**
- 节点断线重连后按事件序号续传。
- 同一任务事件不重复执行。
- 节点离线状态在 2 分钟内收敛。
- HTTP 轮询模式仍可作为降级方案。

**Verification:**
- 节点 Agent 进程重启测试。
- 任务中途断网后恢复测试。
- `pnpm --filter @yan-zhi/server test`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/server/src/enterprise/runtime.ts`
- `apps/server/src/routes/enterprise.ts`
- `apps/server/scripts/enterprise-node-agent.mjs`
- `apps/server/test/enterprise-workbench.test.ts`

**Estimated scope:** Large，先协议层再 UI。

## Task 6: OIDC / 企业 SSO

**Description:** 增加标准 OIDC 登录，支持自定义 Issuer、Client ID、Secret、Scopes 和用户组映射。

**Acceptance criteria:**
- 管理员可配置并启用 OIDC Provider。
- 登录使用 state、nonce 和 PKCE，校验 ID Token 签名、Issuer、Audience、Nonce。
- 首次登录可按邮箱创建用户并映射默认组织/角色。
- 停用 Provider 后不能发起新登录，现有会话按现有 JWT 策略处理。

**Verification:**
- OIDC mock provider 测试。
- 登出、禁用 Provider、错误 nonce 测试。
- `pnpm --filter @yan-zhi/server test`

**Dependencies:** Task 4 可并行

**Files likely touched:**
- `apps/server/src/auth.ts`
- `apps/server/src/routes/admin.ts`
- `apps/server/src/enterprise/schema.ts`
- `packages/ui/src/views/Login.vue`
- `packages/ui/src/views/admin/Enterprise.vue`

**Estimated scope:** Large，拆成配置、回调、用户映射三条任务。

## Task 7: PostgreSQL repository 适配

**Description:** 保留 SQLite 单机默认，增加 PostgreSQL 适配，为企业多实例和大团队部署做准备。

**Acceptance criteria:**
- 企业模块 SQL 访问通过 repository 接口。
- SQLite 和 PostgreSQL 都能跑企业核心测试。
- 迁移脚本幂等且有回滚说明。
- 不改变单机桌面默认启动路径。

**Verification:**
- SQLite 全量测试。
- PostgreSQL 独立测试库。
- `pnpm --filter @yan-zhi/server build`

**Dependencies:** Task 1 和 Task 4 的数据结构稳定后

**Files likely touched:**
- `apps/server/src/enterprise/`
- `apps/server/src/db.ts`
- `apps/server/migrations/`

**Estimated scope:** Large，不建议和业务功能并行开发。

## Checkpoint: After Tasks 1-3

- [ ] MCP OAuth 可授权、可刷新、可撤销。
- [ ] 容器工作区真实启动和停止。
- [ ] 端口预览有权限和过期控制。
- [ ] 服务端全量测试通过。

## Checkpoint: After Tasks 4-6

- [ ] 团队资源在常规工作流中可见。
- [ ] 节点实时通道和轮询降级可用。
- [ ] OIDC 登录闭环完成。
- [ ] UI 全量测试和生产构建通过。

## Checkpoint: After Task 7

- [ ] SQLite 单机路径不回退。
- [ ] PostgreSQL 多实例路径通过独立集成测试。
- [ ] 部署文档和备份说明更新。

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OAuth token 泄露 | High | 服务端加密、最小 scope、错误信息脱敏 |
| 容器逃逸/资源失控 | High | 非 root、只读根文件系统、CPU/内存/TTL 限制 |
| 端口预览变成内网代理 | High | 仅绑定已登记工作区和端口，禁止任意目标 URL |
| 节点断线导致任务悬挂 | Medium | 心跳、事件序号、幂等完成和离线回收 |
| PostgreSQL 适配破坏单机 | High | repository 抽象先行，SQLite 默认保持原路径 |

## Open Questions

- 第一阶段企业部署是否强制要求多实例？如果不要求，PostgreSQL 可以后置。
- Windows 云电脑使用远程 Desktop、KVM 还是企业现成 VDI，需要部署侧先定。
- OIDC 用户首次登录默认进入哪个组织和角色，需要管理员配置默认映射。
