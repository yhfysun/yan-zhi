import type { LearningV2CodeLab } from './v2-types.js';

/**
 * P15 综合训练第四阶段：Nimbus 预约票务与 LogForge 日志采集器。
 *
 * 所有外部队列与数据库都以确定性内存适配器模拟。任务真正执行 Node.js
 * 标准库代码并读取 stdin，不把尚未启动的 PostgreSQL、Redis 或 Kafka
 * 伪装成在线依赖。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库与确定性内存适配器',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装第三方依赖。',
    'stdin 是任务样例 JSON；先运行跟做代码，核对退出码与断言输出。',
    '再完成独立实践，并保存输出中的不变量、数量和恢复范围作为项目证据。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_P15_NIMBUS_LOGFORGE: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:综合训练 · Nimbus 预约票务 · 业务理解与用户任务': {
    title: 'Nimbus 代码台 01 · 把角色任务和操作权限对齐',
    description:
      '读取顾客、运营、客服和 SRE 的任务，按角色能力路由预约操作；未授权动作必须被拒绝并保留可解释原因。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-role-routing-guided',
      title: '跟做：按角色能力路由预约任务',
      brief:
        '运行 node main.js。读取角色、能力和任务，生成可执行与拒绝清单，并确认只有运营能执行容量调整。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const routes = [];
const rejected = [];

for (const role of input.roles) {
  const capabilities = new Set(role.capabilities);
  for (const task of role.tasks) {
    const allowed = capabilities.has(task.action);
    const item = {
      role: role.id,
      task: task.id,
      action: task.action,
      priority: task.priority,
      status: allowed ? 'routed' : 'rejected'
    };
    if (allowed) routes.push(item);
    else rejected.push({ ...item, reason: 'CAPABILITY_MISSING' });
  }
}

routes.sort((left, right) => right.priority - left.priority || left.task.localeCompare(right.task));

assert.equal(routes.find((item) => item.task === 'adjust-window').role, 'ops');
assert.equal(rejected.length, 1);
assert.equal(rejected[0].task, 'issue-refund');
assert.equal(rejected[0].reason, 'CAPABILITY_MISSING');

console.log(JSON.stringify({
  routed: routes.map((item) => item.role + ':' + item.task),
  rejected,
  highestPriority: routes[0].task
}, null, 2));
`,
      },
      stdin:
        '{"roles":[{"id":"customer","capabilities":["browse","reserve","cancel-own"],"tasks":[{"id":"pick-slot","action":"browse","priority":2},{"id":"reserve-seat","action":"reserve","priority":5},{"id":"issue-refund","action":"refund","priority":4}]},{"id":"ops","capabilities":["adjust-capacity"],"tasks":[{"id":"adjust-window","action":"adjust-capacity","priority":5}]}]}',
      checkpoint:
        '输出中 adjust-window 必须路由给 ops，issue-refund 必须被拒绝且原因是 CAPABILITY_MISSING，最高优先级任务为 adjust-window，退出码为 0。角色名称本身不能替代能力校验。',
    },
    apply: {
      id: 'p15-nimbus-risk-gate-independent',
      title: '独立实践：用风险分数决定首版是否放行',
      brief:
        '运行 node main.js。根据可能性、影响和缓解状态计算预约业务风险，阻止存在未缓解高危项的首版发布。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const scored = input.scenarios.map((scenario) => {
  const score = scenario.likelihood * scenario.impact;
  return {
    id: scenario.id,
    score,
    blocked: !scenario.mitigated && score >= input.blockThreshold
  };
}).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

const blocked = scored.filter((scenario) => scenario.blocked);
const releaseAllowed = blocked.length === 0;

assert.equal(scored[0].id, 'oversell-last-seat');
assert.equal(scored[0].score, 25);
assert.equal(releaseAllowed, false);
assert.deepEqual(blocked.map((scenario) => scenario.id), [
  'oversell-last-seat',
  'unknown-payment'
]);

console.log(JSON.stringify({
  releaseAllowed,
  blocked,
  topRisk: scored[0],
  requiredAction: releaseAllowed ? 'release' : 'mitigate-before-release'
}, null, 2));
`,
      },
      stdin:
        '{"blockThreshold":15,"scenarios":[{"id":"oversell-last-seat","likelihood":5,"impact":5,"mitigated":false},{"id":"unknown-payment","likelihood":3,"impact":5,"mitigated":false},{"id":"timezone-display","likelihood":2,"impact":4,"mitigated":true}]}',
      checkpoint:
        'releaseAllowed 必须为 false；blocked 必须依次包含 oversell-last-seat 和 unknown-payment；topRisk.score 为 25。只写“有风险”不算完成，每个高危项都要有量化分数和放行阻断结果。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 范围、验收与非功能目标': {
    title: 'Nimbus 代码台 02 · 最后一张票与验收覆盖',
    description:
      '先用原子条件更新验证最后一张票只能成功一次，再检查预约、支付、取消和退款状态是否被验收矩阵覆盖。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-last-seat-guided',
      title: '跟做：最后一张票的最终账实',
      brief:
        '运行 node main.js。模拟多个请求争抢同一时段，检查成功数、幂等重放数、冲突数以及库存不变量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const inventory = new Map(input.slots.map((slot) => [slot.id, { ...slot }]));
const byIdempotencyKey = new Map();
const reservations = [];

function reserve(request) {
  const identity = request.userId + ':' + request.idempotencyKey;
  const existing = byIdempotencyKey.get(identity);
  if (existing) return { outcome: 'replayed', reservation: existing };

  const slot = inventory.get(request.slotId);
  if (!slot || slot.available <= 0) return { outcome: 'conflict', reason: 'SOLD_OUT' };

  slot.available -= 1;
  const reservation = {
    id: 'r-' + (reservations.length + 1),
    slotId: slot.id,
    userId: request.userId,
    state: 'pending_payment'
  };
  byIdempotencyKey.set(identity, reservation);
  reservations.push(reservation);
  return { outcome: 'created', reservation };
}

const results = input.requests.map(reserve);
const counts = Object.fromEntries(
  ['created', 'replayed', 'conflict'].map((outcome) => [
    outcome,
    results.filter((result) => result.outcome === outcome).length
  ])
);

assert.deepEqual(counts, { created: 1, replayed: 1, conflict: 1 });
assert.equal(inventory.get('slot-final').available, 0);
assert.equal(reservations.length, 1);
assert.equal(reservations[0].state, 'pending_payment');
assert.ok(inventory.get('slot-final').available >= 0);

console.log(JSON.stringify({
  counts,
  finalInventory: [...inventory.values()],
  reservations,
  invariant: 'available>=0 and created=capacity'
}, null, 2));
`,
      },
      stdin:
        '{"slots":[{"id":"slot-final","capacity":1,"available":1}],"requests":[{"userId":"u1","idempotencyKey":"k1","slotId":"slot-final"},{"userId":"u1","idempotencyKey":"k1","slotId":"slot-final"},{"userId":"u2","idempotencyKey":"k2","slotId":"slot-final"}]}',
      checkpoint:
        'counts 必须恰好是 created=1、replayed=1、conflict=1；最终 available=0，预约状态为 pending_payment。重复请求返回原预约而不是再次扣库存，库存也绝不能变成负数。',
    },
    apply: {
      id: 'p15-nimbus-acceptance-matrix-independent',
      title: '独立实践：找出验收矩阵缺口',
      brief:
        '运行 node main.js。把功能与票务状态组成组合，列出已覆盖、缺失和整体覆盖率，避免只测试成功付款路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = [];
for (const operation of input.operations) {
  for (const state of input.states) required.push(operation + ':' + state);
}

const covered = new Set(input.covered);
const missing = required.filter((entry) => !covered.has(entry));
const unexpected = input.covered.filter((entry) => !required.includes(entry));
const attempted = required.filter((entry) => covered.has(entry)).length;
const coverageRatio = Number((attempted / required.length).toFixed(2));

assert.equal(required.length, 16);
assert.equal(attempted, 13);
assert.equal(coverageRatio, 0.81);
assert.ok(missing.includes('cancel:refunded'));
assert.ok(missing.includes('retry:cancelled'));
assert.deepEqual(unexpected, []);

console.log(JSON.stringify({
  coverageRatio,
  missing,
  unexpected,
  releaseGate: missing.length === 0 ? 'open' : 'blocked'
}, null, 2));
`,
      },
      stdin:
        '{"operations":["reserve","pay","cancel","retry"],"states":["pending_payment","confirmed","cancelled","refunded"],"covered":["reserve:pending_payment","reserve:confirmed","reserve:cancelled","reserve:refunded","pay:pending_payment","pay:confirmed","pay:cancelled","pay:refunded","cancel:pending_payment","cancel:confirmed","cancel:cancelled","retry:pending_payment","retry:confirmed"]}',
      checkpoint:
        '覆盖率必须为 0.81，缺口必须包含 cancel:refunded 与 retry:cancelled，releaseGate 必须为 blocked。验收矩阵不能只做“支付成功”，还要覆盖取消失败与重试后的退款边界。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · API 契约与前端数据边界': {
    title: 'Nimbus 代码台 03 · 幂等响应与错误恢复契约',
    description:
      '在服务端重放同一请求，区分成功、同键同文、同键异文和状态动作；再检查 HTTP 操作是否声明幂等与可恢复错误。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-idempotency-contract-guided',
      title: '跟做：同键同文复用，异文返回冲突',
      brief:
        '运行 node main.js。根据用户、幂等键和请求摘要处理创建预约，再处理一次取消，输出四类结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const stored = new Map();
const reservations = new Map();
const responses = [];

for (const request of input.requests) {
  if (request.operation === 'create') {
    const identity = request.actor + ':' + request.key;
    const previous = stored.get(identity);
    if (previous && previous.bodyHash !== request.bodyHash) {
      responses.push({ code: 409, codeName: 'IDEMPOTENCY_MISMATCH' });
      continue;
    }
    if (previous) {
      responses.push({ code: 200, codeName: 'IDEMPOTENT_REPLAY', reservationId: previous.reservationId });
      continue;
    }
    const reservationId = 'r-' + (stored.size + 1);
    stored.set(identity, { bodyHash: request.bodyHash, reservationId });
    reservations.set(reservationId, 'pending_payment');
    responses.push({ code: 201, codeName: 'CREATED', reservationId });
    continue;
  }

  if (request.operation === 'cancel') {
    const current = reservations.get(request.reservationId);
    if (!current) {
      responses.push({ code: 404, codeName: 'RESERVATION_NOT_FOUND' });
    } else if (current === 'cancelled') {
      responses.push({ code: 200, codeName: 'ALREADY_CANCELLED' });
    } else {
      reservations.set(request.reservationId, 'cancelled');
      responses.push({ code: 200, codeName: 'CANCELLED' });
    }
  }
}

assert.deepEqual(responses.map((response) => response.codeName), [
  'CREATED',
  'IDEMPOTENT_REPLAY',
  'IDEMPOTENCY_MISMATCH',
  'CANCELLED',
  'ALREADY_CANCELLED'
]);
assert.equal(stored.size, 1);
assert.equal(reservations.get('r-1'), 'cancelled');

console.log(JSON.stringify({ responses, finalState: [...reservations] }, null, 2));
`,
      },
      stdin:
        '{"requests":[{"operation":"create","actor":"u1","key":"k1","bodyHash":"slot-a"},{"operation":"create","actor":"u1","key":"k1","bodyHash":"slot-a"},{"operation":"create","actor":"u1","key":"k1","bodyHash":"slot-b"},{"operation":"cancel","reservationId":"r-1"},{"operation":"cancel","reservationId":"r-1"}]}',
      checkpoint:
        '响应顺序必须是 CREATED、IDEMPOTENT_REPLAY、IDEMPOTENCY_MISMATCH、CANCELLED、ALREADY_CANCELLED；最终预约为 cancelled。同键不同正文必须被拒绝，而不是悄悄复用旧结果。',
    },
    apply: {
      id: 'p15-nimbus-http-contract-audit-independent',
      title: '独立实践：审计预约 API 的恢复语义',
      brief:
        '运行 node main.js。检查创建、支付回调、取消和余票查询是否声明幂等、合法状态码与重试边界，输出可执行修复项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const issues = [];

for (const operation of input.operations) {
  if (['POST', 'DELETE'].includes(operation.method) && !operation.idempotent) {
    issues.push({ path: operation.path, code: 'IDEMPOTENCY_UNDECLARED' });
  }
  if (operation.mutatesState && !operation.errors.includes(409)) {
    issues.push({ path: operation.path, code: 'CONFLICT_NOT_DECLARED' });
  }
  if (operation.path.includes('/payments/') && !operation.errors.includes(503)) {
    issues.push({ path: operation.path, code: 'DEPENDENCY_RETRY_NOT_DECLARED' });
  }
  if (operation.path.includes('/availability') && operation.cacheable !== true) {
    issues.push({ path: operation.path, code: 'QUERY_CACHE_POLICY_MISSING' });
  }
}

assert.deepEqual(issues, [
  { path: '/payments/callback', code: 'IDEMPOTENCY_UNDECLARED' },
  { path: '/payments/callback', code: 'DEPENDENCY_RETRY_NOT_DECLARED' }
]);

console.log(JSON.stringify({
  contractStatus: issues.length === 0 ? 'valid' : 'needs-fix',
  issues,
  repairOrder: issues.map((issue) => issue.path + '#' + issue.code)
}, null, 2));
`,
      },
      stdin:
        '{"operations":[{"path":"/reservations","method":"POST","idempotent":true,"mutatesState":true,"errors":[409,422]},{"path":"/payments/callback","method":"POST","idempotent":false,"mutatesState":true,"errors":[409,422]},{"path":"/reservations/{id}","method":"DELETE","idempotent":true,"mutatesState":true,"errors":[404,409]},{"path":"/availability","method":"GET","idempotent":true,"mutatesState":false,"errors":[429],"cacheable":true}]}',
      checkpoint:
        'issues 必须恰好指向支付回调的 IDEMPOTENCY_UNDECLARED 与 DEPENDENCY_RETRY_NOT_DECLARED，contractStatus 为 needs-fix。错误码要支持恢复，不能在支付结果未知时混成普通失败。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 数据模型、约束与迁移': {
    title: 'Nimbus 代码台 04 · 条件更新与数据迁移对账',
    description:
      '用内存仓储模拟数据库条件更新、唯一幂等键与事务回滚，再把旧库存字段迁移为可核对的可用、预占和已确认数量。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-conditional-reserve-guided',
      title: '跟做：条件 UPDATE 阻止超卖',
      brief:
        '运行 node main.js。在内存表中以“余量大于零”为条件写入，再插入预约；检查重复键、售罄冲突和库存版本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const inventory = new Map(input.inventory.map((row) => [row.slotId, { ...row }]));
const idempotency = new Map();
const reservations = [];

function conditionalInsert(request) {
  const identity = request.userId + ':' + request.key;
  if (idempotency.has(identity)) return { type: 'duplicate', reservationId: idempotency.get(identity) };

  const row = inventory.get(request.slotId);
  if (!row || row.available <= 0) return { type: 'conflict', reason: 'CONDITION_NOT_MET' };

  row.available -= 1;
  row.pending += 1;
  row.version += 1;
  const reservation = { id: 'res-' + (reservations.length + 1), slotId: row.slotId, state: 'pending_payment' };
  reservations.push(reservation);
  idempotency.set(identity, reservation.id);
  return { type: 'inserted', reservation };
}

const outcomes = input.requests.map(conditionalInsert);
assert.deepEqual(outcomes.map((outcome) => outcome.type), ['inserted', 'duplicate', 'conflict']);
assert.deepEqual(inventory.get('slot-1'), {
  slotId: 'slot-1',
  available: 0,
  pending: 1,
  confirmed: 0,
  version: 8
});
assert.equal(reservations.length, 1);

console.log(JSON.stringify({
  outcomes: outcomes.map((outcome) => outcome.type),
  inventory: [...inventory.values()],
  reservation: reservations[0]
}, null, 2));
`,
      },
      stdin:
        '{"inventory":[{"slotId":"slot-1","available":1,"pending":0,"confirmed":0,"version":7}],"requests":[{"userId":"u1","key":"k1","slotId":"slot-1"},{"userId":"u1","key":"k1","slotId":"slot-1"},{"userId":"u2","key":"k2","slotId":"slot-1"}]}',
      checkpoint:
        '结果顺序必须是 inserted、duplicate、conflict；最终 available=0、pending=1、version=8，只有一条预约。条件判断和扣减必须发生在同一次原子写入中。',
    },
    apply: {
      id: 'p15-nimbus-inventory-migration-independent',
      title: '独立实践：迁移旧库存并核对账实',
      brief:
        '运行 node main.js。把旧的本地时间、剩余数和订单状态迁移成 UTC 时间及 available/pending/confirmed，报告无法对账的记录。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const slotIds = new Set();
const migrated = [];
const exceptions = [];

for (const legacy of input.legacySlots) {
  const available = legacy.capacity - legacy.orders.pending - legacy.orders.confirmed;
  const duplicateId = slotIds.has(legacy.id);
  if (duplicateId || available < 0) {
    exceptions.push({
      id: legacy.id,
      reason: duplicateId ? 'DUPLICATE_SLOT_ID' : 'NEGATIVE_AVAILABLE'
    });
    continue;
  }
  slotIds.add(legacy.id);
  migrated.push({
    id: legacy.id,
    startsAtUtc: new Date(legacy.startsAtLocal).toISOString(),
    capacity: legacy.capacity,
    available,
    pending: legacy.orders.pending,
    confirmed: legacy.orders.confirmed
  });
}

const totals = migrated.reduce((sum, row) => ({
  capacity: sum.capacity + row.capacity,
  available: sum.available + row.available,
  pending: sum.pending + row.pending,
  confirmed: sum.confirmed + row.confirmed
}), { capacity: 0, available: 0, pending: 0, confirmed: 0 });

assert.equal(migrated[0].startsAtUtc, '2026-11-24T18:00:00.000Z');
assert.equal(migrated.length, 2);
assert.deepEqual(exceptions, [{ id: 'slot-broken', reason: 'NEGATIVE_AVAILABLE' }]);
assert.deepEqual(totals, { capacity: 12, available: 6, pending: 2, confirmed: 4 });
assert.equal(totals.capacity, totals.available + totals.pending + totals.confirmed);

console.log(JSON.stringify({ migrated, exceptions, totals }, null, 2));
`,
      },
      stdin:
        '{"legacySlots":[{"id":"slot-a","startsAtLocal":"2026-11-24T10:00:00-08:00","capacity":8,"orders":{"pending":1,"confirmed":3}},{"id":"slot-broken","startsAtLocal":"2026-11-25T10:00:00Z","capacity":2,"orders":{"pending":1,"confirmed":2}},{"id":"slot-c","startsAtLocal":"2026-11-25T20:00:00+08:00","capacity":4,"orders":{"pending":1,"confirmed":1}}]}',
      checkpoint:
        '迁移后两条有效时段、总容量 12、可用 6、预占 2、已确认 4，且容量等于三项之和；slot-broken 必须以 NEGATIVE_AVAILABLE 进入异常清单。迁移不能掩盖负库存。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 项目骨架、模块边界与本地环境': {
    title: 'Nimbus 代码台 05 · 模块启动顺序与就绪判定',
    description:
      '先根据领域、仓储和 HTTP 依赖排出无环启动顺序，再检查配置、迁移与可选依赖，区分可接流量与降级运行。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-module-order-guided',
      title: '跟做：按依赖排出模块启动图',
      brief:
        '运行 node main.js。读取 Nimbus 模块依赖，做拓扑排序并检测循环；HTTP 适配器必须晚于预约领域服务。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const byName = new Map(input.modules.map((module) => [module.name, module]));
const visiting = new Set();
const visited = new Set();
const order = [];

function visit(name) {
  if (visiting.has(name)) throw new Error('CYCLE_AT:' + name);
  if (visited.has(name)) return;
  visiting.add(name);
  const module = byName.get(name);
  if (!module) throw new Error('MISSING_MODULE:' + name);
  for (const dependency of module.dependsOn) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  order.push(name);
}

for (const module of input.modules) visit(module.name);

assert.deepEqual(order, ['config', 'clock', 'reservation-domain', 'postgres-repository', 'redis-cache', 'http-api']);
assert.ok(order.indexOf('reservation-domain') < order.indexOf('http-api'));
assert.ok(order.indexOf('postgres-repository') < order.indexOf('http-api'));

console.log(JSON.stringify({
  startupOrder: order,
  boundary: 'http isolates domain and adapters',
  acyclic: true
}, null, 2));
`,
      },
      stdin:
        '{"modules":[{"name":"http-api","dependsOn":["reservation-domain","postgres-repository","redis-cache","config"]},{"name":"reservation-domain","dependsOn":["clock"]},{"name":"postgres-repository","dependsOn":["config"]},{"name":"redis-cache","dependsOn":["config"]},{"name":"clock","dependsOn":["config"]},{"name":"config","dependsOn":[]}]}',
      checkpoint:
        'startupOrder 必须恰好为 config、clock、reservation-domain、postgres-repository、redis-cache、http-api，acyclic 为 true。HTTP 路由不能先于领域和仓储启动，也不能把循环依赖留给运行时。',
    },
    apply: {
      id: 'p15-nimbus-readiness-degrade-independent',
      title: '独立实践：区分未就绪与可降级运行',
      brief:
        '运行 node main.js。验证必需配置、迁移状态和依赖可用性，输出 readiness、阻塞原因与 Redis/Kafka 降级项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const blockers = [];
const degraded = [];

for (const name of input.requiredVariables) {
  if (!input.environment[name]) blockers.push('MISSING_CONFIG:' + name);
}
if (input.migrationsPending !== 0) blockers.push('MIGRATIONS_PENDING:' + input.migrationsPending);
for (const dependency of input.dependencies) {
  if (dependency.up) continue;
  if (dependency.required) blockers.push('REQUIRED_DEPENDENCY_DOWN:' + dependency.name);
  else degraded.push(dependency.name);
}

const readiness = blockers.length === 0 ? 'ready' : 'not-ready';
const mode = readiness === 'ready' && degraded.length > 0 ? 'serve-degraded' : readiness;
const secretPreview = Object.fromEntries(
  Object.entries(input.environment)
    .filter(([name]) => name !== 'DATABASE_URL')
    .map(([name, value]) => [name, value])
);

assert.equal(readiness, 'ready');
assert.equal(mode, 'serve-degraded');
assert.deepEqual(degraded.sort(), ['kafka', 'redis']);
assert.deepEqual(blockers, []);
assert.equal(secretPreview.DATABASE_URL, undefined);

console.log(JSON.stringify({
  readiness,
  mode,
  blockers,
  degraded: degraded.sort(),
  secretPreview
}, null, 2));
`,
      },
      stdin:
        '{"requiredVariables":["DATABASE_URL","REDIS_URL","KAFKA_BROKERS"],"environment":{"DATABASE_URL":"postgres://secret","REDIS_URL":"redis://cache:6379","KAFKA_BROKERS":"kafka:9092"},"migrationsPending":0,"dependencies":[{"name":"postgres","required":true,"up":true},{"name":"redis","required":false,"up":false},{"name":"kafka","required":false,"up":false}]}',
      checkpoint:
        'readiness 必须为 ready，mode 为 serve-degraded，degraded 仅含 kafka 与 redis；DATABASE_URL 不能出现在 secretPreview。liveness 与 readiness 不能混为同一个依赖判断。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 后端核心链路与异常恢复': {
    title: 'Nimbus 代码台 06 · 原子事务、支付回调与超时竞争',
    description:
      '先让库存更新、预约插入和 Outbox 在同一内存事务提交或一起回滚，再验证未知支付、超时扫描和重复回调只能改变一次状态。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-transaction-outbox-guided',
      title: '跟做：预约失败时整体回滚',
      brief:
        '运行 node main.js。第一笔预约提交库存、预约和 Outbox；第二笔故意失败，必须恢复事务快照且不留下消息。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const committed = {
  stock: input.initialStock,
  reservations: [],
  outbox: []
};
const committedIdempotency = new Set();
const attempts = [];

function runTransaction(request) {
  if (committedIdempotency.has(request.key)) {
    return { outcome: 'replayed', id: request.key };
  }
  const snapshot = structuredClone(committed);
  try {
    if (request.forceFailure) throw new Error('SIMULATED_INSERT_FAILURE');
    if (committed.stock < request.quantity) throw new Error('CONDITION_NOT_MET');
    committed.stock -= request.quantity;
    committed.reservations.push({
      id: request.key,
      state: 'pending_payment',
      quantity: request.quantity
    });
    committed.outbox.push({
      type: 'reservation.created',
      reservationId: request.key
    });
    committedIdempotency.add(request.key);
    return { outcome: 'committed', id: request.key };
  } catch (error) {
    Object.assign(committed, snapshot);
    return { outcome: 'rolled-back', reason: error.message };
  }
}

for (const request of input.requests) attempts.push(runTransaction(request));

assert.deepEqual(attempts, [
  { outcome: 'committed', id: 'reservation-a' },
  { outcome: 'rolled-back', reason: 'SIMULATED_INSERT_FAILURE' }
]);
assert.equal(committed.stock, 2);
assert.equal(committed.reservations.length, 1);
assert.equal(committed.outbox.length, 1);
assert.equal(committed.outbox[0].reservationId, 'reservation-a');

console.log(JSON.stringify({ attempts, committed }, null, 2));
`,
      },
      stdin:
        '{"initialStock":3,"requests":[{"key":"reservation-a","quantity":1,"forceFailure":false},{"key":"reservation-b","quantity":1,"forceFailure":true}]}',
      checkpoint:
        '第一笔必须 committed，第二笔必须 rolled-back 且原因是 SIMULATED_INSERT_FAILURE；最终 stock=2、reservations=1、outbox=1。库存、预约和消息不能留下半完成状态。',
    },
    apply: {
      id: 'p15-nimbus-payment-timeout-race-independent',
      title: '独立实践：支付未知、查询确认与超时竞争',
      brief:
        '运行 node main.js。按事件顺序处理支付未知、查询成功、超时扫描和重复回调；未知结果不能提前释放库存。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const reservation = {
  id: 'r-1',
  state: 'pending_payment',
  paymentState: 'unknown',
  version: 1,
  reservedStock: 1
};
const processedPaymentIds = new Set();
const journal = [];

for (const event of input.events) {
  if (event.type === 'payment_unknown') {
    reservation.paymentState = 'unknown';
    journal.push({ event: event.type, action: 'keep-reservation' });
    continue;
  }
  if (event.type === 'payment_query') {
    if (reservation.state !== 'pending_payment') {
      journal.push({ event: event.type, action: 'ignore-terminal-state' });
    } else if (event.outcome === 'succeeded') {
      reservation.state = 'confirmed';
      reservation.paymentState = 'paid';
      reservation.version += 1;
      reservation.reservedStock = 0;
      processedPaymentIds.add(event.paymentId);
      journal.push({ event: event.type, action: 'confirm-once' });
    }
    continue;
  }
  if (event.type === 'timeout_scan') {
    if (reservation.state === 'pending_payment' && reservation.paymentState !== 'unknown') {
      reservation.state = 'cancelled';
      reservation.version += 1;
      reservation.reservedStock = 0;
      journal.push({ event: event.type, action: 'release-stock' });
    } else {
      journal.push({ event: event.type, action: 'skip-non-expired-or-unknown' });
    }
    continue;
  }
  if (event.type === 'payment_succeeded') {
    if (processedPaymentIds.has(event.paymentId)) {
      journal.push({ event: event.type, action: 'deduplicate' });
    } else if (reservation.state === 'pending_payment') {
      reservation.state = 'confirmed';
      reservation.version += 1;
      reservation.reservedStock = 0;
      processedPaymentIds.add(event.paymentId);
      journal.push({ event: event.type, action: 'confirm' });
    }
  }
}

assert.equal(reservation.state, 'confirmed');
assert.equal(reservation.version, 2);
assert.equal(reservation.reservedStock, 0);
assert.equal(processedPaymentIds.size, 1);
assert.deepEqual(journal.map((entry) => entry.action), [
  'keep-reservation',
  'confirm-once',
  'skip-non-expired-or-unknown',
  'deduplicate'
]);

console.log(JSON.stringify({ reservation, journal }, null, 2));
`,
      },
      stdin:
        '{"events":[{"type":"payment_unknown","at":100},{"type":"payment_query","paymentId":"pay-1","outcome":"succeeded","at":101},{"type":"timeout_scan","at":102},{"type":"payment_succeeded","paymentId":"pay-1","at":103}]}',
      checkpoint:
        '最终预约必须 confirmed、version=2、reservedStock=0，且 journal 动作依次为 keep-reservation、confirm-once、skip-non-expired-or-unknown、deduplicate。未知支付不能被超时扫描误释放。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 前端页面、状态与可访问交互': {
    title: 'Nimbus 代码台 07 · 服务端状态驱动页面与键盘审计',
    description:
      '用服务端快照驱动时段选择、支付确认、取消和重试界面，再检查按钮名称、触控尺寸、焦点与动态状态播报。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-ui-state-machine-guided',
      title: '跟做：倒计时结束不等于支付失败',
      brief:
        '运行 node main.js。依次处理选中时段、提交预约、倒计时结束和查询结果，输出页面视图与允许动作。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const state = {
  view: 'slot-selection',
  selectedSlot: null,
  reservationId: null,
  serverState: null,
  message: ''
};
const transitions = [];

for (const event of input.events) {
  if (event.type === 'select-slot') {
    state.selectedSlot = event.slotId;
    state.view = 'checkout';
    state.message = 'ready-to-submit';
  } else if (event.type === 'submit') {
    state.reservationId = event.reservationId;
    state.serverState = event.serverState;
    state.view = 'payment-pending';
    state.message = 'awaiting-server-confirmation';
  } else if (event.type === 'countdown-end') {
    state.view = 'payment-checking';
    state.message = 'checking-unknown-result';
  } else if (event.type === 'query-result') {
    state.serverState = event.serverState;
    state.view = event.serverState === 'confirmed' ? 'confirmed' : 'needs-attention';
    state.message = event.serverState === 'confirmed' ? 'reservation-confirmed' : 'contact-support';
  }
  transitions.push({
    event: event.type,
    view: state.view,
    serverState: state.serverState
  });
}

const actions = {
  canCancel: state.view === 'confirmed',
  canRetryPayment: state.view === 'needs-attention',
  canSelectAnotherSlot: state.view === 'needs-attention'
};

assert.equal(state.view, 'confirmed');
assert.equal(state.message, 'reservation-confirmed');
assert.deepEqual(actions, {
  canCancel: true,
  canRetryPayment: false,
  canSelectAnotherSlot: false
});
assert.equal(transitions[2].view, 'payment-checking');

console.log(JSON.stringify({ state, actions, transitions }, null, 2));
`,
      },
      stdin:
        '{"events":[{"type":"select-slot","slotId":"slot-1"},{"type":"submit","reservationId":"r-1","serverState":"pending_payment"},{"type":"countdown-end"},{"type":"query-result","serverState":"confirmed"}]}',
      checkpoint:
        '最终视图必须为 confirmed，可取消但不能重试；倒计时结束时中间视图必须是 payment-checking。前端不能在本地倒计时结束后自行把预约判成失败。',
    },
    apply: {
      id: 'p15-nimbus-accessibility-audit-independent',
      title: '独立实践：找出移动端关键交互障碍',
      brief:
        '运行 node main.js。检查时段按钮、取消确认、错误提示和实时余量的可访问名称、触控尺寸、焦点与 aria-live。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const violations = [];

for (const element of input.elements) {
  if (element.interactive && (!element.name || element.name.trim() === '')) {
    violations.push({ id: element.id, code: 'MISSING_ACCESSIBLE_NAME' });
  }
  if (element.interactive && element.touchWidth < input.minimumTouchTarget) {
    violations.push({ id: element.id, code: 'TOUCH_TARGET_TOO_SMALL' });
  }
  if (element.dynamicStatus && element.ariaLive !== 'polite') {
    violations.push({ id: element.id, code: 'STATUS_NOT_ANNOUNCED' });
  }
  if (element.modal && element.initialFocus !== 'cancel-heading') {
    violations.push({ id: element.id, code: 'FOCUS_NOT_MOVED_TO_MODAL' });
  }
}

assert.deepEqual(violations, [
  { id: 'retry-payment', code: 'MISSING_ACCESSIBLE_NAME' },
  { id: 'slot-chip-3', code: 'TOUCH_TARGET_TOO_SMALL' },
  { id: 'inventory-live', code: 'STATUS_NOT_ANNOUNCED' }
]);
assert.equal(violations.length, 3);

console.log(JSON.stringify({
  auditStatus: violations.length === 0 ? 'pass' : 'fix-required',
  violations,
  mobileMinimum: input.minimumTouchTarget
}, null, 2));
`,
      },
      stdin:
        '{"minimumTouchTarget":44,"elements":[{"id":"reserve-button","interactive":true,"name":"确认预约","touchWidth":48},{"id":"retry-payment","interactive":true,"name":"","touchWidth":48},{"id":"slot-chip-3","interactive":true,"name":"19:30，余 1","touchWidth":32},{"id":"inventory-live","dynamicStatus":true,"ariaLive":"off"},{"id":"cancel-dialog","modal":true,"initialFocus":"cancel-heading"}]}',
      checkpoint:
        '必须恰好发现 MISSING_ACCESSIBLE_NAME、TOUCH_TARGET_TOO_SMALL、STATUS_NOT_ANNOUNCED 三项问题。移动端按钮名称、触控尺寸和动态余量播报都要有真实证据。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 联调、测试、安全与性能': {
    title: 'Nimbus 代码台 08 · 并发压测与对象授权',
    description:
      '用可控延迟发起并发占位并统计成功、冲突和 P95，再用角色与资源归属检查取消预约是否越权。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-concurrency-budget-guided',
      title: '跟做：混合并发下的库存不变量',
      brief:
        '运行 node main.js。并发请求同一时段，仓储以同步条件更新保证原子性；输出成功数、冲突数、最终库存和 P95。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const store = { available: input.capacity, version: 1 };
const results = [];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function attempt(index) {
  await delay(index % 7);
  if (store.available > 0) {
    store.available -= 1;
    store.version += 1;
    results.push({ outcome: 'created', latencyMs: input.baseLatency + (index % 11) });
  } else {
    results.push({ outcome: 'conflict', latencyMs: input.baseLatency + 5 + (index % 13) });
  }
}

async function main() {
  await Promise.all(Array.from({ length: input.totalRequests }, (_, index) => attempt(index)));
  const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
  const p95Index = Math.ceil(latencies.length * 0.95) - 1;
  const summary = {
    created: results.filter((result) => result.outcome === 'created').length,
    conflict: results.filter((result) => result.outcome === 'conflict').length,
    p95Ms: latencies[p95Index],
    finalAvailable: store.available
  };

  assert.deepEqual(summary, { created: 4, conflict: 116, p95Ms: 57, finalAvailable: 0 });
  assert.equal(store.version, input.capacity + 1);
  assert.ok(store.available >= 0);
  assert.ok(summary.p95Ms <= input.p95BudgetMs);

  console.log(JSON.stringify({ summary, invariant: 'created=capacity and available>=0' }, null, 2));
}

main();
`,
      },
      stdin:
        '{"capacity":4,"totalRequests":120,"baseLatency":40,"p95BudgetMs":80}',
      checkpoint:
        '汇总必须为 created=4、conflict=116、p95Ms=57、finalAvailable=0，版本为 5，且 P95 不超过 80ms。只压查询接口不能证明预约事务正确。',
    },
    apply: {
      id: 'p15-nimbus-object-authorization-independent',
      title: '独立实践：拒绝跨用户和跨场馆操作',
      brief:
        '运行 node main.js。根据顾客、客服、运营和 SRE 的角色与场馆范围授权取消和容量调整，确认被拒请求没有修改状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const reservations = new Map(input.reservations.map((reservation) => [reservation.id, { ...reservation }]));
const audit = [];

function authorize(actor, reservation, action) {
  if (action === 'cancel-own') {
    return actor.role === 'customer' && reservation.userId === actor.id;
  }
  if (action === 'cancel-support') {
    return actor.role === 'support';
  }
  if (action === 'adjust-capacity') {
    return actor.role === 'operator' && actor.venues.includes(reservation.venueId);
  }
  return false;
}

for (const request of input.requests) {
  const actor = input.actors.find((entry) => entry.id === request.actorId);
  const reservation = reservations.get(request.reservationId);
  const allowed = Boolean(actor && reservation && authorize(actor, reservation, request.action));
  if (!allowed) {
    audit.push({ request: request.id, outcome: 'denied' });
    continue;
  }
  if (request.action === 'cancel-own' || request.action === 'cancel-support') {
    reservation.state = 'cancelled';
  } else {
    reservation.capacity = request.newCapacity;
  }
  audit.push({ request: request.id, outcome: 'allowed' });
}

assert.deepEqual(audit.map((entry) => entry.outcome), [
  'allowed',
  'denied',
  'allowed',
  'denied'
]);
assert.equal(reservations.get('r-1').state, 'cancelled');
assert.equal(reservations.get('r-2').state, 'pending_payment');
assert.equal(reservations.get('r-2').capacity, 20);

console.log(JSON.stringify({ audit, finalReservations: [...reservations.values()] }, null, 2));
`,
      },
      stdin:
        '{"actors":[{"id":"u1","role":"customer","venues":[]},{"id":"u2","role":"customer","venues":[]},{"id":"ops-north","role":"operator","venues":["north"]},{"id":"sre","role":"sre","venues":[]}],"reservations":[{"id":"r-1","userId":"u1","venueId":"north","state":"pending_payment","capacity":10},{"id":"r-2","userId":"u1","venueId":"north","state":"pending_payment","capacity":20}],"requests":[{"id":"req-1","actorId":"u1","reservationId":"r-1","action":"cancel-own"},{"id":"req-2","actorId":"u2","reservationId":"r-2","action":"cancel-own"},{"id":"req-3","actorId":"ops-north","reservationId":"r-2","action":"adjust-capacity","newCapacity":20},{"id":"req-4","actorId":"sre","reservationId":"r-2","action":"adjust-capacity","newCapacity":30}]}',
      checkpoint:
        'authorization 结果必须依次是 allowed、denied、allowed、denied；r-1 被取消，r-2 仍为 pending_payment 且容量仍为 20。被拒请求不得改变任何资源。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 容器、CI/CD、可观测与发布': {
    title: 'Nimbus 代码台 09 · 容器门禁与灰度发布判定',
    description:
      '先审计镜像 digest、非 root、只读根文件系统和探针，再从基线/灰度错误率与 P95 决定继续放量还是回滚。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-workload-manifest-guided',
      title: '跟做：找出 Go 工作负载发布阻断项',
      brief:
        '运行 node main.js。检查 Nimbus 工作负载的镜像、权限、资源、探针和优雅停机配置，输出阻断与建议。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const workload = input.workload;
const blockers = [];
const warnings = [];

if (!workload.image.includes('@sha256:')) blockers.push('IMAGE_DIGEST_MISSING');
if (workload.runAsNonRoot !== true) blockers.push('NON_ROOT_MISSING');
if (workload.readOnlyRootFilesystem !== true) blockers.push('READ_ONLY_ROOT_MISSING');
if (!workload.readinessProbe) blockers.push('READINESS_PROBE_MISSING');
if (!workload.resources.cpuLimit || !workload.resources.memoryLimit) blockers.push('RESOURCE_LIMIT_MISSING');
if (workload.terminationGraceSeconds < 30) warnings.push('GRACE_PERIOD_SHORT');
if (workload.replicas > workload.databaseConnectionBudget) warnings.push('DB_CONNECTION_BUDGET_RISK');

assert.deepEqual(blockers, ['READ_ONLY_ROOT_MISSING', 'RESOURCE_LIMIT_MISSING']);
assert.deepEqual(warnings, ['DB_CONNECTION_BUDGET_RISK']);

console.log(JSON.stringify({
  deployable: blockers.length === 0,
  blockers,
  warnings,
  contract: 'digest + nonroot + read-only + probes + bounded connection pool'
}, null, 2));
`,
      },
      stdin:
        '{"workload":{"image":"registry.example/nimbus@sha256:abc123","runAsNonRoot":true,"readOnlyRootFilesystem":false,"readinessProbe":{"path":"/ready"},"resources":{"cpuRequest":"200m","memoryRequest":"256Mi"},"terminationGraceSeconds":40,"replicas":12,"databaseConnectionBudget":10}}',
      checkpoint:
        'blockers 必须包含 READ_ONLY_ROOT_MISSING 与 RESOURCE_LIMIT_MISSING，warnings 必须包含 DB_CONNECTION_BUDGET_RISK，deployable 为 false。只增加副本数而不规划数据库连接不算扩容。',
    },
    apply: {
      id: 'p15-nimbus-canary-decision-independent',
      title: '独立实践：用错误率和 P95 决定灰度',
      brief:
        '运行 node main.js。比较基线与灰度的错误率、P95 和库存冲突比例，输出继续放量或回滚原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function summarize(sample) {
  return {
    errorRate: sample.errors / sample.requests,
    p95Ms: percentile(sample.latencies, 0.95),
    conflictRate: sample.conflicts / sample.requests
  };
}

const baseline = summarize(input.baseline);
const canary = summarize(input.canary);
const reasons = [];

if (canary.errorRate > input.errorRateLimit) reasons.push('ERROR_RATE_EXCEEDED');
if (canary.p95Ms > baseline.p95Ms * input.maxLatencyRatio) reasons.push('P95_REGRESSION');
if (canary.conflictRate > baseline.conflictRate * input.maxConflictRatio) reasons.push('CONFLICT_SPIKE');

const decision = reasons.length === 0 ? 'increase-traffic' : 'rollback';
assert.equal(baseline.errorRate, 0.003);
assert.equal(baseline.p95Ms, 180);
assert.ok(Math.abs(canary.errorRate - 0.004) < 1e-12);
assert.equal(canary.p95Ms, 210);
assert.deepEqual(reasons, []);
assert.equal(decision, 'increase-traffic');

console.log(JSON.stringify({ baseline, canary, decision, reasons }, null, 2));
`,
      },
      stdin:
        '{"errorRateLimit":0.01,"maxLatencyRatio":1.25,"maxConflictRatio":1.2,"baseline":{"requests":1000,"errors":3,"conflicts":20,"latencies":[120,140,160,180,220]},"canary":{"requests":1000,"errors":4,"conflicts":22,"latencies":[140,160,180,210,240]}}',
      checkpoint:
        'baseline 错误率 0.003、P95=180；canary 错误率 0.004、P95=210；reasons 必须为空且 decision=increase-traffic。发布判定要绑定预约成功、冲突和延迟，不只看 Pod 是否 Running。',
    },
  },

  'programming:综合训练 · Nimbus 预约票务 · 故障演练、回滚与项目答辩': {
    title: 'Nimbus 代码台 10 · 缓存故障、消息重放与答辩证据',
    description:
      '先让 Redis 不可用并验证数据库回源，再重放重复支付消息；最后逐条核对答辩主张是否带可复现证据。',
    ...nodeRuntime,
    practice: {
      id: 'p15-nimbus-cache-outbox-fault-guided',
      title: '跟做：缓存故障回源与消息去重',
      brief:
        '运行 node main.js。缓存不可用时查询数据库真相，恢复后清理旧缓存；再按事件 ID 去重并核对通知数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const databaseInventory = new Map(input.truth.map((row) => [row.slotId, { ...row }]));
const cache = new Map(input.cache.map((row) => [row.slotId, { ...row }]));
const delivered = new Set();
const notifications = [];
const trace = [];

for (const event of input.events) {
  if (event.type === 'availability-query') {
    const source = input.redisAvailable ? cache : databaseInventory;
    trace.push({ source: input.redisAvailable ? 'redis' : 'database', slotId: event.slotId });
  }
  if (event.type === 'redis-recovered') {
    cache.clear();
    for (const row of databaseInventory.values()) cache.set(row.slotId, { ...row });
    trace.push({ source: 'cache-rebuilt', rows: cache.size });
  }
  if (event.type === 'notify') {
    if (delivered.has(event.eventId)) {
      trace.push({ source: 'deduplicated', eventId: event.eventId });
      continue;
    }
    delivered.add(event.eventId);
    notifications.push({ reservationId: event.reservationId, eventId: event.eventId });
    trace.push({ source: 'outbox-consumer', eventId: event.eventId });
  }
}

const reconciliation = {
  reservationRows: input.truth.length,
  available: [...databaseInventory.values()].reduce((sum, row) => sum + row.available, 0),
  deliveredNotifications: notifications.length
};

assert.deepEqual(trace.map((entry) => entry.source), [
  'database',
  'cache-rebuilt',
  'outbox-consumer',
  'deduplicated'
]);
assert.deepEqual(reconciliation, {
  reservationRows: 2,
  available: 3,
  deliveredNotifications: 1
});

console.log(JSON.stringify({ trace, reconciliation, cache: [...cache.values()] }, null, 2));
`,
      },
      stdin:
        '{"redisAvailable":false,"truth":[{"slotId":"slot-a","available":1},{"slotId":"slot-b","available":2}],"cache":[{"slotId":"slot-a","available":7},{"slotId":"slot-b","available":8}],"events":[{"type":"availability-query","slotId":"slot-a"},{"type":"redis-recovered"},{"type":"notify","eventId":"evt-1","reservationId":"r-1"},{"type":"notify","eventId":"evt-1","reservationId":"r-1"}]}',
      checkpoint:
        '来源轨迹必须是 database、cache-rebuilt、outbox-consumer、deduplicated；对账结果 reservationRows=2、available=3、deliveredNotifications=1。缓存恢复不能保留旧余量，消息重放不能重复通知。',
    },
    apply: {
      id: 'p15-nimbus-defense-evidence-independent',
      title: '独立实践：判断答辩主张是否有证据',
      brief:
        '运行 node main.js。检查不超卖、有界队列、对象授权和回滚主张是否引用测试、指标或演练证据，列出未支持项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const evidenceIndex = new Map(input.evidence.map((item) => [item.id, item]));
const evaluatedClaims = input.claims.map((claim) => {
  const citations = claim.evidenceIds.map((id) => evidenceIndex.get(id)).filter(Boolean);
  const missing = claim.evidenceIds.filter((id) => !evidenceIndex.has(id));
  const reproduced = citations.some((item) => item.reproducible === true);
  return {
    id: claim.id,
    supported: citations.length > 0 && reproduced && missing.length === 0,
    evidenceCount: citations.length,
    missing,
    reproducible: reproduced
  };
});

const unsupported = evaluatedClaims.filter((claim) => !claim.supported);
const defenseReady = unsupported.length === 0;

assert.equal(defenseReady, false);
assert.deepEqual(unsupported.map((claim) => claim.id), [
  'no-oversell',
  'object-authorization'
]);
assert.equal(evaluatedClaims.find((claim) => claim.id === 'bounded-queue').evidenceCount, 1);

console.log(JSON.stringify({
  defenseReady,
  evaluatedClaims,
  unsupportedIds: unsupported.map((claim) => claim.id),
  nextAction: 'run reproducible concurrency and authorization drills'
}, null, 2));
`,
      },
      stdin:
        '{"evidence":[{"id":"ev-load","type":"load-test","reproducible":true},{"id":"ev-queue","type":"metric","reproducible":true},{"id":"ev-rollback","type":"drill","reproducible":true}],"claims":[{"id":"no-oversell","evidenceIds":[]},{"id":"bounded-queue","evidenceIds":["ev-queue"]},{"id":"object-authorization","evidenceIds":[]},{"id":"rollback","evidenceIds":["ev-rollback"]}]}',
      checkpoint:
        'defenseReady 必须为 false，未支持项必须包含 no-oversell 与 object-authorization。仅列出实验名称不算证据；主张要能追溯到可复现的测试、指标或演练记录。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 业务理解与用户任务': {
    title: 'LogForge 代码台 01 · 采集链路与有界背压策略',
    description:
      '先检查文件发现、读取、规则、批次和游标提交的链路是否完整，再比较暂停读取与直接丢弃在上游过载时的资源行为。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-pipeline-blueprint-guided',
      title: '跟做：审计采集链路是否可恢复',
      brief:
        '运行 node main.js。检查各阶段动作、顺序、有界队列和成功后再提交游标，输出缺失动作与链路结论。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const stageByName = new Map(input.stages.map((stage) => [stage.name, stage]));
const requiredOrder = ['discover', 'read', 'filter', 'batch', 'send', 'commit-cursor'];
const positions = requiredOrder.map((action) => {
  const stage = input.stages.find((candidate) => candidate.actions.includes(action));
  return stage ? input.stages.indexOf(stage) : -1;
});
const missing = requiredOrder.filter((_, index) => positions[index] === -1);
const orderViolations = [];

for (let index = 1; index < positions.length; index += 1) {
  if (positions[index] !== -1 && positions[index - 1] !== -1 && positions[index] < positions[index - 1]) {
    orderViolations.push(requiredOrder[index - 1] + '>' + requiredOrder[index]);
  }
}

const problems = [];
if (missing.length) problems.push('MISSING_ACTIONS:' + missing.join(','));
if (orderViolations.length) problems.push('ORDER:' + orderViolations.join(','));
if (input.queue.capacity > input.queue.maximumCapacity) problems.push('QUEUE_UNBOUNDED');
if (stageByName.get('cursor')?.afterAcknowledged !== true) problems.push('CURSOR_BEFORE_ACK');

assert.deepEqual(problems, ['QUEUE_UNBOUNDED']);
assert.equal(stageByName.get('cursor').afterAcknowledged, true);
assert.deepEqual(missing, []);

console.log(JSON.stringify({
  recoverable: problems.length === 0,
  problems,
  orderedActions: requiredOrder,
  memoryBound: input.queue.maximumCapacity
}, null, 2));
`,
      },
      stdin:
        '{"stages":[{"name":"file","actions":["discover","read"]},{"name":"rules","actions":["filter"]},{"name":"buffer","actions":["batch"]},{"name":"transport","actions":["send"]},{"name":"cursor","actions":["commit-cursor"],"afterAcknowledged":true}],"queue":{"capacity":50000,"maximumCapacity":10000}}',
      checkpoint:
        'problems 必须恰好为 QUEUE_UNBOUNDED，missing 为空；游标阶段必须确认 afterAcknowledged=true。采集链路即使动作齐全，超过内存上限仍不能判定可恢复。',
    },
    apply: {
      id: 'p15-logforge-backpressure-policy-independent',
      title: '独立实践：比较暂停读取与丢弃旧数据',
      brief:
        '运行 node main.js。在同一慢目标场景下执行 pause 和 drop-oldest，比较队列峰值、采集数和丢弃数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function simulate(policy) {
  const queue = [];
  let nextEvent = 0;
  let dispatched = 0;
  let dropped = 0;
  let pausedTicks = 0;
  let peak = 0;

  for (let tick = 0; tick < input.ticks; tick += 1) {
    let admittedThisTick = 0;
    const admissionCeiling = policy === 'drop-oldest'
      ? input.maxQueue + input.readPerTick
      : input.maxQueue;
    while (
      admittedThisTick < input.readPerTick &&
      nextEvent < input.totalEvents &&
      queue.length < admissionCeiling
    ) {
      queue.push('event-' + nextEvent);
      nextEvent += 1;
      admittedThisTick += 1;
      peak = Math.max(peak, queue.length);
    }
    if (admittedThisTick < input.readPerTick) pausedTicks += 1;
    while (policy === 'drop-oldest' && queue.length > input.maxQueue) {
      queue.shift();
      dropped += 1;
    }

    for (let index = 0; index < input.sendPerTick && queue.length > 0; index += 1) {
      queue.shift();
      dispatched += 1;
    }
  }

  return { policy, peak, dispatched, dropped, pausedTicks, remaining: queue.length };
}

const pause = simulate('pause');
const drop = simulate('drop-oldest');

assert.deepEqual(pause, {
  policy: 'pause',
  peak: 5,
  dispatched: 10,
  dropped: 0,
  pausedTicks: 6,
  remaining: 4
});
assert.deepEqual(drop, {
  policy: 'drop-oldest',
  peak: 6,
  dispatched: 10,
  dropped: 6,
  pausedTicks: 0,
  remaining: 4
});
assert.ok(pause.peak <= input.maxQueue);

console.log(JSON.stringify({ pause, drop, invariant: 'peak<=maxQueue' }, null, 2));
`,
      },
      stdin:
        '{"ticks":10,"readPerTick":2,"sendPerTick":1,"maxQueue":5,"totalEvents":20}',
      checkpoint:
        'pause 必须保持 peak=5、丢弃 0 并暂停 6 个 tick；drop-oldest 入队后立即裁剪，峰值虽触及 6，但必须显式记录 6 条丢弃。暂停读取会施加背压，丢弃策略必须可观测，二者都不能无限增长内存。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 范围、验收与非功能目标': {
    title: 'LogForge 代码台 02 · 吞吐资源门槛与崩溃窗口',
    description:
      '先计算 MB/s、P99、CPU、内存和丢弃率是否同时达标，再定位“接收成功但游标未提交”时允许重放的事件范围。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-resource-acceptance-guided',
      title: '跟做：吞吐必须带资源账单',
      brief:
        '运行 node main.js。对每组采集样本计算吞吐、P99、丢弃率和资源判定，找出唯一未达标原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

const samples = input.samples.map((sample) => {
  const seconds = sample.durationMs / 1000;
  const eventsPerSecond = sample.events / seconds;
  const megabytesPerSecond = sample.bytes / 1024 / 1024 / seconds;
  return {
    run: sample.run,
    eventsPerSecond: Math.round(eventsPerSecond),
    megabytesPerSecond: Number(megabytesPerSecond.toFixed(1)),
    p99Ms: percentile(sample.latencies, 0.99),
    dropRate: Number((sample.dropped / sample.events).toFixed(4)),
    memoryMb: sample.memoryMb,
    cpuPercent: sample.cpuPercent
  };
});

const failures = [];
for (const sample of samples) {
  if (sample.megabytesPerSecond < input.thresholds.minimumMegabytesPerSecond) failures.push('THROUGHPUT:' + sample.run);
  if (sample.p99Ms > input.thresholds.maximumP99Ms) failures.push('P99:' + sample.run);
  if (sample.dropRate > input.thresholds.maximumDropRate) failures.push('DROP:' + sample.run);
  if (sample.memoryMb > input.thresholds.maximumMemoryMb) failures.push('MEMORY:' + sample.run);
  if (sample.cpuPercent > input.thresholds.maximumCpuPercent) failures.push('CPU:' + sample.run);
}

assert.deepEqual(samples.map((sample) => sample.megabytesPerSecond), [10.5, 14.3]);
assert.equal(samples[1].p99Ms, 190);
assert.deepEqual(failures, ['MEMORY:run-2']);

console.log(JSON.stringify({
  accepted: failures.length === 0,
  samples,
  failures,
  verdict: 'optimize-memory-before-throughput'
}, null, 2));
`,
      },
      stdin:
        '{"thresholds":{"minimumMegabytesPerSecond":10,"maximumP99Ms":200,"maximumDropRate":0.01,"maximumMemoryMb":256,"maximumCpuPercent":70},"samples":[{"run":"run-1","durationMs":2000,"events":20000,"bytes":22020096,"latencies":[40,80,120,160,180],"dropped":20,"memoryMb":220,"cpuPercent":55},{"run":"run-2","durationMs":2000,"events":30000,"bytes":30000000,"latencies":[90,130,150,190,260],"dropped":30,"memoryMb":310,"cpuPercent":62}]}',
      checkpoint:
        '两组吞吐依次为 10.5 与 14.3 MB/s，run-2 的 P99 为 190ms；failures 必须只有 MEMORY:run-2。吞吐达标但内存越界仍不能验收。',
    },
    apply: {
      id: 'p15-logforge-crash-window-independent',
      title: '独立实践：算出可解释的重放边界',
      brief:
        '运行 node main.js。对比接收端确认批次与持久化游标，找出重放批次、重复事件和永久漏采，证明至少一次语义。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const acknowledged = new Set(input.acknowledgedBatches);
const committed = new Set(input.committedBatches);
const replayBatches = input.batches
  .filter((batch) => acknowledged.has(batch.id) && !committed.has(batch.id))
  .map((batch) => batch.id);
const replaySet = new Set(replayBatches);
const replayEvents = input.batches
  .filter((batch) => replaySet.has(batch.id))
  .flatMap((batch) => batch.eventIds);
const duplicateCount = replayEvents.length;
const cursorMax = input.batches
  .filter((batch) => committed.has(batch.id))
  .reduce((maximum, batch) => Math.max(maximum, batch.sequence), -1);
const missedBatches = input.batches
  .filter((batch) => batch.sequence <= cursorMax && !acknowledged.has(batch.id))
  .map((batch) => batch.id);

assert.deepEqual(replayBatches, ['batch-11']);
assert.deepEqual(replayEvents, ['evt-101', 'evt-102']);
assert.equal(duplicateCount, 2);
assert.deepEqual(missedBatches, []);

console.log(JSON.stringify({
  cursorMax,
  replayBatches,
  replayEvents,
  duplicateCount,
  missedBatches,
  deliverySemantics: 'at-least-once with idempotent backend'
}, null, 2));
`,
      },
      stdin:
        '{"batches":[{"id":"batch-9","sequence":9,"eventIds":["evt-81"]},{"id":"batch-10","sequence":10,"eventIds":["evt-91"]},{"id":"batch-11","sequence":11,"eventIds":["evt-101","evt-102"]}],"acknowledgedBatches":["batch-9","batch-10","batch-11"],"committedBatches":["batch-9","batch-10"]}',
      checkpoint:
        'cursorMax 必须为 10，replayBatches 仅含 batch-11，replayEvents 为 evt-101 与 evt-102，missedBatches 为空。允许可解释的重复，绝不能永久漏采。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · API 契约与前端数据边界': {
    title: 'LogForge 代码台 03 · 配置白名单与批次协议',
    description:
      '递归拒绝任意 shell、越界路径和高复杂度规则，再用 gzip 与 SHA-256 构造有数量/字节上限、可校验的传输批次。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-config-schema-guided',
      title: '跟做：配置不是远程代码执行',
      brief:
        '运行 node main.js。扫描 Agent 配置中的危险字段、绝对路径、越界正则和未知能力，输出稳定错误码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const violations = [];
const allowedKeys = new Set(input.allowedKeys);
const forbiddenKeys = new Set(['script', 'shell', 'command', 'exec']);

function inspect(value, location) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, location + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = location ? location + '.' + key : key;
    if (forbiddenKeys.has(key)) violations.push('FORBIDDEN_KEY:' + childLocation);
    else if (location === 'rules[0]' && !allowedKeys.has(key)) violations.push('UNKNOWN_RULE_KEY:' + childLocation);
    inspect(child, childLocation);
  }
}

inspect(input.config, '');
if (!path.isAbsolute(input.config.rules[0].path) && input.config.rules[0].path.includes('..')) {
  violations.push('PATH_TRAVERSAL:rules[0].path');
}
if (input.config.rules[0].regexLength > input.maximumRegexLength) {
  violations.push('REGEX_TOO_COMPLEX:rules[0].regex');
}
if (!input.capabilities.includes(input.config.requiredCapability)) {
  violations.push('CAPABILITY_UNSUPPORTED:requiredCapability');
}

assert.deepEqual(violations, [
  'FORBIDDEN_KEY:transport.shell',
  'REGEX_TOO_COMPLEX:rules[0].regex',
  'CAPABILITY_UNSUPPORTED:requiredCapability'
]);

console.log(JSON.stringify({
  accepted: violations.length === 0,
  violations,
  safeMode: 'declarative-schema-only'
}, null, 2));
`,
      },
      stdin:
        '{"allowedKeys":["path","include","exclude","regexLength","requiredCapability"],"maximumRegexLength":512,"capabilities":["file-tail-v2","json-fields-v1"],"config":{"rules":[{"path":"logs/app.log","include":".*","exclude":"health","regexLength":900,"requiredCapability":"file-tail-v3"}],"transport":{"shell":"rm -rf /tmp/logs","batchBytes":1048576}}}',
      checkpoint:
        'violations 必须依次包含 transport.shell、rules[0].regex 和 requiredCapability 的稳定错误码。Agent 只能应用声明式白名单配置，不能执行任意命令或加载未声明能力。',
    },
    apply: {
      id: 'p15-logforge-batch-integrity-independent',
      title: '独立实践：构造可校验的有界批次',
      brief:
        '运行 node main.js。将事件按数量和字节上限切批，使用 gzip 压缩并计算 SHA-256，验证批次 ID、事件总数与重复键。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const batches = [];
let current = [];

function flush() {
  if (current.length === 0) return;
  const raw = Buffer.from(JSON.stringify(current), 'utf8');
  const compressed = zlib.gzipSync(raw);
  const digest = crypto.createHash('sha256').update(compressed).digest('hex');
  batches.push({
    id: 'batch-' + (batches.length + 1),
    eventCount: current.length,
    rawBytes: raw.length,
    compressedBytes: compressed.length,
    sha256: digest
  });
  current = [];
}

for (const event of input.events) {
  const candidate = [...current, event];
  const candidateBytes = Buffer.byteLength(JSON.stringify(candidate));
  if (current.length >= input.maxEvents || (current.length > 0 && candidateBytes > input.maxRawBytes)) flush();
  current.push(event);
}
flush();

const deliveredEvents = batches.reduce((sum, batch) => sum + batch.eventCount, 0);
const eventIds = input.events.map((event) => event.id);
assert.equal(batches.length, 2);
assert.deepEqual(batches.map((batch) => batch.eventCount), [2, 1]);
assert.equal(deliveredEvents, input.events.length);
assert.equal(new Set(eventIds).size, eventIds.length);
assert.ok(batches.every((batch) => batch.rawBytes <= input.maxRawBytes));
assert.ok(batches.every((batch) => batch.compressedBytes > 0));
assert.ok(batches.every((batch) => batch.sha256.length === 64));

console.log(JSON.stringify({ batches, deliveredEvents, duplicates: 0 }, null, 2));
`,
      },
      stdin:
        '{"maxEvents":2,"maxRawBytes":4096,"events":[{"id":"evt-1","message":"checkout accepted reservation r-1"},{"id":"evt-2","message":"payment confirmed reservation r-1"},{"id":"evt-3","message":"notification sent reservation r-1"}]}',
      checkpoint:
        '必须生成 2 个批次且事件数为 2 与 1，deliveredEvents=3、duplicates=0；每个批次都记录原始/压缩字节并带 64 位 SHA-256，原始批次不超过上限。小批次压缩未必更小，但传输大小必须可观测。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 数据模型、约束与迁移': {
    title: 'LogForge 代码台 04 · 原子游标与事件唯一键',
    description:
      '模拟临时文件、fsync 与原子 rename 的崩溃窗口，保证读取到的游标要么完整旧值、要么完整新值；再用事件唯一键去重迁移数据。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-atomic-cursor-guided',
      title: '跟做：崩溃只能留下旧游标或新游标',
      brief:
        '运行 node main.js。分别在 rename 前和 rename 后模拟崩溃，校验游标内容与 SHA-256，确认没有半写 JSON。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function encode(cursor) {
  const body = JSON.stringify(cursor);
  const checksum = crypto.createHash('sha256').update(body).digest('hex');
  return JSON.stringify({ body, checksum });
}

function decode(envelope) {
  const parsed = JSON.parse(envelope);
  const expected = crypto.createHash('sha256').update(parsed.body).digest('hex');
  if (expected !== parsed.checksum) throw new Error('CURSOR_CHECKSUM_MISMATCH');
  return JSON.parse(parsed.body);
}

function simulatedRename(crashPoint) {
  const oldEnvelope = encode(input.oldCursor);
  const nextEnvelope = encode(input.newCursor);
  const files = { current: oldEnvelope, temporary: nextEnvelope };
  if (crashPoint === 'after-rename') files.current = files.temporary;
  const currentCursor = decode(files.current);
  const temporaryCursor = decode(files.temporary);
  return { crashPoint, currentCursor, temporaryCursor, complete: true };
}

const before = simulatedRename('before-rename');
const after = simulatedRename('after-rename');

assert.deepEqual(before.currentCursor, { fileId: 'app-log:42', offset: 8192, batch: 17 });
assert.deepEqual(after.currentCursor, { fileId: 'app-log:42', offset: 12288, batch: 18 });
assert.equal(before.complete && after.complete, true);
assert.notEqual(before.currentCursor.offset, after.currentCursor.offset);

console.log(JSON.stringify({ before, after, invariant: 'old-or-new-never-partial' }, null, 2));
`,
      },
      stdin:
        '{"oldCursor":{"fileId":"app-log:42","offset":8192,"batch":17},"newCursor":{"fileId":"app-log:42","offset":12288,"batch":18}}',
      checkpoint:
        'rename 前恢复的 offset 必须为 8192、batch 17；rename 后为 12288、batch 18；两次 complete 均为 true。任何阶段都不能读到缺字段或校验失败的半写内容。',
    },
    apply: {
      id: 'p15-logforge-event-unique-migration-independent',
      title: '独立实践：用事件唯一键迁移去重',
      brief:
        '运行 node main.js。以 agent、文件身份、偏移和序号组合唯一键，迁移旧批次事件并统计重复、无效键与保留数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const unique = new Map();
const duplicates = [];
const invalid = [];

for (const event of input.events) {
  const valid = event.agentId && event.fileId && Number.isInteger(event.offset) && Number.isInteger(event.sequence);
  if (!valid) {
    invalid.push(event.id);
    continue;
  }
  const uniqueKey = [event.agentId, event.fileId, event.offset, event.sequence].join('|');
  if (unique.has(uniqueKey)) {
    duplicates.push({ id: event.id, duplicateOf: unique.get(uniqueKey).id, uniqueKey });
    continue;
  }
  unique.set(uniqueKey, {
    id: event.id,
    uniqueKey,
    agentId: event.agentId,
    fileId: event.fileId,
    offset: event.offset,
    sequence: event.sequence
  });
}

const migrationSummary = {
  inputRows: input.events.length,
  retainedRows: unique.size,
  duplicateRows: duplicates.length,
  invalidRows: invalid.length
};

assert.deepEqual(migrationSummary, {
  inputRows: 5,
  retainedRows: 3,
  duplicateRows: 1,
  invalidRows: 1
});
assert.equal(duplicates[0].duplicateOf, 'evt-1');
assert.deepEqual(invalid, ['evt-missing-offset']);

console.log(JSON.stringify({ migrationSummary, duplicates, invalid }, null, 2));
`,
      },
      stdin:
        '{"events":[{"id":"evt-1","agentId":"agent-a","fileId":"inode-42","offset":100,"sequence":1},{"id":"evt-2","agentId":"agent-a","fileId":"inode-42","offset":100,"sequence":1},{"id":"evt-3","agentId":"agent-a","fileId":"inode-42","offset":200,"sequence":2},{"id":"evt-4","agentId":"agent-b","fileId":"inode-42","offset":100,"sequence":1},{"id":"evt-missing-offset","agentId":"agent-a","fileId":"inode-42","sequence":3}]}',
      checkpoint:
        '迁移汇总必须为 inputRows=5、retainedRows=3、duplicateRows=1、invalidRows=1；evt-2 应指向 evt-1。唯一键跨 Agent 隔离，但同一 Agent 的文件身份、偏移和序号不能重复。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 项目骨架、模块边界与本地环境': {
    title: 'LogForge 代码台 05 · 组件组合与可移植配置',
    description:
      '按端口组合文件源、规则处理器、有界队列和接收端，再检查本地配置是否越出允许根目录、泄漏秘密或缺少启动变量。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-component-composition-guided',
      title: '跟做：用独立端口跑通采集管线',
      brief:
        '运行 node main.js。根据组件声明组合 source→processor→sink，验证吞吐、处理后事件和每一步调用次数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const calls = { source: 0, processor: 0, sink: 0 };

const source = {
  read() {
    calls.source += 1;
    return input.lines;
  }
};
const processor = {
  apply(line) {
    calls.processor += 1;
    if (line.includes('DEBUG')) return null;
    return { level: line.split(' ')[0], message: line };
  }
};
const sink = {
  batches: [],
  send(batch) {
    calls.sink += 1;
    this.batches.push(batch);
  }
};

const lines = source.read();
const processed = lines.map((line) => processor.apply(line)).filter(Boolean);
for (let offset = 0; offset < processed.length; offset += input.batchSize) {
  sink.send(processed.slice(offset, offset + input.batchSize));
}

assert.deepEqual(calls, { source: 1, processor: 3, sink: 1 });
assert.deepEqual(sink.batches.map((batch) => batch.length), [2]);
assert.equal(processed[0].level, 'INFO');
assert.ok(processed.every((event) => !event.message.includes('DEBUG')));

console.log(JSON.stringify({ calls, processed, sink: sink.batches }, null, 2));
`,
      },
      stdin:
        '{"lines":["INFO checkout accepted","DEBUG internal cache lookup","ERROR payment callback failed"],"batchSize":2}',
      checkpoint:
        '调用次数必须为 source=1、processor=3、sink=1；最终一个批次含 2 条事件，DEBUG 被过滤。端口组合要证明组件边界真实运行，而不只是目录里存在文件名。',
    },
    apply: {
      id: 'p15-logforge-portable-config-independent',
      title: '独立实践：阻止本地配置越界与泄密',
      brief:
        '运行 node main.js。检查日志路径是否位于允许根目录、必需环境变量是否齐全，并输出脱敏后的启动配置。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = path.resolve(input.workspaceRoot);
const issues = [];
const normalizedPaths = [];

for (const sourcePath of input.config.sources) {
  const absolute = path.resolve(root, sourcePath);
  normalizedPaths.push(absolute);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    issues.push('PATH_OUTSIDE_WORKSPACE:' + sourcePath);
  }
}

for (const name of input.requiredEnvironment) {
  if (!input.environment[name]) issues.push('MISSING_ENV:' + name);
}
if (input.config.token && input.config.token !== input.environment.LOG_INGEST_TOKEN) {
  issues.push('TOKEN_SOURCE_CONFLICT');
}

const safeConfig = {
  sources: input.config.sources,
  endpoint: input.config.endpoint,
  token: input.environment.LOG_INGEST_TOKEN ? '***' : 'missing',
  batchBytes: input.config.batchBytes
};

assert.deepEqual(issues, [
  'PATH_OUTSIDE_WORKSPACE:../../etc/passwd',
  'TOKEN_SOURCE_CONFLICT'
]);
assert.equal(safeConfig.token, '***');
assert.ok(normalizedPaths[0].startsWith(root + path.sep));
assert.equal(JSON.stringify(safeConfig).includes('secret-token'), false);

console.log(JSON.stringify({ issues, safeConfig, normalizedPaths }, null, 2));
`,
      },
      stdin:
        '{"workspaceRoot":"C:/work/logforge","config":{"sources":["logs/app.log","../../etc/passwd"],"endpoint":"http://127.0.0.1:4318/v1/logs","token":"secret-token","batchBytes":1048576},"requiredEnvironment":["LOG_INGEST_TOKEN"],"environment":{"LOG_INGEST_TOKEN":"runtime-token"}}',
      checkpoint:
        'issues 必须包含 PATH_OUTSIDE_WORKSPACE:../../etc/passwd 与 TOKEN_SOURCE_CONFLICT；safeConfig.token 为 ***，序列化结果不得包含 secret-token。本地配置不能读取工作区外文件，也不能把秘密写进样例文件。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 后端核心链路与异常恢复': {
    title: 'LogForge 代码台 06 · 异步背压与确认后游标',
    description:
      '用异步接收端制造慢消费，观察高水位时停止读取；再在批次已确认但游标未提交的窗口重启，验证重放由接收端去重。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-async-pipeline-guided',
      title: '跟做：慢接收端把背压传回读取循环',
      brief:
        '运行 node main.js。在队列达到上限时停止读取，按小批次异步发送，输出峰值、发送数、批次和剩余读取位置。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function pump(events, maxQueue, batchSize) {
  const queue = [];
  let readIndex = 0;
  let sent = 0;
  let batches = 0;
  let peakQueue = 0;

  while (readIndex < events.length || queue.length > 0) {
    while (readIndex < events.length && queue.length < maxQueue) {
      queue.push(events[readIndex]);
      readIndex += 1;
      peakQueue = Math.max(peakQueue, queue.length);
    }
    const batch = queue.splice(0, batchSize);
    if (batch.length > 0) {
      await nextTurn();
      sent += batch.length;
      batches += 1;
    }
  }

  return { readIndex, sent, batches, peakQueue };
}

async function main() {
  const result = await pump(input.events, input.maxQueue, input.batchSize);
  assert.deepEqual(result, { readIndex: 8, sent: 8, batches: 3, peakQueue: 3 });
  assert.ok(result.peakQueue <= input.maxQueue);
  assert.equal(result.sent, input.events.length);

  console.log(JSON.stringify({
    ...result,
    backpressureObserved: result.peakQueue === input.maxQueue,
    invariant: 'queue.length<=maxQueue'
  }, null, 2));
}

main();
`,
      },
      stdin:
        '{"maxQueue":3,"batchSize":3,"events":["evt-1","evt-2","evt-3","evt-4","evt-5","evt-6","evt-7","evt-8"]}',
      checkpoint:
        '结果必须为 readIndex=8、sent=8、batches=3、peakQueue=3，backpressureObserved=true。高水位必须真正阻止继续读取，而不是先无限收集再分批发送。',
    },
    apply: {
      id: 'p15-logforge-ack-before-cursor-independent',
      title: '独立实践：重启重放但不重复写入',
      brief:
        '运行 node main.js。模拟接收端确认后进程崩溃，重启从旧游标重发；接收端按批次 ID 去重，证明无漏采。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const sinkAccepted = new Map();
const attempts = [];
let cursorBatch = input.persistedCursorBatch;

function sendFromCursor(runId) {
  const pending = input.batches.filter((batch) => batch.sequence > cursorBatch);
  for (const batch of pending) {
    const alreadyAccepted = sinkAccepted.has(batch.id);
    if (!alreadyAccepted) sinkAccepted.set(batch.id, [...batch.eventIds]);
    attempts.push({ runId, batchId: batch.id, action: alreadyAccepted ? 'deduplicated' : 'accepted' });
    if (runId === 'first-run' && batch.id === input.crashAfterAcknowledgedBatch) {
      attempts.push({ runId, batchId: batch.id, action: 'crash-before-cursor-commit' });
      return;
    }
    cursorBatch = batch.sequence;
  }
}

sendFromCursor('first-run');
sendFromCursor('restart');

const deliveredEvents = [...sinkAccepted.values()].flat();
const expectedEvents = input.batches.flatMap((batch) => batch.eventIds);

assert.deepEqual(attempts, [
  { runId: 'first-run', batchId: 'batch-21', action: 'accepted' },
  {
    runId: 'first-run',
    batchId: 'batch-21',
    action: 'crash-before-cursor-commit'
  },
  { runId: 'restart', batchId: 'batch-21', action: 'deduplicated' },
  { runId: 'restart', batchId: 'batch-22', action: 'accepted' }
]);
assert.equal(cursorBatch, 22);
assert.deepEqual(deliveredEvents.sort(), expectedEvents.sort());
assert.equal(new Set(deliveredEvents).size, expectedEvents.length);

console.log(JSON.stringify({
  attempts,
  cursorBatch,
  deliveredEvents,
  duplicateBusinessRows: 0
}, null, 2));
`,
      },
      stdin:
        '{"persistedCursorBatch":20,"crashAfterAcknowledgedBatch":"batch-21","batches":[{"id":"batch-21","sequence":21,"eventIds":["evt-201"]},{"id":"batch-22","sequence":22,"eventIds":["evt-202","evt-203"]}]}',
      checkpoint:
        'attempts 必须先 accepted、crash-before-cursor-commit，再对 batch-21 去重并接受 batch-22；最终 cursorBatch=22，三个事件各出现一次。至少一次投递允许重放，但业务存储必须去重。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 前端页面、状态与可访问交互': {
    title: 'LogForge 代码台 07 · 异常 Agent 优先与危险配置确认',
    description:
      '先按离线、积压和版本冲突排序运维列表，再对配置差异实施影响说明、版本检查和二次确认。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-agent-triage-guided',
      title: '跟做：运维列表先暴露可行动异常',
      brief:
        '运行 node main.js。根据离线、队列水位、丢弃和版本不兼容计算严重级别，生成排序列表与下一步动作。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function triage(agent) {
  if (!agent.online) return { severity: 3, action: 'check-host-and-reconnect' };
  if (!agent.configCompatible) return { severity: 2, action: 'upgrade-or-rollback-config' };
  if (agent.queueRatio >= 0.8 || agent.droppedLastMinute > 0) {
    return { severity: 2, action: 'inspect-backpressure-and-sink' };
  }
  if (agent.queueRatio >= 0.5) return { severity: 1, action: 'watch-queue' };
  return { severity: 0, action: 'none' };
}

const rows = input.agents.map((agent) => ({
  id: agent.id,
  ...triage(agent),
  queuePercent: Math.round(agent.queueRatio * 100),
  droppedLastMinute: agent.droppedLastMinute
})).sort((left, right) => right.severity - left.severity || right.queuePercent - left.queuePercent);

assert.deepEqual(rows.map((row) => row.id), ['agent-offline', 'agent-backlog', 'agent-watch', 'agent-healthy']);
assert.equal(rows[0].action, 'check-host-and-reconnect');
assert.equal(rows[1].queuePercent, 90);
assert.equal(rows[2].severity, 1);

console.log(JSON.stringify({
  rows,
  visibleActions: rows.filter((row) => row.action !== 'none').length
}, null, 2));
`,
      },
      stdin:
        '{"agents":[{"id":"agent-healthy","online":true,"configCompatible":true,"queueRatio":0.1,"droppedLastMinute":0},{"id":"agent-watch","online":true,"configCompatible":true,"queueRatio":0.55,"droppedLastMinute":0},{"id":"agent-backlog","online":true,"configCompatible":true,"queueRatio":0.9,"droppedLastMinute":2},{"id":"agent-offline","online":false,"configCompatible":true,"queueRatio":0,"droppedLastMinute":0}]}',
      checkpoint:
        '排序必须是 agent-offline、agent-backlog、agent-watch、agent-healthy；前三行必须给出对应恢复动作。运维列表不能只显示绿色在线点，必须暴露积压和丢弃。',
    },
    apply: {
      id: 'p15-logforge-config-confirmation-independent',
      title: '独立实践：危险配置差异与二次确认',
      brief:
        '运行 node main.js。生成规则差异，校验期望版本和影响范围；首次无确认必须拒绝，确认后只提交一次。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const changes = input.fields
  .filter((field) => JSON.stringify(input.oldConfig[field]) !== JSON.stringify(input.newConfig[field]))
  .map((field) => ({ field, before: input.oldConfig[field], after: input.newConfig[field] }));
const outcomes = [];
let activeVersion = input.oldConfig.version;
let commits = 0;

for (const request of input.requests) {
  if (request.expectedVersion !== activeVersion) {
    outcomes.push({ id: request.id, result: 'rejected-version-conflict' });
    continue;
  }
  if (!request.confirmed || request.impactAcknowledged !== true) {
    outcomes.push({ id: request.id, result: 'confirmation-required' });
    continue;
  }
  activeVersion = request.nextVersion;
  commits += 1;
  outcomes.push({ id: request.id, result: 'committed' });
}

assert.deepEqual(changes.map((change) => change.field), ['include', 'maxQueue']);
assert.deepEqual(outcomes.map((outcome) => outcome.result), [
  'confirmation-required',
  'committed',
  'rejected-version-conflict'
]);
assert.equal(commits, 1);
assert.equal(activeVersion, 8);

console.log(JSON.stringify({ changes, outcomes, commits, activeVersion }, null, 2));
`,
      },
      stdin:
        '{"fields":["path","include","maxQueue"],"oldConfig":{"version":7,"path":"/var/log/app.log","include":"ERROR","maxQueue":5000},"newConfig":{"version":8,"path":"/var/log/app.log","include":"WARN","maxQueue":2000},"requests":[{"id":"draft-save","expectedVersion":7,"confirmed":false,"impactAcknowledged":false,"nextVersion":8},{"id":"apply-8","expectedVersion":7,"confirmed":true,"impactAcknowledged":true,"nextVersion":8},{"id":"stale-apply","expectedVersion":7,"confirmed":true,"impactAcknowledged":true,"nextVersion":9}]}',
      checkpoint:
        '差异字段必须为 include 与 maxQueue；结果顺序必须是 confirmation-required、committed、rejected-version-conflict；只提交一次并停在版本 8。无确认或版本过期的危险操作都不能写入。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 联调、测试、安全与性能': {
    title: 'LogForge 代码台 08 · 日志检索与保留策略',
    description:
      '先构建倒排索引完成多词检索与时间排序，再按日志分类、合法保留和法律冻结计算删除、保留与墓碑记录。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-inverted-search-guided',
      title: '跟做：多词日志检索和稳定排序',
      brief:
        '运行 node main.js。为日志建立 token 倒排索引，求多个查询词交集，按时间倒序和 ID 稳定排序。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const tokenize = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const index = new Map();
const byId = new Map(input.logs.map((log) => [log.id, log]));

for (const log of input.logs) {
  for (const token of new Set(tokenize(log.message))) {
    if (!index.has(token)) index.set(token, new Set());
    index.get(token).add(log.id);
  }
}

const queryTokens = input.query.toLowerCase().split(/\\s+/).filter(Boolean);
const matchingSets = queryTokens
  .map((token) => index.get(token) || new Set())
  .sort((left, right) => left.size - right.size);
const candidates = matchingSets.length
  ? [...matchingSets[0]].filter((id) => matchingSets.every((set) => set.has(id)))
  : [];
const matches = candidates
  .map((id) => byId.get(id))
  .sort((left, right) => right.timestamp - left.timestamp || left.id.localeCompare(right.id))
  .slice(0, input.limit);

assert.deepEqual(matches.map((log) => log.id), ['log-3', 'log-1']);
assert.equal(index.get('payment').size, 3);
assert.equal(index.get('reservation').size, 2);
assert.ok(matches.every((log) => tokenize(log.message).includes('payment')));

console.log(JSON.stringify({
  queryTokens,
  candidates: candidates.sort(),
  matches: matches.map((log) => log.id),
  indexSizes: Object.fromEntries([...index].map(([token, ids]) => [token, ids.size]))
}, null, 2));
`,
      },
      stdin:
        '{"query":"payment reservation","limit":10,"logs":[{"id":"log-1","timestamp":100,"message":"payment accepted for reservation r1"},{"id":"log-2","timestamp":200,"message":"cache payment retry scheduled"},{"id":"log-3","timestamp":300,"message":"reservation payment confirmed"},{"id":"log-4","timestamp":400,"message":"health check passed"}]}',
      checkpoint:
        'matches 必须为 log-3、log-1，payment 索引包含 3 条、reservation 包含 2 条。检索结果必须同时命中多个词，并按时间倒序稳定返回。',
    },
    apply: {
      id: 'p15-logforge-retention-policy-independent',
      title: '独立实践：分类保留、法律冻结与墓碑',
      brief:
        '运行 node main.js。按分类保留天数与 legal hold 决定删除或保留，删除时写入墓碑并核对每类数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const dayMs = 24 * 60 * 60 * 1000;
const deleted = [];
const retained = [];
const tombstones = [];
const byClass = {};

for (const log of input.logs) {
  const policy = input.policies[log.classification];
  const ageDays = (input.now - log.createdAt) / dayMs;
  const expired = ageDays > policy.retentionDays;
  if (expired && !log.legalHold) {
    deleted.push(log.id);
    byClass[log.classification] = (byClass[log.classification] || 0) + 1;
    tombstones.push({
      logId: log.id,
      className: log.classification,
      reason: 'RETENTION_EXPIRED',
      deletedAt: input.now
    });
  } else {
    retained.push({
      id: log.id,
      reason: log.legalHold ? 'LEGAL_HOLD' : 'WITHIN_RETENTION'
    });
  }
}

assert.deepEqual(deleted, ['audit-old', 'debug-old', 'debug-ancient']);
assert.deepEqual(retained, [
  { id: 'audit-held', reason: 'LEGAL_HOLD' },
  { id: 'audit-fresh', reason: 'WITHIN_RETENTION' }
]);
assert.deepEqual(byClass, { audit: 1, debug: 2 });
assert.equal(tombstones.length, 3);
assert.ok(tombstones.every((tombstone) => tombstone.reason === 'RETENTION_EXPIRED'));

console.log(JSON.stringify({ deleted, retained, byClass, tombstones }, null, 2));
`,
      },
      stdin:
        '{"now":1795507200000,"policies":{"audit":{"retentionDays":30},"debug":{"retentionDays":7}},"logs":[{"id":"audit-old","classification":"audit","createdAt":1792000000000,"legalHold":false},{"id":"audit-held","classification":"audit","createdAt":1600000000000,"legalHold":true},{"id":"audit-fresh","classification":"audit","createdAt":1795000000000,"legalHold":false},{"id":"debug-old","classification":"debug","createdAt":1794000000000,"legalHold":false},{"id":"debug-ancient","classification":"debug","createdAt":1700000000000,"legalHold":false}]}',
      checkpoint:
        '删除列表必须为 audit-old、debug-old、debug-ancient；legal hold 的 audit-held 必须保留；墓碑数量为 3，分类计数 audit=1、debug=2。过期删除不能绕过法律冻结。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 容器、CI/CD、可观测与发布': {
    title: 'LogForge 代码台 09 · 版本兼容矩阵与发布指标',
    description:
      '先验证旧 Agent 与新控制面的配置兼容性，再根据队列水位、丢弃率、发送 P95 和错误率决定扩大发布还是回滚。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-release-compatibility-guided',
      title: '跟做：先发布兼容旧 Agent 的控制面',
      brief:
        '运行 node main.js。按 Agent 版本匹配功能最小版本，检查必需字段和未知可选字段，输出可下发矩阵。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const features = new Map(input.serverFeatures.map((feature) => [feature.name, feature]));
const evaluations = [];
const blocked = [];

for (const agent of input.agents) {
  for (const requested of agent.requestedFeatures) {
    const feature = features.get(requested);
    if (!feature) {
      blocked.push({ agentId: agent.id, feature: requested, reason: 'UNKNOWN_FEATURE' });
      continue;
    }
    if (agent.version < feature.minimumAgentVersion) {
      blocked.push({ agentId: agent.id, feature: requested, reason: 'AGENT_TOO_OLD' });
      continue;
    }
    if (!agent.supportsOptionalFields && feature.requiredFields.length > input.baseFieldCount) {
      blocked.push({ agentId: agent.id, feature: requested, reason: 'REQUIRED_FIELD_UNSUPPORTED' });
      continue;
    }
    evaluations.push({ agentId: agent.id, feature: requested, enabled: true });
  }
}

assert.deepEqual(evaluations.map((entry) => entry.agentId + ':' + entry.feature), [
  'agent-new:file-tail-v3',
  'agent-new:jaeger-trace-v2',
  'agent-old:file-tail-v2'
]);
assert.deepEqual(blocked, [
  { agentId: 'agent-old', feature: 'file-tail-v3', reason: 'AGENT_TOO_OLD' }
]);

console.log(JSON.stringify({
  releaseOrder: ['control-plane-forward-compatible', 'upgrade-agents', 'enable-v3-features'],
  evaluations,
  blocked
}, null, 2));
`,
      },
      stdin:
        '{"baseFieldCount":2,"serverFeatures":[{"name":"file-tail-v2","minimumAgentVersion":2,"requiredFields":["path","include"]},{"name":"file-tail-v3","minimumAgentVersion":3,"requiredFields":["path","include","cursorMode"]},{"name":"jaeger-trace-v2","minimumAgentVersion":3,"requiredFields":["endpoint","sampleRate"]}],"agents":[{"id":"agent-new","version":3,"supportsOptionalFields":true,"requestedFeatures":["file-tail-v3","jaeger-trace-v2"]},{"id":"agent-old","version":2,"supportsOptionalFields":true,"requestedFeatures":["file-tail-v3","file-tail-v2"]}]}',
      checkpoint:
        '可用功能必须为新 Agent 的 file-tail-v3、jaeger-trace-v2 和旧 Agent 的 file-tail-v2；v3 对旧 Agent 必须返回 AGENT_TOO_OLD。控制面要向前兼容，不能假设所有 Agent 同时升级。',
    },
    apply: {
      id: 'p15-logforge-release-gate-independent',
      title: '独立实践：用队列和丢弃指标卡住发布',
      brief:
        '运行 node main.js。汇总灰度 Agent 的队列峰值、丢弃率、发送 P95 和配置错误，输出继续或回滚及具体原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

const totalEvents = input.agents.reduce((sum, agent) => sum + agent.events, 0);
const totalDropped = input.agents.reduce((sum, agent) => sum + agent.dropped, 0);
const queuePeakRatio = Math.max(...input.agents.map((agent) => agent.queuePeak / agent.queueLimit));
const sendP95Ms = percentile(input.agents.flatMap((agent) => agent.sendLatencies), 0.95);
const configErrors = input.agents.reduce((sum, agent) => sum + agent.configErrors, 0);
const dropRate = totalDropped / totalEvents;
const reasons = [];

if (queuePeakRatio > input.limits.maximumQueuePeakRatio) reasons.push('QUEUE_PEAK_EXCEEDED');
if (dropRate > input.limits.maximumDropRate) reasons.push('DROP_RATE_EXCEEDED');
if (sendP95Ms > input.limits.maximumSendP95Ms) reasons.push('SEND_P95_EXCEEDED');
if (configErrors > input.limits.maximumConfigErrors) reasons.push('CONFIG_ERRORS_EXCEEDED');

const decision = reasons.length === 0 ? 'increase-rollout' : 'rollback';
assert.equal(Number(queuePeakRatio.toFixed(2)), 0.9);
assert.equal(Number(dropRate.toFixed(4)), 0.006);
assert.equal(sendP95Ms, 260);
assert.deepEqual(reasons, [
  'QUEUE_PEAK_EXCEEDED',
  'DROP_RATE_EXCEEDED',
  'SEND_P95_EXCEEDED'
]);
assert.equal(decision, 'rollback');

console.log(JSON.stringify({
  queuePeakRatio: Number(queuePeakRatio.toFixed(2)),
  dropRate: Number(dropRate.toFixed(4)),
  sendP95Ms,
  configErrors,
  reasons,
  decision
}, null, 2));
`,
      },
      stdin:
        '{"limits":{"maximumQueuePeakRatio":0.8,"maximumDropRate":0.005,"maximumSendP95Ms":200,"maximumConfigErrors":0},"agents":[{"id":"agent-a","events":1000,"dropped":7,"queuePeak":90,"queueLimit":100,"sendLatencies":[120,180,240,300],"configErrors":0},{"id":"agent-b","events":1000,"dropped":5,"queuePeak":80,"queueLimit":100,"sendLatencies":[140,160,220,260],"configErrors":0}]}',
      checkpoint:
        'queuePeakRatio=0.9、dropRate=0.006、sendP95Ms=260，reasons 必须包含三项超限，decision=rollback。发布门禁必须同时看资源、丢失和延迟。',
    },
  },

  'programming:综合训练 · LogForge 日志采集器 · 故障演练、回滚与项目答辩': {
    title: 'LogForge 代码台 10 · 故障注入恢复与源码答辩',
    description:
      '在目标断网、慢盘和规则复杂度越界时保持内存有界；再根据时间线、对账与回滚证据判断项目答辩是否完整。',
    ...nodeRuntime,
    practice: {
      id: 'p15-logforge-multi-fault-drill-guided',
      title: '跟做：三类故障都保持有界和可审计',
      brief:
        '运行 node main.js。依次注入接收端不可用、慢盘和指数级规则，执行暂停/丢弃/拒绝策略并输出恢复范围。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const drills = input.scenarios.map((scenario) => {
  if (scenario.type === 'sink-down') {
    const retained = Math.min(scenario.queuedEvents, scenario.maxQueue);
    return {
      name: scenario.type,
      action: 'pause-reading',
      queuePeak: retained,
      lost: scenario.queuedEvents - retained,
      memoryBounded: true
    };
  }
  if (scenario.type === 'slow-disk') {
    const cpuPercent = scenario.pollIntervalMs >= 200 ? 18 : 95;
    return {
      name: scenario.type,
      action: 'adaptive-polling',
      cpuPercent,
      memoryBounded: true
    };
  }
  if (scenario.type === 'regex-explosion') {
    const rejected = scenario.estimatedMatchMs > scenario.budgetMs;
    return {
      name: scenario.type,
      action: rejected ? 'reject-rule' : 'apply-rule',
      rejected,
      memoryBounded: true
    };
  }
  throw new Error('UNKNOWN_DRILL:' + scenario.type);
});

const unsafe = drills.filter((drill) => drill.memoryBounded !== true);
assert.deepEqual(drills.map((drill) => drill.action), [
  'pause-reading',
  'adaptive-polling',
  'reject-rule'
]);
assert.equal(drills[0].queuePeak, input.scenarios[0].maxQueue);
assert.equal(drills[1].cpuPercent < 30, true);
assert.equal(drills[2].rejected, true);
assert.deepEqual(unsafe, []);

console.log(JSON.stringify({
  drills,
  unsafe,
  recovery: 'resume-from-committed-cursor-and-deduplicate-replay'
}, null, 2));
`,
      },
      stdin:
        '{"scenarios":[{"type":"sink-down","queuedEvents":12,"maxQueue":5},{"type":"slow-disk","pollIntervalMs":240},{"type":"regex-explosion","estimatedMatchMs":8000,"budgetMs":50}]}',
      checkpoint:
        '动作必须依次为 pause-reading、adaptive-polling、reject-rule；暂停后队列峰值不超过 5，慢盘 CPU 低于 30%，高复杂度规则被拒绝。内存有界是三种故障的共同不变量。',
    },
    apply: {
      id: 'p15-logforge-incident-defense-independent',
      title: '独立实践：用时间线和对账证据做答辩',
      brief:
        '运行 node main.js。检查故障时间线是否按序、恢复和回滚是否都有证据、事件对账是否闭合，列出答辩缺口。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const timelineOrdered = input.timeline.every((entry, index) => (
  index === 0 || entry.at >= input.timeline[index - 1].at
));
const evidenceIds = new Set(input.evidence.map((item) => item.id));
const requiredClaims = ['bounded-memory', 'no-permanent-loss', 'cursor-recovery', 'rollback'];
const claimResults = requiredClaims.map((claimId) => {
  const claim = input.claims.find((candidate) => candidate.id === claimId);
  const citations = claim ? claim.evidenceIds.filter((id) => evidenceIds.has(id)) : [];
  return {
    claimId,
    cited: Boolean(claim),
    evidenceCount: citations.length,
    supported: Boolean(claim) && citations.length > 0
  };
});
const balance = input.reconciliation.inputEvents
  - input.reconciliation.acceptedOnce
  - input.reconciliation.dropped
  - input.reconciliation.pending;
const unsupported = claimResults.filter((claim) => !claim.supported).map((claim) => claim.claimId);
const defenseReady = timelineOrdered && balance === 0 && unsupported.length === 0;

assert.equal(timelineOrdered, true);
assert.equal(balance, 0);
assert.deepEqual(unsupported, ['bounded-memory', 'rollback']);
assert.equal(defenseReady, false);

console.log(JSON.stringify({
  timelineOrdered,
  balance,
  claimResults,
  unsupported,
  defenseReady,
  missingEvidence: [
    'queue high-water metric under sink outage',
    'binary rollback followed by captured event reconciliation'
  ]
}, null, 2));
`,
      },
      stdin:
        '{"timeline":[{"at":1,"event":"sink-timeout"},{"at":2,"event":"pause-reading"},{"at":3,"event":"rollback"},{"at":4,"event":"restart"}],"evidence":[{"id":"ev-queue"},{"id":"ev-reconcile"},{"id":"ev-restart"}],"claims":[{"id":"bounded-memory","evidenceIds":[]},{"id":"no-permanent-loss","evidenceIds":["ev-reconcile"]},{"id":"cursor-recovery","evidenceIds":["ev-restart"]},{"id":"rollback","evidenceIds":[]}],"reconciliation":{"inputEvents":1000,"acceptedOnce":980,"dropped":15,"pending":5}}',
      checkpoint:
        'timelineOrdered=true、事件对账 balance=0；bounded-memory 与 rollback 必须未支持，defenseReady=false。答辩必须用队列峰值、无永久丢失、游标恢复和回滚后的对账数据逐项举证。',
    },
  },
};
