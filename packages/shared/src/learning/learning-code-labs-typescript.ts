import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const typescriptRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'TypeScript / Node.js 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 运行，命令为 node --experimental-strip-types main.ts。',
    '源码只使用可擦除类型语法；不使用 enum、namespace、参数属性或依赖运行时类型的装饰器。',
    'stdin 由任务提供；先运行起始代码，再根据 checkpoint 修改并复跑。',
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
 * TypeScript 独立语言课程的真实 Node.js 代码实验室。
 *
 * 所有课程键都逐字取自 handwritten/typescript.ts。实验只验证 Node 中
 * 可真实执行的类型建模、运行时校验和工程边界，不把编辑器红线的效果
 * 冒充成运行结果。
 */
export const LEARNING_CODE_LABS_TYPESCRIPT: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:TypeScript · 编译器、配置与第一个类型化项目：TypeScript 编译器与 JavaScript 运行时': lab(
    'TS 代码台 01 · 让类型擦除后的运行时自己作证',
    '读取运行时清单，用 unknown 边界校验节点版本与模块环境；再区分类型声明、类型断言和真正的运行时检查。',
    {
      id: 'typescript-compiler-runtime-guided',
      title: '跟做：从不可信清单建立 RuntimeFacts',
      brief:
        'stdin 是一段 JSON 清单。先把它保存为 unknown，再逐字段确认 nodeMajor 是整数；打印当前执行参数并断言 Node 24 的 strip-types 开关确实存在。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type RuntimeFacts = {
  readonly nodeMajor: number;
  readonly executable: string;
  readonly stripTypesEnabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
if (!isRecord(input) || typeof input.nodeMajor !== 'number' || !Number.isInteger(input.nodeMajor)) {
  throw new Error('清单缺少整数 nodeMajor');
}

const facts: RuntimeFacts = {
  nodeMajor: input.nodeMajor,
  executable: process.execPath,
  stripTypesEnabled: process.execArgv.includes('--experimental-strip-types'),
};

console.log(JSON.stringify(facts));
if (facts.nodeMajor < 24) throw new Error('本实验需要 Node 24 或更高版本');
if (!facts.stripTypesEnabled) throw new Error('请使用 --experimental-strip-types 启动');
console.log('类型擦除运行证据已保存');
`,
      },
      stdin: '{"nodeMajor":24}',
      checkpoint:
        '输出必须包含 nodeMajor 24、非空 executable 和 stripTypesEnabled true，最后出现“类型擦除运行证据已保存”，退出码为 0。把 nodeMajor 改成字符串后应被运行时检查拒绝，即使编辑器里的临时注解看起来合法。',
    },
    {
      id: 'typescript-compiler-runtime-independent',
      title: '独立实践：严格校验启动配置',
      brief:
        'stdin 提供环境、端口与超时。写一个 fromUnknown 解析器返回判别联合，不要用 as 跳过环境枚举和数值范围；再冻结配置并输出规范化结果。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Environment = 'development' | 'test' | 'production';
type Config = {
  readonly environment: Environment;
  readonly port: number;
  readonly timeoutMs: number;
};
type ParseResult =
  | { readonly ok: true; readonly value: Readonly<Config> }
  | { readonly ok: false; readonly error: string };

function parseEnvironment(value: unknown): Environment | undefined {
  return value === 'development' || value === 'test' || value === 'production' ? value : undefined;
}

function parseConfig(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'config 必须是对象' };
  }
  const row = raw as Record<string, unknown>;
  const environment = parseEnvironment(row.environment);
  if (environment === undefined) return { ok: false, error: 'environment 非法' };
  if (typeof row.port !== 'number' || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535) {
    return { ok: false, error: 'port 必须为 1..65535' };
  }
  if (typeof row.timeoutMs !== 'number' || row.timeoutMs <= 0) {
    return { ok: false, error: 'timeoutMs 必须为正数' };
  }
  return {
    ok: true,
    value: Object.freeze({ environment, port: row.port, timeoutMs: row.timeoutMs }),
  };
}

const result = parseConfig(JSON.parse(readFileSync(0, 'utf8')) as unknown);
if (!result.ok) throw new Error(result.error);
console.log(JSON.stringify(result.value));
if (result.value.environment !== 'production' || result.value.port !== 8080) {
  throw new Error('配置转换结果不符合预期');
}
`,
      },
      stdin: '{"environment":"production","port":8080,"timeoutMs":2500}',
      checkpoint:
        '输出 environment 为 production、port 为 8080、timeoutMs 为 2500，退出码为 0。把 environment 改成 qa 或把 port 改成 70000 时，程序必须返回 ok:false 并以明确错误退出，不能靠编辑器猜测输入合法性。',
    },
  ),

  'programming:TypeScript · 编译器、配置与第一个类型化项目：基础类型、推断与类型注解': lab(
    'TS 代码台 02 · 字面量、联合与 unknown 边界',
    '把文本协议拆成位置元组，再从不完整 JSON 中恢复窄化后的用户资料；练习推断、显式返回类型和空值分支。',
    {
      id: 'typescript-basic-types-guided',
      title: '跟做：解析固定位置的记录元组',
      brief:
        'stdin 使用竖线分隔 id、age、active。逐段解析成 readonly tuple，并用 satisfies 固定结果形状；遇到缺失字段或非法布尔值必须失败。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type UserRow = readonly [id: string, age: number, active: boolean];

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('active 只能是 true 或 false');
}

function parseRow(text: string): UserRow {
  const parts = text.trim().split('|');
  const id = parts[0];
  const ageText = parts[1];
  const activeText = parts[2];
  if (id === undefined || ageText === undefined || activeText === undefined) {
    throw new Error('记录必须包含三段');
  }
  const age = Number(ageText);
  if (!Number.isInteger(age) || age < 0) throw new Error('age 必须是非负整数');
  return [id, age, parseBoolean(activeText)] as const;
}

const row = parseRow(readFileSync(0, 'utf8'));
const summary = {
  id: row[0],
  isAdult: row[1] >= 18,
  active: row[2],
} satisfies Record<'id' | 'isAdult' | 'active', string | boolean>;

console.log(JSON.stringify(summary));
if (summary.id !== 'u-17' || !summary.isAdult || !summary.active) {
  throw new Error('记录解析结果错误');
}
`,
      },
      stdin: 'u-17|34|true',
      checkpoint:
        '输出必须含 id u-17、isAdult true、active true，退出码为 0。把 active 改为 yes 或减少一个竖线字段，程序应明确拒绝；这说明 tuple 注解不会替你执行解析。',
    },
    {
      id: 'typescript-basic-types-independent',
      title: '独立实践：从部分资料恢复完整 Profile',
      brief:
        'stdin 的概况可能缺少 age、displayName 或 roles。将输入视为 unknown，分别处理 undefined、null 与非法数组，构造不可变 Profile 并保留默认显示名。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Role = 'admin' | 'editor' | 'viewer';
type Profile = {
  readonly id: string;
  readonly displayName: string;
  readonly age: number | null;
  readonly roles: readonly Role[];
};

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('profile 必须是对象');
  }
  return value as Record<string, unknown>;
}

const raw = readRecord(JSON.parse(readFileSync(0, 'utf8')) as unknown);
if (typeof raw.id !== 'string' || raw.id.length === 0) throw new Error('id 非法');

const age = raw.age === undefined || raw.age === null
  ? null
  : typeof raw.age === 'number' && Number.isInteger(raw.age) && raw.age >= 0
    ? raw.age
    : (() => { throw new Error('age 非法'); })();

const roleInput = raw.roles === undefined ? [] : raw.roles;
if (!Array.isArray(roleInput) || !roleInput.every(isRole)) throw new Error('roles 非法');

const profile: Readonly<Profile> = Object.freeze({
  id: raw.id,
  displayName: typeof raw.displayName === 'string' && raw.displayName.trim() ? raw.displayName.trim() : '匿名用户',
  age,
  roles: Object.freeze([...roleInput]),
});

console.log(JSON.stringify(profile));
if (profile.displayName !== '匿名用户' || profile.age !== null || profile.roles.length !== 2) {
  throw new Error('默认值与角色恢复失败');
}
`,
      },
      stdin: '{"id":"u-9","displayName":"   ","roles":["editor","viewer"]}',
      checkpoint:
        '输出 displayName 为匿名用户、age 为 null、roles 为 editor 与 viewer，退出码为 0。把 roles 加入 guest 后应拒绝，不能把任意字符串自动当成 Role。',
    },
  ),

  'programming:TypeScript · 编译器、配置与第一个类型化项目：函数、对象、数组与元组': lab(
    'TS 代码台 03 · 参数契约、只读数组与元组',
    '用函数签名固定默认参数和返回位置，再对订单行数组做只读汇总，观察元组、数组与对象结构在运行时的真实边界。',
    {
      id: 'typescript-functions-tuples-guided',
      title: '跟做：缩放一个固定长度坐标',
      brief:
        'stdin 是 x,y 两个数。编写带默认倍率的函数，返回 readonly [number, number]；随后把数组改成普通 number[] 传入，记录类型契约与运行时长度检查的差别。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Point = readonly [x: number, y: number];

function scale(point: Point, factor = 2): Point {
  if (point.length !== 2 || !point.every(Number.isFinite)) {
    throw new Error('point 必须是两个有限数');
  }
  return [point[0] * factor, point[1] * factor] as const;
}

const values = readFileSync(0, 'utf8').trim().split(',').map(Number);
if (values.length !== 2) throw new Error('stdin 必须为 x,y');
const point = [values[0], values[1]] as Point;
const scaled = scale(point);

console.log('source=' + point.join(','));
console.log('scaled=' + scaled.join(','));
if (scaled[0] !== 6 || scaled[1] !== 8) throw new Error('缩放结果错误');
`,
      },
      stdin: '3,4',
      checkpoint:
        '输出 source=3,4 与 scaled=6,8，退出码为 0。把 stdin 改成三段后应在进入 scale 前失败；把返回结果尝试原地写入时，编辑器应阻止，但运行时数组本身并不会自动冻结。',
    },
    {
      id: 'typescript-functions-tuples-independent',
      title: '独立实践：只读订单行汇总',
      brief:
        'stdin 提供带 sku、unitCents、quantity 的行。用 readonly 数组参数和默认货币格式化函数汇总总额，确保函数不修改调用方数组，并验证重复 SKU 的数量合并。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type OrderLine = {
  readonly sku: string;
  readonly unitCents: number;
  readonly quantity: number;
};
type Summary = {
  readonly quantities: Readonly<Record<string, number>>;
  readonly totalCents: number;
};

function summarize(lines: readonly OrderLine[]): Summary {
  const quantities: Record<string, number> = {};
  let totalCents = 0;
  for (const line of lines) {
    if (!line.sku || !Number.isInteger(line.unitCents) || line.unitCents < 0) {
      throw new Error('订单行价格或 SKU 非法');
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error('数量必须为正整数');
    }
    quantities[line.sku] = (quantities[line.sku] ?? 0) + line.quantity;
    totalCents += line.unitCents * line.quantity;
  }
  return Object.freeze({ quantities: Object.freeze(quantities), totalCents });
}

function formatTotal(currency: string, ...amounts: readonly number[]): string {
  const cents = amounts.reduce((sum, amount) => sum + amount, 0);
  return currency + ' ' + (cents / 100).toFixed(2);
}

const input = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (!Array.isArray(input)) throw new Error('stdin 必须是订单行数组');
const lines: readonly OrderLine[] = input.map((value) => {
  if (typeof value !== 'object' || value === null) throw new Error('订单行非法');
  const row = value as Record<string, unknown>;
  if (typeof row.sku !== 'string' || typeof row.unitCents !== 'number' || typeof row.quantity !== 'number') {
    throw new Error('订单行字段缺失');
  }
  return { sku: row.sku, unitCents: row.unitCents, quantity: row.quantity };
});

const before = JSON.stringify(lines);
const result = summarize(lines);
console.log(formatTotal('CNY', result.totalCents));
console.log(JSON.stringify(result.quantities));
if (JSON.stringify(lines) !== before) throw new Error('汇总函数修改了调用方数组');
if (result.quantities['PEN'] !== 3 || result.totalCents !== 860) throw new Error('汇总结果错误');
`,
      },
      stdin: '[{"sku":"PEN","unitCents":120,"quantity":1},{"sku":"BOOK","unitCents":500,"quantity":1},{"sku":"PEN","unitCents":120,"quantity":2}]',
      checkpoint:
        '输出 CNY 8.60 和 {"PEN":3,"BOOK":1}，退出码为 0。把数量改成 0 应明确失败；调用前后 JSON 必须相同，证明 readonly 参数在实际算法边界内保持了不修改输入。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：联合、交叉与字面量类型': lab(
    'TS 代码台 04 · 标签联合与交叉授权',
    '构造可辨识事件联合，再用字面量角色和交叉类型组合权限；运行时仍逐项验证标签，演示类型写法与外部数据校验的分工。',
    {
      id: 'typescript-unions-guided',
      title: '跟做：按 kind 构造事件联合',
      brief:
        'stdin 给出事件 kind 与金额。根据 kind 走不同字段校验，返回只允许 created、paid 或 cancelled 的判别联合，并输出各分支的真实金额。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type OrderEvent =
  | { readonly kind: 'created'; readonly orderId: string; readonly amountCents: number }
  | { readonly kind: 'paid'; readonly orderId: string; readonly amountCents: number; readonly paidAt: string }
  | { readonly kind: 'cancelled'; readonly orderId: string; readonly reason: 'user' | 'timeout' };

type EventInput = {
  readonly kind: string;
  readonly orderId: string;
  readonly amountCents?: number;
  readonly paidAt?: string;
  readonly reason?: string;
};

function parseEvent(input: EventInput): OrderEvent {
  if (!input.orderId) throw new Error('orderId 必填');
  if (input.kind === 'created') {
    if (typeof input.amountCents !== 'number' || input.amountCents <= 0) throw new Error('created 金额非法');
    return { kind: 'created', orderId: input.orderId, amountCents: input.amountCents };
  }
  if (input.kind === 'paid') {
    if (typeof input.amountCents !== 'number' || input.amountCents <= 0 || !input.paidAt) {
      throw new Error('paid 字段不足');
    }
    return { kind: 'paid', orderId: input.orderId, amountCents: input.amountCents, paidAt: input.paidAt };
  }
  if (input.kind === 'cancelled') {
    if (input.reason !== 'user' && input.reason !== 'timeout') throw new Error('取消原因非法');
    return { kind: 'cancelled', orderId: input.orderId, reason: input.reason };
  }
  throw new Error('未知事件 kind');
}

const input = JSON.parse(readFileSync(0, 'utf8')) as EventInput;
const event = parseEvent(input);
function describe(eventValue: OrderEvent): string {
  switch (eventValue.kind) {
    case 'created': return 'created:' + eventValue.amountCents;
    case 'paid': return 'paid:' + eventValue.paidAt;
    case 'cancelled': return 'cancelled:' + eventValue.reason;
  }
}

console.log(describe(event));
if (event.kind !== 'paid' || event.amountCents !== 990) throw new Error('事件转换错误');
`,
      },
      stdin: '{"kind":"paid","orderId":"o-7","amountCents":990,"paidAt":"2026-11-24T09:00:00Z"}',
      checkpoint:
        '输出 paid:2026-11-24T09:00:00Z，退出码为 0。把 kind 改为 refund 应被运行时拒绝；若直接删掉 switch 分支，严格类型检查应暴露缺少返回值。',
    },
    {
      id: 'typescript-unions-independent',
      title: '独立实践：交叉权限与租户范围',
      brief:
        'stdin 是一份授权 JSON。把角色字面量、权限数组和 scope 通过交叉类型组合成 Grant，校验每个权限值并生成可读政策文本。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Role = 'owner' | 'editor' | 'viewer';
type Permission = 'read' | 'write' | 'delete';
type Scope = 'own' | 'tenant';
type Grant = {
  readonly role: Role;
  readonly permissions: readonly Permission[];
} & {
  readonly scope: Scope;
  readonly tenantId: string;
};

function isPermission(value: unknown): value is Permission {
  return value === 'read' || value === 'write' || value === 'delete';
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('授权必须是对象');
const row = raw as Record<string, unknown>;
if (row.role !== 'owner' && row.role !== 'editor' && row.role !== 'viewer') throw new Error('角色非法');
if (row.scope !== 'own' && row.scope !== 'tenant') throw new Error('scope 非法');
if (typeof row.tenantId !== 'string' || !row.tenantId) throw new Error('tenantId 缺失');
if (!Array.isArray(row.permissions) || !row.permissions.every(isPermission)) throw new Error('权限列表非法');

const grant: Grant = Object.freeze({
  role: row.role,
  permissions: Object.freeze([...row.permissions]),
  scope: row.scope,
  tenantId: row.tenantId,
});

const policy = grant.role + '@' + grant.tenantId + ':' + grant.scope + ':' + grant.permissions.join(',');
console.log(policy);
if (policy !== 'editor@t-2:tenant:read,write') throw new Error('授权政策生成错误');
`,
      },
      stdin: '{"role":"editor","permissions":["read","write"],"scope":"tenant","tenantId":"t-2"}',
      checkpoint:
        '输出 editor@t-2:tenant:read,write，退出码为 0。加入 execute 权限应被拒绝；把 scope 改成 global 也应失败，说明交叉类型不能替代外部输入校验。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：typeof、in、instanceof 与类型守卫': lab(
    'TS 代码台 05 · 三种守卫拆开未知值',
    '分别用 typeof、in 和 instanceof 处理字符串、日期、数组和错误对象；再设计带 kind 字段的错误联合，确保外部输入在访问字段前已被窄化。',
    {
      id: 'typescript-guards-guided',
      title: '跟做：让 JSON 值进入正确分支',
      brief:
        'stdin 是 JSON 字符串。判断它是 string、Date、数组还是带 kind 的对象，并为每一种分支输出一个稳定标签；未知结构直接失败。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (typeof value === 'string') return 'string:' + value.length;
  if (value instanceof Date) return 'date:' + value.toISOString();
  if (Array.isArray(value)) return 'array:' + value.length;
  if (isRecord(value) && 'kind' in value && typeof value.kind === 'string') {
    return 'tagged:' + value.kind;
  }
  throw new Error('无法识别值的结构');
}

const input = JSON.parse(readFileSync(0, 'utf8')) as unknown;
const label = describe(input);
console.log(label);
if (label !== 'string:5') throw new Error('守卫选择了错误分支');
`,
      },
      stdin: '"hello"',
      checkpoint:
        '输出 string:5，退出码为 0。把 stdin 改成 {"kind":7} 应进入失败分支而不是输出 tagged:undefined；把普通对象误当成 Date 也不会通过 instanceof。',
    },
    {
      id: 'typescript-guards-independent',
      title: '独立实践：错误联合的分类器',
      brief:
        'stdin 提供多个错误对象。为 validation、http 和 unknown 三种形状实现守卫，分别提取字段并生成汇总；未知 kind 必须进入 fallback。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ValidationError = { readonly kind: 'validation'; readonly field: string; readonly message: string };
type HttpError = { readonly kind: 'http'; readonly status: number; readonly url: string };
type UnknownError = { readonly kind: 'unknown'; readonly message: string };
type AppError = ValidationError | HttpError | UnknownError;

function isValidation(value: Record<string, unknown>): value is Record<string, unknown> & ValidationError {
  return value.kind === 'validation' && typeof value.field === 'string' && typeof value.message === 'string';
}

function isHttp(value: Record<string, unknown>): value is Record<string, unknown> & HttpError {
  return value.kind === 'http' && typeof value.status === 'number' && typeof value.url === 'string';
}

function classify(value: unknown): AppError {
  if (typeof value !== 'object' || value === null) return { kind: 'unknown', message: 'non-object' };
  const row = value as Record<string, unknown>;
  if (isValidation(row)) return { kind: 'validation', field: row.field, message: row.message };
  if (isHttp(row)) return { kind: 'http', status: row.status, url: row.url };
  return { kind: 'unknown', message: typeof row.message === 'string' ? row.message : 'unrecognized' };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (!Array.isArray(raw)) throw new Error('stdin 必须是数组');
const errors = raw.map(classify);
const counts = errors.reduce<Record<AppError['kind'], number>>(
  (result, error) => ({ ...result, [error.kind]: result[error.kind] + 1 }),
  { validation: 0, http: 0, unknown: 0 },
);

console.log(JSON.stringify(counts));
if (counts.validation !== 1 || counts.http !== 1 || counts.unknown !== 1) {
  throw new Error('错误分类数量错误');
}
`,
      },
      stdin: '[{"kind":"validation","field":"email","message":"invalid"},{"kind":"http","status":503,"url":"/api/orders"},{"kind":"socket","message":"closed"}]',
      checkpoint:
        '输出 {"validation":1,"http":1,"unknown":1}，退出码为 0。给 http 分支缺少 url，必须落入 unknown；这证明守卫应检查事实字段而不是只相信 kind 标签。',
    },
  ),

  'programming:TypeScript · 联合、收窄、泛型与工具类型：泛型约束、默认参数与推断': lab(
    'TS 代码台 06 · 让泛型约束出现在实际算法里',
    '用 keyof 约束安全取值，再实现只读分组与排序；泛型服务于输入关系，不在运行时生成类型。',
    {
      id: 'typescript-generics-guided',
      title: '跟做：安全挑选对象字段',
      brief:
        'stdin 包含 fields 与 profile。实现 pick<T, K extends keyof T>，调用方只能从现有键中取字段；缺失键要在运行时报告，而不是返回 undefined。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Profile = {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
};

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Readonly<Pick<T, K>> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (!(key in source)) throw new Error('缺少字段 ' + String(key));
    result[key] = source[key];
  }
  return Object.freeze(result);
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly fields: string[];
  readonly profile: Profile;
};
const allowed = ['id', 'name', 'active'] as const;
type AllowedField = (typeof allowed)[number];
function isAllowed(value: string): value is AllowedField {
  return allowed.includes(value as AllowedField);
}
if (!raw.fields.every(isAllowed)) throw new Error('fields 含未知键');
const fields: readonly AllowedField[] = raw.fields;
const selected = pick(raw.profile, fields);

console.log(JSON.stringify(selected));
if (selected.id !== 'p-1' || selected.active !== true) throw new Error('字段选择错误');
`,
      },
      stdin: '{"fields":["id","active"],"profile":{"id":"p-1","name":"Ada","active":true}}',
      checkpoint:
        '输出 {"id":"p-1","active":true}，退出码为 0。把 fields 改成 ["password"] 应被运行时允许列表拒绝；把 pick 调用换成不存在的键时，严格类型检查也应立即报错。',
    },
    {
      id: 'typescript-generics-independent',
      title: '独立实践：按键分组并稳定排序',
      brief:
        'stdin 给出多条记录。实现 groupBy<T, K extends keyof T> 和按数值字段排序的泛型函数，返回只读分组，验证原数组顺序没有被修改。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Row = {
  readonly team: string;
  readonly score: number;
  readonly name: string;
};

function groupBy<T, K extends keyof T>(items: readonly T[], key: K): Readonly<Record<string, readonly T[]>> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const group = String(item[key]);
    groups[group] = [...(groups[group] ?? []), item];
  }
  const frozen: Record<string, readonly T[]> = {};
  for (const [name, values] of Object.entries(groups)) frozen[name] = Object.freeze(values);
  return Object.freeze(frozen);
}

function sortNumeric<T, K extends keyof T>(items: readonly T[], key: K): readonly T[] {
  return [...items].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('排序字段必须是 number');
    return b - a;
  });
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (!Array.isArray(raw)) throw new Error('stdin 必须是数组');
const rows: readonly Row[] = raw.map((value) => {
  if (typeof value !== 'object' || value === null) throw new Error('行必须是对象');
  const row = value as Record<string, unknown>;
  if (typeof row.team !== 'string' || typeof row.score !== 'number' || typeof row.name !== 'string') {
    throw new Error('行字段非法');
  }
  return { team: row.team, score: row.score, name: row.name };
});

const original = rows.map((row) => row.name).join(',');
const groups = groupBy(rows, 'team');
const ranked = sortNumeric(rows, 'score');
console.log(JSON.stringify({ groups, ranking: ranked.map((row) => row.name) }));
if (rows.map((row) => row.name).join(',') !== original) throw new Error('算法修改了输入顺序');
if (ranked[0]?.name !== 'Ada' || groups.Red?.length !== 2) throw new Error('分组或排序错误');
`,
      },
      stdin: '[{"team":"Red","score":70,"name":"Lin"},{"team":"Blue","score":95,"name":"Ada"},{"team":"Red","score":88,"name":"Bo"}]',
      checkpoint:
        '输出 ranking 首位 Ada、groups.Red 长度为 2、groups.Blue 长度为 1，退出码为 0。把 sortNumeric 改为按 name 排序应触发运行时错误，而不是悄悄得到字符串差值。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：实体、值对象与标识符类型': lab(
    'TS 代码台 07 · 用品牌类型隔离租户和用户标识',
    '把普通字符串经过真实前缀校验后转换为 TenantId 和 UserId，再实现不可变的货币值对象加法；类型层隔离不能代替运行时验证。',
    {
      id: 'typescript-domain-ids-guided',
      title: '跟做：从原始记录签发品牌标识',
      brief:
        'stdin 提供 tenantId、userId 与 email。分别校验 t-、u- 前缀并转换为不同品牌类型，再把它们组装成 User 实体；直接交换两个 ID 在严格类型检查下应失败。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type TenantId = string & { readonly __brand: 'TenantId' };
type UserId = string & { readonly __brand: 'UserId' };
type User = {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly email: string;
};

function parseTenantId(value: unknown): TenantId {
  if (typeof value !== 'string' || !value.startsWith('t-') || value.length < 3) throw new Error('tenantId 非法');
  return value as TenantId;
}

function parseUserId(value: unknown): UserId {
  if (typeof value !== 'string' || !value.startsWith('u-') || value.length < 3) throw new Error('userId 非法');
  return value as UserId;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('用户必须是对象');
const row = raw as Record<string, unknown>;
if (typeof row.email !== 'string' || !row.email.includes('@')) throw new Error('email 非法');

const user: User = Object.freeze({
  tenantId: parseTenantId(row.tenantId),
  userId: parseUserId(row.userId),
  email: row.email.toLowerCase(),
});

console.log(user.tenantId + '/' + user.userId + '/' + user.email);
if (user.tenantId !== 't-acme' || user.userId !== 'u-42') throw new Error('实体标识错误');
`,
      },
      stdin: '{"tenantId":"t-acme","userId":"u-42","email":"ADA@Example.com"}',
      checkpoint:
        '输出 t-acme/u-42/ada@example.com，退出码为 0。把 userId 改成 t-acme 必须失败；在源码中把 tenantId 赋给 UserId 变量时，严格类型检查应报错，尽管两者运行时都是字符串。',
    },
    {
      id: 'typescript-domain-ids-independent',
      title: '独立实践：同币种金额值对象',
      brief:
        'stdin 提供币种和两笔整数分金额。实现 Money 值对象与 addMoney，要求币种一致、金额非负且结果不可变；再输出用错误币种相加时的受控失败。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Currency = 'CNY' | 'USD';
type Money = {
  readonly amountCents: number;
  readonly currency: Currency;
};

function money(amountCents: unknown, currency: unknown): Readonly<Money> {
  if (currency !== 'CNY' && currency !== 'USD') throw new Error('币种非法');
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('金额必须是非负安全整数分');
  }
  return Object.freeze({ amountCents, currency });
}

function addMoney(left: Money, right: Money): Readonly<Money> {
  if (left.currency !== right.currency) throw new Error('不能跨币种相加');
  return money(left.amountCents + right.amountCents, left.currency);
}

const input = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly amountA: number;
  readonly amountB: number;
  readonly currency: string;
};
const a = money(input.amountA, input.currency);
const b = money(input.amountB, input.currency);
const total = addMoney(a, b);

let rejected = false;
try {
  addMoney(a, money(100, 'USD'));
} catch {
  rejected = true;
}

console.log(JSON.stringify({ a, b, total, rejected }));
if (total.amountCents !== 1250 || total.currency !== 'CNY' || !rejected) {
  throw new Error('金额值对象结果错误');
}
`,
      },
      stdin: '{"amountA":500,"amountB":750,"currency":"CNY"}',
      checkpoint:
        '输出 total 为 1250 CNY、rejected 为 true，退出码为 0。把 amountB 改成 -1 或把 currency 改成 EUR 应被拒绝；直接修改 total 在类型层应报错，运行时对象也应由 Object.freeze 阻止。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：判别联合与状态机': lab(
    'TS 代码台 08 · 订单状态迁移只走合法边',
    '用判别联合表示订单状态和命令，把 transition 写成穷尽函数；每一步产生新状态与事件，非法迁移返回明确错误。',
    {
      id: 'typescript-state-machine-guided',
      title: '跟做：从 draft 到 paid 的单向迁移',
      brief:
        'stdin 提供当前订单和命令。实现 submit 与 pay 的合法迁移；重复 submit、从未提交直接 pay、以及未知命令都必须被拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type OrderState =
  | { readonly status: 'draft'; readonly orderId: string }
  | { readonly status: 'submitted'; readonly orderId: string; readonly submittedAt: string }
  | { readonly status: 'paid'; readonly orderId: string; readonly submittedAt: string; readonly paidAt: string };
type Command =
  | { readonly type: 'submit'; readonly at: string }
  | { readonly type: 'pay'; readonly at: string };

function transition(state: OrderState, command: Command): OrderState {
  if (command.type === 'submit') {
    if (state.status !== 'draft') throw new Error('只有 draft 可以 submit');
    return { status: 'submitted', orderId: state.orderId, submittedAt: command.at };
  }
  if (state.status !== 'submitted') throw new Error('只有 submitted 可以 pay');
  return { status: 'paid', orderId: state.orderId, submittedAt: state.submittedAt, paidAt: command.at };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly orderId: string;
  readonly commands: readonly Command[];
};
let state: OrderState = { status: 'draft', orderId: input.orderId };
for (const command of input.commands) state = transition(state, command);

console.log(JSON.stringify(state));
if (state.status !== 'paid' || state.paidAt !== '2026-11-24T10:00:00Z') {
  throw new Error('状态机没有到达 paid');
}
`,
      },
      stdin: '{"orderId":"o-100","commands":[{"type":"submit","at":"2026-11-24T09:00:00Z"},{"type":"pay","at":"2026-11-24T10:00:00Z"}]}',
      checkpoint:
        '输出 status 为 paid、保留 submittedAt 并包含 paidAt，退出码为 0。把命令顺序调换为 pay、submit 必须报错；给 OrderState 新增 refunded 分支而 transition 不处理时，strict tsc 应提示漏分支。',
    },
    {
      id: 'typescript-state-machine-independent',
      title: '独立实践：带历史记录的文章工作流',
      brief:
        'stdin 提供多步文章命令。实现 draft、review、published 三态迁移，每一步保留只读历史；非法 review 或 publish 要输出被拒绝步骤，而不是把状态推进到错误位置。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ArticleStatus = 'draft' | 'review' | 'published';
type Step = {
  readonly from: ArticleStatus;
  readonly to: ArticleStatus;
  readonly at: string;
};
type Workflow = {
  readonly articleId: string;
  readonly status: ArticleStatus;
  readonly history: readonly Step[];
};
type Move = { readonly action: 'review' | 'publish'; readonly at: string };

const allowed: Readonly<Record<ArticleStatus, readonly ArticleStatus[]>> = {
  draft: ['review'],
  review: ['published'],
  published: [],
};

function move(workflow: Workflow, instruction: Move): Workflow {
  const next: ArticleStatus = instruction.action === 'review' ? 'review' : 'published';
  if (!allowed[workflow.status].includes(next)) throw new Error('非法迁移 ' + workflow.status + '->' + next);
  return Object.freeze({
    ...workflow,
    status: next,
    history: Object.freeze([...workflow.history, { from: workflow.status, to: next, at: instruction.at }]),
  });
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly articleId: string;
  readonly moves: readonly Move[];
};
let workflow: Workflow = Object.freeze({ articleId: raw.articleId, status: 'draft', history: [] });
const rejected: string[] = [];
for (const instruction of raw.moves) {
  try {
    workflow = move(workflow, instruction);
  } catch (error) {
    rejected.push(error instanceof Error ? error.message : String(error));
  }
}

console.log(JSON.stringify({ workflow, rejected }));
if (workflow.status !== 'published' || workflow.history.length !== 2 || rejected.length !== 1) {
  throw new Error('文章工作流结果错误');
}
`,
      },
      stdin: '{"articleId":"a-3","moves":[{"action":"review","at":"09:00"},{"action":"publish","at":"09:10"},{"action":"publish","at":"09:20"}]}',
      checkpoint:
        'workflow.status 必须为 published、history 长度为 2、rejected 长度为 1，退出码为 0。第一次 publish 后再次 publish 应被记录为非法，不能复用旧对象或修改历史数组。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：只读结构、不可变更新与差异': lab(
    'TS 代码台 09 · 比较引用再验证不可变更新',
    '从只读设置生成新版本，保留旧对象并计算字段差异；再通过引用相等、Object.is 和冻结检查证明更新路径没有原地修改。',
    {
      id: 'typescript-readonly-guided',
      title: '跟做：替换一个设置而保留其余字段',
      brief:
        'stdin 提供原主题与目标主题。创建只读 Settings 更新对象，输出 unchanged、changed 与旧新对象引用比较；相同值时不产生无意义新对象。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Settings = {
  readonly theme: 'light' | 'dark';
  readonly locale: string;
  readonly notifications: boolean;
};

function withTheme(settings: Settings, theme: Settings['theme']): Settings {
  return settings.theme === theme ? settings : Object.freeze({ ...settings, theme });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly settings: Settings;
  readonly nextTheme: Settings['theme'];
};
const before = Object.freeze(input.settings);
const after = withTheme(before, input.nextTheme);
const sameValues = before.locale === after.locale && before.notifications === after.notifications;

console.log(JSON.stringify({
  unchanged: before === after,
  changedTheme: before.theme !== after.theme,
  sameOtherValues: sameValues,
  before,
  after,
}));
if (before.theme !== 'light' || after.theme !== 'dark' || !sameValues) throw new Error('不可变更新错误');
`,
      },
      stdin: '{"settings":{"theme":"light","locale":"zh-CN","notifications":true},"nextTheme":"dark"}',
      checkpoint:
        '输出 unchanged false、changedTheme true、sameOtherValues true，且 before.theme 仍为 light，退出码为 0。把 nextTheme 改成 light 后 unchanged 应为 true；可见不可变更新不是每次盲目复制。',
    },
    {
      id: 'typescript-readonly-independent',
      title: '独立实践：购物车增量与字段差异',
      brief:
        'stdin 提供只读购物车与 add 操作。生成新购物车、合并重复 SKU，并输出新增项和数量变化；旧快照必须保持完全不变。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type CartItem = { readonly sku: string; readonly quantity: number };
type Cart = { readonly ownerId: string; readonly items: readonly CartItem[] };
type AddOperation = { readonly sku: string; readonly quantity: number };
type Diff = { readonly added: readonly string[]; readonly quantityChanges: readonly string[] };

function addItems(cart: Cart, operations: readonly AddOperation[]): { readonly cart: Cart; readonly diff: Diff } {
  const quantities = new Map<string, number>();
  for (const item of cart.items) quantities.set(item.sku, item.quantity);
  for (const operation of operations) {
    if (!Number.isInteger(operation.quantity) || operation.quantity <= 0) throw new Error('数量非法');
    quantities.set(operation.sku, (quantities.get(operation.sku) ?? 0) + operation.quantity);
  }
  const added = operations.filter((operation) => !cart.items.some((item) => item.sku === operation.sku)).map((item) => item.sku);
  const quantityChanges = operations
    .filter((operation) => cart.items.some((item) => item.sku === operation.sku))
    .map((operation) => operation.sku);
  return {
    cart: Object.freeze({
      ownerId: cart.ownerId,
      items: Object.freeze([...quantities].map(([sku, quantity]) => Object.freeze({ sku, quantity }))),
    }),
    diff: Object.freeze({ added: Object.freeze(added), quantityChanges: Object.freeze(quantityChanges) }),
  };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { readonly cart: Cart; readonly operations: readonly AddOperation[] };
const originalSnapshot = JSON.stringify(raw.cart);
const result = addItems(raw.cart, raw.operations);
console.log(JSON.stringify(result.cart));
console.log(JSON.stringify(result.diff));
if (JSON.stringify(raw.cart) !== originalSnapshot) throw new Error('旧购物车被修改');
if (result.diff.added[0] !== 'NOTE' || result.cart.items.find((item) => item.sku === 'PEN')?.quantity !== 3) {
  throw new Error('购物车增量错误');
}
`,
      },
      stdin: '{"cart":{"ownerId":"u-1","items":[{"sku":"PEN","quantity":1}]},"operations":[{"sku":"PEN","quantity":2},{"sku":"NOTE","quantity":1}]}',
      checkpoint:
        '新购物车中 PEN 数量为 3、NOTE 数量为 1，diff.added 含 NOTE、diff.quantityChanges 含 PEN，且原快照 JSON 不变，退出码为 0。把操作数量改成 0 应拒绝。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：穷尽检查与 never 分支': lab(
    'TS 代码台 10 · 用 assertNever 锁住漏分支',
    '给几何联合实现面积计算，未知 kind 交由 assertNever；再从解析结果联合中消费成功和失败分支，验证穷尽处理。',
    {
      id: 'typescript-never-guided',
      title: '跟做：三种图形的面积分派',
      brief:
        'stdin 给出 circle 或 rect 的形状数据。实现 area(shape)，并在 default 调用 assertNever；输出面积和保留两位小数的文本。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly width: number; readonly height: number };

function assertNever(value: never): never {
  throw new Error('未处理的分支: ' + JSON.stringify(value));
}

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'rect': return shape.width * shape.height;
    default: return assertNever(shape);
  }
}

const input = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('形状必须是对象');
const row = input as Record<string, unknown>;
let shape: Shape;
if (row.kind === 'circle' && typeof row.radius === 'number') {
  shape = { kind: 'circle', radius: row.radius };
} else if (
  row.kind === 'rect' &&
  typeof row.width === 'number' &&
  typeof row.height === 'number'
) {
  shape = { kind: 'rect', width: row.width, height: row.height };
} else {
  throw new Error('形状字段非法');
}

const value = area(shape);
console.log(JSON.stringify({ kind: shape.kind, area: Number(value.toFixed(2)) }));
if (shape.kind !== 'rect' || value !== 24) throw new Error('面积计算错误');
`,
      },
      stdin: '{"kind":"rect","width":6,"height":4}',
      checkpoint:
        '输出 {"kind":"rect","area":24}，退出码为 0。给 Shape 增加 triangle 却不在 area 加分支时，strict tsc 应在 assertNever 处报错；运行时传入未知 kind 则应在构造阶段被拒绝。',
    },
    {
      id: 'typescript-never-independent',
      title: '独立实践：解析动作的完全分派',
      brief:
        'stdin 提供 create、update、archive 三类动作。解析器返回成功或失败联合，reducer 用 switch 穷尽处理；失败动作只累积错误，不改变当前记录。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Action =
  | { readonly type: 'create'; readonly title: string }
  | { readonly type: 'update'; readonly id: number; readonly title: string }
  | { readonly type: 'archive'; readonly id: number };
type ParseResult =
  | { readonly ok: true; readonly action: Action }
  | { readonly ok: false; readonly reason: string };
type State = { readonly records: Readonly<Record<number, string>>; readonly archived: readonly number[] };
type RawAction = { readonly type?: unknown; readonly id?: unknown; readonly title?: unknown };

function parseAction(value: unknown): ParseResult {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'not-object' };
  const row = value as RawAction;
  if (row.type === 'create' && typeof row.title === 'string' && row.title.length > 0) {
    return { ok: true, action: { type: 'create', title: row.title } };
  }
  if (row.type === 'update' && typeof row.id === 'number' && typeof row.title === 'string') {
    return { ok: true, action: { type: 'update', id: row.id, title: row.title } };
  }
  if (row.type === 'archive' && typeof row.id === 'number') {
    return { ok: true, action: { type: 'archive', id: row.id } };
  }
  return { ok: false, reason: 'invalid-' + String(row.type) };
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'create': {
      const nextId = Math.max(0, ...Object.keys(state.records).map(Number)) + 1;
      return Object.freeze({ ...state, records: Object.freeze({ ...state.records, [nextId]: action.title }) });
    }
    case 'update':
      if (!(action.id in state.records)) throw new Error('记录不存在');
      return Object.freeze({ ...state, records: Object.freeze({ ...state.records, [action.id]: action.title }) });
    case 'archive':
      if (!(action.id in state.records)) throw new Error('记录不存在');
      return Object.freeze({ ...state, archived: Object.freeze([...state.archived, action.id]) });
    default:
      return assertNeverAction(action);
  }
}

function assertNeverAction(action: never): never {
  throw new Error('未处理动作: ' + JSON.stringify(action));
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
let state: State = Object.freeze({ records: Object.freeze({}), archived: Object.freeze([]) });
const reasons: string[] = [];
for (const value of raw) {
  const result = parseAction(value);
  if (result.ok) state = reduce(state, result.action);
  else reasons.push(result.reason);
}

console.log(JSON.stringify({ state, reasons }));
if (state.archived.length !== 1 || reasons.length !== 1 || !reasons[0]?.startsWith('invalid-')) {
  throw new Error('动作归约结果错误');
}
`,
      },
      stdin: '[{"type":"create","title":"Draft"},{"type":"update","id":1,"title":"Ready"},{"type":"archive","id":1},{"type":"delete","id":1}]',
      checkpoint:
        'records 中 id 1 为 Ready、archived 含 1、reasons 长度为 1，退出码为 0。给 Action 增加 restore 但不处理时 assertNever 分支应让严格检查失败，不能依赖 default 吞掉未知命令。',
    },
  ),

  'programming:TypeScript · 领域建模与不可变状态：权限、租户与品牌类型': lab(
    'TS 代码台 11 · 租户上下文与授权矩阵',
    '把租户和用户标识保持为不同品牌类型，再以角色、资源和动作组成授权键；错误租户必须被拒绝，而非仅靠字符串相等。',
    {
      id: 'typescript-tenancy-brand-guided',
      title: '跟做：建立有租户的请求上下文',
      brief:
        'stdin 提供 tenant、user 和请求目标。校验 t-、u- 前缀后建立 RequestContext；跨租户读取必须返回 denied，并输出真实上下文键。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type TenantId = string & { readonly __entity: 'tenant' };
type UserId = string & { readonly __entity: 'user' };
type RequestContext = {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly resourceTenantId: TenantId;
};

function tenant(value: unknown): TenantId {
  if (typeof value !== 'string' || !/^t-[a-z0-9-]+$/.test(value)) throw new Error('租户标识非法');
  return value as TenantId;
}

function user(value: unknown): UserId {
  if (typeof value !== 'string' || !/^u-[a-z0-9-]+$/.test(value)) throw new Error('用户标识非法');
  return value as UserId;
}

const input = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly tenantId: unknown;
  readonly userId: unknown;
  readonly resourceTenantId: unknown;
};
const context: RequestContext = Object.freeze({
  tenantId: tenant(input.tenantId),
  userId: user(input.userId),
  resourceTenantId: tenant(input.resourceTenantId),
});
const allowed = context.tenantId === context.resourceTenantId;

console.log(JSON.stringify({
  contextKey: context.tenantId + '/' + context.userId,
  resourceTenant: context.resourceTenantId,
  allowed,
}));
if (context.tenantId !== 't-acme' || allowed) throw new Error('租户边界判断错误');
`,
      },
      stdin: '{"tenantId":"t-acme","userId":"u-9","resourceTenantId":"t-other"}',
      checkpoint:
        'contextKey 必须为 t-acme/u-9、resourceTenant 为 t-other、allowed 为 false，退出码为 0。把 resourceTenantId 改为 U-9 应被格式拒绝；两个品牌类型不能互相赋值。',
    },
    {
      id: 'typescript-tenancy-brand-independent',
      title: '独立实践：资源动作授权矩阵',
      brief:
        'stdin 提供角色、资源类型和动作。使用 readonly Record 表达管理员、编辑、查看者权限，输出允许或拒绝及匹配的规则；未知角色必须拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Role = 'admin' | 'editor' | 'viewer';
type Resource = 'document' | 'billing' | 'member';
type Action = 'read' | 'write' | 'delete';
type PermissionKey = \`\${Resource}:\${Action}\`;

const permissions: Readonly<Record<Role, ReadonlySet<PermissionKey>>> = Object.freeze({
  admin: new Set<PermissionKey>(['document:read', 'document:write', 'document:delete', 'billing:read', 'billing:write', 'member:read', 'member:write', 'member:delete']),
  editor: new Set<PermissionKey>(['document:read', 'document:write', 'member:read']),
  viewer: new Set<PermissionKey>(['document:read', 'member:read']),
});

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}
function isResource(value: unknown): value is Resource {
  return value === 'document' || value === 'billing' || value === 'member';
}
function isAction(value: unknown): value is Action {
  return value === 'read' || value === 'write' || value === 'delete';
}

const input = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof input !== 'object' || input === null) throw new Error('授权请求非法');
const row = input as Record<string, unknown>;
if (!isRole(row.role) || !isResource(row.resource) || !isAction(row.action)) {
  throw new Error('角色、资源或动作非法');
}
const key = (row.resource + ':' + row.action) as PermissionKey;
const allowed = permissions[row.role].has(key);

console.log(JSON.stringify({ role: row.role, resource: row.resource, action: row.action, key, allowed }));
if (row.role !== 'editor' || row.action !== 'delete' || allowed) throw new Error('授权矩阵结果错误');
`,
      },
      stdin: '{"role":"editor","resource":"billing","action":"delete"}',
      checkpoint:
        '输出 key 为 billing:delete、allowed 为 false，退出码为 0。把 role 改成 guest 应被拒绝；把 editor 的 member:read 删除后，相应检查点应变为拒绝，矩阵必须来自实际数据。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：请求、响应与领域类型分离': lab(
    'TS 代码台 12 · 在 wire DTO 与领域实体之间设边界',
    '先解析外部 snake_case DTO，再映射成内部 User，避免领域层依赖传输格式；随后处理分页响应并验证 cursor 与 items 的关系。',
    {
      id: 'typescript-api-dto-guided',
      title: '跟做：把 snake_case DTO 转成实体',
      brief:
        'stdin 提供 user_id、display_name、created_at。把输入保存为 unknown，逐字段检查类型和日期格式，再映射为 frozen User；不要在 DTO 对象上直接加业务方法。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type UserDto = {
  readonly user_id: string;
  readonly display_name: string;
  readonly created_at: string;
};
type User = {
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: Date;
};

function parseUserDto(raw: unknown): UserDto {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('DTO 必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.user_id !== 'string' || !row.user_id.startsWith('u-')) throw new Error('user_id 非法');
  if (typeof row.display_name !== 'string' || row.display_name.trim().length === 0) throw new Error('display_name 非法');
  if (typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) throw new Error('created_at 非法');
  return { user_id: row.user_id, display_name: row.display_name.trim(), created_at: row.created_at };
}

const dto = parseUserDto(JSON.parse(readFileSync(0, 'utf8')) as unknown);
const user: Readonly<User> = Object.freeze({
  id: dto.user_id,
  displayName: dto.display_name,
  createdAt: new Date(dto.created_at),
});

console.log(JSON.stringify({
  id: user.id,
  displayName: user.displayName,
  createdAt: user.createdAt.toISOString(),
}));
if (user.id !== 'u-5' || user.displayName !== 'Ada' || user.createdAt.getUTCFullYear() !== 2026) {
  throw new Error('DTO 映射错误');
}
`,
      },
      stdin: '{"user_id":"u-5","display_name":"  Ada  ","created_at":"2026-11-24T00:00:00Z"}',
      checkpoint:
        '输出 id 为 u-5、displayName 为 Ada、createdAt 为 2026-11-24T00:00:00.000Z，退出码为 0。把 user_id 改成 c-5 应拒绝；让领域对象直接暴露 user_id 会破坏分离边界。',
    },
    {
      id: 'typescript-api-dto-independent',
      title: '独立实践：分页响应与游标校验',
      brief:
        'stdin 是 API 分页包络。定义 ApiEnvelope<T>，校验 data、page、pageSize、total 与 nextCursor；当 pageSize 超限或 total 小于本页数量时失败，再映射为领域分页结果。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ApiEnvelope<T> = {
  readonly data: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly next_cursor: string | null;
};
type OrderDto = { readonly id: string; readonly amount_cents: number };
type Order = { readonly id: string; readonly amountCents: number };
type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null; readonly total: number };

function assertOrder(value: unknown): OrderDto {
  if (typeof value !== 'object' || value === null) throw new Error('订单项非法');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.amount_cents !== 'number' || row.amount_cents <= 0) {
    throw new Error('订单字段非法');
  }
  return { id: row.id, amount_cents: row.amount_cents };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown;
if (typeof raw !== 'object' || raw === null) throw new Error('响应不是对象');
const envelope = raw as Record<string, unknown>;
if (!Array.isArray(envelope.data)) throw new Error('data 必须是数组');
if (typeof envelope.page !== 'number' || envelope.page < 1) throw new Error('page 非法');
if (typeof envelope.pageSize !== 'number' || envelope.pageSize < 1 || envelope.pageSize > 100) throw new Error('pageSize 非法');
if (typeof envelope.total !== 'number' || envelope.total < envelope.data.length) throw new Error('total 与 data 不一致');
if (envelope.next_cursor !== null && typeof envelope.next_cursor !== 'string') throw new Error('next_cursor 非法');

const dto: ApiEnvelope<OrderDto> = {
  data: envelope.data.map(assertOrder),
  page: envelope.page,
  pageSize: envelope.pageSize,
  total: envelope.total,
  next_cursor: envelope.next_cursor,
};
const page: Page<Order> = Object.freeze({
  items: Object.freeze(dto.data.map((item) => Object.freeze({ id: item.id, amountCents: item.amount_cents }))),
  nextCursor: dto.next_cursor,
  total: dto.total,
});

console.log(JSON.stringify(page));
if (page.items[1]?.amountCents !== 990 || page.nextCursor !== 'cursor-2') throw new Error('分页领域映射错误');
`,
      },
      stdin: '{"data":[{"id":"o-1","amount_cents":500},{"id":"o-2","amount_cents":990}],"page":1,"pageSize":2,"total":5,"next_cursor":"cursor-2"}',
      checkpoint:
        '输出 items 含 o-1/o-2、nextCursor 为 cursor-2、total 为 5，退出码为 0。把 pageSize 改成 101 或 total 改成 1 必须失败；响应字段 snake_case 不应泄漏到领域层。',
    },
  ),

  'programming:TypeScript · API 契约、运行时校验与错误模型：错误码、结果类型与异常边界': lab(
    'TS 代码台 13 · 把异常收敛成可消费的 Result',
    '用成功/失败联合承载业务错误，在适配层捕获未知异常并规范化；调用方根据错误码分支，而不是解析字符串或依赖 throw。',
    {
      id: 'typescript-result-guided',
      title: '跟做：解析金额并返回明确错误码',
      brief:
        'stdin 提供带 amount 与 currency 的 JSON。实现 parseMoney 返回 Result，区分 INVALID_AMOUNT、INVALID_CURRENCY；成功和失败都不能靠抛任意字符串表达。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ErrorCode = 'INVALID_AMOUNT' | 'INVALID_CURRENCY';
type Money = { readonly amountCents: number; readonly currency: 'CNY' | 'USD' };
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ErrorCode; readonly detail: string };

function parseMoney(raw: unknown): Result<Money> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, code: 'INVALID_AMOUNT', detail: 'input must be object' };
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', detail: 'amount must be positive integer' };
  }
  if (row.currency !== 'CNY' && row.currency !== 'USD') {
    return { ok: false, code: 'INVALID_CURRENCY', detail: 'currency must be CNY or USD' };
  }
  return { ok: true, value: { amountCents: row.amount, currency: row.currency } };
}

const result = parseMoney(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(result));
if (result.ok || result.code !== 'INVALID_CURRENCY') throw new Error('错误码路由错误');
`,
      },
      stdin: '{"amount":500,"currency":"EUR"}',
      checkpoint:
        '输出 ok false、code INVALID_CURRENCY、detail 说明币种，退出码为 0。把 amount 改成 0 应改为 INVALID_AMOUNT；成功时输出 value，而不是同时保留 ok:false 和 value。',
    },
    {
      id: 'typescript-result-independent',
      title: '独立实践：异常适配器守住未知错误',
      brief:
        'stdin 提供若干失败描述。模拟 service 在运行时抛出 Error 或普通字符串，由 adapter 捕获 unknown 并映射成 TIMEOUT、CONFLICT、INTERNAL 三类结果；未知错误不能伪造原始异常类型。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type FailureCode = 'TIMEOUT' | 'CONFLICT' | 'INTERNAL';
type Failure = { readonly ok: false; readonly code: FailureCode; readonly message: string };

function runFailure(kind: string): never {
  if (kind === 'Error') throw new Error('deadline exceeded');
  if (kind === 'Conflict') {
    const error = new Error('duplicate order');
    error.name = 'ConflictError';
    throw error;
  }
  throw 'socket closed';
}

function adaptFailure(error: unknown): Failure {
  if (error instanceof Error) {
    if (error.name === 'ConflictError') return { ok: false, code: 'CONFLICT', message: error.message };
    if (error.message.includes('deadline')) return { ok: false, code: 'TIMEOUT', message: error.message };
    return { ok: false, code: 'INTERNAL', message: error.message };
  }
  return { ok: false, code: 'INTERNAL', message: typeof error === 'string' ? error : 'unknown failure' };
}

function execute(kind: string): Failure {
  try {
    return runFailure(kind);
  } catch (error: unknown) {
    return adaptFailure(error);
  }
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw) || !raw.every((value) => typeof value === 'string')) throw new Error('stdin 必须是字符串数组');
const failures = raw.map(execute);
const codes = failures.map((failure) => failure.code);

console.log(JSON.stringify(failures));
if (codes.join(',') !== 'TIMEOUT,CONFLICT,INTERNAL') throw new Error('异常映射顺序错误');
`,
      },
      stdin: '["Error","Conflict","Socket"]',
      checkpoint:
        '输出三个失败结果的 code 依次为 TIMEOUT、CONFLICT、INTERNAL，退出码为 0。把 catch 参数去掉 unknown 后 strict tsc 应提示隐式 any；在 catch 外直接读取 error.message 则不应通过类型检查。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：单元测试中的类型断言与边界': lab(
    'TS 代码台 14 · 类型断言函数与编译期等式测试',
    '用 asserts value is T 把未知值交给调用方，再用 Equal、Expect 和 ReturnType 编写会被擦除的类型测试；最后运行业务断言验证真实分支。',
    {
      id: 'typescript-type-tests-guided',
      title: '跟做：让断言函数和类型等式同时工作',
      brief:
        'stdin 是整数文本。实现 parseCount 和 assertCount，先用 type Equal 锁定返回类型，再运行 parseCount；非整数输入必须由运行时校验失败。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

function assertCount(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('count 必须是非负安全整数');
  }
}

function parseCount(text: string): number {
  const value: unknown = Number(text.trim());
  assertCount(value);
  return value;
}

type ParsedShape = ReturnType<typeof parseCount>;
type ParsedShapeTest = Expect<Equal<ParsedShape, number>>;
const compileTimeEvidence: ParsedShapeTest = true;

const count = parseCount(readFileSync(0, 'utf8'));
console.log(JSON.stringify({ count, compileTimeEvidence }));
if (count !== 42) throw new Error('运行时计数错误');
`,
      },
      stdin: '42',
      checkpoint:
        '输出 count 为 42、compileTimeEvidence 为 true，退出码为 0。把 ParsedShape 改成 string 时 strict tsc 应在 Equal 测试处报错；把 stdin 改成 -1 时运行时断言必须抛错。',
    },
    {
      id: 'typescript-type-tests-independent',
      title: '独立实践：小型契约测试夹具',
      brief:
        'stdin 是仓储响应。用泛型 assertRecord、类型相等测试和运行时 equals 组成小型测试夹具，覆盖成功、缺字段和错误类型三条边界。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type RepositoryResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly code: 'MISSING_ID' | 'WRONG_TYPE' };

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not record');
}

function decode(value: unknown): RepositoryResult {
  assertRecord(value);
  if (!('id' in value)) return { ok: false, code: 'MISSING_ID' };
  if (typeof value.id !== 'string') return { ok: false, code: 'WRONG_TYPE' };
  return { ok: true, id: value.id };
}

const result = decode(JSON.parse(readFileSync(0, 'utf8')) as unknown);
type ResultCheck = Assert<Equal<ReturnType<typeof decode>, RepositoryResult>>;
const typeEvidence: ResultCheck = true;

console.log(JSON.stringify({ result, typeEvidence }));
if (!result.ok || result.id !== 'r-8' || !typeEvidence) throw new Error('契约测试夹具失败');
`,
      },
      stdin: '{"id":"r-8"}',
      checkpoint:
        '输出 result.ok true、id 为 r-8、typeEvidence true，退出码为 0。把 stdin 改成 {} 应返回 MISSING_ID；把 id 改成 8 应返回 WRONG_TYPE。三种输入都应覆盖真实运行时路径。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：d.ts、declare 与第三方模块': lab(
    'TS 代码台 15 · 为第三方客户端写诚实适配层',
    '以声明文件中的最小公开形状驱动适配器，不假设包里有隐藏字段；再通过 interface 声明合并表达可选插件方法，并验证运行时确实存在。',
    {
      id: 'typescript-declarations-guided',
      title: '跟做：按公开 d.ts 形状适配第三方响应',
      brief:
        'stdin 模拟第三方 v1 响应。根据 ThirdPartyClient 的公开类型读取 ok 与 value；用运行时 guard 验证响应，再包装成内部 Result，绝不直接 as InternalResponse。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ThirdPartyResponse =
  | { readonly ok: true; readonly value: { readonly id: string } }
  | { readonly ok: false; readonly error: string };
type InternalResult =
  | { readonly success: true; readonly id: string }
  | { readonly success: false; readonly message: string };

function adaptResponse(raw: unknown): InternalResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('第三方响应必须是对象');
  }
  const row = raw as Record<string, unknown>;
  if (row.ok === true) {
    if (typeof row.value !== 'object' || row.value === null) throw new Error('公开声明要求 value 对象');
    const value = row.value as Record<string, unknown>;
    if (typeof value.id !== 'string') throw new Error('公开声明要求 id string');
    return { success: true, id: value.id };
  }
  if (row.ok === false && typeof row.error === 'string') {
    return { success: false, message: row.error };
  }
  throw new Error('响应不符合第三方 d.ts 的判别联合');
}

const result = adaptResponse(JSON.parse(readFileSync(0, 'utf8')) as unknown);
console.log(JSON.stringify(result));
if (!result.success || result.id !== 'remote-1') throw new Error('第三方响应适配错误');
`,
      },
      stdin: '{"ok":true,"value":{"id":"remote-1"},"trace":"ignored"}',
      checkpoint:
        '输出 success true 与 id remote-1，退出码为 0。把 value.id 改成 12 必须失败；d.ts 里声明的额外 trace 字段可以存在，但适配器不能假设它参与业务判断。',
    },
    {
      id: 'typescript-declarations-independent',
      title: '独立实践：声明合并与插件能力探测',
      brief:
        'stdin 提供插件名称和能力开关。用 interface HostPlugin 的两次声明合并出 name 和可选 trace 方法，运行时按 typeof 探测 trace；再输出每个插件的真实能力。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

interface HostPlugin {
  readonly name: string;
}

interface HostPlugin {
  readonly trace?: (event: string) => string;
}

function normalize(raw: unknown): HostPlugin {
  if (typeof raw !== 'object' || raw === null) throw new Error('插件必须是对象');
  const row = raw as Record<string, unknown>;
  if (typeof row.name !== 'string' || row.name.length === 0) throw new Error('插件 name 非法');
  if (typeof row.tracing !== 'boolean') throw new Error('tracing 必须是 boolean');
  return row.tracing
    ? { name: row.name, trace: (event: string) => row.name + ':' + event }
    : { name: row.name };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是插件数组');
const plugins = raw.map(normalize);
const capabilities = plugins.map((plugin) => ({
  name: plugin.name,
  tracing: typeof plugin.trace === 'function',
  sample: typeof plugin.trace === 'function' ? plugin.trace('boot') : null,
}));

console.log(JSON.stringify(capabilities));
if (!capabilities[0]?.tracing || capabilities[1]?.tracing) throw new Error('插件能力探测错误');
`,
      },
      stdin: '[{"name":"audit","tracing":true},{"name":"cache","tracing":false}]',
      checkpoint:
        '输出第一个插件 tracing true、sample 为 audit:boot，第二个插件 tracing false、sample 为 null，退出码为 0。把 tracing 改成字符串应被拒绝；编译期合并出的可选方法仍需运行时 typeof 探测。',
    },
  ),

  'programming:TypeScript · 测试、声明文件与迁移：allowJs、checkJs 与增量迁移': lab(
    'TS 代码台 16 · 给遗留 JavaScript 数据加类型门',
    '把未知 JSON 当作旧代码产物逐字段迁移，先保留兼容字段，再产出严格领域对象；用迁移报告记录默认值和被丢弃的非法字段。',
    {
      id: 'typescript-js-migration-guided',
      title: '跟做：从旧版用户对象迁出确定字段',
      brief:
        'stdin 是旧版用户对象。该对象可能使用 username、active 0/1 和缺失的 locale；请迁移为严格 User，并记录每项默认值来源，模拟 allowJs 到 checkJs 的边界。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type LegacyUser = {
  readonly username?: unknown;
  readonly active?: unknown;
  readonly locale?: unknown;
};
type User = {
  readonly name: string;
  readonly active: boolean;
  readonly locale: string;
};
type MigrationReport = {
  readonly applied: readonly string[];
  readonly user: User;
};

const raw = JSON.parse(readFileSync(0, 'utf8')) as LegacyUser;
const defaults: string[] = [];
if (typeof raw.username !== 'string' || raw.username.trim().length === 0) {
  throw new Error('旧版 username 是迁移前置条件');
}
if (raw.active !== 0 && raw.active !== 1 && typeof raw.active !== 'boolean') {
  throw new Error('active 只能为 0、1 或 boolean');
}
const active = raw.active === true || raw.active === 1;
let locale = 'zh-CN';
if (typeof raw.locale === 'string' && raw.locale.includes('-')) {
  locale = raw.locale;
} else {
  defaults.push('locale=zh-CN');
}

const report: MigrationReport = {
  applied: Object.freeze(defaults),
  user: Object.freeze({ name: raw.username.trim(), active, locale }),
};
console.log(JSON.stringify(report));
if (report.user.name !== 'Ada' || !report.user.active || report.applied[0] !== 'locale=zh-CN') {
  throw new Error('旧用户迁移错误');
}
`,
      },
      stdin: '{"username":" Ada ","active":1}',
      checkpoint:
        '输出 user.name 为 Ada、active true、locale zh-CN，applied 含 locale=zh-CN，退出码为 0。把 active 改成 yes 必须拒绝；旧字段 username 不应出现在最终 User 中。',
    },
    {
      id: 'typescript-js-migration-independent',
      title: '独立实践：兼容层与迁移报告',
      brief:
        'stdin 提供旧版订单字段 legacy_price、count 和 status。实现 migrateOrders，输出新订单、错误清单与默认值报告；保持输入只读，失败记录不能被丢弃。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type LegacyOrder = {
  readonly id?: unknown;
  readonly legacy_price?: unknown;
  readonly count?: unknown;
  readonly status?: unknown;
};
type Order = {
  readonly id: string;
  readonly unitCents: number;
  readonly quantity: number;
  readonly status: 'pending' | 'paid';
};
type MigrationReport = {
  readonly orders: readonly Order[];
  readonly errors: readonly string[];
  readonly defaultsApplied: number;
};

function migrateOrder(value: unknown, index: number): { readonly order?: Order; readonly error?: string; readonly defaults: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'row-' + index + ':not-object', defaults: 0 };
  }
  const row = value as LegacyOrder;
  if (typeof row.id !== 'string' || !row.id) return { error: 'row-' + index + ':missing-id', defaults: 0 };
  if (typeof row.legacy_price !== 'number' || !Number.isInteger(row.legacy_price) || row.legacy_price < 0) {
    return { error: 'row-' + index + ':bad-price', defaults: 0 };
  }
  if (typeof row.count !== 'number' || !Number.isInteger(row.count) || row.count <= 0) {
    return { error: 'row-' + index + ':bad-count', defaults: 0 };
  }
  const status = row.status === 'paid' ? 'paid' : 'pending';
  return {
    order: { id: row.id, unitCents: row.legacy_price, quantity: row.count, status },
    defaults: row.status === 'paid' ? 0 : 1,
  };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly unknown[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是旧订单数组');
const orders: Order[] = [];
const errors: string[] = [];
let defaultsApplied = 0;
raw.forEach((value, index) => {
  const result = migrateOrder(value, index);
  if (result.order) orders.push(result.order);
  if (result.error) errors.push(result.error);
  defaultsApplied += result.defaults;
});
const report: MigrationReport = Object.freeze({
  orders: Object.freeze(orders),
  errors: Object.freeze(errors),
  defaultsApplied,
});

console.log(JSON.stringify(report));
if (report.orders.length !== 1 || report.errors.length !== 1 || report.defaultsApplied !== 1) {
  throw new Error('订单迁移报告错误');
}
`,
      },
      stdin: '[{"id":"o-1","legacy_price":500,"count":2},{"id":"o-2","legacy_price":"500","count":1}]',
      checkpoint:
        '输出 1 个 pending 订单、1 条 bad-price 错误、defaultsApplied 为 1，退出码为 0。把合法行价格改为整数 500 且 status 为 paid 时默认值应减少，报告必须随真实数据变化。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：package exports 和模块解析': lab(
    'TS 代码台 17 · 解析 package exports 条件表',
    '读取包清单中的主入口和子路径，验证 types、import、require 条件是否存在；再模拟消费者按子路径解析，避免源码路径绕过 tarball。',
    {
      id: 'typescript-package-exports-guided',
      title: '跟做：检查 exports 的公开子路径',
      brief:
        'stdin 是 package.json 摘要。遍历 exports，只允许 . 和 ./schema，检查每项的类型、ESM 路径及路径穿越；输出通过项和错误项。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

type ExportConditions = {
  readonly types?: unknown;
  readonly import?: unknown;
};
type ExportMap = Readonly<Record<string, ExportConditions>>;

function validateExport(name: string, value: unknown): string[] {
  const issues: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [name + ':not-record'];
  const row = value as Record<string, unknown>;
  if (typeof row.types !== 'string' || !row.types.startsWith('./dist/') || !row.types.endsWith('.d.ts')) {
    issues.push(name + ':bad-types');
  }
  if (typeof row.import !== 'string' || !row.import.startsWith('./dist/') || posix.normalize(row.import).startsWith('../')) {
    issues.push(name + ':bad-import');
  }
  return issues;
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { readonly exports: ExportMap };
const entries = Object.entries(raw.exports);
const issues = entries.flatMap(([name, value]) => validateExport(name, value));
const unsupported = entries.map(([name]) => name).filter((name) => name !== '.' && name !== './schema');
unsupported.forEach((name) => issues.push(name + ':unsupported-subpath'));

console.log(JSON.stringify({ subpaths: entries.map(([name]) => name), issues }));
if (issues.length !== 1 || !issues[0]?.endsWith('bad-import')) throw new Error('exports 校验结果错误');
`,
      },
      stdin: '{"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./schema":{"types":"./dist/schema.d.ts","import":"../outside.js"}}}',
      checkpoint:
        'stdin 必须包含可解析的 package.exports；输出 issues 只有 ./schema:bad-import，退出码为 0。把 ./schema 改为 ./internal 应新增 unsupported-subpath；类型声明不能指向 src。',
    },
    {
      id: 'typescript-package-exports-independent',
      title: '独立实践：按条件解析消费者入口',
      brief:
        'stdin 提供 exports 与两种消费者模式。实现 resolveExport，按 import 或 require 条件返回 dist 文件；缺失条件、路径穿越和未声明子路径都要形成消费者错误。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

type Conditions = { readonly import?: string; readonly require?: string };
type Consumer = { readonly subpath: string; readonly mode: 'import' | 'require' };
type Resolution =
  | { readonly ok: true; readonly consumer: Consumer; readonly target: string }
  | { readonly ok: false; readonly consumer: Consumer; readonly reason: string };

function resolveExport(exports: Readonly<Record<string, Conditions>>, consumer: Consumer): Resolution {
  const conditions = exports[consumer.subpath];
  if (!conditions) return { ok: false, consumer, reason: 'UNEXPORTED_SUBPATH' };
  const target = conditions[consumer.mode];
  if (typeof target !== 'string') return { ok: false, consumer, reason: 'MISSING_CONDITION' };
  if (!target.startsWith('./dist/') || posix.normalize(target).startsWith('../')) {
    return { ok: false, consumer, reason: 'ESCAPES_PACKAGE' };
  }
  return { ok: true, consumer, target };
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as {
  readonly exports: Readonly<Record<string, Conditions>>;
  readonly consumers: readonly Consumer[];
};
if (!Array.isArray(raw.consumers)) throw new Error('consumers 必须是数组');
const results = raw.consumers.map((consumer) => resolveExport(raw.exports, consumer));
console.log(JSON.stringify(results));
const reasons = results.flatMap((result) => result.ok ? [] : [result.reason]);
if (reasons.join(',') !== 'MISSING_CONDITION,UNEXPORTED_SUBPATH') throw new Error('消费者解析错误');
`,
      },
      stdin: '{"exports":{".":{"import":"./dist/index.js"},"./schema":{"import":"./dist/schema.js","require":"./dist/schema.cjs"}},"consumers":[{"subpath":".","mode":"require"},{"subpath":"./internal","mode":"import"}]}',
      checkpoint:
        '两个消费者都应失败，reason 依次为 MISSING_CONDITION 与 UNEXPORTED_SUBPATH，退出码为 0。给主入口增加 require dist/index.cjs 后第一条应成功；不能通过 relative source path 绕过 exports。',
    },
  ),

  'programming:TypeScript · 企业库、构建与发布：迁移、deprecation 与版本策略': lab(
    'TS 代码台 18 · 用公开契约决定版本与迁移路径',
    '把 API 变化分类为补丁、次版本或主版本，再用兼容别名把旧调用委托给唯一实现；弃用信息同时进入 JSDoc 和真实调用指标。',
    {
      id: 'typescript-deprecation-guided',
      title: '跟做：从变更清单判定语义化版本',
      brief:
        'stdin 提供公开 API 变更清单。把新增可选字段归入 minor、删除导出和收紧参数归入 major、文档修正归入 patch，并输出每项原因。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type Change =
  | { readonly kind: 'add-optional'; readonly name: string }
  | { readonly kind: 'remove-export'; readonly name: string }
  | { readonly kind: 'narrow-param'; readonly name: string }
  | { readonly kind: 'docs'; readonly name: string };
type Bump = 'patch' | 'minor' | 'major';

function classify(change: Change): Bump {
  switch (change.kind) {
    case 'add-optional': return 'minor';
    case 'remove-export':
    case 'narrow-param': return 'major';
    case 'docs': return 'patch';
  }
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as readonly Change[];
if (!Array.isArray(raw)) throw new Error('stdin 必须是变更数组');
const ranked: readonly Bump[] = ['patch', 'minor', 'major'];
function releaseFor(changes: readonly Change[]): Bump {
  let result: Bump = 'patch';
  for (const change of changes) {
    const bump = classify(change);
    if (ranked.indexOf(bump) > ranked.indexOf(result)) result = bump;
  }
  return result;
}
const reasons = raw.map((change) => {
  const bump = classify(change);
  return { name: change.name, bump };
});
const release = releaseFor(raw);

console.log(JSON.stringify({ release, reasons }));
if (release !== 'major' || reasons[1]?.bump !== 'major') throw new Error('版本判定错误');
`,
      },
      stdin: '[{"kind":"add-optional","name":"parseUser.locale"},{"kind":"remove-export","name":"legacyParse"},{"kind":"docs","name":"README"}]',
      checkpoint:
        '输出 release 为 major，legacyParse 的 bump 为 major，README 为 patch，退出码为 0。加入额外的 narrow-param 仍应保持 major；只有 docs 时才应落回 patch。',
    },
    {
      id: 'typescript-deprecation-independent',
      title: '独立实践：兼容别名、弃用指标与委托',
      brief:
        'stdin 提供旧 API 与规范化输入。实现新 parseV2 与带 @deprecated 的 parseV1，旧入口只做适配并记录一次弃用指标，不能复制业务逻辑。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import { readFileSync } from 'node:fs';

type ParseInput = { readonly raw: string };
type Parsed = { readonly value: string; readonly version: 2 };
const deprecatedHits = new Map<string, number>();

function recordDeprecated(name: string): void {
  deprecatedHits.set(name, (deprecatedHits.get(name) ?? 0) + 1);
}

function trimInput(input: ParseInput): string {
  const value = input.raw.trim();
  if (value.length === 0) throw new Error('raw 不能为空');
  return value;
}

function parseV2(input: ParseInput): Parsed {
  return Object.freeze({ value: trimInput(input), version: 2 });
}

/** @deprecated 使用 parseV2。 */
function parseV1(raw: string): Parsed {
  recordDeprecated('parseV1');
  return parseV2({ raw });
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { readonly legacy: string; readonly modern: string };
const legacyResult = parseV1(raw.legacy);
const modernResult = parseV2({ raw: raw.modern });
const result = {
  legacyResult,
  modernResult,
  deprecatedHits: Object.fromEntries(deprecatedHits.entries()),
};

console.log(JSON.stringify(result));
if (legacyResult.value !== 'old' || modernResult.value !== 'new') throw new Error('兼容别名结果错误');
if (result.deprecatedHits.parseV1 !== 1) throw new Error('弃用指标计数错误');
`,
      },
      stdin: '{"legacy":" old ","modern":" new "}',
      checkpoint:
        'legacyResult.value 与 modernResult.value 分别为 old、new，deprecatedHits.parseV1 为 1，退出码为 0。连续调用两次旧 API 指标应变为 2；若把 trim 逻辑复制到 parseV1，后续行为分叉风险会出现。',
    },
  ),
};
