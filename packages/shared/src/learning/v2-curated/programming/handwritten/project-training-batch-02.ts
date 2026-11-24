// P15 综合训练第二批手写样板：Commerce 模块化电商 10 个阶段。
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

const COMMERCE_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · Commerce 模块化电商 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解商品、库存、订单和支付的基本业务，能画出一次购买流程。',
    goal: '能区分消费者、运营、客服和财务的任务与证据，画出从浏览商品到支付回调的完整流程，并标出库存、金额和通知之间不能断裂的业务约束。',
    guidedPractice: '分别模拟消费者购买最后一件库存、运营调整价格、客服查询异常订单和财务核对退款四类任务，记录输入、反馈、失败代价和人工兜底动作。',
    independentPractice: '交付一张购买任务图、一张订单状态表和一张风险清单，覆盖重复点击、库存不足、支付超时、回调重复和退款通知失败。',
    commonErrors: [
      '只画“加入购物车到支付成功”的理想路径，没有说明超时后订单和库存由谁处理。',
      '把商品展示、库存扣减和订单创建都当成同一个页面动作，忽略后台与异步回调。',
    ],
    sourceRefs: [
      'Gradle Multi-project Builds. https://docs.gradle.org/current/userguide/multi_project_builds.html',
      'Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html',
      'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
    ],
    steps: [
      [
        '按角色拆购买任务',
        '消费者要判断商品是否合适、有没有库存并看到支付结果；运营要改价格和可售库存；客服要定位订单为什么未支付或库存未释放；财务要知道支付回调和退款是否一致。每个角色都写触发条件、可观察结果和失败后的处理入口，避免把业务理解做成页面清单。',
        '角色必须绑定可验证任务',
      ],
      [
        '把一次购买拆成状态链',
        '主链路至少包含浏览商品、加入购物车、提交订单、预占库存、发起支付、接收回调、确认订单和发送通知。每一步记录谁创建了什么状态、哪些操作可重复、哪一步允许失败后恢复，订单号和幂等键从提交开始贯穿。',
        '订单号是跨流程的业务线索',
      ],
      [
        '找出不能同时成立的约束',
        '库存不能被两个订单同时预占，订单金额不能由客户端随意修改，支付成功回调可能重复到达，通知失败不能让已支付订单回滚。把“必须成立”的业务不变量先写成表格，再决定用数据库约束、事务、锁或事件实现。',
        '先写不变量，再选技术',
      ],
      [
        '记录真实失败代价',
        '重复点击可能多扣库存，支付超时可能产生未知结果，Kafka 重复消息可能重复发货或重复通知。分别评估用户损失、客服成本、财务风险和修复难度，并用业务指标定义可接受的恢复时间。',
        '失败路径也要有业务负责人',
      ],
      [
        '形成首版任务边界',
        '首版只做商品浏览、购物车、下单、库存预占、模拟支付和订单查询；不做复杂促销、真实支付、拆微服务和自动退款。每个非目标写明原因和重新评估条件，防止项目一开始就扩展到无法验收。',
        '首版边界必须能被执行',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 Commerce 购买流程、订单状态和风险清单。',
    goal: '能把 Commerce 首版收敛为可交付范围，写出重复下单、库存并发、支付回调、消息重放和对账的可执行验收，以及延迟、可用性和恢复目标。',
    guidedPractice: '把商品、购物车、订单、库存、支付和通知拆成必须完成、延后和明确不做三列，为每个关键失败写 Given/When/Then。',
    independentPractice: '交付一张验收矩阵，每条包含触发条件、观察指标、通过线、失败修复动作和证据保存位置。',
    commonErrors: [
      '只写“库存不能超卖”，没有说明并发用户数、最后一件库存和可接受失败响应。',
      '把消息至少一次投递写成恰好一次，忽略消费者重复处理和幂等验证。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'PostgreSQL Documentation. https://www.postgresql.org/docs/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '把范围拆成可交付模块',
        '首版必须包含商品查询、购物车、订单状态机、库存预占、模拟支付回调和订单查询；运营库存调整可以作为最小后台页面。复杂促销、真实支付、自动退款和微服务拆分进入后续列，每项写明延期原因。',
        '范围表要能指导任务拆分',
      ],
      [
        '为关键行为写验收场景',
        '例如同一幂等键连续提交两次只能生成一单；两名用户抢最后一件库存只能有一单预占成功；支付回调重复到达只能产生一次支付成功状态；Outbox 重放不能重复扣库存或重复发通知。验收条件必须能从数据库、日志或指标观察。',
        '验收必须落到可观察结果',
      ],
      [
        '质量属性写成数字目标',
        '定义商品查询 P95、下单 P95、支付回调处理延迟、错误率和恢复时间，并说明测试数据规模。目标不能脱离环境和并发量，真实指标要保存基线、版本和压测参数。',
        '没有基线就没有性能验收',
      ],
      [
        '把失败恢复纳入范围',
        '支付服务不可用时订单应进入待支付或关闭状态，库存预占要有超时释放，Kafka 中断后 Outbox 仍能重放，通知失败可重试但不能改变已完成订单。每个失败场景都要有停止条件、补偿动作和人工入口。',
        '失败恢复属于首版功能',
      ],
      [
        '冻结可验证的首版边界',
        '阶段结束时审查范围表、验收矩阵和指标基线，任何新增功能必须说明服务哪条用户任务、影响哪个指标和增加哪些失败路径。没有验收关联的需求进入待办而不是当前迭代。',
        '范围变更必须回到验收表',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有冻结的 Commerce MVP、订单状态和并发验收。',
    goal: '能定义商品、购物车、订单、库存和支付接口，统一幂等键、订单状态、错误码、金额单位和回调验证，并让前后端在只有契约时独立开发。',
    guidedPractice: '写出创建订单、支付回调、库存查询和取消订单的请求与响应，故意测试重复请求、金额不一致、库存不足和非法状态转换。',
    independentPractice: '交付 OpenAPI 或等价契约、错误码表、前端请求矩阵和一组契约样例，覆盖成功、冲突、校验失败、未知支付结果和限流。',
    commonErrors: [
      '创建订单接口没有幂等键，客户端重试后生成多单。',
      '支付、订单和展示接口各自定义不同状态字符串，前端只能靠猜测展示。',
    ],
    sourceRefs: [
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'RFC 9110 HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110',
      'Stripe API Idempotency. https://docs.stripe.com/api/idempotent_requests',
    ],
    steps: [
      [
        '资源与命令分开建模',
        '商品、购物车、订单和库存查询使用资源 URL；创建订单、支付回调和取消订单属于命令或受控状态动作。每个接口明确方法、路径、权限、幂等性和返回状态，避免把所有操作都包装成 POST /doSomething。',
        '资源表达状态，命令表达转换',
      ],
      [
        '幂等键从提交贯穿到持久化',
        '客户端创建订单时发送 Idempotency-Key，服务端用用户、键和请求摘要建立唯一约束，并保存首次处理结果。相同键重试返回原订单，不同正文复用同一个键返回 409 或明确错误。',
        '幂等键要在数据库落地',
      ],
      [
        '订单状态与错误码稳定',
        '订单至少包含待支付、已支付、已取消和已关闭等状态，支付回调只能执行合法转换。400 表示请求格式问题，409 表示库存或状态冲突，422 表示业务校验失败，503 表示依赖暂不可用；错误正文包含 code、message、requestId。',
        '状态机和错误码共同约束客户端',
      ],
      [
        '金额、库存和时间字段无歧义',
        '金额使用最小货币单位整数并带 currency，禁止浮点；库存数量使用整数并声明可售与预占含义；时间统一使用 ISO 8601 UTC。前端不能自行计算最终应付金额，只能展示服务端返回的权威快照。',
        '单位和时区必须写进契约',
      ],
      [
        '契约测试覆盖失败路径',
        '用 OpenAPI 校验请求响应，用契约样例覆盖重复下单、库存不足、重复回调、非法状态转换和未知支付结果。前后端共享同一组样例，不能只验证成功 JSON 字段齐全。',
        '失败响应也是公共契约',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有稳定的 Commerce API 契约和订单状态定义。',
    goal: '能设计商品、SKU、库存、订单、支付、幂等记录和 Outbox 的数据模型，用数据库约束与事务边界保护超卖、重复订单和消息一致性问题。',
    guidedPractice: '为最后一件库存设计并发预占 SQL，再为重复支付回调和重复 Idempotency-Key 建立唯一约束，记录锁等待和执行计划。',
    independentPractice: '交付 ER 图、约束清单、索引清单和迁移计划，覆盖空库初始化、历史数据回填、旧新版本并存和失败回滚。',
    commonErrors: [
      '库存只在应用层先查再减，两个并发请求都看到剩余一件。',
      '订单和支付回调各自更新金额，数据库没有唯一支付流水和状态转换约束。',
    ],
    sourceRefs: [
      'PostgreSQL Concurrency Control. https://www.postgresql.org/docs/current/transaction-iso.html',
      'Gradle Build Cache. https://docs.gradle.org/current/userguide/build_cache.html',
      'Testcontainers for Java. https://java.testcontainers.org/',
    ],
    steps: [
      [
        '围绕聚合划分表与事务',
        '商品与 SKU 保存目录信息，库存表保存可用量和预占量，订单聚合保存订单头、明细和状态，支付表保存渠道流水与回调结果。跨聚合写操作通过明确命令和事件协作，不能任意访问其他模块内部表。',
        '表边界服务事务边界',
      ],
      [
        '用条件更新保护库存',
        '预占 SQL 使用 version 乐观锁或 available >= quantity 条件更新，并检查受影响行数；库存扣减成功后再创建订单预占记录，失败返回 409。最后一件库存的并发测试必须证明只有一行事务成功。',
        '库存更新必须原子判断',
      ],
      [
        '唯一约束消灭重复副作用',
        '订单表对 user_id 与 idempotency_key 建唯一约束，支付表对 provider_trade_no 建唯一约束，Outbox 对事件 key 建唯一约束。数据库约束负责最后防线，应用层错误码负责解释冲突。',
        '幂等最终落在唯一约束',
      ],
      [
        '索引来自查询与锁模式',
        '订单列表按用户和创建时间查询，后台按状态与更新时间扫描，库存按 SKU 查询。索引要结合选择性、排序和锁范围，使用 EXPLAIN 与压测验证，避免慢查询长期持有行锁。',
        '先写查询，再建索引',
      ],
      [
        '迁移分阶段可回滚',
        '先增加兼容列和双写，再回填历史数据，随后切换读取并验证，最后删除旧列。大表回填要分批、可暂停、可重试，并在旧新应用并存时证明约束和默认值都兼容。',
        '迁移必须与发布顺序一致',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已有 Commerce 数据模型、API 契约和迁移计划。',
    goal: '能从空目录建立 Java 21 Gradle 多模块工程，明确领域模块和基础设施适配器依赖方向，并用 Docker Compose 与 Testcontainers 复现 PostgreSQL、Redis 和 Kafka。',
    guidedPractice: '创建 catalog、inventory、order、payment、notification 和 app 模块，写出依赖图，再用 Compose 启动依赖并跑通一次健康检查。',
    independentPractice: '删除生成器输出后按 README 重建环境，运行测试、迁移和冒烟请求，并解释每个模块和配置文件的所有权。',
    commonErrors: [
      '所有模块互相依赖，最终只是把单体代码按目录拆开。',
      '本地测试用内存数据库，生产使用 PostgreSQL，导致事务和 SQL 行为不一致。',
    ],
    sourceRefs: [
      'Gradle Multi-project Builds. https://docs.gradle.org/current/userguide/multi_project_builds.html',
      'Docker Compose Documentation. https://docs.docker.com/compose/',
      'Testcontainers for Java. https://java.testcontainers.org/',
    ],
    steps: [
      [
        '先固定模块与依赖方向',
        'domain 模块只包含实体、值对象、端口和业务服务，infrastructure 实现数据库、消息和支付适配器，app 负责 Spring Boot 装配。模块依赖必须单向，其他模块不得直接读取内部表或修改内部实体。',
        '依赖图就是架构验收',
      ],
      [
        '用 Gradle settings 管理模块',
        'settings.gradle.kts 声明 include，根构建统一 Java toolchain 和测试约定，模块只声明自己真正需要的依赖。版本目录或平台约束锁定第三方版本，避免各模块漂移。',
        '构建图要表达真实边界',
      ],
      [
        '本地依赖固定版本与健康检查',
        'Docker Compose 固定 PostgreSQL、Redis 和 Kafka 镜像 tag，配置持久卷、端口、健康检查和初始化脚本。README 写清启动顺序、迁移、关闭服务和清理数据卷命令。',
        '本地环境也要可复现',
      ],
      [
        '测试使用真实依赖形态',
        '单元测试覆盖领域不变量，Testcontainers 覆盖 PostgreSQL、Kafka 和 Redis 集成，应用测试通过真实 HTTP 验证装配。内存 fake 只用于不依赖数据库语义的逻辑。',
        '测试替身不等于真实依赖',
      ],
      [
        '删除脚手架后重建一次',
        '按 README 从空目录创建工程、启动依赖、执行迁移、运行测试和发送一次订单请求。若离开 IDE 或生成器就无法解释构建，说明工程所有权还没有建立。',
        '能重建才算掌握骨架',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Commerce 多模块工程、数据库迁移和本地依赖已经可运行。',
    goal: '能实现幂等下单、库存预占、订单状态机、模拟支付回调和 Outbox 发布，并验证重复、超时、回滚和补偿路径。',
    guidedPractice: '在测试中并发提交两个相同幂等键和两个不同用户购买最后一件库存，再重复发送支付回调，观察订单、库存和 Outbox 的变化。',
    independentPractice: '为支付未知结果、库存释放失败和 Kafka 中断各写恢复流程，并证明重放不会产生重复业务副作用。',
    commonErrors: [
      '先创建订单再无条件扣库存，库存失败后留下无法恢复的待支付订单。',
      'Kafka 发送失败后回滚已提交事务，导致数据库和消息状态都不可解释。',
    ],
    sourceRefs: [
      'Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html',
      'Apache Kafka Design. https://kafka.apache.org/documentation/#design',
      'PostgreSQL Locking. https://www.postgresql.org/docs/current/explicit-locking.html',
    ],
    steps: [
      [
        '幂等下单先查唯一记录',
        '创建订单前尝试插入幂等键和请求摘要，同一键相同请求返回已存在订单，不同请求返回冲突。幂等记录、订单和库存预占在一个短事务中完成，事务外不发同步通知。',
        '重试必须得到同一业务结果',
      ],
      [
        '库存预占在事务中原子判断',
        '通过条件更新或悲观锁扣减可用库存，受影响行数为零时返回库存不足；预占记录带订单号、数量和过期时间。事务失败时所有写入回滚，不能只释放一半资源。',
        '库存和订单不能各自成功一半',
      ],
      [
        '订单状态机拒绝非法转换',
        '待支付只能转为已支付或关闭，已支付不能再回到待支付，已取消不能接收支付成功。每次转换校验当前状态和支付流水，更新时使用版本字段避免并发覆盖。',
        '状态转换必须可并发验证',
      ],
      [
        '支付回调以渠道流水为幂等键',
        '回调先校验签名、金额和订单号，再用 provider_trade_no 唯一约束记录结果。重复回调返回成功但不重复发布支付完成事件；未知结果进入待核对状态，由主动查询补偿。',
        '未知支付结果不能凭超时判断失败',
      ],
      [
        'Outbox 与事务同提交',
        '业务事务同时写订单和 Outbox 事件，独立发布器读取未发送记录并投递 Kafka，成功后标记发送时间。失败可重试，消费者仍按事件 key 幂等，保证至少一次投递下业务不重复。',
        '可靠消息不是双写事务',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Commerce 下单、库存、支付和订单查询接口已可联调。',
    goal: '能实现商品与购物车、结算、支付结果和订单详情页面，覆盖加载、空、冲突、未知支付和网络失败状态，并保证键盘、触屏和移动端可用。',
    guidedPractice: '完成商品加入购物车到订单详情的主流程，再制造库存变化、支付超时和重复提交，检查页面状态和用户恢复路径。',
    independentPractice: '用 320px 与键盘单独走完全流程，补齐焦点管理、错误提示、重复提交保护和触控目标。',
    commonErrors: [
      '前端先减库存展示成功，服务端失败后页面仍显示已下单。',
      '错误只弹一次 Toast，字段错误没有与输入关联，用户不知道如何修复。',
    ],
    sourceRefs: [
      'Vue.js Documentation. https://vuejs.org/guide/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'MDN HTTP Status. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status',
    ],
    steps: [
      [
        '页面状态由服务端结果驱动',
        '商品、库存和金额展示服务端快照，加入购物车和创建订单以接口响应为准。提交期间禁用重复操作，成功后切换到订单详情，失败按错误码显示库存冲突、幂等冲突和网络未知状态。',
        '客户端不能提前宣布业务成功',
      ],
      [
        '结算页保留可恢复草稿',
        '用户地址、联系方式和支付选择进入受控状态，刷新或返回后能从本地草稿恢复。创建订单失败时保留输入并聚焦错误摘要，不能要求用户重新输入全部信息。',
        '错误恢复优先于重新填写',
      ],
      [
        '未知支付结果单独呈现',
        '支付超时不能显示“支付失败”，应显示“结果确认中”并提供刷新、查看订单和联系客服入口。页面轮询要有次数和退避，订单最终状态仍由服务端查询决定。',
        '未知结果是独立状态',
      ],
      [
        '键盘与移动端共同验收',
        '所有按钮和链接使用原生控件，错误通过 aria-describedby 关联字段，提交后焦点移到摘要。320px 宽度下商品、数量、价格和主按钮不能重叠，触控目标至少 44px。',
        '主任务必须能只用键盘完成',
      ],
      [
        '前端测试覆盖业务状态',
        '组件测试覆盖空购物车、库存冲突、重复提交、支付确认中和网络失败，E2E 覆盖真实结算主流程。断言用户可见结果，不依赖内部变量名。',
        '测试用户旅程而不是实现细节',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Commerce 前后端主流程可运行，订单、库存、支付和 Outbox 已有基础测试。',
    goal: '能建立领域、集成、契约和端到端测试矩阵，验证并发下单、重复支付、越权访问、Outbox 重放和关键接口性能。',
    guidedPractice: '为最后一件库存并发下单、重复支付回调和重复 Kafka 消费各写一个失败注入实验，保存数据库、日志和指标证据。',
    independentPractice: '完成一次安全与性能审查，修复对象授权、慢查询或热点锁问题，并用回归测试证明风险下降。',
    commonErrors: [
      '只在单线程下测试下单，看到库存结果正确就认为并发安全。',
      '测试只覆盖成功订单，没有验证客服查询越权或财务对账字段。',
    ],
    sourceRefs: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Testcontainers for Java. https://java.testcontainers.org/',
      'Playwright Documentation. https://playwright.dev/docs/intro',
    ],
    steps: [
      [
        '测试金字塔对准风险',
        '领域单元测试覆盖订单状态和金额不变量，集成测试覆盖 PostgreSQL 条件更新、唯一约束和 Outbox，契约测试锁定 API，E2E 覆盖购买主流程。高风险并发和消息问题需要真实数据库与消息系统。',
        '测试边界匹配故障边界',
      ],
      [
        '并发实验必须可控重复',
        '用 CountDownLatch 或并发 barrier 让多个请求同时争抢最后一件库存，记录成功数、冲突数和最终库存。测试结束清理数据和连接，避免偶发通过。',
        '并发测试要能重复复现',
      ],
      [
        '重复回调与 Outbox 重放是必测项',
        '同一支付流水发送多次只能有一次状态转换；Outbox 发布成功后模拟进程崩溃和重复投递，消费者仍按事件 key 幂等。检查订单、库存和通知的最终状态，而不只看返回码。',
        '至少一次投递要求幂等消费',
      ],
      [
        '安全回归覆盖对象与财务边界',
        '测试用户读取他人订单、客服越权退款、金额篡改、重复提交和日志泄露。对象级授权必须由服务端查询条件保证，错误响应不能返回堆栈和数据库细节。',
        '权限测试跟随每个资源入口',
      ],
      [
        '性能测试关注锁与尾延迟',
        '基线和峰值压测记录下单 P95/P99、库存冲突率、数据库锁等待、Kafka 积压和错误率。优化一次只改一个变量，保留前后数据和回滚条件。',
        '平均值不能代替尾延迟',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Commerce 测试矩阵稳定，应用和数据库迁移可重复运行。',
    goal: '能为多模块应用构建固定制品，接入迁移、测试、扫描、镜像和发布流水线，并配置订单、库存、支付回调、Outbox 与 Kafka 的可观测性。',
    guidedPractice: '让 CI 分别因测试失败、依赖扫描和镜像扫描阻断一次，再构建带提交号的镜像并发布到测试环境。',
    independentPractice: '完成一次灰度发布与回滚，保存制品 digest、迁移版本、冒烟结果、仪表盘和回滚证据。',
    commonErrors: [
      '在目标服务器重新构建多模块工程，发布制品与测试过的版本不一致。',
      '只监控 CPU，没有订单成功率、库存冲突、支付回调和 Outbox 积压指标。',
    ],
    sourceRefs: [
      'Docker Documentation. https://docs.docker.com/',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        'CI 生成唯一可追溯制品',
        '流水线切分依赖缓存、编译、单元与集成测试、安全扫描、镜像构建和 SBOM。镜像 tag 含提交号并记录 digest，生产部署只消费该固定制品。',
        '测试过的制品才能发布',
      ],
      [
        '迁移先于新版本安全启动',
        '数据库迁移与应用发布按兼容顺序执行，先增加结构再切读写，旧版本和新版本可同时运行。迁移失败停止发布，回滚镜像前确认数据库结构仍兼容。',
        '应用和迁移版本成对记录',
      ],
      [
        '核心业务指标必须可观察',
        '仪表盘包含下单成功率、库存冲突、待支付订单、支付回调延迟与错误、Outbox 未发送数、Kafka 消费积压和订单对账差异。日志带订单号与 requestId，Trace 串联 HTTP、数据库和消息。',
        '业务指标优先于主机指标',
      ],
      [
        '健康检查反映接流量能力',
        '启动探针等待迁移和依赖初始化，就绪探针检查数据库连接和必要配置，存活探针只判断进程能否继续工作。探针不能调用真实下单或 expensive 查询。',
        '流量与存活分开判断',
      ],
      [
        '发布过程包含冒烟与回滚',
        '发布后检查商品查询、创建测试订单、支付模拟回调和订单查询，观察错误率与 Outbox。失败时回滚镜像或关闭新流量，并执行同样的冒烟与订单对账。',
        '发布完成以业务验证为准',
      ],
    ],
  },
  {
    name: '综合训练 · Commerce 模块化电商 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'Commerce 已部署到测试环境，具备指标、日志、Trace、迁移和回滚流程。',
    goal: '能演练库存热点、支付回调积压、Kafka 重复、数据库连接耗尽和发布回滚，完成订单对账、根因分析与架构答辩。',
    guidedPractice: '依次制造热点 SKU 争抢、支付回调重复和 Kafka 消费暂停，观察告警、积压和订单状态，再执行恢复。',
    independentPractice: '写一份故障演练与项目答辩报告，包含时间线、影响、证据、修复、回滚、对账结果和后续 ADR。',
    commonErrors: [
      '只重启服务结束演练，不核对订单、库存和支付是否一致。',
      '复盘只写操作失误，没有修复缺少约束、告警和人工入口的系统原因。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Apache Kafka Operations. https://kafka.apache.org/documentation/#operations',
      'Kubernetes Troubleshooting. https://kubernetes.io/docs/tasks/debug/',
    ],
    steps: [
      [
        '热库存演练制造真实竞争',
        '用多个并发请求争抢同一 SKU，记录库存冲突率、数据库锁等待、下单 P99 和错误码。恢复后验证可用量、预占量、订单明细和超时释放总量一致。',
        '热点问题要用对账收尾',
      ],
      [
        '支付回调积压测试恢复顺序',
        '暂停消费者或制造回调突发，观察待处理数、处理延迟和重复率。恢复后确认每个支付流水只产生一次支付成功转换，未知结果通过主动查询和人工核对关闭。',
        '积压恢复不能重复记账',
      ],
      [
        'Kafka 重复与 Outbox 重放',
        '模拟消息重复、消费者回滚和 Outbox 未标记发送，验证事件 key、消费幂等和通知去重。最终检查订单、库存和通知服务状态一致。',
        '至少一次投递以幂等收口',
      ],
      [
        '执行可验证的发布回滚',
        '发布坏版本或错误配置后，按运行手册回滚镜像和配置，执行迁移兼容检查、冒烟、订单查询和财务对账。记录从发现到恢复的时间和每步证据。',
        '回滚也要验证业务状态',
      ],
      [
        '答辩围绕业务和技术取舍',
        '回答为什么采用模块化单体、库存条件更新、幂等键、Outbox 和对账；说明哪些风险仍存在、何时才拆服务、监控和人工兜底如何工作。结论用实验和指标支撑。',
        '架构决策必须能被追问',
      ],
    ],
  },
];

const COMMERCE_EXAMPLES: ProjectExampleGrid = [
  [
    example(
      '打印消费者、运营、客服与财务的购买任务卡',
      'javascript',
      `const tasks = [
  { actor: '消费者', trigger: '购买最后一件库存', result: '得到唯一订单或库存不足' },
  { actor: '运营', trigger: '调整价格与可售库存', result: '商品快照可追溯，旧订单金额不变' },
  { actor: '客服', trigger: '查询未支付订单', result: '看到库存预占、支付和超时状态' },
  { actor: '财务', trigger: '核对退款', result: '支付流水与退款金额能够对账' },
];
for (const task of tasks) {
  console.log([task.actor, task.trigger, task.result].join(' | '));
}`,
      `消费者 | 购买最后一件库存 | 得到唯一订单或库存不足
运营 | 调整价格与可售库存 | 商品快照可追溯，旧订单金额不变
失败边界：任一角色没有失败恢复入口，任务卡不得进入验收`,
    ),
    example(
      '把购买流程输出为可检查的订单状态链',
      'javascript',
      `const transitions = [
  ['DRAFT', 'PENDING_PAYMENT', 'submit'],
  ['PENDING_PAYMENT', 'PAID', 'payment.confirmed'],
  ['PENDING_PAYMENT', 'CLOSED', 'payment.timeout'],
  ['PAID', 'REFUND_PENDING', 'refund.requested'],
];
const allowed = new Map();
for (const [from, to, event] of transitions) {
  allowed.set(from + ':' + event, to);
}
for (const key of ['PENDING_PAYMENT:payment.confirmed', 'PAID:payment.confirmed']) {
  console.log(key + ' => ' + (allowed.get(key) ?? 'REJECT_ILLEGAL_TRANSITION'));
}`,
      `PENDING_PAYMENT:payment.confirmed => PAID
PAID:payment.confirmed => REJECT_ILLEGAL_TRANSITION
失败边界：重复支付回调不得把已支付订单再次迁移`,
    ),
    example(
      '用数据库条件阻止最后一件库存被重复预占',
      'sql',
      `CREATE TABLE inventory (
  sku_id text PRIMARY KEY,
  available integer NOT NULL CHECK (available >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0)
);

UPDATE inventory
SET available = available - 1, reserved = reserved + 1
WHERE sku_id = 'SKU-RED-M'
  AND available >= 1
RETURNING sku_id, available, reserved;`,
      `sku_id     | available | reserved
SKU-RED-M  | 0         | 1
失败边界：第二个并发事务返回 0 行并响应 409 INVENTORY_CONFLICT`,
    ),
    example(
      '把重复回调、超时与通知失败换算成业务风险',
      'javascript',
      `const failures = [
  { code: 'DUP_CLICK', users: 12, orders: 12, owner: 'frontend' },
  { code: 'PAY_TIMEOUT', users: 31, orders: 31, owner: 'payment' },
  { code: 'NOTIFY_DOWN', users: 0, orders: 84, owner: 'operations' },
];
for (const item of failures) {
  const severity = item.orders >= 20 ? 'P1' : 'P2';
  console.log(severity + ' ' + item.code + ' owner=' + item.owner +
    ' affectedOrders=' + item.orders);
}`,
      `P2 DUP_CLICK owner=frontend affectedOrders=12
P1 PAY_TIMEOUT owner=payment affectedOrders=31
P1 NOTIFY_DOWN owner=operations affectedOrders=84
失败边界：没有 owner 或无法恢复的风险项不得排入迭代`,
    ),
    example(
      '冻结 Commerce 首版范围并阻止隐含需求',
      'yaml',
      `release: commerce-mvp
must:
  - catalog
  - cart
  - order
  - inventory-reservation
  - mock-payment
later:
  - coupon-engine
  - microservices
excluded:
  - real-payment-provider
  - automatic-refund
gate:
  command: node scripts/check-scope.mjs
  required: true`,
      `scope=commerce-mvp must=5 later=2 excluded=2
PASS scope gate: every must item maps to acceptance evidence
失败边界：新增 real-payment-provider 时门禁失败并要求安全评审`,
    ),
  ],
  [
    example(
      '把必须完成、延后和明确不做写进可校验范围',
      'javascript',
      `const scope = {
  must: ['catalog', 'cart', 'order-state', 'reserve-stock', 'mock-payment'],
  later: ['coupon', 'recommendation'],
  excluded: ['real-payment', 'microservice-split', 'auto-refund'],
};
const invalid = scope.must.filter((item) => item.includes('real'));
console.log('must=' + scope.must.length + ' later=' + scope.later.length);
console.log('excluded=' + scope.excluded.join(','));
console.log(invalid.length === 0 ? 'PASS scoped' : 'FAIL ' + invalid.join(','));`,
      `must=5 later=2
excluded=real-payment,microservice-split,auto-refund
PASS scoped
失败边界：Must 项缺少数据库或日志验收证据时不得冻结范围`,
    ),
    example(
      '把库存争抢写成 Given/When/Then 验收',
      'gherkin',
      `Feature: 库存预占
  Scenario: 两名消费者争抢最后一件库存
    Given SKU-RED-M 的 available 为 1
    And 消费者 A 与 B 持有不同的幂等键
    When A 与 B 同时提交订单
    Then 只有一单进入 PENDING_PAYMENT
    And 另一单返回 409 INVENTORY_CONFLICT
    And 最终 available 为 0 且 reserved 为 1`,
      `1 scenario (1 passed)
A=201 PENDING_PAYMENT
B=409 INVENTORY_CONFLICT
DB available=0 reserved=1
失败边界：两单均成功或 available 为负数时整组验收失败`,
    ),
    example(
      '用压测输出记录下单与查询的质量基线',
      'shell',
      `k6 run scripts/checkout-smoke.js \\
  --vus 40 --duration 2m \\
  --summary-export artifacts/checkout-summary.json
jq '{p95: .metrics.http_req_duration["p(95)"], errors: .metrics.http_req_failed.value}' \\
  artifacts/checkout-summary.json`,
      `{"p95":187.4,"errors":0.0031}
PASS checkout p95<500ms errorRate<1%
失败边界：库存冲突率超过 20% 时先检查热点 SKU，不靠扩容掩盖锁竞争`,
    ),
    example(
      '把库存超时释放与支付恢复写成运行场景',
      'yaml',
      `scenario: payment-timeout-recovery
steps:
  - create_order: { sku: SKU-RED-M, key: checkout-42 }
  - stop_payment_provider: { seconds: 75 }
  - wait_inventory_release: { maxSeconds: 120 }
  - query_order: { expectStatus: CLOSED }
  - replay_callback: { expectHttp: 200, expectTransition: false }
evidence:
  - inventory-ledger
  - payment-event
  - order-audit`,
      `order=CLOSED inventoryReleased=1 callbackReplayNoop=true
PASS timeout recovery within 120s
失败边界：释放失败时告警并进入人工对账，不能直接删除预占记录`,
    ),
    example(
      '用范围门禁阻止没有验收关联的新需求',
      'javascript',
      `const request = { name: 'coupon-stack', task: null, metric: null, risk: null };
const canEnterSprint = Boolean(request.task && request.metric && request.risk);
console.log(JSON.stringify({ ...request, decision: canEnterSprint ? 'ACCEPT' : 'BACKLOG' }));
if (!canEnterSprint) process.exitCode = 1;`,
      `{"name":"coupon-stack","task":null,"metric":null,"risk":null,"decision":"BACKLOG"}
失败边界：命令退出码为 1，CI 拒绝把无任务与指标的需求加入当前迭代`,
    ),
  ],
  [
    example(
      '用 OpenAPI 固定订单资源与创建命令',
      'yaml',
      `paths:
  /orders/{orderId}:
    get:
      parameters:
        - { name: orderId, in: path, required: true, schema: { type: string } }
  /orders:
    post:
      parameters:
        - { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
      responses:
        '201': { description: created }
        '409': { description: idempotency conflict or inventory conflict }`,
      `openapi: 3.1.0 paths=2
POST /orders requires Idempotency-Key
GET /orders/{orderId} is side-effect free
失败边界：重新定义 GET 扣库存或 POST 不校验幂等键时契约检查失败`,
    ),
    example(
      '用同一幂等键提交订单并比较数据库结果',
      'shell',
      `curl -sS -X POST http://localhost:8080/orders \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: checkout-42' \\
  -d '{"skuId":"SKU-RED-M","quantity":1}' | jq -r '.orderId'
curl -sS -X POST http://localhost:8080/orders \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: checkout-42' \\
  -d '{"skuId":"SKU-RED-M","quantity":1}' | jq -r '.orderId'`,
      `ord_01J8V6M8R2
ord_01J8V6M8R2
SELECT count(*) FROM orders WHERE idempotency_key='checkout-42'; -- 1
失败边界：同一键返回两个订单时禁止发布，检查唯一约束和事务边界`,
    ),
    example(
      '把订单状态与 HTTP 错误码映射成稳定契约',
      'typescript',
      `type OrderError =
  | { status: 409; code: 'INVENTORY_CONFLICT' | 'ORDER_VERSION_CONFLICT' }
  | { status: 422; code: 'INVALID_ADDRESS' | 'INVALID_QUANTITY' }
  | { status: 503; code: 'PAYMENT_UNAVAILABLE' };

const errors: OrderError[] = [
  { status: 409, code: 'INVENTORY_CONFLICT' },
  { status: 422, code: 'INVALID_QUANTITY' },
  { status: 503, code: 'PAYMENT_UNAVAILABLE' },
];
console.log(errors.map((e) => e.status + ':' + e.code).join('\\n'));`,
      `409:INVENTORY_CONFLICT
422:INVALID_QUANTITY
503:PAYMENT_UNAVAILABLE
失败边界：前端不得解析中文 message 决定重试，必须按 code 分支`,
    ),
    example(
      '用 JSON Schema 固定金额、库存和 UTC 时间语义',
      'json',
      `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["amountMinor", "currency", "quantity", "createdAt"],
  "properties": {
    "amountMinor": { "type": "integer", "minimum": 0 },
    "currency": { "enum": ["CNY"] },
    "quantity": { "type": "integer", "minimum": 1 },
    "createdAt": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}`,
      `{"amountMinor":12900,"currency":"CNY","quantity":1,"createdAt":"2026-11-24T03:20:00Z"}
PASS schema validation
失败边界：amount=129.00 或时间没有时区时拒绝请求，避免金额与排序漂移`,
    ),
    example(
      '用契约样例验证库存不足和回调重复',
      'shell',
      `pnpm test:contract -- \\
  --case inventory-conflict \\
  --case duplicate-payment-callback \\
  --case idempotency-conflict \\
  --report artifacts/contract-report.json
node -e "const r=require('./artifacts/contract-report.json'); if(r.failed) process.exit(1)"`,
      `contract cases=3 passed=3 failed=0
inventory-conflict -> 409 INVENTORY_CONFLICT
duplicate-payment-callback -> no second transition
失败边界：只校验 201 成功样例时契约门禁失败，必须包含失败响应`,
    ),
  ],
  [
    example(
      '按聚合建立目录、库存、订单、支付与 Outbox 表',
      'sql',
      `CREATE TABLE orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING_PAYMENT','PAID','CLOSED')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  idempotency_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, idempotency_key)
);
CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  sent_at timestamptz
);`,
      `orders: unique(user_id,idempotency_key)
outbox: sent_at IS NULL means pending
失败边界：跨聚合同事务直接更新库存与订单之外的表时，需要重新审查边界`,
    ),
    example(
      '用条件更新和受影响行数完成原子库存预占',
      'sql',
      `BEGIN;
WITH claimed AS (
  UPDATE inventory
  SET available = available - 1, reserved = reserved + 1, version = version + 1
  WHERE sku_id = 'SKU-RED-M' AND available >= 1
  RETURNING sku_id
)
INSERT INTO stock_reservation(order_id, sku_id, quantity)
SELECT 'ord_01J8V6M8R2', sku_id, 1 FROM claimed
RETURNING order_id, sku_id, quantity;
COMMIT;`,
      `order_id        | sku_id     | quantity
ord_01J8V6M8R2  | SKU-RED-M  | 1
失败边界：claimed 为空时事务返回 0 行并回滚订单创建，不能写入负库存`,
    ),
    example(
      '用唯一约束封锁重复订单与重复支付流水',
      'sql',
      `ALTER TABLE payment
  ADD CONSTRAINT uq_payment_provider_trade
  UNIQUE (provider, provider_trade_no);

ALTER TABLE outbox
  ADD CONSTRAINT uq_outbox_event_key
  UNIQUE (event_key);

INSERT INTO payment(id, order_id, provider, provider_trade_no, status)
VALUES ('pay_1', 'ord_1', 'mockpay', 'trade_9001', 'SUCCEEDED')
ON CONFLICT (provider, provider_trade_no) DO NOTHING
RETURNING id;`,
      `INSERT 0 1
second callback: INSERT 0 0
PASS duplicate payment has no second row
失败边界：应用捕获唯一冲突后仍返回失败会误导渠道重试，应返回已处理结果`,
    ),
    example(
      '用 EXPLAIN 验证订单列表的复合索引',
      'sql',
      `CREATE INDEX idx_order_user_created
ON orders (user_id, created_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, amount_minor, created_at
FROM orders
WHERE user_id = 'c5b7d2dd-85b0-4f80-8851-3a4af7f45d57'
ORDER BY created_at DESC
LIMIT 20;`,
      `Index Scan using idx_order_user_created on orders
Actual Time: 0.041..0.052 rows=20 loops=1
Buffers: shared hit=5
失败边界：出现 Seq Scan 或 rows 远大于 20 时停止压测，先修查询与索引`,
    ),
    example(
      '按扩展、回填、切换、收紧四步执行迁移',
      'shell',
      `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE orders ADD COLUMN currency char(3);
UPDATE orders SET currency='CNY' WHERE currency IS NULL;
ALTER TABLE orders ALTER COLUMN currency SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT ck_currency CHECK (currency IN ('CNY'));
SQL
psql "$DATABASE_URL" -Atc "select count(*) from orders where currency is null"`,
      `ALTER TABLE
UPDATE 1842
ALTER TABLE
0
失败边界：回填期间旧应用插入 NULL 时迁移停止，先部署兼容双写再收紧约束`,
    ),
  ],
  [
    example(
      '用 Gradle 模块表达 Commerce 依赖方向',
      'kotlin',
      `// settings.gradle.kts
include(
  ":domain", ":catalog", ":inventory", ":order", ":payment",
  ":notification", ":infrastructure", ":app"
)

// order/build.gradle.kts
dependencies {
  implementation(project(":domain"))
  implementation(project(":inventory"))
  testImplementation(project(":infrastructure"))
}`,
      `./gradlew projects
Root project 'commerce'
+--- Project ':app'
+--- Project ':domain'
+--- Project ':order'
失败边界：catalog 直接依赖 order 时运行 architectureTest，禁止形成循环`,
    ),
    example(
      '用 Gradle 统一 toolchain 并锁定依赖版本',
      'kotlin',
      `plugins { java }
java {
  toolchain { languageVersion = JavaLanguageVersion.of(21) }
}
dependencies {
  implementation(platform("org.springframework.boot:spring-boot-dependencies:3.3.5"))
  testImplementation("org.junit.jupiter:junit-jupiter")
}
tasks.test { useJUnitPlatform() }`,
      `./gradlew javaToolchains
Detected JDK 21.0.5
./gradlew dependencies --configuration runtimeClasspath
spring-boot-dependencies:3.3.5
失败边界：模块自行声明不同 Spring 版本时 dependencyInsight 检出冲突并阻断合并`,
    ),
    example(
      '用 Compose 固定 PostgreSQL、Redis、Kafka 健康检查',
      'yaml',
      `services:
  postgres:
    image: postgres:16.4
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U commerce -d commerce"]
      interval: 5s
      retries: 10
  kafka:
    image: bitnami/kafka:3.8
    environment:
      KAFKA_CFG_NODE_ID: 1
      KAFKA_CFG_PROCESS_ROLES: broker,controller
    healthcheck:
      test: ["CMD-SHELL", "kafka-topics.sh --bootstrap-server localhost:9092 --list"]
      interval: 10s`,
      `docker compose up -d --wait
postgres  healthy
kafka      healthy
失败边界：依赖未健康就启动 app 时脚本退出，不能用 sleep 猜测启动完成`,
    ),
    example(
      '用 Testcontainers 验证真实 PostgreSQL 条件更新',
      'java',
      `@Testcontainers
class InventoryRepositoryTest {
  @Container
  static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16.4");

  @Test
  void onlyOneReservationWins() {
    repository.seed("SKU-RED-M", 1);
    var first = repository.reserve("SKU-RED-M", "order-a");
    var second = repository.reserve("SKU-RED-M", "order-b");
    assertThat(first).isTrue();
    assertThat(second).isFalse();
    assertThat(repository.available("SKU-RED-M")).isZero();
  }
}`,
      `InventoryRepositoryTest > onlyOneReservationWins PASSED
tests=1 failures=0
失败边界：容器启动超时或 SQL 方言不一致时测试失败，不能用 H2 替换真实事务验证`,
    ),
    example(
      '删除卷和构建产物后从 README 重建本地环境',
      'shell',
      `docker compose down -v --remove-orphans
rm -rf .gradle build */build
./gradlew clean test
docker compose up -d --wait
./gradlew bootRun --args='--spring.profiles.active=local'
curl -fsS localhost:8080/actuator/health/readiness`,
      `BUILD SUCCESSFUL
postgres healthy, redis healthy, kafka healthy
{"status":"UP","migration":"V12"}
失败边界：依赖手工建库、全局 JDK 或未提交环境变量时重建失败，先补 README`,
    ),
  ],
  [
    example(
      '用幂等记录与订单写入绑定首次处理结果',
      'java',
      `@Transactional
public OrderResponse createOrder(CreateOrder command, String idempotencyKey) {
  var existing = idempotencyRepository.find(command.userId(), idempotencyKey);
  if (existing != null) return existing.response();
  inventory.reserve(command.skuId(), command.quantity());
  var order = orderRepository.insert(command);
  var response = new OrderResponse(order.id(), order.status());
  idempotencyRepository.insert(command.userId(), idempotencyKey,
    command.requestHash(), response);
  outbox.append(OrderCreated.of(order));
  return response;
}`,
      `POST /orders idempotencyKey=checkout-42 -> 201 ord_01J8V6M8R2
POST /orders retry -> 200 ord_01J8V6M8R2
outbox rows for eventType=OrderCreated: 1
失败边界：库存不足时事务整体回滚，幂等记录和 Outbox 均不得残留`,
    ),
    example(
      '用事务与受影响行数证明库存和订单不会成功一半',
      'sql',
      `BEGIN;
UPDATE inventory
SET available = available - 2, reserved = reserved + 2
WHERE sku_id = 'SKU-RED-M' AND available >= 2;
-- JDBC checks updateCount == 1 before continuing
INSERT INTO orders(id, user_id, status, amount_minor, idempotency_key)
VALUES ('ord_2', 'user_7', 'PENDING_PAYMENT', 25800, 'checkout-43');
COMMIT;
SELECT available, reserved FROM inventory WHERE sku_id='SKU-RED-M';`,
      `UPDATE 1
INSERT 0 1
available=3 reserved=2
失败边界：UPDATE 0 时必须 ROLLBACK；若仍 FORCE 下单则集成测试判定库存透支`,
    ),
    example(
      '用版本字段拒绝并发支付造成的非法状态覆盖',
      'sql',
      `UPDATE orders
SET status = 'PAID', version = version + 1
WHERE id = 'ord_01J8V6M8R2'
  AND status = 'PENDING_PAYMENT'
  AND version = 3
RETURNING status, version;

UPDATE orders
SET status = 'CLOSED', version = version + 1
WHERE id = 'ord_01J8V6M8R2'
  AND status = 'PENDING_PAYMENT'
  AND version = 3
RETURNING status, version;`,
      `PAID | 4
UPDATE 0
closed_by_timeout=false reason=ORDER_ALREADY_PAID
失败边界：第二条更新成功会证明缺少状态条件，必须阻断发布并补偿订单`,
    ),
    example(
      '用渠道流水号幂等地接收支付回调',
      'sql',
      `INSERT INTO payment(order_id, provider, provider_trade_no, amount_minor, status)
VALUES ('ord_01J8V6M8R2', 'mockpay', 'trade_9001', 12900, 'SUCCEEDED')
ON CONFLICT (provider, provider_trade_no) DO NOTHING
RETURNING id;

INSERT INTO outbox(event_key, event_type, payload)
SELECT 'payment:S0001', 'PaymentSucceeded', '{"orderId":"ord_01J8V6M8R2"}'
WHERE EXISTS (SELECT 1 FROM payment WHERE provider_trade_no='trade_9001')
ON CONFLICT (event_key) DO NOTHING;`,
      `first callback: pay_01 inserted, outbox 1
second callback: payment 0 rows, outbox 0 rows
HTTP response: 200 already_processed=true
失败边界：金额不一致时返回 409 并进入人工对账，不能按渠道流水直接确认`,
    ),
    example(
      '让订单与 Outbox 在同一事务提交并由独立发布器投递',
      'java',
      `@Transactional
public void confirmPayment(String orderId, String tradeNo) {
  orderRepository.markPaid(orderId);
  outboxRepository.append(new OutboxEvent(
    "payment:" + tradeNo,
    "PaymentSucceeded",
    mapper.writeValueAsString(Map.of("orderId", orderId, "tradeNo", tradeNo))
  ));
}

@Scheduled(fixedDelay = 1000)
public void publishPending() {
  outboxRepository.lockPending(50).forEach(event -> {
    kafka.send("commerce-events", event.key(), event.payload());
    outboxRepository.markSent(event.id());
  });
}`,
      `tx=committed order=PAID outboxPending=1
publisher sent eventKey=payment:S0001 after 842ms
失败边界：Kafka 超时保留 sent_at=NULL 并退避重试，消费者仍按 eventKey 去重`,
    ),
  ],
  [
    example(
      '根据服务端响应驱动结算页状态',
      'typescript',
      `type CheckoutState = 'editing' | 'submitting' | 'confirmed' | 'inventory_conflict' | 'unknown_payment';
function nextState(response: { status: number; code?: string; order?: { status: string } }): CheckoutState {
  if (response.status === 201 && response.order?.status === 'PENDING_PAYMENT') return 'submitting';
  if (response.status === 409 && response.code === 'INVENTORY_CONFLICT') return 'inventory_conflict';
  if (response.status === 202) return 'unknown_payment';
  return response.order?.status === 'PAID' ? 'confirmed' : 'editing';
}
console.log(nextState({ status: 409, code: 'INVENTORY_CONFLICT' }));`,
      `inventory_conflict
失败边界：客户端不能先扣本地库存；无订单号或服务端状态时保持 submitting`,
    ),
    example(
      '用本地草稿恢复结算输入且只在成功后清理',
      'javascript',
      `const key = 'commerce:checkout-draft';
const draft = { name: '林青', phone: '13800000000', address: '学习路 8 号' };
localStorage.setItem(key, JSON.stringify(draft));
const restored = JSON.parse(localStorage.getItem(key) || '{}');
console.log('restored=' + restored.name + ', phoneLength=' + restored.phone.length);
localStorage.removeItem(key);
console.log('afterSuccess=' + localStorage.getItem(key));`,
      `restored=林青, phoneLength=11
afterSuccess=null
失败边界：提交 409 或网络错误时不得 removeItem，否则用户要求重新填写`,
    ),
    example(
      '把支付超时显示为结果确认中而非失败',
      'typescript',
      `type PaymentView = { tone: 'info'|'success'|'error'; title: string; action: 'refresh'|'none' };
function paymentView(status: string): PaymentView {
  if (status === 'PENDING_CONFIRMATION') return { tone: 'info', title: '支付结果确认中', action: 'refresh' };
  if (status === 'PAID') return { tone: 'success', title: '支付成功', action: 'none' };
  if (status === 'FAILED') return { tone: 'error', title: '支付失败', action: 'refresh' };
  return { tone: 'info', title: '正在查询订单', action: 'refresh' };
}
console.log(JSON.stringify(paymentView('PENDING_CONFIRMATION')));`,
      `{"tone":"info","title":"支付结果确认中","action":"refresh"}
失败边界：超时状态不能显示支付失败，刷新 5 次后提供客服入口与订单号`,
    ),
    example(
      '用 Playwright 验证结算键盘路径和 320px 布局',
      'typescript',
      `test('checkout is keyboard and mobile safe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/checkout');
  await page.getByLabel('收货人').fill('林青');
  await page.getByLabel('手机号').fill('13800000000');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '提交订单' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('库存');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});`,
      `1 passed (1.8s)
alert=库存不足，请返回购物车调整数量
overflow=0
失败边界：焦点无法到达提交按钮或出现横向滚动时测试失败`,
    ),
    example(
      '用组件测试覆盖空购物车与库存冲突',
      'typescript',
      `describe('CheckoutPage', () => {
  it('renders inventory conflict without clearing draft', async () => {
    server.use(post('/api/orders', () => HttpResponse.json(
      { code: 'INVENTORY_CONFLICT', message: '库存不足' }, { status: 409 }
    )));
    render(CheckoutPage, { props: { draft: { name: '林青' } } });
    await userEvent.click(screen.getByRole('button', { name: '提交订单' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('库存不足');
    expect(screen.getByLabelText('收货人')).toHaveValue('林青');
  });
});`,
      `CheckoutPage inventory conflict PASS
tests=1 assertions=2
失败边界：错误后表单被清空或显示“网络错误”时测试失败`,
    ),
  ],
  [
    example(
      '按风险建立领域、集成、契约与端到端测试矩阵',
      'javascript',
      `const matrix = [
  ['domain', 'order-state', 'unit'],
  ['inventory-conflict', 'postgres', 'integration'],
  ['create-order', 'openapi', 'contract'],
  ['checkout', 'browser', 'e2e'],
  ['payment-callback', 'kafka', 'integration'],
];
for (const [risk, boundary, level] of matrix) {
  if (!level) throw new Error('missing level for ' + risk);
  console.log(risk + ' -> ' + boundary + ' @ ' + level);
}`,
      `domain -> order-state @ unit
inventory-conflict -> postgres @ integration
create-order -> openapi @ contract
checkout -> browser @ e2e
失败边界：高风险并发或消息路径只做 mock 单元测试时矩阵评审不通过`,
    ),
    example(
      '用 CountDownLatch 让并发库存争抢可重复复现',
      'java',
      `@Test
void lastItemHasSingleWinner() throws Exception {
  var start = new CountDownLatch(1);
  var pool = Executors.newFixedThreadPool(8);
  var results = IntStream.range(0, 8).mapToObj(i -> pool.submit(() -> {
    start.await();
    return orderService.tryReserve("SKU-RED-M", "key-" + i);
  })).toList();
  start.countDown();
  long wins = results.stream().filter(f -> get(f)).count();
  assertThat(wins).isEqualTo(1);
  assertThat(inventory.available("SKU-RED-M")).isZero();
}`,
      `wins=1 conflicts=7 dbAvailable=0
InventoryConcurrencyTest PASSED
失败边界：重复运行出现 wins=2 或负库存说明条件更新/隔离级别错误`,
    ),
    example(
      '重复支付回调与 Outbox 重放后核对三处状态',
      'sql',
      `-- Send the same provider callback and replay the same outbox event three times.
SELECT
  (SELECT count(*) FROM payment WHERE provider_trade_no='trade_9001') AS payments,
  (SELECT count(*) FROM orders WHERE id='ord_1' AND status='PAID') AS paid_orders,
  (SELECT count(*) FROM notification WHERE event_key='payment:S0001') AS notifications;`,
      `payments=1 paid_orders=1 notifications=1
PASS no duplicate business side effect
失败边界：notifications>1 或 paid_orders=0 时停止发布，检查幂等表和消费 offset`,
    ),
    example(
      '验证顾客不能读取他人订单或篡改支付金额',
      'shell',
      `curl -sS -o /tmp/other.json -w '%{http_code}' \\
  -H "Authorization: Bearer $USER_A_TOKEN" \\
  http://localhost:8080/orders/ord_belongs_to_user_b
printf '\\n'
curl -sS -o /tmp/tamper.json -w '%{http_code}' \\
  -H "Authorization: Bearer $USER_A_TOKEN" -H 'Content-Type: application/json' \\
  -d '{"amountMinor":1}' -X POST http://localhost:8080/orders
printf '\\n'`,
      `403
422
errorCodes=ORDER_NOT_ACCESSIBLE,AMOUNT_MISMATCH
失败边界：他人订单返回完整金额或客户端金额被接受时安全回归失败`,
    ),
    example(
      '用 k6 记录下单尾延迟、锁等待与库存冲突率',
      'shell',
      `k6 run scripts/commerce-load.js \\
  --vus 80 --duration 3m \\
  --out json=artifacts/commerce-load.json
jq '.metrics | with_entries(select(.key|test("order|lock|conflict")))' \\
  artifacts/commerce-load.json`,
      `http_req_duration p95=231ms p99=612ms
inventory_lock_wait_ms p95=41
conflicts=0.17 errors=0.004
失败边界：只报告平均值或没记录数据规模时性能结论无效`,
    ),
  ],
  [
    example(
      'CI 只发布带提交号并通过测试的固定镜像',
      'yaml',
      `jobs:
  release:
    steps:
      - uses: actions/checkout@v4
      - run: ./gradlew clean test integrationTest
      - run: docker build -t registry.local/commerce:$GITHUB_SHA .
      - run: docker push registry.local/commerce:$GITHUB_SHA
      - run: cosign sign registry.local/commerce:$GITHUB_SHA
      - run: syft registry.local/commerce:$GITHUB_SHA -o spdx-json=sbom.json`,
      `tests=PASS image=commerce:c7a91d3 digest=sha256:4f2e...
signed=true sbom=spdx
失败边界：测试或扫描失败即停止 push；生产只允许引用完整 digest`,
    ),
    example(
      '按兼容顺序执行数据库迁移与镜像发布',
      'shell',
      `./gradlew flywayValidate
./gradlew flywayMigrate -Dflyway.url="$DATABASE_URL"
kubectl apply -f k8s/commerce-canary.yaml
kubectl rollout status deployment/commerce-canary --timeout=180s
kubectl exec deploy/commerce-canary -- curl -fsS localhost:8080/actuator/health/readiness`,
      `migration V18 applied
rollout status: successfully rolled out
{"status":"UP","schema":"V18"}
失败边界：迁移失败停止发布；回滚镜像前检查新结构是否仍兼容旧版本`,
    ),
    example(
      '用 PromQL 暴露订单、库存、回调和 Outbox 风险',
      'promql',
      `sum by (result) (
  rate(commerce_order_create_total[5m])
)
/
sum(rate(commerce_order_create_total[5m]))

max(commerce_outbox_unsent)
max(commerce_payment_callback_age_seconds)
sum(rate(commerce_inventory_conflict_total[5m]))`,
      `{result="success"} 0.982
{result="inventory_conflict"} 0.018
max outbox unsent=3
callback age p95=1.2s
失败边界：只看 CPU 无法发现支付回调积压；Outbox 持续增长必须告警`,
    ),
    example(
      '把启动、就绪和存活探针绑定不同判断',
      'yaml',
      `startupProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  failureThreshold: 30
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 5
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  periodSeconds: 15`,
      `startup -> ready after 24s
readiness DOWN when postgres unavailable
liveness remains UP during dependency outage
失败边界：把 Kafka 短暂延迟放入 liveness 会导致无意义重启风暴`,
    ),
    example(
      '发布后用创建订单、回调和查询完成冒烟与回滚',
      'shell',
      `ORDER=$(curl -fsS -X POST "$BASE/orders" -H 'Idempotency-Key: smoke-20261124' \\
  -H 'Content-Type: application/json' -d '{"skuId":"SMOKE-SKU","quantity":1}' | jq -r .orderId)
curl -fsS -X POST "$BASE/payments/mock/callback" -d "orderId=$ORDER&tradeNo=smoke-9001"
curl -fsS "$BASE/orders/$ORDER" | jq -e '.status=="PAID"'
if [ $? -ne 0 ]; then ./rollback-commerce.sh "$RELEASE"; fi`,
      `order=ord_smoke_01 status=PENDING_PAYMENT
callback=http-200 order=PAID
smoke=PASS
失败边界：若状态未到 PAID 自动回滚，并保留订单号、镜像 digest 和回调日志`,
    ),
  ],
  [
    example(
      '热点库存演练后用账本验证库存与订单一致',
      'sql',
      `SELECT
  i.available,
  i.reserved,
  COALESCE(sum(r.quantity), 0) AS reserved_ledger,
  COALESCE(sum(o.amount_minor) FILTER (WHERE o.status='PAID'), 0) AS paid_amount
FROM inventory i
LEFT JOIN stock_reservation r ON r.sku_id=i.sku_id
LEFT JOIN orders o ON o.id=r.order_id
WHERE i.sku_id='SKU-RED-M'
GROUP BY i.available, i.reserved;`,
      `available=0 reserved=50 reserved_ledger=50 paid_amount=646000
PASS reservation ledger matches inventory
失败边界：reserved 与 ledger 不一致时冻结该 SKU 并进入人工对账`,
    ),
    example(
      '支付回调积压演练同时观察延迟与重复率',
      'promql',
      `max(commerce_payment_callback_age_seconds)
sum(commerce_kafka_consumer_lag{topic="payment-callback"})
sum(rate(commerce_payment_callback_duplicate_total[5m]))
  / sum(rate(commerce_payment_callback_total[5m]))`,
      `callbackAge=94s kafkaLag=1280 duplicateRate=0.031
ALERT PaymentCallbackLagHigh
失败边界：积压恢复后仍出现重复支付事件时暂停消费者并检查 Outbox 唯一键`,
    ),
    example(
      'Kafka 重复与 Outbox 重放后核对订单、库存和通知',
      'sql',
      `WITH replayed AS (
  UPDATE outbox SET sent_at=NULL
  WHERE event_key IN ('order:S0001','payment:S0001')
  RETURNING event_key
)
SELECT
  (SELECT count(*) FROM orders WHERE idempotency_key='checkout-42') AS orders,
  (SELECT count(*) FROM stock_reservation WHERE order_id='ord_1') AS reservations,
  (SELECT count(*) FROM notification WHERE event_key='order:S0001') AS notifications,
  (SELECT count(*) FROM replayed) AS replayed;`,
      `orders=1 reservations=1 notifications=1 replayed=2
PASS replay is idempotent at every consumer
失败边界：通知重复或库存重复预占时停止重放，先修消费幂等记录`,
    ),
    example(
      '按运行手册回滚镜像并重跑订单对账',
      'shell',
      `kubectl set image deployment/commerce commerce=registry.local/commerce:$PREVIOUS_SHA
kubectl rollout status deployment/commerce --timeout=180s
curl -fsS "$BASE/actuator/health/readiness"
psql "$DATABASE_URL" -f scripts/reconcile-orders.sql
printf 'rollback_seconds=%s\\n' "$(($(date +%s)-START_EPOCH))"`,
      `rollout status: successfully rolled out
{"status":"UP","schema":"V18"}
reconcile mismatches=0
rollback_seconds=86
失败边界：数据库已不兼容旧镜像时禁止直接回滚，先执行兼容迁移`,
    ),
    example(
      '把架构答辩结论写成可核验的决策记录',
      'json',
      `{
  "decision": "modular-monolith-with-outbox",
  "context": "small team, inventory and order consistency",
  "evidence": ["one-winner inventory test", "outbox replay test", "p95 187ms"],
  "rejected": ["distributed transaction", "microservices at mvp"],
  "revisitWhen": "independent releases or sustained scaling pressure",
  "openRisks": ["hot sku lock contention", "payment provider timeout"]
}`,
      `decision=modular-monolith-with-outbox evidence=3 rejected=2
revisitWhen=independent releases or sustained scaling pressure
失败边界：任何结论没有实验、指标或事故证据时只能标为假设，不能进入 ADR`,
    ),
  ],
];

export const PROGRAMMING_PROJECT_TRAINING_BATCH_02_COURSES =
  withProjectExamples(COMMERCE_COURSES, COMMERCE_EXAMPLES);
