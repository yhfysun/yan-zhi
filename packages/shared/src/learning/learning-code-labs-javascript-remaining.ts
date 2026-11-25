import type { LearningV2CodeLab } from './v2-types.js';

/**
 * JavaScript 独立语言课程后续代码台。
 *
 * 运行时只使用 Node.js 标准库。DOM、事件、Storage 和 Vite/CDN 课题使用
 * 明确的确定性模型或真实本地 HTTP 回环，不把字符串断言伪装成浏览器渲染结论。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 内置运行时',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    'Node.js 由应用内置，不需要安装 npm、pnpm 或第三方包。',
    '先运行跟做代码并读取标准输出，再完成独立实践。',
    '两段代码都会读取 stdin；文件、HTTP 和计时证据来自本次真实进程。',
  ],
  languages: ['javascript'],
} as const;

export const LEARNING_CODE_LABS_JAVASCRIPT_REMAINING: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:JavaScript · 运行环境、工具链与第一段代码：Node、pnpm、Vite 与目录骨架': {
    title: 'JS 后续代码台 01 · 建一个可重建的项目骨架',
    description:
      '从 stdin 读取工具链约束，在临时目录创建 package.json 与目录边界；随后动态导入纯逻辑模块。实验验证 Node 版本、脚本入口、模块类型和目录职责，不假定 pnpm 或 Vite 已安装。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-toolchain-guided',
      title: '跟做：生成最小且可检查的清单',
      brief:
        '运行 node main.js。程序读取 stdin 的 Node 下限和脚本名，创建临时 package.json，打印真实 Node 版本、模块类型、脚本数量与临时目录，然后清理目录。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-toolchain-'));

try {
  const manifest = {
    name: input.name,
    private: true,
    type: 'module',
    scripts: input.scripts
  };
  const manifestPath = path.join(root, 'package.json');
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');

  const loaded = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const evidence = {
    executable: process.execPath,
    node: process.versions.node,
    type: loaded.type,
    scripts: Object.keys(loaded.scripts).sort(),
    dirs: ['src/lib', 'src/web', 'scripts'].map((entry) => fs.existsSync(path.join(root, entry)))
  };
  console.log(JSON.stringify(evidence, null, 2));

  if (nodeMajor < input.minimumNode) throw new Error('Node 版本低于项目约束');
  if (loaded.type !== 'module') throw new Error('项目应使用 ESM');
  if (!evidence.dirs.every(Boolean)) throw new Error('目录骨架不完整');
  if (!('test' in loaded.scripts) || !('build' in loaded.scripts)) {
    throw new Error('缺少 test 或 build 脚本');
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        name: 'course-toolchain',
        minimumNode: 22,
        scripts: {
          dev: 'vite',
          test: 'node --test',
          build: 'vite build',
        },
      }),
      checkpoint:
        '输出应包含真实 process.execPath、当前 Node 版本、type=module、三个脚本与三个 true 目录布尔值；Node 主版本低于 22 时退出码应为 1。临时目录只在本次运行存在。',
    },
    apply: {
      id: 'javascript-remaining-toolchain-independent',
      title: '独立实践：让目录边界通过动态导入',
      brief:
        '程序创建 src/lib/money.js 与 src/web/app.js，从 stdin 读取商品行，动态导入纯金额模块计算总额，再读取入口文本确认浏览器层只调用公共导出。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-boundary-'));
  try {
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'web'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\\n');
    const libPath = path.join(root, 'src', 'lib', 'money.js');
    fs.writeFileSync(libPath,
      'export const total = (rows) => rows.reduce((sum, row) => sum + row.price * row.qty, 0);\\n'
    );
    fs.writeFileSync(path.join(root, 'src', 'web', 'app.js'),
      'import { total } from "../lib/money.js";\\n' +
      'export const render = (rows) => "合计 " + total(rows).toFixed(2);\\n'
    );

    const money = await import(pathToFileURL(libPath).href);
    const app = await import(pathToFileURL(path.join(root, 'src', 'web', 'app.js')).href);
    const amount = Number(money.total(rows).toFixed(2));
    const text = app.render(rows);
    console.log({ amount, text, exported: Object.keys(money).sort() });
    if (amount !== 58.7) throw new Error('纯函数金额不正确');
    if (text !== '合计 58.70') throw new Error('浏览器适配层输出不正确');
    if (Object.keys(money).join(',') !== 'total') throw new Error('公共导出范围过大');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify([
        { price: 19.9, qty: 2 },
        { price: 6.3, qty: 3 },
      ]),
      checkpoint:
        'amount 应为 58.7，text 应为“合计 58.70”，模块只公开 total，退出码为 0。若把 DOM 查询写进 money.js，Node 导入会失败，目录边界就不再可验证。',
    },
  },

  'programming:JavaScript · 运行环境、工具链与第一段代码：控制台、断点与 Source Map': {
    title: 'JS 后续代码台 02 · 把异常收敛到源码位置',
    description:
      '先用分级日志和调用栈定位业务帧，再用 Node 的 SourceMap 接口查询构建后行列到原始源码的映射。重点是保留因果与版本，而不是只打印最后一条错误。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-debug-guided',
      title: '跟做：从异常栈找第一个业务帧',
      brief:
        '运行 node main.js。程序读取故障输入，抛出带 code 与 cause 的错误，打印结构化日志和调用栈首个非 Node 内部帧，并断言上下文仍可见。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const failure = JSON.parse(fs.readFileSync(0, 'utf8'));

function parseAmount(text, recordId) {
  const value = Number(text);
  if (!Number.isFinite(value)) {
    const cause = new RangeError('金额不是有限数字');
    const error = new Error('记录 ' + recordId + ' 无法定价', { cause });
    error.code = 'AMOUNT_INVALID';
    throw error;
  }
  return value;
}

function quote() {
  return parseAmount(failure.rawAmount, failure.recordId);
}

try {
  quote();
} catch (error) {
  const frames = String(error.stack).split('\\n').slice(1);
  const firstBusinessFrame = frames.find((line) => line.includes('parseAmount'));
  console.error(JSON.stringify({
    level: 'error',
    code: error.code,
    message: error.message,
    cause: error.cause.name,
    firstBusinessFrame
  }, null, 2));
  if (error.code !== 'AMOUNT_INVALID') throw new Error('稳定错误码丢失');
  if (!firstBusinessFrame || !firstBusinessFrame.includes('main.js')) {
    throw new Error('调用栈没有保留业务源码位置');
  }
  console.log('debug evidence verified');
}
`,
      },
      stdin: JSON.stringify({ rawAmount: 'not-a-number', recordId: 'order-7' }),
      checkpoint:
        '错误日志应包含 AMOUNT_INVALID、RangeError cause 与 main.js 中的 parseAmount 帧，最后出现 debug evidence verified，退出码为 0。栈只提供执行位置，业务关联仍要靠 code、recordId 与版本字段。',
    },
    apply: {
      id: 'javascript-remaining-debug-independent',
      title: '独立实践：查询 Source Map 的原始位置',
      brief:
        '使用 node:module 的 SourceMap 读取 stdin 中的构建映射，把生成的第 1 行第 0 列映射回 src/cart.js，并拒绝映射缺失的构建产物。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const { SourceMap } = require('node:module');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const map = new SourceMap({
  version: 3,
  file: input.generatedFile,
  sources: [input.originalFile],
  sourcesContent: ['export const total = (items) => items.length;\\n'],
  names: [],
  mappings: 'AAAA'
});

const origin = map.findEntry(input.generatedLine - 1, input.generatedColumn);
console.log(JSON.stringify({
  generated: input.generatedFile,
  original: origin.originalSource,
  line: origin.originalLine + 1,
  column: origin.originalColumn,
  release: input.release
}, null, 2));

if (!origin.originalSource) throw new Error('Source Map 没有原始源码');
if (origin.originalSource !== 'src/cart.js') throw new Error('映射到了错误文件');
if (origin.originalLine !== 0 || origin.originalColumn !== 0) {
  throw new Error('原始行列不正确');
}
console.log('source map lookup passed');
`,
      },
      stdin: JSON.stringify({
        generatedFile: 'assets/cart-a81c.js',
        originalFile: 'src/cart.js',
        generatedLine: 1,
        generatedColumn: 0,
        release: 'web-2026.11.24-3',
      }),
      checkpoint:
        '输出应将 assets/cart-a81c.js 映射为 src/cart.js 第 1 行第 0 列，并保留 release；最后出现 source map lookup passed，退出码为 0。线上 Source Map 必须与产物同版本，且不应无授权公开。',
    },
  },

  'programming:JavaScript · 运行环境、工具链与第一段代码：第一段可测试 JavaScript 程序': {
    title: 'JS 后续代码台 03 · 先写契约，再让测试失败',
    description:
      '用最小测试运行器验证纯函数，再把实现写入临时模块真实加载。正常、空输入和错误类型都成为可重复证据，业务公式不依赖 DOM 或全局状态。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-testing-guided',
      title: '跟做：建立四行测试运行器',
      brief:
        '运行 node main.js。程序从 stdin 读取购物行，用测试表验证空输入、总额、非法数量和折扣边界；测试失败时返回非零退出码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function quote(lines, gold) {
  const subtotal = lines.reduce((sum, line) => {
    if (!Number.isInteger(line.qty) || line.qty <= 0) throw new RangeError('数量非法');
    return sum + line.price * line.qty;
  }, 0);
  return Number((gold && subtotal >= 100 ? subtotal - 20 : subtotal).toFixed(2));
}

const cases = [
  { name: 'empty', lines: [], gold: false, expected: 0 },
  { name: 'gold boundary below', lines: [{ price: 99, qty: 1 }], gold: true, expected: 99 },
  { name: 'gold boundary hit', lines: [{ price: 50, qty: 2 }], gold: true, expected: 80 }
];

let passed = 0;
for (const test of cases) {
  const actual = quote(test.lines, test.gold);
  console.log(test.name + ': expected=' + test.expected + ' actual=' + actual);
  if (actual !== test.expected) throw new Error('测试失败: ' + test.name);
  passed += 1;
}

let rejected = false;
try {
  quote(input.invalidLines, false);
} catch (error) {
  rejected = error instanceof RangeError;
}
if (!rejected) throw new Error('非法数量没有抛 RangeError');
console.log('passed tests: ' + passed + ', invalid path: rejected');
`,
      },
      stdin: JSON.stringify({ invalidLines: [{ price: 10, qty: 0 }] }),
      checkpoint:
        '三组边界测试应全部通过，非法数量应被 RangeError 拒绝，最后输出 passed tests: 3, invalid path: rejected，退出码为 0。把测试数据与实现放在同一可运行文件中，是为了先观察失败，再迁移到正式测试框架。',
    },
    apply: {
      id: 'javascript-remaining-testing-independent',
      title: '独立实践：从临时模块交付可测试程序',
      brief:
        '创建临时 normalize.js，真实 require 该模块；对空白行、字符串金额和未知等级做正常化，再断言输出类型稳定。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-testable-'));
const modulePath = path.join(root, 'normalize.cjs');

try {
  fs.writeFileSync(modulePath, [
    "'use strict';",
    'function normalizeRow(row) {',
    "  if (typeof row.amount !== 'string' || !row.amount.trim()) {",
    "    throw new RangeError('amount required');",
    '  }',
    '  const amount = Number(row.amount);',
    '  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("amount invalid");',
    "  const level = row.level === 'gold' ? 'gold' : row.level === 'standard' ? 'standard' : null;",
    "  if (!level) throw new TypeError('level invalid');",
    '  return Object.freeze({ id: row.id.trim(), amount, level });',
    '}',
    'module.exports = { normalizeRow };',
    ''
  ].join('\\n'));

  const { normalizeRow } = require(modulePath);
  const normalized = rows.map(normalizeRow);
  console.log(JSON.stringify(normalized, null, 2));
  if (normalized.length !== 2 || !Object.isFrozen(normalized[0])) {
    throw new Error('正常化结果数量或冻结语义错误');
  }
  if (normalized[1].amount !== 80 || normalized[1].level !== 'standard') {
    throw new Error('第二行字段不正确');
  }
  let invalid = '';
  try {
    normalizeRow({ id: 'x', amount: '1abc', level: 'gold' });
  } catch (error) {
    invalid = error.name;
  }
  if (invalid !== 'RangeError') throw new Error('错误类型不稳定');
  console.log('testable module verified');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify([
        { id: ' A-1 ', amount: '19.90', level: 'gold' },
        { id: 'B-2', amount: '80', level: 'standard' },
      ]),
      checkpoint:
        '应输出两条冻结记录，A-1 金额为 19.9，B-2 金额为 80；1abc 被 RangeError 拒绝，最后出现 testable module verified，退出码为 0。模块真实写入临时文件并由 Node 加载，不是只比较源码字符串。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：原始值、对象与隐式转换': {
    title: 'JS 后续代码台 04 · 把隐式转换变成显式契约',
    description:
      '比较原始值、包装对象、ToPrimitive 与严格相等，再把不可信数量输入解析为安全整数或明确错误。验证重点不是记忆怪癖，而是业务边界不会继承隐式转换。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-coercion-guided',
      title: '跟做：记录转换矩阵',
      brief:
        '运行 node main.js。程序读取四组值，打印 typeof、Boolean、Number、String、== 与 === 的结果，并断言 null 与 NaN 的关键行为。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const values = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = values.map((item) => {
  const value = item.value;
  return {
    label: item.label,
    type: typeof value,
    truthy: Boolean(value),
    number: Number.isNaN(Number(value)) ? 'NaN' : Number(value),
    text: String(value),
    looseZero: value == 0,
    strictZero: value === 0
  };
});

console.table(rows);
if (typeof null !== 'object') throw new Error('typeof null 兼容行为变化');
if (Object.is(Number.NaN, Number.NaN) !== true) throw new Error('Object.is 应识别 NaN');
if (new Number(1) === 1) throw new Error('包装对象不应与原始值严格相等');
if (rows.find((row) => row.label === 'zero-string').truthy !== true) {
  throw new Error('非空字符串 0 应为 truthy');
}
console.log('coercion matrix verified');
`,
      },
      stdin: JSON.stringify([
        { label: 'zero', value: 0 },
        { label: 'zero-string', value: '0' },
        { label: 'null', value: null },
        { label: 'empty-array', value: [] },
      ]),
      checkpoint:
        '表格应显示 null 的 typeof 为 object、字符串 0 为 truthy、0 == "0" 为 true 而 === 为 false，最后出现 coercion matrix verified，退出码为 0。Number(null) 为 0，但 null 不是数字。',
    },
    apply: {
      id: 'javascript-remaining-coercion-independent',
      title: '独立实践：拒绝欺骗性数量输入',
      brief:
        '实现 parseQuantity(raw)：只接受安全整数或完整十进制整数字符串，拒绝数组、布尔值、空串、小数、NaN 与带尾字符输入；用 stdin 的样本表逐项断言。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const samples = JSON.parse(fs.readFileSync(0, 'utf8'));

function parseQuantity(raw) {
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) throw new RangeError('quantity must be a safe integer');
    return raw;
  }
  if (typeof raw !== 'string') throw new TypeError('quantity must be a number or string');
  const text = raw.trim();
  if (!/^-?(?:0|[1-9]\\d*)$/.test(text)) throw new RangeError('quantity text is not an integer');
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new RangeError('quantity is outside safe range');
  return value;
}

for (const sample of samples) {
  let outcome;
  try {
    outcome = 'value:' + parseQuantity(sample.raw);
  } catch (error) {
    outcome = 'error:' + error.name;
  }
  console.log(sample.raw + ' -> ' + outcome);
  if (outcome !== sample.expected) throw new Error('sample failed: ' + sample.raw);
}

console.log('quantity parser contract passed');
`,
      },
      stdin: JSON.stringify([
        { raw: '42', expected: 'value:42' },
        { raw: ' 007 ', expected: 'error:RangeError' },
        { raw: '1abc', expected: 'error:RangeError' },
        { raw: 12, expected: 'value:12' },
        { raw: [], expected: 'error:TypeError' },
      ]),
      checkpoint:
        '样本输出应依次为 42、RangeError、RangeError、12、TypeError，最后出现 quantity parser contract passed，退出码为 0。先按原始类型分流，再检查字符串格式，可以避免空数组、空串和指数表示悄悄通过。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：let、const、提升与暂时性死区': {
    title: 'JS 后续代码台 05 · 让声明时序与块作用域显形',
    description:
      '通过 Function 构造器触发 let 的暂时性死区，比较 var 与 let 的循环绑定，再检查 const 的不可重绑和对象可修改性。每个结论都由运行时异常或回调结果证明。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-tdz-guided',
      title: '跟做：区分绑定创建与初始化',
      brief:
        '运行 node main.js。程序读取场景名，捕获声明前访问 let 与 var 的真实结果，并用 var/let 两轮循环比较异步回调捕获值。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const scenario = fs.readFileSync(0, 'utf8').trim();

async function main() {
  const tdz = new Function('return before; let before = 1;');
  const hoisted = new Function('return before; var before = 1;');
  let tdzName = '';
  try {
    tdz();
  } catch (error) {
    tdzName = error.name;
  }

  const varValues = [];
  for (var indexVar = 0; indexVar < 3; indexVar += 1) {
    queueMicrotask(() => varValues.push(indexVar));
  }

  await new Promise((resolve) => setTimeout(resolve, 0));
  const letValues = [];
  for (let indexLet = 0; indexLet < 3; indexLet += 1) {
    queueMicrotask(() => letValues.push(indexLet));
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  const evidence = {
    scenario,
    tdz: tdzName,
    varBeforeInitialization: hoisted(),
    varValues,
    letValues
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (tdzName !== 'ReferenceError') throw new Error('let 应处于暂时性死区');
  if (evidence.varBeforeInitialization !== undefined) throw new Error('var 应提升为 undefined');
  if (varValues.join(',') !== '3,3,3' || letValues.join(',') !== '0,1,2') {
    throw new Error('循环绑定结果不正确');
  }
  console.log('scope timing verified');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: 'bundle-startup',
      checkpoint:
        '输出应显示 tdz=ReferenceError、varBeforeInitialization 为 undefined、varValues 为 3,3,3、letValues 为 0,1,2，最后出现 scope timing verified，退出码为 0。绑定存在不等于可读取。',
    },
    apply: {
      id: 'javascript-remaining-tdz-independent',
      title: '独立实践：重构依赖提升的配置代码',
      brief:
        '从 stdin 读取配置，创建冻结配置快照，为三个租户回调保存独立绑定；验证块外读取失败、副本身份稳定且回调值没有共享。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const config = Object.freeze({ ...input.config, tags: Object.freeze([...input.config.tags]) });
const handlers = [];

for (let index = 0; index < input.tenants.length; index += 1) {
  const tenant = input.tenants[index];
  handlers.push(() => tenant + ':' + config.region);
}

let leaked = true;
try {
  eval('index');
} catch (error) {
  leaked = error.name !== 'ReferenceError';
}

const observed = handlers.map((handler) => handler());
console.log({ frozen: Object.isFrozen(config), tagsFrozen: Object.isFrozen(config.tags), observed, leaked });

if (!Object.isFrozen(config) || !Object.isFrozen(config.tags)) throw new Error('配置未冻结');
if (observed.join(',') !== 'A:cn,B:cn,C:cn') throw new Error('回调没有独立捕获租户');
if (leaked) throw new Error('let 循环变量泄漏到块外');
if (JSON.stringify(config.tags) !== JSON.stringify(input.config.tags)) {
  throw new Error('配置标签发生修改');
}
console.log('scope refactor passed');
`,
      },
      stdin: JSON.stringify({
        config: { region: 'cn', tags: ['stable', 'edge'] },
        tenants: ['A', 'B', 'C'],
      }),
      checkpoint:
        '输出应为 frozen=true、tagsFrozen=true、observed=A:cn,B:cn,C:cn、leaked=false，最后出现 scope refactor passed，退出码为 0。Object.freeze 只能限制对应层的修改，嵌套数组需要单独冻结。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：解构、展开、可选链与空值合并': {
    title: 'JS 后续代码台 06 · 缺失值与合法假值的分界',
    description:
      '用解构默认值、可选链与空值合并读取不可信对象，比较 || 和 ?? 在 0、空串、false、null 下的差异；展开创建新结构时明确哪些层仍共享引用。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-destructure-guided',
      title: '跟做：观察默认值触发条件',
      brief:
        '运行 node main.js。读取用户输入，分别用 || 和 ?? 取得 pageSize，并用嵌套解构处理缺失或 null 的 profile，输出每个分支的实际值。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { pageSize = 20, profile, tags = [] } = input;
const { city = 'unknown' } = profile ?? {};
const fallbackOr = pageSize || 10;
const fallbackNullish = pageSize ?? 10;
const next = { ...input, tags: [...tags, 'normalized'] };

console.log({
  rawPageSize: pageSize,
  fallbackOr,
  fallbackNullish,
  profileIsNull: profile === null,
  city,
  originalTags: tags,
  nextTags: next.tags
});

if (fallbackOr !== 10) throw new Error('|| 应替换合法 0');
if (fallbackNullish !== 0) throw new Error('?? 不应替换合法 0');
if (city !== 'unknown' || !next.tags.includes('normalized')) throw new Error('嵌套默认或展开失败');
if (tags === next.tags) throw new Error('数组展开应创建新引用');
console.log('destructuring boundaries passed');
`,
      },
      stdin: JSON.stringify({ pageSize: 0, profile: null, tags: ['a'] }),
      checkpoint:
        '输出应显示 rawPageSize=0、fallbackOr=10、fallbackNullish=0、profileIsNull=true、city=unknown，原始与下一份 tags 不相等，退出码为 0。解构默认值只替换 undefined，不替换 null；这里由 ?? 处理中间层。',
    },
    apply: {
      id: 'javascript-remaining-destructure-independent',
      title: '独立实践：把接口响应整理成稳定视图模型',
      brief:
        '读取不可信响应，提取 userName 和 address.city，收集缺失字段；使用展开生成新对象，保证原响应和嵌套 tags 数组身份不变。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const responses = JSON.parse(fs.readFileSync(0, 'utf8'));

function toView(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('user response must be an object');
  }
  const missing = [];
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  if (!name) missing.push('userName');
  const city = raw.address?.city;
  if (typeof city !== 'string' || !city.trim()) missing.push('address.city');
  const tags = Array.isArray(raw.tags) ? [...raw.tags] : [];
  return {
    model: { ...raw, name, city: city?.trim() ?? null, tags, missing },
    original: raw
  };
}

const views = responses.map(toView);
console.log(views.map((entry) => entry.model));

if (views[0].model.missing.length !== 0) throw new Error('正常响应不应缺字段');
if (views[1].model.missing.join(',') !== 'userName,address.city') {
  throw new Error('缺失字段收集不完整');
}
if (views[0].model.tags === responses[0].tags) throw new Error('tags 仍共享原数组');
if (views[0].original !== responses[0]) throw new Error('原响应身份不应变化');
console.log('view model contract passed');
`,
      },
      stdin: JSON.stringify([
        { name: 'Ada', address: { city: 'Shanghai' }, tags: ['vip'] },
        { name: '', address: null, tags: [] },
      ]),
      checkpoint:
        '第一条 missing 为空，第二条应恰为 userName,address.city；两份 tags 都是新数组且原响应未被替换，最后出现 view model contract passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：作用域和闭包缺陷实验': {
    title: 'JS 后续代码台 07 · 捕获、共享与清理的故障实验',
    description:
      '先把回调捕获问题缩成可重复队列实验，再实现带幂等退订的订阅器。实验检查监听器数量、定时器是否清除以及重复退订是否安全。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-closure-guided',
      title: '跟做：比较 var 与 let 的回调捕获',
      brief:
        '运行 node main.js。程序从 stdin 读取租户列表，用 var 和 let 各注册一组微任务回调，再比较共享累加器与工厂实例的状态隔离。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const tenants = JSON.parse(fs.readFileSync(0, 'utf8'));
const varHandlers = [];
for (var indexVar = 0; indexVar < tenants.length; indexVar += 1) {
  varHandlers.push(() => tenants[Math.min(indexVar, tenants.length - 1)]);
}

const letHandlers = [];
for (let indexLet = 0; indexLet < tenants.length; indexLet += 1) {
  letHandlers.push(() => tenants[indexLet]);
}

function createCounter() {
  let count = 0;
  return {
    add() { count += 1; return count; },
    read() { return count; }
  };
}

const left = createCounter();
const right = createCounter();
left.add();
left.add();
left.add();
right.add();

console.log({
  varCaptured: varHandlers.map((handler) => handler()),
  letCaptured: letHandlers.map((handler) => handler()),
  isolatedCounters: [left.read(), right.read()],
  sameBehavior: left.add === right.add
});

if (varHandlers.map((handler) => handler()).join(',') !== Array(tenants.length).fill(tenants.at(-1)).join(',')) {
  throw new Error('var 回调应共享最终绑定');
}
if (letHandlers.map((handler) => handler()).join(',') !== tenants.join(',')) {
  throw new Error('let 回调应保留逐轮绑定');
}
if (left.read() !== 3 || right.read() !== 1) throw new Error('闭包状态没有隔离');
console.log('closure capture experiment passed');
`,
      },
      stdin: JSON.stringify(['A', 'B', 'C']),
      checkpoint:
        'varCaptured 应重复 C 三次，letCaptured 应为 A,B,C；两个计数器最终分别为 3 和 1，方法函数引用可共享而状态独立，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-closure-independent',
      title: '独立实践：实现幂等退订与定时器清理',
      brief:
        '读取订阅计划，构建轻量事件表与定时器表；订阅后触发事件、重复退订并推进时间，断言旧处理器不再执行且所有资源归零。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const plan = JSON.parse(fs.readFileSync(0, 'utf8'));

function createSubscriptionHub() {
  const listeners = new Map();
  const timers = new Set();
  let active = true;

  function subscribe(eventName, handler) {
    if (!active) throw new Error('hub disposed');
    const handlers = listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    listeners.set(eventName, handlers);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return false;
      unsubscribed = true;
      handlers.delete(handler);
      if (handlers.size === 0) listeners.delete(eventName);
      return true;
    };
  }

  function emit(eventName, value) {
    for (const handler of listeners.get(eventName) ?? []) handler(value);
  }

  function schedule(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  }

  function dispose() {
    active = false;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    listeners.clear();
  }

  return {
    subscribe,
    emit,
    schedule,
    dispose,
    stats: () => ({ listeners: [...listeners.values()].reduce((sum, set) => sum + set.size, 0), timers: timers.size })
  };
}

async function main() {
  const hub = createSubscriptionHub();
  const seen = [];
  const unsubscribe = hub.subscribe(plan.event, (value) => seen.push(value));
  hub.emit(plan.event, plan.firstValue);
  hub.schedule(() => hub.emit(plan.event, plan.lateValue), plan.delayMs);
  await new Promise((resolve) => setTimeout(resolve, plan.delayMs + 10));
  const firstUnsubscribe = unsubscribe();
  const secondUnsubscribe = unsubscribe();
  hub.emit(plan.event, plan.afterUnsubscribe);
  hub.schedule(() => {}, 20);
  const beforeDispose = hub.stats();
  hub.dispose();
  const afterDispose = hub.stats();

  console.log({ seen, firstUnsubscribe, secondUnsubscribe, beforeDispose, afterDispose });
  if (seen.join(',') !== [plan.firstValue, plan.lateValue].join(',')) {
    throw new Error('退订前事件序列不正确');
  }
  if (!firstUnsubscribe || secondUnsubscribe) throw new Error('退订不是幂等的');
  if (afterDispose.listeners !== 0 || afterDispose.timers !== 0) throw new Error('资源未清理');
  console.log('subscription lifecycle passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        event: 'order.created',
        firstValue: 'A',
        lateValue: 'B',
        afterUnsubscribe: 'C',
        delayMs: 15,
      }),
      checkpoint:
        'seen 应仅为 A,B；第一次退订返回 true，第二次返回 false；dispose 后 listeners 与 timers 都为 0，最后出现 subscription lifecycle passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：构造函数、class 与实例方法': {
    title: 'JS 后续代码台 08 · 原型共享与实例不变量',
    description:
      '检查 new 的原型绑定、class 方法的共享位置与解构调用后的 this 丢失，再构造一个复制输入并维护订单不变量的类。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-class-guided',
      title: '跟做：观察构造器和方法位置',
      brief:
        '运行 node main.js。程序读取坐标，创建两个 Point 实例，验证实例字段各异、原型方法共享、箭头函数不可构造，并捕获解构后的 this 错误。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const points = JSON.parse(fs.readFileSync(0, 'utf8'));

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  label() {
    return '(' + this.x + ',' + this.y + ')';
  }
}

const first = new Point(points[0].x, points[0].y);
const second = new Point(points[1].x, points[1].y);
const detached = first.label;
let detachedError = '';
try {
  detached();
} catch (error) {
  detachedError = error.name;
}
const arrow = () => 1;
let arrowConstruct = false;
try {
  new arrow();
} catch {
  arrowConstruct = true;
}

const evidence = {
  first: first.label(),
  second: second.label(),
  ownKeys: Object.keys(first).sort(),
  sharedMethod: first.label === second.label,
  prototypeMatches: Object.getPrototypeOf(first) === Point.prototype,
  detachedError,
  arrowConstruct
};
console.log(evidence);

if (!evidence.sharedMethod || !evidence.prototypeMatches) throw new Error('原型关系错误');
if (evidence.detachedError !== 'TypeError') throw new Error('解构方法应丢失 this');
if (!evidence.arrowConstruct) throw new Error('箭头函数不应可构造');
`,
      },
      stdin: JSON.stringify([
        { x: 2, y: 3 },
        { x: 5, y: 8 },
      ]),
      checkpoint:
        '两个 label 应分别为 (2,3) 与 (5,8)，实例自有键只有 x,y，方法共享且原型匹配；解构调用报 TypeError，箭头函数构造失败，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-class-independent',
      title: '独立实践：用类维护订单不变量',
      brief:
        '实现 class Order：构造时校验并复制商品行，addItem 拒绝非法数量，total 只读汇总；修改外部原数组不应污染实例。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class Order {
  #items;
  constructor(id, items) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id required');
    if (!Array.isArray(items) || items.length === 0) throw new TypeError('items required');
    this.id = id.trim();
    this.#items = [];
    for (const item of items) this.addItem(item);
    Object.freeze(this);
  }
  addItem(item) {
    if (!item || typeof item.sku !== 'string' || !item.sku.trim()) {
      throw new TypeError('sku required');
    }
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
      throw new RangeError('price invalid');
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new RangeError('quantity invalid');
    }
    this.#items.push(Object.freeze({ ...item, sku: item.sku.trim() }));
  }
  total() {
    return Number(this.#items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  }
  snapshot() {
    return this.#items.map((item) => ({ ...item }));
  }
}

const source = input.items.map((item) => ({ ...item }));
const order = new Order(input.id, source);
source.push({ sku: 'HACK', price: 0, quantity: 1 });
source[0].price = 999;
order.addItem(input.extra);

let invalid = '';
try {
  order.addItem({ sku: 'BAD', price: 10, quantity: 0 });
} catch (error) {
  invalid = error.name;
}

const snapshot = order.snapshot();
console.log({ id: order.id, total: order.total(), count: snapshot.length, invalid, frozen: Object.isFrozen(order) });
if (order.total() !== input.expectedTotal) throw new Error('订单总额不正确');
if (snapshot.length !== input.items.length + 1) throw new Error('外部数组修改污染了订单');
if (snapshot[0].price === 999) throw new Error('构造器没有复制商品行');
if (invalid !== 'RangeError') throw new Error('非法数量没有被拒绝');
console.log('order invariants passed');
`,
      },
      stdin: JSON.stringify({
        id: ' O-73 ',
        items: [
          { sku: 'A', price: 19.9, quantity: 2 },
          { sku: 'B', price: 5, quantity: 4 },
        ],
        extra: { sku: 'C', price: 2.5, quantity: 2 },
        expectedTotal: 64.8,
      }),
      checkpoint:
        '订单总额应为 64.8，快照为 3 条且首条价格仍为 19.9，非法数量返回 RangeError；实例本身冻结，退出码为 0。冻结实例不妨碍私有数组内部更新，但所有入口都必须维护业务不变量。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：箭头函数与回调上下文': {
    title: 'JS 后续代码台 09 · 选择不会丢失接收者的回调',
    description:
      '对比普通函数和箭头函数的 this、arguments 与 prototype，再让一个实例状态通过箭头订阅器读取最新值，同时保留可移除的同一函数引用。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-arrow-guided',
      title: '跟做：观察词法 this 与不可构造性',
      brief:
        '运行 node main.js。对象中的普通回调应得到 undefined 接收者或显式对象，箭头回调应读取外层对象；同时验证箭头函数没有 prototype 且不能 new。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const owner = {
  name: input.owner,
  regular() {
    return function later() {
      return this?.name ?? null;
    };
  },
  lexical() {
    return () => this.name;
  }
};

const regularHandler = owner.regular();
const lexicalHandler = owner.lexical();
const evidence = {
  regularDetached: regularHandler(),
  regularBound: regularHandler.call({ name: 'bound' }),
  lexical: lexicalHandler.call({ name: 'ignored' }),
  hasArrowPrototype: Object.hasOwn(lexicalHandler, 'prototype'),
  stillReadsOwner: lexicalHandler() === input.owner
};
let constructError = '';
try {
  new lexicalHandler();
} catch (error) {
  constructError = error.name;
}

console.log({ ...evidence, constructError });
if (evidence.regularDetached !== null) throw new Error('解构普通函数不应保留 owner');
if (evidence.regularBound !== 'bound') throw new Error('call 没有改变普通函数 this');
if (evidence.lexical !== input.owner) throw new Error('箭头函数应读取词法 this');
if (evidence.hasArrowPrototype || constructError !== 'TypeError') throw new Error('箭头函数构造语义错误');
console.log('arrow context passed');
`,
      },
      stdin: JSON.stringify({ owner: 'studio' }),
      checkpoint:
        'regularDetached 应为 null，regularBound 为 bound，lexical 保持 studio；箭头函数没有自有 prototype，new 调用抛 TypeError，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-arrow-independent',
      title: '独立实践：用稳定引用管理实例订阅',
      brief:
        '读取订阅计划，创建类实例的箭头处理器；订阅、更新字段、触发、取消后再次触发，证明处理器读取当前状态且同一引用可以被移除。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const plan = JSON.parse(fs.readFileSync(0, 'utf8'));

class CounterPanel {
  count = 0;
  #listeners = new Set();
  constructor(label) {
    this.label = label;
  }
  onTick = () => {
    for (const listener of this.#listeners) listener(this);
  };
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  increment() {
    this.count += 1;
  }
  listenerCount() {
    return this.#listeners.size;
  }
}

const panel = new CounterPanel(plan.label);
const seen = [];
const unsubscribe = panel.subscribe((source) => seen.push(source.label + ':' + source.count));
panel.increment();
panel.onTick();
panel.increment();
panel.onTick();
const before = panel.listenerCount();
const removed = unsubscribe();
panel.onTick();
const after = panel.listenerCount();

console.log({ seen, sameHandler: panel.onTick === panel.onTick, before, removed, after });
if (seen.join(',') !== 'panel:1,panel:2') throw new Error('箭头处理器没有读取当前实例状态');
    if (panel.onTick !== panel.onTick) throw new Error('实例字段引用不稳定');
if (before !== 1 || !removed || after !== 0) throw new Error('订阅清理失败');
console.log('instance callback lifecycle passed');
`,
      },
      stdin: JSON.stringify({ label: 'panel' }),
      checkpoint:
        'seen 应为 panel:1,panel:2，取消前监听器数量为 1，取消返回 true，之后为 0，退出码为 0。实例箭头字段是同一函数引用，因此可以直接用于移除。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：组合、委托与继承取舍': {
    title: 'JS 后续代码台 10 · 从深继承改成可替换组合',
    description:
      '先比较继承链与对象委托的原型关系，再把通知渠道作为可注入依赖组合到服务中。部分失败通过 allSettled 汇总，不修改服务内部渠道列表。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-composition-guided',
      title: '跟做：辨认继承与委托路径',
      brief:
        '运行 node main.js。程序读取鸟能力，先构造父类继承链，再用 Object.create 创建无共享状态的委托对象，比较原型深度与飞行行为。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class Animal {
  constructor(name) { this.name = name; }
  move() { return this.name + ' moves'; }
}
class Bird extends Animal {
  move() { return this.name + ' flies'; }
}
class Penguin extends Bird {
  move() { return this.name + ' swims'; }
}

const swimmer = {
  move() { return this.name + ' swims from delegate'; }
};
const delegated = Object.assign(Object.create(swimmer), { name: input.delegateName });
const penguin = new Penguin(input.inheritedName);

function protoDepth(value) {
  let depth = 0;
  for (let current = Object.getPrototypeOf(value); current; current = Object.getPrototypeOf(current)) {
    depth += 1;
  }
  return depth;
}

const evidence = {
  inherited: penguin.move(),
  delegated: delegated.move(),
  inheritedDepth: protoDepth(penguin),
  delegatedDepth: protoDepth(delegated),
  delegatedHasOwnMove: Object.hasOwn(delegated, 'move')
};
console.log(evidence);
if (!evidence.inherited.includes('swims') || !evidence.delegated.includes('swims')) {
  throw new Error('两种行为复用方案结果不正确');
}
if (evidence.delegatedHasOwnMove || evidence.delegatedDepth >= evidence.inheritedDepth) {
  throw new Error('委托关系不符合预期');
}
`,
      },
      stdin: JSON.stringify({ inheritedName: 'Penguin', delegateName: 'Diver' }),
      checkpoint:
        '继承实例与委托对象都应输出 swims；委托没有自有 move，原型深度小于继承实例，退出码为 0。对象委托能共享行为，但状态仍应在各自对象或工厂实例中。',
    },
    apply: {
      id: 'javascript-remaining-composition-independent',
      title: '独立实践：用依赖注入组合通知渠道',
      brief:
        '读取消息与渠道结果，创建 Email/SMS fake 渠道；NotificationService 只依赖 send 契约，并用 allSettled 返回每项成功或失败报告。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createService(channels) {
  const frozenChannels = Object.freeze([...channels]);
  return {
    async send(message) {
      const settled = await Promise.allSettled(
        frozenChannels.map(async (channel) => ({
          channel: channel.name,
          receipt: await channel.send(message)
        }))
      );
      return settled.map((item, index) => item.status === 'fulfilled'
        ? { ok: true, ...item.value }
        : { ok: false, channel: frozenChannels[index].name, error: item.reason.message });
    }
  };
}

function channel(name, shouldFail) {
  return {
    name,
    async send(message) {
      await Promise.resolve();
      if (shouldFail) throw new Error(name + ' offline');
      return name + ':' + message.id;
    }
  };
}

async function main() {
  const channels = input.channels.map((item) => channel(item.name, item.fail));
  const service = createService(channels);
  const report = await service.send(input.message);
  console.log(report);
  if (report.length !== input.channels.length) throw new Error('报告数量错误');
  if (!report.find((item) => item.channel === 'email' && item.ok)) {
    throw new Error('email 应成功');
  }
  if (!report.find((item) => item.channel === 'sms' && !item.ok)) {
    throw new Error('sms 应记录失败');
  }
  if (channels.length !== 2 || !Array.isArray(report)) throw new Error('注入边界发生变化');
  console.log('notification composition passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        message: { id: 'M-9', text: 'deploy complete' },
        channels: [
          { name: 'email', fail: false },
          { name: 'sms', fail: true },
        ],
      }),
      checkpoint:
        '报告应含 email 成功项与 sms 失败项，失败项保留 offline 错误；服务只依赖注入渠道，最后出现 notification composition passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：事件循环阻塞与任务切片': {
    title: 'JS 后续代码台 11 · 让调用栈主动让出',
    description:
      '记录同步、Promise 链、微任务与 timer 的顺序，再把大数组处理拆成可让出事件循环的批次。切片结果必须与同步版本哈希一致，取消后不得提交结果。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-loop-guided',
      title: '跟做：追踪 Promise 链和 timer 顺序',
      brief:
        '运行 node main.js。程序读取标签，按同步、Promise.then、queueMicrotask、Promise 链下一环与 setTimeout 的真实执行顺序记录日志。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const labels = JSON.parse(fs.readFileSync(0, 'utf8'));
const order = [];

async function main() {
  order.push(labels.sync);
  Promise.resolve()
    .then(() => {
      order.push(labels.promise);
      return labels.promiseChain;
    })
    .then((value) => order.push(value));
  queueMicrotask(() => order.push(labels.microtask));
  setTimeout(() => order.push(labels.timer), 0);
  await new Promise((resolve) => setTimeout(resolve, 5));

  console.log(order);
  const expected = [
    labels.sync,
    labels.promise,
    labels.microtask,
    labels.promiseChain,
    labels.timer
  ];
  if (order.join('>') !== expected.join('>')) throw new Error('事件循环顺序错误');
  console.log('event loop order passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        sync: 'sync',
        promise: 'promise-1',
        microtask: 'microtask',
        promiseChain: 'promise-2',
        timer: 'timer',
      }),
      checkpoint:
        '顺序应为 sync>promise-1>microtask>promise-2>timer，最后出现 event loop order passed，退出码为 0。同步栈清空后先排空微任务，timer 才获得下一轮任务机会。',
    },
    apply: {
      id: 'javascript-remaining-loop-independent',
      title: '独立实践：分批计算并支持取消',
      brief:
        '读取数组和批大小，用 setImmediate 在批次间让出事件循环；计算平方和并与同步结果比较。随后取消第二轮任务，断言没有提交结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function syncSum(values) {
  let total = 0;
  for (const value of values) total = (total + value * value) % 1000000007;
  return total;
}

async function slicedSum(values, batchSize, signal, onProgress) {
  let total = 0;
  let index = 0;
  while (index < values.length) {
    if (signal.aborted) throw signal.reason;
    const end = Math.min(index + batchSize, values.length);
    for (; index < end; index += 1) {
      total = (total + values[index] * values[index]) % 1000000007;
    }
    onProgress(index);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return total;
}

async function main() {
  const progress = [];
  const expected = syncSum(input.values);
  const actual = await slicedSum(
    input.values,
    input.batchSize,
    new AbortController().signal,
    (done) => progress.push(done)
  );
  const controller = new AbortController();
  const cancelled = slicedSum(
    input.values,
    input.batchSize,
    controller.signal,
    () => controller.abort(new DOMException('stop', 'AbortError'))
  );
  let cancelName = '';
  try {
    await cancelled;
  } catch (error) {
    cancelName = error.name;
  }

  console.log({ expected, actual, progress, cancelName });
  if (actual !== expected) throw new Error('切片改变了业务结果');
  if (progress.length < 2) throw new Error('任务没有跨批次让出调用栈');
  if (cancelName !== 'AbortError') throw new Error('取消没有终止后续批次');
  console.log('incremental scheduler passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        values: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        batchSize: 3,
      }),
      checkpoint:
        'expected 与 actual 都应为 384，progress 至少为 3,6,9，取消路径名称为 AbortError，最后出现 incremental scheduler passed，退出码为 0。批次之间必须真实让出调用栈。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：异步请求工程与竞态测试': {
    title: 'JS 后续代码台 12 · 稳定结果与旧响应隔离',
    description:
      '先用可观察 Promise 链实现成功、HTTP 失败和取消分类，再用 requestId 与 AbortController 管理两次重叠查询，证明旧结果晚到也无法写入。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-request-guided',
      title: '跟做：构造稳定请求结果链',
      brief:
        '读取三组 fake 响应，链式检查 response.ok、解析 JSON、读取 error code，并用统一对象报告成功、HTTP 错误与网络异常。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const responses = JSON.parse(fs.readFileSync(0, 'utf8'));

function fakeFetch(index) {
  return Promise.resolve().then(() => {
    const item = responses[index];
    if (item.networkError) throw new TypeError(item.networkError);
    return {
      ok: item.status >= 200 && item.status < 300,
      status: item.status,
      headers: { get: () => 'application/json' },
      json: async () => item.body
    };
  });
}

async function request(index) {
  try {
    const response = await fakeFetch(index);
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, kind: 'http', status: response.status, code: body.code };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    return { ok: false, kind: 'network', status: 0, code: error.name };
  }
}

async function main() {
  const report = [];
  for (let index = 0; index < responses.length; index += 1) report.push(await request(index));
  console.log(report);
  if (!report[0].ok || report[0].body.amount !== 100) throw new Error('成功分支错误');
  if (report[1].kind !== 'http' || report[1].code !== 'RATE_LIMITED') throw new Error('HTTP 分支错误');
  if (report[2].kind !== 'network' || report[2].code !== 'TypeError') throw new Error('网络分支错误');
  console.log('request result contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify([
        { status: 200, body: { amount: 100 } },
        { status: 429, body: { code: 'RATE_LIMITED' } },
        { networkError: 'connection reset' },
      ]),
      checkpoint:
        '报告应依次为成功、HTTP 429/RATE_LIMITED、网络 TypeError；三种失败不会混为同一个 undefined，最后出现 request result contract passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-request-independent',
      title: '独立实践：旧查询不得覆盖新查询',
      brief:
        '读取查询计划，构造两个延迟可控的 Promise；启动新请求后让旧请求最后完成，使用 requestId 与 abort 双重检查，最终只提交最新结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const plan = JSON.parse(fs.readFileSync(0, 'utf8'));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createCoordinator() {
  let currentId = 0;
  let currentController = null;
  let committed = null;
  return {
    async run(query, operation) {
      currentController?.abort(new DOMException('superseded', 'AbortError'));
      const controller = new AbortController();
      const requestId = ++currentId;
      currentController = controller;
      try {
        const value = await Promise.race([
          operation(controller.signal),
          new Promise((_, reject) => {
            controller.signal.addEventListener(
              'abort',
              () => reject(controller.signal.reason),
              { once: true }
            );
          })
        ]);
        if (controller.signal.aborted || requestId !== currentId) {
          return { committed: false, requestId };
        }
        committed = value;
        return { committed: true, requestId, value };
      } catch (error) {
        return {
          committed: false,
          requestId,
          error: error.name
        };
      }
    },
    snapshot: () => committed
  };
}

async function main() {
  const coordinator = createCoordinator();
  const first = deferred();
  const second = deferred();
  const firstRun = coordinator.run(plan.queries[0], () => first.promise);
  const secondRun = coordinator.run(plan.queries[1], () => second.promise);
  second.resolve(plan.queries[1]);
  const newest = await secondRun;
  first.resolve(plan.queries[0]);
  const older = await firstRun;

  console.log({ newest, older, committed: coordinator.snapshot() });
  if (!newest.committed || newest.value !== plan.queries[1]) throw new Error('新请求应提交');
  if (older.committed || older.error !== 'AbortError') throw new Error('旧请求不应获得写入权');
  if (coordinator.snapshot() !== plan.queries[1]) throw new Error('最终状态被旧响应覆盖');
  console.log('request race guard passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ queries: ['gold', 'silver'] }),
      checkpoint:
        'newest 应提交 silver，older 应记录 AbortError 且未提交，最终 snapshot 仍为 silver，最后出现 request race guard passed，退出码为 0。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：DOM 查询、创建与安全更新': {
    title: 'JS 后续代码台 13 · 用确定性树验证安全更新',
    description:
      '不启动浏览器，而是在 Node 中建立最小元素、文本节点和树关系模型，验证 create/append、textContent 与受限属性写入。模型只证明 DOM 语义，不声称完成布局或浏览器渲染。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-dom-guided',
      title: '跟做：先创建再挂载',
      brief:
        '读取文章标题与正文，创建虚拟 ul/li 节点，使用 textContent 写入不可信文本，通过 DocumentFragment 一次追加，最后检查节点数量与原始 HTML 不生成子标签。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class MiniNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = new Map();
    this._text = '';
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof MiniFragment) this.children.push(...node.children);
      else this.children.push(node);
    }
  }
  setAttribute(name, value) {
    if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new SyntaxError('invalid attribute');
    this.attributes.set(name, String(value));
  }
}
class MiniFragment extends MiniNode {
  constructor() { super('#fragment'); }
}

const list = new MiniNode('ul');
const fragment = new MiniFragment();
for (const item of input.items) {
  const li = new MiniNode('li');
  li.textContent = item;
  fragment.append(li);
}
list.append(fragment);
list.setAttribute('data-testid', 'safe-list');

console.log({
  tag: list.tag,
  childCount: list.children.length,
  childTexts: list.children.map((child) => child.textContent),
  attribute: list.attributes.get('data-testid'),
  textIncludesMarkup: list.textContent.includes('<script>')
});
if (list.children.length !== input.items.length) throw new Error('节点数量错误');
if (list.children.some((child) => child.children.length !== 0)) throw new Error('文本被当成 HTML 解析');
if (list.textContent !== input.items.join('')) throw new Error('文本节点内容不对');
console.log('mini DOM creation passed');
`,
      },
      stdin: JSON.stringify({ items: ['正常条目', '<img onerror=alert(1)>'] }),
      checkpoint:
        'ul 下应有两个 li，第二个文本原样包含尖括号但没有子节点；data-testid 写入成功，最后出现 mini DOM creation passed，退出码为 0。真实布局和浏览器解析仍需在浏览器测试中验收。',
    },
    apply: {
      id: 'javascript-remaining-dom-independent',
      title: '独立实践：渲染用户卡片并拒绝危险 URL',
      brief:
        '实现 renderUsers：创建新容器、按用户生成卡片，文本只通过 textContent 写入；头像地址只允许 https:，空数据展示空状态，重复渲染不会保留旧节点。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.textContent = '';
    this.src = null;
    this.dataset = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function renderUsers(container, users) {
  const next = new Element('section');
  next.dataset.count = String(users.length);
  if (users.length === 0) {
    const empty = new Element('p');
    empty.textContent = input.emptyText;
    next.append(empty);
  } else {
    for (const user of users) {
      const card = new Element('article');
      card.dataset.id = user.id;
      const name = new Element('h3');
      name.textContent = user.name;
      card.append(name);
      const avatar = new Element('img');
      avatar.src = safeHttps(user.avatar);
      card.append(avatar);
      next.append(card);
    }
  }
  container.replaceChildren(next);
  return next;
}

const host = new Element('main');
const first = renderUsers(host, input.users);
const oldFirst = first;
const second = renderUsers(host, input.users.slice(0, 1));
console.log({
  cards: second.children.length,
  oldStillMounted: host.children.includes(oldFirst),
  unsafeAvatar: second.children[0].children[1].src,
  text: second.children[0].children[0].textContent,
  count: second.dataset.count
});
if (second.children.length !== 1) throw new Error('用户卡片数量错误');
if (host.children.includes(oldFirst)) throw new Error('重新渲染保留了旧节点');
if (second.children[0].children[1].src !== null) throw new Error('危险头像 URL 未被拒绝');
console.log('mini DOM render policy passed');
`,
      },
      stdin: JSON.stringify({
        emptyText: '暂无用户',
        users: [
          { id: 'u1', name: '<Ada>', avatar: 'javascript:alert(1)' },
          { id: 'u2', name: 'Grace', avatar: 'https://example.test/g.png' },
        ],
      }),
      checkpoint:
        '第二次只应有一个 article，旧容器已不在 host 中，危险头像 src 为 null，名称原样为 <Ada>；最后出现 mini DOM render policy passed，退出码为 0。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：事件冒泡、委托与默认行为': {
    title: 'JS 后续代码台 14 · 事件路径与稳定父节点',
    description:
      '用最小事件路径模型验证捕获、目标和冒泡顺序，再在稳定父节点上模拟 closest 委托。默认动作和停止传播作为独立标志观察，不用字符串拼接冒充浏览器事件。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-events-guided',
      title: '跟做：还原捕获与冒泡顺序',
      brief:
        '读取三层节点名，注册捕获与冒泡监听器，手动派发一次 click；输出 currentTarget 顺序，并比较 preventDefault 与 stopPropagation 的影响。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class EventNode {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.listeners = [];
  }
  addEventListener(type, capture, handler) {
    this.listeners.push({ type, capture, handler });
  }
  dispatch(type) {
    const path = [];
    for (let node = this; node; node = node.parent) path.push(node);
    const event = {
      type,
      target: this,
      currentTarget: null,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    };
    for (const node of [...path].reverse()) {
      if (event.propagationStopped) break;
      for (const listener of node.listeners.filter((item) => item.capture && item.type === type)) {
        event.currentTarget = node;
        listener.handler(event);
      }
    }
    for (const node of path) {
      if (event.propagationStopped) break;
      for (const listener of node.listeners.filter((item) => !item.capture && item.type === type)) {
        event.currentTarget = node;
        listener.handler(event);
      }
    }
    return event;
  }
}

const root = new EventNode(input.root);
const middle = new EventNode(input.middle, root);
const target = new EventNode(input.target, middle);
const seen = [];
middle.addEventListener('click', true, (event) => seen.push('capture:' + event.currentTarget.name));
target.addEventListener('click', false, (event) => {
  seen.push('target:' + event.currentTarget.name);
  event.preventDefault();
});
middle.addEventListener('click', false, (event) => {
  seen.push('bubble:' + event.currentTarget.name);
  event.stopPropagation();
});
root.addEventListener('click', false, () => seen.push('must-not-run'));

const event = target.dispatch('click');
console.log({ seen, defaultPrevented: event.defaultPrevented, propagationStopped: event.propagationStopped });
if (seen.join('>') !== 'capture:list>target:button>bubble:list') {
  throw new Error('事件路径顺序错误');
}
if (!event.defaultPrevented || !event.propagationStopped) throw new Error('事件标志未生效');
console.log('mini event dispatch passed');
`,
      },
      stdin: JSON.stringify({ root: 'window', middle: 'list', target: 'button' }),
      checkpoint:
        'seen 应为 capture:list>target:button>bubble:list，root 处理器不应运行；preventDefault 与 stopPropagation 都为 true，退出码为 0。真实浏览器还涉及 passive、composed 与渲染阶段，本模型只验证基础传播。',
    },
    apply: {
      id: 'javascript-remaining-events-independent',
      title: '独立实践：实现一次注册的动态列表委托',
      brief:
        '读取任务操作序列，在父列表上一次注册 click；根据 target 向上 closest 查找 data-action，只处理带 id 的删除按钮，空白点击不误删。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class EventTarget {
  constructor(tag, attrs = {}, parent = null) {
    this.tag = tag;
    this.attrs = attrs;
    this.parent = parent;
    this.handlers = [];
  }
  addEventListener(type, handler) { this.handlers.push({ type, handler }); }
  closest(predicate) {
    for (let node = this; node; node = node.parent) if (predicate(node)) return node;
    return null;
  }
  click() {
    const event = { type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (let node = this; node; node = node.parent) {
      for (const subscription of node.handlers.filter((item) => item.type === 'click')) {
        subscription.handler(event);
      }
    }
    return event;
  }
}

const list = new EventTarget('ul');
const items = input.tasks.map((task) => {
  const row = new EventTarget('li', { 'data-id': task.id }, list);
  const button = new EventTarget('button', { 'data-action': 'delete' }, row);
  return { row, button };
});
const blank = new EventTarget('div', {}, list);
const deleted = [];
list.addEventListener('click', (event) => {
  const action = event.target.closest((node) => node.attrs['data-action']);
  const row = event.target.closest((node) => node.attrs['data-id']);
  if (!action || !row) return;
  if (action.attrs['data-action'] === 'delete') {
    event.preventDefault();
    deleted.push(row.attrs['data-id']);
  }
});

const events = [items[0].button.click(), blank.click(), items[1].button.click()];
console.log({ deleted, defaultPrevented: events.map((event) => event.defaultPrevented), registrationCount: list.handlers.length });
if (deleted.join(',') !== 'T-1,T-2') throw new Error('委托处理了错误目标');
if (events[1].defaultPrevented) throw new Error('空白点击不应取消默认行为');
if (list.handlers.length !== 1) throw new Error('委托应只注册一次');
console.log('event delegation passed');
`,
      },
      stdin: JSON.stringify({ tasks: [{ id: 'T-1' }, { id: 'T-2' }] }),
      checkpoint:
        'deleted 应仅为 T-1,T-2，空白点击不改变它；默认行为仅在删除按钮上取消，父列表 handlers 数量为 1，最后出现 event delegation passed，退出码为 0。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：Fetch、响应、错误与流式读取': {
    title: 'JS 后续代码台 15 · 用本地 HTTP 回环验证 Fetch',
    description:
      '启动真实 Node HTTP 子进程，在 127.0.0.1 回环上验证状态码、JSON 与流式响应。所有连接、reader、server 和 child process 都在 finally 中清理。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-fetch-guided',
      title: '跟做：请求真实本地 JSON',
      brief:
        '运行 node main.js。父进程启动一个只监听随机本地端口的 HTTP 子进程，分别请求 200 与 422，检查 status、ok、content-type 与业务错误码。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const serverCode = [
  "const http = require('node:http');",
  "const server = http.createServer((req, res) => {",
  "  if (req.url === '/ok') { res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({order:'O-7', amount: 42})); return; }",
  "  res.writeHead(422, {'content-type':'application/json'});",
  "  res.end(JSON.stringify({code:'ORDER_INVALID'}));",
  "});",
  "server.listen(0, '127.0.0.1', () => console.log(server.address().port));"
].join('\\n');

function startServer() {
  const child = spawn(process.execPath, ['-e', serverCode], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8');
    child.stdout.once('data', (text) => {
      const value = Number(text.trim());
      if (!Number.isInteger(value)) reject(new Error('server port invalid'));
      else resolve(value);
    });
    child.once('error', reject);
  });
  return { child, port };
}

async function main() {
  const server = startServer();
  try {
    const port = await server.port;
    const ok = await fetch('http://127.0.0.1:' + port + '/ok');
    const okBody = await ok.json();
    const failed = await fetch('http://127.0.0.1:' + port + '/bad');
    const failedBody = await failed.json();
    console.log({
      okStatus: ok.status,
      okType: ok.headers.get('content-type'),
      okBody,
      badOk: failed.ok,
      badStatus: failed.status,
      badBody: failedBody
    });
    if (!ok.ok || ok.status !== 200 || okBody.amount !== 42) throw new Error('success response wrong');
    if (failed.ok || failed.status !== 422 || failedBody.code !== 'ORDER_INVALID') {
      throw new Error('HTTP error not classified');
    }
    console.log('local fetch contract passed');
  } finally {
    server.child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ expectStatus: 422 }),
      checkpoint:
        '输出应显示 200 的 ok、application/json、金额 42；422 的 ok=false、status=422、code=ORDER_INVALID；最后出现 local fetch contract passed，退出码为 0。子进程在 finally 中必须被终止。',
    },
    apply: {
      id: 'javascript-remaining-fetch-independent',
      title: '独立实践：读取分块响应并应用上限',
      brief:
        '启动本地流式 HTTP 服务，使用 response.body.getReader 与 TextDecoder 读取多块 UTF-8 文本；超过字节上限时主动取消 reader，最后释放锁。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const serverCode = [
  "const http = require('node:http');",
  "const server = http.createServer((req, res) => {",
  "  res.writeHead(200, {'content-type':'text/plain; charset=utf-8'});",
  "  let i = 0;",
  "  const timer = setInterval(() => {",
  "    if (i === 3) { clearInterval(timer); res.end(); return; }",
  "    res.write(i === 1 ? '中间块' : 'chunk-' + i);",
  "    i += 1;",
  "  }, 10);",
  "});",
  "server.listen(0, '127.0.0.1', () => console.log(server.address().port));"
].join('\\n');

function startServer() {
  const child = spawn(process.execPath, ['-e', serverCode], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  return {
    child,
    port: new Promise((resolve, reject) => {
      child.stdout.once('data', (text) => {
        const value = Number(text.trim());
        if (Number.isInteger(value)) resolve(value);
        else reject(new Error('invalid port'));
      });
      child.once('error', reject);
    })
  };
}

async function readLimited(response, limit) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel('limit exceeded');
        throw new RangeError('response too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes };
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  const server = startServer();
  try {
    const port = await server.port;
    const response = await fetch('http://127.0.0.1:' + port + '/stream');
    if (!response.ok || !response.body) throw new Error('response body missing');
    const result = await readLimited(response, input.limit);
    console.log(result);
    if (!result.text.includes('chunk-0') || !result.text.includes('中间块')) {
      throw new Error('stream decode incomplete');
    }
    console.log('stream reader passed');
  } finally {
    server.child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ limit: 1024 }),
      checkpoint:
        '输出的 text 应包含 chunk-0、中间块与后续块，bytes 小于等于 1024；最后出现 stream reader passed，退出码为 0。TextDecoder 使用 stream:true 处理跨块字符，reader 在 finally 中释放锁。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：Storage、IndexedDB 与离线边界': {
    title: 'JS 后续代码台 16 · 把浏览器存储边界落到文件与 Map',
    description:
      '用临时 JSON 文件与 Map 模拟同步存储和事务式缓存，验证 schemaVersion、TTL、查询作用域与配额失败。模拟只用于验证数据协议，真实 IndexedDB 仍需浏览器集成测试。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-storage-guided',
      title: '跟做：让同步存储也能失败',
      brief:
        '读取待存配置与损坏 JSON，先写临时文件再读取；覆盖配额错误、损坏数据和过期记录，确保应用有内存降级路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-storage-'));
const file = path.join(root, 'preferences.json');

function save(filePath, value, limit) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > limit) throw new RangeError('quota exceeded');
  fs.writeFileSync(filePath, text);
}

function load(filePath, now, ttlMs) {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (record.schemaVersion !== input.schemaVersion) throw new Error('schema mismatch');
    if (now - record.savedAt > ttlMs) return { value: null, reason: 'expired' };
    return { value: record.value, reason: 'fresh' };
  } catch (error) {
    return { value: null, reason: error.code === 'ENOENT' ? 'missing' : 'corrupt' };
  }
}

try {
  save(file, { schemaVersion: input.schemaVersion, savedAt: input.now, value: input.value }, 1024);
  const fresh = load(file, input.now + 5, input.ttlMs);
  const expired = load(file, input.now + input.ttlMs + 1, input.ttlMs);
  fs.writeFileSync(file, '{bad json');
  const corrupt = load(file, input.now, input.ttlMs);
  let quota = '';
  try {
    save(file, { payload: 'x'.repeat(2000) }, 100);
  } catch (error) {
    quota = error.name;
  }
  console.log({ fresh, expired, corrupt, quota });
  if (fresh.reason !== 'fresh' || fresh.value.theme !== input.value.theme) throw new Error('fresh read failed');
  if (expired.reason !== 'expired' || corrupt.reason !== 'corrupt') throw new Error('fallback read failed');
  if (quota !== 'RangeError') throw new Error('quota error not handled');
  console.log('storage boundaries passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        schemaVersion: 3,
        now: 1000,
        ttlMs: 50,
        value: { theme: 'dark', density: 'compact' },
      }),
      checkpoint:
        'fresh 应读到 dark，expired 与 corrupt 应分别标记，超限写入应得到 RangeError；最后出现 storage boundaries passed，退出码为 0。临时文件内容从不进入真实 localStorage。',
    },
    apply: {
      id: 'javascript-remaining-storage-independent',
      title: '独立实践：实现带查询作用域的离线快照',
      brief:
        '实现 Map 缓存 Repository：键包含查询与分页，记录 schemaVersion、updatedAt、source；离线读取只在 TTL 内命中，版本不符或过期返回 stale。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createRepository(now) {
  const records = new Map();
  const keyOf = (query) => input.schemaVersion + ':' + query.name + ':' + query.page;
  return {
    put(query, payload, updatedAt = now) {
      records.set(keyOf(query), {
        schemaVersion: input.schemaVersion,
        query: { ...query },
        payload,
        updatedAt
      });
    },
    get(query, currentTime = now) {
      const record = records.get(keyOf(query));
      if (!record) return { state: 'missing' };
      if (record.schemaVersion !== input.schemaVersion) return { state: 'stale', reason: 'schema' };
      if (currentTime - record.updatedAt > input.ttlMs) return { state: 'stale', reason: 'ttl' };
      return { state: 'fresh', payload: record.payload, updatedAt: record.updatedAt };
    },
    remove(query) { return records.delete(keyOf(query)); },
    keys() { return [...records.keys()]; }
  };
}

const repo = createRepository(input.now);
repo.put(input.queries[0], { items: ['A'] }, input.now - 10);
repo.put(input.queries[1], { items: ['B'] }, input.now - input.ttlMs - 1);
const fresh = repo.get(input.queries[0], input.now);
const expired = repo.get(input.queries[1], input.now);
const missing = repo.get({ name: 'other', page: 1 }, input.now);
repo.put(input.queries[0], { items: ['A2'] }, input.now);
const replaced = repo.get(input.queries[0], input.now);
const removed = repo.remove(input.queries[0]);

console.log({ fresh, expired, missing, replaced, removed, keys: repo.keys() });
if (fresh.state !== 'fresh' || fresh.payload.items[0] !== 'A') throw new Error('fresh query failed');
if (expired.state !== 'stale' || expired.reason !== 'ttl') throw new Error('TTL boundary failed');
if (missing.state !== 'missing' || !removed) throw new Error('missing/remove failed');
if (repo.get(input.queries[0]).state !== 'missing') throw new Error('remove did not delete key');
console.log('offline repository passed');
`,
      },
      stdin: JSON.stringify({
        schemaVersion: 3,
        now: 1000,
        ttlMs: 100,
        queries: [
          { name: 'gold', page: 1 },
          { name: 'silver', page: 1 },
        ],
      }),
      checkpoint:
        'gold 首次应为 fresh，silver 应为 stale/ttl，未知查询为 missing；删除后 gold 回到 missing，最后出现 offline repository passed，退出码为 0。查询条件必须进入缓存键。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：ESM、动态导入与包解析': {
    title: 'JS 后续代码台 17 · 让模块链接和导出绑定自己说话',
    description:
      '创建真实临时 ESM 文件，观察静态父模块、动态 import、活动绑定与模块缓存；再建立带 exports 的临时包，验证裸说明符只暴露公共入口。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-esm-guided',
      title: '跟做：观察活动绑定与动态加载',
      brief:
        '读取标签，写一个导出计数的 ESM 模块，动态导入两次并调用 increment；验证命名空间活动绑定更新、动态 import 返回 Promise 且同一模块缓存复用。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const label = fs.readFileSync(0, 'utf8').trim();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-esm-'));
  const modulePath = path.join(root, 'counter.mjs');
  try {
    fs.writeFileSync(modulePath, [
      'export let count = 0;',
      'export function increment() { count += 1; return count; }',
      'export const label = ' + JSON.stringify(label) + ';',
      ''
    ].join('\\n'));
    const first = await import(pathToFileURL(modulePath).href);
    const second = await import(pathToFileURL(modulePath).href);
    first.increment();
    second.increment();
    console.log({ label: first.label, count: first.count, sameNamespace: first === second, keys: Object.keys(first).sort() });
    if (first.count !== 2) throw new Error('活动绑定没有更新');
    if (first.label !== label) throw new Error('模块上下文标签错误');
    if (first !== second) throw new Error('模块缓存没有复用命名空间');
    if (Object.keys(first).sort().join(',') !== 'count,increment,label') {
      throw new Error('导出键不符合预期');
    }
    console.log('esm namespace passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: 'billing',
      checkpoint:
        '输出应显示 label=billing、count=2、sameNamespace=true，导出键为 count,increment,label；最后出现 esm namespace passed，退出码为 0。动态 import 返回 Promise，导入的命名空间对象是缓存的。',
    },
    apply: {
      id: 'javascript-remaining-esm-independent',
      title: '独立实践：用 package exports 封锁内部路径',
      brief:
        '读取工作区配置，在临时 node_modules 创建 @course/ui 包，通过公开入口导入成功，再尝试内部 src/secret.mjs 必须失败；验证 exports 是实际解析边界。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-package-'));
  const packageRoot = path.join(root, 'node_modules', '@course', 'ui');
  try {
    fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\\n');
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: '@course/ui',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './dist/index.js' }
    }, null, 2));
    fs.writeFileSync(path.join(packageRoot, 'dist', 'index.js'), 'export const sum = (xs) => xs.reduce((a, b) => a + b, 0);\\n');
    fs.writeFileSync(path.join(packageRoot, 'src', 'secret.js'), 'export const value = 42;\\n');
    const appPath = path.join(root, 'app.mjs');
    fs.writeFileSync(appPath, "import { sum } from '@course/ui'; console.log(sum([1,2,3]));\\n");

    const app = await import(pathToFileURL(appPath).href);
    let internalError = '';
    try {
      const probePath = path.join(root, 'internal-probe.mjs');
      fs.writeFileSync(probePath, "await import('@course/ui/src/secret.js');\\n");
      await import(pathToFileURL(probePath).href);
    } catch (error) {
      internalError = error.code || error.name;
    }
    console.log({ app: Boolean(app), internalError, packageRoot: path.basename(packageRoot) });
    if (!internalError.startsWith('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
      throw new Error('内部路径没有被 exports 封锁');
    }
    if (input.allowInternal !== false) throw new Error('配置不应允许内部导入');
    console.log('package exports boundary passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ packageName: '@course/ui', allowInternal: false }),
      checkpoint:
        '公开入口应能执行 sum([1,2,3])，内部 src/secret.js 应得到 ERR_PACKAGE_PATH_NOT_EXPORTED；最后出现 package exports boundary passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：pnpm、锁文件与依赖边界': {
    title: 'JS 后续代码台 18 · 固定依赖解析与工作区入口',
    description:
      '用 package.json、简化 pnpm 锁文件和工作区 exports 契约验证可复现安装。测试不调用网络或真实 pnpm，但会检查版本、完整性摘要、直接依赖和公开导入路径。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-pnpm-guided',
      title: '跟做：在冻结前发现清单漂移',
      brief:
        '读取 package.json、锁文件与 CI 模式，比较直接依赖版本和 lock 条目；模拟 frozen 模式在漂移时失败，普通模式生成可审查的差异说明。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function verifyInstall(manifest, lock, frozen) {
  const direct = Object.keys(manifest.dependencies).sort();
  const missing = direct.filter((name) => !lock.packages[name]);
  const mismatched = direct.filter((name) => {
    const locked = lock.packages[name]?.version;
    return locked && manifest.dependencies[name] !== locked;
  });
  if (frozen && (missing.length || mismatched.length)) {
    throw new Error('frozen lockfile mismatch: ' + [...missing, ...mismatched].join(','));
  }
  return {
    direct,
    missing,
    mismatched,
    lockHashes: direct.map((name) => lock.packages[name]?.integrity ?? null),
    frozen
  };
}

let frozenResult;
try {
  frozenResult = verifyInstall(input.manifest, input.lock, true);
} catch (error) {
  frozenResult = { error: error.message };
}
const normal = verifyInstall(input.manifest, input.lock, false);
console.log({ frozenResult, normal });
if (!frozenResult.error || !frozenResult.error.includes('frozen lockfile mismatch')) {
  throw new Error('frozen 模式没有阻断清单漂移');
}
if (normal.direct.join(',') !== 'chalk,lodash') throw new Error('直接依赖集合错误');
if (normal.lockHashes.some((value) => !value)) throw new Error('锁文件缺少完整性摘要');
console.log('lockfile contract passed');
`,
      },
      stdin: JSON.stringify({
        manifest: { dependencies: { lodash: '4.17.21', chalk: '5.0.0' } },
        lock: {
          packages: {
            chalk: { version: '5.6.0', integrity: 'sha512-chalk' },
            lodash: { version: '4.17.21', integrity: 'sha512-lodash' },
            ansi: { version: '6.0.0', integrity: 'sha512-ansi' },
          },
        },
      }),
      checkpoint:
        'frozenResult 应含 frozen lockfile mismatch，普通模式应列出 chalk,lodash 与两条完整性摘要，最后出现 lockfile contract passed，退出码为 0。清单改版本后必须重新生成锁文件并审查差异。',
    },
    apply: {
      id: 'javascript-remaining-pnpm-independent',
      title: '独立实践：工作区只允许公开入口',
      brief:
        '读取两个包的声明，生成临时 workspace 包与 node_modules 链接语义，验证 app 通过 workspace 包名导入；引用未声明的提升依赖和内部 src 路径都应失败。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-workspace-'));
  const pkgRoot = path.join(root, 'node_modules', '@course', 'ui');
  try {
    fs.mkdirSync(path.join(pkgRoot, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(pkgRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\\n');
    fs.writeFileSync(path.join(pkgRoot, 'package.json'), JSON.stringify({
      name: '@course/ui',
      version: '0.0.0',
      type: 'module',
      exports: { '.': './dist/index.js' },
      files: ['dist']
    }, null, 2));
    fs.writeFileSync(path.join(pkgRoot, 'dist', 'index.js'), 'export const button = (label) => \"[button]\" + label;\\n');
    fs.writeFileSync(path.join(pkgRoot, 'src', 'internal.js'), 'export const secret = \"internal\";\\n');
    const appPath = path.join(root, 'app.mjs');
    fs.writeFileSync(appPath, "import { button } from '@course/ui'; console.log(button('Save'));\\n");
    await import(pathToFileURL(appPath).href);

    let internalError = '';
    try {
      const internalProbe = path.join(root, 'internal-probe.mjs');
      fs.writeFileSync(internalProbe, "await import('@course/ui/src/internal.js');\\n");
      await import(pathToFileURL(internalProbe).href);
    } catch (error) {
      internalError = error.code || error.name;
    }
    let ghostError = '';
    try {
      const ghostProbe = path.join(root, 'ghost-probe.mjs');
      fs.writeFileSync(ghostProbe, "await import('left-pad');\\n");
      await import(pathToFileURL(ghostProbe).href);
    } catch (error) {
      ghostError = error.code || error.name;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
    console.log({ internalError, ghostError, publicExports: Object.keys(manifest.exports), files: manifest.files });
    if (!internalError.startsWith('ERR_PACKAGE_PATH_NOT_EXPORTED')) throw new Error('内部路径未封锁');
    if (!ghostError.includes('ERR_MODULE_NOT_FOUND')) throw new Error('未声明依赖不应可解析');
    if (Object.keys(manifest.exports).join(',') !== '.') throw new Error('公开入口范围错误');
    console.log('workspace boundary passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        app: { dependencies: { '@course/ui': 'workspace:*' } },
        package: { exports: { '.': './dist/index.js' } },
      }),
      checkpoint:
        'app 应成功导入 @course/ui；内部路径得到 ERR_PACKAGE_PATH_NOT_EXPORTED，未声明的 left-pad 得到 ERR_MODULE_NOT_FOUND，最后出现 workspace boundary passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：Vite 开发服务器和构建产物': {
    title: 'JS 后续代码台 19 · 区分源码入口与部署产物',
    description:
      '用 Node 标准库生成确定性的类 Vite 产物契约：源码模块生成哈希资源，HTML 只引用 dist 资源，base 决定绝对前缀。随后用本地静态服务器验证子路径、深链接与资源 404。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-vite-guided',
      title: '跟做：生成可核对的构建清单',
      brief:
        '读取入口源码与构建 ID，在临时 dist 生成内容哈希 JS、manifest.json 和 index.html；断言 HTML 不含 /src，哈希来自真实内容且清单与页面引用一致。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-vite-contract-'));
const dist = path.join(root, 'dist');

try {
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  const hash = crypto.createHash('sha256').update(input.source).digest('hex').slice(0, 8);
  const assetName = 'app-' + hash + '.js';
  const assetUrl = input.base + 'assets/' + assetName;
  fs.writeFileSync(path.join(dist, 'assets', assetName), input.source);
  const manifest = {
    release: input.release,
    entry: assetUrl,
    bytes: Buffer.byteLength(input.source),
    hash
  };
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Build proof</title></head>',
    '<body><div id="app"></div><script type="module" src="' + assetUrl + '"></script></body></html>'
  ].join('');
  fs.writeFileSync(path.join(dist, 'index.html'), html);

  const stored = fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(stored);
  const assetExists = fs.existsSync(path.join(dist, assetUrl.replace(input.base, '')));
  const evidence = {
    htmlHasSourcePath: html.includes('/src/'),
    htmlHasAsset: html.includes(assetUrl),
    manifestMatches: parsed.entry === assetUrl && parsed.release === input.release,
    assetExists
  };
  console.log(evidence);
  if (evidence.htmlHasSourcePath || !evidence.htmlHasAsset || !evidence.manifestMatches || !assetExists) {
    throw new Error('构建产物契约错误');
  }
  if (!/app-[0-9a-f]{8}\\.js$/.test(assetName)) throw new Error('资源没有内容哈希');
  console.log('build manifest contract passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        release: 'web-42',
        base: '/app/',
        source: "console.log('built asset');",
      }),
      checkpoint:
        '输出应显示 htmlHasSourcePath=false、htmlHasAsset=true、manifestMatches=true、assetExists=true；资源名符合 app-8位哈希.js，最后出现 build manifest contract passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-vite-independent',
      title: '独立实践：用静态服务器验证 base 与 404',
      brief:
        '启动真实本地 HTTP 服务器，模拟 /app/ 子路径部署：页面路由回退到 index.html，assets 缺失仍返回 404；输出每个请求的 status 与 content-type。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const http = require('node:http');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function startStaticServer(base) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname.startsWith(base)) {
      const relative = pathname.slice(base.length);
      if (!relative || !relative.includes('.')) {
        const html = '<!doctype html><html><body>subpath app</body></html>';
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        res.end(html);
        return;
      }
      if (relative === 'assets/app-a1b2c3d4.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' });
        res.end('console.log("asset")');
        return;
      }
    }
    const isAsset = pathname.includes('/assets/');
    res.writeHead(isAsset ? 404 : 404, { 'content-type': isAsset ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8' });
    res.end(isAsset ? 'asset missing' : 'route missing');
  });
  return {
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    }),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function main() {
  const app = startStaticServer(input.base);
  const port = await app.start();
  try {
    const urls = [
      'http://127.0.0.1:' + port + input.base,
      'http://127.0.0.1:' + port + input.base + 'orders/42',
      'http://127.0.0.1:' + port + input.base + 'assets/app-a1b2c3d4.js',
      'http://127.0.0.1:' + port + input.base + 'assets/missing.js'
    ];
    const responses = [];
    for (const url of urls) {
      const response = await fetch(url);
      responses.push({ url, status: response.status, type: response.headers.get('content-type'), cache: response.headers.get('cache-control') });
      await response.arrayBuffer();
    }
    console.log(responses);
    if (responses[0].status !== 200 || responses[1].status !== 200) throw new Error('页面或深链接加载失败');
    if (!responses[0].cache.includes('no-cache')) throw new Error('HTML 不应长期缓存');
    if (responses[2].status !== 200 || !responses[2].cache.includes('immutable')) throw new Error('哈希资源缓存策略错误');
    if (responses[3].status !== 404 || !responses[3].type.includes('text/plain')) throw new Error('缺失资源被路由回退吞掉');
    console.log('static preview contract passed');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ base: '/app/', environment: 'production' }),
      checkpoint:
        '首页与深链接应返回 200 text/html/no-cache，哈希 JS 返回 200 immutable，缺失 JS 返回 404 text/plain；最后出现 static preview contract passed，退出码为 0。真实 Vite 预览仍需以实际构建命令验证。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：ESLint、格式化和提交门禁': {
    title: 'JS 后续代码台 20 · 让静态检查在失败时真正阻断',
    description:
      '用 Node --check 验证语法，再用小型自定义规则检查未处理的安全 API 与调试残留。门禁结果不依赖编辑器，失败时输出文件、行号和规则名。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-lint-guided',
      title: '跟做：运行语法检查与禁用 API 扫描',
      brief:
        '读取两段源码写入临时文件，先调用 node --check 形成语法结论，再扫描 innerHTML、debugger、未使用 console 与未处理 Promise；确保坏样例失败、好样例通过。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-lint-'));

function lintSource(source) {
  const issues = [];
  const forbidden = [
    [/\\binnerHTML\\s*=/, 'no-unsafe-html'],
    [/\\bdebugger\\b/, 'no-debugger'],
    [/console\\.log\\(/, 'no-console'],
    [/(?<!await\\s+)(?<!return\\s+)(?<!void\\s+)fetch\\(/, 'no-floating-fetch']
  ];
  source.split('\\n').forEach((line, index) => {
    for (const [pattern, rule] of forbidden) if (pattern.test(line)) issues.push({ line: index + 1, rule });
  });
  return issues;
}

try {
  const reports = input.sources.map((source, index) => {
    const file = path.join(root, 'source-' + index + '.js');
    fs.writeFileSync(file, source);
    const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    return {
      name: input.names[index],
      syntax: syntax.status === 0 ? 'ok' : 'error',
      issues: lintSource(source)
    };
  });
  console.log(JSON.stringify(reports, null, 2));
  if (reports[0].syntax !== 'error') throw new Error('语法坏样例应失败');
  if (reports[1].syntax !== 'ok' || reports[1].issues.length !== 0) throw new Error('好样例不应报错');
  if (!reports[0].issues.some((issue) => issue.rule === 'no-unsafe-html')) {
    throw new Error('危险 HTML 规则未命中');
  }
  console.log('local lint gate passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        names: ['bad', 'good'],
        sources: [
          'const broken = ;\ndocument.querySelector(\"#x\").innerHTML = userInput;\n',
          'const value = 1;\nexport const answer = value;\n',
        ],
      }),
      checkpoint:
        'bad 的 syntax 应为 error，并命中 no-unsafe-html；good 的 syntax 为 ok 且 issues 为空；最后出现 local lint gate passed，退出码为 0。实际 ESLint 配置还需在仓库内运行同名命令验证。',
    },
    apply: {
      id: 'javascript-remaining-lint-independent',
      title: '独立实践：组合 lint、单测、构建与安全门禁',
      brief:
        '读取 CI 报告，验证安装模式、lint 警告、测试通过率、构建状态、安全等级与包体预算；任一硬门禁失败则整体 exitCode 为 1，并保留失败项。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function evaluate(report) {
  const checks = [
    { name: 'frozen-lockfile', ok: report.lockfile === 'frozen' },
    { name: 'lint', ok: report.lint.warnings === 0 && report.lint.errors === 0 },
    { name: 'unit', ok: report.tests.passed === report.tests.total && report.tests.total >= input.minimumTests },
    { name: 'build', ok: report.build === 'ok' },
    { name: 'security', ok: report.audit.high === 0 && report.audit.critical === 0 },
    { name: 'budget', ok: report.bundleKb <= input.bundleBudgetKb }
  ];
  return {
    checks,
    failed: checks.filter((check) => !check.ok).map((check) => check.name),
    exitCode: checks.every((check) => check.ok) ? 0 : 1,
    release: report.release
  };
}

const good = evaluate(input.good);
const bad = evaluate(input.bad);
console.log({ good, bad });
if (good.exitCode !== 0 || good.failed.length !== 0) throw new Error('合格报告被误阻断');
if (bad.exitCode !== 1) throw new Error('坏报告没有阻断');
for (const expected of ['unit', 'security', 'budget']) {
  if (!bad.failed.includes(expected)) throw new Error('缺少失败项: ' + expected);
}
console.log('ci quality gate passed');
`,
      },
      stdin: JSON.stringify({
        minimumTests: 20,
        bundleBudgetKb: 180,
        good: {
          release: 'rel-1',
          lockfile: 'frozen',
          lint: { warnings: 0, errors: 0 },
          tests: { passed: 24, total: 24 },
          build: 'ok',
          audit: { high: 0, critical: 0 },
          bundleKb: 174,
        },
        bad: {
          release: 'rel-2',
          lockfile: 'frozen',
          lint: { warnings: 0, errors: 0 },
          tests: { passed: 18, total: 20 },
          build: 'ok',
          audit: { high: 1, critical: 0 },
          bundleKb: 224,
        },
      }),
      checkpoint:
        'good 的 exitCode 为 0；bad 的 exitCode 为 1，failed 必须包含 unit、security、budget；最后出现 ci quality gate passed，退出码为 0。格式化通过不能替代测试或安全门禁。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：长任务、渲染与交互延迟': {
    title: 'JS 后续代码台 21 · 把长任务拆成可交付的帧预算',
    description:
      '用真实 setImmediate 观察阻塞与让出点，再用虚拟帧预算检查任务队列、布局读写批次和交互响应。计时不依赖脆弱阈值，而以执行顺序、批次数和固定预算证明。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-longtask-guided',
      title: '跟做：同步阻塞与增量让出对照',
      brief:
        '读取工作量，先同步处理并记录无法插入的即时标记，再分块处理并在每批后 await setImmediate；两组摘要必须一致，分块版本的中间标记必须执行。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const values = Array.from({ length: input.count }, (_, index) => (index * 17 + 3) % 101);

function summarize(rows) {
  let sum = 0;
  let max = -Infinity;
  for (const value of rows) {
    for (let spin = 0; spin < 20; spin += 1) sum += (value + spin) % 7;
    max = Math.max(max, value);
  }
  return { sum, max };
}

async function chunked(rows, size, onYield) {
  let sum = 0;
  let max = -Infinity;
  for (let start = 0; start < rows.length; start += size) {
    for (const value of rows.slice(start, start + size)) {
      for (let spin = 0; spin < 20; spin += 1) sum += (value + spin) % 7;
      max = Math.max(max, value);
    }
    const marker = 'yield-' + Math.min(start + size, rows.length);
    onYield(marker);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { sum, max };
}

async function main() {
  const syncResult = summarize(values);
  const markers = [];
  const chunkResult = await chunked(values, input.batchSize, (marker) => markers.push(marker));
  console.log({ syncResult, chunkResult, markers });
  if (syncResult.sum !== chunkResult.sum || syncResult.max !== chunkResult.max) {
    throw new Error('切片改变了汇总结果');
  }
  if (markers.length < input.expectedMinimumYields) throw new Error('没有产生足够的让出点');
  if (markers[0] !== 'yield-' + input.batchSize) throw new Error('首批完成标记错误');
  console.log('long task slicing passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ count: 60, batchSize: 15, expectedMinimumYields: 4 }),
      checkpoint:
        'syncResult 与 chunkResult 的 sum、max 必须一致，markers 至少四项并以 yield-15 开始；最后出现 long task slicing passed，退出码为 0。setImmediate 提供真实让出事件循环的机会。',
    },
    apply: {
      id: 'javascript-remaining-longtask-independent',
      title: '独立实践：计算最长帧并消除布局抖动',
      brief:
        '读取任务耗时，按 50ms 帧分块；再把交替的读尺寸/写样式序列改成先读后写。输出最长任务、帧数量和布局读写批次。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function schedule(tasks, budgetMs) {
  const frames = [];
  let current = { duration: 0, tasks: [] };
  let longestTask = 0;
  for (const task of tasks) {
    longestTask = Math.max(longestTask, task.duration);
    if (current.duration > 0 && current.duration + task.duration > budgetMs) {
      frames.push(current);
      current = { duration: 0, tasks: [] };
    }
    current.duration += task.duration;
    current.tasks.push(task.name);
  }
  if (current.tasks.length) frames.push(current);
  return { frames, longestTask };
}

function batchedLayout(entries) {
  const reads = [];
  const writes = [];
  for (const entry of entries) reads.push({ name: entry.name, height: entry.baseHeight + entry.rows * 4 });
  for (const entry of reads) writes.push(entry.name + ':' + entry.height);
  return { reads, writes, batches: 2 };
}

const scheduled = schedule(input.tasks, input.budgetMs);
const layout = batchedLayout(input.layout);
console.log({ scheduled, layout });
if (scheduled.frames.some((frame) => frame.duration > input.budgetMs)) throw new Error('存在超预算帧');
if (scheduled.longestTask !== input.expectedLongestTask) throw new Error('最长任务计算错误');
if (layout.reads.length !== input.layout.length || layout.writes.length !== input.layout.length) {
  throw new Error('布局读写数量错误');
}
if (layout.batches !== 2) throw new Error('布局读写没有批量执行');
console.log('frame budget passed');
`,
      },
      stdin: JSON.stringify({
        budgetMs: 50,
        tasks: [
          { name: 'parse', duration: 18 },
          { name: 'filter', duration: 14 },
          { name: 'sort', duration: 21 },
          { name: 'render', duration: 16 },
          { name: 'focus', duration: 7 },
        ],
        layout: [
          { name: 'card-a', baseHeight: 20, rows: 2 },
          { name: 'card-b', baseHeight: 30, rows: 4 },
        ],
        expectedLongestTask: 21,
      }),
      checkpoint:
        '所有帧 duration 不超过 50，longestTask 为 21，两次布局读取与两次写入各成一批，最后出现 frame budget passed，退出码为 0。真实性能仍需在浏览器 Performance 面板验证。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：包体、代码分割和缓存': {
    title: 'JS 后续代码台 22 · 让首屏只下载首屏需要的代码',
    description:
      '从真实临时模块图计算静态与动态依赖，生成内容哈希和独立 chunk；再用本地 HTTP 服务验证入口、哈希资源和 API 的缓存策略不会互换。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-bundle-guided',
      title: '跟做：从模块图生成可缓存 chunk',
      brief:
        '读取模块源码和入口，递归标记静态与动态依赖，计算每个 chunk 的 SHA-256 哈希；断言图表动态模块不进入首屏，修改它也不会改变入口哈希。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-bundle-'));

function hash(source) {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 10);
}

function splitGraph(modules, entry) {
  const staticModules = [];
  const dynamicModules = [];
  const visit = (name, bucket) => {
    if (bucket.includes(name)) return;
    bucket.push(name);
    for (const dependency of modules[name].static ?? []) visit(dependency, bucket);
    for (const dependency of modules[name].dynamic ?? []) visit(dependency, dynamicModules);
  };
  visit(entry, staticModules);
  return { staticModules, dynamicModules };
}

try {
  for (const [name, module] of Object.entries(input.modules)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, module.source);
  }
  const graph = splitGraph(input.modules, input.entry);
  const entrySource = graph.staticModules.map((name) => input.modules[name].source).join('\\n');
  const chartSource = graph.dynamicModules.map((name) => input.modules[name].source).join('\\n');
  const entryHash = hash(entrySource);
  const chartHash = hash(chartSource);
  const modifiedChartHash = hash(chartSource + '\\nconsole.log("changed");');
  const manifest = { entry: 'app-' + entryHash + '.js', dynamic: { chart: 'chart-' + chartHash + '.js' } };
  console.log({ graph, manifest, chartChangeKeepsEntry: entryHash === hash(entrySource) });

  if (graph.staticModules.includes('features/chart.js')) throw new Error('动态图表进入首屏图');
  if (!graph.dynamicModules.includes('features/chart.js')) throw new Error('动态图表没有被单独标记');
  if (entryHash === modifiedChartHash) throw new Error('图表哈希没有独立变化');
  if (!manifest.entry.match(/^app-[0-9a-f]{10}\\.js$/)) throw new Error('入口文件名没有内容哈希');
  console.log('bundle graph split passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        entry: 'main.js',
        modules: {
          'main.js': { source: "import './shell.js'; import('./features/chart.js');", static: ['shell.js'], dynamic: ['features/chart.js'] },
          'shell.js': { source: "import './ui.js';", static: ['ui.js'], dynamic: [] },
          'ui.js': { source: "export const shell = true;", static: [], dynamic: [] },
          'features/chart.js': { source: "export const chart = true;", static: [], dynamic: [] },
        },
      }),
      checkpoint:
        '静态图应为 main.js、shell.js、ui.js，chart 只在 dynamicModules；入口文件名符合 app-10位哈希.js，修改 chart 片段不会改变入口哈希，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-bundle-independent',
      title: '独立实践：验证 HTML、哈希资源与 API 的缓存矩阵',
      brief:
        '启动本地 HTTP 服务，分别返回 no-cache HTML、immutable 哈希 JS、no-store API 和缺失旧资源 404；断言每类资源只使用自己的策略。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const http = require('node:http');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

async function main() {
  const routes = {
    '/': { status: 200, type: 'text/html; charset=utf-8', cache: 'no-cache', body: '<!doctype html><script type="module" src="/assets/app-1234567890.js"></script>' },
    '/assets/app-1234567890.js': { status: 200, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=31536000, immutable', body: 'console.log("immutable")' },
    '/api/config': { status: 200, type: 'application/json', cache: 'no-store', body: JSON.stringify({ environment: input.environment }) },
    '/assets/old-hash.js': { status: 404, type: 'text/plain; charset=utf-8', cache: 'no-store', body: 'missing' }
  };
  const server = http.createServer((req, res) => {
    const route = routes[req.url] ?? routes['/assets/old-hash.js'];
    res.writeHead(route.status, { 'content-type': route.type, 'cache-control': route.cache });
    res.end(route.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = server.address().port;
    const report = [];
    for (const pathname of Object.keys(routes)) {
      const response = await fetch('http://127.0.0.1:' + port + pathname);
      report.push({ pathname, status: response.status, cache: response.headers.get('cache-control'), type: response.headers.get('content-type') });
      await response.arrayBuffer();
    }
    console.log(report);
    const byPath = Object.fromEntries(report.map((item) => [item.pathname, item]));
    if (byPath['/'].cache !== 'no-cache') throw new Error('入口缓存错误');
    if (!byPath['/assets/app-1234567890.js'].cache.includes('immutable')) throw new Error('哈希资源缓存错误');
    if (byPath['/api/config'].cache !== 'no-store') throw new Error('API 缓存错误');
    if (byPath['/assets/old-hash.js'].status !== 404) throw new Error('旧资源没有返回 404');
    console.log('cache matrix passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ environment: 'production' }),
      checkpoint:
        '报告中的 HTML 应为 no-cache、哈希 JS 为 immutable、API 为 no-store、旧哈希资源为 404；最后出现 cache matrix passed，退出码为 0。目录入口与内容资源不能共享同一种强缓存。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：静态站点、CDN 与环境配置': {
    title: 'JS 后续代码台 23 · 构建期配置与 CDN 安全头',
    description:
      '先只把 VITE_ 公开变量注入客户端，保留秘密在部署侧；再用本地 CDN 预览服务验证子路径、路由回退、资源 404、CSP 与缓存头。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-cdn-guided',
      title: '跟做：生成不含秘密的构建配置',
      brief:
        '读取 env 与 base，按 VITE_ 前缀筛选客户端变量，生成 release 清单；扫描产物确认只含 API URL 和发布 ID，不含服务端 token。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function buildClientConfig(env) {
  const publicEntries = Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => key.startsWith('VITE_'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key.slice(5), value])
  );
  return publicEntries;
}

function scanSecrets(text, env) {
  return Object.entries(env)
    .filter(([key]) => !key.startsWith('VITE_'))
    .filter(([, value]) => value && text.includes(value))
    .map(([key]) => key);
}

const client = buildClientConfig(input.env);
const artifact = JSON.stringify({
  base: input.base,
  release: input.release,
  apiUrl: client.API_URL,
  buildTime: input.buildTime
});
const leaked = scanSecrets(artifact + '\\n' + JSON.stringify(client), input.env);
console.log({ client, artifact, leaked });
if (client.API_URL !== 'https://api.example.test') throw new Error('公开 API URL 缺失');
if ('API_TOKEN' in client || 'DB_PASSWORD' in client) throw new Error('秘密进入客户端配置');
if (leaked.length !== 0) throw new Error('构建产物扫描到秘密: ' + leaked.join(','));
if (!input.base.endsWith('/') || !input.release) throw new Error('base 或 release 不合法');
console.log('client environment boundary passed');
`,
      },
      stdin: JSON.stringify({
        base: '/shop/',
        release: '2026.11.24.1',
        buildTime: '2026-11-24T08:00:00.000Z',
        env: {
          VITE_API_URL: 'https://api.example.test',
          VITE_FEATURE_SEARCH: 'true',
          API_TOKEN: 'super-secret-token',
          DB_PASSWORD: 'do-not-ship',
        },
      }),
      checkpoint:
        'client 只能含 API_URL 与 FEATURE_SEARCH，artifact 不含 token/password，leaked 为空，最后出现 client environment boundary passed，退出码为 0。非 VITE_ 变量即使存在于构建机也不能进入浏览器。',
    },
    apply: {
      id: 'javascript-remaining-cdn-independent',
      title: '独立实践：本地 CDN 预览与 CSP 安全头',
      brief:
        '启动真实本地静态服务，按 /app/ base 返回首页和哈希资源；检查 CSP、nosniff、Referrer-Policy，且缺失资源 404 不被路由回退吞掉。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const http = require('node:http');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

async function main() {
  const csp = "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    const headers = {
      'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };
    if (pathname === input.base || pathname.startsWith(input.base + 'orders/')) {
      res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end('<!doctype html><html><body>cdn app</body></html>');
      return;
    }
    if (pathname === input.base + 'assets/app-1234567890.js') {
      res.writeHead(200, { ...headers, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' });
      res.end('console.log("cdn asset")');
      return;
    }
    const asset = pathname.startsWith(input.base + 'assets/');
    res.writeHead(404, { ...headers, 'content-type': asset ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(asset ? 'asset missing' : 'route missing');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = server.address().port;
    const paths = ['/app/', '/app/orders/42', '/app/assets/app-1234567890.js', '/app/assets/missing.js'];
    const report = [];
    for (const pathname of paths) {
      const response = await fetch('http://127.0.0.1:' + port + pathname);
      report.push({
        pathname,
        status: response.status,
        type: response.headers.get('content-type'),
        csp: response.headers.get('content-security-policy'),
        nosniff: response.headers.get('x-content-type-options'),
        referrer: response.headers.get('referrer-policy')
      });
      await response.arrayBuffer();
    }
    console.log(report);
    if (report[0].status !== 200 || report[1].status !== 200) throw new Error('页面路径失败');
    if (report[2].status !== 200 || !report[2].type.includes('javascript')) throw new Error('哈希资源失败');
    if (report[3].status !== 404 || !report[3].type.includes('text/plain')) throw new Error('缺失资源被回退吞掉');
    if (report.some((item) => !item.csp.includes("object-src 'none'") || item.nosniff !== 'nosniff')) {
      throw new Error('安全头缺失');
    }
    console.log('cdn preview policy passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ base: '/app/' }),
      checkpoint:
        '首页与深链接为 200，哈希 JS 为 200 JavaScript，缺失 JS 为 404 文本；所有响应都应有 CSP、nosniff 与 Referrer-Policy，最后出现 cdn preview policy passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：JavaScript 企业应用毕业项目': {
    title: 'JS 后续代码台 24 · 从业务输入到发布证据的完整交付',
    description:
      '把纯业务计算、取消竞态、安全文本、错误脱敏、缓存快照和发布门禁串成一条可运行链路。所有外部能力由标准库和显式适配器提供，结果可重复审计。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-capstone-guided',
      title: '跟做：运行一条端到端业务链',
      brief:
        '读取订单、查询与故障样本，完成校验、总额、旧请求隔离、文本转义、错误脱敏和文件缓存；输出单一最终快照并断言所有边界。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-capstone-'));

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function normalizeOrder(order) {
  if (!order || typeof order.id !== 'string' || !order.id.trim()) throw new TypeError('id');
  const lines = order.lines.map((line) => {
    if (!Number.isFinite(line.price) || line.price < 0) throw new RangeError('price');
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new RangeError('quantity');
    return { sku: line.sku, price: line.price, quantity: line.quantity };
  });
  return { ...order, id: order.id.trim(), lines, total: Number(lines.reduce((sum, line) => sum + line.price * line.quantity, 0).toFixed(2)) };
}

function redactError(error, context) {
  const text = String(error.message).replace(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/g, '[email]').replace(/token=[^&\\s]+/gi, 'token=[secret]');
  return { level: 'error', code: error.code || 'UNKNOWN', message: text, route: context.route, release: input.release };
}

async function guardedQuery(query, value, isOld) {
  const controller = new AbortController();
  if (isOld) controller.abort(new DOMException('superseded', 'AbortError'));
  await Promise.resolve();
  if (controller.signal.aborted) throw controller.signal.reason;
  return { query, value };
}

async function main() {
  try {
    const order = normalizeOrder(input.order);
    const oldResult = await guardedQuery('old', input.queries[0], true).catch((error) => ({ skipped: error.name }));
    const latest = await guardedQuery(input.query, input.queries[1], false);
    const safeLabel = escapeText(input.untrustedLabel);
    const error = Object.assign(new Error('token=abc123 user ada@example.test denied'), { code: 'ACCESS_DENIED' });
    const event = redactError(error, { route: '/orders/' + order.id });
    const cacheFile = path.join(root, 'snapshot.json');
    fs.writeFileSync(cacheFile, JSON.stringify({ schemaVersion: input.schemaVersion, savedAt: input.savedAt, order, latest }));
    const restored = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const finalReport = { order, oldResult, latest, safeLabel, event, restored, release: input.release };
    console.log(JSON.stringify(finalReport, null, 2));

    if (order.total !== input.expectedTotal) throw new Error('业务总额错误');
    if (oldResult.skipped !== 'AbortError' || latest.value !== input.queries[1]) throw new Error('竞态提交错误');
    if (safeLabel.includes('<') || !safeLabel.includes('&lt;')) throw new Error('文本转义错误');
    if (JSON.stringify(event).includes('abc123') || JSON.stringify(event).includes('ada@example.test')) {
      throw new Error('错误事件泄漏秘密');
    }
    if (restored.schemaVersion !== input.schemaVersion || restored.order.total !== input.expectedTotal) {
      throw new Error('离线快照不完整');
    }
    console.log('capstone business pipeline passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        release: 'capstone-1',
        schemaVersion: 4,
        savedAt: 1000,
        query: 'silver',
        queries: ['gold', 'silver'],
        untrustedLabel: '<img src=x onerror=alert(1)>',
        order: {
          id: ' O-501 ',
          lines: [
            { sku: 'A', price: 19.9, quantity: 2 },
            { sku: 'B', price: 4.5, quantity: 4 },
          ],
        },
        expectedTotal: 57.8,
      }),
      checkpoint:
        'order.total 为 57.8，旧查询记录 AbortError，新查询保留 silver；标签只有 &lt; 实体，错误事件不含原始 token/邮箱，缓存可恢复 schemaVersion=4；最后出现 capstone business pipeline passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-capstone-independent',
      title: '独立实践：质量失败时完成回滚与事故报告',
      brief:
        '读取发布候选与上一稳定版本，按测试、安全、包体、性能、XSS 回归和错误率门禁判断；失败时生成回滚清单、脱敏事故记录与可复查证据。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function evaluateRelease(candidate) {
  const checks = [
    { name: 'unit', ok: candidate.tests.failed === 0 && candidate.tests.total >= input.minimumTests },
    { name: 'security', ok: candidate.security.critical === 0 && candidate.security.high === 0 },
    { name: 'bundle', ok: candidate.bundleKb <= input.bundleBudgetKb },
    { name: 'performance', ok: candidate.performance.inpP75 <= input.inpBudgetMs },
    { name: 'xss', ok: candidate.xssBlocked === true },
    { name: 'error-rate', ok: candidate.errorRate <= input.errorRateLimit }
  ];
  return checks;
}

function redact(message) {
  return String(message)
    .replace(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(token|secret)=[^&\\s]+/gi, '$1=[secret]');
}

const checks = evaluateRelease(input.candidate);
const failed = checks.filter((check) => !check.ok).map((check) => check.name);
const decision = {
  release: input.candidate.release,
  promoted: failed.length === 0,
  failed,
  rolledBackTo: failed.length ? input.previousRelease : null,
  runbook: failed.length ? input.runbook : [],
  incident: failed.length ? {
    message: redact(input.candidate.incident || 'release gate failed'),
    evidence: failed.map((name) => name + ':failed'),
    owner: input.owner
  } : null
};
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'js-release-proof-'));
const artifact = path.join(artifactRoot, '.release-proof.json');
fs.writeFileSync(artifact, JSON.stringify(decision, null, 2));
try {
  console.log(decision);
  if (decision.promoted !== input.expectPromoted) throw new Error('发布决策与预期不符');
  if (!decision.promoted) {
    if (decision.rolledBackTo !== input.previousRelease) throw new Error('回滚版本错误');
    if (!decision.runbook.length) throw new Error('缺少回滚步骤');
    if (!decision.incident || JSON.stringify(decision.incident).includes('abc123')) throw new Error('事故记录未脱敏');
    for (const expected of input.expectedFailed) {
      if (!decision.failed.includes(expected)) throw new Error('缺少失败项: ' + expected);
    }
  }
  const reread = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  if (reread.release !== input.candidate.release) throw new Error('发布证据不可恢复');
  console.log('capstone release gate passed');
} finally {
  fs.rmSync(artifact, { force: true });
  fs.rmSync(artifactRoot, { recursive: true, force: true });
}
`,
      },
      stdin: JSON.stringify({
        minimumTests: 30,
        bundleBudgetKb: 180,
        inpBudgetMs: 200,
        errorRateLimit: 0.01,
        previousRelease: 'stable-2026.11.23',
        owner: 'web-oncall',
        expectPromoted: false,
        expectedFailed: ['unit', 'security', 'bundle', 'xss'],
        runbook: ['freeze-candidate', 'switch-cdn-entry-to-previous', 'run-smoke', 'notify-owner'],
        candidate: {
          release: 'candidate-2026.11.24',
          tests: { passed: 27, failed: 3, total: 30 },
          security: { critical: 0, high: 1 },
          bundleKb: 226,
          performance: { inpP75: 188 },
          xssBlocked: false,
          errorRate: 0.006,
          incident: 'gate failed for ada@example.test token=abc123',
        },
      }),
      checkpoint:
        '决策应拒绝 candidate，failed 含 unit、security、bundle、xss，rolledBackTo 为 stable-2026.11.23；runbook 有步骤，incident 已脱敏，最后出现 capstone release gate passed，退出码为 0。写入工作目录的临时证据会在 finally 删除。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：对象模型调试与重构': {
    title: 'JS 后续代码台 25 · 从对象快照追到共享引用',
    description:
      '用 Reflect.ownKeys、属性描述符和原型引用建立对象快照，定位两个实例共享数组的根因；再把外层 class 重构为工厂，同时保留公开方法与错误契约。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-object-debug-guided',
      title: '跟做：比较结构、原型与引用',
      brief:
        '读取标签数组，创建两个共享标签的直接赋值实例与两个复制标签的修复实例；输出自有键、原型名、descriptor 与数组身份。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const shared = [...input.tags];

class Projection {
  constructor(rows) { this.rows = rows; }
  count() { return this.rows.length; }
}
class FixedProjection extends Projection {
  constructor(rows) { super([...rows]); }
}

const brokenA = new Projection(shared);
const brokenB = new Projection(shared);
const fixedA = new FixedProjection(input.tags);
const fixedB = new FixedProjection(input.tags);
brokenA.rows.push('broken');
fixedA.rows.push('fixed');

function snapshot(value) {
  return {
    ownKeys: Reflect.ownKeys(value).map(String).sort(),
    prototype: Object.getPrototypeOf(value).constructor.name,
    descriptor: Object.getOwnPropertyDescriptor(value, 'rows'),
    count: value.count()
  };
}
const result = {
  brokenA: snapshot(brokenA),
  brokenB: snapshot(brokenB),
  brokenShared: brokenA.rows === brokenB.rows,
  fixedShared: fixedA.rows === fixedB.rows,
  fixedCounts: [fixedA.count(), fixedB.count()]
};
console.log(JSON.stringify(result, null, 2));
if (!result.brokenShared || result.fixedShared) throw new Error('共享引用关系错误');
if (fixedA.count() === fixedB.count()) throw new Error('修复实例没有独立复制');
if (!result.brokenA.ownKeys.includes('rows') || result.brokenA.prototype !== 'Projection') {
  throw new Error('对象快照不完整');
}
console.log('object graph evidence passed');
`,
      },
      stdin: JSON.stringify({ tags: ['one', 'two'] }),
      checkpoint:
        'brokenShared 必须为 true、fixedShared 为 false，两个 fixedCounts 应不同；brokenA 自有键含 rows 且原型名为 Projection，最后出现 object graph evidence passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-object-debug-independent',
      title: '独立实践：保留行为契约的小步重构',
      brief:
        '读取折扣输入，让旧 class 和工厂适配器对同一快照产生相同结果；同时证明两个工厂实例状态独立、普通函数解构调用会失败。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

class LegacyCart {
  constructor(rows) { this.rows = [...rows]; }
  total() { return Number(this.rows.reduce((sum, row) => sum + row.price * row.quantity, 0).toFixed(2)); }
  add(row) {
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new RangeError('quantity');
    this.rows.push({ ...row });
    return this.total();
  }
}

function createCart(rows) {
  const state = [...rows];
  function total() {
    return Number(state.reduce((sum, row) => sum + row.price * row.quantity, 0).toFixed(2));
  }
  return Object.freeze({
    total,
    add(row) {
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new RangeError('quantity');
      state.push({ ...row });
      return total();
    },
    snapshot: () => state.map((row) => ({ ...row }))
  });
}

const legacy = new LegacyCart(input.rows);
const cart = createCart(input.rows);
const second = createCart(input.rows);
const legacyTotal = legacy.add(input.extra);
const factoryTotal = cart.add(input.extra);
second.add({ sku: 'Z', price: 10, quantity: 1 });
const detached = legacy.total;
let detachedError = '';
try {
  detached();
} catch (error) {
  detachedError = error.name;
}

console.log({ legacyTotal, factoryTotal, factorySnapshot: cart.snapshot(), secondSnapshot: second.snapshot(), detachedError });
if (legacyTotal !== input.expectedTotal || factoryTotal !== input.expectedTotal) {
  throw new Error('重构前后业务结果不一致');
}
if (cart.snapshot().length !== second.snapshot().length) throw new Error('工厂实例共享状态');
if (detachedError !== 'TypeError') throw new Error('旧方法接收者错误没有显式暴露');
console.log('object refactor parity passed');
`,
      },
      stdin: JSON.stringify({
        rows: [{ sku: 'A', price: 19.9, quantity: 2 }],
        extra: { sku: 'B', price: 5, quantity: 3 },
        expectedTotal: 54.8,
      }),
      checkpoint:
        'legacyTotal 与 factoryTotal 都应为 54.8，cart 与 second 的快照长度不同，legacy.total 解构调用报 TypeError，最后出现 object refactor parity passed，退出码为 0。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：表单、焦点与可访问交互': {
    title: 'JS 后续代码台 26 · 用状态模型验证表单与焦点',
    description:
      '用确定性控件模型验证 label、FormData、约束错误与重复提交保护，再模拟错误摘要聚焦和字段回跳。模型不负责浏览器渲染，但每个可访问状态都有断言。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-form-guided',
      title: '跟做：校验控件并生成 FormData 语义',
      brief:
        '读取两个字段，验证必填、邮件格式与最小长度；输出 name/value/error/ariaInvalid，并阻止无效表单提交。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function validate(controls) {
  const errors = [];
  const values = new Map();
  for (const control of controls) {
    const value = String(control.value ?? '').trim();
    if (control.required && !value) errors.push({ name: control.name, id: control.id, message: '必填' });
    else if (control.type === 'email' && value && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value)) {
      errors.push({ name: control.name, id: control.id, message: '邮箱格式错误' });
    }
    values.set(control.name, value);
  }
  return {
    valid: errors.length === 0,
    errors,
    formData: Object.fromEntries(values),
    ariaInvalid: controls.map((control) => ({
      id: control.id,
      value: errors.some((error) => error.id === control.id) ? 'true' : 'false'
    }))
  };
}

const first = validate(input.invalidControls);
const second = validate(input.validControls);
console.log({ first, second });
if (first.valid || first.errors.length !== 1) throw new Error('无效表单没有阻止提交');
if (!second.valid || second.formData.email !== input.validControls[0].value) throw new Error('有效表单数据错误');
if (first.ariaInvalid[0].value !== 'false' || first.ariaInvalid[1].value !== 'true') {
  throw new Error('aria-invalid 映射错误');
}
console.log('form semantics passed');
`,
      },
      stdin: JSON.stringify({
        invalidControls: [
          { id: 'name', name: 'name', type: 'text', value: 'Ada', required: true },
          { id: 'email', name: 'email', type: 'email', value: 'bad', required: true },
        ],
        validControls: [
          { id: 'email', name: 'email', type: 'email', value: 'ada@example.test', required: true },
        ],
      }),
      checkpoint:
        'invalidControls 应产生一条邮箱格式错误，valid=false；validControls 应通过且 FormData.email 为 ada@example.test；aria-invalid 正确映射，最后出现 form semantics passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-form-independent',
      title: '独立实践：错误摘要聚焦与重复提交保护',
      brief:
        '模拟表单提交两次：第一次失败后焦点来 error-summary，字段获得 aria-invalid；修复后只允许一个请求提交成功，焦点返回状态消息。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createFormModel(controls) {
  const state = {
    controls: controls.map((control) => ({ ...control, ariaInvalid: false, value: control.value ?? '' })),
    busy: false,
    requests: 0,
    focus: controls[0]?.id ?? null,
    liveMessage: '',
    errors: []
  };
  return {
    submit(valid) {
      if (state.busy) return { accepted: false, reason: 'busy' };
      state.busy = true;
      state.requests += 1;
      if (!valid) {
        state.busy = false;
        state.errors = [{ field: 'email', message: input.errorText }];
        for (const control of state.controls) {
          control.ariaInvalid = control.id === 'email';
        }
        state.focus = 'error-summary';
        state.liveMessage = input.errorText;
        return { accepted: false, reason: 'invalid', focus: state.focus };
      }
      state.errors = [];
      state.liveMessage = input.successText;
      state.focus = 'status';
      state.busy = false;
      return { accepted: true, focus: state.focus };
    },
    fixEmail(value) {
      const email = state.controls.find((control) => control.id === 'email');
      email.value = value;
      email.ariaInvalid = false;
    },
    snapshot: () => ({
      busy: state.busy,
      requests: state.requests,
      focus: state.focus,
      errors: state.errors,
      liveMessage: state.liveMessage,
      controls: state.controls.map((control) => ({ id: control.id, value: control.value, ariaInvalid: control.ariaInvalid }))
    })
  };
}

const form = createFormModel(input.controls);
const invalid = form.submit(false);
const firstSnapshot = form.snapshot();
form.fixEmail(input.fixedEmail);
const success = form.submit(true);
const secondSnapshot = form.snapshot();
console.log({ invalid, success, firstSnapshot, secondSnapshot });
if (invalid.reason !== 'invalid' || firstSnapshot.focus !== 'error-summary') throw new Error('错误摘要焦点错误');
if (firstSnapshot.controls.find((control) => control.id === 'email').ariaInvalid !== true) throw new Error('字段没有标记无效');
if (!success.accepted || secondSnapshot.focus !== 'status' || secondSnapshot.requests !== 2) throw new Error('成功提交状态错误');
if (secondSnapshot.busy) throw new Error('提交结束后忙碌状态未恢复');
console.log('form focus lifecycle passed');
`,
      },
      stdin: JSON.stringify({
        controls: [
          { id: 'email', name: 'email', value: 'bad' },
          { id: 'displayName', name: 'displayName', value: 'Ada' },
        ],
        fixedEmail: 'ada@example.test',
        errorText: '邮箱格式错误',
        successText: '设置已保存',
      }),
      checkpoint:
        '第一次失败后 focus 为 error-summary、email ariaInvalid=true、requests=1；修复并成功后 focus 为 status、liveMessage 为设置已保存、requests=2、busy=false，最后出现 form focus lifecycle passed，退出码为 0。',
    },
  },

  'programming:JavaScript · DOM、事件、Fetch 与浏览器状态：浏览器数据页面实验': {
    title: 'JS 后续代码台 27 · 查询、分页、缓存与旧响应隔离',
    description:
      '把筛选和分页编码进 URLSearchParams，在真实本地 HTTP 服务上验证空状态、错误、缓存和旧请求隔离。页面 DOM 以状态模型验收，不声称完成浏览器绘制。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-data-page-guided',
      title: '跟做：从 URL 推导稳定页面状态',
      brief:
        '读取用户行与 URL 查询，解析 q/page/pageSize，计算过滤、排序与分页结果；把规范化状态写回 URLSearchParams 并断言刷新可恢复。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function parsePageState(url) {
  const params = new URL(url, 'https://app.test').searchParams;
  const query = (params.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(10, Math.max(2, Number.parseInt(params.get('pageSize') ?? '3', 10) || 3));
  return { query, page, pageSize };
}

function buildViewModel(rows, state) {
  const filtered = rows
    .filter((row) => row.name.toLowerCase().includes(state.query))
    .sort((left, right) => left.name.localeCompare(right.name));
  const start = (state.page - 1) * state.pageSize;
  const items = filtered.slice(start, start + state.pageSize);
  const params = new URLSearchParams({ q: state.query, page: String(state.page), pageSize: String(state.pageSize) });
  return {
    items,
    total: filtered.length,
    empty: filtered.length === 0,
    url: '/users?' + params.toString(),
    nextEnabled: start + state.pageSize < filtered.length
  };
}

const state = parsePageState(input.url);
const view = buildViewModel(input.rows, state);
console.log({ state, view });
if (state.page !== 2 || state.pageSize !== 2 || state.query !== 'a') throw new Error('URL 状态解析错误');
if (view.items.length !== 2 || view.total !== 4) throw new Error('过滤或分页错误');
if (new URL(view.url, 'https://app.test').search !== new URL(input.url, 'https://app.test').search) {
  throw new Error('规范 URL 不能恢复同一状态');
}
console.log('data page state passed');
`,
      },
      stdin: JSON.stringify({
        url: '/users?q=a&page=2&pageSize=2',
        rows: [
          { id: '1', name: 'Ada' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Ada' },
          { id: '4', name: 'Barbara' },
          { id: '5', name: 'Carol' },
        ],
      }),
      checkpoint:
        'state 应为 query=a、page=2、pageSize=2；过滤得到 4 行，当前页 2 行；规范 URL 的查询串可从输入恢复，最后出现 data page state passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-data-page-independent',
      title: '独立实践：本地 API、错误与竞态管理',
      brief:
        '启动本地 HTTP 服务，用延迟查询分别模拟成功、空数组、500 与旧响应晚回；页面协调器只提交最新请求并保留错误/空状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const http = require('node:http');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const q = url.searchParams.get('q');
    if (q === 'empty') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    if (q === 'fail') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"code":"SERVER_ERROR"}');
      return;
    }
    const delay = q === 'slow' ? 80 : 5;
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ id: q, name: q }]));
    }, delay);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = server.address().port;
    const state = { requestId: 0, controller: null, status: 'idle', items: [], error: null };
    async function load(q) {
      state.controller?.abort();
      const controller = new AbortController();
      const requestId = ++state.requestId;
      state.controller = controller;
      state.status = 'loading';
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/users?q=' + encodeURIComponent(q), { signal: controller.signal });
        if (!response.ok) throw new Error('HTTP_' + response.status);
        const rows = await response.json();
        if (requestId === state.requestId && !controller.signal.aborted) {
          state.items = rows;
          state.status = rows.length ? 'ready' : 'empty';
          state.error = null;
        }
      } catch (error) {
        if (requestId === state.requestId && error.name !== 'AbortError') {
          state.items = [];
          state.status = 'error';
          state.error = error.message;
        }
      }
    }
    await Promise.all([load('slow'), new Promise((resolve) => setTimeout(resolve, 10)).then(() => load('latest'))]);
    await load('empty');
    await load('fail');
    console.log(state);
    if (state.status !== 'error' || state.error !== 'HTTP_500') throw new Error('错误状态未恢复');
    if (state.requestId !== 4) throw new Error('请求身份计数错误');
    if (state.items.length !== 0) throw new Error('失败后仍保留旧数据');
    console.log('data page server states passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({ initial: 'latest' }),
      checkpoint:
        '请求身份最终应为 4；旧 slow 请求不得覆盖 latest，随后 empty 进入 empty，fail 进入 error/HTTP_500 并清空旧列表；最后出现 data page server states passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：Vitest 单测与 Playwright 端到端': {
    title: 'JS 后续代码台 28 · 让单测与浏览器流程各管一层风险',
    description:
      '先用 Node assert 建立参数化单测，再以轻量交互模型验证点击与可见状态。端到端报告只作为 Playwright 结果契约审计，不冒充真实浏览器执行。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-test-layers-guided',
      title: '跟做：参数化单测与交互断言',
      brief:
        '读取金额样例，先对纯函数运行参数化相等/抛错断言，再用按钮和状态文本模型验证点击后从 Save 变成 Saved，并统计测试结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let passed = 0;

function parseAmount(text) {
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new RangeError('amount');
  return value;
}

for (const sample of input.amountCases) {
  if (sample.kind === 'value') {
    assert.equal(parseAmount(sample.input), sample.expected);
  } else {
    assert.throws(() => parseAmount(sample.input), RangeError);
  }
  passed += 1;
}

class ButtonModel {
  constructor(label) {
    this.label = label;
    this.listeners = [];
    this.disabled = false;
  }
  addEventListener(type, handler) { this.listeners.push({ type, handler }); }
  click() {
    if (this.disabled) return;
    for (const listener of this.listeners.filter((item) => item.type === 'click')) {
      listener.handler({ target: this });
    }
  }
}
const status = { text: input.initialStatus };
const button = new ButtonModel(input.buttonLabel);
button.addEventListener('click', () => {
  button.disabled = true;
  status.text = input.savedStatus;
});
button.click();
button.click();

assert.equal(status.text, input.savedStatus);
passed += 1;
console.log({ passed, buttonDisabled: button.disabled, status: status.text });
if (passed !== input.amountCases.length + 1) throw new Error('测试计数错误');
console.log('unit and interaction layers passed');
`,
      },
      stdin: JSON.stringify({
        amountCases: [
          { kind: 'value', input: '19.90', expected: 19.9 },
          { kind: 'error', input: '-1' },
          { kind: 'error', input: 'abc' },
        ],
        buttonLabel: 'Save',
        initialStatus: 'idle',
        savedStatus: 'Saved',
      }),
      checkpoint:
        '参数化金额测试 3 项和交互测试 1 项合计 passed=4；按钮点击两次后只处于 disabled=true，状态为 Saved，最后出现 unit and interaction layers passed，退出码为 0。',
    },
    apply: {
      id: 'javascript-remaining-test-layers-independent',
      title: '独立实践：审计 Vitest 与 Playwright 分层报告',
      brief:
        '读取两份测试报告，检查单元测试全通过、端到端聚焦关键路径、失败保留 trace/screenshot、耗时预算和无重复测试名；不合格时汇总阻断原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function auditReport(report, kind) {
  const names = report.tests.map((test) => test.name);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  const failed = report.tests.filter((test) => test.status !== 'passed').map((test) => test.name);
  const missingArtifacts = report.tests
    .filter((test) => test.status !== 'passed' && (!test.trace || !test.screenshot))
    .map((test) => test.name);
  return {
    kind,
    total: report.tests.length,
    failed,
    duplicateNames,
    missingArtifacts,
    durationOk: report.durationMs <= input.budgets[kind],
    semanticSelectors: kind !== 'e2e' || report.tests.every((test) => test.selectorStyle === 'role-or-label')
  };
}

const unit = auditReport(input.unit, 'unit');
const e2e = auditReport(input.e2e, 'e2e');
const blockers = [unit, e2e].flatMap((result) => [
  ...result.failed.map((name) => result.kind + ':failed:' + name),
  ...result.duplicateNames.map((name) => result.kind + ':duplicate:' + name),
  ...result.missingArtifacts.map((name) => result.kind + ':artifact:' + name),
  ...(result.durationOk ? [] : [result.kind + ':duration']),
  ...(result.semanticSelectors ? [] : [result.kind + ':selector'])
]);
console.log({ unit, e2e, blockers });
if (unit.failed.length || !unit.durationOk) throw new Error('单元报告存在阻断项');
if (!e2e.failed.length || !e2e.missingArtifacts.length) throw new Error('端到端失败样例未被发现');
if (!blockers.some((item) => item === 'e2e:artifact:checkout')) throw new Error('缺少 trace/screenshot 阻断');
console.log('test layer report audit passed');
`,
      },
      stdin: JSON.stringify({
        budgets: { unit: 2000, e2e: 30000 },
        unit: {
          durationMs: 420,
          tests: [
            { name: 'parses amount', status: 'passed' },
            { name: 'rejects negative', status: 'passed' }
          ]
        },
        e2e: {
          durationMs: 18000,
          tests: [
            { name: 'checkout', status: 'failed', trace: '', screenshot: '', selectorStyle: 'role-or-label' },
            { name: 'keyboard submit', status: 'passed', trace: 'trace.zip', screenshot: 'shot.png', selectorStyle: 'role-or-label' }
          ]
        }
      }),
      checkpoint:
        'unit 无失败且时长合规；e2e 应记录 checkout 失败并因缺少 trace/screenshot 产生 artifact 阻断，blockers 中含 e2e:artifact:checkout；最后出现 test layer report audit passed，退出码为 0。',
    },
  },

  'programming:JavaScript · 模块、工具链与测试：模块化工程重构实验': {
    title: 'JS 后续代码台 29 · 从单文件到可验证的分层模块',
    description:
      '在临时目录真实创建 domain、api、ui 与入口模块，动态导入验证纯逻辑、适配器和入口边界；再检查依赖图循环、公开接口和行为等价。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-remaining-refactor-guided',
      title: '跟做：拆出纯领域层和适配层',
      brief:
        '读取购物订单，生成 domain/api/ui 三个 ESM 文件，动态导入后验证总额、格式化文本和网络适配器结果；domain 模块不得读取 document 或 process。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-refactor-'));
  try {
    fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'api'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'ui'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\\n');
    fs.writeFileSync(path.join(root, 'src', 'domain', 'cart.js'),
      'export function normalizeRows(rows) {\\n' +
      '  return rows.map((row) => ({ ...row, total: row.price * row.quantity }));\\n' +
      '}\\n' +
      'export function total(rows) { return rows.reduce((sum, row) => sum + row.total, 0); }\\n'
    );
    fs.writeFileSync(path.join(root, 'src', 'api', 'orders.js'),
      'export async function fetchOrders(rows) { return Promise.resolve([...rows]); }\\n'
    );
    fs.writeFileSync(path.join(root, 'src', 'ui', 'view.js'),
      'export function render(totalValue) { return "total=" + totalValue.toFixed(2); }\\n'
    );
    fs.writeFileSync(path.join(root, 'main.mjs'),
      "import { normalizeRows, total } from './src/domain/cart.js';\\n" +
      "import { fetchOrders } from './src/api/orders.js';\\n" +
      "import { render } from './src/ui/view.js';\\n" +
      'export async function run(rows) { const data = await fetchOrders(normalizeRows(rows)); return render(total(data)); }\\n'
    );
    const domain = await import(pathToFileURL(path.join(root, 'src', 'domain', 'cart.js')).href);
    const app = await import(pathToFileURL(path.join(root, 'main.mjs')).href);
    const normalized = domain.normalizeRows(input.rows);
    const amount = domain.total(normalized);
    const text = await app.run(input.rows);
    const domainSource = fs.readFileSync(path.join(root, 'src', 'domain', 'cart.js'), 'utf8');
    console.log({ amount, text, domainHasHostApi: /document|process|window/.test(domainSource), exports: Object.keys(app).sort() });
    if (amount !== input.expectedTotal || text !== 'total=' + input.expectedTotal.toFixed(2)) {
      throw new Error('分层后行为不一致');
    }
    if (/document|process|window/.test(domainSource)) throw new Error('领域层依赖宿主');
    if (Object.keys(app).join(',') !== 'run') throw new Error('入口公开接口过大');
    console.log('module split passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: JSON.stringify({
        rows: [
          { price: 19.9, quantity: 2 },
          { price: 5, quantity: 3 },
        ],
        expectedTotal: 54.8,
      }),
      checkpoint:
        'amount 应为 54.8，text 为 total=54.80，domainHasHostApi=false，入口只公开 run；最后出现 module split passed，退出码为 0。三个目录通过真实动态导入完成协作。',
    },
    apply: {
      id: 'javascript-remaining-refactor-independent',
      title: '独立实践：检测循环依赖并保留旧入口',
      brief:
        '读取旧新模块依赖图，检测循环边和跨层导入；比较旧新服务的成功、空输入与错误结果，确保适配器保留外部行为后才移走旧实现。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';
const fs = require('node:fs');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph[node] ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of Object.keys(graph)) visit(node);
  return cycles;
}

function legacyQuote(amount, level) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount');
  return level === 'gold' && amount >= input.threshold ? amount - input.discount : amount;
}
function newQuote(amount, level) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount');
  const discounted = level === 'gold' && amount >= input.threshold ? amount - input.discount : amount;
  return Number(discounted.toFixed(2));
}

function compare(cases) {
  return cases.map((item) => {
    let legacy;
    let modern;
    try { legacy = { value: legacyQuote(item.amount, item.level) }; } catch (error) { legacy = { error: error.name }; }
    try { modern = { value: newQuote(item.amount, item.level) }; } catch (error) { modern = { error: error.name }; }
    return { input: item, legacy, modern, equal: JSON.stringify(legacy) === JSON.stringify(modern) };
  });
}

const cycles = findCycles(input.graph);
const comparisons = compare(input.cases);
const crossLayer = Object.entries(input.graph).flatMap(([from, to]) =>
  to.filter((target) => from.startsWith('domain/') && target.startsWith('ui/')).map((target) => from + '->' + target)
);
console.log({ cycles, crossLayer, comparisons });
if (!cycles.length) throw new Error('循环依赖样例未被发现');
if (!crossLayer.length) throw new Error('跨层依赖样例未被发现');
if (comparisons.some((item) => !item.equal)) throw new Error('适配后行为不等价');
console.log('module refactor governance passed');
`,
      },
      stdin: JSON.stringify({
        graph: {
          'domain/cart.js': ['ui/view.js'],
          'ui/view.js': ['api/client.js'],
          'api/client.js': ['domain/cart.js']
        },
        threshold: 100,
        discount: 20,
        cases: [
          { amount: 99, level: 'gold' },
          { amount: 100, level: 'gold' },
          { amount: -1, level: 'standard' },
          { amount: 120, level: 'standard' }
        ]
      }),
      checkpoint:
        'cycles 至少包含一条三条边环路，crossLayer 应包含 domain/cart.js->ui/view.js；四个用例的 legacy 与 modern 必须完全相同，最后出现 module refactor governance passed，退出码为 0。',
    },
  },
};
