import type { LearningV2CodeLab } from './v2-types.js';

/**
 * P15 综合训练中 Studio 与 Pulse 的 Node.js 代码实验室。
 *
 * 每门课都对应 project-training-batch-01.ts 的真实阶段课程名。任务只依赖
 * Node.js 标准库，通过确定性内存状态、契约检查、故障注入和断言验证工程判断；
 * 不假装已经启动 Next.js、FastAPI、PostgreSQL、Redis 或真实浏览器。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装 npm 依赖或启动外部服务。',
    '先运行跟做任务，再根据 stdin 中的确定性夹具完成独立实践。',
    '检查 JSON 摘要与 checkpoint；所有云、数据库和浏览器相关结论均由脚本证据推导。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_P15_STUDIO_PULSE: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:综合训练 · Studio 企业官网 · 业务理解与用户任务': {
    title: 'Studio 综合训练 01 · 用户任务卡与咨询漏斗',
    description:
      '把访谈材料变成可验收的用户任务卡，再从匿名访问事件中定位咨询漏斗的真实掉点。输出是可复算的任务覆盖率和会话证据，不是角色画像。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-01-guided-task-cards',
      title: '跟做：把四类访谈整理成任务卡',
      brief:
        '运行 node main.js。读取四类用户的访谈片段，检查目标、触发事件、成功信号和证据是否齐全，按缺口数量排序后打印任务卡。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const required = ['goal', 'trigger', 'successSignal', 'evidence'];
const cards = input.interviews.map((item) => {
  const missing = required.filter((key) => {
    const value = item[key];
    return Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
  });
  const coverage = Math.round(((required.length - missing.length) / required.length) * 100);
  return {
    actor: item.actor,
    task: item.goal,
    trigger: item.trigger,
    successSignal: item.successSignal,
    evidenceCount: Array.isArray(item.evidence) ? item.evidence.length : 0,
    coverage,
    missing,
    status: missing.length === 0 ? 'ready' : 'needs-evidence'
  };
}).sort((left, right) => left.coverage - right.coverage || left.actor.localeCompare(right.actor));

assert.equal(cards.length, 4, 'Studio 必须覆盖外部访客、内容编辑、品牌负责人和移动访客');
assert.equal(cards.filter((card) => card.status === 'ready').length, 3);
assert.ok(cards.some((card) => card.missing.includes('evidence')), '必须暴露缺失证据的任务');
assert.ok(cards.every((card) => card.actor && card.task && card.trigger));

console.log(JSON.stringify({
  cards,
  ready: cards.filter((card) => card.status === 'ready').length,
  evidenceGaps: cards.filter((card) => card.missing.length > 0).length
}, null, 2));
console.log('studio-task-review: ready=3 needs-evidence=1');
`,
      },
      stdin: JSON.stringify({
        interviews: [
          {
            actor: '潜在客户',
            goal: '在 30 秒内判断工作室做过同行业项目',
            trigger: '从搜索落地到案例页',
            successSignal: '打开同行业案例并提交咨询',
            evidence: ['行业标签', '项目结果', '匿名漏斗事件'],
          },
          {
            actor: '内容编辑',
            goal: '不改组件发布一条新案例',
            trigger: '客户批准公开案例文案',
            successSignal: '预览通过后内容进入已发布状态',
            evidence: ['内容校验日志', '预览截图'],
          },
          {
            actor: '品牌负责人',
            goal: '确认服务差异与报价入口清楚',
            trigger: '首页评审会',
            successSignal: '五秒复述目标客户和主服务',
            evidence: ['评审记录'],
          },
          {
            actor: '移动访客',
            goal: '用触屏和键盘完成咨询表单',
            trigger: '窄屏打开联系页',
            successSignal: '错误可读且重试后成功提交',
            evidence: [],
          },
        ],
      }),
      checkpoint:
        '输出 cards 中恰有 3 张 ready、1 张 needs-evidence，且缺失项包含 evidence；最后一行必须是 studio-task-review: ready=3 needs-evidence=1，退出码为 0。若把角色画像当成任务或因缺少证据仍判 ready，应判失败。',
    },
    apply: {
      id: 'p15-studio-01-independent-funnel',
      title: '独立实践：从事件序列定位咨询掉点',
      brief:
        '运行 node main.js。分析六次匿名会话，找出案例到咨询的主要掉点、失败后未恢复的会话，以及需要优先回看录屏的路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const order = ['home', 'services', 'cases', 'case-detail', 'contact', 'submit'];

function furthestStep(events) {
  return events.reduce((furthest, event) => {
    const index = order.indexOf(event);
    return Math.max(furthest, index);
  }, -1);
}

const sessions = input.sessions.map((session) => {
  const reached = furthestStep(session.events);
  const failed = session.events.includes('submit-error');
  const recovered = failed && session.events.slice(session.events.indexOf('submit-error') + 1).includes('submit');
  return {
    id: session.id,
    reached: order[reached],
    reachedCase: session.events.includes('case-detail'),
    failed,
    recovered,
    outcome: recovered ? 'recovered' : session.events.includes('submit') ? 'converted' : 'dropped'
  };
});

const caseToContact = sessions.filter((item) => item.reachedCase);
const droppedAfterCase = caseToContact.filter((item) => item.outcome === 'dropped');
const unrecoveredFailures = sessions.filter((item) => item.failed && !item.recovered);
const dropRate = Math.round((droppedAfterCase.length / caseToContact.length) * 100);

assert.equal(sessions.length, 6);
assert.equal(unrecoveredFailures.length, 1);
assert.equal(dropRate, 50);
assert.ok(sessions.every((item) => ['converted', 'dropped', 'recovered'].includes(item.outcome)));

console.log(JSON.stringify({
  sessions,
  caseToContact: caseToContact.length,
  droppedAfterCase: droppedAfterCase.length,
  dropRate: dropRate + '%',
  unrecoveredFailures: unrecoveredFailures.map((item) => item.id),
  reviewPriority: [...new Set(
    unrecoveredFailures.map((item) => item.id).concat(droppedAfterCase.map((item) => item.id))
  )]
}, null, 2));
console.log('funnel-alert: case-to-contact-drop=50% unrecovered=1');
`,
      },
      stdin: JSON.stringify({
        sessions: [
          { id: 's-101', events: ['home', 'services', 'cases', 'case-detail', 'contact', 'submit'] },
          { id: 's-102', events: ['home', 'cases', 'case-detail', 'back', 'services'] },
          { id: 's-103', events: ['home', 'cases', 'case-detail', 'contact', 'submit-error'] },
          { id: 's-104', events: ['cases', 'case-detail', 'contact', 'submit-error', 'submit'] },
          { id: 's-105', events: ['home', 'services', 'contact', 'submit'] },
          { id: 's-106', events: ['home', 'services', 'contact'] },
        ],
      }),
      checkpoint:
        '必须有 4 个会话到达案例详情，其中 2 个在之后掉点；另有 1 次未恢复失败，掉点率 50%，并提示 s-102、s-103 优先回看。最后一行包含 case-to-contact-drop=50% unrecovered=1。退出码为 0，且不能把已恢复的 s-104 误报成未恢复。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 范围、验收与非功能目标': {
    title: 'Studio 综合训练 02 · 范围冻结与验收门禁',
    description:
      '先把页面、案例和非目标冻结成可计算的范围，再把 LCP、CLS、移动宽度、键盘流程和错误恢复写成能拦截发布的验收门禁。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-02-guided-scope',
      title: '跟做：检查 MVP 范围是否自相矛盾',
      brief:
        '运行 node main.js。校验五个页面、三条案例、非目标清单与性能预算，检测同一能力是否同时被列为必做和非目标。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const mustPages = input.scope.filter((item) => item.kind === 'page' && item.priority === 'must');
const mustCases = input.scope.filter((item) => item.kind === 'case' && item.priority === 'must');
const mustKeys = new Set(mustPages.concat(mustCases).map((item) => item.key));
const overlap = input.nonGoals.filter((item) => mustKeys.has(item.key));
const deferred = input.scope.filter((item) => item.priority === 'later');

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

const lcpP75 = percentile(input.samples.lcpMs, 0.75);
const clsP75 = percentile(input.samples.cls, 0.75);
const checks = [
  { name: 'pages', actual: mustPages.length, expected: 5, pass: mustPages.length === 5 },
  { name: 'cases', actual: mustCases.length, expected: 3, pass: mustCases.length === 3 },
  { name: 'scope-overlap', actual: overlap.length, expected: 0, pass: overlap.length === 0 },
  { name: 'lcp-p75', actual: lcpP75, limit: 2500, pass: lcpP75 < 2500 },
  { name: 'cls-p75', actual: clsP75, limit: 0.1, pass: clsP75 < 0.1 }
];

assert.deepEqual(overlap, []);
assert.ok(deferred.length >= 2, '必须明确推迟项而不是把全部能力塞进首版');
assert.ok(checks.every((check) => check.pass));

console.log(JSON.stringify({
  frozenPages: mustPages.map((item) => item.key),
  frozenCases: mustCases.map((item) => item.key),
  deferred: deferred.map((item) => item.key),
  nonGoals: input.nonGoals.map((item) => item.key),
  checks
}, null, 2));
console.log('studio-scope: pages=5 cases=3 overlap=0 gate=pass');
`,
      },
      stdin: JSON.stringify({
        scope: [
          { key: '/', kind: 'page', priority: 'must' },
          { key: '/services', kind: 'page', priority: 'must' },
          { key: '/work', kind: 'page', priority: 'must' },
          { key: '/about', kind: 'page', priority: 'must' },
          { key: '/contact', kind: 'page', priority: 'must' },
          { key: 'case-manufacturing', kind: 'case', priority: 'must' },
          { key: 'case-retail', kind: 'case', priority: 'must' },
          { key: 'case-health', kind: 'case', priority: 'must' },
          { key: 'case-filter', kind: 'feature', priority: 'later' },
          { key: 'online-payment', kind: 'feature', priority: 'later' }
        ],
        nonGoals: [{ key: 'crm' }, { key: 'client-login' }],
        samples: { lcpMs: [1800, 2100, 2400, 3200], cls: [0.02, 0.04, 0.08, 0.16] }
      }),
      checkpoint:
        '必须显示冻结 5 个页面、3 条案例、2 个推迟项，scope-overlap=0；P75 计算取排序后的第 3 个样本，LCP 为 2400ms、CLS 为 0.08 时门禁通过。最后一行包含 studio-scope: pages=5 cases=3 overlap=0 gate=pass。',
    },
    apply: {
      id: 'p15-studio-02-independent-acceptance',
      title: '独立实践：用证据矩阵拦截不合格发布',
      brief:
        '运行 node main.js。校验键盘、320px、表单失败恢复、axe、LCP 和内容过期六类证据；任何证据缺失或失败都必须给出版本阻断原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = [
  'keyboard-consult',
  'mobile-320',
  'form-failure-recovery',
  'axe-serious',
  'lcp-p75',
  'stale-content'
];

const evidence = new Map(input.evidence.map((item) => [item.id, item]));
const results = required.map((id) => {
  const item = evidence.get(id);
  if (!item) return { id, status: 'missing', blocker: '没有可复现证据' };
  const pass = item.value !== null && item.value !== undefined && item.pass === true;
  return {
    id,
    status: pass ? 'pass' : 'fail',
    observed: item.value,
    blocker: pass ? null : item.reason || '验收未通过'
  };
});

const blockers = results.filter((item) => item.status !== 'pass');
const releaseVerdict = blockers.length === 0 ? 'ship' : 'block';
const blockedAreas = [...new Set(blockers.map((item) => item.id))];

assert.equal(releaseVerdict, 'block');
assert.ok(blockedAreas.includes('mobile-320'));
assert.ok(blockedAreas.includes('form-failure-recovery'));
assert.equal(results.find((item) => item.id === 'lcp-p75').status, 'pass');

console.log(JSON.stringify({
  evaluated: results,
  releaseVerdict,
  blockedAreas,
  nextAction: [
    '修复 320px 导航遮挡后重跑移动矩阵',
    '注入联系接口 503 并验证已填内容保留',
    '两项全过后重新计算完整发布门禁'
  ]
}, null, 2));
console.log('studio-release: block blockers=mobile-320,form-failure-recovery');
`,
      },
      stdin: JSON.stringify({
        evidence: [
          { id: 'keyboard-consult', pass: true, value: 'Tab 14 次完成提交' },
          { id: 'mobile-320', pass: false, value: '导航高 120px 遮挡首屏 CTA', reason: '320px 首屏主按钮不可见' },
          { id: 'form-failure-recovery', pass: false, value: '503 后字段被清空', reason: '失败后未保留用户输入' },
          { id: 'axe-serious', pass: true, value: 0 },
          { id: 'lcp-p75', pass: true, value: 2380 },
          { id: 'stale-content', pass: true, value: '过期案例显示更新时间与回退入口' }
        ]
      }),
      checkpoint:
        '发布结论必须为 block，阻断项精确包含 mobile-320 和 form-failure-recovery，LCP 证据仍为 pass；最后一行包含 studio-release: block。脚本应把“缺证据”和“证据失败”都当作阻断，而不是只看页面是否能打开。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · API 契约与前端数据边界': {
    title: 'Studio 综合训练 03 · 联系表单与内容 API 契约',
    description:
      '先实现稳定错误结构验证联系提交，再用契约差异检查阻止破坏内容接口的字段删除、类型变化和分页游标变更。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-03-guided-contact-contract',
      title: '跟做：验证联系提交的请求与错误契约',
      brief:
        '运行 node main.js。逐条验证姓名、邮箱、消息、同意项和禁止字段，返回稳定的 success/error 结构，并确保前端能按 code 渲染字段错误。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const allowedKeys = new Set(['name', 'email', 'message', 'consent', 'company', 'requestId']);
function validate(body) {
  const fields = {};
  if (typeof body.name !== 'string' || body.name.trim().length < 2) fields.name = '姓名至少 2 个字符';
  if (typeof body.email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(body.email)) fields.email = '邮箱格式不正确';
  if (typeof body.message !== 'string' || body.message.trim().length < 10) fields.message = '咨询内容至少 10 个字符';
  if (body.consent !== true) fields.consent = '必须同意隐私说明';
  const unknown = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknown.length) fields.$unknown = unknown.join(',');
  const codes = Object.keys(fields);
  return codes.length === 0
    ? { ok: true, requestId: body.requestId, status: 202 }
    : { ok: false, status: 422, error: { code: 'CONTACT_VALIDATION_FAILED', fields, codes } };
}

const responses = input.requests.map((request) => ({
  caseId: request.caseId,
  response: validate(request.body)
}));
const accepted = responses.filter((item) => item.response.ok).length;
const rejected = responses.length - accepted;

assert.equal(responses.length, 4);
assert.equal(accepted, 1);
assert.equal(rejected, 3);
assert.deepEqual(responses[1].response.error.codes.sort(), ['email', 'message']);
assert.equal(responses[2].response.error.code, 'CONTACT_VALIDATION_FAILED');
assert.ok(responses[3].response.error.fields.$unknown.includes('role'));

console.log(JSON.stringify({ accepted, rejected, responses }, null, 2));
console.log('studio-contact-contract: 202=1 422=3 stable-error=pass');
`,
      },
      stdin: JSON.stringify({
        requests: [
          {
            caseId: 'valid',
            body: { name: '林青', email: 'lin@example.com', message: '需要重做企业官网并支持案例更新。', consent: true, requestId: 'req-1' }
          },
          {
            caseId: 'invalid-fields',
            body: { name: '林青', email: 'lin@example', message: '太短', consent: true, requestId: 'req-2' }
          },
          {
            caseId: 'missing-consent',
            body: { name: '周岚', email: 'zhou@example.com', message: '希望了解品牌站改版计划和预算。', consent: false, requestId: 'req-3' }
          },
          {
            caseId: 'unknown-key',
            body: { name: '陈禾', email: 'chen@example.com', message: '请评估官网信息架构和内容迁移。', consent: true, role: 'admin', requestId: 'req-4' }
          }
        ]
      }),
      checkpoint:
        '必须输出 1 个 202、3 个 422；invalid-fields 同时指出 email 与 message，missing-consent 指向 consent，unknown-key 明确拒绝 role。最后一行包含 202=1 422=3 stable-error=pass，退出码为 0。',
    },
    apply: {
      id: 'p15-studio-03-independent-contract-diff',
      title: '独立实践：判断内容 API 版本是否兼容',
      brief:
        '运行 node main.js。比较两版内容接口的字段类型、必填性、枚举和分页游标规则，输出是否可原地发布及有序迁移步骤。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function inspectResource(resource) {
  const issues = [];
  for (const [name, oldField] of Object.entries(resource.oldSchema)) {
    const newField = resource.newSchema[name];
    if (!newField) {
      issues.push({ kind: 'removed', field: name });
      continue;
    }
    if (oldField.type !== newField.type) {
      issues.push({ kind: 'type-changed', field: name, from: oldField.type, to: newField.type });
    }
    if (newField.required === true && oldField.required !== true) {
      issues.push({ kind: 'newly-required', field: name });
    }
    if (oldField.enum && newField.enum) {
      const removedValues = oldField.enum.filter((value) => !newField.enum.includes(value));
      if (removedValues.length) issues.push({ kind: 'enum-narrowed', field: name, removedValues });
    }
  }
  for (const name of Object.keys(resource.newSchema)) {
    if (!(name in resource.oldSchema)) {
      issues.push({ kind: 'added', field: name, tolerated: resource.newSchema[name].required !== true });
    }
  }
  if (resource.oldCursor !== resource.newCursor) {
    issues.push({ kind: 'cursor-semantics-changed', from: resource.oldCursor, to: resource.newCursor });
  }
  const breaking = issues.filter((issue) =>
    ['removed', 'type-changed', 'newly-required', 'enum-narrowed', 'cursor-semantics-changed'].includes(issue.kind)
  );
  return { resource: resource.name, issues, breaking, verdict: breaking.length ? 'versioned-migration' : 'compatible' };
}

const results = input.resources.map(inspectResource);
assert.equal(results[0].verdict, 'versioned-migration');
assert.ok(results[0].breaking.some((issue) => issue.kind === 'removed' && issue.field === 'coverUrl'));
assert.ok(results[0].breaking.some((issue) => issue.kind === 'cursor-semantics-changed'));
assert.equal(results[1].verdict, 'compatible');
assert.equal(results[1].breaking.length, 0);

console.log(JSON.stringify({
  results,
  rollout: [
    '先新增 summary 字段并保持旧客户端可读',
    '案例查询同时返回 offset 与 cursor 两套游标直到客户端升级',
    '完成流量观察后再删除 coverUrl',
    '回滚时保留新字段读路径，不恢复已删除数据'
  ]
}, null, 2));
console.log('studio-api-diff: cases=versioned-migration services=compatible');
`,
      },
      stdin: JSON.stringify({
        resources: [
          {
            name: 'cases',
            oldSchema: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true },
              coverUrl: { type: 'string', required: false },
              status: { type: 'string', enum: ['draft', 'published'] }
            },
            newSchema: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true },
              summary: { type: 'string', required: true },
              status: { type: 'string', enum: ['published'] }
            },
            oldCursor: 'offset',
            newCursor: 'keyset'
          },
          {
            name: 'services',
            oldSchema: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true }
            },
            newSchema: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true },
              audience: { type: 'string', required: false }
            },
            oldCursor: 'offset',
            newCursor: 'offset'
          }
        ]
      }),
      checkpoint:
        'cases 必须判为 versioned-migration，并指出 coverUrl 删除、summary 新增必填、状态枚举收窄和游标语义变化；services 必须 compatible。最后一行包含 cases=versioned-migration services=compatible，且迁移步骤保留旧客户端兼容窗口。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 数据模型、约束与迁移': {
    title: 'Studio 综合训练 04 · 内容约束与兼容迁移',
    description:
      '用内存表落实页面、案例和咨询提交的真实不变量，再演练从旧内容对象迁移到规范化表，保留可回滚快照并验证幂等。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-04-guided-invariants',
      title: '跟做：让数据库约束在内存模型中作证',
      brief:
        '运行 node main.js。插入页面、案例和联系提交，故意制造重复 slug、无正文发布和缺行业案例，确认每次违规都在写入前被拒绝。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createStore() {
  const pages = [];
  const cases = [];
  const submissions = [];
  const slugs = new Set();
  return {
    insertPage(row) {
      if (slugs.has(row.slug)) throw new Error('UNIQUE_PAGE_SLUG');
      if (row.status === 'published' && !row.body.trim()) throw new Error('PUBLISHED_PAGE_REQUIRES_BODY');
      slugs.add(row.slug);
      pages.push({ ...row });
    },
    insertCase(row) {
      if (!row.industry) throw new Error('CASE_REQUIRES_INDUSTRY');
      if (cases.some((item) => item.slug === row.slug)) throw new Error('UNIQUE_CASE_SLUG');
      cases.push({ ...row });
    },
    insertSubmission(row, now) {
      if (!row.email.includes('@')) throw new Error('INVALID_CONTACT_EMAIL');
      const duplicate = submissions.some((item) =>
        item.requestId === row.requestId && now - item.createdAt < 24 * 60 * 60 * 1000
      );
      if (duplicate) return { inserted: false, reason: 'IDEMPOTENT_REPLAY' };
      submissions.push({ ...row, createdAt: now });
      return { inserted: true };
    },
    snapshot() {
      return { pages: structuredClone(pages), cases: structuredClone(cases), submissions: structuredClone(submissions) };
    }
  };
}

const errors = [];
const store = createStore();
function attempt(name, operation) {
  try {
    operation();
  } catch (error) {
    errors.push({ name, code: error.message });
  }
}

store.insertPage(input.page);
attempt('duplicate-slug', () => store.insertPage({ ...input.page, title: '重复页面' }));
attempt('published-empty-body', () => store.insertPage({ slug: '/empty', title: '空页', status: 'published', body: '  ' }));
store.insertCase(input.case);
attempt('case-no-industry', () => store.insertCase({ slug: 'case-unknown', title: '未知行业', result: '不可验证' }));
assert.equal(store.insertSubmission(input.submission, input.now).inserted, true);
assert.equal(store.insertSubmission(input.submission, input.now + 1000).reason, 'IDEMPOTENT_REPLAY');

const snapshot = store.snapshot();
assert.equal(errors.length, 3);
assert.equal(snapshot.pages.length, 1);
assert.equal(snapshot.cases.length, 1);
assert.equal(snapshot.submissions.length, 1);

console.log(JSON.stringify({ errors, snapshot }, null, 2));
console.log('studio-model: rejected=3 pages=1 cases=1 submissions=1 idempotent=true');
`,
      },
      stdin: JSON.stringify({
        page: { slug: '/', title: 'Studio', status: 'published', body: '为产品团队设计可信数字体验。' },
        case: { slug: 'case-manufacturing', title: '制造企业数字展厅', industry: '工业制造', result: '询盘转化提升 18%' },
        submission: { requestId: 'req-studio-1', email: 'lin@example.com', message: '需要重做企业官网。' },
        now: 1760000000000
      }),
      checkpoint:
        '必须捕获 UNIQUE_PAGE_SLUG、PUBLISHED_PAGE_REQUIRES_BODY、CASE_REQUIRES_INDUSTRY 三次拒绝；重放同一 requestId 只写入一次。最后一行包含 rejected=3 pages=1 cases=1 submissions=1 idempotent=true。',
    },
    apply: {
      id: 'p15-studio-04-independent-migration',
      title: '独立实践：迁移旧内容对象并可回滚',
      brief:
        '运行 node main.js。把扁平内容对象按 type 分拆到 pages 与 cases，校验必填约束、记录跳过项、验证第二次迁移不重复写入，并保留回滚快照。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const legacySnapshot = structuredClone(input.legacyRows);

function migrate(rows, target) {
  const skipped = [];
  for (const row of rows) {
    if (target.attempted.has(row.id)) continue;
    target.attempted.add(row.id);
    if (target.seen.has(row.id)) continue;
    if (row.type === 'page') {
      if (!row.slug || !row.title || (row.published && !row.body)) {
        skipped.push({ id: row.id, reason: 'INVALID_PAGE' });
        continue;
      }
      target.pages.push({ id: row.id, slug: row.slug, title: row.title, body: row.body || '', published: !!row.published });
    } else if (row.type === 'case') {
      if (!row.slug || !row.title || !row.industry) {
        skipped.push({ id: row.id, reason: 'INVALID_CASE' });
        continue;
      }
      target.cases.push({ id: row.id, slug: row.slug, title: row.title, industry: row.industry });
    } else {
      skipped.push({ id: row.id, reason: 'UNKNOWN_TYPE' });
      continue;
    }
    target.seen.add(row.id);
  }
  return skipped;
}

const target = { pages: [], cases: [], seen: new Set(), attempted: new Set() };
const firstSkipped = migrate(input.legacyRows, target);
const countsAfterFirst = { pages: target.pages.length, cases: target.cases.length };
const secondSkipped = migrate(input.legacyRows, target);

assert.deepEqual(secondSkipped, []);
assert.deepEqual({ pages: target.pages.length, cases: target.cases.length }, countsAfterFirst);
assert.equal(firstSkipped.length, 3);
assert.ok(firstSkipped.some((item) => item.reason === 'INVALID_CASE'));
assert.ok(firstSkipped.some((item) => item.reason === 'UNKNOWN_TYPE'));
assert.deepEqual(input.legacyRows, legacySnapshot, '迁移不能原地修改旧表快照');

console.log(JSON.stringify({
  migrated: countsAfterFirst,
  skipped: firstSkipped,
  secondRunDuplicates: 0,
  rollback: {
    method: '在事务内保留旧 content 表，双读验证 24 小时后才切换写路径',
    legacyRows: legacySnapshot.length
  }
}, null, 2));
console.log('studio-migration: pages=2 cases=2 skipped=3 idempotent=true');
`,
      },
      stdin: JSON.stringify({
        legacyRows: [
          { id: 'c-1', type: 'page', slug: '/', title: 'Studio', body: '首页正文', published: true },
          { id: 'c-2', type: 'page', slug: '/about', title: '关于', body: '', published: false },
          { id: 'c-3', type: 'case', slug: 'case-retail', title: '零售案例', industry: '零售' },
          { id: 'c-4', type: 'case', slug: 'case-invalid', title: '缺行业案例' },
          { id: 'c-5', type: 'page', slug: '/broken', title: '已发布空页', body: '', published: true },
          { id: 'c-6', type: 'legacy-nav', title: '旧导航' }
        ]
      }),
      checkpoint:
        '必须迁移 2 个页面和 2 条案例，跳过 1 个缺行业案例、1 个已发布空页与 1 个未知类型；第二次运行新增 0 条。最后一行包含 pages=2 cases=2 skipped=3 idempotent=true，并输出保留旧表双读的回滚方案。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 项目骨架、模块边界与本地环境': {
    title: 'Studio 综合训练 05 · 模块依赖与本地环境医生',
    description:
      '用静态清单检查内容、页面、表单和发布脚本的依赖方向，再运行确定性环境医生发现缺脚本、端口冲突和不可复现入口。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-05-guided-boundaries',
      title: '跟做：阻止页面层直接访问数据库',
      brief:
        '运行 node main.js。检查七个模块和依赖边，只允许页面依赖内容服务、表单服务和共享类型，并识别越级依赖与环。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const layer = new Map(input.modules.map((item) => [item.id, item.layer]));
const allowed = new Set([
  'page->content-service',
  'page->form-service',
  'page->shared',
  'content-service->shared',
  'form-service->shared',
  'form-service->content-service'
]);
const edges = input.edges.map((edge) => \`\${edge.from}->\${edge.to}\`);
const violations = edges
  .filter((edge) => !allowed.has(edge))
  .map((edge) => ({ edge, reason: 'forbidden dependency direction' }));

function findCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function walk(node, stack) {
    if (visiting.has(node)) {
      cycles.push(stack.slice(stack.indexOf(node)).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of graph.get(node) || []) walk(next, stack.concat(next));
    visiting.delete(node);
    visited.add(node);
  }
  for (const module of input.modules) walk(module.id, [module.id]);
  return cycles;
}

const graph = new Map(input.modules.map((item) => [item.id, []]));
for (const edge of input.edges) {
  if (allowed.has(\`\${edge.from}->\${edge.to}\`)) graph.get(edge.from).push(edge.to);
}
const cycles = findCycles(graph);

assert.ok(violations.some((item) => item.edge === 'page->database'));
assert.ok(violations.some((item) => item.edge === 'shared->page'));
assert.equal(cycles.length, 0);
assert.ok(input.modules.every((item) => layer.has(item.id)));

console.log(JSON.stringify({
  layers: Object.fromEntries(layer),
  violations,
  cycles,
  verdict: violations.length === 0 && cycles.length === 0 ? 'pass' : 'fix-boundaries'
}, null, 2));
console.log('studio-boundaries: violations=2 cycles=0 verdict=fix-boundaries');
`,
      },
      stdin: JSON.stringify({
        modules: [
          { id: 'page', layer: 'ui' },
          { id: 'content-service', layer: 'application' },
          { id: 'form-service', layer: 'application' },
          { id: 'database', layer: 'infrastructure' },
          { id: 'shared', layer: 'domain' },
          { id: 'content-schema', layer: 'domain' },
          { id: 'release-script', layer: 'tooling' }
        ],
        edges: [
          { from: 'page', to: 'content-service' },
          { from: 'page', to: 'form-service' },
          { from: 'page', to: 'shared' },
          { from: 'content-service', to: 'shared' },
          { from: 'form-service', to: 'shared' },
          { from: 'form-service', to: 'content-service' },
          { from: 'page', to: 'database' },
          { from: 'shared', to: 'page' }
        ]
      }),
      checkpoint:
        '必须识别 page->database 与 shared->page 两条越级边，cycles 为空，结论为 fix-boundaries；最后一行包含 violations=2 cycles=0 verdict=fix-boundaries。判断依据来自允许边清单，而不是模块名字看起来像什么。',
    },
    apply: {
      id: 'p15-studio-05-independent-doctor',
      title: '独立实践：让新同学一条命令发现环境问题',
      brief:
        '运行 node main.js。核对必需文件、npm scripts、Node 主版本和端口占用，输出可直接执行的修复动作；本项目故意缺少内容校验脚本且端口冲突。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requiredFiles = [
  'package.json',
  'src/main.ts',
  'src/content/schema.ts',
  'src/features/contact.ts',
  'public/',
  'tests/accessibility.spec.ts'
];
const requiredScripts = ['dev', 'build', 'test', 'content:validate'];
const issues = [];

for (const file of requiredFiles) {
  if (!input.files.includes(file)) {
    issues.push({ area: 'files', code: 'MISSING_FILE', target: file, fix: \`创建 \${file} 或修正仓库入口\` });
  }
}
for (const script of requiredScripts) {
  if (!input.scripts[script]) {
    issues.push({ area: 'scripts', code: 'MISSING_SCRIPT', target: script, fix: \`在 package.json 增加 \${script}\` });
  }
}
for (const port of input.requiredPorts) {
  const owner = input.busyPorts.find((item) => item.port === port);
  if (owner) {
    issues.push({
      area: 'ports',
      code: 'PORT_CONFLICT',
      target: port,
      fix: \`先停止 PID \${owner.pid}，或通过环境变量改用 \${port + 1}\`
    });
  }
}
if (input.nodeMajor < 22) {
  issues.push({ area: 'runtime', code: 'NODE_TOO_OLD', target: input.nodeMajor, fix: '切换到 Node.js 22 或更新版本' });
}

assert.equal(issues.length, 2);
assert.ok(issues.some((item) => item.code === 'MISSING_SCRIPT' && item.target === 'content:validate'));
assert.ok(issues.some((item) => item.code === 'PORT_CONFLICT' && item.target === 3001));
assert.ok(issues.every((item) => item.fix.length > 4));

console.log(JSON.stringify({
  ready: issues.length === 0,
  checks: requiredFiles.length + requiredScripts.length + input.requiredPorts.length + 1,
  issues
}, null, 2));
console.log('studio-doctor: issues=2 ready=false next=fix-content-script-and-port');
`,
      },
      stdin: JSON.stringify({
        files: [
          'package.json',
          'src/main.ts',
          'src/content/schema.ts',
          'src/features/contact.ts',
          'public/',
          'tests/accessibility.spec.ts'
        ],
        scripts: { dev: 'vite', build: 'tsc -b && vite build', test: 'playwright test' },
        nodeMajor: 24,
        requiredPorts: [5173, 3001],
        busyPorts: [{ port: 3001, pid: 8420 }]
      }),
      checkpoint:
        '必须报告且只报告 2 个问题：缺少 content:validate、3001 被 PID 8420 占用；ready=false，并给出可执行修复动作。最后一行包含 issues=2 ready=false next=fix-content-script-and-port，不能仅输出“环境正常”。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 后端核心链路与异常恢复': {
    title: 'Studio 综合训练 06 · 联系提交的幂等与失败恢复',
    description:
      '用内存服务验证校验、限流、幂等写入和 outbox，再注入第一次存储失败，证明重试不会重复提交且失败请求有明确处置。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-06-guided-contact-service',
      title: '跟做：一次请求只产生一个咨询记录',
      brief:
        '运行 node main.js。处理正常提交、同 requestId 重放、不同请求连续超限和非法邮箱，输出状态码、记录数与限流证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const records = [];
const idempotency = new Map();
const rate = new Map();

function handle(request, now) {
  const windowStart = now - 60_000;
  const recent = (rate.get(request.ip) || []).filter((time) => time > windowStart);
  if (recent.length >= 2) {
    rate.set(request.ip, recent);
    return { status: 429, code: 'RATE_LIMITED', retryAfter: 60 };
  }
  if (!request.body.email.includes('@')) {
    rate.set(request.ip, recent.concat(now));
    return { status: 422, code: 'INVALID_EMAIL' };
  }
  if (idempotency.has(request.body.requestId)) {
    rate.set(request.ip, recent.concat(now));
    return { status: 200, code: 'IDEMPOTENT_REPLAY', id: idempotency.get(request.body.requestId) };
  }
  const record = { id: 'sub-' + (records.length + 1), ...request.body };
  records.push(record);
  idempotency.set(record.requestId, record.id);
  rate.set(request.ip, recent.concat(now));
  return { status: 202, code: 'ACCEPTED', id: record.id };
}

const responses = input.requests.map((request) => handle(request, request.now));
assert.deepEqual(responses.map((item) => item.status), [202, 200, 429, 422]);
assert.equal(records.length, 1, '重放、限流与非法邮箱都不能新增记录');
assert.equal(new Set(records.map((item) => item.requestId)).size, records.length);
assert.equal(responses[1].id, responses[0].id);

console.log(JSON.stringify({ responses, storedRecords: records }, null, 2));
console.log('studio-contact-service: accepted=1 replay=1 limited=1 invalid=1 records=1');
`,
      },
      stdin: JSON.stringify({
        requests: [
          { ip: '203.0.113.8', now: 1760000000000, body: { requestId: 'req-a', email: 'lin@example.com', message: '官网改版咨询' } },
          { ip: '203.0.113.8', now: 1760000001000, body: { requestId: 'req-a', email: 'lin@example.com', message: '官网改版咨询' } },
          { ip: '203.0.113.8', now: 1760000002000, body: { requestId: 'req-c', email: 'zhao@example.com', message: '案例站咨询' } },
          { ip: '203.0.113.10', now: 1760000003000, body: { requestId: 'req-d', email: 'oops', message: '非法邮箱' } }
        ]
      }),
      checkpoint:
        '状态序列必须为 202、200、429、422，最终只存 1 条记录；重放返回首个记录 id，第三个正常邮箱因限流不落库，第四个非法邮箱不落库。最后一行包含 accepted=1 replay=1 limited=1 invalid=1 records=1。',
    },
    apply: {
      id: 'p15-studio-06-independent-outbox-retry',
      title: '独立实践：存储失败后仍保证最终一致',
      brief:
        '运行 node main.js。第一次事务提交抛出故障，服务保留请求并写入 outbox；第二次重试完成业务写入，校验失败请求不会进入死信。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createService(failures) {
  let submissions = [];
  let outbox = [];
  let attempts = 0;
  return {
    submit(body) {
      attempts += 1;
      const snapshot = { submissions: structuredClone(submissions), outbox: structuredClone(outbox) };
      try {
        if (failures > 0) {
          failures -= 1;
          throw new Error('STORAGE_UNAVAILABLE');
        }
        if (!submissions.some((item) => item.requestId === body.requestId)) {
          const row = { ...body, status: 'accepted' };
          submissions.push(row);
          outbox.push({ type: 'contact.accepted', requestId: body.requestId });
        }
        return { ok: true, status: 202, attempts, snapshotCommitted: true };
      } catch (error) {
        submissions = snapshot.submissions;
        outbox = snapshot.outbox;
        return { ok: false, status: 503, code: error.message, attempts, retryable: true };
      }
    },
    inspect() {
      return { submissions: structuredClone(submissions), outbox: structuredClone(outbox), attempts };
    }
  };
}

const service = createService(1);
const first = service.submit(input.submission);
const afterFailure = service.inspect();
const retry = service.submit(input.submission);
const final = service.inspect();

assert.equal(first.status, 503);
assert.equal(afterFailure.submissions.length, 0);
assert.equal(afterFailure.outbox.length, 0);
assert.equal(retry.status, 202);
assert.equal(final.submissions.length, 1);
assert.equal(final.outbox.length, 1);
assert.equal(final.outbox[0].requestId, input.submission.requestId);

console.log(JSON.stringify({ first, afterFailure, retry, final }, null, 2));
console.log('studio-outbox: first=503 retry=202 duplicates=0 outbox=1');
`,
      },
      stdin: JSON.stringify({
        submission: {
          requestId: 'req-outbox-1',
          name: '林青',
          email: 'lin@example.com',
          message: '需要企业官网与案例迁移方案。'
        }
      }),
      checkpoint:
        '第一次提交必须返回 503，且失败快照中 submissions 与 outbox 都为 0；重试返回 202，最终各 1 条且 requestId 一致。最后一行包含 first=503 retry=202 duplicates=0 outbox=1。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 前端页面、状态与可访问交互': {
    title: 'Studio 综合训练 07 · 可访问状态机与 HTML 证据',
    description:
      '先用 reducer 固定导航、筛选、加载、空结果、错误和成功状态，再生成带语义、键盘路径、焦点目标和表单关联的 HTML 片段。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-07-guided-state-machine',
      title: '跟做：让列表状态和焦点都可预测',
      brief:
        '运行 node main.js。按事件顺序应用筛选、加载失败、重试和成功动作，检查错误被清除、空结果不显示旧案例、重试后焦点落在状态标题。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const initial = {
  status: 'idle',
  industry: 'all',
  items: [],
  error: null,
  focusTarget: 'page-heading'
};

function reducer(state, action) {
  if (action.type === 'FILTER') {
    return { ...state, industry: action.industry, status: 'loading', error: null, focusTarget: 'results-heading' };
  }
  if (action.type === 'LOADED') {
    return {
      ...state,
      status: action.items.length ? 'success' : 'empty',
      items: action.items,
      error: null,
      focusTarget: action.items.length ? 'results-heading' : 'status-heading'
    };
  }
  if (action.type === 'FAILED') {
    return { ...state, status: 'error', items: [], error: action.message, focusTarget: 'status-heading' };
  }
  if (action.type === 'RETRY') {
    return { ...state, status: 'loading', error: null, focusTarget: 'status-heading' };
  }
  return state;
}

const states = [];
let state = initial;
for (const action of input.actions) {
  state = reducer(state, action);
  states.push({ action: action.type, snapshot: state });
}

assert.equal(states[1].snapshot.status, 'error');
assert.deepEqual(states[1].snapshot.items, []);
assert.equal(states[2].snapshot.status, 'loading');
assert.equal(states[2].snapshot.error, null);
assert.equal(states[3].snapshot.status, 'success');
assert.ok(states[3].snapshot.items.every((item) => item.industry === 'retail'));
assert.equal(state.focusTarget, 'results-heading');

console.log(JSON.stringify({ final: state, transitions: states.map((item) => item.snapshot.status) }, null, 2));
console.log('studio-ui-state: idle>loading>error>loading>success focus=results-heading');
`,
      },
      stdin: JSON.stringify({
        actions: [
          { type: 'FILTER', industry: 'retail' },
          { type: 'FAILED', message: '案例服务暂时不可用' },
          { type: 'RETRY' },
          { type: 'LOADED', items: [{ id: 'case-retail', industry: 'retail', title: '零售案例' }] }
        ]
      }),
      checkpoint:
        '状态迁移必须为 idle>loading>error>loading>success；错误态清空旧案例，重试清除错误，成功态只保留 retail 案例，最终焦点为 results-heading。最后一行必须匹配 studio-ui-state。',
    },
    apply: {
      id: 'p15-studio-07-independent-accessible-html',
      title: '独立实践：生成可审计的企业站 HTML',
      brief:
        '运行 node main.js。根据内容与表单数据生成带跳转链接、当前导航、图标替代文本、错误关联和状态区的 HTML，并检查注入字符已转义。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const nav = input.nav.map((item) =>
  \`<a href="\${escapeHtml(item.href)}"\${item.current ? ' aria-current="page"' : ''}>\${escapeHtml(item.label)}</a>\`
).join('');
const cases = input.cases.map((item) =>
  \`<article><h3>\${escapeHtml(item.title)}</h3><img src="\${escapeHtml(item.image)}" alt="\${escapeHtml(item.alt)}"><p>\${escapeHtml(item.result)}</p></article>\`
).join('');
const errorText = input.form.error ? \`<p id="email-error" role="alert">\${escapeHtml(input.form.error)}</p>\` : '';
const html = [
  '<a class="skip" href="#main">跳到主要内容</a>',
  \`<nav aria-label="主导航">\${nav}</nav>\`,
  \`<main id="main" tabindex="-1"><h1>\${escapeHtml(input.heading)}</h1>\`,
  \`<section aria-labelledby="cases-heading"><h2 id="cases-heading">公开案例</h2>\${cases}</section>\`,
  '<form novalidate>',
  \`<label for="email">邮箱</label><input id="email" name="email" aria-invalid="\${input.form.invalid}" aria-describedby="email-error">\`,
  errorText,
  '<button type="submit">发送咨询</button></form>',
  '<p role="status" aria-live="polite">表单尚未提交</p></main>'
].join('');

assert.match(html, /class="skip" href="#main"/);
assert.match(html, /aria-current="page"/);
assert.match(html, /alt="制造企业官网首页截图"/);
assert.match(html, /id="email-error" role="alert"/);
assert.match(html, /aria-describedby="email-error"/);
assert.match(html, /role="status" aria-live="polite"/);
assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
assert.ok(html.includes('&lt;script&gt;'));

console.log(JSON.stringify({
  bytes: Buffer.byteLength(html),
  landmarks: ['banner-link', 'navigation', 'main', 'form', 'status'],
  keyboardPath: ['跳过导航', '案例链接', '邮箱输入', '提交按钮'],
  injectionEscaped: true
}, null, 2));
console.log('studio-a11y-html: nav=3 current=1 alerts=1 escaped=1');
`,
      },
      stdin: JSON.stringify({
        heading: 'Studio <script>alert(1)</script>',
        nav: [
          { href: '/', label: '首页', current: false },
          { href: '/work', label: '案例', current: true },
          { href: '/contact', label: '联系', current: false }
        ],
        cases: [
          {
            title: '制造企业数字展厅',
            image: '/case-manufacturing.webp',
            alt: '制造企业官网首页截图',
            result: '询盘转化提升 18%'
          }
        ],
        form: { invalid: true, error: '邮箱格式不正确' }
      }),
      checkpoint:
        'HTML 必须含跳转链接、aria-current、案例替代文本、aria-invalid、email-error 关联、alert 与 live status；标题中的 script 必须转义。最后一行包含 nav=3 current=1 alerts=1 escaped=1。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 联调、测试、安全与性能': {
    title: 'Studio 综合训练 08 · 输入安全与发布性能门禁',
    description:
      '先沿内容与表单数据流做转义、秘密扫描和权限边界检查，再根据真实计算的性能样本与审计证据决定是否可以进入发布阶段。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-08-guided-security',
      title: '跟做：阻断脚本注入与前端泄密',
      brief:
        '运行 node main.js。扫描内容、提交和构建配置，阻断未转义 HTML、硬编码令牌、任意来源提交和错误回显堆栈。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const findings = [];
for (const item of input.content) {
  if (/<script|onerror\\s*=/i.test(item.body) && !item.escapeAtRender) {
    findings.push({ severity: 'high', code: 'UNESCAPED_HTML', id: item.id });
  }
}
for (const [key, value] of Object.entries(input.env)) {
  if (/^sk-|^ghp_|password/i.test(String(value))) {
    findings.push({ severity: 'critical', code: 'SECRET_IN_BUNDLE', key });
  }
}
if (!input.csp.includes("script-src 'self'")) {
  findings.push({ severity: 'high', code: 'WEAK_CSP', field: 'script-src' });
}
if (input.contact.allowedOrigins.includes('*')) {
  findings.push({ severity: 'high', code: 'OPEN_FORM_ORIGIN', field: 'allowedOrigins' });
}
if (input.contact.exposeStack) {
  findings.push({ severity: 'medium', code: 'STACK_EXPOSED', field: 'errorResponse' });
}

const safeRender = escapeHtml(input.content[0].body);
const safeError = { code: 'CONTACT_FAILED', message: '请稍后重试', requestId: 'req-77' };
const criticalOpen = findings.filter((item) => item.severity === 'critical').length;

assert.equal(findings.length, 4);
assert.equal(criticalOpen, 1);
assert.ok(!safeRender.includes('<script>'));
assert.equal(safeError.stack, undefined);

console.log(JSON.stringify({
  findings,
  safeRender,
  safeError,
  verdict: 'block-release'
}, null, 2));
console.log('studio-security: findings=4 critical=1 safe-render=true verdict=block-release');
`,
      },
      stdin: JSON.stringify({
        content: [
          { id: 'case-retail', body: '<script>alert(1)</script> 零售案例', escapeAtRender: false }
        ],
        env: { PUBLIC_API_ORIGIN: 'https://studio.example', ANALYTICS_TOKEN: 'sk-live-123456' },
        csp: "default-src 'self'; script-src 'self'; img-src 'self' data:",
        contact: { allowedOrigins: ['*'], exposeStack: true }
      }),
      checkpoint:
        '必须发现 4 项问题：未转义 HTML、构建内秘密、开放表单来源、错误堆栈外泄；其中 critical 为 1。渲染结果必须转义 script，安全错误响应只含稳定 code/message/requestId。最后一行包含 findings=4 critical=1。',
    },
    apply: {
      id: 'p15-studio-08-independent-performance-gate',
      title: '独立实践：用样本和审计证据判断能否发布',
      brief:
        '运行 node main.js。计算资源体积、LCP P75、CLS P75、键盘流程和 axe 结果；任何预算超限都必须给出版本阻断，并指出最大的资源改造点。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function p75(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.75) - 1];
}

const totalKb = input.assets.reduce((sum, asset) => sum + asset.kb, 0);
const oversized = input.assets
  .filter((asset) => asset.kb > input.budgets.assetKb)
  .sort((left, right) => right.kb - left.kb);
const metrics = {
  totalKb,
  lcpP75: p75(input.samples.lcpMs),
  clsP75: p75(input.samples.cls),
  inpP75: p75(input.samples.inpMs)
};
const checks = [
  { name: 'total-kb', pass: totalKb < input.budgets.totalKb, actual: totalKb, limit: input.budgets.totalKb },
  { name: 'lcp-p75', pass: metrics.lcpP75 < 2500, actual: metrics.lcpP75, limit: 2500 },
  { name: 'cls-p75', pass: metrics.clsP75 < 0.1, actual: metrics.clsP75, limit: 0.1 },
  { name: 'inp-p75', pass: metrics.inpP75 < 200, actual: metrics.inpP75, limit: 200 },
  { name: 'axe-serious', pass: input.audit.axeSerious === 0, actual: input.audit.axeSerious, limit: 0 },
  { name: 'keyboard', pass: input.audit.keyboardPass === true, actual: input.audit.keyboardPass, limit: true }
];
const blockers = checks.filter((item) => !item.pass);
assert.deepEqual(blockers.map((item) => item.name), ['total-kb']);
assert.equal(oversized[0].path, '/hero-original.png');
assert.equal(oversized[0].kb, 920);

console.log(JSON.stringify({
  metrics,
  checks,
  blockers,
  optimization: {
    first: '将 /hero-original.png 转为 AVIF 并输出 640/960/1440 三档',
    expectedSavingKb: 760,
    retest: '重新采集 20 个移动会话的 LCP、CLS、INP 与资源体积'
  }
}, null, 2));
console.log('studio-performance: blockers=1 lcpP75=2380 clsP75=0.07 inpP75=160');
`,
      },
      stdin: JSON.stringify({
        assets: [
          { path: '/app.js', kb: 180 },
          { path: '/app.css', kb: 44 },
          { path: '/hero-original.png', kb: 920 },
          { path: '/case-retail.webp', kb: 150 }
        ],
        budgets: { totalKb: 1000, assetKb: 400 },
        samples: {
          lcpMs: [2100, 2380, 1900, 2450, 2200],
          cls: [0.03, 0.06, 0.07, 0.09, 0.04],
          inpMs: [120, 160, 140, 190, 150]
        },
        audit: { axeSerious: 0, keyboardPass: true }
      }),
      checkpoint:
        'P75 必须算出 LCP=2380、CLS=0.07、INP=160；资源总量 1294KB，只有 total-kb 超预算，首要改造为 920KB 的 hero-original.png。最后一行包含 blockers=1 与三个 P75 数值，脚本应阻断发布而不是用平均值掩盖超限。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 容器、CI/CD、可观测与发布': {
    title: 'Studio 综合训练 09 · 不可变制品与自动回滚',
    description:
      '为静态站点生成内容哈希、缓存头和发布清单，再模拟冒烟检查失败，验证生产指针保持旧版本并留下可追溯事件。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-09-guided-artifact',
      title: '跟做：给静态资源制定缓存策略',
      brief:
        '运行 node main.js。对构建文件计算 SHA-256，把 HTML 标为协商缓存、指纹资源标为 immutable，并识别不应进入生产制品的 sourcemap。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function cachePolicy(path) {
  if (path.endsWith('.html')) return 'no-cache';
  if (/\\.[a-f0-9]{8,}\\.(js|css|woff2|webp)$/.test(path)) return 'public, max-age=31536000, immutable';
  if (path.endsWith('.map')) return 'exclude';
  return 'public, max-age=300';
}

const files = input.files
  .filter((file) => cachePolicy(file.path) !== 'exclude')
  .map((file) => ({
    path: file.path,
    bytes: Buffer.byteLength(file.content),
    sha256: crypto.createHash('sha256').update(file.content).digest('hex'),
    cacheControl: cachePolicy(file.path)
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
const manifestHash = crypto
  .createHash('sha256')
  .update(files.map((file) => file.path + ':' + file.sha256).join('\\n'))
  .digest('hex');

assert.equal(files.length, 4);
assert.ok(files.every((file) => file.sha256.length === 64));
assert.equal(files.find((file) => file.path === 'index.html').cacheControl, 'no-cache');
assert.match(files.find((file) => file.path.includes('.css')).cacheControl, /immutable/);
assert.ok(!files.some((file) => file.path.endsWith('.map')));

console.log(JSON.stringify({
  releaseId: input.releaseId,
  manifestHash,
  files,
  excluded: input.files.filter((file) => cachePolicy(file.path) === 'exclude').map((file) => file.path)
}, null, 2));
console.log('studio-artifact: files=4 immutable=3 html=no-cache maps=excluded');
`,
      },
      stdin: JSON.stringify({
        releaseId: 'studio-2026-11-24.1',
        files: [
          { path: 'index.html', content: '<main id="main">Studio</main>' },
          { path: 'assets/site.9f2c31a4.css', content: 'body{margin:0}' },
          { path: 'assets/site.7ac5d1be.js', content: 'console.log("ready")' },
          { path: 'assets/case-retail.4f91aa20.webp', content: 'binary-placeholder' },
          { path: 'assets/site.7ac5d1be.js.map', content: '{"version":3}' }
        ]
      }),
      checkpoint:
        '清单必须含 4 个文件，全部 SHA-256 为 64 位十六进制；HTML 是 no-cache，3 个指纹资源为 immutable，sourcemap 被排除。最后一行包含 files=4 immutable=3 html=no-cache maps=excluded。',
    },
    apply: {
      id: 'p15-studio-09-independent-release-rollback',
      title: '独立实践：冒烟失败时原子回滚',
      brief:
        '运行 node main.js。执行构建、单元测试、预览冒烟和缓存校验，发现新版本冒烟失败后保持旧版本为 active，并记录可检索的失败证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function runPipeline(event, currentActive) {
  const logs = [];
  let candidate = null;
  let active = currentActive;
  for (const step of input.steps) {
    logs.push({ step: step.name, status: 'started' });
    if (step.name === 'build') candidate = input.candidateReleaseId;
    if (!step.pass) {
      logs[logs.length - 1].status = 'failed';
      logs.push({ step: 'rollback-check', activeBefore: active, activeAfter: active, promoted: false });
      return { event, active, candidate, logs, outcome: 'rolled-back-before-promotion' };
    }
    logs[logs.length - 1].status = 'passed';
  }
  active = candidate;
  logs.push({ step: 'promote', activeBefore: currentActive, activeAfter: active, promoted: true });
  return { event, active, candidate, logs, outcome: 'released' };
}

const result = runPipeline(input.event, input.activeReleaseId);
const failed = result.logs.find((item) => item.status === 'failed');

assert.equal(result.outcome, 'rolled-back-before-promotion');
assert.equal(result.active, input.activeReleaseId);
assert.equal(result.candidate, input.candidateReleaseId);
assert.equal(failed.step, 'smoke-preview');
assert.equal(result.logs.at(-1).promoted, false);

console.log(JSON.stringify({
  result,
  alarm: {
    name: 'studio_release_failed',
    release: input.candidateReleaseId,
    failedStep: failed.step,
    activeRelease: result.active
  },
  evidence: input.smokeEvidence
}, null, 2));
console.log('studio-release-rollback: active=' + result.active + ' candidate=' + result.candidate + ' promoted=false');
`,
      },
      stdin: JSON.stringify({
        event: 'release.studio.2026-11-24.2',
        activeReleaseId: 'studio-2026-11-23.4',
        candidateReleaseId: 'studio-2026-11-24.2',
        steps: [
          { name: 'build', pass: true },
          { name: 'unit-tests', pass: true },
          { name: 'smoke-preview', pass: false },
          { name: 'cache-policy', pass: true }
        ],
        smokeEvidence: {
          url: '/work/case-retail',
          expectedStatus: 200,
          actualStatus: 404,
          responseHeader: 'x-release: studio-2026-11-24.2'
        }
      }),
      checkpoint:
        '流水线必须在 smoke-preview 失败，active 保持 studio-2026-11-23.4，candidate 记录新版本，promoted=false；告警包含 404 证据。最后一行包含 active=studio-2026-11-23.4 candidate=studio-2026-11-24.2 promoted=false。',
    },
  },

  'programming:综合训练 · Studio 企业官网 · 故障演练、回滚与项目答辩': {
    title: 'Studio 综合训练 10 · 故障分级与复盘证据',
    description:
      '对资源 404、表单 503 与内容过期做用户影响分级和先手处置，再从时间线计算 MTTD/MTTR、验证根因链与行动项是否可验收。',
    ...nodeRuntime,
    practice: {
      id: 'p15-studio-10-guided-triage',
      title: '跟做：先保用户任务，再修根因',
      brief:
        '运行 node main.js。对三条同时出现的故障做严重度、影响面、先手处置与回退验证，保证 404 不挡咨询、503 保留输入、过期内容有提示。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const rules = {
  'asset-404': {
    severity: 'medium',
    userFallback: '使用上一版指纹资源并返回 200',
    containment: 'CDN 回切上一制品',
    evidence: 'status 与 x-release 响应头'
  },
  'contact-503': {
    severity: 'high',
    userFallback: '保留表单内容，提供重试和邮件备选',
    containment: '恢复 outbox worker，再验证请求幂等',
    evidence: '提交 requestId、503 trace 与最终 202 记录'
  },
  'stale-content': {
    severity: 'medium',
    userFallback: '显示最后更新时间与“查看当前服务”说明',
    containment: '刷新内容缓存并核对发布状态',
    evidence: '内容版本哈希与首页提示截图'
  }
};

const incidents = input.incidents.map((incident) => {
  const rule = rules[incident.type];
  return { ...incident, ...rule, owner: incident.impactUsers >= 50 ? '值班工程师+品牌负责人' : '内容编辑' };
}).sort((left, right) => {
  const rank = { high: 0, medium: 1, low: 2 };
  return rank[left.severity] - rank[right.severity] || right.impactUsers - left.impactUsers;
});

assert.equal(incidents[0].type, 'contact-503');
assert.equal(incidents[0].severity, 'high');
assert.ok(incidents.every((item) => item.userFallback && item.containment && item.evidence));
assert.ok(incidents.find((item) => item.type === 'asset-404').userFallback.includes('200'));

console.log(JSON.stringify({ incidents, order: incidents.map((item) => item.type) }, null, 2));
console.log('studio-triage: high=1 medium=2 first=contact-503 fallback=ready');
`,
      },
      stdin: JSON.stringify({
        incidents: [
          { id: 'inc-01', type: 'asset-404', impactUsers: 18, startedAt: '10:02', signal: 'hero 图 404' },
          { id: 'inc-02', type: 'contact-503', impactUsers: 64, startedAt: '10:01', signal: '提交存储连接超时' },
          { id: 'inc-03', type: 'stale-content', impactUsers: 35, startedAt: '10:03', signal: '案例更新时间停在昨日' }
        ]
      }),
      checkpoint:
        'contact-503 必须排第一且为 high，另外两条为 medium；每条都包含用户回退、先手处置和可观察证据，404 回退明确返回 200。最后一行包含 high=1 medium=2 first=contact-503 fallback=ready。',
    },
    apply: {
      id: 'p15-studio-10-independent-postmortem',
      title: '独立实践：把事故时间线变成可执行复盘',
      brief:
        '运行 node main.js。校验时间线顺序，计算检测与恢复时长，串出触发、放大和根因，并拒绝没有负责人/期限或使用归责语言的行动项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const timeline = [...input.timeline].sort((left, right) => left.at - right.at);
const timestamps = timeline.map((item) => item.type);
for (const required of ['started', 'detected', 'contained', 'resolved']) {
  assert.ok(timestamps.includes(required), '时间线缺少 ' + required);
}
const at = Object.fromEntries(timeline.map((item) => [item.type, item.at]));
const mttd = at.detected - at.started;
const mttr = at.resolved - at.started;
const badActions = input.actions.filter((item) => !item.owner || !item.due || /粗心|态度|某同事/.test(item.text));
const validActions = input.actions.filter((item) => !badActions.includes(item));

assert.deepEqual(timeline.map((item) => item.type), ['started', 'detected', 'contained', 'resolved']);
assert.equal(mttd, 4);
assert.equal(mttr, 27);
assert.equal(badActions.length, 1);
assert.equal(validActions.length, 2);

console.log(JSON.stringify({
  mttdMinutes: mttd,
  mttrMinutes: mttr,
  causalChain: [
    '新制品遗漏 case-retail.html',
    '冒烟只检查首页，未覆盖案例详情',
    'CDN 又把未知路径回退到错误页，放大可见影响'
  ],
  rejectedActions: badActions,
  acceptedActions: validActions,
  releaseDecision: '回滚通过，补齐案例路由冒烟后再发布'
}, null, 2));
console.log('studio-postmortem: mttd=4 mttr=27 rejected-actions=1 accepted-actions=2');
`,
      },
      stdin: JSON.stringify({
        timeline: [
          { type: 'started', at: 0, evidence: '发布 2026-11-24.2' },
          { type: 'detected', at: 4, evidence: '咨询入口收到 404 截图' },
          { type: 'contained', at: 12, evidence: '回切 2026-11-23.4' },
          { type: 'resolved', at: 27, evidence: '案例页与咨询提交恢复' }
        ],
        actions: [
          { text: '把案例详情、表单失败和缓存头加入发布冒烟', owner: '前端值班', due: '2026-11-27' },
          { text: '某同事态度不认真导致上传漏文件', owner: '团队', due: '2026-11-30' },
          { text: '为静态制品增加路径清单和回滚演练', owner: '发布负责人', due: '2026-11-29' }
        ]
      }),
      checkpoint:
        '必须算出 MTTD=4 分钟、MTTR=27 分钟，输出包含遗漏案例、冒烟覆盖不足和 CDN 放大的根因链；1 条归责行动被拒绝，2 条带负责人/期限的行动保留。最后一行包含 mttd=4 mttr=27 rejected-actions=1 accepted-actions=2。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 业务理解与用户任务': {
    title: 'Pulse 综合训练 01 · 值班任务卡与热点优先级',
    description:
      '把运营、分析、值班编辑和管理员的动作写成带证据的任务，再用趋势、来源多样性、新鲜度和告警状态计算可解释的值班优先级。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-01-guided-duty-cards',
      title: '跟做：把驾驶舱角色变成接管链',
      brief:
        '运行 node main.js。检查四类角色的触发条件、首屏信息、下一动作和升级对象，输出每条任务是否可以直接值班执行。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = ['trigger', 'firstScreen', 'nextAction', 'escalation'];
const cards = input.roles.map((role) => {
  const missing = required.filter((field) => !String(role[field] || '').trim());
  const evidenceGaps = role.evidence.filter((item) => item.status !== 'available');
  return {
    role: role.role,
    task: role.firstScreen,
    missing,
    evidenceGaps: evidenceGaps.map((item) => item.name),
    executable: missing.length === 0 && evidenceGaps.length === 0
  };
});

assert.equal(cards.length, 4);
assert.equal(cards.filter((card) => card.executable).length, 3);
assert.ok(cards.find((card) => card.role === '系统管理员').evidenceGaps.includes('来源心跳阈值'));
assert.ok(cards.every((card) => card.task.includes('查看') || card.task.includes('接管') || card.task.includes('检查')));

console.log(JSON.stringify({
  cards,
  ready: cards.filter((card) => card.executable).length,
  blocked: cards.filter((card) => !card.executable).map((card) => card.role)
}, null, 2));
console.log('pulse-duty: ready=3 blocked=系统管理员 missing=来源心跳阈值');
`,
      },
      stdin: JSON.stringify({
        roles: [
          {
            role: '内容运营',
            trigger: '热点速度连续 3 分钟超过 2 倍基线',
            firstScreen: '查看热点卡片与来源证据',
            nextAction: '打开事件时间线并标记待核验',
            escalation: '证据不一致时升级值班编辑',
            evidence: [{ name: '速度趋势', status: 'available' }, { name: '来源列表', status: 'available' }]
          },
          {
            role: '数据分析师',
            trigger: '运营请求解释热度变化',
            firstScreen: '查看同话题历史曲线与来源贡献',
            nextAction: '导出对比窗口并注明采集缺口',
            escalation: '采集异常升级管理员',
            evidence: [{ name: '历史窗口', status: 'available' }]
          },
          {
            role: '值班编辑',
            trigger: '高优先级告警进入待接管',
            firstScreen: '查看告警证据与最近事件',
            nextAction: '接管告警并确认来源失真',
            escalation: '无法确认事实时升级主编',
            evidence: [{ name: '告警证据', status: 'available' }]
          },
          {
            role: '系统管理员',
            trigger: '来源健康度下降或事件积压',
            firstScreen: '检查采集延迟与队列深度',
            nextAction: '隔离异常来源并触发重放',
            escalation: '持续时间超过 10 分钟升级平台负责人',
            evidence: [{ name: '队列指标', status: 'available' }, { name: '来源心跳阈值', status: 'missing' }]
          }
        ]
      }),
      checkpoint:
        '必须输出 3 张可执行任务卡，系统管理员因缺少“来源心跳阈值”被阻断；最后一行包含 pulse-duty: ready=3 blocked=系统管理员 missing=来源心跳阈值。仅有角色名称或情绪描述不算可执行任务。',
    },
    apply: {
      id: 'p15-pulse-01-independent-priority',
      title: '独立实践：计算热点值班优先级',
      brief:
        '运行 node main.js。根据速度、来源数、新鲜度和告警级别排序，输出分数拆解；标记为“辅助信号”，不能把高分直接当成事实成立。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function priority(topic, now) {
  const ageMinutes = Math.max(0, Math.floor((now - topic.lastSeenAt) / 60_000));
  const freshness = ageMinutes <= 2 ? 30 : ageMinutes <= 5 ? 20 : ageMinutes <= 15 ? 10 : 0;
  const diversity = Math.min(25, topic.sources.length * 8);
  const speed = Math.min(30, Math.round(topic.velocity * 6));
  const alert = topic.openAlert ? 15 : 0;
  const total = freshness + diversity + speed + alert;
  return {
    id: topic.id,
    title: topic.title,
    total,
    breakdown: { freshness, diversity, speed, alert },
    ageMinutes,
    label: total >= 75 ? 'take-over' : total >= 50 ? 'monitor' : 'observe',
    evidenceState: topic.sources.length >= 2 && ageMinutes <= 5 ? 'multi-source-fresh' : 'needs-verification'
  };
}

const now = input.now;
const ranked = input.topics.map((topic) => priority(topic, now)).sort((left, right) =>
  right.total - left.total || left.id.localeCompare(right.id)
);

assert.equal(ranked[0].id, 'topic-payments');
assert.equal(ranked[0].total, 99);
assert.equal(ranked[0].label, 'take-over');
assert.equal(ranked[0].evidenceState, 'multi-source-fresh');
assert.ok(ranked.find((item) => item.id === 'topic-ceo').evidenceState === 'needs-verification');
assert.ok(ranked.every((item) => item.total <= 100));

console.log(JSON.stringify({
  ranked,
  rankingNotice: 'priority is an operational routing signal, not a truth verdict'
}, null, 2));
console.log('pulse-priority: first=topic-payments score=99 label=take-over truth=unverified');
`,
      },
      stdin: JSON.stringify({
        now: 1760000000000,
        topics: [
          {
            id: 'topic-payments',
            title: '支付系统维护通知',
            velocity: 5,
            sources: ['source-a', 'source-b', 'source-c'],
            lastSeenAt: 1760000000000 - 60_000,
            openAlert: true
          },
          {
            id: 'topic-ceo',
            title: '未经证实的 CEO 传闻',
            velocity: 7,
            sources: ['source-x'],
            lastSeenAt: 1760000000000 - 60_000,
            openAlert: true
          },
          {
            id: 'topic-weather',
            title: '区域天气变化',
            velocity: 1,
            sources: ['source-d', 'source-e'],
            lastSeenAt: 1760000000000 - 12 * 60_000,
            openAlert: false
          }
        ]
      }),
      checkpoint:
        'topic-payments 必须排第一，分数拆解为 freshness=30、diversity=24、speed=30、alert=15，总分 99；单来源但速度更高的 CEO 话题必须标 needs-verification。最后一行包含 first=topic-payments score=99 truth=unverified。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 范围、验收与非功能目标': {
    title: 'Pulse 综合训练 02 · 实时预算与首事件门禁',
    description:
      '冻结来源、时间线、热点、实时流和筛选五个 MVP 资源，并以首屏、首事件、断线恢复、慢消费者和来源陈旧检测构造可执行验收。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-02-guided-realtime-budget',
      title: '跟做：把实时体验写成样本门禁',
      brief:
        '运行 node main.js。计算首事件 P95、断线恢复 P95 和慢消费者队列上限，检查五个 MVP 资源和三条非目标，判定当前样本是否达标。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function p95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

const resources = ['sources', 'events', 'topics', 'stream', 'filters'];
const missingResources = resources.filter((item) => !input.mvpResources.includes(item));
const budget = {
  firstEventP95: p95(input.samples.firstEventMs),
  reconnectP95: p95(input.samples.reconnectMs),
  queueMax: Math.max(...input.samples.queueDepth),
  staleDetectionSeconds: input.staleDetectionSeconds
};
const checks = [
  { name: 'mvp-resources', pass: missingResources.length === 0, actual: missingResources },
  { name: 'first-event', pass: budget.firstEventP95 < 1000, actual: budget.firstEventP95, limit: 1000 },
  { name: 'reconnect', pass: budget.reconnectP95 <= 3000, actual: budget.reconnectP95, limit: 3000 },
  { name: 'slow-consumer-bound', pass: budget.queueMax <= input.queueLimit, actual: budget.queueMax, limit: input.queueLimit },
  { name: 'stale-detection', pass: budget.staleDetectionSeconds <= 30, actual: budget.staleDetectionSeconds, limit: 30 }
];

assert.deepEqual(missingResources, []);
assert.equal(budget.firstEventP95, 940);
assert.equal(budget.reconnectP95, 2800);
assert.ok(input.nonGoals.length >= 3);
assert.ok(checks.every((check) => check.pass));

console.log(JSON.stringify({
  budget,
  checks,
  nonGoals: input.nonGoals,
  verdict: 'acceptance-defined'
}, null, 2));
console.log('pulse-budget: first-event-p95=940 reconnect-p95=2800 queue=18 gate=pass');
`,
      },
      stdin: JSON.stringify({
        mvpResources: ['sources', 'events', 'topics', 'stream', 'filters'],
        nonGoals: ['全网舆情抓取', '复杂推荐算法', '移动原生 App'],
        samples: {
          firstEventMs: [720, 940, 810, 990, 760, 780, 820, 900, 860, 880, 830, 870, 910, 850, 890, 920, 800, 840, 930, 770],
          reconnectMs: [1800, 2800, 2400, 2100, 2600],
          queueDepth: [8, 13, 18, 12, 15]
        },
        staleDetectionSeconds: 20,
        queueLimit: 20
      }),
      checkpoint:
        '首事件 P95 必须为 940ms、断线恢复 P95 为 2800ms、队列峰值为 18，所有检查通过并列出三项非目标。最后一行包含 first-event-p95=940 reconnect-p95=2800 queue=18 gate=pass。',
    },
    apply: {
      id: 'p15-pulse-02-independent-realtime-acceptance',
      title: '独立实践：找出实时验收的隐藏失败',
      brief:
        '运行 node main.js。复核慢消费者、重复事件、来源陈旧和断线恢复样本；即使平均延迟漂亮，只要任一尾部或内存边界失败就阻断发布。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
const maxQueue = Math.max(...input.consumers.map((item) => item.queueDepth));
const droppedSlowConsumer = input.consumers.some((item) => item.dropped > 0 && item.queueDepth <= input.queueLimit);
const duplicateCount = input.stream.filter((event, index, all) =>
  all.findIndex((candidate) => candidate.id === event.id) !== index
).length;
const visibleDuplicateCount = input.clientRendered.filter((event, index, all) =>
  all.findIndex((candidate) => candidate.id === event.id) !== index
).length;

checks.push({ name: 'queue-bound', pass: maxQueue <= input.queueLimit, actual: maxQueue });
checks.push({ name: 'slow-consumer-protected', pass: droppedSlowConsumer, actual: droppedSlowConsumer });
checks.push({ name: 'server-deduplicates', pass: duplicateCount === 0, actual: duplicateCount });
checks.push({ name: 'client-still-deduplicates', pass: visibleDuplicateCount === 0, actual: visibleDuplicateCount });
checks.push({ name: 'stale-source-marked', pass: input.sourceState.state === 'stale-visible', actual: input.sourceState.state });
checks.push({ name: 'reconnect-with-cursor', pass: input.reconnect.lastEventId === input.stream.at(-1).id, actual: input.reconnect.lastEventId });
const blockers = checks.filter((item) => !item.pass);

assert.deepEqual(blockers.map((item) => item.name), ['client-still-deduplicates']);
assert.equal(maxQueue, 20);
assert.equal(visibleDuplicateCount, 1);
assert.equal(input.reconnect.lastEventId, 'evt-4');

console.log(JSON.stringify({
  checks,
  blockers,
  evidence: {
    maxQueue,
    visibleDuplicate: input.clientRendered[2].id,
    staleSource: input.sourceState.sourceId,
    reconnectCursor: input.reconnect.lastEventId
  },
  verdict: 'block-release'
}, null, 2));
console.log('pulse-acceptance: blockers=client-still-deduplicates max-queue=20 reconnect-cursor=evt-4');
`,
      },
      stdin: JSON.stringify({
        consumers: [
          { id: 'fast-a', queueDepth: 3, dropped: 0 },
          { id: 'slow-b', queueDepth: 20, dropped: 7 },
          { id: 'fast-c', queueDepth: 5, dropped: 0 }
        ],
        queueLimit: 20,
        stream: [
          { id: 'evt-1', title: '维护通知' },
          { id: 'evt-2', title: '来源恢复' },
          { id: 'evt-3', title: '热点上升' },
          { id: 'evt-4', title: '官方回应' }
        ],
        clientRendered: [
          { id: 'evt-1' },
          { id: 'evt-2' },
          { id: 'evt-3' },
          { id: 'evt-3' },
          { id: 'evt-4' }
        ],
        sourceState: { sourceId: 'source-b', state: 'stale-visible' },
        reconnect: { lastEventId: 'evt-4' }
      }),
      checkpoint:
        '必须只有 client-still-deduplicates 失败；队列峰值恰好等于上限 20，慢消费者允许丢弃，服务端无重复，但客户端渲染出现重复 evt-3。最后一行包含 blockers=client-still-deduplicates max-queue=20 reconnect-cursor=evt-4。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · API 契约与前端数据边界': {
    title: 'Pulse 综合训练 03 · SSE 解析与游标契约',
    description:
      '按事件流文本规则解析多行 data、id、event 与 retry，再检查 sources/events/alerts 的版本差异和断线续传游标是否破坏客户端。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-03-guided-sse-parser',
      title: '跟做：正确解析一条 SSE 流',
      brief:
        '运行 node main.js。解析注释、默认 message、自定义 event、多行 data、id 与 retry；空行只提交完整事件，最后残留块不能丢。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const raw = fs.readFileSync(0, 'utf8');

function parseSse(text) {
  const events = [];
  let event = {};
  let data = [];
  const dispatch = () => {
    if (data.length > 0) events.push({ ...event, data: data.join('\\n') });
    event = {};
    data = [];
  };
  for (const line of text.split(/\\r?\\n/)) {
    if (line === '') {
      dispatch();
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    if (field === 'event') event.type = value;
    if (field === 'id') event.id = value;
    if (field === 'retry') event.retry = Number(value);
  }
  dispatch();
  return events;
}

const events = parseSse(raw);
assert.equal(events.length, 2);
assert.equal(events[0].id, 'evt-42');
assert.equal(events[0].retry, 3000);
assert.equal(events[0].type, 'topic.updated');
assert.equal(events[0].data, '{"topic":"payments","score":88}\\n{"source":"official"}');
assert.equal(events[1].type, undefined);
assert.equal(events[1].data, '{"ping":true}');

console.log(JSON.stringify({ events, lastEventId: events.at(-1).id || events[0].id }, null, 2));
console.log('pulse-sse: events=2 multiline=1 retry=3000 last-id=evt-42');
`,
      },
      stdin:
        ': keep-alive\n' +
        'id: evt-42\n' +
        'event: topic.updated\n' +
        'retry: 3000\n' +
        'data: {"topic":"payments","score":88}\n' +
        'data: {"source":"official"}\n' +
        '\n' +
        'data: {"ping":true}\n' +
        '\n',
      checkpoint:
        '必须解析 2 个事件；第一个事件 id=evt-42、type=topic.updated、retry=3000，data 保留换行；第二个事件使用默认 message。最后一行包含 events=2 multiline=1 retry=3000 last-id=evt-42。',
    },
    apply: {
      id: 'p15-pulse-03-independent-cursor-contract',
      title: '独立实践：阻止游标与字段破坏式升级',
      brief:
        '运行 node main.js。比较两版 sources、events、alerts 接口，识别字段删除、新增必填、错误结构变化和 cursor 语义变化，输出兼容发布顺序。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function diffResource(resource) {
  const breaking = [];
  const compatible = [];
  for (const [field, oldSpec] of Object.entries(resource.oldFields)) {
    const newSpec = resource.newFields[field];
    if (!newSpec) breaking.push({ kind: 'removed', field });
    else if (oldSpec.type !== newSpec.type) breaking.push({ kind: 'type-changed', field, from: oldSpec.type, to: newSpec.type });
    else if (!oldSpec.required && newSpec.required) breaking.push({ kind: 'newly-required', field });
  }
  for (const [field, spec] of Object.entries(resource.newFields)) {
    if (!(field in resource.oldFields)) {
      const item = { kind: spec.required ? 'newly-required' : 'added', field, required: !!spec.required };
      (spec.required ? breaking : compatible).push(item);
    }
  }
  if (resource.oldError.codeField !== resource.newError.codeField) {
    breaking.push({ kind: 'error-code-field-changed', from: resource.oldError.codeField, to: resource.newError.codeField });
  }
  if (resource.oldCursor !== resource.newCursor) {
    breaking.push({ kind: 'cursor-changed', from: resource.oldCursor, to: resource.newCursor });
  }
  return { resource: resource.name, breaking, compatible };
}

const results = input.resources.map(diffResource);
const allBreaking = results.flatMap((item) => item.breaking.map((issue) => ({ resource: item.resource, ...issue })));

assert.ok(allBreaking.some((item) => item.resource === 'events' && item.kind === 'removed' && item.field === 'summary'));
assert.ok(allBreaking.some((item) => item.resource === 'events' && item.kind === 'newly-required'));
assert.ok(allBreaking.some((item) => item.resource === 'events' && item.kind === 'cursor-changed'));
assert.ok(allBreaking.some((item) => item.resource === 'alerts' && item.kind === 'error-code-field-changed'));
assert.equal(results.find((item) => item.resource === 'sources').breaking.length, 0);

console.log(JSON.stringify({
  results,
  rollout: [
    'events 新增 evidenceUrl 时先保持可选并双写 summary 兼容字段',
    '同时支持 offset 与 keyset 游标，记录旧客户端占比',
    'alerts 错误体同时返回 code 与旧 errorCode 两周',
    'sources 可直接发布，其余资源逐个观察后再删除兼容字段'
  ]
}, null, 2));
console.log('pulse-contract: sources=compatible events=breaking alerts=breaking rollout=ordered');
`,
      },
      stdin: JSON.stringify({
        resources: [
          {
            name: 'sources',
            oldFields: { id: { type: 'string', required: true }, name: { type: 'string', required: true } },
            newFields: { id: { type: 'string', required: true }, name: { type: 'string', required: true }, healthUrl: { type: 'string', required: false } },
            oldError: { codeField: 'code' },
            newError: { codeField: 'code' },
            oldCursor: 'offset',
            newCursor: 'offset'
          },
          {
            name: 'events',
            oldFields: {
              id: { type: 'string', required: true },
              summary: { type: 'string', required: false },
              publishedAt: { type: 'string', required: true }
            },
            newFields: {
              id: { type: 'string', required: true },
              evidenceUrl: { type: 'string', required: true },
              publishedAt: { type: 'number', required: true },
              tenantId: { type: 'string', required: false }
            },
            oldError: { codeField: 'code' },
            newError: { codeField: 'code' },
            oldCursor: 'offset',
            newCursor: 'keyset'
          },
          {
            name: 'alerts',
            oldFields: { id: { type: 'string', required: true }, state: { type: 'string', required: true } },
            newFields: { id: { type: 'string', required: true }, state: { type: 'string', required: true } },
            oldError: { codeField: 'errorCode' },
            newError: { codeField: 'code' },
            oldCursor: 'keyset',
            newCursor: 'keyset'
          }
        ]
      }),
      checkpoint:
        'sources 必须 compatible；events 必须识别 summary 删除、publishedAt 类型变化、evidenceUrl 新增必填和 offset→keyset；alerts 必须识别错误码字段破坏。最后一行包含 sources=compatible events=breaking alerts=breaking rollout=ordered。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 数据模型、约束与迁移': {
    title: 'Pulse 综合训练 04 · 事件去重与主题迁移',
    description:
      '用来源、事件、主题、告警和游标表落实租户隔离、外部事件去重、告警唯一性和单调游标，再演练主题关系回填与回滚。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-04-guided-event-constraints',
      title: '跟做：同一外部事件只能落一次',
      brief:
        '运行 node main.js。插入两个来源与三条事件，拒绝未知来源、重复 sourceId+externalId 和同主题重复开放告警，并检查游标递增。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createStore() {
  const sources = new Map();
  const events = [];
  const topics = new Map();
  const alerts = [];
  let cursor = 0;
  return {
    addSource(row) {
      if (sources.has(row.id)) throw new Error('SOURCE_EXISTS');
      sources.set(row.id, { ...row });
    },
    ingestEvent(row) {
      if (!sources.has(row.sourceId)) throw new Error('UNKNOWN_SOURCE');
      if (events.some((item) => item.sourceId === row.sourceId && item.externalId === row.externalId)) {
        return { inserted: false, reason: 'DUPLICATE_EXTERNAL_EVENT' };
      }
      if (!topics.has(row.topicId)) throw new Error('UNKNOWN_TOPIC');
      cursor += 1;
      const event = { ...row, cursor, tenantId: sources.get(row.sourceId).tenantId };
      events.push(event);
      return { inserted: true, cursor };
    },
    addTopic(row) {
      if (topics.has(row.id)) throw new Error('TOPIC_EXISTS');
      topics.set(row.id, { ...row });
    },
    openAlert(row) {
      if (alerts.some((item) => item.topicId === row.topicId && item.state === 'open')) {
        return { opened: false, reason: 'OPEN_ALERT_EXISTS' };
      }
      alerts.push({ ...row, state: 'open' });
      return { opened: true };
    },
    snapshot() {
      return { sources: [...sources.values()], events: structuredClone(events), topics: [...topics.values()], alerts: structuredClone(alerts), cursor };
    }
  };
}

const store = createStore();
const errors = [];
input.sources.forEach((source) => store.addSource(source));
input.topics.forEach((topic) => store.addTopic(topic));
function attempt(name, fn) {
  try {
    fn();
  } catch (error) {
    errors.push({ name, code: error.message });
  }
}
const first = store.ingestEvent(input.events[0]);
const duplicate = store.ingestEvent(input.events[1]);
attempt('unknown-source', () => store.ingestEvent({ ...input.events[2], sourceId: 'source-missing' }));
const second = store.ingestEvent(input.events[2]);
const firstAlert = store.openAlert({ id: 'alert-1', topicId: 'topic-payments' });
const duplicateAlert = store.openAlert({ id: 'alert-2', topicId: 'topic-payments' });
const snapshot = store.snapshot();

assert.deepEqual([first.cursor, second.cursor], [1, 2]);
assert.equal(duplicate.reason, 'DUPLICATE_EXTERNAL_EVENT');
assert.equal(duplicateAlert.reason, 'OPEN_ALERT_EXISTS');
assert.equal(errors.length, 1);
assert.equal(snapshot.events.length, 2);
assert.deepEqual(snapshot.events.map((event) => event.cursor), [1, 2]);
assert.ok(snapshot.events.every((event) => event.tenantId === 'tenant-a'));

console.log(JSON.stringify({ errors, first, duplicate, second, firstAlert, duplicateAlert, snapshot }, null, 2));
console.log('pulse-model: events=2 cursor=1,2 duplicates=1 alerts=1 rejected-source=1');
`,
      },
      stdin: JSON.stringify({
        sources: [
          { id: 'source-a', tenantId: 'tenant-a', name: '官方公告' },
          { id: 'source-b', tenantId: 'tenant-a', name: '行业媒体' }
        ],
        topics: [
          { id: 'topic-payments', tenantId: 'tenant-a', title: '支付系统维护' },
          { id: 'topic-weather', tenantId: 'tenant-a', title: '区域天气' }
        ],
        events: [
          { id: 'event-1', sourceId: 'source-a', externalId: 'a-100', topicId: 'topic-payments', title: '维护开始' },
          { id: 'event-duplicate', sourceId: 'source-a', externalId: 'a-100', topicId: 'topic-payments', title: '重复采集' },
          { id: 'event-2', sourceId: 'source-b', externalId: 'b-201', topicId: 'topic-payments', title: '媒体跟进' },
          { id: 'event-3', sourceId: 'source-a', externalId: 'a-101', topicId: 'topic-weather', title: '天气更新' }
        ]
      }),
      checkpoint:
        '未知来源必须被拒绝，重复外部事件与重复开放告警不能新增记录；最终事件 2 条，游标严格为 1、2，租户均由来源推导。最后一行包含 events=2 cursor=1,2 duplicates=1 alerts=1 rejected-source=1。',
    },
    apply: {
      id: 'p15-pulse-04-independent-topic-migration',
      title: '独立实践：从扁平事件回填主题关系',
      brief:
        '运行 node main.js。把旧事件的 topic 名称迁到 topic 表和关联表，生成缺失主题、跳过坏记录，验证第二次回填幂等并保留旧快照。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const legacySnapshot = structuredClone(input.legacyEvents);
const target = { topics: new Map(), links: new Map(), skipped: [], attempted: new Set() };

function migrate(rows) {
  let createdTopics = 0;
  let createdLinks = 0;
  for (const row of rows) {
    if (target.attempted.has(row.id)) continue;
    target.attempted.add(row.id);
    if (!row.id || !row.topic || !row.tenantId) {
      target.skipped.push({ id: row.id, reason: 'MISSING_REQUIRED_FIELD' });
      continue;
    }
    const topicKey = row.tenantId + ':' + row.topic;
    if (!target.topics.has(topicKey)) {
      target.topics.set(topicKey, { id: 'topic-' + (target.topics.size + 1), tenantId: row.tenantId, name: row.topic });
      createdTopics += 1;
    }
    if (!target.links.has(row.id)) {
      target.links.set(row.id, { eventId: row.id, topicId: target.topics.get(topicKey).id });
      createdLinks += 1;
    }
  }
  return { createdTopics, createdLinks };
}

const first = migrate(input.legacyEvents);
const second = migrate(input.legacyEvents);

assert.deepEqual(second, { createdTopics: 0, createdLinks: 0 });
assert.equal(target.topics.size, 2);
assert.equal(target.links.size, 3);
assert.equal(target.skipped.length, 1);
assert.deepEqual(input.legacyEvents, legacySnapshot, '迁移前快照不能被改写');

console.log(JSON.stringify({
  first,
  second,
  topics: [...target.topics.values()],
  links: [...target.links.values()],
  skipped: target.skipped,
  rollback: {
    legacyRows: legacySnapshot.length,
    strategy: '事务内双写关联表，校验链接数后再切换读路径；异常时丢弃关联表并继续读旧 topic 字段'
  }
}, null, 2));
console.log('pulse-migration: topics=2 links=3 skipped=1 second-run=idempotent');
`,
      },
      stdin: JSON.stringify({
        legacyEvents: [
          { id: 'evt-1', tenantId: 'tenant-a', topic: '支付系统维护' },
          { id: 'evt-2', tenantId: 'tenant-a', topic: '支付系统维护' },
          { id: 'evt-3', tenantId: 'tenant-a', topic: '区域天气' },
          { id: 'evt-bad', tenantId: 'tenant-a', topic: '' }
        ]
      }),
      checkpoint:
        '第一次回填创建 2 个主题、3 条关联并跳过 1 条坏记录；第二次新增都为 0。最后一行包含 topics=2 links=3 skipped=1 second-run=idempotent，并给出事务双写回滚策略。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 项目骨架、模块边界与本地环境': {
    title: 'Pulse 综合训练 05 · 多运行时边界与联调医生',
    description:
      '固定 Next、BFF、事件服务、Postgres 与 Redis 的依赖方向，再用环境清单检查端口、迁移、健康检查和本地启动顺序。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-05-guided-runtime-graph',
      title: '跟做：阻止前端直连数据库和 Redis',
      brief:
        '运行 node main.js。检查六个运行时和依赖边，验证 Next 只走 BFF/事件流，FastAPI 独占数据依赖，并识别越级边和环。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = new Set([
  'next->bff',
  'next->stream',
  'bff->event-service',
  'stream->event-service',
  'event-service->postgres',
  'event-service->redis',
  'collector->event-service',
  'garbage-collector->event-service'
]);
const violations = input.edges
  .map((edge) => edge.from + '->' + edge.to)
  .filter((edge) => !allowed.has(edge))
  .map((edge) => ({ edge, action: 'remove-or-route-through-approved-runtime' }));

const adjacency = new Map(input.runtimes.map((item) => [item.id, []]));
for (const edge of input.edges) adjacency.get(edge.from).push(edge.to);
function hasCycle() {
  const visiting = new Set();
  const visited = new Set();
  function walk(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node)) if (walk(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return input.runtimes.some((item) => walk(item.id));
}

assert.equal(violations.length, 2);
assert.ok(violations.some((item) => item.edge === 'next->postgres'));
assert.ok(violations.some((item) => item.edge === 'next->redis'));
assert.equal(hasCycle(), false);
assert.ok(input.edges.some((edge) => edge.from === 'garbage-collector'));

console.log(JSON.stringify({
  violations,
  cycle: hasCycle(),
  dependencyOrder: ['next', 'bff', 'stream', 'event-service', 'postgres', 'redis'],
  verdict: 'fix-runtime-boundary'
}, null, 2));
console.log('pulse-runtime: violations=2 cycle=false order=next>bff>event-service>data');
`,
      },
      stdin: JSON.stringify({
        runtimes: [
          { id: 'next', type: 'web' },
          { id: 'bff', type: 'node-bff' },
          { id: 'stream', type: 'sse-client' },
          { id: 'event-service', type: 'fastapi' },
          { id: 'postgres', type: 'database' },
          { id: 'redis', type: 'cache' },
          { id: 'garbage-collector', type: 'job' }
        ],
        edges: [
          { from: 'next', to: 'bff' },
          { from: 'next', to: 'stream' },
          { from: 'bff', to: 'event-service' },
          { from: 'stream', to: 'event-service' },
          { from: 'event-service', to: 'postgres' },
          { from: 'event-service', to: 'redis' },
          { from: 'garbage-collector', to: 'event-service' },
          { from: 'next', to: 'postgres' },
          { from: 'next', to: 'redis' }
        ]
      }),
      checkpoint:
        '必须识别 next->postgres 和 next->redis 两条越级边，确认依赖无环，并给出 Next/BFF/事件服务/数据的启动与调用顺序。最后一行包含 violations=2 cycle=false order=next>bff>event-service>data。',
    },
    apply: {
      id: 'p15-pulse-05-independent-dev-doctor',
      title: '独立实践：一条命令检查本地联调环境',
      brief:
        '运行 node main.js。检查端口、数据库迁移、Redis、事件服务健康、BFF 环境和启动顺序；故意缺少迁移且事件服务未就绪，输出可执行修复。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const issues = [];

for (const item of input.services) {
  const occupied = input.ports[item.port];
  if (occupied) {
    issues.push({
      area: 'port',
      target: item.name,
      code: 'PORT_IN_USE',
      fix: '停止 PID ' + occupied + '，或用 PULSE_' + item.name.toUpperCase() + '_PORT 改端口'
    });
  }
  if (!item.healthy) {
    issues.push({
      area: 'health',
      target: item.name,
      code: 'SERVICE_NOT_READY',
      fix: '先检查依赖健康，再执行 pnpm dev:' + item.name
    });
  }
}
if (!input.migrations.includes('20261124_add_event_cursor')) {
  issues.push({
    area: 'database',
    target: 'event_cursor',
    code: 'MIGRATION_MISSING',
    fix: '运行 pnpm db:migrate --to 20261124_add_event_cursor'
  });
}
if (input.startOrder[0] !== 'postgres' || input.startOrder.at(-1) !== 'next') {
  issues.push({ area: 'startup', target: 'order', code: 'START_ORDER_INVALID', fix: '按数据→事件服务→BFF→Next 启动' });
}

const blockers = issues.map((item) => item.code).sort();
assert.deepEqual(blockers, ['MIGRATION_MISSING', 'SERVICE_NOT_READY']);
assert.ok(issues.every((item) => item.fix.includes('pnpm') || item.fix.includes('按')));

console.log(JSON.stringify({
  ready: issues.length === 0,
  checks: input.services.length + 2,
  issues,
  expectedOrder: ['postgres', 'redis', 'event-service', 'bff', 'next']
}, null, 2));
console.log('pulse-doctor: blockers=MIGRATION_MISSING,SERVICE_NOT_READY ready=false');
`,
      },
      stdin: JSON.stringify({
        services: [
          { name: 'event-service', port: 8000, healthy: false },
          { name: 'bff', port: 3000, healthy: true },
          { name: 'next', port: 3001, healthy: true }
        ],
        ports: {},
        migrations: ['20261122_add_tenant_id'],
        startOrder: ['postgres', 'redis', 'event-service', 'bff', 'next']
      }),
      checkpoint:
        '必须只报告 MIGRATION_MISSING 与 SERVICE_NOT_READY 两个阻断，ready=false；修复动作包含具体 migrate 命令或启动命令。最后一行包含 blockers=MIGRATION_MISSING,SERVICE_NOT_READY ready=false。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 后端核心链路与异常恢复': {
    title: 'Pulse 综合训练 06 · 有界队列与缓存回源',
    description:
      '先让事件去重和有界发送队列在慢消费者下保持内存上限，再注入 Redis 故障，验证熔断、限流回源、陈旧缓存和恢复后的追平。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-06-guided-bounded-queue',
      title: '跟做：慢消费者不能拖垮事件服务',
      brief:
        '运行 node main.js。向一个有界发送队列投入六个事件，其中包含重复 id 和高优先级告警；队列满时弃旧保新，并记录发送、丢弃与积压数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
const queue = [];
const stats = { accepted: 0, duplicate: 0, dropped: 0 };
const delivered = [];

function enqueue(event) {
  if (seen.has(event.id)) {
    stats.duplicate += 1;
    return { status: 'duplicate', queueDepth: queue.length };
  }
  seen.add(event.id);
  if (queue.length >= input.queueLimit) {
    const removable = queue.findIndex((item) => item.priority !== 'high');
    if (removable >= 0) {
      queue.splice(removable, 1);
      stats.dropped += 1;
    } else {
      stats.dropped += 1;
      return { status: 'dropped-incoming', queueDepth: queue.length };
    }
  }
  queue.push(event);
  stats.accepted += 1;
  return { status: 'queued', queueDepth: queue.length };
}

function flush(max) {
  while (max > 0 && queue.length > 0) {
    delivered.push(queue.shift().id);
    max -= 1;
  }
}

const enqueueResults = input.events.map(enqueue);
assert.equal(Math.max(...enqueueResults.map((item) => item.queueDepth)), 3);
assert.equal(queue.length, 3);
assert.ok(queue.some((item) => item.id === 'evt-alert' && item.priority === 'high'));
assert.ok(!queue.some((item) => item.id === 'evt-2'));
assert.equal(stats.duplicate, 1);
flush(1);
assert.equal(delivered[0], 'evt-3');

console.log(JSON.stringify({ enqueueResults, stats, delivered, remaining: queue }, null, 2));
console.log('pulse-queue: accepted=3 duplicate=1 dropped=2 max-depth=3 high-priority=kept');
`,
      },
      stdin: JSON.stringify({
        queueLimit: 3,
        events: [
          { id: 'evt-1', title: '来源恢复', priority: 'normal' },
          { id: 'evt-2', title: '普通更新', priority: 'normal' },
          { id: 'evt-3', title: '热点更新', priority: 'normal' },
          { id: 'evt-alert', title: '高优先级告警', priority: 'high' },
          { id: 'evt-4', title: '官方回应', priority: 'normal' },
          { id: 'evt-1', title: '重复来源恢复', priority: 'normal' }
        ]
      }),
      checkpoint:
        '队列峰值必须为 3；重复 evt-1 被拒；evt-2 被弃，高优先级 evt-alert 保留，随后 evt-4 入队。最后一行包含 accepted=3 duplicate=1 dropped=2 max-depth=3 high-priority=kept。',
    },
    apply: {
      id: 'p15-pulse-06-independent-cache-fallback',
      title: '独立实践：Redis 故障时有界回源',
      brief:
        '运行 node main.js。模拟十倍请求压向故障 Redis，验证熔断后只允许有限数据库回源，其余请求返回陈旧缓存并标记来源，恢复后重新追平。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createCacheLayer() {
  let redisHealthy = false;
  let databaseCalls = 0;
  let circuit = 'open';
  const results = [];
  return {
    read(key) {
      if (redisHealthy) return { source: 'redis', key, value: 'fresh-' + key };
      if (circuit === 'open' && databaseCalls < input.fallbackLimit) {
        databaseCalls += 1;
        return { source: 'database', key, value: 'fresh-' + key };
      }
      return { source: 'stale-cache', key, value: input.stale[key], stale: true };
    },
    handle(requests) {
      for (const request of requests) results.push(this.read(request.key));
      return results;
    },
    recover() {
      redisHealthy = true;
      circuit = 'closed';
      return this.read(input.finalKey);
    },
    inspect() {
      return { redisHealthy, circuit, databaseCalls, served: results.length };
    }
  };
}

const layer = createCacheLayer();
const served = layer.handle(input.requests);
const recovered = layer.recover();
const state = layer.inspect();
const stale = served.filter((item) => item.source === 'stale-cache');

assert.equal(state.databaseCalls, 3);
assert.equal(stale.length, 9);
assert.ok(stale.every((item) => item.stale === true));
assert.equal(recovered.source, 'redis');
assert.equal(state.circuit, 'closed');

console.log(JSON.stringify({
  state,
  databaseSources: served.filter((item) => item.source === 'database').length,
  staleSources: stale.length,
  recovered,
  alarm: stale.length > 0 ? 'pulse_redis_degraded_stale_served' : null
}, null, 2));
console.log('pulse-cache-fallback: database=3 stale=9 recovered=redis circuit=closed');
`,
      },
      stdin: JSON.stringify({
        fallbackLimit: 3,
        stale: { 'topic-1': { score: 77, generatedAt: '2026-11-24T10:00:00Z' } },
        requests: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, key: 'topic-1' })),
        finalKey: 'topic-1'
      }),
      checkpoint:
        '12 次请求中只允许 3 次数据库回源，9 次返回带 stale 标记的旧缓存；Redis 恢复后 source=redis 且 circuit=closed。最后一行包含 database=3 stale=9 recovered=redis circuit=closed。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 前端页面、状态与可访问交互': {
    title: 'Pulse 综合训练 07 · 实时 reducer 与可访问摘要',
    description:
      '用 URL 驱动筛选与选择，按 id 去重插入事件，处理连接、陈旧和断线状态；再生成图表替代文本、aria-live 和键盘可达的驾驶舱片段。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-07-guided-stream-reducer',
      title: '跟做：实时事件、筛选和断线状态',
      brief:
        '运行 node main.js。按 URL、快照、实时事件、重复事件、断线和恢复动作更新状态，确保筛选保持、事件有序且每条新事件只出现一次。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const initial = { source: 'all', selected: null, connection: 'idle', events: [], stale: false };

function mergeEvents(existing, incoming) {
  const byId = new Map(existing.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => right.publishedAt - left.publishedAt || left.id.localeCompare(right.id));
}

function reducer(state, action) {
  if (action.type === 'URL_CHANGED') {
    return { ...state, source: action.source || 'all', selected: action.selected || null };
  }
  if (action.type === 'SNAPSHOT') {
    return { ...state, connection: 'open', events: mergeEvents([], action.events).filter((event) => state.source === 'all' || event.source === state.source) };
  }
  if (action.type === 'STREAM_EVENT') {
    const events = mergeEvents(state.events, [action.event]);
    return { ...state, events: events.filter((event) => state.source === 'all' || event.source === state.source), stale: false };
  }
  if (action.type === 'DISCONNECTED') {
    return { ...state, connection: 'reconnecting' };
  }
  if (action.type === 'RECONNECTED') {
    return { ...state, connection: 'open', stale: false };
  }
  if (action.type === 'SOURCE_STALE') {
    return { ...state, stale: true };
  }
  return state;
}

let state = initial;
const transition = [];
for (const action of input.actions) {
  state = reducer(state, action);
  transition.push({ type: action.type, count: state.events.length, connection: state.connection });
}

assert.deepEqual(state.events.map((event) => event.id), ['evt-3', 'evt-1']);
assert.equal(state.source, 'source-a');
assert.equal(state.events.filter((event) => event.id === 'evt-1').length, 1);
assert.equal(state.connection, 'open');
assert.equal(state.stale, false);

console.log(JSON.stringify({ transition, final: state }, null, 2));
console.log('pulse-ui-state: source=source-a events=evt-3,evt-1 duplicate=0 connection=open');
`,
      },
      stdin: JSON.stringify({
        actions: [
          { type: 'URL_CHANGED', source: 'source-a', selected: 'topic-payments' },
          {
            type: 'SNAPSHOT',
            events: [
              { id: 'evt-1', source: 'source-a', title: '维护开始', publishedAt: 100 },
              { id: 'evt-x', source: 'source-b', title: '其他来源', publishedAt: 90 }
            ]
          },
          { type: 'STREAM_EVENT', event: { id: 'evt-1', source: 'source-a', title: '维护开始更新', publishedAt: 100 } },
          { type: 'DISCONNECTED' },
          { type: 'SOURCE_STALE' },
          { type: 'RECONNECTED' },
          { type: 'STREAM_EVENT', event: { id: 'evt-3', source: 'source-a', title: '官方回应', publishedAt: 120 } }
        ]
      }),
      checkpoint:
        '最终只显示 source-a 的 evt-3 与 evt-1，evt-1 不重复且按 publishedAt 降序；断线后恢复为 open，reconnect 会清掉陈旧标记。最后一行包含 source=source-a events=evt-3,evt-1 duplicate=0 connection=open。',
    },
    apply: {
      id: 'p15-pulse-07-independent-accessible-dashboard',
      title: '独立实践：生成可访问驾驶舱摘要',
      brief:
        '运行 node main.js。把热点、趋势和来源健康生成语义化 HTML，提供图表文字摘要、aria-live、当前选择、键盘提示和颜色之外的状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const filters = input.filters.map((item) =>
  \`<button type="button" aria-pressed="\${item.id === input.activeFilter}">\${escapeHtml(item.label)}</button>\`
).join('');
const topicRows = input.topics.map((topic) =>
  \`<tr><th scope="row"><button type="button" aria-describedby="desc-\${topic.id}">\${escapeHtml(topic.title)}</button></th><td>\${topic.score}</td><td>\${escapeHtml(topic.health.label)}</td></tr>\\n\` +
  \`<tr id="desc-\${topic.id}"><td colspan="3"><span class="sr-only">趋势摘要：\${escapeHtml(topic.sparklineText)}；来源健康：\${escapeHtml(topic.health.detail)}</span></td></tr>\`
).join('');
const html = [
  '<a href="#dashboard">跳到热点表</a>',
  \`<nav aria-label="来源筛选">\${filters}</nav>\`,
  \`<main id="dashboard"><h1>\${escapeHtml(input.heading)}</h1>\`,
  '<p id="connection" role="status" aria-live="polite">实时流已连接；上次事件 10:04:23</p>',
  '<table><caption>热点按运营优先级排序，分数不代表事实结论</caption>',
  '<thead><tr><th>话题</th><th>辅助分</th><th>来源健康</th></tr></thead>',
  \`<tbody>\${topicRows}</tbody></table>\`,
  '<p>来源健康同时用文字和状态符号表达，不只用颜色。</p></main>'
].join('');

assert.match(html, /href="#dashboard"/);
assert.match(html, /aria-pressed="true"/);
assert.match(html, /role="status" aria-live="polite"/);
assert.match(html, /趋势摘要：上升/);
assert.match(html, /来源健康：2 个来源延迟低于 5 秒/);
assert.match(html, /分数不代表事实结论/);
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(html.includes('&lt;script&gt;'));

console.log(JSON.stringify({
  bytes: Buffer.byteLength(html),
  accessibleNames: input.topics.map((topic) => '查看 ' + topic.title),
  keyboardPath: ['跳过导航', '来源筛选', '热点按钮', '详情摘要'],
  stateChannels: ['文字', 'aria-live', 'aria-pressed', '表格结构']
}, null, 2));
console.log('pulse-a11y-dashboard: filters=2 rows=2 aria-live=1 chart-summary=1 escaped=1');
`,
      },
      stdin: JSON.stringify({
        heading: 'Pulse 实时热点 <script>alert(1)</script>',
        activeFilter: 'all',
        filters: [
          { id: 'all', label: '全部来源' },
          { id: 'official', label: '官方来源' }
        ],
        topics: [
          {
            id: 'payments',
            title: '支付系统维护',
            score: 88,
            sparklineText: '上升，过去十分钟从 42 增至 88',
            health: { label: '2/2 新鲜', detail: '2 个来源延迟低于 5 秒' }
          },
          {
            id: 'weather',
            title: '区域天气',
            score: 56,
            sparklineText: '平稳，过去十分钟维持 54 至 56',
            health: { label: '1/2 新鲜', detail: '1 个来源延迟超过 5 秒' }
          }
        ]
      }),
      checkpoint:
        'HTML 必须有跳转链接、aria-pressed、live status、两条图表文字摘要、来源健康文字解释和“分数不代表事实结论”；script 必须转义。最后一行包含 filters=2 rows=2 aria-live=1 chart-summary=1 escaped=1。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 联调、测试、安全与性能': {
    title: 'Pulse 综合训练 08 · 租户隔离与实时性能门禁',
    description:
      '先验证租户、角色和字段级授权，阻断跨租户读取与编辑，再根据首事件、慢消费者、恢复和内存样本做发布门禁。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-08-guided-tenant-auth',
      title: '跟做：跨租户请求必须像数据不存在',
      brief:
        '运行 node main.js。检查六次读/写请求的租户、对象权限和敏感字段，拒绝跨租户、分析员写入和未脱敏导出，并保持统一 404。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const permissions = {
  viewer: new Set(['events:read', 'topics:read']),
  analyst: new Set(['events:read', 'topics:read', 'analytics:read']),
  editor: new Set(['events:read', 'alerts:read', 'alerts:takeover', 'events:annotate'])
};

function authorize(request, event) {
  if (!permissions[request.role]?.has(request.permission)) {
    return { status: 403, code: 'ROLE_FORBIDDEN', audit: 'role-denied' };
  }
  if (event.tenantId !== request.tenantId) {
    return { status: 404, code: 'RESOURCE_NOT_FOUND', audit: 'cross-tenant-deny' };
  }
  if (request.permission === 'analytics:read' && request.includeContact) {
    return { status: 403, code: 'FIELD_FORBIDDEN', audit: 'contact-field-deny' };
  }
  return { status: 200, event: request.permission === 'analytics:read' ? { ...event, contact: undefined } : event };
}

const results = input.requests.map((request) => {
  const event = input.events.find((item) => item.id === request.eventId);
  return { requestId: request.id, role: request.role, ...authorize(request, event) };
});

assert.deepEqual(results.map((item) => item.status), [200, 200, 404, 403, 403, 200]);
assert.equal(results[2].code, 'RESOURCE_NOT_FOUND');
assert.equal(results[3].code, 'ROLE_FORBIDDEN');
assert.equal(results[4].code, 'FIELD_FORBIDDEN');
assert.equal(results[0].event.contact, 'ops@example.com');
assert.equal(results[5].event.contact, undefined);

console.log(JSON.stringify({ results }, null, 2));
console.log('pulse-auth: statuses=200,200,404,403,403,200 cross-tenant=hidden fields=redacted');
`,
      },
      stdin: JSON.stringify({
        events: [
          { id: 'event-a', tenantId: 'tenant-a', title: '支付维护', contact: 'ops@example.com' },
          { id: 'event-b', tenantId: 'tenant-b', title: '其他租户', contact: 'secret@example.com' }
        ],
        requests: [
          { id: 'r1', tenantId: 'tenant-a', role: 'editor', permission: 'events:read', eventId: 'event-a' },
          { id: 'r2', tenantId: 'tenant-a', role: 'editor', permission: 'alerts:takeover', eventId: 'event-a' },
          { id: 'r3', tenantId: 'tenant-a', role: 'editor', permission: 'events:read', eventId: 'event-b' },
          { id: 'r4', tenantId: 'tenant-a', role: 'analyst', permission: 'events:annotate', eventId: 'event-a' },
          { id: 'r5', tenantId: 'tenant-a', role: 'analyst', permission: 'analytics:read', eventId: 'event-a', includeContact: true },
          { id: 'r6', tenantId: 'tenant-a', role: 'analyst', permission: 'analytics:read', eventId: 'event-a' }
        ]
      }),
      checkpoint:
        '状态序列必须为 200、200、404、403、403、200；跨租户不泄露资源存在性，分析员不能写，请求联系人字段被字段级拒绝，普通分析读取中 contact 被移除。最后一行包含 statuses=200,200,404,403,403,200 cross-tenant=hidden fields=redacted。',
    },
    apply: {
      id: 'p15-pulse-08-independent-realtime-budget',
      title: '独立实践：用尾延迟和内存阻断实时发布',
      brief:
        '运行 node main.js。计算首事件 P95、恢复 P95、队列峰值和堆增量，复核契约与断线恢复，任何实时边界超限都要阻断。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function p95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

const metrics = {
  firstEventP95: p95(input.samples.firstEventMs),
  reconnectP95: p95(input.samples.reconnectMs),
  queueMax: Math.max(...input.samples.queueDepth),
  heapGrowthMb: input.samples.heapAfterMb - input.samples.heapBeforeMb,
  contractFailures: input.contract.failures,
  missingLastEventId: input.disconnect.lastEventId ? 0 : 1
};
const checks = [
  { name: 'first-event', pass: metrics.firstEventP95 < 1000, actual: metrics.firstEventP95, limit: 1000 },
  { name: 'reconnect', pass: metrics.reconnectP95 <= 3000, actual: metrics.reconnectP95, limit: 3000 },
  { name: 'queue', pass: metrics.queueMax <= 20, actual: metrics.queueMax, limit: 20 },
  { name: 'heap', pass: metrics.heapGrowthMb <= 80, actual: metrics.heapGrowthMb, limit: 80 },
  { name: 'contract', pass: metrics.contractFailures === 0, actual: metrics.contractFailures, limit: 0 },
  { name: 'resume-cursor', pass: metrics.missingLastEventId === 0, actual: metrics.missingLastEventId, limit: 0 }
];
const blockers = checks.filter((item) => !item.pass);

assert.deepEqual(blockers.map((item) => item.name), ['heap']);
assert.equal(metrics.firstEventP95, 940);
assert.equal(metrics.reconnectP95, 2800);
assert.equal(metrics.queueMax, 20);
assert.equal(metrics.heapGrowthMb, 96);
assert.equal(input.failingConsumer, 'consumer-slow');

console.log(JSON.stringify({
  metrics,
  checks,
  blockers,
  diagnosis: {
    consumer: input.failingConsumer,
    evidence: 'queue 达到上限后堆仍增长 96MB，说明已发送事件对象仍被闭包引用',
    nextAction: '释放 ack 后的事件引用，并把队列降为 12 条做 30 分钟浸水'
  },
  verdict: 'block-release'
}, null, 2));
console.log('pulse-performance: blockers=heap first-event-p95=940 reconnect-p95=2800 heap-growth=96MB');
`,
      },
      stdin: JSON.stringify({
        samples: {
          firstEventMs: [720, 940, 810, 990, 760, 780, 820, 900, 860, 880, 830, 870, 910, 850, 890, 920, 800, 840, 930, 770],
          reconnectMs: [1800, 2800, 2400, 2100, 2600, 2200, 2300, 2500, 2700, 2000],
          queueDepth: [8, 14, 18, 20, 13, 11, 19, 16, 12, 15],
          heapBeforeMb: 118,
          heapAfterMb: 214
        },
        contract: { failures: 0 },
        disconnect: { lastEventId: 'evt-42' },
        failingConsumer: 'consumer-slow'
      }),
      checkpoint:
        'P95 必须为 first-event=940、reconnect=2800；队列峰值 20 恰好允许，但堆增量 96MB 超过 80MB，唯一阻断为 heap。最后一行包含 blockers=heap 与全部关键数值，不能使用平均值掩盖。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 容器、CI/CD、可观测与发布': {
    title: 'Pulse 综合训练 09 · 独立制品与流式发布',
    description:
      '为 Web、事件服务与采集器生成独立制品和健康检查，再在不丢游标的前提下执行连接排空、灰度和失败回滚。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-09-guided-artifacts-health',
      title: '跟做：拆清 liveness、readiness 与制品',
      brief:
        '运行 node main.js。为三个服务生成内容哈希和版本清单，检查 liveness/readiness 依赖并验证事件流在新 schema 下保留旧消费者窗口。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const artifacts = Object.entries(input.services).map(([name, service]) => ({
  name,
  version: service.version,
  digest: hash(service.files.map((file) => file.path + ':' + hash(file.content)).join('|')),
  image: 'registry.local/' + name + ':' + service.version,
  liveness: service.liveness,
  readiness: service.readiness,
  drainsStream: service.drainsStream
}));

function readiness(service) {
  return service.dependencies.every((dependency) => input.health[dependency] === 'ready');
}

const readinessResults = Object.fromEntries(Object.entries(input.services).map(([name, service]) => [name, readiness(service)]));
assert.equal(new Set(artifacts.map((item) => item.digest)).size, 3);
assert.ok(artifacts.every((item) => item.digest.length === 64));
assert.equal(readinessResults['event-service'], true);
assert.equal(readinessResults.collector, false);
assert.ok(artifacts.find((item) => item.name === 'event-service').liveness !== artifacts.find((item) => item.name === 'event-service').readiness);
assert.equal(input.schema.newEventVersion, 2);
assert.equal(input.schema.minConsumerVersion, 1);

console.log(JSON.stringify({
  artifacts,
  readiness: readinessResults,
  schemaWindow: {
    producerVersion: input.schema.newEventVersion,
    minimumConsumerVersion: input.schema.minConsumerVersion,
    behavior: 'v2 事件同时包含 v1 必需字段，旧消费者继续可读'
  }
}, null, 2));
console.log('pulse-release: artifacts=3 unique-digests=true readiness=2/3 schema-v1-window=open');
`,
      },
      stdin: JSON.stringify({
        services: {
          next: {
            version: '2026.11.24.1',
            files: [{ path: 'app/page.tsx', content: 'export default function Page(){return null}' }],
            liveness: 'http:3001/healthz',
            readiness: '依赖 bff',
            dependencies: ['bff'],
            drainsStream: false
          },
          'event-service': {
            version: '2026.11.24.1',
            files: [{ path: 'app/main.py', content: 'app = FastAPI()' }],
            liveness: 'http:8000/live',
            readiness: 'postgres+redis',
            dependencies: ['postgres', 'redis'],
            drainsStream: true
          },
          collector: {
            version: '2026.11.24.1',
            files: [{ path: 'collector/main.go', content: 'package main' }],
            liveness: 'http:9000/live',
            readiness: 'event-service',
            dependencies: ['event-service', 'source-feed'],
            drainsStream: false
          }
        },
        health: { bff: 'ready', postgres: 'ready', redis: 'ready', 'event-service': 'ready', 'source-feed': 'degraded' },
        schema: { newEventVersion: 2, minConsumerVersion: 1 }
      }),
      checkpoint:
        '三个服务必须各自有唯一 64 位 SHA-256；事件服务 readiness 为 true、collector 因 source-feed degraded 为 false；liveness 只看进程，readiness 看依赖。最后一行包含 artifacts=3 unique-digests=true readiness=2/3 schema-v1-window=open。',
    },
    apply: {
      id: 'p15-pulse-09-independent-blue-green',
      title: '独立实践：带游标排空的灰度发布',
      brief:
        '运行 node main.js。按冻结写入、排空连接、切换绿版本、观察消费者错误执行发布；错误超阈值时保留游标并回滚蓝版本。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function deploy(release) {
  const timeline = [];
  let active = input.blue;
  let phase = 'running';
  let cursor = input.cursor;
  for (const step of input.plan) {
    if (step === 'freeze-writes') {
      phase = 'writes-frozen';
      timeline.push({ step, cursor });
    }
    if (step === 'drain-streams') {
      cursor = input.lastDeliveredEventId;
      timeline.push({ step, cursor, openConnections: 0 });
    }
    if (step === 'promote-green') {
      active = release;
      phase = 'observing';
      timeline.push({ step, active });
    }
    if (step === 'observe-consumers') {
      const failures = input.observation.consumerFailures;
      if (failures > input.observation.maxFailures) {
        const failedRelease = active;
        active = input.blue;
        phase = 'rolled-back';
        timeline.push({ step, failures, failedRelease, active, cursor });
        return { timeline, active, phase, cursor, healthy: false };
      }
      phase = 'healthy';
      timeline.push({ step, failures, active, cursor });
    }
  }
  return { timeline, active, phase, cursor, healthy: true };
}

const result = deploy(input.green);

assert.equal(result.phase, 'rolled-back');
assert.equal(result.active, input.blue);
assert.equal(result.cursor, 'evt-1042');
assert.equal(result.timeline.find((item) => item.step === 'drain-streams').openConnections, 0);
assert.equal(result.timeline.find((item) => item.step === 'observe-consumers').failures, 7);
assert.equal(result.healthy, false);

console.log(JSON.stringify({
  result,
  incident: {
    failedRelease: input.green,
    reason: 'consumer failure threshold exceeded',
    resumeFromCursor: result.cursor,
    activeRelease: result.active
  }
}, null, 2));
console.log('pulse-bluegreen: drained=true green-failures=7 active=' + result.active + ' cursor=evt-1042 rolled-back=true');
`,
      },
      stdin: JSON.stringify({
        blue: 'event-service-blue-2026.11.23.5',
        green: 'event-service-green-2026.11.24.1',
        cursor: 'evt-1038',
        lastDeliveredEventId: 'evt-1042',
        plan: ['freeze-writes', 'drain-streams', 'promote-green', 'observe-consumers'],
        observation: { consumerFailures: 7, maxFailures: 2 },
        schemaCompatible: true
      }),
      checkpoint:
        '发布必须执行连接排空到 evt-1042，绿版本消费者失败 7 次超过上限 2，随后回滚蓝版本；恢复游标仍为 evt-1042。最后一行包含 drained=true green-failures=7 active=蓝版本 cursor=evt-1042 rolled-back=true。',
    },
  },

  'programming:综合训练 · Pulse 实时驾驶舱 · 故障演练、回滚与项目答辩': {
    title: 'Pulse 综合训练 10 · 多故障演练与事故复盘',
    description:
      '对来源陈旧、Redis 故障和 SSE 连接泄洪做隔离与降级，再根据真实时间线计算检测恢复时长，验证根因链和行动项可复核。',
    ...nodeRuntime,
    practice: {
      id: 'p15-pulse-10-guided-incident-runbook',
      title: '跟做：三类实时故障的止血顺序',
      brief:
        '运行 node main.js。对来源停止更新、Redis 超时和 SSE 连接泄洪生成分级、用户提示、保护开关、恢复条件和证据要求。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const runbook = {
  staleSource: {
    severity: 'medium',
    containment: '标记来源 stale，展示最后更新时间，继续显示其他新鲜来源',
    recovery: '连续两个心跳窗口恢复且延迟低于 5 秒',
    evidence: ['source_id', 'last_seen_at', '页面 stale 标识']
  },
  redisOutage: {
    severity: 'high',
    containment: '熔断 Redis，只允许有界回源，其余请求返回限时 stale 缓存',
    recovery: 'Redis ping 与读写探针通过，回源计数回到基线',
    evidence: ['redis_timeout', 'fallback_count', 'stale_ratio']
  },
  sseFlood: {
    severity: 'critical',
    containment: '按租户/IP 限制连接，淘汰最慢连接，保持健康用户事件流',
    recovery: '连接数低于上限且 5 分钟内无 OOM/拒绝率异常',
    evidence: ['open_connections', 'evicted_consumers', 'heap_mb']
  }
};
const incidents = input.incidents.map((incident) => ({ ...incident, ...runbook[incident.type] }));
incidents.sort((left, right) => ({ critical: 0, high: 1, medium: 2 })[left.severity] - ({ critical: 0, high: 1, medium: 2 })[right.severity]);

assert.deepEqual(incidents.map((item) => item.type), ['sseFlood', 'redisOutage', 'staleSource']);
assert.ok(incidents.every((item) => item.containment && item.recovery && item.evidence.length >= 3));
assert.ok(incidents.find((item) => item.type === 'redisOutage').containment.includes('有界回源'));
assert.ok(incidents.find((item) => item.type === 'sseFlood').containment.includes('淘汰最慢连接'));

console.log(JSON.stringify({ incidents, firstAction: '保护事件服务连接上限，再处理缓存与来源' }, null, 2));
console.log('pulse-runbook: critical=1 high=1 medium=1 first=sseFlood evidence=complete');
`,
      },
      stdin: JSON.stringify({
        incidents: [
          { id: 'inc-redis', type: 'redisOutage', startedAt: '10:02', impact: '热点查询延迟 8s' },
          { id: 'inc-source', type: 'staleSource', startedAt: '10:00', impact: '一个来源 90 秒无事件' },
          { id: 'inc-sse', type: 'sseFlood', startedAt: '10:04', impact: '连接数 5 分钟翻四倍' }
        ]
      }),
      checkpoint:
        '顺序必须为 sseFlood、redisOutage、staleSource，对应 critical/high/medium；每条含止血、恢复条件与至少三项证据，Redis 明确有界回源。最后一行包含 critical=1 high=1 medium=1 first=sseFlood evidence=complete。',
    },
    apply: {
      id: 'p15-pulse-10-independent-postmortem',
      title: '独立实践：从事故日志还原根因与时间',
      brief:
        '运行 node main.js。校验事件时间线，计算 MTTD/MTTR，串联连接增长、队列内存、无效重连和 OOM，拒绝无主行动项并给出答辩证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const logs = [...input.logs].sort((left, right) => left.minute - right.minute);
const required = ['first-anomaly', 'detected', 'mitigated', 'recovered'];
for (const type of required) assert.ok(logs.some((item) => item.type === type), '缺少 ' + type);
const at = Object.fromEntries(logs.map((item) => [item.type, item.minute]));
const mttd = at.detected - at['first-anomaly'];
const mttr = at.recovered - at['first-anomaly'];
const rejected = input.actions.filter((action) => !action.owner || !action.due || !action.verification);
const accepted = input.actions.filter((action) => !rejected.includes(action));

assert.deepEqual(logs.map((item) => item.type), required);
assert.equal(mttd, 3);
assert.equal(mttr, 19);
assert.equal(rejected.length, 1);
assert.equal(accepted.length, 2);
assert.ok(input.actions.some((action) => action.verification.includes('连接数')));

console.log(JSON.stringify({
  mttdMinutes: mttd,
  mttrMinutes: mttr,
  causalChain: [
    '客户端网络抖动后无上限重连',
    '事件服务连接数快速增长，每连接保留独立发送缓冲区',
    '慢消费者队列达到上限但旧事件仍被闭包引用',
    '堆内存越过容器限制触发 OOM，所有租户短时断线'
  ],
  rejectedActions: rejected,
  acceptedActions: accepted,
  defenceEvidence: [
    '重连曲线与连接上限配置',
    '队列深度、堆增量与 evicted_consumers 指标',
    '恢复后的 30 分钟浸水与租户隔离验证'
  ]
}, null, 2));
console.log('pulse-postmortem: mttd=3 mttr=19 rejected-actions=1 accepted-actions=2 causal-chain=4');
`,
      },
      stdin: JSON.stringify({
        logs: [
          { type: 'first-anomaly', minute: 0, detail: '重连速率从 12/min 升至 90/min' },
          { type: 'detected', minute: 3, detail: '连接数告警与 502 同时触发' },
          { type: 'mitigated', minute: 11, detail: '限流重连并重启绿色实例' },
          { type: 'recovered', minute: 19, detail: '各租户实时流恢复且堆稳定' }
        ],
        actions: [
          {
            text: '按租户限制并发连接并加入指数退避',
            owner: '实时平台组',
            due: '2026-11-27',
            verification: '故障注入 2000 个客户端时连接数不超过阈值'
          },
          {
            text: '增加慢消费者压测',
            owner: '',
            due: '2026-11-29',
            verification: '观察堆内存'
          },
          {
            text: '队列淘汰后释放事件引用并增加 heap 预算告警',
            owner: '事件服务组',
            due: '2026-11-28',
            verification: '30 分钟浸水 heap 增量低于 80MB'
          }
        ]
      }),
      checkpoint:
        '必须算出 MTTD=3 分钟、MTTR=19 分钟，根因链包含无上限重连、连接缓冲、闭包滞留和 OOM；1 条无负责人行动被拒，2 条可验证行动保留。最后一行包含 mttd=3 mttr=19 rejected-actions=1 accepted-actions=2 causal-chain=4。',
    },
  },
};
