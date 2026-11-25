import type { LearningV2CodeLab } from './v2-types.js';

/**
 * JavaScript 独立语言课程的真实 Node.js 代码实验室。
 *
 * 浏览器专属课题只登记能在 Node 中诚实验证的运行时、模块和工程边界；
 * DOM 渲染与布局必须在浏览器中验收，不能用字符串断言冒充页面运行。
 */
const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 内置运行时',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    'Node.js 由应用内置，不需要安装 npm 依赖。',
    '先运行跟做代码，确认退出码为 0，再完成独立实践。',
    'stdin 留空；所有文件和计时证据都来自本次真实进程。',
  ],
  languages: ['javascript'],
} as const;

export const JAVASCRIPT_CODE_LABS: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:JavaScript · 运行环境、工具链与第一段代码：浏览器脚本、模块与 Node 进程': {
    title: 'JS 代码台 01 · 让宿主环境自己作证',
    description:
      '同一段 JavaScript 在浏览器与 Node 中拥有不同全局对象、模块规则和资源。代码台不伪造浏览器：先在 Node 中检查 document 缺失、process 存在，再通过动态 import 与原生模块解析观察模块边界。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-runtime-host-guided',
      title: '跟做：识别当前宿主',
      brief:
        '运行 node main.js，stdin 留空。程序打印 globalThis、document、window、process 与 require 的实际类型，并用断言确认当前进程是 Node 而不是浏览器。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const facts = {
  globalThisType: typeof globalThis,
  documentType: typeof document,
  windowType: typeof window,
  processType: typeof process,
  requireType: typeof require,
  nodeVersion: process.versions.node,
  entry: require.main === module ? 'main' : 'imported'
};

console.log(JSON.stringify(facts, null, 2));

if (facts.globalThisType !== 'object') throw new Error('globalThis 应为对象');
if (facts.documentType !== 'undefined') throw new Error('Node 进程不应出现 document');
if (facts.processType !== 'object') throw new Error('Node 进程应提供 process');
if (facts.entry !== 'main') throw new Error('本文件应作为主入口执行');

console.log('宿主检查通过：当前是 Node 进程，不是浏览器页面。');
`,
      },
      stdin: '',
      checkpoint:
        '必须看到 documentType 为 undefined、processType 为 object、entry 为 main，最后出现“宿主检查通过”，退出码为 0。若代码把 document 直接当全局变量使用，Node 会抛 ReferenceError；这正说明共享模块不能无条件依赖浏览器 DOM。',
    },
    apply: {
      id: 'javascript-runtime-host-independent',
      title: '独立实践：用动态导入连接宿主与纯逻辑',
      brief:
        '运行 node main.js。先用一个不读取全局宿主的纯函数计算订单总额，再动态导入 node:path 做路径解析；输出同一份计算的金额、规范化路径和模块加载次数，证明业务计算与环境适配彼此分离。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function orderTotal(lines) {
  return lines.reduce((sum, line) => {
    if (!Number.isFinite(line.price) || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new TypeError('无效订单行');
    }
    return sum + line.price * line.quantity;
  }, 0);
}

async function main() {
  const path = await import('node:path');
  const again = await import('node:path');
  const lines = [
    { price: 19.9, quantity: 2 },
    { price: 5, quantity: 3 }
  ];
  const expected = 54.8;
  const actual = Number(orderTotal(lines).toFixed(2));

  console.log('amount:', actual);
  console.log('normalized:', path.resolve('.', 'fixtures', '..', 'orders.json'));
  console.log('same module namespace:', path === again);

  if (actual !== expected) throw new Error('金额计算错误');
  if (path !== again) throw new Error('动态 import 应复用已加载模块');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        '预期 amount 为 54.8、normalized 是以当前工作目录开头的绝对路径、same module namespace 为 true，退出码为 0。把金额函数改成读取 window 会让 Node 失败；把金额与路径解析混在一起，也无法在不启动页面的情况下完成验证。',
    },
  },

  'programming:JavaScript · 运行环境、工具链与第一段代码：变量、表达式、分支与循环': {
    title: 'JS 代码台 02 · 让隐式转换现出原形',
    description:
      '比较 == 与 ===、truthy 与显式数值判断，再把分支与循环写成可断言函数。重点是先固定输入契约，避免 JavaScript 自动转换悄悄改变业务结果。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-values-guided',
      title: '跟做：拆开四组转换陷阱',
      brief:
        '运行 node main.js。代码成对打印宽松相等、严格相等、字符串数字与布尔值，再用断言记录 0 == "0"、0 === "0" 和 Boolean("0") 的真实结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const rows = [
  { left: 0, right: '0', loose: 0 == '0', strict: 0 === '0' },
  { left: '', right: false, loose: '' == false, strict: '' === false },
  { left: null, right: undefined, loose: null == undefined, strict: null === undefined },
  { left: '1', right: true, loose: '1' == true, strict: '1' === true }
];

console.table(rows.map(({ left, right, loose, strict }) => ({
  left: JSON.stringify(left),
  right: JSON.stringify(right),
  loose,
  strict
})));

console.log('Boolean("0"):', Boolean('0'));

if (!rows[0].loose || rows[0].strict) throw new Error('0 的宽松/严格比较结果不符');
if (!rows[1].loose || rows[1].strict) throw new Error('空字符串与 false 的结果不符');
if (!rows[2].loose || rows[2].strict) throw new Error('null 与 undefined 的结果不符');
if (!rows[3].loose || rows[3].strict) throw new Error('字符串 1 与 true 的结果不符');
if (!Boolean('0')) throw new Error('非空字符串应视为 truthy');
`,
      },
      stdin: '',
      checkpoint:
        '表格应显示前四行 loose 为 true、strict 全为 false，Boolean("0") 为 true，退出码为 0。把输入 "0" 直接用于金额判断会进入已定义价格分支，因为非空字符串是 truthy；业务输入应先做 Number() 与 Number.isFinite()。',
    },
    apply: {
      id: 'javascript-values-independent',
      title: '独立实践：重写会员折扣分支',
      brief:
        '运行 node main.js。实现 quote(amount, level)：金额必须是有限非负数，普通会员原价，金卡满 100 减 20。用 99、100、101、字符串 "100" 和 NaN 五组边界验证返回值或明确错误。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function quote(rawAmount, level) {
  const amount = typeof rawAmount === 'number' ? rawAmount : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('金额必须是有限非负数');
  if (level !== 'standard' && level !== 'gold') throw new TypeError('未知会员等级');

  if (level === 'gold' && amount >= 100) return Number((amount - 20).toFixed(2));
  return Number(amount.toFixed(2));
}

const cases = [
  { amount: 99, level: 'gold', expected: 99 },
  { amount: 100, level: 'gold', expected: 80 },
  { amount: 101, level: 'gold', expected: 81 },
  { amount: 120, level: 'standard', expected: 120 }
];

for (const item of cases) {
  const actual = quote(item.amount, item.level);
  console.log(\`\${item.level} \${item.amount} -> \${actual}\`);
  if (actual !== item.expected) throw new Error('边界结果错误');
}

for (const invalid of ['100', Number.NaN]) {
  let rejected = false;
  try {
    quote(invalid, 'gold');
  } catch (error) {
    rejected = error instanceof RangeError;
  }
  console.log('invalid rejected:', JSON.stringify(invalid), rejected);
  if (!rejected) throw new Error('非法金额没有被拒绝');
}
`,
      },
      stdin: '',
      checkpoint:
        '输出必须包含 99→99、100→80、101→81、标准会员 120→120，字符串 "100" 与 NaN 都应被 RangeError 拒绝，退出码为 0。注意 99 与 100 的边界只差一元，不能依赖 truthy 或 >= 写成相邻都会减价的模糊条件。',
    },
  },

  'programming:JavaScript · 运行环境、工具链与第一段代码：函数、作用域与严格模式': {
    title: 'JS 代码台 03 · 把函数契约与作用域跑出来',
    description:
      '用严格模式观察未声明赋值和 this 边界，再把订单计算抽成可测试纯函数与输入校验函数，证明返回值由显式参数决定。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-functions-scope-guided',
      title: '跟做：严格模式拒绝隐式全局',
      brief:
        '运行 node main.js。代码在严格模式下尝试给未声明变量赋值并捕获 ReferenceError，再比较普通函数与箭头函数的 this 值。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

let strictError = '';
try {
  undeclaredLessonValue = 42;
} catch (error) {
  strictError = error.name;
}

const holder = {
  name: 'holder',
  regular() {
    return this?.name ?? '(undefined)';
  },
  arrow: () => typeof this
};

console.log('strict error:', strictError);
console.log('regular this:', holder.regular());
console.log('arrow this type:', holder.arrow());

if (strictError !== 'ReferenceError') throw new Error('严格模式应拒绝未声明变量');
if (holder.regular() !== 'holder') throw new Error('对象方法应绑定调用者');
`,
      },
      stdin: '',
      checkpoint:
        'strict error 必须为 ReferenceError，regular this 为 holder，退出码为 0。把赋值放进 try 是为了保留进程继续观察；真实业务代码不应吞掉 ReferenceError，而应修复遗漏声明。',
    },
    apply: {
      id: 'javascript-functions-scope-independent',
      title: '独立实践：纯函数与校验函数分工',
      brief:
        '运行 node main.js。实现 parseLines(raw) 负责校验并返回新数组，subtotal(lines) 只负责求和且不修改输入。用冻结对象验证输入未被改写，并故意传入负数确认校验拦截。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function parseLines(raw) {
  if (!Array.isArray(raw)) throw new TypeError('输入必须是数组');
  return raw.map((line, index) => {
    const price = Number(line.price);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(price) || price < 0) throw new RangeError(\`第 \${index + 1} 行价格非法\`);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError(\`第 \${index + 1} 行数量非法\`);
    return Object.freeze({ price, quantity });
  });
}

function subtotal(lines) {
  return Number(lines.reduce((sum, line) => sum + line.price * line.quantity, 0).toFixed(2));
}

const raw = Object.freeze([
  Object.freeze({ price: '12.5', quantity: 2 }),
  Object.freeze({ price: 3, quantity: 4 })
]);
const parsed = parseLines(raw);
console.log('raw:', raw);
console.log('parsed:', parsed);
console.log('subtotal:', subtotal(parsed));

if (subtotal(parsed) !== 37) throw new Error('总额错误');
if (parsed[0] === raw[0]) throw new Error('校验函数不应直接复用外部对象');

let rejected = false;
try {
  parseLines([{ price: -1, quantity: 1 }]);
} catch (error) {
  rejected = error instanceof RangeError;
}
console.log('negative price rejected:', rejected);
if (!rejected) throw new Error('负数价格必须被拒绝');
`,
      },
      stdin: '',
      checkpoint:
        'subtotal 必须为 37，negative price rejected 为 true，raw 在运行前后保持不变，退出码为 0。校验与计算分开后，subtotal 不关心字符串来自 CLI、HTTP 还是表单，也不读取任何全局状态。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：闭包、工厂函数与私有状态': {
    title: 'JS 代码台 04 · 闭包保存状态，接口限制写入',
    description:
      '用工厂函数把余额和历史记录封闭在词法环境中，只暴露 deposit、withdraw 与 snapshot。外部不能直接改余额，所有状态变化都有输入检查和可观察输出。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-closure-guided',
      title: '跟做：两个计数器互不串值',
      brief:
        '运行 node main.js。createCounter(label) 每次返回独立闭包，外部读取不到 count 变量，只能调用 increment 与 read。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function createCounter(label) {
  let count = 0;
  return Object.freeze({
    increment(step = 1) {
      if (!Number.isInteger(step) || step <= 0) throw new RangeError('step 必须是正整数');
      count += step;
      return count;
    },
    read() {
      return { label, count };
    }
  });
}

const lessons = createCounter('lessons');
const exercises = createCounter('exercises');
lessons.increment();
lessons.increment(2);
exercises.increment(5);

console.log(lessons.read());
console.log(exercises.read());
console.log('direct count visible:', Object.hasOwn(lessons, 'count'));

if (lessons.read().count !== 3) throw new Error('课程计数器状态错误');
if (exercises.read().count !== 5) throw new Error('练习计数器状态错误');
if (Object.hasOwn(lessons, 'count')) throw new Error('count 不应成为公开属性');
`,
      },
      stdin: '',
      checkpoint:
        '两个 read 结果应分别是 lessons/count=3 与 exercises/count=5，direct count visible 为 false，退出码为 0。这证明状态由闭包保存；把 count 改成对象属性会让任何调用方都能绕过 increment。',
    },
    apply: {
      id: 'javascript-closure-independent',
      title: '独立实践：封闭账户与不可伪造流水',
      brief:
        '运行 node main.js。实现 createAccount(owner)：存款金额必须为正，取款不能透支，snapshot 返回余额和只读流水副本。尝试直接改返回快照不应影响内部余额。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function createAccount(owner) {
  let balance = 0;
  const history = [];

  function record(type, amount) {
    history.push(Object.freeze({ type, amount, balance }));
  }

  return Object.freeze({
    deposit(amount) {
      if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('存款必须为正数');
      balance = Number((balance + amount).toFixed(2));
      record('deposit', amount);
      return balance;
    },
    withdraw(amount) {
      if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('取款必须为正数');
      if (amount > balance) throw new RangeError('余额不足');
      balance = Number((balance - amount).toFixed(2));
      record('withdraw', amount);
      return balance;
    },
    snapshot() {
      return {
        owner,
        balance,
        history: history.map((entry) => ({ ...entry }))
      };
    }
  });
}

const account = createAccount('Ada');
account.deposit(100);
account.withdraw(30);
const copy = account.snapshot();
copy.balance = 9999;
copy.history.length = 0;

console.log('forged copy:', copy);
console.log('actual snapshot:', account.snapshot());

if (account.snapshot().balance !== 70) throw new Error('外部修改快照污染了余额');
if (account.snapshot().history.length !== 2) throw new Error('外部清空快照污染了流水');

let overdraftBlocked = false;
try {
  account.withdraw(71);
} catch (error) {
  overdraftBlocked = error instanceof RangeError;
}
console.log('overdraft blocked:', overdraftBlocked);
if (!overdraftBlocked) throw new Error('透支没有被拒绝');
`,
      },
      stdin: '',
      checkpoint:
        'forged copy 可以显示 9999 和空流水，但 actual snapshot 必须仍为 balance 70、history 两条；overdraft blocked 为 true，退出码为 0。返回 snapshot 时复制可变数组，否则调用方仍能通过引用改内部历史。',
    },
  },

  'programming:JavaScript · 类型、对象、作用域与闭包：浅拷贝、深拷贝与结构化克隆': {
    title: 'JS 代码台 05 · 用引用证据区分三种复制',
    description:
      '同一份嵌套对象分别用展开、JSON 往返和 structuredClone 复制，观察共享引用、Date 与 undefined 的差异。结果用对象身份和值双重验证。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-copy-guided',
      title: '跟做：浅拷贝仍共享内层对象',
      brief:
        '运行 node main.js。分别创建展开副本与 structuredClone 副本，修改内层字段，断言展开副本污染原对象而深副本保持独立。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const original = {
  id: 'u-1',
  profile: { city: 'Shanghai', tags: ['student'] }
};
const shallow = { ...original };
const deep = structuredClone(original);

shallow.profile.city = 'Hangzhou';
deep.profile.tags.push('engineer');

console.log('original:', original);
console.log('shallow shares profile:', shallow.profile === original.profile);
console.log('deep shares profile:', deep.profile === original.profile);
console.log('deep tags:', deep.profile.tags);

// 在修改 shallow 后，original 已经变成 Hangzhou；deep 从修改前克隆。
if (shallow.profile !== original.profile) throw new Error('浅拷贝应共享内层引用');
if (deep.profile === original.profile) throw new Error('深拷贝不应共享内层引用');
if (original.profile.tags.includes('engineer')) throw new Error('修改深副本污染了原数组');
`,
      },
      stdin: '',
      checkpoint:
        'shallow shares profile 为 true，deep shares profile 为 false，original.profile.city 为 Hangzhou，原 tags 仍只有 student，退出码为 0。注意浅拷贝的是第一层属性值；嵌套对象属性本身仍是同一个引用。',
    },
    apply: {
      id: 'javascript-copy-independent',
      title: '独立实践：选择 JSON 或结构化克隆',
      brief:
        '运行 node main.js。准备含 Date 与 undefined 的对象，分别 JSON 往返和 structuredClone；输出类型和字段存在情况，并实现不可变 updateProfile 只改指定字段。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const source = {
  id: 'u-1',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  nickname: undefined,
  profile: { city: 'Shanghai', tags: ['student'] }
};

const viaJson = JSON.parse(JSON.stringify(source));
const viaClone = structuredClone(source);

console.log('json date type:', Object.prototype.toString.call(viaJson.createdAt));
console.log('clone date type:', Object.prototype.toString.call(viaClone.createdAt));
console.log('json has nickname:', Object.hasOwn(viaJson, 'nickname'));
console.log('clone has nickname:', Object.hasOwn(viaClone, 'nickname'));

function updateProfile(user, patch) {
  return {
    ...user,
    profile: Object.freeze({
      ...user.profile,
      ...patch,
      tags: [...(patch.tags ?? user.profile.tags)]
    })
  };
}

const updated = updateProfile(viaClone, { city: 'Beijing', tags: ['engineer'] });
console.log('source city:', viaClone.profile.city);
console.log('updated city:', updated.profile.city);

if (Object.prototype.toString.call(viaJson.createdAt) !== '[object String]') {
  throw new Error('JSON 往返应把 Date 变成字符串');
}
if (!(viaClone.createdAt instanceof Date)) throw new Error('structuredClone 应保留 Date');
if (Object.hasOwn(viaJson, 'nickname')) throw new Error('JSON 往返会丢失 undefined 字段');
if (viaClone.profile === updated.profile) throw new Error('更新应创建新的 profile');
if (viaClone.profile.tags.includes('engineer')) throw new Error('更新污染了原 tags');
`,
      },
      stdin: '',
      checkpoint:
        'JSON 副本的 createdAt 应变成字符串且 nickname 消失；structuredClone 应保留 Date 与 undefined；updated city 为 Beijing，而 source city 仍为 Shanghai，退出码为 0。JSON 往返不是通用深拷贝，structuredClone 也不能复制函数等不可克隆值。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：对象属性、描述符与原型链': {
    title: 'JS 代码台 06 · 属性从哪里来',
    description:
      '用 Object.create 建立原型链，再用 descriptor 控制只读与可枚举状态。通过 Object.hasOwn 与 in 的差异判断属性是自有还是继承。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-prototype-guided',
      title: '跟做：追踪自有属性与继承属性',
      brief:
        '运行 node main.js。创建带 read() 方法的原型对象和只有 id 的实例，打印属性来源及 for...in 枚举结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const lessonPrototype = {};
Object.defineProperty(lessonPrototype, 'read', {
  value() {
    return \`lesson=\${this.id}\`;
  },
  enumerable: false
});

const lesson = Object.create(lessonPrototype);
Object.defineProperty(lesson, 'id', {
  value: 'js-06',
  enumerable: true,
  writable: false,
  configurable: false
});

const keys = [];
for (const key in lesson) keys.push(key);

console.log('own id:', Object.hasOwn(lesson, 'id'));
console.log('own read:', Object.hasOwn(lesson, 'read'));
console.log('read in lesson:', 'read' in lesson);
console.log('for-in keys:', keys);
console.log('descriptor:', Object.getOwnPropertyDescriptor(lesson, 'id'));
console.log(lesson.read());

if (!Object.hasOwn(lesson, 'id') || Object.hasOwn(lesson, 'read')) throw new Error('自有属性判断错误');
if (!('read' in lesson)) throw new Error('原型方法应能通过 in 找到');
if (keys.join(',') !== 'id') throw new Error('read 不应作为自有可枚举属性出现');
`,
      },
      stdin: '',
      checkpoint:
        'own id 为 true，own read 为 false，read in lesson 为 true，for-in 只列出 id，descriptor 的 writable/configurable 都为 false，退出码为 0。读取 lesson.read 会沿原型链查找，但方法不在实例自身。',
    },
    apply: {
      id: 'javascript-prototype-independent',
      title: '独立实践：构造不会泄露写入口的配置对象',
      brief:
        '运行 node main.js。实现 makeConfig(defaults)：返回对象只暴露 get/set/snapshot，默认值不可被 set 覆盖，未知键拒绝，snapshot 不含原型且不能被外部修改内部状态。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function makeConfig(defaults, mutable = {}) {
  const values = Object.assign(Object.create(null), defaults, mutable);
  const locked = new Set(Object.keys(defaults));

  const api = Object.create(null);
  Object.defineProperties(api, {
    get: { value: (key) => values[key], enumerable: true },
    set: {
      value(key, value) {
        if (!Object.hasOwn(values, key)) throw new ReferenceError('未知配置键');
        if (locked.has(key)) throw new Error(\`默认键 \${key} 不允许覆盖\`);
        values[key] = value;
      },
      enumerable: true
    },
    snapshot: {
      value: () => ({ ...values }),
      enumerable: true
    }
  });
  return Object.freeze(api);
}

const config = makeConfig(
  { theme: 'light', locale: 'zh-CN' },
  { pageSize: 20 }
);
config.set('pageSize', 50);
const snapshot = config.snapshot();
snapshot.pageSize = 999;

console.log('prototype:', Object.getPrototypeOf(config));
console.log('snapshot:', config.snapshot());
console.log('keys:', Object.keys(config));

let lockedRejected = false;
try {
  config.set('theme', 'dark');
} catch {
  lockedRejected = true;
}

if (Object.getPrototypeOf(config) !== null) throw new Error('配置接口不应继承 Object 原型');
if (config.snapshot().pageSize !== 50) throw new Error('外部快照修改污染了值');
if (!lockedRejected) throw new Error('默认键覆盖没有被拒绝');
if (Object.keys(config).join(',') !== 'get,set,snapshot') throw new Error('公开 API 枚举不符');
`,
      },
      stdin: '',
      checkpoint:
        'prototype 显示 null，snapshot.pageSize 为 50 且 locale 仍为 zh-CN，keys 为 get、set、snapshot，覆盖默认 theme 会被拒绝，退出码为 0。这里同时验证原型边界、属性描述符与返回值复制，而不是只把对象“看起来封装”起来。',
    },
  },

  'programming:JavaScript · 原型、类、this 与对象设计：this、call、apply 与 bind': {
    title: 'JS 代码台 07 · 显式决定 this',
    description:
      '把对象方法取出后观察 this 丢失，再分别用 call、apply 与 bind 固定接收者。最后用 bind 生成的计费函数验证参数和上下文都稳定。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-this-guided',
      title: '跟做：方法脱离对象后的 this',
      brief:
        '运行 node main.js。先直接调用脱离后的 format 方法，再用 call、apply 与 bind 指定 formatter 对象，输出三种调用结果和函数身份。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const formatter = {
  currency: 'CNY',
  format(amount) {
    const currency = this?.currency ?? 'undefined';
    return \`\${currency} \${Number(amount).toFixed(2)}\`;
  }
};

const detached = formatter.format;
const direct = detached(12);
const called = detached.call(formatter, 12);
const applied = detached.apply(formatter, [12]);
const bound = detached.bind(formatter);
const boundResult = bound(12);

console.log('direct:', direct);
console.log('call:', called);
console.log('apply:', applied);
console.log('bind:', boundResult);
console.log('bound identity stable:', bound === bound);

if (direct !== 'undefined 12.00') throw new Error('脱方法调用不应自动保留 formatter');
if (called !== 'CNY 12.00' || applied !== 'CNY 12.00' || boundResult !== 'CNY 12.00') {
  throw new Error('显式 this 调用失败');
}
`,
      },
      stdin: '',
      checkpoint:
        'direct 应为 undefined 12.00，call/apply/bind 都应为 CNY 12.00，退出码为 0。严格模式下脱离对象的普通函数 this 为 undefined；箭头函数无法被 call 改写 this。',
    },
    apply: {
      id: 'javascript-this-independent',
      title: '独立实践：构造绑定的订单计费器',
      brief:
        '运行 node main.js。从 pricing 对象取出 total 方法后用 bind 固定 this，并实现 partial 闭包预置税号；同一绑定函数以不同金额调用，验证配置不变、结果独立。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const pricing = {
  taxRate: 0.13,
  total(amount, taxable = true) {
    const tax = taxable ? amount * this.taxRate : 0;
    return Number((amount + tax).toFixed(2));
  }
};

const boundTotal = pricing.total.bind(pricing);
const quoted = (amount, taxable) => boundTotal(amount, taxable);

console.log('100 taxable:', quoted(100, true));
console.log('100 exempt:', quoted(100, false));
console.log('50 taxable:', quoted(50, true));
console.log('this recovered:', boundTotal.call({ taxRate: 0 }, 100) === 113);

if (quoted(100, true) !== 113) throw new Error('含税总额错误');
if (quoted(100, false) !== 100) throw new Error('免税总额错误');
if (quoted(50, true) !== 56.5) throw new Error('第二笔金额错误');
if (boundTotal.call({ taxRate: 0 }, 100) !== 113) throw new Error('bind 后 call 不应改写 this');
`,
      },
      stdin: '',
      checkpoint:
        '输出应为 113、100、56.5，this recovered 为 true，退出码为 0。bind 返回的是永久绑定 this 的新函数，后续 call/apply 只能传参数，不能把接收者换回零税率对象。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：调用栈、任务队列与微任务': {
    title: 'JS 代码台 08 · 按输出顺序还原事件循环',
    description:
      '同步日志、queueMicrotask、Promise.then、setTimeout 与 setImmediate 同时进入不同队列。代码只根据真实输出次序做断言，不画抽象示意图。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-event-loop-guided',
      title: '跟做：记录五阶段的真实顺序',
      brief:
        '运行 node main.js。观察 sync-start、microtask、promise、timer 与 immediate 的先后关系，再用断言固定同一进程内的稳定顺序。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const order = [];

order.push('sync-start');
queueMicrotask(() => order.push('microtask'));
Promise.resolve().then(() => order.push('promise'));
setTimeout(() => order.push('timer'), 0);
setImmediate(() => order.push('immediate'));
order.push('sync-end');

setTimeout(() => {
  console.log(order);
  if (order[0] !== 'sync-start' || order[1] !== 'sync-end') throw new Error('同步任务顺序错误');
  if (order.indexOf('microtask') > order.indexOf('timer')) throw new Error('微任务应在 timer 前');
  if (order.indexOf('promise') > order.indexOf('timer')) throw new Error('Promise 微任务应在 timer 前');
  console.log('event loop ordering verified');
}, 10);
`,
      },
      stdin: '',
      checkpoint:
        '前两项必须是 sync-start、sync-end；microtask 与 promise 必须位于 timer 与 immediate 之前，最后出现 event loop ordering verified，退出码为 0。setTimeout 0 仍需进入 timer 阶段，不会插入当前同步调用栈。',
    },
    apply: {
      id: 'javascript-event-loop-independent',
      title: '独立实践：把长任务切片让出事件循环',
      brief:
        '运行 node main.js。处理 300 个条目，每 50 个通过 setImmediate 让出一次事件循环。每批记录主动让出次数，最终结果必须与一次性计算相同。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const items = Array.from({ length: 300 }, (_, index) => index + 1);
let cursor = 0;
let sum = 0;
let yields = 0;

function nextBatch() {
  const end = Math.min(cursor + 50, items.length);
  while (cursor < end) {
    sum += items[cursor];
    cursor += 1;
  }
  console.log(\`processed=\${cursor}, sum=\${sum}\`);
  if (cursor < items.length) {
    yields += 1;
    setImmediate(nextBatch);
    return;
  }
  const expected = items.reduce((total, value) => total + value, 0);
  console.log({ yields, sum, expected });
  if (sum !== expected) throw new Error('切片计算与一次性计算不一致');
  if (yields !== 5) throw new Error('300 条按每批 50 条应让出 5 次');
  console.log('long task chunking verified');
}

setImmediate(nextBatch);
`,
      },
      stdin: '',
      checkpoint:
        '应看到 processed 从 50 递增到 300，yields 为 5，sum 与 expected 都等于 45150，最后出现 long task chunking verified，退出码为 0。切片不会让计算总量变小，目标是缩短单次连续占用事件循环的时间。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：Promise 状态、链式错误与聚合': {
    title: 'JS 代码台 09 · 聚合部分失败而不是全盘丢失',
    description:
      '让四家服务分别成功、拒绝和同步抛错，用 Promise.allSettled 保留每项结果。再把成功项映射为记录，展示聚合边界和错误诊断。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-promise-guided',
      title: '跟做：区分成功与拒绝',
      brief:
        '运行 node main.js。创建两个成功 Promise 和一个失败 Promise，使用 allSettled 输出状态、原因类型和总数量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

async function main() {
  const jobs = [
    Promise.resolve({ id: 'a', value: 1 }),
    Promise.reject(new RangeError('b out of range')),
    Promise.resolve({ id: 'c', value: 3 })
  ];
  const settled = await Promise.allSettled(jobs);
  const summary = settled.map((item) => item.status === 'fulfilled'
    ? { status: item.status, id: item.value.id }
    : { status: item.status, reason: item.reason.name });

  console.log(summary);
  if (settled.length !== 3) throw new Error('应保留全部三项结果');
  if (settled[0].status !== 'fulfilled' || settled[1].status !== 'rejected' || settled[2].status !== 'fulfilled') {
    throw new Error('allSettled 状态错误');
  }
  if (settled[1].reason.name !== 'RangeError') throw new Error('拒绝原因被吞掉');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        'summary 应依次为 fulfilled/a、rejected/RangeError、fulfilled/c。Promise.all 遇到第二项会整体拒绝，allSettled 则保留每项状态；生产代码仍要显式检查 rejected 项，不能只看返回数组长度。',
    },
    apply: {
      id: 'javascript-promise-independent',
      title: '独立实践：带分类的错误聚合器',
      brief:
        '运行 node main.js。依次执行四个可能失败的异步任务，将失败按 retryable 与 fatal 分类，成功项保留值。最终打印 aggregate 对象且断言两类数量正确。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function task(id, variant) {
  return new Promise((resolve, reject) => {
    queueMicrotask(() => {
      if (variant === 'ok') resolve({ id, value: id.toUpperCase() });
      else reject(Object.assign(new Error(\`\${id} failed\`), { code: variant }));
    });
  });
}

async function main() {
  const variants = [
    ['alpha', 'ok'],
    ['beta', 'retryable'],
    ['gamma', 'fatal'],
    ['delta', 'retryable']
  ];
  const settled = await Promise.allSettled(variants.map(([id, variant]) => task(id, variant)));
  const aggregate = { values: [], retryable: [], fatal: [] };

  settled.forEach((item, index) => {
    const [id] = variants[index];
    if (item.status === 'fulfilled') {
      aggregate.values.push(item.value);
      return;
    }
    if (item.reason.code === 'retryable') aggregate.retryable.push(id);
    else aggregate.fatal.push(id);
  });

  console.log(aggregate);
  if (aggregate.values.length !== 1) throw new Error('成功项数量错误');
  if (aggregate.retryable.join(',') !== 'beta,delta') throw new Error('可重试项分类错误');
  if (aggregate.fatal.join(',') !== 'gamma') throw new Error('致命项分类错误');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        'aggregate.values 应含 alpha，retryable 为 beta 与 delta，fatal 为 gamma，退出码为 0。所有任务即使有失败也能等到各自 settled；分类必须依赖稳定错误码，而不是匹配中文错误文本。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：async/await、顺序与并发': {
    title: 'JS 代码台 10 · 用重叠计数证明并发',
    description:
      '同一组异步任务分别顺序执行和并发执行，并用 active/maxActive 计数证明是否真的重叠。时间数字只做观察，验收依赖确定性的并发状态。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-async-guided',
      title: '跟做：顺序等待与 Promise.all',
      brief:
        '运行 node main.js。三个任务分别延迟 15、5、10 毫秒。先记录顺序模式和并发模式的最大活跃数，再断言并发确实达到 3。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function delayed(name, ms, tracker) {
  return new Promise((resolve) => {
    tracker.active += 1;
    tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
    setTimeout(() => {
      tracker.active -= 1;
      resolve(name);
    }, ms);
  });
}

async function main() {
  const sequential = { active: 0, maxActive: 0 };
  const a = await delayed('a', 15, sequential);
  const b = await delayed('b', 5, sequential);
  const c = await delayed('c', 10, sequential);

  const concurrent = { active: 0, maxActive: 0 };
  const values = await Promise.all([
    delayed('a', 15, concurrent),
    delayed('b', 5, concurrent),
    delayed('c', 10, concurrent)
  ]);

  console.log('sequential:', [a, b, c], sequential);
  console.log('concurrent:', values, concurrent);

  if (sequential.maxActive !== 1) throw new Error('顺序 await 不应重叠');
  if (concurrent.maxActive !== 3) throw new Error('Promise.all 应并发三个任务');
  if (values.join(',') !== 'a,b,c') throw new Error('Promise.all 结果顺序应保持');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        'sequential 的 maxActive 必须为 1，concurrent 的 maxActive 必须为 3，Promise.all 结果仍按 a,b,c 顺序返回，退出码为 0。并发完成顺序可能不同，但结果数组位置由输入 Promise 顺序决定。',
    },
    apply: {
      id: 'javascript-async-independent',
      title: '独立实践：写一个有上限的任务池',
      brief:
        '运行 node main.js。实现 mapLimit(items, limit, worker)，任意时刻最多运行两个任务。用 active/maxActive 断言上限，并核对结果顺序与输入一致。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

async function mapLimit(items, limit, worker) {
  if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('limit 必须为正整数');
  const results = new Array(items.length);
  let nextIndex = 0;
  let active = 0;
  let maxActive = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      results[index] = await worker(items[index], index);
      active -= 1;
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(workers);
  return { results, maxActive };
}

async function main() {
  const tracker = { maxActive: 0 };
  const output = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
    tracker.maxActive += 1;
    await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 5 : 10));
    tracker.maxActive -= 1;
    return value * 10;
  });
  console.log(output);
  console.log('external maxActive:', tracker.maxActive);
  if (output.results.join(',') !== '10,20,30,40,50') throw new Error('结果顺序错误');
  if (output.maxActive > 2) throw new Error('任务池超过并发上限');
  if (output.maxActive !== 2) throw new Error('该数据集应触发两个并发 worker');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        'results 应保持 10,20,30,40,50，mapLimit 返回的 maxActive 应为 2，退出码为 0。任务池不是一次把所有 Promise 都创建出来；它用固定数量的 worker 持续领取下一个索引。',
    },
  },

  'programming:JavaScript · 事件循环、Promise 与异步控制：AbortController、超时与取消': {
    title: 'JS 代码台 11 · 取消不是假装成功',
    description:
      '给延迟任务接入 AbortSignal，分别在完成前取消与完成后读取结果。超时通过独立控制器触发 abort，并保留 AbortError 名称和计时信息。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-abort-guided',
      title: '跟做：在等待中被信号中断',
      brief:
        '运行 node main.js。启动一个 100 毫秒任务，20 毫秒后取消。断言 Promise 以 AbortError 拒绝，而不是返回空值或成功。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms, 'completed');
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

async function main() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('cancelled by learner', 'AbortError')), 20);
  try {
    await wait(100, controller.signal);
    throw new Error('取消后不应成功');
  } catch (error) {
    console.log('name:', error.name);
    console.log('message:', error.message);
    console.log('signal aborted:', controller.signal.aborted);
    if (error.name !== 'AbortError') throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        '应输出 AbortError、cancelled by learner、signal aborted true，退出码为 0。被取消的等待必须 clearTimeout；若继续 resolve，就会产生已经不再需要的晚到结果。',
    },
    apply: {
      id: 'javascript-abort-independent',
      title: '独立实践：超时包装器与清理',
      brief:
        '运行 node main.js。实现 withTimeout(ms, task, parentSignal)，内部控制器在超时或父信号取消时中断任务，并在 task 完成后清理 timer。分别验证正常完成、超时、父级取消三条路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function withTimeout(ms, task, parentSignal) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason);
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException(\`timeout after \${ms}ms\`, 'TimeoutError'));
  }, ms);

  return Promise.resolve()
    .then(() => task(controller.signal))
    .finally(() => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    });
}

function delayed(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms, 'done');
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

async function classify(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, name: error.name };
  }
}

async function main() {
  const parent = new AbortController();
  const normal = await classify(withTimeout(30, (signal) => delayed(5, signal), parent.signal));
  const timeout = await classify(withTimeout(10, (signal) => delayed(50, signal), parent.signal));
  const cancelledPromise = classify(withTimeout(100, (signal) => delayed(80, signal), parent.signal));
  setTimeout(() => parent.abort(new DOMException('parent cancelled', 'AbortError')), 5);
  const cancelled = await cancelledPromise;

  console.log({ normal, timeout, cancelled });
  if (!normal.ok || normal.value !== 'done') throw new Error('正常路径错误');
  if (timeout.ok || timeout.name !== 'TimeoutError') throw new Error('超时路径错误');
  if (cancelled.ok || cancelled.name !== 'AbortError') throw new Error('父级取消路径错误');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
      },
      stdin: '',
      checkpoint:
        'normal 应为 ok=true/value=done，timeout 应为 ok=false/name=TimeoutError，cancelled 应为 ok=false/name=AbortError，退出码为 0。finally 必须移除父信号监听并清理 timer，避免一次请求结束后留下资源。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：XSS、第三方脚本与 CSP': {
    title: 'JS 代码台 12 · 先编码数据，再谈可信输出',
    description:
      '用恶意字符串检验 HTML 文本、属性和脚本上下文。代码不启动浏览器，而是验证正确转义后的输出不含可执行标签，并对比直接拼接的危险结果。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-xss-guided',
      title: '跟做：把用户输入变成纯文本',
      brief:
        '运行 node main.js。实现 escapeHtml，对 <、>、&、引号编码；用 img onerror 与 script 片段验证拼接结果不再包含原始标签。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const attacks = [
  '<img src=x onerror=alert(1)>',
  '<script>steal()</script>',
  '\"><button>确认</button>'
];

for (const attack of attacks) {
  const safe = \`<p data-note="\${escapeHtml(attack)}">\${escapeHtml(attack)}</p>\`;
  console.log(safe);
  if (/<img|<script|<button/i.test(safe)) throw new Error('转义后仍出现可执行标签');
}

if (!escapeHtml('A&B').includes('&amp;')) throw new Error('& 必须先编码');
console.log('html escaping verified');
`,
      },
      stdin: '',
      checkpoint:
        '三段输出只能看到 &lt;、&gt;、&quot; 等实体，正则检查不能命中 img、script、button 原始标签，最后出现 html escaping verified，退出码为 0。先替换 &，否则后续实体中的 & 会被二次编码。',
    },
    apply: {
      id: 'javascript-xss-independent',
      title: '独立实践：阻止 javascript 协议与危险属性',
      brief:
        '运行 node main.js。实现 buildLink(label, href)：只允许 https:，拒绝 javascript: 与 data:，并对 label 转义。输出通过项和拒绝原因。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildLink(label, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    throw new TypeError('链接不是合法 URL');
  }
  if (url.protocol !== 'https:') throw new RangeError(\`禁止的协议: \${url.protocol}\`);
  return \`<a href="\${escapeText(url.href)}">\${escapeText(label)}</a>\`;
}

const link = buildLink('<订单>', 'https://example.test/orders?id=42');
console.log(link);

const attacks = [
  ['点我', 'javascript:alert(1)'],
  ['数据', 'data:text/html,<script>alert(1)</script>'],
  ['相对', '/orders/42']
];

for (const [label, href] of attacks) {
  let rejected = '';
  try {
    buildLink(label, href);
  } catch (error) {
    rejected = error.name;
  }
  console.log(href, '->', rejected);
  if (!rejected) throw new Error('危险协议没有被拒绝');
}

if (!link.includes('&lt;订单&gt;')) throw new Error('链接文字未转义');
console.log('link policy verified');
`,
      },
      stdin: '',
      checkpoint:
        'https 链接应生成转义后的 a 标签；javascript:、data: 与相对路径都应被拒绝，最后出现 link policy verified，退出码为 0。协议检查要在解析后的 URL 上做，不能只搜索原始字符串。',
    },
  },

  'programming:JavaScript · 性能、安全与部署：错误边界、日志和真实用户监控': {
    title: 'JS 代码台 13 · 让线上错误可定位且不泄密',
    description:
      '把异常整理成稳定事件结构，脱敏邮箱、令牌与请求体，再聚合延迟与错误率。验收既检查可诊断字段，也检查敏感信息没有进入日志。',
    ...nodeRuntime,
    practice: {
      id: 'javascript-observability-guided',
      title: '跟做：记录可关联的错误事件',
      brief:
        '运行 node main.js。抛出带 code 的异常，生成包含 name、message、code、route、traceId、timestamp 的事件，并过滤 token 与 email。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

function errorEvent(error, context) {
  const redact = (value) => String(value)
    .replace(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/g, '[email]')
    .replace(/token=[^&\\s]+/gi, 'token=[secret]');
  return {
    name: error.name,
    message: redact(error.message),
    code: error.code || 'UNKNOWN',
    route: context.route,
    traceId: context.traceId,
    timestamp: new Date('2026-11-24T08:00:00.000Z').toISOString()
  };
}

const error = Object.assign(
  new Error('token=abc123 denied for ada@example.com'),
  { code: 'AUTH_DENIED' }
);
const event = errorEvent(error, { route: '/orders/42', traceId: 'trace-7' });
console.log(event);

const serialized = JSON.stringify(event);
if (event.code !== 'AUTH_DENIED') throw new Error('稳定错误码丢失');
if (serialized.includes('abc123') || serialized.includes('ada@example.com')) {
  throw new Error('敏感信息进入日志');
}
if (!event.traceId || !event.route) throw new Error('缺少关联字段');
`,
      },
      stdin: '',
      checkpoint:
        '事件必须含 name、message、code、route、traceId、timestamp；序列化文本不能出现原始 token 或邮箱，退出码为 0。错误消息可以脱敏，但稳定 code、路由和 traceId 必须保留，否则排障只能猜。',
    },
    apply: {
      id: 'javascript-observability-independent',
      title: '独立实践：汇总 RUM 指标与错误率',
      brief:
        '运行 node main.js。对 8 条观测样本计算 LCP/INP/CLS 的中位数、错误率与慢样本比例，输出按路由分组的报告，并断言聚合结果。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `'use strict';

const samples = [
  { route: '/home', lcp: 1200, inp: 80, cls: 0.02, error: false },
  { route: '/home', lcp: 1800, inp: 120, cls: 0.04, error: false },
  { route: '/home', lcp: 3200, inp: 240, cls: 0.18, error: true },
  { route: '/orders', lcp: 1500, inp: 90, cls: 0.03, error: false },
  { route: '/orders', lcp: 2100, inp: 150, cls: 0.07, error: false },
  { route: '/orders', lcp: 2600, inp: 260, cls: 0.12, error: true },
  { route: '/orders', lcp: 900, inp: 60, cls: 0.01, error: false },
  { route: '/orders', lcp: 4000, inp: 300, cls: 0.25, error: true }
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

function summarize(rows) {
  return {
    count: rows.length,
    lcpMedian: median(rows.map((row) => row.lcp)),
    inpMedian: median(rows.map((row) => row.inp)),
    clsMedian: median(rows.map((row) => row.cls)),
    errorRate: Number((rows.filter((row) => row.error).length / rows.length).toFixed(3)),
    slowRate: Number((rows.filter((row) => row.lcp > 2500).length / rows.length).toFixed(3))
  };
}

const report = Object.fromEntries(
  [...new Set(samples.map((row) => row.route))]
    .map((route) => [route, summarize(samples.filter((row) => row.route === route))])
);
console.log(JSON.stringify(report, null, 2));

if (report['/home'].lcpMedian !== 1800) throw new Error('home LCP 中位数错误');
if (report['/orders'].errorRate !== 0.4) throw new Error('orders 错误率错误');
if (report['/orders'].slowRate !== 0.4) throw new Error('orders 慢样本比例错误');
`,
      },
      stdin: '',
      checkpoint:
        '/home 的 lcpMedian 应为 1800；/orders 的 errorRate 与 slowRate 都应为 0.4，退出码为 0。中位数与比例都要基于原始样本计算，并且每条观测应带版本、设备或用户关联字段，单看一个聚合值无法定位回归。',
    },
  },
};
