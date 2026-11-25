import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const typescriptRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'TypeScript / Node.js 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 运行，命令为 node --experimental-strip-types main.ts。',
    '本组代码只使用可擦除类型语法，不使用 enum、namespace、参数属性或依赖运行时转换的装饰器。',
    'stdin 是任务输入；先原样运行，再修改源码或输入并对照 checkpoint 复跑。',
  ],
  languages: ['typescript'],
} as const;

const lab = (
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  ...typescriptRuntime,
  practice,
  apply,
});

/**
 * TypeScript 独立语言课程后续 18 门实验。
 *
 * 每段源码只验证 Node 类型擦除后真实执行的逻辑。类型层面的断言由源码中的
 * 类型别名表达，不会被运行时冒充为 tsc 已检查；checkpoint 同时要求观察运行
 * 输出和按说明执行独立类型检查。
 */
export const LEARNING_CODE_LABS_TYPESCRIPT_FINAL: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:TypeScript · 编译器、配置与第一个类型化项目：tsconfig strict、target、module 与 lib': lab(
    'TS 进阶代码台 01 · 合并 tsconfig 并解释最终约束',
    '从父配置与子配置恢复最终编译选项，验证 extends 覆盖、严格开关和模块解析；再检查项目目录边界是否真的能交给 tsc。',
    {
      id: 'typescript-final-tsconfig-merge-guided',
      title: '跟做：计算 effective tsconfig',
      brief:
        'stdin 提供 base 与 child 两份编译配置。先视为 unknown 逐字段校验，再按浅覆盖语义生成最终配置，打印 strict、target、moduleResolution 与文件集合。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Target = 'ES2022' | 'ES5';
type ModuleResolution = 'NodeNext' | 'Bundler';
type CompilerConfig = {
  readonly strict: boolean;
  readonly target: Target;
  readonly moduleResolution: ModuleResolution;
  readonly include: readonly string[];
};
type Input = {
  readonly base: Partial<CompilerConfig>;
  readonly child: Partial<CompilerConfig>;
};

function isTarget(value: unknown): value is Target {
  return value === 'ES2022' || value === 'ES5';
}

function isResolution(value: unknown): value is ModuleResolution {
  return value === 'NodeNext' || value === 'Bundler';
}

function parsePartial(value: unknown, label: string): Partial<CompilerConfig> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(label + ' 必须是对象');
  }
  const row = value as Record<string, unknown>;
  if (row.strict !== undefined && typeof row.strict !== 'boolean') throw new Error(label + '.strict 非法');
  if (row.target !== undefined && !isTarget(row.target)) throw new Error(label + '.target 非法');
  if (row.moduleResolution !== undefined && !isResolution(row.moduleResolution)) {
    throw new Error(label + '.moduleResolution 非法');
  }
  if (row.include !== undefined && (!Array.isArray(row.include) || !row.include.every((item) => typeof item === 'string'))) {
    throw new Error(label + '.include 非法');
  }
  return row as Partial<CompilerConfig>;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('stdin 必须是对象');
const input = raw as Record<string, unknown>;
const base = parsePartial(input.base, 'base');
const child = parsePartial(input.child, 'child');
const merged: CompilerConfig = {
  strict: child.strict ?? base.strict ?? false,
  target: child.target ?? base.target ?? 'ES2022',
  moduleResolution: child.moduleResolution ?? base.moduleResolution ?? 'NodeNext',
  include: Object.freeze([...(child.include ?? base.include ?? ['src/**/*.ts'])]),
};

console.log(JSON.stringify(merged));
if (!merged.strict || merged.target !== 'ES2022' || merged.moduleResolution !== 'Bundler') {
  throw new Error('子配置覆盖结果错误');
}
if (merged.include.join(',') !== 'src/**/*.ts,test/**/*.ts') throw new Error('include 覆盖结果错误');
`,
      },
      stdin:
        '{"base":{"strict":false,"target":"ES5","moduleResolution":"NodeNext","include":["src/**/*.ts"]},"child":{"strict":true,"target":"ES2022","moduleResolution":"Bundler","include":["src/**/*.ts","test/**/*.ts"]}}',
      checkpoint:
        '输出 strict true、target ES2022、moduleResolution Bundler，include 为两段路径，退出码为 0。把 child.strict 改成字符串应被运行时拒绝；删除 child.target 应继承 base 的 ES5，而不是猜测为默认值。',
    },
    {
      id: 'typescript-final-tsconfig-boundary-independent',
      title: '独立实践：检查可交付的项目边界',
      brief:
        'stdin 提供 rootDir、outDir、declaration、noEmitOnError、strict 与 moduleResolution。输出阻止发布的错误清单，重点检查输出目录是否落入源码目录以及关闭严格模式的风险。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

type ProjectConfig = {
  readonly rootDir: string;
  readonly outDir: string;
  readonly declaration: boolean;
  readonly noEmitOnError: boolean;
  readonly strict: boolean;
  readonly moduleResolution: 'NodeNext' | 'Bundler';
};

function isInside(parent: string, child: string): boolean {
  const normalizedParent = posix.normalize(parent).replace(/\\/$/, '');
  const normalizedChild = posix.normalize(child).replace(/\\/$/, '');
  return normalizedChild === normalizedParent || normalizedChild.startsWith(normalizedParent + '/');
}

function validate(config: ProjectConfig): string[] {
  const issues: string[] = [];
  if (!config.rootDir.startsWith('src')) issues.push('ROOT_DIR_MUST_BE_UNDER_SRC');
  if (!config.outDir.startsWith('dist')) issues.push('OUT_DIR_MUST_BE_UNDER_DIST');
  if (isInside(config.rootDir, config.outDir)) issues.push('OUTPUT_INSIDE_SOURCE');
  if (!config.declaration) issues.push('MISSING_DECLARATIONS');
  if (!config.noEmitOnError) issues.push('EMIT_CONTINUES_ON_ERROR');
  if (!config.strict) issues.push('STRICT_DISABLED');
  if (config.moduleResolution === 'NodeNext' && !config.rootDir.endsWith('src')) {
    issues.push('NODENEXT_SOURCE_LAYOUT_AMBIGUOUS');
  }
  return issues;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as ProjectConfig;
const issues = validate(raw);
console.log(JSON.stringify({ issues, publishable: issues.length === 0 }));
if (issues.join(',') !== 'STRICT_DISABLED') throw new Error('项目边界判定错误');
`,
      },
      stdin:
        '{"rootDir":"src","outDir":"dist","declaration":true,"noEmitOnError":true,"strict":false,"moduleResolution":"NodeNext"}',
      checkpoint:
        '输出唯一问题 STRICT_DISABLED，publishable false，退出码为 0。把 outDir 改为 src/generated 应同时出现 OUTPUT_INSIDE_SOURCE；不能仅凭目录名看起来不同就认为产物不会污染源码。',
    },
  ),

  'programming:TypeScript · 编译器、配置与第一个类型化项目：interface、type 与声明合并': lab(
    'TS 进阶代码台 02 · 声明合并与运行时能力探测',
    '用 interface 的重复声明构造扩展点，再把未知 JSON 转成真实插件对象；验证声明存在不等于运行时方法存在。',
    {
      id: 'typescript-final-interface-merge-guided',
      title: '跟做：给事件处理器声明可选追踪能力',
      brief:
        'stdin 提供处理器名称和支持追踪的布尔值。通过两个 interface Handler 声明合并出 name 与可选 trace，运行时按 typeof 探测方法并生成能力报告。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

interface Handler {
  readonly name: string;
}

interface Handler {
  readonly trace?: (event: string) => string;
}

function normalize(raw: unknown): Handler {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('handler 必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.name !== 'string' || row.name.length === 0) throw new Error('name 非法');
  if (typeof row.tracing !== 'boolean') throw new Error('tracing 非法');
  return row.tracing
    ? { name: row.name, trace: (event: string) => row.name + ':' + event }
    : { name: row.name };
}

const handler = normalize(JSON.parse(readFileSync(0, 'utf8')) as unknown);
const capability = {
  name: handler.name,
  tracing: typeof handler.trace === 'function',
  sample: typeof handler.trace === 'function' ? handler.trace('dispatch') : null,
};
console.log(JSON.stringify(capability));
if (!capability.tracing || capability.sample !== 'audit:dispatch') throw new Error('追踪能力探测失败');
`,
      },
      stdin: '{"name":"audit","tracing":true}',
      checkpoint:
        '输出 tracing true、sample 为 audit:dispatch，退出码为 0。把 tracing 改为 false 后仍应能构造只有 name 的对象，sample 为 null；声明合并不会自动创建 trace 函数。',
    },
    {
      id: 'typescript-final-interface-merge-independent',
      title: '独立实践：扩展命令的类型与真实行为',
      brief:
        'stdin 提供命令列表。为 Command 合并 dryRun、run 和 rollback 三段声明，但每个能力都用 typeof 探测；执行顺序必须是 run 后 rollback，不可把类型声明当成实现。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

interface Command {
  readonly name: string;
}

interface Command {
  readonly dryRun?: () => string;
}

interface Command {
  readonly run?: () => string;
}

interface Command {
  readonly rollback?: () => string;
}

type CommandInput = {
  readonly name: string;
  readonly dryRun: boolean;
  readonly run: boolean;
  readonly rollback: boolean;
};

function build(raw: unknown): Command {
  if (typeof raw !== 'object' || raw === null) throw new Error('command 必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.name !== 'string' || !row.name) throw new Error('name 非法');
  if (typeof row.dryRun !== 'boolean' || typeof row.run !== 'boolean' || typeof row.rollback !== 'boolean') {
    throw new Error('能力开关必须是 boolean');
  }
  const input = row as CommandInput;
  return Object.freeze({
    name: input.name,
    ...(input.dryRun ? { dryRun: () => 'plan:' + input.name } : {}),
    ...(input.run ? { run: () => 'ran:' + input.name } : {}),
    ...(input.rollback ? { rollback: () => 'undo:' + input.name } : {}),
  });
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是命令数组');
const report = raw.map((item) => {
  const command = build(item);
  const capabilities = {
    dryRun: typeof command.dryRun === 'function' ? command.dryRun() : null,
    run: typeof command.run === 'function' ? command.run() : null,
    rollback: typeof command.rollback === 'function' ? command.rollback() : null,
  };
  return { name: command.name, capabilities };
});
console.log(JSON.stringify(report));
if (report[0]?.capabilities.run !== 'ran:deploy' || report[0]?.capabilities.rollback !== 'undo:deploy') {
  throw new Error('命令能力执行错误');
}
if (report[1]?.capabilities.run !== null || report[1]?.capabilities.dryRun !== 'plan:inspect') {
  throw new Error('缺失能力没有被如实报告');
}
`,
      },
      stdin:
        '[{"name":"deploy","dryRun":false,"run":true,"rollback":true},{"name":"inspect","dryRun":true,"run":false,"rollback":false}]',
      checkpoint:
        'deploy 输出 ran:deploy 与 undo:deploy，run 为 null；inspect 输出 plan:inspect，run 和 rollback 均为 null，退出码为 0。删除某一接口声明不应改变运行时对象，只能改变类型可见性。',
    },
  ),

  'programming:TypeScript · 编译器、配置与第一个类型化项目：严格模式下的第一项目': lab(
    'TS 进阶代码台 03 · 严格边界上的启动配置',
    '从不完整环境变量恢复应用启动参数，分别验证 null、缺失字段、非法数值和默认值；再生成可重复的启动诊断。',
    {
      id: 'typescript-final-strict-project-guided',
      title: '跟做：把 null 与缺失区别处理',
      brief:
        'stdin 中包含 port、databaseUrl 和 featureFlag。把 null 视为显式无效值，缺失 databaseUrl 才使用本地默认值；输出规范配置和每个来源。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Source = 'input' | 'default';
type AppConfig = {
  readonly port: number;
  readonly databaseUrl: string;
  readonly featureFlag: boolean;
  readonly sources: Readonly<Record<'databaseUrl' | 'featureFlag', Source>>;
};

function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('config 必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.port !== 'number' || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535) {
    throw new Error('port 必须是 1..65535 的整数');
  }
  if (row.databaseUrl === null) throw new Error('databaseUrl 不允许显式 null');
  if (row.databaseUrl !== undefined && (typeof row.databaseUrl !== 'string' || !row.databaseUrl)) {
    throw new Error('databaseUrl 非法');
  }
  if (row.featureFlag === null || (row.featureFlag !== undefined && typeof row.featureFlag !== 'boolean')) {
    throw new Error('featureFlag 非法');
  }
  const databaseUrl = row.databaseUrl === undefined ? 'postgres://localhost/dev' : row.databaseUrl;
  const featureFlag = row.featureFlag === undefined ? false : row.featureFlag;
  return Object.freeze({
    port: row.port,
    databaseUrl,
    featureFlag,
    sources: Object.freeze({
      databaseUrl: row.databaseUrl === undefined ? 'default' : 'input',
      featureFlag: row.featureFlag === undefined ? 'default' : 'input',
    }),
  });
}

const config = parseConfig(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(config));
if (config.databaseUrl !== 'postgres://localhost/dev' || config.featureFlag) throw new Error('默认值错误');
if (config.sources.databaseUrl !== 'default' || config.sources.featureFlag !== 'default') {
  throw new Error('配置来源错误');
}
`,
      },
      stdin: '{"port":3000}',
      checkpoint:
        '输出 port 3000、本地数据库默认值、featureFlag false，两个来源均为 default，退出码为 0。把 databaseUrl 改为 null 必须失败；缺失字段与显式 null 不能被同一个真值判断吞掉。',
    },
    {
      id: 'typescript-final-strict-project-independent',
      title: '独立实践：严格解析容器启动清单',
      brief:
        'stdin 提供服务名、副本数、探针路径和环境映射。生成完整启动清单，校验服务名格式、整数范围、环境变量值类型与重复键，并为可选字段记录默认来源。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type StartupSpec = {
  readonly service: string;
  readonly replicas: number;
  readonly probePath: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly defaults: readonly string[];
};

function parseSpec(raw: unknown): StartupSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('spec 必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.service !== 'string' || !/^[a-z][a-z0-9-]{2,30}$/.test(row.service)) {
    throw new Error('service 非法');
  }
  if (typeof row.replicas !== 'number' || !Number.isInteger(row.replicas) || row.replicas < 1 || row.replicas > 20) {
    throw new Error('replicas 必须为 1..20 的整数');
  }
  if (row.probePath !== undefined && (typeof row.probePath !== 'string' || !row.probePath.startsWith('/'))) {
    throw new Error('probePath 非法');
  }
  if (row.environment !== undefined) {
    if (typeof row.environment !== 'object' || row.environment === null || Array.isArray(row.environment)) {
      throw new Error('environment 必须是对象');
    }
    for (const value of Object.values(row.environment)) {
      if (typeof value !== 'string') throw new Error('environment 值必须是 string');
    }
  }
  const defaults: string[] = [];
  const probePath = row.probePath === undefined ? '/healthz' : row.probePath;
  if (row.probePath === undefined) defaults.push('probePath');
  const environment = (row.environment as Record<string, string> | undefined) ?? {};
  if (row.environment === undefined) defaults.push('environment');
  return Object.freeze({
    service: row.service,
    replicas: row.replicas,
    probePath,
    environment: Object.freeze({ ...environment }),
    defaults: Object.freeze(defaults),
  });
}

const spec = parseSpec(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(spec));
if (spec.probePath !== '/healthz' || spec.defaults.join(',') !== 'probePath,environment') {
  throw new Error('启动默认值错误');
}
if (JSON.stringify(spec.environment) !== '{}') throw new Error('环境映射错误');
`,
      },
      stdin: '{"service":"orders-api","replicas":2}',
      checkpoint:
        '输出 probePath /healthz、replicas 2、environment {}、defaults 为 probePath,environment，退出码为 0。把 replicas 改成 0 或 2.5 都应失败；环境值设成数字也必须失败。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：keyof、索引访问与映射类型': lab(
    'TS 进阶代码台 04 · 用键集合驱动可审计更新',
    '用 keyof 和映射类型约束更新字段，从不完整 JSON 中计算 dirty keys；运行时只允许白名单字段进入输出。',
    {
      id: 'typescript-final-keyof-guided',
      title: '跟做：按字段白名单生成差异',
      brief:
        'stdin 提供 before、patch 与 allowedKeys。以 keyof Account 建立白名单，只复制允许字段；输出 changedKeys 和下一版账户，未知键不得悄悄混入。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Account = {
  readonly id: string;
  readonly displayName: string;
  readonly active: boolean;
};
type AccountKey = keyof Account;
type AccountPatch = Partial<Account>;

const accountKeys = ['id', 'displayName', 'active'] as const satisfies readonly AccountKey[];

function isAccountKey(value: string): value is AccountKey {
  return accountKeys.includes(value as AccountKey);
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly before: Account;
  readonly patch: Record<string, unknown>;
  readonly allowedKeys: readonly string[];
};
const allowed = raw.allowedKeys.filter(isAccountKey);
const next: Record<string, unknown> = { ...raw.before };
const changedKeys: AccountKey[] = [];
for (const key of allowed) {
  if (!(key in raw.patch)) continue;
  if (raw.patch[key] !== raw.before[key]) {
    next[key] = raw.patch[key];
    changedKeys.push(key);
  }
}

console.log(JSON.stringify({ next, changedKeys }));
if (changedKeys.join(',') !== 'displayName,active') throw new Error('差异键错误');
if (next.displayName !== 'Ada Lovelace' || next.active !== false) throw new Error('字段更新错误');
`,
      },
      stdin:
        '{"before":{"id":"u1","displayName":"Ada","active":true},"patch":{"displayName":"Ada Lovelace","active":false,"role":"admin"},"allowedKeys":["displayName","role","active"]}',
      checkpoint:
        'changedKeys 必须为 displayName,active，未知 role 不得进入 next，退出码为 0。把 allowedKeys 加上 id 并修改 patch.id 应产生 id 差异；keyof 只约束编译期键，白名单仍需运行时校验。',
    },
    {
      id: 'typescript-final-keyof-independent',
      title: '独立实践：只序列化配置快照的公开字段',
      brief:
        'stdin 提供完整配置和公开字段列表。用 Partial 和 keyof 生成公开快照，保留 undefined 与缺失的区别，并把未知字段、私有字段和非法值逐项报告。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Config = {
  readonly region: string;
  readonly retries: number;
  readonly endpoint: string;
  readonly secret: string;
};
type PublicKey = keyof Omit<Config, 'secret'>;
type PublicSnapshot = Readonly<Partial<Pick<Config, PublicKey>>>;

const publicKeys = ['region', 'retries', 'endpoint'] as const satisfies readonly PublicKey[];

function snapshot(config: Config, requested: readonly unknown[]): {
  readonly value: PublicSnapshot;
  readonly issues: readonly string[];
} {
  const value: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const item of requested) {
    if (typeof item !== 'string') {
      issues.push('NON_STRING_KEY');
      continue;
    }
    if (item === 'secret') {
      issues.push('PRIVATE_KEY');
      continue;
    }
    if (!publicKeys.includes(item as PublicKey)) {
      issues.push('UNKNOWN_KEY:' + item);
      continue;
    }
    value[item] = config[item as PublicKey];
  }
  return { value: Object.freeze(value) as PublicSnapshot, issues: Object.freeze(issues) };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly config: Config;
  readonly requested: readonly unknown[];
};
if (typeof raw.config.retries !== 'number' || raw.config.retries < 0) throw new Error('retries 非法');
const result = snapshot(raw.config, raw.requested);
console.log(JSON.stringify(result));
if ('secret' in result.value) throw new Error('私有字段泄漏');
if (result.issues.join(',') !== 'PRIVATE_KEY,UNKNOWN_KEY:timeout') throw new Error('公开字段报告错误');
`,
      },
      stdin:
        '{"config":{"region":"cn-east","retries":3,"endpoint":"https://api.example.test","secret":"hidden"},"requested":["region","secret","timeout"]}',
      checkpoint:
        '输出只包含 region，issues 依次为 PRIVATE_KEY 与 UNKNOWN_KEY:timeout，退出码为 0。requested 加入 endpoint 后应输出 endpoint 且不产生问题；Omit 只是类型层限制，不能替代运行时拒绝 secret。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：条件类型、infer 与模板字面量': lab(
    'TS 进阶代码台 05 · 从路由模板恢复动作类型',
    '用模板字面量与条件类型表达 route:action，再在运行时解析、规范化和拒绝非法段落；同时验证 infer 不负责执行字符串分割。',
    {
      id: 'typescript-final-conditional-guided',
      title: '跟做：解析受约束的模板路由',
      brief:
        'stdin 是形如 orders:read 的路由。把 Resource 与 Action 建成模板联合；实现 runtime 分解器，校验两侧在允许集合内，并输出规范化路由。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Resource = 'orders' | 'users' | 'reports';
type Action = 'read' | 'write' | 'delete';
type Route = \`\${Resource}:\${Action}\`;
type RouteParts<T extends string> = T extends \`\${infer Left}:\${infer Right}\`
  ? readonly [Left, Right]
  : never;

const resources = ['orders', 'users', 'reports'] as const satisfies readonly Resource[];
const actions = ['read', 'write', 'delete'] as const satisfies readonly Action[];

function isResource(value: unknown): value is Resource {
  return typeof value === 'string' && resources.includes(value as Resource);
}

function isAction(value: unknown): value is Action {
  return typeof value === 'string' && actions.includes(value as Action);
}

function parseRoute(raw: string): Route {
  const parts = raw.trim().split(':');
  if (parts.length !== 2) throw new Error('route 必须包含一个冒号');
  const [resource, action] = parts;
  if (!isResource(resource) || !isAction(action)) throw new Error('route 段非法');
  return (resource + ':' + action) as Route;
}

const route = parseRoute(readFileSync(0, 'utf8'));
type ParsedExample = RouteParts<'orders:read'>;
const compileTimeShape: ParsedExample = ['orders', 'read'];
console.log(JSON.stringify({ route, compileTimeShape }));
if (route !== 'orders:read' || compileTimeShape[1] !== 'read') throw new Error('路由解析错误');
`,
      },
      stdin: ' orders:read ',
      checkpoint:
        '输出 route orders:read 与 compileTimeShape ["orders","read"]，退出码为 0。把 stdin 改成 orders: 应被运行时拒绝；把 RouteParts 改成只接受 users:read 时，应另用 tsc 观察 compileTimeShape 的类型错误，不能把这个断言冒充成运行检查。',
    },
    {
      id: 'typescript-final-conditional-independent',
      title: '独立实践：由事件后缀推导通知渠道',
      brief:
        'stdin 提供事件列表。把事件命名为 resource.event，以模板字面量联合限制 event；运行时生成 channel 映射，要求同一 resource 只允许已知 event，并拒绝双冒号。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Resource = 'order' | 'payment' | 'refund';
type Event = 'created' | 'failed' | 'succeeded';
type EventName = \`\${Resource}.\${Event}\`;
type Channel<T extends EventName> = T extends \`\${infer R}.\${Event}\`
  ? \`channel:\${R}\`
  : never;

const resources = ['order', 'payment', 'refund'] as const satisfies readonly Resource[];
const events = ['created', 'failed', 'succeeded'] as const satisfies readonly Event[];

function parseName(raw: unknown): EventName {
  if (typeof raw !== 'string') throw new Error('事件名必须是 string');
  const parts = raw.split('.');
  if (parts.length !== 2) throw new Error('事件名必须包含一个点');
  const [resource, event] = parts;
  if (!resources.includes(resource as Resource) || !events.includes(event as Event)) {
    throw new Error('事件段非法');
  }
  return (resource + '.' + event) as EventName;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是事件数组');
const names = raw.map(parseName);
const channels = names.map((name) => {
  const resource = name.split('.')[0] ?? '';
  return 'channel:' + resource;
});
type SampleChannel = Channel<'payment.succeeded'>;
const sample: SampleChannel = 'channel:payment';
console.log(JSON.stringify({ names, channels, sample }));
if (channels.join(',') !== 'channel:order,channel:payment') throw new Error('通知渠道推导错误');
`,
      },
      stdin: '["order.created","payment.succeeded"]',
      checkpoint:
        'names 为两个合法事件，channels 为 channel:order 与 channel:payment，sample 输出 channel:payment，退出码为 0。加入 order..created 应被拒绝；模板条件类型由 tsc 推导，运行代码仍必须自己 split 和校验。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：类型体操的边界与可读性': lab(
    'TS 进阶代码台 06 · 用简单类型表达清晰业务不变量',
    '比较“炫技型递归类型”和可读类型边界：运行时落实品牌、范围与互斥字段，类型声明保持业务语义，不把编译期复杂度当产品价值。',
    {
      id: 'typescript-final-type-gymnastics-guided',
      title: '跟做：把难以解释的类型拆回业务语言',
      brief:
        'stdin 提供订单金额和状态。把基础 string/number 收窄为 Money 与 OrderStatus；金额额度只允许正数，状态迁移只允许 draft 到 paid，输出拒绝原因。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Brand<T, Name extends string> = T & { readonly __brand: Name };
type MoneyCents = Brand<number, 'MoneyCents'>;
type OrderStatus = 'draft' | 'paid' | 'cancelled';

function money(value: unknown): MoneyCents {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    throw new Error('amountCents 必须为 1..1000000 的整数');
  }
  return value as MoneyCents;
}

function isStatus(value: unknown): value is OrderStatus {
  return value === 'draft' || value === 'paid' || value === 'cancelled';
}

function transition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (from === 'draft' && to === 'paid') return to;
  if (from === 'paid' && to === 'cancelled') return to;
  throw new Error('非法状态迁移 ' + from + ' -> ' + to);
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>;
if (!isStatus(raw.status) || !isStatus(raw.next)) throw new Error('状态必须是 OrderStatus');
const amount = money(raw.amountCents);
const next = transition(raw.status, raw.next);
console.log(JSON.stringify({ amountCents: amount, from: raw.status, to: next }));
if (next !== 'paid' || amount !== 2599) throw new Error('领域不变量执行错误');
`,
      },
      stdin: '{"amountCents":2599,"status":"draft","next":"paid"}',
      checkpoint:
        '输出 amountCents 2599、from draft、to paid，退出码为 0。把 next 改为 cancelled 应被 transition 拒绝；品牌类型需要运行时校验入口，单靠 Brand 交叉类型不会保护外部 JSON。',
    },
    {
      id: 'typescript-final-type-gymnastics-independent',
      title: '独立实践：简化互斥输入类型',
      brief:
        'stdin 提供两种上传方式之一：filePath 或 bytesBase64。用判别联合建模来源，运行时拒绝同时出现或全部缺失，再生成统一 UploadResult。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type UploadSource =
  | { readonly kind: 'file'; readonly filePath: string }
  | { readonly kind: 'bytes'; readonly bytesBase64: string };
type UploadResult = {
  readonly kind: UploadSource['kind'];
  readonly size: number;
  readonly normalized: string;
};

function parseSource(raw: unknown): UploadSource {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('source 必须是对象');
  const row = raw as Record<string, unknown>;
  const hasPath = row.filePath !== undefined;
  const hasBytes = row.bytesBase64 !== undefined;
  if (hasPath === hasBytes) throw new Error('filePath 与 bytesBase64 必须恰好提供一个');
  if (hasPath) {
    if (typeof row.filePath !== 'string' || !row.filePath.includes('/')) throw new Error('filePath 非法');
    return { kind: 'file', filePath: row.filePath };
  }
  if (typeof row.bytesBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.bytesBase64)) {
    throw new Error('bytesBase64 非法');
  }
  return { kind: 'bytes', bytesBase64: row.bytesBase64 };
}

function materialize(source: UploadSource): UploadResult {
  if (source.kind === 'file') {
    const normalized = source.filePath.replaceAll('\\\\', '/');
    return { kind: source.kind, size: Buffer.byteLength(normalized), normalized };
  }
  const size = Buffer.from(source.bytesBase64, 'base64').byteLength;
  return { kind: source.kind, size, normalized: 'base64:' + source.bytesBase64.length };
}

const source = parseSource(JSON.parse(readFileSync(0, 'utf8')) as unknown);
const result = materialize(source);
console.log(JSON.stringify(result));
if (result.kind !== 'bytes' || result.size !== 3 || result.normalized !== 'base64:4') {
  throw new Error('上传来源物化错误');
}
`,
      },
      stdin: '{"bytesBase64":"AQID"}',
      checkpoint:
        '输出 kind bytes、size 3、normalized base64:4，退出码为 0。同时提供 filePath 与 bytesBase64 必须失败；判别联合让分支更清晰，但运行时互斥检查仍不可省略。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：领域类型重构实验': lab(
    'TS 进阶代码台 07 · 从贫血记录重构订单领域',
    '把旧订单状态字符串、浮点金额和可选客户字段拆成受约束领域对象；先迁移并报告默认值，再验证状态迁移不修改旧快照。',
    {
      id: 'typescript-final-domain-refactor-guided',
      title: '跟做：从 LegacyOrder 构造 Order',
      brief:
        'stdin 是旧版订单。校验 id、整数分金额和非负数量，将 customer 缺失迁移为匿名客户，输出领域对象与迁移报告。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type LegacyOrder = {
  readonly id?: unknown;
  readonly amount?: unknown;
  readonly quantity?: unknown;
  readonly customer?: unknown;
};
type Customer = { readonly kind: 'anonymous' } | { readonly kind: 'named'; readonly name: string };
type Order = {
  readonly id: string;
  readonly amountCents: number;
  readonly quantity: number;
  readonly customer: Readonly<Customer>;
};
type Migration = { readonly order: Readonly<Order>; readonly defaults: readonly string[] };

function migrate(raw: unknown): Migration {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('order 必须是对象');
  const row = raw as LegacyOrder;
  if (typeof row.id !== 'string' || !/^o-[0-9]+$/.test(row.id)) throw new Error('id 非法');
  if (typeof row.amount !== 'number' || !Number.isInteger(row.amount) || row.amount <= 0) {
    throw new Error('amount 必须为正整数分');
  }
  if (typeof row.quantity !== 'number' || !Number.isInteger(row.quantity) || row.quantity <= 0) {
    throw new Error('quantity 必须为正整数');
  }
  const defaults: string[] = [];
  let customer: Customer;
  if (typeof row.customer === 'string' && row.customer.trim()) {
    customer = { kind: 'named', name: row.customer.trim() };
  } else {
    customer = { kind: 'anonymous' };
    defaults.push('customer=anonymous');
  }
  return {
    order: Object.freeze({
      id: row.id,
      amountCents: row.amount,
      quantity: row.quantity,
      customer: Object.freeze(customer),
    }),
    defaults: Object.freeze(defaults),
  };
}

const result = migrate(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(result));
if (result.order.amountCents !== 1250 || result.order.customer.kind !== 'anonymous') {
  throw new Error('订单迁移错误');
}
if (result.defaults.join(',') !== 'customer=anonymous') throw new Error('迁移报告错误');
`,
      },
      stdin: '{"id":"o-17","amount":1250,"quantity":2}',
      checkpoint:
        '输出 amountCents 1250、quantity 2、customer.kind anonymous、defaults 含 customer=anonymous，退出码为 0。把 amount 改为 12.5 应失败；customer 传空字符串也应走默认并留下报告。',
    },
    {
      id: 'typescript-final-domain-refactor-independent',
      title: '独立实践：不可变订单聚合与状态迁移',
      brief:
        'stdin 提供草稿订单和支付事件。实现 payDraft，返回新的 paid 订单并保留旧对象；重复支付、无客户和零金额都要形成明确错误。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type DraftOrder = {
  readonly kind: 'draft';
  readonly id: string;
  readonly amountCents: number;
  readonly customerId: string | null;
};
type PaidOrder = {
  readonly kind: 'paid';
  readonly id: string;
  readonly amountCents: number;
  readonly customerId: string;
  readonly paymentId: string;
};
type PayEvent = { readonly type: 'pay'; readonly paymentId: string };

function payDraft(order: DraftOrder, event: PayEvent): PaidOrder {
  if (order.amountCents <= 0 || !Number.isInteger(order.amountCents)) throw new Error('订单金额非法');
  if (order.customerId === null) throw new Error('支付前必须有客户');
  if (!/^pay-[0-9]+$/.test(event.paymentId)) throw new Error('paymentId 非法');
  return Object.freeze({
    kind: 'paid',
    id: order.id,
    amountCents: order.amountCents,
    customerId: order.customerId,
    paymentId: event.paymentId,
  });
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly order: DraftOrder;
  readonly event: PayEvent;
};
const before = JSON.stringify(raw.order);
const paid = payDraft(raw.order, raw.event);
console.log(JSON.stringify({ before, paid }));
if (paid.kind !== 'paid' || paid.paymentId !== 'pay-88') throw new Error('支付迁移错误');
if (JSON.stringify(raw.order) !== before) throw new Error('支付修改了旧订单');
`,
      },
      stdin:
        '{"order":{"kind":"draft","id":"o-3","amountCents":800,"customerId":"c-8"},"event":{"type":"pay","paymentId":"pay-88"}}',
      checkpoint:
        '输出 before 为原 draft JSON，paid 的 kind 为 paid、paymentId 为 pay-88，退出码为 0。把 customerId 改为 null 应失败；再次把 paid 对象交给 payDraft 时，类型与运行时都应阻止重复支付。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：Zod/Valibot 运行时解析': lab(
    'TS 进阶代码台 08 · 不依赖第三方库复现解析器契约',
    '用自定义 validator 表达 string、integer、object 和 discriminated union；重点学习安全解析返回 data 或 issues，而不是直接信任 TypeScript 断言。',
    {
      id: 'typescript-final-runtime-schema-guided',
      title: '跟做：实现最小 safeParse 管线',
      brief:
        'stdin 提供用户 JSON 与 schema 名称。按 schema 校验 id、email 字符串和 age 非负整数，返回 ok:true/data 或 ok:false/issues；不导入 Zod。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type User = {
  readonly id: string;
  readonly email: string;
  readonly age: number;
};
type ParseResult<T> =
  | { readonly ok: true; readonly data: Readonly<T> }
  | { readonly ok: false; readonly issues: readonly string[] };

function safeParseUser(raw: unknown): ParseResult<User> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: ['root:expected-object'] };
  }
  const row = raw as Record<string, unknown>;
  const issues: string[] = [];
  if (typeof row.id !== 'string' || !/^u-[0-9]+$/.test(row.id)) issues.push('id:invalid');
  if (typeof row.email !== 'string' || !row.email.includes('@')) issues.push('email:invalid');
  if (typeof row.age !== 'number' || !Number.isInteger(row.age) || row.age < 0) issues.push('age:invalid');
  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return {
    ok: true,
    data: Object.freeze({ id: row.id as string, email: row.email as string, age: row.age as number }),
  };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
const result = safeParseUser(raw);
if (!result.ok) {
  console.log(JSON.stringify(result));
  throw new Error(result.issues.join(','));
}
console.log(JSON.stringify(result));
if (result.data.id !== 'u-9' || result.data.age !== 31) throw new Error('用户解析错误');
`,
      },
      stdin: '{"id":"u-9","email":"ada@example.test","age":31}',
      checkpoint:
        '输出 ok true 与规范化用户对象，退出码为 0。把 age 改为 -1 应输出 issues ["age:invalid"] 并非零退出；没有 Zod 时也必须返回结构化 issues，而不是只抛一个无法定位的字符串。',
    },
    {
      id: 'typescript-final-runtime-schema-independent',
      title: '独立实践：判别联合的安全解析',
      brief:
        'stdin 提供 payment 事件数组。按 kind 区分 created、captured、refunded，对每个分支验证字段和金额范围；收集每个下标的 issues，不能因一条失败丢弃全部报告。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type PaymentEvent =
  | { readonly kind: 'created'; readonly id: string; readonly amountCents: number }
  | { readonly kind: 'captured'; readonly id: string; readonly providerId: string }
  | { readonly kind: 'refunded'; readonly id: string; readonly reason: 'fraud' | 'requested' };
type Issue = { readonly index: number; readonly issue: string };
type ParsedEvents = {
  readonly events: readonly PaymentEvent[];
  readonly issues: readonly Issue[];
};

function parseAt(value: unknown, index: number, issues: Issue[]): PaymentEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push({ index, issue: 'expected-object' });
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !/^p-[0-9]+$/.test(row.id)) {
    issues.push({ index, issue: 'bad-id' });
    return null;
  }
  if (row.kind === 'created') {
    if (typeof row.amountCents !== 'number' || !Number.isInteger(row.amountCents) || row.amountCents <= 0) {
      issues.push({ index, issue: 'bad-amount' });
      return null;
    }
    return { kind: row.kind, id: row.id, amountCents: row.amountCents };
  }
  if (row.kind === 'captured') {
    if (typeof row.providerId !== 'string' || !row.providerId) {
      issues.push({ index, issue: 'bad-provider' });
      return null;
    }
    return { kind: row.kind, id: row.id, providerId: row.providerId };
  }
  if (row.kind === 'refunded') {
    if (row.reason !== 'fraud' && row.reason !== 'requested') {
      issues.push({ index, issue: 'bad-reason' });
      return null;
    }
    return { kind: row.kind, id: row.id, reason: row.reason };
  }
  issues.push({ index, issue: 'unknown-kind' });
  return null;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是事件数组');
const events: PaymentEvent[] = [];
const issues: Issue[] = [];
raw.forEach((value, index) => {
  const event = parseAt(value, index, issues);
  if (event) events.push(event);
});
const result: ParsedEvents = Object.freeze({
  events: Object.freeze(events),
  issues: Object.freeze(issues),
});
console.log(JSON.stringify(result));
if (result.events.length !== 2 || result.issues[0]?.issue !== 'bad-amount') {
  throw new Error('事件安全解析错误');
}
`,
      },
      stdin:
        '[{"kind":"created","id":"p-1","amountCents":500},{"kind":"created","id":"p-2","amountCents":0},{"kind":"captured","id":"p-3","providerId":"prov-8"}]',
      checkpoint:
        '输出 2 个有效事件和 1 条 index 1 的 bad-amount，退出码为 0。再插入 kind checkout 应新增未知 kind 问题，并保留其余通过项；判别联合负责建模，逐分支安全解析负责证明。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：OpenAPI 契约与客户端生成': lab(
    'TS 进阶代码台 09 · 从 OpenAPI 摘要验证客户端契约',
    '读取精简的 OpenAPI JSON，检查 operationId、必填参数、响应码和 schema 引用；再比较两个版本，定位会让现有客户端失效的变化。',
    {
      id: 'typescript-final-openapi-guided',
      title: '跟做：校验生成前的 operation 摘要',
      brief:
        'stdin 提供 paths 与 components。遍历 GET /orders/{id}，要求 operationId、path 参数、200 JSON response 和可解析的 schema ref；输出缺失项而不是盲目生成。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Schema = { readonly type?: string; readonly \$ref?: string };
type Operation = {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name?: string; readonly in?: string; readonly required?: boolean }[];
  readonly responses?: Readonly<Record<string, {
    readonly content?: Readonly<Record<string, { readonly schema?: Schema }>>;
  }>>;
};
type Spec = {
  readonly paths: Readonly<Record<string, Readonly<Record<string, Operation>>>>;
  readonly components?: {
    readonly schemas?: Readonly<Record<string, Schema>>;
  };
};

function validate(spec: Spec): string[] {
  const operation = spec.paths['/orders/{id}']?.get;
  if (!operation) return ['missing GET /orders/{id}'];
  const issues: string[] = [];
  if (typeof operation.operationId !== 'string' || !operation.operationId) issues.push('missing operationId');
  const idParameter = operation.parameters?.find((item) => item.name === 'id' && item.in === 'path');
  if (!idParameter?.required) issues.push('path id must be required');
  const schema = operation.responses?.['200']?.content?.['application/json']?.schema;
  if (!schema) issues.push('missing 200 application/json schema');
  if (schema?.\$ref?.startsWith('#/components/schemas/')) {
    const name = schema.\$ref.slice('#/components/schemas/'.length);
    if (!spec.components?.schemas?.[name]) issues.push('unresolved schema ' + name);
  }
  return issues;
}

const spec = JSON.parse(readFileSync(0, 'utf8')) as Spec;
const issues = validate(spec);
console.log(JSON.stringify({ operationId: spec.paths['/orders/{id}']?.get?.operationId, issues }));
if (issues.length !== 0) throw new Error(issues.join(','));
`,
      },
      stdin:
        '{"paths":{"/orders/{id}":{"get":{"operationId":"getOrder","parameters":[{"name":"id","in":"path","required":true}],"responses":{"200":{"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Order"}}}}}}}},"components":{"schemas":{"Order":{"type":"object"}}}}',
      checkpoint:
        '输出 operationId getOrder、issues []，退出码为 0。删除 components.Order 应出现 unresolved schema Order；把 required 改成 false 应出现 path id must be required。生成器必须验证文档，而不是只复制类型。',
    },
    {
      id: 'typescript-final-openapi-independent',
      title: '独立实践：检查破坏性契约变化',
      brief:
        'stdin 提供 before、after 两份精简 schema。比较必填字段、字段类型和响应码，输出 breaking 与 additive 清单；只新增可选字段应保持兼容。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Field = { readonly type: 'string' | 'number' | 'boolean'; readonly required: boolean };
type Contract = {
  readonly fields: Readonly<Record<string, Field>>;
  readonly responseCodes: readonly string[];
};
type Diff = {
  readonly breaking: readonly string[];
  readonly additive: readonly string[];
};

function compare(before: Contract, after: Contract): Diff {
  const breaking: string[] = [];
  const additive: string[] = [];
  for (const [name, oldField] of Object.entries(before.fields)) {
    const newField = after.fields[name];
    if (!newField) {
      breaking.push('field-removed:' + name);
      continue;
    }
    if (oldField.type !== newField.type) breaking.push('field-type:' + name);
    if (!oldField.required && newField.required) breaking.push('field-now-required:' + name);
  }
  for (const [name, newField] of Object.entries(after.fields)) {
    const oldField = before.fields[name];
    if (!oldField) {
      additive.push('field-added:' + name + ':' + (newField.required ? 'required' : 'optional'));
      if (newField.required) breaking.push('required-field-added:' + name);
    } else if (oldField.required && !newField.required) {
      additive.push('field-relaxed:' + name);
    }
  }
  for (const code of before.responseCodes) {
    if (!after.responseCodes.includes(code)) breaking.push('response-removed:' + code);
  }
  for (const code of after.responseCodes) {
    if (!before.responseCodes.includes(code)) additive.push('response-added:' + code);
  }
  return { breaking: Object.freeze(breaking), additive: Object.freeze(additive) };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { readonly before: Contract; readonly after: Contract };
const diff = compare(raw.before, raw.after);
console.log(JSON.stringify(diff));
if (diff.breaking.join(',') !== 'field-type:amount' || diff.additive[0] !== 'field-added:note:optional') {
  throw new Error('契约差异判定错误');
}
`,
      },
      stdin:
        '{"before":{"fields":{"id":{"type":"string","required":true},"amount":{"type":"number","required":true}},"responseCodes":["200","404"]},"after":{"fields":{"id":{"type":"string","required":true},"amount":{"type":"string","required":true},"note":{"type":"string","required":false}},"responseCodes":["200","404","422"]}}',
      checkpoint:
        'breaking 只含 field-type:amount，additive 依次含 field-added:note:optional 与 response-added:422，退出码为 0。新增必填字段应同时进入 additive 和 breaking；兼容性不能只比较 JSON 键数量。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：版本兼容与弃用策略': lab(
    'TS 进阶代码台 10 · 保持旧客户端可读的双版本适配',
    '把内部领域响应分别投影为 v1 与 v2，验证旧字段的兼容别名和新字段的可选加入；弃用调用会被真实记录，而不是只靠注释。',
    {
      id: 'typescript-final-versioning-guided',
      title: '跟做：同源数据生成双版本响应',
      brief:
        'stdin 提供内部用户对象与 Accept-Version。由同一领域对象生成 v1 的 name 及 v2 的 displayName，保留旧别名并记录 v1 使用指标。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type DomainUser = {
  readonly id: string;
  readonly displayName: string;
  readonly locale: string;
};
type V1User = { readonly id: string; readonly name: string };
type V2User = { readonly id: string; readonly displayName: string; readonly locale: string };
type DeprecatedMetric = { readonly api: string; readonly count: number };

const metrics: DeprecatedMetric[] = [];

function recordDeprecated(api: string): void {
  const current = metrics.find((item) => item.api === api);
  if (current) current.count += 1;
  else metrics.push({ api, count: 1 });
}

function project(user: DomainUser, version: string): V1User | V2User {
  if (version === '1') {
    recordDeprecated('GET /users/:id v1');
    return { id: user.id, name: user.displayName };
  }
  if (version === '2') return { id: user.id, displayName: user.displayName, locale: user.locale };
  throw new Error('只支持 API v1/v2');
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly user: DomainUser;
  readonly requests: readonly string[];
};
const responses = raw.requests.map((version) => project(raw.user, version));
console.log(JSON.stringify({ responses, metrics }));
if (metrics[0]?.count !== 2) throw new Error('弃用指标错误');
if (!('name' in responses[0]!) || !('displayName' in responses[2]!)) throw new Error('双版本投影错误');
`,
      },
      stdin:
        '{"user":{"id":"u-7","displayName":"Ada","locale":"zh-CN"},"requests":["1","1","2"]}',
      checkpoint:
        '两个 v1 响应含 name，v2 响应含 displayName 与 locale，metrics 中 v1 计数为 2，退出码为 0。把 requests 加入 3 应失败；兼容别名只应在适配层出现，内部领域对象不应保存两套命名。',
    },
    {
      id: 'typescript-final-versioning-independent',
      title: '独立实践：SDK 能力协商与弃用窗口',
      brief:
        'stdin 提供客户端版本与请求能力。服务端只向支持者返回新字段，向旧版本保留别名；输出 negotiated、deprecatedHits 与响应，超过截止版本时拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Request = {
  readonly clientVersion: string;
  readonly wantsInsights: boolean;
};
type DomainReport = {
  readonly id: string;
  readonly totalCents: number;
  readonly insight: string;
};
type Response = {
  readonly id: string;
  readonly total: number;
  readonly insights?: string;
};

function major(version: string): number {
  const match = /^([1-9][0-9]*)\./.exec(version);
  if (!match) throw new Error('version 非法');
  return Number(match[1]);
}

function project(report: DomainReport, request: Request): {
  readonly response: Readonly<Response>;
  readonly deprecated: boolean;
} {
  const version = major(request.clientVersion);
  if (version < 2) throw new Error('v1 已结束支持');
  const supportsInsights = version >= 3;
  if (request.wantsInsights && !supportsInsights) {
    return {
      response: Object.freeze({ id: report.id, total: report.totalCents }),
      deprecated: true,
    };
  }
  return {
    response: Object.freeze({
      id: report.id,
      total: report.totalCents,
      ...(request.wantsInsights ? { insights: report.insight } : {}),
    }),
    deprecated: false,
  };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly report: DomainReport;
  readonly request: Request;
};
const result = project(raw.report, raw.request);
console.log(JSON.stringify(result));
if (result.deprecated || result.response.insights !== 'margin-up') throw new Error('能力协商错误');
`,
      },
      stdin:
        '{"report":{"id":"r-4","totalCents":12000,"insight":"margin-up"},"request":{"clientVersion":"3.2.0","wantsInsights":true}}',
      checkpoint:
        '输出 response.insights margin-up、deprecated false，退出码为 0。版本 2.0.0 请求 insights 时不应伪造新字段，应输出 deprecated true；版本 1.x 必须被明确拒绝。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：不可信输入端到端实验': lab(
    'TS 进阶代码台 11 · 从不可信请求走到领域结果',
    '把 HTTP 请求头、查询、JSON body 当作三层未知边界，依次完成认证、授权、限流和领域校验；任何一层失败都返回稳定错误码。',
    {
      id: 'typescript-final-untrusted-input-guided',
      title: '跟做：分层校验一个提款请求',
      brief:
        'stdin 含 token、tenantId、amountCents 和 idempotencyKey。先验证 token 对应角色，再拒绝跨租户、非正金额和重复请求，输出稳定结果对象。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Request = {
  readonly token?: unknown;
  readonly tenantId?: unknown;
  readonly amountCents?: unknown;
  readonly idempotencyKey?: unknown;
};
type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'BAD_AMOUNT' | 'BAD_IDEMPOTENCY';
type Result =
  | { readonly ok: true; readonly tenantId: string; readonly amountCents: number }
  | { readonly ok: false; readonly code: ErrorCode };

const seen = new Set<string>();

function handle(raw: unknown): Result {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'UNAUTHENTICATED' };
  const request = raw as Request;
  if (request.token !== 'bearer:ops') return { ok: false, code: 'UNAUTHENTICATED' };
  if (request.tenantId !== 't-alpha') return { ok: false, code: 'FORBIDDEN' };
  if (typeof request.amountCents !== 'number' || !Number.isInteger(request.amountCents) || request.amountCents <= 0) {
    return { ok: false, code: 'BAD_AMOUNT' };
  }
  if (typeof request.idempotencyKey !== 'string' || !/^idem-[a-z0-9]+$/.test(request.idempotencyKey)) {
    return { ok: false, code: 'BAD_IDEMPOTENCY' };
  }
  if (seen.has(request.idempotencyKey)) return { ok: false, code: 'BAD_IDEMPOTENCY' };
  seen.add(request.idempotencyKey);
  return { ok: true, tenantId: request.tenantId, amountCents: request.amountCents };
}

const request = JSON.parse(readFileSync(0, 'utf8')) as unknown;
const first = handle(request);
const duplicate = handle(request);
const report = { first, duplicate };
console.log(JSON.stringify(report));
if (!first.ok || first.amountCents !== 2500 || duplicate.ok) throw new Error('不可信请求处理错误');
`,
      },
      stdin:
        '{"token":"bearer:ops","tenantId":"t-alpha","amountCents":2500,"idempotencyKey":"idem-a1"}',
      checkpoint:
        '第一次 ok true 且 amountCents 2500，第二次因同幂等键返回 BAD_IDEMPOTENCY，退出码为 0。把 tenantId 改成 t-beta 应返回 FORBIDDEN；token、金额和幂等键的错误必须保留各自稳定错误码。',
    },
    {
      id: 'typescript-final-untrusted-input-independent',
      title: '独立实践：拒绝超界搜索请求并清洗结果',
      brief:
        'stdin 提供查询、分页、排序和字段列表。验证长度、页大小上限、排序枚举与公开字段；从内部记录投影结果，禁止把 passwordHash 或未知字段带出。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type SearchInput = {
  readonly query?: unknown;
  readonly page?: unknown;
  readonly pageSize?: unknown;
  readonly sort?: unknown;
  readonly fields?: unknown;
};
type RecordRow = {
  readonly id: string;
  readonly name: string;
  readonly team: string;
  readonly passwordHash: string;
};
type SearchPlan = {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
  readonly sort: 'name' | 'id';
  readonly fields: readonly ('id' | 'name' | 'team')[];
};
type SearchResult =
  | { readonly ok: true; readonly plan: Readonly<SearchPlan>; readonly rows: readonly Record<string, string>[] }
  | { readonly ok: false; readonly code: string };

const allowedFields = ['id', 'name', 'team'] as const;

function parse(raw: unknown): SearchPlan | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'BAD_REQUEST';
  const input = raw as SearchInput;
  if (typeof input.query !== 'string' || input.query.trim().length < 2 || input.query.length > 40) return 'BAD_QUERY';
  if (typeof input.page !== 'number' || !Number.isInteger(input.page) || input.page < 1) return 'BAD_PAGE';
  if (typeof input.pageSize !== 'number' || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 20) {
    return 'BAD_PAGE_SIZE';
  }
  if (input.sort !== 'name' && input.sort !== 'id') return 'BAD_SORT';
  if (!Array.isArray(input.fields) || input.fields.length === 0) return 'BAD_FIELDS';
  if (!input.fields.every((field) => typeof field === 'string' && allowedFields.includes(field as typeof allowedFields[number]))) {
    return 'BAD_FIELDS';
  }
  return {
    query: input.query.trim(),
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
    sort: input.sort,
    fields: Object.freeze([...(new Set(input.fields as readonly typeof allowedFields[number][]))]),
  };
}

function search(raw: unknown): SearchResult {
  const plan = parse(raw);
  if (typeof plan === 'string') return { ok: false, code: plan };
  const records: readonly RecordRow[] = [
    { id: 'u-2', name: 'Ada', team: 'core', passwordHash: 'secret-2' },
    { id: 'u-1', name: 'Ada', team: 'api', passwordHash: 'secret-1' },
  ];
  const sorted = [...records].sort((left, right) => left[plan.sort].localeCompare(right[plan.sort]));
  const rows = sorted.slice(plan.offset, plan.offset + plan.limit).map((record) =>
    Object.fromEntries(plan.fields.map((field) => [field, record[field]])),
  );
  return { ok: true, plan: Object.freeze(plan), rows };
}

const result = search(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(result));
if (!result.ok || result.rows.length !== 2 || 'passwordHash' in result.rows[0]!) {
  throw new Error('搜索边界失败');
}
if (Object.keys(result.rows[0]!).join(',') !== 'id,name') throw new Error('公开字段投影错误');
`,
      },
      stdin: '{"query":"Ada","page":1,"pageSize":10,"sort":"id","fields":["id","name"]}',
      checkpoint:
        '结果含两行，每行只有 id 与 name，退出码为 0。fields 加入 passwordHash 应返回 BAD_FIELDS；pageSize 改为 21 应返回 BAD_PAGE_SIZE。输入校验与输出投影必须同时存在。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：expect-type 与公开 API 类型测试': lab(
    'TS 进阶代码台 12 · 分开记录运行证据与类型证据',
    '在不安装 expect-type 的前提下设计 Assert、Equal 等类型断言，同时用真实运行时值验证返回结构；明确只有 tsc 才能证明类型相等。',
    {
      id: 'typescript-final-type-tests-guided',
      title: '跟做：为解析器建立双轨测试记录',
      brief:
        'stdin 提供合法标识符。实现 parseId，返回 readonly 对象；源文件内声明 type Assert<T extends true>，同时打印 runtimeEvidence。checkpoint 要求另跑 tsc。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type ParsedId = { readonly id: string; readonly numeric: number };

function parseId(raw: string): ParsedId {
  const match = /^id-([0-9]+)$/.exec(raw.trim());
  if (!match) throw new Error('id 格式非法');
  const parsed = Object.freeze({ id: raw.trim(), numeric: Number(match[1]) });
  return parsed;
}

const parsed = parseId(readFileSync(0, 'utf8'));
type ReturnShapeIsExact = Assert<Equal<ReturnType<typeof parseId>, ParsedId>>;
const runtimeEvidence: ReturnShapeIsExact = true;
console.log(JSON.stringify({ parsed, runtimeEvidence, note: 'type assertion requires tsc' }));
if (parsed.id !== 'id-82' || parsed.numeric !== 82 || !runtimeEvidence) {
  throw new Error('解析运行测试失败');
}
`,
      },
      stdin: 'id-82',
      checkpoint:
        '输出 parsed.id id-82、numeric 82、runtimeEvidence true，退出码为 0。这里运行成功只证明 parseId 行为；还必须用 tsc --noEmit 检查 ReturnShapeIsExact 与 Equal 的类型关系，不能把 true 常量说成运行时类型证明。',
    },
    {
      id: 'typescript-final-type-tests-independent',
      title: '独立实践：公开结果类型与错误的双轨测试',
      brief:
        'stdin 提供余额。构造 Result<Balance, LedgerError> 的 ok/error 两分支，运行时检查 tag、值和错误码；再加入 Awaited、ReturnType 与 Readonly 的类型断言，并明确 tsc 验证步骤。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Result<Value, Failure> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure };
type Balance = { readonly accountId: string; readonly cents: number };
type LedgerError = { readonly code: 'NEGATIVE_BALANCE' | 'ACCOUNT_LOCKED' };

function readBalance(raw: unknown): Promise<Result<Balance, LedgerError>> {
  if (typeof raw !== 'object' || raw === null) {
    return Promise.resolve({ ok: false, error: { code: 'ACCOUNT_LOCKED' } });
  }
  const cents = (raw as Record<string, unknown>).cents;
  if (typeof cents !== 'number' || !Number.isInteger(cents)) {
    return Promise.resolve({ ok: false, error: { code: 'NEGATIVE_BALANCE' } });
  }
  return Promise.resolve({ ok: true, value: Object.freeze({ accountId: 'a-1', cents }) });
}

const result = await readBalance(JSON.parse(readFileSync(0, 'utf8')) as unknown);
type ExactError = Assert<Equal<Awaited<ReturnType<typeof readBalance>>, Result<Balance, LedgerError>>>;
type PublicValue = Extract<Awaited<ReturnType<typeof readBalance>>, { readonly ok: true }>['value'];
type BalanceIsReadonly = Assert<Equal<keyof PublicValue, 'accountId' | 'cents'>>;
const runtimeEvidence: readonly [ExactError, BalanceIsReadonly] = [true, true];
console.log(JSON.stringify({ result, runtimeEvidence, note: 'run tsc --noEmit for type evidence' }));
if (!result.ok || result.value.cents !== 900) throw new Error('余额运行测试失败');
`,
      },
      stdin: '{"cents":900}',
      checkpoint:
        '输出 ok true、value.cents 900、runtimeEvidence [true,true]，退出码为 0。另用 tsc --noEmit 验证 ExactError 与 BalanceIsReadonly；把返回类型中的 Promise 去掉时，应让 Awaited 断言暴露问题，但不能伪造运行时报错。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：Project References 与构建顺序': lab(
    'TS 进阶代码台 13 · 从项目引用图计算构建顺序',
    '读取 projects 与 references，检查缺失引用和循环依赖，再生成稳定拓扑顺序；随后只重建受影响项目，验证增量边界。',
    {
      id: 'typescript-final-project-refs-guided',
      title: '跟做：拓扑排序 Project References',
      brief:
        'stdin 提供项目名和依赖数组。拒绝不存在依赖和环，按字典序稳定输出构建顺序；最后打印每个项目的直接依赖数量。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Project = {
  readonly name: string;
  readonly references: readonly string[];
};
type GraphResult =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly code: 'UNKNOWN_REF' | 'CYCLE'; readonly detail: string };

function buildOrder(projects: readonly Project[]): GraphResult {
  const names = new Set(projects.map((project) => project.name));
  for (const project of projects) {
    for (const reference of project.references) {
      if (!names.has(reference)) {
        return { ok: false, code: 'UNKNOWN_REF', detail: project.name + '->' + reference };
      }
    }
  }
  const byName = new Map(projects.map((project) => [project.name, project]));
  const state = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];
  function visit(name: string): boolean {
    if (state.get(name) === 'visiting') return false;
    if (state.get(name) === 'done') return true;
    state.set(name, 'visiting');
    const project = byName.get(name);
    if (!project) return false;
    for (const reference of [...project.references].sort()) {
      if (!visit(reference)) return false;
    }
    state.set(name, 'done');
    order.push(name);
    return true;
  }
  for (const name of [...names].sort()) {
    if (!visit(name)) return { ok: false, code: 'CYCLE', detail: name };
  }
  return { ok: true, order: Object.freeze(order) };
}

const projects = JSON.parse(readFileSync(0, 'utf8')) as readonly Project[];
if (!Array.isArray(projects)) throw new Error('stdin 必须是项目数组');
const result = buildOrder(projects);
console.log(JSON.stringify(result));
if (!result.ok || result.order.join(',') !== 'contracts,domain,app') throw new Error('项目构建顺序错误');
`,
      },
      stdin:
        '[{"name":"app","references":["domain","contracts"]},{"name":"domain","references":["contracts"]},{"name":"contracts","references":[]}]',
      checkpoint:
        '输出 order contracts,domain,app，退出码为 0。给 contracts 增加 app 依赖会形成 CYCLE；给 app 增加 missing 则返回 UNKNOWN_REF，不能继续生成不存在的构建任务。',
    },
    {
      id: 'typescript-final-project-refs-independent',
      title: '独立实践：传播增量失效',
      brief:
        'stdin 提供项目图和变更文件名。找出直接所属项目，再反向传播所有依赖者；输出去重后的待重建项目，顺序必须满足依赖在前。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Project = {
  readonly name: string;
  readonly root: string;
  readonly references: readonly string[];
};
type Input = {
  readonly projects: readonly Project[];
  readonly changed: readonly string[];
};

function affected(input: Input): string[] {
  const byName = new Map(input.projects.map((project) => [project.name, project]));
  const seed = new Set<string>();
  for (const file of input.changed) {
    const normalized = file.replaceAll('\\\\', '/');
    const project = input.projects.find((item) => normalized.startsWith(item.root + '/'));
    if (!project) throw new Error('未知变更文件 ' + file);
    seed.add(project.name);
  }
  const reverse = new Map<string, string[]>();
  for (const project of input.projects) reverse.set(project.name, []);
  for (const project of input.projects) {
    for (const dependency of project.references) reverse.get(dependency)?.push(project.name);
  }
  const dirty = new Set(seed);
  const queue = [...seed];
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name) continue;
    for (const dependent of reverse.get(name) ?? []) {
      if (!dirty.has(dependent)) {
        dirty.add(dependent);
        queue.push(dependent);
      }
    }
  }
  const result: string[] = [];
  function visit(name: string): void {
    const project = byName.get(name);
    if (!project) throw new Error('图中有未知项目');
    for (const dependency of project.references) {
      if (dirty.has(dependency) && !result.includes(dependency)) visit(dependency);
    }
    if (!result.includes(name)) result.push(name);
  }
  for (const name of [...dirty].sort()) visit(name);
  return result.filter((name) => dirty.has(name));
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as Input;
const order = affected(raw);
console.log(JSON.stringify({ affected: order }));
if (order.join(',') !== 'contracts,domain,app') throw new Error('增量失效传播错误');
`,
      },
      stdin:
        '{"projects":[{"name":"contracts","root":"packages/contracts","references":[]},{"name":"domain","root":"packages/domain","references":["contracts"]},{"name":"app","root":"apps/web","references":["domain"]},{"name":"docs","root":"docs","references":[]}],"changed":["packages/contracts/src/user.ts"]}',
      checkpoint:
        'affected 必须为 contracts,domain,app，docs 不得重建，退出码为 0。更改 apps/web 文件只应得到 app；更改未归属路径必须明确失败，不能静默忽略。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：多包仓库中的类型边界': lab(
    'TS 进阶代码台 14 · 检查 workspace 依赖是否越界',
    '读取 packages、依赖和 import 记录，拒绝未声明依赖、私有出口和跨包 src 路径；再生成合法的公开入口图。',
    {
      id: 'typescript-final-monorepo-boundary-guided',
      title: '跟做：定位跨包类型越界',
      brief:
        'stdin 提供包清单与 import 列表。检查每个 import 的包名、子路径和 exports；允许公开 dist 入口，拒绝 @acme/ui/src/internal。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type PackageInfo = {
  readonly name: string;
  readonly exports: readonly string[];
};
type Workspace = {
  readonly packages: readonly PackageInfo[];
  readonly imports: readonly { readonly from: string; readonly specifier: string }[];
};

function audit(workspace: Workspace): string[] {
  const byName = new Map(workspace.packages.map((item) => [item.name, item]));
  const issues: string[] = [];
  for (const entry of workspace.imports) {
    const parts = entry.specifier.split('/');
    const packageName = entry.specifier.startsWith('@')
      ? parts.slice(0, 2).join('/')
      : parts[0];
    const target = byName.get(packageName);
    if (!target) continue;
    const subpath = entry.specifier.slice(packageName.length) || '.';
    if (!target.exports.includes(subpath)) {
      issues.push(entry.from + ':unexported:' + entry.specifier);
    }
    if (entry.specifier.includes('/src/')) {
      issues.push(entry.from + ':source-import:' + entry.specifier);
    }
  }
  return issues;
}

const workspace = JSON.parse(readFileSync(0, 'utf8')) as Workspace;
const issues = audit(workspace);
console.log(JSON.stringify({ issues }));
if (issues.length !== 2 || !issues.every((item) => item.startsWith('apps/web:'))) {
  throw new Error('workspace 边界检查错误');
}
`,
      },
      stdin:
        '{"packages":[{"name":"@acme/ui","exports":[".","./tokens"]},{"name":"@acme/contracts","exports":["."]}],"imports":[{"from":"apps/web","specifier":"@acme/ui"},{"from":"apps/web","specifier":"@acme/ui/src/internal"},{"from":"apps/web","specifier":"@acme/contracts"}]}',
      checkpoint:
        'issues 必须同时包含 unexported 与 source-import，退出码为 0。把 ui 的 exports 加上 ./src/internal 仍不应允许 source-import；公开出口和物理目录是两道独立边界。',
    },
    {
      id: 'typescript-final-monorepo-boundary-independent',
      title: '独立实践：按公开依赖生成发布顺序',
      brief:
        'stdin 提供发布包、workspace 依赖和 private 标记。先验证依赖均已声明且非 private，再建立拓扑顺序；循环依赖或私有包被外部引用都要拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type WorkspacePackage = {
  readonly name: string;
  readonly private: boolean;
  readonly dependencies: readonly string[];
};
type ReleaseInput = {
  readonly packages: readonly WorkspacePackage[];
  readonly requested: readonly string[];
};
type ReleaseResult =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly reason: string };

function releaseOrder(input: ReleaseInput): ReleaseResult {
  const byName = new Map(input.packages.map((item) => [item.name, item]));
  for (const name of input.requested) {
    const item = byName.get(name);
    if (!item) return { ok: false, reason: 'UNKNOWN:' + name };
    if (item.private) return { ok: false, reason: 'PRIVATE:' + name };
    for (const dependency of item.dependencies) {
      if (!byName.has(dependency)) return { ok: false, reason: 'UNDECLARED:' + dependency };
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(name: string): string | null {
    if (visiting.has(name)) return name;
    if (visited.has(name)) return null;
    const item = byName.get(name);
    if (!item) return name;
    visiting.add(name);
    for (const dependency of item.dependencies) {
      if (byName.has(dependency)) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
    return null;
  }
  for (const name of input.requested) {
    const cycle = visit(name);
    if (cycle) return { ok: false, reason: 'CYCLE:' + cycle };
  }
  return { ok: true, order: Object.freeze(order) };
}

const result = releaseOrder(JSON.parse(readFileSync(0, 'utf8')) as ReleaseInput);
console.log(JSON.stringify(result));
if (!result.ok || result.order.join(',') !== '@acme/contracts,@acme/ui,@acme/web') {
  throw new Error('发布顺序错误');
}
`,
      },
      stdin:
        '{"packages":[{"name":"@acme/contracts","private":false,"dependencies":[]},{"name":"@acme/ui","private":false,"dependencies":["@acme/contracts"]},{"name":"@acme/web","private":false,"dependencies":["@acme/ui","@acme/contracts"]},{"name":"@acme/internal","private":true,"dependencies":[]}],"requested":["@acme/web"]}',
      checkpoint:
        'order 必须为 @acme/contracts,@acme/ui,@acme/web，退出码为 0。增加 @acme/internal 并声明为 web 依赖应返回 PRIVATE:@acme/internal；ui 反向依赖 web 应返回 CYCLE。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：tsup、rollup 与源码映射': lab(
    'TS 进阶代码台 15 · 验证构建产物与 source map 边界',
    '读取构建清单，检查 ESM/CJS、声明文件、入口字段和 source map 是否成套；再扫描 map 的 sources 与源码泄漏，防止发布一个无法调试或暴露私有路径的包。',
    {
      id: 'typescript-final-build-output-guided',
      title: '跟做：检查双格式构建清单',
      brief:
        'stdin 提供 package.json files、exports 和实际产物列表。验证 import、require、types 三类入口存在，检查 map 配套和路径穿越，输出发布阻断项。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

type Conditions = {
  readonly import?: string;
  readonly require?: string;
  readonly types?: string;
};
type BuildInput = {
  readonly exports: Readonly<Record<string, Conditions>>;
  readonly files: readonly string[];
};

function validate(input: BuildInput): string[] {
  const issues: string[] = [];
  const withoutDotSlash = (file: string): string => {
    const normalized = posix.normalize(file);
    return normalized.startsWith('./') ? normalized.slice(2) : normalized;
  };
  const files = new Set(input.files.map(withoutDotSlash));
  for (const [subpath, conditions] of Object.entries(input.exports)) {
    for (const condition of ['import', 'require', 'types'] as const) {
      const target = conditions[condition];
      if (typeof target !== 'string') {
        issues.push(subpath + ':missing-' + condition);
        continue;
      }
      const normalized = withoutDotSlash(target);
      if (!normalized.startsWith('dist/') || normalized.startsWith('../')) {
        issues.push(subpath + ':outside-dist-' + condition);
      }
      if (!files.has(normalized)) issues.push(subpath + ':file-not-built-' + normalized);
      if ((condition === 'import' || condition === 'require') && !files.has(normalized + '.map')) {
        issues.push(subpath + ':missing-map-' + normalized);
      }
    }
  }
  return issues;
}

const input = JSON.parse(readFileSync(0, 'utf8')) as BuildInput;
const issues = validate(input);
console.log(JSON.stringify({ issues }));
if (issues.length !== 0) {
  throw new Error('构建产物校验错误');
}
`,
      },
      stdin:
        '{"exports":{".":{"import":"./dist/index.js","require":"./dist/index.cjs","types":"./dist/index.d.ts"}},"files":["dist/index.js","dist/index.js.map","dist/index.cjs","dist/index.cjs.map","dist/index.d.ts"]}',
      checkpoint:
        'issues 必须为空，退出码为 0。删除 dist/index.cjs.map 应新增 missing-map；把 types 指向 src/index.ts 应新增 outside-dist 和 file-not-built，不能把源码路径当发布产物。',
    },
    {
      id: 'typescript-final-build-output-independent',
      title: '独立实践：审计 source map 的源码泄漏',
      brief:
        'stdin 提供 map 的 file、sources、sourcesContent 与 package sideEffects。拒绝绝对路径、父目录、内联机密和错误 file；输出发布计划和 tree-shaking 风险。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
        import { isAbsolute, posix } from 'node:path';

type SourceMap = {
  readonly file?: unknown;
  readonly sources?: unknown;
  readonly sourcesContent?: unknown;
};
type AuditInput = {
  readonly map: SourceMap;
  readonly expectedFile: string;
  readonly sideEffects: boolean;
};

function audit(input: AuditInput): string[] {
  const issues: string[] = [];
  if (input.map.file !== input.expectedFile) issues.push('WRONG_MAP_FILE');
  if (!Array.isArray(input.map.sources) || input.map.sources.length === 0) {
    issues.push('NO_SOURCES');
  } else {
    for (const source of input.map.sources) {
      if (typeof source !== 'string') {
        issues.push('NON_STRING_SOURCE');
        continue;
      }
      if (isAbsolute(source) || posix.normalize(source).startsWith('../')) issues.push('SOURCE_ESCAPES_ROOT');
      if (source.includes('secret') || source.includes('.env')) issues.push('PRIVATE_SOURCE');
    }
  }
  if (Array.isArray(input.map.sourcesContent)) {
    for (const content of input.map.sourcesContent) {
      if (typeof content !== 'string') continue;
      if (/API_KEY|PASSWORD|BEGIN PRIVATE KEY/.test(content)) issues.push('SECRET_IN_SOURCES_CONTENT');
    }
  }
  if (!input.sideEffects) issues.push('NO_SIDE_EFFECTS_DECLARATION');
  return issues;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as AuditInput;
const issues = audit(raw);
console.log(JSON.stringify({ issues, publishable: issues.length === 0 }));
if (issues.join(',') !== 'SOURCE_ESCAPES_ROOT,PRIVATE_SOURCE,SECRET_IN_SOURCES_CONTENT,NO_SIDE_EFFECTS_DECLARATION') {
  throw new Error('source map 审计错误');
}
`,
      },
      stdin:
        '{"map":{"file":"index.js","sources":["../src/secret.ts","src/client.ts"],"sourcesContent":["const API_KEY = \\"secret\\";"]},"expectedFile":"index.js","sideEffects":false}',
      checkpoint:
        '输出 SOURCE_ESCAPES_ROOT、PRIVATE_SOURCE、SECRET_IN_SOURCES_CONTENT、NO_SIDE_EFFECTS_DECLARATION，publishable false，退出码为 0。把 source 改成 src/client.ts 应移除前两项；source map 可用与可安全发布不是同一件事。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：声明产物与 API 兼容': lab(
    'TS 进阶代码台 16 · 比较公开声明与 API 报告',
    '从精简 .d.ts 文本提取导出符号与成员，检查新增必填参数、返回收窄、删除导出等破坏性变化；再生成可审查的 API 报告。',
    {
      id: 'typescript-final-api-report-guided',
      title: '跟做：提取公开声明摘要',
      brief:
        'stdin 提供 before、after 两段 .d.ts。解析 export function/interface/type，比较符号集合与函数参数数量；输出 added、removed、breaking。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Declaration = {
  readonly kind: 'function' | 'interface' | 'type';
  readonly name: string;
  readonly requiredParameters: number;
};

function summarize(source: string): Declaration[] {
  const results: Declaration[] = [];
  for (const line of source.split(/\\r?\\n/)) {
    const functionMatch = /^export (?:declare )?function ([A-Za-z0-9_]+)\\(([^)]*)\\)/.exec(line.trim());
    if (functionMatch) {
      const parameters = functionMatch[2]?.trim() ?? '';
      const required = parameters.length === 0
        ? 0
        : parameters.split(',').filter((parameter) => !parameter.includes('?') && !parameter.includes('=')).length;
      results.push({ kind: 'function', name: functionMatch[1]!, requiredParameters: required });
      continue;
    }
    const interfaceMatch = /^export interface ([A-Za-z0-9_]+)/.exec(line.trim());
    if (interfaceMatch) {
      results.push({ kind: 'interface', name: interfaceMatch[1]!, requiredParameters: 0 });
      continue;
    }
    const typeMatch = /^export type ([A-Za-z0-9_]+)/.exec(line.trim());
    if (typeMatch) results.push({ kind: 'type', name: typeMatch[1]!, requiredParameters: 0 });
  }
  return results;
}

function diff(beforeSource: string, afterSource: string): {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly breaking: readonly string[];
} {
  const before = summarize(beforeSource);
  const after = summarize(afterSource);
  const beforeMap = new Map(before.map((item) => [item.name, item]));
  const afterMap = new Map(after.map((item) => [item.name, item]));
  const added = after.filter((item) => !beforeMap.has(item.name)).map((item) => item.name);
  const removed = before.filter((item) => !afterMap.has(item.name)).map((item) => item.name);
  const breaking = [...removed.map((name) => 'removed:' + name)];
  for (const oldItem of before) {
    const newItem = afterMap.get(oldItem.name);
    if (!newItem) continue;
    if (oldItem.kind !== newItem.kind) breaking.push('kind:' + oldItem.name);
    if (oldItem.kind === 'function' && newItem.requiredParameters > oldItem.requiredParameters) {
      breaking.push('required-parameters:' + oldItem.name);
    }
  }
  return {
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    breaking: Object.freeze(breaking),
  };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { readonly before: string; readonly after: string };
const result = diff(raw.before, raw.after);
console.log(JSON.stringify(result));
if (result.added.join(',') !== 'formatMoney' || result.removed.join(',') !== 'legacyParse') {
  throw new Error('声明符号差异错误');
}
if (result.breaking.join(',') !== 'removed:legacyParse,required-parameters:parseUser') {
  throw new Error('破坏性 API 判定错误');
}
`,
      },
      stdin:
        '{"before":"export interface User { id: string }\\nexport function parseUser(raw: string): User\\nexport function legacyParse(raw: string): User\\n","after":"export interface User { id: string }\\nexport function parseUser(raw: string, strict: boolean): User\\nexport function formatMoney(cents: number): string\\n"}',
      checkpoint:
        'added 为 formatMoney，removed 为 legacyParse，breaking 含 removed:legacyParse 与 required-parameters:parseUser，退出码为 0。把新增参数改成 strict?: boolean 后不应再报 required-parameters；声明比较不能只看源码 diff 行号。',
    },
    {
      id: 'typescript-final-api-report-independent',
      title: '独立实践：生成发布报告与兼容结论',
      brief:
        'stdin 提供符号变化、成员变化和版本候选。按删除、签名收紧、成员新增规则生成报告，选择 patch/minor/major，并确保报告能追溯到每条公开变化。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Change =
  | { readonly kind: 'member-added'; readonly target: string; readonly optional: boolean }
  | { readonly kind: 'member-removed'; readonly target: string }
  | { readonly kind: 'signature-narrowed'; readonly target: string }
  | { readonly kind: 'docs-updated'; readonly target: string };
type Bump = 'patch' | 'minor' | 'major';
type ReleaseReport = {
  readonly bump: Bump;
  readonly breaking: readonly string[];
  readonly additive: readonly string[];
  readonly notes: readonly string[];
};

function classify(change: Change): Bump {
  if (change.kind === 'docs-updated') return 'patch';
  if (change.kind === 'member-added' && change.optional) return 'minor';
  return 'major';
}

function report(changes: readonly Change[]): ReleaseReport {
  const rank: readonly Bump[] = ['patch', 'minor', 'major'];
  let bump: Bump = 'patch';
  const breaking: string[] = [];
  const additive: string[] = [];
  const notes: string[] = [];
  for (const change of changes) {
    const current = classify(change);
    if (rank.indexOf(current) > rank.indexOf(bump)) bump = current;
    if (current === 'major') breaking.push(change.kind + ':' + change.target);
    if (current === 'minor') additive.push(change.kind + ':' + change.target);
    notes.push(change.kind + ':' + change.target + '=' + current);
  }
  return {
    bump,
    breaking: Object.freeze(breaking),
    additive: Object.freeze(additive),
    notes: Object.freeze(notes),
  };
}

const result = report(JSON.parse(readFileSync(0, 'utf8')) as readonly Change[]);
console.log(JSON.stringify(result));
if (result.bump !== 'major') throw new Error('版本结论错误');
if (result.breaking.join(',') !== 'member-removed:User.legacyId,signature-narrowed:parseUser') {
  throw new Error('破坏性变化报告错误');
}
`,
      },
      stdin:
        '[{"kind":"docs-updated","target":"README"},{"kind":"member-added","target":"User.locale","optional":true},{"kind":"member-removed","target":"User.legacyId"},{"kind":"signature-narrowed","target":"parseUser"}]',
      checkpoint:
        'bump 为 major，breaking 依次含 member-removed:User.legacyId 与 signature-narrowed:parseUser，notes 保留四条变化，退出码为 0。删除两个重大变化后应只剩 minor；新增必填成员也必须进入 breaking。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：ESLint、测试和发布流水线': lab(
    'TS 进阶代码台 17 · 用证据驱动发布门禁',
    '读取 lint、typecheck、test、build 的执行报告，检查退出码、错误数、覆盖率和构建哈希；任何一项缺失都不能被默认视为通过。',
    {
      id: 'typescript-final-release-gate-guided',
      title: '跟做：聚合质量门禁',
      brief:
        'stdin 提供四类命令结果与覆盖率。输出通过的 checks、阻断原因和 releaseAllowed；错误数、缺失检查或低于阈值的语句覆盖率都必须阻断。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type CheckName = 'lint' | 'typecheck' | 'test' | 'build';
type CheckResult = {
  readonly status: number;
  readonly errors: number;
};
type Input = {
  readonly checks: Partial<Record<CheckName, CheckResult>>;
  readonly statements: number;
};
type Gate = {
  readonly passed: readonly CheckName[];
  readonly blockers: readonly string[];
  readonly releaseAllowed: boolean;
};

const required: readonly CheckName[] = ['lint', 'typecheck', 'test', 'build'];

function evaluate(input: Input): Gate {
  const passed: CheckName[] = [];
  const blockers: string[] = [];
  for (const name of required) {
    const result = input.checks[name];
    if (!result) {
      blockers.push(name + ':missing');
      continue;
    }
    if (!Number.isInteger(result.status) || !Number.isInteger(result.errors) || result.errors < 0) {
      blockers.push(name + ':invalid-report');
      continue;
    }
    if (result.status !== 0 || result.errors !== 0) blockers.push(name + ':failed');
    else passed.push(name);
  }
  if (typeof input.statements !== 'number' || input.statements < 80) blockers.push('coverage:statements');
  return {
    passed: Object.freeze(passed),
    blockers: Object.freeze(blockers),
    releaseAllowed: blockers.length === 0,
  };
}

const gate = evaluate(JSON.parse(readFileSync(0, 'utf8')) as Input);
console.log(JSON.stringify(gate));
if (gate.releaseAllowed || gate.blockers.join(',') !== 'typecheck:failed,coverage:statements') {
  throw new Error('质量门禁聚合错误');
}
`,
      },
      stdin:
        '{"checks":{"lint":{"status":0,"errors":0},"typecheck":{"status":2,"errors":3},"test":{"status":0,"errors":0},"build":{"status":0,"errors":0}},"statements":76.4}',
      checkpoint:
        'passed 含 lint、test、build，blockers 为 typecheck:failed 与 coverage:statements，releaseAllowed false，退出码为 0。删除 build 报告应改为 build:missing；不能把未执行的检查默认为绿色。',
    },
    {
      id: 'typescript-final-release-gate-independent',
      title: '独立实践：生成可追溯的发布清单',
      brief:
        'stdin 提供 tarball 内容、lockfile 哈希和环境批准记录。拒绝源码/密钥进入包、缺失 lockfile、未批准环境和重复文件，再输出排序后的发布证据。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

type ReleaseInput = {
  readonly files: readonly string[];
  readonly lockfile: string;
  readonly approvedEnvironment: string;
  readonly requiredEnvironment: string;
};
type Evidence = {
  readonly files: readonly string[];
  readonly lockfileHash: string;
  readonly environment: string;
  readonly allowed: boolean;
  readonly blockers: readonly string[];
};

function release(input: ReleaseInput): Evidence {
  const blockers: string[] = [];
  const unique = new Set<string>();
  for (const file of input.files) {
    if (unique.has(file)) blockers.push('duplicate:' + file);
    unique.add(file);
    if (file.startsWith('src/') || (file.endsWith('.ts') && !file.endsWith('.d.ts'))) blockers.push('source:' + file);
    if (file.endsWith('.env') || file.includes('secret')) blockers.push('private:' + file);
  }
  if (!/^[a-f0-9]{64}$/.test(input.lockfile)) blockers.push('lockfile:invalid');
  if (input.approvedEnvironment !== input.requiredEnvironment) blockers.push('environment:unapproved');
  if (!input.files.some((file) => file.endsWith('.js'))) blockers.push('artifact:missing-js');
  return {
    files: Object.freeze([...unique].sort()),
    lockfileHash: /^[a-f0-9]{64}$/.test(input.lockfile)
      ? createHash('sha256').update(input.lockfile).digest('hex')
      : 'invalid',
    environment: input.approvedEnvironment,
    allowed: blockers.length === 0,
    blockers: Object.freeze(blockers),
  };
}

const evidence = release(JSON.parse(readFileSync(0, 'utf8')) as ReleaseInput);
console.log(JSON.stringify(evidence));
if (evidence.allowed || evidence.blockers.join(',') !== 'source:src/index.ts,private:dist/config.env,environment:unapproved') {
  throw new Error('发布清单证据错误');
}
if (!/^[a-f0-9]{64}$/.test(evidence.lockfileHash)) throw new Error('lockfile 哈希错误');
`,
      },
      stdin:
        '{"files":["dist/index.js","dist/index.d.ts","src/index.ts","dist/config.env"],"lockfile":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","approvedEnvironment":"staging","requiredEnvironment":"production"}',
      checkpoint:
        'blockers 必须为 source:src/index.ts、private:dist/config.env、environment:unapproved，allowed false，lockfileHash 为 64 位 SHA-256，退出码为 0。把环境批准改为 production 后仍应因源码和私密文件阻断；唯一修复路径是改内容，不是忽略报告。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：TypeScript 企业基础库毕业项目': lab(
    'TS 进阶代码台 18 · 毕业项目：完成一次端到端库验收',
    '把未知请求、领域校验、稳定结果、错误码、弃用能力和发布证据串起来；运行一次准入流程，所有结论都由具体数据驱动。',
    {
      id: 'typescript-final-capstone-guided',
      title: '跟做：从请求到可发布报告',
      brief:
        'stdin 提供 API 请求与 build 证据。先校验请求，再由领域函数生成 v2 结果；任何输入、schema 或发布门禁失败都要进入 blockers，并输出稳定拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Request = {
  readonly userId?: unknown;
  readonly amountCents?: unknown;
  readonly build?: {
    readonly lint?: unknown;
    readonly tests?: unknown;
    readonly types?: unknown;
  };
};
type UserBalance = {
  readonly version: 2;
  readonly userId: string;
  readonly amountCents: number;
};
type Outcome =
  | { readonly ok: true; readonly data: Readonly<UserBalance>; readonly releaseReady: boolean; readonly blockers: readonly string[] }
  | { readonly ok: false; readonly code: 'BAD_USER' | 'BAD_AMOUNT' | 'BAD_BUILD'; readonly blockers: readonly string[] };

function run(raw: unknown): Outcome {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'BAD_USER', blockers: ['request:not-object'] };
  }
  const request = raw as Request;
  if (typeof request.userId !== 'string' || !/^u-[0-9]+$/.test(request.userId)) {
    return { ok: false, code: 'BAD_USER', blockers: ['userId:invalid'] };
  }
  if (typeof request.amountCents !== 'number' || !Number.isInteger(request.amountCents) || request.amountCents < 0) {
    return { ok: false, code: 'BAD_AMOUNT', blockers: ['amountCents:invalid'] };
  }
  const build = request.build;
  if (!build || typeof build !== 'object') {
    return { ok: false, code: 'BAD_BUILD', blockers: ['build:missing'] };
  }
  const blockers: string[] = [];
  if (build.lint !== true) blockers.push('lint:failed');
  if (build.tests !== true) blockers.push('tests:failed');
  if (build.types !== true) blockers.push('types:failed');
  return {
    ok: true,
    data: Object.freeze({ version: 2, userId: request.userId, amountCents: request.amountCents }),
    releaseReady: blockers.length === 0,
    blockers: Object.freeze(blockers),
  };
}

const outcome = run(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(outcome));
if (!outcome.ok || outcome.data.userId !== 'u-12' || !outcome.releaseReady) {
  throw new Error('毕业项目准入失败');
}
`,
      },
      stdin:
        '{"userId":"u-12","amountCents":1800,"build":{"lint":true,"tests":true,"types":true}}',
      checkpoint:
        '输出 ok true、v2 用户余额、releaseReady true、blockers []，退出码为 0。把 types 改为 false 仍应 ok true 但 releaseReady false，并包含 types:failed；输入非法时则应在构造领域对象前拒绝。',
    },
    {
      id: 'typescript-final-capstone-independent',
      title: '独立实践：给出可审计的毕业发布结论',
      brief:
        'stdin 提供公开 API、迁移记录、契约测试、覆盖率、构建和回滚演练。逐项计算 blockers，生成 major/patch 建议、发布证据与演练结论；任何缺失证据都不能通过。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

type EvidenceInput = {
  readonly publicExports: readonly string[];
  readonly removedExports: readonly string[];
  readonly migrationNotes: boolean;
  readonly contractTests: number;
  readonly coverage: number;
  readonly buildArtifacts: readonly string[];
  readonly rollbackDrill: boolean;
};
type Verdict = {
  readonly recommendedBump: 'major' | 'patch';
  readonly blockers: readonly string[];
  readonly publishable: boolean;
  readonly evidenceHash: string;
};

function decide(input: EvidenceInput): Verdict {
  const blockers: string[] = [];
  if (input.publicExports.length === 0) blockers.push('public-exports:missing');
  if (input.removedExports.length > 0 && !input.migrationNotes) blockers.push('migration-notes:missing');
  if (!Number.isInteger(input.contractTests) || input.contractTests < 20) blockers.push('contract-tests:insufficient');
  if (typeof input.coverage !== 'number' || input.coverage < 85) blockers.push('coverage:below-85');
  if (!input.buildArtifacts.some((file) => file.endsWith('.js'))) blockers.push('esm:missing');
  if (!input.buildArtifacts.some((file) => file.endsWith('.d.ts'))) blockers.push('types:missing');
  if (!input.buildArtifacts.some((file) => file.endsWith('.map'))) blockers.push('source-map:missing');
  if (!input.rollbackDrill) blockers.push('rollback:not-drilled');
  const evidence = JSON.stringify({
    exports: [...input.publicExports].sort(),
    removed: [...input.removedExports].sort(),
    contractTests: input.contractTests,
    coverage: input.coverage,
    artifacts: [...input.buildArtifacts].sort(),
  });
  return {
    recommendedBump: input.removedExports.length > 0 ? 'major' : 'patch',
    blockers: Object.freeze(blockers),
    publishable: blockers.length === 0,
    evidenceHash: createHash('sha256').update(evidence).digest('hex'),
  };
}

const verdict = decide(JSON.parse(readFileSync(0, 'utf8')) as EvidenceInput);
console.log(JSON.stringify(verdict));
if (verdict.publishable || verdict.recommendedBump !== 'major') throw new Error('毕业发布结论错误');
if (verdict.blockers.join(',') !== 'coverage:below-85,rollback:not-drilled') {
  throw new Error('毕业项目阻断项错误');
}
`,
      },
      stdin:
        '{"publicExports":["parseUser","formatMoney"],"removedExports":["legacyParse"],"migrationNotes":true,"contractTests":24,"coverage":81.5,"buildArtifacts":["dist/index.js","dist/index.d.ts","dist/index.js.map"],"rollbackDrill":false}',
      checkpoint:
        'recommendedBump major、publishable false，blockers 为 coverage:below-85 与 rollback:not-drilled，evidenceHash 为 64 位 SHA-256，退出码为 0。覆盖率升到 85 且完成演练后应 publishable true；删除 map 仍必须阻断，不能只凭测试数量毕业。',
    },
  ),
};
