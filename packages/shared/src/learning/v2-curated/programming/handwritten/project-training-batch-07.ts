// P15 综合训练第七批手写样板：LaunchPad 发布平台 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;

const LAUNCHPAD_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · LaunchPad 发布平台 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 Docker、Git、Kubernetes 基础，能运行一个可部署应用。',
    goal: '能区分开发者、发布经理、审批人、SRE 和安全审核员的发布任务，画清应用、环境、版本、审批、部署、观测和回滚链路。',
    guidedPractice: '模拟一次正常发布、一次配置差异、一次审批拒绝、一次部署失败和一次回滚，记录每步输入、反馈和责任人。',
    independentPractice: '交付角色任务卡、发布状态图和风险清单，标出哪些步骤必须人工审批，哪些证据必须自动保存。',
    commonErrors: [
      '把发布平台做成执行 kubectl 的按钮，没有版本、审批和回滚状态。',
      '只关注部署成功，没有定义指标异常和事故触发条件。',
    ],
    sourceRefs: [
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
    ],
    steps: [
      [
        '按角色定义发布责任',
        '开发者提交版本和变更说明，发布经理检查范围与顺序，审批人确认风险和回滚条件，SRE 观察指标并决定继续或停止，安全审核员检查秘密、镜像和高权限。每个角色都写清可执行动作和证据。',
        '发布责任不能集中到一个按钮',
      ],
      [
        '把发布拆成可恢复状态机',
        '发布单从草稿进入待审批、已批准、同步中、已部署、验证中、成功或失败回滚。每个状态有进入条件、超时、负责人和副作用，停止后不能继续执行下一阶段。',
        '发布状态必须可暂停和回滚',
      ],
      [
        '版本与配置一起追踪',
        '镜像 digest、Helm values、配置版本、数据库迁移和 Git commit 共同组成发布输入。只记录镜像 tag 无法证明环境真实运行内容。',
        '发布的是一组版本化输入',
      ],
      [
        '观测和事故进入同一流程',
        '发布后必须检查错误率、延迟、SLO 和业务指标，失败可暂停、回滚或触发事故。事故记录把发布版本和时间线关联起来。',
        '部署结束不等于发布结束',
      ],
      [
        '形成首版闭环',
        '首版包含应用、环境、发布单、审批、GitOps 同步、指标关联和回滚；不做通用低代码流水线、多云成本优化和直接保存集群管理员凭据。',
        '首版必须可审计可停止',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 LaunchPad 角色任务、发布状态和证据清单。',
    goal: '能把首版限定为应用、环境、发布单、审批、Argo 同步和回滚，写出状态可追踪、越权阻断、失败回滚和 SLO 关联的可执行验收。',
    guidedPractice: '为正常发布、审批越权、GitOps 漂移、部署失败和 5 分钟回滚各写观察指标与通过线。',
    independentPractice: '交付验收矩阵、发布风险等级和审批策略，每条包含触发、观察值、证据、失败恢复和负责人。',
    commonErrors: [
      '只测发布成功，不测审批拒绝和回滚失败。',
      '用部署状态代替用户影响，没有把 SLO 和事故纳入验收。',
    ],
    sourceRefs: [
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
      'Helm Documentation. https://helm.sh/docs/',
      'Prometheus Documentation. https://prometheus.io/docs/',
    ],
    steps: [
      [
        '范围围绕一次发布闭环',
        '首版要能创建发布单、绑定应用与环境、展示版本差异、提交审批、触发 GitOps、观察同步、执行回滚并保存审计。每个功能都服务这一个闭环。',
        '范围围绕发布生命周期',
      ],
      [
        '权限和审批可验证',
        '开发者不能自批自己的高风险发布，审批人只能处理授权环境，危险操作需要额外角色。越权请求必须被服务端拒绝并写入审计。',
        '审批权限不能只隐藏按钮',
      ],
      [
        'GitOps 漂移是独立状态',
        '集群实际状态与 Git 期望不一致时显示 drift，允许重新同步或阻止发布。不能把漂移自动覆盖为成功。',
        '发布平台显示真实差异',
      ],
      [
        '失败回滚有时间和证据',
        '失败发布在目标时间窗口内回滚到上一固定版本，保存触发指标、操作者、旧新版本和冒烟结果。回滚本身就是一次受控发布。',
        '回滚需要演练和审计',
      ],
      [
        'SLO 与告警关联应用',
        '每个应用定义关键 SLI 和告警，发布详情显示同一时间窗口。没有观测对象的应用不能进入生产发布。',
        '发布验收包含用户影响',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 LaunchPad 发布状态、权限和回滚验收。',
    goal: '能定义应用、环境、发布单、审批、同步、事故和指标接口，处理幂等、版本差异、危险操作确认和实时状态更新。',
    guidedPractice: '写出创建发布、提交审批、执行同步、查看差异和回滚接口，再模拟重复提交、越权审批和 GitOps 冲突。',
    independentPractice: '交付 API 契约、错误码和前端状态矩阵，覆盖草稿、审批中、同步中、漂移、失败和回滚。',
    commonErrors: [
      '同一个发布接口可被重复调用并触发多次部署。',
      '审批接口只接收布尔值，没有记录版本、原因和审批范围。',
    ],
    sourceRefs: [
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'Kubernetes API Concepts. https://kubernetes.io/docs/reference/using-api/',
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
    ],
    steps: [
      [
        '应用与环境稳定建模',
        '应用保存代码和部署元数据，环境保存集群、命名空间、保护和审批等级。发布单引用固定应用版本和环境版本，不能靠前端重复传自由字符串。',
        '发布引用稳定对象 ID',
      ],
      [
        '创建和执行分离',
        '创建发布只保存草稿和差异，批准后才进入可执行状态。执行请求带发布版本和幂等键，重复请求返回同一同步结果。',
        '审批后也不能无限重放',
      ],
      [
        '差异接口返回结构而非文本',
        '版本差异包含镜像、配置、资源、迁移和策略变化，敏感值脱敏但不隐藏键。前端据此展示风险，不解析 kubectl 输出。',
        '差异必须可机器判断',
      ],
      [
        '实时状态与轮询兼容',
        '同步状态可以通过 SSE 或轮询更新，事件有版本和终态。断线后从接口重新读取完整状态，不能依赖只收到一次事件。',
        '状态恢复不依赖连接历史',
      ],
      [
        '危险操作需要二次确认',
        '回滚、强制同步和生产发布要求原因、目标版本和确认 token，服务端再次校验角色和环境，不信任客户端按钮状态。',
        '危险动作在服务端确认',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 LaunchPad 发布、审批和环境 API。',
    goal: '能为应用、环境、发布、审批、同步、事故和审计建立模型，用不可变版本、唯一幂等键和状态约束保证发布可追溯。',
    guidedPractice: '设计发布版本、审批记录和幂等执行表，再模拟重复执行、审批后修改差异和回滚并发。',
    independentPractice: '交付 ER 图、约束、索引和迁移计划，覆盖历史发布保留、环境保护和旧版本回滚。',
    commonErrors: [
      '审批记录只保存最终 approved，没有保存审批的输入版本。',
      '发布成功后覆盖原发布内容，事故复盘无法还原当时差异。',
    ],
    sourceRefs: [
      'PostgreSQL Documentation. https://www.postgresql.org/docs/',
      'Argo CD ApplicationSet. https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '发布输入不可变',
        '每个 release revision 保存应用版本、镜像 digest、配置、迁移和差异摘要，后续状态更新只追加事件。修改草稿产生新 revision。',
        '审批必须绑定 revision',
      ],
      [
        '审批记录包含主体与范围',
        '审批表保存用户、角色、环境、revision、原因、时间和决定，高风险发布可要求多人审批。审批后 revision 变化必须重新审批。',
        '审批不是一次性布尔标记',
      ],
      [
        '执行幂等键防止重复部署',
        '同步和回滚请求带 releaseId、revision 和 actionKey 唯一约束，同一个动作只产生一个外部操作。执行结果通过状态和事件展示。',
        '运维动作也需要幂等',
      ],
      [
        '状态约束阻止非法跳转',
        '待审批不能直接成功，失败回滚需要记录目标版本，已成功发布修改必须创建新 revision。数据库和领域层共同校验。',
        '状态机约束写入持久层',
      ],
      [
        '保留历史与审计查询索引',
        '按应用、环境、时间和操作者查询发布历史，审计记录不可修改。归档旧发布时保留索引和差异摘要。',
        '发布历史就是运维证据',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已有 LaunchPad 数据模型、发布状态机和 API 契约。',
    goal: '能建立 Go 控制面、React 控制台和本地 PostgreSQL、Argo CD 或模拟 GitOps 环境，固定配置、迁移、权限和测试入口。',
    guidedPractice: '从空目录启动控制面和控制台，创建应用、环境、发布单并让模拟 GitOps 同步到目标状态。',
    independentPractice: '删除生成物后重建环境，分别模拟数据库、Argo 不可用和配置错误，并保留启动诊断。',
    commonErrors: [
      '控制面直接持有集群管理员 kubeconfig 并允许任意 YAML。',
      '本地只模拟按钮状态，没有验证 GitOps 同步和漂移。',
    ],
    sourceRefs: [
      'Docker Compose Documentation. https://docs.docker.com/compose/',
      'Kubernetes Local Development. https://kubernetes.io/docs/tasks/tools/',
      'React Documentation. https://react.dev/',
    ],
    steps: [
      [
        '控制面与执行器分离',
        '控制台和 API 管理发布意图与审批，GitOps 执行器负责读取受控仓库和同步集群。控制面不直接保存管理员凭据，也不自由执行 YAML。',
        '权限边界隔离控制面',
      ],
      [
        '本地环境可模拟真实同步',
        '使用轻量 Kubernetes 或模拟控制器接收应用 revision，保存期望状态、实际状态和 drift。集成测试覆盖同步成功与失败。',
        '本地要验证 GitOps 语义',
      ],
      [
        '配置和秘密分层',
        '数据库、Git 仓库、集群和 OIDC 配置由环境注入，真实秘密不进入示例值。启动时检查缺失和权限。',
        '配置错误应阻止发布',
      ],
      [
        '测试入口覆盖权限和状态机',
        '单元测试覆盖审批与状态，集成测试覆盖数据库约束和 GitOps 回调，UI 测试覆盖危险操作确认。',
        '发布平台测试重点是状态和权限',
      ],
      [
        'README 跑通一次发布',
        '新成员从空目录创建应用、提交发布、审批、同步和回滚，所有版本和证据都能在界面查询。',
        '首次发布路径必须可复制',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'LaunchPad 控制面、审批和本地 GitOps 已经可运行。',
    goal: '能实现发布创建、审批锁定、同步执行、GitOps 回调、漂移检测、回滚和事故关联，处理重复执行、配置冲突和部分失败。',
    guidedPractice: '让同步请求重复到达、GitOps 返回冲突和部署后指标异常，检查发布状态、审计和回滚入口。',
    independentPractice: '为控制面与 Argo 短暂断连设计恢复，保证发布不会重复执行且最终状态可重建。',
    commonErrors: [
      'GitOps 回调丢失后发布永远停在同步中，没有主动对账。',
      '回滚只修改发布状态，没有实际切换 GitOps 版本。',
    ],
    sourceRefs: [
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
      'Helm Documentation. https://helm.sh/docs/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '审批通过锁定发布输入',
        '审批时校验 revision 未变化，批准后禁止修改输入，只允许执行或撤回。撤回和回收发布也要写审计。',
        '审批后输入不可变',
      ],
      [
        '执行器幂等提交 GitOps 操作',
        '同步请求用 actionKey 去重，GitOps 侧用应用和 revision 识别同一操作。控制面保存 operationId 和超时。',
        '同一动作只能执行一次',
      ],
      [
        '回调与主动对账结合',
        'Argo 回调更新状态，同时定时查询实际同步结果修正丢回调。终态以持久化对账和事件共同决定。',
        '不能只依赖一次回调',
      ],
      [
        '漂移和部分失败显式记录',
        '同步出现 resource diff、超时或部分资源失败时进入明确失败状态，保存资源、日志和版本，不覆盖成成功。',
        '失败详情必须可行动',
      ],
      [
        '回滚执行真实版本切换',
        '回滚请求创建新操作指向上一固定 revision，经权限与审批执行，完成后保存冒烟和指标。失败回滚进入事故。',
        '回滚不能被简化成改状态字段',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'LaunchPad 发布、审批、同步和指标接口已可联调。',
    goal: '能实现应用发布面板、版本差异、审批、同步时间线、漂移告警、回滚和事故入口，处理危险操作、失败和移动端运维。',
    guidedPractice: '走完创建发布、查看差异、审批、同步、指标异常和回滚，检查每个状态的下一步动作。',
    independentPractice: '用键盘和窄屏完成审批与回滚，补齐焦点、确认、错误和图表文本。',
    commonErrors: [
      '把高风险审批做成无上下文的绿色按钮。',
      '同步时间线只显示 loading，没有资源级失败原因。',
    ],
    sourceRefs: [
      'React Documentation. https://react.dev/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'Argo CD UI Concepts. https://argo-cd.readthedocs.io/en/stable/user-guide/ui/',
    ],
    steps: [
      [
        '发布详情围绕决策展示',
        '页面显示 revision、镜像、配置差异、影响环境、审批状态、同步资源和指标。首屏突出需要处理的异常，而不是大量静态元数据。',
        '界面服务发布决策',
      ],
      [
        '差异支持可读和机器判断',
        '结构化差异用分组与文本解释，敏感值脱敏但不隐藏变更键。用户可以定位到资源、配置和迁移。',
        '差异展示不能只贴 YAML',
      ],
      [
        '审批包含上下文和原因',
        '审批面板显示 revision、风险、回滚版本和将影响的环境，要求填写原因。审批失败保留状态并给出权限或冲突说明。',
        '审批按钮必须有完整上下文',
      ],
      [
        '同步时间线与指标关联',
        '每个资源状态、操作者、时间和错误可展开，发布后的错误率和 SLO 在同一视图。异常时提供停止和回滚。',
        '运维界面保持时间线一致',
      ],
      [
        '键盘和移动端可执行回滚',
        '关键操作可用键盘完成，移动端采用分组列表，危险按钮有标签和确认，不依赖悬浮小图标。',
        '关键恢复动作触手可及',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'LaunchPad 发布主流程、权限和 GitOps 状态已可运行。',
    goal: '能验证审批越权、重复执行、GitOps 冲突、漂移、回滚、审计和发布列表性能，覆盖控制面与真实执行器。',
    guidedPractice: '重复发送审批和执行请求，制造 GitOps 漂移和回滚失败，检查数据库、审计和用户提示。',
    independentPractice: '完成安全与性能报告，覆盖权限矩阵、危险操作、查询分页、审计完整性和回归。',
    commonErrors: [
      '只在 UI 隐藏审批按钮，API 仍允许任意用户批准。',
      '发布历史无分页索引，应用多版本后列表拖慢整个控制台。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Playwright Documentation. https://playwright.dev/docs/intro',
      'Kubernetes Testing. https://kubernetes.io/docs/tasks/debug/',
    ],
    steps: [
      [
        '权限矩阵覆盖所有动作',
        '开发者、发布经理、审批人、SRE 和安全员对创建、批准、同步、回滚、查看秘密分别有明确权限，服务端和 UI 双重校验。',
        'API 是最终权限边界',
      ],
      [
        '状态机做并发测试',
        '重复审批、审批后修改 revision、并发同步和回滚都必须只有一个合法结果，数据库约束和版本检查参与验证。',
        '并发测试围绕 revision',
      ],
      [
        'GitOps 故障注入',
        '模拟 Argo 不可达、回调丢失、资源部分失败和 drift，验证主动对账、审计和用户可见状态。',
        '同步失败不能停在 loading',
      ],
      [
        '安全测试覆盖秘密和执行边界',
        '控制面不能接受任意 YAML 和集群凭据，日志脱敏，审批和回滚有原因与操作者。',
        '发布平台是高权限系统',
      ],
      [
        '性能测试查询与时间线',
        '大量应用、发布历史和同步事件下测试分页、索引和前端渲染，避免一次性加载全部审计。',
        '历史数据会持续增长',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'LaunchPad 测试、安全矩阵和真实 GitOps 环境已经建立。',
    goal: '能为发布控制台和控制面构建固定制品，配置 Kubernetes、权限、探针、指标和告警，并用 GitOps 发布自身与回滚。',
    guidedPractice: '用平台发布自身新版本，制造一个错误配置触发自动暂停和回滚，保存全部审计。',
    independentPractice: '交付发布记录，包含镜像 digest、迁移、配置、审批、同步、告警和回滚证据。',
    commonErrors: [
      '发布平台自身升级绕过平台审批。',
      '控制面和执行器共用高权限账户。',
    ],
    sourceRefs: [
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '平台自身也走发布流程',
        '控制台、API 和执行器用独立制品和版本，升级自身时使用同一审批、GitOps、冒烟和回滚流程。',
        '吃自己的发布流程',
      ],
      [
        '最小权限划分控制器',
        'API 只拥有业务数据库和配置权限，执行器拥有受限的目标环境权限，二者通过明确接口协作。',
        '高权限执行器单独隔离',
      ],
      [
        '指标覆盖发布闭环',
        '仪表盘显示发布数、审批等待、同步成功率、漂移、回滚时间、失败资源和 SLO 影响，日志中保留 releaseId。',
        '发布平台也要可观测',
      ],
      [
        '冒烟与自动暂停',
        '发布后自动检查关键接口和指标，错误率或 SLO 超阈值时暂停后续阶段并提示回滚。',
        '自动暂停保留人工决策',
      ],
      [
        '回滚平台自身可验证',
        '控制面或执行器回滚后检查历史发布、审批和指标仍可查询，已有 GitOps 操作不被重复触发。',
        '回滚平台不能丢失审计',
      ],
    ],
  },
  {
    name: '综合训练 · LaunchPad 发布平台 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'LaunchPad 已部署，具备审批、GitOps、指标、回滚和事故流程。',
    goal: '能演练 GitOps 漂移、错误镜像、审批越权、回调丢失、SLO 下降和回滚失败，完成恢复、审计和平台答辩。',
    guidedPractice: '发布一个错误镜像并制造 GitOps 回调丢失，观察自动暂停、告警、人工回滚和审计。',
    independentPractice: '写事故报告，区分触发、放大、根因、恢复、用户影响和修复项，并给出版本与时间线。',
    commonErrors: [
      '演练只关注平台界面，不检查目标集群和用户指标。',
      '复盘没有分析审批策略和控制面权限为何允许错误发布。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Argo CD Troubleshooting. https://argo-cd.readthedocs.io/en/stable/operator-manual/troubleshooting/',
      'Kubernetes Debugging. https://kubernetes.io/docs/tasks/debug/',
    ],
    steps: [
      [
        '漂移演练验证对账',
        '手动修改目标资源制造 drift，平台显示差异并阻止错误继续发布，重新同步后保存资源状态。',
        '漂移必须可见可处理',
      ],
      [
        '错误镜像演练自动暂停',
        '发布错误 tag 或 digest，在冒烟失败后暂停并触发告警，执行回滚到上一固定 revision。',
        '暂停和回滚都要记录指标',
      ],
      [
        '审批越权演练',
        '尝试自批、跨环境审批和审批后修改 revision，服务端拒绝并保存审计。',
        '权限故障也要有回归',
      ],
      [
        '回调丢失演练主动对账',
        '断开 Argo 回调，让发布进入等待，主动查询和定时对账恢复终态并避免重复执行。',
        '回调不是唯一真相',
      ],
      [
        '答辩解释治理与恢复',
        '回答为何控制面与执行器分离、审批绑定 revision、回滚创建新操作，以及 SLO 如何进入发布决策；用演练和审计数据证明。',
        '发布平台答辩强调可追溯',
      ],
    ],
  },
];

const LAUNCHPAD_STEP_SUFFIXES: Readonly<Record<string, string>> = {
  '观测和事故进入同一流程': '每个事故都要关联 releaseId、版本和时间线。',
  '形成首版闭环': '每项非目标要绑定未来触发条件和安全前提。',
  '权限和审批可验证': '审批权限必须在 API、数据库和审计三层一致。',
  'GitOps 漂移是独立状态': '漂移处理动作和结果需要保留审计。',
  '失败回滚有时间和证据': '回滚结果必须包含指标、版本和冒烟结果。',
  'SLO 与告警关联应用': '每个生产应用至少定义一项用户 SLI。',
  '创建和执行分离': '执行必须引用已批准 revision 和幂等键。',
  '差异接口返回结构而非文本': '前端根据结构识别镜像、配置和迁移风险。',
  '实时状态与轮询兼容': '事件断线后从完整快照恢复最终状态。',
  '危险操作需要二次确认': '确认 token 绑定 revision 和当前用户。',
  '状态约束阻止非法跳转': '非法转换返回稳定冲突码并保留原状态。',
  '保留历史与审计查询索引': '按应用、环境、时间和操作者组合查询，并保留归档策略。',
  '配置和秘密分层': '缺失配置在启动时失败，秘密只在运行时注入。',
  '测试入口覆盖权限和状态机': '集成测试使用真实数据库和模拟 GitOps。',
  'README 跑通一次发布': '文档包含创建、审批、同步、回滚和审计命令。',
  '审批通过锁定发布输入': '撤回和重新审批要生成新状态事件。',
  '回调与主动对账结合': '超时任务定期读取实际同步状态并修正。',
  '漂移和部分失败显式记录': '资源级错误和日志要能定位到具体对象。',
  '回滚执行真实版本切换': '回滚完成后执行冒烟并记录新旧版本。',
  '差异支持可读和机器判断': '敏感值脱敏但变更键、风险标记和资源归属不能隐藏。',
  '审批包含上下文和原因': '审批失败要说明权限、冲突或 revision 已变化。',
  '同步时间线与指标关联': '资源和指标共享同一发布时间窗口。',
  '键盘和移动端可执行回滚': '危险动作使用文字标签并保留二次确认和操作者记录。',
  '权限矩阵覆盖所有动作': '每个 API 都有正反权限用例和审计断言。',
  '状态机做并发测试': '重复审批和执行只能产生一个合法终态。',
  'GitOps 故障注入': '模拟回调丢失、部分失败和漂移后的对账。',
  '安全测试覆盖秘密和执行边界': '控制面不能接受任意 YAML 或管理员凭据，并验证审计。',
  '性能测试查询与时间线': '历史事件分页、索引、渲染和分页上限都要有基线。',
  '平台自身也走发布流程': '自身升级同样需要审批、冒烟和回滚。',
  '最小权限划分控制器': '控制面与执行器使用独立账户和权限范围。',
  '指标覆盖发布闭环': '审批等待、同步成功率、漂移和回滚时间都可见。',
  '冒烟与自动暂停': '阈值触发时暂停后续阶段并保留人工决策。',
  '回滚平台自身可验证': '回滚后历史、审批和执行操作仍可查询。',
  '漂移演练验证对账': '重新同步后保存资源差异和恢复时间线。',
  '错误镜像演练自动暂停': '失败冒烟触发告警并引导执行回滚。',
  '审批越权演练': '自批、跨环境和 revision 变更均被服务端阻断。',
  '回调丢失演练主动对账': '定时对账恢复终态，不重复执行同步，并保存超时恢复证据。',
};

const LAUNCHPAD_EXAMPLE_ENTRIES: readonly [string, LearningV2LessonExample][] = [
  ['按角色定义发布责任', {
    title: '用发布策略文件验证四类角色',
    language: 'YAML',
    code: `# launch-policy.yaml
roles:
  developer: [release:create, release:submit]
  release-manager: [release:review, release:schedule]
  approver: [release:approve, release:reject]
  sre: [release:pause, release:rollback, metrics:read]
  security: [image:inspect, secret:review, audit:read]
forbidden:
  - developer:release:approve
  - security:release:execute
commands:
  - yq '.roles.approver' launch-policy.yaml
  - yq '.forbidden[]' launch-policy.yaml`,
    output: `预期输出包含 approver 的 release:approve/release:reject，并列出 developer 自批与 security 执行发布两条禁止组合。
失败边界：缺少 metrics:read 时 SRE 无法形成发布后停走证据；若角色可同时创建和审批高风险发布，策略检查必须失败。`,
  }],
  ['把发布拆成可恢复状态机', {
    title: '拒绝跳跃的发布状态转换',
    language: 'TypeScript',
    code: `type ReleaseState = 'draft' | 'pending' | 'approved' | 'syncing' | 'verifying' | 'succeeded' | 'rolled-back';
const allowed: Record<ReleaseState, readonly ReleaseState[]> = {
  draft: ['pending'], pending: ['approved', 'draft'], approved: ['syncing', 'draft'],
  syncing: ['verifying', 'rolled-back'], verifying: ['succeeded', 'rolled-back'],
  succeeded: [], 'rolled-back': ['draft'],
};
export function assertTransition(from: ReleaseState, to: ReleaseState) {
  if (!allowed[from].includes(to)) throw new Error('illegal release transition: ' + from + ' -> ' + to);
}
assertTransition('approved', 'syncing');
assertTransition('pending', 'succeeded');`,
    output: `第二行 assertTransition 抛出 illegal release transition: pending -> succeeded。
预期正确路径输出 approved -> syncing 校验通过；失败边界是同步超时后仍必须进入 rolled-back 或人工事故状态，不能直接写成 succeeded。`,
  }],
  ['版本与配置一起追踪', {
    title: '生成不可歧义的发布输入摘要',
    language: 'PowerShell',
    code: `$release = [ordered]@{
  app = 'checkout'
  image = 'registry.example/checkout@sha256:3f2a91'
  chart = '1.8.4'
  commit = 'c1a7e5d'
  valuesSha = (Get-FileHash .\\values-prod.yaml -Algorithm SHA256).Hash.ToLower()
  migration = '20261124_add_refund_reason.sql'
}
$release | ConvertTo-Json -Compress | Set-Content release-input.json
$digest = (Get-FileHash release-input.json -Algorithm SHA256).Hash.ToLower()
"release-input=$digest"`,
    output: `release-input=8c18...（由镜像 digest、chart、commit、values 哈希和迁移文件名共同计算）。
失败边界：仅有 image:latest 时应停止发布；values 文件或迁移变化但 release-input 摘要未变化，说明追踪链存在缺口。`,
  }],
  ['观测和事故进入同一流程', {
    title: '把发布窗口中的错误率与版本关联',
    language: 'PromQL',
    code: `curl -sG http://prometheus.test/api/v1/query \\
  --data-urlencode 'query=sum(rate(http_requests_total{job="checkout",status=~"5.."}[5m])) by (revision)
  / sum(rate(http_requests_total{job="checkout"}[5m])) by (revision)' \\
  --data-urlencode "time=$RELEASE_STARTED_AT" | jq '.data.result'

# 发布详情只接受同一 revision 的 SLO 和事故记录
jq '.revision, .errorRate, .sloBurn, .incidentId' release-42.json`,
    output: `查询结果按 revision 返回 5xx 比例，例如 revision=7d9c 时 errorRate=0.042；超过门限则发布会进入 verifying 并触发 incidentId。
失败边界：指标没有 revision 标签时不能拿集群总错误率冒充本次发布；Prometheus 查询失败时应暂停推进并显示观测缺口。`,
  }],
  ['形成首版闭环', {
    title: '用验收清单锁定首版边界',
    language: 'YAML',
    code: `version: 1
flow:
  - create-release
  - bind-application-and-environment
  - show-structured-diff
  - approve-revision
  - sync-through-argocd
  - verify-slo
  - rollback-to-fixed-revision
evidence:
  required: [actor, revision, timestamp, command-result, metric-window]
excluded: [free-form-yaml-editor, multi-cloud-cost-optimizer, cluster-admin-token]
command: yq '.flow | length' launchpad-scope.yaml`,
    output: `yq 输出 7，表示首版闭环只有七个可验证阶段；excluded 中的能力不能进入本期交付。
失败边界：任何新增能力若不能关联 actor、revision、时间线和可验证结果，应退回需求池，而不是扩展首版范围。`,
  }],
  ['范围围绕一次发布闭环', {
    title: '用真实 API 串联创建到查询',
    language: 'Shell',
    code: `release_id=$(curl -fsS -X POST http://localhost:8080/api/releases \\
  -H 'Content-Type: application/json' \\
  -d '{"applicationId":"checkout","environmentId":"prod","revision":"sha256:3f2a91"}' | jq -r .id)
curl -fsS http://localhost:8080/api/releases/$release_id | jq '{id,state,diff,approval}'
curl -fsS -X POST http://localhost:8080/api/releases/$release_id/submit | jq .state`,
    output: `第一条查询返回 draft 状态和结构化 diff；submit 后 state 变为 pending，并生成 approval 对象。
失败边界：重复 POST 创建请求时应使用 idempotency-key 返回同一 release；查询不到 applicationId 或 environmentId 必须返回 404，而不是创建孤立发布单。`,
  }],
  ['权限和审批可验证', {
    title: '用策略测试证明不能自批',
    language: 'Rego',
    code: `package launchpad.approval

default allow := false
allow if {
  input.action == "release:approve"
  input.actor.role == "approver"
  input.actor.id != input.release.creatorId
  input.environment in input.actor.environments
  input.release.risk == "high"
  count(input.approvals) >= 2
}

test_creator_cannot_self_approve {
  not allow with input as {"action":"release:approve","actor":{"id":"u1","role":"approver","environments":["prod"]},"release":{"creatorId":"u1","risk":"high"},"approvals":[]}
}`,
    output: `OPA 测试通过，creator 自己提交的高风险发布 allow=false；换成一个不同 approver 且已有另一名审批人后才允许。
失败边界：只在前端隐藏批准按钮不合格，直接调用 API 仍必须被策略层拒绝并写入 actor、releaseId 和拒绝原因。`,
  }],
  ['GitOps 漂移是独立状态', {
    title: '检测 Git 期望与集群实际差异',
    language: 'Shell',
    code: `argocd app diff checkout-prod --refresh > drift.diff || true
if [ -s drift.diff ]; then
  jq -n --arg app checkout-prod --arg revision "$GIT_SHA" \\
    '{app:$app,revision:$revision,state:"drift",diffFile:"drift.diff"}'
  argocd app get checkout-prod -o json | jq '{sync:.status.sync,health:.status.health}'
else
  echo '{"state":"clean","result":"no-diff"}'
fi`,
    output: `集群被手工改动时输出 state=drift 并保留 drift.diff，例如 Deployment replicas 从 3 被改成 1；重新同步后再次执行命令应输出 state=clean。
失败边界：Argo CD 不可达时不能把空 diff 当作 clean，应记录 query-error 并阻止发布继续。`,
  }],
  ['失败回滚有时间和证据', {
    title: '按固定 revision 执行可审计回滚',
    language: 'PowerShell',
    code: `$started = Get-Date
$target = Get-Content .\\previous-release.json | ConvertFrom-Json
argocd app set checkout-prod --revision $target.gitSha
argocd app sync checkout-prod --timeout 300
$smoke = Invoke-RestMethod http://checkout.test/health/ready
$elapsed = ((Get-Date) - $started).TotalSeconds
@{
  releaseId = 42; targetRevision = $target.gitSha; smoke = $smoke.status
  elapsedSeconds = [math]::Round($elapsed, 1); operator = $env:USERNAME
} | ConvertTo-Json | Set-Content rollback-evidence.json`,
    output: `rollback-evidence.json 记录 targetRevision、smoke=ready 和例如 elapsedSeconds=73.4，并绑定操作者。
失败边界：超时或 smoke 不是 ready 时保留失败状态并升级事故；只修改数据库状态而没有实际切换 revision 不构成回滚。`,
  }],
  ['SLO 与告警关联应用', {
    title: '为发布增加应用级 SLO 规则',
    language: 'YAML',
    code: `groups:
  - name: launchpad-checkout
    rules:
      - alert: CheckoutReleaseErrorBudgetBurn
        expr: |
          sum(rate(http_requests_total{app="checkout",status=~"5.."}[5m]))
          / sum(rate(http_requests_total{app="checkout"}[5m])) > 0.02
        for: 5m
        labels: {severity: release-blocker, app: checkout}
        annotations: {runbook: "https://runbooks.test/checkout/rollback"}
commands:
  - promtool check rules checkout-slo.yaml
  - curl -s http://prometheus.test/api/v1/rules | jq '.data.groups[].name'`,
    output: `promtool 返回 SUCCESS，Prometheus rules 列表出现 launchpad-checkout；冒烟指标超过 2% 时告警状态为 firing。
失败边界：应用没有 app 标签或 runbook 时不能进入生产发布；告警配置存在但从未触发过的规则需要专项注入验证。`,
  }],
  ['应用与环境稳定建模', {
    title: '用外键固定发布对象',
    language: 'SQL',
    code: `CREATE TABLE application (id text PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE environment (
  id text PRIMARY KEY, cluster text NOT NULL, namespace text NOT NULL,
  protected boolean NOT NULL DEFAULT false, UNIQUE(cluster, namespace)
);
CREATE TABLE release (
  id uuid PRIMARY KEY, application_id text NOT NULL REFERENCES application(id),
  environment_id text NOT NULL REFERENCES environment(id), revision text NOT NULL,
  state text NOT NULL DEFAULT 'draft', UNIQUE(application_id, environment_id, revision)
);
INSERT INTO environment VALUES ('prod', 'cluster-a', 'checkout', true);
SELECT r.id FROM release r WHERE r.environment_id = 'prod';`,
    output: `release 表拒绝不存在的 application_id 或 environment_id；prod 绑定稳定 ID，而不是前端传入的自由文本。
失败边界：如果绕过 service 直接拼接 cluster 和 namespace 字符串，UI 改名后历史发布仍应能通过 environment_id 回溯。`,
  }],
  ['创建和执行分离', {
    title: '审批后使用幂等键执行',
    language: 'TypeScript',
    code: `app.post('/releases/:id/execute', async (req, res) => {
  const release = await db.release.find(req.params.id);
  if (release.state !== 'approved') return res.status(409).json({code: 'RELEASE_NOT_APPROVED'});
  const key = req.header('idempotency-key');
  if (!key) return res.status(400).json({code: 'IDEMPOTENCY_KEY_REQUIRED'});
  const operation = await db.operation.upsert({
    where: {releaseId_actionKey: {releaseId: release.id, actionKey: key}},
    create: {releaseId: release.id, actionKey: key, state: 'queued'},
    update: {},
  });
  res.status(202).json({operationId: operation.id, state: operation.state});
});`,
    output: `同一 release 与 idempotency-key 连续调用两次返回相同 operationId；未批准发布返回 HTTP 409 与 RELEASE_NOT_APPROVED。
失败边界：actionKey 不能由请求体任意覆盖，重复请求也不能再向 Argo 创建第二个同步操作。`,
  }],
  ['差异接口返回结构而非文本', {
    title: '输出可渲染的结构化发布差异',
    language: 'JSON',
    code: `{
  "releaseId": "42",
  "changes": [
    {"kind":"image","key":"containers[0].image","before":"sha256:3f2a91","after":"sha256:bd802e","risk":"medium"},
    {"kind":"config","key":"env.REFUND_TIMEOUT","before":"5s","after":"2s","risk":"high"},
    {"kind":"migration","key":"db/20261124.sql","before":null,"after":"add-refund-reason","risk":"high"}
  ],
  "sensitiveKeysHidden": ["env.STRIPE_SECRET"]
}
// jq -e '.changes | all(has("kind") and has("risk"))' diff.json`,
    output: `jq 返回 true，前端可以按 kind 和 risk 分组；秘密值未出现，但 env.STRIPE_SECRET 的键仍由 sensitiveKeysHidden 标出。
失败边界：若接口返回一段 kubectl diff 文本，前端无法可靠判断迁移风险、敏感键或资源归属，应视为契约不合格。`,
  }],
  ['实时状态与轮询兼容', {
    title: '事件断线后恢复完整发布快照',
    language: 'JavaScript',
    code: `const stream = new EventSource('/api/releases/42/events');
stream.onmessage = (event) => {
  const data = JSON.parse(event.data);
  renderRelease(data);
  if (data.terminal) stream.close();
};
stream.onerror = async () => {
  stream.close();
  const snapshot = await fetch('/api/releases/42').then((r) => r.json());
  renderRelease(snapshot);
  if (!snapshot.terminal) reconnectWithBackoff();
};
// 轮询测试：curl /api/releases/42 | jq '.state,.version,.terminal'`,
    output: `断开 SSE 后，snapshot 返回当前 state、version 和 terminal；未终态时客户端按退避重连，不会只等待丢失事件。
失败边界：服务端返回过期 snapshot 或没有 version 时可能导致倒退，必须比较版本并拒绝覆盖更高版本状态。`,
  }],
  ['危险操作需要二次确认', {
    title: '服务端校验危险操作确认令牌',
    language: 'TypeScript',
    code: `function verifyRollback(input: {releaseId: string; revision: string; actorId: string; token: string}) {
  const payload = jwt.verify(input.token, process.env.CONFIRM_SECRET!) as Record<string, string>;
  const expiresIn = Number(payload.exp) * 1000 - Date.now();
  if (payload.releaseId !== input.releaseId || payload.revision !== input.revision || payload.actorId !== input.actorId) {
    throw new Error('CONFIRMATION_SCOPE_MISMATCH');
  }
  if (expiresIn <= 0) throw new Error('CONFIRMATION_EXPIRED');
  return {reason: payload.reason, expiresIn};
}
console.log(verifyRollback(request));`,
    output: `匹配 releaseId、revision、actorId 且未过期的 token 返回 reason 和剩余有效期；跨发布复用返回 CONFIRMATION_SCOPE_MISMATCH。
失败边界：确认 token 必须由服务端在展示危险操作上下文后签发，客户端按钮 disabled 不能替代权限、revision 和环境中任一校验。`,
  }],
  ['发布输入不可变', {
    title: '用数据库触发器保护发布修订',
    language: 'SQL',
    code: `CREATE TABLE release_revision (
  id uuid PRIMARY KEY, release_id uuid NOT NULL, revision_no integer NOT NULL,
  input jsonb NOT NULL, input_sha256 text NOT NULL, immutable boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION reject_sealed_revision() RETURNS trigger AS $$
BEGIN
  IF OLD.immutable THEN RAISE EXCEPTION 'release revision is sealed'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER seal_revision BEFORE UPDATE ON release_revision
FOR EACH ROW EXECUTE FUNCTION reject_sealed_revision();
UPDATE release_revision SET input = input || '{"image":"other"}' WHERE id = '11111111-1111-1111-1111-111111111111';`,
    output: `immutable=true 的修订更新抛出 release revision is sealed，原 input 和 input_sha256 保持不变。
失败边界：审批后修改草稿内容必须创建新 revision；如果应用层可覆盖 input 而没有触发器或约束保护，事故复盘无法还原真实发布输入。`,
  }],
  ['审批记录包含主体与范围', {
    title: '记录绑定 revision 的双人审批',
    language: 'SQL',
    code: `ALTER TABLE approval ADD CONSTRAINT approval_scope_unique
  UNIQUE (release_id, revision_no, approver_id, environment_id);
INSERT INTO approval (release_id, revision_no, approver_id, role, environment_id, decision, reason)
VALUES ('42', 7, 'alice', 'approver', 'prod', 'approved', '双人审批完成，监控窗口正常')
ON CONFLICT DO NOTHING;
SELECT release_id, revision_no, approver_id, environment_id, decision, decided_at
FROM approval WHERE release_id = '42' AND revision_no = 7 ORDER BY decided_at;`,
    output: `查询返回同一 revision 的两条不同 approver_id 记录；重复提交 alice 不会新增记录。
失败边界：如果 release 从 revision 7 改为 8，旧审批仍可审计但不得被当成新 revision 的有效批准。`,
  }],
  ['执行幂等键防止重复部署', {
    title: '用唯一约束保证只触发一次同步',
    language: 'SQL',
    code: `CREATE TABLE release_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), release_id uuid NOT NULL,
  revision_no integer NOT NULL, action text NOT NULL, action_key text NOT NULL,
  state text NOT NULL, provider_id text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, revision_no, action, action_key)
);
INSERT INTO release_operation (release_id, revision_no, action, action_key, state)
VALUES ('11111111-1111-1111-1111-111111111111', 7, 'sync', 'req-9f1', 'queued')
ON CONFLICT (release_id, revision_no, action, action_key)
DO UPDATE SET state = release_operation.state
RETURNING id, state;`,
    output: `第一次插入生成 operation，第二次相同 action_key 返回同一行且 provider_id 不被覆盖；外层执行器只看到一次待处理操作。
失败边界：进程在写 provider_id 前崩溃时，对账任务必须用同一唯一键恢复，而不是新建同步导致重复部署。`,
  }],
  ['状态约束阻止非法跳转', {
    title: '在数据库中拒绝非法发布状态',
    language: 'SQL',
    code: `ALTER TABLE release ADD CONSTRAINT release_state_check
  CHECK (state IN ('draft','pending','approved','syncing','verifying','succeeded','failed','rolled-back'));
CREATE OR REPLACE FUNCTION enforce_release_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'pending' AND NEW.state = 'succeeded' THEN RAISE EXCEPTION 'pending cannot become succeeded'; END IF;
  IF OLD.state = 'succeeded' AND NEW.state <> 'succeeded' THEN RAISE EXCEPTION 'terminal success is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
UPDATE release SET state = 'succeeded' WHERE id = '42' AND state = 'pending';`,
    output: `更新抛出 pending cannot become succeeded；失败回滚必须走 syncing/verifying 对应状态并留下事件记录。
失败边界：应用层和数据库都要检查，直接执行 SQL 或并发更新不能绕过状态机；合法重试仍需通过 revision 和操作键判断。`,
  }],
  ['保留历史与审计查询索引', {
    title: '验证发布历史查询使用索引',
    language: 'SQL',
    code: `CREATE INDEX release_history_lookup ON release_event (application_id, environment_id, occurred_at DESC);
CREATE INDEX release_history_actor ON release_event (actor_id, occurred_at DESC);
EXPLAIN (ANALYZE, BUFFERS)
SELECT release_id, event_type, actor_id, occurred_at, payload
FROM release_event
WHERE application_id = 'checkout' AND environment_id = 'prod'
ORDER BY occurred_at DESC LIMIT 50;
SELECT pg_size_pretty(pg_total_relation_size('release_event'));`,
    output: `执行计划显示 Index Scan 或 Bitmap Index Scan 命中 release_history_lookup，并受 LIMIT 50 约束；不出现全表排序。
失败边界：事件量增长后若查询扫描大量历史，应使用归档或分区，不能删除审计；索引未命中时检查过滤列顺序和时间范围。`,
  }],
  ['控制面与执行器分离', {
    title: '只给执行器目标命名空间权限',
    language: 'YAML',
    code: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: {name: launchpad-deployer, namespace: checkout-prod}
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: {name: launchpad-deployer, namespace: checkout-prod}
subjects: [{kind: ServiceAccount, name: launchpad-executor, namespace: platform}]
roleRef: {kind: Role, name: launchpad-deployer, apiGroup: rbac.authorization.k8s.io}
# kubectl auth can-i --as=system:serviceaccount:platform:launchpad-executor delete secrets -n checkout-prod`,
    output: `权限查询返回 no；执行器可以更新 checkout-prod 的 Deployment，但不能删除 Secret 或访问其他命名空间。
失败边界：执行器若绑定 cluster-admin 或能创建 RoleBinding，最小权限失效；控制面只应提交受限操作意图，不保存该账户令牌。`,
  }],
  ['本地环境可模拟真实同步', {
    title: '本地启动可制造漂移的 GitOps 假执行器',
    language: 'YAML',
    code: `services:
  postgres:
    image: postgres:16-alpine
    environment: {POSTGRES_DB: launchpad, POSTGRES_PASSWORD: local-only}
    ports: ["5432:5432"]
  gitops-sim:
    build: ./tools/gitops-sim
    environment:
      CONTROL_API: http://api:8080
      FAULT_MODE: none
    ports: ["8090:8090"]
  api:
    build: ./apps/api
    environment: {DATABASE_URL: postgres://postgres:local-only@postgres:5432/launchpad, GITOPS_URL: http://gitops-sim:8090}
    ports: ["8080:8080"]
    depends_on: [postgres, gitops-sim]`,
    output: `docker compose up 后 API 能创建 revision、执行同步并查询实际状态；把 FAULT_MODE 改为 drift 可复现差异而不是只测成功。
失败边界：模拟器不能直接写数据库或伪造成功回调；测试需通过 HTTP 契约触发，才能覆盖真实执行器边界。`,
  }],
  ['配置和秘密分层', {
    title: '启动时拒绝缺失配置与明文秘密',
    language: 'PowerShell',
    code: `$required = 'DATABASE_URL','GITOPS_URL','OIDC_ISSUER'
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "missing configuration: $($missing -join ',')" }
if ($env:DATABASE_URL -match 'password=') { throw 'secret embedded in database URL' }
$values = Get-Content .\\helm\\values-prod.yaml -Raw | ConvertFrom-Yaml
if ($values.env.STRIPE_SECRET) { throw 'plaintext secret in values' }
@{
  databaseHost = ([uri]$env:DATABASE_URL).Host
  gitopsHost = ([uri]$env:GITOPS_URL).Host
  secretSource = 'external-secrets'
} | ConvertTo-Json`,
    output: `配置完整且秘密来自外部注入时输出数据库/GitOps 主机名和 secretSource=external-secrets，不打印令牌。
失败边界：缺任意必需变量启动失败；若 values-prod.yaml 出现真实秘密，任何环境启动都应拒绝并记录键名而非值。`,
  }],
  ['测试入口覆盖权限和状态机', {
    title: '同时测试审批拒绝与合法同步',
    language: 'TypeScript',
    code: `import { describe, expect, it } from 'vitest';
describe('release workflow', () => {
  it('rejects self-approval and allows approved execution once', async () => {
    const created = await api.post('/releases').send({creator: 'u1', environment: 'prod', risk: 'high'});
    const denied = await api.post('/releases/' + created.body.id + '/approve').set(auth('u1')).send({reason: 'self'});
    expect(denied.status).toBe(403);
    await approveBy(created.body.id, 'u2');
    const first = await api.post('/releases/' + created.body.id + '/execute').set(idempotency('run-1'));
    const second = await api.post('/releases/' + created.body.id + '/execute').set(idempotency('run-1'));
    expect(first.body.operationId).toBe(second.body.operationId);
  });
});`,
    output: `测试断言 403 拒绝自批，并使用同一幂等键得到相同 operationId；集成测试使用真实数据库约束。
失败边界：只 mock service 无法证明数据库唯一约束和权限中间件生效；缺少失败回滚用例仍应视为覆盖不足。`,
  }],
  ['README 跑通一次发布', {
    title: '用脚手架脚本复现首条发布',
    language: 'Shell',
    code: `set -euo pipefail
pnpm local:up
pnpm db:migrate
pnpm seed:launchpad
APP_ID=$(curl -fsS http://localhost:8080/api/apps/checkout | jq -r .id)
RELEASE_ID=$(curl -fsS -X POST http://localhost:8080/api/releases \\
  -H 'content-type: application/json' -d "{\"appId\":\"$APP_ID\",\"environment\":\"staging\",\"revision\":\"$GIT_SHA\"}" | jq -r .id)
pnpm release:approve -- "$RELEASE_ID"
pnpm release:sync -- "$RELEASE_ID"
curl -fsS http://localhost:8080/api/releases/"$RELEASE_ID" | jq '{state,diff,slo}'`,
    output: `从空数据库执行成功后最终 JSON 显示 state=succeeded、diff 非空、slo 窗口存在；README 中的命令可直接复制执行。
失败边界：README 若依赖团队私有集群凭据或手工点击才能完成，不满足新人从零跑通标准；失败时应能按日志定位具体阶段。`,
  }],
  ['审批通过锁定发布输入', {
    title: '审批时比较 revision 哈希',
    language: 'TypeScript',
    code: `async function approveRelease(id: string, expectedSha: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const revision = await tx.releaseRevision.findFirst({where: {releaseId: id}, orderBy: {revisionNo: 'desc'}});
    if (!revision) throw new Error('REVISION_NOT_FOUND');
    if (revision.inputSha256 !== expectedSha) throw new Error('REVISION_CHANGED');
    await tx.approval.create({data: {releaseId: id, revisionNo: revision.revisionNo, approverId: actor.id, decision: 'approved'}});
    await tx.releaseRevision.update({where: {id: revision.id}, data: {immutable: true}});
  });
}
await approveRelease('42', 'sha256:7af9', {id: 'alice'});`,
    output: `哈希一致时审批写入并锁定对应 revision；expectedSha 与最新 revision 不同时抛 REVISION_CHANGED，审批不落库。
失败边界：不能先锁最新行再异步审批，否则并发新 revision 可插入；事务、最新修订查询和唯一约束必须共同生效。`,
  }],
  ['执行器幂等提交 GitOps 操作', {
    title: '查询已有操作后再提交 Argo',
    language: 'Go',
    code: `func (e *Executor) Sync(ctx context.Context, req OperationRequest) (Operation, error) {
  op, created, err := e.store.Claim(ctx, req.ReleaseID, req.Revision, req.ActionKey)
  if err != nil || !created { return op, err }
  sync, err := e.argo.Sync(ctx, req.Application, req.Revision)
  if err != nil {
    return e.store.MarkFailed(ctx, op.ID, classify(err))
  }
  return e.store.MarkRunning(ctx, op.ID, sync.ProviderID)
}
// 同 actionKey 第二次调用 Claim 返回 created=false，不再次访问 Argo。`,
    output: `首次 Claim 后 Argo 同步一次并保存 providerID；重复调用返回已有 operation，Argo 请求计数保持不变。
失败边界：调用 Argo 成功后数据库更新失败时，对账必须按 providerID/revision 找回结果，不能盲目重提；权限错误应永久失败并告警。`,
  }],
  ['回调与主动对账结合', {
    title: '回调丢失后由定时对账收敛',
    language: 'TypeScript',
    code: `async function reconcileSyncingReleases() {
  const stale = await db.release.findMany({where: {state: 'syncing', updatedAt: {lt: new Date(Date.now() - 120_000)}}});
  for (const release of stale) {
    const app = await argo.getApplication(release.applicationName);
    const state = app.status.sync.status === 'Synced' && app.status.health.status === 'Healthy' ? 'verifying' : 'syncing';
    await db.releaseEvent.create({data: {releaseId: release.id, type: 'reconcile', observed: app.status, state}});
    await db.release.updateMany({where: {id: release.id, state: 'syncing'}, data: {state}});
  }
}
setInterval(reconcileSyncingReleases, 30_000);`,
    output: `断开回调两分钟后任务读取 Argo 实际状态，追加 observe/reconcile 事件并将 release 推进到 verifying；重复执行不会产生重复终态。
失败边界：Argo 查询失败必须记录错误并保留 syncing 或超时，不可把空响应当成功；对账更新应使用版本条件避免覆盖并发回滚。`,
  }],
  ['漂移和部分失败显式记录', {
    title: '保留资源级同步失败证据',
    language: 'Shell',
    code: `kubectl get deployment,configmap,secret -n checkout-prod -o json > actual.json
jq -n --slurpfile expected expected.json --slurpfile actual actual.json '{
  revision: "c1a7e5d",
  failedResources: [
    {kind: "Deployment", name: "checkout-api", reason: "ImagePullBackOff"},
    {kind: "ConfigMap", name: "checkout-limits", reason: "Forbidden"}
  ],
  observedAt: now | todate
}' > sync-failure.json
cat sync-failure.json`,
    output: `sync-failure.json 保存具体 kind、name、reason 和 observedAt；发布状态为 failed，而不是只显示一个模糊的 sync error。
失败边界：如果部分资源成功部分失败，必须保留两者；重试前要确认是否有已生效资源需要回滚或继续收敛。`,
  }],
  ['回滚执行真实版本切换', {
    title: '回滚到固定修订并执行冒烟',
    language: 'Shell',
    code: `set -euo pipefail
TARGET=$(curl -fsS http://localhost:8080/api/releases/42/rollback-target | jq -r .gitSha)
argocd app set checkout-prod --revision "$TARGET"
argocd app sync checkout-prod --timeout 300
kubectl rollout status deployment/checkout-api -n checkout-prod --timeout=180s
curl -fsS http://checkout.test/health/ready | jq -e '.status == "ready"' >/dev/null
curl -fsS -X POST http://localhost:8080/api/releases/42/evidence \\
  -H 'content-type: application/json' \\
  -d "{\"action\":\"rollback\",\"target\":\"$TARGET\",\"smoke\":\"ready\"}" | jq .`,
    output: `rollout 完成、health ready 后接口返回 rollback evidence；部署历史和指标都能看到目标 revision。
失败边界：Helm/Argo 回滚成功但迁移不可逆时仍可能不可用，必须验证兼容性；冒烟失败要继续升级事故，不能标记回滚成功。`,
  }],
  ['发布详情围绕决策展示', {
    title: '把发布详情渲染成决策面板',
    language: 'Vue',
    code: `<script setup lang="ts">
defineProps<{release: {revision:string; environment:string; risk:string; errorRate:number; approvalMissing:boolean}}>();
</script>
<template>
  <section aria-labelledby="release-title">
    <h2 id="release-title">生产发布 {{ release.revision }}</h2>
    <dl><dt>环境</dt><dd>{{ release.environment }}</dd><dt>风险</dt><dd>{{ release.risk }}</dd></dl>
    <p v-if="release.approvalMissing" role="alert">缺少审批，不能执行同步。</p>
    <p v-if="release.errorRate > 0.02" role="alert">错误率超过发布门限，请停止或回滚。</p>
    <button type="button">查看结构化差异</button>
  </section>
</template>`,
    output: `详情首屏显示 revision、环境、风险和两个阻断提示；缺少审批或错误率超限时不会出现可执行同步按钮。
失败边界：不能用颜色单独表达风险，且页面状态必须来自服务端完整快照；刷新后仍需保持阻断和审批上下文。`,
  }],
  ['差异支持可读和机器判断', {
    title: '结构化差异映射到可读行',
    language: 'TypeScript',
    code: `type Diff = {kind: 'image' | 'config' | 'migration'; key: string; before: string | null; after: string | null; risk: 'low' | 'medium' | 'high'};
export function renderDiffRow(diff: Diff) {
  const label = {image: '镜像', config: '配置', migration: '迁移'}[diff.kind];
  const riskText = {low: '低', medium: '中', high: '高'}[diff.risk];
  return {label, key: diff.key, before: diff.before ?? '新增', after: diff.after ?? '删除', riskText};
}
console.table([renderDiffRow({kind:'config',key:'env.REFUND_TIMEOUT',before:'5s',after:'2s',risk:'high'})]);`,
    output: `表格输出 label=配置、key=env.REFUND_TIMEOUT、before=5s、after=2s、riskText=高；敏感值不进入该结构。
失败边界：前端不能解析 kubectl 文本猜测风险；同一 key 的 before/after 为空时要明确表示新增或删除，而不是显示 undefined。`,
  }],
  ['审批包含上下文和原因', {
    title: '审批表单要求绑定 revision 的原因',
    language: 'Vue',
    code: `<form @submit.prevent="approve({releaseId, revision, reason, decision})">
  <p>发布 {{ releaseId }} · revision {{ revision }} · 环境 {{ environment }}</p>
  <label for="reason">审批原因</label>
  <textarea id="reason" v-model.trim="reason" minlength="8" required aria-describedby="reason-help" />
  <p id="reason-help">请写明变更范围、回滚版本和监控窗口。</p>
  <button type="submit" :disabled="reason.length < 8">批准 revision</button>
  <button type="button" @click="reject({releaseId, revision, reason})">拒绝</button>
</form>
// 服务端仍校验 actor、revision、environment 和双人审批规则。`,
    output: `原因不足 8 个字符时提交按钮禁用；提交后服务端返回审批结果并刷新 revision、环境和原因，失败时保留原输入。
失败边界：表单校验不能替代服务端授权，revision 页面上也必须显示；若审批 mutation 未带 releaseId/revision，接口应返回 400。`,
  }],
  ['同步时间线与指标关联', {
    title: '合并同步事件和错误率窗口',
    language: 'TypeScript',
    code: `const timeline = [
  {at: '10:00:02', type: 'approval', actor: 'alice'},
  {at: '10:00:15', type: 'sync-started', revision: '7d9c'},
  {at: '10:00:41', type: 'resource-failed', resource: 'Deployment/checkout-api', reason: 'ImagePullBackOff'},
  {at: '10:01:00', type: 'metric-sample', rate: 0.031, window: '5m'},
];
const decision = timeline.some((e) => e.type === 'resource-failed' || (e.type === 'metric-sample' && e.rate > 0.02))
  ? 'pause-and-rollback' : 'continue';
console.log(JSON.stringify({releaseId: '42', decision, timeline}, null, 2));`,
    output: `同一时间线包含审批、同步、具体资源失败和指标样本，decision 输出 pause-and-rollback；用户可直接看到停走依据。
失败边界：事件和指标时钟不一致时需记录采集时间与事件时间；不能把不同 release 的错误率拼到当前时间线。`,
  }],
  ['键盘和移动端可执行回滚', {
    title: '用键盘和移动视口验证回滚入口',
    language: 'TypeScript',
    code: `import { test, expect } from '@playwright/test';
test.use({viewport: {width: 390, height: 844}});
test('keyboard and touch can open rollback confirmation', async ({page}) => {
  await page.goto('/releases/42');
  await page.getByRole('button', {name: '更多操作'}).click();
  await page.getByRole('button', {name: '回滚此发布'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('将回滚到 sha256:3f2a91');
  await page.getByLabel('回滚原因').fill('冒烟错误率超过 2%');
  await page.getByRole('button', {name: '确认回滚'}).click();
  await expect(page.getByRole('status')).toContainText('回滚任务已提交');
});`,
    output: `390x844 下回滚操作可通过键盘 Enter 打开并完成确认，状态消息可被读出；页面宽度没有横向溢出。
失败边界：只聚焦图标按钮、确认弹窗不显示目标 revision 或提交后无状态反馈都不合格；危险动作不能依赖 hover。`,
  }],
  ['权限矩阵覆盖所有动作', {
    title: '表驱动验证角色与 API 权限',
    language: 'TypeScript',
    code: `const cases = [
  ['developer', 'POST', '/releases', 201],
  ['developer', 'POST', '/releases/42/approve', 403],
  ['approver', 'POST', '/releases/42/approve', 204],
  ['sre', 'POST', '/releases/42/rollback', 202],
  ['security', 'POST', '/releases/42/execute', 403],
] as const;
for (const [role, method, path, expected] of cases) {
  const response = await api.request(method, path, {role});
  if (response.status !== expected) throw new Error(role + ' ' + path + ': expected ' + expected + ', got ' + response.status);
}
console.log('permission matrix: 5 cases passed');`,
    output: `权限矩阵输出 5 cases passed；越权审批和执行分别返回 403，安全员只能查看证据。
失败边界：每个拒绝用例还要检查 audit 记录；只覆盖 UI 点击或只测成功角色不能证明 API 边界。`,
  }],
  ['状态机做并发测试', {
    title: '并发批准与执行只能产生一个终态',
    language: 'TypeScript',
    code: `import { expect, test } from 'vitest';
test('concurrent approval and execution converge', async () => {
  const release = await createRelease({revision: 7});
  const approvals = await Promise.allSettled([approve(release.id, 'alice'), approve(release.id, 'alice'), approve(release.id, 'bob')]);
  expect(approvals.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  const executions = await Promise.all([execute(release.id, 'run-1'), execute(release.id, 'run-1'), execute(release.id, 'run-2')]);
  expect(new Set(executions.map((x) => x.operationId)).size).toBe(2);
  const current = await getRelease(release.id);
  expect(['syncing', 'verifying', 'succeeded']).toContain(current.state);
});`,
    output: `重复 alice 审批只成功一次、bob 形成第二票；run-1 两次请求共享 operationId，run-2 另建操作，最终状态落在合法执行链。
失败边界：如果数据库没有唯一约束，测试可能偶发通过；应同时检查操作表行数和审计事件，不能只看 HTTP 202。`,
  }],
  ['GitOps 故障注入', {
    title: '制造回调丢失和漂移后执行对账',
    language: 'PowerShell',
    code: `# 在本地模拟器上安装故障，不触碰真实生产集群
$env:FAULT_MODE='drop-callback'
Invoke-RestMethod -Method Put http://localhost:8090/faults -ContentType application/json -Body '{"mode":"drop-callback","durationSeconds":180}'
$release = Invoke-RestMethod -Method Post http://localhost:8080/api/releases/42/execute
Start-Sleep 3
Invoke-RestMethod -Method Post http://localhost:8080/api/reconcile | ConvertTo-Json
$state = Invoke-RestMethod http://localhost:8080/api/releases/42
if ($state.state -ne 'verifying') { throw "unexpected state: $($state.state)" }
"reconciled=$($state.state) operation=$($release.operationId)"`,
    output: `回调被丢弃后主动对账把发布从 syncing 修正为 verifying，operation 仍只有一个，并输出 reconciled=verifying。
失败边界：故障恢复后不能重新产生第二个同步；服务不可达时应保留超时和失败原因，而不是误判成 cleaner。`,
  }],
  ['安全测试覆盖秘密和执行边界', {
    title: '扫描镜像和仓库中的秘密与管理员权限',
    language: 'Shell',
    code: `trivy image --severity HIGH,CRITICAL --exit-code 1 registry.example/launchpad-api@sha256:3f2a91
gitleaks detect --source . --no-git --redact --exit-code 1
kubectl auth can-i '*' '*' --as=system:serviceaccount:platform:launchpad-executor -n checkout-prod | tee rbac.txt
grep -q '^no$' rbac.txt
if kubectl get rolebinding launchpad-deployer -n checkout-prod -o yaml | grep -q 'cluster-admin'; then
  echo 'cluster-admin binding found' >&2; exit 1
fi
echo 'secret and privilege checks passed'`,
    output: `镜像无高危漏洞、仓库无泄露秘密、执行器对通配权限返回 no，最终输出 secret and privilege checks passed。
失败边界：扫描网络失败不能当作通过；仅检查镜像不检查 Helm values、CI 日志和 RBAC 仍无法证明发布平台的高权限边界。`,
  }],
  ['性能测试查询与时间线', {
    title: '压测发布历史分页和索引',
    language: 'JavaScript',
    code: `import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {vus: 20, duration: '60s', thresholds: {'http_req_duration{endpoint:history}': ['p(95)<500']}};
export default function () {
  const response = http.get('http://localhost:8080/api/releases?limit=20&cursor=2026-11-24T10:00:00Z', {
    tags: {endpoint: 'history'},
  });
  check(response, {'status is 200': (r) => r.status === 200, 'has cursor': (r) => Boolean(r.json().nextCursor)});
  sleep(0.2);
}
// k6 run history-load.js`,
    output: `k6 汇总 p95 小于 500ms、错误率符合阈值，每页返回 20 条和 nextCursor；数据库日志显示索引扫描而非全表排序。
失败边界：只压首页不算历史列表；游标缺失、重复数据或事件时间倒退都要作为失败，不能用平均值掩盖尾延迟。`,
  }],
  ['平台自身也走发布流程', {
    title: '将 LaunchPad 自身纳入受控发布',
    language: 'YAML',
    code: `apiVersion: launchpad.example/v1
kind: Release
metadata: {name: launchpad-platform-2026-11-24}
spec:
  application: launchpad-control-plane
  environment: platform-prod
  revision: sha256:91d9a0
  approval:
    requiredRoles: [release-manager, security]
    reasonRequired: true
  checks:
    - curl -fsS https://launchpad.test/api/health | jq -e '.database == "ok" and .argo == "ok"'
    - pnpm --filter @yan-zhi/launchpad test:e2e
  rollback: {revision: sha256:3f2a91}
commands:
  - kubectl apply --dry-run=server -f launchpad-self-release.yaml`,
    output: `server dry-run 通过，审批要求两个角色，发布前必须先跑数据库/Argo 健康与 E2E；回滚 revision 固定可查。
失败边界：平台自身不能使用自己的管理员绕过审批；控制面升级失败时执行器仍应保留最后一次可回滚状态。`,
  }],
  ['最小权限划分控制器', {
    title: '验证控制面无法操作目标集群',
    language: 'Shell',
    code: `kubectl auth can-i get pods --as=system:serviceaccount:platform:launchpad-api -n checkout-prod > api-pods.txt || true
kubectl auth can-i patch deployments --as=system:serviceaccount:platform:launchpad-executor -n checkout-prod > executor-deploy.txt || true
printf 'api pods: '; cat api-pods.txt
printf 'executor deploy: '; cat executor-deploy.txt
test "$(cat api-pods.txt)" = no
test "$(cat executor-deploy.txt)" = yes
kubectl get secrets -n checkout-prod --as=system:serviceaccount:platform:launchpad-executor 2>&1 | tee secret-denied.txt`,
    output: `api pods 为 no，executor deploy 为 yes，Secret 读取返回 Forbidden；服务账户权限符合最小职责。
失败边界：如果执行器可读取 Secret、创建 ClusterRoleBinding 或写控制面数据库，必须隔离；不能仅靠命名空间名称判断权限。`,
  }],
  ['指标覆盖发布闭环', {
    title: '查询发布成功率和回滚耗时',
    language: 'PromQL',
    code: `group by (application) (rate(launchpad_release_sync_total{result="success"}[15m]))
/
group by (application) (rate(launchpad_release_sync_total[15m]))

histogram_quantile(0.95,
  sum by (le, application) (rate(launchpad_release_rollback_seconds_bucket[30m]))
)

# curl -sG http://prometheus.test/api/v1/query --data-urlencode 'query=...'
# 同时检查 approval_wait_seconds、drift_total、slo_burn_rate 和 failed_resources`,
    output: `按应用返回同步成功率、回滚 P95 和历史窗口；例如 checkout 同步成功率 0.97、回滚 P95 73 秒，可与发布详情对齐。
失败边界：只监控 HTTP 202 或 pod 存活不覆盖审批等待、漂移和 SLO；指标标签缺少 application/revision 时无法定位发布。`,
  }],
  ['冒烟与自动暂停', {
    title: '指标超阈值时暂停发布',
    language: 'PowerShell',
    code: `$window = Invoke-RestMethod 'http://prometheus.test/api/v1/query?query=sum(rate(http_requests_total{status=~"5.."}[5m]))/sum(rate(http_requests_total[5m]))'
$rate = [double]$window.data.result[0].value[1]
$smoke = Invoke-RestMethod http://checkout.test/health/ready
if ($rate -gt 0.02 -or $smoke.status -ne 'ready') {
  Invoke-RestMethod -Method Post http://localhost:8080/api/releases/42/pause -ContentType application/json -Body (@{reason="errorRate=$rate"} | ConvertTo-Json)
  throw "release paused: errorRate=$rate smoke=$($smoke.status)"
}
"continue release rate=$rate smoke=$($smoke.status)"`,
    output: `当 errorRate>0.02 或 smoke 非 ready 时发布被暂停并抛出原因；正常时输出 continue release 和当前指标。
失败边界：自动暂停只能阻止后续阶段，不能伪造回滚成功；指标查询失败要有 fail-closed 路径并通知负责人。`,
  }],
  ['回滚平台自身可验证', {
    title: '回滚 LaunchPad 后验证历史仍可查',
    language: 'Shell',
    code: `CURRENT=$(argocd app get launchpad-control-plane -o json | jq -r '.status.sync.revision')
argocd app rollback launchpad-control-plane 17 --timeout 300
argocd app wait launchpad-control-plane --health --timeout 300
curl -fsS http://launchpad.test/api/releases/42 | jq -e '.state == "rolled-back" or .state == "succeeded"'
psql "$DATABASE_URL" -Atc "select count(*) from release_event where release_id='42'"
echo "platform rollback from=$CURRENT verified"`,
    output: `Argo 回滚完成，release 查询仍返回历史状态和事件数量，输出 platform rollback from=<旧 revision> verified。
失败边界：数据库迁移不可回退或旧历史被覆盖时不能判定通过；执行器必须避免再次读取回滚前的内存操作队列。`,
  }],
  ['漂移演练验证对账', {
    title: '手工改副本数后检测并重新同步',
    language: 'Shell',
    code: `set -euo pipefail
kubectl scale deployment/checkout-api -n checkout-prod --replicas=1
argocd app diff checkout-prod --refresh > drift.txt || true
test -s drift.txt
curl -fsS -X POST http://localhost:8080/api/releases/42/reconcile
argocd app sync checkout-prod --timeout 180
kubectl get deployment/checkout-api -n checkout-prod -o jsonpath='{.spec.replicas}{"\\n"}'
test "$(kubectl get deployment/checkout-api -n checkout-prod -o jsonpath='{.spec.replicas}')" = 3
echo 'drift detected and reconciled to 3 replicas'`,
    output: `漂移文件包含副本数 3→1 差异，重新同步后 JSONPath 输出 3，并记录 reconcile 事件。
失败边界：若 Argo 不可达，diff 非空也不能直接标记已修复；需要保存 drift 证据、重试和对账结果。`,
  }],
  ['错误镜像演练自动暂停', {
    title: '发布不可拉取镜像后自动停止',
    language: 'Shell',
    code: `set -euo pipefail
kubectl set image deployment/checkout-api checkout-api=registry.example/missing@sha256:0000 -n checkout-prod
if kubectl rollout status deployment/checkout-api -n checkout-prod --timeout=45s; then
  echo 'unexpected successful rollout' >&2; exit 1
fi
curl -fsS http://localhost:8080/api/releases/42/smoke | jq .
curl -fsS -X POST http://localhost:8080/api/releases/42/rollback -H 'content-type: application/json' -d '{"reason":"ImagePullBackOff"}' | jq .state
argocd app wait checkout-prod --health --timeout 180`,
    output: `rollout 超时，smoke 报告 ImagePullBackOff，平台自动暂停并提交回滚；最终 Argo health 恢复 Healthy。
失败边界：镜像拉取失败不能只看 Argo sync=Synced，必须结合工作负载健康和 readiness；回滚后仍需检查旧 revision 是否可拉取。`,
  }],
  ['审批越权演练', {
    title: '模拟开发者自批并核对审计',
    language: 'Shell',
    code: `set +e
HTTP=$(curl -sS -o deny.json -w '%{http_code}' -X POST http://localhost:8080/api/releases/42/approve \\
  -H 'authorization: Bearer dev-token' -H 'content-type: application/json' \\
  -d '{"revision":7,"decision":"approved","reason":"self approval attempt"}')
set -e
test "$HTTP" = 403
jq -e '.code == "APPROVAL_FORBIDDEN"' deny.json
psql "$DATABASE_URL" -Atc "select actor_id, action, result from audit_event where release_id='42' order by occurred_at desc limit 1"
echo "self-approval denied with HTTP $HTTP"`,
    output: `请求返回 403 与 APPROVAL_FORBIDDEN，数据库最新审计记录包含 actor_id、action=approve、result=denied。
失败边界：若只检查 HTTP 403 不查审计，无法证明安全边界闭环；跨环境审批和 revision 变化还要各自生成拒绝记录。`,
  }],
  ['回调丢失演练主动对账', {
    title: '断开回调后由对账任务恢复终态',
    language: 'Shell',
    code: `set -euo pipefail
curl -fsS -X POST http://localhost:8090/faults -H 'content-type: application/json' -d '{"mode":"drop-callback"}'
RELEASE=$(curl -fsS -X POST http://localhost:8080/api/releases/42/execute | jq -r .releaseId)
sleep 5
curl -fsS -X POST http://localhost:8080/api/reconcile | jq '{releaseId,state,operationId}'
STATE=$(curl -fsS http://localhost:8080/api/releases/$RELEASE | jq -r .state)
OPS=$(psql "$DATABASE_URL" -Atc "select count(*) from release_operation where release_id='$RELEASE' and action='sync'")
test "$STATE" = verifying
test "$OPS" = 1
echo "callback-loss recovered state=$STATE sync-operations=$OPS"`,
    output: `回调被丢弃后对账把状态推进到 verifying，同步操作表仍只有 1 行，输出 callback-loss recovered。
失败边界：对账任务没有查询到执行器状态时应保留超时而不是成功；回调恢复后不能重放产生第二个 operation。`,
  }],
  ['答辩解释治理与恢复', {
    title: '生成可复核的发布治理证据包',
    language: 'PowerShell',
    code: `$release = Invoke-RestMethod http://localhost:8080/api/releases/42
$events = Invoke-RestMethod http://localhost:8080/api/releases/42/events?limit=100
$metrics = Invoke-RestMethod 'http://prometheus.test/api/v1/query?query=launchpad_release_rollback_seconds_bucket'
$report = [ordered]@{
  release = $release.id; revision = $release.revision; actor = $release.approvedBy
  state = $release.state; eventCount = $events.items.Count
  rollbackTarget = $release.rollbackTarget; metricWindows = $metrics.data.result.Count
  policy = 'control-plane-executor-split; revision-bound-approval; idempotent-rollback'
}
$report | ConvertTo-Json | Set-Content defense-evidence.json`,
    output: `defense-evidence.json 把 revision、审批人、事件、回滚目标和指标窗口放在同一证据包中，支持答辩时逐项追溯。
失败边界：截图或口头描述不能替代事件与指标；如果回滚没有固定目标、审批未绑定 revision，答辩结论必须标记为未闭环。`,
  }],
];

const LAUNCHPAD_STEP_EXAMPLES = Object.fromEntries(
  LAUNCHPAD_EXAMPLE_ENTRIES,
) as Readonly<Record<string, LearningV2LessonExample>>;

export const PROGRAMMING_PROJECT_TRAINING_BATCH_07_COURSES =
  LAUNCHPAD_COURSES_BASE.map((course) => ({
    ...course,
    steps: course.steps.map((step) => {
      const suffix = LAUNCHPAD_STEP_SUFFIXES[step[0]];
      return [
        step[0],
        suffix ? `${step[1]} ${suffix}` : step[1],
        step[2],
        LAUNCHPAD_STEP_EXAMPLES[step[0]],
      ] as const;
    }),
  }));
