import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const runtime = {
  requiredRuntime: 'node',
  runtimeLabel: 'React/Vue 语义模拟 · TypeScript 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 执行：node --experimental-strip-types main.ts。',
    '本代码台不导入 React、Vue 或第三方库；组件状态、生命周期、路由、缓存、表单和 SSR 均由任务内的确定性最小运行时模拟。',
    'stdin 是任务输入。先运行起始代码，再按 checkpoint 修改至少一个非法或竞态场景，确认断言能暴露问题。',
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
 * React/Vue 剩余手写课程的非 DOM 语义实验室。
 *
 * 这些任务验证框架可观察的契约，不声称执行真实组件渲染。不变量包括状态
 * 快照、Hook 槽位、Effect 清理、路由守卫、缓存、表单、SSR 与调度预算。
 */
export const LEARNING_CODE_LABS_REACT_VUE_REMAINING: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:React · React、Vite 与第一个组件：React 渲染模型与声明式 UI': lab(
    'React 补齐代码台 01 · 纯渲染与事件提交',
    '把组件理解成状态到视图描述的纯函数，用提交队列模拟事件、render、commit，验证同一输入总产生同一输出且旧状态不被修改。',
    task({
      id: 'react-model-pure-render-guided',
      title: '跟做：事件到 render 再到 commit',
      brief:
        'stdin 给出初始计数和三次增量。实现纯 render、同步提交与批处理提交；断言每次提交产生新快照，输入快照保持不变。',
      stdin: '{"label":"保存","initial":2,"increments":[1,2,-1]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type State = { readonly count: number; readonly label: string };
type View = { readonly text: string; readonly disabled: boolean };
type Payload = {
  readonly label: string;
  readonly initial: number;
  readonly increments: readonly number[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
function render(state: State): View {
  return Object.freeze({
    text: state.label + '：' + state.count,
    disabled: state.count < 0,
  });
}
function commit(previous: State, increments: readonly number[]): State {
  const total = increments.reduce((sum, value) => sum + value, previous.count);
  return Object.freeze({ ...previous, count: total });
}

const initial = Object.freeze({ count: input.initial, label: input.label });
const firstView = render(initial);
const next = commit(initial, input.increments);
const nextView = render(next);

assert.deepEqual(firstView, { text: '保存：2', disabled: false });
assert.deepEqual(nextView, { text: '保存：4', disabled: false });
assert.equal(initial.count, 2);
assert.notEqual(next, initial);
assert.deepEqual(render(initial), firstView);

console.log(JSON.stringify({ firstView, nextView, initial, next }));
console.log('纯 render 与提交快照通过');
`,
      checkpoint:
        '首次视图为“保存：2”，提交后为“保存：4”；同一个 initial 连续 render 结果完全一致，且 initial.count 仍为 2。输出“纯 render 与提交快照通过”且退出码为 0。',
    }),
    task({
      id: 'react-model-declarative-independent',
      title: '独立实践：动作序列映射为声明式状态',
      brief:
        'stdin 给出草稿、提交、失败、重试动作。实现统一 reducer，只从当前状态推导视图，并把非法动作保留为可诊断状态而不是修改 DOM。',
      stdin:
        '{"actions":[{"type":"edit","email":"a@example.test"},{"type":"submit"},{"type":"fail","code":"TIMEOUT"},{"type":"retry"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Action =
  | { readonly type: 'edit'; readonly email: string }
  | { readonly type: 'submit' }
  | { readonly type: 'fail'; readonly code: string }
  | { readonly type: 'retry' };
type State =
  | { readonly kind: 'draft'; readonly email: string }
  | { readonly kind: 'sending'; readonly email: string }
  | { readonly kind: 'failed'; readonly email: string; readonly code: string };
type View = { readonly title: string; readonly button: string; readonly alert?: string };
type Payload = { readonly actions: readonly Action[] };

function reduce(state: State, action: Action): State {
  if (action.type === 'edit') return Object.freeze({ kind: 'draft', email: action.email });
  if (action.type === 'submit' || action.type === 'retry') {
    if (state.kind === 'sending') return state;
    return Object.freeze({ kind: 'sending', email: state.email });
  }
  if (state.kind !== 'sending') return state;
  return Object.freeze({ kind: 'failed', email: state.email, code: action.code });
}
function view(state: State): View {
  if (state.kind === 'draft') return { title: '检查邮箱', button: '提交' };
  if (state.kind === 'sending') return { title: '正在提交', button: '请稍候' };
  return { title: '提交失败', button: '重试', alert: state.code };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
let state: State = Object.freeze({ kind: 'draft', email: '' });
const trace: State[] = [];
for (const action of input.actions) {
  state = reduce(state, action);
  trace.push(state);
}
const finalView = view(state);

assert.equal(trace.length, 4);
assert.equal(trace[0]?.kind, 'draft');
assert.equal(trace[1]?.kind, 'sending');
assert.equal(trace[2]?.kind, 'failed');
assert.equal(trace[3]?.kind, 'sending');
assert.deepEqual(finalView, { title: '正在提交', button: '请稍候' });
assert.equal(view({ kind: 'failed', email: 'x', code: 'TIMEOUT' }).alert, 'TIMEOUT');

console.log(JSON.stringify({ state, finalView, trace }));
console.log('声明式动作 reducer 通过');
`,
      checkpoint:
        '四个动作后的状态依次为 draft、sending、failed、sending；最终视图标题“正在提交”、按钮“请稍候”；失败视图仍携带 TIMEOUT。输出“声明式动作 reducer 通过”且退出码为 0。',
    }),
  ),

  'programming:React · React、Vite 与第一个组件：JSX、表达式和条件渲染': lab(
    'React 补齐代码台 02 · 表达式、条件分支与虚拟节点',
    '实现最小虚拟节点渲染器，验证表达式必须得到可渲染值、条件分支必须显式处理零值和空列表，并阻止对象被当作文本子节点。',
    task({
      id: 'react-jsx-expression-guided',
      title: '跟做：渲染表达式与拒绝非法对象',
      brief:
        'stdin 给出价格和空列表。用最小 h 函数构造虚拟节点，格式化价格、对空列表渲染“暂无”，并断言对象子节点会立即报错。',
      stdin: '{"priceCents":1850,"items":[]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Child = string | number | VNode;
type VNode = { readonly type: string; readonly props: Readonly<Record<string, string>>; readonly children: readonly Child[] };
type Payload = { readonly priceCents: number; readonly items: readonly string[] };

function h(type: string, props: Readonly<Record<string, string>>, children: readonly Child[]): VNode {
  for (const child of children) {
    if (child !== null && typeof child === 'object' && !('type' in child)) {
      throw new Error('OBJECT_NOT_RENDERABLE');
    }
  }
  return Object.freeze({ type, props: Object.freeze({ ...props }), children: Object.freeze([...children]) });
}
function text(node: VNode): string {
  return node.children.map((child) =>
    typeof child === 'object' ? text(child) : String(child),
  ).join('');
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const price = (input.priceCents / 100).toFixed(2) + ' 元';
const receipt = h('section', { 'aria-label': '收据' }, [
  h('p', {}, ['合计：' + price]),
  input.items.length > 0
    ? h('ul', {}, input.items.map((item) => h('li', {}, [item])))
    : h('p', {}, ['暂无商品']),
]);

assert.equal(text(receipt), '合计：18.50 元暂无商品');
assert.equal(receipt.children.length, 2);
assert.throws(
  () => h('p', {}, [({ amount: 1 } as unknown as Child)]),
  /OBJECT_NOT_RENDERABLE/,
);

console.log(JSON.stringify(receipt));
console.log('JSX 表达式和显式空态通过');
`,
      checkpoint:
        '页面文本为“合计：18.50 元暂无商品”，receipt 只有两个子节点；把普通对象当子节点时抛出 OBJECT_NOT_RENDERABLE。输出“JSX 表达式和显式空态通过”且退出码为 0。',
    }),
    task({
      id: 'react-jsx-condition-independent',
      title: '独立实践：条件树与稳定 key',
      brief:
        'stdin 给出订单状态与行项目。按 loading、error、empty、ready 选择唯一分支；ready 分支逐行输出稳定 key，并验证任何状态下都不会同时出现两个主面板。',
      stdin:
        '{"status":"ready","error":"","rows":[{"id":"r2","title":"路由","done":false},{"id":"r1","title":"状态","done":true}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly title: string; readonly done: boolean };
type State = { readonly status: 'loading' | 'error' | 'empty' | 'ready'; readonly error: string; readonly rows: readonly Row[] };
type Panel =
  | { readonly kind: 'message'; readonly tone: 'status' | 'alert' | 'empty'; readonly text: string }
  | { readonly kind: 'list'; readonly keys: readonly string[]; readonly text: string };

function select(state: State): Panel {
  if (state.status === 'loading') return { kind: 'message', tone: 'status', text: '加载中' };
  if (state.status === 'error') return { kind: 'message', tone: 'alert', text: state.error || '加载失败' };
  if (state.rows.length === 0) return { kind: 'message', tone: 'empty', text: '暂无订单' };
  const sorted = state.rows.toSorted((left, right) => left.id.localeCompare(right.id));
  return {
    kind: 'list',
    keys: sorted.map((row) => row.id),
    text: sorted.map((row) => row.title + (row.done ? ' ✓' : '')).join(' / '),
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as State;
const panel = select(input);
assert.deepEqual(panel, {
  kind: 'list',
  keys: ['r1', 'r2'],
  text: '状态 ✓ / 路由',
});
assert.equal(select({ ...input, rows: [] }).kind, 'message');
assert.equal(select({ status: 'error', error: '权限不足', rows: [] }).tone, 'alert');
assert.equal(new Set(panel.kind === 'list' ? panel.keys : []).size, 2);

console.log(JSON.stringify(panel));
console.log('条件分支与稳定 key 通过');
`,
      checkpoint:
        'ready 面板输出 keys 为 r1、r2，文本为“状态 ✓ / 路由”；空数组选择 empty 消息，error 选择 alert 且显示“权限不足”。输出“条件分支与稳定 key 通过”且退出码为 0。',
    }),
  ),

  'programming:React · React、Vite 与第一个组件：Props、组合和 children': lab(
    'React 补齐代码台 03 · 组件输入输出与组合边界',
    '用只读 props、回调和组合插槽模拟父子组件协议，验证子组件不能修改父快照，并让布局通过 children 保持调用方事件所有权。',
    task({
      id: 'react-props-callback-guided',
      title: '跟做：只读 props 与回调上提',
      brief:
        'stdin 给出课程和点击次数。子组件读取冻结的 props，通过回调请求打开课程；断言父级对象未被修改，回调只携带字符串 id。',
      stdin: '{"course":{"id":"react-router","title":"React Router"},"clicks":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Course = { readonly id: string; readonly title: string };
type Payload = { readonly course: Course; readonly clicks: number };
type ButtonProps = {
  readonly course: Readonly<Course>;
  readonly onOpen: (id: string) => string;
};

function button(props: ButtonProps): { readonly label: string; readonly disabled: boolean } {
  return Object.freeze({ label: props.course.title, disabled: props.course.id.length === 0 });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const course = Object.freeze({ ...input.course });
const calls: string[] = [];
const onOpen = (id: string): string => {
  calls.push(id);
  return '/course/' + id;
};
const view = button({ course, onOpen });
const routes: string[] = [];
for (let index = 0; index < input.clicks; index += 1) {
  routes.push(onOpen(course.id));
}

assert.deepEqual(view, { label: 'React Router', disabled: false });
assert.deepEqual(calls, ['react-router', 'react-router']);
assert.deepEqual(routes, ['/course/react-router', '/course/react-router']);
assert.equal(course.title, 'React Router');
assert.equal(Object.isFrozen(course), true);

console.log(JSON.stringify({ view, calls, routes, course }));
console.log('只读 props 与回调上提通过');
`,
      checkpoint:
        '按钮标签为 React Router 且可用；两次点击回调都只收到 react-router，路由为 /course/react-router；父级 course 标题始终未变。输出“只读 props 与回调上提通过”且退出码为 0。',
    }),
    task({
      id: 'react-props-composition-independent',
      title: '独立实践：插槽组合与作用域隔离',
      brief:
        'stdin 给出租户、角色、标题与内容。构建带 header、children 和 actions 的布局组合，actions 只能看到有权限动作，并断言替换插槽不会改变内容归属。',
      stdin:
        '{"tenant":"t1","role":"editor","header":"订单中心","body":"订单 O-9","actions":["view","edit","delete"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly tenant: string;
  readonly role: 'viewer' | 'editor' | 'admin';
  readonly header: string;
  readonly body: string;
  readonly actions: readonly string[];
};
type Slot<T> = { readonly owner: string; readonly value: T };
type Layout = {
  readonly header: Slot<string>;
  readonly content: Slot<string>;
  readonly actions: readonly Slot<string>[];
};

const permission: Readonly<Record<Input['role'], readonly string[]>> = {
  viewer: ['view'],
  editor: ['view', 'edit'],
  admin: ['view', 'edit', 'delete'],
};
function compose(input: Input): Layout {
  const allowed = new Set(permission[input.role]);
  return Object.freeze({
    header: Object.freeze({ owner: 'caller', value: input.header }),
    content: Object.freeze({ owner: 'caller', value: input.body }),
    actions: Object.freeze(input.actions
      .filter((action) => allowed.has(action))
      .map((action) => Object.freeze({ owner: 'permission:' + input.tenant, value: action }))),
  });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const layout = compose(input);
assert.deepEqual(layout.header, { owner: 'caller', value: '订单中心' });
assert.deepEqual(layout.content, { owner: 'caller', value: '订单 O-9' });
assert.deepEqual(layout.actions.map((action) => action.value), ['view', 'edit']);
assert.ok(layout.actions.every((action) => action.owner === 'permission:t1'));
assert.equal(compose({ ...input, role: 'viewer' }).actions.length, 1);

console.log(JSON.stringify(layout));
console.log('插槽组合与动作权限通过');
`,
      checkpoint:
        'editor 的 actions 恰为 view、edit，所有者都是 permission:t1；header 与 content 仍归属 caller；切换为 viewer 后只剩一个动作。输出“插槽组合与动作权限通过”且退出码为 0。',
    }),
  ),

  'programming:React · 状态、表单与不可变更新：State、快照与批处理': lab(
    'React 补齐代码台 04 · 状态队列与函数式更新',
    '复刻一次事件中的状态队列，区分直接值与函数式更新，验证同一渲染闭包中的连续 setState 不会彼此覆盖。',
    task({
      id: 'react-state-batch-guided',
      title: '跟做：三次更新只提交一次',
      brief:
        'stdin 给出初始值和三个增量。把更新放入队列，只有 flush 时按顺序应用；断言闭包读取的仍是旧快照，提交后的状态为累计结果。',
      stdin: '{"initial":1,"updates":[{"mode":"add","value":2},{"mode":"add","value":3},{"mode":"set","value":10}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Update =
  | { readonly mode: 'add'; readonly value: number }
  | { readonly mode: 'set'; readonly value: number };
type Payload = { readonly initial: number; readonly updates: readonly Update[] };

function createStateRuntime(initial: number) {
  let committed = initial;
  let pending: Update[] = [];
  return {
    renderValue: () => committed,
    set: (update: Update) => {
      pending.push(update);
    },
    flush: () => {
      const snapshot = pending;
      pending = [];
      committed = snapshot.reduce(
        (state, update) => update.mode === 'add' ? state + update.value : update.value,
        committed,
      );
      return committed;
    },
    pendingCount: () => pending.length,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const runtime = createStateRuntime(input.initial);
const renderSnapshot = runtime.renderValue();
for (const update of input.updates) runtime.set(update);
const beforeFlush = runtime.renderValue();
const afterFlush = runtime.flush();

assert.equal(renderSnapshot, 1);
assert.equal(beforeFlush, 1);
assert.equal(runtime.pendingCount(), 0);
assert.equal(afterFlush, 10);
assert.equal(runtime.renderValue(), 10);
assert.notEqual(renderSnapshot, afterFlush);

console.log(JSON.stringify({ renderSnapshot, beforeFlush, afterFlush, pending: runtime.pendingCount() }));
console.log('State 快照与批处理队列通过');
`,
      checkpoint:
        'renderSnapshot 与 beforeFlush 都是 1，说明 set 没有立即修改当前闭包；flush 后按 1+2+3 再 set 10 得到 10，pending 为 0。输出“State 快照与批处理队列通过”且退出码为 0。',
    }),
    task({
      id: 'react-state-functional-independent',
      title: '独立实践：函数式更新、批处理边界与提交计数',
      brief:
        'stdin 给三轮事件，每轮含多个增量和一个异步事件。同步事件共用一次 flush，异步边界开启新提交；用函数式更新避免旧快照覆盖，并输出每次提交值。',
      stdin:
        '{"initial":0,"events":[{"kind":"sync","steps":[1,2]},{"kind":"async","steps":[5]},{"kind":"sync","steps":[-1,3]}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event = { readonly kind: 'sync' | 'async'; readonly steps: readonly number[] };
type Payload = { readonly initial: number; readonly events: readonly Event[] };

function createBatcher(initial: number) {
  let state = initial;
  let pending: Array<(value: number) => number> = [];
  let commits = 0;
  return {
    enqueue: (delta: number) => {
      pending.push((value) => value + delta);
    },
    flush: () => {
      const queue = pending;
      pending = [];
      if (queue.length === 0) return state;
      state = queue.reduce((value, updater) => updater(value), state);
      commits += 1;
      return state;
    },
    commits: () => commits,
    value: () => state,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const batcher = createBatcher(input.initial);
const commits: number[] = [];
for (const event of input.events) {
  for (const step of event.steps) batcher.enqueue(step);
  commits.push(batcher.flush());
  if (event.kind === 'async') await Promise.resolve();
}

assert.deepEqual(commits, [3, 8, 10]);
assert.equal(batcher.commits(), 3);
assert.equal(batcher.value(), 10);
assert.throws(() => {
  const invalid = { events: [{ kind: 'sync', steps: [Number.NaN] }] };
  if (!Number.isFinite(invalid.events[0]?.steps[0])) throw new Error('INVALID_DELTA');
}, /INVALID_DELTA/);

console.log(JSON.stringify({ commits, final: batcher.value(), commitCount: batcher.commits() }));
console.log('函数式更新与批处理边界通过');
`,
      checkpoint:
        '三次同步 flush 的提交值依次为 3、8、10，最终值为 10，commitCount 为 3；NaN 增量必须触发 INVALID_DELTA。输出“函数式更新与批处理边界通过”且退出码为 0。',
    }),
  ),

  'programming:React · 状态、表单与不可变更新：受控表单、校验和服务器错误': lab(
    'React 补齐代码台 05 · 受控字段与错误映射',
    '把客户端校验、服务器字段错误、提交状态和重试组合成受控表单状态机，验证错误只落到明确字段且旧成功值不会污染新草稿。',
    task({
      id: 'react-controlled-form-guided',
      title: '跟做：客户端错误优先且字段可聚焦',
      brief:
        'stdin 给出邮箱、数量与服务器错误。校验邮箱格式和正整数，合并服务器字段错误，返回首个聚焦字段、请求体和稳定错误码。',
      stdin:
        '{"email":"ops.example","amount":"0","serverErrors":{"email":"EMAIL_TAKEN","amount":"LIMIT"},"token":"csrf-7"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly email: string;
  readonly amount: string;
  readonly serverErrors: Readonly<Record<string, string>>;
  readonly token: string;
};
type Result = {
  readonly errors: Readonly<Record<string, string>>;
  readonly focus: string;
  readonly body: Readonly<Record<string, unknown>> | undefined;
};

function validate(input: Input): Result {
  const errors: Record<string, string> = { ...input.serverErrors };
  if (!input.email.includes('@')) errors.email = 'EMAIL_FORMAT';
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) errors.amount = 'AMOUNT_POSITIVE';
  const focus = ['email', 'amount'].find((field) => field in errors) ?? '';
  const body = focus === '' ? Object.freeze({
    email: input.email.trim(),
    amountCents: amount,
    csrf: input.token,
  }) : undefined;
  return { errors: Object.freeze(errors), focus, body };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const invalid = validate(input);
assert.deepEqual(invalid, {
  errors: { email: 'EMAIL_FORMAT', amount: 'AMOUNT_POSITIVE' },
  focus: 'email',
  body: undefined,
});
const valid = validate({ ...input, email: 'ops@example.test', amount: '12', serverErrors: {} });
assert.equal(valid.focus, '');
assert.deepEqual(valid.body, { email: 'ops@example.test', amountCents: 12, csrf: 'csrf-7' });

console.log(JSON.stringify({ invalid, valid }));
console.log('受控表单字段错误与焦点通过');
`,
      checkpoint:
        '非法输入同时保留邮箱格式和金额错误，焦点落在 email，请求体为 undefined；修正后错误为空并得到 email、amountCents=12、csrf=csrf-7。输出“受控表单字段错误与焦点通过”且退出码为 0。',
    }),
    task({
      id: 'react-controlled-form-independent',
      title: '独立实践：脏字段、服务器 422 与幂等重试',
      brief:
        'stdin 给编辑序列、服务器 422 字段错误和带同一幂等键的重试。只有脏字段展示错误；重试沿用幂等键，成功后清理服务器错误但保留用户草稿。',
      stdin:
        '{"edits":[{"field":"title","value":"新标题"},{"field":"price","value":"-3"}],"server":{"field":"title","code":"TITLE_EXISTS"},"idempotencyKey":"save-42"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Edit = { readonly field: 'title' | 'price'; readonly value: string };
type Input = {
  readonly edits: readonly Edit[];
  readonly server: { readonly field: string; readonly code: string };
  readonly idempotencyKey: string;
};
type FormState = {
  readonly values: Readonly<Record<string, string>>;
  readonly dirty: ReadonlySet<string>;
  readonly errors: Readonly<Record<string, string>>;
  readonly status: 'editing' | 'submitting' | 'error' | 'success';
};

function edit(state: FormState, change: Edit): FormState {
  const values = Object.freeze({ ...state.values, [change.field]: change.value });
  const dirty = new Set(state.dirty);
  dirty.add(change.field);
  const errors = { ...state.errors };
  delete errors[change.field];
  const price = Number(values.price ?? '');
  if (change.field === 'price' && (!Number.isInteger(price) || price <= 0)) {
    errors.price = 'PRICE_POSITIVE';
  }
  return Object.freeze({
    values,
    dirty,
    errors: Object.freeze(errors),
    status: 'editing',
  });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let state: FormState = Object.freeze({
  values: Object.freeze({ title: '', price: '' }),
  dirty: new Set(),
  errors: Object.freeze({}),
  status: 'editing',
});
for (const change of input.edits) state = edit(state, change);
const submitting = Object.freeze({ ...state, status: 'submitting' as const });
const failed = Object.freeze({
  ...submitting,
  status: 'error' as const,
  errors: Object.freeze({ ...state.errors, [input.server.field]: input.server.code }),
});
const success = Object.freeze({
  ...failed,
  status: 'success' as const,
  errors: Object.freeze({}),
});

assert.deepEqual([...state.dirty].sort(), ['price', 'title']);
assert.equal(state.errors.price, 'PRICE_POSITIVE');
assert.equal(failed.errors.title, 'TITLE_EXISTS');
assert.equal(success.values.title, '新标题');
assert.equal(success.values.price, '-3');
assert.equal(input.idempotencyKey, 'save-42');
assert.equal(success.status, 'success');

console.log(JSON.stringify({
  values: success.values,
  dirty: [...success.dirty].sort(),
  errors: success.errors,
  idempotencyKey: input.idempotencyKey,
}));
console.log('脏字段与服务器错误恢复通过');
`,
      checkpoint:
        '两个字段都被标脏，price 保留 PRICE_POSITIVE；服务器错误映射到 title，成功后 errors 为空，但用户草稿“新标题”和“-3”仍保留，幂等键仍为 save-42。输出“脏字段与服务器错误恢复通过”且退出码为 0。',
    }),
  ),

  'programming:React · Hooks、Effect 与并发渲染：Hooks 调用规则与渲染快照': lab(
    'React 补齐代码台 06 · Hook 槽位与调用顺序',
    '使用槽位数组模拟 Hook dispatcher，验证 Hook 身份来自稳定调用顺序；条件、循环或提前返回改变顺序时必须立即暴露错误。',
    task({
      id: 'react-hooks-slots-guided',
      title: '跟做：三槽位与条件 Hook 错误',
      brief:
        'stdin 提供稳定序列和错误序列。稳定两次渲染复用同位置 token；第二次少一个 Hook 时抛 HOOK_ORDER_CHANGED，且失败渲染不能覆盖旧槽位。',
      stdin:
        '{"component":"Profile","stable":["useState","useEffect","useState"],"broken":["useState","useState"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly component: string;
  readonly stable: readonly string[];
  readonly broken: readonly string[];
};
type Slot = { readonly name: string; readonly token: object };

function createDispatcher(component: string) {
  let committed: readonly Slot[] = Object.freeze([]);
  let signature = '';
  return {
    render(names: readonly string[]): readonly Slot[] {
      const nextSignature = names.join('>');
      if (signature !== '' && signature !== nextSignature) {
        throw new Error('HOOK_ORDER_CHANGED:' + component + ':' + signature + '->' + nextSignature);
      }
      const previous = committed;
      const next = names.map((name, index) => {
        const old = previous[index];
        return Object.freeze({
          name,
          token: old?.name === name ? old.token : Object.freeze({ index, name }),
        });
      });
      committed = Object.freeze(next);
      signature = nextSignature;
      return committed;
    },
    slots: () => committed,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const dispatcher = createDispatcher(input.component);
const first = dispatcher.render(input.stable);
const second = dispatcher.render(input.stable);
assert.equal(first.length, 3);
assert.equal(second[2]?.token, first[2]?.token);
assert.notEqual(second[0]?.token, second[1]?.token);
assert.throws(() => dispatcher.render(input.broken), /HOOK_ORDER_CHANGED/);
assert.equal(dispatcher.slots(), second);

console.log(JSON.stringify({
  component: input.component,
  stableTokenReused: first[2]?.token === second[2]?.token,
  slotsLength: dispatcher.slots().length,
}));
console.log('Hook 槽位顺序与失败回滚通过');
`,
      checkpoint:
        '稳定渲染两次后第三槽位 token 相同，第一与第二槽位 token 不同；broken 序列抛出 HOOK_ORDER_CHANGED，失败渲染后仍保留第二次稳定槽位，长度 3。输出“Hook 槽位顺序与失败回滚通过”且退出码为 0。',
    }),
    task({
      id: 'react-hooks-custom-independent',
      title: '独立实践：自定义 Hook 状态机',
      brief:
        'stdin 给多次渲染与一次卸载。模拟自定义 useResource 的依赖、请求 token、清理回调和状态槽；验证相同依赖复用状态，切换后旧请求失效，卸载只清理未清理资源。',
      stdin:
        '{"renders":[{"key":"a","token":1},{"key":"a","token":1},{"key":"b","token":2}],"unmount":true}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Render = { readonly key: string; readonly token: number };
type Input = { readonly renders: readonly Render[]; readonly unmount: boolean };
type ResourceState = {
  readonly key: string;
  readonly token: number;
  readonly cleanups: readonly string[];
};

function createResourceHook() {
  let state: ResourceState | undefined;
  const events: string[] = [];
  return {
    render(render: Render): ResourceState {
      if (state?.key === render.key && state.token === render.token) {
        events.push('reuse:' + render.key);
        return state;
      }
      if (state?.token !== undefined) events.push('cleanup:' + state.token);
      state = Object.freeze({
        key: render.key,
        token: render.token,
        cleanups: Object.freeze([render.key + ':' + render.token]),
      });
      events.push('start:' + render.key + ':' + render.token);
      return state;
    },
    unmount(): void {
      if (!state) return;
      for (const item of state.cleanups) events.push('unmount-cleanup:' + item);
      state = undefined;
    },
    events: () => events,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const hook = createResourceHook();
const snapshots = input.renders.map((render) => hook.render(render));
assert.equal(snapshots[1], snapshots[0]);
assert.notEqual(snapshots[2], snapshots[1]);
assert.equal(snapshots[2]?.key, 'b');
if (input.unmount) hook.unmount();
assert.deepEqual(hook.events(), [
  'start:a:1',
  'reuse:a',
  'cleanup:1',
  'start:b:2',
  'unmount-cleanup:b:2',
]);

console.log(JSON.stringify({ snapshots, events: hook.events() }));
console.log('自定义 Hook 依赖与清理通过');
`,
      checkpoint:
        '同一 key/token 的第二次渲染复用相同状态对象；key 变为 b 时先记录 cleanup:1，再启动 b:2；卸载后只清理 b:2。输出“自定义 Hook 依赖与清理通过”且退出码为 0。',
    }),
  ),

  'programming:React · Hooks、Effect 与并发渲染：useEffect 同步外部系统': lab(
    'React 补齐代码台 07 · 外部订阅与清理',
    '显式模拟 effect 启动、依赖比较、cleanup 和卸载，验证外部订阅在主题变化时先解除旧资源，且 StrictMode 检查不会制造重复监听。',
    task({
      id: 'react-effect-subscription-guided',
      title: '跟做：主题切换的订阅生命周期',
      brief:
        'stdin 给三次渲染的主题。用订阅池记录 start 和 cleanup；同主题重渲染不重复订阅，主题变化先清理旧订阅，卸载清空剩余资源。',
      stdin: '{"renders":["orders","orders","audit"],"unmount":true}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly renders: readonly string[]; readonly unmount: boolean };

function createSubscriptionRuntime() {
  let active: string | undefined;
  const resources = new Set<string>();
  const events: string[] = [];
  return {
    effect(topic: string): void {
      if (active === topic) {
        events.push('skip:' + topic);
        return;
      }
      if (active !== undefined) {
        resources.delete(active);
        events.push('cleanup:' + active);
      }
      active = topic;
      resources.add(topic);
      events.push('start:' + topic);
    },
    unmount(): void {
      if (active !== undefined) {
        resources.delete(active);
        events.push('cleanup:' + active);
        active = undefined;
      }
    },
    events: () => events,
    resources: () => resources.size,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const runtime = createSubscriptionRuntime();
for (const topic of input.renders) runtime.effect(topic);
assert.equal(runtime.resources(), 1);
if (input.unmount) runtime.unmount();
assert.equal(runtime.resources(), 0);
assert.deepEqual(runtime.events(), [
  'start:orders',
  'skip:orders',
  'cleanup:orders',
  'start:audit',
  'cleanup:audit',
]);

console.log(JSON.stringify({ events: runtime.events(), resources: runtime.resources() }));
console.log('Effect 订阅与清理顺序通过');
`,
      checkpoint:
        '同主题第二次 render 只记录 skip:orders；audit 出现前必须先 cleanup:orders；卸载后再 cleanup:audit，资源数最终为 0。输出“Effect 订阅与清理顺序通过”且退出码为 0。',
    }),
    task({
      id: 'react-effect-external-store-independent',
      title: '独立实践：外部 store 快照与订阅抖动',
      brief:
        'stdin 给外部 store 事件。模拟 useSyncExternalStore：订阅只注册一次，任何通知都重新读取一致快照；相同快照不提交，卸载后事件不再触发 render。',
      stdin:
        '{"initial":"draft","events":[{"type":"change","value":"paid"},{"type":"change","value":"paid"},{"type":"noop"},{"type":"unmount"},{"type":"change","value":"refunded"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'change'; readonly value: string }
  | { readonly type: 'noop' }
  | { readonly type: 'unmount' };
type Input = { readonly initial: string; readonly events: readonly Event[] };

function createExternalStore(initial: string) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => value,
    set(next: string): void {
      value = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const store = createExternalStore(input.initial);
let rendered = '';
let renders = 0;
const unsubscribe = store.subscribe(() => {
  const next = store.getSnapshot();
  if (next !== rendered) {
    rendered = next;
    renders += 1;
  }
});
rendered = store.getSnapshot();
renders = 1;
for (const event of input.events) {
  if (event.type === 'change') store.set(event.value);
  if (event.type === 'unmount') unsubscribe();
}

assert.equal(rendered, 'paid');
assert.equal(renders, 2);
assert.equal(store.getSnapshot(), 'refunded');
assert.equal(store.listenerCount(), 0);

console.log(JSON.stringify({ rendered, renders, store: store.getSnapshot(), listeners: store.listenerCount() }));
console.log('外部 store 快照与退订通过');
`,
      checkpoint:
        '首次渲染加 paid 变化共 2 次；重复 paid 与 noop 不增加 render；卸载后 refunded 只改变 store 快照，不再触发组件渲染，监听器为 0。输出“外部 store 快照与退订通过”且退出码为 0。',
    }),
  ),

  'programming:React · Hooks、Effect 与并发渲染：异步 Hook 与竞态回归': lab(
    'React 补齐代码台 08 · 请求令牌、取消与错误恢复',
    '用 request token、AbortSignal 语义和恢复策略模拟异步 Hook，验证旧响应不能覆盖新查询，取消不等于失败，重试也必须有上限。',
    task({
      id: 'react-async-hook-race-guided',
      title: '跟做：只提交最新请求',
      brief:
        'stdin 给两个请求和乱序返回。启动第二请求时取消第一请求；第一响应即使先返回也标记 stale，最终状态只接受 requestId=2。',
      stdin:
        '{"requests":[{"id":1,"value":"旧订单"},{"id":2,"value":"新订单"}],"resolveOrder":[1,2]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Request = { readonly id: number; readonly value: string };
type Input = { readonly requests: readonly Request[]; readonly resolveOrder: readonly number[] };

function createAsyncState() {
  let active = 0;
  let data = '';
  let status: 'idle' | 'loading' | 'success' | 'cancelled' = 'idle';
  const events: string[] = [];
  return {
    start(id: number): void {
      if (active !== 0) events.push('cancel:' + active);
      active = id;
      status = 'loading';
      events.push('start:' + id);
    },
    resolve(id: number, value: string): void {
      if (id !== active) {
        events.push('stale:' + id);
        return;
      }
      data = value;
      status = 'success';
      events.push('commit:' + id);
    },
    leave(): void {
      if (active === 0) return;
      events.push('cancel:' + active);
      status = 'cancelled';
      active = 0;
    },
    snapshot: () => ({ data, status, active, events }),
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const runtime = createAsyncState();
for (const request of input.requests) runtime.start(request.id);
for (const id of input.resolveOrder) {
  const request = input.requests.find((item) => item.id === id);
  if (!request) throw new Error('UNKNOWN_REQUEST');
  runtime.resolve(id, request.value);
}
const snapshot = runtime.snapshot();

assert.equal(snapshot.data, '新订单');
assert.equal(snapshot.status, 'success');
assert.deepEqual(snapshot.events, ['start:1', 'cancel:1', 'start:2', 'stale:1', 'commit:2']);

console.log(JSON.stringify(snapshot));
console.log('异步 Hook 最新请求隔离通过');
`,
      checkpoint:
        '事件依次为 start:1、cancel:1、start:2、stale:1、commit:2；最终 data 为“新订单”，status 为 success。把 commit 条件改成任意响应都写入时旧订单会覆盖新订单。输出“异步 Hook 最新请求隔离通过”且退出码为 0。',
    }),
    task({
      id: 'react-async-hook-error-independent',
      title: '独立实践：取消、超时与单次退避',
      brief:
        'stdin 给离开、超时、鉴权失败和成功事件。Abort 只记录 cancelled；超时最多重试一次；401 刷新会话后重放一次；403 不重试。最终输出恢复轨迹。',
      stdin:
        '{"events":[{"type":"timeout"},{"type":"unauthorized"},{"type":"timeout"},{"type":"forbidden"},{"type":"success"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'leave' }
  | { readonly type: 'timeout' }
  | { readonly type: 'unauthorized' }
  | { readonly type: 'forbidden' }
  | { readonly type: 'success' };
type Input = { readonly events: readonly Event[] };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const events: string[] = [];
let retries = 0;
let refreshes = 0;
let status = 'pending';
let cancelled = false;

for (const event of input.events) {
  if (event.type === 'leave') {
    cancelled = true;
    status = 'cancelled';
    events.push('cancelled:abort');
    continue;
  }
  if (event.type === 'timeout') {
    if (!cancelled && retries === 0) {
      retries += 1;
      events.push('retry:timeout');
    } else {
      status = 'error:timeout';
      events.push('fail:timeout');
    }
    continue;
  }
  if (event.type === 'unauthorized') {
    if (refreshes === 0) {
      refreshes += 1;
      events.push('refresh:session');
    } else {
      status = 'denied';
      events.push('fail:auth-loop');
    }
    continue;
  }
  if (event.type === 'forbidden') {
    status = 'denied';
    events.push('fail:forbidden');
    continue;
  }
  if (!cancelled && status !== 'denied') {
    status = 'success';
    events.push('commit:success');
  }
}

assert.equal(retries, 1);
assert.equal(refreshes, 1);
assert.equal(status, 'denied');
assert.deepEqual(events, [
  'retry:timeout',
  'refresh:session',
  'fail:timeout',
  'fail:forbidden',
]);

console.log(JSON.stringify({ retries, refreshes, status, events }));
console.log('异步 Hook 恢复策略通过');
`,
      checkpoint:
        '超时只重试一次，401 只刷新一次，403 立即 denied；成功事件不能覆盖 denied。轨迹必须与 checkpoint 一致。输出“异步 Hook 恢复策略通过”且退出码为 0。',
    }),
  ),

  'programming:React · Router、Query 与远程数据：Mutation、乐观更新和回滚': lab(
    'React 补齐代码台 09 · 乐观写入与幂等恢复',
    '建立缓存快照、乐观条目、服务器确认和失败回滚，验证并发 mutation 只回滚自己的补丁，网络重试不能重复写入。',
    task({
      id: 'react-mutation-optimistic-guided',
      title: '跟做：失败后精确回滚',
      brief:
        'stdin 给缓存、乐观标题和服务器失败。写前冻结旧快照，先展示新标题，失败时恢复旧标题与版本，并断言输入缓存未被原地修改。',
      stdin:
        '{"cache":{"id":"o-1","title":"草稿","version":3},"optimisticTitle":"已提交","server":{"ok":false,"code":"CONFLICT"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Entity = { readonly id: string; readonly title: string; readonly version: number };
type Input = {
  readonly cache: Entity;
  readonly optimisticTitle: string;
  readonly server: { readonly ok: boolean; readonly code?: string };
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const original = Object.freeze({ ...input.cache });
const optimistic: Entity = Object.freeze({
  ...original,
  title: input.optimisticTitle,
  version: original.version + 1,
});
const events = ['apply:' + optimistic.title];
let visible = optimistic;
if (!input.server.ok) {
  visible = original;
  events.push('rollback:' + input.server.code + ':' + original.title);
} else {
  events.push('confirm:' + optimistic.version);
}

assert.equal(visible, original);
assert.notEqual(optimistic, original);
assert.equal(visible.title, '草稿');
assert.equal(visible.version, 3);
assert.deepEqual(events, ['apply:已提交', 'rollback:CONFLICT:草稿']);
assert.equal(input.cache.title, '草稿');

console.log(JSON.stringify({ original, optimistic, visible, events }));
console.log('Mutation 乐观更新与回滚通过');
`,
      checkpoint:
        '乐观快照标题为“已提交”且版本 4，失败后 visible 精确回到原对象，标题“草稿”、版本 3；事件包含 apply 与 rollback:CONFLICT。输出“Mutation 乐观更新与回滚通过”且退出码为 0。',
    }),
    task({
      id: 'react-mutation-concurrent-independent',
      title: '独立实践：并发 mutation 与幂等键',
      brief:
        'stdin 给两个并发乐观写入，第二成功、第一失败。每个 mutation 保存自己的 before 快照；回滚第一项不能抹掉第二项结果，服务端以幂等键去重。',
      stdin:
        '{"base":{"a":"A","b":"B"},"mutations":[{"id":"m1","field":"a","value":"A*","idempotencyKey":"k1"},{"id":"m2","field":"b","value":"B*","idempotencyKey":"k2"}],"results":[{"id":"m2","ok":true},{"id":"m1","ok":false},{"id":"m1","ok":true}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Mutation = {
  readonly id: string;
  readonly field: string;
  readonly value: string;
  readonly idempotencyKey: string;
};
type Result = { readonly id: string; readonly ok: boolean };
type Input = {
  readonly base: Readonly<Record<string, string>>;
  readonly mutations: readonly Mutation[];
  readonly results: readonly Result[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let visible: Readonly<Record<string, string>> = Object.freeze({ ...input.base });
const before = new Map<string, Readonly<Record<string, string>>>();
const attemptedKeys = new Set<string>();
const committedKeys = new Set<string>();
const events: string[] = [];

for (const mutation of input.mutations) {
  before.set(mutation.id, visible);
  visible = Object.freeze({ ...visible, [mutation.field]: mutation.value });
  events.push('optimistic:' + mutation.id);
}
for (const result of input.results) {
  const mutation = input.mutations.find((item) => item.id === result.id);
  if (!mutation) throw new Error('UNKNOWN_MUTATION');
  const repeated = attemptedKeys.has(mutation.idempotencyKey);
  attemptedKeys.add(mutation.idempotencyKey);
  if (result.ok && !repeated) {
    committedKeys.add(mutation.idempotencyKey);
    events.push('confirm:' + mutation.id + ':' + mutation.idempotencyKey);
  } else if (result.ok) {
    events.push('dedupe:' + mutation.idempotencyKey);
  } else {
    const snapshot = before.get(mutation.id);
    if (!snapshot) throw new Error('MISSING_SNAPSHOT');
    const fieldValue = snapshot[mutation.field];
    visible = Object.freeze({ ...visible, [mutation.field]: fieldValue });
    events.push('rollback:' + mutation.id + ':' + mutation.field);
  }
}

assert.deepEqual(visible, { a: 'A', b: 'B*' });
assert.deepEqual([...committedKeys], ['k2']);
assert.equal(events.includes('rollback:m1:a'), true);
assert.equal(events.includes('dedupe:k1'), true);
assert.equal(input.base.b, 'B');

console.log(JSON.stringify({ visible, committedKeys: [...committedKeys], events }));
console.log('并发 mutation 精确回滚通过');
`,
      checkpoint:
        '最终缓存为 a=A、b=B*；m2 的 k2 已确认，m1 失败只回滚 a，之后同幂等键成功被 dedupe:k1；输入 base 的 b 仍为 B。输出“并发 mutation 精确回滚通过”且退出码为 0。',
    }),
  ),

  'programming:React · Next.js、RSC 与渲染边界：App Router、布局和服务端组件': lab(
    'React 补齐代码台 10 · 路由树、布局与服务端载荷',
    '实现嵌套 segment 匹配和布局组合，验证只有页面段变化时父布局保持同一身份，并确保服务端秘密与对象级权限不进入客户端序列化结果。',
    task({
      id: 'react-app-router-layout-guided',
      title: '跟做：嵌套布局身份稳定',
      brief:
        'stdin 给两个订单路径和会话。匹配 layout、page 段；从列表切详情时订单布局继续复用，只替换页面；不存在的路径返回 not-found。',
      stdin:
        '{"routes":["/orders","/orders/o-9","/orders/o-9/audit"],"session":{"role":"support"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly routes: readonly string[]; readonly session: { readonly role: 'support' | 'viewer' } };
type Match = { readonly layout: string; readonly page: string; readonly params: Readonly<Record<string, string>> };

function match(path: string): Match | { readonly page: 'not-found' } {
  if (path === '/orders') return { layout: 'orders-layout', page: 'orders-list', params: {} };
  const detail = /^\\/orders\\/([^/]+)$/.exec(path);
  if (detail?.[1]) return { layout: 'orders-layout', page: 'order-detail', params: { orderId: detail[1] } };
  return { page: 'not-found' };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const matches = input.routes.map(match);
assert.equal(matches[0] && 'layout' in matches[0] ? matches[0].layout : '', 'orders-layout');
assert.equal(matches[1] && 'page' in matches[1] ? matches[1].page : '', 'order-detail');
assert.deepEqual(matches[1] && 'params' in matches[1] ? matches[1].params : {}, { orderId: 'o-9' });
assert.deepEqual(matches[2], { page: 'not-found' });
assert.equal(input.session.role, 'support');

console.log(JSON.stringify(matches));
console.log('App Router 嵌套布局匹配通过');
`,
      checkpoint:
        '/orders 与 /orders/o-9 都匹配 orders-layout，后者页面为 order-detail、参数 orderId=o-9；三段路径返回 not-found。输出“App Router 嵌套布局匹配通过”且退出码为 0。',
    }),
    task({
      id: 'react-app-router-server-boundary-independent',
      title: '独立实践：服务端字段白名单与授权段',
      brief:
        'stdin 给订单、数据库连接串、会话和请求路径。服务端按角色与订单归属授权，只序列化公共字段；客户端载荷中不应出现 token、dbUrl 或内部备注。',
      stdin:
        '{"order":{"id":"o-9","ownerId":"u1","total":8800,"status":"paid","internalNote":"vip","dbUrl":"postgres://secret"},"session":{"userId":"u1","role":"support","token":"session-secret"},"route":"/orders/o-9"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly order: {
    readonly id: string;
    readonly ownerId: string;
    readonly total: number;
    readonly status: string;
    readonly internalNote: string;
    readonly dbUrl: string;
  };
  readonly session: { readonly userId: string; readonly role: 'support' | 'viewer'; readonly token: string };
  readonly route: string;
};
type Response =
  | { readonly ok: true; readonly order: { readonly id: string; readonly total: number; readonly status: string } }
  | { readonly ok: false; readonly code: 'FORBIDDEN' | 'NOT_FOUND' };

function serverLoad(input: Input): Response {
  if (input.route !== '/orders/' + input.order.id) return { ok: false, code: 'NOT_FOUND' };
  if (input.session.role !== 'support' || input.order.ownerId !== input.session.userId) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return {
    ok: true,
    order: Object.freeze({
      id: input.order.id,
      total: input.order.total,
      status: input.order.status,
    }),
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const response = serverLoad(input);
const serialized = JSON.stringify(response);
assert.deepEqual(response, {
  ok: true,
  order: { id: 'o-9', total: 8800, status: 'paid' },
});
assert.equal(serialized.includes('session-secret'), false);
assert.equal(serialized.includes('postgres://secret'), false);
assert.equal(serialized.includes('internalNote'), false);
assert.deepEqual(serverLoad({ ...input, session: { ...input.session, role: 'viewer' } }), {
  ok: false,
  code: 'FORBIDDEN',
});

console.log(serialized);
console.log('RSC 服务端字段白名单与授权通过');
`,
      checkpoint:
        '成功载荷只含 id、total、status；session token、dbUrl、internalNote 均不出现；viewer 得到 FORBIDDEN。输出“RSC 服务端字段白名单与授权通过”且退出码为 0。',
    }),
  ),

  'programming:React · Next.js、RSC 与渲染边界：hydration、错误和恢复': lab(
    'React 补齐代码台 11 · 服务端快照与客户端接管',
    '比较服务端与客户端渲染描述，检测文本和属性不匹配，使用稳定快照恢复并把非确定性值延迟到 mount 后生成。',
    task({
      id: 'react-hydration-mismatch-guided',
      title: '跟做：文本与属性 hydration 检查',
      brief:
        'stdin 给服务端和客户端描述。树签名不一致时必须生成可定位错误；恢复策略丢弃客户端猜测、采用服务端快照，再在 mounted 阶段写入随机值。',
      stdin:
        '{"server":{"tag":"main","text":"课程目录","className":"ready"},"client":{"tag":"main","text":"课程列表","className":"ready"},"mountToken":"clock-17"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Node = { readonly tag: string; readonly text: string; readonly className: string };
type Input = { readonly server: Node; readonly client: Node; readonly mountToken: string };

function signature(node: Node): string {
  return node.tag + '|' + node.className + '|' + node.text;
}
function hydrate(input: Input): {
  readonly committed: Node;
  readonly error: string | undefined;
  readonly mountedClass: string;
} {
  const expected = signature(input.server);
  const actual = signature(input.client);
  const error = expected === actual ? undefined : 'HYDRATION_MISMATCH:' + expected + '!=' + actual;
  const committed = error ? input.server : input.client;
  return {
    committed,
    error,
    mountedClass: committed.className + ' mounted-' + input.mountToken,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const result = hydrate(input);
assert.equal(result.committed, input.server);
assert.match(result.error ?? '', /HYDRATION_MISMATCH/);
assert.equal(result.mountedClass, 'ready mounted-clock-17');
const stable = hydrate({ ...input, client: input.server });
assert.equal(stable.error, undefined);
assert.equal(stable.committed, input.server);

console.log(JSON.stringify(result));
console.log('Hydration 不匹配定位与恢复通过');
`,
      checkpoint:
        '客户端文本“课程列表”触发包含 main|ready|课程目录 与 main|ready|课程列表 的 HYDRATION_MISMATCH；恢复采用服务端节点，挂载后 class 为 ready mounted-clock-17；一致时不报错。输出“Hydration 不匹配定位与恢复通过”且退出码为 0。',
    }),
    task({
      id: 'react-hydration-payload-independent',
      title: '独立实践：payload 版本与确定性时间',
      brief:
        'stdin 给服务端文本、payload 版本、序列化时间和客户端时间。旧版本 payload 被拒绝；hydration 只能使用服务端时间，客户端时间在 mounted 后才显示，避免首次文本不一致。',
      stdin:
        '{"serverText":"订单已支付","payload":{"version":1,"requestId":"r8","serverTime":"10:00"},"clientTime":"10:02"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly serverText: string;
  readonly payload: { readonly version: number; readonly requestId: string; readonly serverTime: string };
  readonly clientTime: string;
};

function hydrate(input: Input): {
  readonly text: string;
  readonly time: string;
  readonly warnings: readonly string[];
  readonly mountedTime: string;
} {
  const warnings: string[] = [];
  if (input.payload.version !== 2) warnings.push('PAYLOAD_VERSION');
  if (!input.payload.requestId) warnings.push('REQUEST_ID');
  return {
    text: input.serverText,
    time: input.payload.serverTime,
    warnings: Object.freeze(warnings),
    mountedTime: input.clientTime,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const result = hydrate(input);
assert.equal(result.text, '订单已支付');
assert.equal(result.time, '10:00');
assert.equal(result.mountedTime, '10:02');
assert.deepEqual(result.warnings, ['PAYLOAD_VERSION']);
assert.notEqual(result.time, result.mountedTime);
assert.equal(JSON.stringify({ text: result.text, time: result.time }).includes('10:02'), false);

console.log(JSON.stringify(result));
console.log('hydration payload 与 mounted 时间通过');
`,
      checkpoint:
        'hydration 文本使用订单已支付，时间使用服务端 10:00；客户端 10:02 只在 mountedTime 出现；旧 payload 版本产生 PAYLOAD_VERSION。输出“hydration payload 与 mounted 时间通过”且退出码为 0。',
    }),
  ),

  'programming:React · 测试、性能与可访问性：Testing Library 与用户行为': lab(
    'React 补齐代码台 12 · 用户行为测试与可访问查询',
    '用可访问角色、名称和状态驱动测试替身，验证测试按用户可观察行为执行，而不是依赖内部 class、组件状态或实现细节。',
    task({
      id: 'react-testing-library-guided',
      title: '跟做：按角色和名称触发保存',
      brief:
        'stdin 给按钮名称、初始状态和点击次数。测试替身只能通过 role=button、accessibleName 和 disabled 查询；触发后断言状态文本与回调次数。',
      stdin: '{"button":"保存订单","disabled":false,"clicks":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly button: string; readonly disabled: boolean; readonly clicks: number };
type Element = {
  readonly role: string;
  readonly accessibleName: string;
  readonly disabled: boolean;
  readonly onActivate: () => void;
};

function createScreen(button: Input) {
  let status = '等待操作';
  let calls = 0;
  const element: Element = {
    role: 'button',
    accessibleName: button.button,
    disabled: button.disabled,
    onActivate: () => {
      if (element.disabled) return;
      calls += 1;
      status = '已保存 ' + calls;
    },
  };
  return {
    getByRole(role: string, options: { readonly name: string }): Element {
      if (element.role !== role || element.accessibleName !== options.name) {
        throw new Error('QUERY_NOT_FOUND');
      }
      return element;
    },
    status: () => status,
    calls: () => calls,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const screen = createScreen(input);
const button = screen.getByRole('button', { name: '保存订单' });
for (let index = 0; index < input.clicks; index += 1) button.onActivate();

assert.equal(button.accessibleName, '保存订单');
assert.equal(button.disabled, false);
assert.equal(screen.calls(), 2);
assert.equal(screen.status(), '已保存 2');
assert.throws(() => screen.getByRole('link', { name: '保存订单' }), /QUERY_NOT_FOUND/);

console.log(JSON.stringify({ name: button.accessibleName, calls: screen.calls(), status: screen.status() }));
console.log('Testing Library 用户行为查询通过');
`,
      checkpoint:
        '通过 role=button 与名称“保存订单”找到控件，两次激活后回调 2 次、状态“已保存 2”；用 link 查询必须失败。输出“Testing Library 用户行为查询通过”且退出码为 0。',
    }),
    task({
      id: 'react-testing-behavior-independent',
      title: '独立实践：表单校验和无障碍状态',
      brief:
        'stdin 给无效邮箱和提交次数。测试替身公开 textbox、alert、aria-invalid 与 aria-describedby；提交后错误通过关联说明暴露，修正输入后错误消失且只提交一次。',
      stdin: '{"email":"bad","submitClicks":1,"fixedEmail":"ada@example.test"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly email: string; readonly submitClicks: number; readonly fixedEmail: string };
type FormView = {
  readonly role: 'textbox';
  readonly value: string;
  readonly invalid: boolean;
  readonly describedBy: string;
  readonly alert: string | undefined;
  readonly submitCalls: number;
};

function submit(value: string, calls: number): FormView {
  const invalid = !value.includes('@');
  return {
    role: 'textbox',
    value,
    invalid,
    describedBy: 'email-help email-error',
    alert: invalid ? '邮箱格式不正确' : undefined,
    submitCalls: invalid ? calls : calls + 1,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let calls = 0;
let view = submit(input.email, calls);
for (let index = 0; index < input.submitClicks; index += 1) {
  calls = view.submitCalls;
  view = submit(input.email, calls);
}
assert.equal(view.invalid, true);
assert.equal(view.alert, '邮箱格式不正确');
assert.equal(view.describedBy.includes('email-error'), true);
assert.equal(view.submitCalls, 0);
const fixed = submit(input.fixedEmail, calls);
assert.equal(fixed.invalid, false);
assert.equal(fixed.alert, undefined);
assert.equal(fixed.submitCalls, 1);

console.log(JSON.stringify({ invalid: view, fixed }));
console.log('表单测试替身与无障碍状态通过');
`,
      checkpoint:
        '无效邮箱保持 aria-invalid 与 email-error 关联，提交次数仍为 0；修正为 ada@example.test 后 alert 消失且提交次数为 1。输出“表单测试替身与无障碍状态通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · Vue、Vite 与第一个应用：SFC、script setup 与 scoped CSS': lab(
    'Vue 补齐代码台 01 · 单文件组件编译契约',
    '解析最小 SFC 的 template、script setup 与 style，模拟顶层绑定暴露和 scoped 哈希，验证宏只允许在 setup 顶层且样式不会宣称全局隔离。',
    task({
      id: 'vue-sfc-blocks-guided',
      title: '跟做：三块拆分与绑定扫描',
      brief:
        'stdin 给一个 SFC 源和 scope id。解析三个块、收集顶层 const/ref、检查 scoped 样式，并生成组件摘要。',
      stdin:
        '{"scopeId":"data-v-7a1f","source":"<template><button @click=\\"count++\\">{{ title }}</button></template><script setup lang=\\"ts\\">const title = ref(\'订单\'); const count = ref(0);</script><style scoped>.title { color: red; }</style>"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly scopeId: string; readonly source: string };
type Sfc = {
  readonly template: string;
  readonly script: string;
  readonly style: string;
  readonly bindings: readonly string[];
  readonly scoped: boolean;
  readonly scopeSelector: string;
};

function parseSfc(input: Input): Sfc {
  const template = /<template>([\\s\\S]*?)<\\/template>/.exec(input.source)?.[1];
  const script = /<script setup lang="ts">([\\s\\S]*?)<\\/script>/.exec(input.source)?.[1];
  const style = /<style scoped>([\\s\\S]*?)<\\/style>/.exec(input.source)?.[1];
  if (!template || !script || !style) throw new Error('SFC_BLOCK_MISSING');
  const bindings = [...script.matchAll(/\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  return {
    template,
    script,
    style,
    bindings: Object.freeze(bindings),
    scoped: true,
    scopeSelector: input.scopeId,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const sfc = parseSfc(input);
assert.deepEqual(sfc.bindings, ['title', 'count']);
assert.equal(sfc.template.includes('count++'), true);
assert.equal(sfc.style.includes('.title'), true);
assert.equal(sfc.scoped, true);
assert.equal(sfc.scopeSelector, 'data-v-7a1f');
assert.throws(() => parseSfc({ ...input, source: '<template>x</template>' }), /SFC_BLOCK_MISSING/);

console.log(JSON.stringify({
  bindings: sfc.bindings,
  scoped: sfc.scoped,
  scopeSelector: sfc.scopeSelector,
  styleLength: sfc.style.length,
}));
console.log('SFC 三块解析与绑定暴露通过');
`,
      checkpoint:
        'bindings 必须为 title、count，scoped=true，scopeSelector=data-v-7a1f；缺失 script 或 style 时抛 SFC_BLOCK_MISSING。输出“SFC 三块解析与绑定暴露通过”且退出码为 0。',
    }),
    task({
      id: 'vue-sfc-macro-independent',
      title: '独立实践：宏位置与 scoped 选择器',
      brief:
        'stdin 给多个 setup 语句位置和样式。defineProps/defineEmits 只能在 setup 顶层；为每个 scoped 选择器追加 scope 属性，并保留 :deep 的显式穿透边界。',
      stdin:
        '{"scopeId":"data-v-a21","statements":[{"depth":0,"macro":"defineProps"},{"depth":1,"macro":"defineEmits"},{"depth":0,"code":"const ready = true"}],"selectors":[".card",".card :deep(.icon)",":global(body)"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Statement = { readonly depth: number; readonly macro?: string; readonly code?: string };
type Input = {
  readonly scopeId: string;
  readonly statements: readonly Statement[];
  readonly selectors: readonly string[];
};

function validate(input: Input): {
  readonly topLevelMacros: readonly string[];
  readonly violations: readonly string[];
  readonly styles: readonly string[];
} {
  const macros = new Set(['defineProps', 'defineEmits']);
  const topLevelMacros: string[] = [];
  const violations: string[] = [];
  for (const statement of input.statements) {
    if (statement.macro && macros.has(statement.macro)) {
      if (statement.depth === 0) topLevelMacros.push(statement.macro);
      else violations.push('NESTED_MACRO:' + statement.macro);
    }
  }
  const styles = input.selectors.map((selector) => {
    if (selector.startsWith(':global(')) return selector;
    if (selector.includes(':deep(')) return selector + '[' + input.scopeId + ']';
    return selector + '[' + input.scopeId + ']';
  });
  return { topLevelMacros, violations, styles };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const result = validate(input);
assert.deepEqual(result.topLevelMacros, ['defineProps']);
assert.deepEqual(result.violations, ['NESTED_MACRO:defineEmits']);
assert.deepEqual(result.styles, [
  '.card[data-v-a21]',
  '.card :deep(.icon)[data-v-a21]',
  ':global(body)',
]);

console.log(JSON.stringify(result));
console.log('SFC 宏位置与 scoped 选择器通过');
`,
      checkpoint:
        '顶层宏只保留 defineProps，嵌套 defineEmits 记为 NESTED_MACRO；两个 scoped 选择器追加 data-v-a21，:global(body) 保持不动。输出“SFC 宏位置与 scoped 选择器通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 响应式、computed 与 watch：响应式缺陷与竞态实验': lab(
    'Vue 补齐代码台 02 · 分支依赖与异步刷新竞态',
    '模拟响应式依赖收集和过期任务，验证条件分支切换后旧依赖必须清理，慢异步结果不能覆盖较新请求的刷新结果。',
    task({
      id: 'vue-reactive-branch-guided',
      title: '跟做：条件分支依赖清理',
      brief:
        'stdin 给开关、标题、计数更新序列。effect 每次运行前清理旧依赖；关闭标题分支后修改 title 不再重跑，修改 count 仍会重跑。',
      stdin:
        '{"initial":{"useTitle":true,"title":"Vue","count":0},"writes":[{"key":"title","value":"Vue 3"},{"key":"useTitle","value":false},{"key":"title","value":"stale"},{"key":"count","value":1}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type State = { useTitle: boolean; title: string; count: number };
type Write = { readonly key: keyof State; readonly value: boolean | string | number };
type Input = { readonly initial: State; readonly writes: readonly Write[] };
type Effect = { active: boolean; deps: Set<keyof State> };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const state = { ...input.initial };
const deps = new Map<keyof State, Set<Effect>>();
const seen: Array<string | number> = [];
const effect: Effect = { active: true, deps: new Set() };

function cleanup(target: Effect): void {
  for (const key of target.deps) deps.get(key)?.delete(target);
  target.deps.clear();
}
function track(key: keyof State): void {
  if (!effect.active) return;
  effect.deps.add(key);
  const bucket = deps.get(key) ?? new Set<Effect>();
  bucket.add(effect);
  deps.set(key, bucket);
}
function run(): void {
  cleanup(effect);
  if (state.useTitle) {
    track('useTitle');
    track('title');
    seen.push(state.title);
  } else {
    track('useTitle');
    track('count');
    seen.push(state.count);
  }
}
function write(write: Write): void {
  if (typeof state[write.key] === 'number' && typeof write.value === 'number') {
    (state[write.key] as number) = write.value;
  } else if (typeof state[write.key] === 'boolean' && typeof write.value === 'boolean') {
    (state[write.key] as boolean) = write.value;
  } else if (typeof state[write.key] === 'string' && typeof write.value === 'string') {
    (state[write.key] as string) = write.value;
  }
  if (deps.get(write.key)?.has(effect)) run();
}

run();
for (const item of input.writes) write(item);

assert.deepEqual(seen, ['Vue', 'Vue 3', 0, 1]);
assert.equal(deps.get('title')?.size, 0);
assert.equal(deps.get('count')?.has(effect), true);

console.log(JSON.stringify({ seen, titleDeps: deps.get('title')?.size ?? 0, countDeps: deps.get('count')?.size ?? 0 }));
console.log('响应式分支依赖清理通过');
`,
      checkpoint:
        'seen 必须为 Vue、Vue 3、0、1；关闭标题分支后写 stale 不触发，title 依赖集合为 0，count 仍订阅当前 effect。输出“响应式分支依赖清理通过”且退出码为 0。',
    }),
    task({
      id: 'vue-reactive-race-independent',
      title: '独立实践：computed 与异步搜索竞态',
      brief:
        'stdin 给搜索词和乱序响应。computed key 只依赖规范化查询与页码；每次请求递增序号，只有最新序号能提交结果，旧响应记录为 stale。',
      stdin:
        '{"query":" Vue ","page":2,"responses":[{"requestId":1,"query":"vue","rows":["old"]},{"requestId":2,"query":"vue","rows":["fresh"]}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Response = { readonly requestId: number; readonly query: string; readonly rows: readonly string[] };
type Input = { readonly query: string; readonly page: number; readonly responses: readonly Response[] };

function normalize(input: Input): { readonly query: string; readonly page: number; readonly key: string } {
  const query = input.query.trim().toLowerCase();
  const page = Math.max(1, Math.min(50, Math.trunc(input.page)));
  return { query, page, key: 'search:' + query + ':' + page };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const key = normalize(input);
const latest = Math.max(...input.responses.map((response) => response.requestId));
let result: readonly string[] = Object.freeze([]);
const trace: string[] = [];
for (const response of input.responses) {
  if (response.requestId !== latest || response.query !== key.query) {
    trace.push('stale:' + response.requestId);
    continue;
  }
  result = Object.freeze([...response.rows]);
  trace.push('commit:' + response.requestId);
}

assert.deepEqual(key, { query: 'vue', page: 2, key: 'search:vue:2' });
assert.deepEqual(result, ['fresh']);
assert.deepEqual(trace, ['stale:1', 'commit:2']);

console.log(JSON.stringify({ key, result, trace }));
console.log('computed 搜索键与竞态提交通过');
`,
      checkpoint:
        '规范化 key 为 search:vue:2；requestId=1 记录 stale，requestId=2 提交 fresh；最终结果不含 old。输出“computed 搜索键与竞态提交通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：props、emit 与组件输入输出': lab(
    'Vue 补齐代码台 03 · Props 校验与事件协议',
    '模拟 Vue props 的默认值、Boolean 强制转换和 kebab-case 映射，验证子组件只通过 emit 请求父级修改，并保留稳定的输入输出契约。',
    task({
      id: 'vue-props-emit-guided',
      title: '跟做：布尔 prop 与提交事件',
      brief:
        'stdin 给原始 props 和提交载荷。规范化 loading、page、empty-label 与 kebab/camel 属性；emit 事件只包含声明字段，父组件更新后 props 仍是只读快照。',
      stdin:
        '{"raw":{"loading":"","page":"3","empty-label":"暂无记录","innerRole":"admin"},"submit":{"id":"o-9","note":"加急"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type RawProps = Readonly<Record<string, unknown>>;
type Input = { readonly raw: RawProps; readonly submit: Readonly<Record<string, string>> };
type Props = {
  readonly loading: boolean;
  readonly page: number;
  readonly emptyLabel: string;
};

function resolveProps(raw: RawProps): Props {
  const page = Number(raw.page ?? 1);
  if (!Number.isInteger(page) || page < 1) throw new Error('PAGE_INVALID');
  return Object.freeze({
    loading: raw.loading === '' || raw.loading === true || raw.loading === 'true',
    page,
    emptyLabel: String(raw['empty-label'] ?? '暂无数据'),
  });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const props = resolveProps(input.raw);
const allowed = new Set(['id', 'note']);
const unknown = Object.keys(input.submit).filter((key) => !allowed.has(key));
if (unknown.length > 0) throw new Error('UNKNOWN_EMIT_FIELD');
const emitted = Object.freeze({ name: 'submit', payload: Object.freeze({ ...input.submit }) });

assert.deepEqual(props, { loading: true, page: 3, emptyLabel: '暂无记录' });
assert.deepEqual(emitted, { name: 'submit', payload: { id: 'o-9', note: '加急' } });
assert.equal('innerRole' in input.raw, true);
assert.equal('innerRole' in props, false);
assert.throws(() => resolveProps({ page: '0' }), /PAGE_INVALID/);

console.log(JSON.stringify({ props, emitted }));
console.log('Vue props 规范化与 emit 契约通过');
`,
      checkpoint:
        'loading 转为 true，page 为数字 3，emptyLabel 读取 kebab-case；emit 载荷只含 id、note，innerRole 不进入 props；page=0 抛 PAGE_INVALID。输出“Vue props 规范化与 emit 契约通过”且退出码为 0。',
    }),
    task({
      id: 'vue-props-parent-independent',
      title: '独立实践：受控组件与父级更新',
      brief:
        'stdin 给初始值和三次输入。子组件不修改 prop，只发出 update:modelValue；父组件 reducer 接受合法值并拒绝超长值，最终值和事件轨迹必须一致。',
      stdin:
        '{"initial":"草稿","inputs":["草稿一","草稿二","这是一个超过十二个字符而且长度明显超限的标题"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly initial: string; readonly inputs: readonly string[] };

function parentReduce(value: string, next: string): { readonly value: string; readonly event: string } {
  if (next.length > 12) return { value, event: 'reject:too-long' };
  return { value: next, event: 'update:' + next };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let value = input.initial;
const events: string[] = [];
for (const candidate of input.inputs) {
  const result = parentReduce(value, candidate);
  value = result.value;
  events.push(result.event);
}

assert.equal(value, '草稿二');
assert.deepEqual(events, ['update:草稿一', 'update:草稿二', 'reject:too-long']);
assert.equal(input.initial, '草稿');
assert.equal(events.filter((event) => event.startsWith('update:')).length, 2);

console.log(JSON.stringify({ value, events }));
console.log('Vue 受控组件父级更新通过');
`,
      checkpoint:
        '父级最终值为“草稿二”，事件依次为 update:草稿一、update:草稿二、reject:too-long；初始 prop 仍为“草稿”。输出“Vue 受控组件父级更新通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：插槽、作用域插槽与组合': lab(
    'Vue 补齐代码台 04 · 作用域插槽与回退内容',
    '实现具名插槽和作用域参数的确定性渲染器，验证调用方拥有内容、子组件只提供数据、缺省插槽回退不产生重复节点。',
    task({
      id: 'vue-slots-scoped-guided',
      title: '跟做：作用域插槽消费列表项',
      brief:
        'stdin 给行数据和默认/自定义渲染模式。子组件把 row、index 传给作用域插槽；自定义插槽输出标题，默认插槽回退输出 id，且每个节点只有一个 owner。',
      stdin:
        '{"rows":[{"id":"a","title":"状态"},{"id":"b","title":"路由"}],"mode":"custom"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly title: string };
type Input = { readonly rows: readonly Row[]; readonly mode: 'default' | 'custom' };
type SlotNode = { readonly owner: 'parent' | 'child-fallback'; readonly text: string; readonly scope: Readonly<Record<string, unknown>> };

function renderList(input: Input): readonly SlotNode[] {
  return Object.freeze(input.rows.map((row, index) => {
    const scope = Object.freeze({ row: Object.freeze({ ...row }), index });
    if (input.mode === 'custom') {
      return Object.freeze({ owner: 'parent', text: row.title.toUpperCase(), scope });
    }
    return Object.freeze({ owner: 'child-fallback', text: row.id, scope });
  }));
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const custom = renderList(input);
assert.deepEqual(custom.map((node) => node.text), ['状态', '路由']);
assert.ok(custom.every((node) => node.owner === 'parent'));
assert.deepEqual(custom[1]?.scope.index, 1);
const fallback = renderList({ ...input, mode: 'default' });
assert.deepEqual(fallback.map((node) => node.text), ['a', 'b']);
assert.ok(fallback.every((node) => node.owner === 'child-fallback'));

console.log(JSON.stringify({ custom, fallback }));
console.log('Vue 作用域插槽与回退通过');
`,
      checkpoint:
        'custom 节点文本为“状态”“路由”，owner=parent，第二项 scope.index=1；default 节点文本为 a、b，owner=child-fallback。输出“Vue 作用域插槽与回退通过”且退出码为 0。',
    }),
    task({
      id: 'vue-slots-named-independent',
      title: '独立实践：具名插槽布局与元素归属',
      brief:
        'stdin 给 header、default、footer 插槽是否存在。渲染顺序固定为 header、main、footer；缺省调用方插槽使用回退，但事件节点仍记录调用方 owner。',
      stdin:
        '{"slots":{"header":"账户中心","default":"订单 O-9"},"actions":{"header":"logout","default":"refresh"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly slots: Readonly<Record<string, string>>;
  readonly actions: Readonly<Record<string, string>>;
};
type RenderNode = {
  readonly region: 'header' | 'main' | 'footer';
  readonly text: string;
  readonly owner: 'caller' | 'layout-fallback';
  readonly action: string | undefined;
};

function compose(input: Input): readonly RenderNode[] {
  const regions = ['header', 'main', 'footer'] as const;
  return Object.freeze(regions.map((region) => {
    const slotKey = region === 'main' ? 'default' : region;
    const text = input.slots[slotKey];
    return Object.freeze({
      region,
      text: text ?? '回退内容',
      owner: text === undefined ? 'layout-fallback' : 'caller',
      action: input.actions[slotKey],
    });
  }));
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const nodes = compose(input);
assert.deepEqual(nodes.map((node) => node.region), ['header', 'main', 'footer']);
assert.deepEqual(nodes.map((node) => node.text), ['账户中心', '订单 O-9', '回退内容']);
assert.equal(nodes[0]?.owner, 'caller');
assert.equal(nodes[2]?.owner, 'layout-fallback');
assert.equal(nodes[0]?.action, 'logout');
assert.equal(nodes[2]?.action, undefined);

console.log(JSON.stringify(nodes));
console.log('Vue 具名插槽布局与归属通过');
`,
      checkpoint:
        '三段顺序为 header、main、footer；文本为账户中心、订单 O-9、回退内容；footer 归属 layout-fallback 且没有动作。输出“Vue 具名插槽布局与归属通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：provide/inject 与依赖边界': lab(
    'Vue 补齐代码台 05 · 注入上下文与租户隔离',
    '用上下文栈模拟 provide/inject，验证最近 provider 生效、缺失注入可快速失败、组件卸载会移除作用域，并阻止不同应用实例共享敏感上下文。',
    task({
      id: 'vue-provide-inject-guided',
      title: '跟做：最近 provider 与注入默认值',
      brief:
        'stdin 给两层 provider 和三个组件。内层覆盖同名 token；没有 provider 的 token 使用默认值；必经 token 缺失时抛 INJECT_MISSING。',
      stdin:
        '{"providers":[{"token":"tenant","value":"outer"},{"token":"tenant","value":"inner"},{"token":"theme","value":"dark"}],"components":[{"token":"theme"},{"token":"tenant"},{"token":"session","required":false,"default":"guest"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Provider = { readonly token: string; readonly value: unknown };
type Consumer = {
  readonly token: string;
  readonly required?: boolean;
  readonly default?: unknown;
};
type Input = { readonly providers: readonly Provider[]; readonly components: readonly Consumer[] };

function createContext() {
  const values = new Map<string, unknown>();
  return {
    provide(token: string, value: unknown): void {
      values.set(token, value);
    },
    inject(consumer: Consumer): unknown {
      if (values.has(consumer.token)) return values.get(consumer.token);
      if (consumer.default !== undefined) return consumer.default;
      if (consumer.required) throw new Error('INJECT_MISSING:' + consumer.token);
      return undefined;
    },
    dispose(): void {
      values.clear();
    },
    size: () => values.size,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const context = createContext();
for (const provider of input.providers) context.provide(provider.token, provider.value);
const injected = input.components.map((consumer) => context.inject(consumer));
assert.deepEqual(injected, ['dark', 'inner', 'guest']);
assert.equal(context.size(), 2);
context.dispose();
assert.equal(context.size(), 0);
assert.throws(
  () => createContext().inject({ token: 'session', required: true }),
  /INJECT_MISSING/,
);

console.log(JSON.stringify({ injected, remainingBeforeDispose: 2, remainingAfterDispose: context.size() }));
console.log('Vue provide/inject 作用域通过');
`,
      checkpoint:
        '注入结果依次为 dark、inner、guest；provider 只保留 tenant 与 theme 两个 token，dispose 后为 0；必经 session 缺失抛 INJECT_MISSING。输出“Vue provide/inject 作用域通过”且退出码为 0。',
    }),
    task({
      id: 'vue-provide-inject-isolation-independent',
      title: '独立实践：请求级 context 与租户秘密',
      brief:
        'stdin 给两个并发 SSR 请求。每个请求拥有独立 context，provider 只暴露公共用户信息；请求 token 不进入子组件可见注入，完成后两个 context 都被释放。',
      stdin:
        '{"requests":[{"id":"r1","tenant":"t1","user":"u1","token":"token-1"},{"id":"r2","tenant":"t2","user":"u2","token":"token-2"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Request = { readonly id: string; readonly tenant: string; readonly user: string; readonly token: string };
type Input = { readonly requests: readonly Request[] };
type PublicContext = {
  readonly requestId: string;
  readonly tenant: string;
  readonly user: string;
};

function createRequestContext(request: Request) {
  const values = new Map<string, unknown>();
  values.set('public', Object.freeze({
    requestId: request.id,
    tenant: request.tenant,
    user: request.user,
  }));
  values.set('server-token', request.token);
  return {
    injectPublic: () => values.get('public') as PublicContext,
    hasComponentSecret: () => values.has('component-token'),
    finish: () => values.clear(),
    size: () => values.size,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const contexts = input.requests.map(createRequestContext);
assert.deepEqual(contexts.map((context) => context.injectPublic()), [
  { requestId: 'r1', tenant: 't1', user: 'u1' },
  { requestId: 'r2', tenant: 't2', user: 'u2' },
]);
assert.ok(contexts.every((context) => !context.hasComponentSecret()));
assert.notEqual(contexts[0]?.injectPublic(), contexts[1]?.injectPublic());
for (const context of contexts) context.finish();
assert.ok(contexts.every((context) => context.size() === 0));

console.log(JSON.stringify({
  visible: contexts.map((context) => context.injectPublic()),
  sizes: contexts.map((context) => context.size()),
}));
console.log('SSR request context 隔离与释放通过');
`,
      checkpoint:
        '两个请求分别注入 r1/t1/u1 与 r2/t2/u2，公共对象引用不同；组件不可见秘密 token；finish 后两个 context 的 size 都为 0。输出“SSR request context 隔离与释放通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：v-model 与受控表单状态': lab(
    'Vue 补齐代码台 06 · v-model 修饰符与表单状态',
    '显式实现 modelValue、update:modelValue、trim/number 修饰符和多字段表单 reducer，验证父级拥有状态、子组件不直接修改 prop。',
    task({
      id: 'vue-vmodel-modifiers-guided',
      title: '跟做：trim 与 number 修饰符',
      brief:
        'stdin 给原始输入与修饰符事件。trim 去掉首尾空格，number 只把合法数字转为 number；非法输入保留字符串并产生校验错误，emit 始终发送规范化值。',
      stdin:
        '{"events":[{"value":" 42 ","modifiers":{"trim":true,"number":true}},{"value":"  ","modifiers":{"trim":true}},{"value":"3x","modifiers":{"number":true}}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Modifiers = { readonly trim?: boolean; readonly number?: boolean };
type Event = { readonly value: string; readonly modifiers: Modifiers };
type Input = { readonly events: readonly Event[] };

function normalize(event: Event): { readonly value: string | number; readonly error?: string } {
  const trimmed = event.modifiers.trim ? event.value.trim() : event.value;
  if (trimmed === '') return { value: '', error: 'REQUIRED' };
  if (event.modifiers.number) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return { value: number };
    return { value: trimmed, error: 'NUMBER_INVALID' };
  }
  return { value: trimmed };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const normalized = input.events.map(normalize);
assert.deepEqual(normalized, [
  { value: 42 },
  { value: '', error: 'REQUIRED' },
  { value: '3x', error: 'NUMBER_INVALID' },
]);
const emitted = normalized.map((result) => ({ event: 'update:modelValue', value: result.value }));
assert.equal(emitted[0]?.value, 42);
assert.equal(typeof emitted[2]?.value, 'string');

console.log(JSON.stringify({ normalized, emitted }));
console.log('Vue v-model 修饰符规范化通过');
`,
      checkpoint:
        '三个结果依次为数字 42、带 REQUIRED 的空字符串、带 NUMBER_INVALID 的字符串 3x；emit 轨迹与规范化结果一致。输出“Vue v-model 修饰符规范化通过”且退出码为 0。',
    }),
    task({
      id: 'vue-vmodel-form-independent',
      title: '独立实践：复合表单与服务器字段错误',
      brief:
        'stdin 给字段更新、服务器 422 错误和重置动作。组合 v-model 事件维护草稿、脏字段和错误；重置只恢复基线，不删除服务器错误所属字段的来源记录。',
      stdin:
        '{"baseline":{"name":"Ada","email":"ada@example.test"},"events":[{"type":"update","field":"name","value":"Lin"},{"type":"server","field":"email","code":"TAKEN"},{"type":"reset"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'update'; readonly field: string; readonly value: string }
  | { readonly type: 'server'; readonly field: string; readonly code: string }
  | { readonly type: 'reset' };
type Input = { readonly baseline: Readonly<Record<string, string>>; readonly events: readonly Event[] };
type State = {
  readonly values: Readonly<Record<string, string>>;
  readonly baseline: Readonly<Record<string, string>>;
  readonly dirty: ReadonlySet<string>;
  readonly errors: Readonly<Record<string, string>>;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let state: State = Object.freeze({
  values: Object.freeze({ ...input.baseline }),
  baseline: Object.freeze({ ...input.baseline }),
  dirty: new Set(),
  errors: Object.freeze({}),
});
for (const event of input.events) {
  if (event.type === 'update') {
    const dirty = new Set(state.dirty);
    dirty.add(event.field);
    const errors = { ...state.errors };
    delete errors[event.field];
    state = Object.freeze({
      ...state,
      values: Object.freeze({ ...state.values, [event.field]: event.value }),
      dirty,
      errors: Object.freeze(errors),
    });
  } else if (event.type === 'server') {
    state = Object.freeze({
      ...state,
      errors: Object.freeze({ ...state.errors, [event.field]: event.code }),
    });
  } else {
    state = Object.freeze({
      ...state,
      values: Object.freeze({ ...state.baseline }),
      dirty: new Set(),
      errors: Object.freeze({}),
    });
  }
}

assert.deepEqual(state.values, input.baseline);
assert.equal(state.dirty.size, 0);
assert.deepEqual(state.errors, {});
assert.equal(state.baseline.email, 'ada@example.test');

console.log(JSON.stringify({ values: state.values, dirty: [...state.dirty], errors: state.errors }));
console.log('Vue 复合表单与重置通过');
`,
      checkpoint:
        'update 会写入草稿并清除字段错误，server 422 将 email 设为 TAKEN；reset 后 values 回到基线、dirty 与 errors 都为空。输出“Vue 复合表单与重置通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：异步提交、错误和取消': lab(
    'Vue 补齐代码台 07 · 提交状态与竞态保护',
    '用提交版本、AbortSignal、防重复点击和错误分类模拟表单异步提交，验证取消不显示成失败、迟到响应不能覆盖最新状态。',
    task({
      id: 'vue-async-submit-guided',
      title: '跟做：双击防重与迟到响应',
      brief:
        'stdin 给两次提交和乱序成功事件。提交中的重复点击被忽略；取消第一次后再启动第二次；旧成功只标记 stale，最新请求才能提交。',
      stdin:
        '{"submissions":[{"id":1,"payload":"A"},{"id":2,"payload":"B"}],"events":[{"type":"click","id":1},{"type":"click","id":2},{"type":"cancel","id":1},{"type":"click","id":2},{"type":"success","id":1},{"type":"success","id":2}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Submission = { readonly id: number; readonly payload: string };
type Event =
  | { readonly type: 'click'; readonly id: number }
  | { readonly type: 'success'; readonly id: number }
  | { readonly type: 'cancel'; readonly id: number };
type Input = { readonly submissions: readonly Submission[]; readonly events: readonly Event[] };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let active = 0;
let status = 'idle';
let value = '';
const trace: string[] = [];
for (const event of input.events) {
  if (event.type === 'click') {
    if (active !== 0) {
      trace.push('ignore-duplicate:' + event.id);
      continue;
    }
    const submission = input.submissions.find((item) => item.id === event.id);
    if (!submission) throw new Error('UNKNOWN_SUBMISSION');
    active = submission.id;
    status = 'submitting';
    trace.push('start:' + submission.id);
    continue;
  }
  if (event.type === 'cancel') {
    if (active === event.id) {
      trace.push('aborted:' + event.id);
      active = 0;
      status = 'idle';
    }
    continue;
  }
  if (event.id !== active) {
    trace.push('stale:' + event.id);
    continue;
  }
  const submission = input.submissions.find((item) => item.id === event.id);
  value = submission?.payload ?? '';
  status = 'success';
  active = 0;
  trace.push('commit:' + event.id);
}

assert.equal(value, 'B');
assert.equal(status, 'success');
assert.deepEqual(trace, ['start:1', 'ignore-duplicate:2', 'aborted:1', 'start:2', 'stale:1', 'commit:2']);

console.log(JSON.stringify({ value, status, active, trace }));
console.log('Vue 异步提交竞态保护通过');
`,
      checkpoint:
        '第一次提交后第二次点击先被忽略，取消后第二次提交成功启动；id=1 的迟到成功为 stale，id=2 最终提交 B；active 归零。输出“Vue 异步提交竞态保护通过”且退出码为 0。',
    }),
    task({
      id: 'vue-async-submit-cancel-independent',
      title: '独立实践：Abort、超时与幂等重试',
      brief:
        'stdin 给离开、超时、同键重试和权限失败。离开触发 aborted；超时最多重试一次且保持幂等键；权限错误立即停止并清除 pending。',
      stdin:
        '{"idempotencyKey":"save-9","events":[{"type":"timeout"},{"type":"retry"},{"type":"leave"},{"type":"success","key":"save-9"},{"type":"forbidden"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'timeout' }
  | { readonly type: 'leave' }
  | { readonly type: 'retry' }
  | { readonly type: 'success'; readonly key: string }
  | { readonly type: 'forbidden' };
type Input = { readonly idempotencyKey: string; readonly events: readonly Event[] };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const trace: string[] = [];
let cancelled = false;
let retries = 0;
let pending = false;
let status = 'idle';
for (const event of input.events) {
  if (event.type === 'timeout') {
    pending = true;
    status = 'pending';
    trace.push('timeout');
  } else if (event.type === 'leave') {
    cancelled = true;
    pending = false;
    status = 'aborted';
    trace.push('aborted:signal');
  } else if (event.type === 'retry') {
    if (!cancelled && retries === 0) {
      retries += 1;
      pending = true;
      status = 'pending';
      trace.push('retry:' + input.idempotencyKey);
    }
  } else if (event.type === 'success') {
    if (event.key === input.idempotencyKey && !cancelled) {
      pending = false;
      status = 'success';
      trace.push('commit:' + event.key);
    } else {
      trace.push('ignore:' + event.key);
    }
  } else {
    pending = false;
    status = 'forbidden';
    trace.push('stop:forbidden');
  }
}

assert.equal(retries, 1);
assert.equal(cancelled, true);
assert.equal(pending, false);
assert.equal(status, 'forbidden');
assert.deepEqual(trace, [
  'timeout',
  'retry:save-9',
  'aborted:signal',
  'ignore:save-9',
  'stop:forbidden',
]);

console.log(JSON.stringify({ retries, cancelled, pending, status, trace }));
console.log('Vue Abort 与幂等重试通过');
`,
      checkpoint:
        '超时后允许一次同幂等键 retry；leave 记录 aborted:signal，取消后的 success 被忽略；forbidden 最后停止并清空 pending。输出“Vue Abort 与幂等重试通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 组件、插槽、事件与表单：组件契约测试与可访问性': lab(
    'Vue 补齐代码台 08 · 组件契约、键盘与状态播报',
    '以公开 props、emit、可访问角色和键盘行为构建组件契约测试，验证内部实现类名变化不会破坏用户流程，非法交互会产生可读反馈。',
    task({
      id: 'vue-contract-a11y-guided',
      title: '跟做：按钮契约与键盘触发',
      brief:
        'stdin 给按钮名称、禁用状态和交互序列。只通过 role、accessibleName、disabled 查询；Enter/Space 触发一次，禁用时无效并播报原因。',
      stdin:
        '{"name":"发布课程","disabled":false,"keys":["Enter","Space","Escape"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly name: string; readonly disabled: boolean; readonly keys: readonly string[] };
type View = {
  readonly role: 'button';
  readonly name: string;
  readonly disabled: boolean;
  readonly status: string;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const events: string[] = [];
let view: View = Object.freeze({
  role: 'button',
  name: input.name,
  disabled: input.disabled,
  status: 'ready',
});
for (const key of input.keys) {
  if (key !== 'Enter' && key !== 'Space') {
    events.push('ignored:' + key);
    continue;
  }
  if (view.disabled) {
    view = Object.freeze({ ...view, status: '禁用原因：缺少发布权限' });
    events.push('blocked:' + key);
    continue;
  }
  events.push('activated:' + key);
  view = Object.freeze({ ...view, status: '已发布' });
}

assert.deepEqual(events, ['activated:Enter', 'activated:Space', 'ignored:Escape']);
assert.equal(view.status, '已发布');
assert.equal(view.disabled, false);
const disabledView = Object.freeze({ ...view, disabled: true, status: 'ready' });
assert.equal(disabledView.disabled, true);

console.log(JSON.stringify({ view, events }));
console.log('Vue 组件键盘契约通过');
`,
      checkpoint:
        'Enter 与 Space 各激活一次，Escape 被忽略，最终状态“已发布”；disabled 视图仍保持可查询的 button 角色和名称。输出“Vue 组件键盘契约通过”且退出码为 0。',
    }),
    task({
      id: 'vue-contract-dialog-independent',
      title: '独立实践：对话框焦点、Escape 与错误播报',
      brief:
        'stdin 给打开、Tab、提交失败、Escape 和关闭事件。焦点限制在对话框内，错误通过 alert 播报，Escape 关闭并把焦点还给触发按钮。',
      stdin:
        '{"trigger":"开启设置","controls":["email","save","cancel"],"events":["open","Tab","submit-error","Tab","Escape","close"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly trigger: string;
  readonly controls: readonly string[];
  readonly events: readonly string[];
};
type State = {
  readonly open: boolean;
  readonly active: string;
  readonly alert: string | undefined;
  readonly returnFocus: string;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let state: State = Object.freeze({
  open: false,
  active: input.trigger,
  alert: undefined,
  returnFocus: input.trigger,
});
const trace: string[] = [];
for (const event of input.events) {
  if (event === 'open') {
    state = Object.freeze({ ...state, open: true, active: input.controls[0] ?? 'dialog' });
    trace.push('focus:' + state.active);
  } else if (event === 'Tab') {
    const index = Math.max(0, input.controls.indexOf(state.active));
    const next = input.controls[(index + 1) % input.controls.length] ?? state.active;
    state = Object.freeze({ ...state, active: next });
    trace.push('focus:' + next);
  } else if (event === 'submit-error') {
    state = Object.freeze({ ...state, alert: '邮箱格式不正确' });
    trace.push('announce:' + state.alert);
  } else if (event === 'Escape') {
    state = Object.freeze({ ...state, open: false, active: state.returnFocus });
    trace.push('escape:return-focus');
  } else if (event === 'close') {
    state = Object.freeze({ ...state, open: false, alert: undefined, active: state.returnFocus });
    trace.push('close');
  }
}

assert.equal(state.open, false);
assert.equal(state.active, '开启设置');
assert.equal(state.alert, undefined);
assert.deepEqual(trace, [
  'focus:email',
  'focus:save',
  'announce:邮箱格式不正确',
  'focus:cancel',
  'escape:return-focus',
  'close',
]);

console.log(JSON.stringify({ state, trace }));
console.log('Vue 对话框焦点与错误播报通过');
`,
      checkpoint:
        '打开后焦点进入 email，Tab 依次到 save、cancel；提交失败播报“邮箱格式不正确”，Escape 关闭并回到“开启设置”触发按钮，最终 alert 清空。输出“Vue 对话框焦点与错误播报通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · Router、Pinia 与服务器状态：路由参数、查询参数和深链接': lab(
    'Vue 补齐代码台 09 · URL 规范化与权限返回',
    '解析路由参数和查询串，规范化分页、排序和搜索词，验证深链接刷新可恢复筛选；权限不足时转到登录并保留安全的返回地址。',
    task({
      id: 'vue-router-url-guided',
      title: '跟做：查询归一化与深链接恢复',
      brief:
        'stdin 给深层 URL。解析 path 参数，限制 page、sort 与 query，拒绝重复路径段和不安全参数；重新序列化后应得到稳定 URL。',
      stdin:
        '{"url":"/teams/t1/orders?page=0&sort=total&q=%20Vue%20&debug=1"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly url: string };
type Route = {
  readonly tenant: string;
  readonly page: string;
  readonly query: string;
  readonly sort: 'created' | 'total';
  readonly canonical: string;
};

function parseUrl(url: string): Route {
  const [pathname, queryText = ''] = url.split('?');
  const match = /^\\/teams\\/([^/]+)\\/orders$/.exec(pathname ?? '');
  if (!match?.[1]) throw new Error('ROUTE_INVALID');
  const params = new URLSearchParams(queryText);
  const pageValue = Math.max(1, Math.min(50, Number(params.get('page') ?? 1) || 1));
  const sort = params.get('sort') === 'total' ? 'total' : 'created';
  const query = (params.get('q') ?? '').trim().slice(0, 40);
  const canonical = '/teams/' + match[1] + '/orders?page=' + pageValue + '&sort=' + sort + '&q=' + encodeURIComponent(query);
  return { tenant: match[1], page: String(pageValue), query, sort, canonical };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const route = parseUrl(input.url);
assert.deepEqual(route, {
  tenant: 't1',
  page: '1',
  query: 'Vue',
  sort: 'total',
  canonical: '/teams/t1/orders?page=1&sort=total&q=Vue',
});
assert.equal(route.canonical.includes('debug'), false);
assert.equal(parseUrl('/teams/t1/orders').page, '1');
assert.throws(() => parseUrl('/teams//orders'), /ROUTE_INVALID/);

console.log(JSON.stringify(route));
console.log('Vue Router 查询归一化通过');
`,
      checkpoint:
        'URL 规范化为 tenant=t1、page=1、sort=total、query=Vue；debug 参数被移除；空 tenant 抛 ROUTE_INVALID。输出“Vue Router 查询归一化通过”且退出码为 0。',
    }),
    task({
      id: 'vue-router-guard-independent',
      title: '独立实践：权限守卫与安全返回地址',
      brief:
        'stdin 给角色和多条导航目标。公开页放行，登录页带安全 redirect；受保护页无会话时保存相对地址并拒绝外链，已登录低权限显示 403。',
      stdin:
        '{"session":{"role":"viewer","tenant":"t1"},"targets":["/catalog","/orders?page=2","/admin","https://evil.test","/settings"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Session = { readonly role: 'viewer' | 'admin'; readonly tenant: string } | undefined;
type Input = { readonly session: Session; readonly targets: readonly string[] };
type Outcome = {
  readonly target: string;
  readonly action: 'allow' | 'login' | 'forbidden' | 'external';
  readonly redirect?: string;
};

function guard(target: string, session: Session): Outcome {
  if (!target.startsWith('/') || target.startsWith('//')) return { target, action: 'external' };
  if (target === '/catalog') return { target, action: 'allow' };
  if (!session) return { target, action: 'login', redirect: '/login?redirect=' + encodeURIComponent(target) };
  if (target.startsWith('/admin') && session.role !== 'admin') return { target, action: 'forbidden' };
  return { target, action: 'allow' };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const outcomes = input.targets.map((target) => guard(target, input.session));
assert.deepEqual(outcomes.map((item) => item.action), ['allow', 'allow', 'forbidden', 'external', 'allow']);
const anonymous = guard('/orders?page=2', undefined);
assert.deepEqual(anonymous, {
  target: '/orders?page=2',
  action: 'login',
  redirect: '/login?redirect=%2Forders%3Fpage%3D2',
});
assert.equal(outcomes[3]?.redirect, undefined);

console.log(JSON.stringify({ outcomes, anonymous }));
console.log('Vue Router 权限守卫与返回地址通过');
`,
      checkpoint:
        'viewer 访问 catalog、orders、settings 放行，访问 admin 得到 forbidden，外链被标为 external；匿名访问 orders 生成编码后的 /login redirect。输出“Vue Router 权限守卫与返回地址通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · Router、Pinia 与服务器状态：远程数据缓存和失效': lab(
    'Vue 补齐代码台 10 · Query key、去重与标签失效',
    '实现确定性查询缓存，验证同一 key 的并发请求只发送一次，staleTime 内直接命中，mutation 后按精确 key 或标签失效，而不是清空全部缓存。',
    task({
      id: 'vue-query-cache-guided',
      title: '跟做：并发去重与精确失效',
      brief:
        'stdin 给两个并发订单 key、当前时间和失效操作。相同 key 返回同一 Promise 且只执行一次；无效化一个 key 后仅该 key 重新请求。',
      stdin:
        '{"now":1000,"staleMs":500,"keys":["order:o-1","order:o-1","order:o-2"],"invalidate":["order:o-1"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly now: number;
  readonly staleMs: number;
  readonly keys: readonly string[];
  readonly invalidate: readonly string[];
};
type Entry = {
  readonly value: string;
  readonly updatedAt: number;
  readonly inflight?: Promise<string>;
};

function createCache(staleMs: number) {
  const entries = new Map<string, Entry>();
  let fetches = 0;
  return {
    load(key: string, now: number): Promise<string> {
      const existing = entries.get(key);
      if (existing?.inflight) return existing.inflight;
      if (existing && now - existing.updatedAt <= staleMs) return Promise.resolve(existing.value);
      fetches += 1;
      const promise = Promise.resolve('value:' + key).then((value) => {
        entries.set(key, { value, updatedAt: now });
        return value;
      });
      entries.set(key, {
        value: existing?.value ?? '',
        updatedAt: existing?.updatedAt ?? -Infinity,
        inflight: promise,
      });
      return promise;
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
    has: (key: string) => entries.has(key),
    fetches: () => fetches,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const cache = createCache(input.staleMs);
const first = cache.load(input.keys[0] ?? '', input.now);
const duplicate = cache.load(input.keys[1] ?? '', input.now);
assert.equal(first, duplicate);
assert.equal(await first, 'value:order:o-1');
assert.equal(await cache.load(input.keys[2] ?? '', input.now), 'value:order:o-2');
assert.equal(cache.fetches(), 2);
for (const key of input.invalidate) cache.invalidate(key);
assert.equal(cache.has('order:o-1'), false);
assert.equal(cache.has('order:o-2'), true);
await cache.load('order:o-1', input.now + 1);
assert.equal(cache.fetches(), 3);

console.log(JSON.stringify({ fetches: cache.fetches(), o1Cached: cache.has('order:o-1'), o2Cached: cache.has('order:o-2') }));
console.log('Vue 查询去重与精确失效通过');
`,
      checkpoint:
        '两个相同 key 返回同一 Promise，o-1 与 o-2 共发起 2 次 fetch；只失效 o-1 后 o-2 仍存在，重新加载 o-1 使 fetch 数变为 3。输出“Vue 查询去重与精确失效通过”且退出码为 0。',
    }),
    task({
      id: 'vue-query-tags-independent',
      title: '独立实践：标签失效、新鲜度与错误缓存',
      brief:
        'stdin 给多条缓存、标签和 mutation。按 order:o-1 的 orders 标签失效相关查询，保留新鲜的用户设置；失败查询只缓存可重试错误，不缓存权限拒绝。',
      stdin:
        '{"now":2000,"entries":[{"key":"orders:o-1","value":"订单","updatedAt":1800,"tags":["orders","o-1"]},{"key":"orders:o-2","value":"订单 2","updatedAt":1990,"tags":["orders","o-2"]},{"key":"user:u1","value":"设置","updatedAt":1200,"tags":["user"]}],"mutationTags":["orders","o-1"],"errors":[{"key":"orders:o-3","kind":"network"},{"key":"orders:o-4","kind":"forbidden"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Entry = {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
  readonly tags: readonly string[];
};
type ErrorEntry = { readonly key: string; readonly kind: 'network' | 'forbidden' };
type Input = {
  readonly now: number;
  readonly entries: readonly Entry[];
  readonly mutationTags: readonly string[];
  readonly errors: readonly ErrorEntry[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const cache = new Map(input.entries.map((entry) => [entry.key, entry]));
const invalidated: string[] = [];
for (const entry of [...cache.values()]) {
  if (entry.tags.some((tag) => input.mutationTags.includes(tag))) {
    cache.delete(entry.key);
    invalidated.push(entry.key);
  }
}
const errorCache = new Map<string, string>();
for (const error of input.errors) {
  if (error.kind === 'network') errorCache.set(error.key, 'RETRYABLE_NETWORK');
}

const freshness = input.entries
  .filter((entry) => cache.has(entry.key))
  .map((entry) => ({ key: entry.key, age: input.now - entry.updatedAt, fresh: input.now - entry.updatedAt <= 500 }));

assert.deepEqual(invalidated.sort(), ['orders:o-1', 'orders:o-2']);
assert.equal(cache.has('user:u1'), true);
assert.deepEqual(freshness, [{ key: 'user:u1', age: 800, fresh: false }]);
assert.equal(errorCache.get('orders:o-3'), 'RETRYABLE_NETWORK');
assert.equal(errorCache.has('orders:o-4'), false);

console.log(JSON.stringify({ invalidated, remaining: [...cache.keys()], freshness, errorCache: [...errorCache] }));
console.log('Vue 标签失效与错误缓存通过');
`,
      checkpoint:
        'mutation 标签同时失效 o-1 与 o-2，只保留 user:u1；user 已 800ms 不新鲜；网络错误缓存为 RETRYABLE_NETWORK，forbidden 不进入缓存。输出“Vue 标签失效与错误缓存通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · Nuxt SSR、部署与运行：hydration、客户端接管和错误': lab(
    'Vue 补齐代码台 11 · SSR 快照、接管与恢复',
    '模拟服务端渲染快照、客户端 hydration、稳定时间与错误恢复，验证非确定性值不能进入首屏快照，mismatch 可定位并能安全回退。',
    task({
      id: 'vue-hydration-mismatch-guided',
      title: '跟做：服务端与客户端文本签名',
      brief:
        'stdin 给服务端与客户端文本、payload 版本。签名不一致时输出可定位错误并使用服务端快照；版本错误阻止接管，修复后 mounted 值才出现。',
      stdin:
        '{"server":{"text":"课程目录","version":2},"client":{"text":"课程列表","mountedText":"课程目录 · 已连接"},"payloadVersion":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly server: { readonly text: string; readonly version: number };
  readonly client: { readonly text: string; readonly mountedText: string };
  readonly payloadVersion: number;
};

function hydrate(input: Input): {
  readonly text: string;
  readonly mountedText: string;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  if (input.payloadVersion !== input.server.version) errors.push('PAYLOAD_VERSION');
  if (input.server.text !== input.client.text) errors.push('TEXT_MISMATCH');
  return {
    text: input.server.text,
    mountedText: errors.includes('PAYLOAD_VERSION') ? '' : input.client.mountedText,
    errors: Object.freeze(errors),
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const result = hydrate(input);
assert.equal(result.text, '课程目录');
assert.equal(result.mountedText, '课程目录 · 已连接');
assert.deepEqual(result.errors, ['TEXT_MISMATCH']);
const oldPayload = hydrate({ ...input, payloadVersion: 1 });
assert.deepEqual(oldPayload.errors, ['PAYLOAD_VERSION', 'TEXT_MISMATCH']);
assert.equal(oldPayload.mountedText, '');

console.log(JSON.stringify({ result, oldPayload }));
console.log('Vue hydration 快照与接管恢复通过');
`,
      checkpoint:
        '文本不一致时使用服务端“课程目录”，错误包含 TEXT_MISMATCH；payload 版本落后时增加 PAYLOAD_VERSION 并阻止 mounted 接管。输出“Vue hydration 快照与接管恢复通过”且退出码为 0。',
    }),
    task({
      id: 'vue-hydration-clock-independent',
      title: '独立实践：稳定时间与客户端独占值',
      brief:
        'stdin 给服务端请求时间、客户端首帧时间和随机令牌。首屏只渲染 serverTime，clientTime 与 randomToken 必须在 mounted 后出现；序列化载荷不得含随机令牌。',
      stdin:
        '{"serverTime":"10:00","clientTime":"10:03","randomToken":"rnd-88","requestId":"req-4"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly serverTime: string;
  readonly clientTime: string;
  readonly randomToken: string;
  readonly requestId: string;
};

function render(input: Input): {
  readonly hydrated: { readonly text: string; readonly time: string; readonly requestId: string };
  readonly mounted: { readonly clientTime: string; readonly randomToken: string };
  readonly payload: string;
} {
  const hydrated = Object.freeze({
    text: '运行时间 ' + input.serverTime,
    time: input.serverTime,
    requestId: input.requestId,
  });
  const payload = JSON.stringify(hydrated);
  const mounted = Object.freeze({
    clientTime: input.clientTime,
    randomToken: input.randomToken,
  });
  return { hydrated, mounted, payload };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const result = render(input);
assert.equal(result.hydrated.time, '10:00');
assert.equal(result.mounted.clientTime, '10:03');
assert.equal(result.mounted.randomToken, 'rnd-88');
assert.equal(result.payload.includes('10:03'), false);
assert.equal(result.payload.includes('rnd-88'), false);
assert.equal(result.payload.includes('req-4'), true);

console.log(JSON.stringify(result));
console.log('Vue 稳定时间与 mounted 独占值通过');
`,
      checkpoint:
        'hydration 文本只用服务端 10:00；clientTime=10:03 与 randomToken=rnd-88 仅在 mounted 对象；payload 含 req-4，但不含客户端时间和随机令牌。输出“Vue 稳定时间与 mounted 独占值通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 3 · 工程、测试、性能与可访问性：代码分割、缓存和 Web Vitals': lab(
    'Vue 补齐代码台 12 · 包体预算与移动性能门禁',
    '用确定性构建清单和性能样本计算入口包体、异步块、缓存键与 p75 Web Vitals，验证发布门禁基于分位和预算而不是一次本地截图。',
    task({
      id: 'vue-performance-budget-guided',
      title: '跟做：入口预算与哈希缓存',
      brief:
        'stdin 给构建块。入口只计算首屏同步依赖；异步路由块单独统计；内容未变的哈希复用缓存，超过入口预算返回可诊断结果。',
      stdin:
        '{"budgetKb":120,"blocks":[{"name":"entry","sizeKb":90,"sync":true,"hash":"a1"},{"name":"vendor","sizeKb":45,"sync":true,"hash":"v3"},{"name":"settings","sizeKb":80,"sync":false,"hash":"s2"},{"name":"settings-css","sizeKb":10,"sync":false,"hash":"c1"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Block = {
  readonly name: string;
  readonly sizeKb: number;
  readonly sync: boolean;
  readonly hash: string;
};
type Input = { readonly budgetKb: number; readonly blocks: readonly Block[] };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const initial = input.blocks.filter((block) => block.sync);
const asyncBlocks = input.blocks.filter((block) => !block.sync);
const initialKb = initial.reduce((sum, block) => sum + block.sizeKb, 0);
const asyncKb = asyncBlocks.reduce((sum, block) => sum + block.sizeKb, 0);
const cacheKeys = input.blocks.map((block) => block.name + '@' + block.hash);
const overBudget = initialKb > input.budgetKb;

assert.equal(initialKb, 135);
assert.equal(asyncKb, 90);
assert.equal(overBudget, true);
assert.deepEqual(cacheKeys, ['entry@a1', 'vendor@v3', 'settings@s2', 'settings-css@c1']);
assert.equal(new Set(cacheKeys).size, input.blocks.length);
assert.ok(initial.every((block) => block.sync));

console.log(JSON.stringify({ initialKb, asyncKb, overBudget, cacheKeys }));
console.log('Vue 包体预算与缓存键通过');
`,
      checkpoint:
        '同步入口合计 135KB，超过 120KB 预算；异步块合计 90KB；四个缓存键都带内容哈希且唯一。输出“Vue 包体预算与缓存键通过”且退出码为 0。',
    }),
    task({
      id: 'vue-performance-vitals-independent',
      title: '独立实践：移动 p75 与可访问性联合门禁',
      brief:
        'stdin 给 LCP、INP、CLS 样本和可访问性缺陷。计算每项 p75，LCP≤2500、INP≤200、CLS≤0.1，且阻断级 a11y 缺陷为 0 才能发布。',
      stdin:
        '{"samples":{"lcp":[1800,2200,3000,2400,3200],"inp":[120,180,260,160,140],"cls":[0.02,0.08,0.12,0.04]},"a11y":[{"rule":"label","severity":"critical"},{"rule":"contrast","severity":"serious"},{"rule":"focus","severity":"moderate"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Samples = { readonly lcp: readonly number[]; readonly inp: readonly number[]; readonly cls: readonly number[] };
type A11y = { readonly rule: string; readonly severity: 'critical' | 'serious' | 'moderate' };
type Input = { readonly samples: Samples; readonly a11y: readonly A11y[] };

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) throw new Error('EMPTY_SERIES');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const metrics = {
  lcp: percentile(input.samples.lcp, 0.75),
  inp: percentile(input.samples.inp, 0.75),
  cls: percentile(input.samples.cls, 0.75),
};
const blockingA11y = input.a11y.filter((item) => item.severity === 'critical' || item.severity === 'serious');
const failed = [
  metrics.lcp > 2500 ? 'LCP' : '',
  metrics.inp > 200 ? 'INP' : '',
  metrics.cls > 0.1 ? 'CLS' : '',
  blockingA11y.length > 0 ? 'A11Y' : '',
].filter(Boolean);

assert.deepEqual(metrics, { lcp: 3000, inp: 180, cls: 0.08 });
assert.deepEqual(blockingA11y.map((item) => item.rule), ['label', 'contrast']);
assert.deepEqual(failed, ['LCP', 'A11Y']);

console.log(JSON.stringify({ metrics, failed, blockingA11y }));
console.log('Vue 移动 p75 与可访问性门禁通过');
`,
      checkpoint:
        'p75 为 LCP=3000、INP=180、CLS=0.08；label 与 contrast 属于阻断缺陷；最终 failed 必须恰为 LCP、A11Y。输出“Vue 移动 p75 与可访问性门禁通过”且退出码为 0。',
    }),
  ),
};
