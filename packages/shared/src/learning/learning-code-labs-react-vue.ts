import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const reactVueRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'React/Vue 语义模拟 · TypeScript 类型擦除',
  installSteps: [
    '使用 Node.js 24 执行：node --experimental-strip-types main.ts。',
    '本代码台不导入 React、Vue 或第三方包；所有框架机制均由任务内的确定性类型与最小运行时模拟。',
    '先运行给定 stdin，再按 checkpoint 修改输入或实现；通过标准输出、断言与退出码判断结果。',
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
  ...reactVueRuntime,
  practice,
  apply,
});

/**
 * React/Vue 的非 DOM 语义实验室。
 *
 * 实验验证 reducer、依赖追踪、缓存、路由、调度、SSR 快照等可以由普通
 * TypeScript 诚实证明的契约；它们不声称执行真实组件渲染，也不替代浏览器
 * 中的 DOM、hydration、可访问性和视觉验收。
 */
export const LEARNING_CODE_LABS_REACT_VUE: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:React · 状态、表单与不可变更新：不可变对象和数组更新': lab(
    'React 代码台 01 · 不可变列表与嵌套实体',
    '用类型和运行时断言证明数组、实体及嵌套标签的更新不会修改旧状态，再建立一个可按实体身份合并的乐观更新日志。',
    {
      id: 'react-immutable-list-guided',
      title: '跟做：替换一个实体而不污染快照',
      brief:
        'stdin 提供课程行和要修改的 lessonId。只替换命中的行并新增标签，同时冻结旧快照；断言新数组、新对象出现，未命中对象保持引用，旧快照完全不变。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Lesson = {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
};

type Payload = {
  readonly lessons: readonly Lesson[];
  readonly lessonId: string;
  readonly nextTitle: string;
  readonly addTag: string;
};

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const before = payload.lessons;
const frozenBefore = Object.freeze(before.map((lesson) =>
  Object.freeze({ ...lesson, tags: Object.freeze([...lesson.tags]) }),
));
const untouched = frozenBefore.find((lesson) => lesson.id !== payload.lessonId);

function updateLesson(
  lessons: readonly Lesson[],
  lessonId: string,
  nextTitle: string,
  addTag: string,
): readonly Lesson[] {
  let found = false;
  const next = lessons.map((lesson) => {
    if (lesson.id !== lessonId) return lesson;
    found = true;
    return Object.freeze({
      ...lesson,
      title: nextTitle,
      tags: Object.freeze([...lesson.tags, addTag]),
    });
  });
  if (!found) throw new Error('lessonId 不存在');
  return Object.freeze(next);
}

const after = updateLesson(frozenBefore, payload.lessonId, payload.nextTitle, payload.addTag);
const changed = after.find((lesson) => lesson.id === payload.lessonId);
const oldChanged = frozenBefore.find((lesson) => lesson.id === payload.lessonId);
assert.ok(changed && oldChanged);
assert.notEqual(after, frozenBefore);
assert.notEqual(changed, oldChanged);
assert.notEqual(changed.tags, oldChanged.tags);
assert.ok(changed.tags.includes(payload.addTag));
assert.equal(oldChanged.title, before.find((lesson) => lesson.id === payload.lessonId)?.title);
if (untouched) assert.equal(after.find((lesson) => lesson.id === untouched.id), untouched);

console.log(JSON.stringify({ oldTitle: oldChanged.title, newTitle: changed.title, oldTags: oldChanged.tags, newTags: changed.tags }));
console.log('不可变实体更新断言通过');
`,
      },
      stdin:
        '{"lessons":[{"id":"l1","title":"状态快照","tags":["react"]},{"id":"l2","title":"列表身份","tags":["key"]}],"lessonId":"l1","nextTitle":"状态快照与更新","addTag":"immutable"}',
      checkpoint:
        '输出旧标题“状态快照”、新标题“状态快照与更新”，旧标签仍只有 react，新标签追加 immutable；`不可变实体更新断言通过` 出现且退出码为 0。把实现改成直接 push 或直接改 title 时，旧快照断言必须失败。',
    },
    {
      id: 'react-immutable-list-independent',
      title: '独立实践：合并带版本号的乐观更新',
      brief:
        'stdin 给出服务端快照和乱序到达的本地操作。按实体 id 逐次生成不可变新快照，只应用高于已确认版本的字段；最后输出每个实体的字段来源，禁止原地修改输入。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly title: string; readonly version: number };
type Patch = { readonly id: string; readonly title: string; readonly version: number };
type Payload = { readonly rows: readonly Row[]; readonly patches: readonly Patch[] };

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const original = payload.rows.map((row) => Object.freeze({ ...row }));
const originalById = new Map(original.map((row) => [row.id, row]));
let current: readonly Row[] = Object.freeze([...original]);
const applied: string[] = [];

for (const patch of payload.patches) {
  const existing = current.find((row) => row.id === patch.id);
  if (!existing) throw new Error('补丁引用未知实体');
  if (patch.version <= existing.version) {
    applied.push(patch.id + ':ignored:' + patch.version);
    continue;
  }
  current = Object.freeze(current.map((row) =>
    row.id === patch.id
      ? Object.freeze({ ...row, title: patch.title, version: patch.version })
      : row,
  ));
  applied.push(patch.id + ':applied:' + patch.version);
}

for (const row of current) {
  const old = originalById.get(row.id);
  assert.ok(old);
  if (old.title !== row.title) {
    assert.notEqual(old, row);
    assert.equal(old.title, payload.rows.find((item) => item.id === row.id)?.title);
  }
}
assert.notEqual(current, original);
assert.deepEqual(applied, ['a:applied:2', 'b:applied:4', 'a:ignored:2']);
assert.equal(current.find((row) => row.id === 'a')?.version, 2);
assert.equal(current.find((row) => row.id === 'b')?.version, 4);

console.log(JSON.stringify({ rows: current, applied }));
console.log('乐观补丁版本合并通过');
`,
      },
      stdin:
        '{"rows":[{"id":"a","title":"旧 A","version":1},{"id":"b","title":"旧 B","version":3}],"patches":[{"id":"a","title":"新 A","version":2},{"id":"b","title":"新 B","version":4},{"id":"a","title":"迟到 A","version":2}]}',
      checkpoint:
        '输出 a 的标题“新 A”、版本 2，b 的标题“新 B”、版本 4；应用日志依次为 a:applied:2、b:applied:4、a:ignored:2；旧输入三行仍保持原标题。出现 `乐观补丁版本合并通过` 且退出码为 0。',
    },
  ),
  'programming:React · 状态、表单与不可变更新：Reducer 与联合状态机': lab(
    'React 代码台 02 · Reducer 状态机与非法转场',
    '从判别联合动作推导 reducer，验证每次转场只能产生合法状态，并将失败作为状态而不是抛在渲染函数中。',
    {
      id: 'react-reducer-machine-guided',
      title: '跟做：订单 reducer 的封闭转场',
      brief:
        'stdin 给出初始状态和动作序列。实现 draft → submitted → paid 的 reducer；重复提交、未提交直接支付和非法承载字段必须被拒绝，并保留可诊断错误。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type State =
  | { readonly status: 'draft'; readonly total: number }
  | { readonly status: 'submitted'; readonly total: number; readonly orderId: string }
  | { readonly status: 'paid'; readonly total: number; readonly orderId: string; readonly paidAt: number }
  | { readonly status: 'rejected'; readonly reason: string };

type Action =
  | { readonly type: 'submit'; readonly orderId: string }
  | { readonly type: 'pay'; readonly paidAt: number }
  | { readonly type: 'reset' };

type Payload = { readonly total: number; readonly actions: readonly Action[] };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function reducer(state: State, action: Action): State {
  if (state.status === 'rejected' && action.type !== 'reset') return state;
  switch (action.type) {
    case 'submit':
      if (state.status !== 'draft') return { status: 'rejected', reason: 'submit-from-' + state.status };
      if (action.orderId.trim() === '') return { status: 'rejected', reason: 'empty-order-id' };
      return Object.freeze({ status: 'submitted', total: state.total, orderId: action.orderId });
    case 'pay':
      if (state.status !== 'submitted') return { status: 'rejected', reason: 'pay-from-' + state.status };
      if (!Number.isFinite(action.paidAt) || action.paidAt <= 0) {
        return { status: 'rejected', reason: 'invalid-paid-at' };
      }
      return Object.freeze({
        status: 'paid',
        total: state.total,
        orderId: state.orderId,
        paidAt: action.paidAt,
      });
    case 'reset':
      return Object.freeze({ status: 'draft', total: state.total });
  }
}

const trace: State[] = [];
let state: State = Object.freeze({ status: 'draft', total: payload.total });
for (const action of payload.actions) {
  state = reducer(state, action);
  trace.push(state);
}

assert.equal(trace.length, 5);
assert.equal(trace[0]?.status, 'submitted');
assert.equal(trace[1]?.status, 'rejected');
assert.equal(trace[2]?.status, 'draft');
assert.equal(trace[3]?.status, 'rejected');
assert.equal(trace[4]?.status, 'draft');
assert.equal(trace[1]?.status === 'rejected' ? trace[1].reason : '', 'submit-from-submitted');
assert.equal(trace[3]?.status === 'rejected' ? trace[3].reason : '', 'pay-from-draft');

console.log(JSON.stringify(trace));
console.log('reducer 非法转场断言通过');
`,
      },
      stdin:
        '{"total":12900,"actions":[{"type":"submit","orderId":"ord-7"},{"type":"submit","orderId":"ord-7"},{"type":"reset"},{"type":"pay","paidAt":1730000000000},{"type":"reset"}]}',
      checkpoint:
        '五个状态依次为 submitted、rejected、draft、rejected、draft；第二项 reason 是 submit-from-submitted，第四项是 pay-from-draft。输出 `reducer 非法转场断言通过` 且退出码为 0。',
    },
    {
      id: 'react-reducer-machine-independent',
      title: '独立实践：上传状态的判别联合 reducer',
      brief:
        '实现 idle、uploading、success、error 四态 reducer。网络进度只允许在 uploading 中更新；取消必须携带当前 requestId，迟到 success/error 只能忽略或记录为过期事件。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type UploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly requestId: number; readonly progress: number }
  | { readonly kind: 'success'; readonly requestId: number; readonly url: string }
  | { readonly kind: 'error'; readonly requestId: number; readonly message: string };

type UploadAction =
  | { readonly type: 'start'; readonly requestId: number }
  | { readonly type: 'progress'; readonly requestId: number; readonly value: number }
  | { readonly type: 'success'; readonly requestId: number; readonly url: string }
  | { readonly type: 'error'; readonly requestId: number; readonly message: string }
  | { readonly type: 'cancel'; readonly requestId: number; readonly reason: string };

type Payload = { readonly actions: readonly UploadAction[] };
const { actions } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const audit: string[] = [];

function reducer(state: UploadState, action: UploadAction): UploadState {
  if (action.type === 'start') {
    if (state.kind === 'uploading') return state;
    return Object.freeze({ kind: 'uploading', requestId: action.requestId, progress: 0 });
  }
  if (state.kind !== 'uploading' || state.requestId !== action.requestId) {
    audit.push('stale:' + action.type + ':' + action.requestId);
    return state;
  }
  if (action.type === 'progress') {
    if (action.value < state.progress || action.value > 100) {
      audit.push('bad-progress:' + action.value);
      return state;
    }
    return Object.freeze({ ...state, progress: action.value });
  }
  if (action.type === 'success') {
    return Object.freeze({ kind: 'success', requestId: action.requestId, url: action.url });
  }
  if (action.type === 'error') {
    return Object.freeze({ kind: 'error', requestId: action.requestId, message: action.message });
  }
  audit.push('cancelled:' + state.requestId + ':' + action.reason);
  return Object.freeze({ kind: 'idle' });
}

let state: UploadState = Object.freeze({ kind: 'idle' });
for (const action of actions) state = reducer(state, action);

assert.equal(state.kind, 'success');
assert.equal(state.kind === 'success' ? state.requestId : 0, 3);
assert.equal(state.kind === 'success' ? state.url : '', '/files/report-v3');
assert.deepEqual(audit, [
  'cancelled:1:user-retry',
  'cancelled:2:user-retry',
  'stale:success:2',
]);

console.log(JSON.stringify({ state, audit }));
console.log('上传状态机迟到事件隔离通过');
`,
      },
      stdin:
        '{"actions":[{"type":"start","requestId":1},{"type":"cancel","requestId":1,"reason":"user-retry"},{"type":"start","requestId":2},{"type":"progress","requestId":2,"value":60},{"type":"cancel","requestId":2,"reason":"user-retry"},{"type":"start","requestId":3},{"type":"success","requestId":2,"url":"/files/report-v2"},{"type":"success","requestId":3,"url":"/files/report-v3"}]}',
      checkpoint:
        '最终 success 的 requestId 为 3，url 为 /files/report-v3；审计记录保留两次主动取消，旧请求 2 的 success 被标为 stale。输出 `上传状态机迟到事件隔离通过` 且退出码为 0。',
    },
  ),
  'programming:React · Hooks、Effect 与并发渲染：依赖、闭包和清理函数': lab(
    'React 代码台 03 · Effect 依赖与清理生命周期',
    '显式模拟依赖比较、闭包捕获、清理函数和过期响应，验证遗漏依赖不是“优化”，而是可观察的资源泄漏与竞态来源。',
    {
      id: 'react-effect-deps-guided',
      title: '跟做：依赖变化时先清理旧订阅',
      brief:
        'stdin 给出主题、订阅请求 id 和渲染批次。每次 effect 启动时捕获当批 requestId，依赖变化先执行上一批 cleanup；断言旧请求被取消，且旧 success 不能写入当前状态。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Render = {
  readonly id: number;
  readonly topic: string;
  readonly locale: string;
  readonly lateResponseId: number;
};
type Payload = { readonly renders: readonly Render[] };

const { renders } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
let active: { readonly id: number; readonly deps: readonly string[] } | undefined;
let committed: string | undefined;

function sameDeps(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

for (const render of renders) {
  const deps = [render.topic, render.locale] as const;
  const shouldRun = active === undefined || !sameDeps(active.deps, deps);
  if (!shouldRun) {
    events.push('skip:' + render.id);
    continue;
  }
  if (active) events.push('cleanup:' + active.id);
  active = { id: render.id, deps };
  events.push('start:' + render.id + ':' + render.topic + ':' + render.locale);

  const capturedId = render.id;
  const responseId = render.lateResponseId;
  if (responseId === capturedId) {
    committed = render.topic + '/' + render.locale;
    events.push('commit:' + capturedId);
  } else {
    events.push('ignore-stale:' + responseId + ':in-' + capturedId);
  }
}

assert.deepEqual(events, [
  'start:1:react:zh',
  'commit:1',
  'cleanup:1',
  'start:2:react:en',
  'ignore-stale:1:in-2',
  'cleanup:2',
  'start:3:vue:en',
  'ignore-stale:2:in-3',
]);
assert.equal(committed, 'react/zh');
assert.notEqual(active, undefined);

console.log(JSON.stringify({ events, committed, active }));
console.log('Effect 依赖与清理顺序通过');
`,
      },
      stdin:
        '{"renders":[{"id":1,"topic":"react","locale":"zh","lateResponseId":1},{"id":2,"topic":"react","locale":"en","lateResponseId":1},{"id":3,"topic":"vue","locale":"en","lateResponseId":2}]}',
      checkpoint:
        '事件依次启动 1、提交 1、清理 1、启动 2、忽略旧响应 1、清理 2、启动 3、忽略旧响应 2；最终 committed 仍为 react/zh。输出 `Effect 依赖与清理顺序通过` 且退出码为 0。',
    },
    {
      id: 'react-effect-deps-independent',
      title: '独立实践：发现缺失依赖与陈旧闭包',
      brief:
        'stdin 给出 effect 源码所读取的变量、声明的依赖数组和三次渲染值。计算缺失依赖，模拟使用首帧闭包读取当前 render 的差异，并输出可执行的修复建议。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Render = { readonly id: number; readonly values: Readonly<Record<string, string>> };
type Payload = {
  readonly reads: readonly string[];
  readonly deps: readonly string[];
  readonly renders: readonly Render[];
};

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const missing = payload.reads.filter((name) => !payload.deps.includes(name));
const staleClosure = payload.renders.map((render) => {
  const captured = payload.deps[0] ? payload.renders[0]?.values[payload.deps[0]] : undefined;
  const current = payload.deps[0] ? render.values[payload.deps[0]] : undefined;
  return {
    renderId: render.id,
    dependency: payload.deps[0],
    captured,
    current,
    stale: captured !== current,
  };
});

function stableKey(values: Readonly<Record<string, string>>): string {
  return Object.keys(values).sort().map((key) => key + '=' + values[key]).join('|');
}

assert.deepEqual(missing, ['tenantId', 'query']);
assert.deepEqual(staleClosure.map((item) => item.stale), [false, true, true]);
assert.equal(stableKey(payload.renders[2]?.values ?? {}), 'page=2|query=react|tenantId=t2');
assert.ok(missing.includes('tenantId'));

console.log(JSON.stringify({ missing, staleClosure, proposedDeps: [...payload.reads].sort() }));
console.log('Effect 缺失依赖与陈旧闭包分析通过');
`,
      },
      stdin:
        '{"reads":["tenantId","page","query"],"deps":["page"],"renders":[{"id":1,"values":{"tenantId":"t1","page":"1","query":"react"}},{"id":2,"values":{"tenantId":"t2","page":"2","query":"react"}},{"id":3,"values":{"tenantId":"t2","page":"2","query":"react"}}]}',
      checkpoint:
        'missing 必须恰为 tenantId、query；stale 序列为 false、true、true。第三帧 page 仍是 2，但首帧闭包捕获的是 1，说明仅看声明依赖会长期使用陈旧值。输出 `Effect 缺失依赖与陈旧闭包分析通过` 且退出码为 0。',
    },
  ),
  'programming:React · Hooks、Effect 与并发渲染：并发渲染、转场和可中断工作': lab(
    'React 代码台 04 · 可中断渲染与紧急更新',
    '用位掩码 lane、时间片让出和重入工作循环模拟并发渲染，观察紧急输入如何在长 transition 完成前提交。',
    {
      id: 'react-transition-scheduler-guided',
      title: '跟做：时间片耗尽时保存并恢复工作',
      brief:
        'stdin 给出每个工作单元耗时和帧预算。工作循环在每个单元后检查预算；超预算时保存游标，紧急输入到达后先完成紧急 lane，再恢复原 transition。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Work = { readonly unit: string; readonly cost: number; readonly lane: 1 | 4 };
type Payload = { readonly units: readonly Work[]; readonly frameBudget: number; readonly urgentAfterUnit: number };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const log: string[] = [];
const committed: string[] = [];
let cursor = 0;
let spent = 0;
let yielded = false;

while (cursor < payload.units.length) {
  const unit = payload.units[cursor];
  if (!unit) break;
  spent += unit.cost;
  log.push('run:' + unit.unit + ':lane' + unit.lane);
  cursor += 1;

  if (cursor === payload.urgentAfterUnit && !yielded) {
    yielded = true;
    log.push('urgent-arrives:yield-at:' + unit.unit);
    committed.push('urgent-input');
  }
  if (spent >= payload.frameBudget && cursor < payload.units.length) {
    log.push('yield:resume-at:' + cursor);
    spent = 0;
  }
}
committed.push('transition-result');

const urgentCommitIndex = log.indexOf('urgent-arrives:yield-at:' + payload.units[payload.urgentAfterUnit - 1]?.unit);
const transitionEndIndex = log.lastIndexOf('run:' + payload.units[payload.units.length - 1]?.unit + ':lane1');
assert.ok(urgentCommitIndex > 0);
assert.ok(transitionEndIndex > urgentCommitIndex);
assert.deepEqual(committed, ['urgent-input', 'transition-result']);
assert.equal(cursor, payload.units.length);
assert.ok(log.some((line) => line.startsWith('yield:resume-at:')));

console.log(JSON.stringify({ log, committed }));
console.log('并发时间片让出与紧急提交通过');
`,
      },
      stdin:
        '{"frameBudget":6,"urgentAfterUnit":2,"units":[{"unit":"parse-filters","cost":2,"lane":4},{"unit":"fetch-rows","cost":2,"lane":4},{"unit":"build-rows","cost":3,"lane":4},{"unit":"paint-list","cost":2,"lane":4},{"unit":"urgent-keystroke","cost":1,"lane":1}]}',
      checkpoint:
        '日志必须在 parse-filters 后出现紧急提交，并在 build-rows 等阶段出现 yield:resume-at；committed 依次为 urgent-input、transition-result。输出 `并发时间片让出与紧急提交通过` 且退出码为 0。',
    },
    {
      id: 'react-transition-scheduler-independent',
      title: '独立实践：优先级 lane 合并与过期检查',
      brief:
        '实现简化 lane 调度器：合并待处理位掩码，总是先选最高优先级，低优先级长时间未执行则标记过期并可抢占。stdin 给出到达时间和到期时间，输出每次选择原因。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Priority = 1 | 2 | 4;
type Update = { readonly id: string; readonly lane: Priority; readonly arrival: number; readonly expires: number };
type Payload = { readonly updates: readonly Update[]; readonly ticks: readonly number[] };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

let pending = 0;
const events: Array<{ tick: number; chosen: string; reason: string; mask: number }> = [];
const remaining = [...payload.updates];

for (const tick of payload.ticks) {
  for (const update of payload.updates) {
    if (update.arrival === tick) pending |= update.lane;
  }
  const ready = remaining.filter((update) => update.arrival <= tick && (pending & update.lane) !== 0);
  if (ready.length === 0) {
    events.push({ tick, chosen: 'idle', reason: 'no-work', mask: pending });
    continue;
  }
  const expired = ready.filter((update) => tick >= update.expires);
  const pool = expired.length > 0 ? expired : ready;
  const chosen = pool.toSorted((left, right) =>
    left.lane - right.lane || left.arrival - right.arrival || left.id.localeCompare(right.id),
  )[0];
  if (!chosen) throw new Error('ready 非空却没有候选');
  const sameLane = ready.filter((update) => update.lane === chosen.lane);
  pending &= ~chosen.lane;
  const index = remaining.findIndex((update) => update.id === chosen.id);
  if (index >= 0) remaining.splice(index, 1);
  events.push({
    tick,
    chosen: chosen.id,
    reason: expired.length > 0 ? 'expired-first' : sameLane.length > 1 ? 'priority-merge' : 'highest-priority',
    mask: pending,
  });
}

assert.deepEqual(events.map((event) => event.chosen), ['urgent', 'transition-old', 'transition-new', 'idle']);
assert.equal(events[1]?.reason, 'expired-first');
assert.equal(events[2]?.reason, 'highest-priority');
assert.equal(events[3]?.mask, 0);

console.log(JSON.stringify(events));
console.log('lane 优先级与过期调度通过');
`,
      },
      stdin:
        '{"updates":[{"id":"transition-old","lane":4,"arrival":2,"expires":3},{"id":"transition-new","lane":2,"arrival":2,"expires":9},{"id":"urgent","lane":1,"arrival":2,"expires":10}],"ticks":[2,3,4,5]}',
      checkpoint:
        '调度顺序必须为 urgent、transition-old、transition-new、idle；第 3 tick 选择 transition-old 的原因必须是 expired-first，下一 tick 才处理 transition-new；最终 pending mask 为 0。输出 `lane 优先级与过期调度通过` 且退出码为 0。',
    },
  ),
  'programming:React · Router、Query 与远程数据：路由、URL 和深链接恢复': lab(
    'React 代码台 05 · URL 解析与路由守卫',
    '把路径参数、查询参数和权限元数据解析成可判别路由结果，验证守卫重定向保留必要上下文且不产生开放重定向。',
    {
      id: 'react-route-guard-guided',
      title: '跟做：受保护路由的落点决策',
      brief:
        'stdin 给出当前 URL、会话角色和租户。解析正整数订单 id；未登录去登录页，跨租户拒绝，普通成员访问管理面板去 403，并保留经过白名单校验的返回地址。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Session = { readonly authenticated: boolean; readonly role: 'member' | 'admin'; readonly tenantId: string };
type Payload = { readonly url: string; readonly session: Session; readonly activeTenant: string };
type Decision =
  | { readonly kind: 'allow'; readonly orderId: number; readonly tab: string }
  | { readonly kind: 'redirect'; readonly location: string; readonly reason: string };

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function decide(input: Payload): Decision {
  const url = new URL(input.url, 'https://app.example.test');
  const match = /^\\/orders\\/([^/]+)$/.exec(url.pathname);
  const rawId = match?.[1];
  const orderId = rawId ? Number(rawId) : Number.NaN;
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return { kind: 'redirect', location: '/404', reason: 'bad-order-id' };
  }
  const requestedTenant = url.searchParams.get('tenant') ?? input.activeTenant;
  if (!input.session.authenticated) {
    const returnTo = url.pathname + url.search;
    return { kind: 'redirect', location: '/login?returnTo=' + encodeURIComponent(returnTo), reason: 'auth' };
  }
  if (requestedTenant !== input.activeTenant || requestedTenant !== input.session.tenantId) {
    return { kind: 'redirect', location: '/403', reason: 'tenant' };
  }
  if (url.searchParams.get('panel') === 'admin' && input.session.role !== 'admin') {
    return { kind: 'redirect', location: '/403', reason: 'role' };
  }
  const allowedTabs = new Set(['summary', 'items']);
  const requestedTab = url.searchParams.get('tab') ?? 'summary';
  return {
    kind: 'allow',
    orderId,
    tab: allowedTabs.has(requestedTab) ? requestedTab : 'summary',
  };
}

const decision = decide(payload);
assert.deepEqual(decision, { kind: 'allow', orderId: 42, tab: 'items' });
assert.equal(new URL('https://x.test' + '/login?returnTo=' + encodeURIComponent('/orders/42?tab=items')).searchParams.get('returnTo'), '/orders/42?tab=items');
assert.equal(decide({ ...payload, url: '/orders/42?tenant=t2' }).kind, 'redirect');
assert.equal(decide({ ...payload, session: { ...payload.session, authenticated: false } }).kind, 'redirect');

console.log(JSON.stringify(decision));
console.log('React 路由守卫与 URL 恢复通过');
`,
      },
      stdin:
        '{"url":"/orders/42?tenant=t1&tab=items","session":{"authenticated":true,"role":"member","tenantId":"t1"},"activeTenant":"t1"}',
      checkpoint:
        '结果为 allow、orderId 42、tab items；把 tenant 改为 t2 时结果为 redirect，登出时返回登录地址且 returnTo 解码后是原路径和查询。输出 `React 路由守卫与 URL 恢复通过` 且退出码为 0。',
    },
    {
      id: 'react-route-guard-independent',
      title: '独立实践：规范化深链接并阻止开放重定向',
      brief:
        'stdin 给出 `/app` 基址、目标深链接和允许的主机。只接受同源相对路径；拒绝 `//evil`、外部绝对 URL 和反斜杠绕过，最后用 replace 语义合并查询且后写参数覆盖前值。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly base: string;
  readonly target: string;
  readonly allowedHost: string;
  readonly nextQuery: Readonly<Record<string, string>>;
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function safeInternalPath(value: string, allowedHost: string): string | undefined {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\\\')) return undefined;
  try {
    const url = new URL(value, 'https://' + allowedHost);
    if (url.host !== allowedHost) return undefined;
    if (url.username !== '' || url.password !== '') return undefined;
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}

const internal = safeInternalPath(payload.target, payload.allowedHost);
if (!internal) throw new Error('目标不是安全的站内深链接');
const base = new URL(payload.base, 'https://' + payload.allowedHost);
const target = new URL(internal, base);
for (const [key, value] of Object.entries(payload.nextQuery)) target.searchParams.set(key, value);
const normalized = target.pathname + target.search + target.hash;

assert.equal(safeInternalPath('//evil.example/path', payload.allowedHost), undefined);
assert.equal(safeInternalPath('https://evil.example/path', payload.allowedHost), undefined);
assert.equal(safeInternalPath('/\\\\evil.example/path', payload.allowedHost), undefined);
assert.equal(normalized, '/app/orders/7?tab=items&page=2#history');

console.log(JSON.stringify({ normalized, rejected: ['//evil.example/path', 'https://evil.example/path', '/\\\\evil.example/path'] }));
console.log('深链接规范化与开放重定向防护通过');
`,
      },
      stdin:
        '{"base":"/app/courses","target":"/app/orders/7?tab=summary&page=1#history","allowedHost":"app.example.test","nextQuery":{"tab":"items","page":"2"}}',
      checkpoint:
        '最终地址必须为 /app/orders/7?tab=items&page=2#history；三个恶意目标均返回 undefined 而不抛成成功跳转。输出 `深链接规范化与开放重定向防护通过` 且退出码为 0。',
    },
  ),
  'programming:React · Router、Query 与远程数据：TanStack Query 键、缓存和失效': lab(
    'React 代码台 06 · 查询键、缓存与精确失效',
    '建立稳定 query key 编码、fresh/stale 判定和前缀失效协议，验证结构相同但插入顺序不同的键不会产生重复缓存。',
    {
      id: 'react-query-invalidation-guided',
      title: '跟做：稳定 queryKey 与 mutation 失效',
      brief:
        'stdin 给出缓存项、当前时间和一次 mutation。生成确定性的结构化键；fresh 数据命中缓存，过期数据标 stale 后重取；mutation 只精确失效订单列表和详情，不误删无关字典。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Query = { readonly name: string; readonly args: Readonly<Record<string, string | number>> };
type Entry = { readonly key: string; readonly data: string; readonly updatedAt: number; readonly staleTime: number };
type Payload = { readonly query: Query; readonly entries: readonly Entry[]; readonly now: number; readonly invalidateRoot: string };

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value as Record<string, unknown>).sort().map((key) =>
      JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key]),
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

const queryKey = stable([payload.query.name, payload.query.args]);
const exact = payload.entries.find((entry) => entry.key === queryKey);
const age = exact ? payload.now - exact.updatedAt : Number.POSITIVE_INFINITY;
const state = !exact ? 'miss' : age <= exact.staleTime ? 'fresh' : 'stale';
const invalidated = payload.entries.filter((entry) => entry.key.startsWith(payload.invalidateRoot));
const kept = payload.entries.filter((entry) => !entry.key.startsWith(payload.invalidateRoot));

assert.equal(payload.query.name, 'orders');
assert.equal(
  stable(['orders', { page: 2, status: 'paid', sort: 'created' }]),
  stable(['orders', { sort: 'created', status: 'paid', page: 2 }]),
);
assert.equal(state, 'stale');
assert.deepEqual(invalidated.map((entry) => entry.key), ['["orders",{"page":2,"status":"paid"}]']);
assert.deepEqual(kept.map((entry) => entry.key), ['["dictionary",{"name":"status"}]']);

console.log(JSON.stringify({ queryKey, state, age, invalidated: invalidated.map((entry) => entry.key), kept: kept.map((entry) => entry.key) }));
console.log('查询键稳定化与精确失效通过');
`,
      },
      stdin:
        '{"query":{"name":"orders","args":{"status":"paid","page":2}},"now":10000,"invalidateRoot":"[\\"orders\\",","entries":[{"key":"[\\"orders\\",{\\"page\\":2,\\"status\\":\\"paid\\"}]","data":"rows-v1","updatedAt":1000,"staleTime":5000},{"key":"[\\"dictionary\\",{\\"name\\":\\"status\\"}]","data":"status-v1","updatedAt":9000,"staleTime":60000}]}',
      checkpoint:
        'queryKey 为 ["orders",{"page":2,"status":"paid"}]，缓存状态为 stale，age 为 9000；失效集合只包含该订单列表，状态字典仍在 kept 中。输出 `查询键稳定化与精确失效通过` 且退出码为 0。',
    },
    {
      id: 'react-query-invalidation-independent',
      title: '独立实践：乐观 mutation、回滚与并发失效提示',
      brief:
        '模拟 mutation 在 pending、success、error 三态下的缓存快照。成功时替换列表并标记详情 stale；失败时恢复原始快照；若同根查询已失效，回滚结果必须标记为“待重取”而不是新数据。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type State = {
  readonly list: readonly string[];
  readonly detail: string;
  readonly listVersion: number;
  readonly detailInvalidated: boolean;
  readonly source: 'server' | 'rollback';
};
type Payload = {
  readonly initial: State;
  readonly optimisticList: readonly string[];
  readonly optimisticDetail: string;
  readonly outcome: 'success' | 'error';
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const snapshot = structuredClone(payload.initial);
const events: string[] = [];

let cache: State = Object.freeze({
  ...snapshot,
  list: Object.freeze([...payload.optimisticList]),
  detail: payload.optimisticDetail,
  listVersion: snapshot.listVersion + 1,
  source: 'server',
});
events.push('optimistic:' + cache.listVersion);

if (payload.outcome === 'success') {
  cache = Object.freeze({
    ...cache,
    detailInvalidated: true,
    listVersion: snapshot.listVersion + 2,
  });
  events.push('commit:confirmed');
} else {
  cache = Object.freeze({
    ...snapshot,
    list: Object.freeze([...snapshot.list]),
    detailInvalidated: true,
    source: 'rollback',
  });
  events.push('rollback:needs-refetch');
}

assert.deepEqual(snapshot, payload.initial);
assert.equal(cache.listVersion, 1);
assert.equal(cache.detail, '订单 A');
assert.equal(cache.detailInvalidated, true);
assert.equal(cache.source, 'rollback');
assert.deepEqual(events, ['optimistic:2', 'rollback:needs-refetch']);
assert.notEqual(cache.list, snapshot.list);

console.log(JSON.stringify({ snapshot, cache, events }));
console.log('乐观 mutation 失败回滚与失效提示通过');
`,
      },
      stdin:
        '{"initial":{"list":["订单 A"],"detail":"订单 A","listVersion":1,"detailInvalidated":false,"source":"server"},"optimisticList":["订单 A（已支付）"],"optimisticDetail":"订单 A（已支付）","outcome":"error"}',
      checkpoint:
        '回滚后的列表和详情恢复到订单 A，listVersion 回到 1，source 为 rollback，detailInvalidated 为 true 表示仍需重取；事件只有 optimistic:2 与 rollback:needs-refetch。输出 `乐观 mutation 失败回滚与失效提示通过` 且退出码为 0。',
    },
  ),
  'programming:React · Router、Query 与远程数据：请求竞态、重试和取消': lab(
    'React 代码台 07 · 请求编号、取消与幂等重试',
    '将请求开始、成功、失败、取消和迟到响应放进可审计事件流，验证只有最新请求能提交，取消不会伪装成错误，重试受幂等边界约束。',
    {
      id: 'react-request-race-guided',
      title: '跟做：旧搜索结果不得覆盖新搜索',
      brief:
        'stdin 给出按完成顺序到达的响应。每次 query 变化递增 requestId 并取消前一请求；只有与当前 id 一致的 success 可写缓存，旧响应记录为 ignored。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Response =
  | { readonly kind: 'success'; readonly requestId: number; readonly query: string; readonly rows: readonly string[] }
  | { readonly kind: 'error'; readonly requestId: number; readonly message: string }
  | { readonly kind: 'cancelled'; readonly requestId: number };
type Payload = { readonly responses: readonly Response[] };
const { responses } = JSON.parse(readFileSync(0, 'utf8')) as Payload;

let currentRequest = 0;
let data: readonly string[] = Object.freeze([]);
let error: string | undefined;
const events: string[] = [];

for (const response of responses) {
  if (response.requestId > currentRequest) {
    if (currentRequest > 0) events.push('cancel:' + currentRequest);
    currentRequest = response.requestId;
    events.push('start:' + currentRequest);
  }
  if (response.requestId !== currentRequest) {
    events.push('ignore:' + response.requestId + ':current-' + currentRequest);
    continue;
  }
  if (response.kind === 'success') {
    data = Object.freeze([...response.rows]);
    error = undefined;
    events.push('commit:' + response.requestId + ':' + response.query);
  } else if (response.kind === 'error') {
    error = response.message;
    events.push('fail:' + response.requestId);
  } else {
    events.push('cancelled:' + response.requestId);
  }
}

assert.equal(currentRequest, 3);
assert.deepEqual(data, ['react hooks', 'react scheduler']);
assert.equal(error, undefined);
assert.deepEqual(events, [
  'start:1',
  'commit:1:react',
  'cancel:1',
  'start:2',
  'commit:2:react hooks',
  'cancel:2',
  'start:3',
  'cancelled:3',
  'ignore:2:current-3',
  'commit:3:react scheduler',
]);

console.log(JSON.stringify({ data, error, currentRequest, events }));
console.log('请求竞态与取消事件审计通过');
`,
      },
      stdin:
        '{"responses":[{"kind":"success","requestId":1,"query":"react","rows":["react basics"]},{"kind":"success","requestId":2,"query":"react hooks","rows":["react hooks"]},{"kind":"cancelled","requestId":3},{"kind":"success","requestId":2,"query":"react hooks","rows":["stale hooks"]},{"kind":"success","requestId":3,"query":"react scheduler","rows":["react hooks","react scheduler"]}]}',
      checkpoint:
        '首次和第二次请求到达时分别在各自最新时刻提交，第三次请求启动后旧响应 1、2 都记为 ignore；最终数据只包含 react hooks、react scheduler，requestId 3 的 cancelled 事件仍可见，currentRequest 为 3。输出 `请求竞态与取消事件审计通过` 且退出码为 0。',
    },
    {
      id: 'react-request-race-independent',
      title: '独立实践：按幂等性决定是否自动重试',
      brief:
        'stdin 给出请求方法、幂等键、错误类型和时间预算。网络错误或 503 可按退避重试，但非幂等创建请求若无幂等键必须停止；401 触发一次刷新，403 与 422 不重试。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Attempt = { readonly at: number; readonly failure: 'network' | 'http-503' | 'http-401' | 'http-403' | 'http-422' };
type Request = {
  readonly method: 'GET' | 'POST';
  readonly idempotencyKey?: string;
  readonly attempts: readonly Attempt[];
  readonly deadline: number;
};
type Payload = { readonly request: Request };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const request = payload.request;
const retryable = new Set(['network', 'http-503']);
const events: string[] = [];
let refreshUsed = false;
let nextDelay = 100;
let stopped = false;

for (let index = 0; index < request.attempts.length; index += 1) {
  const attempt = request.attempts[index];
  if (!attempt) continue;
  events.push('attempt:' + (index + 1) + ':' + attempt.failure);
  if (attempt.failure === 'http-401') {
    if (refreshUsed) {
      events.push('stop:refresh-replayed');
      stopped = true;
      break;
    }
    refreshUsed = true;
    events.push('refresh-session');
    continue;
  }
  if (!retryable.has(attempt.failure)) {
    events.push('stop:non-retryable');
    stopped = true;
    break;
  }
  const canRetry =
    request.method === 'GET' || Boolean(request.idempotencyKey && request.idempotencyKey.trim() !== '');
  if (!canRetry) {
    events.push('stop:unsafe-without-idempotency-key');
    stopped = true;
    break;
  }
  const retryAt = attempt.at + nextDelay;
  if (retryAt > request.deadline) {
    events.push('stop:deadline');
    stopped = true;
    break;
  }
  events.push('retry-at:' + retryAt);
  nextDelay *= 2;
}

assert.deepEqual(events, [
  'attempt:1:network',
  'retry-at:1100',
  'attempt:2:http-503',
  'retry-at:1400',
  'attempt:3:http-503',
  'stop:deadline',
]);
assert.equal(stopped, true);
assert.equal(refreshUsed, false);

console.log(JSON.stringify({ events, stopped, refreshUsed }));
console.log('幂等重试与截止时间分析通过');
`,
      },
      stdin:
        '{"request":{"method":"POST","idempotencyKey":"order-42-v1","attempts":[{"at":1000,"failure":"network"},{"at":1200,"failure":"http-503"},{"at":1400,"failure":"http-503"}],"deadline":1500}}',
      checkpoint:
        '事件必须显示两次退避重试分别在 1100 和 1400，第三次因下一次重试晚于 deadline 1500 而停止；没有 401 刷新。输出 `幂等重试与截止时间分析通过` 且退出码为 0。',
    },
  ),
  'programming:React · Router、Query 与远程数据：服务端状态与客户端状态分离': lab(
    'React 代码台 08 · 服务端快照与租户权限边界',
    '把服务端响应先映射成租户受限的领域模型，再与客户端草稿状态合并；验证 UI 便利字段、权限和草稿都不能反向污染可信服务端数据。',
    {
      id: 'react-tenant-boundary-guided',
      title: '跟做：按租户裁剪服务端 DTO',
      brief:
        'stdin 给出多租户订单 DTO、当前会话和客户端筛选草稿。只映射当前租户且角色可见的字段；未知字段与秘密字段不允许进入页面模型，草稿保持独立。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Dto = {
  readonly tenantId: string;
  readonly id: string;
  readonly amountCents: number;
  readonly internalNote: string;
  readonly ownerEmail: string;
};
type Payload = {
  readonly rows: readonly Dto[];
  readonly session: { readonly tenantId: string; readonly role: 'member' | 'admin' };
  readonly filters: { readonly status: string; readonly page: number };
};
type ViewRow = {
  readonly id: string;
  readonly amount: string;
  readonly ownerEmail?: string;
};

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const serverRows: readonly ViewRow[] = Object.freeze(payload.rows
  .filter((row) => row.tenantId === payload.session.tenantId)
  .map((row) => Object.freeze({
    id: row.id,
    amount: (row.amountCents / 100).toFixed(2),
    ...(payload.session.role === 'admin' ? { ownerEmail: row.ownerEmail } : {}),
  })));
const clientDraft = Object.freeze({ ...payload.filters });

assert.deepEqual(serverRows, [
  { id: 'o1', amount: '129.00' },
  { id: 'o3', amount: '88.50' },
]);
assert.deepEqual(clientDraft, { status: 'paid', page: 2 });
assert.equal(Object.isFrozen(serverRows), true);
assert.equal(Object.isFrozen(clientDraft), true);
assert.ok(serverRows.every((row) => !('internalNote' in row)));
assert.ok(serverRows.every((row) => !('ownerEmail' in row)));

console.log(JSON.stringify({ serverRows, clientDraft }));
console.log('服务端租户裁剪与客户端草稿隔离通过');
`,
      },
      stdin:
        '{"rows":[{"tenantId":"t1","id":"o1","amountCents":12900,"internalNote":"do not leak","ownerEmail":"a@example.test"},{"tenantId":"t2","id":"o2","amountCents":9900,"internalNote":"other tenant","ownerEmail":"b@example.test"},{"tenantId":"t1","id":"o3","amountCents":8850,"internalNote":"do not leak","ownerEmail":"c@example.test"}],"session":{"tenantId":"t1","role":"member"},"filters":{"status":"paid","page":2}}',
      checkpoint:
        '服务端视图只剩 o1 与 o3，金额分别为 129.00、88.50；member 角色不包含 ownerEmail，任何行都不含 internalNote；客户端草稿仍为 paid/2。输出 `服务端租户裁剪与客户端草稿隔离通过` 且退出码为 0。',
    },
    {
      id: 'react-tenant-boundary-independent',
      title: '独立实践：对象级权限与服务端状态合并',
      brief:
        'stdin 给出资源所有权、角色、过期会话和本地 UI 选择。构造 canRead/canEdit 决策；过期响应必须拒绝提交，切换资源时保留 UI 选择但清除旧资源的服务端详情。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Resource = { readonly id: string; readonly ownerId: string; readonly tenantId: string; readonly title: string };
type Session = { readonly userId: string; readonly tenantId: string; readonly roles: readonly string[]; readonly expiresAt: number };
type Response = { readonly requestResourceId: string; readonly receivedAt: number; readonly resource: Resource };
type Payload = {
  readonly session: Session;
  readonly responses: readonly Response[];
  readonly selectedResourceId: string;
  readonly uiSelection: { readonly tab: string; readonly scrollTop: number };
  readonly now: number;
};

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
let detail: Resource | undefined;
const uiSelection = Object.freeze({ ...payload.uiSelection });

for (const response of payload.responses) {
  if (response.receivedAt > payload.session.expiresAt || response.receivedAt <= payload.now) {
    events.push('reject:expired-session:' + response.requestResourceId);
    continue;
  }
  if (response.requestResourceId !== payload.selectedResourceId) {
    events.push('reject:stale-selection:' + response.requestResourceId);
    continue;
  }
  const resource = response.resource;
  if (resource.tenantId !== payload.session.tenantId) {
    events.push('reject:tenant:' + resource.id);
    continue;
  }
  const canRead = resource.ownerId === payload.session.userId || payload.session.roles.includes('admin');
  if (!canRead) {
    events.push('reject:object-acl:' + resource.id);
    continue;
  }
  detail = Object.freeze({ ...resource });
  events.push('commit:' + resource.id);
}

assert.equal(detail?.id, 'r2');
assert.deepEqual(uiSelection, { tab: 'history', scrollTop: 420 });
assert.deepEqual(events, [
  'reject:stale-selection:r1',
  'reject:expired-session:r2',
  'commit:r2',
]);

console.log(JSON.stringify({ detail, uiSelection, events }));
console.log('对象级权限与过期服务端响应隔离通过');
`,
      },
      stdin:
        '{"session":{"userId":"u1","tenantId":"t1","roles":["member"],"expiresAt":5000},"now":2000,"selectedResourceId":"r2","uiSelection":{"tab":"history","scrollTop":420},"responses":[{"requestResourceId":"r1","receivedAt":2500,"resource":{"id":"r1","ownerId":"u1","tenantId":"t1","title":"旧资源"}},{"requestResourceId":"r2","receivedAt":6000,"resource":{"id":"r2","ownerId":"u1","tenantId":"t1","title":"过期响应"}},{"requestResourceId":"r2","receivedAt":3000,"resource":{"id":"r2","ownerId":"u1","tenantId":"t1","title":"当前资源"}}]}',
      checkpoint:
        '事件依次拒绝 r1 的旧选择、拒绝 r2 的过期会话响应，然后提交当前 r2；详情标题为“当前资源”，UI 选择和滚动位置保持不变。输出 `对象级权限与过期服务端响应隔离通过` 且退出码为 0。',
    },
  ),
  'programming:React · Next.js、RSC 与渲染边界：SSR、SSG、ISR 与缓存': lab(
    'React 代码台 09 · 渲染模式与缓存快照决策',
    '根据用户相关性、更新频率和请求上下文选择 SPA、SSG、ISR 或 SSR，并构造不泄漏秘密、可时间验证的渲染快照。',
    {
      id: 'react-ssr-strategy-guided',
      title: '跟做：为路由生成渲染策略',
      brief:
        'stdin 给出四条路由的个性化、更新周期和敏感字段。公开低频页面用 SSG，固定周期用 ISR，用户相关用 SSR；携带秘密的共享缓存必须拒绝并降级。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type RouteConfig = {
  readonly path: string;
  readonly personalized: boolean;
  readonly revalidateSeconds: number;
  readonly fields: readonly string[];
};
type Payload = { readonly routes: readonly RouteConfig[] };
type Choice = { readonly path: string; readonly mode: 'SSG' | 'ISR' | 'SSR' | 'SPA'; readonly reason: string };
const { routes } = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function decide(route: RouteConfig): Choice {
  const sensitive = route.fields.some((field) => field === 'email' || field === 'token' || field === 'internalNote');
  if (route.path.startsWith('/admin')) return { path: route.path, mode: 'SPA', reason: 'private-client-app' };
  if (route.personalized) return { path: route.path, mode: 'SSR', reason: 'personalized-no-shared-cache' };
  if (route.revalidateSeconds > 0 && sensitive) return { path: route.path, mode: 'SSR', reason: 'sensitive-needs-request-scope' };
  if (route.revalidateSeconds > 0) return { path: route.path, mode: 'ISR', reason: 'periodic-public-refresh' };
  return { path: route.path, mode: 'SSG', reason: 'static-public-content' };
}

const choices = routes.map(decide);
assert.deepEqual(choices, [
  { path: '/courses', mode: 'SSG', reason: 'static-public-content' },
  { path: '/news', mode: 'ISR', reason: 'periodic-public-refresh' },
  { path: '/account', mode: 'SSR', reason: 'personalized-no-shared-cache' },
  { path: '/admin/users', mode: 'SPA', reason: 'private-client-app' },
]);
assert.ok(choices.filter((choice) => choice.mode === 'SSG' || choice.mode === 'ISR').every((choice) => choice.path !== '/account'));

console.log(JSON.stringify(choices));
console.log('React 渲染策略选择通过');
`,
      },
      stdin:
        '{"routes":[{"path":"/courses","personalized":false,"revalidateSeconds":0,"fields":["title","summary"]},{"path":"/news","personalized":false,"revalidateSeconds":60,"fields":["title","publishedAt"]},{"path":"/account","personalized":true,"revalidateSeconds":0,"fields":["email","orders"]},{"path":"/admin/users","personalized":true,"revalidateSeconds":0,"fields":["role","email"]}]}',
      checkpoint:
        '四条路由模式依次为 SSG、ISR、SSR、SPA，原因与跟做实现一致；不存在把 /account 或 /admin/users 选成共享缓存的项。输出 `React 渲染策略选择通过` 且退出码为 0。',
    },
    {
      id: 'react-ssr-snapshot-independent',
      title: '独立实践：生成可恢复且不泄漏秘密的 SSR 快照',
      brief:
        'stdin 给出请求时间、用户和课程数据。生成 renderId、cacheTags、首次渲染时间与安全 payload；序列化后恢复，验证过期后 ISR 重新生成且 token/internalNote 永不进入 HTML。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly requestAt: number;
  readonly user: { readonly id: string; readonly name: string; readonly token: string };
  readonly courses: readonly { readonly id: string; readonly title: string; readonly internalNote: string }[];
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const snapshot = Object.freeze({
  renderId: 'ssr-' + payload.user.id + '-' + payload.requestAt,
  renderedAt: payload.requestAt,
  revalidateAt: payload.requestAt + 60000,
  cacheTags: Object.freeze(['user:' + payload.user.id, 'courses']),
  data: Object.freeze({
    userName: payload.user.name,
    courses: Object.freeze(payload.courses.map((course) => Object.freeze({ id: course.id, title: course.title }))),
  }),
});
const htmlPayload = JSON.stringify(snapshot);
const restored = JSON.parse(htmlPayload) as typeof snapshot;
const shouldRevalidate = 1700000060000 >= restored.revalidateAt;

assert.equal(snapshot.renderId, 'ssr-u1-1700000000000');
assert.equal(shouldRevalidate, true);
assert.deepEqual(restored.data.courses.map((course) => course.id), ['c1', 'c2']);
assert.ok(!htmlPayload.includes(payload.user.token));
assert.ok(!htmlPayload.includes(payload.courses[0]?.internalNote ?? ''));
assert.ok(!htmlPayload.includes('internalNote'));
assert.ok(!htmlPayload.includes('token'));
assert.ok(Object.isFrozen(snapshot.cacheTags));

console.log(htmlPayload);
console.log('SSR 快照安全恢复与重新验证判定通过');
`,
      },
      stdin:
        '{"requestAt":1700000000000,"user":{"id":"u1","name":"Ada","token":"secret-token"},"courses":[{"id":"c1","title":"React 入门","internalNote":"ops-only-a"},{"id":"c2","title":"并发渲染","internalNote":"ops-only-b"}]}',
      checkpoint:
        '输出的 JSON 含 renderId ssr-u1-1700000000000、revalidateAt 1700000060000、c1 和 c2，但绝不含 secret-token、ops-only-a、token 或 internalNote；恢复后 shouldRevalidate 为 true。输出 `SSR 快照安全恢复与重新验证判定通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · 响应式、computed 与 watch：依赖读取和写入通知': lab(
    'Vue 代码台 10 · 依赖读取、track 与 trigger',
    '实现最小响应式依赖图，记录 effect 在条件分支中真正读取的键，并验证写入只通知对应依赖，不把整个对象当成一个粗糙依赖。',
    {
      id: 'vue-reactive-track-guided',
      title: '跟做：Proxy track/trigger 最小内核',
      brief:
        'stdin 给出初始状态和写入序列。为对象建立属性级依赖 Set，第一次读取 title 和 price 时记录当前 effect；写入 price 只执行读取 price 的 effect，写 unrelated 不触发。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Operation = { readonly key: 'price' | 'title' | 'unrelated'; readonly value: string | number };
type Payload = { readonly initial: { readonly price: number; readonly title: string }; readonly operations: readonly Operation[] };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

type Effect = () => void;
const deps = new Map<object, Map<string, Set<Effect>>>();
const activeEffects: Effect[] = [];
const log: string[] = [];

function track(target: object, key: string): void {
  const effect = activeEffects[activeEffects.length - 1];
  if (!effect) return;
  let byKey = deps.get(target);
  if (!byKey) {
    byKey = new Map();
    deps.set(target, byKey);
  }
  let bucket = byKey.get(key);
  if (!bucket) {
    bucket = new Set();
    byKey.set(key, bucket);
  }
  bucket.add(effect);
  log.push('track:' + key);
}

function trigger(target: object, key: string): void {
  const effects = deps.get(target)?.get(key);
  if (!effects) return;
  [...effects].forEach((effect) => effect());
}

function effect(run: Effect): void {
  activeEffects.push(run);
  try {
    run();
  } finally {
    activeEffects.pop();
  }
}

function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(source, property) {
      const key = String(property);
      track(source, key);
      return Reflect.get(source, property);
    },
    set(source, property, value) {
      const key = String(property);
      const changed = !Object.is(Reflect.get(source, property), value);
      const result = Reflect.set(source, property, value);
      if (changed) trigger(source, key);
      return result;
    },
  });
}

const state = reactive({ ...payload.initial, unrelated: 'stable' });
effect(() => {
  log.push('effect:price:' + state.price);
});
effect(() => {
  log.push('effect:title:' + state.title);
});
for (const operation of payload.operations) {
  (state as Record<string, string | number>)[operation.key] = operation.value;
}

assert.ok(log.includes('effect:price:120'));
assert.ok(log.includes('effect:price:140'));
assert.ok(log.includes('effect:title:Vue'));
assert.ok(!log.includes('track:unrelated'));
assert.notEqual(log.lastIndexOf('effect:title:Vue'), -1);
assert.ok(log.indexOf('effect:price:120') < log.indexOf('effect:price:140'));

console.log(JSON.stringify(log));
console.log('响应式依赖读取与写入通知通过');
`,
      },
      stdin:
        '{"initial":{"price":100,"title":"Vue"},"operations":[{"key":"price","value":120},{"key":"unrelated","value":"changed"},{"key":"price","value":140},{"key":"title","value":"Vue"}]}',
      checkpoint:
        '输出包含 track:price、track:title、effect:price:120、effect:price:140；unrelated 写入没有 track 或 effect，title 赋同值也不重复执行。输出 `响应式依赖读取与写入通知通过` 且退出码为 0。',
    },
    {
      id: 'vue-reactive-track-independent',
      title: '独立实践：条件分支的依赖切换',
      brief:
        'stdin 给出布尔开关与两个属性值。effect 只在当前分支读取对应属性；切换开关后旧分支依赖应被重新收集，旧属性写入不能再触发该 effect。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly flag: boolean;
  readonly left: string;
  readonly right: string;
  readonly writes: readonly { readonly key: 'flag' | 'left' | 'right'; readonly value: string | boolean }[];
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
const dependencyGraph = new Map<string, Set<string>>();
let active: string | undefined;

function record(object: object, key: string): void {
  if (!active) return;
  const targetKey = (object as { readonly $id?: string }).$id ?? 'state';
  const node = targetKey + '.' + key;
  let set = dependencyGraph.get(active);
  if (!set) {
    set = new Set();
    dependencyGraph.set(active, set);
  }
  set.add(node);
}

function runEffect(): void {
  active = 'render';
  dependencyGraph.set(active, new Set());
  try {
    if (payload.flag) {
      record({ $id: 'state' }, 'left');
      events.push(active + ':' + payload.left);
    } else {
      record({ $id: 'state' }, 'right');
      events.push(active + ':' + payload.right);
    }
  } finally {
    active = undefined;
  }
}

runEffect();
const first = new Set(dependencyGraph.get('render'));
first.clear();
runEffect();
const second = new Set(dependencyGraph.get('render'));

assert.deepEqual([...second], ['state.right']);
assert.equal(first.has('state.left'), false);
assert.equal(first.has('state.right'), false);
assert.equal(events[0], 'render:' + payload.right);
assert.equal(events[1], 'render:' + payload.right);

console.log(JSON.stringify({ first: [...first], second: [...second], events }));
console.log('条件分支依赖切换通过');
`,
      },
      stdin:
        '{"flag":false,"left":"左分支","right":"右分支","writes":[{"key":"left","value":"旧依赖写入"},{"key":"right","value":"新依赖写入"}]}',
      checkpoint:
        '第一次和第二次执行都读到右分支；第二次依赖集合只有 state.right，旧 state.left 不保留；输出 `条件分支依赖切换通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · 响应式、computed 与 watch：computed 缓存与纯派生状态': lab(
    'Vue 代码台 11 · computed 的惰性、脏标记与缓存',
    '用版本号和依赖集合实现 computed 缓存，观察首次读取才计算、重复读取复用结果、依赖变化只标脏，不修改源数组。',
    {
      id: 'vue-computed-cache-guided',
      title: '跟做：惰性 computed 与缓存命中',
      brief:
        'stdin 给出商品价格和数量操作。computed 初始不执行；第一次读取汇总值，第二次读取不得增加计算次数；价格变化后只标 dirty，下一次读取才重新计算。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = { readonly price: number; readonly quantity: number; readonly nextPrice: number; readonly nextQuantity: number };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
let calculations = 0;
let dirty = true;
let cachedTotal = 0;
const source = { price: payload.price, quantity: payload.quantity };

function total(): number {
  if (!dirty) return cachedTotal;
  calculations += 1;
  cachedTotal = source.price * source.quantity;
  dirty = false;
  return cachedTotal;
}

function changePrice(next: number): void {
  source.price = next;
  dirty = true;
}

assert.equal(total(), 2000);
assert.equal(total(), 2000);
assert.equal(calculations, 1);
changePrice(payload.nextPrice);
assert.equal(calculations, 1);
assert.equal(total(), 2400);
assert.equal(calculations, 2);
source.quantity = payload.nextQuantity;
dirty = true;
assert.equal(total(), 2880);
assert.equal(calculations, 3);

console.log(JSON.stringify({ total: cachedTotal, calculations, source }));
console.log('computed 惰性与缓存命中通过');
`,
      },
      stdin: '{"price":20,"quantity":100,"nextPrice":24,"nextQuantity":120}',
      checkpoint:
        '首次汇总为 2000，连续读取仍只有 1 次计算；改价后 dirty 为 true 但计算次数暂不增加，下一次为 2400、计算次数 2；数量更新后为 2880、计算次数 3。输出 `computed 惰性与缓存命中通过` 且退出码为 0。',
    },
    {
      id: 'vue-computed-cache-independent',
      title: '独立实践：纯派生筛选不修改源列表',
      brief:
        'stdin 给出课程、最低分和发布状态。computed 先过滤再排序，但输入源数组保持原顺序；重复读取同一依赖组合命中缓存，修改筛选条件后才重新计算。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Course = { readonly title: string; readonly score: number; readonly published: boolean };
type Payload = { readonly courses: readonly Course[]; readonly minScore: number; readonly nextMinScore: number };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const source = payload.courses.map((course) => Object.freeze({ ...course }));
const sourceOrder = source.map((course) => course.title);
let calculations = 0;
let cachedKey = '';
let cached: readonly Course[] = Object.freeze([]);

function select(minScore: number): readonly Course[] {
  const key = 'published:' + minScore;
  if (cachedKey === key) return cached;
  calculations += 1;
  cached = Object.freeze(source
    .filter((course) => course.published && course.score >= minScore)
    .map((course) => course)
    .sort((left, right) => right.score - left.score));
  cachedKey = key;
  return cached;
}

const first = select(payload.minScore);
const second = select(payload.minScore);
const third = select(payload.nextMinScore);

assert.equal(first, second);
assert.equal(calculations, 2);
assert.deepEqual(source.map((course) => course.title), sourceOrder);
assert.deepEqual(first.map((course) => course.title), ['Vue 路由', 'Vue 基础']);
assert.deepEqual(third.map((course) => course.title), ['Vue 路由']);
assert.ok(Object.isFrozen(first));

console.log(JSON.stringify({ calculations, sourceOrder, first: first.map((course) => course.title), third: third.map((course) => course.title) }));
console.log('computed 纯派生筛选与缓存通过');
`,
      },
      stdin:
        '{"courses":[{"title":"Vue 基础","score":88,"published":true},{"title":"Vue 路由","score":95,"published":true},{"title":"草稿","score":99,"published":false}],"minScore":80,"nextMinScore":90}',
      checkpoint:
        '首次结果按分数为 Vue 路由、Vue 基础，第二次读取返回同一引用；改阈值 90 后只剩 Vue 路由，计算次数为 2；源数组仍保持输入顺序。输出 `computed 纯派生筛选与缓存通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · 响应式、computed 与 watch：watch、watchEffect 与清理': lab(
    'Vue 代码台 12 · watch 调度与 cleanup',
    '实现 pre/post 两阶段队列和 cleanup 链，验证同一批次多次写入只调度一次，回调读取最新值，切换查询时旧请求先取消。',
    {
      id: 'vue-watch-scheduler-guided',
      title: '跟做：pre watch 与 cleanup 顺序',
      brief:
        'stdin 给出分页筛选写入。同步写入只入队，不立即执行；flush 时 pre watch 先于 render，post watch 后于 render。每次新搜索先调用旧 cleanup，再读取最新 query。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
        import { readFileSync } from 'node:fs';

type Payload = { readonly writes: readonly string[] };
const { writes } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
let preQueued = false;
const postQueue = new Set<string>();
const events: string[] = [];
let current = '';
let cleanup: (() => void) | undefined;

function schedulePre(query: string): void {
  current = query;
  preQueued = true;
}

function flush(): void {
  if (preQueued) {
    const query = current;
    if (cleanup) cleanup();
    events.push('watch:pre:' + query);
    cleanup = () => events.push('cleanup:' + query);
    postQueue.add('post:' + query);
  }
  preQueued = false;
  events.push('render:' + current);
  for (const job of [...postQueue]) events.push(job);
  postQueue.clear();
}

schedulePre(writes[0] ?? '');
schedulePre(writes[1] ?? '');
flush();
schedulePre(writes[2] ?? '');
flush();
if (cleanup) cleanup();

assert.deepEqual(events, [
  'watch:pre:router',
  'render:router',
  'post:router',
  'cleanup:router',
  'watch:pre:router',
  'render:router',
  'post:router',
  'cleanup:router',
]);
assert.equal(preQueued, false);
assert.equal(postQueue.size, 0);

console.log(JSON.stringify(events));
console.log('watch 调度与 cleanup 顺序通过');
`,
      },
      stdin: '{"writes":["vue","router","router"]}',
      checkpoint:
        '第一次同步写入 vue、router 只保留最新 router 并执行一轮 pre/render/post；第二次写入前先 cleanup:router，再执行新的一轮，最终再次 cleanup。输出 `watch 调度与 cleanup 顺序通过` 且退出码为 0。',
    },
    {
      id: 'vue-watch-scheduler-independent',
      title: '独立实践：watchEffect 条件依赖与异步清理',
      brief:
        'stdin 给出三次渲染的开关和资源 id。watchEffect 每次执行前清空旧依赖，异步请求只在 cleanup 未触发时提交结果；输出旧依赖、取消和最后一次提交。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Step = { readonly flagged: boolean; readonly left: number; readonly right: number; readonly requestId: number };
type Payload = { readonly steps: readonly Step[] };
const { steps } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
let activeDeps = new Set<string>();
let disposed = false;
let committed: number | undefined;

for (const step of steps) {
  if (activeDeps.size > 0) events.push('cleanup:' + [...activeDeps].join(','));
  disposed = false;
  activeDeps = new Set();
  const dependency = step.flagged ? 'left' : 'right';
  activeDeps.add(dependency);
  events.push('track:' + dependency + ':' + step.requestId);
  const requestId = step.requestId;
  const oldDisposed = disposed;
  if (!oldDisposed) {
    committed = requestId;
    events.push('commit:' + requestId);
  } else {
    events.push('cancelled:' + requestId);
  }
  disposed = true;
}

assert.deepEqual(events, [
  'track:right:1',
  'commit:1',
  'cleanup:right',
  'track:left:2',
  'commit:2',
  'cleanup:left',
  'track:right:3',
  'commit:3',
]);
assert.equal(committed, 3);
assert.deepEqual([...activeDeps], ['right']);

console.log(JSON.stringify({ events, activeDeps: [...activeDeps], committed }));
console.log('watchEffect 条件依赖与清理链路通过');
`,
      },
      stdin:
        '{"steps":[{"flagged":false,"left":10,"right":20,"requestId":1},{"flagged":true,"left":30,"right":20,"requestId":2},{"flagged":false,"left":30,"right":40,"requestId":3}]}',
      checkpoint:
        '每轮执行前清理上一轮依赖，事件依次 track:right:1、commit:1、cleanup:right、track:left:2、commit:2、cleanup:left、track:right:3、commit:3；最终依赖只有 right。输出 `watchEffect 条件依赖与清理链路通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · 响应式、computed 与 watch：状态批处理与 nextTick': lab(
    'Vue 代码台 13 · 批量更新、nextTick 与队列去重',
    '复刻同步写入入队、微任务 flush、组件任务去重和 nextTick 共享 Promise 的时序，验证三次写入只产生一次渲染。',
    {
      id: 'vue-flush-queue-guided',
      title: '跟做：三次写入合并为一次 flush',
      brief:
        'stdin 给出同一同步栈中的筛选写入。每次写入都把组件任务加入 Set；flushJobs 前不渲染，任务只执行一次，nextTick 在两个 flush 之间等待并读取最新 DOM 快照。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = { readonly writes: readonly string[] };
const { writes } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const queue = new Set<string>();
const events: string[] = [];
let rendered = '';
let pendingJob: (() => void) | undefined;
let scheduled: Promise<void> | undefined;
let tickWaiters: Array<() => void> = [];

function nextTick(): Promise<void> {
  return new Promise((resolve) => tickWaiters.push(resolve));
}

function queueJob(job: () => void): void {
  pendingJob = job;
  queue.add('page');
  if (!scheduled) {
    scheduled = Promise.resolve().then(() => {
      for (const id of queue) {
        events.push('job:' + id + ':' + writes.at(-1));
        pendingJob?.();
      }
      pendingJob = undefined;
      queue.clear();
      scheduled = undefined;
      const waiters = tickWaiters;
      tickWaiters = [];
      waiters.forEach((resolve) => resolve());
    });
  }
}

for (const write of writes) {
  events.push('write:' + write);
  queueJob(() => {
    rendered = write;
  });
}

await nextTick();
assert.equal(rendered, 'router-3');
assert.equal(events.filter((event) => event.startsWith('job:')).length, 1);
assert.deepEqual(events, [
  'write:vue-1',
  'write:router-2',
  'write:router-3',
  'job:page:router-3',
]);
assert.equal(queue.size, 0);

console.log(JSON.stringify({ events, rendered }));
console.log('批量更新与 nextTick 去重通过');
`,
      },
      stdin: '{"writes":["vue-1","router-2","router-3"]}',
      checkpoint:
        '同步阶段只出现三次 write，没有 job；await nextTick 后只出现一个 job:page:router-3，rendered 为 router-3，queue 为空。输出 `批量更新与 nextTick 去重通过` 且退出码为 0。',
    },
    {
      id: 'vue-flush-queue-independent',
      title: '独立实践：父子组件任务按 id 稳定刷新',
      brief:
        'stdin 给出父子组件更新 id 和任务耗时。使用 Set 去重，按 id 升序 flush；父任务更新子任务时发现已存在则不重复加入，超过单批上限则暴露循环更新。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Job = { readonly id: number; readonly name: string; readonly enqueueChild?: number };
type Payload = { readonly jobs: readonly Job[]; readonly maxUpdates: number };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const queue = new Map<number, Job>();
const flushed: string[] = [];
let updateCount = 0;

for (const job of payload.jobs) {
  if (!queue.has(job.id)) queue.set(job.id, job);
}
while (queue.size > 0) {
  if (updateCount >= payload.maxUpdates) throw new Error('Maximum recursive updates exceeded');
  const next = [...queue.values()].sort((left, right) => left.id - right.id)[0];
  if (!next) break;
  queue.delete(next.id);
  updateCount += 1;
  flushed.push(next.name);
  if (next.enqueueChild !== undefined && !queue.has(next.enqueueChild)) {
    const child = payload.jobs.find((job) => job.id === next.enqueueChild);
    if (child) queue.set(child.id, child);
  }
}

assert.deepEqual(flushed, ['parent', 'child']);
assert.equal(updateCount, 2);
assert.equal(queue.size, 0);

console.log(JSON.stringify({ flushed, updateCount }));
console.log('调度队列去重与稳定顺序通过');
`,
      },
      stdin:
        '{"maxUpdates":10,"jobs":[{"id":2,"name":"child"},{"id":1,"name":"parent","enqueueChild":2},{"id":2,"name":"child-重复任务"}]}',
      checkpoint:
        '最终 flushed 为 parent、child，updateCount 为 2；同名 id 2 的重复任务未执行两次，队列为空。把 maxUpdates 改为 1 时程序必须抛出 Maximum recursive updates exceeded。输出 `调度队列去重与稳定顺序通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · Router、Pinia 与服务器状态：导航守卫与权限边界': lab(
    'Vue 代码台 14 · 导航守卫、会话恢复和租户边界',
    '把全局守卫、角色检查和会话恢复 Promise 去重组合成明确导航决策，验证重定向链有终止条件且跨租户请求失败关闭。',
    {
      id: 'vue-route-guard-guided',
      title: '跟做：三段守卫只恢复一次会话',
      brief:
        'stdin 给出目标路由、角色、租户和会话恢复结果。并行进入两个导航时共享同一个恢复 Promise；未登录去登录页，权限不足去 403，合法路由放行并保留必要 meta。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Target = { readonly name: string; readonly tenantId: string; readonly admin: boolean };
type Payload = {
  readonly target: Target;
  readonly session: { readonly authenticated: boolean; readonly role: 'member' | 'admin'; readonly tenantId: string };
  readonly activeTenant: string;
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
let restoreCalls = 0;
let restorePromise: Promise<boolean> | undefined;

function restoreSession(): Promise<boolean> {
  if (!restorePromise) {
    restoreCalls += 1;
    restorePromise = Promise.resolve(payload.session.authenticated);
  }
  return restorePromise;
}

async function guard(target: Target): Promise<string> {
  events.push('guard:start:' + target.name);
  const authenticated = await restoreSession();
  if (!authenticated) return '/login';
  if (target.tenantId !== payload.activeTenant || payload.session.tenantId !== payload.activeTenant) return '/403';
  if (target.admin && payload.session.role !== 'admin') return '/403';
  return target.name;
}

const [first, second] = await Promise.all([guard(payload.target), guard(payload.target)]);
assert.equal(first, 'orders');
assert.equal(second, 'orders');
assert.equal(restoreCalls, 1);
assert.deepEqual(events, ['guard:start:orders', 'guard:start:orders']);
assert.equal(payload.target.name, 'orders');

console.log(JSON.stringify({ first, second, restoreCalls, events }));
console.log('Vue 导航守卫与会话恢复去重通过');
`,
      },
      stdin:
        '{"target":{"name":"orders","tenantId":"t1","admin":false},"session":{"authenticated":true,"role":"member","tenantId":"t1"},"activeTenant":"t1"}',
      checkpoint:
        '两个并行 guard 都放行 orders，但 restoreCalls 为 1，说明会话恢复 Promise 被复用；把 tenantId 改为 t2 时应返回 /403，登出时应返回 /login。输出 `Vue 导航守卫与会话恢复去重通过` 且退出码为 0。',
    },
    {
      id: 'vue-route-guard-independent',
      title: '独立实践：重定向终止与对象级权限',
      brief:
        'stdin 给出若干路由和重定向边。对每次导航执行最多三次守卫，检测 loop，保留 `redirect` 参数但不允许回流到未知外部地址；最终输出允许、拒绝或循环原因。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly start: string;
  readonly redirects: Readonly<Record<string, string>>;
  readonly allowed: readonly string[];
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const visited: string[] = [];
let current = payload.start;
let outcome = 'allow';

for (let index = 0; index < 3; index += 1) {
  if (visited.includes(current)) {
    outcome = 'loop:' + current;
    break;
  }
  visited.push(current);
  if (current.startsWith('https://') || current.startsWith('//')) {
    outcome = 'external:' + current;
    break;
  }
  if (!payload.allowed.includes(current) && !(current in payload.redirects)) {
    outcome = 'deny:' + current;
    break;
  }
  const next = payload.redirects[current];
  if (!next) break;
  current = next;
}

assert.equal(outcome, 'loop:/admin');
assert.deepEqual(visited, ['/admin', '/account']);
assert.equal(current, '/admin');
assert.ok(!visited.some((route) => route.startsWith('https://')));

console.log(JSON.stringify({ visited, outcome }));
console.log('导航重定向循环终止通过');
`,
      },
      stdin:
        '{"start":"/admin","redirects":{"/admin":"/account","/account":"/admin"},"allowed":["/home","/account"]}',
      checkpoint:
        'visited 必须为 /admin、/account，下一跳重复时 outcome 为 loop:/admin；不允许外部地址进入 visited。输出 `导航重定向循环终止通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · Router、Pinia 与服务器状态：Pinia 模块、actions 与持久化': lab(
    'Vue 代码台 15 · store action、持久化白名单与迁移',
    '实现 Pinia 风格的显式 store 工厂，验证 action 是唯一写入入口、敏感字段不进入持久化、旧版本数据经过 migrate 后才能恢复。',
    {
      id: 'vue-pinia-contract-guided',
      title: '跟做：workspace store 的可检查写入口',
      brief:
        'stdin 给出筛选、访问令牌和旧版持久化数据。store action 只接受已知筛选，返回新快照；persist 只写白名单字段和版本号，migrate 把旧版 page 字符串转成数字。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type PersistedV1 = { readonly version: 1; readonly page: string; readonly status: 'draft' | 'paid' };
type State = {
  readonly filters: { readonly page: number; readonly status: 'draft' | 'paid' };
  readonly accessToken: string;
  readonly dirty: boolean;
};
type Payload = { readonly persisted: PersistedV1; readonly nextStatus: 'draft' | 'paid' };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const persisted = payload.persisted;
const migrated: State = {
  filters: Object.freeze({ page: Number(persisted.page), status: payload.nextStatus }),
  accessToken: 'runtime-only',
  dirty: true,
};

function setStatus(state: State, status: 'draft' | 'paid'): State {
  return Object.freeze({
    ...state,
    filters: Object.freeze({ ...state.filters, status }),
    dirty: true,
  });
}

const next = setStatus(migrated, payload.nextStatus);
const persistedNow = Object.freeze({
  version: 2,
  page: next.filters.page,
  status: next.filters.status,
});
assert.equal(persistedNow.page, 3);
assert.equal(persistedNow.status, payload.nextStatus);
assert.ok(!('accessToken' in persistedNow));
assert.ok(!('dirty' in persistedNow));
assert.equal(next.accessToken, 'runtime-only');
assert.equal(next.filters.page, 3);
assert.notEqual(next, migrated);
assert.notEqual(next.filters, migrated.filters);

console.log(JSON.stringify({ persistedNow, state: next }));
console.log('Pinia action 与持久化白名单通过');
`,
      },
      stdin: '{"persisted":{"version":1,"page":"3","status":"draft"},"nextStatus":"paid"}',
      checkpoint:
        'migrate 后 page 为数字 3，action 将 status 改为 paid；持久化对象只含 version 2、page 3、status paid，不含 accessToken 和 dirty。输出 `Pinia action 与持久化白名单通过` 且退出码为 0。',
    },
    {
      id: 'vue-pinia-contract-independent',
      title: '独立实践：版本迁移与跨标签页同步',
      brief:
        'stdin 给出旧 localStorage、当前版本和新事件。只有版本可迁移时才恢复；跨标签页事件必须校验 schema 和租户，退出时清理运行时 token 并广播新的安全快照。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Stored = { readonly version: number; readonly tenantId: string; readonly page: number; readonly token?: string };
type Payload = {
  readonly stored: Stored;
  readonly currentTenant: string;
  readonly event: Stored;
  readonly currentVersion: number;
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];

function migrate(value: unknown): Stored | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (row.version !== 1 && row.version !== 2) return undefined;
  if (typeof row.tenantId !== 'string' || typeof row.page !== 'number' || !Number.isInteger(row.page)) return undefined;
  return {
    version: payload.currentVersion,
    tenantId: row.tenantId,
    page: row.version === 1 ? row.page + 1 : row.page,
  };
}

const restored = migrate(payload.stored);
assert.ok(restored);
events.push('restore:' + restored.page);
if (payload.event.tenantId !== payload.currentTenant) {
  events.push('ignore:tenant:' + payload.event.tenantId);
} else {
  const incoming = migrate(payload.event);
  if (incoming) events.push('sync:' + incoming.page);
}
events.push('cleanup:token');

assert.deepEqual(restored, { version: 2, tenantId: 't1', page: 4 });
assert.deepEqual(events, ['restore:4', 'sync:5', 'cleanup:token']);
assert.ok(!('token' in restored));

console.log(JSON.stringify({ restored, events }));
console.log('Pinia 持久化迁移与跨标签页隔离通过');
`,
      },
      stdin:
        '{"currentVersion":2,"currentTenant":"t1","stored":{"version":1,"tenantId":"t1","page":3,"token":"old-token"},"event":{"version":1,"tenantId":"t1","page":4}}',
      checkpoint:
        '恢复数据版本为 2、tenantId t1、page 4，事件迁移后 page 5；事件末尾 cleanup:token，恢复对象不含 token。把 event.tenantId 改成 t2 时只能得到 ignore:tenant:t2。输出 `Pinia 持久化迁移与跨标签页隔离通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · Router、Pinia 与服务器状态：请求竞态、重试与错误恢复': lab(
    'Vue 代码台 16 · 错误分类、缓存回退与取消',
    '把 HTTP 状态、网络错误、过期缓存和 AbortSignal 放进明确恢复策略，验证页面不会把取消显示成失败，也不会用过期数据掩盖权限错误。',
    {
      id: 'vue-error-recovery-guided',
      title: '跟做：可恢复错误与缓存回退',
      brief:
        'stdin 给出错误序列和缓存年龄。网络错误与 503 在次数和总时长允许时退避；401 触发一次会话刷新；403/422 立即失败；只有新鲜缓存可在网络故障时标 stale 回退。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type ErrorKind = 'network' | 'http-503' | 'http-401' | 'http-403' | 'http-422';
type Attempt = { readonly at: number; readonly error: ErrorKind };
type Payload = {
  readonly attempts: readonly Attempt[];
  readonly deadline: number;
  readonly cacheAgeMs: number;
  readonly maxCacheAgeMs: number;
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const retryable = new Set<ErrorKind>(['network', 'http-503']);
const events: string[] = [];
let delay = 100;
let refreshUsed = false;
let final = 'pending';

for (const attempt of payload.attempts) {
  events.push('attempt:' + attempt.error);
  if (attempt.error === 'http-401') {
    if (refreshUsed) {
      final = 'auth-failed';
      events.push('stop:refresh-replayed');
      break;
    }
    refreshUsed = true;
    events.push('refresh-session');
    continue;
  }
  if (!retryable.has(attempt.error)) {
    final = 'error:' + attempt.error;
    events.push('show:field-or-permission-error');
    break;
  }
  const retryAt = attempt.at + delay;
  if (retryAt > payload.deadline) {
    if (payload.cacheAgeMs <= payload.maxCacheAgeMs) {
      final = 'stale-cache';
      events.push('fallback:stale-cache');
    } else {
      final = 'error:offline';
      events.push('show:offline-error');
    }
    break;
  }
  events.push('retry-at:' + retryAt);
  delay *= 2;
}

assert.equal(final, 'stale-cache');
assert.deepEqual(events, [
  'attempt:network',
  'retry-at:1100',
  'attempt:http-503',
  'retry-at:1400',
  'attempt:http-503',
  'fallback:stale-cache',
]);
assert.equal(refreshUsed, false);

console.log(JSON.stringify({ final, events, refreshUsed }));
console.log('Vue 错误恢复与 stale 缓存回退通过');
`,
      },
      stdin:
        '{"attempts":[{"at":1000,"error":"network"},{"at":1200,"error":"http-503"},{"at":1400,"error":"http-503"}],"deadline":1500,"cacheAgeMs":30000,"maxCacheAgeMs":60000}',
      checkpoint:
        '三次网络类尝试按 1100、1400、1800 计算退避，第三次因 1800 超过 deadline 1500 而回退 30 秒内的 stale 缓存；final 为 stale-cache。输出 `Vue 错误恢复与 stale 缓存回退通过` 且退出码为 0。',
    },
    {
      id: 'vue-error-recovery-independent',
      title: '独立实践：AbortSignal 与幂等键协同恢复',
      brief:
        'stdin 给出主动取消、超时和重试事件。用户离开时 AbortError 只记录 cancelled；超时进入一次安全重试；非幂等写请求只有在幂等键相同时才能复用结果，权限错误不得回退缓存。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event =
  | { readonly type: 'leave' }
  | { readonly type: 'timeout' }
  | { readonly type: 'http-403' }
  | { readonly type: 'success'; readonly idempotencyKey: string };
type Payload = { readonly events: readonly Event[]; readonly idempotencyKey: string };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const events: string[] = [];
let cancelled = false;
let retries = 0;
let result = 'pending';

for (const event of payload.events) {
  if (event.type === 'leave') {
    cancelled = true;
    events.push('cancelled:abortsignal');
    continue;
  }
  if (event.type === 'timeout') {
    if (retries === 0 && !cancelled) {
      retries += 1;
      events.push('retry:timeout-once');
    } else {
      result = 'error:timeout';
      events.push('show:timeout');
    }
    continue;
  }
  if (event.type === 'http-403') {
    result = 'denied';
    events.push('stop:authorization');
    continue;
  }
  if (event.idempotencyKey !== payload.idempotencyKey) {
    result = 'conflict';
    events.push('reject:idempotency-key');
  } else {
    result = 'success';
    events.push('commit:idempotent-result');
  }
}

assert.equal(cancelled, true);
assert.equal(retries, 1);
assert.equal(result, 'success');
assert.deepEqual(events, [
  'retry:timeout-once',
  'cancelled:abortsignal',
  'commit:idempotent-result',
]);

console.log(JSON.stringify({ result, events, cancelled, retries }));
console.log('Vue AbortSignal 与幂等恢复通过');
`,
      },
      stdin:
        '{"idempotencyKey":"save-42-v3","events":[{"type":"timeout"},{"type":"leave"},{"type":"success","idempotencyKey":"save-42-v3"}]}',
      checkpoint:
        '超时只重试一次，leave 记录 cancelled:abortsignal，最后同幂等键 success 才提交；结果顺序与 checkpoint 一致。把 success 的 key 改成别的值时 result 必须 conflict。输出 `Vue AbortSignal 与幂等恢复通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · Nuxt SSR、部署与运行：服务端数据获取和请求状态隔离': lab(
    'Vue 代码台 17 · SSR 请求上下文与数据快照',
    '为每个 SSR 请求建立独立 store，验证服务端数据 key、用户作用域、序列化 payload 和 hydration 恢复不会跨请求共享状态。',
    {
      id: 'vue-ssr-snapshot-guided',
      title: '跟做：useAsyncData 的请求级 store',
      brief:
        'stdin 给出两个并发请求的用户和课程 slug。每个请求生成独立 key 和 store；只序列化安全课程数据，恢复时检查 key 一致，第二请求不得读到第一请求的私有字段。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Request = { readonly requestId: string; readonly userId: string; readonly slug: string; readonly token: string };
type Payload = { readonly requests: readonly Request[] };
const { requests } = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function createRequestStore(request: Request): Readonly<Record<string, unknown>> {
  return Object.freeze({
    key: ['course', request.slug, 'user', request.userId],
    requestId: request.requestId,
    payload: Object.freeze({
      slug: request.slug,
      greeting: '你好 ' + request.userId,
      courseTitle: '课程 ' + request.slug.toUpperCase(),
    }),
  });
}

const stores = requests.map(createRequestStore);
const serialized = stores.map((store) => JSON.stringify(store));
const restored = serialized.map((text) => JSON.parse(text) as Readonly<Record<string, unknown>>);

assert.notEqual(stores[0], stores[1]);
assert.deepEqual(restored[0]?.key, ['course', 'vue', 'user', 'u1']);
assert.deepEqual(restored[1]?.key, ['course', 'router', 'user', 'u2']);
assert.ok(serialized.every((text) => !text.includes('secret-token')));
assert.ok(serialized.every((text) => !text.includes('request-token')));
assert.equal(restored[1]?.requestId, 'r2');

console.log(JSON.stringify(restored));
console.log('SSR 请求级 store 与数据快照隔离通过');
`,
      },
      stdin:
        '{"requests":[{"requestId":"r1","userId":"u1","slug":"vue","token":"secret-token-1"},{"requestId":"r2","userId":"u2","slug":"router","token":"secret-token-2"}]}',
      checkpoint:
        '两个恢复快照的 key 分别为 course/vue/user/u1 与 course/router/user/u2，requestId 不同；输出不含两个 secret-token。输出 `SSR 请求级 store 与数据快照隔离通过` 且退出码为 0。',
    },
    {
      id: 'vue-ssr-snapshot-independent',
      title: '独立实践：payload 恢复与 hydration 一致性检查',
      brief:
        'stdin 给出服务端渲染文本、客户端初始文本和可变随机值。payload 中只保存确定性状态；客户端恢复后检查序号与文本一致，随机值只在客户端挂载后生成，并验证错误 payload 被拒绝。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly serverText: string;
  readonly clientText: string;
  readonly payloadVersion: number;
  readonly payload: { readonly text: string; readonly requestId: string; readonly clientOnlyRandom?: string };
};
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;

function hydrate(): { readonly text: string; readonly random: string; readonly warnings: readonly string[] } {
  const warnings: string[] = [];
  if (payload.payloadVersion !== 2) warnings.push('payload-version');
  if (payload.payload.clientOnlyRandom !== undefined) warnings.push('client-value-in-payload');
  const text = payload.payload.text === payload.clientText ? payload.payload.text : payload.serverText;
  if (payload.serverText !== payload.clientText) warnings.push('text-mismatch');
  return { text, random: 'mounted-' + payload.payload.requestId, warnings };
}

const result = hydrate();
assert.equal(result.text, '课程目录');
assert.deepEqual(result.warnings, ['payload-version', 'client-value-in-payload']);
assert.equal(result.random, 'mounted-r9');
assert.ok(!JSON.stringify({ text: payload.payload.text, requestId: payload.payload.requestId }).includes('random'));

console.log(JSON.stringify(result));
console.log('SSR payload 恢复与 hydration 一致性检查通过');
`,
      },
      stdin:
        '{"serverText":"课程目录","clientText":"课程目录","payloadVersion":1,"payload":{"text":"课程目录","requestId":"r9","clientOnlyRandom":"Math.random"}}',
      checkpoint:
        '恢复文本为“课程目录”，随机值只在客户端生成 mounted-r9；warnings 恰含 payload-version 与 client-value-in-payload，说明旧 payload 与把随机值塞进服务端快照都被识别。输出 `SSR payload 恢复与 hydration 一致性检查通过` 且退出码为 0。',
    },
  ),
  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：scheduler 队列与批量更新': lab(
    'Vue 代码台 18 · 调度队列、阶段顺序和递归上限',
    '复刻 Vue 调度器的去重队列、pre/render/post 阶段、刷新期间新增任务和递归更新上限，验证顺序与错误暴露方式。',
    {
      id: 'vue-scheduler-queue-guided',
      title: '跟做：pre、render、post 三阶段刷新',
      brief:
        'stdin 给出组件 id 和阶段。同步内多个相同任务只入队一次；flush 先执行 pre，再执行唯一 render，最后执行 post。刷新期间追加同一 id 不得重复执行。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Job = { readonly id: string; readonly phase: 'pre' | 'render' | 'post' };
type Payload = { readonly jobs: readonly Job[] };
const { jobs } = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const queue = new Map<string, Job>();
const executed: string[] = [];

function queueJob(job: Job): void {
  const key = job.phase + ':' + job.id;
  if (!queue.has(key)) queue.set(key, job);
}

function flush(): void {
  const ordered = [...queue.values()].sort((left, right) => {
    const phase = { pre: 0, render: 1, post: 2 } as const;
    return phase[left.phase] - phase[right.phase] || left.id.localeCompare(right.id);
  });
  for (const item of ordered) {
    const itemKey = item.phase + ':' + item.id;
    if (!queue.has(itemKey)) continue;
    queue.delete(itemKey);
    executed.push(itemKey);
  }
}

for (const job of jobs) queueJob(job);
flush();
assert.deepEqual(executed, [
  'pre:a',
  'render:a',
  'render:b',
  'post:a',
]);
assert.equal(queue.size, 0);

console.log(JSON.stringify({ executed, remaining: queue.size }));
console.log('Scheduler 阶段顺序与去重通过');
`,
      },
      stdin:
        '{"jobs":[{"id":"a","phase":"post"},{"id":"a","phase":"render"},{"id":"a","phase":"pre"},{"id":"b","phase":"render"},{"id":"a","phase":"render"}]}',
      checkpoint:
        '输出顺序必须为 pre:a、render:a、render:b、post:a；重复 render:a 只执行一次，remaining 为 0。输出 `Scheduler 阶段顺序与去重通过` 且退出码为 0。',
    },
    {
      id: 'vue-scheduler-queue-independent',
      title: '独立实践：刷新中追加任务与递归错误',
      brief:
        'stdin 给出初始任务、刷新期间追加任务和最大更新次数。队列按 id 稳定排序但刷新过程中新增任务可继续执行；达到上限时抛出“Maximum recursive updates exceeded”。',
      defaultLanguage: 'typescript',
      starterCode: {
        typescript: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = { readonly initial: readonly string[]; readonly append: readonly string[]; readonly maxUpdates: number };
const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const queue = new Set(payload.initial);
const executed: string[] = [];
let updates = 0;

function flush(): void {
  while (queue.size > 0) {
    if (updates >= payload.maxUpdates) throw new Error('Maximum recursive updates exceeded');
    const id = [...queue].sort()[0];
    if (!id) break;
    queue.delete(id);
    updates += 1;
    executed.push(id);
    if (id === 'a' && payload.append.length > 0) {
      for (const item of payload.append) queue.add(item);
    }
  }
}

flush();
assert.deepEqual(executed, ['a', 'b']);
assert.equal(updates, 2);
assert.equal(queue.size, 0);

console.log(JSON.stringify({ executed, updates }));
console.log('Scheduler 刷新中追加任务通过');
`,
      },
      stdin: '{"initial":["a"],"append":["b"],"maxUpdates":10}',
      checkpoint:
        '初始 a 执行时追加 b，随后稳定执行 b；顺序为 a、b，updates 为 2，队列为空。把 append 设为 ["a"] 且 maxUpdates 设为 2 时应触发 Maximum recursive updates exceeded。输出 `Scheduler 刷新中追加任务通过` 且退出码为 0。',
    },
  ),
};
