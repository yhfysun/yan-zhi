# 任务状态

## 当前状态

- 分支：`codex/goal-mode`
- 状态：企业工作台第一阶段已完成、已提交、已推送
- 远端分支：`origin/codex/goal-mode`
- 远端提交：`f9310276`
- 工作区状态：干净
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

## 待办

- [ ] Task 1：集中式 MCP OAuth 授权闭环
- [ ] Task 2：容器化云工作区
- [ ] Task 3：云工作区端口预览
- [ ] Task 4：团队资源进入常规选择器
- [ ] Task 5：实时节点通道升级
- [ ] Task 6：OIDC / 企业 SSO
- [ ] Task 7：PostgreSQL repository 适配

## 已推送提交

- `d1238dcb`：企业资源治理、额度、MCP、工作节点与远程运行时
- `6c34512b`：企业管理端与成员团队工作台
- `f9310276`：实施记录、交接方案和后续任务清单

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
pnpm --filter @yan-zhi/server test
```

涉及 UI 时再跑：

```bash
pnpm --filter @yan-zhi/ui test
pnpm build:web
```

## 已知边界

- 本阶段工作区是节点目录隔离，不是 Docker/KVM 云电脑。
- MCP 已支持共享凭证和 OAuth 字段，但完整 OAuth 授权回调仍未实现。
- 节点 Agent 当前使用 HTTP 轮询，不是 WebSocket 实时通道。
- OIDC/SSO 和 PostgreSQL 多实例适配不在本阶段代码内。
