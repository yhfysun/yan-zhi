import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装第三方依赖。',
    '代码从 stdin 读取本任务提供的确定性输入。',
    '运行代码并对照 checkpoint 检查断言结果与退出码。',
  ],
  languages: ['javascript'],
} as const;

type NodeTaskSpec = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly checkpoint: string;
  readonly code: string;
};

function nodeTask(spec: NodeTaskSpec): LearningV2CodeLabTask {
  return {
    id: spec.id,
    title: spec.title,
    brief: spec.brief,
    defaultLanguage: 'javascript',
    starterCode: { javascript: spec.code },
    stdin: spec.stdin,
    checkpoint: spec.checkpoint,
  };
}

function engineeringLab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return { title, description, ...nodeRuntime, practice, apply };
}

export const LEARNING_CODE_LABS_ENGINEERING_ADVANCED: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:测试与工程质量 · 测试思维、可观察行为与第一组测试：正常、边界、错误和恢复': engineeringLab(
    '工程质量代码台 13 · 从输入分区走到可恢复状态',
    '先用输入分区锁定重试预算的正常、边界和错误样本，再演练一次失败提交后的回滚、锁释放与重放。',
    nodeTask({
      id: 'eng2-partitions-guided',
      title: '跟做：把输入分成四类而不是只写一个成功样例',
      brief:
        '运行 node main.js。读取 stdin 中的重试预算用例，按 normal、boundary、invalid 分类，断言 0、3、5 是边界，6 与小数被拒绝。',
      stdin: `{
  "accepted": [0, 1, 2, 3, 4, 5],
  "invalid": [-1, 0.5, 6, "three", null]
}`,
      checkpoint:
        '输出必须包含 normal=4、boundary=2、invalid=5，并打印 partition evidence: accepted=6 rejected=5。边界测试验证闭区间两端，错误测试确认类型和越界不会进入业务计算。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function classify(value) {
  if (!Number.isInteger(value) || value < 0 || value > 5) return 'invalid';
  if (value === 0 || value === 5) return 'boundary';
  return 'normal';
}

function accepts(value) {
  return classify(value) !== 'invalid';
}

const observed = [...input.accepted, ...input.invalid].map((value) => ({
  value,
  partition: classify(value)
}));

assert.equal(input.accepted.every(accepts), true);
assert.equal(input.invalid.every((value) => !accepts(value)), true);
assert.equal(classify(0), 'boundary');
assert.equal(classify(5), 'boundary');
assert.equal(classify(1), 'normal');
assert.equal(classify(6), 'invalid');

const counts = observed.reduce((result, entry) => {
  result[entry.partition] += 1;
  return result;
}, { normal: 0, boundary: 0, invalid: 0 });

assert.deepEqual(counts, { normal: 4, boundary: 2, invalid: 5 });
console.log(JSON.stringify({ counts, cases: observed }, null, 2));
console.log('partition evidence: accepted=6 rejected=5');
`,
    }),
    nodeTask({
      id: 'eng2-recovery-independent',
      title: '独立实践：失败提交必须回到可重放状态',
      brief:
        '运行 node main.js。执行 write、fail、rollback、retry、commit 状态序列，断言失败前写入被撤销、锁只释放一次且第二次提交成功。',
      stdin: `{
  "operationId": "pay-2048",
  "events": ["begin", "write-temp", "commit-fail", "rollback", "retry", "commit"]
}`,
      checkpoint:
        '最终输出 committed=true、temporaryRows=0、activeLocks=0、attempts=2。任何异常路径都必须同时证明数据恢复和资源释放，不能只断言捕获了异常。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const state = {
  committedRows: [],
  temporaryRows: [],
  activeLocks: new Set(),
  attempts: 0,
  committed: false
};

for (const event of input.events) {
  if (event === 'begin') {
    assert.equal(state.activeLocks.has(input.operationId), false, '同一操作不能重复加锁');
    state.activeLocks.add(input.operationId);
  }
  if (event === 'write-temp') {
    state.temporaryRows.push({ operationId: input.operationId, cents: 2599 });
  }
  if (event === 'commit-fail') {
    assert.equal(state.temporaryRows.length, 1, '失败必须发生在已写入临时数据之后');
  }
  if (event === 'rollback') {
    state.temporaryRows = [];
    assert.equal(state.activeLocks.delete(input.operationId), true, '回滚只释放本操作持有的锁');
  }
  if (event === 'retry') {
    state.attempts += 1;
    state.activeLocks.add(input.operationId);
    state.temporaryRows.push({ operationId: input.operationId, cents: 2599 });
  }
  if (event === 'commit') {
    state.attempts += 1;
    state.committedRows.push(...state.temporaryRows);
    state.temporaryRows = [];
    state.activeLocks.delete(input.operationId);
    state.committed = true;
  }
}

assert.equal(state.committed, true);
assert.equal(state.attempts, 2);
assert.equal(state.committedRows.length, 1);
assert.equal(state.temporaryRows.length, 0);
assert.equal(state.activeLocks.size, 0);

console.log(JSON.stringify({
  operationId: input.operationId,
  committed: state.committed,
  attempts: state.attempts,
  committedRows: state.committedRows.length,
  temporaryRows: state.temporaryRows.length,
  activeLocks: state.activeLocks.size
}, null, 2));
console.log('recovery evidence: data-restored lock-released replay-succeeded');
`,
    }),
  ),

  'programming:测试与工程质量 · 测试思维、可观察行为与第一组测试：AAA 结构与测试命名': engineeringLab(
    '工程质量代码台 14 · 让测试结构、名称和失败信息可审查',
    '把 AAA 结构变成可执行约束，并校验断言失败时是否给出期望、实际和业务上下文。',
    nodeTask({
      id: 'eng2-aaa-guided',
      title: '跟做：三段式结构不能隐藏准备动作',
      brief:
        '运行 node main.js。读取测试记录，要求每条记录只有一个 arrange、至少一个 act 和一个 assert，且名称先描述行为再给出结果。',
      stdin: `{
  "tests": [
    {"name": "rejects expired coupon", "phases": ["arrange", "act", "assert"]},
    {"name": "keeps order unpaid after card decline", "phases": ["arrange", "act", "assert", "assert"]},
    {"name": "works", "phases": ["act", "assert"]}
  ]
}`,
      checkpoint:
        '第一条通过结构检查，第二条允许多个断言，第三条因名称过于含糊且缺少 arrange 被拒绝。输出必须给出 invalid=1、accepted=2。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function validate(test) {
  const reasons = [];
  const arrange = test.phases.filter((phase) => phase === 'arrange').length;
  const act = test.phases.filter((phase) => phase === 'act').length;
  const assertion = test.phases.filter((phase) => phase === 'assert').length;
  if (arrange !== 1) reasons.push('arrange count must be 1');
  if (act !== 1) reasons.push('act count must be 1');
  if (assertion < 1) reasons.push('assert count must be positive');
  if (test.name.trim().split(/\\s+/).length < 3) reasons.push('test name is too vague');
  return { name: test.name, accepted: reasons.length === 0, reasons };
}

const results = input.tests.map(validate);
assert.deepEqual(results.map((item) => item.accepted), [true, true, false]);
assert.deepEqual(results[2].reasons, ['arrange count must be 1', 'test name is too vague']);

const accepted = results.filter((item) => item.accepted).length;
assert.equal(accepted, 2);
console.log(JSON.stringify({ accepted, invalid: results.length - accepted, results }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-failure-context-independent',
      title: '独立实践：断言失败要能直接定位业务问题',
      brief:
        '运行 node main.js。校验每条断言都包含 expected、actual 和 context，并模拟折扣上限失败，输出可读的失败摘要。',
      stdin: `{
  "assertions": [
    {"id": "A-1", "expected": 100, "actual": 100, "context": "member-tier discount cap"},
    {"id": "A-2", "expected": 100, "actual": 180, "context": "member-tier discount cap"},
    {"id": "A-3", "expected": 100, "actual": 180}
  ]
}`,
      checkpoint:
        '必须得到 missingContext=[A-3]、failures=[A-2]，并在摘要中原样展示 expected=100 actual=180 context=member-tier discount cap。缺少上下文的断言先被识别为测试质量问题，不进入业务失败统计。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const missingContext = input.assertions
  .filter((item) => !item.context)
  .map((item) => item.id);
const complete = input.assertions.filter((item) => item.context);
assert.equal(missingContext.length, 1);

const failures = complete
  .filter((item) => !Object.is(item.expected, item.actual))
  .map((item) => ({
    id: item.id,
    summary: 'expected=' + item.expected + ' actual=' + item.actual + ' context=' + item.context
  }));

assert.deepEqual(missingContext, ['A-3']);
assert.deepEqual(failures.map((item) => item.id), ['A-2']);
assert.match(failures[0].summary, /expected=100 actual=180 context=member-tier discount cap/);

console.log(JSON.stringify({ missingContext, failures }, null, 2));
console.log(failures[0].summary);
`,
    }),
  ),

  'programming:测试与工程质量 · 单元测试、测试替身与属性测试：参数化、表驱动和边界值': engineeringLab(
    '工程质量代码台 15 · 表驱动样例与生成式边界',
    '用一张可追踪的样例表覆盖运费规则，再用固定种子生成大量值证明百分比钳制的不变量。',
    nodeTask({
      id: 'eng2-table-guided',
      title: '跟做：每个参数组合都能追溯到风险',
      brief:
        '运行 node main.js。从 stdin 读取运费样例表，逐项执行金额、会员与区域规则，断言数量、期望值和失败清单。',
      stdin: `{
  "cases": [
    {"id": "S-01", "subtotal": 1000, "member": false, "zone": "near", "expected": 500},
    {"id": "S-02", "subtotal": 1000, "member": true, "zone": "near", "expected": 300},
    {"id": "S-03", "subtotal": 4999, "member": true, "zone": "remote", "expected": 500},
    {"id": "S-04", "subtotal": 5000, "member": false, "zone": "remote", "expected": 0}
  ]
}`,
      checkpoint:
        '四行样例必须全部通过，输出 total=4 failed=[]，并打印每行 case id 与 result。把数据表和实现分开，审阅者能直接判断新增行是否覆盖业务边界。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function shipping(subtotal, member, zone) {
  assert.ok(['near', 'remote'].includes(zone));
  let cents = subtotal >= 5000 ? 0 : 500;
  if (zone === 'remote' && cents > 0) cents += 200;
  if (member && cents > 0) cents = Math.max(0, cents - 200);
  return cents;
}

const results = input.cases.map((entry) => ({
  id: entry.id,
  expected: entry.expected,
  actual: shipping(entry.subtotal, entry.member, entry.zone)
}));
const failed = results.filter((entry) => entry.expected !== entry.actual);

assert.equal(results.length, 4);
assert.deepEqual(failed, []);
console.log(JSON.stringify({ total: results.length, failed, results }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-fuzz-clamp-independent',
      title: '独立实践：生成输入验证钳制函数的三条性质',
      brief:
        '运行 node main.js。用固定种子生成 500 个数字与字符串输入，验证结果在 0 到 100、幂等、且合法数字保持单调关系。',
      stdin: `{
  "seed": 7319,
  "samples": 500,
  "fixed": [-10, 0, 0.25, 50, 99.9, 100, 130]
}`,
      checkpoint:
        '输出 samples=500 invariants=3 failures=0。若生成器产生失败，必须保留 seed 与最小反例，使下次运行可以复现，而不是只报告随机失败。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function randomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

const random = randomFactory(input.seed);
const generated = [...input.fixed];
for (let index = 0; index < input.samples - input.fixed.length; index += 1) {
  generated.push((random() * 240) - 40);
}

for (const value of generated) {
  const result = clampPercent(value);
  assert.ok(result >= 0 && result <= 100, 'range property');
  assert.equal(clampPercent(result), result, 'idempotence property');
}

const ascending = [...generated].sort((left, right) => left - right);
for (let index = 1; index < ascending.length; index += 1) {
  assert.ok(clampPercent(ascending[index - 1]) <= clampPercent(ascending[index]), 'monotonicity property');
}

const observed = generated.map(clampPercent);
console.log(JSON.stringify({
  seed: input.seed,
  samples: generated.length,
  min: Math.min(...observed),
  max: Math.max(...observed),
  invariants: ['range', 'idempotence', 'monotonicity']
}, null, 2));
console.log('fuzz evidence: samples=' + generated.length + ' invariants=3 failures=0');
`,
    }),
  ),

  'programming:测试与工程质量 · 集成、数据库与契约测试：集成测试边界与容器依赖': engineeringLab(
    '工程质量代码台 16 · 明确集成边界与容器就绪',
    '先审查测试套件是否把单元测试、容器集成和外部服务混在一起，再模拟容器启动重试、健康检查与清理。',
    nodeTask({
      id: 'eng2-integration-boundary-guided',
      title: '跟做：测试尺寸由真实资源决定',
      brief:
        '运行 node main.js。读取测试矩阵，要求 unit 不依赖进程外资源，integration 只使用本地容器，external 必须显式隔离。',
      stdin: `{
  "tests": [
    {"id": "T-1", "size": "unit", "resources": ["cpu"], "isolation": "process"},
    {"id": "T-2", "size": "integration", "resources": ["postgres-container", "localhost"], "isolation": "container"},
    {"id": "T-3", "size": "integration", "resources": ["prod-payment-api"], "isolation": "shared"}
  ]
}`,
      checkpoint:
        'T-1、T-2 通过，T-3 因依赖生产外部服务且隔离级别为 shared 被标记为违规。输出 accepted=2 violations=1，并解释失败不会靠重试掩盖。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function inspect(test) {
  const violations = [];
  const external = test.resources.some((name) => /prod-|public-internet|shared-db/.test(name));
  if (test.size === 'unit' && test.resources.some((name) => name !== 'cpu')) {
    violations.push('unit test uses process-external resource');
  }
  if (test.size === 'integration' && test.isolation !== 'container' && test.isolation !== 'fake') {
    violations.push('integration test is not isolated');
  }
  if (external) violations.push('external dependency is not contract-simulated');
  return { id: test.id, accepted: violations.length === 0, violations };
}

const inspected = input.tests.map(inspect);
const accepted = inspected.filter((item) => item.accepted).length;
const violations = inspected.filter((item) => !item.accepted);
assert.equal(accepted, 2);
assert.deepEqual(violations.map((item) => item.id), ['T-3']);
assert.equal(violations[0].violations.length, 2);

console.log(JSON.stringify({ accepted, violations: violations.length, results: inspected }, null, 2));
console.log('isolation rule: no retries may hide a shared production dependency');
`,
    }),
    nodeTask({
      id: 'eng2-container-readiness-independent',
      title: '独立实践：容器重试后成功且 finally 必须清理',
      brief:
        '运行 node main.js。模拟前两次健康检查返回 starting、第三次 ready；验证重试上限、总耗时、连接清理和失败时的确定退出码。',
      stdin: `{
  "maxAttempts": 4,
  "delaysMs": [25, 50, 100],
  "health": ["starting", "starting", "ready"]
}`,
      checkpoint:
        '输出 attempts=3 ready=true cleanup=released。若健康序列耗尽仍非 ready，代码必须抛错并在 finally 中执行 cleanup；成功路径也不能泄漏连接。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

let attempts = 0;
let ready = false;
let cleanup = 'not-started';
let totalDelay = 0;

try {
  while (attempts < input.maxAttempts && !ready) {
    const status = input.health[attempts];
    assert.ok(status, 'health probe sequence exhausted');
    attempts += 1;
    if (status === 'ready') {
      ready = true;
      break;
    }
    assert.equal(status, 'starting');
    const delay = input.delaysMs[attempts - 1] ?? input.delaysMs.at(-1);
    assert.ok(Number.isInteger(delay) && delay > 0);
    totalDelay += delay;
  }
  assert.equal(ready, true);
} finally {
  cleanup = 'released';
}

assert.equal(attempts, 3);
assert.equal(totalDelay, 75);
assert.equal(cleanup, 'released');
console.log(JSON.stringify({ attempts, ready, totalDelay, cleanup }, null, 2));
`,
    }),
  ),

  'programming:测试与工程质量 · 浏览器 E2E、组件与可访问性：Playwright 定位、等待和隔离': engineeringLab(
    '工程质量代码台 17 · 浏览器定位、等待与并行隔离',
    '审查定位器是否依赖用户可见语义并拒绝任意睡眠，再模拟两个并行 E2E 上下文使用独立存储与 trace。',
    nodeTask({
      id: 'eng2-locator-guided',
      title: '跟做：定位器要能跟随重构',
      brief:
        '运行 node main.js。读取定位与等待计划，要求按钮用 role 和 name 定位、无固定 sleep、断言使用可见或启用状态。',
      stdin: `{
  "steps": [
    {"action": "click", "role": "button", "name": "提交订单", "waitFor": "visible"},
    {"action": "fill", "label": "优惠券代码", "value": "SAVE20", "waitFor": "enabled"},
    {"action": "click", "selector": ".btn-primary", "sleepMs": 3000}
  ]
}`,
      checkpoint:
        '前两步通过；第三步因 CSS 实现定位、固定睡眠和缺少可访问角色/名称被拒绝。输出 approved=2 rejected=1，并强调等待应绑定可观察状态或具体响应。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function inspect(step) {
  const reasons = [];
  if (Object.hasOwn(step, 'selector')) reasons.push('CSS selector couples the test to implementation');
  if (Object.hasOwn(step, 'sleepMs')) reasons.push('fixed sleep is not an observable wait condition');
  if (step.action === 'click' && (!step.role || !step.name)) reasons.push('click requires accessible role and name');
  if (step.action === 'fill' && (!step.label || !step.waitFor)) reasons.push('fill requires label and readiness state');
  if (step.waitFor && !['visible', 'enabled', 'response'].includes(step.waitFor)) reasons.push('unknown wait state');
  return { step, approved: reasons.length === 0, reasons };
}

const results = input.steps.map(inspect);
const approved = results.filter((item) => item.approved).length;
const rejected = results.filter((item) => !item.approved);
assert.equal(approved, 2);
assert.equal(rejected.length, 1);
assert.equal(rejected[0].reasons.length, 3);
console.log(JSON.stringify({ approved, rejected: rejected.length, results }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-e2e-isolation-independent',
      title: '独立实践：并行浏览器上下文不共享状态',
      brief:
        '运行 node main.js。启动两个逻辑 worker，分别写入不同账号的本地存储并生成 trace；交错执行事件，验证没有跨 worker 读取。',
      stdin: `{
  "workers": [
    {"id": "worker-a", "account": "buyer-a", "storage": {"token": "token-a"}, "events": ["setup", "open", "assert"]},
    {"id": "worker-b", "account": "buyer-b", "storage": {"token": "token-b"}, "events": ["setup", "open", "assert"]}
  ],
  "interleave": ["worker-a:setup", "worker-b:setup", "worker-a:open", "worker-b:open", "worker-a:assert", "worker-b:assert"]
}`,
      checkpoint:
        '两个 worker 各执行 3 个事件且 token 保持独立，trace 记录 open/assert 两条关键动作并分别关闭。输出 isolated=true tracesClosed=2，证明失败诊断信息可归属到单个 worker。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const contexts = new Map(input.workers.map((worker) => [worker.id, {
  account: worker.account,
  storage: null,
  trace: [],
  closed: false
}]));
const allowed = new Set(input.workers.flatMap((worker) => worker.events.map((event) => worker.id + ':' + event)));

for (const item of input.interleave) {
  assert.equal(allowed.has(item), true, 'unexpected interleaved action: ' + item);
  const [workerId, event] = item.split(':');
  const context = contexts.get(workerId);
  const definition = input.workers.find((worker) => worker.id === workerId);
  if (event === 'setup') context.storage = { ...definition.storage };
  if (event === 'open') {
    assert.deepEqual(context.storage, definition.storage);
    context.trace.push('open');
  }
  if (event === 'assert') {
    assert.equal(context.account, definition.account);
    context.trace.push('assert');
    context.closed = true;
  }
}

for (const worker of input.workers) {
  const context = contexts.get(worker.id);
  assert.deepEqual(context.storage, worker.storage);
  assert.equal(context.trace.length, 2);
  assert.equal(context.closed, true);
}
assert.notEqual(contexts.get('worker-a').storage.token, contexts.get('worker-b').storage.token);

console.log(JSON.stringify({
  isolated: true,
  accounts: [...contexts.values()].map((context) => context.account),
  tracesClosed: [...contexts.values()].filter((context) => context.closed).length
}, null, 2));
`,
    }),
  ),

  'programming:测试与工程质量 · 性能、安全与故障注入测试：性能基线、分位和错误预算': engineeringLab(
    '工程质量代码台 18 · 用分位和错误预算判断性能回归',
    '从延迟样本计算 p50、p95、p99，与预算比较得到允许错误量，再根据多窗口燃烧率决定告警级别。',
    nodeTask({
      id: 'eng2-latency-budget-guided',
      title: '跟做：均值会掩盖长尾，分位直接进入门禁',
      brief:
        '运行 node main.js。读取两次发布的三组延迟样本，计算最近秩分位并与 p95 预算比较，输出是否阻断。',
      stdin: `{
  "budgetP95Ms": 250,
  "baseline": [110, 120, 130, 140, 150, 160, 180, 210, 240, 260],
  "candidate": [105, 115, 125, 135, 150, 180, 220, 260, 310, 420]
}`,
      checkpoint:
        '基线与候选的 p95 都要真实计算；候选必须超过 250ms 并被标记 blocked。输出必须包含 candidateP95、budget 和 delta，不能只报告平均延迟。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function nearestRank(values, percentile) {
  assert.ok(percentile > 0 && percentile <= 1);
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1];
}

const baseline = {
  p50: nearestRank(input.baseline, 0.5),
  p95: nearestRank(input.baseline, 0.95),
  p99: nearestRank(input.baseline, 0.99)
};
const candidate = {
  p50: nearestRank(input.candidate, 0.5),
  p95: nearestRank(input.candidate, 0.95),
  p99: nearestRank(input.candidate, 0.99)
};
const blocked = candidate.p95 > input.budgetP95Ms;

assert.equal(baseline.p95, 260);
assert.equal(candidate.p95, 420);
assert.equal(blocked, true);
console.log(JSON.stringify({
  budgetP95Ms: input.budgetP95Ms,
  baseline,
  candidate,
  deltaP95Ms: candidate.p95 - baseline.p95,
  decision: blocked ? 'blocked' : 'allowed'
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-error-budget-independent',
      title: '独立实践：多窗口燃烧率决定告警',
      brief:
        '运行 node main.js。用请求数和错误数计算 5 分钟与 1 小时错误率，对照 SLO 预算推导燃烧率并选择告警级别。',
      stdin: `{
  "sloPercent": 99.9,
  "windows": [
    {"id": "fast", "requests": 10000, "errors": 180, "minutes": 5},
    {"id": "slow", "requests": 120000, "errors": 180, "minutes": 60}
  ]
}`,
      checkpoint:
        '必须以每个窗口自己的请求数计算错误率，再除以 0.001 得到燃烧率。输出 fast 与 slow 的 burnRate、severity；快窗口超过 14.4 时应触发 page。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const allowedErrorRate = (100 - input.sloPercent) / 100;
assert.ok(allowedErrorRate > 0 && allowedErrorRate < 1);

const windows = input.windows.map((window) => {
  const errorRate = window.errors / window.requests;
  const burnRate = errorRate / allowedErrorRate;
  const severity = burnRate >= 14.4 ? 'page' : burnRate >= 6 ? 'ticket' : 'observe';
  return { ...window, errorRate, burnRate: Number(burnRate.toFixed(3)), severity };
});

assert.equal(windows[0].burnRate, 18);
assert.equal(windows[1].burnRate, 1.5);
assert.deepEqual(windows.map((window) => window.severity), ['page', 'observe']);

console.log(JSON.stringify({ allowedErrorRate, windows }, null, 2));
console.log('budget rule: compare each complete window; never mix denominators');
`,
    }),
  ),

  'programming:安全工程 · 威胁建模、安全需求与安全设计：STRIDE 与滥用场景': engineeringLab(
    '工程质量代码台 19 · 把信任边界转成 STRIDE 与滥用测试',
    '读取资产、主体、入口和数据流，标出跨信任边界调用；再要求每个威胁具备缓解措施、负向测试和可观察证据。',
    nodeTask({
      id: 'eng2-stride-guided',
      title: '跟做：跨边界元素必须逐项威胁建模',
      brief:
        '运行 node main.js。读取组件、数据流和边界，校验每条跨边界流都属于 STRIDE 类别且具有 mitigation 与 testId。',
      stdin: `{
  "flows": [
    {"id": "F-1", "from": "browser", "to": "api", "boundary": true, "stride": "S", "mitigation": "OIDC token audience validation", "testId": "AUTH-01"},
    {"id": "F-2", "from": "api", "to": "worker", "boundary": false, "stride": "T", "mitigation": "signed job envelope", "testId": "JOB-04"},
    {"id": "F-3", "from": "worker", "to": "object-store", "boundary": true, "stride": "I", "mitigation": "short-lived scoped write credential", "testId": "STORE-02"},
    {"id": "F-4", "from": "admin", "to": "api", "boundary": true, "stride": "E", "mitigation": "", "testId": ""}
  ]
}`,
      checkpoint:
        'F-1 与 F-3 的跨边界威胁完整，F-4 缺少缓解和测试，F-2 是内部流但记录仍可保留。输出 boundaryFlows=3 unresolved=[F-4]，并明确每项风险都要落到可执行验证。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const stride = new Set(['S', 'T', 'R', 'I', 'D', 'E']);

for (const flow of input.flows) {
  assert.ok(stride.has(flow.stride), 'unknown STRIDE category: ' + flow.id);
  assert.ok(flow.from && flow.to);
}

const boundaryFlows = input.flows.filter((flow) => flow.boundary);
const unresolved = boundaryFlows
  .filter((flow) => !flow.mitigation || !flow.testId)
  .map((flow) => flow.id);
const covered = boundaryFlows.length - unresolved.length;

assert.equal(boundaryFlows.length, 3);
assert.deepEqual(unresolved, ['F-4']);
assert.equal(covered, 2);
console.log(JSON.stringify({
  boundaryFlows: boundaryFlows.length,
  covered,
  unresolved,
  decisions: boundaryFlows.map((flow) => ({
    id: flow.id,
    threat: flow.stride,
    testId: flow.testId || null
  }))
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-abuse-cases-independent',
      title: '独立实践：每个滥用场景都要有拒绝证据',
      brief:
        '运行 node main.js。从三条威胁记录生成滥用测试契约，校验 actor、asset、precondition、action 和 expectedDenial 完整，且跨租户读取不能返回数据。',
      stdin: `{
  "threats": [
    {"id": "TH-1", "actor": "viewer-a", "asset": "invoice-b", "precondition": "tenant-b", "action": "read", "expectedDenial": 404},
    {"id": "TH-2", "actor": "anonymous", "asset": "admin-api", "precondition": "no-token", "action": "list-users", "expectedDenial": 401},
    {"id": "TH-3", "actor": "plugin", "asset": "secrets", "precondition": "approved-read", "action": "write", "expectedDenial": 403}
  ]
}`,
      checkpoint:
        '三条测试契约都必须保留状态码 404、401、403 和对应资产，输出 abuseCases=3 denied=3 leakedBodies=0。拒绝证据应同时覆盖身份、对象授权和工具权限。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const required = ['id', 'actor', 'asset', 'precondition', 'action', 'expectedDenial'];
const cases = input.threats.map((threat) => {
  for (const field of required) assert.ok(threat[field], threat.id + ' missing ' + field);
  assert.ok([401, 403, 404].includes(threat.expectedDenial));
  return {
    id: 'abuse-' + threat.id,
    arrange: { actor: threat.actor, asset: threat.asset, precondition: threat.precondition },
    act: threat.action,
    assert: { status: threat.expectedDenial, body: null }
  };
});

assert.equal(new Set(cases.map((item) => item.id)).size, 3);
const denied = cases.filter((item) => item.assert.status >= 400).length;
const leakedBodies = cases.filter((item) => item.assert.body !== null).length;
assert.equal(denied, 3);
assert.equal(leakedBodies, 0);

console.log(JSON.stringify({ abuseCases: cases.length, denied, leakedBodies, cases }, null, 2));
`,
    }),
  ),

  'programming:安全工程 · 供应链、IaC 与安全 CI/CD：SAST、SCA 和秘密扫描': engineeringLab(
    '工程质量代码台 20 · 合并 SAST、依赖和秘密扫描结果',
    '把多工具结果归一到稳定指纹，区分可达漏洞与不可达告警，再校验基线豁免必须有人、到期日和补偿证据。',
    nodeTask({
      id: 'eng2-finding-normalization-guided',
      title: '跟做：跨工具重复发现只阻断一次',
      brief:
        '运行 node main.js。读取 SAST、SCA 与 secret 三类发现，按规则、位置和包名生成指纹并去重，再按严重级别排序。',
      stdin: `{
  "findings": [
    {"tool": "sast", "rule": "js/sql-injection", "file": "src/orders.ts", "line": 42, "severity": "critical", "package": "", "reachable": true},
    {"tool": "sca", "rule": "CVE-2026-1001", "file": "pnpm-lock.yaml", "line": 1, "severity": "high", "package": "parser@1.2.0", "reachable": true},
    {"tool": "codeql", "rule": "js/sql-injection", "file": "src/orders.ts", "line": 42, "severity": "critical", "package": "", "reachable": true},
    {"tool": "secret-scan", "rule": "generic-api-key", "file": "config/dev.env", "line": 9, "severity": "critical", "package": "", "reachable": true}
  ]
}`,
      checkpoint:
        '两个 SQL 注入结果必须合并为一条并保留规则位置，最终 unique=3。critical=2、high=1，输出要显示 tools 合并后的来源而非简单相加原始告警。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
const byFingerprint = new Map();
for (const finding of input.findings) {
  const fingerprint = [finding.rule, finding.file, finding.line, finding.package].join('|');
  const existing = byFingerprint.get(fingerprint);
  if (existing) {
    existing.tools.push(finding.tool);
    existing.sources += 1;
  } else {
    byFingerprint.set(fingerprint, { ...finding, fingerprint, tools: [finding.tool], sources: 1 });
  }
}

const unique = [...byFingerprint.values()].sort((left, right) => {
  return severityRank[left.severity] - severityRank[right.severity] || left.rule.localeCompare(right.rule);
});
const counts = unique.reduce((result, finding) => {
  result[finding.severity] = (result[finding.severity] ?? 0) + 1;
  return result;
}, {});

assert.equal(unique.length, 3);
assert.deepEqual(counts, { critical: 2, high: 1 });
assert.deepEqual(unique.find((item) => item.rule === 'js/sql-injection').tools.sort(), ['codeql', 'sast']);
console.log(JSON.stringify({ raw: input.findings.length, unique: unique.length, counts, findings: unique }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-security-gate-independent',
      title: '独立实践：安全门禁只接受可审计豁免',
      brief:
        '运行 node main.js。校验每个发现是否有未过期、带负责人和补偿证据的豁免；关键且可达的问题即使有普通豁免也必须阻断。',
      stdin: `{
  "now": "2026-11-24T00:00:00Z",
  "findings": [
    {"id": "F-1", "severity": "high", "reachable": true, "owner": "team-pay", "waiver": {"expiresAt": "2026-12-31T00:00:00Z", "owner": "sec-lead", "compensation": "virtual patch WAF-17"}},
    {"id": "F-2", "severity": "critical", "reachable": true, "owner": "team-auth", "waiver": {"expiresAt": "2026-12-01T00:00:00Z", "owner": "sec-lead", "compensation": "feature disabled"}},
    {"id": "F-3", "severity": "medium", "reachable": false, "owner": "team-web", "waiver": {"expiresAt": "2026-11-01T00:00:00Z", "owner": "sec-lead", "compensation": "none"}}
  ]
}`,
      checkpoint:
        'F-1 的有效豁免可延后修复，F-2 即使豁免有效也因 critical 且 reachable 被阻断，F-3 豁免过期且无补偿也无效。输出 blocked=[F-2,F-3] expired=[F-3]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);

const decisions = input.findings.map((finding) => {
  const waiver = finding.waiver;
  const complete = Boolean(
    waiver?.expiresAt &&
    waiver?.owner &&
    waiver?.compensation &&
    waiver.compensation !== 'none'
  );
  const expired = !waiver?.expiresAt || Date.parse(waiver.expiresAt) <= now;
  const validWaiver = complete && !expired;
  const hardBlock = finding.severity === 'critical' && finding.reachable;
  const blocked = hardBlock || !validWaiver;
  return { id: finding.id, blocked, expired, validWaiver, hardBlock };
});

assert.deepEqual(decisions.filter((item) => item.blocked).map((item) => item.id), ['F-2', 'F-3']);
assert.deepEqual(decisions.filter((item) => item.expired).map((item) => item.id), ['F-3']);
assert.equal(decisions[0].blocked, false);
console.log(JSON.stringify({ decisions, blocked: decisions.filter((item) => item.blocked).map((item) => item.id) }, null, 2));
console.log('gate evidence: no unowned, expired or unreviewed critical risk can ship');
`,
    }),
  ),

  'programming:安全工程 · 密码学、秘密和敏感数据：KMS、秘密注入和轮换': engineeringLab(
    '工程质量代码台 21 · 密钥双版本轮换与失败回滚',
    '演练 staging、dual-read、promote、retire 四阶段轮换，检查消费者清单、健康门禁、旧版本退役和失败时回滚证据。',
    nodeTask({
      id: 'eng2-key-rotation-guided',
      title: '跟做：轮换期间新旧密钥双读',
      brief:
        '运行 node main.js。按事件推进 v1 到 v2 轮换，断言发布前读取只能使用 v1，切换后 v1/v2 都能解密，退役后只剩 v2。',
      stdin: `{
  "activeVersion": 1,
  "events": ["stage-v2", "dual-read", "promote-v2", "verify-consumers", "retire-v1"],
  "consumers": ["billing", "notifications", "jobs"]
}`,
      checkpoint:
        'stage-v2 与 dual-read 阶段 active 仍为 v1，promote-v2 后 active 为 2、readableVersions 为 [1,2]，退役后只保留 [2]。输出 consumersVerified=3 retired=[1]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const state = {
  activeVersion: input.activeVersion,
  readableVersions: new Set([input.activeVersion]),
  staged: null,
  consumersVerified: 0,
  retired: []
};

for (const event of input.events) {
  if (event === 'stage-v2') {
    state.staged = 2;
    assert.equal(state.activeVersion, 1);
  }
  if (event === 'dual-read') {
    assert.equal(state.staged, 2);
    state.readableVersions.add(2);
    assert.deepEqual([...state.readableVersions].sort(), [1, 2]);
  }
  if (event === 'promote-v2') {
    state.activeVersion = 2;
    assert.equal(state.readableVersions.has(2), true);
  }
  if (event === 'verify-consumers') {
    state.consumersVerified = input.consumers.length;
  }
  if (event === 'retire-v1') {
    assert.equal(state.consumersVerified, input.consumers.length, 'cannot retire before all consumers verify');
    state.readableVersions.delete(1);
    state.retired.push(1);
  }
}

assert.equal(state.activeVersion, 2);
assert.deepEqual([...state.readableVersions], [2]);
assert.deepEqual(state.retired, [1]);
console.log(JSON.stringify({
  activeVersion: state.activeVersion,
  readableVersions: [...state.readableVersions],
  consumersVerified: state.consumersVerified,
  retired: state.retired
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-rotation-rollback-independent',
      title: '独立实践：消费者健康失败时回滚密钥',
      brief:
        '运行 node main.js。按消费者清单推进轮换，一旦关键消费者健康为 failed 就停止晋升、恢复 v1 为 active，并生成待处理清单。',
      stdin: `{
  "targetVersion": 3,
  "consumers": [
    {"id": "billing", "critical": true, "health": "passed"},
    {"id": "jobs", "critical": true, "health": "failed"},
    {"id": "analytics", "critical": false, "health": "pending"}
  ]
}`,
      checkpoint:
        '必须在 jobs 失败时立即回滚，activeVersion 恢复为旧值 2，blockedConsumers=[jobs]，nonCriticalPending=[analytics]。不得把部分失败披露成轮换完成。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const state = { activeVersion: 2, candidateVersion: input.targetVersion, rolledBack: false };
const blockedConsumers = [];
const nonCriticalPending = [];

for (const consumer of input.consumers) {
  if (consumer.critical && consumer.health !== 'passed') {
    blockedConsumers.push(consumer.id);
    state.rolledBack = true;
    state.activeVersion = 2;
    state.candidateVersion = null;
  }
  if (!consumer.critical && consumer.health !== 'passed') {
    nonCriticalPending.push(consumer.id);
  }
}

assert.equal(state.rolledBack, true);
assert.equal(state.activeVersion, 2);
assert.equal(state.candidateVersion, null);
assert.deepEqual(blockedConsumers, ['jobs']);
assert.deepEqual(nonCriticalPending, ['analytics']);

console.log(JSON.stringify({
  state,
  blockedConsumers,
  nonCriticalPending,
  action: 'freeze rollout, inspect decrypt errors, notify owners, resume only after health evidence'
}, null, 2));
`,
    }),
  ),

  'programming:安全工程 · 安全运营、事故响应与工程复盘：根因、影响和修复验证': engineeringLab(
    '工程质量代码台 22 · 用时间线和恢复准则收口安全事件',
    '从带时区的审计事件排序受影响对象，模拟控制、轮换和恢复验证，再检查行动项是否有负责人、截止时间和回归证据。',
    nodeTask({
      id: 'eng2-impact-timeline-guided',
      title: '跟做：统一时间线后计算真实影响面',
      brief:
        '运行 node main.js。把 UTC 与带偏移时间统一为毫秒，排序安全事件，识别受影响租户和被访问对象，输出首个与最后事件时间。',
      stdin: `{
  "events": [
    {"at": "2026-11-24T10:02:00+08:00", "type": "token.use", "tenant": "t-a", "object": "doc-1"},
    {"at": "2026-11-24T01:58:00Z", "type": "alert.open", "tenant": "t-a", "object": "doc-0"},
    {"at": "2026-11-24T10:01:00+08:00", "type": "token.use", "tenant": "t-b", "object": "doc-2"},
    {"at": "2026-11-24T10:03:00+08:00", "type": "token.revoke", "tenant": "t-a", "object": "doc-1"}
  ]
}`,
      checkpoint:
        '事件按真实 UTC 顺序应为 01:58、02:01、02:02、02:03。输出 impactedTenants=2、accessedObjects=2、first=01:58:00Z，并保留撤销事件作为遏制证据。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const timeline = input.events
  .map((event) => ({ ...event, epochMs: Date.parse(event.at) }))
  .sort((left, right) => left.epochMs - right.epochMs);

assert.ok(timeline.every((event) => Number.isFinite(event.epochMs)));
const impactedTenants = new Set(timeline.map((event) => event.tenant));
const accessedObjects = new Set(
  timeline.filter((event) => event.type === 'token.use').map((event) => event.object)
);
const first = new Date(timeline[0].epochMs).toISOString();
const last = new Date(timeline.at(-1).epochMs).toISOString();

assert.equal(impactedTenants.size, 2);
assert.equal(accessedObjects.size, 2);
assert.equal(first, '2026-11-24T01:58:00.000Z');
assert.equal(timeline.at(-1).type, 'token.revoke');

console.log(JSON.stringify({
  first,
  last,
  impactedTenants: [...impactedTenants].sort(),
  accessedObjects: [...accessedObjects].sort(),
  timeline
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-recovery-verification-independent',
      title: '独立实践：事故关闭前逐项验证恢复与回归',
      brief:
        '运行 node main.js。校验会话撤销、密钥轮换、恶意令牌拒绝和正常用户可用四项证据，再审查行动项的负责人、日期与测试编号。',
      stdin: `{
  "checks": [
    {"id": "C-1", "name": "revoke active sessions", "passed": true},
    {"id": "C-2", "name": "rotate signing key", "passed": true},
    {"id": "C-3", "name": "replay malicious token", "passed": true, "observedStatus": 401},
    {"id": "C-4", "name": "legitimate login smoke test", "passed": true, "observedStatus": 200}
  ],
  "actions": [
    {"id": "A-1", "owner": "identity-team", "due": "2026-12-05", "regressionTest": "auth.revocation.test.ts"},
    {"id": "A-2", "owner": "", "due": "2026-12-01", "regressionTest": ""}
  ]
}`,
      checkpoint:
        '四项恢复证据全部通过，A-1 可接受，A-2 因缺少负责人和回归测试被拒绝。输出 incidentCloseable=true、actionItemsValid=1、invalidActions=[A-2]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const checksPassed = input.checks.every((check) => check.passed);
const revoked = input.checks.some((check) => check.name.includes('revoke') && check.passed);
const rotated = input.checks.some((check) => check.name.includes('rotate') && check.passed);
const maliciousDenied = input.checks.some((check) => check.observedStatus === 401);
const legitimateAccepted = input.checks.some((check) => check.observedStatus === 200);

const invalidActions = input.actions
  .filter((action) => !action.owner || !action.regressionTest || !/^\\d{4}-\\d{2}-\\d{2}$/.test(action.due))
  .map((action) => action.id);
const actionItemsValid = input.actions.length - invalidActions.length;
const incidentCloseable = checksPassed && revoked && rotated && maliciousDenied && legitimateAccepted;
const remediationReady = incidentCloseable && invalidActions.length === 0;

assert.equal(checksPassed, true);
assert.equal(incidentCloseable, true);
assert.equal(remediationReady, false);
assert.equal(actionItemsValid, 1);
assert.deepEqual(invalidActions, ['A-2']);
console.log(JSON.stringify({
  incidentCloseable,
  remediationReady,
  actionItemsValid,
  invalidActions,
  recovery: { revoked, rotated, maliciousDenied, legitimateAccepted }
}, null, 2));
console.log('closure rule: restore service and prove the attack path is closed');
`,
    }),
  ),

  'programming:AI 编程 · Agent、MCP、工具与沙箱：MCP 工具、资源和能力协商': engineeringLab(
    '工程质量代码台 23 · MCP 能力协商与工具调用边界',
    '校验初始化阶段的协议版本和能力声明，只接受服务器明确公布的资源与工具；再把文件读取限制在允许目录且拒绝写操作。',
    nodeTask({
      id: 'eng2-mcp-negotiation-guided',
      title: '跟做：调用前先核对服务器能力',
      brief:
        '运行 node main.js。读取 JSON-RPC 会话，检查 initialize、resources/list、tools/list 与调用记录，拒绝未声明的 tools/call。',
      stdin: `{
  "session": [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}, "resources": {}}}},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "result": {"tools": [{"name": "read_doc", "annotations": {"readOnlyHint": true}}]}},
    {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "read_doc"}},
    {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "delete_doc"}}
  ]
}`,
      checkpoint:
        '初始化必须携带协议版本、tools 和 resources 能力，read_doc 因已声明且只读而允许，delete_doc 不在 tools/list 中必须拒绝。输出 declaredTools=[read_doc]、rejected=1。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const initialize = input.session.find((message) => message.method === 'initialize');
assert.equal(initialize.jsonrpc, '2.0');
assert.match(initialize.params.protocolVersion, /^2025-/);
assert.equal(Boolean(initialize.params.capabilities.tools), true);
assert.equal(Boolean(initialize.params.capabilities.resources), true);

const list = input.session.find((message) => message.method === 'tools/list');
const declaredTools = (list.result.tools ?? []).map((tool) => tool.name);
const calls = input.session.filter((message) => message.method === 'tools/call');
const decisions = calls.map((call) => {
  const declared = declaredTools.includes(call.params.name);
  return { name: call.params.name, allowed: declared, reason: declared ? 'declared' : 'undeclared-tool' };
});
const rejected = decisions.filter((decision) => !decision.allowed);

assert.deepEqual(declaredTools, ['read_doc']);
assert.deepEqual(decisions.map((decision) => decision.allowed), [true, false]);
assert.equal(rejected.length, 1);
console.log(JSON.stringify({ protocolVersion: initialize.params.protocolVersion, declaredTools, decisions }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-tool-boundary-independent',
      title: '独立实践：工具协议拒绝越权路径和写操作',
      brief:
        '运行 node main.js。按工具声明检查 read_doc 请求，规范化路径后必须位于 workspace 根目录，且 readOnlyHint 为 true。',
      stdin: `{
  "root": "/workspace/project",
  "tools": [
    {"name": "read_doc", "annotations": {"readOnlyHint": true}},
    {"name": "write_doc", "annotations": {"readOnlyHint": false}}
  ],
  "requests": [
    {"tool": "read_doc", "path": "/workspace/project/docs/a.md"},
    {"tool": "read_doc", "path": "/workspace/project/../secrets.env"},
    {"tool": "write_doc", "path": "/workspace/project/docs/a.md"}
  ]
}`,
      checkpoint:
        '第一条允许，第二条虽以 workspace 开头但规范化后越界，第三条因非只读拒绝。输出 allowed=1 denied=2，reason 必须区分 path-escape 与 non-read-only。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const tools = new Map(input.tools.map((tool) => [tool.name, tool]));
const decisions = input.requests.map((request) => {
  const tool = tools.get(request.tool);
  if (!tool) return { ...request, allowed: false, reason: 'undeclared-tool' };
  if (tool.annotations.readOnlyHint !== true) {
    return { ...request, allowed: false, reason: 'non-read-only' };
  }
  const relative = path.relative(input.root, path.resolve(request.path));
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return { ...request, allowed: inside, reason: inside ? 'inside-workspace' : 'path-escape' };
});

assert.deepEqual(decisions.map((decision) => decision.allowed), [true, false, false]);
assert.deepEqual(decisions.map((decision) => decision.reason), ['inside-workspace', 'path-escape', 'non-read-only']);
console.log(JSON.stringify({
  allowed: decisions.filter((decision) => decision.allowed).length,
  denied: decisions.filter((decision) => !decision.allowed).length,
  decisions
}, null, 2));
`,
    }),
  ),

  'programming:AI 编程 · 氛围编程与企业交付闭环：模型调用成本、延迟和降级': engineeringLab(
    '工程质量代码台 24 · 按预算选择模型并验证降级路径',
    '用整数微美元计算输入输出 token 成本，再为租户配额、缓存命中和延迟阈值设计确定性降级。',
    nodeTask({
      id: 'eng2-model-cost-guided',
      title: '跟做：模型路由先算成本再谈体验',
      brief:
        '运行 node main.js。读取模型单价和两次请求，以微美元累计输入输出成本，判断请求是否超过预算并记录延迟。',
      stdin: `{
  "models": {
    "small": {"inputMicrosPerToken": 0.15, "outputMicrosPerToken": 0.6},
    "large": {"inputMicrosPerToken": 2.5, "outputMicrosPerToken": 10}
  },
  "requests": [
    {"id": "R-1", "model": "small", "inputTokens": 10000, "outputTokens": 500, "budgetMicros": 5000, "latencyMs": 420},
    {"id": "R-2", "model": "large", "inputTokens": 4000, "outputTokens": 300, "budgetMicros": 5000, "latencyMs": 2100}
  ]
}`,
      checkpoint:
        'R-1 成本为 1800 微美元并允许，R-2 成本为 13000 微美元且超预算，应标记 route=small 或 reject。输出 totalMicros=14800、overBudget=1。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function estimate(model, request) {
  const cost = request.inputTokens * model.inputMicrosPerToken + request.outputTokens * model.outputMicrosPerToken;
  return Number(cost.toFixed(3));
}

const requests = input.requests.map((request) => {
  const model = input.models[request.model];
  assert.ok(model, 'unknown model: ' + request.model);
  const costMicros = estimate(model, request);
  const overBudget = costMicros > request.budgetMicros;
  return {
    id: request.id,
    model: request.model,
    costMicros,
    budgetMicros: request.budgetMicros,
    overBudget,
    action: overBudget ? 'route-small-or-reject' : 'answer'
  };
});

assert.deepEqual(requests.map((request) => request.costMicros), [1800, 13000]);
assert.deepEqual(requests.map((request) => request.overBudget), [false, true]);
const totalMicros = requests.reduce((sum, request) => sum + request.costMicros, 0);
assert.equal(totalMicros, 14800);

console.log(JSON.stringify({ totalMicros, overBudget: requests.filter((request) => request.overBudget).length, requests }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-degradation-independent',
      title: '独立实践：租户配额与缓存降级要可解释',
      brief:
        '运行 node main.js。为四个请求应用租户每日配额、缓存命中和 p95 延迟阈值，选择 primary、small 或 cached 路由。',
      stdin: `{
  "p95BudgetMs": 1500,
  "tenantQuotaMicros": 8000,
  "requests": [
    {"id": "Q-1", "tenant": "t-a", "estimatedMicros": 2000, "cacheHit": true, "expectedLatencyMs": 80},
    {"id": "Q-2", "tenant": "t-a", "estimatedMicros": 3000, "cacheHit": false, "expectedLatencyMs": 400},
    {"id": "Q-3", "tenant": "t-a", "estimatedMicros": 6000, "cacheHit": false, "expectedLatencyMs": 2100},
    {"id": "Q-4", "tenant": "t-b", "estimatedMicros": 6000, "cacheHit": false, "expectedLatencyMs": 400}
  ]
}`,
      checkpoint:
        'Q-1 走缓存；Q-2 消耗配额后 t-a 剩余 3000；Q-3 超租户预算且慢请求走 small；Q-4 在独立租户配额内可走 primary。输出 routes=[cached,primary,small,primary]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const used = new Map();
const decisions = input.requests.map((request) => {
  const tenantUsed = used.get(request.tenant) ?? 0;
  if (request.cacheHit) {
    return { id: request.id, route: 'cached', costMicros: 0 };
  }
  const exceedsQuota = tenantUsed + request.estimatedMicros > input.tenantQuotaMicros;
  const exceedsLatency = request.expectedLatencyMs > input.p95BudgetMs;
  const route = exceedsQuota || exceedsLatency ? 'small' : 'primary';
  const costMicros = route === 'small' ? Math.ceil(request.estimatedMicros * 0.2) : request.estimatedMicros;
  used.set(request.tenant, tenantUsed + costMicros);
  return { id: request.id, route, costMicros, tenantUsedAfter: used.get(request.tenant) };
});

assert.deepEqual(decisions.map((decision) => decision.route), ['cached', 'primary', 'small', 'primary']);
assert.equal(decisions[2].tenantUsedAfter, 4200);
assert.equal(decisions[3].tenantUsedAfter, 6000);
console.log(JSON.stringify({ routes: decisions.map((decision) => decision.route), decisions }, null, 2));
`,
    }),
  ),

  'programming:AI 编程 · 提示注入、安全与评测：离线评测、红队和线上回归': engineeringLab(
    '工程质量代码台 25 · 离线指标与提示注入回归门禁',
    '先从混淆矩阵计算精确率、召回率和 F1，再要求所有高风险注入用例被阻断，防止总体分数掩盖关键回归。',
    nodeTask({
      id: 'eng2-eval-metrics-guided',
      title: '跟做：分类指标必须从混淆矩阵推导',
      brief:
        '运行 node main.js。读取混淆矩阵，计算 precision、recall、F1 和 accuracy，并与发布阈值比较。',
      stdin: `{
  "matrix": {"tp": 48, "fp": 7, "tn": 141, "fn": 4},
  "thresholds": {"precision": 0.85, "recall": 0.9, "f1": 0.88}
}`,
      checkpoint:
        'precision=0.872727、recall=0.923077、F1 约为 0.897196，三项都过阈值，accuracy=0.945。输出 verdict=pass，并明确分数来自各类计数。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { tp, fp, tn, fn } = input.matrix;

const precision = tp / (tp + fp);
const recall = tp / (tp + fn);
const f1 = (2 * precision * recall) / (precision + recall);
const accuracy = (tp + tn) / (tp + fp + tn + fn);
const metrics = { precision, recall, f1, accuracy };
const passed = Object.entries(input.thresholds).every(([name, minimum]) => metrics[name] >= minimum);

assert.ok(Math.abs(precision - 0.8727272727) < 1e-9);
assert.ok(Math.abs(recall - 0.9230769231) < 1e-9);
assert.ok(Math.abs(f1 - 0.8971962617) < 1e-9);
assert.equal(passed, true);
console.log(JSON.stringify({
  matrix: input.matrix,
  metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(6))])),
  thresholds: input.thresholds,
  verdict: passed ? 'pass' : 'fail'
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-injection-regression-independent',
      title: '独立实践：高风险注入零漏放优先于总均分',
      brief:
        '运行 node main.js。读取红队样本与检测结果，要求 critical 注入全部阻断，并计算总体召回；任一 critical 漏放即阻断发布。',
      stdin: `{
  "samples": [
    {"id": "I-1", "class": "critical", "injected": true, "blocked": true},
    {"id": "I-2", "class": "critical", "injected": true, "blocked": true},
    {"id": "I-3", "class": "critical", "injected": true, "blocked": false},
    {"id": "I-4", "class": "normal", "injected": false, "blocked": false},
    {"id": "I-5", "class": "normal", "injected": false, "blocked": true}
  ],
  "minimumRecall": 0.8
}`,
      checkpoint:
        '总体召回为 2/3，高于 0.8，但 I-3 是 critical 漏放，发布仍必须 blocked。输出 criticalLeaks=[I-3]、release=false，说明聚合指标不能覆盖安全硬门槛。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const injected = input.samples.filter((sample) => sample.injected);
const blockedInjected = injected.filter((sample) => sample.blocked);
const recall = blockedInjected.length / injected.length;
const criticalLeaks = input.samples
  .filter((sample) => sample.class === 'critical' && sample.injected && !sample.blocked)
  .map((sample) => sample.id);
const release = recall >= input.minimumRecall && criticalLeaks.length === 0;

assert.equal(injected.length, 3);
assert.equal(Number(recall.toFixed(3)), 0.667);
assert.equal(release, false);
assert.deepEqual(criticalLeaks, ['I-3']);
console.log(JSON.stringify({
  recall: Number(recall.toFixed(3)),
  minimumRecall: input.minimumRecall,
  criticalLeaks,
  release,
  action: 'quarantine prompt family, patch detector, add regression, rerun before release'
}, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · 需求、质量属性与架构边界：架构图、C4、ADR 和决策记录': engineeringLab(
    '工程质量代码台 26 · ADR 取代链与模块决策覆盖',
    '校验 ADR 的上下文、决策、后果、负责人和日期，追踪 supersedes 链，再检查高风险模块是否都有当前可执行决策。',
    nodeTask({
      id: 'eng2-adr-chain-guided',
      title: '跟做：被取代的 ADR 不能继续生效',
      brief:
        '运行 node main.js。读取 ADR 集合并校验状态、必填字段和无环取代链，最终只保留每个决策族的最新 accepted 版本。',
      stdin: `{
  "adrs": [
    {"id": "ADR-001", "family": "database", "title": "Use monolith database", "status": "superseded", "supersedes": [], "owner": "platform", "date": "2025-01-10", "decision": "one shared database", "consequences": "migration coupling"},
    {"id": "ADR-014", "family": "database", "title": "Split reporting read store", "status": "accepted", "supersedes": ["ADR-001"], "owner": "data", "date": "2026-02-01", "decision": "async reporting replica", "consequences": "replication lag must be observable"}
  ]
}`,
      checkpoint:
        'ADR-001 必须为 superseded，ADR-014 为有效版本；输出 active=[ADR-014]、superseded=[ADR-001]、cycles=[]。任何缺少 consequences 的决策都不能被视为可执行。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = ['id', 'family', 'title', 'status', 'owner', 'date', 'decision', 'consequences'];

for (const adr of input.adrs) {
  for (const field of required) assert.ok(adr[field], adr.id + ' missing ' + field);
  assert.ok(['accepted', 'superseded', 'proposed', 'rejected'].includes(adr.status));
}

const byId = new Map(input.adrs.map((adr) => [adr.id, adr]));
const successors = new Map();
for (const adr of input.adrs) {
  for (const oldId of adr.supersedes) {
    assert.equal(byId.has(oldId), true, 'unknown superseded ADR: ' + oldId);
    successors.set(oldId, adr.id);
  }
}

const cycles = [];
for (const adr of input.adrs) {
  const seen = new Set();
  let cursor = adr;
  while (cursor?.supersedes[0]) {
    if (seen.has(cursor.id)) {
      cycles.push(cursor.id);
      break;
    }
    seen.add(cursor.id);
    cursor = byId.get(cursor.supersedes[0]);
  }
}

const active = input.adrs.filter((adr) => adr.status === 'accepted').map((adr) => adr.id).sort();
const superseded = input.adrs.filter((adr) => adr.status === 'superseded').map((adr) => adr.id).sort();
assert.deepEqual(active, ['ADR-014']);
assert.deepEqual(superseded, ['ADR-001']);
assert.deepEqual(cycles, []);

console.log(JSON.stringify({
  active,
  superseded,
  cycles,
  links: [...successors.entries()].map(([from, to]) => ({ from, to }))
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-adr-coverage-independent',
      title: '独立实践：高风险模块缺 ADR 就不能进入构建',
      brief:
        '运行 node main.js。检查模块风险与架构决策覆盖、负责人是否有效、决策是否过期，并输出构建门禁结果。',
      stdin: `{
  "now": "2026-11-24T00:00:00Z",
  "modules": [
    {"id": "payments", "risk": "high", "owner": "team-pay", "adrId": "ADR-021"},
    {"id": "recommendations", "risk": "high", "owner": "team-ml", "adrId": "ADR-004"},
    {"id": "static-pages", "risk": "low", "owner": "team-web", "adrId": null}
  ],
  "adrs": [
    {"id": "ADR-021", "status": "accepted", "reviewBy": "2027-01-01"},
    {"id": "ADR-004", "status": "proposed", "reviewBy": "2027-01-01"}
  ]
}`,
      checkpoint:
        'payments 覆盖有效；recommendations 的 ADR 仍为 proposed；静态低风险模块不强制 ADR。输出 blocked=[recommendations]、decision=deny-build，并指出阻塞来自未批准决策。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);
const adrs = new Map(input.adrs.map((adr) => [adr.id, adr]));

const moduleResults = input.modules.map((module) => {
  const adr = module.adrId ? adrs.get(module.adrId) : null;
  const requiredDecision = module.risk === 'high';
  const approved = adr?.status === 'accepted';
  const current = Boolean(adr?.reviewBy) && Date.parse(adr.reviewBy) > now;
  const blocked = requiredDecision && (!approved || !current || !module.owner);
  return { ...module, approved, current, blocked };
});
const blocked = moduleResults.filter((module) => module.blocked).map((module) => module.id);

assert.deepEqual(blocked, ['recommendations']);
assert.equal(moduleResults[2].blocked, false);
console.log(JSON.stringify({ blocked, decision: blocked.length ? 'deny-build' : 'allow-build', modules: moduleResults }, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · DDD、API 与模块化实现：端口适配器与依赖倒置': engineeringLab(
    '工程质量代码台 27 · 用导入方向守护端口适配器',
    '扫描模块导入并执行依赖方向规则：domain 不得依赖 infrastructure，adapter 可以实现 port，再用图遍历找出环。',
    nodeTask({
      id: 'eng2-layer-direction-guided',
      title: '跟做：核心域不能反向导入基础设施',
      brief:
        '运行 node main.js。读取模块层级和导入关系，逐条应用依赖规则，输出违规文件、违规目标和拒绝原因。',
      stdin: `{
  "modules": [
    {"id": "domain/order.ts", "layer": "domain", "imports": ["domain/money.ts"]},
    {"id": "domain/money.ts", "layer": "domain", "imports": []},
    {"id": "adapter/postgres-order.ts", "layer": "adapter", "imports": ["domain/order.ts"]},
    {"id": "domain/payment.ts", "layer": "domain", "imports": ["adapter/stripe.ts"]},
    {"id": "adapter/stripe.ts", "layer": "adapter", "imports": []},
    {"id": "port/order-repository.ts", "layer": "port", "imports": ["domain/order.ts"]},
    {"id": "application/pay-order.ts", "layer": "application", "imports": ["domain/payment.ts", "port/order-repository.ts"]}
  ]
}`,
      checkpoint:
        'domain/payment.ts 直接导入 adapter/stripe.ts 违反方向规则，其余通过。输出 violations=1、target=adapter/stripe.ts；规则基于抽象层而不是文件名猜猜看。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const modules = new Map(input.modules.map((module) => [module.id, module]));

const allowed = {
  domain: new Set(['domain']),
  port: new Set(['domain', 'port']),
  application: new Set(['domain', 'application', 'port']),
  adapter: new Set(['domain', 'application', 'port', 'adapter']),
  infrastructure: new Set(['domain', 'application', 'port', 'adapter', 'infrastructure'])
};

const violations = [];
for (const module of input.modules) {
  for (const targetId of module.imports) {
    const target = modules.get(targetId);
    assert.ok(target, 'unknown import target: ' + targetId);
    if (!allowed[module.layer]?.has(target.layer)) {
      violations.push({ from: module.id, to: target.id, fromLayer: module.layer, toLayer: target.layer });
    }
  }
}

assert.equal(violations.length, 1);
assert.equal(violations[0].from, 'domain/payment.ts');
assert.equal(violations[0].to, 'adapter/stripe.ts');
console.log(JSON.stringify({ moduleCount: input.modules.length, violations }, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-dependency-cycle-independent',
      title: '独立实践：找出跨模块循环依赖',
      brief:
        '运行 node main.js。对模块依赖图执行深度优先遍历，返回实际环路并验证移植后图仍然无环。',
      stdin: `{
  "graph": {
    "domain/order": ["domain/money"],
    "domain/money": ["shared/validation"],
    "application/pay": ["domain/order", "port/gateway"],
    "adapter/http": ["application/pay", "port/gateway"],
    "port/gateway": ["domain/order"],
    "shared/validation": ["application/pay"]
  }
}`,
      checkpoint:
        '图中存在 shared/validation → application/pay → domain/order → domain/money → shared/validation 的环。输出 hasCycle=true、cycleLength=4，并给出可审阅的完整节点序列。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const visiting = new Set();
const visited = new Set();
const stack = [];
let cycle = null;

function visit(node) {
  if (cycle || visited.has(node)) return;
  if (visiting.has(node)) {
    const start = stack.indexOf(node);
    cycle = [...stack.slice(start), node];
    return;
  }
  visiting.add(node);
  stack.push(node);
  for (const target of input.graph[node] ?? []) visit(target);
  stack.pop();
  visiting.delete(node);
  visited.add(node);
}

for (const node of Object.keys(input.graph)) visit(node);
assert.equal(Boolean(cycle), true);
assert.equal(cycle.length - 1, 4);
assert.equal(cycle[0], cycle.at(-1));
console.log(JSON.stringify({
  hasCycle: true,
  cycleLength: cycle.length - 1,
  cycle,
  action: 'move shared contract to port or shared kernel and invert one edge'
}, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · DDD、API 与模块化实现：契约测试、消费者与版本演进': engineeringLab(
    '工程质量代码台 28 · 检查 schema 兼容性与消费者合约',
    '比较两个 API schema 的破坏性变化，再按消费者支持版本和弃用日期决定兼容窗口、回退路径和发布门禁。',
    nodeTask({
      id: 'eng2-schema-compat-guided',
      title: '跟做：新增可选字段兼容，删除字段不兼容',
      brief:
        '运行 node main.js。比较订单 schema v1 与 v2，识别字段删除、类型变化、枚举收窄和新增必填字段。',
      stdin: `{
  "from": {
    "orderId": {"type": "string", "required": true},
    "status": {"type": "string", "required": true, "enum": ["new", "paid", "cancelled"]},
    "note": {"type": "string", "required": false}
  },
  "to": {
    "orderId": {"type": "string", "required": true},
    "status": {"type": "string", "required": true, "enum": ["new", "paid"]},
    "region": {"type": "string", "required": true}
  }
}`,
      checkpoint:
        '必须发现 note 被删除、status 枚举收窄、region 为新增必填三项破坏性变化。输出 breaking=3、compatible=false，不能降级成仅比较字段数量。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const fromKeys = Object.keys(input.from);
const toKeys = Object.keys(input.to);
const breaking = [];

for (const key of fromKeys) {
  if (!Object.hasOwn(input.to, key)) breaking.push({ field: key, kind: 'removed' });
}
for (const key of toKeys) {
  const before = input.from[key];
  const after = input.to[key];
  if (!before) {
    if (after.required) breaking.push({ field: key, kind: 'new-required' });
    continue;
  }
  if (before.type !== after.type) breaking.push({ field: key, kind: 'type-changed' });
  if (before.enum && after.enum && before.enum.some((value) => !after.enum.includes(value))) {
    breaking.push({ field: key, kind: 'enum-narrowed' });
  }
}

assert.equal(breaking.length, 3);
assert.deepEqual(breaking.map((item) => item.kind), ['removed', 'enum-narrowed', 'new-required']);
console.log(JSON.stringify({ compatible: breaking.length === 0, breaking }, null, 2));
console.log('version rule: publish a new major and preserve old shape during migration');
`,
    }),
    nodeTask({
      id: 'eng2-consumer-window-independent',
      title: '独立实践：消费者未升级时保留兼容窗口',
      brief:
        '运行 node main.js。读取消费者支持版本和弃用日期，只有在全体关键消费者支持新主版本后才允许移除 v1。',
      stdin: `{
  "today": "2026-11-24",
  "provider": {"currentMajor": 2, "v1Sunset": "2027-03-01"},
  "consumers": [
    {"id": "mobile", "supportedMajors": [1, 2], "critical": true},
    {"id": "partner", "supportedMajors": [1], "critical": true},
    {"id": "analytics", "supportedMajors": [1, 2], "critical": false}
  ]
}`,
      checkpoint:
        'partner 仍只支持 v1，且 sunset 尚未到，提供商必须继续双版本；输出 removeV1=false、blocked=[partner]、mode=dual-version。不能强迫关键消费者无窗口升级。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const nextMajor = input.provider.currentMajor;
const blocked = input.consumers
  .filter((consumer) => consumer.critical && !consumer.supportedMajors.includes(nextMajor))
  .map((consumer) => consumer.id);
const sunsetReached = Date.parse(input.today) >= Date.parse(input.provider.v1Sunset);
const removeV1 = blocked.length === 0 && sunsetReached;

assert.deepEqual(blocked, ['partner']);
assert.equal(sunsetReached, false);
assert.equal(removeV1, false);
console.log(JSON.stringify({
  blocked,
  sunsetReached,
  removeV1,
  mode: removeV1 ? 'v2-only' : 'dual-version',
  migrationAction: 'publish compatibility contract, notify partner, add v2 contract test'
}, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · CI/CD、可观测性与 SRE：滚动、蓝绿、金丝雀和回滚': engineeringLab(
    '工程质量代码台 29 · 金丝雀指标门禁与原子回滚',
    '比较基线与金丝雀的错误率、p95 和业务成功量，再执行分阶段放量；任何门槛失败都停在上一安全版本并生成回滚命令。',
    nodeTask({
      id: 'eng2-canary-metrics-guided',
      title: '跟做：相对与绝对指标同时设门禁',
      brief:
        '运行 node main.js。读取基线与金丝雀指标，检查错误率绝对上限、p95 回归比例和业务成功数量。',
      stdin: `{
  "limits": {"errorRate": 0.01, "p95RegressionRatio": 1.2, "minimumOrders": 100},
  "baseline": {"requests": 10000, "errors": 30, "p95Ms": 180, "orders": 720},
  "candidate": {"requests": 1000, "errors": 16, "p95Ms": 205, "orders": 71}
}`,
      checkpoint:
        '候选错误率为 0.016，超过 0.01；p95 回归约 1.139 未超 1.2；订单 71 未达 100。输出 failed=[error-rate,order-volume]、decision=rollback。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const errorRate = input.candidate.errors / input.candidate.requests;
const p95Ratio = input.candidate.p95Ms / input.baseline.p95Ms;
const failed = [];
if (errorRate > input.limits.errorRate) failed.push('error-rate');
if (p95Ratio > input.limits.p95RegressionRatio) failed.push('p95-regression');
if (input.candidate.orders < input.limits.minimumOrders) failed.push('order-volume');

assert.equal(Number(errorRate.toFixed(3)), 0.016);
assert.equal(Number(p95Ratio.toFixed(3)), 1.139);
assert.deepEqual(failed, ['error-rate', 'order-volume']);
console.log(JSON.stringify({
  errorRate,
  p95Ratio,
  failed,
  decision: failed.length ? 'rollback' : 'promote-next-stage'
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-rollout-state-independent',
      title: '独立实践：灰度失败后停在最后安全流量',
      brief:
        '运行 node main.js。依据 1%、5%、25%、50%、100% 阶段门槛推进发布，失败时恢复 lastSafePercent 并输出可执行回滚命令。',
      stdin: `{
  "artifact": "registry.example/orders@sha256:aaa111",
  "previousArtifact": "registry.example/orders@sha256:bbb222",
  "stages": [
    {"percent": 1, "passed": true},
    {"percent": 5, "passed": true},
    {"percent": 25, "passed": false},
    {"percent": 50, "passed": true}
  ]
}`,
      checkpoint:
        '流程在 25% 失败后立即停止，不得继续读取 50% success；lastSafePercent=5、state=rolled-back，并输出 kubectl 命令指回 previousArtifact。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

let lastSafePercent = 0;
let failedStage = null;
const evaluated = [];
for (const stage of input.stages) {
  evaluated.push(stage.percent);
  if (!stage.passed) {
    failedStage = stage;
    break;
  }
  lastSafePercent = stage.percent;
}

assert.deepEqual(evaluated, [1, 5, 25]);
assert.equal(lastSafePercent, 5);
assert.equal(failedStage.percent, 25);
const rollbackCommand = 'kubectl set image deployment/orders api=' + input.previousArtifact;

console.log(JSON.stringify({
  lastSafePercent,
  state: 'rolled-back',
  failedStage: failedStage.percent,
  rollbackCommand
}, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · 项目、风险、容量与团队协作：容量、成本、性能和人员规划': engineeringLab(
    '工程质量代码台 30 · 用并发需求和成本挑最小可运行容量',
    '用到达率乘以处理时长估算并发，再为目标利用率计算实例数；最后在满足 p95 与冗余要求的规格中挑选最低月成本。',
    nodeTask({
      id: 'eng2-little-law-guided',
      title: '跟做：先算并发，再算实例和冗余',
      brief:
        '运行 node main.js。按 Little 定律计算并发，依据单实例有效并发和 70% 目标利用率得出实例数，并加入一实例冗余。',
      stdin: `{
  "requestsPerSecond": 120,
  "averageLatencyMs": 250,
  "concurrencyPerInstance": 60,
  "targetUtilization": 0.7,
  "redundancyInstances": 1
}`,
      checkpoint:
        'Little 定律得到 30 个并发请求；70% 利用率下单实例有效并发为 42，需要 1 个再加 1 个冗余，最终 replicas=2。输出 headroomConcurrency=84。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const concurrency = input.requestsPerSecond * (input.averageLatencyMs / 1000);
const effectivePerInstance = input.concurrencyPerInstance * input.targetUtilization;
const baseInstances = Math.max(1, Math.ceil(concurrency / effectivePerInstance));
const replicas = baseInstances + input.redundancyInstances;
const headroomConcurrency = replicas * effectivePerInstance;

assert.equal(concurrency, 30);
assert.equal(effectivePerInstance, 42);
assert.equal(baseInstances, 1);
assert.equal(replicas, 2);
assert.equal(headroomConcurrency, 84);
console.log(JSON.stringify({
  concurrency,
  effectivePerInstance,
  baseInstances,
  replicas,
  headroomConcurrency
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-capacity-cost-independent',
      title: '独立实践：最低成本必须同时满足 p95 与冗余',
      brief:
        '运行 node main.js。遍历实例规格与副本数，过滤无法满足 p95 和故障冗余的方案，再按月成本选择最小值。',
      stdin: `{
  "requiredRps": 500,
  "p95BudgetMs": 300,
  "networks": [
    {"id": "small", "rpsPerReplica": 120, "p95Ms": 260, "monthlyPerReplica": 90},
    {"id": "medium", "rpsPerReplica": 260, "p95Ms": 240, "monthlyPerReplica": 180},
    {"id": "large", "rpsPerReplica": 600, "p95Ms": 220, "monthlyPerReplica": 420}
  ]
}`,
      checkpoint:
        'small 需 5 副本、月成本 450；medium 需 2 副本、月成本 360；large 也至少保留 2 副本，月成本 840。输出 choice=medium、replicas=2、monthlyCost=360。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const feasible = [];
for (const network of input.networks) {
  const requiredReplicas = Math.ceil(input.requiredRps / network.rpsPerReplica);
  const replicas = Math.max(2, requiredReplicas);
  if (network.p95Ms > input.p95BudgetMs) continue;
  feasible.push({
    id: network.id,
    replicas,
    capacityRps: replicas * network.rpsPerReplica,
    monthlyCost: replicas * network.monthlyPerReplica
  });
}
feasible.sort((left, right) => left.monthlyCost - right.monthlyCost || left.capacityRps - right.capacityRps);
const choice = feasible[0];

assert.equal(choice.id, 'medium');
assert.equal(choice.replicas, 2);
assert.equal(choice.monthlyCost, 360);
assert.equal(feasible.find((option) => option.id === 'large').monthlyCost, 840);
console.log(JSON.stringify({ feasible, choice }, null, 2));
`,
    }),
  ),

  'programming:软件架构与交付 · CI/CD、可观测性与 SRE：告警、值班、事故指挥和复盘': engineeringLab(
    '工程质量代码台 31 · 从时间线到可验收的事故复盘',
    '统一事故事件时间，计算检测与恢复耗时，区分触发因素和系统性原因，再检查复盘行动项是否具备负责人、日期和回归证明。',
    nodeTask({
      id: 'eng2-incident-timeline-guided',
      title: '跟做：MTTD 与 MTTR 不能靠手填',
      brief:
        '运行 node main.js。读取事件时间线，统一为毫秒，计算首次异常到告警、以及恢复的总时长，并列出受影响服务。',
      stdin: `{
  "events": [
    {"at": "2026-11-24T10:00:00+08:00", "type": "first-bad-request", "service": "checkout"},
    {"at": "2026-11-24T02:04:00Z", "type": "alert-opened", "service": "checkout"},
    {"at": "2026-11-24T02:09:00Z", "type": "mitigation-started", "service": "checkout"},
    {"at": "2026-11-24T10:17:00+08:00", "type": "recovered", "service": "checkout"}
  ]
}`,
      checkpoint:
        '事件顺序为 02:00 异常、02:04 告警、02:09 缓解、02:17 恢复；MTTD=4 分钟、MTTR=17 分钟。输出 affectedServices=[checkout]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const events = input.events
  .map((event) => ({ ...event, epochMs: Date.parse(event.at) }))
  .sort((left, right) => left.epochMs - right.epochMs);
const first = events.find((event) => event.type === 'first-bad-request');
const alert = events.find((event) => event.type === 'alert-opened');
const recovered = events.find((event) => event.type === 'recovered');
assert.ok(first && alert && recovered);

const mttdMinutes = (alert.epochMs - first.epochMs) / 60000;
const mttrMinutes = (recovered.epochMs - first.epochMs) / 60000;
const affectedServices = [...new Set(events.map((event) => event.service))].sort();

assert.equal(mttdMinutes, 4);
assert.equal(mttrMinutes, 17);
assert.deepEqual(affectedServices, ['checkout']);
console.log(JSON.stringify({
  timeline: events.map((event) => ({ at: new Date(event.epochMs).toISOString(), type: event.type, service: event.service })),
  mttdMinutes,
  mttrMinutes,
  affectedServices
}, null, 2));
`,
    }),
    nodeTask({
      id: 'eng2-postmortem-actions-independent',
      title: '独立实践：复盘必须区分触发因素与系统原因',
      brief:
        '运行 node main.js。校验时间线、直接触发、系统性原因和行动项；行动项必须有负责人、截止时间、回归测试与可观察信号。',
      stdin: `{
  "incident": {
    "trigger": "deploy-v42 enabled an invalid timeout",
    "systemicCause": "configuration schema allowed values outside the runtime contract",
    "timelineComplete": true
  },
  "actions": [
    {"id": "A-1", "owner": "platform", "due": "2026-12-01", "regressionTest": "config.contract.test.ts", "signal": "rejected-config-count"},
    {"id": "A-2", "owner": "", "due": "2026-11-20", "regressionTest": "", "signal": ""}
  ]
}`,
      checkpoint:
        '直接触发与系统原因必须同时记录，不能把某次部署当成唯一根因。A-1 完整，A-2 缺少负责人、回归测试和信号；输出 publishable=false、invalidActions=[A-2]。',
      code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

assert.equal(input.incident.timelineComplete, true);
assert.match(input.incident.trigger, /deploy/);
assert.match(input.incident.systemicCause, /schema/);
assert.notEqual(input.incident.trigger, input.incident.systemicCause);

const invalidActions = input.actions.filter((action) => {
  return !action.owner ||
    !/^\\d{4}-\\d{2}-\\d{2}$/.test(action.due) ||
    !action.regressionTest ||
    !action.signal;
}).map((action) => action.id);
const publishable = invalidActions.length === 0;

assert.deepEqual(invalidActions, ['A-2']);
assert.equal(publishable, false);
console.log(JSON.stringify({
  publishable,
  invalidActions,
  trigger: input.incident.trigger,
  systemicCause: input.incident.systemicCause,
  actionItems: input.actions.length
}, null, 2));
console.log('review rule: an action without a test and signal is only a wish');
`,
    }),
  ),
};
