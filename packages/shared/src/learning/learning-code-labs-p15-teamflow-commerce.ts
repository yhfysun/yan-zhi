import type { LearningV2CodeLab } from './v2-types.js';

/**
 * P15 综合训练中 TeamFlow 与 Commerce 的代码实验。
 *
 * 所有任务只使用 Node.js 标准库，并用 stdin 提供确定性场景。数据库、
 * 缓存、消息队列和浏览器均以显式内存适配器或状态机模拟，不替代真实
 * 集成测试，也不把模拟结果伪装成联网成功的证据。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装 npm 依赖。',
    '先按给定 stdin 运行跟做任务，再修改输入完成独立实践。',
    '数据库、缓存和消息服务均为明确标注的内存适配器，不是外部联网服务。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_P15_TEAMFLOW_COMMERCE: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:综合训练 · TeamFlow 协作 SaaS · 业务理解与用户任务': {
    title: 'TeamFlow 项目台 01 · 把角色写成可执行权限',
    description:
      '从用户、工作区和成员的输入推导动作授权，再验证邀请从待处理、接受、撤销到审计的完整生命周期。重点是租户与角色同时参与判断。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-role-matrix-guided',
      title: '跟做：同一用户在两个工作区拥有不同角色',
      brief:
        '读取用户请求，按工作区成员关系解析角色和 capability。输出每次允许或拒绝的原因，并断言 LEAD 能分配任务、AUDITOR 不能创建项目。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const capabilities = {
  ADMIN: ['workspace.update', 'member.invite', 'project.create', 'audit.read'],
  LEAD: ['project.create', 'task.assign', 'comment.create', 'audit.read'],
  MEMBER: ['task.update.own', 'comment.create'],
  AUDITOR: ['audit.read'],
};

function roleFor(user, workspaceId) {
  return user.memberships.find((item) => item.workspaceId === workspaceId)?.role;
}

function authorize(user, request) {
  const role = roleFor(user, request.workspaceId);
  if (!role) return { allowed: false, reason: 'WORKSPACE_NOT_VISIBLE' };
  if (!capabilities[role].includes(request.capability)) {
    return { allowed: false, reason: 'ROLE_LACKS_CAPABILITY', role };
  }
  if (request.ownOnly && request.actorId !== request.ownerId) {
    return { allowed: false, reason: 'OBJECT_NOT_OWNED', role };
  }
  return { allowed: true, reason: 'ALLOW', role };
}

const decisions = input.requests.map((request) => ({
  label: request.label,
  ...authorize(input.user, request),
}));

assert.equal(decisions[0].allowed, true);
assert.equal(decisions[1].allowed, false);
assert.equal(decisions[2].reason, 'WORKSPACE_NOT_VISIBLE');
assert.equal(decisions[3].reason, 'OBJECT_NOT_OWNED');
console.log(JSON.stringify({ actor: input.user.id, decisions }, null, 2));
console.log('authorization: checked=' + decisions.length + ' denied=' +
  decisions.filter((item) => !item.allowed).length);
`,
      },
      stdin:
        '{"user":{"id":"u-17","memberships":[{"workspaceId":"ws-alpha","role":"LEAD"},{"workspaceId":"ws-beta","role":"AUDITOR"},{"workspaceId":"ws-east","role":"MEMBER"}]},"requests":[{"label":"lead-assign","workspaceId":"ws-alpha","capability":"task.assign"},{"label":"auditor-create","workspaceId":"ws-beta","capability":"project.create"},{"label":"hidden-workspace","workspaceId":"ws-gamma","capability":"audit.read"},{"label":"own-task-only","workspaceId":"ws-east","capability":"task.update.own","actorId":"u-17","ownerId":"u-99","ownOnly":true}]}',
      checkpoint:
        '输出中 lead-assign 为 allowed=true；auditor-create 为 ROLE_LACKS_CAPABILITY；hidden-workspace 为 WORKSPACE_NOT_VISIBLE；own-task-only 为 OBJECT_NOT_OWNED；最后一行 denied=3，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-invitation-lifecycle-independent',
      title: '独立实践：邀请状态机与可审计副作用',
      brief:
        '按顺序处理邀请、接受、撤销、再次接受四个动作。实现过期与状态校验，成功动作写入审计，重复接受不能生成第二条成员关系。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const invites = new Map(input.invites.map((invite) => [invite.token, { ...invite }]));
const members = new Set();
const audit = [];

function transition(token, action, at) {
  const invite = invites.get(token);
  if (!invite) return { ok: false, code: 'INVITE_NOT_FOUND' };
  if (action === 'accept') {
    if (invite.state !== 'PENDING') return { ok: false, code: 'INVITE_NOT_PENDING' };
    if (new Date(at) > new Date(invite.expiresAt)) {
      invite.state = 'EXPIRED';
      return { ok: false, code: 'INVITE_EXPIRED' };
    }
    invite.state = 'ACCEPTED';
    members.add(invite.workspaceId + ':' + invite.email);
    audit.push({ action, token, email: invite.email, at });
    return { ok: true, code: 'MEMBER_ADDED' };
  }
  if (action === 'revoke') {
    if (invite.state !== 'PENDING') return { ok: false, code: 'INVITE_NOT_PENDING' };
    invite.state = 'REVOKED';
    audit.push({ action, token, email: invite.email, at });
    return { ok: true, code: 'INVITE_REVOKED' };
  }
  return { ok: false, code: 'UNKNOWN_ACTION' };
}

const results = input.actions.map(({ token, action, at }) => ({
  action,
  token,
  ...transition(token, action, at),
}));

assert.deepEqual(results.map((item) => item.code), [
  'MEMBER_ADDED',
  'INVITE_NOT_PENDING',
  'MEMBER_ADDED',
  'INVITE_NOT_PENDING',
]);
assert.equal(members.size, 2);
assert.equal(audit.length, 2);
console.log(JSON.stringify({ results, members: [...members], audit }, null, 2));
console.log('invite-lifecycle: member-effects=' + members.size + ' audit=' + audit.length);
`,
      },
      stdin:
        '{"invites":[{"token":"tf-a","workspaceId":"ws-1","email":"lin@example.test","state":"PENDING","expiresAt":"2026-12-01T00:00:00Z"},{"token":"tf-b","workspaceId":"ws-1","email":"mira@example.test","state":"PENDING","expiresAt":"2026-12-01T00:00:00Z"}],"actions":[{"token":"tf-a","action":"accept","at":"2026-11-24T08:00:00Z"},{"token":"tf-a","action":"accept","at":"2026-11-24T08:01:00Z"},{"token":"tf-b","action":"accept","at":"2026-11-24T08:02:00Z"},{"token":"tf-b","action":"revoke","at":"2026-11-24T08:03:00Z"}]}',
      checkpoint:
        '四个结果依次为 MEMBER_ADDED、INVITE_NOT_PENDING、MEMBER_ADDED、INVITE_NOT_PENDING；成员集合为 2，审计恰好 2 条，退出码为 0。接受后的邀请不能再被撤销，说明状态机与副作用一致。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 范围、验收与非功能目标': {
    title: 'TeamFlow 项目台 02 · 范围和验收必须能被拒绝',
    description:
      '把多租户、权限、冲突、通知和 P95 转成带证据的验收门禁，再评估新需求是否影响权限面、数据库迁移和旧客户端兼容性。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-acceptance-gate-guided',
      title: '跟做：一条验收缺证据就阻断发布',
      brief:
        '读取五个验收场景及其证据。逐项判断是否可交付，输出缺失证据，并在任何关键项失败时返回 blocked。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const rules = {
  'tenant-cross-read': (item) => item.observed?.status === 404 && item.observed.databaseRows === 0,
  'object-authorization': (item) => item.observed?.status === 403 && Boolean(item.observed.auditId),
  'task-version-conflict': (item) => item.observed?.status === 409 && item.observed.currentVersion === 8,
  'outbox-eventual-delivery': (item) => item.observed?.delivered === true && item.observed.duplicate == false,
  'task-list-p95': (item) => Number.isFinite(item.observed?.p95Ms) && item.observed.p95Ms <= item.threshold,
};

const checks = input.scenarios.map((item) => {
  const pass = Boolean(rules[item.id]?.(item));
  return {
    id: item.id,
    pass,
    evidence: pass ? item.evidence : 'MISSING_OR_WRONG_EVIDENCE',
  };
});
const releaseGate = checks.every((item) => item.pass) ? 'ready' : 'blocked';

assert.equal(checks.find((item) => item.id === 'task-list-p95').pass, false);
assert.equal(checks.length, 5);
assert.equal(releaseGate, 'blocked');
console.log(JSON.stringify({ releaseGate, checks }, null, 2));
console.log('scope-gate: failed=' + checks.filter((item) => !item.pass).map((item) => item.id).join(','));
`,
      },
      stdin:
        '{"scenarios":[{"id":"tenant-cross-read","evidence":"integration/tf-101.json","observed":{"status":404,"databaseRows":0}},{"id":"object-authorization","evidence":"security/tf-204.json","observed":{"status":403,"auditId":"audit-9"}},{"id":"task-version-conflict","evidence":"api/tf-308.json","observed":{"status":409,"currentVersion":8}},{"id":"outbox-eventual-delivery","evidence":"queue/tf-412.json","observed":{"delivered":true,"duplicate":false}},{"id":"task-list-p95","evidence":"perf/tf-501.json","threshold":300,"observed":{"p95Ms":342}}]}',
      checkpoint:
        'releaseGate 必须是 blocked，唯一失败项是 task-list-p95；其他四项有真实结构证据并通过。最后一行 failed=task-list-p95，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-scope-impact-independent',
      title: '独立实践：新需求先过安全与迁移成本',
      brief:
        '读取三个范围候选，按权限面、迁移、旧客户端和回滚四项评分。任何高风险未带缓解证据的候选都不能进入冻结范围。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function assess(candidate) {
  const risky = candidate.impacts.filter((impact) =>
    impact.level === 'high' && !impact.mitigation);
  const accepted = candidate.core && risky.length === 0;
  return {
    id: candidate.id,
    accepted,
    blockers: risky.map((impact) => impact.kind),
    next: accepted ? 'design' : 'defer-or-add-safe-migration',
  };
}

const decisions = input.candidates.map(assess);
const frozen = decisions.filter((item) => item.accepted).map((item) => item.id);

assert.deepEqual(frozen, ['member-export']);
assert.deepEqual(decisions[1].blockers, ['permission-surface', 'database-migration']);
assert.deepEqual(decisions[2].blockers, ['old-client-compatibility']);
console.log(JSON.stringify({ frozen, decisions }, null, 2));
console.log('scope-freeze: candidates=' + decisions.length + ' accepted=' + frozen.length);
`,
      },
      stdin:
        '{"candidates":[{"id":"member-export","core":true,"impacts":[{"kind":"permission-surface","level":"medium","mitigation":"reuse audit.read"},{"kind":"database-migration","level":"low","mitigation":"read-only query"}]},{"id":"custom-role-builder","core":false,"impacts":[{"kind":"permission-surface","level":"high"},{"kind":"database-migration","level":"high"}]},{"id":"legacy-sse-event-format","core":true,"impacts":[{"kind":"old-client-compatibility","level":"high","mitigation":""}]}]}',
      checkpoint:
        '冻结范围只能是 member-export；custom-role-builder 同时被 permission-surface 与 database-migration 阻断；third 候选因缺少旧客户端缓解被阻断。最后一行 accepted=1，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · API 契约与前端数据边界': {
    title: 'TeamFlow 项目台 03 · 租户上下文、幂等和乐观锁',
    description:
      '服务端从成员关系解析工作区上下文并隐藏无权对象；写接口同时演示 idempotency-key 去重和 version 冲突，让前端拿到稳定错误码。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-api-context-guided',
      title: '跟做：URL 中的工作区不能替代认证上下文',
      brief:
        '读取认证主体和请求列表。确认工作区成员关系、对象租户与 capability 后返回稳定状态码，不把另一个租户的对象是否存在泄露给调用者。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const memberships = new Map(input.principal.memberships.map((item) =>
  [item.workspaceId, item]));

function handle(request) {
  const membership = memberships.get(request.pathWorkspaceId);
  if (!membership) return { status: 404, code: 'RESOURCE_HIDDEN' };
  const task = input.tasks.find((item) => item.id === request.taskId);
  if (!task || task.workspaceId !== request.pathWorkspaceId) {
    return { status: 404, code: 'RESOURCE_HIDDEN' };
  }
  if (!membership.capabilities.includes(request.action)) {
    return { status: 403, code: 'CAPABILITY_REQUIRED' };
  }
  return { status: 200, code: 'OK', task };
}

const responses = input.requests.map((request) => ({
  label: request.label,
  ...handle(request),
}));
assert.equal(responses[0].status, 200);
assert.equal(responses[1].status, 403);
assert.equal(responses[2].status, 404);
assert.equal(responses[3].status, 404);
console.log(JSON.stringify({ principal: input.principal.id, responses }, null, 2));
console.log('api-context: hidden=' + responses.filter((item) =>
  item.status === 404).length + ' forbidden=' + responses.filter((item) =>
  item.status === 403).length);
`,
      },
      stdin:
        '{"principal":{"id":"u-31","memberships":[{"workspaceId":"ws-north","capabilities":["task.read","task.update"]},{"workspaceId":"ws-south","capabilities":["task.read"]}]},"tasks":[{"id":"task-1","workspaceId":"ws-north","title":"迁移验收"},{"id":"task-2","workspaceId":"ws-south","title":"安全检查"}],"requests":[{"label":"read-own","pathWorkspaceId":"ws-north","taskId":"task-1","action":"task.read"},{"label":"update-own-denied","pathWorkspaceId":"ws-north","taskId":"task-1","action":"task.delete"},{"label":"wrong-workspace","pathWorkspaceId":"ws-south","taskId":"task-1","action":"task.read"},{"label":"unknown-tenant","pathWorkspaceId":"ws-west","taskId":"task-2","action":"task.read"}]}',
      checkpoint:
        '响应依次为 200、403、404、404；hidden=2，forbidden=1，退出码为 0。URL 工作区只用于选择上下文，真正的成员关系来自 principal，跨工作区对象不会暴露标题。',
    },
    apply: {
      id: 'p15-teamflow-idempotency-version-independent',
      title: '独立实践：重复创建与旧版本更新分开处理',
      brief:
        '用内存 API 处理四个写请求：同一幂等键只创建一次；无幂等键的新请求创建新任务；旧版本更新返回 409；当前版本更新成功并递增版本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const tasks = [{ id: 'task-77', title: '旧标题', version: 3 }];
const idempotency = new Map();
let sequence = 100;

function write(request) {
  if (request.idempotencyKey && idempotency.has(request.idempotencyKey)) {
    return { status: 200, code: 'REPLAYED_RESULT', result: idempotency.get(request.idempotencyKey) };
  }
  if (request.type === 'create') {
    const result = { id: 'task-' + (++sequence), title: request.title, version: 1 };
    tasks.push(result);
    if (request.idempotencyKey) idempotency.set(request.idempotencyKey, result);
    return { status: 201, code: 'CREATED', result };
  }
  const task = tasks.find((item) => item.id === request.taskId);
  if (!task) return { status: 404, code: 'TASK_NOT_FOUND' };
  if (request.version !== task.version) {
    return { status: 409, code: 'TASK_VERSION_CONFLICT', currentVersion: task.version };
  }
  task.title = request.title;
  task.version += 1;
  return { status: 200, code: 'UPDATED', result: { ...task } };
}

const responses = input.requests.map((request) => ({
  label: request.label,
  ...write(request),
}));
assert.deepEqual(responses.map((item) => item.status), [201, 200, 409, 200]);
assert.equal(tasks.length, 2);
assert.equal(tasks.find((item) => item.id === 'task-101').id, responses[1].result.id);
assert.equal(tasks.find((item) => item.id === 'task-77').version, 4);
console.log(JSON.stringify({ tasks, responses }, null, 2));
console.log('write-api: tasks=' + tasks.length + ' conflict=' + responses[2].currentVersion);
`,
      },
      stdin:
        '{"requests":[{"type":"create","label":"first-create","idempotencyKey":"create-71","title":"接入 SSO"},{"type":"create","label":"retry-same-key","idempotencyKey":"create-71","title":"接入 SSO"},{"type":"update","label":"stale-update","taskId":"task-77","version":2,"title":"新标题"},{"type":"update","label":"current-update","taskId":"task-77","version":3,"title":"新标题"}]}',
      checkpoint:
        '状态依次为 201、200、409、200；第二个响应为 REPLAYED_RESULT 且引用同一任务；任务总数保持 2；task-77 最终 version=4，最后一行 tasks=2 conflict=3，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 数据模型、约束与迁移': {
    title: 'TeamFlow 项目台 04 · 复合键挡住跨租户关联',
    description:
      '用内存表模拟复合主键、复合外键和唯一成员关系，再执行租户字段回填与两阶段约束迁移，观察孤儿数据如何阻断第二阶段。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-composite-keys-guided',
      title: '跟做：父对象和子对象必须同租户',
      brief:
        '建立工作区、项目和任务的内存表。每个引用都同时校验对象 id 和 tenant_id，重复成员关系由唯一键拒绝，跨租户任务必须无法插入。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

class ConstraintError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = (id, tenantId) => tenantId + ':' + id;
const db = { workspaces: new Map(), projects: new Map(), tasks: new Map(), members: new Map() };

function addWorkspace(row) {
  db.workspaces.set(key(row.id, row.tenantId), row);
}

function addProject(row) {
  if (!db.workspaces.has(key(row.workspaceId, row.tenantId))) {
    throw new ConstraintError('FK_WORKSPACE_TENANT');
  }
  db.projects.set(key(row.id, row.tenantId), row);
}

function addTask(row) {
  if (!db.projects.has(key(row.projectId, row.tenantId))) {
    throw new ConstraintError('FK_PROJECT_TENANT');
  }
  db.tasks.set(key(row.id, row.tenantId), row);
}

function addMember(row) {
  const memberKey = key(row.workspaceId, row.tenantId) + ':' + row.userId;
  if (db.members.has(memberKey)) throw new ConstraintError('DUPLICATE_MEMBERSHIP');
  db.members.set(memberKey, row);
}

for (const row of input.workspaces) addWorkspace(row);
for (const row of input.projects) addProject(row);
const rejected = [];
for (const attempt of input.taskAttempts) {
  try {
    addTask(attempt);
  } catch (error) {
    rejected.push({ label: attempt.label, code: error.code });
  }
}
addMember(input.members[0]);
let duplicateCode = 'NONE';
try {
  addMember(input.members[1]);
} catch (error) {
  duplicateCode = error.code;
}

assert.equal(db.tasks.size, 2);
assert.deepEqual(rejected.map((item) => item.code), ['FK_PROJECT_TENANT']);
assert.equal(duplicateCode, 'DUPLICATE_MEMBERSHIP');
console.log(JSON.stringify({
  tasks: [...db.tasks.values()],
  rejected,
  duplicateCode,
}, null, 2));
console.log('constraints: projects=' + db.projects.size + ' tasks=' + db.tasks.size +
  ' rejected=' + rejected.length);
`,
      },
      stdin:
        '{"workspaces":[{"id":10,"tenantId":7,"name":"产品交付"},{"id":11,"tenantId":8,"name":"海外团队"}],"projects":[{"id":20,"workspaceId":10,"tenantId":7,"name":"移动端"},{"id":21,"workspaceId":11,"tenantId":8,"name":"结算"}],"taskAttempts":[{"label":"same-tenant","id":30,"projectId":20,"tenantId":7,"title":"修复登录"},{"label":"cross-tenant-rejected","id":31,"projectId":20,"tenantId":8,"title":"伪造归属"},{"label":"same-tenant-second","id":32,"projectId":21,"tenantId":8,"title":"核对税额"}],"members":[{"workspaceId":10,"tenantId":7,"userId":"u-1","role":"MEMBER"},{"workspaceId":10,"tenantId":7,"userId":"u-1","role":"ADMIN"}]}',
      checkpoint:
        '任务表只保留 2 条同租户记录；跨租户任务结果为 FK_PROJECT_TENANT；第二次成员写入为 DUPLICATE_MEMBERSHIP；最后一行 projects=2 tasks=2 rejected=1，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-tenant-backfill-independent',
      title: '独立实践：先回填再收紧非空约束',
      brief:
        '读取旧任务行和项目租户映射，第一阶段按 project_id 回填 tenant_id 并统计孤儿；只有孤儿为 0 才允许第二阶段设置非空。本次输入应让迁移明确停在第一阶段。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const projectTenant = new Map(input.projects.map((project) =>
  [project.workspaceId + ':' + project.id, project.tenantId]));

function phaseOne(rows) {
  const output = [];
  const orphans = [];
  for (const row of rows) {
    const resolved = projectTenant.get(row.workspaceId + ':' + row.projectId);
    if (resolved == null) {
      orphans.push({ id: row.id, reason: 'MISSING_PROJECT_TENANT' });
      continue;
    }
    output.push({ ...row, tenantId: resolved });
  }
  return { output, orphans };
}

function phaseTwo(rows, orphans) {
  if (orphans.length > 0) {
    return { status: 'BLOCKED', code: 'ORPHAN_ROWS', rows };
  }
  for (const row of rows) {
    if (!Number.isInteger(row.tenantId)) throw new Error('tenant_id must be non-null');
  }
  return { status: 'READY', code: 'NOT_NULL_INSTALLED', rows };
}

const backfill = phaseOne(input.legacyTasks);
const result = phaseTwo(backfill.output, backfill.orphans);

assert.equal(backfill.output.length, 2);
assert.deepEqual(backfill.orphans, [{ id: 903, reason: 'MISSING_PROJECT_TENANT' }]);
assert.equal(result.status, 'BLOCKED');
assert.ok(backfill.output.every((row) => Number.isInteger(row.tenantId)));
console.log(JSON.stringify({
  phaseOne: { migrated: backfill.output.length, orphans: backfill.orphans, rows: backfill.output },
  phaseTwo: result,
}, null, 2));
console.log('tenant-migration: migrated=' + backfill.output.length +
  ' orphans=' + backfill.orphans.length + ' phase2=' + result.status);
`,
      },
      stdin:
        '{"projects":[{"id":20,"workspaceId":10,"tenantId":7},{"id":21,"workspaceId":11,"tenantId":8}],"legacyTasks":[{"id":901,"workspaceId":10,"projectId":20,"title":"修复登录"},{"id":902,"workspaceId":11,"projectId":21,"title":"结算审计"},{"id":903,"workspaceId":10,"projectId":999,"title":"失去父项目"}]}',
      checkpoint:
        'phaseOne 迁移 2 行，孤儿恰为 id=903；phaseTwo 必须为 BLOCKED / ORPHAN_ROWS，最后一行 migrated=2 orphans=1 phase2=BLOCKED，退出码为 0。不能为了完成迁移而给孤儿随意猜测租户。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 项目骨架、模块边界与本地环境': {
    title: 'TeamFlow 项目台 05 · 依赖方向与本地就绪',
    description:
      '用图算法检查领域模块依赖并生成稳定拓扑顺序，再用数据库、缓存和消息适配器验证 readiness 是否只反映真实依赖。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-module-graph-guided',
      title: '跟做：领域依赖不能成环',
      brief:
        '读取身份、工作区、项目、任务、通知和审计模块的依赖边，拓扑排序后验证每个模块都排在依赖之后，并拒绝一条反向依赖造成的环。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function topological(modules, edges) {
  const indegree = new Map(modules.map((name) => [name, 0]));
  const outgoing = new Map(modules.map((name) => [name, []]));
  for (const [from, to] of edges) {
    if (!indegree.has(from) || !indegree.has(to)) throw new Error('UNKNOWN_MODULE');
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  const ready = modules.filter((name) => indegree.get(name) === 0).sort();
  const order = [];
  while (ready.length > 0) {
    const current = ready.shift();
    order.push(current);
    for (const next of outgoing.get(current).sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  return order.length === modules.length ? { order } : { cycle: true };
}

const graph = topological(input.modules, input.validEdges);
assert.equal(graph.cycle, undefined);
for (const [from, to] of input.validEdges) {
  assert.ok(graph.order.indexOf(from) < graph.order.indexOf(to));
}
const cycle = topological(input.modules, input.cyclicEdges);
assert.equal(cycle.cycle, true);
console.log(JSON.stringify({ order: graph.order, cyclicProbe: cycle }, null, 2));
console.log('module-graph: order=' + graph.order.join('>'));
`,
      },
      stdin:
        '{"modules":["identity","workspace","project","task","notification","audit"],"validEdges":[["identity","workspace"],["workspace","project"],["project","task"],["identity","task"],["task","notification"],["identity","audit"]],"cyclicEdges":[["identity","workspace"],["workspace","project"],["project","task"],["task","workspace"]]}',
      checkpoint:
        '有效图输出 6 个模块的拓扑顺序，所有依赖边都满足 from 先于 to；cyclicEdges 返回 cycle=true；最后一行以 module-graph: order= 开头，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-local-readiness-independent',
      title: '独立实践：数据库必需，消息短暂故障降级',
      brief:
        '读取四个确定性适配器状态，区分 liveness、readiness 和降级能力。数据库或迁移未就绪必须不接流量；RabbitMQ 不可用时应保留业务写入并暴露积压风险。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function evaluate(adapters) {
  const warnings = [];
  const blockers = [];
  if (adapters.database !== 'up') blockers.push('DATABASE_DOWN');
  if (adapters.redis !== 'up') warnings.push('CACHE_DEGRADED');
  if (adapters.rabbitmq !== 'up') warnings.push('OUTBOX_DELIVERY_PAUSED');
  if (adapters.migration !== input.expectedMigration) blockers.push('MIGRATION_MISMATCH');
  const ready = blockers.length === 0;
  return {
    liveness: 'UP',
    readiness: ready ? 'UP' : 'DOWN',
    businessWrites: adapters.database === 'up' ? 'ALLOWED' : 'BLOCKED',
    consumer: adapters.rabbitmq === 'up' ? 'RUNNING' : 'PAUSED',
    warnings,
    blockers,
  };
}

const state = evaluate(input.adapters);
assert.equal(state.readiness, 'UP');
assert.equal(state.businessWrites, 'ALLOWED');
assert.equal(state.consumer, 'PAUSED');
assert.ok(state.warnings.includes('OUTBOX_DELIVERY_PAUSED'));
assert.equal(state.blockers.length, 0);
console.log(JSON.stringify(state, null, 2));
console.log('readiness: status=' + state.readiness + ' consumer=' + state.consumer +
  ' warnings=' + state.warnings.length);
`,
      },
      stdin:
        '{"expectedMigration":"2026_11_teamflow","adapters":{"database":"up","redis":"down","rabbitmq":"down","migration":"2026_11_teamflow"}}',
      checkpoint:
        'readiness 必须为 UP，因为数据库与迁移正常；consumer 为 PAUSED，businessWrites 为 ALLOWED，warnings 同时含 CACHE_DEGRADED 和 OUTBOX_DELIVERY_PAUSED；最后一行 warnings=2，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 后端核心链路与异常恢复': {
    title: 'TeamFlow 项目台 06 · 事务原子性与 Outbox 幂等',
    description:
      '在一笔业务更新中同时写任务、审计和 Outbox，用快照回滚故障事务；再让消费者先失败后重试并接收重复事件，只产生一条通知。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-transaction-snapshot-guided',
      title: '跟做：业务事实和消息意图同提交',
      brief:
        '执行一次成功事务和一次注入失败事务。失败事务必须恢复任务版本、审计和 Outbox 快照，不能用 finally 删除已经提交的成功记录。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const state = {
  task: { id: input.task.id, status: 'TODO', version: 1 },
  audit: [],
  outbox: [],
};

function runTransaction(command, failAfterAudit) {
  const snapshot = structuredClone(state);
  try {
    state.task.status = command.nextStatus;
    state.task.version += 1;
    state.audit.push({ action: 'task.transition', from: command.from, to: command.nextStatus });
    if (failAfterAudit) throw new Error('SIMULATED_DB_FAILURE_AFTER_AUDIT');
    state.outbox.push({ id: command.eventId, type: 'task.transitioned', version: state.task.version });
    return { ok: true, eventId: command.eventId };
  } catch (error) {
    state.task = snapshot.task;
    state.audit = snapshot.audit;
    state.outbox = snapshot.outbox;
    return { ok: false, code: error.message };
  }
}

const succeeded = runTransaction(input.success, false);
const failed = runTransaction(input.failure, true);
assert.equal(succeeded.ok, true);
assert.equal(failed.ok, false);
assert.equal(state.task.status, input.success.nextStatus);
assert.equal(state.task.version, 2);
assert.equal(state.audit.length, 1);
assert.equal(state.outbox.length, 1);
console.log(JSON.stringify({ succeeded, failed, state }, null, 2));
console.log('transaction: version=' + state.task.version + ' audit=' + state.audit.length +
  ' outbox=' + state.outbox.length);
`,
      },
      stdin:
        '{"task":{"id":"task-77"},"success":{"from":"TODO","nextStatus":"DOING","eventId":"evt-301"},"failure":{"from":"DOING","nextStatus":"DONE","eventId":"evt-302"}}',
      checkpoint:
        '成功事务后 version=2、audit=1、outbox=1；失败事务返回 SIMULATED_DB_FAILURE_AFTER_AUDIT 且不留下任何部分写入；最后一行 version=2 audit=1 outbox=1，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-outbox-idempotent-consumer-independent',
      title: '独立实践：至少一次投递只产生一次通知',
      brief:
        '让消费者按事件顺序发布，第一投递注入临时超时，随后重试；同一 eventId 再次投递时必须命中通知幂等键。记录尝试次数、状态和最终通知。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const attempts = new Map();
const notifications = new Map();
const logs = [];

function deliver(event) {
  const attempt = (attempts.get(event.id) || 0) + 1;
  attempts.set(event.id, attempt);
  if (event.id === input.transientFailureId && attempt === 1) {
    logs.push({ eventId: event.id, attempt, outcome: 'PUBLISH_TIMEOUT' });
    return 'RETRY';
  }
  if (notifications.has(event.id)) {
    logs.push({ eventId: event.id, attempt, outcome: 'DUPLICATE_IGNORED' });
    return 'ACK';
  }
  notifications.set(event.id, {
    eventId: event.id,
    recipientId: event.recipientId,
    taskId: event.taskId,
  });
  logs.push({ eventId: event.id, attempt, outcome: 'NOTIFIED' });
  return 'ACK';
}

for (const event of input.events) {
  for (let pass = 0; pass < 3; pass += 1) {
    if (deliver(event) === 'ACK') break;
  }
}

assert.equal(notifications.size, 2);
assert.equal(attempts.get(input.transientFailureId), 3);
assert.ok(logs.some((item) => item.outcome === 'DUPLICATE_IGNORED'));
assert.deepEqual([...notifications.keys()], ['evt-401', 'evt-402']);
console.log(JSON.stringify({
  attempts: Object.fromEntries([...attempts.entries()].sort()),
  notifications: [...notifications.values()],
  logs,
}, null, 2));
console.log('outbox-consumer: notifications=' + notifications.size +
  ' failureRetries=' + logs.filter((item) => item.outcome === 'PUBLISH_TIMEOUT').length +
  ' duplicateDeliveries=' + logs.filter((item) =>
    item.outcome === 'DUPLICATE_IGNORED').length);
`,
      },
      stdin:
        '{"transientFailureId":"evt-401","events":[{"id":"evt-401","recipientId":"u-8","taskId":"task-77"},{"id":"evt-401","recipientId":"u-8","taskId":"task-77"},{"id":"evt-402","recipientId":"u-9","taskId":"task-78"},{"id":"evt-402","recipientId":"u-9","taskId":"task-78"}]}',
      checkpoint:
        '第一条事件首次发布超时、重试后成功，之后重复投递记 DUPLICATE_IGNORED；最终通知恰为 evt-401 和 evt-402 两条；最后一行 notifications=2 failureRetries=1 duplicateDeliveries=1，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 前端页面、状态与可访问交互': {
    title: 'TeamFlow 项目台 07 · 工作区切换与键盘任务状态',
    description:
      '用可观察 reducer 处理工作区切换、旧请求回包和缓存清理；再用键盘命令驱动任务状态机，验证无权限与非法状态转换都有可读反馈。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-workspace-stale-response-guided',
      title: '跟做：切换工作区后旧响应必须失效',
      brief:
        '处理开始切换、旧工作区慢响应、新工作区成功响应三个事件。输出每次接收结果，确认旧项目、通知数和筛选条件没有混入新租户。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function reducer(state, event) {
  if (event.type === 'switch-workspace') {
    return {
      ...state,
      workspaceId: event.workspaceId,
      requestId: state.requestId + 1,
      projects: [],
      unreadNotifications: 0,
      filters: {},
      status: 'loading',
    };
  }
  if (event.type === 'receive-projects') {
    if (event.requestId !== state.requestId) {
      return { ...state, ignoredResponse: event.requestId };
    }
    return {
      ...state,
      projects: event.projects,
      filters: { projectId: event.projects[0].id },
      status: 'ready',
      ignoredResponse: null,
    };
  }
  return state;
}

let state = input.initial;
const trace = [];
for (const event of input.events) {
  state = reducer(state, event);
  trace.push({
    event: event.label,
    workspaceId: state.workspaceId,
    requestId: state.requestId,
    projects: state.projects.map((project) => project.id),
    ignoredResponse: state.ignoredResponse,
  });
}

assert.equal(state.workspaceId, 'ws-beta');
assert.deepEqual(state.projects.map((project) => project.id), ['beta-1']);
assert.equal(state.unreadNotifications, 0);
assert.equal(trace[1].ignoredResponse, 0);
assert.equal(state.requestId, 1);
console.log(JSON.stringify({ finalState: state, trace }, null, 2));
console.log('workspace-switch: active=' + state.workspaceId + ' projects=' +
  state.projects.length + ' staleIgnored=' + trace[1].ignoredResponse);
`,
      },
      stdin:
        '{"initial":{"workspaceId":"ws-alpha","requestId":0,"projects":[{"id":"alpha-1"}],"unreadNotifications":4,"filters":{"status":"DOING"},"status":"ready"},"events":[{"type":"switch-workspace","label":"begin-switch","workspaceId":"ws-beta"},{"type":"receive-projects","label":"alpha-slow-response","requestId":0,"projects":[{"id":"alpha-1"}]},{"type":"receive-projects","label":"beta-response","requestId":1,"projects":[{"id":"beta-1"}]}]}',
      checkpoint:
        '最终 active=ws-beta，仅保留 beta-1，未读数与旧筛选被清零；alpha-slow-response 被标记 ignoredResponse=0；最后一行 staleIgnored=0，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-keyboard-transition-independent',
      title: '独立实践：拖拽之外还有完整键盘路径',
      brief:
        '通过 focus、move-next、move-prev 和 reload-version 命令操作任务。状态只能 TODO→DOING→DONE；无权限或非法转移给出稳定 code 与可访问消息，版本冲突后重新加载。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const order = ['TODO', 'DOING', 'DONE'];
let state = structuredClone(input.state);
const announcements = [];

function command(action) {
  const task = state.tasks.find((item) => item.id === state.focusedTaskId);
  if (action.type === 'focus') {
    state.focusedTaskId = action.taskId;
    return { ok: true, code: 'FOCUSED' };
  }
  if (!task) return { ok: false, code: 'NO_FOCUSED_TASK' };
  if (!task.canEdit) {
    const message = '当前角色不能更新此任务';
    announcements.push(message);
    return { ok: false, code: 'TASK_READ_ONLY', message };
  }
  if (action.type === 'reload-version') {
    task.version = action.version;
    return { ok: true, code: 'VERSION_RELOADED', version: task.version };
  }
  const direction = action.type === 'move-next' ? 1 : -1;
  const target = order[order.findIndex((item) => item === task.status) + direction];
  if (!target) {
    const message = '任务已经位于' + task.status + '，没有可移动的下一状态';
    announcements.push(message);
    return { ok: false, code: 'INVALID_TRANSITION', message };
  }
  const from = task.status;
  task.status = target;
  task.version += 1;
  const message = '任务已从' + from + '移动到' + target;
  announcements.push(message);
  return { ok: true, code: 'TRANSITIONED', from, to: target, version: task.version };
}

const results = input.commands.map((action) => ({ label: action.label, ...command(action) }));
assert.deepEqual(results.map((item) => item.code), [
  'FOCUSED',
  'TRANSITIONED',
  'TRANSITIONED',
  'INVALID_TRANSITION',
]);
assert.equal(state.tasks[0].status, 'DONE');
assert.equal(state.tasks[0].version, 5);
assert.equal(announcements.length, 3);
console.log(JSON.stringify({
  focusedTask: state.focusedTaskId,
  task: state.tasks[0],
  results,
  announcements,
}, null, 2));
console.log('keyboard-board: status=' + state.tasks[0].status + ' announcement=' +
  announcements.at(-1));
`,
      },
      stdin:
        '{"state":{"focusedTaskId":null,"tasks":[{"id":"task-11","title":"修复登录","status":"TODO","version":3,"canEdit":true},{"id":"task-12","title":"审计导出","status":"TODO","version":1,"canEdit":false}]},"commands":[{"type":"focus","label":"focus-task","taskId":"task-11"},{"type":"move-next","label":"start"},{"type":"move-next","label":"finish"},{"type":"move-next","label":"stop-at-done"}]}',
      checkpoint:
        '命令结果依次为 FOCUSED、TRANSITIONED、TRANSITIONED、INVALID_TRANSITION；task-11 最终为 DONE、version=5；每次成功和拒绝状态都写入 announcements；最后一行 status=DONE，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 联调、测试、安全与性能': {
    title: 'TeamFlow 项目台 08 · 权限矩阵与真实查询成本',
    description:
      '把角色、对象归属、动作组成测试矩阵；再比较无索引扫描与带租户索引的操作次数，并验证撤权后的旧缓存版本不能继续写。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-permission-matrix-guided',
      title: '跟做：允许和拒绝用例必须同表',
      brief:
        '读取六条权限用例及期望结果，逐条执行租户、角色和对象归属判断。任何期望与实际不一致都失败，并输出每个拒绝原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const roleCapabilities = {
  ADMIN: ['member.invite', 'project.create', 'audit.read'],
  LEAD: ['project.create', 'task.assign', 'audit.read'],
  MEMBER: ['task.update.own', 'comment.create'],
  AUDITOR: ['audit.read'],
};

function evaluate(testCase) {
  if (testCase.tenantId !== testCase.objectTenantId) return { allowed: false, code: 'TENANT_MISMATCH' };
  if (!roleCapabilities[testCase.role].includes(testCase.action)) {
    return { allowed: false, code: 'CAPABILITY_DENIED' };
  }
  if (testCase.action === 'task.update.own' && testCase.actorId !== testCase.ownerId) {
    return { allowed: false, code: 'OWNERSHIP_DENIED' };
  }
  return { allowed: true, code: 'ALLOWED' };
}

const results = input.cases.map((testCase) => ({
  label: testCase.label,
  expected: testCase.expected,
  ...evaluate(testCase),
}));
const mismatches = results.filter((item) =>
  item.allowed !== item.expected.allowed || item.code !== item.expected.code);

assert.equal(results.length, 6);
assert.equal(mismatches.length, 0);
assert.equal(results.filter((item) => item.allowed).length, 3);
console.log(JSON.stringify({ results, mismatches }, null, 2));
console.log('permission-matrix: cases=' + results.length + ' denied=' +
  results.filter((item) => !item.allowed).length + ' mismatches=0');
`,
      },
      stdin:
        '{"cases":[{"label":"admin-invite","tenantId":7,"objectTenantId":7,"role":"ADMIN","action":"member.invite","expected":{"allowed":true,"code":"ALLOWED"}},{"label":"lead-assign","tenantId":7,"objectTenantId":7,"role":"LEAD","action":"task.assign","expected":{"allowed":true,"code":"ALLOWED"}},{"label":"member-own","tenantId":7,"objectTenantId":7,"role":"MEMBER","action":"task.update.own","actorId":"u-2","ownerId":"u-2","expected":{"allowed":true,"code":"ALLOWED"}},{"label":"member-other","tenantId":7,"objectTenantId":7,"role":"MEMBER","action":"task.update.own","actorId":"u-2","ownerId":"u-3","expected":{"allowed":false,"code":"OWNERSHIP_DENIED"}},{"label":"auditor-create","tenantId":7,"objectTenantId":7,"role":"AUDITOR","action":"project.create","expected":{"allowed":false,"code":"CAPABILITY_DENIED"}},{"label":"cross-tenant","tenantId":7,"objectTenantId":8,"role":"ADMIN","action":"audit.read","expected":{"allowed":false,"code":"TENANT_MISMATCH"}}]}',
      checkpoint:
        '6 条用例全部符合期望，3 条允许、3 条拒绝，mismatches=0；拒绝原因分别覆盖对象归属、capability 和租户不匹配；最后一行 denied=3 mismatches=0，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-query-and-revocation-independent',
      title: '独立实践：索引减少扫描，撤权提升成员版本',
      brief:
        '生成固定任务集合，比较全表过滤与租户复合索引适配器的扫描量；再用 memberVersion 拦截旧权限缓存，输出性能与安全证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const tasks = Array.from({ length: input.totalTasks }, (_, index) => ({
  id: 'task-' + index,
  tenantId: index % 2 === 0 ? 7 : 8,
  projectId: index % 10 === 0 ? 20 : 21,
  status: index % 3 === 0 ? 'TODO' : 'DOING',
  assigneeId: 'u-' + (index % 17),
}));
const expected = tasks.filter((task) =>
  task.tenantId === 7 && task.projectId === 20 && task.status === 'TODO').slice(0, input.limit);

const fullScan = () => ({ rowsScanned: tasks.length, rows: expected });
const tenantIndex = () => ({ rowsScanned: Math.ceil(input.totalTasks / 2), rows: expected });
const before = fullScan();
const after = tenantIndex();
assert.deepEqual(after.rows, expected);
assert.ok(after.rowsScanned < before.rowsScanned / 1.8);

const authCache = new Map([
  ['tenant:7:member:u-9:v1', { role: 'LEAD', memberVersion: 1 }],
]);
function writeAs(cacheKey, suppliedVersion) {
  const cached = authCache.get(cacheKey);
  if (!cached || cached.memberVersion !== suppliedVersion) {
    return { status: 403, code: 'AUTHORIZATION_VERSION_STALE' };
  }
  return { status: 200, code: 'ALLOWED', role: cached.role };
}
const revokedBefore = writeAs('tenant:7:member:u-9:v1', 1);
authCache.set('tenant:7:member:u-9:v2', { role: 'MEMBER', memberVersion: 2 });
authCache.delete('tenant:7:member:u-9:v1');
const revokedAfter = writeAs('tenant:7:member:u-9:v1', 1);
assert.equal(revokedBefore.status, 200);
assert.equal(revokedAfter.code, 'AUTHORIZATION_VERSION_STALE');
console.log(JSON.stringify({
  query: {
    expectedRows: expected.length,
    fullScanRows: before.rowsScanned,
    indexedRows: after.rowsScanned,
  },
  revocation: { revokedBefore, revokedAfter },
}, null, 2));
console.log('security-performance: rows=' + before.rowsScanned + '->' + after.rowsScanned +
  ' staleCache=' + revokedAfter.code);
`,
      },
      stdin: '{"totalTasks":1000,"limit":12}',
      checkpoint:
        '查询返回 12 行；全表扫描 1000 行，索引适配器仅 500 行；旧缓存第一次允许、删除后同一版本返回 AUTHORIZATION_VERSION_STALE；最后一行 rows=1000->500，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 容器、CI/CD、可观测与发布': {
    title: 'TeamFlow 项目台 09 · 不可变制品与滚动兼容',
    description:
      '校验镜像 digest、SBOM、测试和迁移证据，再模拟数据库先扩字段、旧新应用并存和消费者双版本解析，最后验证回滚仍兼容。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-release-artifact-guided',
      title: '跟做：一个证据缺失就不能进入发布',
      brief:
        '读取构建清单，逐个检查固定 digest、SBOM、测试、依赖扫描、镜像扫描和迁移制品。输出唯一阻断原因，并计算可追溯发布标签。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function inspect(artifact) {
  const checks = {
    immutableDigest: /^sha256:[a-f0-9]{64}$/.test(artifact.digest),
    sbomPresent: artifact.sbom === 'present',
    unitTests: artifact.tests?.failed === 0 && artifact.tests?.passed > 0,
    dependencyScan: artifact.dependencyScan === 'clean',
    imageScan: artifact.imageScan === 'clean',
    migrationArtifact: artifact.migration?.startsWith('teamflow-migration:'),
  };
  const blockers = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  return {
    digest: artifact.digest,
    label: artifact.commit.slice(0, 8) + '-' + artifact.digest.slice(7, 19),
    checks,
    blockers,
    decision: blockers.length === 0 ? 'PROMOTE' : 'BLOCK',
  };
}

const result = inspect(input.artifact);
assert.equal(result.decision, 'BLOCK');
assert.deepEqual(result.blockers, ['imageScan']);
assert.equal(result.label, 'a1b2c3d4-cccccccccccc');
console.log(JSON.stringify(result, null, 2));
console.log('release-artifact: digest=' + result.digest.slice(0, 19) +
  ' blockers=' + result.blockers.join(','));
`,
      },
      stdin:
        '{"artifact":{"commit":"a1b2c3d4e5f60708","digest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","sbom":"present","tests":{"passed":248,"failed":0},"dependencyScan":"clean","imageScan":"vulnerable","migration":"teamflow-migration:2026_11"}}',
      checkpoint:
        '只有 imageScan 失败，decision 为 BLOCK；标签稳定为 a1b2c3d4-cccccccccccc；最后一行 blockers=imageScan，退出码为 0。发布标签同时绑定提交与镜像 digest，不能只用 latest。',
    },
    apply: {
      id: 'p15-teamflow-rolling-compatibility-independent',
      title: '独立实践：旧新版本并存时仍能读写',
      brief:
        '模拟 schema v2 已扩展、app v1/v2 同时运行、consumer v1/v2 同时解析事件。任何版本无法读写就停止切流；全部兼容才把 canary 提升为 released。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function appRead(appVersion, schema) {
  const column = appVersion === 1 ? 'status' : 'status';
  const supported = Boolean(schema.columns[column]);
  return supported && schema.minApp <= appVersion && appVersion <= schema.maxApp;
}
function appWrite(appVersion, schema) {
  return schema.writeableBy.includes(appVersion);
}
function consume(consumerVersion, event) {
  const allowed = event.requiredConsumer <= consumerVersion;
  return {
    ok: allowed,
    ignoredFields: event.fields.filter((field) =>
      !event.consumerFields[consumerVersion].includes(field)),
  };
}

const appMatrix = input.appVersions.map((version) => ({
  version,
  read: appRead(version, input.schema),
  write: appWrite(version, input.schema),
}));
const eventMatrix = input.consumerVersions.map((version) => ({
  version,
  ...consume(version, input.event),
}));
const compatible = appMatrix.every((item) => item.read && item.write) &&
  eventMatrix.every((item) => item.ok);
assert.equal(compatible, true);
assert.equal(eventMatrix[0].ignoredFields.length, 1);
assert.equal(eventMatrix[1].ignoredFields.length, 0);
const decision = compatible ? 'RELEASED' : 'STOP_ROLLOUT';
console.log(JSON.stringify({ appMatrix, eventMatrix, decision }, null, 2));
console.log('rolling-release: decision=' + decision + ' schema=' + input.schema.version);
`,
      },
      stdin:
        '{"schema":{"version":2,"minApp":1,"maxApp":2,"columns":{"status":true,"description":true},"writeableBy":[1,2]},"appVersions":[1,2],"consumerVersions":[1,2],"event":{"requiredConsumer":1,"fields":["taskId","status","description"],"consumerFields":{"1":["taskId","status"],"2":["taskId","status","description"]}}}',
      checkpoint:
        'app v1/v2 都能读写 schema v2；consumer v1 正常处理且忽略 description，consumer v2 读取全部字段；decision 为 RELEASED；最后一行 schema=2，退出码为 0。',
    },
  },

  'programming:综合训练 · TeamFlow 协作 SaaS · 故障演练、回滚与项目答辩': {
    title: 'TeamFlow 项目台 10 · 故障动作与答辩证据链',
    description:
      '根据消息积压、权限缓存与复制延迟生成恢复动作；再按时间线和事故前后快照计算检测/恢复时长，拒绝缺少关键证据的答辩报告。',
    ...nodeRuntime,
    practice: {
      id: 'p15-teamflow-incident-actions-guided',
      title: '跟做：故障时先保护事实和安全边界',
      brief:
        '读取 RabbitMQ、Outbox、权限缓存和数据库副本状态，按规则生成动作。不得删除 Outbox，撤权后必须清缓存并拒绝旧角色写入。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function decide(state) {
  const actions = [];
  if (state.rabbitmq === 'down') actions.push('PAUSE_CONSUMER');
  if (state.outboxPending > 0) actions.push('KEEP_OUTBOX_FOR_REPLAY');
  if (state.cacheRole !== state.currentRole) actions.push('EVICT_PERMISSION_CACHE');
  if (state.currentRole !== 'LEAD') actions.push('DENY_TASK_ASSIGN');
  if (state.replicaLagMs > 60_000) actions.push('READ_AFTER_WRITE_FROM_PRIMARY');
  return {
    actions,
    taskWrite: state.database === 'up' ? 'ALLOW' : 'BLOCK',
    notificationWrite: 'OUTBOX_ONLY',
  };
}

const result = decide(input.state);
assert.deepEqual(result.actions, [
  'PAUSE_CONSUMER',
  'KEEP_OUTBOX_FOR_REPLAY',
  'EVICT_PERMISSION_CACHE',
  'DENY_TASK_ASSIGN',
  'READ_AFTER_WRITE_FROM_PRIMARY',
]);
assert.ok(!result.actions.includes('DELETE_OUTBOX'));
assert.equal(result.taskWrite, 'ALLOW');
assert.equal(result.notificationWrite, 'OUTBOX_ONLY');
console.log(JSON.stringify({ state: input.state, result }, null, 2));
console.log('incident-policy: actions=' + result.actions.length + ' outbox=' + result.notificationWrite);
`,
      },
      stdin:
        '{"state":{"rabbitmq":"down","outboxPending":42,"cacheRole":"LEAD","currentRole":"MEMBER","replicaLagMs":82000,"database":"up"}}',
      checkpoint:
        '动作必须且只能包含 PAUSE_CONSUMER、KEEP_OUTBOX_FOR_REPLAY、EVICT_PERMISSION_CACHE、DENY_TASK_ASSIGN、READ_AFTER_WRITE_FROM_PRIMARY；任务仍可写，通知只进 Outbox；最后一行 actions=5，退出码为 0。',
    },
    apply: {
      id: 'p15-teamflow-defense-evidence-independent',
      title: '独立实践：用证据计算恢复时间并完成答辩',
      brief:
        '读取事故时间线、检查项和事故后事实，计算检测与恢复分钟数。关键证据缺失、跨租户回归失败或任务版本不一致时，答辩状态必须是 incomplete。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const start = new Date(input.timeline.startedAt);
const detected = new Date(input.timeline.detectedAt);
const recovered = new Date(input.timeline.recoveredAt);
const metrics = {
  detectionMinutes: (detected - start) / 60000,
  recoveryMinutes: (recovered - start) / 60000,
};
const requiredEvidence = [
  'outboxCountBefore',
  'outboxCountAfter',
  'tenantIsolationRegression',
  'taskVersionAfter',
  'rollbackDigest',
];
const missingEvidence = requiredEvidence.filter((name) =>
  input.evidence[name] == null || input.evidence[name] === '');
const invariants = {
  tenantIsolationPassed: input.evidence.tenantIsolationRegression === 'pass',
  outboxDrained: input.evidence.outboxCountAfter === 0,
  taskVersionPreserved: input.evidence.taskVersionAfter === input.expectedTaskVersion,
  rollbackTraceable: /^sha256:[a-f0-9]{64}$/.test(input.evidence.rollbackDigest || ''),
};
const complete = missingEvidence.length === 0 && Object.values(invariants).every(Boolean);
assert.equal(metrics.detectionMinutes, 4);
assert.equal(metrics.recoveryMinutes, 18);
assert.equal(missingEvidence.length, 0);
assert.equal(invariants.taskVersionPreserved, false);
assert.equal(complete, false);
console.log(JSON.stringify({
  metrics,
  requiredEvidence,
  missingEvidence,
  invariants,
  defenseStatus: complete ? 'ready' : 'incomplete',
  blockers: Object.entries(invariants)
    .filter(([, pass]) => !pass)
    .map(([name]) => name),
}, null, 2));
console.log('defense: detection=4m recovery=18m status=incomplete');
`,
      },
      stdin:
        '{"timeline":{"startedAt":"2026-11-24T01:00:00Z","detectedAt":"2026-11-24T01:04:00Z","recoveredAt":"2026-11-24T01:18:00Z"},"expectedTaskVersion":13,"evidence":{"outboxCountBefore":42,"outboxCountAfter":0,"tenantIsolationRegression":"pass","taskVersionAfter":12,"rollbackDigest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}',
      checkpoint:
        '检测时间 4 分钟、恢复时间 18 分钟；证据字段齐全，但 taskVersionAfter=12 与期望 13 不一致，因此 defenseStatus=incomplete，唯一阻断项是 taskVersionPreserved；最后一行 status=incomplete，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 业务理解与用户任务': {
    title: 'Commerce 项目台 01 · 购物车报价与订单状态事实',
    description:
      '用整数分计算购物车金额并校验库存、最小起购量和角色动作；再用显式状态机验证订单不能跳过库存预占直接支付。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-cart-quote-guided',
      title: '跟做：消费者动作与运营调价分开',
      brief:
        '读取商品、购物车和操作者角色。合并重复 SKU，以整数分计算总额，输出库存不足和数量非法原因，并拒绝消费者修改商品价格。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const catalog = new Map(input.products.map((product) => [product.sku, product]));
const quantities = new Map();
for (const line of input.cart.lines) {
  quantities.set(line.sku, (quantities.get(line.sku) || 0) + line.quantity);
}

const issues = [];
const pricedLines = [];
for (const [sku, quantity] of [...quantities.entries()].sort()) {
  const product = catalog.get(sku);
  if (!product) {
    issues.push({ sku, code: 'SKU_NOT_FOUND' });
    continue;
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    issues.push({ sku, code: 'INVALID_QUANTITY' });
    continue;
  }
  if (product.stock < quantity) {
    issues.push({ sku, code: 'INSUFFICIENT_STOCK', available: product.stock });
    continue;
  }
  pricedLines.push({
    sku,
    quantity,
    unitPriceCents: product.priceCents,
    lineTotalCents: product.priceCents * quantity,
  });
}

const canChangePrice = input.actor.role === 'OPS' &&
  input.actor.capabilities.includes('catalog.price.update');
assert.equal(canChangePrice, false);
assert.deepEqual(issues.map((issue) => issue.code), [
  'INSUFFICIENT_STOCK',
  'INVALID_QUANTITY',
]);
assert.equal(pricedLines.reduce((sum, line) => sum + line.lineTotalCents, 0), 7470);
console.log(JSON.stringify({
  actor: input.actor,
  pricedLines,
  totalCents: pricedLines.reduce((sum, line) => sum + line.lineTotalCents, 0),
  issues,
}, null, 2));
console.log('cart-quote: lines=' + pricedLines.length + ' totalCents=7470 issues=' +
  issues.length);
`,
      },
      stdin:
        '{"actor":{"id":"buyer-9","role":"CUSTOMER","capabilities":["cart.update"]},"products":[{"sku":"KB-1","priceCents":2990,"stock":2},{"sku":"PAD-2","priceCents":1490,"stock":10},{"sku":"LAMP-3","priceCents":3990,"stock":1},{"sku":"ZZZ-4","priceCents":990,"stock":5}],"cart":{"lines":[{"sku":"KB-1","quantity":1},{"sku":"KB-1","quantity":1},{"sku":"PAD-2","quantity":1},{"sku":"LAMP-3","quantity":2},{"sku":"ZZZ-4","quantity":0}]}}',
      checkpoint:
        '重复 SKU 合并后，KB-1 两件加 PAD-2 一件总价为 7470 分；LAMP-3 因库存不足、ZZZ-4 因 0 数量进入 issues；消费者不得改价；最后一行 lines=2 totalCents=7470 issues=2，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-order-state-machine-independent',
      title: '独立实践：支付成功不能绕过库存预占',
      brief:
        '按动作驱动订单状态机。正常支付要求 PAID 只能从 PAYMENT_PENDING 进入；库存不足让订单失败；取消只释放已预占库存，并记录每次非法转换。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const transitions = {
  reserve: { from: 'CREATED', to: 'RESERVED' },
  requestPayment: { from: 'RESERVED', to: 'PAYMENT_PENDING' },
  pay: { from: 'PAYMENT_PENDING', to: 'PAID' },
  cancel: { from: 'CREATED', to: 'CANCELLED' },
  fail: { from: 'RESERVED', to: 'FAILED' },
};
const order = { id: input.orderId, state: 'CREATED', history: [] };
let reservedUnits = 0;
const rejected = [];

function apply(action) {
  const rule = transitions[action.type];
  if (!rule || rule.from !== order.state) {
    rejected.push({ type: action.type, code: 'INVALID_STATE_TRANSITION', state: order.state });
    return;
  }
  if (action.type === 'reserve') {
    if (action.stock < action.quantity) {
      order.state = 'FAILED';
      order.history.push('RESERVE_REJECTED');
      return;
    }
    reservedUnits = action.quantity;
  }
  order.state = rule.to;
  if (action.type === 'cancel' || action.type === 'fail') reservedUnits = 0;
  order.history.push(action.type + ':' + rule.to);
}

for (const action of input.actions) apply(action);
assert.equal(order.state, 'FAILED');
assert.equal(reservedUnits, 0);
assert.deepEqual(rejected.map((item) => item.code), [
  'INVALID_STATE_TRANSITION',
  'INVALID_STATE_TRANSITION',
  'INVALID_STATE_TRANSITION',
]);
console.log(JSON.stringify({ order, reservedUnits, rejected }, null, 2));
console.log('order-state: final=' + order.state + ' history=' + order.history.join('>') +
  ' rejected=' + rejected.length);
`,
      },
      stdin:
        '{"orderId":"order-1001","actions":[{"type":"pay"},{"type":"requestPayment"},{"type":"reserve","stock":1,"quantity":1},{"type":"fail"},{"type":"pay"}]}',
      checkpoint:
        '订单最终为 FAILED，reservedUnits=0；历史为 reserve:RESERVED 到 fail:FAILED；支付跳过预占、在 CREATED 请求支付、失败后再次支付都被拒绝，最后一行 rejected=3，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 范围、验收与非功能目标': {
    title: 'Commerce 项目台 02 · 验收矩阵与上线红线',
    description:
      '把重复下单、库存竞争、支付回调和消息重放写成带数字证据的验收，再评估延迟、可用性、恢复点与核对差异是否达到首版门槛。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-acceptance-matrix-guided',
      title: '跟做：四个购买风险都要有反例',
      brief:
        '读取四个验收项目和证据，按幂等、库存、回调与通知规则判定。任何一项缺少关键观察都给出稳定 blocker，并保持发布为阻断。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const rules = {
  'duplicate-order': (item) => item.observed.orders === 1 &&
    item.observed.idempotencyRows === 1 && item.observed.status === 200,
  'stock-race': (item) => item.observed.successes === 1 &&
    item.observed.failures === 1 && item.observed.stock === 0,
  'payment-replay': (item) => item.observed.paidTransitions === 1 &&
    item.observed.outboxEvents === 1,
  'notification-replay': (item) => item.observed.notifications === 1 &&
    item.observed.acknowledged === true,
};

const results = input.scenarios.map((item) => {
  const passed = Boolean(rules[item.id]?.(item));
  return { id: item.id, passed, evidence: item.evidence, blocker: passed ? null : 'MISSING_INVARIANT' };
});
const decision = results.every((item) => item.passed) ? 'launch' : 'blocked';
assert.equal(decision, 'blocked');
assert.equal(results.filter((item) => !item.passed).length, 1);
assert.equal(results[3].blocker, 'MISSING_INVARIANT');
console.log(JSON.stringify({ decision, results }, null, 2));
console.log('commerce-acceptance: passed=' + results.filter((item) => item.passed).length +
  ' blocked=' + results.filter((item) => !item.passed).map((item) => item.id).join(','));
`,
      },
      stdin:
        '{"scenarios":[{"id":"duplicate-order","evidence":"e2e/duplicate-order.json","observed":{"orders":1,"idempotencyRows":1,"status":200}},{"id":"stock-race","evidence":"integration/last-stock.json","observed":{"successes":1,"failures":1,"stock":0}},{"id":"payment-replay","evidence":"payment/replay.json","observed":{"paidTransitions":1,"outboxEvents":1}},{"id":"notification-replay","evidence":"kafka/duplicate.json","observed":{"notifications":2,"acknowledged":true}}]}',
      checkpoint:
        '前三个场景通过，notification-replay 因 notifications=2 被阻断；decision=blocked，最后一行 passed=3 blocked=notification-replay，退出码为 0。重放验收必须核对最终业务事实，不能只看消息是否 ACK。',
    },
    apply: {
      id: 'p15-commerce-nonfunctional-gate-independent',
      title: '独立实践：非功能目标用数字决定是否上线',
      brief:
        '读取订单 P95、结算可用性、恢复点目标和账务差异上限，逐项与目标比较。任一项超线就给出 blocker，并按严重度排序。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [
  { id: 'order-p95', actual: input.observed.orderP95Ms, limit: input.targets.orderP95Ms, direction: 'max', blocker: 'LATENCY_SLO_MISSED' },
  { id: 'checkout-availability', actual: input.observed.checkoutAvailability, limit: input.targets.checkoutAvailability, direction: 'min', blocker: 'AVAILABILITY_SLO_MISSED' },
  { id: 'recovery-point', actual: input.observed.recoveryPointMinutes, limit: input.targets.recoveryPointMinutes, direction: 'max', blocker: 'RPO_EXCEEDED' },
  { id: 'ledger-difference', actual: input.observed.ledgerDifferenceCents, limit: input.targets.ledgerDifferenceCents, direction: 'max', blocker: 'RECONCILIATION_MISMATCH' },
].map((check) => ({
  ...check,
  passed: check.direction === 'max' ? check.actual <= check.limit : check.actual >= check.limit,
}));
const blockers = checks.filter((check) => !check.passed).map((check) => check.blocker);
assert.deepEqual(blockers, ['LATENCY_SLO_MISSED', 'RPO_EXCEEDED']);
assert.equal(checks.find((check) => check.id === 'checkout-availability').passed, true);
const decision = blockers.length === 0 ? 'launch' : 'hold';
console.log(JSON.stringify({ checks, blockers, decision }, null, 2));
console.log('nonfunctional-gate: decision=' + decision + ' blockers=' + blockers.join(','));
`,
      },
      stdin:
        '{"targets":{"orderP95Ms":300,"checkoutAvailability":0.999,"recoveryPointMinutes":5,"ledgerDifferenceCents":0},"observed":{"orderP95Ms":412,"checkoutAvailability":0.9994,"recoveryPointMinutes":9,"ledgerDifferenceCents":0}}',
      checkpoint:
        'order-p95 与 recovery-point 超线，可用性和账务差异达标；blockers 依次为 LATENCY_SLO_MISSED、RPO_EXCEEDED；decision=hold；最后一行 blockers 含两项，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · API 契约与前端数据边界': {
    title: 'Commerce 项目台 03 · 金额契约、幂等下单与回调验签',
    description:
      '先以整数分和显式币种校验创建订单请求，再用 idempotency-key 去重；支付回调必须验签、校验金额并阻止重复状态转换。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-request-contract-guided',
      title: '跟做：金额字段不接受模糊字符串',
      brief:
        '校验三项创建订单请求。金额必须是正整数分、币种固定 CNY、数量为正整数；失败响应给出稳定 code 和 field，成功请求保留报价版本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function validate(request) {
  const errors = [];
  if (!Number.isInteger(request.totalCents) || request.totalCents <= 0) {
    errors.push({ field: 'totalCents', code: 'AMOUNT_MUST_BE_POSITIVE_INTEGER_CENTS' });
  }
  if (request.currency !== 'CNY') {
    errors.push({ field: 'currency', code: 'UNSUPPORTED_CURRENCY' });
  }
  if (!Number.isInteger(request.quantity) || request.quantity < 1) {
    errors.push({ field: 'quantity', code: 'QUANTITY_MUST_BE_POSITIVE_INTEGER' });
  }
  return errors.length === 0
    ? { status: 201, quoteVersion: request.quoteVersion }
    : { status: 422, errors };
}

const responses = input.requests.map((request) => ({
  label: request.label,
  ...validate(request),
}));
assert.deepEqual(responses.map((item) => item.status), [201, 422, 422]);
assert.deepEqual(responses[1].errors.map((item) => item.code), [
  'AMOUNT_MUST_BE_POSITIVE_INTEGER_CENTS',
  'UNSUPPORTED_CURRENCY',
]);
assert.equal(responses[0].quoteVersion, input.currentQuote.version);
console.log(JSON.stringify({ responses }, null, 2));
console.log('order-contract: accepted=' + responses.filter((item) =>
  item.status === 201).length + ' rejected=' + responses.filter((item) =>
  item.status === 422).length);
`,
      },
      stdin:
        '{"currentQuote":{"version":"quote-77"},"requests":[{"label":"valid","totalCents":5980,"currency":"CNY","quantity":3,"quoteVersion":"quote-77"},{"label":"ambiguous-money","totalCents":"59.80","currency":"USD","quantity":3,"quoteVersion":"quote-77"},{"label":"zero-quantity","totalCents":2990,"currency":"CNY","quantity":0,"quoteVersion":"quote-78"}]}',
      checkpoint:
        '响应依次为 201、422、422；第二项同时返回 AMOUNT_MUST_BE_POSITIVE_INTEGER_CENTS 与 UNSUPPORTED_CURRENCY；第三项因数量 0 被拒绝；最后一行 accepted=1 rejected=2，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-payment-callback-independent',
      title: '独立实践：支付回调要同时验签、验额和防重',
      brief:
        '使用 Node crypto 的 HMAC 验证支付回调。错误签名返回 401，金额不一致返回 422，重复 eventId 返回 200 且不再产生 Outbox；合法首次回调才把订单置为 PAID。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const order = { id: input.order.id, state: 'PAYMENT_PENDING', amountCents: input.order.amountCents };
const processedEvents = new Set();
const outbox = [];

function sign(body) {
  return crypto.createHmac('sha256', input.secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

function handle(callback) {
  const expected = sign(callback.body);
  if (callback.signature !== expected) return { status: 401, code: 'INVALID_SIGNATURE' };
  if (callback.body.amountCents !== order.amountCents) {
    return { status: 422, code: 'PAYMENT_AMOUNT_MISMATCH' };
  }
  if (processedEvents.has(callback.body.eventId)) {
    return { status: 200, code: 'DUPLICATE_IGNORED', paidTransitions: 0 };
  }
  processedEvents.add(callback.body.eventId);
  const transitions = order.state === 'PAYMENT_PENDING' ? 1 : 0;
  if (transitions) {
    order.state = 'PAID';
    outbox.push({ eventId: callback.body.eventId, type: 'order.paid' });
  }
  return { status: 200, code: 'PROCESSED', paidTransitions: transitions };
}

const validBody = { eventId: 'pay-evt-51', orderId: order.id, amountCents: 5980 };
const callbacks = [
  { label: 'bad-signature', signature: '00', body: validBody },
  { label: 'first-valid', signature: sign(validBody), body: validBody },
  { label: 'replay', signature: sign(validBody), body: validBody },
  { label: 'wrong-amount', signature: sign({ ...validBody, eventId: 'pay-evt-52', amountCents: 1 }),
    body: { ...validBody, eventId: 'pay-evt-52', amountCents: 1 } },
];
const responses = callbacks.map((callback) => ({
  label: callback.label,
  ...handle(callback),
}));
assert.deepEqual(responses.map((item) => item.status), [401, 200, 200, 422]);
assert.equal(order.state, 'PAID');
assert.equal(outbox.length, 1);
assert.equal(responses[2].paidTransitions, 0);
console.log(JSON.stringify({ order, responses, outbox }, null, 2));
console.log('payment-callback: state=' + order.state + ' outbox=' + outbox.length +
  ' replayTransitions=' + responses[2].paidTransitions);
`,
      },
      stdin:
        '{"secret":"local-test-secret","order":{"id":"order-1001","amountCents":5980}}',
      checkpoint:
        '回调状态依次为 401、200、200、422；第一次合法回调把订单置为 PAID 并写一条 Outbox；重复 eventId 的 paidTransitions=0 且不再增加消息；最后一行 outbox=1 replayTransitions=0，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 数据模型、约束与迁移': {
    title: 'Commerce 项目台 04 · 最后一件库存与金额迁移',
    description:
      '用带版本号的库存聚合阻止超卖，再把历史小数金额字符串迁移为整数分，检测重复订单和无法对账的旧行。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-last-stock-guided',
      title: '跟做：两个并发购买只能成功一个',
      brief:
        '在内存中执行两个带期望版本的库存预占。只有版本匹配且库存充足才能成功，失败者返回旧版本摘要；再验证幂等键不会重复扣减。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const inventory = [{ sku: input.sku, available: 1, version: 7 }];
const idempotency = new Map();

function reserve(command) {
  if (idempotency.has(command.idempotencyKey)) {
    return { ok: true, code: 'REPLAYED', reservationId: idempotency.get(command.idempotencyKey) };
  }
  const row = inventory.find((item) => item.sku === command.sku);
  if (!row) return { ok: false, code: 'SKU_NOT_FOUND' };
  if (row.version !== command.expectedVersion) {
    return { ok: false, code: 'STOCK_VERSION_CONFLICT', currentVersion: row.version };
  }
  if (row.available < command.quantity) {
    return { ok: false, code: 'OUT_OF_STOCK', currentVersion: row.version };
  }
  row.available -= command.quantity;
  row.version += 1;
  const reservationId = 'res-' + row.version;
  idempotency.set(command.idempotencyKey, reservationId);
  return { ok: true, code: 'RESERVED', reservationId, currentVersion: row.version };
}

const responses = input.commands.map((command) => ({
  label: command.label,
  ...reserve(command),
}));
assert.deepEqual(responses.map((item) => item.code), [
  'RESERVED',
  'STOCK_VERSION_CONFLICT',
  'REPLAYED',
]);
assert.equal(inventory[0].available, 0);
assert.equal(inventory[0].version, 8);
assert.equal(responses[2].reservationId, responses[0].reservationId);
console.log(JSON.stringify({ inventory, responses }, null, 2));
console.log('stock-reservation: available=' + inventory[0].available + ' version=' +
  inventory[0].version + ' replay=' + responses[2].code);
`,
      },
      stdin:
        '{"sku":"LAST-1","commands":[{"label":"buyer-a","idempotencyKey":"cart-a-1","sku":"LAST-1","quantity":1,"expectedVersion":7},{"label":"buyer-b","idempotencyKey":"cart-b-1","sku":"LAST-1","quantity":1,"expectedVersion":7},{"label":"buyer-a-retry","idempotencyKey":"cart-a-1","sku":"LAST-1","quantity":1,"expectedVersion":7}]}',
      checkpoint:
        'buyer-a 预占成功，buyer-b 因版本过期返回 STOCK_VERSION_CONFLICT，buyer-a 重试返回同一 reservationId；库存从 1 降到 0，版本从 7 升到 8；最后一行 version=8 replay=REPLAYED，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-money-backfill-independent',
      title: '独立实践：历史金额转换必须可核对',
      brief:
        '把旧订单中的元字符串转换为整数分，核对订单头与行合计，并为重复业务键和丢失 SKU 建立阻断证据。只有全部行可转换且对账一致才允许新约束上线。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const knownSkus = new Set(input.catalog.map((item) => item.sku));
function toCents(raw) {
  if (typeof raw !== 'string' || !/^\d+\.\d{2}$/.test(raw)) return null;
  const [yuan, cents] = raw.split('.');
  return Number(yuan) * 100 + Number(cents);
}

const seenOrderKeys = new Set();
const migrated = [];
const blocked = [];
for (const order of input.legacyOrders) {
  const lines = [];
  const problems = [];
  for (const line of order.lines) {
    if (!knownSkus.has(line.sku)) problems.push('SKU_NOT_FOUND');
    const unitPriceCents = toCents(line.unitPrice);
    if (unitPriceCents == null) problems.push('INVALID_MONEY_FORMAT');
    if (!Number.isInteger(line.quantity) || line.quantity < 1) problems.push('INVALID_QUANTITY');
    if (unitPriceCents != null) {
      lines.push({ sku: line.sku, quantity: line.quantity, unitPriceCents,
        lineTotalCents: unitPriceCents * line.quantity });
    }
  }
  const headerCents = toCents(order.total);
  const lineTotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  if (headerCents !== lineTotalCents) problems.push('TOTAL_MISMATCH');
  if (seenOrderKeys.has(order.businessKey)) problems.push('DUPLICATE_BUSINESS_KEY');
  seenOrderKeys.add(order.businessKey);
  (problems.length ? blocked : migrated).push({
    id: order.id,
    businessKey: order.businessKey,
    lineTotalCents,
    problems: [...new Set(problems)],
    lines,
  });
}

assert.equal(migrated.length, 1);
assert.equal(migrated[0].lineTotalCents, 5980);
assert.deepEqual(blocked.map((item) => item.id), ['legacy-2', 'legacy-3']);
assert.ok(blocked[0].problems.includes('TOTAL_MISMATCH'));
assert.ok(blocked[1].problems.includes('DUPLICATE_BUSINESS_KEY'));
const migration = blocked.length === 0 ? 'READY' : 'BLOCKED';
console.log(JSON.stringify({ migrated, blocked, migration }, null, 2));
console.log('money-migration: migrated=' + migrated.length + ' blocked=' +
  blocked.length + ' status=' + migration);
`,
      },
      stdin:
        '{"catalog":[{"sku":"KB-1"},{"sku":"PAD-2"}],"legacyOrders":[{"id":"legacy-1","businessKey":"order-A","total":"59.80","lines":[{"sku":"KB-1","quantity":2,"unitPrice":"29.90"}]},{"id":"legacy-2","businessKey":"order-B","total":"30.00","lines":[{"sku":"KB-1","quantity":1,"unitPrice":"29.90"}]},{"id":"legacy-3","businessKey":"order-A","total":"14.90","lines":[{"sku":"UNKNOWN","quantity":1,"unitPrice":"14.90"}]}]}',
      checkpoint:
        'legacy-1 成功迁移为 5980 分；legacy-2 因 TOTAL_MISMATCH 阻断；legacy-3 因 SKU_NOT_FOUND 与 DUPLICATE_BUSINESS_KEY 阻断；最后一行 migrated=1 blocked=2 status=BLOCKED，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 项目骨架、模块边界与本地环境': {
    title: 'Commerce 项目台 05 · 依赖方向与依赖适配器',
    description:
      '通过 Gradle 风格模块图验证 catalog、inventory、order、payment、notification 和 app 的依赖方向；再用显式 PostgreSQL、Redis、Kafka 适配器决定 readiness 与降级。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-module-direction-guided',
      title: '跟做：领域模块不得反向依赖应用层',
      brief:
        '读取模块依赖边，检测未知模块和环，再拒绝 catalog 反向依赖 order、app 依赖 domain 等违规边。输出稳定拓扑顺序和违规原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const forbidden = new Map([
  ['catalog->order', 'DOMAIN_DEPENDENCY_REVERSED'],
  ['app->order', 'APPLICATION_OWNS_WIRING_ONLY'],
]);

function inspect(modules, edges) {
  const known = new Set(modules);
  const violations = [];
  const outgoing = new Map(modules.map((name) => [name, []]));
  const indegree = new Map(modules.map((name) => [name, 0]));
  for (const [from, to] of edges) {
    if (!known.has(from) || !known.has(to)) {
      violations.push({ edge: from + '->' + to, code: 'UNKNOWN_MODULE' });
      continue;
    }
    const rule = forbidden.get(from + '->' + to);
    if (rule) {
      if (!violations.some((item) => item.edge === from + '->' + to)) {
        violations.push({ edge: from + '->' + to, code: rule });
      }
      continue;
    }
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  const ready = modules.filter((name) => indegree.get(name) === 0).sort();
  const order = [];
  while (ready.length > 0) {
    const current = ready.shift();
    order.push(current);
    for (const next of outgoing.get(current).sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  return {
    order,
    violations,
    graphReady: order.length === modules.length && violations.length === 0,
  };
}

const result = inspect(input.modules, input.edges);
assert.equal(result.graphReady, false);
assert.deepEqual(result.violations.map((item) => item.code), [
  'DOMAIN_DEPENDENCY_REVERSED',
  'APPLICATION_OWNS_WIRING_ONLY',
]);
assert.ok(result.order.indexOf('catalog') < result.order.indexOf('inventory'));
assert.ok(result.order.indexOf('inventory') < result.order.indexOf('order'));
console.log(JSON.stringify(result, null, 2));
console.log('commerce-modules: order=' + result.order.join('>') + ' violations=' +
  result.violations.length);
`,
      },
      stdin:
        '{"modules":["catalog","inventory","order","payment","notification","app"],"edges":[["catalog","inventory"],["inventory","order"],["catalog","order"],["payment","order"],["order","notification"],["app","catalog"],["app","inventory"],["app","order"],["app","payment"],["app","notification"],["catalog","order"],["app","order"]]}',
      checkpoint:
        '有效依赖生成拓扑顺序，catalog 先于 inventory、inventory 先于 order；违规边 catalog->order 为 DOMAIN_DEPENDENCY_REVERSED，app->order 为 APPLICATION_OWNS_WIRING_ONLY；最后一行 violations=2，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-local-adapters-independent',
      title: '独立实践：本地依赖故障时诚实降级',
      brief:
        '读取 PostgreSQL、迁移、Redis、Kafka 和支付适配器状态。数据库或迁移不可用必须停止接流量；缓存异常仅降级，Kafka 异常暂停通知消费者，支付未知时禁止确认成功。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function readiness(adapters) {
  const blockers = [];
  const warnings = [];
  if (adapters.postgres !== 'ready') blockers.push('POSTGRES_NOT_READY');
  if (adapters.migration !== input.expectedMigration) blockers.push('MIGRATION_MISMATCH');
  if (adapters.redis !== 'ready') warnings.push('CACHE_DEGRADED');
  if (adapters.kafka !== 'ready') warnings.push('NOTIFICATION_OUTBOX_ONLY');
  if (adapters.payment !== 'ready') warnings.push('PAYMENT_RESULT_UNKNOWN');
  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    checkout: blockers.length === 0 && adapters.payment === 'ready' ? 'ACCEPT' : 'HOLD',
    notificationConsumer: adapters.kafka === 'ready' ? 'RUN' : 'PAUSE',
  };
}

const result = readiness(input.adapters);
assert.equal(result.ready, true);
assert.equal(result.checkout, 'HOLD');
assert.equal(result.notificationConsumer, 'PAUSE');
assert.deepEqual(result.warnings, ['CACHE_DEGRADED', 'NOTIFICATION_OUTBOX_ONLY', 'PAYMENT_RESULT_UNKNOWN']);
console.log(JSON.stringify({ adapters: input.adapters, result }, null, 2));
console.log('commerce-local: ready=' + result.ready + ' checkout=' + result.checkout +
  ' consumer=' + result.notificationConsumer);
`,
      },
      stdin:
        '{"expectedMigration":"commerce-2026-11","adapters":{"postgres":"ready","migration":"commerce-2026-11","redis":"down","kafka":"down","payment":"unknown"}}',
      checkpoint:
        '应用 readiness 为 true，因为数据库和迁移正常；结算因支付结果未知必须 HOLD；Kafka 不可用时消费者 PAUSE，通知只依赖 Outbox；warnings 恰为三项，最后一行 checkout=HOLD consumer=PAUSE，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 后端核心链路与异常恢复': {
    title: 'Commerce 项目台 06 · 下单原子性与补偿',
    description:
      '在单库适配器中原子写订单、库存预占和 Outbox；再模拟支付明确拒绝后的库存释放与取消补偿，验证重复回调不会重复释放。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-place-order-transaction-guided',
      title: '跟做：订单、库存和消息意图一起提交',
      brief:
        '执行两笔下单，其中第二笔在写审计后注入数据库故障。成功单保留订单、库存变化和 Outbox；失败单完整回滚，不留下半个订单。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const db = {
  orders: [],
  stock: [{ sku: 'LAST-1', available: 2, version: 4 }],
  outbox: [],
};

function placeOrder(command, injectFailure) {
  const snapshot = structuredClone(db);
  try {
    const stock = db.stock.find((item) => item.sku === command.sku);
    if (!stock || stock.available < command.quantity) throw new Error('OUT_OF_STOCK');
    stock.available -= command.quantity;
    stock.version += 1;
    db.orders.push({ id: command.orderId, state: 'RESERVED', totalCents: command.totalCents });
    if (injectFailure) throw new Error('DB_FAILURE_AFTER_RESERVATION');
    db.outbox.push({ eventId: command.eventId, type: 'order.reserved', orderId: command.orderId });
    return { ok: true, orderId: command.orderId };
  } catch (error) {
    db.orders = snapshot.orders;
    db.stock = snapshot.stock;
    db.outbox = snapshot.outbox;
    return { ok: false, code: error.message };
  }
}

const first = placeOrder(input.commands[0], false);
const second = placeOrder(input.commands[1], true);
assert.equal(first.ok, true);
assert.equal(second.ok, false);
assert.equal(db.orders.length, 1);
assert.equal(db.stock[0].available, 1);
assert.equal(db.stock[0].version, 5);
assert.equal(db.outbox.length, 1);
console.log(JSON.stringify({ first, second, db }, null, 2));
console.log('place-order: orders=' + db.orders.length + ' stock=' +
  db.stock[0].available + ' outbox=' + db.outbox.length);
`,
      },
      stdin:
        '{"commands":[{"orderId":"order-A","eventId":"evt-reserve-A","sku":"LAST-1","quantity":1,"totalCents":3990},{"orderId":"order-B","eventId":"evt-reserve-B","sku":"LAST-1","quantity":1,"totalCents":3990}]}',
      checkpoint:
        '第一笔成功，第二笔返回 DB_FAILURE_AFTER_RESERVATION；最终只有 1 个订单、1 条 Outbox，库存从 2 变 1，版本从 4 变 5；最后一行 orders=1 stock=1 outbox=1，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-payment-decline-compensation-independent',
      title: '独立实践：支付拒绝后释放库存但不伪造成功',
      brief:
        '库存预占已在本地事务提交，随后支付提供方明确拒绝。执行补偿：订单取消、库存释放、写补偿 Outbox；重复拒绝回调命中同一补偿键，不能二次加库存。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const state = {
  order: { id: input.orderId, state: 'RESERVED', version: 2 },
  stock: { sku: input.sku, available: 0, version: 9 },
  outbox: [],
  compensation: new Map(),
};

function decline(callback) {
  if (state.compensation.has(callback.compensationKey)) {
    return { status: 200, code: 'COMPENSATION_REPLAYED' };
  }
  if (callback.reason !== 'card_declined') {
    return { status: 409, code: 'PAYMENT_RESULT_NOT_FINAL' };
  }
  state.order.state = 'CANCELLED';
  state.order.version += 1;
  state.stock.available += input.quantity;
  state.stock.version += 1;
  state.outbox.push({
    eventId: callback.eventId,
    type: 'order.cancelled',
    compensationKey: callback.compensationKey,
  });
  state.compensation.set(callback.compensationKey, {
    stockVersion: state.stock.version,
    orderVersion: state.order.version,
  });
  return { status: 200, code: 'COMPENSATED' };
}

const results = input.callbacks.map((callback) => ({
  label: callback.label,
  ...decline(callback),
}));
assert.deepEqual(results.map((item) => item.code), [
  'COMPENSATED',
  'COMPENSATION_REPLAYED',
  'PAYMENT_RESULT_NOT_FINAL',
]);
assert.equal(state.stock.available, 1);
assert.equal(state.stock.version, 10);
assert.equal(state.order.version, 3);
assert.equal(state.outbox.length, 1);
console.log(JSON.stringify({ state: { ...state, compensation: [...state.compensation] }, results }, null, 2));
console.log('payment-decline: order=' + state.order.state + ' stock=' +
  state.stock.available + ' outbox=' + state.outbox.length);
`,
      },
      stdin:
        '{"orderId":"order-C","sku":"LAST-1","quantity":1,"callbacks":[{"label":"first-decline","eventId":"pay-evt-1","compensationKey":"comp-order-C","reason":"card_declined"},{"label":"replay-decline","eventId":"pay-evt-1","compensationKey":"comp-order-C","reason":"card_declined"},{"label":"pending","eventId":"pay-evt-2","compensationKey":"comp-order-D","reason":"processing"}]}',
      checkpoint:
        '第一次明确拒绝完成补偿；第二次返回 COMPENSATION_REPLAYED；processing 返回 PAYMENT_RESULT_NOT_FINAL，不能当作失败释放库存；最终订单 CANCELLED、库存 1、Outbox 1，最后一行匹配这三个结果，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 前端页面、状态与可访问交互': {
    title: 'Commerce 项目台 07 · 报价失效与可访问结算步骤',
    description:
      '用请求序号丢弃过期报价，并用同一幂等键阻止双击重复下单；再用可访问步骤状态机处理字段错误、键盘前后移动和移动端摘要。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-stale-quote-guided',
      title: '跟做：数量变化后旧报价不能提交',
      brief:
        '处理购物车数量变化、报价回包和双击提交。旧 quote requestId 必须被忽略，结算按钮只在最新报价下启用，同一幂等键复用同一订单结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let state = {
  lines: input.initialLines,
  quoteRequestId: 0,
  quote: null,
  submitting: false,
  orderByKey: {},
};
const trace = [];

function updateQuantity(sku, quantity) {
  state.lines = state.lines.map((line) =>
    line.sku === sku ? { ...line, quantity } : line);
  state.quote = null;
  state.quoteRequestId += 1;
  trace.push({ action: 'quantity', quoteRequestId: state.quoteRequestId });
}

function receiveQuote(requestId, totalCents) {
  if (requestId !== state.quoteRequestId) {
    trace.push({ action: 'stale-quote', ignored: requestId });
    return;
  }
  state.quote = { requestId, totalCents };
  trace.push({ action: 'quote', accepted: requestId });
}

function submit(idempotencyKey) {
  if (!state.quote) return { status: 409, code: 'QUOTE_REQUIRED' };
  if (state.orderByKey[idempotencyKey]) {
    return { status: 200, code: 'REPLAYED', orderId: state.orderByKey[idempotencyKey] };
  }
  state.submitting = true;
  const orderId = 'order-' + (Object.keys(state.orderByKey).length + 1);
  state.orderByKey[idempotencyKey] = orderId;
  state.submitting = false;
  return { status: 201, code: 'CREATED', orderId };
}

updateQuantity('KB-1', 2);
updateQuantity('KB-1', 3);
receiveQuote(1, 5980);
receiveQuote(2, 8970);
const firstSubmit = submit('checkout-abc');
const doubleSubmit = submit('checkout-abc');

assert.equal(state.quote.totalCents, 8970);
assert.equal(trace[0].ignored, undefined);
assert.equal(trace[2].ignored, 1);
assert.equal(firstSubmit.orderId, doubleSubmit.orderId);
assert.equal(Object.keys(state.orderByKey).length, 1);
console.log(JSON.stringify({ state, trace, firstSubmit, doubleSubmit }, null, 2));
console.log('checkout-state: quote=' + state.quote.totalCents + ' staleIgnored=' +
  trace.filter((item) => item.ignored != null).length + ' orders=' +
  Object.keys(state.orderByKey).length);
`,
      },
      stdin:
        '{"initialLines":[{"sku":"KB-1","quantity":1},{"sku":"PAD-2","quantity":1}]}',
      checkpoint:
        '连续两次数量变化产生 requestId 1 和 2，迟到的 requestId 1 回包被忽略；只接受 8970 分新报价；双击提交返回同一订单，订单数为 1；最后一行 quote=8970 staleIgnored=1 orders=1，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-accessible-checkout-independent',
      title: '独立实践：键盘能走完地址、配送和支付',
      brief:
        '用 CONTACT、DELIVERY、PAYMENT、REVIEW 四步状态机处理前进、后退和提交。必填错误聚焦首个字段，摘要使用可读文本，提交失败保留已填数据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const steps = ['CONTACT', 'DELIVERY', 'PAYMENT', 'REVIEW'];
let state = {
  step: 'CONTACT',
  fields: { email: '', address: '', shipping: '', payment: '' },
  focusField: null,
  submitted: false,
  error: null,
};

function validate(step) {
  if (step === 'CONTACT' && !state.fields.email.includes('@')) {
    return { field: 'email', code: 'EMAIL_REQUIRED' };
  }
  if (step === 'DELIVERY' && state.fields.address.trim() === '') {
    return { field: 'address', code: 'ADDRESS_REQUIRED' };
  }
  if (step === 'PAYMENT' && state.fields.payment === '') {
    return { field: 'payment', code: 'PAYMENT_METHOD_REQUIRED' };
  }
  return null;
}

function command(action) {
  if (action.type === 'input') {
    state.fields[action.field] = action.value;
    return { ok: true, code: 'INPUT_ACCEPTED' };
  }
  if (action.type === 'back') {
    const index = steps.indexOf(state.step);
    state.step = steps[Math.max(0, index - 1)];
    state.focusField = null;
    return { ok: true, code: 'MOVED_BACK' };
  }
  if (action.type === 'next') {
    const invalid = validate(state.step);
    if (invalid) {
      state.focusField = invalid.field;
      return { ok: false, code: invalid.code };
    }
    const index = steps.indexOf(state.step);
    state.step = steps[Math.min(steps.length - 1, index + 1)];
    state.focusField = null;
    return { ok: true, code: 'MOVED_NEXT' };
  }
  if (action.type === 'submit') {
    if (state.step !== 'REVIEW') return { ok: false, code: 'REVIEW_REQUIRED' };
    state.submitted = true;
    return { ok: true, code: 'ORDER_SUBMITTED' };
  }
  return { ok: false, code: 'UNKNOWN_COMMAND' };
}

const results = input.commands.map((action) => ({ label: action.label, ...command(action) }));
assert.deepEqual(results.map((item) => item.code), [
  'EMAIL_REQUIRED',
  'INPUT_ACCEPTED',
  'MOVED_NEXT',
  'ADDRESS_REQUIRED',
  'INPUT_ACCEPTED',
  'MOVED_NEXT',
  'PAYMENT_METHOD_REQUIRED',
  'INPUT_ACCEPTED',
  'INPUT_ACCEPTED',
  'MOVED_NEXT',
  'MOVED_NEXT',
  'ORDER_SUBMITTED',
]);
assert.equal(state.step, 'REVIEW');
assert.equal(state.focusField, null);
assert.equal(state.submitted, true);
console.log(JSON.stringify({
  step: state.step,
  fields: state.fields,
  focusField: state.focusField,
  submitted: state.submitted,
  results,
  summary: '收件人 ' + state.fields.email + '；地址 ' + state.fields.address +
    '；配送 ' + state.fields.shipping + '；支付 ' + state.fields.payment,
}, null, 2));
console.log('accessible-checkout: step=' + state.step + ' validationErrors=' +
  results.filter((item) => !item.ok).length + ' submitted=' + state.submitted);
`,
      },
      stdin:
        '{"commands":[{"type":"next","label":"empty-contact"},{"type":"input","label":"set-email","field":"email","value":"lin@example.test"},{"type":"next","label":"valid-contact"},{"type":"next","label":"empty-address"},{"type":"input","label":"set-address","field":"address","value":"海棠路 18 号"},{"type":"next","label":"valid-delivery"},{"type":"next","label":"empty-payment"},{"type":"input","label":"set-payment","field":"payment","value":"card-token-1"},{"type":"input","label":"set-shipping","field":"shipping","value":"standard"},{"type":"next","label":"valid-payment"},{"type":"next","label":"to-review"},{"type":"submit","label":"submit"}]}',
      checkpoint:
        '三个空字段分别在对应步骤失败并把焦点放到 email、address、payment；补齐后进入 REVIEW，再提交成功；摘要文本包含邮箱、地址、配送和支付；最后一行 step=REVIEW validationErrors=3 submitted=true，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 联调、测试、安全与性能': {
    title: 'Commerce 项目台 08 · 对象授权、敏感字段与热点库存',
    description:
      '同时检查订单归属、角色 capability 和字段脱敏，再模拟串行库存锁下的重复提交与最后库存竞争，统计锁操作并确认没有超卖。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-object-authorization-guided',
      title: '跟做：客服能查单不等于能退款',
      brief:
        '读取五种访问请求，按角色、capability 和订单归属授权；返回给客服的订单视图必须遮盖邮箱与卡号尾号之外的字段，金额只使用服务端订单值。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const capabilities = {
  CUSTOMER: ['order.read.own', 'order.cancel.own'],
  SUPPORT: ['order.read.any', 'order.mask.pii'],
  FINANCE: ['order.read.any', 'refund.write'],
};

function redact(value) {
  return value.replace(/(.{2}).+(@.+)/, '$1***$2')
    .replace(/\d(?=\d{4})/g, '*');
}

function authorize(request, order) {
  const allowedByRole = capabilities[request.role].includes(request.action);
  const ownOnly = request.action.endsWith('.own');
  if (!allowedByRole) return { status: 403, code: 'CAPABILITY_DENIED' };
  if (ownOnly && order.customerId !== request.actorId) {
    return { status: 404, code: 'ORDER_HIDDEN' };
  }
  if (request.role === 'SUPPORT') {
    return {
      status: 200,
      order: {
        id: order.id,
        state: order.state,
        totalCents: order.totalCents,
        email: redact(order.email),
        card: '**** ' + order.card.slice(-4),
      },
    };
  }
  return { status: 200, order };
}

const responses = input.requests.map((request) => ({
  label: request.label,
  ...authorize(request, input.order),
}));
assert.deepEqual(responses.map((item) => item.status), [200, 404, 200, 200, 403]);
assert.equal(responses[2].order.email, 'li***@example.test');
assert.equal(responses[2].order.card, '**** 7788');
assert.equal(responses[3].order.totalCents, input.order.totalCents);
console.log(JSON.stringify({ responses }, null, 2));
console.log('commerce-auth: allowed=' + responses.filter((item) =>
  item.status === 200).length + ' hidden=' + responses.filter((item) =>
  item.status === 404).length + ' denied=' + responses.filter((item) =>
  item.status === 403).length);
`,
      },
      stdin:
        '{"order":{"id":"order-900","customerId":"buyer-7","state":"PAID","totalCents":7470,"email":"lin@example.test","card":"6222020012347788"},"requests":[{"label":"owner-read","role":"CUSTOMER","actorId":"buyer-7","action":"order.read.own"},{"label":"other-read","role":"CUSTOMER","actorId":"buyer-8","action":"order.read.own"},{"label":"support-read","role":"SUPPORT","actorId":"agent-2","action":"order.read.any"},{"label":"finance-read","role":"FINANCE","actorId":"finance-1","action":"order.read.any"},{"label":"support-refund","role":"SUPPORT","actorId":"agent-2","action":"refund.write"}]}',
      checkpoint:
        '响应依次为 200、404、200、200、403；客服视图邮箱为 li***@example.test、卡号为 **** 7788；财务不能伪造金额，仍读取服务端 7470 分；最后一行 allowed=3 hidden=1 denied=1，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-hot-stock-performance-independent',
      title: '独立实践：重复点击不能扩大热点锁等待',
      brief:
        '通过串行库存锁适配器处理固定购买队列。幂等键命中时直接返回已有结果；统计实际锁获取、重放和失败，断言库存不为负且最多卖出可用数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const stock = { available: input.available, version: 20 };
const resultsByKey = new Map();
let lockAcquisitions = 0;
let replayed = 0;
let oversold = 0;
const outcomes = [];

function underLock(callback) {
  lockAcquisitions += 1;
  return callback();
}

function buy(command) {
  return underLock(() => {
    if (resultsByKey.has(command.idempotencyKey)) {
      replayed += 1;
      return {
        ok: true,
        code: 'REPLAYED',
        reservationId: resultsByKey.get(command.idempotencyKey),
      };
    }
    if (stock.available < command.quantity) {
      return { ok: false, code: 'OUT_OF_STOCK', available: stock.available };
    }
    stock.available -= command.quantity;
    stock.version += 1;
    if (stock.available < 0) oversold += 1;
    const reservationId = 'stock-reservation-' + stock.version;
    resultsByKey.set(command.idempotencyKey, reservationId);
    return { ok: true, code: 'RESERVED', reservationId, available: stock.available };
  });
}

for (const command of input.commands) {
  outcomes.push({ key: command.idempotencyKey, ...buy(command) });
}
const reserved = outcomes.filter((item) => item.code === 'RESERVED').length;
const rejected = outcomes.filter((item) => item.code === 'OUT_OF_STOCK').length;
assert.equal(reserved, input.available);
assert.equal(rejected, input.uniqueBuyers - input.available);
assert.equal(replayed, input.duplicateClicks);
assert.equal(stock.available, 0);
assert.equal(oversold, 0);
assert.equal(lockAcquisitions, input.commands.length);
console.log(JSON.stringify({
  stock,
  performance: {
    commands: input.commands.length,
    lockAcquisitions,
    replayed,
    reserved,
    rejected,
    oversold,
  },
  outcomes,
}, null, 2));
console.log('hot-stock: locks=' + lockAcquisitions + ' reserved=' + reserved +
  ' rejected=' + rejected + ' oversold=' + oversold);
`,
      },
      stdin:
        '{"available":5,"uniqueBuyers":8,"duplicateClicks":3,"commands":[{"idempotencyKey":"buy-1","quantity":1},{"idempotencyKey":"buy-2","quantity":1},{"idempotencyKey":"buy-3","quantity":1},{"idempotencyKey":"buy-4","quantity":1},{"idempotencyKey":"buy-5","quantity":1},{"idempotencyKey":"buy-6","quantity":1},{"idempotencyKey":"buy-7","quantity":1},{"idempotencyKey":"buy-8","quantity":1},{"idempotencyKey":"buy-1","quantity":1},{"idempotencyKey":"buy-2","quantity":1},{"idempotencyKey":"buy-3","quantity":1}]}',
      checkpoint:
        '5 个不同买家预占成功，3 个不同买家库存不足，3 次重复点击命中重放；库存最终 0、oversold=0、lockAcquisitions=11；最后一行 reserved=5 rejected=3 oversold=0，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 容器、CI/CD、可观测与发布': {
    title: 'Commerce 项目台 09 · 供应链门禁与金丝雀购买',
    description:
      '先验证测试、依赖与镜像扫描、SBOM、迁移制品和不可变 digest，再用合成购买、错误率、尾延迟与库存对账决定是否扩大流量。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-ci-provenance-guided',
      title: '跟做：可追溯制品不是 latest 标签',
      brief:
        '读取构建清单，校验测试、两种扫描、SBOM、迁移和镜像 digest。失败时输出阻断项并保持 artifact 不可发布，同时检查提交与 digest 绑定标签。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function verify(artifact) {
  const checks = {
    tests: artifact.testReport.passed > 0 && artifact.testReport.failed === 0,
    dependencyScan: artifact.dependencyScan === 'clean',
    imageScan: artifact.imageScan === 'clean',
    sbom: artifact.sbom === 'present',
    migration: artifact.migration === 'commerce-2026-11',
    digest: /^sha256:[a-f0-9]{64}$/.test(artifact.digest),
  };
  const blockers = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  return {
    label: artifact.commit.slice(0, 7) + '-' + artifact.digest.slice(7, 19),
    checks,
    blockers,
    publish: blockers.length === 0 ? 'PUSH_ARTIFACT' : 'STOP_PIPELINE',
  };
}

const result = verify(input.artifact);
assert.equal(result.publish, 'STOP_PIPELINE');
assert.deepEqual(result.blockers, ['imageScan', 'migration']);
assert.equal(result.label, 'c0ffee1-eeeeeeeeeeee');
console.log(JSON.stringify(result, null, 2));
console.log('commerce-ci: publish=' + result.publish + ' blockers=' +
  result.blockers.join(','));
`,
      },
      stdin:
        '{"artifact":{"commit":"c0ffee1abc","digest":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","testReport":{"passed":312,"failed":0},"dependencyScan":"clean","imageScan":"critical-cve","sbom":"present","migration":"commerce-2026-10"}}',
      checkpoint:
        '测试、依赖扫描、SBOM 和 digest 合格；镜像扫描与迁移版本失败，publish 为 STOP_PIPELINE；标签为 c0ffee1-eeeeeeeeeeee；最后一行 blockers=imageScan,migration，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-canary-promotion-independent',
      title: '独立实践：合成购买和对账共同决定扩流',
      brief:
        '读取金丝雀指标、支付成功率和库存/账务对账。错误率、P95 或对账任何一项超线都回滚；全部通过且迁移版本一致才提升到 100%。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [
  {
    id: 'error-rate',
    pass: input.metrics.errorRate <= input.limits.errorRate,
    blocker: 'ERROR_RATE_TOO_HIGH',
  },
  {
    id: 'checkout-p95',
    pass: input.metrics.checkoutP95Ms <= input.limits.checkoutP95Ms,
    blocker: 'CHECKOUT_LATENCY_TOO_HIGH',
  },
  {
    id: 'paid-orders',
    pass: input.synthetic.paidOrders >= input.limits.minimumPaidOrders,
    blocker: 'SYNTHETIC_PURCHASES_INSUFFICIENT',
  },
  {
    id: 'stock-reconciliation',
    pass: input.reconciliation.stockDifference === 0,
    blocker: 'STOCK_RECONCILIATION_FAILED',
  },
  {
    id: 'ledger-reconciliation',
    pass: input.reconciliation.ledgerDifferenceCents === 0,
    blocker: 'LEDGER_RECONCILIATION_FAILED',
  },
  {
    id: 'migration',
    pass: input.deployedMigration === input.expectedMigration,
    blocker: 'MIGRATION_MISMATCH',
  },
];
const blockers = checks.filter((item) => !item.pass).map((item) => item.blocker);
const decision = blockers.length === 0 ? 'PROMOTE_100_PERCENT' : 'ROLLBACK_CANARY';
assert.deepEqual(blockers, ['CHECKOUT_LATENCY_TOO_HIGH', 'STOCK_RECONCILIATION_FAILED']);
assert.equal(decision, 'ROLLBACK_CANARY');
assert.equal(checks.find((item) => item.id === 'paid-orders').pass, true);
console.log(JSON.stringify({ checks, blockers, decision }, null, 2));
console.log('canary: decision=' + decision + ' blockers=' + blockers.join(','));
`,
      },
      stdin:
        '{"limits":{"errorRate":0.01,"checkoutP95Ms":450,"minimumPaidOrders":20},"metrics":{"errorRate":0.004,"checkoutP95Ms":531},"synthetic":{"paidOrders":26},"reconciliation":{"stockDifference":-1,"ledgerDifferenceCents":0},"deployedMigration":"commerce-2026-11","expectedMigration":"commerce-2026-11"}',
      checkpoint:
        '错误率、支付订单数、账务和迁移通过；结算 P95=531 超过 450，库存差异为 -1；decision 必须为 ROLLBACK_CANARY；最后一行含两个 blocker，退出码为 0。',
    },
  },

  'programming:综合训练 · Commerce 模块化电商 · 故障演练、回滚与项目答辩': {
    title: 'Commerce 项目台 10 · 重复消息、对账与兼容回滚',
    description:
      '重放支付与库存事件并按事件 id 去重，核对订单、账本、库存和通知；再检查旧新数据库与消费者兼容性，生成可审计的回滚/答辩结论。',
    ...nodeRuntime,
    practice: {
      id: 'p15-commerce-replay-reconciliation-guided',
      title: '跟做：ACK 不等于业务事实正确',
      brief:
        '读取订单、支付事件、库存事件和通知记录，按 eventId 去重，核对已支付订单数、净扣库存和通知数，列出无法自动修复的差异。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function uniqueByEventId(events) {
  const byId = new Map();
  let duplicates = 0;
  for (const event of events) {
    if (byId.has(event.eventId)) {
      duplicates += 1;
      continue;
    }
    byId.set(event.eventId, event);
  }
  return { events: [...byId.values()], duplicates };
}

const payments = uniqueByEventId(input.paymentEvents);
const inventory = uniqueByEventId(input.inventoryEvents);
const notifications = uniqueByEventId(input.notificationEvents);
const paidOrders = new Set(payments.events
  .filter((event) => event.type === 'payment.paid')
  .map((event) => event.orderId));
const reservedUnits = new Map();
for (const event of inventory.events) {
  if (event.type !== 'stock.reserved') continue;
  reservedUnits.set(event.sku, (reservedUnits.get(event.sku) || 0) + event.quantity);
}

const discrepancies = [];
if (paidOrders.size !== input.expected.paidOrders) discrepancies.push('PAID_ORDER_COUNT');
if ((reservedUnits.get('LAST-1') || 0) !== input.expected.reservedLastStock) {
  discrepancies.push('STOCK_RESERVATION');
}
if (notifications.events.length !== paidOrders.size) discrepancies.push('NOTIFICATION_COUNT');
assert.equal(payments.duplicates, 1);
assert.equal(inventory.duplicates, 1);
assert.equal(notifications.duplicates, 1);
assert.deepEqual(discrepancies, ['STOCK_RESERVATION']);
console.log(JSON.stringify({
  duplicates: {
    payments: payments.duplicates,
    inventory: inventory.duplicates,
    notifications: notifications.duplicates,
  },
  facts: {
    paidOrders: paidOrders.size,
    reservedLastStock: reservedUnits.get('LAST-1') || 0,
    notifications: notifications.events.length,
  },
  discrepancies,
  verdict: discrepancies.length === 0 ? 'CONSISTENT' : 'MANUAL_REPAIR_REQUIRED',
}, null, 2));
console.log('commerce-replay: paid=' + paidOrders.size + ' stock=' +
  (reservedUnits.get('LAST-1') || 0) + ' discrepancy=' + discrepancies.join(','));
`,
      },
      stdin:
        '{"paymentEvents":[{"eventId":"pay-1","type":"payment.paid","orderId":"order-A"},{"eventId":"pay-1","type":"payment.paid","orderId":"order-A"},{"eventId":"pay-2","type":"payment.paid","orderId":"order-B"}],"inventoryEvents":[{"eventId":"stock-1","type":"stock.reserved","sku":"LAST-1","quantity":1},{"eventId":"stock-1","type":"stock.reserved","sku":"LAST-1","quantity":1},{"eventId":"stock-2","type":"stock.released","sku":"LAST-1","quantity":1}],"notificationEvents":[{"eventId":"notify-1"},{"eventId":"notify-1"},{"eventId":"notify-2"}],"expected":{"paidOrders":2,"reservedLastStock":2}}',
      checkpoint:
        '三类事件各去重 1 条；最终两个已支付订单、LAST-1 净预占 1、通知 2 条；仅 STOCK_RESERVATION 差异，verdict 为 MANUAL_REPAIR_REQUIRED；最后一行 paid=2 stock=1 discrepancy=STOCK_RESERVATION，退出码为 0。',
    },
    apply: {
      id: 'p15-commerce-compatible-rollback-defense-independent',
      title: '独立实践：回滚兼容性与事故证据',
      brief:
        '读取数据库新旧字段、应用版本和事故证据。旧版本必须能读新 schema、消费者兼容事件、数据可重建；缺一项就保持 HOLD 并列出阻断证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = {
  oldAppReadsSchema: input.schema.oldAppReadableFields.includes('total_cents'),
  oldConsumerHandlesEvent: input.event.minConsumerVersion <= input.rollback.consumerVersion,
  imageDigestImmutable: /^sha256:[a-f0-9]{64}$/.test(input.rollback.imageDigest),
  reconEvidencePresent: input.evidence.reconciliation?.orders === input.evidence.reconciliation?.ledgerOrders,
  paidOrdersPreserved: input.evidence.ordersAfterRollback >= input.evidence.ordersBefore,
  stockCountPreserved: input.evidence.stockAfter === input.evidence.stockBefore,
};
const blockers = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);
const decision = blockers.length === 0 ? 'ROLLBACK_APPROVED' : 'HOLD';
assert.equal(checks.oldConsumerHandlesEvent, false);
assert.equal(checks.stockCountPreserved, false);
assert.deepEqual(blockers, ['oldConsumerHandlesEvent', 'stockCountPreserved']);
assert.equal(decision, 'HOLD');
console.log(JSON.stringify({
  checks,
  blockers,
  decision,
  defenseSummary: {
    artifact: input.rollback.imageDigest.slice(0, 19),
    incidentMinutes: input.evidence.incidentMinutes,
    ordersBefore: input.evidence.ordersBefore,
    ordersAfter: input.evidence.ordersAfter,
  },
}, null, 2));
console.log('commerce-rollback: decision=' + decision + ' blockers=' +
  blockers.join(',') + ' incident=' + input.evidence.incidentMinutes + 'm');
`,
      },
      stdin:
        '{"schema":{"oldAppReadableFields":["total_cents","paid_at"]},"event":{"minConsumerVersion":3},"rollback":{"consumerVersion":2,"imageDigest":"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"},"evidence":{"reconciliation":{"orders":120,"ledgerOrders":120},"ordersBefore":120,"ordersAfterRollback":120,"stockBefore":4,"stockAfter":5,"incidentMinutes":23}}',
      checkpoint:
        '旧应用可读 schema、镜像 digest 与订单/账本对账通过；旧 consumer v2 不支持事件最低 v3，库存从 4 变 5；decision=HOLD，两个阻断项必须准确出现；最后一行 incident=23m，退出码为 0。',
    },
  },
};
