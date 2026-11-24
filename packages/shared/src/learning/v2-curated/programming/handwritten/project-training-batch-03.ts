// P15 综合训练第三批手写样板：Orbit 内容社区微服务 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;

type ProjectExampleGrid = readonly (
  readonly (LearningV2LessonExample | undefined)[]
)[];

const example = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

function withProjectExamples(
  courses: readonly ProgrammingCourseSeed[],
  examples: ProjectExampleGrid,
): readonly ProgrammingCourseSeed[] {
  return courses.map((course, courseIndex) => ({
    ...course,
    steps: course.steps.map((step, stepIndex) => {
      const current = step[3] ?? examples[courseIndex]?.[stepIndex];
      if (!current) {
        throw new Error(`Missing project example: ${course.name} / ${step[0]}`);
      }
      return [step[0], step[1], step[2], current] as const;
    }),
  }));
}

const ORBIT_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · Orbit 内容社区微服务 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成一个全栈单体项目，理解发布、Feed、搜索和通知的基础流程。',
    goal: '能区分创作者、读者、审核员和 SRE 的任务，建立从发布到 Feed、搜索、互动和通知的事件链，并识别哪些边界值得拆成独立服务。',
    guidedPractice: '模拟一次内容发布、一次审核通过、一次 Feed 拉取和一次通知失败，记录每个角色的输入、可观察反馈和失败代价。',
    independentPractice: '交付角色任务卡、内容生命周期图和拆分判据表，说明独立变化、独立伸缩和故障隔离分别由哪些证据支持。',
    commonErrors: [
      '按 controller、service、repository 等技术层拆服务，而不是按业务所有权和变化节奏。',
      '只看发布成功，没有定义审核拒绝、搜索延迟和通知失败时用户看到什么。',
    ],
    sourceRefs: [
      'Spring Cloud Gateway. https://docs.spring.io/spring-cloud-gateway/reference/',
      'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '按角色写清楚社区任务',
        '创作者关注发布是否成功、内容何时可见和审核反馈；读者关注 Feed 是否相关、搜索是否找得到；审核员要定位违规证据并执行下架；SRE 要判断单服务故障是否影响主流程。每个任务写触发条件、成功证据和失败后的替代路径。',
        '角色任务要连接到内容生命周期',
      ],
      [
        '画出内容从草稿到通知的链路',
        '内容先进入草稿，提交后进入待审核或已发布，审核结果影响 Feed 与搜索索引，互动产生通知，下架还要清理外部索引。每一步记录事件、所有者、可重复动作和可见状态，避免把数据库提交误当成整个社区已更新。',
        '数据库状态不是完整业务结果',
      ],
      [
        '用证据判断是否拆服务',
        '拆分需要独立变化、独立伸缩或故障隔离证据，例如 Feed 读流量远高于发布写流量、搜索索引需要独立扩容、通知失败不应阻塞发布。若只是一组代码文件不同，应先保持模块化单体并建立清晰边界。',
        '服务数量不是成熟度指标',
      ],
      [
        '记录失败对用户的影响',
        'Feed 不可用时可回退最新内容列表，搜索延迟时可显示“索引更新中”，通知失败不应影响发布成功，审核服务故障应停止公开新内容而不是静默放行。每个降级都必须有可见状态和恢复动作。',
        '降级不是隐藏错误',
      ],
      [
        '形成首版边界',
        '首版包含身份、发布、基础 Feed、关键词搜索、审核和通知；不做推荐模型训练、Service Mesh 和无边界全库搜索。每个非目标写清原因、风险和重新评估条件。',
        '首版边界服务于可验证闭环',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 Orbit 角色任务卡、内容生命周期和拆分判据。',
    goal: '能把首版限定为身份、发布、Feed、搜索、审核和通知闭环，写出事件重复、服务超时、索引延迟、通知积压和降级的可执行验收。',
    guidedPractice: '把每个服务写成“负责什么、不负责什么、失败时谁降级”，再为 Feed P95、通知幂等和 Trace 覆盖写验收场景。',
    independentPractice: '交付一张跨服务验收矩阵，每条包含输入、触发服务、可观察状态、通过线、证据和恢复动作。',
    commonErrors: [
      '只写服务列表，没有写服务失败时主流程如何继续。',
      '把最终一致写成“等一会儿就好”，没有延迟上限和修复入口。',
    ],
    sourceRefs: [
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'RFC 9110 HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110',
      'OpenTelemetry Semantic Conventions. https://opentelemetry.io/docs/specs/semconv/',
    ],
    steps: [
      [
        '定义每个服务的责任边界',
        '身份服务负责登录、会话和用户状态；内容服务拥有草稿、发布和审核状态；Feed 服务拥有个性化读取模型；搜索服务拥有倒排索引；通知服务消费事件并投递消息。每个服务明确自己的数据和失败域。',
        '数据所有者就是服务边界',
      ],
      [
        '把主流程转成可观测场景',
        '发布成功要能在内容服务查询到状态，Kafka 事件进入 Feed 和搜索，通知失败仍保留发布成功。读者打开 Feed 要看到更新延迟提示，搜索索引滞后要有时间和告警。',
        '最终一致必须有时间窗口',
      ],
      [
        '验收重复和乱序',
        '同一内容发布事件重复消费不能生成重复 Feed 项或通知，旧版本审核事件不能覆盖新状态。事件 schema 带 version 和 occurredAt，消费者按内容 ID、事件 ID 和版本执行幂等。',
        '消息至少一次要求消费去重',
      ],
      [
        '失败降级写入范围',
        'Feed 服务超时回退最新内容列表，搜索服务故障保留关键词按钮但显示暂不可用，通知积压不阻塞发布，审核服务不可用时新内容保持待审核。每个降级要有负责人、指标和恢复条件。',
        '降级必须可解释和可恢复',
      ],
      [
        '冻结可测试的首版闭环',
        '任何新增能力必须说明它服务哪条角色任务、属于哪个服务、增加哪种一致性问题。没有事件所有权、失败域和验收证据的需求不进入首版，并由产品、架构和运维共同确认。',
        '范围变更必须带故障分析',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 Orbit 服务责任、内容生命周期和首版验收。',
    goal: '能设计 BFF 聚合接口、内部服务契约和领域事件 schema，处理版本兼容、鉴权、分页、降级响应与 requestId 传播。',
    guidedPractice: '为发布、Feed、搜索和通知写出 BFF 响应与内部事件样例，再模拟字段新增、消费者未知字段和旧版本事件。',
    independentPractice: '交付 API 与事件目录、兼容规则和前端请求矩阵，覆盖加载、空、无权限、依赖超时和降级状态。',
    commonErrors: [
      'BFF 直接暴露多个服务字段和内部错误，让前端承担协调和重试。',
      '事件删除或改变字段含义，消费者升级顺序没有兼容方案。',
    ],
    sourceRefs: [
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'Kafka Schema Registry. https://docs.confluent.io/platform/current/schema-registry/index.html',
      'gRPC Documentation. https://grpc.io/docs/',
    ],
    steps: [
      [
        'BFF 聚合用户任务而不是服务列表',
        'Feed 页面响应需要内容摘要、作者信息、互动状态和降级标记，BFF 负责并行调用并合成视图，内部服务仍保留各自契约。BFF 不能变成第二个业务数据库，也不能隐藏权限错误。',
        '聚合层只做边界转换',
      ],
      [
        '内部契约明确超时和错误',
        '内部 REST 或 gRPC 定义请求、响应、deadline、重试条件和错误码。调用方区分不可用、超时、限流和业务拒绝，只有幂等读请求才允许自动重试。',
        '超时预算向调用链传播',
      ],
      [
        '事件 schema 只做兼容演进',
        '新增可选字段通常兼容，删除字段、修改语义和复用编号需要新版本。消费者忽略未知字段，生产者保留事件 ID、聚合 ID、版本和发生时间。',
        '事件契约需要版本和所有者',
      ],
      [
        '权限信息进入每个读取边界',
        'BFF 先验证会话，再把主体和 requestId 传给内部服务；内容服务和搜索服务仍要按可见性、租户和审核状态过滤，不能因为来自内网就跳过授权。',
        '内网调用仍需授权',
      ],
      [
        '前端只依赖 BFF 用户契约',
        '前端请求矩阵覆盖首次加载、空 Feed、搜索无结果、审核中、服务降级和重试。字段和状态由契约解释，前端不从多个内部服务猜组合逻辑。',
        '前端可见契约保持稳定',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 Orbit 服务与事件契约，理解 Kafka、Redis、PostgreSQL 和搜索索引。',
    goal: '能为身份、内容、Feed、搜索和通知建立独立数据所有权，用 Outbox、幂等表、版本字段和索引迁移保证最终一致和故障恢复。',
    guidedPractice: '为发布事件到 Feed、搜索和通知设计 Outbox、消费幂等表和索引版本，再制造重复事件与旧版本覆盖。',
    independentPractice: '交付数据所有权表、事件流图、迁移计划和查询索引，覆盖旧数据回填、重建索引和消息重放。',
    commonErrors: [
      '多个服务共享一张内容表，表面上拆服务，实际仍无法独立发布。',
      'Feed 和搜索只按事件追加，不保存版本，重复或乱序后无法判断最新状态。',
    ],
    sourceRefs: [
      'PostgreSQL Documentation. https://www.postgresql.org/docs/',
      'Redis Documentation. https://redis.io/docs/latest/',
      'OpenSearch Documentation. https://docs.opensearch.org/',
    ],
    steps: [
      [
        '数据所有权按服务切开',
        '身份服务拥有用户和会话，内容服务拥有草稿、发布和审核，通知服务拥有投递记录，Feed 与搜索保存可重建投影。跨服务只传 ID 和事件，不直接读取对方数据库。',
        '每个数据只有一个写所有者',
      ],
      [
        'Outbox 与内容事务同提交',
        '发布或审核状态更新与 Outbox 事件在同一数据库事务中提交，发布器异步投递 Kafka，成功后标记发送时间。服务崩溃后可以重放未发送事件。',
        '可靠事件依赖本地事务',
      ],
      [
        '消费者用事件版本幂等写入',
        'Feed 和搜索投影保存内容 ID、事件版本和更新时间，旧事件不覆盖新版本；通知表保存 event_id 和 content_id 唯一约束，重复消费只返回已处理结果。',
        '幂等键和版本缺一不可',
      ],
      [
        'Feed 与搜索是可重建投影',
        'Feed 索引可以用内容快照和关系重建，OpenSearch 索引可以全量重建后别名切换。保存重建游标、索引版本和失败位置，避免故障时无路可退。',
        '投影必须可重建',
      ],
      [
        '迁移按兼容顺序执行',
        '先新增事件字段和索引版本，双写或双读验证，再回填历史内容，最后删除旧路径。旧消费者和新消费者在过渡期必须都能处理同一事件，并记录数据校验结果。',
        '服务发布与数据迁移成对设计',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已有 Orbit 数据所有权、事件契约和迁移计划。',
    goal: '能建立多服务工作区、共享契约包和本地编排，固定每个服务端口、健康检查、数据库、Kafka topic 与 Trace 配置，并避免共享内部代码。',
    guidedPractice: '创建 gateway、identity、content、feed、search 和 notification 服务，用 Docker Compose 启动 PostgreSQL、Kafka、Redis 和 OpenSearch。',
    independentPractice: '删除本地生成物后按 README 重建全部服务，跑通一次发布事件到 Feed 和通知的本地链路。',
    commonErrors: [
      '所有服务共享一个 domain 包，修改一个服务直接依赖另一个服务内部实现。',
      '本地环境只启动部分依赖，测试通过但真实消息和索引从未联调。',
    ],
    sourceRefs: [
      'Gradle Multi-project Builds. https://docs.gradle.org/current/userguide/multi_project_builds.html',
      'Docker Compose Documentation. https://docs.docker.com/compose/',
      'Kubernetes Local Development. https://kubernetes.io/docs/tasks/tools/',
    ],
    steps: [
      [
        '工作区保留独立发布边界',
        '每个服务拥有自己的构建、配置和测试，共享包只包含 OpenAPI、事件 schema 和测试样例，不包含业务实体和数据库访问。服务间通过契约协作。',
        '共享契约，不共享内部实现',
      ],
      [
        '本地编排覆盖真实依赖',
        'Compose 固定 PostgreSQL、Kafka、Redis 和 OpenSearch 版本，初始化 topic、数据库和索引。每个服务有健康检查和明确端口，README 说明启动和清理顺序。',
        '本地也要验证消息和索引',
      ],
      [
        '配置按环境与秘密分层',
        '服务名、Kafka topic、数据库地址和超时来自环境变量，真实秘密不进入仓库。启动时校验必需配置并输出服务版本，禁止默认值冒充生产秘密。',
        '配置错误要在启动时显式失败',
      ],
      [
        'Trace 与 requestId 从入口注入',
        '网关生成 requestId 并传播 W3C traceparent，HTTP、Kafka 生产者和消费者继续 span。Blazor 或 React 客户端不需要知道全部内部服务，但日志可关联同一请求。',
        '跨进程上下文必须传播',
      ],
      [
        '用一条发布事件完成环境验收',
        '从内容服务发布事件，观察 Feed 投影、搜索索引和通知记录。若任一服务暂时不可用，事件仍保留并可重放，证明本地环境验证的是最终一致而不是同步假象。',
        '端到端样例先于批量开发',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Orbit 多服务工作区与真实本地依赖已经可运行。',
    goal: '能实现发布、审核、Feed 扇出、搜索同步、通知重试和幂等消费，处理服务超时、重复事件、旧版本覆盖和降级回退。',
    guidedPractice: '让内容服务发布成功但搜索服务暂时下线，再恢复消费者并重放事件，检查索引最终一致和通知不重复。',
    independentPractice: '为一次审核下架设计 Feed、搜索和通知的清理流程，并验证中途失败后可以继续恢复。',
    commonErrors: [
      '发布请求同步调用所有下游，任一通知失败导致内容发布回滚。',
      '消费者没有版本判断，重复或乱序事件把已下架内容重新放回 Feed。',
    ],
    sourceRefs: [
      'Apache Kafka Consumer Design. https://kafka.apache.org/documentation/#consumerconfigs',
      'Spring Cloud Gateway. https://docs.spring.io/spring-cloud-gateway/reference/',
      'gRPC Deadlines. https://grpc.io/docs/guides/deadlines/',
    ],
    steps: [
      [
        '发布事务只保证内容状态和 Outbox',
        '内容服务在本地事务中保存草稿发布状态和事件，不等待 Feed、搜索或通知同步完成。接口返回内容 ID 和当前状态，下游失败通过重放和指标处理。',
        '主事务不等待所有下游',
      ],
      [
        '审核状态控制可见性',
        '审核通过事件携带内容版本和可见范围，Feed 与搜索先检查版本再写入；下架事件把投影标记不可见。审核拒绝不应删除历史审计记录，并保留审批人和时间。',
        '审核是状态转换，不是物理删除',
      ],
      [
        '派生服务按 key 幂等消费',
        'Feed 使用 Redis 有序集合或数据库投影保存内容版本，搜索按内容 ID upsert 并记录索引版本，通知按 event_id 去重。重复消费必须返回已处理结果。',
        '幂等表保护外部副作用',
      ],
      [
        '超时和降级返回稳定响应',
        'BFF 对 Feed 设置短 deadline，超时回退最新公开内容并标记 degraded；搜索不可用时返回可操作的暂不可用状态。错误码和 requestId 写入日志与 Trace。',
        '降级结果也要可观察',
      ],
      [
        '重放与重建验证恢复能力',
        '模拟 Kafka 中断、消费者崩溃和搜索索引删除，使用 Outbox 重放、消费 offset 和索引重建恢复。最终验证内容、Feed、搜索和通知状态一致。',
        '恢复完成以状态对账判定',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Orbit 发布、Feed、搜索、审核和降级接口已可联调。',
    goal: '能实现发布、Feed、搜索、审核台和服务降级提示，处理加载、空、无权限、审核中、实时更新和依赖超时，并保证键盘与移动端可用。',
    guidedPractice: '从发布内容到 Feed 和搜索命中走完整流程，再制造搜索服务超时、通知失败和审核拒绝，检查页面状态。',
    independentPractice: '用键盘和 320px 视口完成发布、搜索和审核，补齐焦点管理、错误提示、加载骨架和降级文案。',
    commonErrors: [
      '发布后立即把内容塞入 Feed，服务端审核未通过时用户误以为已公开。',
      '搜索超时只显示空白页，没有重试、返回 Feed 或状态说明。',
    ],
    sourceRefs: [
      'React Documentation. https://react.dev/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'MDN Server-Sent Events. https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events',
    ],
    steps: [
      [
        '发布状态由内容服务决定',
        '提交后显示待审核、已发布或拒绝原因，Feed 只在服务端投影可见后出现。前端轮询或订阅有上限，离开页面后停止无用请求并显示审核时间。',
        '客户端不能先行公开内容',
      ],
      [
        'Feed 状态区分新鲜与降级',
        '正常 Feed、空 Feed、索引更新中和依赖降级使用不同文案与操作；加载骨架保持布局稳定，错误提供重试、刷新和回退最新内容入口。',
        '降级状态必须可理解',
      ],
      [
        '搜索提供修改条件的入口',
        '关键词、标签和时间筛选进入 URL，无结果时显示当前筛选并提供清除条件。搜索服务超时保留用户输入，重试不会丢参数，并为按钮提供键盘说明。',
        '搜索上下文要可恢复',
      ],
      [
        '审核台强调证据和安全动作',
        '审核页面显示内容版本、举报理由和可见范围，拒绝、下架和恢复需要明确确认。高风险动作后刷新状态并记录操作者，不依赖乐观按钮颜色。',
        '审核动作必须有确认和审计',
      ],
      [
        '键盘和移动端完成主任务',
        '发布、Feed、搜索和审核均可只用键盘操作，动态状态使用 aria-live 传达。移动端检查触控目标、长标题、图片和底部操作不重叠。',
        '主任务不能依赖鼠标',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Orbit 主流程、事件消费和前端降级已可运行。',
    goal: '能验证跨服务契约、重复消息、审核可见性、对象授权、Feed P95 和 Trace 完整性，并用故障注入证明降级有效。',
    guidedPractice: '重复发送发布和下架事件，暂停搜索消费者，制造 Feed 依赖超时，观察最终状态、告警和前端降级。',
    independentPractice: '完成安全与性能报告，覆盖越权读取、审核绕过、通知重复、Feed 尾延迟和 Trace 断链。',
    commonErrors: [
      '只测单个服务，没有验证事件重复后 Feed 和搜索是否一致。',
      '断言接口返回 200，却没有检查用户是否读到未审核内容。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Playwright Documentation. https://playwright.dev/docs/intro',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '契约测试覆盖生产与消费双方',
        '内容事件 schema、BFF 响应和内部调用都有样例测试，新增字段由旧消费者忽略，删除和语义变化先升级版本，并保存样例版本且由双方 CI 自动执行。',
        '生产者与消费者共同验收契约',
      ],
      [
        '重复与乱序注入必须自动运行',
        '重复发布、旧审核事件晚到和下架后重放都要进入集成测试。断言最终 Feed、搜索和通知只保留最新可见状态，并记录重放证据与测试报告。',
        '最终状态比单次响应更重要',
      ],
      [
        '安全测试沿对象边界展开',
        '普通用户不能读取未审核内容或他人私密内容，审核员操作需要角色与对象级授权，BFF 不能泄露内部错误和堆栈，并覆盖单条与批量越权与审计。',
        '每个服务都验证资源授权',
      ],
      [
        '性能和 Trace 一起验收',
        'Feed P95 目标 250ms 在固定数据与并发下测量，Trace 从网关覆盖内容服务、Kafka 消费和搜索索引。断链必须有告警和修复路径。',
        '性能结论必须可追溯',
      ],
      [
        '故障注入验证降级而非只验证报错',
        '关闭搜索、延迟 Feed 和停止通知消费者，检查用户看到的状态、指标、告警和恢复后的最终一致。降级按钮要真的可操作，并验证恢复路径。',
        '降级必须通过用户路径验证',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Orbit 服务测试、降级和性能基线已经建立。',
    goal: '能为每个服务构建固定镜像，配置 Kubernetes、HPA、NetworkPolicy、Kafka 与 OpenSearch 依赖，并建立发布、Trace、指标、日志和回滚流程。',
    guidedPractice: '让 CI 构建并发布一个独立服务，再修改错误配置触发回滚，观察网关、服务和 Trace 的状态。',
    independentPractice: '完成一次全链路灰度发布，保存镜像 digest、事件版本、配置、冒烟、指标和回滚证据。',
    commonErrors: [
      '多个服务共用同一镜像和发布节奏，失去独立部署能力。',
      '只监控 Pod 数量，没有 Feed、消息积压和搜索索引延迟指标。',
    ],
    sourceRefs: [
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'Helm Documentation. https://helm.sh/docs/',
      'Prometheus Documentation. https://prometheus.io/docs/',
    ],
    steps: [
      [
        '每个服务拥有独立制品和版本',
        'CI 为 gateway、identity、content、feed、search 和 notification 分别构建镜像、SBOM 和 digest，发布记录关联提交、契约版本和数据库迁移。',
        '独立发布能力来自独立制品',
      ],
      [
        'Kubernetes 配置明确资源边界',
        'Deployment、Service、Ingress、HPA、PDB、NetworkPolicy、探针和资源 requests/limits 一起设计。服务允许哪些调用方由网络策略和身份授权共同约束。',
        '网络策略不是身份授权替代品',
      ],
      [
        '消息与索引依赖进入发布检查',
        '发布前验证 Kafka topic、消费者组、OpenSearch 索引别名和 Redis 连接。错误 schema 或错误索引版本必须阻止流量切换。',
        '依赖契约也属于发布门禁',
      ],
      [
        '可观测性覆盖用户和队列',
        '仪表盘包含 Feed 成功率与 P95、搜索索引延迟、通知积压、Kafka lag、消费错误和 Trace 采样。日志包含 requestId、contentId 和事件 ID。',
        '跨服务故障从业务指标发现',
      ],
      [
        '灰度与回滚按服务执行',
        '发布后先小流量验证 Feed 和发布链路，再扩大流量。失败时回滚镜像或关闭新功能开关，重放未消费事件并检查投影是否恢复，同时再次进行数据对账。',
        '回滚后要验证最终一致',
      ],
    ],
  },
  {
    name: '综合训练 · Orbit 内容社区微服务 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'Orbit 已部署到测试环境，具备服务治理、消息、索引和回滚能力。',
    goal: '能演练搜索宕机、Feed 超时、通知积压、Kafka 重复、审核服务不可用和错误配置，完成降级、恢复、对账和架构答辩。',
    guidedPractice: '同时制造搜索不可用和 Feed 延迟，检查前端降级、告警和 Trace，再恢复服务并验证索引和 Feed 状态一致。',
    independentPractice: '写一份故障报告，区分触发因素、放大因素、根因、恢复动作、数据对账和后续 ADR。',
    commonErrors: [
      '服务恢复后只看到请求成功，不检查积压事件和旧索引是否已清理。',
      '复盘只归因于某个服务，不分析重试、超时和缓存策略如何放大故障。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Kubernetes Debugging. https://kubernetes.io/docs/tasks/debug/',
      'Kafka Operations. https://kafka.apache.org/documentation/#operations',
    ],
    steps: [
      [
        '搜索故障验证降级路径',
        '关闭搜索服务后，BFF 应保留 Feed 主路径并显示搜索暂不可用。记录错误率、用户可操作状态、恢复后索引重建时间和恢复时长，并核对仪表盘。',
        '降级服务不拖垮主流程',
      ],
      [
        'Feed 超时验证预算和缓存',
        '人为增加 Feed 延迟，观察 BFF deadline、回退最新内容、缓存命中率和前端状态。禁止无限重试导致请求风暴，并确认没有出现重试放大。',
        '重试必须消耗有限预算',
      ],
      [
        '通知积压验证幂等恢复',
        '停止通知消费者并制造大量事件，恢复后检查通知去重、积压下降和死信处理。发布成功不能被通知阻塞，并检查死信原因、恢复时间线和负责人。',
        '通知是派生副作用',
      ],
      [
        'Kafka 重复与错误 schema 演练',
        '重复事件、旧事件和未知字段同时进入消费者，验证版本、幂等和兼容策略。错误消费者应隔离，不阻塞其他消费组，并记录 schema 版本。',
        '消息兼容要向前向后验证',
      ],
      [
        '答辩解释拆分与一致性取舍',
        '回答为什么将这些能力拆服务、哪些状态最终一致、如何降级、如何重放和如何防止重试风暴。用 Feed P95、Kafka lag、Trace 和事故演练结果支撑结论。',
        '架构结论必须由运行证据支撑',
      ],
    ],
  },
];

const ORBIT_EXAMPLES: ProjectExampleGrid = [
  [
    example(
      '打印创作者、读者、审核员和 SRE 的社区任务',
      'javascript',
      `const roles = [
  { actor: '创作者', task: '发布草稿并看到审核状态', evidence: 'contentId + version' },
  { actor: '读者', task: '在 Feed 和搜索中找到已发布内容', evidence: 'visibleAt + indexVersion' },
  { actor: '审核员', task: '根据举报证据下架内容', evidence: 'auditId + reason' },
  { actor: 'SRE', task: '判定单服务故障是否影响主流程', evidence: 'traceId + degraded flag' },
];
for (const role of roles) console.log([role.actor, role.task, role.evidence].join(' | '));`,
      `创作者 | 发布草稿并看到审核状态 | contentId + version
读者 | 在 Feed 和搜索中找到已发布内容 | visibleAt + indexVersion
失败边界：角色任务没有可观察 ID 或恢复动作时不得进入验收`,
    ),
    example(
      '把内容从草稿到通知写成事件状态链',
      'javascript',
      `const events = [
  'ContentSubmitted', 'ContentApproved', 'FeedProjected',
  'SearchIndexed', 'NotificationQueued', 'ContentTakenDown',
];
const owners = new Map([
  ['ContentSubmitted', 'content'], ['ContentApproved', 'content'],
  ['FeedProjected', 'feed'], ['SearchIndexed', 'search'],
  ['NotificationQueued', 'notification'], ['ContentTakenDown', 'content'],
]);
for (const event of events) console.log(event + ' owner=' + owners.get(event));`,
      `ContentSubmitted owner=content
ContentApproved owner=content
FeedProjected owner=feed
SearchIndexed owner=search
失败边界：事件没有唯一所有者或 occurredAt 时无法重建最终状态`,
    ),
    example(
      '用流量、变化频率和故障域判断是否拆服务',
      'javascript',
      `const candidates = [
  { domain: 'feed', readRps: 2800, writeRps: 40, isolatedFailure: true },
  { domain: 'notification', readRps: 5, writeRps: 600, isolatedFailure: true },
  { domain: 'content', readRps: 120, writeRps: 90, isolatedFailure: false },
];
for (const c of candidates) {
  const split = c.readRps > 1000 || c.writeRps > 400 || c.isolatedFailure;
  console.log(c.domain + ' split=' + split + ' readRps=' + c.readRps);
}`,
      `feed split=true readRps=2800
notification split=true readRps=5
content split=false readRps=120
失败边界：仅因代码目录不同或团队偏好拆服务时，拆分评审不通过`,
    ),
    example(
      '把 Feed、搜索、审核和通知失败映射成降级动作',
      'typescript',
      `type Dependency = 'feed' | 'search' | 'moderation' | 'notification';
const policy: Record<Dependency, string> = {
  feed: 'fallback-latest-content',
  search: 'show-index-updating',
  moderation: 'hold-new-publication',
  notification: 'keep-publish-success-and-retry',
};
for (const [dependency, action] of Object.entries(policy)) {
  console.log(dependency + ' -> ' + action);
}`,
      `feed -> fallback-latest-content
search -> show-index-updating
moderation -> hold-new-publication
notification -> keep-publish-success-and-retry
失败边界：降级不能静默放行未审核内容，也不能让通知阻塞发布`,
    ),
    example(
      '冻结 Orbit 首版闭环与非目标',
      'yaml',
      `release: orbit-mvp
services:
  - gateway
  - identity
  - content
  - feed
  - search
excluded:
  - recommendation-model
  - service-mesh
  - global-fulltext-crawler
gates:
  content-to-feed: required
  content-to-search: required
  notification-failure-isolated: required`,
      `services=5 excluded=3 gates=3
PASS every service owns data and a failure boundary
失败边界：增加服务但没有数据所有权、SLO 和恢复路径时范围冻结失败`,
    ),
  ],
  [
    example(
      '用责任矩阵固定每个服务的读写边界',
      'yaml',
      `services:
  identity:
    owns: [user, session]
  content:
    owns: [draft, publication, moderation]
  feed:
    owns: [feed_projection]
    rebuildFrom: [content.publication]
  search:
    owns: [search_index]
    rebuildFrom: [content.publication]
  notification:
    owns: [delivery_attempt]`,
      `owners=5 shared-databases=0
PASS no service writes another service's private tables
失败边界：feed 直接更新 content.publication 时边界检查失败`,
    ),
    example(
      '用一次发布请求验证跨服务可观察链路',
      'shell',
      `TRACE=$(curl -fsS -X POST "$BASE/content" \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"现场故障复盘","body":"可验证证据","tags":["sre"]}' \\
  -D - -o /tmp/publish.json | awk -F': ' 'tolower($1)=="x-trace-id"{print $2}' | tr -d '\\r')
CONTENT=$(jq -r .id /tmp/publish.json)
psql "$DATABASE_URL" -Atc "select status from content where id='$CONTENT'"
curl -fsS "$BASE/feeds/home?contentId=$CONTENT" | jq -e '.items[0].id'`,
      `HTTP/1.1 202 Accepted
x-trace-id: 7fa4c3d1
status=PENDING_MODERATION
feed visible=false reason=not-approved
失败边界：发布返回 201 但 Feed 已可见时违反审核边界，必须回滚投影`,
    ),
    example(
      '用事件版本拒绝旧审核状态覆盖新状态',
      'sql',
      `CREATE TABLE content_projection (
  content_id uuid PRIMARY KEY,
  visible boolean NOT NULL,
  event_version bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

INSERT INTO content_projection(content_id, visible, event_version, updated_at)
VALUES ('c_01', false, 7, now())
ON CONFLICT (content_id) DO UPDATE
SET visible=EXCLUDED.visible, event_version=EXCLUDED.event_version, updated_at=now()
WHERE EXCLUDED.event_version > content_projection.event_version
RETURNING content_id, visible, event_version;`,
      `first v7 TAKEDOWN: visible=false version=7
late v6 APPROVED: UPDATE 0
PASS stale event ignored
失败边界：旧事件覆盖 visible=true 时消费者版本判断或唯一键设计错误`,
    ),
    example(
      '把依赖故障、负责人和恢复条件写进降级范围',
      'yaml',
      `degradations:
  feed-timeout:
    userState: latest-content-fallback
    owner: feed-oncall
    recoverWhen: p95-under-250ms-for-10m
  search-down:
    userState: search-temporarily-unavailable
    owner: search-oncall
    recoverWhen: alias-healthy-and-lag-under-60s
  notification-backlog:
    userState: publish-succeeded
    owner: notify-oncall
    recoverWhen: consumer-lag-under-100`,
      `degradations=3 owners=3
PASS every fallback has a visible state and recovery condition
失败边界：降级没有负责人或恢复条件时视为未设计，不能通过范围审查`,
    ),
    example(
      '用范围和契约门禁冻结 Orbit 首版',
      'javascript',
      `const request = { name: 'ai-ranking', service: 'recommendation', eventOwner: null, slo: null };
const allowed = Boolean(request.service && request.eventOwner && request.slo);
console.log(request.name + ' decision=' + (allowed ? 'ACCEPT' : 'BACKLOG'));
if (!allowed) process.exitCode = 1;`,
      `ai-ranking decision=BACKLOG
reason=missing event owner and measurable SLO
失败边界：CI 退出码为 1，不能靠口头决定把无所有权能力塞入首版`,
    ),
  ],
  [
    example(
      '让 BFF 聚合 Feed 页面而不暴露内部服务列表',
      'typescript',
      `async function loadHomeFeed(userId: string, traceId: string) {
  const [feed, profile] = await Promise.all([
    feedClient.list(userId, { timeoutMs: 180, traceId }),
    identityClient.profile(userId, { timeoutMs: 120, traceId }),
  ]);
  return {
    items: feed.items.map((item) => ({ ...item, author: profile.name })),
    degraded: feed.degraded,
    requestId: traceId,
  };
}
console.log(await loadHomeFeed('u_7', 'trace-42'));`,
      `{items:[{id:"c_1",author:"林青"}],degraded:false,requestId:"trace-42"}
失败边界：Feed 超时时 BFF 返回降级内容；身份服务失败不能返回伪造作者`,
    ),
    example(
      '在内部契约中声明 deadline、重试和稳定错误码',
      'proto',
      `service FeedService {
  rpc ListHomeFeed(ListHomeFeedRequest) returns (ListHomeFeedResponse) {
    option deadline = 0.18;
  }
}
message ListHomeFeedRequest {
  string user_id = 1;
  string request_id = 2;
}
enum FeedErrorCode {
  FEED_UNAVAILABLE = 0;
  FEED_TIMEOUT = 1;
  FEED_RATE_LIMITED = 2;
}`,
      `feed.ListHomeFeed deadline=180ms
FEED_TIMEOUT retryable=true only-for-idempotent-read
FEED_RATE_LIMITED retryAfterMs=750
失败边界：写请求自动重试或 deadline 超出网关预算时契约评审失败`,
    ),
    example(
      '用 JSON Schema 只增加可选字段完成事件兼容',
      'json',
      `{
  "$id": "ContentApproved.v2",
  "type": "object",
  "required": ["eventId", "contentId", "version", "occurredAt"],
  "properties": {
    "eventId": { "type": "string" },
    "contentId": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "occurredAt": { "type": "string", "format": "date-time" },
    "visibility": { "enum": ["public", "followers"] }
  },
  "additionalProperties": false
}`,
      `v2 event accepted by v1 and v2 consumers
unknown optional field ignored by compatible reader
失败边界：删除 eventId 或修改 version 语义必须发布新事件类型`,
    ),
    example(
      '把主体与 traceparent 传播到每个内部读取边界',
      'java',
      `public FeedResponse home(Principal principal, String traceparent) {
  var requestId = requestContext.requireRequestId();
  var headers = Map.of(
    "x-user-id", principal.userId(),
    "x-request-id", requestId,
    "traceparent", traceparent
  );
  var visible = contentClient.listVisibleFor(principal.userId(), headers);
  return assembler.toFeed(visible, requestId);
}

// content-service still checks visibility and moderation state.
public boolean canRead(String userId, Content content) {
  return content.visibility().permits(userId) && content.moderation() == APPROVED;
}`,
      `BFF request=trace-42 user=u_7
content-service authorized=true moderation=APPROVED
unapproved content -> 404 CONTENT_NOT_ACCESSIBLE
失败边界：内网请求跳过对象授权时安全测试失败，即使 BFF 已鉴权`,
    ),
    example(
      '让前端只消费 BFF 的稳定状态与降级标记',
      'typescript',
      `type FeedView =
  | { state: 'ready'; items: FeedItem[]; degraded: false }
  | { state: 'degraded'; items: FeedItem[]; reason: 'feed_timeout' }
  | { state: 'empty'; query: string }
  | { state: 'unavailable'; retryAfterMs: number };
function label(view: FeedView) {
  if (view.state === 'degraded') return '显示最新内容，个性化结果暂不可用';
  if (view.state === 'empty') return '没有匹配 ' + view.query + ' 的内容';
  if (view.state === 'unavailable') return '最多等待 ' + view.retryAfterMs + 'ms 后重试';
  return view.items.length + ' 条内容';
}`,
      `degraded -> 显示最新内容，个性化结果暂不可用
empty:rust -> 没有匹配 rust 的内容
unavailable -> 最多等待 750ms 后重试
失败边界：前端不能分别猜测内部 feed、search、identity 的错误组合`,
    ),
  ],
  [
    example(
      '按服务所有权建立内容、Feed、搜索与通知数据表',
      'sql',
      `CREATE TABLE content (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','PENDING','APPROVED','TAKEN_DOWN')),
  version bigint NOT NULL DEFAULT 1
);
CREATE TABLE feed_projection (
  content_id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  visible boolean NOT NULL,
  event_version bigint NOT NULL
);
CREATE TABLE notification_attempt (
  event_id text PRIMARY KEY,
  content_id uuid NOT NULL,
  delivered_at timestamptz
);`,
      `content owner=content-service
feed_projection owner=feed-service
notification_attempt owner=notification-service
失败边界：多个服务直接写 content 表时拆服务边界检查失败`,
    ),
    example(
      '让内容审核状态与 Outbox 在同一本地事务提交',
      'sql',
      `BEGIN;
UPDATE content
SET status='APPROVED', version=version+1
WHERE id='c_01' AND status='PENDING';
INSERT INTO outbox(event_key, event_type, aggregate_id, payload)
VALUES (
  'content:c_01:v8',
  'ContentApproved',
  'c_01',
  '{"contentId":"c_01","version":8,"visibility":"public"}'
);
COMMIT;
SELECT event_key, sent_at FROM outbox WHERE aggregate_id='c_01';`,
      `UPDATE 1
INSERT 0 1
content:c_01:v8 | sent_at NULL
失败边界：内容状态提交但 Outbox 缺失时冻结发布，检查事务是否跨连接提交`,
    ),
    example(
      '把事件版本和幂等键一起写入派生投影',
      'sql',
      `INSERT INTO feed_projection(content_id, author_id, visible, event_version)
VALUES ('c_01', 'u_7', true, 8)
ON CONFLICT (content_id) DO UPDATE
SET author_id=EXCLUDED.author_id,
    visible=EXCLUDED.visible,
    event_version=EXCLUDED.event_version
WHERE EXCLUDED.event_version > feed_projection.event_version
RETURNING content_id, visible, event_version;`,
      `v8 approved -> c_01 visible=true version=8
v8 duplicate -> UPDATE 0 already-processed
v7 late -> UPDATE 0 stale-event
失败边界：去重只按 contentId 会丢掉合法新版本，只按 eventId 会接受乱序旧版本`,
    ),
    example(
      '用索引别名完成 OpenSearch 全量重建与切换',
      'shell',
      `curl -fsS -X PUT "$OPENSEARCH/content-v8" -H 'Content-Type: application/json' -d @index.json
node scripts/reindex.mjs --source content-db --target content-v8 --cursor 0
curl -fsS -X POST "$OPENSEARCH/_aliases" -H 'Content-Type: application/json' -d '{
  "actions":[
    {"remove":{"index":"content-v7","alias":"content-read"}},
    {"add":{"index":"content-v8","alias":"content-read"}}
  ]
}'
curl -fsS "$OPENSEARCH/content-read/_count"`,
      `indexed=184203 failed=0
alias content-read -> content-v8
{"count":184203,"_shards":{"successful":3}}
失败边界：校验数量或可见性不一致时保留旧别名，禁止切换读流量`,
    ),
    example(
      '按扩展字段、双写验证、回填、切换四阶段迁移',
      'shell',
      `./gradlew flywayMigrate -Dflyway.target=18
./gradlew integrationTest --tests '*EventVersionCompatibilityTest'
node scripts/backfill-content-version.mjs --batch-size 500 --checkpoint artifacts/backfill.json
./gradlew flywayMigrate -Dflyway.target=19
psql "$DATABASE_URL" -Atc "select count(*) from content where version is null"`,
      `schema=V18 compatibility=PASS
backfilled=184203 checkpoint=done
schema=V19 null_versions=0
失败边界：旧消费者无法读取新字段或回填未完成时停止切换，不删除旧列`,
    ),
  ],
  [
    example(
      '把共享契约与独立服务发布边界写进工作区',
      'kotlin',
      `// settings.gradle.kts
include(
  ":contracts:events", ":contracts:openapi",
  ":services:gateway", ":services:identity", ":services:content",
  ":services:feed", ":services:search", ":services:notification"
)

// services/feed/build.gradle.kts
dependencies {
  implementation(project(":contracts:events"))
  testImplementation("org.testcontainers:kafka")
}`,
      `./gradlew projects
Project ':contracts:events'
Project ':services:feed'
Project ':services:search'
失败边界：feed 依赖 content 内部实现或 contracts 包含实体类时架构测试失败`,
    ),
    example(
      '用 Compose 启动消息、索引和数据库真实依赖',
      'yaml',
      `services:
  postgres: { image: postgres:16.4, ports: ["5432:5432"] }
  redis: { image: redis:7.4, ports: ["6379:6379"] }
  kafka: { image: bitnami/kafka:3.8, ports: ["9092:9092"] }
  opensearch: { image: opensearchproject/opensearch:2.17.1, ports: ["9200:9200"] }
  feed: { build: ./services/feed, ports: ["8082:8080"] }
  search: { build: ./services/search, ports: ["8083:8080"] }`,
      `docker compose up -d --wait
postgres healthy kafka healthy opensearch healthy
feed healthy search healthy
失败边界：任一依赖未健康就启动服务时脚本退出，不用固定 sleep 猜测`,
    ),
    example(
      '启动时校验环境变量并拒绝空秘密默认值',
      'typescript',
      `const required = ['KAFKA_BOOTSTRAP', 'DATABASE_URL', 'OPENSEARCH_URL', 'SERVICE_NAME'];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error('missing env: ' + missing.join(','));
  process.exit(1);
}
if (process.env.KAFKA_BOOTSTRAP === 'localhost:9092' && process.env.NODE_ENV === 'production') {
  console.error('refusing local kafka in production');
  process.exit(1);
}
console.log('config-ok service=' + process.env.SERVICE_NAME);`,
      `missing env: DATABASE_URL
process exit=1
config-ok service=feed
失败边界：缺少秘密或生产环境引用 localhost 时立即失败，不进入 ready 状态`,
    ),
    example(
      '跨 HTTP 与 Kafka 传播 requestId 和 traceparent',
      'java',
      `public void publish(ContentApproved event) {
  var span = tracer.spanBuilder("kafka.publish ContentApproved")
    .setParent(Context.current())
    .setAttribute("event.id", event.eventId())
    .startSpan();
  try (var ignored = span.makeCurrent()) {
    var headers = new RecordHeaders();
    headers.add("traceparent", W3C.toTraceparent(span.getSpanContext()));
    kafkaTemplate.send("content-events", event.contentId(), event, headers);
  } finally {
    span.end();
  }
}`,
      `trace=4bf92f3577b34da6 span=kafka.publish event=c_01
consumer span parent=producer span
frontend requestId=trace-42
失败边界：消费者新起独立 trace 时跨服务故障链路断开，发布观察门禁失败`,
    ),
    example(
      '用一次发布事件跑通 Feed、搜索与通知投影',
      'shell',
      `CONTENT=$(curl -fsS -X POST localhost:8081/content -H 'Content-Type: application/json' \\
  -d '{"title":"本地链路验证","body":"真实事件流"}' | jq -r .id)
curl -fsS -X POST localhost:8081/content/$CONTENT/approve
until [ "$(curl -fsS localhost:8082/feed/$CONTENT | jq -r .visible)" = true ]; do sleep 1; done
curl -fsS "localhost:8083/search?q=本地链路验证" | jq -e '.hits[0].id'
psql "$DATABASE_URL" -Atc "select count(*) from notification_attempt where content_id='$CONTENT'"`,
      `content=c_01 status=APPROVED
feed visible=true searchHits=1 notificationRows=1
PASS event chain end-to-end
失败边界：任一投影超过 60 秒未更新时保留 Outbox 并查看 consumer lag`,
    ),
  ],
  [
    example(
      '发布事务只提交内容状态和 Outbox 事件',
      'java',
      `@Transactional
public PublishResult approve(String contentId, long expectedVersion) {
  var content = repository.getForUpdate(contentId);
  if (!content.canApprove(expectedVersion)) throw new VersionConflict(content.version());
  content.approve();
  repository.save(content);
  outbox.append(new OutboxEvent(
    "content:" + contentId + ":v" + content.version(),
    "ContentApproved",
    mapper.writeValueAsString(content.approvedPayload())
  ));
  return new PublishResult(contentId, content.version(), "PENDING_PROJECTION");
}`,
      `POST approve expectedVersion=7 -> 202 content=c_01 version=8
db=APPROVED outbox=PENDING
notification/feed/search not called synchronously
失败边界：下游超时导致发布回滚时职责划分错误，主事务只依赖本地数据库`,
    ),
    example(
      '用版本和审核状态控制 Feed 与搜索可见性',
      'sql',
      `WITH current AS (
  SELECT id, version, status FROM content WHERE id='c_01'
), projected AS (
  UPDATE feed_projection p
  SET visible=(current.status='APPROVED'), event_version=current.version
  FROM current
  WHERE p.content_id=current.id AND current.version > p.event_version
  RETURNING p.content_id, p.visible, p.event_version
)
SELECT * FROM projected;

DELETE FROM search_index WHERE content_id='c_01' AND status <> 'APPROVED';`,
      `c_01 visible=false version=9 status=TAKEN_DOWN
search document removed
audit retained reason=policy-violation
失败边界：下架只删数据库正文却保留搜索索引时，受控检索仍返回违规内容`,
    ),
    example(
      '用 eventId 与内容版本双重幂等消费',
      'sql',
      `INSERT INTO consumer_inbox(consumer, event_id, content_id, event_version)
VALUES ('feed', 'evt_01', 'c_01', 8)
ON CONFLICT (consumer, event_id) DO NOTHING
RETURNING event_id;

INSERT INTO feed_projection(content_id, visible, event_version)
SELECT 'c_01', true, 8
WHERE EXISTS (SELECT 1 FROM consumer_inbox WHERE event_id='evt_01')
ON CONFLICT (content_id) DO UPDATE
SET visible=EXCLUDED.visible, event_version=EXCLUDED.event_version
WHERE EXCLUDED.event_version > feed_projection.event_version;`,
      `first event: inbox 1 row projection version=8
duplicate event: inbox 0 rows projection unchanged
old v7 event: UPDATE 0
失败边界：只按 eventId 去重时旧事件仍可能覆盖，必须同时比较内容版本`,
    ),
    example(
      '用有限 deadline 返回带原因的降级响应',
      'typescript',
      `async function feedOrFallback(userId: string, requestId: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180);
  try {
    const response = await fetch('/internal/feed/' + userId, { signal: controller.signal });
    return { state: 'ready', body: await response.json(), requestId };
  } catch (error) {
    return { state: 'degraded', reason: 'feed_timeout', fallback: 'latest-content', requestId };
  } finally {
    clearTimeout(timer);
  }
}`,
      `{"state":"degraded","reason":"feed_timeout","fallback":"latest-content","requestId":"tr-42"}
frontend shows=最新内容
失败边界：禁止无上限重试；降级结果必须带原因，否则用户和 SRE 无法区分空 Feed`,
    ),
    example(
      '通过 Outbox 重放和索引重建恢复派生状态',
      'shell',
      `psql "$DATABASE_URL" -c "update outbox set sent_at=null where aggregate_id='c_01'"
curl -fsS -X POST localhost:8082/admin/replay -d '{"aggregateId":"c_01"}'
node scripts/reindex.mjs --content-id c_01
curl -fsS localhost:8082/feed/c_01 | jq -e '.version==8'
curl -fsS "localhost:8083/search?q=本地链路验证" | jq -e '.total>=1'`,
      `outboxReplayed=1 feedVersion=8 searchHits=1
notificationRows=1 duplicateNotifications=0
失败边界：重放后版本回退或通知重复时停止恢复，核对 inbox 与 projection 版本`,
    ),
  ],
  [
    example(
      '发布状态只由内容服务结果决定',
      'typescript',
      `type PublishState = 'draft' | 'pending' | 'published' | 'rejected';
function actionFor(state: PublishState) {
  return {
    draft: { label: '提交审核', action: 'submit' },
    pending: { label: '等待审核', action: 'refresh' },
    published: { label: '查看内容', action: 'open' },
    rejected: { label: '修改后重提', action: 'edit' },
  }[state];
}
console.log(JSON.stringify(actionFor('pending')));`,
      `{"label":"等待审核","action":"refresh"}
失败边界：前端不能在 pending 状态显示“已发布”，也不能把本地草稿直接插入 Feed`,
    ),
    example(
      '区分 Feed 正常、空、索引更新和依赖降级',
      'typescript',
      `type FeedState =
  | { kind: 'ready'; items: number }
  | { kind: 'empty'; query: string }
  | { kind: 'indexing'; updatedAt: string }
  | { kind: 'degraded'; retryAfterMs: number };
function copy(state: FeedState) {
  if (state.kind === 'ready') return state.items + ' 条内容';
  if (state.kind === 'empty') return '没有匹配 ' + state.query + ' 的内容';
  if (state.kind === 'indexing') return '索引更新中，数据截至 ' + state.updatedAt;
  return '依赖暂不可用，' + state.retryAfterMs + 'ms 后可重试';
}`,
      `ready -> 24 条内容
empty:wasm -> 没有匹配 wasm 的内容
indexing -> 索引更新中，数据截至 10:32
失败边界：所有异常统一显示空白页会让用户误以为没有内容`,
    ),
    example(
      '把关键词、标签和时间筛选保存在可恢复 URL',
      'typescript',
      `function searchUrl(current: URL, patch: Record<string, string | null>) {
  const next = new URL(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') next.searchParams.delete(key);
    else next.searchParams.set(key, value);
  }
  next.searchParams.set('page', '1');
  return next;
}
const url = searchUrl(new URL('https://orbit.test/search?q=rust&page=3'), {
  tag: 'database', time: '30d',
});
console.log(url.pathname + url.search);`,
      `/search?q=rust&tag=database&time=30d&page=1
失败边界：筛选变化却保留旧 page=3 会跳过结果；搜索超时不能清空 URL 条件`,
    ),
    example(
      '审核动作提交前展示证据并要求二次确认',
      'typescript',
      `const action = {
  contentId: 'c_01',
  expectedVersion: 8,
  action: 'TAKE_DOWN',
  reason: '非法交易引导',
  evidenceIds: ['report_31', 'report_47'],
};
if (action.action === 'TAKE_DOWN' && action.evidenceIds.length < 2) {
  throw new Error('take-down requires two evidence items');
}
console.log(JSON.stringify({ ...action, confirmation: 'typed-reason', auditRequired: true }));`,
      `{"contentId":"c_01","expectedVersion":8,"action":"TAKE_DOWN","reason":"非法交易引导","confirmation":"typed-reason","auditRequired":true}
失败边界：并发审核版本已变化时返回 409，操作者必须重新读取证据再确认`,
    ),
    example(
      '用键盘和 320px 视口完成发布、搜索和审核',
      'typescript',
      `test('orbit core tasks work on mobile keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/publish');
  await page.getByLabel('标题').fill('移动端发布');
  await page.getByLabel('正文').fill('内容包含可验证证据和失败边界。');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('待审核');
  await page.getByRole('link', { name: '搜索' }).click();
  await page.getByLabel('搜索关键词').fill('移动端');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading')).toContainText('搜索结果');
});`,
      `1 passed
publishStatus=待审核 searchHeading=搜索结果
overflow=0 focusRestored=true
失败边界：移动端按钮被底栏遮挡、Tab 顺序跳跃或搜索框失焦时测试失败`,
    ),
  ],
  [
    example(
      '让生产者与消费者在 CI 共同验证事件契约',
      'shell',
      `pnpm contract:generate --schema contracts/events/content-approved.v2.json
pnpm contract:test:content-producer
pnpm contract:test:feed-consumer
pnpm contract:test:search-consumer
node scripts/check-contract-report.mjs artifacts/contracts.json`,
      `producer tests=4 passed=4
feed consumer tests=3 passed=3
search consumer tests=3 passed=3
失败边界：任一方新增必填字段或改变枚举语义时双方 CI 同时失败`,
    ),
    example(
      '自动注入重复、乱序和下架后重放事件',
      'sql',
      `INSERT INTO consumer_inbox(consumer, event_id, content_id, event_version) VALUES
  ('feed', 'evt_8', 'c_01', 8),
  ('feed', 'evt_9', 'c_01', 9),
  ('feed', 'evt_7', 'c_01', 7)
ON CONFLICT (consumer, event_id) DO NOTHING;

SELECT content_id, visible, event_version
FROM feed_projection WHERE content_id='c_01';`,
      `inbox inserted=0 processed=3
content_id=c_01 visible=false event_version=9
失败边界：event_version 回到 7 或 visible 重新变为 true 时集成测试失败`,
    ),
    example(
      '沿对象边界验证未审核内容、私密内容与 BFF 错误',
      'shell',
      `curl -sS -o /tmp/a.json -w '%{http_code}' "$BASE/bff/feed?includePending=true"
printf '\\n'
curl -sS -o /tmp/b.json -w '%{http_code}' "$BASE/content/c_private" \\
  -H "Authorization: Bearer $OTHER_USER"
printf '\\n'
jq -r '.code' /tmp/b.json`,
      `200
404
CONTENT_NOT_ACCESSIBLE
失败边界：includePending 返回未审核内容或 BFF 泄露 content-service 堆栈时安全测试失败`,
    ),
    example(
      '同时验收 Feed P95、错误率与完整 Trace',
      'promql',
      `histogram_quantile(0.95,
  sum(rate(orbit_feed_request_duration_bucket[5m])) by (le)
)
sum(rate(orbit_feed_request_total{status=~"5.."}[5m]))
/
sum(rate(orbit_feed_request_total[5m]))
sum(rate(orbit_trace_missing_span_total[5m]))`,
      `feed p95=187ms errorRate=0.002
traceMissingSpans=0
gate=PASS p95<250ms errorRate<1%
失败边界：平均延迟合格但 p95 超标仍失败；Trace 缺 Kafka 消费 span 时不得发布`,
    ),
    example(
      '关闭搜索并暂停通知消费者验证降级与恢复',
      'shell',
      `kubectl scale deployment/search --replicas=0
curl -fsS "$BASE/bff/home" | jq '{state,degraded,search}'
kubectl scale deployment/search --replicas=2
kubectl rollout status deployment/search --timeout=120s
node scripts/reindex.mjs --mode catch-up
curl -fsS "$BASE/bff/search?q=sre" | jq -e '.state=="ready"'`,
      `{"state":"ready","degraded":true,"search":"updating"}
search replicas=2 ready
catch-up indexed=318 lag=0
失败边界：搜索恢复后主 Feed 错误率仍高或索引 lag 不归零时保持降级`,
    ),
  ],
  [
    example(
      '为每个 Orbit 服务生成独立镜像、SBOM 与版本记录',
      'yaml',
      `strategy:
  matrix:
    service: [gateway, identity, content, feed, search, notification]
steps:
  - run: ./gradlew :services:\${{ matrix.service }}:test
  - run: docker build -t registry.local/orbit-\${{ matrix.service }}:\${{ github.sha }} ./services/\${{ matrix.service }}
  - run: syft registry.local/orbit-\${{ matrix.service }}:\${{ github.sha }} -o spdx-json=\${{ matrix.service }}.spdx.json
  - run: cosign sign registry.local/orbit-\${{ matrix.service }}:\${{ github.sha }}`,
      `6 service images built
digests recorded with commit=7f3a9c2
sbom files=6 signatures=6
失败边界：任一镜像共用 tag 或测试失败仍发布时流水线阻断`,
    ),
    example(
      '用 Kubernetes 网络策略、探针和资源边界隔离服务',
      'yaml',
      `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: feed-allow-gateway }
spec:
  podSelector: { matchLabels: { app: feed } }
  ingress:
    - from:
        - podSelector: { matchLabels: { app: gateway } }
      ports: [{ port: 8080, protocol: TCP }]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: feed }
spec:
  template:
    spec:
      containers:
        - name: feed
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { cpu: "1", memory: 512Mi }`,
      `kubectl apply --dry-run=server -f k8s/feed.yaml
networkPolicy=valid requests=cpu 250m memory 256Mi
PASS only gateway can call feed:8080
失败边界：identity 直接调用 feed 时连接超时；放宽策略必须经过架构评审`,
    ),
    example(
      '发布前校验 Kafka topic、消费者组和搜索别名',
      'shell',
      `kafka-topics.sh --bootstrap-server "$KAFKA" --describe --topic content-events
kafka-consumer-groups.sh --bootstrap-server "$KAFKA" --describe --group feed-projection
curl -fsS "$OPENSEARCH/_alias/content-read" | jq -e 'keys|length==1'
curl -fsS "$BASE/actuator/health/readiness" | jq -e '.components.kafka.status=="UP"'`,
      `topic partitions=6 replicationFactor=3
feed-projection lag=0
alias=content-v8 consumers=2
失败边界：索引别名指向两个索引或消费者组不存在时阻止流量切换`,
    ),
    example(
      '用业务指标、队列和 Trace 构建跨服务仪表盘',
      'promql',
      `histogram_quantile(0.95, sum(rate(orbit_feed_duration_bucket[5m])) by (le))
max(orbit_search_index_lag_seconds)
sum(orbit_notification_backlog)
sum(kafka_consumergroup_lag{group="feed-projection"})
sum(rate(orbit_consumer_error_total[5m]))`,
      `feedP95=184ms searchLag=23s notificationBacklog=12
kafkaLag=0 consumerErrors=0
失败边界：Pod 数量正常但 Feed P95 或 Kafka lag 持续上升时必须告警`,
    ),
    example(
      '按服务灰度发布并在失败时回滚与重放事件',
      'shell',
      `kubectl set image deployment/feed feed=registry.local/orbit-feed:$SHA
kubectl rollout status deployment/feed --timeout=120s
curl -fsS "$BASE/canary/feed" | jq -e '.p95<250 and .errors<0.01'
if [ $? -ne 0 ]; then kubectl rollout undo deployment/feed; fi
./gradlew :services:feed:replayOutbox --args='--from-cursor artifacts/feed-cursor'
psql "$DATABASE_URL" -Atc "select count(*) from feed_projection where event_version is null"`,
      `canary traffic=5% p95=192ms errors=0.003
rollback target=previous revision=18
replayed=0 nullVersions=0
失败边界：回滚后仍需核对投影版本；数据库迁移不兼容时不能直接撤销镜像`,
    ),
  ],
  [
    example(
      '关闭搜索时保持 Feed 主路径并显示可操作状态',
      'typescript',
      `type SearchAvailability = 'ready' | 'temporarily_unavailable';
function searchPanel(availability: SearchAvailability, retryAfterMs: number) {
  if (availability === 'ready') return { title: '搜索内容', enabled: true };
  return {
    title: '搜索暂不可用',
    enabled: false,
    action: '返回最新内容',
    retryAfterMs,
  };
}
console.log(JSON.stringify(searchPanel('temporarily_unavailable', 1500)));`,
      `{"title":"搜索暂不可用","enabled":false,"action":"返回最新内容","retryAfterMs":1500}
失败边界：搜索故障不能拖垮 Feed；页面不能只显示空白而不提供返回入口`,
    ),
    example(
      '给 Feed 超时设置预算并验证回退缓存',
      'shell',
      `kubectl exec deploy/gateway -- curl -fsS -X POST localhost:8080/debug/latency/feed/600
for i in 1 2 3; do curl -sS -o /tmp/feed.json -w '%{http_code} %{time_total}\\n' "$BASE/feed"; done
jq '{degraded,reason,items:(.items|length)}' /tmp/feed.json
kubectl exec deploy/gateway -- curl -fsS -X DELETE localhost:8080/debug/latency/feed`,
      `200 0.184
200 0.191
200 0.189
{"degraded":true,"reason":"feed_timeout","items":20}
失败边界：请求超过 250ms 或回退内容为空时告警，禁止无限重试放大故障`,
    ),
    example(
      '暂停通知消费者后验证积压、去重与死信',
      'promql',
      `sum(orbit_notification_backlog)
sum(increase(orbit_notification_deadletter_total[10m]))
sum(increase(orbit_notification_duplicate_total[10m]))
max(orbit_notification_oldest_age_seconds)`,
      `backlog=1250 deadletters=3 duplicates=17 oldestAge=640s
ALERT NotificationBacklogHigh
失败边界：恢复后积压不下降或死信增长时停止自动重试，保留消息与 eventId`,
    ),
    example(
      '注入重复事件、旧事件和未知字段验证兼容',
      'shell',
      `kafka-console-producer.sh --bootstrap-server "$KAFKA" --topic content-events < fixtures/events.jsonl
kafka-console-consumer.sh --bootstrap-server "$KAFKA" --topic content-events \\
  --from-beginning --max-messages 4 --property print.key=true
psql "$DATABASE_URL" -Atc "select content_id,visible,event_version from feed_projection where content_id='c_01'"
curl -fsS "$OPENSEARCH/content-read/_doc/c_01" | jq -e '._source.visible==false'`,
      `evt_7 v7 APPROVED consumed
evt_8 v8 APPROVED consumed
evt_9 v9 TAKEN_DOWN consumed
feed=c_01,false,9 searchVisible=false
失败边界：未知字段导致消费者崩溃或旧 v7 覆盖 v9 时停止升级`,
    ),
    example(
      '把拆分依据、一致性和恢复证据写进答辩记录',
      'json',
      `{
  "decision": "independently deploy feed and search projections",
  "evidence": ["feed 2800 rps", "search lag SLO 60s", "search outage fallback test"],
  "consistency": "content owner plus versioned outbox events",
  "recovery": ["outbox replay", "search alias rebuild", "degraded feed"],
  "reject": ["shared content table", "synchronous fan-out on publish"],
  "openRisks": ["hot author fan-out", "schema compatibility"]
}`,
      `decision=independent-projections evidence=3 consistency=outbox
recovery=3 reject=2 openRisks=2
失败边界：无法给出数据所有权、降级或重放证据时只能保持模块化单体`,
    ),
  ],
];

export const PROGRAMMING_PROJECT_TRAINING_BATCH_03_COURSES =
  withProjectExamples(ORBIT_COURSES, ORBIT_EXAMPLES);
