import type { LearningV2CodeLab } from './v2-types.js';

/**
 * P15 综合训练 DevKit 开源工具的代码实验。
 *
 * 所有任务只依赖 Node.js 标准库，并以确定性 stdin、内存文件系统和命令契约
 * 验证工程判断。npm registry、Cosign、SBOM 生成器及跨平台安装器在任务中
 * 使用显式文件/命令契约模拟，不冒充已经访问真实服务或完成系统级安装。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装 npm 依赖或外部命令行工具。',
    '先按给定 stdin 运行跟做任务，再修改输入完成独立实践。',
    'registry、签名验证和安装过程均为明确标注的确定性契约模拟，不能替代真实发布环境验证。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_P15_DEVKIT: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:综合训练 · DevKit 开源工具 · 业务理解与用户任务': {
    title: 'DevKit 项目台 01 · 角色任务不是权限换名',
    description:
      '把开发者、维护者、平台工程师和安全审核员各自成功完成任务所需的能力分开，再用请求矩阵验证既不能少给能力，也不能把发布或签名权限顺手发给所有角色。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-role-capabilities-guided',
      title: '跟做：从用户任务推导最小能力集',
      brief:
        '读取四类角色及其任务和请求。按角色能力白名单判断命令是否允许，输出拒绝原因，并断言开发者能初始化、维护者能发布、安全审核员不能执行用户代码、维护者不能代替安全角色签名。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const capabilitiesByRole = {
  developer: new Set(['init', 'check', 'run']),
  maintainer: new Set(['version', 'release', 'verify']),
  platform: new Set(['install', 'upgrade', 'check', 'run']),
  security: new Set(['verify', 'sbom', 'sign']),
};

function decide(request) {
  const capabilities = capabilitiesByRole[request.role];
  if (!capabilities) return { allowed: false, code: 'UNKNOWN_ROLE' };
  if (!capabilities.has(request.command)) {
    return {
      allowed: false,
      code: 'CAPABILITY_REQUIRED',
      required: request.command,
    };
  }
  return { allowed: true, code: 'ALLOWED' };
}

const decisions = input.requests.map((request) => ({
  label: request.label,
  ...decide(request),
}));
const missingCommands = input.roles.flatMap((role) =>
  role.requiredCommands
    .filter((command) => !(capabilitiesByRole[role.id]?.has(command)))
    .map((command) => role.id + ':' + command));

assert.deepEqual(decisions.map((item) => item.allowed), [true, true, false, false]);
assert.equal(decisions[2].code, 'CAPABILITY_REQUIRED');
assert.equal(decisions[3].required, 'sign');
assert.deepEqual(missingCommands, []);
console.log(JSON.stringify({ decisions, missingCommands, roleCount: input.roles.length }, null, 2));
console.log('devkit-roles: allowed=2 denied=2 capability-gaps=0');
`,
      },
      stdin: JSON.stringify({
        roles: [
          { id: 'developer', requiredCommands: ['init', 'check', 'run'] },
          { id: 'maintainer', requiredCommands: ['version', 'release', 'verify'] },
          { id: 'platform', requiredCommands: ['install', 'upgrade', 'check', 'run'] },
          { id: 'security', requiredCommands: ['verify', 'sbom', 'sign'] },
        ],
        requests: [
          { label: 'developer-init', role: 'developer', command: 'init' },
          { label: 'maintainer-release', role: 'maintainer', command: 'release' },
          { label: 'security-run-untrusted', role: 'security', command: 'run' },
          { label: 'maintainer-sign', role: 'maintainer', command: 'sign' },
        ],
      }),
      checkpoint:
        '四个请求依次允许、允许、拒绝、拒绝；安全审核员执行 run 时返回 CAPABILITY_REQUIRED，维护者签名缺少 sign；missingCommands 为空。最后一行必须是 devkit-roles: allowed=2 denied=2 capability-gaps=0，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-role-journey-independent',
      title: '独立实践：每个角色都要有一条可验收链路',
      brief:
        '读取安装、初始化、执行、验证和回滚五个阶段的任务证据。检查每个角色是否覆盖其关键阶段、证据是否来自真实命令或文件，并拒绝只有描述没有证据的交付。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const stageOrder = ['install', 'init', 'run', 'verify', 'recover'];

function evaluateRole(role) {
  const byStage = new Map(role.evidence.map((item) => [item.stage, item]));
  const missing = role.requiredStages.filter((stage) => !byStage.has(stage));
  const weak = role.requiredStages
    .map((stage) => byStage.get(stage))
    .filter(Boolean)
    .filter((item) => !item.command || !item.observable)
    .map((item) => item.stage);
  const ordered = [...byStage.values()]
    .sort((left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage))
    .map((item) => item.stage);
  return {
    role: role.name,
    missing,
    weak,
    ordered,
    ready: missing.length === 0 && weak.length === 0,
  };
}

const reports = input.roles.map(evaluateRole).sort((left, right) =>
  Number(left.ready) - Number(right.ready) || left.role.localeCompare(right.role));
const readyRoles = reports.filter((item) => item.ready).map((item) => item.role);
const blockedRoles = reports.filter((item) => !item.ready).map((item) => item.role);

assert.deepEqual(readyRoles, ['platform-engineer', 'security-reviewer']);
assert.deepEqual(blockedRoles, ['application-developer', 'release-maintainer']);
assert.deepEqual(reports.find((item) => item.role === 'application-developer').missing, ['run']);
assert.deepEqual(reports.find((item) => item.role === 'release-maintainer').weak, ['recover']);
console.log(JSON.stringify({ reports, readyRoles, blockedRoles }, null, 2));
console.log('devkit-journeys: ready=2 blocked=2 missing=1 weak=1');
`,
      },
      stdin: JSON.stringify({
        roles: [
          {
            name: 'application-developer',
            requiredStages: ['install', 'init', 'run'],
            evidence: [
              { stage: 'install', command: 'npm install -g ./devkit.tgz', observable: 'version=1.4.0' },
              { stage: 'init', command: 'devkit init --yes', observable: 'devkit.yaml created' },
            ],
          },
          {
            name: 'release-maintainer',
            requiredStages: ['verify', 'recover'],
            evidence: [
              { stage: 'verify', command: 'devkit verify artifact', observable: 'digest matches' },
              { stage: 'recover', command: '', observable: 'rollback plan in README' },
            ],
          },
          {
            name: 'platform-engineer',
            requiredStages: ['install', 'run'],
            evidence: [
              { stage: 'install', command: 'installer --platform linux', observable: 'exit=0' },
              { stage: 'run', command: 'devkit check --json', observable: 'status=ok' },
            ],
          },
          {
            name: 'security-reviewer',
            requiredStages: ['verify', 'recover'],
            evidence: [
              { stage: 'verify', command: 'devkit verify --bundle release.sigstore', observable: 'Verified OK' },
              { stage: 'recover', command: 'devkit install 1.3.9', observable: 'previous config readable' },
            ],
          },
        ],
      }),
      checkpoint:
        '应用开发者缺 run 阶段，发布维护者的恢复证据没有可执行命令和可观察结果；平台工程师和安全审核员就绪。ready=2、blocked=2，最后一行包含 devkit-journeys: ready=2 blocked=2 missing=1 weak=1，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 范围、验收与非功能目标': {
    title: 'DevKit 项目台 02 · 首版范围要能被自动拒绝',
    description:
      '把三个命令、稳定退出码、双平台安装、可验证制品和兼容窗口冻结成验收项，再评估新需求是否扩大权限面、破坏旧配置或超过启动性能预算。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-scope-gate-guided',
      title: '跟做：范围重叠和非目标冲突直接阻断',
      brief:
        '读取必做范围、推迟项、非目标和验收证据。检测同一能力同时出现在必做与非目标、必做项缺少证据、三项核心命令不全，并计算发布门禁。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requiredCommands = ['init', 'check', 'run'];
const must = new Set(input.scope.must);
const later = new Set(input.scope.later);
const nonGoals = new Set(input.scope.nonGoals);
const overlap = [...must].filter((item) => nonGoals.has(item));
const contradictory = [...later].filter((item) => nonGoals.has(item));
const missingCommands = requiredCommands.filter((command) => !must.has('command:' + command));
const missingEvidence = input.acceptance
  .filter((item) => must.has(item.capability) && (!item.evidence || !item.pass))
  .map((item) => item.capability);
const blockers = [
  overlap.length ? 'SCOPE_OVERLAP' : null,
  contradictory.length ? 'DEFERRED_NON_GOAL' : null,
  missingCommands.length ? 'COMMAND_GAP' : null,
  missingEvidence.length ? 'EVIDENCE_GAP' : null,
].filter(Boolean);

assert.deepEqual(overlap, ['plugin:remote-registry']);
assert.deepEqual(contradictory, ['ide:extension']);
assert.deepEqual(missingCommands, ['run']);
assert.deepEqual(missingEvidence, ['artifact:verify']);
assert.equal(blockers.length, 4);
assert.equal(blockers.includes('COMMAND_GAP'), true);
console.log(JSON.stringify({
  releaseGate: 'BLOCKED',
  blockers,
  overlap,
  contradictory,
  missingCommands,
  missingEvidence,
}, null, 2));
console.log('devkit-scope: gate=BLOCKED blockers=4 missing-command=run');
`,
      },
      stdin: JSON.stringify({
        scope: {
          must: ['command:init', 'command:check', 'artifact:verify', 'plugin:remote-registry'],
          later: ['ide:extension'],
          nonGoals: ['plugin:remote-registry', 'ide:extension'],
        },
        acceptance: [
          { capability: 'command:init', evidence: 'cli/init.txt', pass: true },
          { capability: 'command:check', evidence: 'cli/check.json', pass: true },
          { capability: 'artifact:verify', evidence: '', pass: false },
          { capability: 'plugin:remote-registry', evidence: 'plugin/registry.txt', pass: true },
        ],
      }),
      checkpoint:
        '必须同时发现范围重叠、推迟项与非目标冲突、缺少 run 命令、签名制品验证无证据四个阻断项。releaseGate=BLOCKED，最后一行包含 blockers=4 missing-command=run，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-scope-budget-independent',
      title: '独立实践：新需求先过兼容与性能预算',
      brief:
        '读取三个候选需求的影响评估。权限扩大、大版本破坏、双平台证据缺失或冷启动超预算的候选不能进入首版；输出可解释的阻断原因和可接受范围。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const budgets = { coldStartMs: 250, artifactVerifyMs: 1200 };

function assess(candidate) {
  const blockers = [];
  if (candidate.impact.permissionExpansion) blockers.push('PERMISSION_EXPANSION');
  if (candidate.impact.breakingChange) blockers.push('BREAKING_CHANGE');
  if (!candidate.impact.platforms.includes(input.targets[0]) ||
      !candidate.impact.platforms.includes(input.targets[1])) {
    blockers.push('PLATFORM_GAP');
  }
  if (candidate.impact.coldStartMs > budgets.coldStartMs) blockers.push('STARTUP_BUDGET');
  if (candidate.impact.artifactVerifyMs > budgets.artifactVerifyMs) {
    blockers.push('VERIFY_BUDGET');
  }
  return {
    id: candidate.id,
    accepted: blockers.length === 0,
    blockers,
    decision: blockers.length === 0 ? 'FREEZE' : 'DEFER',
  };
}

const decisions = input.candidates.map(assess);
const frozen = decisions.filter((item) => item.accepted).map((item) => item.id);
assert.deepEqual(frozen, ['json-exit-code-docs']);
assert.deepEqual(decisions[1].blockers, [
  'PERMISSION_EXPANSION',
  'BREAKING_CHANGE',
  'STARTUP_BUDGET',
]);
assert.deepEqual(decisions[2].blockers, ['PLATFORM_GAP', 'VERIFY_BUDGET']);
console.log(JSON.stringify({ targets: input.targets, budgets, decisions, frozen }, null, 2));
console.log('devkit-scope-budget: accepted=1 deferred=2 targets=2');
`,
      },
      stdin: JSON.stringify({
        targets: ['windows-amd64', 'linux-amd64'],
        candidates: [
          {
            id: 'json-exit-code-docs',
            impact: {
              permissionExpansion: false,
              breakingChange: false,
              platforms: ['windows-amd64', 'linux-amd64'],
              coldStartMs: 210,
              artifactVerifyMs: 940,
            },
          },
          {
            id: 'auto-load-remote-plugins',
            impact: {
              permissionExpansion: true,
              breakingChange: true,
              platforms: ['windows-amd64', 'linux-amd64'],
              coldStartMs: 380,
              artifactVerifyMs: 1100,
            },
          },
          {
            id: 'macos-only-signature-service',
            impact: {
              permissionExpansion: false,
              breakingChange: false,
              platforms: ['darwin-arm64'],
              coldStartMs: 190,
              artifactVerifyMs: 1600,
            },
          },
        ],
      }),
      checkpoint:
        '只有 json-exit-code-docs 可冻结；远程插件自动加载同时扩大权限、破坏兼容并超过 250ms 启动预算；macOS 专用签名服务缺少目标平台且验证超 1200ms。最后一行包含 accepted=1 deferred=2 targets=2，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · API 契约与前端数据边界': {
    title: 'DevKit 项目台 03 · CLI 参数、JSON 与退出码是一份契约',
    description:
      '用同一份命令定义解析 init、check、run 与未知参数，把参数错误和内部错误映射成稳定退出码；再验证 JSON stdout 不含日志，诊断只进入 stderr。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-cli-exit-contract-guided',
      title: '跟做：解析结果和退出码同步稳定',
      brief:
        '读取四组 argv，解析命令、--json、--yes 和位置参数。未知命令返回用法错误，缺失项目返回配置错误，模拟依赖缺失返回外部错误，并断言退出码依次为 0、2、3、5。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const commands = new Set(['init', 'check', 'run', 'version']);

function parseInvocation(testCase) {
  const [command, ...args] = testCase.argv;
  if (!commands.has(command)) {
    return { command, code: 'UNKNOWN_COMMAND', exitCode: 2 };
  }
  const unknownFlag = args.find((arg) => !['--json', '--yes', 'build'].includes(arg));
  if (unknownFlag) return { command, code: 'UNKNOWN_OPTION', exitCode: 2 };
  if (command === 'check' && !testCase.project && !args.includes('--no-project')) {
    return { command, code: 'PROJECT_NOT_FOUND', exitCode: 3 };
  }
  if (command === 'run' && testCase.toolchain === 'missing') {
    return { command, code: 'TOOLCHAIN_MISSING', exitCode: 5 };
  }
  return {
    command,
    code: testCase.argv.includes('--json') ? 'OK_JSON' : 'OK_TEXT',
    exitCode: 0,
  };
}

const results = input.invocations.map((testCase) => ({
  label: testCase.label,
  ...parseInvocation(testCase),
}));
assert.deepEqual(results.map((item) => item.exitCode), [0, 2, 3, 5]);
assert.deepEqual(results.map((item) => item.code), [
  'OK_JSON',
  'UNKNOWN_COMMAND',
  'PROJECT_NOT_FOUND',
  'TOOLCHAIN_MISSING',
]);
assert.equal(results.filter((item) => item.exitCode !== 0).length, 3);
console.log(JSON.stringify({ results }, null, 2));
console.log('devkit-cli: exits=0,2,3,5 contract=stable');
`,
      },
      stdin: JSON.stringify({
        invocations: [
          { label: 'version-json', argv: ['version', '--json'], project: true, toolchain: 'ready' },
          { label: 'unknown-command', argv: ['deploy', '--yes'], project: true, toolchain: 'ready' },
          { label: 'missing-project', argv: ['check', '--json'], project: false, toolchain: 'ready' },
          { label: 'missing-toolchain', argv: ['run', 'build', '--json'], project: true, toolchain: 'missing' },
        ],
      }),
      checkpoint:
        '四组结果依次为 0/OK_JSON、2/UNKNOWN_COMMAND、3/PROJECT_NOT_FOUND、5/TOOLCHAIN_MISSING。最后一行必须是 devkit-cli: exits=0,2,3,5 contract=stable，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-json-stream-independent',
      title: '独立实践：stdout 留给数据，stderr 留给诊断',
      brief:
        '检查成功与失败命令的 stdout、stderr、退出码和 JSON 结构。JSON 模式不得混入帮助、进度或彩色码；失败 JSON 必须包含稳定 code，日志只能写 stderr。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function inspectRun(run) {
  const problems = [];
  if (run.jsonMode && /[^\n]*\[(?:info|warn|error)\]|Installing|Progress:/.test(run.stdout)) {
    problems.push('DIAGNOSTICS_IN_STDOUT');
  }
  if (/\x1b\[[0-9;]*m/.test(run.stdout)) problems.push('ANSI_IN_JSON');
  if (run.exitCode !== 0 && !run.stderr.trim()) problems.push('MISSING_STDERR');
  if (run.jsonMode) {
    try {
      const parsed = JSON.parse(run.stdout);
      if (run.exitCode !== 0 && !parsed.code) problems.push('MISSING_ERROR_CODE');
      if (run.exitCode === 0 && parsed.status !== 'ok') problems.push('WRONG_SUCCESS_STATUS');
    } catch {
      problems.push('INVALID_JSON');
    }
  }
  return {
    label: run.label,
    problems,
    parseable: run.jsonMode && problems.every((item) =>
      !['INVALID_JSON', 'DIAGNOSTICS_IN_STDOUT', 'ANSI_IN_JSON'].includes(item)),
  };
}

const reports = input.runs.map(inspectRun);
const clean = reports.filter((item) => item.problems.length === 0).map((item) => item.label);
const broken = reports.filter((item) => item.problems.length > 0).map((item) => item.label);
assert.deepEqual(clean, ['success-json', 'failure-json']);
assert.deepEqual(broken, ['progress-pollution', 'missing-error-code', 'ansi-json']);
assert.deepEqual(reports[0].problems, []);
assert.equal(reports[1].parseable, true);
console.log(JSON.stringify({ reports, clean, broken }, null, 2));
console.log('devkit-streams: clean=2 broken=3 stdout=data stderr=diagnostics');
`,
      },
      stdin: JSON.stringify({
        runs: [
          {
            label: 'success-json',
            jsonMode: true,
            exitCode: 0,
            stdout: '{"status":"ok","version":"1.4.0"}\n',
            stderr: '[info] loaded devkit.yaml\n',
          },
          {
            label: 'failure-json',
            jsonMode: true,
            exitCode: 3,
            stdout: '{"code":"CONFIG_INVALID","message":"unknown runtime"}\n',
            stderr: '[error] config validation failed\n',
          },
          {
            label: 'progress-pollution',
            jsonMode: true,
            exitCode: 0,
            stdout: 'Installing plugins\n{"status":"ok"}\n',
            stderr: '',
          },
          {
            label: 'missing-error-code',
            jsonMode: true,
            exitCode: 4,
            stdout: '{"message":"node missing"}\n',
            stderr: '[error] check failed\n',
          },
          {
            label: 'ansi-json',
            jsonMode: true,
            exitCode: 0,
            stdout: '\u001b[32m{"status":"ok"}\u001b[0m\n',
            stderr: '',
          },
        ],
      }),
      checkpoint:
        'success-json 与 failure-json 无问题；其余三条分别命中诊断污染 stdout、错误 JSON 缺 code、ANSI 码污染 JSON。最后一行包含 clean=2 broken=3，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 数据模型、约束与迁移': {
    title: 'DevKit 项目台 04 · 配置迁移必须可重入',
    description:
      '把旧配置从 schema v1 升到 v2，保留未知扩展字段并将明文令牌改为凭据引用；随后模拟崩溃写入，验证原子替换不会破坏原配置。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-config-migration-guided',
      title: '跟做：v1 到 v2 只迁移一次',
      brief:
        '读取旧配置，把 runtime 拆成 kind/version、把 token 改成 credentialRef，保留未知字段并记录迁移历史。连续执行两次，结果必须完全相同且不重复追加历史。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function migrate(config) {
  if (config.schemaVersion === 2) return structuredClone(config);
  if (config.schemaVersion !== 1) throw new Error('unsupported schema');
  const {
    schemaVersion,
    runtime,
    token,
    migrationHistory = [],
    ...extensions
  } = config;
  const [kind, version] = String(runtime).split('@');
  return {
    schemaVersion: 2,
    runtime: { kind, version },
    credentialRef: 'keychain:devkit/default',
    migrationHistory: [...migrationHistory, { from: 1, to: 2 }],
    ...extensions,
  };
}

const first = migrate(input.config);
const second = migrate(first);
assert.equal(first.schemaVersion, 2);
assert.deepEqual(first.runtime, { kind: 'node', version: '24.18.1' });
assert.equal(first.credentialRef, 'keychain:devkit/default');
assert.equal('token' in first, false);
assert.equal(first.teamPolicy, 'audit-required');
assert.deepEqual(first.migrationHistory, [{ from: 1, to: 2 }]);
assert.deepEqual(second, first);
console.log(JSON.stringify({ first, idempotent: true }, null, 2));
console.log('devkit-migration: schema=2 history=1 idempotent=true extensions=1');
`,
      },
      stdin: JSON.stringify({
        config: {
          schemaVersion: 1,
          runtime: 'node@24.18.1',
          token: 'plaintext-dev-token',
          teamPolicy: 'audit-required',
          installSource: 'internal-cache',
        },
      }),
      checkpoint:
        '迁移后 schemaVersion=2、runtime 为 node/24.18.1、token 被 credentialRef 替代，teamPolicy 与 installSource 保留，历史只有一条；第二次迁移与原结果完全相等。最后一行包含 schema=2 history=1 idempotent=true extensions=1，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-atomic-config-independent',
      title: '独立实践：迁移失败保留旧文件',
      brief:
        '在内存文件系统上执行临时写入、flush、原子替换和备份。模拟一次写入中断，要求旧配置仍可读取、临时文件被清理；下一次重试成功且不会叠加历史。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const fileSystem = new Map([
  ['devkit.yaml', JSON.stringify(input.original)],
]);
const trace = [];

function atomicWrite(path, value, failAfterTemp) {
  const tempPath = path + '.tmp-' + input.pid;
  const backupPath = path + '.bak';
  fileSystem.set(tempPath, value);
  trace.push({ op: 'temp-written', path: tempPath });
  if (failAfterTemp) {
    fileSystem.delete(tempPath);
    trace.push({ op: 'temp-cleaned', preserved: fileSystem.get(path) });
    return { ok: false, code: 'WRITE_INTERRUPTED' };
  }
  fileSystem.set(backupPath, fileSystem.get(path));
  fileSystem.set(path, fileSystem.get(tempPath));
  fileSystem.delete(tempPath);
  trace.push({ op: 'atomic-replace', path, backupPath });
  return { ok: true, code: 'REPLACED' };
}

const failed = atomicWrite('devkit.yaml', JSON.stringify(input.migrated), true);
assert.equal(failed.code, 'WRITE_INTERRUPTED');
assert.deepEqual(JSON.parse(fileSystem.get('devkit.yaml')), input.original);
assert.equal(fileSystem.has('devkit.yaml.tmp-' + input.pid), false);
assert.deepEqual(trace[1], {
  op: 'temp-cleaned',
  preserved: JSON.stringify(input.original),
});

const retried = atomicWrite('devkit.yaml', JSON.stringify(input.migrated), false);
assert.equal(retried.code, 'REPLACED');
assert.deepEqual(JSON.parse(fileSystem.get('devkit.yaml')), input.migrated);
assert.deepEqual(JSON.parse(fileSystem.get('devkit.yaml.bak')), input.original);
console.log(JSON.stringify({ failed, retried, trace, files: [...fileSystem.keys()] }, null, 2));
console.log('devkit-atomic-write: interrupted-maintained=true retry=success history=1');
`,
      },
      stdin: JSON.stringify({
        pid: 4421,
        original: {
          schemaVersion: 1,
          runtime: 'node@24.18.1',
          migrationHistory: [],
        },
        migrated: {
          schemaVersion: 2,
          runtime: { kind: 'node', version: '24.18.1' },
          migrationHistory: [{ from: 1, to: 2 }],
        },
      }),
      checkpoint:
        '第一次写入返回 WRITE_INTERRUPTED，devkit.yaml 仍等于原配置且临时文件已删除；重试返回 REPLACED，备份保留 v1，正式文件为 v2。最后一行包含 interrupted-maintained=true retry=success history=1，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 项目骨架、模块边界与本地环境': {
    title: 'DevKit 项目台 05 · 包骨架和插件清单先约束边界',
    description:
      '检查 CLI、SDK、插件协议各自只导出公开接口和单一版本源，再验证插件 manifest 的能力、权限与命令声明一致，拒绝未声明能力或越界路径。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-workspace-contract-guided',
      title: '跟做：版本和导出不能各自漂移',
      brief:
        '读取 workspace 项目清单、根版本和允许导出。检查所有包的版本、CLI bin、SDK 导出和协议包依赖，输出不一致项并断言阻塞发布。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowed = {
  cli: ['./sdk', './plugin-protocol'],
  sdk: ['./build-result'],
  'plugin-protocol': ['./manifest'],
};

const issues = [];
for (const pkg of input.packages) {
  if (pkg.version !== input.releaseVersion) {
    issues.push({ id: pkg.name, kind: 'VERSION_DRIFT', actual: pkg.version });
  }
  const unexpected = pkg.exports.filter((entry) => !allowed[pkg.layer]?.includes(entry));
  if (unexpected.length) {
    issues.push({ id: pkg.name, kind: 'LEAKY_EXPORT', unexpected });
  }
  if ((pkg.layer === 'cli' && pkg.bin !== 'devkit') ||
      (pkg.layer !== 'cli' && pkg.bin !== null)) {
    issues.push({ id: pkg.name, kind: 'BIN_CONTRACT' });
  }
}

const blocked = issues.length > 0;
assert.equal(blocked, true);
assert.deepEqual(issues.map((item) => item.kind).sort(), [
  'BIN_CONTRACT',
  'LEAKY_EXPORT',
  'VERSION_DRIFT',
]);
assert.equal(issues.find((item) => item.kind === 'VERSION_DRIFT').id, '@acme/devkit-plugin-protocol');
assert.deepEqual(
  issues.find((item) => item.kind === 'LEAKY_EXPORT').unexpected,
  ['./internal-cache'],
);
assert.equal(issues.find((item) => item.kind === 'BIN_CONTRACT').id, '@acme/devkit-plugin-protocol');
console.log(JSON.stringify({ releaseVersion: input.releaseVersion, issues, blocked }, null, 2));
console.log('devkit-workspace: blocked=true version-drift=1 leaky-export=1 bin=1');
`,
      },
      stdin: JSON.stringify({
        releaseVersion: '1.4.0',
        packages: [
          {
            name: '@acme/devkit-cli',
            layer: 'cli',
            version: '1.4.0',
            bin: 'devkit',
            exports: ['./sdk', './plugin-protocol'],
          },
          {
            name: '@acme/devkit-sdk',
            layer: 'sdk',
            version: '1.4.0',
            bin: null,
            exports: ['./build-result', './internal-cache'],
          },
          {
            name: '@acme/devkit-plugin-protocol',
            layer: 'plugin-protocol',
            version: '1.3.9',
            bin: 'protocol-tool',
            exports: ['./manifest'],
          },
        ],
      }),
      checkpoint:
        '必须发现协议包版本 1.3.9 与发布版本 1.4.0 漂移、SDK 泄露 internal-cache、CLI bin 映射错误。blocked=true，最后一行包含 version-drift=1 leaky-export=1 bin=1，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-plugin-manifest-independent',
      title: '独立实践：插件能力、命令和路径同时受限',
      brief:
        '校验插件 manifest：命令必须在 commands 中声明，所需能力必须在 capabilities 中出现，文件权限不能越过插件根目录，高风险能力必须明确标注。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const highRisk = new Set(['network:outbound', 'process:spawn', 'secrets:read']);

function normalizeRelative(value) {
  return path.posix.normalize(value.replaceAll('\\', '/'));
}

function validate(manifest, request) {
  const errors = [];
  if (!manifest.commands.includes(request.command)) errors.push('COMMAND_UNDECLARED');
  if (!manifest.capabilities.includes(request.capability)) errors.push('CAPABILITY_UNDECLARED');
  if (request.kind === 'file-read') {
    const normalized = normalizeRelative(request.path);
    if (normalized === '..' || normalized.startsWith('../')) errors.push('PATH_ESCAPE');
    if (!manifest.permissions.read.some((root) =>
      normalized === root || normalized.startsWith(root + '/'))) {
      errors.push('READ_SCOPE_MISSING');
    }
  }
  if (manifest.capabilities.includes(request.capability) &&
      highRisk.has(request.capability) &&
      !manifest.userConsent.includes(request.capability)) {
    errors.push('CONSENT_REQUIRED');
  }
  return { allowed: errors.length === 0, errors };
}

const results = input.requests.map((request) => ({
  label: request.label,
  ...validate(input.manifest, request),
}));
assert.deepEqual(results.map((item) => item.allowed), [true, false, false, false, false]);
assert.deepEqual(results[1].errors, ['COMMAND_UNDECLARED']);
assert.deepEqual(results[2].errors, ['CAPABILITY_UNDECLARED']);
assert.deepEqual(results[3].errors, ['PATH_ESCAPE', 'READ_SCOPE_MISSING']);
assert.deepEqual(results[4].errors, ['CONSENT_REQUIRED']);
console.log(JSON.stringify({ manifest: input.manifest.name, results }, null, 2));
console.log('devkit-plugin: allowed=1 denied=4 path-escape-blocked=true');
`,
      },
      stdin: JSON.stringify({
        manifest: {
          name: '@acme/devkit-lint',
          commands: ['lint', 'format'],
          capabilities: ['fs:read-workspace', 'fs:write-workspace', 'process:spawn'],
          userConsent: [],
          permissions: { read: ['src', 'config'], write: ['src'] },
        },
        requests: [
          { label: 'lint-source', command: 'lint', capability: 'fs:read-workspace', kind: 'file-read', path: 'src/main.ts' },
          { label: 'unknown-command', command: 'publish', capability: 'fs:read-workspace', kind: 'file-read', path: 'src/main.ts' },
          { label: 'undeclared-network', command: 'lint', capability: 'network:outbound', kind: 'network', host: 'example.test' },
          { label: 'path-traversal', command: 'format', capability: 'fs:read-workspace', kind: 'file-read', path: '../../.ssh/id_rsa' },
          { label: 'spawn-without-consent', command: 'lint', capability: 'process:spawn', kind: 'process', executable: 'sh' },
        ],
      }),
      checkpoint:
        '只有 lint-source 允许。其余依次命中命令未声明、能力未声明、路径穿越且不在读取范围、高风险 process:spawn 未获用户确认。最后一行包含 allowed=1 denied=4 path-escape-blocked=true，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 后端核心链路与异常恢复': {
    title: 'DevKit 项目台 06 · 失败分类决定退出码和恢复动作',
    description:
      '把参数、配置、环境检查和内部错误映射为稳定退出码，执行部分失败的插件安装时保留成功项；再模拟中断信号，验证临时文件和子进程都被清理。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-error-recovery-guided',
      title: '跟做：批量失败不能丢失已完成结果',
      brief:
        '读取插件安装队列和故障注入。已完成项重试时跳过，网络失败记录为可重试，签名失败记录为阻断；最终状态写入内存清单并返回汇总退出码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const installed = new Map(input.installed.map((plugin) => [plugin.name, plugin]));
const outcomes = [];

function install(plugin, attempt) {
  const current = installed.get(plugin.name);
  if (current?.version === plugin.version) {
    return { status: 'skipped', reason: 'ALREADY_INSTALLED' };
  }
  const fault = input.faults.find((item) =>
    item.name === plugin.name && item.attempt === attempt);
  if (fault?.kind === 'network') {
    return { status: 'failed', code: 'NETWORK_RETRYABLE', attempt };
  }
  if (fault?.kind === 'signature') {
    return { status: 'failed', code: 'SIGNATURE_INVALID', retryable: false };
  }
  installed.set(plugin.name, { name: plugin.name, version: plugin.version });
  return { status: 'installed', code: 'OK' };
}

for (const plugin of input.plugins) {
  const attempt = 1;
  outcomes.push({ name: plugin.name, attempt, ...install(plugin, attempt) });
}
const retryable = outcomes.filter((item) => item.code === 'NETWORK_RETRYABLE');
for (const item of retryable) {
  const plugin = input.plugins.find((candidate) => candidate.name === item.name);
  outcomes.push({ name: plugin.name, attempt: 2, ...install(plugin, 2) });
}
const auditBlocked = outcomes.filter((item) => item.code === 'SIGNATURE_INVALID');
const exitCode = auditBlocked.length > 0 ? 6 : outcomes.some((item) => item.status === 'failed') ? 5 : 0;

assert.deepEqual(outcomes.map((item) => item.status), [
  'skipped',
  'failed',
  'installed',
  'failed',
  'installed',
]);
assert.equal(installed.size, 3);
assert.equal(retryable.length, 1);
assert.equal(auditBlocked.length, 1);
assert.equal(exitCode, 6);
console.log(JSON.stringify({ outcomes, installed: [...installed.values()], exitCode }, null, 2));
console.log('devkit-install-batch: installed=2 skipped=1 network-retry=1 blocked=1 exit=6');
`,
      },
      stdin: JSON.stringify({
        installed: [{ name: '@acme/eslint', version: '2.4.0' }],
        plugins: [
          { name: '@acme/eslint', version: '2.4.0' },
          { name: '@acme/formatter', version: '1.8.0' },
          { name: '@acme/test-kit', version: '0.9.1' },
          { name: '@acme/provenance', version: '3.0.0' },
        ],
        faults: [
          { name: '@acme/formatter', attempt: 1, kind: 'network' },
          { name: '@acme/provenance', attempt: 1, kind: 'signature' },
        ],
      }),
      checkpoint:
        '重试后结果依次为 skipped、failed→installed、installed、failed→installed；已安装集合共 3 项，签名失败不可重试并触发退出码 6。最后一行包含 installed=2 skipped=1 network-retry=1 blocked=1 exit=6，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-cancellation-cleanup-independent',
      title: '独立实践：取消命令必须传播并清理边界',
      brief:
        '读取长任务步骤和中断注入。收到 SIGINT 后停止后续步骤，向子进程传播取消，删除临时文件并返回 130；已经完成的只读检查保留在报告中。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const events = [];
const completed = [];
const files = new Set(['devkit.yaml.tmp', 'plugin.lock']);
let childState = 'running';

function signalChildren() {
  childState = 'cancelled';
  events.push({ type: 'CHILD_CANCEL_SENT' });
}

function cleanup() {
  for (const path of [...files]) {
    if (path.endsWith('.tmp') || path.endsWith('.lock')) {
      files.delete(path);
      events.push({ type: 'REMOVED', path });
    }
  }
}

for (const step of input.steps) {
  if (step.id === input.interruptAt) {
    signalChildren();
    cleanup();
    events.push({ type: 'CANCELLED', exitCode: 130 });
    break;
  }
  completed.push(step.id);
  events.push({ type: 'STEP_OK', id: step.id });
}

assert.deepEqual(completed, ['parse-args', 'load-config']);
assert.equal(childState, 'cancelled');
assert.equal(files.size, 0);
assert.equal(events.at(-1).exitCode, 130);
assert.deepEqual(events.filter((item) => item.type === 'REMOVED').map((item) => item.path), [
  'devkit.yaml.tmp',
  'plugin.lock',
]);
console.log(JSON.stringify({ events, completed, childState, remainingFiles: [...files] }, null, 2));
console.log('devkit-cancel: completed=2 child=cancelled temp=0 lock=0 exit=130');
`,
      },
      stdin: JSON.stringify({
        steps: [
          { id: 'parse-args' },
          { id: 'load-config' },
          { id: 'install-plugins' },
          { id: 'publish-artifact' },
        ],
        interruptAt: 'install-plugins',
      }),
      checkpoint:
        '只完成 parse-args 和 load-config；到 install-plugins 时子进程变为 cancelled，临时配置和插件锁均被删除，最终 CANCELLED 事件退出码 130。最后一行包含 child=cancelled temp=0 lock=0 exit=130，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 前端页面、状态与可访问交互': {
    title: 'DevKit 项目台 07 · 终端交互也要有可访问状态',
    description:
      '把确认、错误、进度和取消反馈做成不仅靠颜色的稳定文本；再验证非 TTY、NO_COLOR 与窄终端下不会输出不可读控制序列或隐式等待确认。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-accessible-prompt-guided',
      title: '跟做：危险操作确认必须说明后果',
      brief:
        '处理四类提示：在终端中确认清理、非交互未加 --yes、用户取消、--yes 且上下文明确。每次输出状态符号、目标、影响、回滚信息，并映射到稳定结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function promptResult(command) {
  const target = command.targets.join(', ');
  const message = '[WARN] Delete ' + target + '; cache cannot be restored.';
  if (command.yes && command.contextExplicit) {
    return { code: 'CONFIRMED', message, promptShown: false, exitCode: 0 };
  }
  if (!command.isTTY) {
    return { code: 'CONFIRMATION_REQUIRED', message, promptShown: false, exitCode: 2 };
  }
  if (command.answer === 'cancel') {
    return { code: 'CANCELLED', message, promptShown: true, exitCode: 130 };
  }
  return {
    code: command.answer === 'yes' ? 'CONFIRMED' : 'DECLINED',
    message,
    promptShown: true,
    exitCode: command.answer === 'yes' ? 0 : 1,
  };
}

const results = input.commands.map((command) => ({
  label: command.label,
  ...promptResult(command),
}));
assert.deepEqual(results.map((item) => item.code), [
  'CONFIRMED',
  'CONFIRMATION_REQUIRED',
  'CANCELLED',
  'CONFIRMED',
]);
assert.deepEqual(results.map((item) => item.exitCode), [0, 2, 130, 0]);
assert.equal(results[1].promptShown, false);
assert.ok(results.every((item) => item.message.includes('cache cannot be restored')));
console.log(JSON.stringify({ results }, null, 2));
console.log('devkit-prompt: confirmed=2 requires-confirmation=1 cancelled=1 accessible=true');
`,
      },
      stdin: JSON.stringify({
        commands: [
          { label: 'interactive-yes', isTTY: true, answer: 'yes', yes: false, contextExplicit: false, targets: ['dist', '.cache'] },
          { label: 'ci-no-yes', isTTY: false, answer: null, yes: false, contextExplicit: false, targets: ['dist'] },
          { label: 'interactive-cancel', isTTY: true, answer: 'cancel', yes: false, contextExplicit: false, targets: ['.cache'] },
          { label: 'automation-explicit-yes', isTTY: false, answer: null, yes: true, contextExplicit: true, targets: ['dist'] },
        ],
      }),
      checkpoint:
        '结果依次为 CONFIRMED/0、CONFIRMATION_REQUIRED/2、CANCELLED/130、CONFIRMED/0；非交互未给 --yes 不等待输入，每条警告都包含目标和不可恢复影响。最后一行包含 confirmed=2 requires-confirmation=1 cancelled=1 accessible=true，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-nontty-output-independent',
      title: '独立实践：重定向输出保持可搜索',
      brief:
        '检查 CI、重定向、TTY 和 NO_COLOR 四种输出模式。动态进度只能用于交互终端；日志在重定向后必须是一行一条且不含 ANSI 或回车覆盖。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function render(progress, mode) {
  const ansi = /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/;
  const carriage = /\r/;
  const interactive = mode.tty && !mode.noColor && !mode.ci;
  const lines = progress.map((item) =>
    (item.ok ? '[PASS] ' : '[FAIL] ') + item.name + ': ' + item.detail);
  const paint = (ok, text) => interactive
    ? (ok ? '\u001b[32m' : '\u001b[31m') + text + '\u001b[0m'
    : text;
  const output = interactive
    ? progress.map((item, index) =>
      '\r' + paint(item.ok, item.ok ? '[PASS]' : '[FAIL]') +
        ' ' + (index + 1) + '/' + progress.length).join('')
      + '\n'
    : lines.join('\n') + '\n';
  return {
    output,
    lines: output.trimEnd().split('\n').length,
    containsAnsi: ansi.test(output),
    overwritesWithCarriageReturn: carriage.test(output),
    nonInteractiveSafe: !mode.tty || mode.ci || mode.noColor
      ? !ansi.test(output) && !carriage.test(output)
      : null,
  };
}

const reports = input.modes.map((mode) => ({ mode: mode.name, ...render(input.progress, mode) }));
assert.equal(reports[0].containsAnsi, true);
assert.equal(reports[1].nonInteractiveSafe, true);
assert.equal(reports[2].nonInteractiveSafe, true);
assert.equal(reports[3].lines, 3);
assert.ok(reports.slice(1).every((item) => !item.containsAnsi && !item.overwritesWithCarriageReturn));
console.log(JSON.stringify({ reports }, null, 2));
console.log('devkit-output: tty-progress=true ci-safe=true redirected-safe=true lines=3');
`,
      },
      stdin: JSON.stringify({
        progress: [
          { name: 'node', ok: true, detail: '24.18.1' },
          { name: 'pnpm', ok: true, detail: '11.20.0' },
          { name: 'signature', ok: false, detail: 'fixture missing' },
        ],
        modes: [
          { name: 'interactive-tty', tty: true, ci: false, noColor: false },
          { name: 'ci', tty: true, ci: true, noColor: false },
          { name: 'redirected', tty: false, ci: false, noColor: false },
          { name: 'no-color', tty: true, ci: false, noColor: true },
        ],
      }),
      checkpoint:
        '交互 TTY 使用单行动态进度；CI、重定向和 NO_COLOR 均无 ANSI/回车覆盖，最终各保留三行可搜索状态。最后一行包含 tty-progress=true ci-safe=true redirected-safe=true lines=3，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 联调、测试、安全与性能': {
    title: 'DevKit 项目台 08 · 黑盒 CLI 与跨平台路径一起验收',
    description:
      '通过真实 Node 子进程检查 stdout、stderr 和退出码，再覆盖 Windows 盘符、UNC、空格、Unicode、长路径与符号链接逃逸，防止路径规范化只在大脑里通过。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-blackbox-cli-guided',
      title: '跟做：真实子进程证明 CLI 契约',
      brief:
        '使用 child_process.spawnSync 启动一个最小 CLI，验证成功 JSON、未知命令、模拟配置错误和日志分流；断言退出码、stdout 和 stderr，而不是直接调用内部函数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cli = [
  "'use strict';",
  "const command = process.argv[1];",
  "if (command === 'version') {",
  "  console.log(JSON.stringify({ status: 'ok', version: '1.4.0' }));",
  "  process.exitCode = 0;",
  "} else if (command === 'check') {",
  "  console.log(JSON.stringify({ code: 'CONFIG_INVALID', message: 'devkit.yaml missing runtime' }));",
  "  console.error('[error] config validation failed');",
  "  process.exitCode = 3;",
  "} else {",
  "  console.error('[error] usage: devkit <version|check>');",
  "  process.exitCode = 2;",
  "}",
].join('\n');

const runs = input.cases.map((testCase) => {
  const result = spawnSync(process.execPath, ['-e', cli, ...testCase.argv], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    label: testCase.label,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
});

assert.deepEqual(runs.map((item) => item.status), [0, 2, 3]);
assert.deepEqual(JSON.parse(runs[0].stdout), { status: 'ok', version: '1.4.0' });
assert.match(runs[1].stderr, /usage: devkit/);
assert.equal(runs[1].stdout, '');
assert.equal(JSON.parse(runs[2].stdout).code, 'CONFIG_INVALID');
assert.match(runs[2].stderr, /config validation failed/);
console.log(JSON.stringify({ runs }, null, 2));
console.log('devkit-blackbox: exit=0,2,3 stdout-json=true stderr-diagnostics=true');
`,
      },
      stdin: JSON.stringify({
        cases: [
          { label: 'version', argv: ['version'] },
          { label: 'usage', argv: ['deploy'] },
          { label: 'config-error', argv: ['check'] },
        ],
      }),
      checkpoint:
        '三次真实子进程退出码依次为 0、2、3；version 的 stdout 是可解析 JSON，未知命令只写 stderr，配置错误 stdout 保持 JSON、诊断写 stderr。最后一行包含 exit=0,2,3 stdout-json=true stderr-diagnostics=true，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-path-matrix-independent',
      title: '独立实践：跨平台路径既规范化又限制根目录',
      brief:
        '规范化 Windows 盘符、UNC、空格和 Unicode 路径，检测父目录逃逸，并生成平台配置目录。输入混合斜杠与长路径，输出安全相对路径或稳定错误码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function normalizeForPolicy(value) {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/');
}

function safeRelative(root, candidate) {
  const normalizedRoot = normalizeForPolicy(root).replace(/\/$/, '');
  const normalizedCandidate = path.posix.normalize(
    normalizeForPolicy(path.posix.join(normalizedRoot, candidate)),
  );
  if (!normalizedCandidate.startsWith(normalizedRoot + '/')) {
    return { ok: false, code: 'PATH_OUTSIDE_ROOT' };
  }
  return {
    ok: true,
    relative: normalizedCandidate.slice(normalizedRoot.length + 1),
  };
}

const results = input.cases.map((testCase) => ({
  label: testCase.label,
  ...safeRelative(testCase.root, testCase.candidate),
}));
assert.deepEqual(results.map((item) => item.ok), [true, true, true, false, false]);
assert.equal(results[0].relative, 'src/main.ts');
assert.equal(results[1].relative, '用户 数据/构建 输出.js');
assert.equal(results[2].relative, 'packages/devkit-cli/index.ts');
assert.equal(results[3].code, 'PATH_OUTSIDE_ROOT');
assert.equal(results[4].code, 'PATH_OUTSIDE_ROOT');

const dirs = {
  windows: path.win32.join('C:\\Users\\Lin', 'AppData', 'Roaming', 'DevKit'),
  darwin: path.posix.join('/Users/Lin', 'Library', 'Application Support', 'DevKit'),
  linux: path.posix.join('/home/Lin', '.config', 'devkit'),
};
const unsafeRelative = normalizeForPolicy('src\\..\\..\\secret.txt');
assert.equal(path.posix.normalize(unsafeRelative), '../secret.txt');
console.log(JSON.stringify({ results, dirs, unsafeRelative }, null, 2));
console.log('devkit-paths: safe=3 escaped=2 unicode=true windows=true posix=true');
`,
      },
      stdin: JSON.stringify({
        cases: [
          { label: 'windows-forward', root: 'C:/Users/Lin/My Tools', candidate: './src/main.ts' },
          { label: 'windows-unicode', root: 'C:\\Users\\李明\\我的 工具', candidate: '用户 数据\\构建 输出.js' },
          { label: 'posix-mixed', root: '/home/lin/devkit', candidate: 'packages\\devkit-cli/index.ts' },
          { label: 'parent-escape', root: 'C:/Users/Lin/My Tools', candidate: '../../AppData/secrets.txt' },
          { label: 'posix-escape', root: '/home/lin/devkit', candidate: 'src/../../.ssh/id_rsa' },
        ],
      }),
      checkpoint:
        '前 3 条路径规范化成功并处理空格、中文和混合斜杠，后 2 条均在根目录之外返回 PATH_OUTSIDE_ROOT；同时给出 Windows、macOS、Linux 标准目录示例。最后一行包含 safe=3 escaped=2 unicode=true windows=true posix=true，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 容器、CI/CD、可观测与发布': {
    title: 'DevKit 项目台 09 · 供应链证据和坏版本撤回',
    description:
      '用摘要、SBOM 和签名清单模拟发布验证，检测制品篡改与身份不匹配；再执行安装升级、失败撤回和回滚，确保 latest 与用户配置都回到已知良好版本。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-provenance-guided',
      title: '跟做：checksum、SBOM 和签名必须绑定同一制品',
      brief:
        '读取发布制品、SBOM、签名 bundle 和信任策略。重算 SHA-256，检查 SBOM 制品摘要、签名主体与工作流身份；篡改归档后验证必须失败并给出可读原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function verify(artifact, evidence, policy) {
  const digest = 'sha256:' + sha256(artifact);
  const errors = [];
  if (evidence.checksum !== digest) errors.push('CHECKSUM_MISMATCH');
  if (evidence.sbom.subjectDigest !== digest) errors.push('SBOM_SUBJECT_MISMATCH');
  if (evidence.signature.subjectDigest !== digest) errors.push('SIGNATURE_SUBJECT_MISMATCH');
  if (evidence.signature.workflow !== policy.workflow) errors.push('WORKFLOW_UNTRUSTED');
  if (evidence.signature.issuer !== policy.issuer) errors.push('OIDC_ISSUER_UNTRUSTED');
  return { digest, verified: errors.length === 0, errors };
}

const original = verify(input.artifact, input.evidence, input.policy);
const tampered = verify(input.artifact + input.tamperSuffix, input.evidence, input.policy);
assert.equal(original.verified, true);
assert.equal(tampered.verified, false);
assert.deepEqual(tampered.errors, [
  'CHECKSUM_MISMATCH',
  'SBOM_SUBJECT_MISMATCH',
  'SIGNATURE_SUBJECT_MISMATCH',
]);
assert.equal(original.digest, input.evidence.checksum);
assert.equal(input.evidence.sbom.packages.includes('@acme/devkit@1.4.0'), true);
console.log(JSON.stringify({
  original,
  tampered,
  boundary: 'Cosign、SBOM 工具和 registry 未联网调用；本任务验证其确定性文件契约。',
}, null, 2));
console.log('devkit-provenance: original=verified tampered=rejected errors=3');
`,
      },
      stdin: JSON.stringify({
        artifact: 'devkit-linux-amd64-1.4.0.tar.gz:binary-fixture',
        tamperSuffix: ':tampered',
        evidence: {
          checksum: 'sha256:c0953b0f5f300dbe5f7336dd283970a8bb10336722786e5ba6cdb24daca9f10f',
          sbom: {
            spdxVersion: 'SPDX-2.3',
            packages: ['@acme/devkit@1.4.0', 'node@24.18.1'],
            subjectDigest: 'sha256:c0953b0f5f300dbe5f7336dd283970a8bb10336722786e5ba6cdb24daca9f10f',
          },
          signature: {
            subjectDigest: 'sha256:c0953b0f5f300dbe5f7336dd283970a8bb10336722786e5ba6cdb24daca9f10f',
            workflow: 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0',
            issuer: 'https://token.actions.githubusercontent.com',
          },
        },
        policy: {
          workflow: 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0',
          issuer: 'https://token.actions.githubusercontent.com',
        },
      }),
      checkpoint:
        '原始制品通过 checksum、SBOM subject 和签名身份验证；追加 tampered 后三项摘要不匹配，验证失败。最后一行包含 original=verified tampered=rejected errors=3，且输出明确说明未真实联网调用 Cosign/registry，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-upgrade-withdraw-independent',
      title: '独立实践：升级、坏版本撤回和回滚同时成立',
      brief:
        '根据本地 registry 清单从 1.3.0 升级 1.4.1，复现半发布坏版本后判断是否应继续升级；撤销 latest 到 1.4.0，验证用户配置保留且回滚不删除已发布证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const registry = new Map(input.versions.map((item) => [item.version, { ...item }]));
const distTags = { latest: input.latest };
const local = { version: input.installed, config: structuredClone(input.config) };
const trace = [];

function compare(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function install(version) {
  const candidate = registry.get(version);
  if (!candidate) return { ok: false, code: 'VERSION_NOT_FOUND' };
  if (candidate.revoked) return { ok: false, code: 'VERSION_REVOKED' };
  local.version = version;
  trace.push({ op: 'UPGRADED', from: local.config.lastVersion, to: version });
  local.config.lastVersion = version;
  return { ok: true, code: 'INSTALLED', version };
}

let upgrade = install(distTags.latest);
if (input.installFailed && input.installFailed === upgrade.version) {
  upgrade = { ok: false, code: 'POST_INSTALL_CHECK_FAILED', version: upgrade.version };
  install(input.knownGood);
}
const revokedCandidate = registry.get(input.badVersion);
revokedCandidate.revoked = true;
revokedCandidate.reason = input.revokeReason;
distTags.latest = input.knownGood;

const rejected = install(input.badVersion);
assert.equal(upgrade.code, 'POST_INSTALL_CHECK_FAILED');
assert.equal(rejected.code, 'VERSION_REVOKED');
assert.equal(distTags.latest, '1.4.0');
assert.equal(local.version, '1.4.0');
assert.deepEqual(local.config, { lastVersion: '1.4.0', teamPolicy: 'audit-required' });
assert.equal(registry.get('1.4.1').revoked, true);
assert.equal(registry.size, 3);
console.log(JSON.stringify({ registry: [...registry.values()], distTags, local, trace }, null, 2));
console.log('devkit-upgrade: failed=1.4.1 latest=1.4.0 local=1.4.0 config-preserved=true evidence-retained=true');
`,
      },
      stdin: JSON.stringify({
        versions: [
          { version: '1.3.0', digest: 'sha256:aaa', signed: true, revoked: false },
          { version: '1.4.0', digest: 'sha256:bbb', signed: true, revoked: false },
          { version: '1.4.1', digest: 'sha256:ccc', signed: true, revoked: false },
        ],
        latest: '1.4.1',
        installed: '1.3.0',
        config: { lastVersion: '1.3.0', teamPolicy: 'audit-required' },
        installFailed: '1.4.1',
        badVersion: '1.4.1',
        knownGood: '1.4.0',
        revokeReason: 'Windows installer exits 4 before configuration migration',
      }),
      checkpoint:
        '升级尝试 1.4.1 后安装检查失败并回到 1.4.0；1.4.1 被标记撤回且再次安装返回 VERSION_REVOKED；latest 已切回 1.4.0，用户配置保留，坏版本证据仍留在 registry。最后一行包含 failed=1.4.1 latest=1.4.0 local=1.4.0 config-preserved=true evidence-retained=true，退出码为 0。',
    },
  },

  'programming:综合训练 · DevKit 开源工具 · 故障演练、回滚与项目答辩': {
    title: 'DevKit 项目台 10 · 演练失败路径并拿证据答辩',
    description:
      '先注入配置损坏、插件越权和签名篡改，验证恢复到已知良好版本；再检查答辩材料是否由可复现命令、日志和制品摘要组成，拒绝只有口述的结论。',
    ...nodeRuntime,
    practice: {
      id: 'p15-devkit-failure-drill-guided',
      title: '跟做：三类故障都必须可恢复',
      brief:
        '读取配置迁移、插件权限和签名验证演练。每个场景执行触发、检测、遏制、恢复四步，生成状态和证据；任何场景没有恢复证据都不能通过答辩。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requiredPhases = ['trigger', 'detect', 'contain', 'recover'];

function drill(scenario) {
  const byPhase = new Map(scenario.actions.map((item) => [item.phase, item]));
  const missing = requiredPhases.filter((phase) => !byPhase.has(phase));
  const evidence = scenario.actions.flatMap((item) => item.evidence || []);
  const recovered = scenario.actions.some((item) =>
    item.phase === 'recover' && item.exitCode === 0 && item.evidence.length > 0);
  return {
    id: scenario.id,
    missing,
    evidence,
    recovered,
    ready: missing.length === 0 && recovered,
  };
}

const drills = input.scenarios.map(drill);
assert.equal(drills.every((item) => item.ready), true);
assert.deepEqual(drills.map((item) => item.id), [
  'corrupt-config',
  'plugin-privilege',
  'tampered-bundle',
]);
assert.deepEqual(drills[0].evidence, [
  'config.bad.json',
  'migration-failure.log',
  'config.backup.json',
  'config.recovered.json',
]);
assert.equal(drills[1].evidence.includes('plugin-audit.json'), true);
assert.equal(drills[2].evidence.includes('cosign-verify-failed.log'), true);
console.log(JSON.stringify({
  drills,
  verdict: 'RECOVERY_EVIDENCE_COMPLETE',
  boundary: '签名与 registry 场景使用本地固定制品契约验证恢复流程。',
}, null, 2));
console.log('devkit-drills: scenarios=3 recovered=3 missing-phases=0 evidence=12');
`,
      },
      stdin: JSON.stringify({
        scenarios: [
          {
            id: 'corrupt-config',
            actions: [
              { phase: 'trigger', command: 'write bad json', exitCode: 3, evidence: ['config.bad.json'] },
              { phase: 'detect', command: 'devkit check --json', exitCode: 3, evidence: ['migration-failure.log'] },
              { phase: 'contain', command: 'restore devkit.yaml.bak', exitCode: 0, evidence: ['config.backup.json'] },
              { phase: 'recover', command: 'devkit check --json', exitCode: 0, evidence: ['config.recovered.json'] },
            ],
          },
          {
            id: 'plugin-privilege',
            actions: [
              { phase: 'trigger', command: 'plugin request network', exitCode: 4, evidence: ['plugin-denied.log'] },
              { phase: 'detect', command: 'inspect capability', exitCode: 0, evidence: ['plugin-audit.json'] },
              { phase: 'contain', command: 'disable plugin', exitCode: 0, evidence: ['plugin-disabled.json'] },
              { phase: 'recover', command: 'devkit run build', exitCode: 0, evidence: ['build-after-disable.log'] },
            ],
          },
          {
            id: 'tampered-bundle',
            actions: [
              { phase: 'trigger', command: 'append tampered bytes', exitCode: 0, evidence: ['artifact-tampered.sha256'] },
              { phase: 'detect', command: 'verify bundle', exitCode: 7, evidence: ['cosign-verify-failed.log'] },
              { phase: 'contain', command: 'restore release artifact', exitCode: 0, evidence: ['artifact-original.sha256'] },
              { phase: 'recover', command: 'install known good', exitCode: 0, evidence: ['install-1.4.0.log'] },
            ],
          },
        ],
      }),
      checkpoint:
        '三个场景均包含 trigger、detect、contain、recover 四阶段，恢复动作退出码 0 且有文件证据；配置恢复、插件审计和签名失败日志均出现。最后一行包含 scenarios=3 recovered=3 missing-phases=0 evidence=12，退出码为 0。',
    },
    apply: {
      id: 'p15-devkit-defense-evidence-independent',
      title: '独立实践：答辩只接受可复现证据',
      brief:
        '读取答辩问题、答案和证据索引。每项证据必须有命令、版本、摘要或日志片段，并覆盖角色任务、CLI 契约、迁移、权限、跨平台、供应链和回滚；口述项必须被拒绝。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const requiredTopics = new Set([
  'roles',
  'cli-contract',
  'migration',
  'plugin-permissions',
  'cross-platform',
  'supply-chain',
  'rollback',
]);

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
}

function review(item) {
  const problems = [];
  if (!item.command) problems.push('NO_REPRODUCIBLE_COMMAND');
  if (!item.artifact || !item.artifactVersion) problems.push('NO_VERSIONED_ARTIFACT');
  if (!item.observed) problems.push('NO_OBSERVED_RESULT');
  if (item.artifactDigest && item.artifactDigest !== digest(item.artifact)) {
    problems.push('ARTIFACT_DIGEST_MISMATCH');
  }
  return { id: item.id, topic: item.topic, problems, accepted: problems.length === 0 };
}

const reviews = input.answers.map(review);
const covered = new Set(reviews.filter((item) => item.accepted).map((item) => item.topic));
const missingTopics = [...requiredTopics].filter((topic) => !covered.has(topic));
const rejected = reviews.filter((item) => !item.accepted).map((item) => item.id);

assert.deepEqual(missingTopics, ['cli-contract']);
assert.deepEqual(rejected, ['cli-verbal', 'digest-mismatch']);
assert.equal(reviews.filter((item) => item.accepted).length, 6);
assert.equal(reviews.find((item) => item.id === 'cli-verbal').problems.includes('NO_REPRODUCIBLE_COMMAND'), true);
console.log(JSON.stringify({
  reviews,
  covered: [...covered],
  missingTopics,
  rejected,
  defenseReady: missingTopics.length === 0 && rejected.length === 0,
}, null, 2));
console.log('devkit-defense: accepted=6 rejected=2 missing-topic=1 ready=false');
`,
      },
      stdin: JSON.stringify({
        answers: [
          {
            id: 'roles-matrix',
            topic: 'roles',
            command: 'node role-matrix.js < evidence/roles.json',
            artifact: 'role-matrix-result.json',
            artifactVersion: '1.4.0',
            observed: 'ready=2 blocked=2',
          },
          {
            id: 'cli-verbal',
            topic: 'cli-contract',
            command: '',
            artifact: '答辩口述',
            artifactVersion: '1.4.0',
            observed: '退出码保持稳定',
          },
          {
            id: 'migration-once',
            topic: 'migration',
            command: 'node migrate.js < fixtures/config-v1.json',
            artifact: 'migration-result.json',
            artifactVersion: '1.4.0',
            observed: 'history=1 idempotent=true',
          },
          {
            id: 'plugin-policy',
            topic: 'plugin-permissions',
            command: 'node plugin-policy.js < fixtures/plugin.json',
            artifact: 'plugin-audit.json',
            artifactVersion: '1.4.0',
            observed: 'denied=4',
          },
          {
            id: 'path-matrix',
            topic: 'cross-platform',
            command: 'node path-matrix.js < fixtures/paths.json',
            artifact: 'path-matrix.json',
            artifactVersion: '1.4.0',
            observed: 'safe=3 escaped=2',
          },
          {
            id: 'provenance',
            topic: 'supply-chain',
            command: 'node provenance.js < fixtures/release.json',
            artifact: 'provenance-result.json',
            artifactVersion: '1.4.0',
            observed: 'original=verified tampered=rejected',
          },
          {
            id: 'digest-mismatch',
            topic: 'rollback',
            command: 'node rollback.js < fixtures/rollback.json',
            artifact: 'rollback-result.json',
            artifactVersion: '1.4.0',
            artifactDigest: 'sha256:deadbeef',
            observed: 'latest=1.4.0',
          },
          {
            id: 'rollback-valid',
            topic: 'rollback',
            command: 'node upgrade-withdraw.js < fixtures/registry.json',
            artifact: 'upgrade-withdraw-result.json',
            artifactVersion: '1.4.0',
            observed: 'latest=1.4.0 local=1.4.0 config-preserved=true',
          },
        ],
      }),
      checkpoint:
        '角色、迁移、权限、跨平台、供应链和有效回滚证据共 6 条可接受；cli-verbal 缺少可复现命令，另一条 rollback 摘要不匹配，因此仅 CLI 契约主题缺失。最后一行包含 accepted=6 rejected=2 missing-topic=1 ready=false，退出码为 0。',
    },
  },
};
