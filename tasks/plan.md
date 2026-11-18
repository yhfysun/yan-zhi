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

---

# Implementation Plan: 学习课程主题统一与软考免费自学资料

## Overview

本轮不新增独立设计体系，而是把学习页、设置页和软考资料接入现有 `tokens.css` / `skin.css`。
所有内容必须在浅色、深色、无皮肤、暗色图片皮肤和亮色图片皮肤下保持可读；软考资料必须区分
官方免费入口、开源资料和受版权保护的正式教材，不能把非授权电子书当作免费资源。

## Architecture Decisions

- 页面结构色只使用 `--lp-*`、`--color-*`、`--glass-*` 等语义 token，禁止新增固定白底/青色。
- 图片皮肤只影响玻璃底色、纹理和主色强调，不直接决定正文颜色；正文由实际表面明暗决定。
- 免费学习资源采用 `SoftFreeResource` 数据契约，包含来源类型、许可证和使用说明。
- 软考教材页面只提供正版版本信息；免费替代路径使用官方大纲、开源笔记、开源题库和公开视频检索。

## Task 1: 安全课程主题基线

**Acceptance criteria:**
- 安全课程讲义、风险/控制、实验、自测和代码区不再出现固定亮色卡片。
- 暗色图片皮肤使用低透深色玻璃；亮色图片皮肤使用主题派生浅色玻璃。
- 正文、辅助文字、状态色和代码文字在所有模式下可读。

**Verification:** UI 挂载测试、UI 类型检查、暗/亮模式真实截图。

**Dependencies:** None

## Task 2: 设置页主题审计

**Acceptance criteria:**
- 设置弹窗、抽屉、表单、导航、二维码说明、下载目录和危险操作区跟随皮肤与深浅模式。
- 不把二维码白底等必要对比区域误改成透明。
- 暗色图片皮肤下不出现白板或黑底黑字，浅色图片皮肤下不出现深底深字。

**Verification:** 设置页挂载测试、真实浏览器暗/亮截图、UI 类型检查。

**Dependencies:** Task 1

## Task 3: 软考免费资源数据层

**Acceptance criteria:**
- 四个专业均有官方入口、开源题库/笔记和公开视频检索入口。
- 每条资源包含标题、类型、URL、提供方、许可证/免费说明和使用建议。
- 正式教材明确标注版权边界，不提供盗版下载。
- Markdown 学习清单写入免费资源和使用顺序。

**Verification:** `learning-exams.test.ts`、服务端类型检查。

**Dependencies:** None

## Task 4: 软考免费资源界面

**Acceptance criteria:**
- “学习清单”面板新增“免费自学资料”和“怎么用”步骤。
- 每个资源可直接打开，显示来源类型和许可证。
- 官方教材、开源资料、视频课程视觉上可区分，但使用同一主题 token。

**Verification:** `Learning.mount.test.ts`、真实浏览器点击检查。

**Dependencies:** Task 2, Task 3

## Task 5: 全模式验收与收尾

**Acceptance criteria:**
- 暗色图片皮肤、浅色图片皮肤、无皮肤浅色和无皮肤深色均完成截图检查。
- 教程、设置页和软考资料无控制台错误。
- UI/server 相关测试与类型检查通过。
- `tasks/todo.md` 逐项更新完成状态。

**Verification:** Focused tests, typechecks, browser screenshots, `git diff --check`.

**Dependencies:** Task 1-4

---

# Implementation Plan: 皮肤语义按钮体系

## Overview

插件皮肤目前虽然有 `button-bg.webp`，但主按钮、警告、危险等语义按钮大多绕过了皮肤图，
业务自定义 `<button>` 也没有统一入口，导致同一皮肤下按钮仍像 Element Plus 默认纯色控件。
本方案把按钮拆成“皮肤表面材质 + 功能语义色层 + 明暗模式”三层，先统一行为，再逐步补每套皮肤的独立贴图。

## Architecture Decisions

- 按钮分类固定为 `normal / primary / warning / danger / success / info`，语义色不可被皮肤主色替代。
- 普通按钮默认复用 `buttonPattern`；各分类可提供独立 `button<Kind>Pattern` 与暗色变体。
- CSS 始终保留皮肤按钮图，语义色以半透明纱层叠加，避免退回纯色矩形。
- 原生业务按钮通过统一选择器接入；图标按钮只继承材质，不改变尺寸、布局和可点击区域。
- 浅色模式按白底计算文字对比度，深色模式单独调整危险/成功/信息底色，目标 WCAG AA。

## Task 1: 语义按钮契约与统一表面层

**Acceptance criteria:**
- `core` 皮肤契约支持六类按钮贴图及暗色变体。
- `settings.applySurface` 下发 `--skin-btn-<kind>-pattern`。
- Element Plus 与学习、代码、工作流、安全、运维等主要自定义按钮共用同一材质入口。
- 警告/危险/成功/信息使用独立文字色和底色基准。

**Verification:** `skinButtons.test.ts`、UI/core typecheck、真实浏览器明暗截图。

**Dependencies:** None

## Task 2: 每套皮肤独立按钮贴图

**Acceptance criteria:**
- 构建脚本为每套插件皮肤生成 `button-primary-bg`、`button-warning-bg`、
  `button-danger-bg`、`button-success-bg`、`button-info-bg` 及暗色变体。
- 普通按钮继续使用 `button-bg`；语义按钮优先使用自身贴图，缺省回落普通贴图。
- 贴图必须有不同构图语言：主操作偏纵向光带、警告偏斜纹、危险偏高对比切面、成功偏柔和颗粒。
- 资源生成幂等，旧皮肤包缺文件时仍可正常回退。

**Verification:** 资源清单测试、Sharp 生成脚本、每套皮肤按钮拼图预览。

**Dependencies:** Task 1

## Task 3: 业务按钮迁移审计

**Acceptance criteria:**
- 逐页扫描 `<button>`、`<el-button>`、`role="button"`，区分动作按钮、分段控件、标签页和纯图标按钮。
- 动作按钮接入语义分类；分段控件与标签页保持原形态，只继承边框/焦点皮肤。
- 图标按钮不铺大图，只保留低强度材质和 hover 状态。
- 新增 lint/契约测试阻止裸 `button.danger`、`cp-btn primary` 等语义漂移。

**Verification:** 选择器覆盖率测试、暗/亮截图、键盘 Tab 检查。

**Dependencies:** Task 1

## Task 4: 全皮肤视觉验收

**Acceptance criteria:**
- 至少覆盖赛博宵、秦时明月、猫咖、云海、瓷冰五类不同明暗和色相皮肤。
- 每类皮肤检查 normal / primary / warning / danger / success / info 六组按钮。
- 浅色、深色模式下文字对比度达到 4.5:1；禁用态仍清晰但不过度抢眼。
- 控制台无 CSS 解析错误、Vue warning 或资源 404。

**Verification:** Playwright 截图矩阵、computed style 断言、console/network 检查。

**Dependencies:** Task 1-3

---

# Implementation Plan: 桌面与移动应用化重构

## Overview

本计划把言智从“共享 Web 壳的响应式后台”推进为“桌面专业工作台 + 移动任务助手”。
完整规格见 `docs/桌面与移动应用化重构方案-2026-11-17.md`，壳层决策见
`docs/decisions/0001-desktop-mobile-app-shell.md`。本轮先评审，不直接改产品代码。

## Architecture Decisions

- Vue/Electron/Capacitor 技术栈不变，只重组壳层、信息架构和交互。
- Desktop、Web、Mobile 共享业务组件和 Token，不共享一级导航形态。
- 店铺工作区是唯一业务真相，AI 通过变更单和检查器协作。
- 剪贴板拆为快贴态与管理态；宠物保持独立窗口但一次只开一个弹层。
- 先改设计地基与壳层，再按店铺、剪贴板、宠物逐块迁移。

## Task 1: 桌面应用壳与设计地基

**Description:** 增加桌面标题栏模式切换、上下文栏、检查器和状态栏语义；移除常驻模式栏；补充桌面尺寸、表格密度、触控目标和动效 Token。

**Acceptance criteria:**
- 桌面一级导航与真实模式一致：办公、店铺、开发、运维、安全、工作流、自动化、剪辑、学习。
- “工作台”只作为模式内的工作区概念，不作为一级模式名称。
- AI/人工放在各模式标题栏内部切换，AI 继承当前模式的上下文、权限和产物。
- 上下文栏与检查器支持拖动调宽、双击收起，并在收起后保留始终可见的恢复入口。
- 当前模式、工作区和全局搜索在标题栏可见。
- 上下文栏、检查器和状态栏支持折叠/持久化。
- 开发、剪辑和店铺运营沿用项目上下文 + 主工作画布；1024px 下检查器按需覆盖，不常驻压缩主画布。
- Web/Mobile 不误用桌面壳。

**Verification:** UI typecheck、壳层挂载测试、1440/1024 截图。

**Dependencies:** None

**Estimated scope:** Medium

## Task 2: 店铺桌面运营台

**Description:** 将店铺页签骨架改为“看板 + 待办 + 表格 + 右检查器”，保留现有商品/订单/发货/库存 API。

**Acceptance criteria:**
- 今日 KPI、待办和最近订单首屏可见。
- 保留“从 0 开店”独立入口和五步创建向导，支持保存草稿、上一步、下一步和返回店铺。
- 表格支持密度、固定表头、键盘导航和批量操作。
- AI 变更单固定在检查器，不修改对话区数据真相。
- 人工/AI 工作台开关位于运营台工具条。
- 1024px 下运营主台保持完整可读，检查器默认收起并按需覆盖。

**Verification:** 店铺相关 UI 测试、真实截图、关键操作回归。

**Dependencies:** Task 1

**Estimated scope:** Large，拆成看板、表格、检查器三条任务。

## Task 3: 店铺移动运营流

**Description:** 为 Capacitor 和窄屏提供总览、待办、商品、订单、发货的移动专用布局。

**Acceptance criteria:**
- 底部主导航最多 4 项。
- 主要触控目标 ≥44px。
- 订单可从总览两次点击进入发货。
- 表单单列，底部固定主操作，无横向溢出。

**Verification:** 320/375/390/428px 截图、触控检查、Web 窄屏回归。

**Dependencies:** Task 2

**Estimated scope:** Medium

## Task 3b: 移动模式白名单与沉浸层阻断项

**Description:** 将移动一级模式收敛为日常办公、运维、安全、学习和店铺；开发、工作流、剪辑、RPA 仅保留桌面入口。

**Acceptance criteria:**
- 移动端模式选择器不得出现开发、工作流、剪辑、RPA。
- 运维/安全仅开放监控、告警、审批、止损和报告，不开放编辑器或编排器。
- 沉浸学习层完全覆盖底层页面和全局导航。
- 沉浸层退出后恢复原滚动位置和课程定位。

**Verification:** 320/390/428px 截图、沉浸层前后截图、Tab 焦点遍历、真机返回键检查。

**Dependencies:** Task 3

**Estimated scope:** Small

## Task 4: 剪贴板快贴态与管理态

**Description:** 重构剪贴板为搜索优先的快贴窗和独立管理窗，加入敏感内容遮罩和键盘主路径。

**Acceptance criteria:**
- 快贴态 420×520，管理态 1040×700。
- 召唤到可输入 <250ms。
- 默认遮蔽敏感内容，显式显示后自动复位。
- 原生图标统一，1000 条记录滚动无卡顿。

**Verification:** 桌面真实窗口测试、键盘路径测试、敏感内容测试。

**Dependencies:** Task 1

**Estimated scope:** Medium

## Task 5: 宠物与桌面助手收口

**Description:** 宠物改为单弹层、任务优先；桌面状态栏接入运行中任务、同步和错误。

**Acceptance criteria:**
- 同一时刻最多一个宠物弹层。
- needs-input 1 秒内可见。
- 任务面板仅三层信息且无 emoji 操作图标。
- 静音、减少动作、安静时段有效。

**Verification:** 桌面真机交互、状态优先级单测、减少动态检查。

**Dependencies:** Task 1

**Estimated scope:** Medium

## Task 6: 命令面板与全模式回归

**Description:** 让 `Ctrl+K` 同时检索动作、页面和实体；完成桌面/Web/移动关键页面回归。

**Acceptance criteria:**
- 管理页从主顶栏下沉后仍可通过命令面板和头像菜单到达。
- 快捷键与现有聊天/侧栏快捷键不冲突。
- 控制台、网络、A11y、截图和构建检查通过。

**Verification:** UI tests、typecheck、build、Playwright 截图矩阵。

**Dependencies:** Task 1-5

**Estimated scope:** Medium

## Checkpoint: After Task 1

- [ ] 设计 Token 和桌面壳通过评审。
- [ ] Web 与 Capacitor 壳未被破坏。
- [ ] 桌面与移动截图通过首轮检查。

## Checkpoint: After Task 2-3

- [ ] 店铺桌面主流程可用。
- [ ] 店铺移动发货流程可用。
- [ ] 人工/AI 模式共享同一数据和变更单。
- [ ] 移动模式白名单与沉浸层阻断项通过。

## Checkpoint: After Task 4-6

- [ ] 剪贴板、宠物和命令面板达到验收标准。
- [ ] 三端回归和构建通过。
- [ ] 更新 `tasks/todo.md` 与交付说明。
