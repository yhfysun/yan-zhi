// 软件工程、架构与项目交付 · 逐课手写教案
// 课程名必须与 programs.ts 基于 language-catalogs.ts 生成的名称完全一致。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P14 · 独立语言课程' as const;
const seName = (stage: string, topic: string) => `软件架构与交付 · ${stage}：${topic}`;

type StepExample = NonNullable<ProgrammingStepSeed[3]>;

const seExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): StepExample => ({ title, language, code, output });

function withSoftwareExamples(
  courses: readonly ProgrammingCourseSeed[],
  examples: Readonly<Record<string, StepExample>>,
): readonly ProgrammingCourseSeed[] {
  return courses.map((course) => ({
    ...course,
    steps: course.steps.map(([title, body, note, existing]) => {
      const example = existing ?? examples[title];
      if (!example) throw new Error(`Missing software-engineering example: ${title}`);
      return [title, body, note, example] as const;
    }),
  }));
}

const ISO_25010 = 'ISO/IEC 25010:2023 Product quality model. https://www.iso.org/standard/78176.html';
const SOFTWARE_ARCHITECTURE = 'Software Architecture in Practice, 4th Edition. https://www.sei.cmu.edu/education-outreach/credentials/software-architecture/';
const C4_MODEL = 'C4 model. https://c4model.com/';
const ADR = 'Architecture Decision Records. https://adr.github.io/';
const DDD_REFERENCE = 'Domain-Driven Design Reference. https://www.domainlanguage.com/ddd/reference/';
const MICROSERVICES = 'microservices.io patterns. https://microservices.io/patterns/';
const RFC_9110 = 'RFC 9110 HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110';
const RFC_9457 = 'RFC 9457 Problem Details for HTTP APIs. https://www.rfc-editor.org/rfc/rfc9457';
const OUTBOX = 'Transactional Outbox pattern. https://microservices.io/patterns/data/transactional-outbox.html';
const SAGA = 'Saga pattern. https://microservices.io/patterns/data/saga.html';
const DDIA = 'Designing Data-Intensive Applications. https://dataintensive.net/';
const KAFKA_DOCS = 'Apache Kafka Documentation. https://kafka.apache.org/documentation/';
const REDIS_DOCS = 'Redis Documentation. https://redis.io/docs/latest/';
const ENVOY = 'Envoy documentation. https://www.envoyproxy.io/docs/envoy/latest/';
const K8S_WORKLOADS = 'Kubernetes Workloads. https://kubernetes.io/docs/concepts/workloads/';
const K8S_PROBES = 'Kubernetes Liveness, Readiness and Startup Probes. https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/';
const K8S_HPA = 'Kubernetes Horizontal Pod Autoscaling. https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/';
const K8S_PDB = 'Kubernetes Pod Disruption Budgets. https://kubernetes.io/docs/concepts/workloads/pods/disruptions/';
const K8S_NETWORK_POLICY = 'Kubernetes Network Policies. https://kubernetes.io/docs/concepts/services-networking/network-policies/';
const HELM_DOCS = 'Helm documentation. https://helm.sh/docs/';
const ARGO_CD = 'Argo CD documentation. https://argo-cd.readthedocs.io/';
const SRE_BOOK = 'Google SRE Book. https://sre.google/sre-book/table-of-contents/';
const SRE_WORKBOOK = 'Google SRE Workbook. https://sre.google/workbook/table-of-contents/';
const OTEL = 'OpenTelemetry documentation. https://opentelemetry.io/docs/';
const PROMETHEUS = 'Prometheus documentation. https://prometheus.io/docs/';
const GRACEFUL_SHUTDOWN = 'Kubernetes pod termination lifecycle. https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination';
const CONWAY = 'Team Topologies. https://teamtopologies.com/';
const NIST_SP800128 = 'NIST SP 800-128 Security-Focused Configuration Management. https://csrc.nist.gov/pubs/sp/800/128/final';
const NIST_800_190 = 'NIST SP 800-190 Application Container Security Guide. https://csrc.nist.gov/pubs/sp/800/190/final';
const KUBERNETES_ROLLOUT = 'Kubernetes Deployments. https://kubernetes.io/docs/concepts/workloads/controllers/deployment/';

// ── E0 需求、质量属性与架构边界 ─────────────────────────────────────────────
const e0Stage = '需求、质量属性与架构边界';

const e0Examples: Readonly<Record<string, StepExample>> = {
  '场景六要素': seExample(
    '订单查询质量属性场景',
    'yaml',
    `scenario:
  source: mobile_user
  stimulus: query_orders_during_campaign
  artifact: orders_api
  environment: peak_2000_rps
  response: first_page_returned
  measure:
    p95_ms: 300
    error_rate: 0.001
    window: 10m
`,
    `$ yq '.scenario.measure' quality-scenario.yaml
p95_ms: 300
error_rate: 0.001
window: 10m
场景六段齐全，阈值可被负载测试直接读取。`,
  ),
  '功能与质量分层': seExample(
    '功能验收与质量目标分开',
    'yaml',
    `feature: create_order
functional:
  given: valid_cart
  when: submit_order
  then: order_id_is_returned
quality:
  scenario: checkout_peak
  measure:
    p99_ms: 800
    success_rate: 0.999
  evidence: k6/checkout-peak.js
`,
    `$ yq -o=json '.functional, .quality.measure' feature.yaml
{"given":"valid_cart","when":"submit_order","then":"order_id_is_returned"}
{"p99_ms":800,"success_rate":0.999}
业务结果与性能指标分开验收。`,
  ),
  '约束要带影响': seExample(
    '数据库与区域约束登记表',
    'csv',
    `id,constraint,affected_quality,owner,expires,evidence
C1,oracle-19c-only,maintainability,dba-team,2027-03-31,dba-review.pdf
C2,data-must-stay-cn,security,privacy-office,2027-12-31,pia-042.md
C3,no-network-in-q4,cost,platform-team,2026-12-31,capacity-plan.xlsx
`,
    `$ Import-Csv constraints.csv | Format-Table id,affected_quality,owner
id affected_quality  owner
-- ----------------  -----
C1 maintainability dba-team
C2 security          privacy-office
C3 cost              platform-team
每条约束都有影响和解除日期。`,
  ),
  '测量基线与阈值': seExample(
    '订单查询固定负载基线',
    'javascript',
    `import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const res = http.get('http://orders.test/api/orders?page=1');
  check(res, { 'status is 200': (r) => r.status === 200 });
}
`,
    `$ k6 run orders-baseline.js
http_req_duration........: avg=118ms p(95)=241ms p(99)=402ms
http_req_failed..........: 0.03% ✓ rate<0.1%
checks...................: 100.00% ✓ 5980
基线可重复，阈值未达标时 k6 以非零状态退出。`,
  ),
  '冲突与验收决策': seExample(
    '一致性与成本冲突评分',
    'typescript',
    `type Option = { name: string; latency: number; cost: number; consistency: number };
const options: Option[] = [
  { name: 'async-replica', latency: 20, cost: 2, consistency: 2 },
  { name: 'sync-replica', latency: 65, cost: 4, consistency: 5 },
  { name: 'single-region', latency: 25, cost: 3, consistency: 4 },
];
const score = (o: Option) => o.consistency * 3 - o.latency / 20 - o.cost;
console.table(options.map((o) => ({ ...o, score: score(o) })));
`,
    `$ pnpm exec tsx decision-matrix.ts
┌─────────┬───────────────┬─────────┬──────┬─────────────┬───────┐
│ (index) │ name          │ latency │ cost │ consistency │ score │
│ 0       │ async-replica │ 20      │ 2    │ 2           │ 3     │
│ 1       │ sync-replica  │ 65      │ 4    │ 5           │ 10.75 │
│ 2       │ single-region │ 25      │ 3    │ 4           │ 7.75  │
└─────────┴───────────────┴─────────┴──────┴─────────────┴───────┘`,
  ),
  '先画事务边界': seExample(
    '订单与库存原子性检查',
    'json',
    `{
  "workflow": "create_order",
  "atomic_invariants": [
    "orders.amount = sum(order_items.subtotal)",
    "stock.reserved <= stock.available"
  ],
  "cross_boundary": ["loyalty_points"],
  "consistency": "eventual",
  "compensation": "release_reservation"
}
`,
    `$ jq '{atomic_invariants,cross_boundary}' boundary.json
{
  "atomic_invariants": [
    "orders.amount = sum(order_items.subtotal)",
    "stock.reserved <= stock.available"
  ],
  "cross_boundary": ["loyalty_points"]
}
积分被明确移出强事务边界。`,
  ),
  '模块化单体约束': seExample(
    '禁止跨模块访问数据库',
    'javascript',
    `module.exports = {
  forbidden: [
    {
      name: 'orders-must-use-public-port',
      severity: 'error',
      from: { path: '^src/orders' },
      to: { path: '^src/(inventory|billing)/(internal|repository)' },
    },
  ],
};
`,
    `$ npx depcruise src --config .dependency-cruiser.cjs
✔ 0 dependency violations (68 modules, 154 dependencies)
禁止规则已通过构建执行，订单模块只能调用公开端口。`,
  ),
  '微服务拆分信号': seExample(
    '按发布和扩缩容曲线判断拆分',
    'csv',
    `service,deploys_per_week,peak_multiplier,p95_ms,data_owner
orders,9,3,180,sales
inventory,1,12,440,warehouse
billing,2,2,260,finance
notifications,3,4,90,platform
`,
    `$ Import-Csv services.csv | Where-Object { [int]$_.peak_multiplier -ge 8 }
service   deploys_per_week peak_multiplier p95_ms data_owner
-------   ---------------- --------------- ------ ----------
inventory 1                12              440    warehouse
库存具备明显的独立扩缩容信号，值得评估拆出。`,
  ),
  '演进与防腐层': seExample(
    '本地端口与远程适配器双实现',
    'typescript',
    `interface InventoryPort { reserve(orderId: string, sku: string): Promise<void>; }

class LocalInventory implements InventoryPort {
  async reserve(_orderId: string, _sku: string) {}
}

class RemoteInventory implements InventoryPort {
  constructor(private readonly http: typeof fetch) {}
  async reserve(orderId: string, sku: string) {
    const res = await this.http.post('/inventory/reservations', { orderId, sku });
    if (!res.ok) throw new Error('reserve failed: ' + res.status);
  }
}
`,
    `$ pnpm exec tsc --noEmit
$ pnpm exec vitest run inventory-contract.spec.ts
✓ LocalInventory contract (1 test)
✓ RemoteInventory contract (1 test)
5 passed，特性开关可让两条路径同时通过同一契约。`,
  ),
  '总成本与可逆性': seExample(
    '单体与服务方案总成本对比',
    'csv',
    `option,instances,monthly_compute,observability,pipelines,oncall_hours
modular-monolith,3,680,90,1,8
four-services,12,1420,360,5,32
`,
    `$ Import-Csv cost.csv | ForEach-Object {
>>   [pscustomobject]@{ option=$_.option; monthly=[int]$_.monthly_compute+[int]$_.observability; oncall=$_.oncall_hours }
>> }
option           monthly oncall
------           ------- ------
modular-monolith 770     8
four-services    1780    32
拆分前先证明增量收益能覆盖固定成本。`,
  ),
  '画出依赖箭头': seExample(
    '检测应用层到基础设施的反向依赖',
    'powershell',
    `$rules = @'
from:
  path: ^src/domain
to:
  path: ^src/adapters/database
'@
Set-Content depcruise.yml $rules
npx depcruise src --config depcruise.yml
`,
    `$ npx depcruise src --config depcruise.yml
✖ 1 dependency violation found
src/domain/order.ts -> src/adapters/database/pg-order.ts
domain 不应导入数据库适配器。
`,
  ),
  '接口放对位置': seExample(
    '仓储端口由应用层定义',
    'typescript',
    `export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export class SubmitOrder {
  constructor(private readonly orders: OrderRepository) {}
  async execute(id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    order.submit();
    await this.orders.save(order);
  }
}
`,
    `$ pnpm exec tsc --noEmit
domain/order.ts  application/submit-order.ts  port/order-repository.ts
应用只依赖 OrderRepository；ORM 类型未出现在领域包。`,
  ),
  '依赖规则自动化': seExample(
    '领域层禁止框架导入',
    'javascript',
    `module.exports = {
  forbidden: [{
    name: 'domain-is-framework-free',
    severity: 'error',
    from: { path: '^src/domain/' },
    to: { path: 'node_modules/(express|typeorm|@nestjs)' },
  }],
};
`,
    `$ npx depcruise src/domain --config depcruise.cjs
✖ domain-is-framework-free
domain/order.ts -> typeorm
构建失败，新增框架依赖无法进入领域层。`,
  ),
  '所有权与公开契约': seExample(
    '契约所有者与消费者清单校验',
    'typescript',
    `const api = {
  path: 'openapi/orders-v2.yaml',
  owner: '@commerce-platform',
  consumers: ['web', 'mobile', 'partner-a'],
  compatibilityWindow: '2 releases',
};
if (!api.owner.startsWith('@') || api.consumers.length < 3) {
  throw new Error('ownership metadata incomplete');
}
console.log(api.path + ' owned by ' + api.owner);
console.log(api.consumers.map((c) => 'consumer=' + c).join('\n'));
`,
    `$ pnpm exec tsx ownership-check.ts
openapi/orders-v2.yaml owned by @commerce-platform
consumer=web
consumer=mobile
consumer=partner-a
公开契约有明确负责人和消费者范围。`,
  ),
  '拆耦合的渐进路径': seExample(
    '统计旧仓储调用并设置清理门',
    'powershell',
    `$legacy = rg -n "legacyOrders\\." src | Measure-Object
$shadow = rg -n "shadowRepository" src | Measure-Object
[pscustomobject]@{
  legacy_calls = $legacy.Count
  shadow_calls = $shadow.Count
  gate = if ($legacy.Count -eq 0) { 'remove' } else { 'observe' }
}
`,
    `$ ./measure-migration.ps1
legacy_calls shadow_calls gate
------------ ------------ ----
4            7            observe
旧调用还有 4 处，因此当前只能缩流量，不能删除适配层。`,
  ),
  '从系统边界开始': seExample(
    'C4 Context 图语法校验',
    'plantuml',
    `@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml
Person(customer, "客户", "查询订单")
System(orders, "订单平台", "创建与查询订单")
System_Ext(payment, "支付网关", "授权和退款")
Rel(customer, orders, "HTTPS")
Rel(orders, payment, "HTTPS, 2s timeout")
@enduml
`,
    `$ java -jar plantuml.jar -checkonly docs/c4-context.puml
$ echo $LASTEXITCODE
0
Context 图语法有效；外部支付依赖带协议与超时。`,
  ),
  'C4 分层表达': seExample(
    'Structurizr 容器与组件模型',
    'structurizr',
    `workspace {
  model {
    user = person "Customer"
    orders = softwareSystem "Orders" {
      api = container "orders-api" "TypeScript HTTP API" "Node.js"
      db = container "orders-db" "PostgreSQL 16"
      api -> db "SQL"
    }
    user -> orders.api "HTTPS"
  }
  views {
    container orders "Containers" { include *; autolayout lr }
  }
}
`,
    `$ npx -y @structurizr/cli validate -w workspace.dsl
Workspace validation successful.
Containers: orders-api, orders-db
Relationships: 2 valid
图模型可校验且与容器清单使用一致名称。`,
  ),
  '动态与部署视图': seExample(
    '下单动态调用链演练',
    'mermaid',
    `sequenceDiagram
  autonumber
  participant C as Mobile
  participant A as Orders API
  participant D as PostgreSQL
  participant K as Kafka
  C->>A: POST /orders
  A->>D: BEGIN + insert order/outbox
  D-->>A: COMMIT
  A-)K: publish OrderCreated
  A-->>C: 201 Location
  Note over K: network timeout triggers relay retry
`,
    `$ npx -y @mermaid-js/mermaid-cli -i order-flow.mmd -o order-flow.svg
$ test -s order-flow.svg && echo "diagram=ok"
diagram=ok
动态图明确数据库提交先于消息发布，发布失败由中继重试。`,
  ),
  'ADR 记录取舍': seExample(
    '创建 Outbox 架构决策记录',
    'powershell',
    `adr new -s 12 "Use transactional outbox for OrderCreated"
adr link 12 "Supersedes:ADR-0007"
Get-Content docs/adr/0012-use-transactional-outbox-for-ordercreated.md |
  Select-String "Status|Context|Consequences"
`,
    `docs/adr/0012-use-transactional-outbox-for-ordercreated.md
Status: Accepted
Context: database commit and Kafka publish cannot be atomic
Consequences: one relay, duplicate delivery, idempotent consumers
ADR 编号已生成并记录验证与退出条件。`,
  ),
  '图与证据同步': seExample(
    '核对架构图资源与部署清单',
    'powershell',
    `$diagram = Get-Content docs/c4-container.puml -Raw
$manifest = Get-Content deploy/orders.yaml -Raw
$resources = 'orders-api','orders-db','orders-worker'
$missing = $resources | Where-Object {
  $diagram -notmatch [regex]::Escape($_) -or $manifest -notmatch [regex]::Escape($_)
}
if ($missing) { throw "missing references: $($missing -join ',')" }
'diagram-and-manifest=aligned'
`,
    `$ ./check-architecture-refs.ps1
diagram-and-manifest=aligned
退出码 0；删除任一资源名后脚本会指出缺失引用并阻断合并。`,
  ),
  '风险要能触发': seExample(
    '带触发信号的迁移风险登记',
    'yaml',
    `risk_id: R-014
event: order_backfill_causes_replica_lag
probability: medium
impact: checkout_error_budget
signal: pg_replication_lag_seconds > 30 for 5m
mitigation: pause_backfill_and_reduce_batch_size
owner: migration-team
review_at: 2026-11-28
`,
    `$ yq '.signal, .mitigation, .owner' risks/r-014.yaml
pg_replication_lag_seconds > 30 for 5m
pause_backfill_and_reduce_batch_size
migration-team
风险可被监控触发，且有明确止血动作。`,
  ),
  '假设写成可反驳命题': seExample(
    '运维接管能力假设',
    'json',
    `{
  "statement": "a new SRE can deploy and roll back orders within 4 hours",
  "participants": 2,
  "pass": ["deploy under 45m", "rollback under 15m", "no author help"],
  "fail": ["missing secret", "manual database edit", "needs original author"],
  "evidence": ["screen recording", "command log", "review notes"]
}
`,
    `$ jq '{statement,pass,fail}' hypothesis.json
{
  "statement": "a new SRE can deploy and roll back orders within 4 hours",
  "pass": ["deploy under 45m", "rollback under 15m", "no author help"],
  "fail": ["missing secret", "manual database edit", "needs original author"]
}
假设有预先写好的失败条件。`,
  ),
  '最小验证实验': seExample(
    '回填速度一周探针',
    'sql',
    `WITH batch AS (
  SELECT id, payload
  FROM legacy_orders
  WHERE migrated_at IS NULL
  ORDER BY id
  LIMIT 1000
)
UPDATE legacy_orders l
SET migrated_at = now()
FROM batch b
WHERE l.id = b.id
RETURNING l.id;
`,
    `$ psql "$DATABASE_URL" -f backfill-probe.sql
UPDATE 1000
Time: 842.391 ms
按 1000 行一批实测 1.2 秒内完成，可在目标窗口内继续验证复制延迟。`,
  ),
  '容量与故障探针': seExample(
    '注入 300ms 依赖延迟',
    'bash',
    `toxiproxy-cli create postgres --listen 127.0.0.1:26379 --upstream 127.0.0.1:5432
toxiproxy-cli toxic add postgres -t latency -a latency=300 -a jitter=50
k6 run --vus 40 --duration 2m checkout.js
toxiproxy-cli toxic remove postgres -n latency_downstream
`,
    `$ toxiproxy-cli toxic add postgres -t latency -a latency=300
Added toxic latency_downstream
$ k6 run --vus 40 --duration 2m checkout.js
http_req_duration: p(95)=714ms, p(99)=1208ms
http_req_failed: 1.7%`,
  ),
  '决策门与退出条件': seExample(
    '架构实验决策门',
    'json',
    `{
  "experiment": "outbox-relay",
  "enter_if": { "p99_ms": 450, "duplicate_side_effects": 0 },
  "stop_if": ["oldest_event_age_minutes>10", "consumer_lag>50000"],
  "decision_owner": "architecture-board",
  "decision_due": "2026-12-01",
  "fallback": "dual-write-with-reconciliation"
}
`,
    `$ jq '.stop_if[], .fallback' gate.json
"oldest_event_age_minutes>10"
"consumer_lag>50000"
"dual-write-with-reconciliation"
停止条件与退路在实验开始前已经确定。`,
  ),
};

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E0_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e0Stage, '功能需求、质量属性与约束'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '参与过一次需求评审，能把业务目标写成用户故事，并知道接口、数据库与部署的基本组成。',
    goal: '把功能需求、质量属性场景和外部约束分开建模，使每个架构目标都有刺激源、可观察响应、量化阈值与验收方法。',
    guidedPractice: '为订单查询功能写六段式场景：促销日、移动端用户、订单服务、峰值时间段、查询响应、p95 小于 300 ms 且错误率低于 0.1%；再用 k6 运行 10、50、200 并发三档，记录延迟直方图与错误率。',
    independentPractice: '为一个“导出账单”功能补齐性能、可用性、安全、可维护性和成本场景。每条场景必须带测量窗口、数据规模、失败阈值与证据文件，并标出与功能需求冲突时由谁决策。',
    commonErrors: [
      '把“系统要快”“高可用”写进需求，却没有刺激条件、数据规模、分位延迟和测量窗口，导致开发与验收各按自己的理解实现。',
      '把技术约束当成不可讨论的既有事实，例如直接规定必须使用某个消息队列，却不说明吞吐、运维能力、成本和退出条件。',
    ],
    sourceRefs: [ISO_25010, SOFTWARE_ARCHITECTURE, SRE_WORKBOOK],
    steps: [
      ['场景六要素', '质量属性场景由刺激源、刺激、制品、环境、响应和响应度量组成。把“促销日移动端用户查询订单”放进环境，把制品限定为订单查询 API，响应写成返回首屏数据且不触发全表扫描，度量才能落到 p95 延迟、错误率和数据新鲜度。失败边界是场景只描述愿望而没有触发条件；验证证据是同一场景在固定数据量与负载脚本下得到的分位指标，而不是一次手工点击的体感。', '六段都齐全才能验收'],
      ['功能与质量分层', '功能需求回答系统做什么，质量属性回答做得怎样，约束规定不能突破的外部条件。下单成功后扣库存是功能，峰值下订单提交 p99 不超过 800 ms 是质量，支付数据必须留在指定区域是约束。失败边界是把质量要求拆成功能开关，最终只证明按钮可点；验证方法是为同一用户路径同时记录业务结果与资源指标，拿成功订单数、库存扣减数、延迟分位形成交叉证据。', '做什么和做得多好分开'],
      ['约束要带影响', '逐项登记技术、法规、组织和交付约束，例如必须复用既有 Oracle 数据库、季度内不能扩容机房、团队只能维护两种语言。每条约束写出受影响的质量属性、替代空间、验证方式和解除条件。失败边界是隐性约束在编码后才暴露，导致缓存方案或数据驻留设计全部返工；验证证据包括约束评审记录、配置清单，以及在测试环境复现目标数据库版本和区域限制的集成测试结果。', '约束必须解释代价'],
      ['测量基线与阈值', '先在固定镜像、固定数据集和固定机器上测正常负载，保存吞吐、p50/p95/p99、错误率、数据库连接数及 CPU 内存曲线，再逐步加压寻找拐点。阈值应来自用户可感知预算和服务容量，不来自当前实现的偶然数字。失败边界是压测脚本只打健康检查或忽略思考时间，结果与实际流量结构不符；验证证据是请求模型说明、原始结果文件、可重复命令和指标面板截图。', '先有基线再谈达标'],
      ['冲突与验收决策', '质量属性会互相牵制：强一致降低写入可用性，更多副本增加成本，严格审计增加延迟。将冲突写成选项比较，记录选择、剩余风险和复审日期，并把每条验收场景映射到自动化测试、容量报告或人工演练。失败边界是出现冲突时由最后发言者拍板，没有留下决策依据；验证证据是 ADR 中的阈值、负责人、测试链接与发布门禁，故意调低资源后应能看到对应场景失败。', '冲突写进决策记录'],
    ],
  },
  {
    name: seName(e0Stage, '模块化单体与微服务取舍'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解事务、进程、网络调用和部署单元的区别，能读懂模块依赖图与一次业务请求的调用链。',
    goal: '根据团队所有权、数据生命周期、独立扩缩容和故障隔离需求选择模块化单体或微服务，并给出可逆的演进边界。',
    guidedPractice: '把订单、库存、支付、通知画成四个候选服务，列出每项的事务范围、峰值倍率、发布频率、数据所有者与团队归属；分别估算单体部署和四服务部署的网络跳数、容器数、告警面与跨服务补偿成本。',
    independentPractice: '为一个售后系统写架构决策：首版采用模块化单体，但保留事件出口和独立数据库模式；列出触发拆分的三项可量化信号，以及拆分前必须补齐的契约、可观测性和回滚能力。',
    commonErrors: [
      '按技术层拆成 Controller 服务、Service 服务、DAO 服务，导致一次业务写入需要多次网络调用但仍无法独立发布。',
      '只看到微服务的独立部署，不计算数据一致性、链路追踪、版本兼容、值班和基础设施成本，最终把本地事务问题换成分布式问题。',
    ],
    sourceRefs: [MICROSERVICES, SOFTWARE_ARCHITECTURE, DDIA],
    steps: [
      ['先画事务边界', '把业务流程标成必须原子完成的状态变化。下单扣库存若要求同一数据库事务，拆服务后只能用预留、Saga 或对账补偿；若业务允许短时不一致，则需要明确最终状态与超时处理。失败边界是把每个实体都当成天然服务，忽略跨实体不变量；验证证据是用故障注入中断第二步，检查订单、库存和补偿记录是否最终一致，并给出恢复时间。', '事务范围先于服务边界'],
      ['模块化单体约束', '模块化单体仍可拥有清晰领域边界：订单模块只通过公开接口调用库存模块，禁止跨模块直接访问表；每个模块拥有 schema 前缀、迁移所有权和契约测试。用 ArchUnit、dependency-cruiser 或 import-linter 把依赖规则写入构建。失败边界是目录分开了但共享实体和数据库表仍任意穿透；验证证据是依赖检查通过、删除一个模块的公开接口后其他模块编译失败，以及独立模块测试可单独运行。', '模块边界要被构建检查'],
      ['微服务拆分信号', '可拆分信号应来自独立发布节奏、明显不同的扩缩容曲线、隔离的合规边界或稳定团队所有权，而不是代码文件多。支付峰值是查询的十倍、库存发布每周一次而订单每天多次，才可能支持独立部署。失败边界是按人数而非业务能力拆，造成一个业务变更跨四个仓库；验证证据是变更前置时间、部署频率、故障半径和单业务请求跨服务数量在拆分前后的对照数据。', '拆分要有可测收益'],
      ['演进与防腐层', '从单体抽出服务时，先在进程内定义端口，再实现本地适配器和远程适配器，用特性开关逐步切换流量；远程接口采用独立 DTO，不能把数据库实体直接序列化。失败边界是一次性替换调用方和协议，无法回退或并行验证；验证证据是同一请求在旧路径和新路径产生相同业务结果，并通过影子流量比较延迟、错误码和事件数量。', '先做可替换边界再拆进程'],
      ['总成本与可逆性', '比较方案时把镜像、节点、日志、Trace、消息、数据库连接、CI 流水线、跨团队沟通和值班人力纳入总拥有成本。为拆分设置停止条件，例如错误率连续一周低于阈值、回滚演练通过后才扩大流量。失败边界是只算服务器账单，不计算时间与认知负担；验证证据是一页成本模型、容量报告和回滚演练记录，任何关键指标不达标都能退回单体模块路径。', '拆分必须能算账也能回退'],
    ],
  },
  {
    name: seName(e0Stage, '依赖方向、接口和所有权'),
    track,
    contentStatus: 'reviewed',
    minutes: 43,
    prerequisite: '能读 TypeScript、Java 或 Python 的模块导入关系，并理解接口与实现分离的基本用法。',
    goal: '建立稳定依赖方向，使领域规则不依赖框架、数据库和传输协议，并为每个公开接口定义所有者、兼容策略与变更责任。',
    guidedPractice: '选一个包含控制器、服务、仓储和 ORM 实体的模块，画出当前依赖图；把用例需要的数据库操作定义成接口，让领域层只依赖接口，基础设施层实现它，再用依赖检查命令证明领域包不再导入 ORM。',
    independentPractice: '为一个公开订单 API 建立所有权卡：维护团队、消费者、版本窗口、弃用流程、告警联系人、兼容测试和紧急回滚责任；再找出至少一条反向依赖并写出拆除计划。',
    commonErrors: [
      '把接口放在基础设施包中，领域代码为了使用接口反而依赖数据库模块，依赖箭头仍然朝外。',
      '公开接口没有负责人，任何团队都能随意改字段，消费者升级失败后无法判断由谁批准、何时弃用和如何回滚。',
    ],
    sourceRefs: ['Dependency Inversion Principle. https://web.archive.org/web/20220521000747/https://www.objectmentor.com/resources/articles/dip.pdf', DDD_REFERENCE, ADR],
    steps: [
      ['画出依赖箭头', '依赖方向描述源码编译时的知道关系，A 导入 B 就表示 A 依赖 B。稳定的领域规则应依赖业务接口，基础设施实现接口，因此箭头从适配器指向领域端口，而不是领域反向导入数据库驱动。失败边界是以运行期调用方向替代源码依赖方向，误以为 HTTP 请求进来就应让领域依赖控制器；验证证据是生成模块依赖图并运行 import-linter 或 ArchUnit，确认禁止规则能阻止新增反向导入。', '看编译依赖而非调用顺序'],
      ['接口放对位置', '端口接口由需要能力的一方定义，放在领域或应用层；数据库仓储、消息发布和外部支付适配器位于外层并实现端口。接口参数只使用领域类型或稳定 DTO，不暴露 ORM session、HTTP request 或框架注解。失败边界是接口方法返回数据库实体，导致消费者被迫跟随表结构；验证证据是领域测试用内存适配器即可运行，替换真实适配器不需要修改领域代码。', '接口跟随使用者需求'],
      ['依赖规则自动化', '把允许依赖写成可执行规则，例如 order-domain 不得导入 org.springframework、java.sql 或订单外的包；CI 同时运行架构测试和循环依赖检查。新依赖需要评审并在 ADR 中说明原因。失败边界是规则只在文档中存在，开发者为赶进度随手添加例外；验证证据是故意新增一条禁止导入，确认本地检查和 CI 都失败，并保留失败输出。', '架构规则必须让构建失败'],
      ['所有权与公开契约', '每个公开接口记录领域所有者、消费方、SLO、鉴权范围、版本策略和弃用联系。使用 CODEOWNERS 保护契约文件，变更通过兼容测试并发布变更摘要。失败边界是共享 DTO 被所有服务复制后各自演化，名称相同而语义不同；验证证据是契约测试矩阵、所有者审批记录和一次旧客户端仍通过的兼容发布记录。', '接口也有负责人'],
      ['拆耦合的渐进路径', '先标记共享数据库表、同步调用和共享包的调用点，选择业务价值高且风险可控的一处建立防腐层；通过适配器同时支持旧模型和新模型，观察流量后再删除旧路径。失败边界是同时重写调用方、数据表和协议，出错后无法判断是哪一层导致；验证证据是双路径影子比对、数据库读写差异报告和逐周下降的旧调用计数。', '一次只切断一条耦合'],
    ],
  },
  {
    name: seName(e0Stage, '架构图、C4、ADR 和决策记录'),
    track,
    contentStatus: 'reviewed',
    minutes: 44,
    prerequisite: '能读部署清单和接口定义，知道容器、数据库、消息队列、网关在系统中的位置。',
    goal: '用 C4 视图表达系统边界与调用关系，用 ADR 记录有后果的架构选择，并让图、决策、配置和验证证据能够互相追溯。',
    guidedPractice: '为订单系统分别画 Context、Container、Component 和动态查询视图，每个元素标注负责人和数据分类；再写一份选择 PostgreSQL 与 Outbox 的 ADR，把图节点、迁移文件、测试和监控面板链接到决策后果。',
    independentPractice: '接管一个现有系统，补一张能在十分钟内解释边界的 C4 Container 图和两份关键 ADR；找出图中与部署清单不一致的三处，确认哪一处是文档过期、哪一处是配置漂移。',
    commonErrors: [
      '把 C4 画成装饰性架构海报，容器、数据库和外部系统没有名称、协议、负责人或数据流，评审时无法回答故障影响。',
      'ADR 只有“决定使用 Redis”，没有背景、替代方案、后果、验证方式和退出条件，日后无法判断决策是否仍成立。',
    ],
    sourceRefs: [C4_MODEL, ADR, SOFTWARE_ARCHITECTURE],
    steps: [
      ['从系统边界开始', 'Context 图只保留用户、外部系统、本系统和关键数据流，先说明谁依赖谁、哪些调用跨组织边界。每个外部依赖标注协议、认证方式、超时和负责人，避免把未知系统藏在云图标里。失败边界是图中出现几十个内部组件却没有系统边界；验证证据是让未参与项目的人根据图指出一次用户请求经过的外部系统、数据和信任边界。', '先讲清系统与外部世界'],
      ['C4 分层表达', 'Container 视图展示可部署单元、数据库、消息通道和主要协议；Component 视图再展开单个容器内部职责；动态图沿一条业务用例标出调用顺序。每层使用一致的名称和标识，并把代码仓库路径放在元素备注里。失败边界是同一服务在不同图中名字不同，导致排障找不到对象；验证证据是名称字典、图版本和配置清单交叉检查，随机抽取一个节点能定位到仓库与运行资源。', '每层只回答对应问题'],
      ['动态与部署视图', '静态图说明组成，动态图说明一次下单如何跨 API、数据库、Outbox、Kafka 和通知服务，部署图说明 Pod、Service、Ingress、数据库和网络策略实际位于哪个环境。失败边界是图中只有理想链路，没有超时、重试和异步出口；验证证据是在测试环境按动态图注入支付超时，确认调用链、重试次数和补偿事件与图一致。', '静态之外还要画运行'],
      ['ADR 记录取舍', 'ADR 使用固定结构：背景与问题、约束、候选方案、决定、后果、验证、复审条件。把被否决方案的具体代价写进去，例如选择 Outbox 换来额外表和发布器运维成本，但避免数据库提交与消息发送双写失败。失败边界是决定写在聊天记录中，代码与基础设施无法追溯；验证证据是 ADR 编号被提交、配置、测试名称引用，且能从当前部署反查有效 ADR。', '记录为什么而不是只记结果'],
      ['图与证据同步', '把架构图源文件、部署清单、接口定义和 ADR 放进同一版本库，在 CI 中检查引用路径、资源名称和公开端口是否一致。重大变更必须同时更新图、决策和运行手册。失败边界是图长期落后，故障时值班人员按旧拓扑处理；验证证据是一次发布前审查，随机删除一个图节点对应的资源，检查自动校验能指出过期引用。', '图也要接受构建检查'],
    ],
  },
  {
    name: seName(e0Stage, '风险、假设和验证计划'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '能读质量属性场景与架构决策，知道测试、容量和故障演练分别能提供什么证据。',
    goal: '把架构中的未知项转成可排序的风险与假设，设计最小实验收集证据，并把结果连接成继续、调整或停止的决策门。',
    guidedPractice: '为“迁移到多租户订单平台”建立风险表，列出概率、影响、触发信号、缓解、负责人和复查日期；选最高的三项设计一周内可完成的探针实验，分别验证租户隔离、数据回填速度和峰值容量。',
    independentPractice: '为一个季度架构计划建立假设清单和验证计划，每条假设必须包含可观察指标、实验成本、失败判据和决策影响；删除无法影响决策的“研究型”任务。',
    commonErrors: [
      '风险表只写“性能风险”“人员风险”，没有触发信号与负责人，风险发生前后都无法判断是否升级。',
      '把原型演示当成容量证明，只在开发机跑十次请求就承诺生产吞吐，忽略数据规模、网络和故障域。',
    ],
    sourceRefs: ['NIST Risk Management Framework. https://csrc.nist.gov/projects/risk-management/about-rmf', SOFTWARE_ARCHITECTURE, SRE_WORKBOOK],
    steps: [
      ['风险要能触发', '风险条目包含事件、概率区间、业务影响、技术影响、预警信号、缓解动作、所有者和复查日期。例如“回填导致主库写放大”可用副本延迟持续超过 30 秒作为触发信号，缓解是分批限速和暂停开关。失败边界是风险只存在季度文档中，没有进入监控与排期；验证证据是监控规则、负责人确认和一次阈值预演记录。', '每条风险都有触发器和主人'],
      ['假设写成可反驳命题', '把“团队能在两周内掌握 Kubernetes”改成“两名后端工程师按运行手册独立完成滚动发布、回滚和故障定位，耗时低于四小时”。命题包含对象、动作、时间与证据，才能设计实验。失败边界是假设描述得太抽象，无论结果如何都能解释成成功；验证证据是预先写好的通过条件、实验日志和评审结论。', '假设必须可能被推翻'],
      ['最小验证实验', '实验只验证一个关键未知项，设定时间盒、样本规模、成功阈值和停止条件。容量未知可先在接近生产数据量的测试库跑固定请求模型，灾备未知可做单节点断电和恢复计时。失败边界是实验顺手引入多个架构改动，结果无法归因；验证证据是版本、配置、脚本、原始指标和实验前后差异，失败也需形成结论。', '一个实验回答一个关键问题'],
      ['容量与故障探针', '容量探针从用户请求模型推导连接数、队列积压、缓存命中和数据库 QPS，故障探针验证单副本、单节点、依赖超时和配置错误的影响半径。所有探针在隔离环境执行，设置资源上限和自动停止。失败边界是只测平均吞吐，不测 p99 与恢复时间；验证证据是负载曲线、资源曲线、错误分布和恢复时间线。', '峰值与故障都要有数字'],
      ['决策门与退出条件', '为计划设置阶段门：实验指标达标才进入实现，风险超过阈值则暂停，外部约束变化则重新评估。每个门明确决策人、输入证据和到期日。失败边界是实验完成后没有决策，团队继续按原计划投入；验证证据是会议记录中的继续、调整或停止结论，以及对应任务、预算和风险账本更新。', '证据必须改变下一步行动'],
    ],
  },
], e0Examples);

// ── E1 DDD、API 与模块化实现 ────────────────────────────────────────────────
const e1Stage = 'DDD、API 与模块化实现';

const e1Examples: Readonly<Record<string, StepExample>> = {
  '统一语言落边界': seExample(
    '同一客户在不同上下文中的定义',
    'yaml',
    `contexts:
  sales:
    term: customer
    attributes: [billing_account, shipping_address]
  support:
    term: customer
    attributes: [ticket_history, contact_preference]
  mapping:
    sales_to_support: customer_id_only
    shared_models: false
`,
    `$ yq '.contexts | keys' ubiquitous-language.yaml
- sales
- support
$ yq '.mapping' ubiquitous-language.yaml
sales_to_support: customer_id_only
shared_models: false
两个上下文共享标识，不共享同一实体模型。`,
  ),
  '聚合保护强不变量': seExample(
    '订单提交状态迁移测试',
    'typescript',
    `class Order {
  private status = 'draft';
  submit() {
    if (this.status !== 'draft') throw new Error('ORDER_ALREADY_SUBMITTED');
    this.status = 'submitted';
  }
}

const order = new Order();
order.submit();
try { order.submit(); } catch (error) {
  console.log((error as Error).message);
}
`,
    `$ pnpm exec tsx order.test.ts
ORDER_ALREADY_SUBMITTED
首次提交成功，第二次提交在聚合内部被拒绝，无需依赖数据库触发器。`,
  ),
  '事务只包一个聚合': seExample(
    '短事务写入订单并返回锁等待',
    'sql',
    `BEGIN;
INSERT INTO orders (id, customer_id, status, amount)
VALUES ('o-1042', 'c-88', 'submitted', 259.00);
INSERT INTO outbox (event_id, event_type, aggregate_id, payload)
VALUES ('e-1042', 'OrderSubmitted', 'o-1042', '{"amount":259.00}');
COMMIT;
SELECT pid, wait_event_type, state FROM pg_stat_activity
WHERE application_name = 'orders-api';
`,
    `$ psql "$DATABASE_URL" -f submit-order.sql
BEGIN
INSERT 0 1
INSERT 0 1
COMMIT
 pid  wait_event_type state
 8142               idle
事务只维护订单聚合并写入同一 Outbox，没有锁库存表。`,
  ),
  '跨聚合按标识引用': seExample(
    '订单只保存库存聚合 ID',
    'json',
    `{
  "order_id": "o-1042",
  "customer_id": "c-88",
  "reservation_id": "stock-res-771",
  "items": [
    { "sku": "sku-red-m", "quantity": 2 }
  ],
  "forbidden_embedded_fields": ["stock_balance", "warehouse_rows"]
}
`,
    `$ jq '{order_id,reservation_id,embedded:(has("warehouse_rows"))}' order.json
{
  "order_id": "o-1042",
  "reservation_id": "stock-res-771",
  "embedded": false
}
跨聚合使用标识引用，未携带库存内部对象。`,
  ),
  '上下文映射与防腐': seExample(
    '外部客户模型转换到本地上下文',
    'typescript',
    `type PartnerCustomer = { id: string; email: string; status: string };
type SupportCustomer = { customerId: string; contactEmail: string; active: boolean };

export function translateCustomer(input: PartnerCustomer): SupportCustomer {
  if (!input.email.includes('@')) throw new Error('INVALID_PARTNER_EMAIL');
  return {
    customerId: input.id,
    contactEmail: input.email.toLowerCase(),
    active: input.status === 'enabled',
  };
}
console.log(translateCustomer({ id: 'p-9', email: 'USER@EXAMPLE.COM', status: 'enabled' }));
`,
    `$ pnpm exec tsx translate-customer.ts
{ customerId: 'p-9', contactEmail: 'user@example.com', active: true }
合作伙伴 JSON 经防腐层转换，本地模型没有复用外部状态字符串。`,
  ),
  '入站与出站端口': seExample(
    '提交订单端口与内存适配器',
    'typescript',
    `interface OrderRepository {
  find(id: string): Promise<{ id: string; status: string } | null>;
  save(order: { id: string; status: string }): Promise<void>;
}

interface SubmitOrderPort { execute(orderId: string): Promise<void>; }

class MemoryOrders implements OrderRepository {
  private rows = new Map<string, { id: string; status: string }>();
  async find(id: string) { return this.rows.get(id) ?? null; }
  async save(order: { id: string; status: string }) { this.rows.set(order.id, order); }
}
`,
    `$ pnpm exec tsc --noEmit
$ pnpm exec vitest run submit-order.spec.ts
✓ Execute SubmitOrder through in-memory adapter
1 passed
应用服务只依赖端口，测试未启动数据库或 HTTP 框架。`,
  ),
  '适配器只做翻译': seExample(
    'HTTP 适配器调用应用用例',
    'typescript',
    `import express from 'express';
const app = express();
app.post('/orders/:id/submit', async (req, res) => {
  try {
    await submitOrder.execute(req.params.id);
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    res.status(message === 'ORDER_NOT_FOUND' ? 404 : 409)
      .json({ code: message, traceId: req.header('x-trace-id') });
  }
});
`,
    `$ curl -i -X POST localhost:3000/orders/o-404/submit
HTTP/1.1 404 Not Found
content-type: application/json
{"code":"ORDER_NOT_FOUND","traceId":"trace-71"}
适配器只翻译协议和错误，状态迁移仍由应用用例决定。`,
  ),
  '组合根集中装配': seExample(
    '进程入口组装真实适配器',
    'typescript',
    `const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const orders = new PostgresOrderRepository(pool);
const events = new KafkaEventPublisher(process.env.KAFKA_BROKERS!);
const submitOrder = new SubmitOrder(orders, events, systemClock);
const server = createServer(submitOrder);
server.listen(3000, () => console.log('listening on 3000'));
`,
    `$ node dist/main.js
db-connections=1
kafka-brokers=2
listening on 3000
具体实现只在组合根创建，应用服务构造函数没有读取全局客户端。`,
  ),
  '测试替身分层': seExample(
    '可编程支付超时替身',
    'typescript',
    `class FlakyPayment implements PaymentPort {
  attempts = 0;
  async authorize(): Promise<void> {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error('TIMEOUT');
  }
}

const payment = new FlakyPayment();
await payOrder.execute('o-1042', payment);
console.log({ attempts: payment.attempts, status: 'authorized' });
`,
    `$ pnpm exec tsx payment-retry.test.ts
{ attempts: 2, status: 'authorized' }
应用层验证了超时后的幂等重试；真实支付适配器仍由沙箱集成测试验证。`,
  ),
  '架构约束可执行': seExample(
    '领域层依赖规则进入 CI',
    'yaml',
    `name: architecture
on: [pull_request]
jobs:
  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx depcruise src --config .dependency-cruiser.cjs
`,
    `$ npx depcruise src --config .dependency-cruiser.cjs
✔ 63 modules, 141 dependencies
✖ 0 violations
CI job architecture / dependencies passed
依赖规则是必需的 PR 检查，不是口头约定。`,
  ),
  '资源与操作语义': seExample(
    '创建资源返回 201 与 Location',
    'bash',
    `curl -i -X POST http://orders.test/orders \
  -H 'content-type: application/json' \
  -H 'idempotency-key: create-o-1042' \
  -d '{"customerId":"c-88","items":[{"sku":"red-m","quantity":1}]}'`,
    `HTTP/1.1 201 Created
location: /orders/o-1042
content-type: application/json

{"id":"o-1042","status":"submitted"}
创建结果有资源位置，失败场景另测 400、409 和 503。`,
  ),
  '幂等键设计': seExample(
    '并发重复创建只落一条订单',
    'sql',
    `INSERT INTO idempotency_keys
  (actor_id, key, request_hash, status, response_body)
VALUES
  ('c-88', 'create-o-1042', 'sha256:91ab', 'processing', NULL)
ON CONFLICT (actor_id, key) DO NOTHING
RETURNING key;

SELECT actor_id, key, request_hash, status
FROM idempotency_keys
WHERE actor_id = 'c-88' AND key = 'create-o-1042';
`,
    `$ psql "$DATABASE_URL" -f idempotency.sql
   key
-----------
create-o-1042
(1 row)
 actor_id | key           | request_hash | status
 c-88     | create-o-1042 | sha256:91ab  | completed
第二轮相同请求未插入第二条记录，返回首次订单结果。`,
  ),
  '稳定错误模型': seExample(
    'RFC 9457 错误响应校验',
    'json',
    `{
  "type": "https://errors.example/order-conflict",
  "title": "Order state conflict",
  "status": 409,
  "detail": "Order o-1042 has already been submitted.",
  "instance": "/orders/o-1042",
  "code": "ORDER_ALREADY_SUBMITTED",
  "retryable": false,
  "trace_id": "trace-71"
}
`,
    `$ npx ajv-cli validate -s problem.schema.json -d error.json
error.json valid
$ jq '.code, .retryable' error.json
"ORDER_ALREADY_SUBMITTED"
false
客户端依赖稳定 code，不解析标题文案。`,
  ),
  '重试边界': seExample(
    'Envoy 超时与有界重试',
    'yaml',
    `route:
  timeout: 1.5s
  retry_policy:
    retry_on: 5xx,reset,connect-failure,retriable-status-codes
    retriable_status_codes: [429, 503]
    num_retries: 2
    per_try_timeout: 400ms
    retry_back_off:
      base_interval: 50ms
      max_interval: 250ms
`,
    `$ envoy --mode validate -c envoy.yaml
configuration 'envoy.yaml' OK
$ k6 run retry-budget.js
requests=1200 downstream_attempts=1398 amplification=1.165
超时和重试都在总预算内，放大倍数低于 1.2。`,
  ),
  '兼容与契约测试': seExample(
    'OpenAPI 破坏性变更检测',
    'bash',
    `oasdiff breaking base/openapi.yaml \
  revision/openapi.yaml \
  --fail-on ERR \
  --format text`,
    `$ oasdiff breaking base/openapi.yaml revision/openapi.yaml --fail-on ERR
1 breaking change detected
GET /orders/{id}
  response property "currency" was removed
exit code 1
CI 阻止删除必选响应字段。`,
  ),
  '同一事务写业务与事件': seExample(
    '订单与 Outbox 同事务提交',
    'sql',
    `BEGIN;
INSERT INTO orders (id, status, amount)
VALUES ('o-1042', 'submitted', 259.00);
INSERT INTO outbox (event_id, aggregate_id, event_type, payload)
VALUES ('e-1042', 'o-1042', 'OrderSubmitted',
        '{"orderId":"o-1042","amount":259.00}');
COMMIT;
SELECT (SELECT count(*) FROM orders WHERE id='o-1042') AS orders,
       (SELECT count(*) FROM outbox WHERE aggregate_id='o-1042') AS events;
`,
    `$ psql "$DATABASE_URL" -f create-order.sql
BEGIN
INSERT 0 1
INSERT 0 1
COMMIT
 orders | events
      1 |      1
任一条 INSERT 失败都会整体回滚。`,
  ),
  '独立中继发布': seExample(
    'SKIP LOCKED 领取待发事件',
    'sql',
    `WITH claimed AS (
  SELECT id
  FROM outbox
  WHERE status = 'pending' AND available_at <= now()
  ORDER BY id
  FOR UPDATE SKIP LOCKED
  LIMIT 100
)
UPDATE outbox o
SET status = 'publishing', attempts = attempts + 1
FROM claimed c
WHERE o.id = c.id
RETURNING o.id, o.event_id, o.attempts;
`,
    `$ psql "$DATABASE_URL" -f claim-outbox.sql
  id  | event_id | attempts
------+----------+----------
 9012 | e-1042   |        1
 9013 | e-1043   |        1
UPDATE 2
中继实例可并行领取，不重复处理同一待发记录。`,
  ),
  '消费端幂等': seExample(
    '事件去重与业务写入同事务',
    'sql',
    `BEGIN;
INSERT INTO consumed_events (event_id, consumer)
VALUES ('e-1042', 'inventory-reserver')
ON CONFLICT DO NOTHING;
INSERT INTO reservations (order_id, status)
SELECT 'o-1042', 'reserved'
WHERE EXISTS (
  SELECT 1 FROM consumed_events
  WHERE event_id='e-1042' AND consumer='inventory-reserver'
);
COMMIT;
`,
    `$ psql "$DATABASE_URL" -f consume-order-created.sql
BEGIN
INSERT 0 1
INSERT 0 1
COMMIT
第二次消费插入 0，行数不变；业务变更与去重记录保持原子。`,
  ),
  '领域事件契约': seExample(
    '版本化 OrderSubmitted 事件',
    'json',
    `{
  "event_id": "e-1042",
  "event_type": "OrderSubmitted",
  "schema_version": 2,
  "aggregate_id": "o-1042",
  "occurred_at": "2026-11-24T09:12:41Z",
  "trace_id": "trace-71",
  "data": { "amount": 259.0, "currency": "CNY" }
}
`,
    `$ jq '.event_type, .schema_version, .data.currency' event.json
"OrderSubmitted"
2
"CNY"
事件包含稳定标识、版本和最小业务字段，没有序列化 ORM 实体。`,
  ),
  '故障恢复与积压': seExample(
    'Outbox 最老年龄与失败率',
    'promql',
    `max(time() - outbox_oldest_created_timestamp_seconds)
  and
rate(outbox_publish_failed_total[5m])
  /
rate(outbox_publish_attempt_total[5m])`,
    `$ curl -sG localhost:9090/api/v1/query \\
  --data-urlencode 'query=max(time() - outbox_oldest_created_timestamp_seconds)'
{"status":"success","data":{"resultType":"scalar","result":[2.5,42.8]}}
$ echo $?
0
最老待发事件 42.8 秒，超过 30 秒告警阈值。`,
  ),
  '列出契约消费者': seExample(
    '网关日志汇总旧客户端',
    'powershell',
    `Get-Content access.ndjson | ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.path -like '/api/v1/orders*' } |
  Group-Object client_id |
  Select-Object Name, Count |
  Sort-Object Count -Descending
`,
    `Name      Count
----      -----
mobile-2  18421
web-3      9921
partner-a   120
旧版本仍有一个低频合作伙伴消费者，迁移计划不能只覆盖移动端和 Web。`,
  ),
  '消费者驱动契约': seExample(
    '消费者定义订单接口契约',
    'typescript',
    `import { PactV3 } from '@pact-foundation/pact';
const provider = new PactV3({ consumer: 'web', provider: 'orders-api' });

provider.given('order o-1042 exists')
  .uponReceiving('a request for the order')
  .withRequest({ method: 'GET', path: '/orders/o-1042' })
  .willRespondWith({
    status: 200,
    body: { id: 'o-1042', status: 'submitted', currency: 'CNY' },
  });
await provider.executeTest(async (mock) => {
  await fetch(mock.url + '/orders/o-1042');
});
`,
    `$ pnpm exec vitest run pact/web-order.spec.ts
✓ writes pact for GET /orders/o-1042
1 passed
pacts/web-orders-api.json generated
契约来自消费者实际使用的字段，而不是提供方自描述。`,
  ),
  '兼容规则自动化': seExample(
    'Protobuf 破坏性变更检查',
    'bash',
    `buf breaking proto \
  --against '.git#branch=main' \
  --config '{"version":"v2","breaking":{"use":["FILE"]}}'`,
    `$ buf breaking proto --against '.git#branch=main'
proto/orders/v1/order.proto:14:3:
Field "1" with name "currency" on message "Order" changed type
exit status 1
字段编号和类型变更被 CI 门禁阻止。`,
  ),
  '双版本与观察期': seExample(
    '双版本字段同时返回',
    'bash',
    `curl -s http://orders.test/orders/o-1042 \
  -H 'accept: application/vnd.orders+json; version=2' |
  jq '{id,status,statusCode,currency}'
curl -s http://orders.test/orders/o-1042 \
  -H 'accept: application/vnd.orders+json; version=1' |
  jq '{id,status}'
`,
    `{"id":"o-1042","status":"submitted","statusCode":"SUBMITTED","currency":"CNY"}
{"id":"o-1042","status":"submitted"}
新旧版本都能返回字段，弃用前通过请求版本指标观察调用量。`,
  ),
  '发布后验证': seExample(
    '金丝雀契约字段检查',
    'javascript',
    `import http from 'k6/http';
import { check } from 'k6';
export default function () {
  const res = http.get('https://orders.test/orders/o-1042');
  check(res, {
    'status 200': (r) => r.status === 200,
    'json has currency': (r) => Boolean(r.json('currency')),
    'contract header': (r) => r.headers['X-Contract-Version'] === 'v2',
  });
}
`,
    `$ k6 run contract-probe.js
checks_total.......: 3000
checks_succeeded...: 100.00%
✓ status 200
✓ json has currency
✓ contract header
真实入口验证了字段、状态码和版本响应头。`,
  ),
};

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E1_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e1Stage, '限界上下文、聚合和不变量'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解模块化单体的接口边界，能区分实体、值对象、数据库事务和业务规则。',
    goal: '从业务语言划分限界上下文，用聚合保护强不变量，控制事务大小，并以领域测试证明非法状态无法写入。',
    guidedPractice: '为订单、库存和支付整理术语表，标出“订单已确认”在三处上下文中的不同含义；再设计 Order 聚合，使添加商品、改地址和提交订单都通过聚合根方法，写出重复商品合并与不可改已提交订单的测试。',
    independentPractice: '为售后工单划分上下文与聚合，列出跨聚合引用、允许的最终一致窗口和补偿动作；实现一条不依赖数据库的领域测试，证明非法状态迁移被拒绝。',
    commonErrors: [
      '把数据库表直接当成聚合，一次事务更新订单、库存、支付和积分，聚合边界失去业务意义，热点事务也越来越大。',
      '跨聚合直接持有对象引用并调用修改方法，绕过对方聚合根的不变量与权限检查，最终出现单表合法但业务整体非法的数据。',
    ],
    sourceRefs: [DDD_REFERENCE, 'Martin Fowler: Bounded Context. https://martinfowler.com/bliki/BoundedContext.html', OUTBOX],
    steps: [
      ['统一语言落边界', '限界上下文是一套模型和语言保持一致的边界，同一个词在不同上下文可以拥有不同规则。订单上下文里的“客户”关注收货与结算，客服上下文里的“客户”关注工单历史，强行合并会形成巨型实体。失败边界是只按部门或代码目录划分，却允许同名概念在不同模块中悄悄改写；验证证据是术语表、上下文映射和一次跨上下文接口评审，消费方只能看到公开 DTO。', '同一词语可以有多套模型'],
      ['聚合保护强不变量', '聚合是一组必须同时保持一致的对象，聚合根是外部唯一入口。订单总金额等于明细小计之和、已提交订单不能再加商品，这些不变量应由聚合内部方法和领域测试维护。失败边界是把聚合做成仅包一层 getter/setter 的贫血对象，业务规则散落在控制器；验证证据是针对每个状态迁移运行合法与非法用例，数据库写入前对象已拒绝非法变化。', '聚合根守住一次性一致'],
      ['事务只包一个聚合', '一次普通数据库事务尽量只修改一个聚合，跨聚合协作通过领域事件、流程管理或后续命令完成。库存预留与订单创建若要最终一致，应分别记录状态、事件和补偿，而不是用一个巨大事务锁住多个服务。失败边界是为了“简单”把所有相关表放进同一事务，导致热点行长时间持锁；验证证据是事务时间、锁等待、失败回滚和跨聚合最终状态报告。', '小事务换可控一致性'],
      ['跨聚合按标识引用', '聚合之间保存对方标识而非对象图，通过应用服务加载所需聚合并显式执行命令。引用对象会诱导跨边界直接修改，并让聚合加载出巨大依赖图。失败边界是把 ORM 懒加载当作领域关系，序列化时触发隐藏查询甚至循环引用；验证证据是领域对象不依赖会话，仓储接口按聚合根加载，查询 SQL 数量与预期一致。', '引用 ID 不引用内部对象'],
      ['上下文映射与防腐', '用上下文映射记录合作关系、共享内核、客户方与供应方、防腐层等关系。外部模型进入本上下文前先翻译为本地上下文对象，禁止直接使用对方 JSON 当作领域实体。失败边界是共享内核被多个团队任意修改，升级时无人能判断兼容性；验证证据是映射图、转换测试和一支旧版本消息仍能被防腐层正确处理的回归用例。', '跨边界先翻译再使用'],
    ],
  },
  {
    name: seName(e1Stage, '端口适配器与依赖倒置'),
    track,
    contentStatus: 'reviewed',
    minutes: 44,
    prerequisite: '能识别模块依赖方向，并会为一个用例编写不依赖数据库或 HTTP 框架的单元测试。',
    goal: '用入站端口、出站端口和适配器隔离业务逻辑，能在不修改领域代码的前提下替换数据库、消息和外部服务。',
    guidedPractice: '为“提交订单”定义入站端口 SubmitOrder，为订单仓储和事件发布定义出站端口；分别实现 HTTP 入站适配器和 PostgreSQL、内存出站适配器，在测试中只组装领域与内存适配器验证用例。',
    independentPractice: '把一个小服务的第三方短信调用改为端口适配器，加入超时、幂等和失败记录；用一个可编程假适配器制造超时与重复回调，证明应用服务行为不依赖具体供应商 SDK。',
    commonErrors: [
      '让领域层直接导入 ORM、HTTP 框架或云 SDK，所谓端口只是给外部包换了个名字，依赖仍然朝外。',
      '适配器承担业务决策，例如在数据库仓储里偷偷修改订单状态，导致同一规则在 HTTP 与消息入口表现不同。',
    ],
    sourceRefs: ['Alistair Cockburn: Hexagonal Architecture. https://alistair.cockburn.us/hexagonal-architecture/', DDD_REFERENCE, ENVOY],
    steps: [
      ['入站与出站端口', '入站端口描述应用能执行的用例，例如 SubmitOrder、CancelOrder；出站端口描述应用需要的仓储、消息、时钟和外部支付能力。端口属于应用与领域内侧，HTTP、Kafka、PostgreSQL 只是外侧适配器。失败边界是把端口定义成 Controller 或 RepositoryImpl，端口仍被框架类型污染；验证证据是领域测试只导入内侧模块，替换适配器不修改用例代码。', '端口描述能力而非技术'],
      ['适配器只做翻译', '适配器负责协议解析、认证信息提取、调用端口、把结果转换成 HTTP 响应或消息确认，不应决定订单能否取消。数据库适配器把领域对象映射为行，消息适配器把领域事件映射为传输格式。失败边界是适配器直接拼接 SQL 业务条件或修改状态机；验证证据是同一用例分别经 HTTP 和消息入口执行，得到相同领域结果与错误码。', '技术细节留在边界'],
      ['组合根集中装配', '在进程入口创建数据库连接、消息客户端和具体适配器，再注入应用服务。领域代码只接收接口，不读取全局单例或服务定位器。失败边界是业务类内部 new 出真实客户端，测试无法替换且启动时产生网络副作用；验证证据是依赖图、构造函数和启动日志，测试组合根可使用内存适配器启动完整用例。', '入口处决定具体实现'],
      ['测试替身分层', '纯领域测试不需要数据库；应用层测试使用可控的内存仓储验证状态和事件；适配器测试才连接真实 PostgreSQL、Kafka 或外部沙箱。每层测试证明不同风险，不能用 mock 代替 SQL 约束和序列化。失败边界是所有依赖都 mock，结果通过但真实事务或消息格式失败；验证证据是测试金字塔分布、容器集成测试和一次真实适配器故障注入。', '替身不能替代真实风险'],
      ['架构约束可执行', '把 domain、application、adapters 的允许依赖写入构建规则，禁止 domain 导入框架包；端口变更需要所有权与兼容评审。失败边界是规则发布后没有持续执行，新人很快把数据库注解加回实体；验证证据是 CI 运行架构测试、依赖图和模块大小趋势，违反规则时提供清晰错误位置。', '依赖倒置靠检查维持'],
    ],
  },
  {
    name: seName(e1Stage, 'REST/RPC、幂等和错误契约'),
    track,
    contentStatus: 'reviewed',
    minutes: 47,
    prerequisite: '能设计基本 HTTP 接口，理解状态码、请求头、超时和重试，并能读写 JSON 示例。',
    goal: '按资源或操作语义选择 REST/RPC，设计可安全重试的幂等接口和稳定错误模型，使客户端能区分可重试、不可重试与状态未知。',
    guidedPractice: '为创建订单和取消订单各写 REST 与 RPC 变体，比较状态码和资源标识；实现 Idempotency-Key 表，使同一键重复提交返回相同订单，不同请求体复用同一键返回 409，并在网关和应用日志中记录 trace_id。',
    independentPractice: '为一个支付回调设计幂等与错误契约，覆盖重复回调、签名失败、处理中超时、业务拒绝和下游不可用；写出客户端重试表，并用本地集成测试逐项验证。',
    commonErrors: [
      '把“创建订单”写成可无限重试的 POST，却不保存幂等键，网络超时后客户端重试造成重复扣款。',
      '所有错误都返回 500 和一段自由文本，客户端无法区分参数错误、权限失败、冲突、限流与暂时不可用，也无法生成稳定告警。',
    ],
    sourceRefs: [RFC_9110, RFC_9457, 'Stripe idempotent requests. https://docs.stripe.com/api/idempotent_requests'],
    steps: [
      ['资源与操作语义', 'REST 以资源标识和统一方法表达能力，创建返回 201 与 Location，删除可重复调用时保持目标状态；RPC 更适合明确命令和复杂参数，但每个方法仍需要稳定错误语义。失败边界是只追求 URL 形式，把取消订单写成 GET 或让 POST 返回 200 掩盖创建失败；验证证据是接口测试矩阵检查方法、状态码、Location、幂等性和缓存头。', '先定语义再定 URL'],
      ['幂等键设计', '写请求接收客户端生成的 Idempotency-Key，服务端把键、主体、请求体哈希、处理状态和结果原子保存。相同主体与键命中已完成请求时返回原结果，处理中返回 409 或可查询状态，键相同但请求哈希不同则拒绝。失败边界是只做内存去重，实例重启后重复执行；验证证据是并发发送两个相同请求，数据库只出现一条订单和一条幂等记录，响应负载与首次一致。', '幂等键绑定主体与请求体'],
      ['稳定错误模型', '错误响应使用 RFC 9457 字段：type、title、status、detail、instance，并扩展稳定业务 code、retryable 和 trace_id。参数错误用 400/422，认证失败 401，无权 403，资源不存在 404，冲突 409，限流 429，暂时不可用 503。失败边界是把内部异常类名和堆栈直接暴露给外部；验证证据是错误快照测试和日志检索，客户端只依赖 code 与 retryable，不解析中文正文。', '错误码先于错误文案'],
      ['重试边界', '只有明确可重试的错误才允许自动重试，例如 429 和带 Retry-After 的 503；请求必须幂等或携带幂等键，重试共用总 deadline 并加入抖动。超时属于结果未知，不能当作肯定失败直接换新请求。失败边界是网关、SDK 和业务代码三层各自重试，放大请求量；验证证据是故障注入统计原始请求、实际下游请求、重复副作用和总延迟，确认重试预算生效。', '每层重试共享一个预算'],
      ['兼容与契约测试', '新增字段保持可选，删除字段先弃用并观察消费方；枚举消费者遇到未知值要有兜底。提供方用 OpenAPI 或 protobuf 生成契约，消费者运行契约测试并在 CI 中固定旧版本样例。失败边界是线上客户端仍发送旧字段，新版本直接拒绝导致全量故障；验证证据是滚动升级期间新旧客户端请求成功率，以及契约矩阵对最近两个版本的通过记录。', '版本演进要兼容旧消费者'],
    ],
  },
  {
    name: seName(e1Stage, '事务边界、Outbox 和领域事件'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解数据库事务、消息队列至少一次投递和领域事件，能编写事务内与事务外两类测试。',
    goal: '在数据库事务中同时保存业务状态与 Outbox 事件，通过独立中继可靠发布，并用消费幂等、重试和死信处理验证最终一致性。',
    guidedPractice: '为订单创建建立 orders 与 outbox 表，在同一个事务写入订单和 OrderCreated 事件；中继进程按 FOR UPDATE SKIP LOCKED 领取待发记录，发布成功后标记 sent，消费者用 event_id 去重并记录处理结果。',
    independentPractice: '制造数据库提交成功但消息发布失败、消息发布成功但标记失败、消费者重复收到三类故障，分别证明事件最终可达、重复消息不产生二次副作用、积压可被监控与恢复。',
    commonErrors: [
      '先提交订单事务再直接发送 Kafka，消息失败或进程崩溃时业务已成功但事件永久丢失。',
      '认为至少一次投递等于只投一次，消费者没有去重表或幂等更新，重复消息导致重复扣库存和重复通知。',
    ],
    sourceRefs: [OUTBOX, KAFKA_DOCS, 'Debezium Outbox Event Router. https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html'],
    steps: [
      ['同一事务写业务与事件', 'Outbox 表保存 event_id、aggregate_id、event_type、payload、occurred_at 和状态，与业务变更在同一数据库事务提交。任何一步失败都整体回滚，因此不存在“业务成功但事件记录不存在”。失败边界是事件 payload 引用事务外对象或序列化在提交后才进行；验证证据是故意让 Outbox 插入失败，确认订单未提交，再检查同事务测试和数据库行数。', '业务状态与待发事件同生共死'],
      ['独立中继发布', '中继进程只负责领取、发布和标记状态，不能混入业务事务。多实例可用锁或 SKIP LOCKED 分片领取，发布超时时保留记录并延迟重试。失败边界是把发布放在 HTTP 请求主线程，消息慢拖垮用户响应，或在失败时删除 Outbox；验证证据是单实例停机、重启和并发中继测试，事件不会因重复领取而丢失，积压与最老记录年龄可观测。', '发布器与业务请求解耦'],
      ['消费端幂等', '消费者以 event_id 建唯一约束，在同一本地事务完成去重记录与业务变更。若业务按状态机更新，还可通过版本号或条件更新拒绝旧事件。失败边界是去重表和业务表不在同一事务，标记已处理后业务失败；验证证据是并发重复投递同一事件，结果表只变化一次，处理记录与业务状态保持一致。', '重复投递靠消费端收口'],
      ['领域事件契约', '事件是不可变事实，使用过去式命名并携带 event_id、schema_version、aggregate_id、occurred_at、trace_id 和最小必要数据。消费者不依赖提供方数据库，未知字段应忽略，未知版本进入拒绝或兼容分支。失败边界是把完整 ORM 实体序列化，字段改名即破坏消费者；验证证据是 Schema 兼容检查、固定历史事件回放和反序列化失败告警。', '事件写事实并保留版本'],
      ['故障恢复与积压', '为重试设置退避上限，持续失败的消息进入死信或隔离表并保留原消息与异常；运行手册说明如何修复、重放和限制重放速率。监控 Outbox 最老年龄、发布失败率、消费者滞后和死信数量。失败边界是死信只存不处理，或全速重放拖垮数据库；验证证据是一次隔离消息修复后受控重放，订单最终状态、事件数量与用户通知各只出现一次。', '重放也必须可观测可限速'],
    ],
  },
  {
    name: seName(e1Stage, '契约测试、消费者与版本演进'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能阅读 HTTP/protobuf 契约，理解提供方、消费者和至少一次消息投递，并会运行集成测试。',
    goal: '识别契约消费者，建立提供方验证与消费者驱动测试，按兼容规则演进 API 和事件，并在发布前自动阻止破坏性变更。',
    guidedPractice: '选订单 API 的两个消费者，写出它们实际依赖的状态码、字段和错误码契约；在提供方 CI 中运行消费者契约，故意删除一个必选字段，确认构建失败并给出受影响消费者。',
    independentPractice: '为一个订单事件建立包含提供方、两个消费者和 Schema 注册表的兼容矩阵，设计一次字段弃用：先双发、观察旧字段使用、再停用，并保留每个阶段的可回滚点。',
    commonErrors: [
      '契约测试只测提供方自己生成的 OpenAPI 响应，没有消费者真实使用样例，字段语义变化仍然漏检。',
      '为了快速上线直接删除字段或改变枚举含义，把发布成功误认为兼容成功，直到旧客户端大面积报错才发现。',
    ],
    sourceRefs: ['Pact documentation. https://docs.pact.io/', 'OpenAPI Specification. https://spec.openapis.org/oas/latest.html', 'Protobuf language guide. https://protobuf.dev/programming-guides/proto3/'],
    steps: [
      ['列出契约消费者', '从网关日志、仓库引用和消息订阅清单找出真实消费者，按团队、版本、调用频率和业务重要性登记。每个消费者确认实际使用的字段、状态码、超时和重试行为。失败边界是只询问当前团队，遗漏移动端、报表任务和第三方集成；验证证据是访问日志与订阅清单交叉核对，抽一个低频消费者完成旧版本请求回放。', '消费者清单决定兼容范围'],
      ['消费者驱动契约', '消费者用测试表达对提供方的期望，生成 pact 或 protobuf 样例；提供方在 CI 中验证这些期望并发布结果。契约只覆盖跨边界行为，不复制内部单元测试。失败边界是契约由提供方单方面编写，消费者从未参与；验证证据是破坏性变更时能在提供方流水线准确指出消费者和失败字段。', '契约从真实使用出发'],
      ['兼容规则自动化', 'HTTP 新增可选字段通常兼容；删除字段、收紧校验、改变状态码或让枚举含义漂移通常破坏兼容。消息使用字段编号，禁止复用编号，Schema 注册表配置向后或向前兼容检查。失败边界是文档写了规则但 CI 只运行类型检查；验证证据是准备一组兼容与破坏性样例，兼容样例通过、破坏样例被门禁阻断。', '兼容规则交给 CI 执行'],
      ['双版本与观察期', '需要破坏性变更时先发布新版本或新字段，旧版本继续服务并记录调用者、调用量和错误；提供迁移指南与截止日期，制造旧路径即将停用的可观测告警。失败边界是双版本发布后无人观察旧调用，截止日全量切换；验证证据是旧版本使用量按周下降、迁移确认名单和一次旧客户端兼容回放。', '先并行再退出旧版本'],
      ['发布后验证', '契约测试通过只证明样例，不证明线上路由、认证和序列化配置一致。发布后按真实入口检查响应字段、错误码、延迟和消费者成功率，灰度期间同时对照新旧版本。失败边界是测试环境通过后直接全量，网关转换层仍丢失字段；验证证据是金丝雀消费者成功率、Trace 中契约版本属性和回滚后的恢复时间。', '契约要在真实入口复验'],
    ],
  },
], e1Examples);

// ── E2 分布式、数据一致性与高并发 ───────────────────────────────────────────
const e2Stage = '分布式、数据一致性与高并发';

const e2Examples: Record<string, StepExample> = {};

Object.assign(e2Examples, {
  '分区时先选响应': seExample(
    '库存读写分区策略矩阵',
    'json',
    `{
  "reserve_stock": { "quorum": "majority", "partition": "reject", "error": 503 },
  "read_stock": { "source": "leader", "partition": "cached_as_of", "max_age_s": 30 },
  "recommendation": { "source": "local_cache", "partition": "serve_stale", "max_age_s": 300 }
}
`,
    `$ jq 'to_entries[] | {operation:.key, partition:.value.partition}' cap-matrix.json
{"operation":"reserve_stock","partition":"reject"}
{"operation":"read_stock","partition":"cached_as_of"}
{"operation":"recommendation","partition":"serve_stale"}
强一致写入与只读推荐在分区时有不同策略。`,
  ),
  '正常路径的延迟取舍': seExample(
    '跨区域网络延迟基线',
    'bash',
    `tc qdisc add dev eth0 root netem delay 55ms 8ms
k6 run --vus 30 --duration 90s write-orders.js
psql "$DATABASE_URL" -c "SHOW synchronous_commit;"
tc qdisc delete dev eth0 root
`,
    `$ k6 run --vus 30 --duration 90s write-orders.js
http_req_duration: avg=118ms p(95)=241ms p(99)=386ms
$ psql "$DATABASE_URL" -c "SHOW synchronous_commit;"
 synchronous_commit
 on
跨区同步写 p99 从 180ms 升到 386ms，延迟代价可量化。`,
  ),
  '读一致性与会话': seExample(
    '写后读携带版本令牌',
    'typescript',
    `type ReadOptions = { minVersion?: number; replica: 'primary' | 'replica' };
async function getOrder(id: string, options: ReadOptions) {
  if ((options.minVersion ?? 0) > (await replicaVersion())) {
    return readFromPrimary(id);
  }
  return readFromReplica(id);
}
const saved = await saveOrder({ id: 'o-1042', status: 'submitted' });
const loaded = await getOrder(saved.id, { minVersion: saved.version, replica: 'replica' });
console.log({ savedVersion: saved.version, loadedVersion: loaded.version });
`,
    `$ pnpm exec tsx read-your-writes.ts
{ savedVersion: 41, loadedVersion: 41 }
副本版本不足时自动回主库，保存后立即读取不会返回旧值。`,
  ),
  '副本与确认配置': seExample(
    'Kafka 最小同步副本配置',
    'bash',
    `kafka-configs.sh --bootstrap-server localhost:9092 \
  --entity-type topics --entity-name orders \
  --alter --add-config min.insync.replicas=2
kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic orders | Select-String "ReplicationFactor|min.insync"
`,
    `$ kafka-topics.sh --describe --topic orders
Topic: orders PartitionCount: 6 ReplicationFactor: 3
Configs: min.insync.replicas=2
Topic: orders Partition: 0 Leader: 2 Replicas: 2,1,3 Isr: 2,1,3
acks=all 与两个同步副本可在单 broker 故障时继续安全写入。`,
  ),
  '恢复与对账': seExample(
    '旧事件与当前状态对账',
    'sql',
    `SELECT o.id,
       o.version AS order_version,
       max(e.aggregate_version) AS latest_event_version,
       count(*) FILTER (WHERE e.aggregate_version <= o.version) AS stale_events
FROM orders o
LEFT JOIN domain_events e ON e.aggregate_id = o.id
GROUP BY o.id, o.version
HAVING max(e.aggregate_version) IS DISTINCT FROM o.version
ORDER BY o.id
LIMIT 100;
`,
    `$ psql "$DATABASE_URL" -f reconcile-events.sql
 id      order_version latest_event_version stale_events
 o-1021  7             6                    1
 o-1042  12            12                   0
1 条事件落后、1 条一致；旧事件会按版本忽略而不会覆盖新状态。`,
  ),
});

Object.assign(e2Examples, {
  '选择编排或协同': seExample(
    '订单 Saga 状态机',
    'typescript',
    `type Step = 'reserve' | 'pay' | 'ship' | 'done' | 'compensate';
class OrderSaga {
  step: Step = 'reserve';
  advance(event: 'reserved' | 'paid' | 'failed') {
    if (this.step === 'reserve' && event === 'reserved') this.step = 'pay';
    else if (this.step === 'pay' && event === 'paid') this.step = 'ship';
    else if (event === 'failed') this.step = 'compensate';
    console.log({ step: this.step, event });
  }
}
const saga = new OrderSaga();
saga.advance('reserved');
saga.advance('paid');
`,
    `$ pnpm exec tsx order-saga.ts
{ step: 'pay', event: 'reserved' }
{ step: 'ship', event: 'paid' }
流程状态集中可查询，补偿状态不会被事件的偶发顺序隐式跳过。`,
  ),
  '设计可执行补偿': seExample(
    '释放库存补偿幂等',
    'sql',
    `INSERT INTO commands (command_id, type, aggregate_id, status)
VALUES ('cmd-release-771', 'ReleaseReservation', 'res-771', 'pending')
ON CONFLICT (command_id) DO NOTHING;

UPDATE reservations
SET status = 'released', released_at = now()
WHERE id = 'res-771' AND status = 'reserved';

UPDATE commands SET status = 'done'
WHERE command_id = 'cmd-release-771';
`,
    `$ psql "$DATABASE_URL" -f compensate-release.sql
INSERT 0 1
UPDATE 1
UPDATE 1
再次执行 INSERT 0 和 UPDATE 0，补偿命令不会重复释放或覆盖已释放状态。`,
  ),
  '消息键与顺序': seExample(
    '同一订单事件固定分区键',
    'bash',
    `printf '%s\n' \
  '{"orderId":"o-1042","version":1,"type":"Created"}' \
  '{"orderId":"o-1042","version":2,"type":"Paid"}' \
| kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic orders --property parse.key=true --property key.separator='|'
`,
    `$ kafka-console-producer.sh ... --topic orders
> o-1042|{"orderId":"o-1042","version":1,"type":"Created"}
> o-1042|{"orderId":"o-1042","version":2,"type":"Paid"}
> o-1042|{"orderId":"o-1042","version":3,"type":"Cancelled"}
相同 key 被写入同一分区，消费者按 version 拒绝旧状态。`,
  ),
  '状态机与超时': seExample(
    '持久化 Saga 超时任务',
    'sql',
    `WITH due AS (
  SELECT id
  FROM saga_instances
  WHERE status = 'waiting_payment'
    AND next_deadline <= now()
  ORDER BY next_deadline
  FOR UPDATE SKIP LOCKED
  LIMIT 20
)
UPDATE saga_instances s
SET status = 'compensating',
    last_error = 'PAYMENT_TIMEOUT'
FROM due
WHERE s.id = due.id
RETURNING s.id, s.order_id, s.next_deadline;
`,
    `$ psql "$DATABASE_URL" -f claim-expired-sagas.sql
  id   order_id next_deadline
 1007 o-1042   2026-11-24 09:10:00+08
UPDATE 1
实例重启后调度器仍能领取超时流程，不会因内存定时器丢失而悬挂。`,
  ),
  '故障与人工兜底': seExample(
    '补偿失败进入人工队列',
    'powershell',
    `Get-Content saga-events.ndjson | ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.step -eq 'compensate' -and $_.status -eq 'failed' } |
  Select-Object order_id, attempts, last_error |
  Export-Csv manual-review.csv -NoTypeInformation
Import-Csv manual-review.csv | Format-Table
`,
    `order_id attempts last_error
-------- -------- ----------
o-1042   5        PAYMENT_REVERSAL_UNKNOWN
o-1088   3        INVENTORY_TIMEOUT
2 个流程无法自动收敛，已进入人工队列并保留重试与错误证据。`,
  ),
});

Object.assign(e2Examples, {
  '缓存一致性顺序': seExample(
    '更新数据库后删除缓存',
    'bash',
    `psql "$DATABASE_URL" -c \
  "UPDATE products SET price=199, version=version+1 WHERE id='p-7';"
redis-cli DEL product:p-7
redis-cli SET product:p-7 \
  '{"id":"p-7","price":199,"version":42}' EX 300 NX
`,
    `UPDATE 1
(integer) 1
OK
数据库先提交版本 42，再删除旧缓存；并发回填只能写入带一致版本的值。`,
  ),
  '穿透与雪崩边界': seExample(
    '单飞锁与空值缓存',
    'bash',
    `redis-cli SET lock:product:p-404 token-71 NX PX 2000
redis-cli SET product:p-404 '{"missing":true}' EX 30
redis-cli TTL product:p-404
redis-cli DEL lock:product:p-404
`,
    `OK
OK
(integer) 30
(integer) 1
缺失商品只允许一个请求回源，空值缓存 30 秒防止高基数穿透。`,
  ),
  '分片键与访问模式': seExample(
    '按租户路由订单分片',
    'typescript',
    `const shardCount = 16;
const shardFor = (tenantId: string) => {
  let hash = 2166136261;
  for (const char of tenantId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) % shardCount;
};
for (const tenant of ['tenant-a', 'tenant-b', 'tenant-big']) {
  console.log(tenant, shardFor(tenant));
}
`,
    `$ pnpm exec tsx route-order.ts
tenant-a 3
tenant-b 11
tenant-big 7
同一租户稳定进入同一分片；订单号查询需要同时携带 tenant_id 或全局索引。`,
  ),
  '读写分离与延迟': seExample(
    '复制延迟与陈旧读门禁',
    'sql',
    `SELECT client_addr,
       state,
       sent_lsn,
       replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_bytes
FROM pg_stat_replication;

SELECT now() - pg_last_xact_replay_timestamp() AS replica_lag;
`,
    `$ psql "$REPLICA_URL" -f replication-lag.sql
 client_addr | state     | replay_bytes | replica_lag
 10.0.4.12   | streaming | 0 bytes      | 00:00:00.842
延迟 842ms 未超过 2s 阈值，普通读可走副本；写后读仍固定走主库。`,
  ),
  '扩容与回滚验证': seExample(
    '一致性哈希迁移分布对比',
    'typescript',
    `const tenants = Array.from({ length: 10000 }, (_, i) => 'tenant-' + i);
const route = (count: number) => tenants.map((t) => {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % count;
});
const before = Array(8).fill(0);
const after = Array(12).fill(0);
route(8).forEach((s) => before[s]++);
route(12).forEach((s) => after[s]++);
console.log({ min8: Math.min(...before), max12: Math.max(...after) });
`,
    `$ pnpm exec tsx shard-plan.ts
{ min8: 1203, max12: 861 }
$ psql "$DATABASE_URL" -f reconcile-shards.sql
mismatched_rows=0
迁移前后分片分布可解释，双写对账为零后才允许切主。`,
  ),
});

Object.assign(e2Examples, {
  '自上而下分配 deadline': seExample(
    '订单链路超时预算',
    'yaml',
    `entrypoint:
  total_deadline_ms: 2000
  gateway_timeout_ms: 1900
services:
  orders:
    timeout_ms: 1200
    downstream:
      inventory: 400
      payment: 600
retry:
  max_attempts: 2
  uses_remaining_deadline: true
`,
    `$ yq '.services.orders' timeout-budget.yaml
timeout_ms: 1200
downstream:
  inventory: 400
  payment: 600
Trace 显示库存 390ms、支付 580ms、订单 1010ms，均未超各自预算。`,
  ),
  '重试只用于可恢复错误': seExample(
    '带抖动的幂等重试',
    'typescript',
    `async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (error) {
      if (i === attempts - 1) throw error;
      const base = 50 * 2 ** i;
      await new Promise((resolve) => setTimeout(resolve, base + Math.random() * base));
    }
  }
  throw new Error('unreachable');
}
await retry(() => client.post('/orders', body, {
  headers: { 'idempotency-key': 'o-1042' },
}));
`,
    `$ node --import tsx retry-demo.ts
attempt=1 delay=63ms status=503
attempt=2 delay=118ms status=201
created_orders=1
两次 HTTP 调用携带同一幂等键，业务结果只生成一张订单。`,
  ),
  '熔断器状态机': seExample(
    'Envoy 熔断指标',
    'bash',
    `curl -s localhost:9901/stats |
  Select-String 'cluster.orders.circuit_breakers.default.cx_open'
curl -s localhost:9901/stats |
  Select-String 'cluster.orders.upstream_rq_pending_overflow'
`,
    `cluster.orders.circuit_breakers.default.cx_open: 1
cluster.orders.circuit_breakers.default.rq_open: 37
cluster.orders.upstream_rq_pending_overflow: 12
熔断已打开并拒绝 37 个请求，故障没有穿透到线程池。`,
  ),
  '连接池与并发隔离': seExample(
    '数据库连接池过载拒绝',
    'typescript',
    `class BoundedPool {
  private active = 0;
  constructor(private readonly max = 20) {}
  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) throw new Error('POOL_SATURATED');
    this.active += 1;
    try { return await job(); } finally { this.active -= 1; }
  }
}
const pool = new BoundedPool();
const results: Record<string, number> = {};
await Promise.all(Array.from({ length: 25 }, async () => {
  try {
    await pool.run(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    results.ok = (results.ok ?? 0) + 1;
  } catch (error) {
    const key = (error as Error).message;
    results[key] = (results[key] ?? 0) + 1;
  }
}));
console.log(results);
`,
    `$ pnpm exec tsx pool-demo.ts
{ ok: 20, POOL_SATURATED: 5 }
连接上限生效，超额请求快速失败而不是无限排队；健康检查使用独立小连接池。`,
  ),
  '过载与降级验证': seExample(
    '核心交易过载阈值测试',
    'javascript',
    `import http from 'k6/http';
import { check } from 'k6';
export const options = {
  scenarios: {
    overload: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      stages: [
        { target: 1200, duration: '2m' },
        { target: 1200, duration: '1m' },
      ],
    },
  },
  thresholds: { 'http_req_failed{critical:true}': ['rate<0.01'] },
};
export default function () {
  const res = http.post('http://gateway.test/orders', '{}');
  check(res, { 'critical alive': (r) => r.status < 500 });
}
`,
    `$ k6 run overload.js
http_req_duration: p(95)=480ms
http_req_failed{critical:true}: 0.42%
recommendation_requests_dropped: 68.1%
推荐降级后核心下单错误率仍低于 1%，数据库连接未达到上限。`,
  ),
});

Object.assign(e2Examples, {
  '流量模型与资源账': seExample(
    'Little 定律计算并发与副本',
    'typescript',
    `const peakRps = 1200;
const averageSeconds = 0.25;
const concurrency = peakRps * averageSeconds;
const perInstance = 8;
const faultTolerance = 1.34;
const instances = Math.ceil((concurrency / perInstance) * faultTolerance);
console.log({
  peakRps,
  concurrency,
  instances,
  spare: instances * perInstance - concurrency,
});
`,
    `$ pnpm exec tsx capacity.ts
{ peakRps: 1200, concurrency: 300, instances: 51, spare: 108 }
按峰值 1200 RPS、250ms 停留时间和 N+1.34 余量，需要至少 51 个可承载实例。`,
  ),
  '热点定位与拆分': seExample(
    'PromQL 查找分片热点',
    'promql',
    `topk(5,
  sum by (tenant_id) (
    rate(http_requests_total{service="orders"}[5m])
  )
)`,
    `$ curl -sG localhost:9090/api/v1/query \
  --data-urlencode 'query=topk(5,sum by(tenant_id)(rate(http_requests_total{service="orders"}[5m])))'
tenant tenant-big 412.7 req/s
tenant tenant-7   88.1 req/s
tenant tenant-12  51.4 req/s
tenant-big 流量是第二名的四倍以上，可独立分片而不影响普通租户。`,
  ),
  '故障域与冗余': seExample(
    '检查副本跨节点与可用区',
    'bash',
    `kubectl get pods -n orders \
  -o custom-columns='POD:.metadata.name,NODE:.spec.nodeName,ZONE:.metadata.labels.topology\\.kubernetes\\.io/zone'
kubectl get pdb orders-api -n orders \
  -o jsonpath='{.status.currentHealthy}{" expected="}{.status.desiredHealthy}{"\\n"}'
`,
    `POD           NODE           ZONE
orders-api-1 node-a-17 az-a
orders-api-2 node-b-04 az-b
orders-api-3 node-c-11 az-c
3 expected=2
三个副本分布在三个可用区，PDB 要求至少两个健康副本。`,
  ),
  '分级降级': seExample(
    '按业务等级关闭推荐',
    'yaml',
    `features:
  recommendation_feed:
    enabled: false
    trigger: database_cpu_utilization > 0.85
    fallback: cached_popular_items
  export_reports:
    enabled: false
    trigger: queue_lag_seconds > 120
  checkout:
    enabled: true
    never_disable: true
`,
    `$ yq '.features | to_entries[] | [.key, .value.enabled]' degradation.yaml
- recommendation_feed
- false
- export_reports
- false
- checkout
- true
过载时只关闭高成本低优先级功能，交易路径保持开启。`,
  ),
  '容量演练与报告': seExample(
    '节点容量安全水位',
    'promql',
    `max by (component) (
  (1 - node_capacity_available{resource="cpu"})
  / node_capacity_total{resource="cpu"}
)`,
    `$ curl -sG localhost:9090/api/v1/query \
  --data-urlencode 'query=max by(component)((1-node_capacity_available)/node_capacity_total)'
orders-api 0.68
orders-db  0.79
kafka      0.54
数据库安全水位最高，下一轮扩容应优先数据库存储与连接容量。`,
  ),
});

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E2_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e2Stage, 'CAP、延迟、可用性和一致性目标'),
    track,
    contentStatus: 'reviewed',
    minutes: 47,
    prerequisite: '理解复制、网络分区、事务和最终一致，能读数据库复制状态与一次分布式请求日志。',
    goal: '把 CAP 与 PACELC 落到具体读写路径，明确分区时牺牲什么、正常时用多少延迟换一致性，并设计可验证的数据目标。',
    guidedPractice: '为订单写入和商品浏览分别列出副本数、读写一致性、允许的数据陈旧时间和分区处理策略；把 PostgreSQL 同步提交、Kafka acks 与 Redis 副本读配置放到同一张决策表，标注延迟与故障代价。',
    independentPractice: '为一个多区域库存系统写一致性矩阵：哪些操作必须线性一致，哪些允许最终一致；为每个操作给出陈旧上限、对账任务、用户提示和分区期间降级动作。',
    commonErrors: [
      '把 CAP 理解成可以同时选择三个属性，或在没有网络分区时仍把 CAP 当成全部设计依据，忽略正常路径的延迟取舍。',
      '在页面上声称库存实时准确，后端却读取异步副本且没有陈旧时间显示，用户看到的可售数量与服务端提交结果冲突。',
    ],
    sourceRefs: [DDIA, 'Martin Kleppmann: Please Stop Calling Databases CP or AP. https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html', KAFKA_DOCS],
    steps: [
      ['分区时先选响应', '网络分区使部分节点无法通信时，系统要么拒绝可能不安全的读写以保持一致性，要么继续服务并承担陈旧或冲突。订单支付状态通常选择拒绝不确定写入并让客户端查询，商品推荐可以继续返回缓存；选择必须按操作而不是按整个数据库。失败边界是只给系统贴 CP/AP 标签，接口级行为仍无规定；验证证据是断开节点间网络后执行读写矩阵，检查返回码、数据版本和恢复后的冲突结果。', '一致性与可用性按操作选择'],
      ['正常路径的延迟取舍', 'PACELC 提醒即使没有分区，复制也要在延迟和一致性间取舍。跨区域强同步会增加写入 RTT，异步复制降低延迟但可能读到旧数据；单区域 quorum 也要计算 RTT 与故障容忍。失败边界是只看平均值隐藏跨区域 p99 放大；验证证据是按区域分别记录写延迟、复制确认数和读陈旧时间，并用目标负载观察尾延迟。', '没有分区时也在做取舍'],
      ['读一致性与会话', '用户写入后立即读取应走主库、会话粘滞或版本令牌，不能随机落到滞后副本。列表和统计可以接受最终一致，但响应应带 as_of 时间。失败边界是重试把请求从主库切到副本，用户刚保存的数据消失；验证证据是写后读测试在复制延迟注入下仍满足会话一致性，普通读的陈旧时间不超过约定阈值。', '刚写入的数据不能随机读副本'],
      ['副本与确认配置', '数据库同步提交、Kafka acks=all、min.insync.replicas 和消费者隔离级别共同决定持久性与吞吐。设置 acks=all 与 min.insync.replicas=2 可在单副本故障时避免丢消息，但主题和集群副本数不足时会拒绝生产。失败边界是参数看似安全却只有一个 broker 可用；验证证据是杀掉一个 broker 后生产失败模式符合预期，恢复后消息数量、偏移和持久化记录完整。', '确认级别要与副本数匹配'],
      ['恢复与对账', '分区或延迟期间可能产生重复、乱序和旧版本事件，恢复流程要有版本比较、幂等写入、对账任务和人工处理入口。将数据陈旧时间、复制滞后、冲突数和未对账记录放进监控。失败边界是网络恢复后直接全量覆盖，旧事件盖掉新状态；验证证据是做一次延迟副本恢复演练，最终状态收敛、冲突被记录、对账完成时间可度量。', '恢复后还要证明数据收敛'],
    ],
  },
  {
    name: seName(e2Stage, '消息、Outbox、Saga 和补偿'),
    track,
    contentStatus: 'reviewed',
    minutes: 49,
    prerequisite: '完成 Outbox 基础课，理解消息分区、至少一次投递、事务边界和幂等消费。',
    goal: '为跨服务业务流程选择编排或协同式 Saga，设计补偿状态机、消息键与超时，并用故障演练证明流程不会长期卡死或重复扣款。',
    guidedPractice: '实现“创建订单 → 预留库存 → 支付 → 确认发货”的四步 Saga，每一步保存命令 ID、状态、尝试次数和超时；在支付超时与库存预留失败两种场景触发补偿，记录订单最终状态和每个服务副作用。',
    independentPractice: '为退款流程设计协同式 Saga，明确事件顺序、幂等键、补偿不可逆点和人工介入条件；用消息重复、乱序和消费者停机测试状态机恢复。',
    commonErrors: [
      '把补偿当成回滚，认为订单取消后所有支付、通知和积分都能自动恢复到未发生状态，忽略已发送短信与第三方结算。',
      'Kafka 分区键随机选择，使同一订单的创建、支付与取消消息落到不同分区，多个消费者并行消费时状态倒退。',
    ],
    sourceRefs: [SAGA, OUTBOX, KAFKA_DOCS],
    steps: [
      ['选择编排或协同', '编排式 Saga 由中心流程管理器发命令并推进状态，容易观察与超时处理；协同式由服务监听事件自行响应，耦合低但整体流程分散。跨四个以上参与方且需要统一超时时，编排往往更易排障。失败边界是协同式事件链没有总状态，故障后无人知道流程停在哪里；验证证据是一张 Saga 状态图、流程实例表和可查询的步骤时间线。', '流程可观测优先于形式'],
      ['设计可执行补偿', '补偿不是数据库回滚，而是再执行一个业务动作，例如释放库存、关闭支付意图、标记订单取消失败待人工。每个正向步骤必须定义逆动作、幂等键、重试上限和不可逆影响。失败边界是补偿命令与正向命令共用同一幂等键，重复消息反而阻止补偿；验证证据是每个补偿至少一次成功、一次重复和一次超时测试，副作用只发生一次。', '补偿是新的业务动作'],
      ['消息键与顺序', '同一聚合的消息使用稳定键，例如 order_id 作为 Kafka key，使相关事件进入同一分区；消费者按聚合串行处理并比较 aggregate_version，忽略旧版本。失败边界是只按消息到达顺序假设全局有序；验证证据是并发生产乱序事件后，最终状态仍由最高版本决定，分区倾斜和消费滞后可监控。', '顺序只承诺在分区内'],
      ['状态机与超时', 'Saga 实例保存 current_step、next_deadline、attempts 和 last_error，调度器扫描超时任务并发出查询或补偿命令。每个外部调用必须有 deadline，恢复任务必须幂等。失败边界是只依赖内存定时器，实例重启后流程永久悬挂；验证证据是删除运行中的流程节点再恢复，截止时间到后能继续推进并留下完整审计。', '超时要有持久状态'],
      ['故障与人工兜底', '支付成功但订单取消、补偿连续失败或第三方状态不明时，应进入人工队列，展示业务键、已执行步骤和可安全操作。监控流程完成率、停留时长、补偿失败和人工积压。失败边界是死信消息无人处理，客户款项被扣而订单一直显示处理中；验证证据是一场端到端演练，自动路径、人工路径和通知均有时间戳与负责人。', '无法自动收敛的流程要有人接'],
    ],
  },
  {
    name: seName(e2Stage, '缓存、分片、读写分离和复制延迟'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解数据库索引、主从复制、哈希分片和缓存命中率，能查看 Redis 与数据库监控。',
    goal: '为读多写少和高基数数据设计缓存、分片与读写分离，量化命中率、复制延迟和热点，避免一致性与扩容副作用失控。',
    guidedPractice: '为商品详情加入 cache-aside：读缓存 miss 后查主库并写回，更新时先更新数据库再删除缓存，TTL 设 5 分钟加随机抖动；注入主从延迟与热点键，记录命中率、陈旧读和回源 QPS。',
    independentPractice: '为一个十亿级订单表设计按 tenant_id 哈希的分片方案，计算扩容前后的迁移批次、双写窗口和路由回滚；证明单一租户热点不会拖垮其他分片。',
    commonErrors: [
      '缓存更新采用先删缓存再写数据库，并发读在空窗期把旧值重新写回，之后长时间返回过期数据。',
      '按 user_id 分片后大量查询按订单号进行，导致每个请求都要扫描所有分片，分片只增加复杂度而没有提升查询能力。',
    ],
    sourceRefs: [REDIS_DOCS, DDIA, 'PostgreSQL high availability and replication. https://www.postgresql.org/docs/current/high-availability.html'],
    steps: [
      ['缓存一致性顺序', 'Cache-aside 常用顺序是更新数据库后删除缓存，下一次读取重建；另用消息或变更日志延迟删除以覆盖并发回填。为缓存值保存数据版本，读取旧版本时拒绝。失败边界是删除缓存失败只记录日志、没有重试；验证证据是并发读写脚本运行后缓存版本与数据库一致，延迟删除任务和缓存不一致计数可查询。', '数据库先成事实再处理缓存'],
      ['穿透与雪崩边界', '不存在的键使用短期空值缓存，热点未命中用单飞锁避免同时回源；TTL 加入随机抖动防止同刻过期。对恶意高基数键设置租户级限流。失败边界是空值永久缓存，新创建的数据一直查不到；验证证据是压测缓存清空后的回源 QPS、数据库连接数和批量过期时段的命中率。', '空值与同时失效都要设计'],
      ['分片键与访问模式', '分片键应同时满足高基数、分布均匀和大多数查询可路由，订单可按 tenant_id 分片，但订单号查询需要保存 tenant_id 或建立全局索引映射。失败边界是选择自增 ID 造成尾部热分片，或跨租户报表扇出过大；验证证据是分片数据量、QPS、锁等待和跨分片查询比例，抽样最大租户与普通租户的资源曲线。', '分片键由查询模式决定'],
      ['读写分离与延迟', '写请求走主库，写后读使用主库或会话令牌；普通读走从库并记录复制滞后。当滞后超过阈值时按比例切回主库，避免以牺牲整体数据库为代价。失败边界是故障切换后旧主库仍接收写入，形成双主冲突；验证证据是复制延迟注入期间的读陈旧率、主库负载和切换后的数据版本。', '读副本不是免费的容量'],
      ['扩容与回滚验证', '分片扩容使用一致性哈希或显式映射，先建设新分片、双写与回填，再切读、切写，最后删除旧路由；缓存与路由键版本化以便回退。失败边界是没有核对双写差异就切主，少数用户数据只写到一个分片；验证证据是迁移对账报告、逐租户抽样查询、切换期间错误率和回滚到旧路由的耗时。', '扩容路径必须能对账能回退'],
    ],
  },
  {
    name: seName(e2Stage, '超时、重试预算、熔断和背压'),
    track,
    contentStatus: 'reviewed',
    minutes: 49,
    prerequisite: '理解 HTTP 与消息调用、幂等键和分位延迟，能读网关、客户端和服务端监控。',
    goal: '建立端到端时间与并发预算，使超时、重试、熔断、连接池和队列共同限制故障扩散，并用负载与故障注入验证系统不会自我放大。',
    guidedPractice: '为一个下单请求分配 2 秒总 deadline：网关 1.9 秒、订单服务 1.2 秒、库存 400 毫秒；客户端仅对幂等请求重试两次并加抖动，熔断器统计 10 秒窗口错误率，队列达到 70% 时拒绝低优先级请求。',
    independentPractice: '为一条包含 Redis、数据库和第三方支付的链路建立超时预算表和重试表，覆盖成功、限流、超时、未知结果和连续失败；用故障注入验证调用次数不超过预算。',
    commonErrors: [
      '每一层都设置 30 秒超时并各自重试三次，单次用户请求最多放大成几十次下游调用，故障时形成重试风暴。',
      '熔断器打开后没有半开探测和恢复条件，依赖恢复仍永久拒绝，或关闭时没有最小请求量导致偶发错误立即触发。',
    ],
    sourceRefs: [ENVOY, SRE_BOOK, 'AWS Builders Library: Timeouts, retries and backoff with jitter. https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/'],
    steps: [
      ['自上而下分配 deadline', '先定义用户可接受的总时长，再按调用链分配各段预算，下游收到剩余 deadline 或 gRPC deadline 而不是固定完整超时。预算要覆盖重试与序列化，留出返回错误响应的空间。失败边界是上游 2 秒超时而下游仍继续执行十分钟；验证证据是 Trace 中每段 span 时长、取消传播日志和超时请求的资源回收时间。', '总预算向所有下游传播'],
      ['重试只用于可恢复错误', '重试条件限定为连接失败、429 和明确可重试的 503，写请求必须具备幂等键。使用指数退避、随机抖动和全局重试比例限制，避免所有客户端同时再次请求。失败边界是把业务 400 或未知支付结果重试成重复副作用；验证证据是故障注入记录下游调用次数、成功率和重复业务记录，重试放大倍数低于设定上限。', '重试不是免费的错误处理'],
      ['熔断器状态机', '熔断器按滚动窗口统计失败率、慢调用和最小请求量，超过阈值进入 open，经过冷却时间进入 half-open 并只放少量探测请求。熔断粒度按依赖实例、接口或租户隔离。失败边界是所有接口共用一个熔断器，一个慢报表拖垮登录；验证证据是注入依赖超时后 open 时间、被拒绝请求和恢复探测结果符合配置。', '熔断按故障边界隔离'],
      ['连接池与并发隔离', 'HTTP 客户端、数据库和线程池都要有上限，按调用类型分配连接或 semaphore。队列必须有长度上限和拒绝策略，不能用无限队列掩盖过载。失败边界是线程池满后请求无限等待，最终连健康检查也得不到线程；验证证据是逐步加压到过载，观察等待队列、拒绝数、p99 和健康检查仍能返回。', '有限并发才能形成背压'],
      ['过载与降级验证', '过载时按优先级丢弃低价值请求、返回缓存或进入排队页，保护核心下单和支付；通过负载分级和开关演练证明降级可快速生效。失败边界是降级代码从未执行，流量峰值的配置错误反而触发数据库全表查询；验证证据是压测曲线出现明确拐点、降级开关时间、核心请求成功率与恢复后的积压清空时间。', '降级要保核心而不是全停'],
    ],
  },
  {
    name: seName(e2Stage, '容量、热点、故障域和降级'),
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '能根据请求率、延迟、连接数和队列深度估算容量，理解服务分级与故障域。',
    goal: '把流量模型转成资源与队列容量，定位热点和单点，按故障域设计隔离，并用可量化降级方案保护核心业务。',
    guidedPractice: '用 Little 定律估算 1200 QPS、平均 250 ms 服务所需并发，再为突发、长尾、重试和副本故障留余量；给数据库连接、Kafka 分区、缓存带宽和 Pod 数分别建立容量表，做一次单可用区故障演练。',
    independentPractice: '为一个促销系统写容量与故障方案：列出前十大热点、每类故障域、核心与低优先级流量比例、降级顺序和资源回收步骤，并设计能在预发布环境执行的压测与演练计划。',
    commonErrors: [
      '只用平均 QPS 和平均延迟算容量，忽略活动日峰值、p99 长占连接以及重试放大，生产在远低于理论容量时先耗尽连接。',
      '把多副本当成跨故障域，所有 Pod 和数据库副本仍在同可用区或同一节点池，机房故障时一起失效。',
    ],
    sourceRefs: [SRE_BOOK, K8S_WORKLOADS, PROMETHEUS],
    steps: [
      ['流量模型与资源账', '容量从峰值 QPS、请求构成、读写比例、平均与分位延迟、数据增长和重试率推导。用并发≈到达率×停留时间估算线程或连接需求，再为故障切换保留 N+1。失败边界是只按历史平均流量采购，活动通知后流量翻倍才扩容；验证证据是容量模型、压测曲线和安全水位，预测值与实测资源偏差在可解释范围内。', '容量按峰值和停留时间算'],
      ['热点定位与拆分', '按租户、商品、分区键和实例统计请求、CPU、锁等待与队列深度，找出分布长尾中的热点。热门商品可做本地缓存与只读副本，超大租户可独立分片。失败边界是只看全局 CPU 平均值，单个分片已饱和但总览仍正常；验证证据是分片级指标、热点键排行榜和分流前后单分片利用率。', '平均值会藏住单点饱和'],
      ['故障域与冗余', '故障域包括进程、节点、可用区、区域、数据库主实例和共享网络设备。副本要跨节点与可用区分布，PDB 保护驱逐，数据库有自动故障转移和脑裂保护。失败边界是副本数看似足够却共享同一存储或同一配置源；验证证据是逐层关闭一个故障域，观察错误率、自动切换时间和数据一致性。', '冗余要跨越真实故障边界'],
      ['分级降级', '将流量分为交易、账户、浏览、推荐和报表等级，过载时按策略关闭报表、降低推荐刷新、返回短 TTL 缓存，尽量保留交易与账户。每项降级要有开关、负责人和恢复条件。失败边界是降级只隐藏前端模块，后端仍执行昂贵查询；验证证据是开启降级后下游 QPS、数据库负载和核心成功率的变化。', '降级必须减少后端成本'],
      ['容量演练与报告', '每个季度按目标流量做一次容量与故障联合演练，记录拐点、瓶颈资源、自动扩缩容延迟、降级效果和恢复时间。报告要给容量余量、风险和下一次扩容阈值。失败边界是演练只成功一次就结束，未保留原始数据和配置；验证证据是压测脚本、Prometheus 查询、时间线和行动项，下一轮能复现同样负载与结果。', '容量结论要能被复现'],
    ],
  },
], e2Examples);

// ── E3 Docker、Kubernetes、Helm 与配置 ──────────────────────────────────────
const e3Stage = 'Docker、Kubernetes、Helm 与配置';

const e3Examples: Record<string, StepExample> = {};

Object.assign(e3Examples, {
  '多阶段构建': seExample(
    'Node 服务多阶段运行镜像',
    'dockerfile',
    `FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=build /src/dist ./dist
USER nonroot
CMD ["dist/main.js"]
`,
    `$ docker build -t orders-api:sha-4f2a .
$ docker history --no-trunc orders-api:sha-4f2a | Select-Object -First 4
distroless/nodejs24-debian12:nonroot
COPY dist /app/dist
USER nonroot
运行镜像无编译器、源码和包管理器缓存。`,
  ),
  '固定运行身份': seExample(
    'Pod 强制非 root 与禁止提权',
    'yaml',
    `securityContext:
  runAsNonRoot: true
  runAsUser: 65532
  runAsGroup: 65532
  fsGroup: 65532
  seccompProfile:
    type: RuntimeDefault
containers:
  - name: orders-api
    image: registry.example/orders@sha256:4f2a
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
`,
    `$ kubectl exec deploy/orders-api -n orders -- id
uid=65532(nonroot) gid=65532(nonroot) groups=65532(nonroot)
$ docker inspect orders-api --format '{{.Config.User}}'
65532:65532
容器实际 UID 与 Pod securityContext 一致。`,
  ),
  '根文件系统只读': seExample(
    '临时目录显式挂载 emptyDir',
    'yaml',
    `containers:
  - name: orders-api
    image: registry.example/orders@sha256:4f2a
    securityContext:
      readOnlyRootFilesystem: true
    volumeMounts:
      - name: tmp
        mountPath: /tmp
volumes:
  - name: tmp
    emptyDir:
      sizeLimit: 256Mi
`,
    `$ kubectl exec deploy/orders-api -n orders -- sh -c 'echo probe > /app/cache'
sh: can't create /app/cache: Read-only file system
$ kubectl exec deploy/orders-api -n orders -- sh -c 'echo probe > /tmp/ok'
$ echo $LASTEXITCODE
0
根目录不可写，显式临时目录可写并在重启后清理。`,
  ),
  '不可变标签与签名': seExample(
    '镜像 digest、SBOM 与签名验证',
    'bash',
    `docker buildx build --push \
  --tag registry.example/orders:sha-4f2a \
  --metadata-file metadata.json .
syft registry.example/orders@sha256:4f2a -o cyclonedx-json > sbom.json
cosign sign --yes registry.example/orders@sha256:4f2a
cosign verify registry.example/orders@sha256:4f2a
`,
    `$ jq -r '.containerimage.digest' metadata.json
sha256:4f2a9be172d34af3c28e8e8b7d1a
$ syft ... -o cyclonedx-json > sbom.json
sbom_packages=184
$ cosign verify ...
Verified OK
部署使用 digest，且能追溯 commit、SBOM 和签名。`,
  ),
  '运行时验收': seExample(
    '只读根文件系统启动验收',
    'bash',
    `docker run --rm \
  --read-only \
  --user 65532:65532 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -p 3000:3000 \
  registry.example/orders@sha256:4f2a
docker run --rm --read-only image sh -c 'touch /app/x'
`,
    `orders-api listening on 3000
uid=65532
docker: Error response: read-only file system
正常启动与写根目录失败两类结果同时成立，安全上下文不是文档假设。`,
  ),
});

Object.assign(e3Examples, {
  '选控制器': seExample(
    '工作负载控制器选择表',
    'yaml',
    `workloads:
  orders-api:
    controller: Deployment
    reason: stateless_http_replicas
  postgres-primary:
    controller: StatefulSet
    reason: stable_identity_and_pvc
  nightly-reconcile:
    controller: CronJob
    schedule: "0 2 * * *"
    concurrencyPolicy: Forbid
  one-off-import:
    controller: Job
    backoffLimit: 2
`,
    `$ yq '.workloads.orders-api.controller, .workloads.postgres-primary.controller' workloads.yaml
Deployment
StatefulSet
控制器按生命周期、身份和存储需求选择，而不是按服务是否重要。`,
  ),
  'Deployment 发布': seExample(
    '限制滚动更新不可用副本',
    'yaml',
    `spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  revisionHistoryLimit: 5
  template:
    spec:
      containers:
        - name: orders-api
          image: registry.example/orders@sha256:4f2a
          readinessProbe:
            httpGet: { path: /ready, port: 3000 }
`,
    `$ kubectl rollout status deploy/orders-api -n orders
Waiting for deployment "orders-api" rollout to finish: 1 out of 4 updated...
deployment "orders-api" successfully rolled out
$ kubectl rollout history deploy/orders-api -n orders
deployment.apps/orders-api
REVISION  CHANGE-CAUSE
41        image=sha-31bd
42        image=sha-4f2a
发布过程中至少三个旧副本可用，历史保留五个 revision。`,
  ),
  'StatefulSet 身份': seExample(
    '数据库稳定身份与 PVC 模板',
    'yaml',
    `serviceName: postgres-headless
replicas: 3
podManagementPolicy: OrderedReady
volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
template:
  spec:
    containers:
      - name: postgres
        image: postgres:16.4-bookworm
        volumeMounts:
          - name: data
            mountPath: /var/lib/postgresql/data
`,
    `$ kubectl get pods,pvc -n orders
pod/postgres-0   1/1 Running
pod/postgres-1   1/1 Running
pvc/data-postgres-0  Bound  100Gi
pvc/data-postgres-1  Bound  100Gi
Pod 重建后仍使用相同名称和 PVC，主从身份不会与随机卷绑定。`,
  ),
  'Job 完成语义': seExample(
    '对账 CronJob 禁止并发叠加',
    'yaml',
    `schedule: "0 2 * * *"
concurrencyPolicy: Forbid
successfulJobsHistoryLimit: 3
failedJobsHistoryLimit: 3
jobTemplate:
  spec:
    backoffLimit: 2
    activeDeadlineSeconds: 1800
    template:
      spec:
        restartPolicy: Never
        containers:
          - name: reconcile
            image: registry.example/reconcile@sha256:91ab
`,
    `$ kubectl create job reconcile-manual --from=cronjob/reconcile -n orders
job.batch/reconcile-manual created
$ kubectl wait --for=condition=complete job/reconcile-manual -n orders --timeout=30m
job.batch/reconcile-manual condition met
任务有截止时间和重试上限，前一任务未结束时不会叠加启动。`,
  ),
  '故障观察': seExample(
    '镜像拉取失败事件定位',
    'bash',
    `kubectl get pods -n orders
kubectl describe pod orders-api-7f9c -n orders
kubectl logs orders-api-7f9c -n orders --previous
kubectl get events -n orders --sort-by=.lastTimestamp
`,
    `$ kubectl describe pod orders-api-7f9c -n orders
Events:
  Warning  Failed  38s  kubelet  Failed to pull image "orders:latest"
  Warning  Failed  38s  kubelet  ErrImagePull
$ kubectl get events -n orders --sort-by=.lastTimestamp
... ErrImagePull -> ImagePullBackOff
证据指向镜像标签或仓库认证，而不是应用启动崩溃。`,
  ),
});

Object.assign(e3Examples, {
  'Service 与端点': seExample(
    '核对 Service selector 与端口',
    'yaml',
    `apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  selector:
    app.kubernetes.io/name: orders-api
  ports:
    - name: http
      port: 80
      targetPort: http
`,
    `$ kubectl get endpointslices -n orders -l kubernetes.io/service-name=orders-api
NAME              ADDRESSTYPE   PORTS   ENDPOINTS
orders-api-abc12  IPv4          3000    10.42.3.18,10.42.5.21
$ kubectl exec deploy/client -n orders -- curl -sS http://orders-api/health
{"status":"ok","version":"sha-4f2a"}
选择器、命名端口与容器监听端口一致，两个可用端点正在接收流量。`,
  ),
  'ClusterIP 与 Headless': seExample(
    'Headless Service 返回数据库成员',
    'yaml',
    `apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None
  publishNotReadyAddresses: false
  selector:
    app.kubernetes.io/name: postgres
  ports:
    - name: postgres
      port: 5432
      targetPort: postgres
`,
    `$ kubectl exec deploy/client -n orders -- nslookup postgres-headless.orders.svc.cluster.local
Name:   postgres-headless.orders.svc.cluster.local
Address: 10.42.4.11
Address: 10.42.6.19
Address: 10.42.8.7
客户端按成员地址建连，主库身份由数据库选主与连接参数决定。`,
  ),
  'Ingress 与 TLS': seExample(
    '订单域名与 TLS 路由',
    'yaml',
    `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orders-public
  annotations:
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "3"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "15"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [orders.example.test]
      secretName: orders-tls
  rules:
    - host: orders.example.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: orders-api
                port:
                  name: http
`,
    `$ curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\\n' \
  https://orders.example.test/health
200 0
$ kubectl describe ingress orders-public -n orders
Rules: Host orders.example.test Path / backend orders-api:http
TLS: orders.example.test terminates at orders-tls
外部 TLS 证书、Host 和后端端口全部对齐。`,
  ),
  'DNS 与缓存': seExample(
    '区分短名与全限定服务名',
    'bash',
    `kubectl exec deploy/client -n orders -- \
  sh -c 'nslookup orders-api; nslookup orders-api.orders.svc.cluster.local'
kubectl run dns-test --rm -it --restart=Never \
  --image=busybox:1.36 -- nslookup orders-api.billing.svc.cluster.local
`,
    `Server: 10.96.0.10
Name: orders-api.orders.svc.cluster.local
Address: 10.96.44.18

Name: orders-api.billing.svc.cluster.local
NXDOMAIN
当前命名空间短名解析成功；跨命名空间必须使用服务中心的完整名称。`,
  ),
  '负载与连接参数': seExample(
    '代理空闲超时与后端 keep-alive',
    'yaml',
    `proxy:
  connect_timeout: 2s
  idle_timeout: 65s
  upstream_keepalive_timeout: 60s
  max_idle_connections: 128
  retry_on: 5xx
  num_retries: 1
`,
    `$ nginx -t -c /etc/nginx/nginx.conf
nginx: configuration file test is successful
$ hey -n 20000 -c 100 https://orders.example.test/health
Requests/sec: 3841.27
Error distribution: [0]
代理空闲超时大于后端 keep-alive，压测未出现复用连接导致的偶发 502。`,
  ),
});

Object.assign(e3Examples, {
  '配置分层': seExample(
    '默认配置与环境覆盖分层',
    'yaml',
    `layers:
  defaults: config/defaults.yaml
  environment: helm/values-prod.yaml
  runtime_toggle: apollo/orders.yaml
  secret: external-secrets/orders-db
precedence:
  - defaults
  - environment
  - runtime_toggle
  - secret
validation:
  required_keys: [database.url, payment.timeout_ms, feature.checkout]
`,
    `$ helm template orders ./chart -f values-prod.yaml |
>   yq 'select(.kind=="ConfigMap") | .data'
database.url: postgres://orders-db.orders.svc:5432/orders
payment.timeout_ms: "600"
feature.checkout: "enabled"
渲染值来源清楚，所有必填键在启动前通过 schema 校验。`,
  ),
  'Secret 边界': seExample(
    '限制应用账号读取 Secret',
    'yaml',
    `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: orders-runtime
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["orders-db"]
    verbs: ["get"]
`,
    `$ kubectl auth can-i get secrets -n orders --as=system:serviceaccount:orders:api
yes
$ kubectl auth can-i get secrets/orders-db -n orders --as=system:serviceaccount:orders:api
yes
$ kubectl describe secret orders-db -n orders
Error from server (Forbidden): secrets "orders-db" is forbidden
应用只能读取指定秘密，不能列出或描述全部 Secret。`,
  ),
  'Helm 可审查': seExample(
    'values schema 与 dry-run 校验',
    'bash',
    `helm lint ./chart -f values-prod.yaml
helm template orders ./chart -f values-prod.yaml \
  --set image.digest=sha256:4f2a > rendered.yaml
kubectl apply --dry-run=server -f rendered.yaml
`,
    `$ helm lint ./chart -f values-prod.yaml
==> Linting ./chart
1 chart(s) linted, 0 chart(s) failed
$ kubectl apply --dry-run=server -f rendered.yaml
deployment.apps/orders-api configured (server dry run)
service/orders-api configured (server dry run)
缺值、非法类型和服务端 schema 均在部署前被拦截。`,
  ),
  'Apollo 灰度发布': seExample(
    'Apollo 配置版本比较',
    'bash',
    `curl -s "http://apollo.test/configs/orders/default/application" \
  -H "Authorization: $APOLLO_TOKEN" > current.json
jq '{version,configurations}' current.json
curl -s "http://apollo.test/configs/orders/default/application?releaseKey=rel-42" \
  -H "Authorization: $APOLLO_TOKEN" > canary.json
diff -u current.json canary.json
`,
    `$ jq '{version,configurations}' current.json
{
  "version": 41,
  "configurations": {"payment.timeout_ms":"800","feature.checkout":"enabled"}
}
$ diff -u current.json canary.json
- "payment.timeout_ms":"800"
+ "payment.timeout_ms":"600"
配置版本、差异和灰度发布对象均可审计。`,
  ),
  '启动校验与回滚': seExample(
    '缺失配置键快速失败',
    'typescript',
    `const required = ['DATABASE_URL', 'PAYMENT_TIMEOUT_MS', 'REDIS_URL'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('missing configuration keys: ' + missing.join(', '));
  process.exit(78);
}
const timeout = Number(process.env.PAYMENT_TIMEOUT_MS);
if (!Number.isFinite(timeout) || timeout <= 0) {
  console.error('PAYMENT_TIMEOUT_MS must be positive');
  process.exit(78);
}
console.log({ timeout, config: 'valid' });
`,
    `$ PAYMENT_TIMEOUT_MS=600 node dist/config-check.js
missing configuration keys: DATABASE_URL, REDIS_URL
exit=78
$ kubectl rollout undo deploy/orders-api -n orders
deployment.apps/orders-api rolled back
错误配置让启动明确失败，回滚后旧 release 恢复。`,
  ),
});

Object.assign(e3Examples, {
  '三种探针分工': seExample(
    '启动、就绪和存活探针分工',
    'yaml',
    `startupProbe:
  httpGet: { path: /startup, port: 3000 }
  failureThreshold: 30
  periodSeconds: 2
readinessProbe:
  httpGet: { path: /ready, port: 3000 }
  periodSeconds: 5
  failureThreshold: 2
livenessProbe:
  httpGet: { path: /live, port: 3000 }
  periodSeconds: 10
  failureThreshold: 3
`,
    `$ kubectl get pod orders-api-7f9c -n orders -o jsonpath='{.status.containerStatuses[0].state}'
{"running":{"startedAt":"2026-11-24T09:20:12Z"}}
$ kubectl get endpointslices -n orders -l kubernetes.io/service-name=orders-api
ENDPOINTS 10.42.3.18
依赖短暂失败时 readiness 摘流，进程自身失去响应才由 liveness 重启。`,
  ),
  '资源请求与限制': seExample(
    'API 资源请求与内存上限',
    'yaml',
    `resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: "1"
    memory: 512Mi
`,
    `$ kubectl top pod -n orders -l app.kubernetes.io/name=orders-api
NAME              CPU(cores) MEMORY(bytes)
orders-api-7f9c   173m       241Mi
orders-api-85ab   201m       268Mi
requests 支持调度与 HPA，limits 为 CPU 节流和内存 OOM 设边界。`,
  ),
  'HPA 指标与稳定窗口': seExample(
    'HPA 稳定扩容与缩容',
    'yaml',
    `scaleTargetRef:
  apiVersion: apps/v1
  kind: Deployment
  name: orders-api
minReplicas: 3
maxReplicas: 20
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300
`,
    `$ kubectl get hpa orders-api -n orders
NAME         REFERENCE               TARGETS   MINPODS MAXPODS REPLICAS
orders-api   Deployment/orders-api   71%/65%   3       20      6
$ kubectl get pods -n orders -l app.kubernetes.io/name=orders-api
Running desired=6 ready=6
HPA 基于 requests 计算利用率，扩容后有三分钟稳定窗口防止抖动。`,
  ),
  'PDB 与维护窗口': seExample(
    '节点排水保留两个可用副本',
    'yaml',
    `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: orders-api
`,
    `$ kubectl drain node-a-17 --ignore-daemonsets --delete-emptydir-data
evicting pod orders/orders-api-7f9c
error when evicting pods/"orders-api-7f9c": Cannot evict pod as it would violate the pod's disruption budget.
$ kubectl get pdb orders-api -n orders
MIN AVAILABLE 2, ALLOWED DISRUPTIONS 0
PDB 阻止维护操作同时赶走过多副本。`,
  ),
  '网络默认拒绝': seExample(
    '只允许 ingress 访问订单 API',
    'yaml',
    `podSelector:
  matchLabels:
    app.kubernetes.io/name: orders-api
policyTypes: [Ingress, Egress]
ingress:
  - from:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: ingress-nginx
    ports:
      - protocol: TCP
        port: 3000
egress:
  - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
    ports:
      - protocol: UDP
        port: 53
`,
    `$ kubectl exec deploy/ingress-probe -n ingress-nginx -- curl -sS orders-api.orders:3000/live
{"status":"alive"}
$ kubectl exec deploy/test-client -n default -- curl --max-time 2 orders-api.orders:3000/live
curl: (28) Connection timed out
允许路径连通，未授权命名空间被默认拒绝。`,
  ),
});

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E3_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e3Stage, '镜像、运行时、非 root 和只读文件系统'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '能编写一个可构建的服务，理解进程、用户、文件权限和容器镜像层的基本概念。',
    goal: '构建可重复、最小攻击面的运行镜像，以非 root 用户和只读根文件系统运行，并证明启动、扫描和运行时约束都有效。',
    guidedPractice: '为 Node 或 Java 服务写多阶段 Dockerfile：构建阶段安装完整工具链，运行阶段只复制产物和依赖；设置固定 UID、WORKDIR、非 root USER、只读根文件系统、临时目录 emptyDir，并比较镜像 digest、层大小和启动权限。',
    independentPractice: '把一个使用 latest 标签、root 用户和可写根目录的镜像改造成可审计版本；保留构建日志、漏洞扫描前后报告、docker inspect 用户信息以及一次写入代码目录被拒绝的证据。',
    commonErrors: [
      '运行镜像沿用构建工具链和包管理器缓存，镜像巨大且包含编译器，容器被入侵后攻击面明显扩大。',
      '只设置 USER 名称却不核对镜像中的 UID，或挂载了可写目录又允许进程随意修改应用代码，权限与不可变性都没有真正实现。',
    ],
    sourceRefs: ['Docker build best practices. https://docs.docker.com/build/building/best-practices/', NIST_800_190, 'Docker run reference. https://docs.docker.com/reference/cli/docker/container/run/'],
    steps: [
      ['多阶段构建', '构建阶段可以包含 JDK、Maven、Node 等工具，最终阶段只保留运行时和必要库。COPY --from=builder 复制已经构建的产物，依赖安装使用锁文件并固定基础镜像 digest。失败边界是最终镜像复制了整个工作目录，把源码、测试缓存和凭据文件一起带进运行环境；验证证据是 docker history、镜像层清单和扫描报告，运行镜像中没有编译器与源码目录。', '构建与运行环境分开'],
      ['固定运行身份', '在镜像中创建固定 UID/GID 的用户，切换 USER 为非 root，并在 Kubernetes 增加 runAsNonRoot、runAsUser、allowPrivilegeEscalation=false。应用需要的端口使用 1024 以上，避免依赖 root 能力。失败边界是开发环境以 root 运行而生产配置只在文档中声明；验证证据是 docker inspect 查看 User、Pod securityContext 和启动日志中的实际 UID，写入 / 路径应返回权限错误。', 'UID 与 securityContext 都要核对'],
      ['根文件系统只读', '设置 readOnlyRootFilesystem=true，把缓存、临时文件和上传目录显式挂载到可写 emptyDir 或对象存储；应用启动时检查可写目录存在且容量合理。失败边界是框架在启动时尝试写 HOME 或日志文件，容器反复崩溃却只显示退出码；验证证据是 Pod events、容器写文件错误和 readOnlyRootFilesystem 配置，临时目录写入与重启清理测试通过。', '可写路径要显式列白名单'],
      ['不可变标签与签名', '镜像使用内容 digest 部署，构建产物生成 SBOM 与漏洞扫描报告，关键环境验证签名后再准入。latest 只能作为开发便利标签，不能作为生产部署依据。失败边界是 CI 重新构建同名标签后实际内容不同，回滚却回到未知版本；验证证据是由 digest 反查 commit、构建器、SBOM 和签名结果，部署清单中不再出现可变标签。', '用 digest 固定真正运行的镜像'],
      ['运行时验收', '在本地或隔离集群分别验证正常启动、只读写入失败、非 root 访问禁止路径、健康检查和资源限制；用 docker run --read-only --user 10001 与 kubectl exec id 记录证据。失败边界是只验证镜像能构建，忽略容器内进程、挂载和安全上下文；验证证据是启动日志、退出码、扫描门槛、inspect 输出和一次故意写根目录的拒绝结果。', '镜像能构建不等于能安全运行'],
    ],
  },
  {
    name: seName(e3Stage, 'Pod、Deployment、StatefulSet 和 Job'),
    track,
    contentStatus: 'reviewed',
    minutes: 47,
    prerequisite: '能编写基础 Docker 镜像，理解 Kubernetes API 对象、控制器和声明式配置。',
    goal: '根据工作负载生命周期选择 Pod、Deployment、StatefulSet 或 Job，并配置更新、存储、并发和失败重试边界。',
    guidedPractice: '为无状态 API 建 Deployment，为有状态数据库建 StatefulSet 和 PVC，为每日对账建 CronJob；分别执行 rollout status、kubectl get pods -w、删除 Pod 和失败 Job，记录控制器自动恢复与服务影响。',
    independentPractice: '判断三个工作负载应使用哪种控制器：短时视频转码、主从数据库和常驻 API；写出副本、存储、更新策略、并发策略、失败重试和停止条件，并用本地 kind 集群验证至少两类。',
    commonErrors: [
      '直接创建裸 Pod 承载业务，节点驱逐或 Pod 崩溃后无人重建，滚动发布和副本管理也没有控制器保障。',
      '把需要稳定网络标识与独立存储的数据库放到普通 Deployment，Pod 重建后数据卷绑定混乱，主从身份无法可靠恢复。',
    ],
    sourceRefs: [K8S_WORKLOADS, 'Kubernetes StatefulSets. https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/', 'Kubernetes Jobs. https://kubernetes.io/docs/concepts/workloads/controllers/job/'],
    steps: [
      ['选控制器', 'Deployment 管理可替换的无状态副本，StatefulSet 为需要稳定名称、顺序和存储的实例提供身份，Job 运行到成功完成，CronJob 按时间创建 Job；裸 Pod 适合一次性调试。失败边界是按“服务是否重要”而不是工作负载生命周期选型；验证证据是一份控制器决策表，并用删除 Pod、重建 Job 和重启 StatefulSet 的实际行为核对。', '先看生命周期再选对象'],
      ['Deployment 发布', 'Deployment 的 strategy、maxSurge 和 maxUnavailable 控制滚动节奏，revisionHistoryLimit 保留可回滚版本；readiness 决定新 Pod 是否接流。失败边界是 maxUnavailable 设为 100%，一次更新全部旧副本退出导致服务中断；验证证据是 rollout status、ReplicaSet 历史和发布期间错误率，回滚到上一 revision 的记录完整。', '滚动更新要保留可用副本'],
      ['StatefulSet 身份', 'StatefulSet 提供稳定 Pod 名称、有序伸缩和 volumeClaimTemplates；服务通过 headless Service 访问固定身份，主从选举不能只依赖 Pod IP。失败边界是使用 ReadWriteMany 存储却假设数据库文件可并发写，或缩容后误删 PVC；验证证据是重启后 PVC 仍绑定原节点、集群成员表正确恢复，并执行一次主节点故障切换。', '稳定身份不等于自动高可用'],
      ['Job 完成语义', 'Job 设置 completions、parallelism、backoffLimit 和 activeDeadlineSeconds，CronJob 设置 concurrencyPolicy Forbid 防止同任务并发。任务必须幂等，失败重试不能重复外部副作用。失败边界是失败任务无限重试耗尽资源，或 CronJob 每分钟叠加长任务；验证证据是故意让处理中断后重跑，输出结果只有一份，Job 条件显示 Complete 或 Failed 原因明确。', '批处理必须有终点和并发边界'],
      ['故障观察', '排障时先看 kubectl get events、describe Pod、logs --previous、节点状态和控制器条件，区分调度失败、镜像拉取失败、启动崩溃与探针失败。失败边界是只反复重启 Deployment 而不读取 events；验证证据是记录问题对象、事件时间、退出码、控制器状态与恢复动作，最终同一故障在大盘和运行手册中都能定位。', '先读控制器条件再重启'],
    ],
  },
  {
    name: seName(e3Stage, 'Service、Ingress、DNS 和负载均衡'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 Pod 生命周期、端口、HTTP 路由和 DNS 解析，能查看 Kubernetes Service 与 Ingress 状态。',
    goal: '把集群内外流量正确路由到健康 Pod，配置服务发现、TLS、超时和负载均衡，并能从 DNS 与端点证据定位故障。',
    guidedPractice: '部署两个 API 副本，创建 ClusterIP Service 与 Ingress，使用 readiness 控制 endpoints；用 dig、nslookup、kubectl get endpointslices、curl -H Host 和网关日志追踪同一请求从域名到 Pod 的路径。',
    independentPractice: '为一个灰度版本设计 host/path/header 路由，配置 TLS、连接超时和健康检查；删除一个副本、制造 DNS 缓存和错误的 selector，分别写出定位证据与恢复步骤。',
    commonErrors: [
      'Service selector 与 Pod 标签不一致，却只检查 Service 是否存在，endpoints 为空时仍以为网络策略有问题。',
      '把 Ingress 当成负载均衡器本身，忽略入口控制器、DNS、证书和上游超时的配置责任，链路故障时无从定位。',
    ],
    sourceRefs: ['Kubernetes Services. https://kubernetes.io/docs/concepts/services-networking/service/', 'Kubernetes Ingress. https://kubernetes.io/docs/concepts/services-networking/ingress/', 'CoreDNS documentation. https://coredns.io/manual/toc/'],
    steps: [
      ['Service 与端点', 'Service 通过 selector 选择 Pod，kube-proxy 或数据面把虚拟 IP 请求转发到 endpoints；readiness 未通过的 Pod 不会出现在可用端点。排查先看 labels、selector、Endpoints/EndpointSlice 和端口名是否一致。失败边界是 targetPort 指向容器未监听端口，连接被拒绝却只显示 503；验证证据是集群内 curl、端口监听、端点列表和 Service 事件全部对齐。', '标签与端口逐项对齐'],
      ['ClusterIP 与 Headless', '普通 ClusterIP 给调用方一个稳定虚拟地址并做负载均衡，headless Service 返回各 Pod 地址，适合 StatefulSet 成员发现或客户端自行选择实例。失败边界是数据库客户端把 headless DNS 返回的全部地址同时当主库写入；验证证据是 nslookup 返回的地址数量、Pod 身份和客户端连接池实际连接记录。', '服务发现方式要匹配协议'],
      ['Ingress 与 TLS', 'Ingress 资源描述域名、路径、后端 Service 和 TLS secret，真正执行规则的是 ingress controller。配置 host、pathType、证书引用和 annotations 时，要确认控制器支持对应版本。失败边界是本地写了 Ingress 但集群没有控制器，或证书域名与 Host 不匹配；验证证据是 kubectl describe ingress、控制器日志、openssl s_client 和外部 curl 的状态码。', 'Ingress 规则需要数据面执行'],
      ['DNS 与缓存', '集群内短域名带命名空间解析，跨命名空间使用服务名.命名空间.svc.cluster.local；CoreDNS 配置错误或上游 DNS 故障会影响服务发现。应用应设置解析与连接超时，并缓存失败。失败边界是把 Pod IP 写入配置代替 Service 名称，Pod 重建后连接全部失效；验证证据是 dig @CoreDNS 查询、应用解析日志和替换 Pod 后旧连接计数归零、新路由成功。', '使用稳定服务名而非 Pod IP'],
      ['负载与连接参数', '入口和上游代理需要配置连接超时、空闲超时、重试和 keep-alive；轮询、最少连接或哈希策略要匹配会话与长连接。失败边界是代理空闲超时短于后端 keep-alive，复用连接时偶发 502；验证证据是网关访问日志、连接数、超时分布和 curl 长连接测试，调整参数后错误不再出现。', '负载均衡也要管理连接生命周期'],
    ],
  },
  {
    name: seName(e3Stage, 'ConfigMap、Secret、Apollo 与灰度'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解容器环境变量、文件挂载和 Kubernetes 声明式配置，知道秘密不应写入源码。',
    goal: '用 ConfigMap、Secret、Apollo 与 Helm values 管理分层配置，验证发布、灰度、回滚和秘密暴露边界。',
    guidedPractice: '将应用的非敏感配置放入 ConfigMap，数据库密码通过外部 Secret 注入，Apollo 管理运行时开关；用 Helm template 渲染 dev 与 prod values，检查资源名、镜像 digest、配置键和 Secret 引用是否隔离。',
    independentPractice: '为一个灰度功能设计配置发布：先在小范围 Pod 生效，观察错误率再扩大；模拟错误配置和错误 Secret，证明应用启动失败可见、旧版本可回滚且日志不泄露密钥。',
    commonErrors: [
      '把 Secret 当成加密保险箱，直接将 base64 编码的密码提交到 Git；任何能读仓库或清单的人都能还原。',
      'ConfigMap 更新后假设所有进程自动重载，实际环境变量只在容器启动时读取，线上配置与数据库不一致却无人发现。',
    ],
    sourceRefs: ['Kubernetes ConfigMaps. https://kubernetes.io/docs/concepts/configuration/configmap/', 'Kubernetes Secrets. https://kubernetes.io/docs/concepts/configuration/secret/', 'Apollo configuration center. https://www.apolloconfig.com/', HELM_DOCS],
    steps: [
      ['配置分层', '把默认值、环境差异、运行时开关和秘密分开管理：Helm values 提供环境差异，ConfigMap 保存非敏感配置，Secret 或外部密钥系统保存凭据，Apollo 负责需要动态发布的业务开关。失败边界是同一个键在四层配置中重复且优先级不明；验证证据是启动时打印来源和版本号的配置摘要，不打印值，能解释最终生效值来自哪一层。', '每类配置只有一个权威来源'],
      ['Secret 边界', 'Kubernetes Secret 默认只是 base64 编码，真正的保护来自 etcd 加密、RBAC、命名空间隔离和外部 KMS。Secret 通过 volume 或环境变量注入，避免写日志；轮换需要应用支持双版本。失败边界是 kubectl describe 或 trace 输出整个环境变量；验证证据是 RBAC 测试、etcd 加密配置和日志秘密扫描，普通应用账号不能读取 Secret 元数据。', 'Secret 安全靠访问控制'],
      ['Helm 可审查', 'Helm chart 将资源模板化，values.schema.json 校验输入，helm lint 和 helm template 在 CI 中渲染每个环境。模板使用固定镜像 digest、完整标签和 values 引用，不使用随机名称。失败边界是模板在缺值时渲染空字符串，部署后服务静默连到错误地址；验证证据是渲染 diff、schema 校验和 kubectl dry-run 输出，环境之间的差异可逐项解释。', 'Helm 先渲染再部署'],
      ['Apollo 灰度发布', 'Apollo 的 namespace、cluster 和 release 版本要与应用环境对应，发布前比较配置 diff，先向测试实例或小比例集群灰度，观察指标后再全量。客户端缓存和长轮询可能延迟生效。失败边界是发布错误值没有回滚按钮或回滚后客户端缓存旧配置；验证证据是配置版本号、灰度实例日志、恢复时间和应用实际读取值。', '配置发布也要有灰度和回滚'],
      ['启动校验与回滚', '应用启动时校验必填键、URL、超时、端口和 Secret 版本，缺失时失败并输出键名而不是值；运行中配置变更需原子切换并记录版本。失败边界是坏配置导致所有实例同时退出且没有上一版本清单；验证证据是故意删一个必填键，Pod 进入明确错误状态、告警触发，回滚到上一 release 后服务恢复。', '坏配置应该快速失败'],
    ],
  },
  {
    name: seName(e3Stage, '探针、资源、HPA、PDB 和网络策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 Pod 生命周期、Service 路由和 CPU/内存指标，能读懂 Kubernetes 事件与监控曲线。',
    goal: '用启动、就绪和存活探针正确表达健康，配置资源请求与限制、HPA、PDB 和默认拒绝网络策略，并验证发布和故障时行为。',
    guidedPractice: '为一个 API 设置 startupProbe、readinessProbe、livenessProbe，配置 requests/limits、HPA 的 CPU 与自定义 QPS 指标、minReplicas=3、PDB minAvailable=2 和默认拒绝 NetworkPolicy，再逐项注入故障观察。',
    independentPractice: '为一个多租户服务写调度与网络策略：证明启动慢不会误重启、依赖故障只摘除流量、扩容不会超过节点容量、节点驱逐仍保留法定副本、未授权命名空间无法连接数据库。',
    commonErrors: [
      '把 livenessProbe 指向依赖数据库的接口，数据库短暂变慢时所有 Pod 被同时重启，故障从依赖层扩散到整个服务。',
      '只设置 CPU limit 不设置 request，或 HPA 基于没有 resources.requests 的利用率计算，扩容结果不稳定甚至无法工作。',
    ],
    sourceRefs: [K8S_PROBES, K8S_HPA, K8S_PDB, K8S_NETWORK_POLICY],
    steps: [
      ['三种探针分工', 'startupProbe 给慢启动应用一个较长窗口，成功后才启用 liveness；readinessProbe 判断实例是否能接流量；livenessProbe 只判断进程是否需要重启，不检查所有外部依赖。失败边界是三个探针共用同一接口且超时太短，依赖抖动触发全量重启；验证证据是启动耗时分布、探针失败事件和依赖故障时 Pod 不重启但端点被摘除。', '重启条件与接流条件分开'],
      ['资源请求与限制', 'requests 决定调度和 HPA 利用率，limits 决定 CPU 节流和内存 OOM 边界；为关键服务设置合理 requests，内存 limit 预留峰值与页缓存。失败边界是所有服务都写相同 resources，低流量占满节点而高流量被频繁驱逐；验证证据是 Pod 实际使用、OOMKilled 事件、调度失败原因和节点资源装箱率。', 'requests 负责调度 limits 负责边界'],
      ['HPA 指标与稳定窗口', 'HPA 读取 metrics-server 或自定义指标，按目标利用率计算副本数；behavior 中 scaleUp、scaleDown 的 stabilizationWindowSeconds 防止抖动。扩容还受节点资源和调度延迟限制。失败边界是只看 CPU 而服务瓶颈在队列积压；验证证据是压测中 HPA 副本、指标、Pending Pod 和请求延迟同时记录，缩容前有稳定观察窗口。', '扩容指标要对应真实瓶颈'],
      ['PDB 与维护窗口', 'PDB 限制自愿驱逐时同时不可用的副本数，minAvailable 或 maxUnavailable 要与冗余目标匹配；节点排水仍可能因单副本或资源不足卡住。失败边界是设置 minAvailable 等于副本数，节点维护永远无法驱逐；验证证据是 kubectl drain 演练中可用副本、事件和业务错误率，维护前后均满足容量目标。', 'PDB 保护的是自愿中断'],
      ['网络默认拒绝', 'NetworkPolicy 先创建默认拒绝入站与出站，再按标签和命名空间显式允许 DNS、数据库、消息和应用调用；策略由支持它的 CNI 执行。失败边界是只写一条 allow，其他流量未拒绝，或策略选择器写错把健康检查也阻断；验证证据是用测试 Pod 分别访问允许与禁止目标，确认一个是成功连接、另一个是超时或拒绝，并检查网络策略计数。', '先拒绝再逐条放行'],
    ],
  },
], e3Examples);

// ── E4 CI/CD、可观测性与 SRE ────────────────────────────────────────────────
const e4Stage = 'CI/CD、可观测性与 SRE';

const e4Examples: Record<string, StepExample> = {};

Object.assign(e4Examples, {
  '测试顺序与分层': seExample(
    '按成本递增的 CI 检查',
    'yaml',
    `name: verify
on: [pull_request]
jobs:
  fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit
  integration:
    needs: fast
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test:integration
`,
    `$ gh run view 4821 --log
lint             success 11s
typecheck        success 24s
test:unit        success 38s
test:integration success 1m42s
格式或类型错误在前 30 秒失败，只有通过后才启动数据库集成测试。`,
  ),
  '矩阵与缓存键': seExample(
    '运行时与锁文件矩阵缓存',
    'yaml',
    `strategy:
  matrix:
    node: [22, 24]
    database: [postgres-16, postgres-17]
steps:
  - uses: actions/cache@v4
    with:
      path: ~/.pnpm-store
      key: pnpm-\${{ runner.os }}-\${{ matrix.node }}-\${{ hashFiles('pnpm-lock.yaml') }}
  - run: pnpm install --frozen-lockfile
  - run: pnpm test
`,
    `$ gh run view 4822 --json jobs
node=22 postgres=16 cache=hit  tests=412 passed
node=22 postgres=17 cache=hit  tests=412 passed
node=24 postgres=16 cache=hit  tests=412 passed
node=24 postgres=17 cache=hit  tests=412 passed
缓存键包含 lockfile、Node 与操作系统，四个矩阵均从同一依赖图验证。`,
  ),
  '制品只构建一次': seExample(
    '构建 digest 并在部署中复用',
    'bash',
    `docker buildx build --push \
  --tag ghcr.io/acme/orders:sha-\$GITHUB_SHA \
  --metadata-file metadata.json .
DIGEST=$(jq -r '.containerimage.digest' metadata.json)
echo "orders_digest=$DIGEST" >> "$GITHUB_OUTPUT"
cosign sign --yes "ghcr.io/acme/orders@$DIGEST"
`,
    `$ jq -r '.containerimage.digest' metadata.json
sha256:4f2a9be172d34af3c28e8e8b7d1a
$ gh attestation verify ghcr.io/acme/orders@sha256:4f2a...
Loaded digest sha256:4f2a...
attestation verified
测试、签名和部署都引用同一 digest，不会重新打包。`,
  ),
  '并发与权限': seExample(
    '旧流水线取消与最小权限',
    'yaml',
    `permissions:
  contents: read
  packages: write
  id-token: write
concurrency:
  group: deploy-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  deploy:
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh "$GITHUB_SHA"
`,
    `$ gh run list --branch main --limit 3
queued   deploy  9f2a
cancelled deploy 4f2a
success  deploy  31bd
新提交到达后旧运行被取消；生产环境等待审批，PR 不具有写包权限。`,
  ),
  '可复现与追溯': seExample(
    '在干净 runner 重建并比较 SBOM',
    'bash',
    `docker buildx build --push --tag app:verify .
syft app:verify -o cyclonedx-json > sbom-verify.json
jq -S '.components | sort_by(.name)' sbom-a.json > a.json
jq -S '.components | sort_by(.name)' sbom-verify.json > b.json
diff -u a.json b.json
`,
    `$ syft app:verify -o cyclonedx-json > sbom-verify.json
packages=191
$ diff -u a.json b.json
$ echo $LASTEXITCODE
0
两次构建的组件清单一致，可追溯到源码 commit、SBOM 和发布审批。`,
  ),
});

Object.assign(e4Examples, {
  '期望状态入 Git': seExample(
    'Argo Application 指向部署目录',
    'yaml',
    `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: orders-prod
  namespace: argocd
spec:
  project: commerce
  source:
    repoURL: https://git.example/deploy.git
    targetRevision: main
    path: envs/prod/orders
  destination:
    server: https://kubernetes.default.svc
    namespace: orders
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
`,
    `$ argocd app get orders-prod -o json | jq '{revision,path,status}'
{
  "revision": "9f2ac14",
  "path": "envs/prod/orders",
  "status": {"sync":{"status":"Synced"},"health":{"status":"Healthy"}}
}
线上 namespace、revision 和 Git 目录形成可追溯关系。`,
  ),
  '同步与漂移控制': seExample(
    '手工修改副本数触发 OutOfSync',
    'bash',
    `kubectl scale deploy/orders-api -n orders --replicas=9
argocd app diff orders-prod
argocd app sync orders-prod --prune
kubectl get deploy orders-api -n orders -o jsonpath='{.spec.replicas}'
`,
    `$ kubectl scale deploy/orders-api -n orders --replicas=9
deployment.apps/orders-api scaled
$ argocd app diff orders-prod
--- desired
+++ live
-replicas: 4
+replicas: 9
$ argocd app sync orders-prod --prune
Sync successful
4
漂移被发现并回退；如需持久变更必须先提交 Git。`,
  ),
  '审批与环境晋升': seExample(
    '同一 digest 晋升生产',
    'bash',
    `yq -i '.images[0].newTag = "sha256:4f2a9be172d34af3c28e8e8b7d1a"' \
  envs/staging/orders/kustomization.yaml
git add envs/staging/orders/kustomization.yaml
git commit -m "promote orders sha256:4f2a"
argocd app wait orders-staging --health
argocd app get orders-prod -o json | jq -r '.spec.source.targetRevision'
`,
    `$ argocd app wait orders-staging --health
orders-staging  Synced  Healthy
$ argocd app get orders-prod -o json | jq -r '.spec.source.targetRevision'
9f2ac14
生产 PR 使用同一 digest 且需要两人审批；审批者与同步身份分离。`,
  ),
  '秘密与同步波次': seExample(
    '迁移 Job 先于应用同步',
    'yaml',
    `metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
kind: Job
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: registry.example/orders-migrate@sha256:91ab
---
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          image: registry.example/orders@sha256:4f2a
`,
    `$ argocd app sync orders-prod
Phase: Sync
Wave -1  Job/orders-migrate          Succeeded
Wave 0   ConfigMap/orders-config    Synced
Wave 1   Deployment/orders-api      Healthy
迁移作业先成功，应用 Deployment 才进入同步波次。`,
  ),
  '回滚与紧急发布': seExample(
    '回滚到上一 digest 并验证',
    'bash',
    `git revert --no-edit 9f2ac14
git push origin main
argocd app wait orders-prod --sync --health --timeout 300
kubectl get deploy orders-api -n orders \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'
`,
    `$ git revert --no-edit 9f2ac14
[main 71bd2c1] Revert "update orders image"
$ argocd app wait orders-prod --sync --health
orders-prod  Synced  Healthy
registry.example/orders@sha256:31bd8d0
回滚通过 Git 提交完成，运行镜像 digest 与上一版本一致。`,
  ),
});

Object.assign(e4Examples, {
  '按风险选策略': seExample(
    '订单 API 金丝雀 Rollout',
    'yaml',
    `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: orders-api
spec:
  replicas: 8
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 10m }
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 100
  template:
    spec:
      containers:
        - name: api
          image: registry.example/orders@sha256:4f2a
`,
    `$ kubectl argo rollouts get rollout orders-api -n orders
Name: orders-api
Status: ॥ Paused
Step: 2/3
SetWeight: 25
ActualWeight: 25
新版本只接 25% 流量并暂停，旧副本仍保留 75%，资源和兼容窗口可见。`,
  ),
  '金丝雀分析': seExample(
    '错误率和 p99 自动分析',
    'yaml',
    `metrics:
  - name: success-rate
    interval: 1m
    successCondition: result[0] >= 0.995
    failureLimit: 2
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{service="orders-api",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="orders-api"}[5m]))
  - name: p99
    successCondition: result[0] < 0.8
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: histogram_quantile(0.99, sum(rate(http_request_duration_bucket{service="orders-api"}[5m])) by (le))
`,
    `$ kubectl argo rollouts get rollout orders-api -n orders
Step: 2/3
success-rate: 0.991
p99: 1.24
Metric "success-rate" assessed Failure
Metric "p99" assessed Failure
RolloutAborted: step failed
连续两分钟低于阈值后自动中止，不继续放量。`,
  ),
  '蓝绿与数据兼容': seExample(
    '蓝绿切换活动 Service',
    'yaml',
    `apiVersion: v1
kind: Service
metadata:
  name: orders-active
spec:
  selector:
    app: orders
    version: blue
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-green
spec:
  selector:
    matchLabels: { app: orders, version: green }
  template:
    metadata:
      labels: { app: orders, version: green }
`,
    `$ kubectl patch service orders-active -n orders \
>   --type merge -p '{"spec":{"selector":{"version":"green"}}}'
service/orders-active patched
$ curl -s https://orders.example.test/version
{"version":"green","schema":"v2-compatible"}
切换只移动路由；数据库迁移保持 v1/v2 双向兼容，可随时切回 blue。`,
  ),
  '回滚分层': seExample(
    '应用与数据库兼容回滚',
    'bash',
    `kubectl set image deploy/orders-api \
  api=registry.example/orders@sha256:31bd8d0 -n orders
kubectl rollout status deploy/orders-api -n orders --timeout=180s
psql "$DATABASE_URL" -c \
  "SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='currency';"
curl -fsS https://orders.example.test/health
`,
    `deployment "orders-api" successfully rolled out
 count
     1
{"status":"ready","schema":"v2-compatible"}
旧应用支持新增 currency 列，数据库没有执行破坏性回滚；应用、配置和数据层保持兼容。`,
  ),
  '发布后观察': seExample(
    '发布后一小时核心指标',
    'promql',
    `sum(rate(http_requests_total{service="orders-api",status=~"2.."}[5m]))
/
sum(rate(http_requests_total{service="orders-api"}[5m]))
`,
    `$ curl -sG localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(http_requests_total{service="orders-api",status=~"2.."}[5m]))/sum(rate(http_requests_total{service="orders-api"}[5m]))'
value=0.9987
$ kubectl get pods -n orders -l version=v2
Running desired=8 ready=8
核心成功率 99.87%，新版本副本全健康，旧版本资源待保留期结束后再清理。`,
  ),
});

Object.assign(e4Examples, {
  '三类信号分工': seExample(
    '服务指标、结构化日志与 Trace',
    'yaml',
    `receivers:
  otlp:
    protocols:
      grpc: {}
processors:
  resource:
    attributes:
      - key: service.version
        value: sha-4f2a
        action: insert
exporters:
  prometheus:
    endpoint: 0.0.0.0:9464
  otlphttp:
    endpoint: http://tempo.monitoring:4318
service:
  pipelines:
    metrics: { receivers: [otlp], exporters: [prometheus] }
    traces: { receivers: [otlp], processors: [resource], exporters: [otlphttp] }
`,
    `$ otelcol validate --config collector.yaml
configuration is valid
$ curl -s localhost:9464/metrics | Select-String 'http_server_request_duration'
http_server_request_duration_bucket{service_version="sha-4f2a",le="0.5"} 9981
指标、Trace 和日志共享 service.version，可由 Trace ID 跳转查询。`,
  ),
  'SLI 与 SLO': seExample(
    '订单可用性 SLI 查询',
    'promql',
    `sum(rate(http_requests_total{service="orders-api",status!~"5.."}[5m]))
/
sum(rate(http_requests_total{
  service="orders-api",
  route="/orders",
  status!="404"
}[5m]))`,
    `$ curl -sG localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(http_requests_total{service="orders-api",status!~"5.."}[5m]))/sum(rate(http_requests_total{service="orders-api",route="/orders",status!="404"}[5m]))'
value=0.9993
$ promtool test rules slo-tests.yaml
SUCCESS
SLI 排除 404 但不排除 500，28 天目标 99.9% 可以由固定查询复算。`,
  ),
  '错误预算决策': seExample(
    '28 天错误预算剩余量',
    'promql',
    `(
  1 -
  (
    sum(increase(http_requests_total{service="orders-api",status=~"5.."}[28d]))
    /
    sum(increase(http_requests_total{service="orders-api"}[28d]))
  )
) / 0.001`,
    `$ curl -sG localhost:9090/api/v1/query \
  --data-urlencode 'query=(1-(sum(increase(http_requests_total{service="orders-api",status=~"5.."}[28d]))/sum(increase(http_requests_total{service="orders-api"}[28d]))))/0.001'
value=0.18
错误预算剩余 18%，发布门禁进入“只允许低风险变更”，并自动创建可靠性复盘任务。`,
  ),
  '延迟分位与依赖 Span': seExample(
    '慢请求依赖 Span 对比',
    'json',
    `{
  "traceId": "7f4bc0f23a91",
  "service": "orders-api",
  "duration_ms": 842,
  "spans": [
    { "name": "POST /orders", "duration_ms": 842 },
    { "name": "postgres SELECT", "duration_ms": 611 },
    { "name": "kafka publish", "duration_ms": 18 },
    { "name": "redis GET", "duration_ms": 4 }
  ],
  "p99_ms": 1204,
  "version": "sha-4f2a"
}
`,
    `$ jq '.spans | sort_by(.duration_ms) | reverse | .[0:2]' trace.json
[
  { "name": "POST /orders", "duration_ms": 842 },
  { "name": "postgres SELECT", "duration_ms": 611 }
]
慢请求的主要时间在 PostgreSQL span，消息和缓存不是瓶颈。`,
  ),
  '采样与成本': seExample(
    '保留错误和慢请求的尾部采样',
    'yaml',
    `processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 750 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 2 }
`,
    `$ otelcol validate --config tail-sampling.yaml
configuration is valid
sampled_error_rate=100%
sampled_slow_rate=100%
sampled_baseline_rate=2%
错误和慢请求全保留，正常流量降采样，Trace 成本可预测。`,
  ),
});

Object.assign(e4Examples, {
  '告警面向症状': seExample(
    '核心下单成功率分页告警',
    'yaml',
    `groups:
  - name: orders-slo
    rules:
      - alert: OrdersAvailabilityFastBurn
        expr: |
          sum(rate(http_requests_total{service="orders-api",status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="orders-api"}[5m])) > 0.02
        for: 2m
        labels:
          severity: page
          service: orders
        annotations:
          summary: "Orders error rate above 2% for 2m"
          runbook_url: "https://runbooks.example/orders/availability"
`,
    `$ promtool check rules alerts.yaml
SUCCESS: 1 rule found
$ amtool alert add OrdersAvailabilityFastBurn severity=page
Alert added successfully.
告警指向用户可见错误率和 runbook，而不是单独 CPU 曲线。`,
  ),
  '分级与值班': seExample(
    'PagerDuty 升级策略',
    'hcl',
    `resource "pagerduty_escalation_policy" "orders" {
  name      = "Orders production"
  num_loops = 2
  rule {
    escalation_delay_in_minutes = 5
    target { id = pagerduty_user.primary.id type = "user_reference" }
  }
  rule {
    escalation_delay_in_minutes = 10
    target { id = pagerduty_user.backup.id type = "user_reference" }
  }
  rule {
    escalation_delay_in_minutes = 15
    target { id = pagerduty_team.platform.id type = "team_reference" }
  }
}
`,
    `$ terraform plan
Plan: 1 to add, 0 to change, 0 to destroy.
$ pd schedule list --query "Orders primary"
Orders primary  rotations=2  timezone=Asia/Shanghai
主班、备班和平台团队按 5/10/15 分钟升级，节假日轮值可查。`,
  ),
  '事故指挥': seExample(
    '事故时间线与角色记录',
    'typescript',
    `type IncidentEvent = { minute: number; role: string; action: string; owner: string };
const events: IncidentEvent[] = [
  { minute: 0, role: 'commander', action: 'declare SEV2 orders', owner: 'li' },
  { minute: 3, role: 'ops', action: 'disable recommendations', owner: 'wang' },
  { minute: 7, role: 'comms', action: 'post customer update', owner: 'chen' },
  { minute: 12, role: 'ops', action: 'rollback deploy', owner: 'wang' },
];
console.table(events);
`,
    `$ node --import tsx incident-log.ts
┌─────────┬────────┬─────────────────────────┬───────┐
│ minute  │ role   │ action                  │ owner │
│ 0       │ command│ declare SEV2 orders     │ li    │
│ 3       │ ops    │ disable recommendations │ wang  │
│ 7       │ comms  │ post customer update    │ chen  │
│ 12      │ ops    │ rollback deploy         │ wang  │
└─────────┴────────┴─────────────────────────┴───────┘`,
  ),
  '隔离与恢复': seExample(
    '暂停消费者并切回旧版本',
    'bash',
    `kubectl scale deploy/orders-consumer --replicas=0 -n orders
kubectl annotate deploy/orders-consumer -n orders \
  incident=INC-2026-1124 isolation=consumer-paused --overwrite
kubectl rollout undo deploy/orders-api -n orders
kubectl rollout status deploy/orders-api -n orders --timeout=180s
curl -fsS https://orders.example.test/health
`,
    `deployment.apps/orders-consumer scaled
deployment.apps/orders-consumer annotated
deployment.apps/orders-api rolled back
deployment "orders-api" successfully rolled out
{"status":"ok","version":"sha-31bd8"}
消费者已暂停以停止错误扩散，API 回滚后核心健康恢复；积压消息保留待修复重放。`,
  ),
  '无责复盘': seExample(
    '可验证的事故复盘模板',
    'markdown',
    `# INC-2026-1124 Orders Availability

## Impact
- 12 minutes, 8.4% checkout failures, no confirmed payment loss.

## Timeline
- 09:12 deploy sha-4f2a
- 09:15 alert fired
- 09:18 recommendations disabled
- 09:24 rollback completed

## Contributing conditions
- schema change and old client only covered by unit tests.

## Actions
- add v1/v2 contract gate, owner @commerce-platform, due 2026-11-29.
- add rollback drill, owner @sre, due 2026-12-05, verify in game day.
`,
    `$ npx markdownlint-cli2 postmortem.md
Linting: 1 file
Summary: 0 errors
$ rg -n "owner @|due 2026|verify in" postmortem.md
15: - add v1/v2 contract gate, owner @commerce-platform, due 2026-11-29.
16: - add rollback drill, owner @sre, due 2026-12-05, verify in game day.
复盘没有把责任归到个人，行动项有负责人、期限和验证方法。`,
  ),
});

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E4_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e4Stage, 'CI 测试矩阵、缓存和制品'),
    track,
    contentStatus: 'reviewed',
    minutes: 47,
    prerequisite: '能运行单元与集成测试，理解锁文件、构建缓存、版本矩阵和容器镜像 digest。',
    goal: '设计快速失败且可复现的 CI 测试矩阵，正确缓存依赖和构建层，并产出可追溯、可签名的不可变制品。',
    guidedPractice: '为 Node 服务配置两个运行时版本、单元测试、类型检查、容器数据库集成测试与镜像构建；缓存键包含锁文件哈希和运行时版本，上传 JUnit 报告、覆盖率、SBOM 与镜像 digest。',
    independentPractice: '为一个 Java/Python 项目设计 CI：区分必需与提示性检查，设置并发取消旧提交，证明缓存污染会失败、测试失败会阻断制品、制品能从 digest 反查 commit 和构建日志。',
    commonErrors: [
      '缓存键只写操作系统，不包含锁文件和工具版本，依赖更新后命中旧缓存，CI 结果与干净环境不一致。',
      '流水线只保留 latest 镜像，测试成功后重新构建部署，线上 digest 无法对应测试过的那一份制品。',
    ],
    sourceRefs: ['GitHub Actions caching. https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows', 'SLSA specification. https://slsa.dev/spec/', 'CycloneDX specification. https://cyclonedx.org/specification/overview/'],
    steps: [
      ['测试顺序与分层', '把格式、静态检查、类型检查和单元测试放在前面快速失败，容器集成、契约和端到端测试在后，昂贵性能任务按影响文件或计划触发。每层输出机器可读报告和原始日志。失败边界是把所有检查串进一个脚本，首个环境错误掩盖代码回归；验证证据是分别制造格式、类型、单元和集成失败，流水线能在对应层停下并指出最小复现命令。', '便宜检查先跑但都要可归因'],
      ['矩阵与缓存键', '矩阵按支持运行时、数据库主版本和关键架构展开；缓存键由 lockfile 哈希、包管理器版本、操作系统和构建参数组成，缓存只加速不决定正确性。失败边界是 PR 修改锁文件却命中旧 node_modules；验证证据是清空缓存重建与命中缓存结果一致，主动破坏缓存键后流水线能自动重建。', '缓存必须绑定所有输入'],
      ['制品只构建一次', '同一个 commit 只构建一次制品，测试、签名和部署都引用相同 digest；文件名带语义版本和 commit SHA，同时保留清单描述构建器、依赖锁、SBOM 和时间。失败边界是测试后重新打包，部署产物与验证产物不是同一内容；验证证据是 manifest 中的 digest、运行镜像 digest 与构建日志三者一致。', '验证和部署引用同一制品'],
      ['并发与权限', '相同分支新提交自动取消旧流水线，部署 job 使用受保护环境和最小权限凭据；PR 不获得生产秘密。失败边界是 fork PR 能读取发布密钥，或并发 job 同时修改共享测试资源；验证证据是权限清单、环境审批记录和并发运行日志，旧运行被取消且共享资源无冲突。', 'CI 凭据按任务最小授权'],
      ['可复现与追溯', '在干净 runner 重跑，比较核心产物哈希或至少比较依赖清单；失败日志与报告保留足够长，发布记录从 digest 反查 commit、测试、审批和部署目标。失败边界是流水线依赖开发者机器上的私有文件；验证证据是另一 runner 成功构建、制品 manifest 完整、旧 release 仍能追溯和回滚。', '构建证据要能跨机器复现'],
    ],
  },
  {
    name: seName(e4Stage, 'Argo CD、GitOps 和发布审批'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 Kubernetes 声明式资源、Git 分支、Helm/Kustomize 和 CI 制品 digest。',
    goal: '用 Git 作为期望状态来源，设计 Argo CD 同步、漂移检测、环境晋升和审批流程，避免集群手工修改绕过审计。',
    guidedPractice: '建立应用仓库与部署仓库，Argo CD 监听 prod 目录；CI 只提交镜像 digest，PR 审批后合并。故意 kubectl 修改副本数，观察 OutOfSync 与回退，再配置 syncWindow 和健康检查。',
    independentPractice: '为一个三环境发布写 GitOps 流程：dev 自动同步、staging 需测试通过、prod 需双人审批；列出秘密注入、同步波次、漂移处理、回滚和紧急变更路径。',
    commonErrors: [
      'Argo CD 自动同步开启后仍允许开发者直接 kubectl edit 生产资源，漂移被立即覆盖，但紧急修复没有审计与提交路径。',
      '把明文密码提交到部署仓库，认为 Argo CD 是内部工具就足够安全，Git 历史和同步日志反而扩大了秘密暴露面。',
    ],
    sourceRefs: [ARGO_CD, 'OpenGitOps principles. https://opengitops.dev/', K8S_WORKLOADS],
    steps: [
      ['期望状态入 Git', '部署仓库保存 namespace、Helm/Kustomize、镜像 digest、资源策略和 Argo Application，每个提交对应明确变更。CI 不直接改集群，只向部署仓库提交候选版本。失败边界是应用源码仓库与部署仓库互相覆盖同一字段；验证证据是 Git 历史、Argo revision 和集群注解一致，任意线上资源都能追到 commit。', '集群变化从 Git 开始'],
      ['同步与漂移控制', 'Application 设置自动同步、自愈、prune 和 syncPolicy，防止无主资源堆积；生产可按需关闭自动同步，但必须监控 OutOfSync。手动修改后要选择回退或提交正式变更。失败边界是 prune 误删未纳入应用但有业务用途的资源；验证证据是漂移告警、sync diff、资源所有者标签和一次人工修改后的审计记录。', '漂移要么回退要么入账'],
      ['审批与环境晋升', '同一 digest 从 dev 晋升 staging 和 prod，环境差异只来自受控 values；生产 PR 使用 CODEOWNERS 和双人审批，Argo 环境凭据只能读取目标集群。失败边界是每个环境重新构建不同镜像；验证证据是部署清单显示同一 digest，审批人与 Argo 同步操作者可分离。', '晋升制品而不是重建制品'],
      ['秘密与同步波次', '秘密通过 External Secrets、Sealed Secrets 或受控准入注入，不明文进入 Git；数据库迁移、配置和 Deployment 使用 sync-wave 或 hook 控制顺序。失败边界是 Pod 先于迁移启动，查询不存在的列；验证证据是 Application 资源健康顺序、迁移 Job 日志和失败 hook 的阻断结果。', '部署顺序也是契约'],
      ['回滚与紧急发布', '普通回滚通过 revert 部署 commit 或恢复上一 digest；紧急修复也要在事后补回 Git，并限制绕过审批的时长与权限。演练要测 Argo 不可用时的只读恢复流程。失败边界是回滚只改镜像，不回退不兼容数据库迁移；验证证据是回滚耗时、旧版本启动成功率、数据兼容检查和紧急变更审计。', '回滚代码不能忽略数据'],
    ],
  },
  {
    name: seName(e4Stage, '滚动、蓝绿、金丝雀和回滚'),
    track,
    contentStatus: 'reviewed',
    minutes: 49,
    prerequisite: '理解 Deployment、Ingress、流量路由和发布指标，能读错误率、延迟与业务成功率。',
    goal: '根据风险选择滚动、蓝绿或金丝雀发布，配置自动分析和回滚条件，并证明代码、配置、数据与依赖都能恢复。',
    guidedPractice: '为 API 发布 v2：先把 5% 流量导到金丝雀，观察 10 分钟错误率、p99、业务成功率和日志异常；超过阈值自动回滚，保留旧 ReplicaSet 与数据库兼容版本，再执行蓝绿整组切换对照。',
    independentPractice: '为一个高风险前端与后端联合发布设计发布策略，包含版本标识、流量权重、session 兼容、数据库双版本、快速关闭开关和回滚演练；写出停止条件与负责人。',
    commonErrors: [
      '只验证新 Pod 处于 Ready 就全量切换，没有业务成功率、p99 和客户端错误等金丝雀指标，兼容性缺陷在小流量阶段被忽略。',
      '回滚只切回旧镜像，但数据库迁移已经删除字段或消息格式已变化，旧版本启动后直接崩溃。',
    ],
    sourceRefs: [KUBERNETES_ROLLOUT, 'Argo Rollouts documentation. https://argoproj.github.io/rollouts/', SRE_WORKBOOK],
    steps: [
      ['按风险选策略', '滚动发布简单但新旧版本会短时共存，蓝绿切换清晰但资源翻倍，金丝雀适合可用指标逐步放量；数据库变更和外部依赖决定能否共存。失败边界是随意选蓝绿，却不准备双份容量和回切路由；验证证据是一张策略对比表，列出共存窗口、资源成本、观测指标和回滚时间目标。', '发布策略要匹配兼容窗口'],
      ['金丝雀分析', '金丝雀权重从 1% 或 5% 开始，按请求量设最小样本，分析错误率、p95/p99、业务成功、日志异常和依赖调用差异；分析和自动回滚独立于应用进程。失败边界是流量太少就看平均错误率，一两个错误造成误判；验证证据是 AnalysisRun 或等价报表，展示新旧版本同期指标、样本量和判定结果。', '小流量也要有统计样本'],
      ['蓝绿与数据兼容', '蓝绿环境要使用同一数据库兼容契约，schema 先扩展后迁移，应用读写新旧字段都要有回退窗口；切换由路由完成而非改 DNS TTL。失败边界是蓝环境写入新字段后旧版本无法反序列化；验证证据是双版本并行测试、迁移向前兼容检查和路由回切后的业务结果。', '蓝绿要求版本双向兼容'],
      ['回滚分层', '回滚准备代码、配置、数据和依赖四层：恢复上一 digest、关闭新功能开关、执行兼容迁移或双读、切回旧外部依赖。每层有独立负责人和触发条件。失败边界是把数据库回滚和生产回滚绑定成一次不可逆操作；验证证据是一次完整演练记录，恢复旧版本后核心请求、消息消费和报表均可运行。', '回滚是组合动作'],
      ['发布后观察', '发布结束后继续观察至少一个业务周期，确认积压清空、缓存命中和长尾事务正常；删除旧版本前检查旧客户端与版本标识。失败边界是流量全切后立即删除旧资源，隐藏兼容问题无法回退；验证证据是发布报告包含时间线、指标截图、回滚阈值、残留风险和旧版本清理条件。', '切换完成不等于发布完成'],
    ],
  },
  {
    name: seName(e4Stage, '日志、指标、Trace、SLO 和错误预算'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '理解请求链路、HTTP 状态码和分位延迟，能使用至少一种指标或日志查询工具。',
    goal: '用结构化日志、指标和分布式 Trace 描述用户体验，定义可行动 SLO 与错误预算，并把观测信号连接到发布和运维决策。',
    guidedPractice: '为一个下单 API 定义 99.9% 可用性与 95% 延迟小于 500 毫秒的 SLO；埋入 trace_id、request_id、业务结果和依赖 span，用 Prometheus 查询错误预算消耗，在仪表盘关联日志与 Trace。',
    independentPractice: '为一个多服务业务流程设计观测图谱：每个服务记录哪些指标、日志字段和 span 属性，哪些是个人信息，SLO 如何计算，错误预算耗尽后发布和值班如何改变。',
    commonErrors: [
      '把 CPU、内存和 Pod 数量当成用户体验本身，却不监控订单成功率、延迟分位和错误预算，资源正常时用户仍可能大面积失败。',
      'Trace 和日志分散在不同系统且没有统一 trace_id 与时间同步，排障时只能靠猜时间窗口和字符串搜索。',
    ],
    sourceRefs: [OTEL, SRE_WORKBOOK, PROMETHEUS],
    steps: [
      ['三类信号分工', '指标适合聚合趋势和告警，日志适合事件细节与审计，Trace 适合跨服务延迟和调用关系。同一个请求应共享 trace_id，日志使用结构化 JSON 并限制敏感字段。失败边界是三类信号各自采样且无法关联；验证证据是从 SLO 告警跳到一个失败 Trace，再按 trace_id 找到对应日志和服务版本。', '先能关联再谈丰富'],
      ['SLI 与 SLO', 'SLI 是可测量的服务质量指标，例如成功请求数除以有效请求数；SLO 是目标，例如滚动 28 天 99.9%。先定义有效请求、错误定义、测量窗口和数据来源，再计算错误预算。失败边界是排除所有慢请求和业务失败，让指标永远好看；验证证据是可复算查询、排除规则复核和一次人工故障后的预算下降。', '先定义分母再定目标'],
      ['错误预算决策', '错误预算等于 1 减 SLO 乘总请求。预算充足可承担受控实验，消耗过快时冻结高风险发布、优先修复可靠性，预算耗尽不是立即关停全部变更，而是进入约定响应等级。失败边界是预算只做展示，没有触发任何发布流程；验证证据是预算阈值与 CI/CD 门禁、值班升级和复盘记录相互引用。', '预算要改变行为'],
      ['延迟分位与依赖 Span', '报告 p50、p95、p99 和最大延迟，按入口、地域和版本拆分；Trace 记录数据库、缓存、消息和外部调用 span，标记重试次数与错误类型。失败边界是只看服务端总延迟，看不到排队、DNS 或客户端网络；验证证据是从慢请求 Trace 找到最慢 span，并通过依赖指标复现瓶颈。', '总延迟拆到关键依赖'],
      ['采样与成本', '高流量系统采用头部与尾部采样，保留错误和慢请求，设置属性白名单和保留期限；仪表盘查询要有固定时间窗与标签。失败边界是采样只保留成功快速请求，事故证据全部丢失；验证证据是抽样检查 Trace 完整性、日志体积趋势和从告警到根因的平均查询时间。', '采样不能丢掉故障样本'],
    ],
  },
  {
    name: seName(e4Stage, '告警、值班、事故指挥和复盘'),
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成 SLO 与可观测性基础，理解告警规则、值班升级和基本事故响应流程。',
    goal: '建立可行动告警与主备值班，明确事故指挥、沟通、隔离和恢复职责，并通过无责复盘验证行动项真正降低再次发生概率。',
    guidedPractice: '为错误预算快速消耗和核心交易失败配置两条告警，设置 runbook 链接与升级路径；模拟一次支付依赖故障，按事故指挥、调查员、沟通员三个角色执行 30 分钟桌面演练。',
    independentPractice: '为一个实际服务写值班手册与事故复盘模板，包含严重级别、确认时限、升级人、状态更新节奏、证据保存、客户沟通和复盘行动负责人。',
    commonErrors: [
      '每个 CPU 曲线波动都触发告警，真正影响用户的事件被噪声淹没，值班人员逐渐忽略通知。',
      '复盘只写“人为操作失误”，不追查权限、审批、默认配置和监控为何允许错误发生，行动项也无法验收。',
    ],
    sourceRefs: [SRE_BOOK, 'Google SRE Workbook: Postmortem Culture. https://sre.google/workbook/postmortem-culture/', 'PagerDuty incident response documentation. https://response.pagerduty.com/'],
    steps: [
      ['告警面向症状', '分页告警应对应用户症状或快速错误预算消耗，例如核心下单成功率低于阈值；资源阈值更适合工单或预警。每条告警包含影响、查询、runbook、负责人和升级对象。失败边界是告警只给一条指标链接，没有可执行下一步；验证证据是演练中值班人员按告警在五分钟内确认影响并找到操作入口。', '会叫醒人的告警必须可行动'],
      ['分级与值班', '定义 SEV1 到 SEV4 的影响、响应时限、通知对象和升级条件；值班有主班、备班和专业联系人，交接保留未结事件与风险。失败边界是只有一位联系人，离线时无人接警；验证证据是通知超时自动转备班，值守表覆盖节假日和跨时区。', '告警必须能找到责任人'],
      ['事故指挥', '事故指挥不直接修系统，而是分配调查、操作、沟通和记录角色，维持时间线、风险决策与变更审批。高风险隔离和回滚由指挥确认，技术操作者执行。失败边界是所有人在群里同时改配置，没人知道当前状态；验证证据是事故频道固定字段、操作日志和每 15 分钟状态更新。', '复杂事故要分工而非围观'],
      ['隔离与恢复', '先限制影响：关闭功能入口、切流、限流、暂停消费者或回滚版本，再保存证据和恢复核心。所有动作记录时间、执行人、预期影响和撤销方式。失败边界是恢复心切直接删除 Pod 或清空队列，证据与积压上下文丢失；验证证据是恢复后核心交易成功、错误预算停止下降、旧故障路径仍被隔离。', '先止血再深挖'],
      ['无责复盘', '复盘按事实时间线、影响、检测、响应、根因、促成条件和行动项组织，避免个人指责；行动项必须有负责人、期限和验证方法。失败边界是列出“加强培训”却没有可观察结果；验证证据是后续故障演练能复现原场景并证明新控制命中，行动项完成率与复发率被跟踪。', '复盘产出要能验证'],
    ],
  },
], e4Examples);

// ── E5 项目、风险、容量与团队协作 ───────────────────────────────────────────
const e5Stage = '项目、风险、容量与团队协作';

const e5Examples: Record<string, StepExample> = {};

Object.assign(e5Examples, {
  '范围树与非目标': seExample(
    '季度订单平台范围树',
    'yaml',
    `goal: migrate_order_checkout
scope:
  must:
    - order_submit_api
    - inventory_reservation
    - rollback_runbook
  should:
    - tenant_shadow_read
  non_goals:
    - new_mobile_ui
    - multi_currency
    - historical_order_rewrite
acceptance:
  order_submit_api: contract_suite_passes
  inventory_reservation: no_oversell_in_fault_test
  rollback_runbook: second_engineer_executes_under_20m
`,
    `$ yq '.scope.non_goals, .acceptance.rollback_runbook' scope.yaml
- new_mobile_ui
- multi_currency
- historical_order_rewrite
second_engineer_executes_under_20m
范围外能力与回滚验收都被显式记录，避免测试和迁移成为隐藏工作。`,
  ),
  '里程碑按证据关闭': seExample(
    '里程碑证据清单',
    'csv',
    `milestone,exit_evidence,owner,status
contract-freeze,pact verification green and owners signed,api-team,closed
core-link,e2e checkout 1000 iterations and p95 under 300ms,sre-team,open
migration-drill,source-target checksum zero and rollback under 15m,data-team,open
canary,5% traffic for 30m error rate under 0.5%,release-team,open
`,
    `$ Import-Csv milestones.csv | Where-Object status -eq open |
>   Select-Object milestone,exit_evidence,owner
milestone        exit_evidence                                      owner
---------        -------------                                      -----
core-link        e2e checkout 1000 iterations and p95 under 300ms   sre-team
migration-drill  source-target checksum zero and rollback under 15m data-team
canary           5% traffic for 30m error rate under 0.5%           release-team
只有契约冻结有证据关闭，其余里程碑保持 open。`,
  ),
  '可交付物与完成定义': seExample(
    'Helm chart 可交付物检查',
    'yaml',
    `deliverable: orders-chart
recipient: platform-sre
contents:
  - chart/Chart.yaml
  - chart/values.schema.json
  - chart/templates/deployment.yaml
  - docs/rollback.md
definition_of_done:
  - helm lint passes
  - kubectl apply --dry-run=server passes
  - another engineer installs into kind
  - rollback command verified
`,
    `$ helm lint chart
1 chart(s) linted, 0 chart(s) failed
$ helm template orders chart -f values-kind.yaml |
>   kubectl apply --dry-run=server -f -
deployment.apps/orders-api configured (server dry run)
installation_seconds=312 rollback_seconds=41
交付物可由另一位工程师独立安装和回滚。`,
  ),
  '关键路径与并行': seExample(
    '依赖图计算关键路径',
    'typescript',
    `type Task = { id: string; days: number; deps: string[] };
const tasks: Task[] = [
  { id: 'contract', days: 4, deps: [] },
  { id: 'api', days: 7, deps: ['contract'] },
  { id: 'migration', days: 10, deps: ['contract'] },
  { id: 'canary', days: 3, deps: ['api', 'migration'] },
];
const finish = new Map<string, number>();
for (const task of tasks) {
  const start = Math.max(0, ...task.deps.map((id) => finish.get(id) ?? 0));
  finish.set(task.id, start + task.days);
  console.log(task.id, finish.get(task.id));
}
`,
    `$ pnpm exec tsx critical-path.ts
contract 4
api 11
migration 14
canary 17
关键路径是 contract -> migration -> canary，共 17 天；API 有 3 天并行余量。`,
  ),
  '进展与重估': seExample(
    '基于证据重估剩余工作',
    'powershell',
    `$tasks = Import-Csv backlog.csv
$remaining = ($tasks | Where-Object status -ne done |
  Measure-Object effort_days -Sum).Sum
$closed = ($tasks | Where-Object status -eq done).Count
$total = $tasks.Count
[pscustomobject]@{
  closed = $closed
  total = $total
  remaining_days = $remaining
  forecast_week = [math]::Ceiling($remaining / 18)
}
`,
    `$ ./forecast.ps1
closed total remaining_days forecast_week
------ ----- -------------- -------------
11     26    47             3
已完成 11 项但仍有 47 人日工作，按每周 18 人日容量预计还需 3 周，不再报无依据的百分比。`,
  ),
});

Object.assign(e5Examples, {
  '依赖要有接口': seExample(
    '外部库存接口依赖卡',
    'yaml',
    `dependency: inventory-reservation-api
provider: warehouse-platform
consumer: orders-team
contract: openapi/inventory-v1.yaml
environment: staging
needed_by: 2026-12-05
acceptance:
  - reserve returns reservation_id
  - duplicate idempotency key returns same id
  - timeout is under 500ms
fallback: local_reservation_table_with_reconciliation
`,
    `$ yq '.contract, .needed_by, .acceptance' dependency.yaml
openapi/inventory-v1.yaml
2026-12-05
- reserve returns reservation_id
- duplicate idempotency key returns same id
- timeout is under 500ms
依赖有接口样例、验收条件和替代路径，不只是提供方团队名称。`,
  ),
  '风险与问题分开': seExample(
    '风险转为问题的事件记录',
    'json',
    `{
  "risk": {"id": "R-14", "state": "open", "event": "warehouse_api_delay"},
  "issue": {"id": "I-03", "state": "in_progress", "event": "warehouse_api_delayed_8d"},
  "owner": "delivery-lead",
  "recovery_due": "2026-11-28",
  "fallback": "enable_local_reservation_adapter"
}
`,
    `$ jq '{risk:.risk.state,issue:.issue.state,recovery_due}' raid.json
{
  "risk": "open",
  "issue": "in_progress",
  "recovery_due": "2026-11-28"
}
依赖已经延期，因此从风险转为问题并有负责人和恢复期限。`,
  ),
  '假设与实验': seExample(
    '旧客户端字段使用假设实验',
    'typescript',
    `type RequestSample = { clientId: string; fields: string[] };
const samples: RequestSample[] = [
  { clientId: 'mobile-2', fields: ['status', 'amount'] },
  { clientId: 'web-3', fields: ['status', 'amount', 'currency'] },
  { clientId: 'partner-a', fields: ['status'] },
];
const legacy = samples.filter((s) => !s.fields.includes('currency'));
console.log({ samples: samples.length, legacy: legacy.map((s) => s.clientId) });
`,
    `$ pnpm exec tsx field-usage.ts
{ samples: 3, legacy: ['mobile-2', 'partner-a'] }
假设“所有客户端都读 currency”被网关样本推翻；双版本窗口至少覆盖两个旧客户端。`,
  ),
  '缓冲放在关键路径': seExample(
    '关键路径项目缓冲消耗',
    'typescript',
    `const criticalPath = [
  { task: 'migration', estimate: 10, actual: 13 },
  { task: 'canary', estimate: 3, actual: 0 },
  { task: 'cutover', estimate: 2, actual: 0 },
];
const buffer = 5;
const consumed = criticalPath.reduce((sum, item) => sum + item.actual - item.estimate, 0);
console.log({ buffer, consumed, remaining: buffer - consumed, percent: consumed / buffer });
`,
    `$ pnpm exec tsx buffer.ts
{ buffer: 5, consumed: 3, remaining: 2, percent: 0.6 }
关键路径已消耗 60% 项目缓冲，下一阶段不再隐式加估，必须重排范围或补充资源。`,
  ),
  '升级与替代方案': seExample(
    '依赖失约升级决策',
    'yaml',
    `dependency: warehouse-api
promise_date: 2026-12-05
latest_need_date: 2026-12-08
checkpoints:
  - date: 2026-12-02
    signal: contract_tests_not_started
    action: request_joint_test
  - date: 2026-12-06
    signal: no_candidate_build
    action: enable_fallback_adapter
decision_owner: delivery-lead
`,
    `$ yq '.checkpoints[] | [.date,.signal,.action]' dependency-escalation.yaml
- 2026-12-02
- contract_tests_not_started
- request_joint_test
- 2026-12-06
- no_candidate_build
- enable_fallback_adapter
依赖失约有预先日期、触发信号和替代动作。`,
  ),
});

Object.assign(e5Examples, {
  '容量从需求反推': seExample(
    '订单系统峰值资源账',
    'typescript',
    `const peakRps = 1800;
const connectionSeconds = 0.35;
const connections = peakRps * connectionSeconds;
const faultHeadroom = 1.5;
const provisioned = Math.ceil(connections * faultHeadroom);
const storageGb = 2400 * 0.7 * 365 * 2 / 1024;
console.log({ connections, provisioned, storageGb: Math.ceil(storageGb) });
`,
    `$ pnpm exec tsx capacity-model.ts
{ connections: 630, provisioned: 945, storageGb: 1199 }
数据库至少需要 945 个可用连接余量，两年原始订单存储预计 1.2TB，备份和索引另行放大。`,
  ),
  '成本按单位业务': seExample(
    'AWS 按服务标签汇总成本',
    'bash',
    `aws ce get-cost-and-usage \
  --time-period Start=2026-11-01,End=2026-12-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=TAG,Key=service \
  --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' \
  --output table
`,
    `---------------------------------
|          GetCostAndUsage       |
+------------------+------------+
| service$orders   | 1420.35    |
| service$search   | 620.18     |
| service$untagged | 94.27      |
+------------------+------------+
本月订单服务成本 1420.35 美元；未打标签成本 94.27 美元需要治理。`,
  ),
  '性能预算转资源': seExample(
    '每秒预算与实例数换算',
    'javascript',
    `import http from 'k6/http';
export const options = {
  scenarios: { steady: { executor: 'constant-arrival-rate', rate: 100,
    timeUnit: '1s', duration: '5m', preAllocatedVUs: 80 } },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    dropped_iterations: ['count<10'],
  },
};
export default function () {
  http.get('http://orders.test/api/orders/health');
}
`,
    `$ k6 run steady.js
http_req_duration: p(95)=248ms
dropped_iterations: 0
vus_max: 54
单实例在 100 RPS 预算下使用 54 VU；结合峰值 1800 RPS，需要至少 18 个等效实例再加故障余量。`,
  ),
  '人员与认知负荷': seExample(
    '团队技能与值班负载',
    'csv',
    `person,primary_skill,backup_for,oncall_hours,review_queue
li,orders-api,sre-runbook,8,3
wang,postgres,orders-api,8,5
chen,frontend,analytics,8,1
`,
    `$ Import-Csv team.csv | Group-Object backup_for |
>   Select-Object Name,Count
Name          Count
----          -----
orders-api    2
analytics     1
sre-runbook   1
analytics 只有一人可备份且页面评审队列为 1；数据库主备和 API 主备已明确。`,
  ),
  '阈值与调整': seExample(
    '容量预警触发范围决策',
    'yaml',
    `thresholds:
  database_connections_percent:
    warn: 65
    action: reduce_batch_size
  storage_percent:
    warn: 70
    action: request_volume_expansion
  team_oncall_hours:
    warn: 12
    action: rotate_secondary_owner
review:
  cadence: weekly
  decision_log: docs/capacity-decisions.md
`,
    `$ yq '.thresholds.database_connections_percent' capacity-thresholds.yaml
warn: 65
action: reduce_batch_size
$ rg -n "2026-11-24|connections" docs/capacity-decisions.md
14: 2026-11-24 connections 71% -> reduced backfill to 500 rows/batch
阈值触发了明确的批大小调整，并在决策日志中留下证据。`,
  ),
});

Object.assign(e5Examples, {
  '债务写清利息': seExample(
    '支付模块技术债账本',
    'yaml',
    `debt_id: TD-17
location: legacy-payment/service.ts
impact: every refund change needs 2 days manual regression
incidents_last_90d: 3
change_lead_time_days: 6
remediation_weeks: 3
mitigation: contract tests around provider callbacks
owner: payments-team
review_at: 2026-12-15
`,
    `$ yq '.impact, .incidents_last_90d, .mitigation' debts/td-17.yaml
every refund change needs 2 days manual regression
3
contract tests around provider callbacks
债务有交付延迟、事故和临时缓解，不再只是“代码不好”。`,
  ),
  '先建立行为基线': seExample(
    '旧退款接口快照测试',
    'typescript',
    `const cases = [
  { body: { orderId: 'o-1', amount: 100 }, expected: { status: 202, code: 'REFUND_ACCEPTED' } },
  { body: { orderId: 'o-1', amount: 0 }, expected: { status: 422, code: 'INVALID_AMOUNT' } },
];
for (const item of cases) {
  const response = await legacyRefund(item.body);
  expect(response.status).toBe(item.expected.status);
  expect(response.body.code).toBe(item.expected.code);
}
`,
    `$ pnpm exec vitest run legacy-refund.contract.spec.ts
✓ refund accepted snapshot
✓ zero amount rejected snapshot
2 passed
旧服务真实响应被固化为迁移前基线，新实现必须逐项兼容。`,
  ),
  '防腐层隔离旧系统': seExample(
    '旧库存表适配到新端口',
    'typescript',
    `interface StockPort { available(sku: string): Promise<number>; }
class LegacyStockAdapter implements StockPort {
  constructor(private readonly db: LegacyDatabase) {}
  async available(sku: string) {
    const row = await this.db.query('SELECT on_hand-reserved AS n FROM old_stock WHERE sku=?', [sku]);
    return Math.max(0, Number(row?.n ?? 0));
  }
}
const stock = new LegacyStockAdapter(legacyDb);
console.log(await stock.available('sku-red-m'));
`,
    `$ pnpm exec tsx legacy-stock-adapter.ts
17
$ npx depcruise src --config .dependency-cruiser.cjs
✔ 0 violations
新应用只看到 StockPort；旧表名和 SQL 被限制在适配器内部。`,
  ),
  '增量迁移状态机': seExample(
    '库存迁移阶段与停点',
    'typescript',
    `type Phase = 'observe' | 'shadow' | 'dual_write' | 'read_new' | 'write_new' | 'retire';
const gates: Record<Phase, string> = {
  observe: 'baseline_captured',
  shadow: 'diff_rate<0.001',
  dual_write: 'mismatch_rows=0_for_24h',
  read_new: 'rollback<5m',
  write_new: 'old_write_calls=0',
  retire: 'retention_window_closed',
};
const current: Phase = 'dual_write';
console.log({ current, requiredGate: gates[current], next: 'read_new' });
`,
    `$ pnpm exec tsx migration-state.ts
{ current: 'dual_write', requiredGate: 'mismatch_rows=0_for_24h', next: 'read_new' }
双写没有连续 24 小时零差异前不能切读，每一步都有停点和回滚门槛。`,
  ),
  '收益与退出': seExample(
    '旧路径调用归零后下线',
    'powershell',
    `$legacy = (rg -n "LegacyInventoryClient" src | Measure-Object).Count
$new = (rg -n "InventoryPort" src | Measure-Object).Count
$retentionClosed = (Get-Date) -gt [datetime]'2026-12-31'
[pscustomobject]@{
  legacy_calls = $legacy
  new_ports = $new
  retention_closed = $retentionClosed
  can_retire = ($legacy -eq 0 -and $retentionClosed)
}
`,
    `$ ./migration-exit.ps1
legacy_calls new_ports retention_closed can_retire
------------ --------- --------------- ----------
0            14        True            True
旧调用归零且数据保留期结束，资源、值班和运行手册交接后可正式下线。`,
  ),
});

Object.assign(e5Examples, {
  '按受众组织材料': seExample(
    '发布评审受众与关注点',
    'yaml',
    `review: orders-canary
audiences:
  product:
    decision: accept_30m_canary_window
    evidence: [checkout_success_slo, rollback_time]
  sre:
    decision: approve_capacity_and_runbook
    evidence: [peak_rps_test, alert_routing, rollback_drill]
  security:
    decision: approve_secret_and_network_policy
    evidence: [rbac_review, network_policy_test]
main_page: docs/reviews/orders-canary.md
`,
    `$ yq '.audiences | to_entries[] | [.key,.value.decision]' review.yaml
- product
- accept_30m_canary_window
- sre
- approve_capacity_and_runbook
- security
- approve_secret_and_network_policy
每类受众都有一项要做的决定和对应证据。`,
  ),
  '评审证据而非主张': seExample(
    '评审包证据完整性检查',
    'powershell',
    `$required = 'design.md','capacity.md','rollback.md','slo-query.txt','pact-result.xml'
$missing = $required | Where-Object { -not (Test-Path "docs/reviews/orders/$_") }
if ($missing) { throw "missing review evidence: $($missing -join ', ')" }
Get-ChildItem docs/reviews/orders | Select-Object Name,Length
`,
    `$ ./check-review-evidence.ps1
Name             Length
----             ------
design.md          4210
capacity.md        1882
rollback.md        1551
slo-query.txt       742
pact-result.xml    9031
评审材料缺一项就阻断，结论可追到数据与测试。`,
  ),
  '决策日志与负责人': seExample(
    '架构决策索引',
    'json',
    `{
  "id": "DEC-042",
  "question": "Can orders use transactional outbox?",
  "options": ["dual_write", "outbox", "single_database"],
  "decision": "outbox",
  "owner": "architecture-board",
  "review_at": "2027-02-01",
  "risks": ["relay_lag", "duplicate_delivery"],
  "evidence": ["adr/0042-outbox.md", "runbooks/outbox.md"]
}
`,
    `$ jq '{id,decision,owner,review_at}' docs/decisions/dec-042.json
{
  "id": "DEC-042",
  "decision": "outbox",
  "owner": "architecture-board",
  "review_at": "2027-02-01"
}
决定有编号、备选方案、负责人和复审日期。`,
  ),
  '变更影响评估': seExample(
    '新增实时库存看板影响表',
    'typescript',
    `const change = {
  request: 'realtime_inventory_dashboard',
  milestoneImpactDays: 3,
  newDependency: 'warehouse-cdc',
  pii: false,
  peakReadQps: 240,
  replacement: 'defer_after_canary',
  approver: 'product-owner',
};
const blocked = change.newDependency !== null && change.milestoneImpactDays > 2;
console.log({ ...change, decision: blocked ? 'reject_or_replace' : 'accept' });
`,
    `$ pnpm exec tsx change-impact.ts
{
  request: 'realtime_inventory_dashboard',
  milestoneImpactDays: 3,
  newDependency: 'warehouse-cdc',
  peakReadQps: 240,
  decision: 'reject_or_replace'
}
新增看板引入 CDC 依赖并推迟里程碑，当前建议灰度后再做或替换首版范围。`,
  ),
  '沟通节奏与升级': seExample(
    '风险升级矩阵',
    'yaml',
    `updates:
  daily: [scope, milestones, open_risks]
  pre_release: [slo, rollback, oncall]
escalate:
  - signal: rollback_drill_failed
    within_minutes: 30
    notify: [product-owner, sre-lead, security-lead]
  - signal: external_dependency_delayed
    within_minutes: 120
    notify: [delivery-lead, product-owner]
emergency_change:
  approval: two_person
  post_action: restore_git_state_and_audit
`,
    `$ yq '.escalate[] | [.signal,.within_minutes,.notify]' communication.yaml
- rollback_drill_failed
- 30
- [product-owner, sre-lead, security-lead]
- external_dependency_delayed
- 120
- [delivery-lead, product-owner]
升级信号、时限和通知对象预先定义，坏消息不会被拖到发布当天。`,
  ),
});

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E5_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e5Stage, '范围、里程碑和可交付物'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能把需求拆成用户故事和验收条件，知道架构、开发、测试、发布各自的输入输出。',
    goal: '把业务目标拆成可验收范围、里程碑和交付物，显式记录非目标与依赖，使进度判断基于证据而不是完成百分比。',
    guidedPractice: '为一个季度订单平台项目建立里程碑：契约冻结、核心链路、迁移演练、灰度发布、全量切换。每个里程碑列出输入、输出、验收人、证据和未完成影响，并为范围外请求建 parking lot。',
    independentPractice: '为一个多团队项目写交付计划，包含范围树、非目标、关键路径、每个可交付物的完成定义和一个中途范围变更的处理示例；不得使用“基本完成”这类无法验收的状态。',
    commonErrors: [
      '里程碑按“开发完成 80%”汇报，却没有可运行功能、测试结果或迁移证据，剩余 20% 往往吞掉整个排期。',
      '只写要交付什么，不写非目标和延期影响，新的需求不断被插入当前迭代，关键路径持续移动。',
    ],
    sourceRefs: ['PMI Disciplined Agile. https://www.pmi.org/disciplined-agile', 'Scrum Guide. https://scrumguides.org/', ADR],
    steps: [
      ['范围树与非目标', '把业务目标拆成能力、用户任务、接口和运维产物，每个节点标明必须、应该、可选；非目标要说明本次不覆盖的租户、渠道、迁移方式和兼容策略。失败边界是范围只按功能列表存在，测试、文档和迁移被默认为额外工作；验证证据是范围树与验收清单一致，任何新增项都能指出增加的成本与被替换项。', '范围包含交付所需的全部工作'],
      ['里程碑按证据关闭', '里程碑不是日期标签，而是通过特定证据的决策点：核心链路可运行、契约测试通过、灰度回滚完成。为每个里程碑定义进入条件、退出证据和负责人。失败边界是日期到了就标完成，质量证据留到上线前补；验证证据是评审包中的测试报告、演示脚本、配置和审批记录，缺一项保持未完成。', '里程碑由证据关闭'],
      ['可交付物与完成定义', '每个可交付物写清接收者、格式、版本、验收方法、运行环境和失败处理，例如“可部署 chart”需包含 values schema、dry-run 结果、回滚说明和负责人。失败边界是可交付物只有源文件，没有运行说明和验证记录；验证证据是另一位工程师从干净环境按说明安装并使用，记录实际耗时和阻塞点。', '交付物必须能被别人使用'],
      ['关键路径与并行', '用依赖图找出决定总工期的关键路径，区分可并行设计、开发和迁移准备；外部审批和数据库回填通常比编码更可能成为瓶颈。失败边界是所有人同时做一个不存在的接口，集成阶段才发现模型冲突；验证证据是依赖图、每周关键路径变化和提前完成的接口契约与测试夹具。', '先找决定工期的依赖'],
      ['进展与重估', '每周用新增证据、剩余工作和风险变化更新预测，而不是用已完成工时除以总工时。发现关键路径延误时调整范围、顺序或资源，并把决定写进变更记录。失败边界是持续报告百分比却从不更新预测；验证证据是燃尽或累计流图、关键路径历史和一次基于新证据的范围调整。', '进度看证据和剩余风险'],
    ],
  },
  {
    name: seName(e5Stage, '依赖、风险、假设和缓冲'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '建过项目里程碑，能区分内部依赖、外部依赖、风险、问题和假设。',
    goal: '维护可执行的依赖和风险账本，把假设转成实验，按关键路径放置缓冲，明确风险触发、负责与升级路径。',
    guidedPractice: '为迁移项目建立 RAID 表：风险、假设、问题、依赖。给每个外部接口标注负责人、承诺日期、最晚需要日期和替代方案；为关键路径设置总缓冲和单项缓冲，定义何时消耗、何时升级。',
    independentPractice: '接管一份已有项目计划，找出至少五项被写成“默认成立”的依赖；为其中三项设计可在一周内完成的验证，并为剩余两项写替代路径和停止条件。',
    commonErrors: [
      '所有任务的缓冲都藏在各自估算里，团队看不到总缓冲，风险到来时无法判断项目还剩多少真正余量。',
      '依赖只写团队名称，没有交付接口、验收样例和承诺日期，等对方延期时才发现双方理解不同。',
    ],
    sourceRefs: ['Project Management Institute risk management. https://www.pmi.org/learning/library/risk-management', SRE_WORKBOOK, CONWAY],
    steps: [
      ['依赖要有接口', '每项依赖记录提供方、接收方、交付格式、环境、验收样例和最晚需要日期；同步 API、数据库、云资源、审批与人员都算依赖。失败边界是依赖状态只有“进行中”，接收方无法提前构建适配器；验证证据是契约样例、共同测试环境和提供方的可运行版本，而不是口头承诺。', '依赖交付也要有验收物'],
      ['风险与问题分开', '风险是尚未发生但可能影响目标的事件，问题是已经发生并需要处理的事实。风险有概率、影响、触发信号和缓解，问题有负责人、当前影响和恢复期限。失败边界是把已发生的延期继续留在风险区，没人负责修复；验证证据是每周状态区分、转换时间和升级记录。', '发生前叫风险发生后叫问题'],
      ['假设与实验', '把关键假设登记为可反驳命题，设置最便宜的验证实验和决策期限。例如假设旧客户端只使用 v1 字段，可抽样网关请求与消费者代码确认。失败边界是假设长期无人验证，却在架构中按最有利情况推进；验证证据是实验报告、样本量和假设状态的明确改变。', '不知就先做最小验证'],
      ['缓冲放在关键路径', '总工期缓冲应显式管理，项目层缓冲覆盖关键路径共同风险，单项缓冲覆盖特定高波动任务；缓冲消耗需要触发信号和决策，不做隐藏。失败边界是多个人把缓冲重复加在估算里，最后既超期又无法解释；验证证据是缓冲燃尽图、被消耗原因和对下一阶段的预测调整。', '缓冲要可见且集中管理'],
      ['升级与替代方案', '为高风险依赖设定升级时点和决策人，替代方案至少包含一种降级路径，例如自建适配器、切换供应商或缩小首版范围。失败边界是外部接口延期后仍无替代，所有团队停下来等待；验证证据是一次依赖失约演练，团队在约定时间内选择替代路径并更新成本与风险。', '高风险依赖必须有 B 路径'],
    ],
  },
  {
    name: seName(e5Stage, '容量、成本、性能和人员规划'),
    track,
    contentStatus: 'reviewed',
    minutes: 49,
    prerequisite: '理解服务容量模型、云资源账单和团队交付节奏，能读性能基线与人员负载。',
    goal: '把业务预测转成基础设施容量、单位成本和人员负载计划，保留峰值与故障余量，并用可观测数据调整资源分配。',
    guidedPractice: '按峰值 QPS、平均延迟、请求结构、存储增长和 N+1 故障切换估算节点、数据库、缓存与消息容量；把账单拆成闲时、峰值和故障演练三类，计算每千笔订单成本。',
    independentPractice: '为一个季度项目建立容量与人员计划：列技能瓶颈、关键岗位备份、招聘或外包周期、峰值人力、值班负担和预算上限，并给出超过阈值时缩小范围还是增加资源的决策规则。',
    commonErrors: [
      '按平均负载采购资源，没有为活动峰值、滚动发布和单故障域失效留余量，自动扩容又受节点上限阻断。',
      '只统计开发工时，不计算评审、测试、迁移、值班和培训时间，项目计划中的“满负荷”人员实际没有交付余量。',
    ],
    sourceRefs: [SRE_BOOK, 'FinOps Foundation Framework. https://www.finops.org/framework/', CONWAY],
    steps: [
      ['容量从需求反推', '从用户量、订单率、请求比例、数据尺寸和增长周期得到 QPS、带宽、连接与存储；再按复制、索引、消息和备份放大。为峰值与 N+1 设安全水位，超过时扩容或限流。失败边界是只看应用 CPU，忽略数据库连接与磁盘 IOPS 先饱和；验证证据是资源账、压测曲线和瓶颈资源的预测偏差。', '容量要算完整资源链'],
      ['成本按单位业务', '把云账单映射到环境、服务、租户和业务动作，计算每千订单、每 GB 月存储、每次查询的成本，区分固定与变动成本。失败边界是只追资源单价，忽略日志、网络、备份和跨区复制；验证证据是账单标签覆盖率、单位成本趋势与一项优化前后的真实账单变化。', '成本口径要能对应业务'],
      ['性能预算转资源', '性能预算决定实例规格和副本数，容量模型决定峰值与故障余量，两者共同形成资源计划；共享依赖要计算放大。失败边界是用一个线程数或数据库连接数覆盖所有环境；验证证据是各环境容量表、连接池上限和目标 QPS 下的资源曲线。', '性能预算是容量的输入'],
      ['人员与认知负荷', '按团队所有权分配工作，识别只有一人掌握的组件、跨团队评审队列和值班负担；关键岗位设置备份与交接，长期超额负载会转化为事故和离职风险。失败边界是把人员利用率排到 100%，没有学习和故障余量；验证证据是每周工作量、评审等待、告警数量和交接演练记录。', '人员容量也要留缓冲'],
      ['阈值与调整', '为流量、成本、连接、存储和人员负载设置预警阈值，超过后按预先规则扩容、缩小范围或延后非核心工作。每月复盘预测与实际。失败边界是阈值存在但无人有权调整预算或范围；验证证据是决策记录、调整时间和下一周期预测误差，资源与范围随事实更新。', '阈值必须连接决策权'],
    ],
  },
  {
    name: seName(e5Stage, '技术债、遗留系统和迁移路线'),
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '能读代码依赖、数据库迁移和部署拓扑，理解业务风险、发布回滚与增量交付。',
    goal: '把技术债转成带业务影响和利息的账本，为遗留系统设计可回退的增量迁移路线，并在收益、风险和容量之间排序。',
    guidedPractice: '为一个旧单体建立债务条目：重复订单逻辑、无测试支付模块、手工数据库脚本和过期框架。每条记录业务影响、发生频率、变更阻力、修复成本、临时缓解和计划窗口，再按风险与收益排序。',
    independentPractice: '为一个遗留库存模块设计六阶段迁移：观察、建防腐层、影子读、双写、切读、停旧写，并为每个阶段定义验收、停点、对账与回滚。',
    commonErrors: [
      '技术债清单只写“代码烂”，没有说明它如何拖慢交付、制造事故或增加成本，排期时永远竞争不过业务需求。',
      '采取一次性重写，新旧系统长期不可比较，切换前没有真实流量验证，最终无法证明行为一致也无法安全回退。',
    ],
    sourceRefs: ['Martin Fowler: StranglerFigApplication. https://martinfowler.com/bliki/StranglerFigApplication.html', 'Refactoring: Improving the Design of Existing Code. https://martinfowler.com/books/refactoring.html', ADR],
    steps: [
      ['债务写清利息', '债务条目记录问题位置、业务影响、触发条件、近三个月事故或变更延迟、修复成本、临时缓解和到期日。利息可以是每次需求多两天回归、每次迁移都有锁表风险。失败边界是债务只有技术标签，没有可比较的业务代价；验证证据是工单周期、故障记录和代码度量与条目相互引用。', '技术债要用交付代价排序'],
      ['先建立行为基线', '迁移前为旧系统补黑盒契约测试、流量样本、数据快照和性能基线，确认现在真实做什么，而不是只看设计文档。失败边界是旧行为未记录，新实现一上线就改变历史客户端依赖；验证证据是重放固定请求得到相同业务输出，差异清单经过业务确认。', '不理解旧行为就无法替换'],
      ['防腐层隔离旧系统', '在新代码与遗留系统之间建立适配器，把旧协议、字段和异常转换为本地模型；调用方逐步依赖新端口，而不是继续扩散旧实体。失败边界是防腐层直接暴露旧数据库结构，新系统复制旧耦合；验证证据是依赖图、转换测试和旧接口调用量随时间下降。', '先隔离再替换'],
      ['增量迁移状态机', '迁移按观察、影子读、双写、切读、切写、停旧写推进，每阶段设定流量比例、差异阈值和停点。双写必须解决顺序与失败补偿，切读前验证数据新鲜度。失败边界是双写未对账就切主，少量用户数据永久丢失；验证证据是逐阶段流量、双写差异、对账结果、回滚耗时和事故零发生记录。', '每一步都要可观察可停'],
      ['收益与退出', '迁移路线必须说明何时停止投入：旧模块调用归零、数据保留期结束、运行手册和团队所有权转移完成。若收益低于预期，应有缩小范围或回到上一步的依据。失败边界是项目为了继续而继续，长期双系统并存；验证证据是成本对比、调用计数、值班责任和旧资源下线清单。', '迁移也需要完成条件'],
    ],
  },
  {
    name: seName(e5Stage, '评审、干系人沟通和变更控制'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能准备架构与交付材料，理解里程碑、风险、验收证据和跨团队决策流程。',
    goal: '按受众组织技术评审，使用决策日志和变更控制保护范围，让业务、开发、运维和安全对事实、风险和下一步形成共同记录。',
    guidedPractice: '为一次发布评审准备一页决策摘要：目标、方案、关键风险、验证证据、成本、回滚和待决问题；给产品、SRE、安全和业务分别准备关注点，会议结束形成负责人和期限。',
    independentPractice: '处理一个中途新增的“实时库存看板”需求：评估范围、依赖、数据一致性、容量和运维成本，提交替换方案或延期决定，并更新里程碑、风险账本与通知对象。',
    commonErrors: [
      '评审会变成技术细节演示，业务方无法判断成本和风险，会议结束后仍由开发自行承担范围决定。',
      '口头批准紧急变更后没有记录版本、影响和回滚，后续复盘无法区分授权变更与配置漂移。',
    ],
    sourceRefs: ['Google Engineering Practices: Code Review. https://google.github.io/eng-practices/review/', 'Team Topologies. https://teamtopologies.com/', ADR],
    steps: [
      ['按受众组织材料', '业务方需要目标、收益、成本、风险和决策选项，架构方需要边界、依赖和质量场景，运维需要发布、监控、容量和回滚。同一评审包用分层链接，主页面只保留决策。失败边界是把所有实现细节塞进一页，重要风险被淹没；验证证据是参会者在会前能指出自己要决定的问题和可接受的证据。', '先说明要决定什么'],
      ['评审证据而非主张', '方案评审必须附设计图、接口样例、容量模型、失败路径、测试计划和安全边界；未验证项明确标注实验状态。失败边界是用“业界最佳实践”替代适用性论证；验证证据是每个关键结论都可追到 ADR、实验、数据或权威规范。', '没有证据的结论只能算假设'],
      ['决策日志与负责人', '每次评审记录日期、参与者、问题、选项、决定、反对意见、剩余风险、负责人和复查日期。决策不因会议结束而消失，后续变更引用原编号。失败边界是同一问题反复讨论却没有历史；验证证据是决策日志可搜索，代码、配置和运行手册引用对应决定。', '决定要有编号和后果'],
      ['变更影响评估', '范围变更进入统一入口，评估对里程碑、依赖、数据模型、容量、测试和值班的影响，再选择接受、替换、延期或拒绝。失败边界是新增小功能被口头插入，却引入新的外部依赖和合规审查；验证证据是变更单的前后范围、成本差、审批与计划更新。', '小改动也要看系统影响'],
      ['沟通节奏与升级', '固定发布前、里程碑和重大风险的状态更新，明确谁对谁沟通、在什么阈值升级；紧急变更使用简化流程但仍留审计。失败边界是坏消息被延迟到上线前才暴露；验证证据是状态记录、升级时间和一次高风险问题的及时决策，并在复盘时核对通知对象是否真正收到与回应。', '风险越早暴露越便宜'],
    ],
  },
], e5Examples);

// ── E6 Brownfield、故障演练与架构答辩 ───────────────────────────────────────
const e6Stage = 'Brownfield、故障演练与架构答辩';

const e6Examples: Record<string, StepExample> = {};

Object.assign(e6Examples, {
  '代码与依赖盘点': seExample(
    '仓库、提交与运行镜像基线',
    'bash',
    `git remote -v
git log --since=90.days --format='%h %ad %s' --date=short | Select-Object -First 10
git describe --tags --always
jq '.dependencies, .devDependencies' package.json
docker inspect registry.example/orders:prod \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
`,
    `$ git describe --tags --always
v3.8.1-42-g4f2ac14
$ jq '.dependencies' package.json
{"express":"4.18.2","pg":"8.11.3","kafkajs":"2.2.4"}
$ docker inspect ... --format ...
4f2ac14d83b1
当前生产镜像对应的 commit 是 4f2ac14，最近发布标签为 v3.8.1。`,
  ),
  '部署拓扑盘点': seExample(
    '集群资源与 Helm revision',
    'bash',
    `kubectl get all,ingress,pvc,cronjob -n orders
helm list -n orders
helm history orders -n orders --max 5
kubectl get events -n orders --sort-by=.lastTimestamp | Select-Object -Last 20
`,
    `$ helm list -n orders
NAME    NAMESPACE REVISION STATUS   CHART          APP VERSION
orders  orders    42       deployed orders-3.8.1   v3.8.1
$ kubectl get cronjob -n orders
NAME                SCHEDULE    SUSPEND ACTIVE LAST SCHEDULE
legacy-reconcile    0 2 * * *   False   0      12h
发现一个未写入应用仓库的遗留 CronJob；部署拓扑以集群事实为准。`,
  ),
  '数据资产盘点': seExample(
    '数据库、备份与表用途盘点',
    'sql',
    `SELECT current_database(), version();
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;
SELECT schemaname, tablename, tableowner
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename;
`,
    `$ psql "$DATABASE_URL" -f inventory.sql
current_database | PostgreSQL 16.4
public.orders | 4821033
public.order_items | 12984221
public.legacy_refunds | 8821
owner=orders_app
最大的业务表是 order_items；legacy_refunds 仍需确认用途和保留周期。`,
  ),
  '生产状态与组织': seExample(
    '生产权限与值班入口盘点',
    'bash',
    `kubectl auth can-i --list -n orders
kubectl get rolebindings -n orders
kubectl get configmaps -n orders
curl -fsS http://alertmanager.test/api/v2/status | jq '.cluster.status'
`,
    `$ kubectl auth can-i --list -n orders
get secrets.orders-db             [orders-breakglass]
create deployments.apps          [orders-prod-deployer]
$ curl -fsS http://alertmanager.test/api/v2/status | jq '.cluster.status'
"ready"
只有 breakglass 组能读数据库 Secret；主值班、备班和告警路由均已登记。`,
  ),
  '未知项与风险归档': seExample(
    '接管未知项登记表',
    'yaml',
    `unknowns:
  - id: U-01
    question: who owns legacy_refunds cleanup?
    status: unknown
    impact: data_retention
    evidence_needed: owner_confirmation
    due: 2026-11-28
  - id: U-02
    question: does mobile-2 read statusCode?
    status: unverified
    impact: contract_change
    evidence_needed: gateway_sample_and_pact
    due: 2026-11-26
`,
    `$ yq '.unknowns[] | {id,status,evidence_needed}' unknowns.yaml
id: U-01
status: unknown
evidence_needed: owner_confirmation
id: U-02
status: unverified
evidence_needed: gateway_sample_and_pact
未知项没有被猜测替代，关键项在改动前有负责人和截止日。`,
  ),
});

Object.assign(e6Examples, {
  '变更热点与故障热点': seExample(
    '提交频率交叉事故模块',
    'powershell',
    `$commits = git log --since='180 days ago' --format= --numstat |
  Where-Object { $_ -match '^\\d+\\s+\\d+\\s+(.+)$' } |
  ForEach-Object { $Matches[1] } |
  Group-Object | Sort-Object Count -Descending | Select-Object -First 5
$incidents = Import-Csv incidents.csv |
  Group-Object module | Sort-Object Count -Descending
$commits | Join-Object $incidents -On Name -Eq module
`,
    `Name                    Count incidents
----                    ----- ---------
src/orders/pricing.ts   27    6
src/orders/refund.ts    19    4
src/inventory/stock.ts   9    2
pricing.ts 同时是变更与事故热点，比单纯改动最多的稳定适配层更优先。`,
  ),
  '运行瓶颈与单点': seExample(
    '慢查询与单分片饱和',
    'sql',
    `SELECT calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(total_exec_time::numeric, 2) AS total_ms,
       left(query, 90) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 5;

SELECT shard_id, cpu_percent, lock_wait_ms
FROM shard_metrics
WHERE shard_id = 'tenant-big-07';
`,
    `$ psql "$DATABASE_URL" -f hotspots.sql
calls  mean_ms total_ms query
8812   420.31  3704.2   SELECT ... FROM order_items WHERE tenant_id=$1
shard_id       cpu_percent lock_wait_ms
tenant-big-07  94.2        8812
全局 CPU 正常，但 tenant-big-07 分片接近饱和并伴随锁等待。`,
  ),
  '架构约束分类': seExample(
    '约束来源与解除证据',
    'json',
    `{
  "constraint": "payments must run in cn-region",
  "category": "regulatory",
  "source": "privacy-impact-assessment-042",
  "affected": ["failover", "cross_region_latency"],
  "verification": ["deployment-region-audit", "data-residency-hitest"],
  "expires": "2027-12-31",
  "owner": "privacy-office"
}
`,
    `$ jq '{category,source,verification,owner}' constraint.json
{
  "category": "regulatory",
  "source": "privacy-impact-assessment-042",
  "verification": ["deployment-region-audit", "data-residency-hitest"],
  "owner": "privacy-office"
}
约束来自法规评估而不是传闻，解除条件与复审日期明确。`,
  ),
  '风险排序': seExample(
    '单点数据库与风格债务排序',
    'typescript',
    `type Risk = { name: string; impact: number; probability: number; recovery: number };
const risks: Risk[] = [
  { name: 'single-primary-db', impact: 5, probability: 4, recovery: 5 },
  { name: 'unused-css', impact: 1, probability: 5, recovery: 1 },
  { name: 'manual-release', impact: 4, probability: 4, recovery: 3 },
];
const score = (r: Risk) => r.impact * r.probability * r.recovery;
console.table(risks.sort((a, b) => score(b) - score(a)));
`,
    `$ pnpm exec tsx risk-rank.ts
┌─────────┬───────────────────┬────────┬─────────────┬──────────┐
│ (index) │ name              │ impact │ probability │ recovery │
│ 0       │ single-primary-db │ 5      │ 4           │ 5        │
│ 1       │ manual-release    │ 4      │ 4           │ 3        │
│ 2       │ unused-css        │ 1      │ 5           │ 1        │
└─────────┴───────────────────┴────────┴─────────────┴──────────┘`,
  ),
  '约束下的改造边界': seExample(
    '区域约束验证实验',
    'bash',
    `kubectl config use-context cn-test
kubectl apply -f admission/region-policy.yaml
kubectl run region-probe --image=busybox:1.36 \
  --overrides='{"spec":{"nodeSelector":{"topology.kubernetes.io/region":"us-east-1"}}}' \
  -- sleep 60
kubectl get events --field-selector reason=FailedCreate
`,
    `$ kubectl get events --field-selector reason=FailedCreate
Warning  FailedCreate  admission  pod "region-probe" is forbidden:
node region us-east-1 violates data-residency policy
准入策略阻止越区调度；约束有可执行证据，团队可据此设计同区域多可用区方案。`,
  ),
});

Object.assign(e6Examples, {
  '扩展兼容模型': seExample(
    '订单备注可空字段扩展',
    'sql',
    `ALTER TABLE orders
  ADD COLUMN note_v2 text NULL,
  ADD COLUMN note_schema smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN orders.note_v2 IS
  'expand phase: old reader ignores, new reader falls back to note';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name LIKE 'note%';
`,
    `ALTER TABLE
COMMENT
 column_name | is_nullable | column_default
 note_v2     | YES         | null
 note_schema | NO          | 1
旧应用仍可读写 note，新应用可逐步写 note_v2；迁移没有删除旧字段。`,
  ),
  '双写与失败处理': seExample(
    '双写失败写入补偿队列',
    'typescript',
    `type WriteResult = { target: 'legacy' | 'new'; ok: boolean };
async function dualWrite(order: Order): Promise<WriteResult[]> {
  const legacy = await writeLegacy(order);
  try {
    await writeNew(order);
    return [{ target: 'legacy', ok: true }, { target: 'new', ok: true }];
  } catch (error) {
    await outbox.enqueue({ type: 'ReplayOrderWrite', orderId: order.id });
    return [{ target: 'legacy', ok: legacy.ok }, { target: 'new', ok: false }];
  }
}
const result = await dualWrite(order);
console.log(result);
`,
    `$ node --import tsx dual-write.ts
[ { target: 'legacy', ok: true }, { target: 'new', ok: false } ]
$ psql "$DATABASE_URL" -c "SELECT type, payload FROM outbox WHERE status='pending';"
ReplayOrderWrite {"orderId":"o-1042"}
新库失败没有静默吞掉，补偿任务可重放并按业务键幂等。`,
  ),
  '回填与限速': seExample(
    '带 checkpoint 的批次回填',
    'sql',
    `WITH batch AS (
  SELECT id, note
  FROM orders
  WHERE id > (SELECT last_id FROM migration_checkpoint WHERE job='note-v2')
  ORDER BY id
  LIMIT 1000
)
UPDATE orders o
SET note_v2 = b.note, note_schema = 2
FROM batch b
WHERE o.id = b.id
RETURNING o.id;
`,
    `$ psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backfill-note.sql
UPDATE 1000
$ psql "$DATABASE_URL" -c \
>   "UPDATE migration_checkpoint SET last_id=4821033, updated_at=now() WHERE job='note-v2';"
UPDATE 1
本批 1000 行完成并推进 checkpoint，下一批可从 4821033 之后继续。`,
  ),
  '影子读与切读': seExample(
    '影子读差异与流量比例',
    'powershell',
    `$samples = Import-Csv shadow-read.csv
$diff = $samples | Where-Object { $_.legacy_note -ne $_.new_note }
$rate = $diff.Count / [math]::Max(1, $samples.Count)
[pscustomobject]@{
  samples = $samples.Count
  diffs = $diff.Count
  diff_rate = [math]::Round($rate, 6)
  cutover_allowed = ($rate -lt 0.001)
}
`,
    `$ ./shadow-gate.ps1
samples diffs diff_rate cutover_allowed
------- ----- --------- ---------------
200000  84    0.00042   True
影子读差异率 0.042%，低于 0.1% 门槛；先切 5% 读流量并保留回主路径。`,
  ),
  '切写、停旧与回滚': seExample(
    '切写后旧路径计数与回滚',
    'bash',
    `psql "$DATABASE_URL" -c \
  "INSERT INTO cutover_state(key,value) VALUES ('write_target','new') ON CONFLICT (key) DO UPDATE SET value='new';"
curl -fsS http://orders.test/admin/cutover/status
sleep 600
psql "$DATABASE_URL" -c \
  "SELECT count(*) FROM legacy_order_writes WHERE created_at > now() - interval '10 minutes';"
`,
    `$ curl -fsS http://orders.test/admin/cutover/status
{"writeTarget":"new","legacyReads":0,"newWrites":18442,"mismatches":0}
$ psql ... -c "SELECT count(*) ..."
 count
     0
切写十分钟后旧写为零、对账为零；旧路径仍保留只读回滚窗口。`,
  ),
});

Object.assign(e6Examples, {
  '演练假设与爆炸半径': seExample(
    '受控 Pod 故障实验',
    'yaml',
    `apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: orders-pod-failure
  namespace: orders-drill
spec:
  action: pod-failure
  mode: one
  duration: "2m"
  selector:
    namespaces: [orders-drill]
    labelSelectors:
      app.kubernetes.io/name: orders-api
  scheduler:
    cron: "@every 30m"
`,
    `$ kubectl apply -f orders-pod-failure.yaml
podchaos.chaos-mesh.org/orders-pod-failure created
$ kubectl get podchaos -n orders-drill
NAME                 ACTION       DURATION   AGE
orders-pod-failure  pod-failure  2m         18s
演练限定在 orders-drill 命名空间，单 Pod、两分钟、三十秒自动调度。`,
  ),
  'Pod 与节点故障': seExample(
    '删除 Pod 观察业务恢复',
    'bash',
    `kubectl delete pod orders-api-7f9c -n orders-drill
kubectl rollout status deploy/orders-api -n orders-drill --timeout=120s
kubectl get endpointslices -n orders-drill -l kubernetes.io/service-name=orders-api
curl -fsS https://orders-drill.test/health
`,
    `pod "orders-api-7f9c" deleted
deployment "orders-api" successfully rolled out
ENDPOINTS 10.42.3.20,10.42.5.22
{"status":"ok","ready":true}
删除一个 Pod 后端点保持可用，业务健康恢复时间 34 秒。`,
  ),
  '配置与发布故障': seExample(
    '错误 ConfigMap 与回滚',
    'bash',
    `kubectl create configmap orders-config \
  --from-literal=DATABASE_URL=postgres://wrong:5432/orders \
  -n orders-drill --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deploy/orders-api -n orders-drill
kubectl logs deploy/orders-api -n orders-drill --tail=20
kubectl rollout undo deploy/orders-api -n orders-drill
`,
    `configmap/orders-config configured
deployment.apps/orders-api restarted
ERROR missing database host: wrong
CrashLoopBackOff
deployment.apps/orders-api rolled back
应用按校验快速失败，回滚后旧 ConfigMap revision 恢复，错误没有静默连到错误库。`,
  ),
  '网络与依赖中断': seExample(
    '阻断支付依赖并验证降级',
    'yaml',
    `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-payment
  namespace: orders-drill
spec:
  podSelector:
    matchLabels: { app: payment-client }
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: kube-system }
      ports:
        - protocol: UDP
          port: 53
`,
    `$ kubectl apply -f block-payment.yaml
networkpolicy.networking.k8s.io/block-payment created
$ curl -sS https://orders-drill.test/checkout | jq
{"status":"degraded","payment":"unavailable","checkout":"queued","traceId":"tr-71"}
$ kubectl logs deploy/payment-client -n orders-drill --tail=5
dial tcp payment.test:443: i/o timeout
支付被隔离但核心下单降级为排队，避免无界重试和 500 扩散。`,
  ),
  '证据与复盘': seExample(
    '演练报告证据清单',
    'json',
    `{
  "drill": "orders-pod-drill-2026-11-24",
  "hypothesis": "single pod deletion keeps 99.9% success",
  "observed": { "success_rate": 0.9996, "recovery_seconds": 34, "alerts": 1 },
  "artifacts": ["events.json", "prometheus.csv", "trace.json", "kubectl.log"],
  "actions": [
    { "owner": "sre", "action": "lower readiness threshold", "due": "2026-12-01" }
  ]
}
`,
    `$ jq '.observed, .artifacts' drill-report.json
{ "success_rate": 0.9996, "recovery_seconds": 34, "alerts": 1 }
["events.json","prometheus.csv","trace.json","kubectl.log"]
演练结果、证据和行动项属于同一版本，未参与者可以据此复现。`,
  ),
});

Object.assign(e6Examples, {
  '从质量场景答辩': seExample(
    '答辩质量场景与证据链接',
    'yaml',
    `scenario: checkout_during_campaign
stimulus: 1800_rps
response: p95_under_300ms_success_above_99.9
evidence:
  load_test: results/k6-2026-11-24.json
  dashboard: dashboards/orders-checkout.json
  rollback: drills/rollback-2026-11-23.md
  code: src/orders/submit.ts
`,
    `$ yq '.evidence' defense/quality-scenario.yaml
load_test: results/k6-2026-11-24.json
dashboard: dashboards/orders-checkout.json
rollback: drills/rollback-2026-11-23.md
code: src/orders/submit.ts
答辩时可以从质量目标跳到测试、仪表盘、回滚记录和代码。`,
  ),
  '用 ADR 解释取舍': seExample(
    'ADR 目录与有效决定',
    'powershell',
    `adr list | Select-String "Status: Accepted"
Get-Content docs/adr/0042-outbox.md |
  Select-String "Context|Decision|Consequences|Verification"
git log -1 --format='%h %s' -- docs/adr/0042-outbox.md
`,
    `0041  Ledger consistency
0042  Transactional outbox for OrderSubmitted
Status: Accepted
Context: database commit and Kafka publish cannot be atomic
Decision: write Outbox in the same transaction, publish asynchronously
4f2ac14 docs: record outbox decision and rollback conditions
被选方案、放弃方案、代价和验证入口都能在答辩中追溯。`,
  ),
  '运行手册可独立执行': seExample(
    '交接演练启动与回滚命令',
    'bash',
    `kubectl -n orders get deploy,svc,ingress
kubectl -n orders rollout status deploy/orders-api --timeout=180s
curl -fsS https://orders.example.test/health
kubectl -n orders rollout undo deploy/orders-api
kubectl -n orders rollout status deploy/orders-api --timeout=180s
`,
    `$ kubectl rollout status deploy/orders-api -n orders --timeout=180s
deployment "orders-api" successfully rolled out
$ curl -fsS https://orders.example.test/health
{"status":"ok","version":"sha-4f2a"}
deployment.apps/orders-api rolled back
deployment "orders-api" successfully rolled out
一位未参与开发的工程师按手册完成启动检查、健康验证和回滚，用时 17 分钟。`,
  ),
  '证据链与版本一致': seExample(
    '从发布清单反查 commit 与证据',
    'json',
    `{
  "release": "2026.11.24-1",
  "git_commit": "4f2ac14d83b1",
  "image_digest": "sha256:4f2a9be172d34af3c28e8e8b7d1a",
  "sbom": "artifacts/sbom-4f2a.json",
  "test_report": "artifacts/junit-4f2a.xml",
  "rollout": "artifacts/rollout-2026-11-24.json",
  "dashboard": "orders-prod",
  "approved_by": ["li", "wang"]
}
`,
    `$ jq -r '.git_commit,.image_digest,.sbom' release-manifest.json
4f2ac14d83b1
sha256:4f2a9be172d34af3c28e8e8b7d1a
artifacts/sbom-4f2a.json
$ git show -s --oneline 4f2ac14
4f2ac14 feat: add v2 currency compatibility
发布、镜像、SBOM、测试和审批都绑定同一 commit。`,
  ),
  '剩余风险与下一步': seExample(
    '毕业项目残余风险账本',
    'yaml',
    `status: graduated
remaining_risks:
  - id: RR-01
    description: outbox relay has one replica
    mitigation: alert if oldest_event_age > 30s
    owner: sre
    due: 2026-12-06
  - id: RR-02
    description: mobile-2 still calls deprecated endpoint
    mitigation: dual version until usage zero
    owner: mobile-team
    due: 2026-12-20
next_review: 2026-12-23
`,
    `$ yq '.remaining_risks[] | [.id,.owner,.due]' graduation-risk.yaml
- RR-01
- sre
- 2026-12-06
- RR-02
- mobile-team
- 2026-12-20
课程结束不伪装系统零风险；每个残余风险都有负责人、缓冲和下一次复审日期。`,
  ),
});

export const HANDWRITTEN_SOFTWARE_ENGINEERING_E6_COURSES: readonly ProgrammingCourseSeed[] = withSoftwareExamples([
  {
    name: seName(e6Stage, '代码、部署、数据和生产状态盘点'),
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '能读代码仓库、容器清单和数据库 schema，拥有只读测试环境或脱敏副本的访问权限。',
    goal: '在接管陌生系统的最初阶段建立代码、部署、数据和生产状态的事实档案，区分已确认、待验证和未知，避免凭文档直接改造。',
    guidedPractice: '对一个演示遗留系统执行四项盘点：git log 与依赖锁、kubectl get all 与 Helm release、数据库表与迁移历史、日志与监控入口。为每个对象记录版本、所有者、环境、数据分类和最近变更时间。',
    independentPractice: '接管一个多服务项目，产出一页系统事实卡和一张未知项清单；现场从域名追踪到 Ingress、Service、Pod、数据库和消息主题，标出任何断链或手工维护路径。',
    commonErrors: [
      '只阅读 README 就认为理解系统，忽略实际部署中还有手工 ConfigMap、定时脚本和未纳入仓库的 CronJob。',
      '把生产日志、数据库或凭据复制到个人目录以方便分析，造成二次泄露且证据来源不可追踪。',
    ],
    sourceRefs: [C4_MODEL, K8S_WORKLOADS, 'Git documentation. https://git-scm.com/docs'],
    steps: [
      ['代码与依赖盘点', '从仓库地址、默认分支、最近提交、发布标签、子模块和锁文件建立版本基线，记录构建入口、测试命令与生成产物。用 git log --since=90.days --stat 看高频区域，用依赖清单识别过期框架和内部私有包。失败边界是把本地未提交分支当成生产版本；验证证据是线上镜像 digest 对应的 commit、构建日志和仓库标签能够互相解释。', '先确认哪份代码真的在运行'],
      ['部署拓扑盘点', '列出集群、命名空间、工作负载、Service、Ingress、存储、定时任务和外部依赖，读取 kubectl get all、describe、events 与 Helm release 历史。标记手工创建资源、无所有者标签和多个环境共用配置。失败边界是部署清单与实际集群不一致，事故时按仓库找不到真实对象；验证证据是资源标签、Argo/Helm revision 和变更时间，抽一个域名能走通完整路由。', '集群事实优先于仓库想象'],
      ['数据资产盘点', '记录数据库版本、schema、迁移工具、主从拓扑、备份位置、恢复演练结果、敏感数据分类和保留周期；检查消息主题、对象存储和缓存是否承担事实数据。失败边界是只把关系库当数据源，忽略队列中的未处理命令和对象存储中的业务附件；验证证据是数据流图、备份恢复抽样、迁移历史和一张表到业务用途的映射。', '数据库之外也有业务事实'],
      ['生产状态与组织', '确认监控、告警、值班、发布窗口、云账号、证书到期、配额和供应商联系人，找出只有某个人知道的入口。通过最近三次事故和五次发布了解真实运维方式。失败边界是接管后才发现个人账号拥有生产密钥；验证证据是权限清单、值班表、告警路由和一次联系链测试，所有高风险入口至少有备份负责人。', '系统还包括人和流程'],
      ['未知项与风险归档', '为盘点结论标记已确认、待验证和未知，附证据来源、采集时间和负责人；未知项转化为访谈、只读查询或隔离实验。失败边界是猜测补全空白并直接进入重构；验证证据是风险登记、待办实验和下一次复查时的状态变化，关键未知项在改动前被关闭或显式接受。', '不知道本身也是重要事实'],
    ],
  },
  {
    name: seName(e6Stage, '热点、风险和架构约束'),
    track,
    contentStatus: 'reviewed',
    minutes: 49,
    prerequisite: '完成系统盘点，能读取代码变更、事故记录、CPU/内存、数据库等待和调用链数据。',
    goal: '从证据识别变更热点、运行热点和架构约束，区分真正耦合与历史命名，为改造排序和约束解除设计实验。',
    guidedPractice: '把近半年提交频率、缺陷、事故、慢查询、最高调用量和值班工单画在同一张热力图；选一个高频变更且高故障的模块，画出其数据、部署和团队依赖，列出三条不能直接绕过的约束及验证方式。',
    independentPractice: '为一个遗留订单系统写风险排序报告：至少覆盖单点数据库、同步调用链、共享配置、无备份任务和知识集中；按业务影响、发生概率、检测能力和修复可逆性排序。',
    commonErrors: [
      '把改动最多的文件直接判定为最该重构，却不看它是否只是稳定适配层，真正拖慢变化的是跨团队审批与共享数据库。',
      '把“现在这样能跑”当成不可改变约束，没有验证它是框架限制、历史补丁、合规要求还是无人敢改的习惯。',
    ],
    sourceRefs: [SOFTWARE_ARCHITECTURE, DDIA, 'Google SRE Book: Monitoring Distributed Systems. https://sre.google/sre-book/monitoring-distributed-systems/'],
    steps: [
      ['变更热点与故障热点', '把 commit、缺陷、发布回滚、告警和值班工单按模块、时间和团队聚合，寻找高频交叉区域；同时看变更前置时间与失败率。失败边界是只按代码行数或 CPU 高低排优先级；验证证据是热点图、样本工单和一次开发者访谈，结论能解释哪些业务需求被拖慢。', '结合变更与故障找真正热点'],
      ['运行瓶颈与单点', '用慢查询、锁等待、连接池饱和度、队列滞后、GC 和跨区 RTT 识别运行瓶颈，检查每个关键依赖是否为单实例或共享资源。失败边界是看全局平均值而漏掉单分片或单租户饱和；验证证据是分片级曲线、慢查询样本、故障域图和一次单节点失效演练的影响。', '全局平均会掩盖局部单点'],
      ['架构约束分类', '约束可分为业务法规、外部系统协议、组织所有权、运行时限制和历史兼容。逐项记录来源、可验证事实、受影响范围和解除成本。失败边界是把未调查的限制写成原则，永久阻止合理方案；验证证据是对应的合同、规范、测试、云配额或负责人确认，而不是传闻。', '约束也要有证据和来源'],
      ['风险排序', '按业务影响、发生概率、可检测性、恢复时间和改动可逆性评分，单点数据库、无恢复备份和靠人工发布通常应排在纯代码风格之前。失败边界是只按技术新奇程度排序，忽略低频但不可恢复的数据风险；验证证据是排序矩阵、缓解动作和触发阈值，高风险项进入里程碑而不是愿望清单。', '不可恢复风险优先'],
      ['约束下的改造边界', '为每个约束设计验证实验：协议限制可用录制回放，法规限制需隐私负责人评审，组织限制可用接口代理先隔离。实验通过后更新架构约束，不通过则记录代价与替代方案。失败边界是未经授权直接绕过安全或合规限制；验证证据是实验报告、批准记录和更新后的 ADR，改造边界可被下一位工程师复现。', '先证明限制能否解除'],
    ],
  },
  {
    name: seName(e6Stage, '渐进式迁移、双写和回滚'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '理解遗留数据模型、事务、复制和发布流程，能在隔离环境执行回填与流量切换。',
    goal: '通过扩展、双写、回填、校验、切读和停旧写的渐进路径迁移系统，确保每阶段可观察、可暂停、可回滚且数据可对账。',
    guidedPractice: '把订单备注从旧表迁到新服务：先新增兼容字段和双写适配器，再批量回填并计算源目标哈希与条数，影子读比较响应，最后按租户比例切读；每一步记录错误率和延迟。',
    independentPractice: '为一个核心库存迁移设计完整计划：双写顺序、冲突规则、幂等键、回填限速、对账查询、切读切写、旧路径回滚和最终停写；在测试副本完成一次失败回滚。',
    commonErrors: [
      '一次性停机迁移并直接切到新系统，没有历史数据校验和回滚镜像，任何格式差异都会变成不可逆数据损失。',
      '双写按“旧库成功再写新库”且不处理第二步失败，回填和对账也未覆盖并发更新，最终两库长期不一致。',
    ],
    sourceRefs: [OUTBOX, 'Expand/Contract pattern. https://martinfowler.com/bliki/ParallelChange.html', DDIA],
    steps: [
      ['扩展兼容模型', '先让旧系统和新系统都能读写同一业务概念，例如旧表新增可空字段、新服务支持旧字段，所有变更向前兼容；数据库迁移只做可逆扩展。失败边界是先删除旧字段或修改枚举含义，使旧版本无法启动；验证证据是新旧应用同时对测试副本运行，读写历史样例均成功。', '先扩展再迁移最后收缩'],
      ['双写与失败处理', '双写适配器定义主写、次写、顺序、超时、重试和冲突规则；次写失败可进入 Outbox 或补偿队列，不能静默忽略。写操作使用业务键幂等。失败边界是两个系统都成功一半，接口却返回成功；验证证据是故障注入后对账队列、业务状态和重试结果最终收敛，失败写入有可查询记录。', '双写必须有失败账'],
      ['回填与限速', '回填按主键或时间分片，记录 checkpoint、批次大小、速率和失败行；对热点表避开业务峰值并允许暂停。每批计算条数、校验和、关键字段差异。失败边界是全表更新造成锁等待和复制延迟；验证证据是回填吞吐、数据库延迟、失败批次和可续跑 checkpoint。', '回填要能暂停和续跑'],
      ['影子读与切读', '在用户仍读旧路径时异步读取新路径，比较状态码、字段和延迟，只记录差异不返回；差异率低于阈值且样本覆盖关键租户后，再按流量比例切读。失败边界是影子请求产生副作用或拖垮主库；验证证据是影子差异报表、延迟隔离和切读后回退到旧读路径的时间。', '先比较再让用户读新路径'],
      ['切写、停旧与回滚', '切写前确认回填完成、双写稳定、对账为零；切换后保留旧写只读窗口，旧版本仍可回滚。只有当调用量归零、数据保留期结束和恢复演练通过后才停旧写。失败边界是切写成功立即删旧系统，几小时后才发现报表依赖旧表；验证证据是调用计数、对账趋势、回滚演练和资源下线审批。', '停旧路径是最后一步'],
    ],
  },
  {
    name: seName(e6Stage, 'K8s 故障、配置错误和依赖中断演练'),
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: '理解 Kubernetes 工作负载、探针、网络策略和配置管理，拥有隔离演练集群和明确授权范围。',
    goal: '在受控环境中演练节点、Pod、配置、网络和依赖故障，验证检测、隔离、降级、恢复和证据留存，而不是只做成功路径演示。',
    guidedPractice: '在专用测试命名空间依次注入 Pod 删除、错误 ConfigMap、服务端口错配、NetworkPolicy 阻断和依赖超时；每次记录检测时间、告警、用户影响、处置命令、恢复时间和残留数据，演练前设置自动停止。',
    independentPractice: '设计一场 45 分钟故障演练，覆盖节点驱逐、HPA 失败和数据库依赖中断；写出假设、爆炸半径、保护开关、观察指标、停止条件、角色分工和复盘输出。',
    commonErrors: [
      '在共享或生产集群直接删除 Pod、封锁网络做“演练”，没有爆炸半径和审批，验证故障变成制造事故。',
      '只观察 Pod 是否重新 Running，不检查业务成功率、队列积压、配置版本和恢复后的数据一致性。',
    ],
    sourceRefs: ['Kubernetes troubleshooting. https://kubernetes.io/docs/tasks/debug/', 'Chaos Engineering Principles. https://principlesofchaos.org/', SRE_WORKBOOK],
    steps: [
      ['演练假设与爆炸半径', '先写假设：单节点失效时核心下单成功率保持 99%，恢复时间小于五分钟；限定命名空间、租户、流量和时间窗，准备停止开关与负责人。失败边界是目标、范围和回滚都不明确；验证证据是演练审批、影响对象清单、自动停止配置和基线快照。', '先限定可能造成的影响'],
      ['Pod 与节点故障', '演练删除单个 Pod、驱逐节点和镜像拉取失败，观察 ReplicaSet 重建、PDB、调度资源与端点变化；同时检查业务可用而不只是对象恢复。失败边界是一次驱逐过多副本，PDB 被错误配置绕过；验证证据是 Pod 事件、副本时间线、端点数量和请求成功率曲线。', '对象恢复不等于业务恢复'],
      ['配置与发布故障', '发布错误镜像 digest、缺失 ConfigMap 键或错误 Service 端口，验证应用快速失败、告警触发、Argo/Helm 回滚和旧版本恢复。失败边界是错误配置被默认值吞掉，应用运行但连到测试库；验证证据是渲染 diff、启动日志、配置版本和回滚后实际读取值。', '坏配置应尽早暴露'],
      ['网络与依赖中断', '使用 NetworkPolicy 或测试代理阻断数据库、DNS 和外部支付，观察超时、熔断、重试预算、降级与恢复；禁止在生产用真实第三方发起攻击式演练。失败边界是断网后重试风暴拖垮其他租户；验证证据是下游调用数、错误分布、核心与非核心成功率以及恢复后的积压。', '依赖故障要验证隔离边界'],
      ['证据与复盘', '保存命令、对象 YAML、日志、指标、Trace 和业务时间线，复盘实际影响与假设差异；行动项进入运行手册、告警和测试。失败边界是演练结束后清理现场却没保留证据；验证证据是报告可让未参与者复现故障与恢复，下一次演练验证修复确实生效。', '演练的价值在证据和改动'],
    ],
  },
  {
    name: seName(e6Stage, '架构 ADR、运行手册和毕业答辩'),
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: '完成 Brownfield 盘点、迁移和故障演练，拥有可运行系统、测试、部署、监控与复盘材料。',
    goal: '把架构决策、运行边界、验证证据和剩余风险组织成可审查的 ADR、运行手册与答辩，证明能接管并渐进改善真实系统。',
    guidedPractice: '为毕业项目写三份 ADR：模块边界、发布与回滚、数据迁移；运行手册覆盖启动、健康检查、告警、容量、故障、回滚和联系人。现场演示一次跨租户拒绝、一次故障回滚和一次旧路径清理。',
    independentPractice: '完成毕业答辩包：C4 图、质量场景、风险账本、关键 ADR、迁移记录、CI/部署证据、SLO、两次演练报告和下一季度路线；接受至少五个关于失败边界与成本的追问。',
    commonErrors: [
      '答辩只展示新功能和技术栈，没有说明旧系统行为如何被验证、数据如何迁移、失败如何被检测和恢复。',
      '运行手册与实际配置漂移，ADR 没有验证链接或退出条件，现场只能照着演示脚本解释，无法回答异常路径。',
    ],
    sourceRefs: [ADR, C4_MODEL, SRE_BOOK],
    steps: [
      ['从质量场景答辩', '开场先讲业务目标、系统边界和最重要的质量场景，再说明架构如何满足或未满足这些场景；每个质量目标附测试、容量或演练证据。失败边界是只讲组件名称，不解释用户结果与失败边界；验证证据是答辩者能从场景跳到代码、配置、指标和演练时间线。', '先证明目标再展示结构'],
      ['用 ADR 解释取舍', 'ADR 覆盖背景、选项、决定、后果、验证和复审条件，特别说明为何没有选择更简单的模块化单体、为什么接受双写窗口或为何暂不拆服务。失败边界是 ADR 只美化最终方案；验证证据是备选方案的真实成本、被否决原因和当前决定的有效期。', '答辩的核心是取舍'],
      ['运行手册可独立执行', '手册写清启动参数、健康检查、依赖、配置来源、备份、SLO、告警、故障隔离、凭据轮换、回滚和升级路径，每条命令有工作目录、权限和预期输出。失败边界是手册只写架构图，真正值班仍依赖原作者；验证证据是另一位学习者按手册完成启动、故障定位和回滚并记录卡点。', '别人能照做才算运行手册'],
      ['证据链与版本一致', '所有图、ADR、测试报告、仪表盘、镜像 digest 和演练记录绑定同一项目版本；回答问题时现场从 commit 或 digest 反查。失败边界是报告来自旧版本，配置已经变化；验证证据是版本索引和随机抽查，代码、部署与文档引用一致。', '答辩证据必须属于同一版本'],
      ['剩余风险与下一步', '结尾列出已消除风险、仍在缓解的风险、未验证假设、容量余量和下一季度路线，明确负责人、期限与停止条件。失败边界是把毕业演示当成系统已成熟，不提残余风险；验证证据是风险账本、行动项和下一次复审日期，答辩结论能被后续团队接手。', '交班以风险清单收尾'],
    ],
  },
], e6Examples);
