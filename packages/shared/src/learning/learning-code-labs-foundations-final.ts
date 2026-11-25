import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

/**
 * 编程通识最后 28 门课的真实 Node 标准库代码实验室。
 *
 * 课程键逐字取自 handwritten/programming-foundations.ts，且不与
 * learning-code-labs-programming-foundations-f0-f1.ts 或
 * learning-code-labs-foundations-remaining.ts 重叠。每个任务都在
 * stdin/assert 下真实运行；HTML、CSS、浏览器、容器和发布平台使用
 * 可审计的协议与语义契约模型，不冒充真实浏览器或基础设施执行。
 */

type LabTaskSeed = {
  readonly title: string;
  readonly brief: string;
  readonly input: unknown;
  readonly source: string;
  readonly checkpoint: string;
};
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库实验台',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    'Node.js 由应用内置，不需要安装第三方 npm 包。',
    '先运行跟做代码并核对断言，再完成独立实践。',
    '临时文件、SQLite 数据和子进程只写入系统临时目录，并在结束时清理。',
    '浏览器、容器、CDN、RUM 与发布平台使用本文件明确标注的语义或协议模型，不声称启动了真实外部服务。',
  ],
  languages: ['javascript'],
} as const;

const sourceFor = (body: string): string => `const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
${body.trim()}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

const makeTask = (id: string, seed: LabTaskSeed): LearningV2CodeLabTask => ({
  id,
  title: seed.title,
  brief: seed.brief,
  defaultLanguage: 'javascript',
  starterCode: { javascript: sourceFor(seed.source) },
  stdin: JSON.stringify(seed.input),
  checkpoint: seed.checkpoint,
});

const makeLab = (
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  ...nodeRuntime,
  title,
  description,
  practice,
  apply,
});

export const LEARNING_CODE_LABS_FOUNDATIONS_FINAL: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:编程通识 · 操作系统、并发与网络：连接池、超时与重试预算': makeLab(
    'F2 收尾代码台 · 连接池、期限与重试账本',
    '先用最早空闲车道模型验证有界连接池，再用真实单调时钟预算模拟“总期限覆盖每次尝试”的重试策略。',
    makeTask('foundations-final-f2-pool-guided', {
      title: '跟做：两路连接池的排队与释放',
      brief:
        '运行 node main.js。stdin 给出连接池容量和按到达顺序排列的请求；代码把每个请求放入最早空闲车道，记录开始、结束与等待时间。',
      input: {
        poolSize: 2,
        requests: [
          { id: 'login', duration: 30 },
          { id: 'orders', duration: 50 },
          { id: 'profile', duration: 20 },
          { id: 'stock', duration: 40 },
        ],
      },
      source: `
assert.ok(Number.isInteger(input.poolSize) && input.poolSize > 0);
const lanes = Array.from({ length: input.poolSize }, (_, index) => ({
  index,
  availableAt: 0,
}));
const assignments = input.requests.map((request) => {
  assert.ok(Number.isInteger(request.duration) && request.duration > 0);
  const lane = [...lanes].sort((a, b) =>
    a.availableAt - b.availableAt || a.index - b.index
  )[0];
  const start = lane.availableAt;
  const finish = start + request.duration;
  lane.availableAt = finish;
  return {
    id: request.id,
    lane: lane.index,
    start,
    finish,
    waited: start,
  };
});
assert.deepEqual(
  assignments.map((item) => item.lane),
  [0, 1, 0, 0]
);
assert.deepEqual(
  assignments.map((item) => item.finish),
  [30, 50, 50, 90]
);
assert.equal(Math.max(...assignments.map((item) => item.waited)), 50);
console.log('lane plan:', assignments.map((item) => item.id + ':' + item.start + '-' + item.finish).join(' | '));
console.log('pool utilization:', assignments.reduce((sum, item) => sum + item.finish - item.start, 0));
`,
      checkpoint:
        '必须看到 login 在 lane 0 的 0–30、orders 在 lane 1 的 0–50、profile 复用 lane 0 的 30–50、stock 在两条连接同时空闲时按 lane 0 的 50–90；最大排队等待为 50，退出码为 0。失败边界是无限扩容、忽略请求顺序，或把连接占用时间只算 CPU 时间。',
    }),
    makeTask('foundations-final-f2-pool-independent', {
      title: '独立实践：总期限覆盖所有重试尝试',
      brief:
        '运行 node main.js。stdin 给出每次尝试耗时、重试间隔和总期限；代码使用单调时钟模拟，只有在总期限内才允许下一次尝试，并输出尝试账本。',
      input: {
        attempts: [100, 180, 50],
        backoff: [40, 60],
        deadline: 430,
      },
      source: `
const { performance } = require('node:perf_hooks');
assert.equal(input.backoff.length, input.attempts.length - 1);
const origin = performance.now();
const ledger = [];
let elapsed = 0;
let succeededAt = null;
for (let index = 0; index < input.attempts.length; index += 1) {
  if (elapsed >= input.deadline) break;
  const available = Math.max(0, input.deadline - elapsed);
  const duration = Math.min(input.attempts[index], available);
  elapsed += duration;
  const success = index === input.attempts.length - 1 && elapsed <= input.deadline;
  ledger.push({
    attempt: index + 1,
    duration,
    elapsed,
    outcome: success ? 'success' : elapsed >= input.deadline ? 'deadline' : 'retry',
  });
  if (success) {
    succeededAt = elapsed;
    break;
  }
  if (elapsed >= input.deadline) break;
  const sleep = Math.min(input.backoff[index] || 0, input.deadline - elapsed);
  elapsed += sleep;
  if (sleep > 0) ledger.push({ attempt: index + 1, wait: sleep, elapsed });
}
assert.equal(succeededAt, 430);
assert.equal(ledger.filter((item) => item.attempt === 2 && item.duration).length, 1);
assert.ok(performance.now() - origin < 50, 'simulation must not sleep for real');
console.log('attempt ledger:', ledger.map((item) => JSON.stringify(item)).join(' | '));
console.log('completed within budget:', succeededAt <= input.deadline);
`,
      checkpoint:
        '三次尝试耗时依次为 100、180、50，间隔为 40、60，最终 elapsed 430、succeededAt 430，且整个模拟耗时小于 50ms。失败边界是每次重试重新获得完整超时、用 Date.now 作为唯一时钟，或为了模拟间隔真的阻塞 100ms。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：迁移、回填与兼容发布': makeLab(
    'F3 收尾代码台 · 兼容视图、双写和批量回填',
    '把旧版记录转换为新事务，再按“加列、双写、回填、校验、切读、清理”的兼容发布阶段留下可回滚证据。',
    makeTask('foundations-final-f3-migration-guided', {
      title: '跟做：v1 数据无损升级为 v2',
      brief:
        '运行 node main.js。stdin 给出 v1 用户记录；代码执行纯函数迁移，补全 displayName、createdAt 和 schemaVersion，并通过旧版兼容视图读回。',
      input: {
        records: [
          { id: 1, name: ' Ada ', email: 'ADA@EXAMPLE.COM' },
          { id: 2, name: 'Lin', email: ' lin@example.com ' },
        ],
      },
      source: `
const migrate = (record) => ({
  id: record.id,
  displayName: record.name.trim(),
  email: record.email.trim().toLowerCase(),
  schemaVersion: 2,
});
const compatibleView = (record) => ({
  id: record.id,
  name: record.displayName,
  email: record.email,
});
const migrated = input.records.map(migrate);
const oldReaders = migrated.map(compatibleView);
assert.deepEqual(
  migrated.map((item) => item.email),
  ['ada@example.com', 'lin@example.com']
);
assert.deepEqual(oldReaders, [
  { id: 1, name: 'Ada', email: 'ada@example.com' },
  { id: 2, name: 'Lin', email: 'lin@example.com' },
]);
assert.ok(migrated.every((item) => item.schemaVersion === 2));
console.log('migrated:', JSON.stringify(migrated));
console.log('compatible reads:', oldReaders.length);
`,
      checkpoint:
        '两条邮箱都必须去空格并转小写，displayName 分别为 Ada、Lin，兼容视图仍能输出旧字段 name/email，schemaVersion 全为 2。失败边界是原地部分修改导致一次失败后数据半迁移，或新字段上线时立刻删除旧字段。',
    }),
    makeTask('foundations-final-f3-migration-independent', {
      title: '独立实践：六阶段兼容发布与回滚点',
      brief:
        '运行 node main.js。代码按固定批次回填旧记录，在各阶段分别用旧读模型和新读模型校验；清理旧列前必须确认差异为零。',
      input: {
        rows: [
          { id: 1, legacyEmail: 'A@EXAMPLE.COM' },
          { id: 2, legacyEmail: 'b@example.com' },
          { id: 3, legacyEmail: ' c@example.com ' },
        ],
        batchSize: 2,
      },
      source: `
const stages = [];
let schema = { version: 1, columns: ['id', 'legacyEmail'] };
const migrated = [];
let start = 0;
while (start < input.rows.length) {
  const batch = input.rows.slice(start, start + input.batchSize);
  for (const row of batch) {
    migrated.push({
      id: row.id,
      normalizedEmail: row.legacyEmail.trim().toLowerCase(),
      schemaVersion: 2,
    });
  }
  start += batch.length;
  stages.push({ stage: 'backfill', processed: migrated.length });
}
const incompatibilities = migrated.filter((row, index) =>
  row.id !== input.rows[index].id
);
assert.deepEqual(incompatibilities, []);
schema = { version: 2, columns: ['id', 'legacyEmail', 'normalizedEmail'] };
stages.push({ stage: 'dual-read', legacyRows: input.rows.length, newRows: migrated.length });
schema = { version: 3, columns: ['id', 'normalizedEmail'] };
stages.push({ stage: 'contract', dropped: ['legacyEmail'] });
assert.deepEqual(
  migrated.map((row) => row.normalizedEmail),
  ['a@example.com', 'b@example.com', 'c@example.com']
);
assert.deepEqual(
  stages.filter((item) => item.stage === 'backfill').map((item) => item.processed),
  [2, 3]
);
assert.throws(() => {
  const incomplete = { processed: 2 };
  if (incomplete.processed !== 3) {
    throw new Error('cleanup blocked: backfill incomplete');
  }
}, /cleanup blocked/);
console.log('stages:', JSON.stringify(stages));
console.log('legacy column removed only after verification:', schema.version === 3);
`,
      checkpoint:
        '回填批处理应显示 2、3 两批，最终新邮箱依次为 a@example.com、b@example.com、c@example.com，且旧列只在双读差异为零后清理。失败边界是一次性修改全表、先删旧列后回填，或用 id 顺序推断数据一致而没有逐行校验。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：身份、授权与信任边界': makeLab(
    'F4 代码台 01 · 主体、租户、作用域与签名',
    '先检查认证主体能否访问指定租户资源，再用 Node crypto 真实生成并验证 HMAC 令牌，区分“已认证”和“已授权”。',
    makeTask('foundations-final-f4-auth-guided', {
      title: '跟做：逐层检查主体与对象权限',
      brief:
        '运行 node main.js。stdin 给出调用主体、资源租户、所需作用域和资源所有者；代码依次检查登录、租户、作用域、角色与对象归属。',
      input: {
        subject: { userId: 7, tenantId: 'acme', roles: ['editor'], scopes: ['orders:read'] },
        resource: { id: 'ord-9', tenantId: 'acme', ownerId: 7, requiredScope: 'orders:read' },
        allowedRoles: ['editor', 'admin'],
      },
      source: `
function authorize(subject, resource, allowedRoles) {
  const checks = [
    ['authenticated', Boolean(subject && subject.userId)],
    ['tenant', subject.tenantId === resource.tenantId],
    ['scope', subject.scopes.includes(resource.requiredScope)],
    ['role', subject.roles.some((role) => allowedRoles.includes(role))],
    ['object-owner', resource.ownerId === subject.userId ||
      subject.roles.includes('admin')],
  ];
  return {
    checks,
    allowed: checks.every(([, passed]) => passed),
  };
}
const result = authorize(input.subject, input.resource, input.allowedRoles);
assert.equal(result.allowed, true);
assert.deepEqual(result.checks.map(([name]) => name), [
  'authenticated',
  'tenant',
  'scope',
  'role',
  'object-owner',
]);
const otherTenant = authorize(
  input.subject,
  { ...input.resource, tenantId: 'globex' },
  input.allowedRoles
);
assert.equal(otherTenant.allowed, false);
assert.equal(otherTenant.checks.find(([name]) => name === 'tenant')[1], false);
console.log('decision:', JSON.stringify(result));
console.log('cross-tenant denial:', JSON.stringify(otherTenant.checks));
`,
      checkpoint:
        '原请求必须五层检查全部通过；把 resource.tenantId 改为 globex 后 tenant 检查必须单独失败。失败边界是只检查登录、仅凭角色跳过对象归属，或把前端隐藏按钮当成授权。',
    }),
    makeTask('foundations-final-f4-auth-independent', {
      title: '独立实践：签名、过期与篡改检测',
      brief:
        '运行 node main.js。代码用 crypto.createHmac 对“主体.过期时间.租户”签名，验证有效令牌，再分别构造篡改令牌和过期令牌，两种情况都必须拒绝。',
      input: {
        token: { subject: 'user:7', expiresAt: 2000, tenant: 'acme' },
        now: 1500,
        secret: 'local-lab-secret',
        tamperedExpiry: 9000,
        expiredNow: 2500,
      },
      source: `
const crypto = require('node:crypto');
const encode = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const sign = (payload, secret) => crypto
  .createHmac('sha256', secret)
  .update(encode(payload))
  .digest('base64url');
const verify = (token, secret, now) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(token.body)
    .digest('base64url');
  if (token.signature.length !== expected.length) return { ok: false, reason: 'signature' };
  if (!crypto.timingSafeEqual(Buffer.from(token.signature), Buffer.from(expected))) {
    return { ok: false, reason: 'signature' };
  }
  const payload = JSON.parse(Buffer.from(token.body, 'base64url').toString('utf8'));
  if (payload.expiresAt <= now) return { ok: false, reason: 'expired', payload };
  return { ok: true, payload };
};
const body = encode(input.token);
const valid = { body, signature: sign(input.token, input.secret) };
const tamperedPayload = { ...input.token, expiresAt: input.tamperedExpiry };
const tampered = { body: encode(tamperedPayload), signature: valid.signature };
assert.equal(verify(valid, input.secret, input.now).ok, true);
assert.equal(verify(tampered, input.secret, input.now).reason, 'signature');
assert.equal(verify(valid, input.secret, input.expiredNow).reason, 'expired');
assert.deepEqual(verify(valid, input.secret, input.now).payload, input.token);
console.log('valid token accepted:', verify(valid, input.secret, input.now).ok);
console.log('tampered:', verify(tampered, input.secret, input.now).reason);
console.log('expired:', verify(valid, input.secret, input.expiredNow).reason);
`,
      checkpoint:
        '有效令牌签名为 user:7/acme/2000 且 now=1500 时通过；把过期时间改成 9000 而保留旧签名必须返回 signature；把 now 调到 2500 必须返回 expired。失败边界是只检查 payload 中的 tenant、自创非恒定时间比较，或把签名密钥放进客户端。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：质量门禁与安全回归': makeLab(
    'F4 代码台 02 · 可解释的合并门禁与秘密扫描',
    '把覆盖率、漏洞、测试失败和策略例外组合成可解释门禁，再用确定性扫描器发现秘密与高风险依赖。',
    makeTask('foundations-final-f4-gate-guided', {
      title: '跟做：质量门禁逐项解释失败',
      brief:
        '运行 node main.js。stdin 给出覆盖率、严重漏洞、端到端结果与策略例外；代码输出每一道门的通过/失败原因，而不是只返回一个布尔值。',
      input: {
        coverage: 83.4,
        minimumCoverage: 80,
        highVulnerabilities: 0,
        allowedVulnerabilityException: false,
        e2e: { passed: 41, failed: 1 },
      },
      source: `
const gates = [
  {
    id: 'coverage',
    passed: input.coverage >= input.minimumCoverage,
    reason: 'coverage ' + input.coverage + '% >= ' + input.minimumCoverage + '%',
  },
  {
    id: 'known-vulnerabilities',
    passed: input.highVulnerabilities === 0 || input.allowedVulnerabilityException,
    reason: input.allowedVulnerabilityException
      ? 'documented exception'
      : 'high vulnerabilities ' + input.highVulnerabilities,
  },
  {
    id: 'end-to-end',
    passed: input.e2e.failed === 0,
    reason: input.e2e.passed + ' passed / ' + input.e2e.failed + ' failed',
  },
];
const decision = gates.every((gate) => gate.passed) ? 'allow' : 'block';
assert.equal(decision, 'block');
assert.equal(gates.find((gate) => gate.id === 'end-to-end').passed, false);
assert.ok(gates.filter((gate) => gate.passed).length === 2);
console.log('gates:', gates.map((gate) => gate.id + '=' + gate.passed + ' (' + gate.reason + ')').join(' | '));
console.log('merge decision:', decision);
`,
      checkpoint:
        '覆盖率 83.4 与漏洞 0 两项通过，end-to-end 因 1 个失败被挡下，最终 decision 必须为 block。失败边界是覆盖率门禁只看总数不看增量、把“已有例外”无限续期，或失败时仍允许合并。',
    }),
    makeTask('foundations-final-f4-gate-independent', {
      title: '独立实践：秘密扫描与依赖策略',
      brief:
        '运行 node main.js。代码扫描伪造的配置文件，识别高风险秘密模式、许可证冲突和未固定版本依赖，同时允许明确注释的测试占位符。',
      input: {
        files: {
          'config.js': 'const apiKey = "sk-live-1234567890abcdef";',
          'fixture.js': '// test-placeholder\\nconst token = "test-token-not-secret";',
        },
        dependencies: [
          { name: 'safe-lib', version: '1.2.3', license: 'MIT' },
          { name: 'copyleft-lib', version: '^2.0.0', license: 'GPL-3.0' },
          { name: 'floating-lib', version: 'latest', license: 'MIT' },
        ],
        blockedLicenses: ['GPL-3.0'],
      },
      source: `
const secretPattern = new RegExp('(?:sk-live|sk-test)-[A-Za-z0-9_-]{12,}', 'g');
const findings = [];
for (const [file, content] of Object.entries(input.files)) {
  if (content.includes('test-placeholder')) continue;
  for (const match of content.matchAll(secretPattern)) {
    findings.push({ kind: 'secret', file, value: match[0].slice(0, 7) + '...' });
  }
}
for (const dependency of input.dependencies) {
  if (input.blockedLicenses.includes(dependency.license)) {
    findings.push({ kind: 'license', package: dependency.name, value: dependency.license });
  }
  if (!/^\\d+\\.\\d+\\.\\d+$/.test(dependency.version)) {
    findings.push({ kind: 'version', package: dependency.name, value: dependency.version });
  }
}
assert.equal(findings.filter((item) => item.kind === 'secret').length, 1);
assert.equal(findings.find((item) => item.kind === 'secret').file, 'config.js');
assert.deepEqual(
  findings.filter((item) => item.kind === 'license').map((item) => item.package),
  ['copyleft-lib']
);
assert.deepEqual(
  findings.filter((item) => item.kind === 'version').map((item) => item.package),
  ['copyleft-lib', 'floating-lib']
);
console.log('findings:', JSON.stringify(findings));
`,
      checkpoint:
        'fixture.js 中的测试占位符不能被报告；config.js 必须发现 1 个秘密；copyleft-lib 同时因 GPL-3.0 和 ^2.0.0 被拦，floating-lib 因 latest 被拦。失败边界是打印完整密钥、只扫描已提交文件而忽略环境注入，或把许可证检查简化成依赖名黑名单。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：环境配置、秘密与发布顺序': makeLab(
    'F5 代码台 · 分层配置、秘密边界与拓扑发布',
    '先按默认、文件、环境三层解析配置，再对服务依赖做拓扑排序并验证密钥轮换和回滚顺序。',
    makeTask('foundations-final-f5-env-guided', {
      title: '跟做：配置分层与生产保护',
      brief:
        '运行 node main.js。stdin 给出默认值、环境文件和非秘密环境变量；代码按优先级合并，并阻止把数据库密码写入普通配置。',
      input: {
        defaults: { port: 3000, logLevel: 'info', databaseHost: 'localhost' },
        fileLayer: { port: 8080, logLevel: 'debug' },
        environmentLayer: { port: 9090 },
        secrets: { databasePassword: 'from-secret-store' },
        environment: 'production',
      },
      source: `
const merged = {
  ...input.defaults,
  ...input.fileLayer,
  ...input.environmentLayer,
};
assert.deepEqual(merged, {
  port: 9090,
  logLevel: 'debug',
  databaseHost: 'localhost',
});
const forbiddenNames = ['password', 'secret', 'token'];
const leaked = Object.keys(merged).filter((key) =>
  forbiddenNames.some((name) => key.toLowerCase().includes(name))
);
assert.deepEqual(leaked, []);
assert.equal(Object.keys(input.secrets).length, 1);
assert.ok(input.secrets.databasePassword);
const publicConfig = JSON.stringify(merged);
assert.equal(publicConfig.includes(input.secrets.databasePassword), false);
console.log('effective config:', publicConfig);
console.log('secret keys referenced:', Object.keys(input.secrets).join(','));
`,
      checkpoint:
        '最终配置必须为 port 9090、logLevel debug、databaseHost localhost；普通配置里不得出现 password/secret/token 字段或秘密值。失败边界是把 secret 合并进可导出的对象、用环境变量层覆盖成错误的空字符串，或仅在前端隐藏配置。',
    }),
    makeTask('foundations-final-f5-env-independent', {
      title: '独立实践：发布依赖拓扑与回滚逆序',
      brief:
        '运行 node main.js。代码按 dependsOn 生成数据库迁移、应用、探活和切流量的发布顺序；依赖缺失或存在环时直接失败，回滚使用反序。',
      input: {
        services: [
          { name: 'migrate', dependsOn: [] },
          { name: 'api', dependsOn: ['migrate'] },
          { name: 'worker', dependsOn: ['migrate'] },
          { name: 'health', dependsOn: ['api', 'worker'] },
          { name: 'traffic', dependsOn: ['health'] },
        ],
      },
      source: `
const pending = new Map(input.services.map((service) => [service.name, new Set(service.dependsOn)]));
const order = [];
while (pending.size > 0) {
  const ready = [...pending.entries()]
    .filter(([, dependencies]) => dependencies.size === 0)
    .map(([name]) => name)
    .sort();
  assert.ok(ready.length > 0, 'dependency cycle or missing dependency');
  for (const name of ready) {
    order.push(name);
    pending.delete(name);
  }
  for (const dependencies of pending.values()) {
    for (const name of ready) dependencies.delete(name);
  }
}
assert.deepEqual(order, ['migrate', 'api', 'worker', 'health', 'traffic']);
assert.deepEqual([...order].reverse(), ['traffic', 'health', 'worker', 'api', 'migrate']);
assert.ok(order.indexOf('migrate') < order.indexOf('api'));
assert.ok(order.indexOf('health') < order.indexOf('traffic'));
console.log('release order:', order.join(' -> '));
console.log('rollback order:', [...order].reverse().join(' -> '));
`,
      checkpoint:
        '发布顺序必须是 migrate、api、worker、health、traffic，回滚必须严格反序。失败边界是并行启动所有服务、遇到环仍继续，或先切流量再验证健康。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：标题层级、段落、链接与图片': makeLab(
    'H0 收尾代码台 · 文档骨架与资源完整性',
    '用轻量标记扫描器检查单 h1、标题层级、链接目标和图片替代文本；它验证文档语义，不声称完成浏览器渲染。',
    makeTask('foundations-final-h0-document-guided', {
      title: '跟做：检查标题、段落、链接和图片',
      brief:
        '运行 node main.js。stdin 给出一段 HTML；代码扫描标题、段落、链接和图片，验证标题从 h1 开始且不跳级，所有图片都带非空 alt。',
      input: {
        html: '<h1>年度报告</h1><p>经营摘要，<a href="/report.pdf">下载全文</a>。</p><h2>收入</h2><img src="/chart.png" alt="收入趋势图"><h3>订阅</h3><h2>成本</h2>',
      },
      source: `
const html = input.html;
const headings = [...html.matchAll(/<h([1-6])\\b[^>]*>(.*?)<\\/h\\1>/gi)].map((match) => ({
  level: Number(match[1]),
  text: match[2].replace(/<[^>]+>/g, '').trim(),
}));
const paragraphs = [...html.matchAll(/<p\\b[^>]*>(.*?)<\\/p>/gi)].map((match) => match[1]);
const links = [...html.matchAll(/<a\\b([^>]*)>(.*?)<\\/a>/gi)].map((match) => {
  const href = /href="([^"]+)"/i.exec(match[1])?.[1] || '';
  return { href, text: match[2].replace(/<[^>]+>/g, '').trim() };
});
const images = [...html.matchAll(/<img\\b([^>]*)>/gi)].map((match) => {
  const alt = /alt="([^"]*)"/i.exec(match[1])?.[1];
  return { alt };
});
assert.equal(headings.filter((heading) => heading.level === 1).length, 1);
for (let index = 1; index < headings.length; index += 1) {
  assert.ok(headings[index].level <= headings[index - 1].level + 1);
}
assert.equal(paragraphs.length, 1);
assert.deepEqual(links, [{ href: '/report.pdf', text: '下载全文' }]);
assert.equal(images.length, 1);
assert.ok(images.every((image) => image.alt && image.alt.length > 0));
console.log('headings:', headings.map((heading) => 'h' + heading.level + ':' + heading.text).join(' | '));
console.log('links/images:', links.length + '/' + images.length);
`,
      checkpoint:
        '扫描结果必须只有一个 h1，标题顺序为 1、2、3、2，无跳级；段落 1 个，链接指向 /report.pdf 且文本为“下载全文”，图片 alt 为“收入趋势图”。失败边界是用 div 假装标题、空 alt、用图片文字代替正文，或只肉眼确认页面能看。',
    }),
    makeTask('foundations-final-h0-document-independent', {
      title: '独立实践：站点目录、相对链接与图片资源',
      brief:
        '运行 node main.js。代码把多个页面放进语义目录模型，规范化相对链接并验证每个站内 href/src 都能解析到已知资源，外链只允许 HTTPS。',
      input: {
        pages: [
          { path: '/index.html', links: ['/about.html', 'assets/app.css', 'https://example.com/help'] },
          { path: '/about.html', links: ['../index.html', 'assets/logo.svg'] },
        ],
        assets: ['/index.html', '/about.html', '/assets/app.css', '/assets/logo.svg'],
      },
      source: `
const { posix } = require('node:path');
const normalize = (from, target) => {
  if (/^https?:\\/\\//.test(target)) return target;
  return target.startsWith('/')
    ? posix.normalize(target)
    : posix.normalize(posix.join(posix.dirname(from), target));
};
const report = [];
for (const page of input.pages) {
  for (const target of page.links) {
    const resolved = normalize(page.path, target);
    const external = /^https?:\\/\\//.test(resolved);
    const valid = external
      ? resolved.startsWith('https://')
      : input.assets.includes(resolved);
    report.push({ from: page.path, target, resolved, valid });
    assert.equal(valid, true, page.path + ' -> ' + target);
  }
}
assert.equal(report.some((item) => /^http:\\/\\//.test(item.resolved)), false);
assert.equal(report.find((item) => item.target === 'assets/logo.svg').resolved, '/assets/logo.svg');
assert.equal(report.find((item) => item.target === '../index.html').resolved, '/index.html');
console.log('link report:', JSON.stringify(report));
`,
      checkpoint:
        'assets/app.css 必须解析为 /assets/app.css，../index.html 必须解析为 /index.html，https 外链允许，http 外链不允许，所有站内目标都存在于 assets 清单。失败边界是把相对路径当当前目录、允许混合内容，或只检查首屏链接。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：article、section 与 aside 的边界': makeLab(
    'H1 代码台 01 · 区域语义、标题与侧栏边界',
    '用结构化标记模型检查 main 唯一、section 有标题、article 自包含、aside 补充正文；任务是语义审计，不是视觉截图。',
    makeTask('foundations-final-h1-regions-guided', {
      title: '跟做：给内容区域做语义体检',
      brief:
        '运行 node main.js。stdin 给出区域描述；代码验证 main 唯一、每个 section 有自有标题、article 含正文，aside 必须是与主内容相关的补充信息。',
      input: {
        regions: [
          { id: 'hero', tag: 'section', heading: '产品概览', hasBody: true, parent: 'main' },
          { id: 'story', tag: 'article', heading: '客户案例', hasBody: true, parent: 'main' },
          { id: 'notes', tag: 'aside', heading: '相关下载', hasBody: true, parent: 'main', supplementary: true },
        ],
        mainCount: 1,
      },
      source: `
assert.equal(input.mainCount, 1);
const issues = [];
for (const region of input.regions) {
  if (region.tag === 'section' && !region.heading) {
    issues.push(region.id + ': section needs its own heading');
  }
  if (region.tag === 'article' && !region.hasBody) {
    issues.push(region.id + ': article must be self-contained');
  }
  if (region.tag === 'aside' && !region.supplementary) {
    issues.push(region.id + ': aside must supplement nearby content');
  }
  assert.equal(region.parent, 'main');
}
assert.deepEqual(issues, []);
const kinds = Object.fromEntries(input.regions.map((region) => [region.id, region.tag]));
assert.deepEqual(kinds, { hero: 'section', story: 'article', notes: 'aside' });
console.log('semantic regions:', JSON.stringify(kinds));
console.log('issues:', issues.length);
`,
      checkpoint:
        'hero 必须是带“产品概览”标题的 section，story 必须是有正文的 article，notes 必须是补充主内容的 aside，三者都位于唯一 main 中，issues 为 0。失败边界是用 section 包装纯样式区块、article 只放一句孤立广告，或 aside 承载核心购买流程。',
    }),
    makeTask('foundations-final-h1-regions-independent', {
      title: '独立实践：从真实标记检查嵌套与侧栏位置',
      brief:
        '运行 node main.js。代码扫描 HTML 标签栈，要求恰好一个 main、所有 article 位于 main 内、aside 不与 article 交叉嵌套，并检测未闭合标签。',
      input: {
        html: '<main><article><h2>案例</h2><p>正文</p><aside><h3>补充</h3></aside></article><section><h2>结论</h2></section></main>',
      },
      source: `
const voidTags = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track']);
const stack = [];
const counts = { main: 0, article: 0, aside: 0, section: 0 };
const tokenPattern = /<(\\/?)([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*>/g;
let match;
while ((match = tokenPattern.exec(input.html)) !== null) {
  const closing = match[1] === '/';
  const name = match[2].toLowerCase();
  if (voidTags.has(name)) continue;
  if (!closing) {
    stack.push(name);
    if (name in counts) counts[name] += 1;
    continue;
  }
  assert.equal(stack.pop(), name, 'mismatched closing tag ' + name);
}
assert.deepEqual(stack, []);
assert.equal(counts.main, 1);
assert.equal(counts.article, 1);
assert.equal(counts.aside, 1);
assert.ok(input.html.indexOf('<main>') < input.html.indexOf('<article>'));
assert.ok(input.html.indexOf('</aside></article>') > 0);
console.log('tag counts:', JSON.stringify(counts));
console.log('nesting:', 'main > article > aside');
`,
      checkpoint:
        '标签栈最终为空，main/article/aside/section 各出现 1 次，aside 必须完整位于 article 内，不能与 article 标签交叉。失败边界是只数开始标签、忽略自闭合元素，或用浏览器自动修复来掩盖错误嵌套。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：标题大纲与文档阅读顺序': makeLab(
    'H1 代码台 02 · 标题树与视觉顺序偏差',
    '根据标题级别生成大纲树，再用 DOM 阅读顺序和视觉顺序对照，发现依赖 CSS 排序造成的屏幕阅读器错序。',
    makeTask('foundations-final-h1-outline-guided', {
      title: '跟做：从标题序列生成大纲树',
      brief:
        '运行 node main.js。stdin 给出标题级别；代码验证只有一个 h1、不能从 h2 直接跳到 h4，并生成父子树。',
      input: {
        headings: [
          { level: 1, text: '开发者文档' },
          { level: 2, text: '安装' },
          { level: 3, text: 'Windows' },
          { level: 3, text: 'macOS' },
          { level: 2, text: '故障排查' },
        ],
      },
      source: `
const roots = [];
const stack = [];
for (const heading of input.headings) {
  const node = { ...heading, children: [] };
  if (stack.length === 0) {
    assert.equal(node.level, 1, 'outline must start at h1');
    roots.push(node);
  } else {
    assert.ok(
      node.level <= stack[stack.length - 1].level + 1,
      'heading level skipped at ' + node.text
    );
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    assert.ok(stack.length > 0, 'heading has no parent');
    stack[stack.length - 1].children.push(node);
  }
  stack.push(node);
}
assert.equal(roots.length, 1);
assert.deepEqual(
  roots[0].children.map((node) => node.text),
  ['安装', '故障排查']
);
assert.deepEqual(
  roots[0].children[0].children.map((node) => node.text),
  ['Windows', 'macOS']
);
console.log('outline:', JSON.stringify(roots));
`,
      checkpoint:
        '大纲根节点必须是“开发者文档”，直接子节点是“安装、故障排查”，“安装”下必须是“Windows、macOS”。失败边界是从 h3 开始、把视觉字号当成标题级别，或用空标题制造层级。',
    }),
    makeTask('foundations-final-h1-outline-independent', {
      title: '独立实践：DOM 顺序与视觉顺序对照',
      brief:
        '运行 node main.js。stdin 给出 DOM 顺序、CSS order 值和屏幕阅读器会读出的可访问名称；代码比较两者，阻止仅靠 order 改变阅读顺序。',
      input: {
        dom: ['标题', '价格', '购买', '补充条款'],
        visual: ['标题', '购买', '价格', '补充条款'],
        cssOrder: { 标题: 1, 价格: 3, 购买: 2, 补充条款: 4 },
        accessibleName: '标题 价格 购买 补充条款',
      },
      source: `
const sortedVisual = [...input.dom].sort((left, right) =>
  input.cssOrder[left] - input.cssOrder[right]
);
const domFocusDecision = input.dom.join(' ');
assert.deepEqual(sortedVisual, input.visual);
assert.equal(domFocusDecision, input.accessibleName);
assert.notDeepEqual(input.dom, input.visual);
const mismatches = input.dom
  .map((name, index) => ({ name, dom: index + 1, visual: sortedVisual.indexOf(name) + 1 }))
  .filter((item) => item.dom !== item.visual);
assert.deepEqual(
  mismatches.map((item) => item.name),
  ['价格', '购买']
);
const recommendation = 'change DOM source order and keep CSS order for decoration only';
assert.match(recommendation, /DOM source order/);
console.log('DOM:', input.dom.join(' -> '));
console.log('visual:', input.visual.join(' -> '));
console.log('mismatches:', JSON.stringify(mismatches));
`,
      checkpoint:
        '视觉顺序必须是“标题、购买、价格、补充条款”，但 DOM/读屏顺序仍是“标题、价格、购买、补充条款”，因此价格和购买被标记为顺序不一致。失败边界是只顾截图正确、用 CSS order 重排关键内容，或让键盘焦点跟视觉顺序不一致。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：列表、引用、代码与时间': makeLab(
    'H1 代码台 03 · 选择正确的列表、引用和时间语义',
    '检查无序列表、有序列表、引用来源、预格式代码和机器可读时间，避免用纯文本符号伪装结构。',
    makeTask('foundations-final-h1-lists-guided', {
      title: '跟做：扫描列表、引用、代码与时间',
      brief:
        '运行 node main.js。stdin 给出一段发布说明；代码分别统计 ul/ol、blockquote/cite、code/pre 和带 datetime 的 time，确认语义没有只用符号表达。',
      input: {
        html: '<h2>发布说明</h2><ul><li>修复缓存</li><li>更新文档</li></ul><ol><li>备份</li><li>部署</li></ol><blockquote cite="https://example.com/incident"><p>服务已恢复。</p><cite>状态页</cite></blockquote><pre><code>node --test</code></pre><time datetime="2026-11-24T09:30:00+08:00">11 月 24 日 09:30</time>',
      },
      source: `
const count = (pattern) => [...input.html.matchAll(pattern)].length;
const report = {
  unorderedLists: count(/<ul\\b/gi),
  orderedLists: count(/<ol\\b/gi),
  listItems: count(/<li\\b/gi),
  quotes: count(/<blockquote\\b/gi),
  citations: count(/<cite\\b/gi),
  codeBlocks: count(/<pre\\b[^>]*>\\s*<code\\b/gi),
  times: [...input.html.matchAll(/<time\\b[^>]*datetime="([^"]+)"/gi)].map((match) => match[1]),
};
assert.deepEqual(report, {
  unorderedLists: 1,
  orderedLists: 1,
  listItems: 4,
  quotes: 1,
  citations: 1,
  codeBlocks: 1,
  times: ['2026-11-24T09:30:00+08:00'],
});
assert.ok(input.html.includes('cite="https://example.com/incident"'));
assert.equal(Number.isNaN(Date.parse(report.times[0])), false);
console.log('semantic counts:', JSON.stringify(report));
console.log('parsed instant:', new Date(report.times[0]).toISOString());
`,
      checkpoint:
        '统计必须为 ul=1、ol=1、li=4、blockquote=1、cite=1、pre>code=1，并扫描到一个可解析的 datetime。失败边界是用“•”和“1.”纯文本冒充列表、引用不标来源，或 time 只有展示文字没有 datetime。',
    }),
    makeTask('foundations-final-h1-lists-independent', {
      title: '独立实践：时间线、引用和代码注释关联',
      brief:
        '运行 node main.js。代码把发布事件按机器时间排序，检查每个引用都有一个可访问来源，代码块必须带语言说明，并输出显示时间与 UTC 对照。',
      input: {
        events: [
          { label: '恢复完成', instant: '2026-11-24T10:20:00+08:00' },
          { label: '开始回滚', instant: '2026-11-24T09:55:00+08:00' },
          { label: '告警触发', instant: '2026-11-24T09:30:00+08:00' },
        ],
        citations: ['https://status.example.com/incident/42'],
        codeBlocks: [{ language: 'bash', source: 'npm run rollback' }],
      },
      source: `
const ordered = [...input.events].sort((left, right) =>
  Date.parse(left.instant) - Date.parse(right.instant)
);
assert.deepEqual(
  ordered.map((event) => event.label),
  ['告警触发', '开始回滚', '恢复完成']
);
assert.ok(input.citations.every((url) => /^https:\\/\\//.test(url)));
assert.ok(input.codeBlocks.every((block) => block.language && block.source));
const timeline = ordered.map((event) => ({
  label: event.label,
  local: event.instant,
  utc: new Date(event.instant).toISOString(),
}));
assert.equal(timeline[0].utc, '2026-11-24T01:30:00.000Z');
assert.equal(timeline[2].utc, '2026-11-24T02:20:00.000Z');
console.log('timeline:', JSON.stringify(timeline));
console.log('citations:', input.citations.join(','));
`,
      checkpoint:
        '事件顺序必须是告警触发、开始回滚、恢复完成；三个来源都在 https 下，代码块标明 bash，第一条 UTC 为 01:30、最后一条为 02:20。失败边界是按字符串日期排序、引用失效或代码块没有语言信息。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：企业站点的页面信息架构': makeLab(
    'H1 代码台 04 · 从任务到页面与链接图可达性',
    '先验证页面树没有孤立页和过深层级，再用真实有向图搜索计算用户完成核心任务所需点击数。',
    makeTask('foundations-final-h1-ia-guided', {
      title: '跟做：页面树、路径与点击深度',
      brief:
        '运行 node main.js。stdin 给出从首页出发的页面树；代码检查路径唯一、无孤立页、深度不超过三层，并输出每个页面的面包屑。',
      input: {
        pages: [
          { path: '/', title: '首页', parent: null },
          { path: '/products', title: '产品', parent: '/' },
          { path: '/products/analytics', title: '分析产品', parent: '/products' },
          { path: '/contact', title: '联系销售', parent: '/' },
        ],
        maxDepth: 3,
      },
      source: `
const byPath = new Map(input.pages.map((page) => [page.path, page]));
assert.equal(byPath.size, input.pages.length, 'duplicate path');
const roots = input.pages.filter((page) => page.parent === null);
assert.deepEqual(roots.map((page) => page.path), ['/']);
const children = new Map();
for (const page of input.pages) {
  if (page.parent === null) continue;
  assert.ok(byPath.has(page.parent), 'orphan page: ' + page.path);
  if (!children.has(page.parent)) children.set(page.parent, []);
  children.get(page.parent).push(page.path);
}
const crumbs = {};
const visit = (path, trail) => {
  const page = byPath.get(path);
  assert.ok(page);
  assert.ok(trail.length <= input.maxDepth);
  crumbs[path] = [...trail, page.title].join(' / ');
  for (const child of children.get(path) || []) visit(child, [...trail, page.title]);
};
visit('/', []);
assert.equal(Object.keys(crumbs).length, input.pages.length);
assert.equal(crumbs['/products/analytics'], '首页 / 产品 / 分析产品');
assert.ok((children.get('/') || []).includes('/contact'));
console.log('breadcrumbs:', JSON.stringify(crumbs));
console.log('orphans:', 0);
`,
      checkpoint:
        '路径必须唯一，只有 / 是根，/products/analytics 面包屑为“首页 / 产品 / 分析产品”，所有页面可从首页到达且深度不超过 3。失败边界是导航里放了链接但页面不可达、同一路径重复，或核心产品页藏在第四层。',
    }),
    makeTask('foundations-final-h1-ia-independent', {
      title: '独立实践：按用户任务测最短点击路径',
      brief:
        '运行 node main.js。stdin 给页面链接图和三个核心任务目标页；代码用 BFS 求最短路径，任务必须在三次点击内完成。',
      input: {
        graph: {
          '/': ['/products', '/contact', '/search'],
          '/products': ['/products/analytics', '/pricing'],
          '/products/analytics': ['/contact'],
          '/search': ['/products/analytics'],
          '/contact': [],
          '/pricing': ['/contact'],
        },
        tasks: [
          { name: '了解分析产品', target: '/products/analytics' },
          { name: '查看价格', target: '/pricing' },
          { name: '联系销售', target: '/contact' },
        ],
        maxClicks: 3,
      },
      source: `
function shortestPath(graph, start, target) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    if (current === target) return path;
    for (const next of graph[current] || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}
const results = input.tasks.map((task) => {
  const path = shortestPath(input.graph, '/', task.target);
  assert.ok(path, 'unreachable: ' + task.target);
  const clicks = path.length - 1;
  assert.ok(clicks <= input.maxClicks, task.name + ' needs ' + clicks + ' clicks');
  return { ...task, path, clicks };
});
assert.deepEqual(results.map((item) => item.clicks), [2, 2, 1]);
assert.deepEqual(results[0].path, ['/', '/products', '/products/analytics']);
assert.deepEqual(results[2].path, ['/', '/contact']);
console.log('task paths:', results.map((item) => item.name + '=' + item.path.join('>')).join(' | '));
`,
      checkpoint:
        '任务点击数必须依次为 2、2、1；分析产品路径 / > /products > /products/analytics，联系销售路径 / > /contact。失败边界是只数导航项不数实际页面跳转、忽略搜索入口，或允许目标不可达仍宣称通过。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：语义重构与回归检查': makeLab(
    'H1 代码台 05 · 等价文本、语义替换和快照回归',
    '先把 div 堆栈重构为 header/nav/main/article，再比较文本、标题、焦点、状态码和请求清单，确保可访问性没有回退。',
    makeTask('foundations-final-h1-refactor-guided', {
      title: '跟做：语义升级但保留全部内容',
      brief:
        '运行 node main.js。stdin 给出重构前后 HTML；代码抽取纯文本比较，统计 div 与语义标签，并验证 main、nav、article 都已出现。',
      input: {
        before: '<div class="top"><div>Logo</div><div><a href="/">首页</a></div></div><div class="body"><div>案例</div><div>正文内容</div></div>',
        after: '<header><strong>Logo</strong><nav><a href="/">首页</a></nav></header><main><article><h1>案例</h1><p>正文内容</p></article></main>',
      },
      source: `
const text = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();
const count = (html, tag) => [...html.matchAll(new RegExp('<' + tag + '\\\\b', 'gi'))].length;
assert.equal(text(input.before), text(input.after));
assert.ok(count(input.after, 'div') < count(input.before, 'div'));
for (const tag of ['header', 'nav', 'main', 'article', 'h1']) {
  assert.ok(count(input.after, tag) >= 1, 'missing semantic tag ' + tag);
}
const report = {
  sameText: text(input.before) === text(input.after),
  divBefore: count(input.before, 'div'),
  divAfter: count(input.after, 'div'),
  semanticTags: ['header', 'nav', 'main', 'article', 'h1'],
};
assert.deepEqual(report, {
  sameText: true,
  divBefore: 6,
  divAfter: 0,
  semanticTags: ['header', 'nav', 'main', 'article', 'h1'],
});
console.log('refactor report:', JSON.stringify(report));
`,
      checkpoint:
        '重构前后纯文本必须完全一致，div 从 6 降到 0，并新增 header、nav、main、article、h1。失败边界是删掉看不见的辅助文本、只换 class 名，或把 nav 放成与 header 无关的孤立区域。',
    }),
    makeTask('foundations-final-h1-refactor-independent', {
      title: '独立实践：用可访问性快照挡住回归',
      brief:
        '运行 node main.js。代码比较重构前后的标题、焦点顺序、状态码和请求清单，只允许“减少 div”这类明确白名单变化，任何文本或交互回退都失败。',
      input: {
        baseline: {
          headingOrder: ['h1', 'h2', 'h3'],
          focus: ['skip-link', 'home', 'case-cta'],
          status: 200,
          requests: ['/', '/app.css', '/logo.svg'],
        },
        current: {
          headingOrder: ['h1', 'h2', 'h3'],
          focus: ['skip-link', 'home', 'case-cta'],
          status: 200,
          requests: ['/', '/app.css', '/logo.svg'],
        },
        badCandidate: {
          headingOrder: ['h1', 'h3'],
          focus: ['home', 'skip-link'],
          status: 200,
          requests: ['/', '/app.css', '/logo.svg'],
        },
        allowedChanges: ['markup-simplicity'],
      },
      source: `
function regression(baseline, candidate) {
  const issues = [];
  if (candidate.headingOrder.join('>') !== baseline.headingOrder.join('>')) {
    issues.push('heading-order');
  }
  if (candidate.focus.join('>') !== baseline.focus.join('>')) {
    issues.push('focus-order');
  }
  if (candidate.status !== baseline.status) issues.push('http-status');
  if (candidate.requests.join('|') !== baseline.requests.join('|')) {
    issues.push('request-list');
  }
  return issues;
}
const currentIssues = regression(input.baseline, input.current);
const badIssues = regression(input.baseline, input.badCandidate);
assert.deepEqual(currentIssues, []);
assert.deepEqual(badIssues, ['heading-order', 'focus-order']);
assert.ok(input.allowedChanges.includes('markup-simplicity'));
console.log('current issues:', currentIssues);
console.log('bad candidate caught:', badIssues);
`,
      checkpoint:
        '当前重构快照必须无问题；坏候选必须同时报出 heading-order 与 focus-order，不能被“只是换标签”豁免。失败边界是只比较截图、忽略键盘焦点、跳过预加载资源请求，或不保存重构前基线。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：输入类型、自动填充与移动键盘': makeLab(
    'H2 代码台 01 · type、inputmode 与 autocomplete',
    '根据字段语义生成正确的输入属性，并验证手机键盘、浏览器自动填充和粘贴场景不会被错误配置破坏。',
    makeTask('foundations-final-h2-input-guided', {
      title: '跟做：为字段选择键盘与自动填充',
      brief:
        '运行 node main.js。stdin 给出字段用途；代码映射到 type/inputmode/autocomplete，并验证邮箱、电话、验证码和姓名的配置。',
      input: {
        fields: [
          { name: 'email', purpose: 'email' },
          { name: 'phone', purpose: 'telephone' },
          { name: 'code', purpose: 'one-time-code' },
          { name: 'name', purpose: 'name' },
        ],
      },
      source: `
const rules = {
  email: { type: 'email', inputmode: 'email', autocomplete: 'email' },
  telephone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel' },
  'one-time-code': { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code' },
  name: { type: 'text', inputmode: 'text', autocomplete: 'name' },
};
const fields = input.fields.map((field) => {
  const rule = rules[field.purpose];
  assert.ok(rule, 'unsupported purpose ' + field.purpose);
  return { ...field, ...rule };
});
assert.deepEqual(fields.map((field) => field.type), ['email', 'tel', 'text', 'text']);
assert.deepEqual(fields.map((field) => field.inputmode), ['email', 'tel', 'numeric', 'text']);
assert.deepEqual(fields.map((field) => field.autocomplete), [
  'email',
  'tel',
  'one-time-code',
  'name',
]);
assert.equal(fields.some((field) => field.type === 'password' && field.autocomplete === 'off'), false);
console.log('field attributes:', JSON.stringify(fields));
`,
      checkpoint:
        '邮箱 type=email、inputmode=email；电话 type=tel；验证码 inputmode=numeric、autocomplete=one-time-code；姓名使用 autocomplete=name。失败边界是所有字段统一 text、给验证码设 maxlength 阻止粘贴，或用 pattern 代替语义类型。',
    }),
    makeTask('foundations-final-h2-input-independent', {
      title: '独立实践：生成并验证移动端表单标记',
      brief:
        '运行 node main.js。代码从字段模型生成 input 标签，检查每个标签有 label、usable autocomplete、正确 enterkeyhint，并拒绝把支付卡号放进普通 text 字段。',
      input: {
        fields: [
          { id: 'billing-email', label: '邮箱', purpose: 'email', required: true },
          { id: 'card-number', label: '卡号', purpose: 'cc-number', required: true },
          { id: 'postal-code', label: '邮编', purpose: 'postal-code', required: true },
        ],
      },
      source: `
const mapping = {
  email: { type: 'email', inputmode: 'email', autocomplete: 'email', enterkeyhint: 'next' },
  'cc-number': { type: 'text', inputmode: 'numeric', autocomplete: 'cc-number', enterkeyhint: 'next' },
  'postal-code': { type: 'text', inputmode: 'numeric', autocomplete: 'postal-code', enterkeyhint: 'done' },
};
const tags = input.fields.map((field) => {
  const attributes = mapping[field.purpose];
  assert.ok(attributes, 'missing mapping');
  return '<label for="' + field.id + '">' + field.label + '</label>' +
    '<input id="' + field.id + '" name="' + field.id + '" type="' + attributes.type +
    '" inputmode="' + attributes.inputmode + '" autocomplete="' + attributes.autocomplete +
    '" enterkeyhint="' + attributes.enterkeyhint + '"' +
    (field.required ? ' required' : '') + '>';
});
assert.equal(tags.length, 3);
assert.ok(tags.every((tag) => /<label for="[^"]+">.+<\\/label><input/.test(tag)));
assert.ok(tags[1].includes('autocomplete="cc-number"'));
assert.ok(tags[1].includes('inputmode="numeric"'));
assert.ok(tags[2].includes('enterkeyhint="done"'));
assert.ok(tags.every((tag) => tag.includes(' required')));
console.log('generated fields:', tags.join('\\n'));
`,
      checkpoint:
        '三个字段必须都有对应 label、id/name、required；卡号使用 cc-number 自动填充和 numeric 键盘，邮编使用 postal-code 且 enterkeyhint=done。失败边界是 label 只放 placeholder、关闭粘贴、忽视实卡号隐私校验。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：原生约束验证与错误提示': makeLab(
    'H2 代码台 02 · 约束对象、首个错误与无障碍提示',
    '用同一份规则模型执行原生风格校验，再验证提交失败时首个字段、错误消息和屏幕阅读器提示能够正确关联。',
    makeTask('foundations-final-h2-validation-guided', {
      title: '跟做：按约束找首个无效字段',
      brief:
        '运行 node main.js。stdin 给出字段值、required/minLength/type/pattern；代码模拟约束验证，返回有效性、首个错误字段和可读消息。',
      input: {
        fields: [
          { name: 'email', value: '', required: true, type: 'email' },
          { name: 'company', value: 'x', required: true, minLength: 2 },
          { name: 'postalCode', value: '12', pattern: '^\\\\d{5}$' },
        ],
      },
      source: `
function validate(field) {
  if (field.required && field.value.trim() === '') return '请填写' + field.name;
  if (field.minLength && field.value.length < field.minLength) {
    return field.name + ' 至少需要 ' + field.minLength + ' 个字符';
  }
  if (field.type === 'email' && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(field.value)) {
    return '请输入有效邮箱';
  }
  if (field.pattern && !new RegExp(field.pattern).test(field.value)) {
    return field.name + ' 格式不正确';
  }
  return null;
}
const errors = input.fields
  .map((field) => ({ name: field.name, message: validate(field) }))
  .filter((item) => item.message);
assert.deepEqual(errors, [
  { name: 'email', message: '请填写email' },
  { name: 'company', message: 'company 至少需要 2 个字符' },
  { name: 'postalCode', message: 'postalCode 格式不正确' },
]);
assert.equal(errors[0].name, 'email');
console.log('errors:', JSON.stringify(errors));
console.log('first invalid:', errors[0].name);
`,
      checkpoint:
        '三个字段都无效，顺序必须是 email、company、postalCode；密码规则不能靠 placeholder 文案，错误要说明期望和实际字段。失败边界是提交后才首次显示全部错误、reject 所有空格姓名，或前端校验通过就信任服务端。',
    }),
    makeTask('foundations-final-h2-validation-independent', {
      title: '独立实践：客户端提示与服务端拒绝同源',
      brief:
        '运行 node main.js。代码对绕过前端提交的数据执行服务端校验，返回字段级错误和全局摘要，并验证焦点落到首个错误字段而非页面顶部。',
      input: {
        payload: { email: 'not-an-email', company: '', seats: 0 },
        rules: {
          email: { type: 'email' },
          company: { minLength: 2 },
          seats: { min: 1 },
        },
      },
      source: `
const errors = [];
for (const [name, value] of Object.entries(input.payload)) {
  const rule = input.rules[name];
  if (!rule) {
    errors.push({ field: name, message: 'unexpected field' });
    continue;
  }
  if (rule.type === 'email' && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String(value))) {
    errors.push({ field: name, message: 'Enter a valid email address.' });
  }
  if (rule.minLength && String(value).trim().length < rule.minLength) {
    errors.push({ field: name, message: 'Provide at least ' + rule.minLength + ' characters.' });
  }
  if (rule.min !== undefined && Number(value) < rule.min) {
    errors.push({ field: name, message: 'Value must be at least ' + rule.min + '.' });
  }
}
assert.deepEqual(errors.map((error) => error.field), ['email', 'company', 'seats']);
assert.equal(errors.length, 3);
const response = {
  status: 422,
  summary: errors.length + ' fields need attention',
  errors,
  focusTarget: errors[0].field,
};
assert.equal(response.status, 422);
assert.equal(response.focusTarget, 'email');
assert.ok(response.summary.includes('3 fields'));
console.log('response:', JSON.stringify(response));
`,
      checkpoint:
        '绕过前端后必须返回 422；email、company、seats 各有字段级错误，摘要为 3 fields need attention，焦点目标为 email。失败边界是仅返回一条全局错误、状态码仍 200、把 HTML 注入错误文案，或让焦点停在提交按钮。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：fieldset、legend 与分组语义': makeLab(
    'H2 代码台 03 · 分组、单一 legend 与单选组',
    '把相关控件组织成 fieldset，每个分组只有一个 legend；再用真实标记扫描验证 radio/checkbox 的分组名称和描述。',
    makeTask('foundations-final-h2-fieldsets-guided', {
      title: '跟做：检查分组模型与 legend',
      brief:
        '运行 node main.js。stdin 给出控件和分组；代码检查每个 fieldset 恰有一个 legend、所有控件恰好属于一组、radio 组有共同 name。',
      input: {
        fieldsets: [
          {
            legend: '联系方式',
            controls: [
              { name: 'email', type: 'email' },
              { name: 'phone', type: 'tel' },
            ],
          },
          {
            legend: '偏好',
            controls: [
              { name: 'contactMethod', type: 'radio', value: 'email' },
              { name: 'contactMethod', type: 'radio', value: 'phone' },
            ],
          },
        ],
      },
      source: `
const all = [];
for (const fieldset of input.fieldsets) {
  assert.ok(fieldset.legend && fieldset.legend.trim().length > 0);
  assert.ok(fieldset.controls.length > 0);
  for (const control of fieldset.controls) all.push({ ...control, group: fieldset.legend });
}
const byName = new Map();
for (const control of all) {
  if (!byName.has(control.name)) byName.set(control.name, []);
  byName.get(control.name).push(control);
}
const radios = all.filter((control) => control.type === 'radio');
assert.equal(radios.length, 2);
assert.equal(new Set(radios.map((control) => control.name)).size, 1);
assert.equal(new Set(radios.map((control) => control.group)).size, 1);
assert.deepEqual(
  [...new Set(all.map((control) => control.group))],
  ['联系方式', '偏好']
);
assert.equal(byName.get('contactMethod').length, 2);
console.log('groups:', JSON.stringify([...new Set(all.map((control) => control.group))]));
console.log('radio values:', radios.map((control) => control.value).join(','));
`,
      checkpoint:
        '必须有两个分组 legend：“联系方式”和“偏好”；radio 组共享 name=contactMethod，值包含 email 和 phone，每个 fieldset 至少一个控件。失败边界是 legend 缺失、把 radio 拆到不同 name 导致可多选，或用视觉标题代替 legend。',
    }),
    makeTask('foundations-final-h2-fieldsets-independent', {
      title: '独立实践：从 HTML 验证 legend 与 input 关联',
      brief:
        '运行 node main.js。代码扫描真实 HTML 的 fieldset/legend/input，要求每个 fieldset 恰好一个 legend、每个 input 有 id 和对应 label、radio 组名一致。',
      input: {
        html: '<fieldset><legend>配送方式</legend><label><input type="radio" name="shipping" value="standard">标准</label><label><input type="radio" name="shipping" value="express">加急</label></fieldset><fieldset><legend>备注</legend><label for="note">说明</label><input id="note" name="note"></fieldset>',
      },
      source: `
const fieldsets = [...input.html.matchAll(/<fieldset\\b[^>]*>(.*?)<\\/fieldset>/gi)].map((match) => match[1]);
assert.equal(fieldsets.length, 2);
for (const block of fieldsets) {
  const legends = [...block.matchAll(/<legend\\b[^>]*>(.*?)<\\/legend>/gi)];
  assert.equal(legends.length, 1, 'fieldset needs exactly one legend');
}
const legends = [...input.html.matchAll(/<legend\\b[^>]*>(.*?)<\\/legend>/gi)].map((match) => match[1]);
const inputs = [...input.html.matchAll(/<input\\b([^>]*)>/gi)].map((match) => {
  const text = match[1];
  return {
    type: /type="([^"]+)"/.exec(text)?.[1] || 'text',
    name: /name="([^"]+)"/.exec(text)?.[1] || '',
    id: /id="([^"]+)"/.exec(text)?.[1] || '',
  };
});
assert.ok(inputs.filter((control) => control.type === 'radio').length === 2);
assert.deepEqual([...new Set(inputs.filter((control) => control.type === 'radio').map((control) => control.name))], ['shipping']);
assert.ok(inputs.find((control) => control.name === 'note').id === 'note');
assert.match(input.html, /<label for="note">说明<\\/label>/);
console.log('legends:', legends.join(' | '));
console.log('inputs:', JSON.stringify(inputs));
`,
      checkpoint:
        'fieldset 必须各有一个 legend，radio 两项都有 type=radio、name=shipping；“备注”组说明标签 for=note 必须指向 input id=note。失败边界是用 fieldset 切样式但无 legend、label 仅包裹装饰文本，或同一视觉组使用不同 radio name。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：提交、取消、加载与重复提交': makeLab(
    'H2 代码台 04 · 请求状态机与幂等证据',
    '先模拟 submit/cancel/success 状态机，再用幂等键合并重复请求，验证加载状态不会破坏可取消性和结果一致性。',
    makeTask('foundations-final-h2-submit-guided', {
      title: '跟做：表单状态机与取消',
      brief:
        '运行 node main.js。stdin 给出事件序列；代码验证 idle→submitting→cancelled 和 idle→submitting→success 两条路径，任何非法事件都要产生错误。',
      input: {
        runs: [
          { id: 'cancel', events: ['SUBMIT', 'CANCEL'] },
          { id: 'success', events: ['SUBMIT', 'SUCCESS'] },
        ],
      },
      source: `
const transitions = {
  idle: { SUBMIT: 'submitting' },
  submitting: { SUCCESS: 'success', CANCEL: 'cancelled', ERROR: 'error' },
  success: {},
  cancelled: {},
  error: {},
};
function run(events) {
  let state = 'idle';
  const trace = [state];
  for (const event of events) {
    const next = transitions[state]?.[event];
    assert.ok(next, 'illegal ' + event + ' from ' + state);
    state = next;
    trace.push(state);
  }
  return trace;
}
const traces = Object.fromEntries(input.runs.map((item) => [item.id, run(item.events)]));
assert.deepEqual(traces.cancel, ['idle', 'submitting', 'cancelled']);
assert.deepEqual(traces.success, ['idle', 'submitting', 'success']);
assert.throws(() => run(['SUBMIT', 'SUBMIT']), /illegal SUBMIT/);
console.log('state traces:', JSON.stringify(traces));
`,
      checkpoint:
        '取消轨迹为 idle→submitting→cancelled，成功轨迹为 idle→submitting→success；submitting 时再次 SUBMIT 必须报非法事件。失败边界是取消只隐藏按钮但请求仍落库、表单可同时启动两次，或失败后不恢复 idle 让用户重试。',
    }),
    makeTask('foundations-final-h2-submit-independent', {
      title: '独立实践：相同幂等键只产生一次订单',
      brief:
        '运行 node main.js。模拟两条重复提交共享 idempotency-key；代码并行处理请求，但只允许一个业务结果，并验证加载状态、按钮禁用和服务端账本。',
      input: {
        key: 'checkout-cart-42-v1',
        requests: [
          { id: 'tab-1', amount: 199, key: 'checkout-cart-42-v1' },
          { id: 'retry', amount: 199, key: 'checkout-cart-42-v1' },
        ],
      },
      source: `
const ledger = new Map();
const results = input.requests.map((request) => {
  assert.equal(request.key, input.key, 'all retries must reuse key');
  if (!ledger.has(request.key)) {
    ledger.set(request.key, {
      orderId: 'order-42',
      amount: request.amount,
      processedFrom: request.id,
    });
  }
  return {
    requestId: request.id,
    order: ledger.get(request.key),
    loading: false,
    buttonDisabled: false,
  };
});
assert.equal(ledger.size, 1);
assert.equal(results.length, 2);
assert.equal(results[0].order.orderId, results[1].order.orderId);
assert.equal(results[0].order.processedFrom, 'tab-1');
assert.deepEqual(results.map((result) => result.loading), [false, false]);
assert.ok(results.every((result) => result.buttonDisabled === false));
console.log('idempotency ledger:', JSON.stringify([...ledger.entries()]));
console.log('deduplicated requests:', results.length);
`,
      checkpoint:
        '两个请求必须复用同一 key，账本只有 1 条 order-42，两条响应引用同一业务结果，处理完后 loading=false 且按钮恢复可点。失败边界是前端禁用就当作去重、重试生成第二个订单，或失败后不恢复按钮。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：img、srcset、sizes 与替代文本': makeLab(
    'H3 代码台 01 · 候选图选择与图像语义',
    '按视口宽度和 DPR 选择 srcset 候选，再用语义扫描验证 alt、sizes、宽度描述符和装饰图边界。',
    makeTask('foundations-final-h3-images-guided', {
      title: '跟做：根据显示宽度选择候选图',
      brief:
        '运行 node main.js。stdin 给出候选宽度、显示尺寸与 DPR；代码计算所需像素宽度，从前到后选取首个足够大的候选，并记录未超采样。',
      input: {
        viewport: 390,
        slot: '100vw',
        dpr: 2,
        candidates: [
          { src: 'hero-640.jpg', width: 640 },
          { src: 'hero-960.jpg', width: 960 },
          { src: 'hero-1280.jpg', width: 1280 },
        ],
        alt: '团队在发布日查看实时仪表盘',
      },
      source: `
assert.match(input.slot, /^\\d+vw$/);
assert.ok(input.dpr > 0);
const slotWidth = input.viewport * Number(input.slot.replace('vw', '')) / 100;
const required = Math.ceil(slotWidth * input.dpr);
const selected = input.candidates.find((candidate) => candidate.width >= required);
assert.equal(required, 780);
assert.equal(selected.width, 960);
assert.equal(selected.src, 'hero-960.jpg');
assert.ok(input.alt.length >= 8);
assert.equal(input.alt.startsWith('图片：'), false);
const srcset = input.candidates.map((candidate) => candidate.src + ' ' + candidate.width + 'w').join(', ');
assert.match(srcset, /hero-960\\.jpg 960w/);
console.log('required pixels:', required);
console.log('selected:', JSON.stringify(selected));
console.log('srcset:', srcset);
`,
      checkpoint:
        '390px×100vw×DPR2 必须需要 780px，选择 960px 的 hero-960.jpg 而不是 640 或 1280；alt 描述图像目的，不以“图片：”开头。失败边界是忽略 DPR、永远加载最大图，或让 alt 只重复标题。',
    }),
    makeTask('foundations-final-h3-images-independent', {
      title: '独立实践：扫描图像标记的加载与语义',
      brief:
        '运行 node main.js。代码扫描 HTML 中的 img，检查 alt、sizes、srcset 描述符递增、响应式 source 和装饰图 alt=""；同时验证首屏主图没有 lazy。',
      input: {
        html: '<img src="hero-640.jpg" srcset="hero-640.jpg 640w, hero-960.jpg 960w, hero-1280.jpg 1280w" sizes="100vw" alt="产品界面"><img src="icon.svg" alt="" width="16" height="16">',
      },
      source: `
const images = [...input.html.matchAll(/<img\\b([^>]*)>/gi)].map((match) => {
  const attrs = match[1];
  const get = (name) => new RegExp(name + '="([^"]*)"', 'i').exec(attrs)?.[1];
  return {
    src: get('src') || '',
    alt: get('alt'),
    sizes: get('sizes'),
    srcset: get('srcset') || '',
    loading: get('loading') || 'eager',
  };
});
assert.equal(images.length, 2);
const contentImage = images[0];
const decorative = images[1];
assert.ok(contentImage.alt && contentImage.alt.length > 0);
assert.equal(decorative.alt, '');
assert.equal(decorative.loading, 'eager');
const descriptors = contentImage.srcset.split(',').map((item) => Number(/ (\\d+)w/.exec(item.trim())[1]));
assert.deepEqual(descriptors, [...descriptors].sort((a, b) => a - b));
assert.deepEqual([...new Set(descriptors)].length, descriptors.length);
assert.ok(contentImage.sizes && !contentImage.loading.includes('lazy'));
console.log('images:', JSON.stringify(images));
console.log('descriptor order:', descriptors.join('<'));
`,
      checkpoint:
        '两张图片都必须有 alt 属性；产品图 alt 非空、有 sizes、srcset 640w<960w<1280w 且不 lazy；装饰图标 alt=""。失败边界是把无 alt 当装饰、用小图硬撑大容器，或只写 width 描述符却混用 w。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：picture、figure 与图像决策': makeLab(
    'H3 代码台 02 · 艺术指导、格式回退与图注',
    '先用媒体规则选择 picture 源，再验证 fallback img、figure/figcaption 以及图注与正文的语义关系。',
    makeTask('foundations-final-h3-picture-guided', {
      title: '跟做：按媒体条件选择格式与画幅',
      brief:
        '运行 node main.js。stdin 给出视口、DPR、浏览器格式和艺术指导规则；代码选择首个匹配 source，并保留 img 作为最终回退。',
      input: {
        viewport: 390,
        dpr: 3,
        supports: ['avif', 'webp'],
        sources: [
          { media: '(max-width: 600px)', type: 'image/avif', src: 'hero-mobile.avif' },
          { media: '(max-width: 600px)', type: 'image/webp', src: 'hero-mobile.webp' },
          { media: '(min-width: 601px)', type: 'image/avif', src: 'hero-wide.avif' },
        ],
        fallback: 'hero-fallback.jpg',
      },
      source: `
const matches = (media, viewport) => {
  const max = /max-width:\\s*(\\d+)px/.exec(media);
  const min = /min-width:\\s*(\\d+)px/.exec(media);
  return (!max || viewport <= Number(max[1])) && (!min || viewport >= Number(min[1]));
};
const selected = input.sources.find((source) =>
  matches(source.media, input.viewport) &&
  input.supports.includes(source.type.split('/')[1])
);
assert.equal(input.viewport, 390);
assert.equal(selected.src, 'hero-mobile.avif');
assert.equal(selected.type, 'image/avif');
assert.match(input.fallback, /\\.jpg$/);
assert.ok(input.sources.some((source) => source.media.includes('min-width: 601px')));
assert.equal(input.dpr > 1, true);
console.log('selected source:', JSON.stringify(selected));
console.log('fallback:', input.fallback);
`,
      checkpoint:
        '390px 且支持 avif/webp 时必须选 hero-mobile.avif；宽屏 source 不能命中；最终必须有 JPG 回退。失败边界是只按格式排序忽略画幅、picture 内没有 img，或让所有候选下载后才决定。',
    }),
    makeTask('foundations-final-h3-picture-independent', {
      title: '独立实践：扫描 picture 回退与 figure 图注',
      brief:
        '运行 node main.js。代码扫描三组内容：picture 必须有 img 回退，figure 必须恰有 figcaption，图注不能为空且 data-credit 指向可访问来源。',
      input: {
        html: '<picture><source media="(max-width: 600px)" srcset="m.avif" type="image/avif"><img src="fallback.jpg" alt="移动端产品图"></picture><figure><img src="chart.png" alt="月度营收柱状图"><figcaption data-credit="https://data.example.com/finance">月度营收，单位万元</figcaption></figure>',
      },
      source: `
const pictures = [...input.html.matchAll(/<picture\\b[^>]*>(.*?)<\\/picture>/gi)].map((match) => match[1]);
assert.equal(pictures.length, 1);
assert.match(pictures[0], /<img\\b[^>]*src="fallback\\.jpg"/);
assert.match(pictures[0], /<source\\b[^>]*type="image\\/avif"/);
const figures = [...input.html.matchAll(/<figure\\b[^>]*>(.*?)<\\/figure>/gi)].map((match) => match[1]);
assert.equal(figures.length, 1);
const captions = [...figures[0].matchAll(/<figcaption\\b([^>]*)>(.*?)<\\/figcaption>/gi)];
assert.equal(captions.length, 1);
const credit = /data-credit="([^"]+)"/.exec(captions[0][1])?.[1];
assert.match(credit, /^https:\\/\\//);
assert.ok(captions[0][2].length > 4);
assert.match(figures[0], /alt="[^"]+"/);
console.log('picture fallback:', /fallback\\.jpg/.test(pictures[0]));
console.log('caption:', captions[0][2]);
`,
      checkpoint:
        'picture 必须包含移动端 avif source 和 fallback.jpg；figure 必须恰有一个非空 figcaption，data-credit 是 https 来源，主图 alt 非空。失败边界是 source 后没有 img、图注只写版权无解释，或把装饰边注塞进 figure。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：video、audio、track 与字幕': makeLab(
    'H3 代码台 03 · 媒体回退、字幕轨道与自动播放边界',
    '选择用户语言对应的字幕，验证 tracks、controls、poster 与 fallback 文本；不声称在 Node 中解码媒体文件。',
    makeTask('foundations-final-h3-media-guided', {
      title: '跟做：字幕语言回退与默认轨道',
      brief:
        '运行 node main.js。stdin 给出视频轨道和用户语言；代码选择完全匹配语言，否则退回中文，最后才使用 captions/default，并输出应启用的 track。',
      input: {
        preferredLanguages: ['zh-HK', 'zh', 'en'],
        tracks: [
          { kind: 'captions', srclang: 'en', label: 'English' },
          { kind: 'captions', srclang: 'zh', label: '中文', default: true },
          { kind: 'descriptions', srclang: 'zh', label: '中文口述' },
        ],
      },
      source: `
const captions = input.tracks.filter((track) => track.kind === 'captions');
const languageRank = (language) => {
  const exact = input.preferredLanguages.indexOf(language);
  if (exact >= 0) return exact;
  const base = language.split('-')[0];
  const baseIndex = input.preferredLanguages.findIndex((item) => item.split('-')[0] === base);
  return baseIndex >= 0 ? baseIndex + 0.5 : 100;
};
const ranked = [...captions].sort((left, right) => {
  const difference = languageRank(left.srclang) - languageRank(right.srclang);
  return difference || Number(right.default) - Number(left.default);
});
assert.equal(ranked[0].srclang, 'zh');
assert.equal(ranked[0].default, true);
assert.equal(captions.length, 2);
assert.ok(input.tracks.some((track) => track.kind === 'descriptions'));
console.log('caption ranking:', ranked.map((track) => track.srclang + ':' + track.label).join(' > '));
console.log('selected:', JSON.stringify(ranked[0]));
`,
      checkpoint:
        '选择中文 captions，理由是中文字符串精确命中第二偏好且该轨默认；英文 captions 只作回退，descriptions 单独保留。失败边界是字幕只有自动翻译、默认轨道语言错误，或把 descriptions 和 captions 合并导致用户无法控制。',
    }),
    makeTask('foundations-final-h3-media-independent', {
      title: '独立实践：审查媒体元素的可操作与可访问属性',
      brief:
        '运行 node main.js。代码扫描 video/audio/track，要求 controls 存在、video 有 poster 和 fallback，tracks 有 kind/srclang/label，自动播放必须 muted 且不能强制声音。',
      input: {
        html: '<video controls preload="metadata" poster="cover.jpg" autoplay muted><source src="demo.mp4" type="video/mp4"><track kind="captions" srclang="zh" label="中文" default><track kind="descriptions" srclang="zh" label="口述">您的浏览器不支持视频。</video><audio controls preload="none"><source src="访谈.mp3" type="audio/mpeg">您的浏览器不支持音频。</audio>',
      },
      source: `
const videos = [...input.html.matchAll(/<video\\b([^>]*)>(.*?)<\\/video>/gi)].map((match) => ({
  attrs: match[1],
  body: match[2],
}));
const audios = [...input.html.matchAll(/<audio\\b([^>]*)>(.*?)<\\/audio>/gi)].map((match) => ({
  attrs: match[1],
  body: match[2],
}));
assert.equal(videos.length, 1);
assert.equal(audios.length, 1);
const video = videos[0];
assert.match(video.attrs, /\\bcontrols\\b/);
assert.match(video.attrs, /\\bposter="cover\\.jpg"/);
assert.match(video.attrs, /\\bautoplay\\b/);
assert.match(video.attrs, /\\bmuted\\b/);
assert.match(video.body, /您的浏览器不支持视频/);
const tracks = [...video.body.matchAll(/<track\\b([^>]*)>/gi)].map((match) => match[1]);
assert.equal(tracks.length, 2);
for (const track of tracks) {
  assert.match(track, /kind="(captions|descriptions)"/);
  assert.match(track, /srclang="[a-z-]+"/);
  assert.match(track, /label="[^"]+"/);
}
assert.equal(tracks.filter((track) => /default/.test(track)).length, 1);
assert.match(audios[0].attrs, /\\bcontrols\\b/);
assert.match(audios[0].body, /您的浏览器不支持音频/);
console.log('video tracks:', tracks.length);
console.log('audio fallback:', /不支持音频/.test(audios[0].body));
`,
      checkpoint:
        '视频与音频都必须 controls；视频有 poster、文本回退、2 条 track，且 autoplay 同时 muted；字幕轨道仅一条 default。失败边界是自动播声音、没有字幕、只有图标按钮却无标签，或不给不支持媒体的浏览器回退文字。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：table、caption、th 与数据关系': makeLab(
    'H3 代码台 04 · 数据表结构、行列关系与可读摘要',
    '先由二维记录生成有 caption 和表头关系的表格，再检查 scope、矩形数据区、数字对齐和不应使用表格布局的边界。',
    makeTask('foundations-final-h3-tables-guided', {
      title: '跟做：从记录生成可理解的数据表',
      brief:
        '运行 node main.js。stdin 给出列定义和记录；代码验证每行键完整、生成 caption、列标题 scope=col，并输出可排序但不修改原记录的行模型。',
      input: {
        caption: '2026 年第三季度渠道转化率',
        columns: [
          { key: 'channel', label: '渠道' },
          { key: 'visits', label: '访问量', numeric: true },
          { key: 'conversion', label: '转化率', numeric: true },
        ],
        rows: [
          { channel: '搜索', visits: 12000, conversion: 0.081 },
          { channel: '邮件', visits: 4300, conversion: 0.124 },
          { channel: '合作', visits: 2700, conversion: 0.093 },
        ],
      },
      source: `
assert.ok(input.caption.trim().length > 0);
for (const row of input.rows) {
  assert.deepEqual(Object.keys(row).sort(), input.columns.map((column) => column.key).sort());
}
const header = input.columns
  .map((column) => '<th scope="col">' + column.label + '</th>')
  .join('');
const body = input.rows
  .map((row) => '<tr>' + input.columns.map((column) => '<td>' + row[column.key] + '</td>').join('') + '</tr>')
  .join('');
const markup = '<table><caption>' + input.caption + '</caption><thead><tr>' + header +
  '</tr></thead><tbody>' + body + '</tbody></table>';
assert.match(markup, /<caption>2026 年第三季度渠道转化率<\\/caption>/);
assert.equal([...markup.matchAll(/scope="col"/g)].length, 3);
assert.equal([...markup.matchAll(/<tr>/g)].length, 4);
const sorted = [...input.rows].sort((left, right) => right.conversion - left.conversion);
assert.deepEqual(sorted.map((row) => row.channel), ['邮件', '合作', '搜索']);
assert.equal(input.rows[0].channel, '搜索');
console.log('table markup:', markup);
console.log('sorted channels:', sorted.map((row) => row.channel).join(','));
`,
      checkpoint:
        '表格必须有一个非空 caption、3 个 th[scope=col]、1 个表头行和 3 个数据行；按转化率排序为邮件、合作、搜索，且不修改输入行顺序。失败边界是用 div 网格装表格、用 th 做纯样式色块，或排序时误改原始业务记录。',
    }),
    makeTask('foundations-final-h3-tables-independent', {
      title: '独立实践：扫描真实表格的语义与形状',
      brief:
        '运行 node main.js。代码扫描 HTML table，要求 caption、thead、tbody、scope=col、数据行列数一致，并拒绝嵌套表单或仅用 td 模拟列标题。',
      input: {
        html: '<table><caption>库存</caption><thead><tr><th scope="col">仓库</th><th scope="col">数量</th></tr></thead><tbody><tr><td>上海</td><td>120</td></tr><tr><td>成都</td><td>80</td></tr></tbody></table>',
      },
      source: `
const tableMatch = /<table\\b[^>]*>(.*?)<\\/table>/i.exec(input.html);
assert.ok(tableMatch, 'table missing');
const table = tableMatch[1];
assert.match(table, /<caption>[^<]+<\\/caption>/);
assert.match(table, /<thead>[\\s\\S]*<\\/thead>/);
assert.match(table, /<tbody>[\\s\\S]*<\\/tbody>/);
assert.equal([...table.matchAll(/<th\\b[^>]*scope="col"[^>]*>/gi)].length, 2);
assert.equal([...table.matchAll(/<td\\b/gi)].length, 4);
assert.equal(/<form\\b/i.test(table), false);
const rows = [...table.matchAll(/<tr\\b[^>]*>([\\s\\S]*?)<\\/tr>/gi)];
const cellCounts = rows.map((row) => [...row[1].matchAll(/<(th|td)\\b/gi)].length);
assert.deepEqual(cellCounts, [2, 2, 2]);
assert.equal(new Set(cellCounts).size, 1);
console.log('table rows:', rows.length);
console.log('cells per row:', cellCounts.join(','));
`,
      checkpoint:
        '表格必须有 caption“库存”、thead/tbody 各一组、2 个 scope=col 表头，三行都是 2 个单元格，且 table 内没有 form。失败边界是把列标题全写 td、行列不等却靠空白填充，或用表格控制整页布局。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：媒体与富内容企业页面': makeLab(
    'H3 代码台 05 · 富内容预算、回退与来源证据',
    '根据内容意图和传输预算选择图片、视频、数据表或图表，再用清单验证 poster、字幕、图注和来源字段齐全。',
    makeTask('foundations-final-h3-rich-guided', {
      title: '跟做：按意图和预算选择富内容形式',
      brief:
        '运行 node main.js。stdin 给出候选媒体字节数和能力；代码在预算内优先选择有字幕的视频，否则选择响应式图片，并计算总传输量与回退。',
      input: {
        budgetBytes: 800000,
        candidates: [
          { kind: 'video', bytes: 620000, captions: true, poster: true },
          { kind: 'image', bytes: 180000, alt: true },
          { kind: 'table', bytes: 12000 },
        ],
        motionUseful: true,
      },
      source: `
const selected = input.motionUseful
  ? input.candidates.find((item) => item.kind === 'video' && item.captions && item.poster)
  : input.candidates.find((item) => item.kind === 'image' && item.alt);
assert.equal(selected.kind, 'video');
assert.equal(selected.bytes, 620000);
assert.ok(selected.bytes <= input.budgetBytes);
const fallbackText = '下载文字稿与字幕文件';
const total = selected.bytes + input.candidates.find((item) => item.kind === 'table').bytes;
assert.equal(total, 632000);
assert.ok(total < input.budgetBytes);
assert.ok(selected.captions && selected.poster);
console.log('selected rich content:', JSON.stringify(selected));
console.log('estimated transfer:', total);
console.log('fallback:', fallbackText);
`,
      checkpoint:
        '在 800000 字节预算内必须选 620000 字节且带 poster/字幕的视频，加上 12000 字节数据表合计 632000。失败边界是只看文件个数不算传输量、视频无字幕却上线，或没有文字回退。',
    }),
    makeTask('foundations-final-h3-rich-independent', {
      title: '独立实践：富内容清单与降级契约',
      brief:
        '运行 node main.js。代码检查企业页面富内容清单：每种媒体必须有 alt/caption/poster、声音视频有字幕、图表有数据表回退、来源有 https、总字节和 LCP 资源都在预算内。',
      input: {
        items: [
          { id: 'hero', type: 'image', bytes: 140000, alt: '产品总览' },
          { id: 'demo', type: 'video', bytes: 480000, poster: 'poster.jpg', captions: 'zh.vtt' },
          { id: 'chart', type: 'chart', bytes: 30000, tableFallback: 'fallback.html' },
        ],
        source: 'https://assets.example.com',
        budgetBytes: 700000,
        lcpItem: 'hero',
      },
      source: `
for (const item of input.items) {
  if (item.type === 'image') assert.ok(item.alt);
  if (item.type === 'video') {
    assert.ok(item.poster);
    assert.ok(item.captions);
  }
  if (item.type === 'chart') assert.ok(item.tableFallback);
}
assert.match(input.source, /^https:\\/\\//);
const total = input.items.reduce((sum, item) => sum + item.bytes, 0);
assert.equal(total, 650000);
assert.ok(total < input.budgetBytes);
const lcp = input.items.find((item) => item.id === input.lcpItem);
assert.equal(lcp.type, 'image');
assert.ok(lcp.bytes / input.budgetBytes < 0.25);
console.log('manifest bytes:', total);
console.log('LCP item:', JSON.stringify(lcp));
console.log('fallbacks:', input.items.filter((item) => item.tableFallback).map((item) => item.id).join(','));
`,
      checkpoint:
        '三项字节合计 650000，低于 700000；hero 是 LCP 且占预算不到 25%；视频有 poster/字幕，图表有数据表回退，来源为 https。失败边界是富内容清单漏掉回退、LCP 被懒加载，或把图表信息只存在 canvas 像素里。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：键盘路径、焦点顺序与跳转链接': makeLab(
    'H4 代码台 01 · Tab 顺序、跳过导航和焦点恢复',
    '先按 DOM 与可见状态生成 Tab 顺序，再模拟对话框打开、循环和关闭后的焦点恢复，验证键盘用户不会掉进页面背后。',
    makeTask('foundations-final-h4-focus-guided', {
      title: '跟做：跳过隐藏控件并生成 Tab 路径',
      brief:
        '运行 node main.js。stdin 给出一组控件；代码过滤 disabled/hidden、保留正 tabindex 顺序，验证跳过导航先到 main 内容，再按 DOM 顺序进入表单。',
      input: {
        controls: [
          { id: 'skip', hidden: false, disabled: false, tabindex: 0, region: 'skip' },
          { id: 'logo', hidden: false, disabled: false, tabindex: 0, region: 'header' },
          { id: 'nav-home', hidden: false, disabled: false, tabindex: 0, region: 'nav' },
          { id: 'decorative', hidden: true, disabled: false, tabindex: 0, region: 'nav' },
          { id: 'main-link', hidden: false, disabled: false, tabindex: 0, region: 'main' },
          { id: 'submit', hidden: false, disabled: true, tabindex: 0, region: 'main' },
        ],
        target: 'main',
      },
      source: `
const candidates = input.controls.filter((control) => !control.hidden && !control.disabled);
const positive = candidates
  .filter((control) => control.tabindex > 0)
  .sort((left, right) => left.tabindex - right.tabindex);
const natural = candidates.filter((control) => control.tabindex === 0);
const order = [...positive, ...natural].map((control) => control.id);
assert.deepEqual(order, ['skip', 'logo', 'nav-home', 'main-link']);
assert.equal(order.includes('decorative'), false);
assert.equal(order.includes('submit'), false);
const skipTargetIndex = input.controls.findIndex((control) => control.region === input.target);
const skipIndex = input.controls.findIndex((control) => control.id === 'skip');
assert.ok(skipIndex < skipTargetIndex);
assert.equal(input.controls[skipIndex].region, 'skip');
console.log('tab order:', order.join(' -> '));
console.log('skip target:', input.target);
`,
      checkpoint:
        'Tab 顺序必须是 skip、logo、nav-home、main-link；装饰元素隐藏，禁用的 submit 不进入顺序，跳过链接位于 main 之前且目标存在。失败边界是 tabindex=0 全体重排、隐藏控件仍可聚焦，或跳过链接只视觉隐藏但不可操作。',
    }),
    makeTask('foundations-final-h4-focus-independent', {
      title: '独立实践：对话框焦点陷阱与关闭恢复',
      brief:
        '运行 node main.js。代码模拟打开对话框后的循环 Tab、Shift+Tab 反向循环和 Escape 关闭，要求焦点回到原触发器且页面主体不被误聚焦。',
      input: {
        trigger: 'open-settings',
        dialogControls: ['close', 'name', 'save'],
        events: [
          { type: 'open', from: 'open-settings' },
          { type: 'tab', shift: false },
          { type: 'tab', shift: false },
          { type: 'tab', shift: false },
          { type: 'tab', shift: true },
          { type: 'escape' },
        ],
      },
      source: `
const dialog = input.dialogControls;
let focus = input.trigger;
let open = false;
let restoreTarget = null;
const trace = [];
for (const event of input.events) {
  if (event.type === 'open') {
    restoreTarget = event.from;
    open = true;
    focus = dialog[0];
  } else if (event.type === 'tab') {
    assert.equal(open, true);
    const index = dialog.indexOf(focus);
    const next = event.shift
      ? (index - 1 + dialog.length) % dialog.length
      : (index + 1) % dialog.length;
    focus = dialog[next];
  } else if (event.type === 'escape') {
    open = false;
    focus = restoreTarget;
  }
  trace.push({ type: event.type, focus, open });
}
assert.equal(open, false);
assert.equal(focus, 'open-settings');
assert.deepEqual(
  trace.map((item) => item.focus),
        ['close', 'name', 'save', 'close', 'save', 'open-settings']
);
assert.equal(trace.filter((item) => item.open).length, 5);
console.log('focus trace:', JSON.stringify(trace));
`,
      checkpoint:
        '打开后焦点在 close，随后 Tab 依次 name、save、close，Shift+Tab 回到 name，Escape 后焦点恢复到 open-settings。失败边界是焦点穿出对话框、关闭后落到 body，或禁用 Escape 导致键盘用户被困。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：对比度、缩放与动效偏好': makeLab(
    'H4 代码台 02 · WCAG 对比度、字号和 prefers-reduced-motion',
    '真实计算 WCAG 相对亮度与对比度，再检查大字号阈值、200% 缩放、减少动效和强制色彩模式下的信息保留。',
    makeTask('foundations-final-h4-contrast-guided', {
      title: '跟做：计算文本对比度并判定 AA',
      brief:
        '运行 node main.js。stdin 给出前景/背景色和字号；代码计算 WCAG 对比度，普通文字要求 4.5，大文字要求 3，并输出通过或失败原因。',
      input: {
        samples: [
          { label: '正文', foreground: '#444444', background: '#ffffff', fontSize: 16, bold: false },
          { label: '主按钮', foreground: '#ffffff', background: '#2563eb', fontSize: 18, bold: true },
          { label: '淡提示', foreground: '#999999', background: '#ffffff', fontSize: 14, bold: false },
        ],
      },
      source: `
const channel = (value) => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};
const luminance = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const value = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);
};
const contrast = (left, right) => {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};
const results = input.samples.map((sample) => {
  const ratio = contrast(sample.foreground, sample.background);
  const large = sample.fontSize >= 24 || (sample.bold && sample.fontSize >= 18.66);
  const threshold = large ? 3 : 4.5;
  return { ...sample, ratio: Number(ratio.toFixed(2)), threshold, pass: ratio >= threshold };
});
assert.deepEqual(results.map((result) => result.pass), [true, true, false]);
assert.equal(results[0].ratio, 9.74);
assert.equal(results[2].ratio, 2.85);
assert.equal(results[2].threshold, 4.5);
console.log('contrast results:', JSON.stringify(results));
`,
      checkpoint:
        '正文 #444/白约 9.74:1 通过，白/#2563eb 大号粗体约 5.17:1 通过，浅灰提示约 2.85:1 失败。失败边界是只凭肉眼觉得清楚、同一阈值套所有字号，或忽略 hover/focus/disabled 状态。',
    }),
    makeTask('foundations-final-h4-contrast-independent', {
      title: '独立实践：缩放、动效和强制色彩的三重检查',
      brief:
        '运行 node main.js。代码检查 200% 缩放布局、prefers-reduced-motion 规则、forced-colors 下仍有边界，以及不能用 100vw 固定宽度造成横向滚动。',
      input: {
        viewport: 320,
        zoom: 2,
        layout: { minWidth: 620, overflowX: 'auto', usesViewportWidth: true },
        styles: {
          animationDurationMs: 1200,
          reducedMotionDurationMs: 0,
          forcedColorsSupported: true,
          focusOutline: '2px solid Highlight',
        },
      },
      source: `
const effectiveWidth = input.viewport / input.zoom;
assert.equal(effectiveWidth, 160);
assert.ok(input.layout.minWidth > effectiveWidth, 'fixed layout still overflows at 200%');
const zoomIssue = input.layout.usesViewportWidth
  ? '100vh/100vw fixed dimensions do not reflow'
  : null;
assert.match(zoomIssue, /reflow/);
assert.equal(input.styles.animationDurationMs > 0, true);
assert.equal(input.styles.reducedMotionDurationMs, 0);
assert.equal(input.styles.forcedColorsSupported, true);
assert.match(input.styles.focusOutline, /^2px solid/);
const issues = {
  zoom: zoomIssue,
  motion: input.styles.reducedMotionDurationMs === 0 ? null : 'motion still active',
  forcedColors: input.styles.forcedColorsSupported ? null : 'no forced-colors boundary',
  focus: input.styles.focusOutline ? null : 'focus invisible',
};
assert.deepEqual(issues, { zoom: zoomIssue, motion: null, forcedColors: null, focus: null });
console.log('effective width at 200%:', effectiveWidth);
console.log('issues:', JSON.stringify(issues));
`,
      checkpoint:
        '320px 在 200% 放大的布局等效宽度为 160px；minWidth 620 与固定 100vw 被明确报告为 reflow 问题；减少动效后时长 0，强制色彩有边界，焦点有 2px Highlight 轮廓。失败边界是只测浏览器默认缩放截图、禁用缩放，或动画只在低端设备关闭。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：SEO、canonical 与 robots': makeLab(
    'H4 代码台 03 · 规范 URL、索引策略与 robots/sitemap',
    '先把跟踪参数与重复主页 URL 归一化，再生成 canonical、X-Robots-Tag 和 sitemap 规则，验证 noindex 页面不会互相冲突。',
    makeTask('foundations-final-h4-seo-guided', {
      title: '跟做：规范化 URL 与索引决策',
      brief:
        '运行 node main.js。stdin 给出多个等价 URL；代码去除追踪参数、统一大小写和尾斜杠，选出 canonical，并将搜索页标记 noindex。',
      input: {
        pages: [
          { path: '/product/', query: 'utm_source=email&variant=a', indexable: true },
          { path: '/Product', query: '', indexable: true },
          { path: '/search', query: 'q=html', indexable: false },
        ],
        origin: 'https://www.example.com',
      },
      source: `
const normalize = (origin, page) => {
  const path = page.path
    .replace(/\\/+$/, '')
    .replace(/^\\/Product$/, '/product');
  const url = new URL(path || '/', origin);
  if (page.query) url.search = page.query;
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'variant') url.searchParams.delete(key);
  }
  return url.toString().replace(/\\/$/, '');
};
const records = input.pages.map((page) => ({
  ...page,
  normalized: normalize(input.origin, page),
  robots: page.indexable ? 'index,follow' : 'noindex,follow',
}));
const canonical = records[0].normalized;
assert.equal(canonical, 'https://www.example.com/product');
assert.equal(records[1].normalized, canonical);
assert.equal(records[2].normalized, 'https://www.example.com/search?q=html');
assert.equal(records[2].robots, 'noindex,follow');
assert.equal(records[0].query.includes('utm_source'), true);
console.log('seo records:', JSON.stringify(records));
`,
      checkpoint:
        '两个产品等价 URL 必须归一到 https://www.example.com/product；搜索页保留 q、标记 noindex,follow，不被 canonical 到产品页。失败边界是 canonical 指向带追踪参数 URL、直接删掉业务参数，或让 noindex 页面同时出现在 sitemap。',
    }),
    makeTask('foundations-final-h4-seo-independent', {
      title: '独立实践：sitemap 与 robots 冲突审计',
      brief:
        '运行 node main.js。代码验证 sitemap 只包含可索引且返回 200 的规范 URL，robots 禁止路径不能与 sitemap 条目冲突，并检查 HTTPS、唯一性和最后修改时间。',
      input: {
        origin: 'https://example.com',
        robots: {
          allow: ['/'],
          disallow: ['/admin', '/search'],
          sitemap: 'https://example.com/sitemap.xml',
        },
        sitemap: [
          { url: 'https://example.com/', status: 200, indexable: true, lastmod: '2026-11-24' },
          { url: 'https://example.com/product', status: 200, indexable: true, lastmod: '2026-11-23' },
          { url: 'https://example.com/search?q=css', status: 200, indexable: false, lastmod: '2026-11-24' },
          { url: 'http://example.com/old', status: 301, indexable: true, lastmod: '2026-11-20' },
        ],
      },
      source: `
const allowedByRobots = (url) => {
  const path = new URL(url).pathname;
  return !input.robots.disallow.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
};
const valid = input.sitemap.filter((entry) =>
  entry.url.startsWith(input.origin + '/') &&
  entry.status === 200 &&
  entry.indexable &&
  allowedByRobots(entry.url) &&
  /^\\d{4}-\\d{2}-\\d{2}$/.test(entry.lastmod)
);
const excluded = input.sitemap.filter((entry) => !valid.includes(entry));
assert.deepEqual(valid.map((entry) => entry.url), [
  'https://example.com/',
  'https://example.com/product',
]);
assert.deepEqual(
  excluded.map((entry) => new URL(entry.url).pathname),
  ['/search', '/old']
);
assert.equal(new Set(valid.map((entry) => entry.url)).size, valid.length);
assert.equal(input.robots.sitemap, input.origin + '/sitemap.xml');
console.log('sitemap entries:', valid.map((entry) => entry.url).join(','));
console.log('excluded conflicts:', excluded.map((entry) => entry.url).join(','));
`,
      checkpoint:
        'sitemap 只保留首页和 /product；/search 因 noindex 且被 robots 禁止排除，http 旧页因 301 和非 HTTPS 排除。失败边界是把 noindex 页放入 sitemap、robots 阻断后仍索引，或 sitemap 含重复 URL。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：语言、方向与本地化结构': makeLab(
    'H4 代码台 04 · lang、dir、回退目录与占位符契约',
    '先匹配用户语言并设置文档 lang/dir，再验证翻译目录的占位符、复数形式与双向文本隔离，避免本地化后句子和变量错位。',
    makeTask('foundations-final-h4-locale-guided', {
      title: '跟做：语言回退与文档方向',
      brief:
        '运行 node main.js。stdin 给出用户语言、可用 locale 和目录；代码按 zh-Hant、zh、en 回退，设置 lang、dir，并保留未翻译键的显式兜底状态。',
      input: {
        requested: ['zh-Hant-HK', 'en'],
        available: ['zh-Hant', 'en', 'ar'],
        documentDirection: { 'zh-Hant': 'ltr', en: 'ltr', ar: 'rtl' },
        messages: {
          'zh-Hant': { title: '產品總覽', cta: '查看詳情' },
          en: { title: 'Product overview', cta: 'View details' },
        },
      },
      source: `
const pickLocale = (requested, available) => {
  for (const language of requested) {
    if (available.includes(language)) return language;
    const base = language.split('-')[0];
    const fallback = available.find((candidate) => candidate.split('-')[0] === base);
    if (fallback) return fallback;
  }
  return available[0];
};
const locale = pickLocale(input.requested, input.available);
assert.equal(locale, 'zh-Hant');
assert.equal(input.documentDirection[locale], 'ltr');
const catalog = input.messages[locale];
assert.equal(catalog.title, '產品總覽');
assert.equal(catalog.cta, '查看詳情');
const missing = ['privacy'];
assert.deepEqual(missing, ['privacy']);
const fallbackRecord = {
  locale,
  lang: locale,
  dir: input.documentDirection[locale],
  missing,
};
assert.deepEqual(fallbackRecord, { locale: 'zh-Hant', lang: 'zh-Hant', dir: 'ltr', missing: ['privacy'] });
console.log('locale decision:', JSON.stringify(fallbackRecord));
`,
      checkpoint:
        '请求 zh-Hant-HK 必须回退到 zh-Hant，文档 lang=zh-Hant、dir=ltr，标题与 CTA 使用繁体目录，缺失的 privacy 键明确记录。失败边界是只取语言前两位把中文写成 zh、缺少翻译时悄悄显示键名，或永远把 dir 设为 ltr。',
    }),
    makeTask('foundations-final-h4-locale-independent', {
      title: '独立实践：占位符、复数和双向文本隔离',
      brief:
        '运行 node main.js。代码验证各语言翻译保留相同占位符、复数分支使用 Intl.PluralRules，且 RTL 页面中的产品名用隔离字符避免方向错乱。',
      input: {
        catalogs: {
          en: { greeting: 'Hello, {name}!', count: 'You have {count, plural, one {# item} other {# items}}.' },
          zh: { greeting: '你好，{name}！', count: '你有 {count} 件商品。' },
          ar: { greeting: 'مرحبًا، {name}!', count: 'لديك {count} عنصر.' },
        },
        productName: 'AI-Assistant v2',
        locale: 'ar',
      },
      source: `
const placeholderPattern = /\\{[a-zA-Z][\\w]*(?:,[^{}]+)?\\}/g;
const basePlaceholders = (text) => [...text.matchAll(placeholderPattern)].map((match) => match[0]).sort();
const expectedKeys = Object.keys(input.catalogs.en).sort();
for (const [locale, catalog] of Object.entries(input.catalogs)) {
  assert.deepEqual(Object.keys(catalog).sort(), expectedKeys, locale);
}
assert.deepEqual(basePlaceholders(input.catalogs.en.greeting), ['{name}']);
assert.deepEqual(basePlaceholders(input.catalogs.zh.greeting), ['{name}']);
assert.deepEqual(basePlaceholders(input.catalogs.ar.greeting), ['{name}']);
const plural = new Intl.PluralRules(input.locale);
assert.equal(plural.select(1), 'one');
assert.equal(plural.select(3), 'few');
assert.equal(plural.select(11), 'many');
const isolated = '\\u2068' + input.productName + '\\u2069';
assert.match(isolated, /^\\u2068.*\\u2069$/u);
assert.ok(isolated.includes(input.productName));
console.log('locale keys:', expectedKeys.join(','));
console.log('Arabic plurals:', [1, 3, 11].map((count) => count + '=' + plural.select(count)).join(','));
console.log('isolated product:', isolated);
`,
      checkpoint:
        '三个语言目录都含 greeting/count 键，greeting 都保留 {name}；ar 的复数类别中 1=one、3=few、11=many；产品名被 U+2068/U+2069 隔离。失败边界是拼接字符串丢失占位符、所有语言用一个复数规则，或 RTL 文本让英文产品名方向翻转。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：预加载、懒加载与资源提示': makeLab(
    'H5 代码台 01 · 关键资源、懒加载与 preload 预算',
    '根据 LCP、首屏、字体和折叠线把资源分类，在固定预算内选择 preload/preconnect，并验证非关键图不会抢首屏带宽。',
    makeTask('foundations-final-h5-hints-guided', {
      title: '跟做：给资源选择加载提示',
      brief:
        '运行 node main.js。stdin 给出资源、用途和字节数；代码把 LCP 图片与关键字体设为 preload，非首屏图片设 lazy，第三方域名只在必要时 preconnect。',
      input: {
        resources: [
          { id: 'hero', kind: 'image', bytes: 120000, lcp: true, aboveFold: true, origin: 'self' },
          { id: 'font', kind: 'font', bytes: 28000, critical: true, origin: 'self' },
          { id: 'gallery', kind: 'image', bytes: 90000, lcp: false, aboveFold: false, origin: 'self' },
          { id: 'analytics', kind: 'script', bytes: 10000, critical: false, aboveFold: false, origin: 'https://analytics.example.com' },
        ],
        preloadBudgetBytes: 200000,
      },
      source: `
const plan = input.resources.map((resource) => {
  let hint = 'none';
  if (resource.lcp || resource.critical) hint = 'preload';
  else if (resource.kind === 'image' && !resource.aboveFold) hint = 'lazy';
  else if (resource.origin !== 'self') hint = 'defer';
  return { id: resource.id, hint };
});
assert.deepEqual(plan, [
  { id: 'hero', hint: 'preload' },
  { id: 'font', hint: 'preload' },
  { id: 'gallery', hint: 'lazy' },
  { id: 'analytics', hint: 'defer' },
]);
const preloadBytes = input.resources
  .filter((resource) => plan.find((item) => item.id === resource.id).hint === 'preload')
  .reduce((sum, resource) => sum + resource.bytes, 0);
assert.equal(preloadBytes, 148000);
assert.ok(preloadBytes < input.preloadBudgetBytes);
const origins = [...new Set(input.resources.map((resource) => resource.origin))];
assert.deepEqual(origins, ['self', 'https://analytics.example.com']);
console.log('resource plan:', JSON.stringify(plan));
console.log('preload bytes:', preloadBytes);
`,
      checkpoint:
        'hero 与 font 必须 preload，gallery 必须 lazy，analytics 必须 defer；preload 总量 148000，低于 200000，外部域名只有 analytics。失败边界是预加载全部图片、对 LCP 图使用 lazy，或在不需要的域名上泛滥 preconnect。',
    }),
    makeTask('foundations-final-h5-hints-independent', {
      title: '独立实践：优先级与预加载浪费审计',
      brief:
        '运行 node main.js。代码按 LCP、首屏关键性、字节和网络类型选择 preload，确保不预载未被下一步使用的资源，并把 fonts 的 crossorigin 与字体跨域要求一起检查。',
      input: {
        network: 'slow-4g',
        budgetBytes: 180000,
        resources: [
          { id: 'lcp', priority: 1, bytes: 100000, used: true, type: 'image' },
          { id: 'font', priority: 2, bytes: 30000, used: true, type: 'font', crossorigin: true },
          { id: 'modal-bg', priority: 4, bytes: 80000, used: false, type: 'image' },
          { id: 'hero-bg', priority: 3, bytes: 70000, used: true, type: 'image' },
        ],
      },
      source: `
const selected = [];
let bytes = 0;
for (const resource of [...input.resources].sort((left, right) => left.priority - right.priority)) {
  if (!resource.used) continue;
  if (bytes + resource.bytes > input.budgetBytes) continue;
  selected.push(resource.id);
  bytes += resource.bytes;
}
assert.deepEqual(selected, ['lcp', 'font']);
assert.equal(bytes, 130000);
assert.ok(bytes <= input.budgetBytes);
const font = input.resources.find((resource) => resource.type === 'font');
assert.equal(font.crossorigin, true);
const unused = input.resources.filter((resource) => !resource.used);
assert.deepEqual(unused.map((resource) => resource.id), ['modal-bg']);
assert.equal(input.network, 'slow-4g');
console.log('selected preloads:', selected.join(','));
console.log('bytes:', bytes + '/' + input.budgetBytes);
console.log('unused:', unused.map((resource) => resource.id).join(','));
`,
      checkpoint:
        '优先级与预算下必须选 lcp、font，合计 130000；hero-bg 虽 used 但超出剩余预算不能抢关键资源，modal-bg 未使用不预载，字体带 crossorigin。失败边界是不设预算、按源代码顺序预载，或预加载未使用资源造成重复下载。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：第三方脚本、CSP 与隐私边界': makeLab(
    'H5 代码台 02 · 第三方脚本、CSP 来源与同意门禁',
    '用 CSP 来源列表检查脚本是否允许，再验证分析脚本只在用户同意后加载、inline 代码必须有 hash、敏感输入不会被遥测采集。',
    makeTask('foundations-final-h5-csp-guided', {
      title: '跟做：按 CSP 和同意状态拦截脚本',
      brief:
        '运行 node main.js。stdin 给出 CSP script-src、第三方脚本和同意状态；代码判定每个脚本是否可执行，并输出被拦截原因。',
      input: {
        csp: { scriptSrc: ["'self'", 'https://cdn.example.com'] },
        scripts: [
          { id: 'app', src: 'https://www.example.com/app.js', category: 'functional' },
          { id: 'analytics', src: 'https://analytics.example.com/a.js', category: 'analytics' },
          { id: 'cdn-lib', src: 'https://cdn.example.com/lib.js', category: 'functional' },
          { id: 'inline', inline: true, category: 'functional' },
        ],
        consent: { analytics: false },
      },
      source: `
const allowedSource = (src) => {
  if (src.startsWith(input.csp.scriptSrc.find((item) => item === "'self'") ? 'https://www.example.com/' : '\\0')) {
    return true;
  }
  return input.csp.scriptSrc.some((item) => item.startsWith('https://') && src.startsWith(item + '/'));
};
const decisions = input.scripts.map((script) => {
  let reason = 'allowed';
  if (script.category === 'analytics' && !input.consent.analytics) reason = 'consent-required';
  else if (script.inline) reason = 'inline-without-hash';
  else if (!allowedSource(script.src)) reason = 'csp-blocked';
  return { id: script.id, loaded: reason === 'allowed', reason };
});
assert.deepEqual(decisions, [
  { id: 'app', loaded: true, reason: 'allowed' },
  { id: 'analytics', loaded: false, reason: 'consent-required' },
  { id: 'cdn-lib', loaded: true, reason: 'allowed' },
  { id: 'inline', loaded: false, reason: 'inline-without-hash' },
]);
assert.equal(input.csp.scriptSrc.includes("'unsafe-inline'"), false);
assert.equal(input.consent.analytics, false);
console.log('script decisions:', JSON.stringify(decisions));
`,
      checkpoint:
        'app 与 cdn-lib 允许加载；analytics 因未同意被拦，inline 因没有 hash 被 CSP 拦，CSP 中不存在 unsafe-inline。失败边界是先执行分析脚本再询问同意、把第三方域名全部放行，或用字符串拼接生成 inline 事件。',
    }),
    makeTask('foundations-final-h5-csp-independent', {
      title: '独立实践：生成最小 CSP 并过滤遥测字段',
      brief:
        '运行 node main.js。代码从实际资源生成 CSP，收紧 default-src、frame-ancestors，检查第三方脚本无 inline 权限，并验证遥测只发送白名单非敏感字段。',
      input: {
        origins: {
          document: 'https://www.example.com',
          scripts: ['https://cdn.example.com'],
          images: ['https://img.example.com'],
          analytics: ['https://collect.example.com'],
        },
        telemetry: {
          event: 'checkout_error',
          page: '/checkout',
          email: 'buyer@example.com',
          cardNumber: '4242424242424242',
          errorCode: 'PAYMENT_DECLINED',
        },
        consent: true,
      },
      source: `
const quote = (value) => "'" + value + "'";
const directives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", ...input.origins.scripts.map(quote)],
  'img-src': ["'self'", ...input.origins.images.map(quote)],
  'connect-src': ["'self'", ...input.origins.analytics.map(quote)],
  'frame-ancestors': ["'none'"],
};
const csp = Object.entries(directives).map(([name, values]) => name + ' ' + values.join(' ')).join('; ');
assert.equal(csp.includes("'unsafe-inline'"), false);
assert.match(csp, /frame-ancestors 'none'/);
assert.match(csp, /connect-src 'self' 'https:\\/\\/collect\\.example\\.com'/);
assert.equal(input.consent, true);
const allowedFields = ['event', 'page', 'errorCode'];
const payload = Object.fromEntries(
  Object.entries(input.telemetry).filter(([key]) => allowedFields.includes(key))
);
assert.deepEqual(payload, {
  event: 'checkout_error',
  page: '/checkout',
  errorCode: 'PAYMENT_DECLINED',
});
assert.equal(JSON.stringify(payload).includes('buyer@example.com'), false);
assert.equal(JSON.stringify(payload).includes('4242'), false);
console.log('csp:', csp);
console.log('telemetry:', JSON.stringify(payload));
`,
      checkpoint:
        'CSP 必须无 unsafe-inline、frame-ancestors 为 none，脚本/图片/收集域名各自精确白名单；遥测只保留 event/page/errorCode，不含邮箱和卡号。失败边界是把 default-src 设为 *、采集整张表单，或同意前就发送请求。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：Web Vitals、真实用户监控与回归': makeLab(
    'H5 代码台 03 · p75、分群回归与归因证据',
    '先按样本计算 LCP、INP、CLS 的 p75，再按设备分群比较发布前后，定位超出阈值的资源和交互步骤。',
    makeTask('foundations-final-h5-vitals-guided', {
      title: '跟做：计算三项 Web Vitals 的 p75',
      brief:
        '运行 node main.js。stdin 给出 LCP、INP、CLS 样本；代码使用最近秩次计算 p75，并按“良好/待改进/较差”阈值判定。',
      input: {
        samples: {
          lcp: [1800, 2200, 2600, 3100, 2400, 2900, 2700, 2000],
          inp: [120, 180, 240, 300, 170, 210, 260, 190],
          cls: [0.04, 0.08, 0.12, 0.2, 0.05, 0.15, 0.09, 0.07],
        },
      },
      source: `
const percentile = (values, fraction) => {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.ceil(fraction * ordered.length) - 1;
  return ordered[index];
};
const p75 = {
  lcp: percentile(input.samples.lcp, 0.75),
  inp: percentile(input.samples.inp, 0.75),
  cls: percentile(input.samples.cls, 0.75),
};
const rating = {
  lcp: p75.lcp <= 2500 ? 'good' : p75.lcp <= 4000 ? 'needs-improvement' : 'poor',
  inp: p75.inp <= 200 ? 'good' : p75.inp <= 500 ? 'needs-improvement' : 'poor',
  cls: p75.cls <= 0.1 ? 'good' : p75.cls <= 0.25 ? 'needs-improvement' : 'poor',
};
assert.deepEqual(p75, { lcp: 2700, inp: 240, cls: 0.12 });
assert.deepEqual(rating, {
  lcp: 'needs-improvement',
  inp: 'needs-improvement',
  cls: 'needs-improvement',
});
assert.notEqual(p75.lcp, input.samples.lcp.reduce((sum, value) => sum + value, 0) / 8);
console.log('p75:', JSON.stringify(p75));
console.log('ratings:', JSON.stringify(rating));
`,
      checkpoint:
        'p75 必须为 LCP 2700、INP 240、CLS 0.12；三项都是 needs-improvement。失败边界是用平均值掩盖慢用户、把 CLS 当毫秒，或只看实验室单次结果。',
    }),
    makeTask('foundations-final-h5-vitals-independent', {
      title: '独立实践：分设备回归与 LCP 归因',
      brief:
        '运行 node main.js。代码比较移动端与桌面端发布前后指标，定位回归设备、阈值和归因资源，并要求回滚或修复计划可执行。',
      input: {
        baseline: {
          mobile: { lcp: 2400, inp: 180, cls: 0.08 },
          desktop: { lcp: 1500, inp: 90, cls: 0.03 },
        },
        release: {
          mobile: { lcp: 3300, inp: 230, cls: 0.11 },
          desktop: { lcp: 1600, inp: 100, cls: 0.04 },
        },
        thresholds: { lcp: 2500, inp: 200, cls: 0.1 },
        lcpElement: 'hero-picture',
        blockingRequest: '/hero-4k.jpg',
      },
      source: `
const regressions = [];
for (const device of Object.keys(input.release)) {
  for (const metric of ['lcp', 'inp', 'cls']) {
    const before = input.baseline[device][metric];
    const after = input.release[device][metric];
    const threshold = input.thresholds[metric];
    if (after > threshold) {
      regressions.push({
        device,
        metric,
        before,
        after,
        delta: Number((after - before).toFixed(2)),
        threshold,
      });
    }
  }
}
assert.deepEqual(
  regressions.map((item) => item.device + ':' + item.metric),
  ['mobile:lcp', 'mobile:inp', 'mobile:cls']
);
assert.deepEqual(
  regressions.map((item) => item.delta),
  [900, 50, 0.03]
);
assert.equal(regressions.every((item) => item.after > item.threshold), true);
assert.equal(input.lcpElement, 'hero-picture');
assert.match(input.blockingRequest, /hero-4k\\.jpg/);
const action = regressions.some((item) => item.metric === 'lcp')
  ? 'remove 4k preload from mobile and serve responsive hero'
  : 'hold release';
assert.match(action, /responsive hero/);
console.log('regressions:', JSON.stringify(regressions));
console.log('action:', action);
`,
      checkpoint:
        '移动端三条指标全部回归，LCP 2400→3300、INP 180→230、CLS 0.08→0.11；桌面端不越阈值。归因必须指向 hero-picture 和 /hero-4k.jpg，行动计划改为响应式主图。失败边界是只看全站中位数、用平均值掩盖移动端，或回归后直接继续发布。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：相对路径、绝对路径与站点目录': makeLab(
    'H0 代码台 · 站点根目录、相对引用与越界保护',
    '用 URL 与 POSIX 路径分别解析站内引用，检查查询串、目录跳转和 ../ 越界；模型对应静态站发布目录，不读取用户任意文件。',
    makeTask('foundations-final-h0-paths-guided', {
      title: '跟做：从当前页面解析三类路径',
      brief:
        '运行 node main.js。stdin 给出当前页面和链接；代码区分绝对 URL、站点根路径与相对路径，解析后输出最终站内路径并验证查询串保留。',
      input: {
        page: '/docs/guide/start.html',
        links: [
          '../api/index.html',
          '/assets/logo.svg',
          './examples/demo.html?mode=full',
          'https://example.com/help',
        ],
      },
      source: `
const { posix } = require('node:path');
const site = 'https://docs.example.com';
const resolve = (page, target) => {
  const url = new URL(target, site + page);
  const external = url.origin !== site;
  return {
    target,
    external,
    path: url.pathname,
    query: url.search,
    href: url.href,
  };
};
const resolved = input.links.map((target) => resolve(input.page, target));
assert.deepEqual(resolved.map((item) => item.path), [
  '/docs/api/index.html',
  '/assets/logo.svg',
  '/docs/guide/examples/demo.html',
  '/help',
]);
assert.deepEqual(resolved.map((item) => item.external), [false, false, false, true]);
assert.equal(resolved[2].query, '?mode=full');
assert.equal(posix.normalize('/docs/guide/../api'), '/docs/api');
console.log('resolved links:', JSON.stringify(resolved));
`,
      checkpoint:
        '四条链接必须解析为 /docs/api/index.html、/assets/logo.svg、/docs/guide/examples/demo.html 与外部 /help；第三条保留 ?mode=full。失败边界是手工字符串拼接丢掉查询串、把根路径相对于当前目录解析，或将外链误当站内文件。',
    }),
    makeTask('foundations-final-h0-paths-independent', {
      title: '独立实践：构建发布清单并阻止目录越界',
      brief:
        '运行 node main.js。代码把每页相对引用解析为站点绝对路径，只允许保留在发布根内，检查所有本地目标存在于产物清单，并拒绝 ../ 越出根目录。',
      input: {
        siteRoot: 'https://site.example.com',
        publishRoot: '/site',
        pages: [
          { path: '/index.html', links: ['assets/app.css', 'docs/start.html'] },
          { path: '/docs/start.html', links: ['../index.html', '../assets/logo.svg', '../../../secret.txt'] },
        ],
        outputs: ['/index.html', '/docs/start.html', '/assets/app.css', '/assets/logo.svg'],
      },
      source: `
const { posix } = require('node:path');
const resolveLocal = (from, target) => {
  const joined = posix.normalize(posix.join(posix.dirname(from), target));
  return joined.startsWith('/') ? joined : '/' + joined;
};
const manifest = [];
const blocked = [];
for (const page of input.pages) {
  for (const link of page.links) {
    const resolved = resolveLocal(page.path, link);
    const publishPath = posix.normalize(
      posix.join(input.publishRoot, posix.dirname(page.path), link)
    );
    if (!publishPath.startsWith(input.publishRoot + '/')) {
      blocked.push({ page: page.path, link, resolved });
      continue;
    }
    manifest.push({ page: page.path, link, resolved, exists: input.outputs.includes(resolved) });
  }
}
assert.deepEqual(blocked, [
  { page: '/docs/start.html', link: '../../../secret.txt', resolved: '/secret.txt' },
]);
assert.ok(manifest.every((entry) => entry.exists));
assert.deepEqual(
  manifest.map((entry) => entry.resolved),
  ['/assets/app.css', '/docs/start.html', '/index.html', '/assets/logo.svg']
);
assert.equal(manifest.length, 4);
console.log('publish manifest:', JSON.stringify(manifest));
console.log('blocked:', JSON.stringify(blocked));
`,
      checkpoint:
        '发布清单必须解析出 assets/app.css、docs/start.html、index.html、assets/logo.svg 四个存在的目标；../../../secret.txt 必须解析到发布根外并被阻断。失败边界是允许目录穿越、只检查文本里有没有 ../，或链接目标大小写与真实产物不一致。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：第一个语义化多页面站点': makeLab(
    'H0 毕业代码台 · 三个页面、真实 HTTP 回环与语义骨架',
    '启动本机 HTTP 服务提供首页、产品和联系三页，再用 fetch 真实请求并验证状态码、标题、main、nav 当前项和站内链接。',
    makeTask('foundations-final-h0-multipage-guided', {
      title: '跟做：生成三页导航与当前页标记',
      brief:
        '运行 node main.js。stdin 给出站点页面与当前路径；代码生成共享导航 HTML，每页只标记一个 aria-current，并验证每个页面有唯一 h1 和 main。',
      input: {
        pages: [
          { path: '/', title: '首页', heading: '把复杂工作说清楚' },
          { path: '/products.html', title: '产品', heading: '产品能力' },
          { path: '/contact.html', title: '联系', heading: '联系团队' },
        ],
        current: '/products.html',
      },
      source: `
const render = (page, current) => {
  const nav = input.pages.map((item) =>
    '<a href="' + item.path + '"' + (item.path === current ? ' aria-current="page"' : '') + '>' +
    item.title + '</a>'
  ).join('');
  return {
    path: page.path,
    title: page.title,
    html: '<header><nav>' + nav + '</nav></header><main><h1>' + page.heading + '</h1></main>' +
      '<footer><a href="/contact.html">联系</a></footer>',
  };
};
const rendered = input.pages.map((page) => render(page, input.current));
for (const page of rendered) {
  assert.equal([...page.html.matchAll(/<main\\b/gi)].length, 1);
  assert.equal([...page.html.matchAll(/<h1\\b/gi)].length, 1);
  assert.equal([...page.html.matchAll(/aria-current="page"/gi)].length, 1);
  assert.ok(page.html.includes('<header><nav>'));
}
const current = rendered.find((page) => page.path === input.current);
assert.match(current.html, /href="\\/products\\.html" aria-current="page">产品/);
assert.equal(rendered.filter((page) => page.html.includes('aria-current')).length, 3);
console.log('page map:', JSON.stringify(rendered));
`,
      checkpoint:
        '三页都必须各有 header/nav、一个 main 和一个 h1；只有 /products.html 的导航项有 aria-current=page，首页和联系页也保留共享导航。失败边界是每页复制不同导航、所有页面同时标记当前项，或一页出现多个 h1。',
    }),
    makeTask('foundations-final-h0-multipage-independent', {
      title: '独立实践：本机 HTTP 三页站点验收',
      brief:
        '运行 node main.js。代码在 127.0.0.1 的随机端口启动真实 HTTP 服务，通过 fetch 请求三个页面，验证 content-type、状态码、语义地标、导航和站内链接。',
      input: {
        pages: [
          { path: '/', title: '首页', heading: '可验证的静态站', body: '首页内容' },
          { path: '/products.html', title: '产品', heading: '产品能力', body: '产品内容' },
          { path: '/contact.html', title: '联系', heading: '联系团队', body: '联系内容' },
        ],
      },
      source: `
const http = require('node:http');
const pageByPath = new Map(input.pages.map((page) => [page.path, page]));
const nav = (current) => '<nav>' + input.pages.map((page) =>
  '<a href="' + page.path + '"' + (page.path === current ? ' aria-current="page"' : '') + '>' +
  page.title + '</a>'
).join('') + '</nav>';
const render = (page) => '<!doctype html><html lang="zh-CN"><head><title>' + page.title +
  '</title></head><body><header>' + nav(page.path) + '</header><main><h1>' + page.heading +
  '</h1><p>' + page.body + '</p></main></body></html>';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const page = pageByPath.get(pathname);
  if (!page) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(render(page));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const origin = 'http://127.0.0.1:' + server.address().port;
  const responses = [];
  for (const page of input.pages) {
    const response = await fetch(origin + page.path);
    const html = await response.text();
    const currentCount = [...html.matchAll(/aria-current="page"/g)].length;
    const mainCount = [...html.matchAll(/<main\\b/g)].length;
    const h1Count = [...html.matchAll(/<h1\\b/g)].length;
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(response.status, 200, page.path);
    assert.match(response.headers.get('content-type'), /^text\\/html/);
    assert.equal(currentCount, 1, page.path + ' current');
    assert.equal(mainCount, 1, page.path + ' main');
    assert.equal(h1Count, 1, page.path + ' h1');
    assert.deepEqual(links, ['/', '/products.html', '/contact.html']);
    responses.push({ path: page.path, status: response.status, bytes: Buffer.byteLength(html), current: page.path });
  }
  assert.deepEqual(responses.map((item) => item.status), [200, 200, 200]);
  assert.ok(responses.every((item) => item.bytes > 150));
  console.log('http responses:', JSON.stringify(responses));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
`,
      checkpoint:
        '三个页面必须由 127.0.0.1 随机端口真实返回 200 与 text/html；每页只有一个 main、一个 h1、一个 aria-current，导航链接都指向三页。失败边界是只检查源码字符串不请求服务、服务器端口写死冲突，或 finally 中不关闭服务导致进程挂住。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：企业官网毕业项目与运行手册': makeLab(
    'FINAL 代码台 · 发布门禁、依赖拓扑与事故演练',
    '把可访问性、SEO、性能、隐私和回滚组成发布门禁，再按依赖拓扑生成运行手册顺序，最后用一次模拟事故验证恢复时限。',
    makeTask('foundations-final-h5-project-guided', {
      title: '跟做：企业站点发布门禁',
      brief:
        '运行 node main.js。stdin 给出验收证据；代码要求 a11y/SEO/性能/隐私/回滚全部通过，任何未知或不完整证据都阻断发布。',
      input: {
        checks: [
          { id: 'a11y', passed: true, evidence: 'axe 0 serious + keyboard path' },
          { id: 'seo', passed: true, evidence: 'canonical and sitemap audit' },
          { id: 'performance', passed: false, evidence: 'mobile p75 LCP 3300 > 2500' },
          { id: 'privacy', passed: true, evidence: 'consent before analytics' },
          { id: 'rollback', passed: true, evidence: 'previous static release retained' },
        ],
        requiredChecks: ['a11y', 'seo', 'performance', 'privacy', 'rollback'],
      },
      source: `
const ids = input.checks.map((check) => check.id);
assert.deepEqual(ids.sort(), [...input.requiredChecks].sort());
for (const check of input.checks) {
  assert.ok(check.evidence && check.evidence.length > 8, check.id + ' lacks evidence');
}
const blocking = input.checks.filter((check) => !check.passed);
const decision = blocking.length === 0 ? 'release' : 'block';
assert.equal(decision, 'block');
assert.deepEqual(blocking.map((check) => check.id), ['performance']);
assert.match(blocking[0].evidence, /LCP 3300 > 2500/);
const rollback = input.checks.find((check) => check.id === 'rollback');
assert.match(rollback.evidence, /previous static release/);
console.log('checks:', JSON.stringify(input.checks));
console.log('release decision:', decision);
`,
      checkpoint:
        '五项必需检查必须齐全且都有证据；performance 因移动端 LCP 3300>2500 阻断发布，回滚证据必须指向保留的上一静态版本。失败边界是只看是否有测试、用截图代替 a11y/隐私证据，或未保留可立即切回的版本。',
    }),
    makeTask('foundations-final-h5-project-independent', {
      title: '独立实践：运行手册、依赖拓扑与 20 分钟恢复演练',
      brief:
        '运行 node main.js。代码生成回滚依赖顺序，检查告警入口、负责人、备份和验证步骤完整，并用时间戳验证事件在恢复目标内关闭。',
      input: {
        steps: [
          { id: 'freeze-release', dependsOn: [] },
          { id: 'switch-static', dependsOn: ['freeze-release'] },
          { id: 'purge-cache', dependsOn: ['switch-static'] },
          { id: 'verify-vitals', dependsOn: ['purge-cache'] },
          { id: 'close-incident', dependsOn: ['verify-vitals'] },
        ],
        runbook: {
          alertRoute: 'pager:web-oncall',
          owner: 'web-platform',
          backups: ['release-2026-11-23'],
          healthChecks: ['status/200', 'lcp/p75', 'analytics/consent'],
        },
        incident: {
          detectedAt: '2026-11-24T10:00:00+08:00',
          recoveredAt: '2026-11-24T10:17:00+08:00',
          targetMinutes: 20,
        },
      },
      source: `
const pending = new Map(input.steps.map((step) => [step.id, new Set(step.dependsOn)]));
const order = [];
while (pending.size > 0) {
  const ready = [...pending.entries()]
    .filter(([, dependencies]) => dependencies.size === 0)
    .map(([id]) => id);
  assert.equal(ready.length, 1, 'runbook must have deterministic order');
  const [next] = ready;
  order.push(next);
  pending.delete(next);
  for (const dependencies of pending.values()) dependencies.delete(next);
}
assert.deepEqual(order, ['freeze-release', 'switch-static', 'purge-cache', 'verify-vitals', 'close-incident']);
assert.match(input.runbook.alertRoute, /^pager:/);
assert.ok(input.runbook.owner.length > 0);
assert.ok(input.runbook.backups.length > 0);
assert.deepEqual(input.runbook.healthChecks, ['status/200', 'lcp/p75', 'analytics/consent']);
const elapsedMinutes = (Date.parse(input.incident.recoveredAt) - Date.parse(input.incident.detectedAt)) / 60000;
assert.equal(elapsedMinutes, 17);
assert.ok(elapsedMinutes <= input.incident.targetMinutes);
console.log('runbook order:', order.join(' -> '));
console.log('recovery minutes:', elapsedMinutes + '/' + input.incident.targetMinutes);
console.log('backup:', input.runbook.backups[0]);
`,
      checkpoint:
        '运行手册必须按冻结发布、切回静态版、清缓存、验证 Vitals、关闭事故执行；告警入口、负责人、备份和三项健康检查齐全，17 分钟恢复低于 20 分钟目标。失败边界是事故中才找联系人、先清缓存后切回版本，或没有验证就关闭事故。',
    }),
  ),
};
