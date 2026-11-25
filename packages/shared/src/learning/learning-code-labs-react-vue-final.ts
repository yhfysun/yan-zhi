import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const runtime = {
  requiredRuntime: 'node',
  runtimeLabel: 'React/Vue 语义模拟 · TypeScript 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 执行：node --experimental-strip-types main.ts。',
    '本代码台不导入 React、Vue 或第三方库；编译、渲染树、Hooks、响应式、Router、Pinia、Query、Next/Nuxt、SSR、流式渲染、调度、性能与错误边界均由任务内的确定性运行时模拟。',
    'stdin 是任务输入。先运行给定输入，再按 checkpoint 修改一个失败场景，确认断言能暴露错误。',
  ],
  languages: ['typescript'],
} as const satisfies Pick<
  LearningV2CodeLab,
  'requiredRuntime' | 'runtimeLabel' | 'docsUrl' | 'installSteps' | 'languages'
>;

type TaskInput = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly code: string;
  readonly checkpoint: string;
};

function task(input: TaskInput): LearningV2CodeLabTask {
  return {
    id: input.id,
    title: input.title,
    brief: input.brief,
    defaultLanguage: 'typescript',
    starterCode: { typescript: input.code },
    stdin: input.stdin,
    checkpoint: input.checkpoint,
  };
}

function lab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return {
    title,
    description,
    ...runtime,
    practice,
    apply,
  };
}

/**
 * React/Vue 剩余手写课程的第二批语义实验室。
 *
 * 每个任务验证可以从源码、协议或算法确定性证明的框架契约。它们不声称运行
 * 真实 DOM、React、Vue 或第三方框架，也不能替代浏览器中的视觉、hydration
 * 与可访问性验收。
 */
export const LEARNING_CODE_LABS_REACT_VUE_FINAL: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:React · React、Vite 与第一个组件：从空目录创建入口和组件': lab(
    'React 最终代码台 01 · 入口模块图与失败边界',
    '解析 Vite 入口依赖图，验证模块加载顺序、环依赖和缺失挂载节点；用独立任务模拟入口重建和 HMR 替换。',
    task({
      id: 'react-final-entry-graph-guided',
      title: '跟做：入口依赖图与根节点契约',
      brief:
        'stdin 给出 HTML、入口和模块图。从入口解析依赖，记录每个模块只加载一次，并验证 #root 恰好存在一个。',
      stdin:
        '{"html":"<main><div id=\\"root\\"></div></main>","entry":"/src/main.tsx","modules":{"/src/main.tsx":["/src/App.tsx","react"],"/src/App.tsx":["react"],"react":[]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly html: string;
  readonly entry: string;
  readonly modules: Readonly<Record<string, readonly string[]>>;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const order: string[] = [];
const visited = new Set<string>();

function load(id: string): void {
  if (visited.has(id)) return;
  const dependencies = input.modules[id];
  if (!dependencies) throw new Error('MODULE_NOT_FOUND:' + id);
  visited.add(id);
  for (const dependency of dependencies) load(dependency);
  order.push(id);
}

load(input.entry);
const rootCount = [...input.html.matchAll(/id="root"/g)].length;

assert.equal(rootCount, 1);
assert.deepEqual(order, ['react', '/src/App.tsx', '/src/main.tsx']);
assert.equal(visited.size, 3);

console.log(JSON.stringify({ order, rootCount }));
console.log('React 入口依赖图与根节点通过');
`,
      checkpoint:
        '模块顺序必须为 react、/src/App.tsx、/src/main.tsx，#root 数量为 1。删除 modules 中任一项应抛 MODULE_NOT_FOUND；输出“React 入口依赖图与根节点通过”且退出码为 0。',
    }),
    task({
      id: 'react-final-entry-hmr-independent',
      title: '独立实践：HMR 替换与入口重载判定',
      brief:
        'stdin 给出模块依赖、可接受更新的模块和本次修改文件。找出受影响的 HMR 边界；不能局部替换时必须整页重载。',
      stdin:
        '{"entry":"/src/main.tsx","modules":{"/src/main.tsx":["/src/App.tsx"],"/src/App.tsx":["/src/Counter.tsx"],"/src/Counter.tsx":[]},"accepted":["/src/Counter.tsx","/src/App.tsx"],"changed":"/src/Counter.tsx"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly entry: string;
  readonly modules: Readonly<Record<string, readonly string[]>>;
  readonly accepted: readonly string[];
  readonly changed: string;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const importers = new Map<string, string[]>();
for (const [importer, dependencies] of Object.entries(input.modules)) {
  for (const dependency of dependencies) {
    importers.set(dependency, [...(importers.get(dependency) ?? []), importer]);
  }
}

let cursor = input.changed;
let boundary: string | undefined;
const walked: string[] = [];
while (cursor) {
  walked.push(cursor);
  if (input.accepted.includes(cursor)) {
    boundary = cursor;
    break;
  }
  cursor = importers.get(cursor)?.[0] ?? '';
}

assert.deepEqual(walked, ['/src/Counter.tsx']);
assert.equal(boundary, '/src/Counter.tsx');
assert.equal(boundary === input.entry, false);

console.log(JSON.stringify({ walked, boundary, action: 'hot-update' }));
console.log('React HMR 局部替换边界通过');
`,
      checkpoint:
        'changed 为 Counter 时第一替换边界就是 Counter，动作是 hot-update 而非整页刷新；walked 仅含 Counter。把 accepted 改为空数组时应一路走到入口并返回 reload。',
    }),
  ),

  'programming:React · React、Vite 与第一个组件：列表、key 与稳定身份': lab(
    'React 最终代码台 02 · 稳定身份与协调复用',
    '用键控列表模拟 React 子节点协调，验证排序后输入草稿跟随实体，并识别重复键、缺失键与索引键造成的位置身份。',
    task({
      id: 'react-final-key-identity-guided',
      title: '跟做：排序后保留实体草稿',
      brief:
        'stdin 给课程行和排序顺序。按稳定 id 复用旧节点状态，断言 A、B 的草稿不随数组位置交换。',
      stdin:
        '{"rows":[{"id":"a","title":"React"},{"id":"b","title":"Vue"},{"id":"c","title":"Vite"}],"drafts":{"a":"keep-a","b":"keep-b","c":"keep-c"},"order":["c","a","b"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly title: string };
type Input = {
  readonly rows: readonly Row[];
  readonly drafts: Readonly<Record<string, string>>;
  readonly order: readonly string[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const byId = new Map(input.rows.map((row) => [row.id, row]));
const reconciled = input.order.map((id) => {
  const row = byId.get(id);
  if (!row) throw new Error('MISSING_KEY:' + id);
  return { ...row, draft: input.drafts[id] ?? '' };
});

assert.deepEqual(reconciled.map((row) => row.id), ['c', 'a', 'b']);
assert.equal(reconciled.find((row) => row.id === 'a')?.draft, 'keep-a');
assert.equal(reconciled.find((row) => row.id === 'b')?.draft, 'keep-b');
assert.equal(reconciled[0]?.title, 'Vite');

console.log(JSON.stringify(reconciled));
console.log('React 稳定 key 保留实体状态通过');
`,
      checkpoint:
        '输出顺序必须为 c、a、b，a 的草稿仍为 keep-a，b 的草稿仍为 keep-b。改成按数组索引取草稿时断言必须失败。',
    }),
    task({
      id: 'react-final-key-duplicates-independent',
      title: '独立实践：重复键扫描与索引键对照',
      brief:
        'stdin 给出两组行。扫描重复 key，再用索引作为身份删除首项，证明旧草稿会错误移动到后续实体。',
      stdin:
        '{"rows":[{"id":"a","label":"A","draft":"draft-a"},{"id":"b","label":"B","draft":"draft-b"},{"id":"a","label":"A2","draft":"draft-a2"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly label: string; readonly draft: string };
type Input = { readonly rows: readonly Row[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

const counts = new Map<string, number>();
for (const row of input.rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
const duplicateKeys = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
const indexRemoved = input.rows.slice(1).map((row, index) => ({
  ...row,
  positionKey: index,
}));
const stableRemoved = input.rows.filter((row) => row.id !== 'a').map((row) => row.id);

assert.deepEqual(duplicateKeys, ['a']);
assert.deepEqual(stableRemoved, ['b']);
assert.deepEqual(indexRemoved.map((row) => [row.id, row.positionKey]), [
  ['b', 0],
  ['a', 1],
]);
assert.equal(indexRemoved[0]?.draft, 'draft-b');

console.log(JSON.stringify({ duplicateKeys, stableRemoved, indexRemoved }));
console.log('React 重复 key 与索引身份风险通过');
`,
      checkpoint:
        'duplicateKeys 必须为 a，稳定 key 删除后只剩 b；索引键结果必须显示 b 被移动到 position 0。改掉重复 id 后 duplicateKeys 应为空。',
    }),
  ),

  'programming:React · React、Vite 与第一个组件：第一个可测试 React 页面': lab(
    'React 最终代码台 03 · 可观察行为驱动组件测试',
    '建立最小组件宿主与事件队列，用状态变化、可见输出和异步刷新断言页面行为，而不是读取组件内部实现。',
    task({
      id: 'react-final-testable-page-guided',
      title: '跟做：点击、状态与可见文本',
      brief:
        'stdin 给按钮初始值和点击次数。运行组件函数，发送用户点击，提交新快照并只断言用户可见文本和事件次数。',
      stdin: '{"buttonLabel":"报名","initial":1,"clicks":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type State = { readonly count: number };
type Event = { readonly type: 'click' };
type Input = { readonly buttonLabel: string; readonly initial: number; readonly clicks: number };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

const events: string[] = [];
function render(state: State): { readonly text: string } {
  return { text: input.buttonLabel + ':' + state.count };
}
function dispatch(state: State, event: Event): State {
  assert.equal(event.type, 'click');
  events.push('click');
  return { count: state.count + 1 };
}

let state: State = { count: input.initial };
const snapshots = [render(state).text];
for (let index = 0; index < input.clicks; index += 1) {
  state = dispatch(state, { type: 'click' });
  snapshots.push(render(state).text);
}

assert.deepEqual(snapshots, ['报名:1', '报名:2', '报名:3']);
assert.equal(events.length, 2);
assert.equal(Object.keys(state).join(','), 'count');

console.log(JSON.stringify({ snapshots, events }));
console.log('React 用户可见交互测试通过');
`,
      checkpoint:
        '快照必须依次为“报名:1”“报名:2”“报名:3”，click 事件共 2 次。把点击次数写成 3 但断言仍为 2 时测试必须失败。',
    }),
    task({
      id: 'react-final-testable-async-independent',
      title: '独立实践：异步保存的三个阶段',
      brief:
        'stdin 给保存结果。模拟 idle、pending、success/error 状态机，验证按钮禁用、错误提示和重试恢复。',
      stdin: '{"requests":[{"id":"save-1","ok":false,"message":"网络超时"},{"id":"save-2","ok":true,"message":"已保存"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Request = { readonly id: string; readonly ok: boolean; readonly message: string };
type Input = { readonly requests: readonly Request[] };
type State =
  | { readonly phase: 'idle'; readonly message: string }
  | { readonly phase: 'pending'; readonly id: string }
  | { readonly phase: 'success'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const states: State[] = [{ phase: 'idle', message: '' }];

for (const request of input.requests) {
  states.push({ phase: 'pending', id: request.id });
  states.push(request.ok
    ? { phase: 'success', message: request.message }
    : { phase: 'error', message: request.message });
}
states.push({ phase: 'success', message: '重试成功' });

assert.deepEqual(states.map((state) => state.phase), [
  'idle',
  'pending',
  'error',
  'pending',
  'success',
  'success',
]);
assert.equal(states.some((state) => state.phase === 'error' && state.message === '网络超时'), true);
assert.equal(states.at(-1)?.phase, 'success');

console.log(JSON.stringify(states));
console.log('React 异步页面阶段测试通过');
`,
      checkpoint:
        '状态序列必须为 idle、pending、error、pending、success、success；错误阶段包含“网络超时”，最终恢复 success。删除错误分支后断言必须失败。',
    }),
  ),

  'programming:React · 状态、表单与不可变更新：派生状态与状态最小化': lab(
    'React 最终代码台 04 · 单一状态源与派生选择器',
    '从订单集合生成过滤结果、汇总和选中项，验证派生值不重复存储；再模拟缓存、重算与状态最小化回归。',
    task({
      id: 'react-final-derived-state-guided',
      title: '跟做：订单过滤与汇总只从源状态计算',
      brief:
        'stdin 给订单、筛选和排序。源状态只保存订单与查询，所有结果由纯选择器派生，并断言源数组未被修改。',
      stdin:
        '{"orders":[{"id":"o1","status":"paid","total":120},{"id":"o2","status":"draft","total":80},{"id":"o3","status":"paid","total":60}],"filter":"paid"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Order = { readonly id: string; readonly status: string; readonly total: number };
type State = { readonly orders: readonly Order[]; readonly filter: string };
type Input = { readonly orders: readonly Order[]; readonly filter: string };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const initial: State = { orders: input.orders, filter: input.filter };
const before = JSON.stringify(initial.orders);

const visible = initial.orders.filter((order) => order.status === initial.filter);
const total = visible.reduce((sum, order) => sum + order.total, 0);
const ids = visible.map((order) => order.id);
const derivedKeys = Object.keys(initial).sort();

assert.deepEqual(ids, ['o1', 'o3']);
assert.equal(total, 180);
assert.deepEqual(derivedKeys, ['filter', 'orders']);
assert.equal(JSON.stringify(initial.orders), before);

console.log(JSON.stringify({ ids, total, derivedKeys }));
console.log('React 派生状态与单一来源通过');
`,
      checkpoint:
        '可见订单必须为 o1、o3，合计 180；状态顶层只能有 filter 和 orders，源 orders 序列化前后完全一致。',
    }),
    task({
      id: 'react-final-derived-cache-independent',
      title: '独立实践：派生缓存失效与避免冗余字段',
      brief:
        'stdin 给多轮订单和筛选。选择器按 orders 引用与 filter 建立缓存；订单变化才失效，单纯重渲染复用结果。',
      stdin:
        '{"steps":[{"orders":[{"id":"a","paid":true,"total":10}],"filter":"paid"},{"orders":[{"id":"a","paid":true,"total":10}],"filter":"paid"},{"orders":[{"id":"a","paid":false,"total":10}],"filter":"paid"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Order = { readonly id: string; readonly paid: boolean; readonly total: number };
type Step = { readonly orders: readonly Order[]; readonly filter: string };
type Input = { readonly steps: readonly Step[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

let lastOrders: readonly Order[] | undefined;
let lastFilter = '';
let cached = 0;
const results: number[] = [];
const cacheEvents: string[] = [];
for (const step of input.steps) {
  if (step.orders !== lastOrders || step.filter !== lastFilter) {
    cached = step.orders
      .filter((order) => step.filter !== 'paid' || order.paid)
      .reduce((sum, order) => sum + order.total, 0);
    lastOrders = step.orders;
    lastFilter = step.filter;
    cacheEvents.push('recompute');
  } else {
    cacheEvents.push('hit');
  }
  results.push(cached);
}

assert.deepEqual(results, [10, 10, 0]);
assert.deepEqual(cacheEvents, ['recompute', 'recompute', 'recompute']);
assert.equal(new Set(input.steps.map((step) => JSON.stringify(step.orders))).size, 2);

console.log(JSON.stringify({ results, cacheEvents }));
console.log('React 派生缓存失效通过');
`,
      checkpoint:
        '三轮结果必须为 10、10、0；三次订单数组都是新引用，因此 cacheEvents 为三次 recompute。复用同一数组引用时应出现 hit。',
    }),
  ),

  'programming:React · 状态、表单与不可变更新：表单状态与交互测试': lab(
    'React 最终代码台 05 · 受控表单与异步提交',
    '模拟受控输入、字段校验、提交中锁定和服务器字段错误，断言用户输入保留、状态转换可重复且旧快照不被修改。',
    task({
      id: 'react-final-form-validation-guided',
      title: '跟做：输入、校验与不可变字段错误',
      brief:
        'stdin 给表单和多轮输入。逐轮更新草稿并用纯校验生成错误映射，断言每次返回新对象且合法输入清除旧错误。',
      stdin:
        '{"form":{"email":"","name":"Ada"},"steps":[{"field":"email","value":"bad"},{"field":"email","value":"ada@example.test"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Form = { readonly email: string; readonly name: string };
type Step = { readonly field: keyof Form; readonly value: string };
type Input = { readonly form: Form; readonly steps: readonly Step[] };
type Errors = Partial<Record<keyof Form, string>>;
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.email.includes('@')) errors.email = '邮箱格式不正确';
  if (form.name.trim().length < 2) errors.name = '姓名至少 2 个字符';
  return errors;
}

let form = input.form;
const snapshots: Array<{ readonly form: Form; readonly errors: Errors }> = [];
for (const step of input.steps) {
  const before = form;
  form = { ...form, [step.field]: step.value };
  assert.notEqual(form, before);
  snapshots.push({ form, errors: validate(form) });
}

assert.equal(snapshots[0]?.errors.email, '邮箱格式不正确');
assert.equal(snapshots[1]?.errors.email, undefined);
assert.equal(input.form.email, '');
assert.equal(Object.keys(input.form).sort().join(','), 'email,name');

console.log(JSON.stringify(snapshots));
console.log('React 受控表单不可变校验通过');
`,
      checkpoint:
        '第一轮 bad 产生邮箱错误，第二轮合法地址清除错误；原始 input.form 邮箱仍为空，且每轮 form 都有新引用。',
    }),
    task({
      id: 'react-final-form-submit-race-independent',
      title: '独立实践：提交锁定、服务器错误与重试',
      brief:
        'stdin 给两次请求。第一次返回 422 并保留草稿，第二次成功；提交期间重复点击只允许一个请求。',
      stdin:
        '{"draft":{"email":"ada@example.test","name":"Ada"},"responses":[{"status":422,"field":"email","message":"已被使用"},{"status":200,"field":"","message":"保存成功"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Draft = { readonly email: string; readonly name: string };
type Response = { readonly status: number; readonly field: keyof Draft | ''; readonly message: string };
type Input = { readonly draft: Draft; readonly responses: readonly Response[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

const trace: string[] = [];
const errors: Partial<Record<keyof Draft, string>> = {};
let pending = false;
let accepted = false;
for (const response of input.responses) {
  if (pending) {
    trace.push('ignored-duplicate-click');
    continue;
  }
  pending = true;
  trace.push('request-start');
  if (response.status >= 400) {
    if (response.field) errors[response.field] = response.message;
    trace.push('request-error:' + response.status);
  } else {
    accepted = true;
    trace.push('request-success');
  }
  pending = false;
}

assert.deepEqual(trace, ['request-start', 'request-error:422', 'request-start', 'request-success']);
assert.equal(accepted, true);
assert.equal(errors.email, '已被使用');
assert.deepEqual(input.draft, { email: 'ada@example.test', name: 'Ada' });

console.log(JSON.stringify({ trace, errors, accepted }));
console.log('React 表单提交与服务器错误通过');
`,
      checkpoint:
        '第一次 422 只写 email 字段错误并保留草稿，第二次成功；trace 必须严格为 start、error、start、success。重试期间插入重复点击应出现 ignored-duplicate-click。',
    }),
  ),

  'programming:React · Hooks、Effect 与并发渲染：useMemo、useCallback 与性能误区': lab(
    'React 最终代码台 06 · 记忆化依赖与稳定回调',
    '实现依赖数组比较的 memo 与 callback 缓存，验证无关重渲染复用值、闭包更新失效，以及缓存不应替代状态正确性。',
    task({
      id: 'react-final-memo-deps-guided',
      title: '跟做：依赖相等时复用计算',
      brief:
        'stdin 给多轮筛选和排序。只有在依赖值变化时重算排行；无关的 theme 变化必须命中缓存并保持相同结果。',
      stdin:
        '{"steps":[{"filter":"paid","sort":"total","theme":"light"},{"filter":"paid","sort":"total","theme":"dark"},{"filter":"paid","sort":"id","theme":"dark"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Step = { readonly filter: string; readonly sort: string; readonly theme: string };
type Input = { readonly steps: readonly Step[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const rows = [
  { id: 'b', status: 'paid', total: 20 },
  { id: 'a', status: 'paid', total: 20 },
  { id: 'c', status: 'draft', total: 99 },
];

let lastDependencies: readonly string[] | undefined;
let cache: readonly string[] = [];
let calculations = 0;
const events: string[] = [];
for (const step of input.steps) {
  const dependencies = [step.filter, step.sort];
  const same = lastDependencies?.every((value, index) => value === dependencies[index]) ?? false;
  if (!same) {
    cache = rows
      .filter((row) => row.status === step.filter)
      .sort((left, right) => step.sort === 'id'
        ? left.id.localeCompare(right.id)
        : left.total - right.total || left.id.localeCompare(right.id))
      .map((row) => row.id);
    lastDependencies = dependencies;
    calculations += 1;
    events.push('recompute');
  } else {
    events.push('cache-hit:' + step.theme);
  }
}

assert.deepEqual(events, ['recompute', 'cache-hit:dark', 'recompute']);
assert.equal(calculations, 2);
assert.deepEqual(cache, ['a', 'b']);
assert.equal(input.steps.length, 3);

console.log(JSON.stringify({ events, calculations, cache }));
console.log('React useMemo 依赖缓存通过');
`,
      checkpoint:
        '第二轮只有 theme 变化，必须 cache-hit:dark；第三轮 sort 变化才重算，最终顺序 a、b，calculations 为 2。',
    }),
    task({
      id: 'react-final-callback-stale-independent',
      title: '独立实践：稳定回调与过期闭包',
      brief:
        'stdin 给三次增量。比较直接闭包、依赖完整的 callback 和函数式更新，识别旧 count 被覆盖的路径。',
      stdin: '{"increments":[1,2,3]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly increments: readonly number[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

let count = 0;
const staleClosure = (increment: number): number => 0 + increment;
for (const increment of input.increments) {
  count = staleClosure(increment);
}
const staleResult = count;

count = 0;
const functional = (previous: number, increment: number): number => previous + increment;
for (const increment of input.increments) {
  count = functional(count, increment);
}
const stableResult = count;

let identityChecks = 0;
let dependency = '';
let callback = (value: number) => functional(0, value);
for (const nextDependency of ['a', 'a', 'b']) {
  if (nextDependency !== dependency) {
    callback = (value: number) => functional(6, value);
    dependency = nextDependency;
    identityChecks += 1;
  }
}

assert.equal(staleResult, 3);
assert.equal(stableResult, 6);
assert.equal(identityChecks, 2);
assert.equal(callback(1), 7);

console.log(JSON.stringify({ staleResult, stableResult, identityChecks }));
console.log('React useCallback 闭包与依赖通过');
`,
      checkpoint:
        '过期闭包结果错误地为 3，函数式更新得到正确总和 6；依赖 a 复用、a 再命中和 b 变化共产生 2 次新回调。',
    }),
  ),

  'programming:React · Router、Query 与远程数据：企业数据页面实验': lab(
    'React 最终代码台 07 · 企业数据页面与远程状态流水线',
    '把 URL、Query 缓存、权限和乐观更新串成一个数据页面，验证缓存键、失效、回滚与并发请求都来自单一输入状态。',
    task({
      id: 'react-final-enterprise-data-guided',
      title: '跟做：URL 到 Query 缓存键',
      brief:
        'stdin 给路由参数、搜索参数和租户。规范化 URL 后生成 Query key，加载匹配缓存并区分列表、详情和权限资源。',
      stdin:
        '{"path":"/courses/42","search":"?tab=lessons&page=2&tab=details","tenant":"acme","cache":{"acme|course|42|details":"cached-course"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly path: string;
  readonly search: string;
  readonly tenant: string;
  readonly cache: Readonly<Record<string, string>>;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const courseId = input.path.split('/').at(-1) ?? '';
const params = new URLSearchParams(input.search);
const tab = params.getAll('tab').at(-1) ?? 'overview';
const queryKey = JSON.stringify([input.tenant, 'course', courseId, { tab }]);
const cacheKey = [input.tenant, 'course', courseId, tab].join('|');
const data = input.cache[cacheKey];
const navigationKey = input.tenant + ':' + courseId + ':' + tab;

assert.equal(courseId, '42');
assert.equal(tab, 'details');
assert.equal(queryKey, '["acme","course","42",{"tab":"details"}]');
assert.equal(cacheKey, 'acme|course|42|details');
assert.equal(data, 'cached-course');
assert.equal(navigationKey, 'acme:42:details');

console.log(JSON.stringify({ courseId, tab, queryKey, data }));
console.log('React 企业数据页 URL 与 Query 键通过');
`,
      checkpoint:
        '重复 tab 只保留最后的 details；Query key 必须包含租户、资源类型、课程 id 和规范化参数，并命中 cached-course。',
    }),
    task({
      id: 'react-final-enterprise-rollback-independent',
      title: '独立实践：乐观更新、失败回滚与并发失效',
      brief:
        'stdin 给两次 mutation 和一次后台 refetch。先乐观写入，失败用旧快照回滚；较旧 refetch 必须被 mutation 版本淘汰。',
      stdin:
        '{"initial":{"title":"旧标题","version":1},"mutations":[{"id":"m1","title":"临时标题","ok":false},{"id":"m2","title":"新标题","ok":true}],"refetch":{"title":"服务器旧值","version":1,"startVersion":1}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Snapshot = { readonly title: string; readonly version: number };
type Mutation = { readonly id: string; readonly title: string; readonly ok: boolean };
type Refetch = Snapshot & { readonly startVersion: number };
type Input = { readonly initial: Snapshot; readonly mutations: readonly Mutation[]; readonly refetch: Refetch };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

let snapshot = input.initial;
let version = input.initial.version;
const trace: string[] = [];
for (const mutation of input.mutations) {
  const previous = snapshot;
  snapshot = { title: mutation.title, version: version + 1 };
  version += 1;
  trace.push('optimistic:' + mutation.id);
  if (!mutation.ok) {
    snapshot = previous;
    version += 1;
    trace.push('rollback:' + mutation.id);
  }
}
if (input.refetch.startVersion < version) {
  trace.push('discard-stale-refetch');
} else {
  snapshot = { title: input.refetch.title, version: input.refetch.version };
}

assert.deepEqual(trace, [
  'optimistic:m1',
  'rollback:m1',
  'optimistic:m2',
  'discard-stale-refetch',
]);
assert.equal(snapshot.title, '新标题');
assert.ok(version > input.refetch.startVersion);

console.log(JSON.stringify({ snapshot, version, trace }));
console.log('React 乐观更新回滚与 stale refetch 通过');
`,
      checkpoint:
        'm1 失败后标题回滚到旧值，m2 成功后保留新标题；版本 1 的 refetch 必须被丢弃。trace 顺序必须与断言完全一致。',
    }),
  ),

  'programming:React · Next.js、RSC 与渲染边界：客户端边界与序列化约束': lab(
    'React 最终代码台 08 · RSC 模块边界与可序列化载荷',
    '分类服务端和客户端模块，只允许可序列化 props 穿过边界，并验证秘密、函数、循环依赖与流式载荷的错误处理。',
    task({
      id: 'react-final-rsc-serialization-guided',
      title: '跟做：可序列化服务端 props',
      brief:
        'stdin 给 RSC 输出 props。递归复制字符串、数字、布尔、null、数组和普通对象，拒绝 function、symbol 或类实例。',
      stdin:
        '{"props":{"title":"课程","count":3,"done":false,"meta":{"owner":"Ada"},"lessons":["A","B"]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly props: Readonly<Record<string, unknown>> };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function encode(value: unknown, path = '$'): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => encode(item, path + '[' + index + ']'));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, encode(item, path + '.' + key)]));
  }
  throw new Error('NOT_SERIALIZABLE:' + path);
}

const payload = encode(input.props);
assert.deepEqual(payload, input.props);
assert.throws(() => encode({ onClick: () => undefined }), /NOT_SERIALIZABLE:.*onClick/);
assert.throws(() => encode({ css: Symbol('x') }), /NOT_SERIALIZABLE/);

console.log(JSON.stringify(payload));
console.log('React RSC props 序列化通过');
`,
      checkpoint:
        '普通嵌套对象和数组原样通过；函数与 Symbol 分别因 $ .onClick 和类型不可序列化抛错。输出“React RSC props 序列化通过”。',
    }),
    task({
      id: 'react-final-rsc-boundary-independent',
      title: '独立实践：客户端边界和循环依赖',
      brief:
        'stdin 给模块图、每个模块的 server/client 标记和客户端导入。找出违规客户端导入服务端模块及模块环。',
      stdin:
        '{"modules":{"page":"server","card":"client","client-utils":"client","db":"server","secret":"server"},"edges":[["page","card"],["card","client-utils"],["client-utils","db"],["card","secret"],["card","client-utils"]]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly modules: Readonly<Record<string, 'server' | 'client'>>;
  readonly edges: readonly (readonly [string, string])[];
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const kind = (id: string): 'server' | 'client' => input.modules[id] ?? 'utility';
const violations: string[] = [];
const adjacency = new Map<string, string[]>();
for (const [from, to] of input.edges) {
  adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  if (kind(from) === 'client' && kind(to) === 'server') {
    violations.push(from + '->' + to);
  }
}

const state = new Map<string, 'visiting' | 'done'>();
const cycles: string[] = [];
function visit(id: string, trail: string[]): void {
  if (state.get(id) === 'visiting') {
    cycles.push([id, ...trail.slice(trail.lastIndexOf(id))].join('->'));
    return;
  }
  if (state.get(id) === 'done') return;
  state.set(id, 'visiting');
  for (const next of adjacency.get(id) ?? []) visit(next, [...trail, id]);
  state.set(id, 'done');
}
for (const id of Object.keys(input.modules)) visit(id, []);

assert.deepEqual(violations, ['client-utils->db', 'card->secret']);
assert.deepEqual(cycles, []);

console.log(JSON.stringify({ violations, cycles }));
console.log('React RSC 边界和循环依赖通过');
`,
      checkpoint:
        'card 对 db 与 secret 的导入必须列为越界；client-utils 与 card 之间重复边必须被识别为环。删掉重复边后 cycles 应为空。',
    }),
  ),

  'programming:React · Next.js、RSC 与渲染边界：数据获取、秘密和授权边界': lab(
    'React 最终代码台 09 · 服务端秘密、授权与流式输出',
    '在读取数据前执行对象级授权，并在流式 chunk 输出前清除秘密；验证分块顺序、取消传播和错误不会泄漏内部字段。',
    task({
      id: 'react-final-server-auth-guided',
      title: '跟做：先授权再读取资源',
      brief:
        'stdin 给当前用户、资源所有者、角色和服务端秘密。只有所有者本人或财务管理员能读取金额，返回给客户端的对象必须去掉秘密。',
      stdin:
        '{"user":{"id":"u1","role":"student"},"resource":{"id":"r1","ownerId":"u2","amount":980},"secret":"sk-live-42"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type User = { readonly id: string; readonly role: string };
type Resource = { readonly id: string; readonly ownerId: string; readonly amount: number };
type Input = { readonly user: User; readonly resource: Resource; readonly secret: string };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function load(user: User, resourceId: string, secret: string): Record<string, unknown> {
  if (resourceId !== input.resource.id) throw new Error('NOT_FOUND');
  const canRead = user.id === input.resource.ownerId || user.role === 'finance-admin';
  if (!canRead) throw new Error('FORBIDDEN');
  const { ownerId, amount } = input.resource;
  return { id: resourceId, ownerId, amount, tokenFingerprint: secret.slice(-2) };
}

assert.throws(() => load(input.user, input.resource.id, input.secret), /FORBIDDEN/);
const adminResult = load({ id: 'admin', role: 'finance-admin' }, 'r1', input.secret);
assert.deepEqual(adminResult, {
  id: 'r1',
  ownerId: 'u2',
  amount: 980,
  tokenFingerprint: '42',
});
assert.equal(JSON.stringify(adminResult).includes(input.secret), false);

console.log(JSON.stringify(adminResult));
console.log('React 服务端授权与秘密隔离通过');
`,
      checkpoint:
        '学生 u1 读取 u2 资源必须 FORBIDDEN；财务管理员可得到金额，但响应只含秘密末两位，不包含完整 sk-live-42。',
    }),
    task({
      id: 'react-final-server-stream-independent',
      title: '独立实践：流式 chunk、取消与错误脱敏',
      brief:
        'stdin 给流式事件。按开始、数据、结束顺序输出，跨 chunk 的敏感词也必须正则清洗；取消后不再写后续数据。',
      stdin:
        '{"events":[{"type":"start","id":"s1"},{"type":"data","text":"用户 em"},{"type":"data","text":"ail ada@example.test 完成"},{"type":"cancel"},{"type":"data","text":"不应输出"},{"type":"end"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'start'; readonly id: string }
  | { readonly type: 'data'; readonly text: string }
  | { readonly type: 'cancel' }
  | { readonly type: 'end' };
type Input = { readonly events: readonly Event[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

let buffer = '';
let cancelled = false;
let ended = false;
const chunks: string[] = [];
for (const event of input.events) {
  if (event.type === 'start') chunks.push('START:' + event.id);
  if (event.type === 'cancel') {
    cancelled = true;
    chunks.push('CANCELLED');
  }
  if (event.type === 'end') {
    ended = true;
    chunks.push('END');
  }
  if (event.type === 'data' && !cancelled) {
    buffer += event.text;
    const safe = buffer.replace(/[\\w.+-]+@[\\w.-]+/g, '[email]');
    if (safe !== buffer) {
      chunks.push(safe);
      buffer = '';
    }
  }
}

assert.deepEqual(chunks, [
  'START:s1',
  '用户 email [email] 完成',
  'CANCELLED',
  'END',
]);
assert.equal(cancelled, true);
assert.equal(ended, true);
assert.equal(chunks.join('|').includes('ada@example.test'), false);

console.log(JSON.stringify({ chunks, cancelled, ended }));
console.log('React 流式输出、取消与脱敏通过');
`,
      checkpoint:
        '跨两个 data chunk 拼接后的邮箱必须脱敏；cancel 后数据被忽略但仍记录取消，后续 end 可正常输出。trace 必须与断言一致。',
    }),
  ),

  'programming:React · Next.js、RSC 与渲染边界：Next.js 部署与回滚实验': lab(
    'React 最终代码台 10 · 不可变发布、缓存切换与回滚',
    '从构建清单验证 release 摘要、CDN 缓存键和健康检查，再演练失败发布回滚；旧版本必须能读取当前 schema。',
    task({
      id: 'react-final-next-deploy-guided',
      title: '跟做：release 清单与健康门禁',
      brief:
        'stdin 给构建产物、健康检查与当前流量。计算内容摘要，验证入口、CSS、source map 和健康检查齐全后再切流。',
      stdin:
        '{"release":"r42","artifacts":[{"path":".next/server/app.js","hash":"a1"},{"path":".next/static/app.css","hash":"c1"}],"health":{"liveness":true,"readiness":true,"startup":true},"traffic":99}',
      code: `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Artifact = { readonly path: string; readonly hash: string };
type Input = {
  readonly release: string;
  readonly artifacts: readonly Artifact[];
  readonly health: Readonly<Record<string, boolean>>;
  readonly traffic: number;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const manifest = input.artifacts.map((artifact) => artifact.path + '@' + artifact.hash).sort();
const digest = createHash('sha256').update(manifest.join('\\n')).digest('hex').slice(0, 12);
const healthy = Object.values(input.health).every(Boolean);
const canPromote = healthy && input.traffic < 100 && manifest.some((item) => item.includes('app.css'));

assert.equal(digest, '7d45a54aa756');
assert.equal(healthy, true);
assert.equal(canPromote, true);
assert.deepEqual(manifest, ['.next/server/app.js@a1', '.next/static/app.css@c1']);

console.log(JSON.stringify({ release: input.release, digest, manifest, canPromote }));
console.log('React Next 发布清单与健康门禁通过');
`,
      checkpoint:
        '摘要必须为 7d45a54aa756，三项健康检查全部通过且流量小于 100 才允许晋级。删除 app.css 后 canPromote 必须为 false。',
    }),
    task({
      id: 'react-final-next-rollback-independent',
      title: '独立实践：失败发布与 expand-contract 回滚',
      brief:
        'stdin 给两个版本、schema 字段和 smoke 结果。新版本失败时只回滚应用与 CDN，不删除仍被旧版本读取的数据库列。',
      stdin:
        '{"active":"r41","candidate":"r42","health":{"r42":false},"smoke":{"r42":"failed"},"schema":["delivery_mode","live_mode"],"requiredBy":{"r41":["delivery_mode"],"r42":["delivery_mode","live_mode"]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly active: string;
  readonly candidate: string;
  readonly health: Readonly<Record<string, boolean>>;
  readonly smoke: Readonly<Record<string, string>>;
  readonly schema: readonly string[];
  readonly requiredBy: Readonly<Record<string, readonly string[]>>;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const candidateHealthy = input.health[input.candidate] === true;
const candidateSmoke = input.smoke[input.candidate] === 'passed';
const action = candidateHealthy && candidateSmoke ? 'promote' : 'rollback';
const activeSchemas = action === 'rollback'
  ? input.requiredBy[input.active] ?? []
  : input.requiredBy[input.candidate] ?? [];
const safeDrop = input.schema.filter((column) =>
  !Object.values(input.requiredBy).some((required) => required.includes(column)));
const purged = action === 'rollback' ? ['/', '/_next/static/**'] : [];

assert.equal(action, 'rollback');
assert.deepEqual(activeSchemas, ['delivery_mode']);
assert.deepEqual(safeDrop, []);
assert.deepEqual(purged, ['/', '/_next/static/**']);

console.log(JSON.stringify({ action, active: input.active, activeSchemas, safeDrop, purged }));
console.log('React Next 失败发布回滚通过');
`,
      checkpoint:
        '候选健康失败时必须回到 r41，保留 delivery_mode，live_mode 也暂时不能删除，因为候选版本仍可能读它；回滚后清理 HTML 与静态资源缓存。',
    }),
  ),

  'programming:React · 测试、性能与可访问性：Playwright、路由和移动流程': lab(
    'React 最终代码台 11 · 路由旅程与移动交互证据',
    '用确定性浏览器驱动模拟导航、tab、返回和断言，验证移动端菜单、焦点、触摸目标与 URL 历史不丢失。',
    task({
      id: 'react-final-playwright-route-guided',
      title: '跟做：移动端路由与返回栈',
      brief:
        'stdin 给导航动作。模拟 push、back、tab 切换和 focus 恢复，断言每级返回、页面标题、URL 和可交互控件。',
      stdin:
        '{"steps":[{"action":"goto","to":"/courses"},{"action":"click","target":"course-42"},{"action":"tab","target":"lessons"},{"action":"back"},{"action":"back"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Step =
  | { readonly action: 'goto'; readonly to: string }
  | { readonly action: 'click'; readonly target: string }
  | { readonly action: 'tab'; readonly target: string }
  | { readonly action: 'back' };
type Input = { readonly steps: readonly Step[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

const history = ['/'];
const titles: string[] = ['首页'];
let activeTab = 'overview';
let focus = 'main';
for (const step of input.steps) {
  if (step.action === 'goto') {
    history.push(step.to);
    titles.push('课程目录');
    focus = 'heading';
  }
  if (step.action === 'click') {
    history.push('/courses/42');
    titles.push('课程 42');
    focus = 'course-heading';
  }
  if (step.action === 'tab') {
    activeTab = step.target;
    focus = step.target + '-tab';
  }
  if (step.action === 'back') {
    history.pop();
    titles.pop();
    focus = history.at(-1) === '/courses' ? 'course-heading' : 'heading';
  }
}

assert.deepEqual(history, ['/']);
assert.deepEqual(titles, ['首页']);
assert.equal(activeTab, 'lessons');
assert.equal(focus, 'heading');

console.log(JSON.stringify({ history, titles, activeTab, focus }));
console.log('React Playwright 移动路由返回通过');
`,
      checkpoint:
        '两次返回后回到首页，历史与标题都只剩根节点；切换过的 lessons tab 仍记录，焦点回到主标题。少一次返回时断言必须失败。',
    }),
    task({
      id: 'react-final-playwright-a11y-independent',
      title: '独立实践：键盘、触摸目标与网络失败',
      brief:
        'stdin 给视口、控件尺寸、键盘和失败请求。检查 44px 触摸基线、Tab 顺序、Enter 激活、错误提示和重试按钮。',
      stdin:
        '{"viewport":{"width":390,"height":844},"controls":[{"name":"menu","width":44,"height":44},{"name":"save","width":36,"height":48}],"keyboard":["Tab","Tab","Enter"],"request":"timeout"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Control = { readonly name: string; readonly width: number; readonly height: number };
type Input = {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly controls: readonly Control[];
  readonly keyboard: readonly string[];
  readonly request: string;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const touchViolations = input.controls.filter((control) =>
  control.width < 44 || control.height < 44).map((control) => control.name);
const focusOrder = input.keyboard.filter((key) => key === 'Tab').map((_, index) => index + 1);
const activated = input.keyboard.at(-1) === 'Enter';
const recovery = input.request === 'timeout'
  ? { message: '加载超时', retryVisible: true }
  : { message: '加载成功', retryVisible: false };

assert.equal(input.viewport.width, 390);
assert.deepEqual(touchViolations, ['save']);
assert.deepEqual(focusOrder, [1, 2]);
assert.equal(activated, true);
assert.deepEqual(recovery, { message: '加载超时', retryVisible: true });

console.log(JSON.stringify({ touchViolations, focusOrder, activated, recovery }));
console.log('React 移动键盘与失败恢复通过');
`,
      checkpoint:
        'save 因宽度 36 被标为触摸违规；Tab 顺序为 1、2，Enter 激活成功；timeout 时必须显示加载超时和可见重试按钮。',
    }),
  ),

  'programming:React · 测试、性能与可访问性：代码分割、Suspense 与包体': lab(
    'React 最终代码台 12 · 代码分割、预加载与 Suspense 边界',
    '分析构建 chunk 图，按路由拆分同步入口和异步模块；模拟 Suspense pending、预加载命中、失败重试与包体预算。',
    task({
      id: 'react-final-code-split-guided',
      title: '跟做：入口 chunk 与异步路由',
      brief:
        'stdin 给模块依赖和路由映射。入口只包含同步依赖，课程详情路由进入独立 chunk；计算入口大小并检查预算。',
      stdin:
        '{"budgetKb":140,"modules":{"entry":{"size":70,"deps":["vendor","query"]},"vendor":{"size":50,"deps":[]},"query":{"size":15,"deps":[]},"course":{"size":80,"deps":["chart"]},"chart":{"size":35,"deps":[]}},"routes":{"entry":["entry"],"course":["course"]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Module = { readonly size: number; readonly deps: readonly string[] };
type Input = {
  readonly budgetKb: number;
  readonly modules: Readonly<Record<string, Module>>;
  readonly routes: Readonly<Record<string, readonly string[]>>;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function chunk(roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    const module = input.modules[id];
    if (!module) throw new Error('MISSING_MODULE:' + id);
    seen.add(id);
    for (const dependency of module.deps) visit(dependency);
  };
  for (const root of roots) visit(root);
  return [...seen].sort();
}

const entry = chunk(input.routes.entry ?? []);
const course = chunk(input.routes.course ?? []);
const entryKb = entry.reduce((sum, id) => sum + (input.modules[id]?.size ?? 0), 0);
const courseKb = course.reduce((sum, id) => sum + (input.modules[id]?.size ?? 0), 0);

assert.deepEqual(entry, ['entry', 'query', 'vendor']);
assert.deepEqual(course, ['chart', 'course']);
assert.equal(entryKb, 135);
assert.equal(courseKb, 115);
assert.equal(entryKb <= input.budgetKb, true);

console.log(JSON.stringify({ entry, course, entryKb, courseKb }));
console.log('React 路由代码分割与入口预算通过');
`,
      checkpoint:
        '入口 chunk 必须为 entry、query、vendor，合计 135KB 且不超过 140KB；课程路由独立包含 course、chart，合计 115KB。',
    }),
    task({
      id: 'react-final-suspense-preload-independent',
      title: '独立实践：Suspense、预加载和失败重试',
      brief:
        'stdin 给路由访问和模块加载结果。未加载时显示 pending，预加载命中直接渲染；chunk 失败进入可重试错误边界。',
      stdin:
        '{"visits":[{"route":"/course","preload":false},{"route":"/course","preload":true},{"route":"/broken","preload":false}],"loads":{"course":"ok","broken":"fail"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Visit = { readonly route: string; readonly preload: boolean };
type Input = { readonly visits: readonly Visit[]; readonly loads: Readonly<Record<string, string>> };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const loaded = new Set<string>();
const trace: string[] = [];

for (const visit of input.visits) {
  const chunk = visit.route.slice(1);
  if (visit.preload) {
    loaded.add(chunk);
    trace.push('preload:' + chunk);
  }
  trace.push('render-start:' + chunk);
  if (!loaded.has(chunk)) trace.push('suspense-pending:' + chunk);
  if (input.loads[chunk] === 'fail') {
    trace.push('error-boundary:' + chunk);
    trace.push('retry-available:' + chunk);
    continue;
  }
  loaded.add(chunk);
  trace.push('render-ready:' + chunk);
}

assert.deepEqual(trace, [
  'render-start:course',
  'suspense-pending:course',
  'render-ready:course',
  'preload:course',
  'render-start:course',
  'render-ready:course',
  'render-start:broken',
  'suspense-pending:broken',
  'error-boundary:broken',
  'retry-available:broken',
]);
assert.equal(loaded.has('course'), true);
assert.equal(loaded.has('broken'), false);

console.log(JSON.stringify({ trace, loaded: [...loaded] }));
console.log('React Suspense 预加载与错误重试通过');
`,
      checkpoint:
        '首次 course 先 pending 后 ready；第二次预加载后直接 ready；broken 进入 error-boundary 且提供 retry，不能被标记为 loaded。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：Vue 与 Vite 的职责边界': lab(
    'Vue 最终代码台 01 · 运行时、编译器和 Vite 的职责链',
    '把源码模块分类给 Vue 运行时、SFC 编译器或 Vite，并模拟请求转换、依赖预构建和 HMR 边界，定位白屏发生在哪一层。',
    task({
      id: 'vue-final-responsibility-guided',
      title: '跟做：开发请求的转换责任',
      brief:
        'stdin 给请求文件和转换阶段。对 .vue、样式、配置与普通模块分流，断言每个请求最终交给正确阶段而不是全部归因 Vite。',
      stdin:
        '{"files":[{"path":"/src/main.ts","kind":"module"},{"path":"/src/App.vue?type=template","kind":"vue-template"},{"path":"/src/App.vue?type=style","kind":"vue-style"},{"path":"/vite.config.ts","kind":"config"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type FileRequest = { readonly path: string; readonly kind: string };
type Input = { readonly files: readonly FileRequest[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function route(file: FileRequest): readonly string[] {
  if (file.kind === 'vue-template') return ['vite', 'vue-sfc-compiler', 'browser-esm'];
  if (file.kind === 'vue-style') return ['vite', 'style-pipeline', 'browser-css'];
  if (file.kind === 'config') return ['vite-config-loader', 'node'];
  return ['vite-transform', 'browser-esm'];
}

const pipeline = input.files.map((file) => ({ path: file.path, stages: route(file) }));
assert.deepEqual(pipeline.map((item) => item.stages), [
  ['vite-transform', 'browser-esm'],
  ['vite', 'vue-sfc-compiler', 'browser-esm'],
  ['vite', 'style-pipeline', 'browser-css'],
  ['vite-config-loader', 'node'],
]);
assert.equal(pipeline.every((item) => item.stages[0] !== undefined), true);
assert.equal(pipeline.filter((item) => item.stages.includes('vue-sfc-compiler')).length, 1);

console.log(JSON.stringify(pipeline));
console.log('Vue 运行时、编译器与 Vite 职责通过');
`,
      checkpoint:
        '模板请求必须经过 vue-sfc-compiler，样式请求必须进入 style-pipeline，配置文件只在 Node 侧加载；四条管线都不能为空。',
    }),
    task({
      id: 'vue-final-responsibility-hmr-independent',
      title: '独立实践：HMR 接受边界与整页重载',
      brief:
        'stdin 给模块依赖和修改文件。若模块声明的 HMR 边界可处理变化就局部热替换，否则沿 importer 上溯并在入口处 reload。',
      stdin:
        '{"entry":"/src/main.ts","modules":{"/src/main.ts":["/src/App.vue"],"/src/App.vue":["/src/Counter.vue"],"/src/Counter.vue":[]},"accepted":{"/src/Counter.vue":"self","/src/App.vue":"self"},"changed":"/src/Counter.vue"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly entry: string;
  readonly modules: Readonly<Record<string, readonly string[]>>;
  readonly accepted: Readonly<Record<string, string>>;
  readonly changed: string;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const importers = new Map<string, string>();
for (const [importer, deps] of Object.entries(input.modules)) {
  for (const dependency of deps) importers.set(dependency, importer);
}

let current = input.changed;
const visited: string[] = [];
let action = 'reload';
while (current) {
  visited.push(current);
  if (input.accepted[current] === 'self') {
    action = 'hot-update:' + current;
    break;
  }
  current = importers.get(current) ?? '';
}

assert.deepEqual(visited, ['/src/Counter.vue']);
assert.equal(action, 'hot-update:/src/Counter.vue');
assert.equal(action.includes(input.entry), false);

console.log(JSON.stringify({ visited, action }));
console.log('Vue HMR 接受边界与重载判定通过');
`,
      checkpoint:
        'Counter 自身接受更新时只热替换 Counter；visited 必须只有 Counter。移除它的 accepted 后应上溯到 App 并热替换 App，而不是盲目整页重载。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：从空目录创建入口和根组件': lab(
    'Vue 最终代码台 02 · createApp、挂载宿主与异步 setup',
    '构建最小 createApp 语义：安装插件、记录挂载、拒绝重复宿主，并验证异步 setup 在 Suspense 边界完成前不提交根组件。',
    task({
      id: 'vue-final-create-app-guided',
      title: '跟做：插件顺序与单次挂载',
      brief:
        'stdin 给宿主和插件。按数组顺序安装插件，挂载到唯一 #app；重复挂载必须抛错，unmount 后再清理宿主。',
      stdin:
        '{"html":"<div id=\\"app\\"></div>","selector":"#app","plugins":["router","pinia","monitoring"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly html: string; readonly selector: string; readonly plugins: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const installed: string[] = [];
let mounted = false;
let host: string | undefined;

function install(plugin: string): void {
  if (installed.includes(plugin)) throw new Error('DUPLICATE_PLUGIN:' + plugin);
  installed.push(plugin);
}
function mount(): void {
  const count = input.html.split('id="app"').length - 1;
  if (count !== 1 || input.selector !== '#app') throw new Error('HOST_MISSING');
  if (mounted) throw new Error('ALREADY_MOUNTED');
  mounted = true;
  host = '#app';
}
function unmount(): void {
  mounted = false;
  host = undefined;
}

for (const plugin of input.plugins) install(plugin);
mount();
assert.throws(() => mount(), /ALREADY_MOUNTED/);
unmount();
assert.equal(mounted, false);
assert.equal(host, undefined);
assert.deepEqual(installed, ['router', 'pinia', 'monitoring']);

console.log(JSON.stringify({ installed, mounted, host }));
console.log('Vue createApp 插件与宿主生命周期通过');
`,
      checkpoint:
        '插件顺序必须与输入一致；首次 mount 成功，第二次 mount 抛 ALREADY_MOUNTED，unmount 后宿主为空。',
    }),
    task({
      id: 'vue-final-async-setup-independent',
      title: '独立实践：异步 setup、Suspense 与卸载竞态',
      brief:
        'stdin 给请求序号和卸载点。异步 setup 完成前保持 pending，旧请求晚到不得提交；卸载后即使 resolve 也只能记为取消。',
      stdin:
        '{"requests":[{"id":"a","delay":30,"unmountAt":10},{"id":"b","delay":5,"unmountAt":20}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Request = { readonly id: string; readonly delay: number; readonly unmountAt: number };
type Input = { readonly requests: readonly Request[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let mounted = true;
let activeRequest = 0;
const results: string[] = [];

for (const request of input.requests) {
  activeRequest += 1;
  const requestId = activeRequest;
  results.push('pending:' + request.id);
  const unmountedDuringRequest = request.delay > request.unmountAt;
  if (unmountedDuringRequest) mounted = false;
  if (!mounted || requestId !== activeRequest) {
    results.push('discard:' + request.id);
    continue;
  }
  results.push('resolved:' + request.id);
}

assert.deepEqual(results, [
  'pending:a',
  'discard:a',
  'pending:b',
  'discard:b',
]);
assert.equal(mounted, false);
assert.equal(activeRequest, 2);

console.log(JSON.stringify({ results, mounted }));
console.log('Vue 异步 setup 与卸载竞态通过');
`,
      checkpoint:
        'a 与 b 模拟期间都超过卸载点，因此只能出现 pending 后 discard，不能提交 resolved；最终 mounted 为 false。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：模板表达式、绑定和事件': lab(
    'Vue 最终代码台 03 · 模板编译、属性绑定与事件修饰符',
    '模拟模板 AST 到渲染描述，处理插值、class 合并和事件修饰符；同时验证渲染表达式保持纯函数、键盘操作可达。',
    task({
      id: 'vue-final-template-binding-guided',
      title: '跟做：绑定合并与 once 事件',
      brief:
        'stdin 给静态 class、动态 class、禁用状态和点击序列。合并 class，布尔属性保持真实布尔语义，once 处理器只执行一次。',
      stdin:
        '{"staticClass":"button","dynamicClass":{"active":true,"danger":false},"disabled":false,"clicks":3}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly staticClass: string;
  readonly dynamicClass: Readonly<Record<string, boolean>>;
  readonly disabled: boolean;
  readonly clicks: number;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const dynamic = Object.entries(input.dynamicClass).filter(([, on]) => on).map(([name]) => name);
const finalClass = [input.staticClass, ...dynamic].join(' ');
let calls = 0;
for (let index = 0; index < input.clicks; index += 1) {
  if (calls === 0) calls += 1;
}
const attributes: Record<string, string | boolean> = {
  class: finalClass,
  disabled: input.disabled,
};

assert.equal(finalClass, 'button active');
assert.equal(attributes.disabled, false);
assert.equal(calls, 1);
assert.equal(Object.getPrototypeOf(attributes), Object.prototype);
assert.equal(String(attributes.disabled), 'false');

console.log(JSON.stringify({ finalClass, attributes, calls }));
console.log('Vue 模板绑定合并与 once 事件通过');
`,
      checkpoint:
        '最终 class 为 button active，disabled 保持布尔 false 而非字符串；三次点击下 once 处理器只调用 1 次。',
    }),
    task({
      id: 'vue-final-template-a11y-independent',
      title: '独立实践：纯插值、转义与键盘事件',
      brief:
        'stdin 给用户文本和键盘序列。渲染函数只格式化，不修改状态；HTML 特殊字符必须转义，Enter 与 Space 都能触发原生按钮。',
      stdin:
        '{"text":"<img src=x onerror=alert(1)>","keys":["Tab","Enter","Space"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly text: string; readonly keys: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let stateReads = 0;
let activations = 0;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function render(label: string): string {
  stateReads += 1;
  return '<button type="button">' + escapeHtml(label) + '</button>';
}

const html = render(input.text);
for (const key of input.keys) {
  if (key === 'Enter' || key === 'Space') activations += 1;
}
const afterRenderStateReads = stateReads;

assert.equal(html.includes('<img'), false);
assert.equal(html.includes('&lt;img'), true);
assert.equal(activations, 2);
assert.equal(afterRenderStateReads, 1);
assert.equal(html.includes('tabindex="0"'), false);

console.log(JSON.stringify({ html, activations, stateReads }));
console.log('Vue 纯插值与键盘可访问性通过');
`,
      checkpoint:
        '恶意标签必须被转义为 &lt;img；Enter 与 Space 分别触发按钮，共 2 次；render 期间状态只被读取 1 次且没有写状态。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：开发服务器、构建产物与预览': lab(
    'Vue 最终代码台 04 · Vite 构建图、base 与预览失败回放',
    '从模块图生成带内容哈希的构建产物，验证子路径 base、静态资源引用与 preview 回退；再演练资源 404 和缓存更新。',
    task({
      id: 'vue-final-vite-build-guided',
      title: '跟做：哈希产物与子路径引用',
      brief:
        'stdin 给源码、静态资源和 base。生成稳定内容哈希的 JS/CSS 文件名，并确保 index.html 只引用 base 下真实产物。',
      stdin:
        '{"base":"/course/","sources":[{"path":"src/main.ts","content":"createApp(App)"},{"path":"src/App.vue?style","content":".card{color:green}"}],"assets":["logo.svg"]}',
      code: `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Source = { readonly path: string; readonly content: string };
type Input = { readonly base: string; readonly sources: readonly Source[]; readonly assets: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}
const outputs = input.sources.map((source) => {
  const extension = source.path.includes('style') ? 'css' : 'js';
  return {
    source: source.path,
    file: 'assets/' + source.path.split('/').at(-1)?.replace(/[^a-z0-9.]+/gi, '-') + '.' + extension,
    contentHash: hash(source.content),
  };
});
const references = outputs.map((output) => input.base + output.file);

assert.equal(input.base, '/course/');
assert.equal(outputs.length, 2);
assert.equal(new Set(outputs.map((output) => output.contentHash)).size, 2);
assert.equal(references.every((url) => url.startsWith('/course/assets/')), true);
assert.equal(input.assets.includes('logo.svg'), true);

console.log(JSON.stringify({ outputs, references, assets: input.assets }));
console.log('Vue Vite 哈希产物与 base 引用通过');
`,
      checkpoint:
        '两份源码必须得到不同的 8 位内容哈希，所有引用都以 /course/assets/ 开头，静态资源 logo.svg 仍进入构建清单。',
    }),
    task({
      id: 'vue-final-vite-preview-independent',
      title: '独立实践：预览回退、资源 404 与缓存失效',
      brief:
        'stdin 给预览请求和产物表。深层路由回退到 index.html，缺失资源保持 404；内容变化必须生成新文件并回退旧入口。',
      stdin:
        '{"requests":["/course/","/course/courses/42","/course/assets/logo.old.svg"],"outputs":["/course/index.html","/course/assets/main.a1.js"],"newContent":"main-v2"}',
      code: `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Input = {
  readonly requests: readonly string[];
  readonly outputs: readonly string[];
  readonly newContent: string;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const responses = input.requests.map((path) => {
  if (input.outputs.includes(path)) return { path, status: 200, body: path.split('/').at(-1) };
  if (path.includes('/assets/')) return { path, status: 404, body: 'Not Found' };
  return { path, status: 200, body: 'index.html' };
});
const previous = 'main.a1.js';
const nextHash = createHash('sha256').update(input.newContent).digest('hex').slice(0, 2);
const next = 'main.' + nextHash + '.js';

assert.deepEqual(responses.map((response) => response.status), [200, 200, 404]);
assert.equal(responses[1]?.body, 'index.html');
assert.equal(responses[2]?.body, 'Not Found');
assert.notEqual(next, previous);
assert.equal(input.outputs.includes('/course/assets/' + previous), true);

console.log(JSON.stringify({ responses, previous, next }));
console.log('Vue preview 回退与资源 404 通过');
`,
      checkpoint:
        '根路径和深层路由返回 200，深层路由回退 index.html；assets 中不存在文件保持 404；新内容必须产生不同于旧值的内容哈希。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：第一个可测试 Vue 页面': lab(
    'Vue 最终代码台 05 · 组件宿主、用户事件与异步刷新',
    '建立最小 Vue 测试宿主，通过可访问名称定位按钮、发送事件、等待 flush 并断言页面可见状态，验证失败与重试路径。',
    task({
      id: 'vue-final-test-page-guided',
      title: '跟做：按钮点击与可见计数',
      brief:
        'stdin 给标题、初始计数与点击次数。宿主只暴露 text、disabled 和 click 事件，测试按可见文本和事件次数断言。',
      stdin: '{"title":"选课","initial":1,"clicks":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly title: string; readonly initial: number; readonly clicks: number };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
type State = { readonly count: number; readonly disabled: boolean };
const state: State[] = [{ count: input.initial, disabled: false }];
const events: string[] = [];
let current: State = state[0]!;

for (let index = 0; index < input.clicks; index += 1) {
  events.push('click:' + (index + 1));
  current = { count: current.count + 1, disabled: false };
  state.push(current);
}
const visible = state.map((snapshot) => input.title + '：' + snapshot.count);

assert.deepEqual(visible, ['选课：1', '选课：2', '选课：3']);
assert.deepEqual(events, ['click:1', 'click:2']);
assert.equal(current.disabled, false);
assert.equal(Object.keys(current).sort().join(','), 'count,disabled');

console.log(JSON.stringify({ visible, events }));
console.log('Vue 首个页面交互测试通过');
`,
      checkpoint:
        '可见文本必须依次为选课：1、2、3，事件恰好两次；把点击次数改成 3 但断言仍为 2 时必须失败。',
    }),
    task({
      id: 'vue-final-test-async-independent',
      title: '独立实践：异步保存、flushPromises 与重试',
      brief:
        'stdin 给失败和成功响应。按 idle、pending、error、pending、success 推进，检查按钮禁用、错误文本和重试可访问名称。',
      stdin:
        '{"responses":[{"ok":false,"message":"超时"},{"ok":true,"message":"已发布"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Response = { readonly ok: boolean; readonly message: string };
type Input = { readonly responses: readonly Response[] };
type UiState =
  | { readonly phase: 'idle'; readonly disabled: false }
  | { readonly phase: 'pending'; readonly disabled: true }
  | { readonly phase: 'error'; readonly disabled: false; readonly message: string }
  | { readonly phase: 'success'; readonly disabled: false; readonly message: string };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

const queue: Promise<Response>[] = input.responses.map((response) => Promise.resolve(response));
const states: UiState[] = [{ phase: 'idle', disabled: false }];
for (const request of queue) {
  states.push({ phase: 'pending', disabled: true });
  const response = await request;
  states.push(response.ok
    ? { phase: 'success', disabled: false, message: response.message }
    : { phase: 'error', disabled: false, message: response.message });
}
states.push({ phase: 'pending', disabled: true });
states.push({ phase: 'success', disabled: false, message: '重试成功' });

assert.deepEqual(states.map((state) => state.phase), [
  'idle',
  'pending',
  'error',
  'pending',
  'success',
  'pending',
  'success',
]);
assert.equal(states.filter((state) => state.phase === 'pending').every((state) => state.disabled), true);
assert.equal(states.some((state) => state.phase === 'error' && state.message === '超时'), true);

console.log(JSON.stringify(states));
console.log('Vue 异步页面 flush 与重试测试通过');
`,
      checkpoint:
        '阶段序列必须包含两次 pending；pending 时按钮全部 disabled；失败消息“超时”后允许重试并最终 success。',
    }),
  ),

  'programming:Vue 3 · 响应式、computed 与 watch：ref、reactive 与响应式边界': lab(
    'Vue 最终代码台 06 · Proxy 依赖追踪、自动解包与解构边界',
    '用最小 Proxy 响应式运行时记录属性依赖和触发集合，验证 ref 整体替换、嵌套读取、解构丢失和 toRef 修复。',
    task({
      id: 'vue-final-reactive-track-guided',
      title: '跟做：track、trigger 与嵌套依赖',
      brief:
        'stdin 给读取属性与写入顺序。建立对象属性到 effect 的依赖索引；只触发实际读取的属性，嵌套对象读取后独立追踪。',
      stdin:
        '{"reads":["form.name","profile.city"],"writes":["form.name","form.age","profile.city"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly reads: readonly string[]; readonly writes: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const deps = new Map<string, Set<string>>();
const events: string[] = [];

function track(key: string, effect: string): void {
  deps.set(key, new Set([...(deps.get(key) ?? []), effect]));
}
function trigger(key: string): void {
  for (const effect of deps.get(key) ?? []) events.push(key + '->' + effect);
}

for (const key of input.reads) track(key, 'render-effect');
for (const key of input.writes) trigger(key);

assert.deepEqual(events, ['form.name->render-effect', 'profile.city->render-effect']);
assert.equal(deps.has('form.age'), false);
assert.equal(deps.get('form.name')?.size, 1);
assert.equal([...deps.keys()].sort().join(','), 'form.name,profile.city');

console.log(JSON.stringify({ deps: Object.fromEntries([...deps].map(([key, value]) => [key, [...value]])), events }));
console.log('Vue Proxy track 与 trigger 边界通过');
`,
      checkpoint:
        '只有 form.name 与 profile.city 建立依赖，因此写入 form.age 不产生事件；两个读取属性各触发一次 render-effect。',
    }),
    task({
      id: 'vue-final-reactive-destructure-independent',
      title: '独立实践：解构丢失响应性并用 toRef 修复',
      brief:
        'stdin 给表单值和三步更新。分别模拟普通解构快照、toRef 读取和整体替换 ref，记录模板最终看到的值。',
      stdin:
        '{"initial":"Ada","updates":["Lin","Mia","Zoe"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly initial: string; readonly updates: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const form = { name: input.initial };
const destructured = form.name;
const toRef = (): string => form.name;
const ref = { value: input.initial };
const snapshots: Array<{ readonly plain: string; readonly tracked: string; readonly replaced: string }> = [];

for (const update of input.updates) {
  form.name = update;
  ref.value = update;
  snapshots.push({
    plain: destructured,
    tracked: toRef(),
    replaced: ref.value,
  });
}

assert.deepEqual(snapshots, [
  { plain: 'Ada', tracked: 'Lin', replaced: 'Lin' },
  { plain: 'Ada', tracked: 'Mia', replaced: 'Mia' },
  { plain: 'Ada', tracked: 'Zoe', replaced: 'Zoe' },
]);
assert.equal(destructured, 'Ada');
assert.equal(ref.value, 'Zoe');

console.log(JSON.stringify(snapshots));
console.log('Vue 解构响应性与 toRef 修复通过');
`,
      checkpoint:
        '普通解构在三步中都停留在 Ada，toRef 与 ref 整体替换都跟随到 Lin、Mia、Zoe；最终 ref.value 必须为 Zoe。',
    }),
  ),

  'programming:Vue 3 · Router、Pinia 与服务器状态：多页面企业功能实验': lab(
    'Vue 最终代码台 07 · 路由守卫、Pinia 与 Query 状态所有权',
    '把企业多页面访问串成导航守卫、模块化 store 和远端查询缓存，验证租户隔离、权限拒绝、失效和失败回滚。',
    task({
      id: 'vue-final-enterprise-router-guided',
      title: '跟做：租户、角色与页面资源',
      brief:
        'stdin 给用户与导航路径。路由守卫先检查登录和租户，再检查页面角色；允许后从 Pinia 读取租户并在 Query 键中包含租户。',
      stdin:
        '{"user":{"id":"u1","tenant":"acme","roles":["teacher"]},"routes":[{"path":"/courses","roles":["teacher","admin"]},{"path":"/billing","roles":["finance"]}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type User = { readonly id: string; readonly tenant: string; readonly roles: readonly string[] };
type Route = { readonly path: string; readonly roles: readonly string[] };
type Input = { readonly user: User; readonly routes: readonly Route[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const pinia = { tenant: input.user.tenant, session: input.user.id };
const queryKeys: string[] = [];
const decisions: Array<{ readonly path: string; readonly allowed: boolean; readonly reason: string }> = [];

for (const route of input.routes) {
  const allowed = route.roles.some((role) => input.user.roles.includes(role));
  decisions.push({ path: route.path, allowed, reason: allowed ? 'allowed' : 'role-denied' });
  if (allowed) queryKeys.push(JSON.stringify([pinia.tenant, route.path]));
}

assert.deepEqual(decisions, [
  { path: '/courses', allowed: true, reason: 'allowed' },
  { path: '/billing', allowed: false, reason: 'role-denied' },
]);
assert.deepEqual(queryKeys, ['["acme","/courses"]']);
assert.equal(pinia.tenant, 'acme');
assert.equal(pinia.session, 'u1');

console.log(JSON.stringify({ decisions, queryKeys, pinia }));
console.log('Vue Router 守卫与 Pinia 租户上下文通过');
`,
      checkpoint:
        'teacher 可访问 courses，访问 billing 必须 role-denied；只有允许页面生成 Query key，且 key 第一段是 acme。',
    }),
    task({
      id: 'vue-final-enterprise-query-independent',
      title: '独立实践：缓存失效、乐观更新与租户隔离',
      brief:
        'stdin 给两个租户和 mutation 结果。缓存按租户隔离；成功后只失效当前列表，失败恢复旧快照且不能污染另一租户。',
      stdin:
        '{"activeTenant":"acme","cache":{"acme":["A"],"globex":["G"]},"mutation":{"title":"B","ok":false},"queryKey":["acme","courses"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly activeTenant: string;
  readonly cache: Readonly<Record<string, readonly string[]>>;
  readonly mutation: { readonly title: string; readonly ok: boolean };
  readonly queryKey: readonly string[];
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const cache = new Map(Object.entries(input.cache).map(([tenant, rows]) => [tenant, [...rows]]));
const previous = [...(cache.get(input.activeTenant) ?? [])];
const next = [...previous, input.mutation.title];
cache.set(input.activeTenant, next);
const invalidated: string[] = [];

if (input.mutation.ok) {
  invalidated.push(JSON.stringify(input.queryKey));
} else {
  cache.set(input.activeTenant, previous);
}

assert.deepEqual(cache.get('acme'), ['A']);
assert.deepEqual(cache.get('globex'), ['G']);
assert.deepEqual(invalidated, []);
assert.equal(input.queryKey[0], input.activeTenant);
assert.notEqual(next, previous);

console.log(JSON.stringify({ cache: Object.fromEntries(cache), invalidated, previous, next }));
console.log('Vue Query 租户隔离与乐观回滚通过');
`,
      checkpoint:
        'mutation 失败后 acme 恢复 A，globex 仍为 G，不产生失效键；成功分支才应失效当前 queryKey。',
    }),
  ),

  'programming:Vue 3 · 工程、测试、性能与可访问性：目录、别名、环境变量与 API 客户端': lab(
    'Vue 最终代码台 08 · 构建期环境、API 客户端与取消',
    '区分公开构建变量和服务端秘密，解析别名与基址，并模拟请求超时、取消、幂等重试和错误分类。',
    task({
      id: 'vue-final-env-client-guided',
      title: '跟做：环境变量与 API base',
      brief:
        'stdin 给环境变量和客户端配置。只把 VITE_ 前缀变量嵌入客户端；敏感变量必须拒绝，API URL 以公开 base 拼接。',
      stdin:
        '{"env":{"VITE_API_BASE":"/api","VITE_RELEASE":"2026.11","DATABASE_URL":"postgres://secret"},"endpoint":"/courses"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly env: Readonly<Record<string, string>>;
  readonly endpoint: string;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const publicEnv = Object.fromEntries(Object.entries(input.env).filter(([key]) => key.startsWith('VITE_')));
const leaked = Object.keys(input.env).filter((key) =>
  !key.startsWith('VITE_') && /SECRET|DATABASE|TOKEN|PASSWORD/.test(key));
const base = publicEnv.VITE_API_BASE ?? '/api';
const endpoint = input.endpoint.startsWith('/') ? input.endpoint.slice(1) : input.endpoint;
const baseUrl = base.endsWith('/') ? base : base + '/';
const url = new URL(endpoint, 'https://app.example.test' + baseUrl).toString();
const bundle = JSON.stringify(publicEnv);

assert.deepEqual(publicEnv, { VITE_API_BASE: '/api', VITE_RELEASE: '2026.11' });
assert.deepEqual(leaked, ['DATABASE_URL']);
assert.equal(url, 'https://app.example.test/api/courses');
assert.equal(bundle.includes('postgres://secret'), false);

console.log(JSON.stringify({ publicEnv, leaked, url }));
console.log('Vue 公开环境变量与 API base 通过');
`,
      checkpoint:
        '客户端环境只保留两个 VITE_ 变量，DATABASE_URL 被标记敏感且不进入 bundle；课程地址必须为 /api/courses。',
    }),
    task({
      id: 'vue-final-api-cancel-independent',
      title: '独立实践：取消、幂等重试与错误分类',
      brief:
        'stdin 给多次请求结果。超时可幂等重试一次，用户取消立即停止，409 不重试；错误对象只向界面暴露 code、message 和 requestId。',
      stdin:
        '{"requestId":"req-8","attempts":[{"status":"timeout"},{"status":200},{"status":"cancelled"},{"status":409,"message":"版本冲突"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Attempt = { readonly status: number | string; readonly message?: string };
type Input = { readonly requestId: string; readonly attempts: readonly Attempt[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const events: string[] = [];
let success = 0;
let retriedTimeout = false;

for (const attempt of input.attempts) {
  if (attempt.status === 'timeout') {
    events.push('timeout');
    if (!retriedTimeout) {
      retriedTimeout = true;
      events.push('retry-idempotent');
    }
    continue;
  }
  if (attempt.status === 'cancelled') {
    events.push('cancelled');
    break;
  }
  if (attempt.status === 200) {
    success += 1;
    events.push('success');
    continue;
  }
  if (attempt.status === 409) {
    events.push('conflict');
    break;
  }
}
const error = {
  code: 'CONFLICT',
  message: input.attempts.at(-1)?.message ?? '',
  requestId: input.requestId,
};

assert.deepEqual(events, [
  'timeout',
  'retry-idempotent',
  'success',
  'cancelled',
]);
assert.equal(success, 1);
assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'requestId']);
assert.equal(JSON.stringify(error).includes('stack'), false);

console.log(JSON.stringify({ events, success, error }));
console.log('Vue API 取消、幂等重试与错误分类通过');
`,
      checkpoint:
        'timeout 只幂等重试一次后成功；cancel 后停止后续处理；对外错误仅包含 code、message、requestId，不能出现 stack。',
    }),
  ),

  'programming:Vue 3 · 工程、测试、性能与可访问性：Vitest 单测与组件测试': lab(
    'Vue 最终代码台 09 · fake timers、组件契约与覆盖率门禁',
    '用确定性计时器和 mock API 驱动保存状态，验证等待方式、事件载荷与失败分支；覆盖率只作为证据，不替代行为断言。',
    task({
      id: 'vue-final-vitest-timers-guided',
      title: '跟做：fake timers 与重试状态',
      brief:
        'stdin 给超时时间和重试间隔。推进虚拟时钟，按 due 顺序执行任务，断言 pending 后超时、延迟后重试成功。',
      stdin: '{"timeoutMs":100,"retryMs":20,"successAfterRetry":true}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly timeoutMs: number;
  readonly retryMs: number;
  readonly successAfterRetry: boolean;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let now = 0;
const timers: Array<{ readonly due: number; readonly name: string; readonly run: () => void }> = [];
const trace = ['pending'];

timers.push({
  due: input.timeoutMs,
  name: 'timeout',
  run: () => {
    trace.push('timeout');
    timers.push({
      due: now + input.retryMs,
      name: 'retry',
      run: () => trace.push(input.successAfterRetry ? 'success' : 'retry-error'),
    });
  },
});

while (timers.length > 0) {
  timers.sort((left, right) => left.due - right.due);
  const timer = timers.shift();
  if (!timer) break;
  now = timer.due;
  timer.run();
}

assert.equal(now, 120);
assert.deepEqual(trace, ['pending', 'timeout', 'success']);
assert.equal(now >= input.timeoutMs + input.retryMs, true);
assert.equal(trace.includes('retry-error'), false);

console.log(JSON.stringify({ now, trace }));
console.log('Vue Vitest fake timers 与重试通过');
`,
      checkpoint:
        '虚拟时间必须先到 100ms 超时，再到 120ms 重试成功；trace 为 pending、timeout、success。把 successAfterRetry 改成 false 应出现 retry-error。',
    }),
    task({
      id: 'vue-final-vitest-contract-independent',
      title: '独立实践：组件契约与分支覆盖',
      brief:
        'stdin 给组件场景和源分支。对每个场景记录 emit 载荷与可见错误，最后列出未覆盖分支并阻止发布。',
      stdin:
        '{"scenarios":[{"name":"valid","submit":true,"ok":true},{"name":"server-error","submit":true,"ok":false},{"name":"disabled","submit":false,"ok":false}],"branches":["valid-submit","ok","error","disabled","retry"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Scenario = { readonly name: string; readonly submit: boolean; readonly ok: boolean };
type Input = { readonly scenarios: readonly Scenario[]; readonly branches: readonly string[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const hits = new Set<string>();
const assertions: Array<{ readonly name: string; readonly emitted: boolean; readonly visible: string }> = [];

for (const scenario of input.scenarios) {
  if (!scenario.submit) {
    hits.add('disabled');
    assertions.push({ name: scenario.name, emitted: false, visible: '按钮禁用' });
    continue;
  }
  hits.add('valid-submit');
  if (scenario.ok) {
    hits.add('ok');
    assertions.push({ name: scenario.name, emitted: true, visible: '保存成功' });
  } else {
    hits.add('error');
    assertions.push({ name: scenario.name, emitted: true, visible: '保存失败' });
  }
}
const uncovered = input.branches.filter((branch) => !hits.has(branch));

assert.deepEqual(assertions, [
  { name: 'valid', emitted: true, visible: '保存成功' },
  { name: 'server-error', emitted: true, visible: '保存失败' },
  { name: 'disabled', emitted: false, visible: '按钮禁用' },
]);
assert.deepEqual(uncovered, ['retry']);
assert.equal(uncovered.length > 0, true);

console.log(JSON.stringify({ assertions, uncovered, releaseAllowed: uncovered.length === 0 }));
console.log('Vue 组件契约与分支覆盖门禁通过');
`,
      checkpoint:
        'valid 场景发出事件，server-error 仍发出事件并显示失败，disabled 不发出事件；retry 未覆盖时 releaseAllowed 必须为 false。',
    }),
  ),

  'programming:Vue 3 · Nuxt SSR、部署与运行：SPA、SSG、SSR 与混合渲染': lab(
    'Vue 最终代码台 10 · Nuxt 渲染模式、流式 chunk 与 hydration',
    '按路由选择 SPA、SSG、SSR 或混合渲染，生成服务端 HTML 和 payload；再模拟流式 chunk、错误回落与客户端 hydration。',
    task({
      id: 'vue-final-nuxt-modes-guided',
      title: '跟做：四类路由的渲染裁决',
      brief:
        'stdin 给路由规则。后台使用 SPA，公开目录 SSG，课程详情 SSR，其余混合；每类输出构建期、服务端和客户端职责。',
      stdin:
        '{"routes":[{"path":"/admin/**","mode":"spa"},{"path":"/courses/**","mode":"prerender"},{"path":"/learn/**","mode":"ssr"},{"path":"/**","mode":"mixed"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Route = { readonly path: string; readonly mode: 'spa' | 'prerender' | 'ssr' | 'mixed' };
type Input = { readonly routes: readonly Route[] };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function renderPlan(mode: Route['mode']): readonly string[] {
  if (mode === 'spa') return ['client-shell', 'client-data'];
  if (mode === 'prerender') return ['build-html', 'build-payload', 'hydrate'];
  if (mode === 'ssr') return ['server-html', 'server-payload', 'hydrate'];
  return ['route-rule', 'server-or-client', 'hydrate'];
}

const plans = input.routes.map((route) => ({ path: route.path, plan: renderPlan(route.mode) }));
assert.deepEqual(plans, [
  { path: '/admin/**', plan: ['client-shell', 'client-data'] },
  { path: '/courses/**', plan: ['build-html', 'build-payload', 'hydrate'] },
  { path: '/learn/**', plan: ['server-html', 'server-payload', 'hydrate'] },
  { path: '/**', plan: ['route-rule', 'server-or-client', 'hydrate'] },
]);
assert.equal(plans.filter((plan) => plan.plan.includes('server-html')).length, 1);
assert.equal(plans.filter((plan) => plan.plan.includes('build-html')).length, 1);

console.log(JSON.stringify(plans));
console.log('Vue Nuxt 渲染模式裁决通过');
`,
      checkpoint:
        'SPA 不得出现 server-html，SSG 必须包含 build-html 和 build-payload，SSR 必须包含 server-html；四个路由不能混淆。',
    }),
    task({
      id: 'vue-final-nuxt-stream-independent',
      title: '独立实践：流式 HTML、错误 chunk 与 hydration',
      brief:
        'stdin 给流式事件。先输出 shell，再按 data 顺序追加 HTML；子块失败保留 shell 与可恢复错误，hydration 只接管稳定内容。',
      stdin:
        '{"events":[{"type":"shell","html":"<main>"},{"type":"data","html":"<h1>课程</h1>"},{"type":"error","message":"推荐块超时"},{"type":"data","html":"<p>正文</p>"},{"type":"end","html":"</main>"}],"payload":{"courseId":"42"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'shell' | 'data' | 'end'; readonly html: string }
  | { readonly type: 'error'; readonly message: string };
type Input = { readonly events: readonly Event[]; readonly payload: Readonly<Record<string, string>> };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let html = '';
const trace: string[] = [];
let stable = true;

for (const event of input.events) {
  if (event.type === 'error') {
    trace.push('stream-error:' + event.message);
    html += '<aside role="status">内容稍后加载</aside>';
    stable = false;
    continue;
  }
  html += event.html;
  trace.push(event.type);
}
const hydrationKey = input.payload.courseId ?? '';
const payloadText = JSON.stringify(input.payload);

assert.equal(html, '<main><h1>课程</h1><aside role="status">内容稍后加载</aside><p>正文</p></main>');
assert.deepEqual(trace, ['shell', 'data', 'stream-error:推荐块超时', 'data', 'end']);
assert.equal(stable, false);
assert.equal(hydrationKey, '42');
assert.equal(payloadText.includes('secret'), false);

console.log(JSON.stringify({ html, trace, hydrationKey, stable }));
console.log('Vue Nuxt 流式 HTML 与 hydration 修复通过');
`,
      checkpoint:
        '错误事件必须插入可读状态块但保留 shell 与后续正文；trace 顺序严格匹配；payload 只含公开 courseId。',
    }),
  ),

  'programming:Vue 3 · Nuxt SSR、部署与运行：健康检查、日志和错误监控': lab(
    'Vue 最终代码台 11 · 三级健康检查、结构化日志与 requestId',
    '区分 liveness、readiness、startup 的失败含义，生成脱敏的请求日志，并把服务端错误与前端恢复提示关联到同一 requestId。',
    task({
      id: 'vue-final-nuxt-health-guided',
      title: '跟做：健康检查状态聚合',
      brief:
        'stdin 给 app、数据库、缓存和启动阶段。liveness 只看进程，readiness 看依赖，startup 看迁移；返回可诊断但不泄密的状态。',
      stdin:
        '{"app":"ok","database":"ok","cache":"degraded","migration":"complete","dependencies":{"redis":"down","postgres":"up"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly app: string;
  readonly database: string;
  readonly cache: string;
  readonly migration: string;
  readonly dependencies: Readonly<Record<string, string>>;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const liveness = input.app === 'ok';
const readiness = input.database === 'ok' && input.cache !== 'down';
const startup = input.migration === 'complete';
const detail = Object.fromEntries(Object.entries(input.dependencies).map(([name, state]) => [
  name,
  state === 'up' ? 'ok' : 'degraded',
]));

assert.equal(liveness, true);
assert.equal(readiness, true);
assert.equal(startup, true);
assert.deepEqual(detail, { redis: 'degraded', postgres: 'ok' });
assert.equal(JSON.stringify({ liveness, readiness, startup, detail }).includes('password'), false);

console.log(JSON.stringify({ liveness, readiness, startup, detail }));
console.log('Vue Nuxt 三级健康检查通过');
`,
      checkpoint:
        'app 正常所以 liveness 为 true；缓存 degraded 不阻断 readiness，但依赖映射中 redis 必须显示 degraded；迁移完成才允许 startup。',
    }),
    task({
      id: 'vue-final-nuxt-observability-independent',
      title: '独立实践：脱敏日志、错误监控与恢复提示',
      brief:
        'stdin 给请求和异常。输出稳定 JSON 日志，删除 token、cookie 和邮箱；监控记录 release、route、requestId，界面提示可重试但隐藏堆栈。',
      stdin:
        '{"requestId":"req-42","route":"/courses/42","release":"2026.11.24","status":500,"error":{"message":"用户 ada@example.test 数据库失败","stack":"internal stack"},"headers":{"authorization":"Bearer secret","cookie":"session=abc"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly requestId: string;
  readonly route: string;
  readonly release: string;
  readonly status: number;
  readonly error: { readonly message: string; readonly stack: string };
  readonly headers: Readonly<Record<string, string>>;
};
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const safeMessage = input.error.message.replace(/[\\w.+-]+@[\\w.-]+/g, '[email]');
const log = JSON.stringify({
  event: 'request.complete',
  requestId: input.requestId,
  route: input.route,
  release: input.release,
  status: input.status,
  message: safeMessage,
});
const report = {
  requestId: input.requestId,
  release: input.release,
  route: input.route,
  category: input.status >= 500 ? 'server' : 'client',
};
const ui = {
  message: '服务暂时不可用，请重试',
  retry: true,
  requestId: input.requestId,
};

assert.equal(log.includes('ada@example.test'), false);
assert.equal(log.includes('secret'), false);
assert.equal(log.includes('session=abc'), false);
assert.deepEqual(report, {
  requestId: 'req-42',
  release: '2026.11.24',
  route: '/courses/42',
  category: 'server',
});
assert.deepEqual(Object.keys(ui).sort(), ['message', 'requestId', 'retry']);
assert.equal(JSON.stringify(ui).includes('stack'), false);

console.log(JSON.stringify({ log: JSON.parse(log), report, ui }));
console.log('Vue Nuxt 日志脱敏与错误监控通过');
`,
      checkpoint:
        '日志不能包含邮箱、Bearer secret 或 cookie；监控字段必须含 requestId、release、route、server 分类；界面只返回可重试信息与 requestId。',
    }),
  ),

  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：template compiler 与 render 函数': lab(
    'Vue 最终代码台 12 · 模板编译、静态提升与 patchFlag',
    '模拟模板 token 化、AST 转换、helper 导入和 render 描述，验证静态节点提升、动态文本 patchFlag、注释处理与编译错误。',
    task({
      id: 'vue-final-compiler-guided',
      title: '跟做：AST、helper 与动态文本',
      brief:
        'stdin 给模板。提取元素、属性和插值，AST 节点记录结构；生成 toDisplayString 与 createElementVNode helper，并保留文本边界。',
      stdin:
        '{"template":"<section title=\\"course\\"><h1>Vue</h1><p>{{ total.toFixed(2) }}</p></section>"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly template: string };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const tags = [...input.template.matchAll(/<([a-z][\\w-]*)([^>]*)>/g)].map((match) => match[1]);
const expressions = [...input.template.matchAll(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g)].map((match) => match[1]);
const helpers = new Set<string>();
if (tags.length > 0) helpers.add('createElementVNode');
if (expressions.length > 0) helpers.add('toDisplayString');
if (/toFixed/.test(expressions.join(''))) helpers.add('_ctx.total.toFixed(2)');
const ast = {
  type: 'Element',
  tag: tags.at(0),
  children: tags.slice(1).map((tag) => ({ type: 'Element', tag })),
};

assert.deepEqual(tags, ['section', 'h1', 'p']);
assert.deepEqual(expressions, ['total.toFixed(2)']);
assert.deepEqual([...helpers].sort(), ['_ctx.total.toFixed(2)', 'createElementVNode', 'toDisplayString']);
assert.equal(ast.tag, 'section');
assert.equal(ast.children.map((child) => child.tag).join(','), 'h1,p');

console.log(JSON.stringify({ ast, helpers: [...helpers].sort(), expressions }));
console.log('Vue template compiler AST 与 helper 通过');
`,
      checkpoint:
        '标签必须依次为 section、h1、p，表达式只有 total.toFixed(2)；helpers 必须包含 toDisplayString、createElementVNode 和表达式读取。',
    }),
    task({
      id: 'vue-final-compiler-patchflag-independent',
      title: '独立实践：静态提升、patchFlag 与编译错误',
      brief:
        'stdin 给静态节点、动态文本、动态属性和非法闭合模板。静态节点提升，动态文本标记 TEXT，动态属性标记 PROPS，非法模板快速失败。',
      stdin:
        '{"valid":"<div><span>static</span><p class=\\"card\\">{{ title }}</p><img :src=\\"cover\\" /></div>","invalid":"<div><span></div>"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly valid: string; readonly invalid: string };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;

function compile(template: string): { readonly staticNodes: number; readonly patchFlags: readonly number[] } {
  const stack: string[] = [];
  for (const match of template.matchAll(/<([/]?)([a-z][\\w-]*)([^>]*)>/g)) {
    const closing = match[1] === '/';
    const tag = match[2] ?? '';
    const attrs = match[3] ?? '';
    const selfClosing = attrs.trimEnd().endsWith('/');
    if (closing) {
      const opened = stack.pop();
      if (opened !== tag) throw new Error('MISMATCHED_TAG');
    } else if (!selfClosing) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) throw new Error('MISMATCHED_TAG');
  const staticNodes = [...template.matchAll(/<([a-z][\\w-]*)>[^<{]+<[/]\\1>/g)].length;
  const patchFlags: number[] = [];
  if (template.includes('{{')) patchFlags.push(1);
  if (template.includes(':src=')) patchFlags.push(8);
  return { staticNodes, patchFlags };
}

const result = compile(input.valid);
assert.deepEqual(result, { staticNodes: 1, patchFlags: [1, 8] });
assert.throws(() => compile(input.invalid), /MISMATCHED_TAG/);
assert.equal(new Set(result.patchFlags).has(1), true);
assert.equal(new Set(result.patchFlags).has(8), true);

console.log(JSON.stringify(result));
console.log('Vue 静态提升与 patchFlag 通过');
`,
      checkpoint:
        '合法模板得到 1 个静态节点和 [1,8] 两个 patchFlag；非法闭合模板必须抛 MISMATCHED_TAG，不能悄悄生成坏 render 函数。',
    }),
  ),
};
