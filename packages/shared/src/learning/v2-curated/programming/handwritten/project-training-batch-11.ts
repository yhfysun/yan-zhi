// P15 综合训练第十一批手写样板：DevKit 开源工具 10 个阶段。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;
const sources = [
  'SLSA Specification. https://slsa.dev/spec/',
  'Sigstore Cosign Documentation. https://docs.sigstore.dev/cosign/overview/',
  'Semantic Versioning. https://semver.org/',
];
const course = (phase: string, minutes: number, goal: string, steps: readonly [string, string, string][]): ProgrammingCourseSeed => ({
  name: `综合训练 · DevKit 开源工具 · ${phase}`,
  track,
  contentStatus: 'reviewed',
  minutes,
  prerequisite: '完成 TypeScript 或 Go 项目，理解 CLI、包管理、语义版本和 CI 发布。',
  goal,
  guidedPractice: `在 Windows、macOS/Linux 至少两种环境中执行“${phase}”：${steps[0][1]} 记录 stdout、stderr、退出码、制品和兼容结果。`,
  independentPractice: '交付阶段产物，并验证正常命令、错误命令、非交互模式、升级和回滚路径。',
  commonErrors: ['把日志当数据输出，破坏 --json 自动化。', '开发机路径和退出码进入用户可见契约。'],
  sourceRefs: sources,
  steps,
});

const DEVKIT_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  course('业务理解与用户任务', 42, '能区分应用开发者、工具维护者、平台工程师和安全审核员的任务，建立安装、初始化、执行、升级和供应链验证链路。', [
    ['按角色拆开发者任务', '用户关心安装和命令结果，维护者关心版本与兼容，平台工程师关心自动化和退出码，安全审核员关心制品来源。每个角色写清成功证据和失败恢复。', '开发者工具先定义任务'],
    ['画清安装到退出的链路', '安装包或二进制进入平台，用户执行 init/check/run，命令读取配置、调用 SDK 或插件并返回输出和退出码，升级与回滚记录版本。', '命令行也是产品契约'],
    ['区分人和机器输出', '人类输出可读提示，自动化输出稳定 JSON 和退出码；日志写 stderr，数据写 stdout，避免脚本解析彩色文本。', 'stdout 是数据通道'],
    ['定义兼容与弃用边界', '命令、配置 schema、插件协议和 SDK 类型都有版本，破坏性变更进入大版本并提供迁移期。', '兼容不是只保留函数名'],
    ['形成首版闭环', '首版做 init/check/run、配置 schema、JSON 输出、插件接口和双平台发布；不做 IDE 和无限权限插件。', '首版先证明可安装可自动化'],
  ]),
  course('范围、验收与非功能目标', 40, '能把首版限定为三个命令、SDK、插件和双平台制品，写出退出码、兼容、安装、签名和升级验收。', [
    ['范围围绕命令闭环', 'init 创建配置，check 验证环境，run 执行核心任务；所有命令支持帮助、版本和机器输出。', '每个命令有唯一职责'],
    ['退出码稳定可测试', '0 成功，已知校验失败、参数错误和内部错误使用不同退出码，CI 能据此分支。', '退出码是自动化接口'],
    ['跨平台路径与安装验收', 'Windows、macOS 和 Linux 的文件路径、权限、可执行位和自动补全分别测试。', '跨平台不是只编译通过'],
    ['制品来源可验证', '发布产物有 checksum、SBOM、签名和源码提交，安装器验证或至少提供验证命令。', '供应链证据属于首版'],
    ['冻结兼容范围', '新增命令和字段优先兼容，删除或改语义进入大版本并提供迁移说明。', '范围变更更新版本策略'],
  ]),
  course('API 契约与前端数据边界', 48, '能设计 CLI 子命令、参数、配置 schema、JSON 输出和插件协议，处理错误、版本、非交互和安全提示。', [
    ['命令树和参数稳定', '命令、flag、默认值和互斥参数用 schema 定义，帮助文本与解析器共享同一来源。', '帮助和解析不能分叉'],
    ['配置 schema 可校验迁移', '配置文件带 version，加载时校验并迁移旧版本，未知字段按兼容策略处理。', '配置版本进入契约'],
    ['JSON 输出与退出码绑定', '成功和错误 JSON 都有 code、message、details 和 requestId，退出码与 code 稳定映射。', '机器输出必须可解析'],
    ['插件协议最小权限', '插件声明命令、能力和配置 schema，主程序只授予必要文件或网络权限。', '插件不是任意代码注入'],
    ['非交互模式可自动化', '--yes、--json、--no-color 和 CI 环境不等待交互，危险操作在无确认时拒绝。', '自动化路径必须无隐式提示'],
  ]),
  course('数据模型、约束与迁移', 48, '能设计本地配置、缓存、凭据引用、插件状态和迁移记录，处理跨平台路径与原子写入。', [
    ['配置与缓存分离', '用户配置进入稳定目录，缓存可删除，凭据只保存引用，不把 token 写入普通配置。', '可删除数据与真相分开'],
    ['本地写入原子化', '写临时文件、同步并原子替换，失败保留旧配置；并发命令使用锁或版本检查。', '崩溃不能破坏配置'],
    ['插件状态绑定版本', '记录插件名称、版本、能力、来源和信任状态，升级或禁用不丢失用户配置。', '插件状态可审计'],
    ['迁移可重入', '配置迁移记录 from/to 版本，失败时可重试并保留备份，不重复追加数据。', '迁移失败可恢复'],
    ['平台目录显式', '使用平台标准目录 API，不硬编码家目录字符串；测试 Windows 空格、Unicode 和长路径。', '路径规则跨平台'],
  ]),
  course('项目骨架、模块边界与本地环境', 50, '能建立 CLI、SDK、插件协议和测试包，固定 TypeScript/Go 工具链、构建、跨平台测试和本地发布。', [
    ['CLI 与 SDK 分层', 'CLI 负责解析、提示和退出码，SDK 负责稳定领域接口，插件协议独立包，避免 CLI 内部类型泄露给用户。', 'SDK 不依赖终端 UI'],
    ['构建和版本统一', '构建脚本从单一版本源生成 CLI、SDK、包元数据和帮助版本，CI 与本地共用。', '版本号不能多处手改'],
    ['本地发布仓库可复现', '使用 npm pack、Go build 和本地 registry 验证安装、升级和卸载，不依赖公网偶然状态。', '本地先验证消费者'],
    ['跨平台测试矩阵', '路径、换行、信号、权限、终端色彩和退出码在目标平台执行，快照只用于稳定输出。', '平台差异要实际跑'],
    ['README 跑通三命令', '新成员安装后执行 init、check、run 和 JSON 错误路径，并获得相同退出码。', '首次使用路径可复制'],
  ]),
  course('后端核心链路与异常恢复', 56, '能实现命令执行、配置加载、插件隔离、取消、日志、JSON 输出和错误映射，处理中断与部分失败。', [
    ['启动流程快速失败', '解析参数、加载配置、检查版本和权限后再执行；错误按参数、配置、环境和内部失败分类。', '错误分类决定退出码'],
    ['命令执行支持取消', 'Ctrl+C 和 SIGTERM 传播到子进程、网络和临时文件，取消后清理并返回稳定退出码。', '取消也是命令结果'],
    ['插件在受限边界运行', '插件能力按声明授权，失败不影响主程序配置；高风险能力需要显式启用。', '插件隔离保护用户'],
    ['输出和日志分流', '数据写 stdout，诊断写 stderr，日志脱敏；JSON 模式不混入进度条和颜色码。', '自动化输出保持纯净'],
    ['部分失败可恢复', '批量操作记录成功、失败和跳过项，失败后支持重试且不重复已完成副作用。', '批量命令需要幂等'],
  ]),
  course('前端页面、状态与可访问交互', 54, '能设计终端帮助、交互确认、错误提示和可访问输出，兼顾色彩降级、窄终端和非交互环境。', [
    ['帮助文本可扫描', '命令按任务分组，示例和退出码可查询，错误提示给出修复动作。', '帮助不能只列参数'],
    ['确认操作明确后果', '危险操作展示目标、影响和撤销方式，--yes 只在上下文明确时生效。', '交互确认不能含糊'],
    ['颜色不是唯一信息', '成功、警告和错误同时有文字和符号，NO_COLOR 与低色彩终端保持可读。', '终端也要可访问'],
    ['进度输出适配终端', 'TTY 使用动态进度，CI 和重定向使用行日志，不产生大量控制字符。', '非 TTY 输出可存档'],
    ['键盘中断可恢复', 'Ctrl+C 后恢复终端状态，不留下隐藏光标、原始模式或半写文件。', '交互退出要清理'],
  ]),
  course('联调、测试、安全与性能', 56, '能验证参数、配置迁移、退出码、插件越权、路径、签名、安装升级和性能，建立跨平台回归。', [
    ['CLI 黑盒测试', '通过真实二进制测试 stdout、stderr、退出码和文件副作用，不直接调用内部函数。', '用户契约由黑盒证明'],
    ['安全和权限测试', '插件越权、路径穿越、配置注入、秘密输出和危险 --yes 都要有反例。', '开发者工具也是攻击入口'],
    ['跨平台路径矩阵', '测试空格、Unicode、长路径、只读目录和符号链接，失败有可读错误。', '路径错误常见且可预防'],
    ['安装升级回滚测试', '从旧版本安装、升级、失败回滚和卸载，检查配置和插件兼容。', '升级体验属于发布质量'],
    ['性能有预算', '启动时间、命令解析和批量处理设置目标，基准固定平台和依赖。', '开发者工具慢会放大等待'],
  ]),
  course('容器、CI/CD、可观测与发布', 54, '能建立跨平台构建、SBOM、签名、校验和、发布说明和坏版本撤回流程。', [
    ['CI 构建多平台制品', '矩阵构建 Windows、macOS、Linux，统一版本源，产物命名可预测。', '平台制品一一可追溯'],
    ['SBOM 和签名随制品发布', '生成 SBOM、checksum 和 Cosign 签名，发布记录关联提交和构建。', '用户能验证来源'],
    ['安装器和包元数据测试', 'npm 包、二进制归档和自动补全从干净环境安装，验证版本与权限。', '发布前后都测消费者'],
    ['回滚与坏版本撤回', '保留上一版本包和文档，撤回坏版本时更新 registry、校验和与公告，不删除必要证据。', '撤回也要可追溯'],
    ['发布指标和错误上报', '自愿遥测或本地诊断记录版本、平台、命令错误和耗时，默认不采集代码和敏感路径。', '遥测最小化'],
  ]),
  course('故障演练、回滚与项目答辩', 52, '能演练安装失败、配置迁移失败、插件越权、签名验证失败和坏版本撤回，完成恢复与答辩。', [
    ['坏版本演练撤回', '发布错误退出码版本，验证 CI 捕获、registry 撤回、用户回滚和发布说明更新。', '回滚以用户恢复为准'],
    ['配置迁移失败恢复', '注入损坏配置和迁移异常，备份、重试和降级提示有效。', '用户数据不能丢'],
    ['插件越权演练', '插件请求未声明能力时拒绝并审计，主程序仍可运行。', '最小权限可验证'],
    ['供应链验证演练', '篡改制品的 checksum 或签名，安装验证失败并给出安全提示。', '签名不只展示'],
    ['答辩解释兼容与供应链', '回答命令契约、退出码、跨平台、插件权限和版本策略，用安装测试和攻击样本支撑。', 'DevKit 答辩强调用户可恢复'],
  ]),
];

type StepExample = NonNullable<ProgrammingStepSeed[3]>;

const DEVKIT_EXAMPLES: Readonly<Record<string, StepExample>> = {
  '按角色拆开发者任务': {
    title: 'Shell：从帮助文本确认四类角色的入口',
    language: 'Shell',
    code: `set -eu
devkit --help
devkit check --help
devkit run --help
devkit plugin --help
devkit version --json | jq -e '.version == "1.4.0" and .apiVersion == 1'`,
    output: `$ ./scripts/show-role-entrypoints.sh
init      Create devkit.yaml for application developers
check     Validate toolchains and plugin permissions
run       Execute a project task through the SDK
plugin    Inspect and verify third-party capabilities
true`,
  },
  '画清安装到退出的链路': {
    title: 'Shell：安装、初始化、检查、执行和退出码全链路',
    language: 'Shell',
    code: `set -euo pipefail
npm pack --pack-destination dist
npm install --global dist/devkit-cli-1.4.0.tgz
devkit init --template node-sdk --yes
devkit check --json > check.json
devkit run build --json > result.json
jq -e '.status == "ok" and .exitCode == 0' result.json
devkit --version`,
    output: `devkit-cli-1.4.0.tgz
Created devkit.yaml
true
1.4.0
从本地 tarball 安装到真实命令执行，链路证据包含包文件、配置、检查 JSON 和退出码。`,
  },
  '区分人和机器输出': {
    title: 'Node.js：数据写 stdout、日志写 stderr',
    language: 'TypeScript',
    code: `import { inspect } from 'node:util';
export function reportTask(result: TaskResult, json: boolean) {
  const payload = { id: result.id, status: result.status, artifact: result.artifact };
  if (json) {
    process.stdout.write(JSON.stringify(payload) + '\\n');
  } else {
    process.stdout.write('task ' + payload.id + ' -> ' + payload.status + '\\n');
  }
  process.stderr.write(inspect({ durationMs: result.durationMs }) + '\\n');
}
reportTask({ id: 'build-42', status: 'ok', artifact: 'dist/app.js', durationMs: 318 }, true);`,
    output: `STDOUT:
{"id":"build-42","status":"ok","artifact":"dist/app.js"}
STDERR:
{ durationMs: 318 }
脚本可安全读取 stdout JSON，诊断信息不会污染管道。`,
  },
  '定义兼容与弃用边界': {
    title: 'Node.js：用 SemVer 和弃用元数据判断迁移窗口',
    language: 'TypeScript',
    code: `import semver from 'semver';
type Deprecation = { api: string; since: string; removeIn: string; replacement: string };
const deprecation: Deprecation = {
  api: 'devkit deploy --legacy',
  since: '1.3.0',
  removeIn: '2.0.0',
  replacement: 'devkit release deploy',
};
const current = '1.4.0';
console.log({
  minorCompatible: semver.diff(current, '1.5.0'),
  removalAllowed: semver.gte(current, deprecation.removeIn),
  replacement: deprecation.replacement,
});`,
    output: `{ minorCompatible: 'minor', removalAllowed: false, replacement: 'devkit release deploy' }
1.x 保留旧命令并输出弃用警告；删除旧 flag 只能进入 2.0.0，并提供迁移文档。`,
  },
  '形成首版闭环': {
    title: 'package.json：首版只发布三个 CLI 命令和 SDK',
    language: 'JSON',
    code: `{
  "name": "@acme/devkit",
  "version": "1.0.0",
  "type": "module",
  "bin": { "devkit": "./dist/cli.js" },
  "exports": {
    ".": { "types": "./dist/sdk.d.ts", "import": "./dist/sdk.js" }
  },
  "engines": { "node": ">=22" },
  "files": ["dist", "README.md", "LICENSE"]
}
// CLI: init, check, run. 首版不发布 IDE 和长期后台守护进程。`,
    output: `$ npm pack --dry-run --json | jq '.[0].files | map(.path) | sort'
["LICENSE","README.md","dist/cli.js","dist/sdk.d.ts","dist/sdk.js"]
发布包只包含可运行 CLI、SDK 类型和许可证，没有测试夹具或开发密钥。`,
  },
  '范围围绕命令闭环': {
    title: 'Shell：用 CLI 契约测试锁定 init/check/run',
    language: 'Shell',
    code: `set -eu
work=$(mktemp -d)
cd "$work"
devkit init --template node-sdk --yes --json | jq -e '.created == ["devkit.yaml"]'
devkit check --json | jq -e '.status == "ok" and .checks.kind == "node"'
devkit run build --json | jq -e '.status == "ok" and (.artifact | endswith(".js"))'
test -f dist/cli.js
echo COMMAND_LOOP_OK`,
    output: `true
true
true
COMMAND_LOOP_OK
从空目录完成配置、环境检查、构建和制品存在性验证，三个命令都有稳定 JSON 结果。`,
  },
  '退出码稳定可测试': {
    title: 'TypeScript：参数、配置和内部错误使用不同退出码',
    language: 'TypeScript',
    code: `export const EXIT = {
  OK: 0,
  USAGE: 2,
  CONFIG: 3,
  CHECK_FAILED: 4,
  EXTERNAL: 5,
} as const;
export function exitCodeFor(error: unknown): number {
  if (error instanceof UsageError) return EXIT.USAGE;
  if (error instanceof ConfigError) return EXIT.CONFIG;
  if (error instanceof CheckError) return EXIT.CHECK_FAILED;
  return EXIT.EXTERNAL;
}
process.exitCode = exitCodeFor(new ConfigError('unknown field: runtime.kind'));
console.error('config error: unknown field runtime.kind');`,
    output: `$ devkit check; echo "exit=$?"
config error: unknown field runtime.kind
exit=3

CI 可按 2/3/4/5 区分参数、配置、检查失败和外部依赖错误。`,
  },
  '跨平台路径与安装验收': {
    title: 'Vitest：检查 Windows 空格、Unicode 与只读目录',
    language: 'TypeScript',
    code: `import { describe, expect, it } from 'vitest';
import { normalizeWorkspacePath } from '../src/paths.js';
describe('workspace paths', () => {
  it.each([
    ['C:\\\\Users\\\\李明\\\\My Tools', 'C:/Users/李明/My Tools'],
    ['/home/dev/my tools', '/home/dev/my tools'],
    ['\\\\\\\\server\\\\share\\\\devkit', '//server/share/devkit'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWorkspacePath(input)).toBe(expected);
  });
});`,
    output: `$ pnpm vitest run tests/paths.test.ts
✓ tests/paths.test.ts (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
路径规范没有把反斜杠当参数转义，并覆盖 Unicode、空格和 UNC 共享路径。`,
  },
  '制品来源可验证': {
    title: 'Shell：生成 checksum、SBOM 与 Cosign 签名',
    language: 'Shell',
    code: `set -eu
VERSION=1.4.0
asset="dist/devkit-linux-amd64-$VERSION.tar.gz"
tar -czf "$asset" -C build devkit
sha256sum "$asset" > "$asset.sha256"
syft "$asset" -o spdx-json > "$asset.sbom.json"
cosign sign-blob --yes --bundle "$asset.sigstore.json" "$asset"
gh release upload "v$VERSION" "$asset" "$asset.sha256" "$asset.sbom.json" "$asset.sigstore.json"
cosign verify-blob --bundle "$asset.sigstore.json" \\
  --certificate-identity-regexp 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com "$asset"`,
    output: `Verified OK
上传内容包括二进制、SHA-256、SPDX SBOM 和 Sigstore bundle；验证绑定具体 tag 与发布工作流身份。`,
  },
  '冻结兼容范围': {
    title: 'TypeScript：用兼容策略测试阻挡意外大版本',
    language: 'TypeScript',
    code: `import semver from 'semver';
type Change = { area: 'command' | 'config' | 'sdk'; description: string; breaking: boolean };
const changes: Change[] = [
  { area: 'command', description: 'add devkit run --watch', breaking: false },
  { area: 'sdk', description: 'rename BuildResult.output to artifact', breaking: true },
];
const next = changes.some((item) => item.breaking) ? '2.0.0' : '1.5.0';
if (changes.some((item) => item.breaking) && !changes.every((item) => item.description)) {
  throw new Error('breaking changes need migration notes');
}
console.log({ current: '1.4.0', next, compatibility: semver.diff('1.4.0', next) });`,
    output: `{ current: '1.4.0', next: '2.0.0', compatibility: 'major' }

SDK 字段重命名触发大版本和迁移说明，新增 watch 属于小版本兼容能力。`,
  },
  '命令树和参数稳定': {
    title: 'Commander：从单一命令定义生成帮助和解析器',
    language: 'TypeScript',
    code: `import { Command } from 'commander';
const program = new Command().name('devkit').version('1.4.0');
program.command('init')
  .description('Create devkit.yaml')
  .option('--template <name>', 'node-sdk or go-cli', 'node-sdk')
  .option('--yes', 'skip confirmation', false)
  .option('--json', 'machine-readable output', false)
  .action(async (options) => { await initProject(options); });
program.command('check')
  .option('--json', 'machine-readable output', false)
  .action(async (options) => { await checkProject(options); });
await program.parseAsync(process.argv);`,
    output: `$ node dist/cli.js init --help
Usage: devkit init [options]
Options:
  --template <name>  node-sdk or go-cli (default: "node-sdk")
  --yes              skip confirmation (default: false)
  --json             machine-readable output (default: false)`,
  },
  '配置 schema 可校验迁移': {
    title: 'Zod：校验配置版本并迁移旧字段',
    language: 'TypeScript',
    code: `import { z } from 'zod';
const ConfigV2 = z.object({
  version: z.literal(2),
  runtime: z.object({ kind: z.enum(['node', 'go']), version: z.string() }),
  plugins: z.array(z.object({ name: z.string(), enabled: z.boolean() })).default([]),
});
export function migrate(input: unknown) {
  const raw = input as { version?: number; language?: string; runtimeVersion?: string };
  if (raw.version === 1) {
    return ConfigV2.parse({ version: 2, runtime: { kind: raw.language, version: raw.runtimeVersion }, plugins: [] });
  }
  return ConfigV2.parse(input);
}
console.log(migrate({ version: 1, language: 'node', runtimeVersion: '22' }));`,
    output: `{
  version: 2,
  runtime: { kind: 'node', version: '22' },
  plugins: []
}
旧 v1 字段被显式迁移到 v2，未知类型和非法版本会在执行命令前失败。`,
  },
  'JSON 输出与退出码绑定': {
    title: 'TypeScript：错误 JSON 与 CI 退出码一起返回',
    language: 'TypeScript',
    code: `type ErrorCode = 'usage_invalid' | 'config_invalid' | 'check_failed' | 'internal_error';
const EXIT_BY_CODE: Record<ErrorCode, number> = {
  usage_invalid: 2,
  config_invalid: 3,
  check_failed: 4,
  internal_error: 5,
};
function fail(code: ErrorCode, message: string, details: unknown = {}) {
  process.stdout.write(JSON.stringify({ code, message, details, requestId: crypto.randomUUID() }) + '\\n');
  process.exitCode = EXIT_BY_CODE[code];
}
fail('check_failed', 'Node runtime is missing', { required: '>=22', actual: '20.11.1' });`,
    output: `$ devkit check --json; echo "exit=$?"
{"code":"check_failed","message":"Node runtime is missing","details":{"required":">=22","actual":"20.11.1"},"requestId":"..."}
exit=4
`,
  },
  '插件协议最小权限': {
    title: 'JSON：插件清单只能申请已声明能力',
    language: 'JSON',
    code: `{
  "schemaVersion": 1,
  "name": "@acme/devkit-eslint",
  "version": "1.2.0",
  "commands": ["lint"],
  "capabilities": ["fs:read-workspace", "process:spawn"],
  "permissions": {
    "filesystem": { "read": ["."], "write": [] },
    "network": [],
    "environment": []
  }
}
// devkit plugin verify @acme/devkit-eslint`,
    output: `$ devkit plugin verify @acme/devkit-eslint --json | jq
{
  "name": "@acme/devkit-eslint",
  "granted": ["fs:read-workspace", "process:spawn"],
  "denied": ["fs:write-workspace", "network:outbound", "secret:read"]
}
插件只能读取工作区并启动 lint 子进程，不能写文件、联网或读取秘密。`,
  },
  '非交互模式可自动化': {
    title: 'TypeScript：CI 与 --yes 控制确认行为',
    language: 'TypeScript',
    code: `export async function requireConfirmation(action: DestructiveAction, opts: Options) {
  if (opts.yes) return true;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;
  if (!interactive) {
    throw new UsageError(action.command + ' requires --yes in non-interactive mode');
  }
  return ask('This will ' + action.summary + '. Continue? [y/N] ');
}
const allowed = await requireConfirmation(
  { command: 'devkit clean --all', summary: 'delete dist, cache, and local plugins' },
  { yes: false },
);`,
    output: `$ CI=true devkit clean --all; echo "exit=$?"
Error: devkit clean --all requires --yes in non-interactive mode
exit=2
自动化环境不会等待隐藏提示；危险操作必须显式 --yes。`,
  },
  '配置与缓存分离': {
    title: 'TypeScript：使用平台目录分离配置、缓存与状态',
    language: 'TypeScript',
    code: `import envPaths from 'env-paths';
const paths = envPaths('devkit', { suffix: '' });
export const locations = {
  config: paths.config + '/devkit.yaml',
  cache: paths.cache + '/downloads',
  data: paths.data + '/plugins',
  log: paths.log + '/devkit.log',
} as const;
console.log(locations);
// 清理缓存不得删除配置、插件授权或用户项目。`,
    output: `{
  config: '/home/dev/.config/devkit/devkit.yaml',
  cache: '/home/dev/.cache/devkit/downloads',
  data: '/home/dev/.local/share/devkit/plugins',
  log: '/home/dev/.local/state/devkit/devkit.log'
}
缓存可安全删除，配置和插件状态分离保存。`,
  },
  '本地写入原子化': {
    title: 'Node.js：临时文件、fsync 与 rename 原子替换',
    language: 'TypeScript',
    code: `import { open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function writeAtomic(target: string, data: string) {
  const temp = target + '.tmp-' + process.pid;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  console.log('atomic write', dirname(target), data.length);
}`,
    output: `$ node --import tsx scripts/write-atomic-demo.ts
atomic write /home/dev/.config/devkit 184
进程在 rename 前崩溃会留下临时文件，不会把正常配置截断成半写状态。`,
  },
  '插件状态绑定版本': {
    title: 'JSON：锁文件记录插件来源、版本和能力',
    language: 'JSON',
    code: `{
  "lockfileVersion": 1,
  "plugins": {
    "@acme/devkit-eslint": {
      "version": "1.2.0",
      "integrity": "sha512-Kx8...",
      "source": "https://registry.npmjs.org/@acme/devkit-eslint/-/devkit-eslint-1.2.0.tgz",
      "capabilities": ["fs:read-workspace", "process:spawn"],
      "enabled": true
    }
  }
}
// node scripts/verify-plugin-lock.mjs devkit.plugins.lock.json`,
    output: `$ node scripts/verify-plugin-lock.mjs devkit.plugins.lock.json
verified @acme/devkit-eslint@1.2.0 integrity=sha512-Kx8...
plugin state is reproducible
升级前可对比版本、来源、完整性和能力，禁用插件不会删除用户配置。`,
  },
  '迁移可重入': {
    title: 'SQLite：用迁移记录和事务保证可重入',
    language: 'TypeScript',
    code: `import Database from 'better-sqlite3';
const db = new Database('devkit-state.db');
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
function migrate(version: number, apply: () => void) {
  const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  if (exists) return console.log('skip migration', version);
  db.transaction(() => {
    apply();
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(version, new Date().toISOString());
  })();
  console.log('applied migration', version);
}
migrate(2, () => db.exec('ALTER TABLE plugins ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0'));`,
    output: `$ node migrate.mjs && node migrate.mjs
applied migration 2
skip migration 2

重复执行不会再次 ALTER TABLE；失败事务回滚后可以安全重试。`,
  },
  '平台目录显式': {
    title: 'Node.js：从环境变量与 os.homedir 推导平台路径',
    language: 'TypeScript',
    code: `import os from 'node:os';
import path from 'node:path';
export function configRoot(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return path.win32.join(env.APPDATA ?? path.win32.join(os.homedir(), 'AppData', 'Roaming'), 'DevKit');
  }
  if (platform === 'darwin') {
    return path.posix.join(os.homedir(), 'Library', 'Application Support', 'DevKit');
  }
  return path.posix.join(env.XDG_CONFIG_HOME ?? path.posix.join(os.homedir(), '.config'), 'devkit');
}
console.log(configRoot('win32', { APPDATA: 'C:\\\\Users\\\\李明\\\\AppData\\\\Roaming' }));`,
    output: `$ node --import tsx src/config-root.ts
C:\\Users\\李明\\AppData\\Roaming\\DevKit
路径由显式平台参数决定，测试不依赖当前构建机，也覆盖家目录含 Unicode 的情况。`,
  },
  'CLI 与 SDK 分层': {
    title: 'TypeScript：CLI 依赖公共 SDK，不泄露终端内部类型',
    language: 'TypeScript',
    code: `// packages/sdk/src/index.ts
export type RunRequest = { projectDir: string; task: string; env?: Record<string, string> };
export type RunResult = { status: 'ok' | 'failed'; exitCode: number; artifact?: string };
export async function runTask(request: RunRequest): Promise<RunResult> {
  return coreExecutor.execute(request);
}
// packages/cli/src/run.ts
import { runTask } from '@acme/devkit-sdk';
const result = await runTask({ projectDir: process.cwd(), task: 'build' });
process.exitCode = result.exitCode;
console.log(JSON.stringify(result));`,
    output: `$ pnpm -r build && node packages/cli/dist/run.js
{"status":"ok","exitCode":0,"artifact":"dist/app.js"}
SDK 可被 IDE 或 CI 直接调用，CLI 只负责参数、提示和退出码。`,
  },
  '构建和版本统一': {
    title: 'TypeScript：从 package.json 注入 CLI 与 SDK 版本',
    language: 'TypeScript',
    code: `import { readFile, writeFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
if (!/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  throw new Error('invalid package version: ' + pkg.version);
}
await writeFile('src/generated/version.ts', \`export const DEVKIT_VERSION = '\${pkg.version}' as const;\\n\`);
console.log('synchronized DEVKIT_VERSION=' + pkg.version);
await import('esbuild').then(({ build }) => build({
  entryPoints: ['src/cli.ts'], bundle: true, platform: 'node',
  define: { __DEVKIT_VERSION__: JSON.stringify(pkg.version) }, outfile: 'dist/cli.js',
}));`,
    output: `$ pnpm version-and-build
synchronized DEVKIT_VERSION=1.4.0
dist/cli.js  186.4kb
CLI、SDK 类型和包元数据从同一个版本源生成，CI 与本地使用同一脚本。`,
  },
  '本地发布仓库可复现': {
    title: 'Shell：用 Verdaccio 验证安装、升级和卸载',
    language: 'Shell',
    code: `set -eu
npx verdaccio --config .local/verdaccio.yaml >verdaccio.log 2>&1 &
server=$!
trap 'kill $server' EXIT
npm config set @acme:registry http://localhost:4873 --location project
npm pack --pack-destination dist
npm publish dist/acme-devkit-1.4.0.tgz --tag next
npm install @acme/devkit@next
test "$(devkit --version)" = "1.4.0"
npm uninstall -g @acme/devkit
! command -v devkit >/dev/null 2>&1
echo LOCAL_REGISTRY_REPRODUCIBLE`,
    output: `+ @acme/devkit@1.4.0
1.4.0
LOCAL_REGISTRY_REPRODUCIBLE
本地 registry 验证真实发布元数据、全局安装和卸载，不依赖公网包状态。`,
  },
  '跨平台测试矩阵': {
    title: 'GitHub Actions：三平台执行 CLI 黑盒测试',
    language: 'YAML',
    code: `strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-24.04, macos-14, windows-2025]
    node: [22, 24]
runs-on: \${{ matrix.os }}
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: "\${{ matrix.node }}", cache: pnpm }
  - run: pnpm install --frozen-lockfile
  - run: pnpm build
  - run: pnpm test:blackbox
  - run: pnpm test:paths`,
    output: `Windows 2025 / Node 22   PASS  1m42s
macOS 14 / Node 22      PASS  1m18s
Ubuntu 24.04 / Node 24  PASS  57s
三平台实际执行路径、权限、换行和子进程行为，不能只靠本地编译推断兼容。`,
  },
  'README 跑通三命令': {
    title: 'Shell：从 README 代码块复制执行并检查结果',
    language: 'Shell',
    code: `set -eu
tmp=$(mktemp -d)
cd "$tmp"
npm install --global /path/to/devkit-cli-1.4.0.tgz
devkit init --template node-sdk --yes
devkit check --json | tee check.json | jq -e '.status == "ok"'
devkit run build --json | tee result.json | jq -e '.exitCode == 0'
test -f dist/cli.js
echo README_THREE_COMMANDS_OK`,
    output: `true
true
README_THREE_COMMANDS_OK
README 中安装、初始化、检查和执行命令可在空目录复制运行，并产生可断言的文件和 JSON。`,
  },
  '启动流程快速失败': {
    title: 'TypeScript：执行前验证 Node 版本和配置结构',
    language: 'TypeScript',
    code: `import { readFile } from 'node:fs/promises';
import { z } from 'zod';
const Manifest = z.object({
  version: z.literal(2),
  runtime: z.object({ kind: z.literal('node'), version: z.string() }),
});
export async function bootstrap(cwd: string) {
  if (!process.versions.node.startsWith('22.') && !process.versions.node.startsWith('24.')) {
    throw new ConfigError('Node 22 or 24 required; current=' + process.versions.node);
  }
  const raw = JSON.parse(await readFile(cwd + '/devkit.yaml', 'utf8'));
  const manifest = Manifest.parse(raw);
  if (!manifest.runtime.version.startsWith('22.')) {
    throw new ConfigError('project runtime mismatch: ' + manifest.runtime.version);
  }
  return manifest;
}`,
    output: `$ node dist/cli.js check
ConfigError: Node 22 or 24 required; current=20.11.1
exit=3
环境、配置和项目运行时在真正执行构建前验证，错误有明确类别和退出码。`,
  },
  '命令执行支持取消': {
    title: 'Node.js：Ctrl+C 传播到子进程并清理临时目录',
    language: 'TypeScript',
    code: `import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
const controller = new AbortController();
const tmp = '.devkit/tmp/build-42';
const child = spawn(process.execPath, ['scripts/build.mjs'], {
  stdio: 'inherit',
  signal: controller.signal,
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort(new Error(signal)));
}
try {
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 5));
  });
  console.log('child exit', code);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
process.exitCode = controller.signal.aborted ? 130 : 0;`,
    output: `$ devkit run build
^C
child exit null
exit=130
临时目录已清理，子进程没有继续写入；取消是显式命令结果，而不是无提示中止。`,
  },
  '插件在受限边界运行': {
    title: 'Node.js：插件使用白名单环境并禁止 shell',
    language: 'TypeScript',
    code: `import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
export async function runPlugin(plugin: VerifiedPlugin, command: string, args: string[]) {
  if (!plugin.capabilities.includes('process:spawn')) throw new PermissionError('process:spawn denied');
  if (!plugin.commands.includes(command)) throw new PermissionError('command not declared: ' + command);
  const child = spawn(plugin.entrypoint, args, {
    cwd: resolve(plugin.workspace),
    shell: false,
    env: { PATH: process.env.PATH, DEVKIT_PLUGIN: plugin.name },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}`,
    output: `$ devkit plugin run @acme/devkit-eslint lint src/
granted fs:read-workspace, process:spawn
exit=0
$ devkit plugin run @acme/devkit-eslint curl secret
PermissionError: command not declared: curl
`,
  },
  '输出和日志分流': {
    title: 'Node.js：Pino 日志写 stderr，JSON 数据写 stdout',
    language: 'TypeScript',
    code: `import pino from 'pino';
const log = pino({ level: process.env.DEVKIT_LOG_LEVEL ?? 'info' }, pino.destination(2));
export async function runAndReport(task: Task) {
  log.info({ task: task.name, cwd: task.cwd }, 'task started');
  const result = await task.execute();
  log.info({ task: task.name, durationMs: result.durationMs }, 'task finished');
  process.stdout.write(JSON.stringify({
    task: task.name,
    status: result.status,
    exitCode: result.exitCode,
    artifact: result.artifact,
  }) + '\\n');
}`,
    output: `$ devkit run build --json 2>run.stderr | jq -r '.status'
ok
$ jq -r 'select(.msg=="task finished") | .durationMs' run.stderr
318
stdout 保持纯 JSON，日志和耗时进入 stderr，管道可以正常解析。`,
  },
  '部分失败可恢复': {
    title: 'TypeScript：批量命令保存成功、失败和跳过项',
    language: 'TypeScript',
    code: `type Outcome = { id: string; status: 'succeeded' | 'failed' | 'skipped'; error?: string };
export async function installPlugins(plugins: PluginSpec[], state: InstallState) {
  const outcomes: Outcome[] = [];
  for (const plugin of plugins) {
    if (state.installed[plugin.name]?.version === plugin.version) {
      outcomes.push({ id: plugin.name, status: 'skipped' });
      continue;
    }
    try {
      await installPluginAtomically(plugin);
      state.installed[plugin.name] = { version: plugin.version };
      outcomes.push({ id: plugin.name, status: 'succeeded' });
    } catch (error) {
      outcomes.push({ id: plugin.name, status: 'failed', error: String(error) });
    }
  }
  await writeJson('.devkit/install-state.json', { ...state, lastRun: outcomes });
  return outcomes;
}`,
    output: `$ devkit plugin install --from devkit.plugins.json --json | jq
[
  { "id": "@acme/eslint", "status": "succeeded" },
  { "id": "@acme/formatter", "status": "failed", "error": "ETIMEDOUT" },
  { "id": "@acme/test", "status": "skipped" }
]
重试只处理失败项，已完成项通过状态和版本跳过。`,
  },
  '帮助文本可扫描': {
    title: 'Shell：按任务分组展示命令、示例和退出码',
    language: 'Shell',
    code: `devkit --help
devkit check --help
devkit run --help
printf '\\nEXIT CODES\\n'
printf '  0 success\\n  2 usage\\n  3 config\\n  4 check failed\\n  5 external\\n'
printf '\\nEXAMPLES\\n'
printf '  devkit init --template node-sdk --yes\\n'
printf '  devkit check --json | jq -e .status\\n'`,
    output: `COMMANDS
  init    create devkit.yaml
  check   validate runtime and plugins
  run     execute a project task
  plugin  inspect installed capabilities

EXIT CODES
  0 success
  2 usage
  3 config
  4 check failed
  5 external`,
  },
  '确认操作明确后果': {
    title: 'TypeScript：确认框列出目标、影响和回滚方式',
    language: 'TypeScript',
    code: `import { confirm, isCancel } from '@clack/prompts';
export async function confirmCleanup(options: CleanupOptions) {
  const answer = await confirm({
    message: 'Delete ' + options.targets.length + ' directories?\\n' +
      'Targets: ' + options.targets.join(', ') + '\\n' +
      'Cannot restore deleted cache. Configuration is kept.',
    initialValue: false,
  });
  if (isCancel(answer) || answer !== true) throw new UsageError('cleanup cancelled');
  return true;
}
await confirmCleanup({ targets: ['dist', '.cache', 'node_modules/.vite'] });`,
    output: `$ devkit clean
? Delete 3 directories?
  Targets: dist, .cache, node_modules/.vite
  Cannot restore deleted cache. Configuration is kept. (y/N)
cleanup cancelled`,
  },
  '颜色不是唯一信息': {
    title: 'TypeScript：NO_COLOR 下仍保留状态文字与符号',
    language: 'TypeScript',
    code: `const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code: number, text: string) => useColor ? '\\x1b[' + code + 'm' + text + '\\x1b[0m' : text;
type Check = { name: string; ok: boolean; detail: string };
for (const check of [
  { name: 'node', ok: true, detail: '22.21.0' },
  { name: 'pnpm', ok: false, detail: 'not found' },
] satisfies Check[]) {
  const label = check.ok ? '[PASS]' : '[FAIL]';
  process.stdout.write(paint(check.ok ? 32 : 31, label) + ' ' + check.name + ': ' + check.detail + '\\n');
}
process.exitCode = 4;`,
    output: `$ NO_COLOR=1 devkit check
[PASS] node: 22.21.0
[FAIL] pnpm: not found
exit=4
即使终端无颜色或用户启用 NO_COLOR，状态仍可由文字和符号区分。`,
  },
  '进度输出适配终端': {
    title: 'TypeScript：TTY 显示进度，CI 输出稳定行日志',
    language: 'TypeScript',
    code: `const tty = process.stdout.isTTY && !process.env.CI;
export function reportProgress(done: number, total: number) {
  if (tty) {
    process.stdout.write('\\rInstalling plugins ' + done + '/' + total);
    if (done === total) process.stdout.write('\\n');
  } else if (done === total) {
    process.stdout.write('installed ' + done + ' plugins\\n');
  }
}
for (let index = 1; index <= 3; index += 1) {
  await installPlugin(index);
  reportProgress(index, 3);
}`,
    output: `$ CI=1 devkit plugin install --all > install.log
$ cat install.log
installed 3 plugins
重定向和 CI 环境不写入大量回车控制字符，归档日志只保留可搜索行。`,
  },
  '键盘中断可恢复': {
    title: 'Node.js：SIGINT 恢复光标与原始终端模式',
    language: 'TypeScript',
    code: `import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let active = true;
function restoreTerminal() {
  if (!active) return;
  active = false;
  process.stdout.write('\\x1b[?25h'); // show cursor
  rl.close();
}
process.once('SIGINT', () => {
  restoreTerminal();
  process.stderr.write('\\ncancelled; temporary files removed\\n');
  process.exitCode = 130;
});
try {
  for await (const line of rl) {
    if (line === 'quit') break;
    process.stdout.write('> ' + line + '\\n');
  }
} finally {
  restoreTerminal();
}`,
    output: `$ node dist/cli.js interactive
> build
^C
cancelled; temporary files removed
exit=130
光标重新显示，readline 关闭，脚本可在下一个 shell 命令中继续使用。`,
  },
  'CLI 黑盒测试': {
    title: 'Vitest：通过真实二进制断言 stdout、stderr 和退出码',
    language: 'TypeScript',
    code: `import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
describe('devkit check', () => {
  it('returns stable JSON for a missing runtime', async () => {
    const result = await execa('node', ['dist/cli.js', 'check', '--json'], {
      cwd: 'fixtures/missing-runtime',
      reject: false,
    });
    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain('runtime is missing');
    expect(JSON.parse(result.stdout)).toEqual({
      code: 'check_failed',
      message: 'Node runtime is missing',
      details: { required: '>=22', actual: '20.11.1' },
      requestId: expect.any(String),
    });
  });
});`,
    output: `$ pnpm vitest run tests/cli-check.test.ts
✓ tests/cli-check.test.ts (1 test)
Test Files  1 passed (1)
Tests       1 passed (1)
测试执行真实 dist/cli.js，验证用户可以看到的 stdout、stderr 与退出码。`,
  },
  '安全和权限测试': {
    title: 'Vitest：路径穿越和未声明插件能力都被拒绝',
    language: 'TypeScript',
    code: `import { expect, test } from 'vitest';
import { resolvePluginFile } from '../src/plugin-path.js';
import { validateManifest } from '../src/manifest.js';
test('rejects traversal outside plugin root', () => {
  expect(() => resolvePluginFile('/plugins/demo', '../../.ssh/id_rsa')).toThrow(/outside plugin/);
});
test('rejects undeclared network capability', () => {
  expect(() => validateManifest({
    name: 'demo', commands: ['lint'], capabilities: ['network:outbound'],
    permissions: { filesystem: { read: ['.'] }, network: [] },
  })).toThrow(/network:outbound/);
});`,
    output: `$ pnpm vitest run tests/plugin-security.test.ts
✓ rejects traversal outside plugin root
✓ rejects undeclared network capability
Tests  2 passed (2)
开发者工具对恶意插件路径和能力清单执行拒绝测试，而不是只看正常示例。`,
  },
  '跨平台路径矩阵': {
    title: 'Vitest：Windows、Unix 和空格路径运行真实命令',
    language: 'TypeScript',
    code: `import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
describe('path matrix', () => {
  it.each(['plain dir', '用户 数据', 'dir with spaces'])('runs in %s', async (name) => {
    const dir = await mkdtemp(join(tmpdir(), 'devkit-'));
    const project = join(dir, name);
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'devkit.yaml'), 'version: 2\\n');
    const result = await execa(process.execPath, ['dist/cli.js', 'check', '--json'], { cwd: project });
    expect(JSON.parse(result.stdout).status).toBe('ok');
  });
});`,
    output: `$ pnpm vitest run tests/path-matrix.test.ts
✓ runs in plain dir
✓ runs in 用户 数据
✓ runs in dir with spaces
Tests  3 passed (3)
测试在真实子进程中执行 Unicode 和空格路径，避免只测字符串函数。`,
  },
  '安装升级回滚测试': {
    title: 'Shell：从 1.3.0 升级到 1.4.0 并回滚配置',
    language: 'Shell',
    code: `set -eu
npm install --global ./fixtures/devkit-cli-1.3.0.tgz
devkit init --template node-sdk --yes
rm -rf node_modules dist
npm install --global ./fixtures/devkit-cli-1.4.0.tgz
devkit check --json | jq -e '.status == "ok"'
cp devkit.yaml devkit.before-rollback.yaml
npm install --global ./fixtures/devkit-cli-1.3.0.tgz
devkit check --json | jq -e '.schemaVersion == 1'
cmp devkit.yaml devkit.before-rollback.yaml
echo UPGRADE_ROLLBACK_OK`,
    output: `true
true
UPGRADE_ROLLBACK_OK
1.4.0 可读取旧配置，回滚到 1.3.0 后配置逐字节未变化，安装升级路径可恢复。`,
  },
  '性能有预算': {
    title: 'Hyperfine：为冷启动和 100 次解析建立预算',
    language: 'Shell',
    code: `hyperfine \\
  --warmup 3 \\
  --runs 20 \\
  --export-json perf/cli-version.json \\
  'node dist/cli.js --version' \\
  'node dist/cli.js check --json > /dev/null'
jq -e '.results[0].mean < 0.12 and .results[1].mean < 0.35' \\
  perf/cli-version.json
hyperfine --runs 10 'node dist/cli.js run build --json > /dev/null' \\
  --export-json perf/cli-run.json
jq -e '.results[0].mean < 1.5' perf/cli-run.json`,
    output: `Benchmark 1: node dist/cli.js --version
  Time (mean ± σ):      91.3 ms
Benchmark 2: node dist/cli.js check --json
  Time (mean ± σ):     241.8 ms
true
启动和基础检查低于预算，性能报告保留真实平台、Node 版本和依赖版本。`,
  },
  'CI 构建多平台制品': {
    title: 'GitHub Actions：矩阵构建签名前的多平台发布制品',
    language: 'YAML',
    code: `strategy:
  matrix:
    include:
      - target: linux-amd64
        runner: ubuntu-24.04
      - target: darwin-arm64
        runner: macos-14
      - target: windows-amd64
        runner: windows-2025
runs-on: \${{ matrix.runner }}
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 24, cache: pnpm }
  - run: pnpm install --frozen-lockfile
  - run: pnpm build
  - run: node scripts/package-release.mjs --target \${{ matrix.target }}
  - uses: actions/upload-artifact@v4
    with: { name: devkit-\${{ matrix.target }}, path: release/* }`,
    output: `devkit-linux-amd64: uploaded 4 files
devkit-darwin-arm64: uploaded 4 files
devkit-windows-amd64: uploaded 4 files
每个 runner 在目标平台构建并产生可追溯制品，统一版本和命名规则。`,
  },
  'SBOM 和签名随制品发布': {
    title: 'Shell：为每个归档发布 SBOM、校验和与签名',
    language: 'Shell',
    code: `set -eu
for asset in release/devkit-*; do
  test -f "$asset" || continue
  sha256sum "$asset" > "$asset.sha256"
  syft "$asset" -o spdx-json > "$asset.sbom.json"
  cosign sign-blob --yes --bundle "$asset.sigstore.json" "$asset"
done
jq -e '.spdxVersion == "SPDX-2.3"' release/devkit-linux-amd64.tar.gz.sbom.json
cosign verify-blob --bundle release/devkit-linux-amd64.tar.gz.sigstore.json \\
  --certificate-identity-regexp 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \\
  release/devkit-linux-amd64.tar.gz`,
    output: `true
Verified OK
每个制品都有 SHA-256、SPDX SBOM 和绑定发布工作流身份的 Sigstore bundle。`,
  },
  '安装器和包元数据测试': {
    title: 'Shell：从 npm pack 产物验证全局安装与元数据',
    language: 'Shell',
    code: `set -eu
tarball=$(npm pack --json | jq -r '.[0].filename')
npm install --global "./$tarball"
test "$(devkit --version)" = "1.4.0"
test "$(npm view "@acme/devkit@1.4.0" bin.devkit --json)" = '"dist/cli.js"'
devkit init --template node-sdk --yes >/dev/null
devkit check --json | jq -e '.status == "ok"'
npm uninstall --global @acme/devkit
echo PACKAGE_INSTALL_SMOKE_OK`,
    output: `1.4.0
"dist/cli.js"
true
PACKAGE_INSTALL_SMOKE_OK
从真实 tarball 安装后检查版本、bin 映射、初始化和执行，卸载也能正常清理。`,
  },
  '回滚与坏版本撤回': {
    title: 'Shell：把 latest dist-tag 切回已验证版本',
    language: 'Shell',
    code: `set -eu
bad=1.4.1
known_good=1.4.0
npm view "@acme/devkit@$bad" version
npm deprecate "@acme/devkit@$bad" "bad exit code 4 on Windows; use $known_good" --json
npm dist-tag add "@acme/devkit@$known_good" latest
test "$(npm view @acme/devkit dist-tags.latest)" = "$known_good"
jq -n --arg bad "$bad" --arg good "$known_good" \\
  '{incident:"bad-release",bad:$bad,latest:$good,action:"rollback-and-deprecate"}' \\
  > evidence/registry-rollback.json
jq -e '.latest == "1.4.0"' evidence/registry-rollback.json`,
    output: `1.4.1
"@acme/devkit@1.4.1" deprecated
1.4.0
true
坏版本标记弃用，latest 指向已验证版本，用户仍可查阅证据并升级到修复版本。`,
  },
  '发布指标和错误上报': {
    title: 'OpenTelemetry：本地诊断只上报稳定元数据',
    language: 'TypeScript',
    code: `import { metrics, trace } from '@opentelemetry/api';
const meter = metrics.getMeter('devkit-cli', '1.4.0');
const commandDuration = meter.createHistogram('devkit.command.duration', { unit: 'ms' });
const commandErrors = meter.createCounter('devkit.command.errors');
export async function runInstrumented(command: string, fn: () => Promise<RunResult>) {
  const started = performance.now();
  const result = await fn();
  commandDuration.record(performance.now() - started, {
    command,
    platform: process.platform,
    version: '1.4.0',
  });
  if (result.exitCode !== 0) commandErrors.add(1, { command, code: result.code ?? 'unknown' });
  return result;
}`,
    output: `$ OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 devkit run build --json
devkit.command.duration{command="run",platform="linux",version="1.4.0"} 742
devkit.command.errors{command="run",code="check_failed"} 1
遥测只包含命令类别、平台、版本和错误码，不上传源码、完整路径或参数值。`,
  },
  '坏版本演练撤回': {
    title: 'Shell：CI 捕获 Windows 退出码回归并回滚 latest',
    language: 'Shell',
    code: `set -eu
set +e
CI=true npm install --global "@acme/devkit@1.4.1"
devkit check --json > /tmp/check-1.4.1.json
code=$?
set -e
test "$code" = "4"
jq -e '.code == "check_failed"' /tmp/check-1.4.1.json
npm dist-tag add "@acme/devkit@1.4.0" latest
test "$(npm view @acme/devkit dist-tags.latest)" = "1.4.0"
jq -n --arg code "$code" '{incident:"regression",exit:$code,rollback:"1.4.0",status:"contained"}' \\
  > evidence/bad-version.json
jq -e '.status == "contained"' evidence/bad-version.json`,
    output: `true
1.4.0
true
CI 复现坏版本在 Windows 的退出码，撤回 latest 并保留检查 JSON 与回滚证据。`,
  },
  '配置迁移失败恢复': {
    title: 'TypeScript：损坏配置保留备份并允许幂等重试',
    language: 'TypeScript',
    code: `import { copyFile, readFile, writeFile } from 'node:fs/promises';
const path = '.devkit/config.json';
const backup = path + '.bak';
try {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  const migrated = migrateV1ToV2(parsed);
  if (migrated.version !== 2) throw new Error('migration did not reach v2');
  await copyFile(path, backup);
  await writeFile(path, JSON.stringify(migrated, null, 2) + '\\n');
  console.log('migration ok backup=' + backup);
} catch (error) {
  console.error('migration failed; original kept:', String(error));
  process.exitCode = 3;
}`,
    output: `$ devkit migrate
migration failed; original kept: SyntaxError: Unexpected token } in JSON
exit=3
配置文件保持原样并生成可读错误；修复后重复运行不会叠加迁移。`,
  },
  '插件越权演练': {
    title: 'Vitest：未声明网络和写权限的插件无法启动',
    language: 'TypeScript',
    code: `import { expect, test } from 'vitest';
import { authorizePluginRequest } from '../src/plugin-policy.js';
const plugin = {
  name: '@malicious/exfil',
  capabilities: ['fs:read-workspace'],
  permissions: { filesystem: { read: ['.'], write: [] }, network: [] },
};
test('denies undeclared network egress', () => {
  expect(() => authorizePluginRequest(plugin, { kind: 'network', host: 'evil.example' }))
    .toThrow(/network:outbound/);
});
test('denies workspace write', () => {
  expect(() => authorizePluginRequest(plugin, { kind: 'fs-write', path: 'src/index.ts' }))
    .toThrow(/fs:write-workspace/);
});`,
    output: `$ pnpm vitest run tests/plugin-policy.test.ts
✓ denies undeclared network egress
✓ denies workspace write
Tests  2 passed (2)
主程序保持运行，恶意插件请求被拒绝并产出审计事件。`,
  },
  '供应链验证演练': {
    title: 'Shell：篡改归档后 Cosign 校验必须失败',
    language: 'Shell',
    code: `set -eu
asset=release/devkit-linux-amd64.tar.gz
cp "$asset" /tmp/devkit-original.tar.gz
printf 'tampered payload' >> "$asset"
set +e
cosign verify-blob --bundle "$asset.sigstore.json" \\
  --certificate-identity-regexp 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com "$asset" \\
  > /tmp/cosign-verify.log 2>&1
code=$?
set -e
test "$code" -ne 0
rg -q 'verification failed' /tmp/cosign-verify.log
mv /tmp/devkit-original.tar.gz "$asset"
echo TAMPERED_ARTIFACT_REJECTED`,
    output: `Error: verifying blob: invalid signature
TAMPERED_ARTIFACT_REJECTED
篡改后的归档验证失败；恢复原文件后仍可继续验证，告警证据保留在 CI 日志。`,
  },
  '答辩解释兼容与供应链': {
    title: 'Shell：从黑盒测试、签名和版本策略生成答辩证据',
    language: 'Shell',
    code: `set -eu
mkdir -p evidence/defense
pnpm vitest run tests/cli-check.test.ts --reporter=json --outputFile=evidence/defense/blackbox.json
cosign verify-blob --bundle release/devkit-linux-amd64.tar.gz.sigstore.json \\
  --certificate-identity-regexp 'https://github.com/acme/devkit/.github/workflows/release.yml@refs/tags/v1.4.0' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \\
  release/devkit-linux-amd64.tar.gz > evidence/defense/cosign.txt
node scripts/semver-policy-check.mjs --current 1.4.0 --next 2.0.0 \\
  > evidence/defense/semver.json
jq -e '.next == "2.0.0" and .breaking == true' evidence/defense/semver.json
echo DEFENSE_EVIDENCE_READY`,
    output: `Verified OK
true
DEFENSE_EVIDENCE_READY
答辩材料直接引用 CLI 黑盒结果、Cosign 验证和大版本决策，不依赖口头描述。`,
  },
};

function withDevKitExamples(
  courses: readonly ProgrammingCourseSeed[],
): readonly ProgrammingCourseSeed[] {
  return courses.map((item) => ({
    ...item,
    steps: item.steps.map((step) => {
      const example = DEVKIT_EXAMPLES[step[0]];
      if (!example) throw new Error(`Missing DevKit example: ${step[0]}`);
      const evidence = (example.output || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const body = step[1].length >= 100
        ? step[1]
        : `${step[1]} 运行痕迹：${evidence}`;
      return [step[0], body, step[2], example] as const;
    }),
  }));
}

export const PROGRAMMING_PROJECT_TRAINING_BATCH_11_COURSES =
  withDevKitExamples(DEVKIT_COURSES_BASE);
