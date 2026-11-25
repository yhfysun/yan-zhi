// P15 综合训练第九批手写样板：DataFlow 数据平台 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;
const sources = [
  'Apache Flink Documentation. https://nightlies.apache.org/flink/flink-docs-stable/',
  'Apache Iceberg Documentation. https://iceberg.apache.org/docs/latest/',
  'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
];

const course = (
  phase: string,
  minutes: number,
  goal: string,
  steps: readonly [string, string, string][],
): ProgrammingCourseSeed => ({
  name: `综合训练 · DataFlow 数据平台 · ${phase}`,
  track,
  contentStatus: 'reviewed',
  minutes,
  prerequisite: '理解数据库、消息队列、数据仓库和容器基础，能编写 SQL 与一种后端语言。',
  goal,
  guidedPractice: `为“${phase}”构造小规模批流验证：${steps[0][1]} 记录输入、血缘、质量结果、资源成本和失败恢复。`,
  independentPractice: '交付阶段产物，并用重复、乱序、晚到和坏数据验证幂等、质量与回滚。',
  commonErrors: ['只验证正常数据，不处理迟到、重复和 schema 演进。', '提前物化全部指标，造成存储和刷新成本失控。'],
  sourceRefs: sources,
  steps,
});

const DATAFLOW_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  course('业务理解与用户任务', 42, '能区分分析师、数据工程师、指标负责人和 SRE 的任务，建立从业务事件到指标、血缘和告警的可信数据链。', [
    ['按角色拆数据任务', '分析师关心口径和可追溯来源，数据工程师负责接入与转换，指标负责人确认业务定义，SRE 负责新鲜度和成本。每个角色写清输入、成功证据和失败入口。', '角色任务连接到指标口径'],
    ['画出事件到指标的链路', '业务事件进入采集、校验、明细层、汇总层和指标服务，血缘记录每层表、任务和负责人。结果异常时能反查上游输入。', '数据血缘是排障地图'],
    ['先定义时间语义', '事件时间、到达时间和处理时间不同，迟到和重复会影响窗口结果。水位线和允许迟到范围必须写进契约。', '时间语义先于计算逻辑'],
    ['记录数据质量代价', '缺字段、重复行、异常值和上游延迟会传播到指标。质量规则要区分阻断、告警和隔离，不能静默丢弃。', '坏数据必须有去向'],
    ['形成首版闭环', '首版做事件接入、明细表、三张核心指标、血缘和新鲜度告警；不做全公司数据目录和复杂实时推荐。', '首版先保证口径可信'],
  ]),
  course('范围、验收与非功能目标', 40, '能把首版限定为两条数据源、核心指标和血缘，写出重复、迟到、坏数据、新鲜度、成本和恢复验收。', [
    ['范围收敛核心指标', '首版只选订单和支付两条源，产出 GMV、支付成功率和退款数三张指标，每个指标有唯一负责人。', '指标少但口径完整'],
    ['质量验收可执行', '定义主键唯一、金额非负、状态合法和事件时间范围，规则失败要记录表、批次和样本。', '质量规则必须可追溯'],
    ['新鲜度和延迟有目标', '记录源事件到明细层和指标层的时间差，目标绑定业务窗口和告警阈值。', '数据延迟也是用户影响'],
    ['容量和成本有预算', '估算事件量、存储增长、计算资源和扫描成本，批流任务用小规模高峰验证。', '成本进入数据验收'],
    ['冻结可回放范围', '每批数据可从血缘和快照重放，新增指标必须说明口径、上游和成本。', '重放能力属于首版'],
  ]),
  course('API 契约与前端数据边界', 48, '能定义数据源、表、指标、质量、血缘和任务接口，明确 schema 版本、异步状态、查询边界和权限。', [
    ['数据对象稳定标识', '源、表、字段、指标和任务使用稳定 ID，显示名可改但 ID 不变，血缘和权限引用 ID。', '名称不是数据身份'],
    ['schema 版本兼容演进', '新增可选字段可兼容，删除、重命名和类型变化需迁移与消费者检查。数据契约与事件版本一起记录。', 'schema 要版本化'],
    ['异步任务返回状态', '接入和计算任务返回 queued、running、failed、succeeded，失败包含阶段和可重试错误。前端不把提交成功当数据成功。', '任务状态必须可查询'],
    ['查询契约限制范围', '指标查询绑定时间窗、粒度和权限，禁止无界扫描。分页和聚合由服务端完成。', '查询不能拖垮平台'],
    ['前端只展示可行动状态', '数据页面显示新鲜度、质量、血缘和负责人，异常时给出重跑、隔离或联系入口。', '数据异常要能行动'],
  ]),
  course('数据模型、约束与迁移', 48, '能设计明细、汇总、指标、质量、血缘和任务元数据模型，处理分区、快照、schema 迁移和幂等重放。', [
    ['分层保存明细与指标', '原始事件保留来源和时间，明细层清洗标准化，汇总层按时间窗聚合，指标服务读取稳定口径。', '分层避免重复解释业务'],
    ['分区与文件布局服务查询', '按事件日期和业务键分区，控制小文件、分区粒度和压缩格式，查询计划要验证扫描量。', '布局决定扫描成本'],
    ['幂等批次与快照', '每个批次有 source、offset、eventTime 和 checksum，重放同一批次不重复聚合，快照支持旧指标重现。', '重放必须幂等'],
    ['血缘和任务元数据独立', '血缘保存输入输出字段和任务版本，任务表保存调度、资源、状态和负责人，不把说明塞进注释。', '元数据要可查询'],
    ['迁移保留双读', 'schema 或指标版本变化先双写双读验证，再切换消费者，保留旧分区和回滚脚本。', '数据迁移不能只改表结构'],
  ]),
  course('项目骨架、模块边界与本地环境', 50, '能建立接入任务、流处理、批处理、指标 API 和前端，用本地 Kafka、对象存储和 Iceberg 目录复现数据流。', [
    ['接入、计算、服务分层', '接入任务负责源和 schema，计算任务负责明细与汇总，指标 API 负责查询权限，前端只读业务视图。', '模块边界按数据职责'],
    ['本地依赖固定版本', 'Compose 启动 Kafka、对象存储和调度依赖，固定 Flink/Iceberg 版本和表目录，使用小样例数据。', '本地要验证真实表格式'],
    ['配置和状态可复现', '数据源、checkpoint、表目录和并发来自配置，启动校验版本与权限，测试数据不写开发主目录。', '环境失败要显式'],
    ['测试覆盖批流边界', '单元测试转换函数，集成测试重复、迟到和 schema 变化，端到端测试指标结果和血缘。', '测试使用真实语义'],
    ['README 跑通一条指标', '从空目录启动、发送事件、生成明细和指标，并查询质量与血缘。', '首条指标是环境验收'],
  ]),
  course('后端核心链路与异常恢复', 56, '能实现幂等接入、水位线、窗口聚合、质量隔离、checkpoint、任务重试和指标查询，处理迟到、重复和上游断流。', [
    ['接入先校验和去重', '每条事件验证 schema、主键和事件时间，重复事件按 sourceId + offset 去重，坏数据进入隔离区并告警。', '坏数据不能直接丢'],
    ['窗口处理定义水位线', '水位线根据事件时间推进，允许迟到范围进入配置；超迟到数据进入补偿或隔离分支。', '水位线决定何时出结果'],
    ['checkpoint 保障恢复', '流任务 checkpoint 保存源位移、状态和事务信息，重启从最近成功点恢复并避免重复提交。', '恢复需要状态快照'],
    ['质量失败阻断指标发布', '阻断规则失败时停止相关分区指标发布，告警带表、批次和样本；非阻断问题进入质量报告。', '口径可信优先于及时'],
    ['指标查询从快照读取', '查询按指标版本和时间窗读取汇总，权限过滤租户和业务域，慢查询记录扫描量。', '查询结果绑定版本'],
  ]),
  course('前端页面、状态与可访问交互', 54, '能实现数据源、指标、质量、血缘和任务页面，处理加载、空、过期、异常和移动端阅读。', [
    ['指标页突出口径和新鲜度', '指标卡显示定义、负责人、最近更新和质量状态，点击可查看来源和血缘。', '指标标题不能替代口径'],
    ['质量异常可钻取', '质量列表按源、表、批次和规则分组，显示失败样本和影响指标，提供隔离与重跑入口。', '异常要定位到数据'],
    ['血缘图支持文本替代', '图形血缘提供列表视图和键盘导航，节点显示表、字段、任务和负责人员，颜色不是唯一信息。', '关系图也要可访问'],
    ['任务状态与日志分层', '任务页显示阶段、耗时、资源、重试和日志摘要，失败可查看具体批次和错误码。', '任务状态不等于数据状态'],
    ['移动端保持可扫描', '窄屏用分组列表替代宽表，触控目标和文本溢出达标，时间与新鲜度清晰可读。', '数据密度不能牺牲可读性'],
  ]),
  course('联调、测试、安全与性能', 56, '能验证重复、迟到、schema 演进、坏数据、权限、扫描成本和恢复，建立质量与性能基线。', [
    ['数据测试使用固定样本', '每个指标有正常、重复、迟到、缺字段和状态非法样本，断言明细与汇总结果。', '样本要可重放'],
    ['安全覆盖数据域与字段', '分析师只能查授权业务域和脱敏字段，血缘和质量接口也不能泄露敏感样本。', '数据权限跟随查询'],
    ['性能记录扫描与延迟', '查询和任务记录输入量、输出行数、扫描字节、CPU、延迟和成本，优化前先有基线。', '数据性能看资源'],
    ['schema 演进回归', '新增字段、类型变化和旧消费者共存都要测试，失败任务和指标不能静默。', '演进兼容要有证据'],
    ['恢复演练核对指标', '重启流任务、重放批次和恢复 checkpoint 后，指标与明细数量一致且重复可解释。', '恢复以对账结束'],
  ]),
  course('容器、CI/CD、可观测与发布', 54, '能构建接入、流批任务和指标 API 制品，配置调度、指标、告警、血缘版本和回滚。', [
    ['任务和 API 独立制品', '流任务、批任务、指标 API 和前端有独立镜像与版本，记录表格式、checkpoint 和 schema 版本。', '制品版本包含数据版本'],
    ['发布检查依赖契约', '发布前验证 Kafka、对象存储、Iceberg 和调度权限，schema 不兼容时阻止切换。', '依赖契约进入门禁'],
    ['指标覆盖新鲜度质量成本', '仪表盘显示任务 lag、checkpoint、质量失败、指标新鲜度、扫描字节和成本。', '数据健康优先监控滞后'],
    ['灰度按指标域执行', '先发布非关键指标或少量分区，验证结果和成本再扩大，失败切回旧任务与表版本。', '灰度需要数据对账'],
    ['回滚保留旧快照', '回滚任务和指标版本时保留旧分区和快照，重跑后比较结果。', '数据回滚不是换镜像'],
  ]),
  course('故障演练、回滚与项目答辩', 52, '能演练上游断流、重复、乱序、坏数据、checkpoint 失败、存储增长和错误发布，完成恢复与答辩。', [
    ['上游断流演练新鲜度告警', '停止事件源，观察 lag、指标新鲜度和告警，恢复后按位移重放且不重复。', '断流恢复要对账'],
    ['坏数据演练阻断发布', '注入非法金额和状态，验证隔离、质量告警和指标阻断，修复后可补数。', '坏数据不能污染口径'],
    ['checkpoint 故障恢复', '破坏 checkpoint 或任务状态，使用快照和源位移恢复，记录重复和丢失范围。', '恢复边界必须可解释'],
    ['存储与成本演练', '扩大分区和小文件，观察扫描成本和任务时间，执行压缩和保留策略。', '容量问题影响查询'],
    ['答辩解释可信数据链', '回答时间语义、幂等重放、质量阻断、血缘、权限和成本取舍，用指标与故障数据支撑。', '数据平台答辩以可信为核心'],
  ]),
];

const DATAFLOW_STEP_SUFFIXES: Readonly<Record<string, string>> = {
  '画出事件到指标的链路': '血缘要记录表、字段、任务版本和负责人，支持反向追踪。',
  '先定义时间语义': '事件时间、到达时间和处理时间要分别保存并展示。',
  '记录数据质量代价': '每条质量规则要记录影响指标、失败样本和处理动作。',
  '形成首版闭环': '首版每项非目标说明未来触发条件和数据风险。',
  '范围收敛核心指标': '每张指标只允许一个负责人和一个版本化定义。',
  '质量验收可执行': '规则结果保存批次、样本、通过数和失败数。',
  '新鲜度和延迟有目标': '按源、明细和指标层分别记录延迟分位。',
  '容量和成本有预算': '预算包含存储增长、扫描字节和任务 CPU。',
  '冻结可回放范围': '重放必须引用固定源位移、批次和代码版本。',
  '数据对象稳定标识': '显示名变化不能切断血缘、权限和历史查询。',
  'schema 版本兼容演进': '消费者兼容矩阵进入数据契约测试和发布门禁。',
  '查询契约限制范围': '查询必须声明时间窗、粒度和最大扫描预算。',
  '前端只展示可行动状态': '过期、质量和任务异常都要给出负责人和操作。',
  '分层保存明细与指标': '每层都保留来源批次和可追溯的版本标识。',
  '分区与文件布局服务查询': '分区粒度、文件大小和压缩策略要由查询验证。',
  '幂等批次与快照': '批次的来源、位移、校验值和结果要一起归档。',
  '血缘和任务元数据独立': '任务状态、血缘关系和业务口径分别可查询。',
  '迁移保留双读': '旧新字段在滚动升级期间要比较结果和失败率。',
  '接入、计算、服务分层': '接入、转换、指标和查询各自拥有稳定接口。',
  '本地依赖固定版本': 'Flink、Iceberg 和表目录版本必须与测试一致。',
  '配置和状态可复现': 'checkpoint、表目录和并发通过配置显式验证。',
  '测试覆盖批流边界': '固定样本包含重复、迟到、坏数据和 schema 变化。',
  'README 跑通一条指标': '文档给出事件发送、任务运行、指标查询和血缘检查。',
  '接入先校验和去重': '隔离区保存原始事件和拒绝原因，支持修复后补数。',
  '窗口处理定义水位线': '迟到范围和补偿分支要有指标与人工入口。',
  'checkpoint 保障恢复': '恢复报告要说明最早可重放位移和重复范围。',
  '质量失败阻断指标发布': '阻断批次不能污染下游指标，恢复后必须补算。',
  '指标查询从快照读取': '查询结果和指标版本、数据快照一起返回。',
  '指标页突出口径和新鲜度': '指标卡展示负责人、更新时间、质量和来源。',
  '质量异常可钻取': '异常可展开到批次、样本和受影响指标。',
  '血缘图支持文本替代': '图形和列表共享同一关系数据与键盘导航。',
  '任务状态与日志分层': '阶段状态、批次错误和日志摘要分别展示。',
  '移动端保持可扫描': '窄屏用分组列表保留时间、状态和负责人。',
  '数据测试使用固定样本': '每个指标用同一批样本验证明细、汇总和权限。',
  '安全覆盖数据域与字段': '查询、血缘和质量样本都执行脱敏与角色校验。',
  '性能记录扫描与延迟': '优化报告包含输入量、扫描字节、CPU、延迟和成本。',
  'schema 演进回归': '旧消费者、新生产者和迁移双读同时验证。',
  '恢复演练核对指标': '恢复后核对批次、明细、汇总和指标总量。',
  '任务和 API 独立制品': '制品记录 schema、checkpoint 和指标定义版本。',
  '发布检查依赖契约': 'Kafka、对象存储、表格式和调度权限发布前验证。',
  '指标覆盖新鲜度质量成本': '仪表盘同时展示 lag、质量、新鲜度和扫描成本。',
  '灰度按指标域执行': '灰度后比较新旧指标差异和成本再扩大范围。',
  '回滚保留旧快照': '回滚任务、指标和表版本后执行数据对账。',
  '上游断流演练新鲜度告警': '恢复后重放位移并核对指标数量。',
  '坏数据演练阻断发布': '修复坏数据后补算指标并保存质量证据。',
  'checkpoint 故障恢复': '恢复后说明重复、丢失和人工补数范围。',
  '存储与成本演练': '压缩、保留策略和分区调整要重新测量扫描成本。',
  '答辩解释可信数据链': '用时间语义、血缘、质量和回放数据支撑结论。',
};

const DATAFLOW_EXAMPLE_ENTRIES: readonly [string, LearningV2LessonExample][] = [
  ['按角色拆数据任务', {
    title: '为每张指标绑定负责人和证据',
    language: 'YAML',
    code: `metrics:
  gmv:
    owner: analytics-finance
    definition: sum(paid_order_amount) by event_date
    sources: [orders, payments]
    freshnessSlo: 15m
  payment_success_rate:
    owner: payments-data
    definition: paid_orders / attempted_payments
    sources: [payments]
    qualityRules: [payment_status_valid]
  refunds:
    owner: customer-ops
    definition: count(refund_completed)
    sources: [refunds]
command: yq '.metrics | to_entries[] | {metric: .key, owner: .value.owner}' metric-owners.yaml`,
    output: `命令逐行输出 gmv、payment_success_rate、refunds 及各自负责人；每个指标同时有来源、定义和新鲜度或质量要求。
失败边界：只有指标名称而没有 owner、口径和来源时不能上线；负责人变化必须保留版本和历史查询归属。`,
  }],
  ['画出事件到指标的链路', {
    title: '递归查询指标到源表血缘',
    language: 'SQL',
    code: `WITH RECURSIVE lineage AS (
  SELECT node_id, parent_id, node_type, name, 0 AS depth
  FROM data_lineage WHERE node_id = 'metric:gmv'
  UNION ALL
  SELECT l.node_id, l.parent_id, l.node_type, l.name, lineage.depth + 1
  FROM data_lineage l JOIN lineage ON l.node_id = lineage.parent_id
)
SELECT depth, node_type, name FROM lineage ORDER BY depth, name;
SELECT task_id, task_version, owner FROM metric_task
WHERE metric_id = 'metric:gmv';`,
    output: `查询从 metric:gmv 逐层展开到 dbt model、Iceberg 表和 orders/payments 源事件，并返回任务版本和负责人。
失败边界：只有表级血缘没有字段级映射时无法解释金额口径；任何没有 task_version 的血缘不能用于事故复盘。`,
  }],
  ['先定义时间语义', {
    title: '在事件契约中区分三种时间',
    language: 'JSON',
    code: `{
  "eventId": "evt-7f2",
  "orderId": "ord-42",
  "eventTime": "2026-11-24T10:02:11.420Z",
  "ingestedAt": "2026-11-24T10:02:13.005Z",
  "processedAt": "2026-11-24T10:02:14.880Z",
  "watermark": "2026-11-24T10:01:30.000Z",
  "allowedLatenessSeconds": 300,
  "schemaVersion": 4
}
// jq -e '.eventTime and .ingestedAt and .processedAt' order-event.json`,
    output: `jq 返回 true，事件同时保留业务发生时间、落地时间和处理时间；水位线和允许迟到范围进入同一契约。
失败边界：用 ingestedAt 代替 eventTime 会错分迟到订单；缺失 schemaVersion 时无法判断迟到数据应按哪一版解析。`,
  }],
  ['记录数据质量代价', {
    title: '把坏数据隔离并阻断受影响指标',
    language: 'SQL',
    code: `INSERT INTO quality_result (batch_id, rule, failed_rows, sample, action)
VALUES ('batch-20261124-03', 'amount_non_negative', 12,
  '{"orderId":"ord-91","amount":-8.50,"source":"payments"}', 'quarantine');
INSERT INTO quarantine_event (batch_id, source, raw_event, reason)
VALUES ('batch-20261124-03', 'payments', '{"orderId":"ord-91","amount":-8.50}', 'amount_non_negative');
UPDATE metric_publication SET state = 'blocked'
WHERE metric_id IN ('gmv', 'payment_success_rate') AND window_start = '2026-11-24T10:00:00Z';
SELECT batch_id, rule, failed_rows, action FROM quality_result ORDER BY created_at DESC LIMIT 5;`,
    output: `质量结果记录 12 行失败和样本，坏事件进入隔离区，gmv 与 payment_success_rate 对应窗口变为 blocked。
失败边界：静默丢弃会制造无法解释的缺口；隔离后必须提供修复、补数与重新发布路径，并保留原始事件。`,
  }],
  ['形成首版闭环', {
    title: '冻结两条源与三张核心指标',
    language: 'YAML',
    code: `version: 1
sources: [orders, payments]
metrics: [gmv, payment_success_rate, refunds]
pipeline:
  - ingest-validate
  - bronze-events
  - silver-orders
  - metric-snapshot
  - lineage-publish
  - freshness-alert
evidence:
  - source-offset
  - task-version
  - quality-result
  - metric-snapshot-id
excluded: [company-wide-catalog, realtime-recommendation, cross-region-federation]
command: yq '.sources | length, (.metrics | length)' dataflow-scope.yaml`,
    output: `命令输出 2 和 3，说明首版只接两条源、三张指标，并要求偏移、版本、质量和快照四类证据。
失败边界：无法从指标回溯到源批次的功能不属于首版；全公司目录和推荐系统延期必须写明重新评估触发条件。`,
  }],
  ['范围收敛核心指标', {
    title: '用唯一版本化定义锁定 GMV',
    language: 'SQL',
    code: `CREATE TABLE metric_definition (
  metric_id text NOT NULL, version integer NOT NULL, owner text NOT NULL,
  definition sql NOT NULL, status text NOT NULL CHECK (status IN ('draft','active','retired')),
  PRIMARY KEY (metric_id, version)
);
INSERT INTO metric_definition VALUES
  ('gmv', 4, 'analytics-finance', 'sum(paid_order_amount) where payment_status = ''paid''', 'active');
SELECT metric_id, version, owner, definition FROM metric_definition
WHERE metric_id = 'gmv' AND status = 'active';
CREATE UNIQUE INDEX one_active_metric_version ON metric_definition(metric_id) WHERE status = 'active';`,
    output: `查询返回 GMV v4 和唯一负责人；唯一索引阻止同一指标同时存在两个 active 定义。
失败边界：修改口径必须新增版本并迁移消费者，不能直接 update active 定义；退款冲减、币种和时间窗都要进入定义测试。`,
  }],
  ['质量验收可执行', {
    title: '用固定批次验证关键质量规则',
    language: 'SQL',
    code: `WITH checks AS (
  SELECT 'order_id_unique' AS rule, count(*) - count(DISTINCT order_id) AS failures FROM silver_orders WHERE batch_id = 'b-7'
  UNION ALL
  SELECT 'amount_non_negative', count(*) FROM silver_orders WHERE batch_id = 'b-7' AND amount < 0
  UNION ALL
  SELECT 'status_allowed', count(*) FROM silver_orders WHERE batch_id = 'b-7' AND status NOT IN ('paid','refunded','cancelled')
  UNION ALL
  SELECT 'event_time_in_range', count(*) FROM silver_orders WHERE batch_id = 'b-7' AND event_time < '2026-11-24'
)
SELECT rule, failures, CASE WHEN failures > 0 THEN 'block' ELSE 'pass' END AS action FROM checks;`,
    output: `四项检查按规则输出 failures；重复主键、负金额或非法状态大于 0 时 action=block，合格批次为 pass。
失败边界：只检查行数无法发现口径错误；每条规则必须有固定失败样本、影响指标和修复后的补算验证。`,
  }],
  ['新鲜度和延迟有目标', {
    title: '查询源到指标的分层延迟',
    language: 'PromQL',
    code: `histogram_quantile(0.95,
  sum by (le, source) (rate(dataflow_ingest_delay_seconds_bucket[15m]))
)

histogram_quantile(0.95,
  sum by (le, metric) (rate(dataflow_metric_freshness_seconds_bucket[15m]))
)

# 例如 orders 源 P95=18s，gmv 指标 P95=420s，SLO 为 15m
# alert: dataflow_metric_freshness_seconds > 900 for 10m`,
    output: `按 source 和 metric 返回 ingest 与 freshness 的 P95；orders、payments 和 gmv 可分别观察，超 15 分钟触发告警。
失败边界：只看 Kafka lag 不代表指标新鲜度，汇总任务或质量阻断也会延迟；需要按层区分源、明细和指标。`,
  }],
  ['容量和成本有预算', {
    title: '估算事件存储和扫描成本',
    language: 'SQL',
    code: `SELECT
  count(*) AS event_count,
  sum(pg_column_size(payload)) AS payload_bytes,
  pg_size_pretty(sum(pg_column_size(payload))) AS payload_size,
  round(count(*) * 30.0 / 86400, 2) AS events_per_second_at_monthly_peak
FROM bronze_event
WHERE event_date = DATE '2026-11-24' AND source IN ('orders', 'payments');
EXPLAIN (ANALYZE, BUFFERS)
SELECT sum(amount) FROM silver_orders WHERE event_date BETWEEN '2026-11-01' AND '2026-11-24';`,
    output: `结果给出事件数、payload 总量和峰值事件率，EXPLAIN 显示扫描分区与字节数；可据此计算存储、CPU 和查询预算。
失败边界：只估算单日容量会低估月末重放和迟到补偿；扫描成本要在压缩、分区和保留策略变更后重新测量。`,
  }],
  ['冻结可回放范围', {
    title: '按固定快照重放指标窗口',
    language: 'Shell',
    code: `SNAPSHOT=$(iceberg snapshot --table prod.bronze_event | jq -r '.[] | select(.summary.source == "orders") | .snapshot-id' | head -n1)
spark-submit --class com.example.ReplayMetric \\
  --conf spark.sql.catalog.prod.snapshot-id="$SNAPSHOT" \\
  jobs/replay-metric.jar --metric gmv --window 2026-11-24T10:00/2026-11-24T10:15
iceberg snapshot --table prod.metric_snapshot | jq --arg s "$SNAPSHOT" '.[] | select(.summary.replay_source == $s)'`,
    output: `重放作业读取固定 snapshot-id 并生成带 replay_source 的新指标快照；相同输入重跑得到相同窗口结果和血缘。
失败边界：按当前最新表重跑会导致结果漂移；未固定代码、任务版本或源偏移的重放不能用于审计。`,
  }],
  ['数据对象稳定标识', {
    title: '用稳定 ID 连接指标和显示名',
    language: 'SQL',
    code: `CREATE TABLE data_object (
  id text PRIMARY KEY, object_type text NOT NULL, display_name text NOT NULL,
  domain_id text NOT NULL, owner text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO data_object VALUES
  ('obj:metric:gmv', 'metric', '成交总额', 'commerce', 'analytics-finance', now()),
  ('obj:field:paid_order_amount', 'field', '支付订单金额', 'commerce', 'payments-data', now());
UPDATE data_object SET display_name = 'GMV（含税费）' WHERE id = 'obj:metric:gmv';
SELECT id, object_type, display_name FROM data_object ORDER BY id;`,
    output: `显示名可变为 GMV（含税费），但 id=obj:metric:gmv 不变，血缘、权限和历史查询仍引用同一对象。
失败边界：使用显示名作为主键会在改名后断链；字段与指标必须有独立类型和所属域，不能复用名称猜测关系。`,
  }],
  ['schema 版本兼容演进', {
    title: '用消费者兼容检查约束 schema 变更',
    language: 'JSON',
    code: `{
  "type": "record",
  "name": "OrderPaid",
  "namespace": "dataflow.events",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount", "type": "long"},
    {"name": "currency", "type": "string", "default": "CNY"},
    {"name": "refundReason", "type": ["null", "string"], "default": null}
  ]
}
// curl -s http://schema-registry.test/compatibility/subjects/order-paid/versions/latest \\
//   -H 'content-type: application/vnd.schemaregistry.v1+json' --data @order-paid-v5.json`,
    output: `兼容接口返回 is_compatible=true，新增可选 refundReason 和带默认值的 currency 不破坏旧消费者。
失败边界：删除字段、重命名不带 alias 或把 long 改成 string 应被拒绝；Schema Registry 不可用时不能放行未知兼容性发布。`,
  }],
  ['异步任务返回状态', {
    title: '摄入任务返回可轮询的异步状态',
    language: 'TypeScript',
    code: `app.post('/ingestions', async (req, res) => {
  const job = await jobs.create({source: req.body.source, state: 'queued', requestedBy: req.user.id});
  await queue.enqueue('ingest-source', {jobId: job.id, source: req.body.source});
  res.status(202).json(job);
});
app.get('/ingestions/:id', async (req, res) => {
  const job = await jobs.get(req.params.id);
  if (!job) return res.status(404).json({code: 'JOB_NOT_FOUND'});
  res.json({id: job.id, state: job.state, stage: job.stage, retryable: job.state === 'failed' && job.error?.retryable});
});
console.log(await request('/ingestions').then((r) => r.json()));`,
    output: `创建接口返回 202、queued 和 job id；轮询返回 state、stage 与 retryable，失败不会伪装成数据已发布。
失败边界：提交成功不能作为摄入成功；任务必须保存批次、源偏移和错误阶段，前端不能只显示无限 loading。`,
  }],
  ['查询契约限制范围', {
    title: '服务端限制时间窗、粒度和扫描预算',
    language: 'TypeScript',
    code: `function validateMetricQuery(query: {metric: string; from: string; to: string; grain: string; maxBytes: number}) {
  const durationHours = (Date.parse(query.to) - Date.parse(query.from)) / 3_600_000;
  if (!['minute','hour','day'].includes(query.grain)) throw new Error('INVALID_GRAIN');
  if (durationHours > 24 * 31) throw new Error('QUERY_WINDOW_TOO_LARGE');
  if (query.maxBytes > 2_000_000_000) throw new Error('SCAN_BUDGET_EXCEEDED');
  return {metric: query.metric, bucket: query.grain, from: query.from, to: query.to, scanLimit: query.maxBytes};
}
console.log(validateMetricQuery({metric:'gmv', from:'2026-11-01', to:'2026-11-24', grain:'day', maxBytes:500_000_000}));`,
    output: `合法查询返回指标、bucket=day、时间窗和 scanLimit；超过 31 天或 2GB 扫描预算会返回稳定错误。
失败边界：只在前端限制时间范围可被 API 绕过；查询还必须校验指标权限、业务域和返回行数上限。`,
  }],
  ['前端只展示可行动状态', {
    title: '把新鲜度、质量和owner呈现为行动入口',
    language: 'TypeScript',
    code: `type MetricCard = {name: string; freshness: 'fresh' | 'stale'; quality: 'pass' | 'blocked'; owner: string; lastBatch: string};
export function toAction(card: MetricCard) {
  if (card.quality === 'blocked') return {label: '查看坏数据', href: '/quality?batch=' + card.lastBatch, severity: 'critical'};
  if (card.freshness === 'stale') return {label: '查看任务延迟', href: '/tasks?metric=' + card.name, severity: 'warning'};
  return {label: '查看血缘', href: '/lineage?metric=' + card.name, severity: 'normal'};
}
console.table([{name:'gmv', freshness:'stale', quality:'pass', owner:'analytics-finance', lastBatch:'b-7'}].map(toAction));`,
    output: `GMV 卡片生成“查看任务延迟”动作并标记 warning，用户能直接进入对应指标任务，而不是只看到红色图标。
失败边界：状态没有 owner 和批次时无法行动；前端不得把任务成功当数据成功，质量阻断应优先于普通血缘入口。`,
  }],
  ['分层保存明细与指标', {
    title: '按 Bronze、Silver 和指标快照分层',
    language: 'SQL',
    code: `CREATE TABLE bronze_event (source text, offset bigint, payload jsonb, ingested_at timestamptz, PRIMARY KEY (source, offset));
CREATE TABLE silver_order (order_id text PRIMARY KEY, amount numeric NOT NULL, status text NOT NULL, event_time timestamptz NOT NULL, batch_id text NOT NULL);
CREATE TABLE metric_snapshot (metric_id text, window_start timestamptz, window_end timestamptz, value numeric NOT NULL, task_version text NOT NULL, source_snapshot text NOT NULL);
INSERT INTO bronze_event VALUES ('orders', 1001, '{"orderId":"ord-42","amount":99.5}', now());
INSERT INTO silver_order VALUES ('ord-42', 99.5, 'paid', '2026-11-24T10:00:00Z', 'b-7');
SELECT metric_id, value, source_snapshot FROM metric_snapshot WHERE metric_id = 'gmv';`,
    output: `Bronze 保留原始事件，Silver 提供标准化订单，metric_snapshot 保存口径结果和来源快照；每层可独立追溯和重放。
失败边界：只保存最终指标无法修复源数据问题；Silver 清洗规则必须版本化，否则相同批次重跑结果不可解释。`,
  }],
  ['分区与文件布局服务查询', {
    title: '按事件日期和业务键分区',
    language: 'SQL',
    code: `CREATE TABLE prod.silver_orders (
  order_id string, event_time timestamp, event_date date, tenant_id string,
  amount decimal(18,2), status string
) USING iceberg
PARTITIONED BY (days(event_time), bucket(16, tenant_id))
TBLPROPERTIES ('write.target-file-size-bytes' = '134217728', 'write.distribution-mode' = 'hash');
EXPLAIN SELECT sum(amount) FROM prod.silver_orders
WHERE event_date BETWEEN date '2026-11-01' AND date '2026-11-24' AND tenant_id = 'tenant-a';`,
    output: `执行计划只扫描目标日期分区和 tenant-a 的 bucket，目标文件约 128MB，避免大量小文件全表扫描。
失败边界：按高基数字段无限分区会制造小文件；查询不携带分区条件时扫描成本不可控，需要服务端预算和拒绝策略。`,
  }],
  ['幂等批次与快照', {
    title: '用 MERGE 重放同一批次',
    language: 'SQL',
    code: `MERGE INTO prod.silver_orders target
USING (
  SELECT order_id, amount, status, event_time, 'orders:1001:20261124' AS batch_key
  FROM staging_orders WHERE ingest_batch = 'orders:1001:20261124'
) source
ON target.order_id = source.order_id
WHEN MATCHED AND target.batch_key <> source.batch_key THEN UPDATE SET amount = source.amount, status = source.status, batch_key = source.batch_key
WHEN NOT MATCHED THEN INSERT (order_id, amount, status, event_time, batch_key) VALUES (source.order_id, source.amount, source.status, source.event_time, source.batch_key);
SELECT count(*) FROM prod.silver_orders WHERE order_id = 'ord-42';`,
    output: `同一 batch_key 重放不会产生重复 ord-42，count=1；新批次可更新字段并保留源批次键。
失败边界：MERGE 依据不稳定时间戳会重复写入；重放前要固定源 offset、校验和与代码版本，并记录被替换行数。`,
  }],
  ['血缘和任务元数据独立', {
    title: '分别记录字段血缘与任务状态',
    language: 'SQL',
    code: `INSERT INTO field_lineage (source_object, target_object, task_id, task_version, transform)
VALUES ('obj:field:paid_order_amount', 'obj:field:gmv_amount', 'task:gmv-daily', 'v12', 'sum by event_date');
INSERT INTO task_run (task_id, task_version, run_id, state, input_snapshot, output_snapshot, started_at)
VALUES ('task:gmv-daily', 'v12', 'run-77', 'succeeded', 'iceberg:bronze@88f', 'iceberg:metric@91a', now());
SELECT f.source_object, f.target_object, t.state, t.input_snapshot, t.output_snapshot
FROM field_lineage f JOIN task_run t ON t.task_id = f.task_id AND t.task_version = f.task_version
WHERE f.target_object = 'obj:field:gmv_amount' AND t.run_id = 'run-77';`,
    output: `查询返回金额字段转换、任务 succeeded 以及输入/输出快照；血缘关系和运行状态可在同一 run 版本下核对。
失败边界：把任务日志塞进血缘文本无法查询；状态、代码版本和快照必须分开保存，否则重跑后历史会被覆盖。`,
  }],
  ['迁移保留双读', {
    title: '新旧金额字段双读并比较差异',
    language: 'SQL',
    code: `WITH comparison AS (
  SELECT order_id, amount_legacy, amount_v2,
    abs(coalesce(amount_legacy, 0) - coalesce(amount_v2, 0)) AS difference
  FROM silver_order_migration
  WHERE batch_id = 'migration-20261124'
)
SELECT count(*) AS total, sum(CASE WHEN difference > 0.001 THEN 1 ELSE 0 END) AS mismatches,
  max(difference) AS max_difference
FROM comparison;
SELECT order_id, amount_legacy, amount_v2, difference FROM comparison WHERE difference > 0.001 LIMIT 20;
-- mismatches=0 才能切换消费者，否则保留 legacy 并修复转换。`,
    output: `汇总返回 total、mismatches 和 max_difference；样本查询列出超阈值订单，只有 mismatches=0 才允许切换。
失败边界：只看 dbt 构建成功不能证明金额未漂移；双读期间要覆盖退款、负数、币种和空值样本。`,
  }],
  ['接入、计算、服务分层', {
    title: '用目录与脚本固定数据模块边界',
    language: 'PowerShell',
    code: `$layout = @(
  'jobs/ingest-orders.ts',
  'jobs/stream-order-cleaner.ts',
  'jobs/batch-metric-gmv.sql',
  'services/metric-query.ts',
  'web/metric-detail.vue',
  'contracts/order-event.v4.json'
)
$layout | ForEach-Object { if (-not (Test-Path $_)) { throw "missing module: $_" } }
$owners = Get-Content dataflow-owners.json | ConvertFrom-Json
foreach ($module in $owners.modules) {
  if (-not $module.owner) { throw "owner missing for $($module.path)" }
}
$layout | Group-Object { Split-Path $_ -Parent } | Select-Object Name,Count`,
    output: `每个接入、计算、查询和前端文件存在且 owner 完整，最终按目录输出模块数量；缺文件或缺 owner 时脚本失败。
失败边界：模块目录存在但接入任务直接调用指标 API 会破坏依赖方向；共享契约必须版本化并由计算与服务共同引用。`,
  }],
  ['本地依赖固定版本', {
    title: '锁定 Kafka、Iceberg 与 Flink 本地版本',
    language: 'YAML',
    code: `services:
  kafka:
    image: bitnami/kafka:3.8.0
    environment: {KAFKA_CFG_NODE_ID: 1, KAFKA_CFG_PROCESS_ROLES: broker,controller}
  minio:
    image: minio/minio:RELEASE.2026-10-31T00-00-00Z
    command: server /data --console-address :9001
  iceberg-rest:
    image: tabulario/iceberg-rest:1.6.1
    environment: {CATALOG_WAREHOUSE: s3://warehouse/, AWS_ACCESS_KEY_ID: minio, AWS_SECRET_ACCESS_KEY: minio-secret}
  flink-job:
    image: flink:1.20.1-scala_2.12-java17
    command: ["flink", "run", "/opt/jobs/replay.jar"]
versions:
  table-format: iceberg-v2
  job-jar-sha256: 8fa3c9`,
    output: `compose 启动后 Kafka、MinIO、Iceberg REST 和 Flink 版本固定，Flink 能读取 iceberg-v2 表并使用指定 job jar。
失败边界：latest 标签或不同 Scala 版本可能让表读写失败；本地测试必须断言表格式、连接器和 job jar 校验和。`,
  }],
  ['配置和状态可复现', {
    title: '启动前校验 checkpoint 与表目录',
    language: 'YAML',
    code: `flink:
  checkpointInterval: 30s
  minPauseBetweenCheckpoints: 10s
  stateBackend: s3://dataflow-state/checkpoints
  exactOnce: true
catalog:
  type: rest
  uri: http://iceberg-rest:8181
  warehouse: s3://warehouse/
inputs:
  ordersTopic: orders.v4
  paymentsTopic: payments.v3
validation:
  rejectIfCheckpointMissing: true
  rejectIfCatalogVersionMismatch: true
command: pnpm dataflow:validate --config conf/local.yaml`,
    output: `校验通过时输出 checkpoint 路径、Iceberg catalog URI、输入 topic 和 exact-once=true；缺配置或版本不匹配时退出非零。
失败边界：checkpoint 与数据目录混用会让恢复读到错误状态；本地测试必须使用隔离 warehouse，不能写开发共享目录。`,
  }],
  ['测试覆盖批流边界', {
    title: '用固定事件验证迟到和 schema 变化',
    language: 'TypeScript',
    code: `const cases = [
  {name: 'on-time paid order', eventTime: '10:00:05', ingestedAt: '10:00:07', expectedMetric: 1},
  {name: 'late within watermark', eventTime: '09:59:40', ingestedAt: '10:01:20', expectedMetric: 1},
  {name: 'late beyond watermark', eventTime: '09:50:00', ingestedAt: '10:10:00', expectedMetric: 0},
  {name: 'duplicate offset', eventTime: '10:00:05', ingestedAt: '10:00:09', expectedMetric: 1},
];
for (const item of cases) {
  const result = await runWindowFixture(item);
  if (result.metricDelta !== item.expectedMetric) throw new Error(item.name + ': expected ' + item.expectedMetric);
}
console.log({cases: cases.length, schemaVersions: [3, 4], passed: true});`,
    output: `四个固定样本分别覆盖准时、允许迟到、超迟和重复位移，窗口结果符合预期；输出 cases=4、schemaVersions=[3,4]。
失败边界：只测正常事件无法发现水位线错误；schema 新增可选字段和删除字段必须分别进入回归并有可重放输入。`,
  }],
  ['README 跑通一条指标', {
    title: '从事件到 GMV 的一键本地验收',
    language: 'Shell',
    code: `set -euo pipefail
pnpm dataflow:up
pnpm dataflow:migrate
pnpm dataflow:seed --source orders --file fixtures/orders-paid.jsonl
pnpm flink:submit --job order-cleaner --checkpoint local
pnpm dbt:run --select gmv
curl -fsS 'http://localhost:8090/metrics/gmv?from=2026-11-24T10:00:00Z&to=2026-11-24T10:15:00Z' | jq .
curl -fsS http://localhost:8090/lineage/metric:gmv | jq '.upstream | length'
psql "$DATABASE_URL" -Atc "select rule, failures from quality_result order by created_at desc limit 3"`,
    output: `GMV 查询返回窗口数值和快照 ID，血缘 upstream 数大于 0，质量结果最近三条可读；任一命令失败会立即停止。
失败边界：README 只启动容器不算通过；必须看到事件、任务、指标、血缘和质量结果，且失败时能定位具体批次。`,
  }],
  ['接入先校验和去重', {
    title: '按源位移去重并隔离坏事件',
    language: 'TypeScript',
    code: `async function ingest(event: RawEvent) {
  const parsed = orderEventSchema.safeParse(event.value);
  if (!parsed.success) {
    await quarantine.write({source: event.source, offset: event.offset, reason: parsed.error.issues[0].path.join('.'), raw: event.value});
    return {accepted: false, quarantined: true};
  }
  const inserted = await db.bronzeEvent.insertIgnore({source: event.source, offset: event.offset, payload: parsed.data});
  return {accepted: inserted.changedRows === 1, duplicate: inserted.changedRows === 0, batch: event.source + ':' + event.offset};
}
console.log(await ingest({source:'orders', offset:1001, value:{orderId:'ord-42', amount:99.5, status:'paid'}}));`,
    output: `首次事件 accepted=true 并写入 bronze；重复 offset 返回 duplicate=true；缺字段事件进入隔离区并记录字段路径。
失败边界：先写业务表再去重会产生不可逆重复；坏数据不能静默丢弃，必须保存原值、源位移和后续补数入口。`,
  }],
  ['窗口处理定义水位线', {
    title: '用事件时间水位线生成 15 分钟 GMV',
    language: 'SQL',
    code: `CREATE TABLE gmv_15m AS
SELECT
  window_start,
  window_end,
  sum(amount) AS gmv,
  count(*) AS paid_orders
FROM TABLE(
  TUMBLE(TABLE orders_cleaned, DESCRIPTOR(event_time), INTERVAL '15' MINUTE)
)
WHERE status = 'paid'
GROUP BY window_start, window_end;
-- orders_cleaned: WATERMARK FOR event_time AS event_time - INTERVAL '5' MINUTE
SELECT * FROM gmv_15m ORDER BY window_start DESC LIMIT 4;`,
    output: `窗口按事件时间每 15 分钟聚合，水位线允许 5 分钟迟到；查询最近四个窗口的 GMV 和支付订单数。
失败边界：超过水位线的数据不能悄悄计入旧窗口，应进入补偿表并告警；事件时间为空或远超未来要隔离。`,
  }],
  ['checkpoint 保障恢复', {
    title: '从最近成功 checkpoint 恢复任务',
    language: 'Shell',
    code: `flink list -r | rg 'order-cleaner'
CHECKPOINT=$(aws s3 ls s3://dataflow-state/checkpoints/order-cleaner/ --recursive | sort | tail -n 1 | awk '{print $4}')
flink run -d -s "s3://dataflow-state/$CHECKPOINT" jobs/order-cleaner.jar --exactly-once
flink list -r -j jobs/order-cleaner.jar | tee running.txt
rg 'RUNNING' running.txt
psql "$DATABASE_URL" -Atc "select max(source_offset) from restore_audit where task='order-cleaner'"`,
    output: `作业从指定 checkpoint 启动并进入 RUNNING，restore_audit 记录恢复位移；下游指标可从恢复点继续更新。
失败边界：checkpoint 文件存在不代表状态可用，需验证元数据和源 offset；恢复后重复范围必须通过幂等和指标对账解释。`,
  }],
  ['质量失败阻断指标发布', {
    title: '事务内阻止质量失败批次发布',
    language: 'SQL',
    code: `BEGIN;
SELECT set_config('dataflow.batch_id', 'b-20261124-03', true);
DO $$
DECLARE failed integer;
BEGIN
  SELECT coalesce(sum(failed_rows), 0) INTO failed FROM quality_result WHERE batch_id = current_setting('dataflow.batch_id');
  IF failed > 0 THEN RAISE EXCEPTION 'QUALITY_GATE_BLOCKED batch=%', current_setting('dataflow.batch_id'); END IF;
  UPDATE metric_publication SET state = 'published' WHERE batch_id = current_setting('dataflow.batch_id');
END $$;
COMMIT;`,
    output: `失败行数大于 0 时事务抛 QUALITY_GATE_BLOCKED，metric_publication 保持 blocked；修复并补算后才允许发布。
失败边界：质量结果异步写入后再发布会产生竞态，必须同事务或同批次门禁；阻断要通知指标负责人并提供样本。`,
  }],
  ['指标查询从快照读取', {
    title: '返回指标值同时返回口径版本和快照',
    language: 'SQL',
    code: `SELECT
  m.metric_id,
  m.window_start,
  m.window_end,
  m.value,
  d.version AS definition_version,
  m.task_version,
  m.source_snapshot
FROM metric_snapshot m
JOIN metric_definition d ON d.metric_id = m.metric_id AND d.version = m.definition_version
WHERE m.metric_id = 'gmv'
  AND m.window_start >= '2026-11-24T10:00:00Z'
  AND m.window_end <= '2026-11-24T11:00:00Z'
ORDER BY m.window_start;`,
    output: `每行同时返回 value、definition_version、task_version 和 source_snapshot，用户能知道数字由哪套口径和哪些数据生成。
失败边界：只返回数值无法解释口径变化；查询不同快照时不能把多个版本结果合并成一条无来源时间序列。`,
  }],
  ['指标页突出口径和新鲜度', {
    title: '指标卡显示负责人、来源和更新时间',
    language: 'Vue',
    code: `<script setup lang="ts">
defineProps<{metric:{name:string;owner:string;definitionVersion:number;freshness:string;quality:'pass'|'blocked';lastUpdated:string}}>();
</script>
<template>
  <article aria-labelledby="metric-name">
    <h2 id="metric-name">{{ metric.name }} <small>v{{ metric.definitionVersion }}</small></h2>
    <p>负责人：{{ metric.owner }}</p>
    <p :class="metric.quality">质量：{{ metric.quality }}</p>
    <p>最近更新：<time :datetime="metric.lastUpdated">{{ metric.lastUpdated }}</time></p>
    <p v-if="metric.freshness === 'stale'" role="alert">该指标超过新鲜度目标，请查看任务延迟。</p>
    <a :href="'/lineage?metric=' + metric.name">查看来源与血缘</a>
  </article>
</template>`,
    output: `卡片首屏显示指标名、口径版本、负责人、质量和更新时间；过期时出现可操作告警并提供血缘入口。
失败边界：只展示大数字不能说明口径；过期或失败状态必须来自服务端快照，不能依赖前端倒计时猜算。`,
  }],
  ['质量异常可钻取', {
    title: '从指标异常下钻到失败样本',
    language: 'SQL',
    code: `SELECT q.batch_id, q.rule, q.failed_rows, q.action, s.sample,
  array_agg(DISTINCT m.metric_id) AS affected_metrics
FROM quality_result q
LEFT JOIN quality_sample s ON s.batch_id = q.batch_id AND s.rule = q.rule
LEFT JOIN metric_publication m ON m.batch_id = q.batch_id
WHERE q.created_at >= now() - interval '2 hours'
GROUP BY q.batch_id, q.rule, q.failed_rows, q.action, s.sample
ORDER BY q.failed_rows DESC;
SELECT status, count(*) FROM task_run WHERE batch_id = 'b-20261124-03' GROUP BY status;`,
    output: `结果按失败行数排序，返回规则、样本和受影响指标；任务状态按 failed/succeeded 分布，可直接定位阻断范围。
失败边界：只显示“质量失败”没有批次、规则和样本无法修复；样本展示前要脱敏并限制访问权限。`,
  }],
  ['血缘图支持文本替代', {
    title: '同一血缘提供图形和键盘列表',
    language: 'Vue',
    code: `<script setup lang="ts">
const nodes = [
  {id:'orders', label:'orders 事件', type:'source'},
  {id:'silver', label:'silver_orders', type:'table'},
  {id:'gmv', label:'GMV', type:'metric'},
];
</script>
<template>
  <nav aria-label="血缘列表">
    <ol>
      <li v-for="node in nodes" :key="node.id">
        <a :href="'/data-object/' + node.id" @keydown.enter.prevent="$router.push('/data-object/' + node.id)">{{ node.label }}</a>
      </li>
    </ol>
  </nav>
  <figure aria-labelledby="lineage-caption"><figcaption id="lineage-caption">orders → silver_orders → GMV</figcaption></figure>
</template>`,
    output: `屏幕阅读器和键盘用户可通过有序列表进入 orders、silver_orders、GMV；图形有等价文字路径，不依赖颜色。
失败边界：图形节点不可聚焦或无文字替代会让关键血缘不可用；隐藏节点时必须保留其关系说明和权限状态。`,
  }],
  ['任务状态与日志分层', {
    title: '分别展示阶段、批次错误和日志摘要',
    language: 'TypeScript',
    code: `type TaskView = {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'ingest' | 'clean' | 'aggregate' | 'publish';
  batchId: string;
  error?: {code: string; message: string; retryable: boolean};
  logs: {summary: string; url: string};
};
function renderTask(task: TaskView) {
  return {headline: task.state + ' / ' + task.stage, batch: task.batchId, error: task.error?.code ?? null, logSummary: task.logs.summary};
}
console.log(renderTask({state:'failed',stage:'clean',batchId:'b-7',error:{code:'QUALITY_GATE_BLOCKED',message:'negative amount',retryable:false},logs:{summary:'12 rows quarantined',url:'s3://logs/b-7'}}));`,
    output: `输出 headline=failed / clean、batch=b-7、error=QUALITY_GATE_BLOCKED 和日志摘要 12 rows quarantined。
失败边界：任务 succeeded 地完成 ingest 不等于指标已发布；日志链接必须受权限保护，错误码不能只存在于长文本。`,
  }],
  ['移动端保持可扫描', {
    title: '窄屏用分组列表展示指标状态',
    language: 'CSS',
    code: `.metric-list { display: grid; gap: 12px; }
.metric-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px; border-bottom: 1px solid #d8dee9; }
.metric-row h3, .metric-row p { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.metric-meta { display: flex; flex-wrap: wrap; gap: 6px; color: #52606d; font-size: .875rem; }
@media (max-width: 420px) {
  .metric-row { grid-template-columns: 1fr; }
  .metric-status { justify-self: start; }
}
/* 375px 下时间、负责人、质量和新鲜度都保留，不使用横向滚动宽表。 */`,
    output: `375px 视口下每行改为单列，指标名可换行，状态在下一行左对齐；时间、owner、质量和新鲜度没有被截断。
失败边界：窄屏隐藏负责人或新鲜度会失去可行动性；横向滚动宽表和固定像素宽度都不合格。`,
  }],
  ['数据测试使用固定样本', {
    title: '用固定订单样本断言指标值',
    language: 'SQL',
    code: `INSERT INTO fixture_orders (order_id, amount, status, event_time, fixture_set) VALUES
  ('o1', 100.00, 'paid', '2026-11-24T10:00:00Z', 'gmv-fixture-v1'),
  ('o2', 50.00, 'refunded', '2026-11-24T10:01:00Z', 'gmv-fixture-v1'),
  ('o3', -3.00, 'paid', '2026-11-24T10:02:00Z', 'gmv-fixture-v1'),
  ('o4', 25.00, 'paid', '2026-11-24T10:03:00Z', 'gmv-fixture-v1');
SELECT fixture_set, count(*) AS rows,
  sum(CASE WHEN status = 'paid' AND amount > 0 THEN amount ELSE 0 END) AS expected_gmv,
  count(*) FILTER (WHERE amount < 0) AS invalid_rows
FROM fixture_orders WHERE fixture_set = 'gmv-fixture-v1' GROUP BY fixture_set;`,
    output: `固定样本输出 rows=4、expected_gmv=125.00、invalid_rows=1；同一输入应每次得到相同明细和指标结果。
失败边界：只用生产随机样本会让回归不可重复；固定样本中的坏数据必须和期望阻断、隔离、补算结果一起保存。`,
  }],
  ['安全覆盖数据域与字段', {
    title: '用行级安全限制业务域和脱敏字段',
    language: 'SQL',
    code: `ALTER TABLE metric_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_domain_read ON metric_snapshot FOR SELECT USING (
  domain_id IN (SELECT domain_id FROM data_role_domain WHERE role = current_user)
);
SELECT metric_id, value, source_snapshot
FROM metric_snapshot
WHERE metric_id = 'gmv';
SELECT mask_email(customer_email), mask_order_id(order_id)
FROM quality_sample
WHERE batch_id = 'b-7';
-- 分析师只看到 commerce 域；质量接口不返回原始邮箱。`,
    output: `commerce 分析师能读到 GMV 快照，其他域返回 0 行；质量样本中的邮箱和订单号脱敏，血缘仍可定位字段。
失败边界：只在 API 路由过滤域不够，SQL、导出、血缘和质量样本入口都要执行权限；权限变化后不能使用旧缓存。`,
  }],
  ['性能记录扫描与延迟', {
    title: '记录查询扫描字节与尾延迟',
    language: 'Shell',
    code: `START=$(date +%s%3N)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "EXPLAIN (ANALYZE, BUFFERS) SELECT metric_id, sum(value) FROM metric_snapshot WHERE event_date BETWEEN '2026-11-01' AND '2026-11-24' GROUP BY metric_id" > plan.txt
END=$(date +%s%3N)
BYTES=$(rg -o 'Buffers: shared hit=[0-9]+' plan.txt | awk -F= '{print $2 * 8192}')
ROWS=$(psql "$DATABASE_URL" -Atc "select count(*) from metric_snapshot where event_date between '2026-11-01' and '2026-11-24'")
printf '{"elapsed_ms":%d,"shared_bytes":%s,"input_rows":%s,"task_version":"gmv-v12"}\\n' "$((END-START))" "$BYTES" "$ROWS" > perf.json`,
    output: `perf.json 记录 elapsed_ms、shared_bytes、input_rows 和 task_version；优化前后可比较扫描量和尾延迟。
失败边界：只看墙钟时间会受缓存影响，必须结合 Buffers/scan bytes、输入量和配置；数据量变化时要做同口径基线。`,
  }],
  ['schema 演进回归', {
    title: '同时运行旧消费者与新 schema',
    language: 'Shell',
    code: `set -euo pipefail
spark-sql -f tests/schema/v5-fixture.sql
spark-submit --class com.example.OrderConsumerV4 consumers/order-consumer-v4.jar \\
  --input s3://fixtures/order-v5.jsonl --output /tmp/consumer-v4
spark-submit --class com.example.OrderConsumerV5 consumers/order-consumer-v5.jar \\
  --input s3://fixtures/order-v5.jsonl --output /tmp/consumer-v5
diff <(jq -S . /tmp/consumer-v4/output.jsonl) <(jq -S . /tmp/consumer-v5/output.jsonl)
echo 'schema v5 legacy and current consumers agree'`,
    output: `旧消费者能读取带可选字段的 v5 事件，新旧输出 diff 为空，最终打印两代消费者结果一致。
失败边界：只运行最新消费者不能证明兼容；删除字段、类型收窄和无默认新增字段必须在发布门禁前失败。`,
  }],
  ['恢复演练核对指标', {
    title: 'checkpoint 恢复后对账数量',
    language: 'SQL',
    code: `WITH source_counts AS (
  SELECT count(DISTINCT order_id) AS source_orders
  FROM bronze_event WHERE source = 'orders' AND event_time BETWEEN '2026-11-24T10:00:00Z' AND '2026-11-24T11:00:00Z'
), silver_counts AS (
  SELECT count(DISTINCT order_id) AS silver_orders
  FROM silver_order WHERE event_time BETWEEN '2026-11-24T10:00:00Z' AND '2026-11-24T11:00:00Z'
), metric_counts AS (
  SELECT sum(paid_orders) AS metric_orders, sum(gmv) AS metric_gmv
  FROM metric_snapshot WHERE window_start >= '2026-11-24T10:00:00Z' AND window_end <= '2026-11-24T11:00:00Z'
)
SELECT s.source_orders, l.silver_orders, m.metric_orders, m.metric_gmv,
  s.source_orders - l.silver_orders AS missing_silver,
  l.silver_orders - m.metric_orders AS missing_metric
FROM source_counts s, silver_counts l, metric_counts m;`,
    output: `对账返回 source/silver/metric 三层订单数、GMV 及差量；恢复正常时 missing_silver 与 missing_metric 均为 0。
失败边界：只在任务日志看到 recovery 完成不算通过；重复或缺失必须能按源偏移解释，并保存恢复前 checkpoint 和补数范围。`,
  }],
  ['任务和 API 独立制品', {
    title: '为流任务和指标 API 固定制品元数据',
    language: 'Dockerfile',
    code: `FROM eclipse-temurin:21-jre AS job
COPY flink-job.jar /opt/job.jar
LABEL org.opencontainers.image.revision=$GIT_SHA \\
  dataflow.component=flink-job \\
  dataflow.table-format=iceberg-v2 \\
  dataflow.checkpoint-version=checkpoint-v3

FROM node:24-slim AS api
COPY dist /app
LABEL org.opencontainers.image.revision=$GIT_SHA \\
  dataflow.component=metric-api \\
  dataflow.metric-registry=gmv-v12
CMD ["node", "/app/server.js"]
# docker image inspect ... --format '{{json .Config.Labels}}'`,
    output: `image inspect 返回 component、revision、table-format、checkpoint-version 或 metric-registry，任务和 API 可独立追踪与回滚。
失败边界：两个组件共用一个 latest 标签无法判断表格式与指标版本；标签必须来自构建参数并写入发布清单。`,
  }],
  ['发布检查依赖契约', {
    title: '发布前验证 Kafka、对象存储和目录权限',
    language: 'PowerShell',
    code: `$checks = @{
  kafka = (kafka-topics.sh --bootstrap-server $env:KAFKA_BOOTSTRAP --list | Select-String '^orders.v4$')
  objects = (aws s3 ls s3://warehouse/dataflow/ | Select-Object -First 1)
  catalog = (curl.exe -fsS http://iceberg-rest:8181/v1/config | ConvertFrom-Json)
  schedule = (curl.exe -fsS http://scheduler:8080/api/health | ConvertFrom-Json)
}
if (-not $checks.kafka) { throw 'missing orders.v4 topic' }
if (-not $checks.objects) { throw 'warehouse not readable' }
if ($checks.catalog.defaults.'warehouse' -ne 's3://warehouse/') { throw 'catalog warehouse mismatch' }
$checks | ConvertTo-Json | Set-Content dependency-contract.json`,
    output: `四项依赖检查通过，dependency-contract.json 保存 topic、warehouse、catalog 和 scheduler 健康结果；任一缺失则发布失败。
失败边界：只看容器 running 不代表权限和契约可用；发布后表目录变化或主题 ACL 不匹配应阻止任务启动。`,
  }],
  ['指标覆盖新鲜度质量成本', {
    title: '同屏查询新鲜度、质量与扫描成本',
    language: 'PromQL',
    code: `max by (metric) (dataflow_metric_freshness_seconds)
sum by (rule) (increase(dataflow_quality_failed_rows_total[1h]))
histogram_quantile(0.95, sum by (le, metric) (rate(dataflow_query_scan_bytes_bucket[30m])))
sum by (task) (increase(dataflow_task_cpu_seconds_total[1h]))

# 关键告警
# ALERT DataFreshnessBurn: dataflow_metric_freshness_seconds{metric="gmv"} > 900 FOR 10m
# ALERT QualityBlocked: dataflow_quality_failed_rows_total{rule="amount_non_negative"} > 0
# ALERT ScanBudgetBurn: dataflow_query_scan_bytes > 2000000000`,
    output: `同一仪表盘返回各指标新鲜度、失败行、查询扫描 P95 和任务 CPU；GMV 过期、质量失败或超扫描预算分别告警。
失败边界：只关注 Kafka lag 会漏掉质量和查询成本；高基数 metric/rule 标签需要控制数量和保留时间。`,
  }],
  ['灰度按指标域执行', {
    title: '先灰度支付域并比较新旧口径',
    language: 'SQL',
    code: `BEGIN;
UPDATE metric_rollout SET version = 'v13', traffic_percent = 10
WHERE domain_id = 'payments' AND metric_id IN ('payment_success_rate', 'refunds');
INSERT INTO rollout_comparison (metric_id, old_value, new_value, difference_pct, checked_at)
SELECT o.metric_id, o.value, n.value,
  abs(o.value - n.value) / nullif(abs(o.value), 0) * 100, now()
FROM metric_snapshot o
JOIN metric_snapshot n ON n.metric_id = o.metric_id AND n.window_start = o.window_start
WHERE o.definition_version = 12 AND n.definition_version = 13 AND o.window_start = '2026-11-24T10:00:00Z';
COMMIT;`,
    output: `支付域先切 10% 流量，rollout_comparison 记录新旧值差异；差异在阈值内才扩大，其他域仍读旧版本。
失败边界：灰度只看请求成功不看指标数值会误判；差异过大要回切定义版本并保留对比快照。`,
  }],
  ['回滚保留旧快照', {
    title: '回滚指标版本并保留旧 Iceberg 快照',
    language: 'Shell',
    code: `OLD=$(iceberg snapshot --table prod.metric_snapshot | jq -r '.[] | select(.summary.definition_version == "v12") | .snapshot-id' | head -n1)
CURRENT=$(iceberg current-snapshot --table prod.metric_snapshot | jq -r .snapshot-id)
iceberg set-current-snapshot --table prod.metric_snapshot --snapshot-id "$OLD"
psql "$DATABASE_URL" -c "update metric_definition set status='retired' where metric_id='gmv' and version=13;"
curl -fsS 'http://localhost:8090/metrics/gmv?from=2026-11-24T10:00:00Z&to=2026-11-24T11:00:00Z' | jq '{value,definitionVersion,snapshot}'
echo "rollback snapshot from $CURRENT to $OLD"`,
    output: `指标 API 返回 v12 定义和旧 snapshot id，旧分区仍可查询；回滚操作记录 current→old 快照。
失败边界：只切应用版本不改指标定义会继续算错；旧快照数据保留策略不足时回滚可能无数据，需定期演练。`,
  }],
  ['上游断流演练新鲜度告警', {
    title: '停止订单源并验证新鲜度告警',
    language: 'Shell',
    code: `kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders.v4 < /dev/null &
PRODUCER_PID=$!
sleep 65
curl -fsS -G http://prometheus.test/api/v1/query \\
  --data-urlencode 'query=dataflow_metric_freshness_seconds{metric="gmv"}' | jq '.data.result[0].value[1]'
kill $PRODUCER_PID
pnpm dataflow:replay --source orders --from-offset 1099
curl -fsS http://localhost:8090/metrics/gmv?window=latest | jq '{freshnessSeconds,value,snapshot}'
echo 'source outage recovered without duplicate batch'`,
    output: `断流后 freshness 指标超过阈值并触发告警，恢复按固定 offset 重放，GMV 更新且没有重复批次。
失败边界：只恢复 producer 不补数据会造成永久缺口；重放前要固定源位移和计划，重放后必须对账数量和金额。`,
  }],
  ['坏数据演练阻断发布', {
    title: '注入负金额后隔离并阻断 GMV',
    language: 'Shell',
    code: `printf '%s\\n' '{"orderId":"bad-1","amount":-20,"status":"paid","eventTime":"2026-11-24T10:05:00Z"}' | \\
  kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders.v4
sleep 10
curl -fsS http://localhost:8090/metrics/gmv?window=latest | jq '{state,error}'
psql "$DATABASE_URL" -Atc "select rule, failed_rows, action from quality_result order by created_at desc limit 1"
psql "$DATABASE_URL" -Atc "select count(*) from quarantine_event where reason='amount_non_negative'"
echo 'bad event quarantined and gmv publication blocked'`,
    output: `指标接口返回 state=blocked 和 error=QUALITY_GATE_BLOCKED；质量结果记录 amount_non_negative，隔离区至少有一条原始事件。
失败边界：仅告警不阻断会让错误金额进入 GMV；修复后补算必须使用原批次血缘并记录质量复核人。`,
  }],
  ['checkpoint 故障恢复', {
    title: '模拟坏 checkpoint 并从上一快照恢复',
    language: 'Shell',
    code: `set -euo pipefail
BAD=$(aws s3 ls s3://dataflow-state/checkpoints/order-cleaner/ --recursive | sort | tail -n 1 | awk '{print $4}')
aws s3 cp "s3://dataflow-state/$BAD" /tmp/checkpoint-backup
aws s3 cp /tmp/corrupted-checkpoint "s3://dataflow-state/$BAD"
flink run -d -s "s3://dataflow-state/$BAD" jobs/order-cleaner.jar || echo 'restore rejected as expected'
GOOD=$(aws s3 ls s3://dataflow-state/checkpoints/order-cleaner/ --recursive | sort | tail -n 2 | head -n 1 | awk '{print $4}')
flink run -d -s "s3://dataflow-state/$GOOD" jobs/order-cleaner.jar
aws s3 cp /tmp/checkpoint-backup "s3://dataflow-state/$BAD"
echo "checkpoint fallback from $BAD to $GOOD"`,
    output: `坏 checkpoint 恢复被拒绝，随后从上一有效 checkpoint 启动成功；原文件已备份，恢复差异记录到运行日志。
失败边界：不能删除坏 checkpoint 掩盖问题；恢复后需说明重复、丢失和补数范围，并更新恢复演练记录。`,
  }],
  ['存储与成本演练', {
    title: '压缩小文件并复测扫描成本',
    language: 'SQL',
    code: `SELECT count(*) AS file_count, sum(file_size_in_bytes) AS bytes
FROM prod.silver_orders.files WHERE partition.event_date = DATE '2026-11-24';
CALL prod.system.rewrite_data_files(table => 'prod.silver_orders', options => map('target-file-size-bytes', '134217728'));
SELECT count(*) AS file_count, sum(file_size_in_bytes) AS bytes
FROM prod.silver_orders.files WHERE partition.event_date = DATE '2026-11-24';
EXPLAIN ANALYZE SELECT sum(amount) FROM prod.silver_orders WHERE event_date = DATE '2026-11-24';
-- 保留 30 天后过期旧快照，但先确认审计和回放窗口。`,
    output: `压缩前后对比文件数与字节数，文件数下降且目标文件接近 128MB；同一查询扫描量下降，成本账本记录动作和时间。
失败边界：过度合并大文件会增加小窗口重写成本；过期快照前必须确认审计、回滚和法定保留要求。`,
  }],
  ['答辩解释可信数据链', {
    title: '生成指标、质量、血缘和成本证据包',
    language: 'TypeScript',
    code: `const evidence = {
  metric: await queryMetric('gmv', '2026-11-24T10:00:00Z', '2026-11-24T10:15:00Z'),
  lineage: await queryLineage('metric:gmv'),
  quality: await queryQuality('b-20261124-03'),
  replay: await readJson('artifacts/gmv-replay.json'),
  costs: {scanBytes: await queryScanBytes('gmv'), p95FreshnessSeconds: await queryFreshnessP95('gmv')},
  decisions: ['event-time windows', 'quarantine before publish', 'snapshot plus lineage', 'domain-scoped access'],
};
await writeJson('artifacts/dataflow-defense.json', evidence);
console.log({metricVersion: evidence.metric.definitionVersion, upstreamNodes: evidence.lineage.length, replayOk: evidence.replay.matched});`,
    output: `证据包含指标值/口径、上游血缘、质量批次、重放结果、扫描成本和新鲜度 P95，并记录关键架构取舍。
失败边界：只有 BI 截图不足以证明可信；证据必须引用版本、快照、批次和重放结果，坏数据与回滚演练也要包含。`,
  }],
];

const DATAFLOW_STEP_EXAMPLES = Object.fromEntries(
  DATAFLOW_EXAMPLE_ENTRIES,
) as Readonly<Record<string, LearningV2LessonExample>>;

export const PROGRAMMING_PROJECT_TRAINING_BATCH_09_COURSES =
  DATAFLOW_COURSES_BASE.map((item) => ({
    ...item,
    steps: item.steps.map((step) => {
      const suffix = DATAFLOW_STEP_SUFFIXES[step[0]];
      const authoredBody = suffix ? `${step[1]} ${suffix}` : step[1];
      const body = authoredBody.length >= 100
        ? authoredBody
        : `${authoredBody} 并保留“${step[2]}”对应的数据批次、校验结果和负责人。`;
      return [
        step[0],
        body,
        step[2],
        DATAFLOW_STEP_EXAMPLES[step[0]],
      ] as const;
    }),
  }));
