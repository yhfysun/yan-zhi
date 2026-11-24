// P15 综合训练第五批手写样板：Nimbus 预约票务 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;

const NIMBUS_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · Nimbus 预约票务 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解时间、库存和订单基础，能设计简单 HTTP API。',
    goal: '能区分预约用户、运营、客服和值班 SRE 的任务，建立场馆、时段、库存、预约、支付和取消的业务流程，并识别时间、并发和未知结果风险。',
    guidedPractice: '模拟用户抢最后一张票、运营关闭时段、客服查重复预约和 SRE 处理 Redis 故障，记录输入、反馈、失败代价和人工兜底。',
    independentPractice: '交付用户任务卡、时段预约状态图和风险清单，覆盖超卖、重复预约、支付超时、取消和时区变化。',
    commonErrors: [
      '只设计“选择时段并支付成功”路径，没有说明库存何时占用和超时释放。',
      '把日期时间当成本地字符串，忽略场馆时区、夏令时和跨日时段。',
    ],
    sourceRefs: [
      'The Go Programming Language Documentation. https://go.dev/doc/',
      'PostgreSQL Concurrency Control. https://www.postgresql.org/docs/current/mvcc.html',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
    ],
    steps: [
      [
        '按角色拆预约任务',
        '用户要看到可预约时段、剩余容量和明确支付结果；运营要调整容量、关闭时段和处理异常；客服要定位重复预约和退款；SRE 要判断高峰、依赖故障和 Pod 驱逐的影响。每个角色写成功证据与操作入口。',
        '角色任务必须覆盖异常和人工处理',
      ],
      [
        '把时段与库存分开建模',
        '场馆拥有地点和时区，时段拥有开始结束时间和容量，库存记录可用、预占和已确认数量。用户提交预约时先占位，支付成功再确认，超时或取消释放，所有时间统一存储为 UTC。',
        '时区和库存是业务核心',
      ],
      [
        '记录未知支付结果',
        '支付超时后不能直接认定失败，预约应保持预占等待主动查询或回调。重复回调以支付流水幂等，取消和退款必须根据最终状态执行。',
        '未知结果需要可查询的中间状态',
      ],
      [
        '识别容量与热点',
        '热门时段可能瞬间流量很高，数据库行锁、连接池、Redis 和 Pod 扩缩都会成为瓶颈。先根据预约峰值和单次事务成本估算容量，再设计限流和排队。',
        '并发问题不只是库存数量',
      ],
      [
        '形成首版闭环',
        '首版包含场馆、时段、库存、预约、取消、模拟支付回调和运营容量调整；不做选座图、真实支付和跨区域多活。每个非目标写清风险与重新评估条件。',
        '首版闭环必须可对账',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 Nimbus 角色任务、预约状态和风险清单。',
    goal: '能把首版限定为场馆、时段、库存、预约、取消和模拟支付，写出并发抢位、重复提交、超时释放、取消补偿、P95 和恢复的可执行验收。',
    guidedPractice: '为最后一张票并发抢购、重复预约、支付回调重复和关闭时段写 Given/When/Then，并定义观察数据库和用户界面的指标。',
    independentPractice: '交付验收矩阵、压测目标和容量假设，每条包含触发、观察值、通过线、证据和失败修复动作。',
    commonErrors: [
      '只写库存不能小于零，没有定义同一预约被重复确认和取消后的结果。',
      '只测单个 Pod，没有覆盖扩容后数据库连接池和热点行锁。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
      'KEDA Documentation. https://keda.sh/docs/',
    ],
    steps: [
      [
        'MVP 收敛到可验证闭环',
        '首版必须能查询场馆与时段、创建预占、模拟支付、确认或取消预约、运营调整容量和查询预约状态。无支付和付款中状态要明确显示，不能只保留成功页面。',
        '业务状态必须完整',
      ],
      [
        '并发验收使用最后库存',
        '让多个请求同时争抢最后一个容量，通过数据库最终可用、预占和确认数量判断。成功数只能一个，其他请求得到稳定冲突错误。',
        '并发验证检查最终账实',
      ],
      [
        '幂等验收覆盖重复请求',
        '同一用户和幂等键重复提交只返回原预约，同一支付流水重复回调只确认一次，取消重复执行结果不变。错误正文区分幂等冲突和库存不足。',
        '重复请求必须有同一业务结果',
      ],
      [
        '质量和容量写成数字',
        '定义高峰并发、预约 P95、错误率、占位释放时间和数据库连接池上限，再用压测基线验证。目标要绑定数据规模、Pod 数量和依赖配置。',
        '容量目标必须可复测',
      ],
      [
        '冻结带证据的范围',
        '新增功能要说明影响哪个状态、库存事务和容量目标。没有并发和恢复验收的场景不进入首版。',
        '范围变更更新状态机',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 Nimbus MVP、状态机和并发验收。',
    goal: '能定义场馆、时段、预约、支付和运营接口，处理幂等键、库存冲突、未知支付、取消、时区和分页，并让前端稳定呈现状态。',
    guidedPractice: '写出创建预约、支付回调、取消和调整容量接口，再模拟重复提交、库存不足、支付超时和关闭时段。',
    independentPractice: '交付 API 契约、错误码表、SSE/轮询或查询策略和前端请求矩阵，覆盖所有中间状态。',
    commonErrors: [
      '创建预约返回 200 但没有幂等语义，重试生成第二条记录。',
      '支付失败和支付结果未知共用同一个错误码，前端无法决定是否释放库存。',
    ],
    sourceRefs: [
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'RFC 9110 HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110',
      'IANA Time Zone Database. https://www.iana.org/time-zones',
    ],
    steps: [
      [
        '资源与动作语义稳定',
        'venues、slots、reservations 和 payments 使用资源路径；创建预约和取消属于明确状态动作。每个接口声明权限、幂等和失败状态。',
        '资源边界对应业务生命周期',
      ],
      [
        '幂等键与用户绑定',
        '创建预约要求用户和 Idempotency-Key 唯一，保存请求摘要和首次结果。不同用户复用相同键不能共享预约。',
        '幂等作用域必须包含主体',
      ],
      [
        '时间字段带时区和绝对时间',
        'API 同时返回 UTC 开始时间和场馆时区、显示时区，前端用统一格式化展示。跨日、夏令时变化和关闭时段不能依赖客户端本地时区猜测。',
        '服务器时间语义优先',
      ],
      [
        '错误码支持恢复',
        '409 表示库存或状态冲突，422 表示输入校验失败，429 表示限流，503 表示支付或依赖暂不可用；未知支付使用明确业务状态和查询接口，不混成失败。',
        '错误应指导下一步动作',
      ],
      [
        '契约样例覆盖状态转换',
        '创建、等待支付、确认、取消、超时关闭和退款各有一致请求响应。前端按 state 渲染，不解析自由文本决定是否重试。',
        '状态是稳定前端契约',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 Nimbus API、预约状态和幂等要求。',
    goal: '能设计场馆、时段、库存、预约、支付、取消和审计模型，用条件更新、唯一约束、超时扫描和迁移保护不超卖与不重复。',
    guidedPractice: '为最后库存设计条件更新和唯一预约约束，再模拟重复支付回调和取消超时扫描。',
    independentPractice: '交付 ER 图、约束、索引和迁移计划，覆盖预约释放、历史回填和容量调整。',
    commonErrors: [
      '库存单独一列先读后写，应用层判断无法阻止并发覆盖。',
      '取消直接删除预约，支付和客服审计失去依据。',
    ],
    sourceRefs: [
      'PostgreSQL Locking. https://www.postgresql.org/docs/current/explicit-locking.html',
      'Redis Documentation. https://redis.io/docs/latest/',
      'Testcontainers for Go. https://golang.testcontainers.org/',
    ],
    steps: [
      [
        '预约与库存记录同事务',
        '创建预约时在同一事务内插入预约并条件更新库存，库存行使用 version 或 available 条件。受影响行数为零返回冲突，不能先查后改。',
        '判断和写入必须原子',
      ],
      [
        '唯一约束保护幂等',
        '预约表对 user_id 与 idempotency_key 建唯一索引，支付表对 provider_trade_no 建唯一索引，取消记录以预约和版本唯一。冲突返回已有结果。',
        '幂等需要数据库最后防线',
      ],
      [
        '状态转换带版本',
        '预约保存 version、expires_at 和 state，确认与取消使用条件更新。旧回调不能把已取消预约确认，过期扫描也不能关闭已支付预约。',
        '并发状态转换需要版本',
      ],
      [
        '索引服务查询与扫描',
        '按场馆时段查询、用户预约、过期预占扫描和支付回调建立不同索引。扫描任务分批并记录处理量，避免长时间锁表。',
        '定时任务也要容量设计',
      ],
      [
        '迁移保留历史兼容',
        '新增时区、版本或幂等列先提供默认值和回填，旧新应用并存都能读写。容量调整作为审计记录而不是直接覆盖历史值。',
        '迁移必须支持双版本运行',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已有 Nimbus 数据模型、状态机与 API 契约。',
    goal: '能建立 Go API、React 管理端和本地 PostgreSQL、Redis、Kafka 环境，固定配置、迁移、健康检查和测试入口。',
    guidedPractice: '从空目录创建 Go 服务、React 页面和 Compose 依赖，跑通一次预约、模拟支付和取消。',
    independentPractice: '删除生成物后按 README 重建，并验证数据库、Redis、Kafka 任一不可用时的启动或降级提示。',
    commonErrors: [
      '把连接池和超时使用库默认值，压测时先被数据库连接耗尽。',
      '本地使用 SQLite 替代 PostgreSQL，错过条件更新和锁行为。',
    ],
    sourceRefs: [
      'Docker Compose Documentation. https://docs.docker.com/compose/',
      'Gin Web Framework. https://gin-gonic.com/docs/',
      'React Documentation. https://react.dev/',
    ],
    steps: [
      [
        '领域与适配器分层',
        '预约状态和库存规则放在领域服务，HTTP、PostgreSQL、Redis 和 Kafka 是适配器；handler 只做解析、鉴权调用和错误映射，避免业务散落在路由。',
        '路由不是领域层',
      ],
      [
        '本地依赖固定真实版本',
        'Compose 固定 PostgreSQL、Redis 和 Kafka tag，初始化迁移、测试数据和健康检查。集成测试使用 Testcontainers 或同一配置，不用 SQLite 模拟事务语义。',
        '本地依赖匹配生产',
      ],
      [
        '配置显式验证',
        '数据库 DSN、连接池、Redis、Kafka 和端口来自环境变量，启动时检查必需项和范围。日志输出版本但不输出 DSN 秘密。',
        '启动失败要指出缺失配置',
      ],
      [
        '健康检查分层',
        '存活检查只看进程，准备检查数据库、迁移和必要配置；Redis 或 Kafka 故障是否阻止接流量要按业务降级策略决定。',
        '探针语义不能一刀切',
      ],
      [
        '一条命令完成冒烟',
        'README 写出依赖启动、迁移、服务启动、创建预约、支付回调和取消命令。新成员从空目录执行后得到同一状态。',
        '首次运行路径必须可复制',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Nimbus 本地环境、库存迁移和预约接口已可运行。',
    goal: '能实现原子占位、幂等创建、支付回调、超时释放、取消和通知，处理数据库锁、Redis 故障、未知支付和队列积压。',
    guidedPractice: '并发预约最后一张票，再让支付回调重复和超时扫描同时发生，观察预约与库存最终状态。',
    independentPractice: '为 Redis 故障和 Kafka 中断各设计降级与恢复，证明不会超卖或重复通知。',
    commonErrors: [
      '占位成功后 Redis 缓存失败导致整个预约回滚，数据库与缓存状态矛盾。',
      '超时扫描直接关闭支付中预约，晚到成功回调无处恢复。',
    ],
    sourceRefs: [
      'Go database/sql. https://pkg.go.dev/database/sql',
      'PostgreSQL Concurrency Control. https://www.postgresql.org/docs/current/transaction-iso.html',
      'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
    ],
    steps: [
      [
        '原子占位与预约创建',
        '条件更新库存并插入预约在同一事务完成，失败回滚。幂等键先查或依赖唯一约束，重复请求返回原预约而不是再次扣库存。',
        '预约创建是一个事务',
      ],
      [
        '支付回调幂等确认',
        '回调校验签名、金额和预约状态，支付流水唯一约束防止重复。成功确认更新预约和库存确认量，发布事件的 Outbox 同事务提交。',
        '支付成功只能确认一次',
      ],
      [
        '超时释放条件化执行',
        '扫描只关闭已过期且仍待支付的预约，更新预约状态并返回预占量。与支付回调竞争时由版本和状态条件决定唯一胜者。',
        '扫描不能覆盖新状态',
      ],
      [
        '缓存不承担真相',
        'Redis 可缓存时段余量，但数据库库存是权威。缓存失败回源数据库，写操作先提交数据库再删除缓存，不能用缓存计数替代事务。',
        '缓存只是一份提示',
      ],
      [
        '通知失败不阻塞交易',
        '确认或取消后通过 Outbox 发布消息，通知服务幂等消费。Kafka 中断可积压和重放，交易状态仍可从数据库查询。',
        '通知是派生副作用',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Nimbus 库存、预约、支付和取消接口已可联调。',
    goal: '能实现时段选择、预约确认、支付结果、取消和运营容量调整页面，处理倒计时、库存变化、未知支付、限流和移动端操作。',
    guidedPractice: '完成抢最后一个时段、支付超时、取消和运营关闭时段四条路径，检查页面状态和用户恢复入口。',
    independentPractice: '用键盘和 320px 视口完成预约与取消，补齐焦点、错误、倒计时和触控目标。',
    commonErrors: [
      '前端拿到剩余库存后自行减一，接口冲突时页面仍显示预约成功。',
      '倒计时结束后直接显示失败，不查询服务端预约最终状态。',
    ],
    sourceRefs: [
      'React Documentation. https://react.dev/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'MDN Intl.DateTimeFormat. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat',
    ],
    steps: [
      [
        '库存与预约结果以服务端为准',
        '时段余量用于展示，提交后以接口返回预约状态为准。库存冲突显示刷新和选择其他时段，不能乐观宣布成功。',
        '客户端不能自行扣库存',
      ],
      [
        '支付中状态允许查询恢复',
        '倒计时结束进入结果确认中，页面通过查询获取待支付、已确认或关闭状态。未知结果不能显示成失败。',
        '倒计时不是支付结论',
      ],
      [
        '取消操作说明后果',
        '取消前显示所属时段、预约号和退款或释放状态，提交中防重复。取消成功后刷新库存和订单，失败保留重试入口。',
        '高风险动作需要确认',
      ],
      [
        '运营容量调整可审计',
        '运营页面显示当前容量、已确认和预占，调整需要原因和确认，成功后展示审计记录。不能直接编辑其他用户预约状态。',
        '后台操作也要有权限和审计',
      ],
      [
        '键盘与移动端完成主流程',
        '时段卡使用按钮语义，错误关联字段，动态余量用适度 aria-live。320px 下时间、价格、余量和主按钮不重叠。',
        '移动端优先保证抢位效率',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Nimbus 主流程、并发事务和前端恢复路径已经可运行。',
    goal: '能验证并发库存、重复请求、超时竞争、对象授权、限流、数据库锁和高峰 P95，并用故障注入证明降级与恢复。',
    guidedPractice: '并发抢最后一张票并同时发送重复支付回调和取消，记录成功数、冲突数、锁等待和最终库存。',
    independentPractice: '完成高峰压测与安全审查，修复连接池、热点锁或越权问题并保存前后证据。',
    commonErrors: [
      '压测只发查询请求，没有模拟真实占位、支付和取消事务。',
      '测试用户能通过修改预约 ID 查看他人预约。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Playwright Documentation. https://playwright.dev/docs/intro',
      'Go Diagnostics. https://go.dev/doc/diagnostics',
    ],
    steps: [
      [
        '领域测试覆盖状态不变量',
        '预约不能超容量，确认和取消只能从合法状态进入，重复请求返回同一结果。领域测试不依赖网络和数据库。',
        '状态机先独立验证',
      ],
      [
        '真实数据库并发测试',
        '使用 PostgreSQL 集成测试并发占位、支付和超时扫描，断言最终库存、预约和支付一致。测试必须可重复清理数据。',
        '并发测试要用真实事务',
      ],
      [
        '安全覆盖对象和运营边界',
        '用户不能读取或取消他人预约，运营接口需要角色和场馆范围，日志不泄露支付和身份信息。',
        '每个资源入口验证归属',
      ],
      [
        '压测模拟混合业务',
        '压测比例包含查询、占位、支付、取消和运营调整，记录 P95/P99、错误率、数据库连接、锁等待和 Redis 命中。',
        '只压查询会得出虚假容量',
      ],
      [
        '故障注入验证降级',
        'Redis 不可用回源数据库，Kafka 中断保留 Outbox，Pod 驱逐后未完成请求可重试。恢复后对账预约与库存。',
        '降级后仍需业务一致',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Nimbus 测试、压测基线和降级策略已经建立。',
    goal: '能构建 distroless Go 镜像，配置探针、资源、HPA/KEDA、数据库和 Redis 依赖，并建立预约、库存、支付和队列指标及回滚流程。',
    guidedPractice: '让 CI 因并发测试和镜像扫描失败一次，再完成测试环境发布和一次配置回滚。',
    independentPractice: '交付发布记录，包含镜像 digest、迁移版本、容量、冒烟、仪表盘和回滚证据。',
    commonErrors: [
      '扩容 Pod 但数据库连接池不变，新增实例迅速耗尽数据库连接。',
      '只按 CPU 扩容，Kafka 积压或请求排队时无法及时增加消费者。',
    ],
    sourceRefs: [
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'KEDA Documentation. https://keda.sh/docs/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '构建最小 Go 运行镜像',
        '多阶段构建静态二进制，运行层使用 distroless 或最小镜像、非 root、只读文件系统和固定 tag，产物记录 digest 与 SBOM。',
        '镜像只包含运行需求',
      ],
      [
        '容量与连接池一起扩缩',
        'HPA 根据请求或 CPU，KEDA 根据 Kafka 积压；数据库连接上限按实例数和总配额规划，扩 Pod 前先验证数据库容量。',
        '扩容不是无限增加实例',
      ],
      [
        '探针与优雅停机保护发布',
        '就绪探针验证迁移与关键依赖，存活探针检查进程，终止时先停止接收请求再等待在途预约事务完成。',
        '滚动发布需要连接排空',
      ],
      [
        '业务指标进入仪表盘',
        '观察预约成功率、库存冲突、待支付、超时释放、支付回调、Kafka lag 和数据库锁等待。日志带预约号和 requestId。',
        '从用户和库存视角监控',
      ],
      [
        '发布和回滚都可验证',
        '灰度后先做查询、占位、支付和取消冒烟，再扩大流量；失败时回滚镜像和配置，并核对预约、库存和消息积压。',
        '回滚后仍要对账',
      ],
    ],
  },
  {
    name: '综合训练 · Nimbus 预约票务 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'Nimbus 已部署测试环境，具备并发、限流、消息和回滚能力。',
    goal: '能演练热门时段热点、Redis 故障、Kafka 积压、数据库连接耗尽、Pod 驱逐和错误扩容，完成降级、恢复与容量答辩。',
    guidedPractice: '制造热门时段流量和 Redis 故障，观察数据库压力、限流、错误码和恢复后的库存一致性。',
    independentPractice: '写故障报告，包含时间线、容量瓶颈、错误率、恢复动作、对账结果和后续 ADR。',
    commonErrors: [
      '故障恢复后只确认接口返回 200，没有核对预占、确认和取消数量。',
      '复盘只归因流量大，不分析热点锁、连接池和重试如何放大。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Kubernetes Debugging. https://kubernetes.io/docs/tasks/debug/',
      'Go Diagnostics. https://go.dev/doc/diagnostics',
    ],
    steps: [
      [
        '热点时段演练验证限流',
        '集中流量抢同一时段，记录成功、冲突、429、数据库锁等待和 P99。限流应保护系统并返回可重试时间。',
        '过载时主动拒绝优于雪崩',
      ],
      [
        'Redis 故障回源演练',
        '关闭 Redis 后库存查询回源数据库，确认缓存不可用不会改变预约真相。恢复后删除旧缓存并核对余量。',
        '缓存故障不能阻止交易',
      ],
      [
        'Kafka 积压与通知恢复',
        '停止消费者制造积压，恢复后按预约和支付流水去重，检查通知最终状态。交易不能被消息积压阻塞。',
        '消息恢复需要幂等',
      ],
      [
        '数据库连接耗尽演练',
        '降低连接池或增加慢查询，观察排队、超时和 Pod 状态，修复查询或连接配置后再压测。',
        '先找饱和资源再扩实例',
      ],
      [
        '答辩用容量与一致性证据',
        '解释条件更新、幂等键、状态机、限流和 KEDA 选择，说明高峰容量、数据库上限和剩余风险，并用压测与演练数据支撑。',
        '预约系统答辩以不超卖为核心',
      ],
    ],
  },
];

const NIMBUS_STEP_SUFFIXES: Readonly<Record<string, string>> = {
  '记录未知支付结果': '支付渠道查询还应记录 traceId、查询时间和下一次重试时间。',
  '形成首版闭环': '每项非目标都要绑定一个未来触发条件和重新评估负责人。',
  '并发验收使用最后库存': '测试要保存并发请求数、锁等待时间和最终账实数量。',
  '幂等验收覆盖重复请求': '相同键不同正文必须返回冲突，而不是静默复用旧预约。',
  '质量和容量写成数字': '压测同时记录数据库连接、限流拒绝率和预约 P99。',
  '冻结带证据的范围': '任何延期都要更新风险清单、验收矩阵和负责人，并定期复核。',
  '幂等键与用户绑定': '幂等键在同一用户范围内不可复用，跨用户必须隔离。',
  '契约样例覆盖状态转换': '未知支付状态必须保留可查询、可重试和可人工处理入口。',
  '索引服务查询与扫描': '过期扫描索引要支持按状态和过期时间分批遍历并记录游标。',
  '迁移保留历史兼容': '回填期间要允许旧新字段双读，并保存校验结果。',
  '健康检查分层': 'Redis 故障是否影响就绪状态要由明确的降级策略决定。',
  '一条命令完成冒烟': '脚本输出预约号、支付结果和最终库存供人工复核。',
  '原子占位与预约创建': '唯一约束冲突应返回原预约，而不是再次扣减库存。',
  '支付回调幂等确认': '回调校验失败要保留原始请求摘要和安全审计记录。',
  '超时释放条件化执行': '释放动作要记录预约版本、批次数和释放数量。',
  '缓存不承担真相': '缓存删除失败时由短 TTL 和数据库回源共同兜底。',
  '通知失败不阻塞交易': '通知消息必须携带预约号、事件 ID 和可重放时间。',
  '库存与预约结果以服务端为准': '冲突响应要给出刷新余量和选择其他时段的明确动作。',
  '支付中状态允许查询恢复': '轮询要有退避上限，并允许用户返回订单查看最终结果。',
  '取消操作说明后果': '取消成功后还要刷新支付、退款和库存释放状态。',
  '运营容量调整可审计': '调整前后的容量、原因和操作者都要进入审计日志。',
  '键盘与移动端完成主流程': '时间、余量和价格要按同一条阅读顺序展示且触控目标达标。',
  '领域测试覆盖状态不变量': '每个非法状态转换都要有独立用例和稳定错误码。',
  '真实数据库并发测试': '测试数据必须隔离，失败后可以安全清理和重跑。',
  '安全覆盖对象和运营边界': '运营权限还要限制到具体场馆、时段、动作、审计和日志。',
  '压测模拟混合业务': '压测失败样本要保留请求、数据库状态和日志时间线。',
  '故障注入验证降级': '恢复后执行库存、预约、支付和取消总数对账。',
  '探针与优雅停机保护发布': '终止前要等待在途事务提交或回滚，并停止新连接。',
  '发布和回滚都可验证': '回滚后还要观察库存冲突、支付回调延迟和队列积压。',
  '热点时段演练验证限流': '限流响应应包含重试时间、错误码和 requestId。',
  'Redis 故障回源演练': '恢复后要清理不一致缓存键并核对数据库余量。',
  'Kafka 积压与通知恢复': '消费者恢复前要限制并发，避免瞬间打满数据库。',
  '数据库连接耗尽演练': '修复后重新测量连接水位、排队时间、P99 和恢复负责人。',
  '答辩用容量与一致性证据': '每个架构选择都要能追溯到压测、故障注入或事故数据。',
};

const NIMBUS_STEP_EXAMPLES: Readonly<Record<string, LearningV2LessonExample>> = {
  '按角色拆预约任务': {
    title: '预约角色任务与操作范围',
    language: 'yaml',
    code: `roles:
  visitor:
    actions: [slot:read, reservation:create, reservation:cancel]
  venue_operator:
    actions: [slot:close, slot:capacity:adjust]
    object_scope: venue_id
  support:
    actions: [reservation:read, payment:read]
    pii_masking: true
  sre:
    actions: [metric:read, reservation:release]
    requires_reason: true
success_evidence:
  visitor: reservation_id_and_state
  operator: before_after_capacity_audit
  support: payment_event_timeline`,
    output: `$ nimbusctl rolecheck config/roles.yaml
roles=4 actions=9 missing_object_scope=0
support_can_cancel=false sre_requires_reason=true
失败边界：客服读取预约时必须脱敏；运营只能修改自己场馆的容量，不能跨场馆。`,
  },
  '把时段与库存分开建模': {
    title: 'UTC 时段与库存行模型',
    language: 'sql',
    code: `CREATE TABLE venue (
  id UUID PRIMARY KEY, timezone TEXT NOT NULL, name TEXT NOT NULL
);
CREATE TABLE slot (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES venue(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  CHECK (starts_at < ends_at)
);
CREATE TABLE inventory (
  slot_id UUID PRIMARY KEY REFERENCES slot(id),
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  CHECK (reserved + confirmed <= capacity)
);`,
    output: `$ psql "$NIMBUS_DB" -f migrations/001_slots.sql
CREATE TABLE
CREATE TABLE
CREATE TABLE
$ psql "$NIMBUS_DB" -c "select pg_typeof(starts_at) from slot limit 1"
timestamp with time zone
失败边界：库存拆分后各列仍要满足总占用不超过容量；时间不得以无时区文本存储。`,
  },
  '记录未知支付结果': {
    title: '支付未知状态与主动查询',
    language: 'bash',
    code: `curl -sS -X POST localhost:8080/reservations/rsv-31/payments \\
  -H 'Content-Type: application/json' \\
  -d '{"provider":"sandbox-pay","method":"wallet","amount":12800,"currency":"CNY"}'
curl -sS localhost:8080/reservations/rsv-31 | jq '.state,.payment.lastCheckedAt'
curl -sS -X POST localhost:8080/payments/pay-77/query \\
  -H 'Authorization: Bearer support-local'
sleep 2
curl -sS localhost:8080/reservations/rsv-31 | jq '.state,.payment.unknownReason'`,
    output: `$ ./scripts/payment-timeout-demo.sh
create_payment=pay-77 state=payment_pending
provider_timeout=true reservation=payment_unknown
query_attempt=1 next_query_at=2026-11-24T10:32:18Z
失败边界：超时不能直接释放库存；必须先查询或等待回调，重复回调只确认一次。`,
  },
  '识别容量与热点': {
    title: '热点时段容量估算与数据库水位',
    language: 'sql',
    code: `SELECT slot_id, capacity, reserved, confirmed,
       round(100.0 * (reserved + confirmed) / capacity, 2) AS used_pct,
       wait_event_type, wait_event, query_start
FROM inventory i
JOIN pg_stat_activity a ON a.query LIKE '%' || i.slot_id::text || '%'
WHERE slot_id = 'slot-hot-7'
ORDER BY query_start;
-- 容量假设：20 Pod × 连接池 10，小于 PostgreSQL max_connections 240
SELECT count(*) FILTER (WHERE state = 'active') AS active,
       count(*) FILTER (WHERE wait_event_type = 'Lock') AS lock_waiters
FROM pg_stat_activity;`,
    output: `$ psql "$NIMBUS_DB" -f ops/hot-slot.sql
slot-hot-7 capacity=80 reserved=76 confirmed=3 used_pct=98.75
active=63 lock_waiters=17
失败边界：并发增加但连接池和热点行锁未测时会先打满数据库，而不是线性提升吞吐。`,
  },
  '形成首版闭环': {
    title: '预约状态机与非目标',
    language: 'mermaid',
    code: `stateDiagram-v2
  [*] --> payment_pending: create reservation
  payment_pending --> confirmed: payment callback success
  payment_pending --> payment_unknown: provider timeout
  payment_unknown --> confirmed: query success
  payment_unknown --> expired: query fails and deadline passed
  payment_pending --> cancelled: user cancels
  confirmed --> refund_pending: user cancels
  refund_pending --> cancelled: refund confirmed`,
    output: `$ nimbusctl state-machine validate docs/reservation-state.mmd
states=5 transitions=7 terminal_states=cancelled,expired
unreachable_states=0 duplicate_transitions=0
失败边界：payment_unknown 不能直接转 expired；必须先取得明确的失败或超时结论。`,
  },
  'MVP 收敛到可验证闭环': {
    title: '首版预约端到端验收',
    language: 'gherkin',
    code: `Scenario: 用户抢到最后一个名额
  Given slot-hot-7 只剩 1 个可用名额
  And 用户 u-42 使用幂等键 booking-009
  When 用户创建预约并完成模拟支付
  Then 预约状态为 confirmed
  And 时段 reserved + confirmed 等于 capacity
  When 相同幂等键再次提交
  Then 返回同一个 reservationId
  And 库存不再变化`,
    output: `$ go test ./e2e -run TestLastSeat -count=1
reservation=rsv-31 state=confirmed
capacity=80 reserved=79 confirmed=1 duplicate_idempotent=true
失败边界：第二次提交若生成新预约或再次减少容量，即使都返回 200 也验收失败。`,
  },
  '并发验收使用最后库存': {
    title: '100 并发争抢最后一个名额',
    language: 'go',
    code: `func TestLastSeatConcurrent(t *testing.T) {
  slot := seedSlot(t, 1)
  var success, conflict atomic.Int32
  var wg sync.WaitGroup
  for i := 0; i < 100; i++ {
    wg.Add(1)
    go func(i int) {
      defer wg.Done()
      err := svc.Reserve(ctx, ReserveCmd{SlotID: slot, UserID: fmt.Sprintf("u-%d", i)})
      if errors.Is(err, ErrInventoryConflict) { conflict.Add(1); return }
      require.NoError(t, err); success.Add(1)
    }(i)
  }
  wg.Wait()
  require.EqualValues(t, 1, success.Load())
  require.EqualValues(t, 99, conflict.Load())
}`,
    output: `$ go test ./internal/reservation -run TestLastSeatConcurrent -count=1
success=1 conflict=99
reserved=1 confirmed=0 capacity=1
失败边界：成功数大于容量或出现 500 都说明条件更新与错误映射有缺陷。`,
  },
  '幂等验收覆盖重复请求': {
    title: '用户级幂等键重复提交',
    language: 'bash',
    code: `for n in 1 2; do
  curl -sS -X POST localhost:8080/reservations \\
    -H 'Authorization: Bearer u-42' \\
    -H 'Idempotency-Key: booking-009' \\
    -H 'Content-Type: application/json' \\
    -d '{"slotId":"slot-7","seats":1}'
done
curl -sS -X POST localhost:8080/reservations \\
  -H 'Authorization: Bearer u-43' \\
  -H 'Idempotency-Key: booking-009' \\
  -H 'Content-Type: application/json' \\
  -d '{"slotId":"slot-7","seats":1}'`,
    output: `$ ./scripts/idempotency-demo.sh
first=rsv-31 state=payment_pending
same_user=rsv-31 reused=true
other_user=rsv-32 created=true
失败边界：相同键但不同请求正文应返回 409；不同用户绝不能共享同一预约。`,
  },
  '质量和容量写成数字': {
    title: '预约峰值压测门槛',
    language: 'javascript',
    code: `import http from 'k6/http';
import { check } from 'k6';
export const options = {
  scenarios: { mixed: { executor: 'ramping-vus', startVUs: 10,
    stages: [{ target: 200, duration: '1m' }, { target: 200, duration: '3m' }] } },
  thresholds: {
    http_req_duration: ['p(95)<350'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.995'],
  },
};
export default function () {
  const res = http.post('http://127.0.0.1:8080/reservations',
    JSON.stringify({ slotId: __ENV.SLOT_ID, seats: 1 }),
    { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer load-user' } });
  check(res, { 'expected response': (r) => [201, 409, 429].includes(r.status) });
}`,
    output: `$ k6 run tests/load/reservation.js
http_req_duration p95=286ms http_req_failed=0.42%
checks=99.83% db_connections_peak=132 active_after=0
失败边界：把 409 库存冲突当失败会误判业务；但 500、超时和连接泄漏必须计入失败。`,
  },
  '冻结带证据的范围': {
    title: '预约功能变更门禁',
    language: 'yaml',
    code: `change_gate:
  feature: choose-seat
  affected_states: [slot_discovery, reservation_create]
  required_tests:
    - concurrent_last_seat
    - payment_unknown_recovery
    - redis_outage_fallback
  capacity_budget:
    extra_database_roundtrips: 1
    p95_budget_ms: 350
  owners: {product: booking-pm, data: booking-dba, sre: nimbus-oncall}
  rollback: feature.choose_seat.enabled`,
    output: `$ nimbusctl change evaluate choose-seat
required_tests=3 present=2 rollback_switch=ready
capacity_budget=exceeded
decision=blocked
失败边界：选座会改变库存粒度，没有并发、回滚和容量证据不能进入首版。`,
  },
  '资源与动作语义稳定': {
    title: '预约 OpenAPI 资源设计',
    language: 'yaml',
    code: `paths:
  /venues/{venueId}/slots:
    get: {operationId: listSlots, security: [{bearer: []}]}
  /reservations:
    post:
      operationId: createReservation
      parameters:
        - {name: Idempotency-Key, in: header, required: true, schema: {type: string}}
      responses: {"201": {description: reserved}, "409": {description: conflict}}
  /reservations/{id}/cancel:
    post: {operationId: cancelReservation, responses: {"202": {description: accepted}}}
  /ops/slots/{id}/capacity:
    patch: {operationId: adjustCapacity, responses: {"200": {description: audited}}}`,
    output: `$ vacuum lint openapi.yaml
operations=4 missing_operation_id=0 missing_auth=0
idempotency_header=documented
失败边界：创建预约不能无幂等头；运营改容量必须与用户预约接口分开授权和审计。`,
  },
  '幂等键与用户绑定': {
    title: '用户和幂等键联合唯一约束',
    language: 'sql',
    code: `CREATE TABLE reservation (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
INSERT INTO reservation (id,user_id,idempotency_key,request_hash,state)
VALUES (:id,:user_id,:key,:request_hash,'payment_pending')
ON CONFLICT (user_id,idempotency_key) DO UPDATE
SET idempotency_key = EXCLUDED.idempotency_key
RETURNING id, request_hash,
  request_hash = EXCLUDED.request_hash AS same_request;`,
    output: `$ psql "$NIMBUS_DB" -f migrations/010_idempotency.sql
CREATE TABLE
INSERT 0 1
same_user_same_body=rsv-31 same_request=true
same_user_different_body=same_request=false
失败边界：跨用户唯一会泄露或复用预约；同键不同 body 必须返回冲突而不是原结果。`,
  },
  '时间字段带时区和绝对时间': {
    title: '场馆时区与 UTC 显示',
    language: 'json',
    code: `{
  "slotId": "slot-7",
  "startsAt": "2026-11-24T11:00:00Z",
  "endsAt": "2026-11-24T12:30:00Z",
  "venueTimezone": "Asia/Shanghai",
  "displayTime": "2026-11-24 19:00-20:30",
  "crossesMidnight": false,
  "capacity": 80,
  "available": 3
}`,
    output: `$ curl -s localhost:8080/venues/v-2/slots/slot-7 | jq '.startsAt,.venueTimezone,.displayTime'
"2026-11-24T11:00:00Z"
"Asia/Shanghai"
"2026-11-24 19:00-20:30"
失败边界：浏览器本地时区不能替代场馆时区；夏令时或跨日时段要由服务端返回绝对时间。`,
  },
  '错误码支持恢复': {
    title: '预约错误码与恢复动作',
    language: 'json',
    code: `[
  {"status":409,"code":"SLOT_CAPACITY_CONFLICT","retryable":false,
   "action":"refresh_inventory_and_choose_another_slot"},
  {"status":422,"code":"INVALID_TIME_WINDOW","retryable":false,
   "action":"correct_request"},
  {"status":429,"code":"BOOKING_RATE_LIMITED","retryable":true,"retryAfterMs":2000},
  {"status":503,"code":"PAYMENT_PROVIDER_UNAVAILABLE","retryable":true,
   "reservationState":"payment_unknown"},
  {"status":409,"code":"IDEMPOTENCY_KEY_REUSED","retryable":false}
]`,
    output: `$ go test ./internal/http -run TestErrorRecoveryContract
cases=5 stable_codes=5 retry_after_present_for_retryable=2
payment_unknown_not_mapped_as_failed=true
失败边界：所有 5xx 都返回 retryable 会诱导失败支付无限重试；恢复动作必须按状态区分。`,
  },
  '契约样例覆盖状态转换': {
    title: '预约状态夹具测试',
    language: 'go',
    code: `func TestReservationFixtures(t *testing.T) {
  cases := []struct{ before, action, after string }{
    {"payment_pending", "payment.success", "confirmed"},
    {"payment_pending", "payment.timeout", "payment_unknown"},
    {"payment_unknown", "payment.query.failed", "expired"},
    {"confirmed", "reservation.cancel", "refund_pending"},
    {"refund_pending", "refund.confirmed", "cancelled"},
  }
  for _, tc := range cases {
    got := machine.Apply(tc.before, tc.action)
    require.Equal(t, tc.after, got, "%s + %s", tc.before, tc.action)
  }
}`,
    output: `$ go test ./internal/reservation -run TestReservationFixtures -v
--- PASS: TestReservationFixtures (0.00s)
transitions=5 invalid=0
payment_pending+cancel still covered by explicit policy test
失败边界：未知支付不能因页面刷新或轮询暂时失败而直接转成 expired。`,
  },
  '预约与库存记录同事务': {
    title: '条件更新库存的原子预约',
    language: 'sql',
    code: `WITH taken AS (
  UPDATE inventory
  SET reserved = reserved + 1, version = version + 1
  WHERE slot_id = :slot_id
    AND capacity - reserved - confirmed >= 1
  RETURNING slot_id
)
INSERT INTO reservation (id,user_id,slot_id,state,idempotency_key,request_hash)
SELECT :reservation_id,:user_id,slot_id,'payment_pending',:key,:hash
FROM taken
RETURNING id,state;
-- 同一事务提交；taken 为空时返回库存冲突`,
    output: `$ psql "$NIMBUS_DB" -c "BEGIN; <reserve.sql>; COMMIT;"
reservation=rsv-31 state=payment_pending
inventory_row_reserved=77 version=19
失败边界：先 SELECT 余量再 UPDATE 会允许并发覆盖；受影响行数必须与预约插入共同成功。`,
  },
  '唯一约束保护幂等': {
    title: '支付流水和请求摘要唯一性',
    language: 'sql',
    code: `CREATE TABLE payment (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL,
  provider_trade_no TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL,
  raw_digest CHAR(64) NOT NULL,
  UNIQUE (provider_trade_no)
);
CREATE TABLE idempotency_record (
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_reservation_id UUID NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);
-- 回调重复：ON CONFLICT(provider_trade_no) DO NOTHING`,
    output: `$ psql "$NIMBUS_DB" -f migrations/011_payment_unique.sql
CREATE TABLE
CREATE TABLE
$ go test ./internal/payment -run TestRepeatedCallback
first=confirmed duplicate=noop inventory_unchanged=true
失败边界：唯一冲突后必须查回已有结果；直接返回 500 会让支付渠道持续重试。`,
  },
  '状态转换带版本': {
    title: '版本条件更新防旧回调',
    language: 'sql',
    code: `UPDATE reservation
SET state = 'confirmed', version = version + 1, confirmed_at = now()
WHERE id = :reservation_id
  AND state = 'payment_pending'
  AND version = :expected_version
  AND expires_at > now()
RETURNING id, state, version;

UPDATE reservation
SET state = 'expired', version = version + 1
WHERE id = :reservation_id
  AND state = 'payment_pending'
  AND expires_at <= now();
-- 支付回调携带 provider_event_id 并单独记录`,
    output: `$ psql "$NIMBUS_DB" -f ops/confirm-reservation.sql
reservation=rsv-31 state=confirmed version=5
late_expiry_update=0 rows
stale_callback=0 state_changes
失败边界：旧版本回调不能覆盖取消或已确认状态；条件失败要查询当前状态并幂等返回。`,
  },
  '索引服务查询与扫描': {
    title: '预约查询与超时扫描索引',
    language: 'sql',
    code: `CREATE INDEX reservation_user_created
  ON reservation (user_id, created_at DESC);
CREATE INDEX reservation_slot_state
  ON reservation (slot_id, state, expires_at);
CREATE INDEX reservation_expiry_scan
  ON reservation (expires_at, id)
  WHERE state = 'payment_pending';
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM reservation
WHERE state = 'payment_pending' AND expires_at <= now()
ORDER BY expires_at, id
LIMIT 500;`,
    output: `$ psql "$NIMBUS_DB" -c "<EXPLAIN command>"
Index Scan using reservation_expiry_scan
actual_rows=500 buffers=23 scan_ms=1.8
失败边界：全表扫描会随历史预约增长拖慢每批释放；扫描需按 id 游标分批提交。`,
  },
  '迁移保留历史兼容': {
    title: '时区与容量审计迁移',
    language: 'sql',
    code: `ALTER TABLE venue ADD COLUMN timezone TEXT;
UPDATE venue SET timezone = 'Asia/Shanghai' WHERE timezone IS NULL;
ALTER TABLE venue ALTER COLUMN timezone SET NOT NULL;

CREATE TABLE capacity_change (
  id BIGSERIAL PRIMARY KEY,
  slot_id UUID NOT NULL,
  old_capacity INTEGER NOT NULL,
  new_capacity INTEGER NOT NULL,
  actor_id UUID NOT NULL,
  reason TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 应用先容忍 timezone 可空，完成回填后再启用 NOT NULL 代码`,
    output: `$ atlas migrate up --target 2026_11_capacity_audit
migrations=3 backfilled_timezone=42 null_timezone=0
old_app_reads=true new_app_reads=true
失败边界：直接改列类型或删除旧字段会破坏滚动发布；回填和双读必须先完成。`,
  },
  '领域与适配器分层': {
    title: '预约领域服务与依赖端口',
    language: 'go',
    code: `type InventoryPort interface {
  Reserve(ctx context.Context, slotID uuid.UUID, seats int) (int, error)
}
type ReservationRepo interface {
  Save(ctx context.Context, r *Reservation) error
}
type Service struct { inventory InventoryPort; reservations ReservationRepo }
func (s *Service) Reserve(ctx context.Context, cmd ReserveCommand) (*Reservation, error) {
  remaining, err := s.inventory.Reserve(ctx, cmd.SlotID, cmd.Seats)
  if errors.Is(err, ErrConflict) { return nil, ErrCapacityConflict }
  r := NewPendingReservation(cmd.UserID, cmd.SlotID, remaining)
  return r, s.reservations.Save(ctx, r)
}
// HTTP handler 只解析、鉴权并映射错误，不包含库存判断`,
    output: `$ go test ./internal/reservation -cover
ok internal/reservation 0.86s coverage=87.4%
http_imports_domain_adapter=false
domain_imports_pgx=false
失败边界：handler 中直接写库存 SQL 会让领域测试、重试和审计逻辑分叉。`,
  },
  '本地依赖固定真实版本': {
    title: 'PostgreSQL、Redis 与 Kafka 本地环境',
    language: 'yaml',
    code: `services:
  postgres:
    image: postgres:16.3-alpine
    environment: {POSTGRES_DB: nimbus, POSTGRES_USER: nimbus, POSTGRES_PASSWORD: local}
    healthcheck: {test: ["CMD-SHELL","pg_isready -U nimbus"], interval: 2s}
  redis:
    image: redis:7.2.5-alpine
    command: ["redis-server","--appendonly","yes"]
  kafka:
    image: bitnami/kafka:3.7.0
    environment:
      KAFKA_CFG_NODE_ID: 1
      KAFKA_CFG_PROCESS_ROLES: broker,controller
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093`,
    output: `$ docker compose up -d --wait
postgres=healthy redis=healthy kafka=healthy
$ go test ./... -tags=integration
integration packages=7 passed
失败边界：用 SQLite 代替 PostgreSQL 会漏掉锁等待和条件更新语义，集成测试不能通过。`,
  },
  '配置显式验证': {
    title: '连接池与超时启动校验',
    language: 'go',
    code: `type Config struct {
  DatabaseURL string        ` + "`env:\"DATABASE_URL,required\"`" + `
  DBMaxConns  int32         ` + "`env:\"DB_MAX_CONNS\" envDefault:\"20\"`" + `
  RedisAddr   string        ` + "`env:\"REDIS_ADDR,required\"`" + `
  ReserveTTL  time.Duration ` + "`env:\"RESERVE_TTL\" envDefault:\"10m\"`" + `
}
func LoadConfig() (Config, error) {
  var cfg Config
  if err := env.Parse(&cfg); err != nil { return cfg, err }
  if cfg.DBMaxConns < 5 || cfg.DBMaxConns > 40 { return cfg, errors.New("DB_MAX_CONNS out of range") }
  if cfg.ReserveTTL < time.Minute { return cfg, errors.New("RESERVE_TTL too short") }
  return cfg, nil
}`,
    output: `$ DB_MAX_CONNS=80 go run ./cmd/api
config invalid: DB_MAX_CONNS out of range: 80
exit_status=1
$ DB_MAX_CONNS=20 go run ./cmd/api
config valid db_max_conns=20 reserve_ttl=10m0s
失败边界：配置库默认值可能在容器中变成无限连接；关键上下限必须在启动时校验。`,
  },
  '健康检查分层': {
    title: '存活、就绪与依赖降级',
    language: 'go',
    code: `mux.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
  w.WriteHeader(http.StatusOK)
  _,_ = w.Write([]byte("alive"))
})
mux.HandleFunc("/health/ready", func(w http.ResponseWriter, r *http.Request) {
  ctx, cancel := context.WithTimeout(r.Context(), 700*time.Millisecond)
  defer cancel()
  if err := db.Ping(ctx); err != nil {
    http.Error(w, "database unavailable", http.StatusServiceUnavailable); return
  }
  status := map[string]string{"database":"up","redis":"degraded","kafka":"up"}
  _ = json.NewEncoder(w).Encode(status)
})`,
    output: `$ curl -s -o /dev/null -w '%{http_code}' localhost:8080/health/live
200
$ curl -s localhost:8080/health/ready | jq
{"database":"up","redis":"degraded","kafka":"up"}
失败边界：Redis 降级不应自动让进程被重启；数据库不可用时 readiness 必须停止接新流量。`,
  },
  '一条命令完成冒烟': {
    title: '创建、支付、查询和取消冒烟',
    language: 'bash',
    code: `set -euo pipefail
slot=$(curl -fsS 'localhost:8080/venues/v-2/slots?date=2026-11-24' | jq -r '.[0].id')
rsv=$(curl -fsS -X POST localhost:8080/reservations -H 'Idempotency-Key: smoke-31' \\
  -H 'Content-Type: application/json' -d "{\"slotId\":\"$slot\",\"seats\":1}" | jq -r '.id')
curl -fsS -X POST "localhost:8080/reservations/$rsv/pay/simulate" | jq -e '.state=="confirmed"'
curl -fsS "localhost:8080/reservations/$rsv" | jq -e '.payment.status=="paid"'
curl -fsS -X POST "localhost:8080/reservations/$rsv/cancel" | jq -e '.state=="refund_pending"'`,
    output: `$ ./scripts/smoke.sh
slot=slot-7 reservation=rsv-31 state=payment_pending
payment=confirmed amount=128
query=confirmed cancel=refund_pending
smoke_result=PASS
失败边界：冒烟必须检查状态和金额，不能只看 curl 退出码；失败时保留 reservationId 供排查。`,
  },
  '原子占位与预约创建': {
    title: 'Go 事务中的库存与预约写入',
    language: 'go',
    code: `func (r *PostgresRepo) Reserve(ctx context.Context, cmd ReserveCommand) (*Reservation, error) {
  tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
  if err != nil { return nil, err }
  defer tx.Rollback(ctx)
  var version int
  err = tx.QueryRow(ctx, reserveInventorySQL, cmd.SlotID, cmd.Seats).Scan(&version)
  if errors.Is(err, pgx.ErrNoRows) { return nil, ErrCapacityConflict }
  if err != nil { return nil, err }
  reservation, err := insertReservation(ctx, tx, cmd, version)
  if err != nil { return nil, err }
  return reservation, tx.Commit(ctx)
}`,
    output: `$ go test ./internal/storage -run TestReserveRollback -count=1
inventory_update_rolled_back=true reservation_rows=0
context_deadline_released_connections=0
失败边界：库存更新后预约插入失败必须整体回滚；事务 context 还要继承请求 deadline。`,
  },
  '支付回调幂等确认': {
    title: '支付回调验签、唯一流水与确认',
    language: 'go',
    code: `func (h *PaymentHandler) Callback(w http.ResponseWriter, r *http.Request) {
  body, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
  if !h.provider.Verify(r.Header.Get("X-Pay-Signature"), body) {
    http.Error(w, "invalid signature", http.StatusUnauthorized); return
  }
  event, err := h.provider.Parse(body)
  if err != nil { http.Error(w, "bad payload", http.StatusBadRequest); return }
  result, err := h.payments.Confirm(r.Context(), event)
  if err != nil { http.Error(w, err.Error(), http.StatusServiceUnavailable); return }
  writeJSON(w, http.StatusOK, result)
}
// Confirm: INSERT provider_trade_no ... ON CONFLICT DO NOTHING`,
    output: `$ go test ./internal/payment -run TestCallback -count=1
valid_signature=confirmed duplicate=already_confirmed
invalid_signature=401 reservation_state=payment_pending
失败边界：验签失败不能改状态；重复回调必须返回同一结果，不能重复加已确认数量。`,
  },
  '超时释放条件化执行': {
    title: '分批释放过期预占',
    language: 'go',
    code: `func (w *ExpiryWorker) RunOnce(ctx context.Context) (int, error) {
  rows, err := w.repo.FindExpiredPending(ctx, time.Now().UTC(), 500)
  if err != nil { return 0, err }
  released := 0
  for _, id := range rows {
    n, err := w.repo.ExpireAndRelease(ctx, id, w.clock.Now())
    if err != nil { return released, err }
    released += n
  }
  w.metrics.Add("nimbus.expiry.released", float64(released))
  return released, nil
}
// UPDATE reservation ... WHERE state='payment_pending' AND expires_at <= now()`,
    output: `$ go test ./internal/expiry -run TestPaidReservationNotExpired -v
--- PASS: TestPaidReservationNotExpired
expired_pending=3 paid_skipped=1 inventory_released=3
失败边界：批量扫描与释放之间支付可能成功，释放更新必须带状态和过期条件。`,
  },
  '缓存不承担真相': {
    title: 'Redis 缓存失败时回源数据库',
    language: 'go',
    code: `func (s *InventoryService) Available(ctx context.Context, slotID uuid.UUID) (int, error) {
  key := "slot:available:" + slotID.String()
  if raw, err := s.redis.Get(ctx, key).Int(); err == nil {
    if value, ok := s.cachePolicy.Accept(raw); ok { return value, nil }
  }
  value, err := s.repo.Available(ctx, slotID)
  if err != nil { return 0, err }
  _ = s.redis.Set(ctx, key, value, 15*time.Second).Err()
  return value, nil
}
// 预约事务只更新 PostgreSQL，提交后按版本删除缓存`,
    output: `$ go test ./internal/inventory -run 'TestRedisDown|TestCacheInvalidated'
redis_down=database_value_returned cache_write_error=logged
stale_after_commit=0
失败边界：缓存写失败不能回滚已提交预约；缓存值也不能用于决定是否允许扣减库存。`,
  },
  '通知失败不阻塞交易': {
    title: 'Outbox 通知与重试',
    language: 'sql',
    code: `CREATE TABLE outbox_event (
  id UUID PRIMARY KEY,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX outbox_pending ON outbox_event (created_at, id)
WHERE published_at IS NULL;
-- 预约事务内 INSERT outbox_event('reservation.confirmed')
-- 通知消费者按 event_id 去重，Kafka 不可用不回滚预约`,
    output: `$ psql "$NIMBUS_DB" -c "select event_type,count(*) from outbox_event where published_at is null group by 1"
reservation.confirmed | 4
$ go test ./internal/notification -run TestOutboxRetry
attempts=3 published=4 reservation_committed=true
失败边界：在数据库事务内同步调用邮件服务会放大失败面；消息必须可重放且消费者幂等。`,
  },
  '库存与预约结果以服务端为准': {
    title: '前端以服务端库存响应更新页面',
    language: 'tsx',
    code: `async function reserve(slotId: string) {
  setStatus('submitting');
  const result = await api.createReservation(slotId, crypto.randomUUID());
  if (result.status === 409) {
    const latest = await api.getSlot(slotId);
    setInventory(latest.available);
    setMessage('名额刚刚变化，请选择其他时段');
    return;
  }
  setReservation(result.reservation);
  setInventory(result.inventory.available);
  setStatus('payment_pending');
}
// 禁止在点击时先把本地 available 减一作为最终结果`,
    output: `$ pnpm vitest run src/features/booking/reserve.test.tsx
click_optimistic_value=ignored
409_refreshes_inventory=true confirmed_uses_server_value=true
失败边界：本地先减库存只能做禁用按钮提示，不能替代服务端结果或回滚用户可见余量。`,
  },
  '支付中状态允许查询恢复': {
    title: '支付中轮询与退避',
    language: 'typescript',
    code: `async function waitForPayment(reservationId: string) {
  const delays = [500, 1000, 2000, 4000, 8000];
  for (const delay of delays) {
    await sleep(delay);
    const result = await api.getPaymentStatus(reservationId);
    if (result.state === 'confirmed') return result;
    if (result.state === 'payment_unknown') continue;
    if (result.state === 'expired') throw new BookingError(result.code);
  }
  return { state: 'payment_unknown', action: 'query_later' } as const;
}
// 页面刷新后根据 reservationId 恢复，不依赖内存中的旧 token`,
    output: `$ pnpm vitest run src/features/payment/polling.test.ts --fake-timers
attempts=5 max_delay_ms=8000
unknown_after_budget=true manual_lookup_link=visible
失败边界：支付结果未知时无限轮询会放大渠道压力；达到上限要保留可查询状态。`,
  },
  '取消操作说明后果': {
    title: '取消预约确认与退款状态',
    language: 'tsx',
    code: `function CancelDialog({ reservation, onConfirm }: Props) {
  return (
    <dialog open aria-labelledby="cancel-title">
      <h2 id="cancel-title">取消这次预约？</h2>
      <p>已支付的 128 元将进入退款流程，名额会立即释放。</p>
      <p>预约号：{reservation.id}；当前状态：{reservation.state}</p>
      <button onClick={onConfirm}>确认取消并申请退款</button>
      <button onClick={close}>保留预约</button>
    </dialog>
  );
}
// 提交后轮询 reservation.state 与 refund.state，不能只关闭弹窗`,
    output: `$ pnpm vitest run src/features/booking/CancelDialog.test.tsx
amount_and_state_visible=true destructive_label_explicit=true
cancel_result=refund_pending refund_status_polled=true
失败边界：把取消写成“删除订单”会隐藏退款与审计；未支付和已支付取消文案要分开。`,
  },
  '运营容量调整可审计': {
    title: '容量调整接口与审计记录',
    language: 'json',
    code: `{
  "requestId": "cap-2026-11-24-07",
  "actor": "operator-12",
  "venueId": "venue-2",
  "slotId": "slot-7",
  "oldCapacity": 80,
  "newCapacity": 90,
  "reason": "临时增加观众席",
  "reserved": 76,
  "confirmed": 3,
  "effectiveAt": "2026-11-24T10:45:00Z",
  "result": "applied",
  "auditId": "audit-941"
}`,
    output: `$ curl -sS -X PATCH localhost:8080/ops/slots/slot-7/capacity \\
  -H 'Authorization: Bearer operator-local' -d @capacity-change.json | jq
old_capacity=80 new_capacity=90 available_increase=10
audit=written operator_scope=venue-2
失败边界：新容量小于已占用数量必须拒绝；跨场馆操作和缺少原因应返回 403/422。`,
  },
  '键盘与移动端完成主流程': {
    title: '移动端预约与支付主流程',
    language: 'typescript',
    code: `test('books and cancels on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking/venues/venue-2');
  await page.getByRole('button', { name: /19:00.*余 3/ }).click();
  await page.getByLabel('人数').fill('1');
  await page.getByRole('button', { name: '确认预约' }).click();
  await expect(page.getByText('等待支付')).toBeVisible();
  await page.getByRole('button', { name: '模拟支付成功' }).click();
  await expect(page.getByText('已确认')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});`,
    output: `$ pnpm playwright test tests/mobile-booking.spec.ts
viewport=390x844 slot_select=pass payment=pass
scrollWidth=390 focus_visible=pass console_errors=0
失败边界：支付按钮被吸底栏遮挡、库存变化后旧按钮仍可点，都会阻断移动端发布。`,
  },
  '领域测试覆盖状态不变量': {
    title: '预约非法状态转换表测试',
    language: 'go',
    code: `func TestForbiddenTransitions(t *testing.T) {
  tests := []struct{ from, action string }{
    {"cancelled", "payment.success"},
    {"expired", "reservation.cancel"},
    {"confirmed", "reservation.expire"},
    {"refund_pending", "payment.success"},
  }
  for _, tc := range tests {
    _, err := machine.Apply(tc.from, tc.action)
    require.ErrorIs(t, err, ErrInvalidTransition, "%s -> %s", tc.from, tc.action)
  }
}
// 每个状态还要测试允许路径和库存副作用`,
    output: `$ go test ./internal/reservation -run TestForbiddenTransitions -v
--- PASS: TestForbiddenTransitions
forbidden_cases=4 invalid_transition_errors=4
inventory_side_effects=0
失败边界：只测 happy path 无法发现过期回调再次确认或取消重复释放库存。`,
  },
  '真实数据库并发测试': {
    title: 'Testcontainers 并发库存测试',
    language: 'go',
    code: `func TestReserveWithPostgres(t *testing.T) {
  ctx := context.Background()
  pg := testcontainers.NewPostgres(ctx, "postgres:16.3-alpine")
  defer pg.Terminate(ctx)
  db := pg.Connect(t)
  repo := NewPostgresRepo(db)
  seedInventory(t, db, "slot-1", 1)
  start := make(chan struct{})
  results := make(chan error, 20)
  for i := 0; i < 20; i++ {
    go func(i int) { <-start; results <- repo.Reserve(ctx, ReserveCommand{SlotID:"slot-1"}) }(i)
  }
  close(start)
  assertOneSuccessNineteenConflicts(t, results)
}`,
    output: `$ go test ./internal/storage -tags=integration -run TestReserveWithPostgres -v
--- PASS: TestReserveWithPostgres
success=1 conflict=19 isolated_container=true cleanup=ok
失败边界：mock 数据库无法复现条件更新锁语义；集成测试必须使用真实 PostgreSQL 主版本。`,
  },
  '安全覆盖对象和运营边界': {
    title: '跨用户、跨场馆与运营越权测试',
    language: 'go',
    code: `func TestReservationAuthorization(t *testing.T) {
  cases := []AuthCase{
    {actor:"u-42", method:"GET", path:"/reservations/rsv-u43", want:404},
    {actor:"u-42", method:"POST", path:"/reservations/rsv-u43/cancel", want:404},
    {actor:"operator-v1", method:"PATCH", path:"/ops/slots/slot-v2/capacity", want:403},
    {actor:"support", method:"POST", path:"/reservations/rsv-31/cancel", want:403},
  }
  for _, tc := range cases { assertStatus(t, tc.actor, tc.method, tc.path, tc.want) }
  audit.RequireDeniedEvents(t, len(cases))
}`,
    output: `$ go test ./internal/http -run TestReservationAuthorization -v
--- PASS: TestReservationAuthorization
cases=4 denied_as_expected=4 denied_audit_events=4
response_body_leaks_object_existence=false
失败边界：返回 403 会暴露预约存在；跨用户对象通常应统一返回 404 并记录拒绝。`,
  },
  '压测模拟混合业务': {
    title: '查询、抢位、支付、取消混合压测',
    language: 'javascript',
    code: `import http from 'k6/http';
import { sleep } from 'k6';
export default function () {
  const slots = http.get('http://127.0.0.1:8080/venues/v-2/slots').json();
  const slot = slots[(__VU + __ITER) % slots.length];
  const key = 'load-' + __VU + '-' + __ITER;
  const created = http.post('http://127.0.0.1:8080/reservations',
    JSON.stringify({ slotId: slot.id, seats: 1 }),
    { headers: { Authorization: 'Bearer load-user', 'Idempotency-Key': key,
      'Content-Type': 'application/json' } });
  if (created.status === 201) {
    const id = created.json('id');
    http.post('http://127.0.0.1:8080/reservations/' + id + '/pay/simulate');
    if (__ITER % 3 === 0) http.post('http://127.0.0.1:8080/reservations/' + id + '/cancel');
  }
  sleep(0.2);
}`,
    output: `$ k6 run tests/load/mixed-booking.js
iterations=48210 http_req_duration p95=312ms p99=790ms
reservations_created=1832 conflicts=4173 cancels=611
失败边界：只压 GET 会产生漂亮结果但漏掉事务、连接池和取消补偿的真实瓶颈。`,
  },
  '故障注入验证降级': {
    title: 'Redis 与支付依赖故障注入',
    language: 'bash',
    code: `docker compose -f docker-compose.test.yml up -d toxiproxy
toxiproxy-cli toxic add redis -t latency -a latency=1500 -n redis-delay
curl -fsS localhost:8080/venues/v-2/slots | jq -e 'length > 0'
toxiproxy-cli toxic remove payment -n payment-reset
curl -sS -X POST localhost:8080/reservations/rsv-31/pay/simulate | jq '.state'
toxiproxy-cli toxic remove redis -n redis-delay
go test ./integration -run TestInventoryReconciled -count=1`,
    output: `$ ./scripts/fault-injection.sh
redis_delay_ms=1500 slots_endpoint=degraded_but_readable
payment_reset=payment_unknown reservation_preserved=true
inventory_reconciled=true
失败边界：恢复后必须清理缓存并核对库存；仅看到健康检查恢复不算故障演练通过。`,
  },
  '构建最小 Go 运行镜像': {
    title: '静态 Go 服务多阶段镜像',
    language: 'dockerfile',
    code: `FROM golang:1.23.4-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/nimbus ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/nimbus /nimbus
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/nimbus"]`,
    output: `$ docker build -t nimbus-api:local .
$ docker run --rm nimbus-api:local --version
nimbus-api 2026.11.24 commit=4f3a
$ docker image inspect nimbus-api:local --format '{{.Size}}'
18432111
失败边界：运行镜像含编译器和源码会扩大攻击面；CGO 与 CA 证书需求要在构建阶段明确。`,
  },
  '容量与连接池一起扩缩': {
    title: 'HPA、连接池与数据库上限',
    language: 'yaml',
    code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: nimbus-api}
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: nimbus-api}
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: {name: cpu, target: {type: Utilization, averageUtilization: 65}}
    - type: Pods
      pods: {metric: {name: http_requests_per_second}, target: {type: AverageValue, averageValue: "120"}}
---
# DB_MAX_CONNS=10；20 Pod × 10 = 200，低于 PgBouncer 实例上限 240`,
    output: `$ kubectl apply -f deploy/hpa.yaml
horizontalpodautoscaler.autoscaling/nimbus-api configured
$ kubectl get hpa nimbus-api
NAME         TARGETS                    MINPODS MAXPODS REPLICAS
nimbus-api   cpu:58%/65%, 120/120        3       20      8
失败边界：只扩 Pod 不核算连接池会让总连接数超过数据库上限并引发全站饱和。`,
  },
  '探针与优雅停机保护发布': {
    title: '探针与 SIGTERM 优雅停机',
    language: 'go',
    code: `server := &http.Server{Addr: ":8080", Handler: router, ReadHeaderTimeout: 3 * time.Second}
ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
defer stop()
go func() {
  if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) { panic(err) }
}()
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
defer cancel()
worker.StopAccepting()
_ = server.Shutdown(shutdownCtx)
worker.Wait(shutdownCtx)
// /health/live unready before Shutdown`,
    output: `$ kubectl delete pod nimbus-api-7f8d --wait=false
request_in_flight=completed connection_refused=0
expiry_worker_stopped=true shutdown_ms=4210
失败边界：SIGTERM 立即退出会中断进行中的支付确认；超出 terminationGracePeriod 则强制终止。`,
  },
  '业务指标进入仪表盘': {
    title: '预约、冲突和队列指标',
    language: 'prometheus',
    code: `nimbus_reservation_total{state="confirmed"}
nimbus_reservation_total{state="cancelled"}
nimbus_inventory_conflict_total{slot_tier="hot"}
nimbus_payment_unknown_total{provider="sandbox-pay"}
nimbus_outbox_pending_events{event_type="reservation.confirmed"}
nimbus_http_request_duration_seconds_bucket{route="/reservations",le="0.35"}
# 告警：5m 冲突率 > 35% 或 outbox_pending > 5000
sum(rate(nimbus_inventory_conflict_total[5m]))
/ sum(rate(nimbus_reservation_total[5m]))`,
    output: `$ curl -s localhost:8080/metrics | Select-String 'nimbus_(reservation|inventory|outbox)'
nimbus_reservation_total{state="confirmed"} 1842
nimbus_inventory_conflict_total{slot_tier="hot"} 917
nimbus_outbox_pending_events{event_type="reservation.confirmed"} 3
失败边界：只看 Pod CPU 无法判断超卖、退款积压或热点锁等待，业务指标必须进入仪表盘。`,
  },
  '发布和回滚都可验证': {
    title: '金丝雀发布与库存对账回滚',
    language: 'bash',
    code: `kubectl set image deploy/nimbus-api api=registry/nimbus-api:2026.11.24
kubectl rollout status deploy/nimbus-api --timeout=180s
kubectl annotate ingress nimbus-canary nginx.ingress.kubernetes.io/canary-weight=5 --overwrite
./scripts/smoke.sh
kubectl annotate ingress nimbus-canary nginx.ingress.kubernetes.io/canary-weight=50 --overwrite
psql "$NIMBUS_DB" -f ops/inventory-reconcile.sql
kubectl rollout undo deploy/nimbus-api
psql "$NIMBUS_DB" -f ops/inventory-reconcile.sql`,
    output: `$ ./scripts/canary-release.sh
rollout=success canary=5% smoke=PASS canary=50%
reconcile_mismatch=0 p95=298ms
rollback=success mismatch_after=0
失败边界：发布成功不等于业务成功；必须用预约、支付、库存和消息对账共同判定。`,
  },
  '热点时段演练验证限流': {
    title: '热门时段令牌桶与重试时间',
    language: 'go',
    code: `func RateLimit(next http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    decision := limiter.Allow(r.Context(), "reservation:"+tenant(r))
    if !decision.Allowed {
      w.Header().Set("Retry-After", strconv.Itoa(decision.RetryAfterSeconds))
      writeProblem(w, http.StatusTooManyRequests, "BOOKING_RATE_LIMITED", requestID(r))
      return
    }
    next.ServeHTTP(w, r)
  })
}
// 限额按租户与接口分别配置，突发容量写入配置中心`,
    output: `$ hey -z 30s -c 400 -method POST -body '{"slotId":"slot-hot-7"}' localhost:8080/reservations
status_201=1802 status_429=7314 status_5xx=0
p99=214ms retry_after=2s db_active_peak=84
失败边界：限流不能把所有用户都封死；需要按租户、用户和热点资源区分并保留可重试时间。`,
  },
  'Redis 故障回源演练': {
    title: 'Redis 停机后的库存回源与缓存清理',
    language: 'bash',
    code: `docker compose stop redis
curl -sS localhost:8080/venues/v-2/slots/slot-7 | jq '.available,.cacheMode'
curl -sS -X POST localhost:8080/reservations -H 'Idempotency-Key: redis-drill-1' \\
  -H 'Content-Type: application/json' -d '{"slotId":"slot-7","seats":1}' | jq '.state'
docker compose start redis
redis-cli FLUSHDB
psql "$NIMBUS_DB" -f ops/inventory-reconcile.sql
curl -sS localhost:8080/venues/v-2/slots/slot-7 | jq '.available,.cacheMode'`,
    output: `$ ./scripts/redis-failover.sh
redis=stopped available=3 cacheMode=database
reservation=payment_pending transaction_committed=true
redis=started cache_rebuilt=true reconcile_mismatch=0
失败边界：缓存故障时仍要正确处理库存事务；恢复后旧缓存可能过期，必须清键或按版本失效。`,
  },
  'Kafka 积压与通知恢复': {
    title: '暂停消费者后的幂等恢复',
    language: 'bash',
    code: `kubectl scale deploy/nimbus-notifier --replicas=0
for i in $(seq 1 200); do
  curl -fsS -X POST localhost:8080/reservations/rsv-$i/pay/simulate >/dev/null
done
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\
  --describe --group nimbus-notifier
kubectl scale deploy/nimbus-notifier --replicas=2
sleep 20
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\
  --describe --group nimbus-notifier`,
    output: `$ ./scripts/kafka-backlog-drill.sh
lag=200 notifier_replicas=0 reservations_confirmed=200
after_scale lag=0 duplicate_notifications=0
dead_letter=0 recovery_seconds=18
失败边界：消费者重启瞬间并发过高会打满数据库；恢复要限速并验证事件去重。`,
  },
  '数据库连接耗尽演练': {
    title: '连接池饱和与慢查询定位',
    language: 'sql',
    code: `SELECT pid, usename, state, wait_event_type, wait_event,
       now() - query_start AS query_age, left(query, 80) AS query
FROM pg_stat_activity
WHERE datname = 'nimbus'
ORDER BY query_start
LIMIT 30;
SELECT count(*) AS total,
       count(*) FILTER (WHERE state = 'active') AS active,
       count(*) FILTER (WHERE wait_event_type = 'Client') AS idle_in_transaction
FROM pg_stat_activity WHERE datname = 'nimbus';
-- 修复：慢 SQL 加索引；事务内禁止外部网络调用；池上限与实例数统一预算`,
    output: `$ psql "$NIMBUS_DB" -f ops/connection-pressure.sql
total=220 active=200 idle_in_transaction=14
top_wait=Lock relation=inventory query_age=38.2s
失败边界：看见连接耗尽就直接扩大 max_connections 会推迟根因并增加内存和锁竞争。`,
  },
  '答辩用容量与一致性证据': {
    title: 'Nimbus 容量与一致性 ADR',
    language: 'markdown',
    code: `# ADR-019：条件更新 + 用户级幂等
## 决策
库存用单条条件 UPDATE 与预约插入同事务；创建预约用 (user_id, idempotency_key) 唯一约束。
## 备选
Redis 预扣库存：拒绝，Redis 故障时需要复杂补偿。
应用层先查再改：拒绝，无法阻止并发覆盖。
## 证据
100 并发最后名额：success=1 conflict=99；混合压测 P95=312ms；Redis 停机对账 mismatch=0。
## 容量边界
20 Pod × 10 连接，数据库上限 240；热点行超过 400 QPS 时进入排队或分片评估。`,
    output: `$ nimbusctl adr verify docs/adr/019-inventory-consistency.md
decision=present alternatives=2 evidence=3 capacity_budget=true
commands=concurrency,load,redis-outage
失败边界：没有并发请求数、最终库存和依赖故障数据支撑的容量结论不能通过答辩。`,
  },
};

export const PROGRAMMING_PROJECT_TRAINING_BATCH_05_COURSES =
  NIMBUS_COURSES_BASE.map((course) => ({
    ...course,
    steps: course.steps.map((step) => {
      const suffix = NIMBUS_STEP_SUFFIXES[step[0]];
      const example = NIMBUS_STEP_EXAMPLES[step[0]];
      if (!example) throw new Error(`Nimbus example missing for ${course.name}: ${step[0]}`);
      return [step[0], suffix ? `${step[1]} ${suffix}` : step[1], step[2], example] as const;
    }),
  }));
