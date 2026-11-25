import type { LearningV2CodeLab } from './v2-types.js';

/**
 * P15 综合训练：LaunchPad 发布平台与 Canvas 实时协作代码实验室。
 *
 * 所有任务只使用 Node.js 标准库。审批、版本控制、消息、数据库和故障注入
 * 都是进程内确定性模拟；代码通过断言和可核对输出验证当前任务的不变量。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库与确定性内存模型',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装第三方依赖。',
    '先原样运行代码读取 stdin 中的项目夹具，再按 checkpoint 修改独立实践。',
    '断言失败会以非零退出码结束；通过时保存输出中的版本、审批或收敛证据。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_P15_LAUNCHPAD_CANVAS: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:综合训练 · LaunchPad 发布平台 · 业务理解与用户任务': {
    title: 'LaunchPad 代码台 01 · 把发布任务交给正确角色',
    description:
      '根据角色能力、目标环境和任务动作生成发布任务路由。能力缺失与生产审批自批都必须产生明确拒绝原因。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-role-routing-guided',
      title: '跟做：按能力和环境路由发布动作',
      brief:
        '运行 node main.js。逐条判断开发、审批和运维任务是否能执行，并检查生产审批只能由独立审批角色完成。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const assignments = [];

for (const task of input.tasks) {
  if (task.actor === task.submitter && task.action === 'release:approve' && task.env === 'prod') {
    assignments.push({ ...task, allowed: false, reason: 'APPROVER_MUST_DIFFER_FROM_SUBMITTER' });
    continue;
  }
  const capabilities = new Set(input.roles[task.actor] || []);
  assignments.push({
    ...task,
    allowed: capabilities.has(task.action),
    reason: capabilities.has(task.action) ? 'CAPABILITY_GRANTED' : 'CAPABILITY_MISSING'
  });
}

const denied = assignments.filter((task) => !task.allowed);
assert.equal(assignments.filter((task) => task.allowed).length, 4);
assert.equal(denied.length, 1);
assert.equal(denied[0].id, 'self-approve');
assert.equal(denied[0].reason, 'APPROVER_MUST_DIFFER_FROM_SUBMITTER');

console.log(JSON.stringify({
  assignments,
  denied: denied.map((task) => task.id),
  invariant: 'production approval requires a distinct actor'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        roles: {
          dev: ['release:create', 'release:submit'],
          approver: ['release:approve', 'release:rollback'],
          ops: ['release:deploy', 'release:rollback']
        },
        tasks: [
          { id: 'create-dev', actor: 'dev', submitter: 'dev', action: 'release:create', env: 'dev' },
          { id: 'submit-stage', actor: 'dev', submitter: 'dev', action: 'release:submit', env: 'stage' },
          { id: 'approve-prod', actor: 'approver', submitter: 'dev', action: 'release:approve', env: 'prod' },
          { id: 'self-approve', actor: 'approver', submitter: 'approver', action: 'release:approve', env: 'prod' },
          { id: 'rollback-prod', actor: 'ops', submitter: 'ops', action: 'release:rollback', env: 'prod' }
        ]
      }),
      checkpoint:
        '四条任务必须允许、只有 self-approve 被拒绝；拒绝原因必须是 APPROVER_MUST_DIFFER_FROM_SUBMITTER。仅凭按钮可见或角色名包含 approver，不能替代能力和提交人分离校验。',
    },
    apply: {
      id: 'p15-launchpad-user-journey-independent',
      title: '独立实践：用用户旅程覆盖发布状态',
      brief:
        '运行 node main.js。把创建、审批、部署和回滚动作与草稿、待审、已部署、回滚中状态组合，找出首版旅程缺口。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = [];
for (const action of input.actions) {
  for (const state of input.states) required.push(action + '@' + state);
}

const observed = new Set(input.observed);
const missing = required.filter((entry) => !observed.has(entry));
const unexpected = input.observed.filter((entry) => !required.includes(entry));
const coverage = Number(((required.length - missing.length) / required.length).toFixed(2));

assert.equal(required.length, 16);
assert.equal(missing.length, 4);
assert.equal(coverage, 0.75);
assert.ok(missing.includes('rollback@pending_approval'));
assert.equal(unexpected.length, 1);

console.log(JSON.stringify({
  coverage,
  missing,
  unexpected,
  journeyReady: missing.length === 0 && unexpected.length === 0
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        actions: ['create', 'approve', 'deploy', 'rollback'],
        states: ['draft', 'pending_approval', 'deployed', 'rollback_in_progress'],
        observed: [
          'create@draft',
          'create@pending_approval',
          'create@deployed',
          'create@rollback_in_progress',
          'approve@draft',
          'approve@pending_approval',
          'deploy@draft',
          'deploy@pending_approval',
          'deploy@deployed',
          'rollback@draft',
          'rollback@deployed',
          'rollback@rollback_in_progress',
          'approve@unknown'
        ]
      }),
      checkpoint:
        '覆盖率必须为 0.75，rollback@pending_approval 必须出现在缺口里；unexpected 必须暴露一个不属于旅程矩阵的状态。首版发布旅程不能只检查 happy path。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 范围、验收与非功能目标': {
    title: 'LaunchPad 代码台 02 · 审批门禁与灰度止损',
    description:
      '先验证发布审批的独立性和冻结窗口，再用真实样本计算错误率与 P95 延迟，决定灰度继续还是自动回滚。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-approval-gate-guided',
      title: '跟做：双人审批与变更冻结',
      brief:
        '运行 node main.js。检查审批数量、审批人唯一性、提交人回避、变更冻结和发布窗口，输出可解释的放行决定。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const reasonCodes = [];
const reviewers = new Set();
const approvedReviewers = new Set();

if (input.changeFreeze) reasonCodes.push('CHANGE_FREEZE_ACTIVE');
if (!input.windowOpen) reasonCodes.push('RELEASE_WINDOW_CLOSED');

for (const approval of input.approvals) {
  if (approval.decision !== 'approved') reasonCodes.push('APPROVAL_NOT_GRANTED');
  if (approval.reviewer === input.release.submitter) reasonCodes.push('SELF_APPROVAL_FORBIDDEN');
  if (reviewers.has(approval.reviewer)) reasonCodes.push('DUPLICATE_APPROVER');
  reviewers.add(approval.reviewer);
  if (approval.decision === 'approved') approvedReviewers.add(approval.reviewer);
}

if (approvedReviewers.size < input.requiredApprovals) reasonCodes.push('INSUFFICIENT_APPROVALS');

const allowed = reasonCodes.length === 0;
assert.equal(allowed, false);
assert.deepEqual([...new Set(reasonCodes)].sort(), [
  'APPROVAL_NOT_GRANTED',
  'CHANGE_FREEZE_ACTIVE',
  'SELF_APPROVAL_FORBIDDEN'
]);
assert.equal(approvedReviewers.size, 2);
assert.equal(reviewers.size, 3);

console.log(JSON.stringify({
  releaseId: input.release.id,
  targetEnv: input.release.env,
  allowed,
  approvers: [...approvedReviewers],
  reasonCodes: [...new Set(reasonCodes)]
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        release: { id: 'rel-1042', env: 'prod', submitter: 'dev-alice' },
        requiredApprovals: 2,
        changeFreeze: true,
        windowOpen: true,
        approvals: [
          { reviewer: 'dev-alice', decision: 'approved' },
          { reviewer: 'ops-bob', decision: 'approved' },
          { reviewer: 'sec-carol', decision: 'rejected' }
        ]
      }),
      checkpoint:
        '最终 allowed 必须为 false；批准人计数为 2，但提交人自批与 rejected 都必须阻止发布，变更冻结也同时生效。审批门禁不能只数“approved”的条数。',
    },
    apply: {
      id: 'p15-launchpad-canary-budget-independent',
      title: '独立实践：用灰度样本触发自动回滚',
      brief:
        '运行 node main.js。汇总两批灰度请求，计算错误率和 P95，再按阈值决定继续、暂停或回滚。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requests = input.batches.flatMap((batch) => batch.requests);
const errors = requests.filter((sample) => !sample.ok).length;
const errorRate = Number((errors / requests.length).toFixed(3));
const durations = requests.map((sample) => sample.ms).sort((a, b) => a - b);
const p95Index = Math.ceil(durations.length * 0.95) - 1;
const p95 = durations[p95Index];

let decision = 'promote';
if (errorRate >= input.limits.errorRateRollback || p95 >= input.limits.p95RollbackMs) {
  decision = 'rollback';
} else if (errorRate >= input.limits.errorRatePause || p95 >= input.limits.p95PauseMs) {
  decision = 'pause';
}

assert.equal(requests.length, 20);
assert.equal(errorRate, 0.2);
assert.equal(p95, 900);
assert.equal(decision, 'rollback');

console.log(JSON.stringify({
  decision,
  sampleCount: requests.length,
  errorRate,
  p95,
  limits: input.limits,
  action: decision === 'rollback' ? 'restore previous stable revision' : 'continue inspection'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        limits: {
          errorRatePause: 0.05,
          errorRateRollback: 0.15,
          p95PauseMs: 500,
          p95RollbackMs: 800
        },
        batches: [
          {
            name: 'canary-5pct',
            requests: [
              { ok: true, ms: 120 }, { ok: true, ms: 180 }, { ok: true, ms: 220 },
              { ok: false, ms: 900 }, { ok: true, ms: 160 }, { ok: true, ms: 240 },
              { ok: true, ms: 310 }, { ok: true, ms: 280 }, { ok: false, ms: 850 }, { ok: true, ms: 190 }
            ]
          },
          {
            name: 'canary-15pct',
            requests: [
              { ok: true, ms: 200 }, { ok: true, ms: 750 }, { ok: true, ms: 260 },
              { ok: true, ms: 340 }, { ok: false, ms: 920 }, { ok: true, ms: 170 },
              { ok: true, ms: 410 }, { ok: true, ms: 300 }, { ok: false, ms: 880 }, { ok: true, ms: 230 }
            ]
          }
        ]
      }),
      checkpoint:
        '样本数必须为 20，错误率必须为 0.2，P95 必须为 900；decision 必须为 rollback。若只看平均值或忽略尾延迟，就会留下继续放大的错误决策。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · API 契约与前端数据边界': {
    title: 'LaunchPad 代码台 03 · 幂等部署与会话版本',
    description:
      '分别验证部署请求幂等键和部署阶段版本令牌。重复请求只返回原结果，同键异文被拒绝，旧版本操作不能覆盖新状态。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-idempotent-deploy-guided',
      title: '跟做：同键同文复用，异文返回冲突',
      brief:
        '运行 node main.js。按幂等键和请求摘要处理部署请求，区分创建、重放与冲突三类响应。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ledger = new Map();
const responses = [];

for (const request of input.requests) {
  const prior = ledger.get(request.key);
  if (!prior) {
    const deployment = {
      deploymentId: 'dep-' + (ledger.size + 1),
      key: request.key,
      digest: request.digest,
      target: request.target
    };
    ledger.set(request.key, deployment);
    responses.push({ status: 201, outcome: 'created', deployment });
    continue;
  }
  if (prior.digest === request.digest) {
    responses.push({ status: 200, outcome: 'replayed', deployment: prior });
  } else {
    responses.push({ status: 409, outcome: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED' });
  }
}

assert.deepEqual(responses.map((item) => item.outcome), ['created', 'replayed', 'conflict']);
assert.equal(ledger.size, 1);
assert.equal(responses[0].deployment.deploymentId, responses[1].deployment.deploymentId);
assert.equal(responses[2].code, 'IDEMPOTENCY_KEY_REUSED');

console.log(JSON.stringify({ responses, ledgerSize: ledger.size }, null, 2));
`,
      },
      stdin: JSON.stringify({
        requests: [
          { key: 'deploy-order-42', digest: 'sha256:aaa', target: 'prod/order-api' },
          { key: 'deploy-order-42', digest: 'sha256:aaa', target: 'prod/order-api' },
          { key: 'deploy-order-42', digest: 'sha256:bbb', target: 'prod/order-api' }
        ]
      }),
      checkpoint:
        '响应必须依次为 created、replayed、conflict；前两条 deploymentId 相同，账本 size 仍为 1。同键异文不能被悄悄覆盖成新部署。',
    },
    apply: {
      id: 'p15-launchpad-api-session-version-independent',
      title: '独立实践：版本令牌阻止旧页面覆盖新部署',
      brief:
        '运行 node main.js。处理带会话版本和环境期望的部署命令；过期版本返回 409，重复确认按幂等回放处理。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const state = new Map(input.environments.map((entry) => [entry.name, entry]));
const seen = new Set();
const results = [];

for (const command of input.commands) {
  if (seen.has(command.commandId)) {
    results.push({ id: command.commandId, status: 200, outcome: 'idempotent-replay' });
    continue;
  }
  seen.add(command.commandId);
  const environment = state.get(command.env);
  if (!environment) {
    results.push({ id: command.commandId, status: 404, code: 'ENVIRONMENT_NOT_FOUND' });
  } else if (command.expectedVersion !== environment.version) {
    results.push({
      id: command.commandId,
      status: 409,
      code: 'STALE_SESSION_VERSION',
      currentVersion: environment.version
    });
  } else {
    environment.version += 1;
    environment.revision = command.revision;
    results.push({
      id: command.commandId,
      status: 202,
      outcome: 'accepted',
      nextVersion: environment.version
    });
  }
}

assert.deepEqual(results.map((item) => item.status), [202, 409, 200, 202]);
assert.equal(results[1].currentVersion, 4);
assert.equal(state.get('stage').version, 5);
assert.equal(state.get('stage').revision, 'orders-v19');

console.log(JSON.stringify({ results, environments: [...state.values()] }, null, 2));
`,
      },
      stdin: JSON.stringify({
        environments: [
          { name: 'stage', version: 3, revision: 'orders-v17' },
          { name: 'prod', version: 9, revision: 'orders-v16' }
        ],
        commands: [
          { commandId: 'c1', env: 'stage', expectedVersion: 3, revision: 'orders-v18' },
          { commandId: 'c2', env: 'stage', expectedVersion: 3, revision: 'orders-v19' },
          { commandId: 'c1', env: 'stage', expectedVersion: 3, revision: 'orders-v18' },
          { commandId: 'c3', env: 'stage', expectedVersion: 4, revision: 'orders-v19' }
        ]
      }),
      checkpoint:
        '状态码必须依次为 202、409、200、202；第二条暴露 currentVersion=4，最终 stage 版本为 5 且 revision 为 orders-v19。旧页面不能用过期令牌覆盖较新发布。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 数据模型、约束与迁移': {
    title: 'LaunchPad 代码台 04 · 约束、扩展迁移与安全收口',
    description:
      '先检查版本唯一键和合法状态迁移，再执行 expand/backfill/cutover/cleanup 四段迁移，验证每一步都满足兼容与数量约束。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-release-constraints-guided',
      title: '跟做：唯一版本与发布状态约束',
      brief:
        '运行 node main.js。对应用、环境和制品版本建立唯一键，并拒绝从草稿直接跳到已部署。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const unique = new Set();
const accepted = [];
const rejected = [];
const transitions = {
  draft: new Set(['pending_approval']),
  pending_approval: new Set(['approved', 'cancelled']),
  approved: new Set(['deploying', 'cancelled']),
  deploying: new Set(['deployed', 'rollback_in_progress']),
  deployed: new Set(['rollback_in_progress']),
  rollback_in_progress: new Set(['rolled_back'])
};

for (const record of input.records) {
  const key = [record.app, record.env, record.version].join(':');
  if (unique.has(key)) {
    rejected.push({ id: record.id, code: 'DUPLICATE_RELEASE_VERSION' });
  } else if (!transitions[record.from]?.has(record.to)) {
    rejected.push({ id: record.id, code: 'INVALID_STATE_TRANSITION' });
  } else {
    unique.add(key);
    accepted.push({ id: record.id, key, transition: record.from + '->' + record.to });
  }
}

assert.equal(accepted.length, 2);
assert.deepEqual(rejected.map((item) => item.code), [
  'DUPLICATE_RELEASE_VERSION',
  'INVALID_STATE_TRANSITION'
]);
assert.equal(unique.size, 2);

console.log(JSON.stringify({ accepted, rejected, uniqueKeys: [...unique] }, null, 2));
`,
      },
      stdin: JSON.stringify({
        records: [
          {
            id: 'r1', app: 'billing', env: 'stage', version: '2.4.0',
            from: 'pending_approval', to: 'approved'
          },
          {
            id: 'r2', app: 'billing', env: 'stage', version: '2.4.0',
            from: 'approved', to: 'deploying'
          },
          {
            id: 'r3', app: 'billing', env: 'stage', version: '2.4.1',
            from: 'draft', to: 'deployed'
          },
          {
            id: 'r4', app: 'billing', env: 'prod', version: '2.4.0',
            from: 'pending_approval', to: 'approved'
          }
        ]
      }),
      checkpoint:
        '只允许两条记录；拒绝码依次为 DUPLICATE_RELEASE_VERSION 和 INVALID_STATE_TRANSITION。复合唯一键必须同时包含应用、环境和版本，状态也不能跨越审批阶段。',
    },
    apply: {
      id: 'p15-launchpad-expand-migration-independent',
      title: '独立实践：分阶段迁移发布表',
      brief:
        '运行 node main.js。按依赖顺序安排加列、回填、双读切换和删旧列，并验证回填数量后才能进入破坏性步骤。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const byStep = new Map(input.migration.steps.map((step) => [step.id, step]));
const completed = new Set();
const executed = [];
const blocked = [];

for (const step of input.migration.steps) {
  const missing = step.after.filter((dependency) => !completed.has(dependency));
  if (missing.length > 0) {
    blocked.push({ id: step.id, missing });
    continue;
  }
  if (step.id === 'cutover' && input.migration.backfilledRows !== input.migration.totalRows) {
    blocked.push({ id: step.id, missing: ['backfill-row-parity'] });
    continue;
  }
  byStep.get(step.id).executed = true;
  completed.add(step.id);
  executed.push(step.id);
}

const rollbackPlan = [...executed].reverse().filter((id) => id !== 'drop-old-column');
assert.deepEqual(executed, ['expand', 'backfill', 'verify', 'cutover', 'drop-old-column']);
assert.deepEqual(blocked, []);
assert.equal(input.migration.backfilledRows, 1200);
assert.ok(rollbackPlan.indexOf('verify') < rollbackPlan.indexOf('backfill'));

console.log(JSON.stringify({
  executed,
  blocked,
  rollbackPlan,
  destructiveStepLast: executed.at(-1) === 'drop-old-column'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        migration: {
          totalRows: 1200,
          backfilledRows: 1200,
          steps: [
            { id: 'expand', after: [], sql: 'add nullable release_digest' },
            { id: 'backfill', after: ['expand'], sql: 'backfill release_digest' },
            { id: 'verify', after: ['backfill'], sql: 'verify no null digests' },
            { id: 'cutover', after: ['verify'], sql: 'switch reads and writes' },
            { id: 'drop-old-column', after: ['cutover'], sql: 'drop legacy checksum' }
          ]
        }
      }),
      checkpoint:
        '五步必须全部执行且 drop-old-column 最后；blocked 为空，回填行数等于总行数。回滚顺序必须能在删除旧列之前恢复到旧读写路径。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 项目骨架、模块边界与本地环境': {
    title: 'LaunchPad 代码台 05 · 配置覆盖与模块依赖边界',
    description:
      '先验证默认、环境、发布和本地覆盖的确定性优先级，再检查部署服务模块依赖是否越过允许边界或形成循环。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-config-resolution-guided',
      title: '跟做：解析分层发布配置',
      brief:
        '运行 node main.js。按固定优先级合并配置层，解析 secret 引用，并断言生产环境不能使用明文密钥。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ordered = [...input.layers].sort((left, right) => left.order - right.order);
const config = {};
const sources = {};

for (const layer of ordered) {
  for (const [key, value] of Object.entries(layer.values)) {
    config[key] = value;
    sources[key] = layer.name;
  }
}

const plaintextSecrets = Object.entries(config)
  .filter(([key, value]) => key.startsWith('secret.') && !String(value).startsWith('secretRef:'))
  .map(([key]) => key);

assert.equal(config['api.timeoutMs'], 1500);
assert.equal(config['feature.autoRollback'], true);
assert.equal(sources['api.timeoutMs'], 'environment');
assert.equal(sources['feature.autoRollback'], 'local');
assert.deepEqual(plaintextSecrets, ['secret.deployToken']);

console.log(JSON.stringify({
  effectiveConfig: config,
  sources,
  plaintextSecrets,
  valid: plaintextSecrets.length === 0
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        layers: [
          {
            name: 'default', order: 1,
            values: { 'api.timeoutMs': 3000, 'feature.autoRollback': false, 'secret.deployToken': 'secretRef:vault/deploy' }
          },
          {
            name: 'environment', order: 2,
            values: { 'api.timeoutMs': 1500, 'secret.deployToken': 'plain-token-123' }
          },
          {
            name: 'release', order: 3,
            values: { 'feature.autoRollback': true }
          },
          {
            name: 'local', order: 4,
            values: { 'feature.autoRollback': true }
          }
        ]
      }),
      checkpoint:
        '有效超时必须是 1500，autoRollback 来自 local；plaintextSecrets 必须发现 secret.deployToken。配置优先级与 secret 引用要分别验证，不能因为后层覆盖就跳过泄漏检查。',
    },
    apply: {
      id: 'p15-launchpad-module-boundary-independent',
      title: '独立实践：阻止部署模块跨层依赖',
      brief:
        '运行 node main.js。校验模块导入边是否属于允许方向，并找出依赖环和需要拆出的基础设施调用。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = new Set(input.allowedEdges);
const violations = input.edges
  .filter((edge) => !allowed.has(edge.from + '->' + edge.to));
const graph = new Map();

for (const edge of input.edges) {
  if (!graph.has(edge.from)) graph.set(edge.from, []);
  graph.get(edge.from).push(edge.to);
}

function findCycle(node, path, visiting) {
  if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
  if (path.includes(node)) return null;
  const nextVisiting = new Set(visiting).add(node);
  for (const next of graph.get(node) || []) {
    const cycle = findCycle(next, [...path, node], nextVisiting);
    if (cycle) return cycle;
  }
  return null;
}

const cycles = [];
for (const node of graph.keys()) {
  const cycle = findCycle(node, [], new Set());
  if (cycle) cycles.push(cycle.join('->'));
}

assert.deepEqual(violations, [
  { from: 'domain', to: 'infrastructure' },
  { from: 'api', to: 'database' },
  { from: 'application', to: 'api' }
]);
assert.equal(cycles.length > 0, true);

console.log(JSON.stringify({
  violations,
  cycles: [...new Set(cycles)],
  boundaryReady: violations.length === 0
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        allowedEdges: [
          'api->application', 'application->domain',
          'infrastructure->application', 'infrastructure->domain',
          'worker->application'
        ],
        edges: [
          { from: 'api', to: 'application' },
          { from: 'application', to: 'domain' },
          { from: 'domain', to: 'infrastructure' },
          { from: 'api', to: 'database' },
          { from: 'infrastructure', to: 'application' },
          { from: 'application', to: 'api' }
        ]
      }),
      checkpoint:
        '必须找出 domain->infrastructure、api->database 和 application->api 三条越界边，并至少发现一个依赖环；boundaryReady 必须为 false。领域层不能直接依赖基础设施。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 后端核心链路与异常恢复': {
    title: 'LaunchPad 代码台 06 · 发布状态机与检查点续跑',
    description:
      '先执行带重试的发布状态机，验证重复事件不会重复产生副作用；再从检查点恢复失败流水线，只重跑未完成步骤。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-release-state-machine-guided',
      title: '跟做：可重试的发布状态机',
      brief:
        '运行 node main.js。应用部署、健康检查失败、重试和晋升事件，并对重复事件 ID 做幂等过滤。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
const state = { phase: 'created', revision: 0, retries: 0, sideEffects: [] };

for (const event of input.events) {
  if (seen.has(event.id)) continue;
  seen.add(event.id);

  if (event.type === 'deploy' && state.phase === 'created') {
    state.phase = 'deploying';
    state.sideEffects.push('deployment-created');
  } else if (event.type === 'health-failed' && state.phase === 'deploying') {
    state.phase = 'failed';
    state.sideEffects.push('traffic-blocked');
  } else if (event.type === 'retry' && state.phase === 'failed') {
    state.phase = 'deploying';
    state.retries += 1;
    state.sideEffects.push('deployment-created');
  } else if (event.type === 'health-passed' && state.phase === 'deploying') {
    state.phase = 'healthy';
  } else if (event.type === 'promote' && state.phase === 'healthy') {
    state.phase = 'released';
    state.revision += 1;
    state.sideEffects.push('traffic-promoted');
  }
}

assert.equal(state.phase, 'released');
assert.equal(state.revision, 1);
assert.equal(state.retries, 1);
assert.equal(state.sideEffects.filter((item) => item === 'deployment-created').length, 2);
assert.equal(new Set(seen).size, input.events.length - 1);

console.log(JSON.stringify({ state, processedEvents: seen.size }, null, 2));
`,
      },
      stdin: JSON.stringify({
        events: [
          { id: 'e1', type: 'deploy' },
          { id: 'e2', type: 'health-failed' },
          { id: 'e3', type: 'retry' },
          { id: 'e4', type: 'health-passed' },
          { id: 'e3', type: 'retry' },
          { id: 'e5', type: 'promote' }
        ]
      }),
      checkpoint:
        '最终阶段必须为 released，revision=1、retries=1；deployment-created 只能出现两次。重复 retry 事件不能再次创建部署，副作用数量必须与有效转换一致。',
    },
    apply: {
      id: 'p15-launchpad-checkpoint-resume-independent',
      title: '独立实践：从发布检查点继续流水线',
      brief:
        '运行 node main.js。跳过已完成步骤，只重跑待执行与可重试失败步骤；不可重试失败必须阻止后续晋升。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const attempts = [];
const skipped = [];
const blocked = [];
let halted = false;

for (const step of input.pipeline.steps) {
  if (halted) {
    blocked.push({ id: step.id, reason: 'UPSTREAM_STEP_FAILED' });
    continue;
  }
  if (step.status === 'completed') {
    skipped.push(step.id);
    continue;
  }
  if (step.status === 'failed' && !step.retryable) {
    blocked.push({ id: step.id, reason: 'NON_RETRYABLE_FAILURE' });
    halted = true;
    continue;
  }
  attempts.push({ id: step.id, previousStatus: step.status });
  if (step.id === 'security-scan') {
    blocked.push({ id: step.id, reason: 'VULNERABILITY_BUDGET_EXCEEDED' });
    halted = true;
  }
}

assert.deepEqual(skipped, ['checkout', 'build']);
assert.deepEqual(attempts.map((item) => item.id), ['integration-test', 'security-scan']);
assert.deepEqual(blocked.map((item) => item.reason), [
  'VULNERABILITY_BUDGET_EXCEEDED',
  'UPSTREAM_STEP_FAILED'
]);
assert.equal(halted, true);

console.log(JSON.stringify({ attempts, skipped, blocked, resumeFrom: 'integration-test' }, null, 2));
`,
      },
      stdin: JSON.stringify({
        pipeline: {
          runId: 'run-207',
          steps: [
            { id: 'checkout', status: 'completed', retryable: false },
            { id: 'build', status: 'completed', retryable: false },
            { id: 'integration-test', status: 'failed', retryable: true },
            { id: 'security-scan', status: 'pending', retryable: true },
            { id: 'promote', status: 'pending', retryable: false }
          ]
        }
      }),
      checkpoint:
        'checkout 与 build 必须跳过；只重跑 integration-test 和 security-scan。安全扫描越界后 promote 必须以 UPSTREAM_STEP_FAILED 阻断，不能从检查点跳到生产晋升。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 前端页面、状态与可访问交互': {
    title: 'LaunchPad 代码台 07 · 异步发布状态与键盘审批',
    description:
      '先用请求版本过滤过期成功/失败事件，再实现审批弹层的焦点约束、方向键切换和 Escape 返回，保证异步状态与键盘操作都可验证。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-async-release-reducer-guided',
      title: '跟做：忽略过期发布响应',
      brief:
        '运行 node main.js。按请求 ID 归并提交、成功和迟到失败事件，只让当前请求改变按钮状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let state = { status: 'idle', activeRequest: null, confirmedRevision: null, ignored: [] };

for (const event of input.events) {
  if (event.type === 'submit') {
    state = { ...state, status: 'pending', activeRequest: event.requestId, ignored: state.ignored };
    continue;
  }
  if (event.requestId !== state.activeRequest) {
    state.ignored.push({ requestId: event.requestId, reason: 'STALE_REQUEST' });
    continue;
  }
  if (event.type === 'failed' && state.status === 'confirmed') {
    state.ignored.push({ requestId: event.requestId, reason: 'RESPONSE_AFTER_CONFIRMATION' });
    continue;
  }
  if (event.type === 'failed') state.status = 'error';
  if (event.type === 'confirmed') {
    state.status = 'confirmed';
    state.confirmedRevision = event.revision;
  }
}

assert.equal(state.status, 'confirmed');
assert.equal(state.confirmedRevision, 'orders-v31');
assert.deepEqual(state.ignored.map((item) => item.reason), [
  'STALE_REQUEST',
  'RESPONSE_AFTER_CONFIRMATION'
]);

console.log(JSON.stringify({ state }, null, 2));
`,
      },
      stdin: JSON.stringify({
        events: [
          { type: 'submit', requestId: 'req-1' },
          { type: 'failed', requestId: 'req-0', message: 'old network response' },
          { type: 'confirmed', requestId: 'req-1', revision: 'orders-v31' },
          { type: 'failed', requestId: 'req-1', message: 'late timeout' }
        ]
      }),
      checkpoint:
        '最终状态必须是 confirmed，revision 为 orders-v31；两个迟到事件必须分别记录 STALE_REQUEST 和 RESPONSE_AFTER_CONFIRMATION。异步失败不能覆盖已确认的同一请求。',
    },
    apply: {
      id: 'p15-launchpad-approval-keyboard-independent',
      title: '独立实践：键盘可操作的审批弹层',
      brief:
        '运行 node main.js。处理 Tab、Shift+Tab、ArrowRight、Enter 和 Escape，验证焦点不离开弹层，关闭后回到原触发按钮。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const focusables = input.dialog.focusables;
let index = 0;
let open = true;
let focusedAfterClose = null;
let selected = null;
const trace = [];

for (const key of input.keys) {
  if (!open) break;
  if (key === 'Tab') index = (index + 1) % focusables.length;
  if (key === 'Shift+Tab') index = (index - 1 + focusables.length) % focusables.length;
  if (key === 'ArrowRight') {
    selected = selected === 'approve' ? 'reject' : 'approve';
  }
  if (key === 'Enter' && focusables[index] === 'confirm') {
    trace.push({ action: 'approve', selected });
  }
  if (key === 'Escape') {
    open = false;
    focusedAfterClose = input.dialog.returnFocusId;
  }
  trace.push({ key, focus: focusables[index], open, selected });
}

assert.equal(selected, 'approve');
assert.equal(open, false);
assert.equal(focusedAfterClose, 'open-approval-dialog');
assert.equal(index, 0);

console.log(JSON.stringify({
  dialogOpen: open,
  selected,
  focusedAfterClose,
  trace
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        dialog: {
          focusables: ['reject', 'confirm', 'cancel'],
          returnFocusId: 'open-approval-dialog'
        },
        keys: ['ArrowRight', 'Tab', 'Enter', 'Shift+Tab', 'Escape']
      }),
      checkpoint:
        '选中动作必须是 approve，弹层关闭后焦点回到 open-approval-dialog；焦点索引最终为 0。Enter 不能越过当前焦点误触确认，Escape 必须恢复触发位置。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 联调、测试、安全与性能': {
    title: 'LaunchPad 代码台 08 · 权限回归与尾延迟预算',
    description:
      '先验证审批、部署和日志接口的主体权限及请求头边界，再用固定样本计算 P95/P99 和错误预算，阻止不合格发布。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-security-regression-guided',
      title: '跟做：发布接口权限与请求头回归',
      brief:
        '运行 node main.js。逐条检查角色、CSRF、内容类型和环境限制，拒绝越权审批并保留审计原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const policy = {
  'approve-prod': { roles: ['release-manager'], csrf: true },
  'deploy-prod': { roles: ['sre'], csrf: true },
  'read-logs': { roles: ['sre', 'release-manager', 'auditor'], csrf: false }
};
const results = [];

for (const request of input.requests) {
  const rule = policy[request.action];
  const reasons = [];
  if (!rule) reasons.push('UNKNOWN_ACTION');
  if (rule && !rule.roles.includes(request.role)) reasons.push('ROLE_FORBIDDEN');
  if (rule?.csrf && !request.csrfToken) reasons.push('CSRF_REQUIRED');
  if (request.action === 'approve-prod' && request.role === 'release-manager' && !request.mfa) {
    reasons.push('MFA_REQUIRED');
  }
  results.push({ id: request.id, allowed: reasons.length === 0, reasons });
}

assert.deepEqual(results.map((item) => item.allowed), [false, false, true, false]);
assert.deepEqual(results[0].reasons, ['MFA_REQUIRED']);
assert.deepEqual(results[1].reasons, ['ROLE_FORBIDDEN']);
assert.deepEqual(results[3].reasons, ['CSRF_REQUIRED']);

console.log(JSON.stringify({ results, auditEntries: results.length }, null, 2));
`,
      },
      stdin: JSON.stringify({
        requests: [
          { id: 'q1', action: 'approve-prod', role: 'release-manager', csrfToken: 'csrf-1', mfa: false },
          { id: 'q2', action: 'approve-prod', role: 'viewer', csrfToken: 'csrf-2', mfa: true },
          { id: 'q3', action: 'read-logs', role: 'auditor', csrfToken: '', mfa: false },
          { id: 'q4', action: 'deploy-prod', role: 'sre', csrfToken: '', mfa: true }
        ]
      }),
      checkpoint:
        '允许结果必须依次为 false、false、true、false；越权、缺 MFA 和缺 CSRF 都要有独立原因。只读日志可以不需要 CSRF，但生产部署必须同时校验角色与请求头。',
    },
    apply: {
      id: 'p15-launchpad-tail-latency-independent',
      title: '独立实践：按 P95/P99 和错误预算放行',
      brief:
        '运行 node main.js。从请求样本计算 P95、P99、错误率与预算燃烧率，生成 promote、pause 或 rollback 决策。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const samples = input.samples;
const percentile = (ratio) => {
  const values = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  return values[Math.ceil(values.length * ratio) - 1];
};
const failures = samples.filter((sample) => !sample.ok).length;
const errorRate = failures / samples.length;
const p95 = percentile(0.95);
const p99 = percentile(0.99);
const burnRate = Number((errorRate / input.slo.errorRate).toFixed(2));

let decision = 'promote';
if (burnRate >= 2 || p99 > input.slo.p99RollbackMs) decision = 'rollback';
else if (burnRate > 1 || p95 > input.slo.p95PauseMs) decision = 'pause';

assert.equal(p95, 890);
assert.equal(p99, 950);
assert.equal(burnRate, 1.8);
assert.equal(decision, 'pause');

console.log(JSON.stringify({
  sampleCount: samples.length,
  p95,
  p99,
  errorRate,
  burnRate,
  decision
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        slo: {
          errorRate: 0.0278,
          p95PauseMs: 600,
          p99RollbackMs: 1000
        },
        samples: [
          { ok: true, ms: 110 }, { ok: true, ms: 160 }, { ok: true, ms: 220 },
          { ok: true, ms: 260 }, { ok: true, ms: 340 }, { ok: true, ms: 410 },
          { ok: true, ms: 480 }, { ok: true, ms: 560 }, { ok: true, ms: 590 },
          { ok: true, ms: 620 }, { ok: true, ms: 650 }, { ok: true, ms: 670 },
          { ok: true, ms: 680 }, { ok: true, ms: 690 }, { ok: true, ms: 710 },
          { ok: true, ms: 740 }, { ok: true, ms: 760 }, { ok: true, ms: 820 },
          { ok: true, ms: 890 }, { ok: false, ms: 950 }
        ]
      }),
      checkpoint:
        'P95 必须为 890、P99 必须为 950、错误预算燃烧率为 1.8，决策必须是 pause。P99 未越过回滚线但 P95 和燃烧率均已进入暂停区，不能只看平均值。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 容器、CI/CD、可观测与发布': {
    title: 'LaunchPad 代码台 09 · 不可变制品晋升与观测门禁',
    description:
      '先验证同一制品摘要按 dev、stage、prod 顺序晋升且不能跳级，再用多窗口错误率和 Trace 覆盖率驱动发布门禁。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-artifact-promotion-guided',
      title: '跟做：不可变制品按环境顺序晋升',
      brief:
        '运行 node main.js。检查每次晋升的版本、摘要、来源环境和目标环境，拒绝跳级与摘要被替换。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const expectedNext = { dev: 'stage', stage: 'prod' };
const artifacts = new Map(input.artifacts.map((artifact) => [artifact.version, artifact]));
const accepted = [];
const rejected = [];

for (const promotion of input.promotions) {
  const artifact = artifacts.get(promotion.version);
  const reasons = [];
  if (!artifact) reasons.push('ARTIFACT_NOT_FOUND');
  if (artifact && artifact.digest !== promotion.digest) reasons.push('DIGEST_MISMATCH');
  if (expectedNext[promotion.from] !== promotion.to) reasons.push('ENVIRONMENT_PROMOTION_SKIPPED');
  if (reasons.length > 0) {
    rejected.push({ id: promotion.id, reasons });
  } else {
    accepted.push({ id: promotion.id, version: promotion.version, to: promotion.to });
  }
}

assert.deepEqual(accepted.map((item) => item.to), ['stage', 'prod']);
assert.deepEqual(rejected[0].reasons, ['ENVIRONMENT_PROMOTION_SKIPPED']);
assert.deepEqual(rejected[1].reasons, ['DIGEST_MISMATCH']);
assert.equal(artifacts.get('3.8.2').digest, 'sha256:stable');

console.log(JSON.stringify({ accepted, rejected }, null, 2));
`,
      },
      stdin: JSON.stringify({
        artifacts: [
          { version: '3.8.1', digest: 'sha256:old', source: 'dev' },
          { version: '3.8.2', digest: 'sha256:stable', source: 'stage' }
        ],
        promotions: [
          { id: 'p1', version: '3.8.2', digest: 'sha256:stable', from: 'dev', to: 'stage' },
          { id: 'p2', version: '3.8.2', digest: 'sha256:stable', from: 'stage', to: 'prod' },
          { id: 'p3', version: '3.8.2', digest: 'sha256:stable', from: 'dev', to: 'prod' },
          { id: 'p4', version: '3.8.2', digest: 'sha256:rebuilt', from: 'stage', to: 'prod' }
        ]
      }),
      checkpoint:
        '只有 p1、p2 晋升成功；p3 因跳级被拒绝，p4 因摘要变化被拒绝。生产必须复用 stage 验证过的同一不可变制品，不能现场重新构建。',
    },
    apply: {
      id: 'p15-launchpad-observability-gate-independent',
      title: '独立实践：多窗口错误预算与 Trace 门禁',
      brief:
        '运行 node main.js。汇总短窗与长窗错误率，检查 Trace 覆盖率和采样完整性，给出可解释的放行或冻结决定。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const windows = input.windows.map((window) => {
  const rate = window.errors / window.requests;
  return {
    name: window.name,
    rate: Number(rate.toFixed(3)),
    burn: Number((rate / input.slo.errorRate).toFixed(2))
  };
});
const traceRatio = Number((input.telemetry.traced / input.telemetry.requests).toFixed(2));
const reasons = [];

if (windows.some((window) => window.burn >= 2)) reasons.push('FAST_ERROR_BUDGET_BURN');
if (windows.every((window) => window.burn > 1)) reasons.push('SUSTAINED_ERROR_BUDGET_BURN');
if (traceRatio < input.telemetry.requiredTraceRatio) reasons.push('TRACE_COVERAGE_LOW');
if (!input.telemetry.requiredAttributesPresent) reasons.push('TRACE_ATTRIBUTES_MISSING');

assert.deepEqual(windows.map((window) => window.burn), [2.4, 1.2, 0.6]);
assert.equal(traceRatio, 0.94);
assert.deepEqual(reasons, ['FAST_ERROR_BUDGET_BURN', 'TRACE_COVERAGE_LOW']);
assert.equal(reasons.length > 0, true);

console.log(JSON.stringify({
  windows,
  traceRatio,
  reasons,
  releaseGate: reasons.length === 0 ? 'open' : 'frozen'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        slo: { errorRate: 0.01 },
        windows: [
          { name: '5m', requests: 1000, errors: 24 },
          { name: '1h', requests: 10000, errors: 120 },
          { name: '6h', requests: 60000, errors: 360 }
        ],
        telemetry: {
          requests: 10000,
          traced: 9400,
          requiredTraceRatio: 0.99,
          requiredAttributesPresent: true
        }
      }),
      checkpoint:
        '三个窗口燃烧率必须依次为 2.4、1.2、0.6；Trace 比例为 0.94。门禁必须因短窗燃烧率和 Trace 覆盖不足冻结，不能因为长窗尚可就继续发布。',
    },
  },

  'programming:综合训练 · LaunchPad 发布平台 · 故障演练、回滚与项目答辩': {
    title: 'LaunchPad 代码台 10 · 历史回滚与答辩证据',
    description:
      '先从发布历史选择最近稳定版本并验证可回滚边界，再按恢复目标、演练结果和证据完整性形成可追溯的项目答辩结论。',
    ...nodeRuntime,
    practice: {
      id: 'p15-launchpad-safe-rollback-guided',
      title: '跟做：从发布历史选择安全回滚点',
      brief:
        '运行 node main.js。按时间选最近可回滚稳定版本，拒绝跨环境或不兼容的回滚目标，并保留当前失败版本审计。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const candidates = input.history
  .filter((release) => release.env === input.failed.env)
  .filter((release) => release.state === 'stable')
  .filter((release) => release.version < input.failed.version)
  .filter((release) => release.schemaVersion <= input.failed.schemaVersion)
  .sort((left, right) => right.deployedAt.localeCompare(left.deployedAt));
const target = candidates[0];

assert.equal(target.version, '1.8.4');
assert.equal(target.env, 'prod');
assert.equal(target.state, 'stable');
assert.equal(candidates.length, 2);

console.log(JSON.stringify({
  failedRelease: input.failed,
  rollbackTarget: target,
  rejectedCandidates: input.history.filter((release) => release.id !== target.id),
  auditAction: 'rollback-start'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        failed: {
          id: 'rel-9', version: '1.8.7', env: 'prod', schemaVersion: 12, state: 'failed'
        },
        history: [
          { id: 'rel-8', version: '1.8.6', env: 'stage', schemaVersion: 12, state: 'stable', deployedAt: '2026-11-20T10:00:00Z' },
          { id: 'rel-7', version: '1.8.5', env: 'prod', schemaVersion: 13, state: 'stable', deployedAt: '2026-11-19T10:00:00Z' },
          { id: 'rel-6', version: '1.8.4', env: 'prod', schemaVersion: 12, state: 'stable', deployedAt: '2026-11-18T10:00:00Z' },
          { id: 'rel-5', version: '1.8.3', env: 'prod', schemaVersion: 11, state: 'stable', deployedAt: '2026-11-17T10:00:00Z' }
        ]
      }),
      checkpoint:
        '回滚目标必须是 prod 的 1.8.4，而不能选择更新的 stage 版本或 schema 更高的 1.8.5。输出必须保留失败版本和审计动作，回滚不是删除事故记录。',
    },
    apply: {
      id: 'p15-launchpad-defense-evidence-independent',
      title: '独立实践：按恢复证据评估项目答辩',
      brief:
        '运行 node main.js。检查 RTO、RPO、回滚演练、告警处置和审计证据，计算答辩通过结论并列出失效项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [
  { id: 'rto', passed: input.recovery.actualRtoMinutes <= input.recovery.targetRtoMinutes },
  { id: 'rpo', passed: input.recovery.actualRpoMinutes <= input.recovery.targetRpoMinutes },
  { id: 'rollback-drill', passed: input.evidence.rollbackDrillPassed },
  { id: 'alert-ack', passed: input.evidence.alertAcknowledgedMinutes <= input.evidence.alertTargetMinutes },
  { id: 'audit-complete', passed: input.evidence.auditEvents >= input.evidence.requiredAuditEvents },
  { id: 'schema-compatible', passed: input.recovery.rollbackSchemaCompatible }
];
const failed = checks.filter((check) => !check.passed).map((check) => check.id);
const verdict = failed.length === 0 ? 'pass' : 'conditional-pass';

assert.equal(input.recovery.actualRtoMinutes, 14);
assert.deepEqual(failed, ['alert-ack']);
assert.equal(verdict, 'conditional-pass');
assert.equal(checks.filter((check) => check.passed).length, 5);

console.log(JSON.stringify({
  verdict,
  checks,
  failed,
  requiredFollowUp: 'reduce alert acknowledgement below 5 minutes and rerun incident drill'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        recovery: {
          targetRtoMinutes: 15,
          actualRtoMinutes: 14,
          targetRpoMinutes: 1,
          actualRpoMinutes: 0,
          rollbackSchemaCompatible: true
        },
        evidence: {
          rollbackDrillPassed: true,
          alertAcknowledgedMinutes: 8,
          alertTargetMinutes: 5,
          auditEvents: 42,
          requiredAuditEvents: 40
        }
      }),
      checkpoint:
        '六项检查中只有 alert-ack 失败，结论必须为 conditional-pass；RTO 14 分钟与 RPO 0 分钟要通过，但告警 8 分钟必须触发整改。答辩结论由证据逐项产生，不能只写一句“运行稳定”。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 业务理解与用户任务': {
    title: 'Canvas 代码台 01 · 协作对象权限与任务覆盖',
    description:
      '把所有者、编辑者、评论者和访客的角色能力与文档归属组合成访问决策，再用角色和连接状态覆盖协作任务。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-object-permission-guided',
      title: '跟做：按角色与归属决定协作动作',
      brief:
        '运行 node main.js。检查读取、编辑、评论和删除动作是否同时满足角色能力与对象归属，拒绝编辑者越权删除。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const documents = new Map(input.documents.map((document) => [document.id, document]));
const capabilities = {
  owner: new Set(['read', 'edit', 'comment', 'delete']),
  editor: new Set(['read', 'edit', 'comment']),
  commenter: new Set(['read', 'comment']),
  viewer: new Set(['read'])
};
const decisions = input.actions.map((action) => {
  const document = documents.get(action.documentId);
  const allowedByRole = capabilities[action.role]?.has(action.operation) === true;
  const ownsDocument = document?.ownerId === action.actorId;
  const isShared = document?.members.includes(action.actorId) === true;
  const allowed = allowedByRole && (action.operation === 'read' ? (ownsDocument || isShared || document?.public) : (ownsDocument || isShared));
  return {
    id: action.id,
    allowed,
    reason: allowed ? 'POLICY_GRANTED' : 'POLICY_DENIED'
  };
});

assert.deepEqual(decisions.map((item) => item.allowed), [true, true, false, false]);
assert.equal(decisions[2].reason, 'POLICY_DENIED');
assert.equal(documents.get('board-1').ownerId, 'alice');

console.log(JSON.stringify({ decisions }, null, 2));
`,
      },
      stdin: JSON.stringify({
        documents: [
          {
            id: 'board-1',
            ownerId: 'alice',
            members: ['bob', 'cara'],
            public: false
          }
        ],
        actions: [
          { id: 'a1', actorId: 'alice', role: 'owner', documentId: 'board-1', operation: 'delete' },
          { id: 'a2', actorId: 'bob', role: 'editor', documentId: 'board-1', operation: 'edit' },
          { id: 'a3', actorId: 'bob', role: 'editor', documentId: 'board-1', operation: 'delete' },
          { id: 'a4', actorId: 'dana', role: 'viewer', documentId: 'board-1', operation: 'read' }
        ]
      }),
      checkpoint:
        '允许结果必须依次为 true、true、false、false；编辑者不能删除文档，非成员访客也不能读取私有文档。角色能力、成员关系和对象归属要同时参与判定。',
    },
    apply: {
      id: 'p15-canvas-collaboration-coverage-independent',
      title: '独立实践：覆盖角色与连接状态矩阵',
      brief:
        '运行 node main.js。把编辑、评论、断线继续编辑和重连同步与角色状态组合，找出协作任务覆盖缺口。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cells = input.roles.flatMap((role) =>
  input.operations.map((operation) => role + '/' + operation)
);
const observed = new Set(input.observed);
const missing = cells.filter((cell) => !observed.has(cell));
const invalid = input.observed.filter((cell) => !cells.includes(cell));
const ratio = Number(((cells.length - missing.length) / cells.length).toFixed(2));

assert.equal(cells.length, 12);
assert.equal(missing.length, 3);
assert.equal(ratio, 0.75);
assert.ok(missing.includes('viewer/offline-edit'));
assert.deepEqual(invalid, ['guest/reconnect-write']);

console.log(JSON.stringify({
  coverage: ratio,
  missing,
  invalid,
  ready: missing.length === 0 && invalid.length === 0
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        roles: ['owner', 'editor', 'commenter', 'viewer'],
        operations: ['online-edit', 'offline-edit', 'reconnect-write'],
        observed: [
          'owner/online-edit',
          'owner/offline-edit',
          'owner/reconnect-write',
          'editor/online-edit',
          'editor/offline-edit',
          'editor/reconnect-write',
          'commenter/online-edit',
          'commenter/offline-edit',
          'viewer/reconnect-write',
          'guest/reconnect-write'
        ]
      }),
      checkpoint:
        '覆盖率必须为 0.75，缺口必须包含 viewer/offline-edit；guest/reconnect-write 必须作为非法矩阵单元暴露。只读角色不能在断线时偷偷获得编辑能力。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 范围、验收与非功能目标': {
    title: 'Canvas 代码台 02 · 收敛合并与离线积压上限',
    description:
      '先验证同一组操作按确定顺序合并后三个客户端结果一致，再检查离线队列不得超过容量并保留未确认更新。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-convergent-board-guided',
      title: '跟做：让不同接收顺序收敛到同一白板',
      brief:
        '运行 node main.js。对包含重复 ID 的图形操作按 clock 和 client 排序，比较正序与逆序输入得到同一状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function materialize(operations) {
  const seen = new Set();
  const state = new Map();
  const sorted = [...operations].sort((left, right) =>
    left.clock - right.clock || left.clientId.localeCompare(right.clientId)
  );
  for (const operation of sorted) {
    if (seen.has(operation.id)) continue;
    seen.add(operation.id);
    state.set(operation.shapeId, {
      shapeId: operation.shapeId,
      color: operation.color,
      deleted: operation.deleted
    });
  }
  return {
    shapes: [...state.values()].filter((shape) => !shape.deleted),
    tombstones: [...state.values()].filter((shape) => shape.deleted),
    applied: seen.size
  };
}

const forward = materialize(input.operations);
const reverse = materialize([...input.operations].reverse());
assert.deepEqual(forward, reverse);
assert.equal(forward.applied, 5);
assert.deepEqual(forward.shapes.map((shape) => shape.shapeId).sort(), ['circle-1', 'sticky-2']);
assert.deepEqual(forward.tombstones.map((shape) => shape.shapeId), ['rect-3']);

console.log(JSON.stringify({ forward, reverse }, null, 2));
`,
      },
      stdin: JSON.stringify({
        operations: [
          { id: 'u1', clientId: 'alice', clock: 1, shapeId: 'sticky-2', color: 'yellow', deleted: false },
          { id: 'u2', clientId: 'bob', clock: 2, shapeId: 'rect-3', color: 'blue', deleted: false },
          { id: 'u3', clientId: 'cara', clock: 3, shapeId: 'circle-1', color: 'red', deleted: false },
          { id: 'u4', clientId: 'bob', clock: 4, shapeId: 'rect-3', color: 'blue', deleted: true },
          { id: 'u5', clientId: 'alice', clock: 5, shapeId: 'sticky-2', color: 'green', deleted: false },
          { id: 'u4', clientId: 'bob', clock: 4, shapeId: 'rect-3', color: 'blue', deleted: true }
        ]
      }),
      checkpoint:
        '正序与逆序必须得到完全相同的结果，应用操作数为 5；最终保留 circle-1、sticky-2，rect-3 进入 tombstone。重复 updateId 不能在合并后产生双重副作用。',
    },
    apply: {
      id: 'p15-canvas-offline-backlog-independent',
      title: '独立实践：重连时只发送未确认更新',
      brief:
        '运行 node main.js。从离线队列排除已确认和重复更新，检查容量上限，生成重连发送、丢弃和原因清单。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const acknowledged = new Set(input.acknowledged);
const seen = new Set();
const retained = [];
const dropped = [];

for (const update of input.queue) {
  if (acknowledged.has(update.id)) {
    dropped.push({ id: update.id, reason: 'ALREADY_ACKNOWLEDGED' });
    continue;
  }
  if (seen.has(update.id)) {
    dropped.push({ id: update.id, reason: 'DUPLICATE_LOCAL_UPDATE' });
    continue;
  }
  seen.add(update.id);
  if (retained.length >= input.maxQueueSize) {
    dropped.push({ id: update.id, reason: 'OFFLINE_QUEUE_LIMIT' });
    continue;
  }
  retained.push(update);
}

assert.equal(retained.length, 3);
assert.deepEqual(retained.map((update) => update.id), ['u6', 'u7', 'u8']);
assert.deepEqual(dropped.map((item) => item.reason), [
  'ALREADY_ACKNOWLEDGED',
  'DUPLICATE_LOCAL_UPDATE',
  'OFFLINE_QUEUE_LIMIT',
  'OFFLINE_QUEUE_LIMIT'
]);
assert.equal(retained.every((update) => update.docId === input.docId), true);

console.log(JSON.stringify({
  sendOnReconnect: retained,
  dropped,
  mustResyncSnapshot: dropped.some((item) => item.reason === 'OFFLINE_QUEUE_LIMIT')
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        docId: 'board-42',
        maxQueueSize: 3,
        acknowledged: ['u5'],
        queue: [
          { id: 'u5', docId: 'board-42', clock: 5 },
          { id: 'u6', docId: 'board-42', clock: 6 },
          { id: 'u6', docId: 'board-42', clock: 6 },
          { id: 'u7', docId: 'board-42', clock: 7 },
          { id: 'u8', docId: 'board-42', clock: 8 },
          { id: 'u9', docId: 'board-42', clock: 9 },
          { id: 'u10', docId: 'board-42', clock: 10 }
        ]
      }),
      checkpoint:
        '重连队列必须只发送 u6、u7、u8；u9、u10 都因 OFFLINE_QUEUE_LIMIT 被丢弃，另两项原因是已确认和重复更新。发生 OFFLINE_QUEUE_LIMIT 后必须要求重新拉快照，不能悄悄丢失本地编辑。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · API 契约与前端数据边界': {
    title: 'Canvas 代码台 03 · WebSocket 消息校验与握手',
    description:
      '先验证更新消息的文档、客户端、协议、载荷和权限字段，再执行握手协议协商、文档权限和快照版本检查。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-message-contract-guided',
      title: '跟做：拒绝不完整的实时更新',
      brief:
        '运行 node main.js。校验 WebSocket 更新消息的必填字段与协议范围，输出 accepted/rejected 及稳定错误码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowedTypes = new Set(['shape:set', 'shape:delete', 'cursor:set']);
const results = input.messages.map((message) => {
  const reasons = [];
  if (!message.docId) reasons.push('DOC_ID_REQUIRED');
  if (!message.clientId) reasons.push('CLIENT_ID_REQUIRED');
  if (!Number.isInteger(message.protocol) || message.protocol < 1 || message.protocol > 2) {
    reasons.push('PROTOCOL_UNSUPPORTED');
  }
  if (!allowedTypes.has(message.type)) reasons.push('MESSAGE_TYPE_UNKNOWN');
  if (message.payload?.bytes > input.maxPayloadBytes) reasons.push('PAYLOAD_TOO_LARGE');
  return {
    updateId: message.updateId || null,
    accepted: reasons.length === 0,
    reasons
  };
});

assert.deepEqual(results.map((item) => item.accepted), [true, false, false, true]);
assert.deepEqual(results[1].reasons, ['CLIENT_ID_REQUIRED']);
assert.deepEqual(results[2].reasons, ['PROTOCOL_UNSUPPORTED']);

console.log(JSON.stringify({ results, maxPayloadBytes: input.maxPayloadBytes }, null, 2));
`,
      },
      stdin: JSON.stringify({
        maxPayloadBytes: 65536,
        messages: [
          {
            updateId: 'u1', docId: 'board-1', clientId: 'alice', protocol: 2,
            type: 'shape:set', payload: { bytes: 512 }
          },
          {
            updateId: 'u2', docId: 'board-1', protocol: 2,
            type: 'shape:set', payload: { bytes: 400 }
          },
          {
            updateId: 'u3', docId: 'board-1', clientId: 'bob', protocol: 4,
            type: 'cursor:set', payload: { bytes: 80 }
          },
          {
            updateId: 'u4', docId: 'board-1', clientId: 'cara', protocol: 1,
            type: 'shape:delete', payload: { bytes: 128 }
          }
        ]
      }),
      checkpoint:
        '消息结果必须依次为 true、false、false、true；缺失 clientId 与协议越界要分别报稳定错误。只解析 JSON 不等于契约有效，消息类型和载荷上限也要检查。',
    },
    apply: {
      id: 'p15-canvas-handshake-sync-independent',
      title: '独立实践：握手、权限与快照版本协商',
      brief:
        '运行 node main.js。根据令牌权限、客户端协议和快照版本决定接入、刷新客户端、拒绝权限或要求重新同步。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = input.clients.map((client) => {
  const grant = input.grants[client.token];
  if (!grant || grant.docId !== client.docId) {
    return { clientId: client.clientId, status: 403, code: 'DOCUMENT_ACCESS_DENIED' };
  }
  if (client.protocol < input.server.minProtocol || client.protocol > input.server.maxProtocol) {
    return { clientId: client.clientId, status: 426, code: 'CLIENT_PROTOCOL_UNSUPPORTED' };
  }
  if (client.lastSnapshotVersion < input.server.snapshotVersion - 10) {
    return {
      clientId: client.clientId,
      status: 409,
      code: 'SNAPSHOT_RESYNC_REQUIRED',
      serverSnapshotVersion: input.server.snapshotVersion
    };
  }
  return {
    clientId: client.clientId,
    status: 101,
    role: grant.role,
    syncFrom: Math.max(client.lastSnapshotVersion, input.server.snapshotVersion - 10)
  };
});

assert.deepEqual(results.map((item) => item.status), [101, 403, 426, 409]);
assert.equal(results[0].syncFrom, 94);
assert.equal(results[3].serverSnapshotVersion, 100);

console.log(JSON.stringify({ results, protocolWindow: input.server }, null, 2));
`,
      },
      stdin: JSON.stringify({
        server: { minProtocol: 1, maxProtocol: 2, snapshotVersion: 100 },
        grants: {
          'token-ok': { docId: 'board-7', role: 'editor' },
          'token-other': { docId: 'board-8', role: 'editor' }
        },
        clients: [
          { clientId: 'c1', token: 'token-ok', docId: 'board-7', protocol: 2, lastSnapshotVersion: 94 },
          { clientId: 'c2', token: 'token-other', docId: 'board-7', protocol: 2, lastSnapshotVersion: 99 },
          { clientId: 'c3', token: 'token-ok', docId: 'board-7', protocol: 3, lastSnapshotVersion: 99 },
          { clientId: 'c4', token: 'token-ok', docId: 'board-7', protocol: 2, lastSnapshotVersion: 80 }
        ]
      }),
      checkpoint:
        '握手状态必须依次为 101、403、426、409；正常客户端从版本 94 开始补差量，过旧客户端必须拉服务端快照版本 100。握手要在订阅前验证令牌、文档范围和协议。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 数据模型、约束与迁移': {
    title: 'Canvas 代码台 04 · 增量幂等、快照压缩与恢复',
    description:
      '先用 updateId 去重并定期压缩增量，再从快照和非损坏增量恢复文档，确保迁移和损坏不会重放重复内容。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-update-ledger-guided',
      title: '跟做：幂等增量与定期快照',
      brief:
        '运行 node main.js。追加带唯一 ID 的文本片段，重复更新被忽略，每三条增量合并成一个快照。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
let snapshot = input.snapshot;
let pending = [];
let compactions = 0;

for (const update of input.updates) {
  if (seen.has(update.id)) continue;
  seen.add(update.id);
  pending.push(update.part);
  if (pending.length === input.compactionThreshold) {
    snapshot += pending.join('');
    pending = [];
    compactions += 1;
  }
}

assert.equal(snapshot, 'ABC');
assert.equal(pending.join(''), 'DE');
assert.equal(compactions, 1);
assert.equal(seen.size, 5);

console.log(JSON.stringify({
  snapshot,
  pending,
  compactions,
  nextUpdateVersion: seen.size + 1
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        snapshot: '',
        compactionThreshold: 3,
        updates: [
          { id: 'u1', part: 'A' },
          { id: 'u2', part: 'B' },
          { id: 'u2', part: 'B' },
          { id: 'u3', part: 'C' },
          { id: 'u4', part: 'D' },
          { id: 'u5', part: 'E' }
        ]
      }),
      checkpoint:
        '快照必须为 ABC，未压缩增量为 DE，压缩次数为 1；五个唯一 updateId 只应用一次。重复更新不能因为排在压缩边界前就产生重复字符。',
    },
    apply: {
      id: 'p15-canvas-snapshot-recovery-independent',
      title: '独立实践：从快照和校验增量恢复',
      brief:
        '运行 node main.js。校验每条增量摘要，跳过损坏记录，从快照重建文档并输出恢复范围与错误证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
let document = input.snapshot.text;
const applied = [];
const rejected = [];

for (const update of input.updates) {
  const actual = digest(update.part);
  if (actual !== update.checksum) {
    rejected.push({ id: update.id, expected: update.checksum, actual, code: 'CHECKSUM_MISMATCH' });
    continue;
  }
  document += update.part;
  applied.push(update.id);
}

assert.equal(document, 'Hello Canvas');
assert.deepEqual(applied, ['u2', 'u3']);
assert.deepEqual(rejected.map((item) => item.id), ['u1']);
assert.equal(rejected[0].code, 'CHECKSUM_MISMATCH');

console.log(JSON.stringify({
  snapshotVersion: input.snapshot.version,
  document,
  applied,
  rejected,
  recoveredAtVersion: input.snapshot.version + applied.length
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        snapshot: { version: 40, text: 'Hello ' },
        updates: [
          { id: 'u1', part: 'BROKEN', checksum: '00000000' },
          { id: 'u2', part: 'Can', checksum: '2dba9a87' },
          { id: 'u3', part: 'vas', checksum: '74356fbb' }
        ]
      }),
      checkpoint:
        '恢复后文档必须为 Hello Canvas；只应用 u2、u3，u1 必须报 CHECKSUM_MISMATCH，恢复版本为 42。损坏增量不能悄悄拼进正文，恢复证据要保留摘要差异。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 项目骨架、模块边界与本地环境': {
    title: 'Canvas 代码台 05 · 模块依赖与多客户端本地收敛',
    description:
      '先检查编辑器、连接层和 UI 的依赖方向与循环，再用三个确定性本地客户端复现并发编辑后的最终收敛。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-module-boundary-guided',
      title: '跟做：阻止 UI 直接依赖持久层',
      brief:
        '运行 node main.js。验证允许的编辑器模块导入方向，找出越层依赖和依赖环。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = new Set(input.allowed);
const edges = input.imports;
const violations = edges.filter((edge) => !allowed.has(edge.from + '>' + edge.to));
const adjacency = new Map();
const cycles = [];

for (const edge of edges) {
  if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
  adjacency.get(edge.from).push(edge.to);
}

function visit(node, path) {
  if (path.includes(node)) {
    cycles.push([...path.slice(path.indexOf(node)), node].join(' -> '));
    return;
  }
  for (const next of adjacency.get(node) || []) {
    visit(next, [...path, node]);
  }
}

for (const node of adjacency.keys()) visit(node, []);
assert.deepEqual(violations, [
  { from: 'ui', to: 'persistence' },
  { from: 'crdt', to: 'ui' }
]);
assert.equal(cycles.length > 0, true);

console.log(JSON.stringify({
  violations,
  cycles: [...new Set(cycles)],
  allowedBoundaryCount: allowed.size
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        allowed: [
          'ui>document', 'ui>connection', 'connection>protocol',
          'document>crdt', 'persistence>crdt'
        ],
        imports: [
          { from: 'ui', to: 'document' },
          { from: 'ui', to: 'connection' },
          { from: 'document', to: 'crdt' },
          { from: 'connection', to: 'protocol' },
          { from: 'ui', to: 'persistence' },
          { from: 'crdt', to: 'ui' }
        ]
      }),
      checkpoint:
        '必须找出 ui->persistence 和 crdt->ui 两条越界依赖，并至少发现一个依赖环。UI 不能直接写持久层，合并层也不能反向依赖界面状态。',
    },
    apply: {
      id: 'p15-canvas-local-multiclient-independent',
      title: '独立实践：三个本地客户端各自合并',
      brief:
        '运行 node main.js。让三个客户端接收不同顺序的同一组操作，按版本和客户端 ID 合并，验证最终白板摘要一致。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const orders = {
  alice: input.operations,
  bob: [...input.operations].reverse(),
  cara: [input.operations[1], input.operations[3], input.operations[0], input.operations[2], input.operations[4]]
};

function replay(operations) {
  const byShape = new Map();
  for (const operation of [...operations].sort((a, b) =>
    a.clock - b.clock || a.clientId.localeCompare(b.clientId)
  )) {
    const current = byShape.get(operation.shapeId);
    if (!current || operation.clock >= current.clock) {
      byShape.set(operation.shapeId, {
        id: operation.shapeId,
        x: operation.x,
        clock: operation.clock,
        deleted: operation.deleted
      });
    }
  }
  return [...byShape.values()]
    .filter((shape) => !shape.deleted)
    .sort((a, b) => a.id.localeCompare(b.id));
}

const clients = Object.fromEntries(
  Object.entries(orders).map(([client, operations]) => [client, replay(operations)])
);
const signatures = Object.values(clients).map((shapes) => JSON.stringify(shapes));

assert.equal(new Set(signatures).size, 1);
assert.deepEqual(clients.alice.map((shape) => shape.id), ['circle', 'sticky']);
assert.equal(clients.alice.length, 2);
assert.equal(input.operations.length, 5);

console.log(JSON.stringify({
  clients,
  convergedSignature: signatures[0]
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        operations: [
          { clientId: 'alice', clock: 1, shapeId: 'sticky', x: 40, deleted: false },
          { clientId: 'bob', clock: 2, shapeId: 'rect', x: 80, deleted: false },
          { clientId: 'cara', clock: 3, shapeId: 'circle', x: 120, deleted: false },
          { clientId: 'bob', clock: 4, shapeId: 'rect', x: 80, deleted: true },
          { clientId: 'alice', clock: 5, shapeId: 'sticky', x: 60, deleted: false }
        ]
      }),
      checkpoint:
        '三个客户端签名必须完全相同，最终只保留 circle 和 sticky，sticky 的 x 坐标为 60。只在单一消息顺序下正确，不算实时协作收敛。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 后端核心链路与异常恢复': {
    title: 'Canvas 代码台 06 · 乱序缓冲、快照恢复与限流',
    description:
      '先处理重复、乱序和连续版本更新，再从快照恢复文档并检查慢消费者背压阈值，避免广播拖垮实时服务。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-out-of-order-updates-guided',
      title: '跟做：缓冲乱序并丢弃重复版本',
      brief:
        '运行 node main.js。按服务端版本缓冲更新，只提交连续版本，重复与缺口分别留下可观察记录。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const buffer = new Map();
const applied = [];
const ignored = [];
let expected = input.startVersion;

for (const update of input.updates) {
  if (update.version < expected || buffer.has(update.version)) {
    ignored.push({ version: update.version, reason: 'DUPLICATE_OR_STALE' });
    continue;
  }
  buffer.set(update.version, update);
  while (buffer.has(expected)) {
    applied.push(buffer.get(expected).id);
    buffer.delete(expected);
    expected += 1;
  }
}

assert.deepEqual(applied, ['u3', 'u4', 'u5']);
assert.equal(expected, 6);
assert.deepEqual([...buffer.keys()], [7]);
assert.deepEqual(ignored.map((item) => item.version), [3, 4]);

console.log(JSON.stringify({
  applied,
  nextExpectedVersion: expected,
  buffered: [...buffer.values()],
  ignored
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        startVersion: 3,
        updates: [
          { id: 'u5', version: 5 },
          { id: 'u3', version: 3 },
          { id: 'u4', version: 4 },
          { id: 'u3-dup', version: 3 },
          { id: 'u7', version: 7 },
          { id: 'u4-dup', version: 4 }
        ]
      }),
      checkpoint:
        '连续应用的更新必须为 u3、u4、u5，下个期望版本为 6；版本 7 留在缓冲区，两个重复更新被忽略。乱序更新不能跳过缺口直接广播成最新文档。',
    },
    apply: {
      id: 'p15-canvas-backpressure-independent',
      title: '独立实践：识别慢消费者并限制广播积压',
      brief:
        '运行 node main.js。检查每个连接的队列深度、广播耗时和确认版本，决定继续、限流或断开重同步。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = input.connections.map((connection) => {
  let action = 'continue';
  if (connection.queuedUpdates >= input.pauseQueueDepth) action = 'pause-broadcast';
  if (
    connection.queuedUpdates >= input.disconnectQueueDepth ||
    connection.broadcastLagMs >= input.disconnectLagMs
  ) {
    action = 'disconnect-and-resync';
  }
  return {
    connectionId: connection.connectionId,
    action,
    lagMs: connection.broadcastLagMs,
    queuedUpdates: connection.queuedUpdates,
    requiresSnapshot: action === 'disconnect-and-resync'
  };
});

assert.deepEqual(results.map((item) => item.action), [
  'continue', 'pause-broadcast', 'disconnect-and-resync'
]);
assert.equal(results[1].requiresSnapshot, false);
assert.equal(results[2].requiresSnapshot, true);
assert.equal(input.disconnectQueueDepth, 200);

console.log(JSON.stringify({ results }, null, 2));
`,
      },
      stdin: JSON.stringify({
        pauseQueueDepth: 100,
        disconnectQueueDepth: 200,
        disconnectLagMs: 1500,
        connections: [
          { connectionId: 'fast', queuedUpdates: 12, broadcastLagMs: 40, lastAckVersion: 81 },
          { connectionId: 'slow', queuedUpdates: 120, broadcastLagMs: 500, lastAckVersion: 60 },
          { connectionId: 'stalled', queuedUpdates: 240, broadcastLagMs: 2200, lastAckVersion: 40 }
        ]
      }),
      checkpoint:
        '三个连接必须依次 continue、pause-broadcast、disconnect-and-resync；只有断开连接需要重新拉快照。所有消费者都持续广播会把一个慢连接放大成全服务积压。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 前端页面、状态与可访问交互': {
    title: 'Canvas 代码台 07 · 工具栏键盘焦点与断线状态',
    description:
      '先验证图工具栏的方向键、Home/End、Enter 与 Escape，再维护离线、重连、同步和权限撤销下的编辑状态。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-toolbar-keyboard-guided',
      title: '跟做：方向键循环工具并执行选择',
      brief:
        '运行 node main.js。处理工具栏焦点、方向键循环、Home/End 和 Enter，确保焦点不会落到禁用工具。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const enabled = input.tools.map((tool) => tool.enabled);
let index = input.initialIndex;
let activeTool = null;
const trace = [];

for (const key of input.keys) {
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    do { index = (index + 1) % enabled.length; } while (!enabled[index]);
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    do { index = (index - 1 + enabled.length) % enabled.length; } while (!enabled[index]);
  }
  if (key === 'Home') index = enabled.indexOf(true);
  if (key === 'End') index = enabled.lastIndexOf(true);
  if (key === 'Enter') activeTool = input.tools[index].id;
  trace.push({ key, focus: input.tools[index].id, activeTool });
}

assert.equal(activeTool, 'connector');
assert.equal(index, 3);
assert.equal(trace.some((item) => item.focus === 'image' || item.focus === 'embed'), false);

console.log(JSON.stringify({ activeTool, finalIndex: index, trace }, null, 2));
`,
      },
      stdin: JSON.stringify({
        initialIndex: 0,
        tools: [
          { id: 'select', enabled: true },
          { id: 'sticky', enabled: true },
          { id: 'image', enabled: false },
          { id: 'connector', enabled: true },
          { id: 'embed', enabled: false }
        ],
        keys: ['ArrowRight', 'End', 'Enter']
      }),
      checkpoint:
        '焦点最终必须落在 connector 并激活它；image 与 embed 不能进入焦点路径。禁用工具不能只靠灰色样式，键盘导航也必须跳过。',
    },
    apply: {
      id: 'p15-canvas-reconnect-ui-independent',
      title: '独立实践：离线编辑与重连状态机',
      brief:
        '运行 node main.js。处理断线、本地编辑、重连、同步完成和权限撤销，维护可编辑状态与积压数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const state = { connection: 'online', editable: true, queued: 0, banner: 'synced', revision: 0 };

for (const event of input.events) {
  if (event.type === 'connection-lost') {
    state.connection = 'offline';
    state.banner = 'offline-editing';
  } else if (event.type === 'local-edit' && state.editable) {
    state.queued += 1;
    state.revision += 1;
  } else if (event.type === 'reconnect-start') {
    state.connection = 'reconnecting';
    state.banner = 'syncing-changes';
  } else if (event.type === 'sync-complete') {
    state.connection = 'online';
    state.banner = state.queued > 0 ? 'changes-synced' : 'synced';
    state.queued = 0;
  } else if (event.type === 'permission-revoked') {
    state.editable = false;
    state.banner = 'read-only';
  } else if (event.type === 'local-edit' && !state.editable) {
    state.banner = 'read-only-edit-blocked';
  }
}

assert.equal(state.connection, 'online');
assert.equal(state.editable, false);
assert.equal(state.queued, 0);
assert.equal(state.revision, 3);
assert.equal(state.banner, 'read-only-edit-blocked');

console.log(JSON.stringify({ state }, null, 2));
`,
      },
      stdin: JSON.stringify({
        events: [
          { type: 'connection-lost' },
          { type: 'local-edit' },
          { type: 'local-edit' },
          { type: 'reconnect-start' },
          { type: 'local-edit' },
          { type: 'sync-complete' },
          { type: 'permission-revoked' },
          { type: 'local-edit' }
        ]
      }),
      checkpoint:
        '同步后连接回到 online，积压清零且 revision=3；权限撤销后 editable=false，最后一次编辑必须被阻止并显示 read-only-edit-blocked。断线可编辑不等于撤销权限后仍可编辑。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 联调、测试、安全与性能': {
    title: 'Canvas 代码台 08 · 权限审计、内容编码与尾延迟',
    description:
      '先验证连接与消息权限审计、令牌脱敏和评论文本编码，再运行多客户端压力夹具，测量收敛结果与广播 P95。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-audit-sanitization-guided',
      title: '跟做：记录拒绝原因并编码评论文本',
      brief:
        '运行 node main.js。对读取和编辑动作做权限审计，屏蔽日志令牌，并把评论文本编码为不可执行内容。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const document = input.document;
const encode = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const audit = input.actions.map((action) => {
  const member = document.members[action.userId];
  let allowed = false;
  let reason = 'NOT_A_MEMBER';
  if (member && action.operation === 'read') {
    allowed = true;
    reason = 'READ_GRANTED';
  } else if (member === 'editor' && action.operation === 'edit') {
    allowed = true;
    reason = 'EDIT_GRANTED';
  } else if (member) {
    reason = 'ROLE_FORBIDDEN';
  }
  return {
    userId: action.userId,
    operation: action.operation,
    allowed,
    reason,
    token: '***'
  };
});
const safeComment = encode(input.comment);

assert.deepEqual(audit.map((entry) => entry.allowed), [true, true, false, false]);
assert.deepEqual(audit.map((entry) => entry.reason), [
  'READ_GRANTED', 'EDIT_GRANTED', 'ROLE_FORBIDDEN', 'NOT_A_MEMBER'
]);
assert.equal(safeComment, '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(audit.every((entry) => entry.token === '***'), true);

console.log(JSON.stringify({ audit, safeComment }, null, 2));
`,
      },
      stdin: JSON.stringify({
        document: {
          id: 'board-secure',
          members: { alice: 'editor', bob: 'viewer' }
        },
        actions: [
          { userId: 'alice', operation: 'read' },
          { userId: 'alice', operation: 'edit' },
          { userId: 'bob', operation: 'edit' },
          { userId: 'mallory', operation: 'read' }
        ],
        comment: '<img src=x onerror=alert(1)>',
        token: 'raw-secret-token'
      }),
      checkpoint:
        '审计允许结果必须依次为 true、true、false、false；评论必须输出 HTML 实体文本，日志令牌统一为星号。拒绝原因要区分角色不足和非成员，不能把令牌写入审计详情。',
    },
    apply: {
      id: 'p15-canvas-convergence-latency-independent',
      title: '独立实践：多客户端并发收敛与 P95 预算',
      brief:
        '运行 node main.js。合并三个客户端的并发更新，核对文档摘要，再计算广播尾延迟和错误率是否放行。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const deduped = new Map();
for (const update of input.updates) deduped.set(update.id, update);
const ordered = [...deduped.values()].sort((a, b) =>
  a.clock - b.clock || a.clientId.localeCompare(b.clientId)
);
const board = new Map();
for (const update of ordered) {
  board.set(update.shapeId, update.deleted ? null : update.label);
}
const finalBoard = [...board.entries()]
  .filter(([, label]) => label !== null)
  .sort(([left], [right]) => left.localeCompare(right));
const latencies = input.broadcasts.map((item) => item.latencyMs).sort((a, b) => a - b);
const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
const failures = input.broadcasts.filter((item) => !item.delivered).length;
const errorRate = Number((failures / input.broadcasts.length).toFixed(3));
const releaseAllowed = p95 <= input.budget.p95Ms && errorRate <= input.budget.errorRate;

assert.deepEqual(finalBoard, [['note-a', 'A'], ['note-c', 'C']]);
assert.equal(p95, 220);
assert.equal(errorRate, 0.05);
assert.equal(releaseAllowed, true);

console.log(JSON.stringify({
  finalBoard,
  uniqueUpdates: deduped.size,
  p95,
  errorRate,
  releaseAllowed
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        budget: { p95Ms: 250, errorRate: 0.05 },
        updates: [
          { id: 'u1', clientId: 'alice', clock: 1, shapeId: 'note-a', label: 'A', deleted: false },
          { id: 'u2', clientId: 'bob', clock: 2, shapeId: 'note-b', label: 'B', deleted: false },
          { id: 'u3', clientId: 'cara', clock: 3, shapeId: 'note-c', label: 'C', deleted: false },
          { id: 'u4', clientId: 'bob', clock: 4, shapeId: 'note-b', label: 'B', deleted: true },
          { id: 'u3', clientId: 'cara', clock: 3, shapeId: 'note-c', label: 'C', deleted: false }
        ],
        broadcasts: [
          { delivered: true, latencyMs: 40 }, { delivered: true, latencyMs: 60 },
          { delivered: true, latencyMs: 80 }, { delivered: true, latencyMs: 100 },
          { delivered: true, latencyMs: 120 }, { delivered: true, latencyMs: 140 },
          { delivered: true, latencyMs: 160 }, { delivered: true, latencyMs: 180 },
          { delivered: false, latencyMs: 240 }, { delivered: true, latencyMs: 90 },
          { delivered: true, latencyMs: 110 }, { delivered: true, latencyMs: 130 },
          { delivered: true, latencyMs: 150 }, { delivered: true, latencyMs: 170 },
          { delivered: true, latencyMs: 190 }, { delivered: true, latencyMs: 70 },
          { delivered: true, latencyMs: 50 }, { delivered: true, latencyMs: 30 },
          { delivered: true, latencyMs: 210 }, { delivered: true, latencyMs: 220 }
        ]
      }),
      checkpoint:
        '最终只保留 note-a 和 note-c，唯一更新数为 4；P95=220、错误率=0.05，均未超过预算并允许发布。收敛和尾延迟要同时验证，不能只凭界面看起来实时。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 容器、CI/CD、可观测与发布': {
    title: 'Canvas 代码台 09 · 协议滚动升级与连接指标门禁',
    description:
      '先验证旧客户端在协议滚动升级中的兼容窗口，再根据连接、重连、消息和快照大小指标决定灰度继续或冻结。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-protocol-rollout-guided',
      title: '跟做：协议窗口与客户端兼容门禁',
      brief:
        '运行 node main.js。检查客户端协议、服务端兼容范围、旧快照和灰度比例，输出允许或需要刷新的结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const decisions = input.clients.map((client) => {
  const reasons = [];
  if (client.protocol < input.server.minProtocol || client.protocol > input.server.maxProtocol) {
    reasons.push('PROTOCOL_OUTSIDE_COMPAT_WINDOW');
  }
  if (client.snapshotVersion < input.server.minReadableSnapshot) {
    reasons.push('SNAPSHOT_FORMAT_TOO_OLD');
  }
  if (
    input.rolloutPercent > input.rolloutLimit &&
    !client.canary &&
    client.protocol === input.server.maxProtocol
  ) {
    reasons.push('ROLLOUT_OUTSIDE_CANARY');
  }
  return {
    clientId: client.clientId,
    allowed: reasons.length === 0,
    action: reasons.length === 0 ? 'connect' : 'refresh-client',
    reasons
  };
});

assert.deepEqual(decisions.map((item) => item.allowed), [true, true, false, false]);
assert.deepEqual(decisions[2].reasons, ['PROTOCOL_OUTSIDE_COMPAT_WINDOW']);
assert.deepEqual(decisions[3].reasons, ['ROLLOUT_OUTSIDE_CANARY']);
assert.equal(input.server.maxProtocol - input.server.minProtocol, 1);

console.log(JSON.stringify({
  decisions,
  rollout: {
    percent: input.rolloutPercent,
    limit: input.rolloutLimit,
    canaryOnly: input.rolloutPercent <= input.rolloutLimit
  }
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        server: { minProtocol: 2, maxProtocol: 3, minReadableSnapshot: 80 },
        rolloutPercent: 40,
        rolloutLimit: 25,
        clients: [
          { clientId: 'new-canary', protocol: 3, snapshotVersion: 100, canary: true },
          { clientId: 'old-compatible', protocol: 2, snapshotVersion: 90, canary: false },
          { clientId: 'too-old', protocol: 1, snapshotVersion: 100, canary: true },
          { clientId: 'non-canary-new', protocol: 3, snapshotVersion: 100, canary: false }
        ]
      }),
      checkpoint:
        '结果必须依次为允许、允许、协议不兼容、非灰度客户端被阻止；旧客户端只在协议窗口内连接。协议升级不能把服务端回滚后无法读取的新快照直接放大。',
    },
    apply: {
      id: 'p15-canvas-connection-metrics-independent',
      title: '独立实践：连接健康与消息背压告警',
      brief:
        '运行 node main.js。根据连接数、重连率、消息失败率、慢消费者和快照大小计算告警等级与发布动作。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const reconnectRate = Number((input.metrics.reconnects / input.metrics.connections).toFixed(2));
const messageFailureRate = Number((input.metrics.failedMessages / input.metrics.messages).toFixed(3));
const alerts = [];

if (reconnectRate > input.thresholds.reconnectRate) alerts.push('RECONNECT_RATE_HIGH');
if (messageFailureRate > input.thresholds.messageFailureRate) alerts.push('MESSAGE_FAILURE_HIGH');
if (input.metrics.slowConsumers > input.thresholds.slowConsumers) alerts.push('SLOW_CONSUMER_BACKLOG');
if (input.metrics.maxSnapshotBytes > input.thresholds.maxSnapshotBytes) alerts.push('SNAPSHOT_TOO_LARGE');

const severity = alerts.length >= 3 ? 'page' : alerts.length > 0 ? 'warn' : 'ok';
const releaseAction = severity === 'page' ? 'pause-rollout' : severity === 'warn' ? 'hold-at-canary' : 'continue';

assert.equal(reconnectRate, 0.08);
assert.equal(messageFailureRate, 0.025);
assert.deepEqual(alerts, [
  'RECONNECT_RATE_HIGH',
  'MESSAGE_FAILURE_HIGH',
  'SLOW_CONSUMER_BACKLOG',
  'SNAPSHOT_TOO_LARGE'
]);
assert.equal(releaseAction, 'pause-rollout');

console.log(JSON.stringify({
  reconnectRate,
  messageFailureRate,
  alerts,
  severity,
  releaseAction
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        thresholds: {
          reconnectRate: 0.05,
          messageFailureRate: 0.02,
          slowConsumers: 2,
          maxSnapshotBytes: 1048576
        },
        metrics: {
          connections: 1000,
          reconnects: 80,
          messages: 20000,
          failedMessages: 500,
          slowConsumers: 7,
          maxSnapshotBytes: 1572864
        }
      }),
      checkpoint:
        '重连率 0.08、消息失败率 0.025；四项告警全部触发，发布动作必须是 pause-rollout。连接数本身正常不代表实时链路健康，重连、失败、积压和快照都要一起看。',
    },
  },

  'programming:综合训练 · Canvas 实时协作 · 故障演练、回滚与项目答辩': {
    title: 'Canvas 代码台 10 · 重启恢复、快照回滚与答辩',
    description:
      '先演练服务重启后的快照、离线和增量恢复，再用收敛、RTO/RPO、权限和回滚证据评分项目答辩。',
    ...nodeRuntime,
    practice: {
      id: 'p15-canvas-restart-recovery-guided',
      title: '跟做：服务重启后恢复快照与离线更新',
      brief:
        '运行 node main.js。合并快照、已确认增量和本地离线操作，按版本去重，验证重启后文档内容与积压状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
let document = input.snapshot.text;
let version = input.snapshot.version;
const applied = [];

for (const update of input.durableUpdates) {
  if (seen.has(update.id)) continue;
  seen.add(update.id);
  document += update.part;
  version += 1;
  applied.push({ id: update.id, version, source: update.source || 'durable' });
}

assert.equal(document, 'Hello Canvas');
assert.equal(version, 45);
assert.deepEqual(applied.map((item) => item.id), ['u2', 'u3']);
assert.equal(input.offlineUpdates[0].id, 'u2');
assert.equal(seen.has('local-1'), false);
assert.equal(input.offlineUpdates.some((update) => update.id === 'local-1'), true);

console.log(JSON.stringify({
  document,
  version,
  applied,
  pendingLocalUpdates: input.offlineUpdates.filter((update) => !seen.has(update.id)),
  restoreHealthy: document === 'Hello Canvas'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        snapshot: { version: 43, text: 'Hello ' },
        durableUpdates: [
          { id: 'u2', part: 'Can' },
          { id: 'u3', part: 'vas' }
        ],
        offlineUpdates: [
          { id: 'u2', part: 'Can', source: 'durable' },
          { id: 'local-1', part: '!', source: 'local' }
        ]
      }),
      checkpoint:
        '重启恢复后正文必须为 Hello Canvas，版本 45；只应用 u2、u3，重复的 u2 不能再次追加，local-1 必须仍在待同步清单。恢复成功要有内容、版本和待同步三类证据。',
    },
    apply: {
      id: 'p15-canvas-project-defense-independent',
      title: '独立实践：故障演练与答辩证据评分',
      brief:
        '运行 node main.js。评估收敛、RTO/RPO、权限、损坏快照回滚和故障演练证据，计算答辩结论与必须补测项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [
  { id: 'convergence', passed: input.drill.clientSignatures === 1, weight: 30 },
  { id: 'rto', passed: input.drill.rtoMinutes <= input.targets.rtoMinutes, weight: 20 },
  { id: 'rpo', passed: input.drill.rpoMinutes <= input.targets.rpoMinutes, weight: 20 },
  { id: 'permissions', passed: input.drill.unauthorizedWrites === 0, weight: 15 },
  { id: 'rollback', passed: input.drill.snapshotRollbackPassed, weight: 15 }
];
const passed = checks.filter((check) => check.passed);
const score = passed.reduce((total, check) => total + check.weight, 0);
const missingDrills = input.drill.requiredScenarios.filter((scenario) => !input.drill.completedScenarios.includes(scenario));
const verdict = score === 100 && missingDrills.length === 0 ? 'pass' : 'supplement-drill';

assert.equal(input.drill.clientSignatures, 1);
assert.deepEqual(checks.filter((check) => !check.passed).map((check) => check.id), ['rollback']);
assert.equal(score, 85);
assert.deepEqual(missingDrills, ['corrupt-snapshot-rollback']);
assert.equal(verdict, 'supplement-drill');

console.log(JSON.stringify({
  score,
  checks,
  missingDrills,
  verdict,
  requiredFollowUp: 'repeat corrupt snapshot rollback and provide recovered version and audit trail'
}, null, 2));
`,
      },
      stdin: JSON.stringify({
        targets: { rtoMinutes: 15, rpoMinutes: 1 },
        drill: {
          clientSignatures: 1,
          rtoMinutes: 9,
          rpoMinutes: 0,
          unauthorizedWrites: 0,
          snapshotRollbackPassed: false,
          requiredScenarios: ['service-restart', 'slow-consumer', 'corrupt-snapshot-rollback'],
          completedScenarios: ['service-restart', 'slow-consumer']
        }
      }),
      checkpoint:
        '评分必须为 85，rollback 是唯一失败项；缺少 corrupt-snapshot-rollback 演练，结论必须为 supplement-drill。答辩不能只报平均延迟，要给出收敛、恢复目标、权限和回滚的逐项证据。',
    },
  },
};
