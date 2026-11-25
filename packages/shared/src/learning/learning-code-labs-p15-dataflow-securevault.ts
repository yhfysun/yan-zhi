import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

/**
 * P15 综合训练中 DataFlow 与 SecureVault 的 Node.js 代码实验室。
 *
 * 课程键与 project-training-batch-09.ts、project-training-batch-10.ts 中的
 * 手写课程名逐字一致。任务仅依赖 Node.js 标准库；数据库、对象存储、KMS 和
 * 调度系统都用确定性内存状态、加密夹具或临时目录模拟，不声称启动外部服务。
 */

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装 npm 依赖或启动数据库、对象存储与 KMS。',
    '先运行跟做任务，再根据 stdin 中的故障夹具完成独立实践。',
    '检查 JSON 摘要、末尾 checkpoint 信号和退出码；安全与恢复结论必须由脚本证据支撑。',
  ],
  languages: ['javascript'],
} as const;

type NodeTaskSeed = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly code: string;
  readonly stdin: string;
  readonly checkpoint: string;
};

function nodeTask(seed: NodeTaskSeed): LearningV2CodeLabTask {
  return {
    id: seed.id,
    title: seed.title,
    brief: seed.brief,
    defaultLanguage: 'javascript',
    starterCode: { javascript: seed.code },
    stdin: seed.stdin,
    checkpoint: seed.checkpoint,
  };
}

function codeLab(
  title: string,
  description: string,
  practice: NodeTaskSeed,
  apply: NodeTaskSeed,
): LearningV2CodeLab {
  return {
    title,
    description,
    ...nodeRuntime,
    practice: nodeTask(practice),
    apply: nodeTask(apply),
  };
}

export const LEARNING_CODE_LABS_P15_DATAFLOW_SECUREVAULT: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:综合训练 · DataFlow 数据平台 · 业务理解与用户任务': codeLab(
    'DataFlow 综合训练 01 · 从业务事件到可信指标',
    '把四类数据角色和业务事件整理成可验收的任务卡，再检查指标定义是否真的包含事件时间、迟到策略、负责人和版本。',
    {
      id: 'p15-dataflow-01-guided-trust-chain',
      title: '跟做：检查业务任务与可信指标链',
      brief:
        '运行 node main.js。读取分析师、数据工程师、指标负责人和 SRE 的任务，检查事件、指标、负责人和证据，输出缺口与可信链状态。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const required = ['event', 'metric', 'owner', 'evidence'];
const cards = input.tasks.map((task) => {
  const missing = required.filter((key) => {
    const value = task[key];
    return Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
  });
  return {
    actor: task.actor,
    metric: task.metric,
    evidenceCount: Array.isArray(task.evidence) ? task.evidence.length : 0,
    missing,
    status: missing.length === 0 ? 'trusted' : 'needs-evidence'
  };
}).sort((left, right) => left.actor.localeCompare(right.actor));

assert.equal(cards.length, 4);
assert.equal(cards.filter((card) => card.status === 'trusted').length, 3);
assert.deepEqual(cards.find((card) => card.status !== 'trusted').missing, ['evidence']);
assert.ok(cards.every((card) => card.metric && card.actor));

console.log(JSON.stringify({
  cards,
  trusted: cards.filter((card) => card.status === 'trusted').length,
  evidenceGaps: cards.filter((card) => card.missing.length > 0).length
}, null, 2));
console.log('dataflow-trust-chain: trusted=3 gaps=1');
`,
      stdin: JSON.stringify({
        tasks: [
          {
            actor: '分析师',
            event: '订单已支付',
            metric: '支付成功率',
            owner: '交易指标组',
            evidence: ['口径文档#42', '样例批次'],
          },
          {
            actor: '数据工程师',
            event: '订单创建',
            metric: '订单明细新鲜度',
            owner: '数据接入组',
            evidence: ['采集日志', '批次校验摘要'],
          },
          {
            actor: 'SRE',
            event: '流任务 checkpoint',
            metric: '数据延迟',
            owner: '平台稳定性组',
            evidence: ['延迟分位', '恢复演练记录'],
          },
          {
            actor: '指标负责人',
            event: '退款完成',
            metric: '退款金额',
            owner: '财务数据组',
            evidence: [],
          },
        ],
      }),
      checkpoint:
        '输出必须有 3 张 trusted 任务卡，唯一缺口来自“指标负责人”且缺失项恰为 evidence；最后一行是 dataflow-trust-chain: trusted=3 gaps=1，退出码为 0。角色画像不算任务证据。',
    },
    {
      id: 'p15-dataflow-01-independent-metric-contract',
      title: '独立实践：拦截不可复算的指标定义',
      brief:
        '运行 node main.js。逐项验证指标公式、事件时间、迟到策略、负责人和版本，列出阻断原因并只放行可复算定义。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = ['formula', 'eventTime', 'latePolicy', 'owner', 'version'];

const reviewed = input.definitions.map((definition) => {
  const missing = required.filter((key) => !String(definition[key] || '').trim());
  const versionConflict = definition.version !== definition.approvedVersion;
  const issues = [...missing];
  if (versionConflict) issues.push('version-not-approved');
  return {
    name: definition.name,
    formula: definition.formula,
    issues,
    decision: issues.length === 0 ? 'publish' : 'block'
  };
}).sort((left, right) => left.name.localeCompare(right.name));

assert.equal(reviewed.length, 4);
assert.equal(reviewed.filter((item) => item.decision === 'publish').length, 2);
assert.equal(reviewed.filter((item) => item.issues.includes('latePolicy')).length, 1);
assert.equal(reviewed.filter((item) => item.issues.includes('version-not-approved')).length, 1);
assert.ok(reviewed.every((item) => item.formula));

console.log(JSON.stringify({
  reviewed,
  published: reviewed.filter((item) => item.decision === 'publish').map((item) => item.name),
  blocked: reviewed.filter((item) => item.decision === 'block').map((item) => ({
    name: item.name,
    issues: item.issues
  }))
}, null, 2));
console.log('metric-contract: publish=2 block=2');
`,
      stdin: JSON.stringify({
        definitions: [
          {
            name: '支付成功率',
            formula: 'paidOrders / createdOrders',
            eventTime: 'paidAt',
            latePolicy: 'allow 5m, quarantine after',
            owner: '交易指标组',
            version: 'v3',
            approvedVersion: 'v3',
          },
          {
            name: '退款金额',
            formula: 'sum(refund.amount)',
            eventTime: 'refundedAt',
            latePolicy: '',
            owner: '财务数据组',
            version: 'v2',
            approvedVersion: 'v2',
          },
          {
            name: '订单新鲜度',
            formula: 'processedAt - eventTime',
            eventTime: 'createdAt',
            latePolicy: 'allow 10m',
            owner: '数据接入组',
            version: 'v1',
            approvedVersion: 'v1',
          },
          {
            name: '优惠核销率',
            formula: 'usedCoupons / issuedCoupons',
            eventTime: 'usedAt',
            latePolicy: 'allow 30m',
            owner: '营销指标组',
            version: 'v4-hotfix',
            approvedVersion: 'v4',
          },
        ],
      }),
      checkpoint:
        '必须只发布“支付成功率”和“订单新鲜度”；“退款金额”因缺少迟到策略阻断，“优惠核销率”因版本未批准阻断。最后一行是 metric-contract: publish=2 block=2。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 范围、验收与非功能目标': codeLab(
    'DataFlow 综合训练 02 · 新鲜度、质量与容量门禁',
    '把业务验收约束变成可计算门禁，并根据各阶段吞吐能力找出真实瓶颈与积压速度。',
    {
      id: 'p15-dataflow-02-guided-nonfunctional-gates',
      title: '跟做：执行数据非功能门禁',
      brief:
        '运行 node main.js。连续验证新鲜度、重复率、空值率、扫描量和 checkpoint 延迟，输出唯一失败门禁。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const checks = [
  {
    name: 'freshness-p95',
    actual: input.observed.freshnessP95Seconds,
    limit: input.budget.freshnessP95Seconds,
    operator: 'lte'
  },
  {
    name: 'duplicate-rate',
    actual: input.observed.duplicateRate,
    limit: input.budget.duplicateRate,
    operator: 'lte'
  },
  {
    name: 'null-rate',
    actual: input.observed.nullRate,
    limit: input.budget.nullRate,
    operator: 'lte'
  },
  {
    name: 'scan-gb',
    actual: input.observed.scanGb,
    limit: input.budget.scanGb,
    operator: 'lte'
  },
  {
    name: 'checkpoint-age',
    actual: input.observed.checkpointAgeSeconds,
    limit: input.budget.checkpointAgeSeconds,
    operator: 'lte'
  }
].map((check) => ({
  ...check,
  pass: check.actual <= check.limit
}));

assert.equal(checks.filter((check) => check.pass).length, 4);
assert.deepEqual(checks.filter((check) => !check.pass).map((check) => check.name), [
  'duplicate-rate'
]);
assert.ok(input.observed.duplicateRate > input.budget.duplicateRate);

console.log(JSON.stringify({
  checks,
  passCount: checks.filter((check) => check.pass).length,
  failed: checks.filter((check) => !check.pass).map((check) => check.name)
}, null, 2));
console.log('dataflow-nfr: pass=4 fail=1 blocking=duplicate-rate');
`,
      stdin: JSON.stringify({
        budget: {
          freshnessP95Seconds: 120,
          duplicateRate: 0.01,
          nullRate: 0.005,
          scanGb: 500,
          checkpointAgeSeconds: 60,
        },
        observed: {
          freshnessP95Seconds: 95,
          duplicateRate: 0.018,
          nullRate: 0.002,
          scanGb: 340,
          checkpointAgeSeconds: 40,
        },
      }),
      checkpoint:
        '五个门禁必须恰好 4 个通过，唯一阻断项是 duplicate-rate（0.018 超过 0.01）；最后一行是 dataflow-nfr: pass=4 fail=1 blocking=duplicate-rate。',
    },
    {
      id: 'p15-dataflow-02-independent-capacity-curve',
      title: '独立实践：定位吞吐瓶颈与积压趋势',
      brief:
        '运行 node main.js。按每个处理阶段的容量计算系统瓶颈、每秒积压和十分钟积压量，判断扩容哪个阶段收益最大。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const ranked = [...input.stages].sort((left, right) => left.capacityPerSecond - right.capacityPerSecond);
const bottleneck = ranked[0];
const backlogPerSecond = Math.max(0, input.sourceRatePerSecond - bottleneck.capacityPerSecond);
const projectedBacklog = backlogPerSecond * input.observationSeconds;
const canDrain = bottleneck.capacityPerSecond >= input.sourceRatePerSecond;

assert.equal(input.stages.length, 4);
assert.equal(bottleneck.name, '窗口聚合');
assert.equal(backlogPerSecond, 40);
assert.equal(projectedBacklog, 24000);
assert.equal(canDrain, false);
assert.ok(projectedBacklog <= input.deadLetterCapacity);

console.log(JSON.stringify({
  bottleneck: bottleneck.name,
  sourceRate: input.sourceRatePerSecond,
  bottleneckCapacity: bottleneck.capacityPerSecond,
  backlogPerSecond,
  projectedBacklog,
  canDrain,
  scaleFirst: bottleneck.name
}, null, 2));
console.log('dataflow-capacity: bottleneck=window backlog/s=40 projected=24000');
`,
      stdin: JSON.stringify({
        sourceRatePerSecond: 180,
        observationSeconds: 600,
        deadLetterCapacity: 30000,
        stages: [
          { name: '接入校验', capacityPerSecond: 220 },
          { name: '窗口聚合', capacityPerSecond: 140 },
          { name: '质量规则', capacityPerSecond: 250 },
          { name: '指标写入', capacityPerSecond: 180 },
        ],
      }),
      checkpoint:
        '瓶颈必须是“窗口聚合”，即每秒 140 条；源速率 180 条/秒时每秒积压 40 条，十分钟积压 24000 条且无法自行清空。最后一行包含 bottleneck=window backlog/s=40 projected=24000。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · API 契约与前端数据边界': codeLab(
    'DataFlow 综合训练 03 · 统一事件信封与 schema 演进',
    '先校验批流共用事件契约，再判断字段删除、类型变化和枚举收窄是否真正破坏旧消费者。',
    {
      id: 'p15-dataflow-03-guided-envelope-validation',
      title: '跟做：校验批流统一事件信封',
      brief:
        '运行 node main.js。对六条混合批流事件执行必填字段、重复 ID、未来事件时间和 schema 版本检查，输出有效事件与拒绝原因。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);
const required = ['source', 'eventId', 'eventTime', 'partitionKey', 'schemaVersion', 'payload'];
const seen = new Set();

const results = input.events.map((event) => {
  const issues = [];
  for (const key of required) {
    if (event[key] === undefined || event[key] === null || event[key] === '') {
      issues.push('missing-' + key);
    }
  }
  if (seen.has(event.eventId)) issues.push('duplicate-event-id');
  seen.add(event.eventId);
  if (Number.isFinite(Date.parse(event.eventTime)) && Date.parse(event.eventTime) > now + 60000) {
    issues.push('event-time-too-future');
  }
  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) {
    issues.push('invalid-schema-version');
  }
  return {
    eventId: event.eventId || 'missing',
    mode: event.mode,
    issues: [...new Set(issues)],
    accepted: issues.length === 0
  };
});

assert.equal(results.filter((event) => event.accepted).length, 2);
assert.equal(results.filter((event) => event.issues.includes('duplicate-event-id')).length, 1);
assert.equal(results.filter((event) => event.issues.includes('missing-source')).length, 1);
assert.equal(results.filter((event) => event.issues.includes('event-time-too-future')).length, 1);
assert.equal(results.filter((event) => event.issues.includes('invalid-schema-version')).length, 1);

console.log(JSON.stringify({
  accepted: results.filter((event) => event.accepted).map((event) => event.eventId),
  rejected: results.filter((event) => !event.accepted),
  duplicateEventIds: results.filter((event) => event.issues.includes('duplicate-event-id')).length
}, null, 2));
console.log('batch-stream-envelope: accepted=2 rejected=4');
`,
      stdin: JSON.stringify({
        now: '2026-11-24T10:00:00.000Z',
        events: [
          {
            source: 'orders',
            eventId: 'evt-1',
            eventTime: '2026-11-24T09:58:00.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 3,
            payload: { amount: 99 },
            mode: 'stream',
          },
          {
            source: 'payments',
            eventId: 'evt-2',
            eventTime: '2026-11-24T09:59:00.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 2,
            payload: { paid: true },
            mode: 'batch',
          },
          {
            eventId: 'evt-3',
            eventTime: '2026-11-24T09:59:30.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 1,
            payload: {},
            mode: 'stream',
          },
          {
            source: 'orders',
            eventId: 'evt-1',
            eventTime: '2026-11-24T09:58:30.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 3,
            payload: { amount: 99 },
            mode: 'stream',
          },
          {
            source: 'refunds',
            eventId: 'evt-4',
            eventTime: '2026-11-24T10:05:00.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 1,
            payload: {},
            mode: 'stream',
          },
          {
            source: 'inventory',
            eventId: 'evt-5',
            eventTime: '2026-11-24T09:55:00.000Z',
            partitionKey: 'cn-east',
            schemaVersion: 0,
            payload: {},
            mode: 'batch',
          },
        ],
      }),
      checkpoint:
        '只有 evt-1 和 evt-2 可接收；六条事件分别暴露重复 ID、缺 source、未来时间、非法版本等单一问题，拒绝总数为 4。最后一行是 batch-stream-envelope: accepted=2 rejected=4。',
    },
    {
      id: 'p15-dataflow-03-independent-schema-compatibility',
      title: '独立实践：判断 schema v4 到 v5 的兼容性',
      brief:
        '运行 node main.js。比较字段删除、类型变化、必填转换和枚举收窄，并用消费者声明判断哪些变更破坏契约。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const before = new Map(input.before.map((field) => [field.name, field]));
const after = new Map(input.after.map((field) => [field.name, field]));

const consumers = new Map(input.consumers.map((consumer) => [consumer.name, new Set(consumer.fields)]));
const changes = [];

for (const [name, oldField] of before) {
  const newField = after.get(name);
  if (!newField) {
    const usedBy = [...consumers].filter(([, fields]) => fields.has(name)).map(([consumer]) => consumer);
    changes.push({ field: name, change: 'removed', breaking: usedBy.length > 0, usedBy });
    continue;
  }
  if (oldField.type !== newField.type) {
    changes.push({
      field: name,
      change: 'type-changed',
      from: oldField.type,
      to: newField.type,
      breaking: true
    });
  }
  if (oldField.required === false && newField.required === true) {
    changes.push({ field: name, change: 'became-required', breaking: true });
  }
  if (Array.isArray(oldField.enum) && Array.isArray(newField.enum)) {
    const removedValues = oldField.enum.filter((value) => !newField.enum.includes(value));
    if (removedValues.length > 0) {
      changes.push({ field: name, change: 'enum-narrowed', removedValues, breaking: true });
    }
  }
}

const addedRequired = [...after.values()].filter((field) => !before.has(field.name) && field.required);
for (const field of addedRequired) {
  changes.push({ field: field.name, change: 'added-required', breaking: true });
}

assert.equal(changes.length, 5);
assert.equal(changes.filter((change) => change.breaking).length, 5);
assert.deepEqual(changes.find((change) => change.field === 'currencyCode').usedBy.sort(), [
  'billing-report',
  'refund-worker'
]);
assert.ok(changes.some((change) => change.field === 'traceId' && change.change === 'added-required'));

console.log(JSON.stringify({
  version: input.beforeVersion + '->' + input.afterVersion,
  changes,
  decision: changes.some((change) => change.breaking) ? 'reject-or-migrate' : 'compatible'
}, null, 2));
console.log('schema-compatibility: changes=5 breaking=5 decision=reject-or-migrate');
`,
      stdin: JSON.stringify({
        beforeVersion: 'v4',
        afterVersion: 'v5',
        before: [
          { name: 'eventId', type: 'string', required: true },
          {
            name: 'status',
            type: 'string',
            required: true,
            enum: ['created', 'paid', 'refunded'],
          },
          { name: 'currencyCode', type: 'string', required: true },
          { name: 'amountMinor', type: 'integer', required: true },
          { name: 'note', type: 'string', required: false },
        ],
        after: [
          { name: 'eventId', type: 'string', required: true },
          { name: 'status', type: 'string', required: true, enum: ['created', 'paid'] },
          { name: 'amountMinor', type: 'string', required: true },
          { name: 'note', type: 'string', required: true },
          { name: 'traceId', type: 'string', required: true },
        ],
        consumers: [
          { name: 'billing-report', fields: ['currencyCode', 'amountMinor', 'status'] },
          { name: 'refund-worker', fields: ['currencyCode', 'eventId'] },
          { name: 'audit-sink', fields: ['eventId', 'traceId'] },
        ],
      }),
      checkpoint:
        '必须识别 5 类破坏：status 枚举收窄、currencyCode 被删除、amountMinor 整数变字符串、note 变必填、traceId 新增必填；currencyCode 删除影响 billing-report 与 refund-worker。最终决策必须是 reject-or-migrate。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 数据模型、约束与迁移': codeLab(
    'DataFlow 综合训练 04 · 分区、水位线与版本迁移',
    '通过真实事件时间生成分区，识别越过水位线的迟到数据，再规划保留旧消费者的 schema 迁移。',
    {
      id: 'p15-dataflow-04-guided-partition-watermark',
      title: '跟做：生成分区并标记迟到事件',
      brief:
        '运行 node main.js。按事件日期和区域生成分区，根据固定水位线标记迟到事件，并检查单分区写入上限。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const watermark = Date.parse(input.watermark);

const rows = input.events.map((event) => {
  const eventTime = Date.parse(event.eventTime);
  const key = event.eventTime.slice(0, 10) + '/' + event.region;
  return {
    id: event.id,
    key,
    bytes: event.bytes,
    eventTime: event.eventTime,
    late: eventTime < watermark
  };
});

const partitions = [...new Set(rows.map((row) => row.key))].sort().map((key) => {
  const items = rows.filter((row) => row.key === key);
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
  return {
    key,
    rows: items.length,
    bytes,
    overLimit: bytes > input.maxPartitionBytes,
    lateRows: items.filter((item) => item.late).map((item) => item.id)
  };
});

assert.equal(rows.length, 7);
assert.equal(partitions.length, 4);
assert.equal(rows.filter((row) => row.late).length, 1);
assert.equal(partitions.filter((partition) => partition.overLimit).length, 1);
assert.deepEqual(partitions.find((partition) => partition.overLimit).key, '2026-11-23/cn-east');

console.log(JSON.stringify({
  watermark: input.watermark,
  rows,
  partitions,
  lateRows: rows.filter((row) => row.late).map((row) => row.id)
}, null, 2));
console.log('dataflow-partition: rows=7 partitions=4 late=1 over-limit=1');
`,
      stdin: JSON.stringify({
        watermark: '2026-11-23T09:58:30.000Z',
        maxPartitionBytes: 900,
        events: [
          { id: 'e1', eventTime: '2026-11-23T09:58:00.000Z', region: 'cn-east', bytes: 220 },
          { id: 'e2', eventTime: '2026-11-23T10:03:00.000Z', region: 'cn-east', bytes: 260 },
          { id: 'e3', eventTime: '2026-11-23T10:04:00.000Z', region: 'cn-east', bytes: 470 },
          { id: 'e4', eventTime: '2026-11-23T09:59:00.000Z', region: 'cn-north', bytes: 330 },
          { id: 'e5', eventTime: '2026-11-23T10:02:00.000Z', region: 'cn-north', bytes: 280 },
          { id: 'e6', eventTime: '2026-11-24T00:01:00.000Z', region: 'cn-south', bytes: 190 },
          { id: 'e7', eventTime: '2026-11-23T10:01:00.000Z', region: 'cn-south', bytes: 240 },
        ],
      }),
      checkpoint:
        '必须生成 4 个日期/区域分区，e1 因早于水位线被标记为迟到，2026-11-23/cn-east 的 950 字节超过单分区上限 900。最后一行是 dataflow-partition: rows=7 partitions=4 late=1 over-limit=1。',
    },
    {
      id: 'p15-dataflow-04-independent-schema-migration',
      title: '独立实践：把 v2 迁移到 v3 且保持双读',
      brief:
        '运行 node main.js。读取字段迁移、消费者兼容矩阵和指标版本，生成双写、回填、切读、收紧四阶段计划，并验证回滚窗口。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const consumersReady = input.consumers.filter((consumer) =>
  consumer.supports.includes(input.fromVersion) &&
  consumer.supports.includes(input.toVersion)
);
const incompatible = input.consumers.filter((consumer) => !consumersReady.includes(consumer));
const metricVersions = new Set(input.metricSnapshots.map((snapshot) => snapshot.metricVersion));
const snapshotIds = new Set(input.metricSnapshots.map((snapshot) => snapshot.snapshotId));
const plan = [
  { phase: 'expand', action: 'add nullable columns and dual-write', rollback: 'ignore new columns' },
  { phase: 'backfill', action: 'backfill by source offset', rollback: 'keep old columns authoritative' },
  { phase: 'switch-read', action: 'move consumers after parity check', rollback: 'read v2 columns' },
  { phase: 'contract', action: 'enforce only after rollback window', rollback: 'restore previous task image' },
];

assert.equal(incompatible.length, 0);
assert.equal(metricVersions.size, 1);
assert.equal(snapshotIds.size, 3);
assert.equal(plan.length, 4);
assert.ok(input.backfillOffsets.every((offset) => offset.complete));

console.log(JSON.stringify({
  sourceVersion: input.fromVersion,
  targetVersion: input.toVersion,
  plan,
  compatibleConsumers: consumersReady.map((consumer) => consumer.name),
  metricVersion: [...metricVersions][0],
  rollbackWindowMinutes: input.rollbackWindowMinutes,
  decision: 'dual-read-safe'
}, null, 2));
console.log('dataflow-migration: consumers=3 plan=4 metric-version=7 rollback=120m');
`,
      stdin: JSON.stringify({
        fromVersion: 'v2',
        toVersion: 'v3',
        rollbackWindowMinutes: 120,
        consumers: [
          { name: 'metric-api', supports: ['v2', 'v3'] },
          { name: 'quality-worker', supports: ['v2', 'v3'] },
          { name: 'lineage-indexer', supports: ['v2', 'v3'] },
        ],
        metricSnapshots: [
          { metricVersion: 7, snapshotId: 'snap-a' },
          { metricVersion: 7, snapshotId: 'snap-b' },
          { metricVersion: 7, snapshotId: 'snap-c' },
        ],
        backfillOffsets: [
          { partition: 'cn-east', complete: true },
          { partition: 'cn-north', complete: true },
          { partition: 'cn-south', complete: true },
        ],
      }),
      checkpoint:
        '三个消费者必须同时支持 v2/v3，迁移计划必须依次经过 expand、backfill、switch-read、contract；指标固定为版本 7，保留 3 个快照与 120 分钟回滚窗口。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 项目骨架、模块边界与本地环境': codeLab(
    'DataFlow 综合训练 05 · 临时目录复现数据平台',
    '用临时目录模拟对象存储与 spool，验证模块所有权、清单完整性、离线重启和坏 checkpoint 的拒绝路径。',
    {
      id: 'p15-dataflow-05-guided-local-boundaries',
      title: '跟做：创建本地数据平台骨架',
      brief:
        '运行 node main.js。把接入、质量、指标和血缘模块写入临时目录清单，检查模块边界与所有者，最后删除夹具。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataflow-skeleton-'));

try {
  const manifestPath = path.join(root, 'manifest.json');
  const modules = input.modules.map((module) => {
    const file = path.join(root, module.name + '.json');
    fs.writeFileSync(file, JSON.stringify({ owner: module.owner, contract: module.contract }));
    return { ...module, file: path.basename(file), exists: fs.existsSync(file) };
  });
  fs.writeFileSync(manifestPath, JSON.stringify({ modules, dataset: input.dataset }, null, 2));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const owners = new Set(modules.map((module) => module.owner));
  const duplicateContracts = modules.filter((module, index) =>
    modules.some((other, otherIndex) =>
      otherIndex !== index && other.contract === module.contract
    )
  );

  assert.equal(manifest.modules.length, 4);
  assert.equal(owners.size, 4);
  assert.equal(duplicateContracts.length, 0);
  assert.ok(manifest.modules.every((module) => module.exists));
  assert.equal(manifest.dataset, 'fixture-orders-v1');

  console.log(JSON.stringify({
    root: '<temporary>',
    dataset: manifest.dataset,
    modules: manifest.modules,
    ownerCount: owners.size,
    duplicateContracts: duplicateContracts.length
  }, null, 2));
  console.log('dataflow-skeleton: modules=4 owners=4 dataset=fixture-orders-v1');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        dataset: 'fixture-orders-v1',
        modules: [
          { name: 'ingest', owner: '数据接入组', contract: 'event-envelope-v3' },
          { name: 'quality', owner: '数据质量组', contract: 'rule-result-v2' },
          { name: 'metrics', owner: '指标服务组', contract: 'metric-query-v4' },
          { name: 'lineage', owner: '元数据组', contract: 'lineage-edge-v1' },
        ],
      }),
      checkpoint:
        '临时目录中必须写入 4 个模块文件与 manifest；模块所有者、契约均不重复，数据集固定为 fixture-orders-v1，脚本结束前临时目录被删除。',
    },
    {
      id: 'p15-dataflow-05-independent-checkpoint-restart',
      title: '独立实践：从坏 checkpoint 找到最后安全位移',
      brief:
        '运行 node main.js。在临时 spool 中写入成功、半写和 schema 不兼容的 checkpoint，模拟新进程选择最后一个可信位移。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataflow-restart-'));

try {
  const spool = path.join(root, 'checkpoints');
  fs.mkdirSync(spool);
  for (const checkpoint of input.checkpoints) {
    const target = path.join(spool, checkpoint.sequence + '.json');
    const content = checkpoint.complete
      ? JSON.stringify(checkpoint)
      : checkpoint.raw;
    fs.writeFileSync(target, content);
  }

  const inspected = fs.readdirSync(spool).sort().map((name) => {
    const raw = fs.readFileSync(path.join(spool, name), 'utf8');
    try {
      const value = JSON.parse(raw);
      const validSchema = value.schemaVersion === input.acceptedSchemaVersion;
      return {
        name,
        offset: value.offset,
        schemaVersion: value.schemaVersion,
        valid: value.complete === true && validSchema
      };
    } catch {
      return { name, offset: null, schemaVersion: null, valid: false };
    }
  });
  const valid = inspected.filter((checkpoint) => checkpoint.valid);
  const resume = valid.sort((left, right) => right.offset - left.offset)[0];

  assert.equal(inspected.length, 4);
  assert.equal(inspected.filter((checkpoint) => !checkpoint.valid).length, 2);
  assert.equal(resume.offset, input.expectedResumeOffset);
  assert.equal(resume.schemaVersion, input.acceptedSchemaVersion);

  console.log(JSON.stringify({
    inspected,
    resume,
    rejectedReason: [
      'truncated-json',
      'schema-mismatch'
    ],
    restoredSource: input.source
  }, null, 2));
  console.log('dataflow-restart: resume=offset-120 schema=3 rejected=2');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        acceptedSchemaVersion: 3,
        expectedResumeOffset: 120,
        source: 'orders',
        checkpoints: [
          {
            sequence: 1,
            complete: true,
            offset: 80,
            schemaVersion: 3,
            source: 'orders',
          },
          {
            sequence: 2,
            complete: false,
            raw: '{"offset":100,"schemaVersion":3',
          },
          {
            sequence: 3,
            complete: true,
            offset: 120,
            schemaVersion: 3,
            source: 'orders',
          },
          {
            sequence: 4,
            complete: true,
            offset: 160,
            schemaVersion: 2,
            source: 'orders',
          },
        ],
      }),
      checkpoint:
        '必须拒绝截断 JSON 和 schemaVersion=2 的 checkpoint，并从 offset=120、schemaVersion=3 恢复；两个无效夹具都必须出现在 inspected 中。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 后端核心链路与异常恢复': codeLab(
    'DataFlow 综合训练 06 · 幂等接入、水位线和重放',
    '用确定性事件流验证 eventId 幂等、允许迟到范围和水位线推进，再让小规模重放必须得到完全相同的结果。',
    {
      id: 'p15-dataflow-06-guided-idempotent-ingest',
      title: '跟做：实现幂等接入与迟到边界',
      brief:
        '运行 node main.js。依次处理有序和乱序事件，区分重复、超迟到和可接收事件，并打印水位线变化。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
const accepted = [];
const rejected = [];
let watermark = 0;

for (const event of input.events) {
  const reasons = [];
  if (seen.has(event.id)) reasons.push('duplicate');
  if (event.eventTime < watermark - input.allowedLatenessMs) reasons.push('too-late');
  if (reasons.length === 0) {
    seen.add(event.id);
    accepted.push(event.id);
    watermark = Math.max(watermark, event.eventTime);
  } else {
    rejected.push({ id: event.id, reasons });
  }
}

assert.equal(accepted.length, 4);
assert.equal(rejected.filter((item) => item.reasons.includes('duplicate')).length, 2);
assert.equal(rejected.filter((item) => item.reasons.includes('too-late')).length, 1);
assert.equal(watermark, 4000);
assert.deepEqual(rejected.find((item) => item.id === 'd').reasons, ['too-late']);

console.log(JSON.stringify({
  accepted,
  rejected,
  watermark,
  allowedLatenessMs: input.allowedLatenessMs
}, null, 2));
console.log('dataflow-ingest: accepted=4 duplicate=2 late=1 watermark=4000');
`,
      stdin: JSON.stringify({
        allowedLatenessMs: 1000,
        events: [
          { id: 'a', eventTime: 1000, amount: 10 },
          { id: 'b', eventTime: 3000, amount: 20 },
          { id: 'a', eventTime: 3000, amount: 10 },
          { id: 'c', eventTime: 2500, amount: 15 },
          { id: 'd', eventTime: 1000, amount: 5 },
          { id: 'e', eventTime: 4000, amount: 30 },
          { id: 'b', eventTime: 4000, amount: 20 },
        ],
      }),
      checkpoint:
        'a、b、c、e 必须接收；a 与 b 的第二次出现记为 duplicate，d 因落后水位线 2000ms 超过 1000ms 容差而拒绝；最终水位线为 4000。',
    },
    {
      id: 'p15-dataflow-06-independent-replay-equivalence',
      title: '独立实践：重放两份乱序批次仍只聚合一次',
      brief:
        '运行 node main.js。合并两份包含重复与乱序的记录，按订单 ID 去重并比较首次运行与重放输出。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function reduceBatches(batches) {
  const orders = new Map();
  const duplicateIds = [];
  for (const batch of batches) {
    for (const row of batch) {
      if (orders.has(row.orderId)) {
        duplicateIds.push(row.orderId);
        continue;
      }
      orders.set(row.orderId, row.amount);
    }
  }
  return {
    rows: [...orders.keys()].sort().map((orderId) => ({ orderId, amount: orders.get(orderId) })),
    totalAmount: [...orders.values()].reduce((sum, amount) => sum + amount, 0),
    duplicateIds
  };
}

const first = reduceBatches(input.firstRun);
const replay = reduceBatches(input.replay);
const identical = JSON.stringify(first.rows) === JSON.stringify(replay.rows);

assert.equal(first.rows.length, 4);
assert.equal(first.totalAmount, 100);
assert.equal(first.duplicateIds.length, 2);
assert.equal(replay.rows.length, 4);
assert.equal(replay.duplicateIds.length, 1);
assert.equal(identical, true);

console.log(JSON.stringify({
  first,
  replay,
  identical,
  dedupeKey: 'orderId',
  replayDecision: identical ? 'safe' : 'block'
}, null, 2));
console.log('dataflow-replay: unique=4 total=100 duplicates=3 identical=true');
`,
      stdin: JSON.stringify({
        firstRun: [
          [
            { orderId: 'o1', amount: 10 },
            { orderId: 'o2', amount: 20 },
            { orderId: 'o1', amount: 10 },
            { orderId: 'o3', amount: 30 },
          ],
          [
            { orderId: 'o2', amount: 20 },
            { orderId: 'o4', amount: 40 },
          ],
        ],
        replay: [
          [
            { orderId: 'o3', amount: 30 },
            { orderId: 'o4', amount: 40 },
            { orderId: 'o3', amount: 30 },
          ],
          [
            { orderId: 'o1', amount: 10 },
            { orderId: 'o2', amount: 20 },
          ],
        ],
      }),
      checkpoint:
        '去重后必须仍是 4 个订单、总金额 100，重复订单 ID 共 3 次；首次运行与乱序重放的规范 JSON 必须完全一致，replayDecision 为 safe。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 前端页面、状态与可访问交互': codeLab(
    'DataFlow 综合训练 07 · 指标状态与可访问血缘',
    '把后端新鲜度、质量和权限映射成页面状态，再把血缘图转换为可读文本列表，避免颜色和图形成为唯一信息通道。',
    {
      id: 'p15-dataflow-07-guided-metric-cards',
      title: '跟做：计算指标卡的真实状态',
      brief:
        '运行 node main.js。根据权限、质量阻断和新鲜度阈值生成 restricted、blocked、stale、fresh 四类状态，并保留可行动原因。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const cards = input.metrics.map((metric) => {
  let state = 'fresh';
  const reasons = [];
  if (metric.permission !== 'view') {
    state = 'restricted';
    reasons.push('permission');
  } else if (metric.quality === 'blocked') {
    state = 'blocked';
    reasons.push('quality');
  } else if (metric.freshnessSeconds > input.freshnessLimitSeconds) {
    state = 'stale';
    reasons.push('freshness');
  }
  return {
    name: metric.name,
    state,
    reasons,
    owner: metric.permission === 'view' ? metric.owner : 'hidden',
    freshnessSeconds: metric.permission === 'view' ? metric.freshnessSeconds : null
  };
}).sort((left, right) => left.name.localeCompare(right.name));

const counts = cards.reduce((result, card) => {
  result[card.state] = (result[card.state] || 0) + 1;
  return result;
}, {});

assert.equal(cards.length, 4);
assert.equal(counts.restricted, 1);
assert.equal(counts.blocked, 1);
assert.equal(counts.stale, 1);
assert.equal(counts.fresh, 1);
assert.equal(cards.find((card) => card.state === 'restricted').freshnessSeconds, null);

console.log(JSON.stringify({ cards, counts }, null, 2));
console.log('dataflow-ui: fresh=1 stale=1 blocked=1 restricted=1');
`,
      stdin: JSON.stringify({
        freshnessLimitSeconds: 120,
        metrics: [
          { name: '支付成功率', permission: 'view', quality: 'pass', freshnessSeconds: 45, owner: '交易指标组' },
          { name: '订单新鲜度', permission: 'view', quality: 'pass', freshnessSeconds: 180, owner: '数据接入组' },
          { name: '退款金额', permission: 'view', quality: 'blocked', freshnessSeconds: 30, owner: '财务数据组' },
          { name: '毛利额', permission: 'denied', quality: 'pass', freshnessSeconds: 20, owner: '财务指标组' },
        ],
      }),
      checkpoint:
        '四张卡必须分别为 fresh、stale、blocked、restricted，各一张；无权指标不得返回 owner 或新鲜度。最后一行是 dataflow-ui: fresh=1 stale=1 blocked=1 restricted=1。',
    },
    {
      id: 'p15-dataflow-07-independent-lineage-text',
      title: '独立实践：生成指标的上游文本路径',
      brief:
        '运行 node main.js。从指标节点反向遍历血缘，列出表、任务和源，并按字段权限隐藏敏感样例但保留关系结构。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const nodes = new Map(input.nodes.map((node) => [node.id, node]));
const reverse = new Map();
for (const edge of input.edges) {
  if (!reverse.has(edge.to)) reverse.set(edge.to, []);
  reverse.get(edge.to).push(edge.from);
}

const visited = new Set();
const traversal = [];
const stack = [input.metricId];
while (stack.length > 0) {
  const current = stack.pop();
  if (visited.has(current)) continue;
  visited.add(current);
  const node = nodes.get(current);
  if (!node) {
    traversal.push({ id: current, missing: true });
    continue;
  }
  traversal.push({
    id: node.id,
    type: node.type,
    label: node.label,
    sample: node.sensitive && !input.fieldAccess ? '[redacted]' : node.sample
  });
  for (const parent of reverse.get(current) || []) stack.push(parent);
}

const metric = nodes.get(input.metricId);
const visible = traversal.filter((item) => !item.missing);
const sensitive = visible.filter((item) => item.sample === '[redacted]');

assert.equal(visible.length, 4);
assert.equal(sensitive.length, 1);
assert.equal(metric.type, 'metric');
assert.ok(visible.some((item) => item.type === 'source'));
assert.ok(visible.some((item) => item.type === 'task'));
assert.equal(input.fieldAccess, false);

console.log(JSON.stringify({
  textAlternative: visible.map((item) => item.type + ':' + item.label),
  traversal: visible,
  hiddenSamples: sensitive.length,
  relationshipPreserved: visible.length === 4
}, null, 2));
console.log('dataflow-lineage: nodes=4 hidden-samples=1 relation-preserved=true');
`,
      stdin: JSON.stringify({
        metricId: 'metric-payment-rate',
        fieldAccess: false,
        nodes: [
          { id: 'source-payment', type: 'source', label: '支付事件', sample: '{"email":"a@example.com"}', sensitive: true },
          { id: 'task-clean', type: 'task', label: '支付清洗', sample: 'accepted=120' },
          { id: 'table-detail', type: 'table', label: '支付明细', sample: 'rows=120' },
          { id: 'metric-payment-rate', type: 'metric', label: '支付成功率', sample: '0.94' },
        ],
        edges: [
          { from: 'source-payment', to: 'task-clean' },
          { from: 'task-clean', to: 'table-detail' },
          { from: 'table-detail', to: 'metric-payment-rate' },
        ],
      }),
      checkpoint:
        '文本血缘必须包含 source、task、table、metric 四个节点，关系仍完整；字段权限不足时支付样例必须为 [redacted]，且不能阻断用户查看节点关系。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 联调、测试、安全与性能': codeLab(
    'DataFlow 综合训练 08 · 质量规则与容量回归',
    '用固定坏数据验证阻断、告警和隔离，再根据批次字节数、处理时延与队列深度判断性能基线是否达标。',
    {
      id: 'p15-dataflow-08-guided-quality-rules',
      title: '跟做：质量规则分类与隔离样本',
      brief:
        '运行 node main.js。执行金额、事件时间、状态和主键重复规则，把六条记录分到 accepted、blocked 或 warning。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();

const reviewed = input.rows.map((row) => {
  const blockReasons = [];
  const warnings = [];
  if (!Number.isFinite(row.amount) || row.amount < 0) blockReasons.push('amount-non-negative');
  if (!Number.isFinite(Date.parse(row.eventTime))) blockReasons.push('event-time-valid');
  if (!input.allowedStatus.includes(row.status)) warnings.push('status-unknown');
  if (seen.has(row.orderId)) warnings.push('duplicate-order');
  seen.add(row.orderId);
  return {
    id: row.id,
    orderId: row.orderId,
    decision: blockReasons.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'accepted',
    blockReasons,
    warnings
  };
});

const counts = reviewed.reduce((summary, row) => {
  summary[row.decision] = (summary[row.decision] || 0) + 1;
  return summary;
}, {});

assert.equal(reviewed.length, 6);
assert.deepEqual(counts, { accepted: 2, blocked: 2, warning: 2 });
assert.deepEqual(reviewed.filter((row) => row.blockReasons.length > 0).map((row) => row.id), [
  'r2',
  'r3'
]);
assert.deepEqual(reviewed.filter((row) => row.warnings.includes('duplicate-order')).map((row) => row.id), [
  'r5'
]);

console.log(JSON.stringify({
  counts,
  blocked: reviewed.filter((row) => row.decision === 'blocked'),
  warnings: reviewed.filter((row) => row.decision === 'warning'),
  quarantineIds: reviewed.filter((row) => row.decision === 'blocked').map((row) => row.id)
}, null, 2));
console.log('dataflow-quality: accepted=2 blocked=2 warning=2 quarantine=2');
`,
      stdin: JSON.stringify({
        allowedStatus: ['created', 'paid', 'refunded'],
        rows: [
          { id: 'r1', orderId: 'o1', amount: 10, eventTime: '2026-11-24T09:00:00Z', status: 'paid' },
          { id: 'r2', orderId: 'o2', amount: -1, eventTime: '2026-11-24T09:01:00Z', status: 'paid' },
          { id: 'r3', orderId: 'o3', amount: 30, eventTime: 'not-a-date', status: 'created' },
          { id: 'r4', orderId: 'o4', amount: 40, eventTime: '2026-11-24T09:03:00Z', status: 'unknown' },
          { id: 'r5', orderId: 'o1', amount: 10, eventTime: '2026-11-24T09:04:00Z', status: 'paid' },
          { id: 'r6', orderId: 'o6', amount: 60, eventTime: '2026-11-24T09:05:00Z', status: 'refunded' },
        ],
      }),
      checkpoint:
        '六条记录必须得到 accepted=2、blocked=2、warning=2；r2 与 r3 必须进入隔离，r4 是状态告警，r5 是重复告警而不是静默丢弃。',
    },
    {
      id: 'p15-dataflow-08-independent-capacity-baseline',
      title: '独立实践：评估数据任务性能基线',
      brief:
        '运行 node main.js。根据四个采集批次计算吞吐、P95 单批延迟和最大队列，判断哪项预算首先失守。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const totalBytes = input.batches.reduce((sum, batch) => sum + batch.bytes, 0);
const totalMs = input.batches.reduce((sum, batch) => sum + batch.processingMs, 0);
const throughputMbPerSecond = Number(((totalBytes / 1024 / 1024) / (totalMs / 1000)).toFixed(2));
const sortedLatency = input.batches.map((batch) => batch.processingMs).sort((a, b) => a - b);
const p95Index = Math.ceil(sortedLatency.length * 0.95) - 1;
const p95LatencyMs = sortedLatency[p95Index];
const maxQueue = Math.max(...input.batches.map((batch) => batch.queueDepth));
const checks = [
  { name: 'throughput', actual: throughputMbPerSecond, limit: input.budget.throughputMbPerSecond, pass: throughputMbPerSecond >= input.budget.throughputMbPerSecond },
  { name: 'p95-latency', actual: p95LatencyMs, limit: input.budget.p95LatencyMs, pass: p95LatencyMs <= input.budget.p95LatencyMs },
  { name: 'queue-depth', actual: maxQueue, limit: input.budget.maxQueueDepth, pass: maxQueue <= input.budget.maxQueueDepth },
];

assert.equal(input.batches.length, 4);
assert.equal(throughputMbPerSecond, 43.48);
assert.equal(p95LatencyMs, 260);
assert.equal(maxQueue, 1100);
assert.deepEqual(checks.filter((check) => !check.pass).map((check) => check.name), ['queue-depth']);

console.log(JSON.stringify({
  throughputMbPerSecond,
  p95LatencyMs,
  maxQueue,
  checks,
  decision: checks.every((check) => check.pass) ? 'pass' : 'block',
  action: 'increase downstream consumer concurrency and add queue alert'
}, null, 2));
console.log('dataflow-performance: mbps=43.48 p95=260 queue=1100 fail=queue-depth');
`,
      stdin: JSON.stringify({
        budget: {
          throughputMbPerSecond: 2,
          p95LatencyMs: 300,
          maxQueueDepth: 1000,
        },
        batches: [
          { bytes: 8388608, processingMs: 200, queueDepth: 120 },
          { bytes: 8388608, processingMs: 220, queueDepth: 400 },
          { bytes: 12582912, processingMs: 240, queueDepth: 900 },
          { bytes: 12582912, processingMs: 260, queueDepth: 1100 },
        ],
      }),
      checkpoint:
        '吞吐必须为 43.48 MB/s、P95 延迟为 260ms、最大队列为 1100；只有 queue-depth 超预算，发布状态必须为 block。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 容器、CI/CD、可观测与发布': codeLab(
    'DataFlow 综合训练 09 · 数据制品与发布门禁',
    '先检查镜像、schema、checkpoint 和回滚制品，再用质量、血缘和 canary 结果决定发布是否继续。',
    {
      id: 'p15-dataflow-09-guided-artifact-manifest',
      title: '跟做：检查数据任务发布制品',
      brief:
        '运行 node main.js。检查四个制品的不可变 digest、schemaVersion、checkpoint 格式与回滚引用，输出不能发布的制品。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const artifacts = input.artifacts.map((artifact) => {
  const issues = [];
  if (!artifact.image || !artifact.image.includes('@sha256:')) issues.push('floating-image');
  if (!Number.isInteger(artifact.schemaVersion)) issues.push('missing-schema-version');
  if (!artifact.checkpointFormat || artifact.checkpointFormat !== input.requiredCheckpointFormat) {
    issues.push('checkpoint-incompatible');
  }
  if (!artifact.rollbackImage || !artifact.rollbackImage.includes('@sha256:')) {
    issues.push('missing-rollback-image');
  }
  return {
    name: artifact.name,
    issues,
    publishable: issues.length === 0
  };
});

assert.equal(artifacts.length, 4);
assert.equal(artifacts.filter((artifact) => artifact.publishable).length, 1);
assert.equal(artifacts.filter((artifact) => artifact.issues.includes('floating-image')).length, 1);
assert.equal(artifacts.find((artifact) => artifact.name === 'quality-worker').issues.includes('checkpoint-incompatible'), true);
assert.equal(artifacts.find((artifact) => artifact.name === 'metric-api').issues.includes('missing-schema-version'), true);

console.log(JSON.stringify({
  requiredCheckpointFormat: input.requiredCheckpointFormat,
  artifacts,
  publishable: artifacts.filter((artifact) => artifact.publishable).map((artifact) => artifact.name),
  blocked: artifacts.filter((artifact) => !artifact.publishable).map((artifact) => artifact.name)
}, null, 2));
console.log('dataflow-artifacts: publishable=1 blocked=3');
`,
      stdin: JSON.stringify({
        requiredCheckpointFormat: 'flink-v2',
        artifacts: [
          {
            name: 'ingest-worker',
            image: 'registry.local/ingest@sha256:1111',
            schemaVersion: 3,
            checkpointFormat: 'flink-v2',
            rollbackImage: 'registry.local/ingest@sha256:0001',
          },
          {
            name: 'quality-worker',
            image: 'registry.local/quality:latest',
            schemaVersion: 3,
            checkpointFormat: 'flink-v1',
            rollbackImage: 'registry.local/quality@sha256:0002',
          },
          {
            name: 'metric-api',
            image: 'registry.local/metrics@sha256:3333',
            checkpointFormat: 'flink-v2',
            rollbackImage: 'registry.local/metrics@sha256:0003',
          },
          {
            name: 'lineage-indexer',
            image: 'registry.local/lineage@sha256:4444',
            schemaVersion: 2,
            checkpointFormat: 'flink-v2',
            rollbackImage: '',
          },
        ],
      }),
      checkpoint:
        '只有 ingest-worker 可发布；quality-worker 同时因 latest 标签和 checkpoint 格式不兼容失败，metric-api 缺 schemaVersion，lineage-indexer 缺回滚镜像。',
    },
    {
      id: 'p15-dataflow-09-independent-release-gates',
      title: '独立实践：用质量、血缘和 canary 决定发布',
      brief:
        '运行 node main.js。汇总 schema 兼容、质量通过率、血缘完整率、checkpoint 健康与 canary 差异，定位唯一阻断门禁。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const gates = [
  {
    name: 'schema-compatible',
    actual: input.release.schemaCompatible,
    expected: true,
    pass: input.release.schemaCompatible === true,
  },
  {
    name: 'quality-rate',
    actual: input.release.qualityPassRate,
    expected: '>= ' + input.budget.qualityPassRate,
    pass: input.release.qualityPassRate >= input.budget.qualityPassRate,
  },
  {
    name: 'lineage-complete',
    actual: input.release.lineageCompleteRate,
    expected: '>= ' + input.budget.lineageCompleteRate,
    pass: input.release.lineageCompleteRate >= input.budget.lineageCompleteRate,
  },
  {
    name: 'checkpoint-health',
    actual: input.release.checkpointHealthy,
    expected: true,
    pass: input.release.checkpointHealthy === true,
  },
  {
    name: 'canary-drift',
    actual: input.release.canaryMetricDrift,
    expected: '<= ' + input.budget.canaryMetricDrift,
    pass: input.release.canaryMetricDrift <= input.budget.canaryMetricDrift,
  },
];
const failed = gates.filter((gate) => !gate.pass);

assert.equal(gates.length, 5);
assert.equal(failed.length, 1);
assert.equal(failed[0].name, 'canary-drift');
assert.equal(input.release.canaryMetricDrift, 0.04);
assert.ok(input.release.lineageCompleteRate >= input.budget.lineageCompleteRate);

console.log(JSON.stringify({
  gates,
  failed: failed.map((gate) => gate.name),
  decision: failed.length === 0 ? 'promote' : 'hold',
  evidence: {
    schemaVersion: input.release.schemaVersion,
    checkpointFormat: input.release.checkpointFormat,
    canaryCohort: input.release.canaryCohort
  }
}, null, 2));
console.log('dataflow-release: gates=5 fail=1 hold=canary-drift');
`,
      stdin: JSON.stringify({
        budget: {
          qualityPassRate: 0.99,
          lineageCompleteRate: 1,
          canaryMetricDrift: 0.01,
        },
        release: {
          schemaVersion: 3,
          schemaCompatible: true,
          checkpointFormat: 'flink-v2',
          checkpointHealthy: true,
          qualityPassRate: 0.995,
          lineageCompleteRate: 1,
          canaryMetricDrift: 0.04,
          canaryCohort: 'cn-east-10pct',
        },
      }),
      checkpoint:
        '五道门禁必须只有 canary-drift 失败，实际漂移 0.04 超过 0.01；最终必须是 hold，不能把 99.5% 质量通过与完整血缘解释成可忽略指标漂移。',
    },
  ),

  'programming:综合训练 · DataFlow 数据平台 · 故障演练、回滚与项目答辩': codeLab(
    'DataFlow 综合训练 10 · 断流恢复与组合故障',
    '在临时目录中保存 checkpoint 与死信，演练上游断流、重复重放、坏数据和恢复后对账。',
    {
      id: 'p15-dataflow-10-guided-outage-resume',
      title: '跟做：上游断流后从 checkpoint 恢复',
      brief:
        '运行 node main.js。先消费两个事件并落盘 checkpoint，再模拟断流后用带重复的剩余事件恢复，最后对账唯一事件数。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataflow-outage-'));

try {
  const checkpointPath = path.join(root, 'checkpoint.json');
  const firstWindow = input.events.slice(0, input.outageAfter);
  fs.writeFileSync(checkpointPath, JSON.stringify({
    offset: firstWindow.length,
    source: input.source
  }, null, 2));

  const processed = new Set(firstWindow.map((event) => event.id));
  const duplicateIds = [];
  const resumedEvents = input.events.slice(firstWindow.length).concat([firstWindow[0]]);
  for (const event of resumedEvents) {
    if (processed.has(event.id)) {
      duplicateIds.push(event.id);
      continue;
    }
    processed.add(event.id);
  }
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

  assert.equal(input.outageAfter, 2);
  assert.equal(checkpoint.offset, 2);
  assert.equal(processed.size, 5);
  assert.deepEqual(duplicateIds, ['e1']);
  assert.equal(checkpoint.source, 'orders');

  console.log(JSON.stringify({
    checkpoint,
    processed: [...processed].sort(),
    duplicateIds,
    recovered: processed.size === input.events.length,
    source: checkpoint.source
  }, null, 2));
  console.log('dataflow-outage: checkpoint=2 unique=5 duplicate=1 recovered=true');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        source: 'orders',
        outageAfter: 2,
        events: [
          { id: 'e1', eventTime: 1000 },
          { id: 'e2', eventTime: 2000 },
          { id: 'e3', eventTime: 3000 },
          { id: 'e4', eventTime: 4000 },
          { id: 'e5', eventTime: 5000 },
        ],
      }),
      checkpoint:
        '断流前 checkpoint 必须保存 offset=2；恢复事件中加入 e1 重复后，唯一事件仍为 5 条且只识别 1 次重复，最终 recovered=true。',
    },
    {
      id: 'p15-dataflow-10-independent-combined-failure',
      title: '独立实践：断流、坏数据与重复同时发生',
      brief:
        '运行 node main.js。在临时目录写入恢复 checkpoint 与死信清单，处理空事件、负金额、重复 ID 和正常补数，最后完成对账。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataflow-failure-'));

try {
  const deadLetterDir = path.join(root, 'dead-letter');
  fs.mkdirSync(deadLetterDir);
  const seen = new Set(input.alreadyProcessed);
  const accepted = [];
  const deadLetters = [];
  const duplicates = [];

  for (const event of input.events) {
    const reasons = [];
    if (!event.id || !event.eventTime) reasons.push('envelope-invalid');
    if (!Number.isFinite(event.amount) || event.amount < 0) reasons.push('amount-invalid');
    if (seen.has(event.id)) reasons.push('duplicate');
    if (reasons.length > 0) {
      if (reasons.includes('duplicate')) duplicates.push(event.id);
      if (reasons.some((reason) => reason !== 'duplicate')) {
        deadLetters.push({ id: event.id || 'missing-id', reasons });
      }
      continue;
    }
    seen.add(event.id);
    accepted.push({ id: event.id, amount: event.amount });
  }

  fs.writeFileSync(
    path.join(deadLetterDir, 'batch-42.json'),
    JSON.stringify(deadLetters, null, 2),
  );
  fs.writeFileSync(
    path.join(root, 'checkpoint.json'),
    JSON.stringify({ offset: input.resumeOffset, accepted: accepted.length }, null, 2),
  );
  const checkpoint = JSON.parse(fs.readFileSync(path.join(root, 'checkpoint.json'), 'utf8'));
  const persistedDeadLetters = JSON.parse(
    fs.readFileSync(path.join(deadLetterDir, 'batch-42.json'), 'utf8'),
  );

  assert.equal(accepted.length, 3);
  assert.equal(persistedDeadLetters.length, 2);
  assert.deepEqual(duplicates, ['o2']);
  assert.equal(checkpoint.offset, input.resumeOffset);
  assert.equal(checkpoint.accepted, 3);
  assert.deepEqual(persistedDeadLetters.map((item) => item.reasons), [
    ['amount-invalid'],
    ['envelope-invalid'],
  ]);

  console.log(JSON.stringify({
    accepted,
    duplicates,
    deadLetters: persistedDeadLetters,
    checkpoint,
    reconciled: accepted.length + persistedDeadLetters.length + duplicates.length === input.events.length,
    decision: 'safe-to-continue-after-review'
  }, null, 2));
  console.log('dataflow-combined-failure: accepted=3 dead=2 duplicate=1 reconciled=true');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        resumeOffset: 120,
        alreadyProcessed: ['o2'],
        events: [
          { id: 'o3', eventTime: 3000, amount: 30 },
          { id: 'o4', eventTime: 4000, amount: -5 },
          { id: 'o2', eventTime: 2000, amount: 20 },
          { id: '', eventTime: 5000, amount: 50 },
          { id: 'o5', eventTime: 5000, amount: 50 },
          { id: 'o6', eventTime: 6000, amount: 60 },
        ],
      }),
      checkpoint:
        '必须接收 o3、o5、o6 共 3 条；o4 负金额与缺 ID 事件进入死信，o2 识别为重复；accepted、deadLetters、duplicates 总数必须等于 6，checkpoint offset=120。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 业务理解与用户任务': codeLab(
    'SecureVault 综合训练 01 · 角色能力与零知识用户旅程',
    '先用能力矩阵约束用户、管理员、审核员和 SRE，再验证服务端可观察字段不会包含笔记正文、令牌或原始密钥。',
    {
      id: 'p15-securevault-01-guided-capabilities',
      title: '跟做：计算角色能力矩阵',
      brief:
        '运行 node main.js。根据 owner、member、auditor、sre 的能力集合判断六个请求，禁止把前端按钮状态当成授权结果。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const matrix = {
  owner: ['note:read', 'note:write', 'share:create', 'audit:read'],
  member: ['note:read', 'note:write', 'share:create'],
  auditor: ['audit:read'],
  sre: ['ops:read']
};

const results = input.requests.map((request) => {
  const capabilities = matrix[request.role] || [];
  return {
    actor: request.actor,
    role: request.role,
    action: request.action,
    allowed: capabilities.includes(request.action),
    reason: capabilities.includes(request.action) ? 'capability-granted' : 'capability-missing'
  };
});

assert.equal(results.length, 6);
assert.equal(results.filter((result) => result.allowed).length, 4);
assert.equal(results.filter((result) => !result.allowed && result.action.startsWith('note:')).length, 1);
assert.equal(results.find((result) => result.actor === '审核员').allowed, false);
assert.equal(results.find((result) => result.actor === 'SRE' && result.action === 'ops:read').allowed, true);
assert.ok(Object.values(matrix).flat().every((capability) => !capability.includes('decrypt')));

console.log(JSON.stringify({
  matrix,
  results,
  serverDecryptCapability: false,
  allowed: results.filter((result) => result.allowed).length,
  denied: results.filter((result) => !result.allowed).length
}, null, 2));
console.log('securevault-capabilities: allowed=4 denied=2 server-decrypt=false');
`,
      stdin: JSON.stringify({
        requests: [
          { actor: '笔记所有者', role: 'owner', action: 'note:write' },
          { actor: '团队成员', role: 'member', action: 'note:read' },
          { actor: '团队成员', role: 'member', action: 'audit:read' },
          { actor: '审核员', role: 'auditor', action: 'note:read' },
          { actor: '审核员', role: 'auditor', action: 'audit:read' },
          { actor: 'SRE', role: 'sre', action: 'ops:read' },
        ],
      }),
      checkpoint:
        '必须允许 owner 写、member 读、审核员读审计、SRE 读运维状态共 4 个请求；member 读审计和审核员读正文必须拒绝，且任何角色都不拥有 decrypt 能力。',
    },
    {
      id: 'p15-securevault-01-independent-zero-knowledge-journey',
      title: '独立实践：审计零知识用户旅程',
      brief:
        '运行 node main.js。跟随登录、解锁、加密、分享和撤权步骤，检查撤权后的读取与所有服务端可观察字段。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let unlocked = false;
let revoked = false;
const trace = [];
const leakedFields = [];

for (const step of input.journey) {
  let allowed = true;
  if (step.action === 'unlock') unlocked = true;
  if (step.action === 'lock') unlocked = false;
  if (step.action === 'write-note' && !unlocked) allowed = false;
  if (step.action === 'revoke-share') revoked = true;
  if (step.action === 'read-after-revoke') allowed = !revoked;
  const forbiddenKeys = Object.keys(step.serverFields || {}).filter((key) =>
    ['plaintext', 'body', 'rawKey', 'accessToken'].includes(key)
  );
  if (forbiddenKeys.length > 0) leakedFields.push({ step: step.step, keys: forbiddenKeys });
  trace.push({ step: step.step, action: step.action, allowed, unlocked, revoked });
}

assert.equal(trace.length, 7);
assert.equal(trace.filter((step) => step.allowed).length, 6);
assert.equal(trace.filter((step) => !step.allowed).length, 1);
assert.equal(trace.at(-1).action, 'read-after-revoke');
assert.equal(trace.at(-1).allowed, false);
assert.equal(leakedFields.length, 0);
assert.equal(unlocked, true);

console.log(JSON.stringify({
  trace,
  revoked,
  leakedFields,
  serverObserved: ['ciphertext', 'nonce', 'keyVersion', 'aad'],
  decision: leakedFields.length === 0 && !trace.at(-1).allowed ? 'zero-knowledge-path' : 'block'
}, null, 2));
console.log('securevault-zero-knowledge: allowed=6 denied=1 leaks=0');
`,
      stdin: JSON.stringify({
        journey: [
          { step: 1, action: 'login', serverFields: { subject: 'user-7', tokenId: 'jti-1' } },
          { step: 2, action: 'create-vault', serverFields: { vaultId: 'vault-42', ownerId: 'user-7' } },
          { step: 3, action: 'unlock', serverFields: { keyVersion: 3 } },
          { step: 4, action: 'write-note', serverFields: { ciphertext: 'base64', nonce: 'base64', keyVersion: 3, aad: 'vault:42:note:7' } },
          { step: 5, action: 'share', serverFields: { shareId: 'share-1', wrappedKey: 'base64' } },
          { step: 6, action: 'revoke-share', serverFields: { shareId: 'share-1', revokedAt: '2026-11-24T10:00:00Z' } },
          { step: 7, action: 'read-after-revoke', serverFields: { requestId: 'req-9', decision: 'denied' } },
        ],
      }),
      checkpoint:
        '七步中只允许最后 read-after-revoke 被拒绝；服务端字段只能出现 subject、资源 ID、ciphertext、nonce、keyVersion、aad 或审计标识，不得出现 plaintext、body、rawKey 或 accessToken。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 范围、验收与非功能目标': codeLab(
    'SecureVault 综合训练 02 · 威胁模型与攻击验收',
    '把概率、影响、控制覆盖和证据转成残余风险门禁，再通过跨租户、撤权、nonce 和日志攻击用例验证安全范围。',
    {
      id: 'p15-securevault-02-guided-residual-risk',
      title: '跟做：计算威胁残余风险',
      brief:
        '运行 node main.js。计算四类安全威胁的残余分，区分必须阻断与可接受风险，并检查控制证据是否充分。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const threats = input.threats.map((threat) => {
  const residualScore = Number(
    (threat.likelihood * threat.impact * (1 - threat.controlCoverage)).toFixed(2),
  );
  const missingEvidence = threat.evidence.length < threat.requiredEvidence;
  return {
    name: threat.name,
    residualScore,
    missingEvidence,
    decision: residualScore > input.maxResidual || missingEvidence ? 'block' : 'accept'
  };
}).sort((left, right) => right.residualScore - left.residualScore);

assert.equal(threats.length, 4);
assert.equal(threats.filter((threat) => threat.decision === 'block').length, 2);
assert.equal(threats[0].name, '跨租户读取');
assert.equal(threats[0].residualScore, 6);
assert.equal(threats.find((threat) => threat.name === '密钥泄露').missingEvidence, true);
assert.equal(input.maxResidual, 3);

console.log(JSON.stringify({
  maxResidual: input.maxResidual,
  threats,
  blocked: threats.filter((threat) => threat.decision === 'block').map((threat) => threat.name),
  decision: threats.some((threat) => threat.decision === 'block') ? 'hold-scope' : 'accept-scope'
}, null, 2));
console.log('securevault-threats: threats=4 block=2 top=cross-tenant residual=6');
`,
      stdin: JSON.stringify({
        maxResidual: 3,
        threats: [
          {
            name: '跨租户读取',
            likelihood: 5,
            impact: 4,
            controlCoverage: 0.7,
            evidence: ['跨租户用例'],
            requiredEvidence: 2,
          },
          {
            name: '密钥泄露',
            likelihood: 4,
            impact: 5,
            controlCoverage: 0.8,
            evidence: ['轮换手册'],
            requiredEvidence: 2,
          },
          {
            name: '日志明文',
            likelihood: 2,
            impact: 4,
            controlCoverage: 0.8,
            evidence: ['扫描报告', '字段白名单'],
            requiredEvidence: 2,
          },
          {
            name: '撤权延迟',
            likelihood: 3,
            impact: 3,
            controlCoverage: 0.8,
            evidence: ['撤权回归'],
            requiredEvidence: 1,
          },
        ],
      }),
      checkpoint:
        '跨租户读取残余分必须为 6；跨租户读取必须因高风险阻断，密钥泄露虽残余分为 4 且证据不足，因此也必须阻断；日志明文和撤权延迟可接受。',
    },
    {
      id: 'p15-securevault-02-independent-attack-acceptance',
      title: '独立实践：执行最小攻击验收矩阵',
      brief:
        '运行 node main.js。检查五个攻击用例是否被拒绝、证据是否存在，并定位发布前唯一未闭环的安全断言。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const evaluated = input.cases.map((test) => {
  const evidenceComplete = test.evidence.length >= test.requiredEvidence;
  const safe = test.actual === test.expected;
  return {
    id: test.id,
    attack: test.attack,
    expected: test.expected,
    actual: test.actual,
    evidenceComplete,
    pass: safe && evidenceComplete
  };
});
const failed = evaluated.filter((test) => !test.pass);

assert.equal(evaluated.length, 5);
assert.equal(failed.length, 1);
assert.equal(failed[0].id, 'A-04');
assert.equal(failed[0].actual, 'allowed');
assert.equal(input.cases.find((test) => test.id === 'A-05').evidence.length, 2);

console.log(JSON.stringify({
  evaluated,
  failed,
  releaseDecision: failed.length === 0 ? 'pass' : 'block',
  firstFix: {
    id: failed[0].id,
    attack: failed[0].attack,
    requirement: 'reject expired share after revoke regardless of cached grant'
  }
}, null, 2));
console.log('securevault-attack-matrix: cases=5 pass=4 fail=A-04 release=block');
`,
      stdin: JSON.stringify({
        cases: [
          {
            id: 'A-01',
            attack: 'second tenant reads note',
            expected: 'denied',
            actual: 'denied',
            evidence: ['跨租户读测试'],
            requiredEvidence: 1,
          },
          {
            id: 'A-02',
            attack: 'revoked member uses old request',
            expected: 'denied',
            actual: 'denied',
            evidence: ['撤权缓存测试'],
            requiredEvidence: 1,
          },
          {
            id: 'A-03',
            attack: 'reuse nonce for same key version',
            expected: 'denied',
            actual: 'denied',
            evidence: ['nonce 唯一约束', '冲突告警'],
            requiredEvidence: 2,
          },
          {
            id: 'A-04',
            attack: 'expired share after revoke',
            expected: 'denied',
            actual: 'allowed',
            evidence: ['分享过期测试'],
            requiredEvidence: 1,
          },
          {
            id: 'A-05',
            attack: 'plaintext token in trace',
            expected: 'not-found',
            actual: 'not-found',
            evidence: ['日志扫描', '字段白名单'],
            requiredEvidence: 2,
          },
        ],
      }),
      checkpoint:
        'A-01 到 A-03、A-05 通过，只有 A-04 失败：撤权后的过期分享仍被允许；发布决策必须为 block，并指出修复缓存授权路径。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · API 契约与前端数据边界': codeLab(
    'SecureVault 综合训练 03 · 密文信封与最小披露错误',
    '先校验算法、keyVersion、nonce 和密文结构，再验证无权限、已删除和不存在资源使用相同外部响应。',
    {
      id: 'p15-securevault-03-guided-envelope-contract',
      title: '跟做：验证 AES-GCM 密文信封',
      brief:
        '运行 node main.js。检查五条上传信封的算法、12 字节 nonce 唯一性、keyVersion、AAD 和密文上限。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seenNonces = new Set();

const envelopes = input.envelopes.map((envelope) => {
  const issues = [];
  const nonce = Buffer.from(envelope.nonce || '', 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext || '', 'base64');
  if (envelope.algorithm !== 'AES-256-GCM') issues.push('algorithm');
  if (nonce.length !== 12) issues.push('nonce-length');
  if (seenNonces.has(envelope.nonce)) issues.push('nonce-replay');
  seenNonces.add(envelope.nonce);
  if (!Number.isInteger(envelope.keyVersion) || envelope.keyVersion < 1) issues.push('key-version');
  if (!envelope.aad || typeof envelope.aad !== 'string') issues.push('aad');
  if (ciphertext.length === 0 || ciphertext.length > input.maxCipherBytes) issues.push('cipher-size');
  return {
    id: envelope.id,
    nonceBytes: nonce.length,
    cipherBytes: ciphertext.length,
    issues,
    accepted: issues.length === 0
  };
});

assert.equal(envelopes.filter((envelope) => envelope.accepted).length, 2);
assert.equal(envelopes.filter((envelope) => envelope.issues.includes('nonce-replay')).length, 1);
assert.equal(envelopes.filter((envelope) => envelope.issues.includes('algorithm')).length, 1);
assert.equal(envelopes.filter((envelope) => envelope.issues.includes('cipher-size')).length, 1);
assert.equal(envelopes.find((envelope) => envelope.id === 'env-1').nonceBytes, 12);

console.log(JSON.stringify({
  accepted: envelopes.filter((envelope) => envelope.accepted).map((envelope) => envelope.id),
  rejected: envelopes.filter((envelope) => !envelope.accepted),
  maxCipherBytes: input.maxCipherBytes
}, null, 2));
console.log('securevault-envelope: accepted=2 rejected=3 nonce-bytes=12');
`,
      stdin: JSON.stringify({
        maxCipherBytes: 64,
        envelopes: [
          {
            id: 'env-1',
            algorithm: 'AES-256-GCM',
            nonce: 'AAECAwQFBgcICQoL',
            keyVersion: 3,
            aad: 'vault:42:note:7',
            ciphertext: 'YWJjZGVmZ2hpamts',
          },
          {
            id: 'env-2',
            algorithm: 'AES-256-GCM',
            nonce: 'DA0ODxAREhMUFRYX',
            keyVersion: 3,
            aad: 'vault:42:note:8',
            ciphertext: 'bW5vcHFyc3R1dnd4eXo=',
          },
          {
            id: 'env-3',
            algorithm: 'AES-256-GCM',
            nonce: 'AAECAwQFBgcICQoL',
            keyVersion: 3,
            aad: 'vault:42:note:9',
            ciphertext: 'ZHVwbGljYXRl',
          },
          {
            id: 'env-4',
            algorithm: 'AES-CBC',
            nonce: 'GhscHR4fICEiIyQlJic=',
            keyVersion: 3,
            aad: 'vault:42:note:10',
            ciphertext: 'd3JvbmctYWxn',
          },
          {
            id: 'env-5',
            algorithm: 'AES-256-GCM',
            nonce: 'MTIzNDU2Nzg5MDEy',
            keyVersion: 3,
            aad: 'vault:42:note:11',
            ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          },
        ],
      }),
      checkpoint:
        'env-1 与 env-2 可接收；env-3 复用 nonce，env-4 算法不是 AES-256-GCM，env-5 密文超过 64 字节。最后一行是 securevault-envelope: accepted=2 rejected=3 nonce-bytes=12。',
    },
    {
      id: 'p15-securevault-03-independent-minimal-disclosure',
      title: '独立实践：隐藏资源存在性',
      brief:
        '运行 node main.js。对同租户、跨租户、已删除和不存在资源生成外部响应，并保留仅供内部审计的真实原因。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const responses = input.requests.map((request) => {
  const resource = input.resources.find((item) => item.id === request.resourceId);
  let internalReason = 'allowed';
  if (!resource) internalReason = 'not-found';
  else if (resource.deleted) internalReason = 'deleted';
  else if (resource.tenantId !== request.tenantId) internalReason = 'cross-tenant';
  else if (!request.capabilities.includes('note:read')) internalReason = 'capability-missing';
  const allowed = internalReason === 'allowed';
  return {
    requestId: request.id,
    status: allowed ? 200 : 404,
    externalCode: allowed ? 'OK' : 'RESOURCE_UNAVAILABLE',
    internalReason,
    body: allowed ? { noteId: resource.id, ciphertext: resource.ciphertext } : { error: 'RESOURCE_UNAVAILABLE' }
  };
});

const denied = responses.filter((response) => response.status === 404);

assert.equal(responses.filter((response) => response.status === 200).length, 2);
assert.equal(denied.length, 4);
assert.equal(new Set(denied.map((response) => response.externalCode)).size, 1);
assert.deepEqual(denied.map((response) => response.internalReason).sort(), [
  'capability-missing',
  'cross-tenant',
  'deleted',
  'not-found',
]);
assert.ok(denied.every((response) => !('noteId' in response.body)));

console.log(JSON.stringify({
  responses,
  publicCodes: [...new Set(denied.map((response) => response.externalCode))],
  internalReasons: denied.map((response) => response.internalReason),
  existenceLeak: false
}, null, 2));
console.log('securevault-authz-error: success=2 denied=4 public-code=1 leak=false');
`,
      stdin: JSON.stringify({
        resources: [
          { id: 'note-1', tenantId: 'tenant-a', deleted: false, ciphertext: 'cipher-a' },
          { id: 'note-2', tenantId: 'tenant-a', deleted: false, ciphertext: 'cipher-b' },
          { id: 'note-3', tenantId: 'tenant-b', deleted: false, ciphertext: 'cipher-c' },
          { id: 'note-4', tenantId: 'tenant-a', deleted: true, ciphertext: 'cipher-d' },
        ],
        requests: [
          { id: 'r1', tenantId: 'tenant-a', resourceId: 'note-1', capabilities: ['note:read'] },
          { id: 'r2', tenantId: 'tenant-a', resourceId: 'note-2', capabilities: ['note:read'] },
          { id: 'r3', tenantId: 'tenant-a', resourceId: 'note-3', capabilities: ['note:read'] },
          { id: 'r4', tenantId: 'tenant-a', resourceId: 'note-4', capabilities: ['note:read'] },
          { id: 'r5', tenantId: 'tenant-a', resourceId: 'note-missing', capabilities: ['note:read'] },
          { id: 'r6', tenantId: 'tenant-a', resourceId: 'note-1', capabilities: [] },
        ],
      }),
      checkpoint:
        'r1、r2 返回 200；跨租户、已删除、不存在和缺能力四个请求都必须返回同样的 404/RESOURCE_UNAVAILABLE，不得包含 noteId，内部原因保留在审计结果中。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 数据模型、约束与迁移': codeLab(
    'SecureVault 综合训练 04 · nonce 唯一与密钥版本迁移',
    '检查密文版本、nonce 唯一性和撤销分享约束，再在不接触明文的前提下完成 v1 到 v2 迁移计划。',
    {
      id: 'p15-securevault-04-guided-model-invariants',
      title: '跟做：找出密文与分享的约束损坏',
      brief:
        '运行 node main.js。验证同一 keyVersion 下 nonce 唯一、note version 严格递增、分享过期与撤销字段一致。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const nonceKeys = new Map();

const notes = input.notes.map((note) => {
  const key = note.keyVersion + ':' + note.nonce;
  if (nonceKeys.has(key)) {
    nonceKeys.get(key).duplicate = true;
    note.duplicate = true;
  } else {
    nonceKeys.set(key, note);
  }
  const versionValid = Number.isInteger(note.version) && note.version > note.previousVersion;
  const cipherValid = note.ciphertext.length > 0 && note.aad.includes(note.noteId);
  return {
    noteId: note.noteId,
    version: note.version,
    duplicateNonce: note.duplicate === true,
    versionValid,
    cipherValid,
    valid: !note.duplicate && versionValid && cipherValid
  };
});
const shares = input.shares.map((share) => {
  const expired = Date.parse(share.expiresAt) <= Date.parse(input.now);
  const consistencyIssue = share.revoked && share.status !== 'revoked';
  return { ...share, expired, consistencyIssue, valid: !consistencyIssue };
});

assert.equal(notes.filter((note) => note.duplicateNonce).length, 1);
assert.equal(notes.filter((note) => !note.versionValid).length, 1);
assert.equal(notes.filter((note) => !note.cipherValid).length, 1);
assert.equal(shares.filter((share) => share.consistencyIssue).length, 1);
assert.equal(shares.filter((share) => share.expired).length, 1);

console.log(JSON.stringify({
  notes,
  shares,
  violations: {
    duplicateNonce: notes.filter((note) => note.duplicateNonce).map((note) => note.noteId),
    invalidVersion: notes.filter((note) => !note.versionValid).map((note) => note.noteId),
    invalidCipher: notes.filter((note) => !note.cipherValid).map((note) => note.noteId),
    shareConsistency: shares.filter((share) => share.consistencyIssue).map((share) => share.id)
  }
}, null, 2));
console.log('securevault-model: duplicate-nonce=1 bad-version=1 bad-cipher=1 bad-share=1');
`,
      stdin: JSON.stringify({
        now: '2026-11-24T10:00:00.000Z',
        notes: [
          { noteId: 'note-1', keyVersion: 3, nonce: 'n-a', version: 2, previousVersion: 1, ciphertext: 'cipher-a', aad: 'vault:42:note-1' },
          { noteId: 'note-2', keyVersion: 3, nonce: 'n-b', version: 2, previousVersion: 1, ciphertext: 'cipher-b', aad: 'vault:42:note-2' },
          { noteId: 'note-3', keyVersion: 3, nonce: 'n-a', version: 3, previousVersion: 2, ciphertext: 'cipher-c', aad: 'vault:42:note-3' },
          { noteId: 'note-4', keyVersion: 3, nonce: 'n-d', version: 1, previousVersion: 1, ciphertext: 'cipher-d', aad: 'vault:42:note-4' },
          { noteId: 'note-5', keyVersion: 3, nonce: 'n-e', version: 2, previousVersion: 1, ciphertext: 'cipher-e', aad: 'vault:99:note-x' },
        ],
        shares: [
          { id: 'share-1', revoked: false, status: 'active', expiresAt: '2026-11-25T10:00:00.000Z' },
          { id: 'share-2', revoked: true, status: 'active', expiresAt: '2026-11-25T10:00:00.000Z' },
          { id: 'share-3', revoked: false, status: 'active', expiresAt: '2026-11-23T10:00:00.000Z' },
        ],
      }),
      checkpoint:
        'note-3 复用 note-1 的 nonce，note-4 的 version 未严格递增，note-5 的 AAD 绑定错误资源；share-2 撤销状态不一致，share-3 已过期。五类违规都要显式暴露。',
    },
    {
      id: 'p15-securevault-04-independent-cipher-migration',
      title: '独立实践：在双读窗口迁移密文版本',
      brief:
        '运行 node main.js。读取 v1 密文记录与同时理解 v1/v2 的消费者，生成只搬运密文元数据的四阶段迁移，并验证旧版回读。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const incompatibleReaders = input.readers.filter((reader) =>
  !reader.versions.includes(input.fromVersion) || !reader.versions.includes(input.toVersion)
);
const migrated = input.records.map((record) => ({
  id: record.id,
  ciphertext: record.ciphertext,
  nonce: record.nonce,
  keyVersion: record.keyVersion,
  aad: record.aad,
  schemaVersion: input.toVersion,
  previousSchemaVersion: record.schemaVersion,
}));
const forbiddenPlaintext = migrated.filter((record) =>
  ['body', 'plaintext', 'rawKey'].some((key) => key in record)
);
const plan = [
  'create-v2-envelope-columns',
  'dual-write-new-versions',
  'backfill-cipher-metadata-only',
  'verify-v1-and-v2-reads-then-contract',
];

assert.equal(incompatibleReaders.length, 0);
assert.equal(migrated.length, 3);
assert.equal(forbiddenPlaintext.length, 0);
assert.ok(migrated.every((record) => record.schemaVersion === 2 && record.previousSchemaVersion === 1));
assert.ok(migrated.every((record) => record.keyVersion >= 1 && record.nonce.length > 0));
assert.equal(input.rollbackWindowHours, 24);

console.log(JSON.stringify({
  plan,
  migrated,
  readers: input.readers.map((reader) => reader.name),
  plaintextFields: forbiddenPlaintext.length,
  rollbackWindowHours: input.rollbackWindowHours,
  decision: 'dual-read-migration-ready'
}, null, 2));
console.log('securevault-migration: records=3 readers=3 plaintext=0 rollback=24h');
`,
      stdin: JSON.stringify({
        fromVersion: 1,
        toVersion: 2,
        rollbackWindowHours: 24,
        readers: [
          { name: 'note-api', versions: [1, 2] },
          { name: 'share-service', versions: [1, 2] },
          { name: 'audit-reader', versions: [1, 2] },
        ],
        records: [
          { id: 'note-1', schemaVersion: 1, ciphertext: 'cipher-a', nonce: 'nonce-a', keyVersion: 3, aad: 'vault:42:note-1' },
          { id: 'note-2', schemaVersion: 1, ciphertext: 'cipher-b', nonce: 'nonce-b', keyVersion: 3, aad: 'vault:42:note-2' },
          { id: 'note-3', schemaVersion: 1, ciphertext: 'cipher-c', nonce: 'nonce-c', keyVersion: 4, aad: 'vault:42:note-3' },
        ],
      }),
      checkpoint:
        '三个消费者必须同时支持 v1/v2；迁移只搬运 ciphertext、nonce、keyVersion、AAD，三份记录都变为 schemaVersion=2 且保留旧版本标记，输出中明文/原始密钥字段必须为 0。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 项目骨架、模块边界与本地环境': codeLab(
    'SecureVault 综合训练 05 · 临时对象存储与 KMS 引用',
    '用临时目录模拟密文对象存储、审计目录和 KMS 引用，验证文件中没有笔记明文或真实密钥。',
    {
      id: 'p15-securevault-05-guided-object-store',
      title: '跟做：写入密文对象与审计索引',
      brief:
        '运行 node main.js。在临时目录创建 objects、audit 与 kms-ref 文件，扫描所有落盘内容确认没有正文和原始密钥。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-store-'));

try {
  const objectsDir = path.join(root, 'objects');
  const auditDir = path.join(root, 'audit');
  fs.mkdirSync(objectsDir);
  fs.mkdirSync(auditDir);
  const index = input.objects.map((object) => {
    const file = path.join(objectsDir, object.id + '.json');
    fs.writeFileSync(file, JSON.stringify(object, null, 2));
    fs.appendFileSync(
      path.join(auditDir, 'access.log'),
      JSON.stringify({ objectId: object.id, action: 'stored', actor: 'fixture' }) + '\n',
    );
    return { id: object.id, file: path.relative(root, file), bytes: fs.statSync(file).size };
  });
  const allText = [
    ...input.objects.map((object) => JSON.stringify(object)),
    fs.readFileSync(path.join(auditDir, 'access.log'), 'utf8'),
  ].join('\n');
  const plaintextHits = input.forbiddenSamples.filter((sample) => allText.includes(sample));
  const indexFile = path.join(root, 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify({ objects: index }, null, 2));

  assert.equal(index.length, 3);
  assert.equal(plaintextHits.length, 0);
  assert.equal(fs.readFileSync(path.join(auditDir, 'access.log'), 'utf8').trim().split('\n').length, 3);
  assert.ok(fs.existsSync(indexFile));
  assert.ok(input.objects.every((object) => object.nonce && object.keyRef.startsWith('kms://')));

  console.log(JSON.stringify({
    root: '<temporary>',
    index,
    plaintextHits,
    keyRefs: [...new Set(input.objects.map((object) => object.keyRef))],
    auditEvents: 3
  }, null, 2));
  console.log('securevault-object-store: objects=3 plaintext-hits=0 audit=3');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        forbiddenSamples: ['董事会机密纪要', 'raw-key-material'],
        objects: [
          {
            id: 'note-1',
            ciphertext: 'Y2lwaGVyLWF1',
            nonce: 'AAECAwQFBgcICQoL',
            keyRef: 'kms://securevault/local/key-3',
            aad: 'vault:42:note:1',
          },
          {
            id: 'note-2',
            ciphertext: 'Y2lwaGVyLWJ1',
            nonce: 'CwwNDg8QERITFBUWFxg=',
            keyRef: 'kms://securevault/local/key-3',
            aad: 'vault:42:note:2',
          },
          {
            id: 'note-3',
            ciphertext: 'Y2lwaGVyLWN1',
            nonce: 'GhscHR4fICEiIyQlJic=',
            keyRef: 'kms://securevault/local/key-4',
            aad: 'vault:42:note:3',
          },
        ],
      }),
      checkpoint:
        '三份密文对象、三条审计事件和 index.json 必须落盘；扫描所有内容时明文和原始密钥命中为 0，所有 keyRef 必须是 kms:// 引用。',
    },
    {
      id: 'p15-securevault-05-independent-local-bootstrap',
      title: '独立实践：验证本地启动不携带密钥',
      brief:
        '运行 node main.js。用临时目录生成启动清单和 KMS 引用，扫描仓库式文件树，验证开发密钥仅由运行时环境提供。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-bootstrap-'));

try {
  const configDir = path.join(root, 'config');
  const secretsDir = path.join(root, 'runtime-secrets');
  fs.mkdirSync(configDir);
  fs.mkdirSync(secretsDir);
  const manifest = {
    services: input.services,
    keyRefs: input.keyRefs,
    runtimeSecretSource: 'environment',
  };
  fs.writeFileSync(path.join(configDir, 'bootstrap.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(configDir, '.env.example'), input.exampleEnv);
  fs.writeFileSync(path.join(secretsDir, 'README.txt'), 'mount secret outside the repository');

  const files = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name);
      if (fs.statSync(full).isDirectory()) visit(full);
      else files.push(full);
    }
  }
  visit(root);
  const contents = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const keyLeaks = input.forbiddenKeyValues.filter((value) => contents.includes(value));
  const parsedManifest = JSON.parse(fs.readFileSync(path.join(configDir, 'bootstrap.json'), 'utf8'));

  assert.equal(files.length, 3);
  assert.equal(parsedManifest.services.length, 3);
  assert.equal(keyLeaks.length, 0);
  assert.ok(parsedManifest.keyRefs.every((reference) => reference.startsWith('kms://')));
  assert.equal(parsedManifest.runtimeSecretSource, 'environment');

  console.log(JSON.stringify({
    manifest: parsedManifest,
    files: files.map((file) => path.relative(root, file)),
    keyLeaks,
    decision: keyLeaks.length === 0 ? 'bootstrap-safe' : 'block'
  }, null, 2));
  console.log('securevault-bootstrap: files=3 services=3 key-leaks=0 source=environment');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        services: ['client', 'api', 'local-kms'],
        keyRefs: [
          'kms://securevault/local/key-3',
          'kms://securevault/local/key-4',
        ],
        forbiddenKeyValues: ['dev-key-32-byte-material', 'sk_live_securevault'],
        exampleEnv: 'KMS_ENDPOINT=http://local-kms:8080\nKEY_REF=kms://securevault/local/key-3\n',
      }),
      checkpoint:
        '临时文件树必须只有 bootstrap、示例环境文件和运行时密钥说明；清单含 3 个服务和两个 kms:// 引用，开发密钥与 sk_live 字符串均不得出现在任何文件中。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 后端核心链路与异常恢复': codeLab(
    'SecureVault 综合训练 06 · 对象授权与失败关闭',
    '每个请求重新检查租户、成员和动作，再让 KMS、审计或 nonce 冲突任一侧失败时整笔写操作拒绝。',
    {
      id: 'p15-securevault-06-guided-object-authorization',
      title: '跟做：拒绝跨保险库与已撤销成员',
      brief:
        '运行 node main.js。根据成员表、保险库和请求动作逐项授权，输出允许、越权、撤权三类结果。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const memberships = new Map(
  input.memberships.map((member) => [member.actorId + ':' + member.vaultId, member]),
);
const vaults = new Map(input.vaults.map((vault) => [vault.id, vault]));

const decisions = input.requests.map((request) => {
  const vault = vaults.get(request.vaultId);
  const membership = memberships.get(request.actorId + ':' + request.vaultId);
  let reason = 'allowed';
  if (!vault) reason = 'vault-missing';
  else if (!membership || membership.revokedAt) reason = 'membership-inactive';
  else if (!membership.capabilities.includes(request.action)) reason = 'capability-missing';
  else if (vault.tenantId !== request.tenantId) reason = 'tenant-mismatch';
  return {
    requestId: request.id,
    actorId: request.actorId,
    vaultId: request.vaultId,
    action: request.action,
    allowed: reason === 'allowed',
    reason
  };
});

assert.equal(decisions.filter((decision) => decision.allowed).length, 2);
assert.equal(decisions.filter((decision) => decision.reason === 'membership-inactive').length, 2);
assert.equal(decisions.filter((decision) => decision.reason === 'tenant-mismatch').length, 1);
assert.equal(decisions.filter((decision) => decision.reason === 'capability-missing').length, 1);

console.log(JSON.stringify({
  decisions,
  allowed: decisions.filter((decision) => decision.allowed).length,
  denied: decisions.filter((decision) => !decision.allowed).length,
  serverReauthorized: true
}, null, 2));
console.log('securevault-authz: allowed=2 denied=4 reauthorized=true');
`,
      stdin: JSON.stringify({
        vaults: [
          { id: 'vault-42', tenantId: 'tenant-a' },
          { id: 'vault-99', tenantId: 'tenant-b' },
        ],
        memberships: [
          { actorId: 'alice', vaultId: 'vault-42', capabilities: ['note:read', 'note:write', 'share:create'], revokedAt: null },
          { actorId: 'bob', vaultId: 'vault-42', capabilities: ['note:read'], revokedAt: null },
          { actorId: 'carol', vaultId: 'vault-42', capabilities: ['note:read', 'note:write'], revokedAt: '2026-11-24T09:00:00Z' },
          { actorId: 'mallory', vaultId: 'vault-42', capabilities: ['note:read'], revokedAt: null },
        ],
        requests: [
          { id: 'r1', actorId: 'alice', tenantId: 'tenant-a', vaultId: 'vault-42', action: 'note:write' },
          { id: 'r2', actorId: 'bob', tenantId: 'tenant-a', vaultId: 'vault-42', action: 'note:read' },
          { id: 'r3', actorId: 'carol', tenantId: 'tenant-a', vaultId: 'vault-42', action: 'note:write' },
          { id: 'r4', actorId: 'carol', tenantId: 'tenant-a', vaultId: 'vault-42', action: 'note:read' },
          { id: 'r5', actorId: 'mallory', tenantId: 'tenant-b', vaultId: 'vault-42', action: 'note:read' },
          { id: 'r6', actorId: 'bob', tenantId: 'tenant-a', vaultId: 'vault-42', action: 'share:create' },
        ],
      }),
      checkpoint:
        'r1、r2 允许；carol 的两个请求都必须因成员已撤销而拒绝；mallory 使用错误租户访问 vault-42 必须拒绝；bob 缺 share:create 能力必须拒绝。',
    },
    {
      id: 'p15-securevault-06-independent-fail-closed-write',
      title: '独立实践：密文写入与审计同事务',
      brief:
        '运行 node main.js。逐笔检查授权、KMS、审计和 nonce，任何依赖失败都不得留下孤立笔记或半条审计。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const notes = [];
const audits = [];
const usedNonces = new Set();
const rejected = [];

for (const operation of input.operations) {
  const reasons = [];
  if (!operation.authorized) reasons.push('authorization');
  if (!operation.kmsAvailable) reasons.push('kms-unavailable');
  if (!operation.auditAvailable) reasons.push('audit-unavailable');
  if (usedNonces.has(operation.nonce)) reasons.push('nonce-replay');
  if (reasons.length > 0) {
    rejected.push({ id: operation.id, reasons });
    continue;
  }
  usedNonces.add(operation.nonce);
  notes.push({
    id: operation.noteId,
    ciphertext: operation.ciphertext,
    nonce: operation.nonce,
    keyVersion: operation.keyVersion
  });
  audits.push({ action: 'note:create', noteId: operation.noteId, operationId: operation.id });
}

assert.equal(notes.length, 1);
assert.equal(audits.length, 1);
assert.equal(rejected.length, 3);
assert.deepEqual(rejected.find((item) => item.id === 'op-2').reasons, ['kms-unavailable']);
assert.deepEqual(rejected.find((item) => item.id === 'op-3').reasons, ['audit-unavailable']);
assert.deepEqual(rejected.find((item) => item.id === 'op-4').reasons, ['nonce-replay']);
assert.equal(notes.length, audits.length);

console.log(JSON.stringify({
  committedNoteIds: notes.map((note) => note.id),
  auditNoteIds: audits.map((audit) => audit.noteId),
  rejected,
  atomic: notes.length === audits.length,
  fallbackToPlaintext: false
}, null, 2));
console.log('securevault-transaction: committed=1 rejected=3 atomic=true plaintext-fallback=false');
`,
      stdin: JSON.stringify({
        operations: [
          {
            id: 'op-1',
            noteId: 'note-1',
            authorized: true,
            kmsAvailable: true,
            auditAvailable: true,
            ciphertext: 'cipher-a',
            nonce: 'nonce-a',
            keyVersion: 3,
          },
          {
            id: 'op-2',
            noteId: 'note-2',
            authorized: true,
            kmsAvailable: false,
            auditAvailable: true,
            ciphertext: 'cipher-b',
            nonce: 'nonce-b',
            keyVersion: 3,
          },
          {
            id: 'op-3',
            noteId: 'note-3',
            authorized: true,
            kmsAvailable: true,
            auditAvailable: false,
            ciphertext: 'cipher-c',
            nonce: 'nonce-c',
            keyVersion: 3,
          },
          {
            id: 'op-4',
            noteId: 'note-4',
            authorized: true,
            kmsAvailable: true,
            auditAvailable: true,
            ciphertext: 'cipher-d',
            nonce: 'nonce-a',
            keyVersion: 3,
          },
        ],
      }),
      checkpoint:
        '只有 op-1 能提交；KMS 不可用、审计不可用和 nonce 重复分别拒绝 op-2、op-3、op-4。最终必须只有 1 条笔记和 1 条审计，且不能降级明文。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 前端页面、状态与可访问交互': codeLab(
    'SecureVault 综合训练 07 · 密钥驻留与分享动作',
    '用事件日志检查解锁密钥何时进入与清出内存，再根据撤销、过期和权限生成不会误导用户的分享面板。',
    {
      id: 'p15-securevault-07-guided-key-lifecycle',
      title: '跟做：跟踪前端解锁状态',
      brief:
        '运行 node main.js。按解锁、编辑、切页、锁屏和离开保险库事件计算密钥是否驻留，验证锁定后写操作被阻止。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let keyInMemory = false;
const transitions = [];

for (const event of input.events) {
  if (event.type === 'unlock') keyInMemory = true;
  if (event.type === 'lock' || event.type === 'leave-vault') keyInMemory = false;
  const canWrite = event.type === 'write' && keyInMemory;
  transitions.push({
    sequence: event.sequence,
    type: event.type,
    keyInMemory,
    allowed: event.type === 'write' ? canWrite : event.type !== 'read' || keyInMemory
  });
}

assert.equal(transitions.length, 7);
assert.equal(transitions.filter((transition) => !transition.allowed).length, 2);
assert.equal(transitions.at(-1).keyInMemory, false);
assert.equal(transitions.filter((transition) => transition.type === 'write' && transition.allowed).length, 1);
assert.equal(input.persistKeyToLocalStorage, false);

console.log(JSON.stringify({
  transitions,
  finalKeyInMemory: keyInMemory,
  persisted: input.persistKeyToLocalStorage,
  blockedWrites: transitions.filter((transition) => transition.type === 'write' && !transition.allowed).length
}, null, 2));
console.log('securevault-key-ui: transitions=7 blocked-writes=2 final-memory=false persisted=false');
`,
      stdin: JSON.stringify({
        persistKeyToLocalStorage: false,
        events: [
          { sequence: 1, type: 'unlock' },
          { sequence: 2, type: 'write' },
          { sequence: 3, type: 'lock' },
          { sequence: 4, type: 'write' },
          { sequence: 5, type: 'unlock' },
          { sequence: 6, type: 'leave-vault' },
          { sequence: 7, type: 'write' },
        ],
      }),
      checkpoint:
        '第二次和第七次事件中的 write 必须被阻止，只有解锁状态下的第一次写允许；离开保险库后最终 keyInMemory=false，且不得持久化到 localStorage。',
    },
    {
      id: 'p15-securevault-07-independent-share-actions',
      title: '独立实践：生成安全分享面板状态',
      brief:
        '运行 node main.js。根据收件人、过期时间、撤销状态和调用者能力，决定复制、轮换和撤权按钮，并对邮箱做最小展示。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);

const rows = input.shares.map((share) => {
  const expired = Date.parse(share.expiresAt) <= now;
  const revoked = Boolean(share.revokedAt);
  const canManage = input.capabilities.includes('share:manage');
  const canCreate = input.capabilities.includes('share:create');
  const actions = [];
  if (!revoked && !expired && canCreate) actions.push('copy-link');
  if (!revoked && !expired && canManage) actions.push('rotate-key');
  if (!revoked && !expired && canManage) actions.push('revoke');
  const at = share.email.indexOf('@');
  return {
    id: share.id,
    recipient: share.email.slice(0, 1) + '***' + share.email.slice(at),
    expired,
    revoked,
    actions,
    status: revoked ? 'revoked' : expired ? 'expired' : 'active'
  };
});

assert.equal(rows.length, 4);
assert.equal(rows.filter((row) => row.status === 'active').length, 2);
assert.equal(rows.filter((row) => row.status === 'revoked').length, 1);
assert.equal(rows.filter((row) => row.status === 'expired').length, 1);
assert.equal(rows.filter((row) => row.actions.includes('revoke')).length, 2);
assert.equal(rows.filter((row) => row.status !== 'active').every((row) => row.actions.length === 0), true);
assert.ok(rows.every((row) => row.recipient.includes('***')));

console.log(JSON.stringify({
  rows,
  capabilities: input.capabilities,
  actionable: rows.filter((row) => row.actions.length > 0).map((row) => row.id),
  emailsExposed: 0
}, null, 2));
console.log('securevault-share-ui: active=2 revoked=1 expired=1 emails-exposed=0');
`,
      stdin: JSON.stringify({
        now: '2026-11-24T10:00:00.000Z',
        capabilities: ['share:create', 'share:manage'],
        shares: [
          { id: 'share-1', email: 'alice@example.com', expiresAt: '2026-11-25T10:00:00.000Z', revokedAt: null },
          { id: 'share-2', email: 'bob@example.com', expiresAt: '2026-11-26T10:00:00.000Z', revokedAt: null },
          { id: 'share-3', email: 'carol@example.com', expiresAt: '2026-11-27T10:00:00.000Z', revokedAt: '2026-11-24T09:00:00.000Z' },
          { id: 'share-4', email: 'dave@example.com', expiresAt: '2026-11-23T10:00:00.000Z', revokedAt: null },
        ],
      }),
      checkpoint:
        'share-1 与 share-2 为 active，share-3 已撤销，share-4 已过期；只有 active 分享提供复制/轮换/撤权。收件人必须脱敏，不能直接输出完整邮箱。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 联调、测试、安全与性能': codeLab(
    'SecureVault 综合训练 08 · AES-GCM 篡改与 nonce 重放',
    '使用 Node.js 标准 crypto 完成真实 AES-256-GCM 加解密，证明密文篡改和 nonce 重放都能被检测。',
    {
      id: 'p15-securevault-08-guided-authenticated-encryption',
      title: '跟做：验证认证加密与篡改拒绝',
      brief:
        '运行 node main.js。使用 stdin 中的密钥、nonce 和 AAD 加密正文，正常解密后修改认证标签并确认必须抛错。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = Buffer.from(input.keyHex, 'hex');
const nonce = Buffer.from(input.nonceHex, 'hex');
const aad = Buffer.from(input.aad, 'utf8');

function encrypt(plaintext) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, tag: cipher.getAuthTag() };
}

function decrypt(ciphertext, tag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const sealed = encrypt(input.plaintext);
const opened = decrypt(sealed.ciphertext, sealed.tag);
const tamperedTag = Buffer.from(sealed.tag);
tamperedTag[0] ^= 1;
let tamperRejected = false;
try {
  decrypt(sealed.ciphertext, tamperedTag);
} catch {
  tamperRejected = true;
}

assert.equal(key.length, 32);
assert.equal(nonce.length, 12);
assert.equal(opened, input.plaintext);
assert.equal(tamperRejected, true);
assert.equal(sealed.tag.length, 16);

console.log(JSON.stringify({
  algorithm: 'aes-256-gcm',
  keyBytes: key.length,
  nonceBytes: nonce.length,
  cipherBytes: sealed.ciphertext.length,
  roundTrip: opened === input.plaintext,
  tamperRejected,
  plaintextPrinted: false
}, null, 2));
console.log('securevault-aead: round-trip=true tamper-rejected=true key=32 nonce=12');
`,
      stdin: JSON.stringify({
        keyHex: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
        nonceHex: '101112131415161718191a1b',
        aad: 'vault:42:note:7:key-version:3',
        plaintext: 'zero knowledge note',
      }),
      checkpoint:
        '密钥必须为 32 字节、nonce 为 12 字节、认证标签为 16 字节；正常解密必须还原正文，修改标签后必须被 AES-GCM 拒绝，日志不得打印正文。',
    },
    {
      id: 'p15-securevault-08-independent-replay-and-tamper',
      title: '独立实践：批量加解密时拒绝 nonce 重放',
      brief:
        '运行 node main.js。为三条记录检测 nonce 唯一性，真实加密可用记录，篡改其中一条后再统计成功解密与认证失败。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = Buffer.from(input.keyHex, 'hex');
const aad = Buffer.from(input.aad, 'utf8');
const nonceSeen = new Set();
const rejectedReplay = [];
const sealed = [];

for (const item of input.items) {
  if (nonceSeen.has(item.nonceHex)) {
    rejectedReplay.push(item.id);
    continue;
  }
  nonceSeen.add(item.nonceHex);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(item.nonceHex, 'hex'));
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(item.plaintext, 'utf8'), cipher.final()]);
  sealed.push({ id: item.id, nonceHex: item.nonceHex, ciphertext, tag: cipher.getAuthTag() });
}

const tampered = sealed.find((item) => item.id === input.tamperId);
tampered.ciphertext[0] ^= 1;
const outcomes = [];
for (const item of sealed) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(item.nonceHex, 'hex'),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(item.tag);
  try {
    const plaintext = Buffer.concat([decipher.update(item.ciphertext), decipher.final()]).toString('utf8');
    outcomes.push({ id: item.id, status: 'decrypted', plaintextLength: plaintext.length });
  } catch {
    outcomes.push({ id: item.id, status: 'auth-failed' });
  }
}

assert.equal(sealed.length, 2);
assert.deepEqual(rejectedReplay, ['payload-3']);
assert.equal(outcomes.filter((outcome) => outcome.status === 'decrypted').length, 1);
assert.equal(outcomes.filter((outcome) => outcome.status === 'auth-failed').length, 1);
assert.equal(outcomes.find((outcome) => outcome.id === 'payload-2').status, 'auth-failed');

console.log(JSON.stringify({
  replayRejected: rejectedReplay,
  outcomes,
  acceptedEnvelopes: sealed.length,
  plaintextPrinted: false
}, null, 2));
console.log('securevault-replay-tamper: replay=1 encrypted=2 decrypted=1 auth-failed=1');
`,
      stdin: JSON.stringify({
        keyHex: '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f',
        aad: 'vault:42:key-version:3',
        tamperId: 'payload-2',
        items: [
          { id: 'payload-1', nonceHex: '0102030405060708090a0b0c', plaintext: 'first note' },
          { id: 'payload-2', nonceHex: '0d0e0f101112131415161718', plaintext: 'second note' },
          { id: 'payload-3', nonceHex: '0102030405060708090a0b0c', plaintext: 'replay attempt' },
        ],
      }),
      checkpoint:
        'payload-3 因复用 payload-1 的 nonce 被拒绝；两条可加密记录中 payload-2 被篡改，因此最终恰有 1 条成功解密、1 条认证失败，正文不打印。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 容器、CI/CD、可观测与发布': codeLab(
    'SecureVault 综合训练 09 · 制品秘密扫描与密钥兼容发布',
    '先扫描镜像、Compose 和环境样例中的秘密泄漏，再要求新旧密钥版本、两租户冒烟和审计都通过才允许发布。',
    {
      id: 'p15-securevault-09-guided-secret-scan',
      title: '跟做：扫描制品中的秘密和明文',
      brief:
        '运行 node main.js。检查五份构建产物和配置，定位私钥、实时令牌与明文密钥，输出不能进入发布的制品。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const patterns = [
  { name: 'private-key', expression: 'BEGIN PRIVATE KEY' },
  { name: 'live-token', expression: 'sk_live_' },
  { name: 'plain-key', expression: 'SECRET_KEY=' },
];

const artifacts = input.artifacts.map((artifact) => {
  const findings = patterns.filter((pattern) => artifact.content.includes(pattern.expression));
  return {
    name: artifact.name,
    findings: findings.map((finding) => finding.name),
    publishable: findings.length === 0
  };
});

assert.equal(artifacts.length, 5);
assert.equal(artifacts.filter((artifact) => artifact.publishable).length, 3);
assert.deepEqual(
  artifacts.filter((artifact) => !artifact.publishable).map((artifact) => artifact.name).sort(),
  ['compose.yaml', 'runtime.env'],
);
assert.equal(artifacts.find((artifact) => artifact.name === 'runtime.env').findings.length, 2);

console.log(JSON.stringify({
  artifacts,
  blocked: artifacts.filter((artifact) => !artifact.publishable).map((artifact) => artifact.name),
  decision: artifacts.every((artifact) => artifact.publishable) ? 'pass' : 'block'
}, null, 2));
console.log('securevault-secret-scan: artifacts=5 leaks=2 decision=block');
`,
      stdin: JSON.stringify({
        artifacts: [
          { name: 'api-image-manifest', content: 'image=securevault-api@sha256:1111 nonroot=true' },
          { name: 'kms-adapter', content: 'keyRef=kms://securevault/prod/key-5' },
          { name: 'compose.yaml', content: 'environment: SECRET_KEY=dev-secret-value' },
          { name: 'runtime.env', content: 'API_TOKEN=sk_live_abc\nTLS_KEY=-----BEGIN PRIVATE KEY-----' },
          { name: 'sbom.json', content: '{"packages":["node:crypto","node:fs"]}' },
        ],
      }),
      checkpoint:
        'compose.yaml 因 SECRET_KEY= 被阻断，runtime.env 同时包含 sk_live_ 和私钥头，因此必须报告两个 findings；其余三份制品可发布，整体决策为 block。',
    },
    {
      id: 'p15-securevault-09-independent-release-compatibility',
      title: '独立实践：密钥版本与双租户发布门禁',
      brief:
        '运行 node main.js。检查所有读服务是否兼容旧新 keyVersion、两个租户冒烟、审计写入和回滚制品，定位唯一失败项。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requiredVersions = [input.fromKeyVersion, input.toKeyVersion];
const incompatibleReaders = input.readers.filter((reader) =>
  requiredVersions.some((version) => !reader.versions.includes(version))
);
const failedSmoke = input.smokeTests.filter((test) => test.status !== 'pass');
const gates = [
  { name: 'key-version-readers', pass: incompatibleReaders.length === 0, detail: incompatibleReaders.map((reader) => reader.name) },
  { name: 'tenant-a-smoke', pass: input.smokeTests.find((test) => test.tenantId === 'tenant-a').status === 'pass' },
  { name: 'tenant-b-smoke', pass: input.smokeTests.find((test) => test.tenantId === 'tenant-b').status === 'pass' },
  { name: 'audit-writable', pass: input.auditWritable },
  { name: 'rollback-image', pass: input.rollbackImage.includes('@sha256:') },
];
const failed = gates.filter((gate) => !gate.pass);

assert.equal(incompatibleReaders.length, 0);
assert.equal(failedSmoke.length, 1);
assert.equal(failedSmoke[0].tenantId, 'tenant-b');
assert.equal(gates.filter((gate) => gate.pass).length, 4);
assert.equal(failed.length, 1);

console.log(JSON.stringify({
  gates,
  failed,
  failedSmoke,
  decision: failed.length === 0 ? 'promote' : 'hold',
  requiredKeyVersions: requiredVersions
}, null, 2));
console.log('securevault-release: gates=5 pass=4 fail=tenant-b-smoke decision=hold');
`,
      stdin: JSON.stringify({
        fromKeyVersion: 3,
        toKeyVersion: 4,
        readers: [
          { name: 'note-api', versions: [3, 4] },
          { name: 'share-service', versions: [3, 4] },
          { name: 'audit-search', versions: [3, 4] },
        ],
        smokeTests: [
          { tenantId: 'tenant-a', status: 'pass' },
          { tenantId: 'tenant-b', status: 'fail' },
        ],
        auditWritable: true,
        rollbackImage: 'registry.local/securevault-api@sha256:3333',
      }),
      checkpoint:
        '三个读服务必须同时兼容 keyVersion 3/4；tenant-a 冒烟、审计写入和回滚镜像通过，tenant-b 冒烟失败，因此最终只能 hold。',
    },
  ),

  'programming:综合训练 · SecureVault 安全笔记 · 故障演练、回滚与项目答辩': codeLab(
    'SecureVault 综合训练 10 · KMS 故障与备份恢复',
    '先验证 KMS 不可用时所有敏感写入失败关闭，再恢复密文备份并确认已撤销分享、nonce 和篡改检测不会被回滚破坏。',
    {
      id: 'p15-securevault-10-guided-fail-closed',
      title: '跟做：KMS 中断时保持失败关闭',
      brief:
        '运行 node main.js。在 KMS、网络和审计分别故障时执行四笔操作，任何依赖不可用都拒绝而不是退回明文。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = input.operations.map((operation) => {
  const reasons = [];
  if (!operation.kmsAvailable) reasons.push('kms-down');
  if (!operation.networkAvailable) reasons.push('network-down');
  if (!operation.auditAvailable) reasons.push('audit-down');
  return {
    id: operation.id,
    action: operation.action,
    committed: reasons.length === 0,
    externalStatus: reasons.length === 0 ? 201 : 503,
    reasons,
    plaintextFallback: false
  };
});

assert.equal(results.filter((result) => result.committed).length, 1);
assert.equal(results.filter((result) => result.externalStatus === 503).length, 3);
assert.deepEqual(results.find((result) => result.id === 'op-2').reasons, ['kms-down']);
assert.deepEqual(results.find((result) => result.id === 'op-4').reasons, ['audit-down']);
assert.ok(results.every((result) => result.plaintextFallback === false));

console.log(JSON.stringify({
  results,
  committed: results.filter((result) => result.committed).map((result) => result.id),
  denied: results.filter((result) => !result.committed).map((result) => result.id),
  dataLossRisk: 'none-for-ciphertext',
  plaintextFallback: false
}, null, 2));
console.log('securevault-kms-outage: committed=1 denied=3 fallback=false');
`,
      stdin: JSON.stringify({
        operations: [
          { id: 'op-1', action: 'read-note', kmsAvailable: true, networkAvailable: true, auditAvailable: true },
          { id: 'op-2', action: 'write-note', kmsAvailable: false, networkAvailable: true, auditAvailable: true },
          { id: 'op-3', action: 'share-note', kmsAvailable: true, networkAvailable: false, auditAvailable: true },
          { id: 'op-4', action: 'revoke-share', kmsAvailable: true, networkAvailable: true, auditAvailable: false },
        ],
      }),
      checkpoint:
        '只有 op-1 成功；KMS、网络和审计故障分别拒绝写入、分享和撤权，全部失败必须是 503 且 plaintextFallback=false，不能因 KMS 中断保存明文。',
    },
    {
      id: 'p15-securevault-10-independent-backup-restore',
      title: '独立实践：恢复密文备份并保留撤销状态',
      brief:
        '运行 node main.js。校验密文 SHA-256，在临时目录恢复有效对象和备份索引，拒绝篡改对象并保证已撤销分享不会复活。',
      code: String.raw`'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-restore-'));

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

try {
  const restoreDir = path.join(root, 'restore');
  fs.mkdirSync(restoreDir);
  const noteResults = input.notes.map((note) => {
    const actual = digest(note.ciphertext);
    const valid = actual === note.checksum;
    if (valid) {
      fs.writeFileSync(
        path.join(restoreDir, note.id + '.json'),
        JSON.stringify({
          id: note.id,
          ciphertext: note.ciphertext,
          nonce: note.nonce,
          keyVersion: note.keyVersion,
          checksum: actual,
        }, null, 2),
      );
    }
    return { id: note.id, valid, actual };
  });
  const shareResults = input.shares.map((share) => ({
    id: share.id,
    status: share.revokedAt ? 'revoked' : 'active',
    restored: !share.revokedAt,
  }));
  const restoredFiles = fs.readdirSync(restoreDir);
  const audit = {
    action: 'backup-restore',
    restoredNotes: restoredFiles.length,
    rejectedNotes: noteResults.filter((result) => !result.valid).map((result) => result.id),
    revokedSharesPreserved: shareResults.filter((share) => share.status === 'revoked').length,
  };
  fs.writeFileSync(path.join(root, 'restore-audit.json'), JSON.stringify(audit, null, 2));
  const persistedAudit = JSON.parse(fs.readFileSync(path.join(root, 'restore-audit.json'), 'utf8'));

  assert.equal(restoredFiles.length, 2);
  assert.equal(noteResults.filter((result) => !result.valid).length, 1);
  assert.equal(persistedAudit.rejectedNotes[0], 'note-3');
  assert.equal(persistedAudit.revokedSharesPreserved, 1);
  assert.equal(shareResults.find((share) => share.id === 'share-1').restored, false);

  console.log(JSON.stringify({
    noteResults,
    shareResults,
    restoredFiles,
    audit: persistedAudit,
    decision: 'restore-complete-with-revocations'
  }, null, 2));
  console.log('securevault-restore: notes=2 rejected=1 revoked-share-preserved=1');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      stdin: JSON.stringify({
        notes: [
          {
            id: 'note-1',
            ciphertext: 'cipher-alpha',
            nonce: 'nonce-a',
            keyVersion: 3,
            checksum: 'dad42cb10f28cb9f6a1a10904b1d70be9d64062dbc041084cb9d7b232be49a4a',
          },
          {
            id: 'note-2',
            ciphertext: 'cipher-beta',
            nonce: 'nonce-b',
            keyVersion: 3,
            checksum: '8d5f661d99ed016c21b681ad0132b5f1422d8e6b6adc1119096dccc8a1242007',
          },
          {
            id: 'note-3',
            ciphertext: 'cipher-tampered',
            nonce: 'nonce-c',
            keyVersion: 3,
            checksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          },
        ],
        shares: [
          { id: 'share-1', revokedAt: '2026-11-24T09:00:00Z' },
          { id: 'share-2', revokedAt: null },
        ],
      }),
      checkpoint:
        '只恢复 SHA-256 校验通过的 note-1、note-2，note-3 必须进入 rejectedNotes；share-1 必须保持 revoked 且不恢复，share-2 可保持 active。恢复审计必须落盘。',
    },
  ),
};
