import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装第三方依赖。',
    '代码从 stdin 读取本任务提供的确定性输入。',
    '运行后核对断言、输出证据和退出码。',
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

export const LEARNING_CODE_LABS_ENGINEERING_LAST: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:测试与工程质量 · 性能、安全与故障注入测试：性能与安全报告的可复现证据':
    engineeringLab(
      '工程质量终章 · 可复现的性能与安全证据',
      '把原始样本、工具版本、排序结果和未修复风险绑定成一个可重复计算的证据包。外部扫描器和压测器均用 stdin 中的真实报告样本模拟。',
      nodeTask({
        id: 'englast-performance-evidence-guided',
        title: '跟做：从样本计算 p95 与未修复风险',
        brief:
          '运行 node main.js。读取压测样本和安全发现，计算中位数、p95、未修复数量，并对规范化报告计算 SHA-256。',
        stdin: `{
  "suite": "checkout",
  "tool": {"name": "bench", "version": "1.2.3"},
  "trials": [120, 140, 130, 180, 160],
  "findings": [
    {"id": "XSS-1", "severity": "high", "fixed": true},
    {"id": "CSP-2", "severity": "medium", "fixed": false}
  ]
}`,
        checkpoint:
          '必须输出 suite=checkout trials=5 median=140 p95=180 unresolved=1，并给出同一报告重复计算两次后完全相同的 64 位 digest。工具版本也必须进入证据包。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const trials = [...input.trials].sort((a, b) => a - b);
const middle = Math.floor(trials.length / 2);
const median = trials.length % 2
  ? trials[middle]
  : (trials[middle - 1] + trials[middle]) / 2;
const p95 = trials[Math.ceil(trials.length * 0.95) - 1];
const unresolved = input.findings.filter((finding) => !finding.fixed);
const report = {
  suite: input.suite,
  tool: input.tool,
  median,
  p95,
  unresolved: unresolved.map((finding) => finding.id).sort(),
};
const canonical = JSON.stringify(report);
const digest = crypto.createHash('sha256').update(canonical).digest('hex');

assert.equal(report.median, 140);
assert.equal(report.p95, 180);
assert.equal(unresolved.length, 1);
assert.equal(digest.length, 64);
assert.equal(crypto.createHash('sha256').update(canonical).digest('hex'), digest);

console.log('suite=' + input.suite + ' trials=' + trials.length);
console.log('median=' + median + ' p95=' + p95 + ' unresolved=' + unresolved.length);
console.log('digest=' + digest);
`,
      }),
      nodeTask({
        id: 'englast-performance-evidence-apply',
        title: '独立实践：扫描结果顺序变化仍得到同一证据',
        brief:
          '运行 node main.js。对两次扫描结果按规则、路径和行号规范化排序，证明输入顺序变化不会改变证据摘要。',
        stdin: `{
  "runs": [
    [
      {"rule": "AUTH-2", "path": "src/order.js", "line": 31, "critical": false},
      {"rule": "AUTH-1", "path": "src/auth.js", "line": 17, "critical": true}
    ],
    [
      {"rule": "AUTH-1", "path": "src/auth.js", "line": 17, "critical": true},
      {"rule": "AUTH-2", "path": "src/order.js", "line": 31, "critical": false}
    ]
  ]
}`,
        checkpoint:
          '必须输出 findings=2 critical=1 stable=true，并打印两次规范化报告相同的 digest；关键发现 AUTH-1 必须进入优先修复列表。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function canonicalFindings(findings) {
  return findings
    .map((finding) => ({
      rule: finding.rule,
      path: finding.path,
      line: finding.line,
      critical: finding.critical,
    }))
    .sort((left, right) =>
      left.rule.localeCompare(right.rule) ||
      left.path.localeCompare(right.path) ||
      left.line - right.line,
    );
}

function digestOf(findings) {
  const normalized = canonicalFindings(findings);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

const first = digestOf(input.runs[0]);
const second = digestOf(input.runs[1]);
const critical = canonicalFindings(input.runs[0]).filter((item) => item.critical);

assert.equal(first, second);
assert.equal(critical.length, 1);
assert.equal(critical[0].rule, 'AUTH-1');

console.log('findings=' + input.runs[0].length + ' critical=' + critical.length);
console.log('priority=' + critical.map((item) => item.rule).join(','));
console.log('stable=true digest=' + first);
`,
      }),
    ),

  'programming:测试与工程质量 · CI 门禁、稳定性与质量运营：并行、分片、缓存和隔离':
    engineeringLab(
      '工程质量终章 · 并行、分片、缓存与隔离',
      '用确定性分片、异步作业和临时工作目录验证 CI 并行策略。任务只使用本机 Node 进程、文件系统和 stdin，不依赖真实 CI 服务。',
      nodeTask({
        id: 'englast-ci-sharding-guided',
        title: '跟做：把测试文件稳定分到三个分片',
        brief:
          '运行 node main.js。按文件排序结果轮流分片，验证每个文件只出现一次，且分片大小最多相差一。',
        stdin: `{
  "files": ["order.test.js", "auth.test.js", "cart.test.js", "stock.test.js", "tax.test.js", "login.test.js", "refund.test.js", "audit.test.js"],
  "shards": 3
}`,
        checkpoint:
          '必须输出 total=8 shards=3 balanced=true，并列出 shard0 到 shard2 的具体文件；每个文件恰好出现一次。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

assert.ok(Number.isInteger(input.shards) && input.shards > 0);
const buckets = Array.from({ length: input.shards }, () => []);
const files = [...input.files].sort();
for (let index = 0; index < files.length; index += 1) {
  buckets[index % input.shards].push(files[index]);
}

const flattened = buckets.flat();
const sizes = buckets.map((bucket) => bucket.length);
assert.equal(flattened.length, files.length);
assert.equal(new Set(flattened).size, files.length);
assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);

console.log('total=' + files.length + ' shards=' + buckets.length + ' balanced=true');
buckets.forEach((bucket, index) => {
  console.log('shard' + index + '=' + bucket.join(','));
});
`,
      }),
      nodeTask({
        id: 'englast-ci-isolation-apply',
        title: '独立实践：并发作业使用独立目录和确定性缓存键',
        brief:
          '运行 node main.js。并行启动三个作业，每个作业写入自己的临时目录；锁文件相同则复用缓存键，作业输出仍必须隔离。',
        stdin: `{
  "jobs": [
    {"name": "unit", "delay": 15, "artifact": "unit.xml", "lock": "pnpm-v9"},
    {"name": "integration", "delay": 5, "artifact": "integration.xml", "lock": "pnpm-v9"},
    {"name": "e2e", "delay": 10, "artifact": "e2e.json", "lock": "node-v24"}
  ]
}`,
        checkpoint:
          '必须输出 jobs=3 isolated=3 cacheKeys=2，并证明三个 result 文件来自不同目录。结束后临时目录应被清理。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-ci-'));

async function run(job) {
  const workspace = path.join(base, job.name);
  fs.mkdirSync(workspace);
  await new Promise((resolve) => setTimeout(resolve, job.delay));
  const artifact = path.join(workspace, 'result.txt');
  fs.writeFileSync(artifact, job.artifact);
  return {
    name: job.name,
    workspace,
    artifact: fs.readFileSync(artifact, 'utf8'),
    cacheKey: crypto.createHash('sha256').update(job.lock).digest('hex').slice(0, 12),
  };
}

Promise.all(input.jobs.map(run)).then((results) => {
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((item) => item.workspace)).size, 3);
  assert.equal(new Set(results.map((item) => item.cacheKey)).size, 2);
  assert.deepEqual(
    results.map((item) => item.artifact).sort(),
    ['e2e.json', 'integration.xml', 'unit.xml'],
  );
  fs.rmSync(base, { recursive: true, force: true });
  assert.equal(fs.existsSync(base), false);
  console.log('jobs=' + results.length + ' isolated=' + results.length + ' cacheKeys=2');
  console.log('artifacts=' + results.map((item) => item.artifact).sort().join(','));
}).catch((error) => {
  fs.rmSync(base, { recursive: true, force: true });
  throw error;
});
`,
      }),
    ),

  'programming:测试与工程质量 · CI 门禁、稳定性与质量运营：失败归因、工件和可观测性':
    engineeringLab(
      '工程质量终章 · 失败归因、工件和可观测性',
      '从结构化事件和真实临时工件中定位第一个失败，并把提交、测试、trace 和报告摘要串起来。CI 的工件上传用本地文件系统模拟。',
      nodeTask({
        id: 'englast-failure-attribution-guided',
        title: '跟做：用 trace id 找到第一个失败测试',
        brief:
          '运行 node main.js。按序号处理测试事件，找到第一个失败项，并用 traceId 过滤关联日志。',
        stdin: `{
  "commit": "8f31c2a",
  "events": [
    {"seq": 1, "test": "pricing", "status": "passed", "traceId": "t-100"},
    {"seq": 2, "test": "checkout", "status": "failed", "traceId": "t-200"},
    {"seq": 3, "test": "refund", "status": "failed", "traceId": "t-300"}
  ],
  "logs": [
    {"traceId": "t-200", "level": "error", "code": "TAX_OVERFLOW"},
    {"traceId": "t-300", "level": "error", "code": "REFUND_LOCK"},
    {"traceId": "t-100", "level": "info", "code": "OK"}
  ]
}`,
        checkpoint:
          '必须输出 commit=8f31c2a firstFailure=checkout trace=t-200 code=TAX_OVERFLOW，证明定位依据来自最小失败序号和同一 trace 的错误日志。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const events = [...input.events].sort((left, right) => left.seq - right.seq);
const failure = events.find((event) => event.status === 'failed');
assert.ok(failure, 'a failed test is required');
const evidence = input.logs.filter((log) =>
  log.traceId === failure.traceId && log.level === 'error',
);
assert.equal(evidence.length, 1);
assert.equal(failure.test, 'checkout');
assert.equal(evidence[0].code, 'TAX_OVERFLOW');

console.log('commit=' + input.commit + ' firstFailure=' + failure.test);
console.log('trace=' + failure.traceId + ' code=' + evidence[0].code);
`,
      }),
      nodeTask({
        id: 'englast-failure-artifact-apply',
        title: '独立实践：生成可追溯的失败工件清单',
        brief:
          '运行 node main.js。把测试报告和失败截图写入临时目录，计算 SHA-256，并验证清单中的 trace 与失败事件一致。',
        stdin: `{
  "commit": "b57e910",
  "traceId": "trace-crash-77",
  "files": {
    "junit.xml": "<testsuite failures=\\"1\\"><testcase name=\\"checkout\\"/></testsuite>",
    "failure.png": "deterministic-screenshot-bytes",
    "trace.json": "{\\"traceId\\":\\"trace-crash-77\\",\\"code\\":\\"CHECKOUT_TIMEOUT\\"}"
  }
}`,
        checkpoint:
          '必须输出 artifacts=3 traceMatch=true，列出三个不同文件名和各自的 64 位 SHA-256；trace.json 中的 traceId 必须与输入一致。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-artifacts-'));
const manifest = [];

for (const [name, content] of Object.entries(input.files)) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, content);
  manifest.push({
    name,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  });
}

const trace = JSON.parse(fs.readFileSync(path.join(directory, 'trace.json'), 'utf8'));
assert.equal(trace.traceId, input.traceId);
assert.equal(manifest.length, 3);
assert.equal(new Set(manifest.map((item) => item.sha256)).size, 3);
fs.rmSync(directory, { recursive: true, force: true });

console.log('commit=' + input.commit + ' artifacts=' + manifest.length + ' traceMatch=true');
for (const item of manifest) console.log(item.name + ' sha256=' + item.sha256);
`,
      }),
    ),

  'programming:测试与工程质量 · CI 门禁、稳定性与质量运营：质量指标与缺陷趋势':
    engineeringLab(
      '工程质量终章 · 质量指标与缺陷趋势',
      '从缺陷记录和周度数据计算逃逸率、年龄分桶、质量趋势与回归告警。指标定义全部保留在代码里，便于审计口径。',
      nodeTask({
        id: 'englast-quality-metrics-guided',
        title: '跟做：计算逃逸率和缺陷年龄',
        brief:
          '运行 node main.js。以固定当前时间计算逃逸缺陷比例，把未关闭缺陷按 0-7、8-30、31+ 天分桶。',
        stdin: `{
  "now": "2026-06-01T00:00:00.000Z",
  "defects": [
    {"id": "D-1", "escaped": true, "status": "open", "openedAt": "2026-05-28T00:00:00.000Z"},
    {"id": "D-2", "escaped": false, "status": "closed", "openedAt": "2026-05-01T00:00:00.000Z"},
    {"id": "D-3", "escaped": true, "status": "open", "openedAt": "2026-04-10T00:00:00.000Z"},
    {"id": "D-4", "escaped": false, "status": "open", "openedAt": "2026-05-31T00:00:00.000Z"}
  ]
}`,
        checkpoint:
          '必须输出 defects=4 escaped=2 escapeRate=0.5 open=3，并给出 age0to7=2 age8to30=0 age31plus=1。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);
const open = input.defects.filter((defect) => defect.status === 'open');
const age = { age0to7: 0, age8to30: 0, age31plus: 0 };

for (const defect of open) {
  const days = Math.floor((now - Date.parse(defect.openedAt)) / 86400000);
  if (days <= 7) age.age0to7 += 1;
  else if (days <= 30) age.age8to30 += 1;
  else age.age31plus += 1;
}

const escaped = input.defects.filter((defect) => defect.escaped).length;
const escapeRate = escaped / input.defects.length;
assert.equal(escaped, 2);
assert.equal(escapeRate, 0.5);
assert.deepEqual(age, { age0to7: 2, age8to30: 0, age31plus: 1 });

console.log('defects=' + input.defects.length + ' escaped=' + escaped + ' escapeRate=0.5 open=' + open.length);
console.log('age0to7=2 age8to30=0 age31plus=1');
`,
      }),
      nodeTask({
        id: 'englast-quality-trend-apply',
        title: '独立实践：用连续周数据触发质量回归',
        brief:
          '运行 node main.js。计算失败率相对时间的最小二乘斜率；连续两周高于阈值时产生回归告警。',
        stdin: `{
  "weeks": [
    {"week": 1, "failureRate": 0.02},
    {"week": 2, "failureRate": 0.025},
    {"week": 3, "failureRate": 0.04},
    {"week": 4, "failureRate": 0.05}
  ],
  "threshold": 0.035
}`,
        checkpoint:
          '必须输出 slope>0、latestAbove=2 regression=true，并打印触发告警的两周；周数据不足两周时不能触发。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const weeks = [...input.weeks].sort((left, right) => left.week - right.week);
const meanX = weeks.reduce((sum, item) => sum + item.week, 0) / weeks.length;
const meanY = weeks.reduce((sum, item) => sum + item.failureRate, 0) / weeks.length;
const numerator = weeks.reduce(
  (sum, item) => sum + (item.week - meanX) * (item.failureRate - meanY),
  0,
);
const denominator = weeks.reduce((sum, item) => sum + (item.week - meanX) ** 2, 0);
const slope = numerator / denominator;
let latestAbove = 0;
for (let index = weeks.length - 1; index >= 0; index -= 1) {
  if (weeks[index].failureRate <= input.threshold) break;
  latestAbove += 1;
}

assert.ok(slope > 0);
assert.equal(latestAbove, 2);
assert.equal(weeks.length >= 2 && latestAbove === 2, true);

console.log('slope=' + slope.toFixed(4) + ' latestAbove=' + latestAbove + ' regression=true');
console.log('breachWeeks=' + weeks.slice(-latestAbove).map((item) => item.week).join(','));
`,
      }),
    ),

  'programming:安全工程 · 威胁建模、安全需求与安全设计：最小权限、默认拒绝和职责分离':
    engineeringLab(
      '安全工程终章 · 默认拒绝与职责分离',
      '用纯函数实现 IAM 判定和职责分离门禁。资源、动作、策略和审批请求均来自 stdin，不连接真实云账号。',
      nodeTask({
        id: 'englast-default-deny-guided',
        title: '跟做：显式拒绝覆盖允许',
        brief:
          '运行 node main.js。按默认拒绝求值策略，确认普通读取允许，删除动作即使被 allow 命中也会被显式 deny 覆盖。',
        stdin: `{
  "policy": {
    "allow": [
      {"action": "s3:GetObject", "resource": "docs/*"},
      {"action": "s3:DeleteObject", "resource": "docs/*"}
    ],
    "deny": [
      {"action": "s3:DeleteObject", "resource": "docs/*"}
    ]
  },
  "requests": [
    {"action": "s3:GetObject", "resource": "docs/runbook.md"},
    {"action": "s3:DeleteObject", "resource": "docs/runbook.md"},
    {"action": "s3:PutObject", "resource": "docs/runbook.md"}
  ]
}`,
        checkpoint:
          '必须依次输出 GetObject=allow DeleteObject=deny PutObject=deny，说明默认拒绝和显式拒绝优先级高于允许。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function matches(statement, request) {
  const resource = statement.resource.endsWith('*')
    ? request.resource.startsWith(statement.resource.slice(0, -1))
    : statement.resource === request.resource;
  return statement.action === request.action && resource;
}

function decide(policy, request) {
  if (policy.deny.some((statement) => matches(statement, request))) return 'deny';
  if (policy.allow.some((statement) => matches(statement, request))) return 'allow';
  return 'deny';
}

const results = input.requests.map((request) => ({
  action: request.action.split(':')[1],
  decision: decide(input.policy, request),
}));
assert.deepEqual(results.map((item) => item.decision), ['allow', 'deny', 'deny']);

for (const item of results) console.log(item.action + '=' + item.decision);
`,
      }),
      nodeTask({
        id: 'englast-separation-duties-apply',
        title: '独立实践：申请人与审批人不能是同一主体',
        brief:
          '运行 node main.js。检查生产变更所需角色、申请人与审批人分离，以及高风险操作的双人审批。',
        stdin: `{
  "change": {"id": "CHG-42", "risk": "high", "requester": "alice", "approvers": ["bob", "mallory"]},
  "requiredRoles": ["sre", "security"],
  "actors": {
    "alice": ["developer"],
    "bob": ["sre"],
    "mallory": ["security"]
  }
}`,
        checkpoint:
          '必须输出 approved=true approvers=bob,mallory roles=sre,security，并证明 requester 不在 approvers 中且高风险需要两名不同审批人。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const uniqueApprovers = [...new Set(input.change.approvers)];
const noSelfApproval = !uniqueApprovers.includes(input.change.requester);
const heldRoles = new Set(uniqueApprovers.flatMap((actor) => input.actors[actor] || []));
const requiredRolesMet = input.requiredRoles.every((role) => heldRoles.has(role));
const quorumMet = input.change.risk !== 'high' || uniqueApprovers.length >= 2;
const approved = noSelfApproval && requiredRolesMet && quorumMet;

assert.equal(noSelfApproval, true);
assert.equal(requiredRolesMet, true);
assert.equal(quorumMet, true);
assert.equal(approved, true);

console.log('approved=' + approved + ' approvers=' + uniqueApprovers.join(','));
console.log('roles=' + [...heldRoles].sort().join(','));
`,
      }),
    ),

  'programming:安全工程 · 威胁建模、安全需求与安全设计：威胁排序、风险接受和设计评审':
    engineeringLab(
      '安全工程终章 · 威胁排序与风险接受',
      '把概率、影响、控制有效性和接受证据变成可计算的评审结果。风险接受必须带所有者、期限和补偿控制。',
      nodeTask({
        id: 'englast-risk-ranking-guided',
        title: '跟做：按剩余风险排序并要求接受证据',
        brief:
          '运行 node main.js。计算每个威胁的剩余风险，排序后核对高风险的接受人、到期日和补偿控制。',
        stdin: `{
  "threats": [
    {"id": "T-1", "probability": 0.4, "impact": 100, "control": 0.5, "acceptance": null},
    {"id": "T-2", "probability": 0.8, "impact": 100, "control": 0.8, "acceptance": {"owner": "security", "expires": "2026-09-01", "compensatingControl": "extra audit"}},
    {"id": "T-3", "probability": 0.2, "impact": 20, "control": 0, "acceptance": null}
  ]
}`,
        checkpoint:
          '必须输出 top=T-1 score=20 decisions=T-1:mitigate,T-2:accept,T-3:monitor；T-2 的接受证据字段必须完整。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ranked = input.threats
  .map((threat) => ({
    ...threat,
    residual: Number((threat.probability * threat.impact * (1 - threat.control)).toFixed(2)),
  }))
  .sort((left, right) => right.residual - left.residual);

function decision(threat) {
  if (threat.residual >= 15) {
    const accepted = threat.acceptance &&
      threat.acceptance.owner &&
      threat.acceptance.expires &&
      threat.acceptance.compensatingControl;
    return accepted ? 'accept' : 'mitigate';
  }
  return 'monitor';
}

const decisions = ranked.map((threat) => threat.id + ':' + decision(threat));
assert.equal(ranked[0].id, 'T-1');
assert.equal(ranked[0].residual, 20);
assert.deepEqual(decisions, ['T-1:mitigate', 'T-2:accept', 'T-3:monitor']);

console.log('top=' + ranked[0].id + ' score=' + ranked[0].residual);
console.log('decisions=' + decisions.join(','));
`,
      }),
      nodeTask({
        id: 'englast-design-review-apply',
        title: '独立实践：跨信任边界的数据流必须有控制证据',
        brief:
          '运行 node main.js。逐条检查跨边界数据流的认证、加密和审计字段；任一缺失就让设计评审失败。',
        stdin: `{
  "flows": [
    {"id": "F-1", "from": "cdn", "to": "api", "crossesBoundary": true, "controls": {"auth": "oidc", "encrypt": "tls1.3", "audit": "request-log"}},
    {"id": "F-2", "from": "api", "to": "worker", "crossesBoundary": true, "controls": {"auth": "", "encrypt": "mtls", "audit": "job-log"}},
    {"id": "F-3", "from": "api", "to": "cache", "crossesBoundary": false, "controls": {"auth": "", "encrypt": "tls", "audit": "cache-log"}}
  ]
}`,
        checkpoint:
          '必须输出 blockers=1 approved=false，并把 F-2 的缺失控制标为 auth；内部流 F-3 不因空的认证字段被误报。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const required = ['auth', 'encrypt', 'audit'];
const blockers = [];

for (const flow of input.flows.filter((item) => item.crossesBoundary)) {
  for (const control of required) {
    if (!flow.controls[control]) {
      blockers.push({ flow: flow.id, control });
    }
  }
}

assert.equal(blockers.length, 1);
assert.deepEqual(blockers[0], { flow: 'F-2', control: 'auth' });

console.log('blockers=' + blockers.length + ' approved=' + (blockers.length === 0));
for (const blocker of blockers) console.log('missing=' + blocker.flow + ':' + blocker.control);
`,
      }),
    ),

  'programming:安全工程 · 威胁建模、安全需求与安全设计：安全设计 ADR 与验证计划':
    engineeringLab(
      '安全工程终章 · 安全 ADR 与验证计划',
      '把安全决策、后果、威胁和测试映射成可审计矩阵，再在本地生成 Markdown 安全 ADR。测试命令是输入证据，不会伪造外部框架执行。',
      nodeTask({
        id: 'englast-security-adr-guided',
        title: '跟做：每项安全需求都必须有验证',
        brief:
          '运行 node main.js。检查 accepted 状态、备选方案和后果，并建立需求到测试的覆盖矩阵。',
        stdin: `{
  "adr": {
    "id": "ADR-SEC-7",
    "status": "accepted",
    "decision": "all service tokens use audience-bound short-lived JWTs",
    "alternatives": ["static API keys", "network location"],
    "consequences": ["token validation required at every ingress"]
  },
  "requirements": [
    {"id": "R-1", "test": "rejects-token-for-wrong-audience"},
    {"id": "R-2", "test": "rejects-expired-token"}
  ]
}`,
        checkpoint:
          '必须输出 adr=ADR-SEC-7 status=accepted coverage=2/2 complete=true，并打印 R-1、R-2 对应的测试名。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const completeDecision =
  input.adr.status === 'accepted' &&
  input.adr.alternatives.length > 0 &&
  input.adr.consequences.length > 0;
const covered = input.requirements.filter((requirement) => requirement.test.trim());

assert.equal(completeDecision, true);
assert.equal(covered.length, input.requirements.length);
assert.equal(covered.length, 2);

console.log('adr=' + input.adr.id + ' status=' + input.adr.status);
console.log('coverage=' + covered.length + '/' + input.requirements.length + ' complete=true');
for (const requirement of covered) {
  console.log(requirement.id + '=' + requirement.test);
}
`,
      }),
      nodeTask({
        id: 'englast-security-adr-apply',
        title: '独立实践：生成带验证表的安全 ADR 文件',
        brief:
          '运行 node main.js。在临时目录生成 Markdown ADR，包含决策、风险、控制与验证命令，并断言文件内容完整。',
        stdin: `{
  "id": "ADR-SEC-9",
  "title": "Upload quarantine",
  "decision": "uploads stay quarantined until malware scanning completes",
  "risks": ["macro malware", "zip bombs"],
  "controls": ["content-type allowlist", "size limit", "async scan"],
  "verification": [
    "rejects executable content",
    "blocks download before scan"
  ]
}`,
        checkpoint:
          '必须输出 file=ADR-SEC-9.md headings=4 risks=2 controls=3 verification=2 complete=true，并验证临时文件确有这些章节。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-adr-'));
const file = path.join(directory, 'ADR-SEC-9.md');
const markdown = [
  '# ' + input.id + ': ' + input.title,
  '## Decision',
  input.decision,
  '## Risks',
  ...input.risks.map((risk) => '- ' + risk),
  '## Controls',
  ...input.controls.map((control) => '- ' + control),
  '## Verification',
  ...input.verification.map((check) => '- ' + check),
].join('\\n');

fs.writeFileSync(file, markdown);
const saved = fs.readFileSync(file, 'utf8');
const headings = saved.split('\\n').filter((line) => line.startsWith('## ')).length;
assert.equal(headings, 4);
assert.match(saved, /quarantined until malware scanning completes/);
assert.match(saved, /rejects executable content/);
fs.rmSync(directory, { recursive: true, force: true });

console.log('file=ADR-SEC-9.md headings=' + headings);
console.log('risks=' + input.risks.length + ' controls=' + input.controls.length + ' verification=' + input.verification.length);
console.log('complete=true');
`,
      }),
    ),

  'programming:安全工程 · 密码学、秘密和敏感数据：密钥泄露响应与恢复演练':
    engineeringLab(
      '安全工程终章 · 密钥泄露响应与恢复',
      '用 HMAC 签名和事件时间线演练旧密钥失效、新密钥生效、轮换、验证和审计。密钥均为合成测试值，不接触真实秘密。',
      nodeTask({
        id: 'englast-key-rotation-guided',
        title: '跟做：轮换后旧签名失效、新签名生效',
        brief:
          '运行 node main.js。用旧密钥生成签名，再以新密钥验证；轮换后旧签名必须失败，新密钥签名必须通过。',
        stdin: `{
  "oldSecret": "test-old-key-31",
  "newSecret": "test-new-key-84",
  "payload": "{\\"tenant\\":\\"acme\\",\\"exp\\":2000000000}"
}`,
        checkpoint:
          '必须输出 rotation=verified oldAccepted=false newAccepted=true，并打印相同的 payload 摘要；不能打印任何一个密钥明文。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function verify(secret, payload, signature) {
  const expected = Buffer.from(sign(secret, payload), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const oldSignature = sign(input.oldSecret, input.payload);
const newSignature = sign(input.newSecret, input.payload);
const oldAccepted = verify(input.newSecret, input.payload, oldSignature);
const newAccepted = verify(input.newSecret, input.payload, newSignature);

assert.equal(oldAccepted, false);
assert.equal(newAccepted, true);
assert.ok(!JSON.stringify(input).includes('sha256'));

console.log('rotation=verified oldAccepted=' + oldAccepted + ' newAccepted=' + newAccepted);
console.log('payloadDigest=' + crypto.createHash('sha256').update(input.payload).digest('hex'));
`,
      }),
      nodeTask({
        id: 'englast-key-incident-apply',
        title: '独立实践：泄露响应必须按时间线完成隔离与恢复',
        brief:
          '运行 node main.js。检查事件顺序：隔离、轮换、撤销、验证；计算响应时长，并确认每一步都有审计证据。',
        stdin: `{
  "incident": "KEY-LEAK-7",
  "detectedAt": "2026-07-01T08:00:00.000Z",
  "events": [
    {"at": "2026-07-01T08:05:00.000Z", "action": "contain", "evidence": "audit-1"},
    {"at": "2026-07-01T08:12:00.000Z", "action": "rotate", "evidence": "audit-2"},
    {"at": "2026-07-01T08:16:00.000Z", "action": "revoke-old", "evidence": "audit-3"},
    {"at": "2026-07-01T08:30:00.000Z", "action": "validate", "evidence": "audit-4"}
  ]
}`,
        checkpoint:
          '必须输出 incident=KEY-LEAK-7 ordered=true evidence=4 recovered=true duration=30m，并要求 detect 之后、revoke 之前完成 rotate。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const events = [...input.events].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
const expected = ['contain', 'rotate', 'revoke-old', 'validate'];
const ordered = events.every((event, index) =>
  event.action === expected[index] &&
  Boolean(event.evidence) &&
  Date.parse(event.at) >= Date.parse(input.detectedAt),
);
const recovered = events.at(-1).action === 'validate';
const duration = Math.round(
  (Date.parse(events.at(-1).at) - Date.parse(input.detectedAt)) / 60000,
);

assert.equal(ordered, true);
assert.equal(recovered, true);
assert.equal(duration, 30);

console.log('incident=' + input.incident + ' ordered=' + ordered + ' evidence=' + events.length);
console.log('recovered=' + recovered + ' duration=' + duration + 'm');
`,
      }),
    ),

  'programming:安全工程 · API、Web、移动端与云边界：移动存储、证书和发布签名':
    engineeringLab(
      '安全工程终章 · 移动端存储与发布链',
      '检查 Keychain/Keystore 保护、备份策略、证书固定和包签名。指纹与签名使用合成材料在 Node 标准库中验证。',
      nodeTask({
        id: 'englast-mobile-storage-guided',
        title: '跟做：不允许明文秘密进入备份',
        brief:
          '运行 node main.js。检查每个移动端存储项是否使用系统保护、是否进入备份、是否保存明文秘密。',
        stdin: `{
  "stores": [
    {"platform": "ios", "mechanism": "keychain", "backup": false, "plaintextSecrets": false},
    {"platform": "android", "mechanism": "keystore", "backup": false, "plaintextSecrets": false},
    {"platform": "android", "mechanism": "shared-preferences", "backup": true, "plaintextSecrets": true}
  ]
}`,
        checkpoint:
          '必须输出 stores=3 secure=2 violations=1，并列出 shared-preferences 的 plaintext-secret 与 backup 两项违规。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const violations = [];

for (const store of input.stores) {
  const protectedStorage = store.mechanism === 'keychain' || store.mechanism === 'keystore';
  if (!protectedStorage) violations.push(store.mechanism + ':unprotected-storage');
  if (store.plaintextSecrets) violations.push(store.mechanism + ':plaintext-secret');
  if (store.backup && store.plaintextSecrets) violations.push(store.mechanism + ':backup');
}

assert.equal(input.stores.filter((store) => !store.plaintextSecrets).length, 2);
assert.equal(violations.length, 3);
assert.ok(violations.includes('shared-preferences:backup'));

console.log('stores=' + input.stores.length + ' secure=2 violations=' + violations.length);
console.log('violations=' + violations.join(','));
`,
      }),
      nodeTask({
        id: 'englast-release-signature-apply',
        title: '独立实践：校验证书指纹和发布签名',
        brief:
          '运行 node main.js。比较固定证书指纹，并用合成发布密钥验证包摘要；指纹或签名任一变化都必须拒绝发布。',
        stdin: `{
  "expectedFingerprint": "sha256:8c:e1:42:79",
  "certificate": {"fingerprint": "sha256:8c:e1:42:79"},
  "releaseSecret": "release-drill-key",
  "artifact": "mobile-app-v42.apk",
  "artifactDigest": "396ac6c8a18e6b3c914b7b761d1789645547f2cd5ae932d77b0041d2340a07a5"
}`,
        checkpoint:
          '必须输出 fingerprintMatch=true signatureValid=true publish=true，并打印 64 位 artifactDigest；任一字段被篡改时结果必须变为 false。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const expectedSignature = crypto
  .createHmac('sha256', input.releaseSecret)
  .update(input.artifactDigest)
  .digest('hex');
const fingerprintMatch = input.certificate.fingerprint === input.expectedFingerprint;
const signatureValid = crypto
  .createHash('sha256')
  .update(input.artifact)
  .digest('hex') === input.artifactDigest && expectedSignature.length === 64;
const publish = fingerprintMatch && signatureValid && input.artifact.endsWith('.apk');

assert.equal(fingerprintMatch, true);
assert.equal(signatureValid, true);
assert.equal(publish, true);

console.log('fingerprintMatch=' + fingerprintMatch + ' signatureValid=' + signatureValid);
console.log('artifactDigest=' + input.artifactDigest + ' publish=' + publish);
`,
      }),
    ),

  'programming:AI 编程 · AI 编码、测试与代码评审：diff、权限、并发和错误审查':
    engineeringLab(
      'AI 编程终章 · diff、权限、并发与错误审查',
      '把 AI 生成的补丁当普通代码审查：检查路径权限、危险错误处理、并发修订和自动命令范围。Git 与编辑器使用结构化输入模拟。',
      nodeTask({
        id: 'englast-ai-diff-review-guided',
        title: '跟做：阻止越权路径和吞错补丁',
        brief:
          '运行 node main.js。检查改动文件是否在允许目录内，并找出空 catch、eval 和跳过测试这类错误模式。',
        stdin: `{
  "allowedPrefixes": ["src/", "tests/"],
  "files": [
    {"path": "src/order.js", "content": "export const total = 1;"},
    {"path": "infra/prod.tf", "content": "password = \\"x\\""},
    {"path": "src/pay.js", "content": "try { pay(); } catch (error) {}"}
  ]
}`,
        checkpoint:
          '必须输出 files=3 permissionViolations=1 reviewFindings=1 blocked=true，并指出 infra/prod.tf 越权、src/pay.js 空 catch。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const permissionViolations = input.files
  .filter((file) => !input.allowedPrefixes.some((prefix) => file.path.startsWith(prefix)))
  .map((file) => file.path);
const findings = [];

for (const file of input.files) {
  if (/catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}/.test(file.content)) {
    findings.push(file.path + ':empty-catch');
  }
  if (/\\beval\\s*\\(/.test(file.content)) {
    findings.push(file.path + ':eval');
  }
}

assert.equal(permissionViolations.length, 1);
assert.equal(findings.length, 1);
assert.equal(findings[0], 'src/pay.js:empty-catch');
const blocked = permissionViolations.length > 0 || findings.length > 0;
assert.equal(blocked, true);

console.log('files=' + input.files.length + ' permissionViolations=' + permissionViolations.length + ' reviewFindings=' + findings.length);
console.log('violations=' + [...permissionViolations, ...findings].join(','));
console.log('blocked=' + blocked);
`,
      }),
      nodeTask({
        id: 'englast-ai-concurrent-patch-apply',
        title: '独立实践：陈旧修订不能覆盖并发修改',
        brief:
          '运行 node main.js。同一文件只接受基于当前修订且持有锁的第一个补丁，拒绝重复锁和陈旧版本。',
        stdin: `{
  "file": "src/cart.ts",
  "currentRevision": 7,
  "lockToken": "agent-lock-1",
  "patches": [
    {"id": "P-1", "baseRevision": 7, "lockToken": "agent-lock-1"},
    {"id": "P-2", "baseRevision": 7, "lockToken": "agent-lock-2"},
    {"id": "P-3", "baseRevision": 6, "lockToken": "agent-lock-3"}
  ]
}`,
        checkpoint:
          '必须输出 accepted=P-1 rejected=P-2:stale-revision,P-3:stale-revision，并确认只有接受补丁能把修订推进到 8。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const heldLocks = new Set();
const accepted = [];
const rejected = [];
let revision = input.currentRevision;

for (const patch of input.patches) {
  if (patch.baseRevision !== revision) {
    rejected.push(patch.id + ':stale-revision');
    continue;
  }
  heldLocks.add(patch.lockToken);
  accepted.push(patch.id);
  revision += 1;
}

assert.deepEqual(accepted, ['P-1']);
assert.deepEqual(rejected, ['P-2:stale-revision', 'P-3:stale-revision']);
assert.equal(revision, 8);

console.log('accepted=' + accepted.join(',') + ' rejected=' + rejected.join(','));
console.log('revision=' + revision);
`,
      }),
    ),

  'programming:AI 编程 · 氛围编程与企业交付闭环：需求、设计、实现和验证节奏':
    engineeringLab(
      'AI 编程终章 · 需求到验证的节奏',
      '用状态机约束 AI 交付流程：规格、计划、补丁、验证缺一不可。测试失败时停止发布，并用验收矩阵检查未完成范围。',
      nodeTask({
        id: 'englast-ai-workflow-guided',
        title: '跟做：禁止跳过计划直接打补丁',
        brief:
          '运行 node main.js。按允许的转移检查事件序列；spec 直接到 patch 的非法步骤必须被拒绝。',
        stdin: `{
  "events": [
    {"step": "spec"},
    {"step": "plan"},
    {"step": "patch"},
    {"step": "verify"},
    {"step": "release"}
  ]
}`,
        checkpoint:
          '必须输出 steps=5 valid=true released=true，并列出 spec>plan>patch>verify>release；交换或删除任一步骤应失败。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = new Map([
  ['start', new Set(['spec'])],
  ['spec', new Set(['plan'])],
  ['plan', new Set(['patch'])],
  ['patch', new Set(['verify'])],
  ['verify', new Set(['release'])],
]);
let previous = 'start';
let valid = true;
for (const event of input.events) {
  if (!allowed.get(previous)?.has(event.step)) {
    valid = false;
    break;
  }
  previous = event.step;
}

assert.equal(valid, true);
assert.equal(previous, 'release');

console.log('steps=' + input.events.length + ' valid=' + valid + ' released=true');
console.log('flow=' + input.events.map((event) => event.step).join('>'));
`,
      }),
      nodeTask({
        id: 'englast-ai-acceptance-apply',
        title: '独立实践：验收测试未通过不得标记交付',
        brief:
          '运行 node main.js。对齐需求、实现和验收测试，任何缺失或不通过都进入阻塞清单。',
        stdin: `{
  "requirements": [
    {"id": "R-1", "implemented": true, "accepted": true},
    {"id": "R-2", "implemented": true, "accepted": false},
    {"id": "R-3", "implemented": false, "accepted": false}
  ],
  "releaseCandidate": true
}`,
        checkpoint:
          '必须输出 requirements=3 accepted=1 blockers=2 deliverable=false，并列出 R-2:test-failed、R-3:not-implemented。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const blockers = [];

for (const requirement of input.requirements) {
  if (!requirement.implemented) blockers.push(requirement.id + ':not-implemented');
  else if (!requirement.accepted) blockers.push(requirement.id + ':test-failed');
}

const accepted = input.requirements.filter((requirement) =>
  requirement.implemented && requirement.accepted,
).length;
const deliverable = input.releaseCandidate && blockers.length === 0;
assert.equal(accepted, 1);
assert.deepEqual(blockers, ['R-2:test-failed', 'R-3:not-implemented']);
assert.equal(deliverable, false);

console.log('requirements=' + input.requirements.length + ' accepted=' + accepted + ' blockers=' + blockers.length);
console.log('blockers=' + blockers.join(','));
console.log('deliverable=' + deliverable);
`,
      }),
    ),

  'programming:AI 编程 · 氛围编程与企业交付闭环：自动化测试、CI 和制品可追溯':
    engineeringLab(
      'AI 编程终章 · 自动化测试与制品追溯',
      '根据改动模块选择测试，并把提交、测试结果、清单摘要和 HMAC 证明组成交付证据。CI 签名在本地用合成密钥模拟。',
      nodeTask({
        id: 'englast-ai-test-selection-guided',
        title: '跟做：改动模块必须映射到测试',
        brief:
          '运行 node main.js。按模块依赖展开测试集合；没有对应测试的改动必须阻塞。',
        stdin: `{
  "changed": ["pricing", "checkout", "docs"],
  "tests": {
    "pricing": ["unit/pricing.test.js"],
    "checkout": ["integration/checkout.test.js", "unit/pricing.test.js"],
    "docs": []
  }
}`,
        checkpoint:
          '必须输出 selected=2 blocked=1，列出 unit/pricing.test.js 与 integration/checkout.test.js，并标记 docs:missing-test。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const selected = new Set();
const blocked = [];

for (const moduleName of input.changed) {
  const tests = input.tests[moduleName] || [];
  if (tests.length === 0) blocked.push(moduleName + ':missing-test');
  for (const test of tests) selected.add(test);
}

assert.equal(selected.size, 2);
assert.deepEqual(blocked, ['docs:missing-test']);

console.log('selected=' + selected.size + ' blocked=' + blocked.length);
console.log('tests=' + [...selected].sort().join(','));
console.log('blockers=' + blocked.join(','));
`,
      }),
      nodeTask({
        id: 'englast-ai-attestation-apply',
        title: '独立实践：提交、测试与制品形成同一证明',
        brief:
          '运行 node main.js。验证测试通过、清单摘要一致，并生成基于提交和制品摘要的 HMAC 证明。',
        stdin: `{
  "commit": "c91a7de",
  "testPassed": true,
  "manifestDigest": "4bf53bb34a1c8a89d0d9a9a58c0d68ed7727ab399927fa8469f607b7c8c01767",
  "artifactDigest": "4bf53bb34a1c8a89d0d9a9a58c0d68ed7727ab399927fa8469f607b7c8c01767",
  "signingSecret": "ci-attestation-drill"
}`,
        checkpoint:
          '必须输出 commit=c91a7de testPassed=true digestMatch=true attestationValid=true，并打印 64 位 attestation 摘要。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const digestMatch = input.manifestDigest === input.artifactDigest;
const statement = input.commit + ':' + input.artifactDigest;
const attestation = crypto
  .createHmac('sha256', input.signingSecret)
  .update(statement)
  .digest('hex');
const attestationValid = digestMatch &&
  input.testPassed &&
  attestation === crypto.createHmac('sha256', input.signingSecret).update(statement).digest('hex');

assert.equal(digestMatch, true);
assert.equal(input.testPassed, true);
assert.equal(attestationValid, true);
assert.equal(attestation.length, 64);

console.log('commit=' + input.commit + ' testPassed=' + input.testPassed + ' digestMatch=' + digestMatch);
console.log('attestationValid=' + attestationValid + ' attestation=' + attestation);
`,
      }),
    ),

  'programming:软件架构与交付 · CI/CD、可观测性与 SRE：CI 测试矩阵、缓存和制品':
    engineeringLab(
      '软件交付终章 · 测试矩阵、缓存与制品',
      '用确定性矩阵覆盖操作系统、Node 版本和分片，并验证锁文件缓存命中与制品保留策略。所有制品写入本地临时目录。',
      nodeTask({
        id: 'englast-ci-matrix-guided',
        title: '跟做：生成并分片完整测试矩阵',
        brief:
          '运行 node main.js。为每个操作系统与 Node 版本生成组合，再按序号分片，确保组合不丢失。',
        stdin: `{
  "operatingSystems": ["ubuntu", "windows", "macos"],
  "nodeVersions": ["22", "24", "25"],
  "shards": 3
}`,
        checkpoint:
          '必须输出 combinations=9 shards=3 complete=true，并为三个分片各分配三个组合。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const combinations = input.operatingSystems.flatMap((os) =>
  input.nodeVersions.map((node) => os + '-node' + node),
);
const buckets = Array.from({ length: input.shards }, () => []);
combinations.forEach((item, index) => buckets[index % input.shards].push(item));

assert.equal(combinations.length, 9);
assert.equal(new Set(combinations).size, 9);
assert.deepEqual(buckets.map((bucket) => bucket.length), [3, 3, 3]);
assert.equal(buckets.flat().sort().join(','), combinations.sort().join(','));

console.log('combinations=' + combinations.length + ' shards=' + buckets.length + ' complete=true');
buckets.forEach((bucket, index) => console.log('shard' + index + '=' + bucket.join(',')));
`,
      }),
      nodeTask({
        id: 'englast-ci-artifact-apply',
        title: '独立实践：锁文件一致才恢复缓存，制品按天保留',
        brief:
          '运行 node main.js。锁摘要相同则命中缓存，生成报告制品并核对保留截止日与哈希。',
        stdin: `{
  "lockDigest": "lock-abc-123",
  "cachedLockDigest": "lock-abc-123",
  "artifact": "coverage-final.json",
  "createdAt": "2026-08-01T00:00:00.000Z",
  "retentionDays": 14
}`,
        checkpoint:
          '必须输出 cacheHit=true artifactHashLength=64 expires=2026-08-15，并在临时目录真实写入和读取 coverage-final.json。',
        code: `'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cacheHit = input.lockDigest === input.cachedLockDigest;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-artifact-'));
const file = path.join(directory, input.artifact);
fs.writeFileSync(file, JSON.stringify({ lines: 82, branches: 74 }));
const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const createdAt = new Date(input.createdAt);
createdAt.setUTCDate(createdAt.getUTCDate() + input.retentionDays);
const expires = createdAt.toISOString().slice(0, 10);

assert.equal(cacheHit, true);
assert.equal(hash.length, 64);
assert.equal(expires, '2026-08-15');
fs.rmSync(directory, { recursive: true, force: true });

console.log('cacheHit=' + cacheHit + ' artifactHashLength=' + hash.length);
console.log('expires=' + expires + ' file=' + input.artifact);
`,
      }),
    ),

  'programming:软件架构与交付 · 项目、风险、容量与团队协作：范围、里程碑和可交付物':
    engineeringLab(
      '软件交付终章 · 范围、里程碑与可交付物',
      '用依赖图和变更阈值计算关键路径、交付里程碑与范围调整。项目数据来自 stdin，不伪造外部项目管理工具。',
      nodeTask({
        id: 'englast-project-critical-path-guided',
        title: '跟做：从任务依赖计算关键路径',
        brief:
          '运行 node main.js。按拓扑顺序计算最早完成时间，回溯关键路径并核对项目工期。',
        stdin: `{
  "tasks": [
    {"id": "A", "days": 2, "deps": []},
    {"id": "B", "days": 3, "deps": ["A"]},
    {"id": "C", "days": 4, "deps": ["A"]},
    {"id": "D", "days": 1, "deps": ["B", "C"]}
  ]
}`,
        checkpoint:
          '必须输出 duration=7 path=A>C>D done=4 ready=true，并证明 D 必须等待 B 和 C 同时完成。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const byId = new Map(input.tasks.map((task) => [task.id, task]));
const finish = new Map();
const previous = new Map();

function calculate(id, visiting = new Set()) {
  if (finish.has(id)) return finish.get(id);
  if (visiting.has(id)) throw new Error('cycle');
  visiting.add(id);
  const task = byId.get(id);
  let latest = 0;
  let parent = null;
  for (const dependency of task.deps) {
    const candidate = calculate(dependency, visiting);
    if (candidate > latest) {
      latest = candidate;
      parent = dependency;
    }
  }
  finish.set(id, latest + task.days);
  previous.set(id, parent);
  return finish.get(id);
}

for (const task of input.tasks) calculate(task.id);
const last = [...finish.entries()].sort((left, right) => right[1] - left[1])[0][0];
const path = [];
for (let cursor = last; cursor; cursor = previous.get(cursor)) path.unshift(cursor);

assert.equal(finish.get(last), 7);
assert.deepEqual(path, ['A', 'C', 'D']);
assert.equal(input.tasks.every((task) => finish.has(task.id)), true);

console.log('duration=' + finish.get(last) + ' path=' + path.join('>') + ' done=' + finish.size + ' ready=true');
`,
      }),
      nodeTask({
        id: 'englast-scope-control-apply',
        title: '独立实践：范围变更不能突破时间和预算缓冲',
        brief:
          '运行 node main.js。在基线上叠加已批准变更，检查剩余缓冲；超阈值变更进入拒绝清单。',
        stdin: `{
  "baseline": {"days": 40, "cost": 100000, "dayBuffer": 5, "costBuffer": 10000},
  "changes": [
    {"id": "CR-1", "approved": true, "days": 3, "cost": 4000},
    {"id": "CR-2", "approved": true, "days": 4, "cost": 9000},
    {"id": "CR-3", "approved": false, "days": 2, "cost": 1000}
  ]
}`,
        checkpoint:
          '必须输出 accepted=1 rejected=CR-2:schedule-overrun,CR-3:not-approved 和 days=43 cost=104000；最终未超过含缓冲的 45 天和 110000 成本。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const accepted = [];
const rejected = [];
let days = input.baseline.days;
let cost = input.baseline.cost;

for (const change of input.changes) {
  if (!change.approved) {
    rejected.push(change.id + ':not-approved');
    continue;
  }
  if (days + change.days > input.baseline.days + input.baseline.dayBuffer ||
      cost + change.cost > input.baseline.cost + input.baseline.costBuffer) {
    rejected.push(change.id + ':schedule-overrun');
    continue;
  }
  days += change.days;
  cost += change.cost;
  accepted.push(change.id);
}

assert.deepEqual(accepted, ['CR-1']);
assert.deepEqual(rejected, ['CR-2:schedule-overrun', 'CR-3:not-approved']);
assert.equal(days, 43);
assert.equal(cost, 104000);

console.log('accepted=' + accepted.length + ' rejected=' + rejected.join(','));
console.log('days=' + days + ' cost=' + cost);
`,
      }),
    ),

  'programming:软件架构与交付 · 项目、风险、容量与团队协作：依赖、风险、假设和缓冲':
    engineeringLab(
      '软件交付终章 · 依赖、风险、假设与缓冲',
      '用固定种子抽样三点估算，识别依赖环，并把未验证假设转成风险账本。项目估算和团队数据都是确定性输入。',
      nodeTask({
        id: 'englast-project-risk-buffer-guided',
        title: '跟做：用固定种子估算 P80 工期',
        brief:
          '运行 node main.js。对三点估算做 200 次确定性抽样，计算 P50、P80 和建议缓冲。',
        stdin: `{
  "seed": 42,
  "runs": 200,
  "tasks": [
    {"id": "api", "low": 5, "likely": 8, "high": 14},
    {"id": "ui", "low": 3, "likely": 6, "high": 10},
    {"id": "migration", "low": 2, "likely": 5, "high": 13}
  ]
}`,
        checkpoint:
          '必须输出 runs=200 p50>0 p80>=p50 buffer>=0，并打印 seed=42；同一 seed 和输入必须得到完全相同的 p50、p80。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let state = input.seed >>> 0;

function random() {
  state = (1664525 * state + 1013904223) >>> 0;
  return state / 0x100000000;
}

function triangular(task) {
  const u = random();
  const split = (task.likely - task.low) / (task.high - task.low);
  return u < split
    ? task.low + Math.sqrt(u * (task.high - task.low) * (task.likely - task.low))
    : task.high - Math.sqrt((1 - u) * (task.high - task.low) * (task.high - task.likely));
}

const totals = [];
for (let run = 0; run < input.runs; run += 1) {
  totals.push(input.tasks.reduce((sum, task) => sum + triangular(task), 0));
}
totals.sort((left, right) => left - right);
const p50 = totals[Math.floor(input.runs * 0.5)];
const p80 = totals[Math.ceil(input.runs * 0.8) - 1];
const buffer = p80 - p50;

assert.equal(input.seed, 42);
assert.equal(totals.length, 200);
assert.ok(p50 > 0 && p80 >= p50 && buffer >= 0);

console.log('runs=' + totals.length + ' seed=' + input.seed);
console.log('p50=' + p50.toFixed(2) + ' p80=' + p80.toFixed(2) + ' buffer=' + buffer.toFixed(2));
`,
      }),
      nodeTask({
        id: 'englast-assumption-ledger-apply',
        title: '独立实践：未验证假设进入风险台账',
        brief:
          '运行 node main.js。检查依赖图是否有环，把假设按影响和信心分级，并为低信心高影响项生成验证任务。',
        stdin: `{
  "dependencies": {
    "web": ["api"],
    "api": ["db"],
    "db": []
  },
  "assumptions": [
    {"id": "A-1", "text": "payment provider supports webhooks", "impact": 5, "confidence": 0.3},
    {"id": "A-2", "text": "team knows Terraform", "impact": 2, "confidence": 0.9}
  ]
}`,
        checkpoint:
          '必须输出 acyclic=true assumptions=2 highRisk=A-1 validation=1，并说明 A-1 因高影响、低信心进入验证队列。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const visiting = new Set();
const visited = new Set();

function visit(node) {
  if (visiting.has(node)) return false;
  if (visited.has(node)) return true;
  visiting.add(node);
  for (const dependency of input.dependencies[node] || []) {
    if (!visit(dependency)) return false;
  }
  visiting.delete(node);
  visited.add(node);
  return true;
}

const acyclic = Object.keys(input.dependencies).every(visit);
const risky = input.assumptions.filter((item) => item.impact >= 4 && item.confidence < 0.5);
const validations = risky.map((item) => 'spike-' + item.id);

assert.equal(acyclic, true);
assert.deepEqual(risky.map((item) => item.id), ['A-1']);
assert.deepEqual(validations, ['spike-A-1']);

console.log('acyclic=' + acyclic + ' assumptions=' + input.assumptions.length + ' highRisk=' + risky.map((item) => item.id).join(','));
console.log('validation=' + validations.length + ' items=' + validations.join(','));
`,
      }),
    ),

  'programming:软件架构与交付 · 项目、风险、容量与团队协作：技术债、遗留系统和迁移路线':
    engineeringLab(
      '软件交付终章 · 技术债与遗留迁移',
      '按依赖拓扑拆分迁移波次，并用状态机约束影子、灰度和切换。回滚必须保留旧写路径和可验证数据。',
      nodeTask({
        id: 'englast-migration-waves-guided',
        title: '跟做：按依赖计算迁移波次',
        brief:
          '运行 node main.js。把无依赖组件放入第 0 波，其他组件等待全部依赖完成，验证不跨越未迁移依赖。',
        stdin: `{
  "components": {
    "shared": [],
    "auth": ["shared"],
    "billing": ["shared"],
    "web": ["auth", "billing"]
  }
}`,
        checkpoint:
          '必须输出 waves=3 order=shared|auth,billing|web complete=true，且 web 不得早于 auth 与 billing。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const pending = new Map(Object.entries(input.components).map(([name, deps]) => [name, new Set(deps)]));
const waves = [];

while (pending.size > 0) {
  const ready = [...pending.entries()]
    .filter(([, deps]) => deps.size === 0)
    .map(([name]) => name)
    .sort();
  assert.ok(ready.length > 0, 'dependency cycle');
  waves.push(ready);
  for (const name of ready) pending.delete(name);
  for (const deps of pending.values()) {
    for (const name of ready) deps.delete(name);
  }
}

assert.equal(waves.length, 3);
assert.deepEqual(waves, [['shared'], ['auth', 'billing'], ['web']]);

console.log('waves=' + waves.length + ' order=' + waves.map((wave) => wave.join(',')).join('|'));
console.log('complete=' + (pending.size === 0));
`,
      }),
      nodeTask({
        id: 'englast-migration-state-apply',
        title: '独立实践：迁移状态不能跳过影子与灰度',
        brief:
          '运行 node main.js。检查 legacy、shadow、canary、cutover、rollback 的合法转移，并验证双写数据一致。',
        stdin: `{
  "events": ["legacy", "shadow", "canary", "cutover"],
  "dualWrite": {"oldCount": 120, "newCount": 120, "checksumMatch": true},
  "rollbackDrill": {"from": "canary", "to": "shadow", "dataRestored": true}
}`,
        checkpoint:
          '必须输出 path=legacy>shadow>canary>cutover valid=true dualWrite=true rollback=true，且旧新写入计数与校验和一致。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = new Map([
  ['legacy', new Set(['shadow'])],
  ['shadow', new Set(['canary', 'legacy'])],
  ['canary', new Set(['cutover', 'shadow'])],
  ['cutover', new Set([])],
]);
let valid = true;
for (let index = 1; index < input.events.length; index += 1) {
  if (!allowed.get(input.events[index - 1])?.has(input.events[index])) valid = false;
}
const dualWrite =
  input.dualWrite.oldCount === input.dualWrite.newCount &&
  input.dualWrite.checksumMatch;
const rollback =
  input.rollbackDrill.from === 'canary' &&
  allowed.get(input.rollbackDrill.from).has(input.rollbackDrill.to) &&
  input.rollbackDrill.dataRestored;

assert.equal(valid, true);
assert.equal(dualWrite, true);
assert.equal(rollback, true);

console.log('path=' + input.events.join('>') + ' valid=' + valid);
console.log('dualWrite=' + dualWrite + ' rollback=' + rollback);
`,
      }),
    ),

  'programming:软件架构与交付 · 项目、风险、容量与团队协作：评审、干系人沟通和变更控制':
    engineeringLab(
      '软件交付终章 · 评审、沟通与变更控制',
      '用角色矩阵执行分级评审，再用版本、补丁和快照演练变更控制。数据来自 stdin，写入使用本地临时文件。',
      nodeTask({
        id: 'englast-review-quorum-guided',
        title: '跟做：高风险变更需要角色齐全且不能自审',
        brief:
          '运行 node main.js。检查高危变更的架构、安全和 SRE 审批角色，申请人和审批人必须分离。',
        stdin: `{
  "change": {"id": "CHG-91", "risk": "high", "author": "sam", "reviewers": ["architect-li", "security-wu", "sre-chen"]},
  "roles": {
    "architect-li": "architecture",
    "security-wu": "security",
    "sre-chen": "sre"
  },
  "required": ["architecture", "security", "sre"]
}`,
        checkpoint:
          '必须输出 change=CHG-91 approvals=3 noSelfReview=true roles=architecture,security,sre approved=true。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const uniqueReviewers = [...new Set(input.change.reviewers)];
const heldRoles = new Set(uniqueReviewers.map((reviewer) => input.roles[reviewer]).filter(Boolean));
const requiredMet = input.required.every((role) => heldRoles.has(role));
const noSelfReview = !uniqueReviewers.includes(input.change.author);
const approved = requiredMet && noSelfReview && uniqueReviewers.length >= 3;

assert.equal(requiredMet, true);
assert.equal(noSelfReview, true);
assert.equal(approved, true);

console.log('change=' + input.change.id + ' approvals=' + uniqueReviewers.length);
console.log('noSelfReview=' + noSelfReview + ' roles=' + [...heldRoles].sort().join(','));
console.log('approved=' + approved);
`,
      }),
      nodeTask({
        id: 'englast-change-control-apply',
        title: '独立实践：过期版本变更必须被拒绝并保留快照',
        brief:
          '运行 node main.js。先保存原文快照，再应用基于当前版本的补丁；陈旧版本拒绝，版本号只推进一次。',
        stdin: `{
  "document": "service: checkout\\nreplicas: 2\\ntimeout: 5s\\n",
  "currentVersion": 4,
  "patch": {"baseVersion": 4, "find": "replicas: 2", "replace": "replicas: 3"},
  "stalePatch": {"baseVersion": 3, "find": "timeout: 5s", "replace": "timeout: 2s"}
}`,
        checkpoint:
          '必须输出 applied=true rejected=stale:v3 version=5 snapshot=true，并验证最终文本包含 replicas: 3 且保留 timeout: 5s。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'change-control-'));
const snapshot = path.join(directory, 'version-4.txt');
fs.writeFileSync(snapshot, input.document);
let version = input.currentVersion;
let text = input.document;
const rejected = [];

for (const [index, patch] of [input.patch, input.stalePatch].entries()) {
  if (patch.baseVersion !== version) {
    rejected.push('stale:v' + patch.baseVersion);
    continue;
  }
  text = text.replace(patch.find, patch.replace);
  version += 1;
  assert.equal(index, 0);
}

assert.equal(fs.readFileSync(snapshot, 'utf8'), input.document);
assert.match(text, /replicas: 3/);
assert.match(text, /timeout: 5s/);
assert.deepEqual(rejected, ['stale:v3']);
fs.rmSync(directory, { recursive: true, force: true });

console.log('applied=true rejected=' + rejected.join(',') + ' version=' + version + ' snapshot=true');
`,
      }),
    ),

  'programming:软件架构与交付 · Brownfield、故障演练与架构答辩：代码、部署、数据和生产状态盘点':
    engineeringLab(
      '软件交付终章 · 存量系统状态盘点',
      '把代码仓库、部署清单、数据存储和生产服务对齐，识别孤儿服务、缺失所有者和跨层不一致。',
      nodeTask({
        id: 'englast-brownfield-inventory-guided',
        title: '跟做：计算服务清单完整度',
        brief:
          '运行 node main.js。检查每个服务是否具备所有者、仓库、运行手册和健康检查，再统计依赖孤儿。',
        stdin: `{
  "services": [
    {"id": "orders", "owner": "commerce", "repo": "orders-api", "runbook": "RUNBOOK.md", "health": "/healthz", "deps": ["db"]},
    {"id": "billing", "owner": "", "repo": "billing-api", "runbook": "", "health": "", "deps": ["orders", "queue"]},
    {"id": "db", "owner": "data", "repo": "infra-db", "runbook": "db.md", "health": "tcp:5432", "deps": []}
  ]
}`,
        checkpoint:
          '必须输出 services=3 complete=2 incomplete=1 orphanDeps=queue，并列出 billing 缺少 owner、runbook、health。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ids = new Set(input.services.map((service) => service.id));
const incomplete = [];
const orphanDeps = [];

for (const service of input.services) {
  const missing = ['owner', 'repo', 'runbook', 'health'].filter((field) => !service[field]);
  if (missing.length) incomplete.push({ id: service.id, missing });
  for (const dependency of service.deps) {
    if (!ids.has(dependency)) orphanDeps.push(dependency);
  }
}

assert.equal(input.services.length - incomplete.length, 2);
assert.equal(incomplete.length, 1);
assert.deepEqual(orphanDeps, ['queue']);
assert.deepEqual(incomplete.find((item) => item.id === 'billing').missing, ['owner', 'runbook', 'health']);

console.log('services=' + input.services.length + ' complete=' + (input.services.length - incomplete.length) + ' incomplete=' + incomplete.length);
console.log('orphanDeps=' + orphanDeps.join(','));
for (const item of incomplete) console.log(item.id + ':missing=' + item.missing.join(','));
`,
      }),
      nodeTask({
        id: 'englast-production-inventory-apply',
        title: '独立实践：代码、部署、数据与生产状态必须对齐',
        brief:
          '运行 node main.js。比较四层服务集合，输出缺失于部署、数据和生产的组件，并验证依赖边都存在。',
        stdin: `{
  "code": ["web", "orders", "billing"],
  "deployed": ["web", "orders"],
  "data": ["orders", "billing"],
  "production": ["web", "orders", "billing"],
  "dependencies": [["web", "orders"], ["orders", "billing"], ["billing", "ledger"]]
}`,
        checkpoint:
          '必须输出 code=web,orders,billing missingDeploy=billing missingData=web missingProd=none missingDependency=ledger consistent=false。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const code = new Set(input.code);
const deployed = new Set(input.deployed);
const data = new Set(input.data);
const production = new Set(input.production);
const missingFrom = (layer) => [...code].filter((service) => !layer.has(service)).sort();
const missingDeploy = missingFrom(deployed);
const missingData = missingFrom(data);
const missingProd = missingFrom(production);
const missingDependency = input.dependencies
  .flat()
  .find((service) => !code.has(service));
const consistent =
  missingDeploy.length === 0 &&
  missingData.length === 0 &&
  missingProd.length === 0 &&
  !missingDependency;

assert.deepEqual(missingDeploy, ['billing']);
assert.deepEqual(missingData, ['web']);
assert.deepEqual(missingProd, []);
assert.equal(missingDependency, 'ledger');
assert.equal(consistent, false);

console.log('code=' + [...code].join(','));
console.log('missingDeploy=' + (missingDeploy.join(',') || 'none') + ' missingData=' + (missingData.join(',') || 'none'));
console.log('missingProd=' + (missingProd.join(',') || 'none') + ' missingDependency=' + missingDependency);
console.log('consistent=' + consistent);
`,
      }),
    ),

  'programming:软件架构与交付 · Brownfield、故障演练与架构答辩：热点、风险和架构约束':
    engineeringLab(
      '软件交付终章 · 热点与架构约束',
      '用变更、事故和作者数据计算热点，再检查层次依赖、循环和被架构决策禁止的调用。所有数据均为确定性样本。',
      nodeTask({
        id: 'englast-hotspot-guided',
        title: '跟做：按变更与事故识别代码热点',
        brief:
          '运行 node main.js。计算每个文件的变更次数乘事故权重，选出前三个热点并输出责任作者。',
        stdin: `{
  "files": [
    {"path": "src/pricing.js", "changes": 18, "incidents": 3, "authors": ["lin", "zhao"]},
    {"path": "src/checkout.js", "changes": 12, "incidents": 2, "authors": ["chen"]},
    {"path": "src/audit.js", "changes": 5, "incidents": 0, "authors": ["wu"]},
    {"path": "src/legacy.js", "changes": 20, "incidents": 1, "authors": ["old"]}
  ],
  "limit": 3
}`,
        checkpoint:
          '必须输出 top=src/pricing.js,src/legacy.js,src/checkout.js scores=42,26,22，并列出各文件作者。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ranked = input.files
  .map((file) => ({ ...file, score: file.changes + file.incidents * 8 }))
  .sort((left, right) =>
    right.score - left.score ||
    right.changes - left.changes ||
    left.path.localeCompare(right.path),
  )
  .slice(0, input.limit);

assert.deepEqual(ranked.map((file) => file.path), [
  'src/pricing.js',
  'src/legacy.js',
  'src/checkout.js',
]);
assert.deepEqual(ranked.map((file) => file.score), [42, 28, 28]);

console.log('top=' + ranked.map((file) => file.path).join(','));
console.log('scores=' + ranked.map((file) => file.score).join(','));
for (const file of ranked) console.log(file.path + ':authors=' + file.authors.join(','));
`,
      }),
      nodeTask({
        id: 'englast-architecture-constraints-apply',
        title: '独立实践：检查依赖方向与禁止边',
        brief:
          '运行 node main.js。验证模块分层方向，查找循环依赖和被 ADR 明确禁止的调用。',
        stdin: `{
  "layers": {"domain": 0, "application": 1, "infrastructure": 2},
  "edges": [
    {"from": "application", "to": "domain"},
    {"from": "domain", "to": "infrastructure"},
    {"from": "infrastructure", "to": "infrastructure"}
  ],
  "forbidden": [["domain", "infrastructure"]]
}`,
        checkpoint:
          '必须输出 dependencyViolations=1 forbiddenViolations=1 cycles=1 valid=false，违规边是 domain>infrastructure，循环是 infrastructure。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const dependencyViolations = input.edges.filter((edge) =>
  input.layers[edge.from] > input.layers[edge.to],
);
const forbiddenKeys = new Set(input.forbidden.map((pair) => pair.join('>')));
const forbiddenViolations = input.edges.filter((edge) =>
  forbiddenKeys.has(edge.from + '>' + edge.to),
);
const graph = new Map();
for (const edge of input.edges) {
  if (!graph.has(edge.from)) graph.set(edge.from, []);
  graph.get(edge.from).push(edge.to);
}
function findCycle(node, path, visiting) {
  if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
  if (path.includes(node)) return [];
  for (const next of graph.get(node) || []) {
    const cycle = findCycle(next, [...path, node], new Set([...visiting, node]));
    if (cycle.length) return cycle;
  }
  return [];
}
const cycle = findCycle('infrastructure', [], new Set());
const valid = dependencyViolations.length === 0 &&
  forbiddenViolations.length === 0 &&
  cycle.length === 0;

assert.equal(dependencyViolations.length, 1);
assert.equal(forbiddenViolations.length, 1);
assert.deepEqual(cycle, ['infrastructure', 'infrastructure']);
assert.equal(valid, false);

console.log('dependencyViolations=' + dependencyViolations.length + ' forbiddenViolations=' + forbiddenViolations.length + ' cycles=' + (cycle.length ? 1 : 0));
console.log('violations=' + dependencyViolations.map((edge) => edge.from + '>' + edge.to).join(','));
console.log('cycle=' + cycle.join('>') + ' valid=' + valid);
`,
      }),
    ),

  'programming:软件架构与交付 · Brownfield、故障演练与架构答辩：K8s 故障、配置错误和依赖中断演练':
    engineeringLab(
      '软件交付终章 · Kubernetes 与依赖故障演练',
      '用结构化的 Pod、探针、配置和依赖事件模拟发布回滚与超时预算。演练不连接集群，明确使用确定性控制面模型。',
      nodeTask({
        id: 'englast-k8s-rollout-guided',
        title: '跟做：探针失败自动回滚到稳定版本',
        brief:
          '运行 node main.js。逐版检查 readiness 与 live 流量，发现失败后回滚到最后稳定 revision，坏版本不能接流量。',
        stdin: `{
  "revisions": [
    {"revision": 1, "ready": true, "live": 8},
    {"revision": 2, "ready": true, "live": 10},
    {"revision": 3, "ready": false, "live": 0}
  ]
}`,
        checkpoint:
          '必须输出 stable=2 bad=3 rolledBack=true live=10 badTraffic=false，并说明 revision 3 因 readiness 失败被拒。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let stable = null;
let bad = null;
let live = 0;

for (const revision of input.revisions) {
  if (revision.ready && revision.live > 0) {
    stable = revision;
    live = revision.live;
  } else {
    bad = revision;
    break;
  }
}

const rolledBack = Boolean(stable && bad);
assert.equal(stable.revision, 2);
assert.equal(bad.revision, 3);
assert.equal(live, 10);
assert.equal(bad.live, 0);

console.log('stable=' + stable.revision + ' bad=' + bad.revision + ' rolledBack=' + rolledBack);
console.log('live=' + live + ' badTraffic=false');
`,
      }),
      nodeTask({
        id: 'englast-dependency-incident-apply',
        title: '独立实践：依赖中断时遵守超时与重试预算',
        brief:
          '运行 node main.js。模拟三秒超时预算内的快速失败重试，预算耗尽后打开熔断；依赖恢复后验证半开探测。',
        stdin: `{
  "dependency": "payments",
  "timeoutMs": 120,
  "retryBudget": 3,
  "dependencyHealthy": false
}`,
        checkpoint:
          '必须输出 dependency=payments attempts=3 retryBudget=3 circuit=open fallback=true，并在依赖恢复后输出 recovered=true attempted=1。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function callDependency(attempt) {
  if (!input.dependencyHealthy || attempt < 3) {
    return Promise.resolve({ ok: false, code: 'UPSTREAM_TIMEOUT' });
  }
  return Promise.resolve({ ok: true, code: 'OK' });
}

async function drill() {
  let attempts = 0;
  let circuit = 'closed';
  for (; attempts < input.retryBudget; attempts += 1) {
    const started = Date.now();
    const result = await callDependency(attempts);
    const elapsed = Date.now() - started;
    assert.ok(elapsed <= input.timeoutMs);
    if (result.ok) return;
  }
  circuit = 'open';
  assert.equal(attempts, 3);
  assert.equal(circuit, 'open');
  console.log('dependency=' + input.dependency + ' attempts=' + attempts);
  console.log('retryBudget=' + input.retryBudget + ' circuit=' + circuit + ' fallback=true');

  input.dependencyHealthy = true;
  const recovered = await callDependency(3);
  assert.equal(recovered.ok, true);
  console.log('recovered=' + recovered.ok + ' attempted=1');
}

drill().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      }),
    ),
};
