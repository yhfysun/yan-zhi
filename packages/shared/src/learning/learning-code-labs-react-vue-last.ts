import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const runtime = {
  requiredRuntime: 'node',
  runtimeLabel: 'React/Vue 语义模拟 · TypeScript 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 执行：node --experimental-strip-types main.ts。',
    '本代码台不导入 React、Vue 或第三方库；长任务、错误边界、Fiber、Hooks、Scheduler、commit、路由、缓存、SSR、编译、性能与可访问性均由任务内的确定性运行时模拟。',
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
 * React/Vue 最后一组手写课程实验室。
 *
 * 36 个任务只验证可由普通 TypeScript 确定性证明的框架契约。它们不声称
 * 执行真实 React、Vue、DOM 或浏览器，也不替代真实视觉、hydration 和
 * 辅助技术验收。
 */
export const LEARNING_CODE_LABS_REACT_VUE_LAST: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:React · 测试、性能与可访问性：渲染、长任务与 Web Vitals': lab(
    'React 收尾代码台 01 · Web Vitals 与长任务归因',
    '从交互延迟和渲染任务样本计算 p75 INP、长任务与超预算帧，再把性能问题定位到具体渲染阶段。',
    task({
      id: 'react-last-vitals-guided',
      title: '跟做：计算 INP p75 与长任务',
      brief:
        'stdin 给出交互延迟和渲染任务毫秒数。用最近秩法计算 p75 INP，统计超过 50ms 的长任务和总阻塞时间，断言指标与最慢任务。',
      stdin:
        '{"interactions":[120,180,260,420],"tasks":[28,72,36,96,44],"budget":50}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  interactions: number[];
  tasks: number[];
  budget: number;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;

function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error("指标样本不能为空");
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(percentile * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

const inp75 = nearestRank(input.interactions, 0.75);
const longTasks = input.tasks.filter((duration) => duration > input.budget);
const blockingTime = longTasks.reduce(
  (total, duration) => total + duration - input.budget,
  0,
);
const slowest = Math.max(...input.tasks);

assert.equal(inp75, 260);
assert.deepEqual(longTasks, [72, 96]);
assert.equal(blockingTime, 68);
assert.equal(slowest, 96);

console.log(JSON.stringify({ inp75, longTasks, blockingTime, slowest }));
console.log("Web Vitals 聚合断言通过");`,
      checkpoint:
        '输出 inp75=260、longTasks=[72,96]、blockingTime=68；控制台出现“Web Vitals 聚合断言通过”且退出码为 0。把最近秩实现改成错误的向下取整时，p75 实际值应变为 180 并触发断言。',
    }),
    task({
      id: 'react-last-vitals-independent',
      title: '独立实践：按阶段归因超预算帧',
      brief:
        'stdin 给出每帧的 render、commit 与 paint 耗时。以 16ms 为预算，找出超预算帧并归因到贡献最大的阶段，输出超预算总量与最慢阶段。',
      stdin:
        '{"budget":16,"frames":[{"id":"f1","render":5,"commit":3,"paint":2},{"id":"f2","render":18,"commit":2,"paint":3},{"id":"f3","render":4,"commit":9,"paint":6},{"id":"f4","render":8,"commit":5,"paint":12}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Frame = {
  id: string;
  render: number;
  commit: number;
  paint: number;
};
type Payload = { budget: number; frames: Frame[] };
type Phase = "render" | "commit" | "paint";

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const overBudget = input.frames
  .map((frame) => {
    const durations: Record<Phase, number> = {
      render: frame.render,
      commit: frame.commit,
      paint: frame.paint,
    };
    const total = frame.render + frame.commit + frame.paint;
    const dominant = (Object.entries(durations) as [Phase, number][])
      .sort((left, right) => right[1] - left[1])[0][0];
    return { id: frame.id, total, dominant, excess: total - input.budget };
  })
  .filter((frame) => frame.total > input.budget);

assert.deepEqual(
  overBudget.map((frame) => frame.id),
  ["f2", "f3", "f4"],
);
assert.deepEqual(
  overBudget.map((frame) => frame.dominant),
  ["render", "commit", "paint"],
);
assert.equal(
  overBudget.reduce((sum, frame) => sum + frame.excess, 0),
  19,
);
assert.equal(Math.max(...overBudget.map((frame) => frame.total)), 25);

console.log(JSON.stringify({ overBudget, excess: 19, slowest: 25 }));
console.log("帧预算阶段归因通过");`,
      checkpoint:
        '超预算帧依次为 f2/render、f3/commit、f4/paint，超预算总时为 19ms，最慢帧为 25ms；出现“帧预算阶段归因通过”。把 f3 的 commit 改成 2ms 后，其主因必须发生变化，原断言应失败。',
    }),
  ),
  'programming:React · 测试、性能与可访问性：错误边界、日志和真实用户监控': lab(
    'React 收尾代码台 02 · 错误边界与 RUM 上报',
    '模拟错误边界捕获、恢复和 RUM 事件脱敏、采样与批量发送，验证故障不会击穿整个应用。',
    task({
      id: 'react-last-error-boundary-guided',
      title: '跟做：错误边界捕获与重试',
      brief:
        'stdin 给出渲染动作流。边界首次捕获子组件异常后显示 fallback，阻止后续子组件渲染；收到 retry 后重新尝试一次。',
      stdin:
        '{"component":"CoursePanel","actions":["render","throw","render","retry","render"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  component: string;
  actions: Array<"render" | "throw" | "retry">;
};
type BoundaryState =
  | { mode: "ready"; renderCount: number; captured: string | null }
  | { mode: "fallback"; renderCount: number; captured: string };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
let state: BoundaryState = {
  mode: "ready",
  renderCount: 0,
  captured: null,
};
const transitions: string[] = [];

for (const action of input.actions) {
  if (action === "render") {
    if (state.mode === "fallback") {
      transitions.push("fallback");
      continue;
    }
    state = { ...state, renderCount: state.renderCount + 1 };
    transitions.push("child");
    continue;
  }
  if (action === "throw") {
    if (state.mode === "fallback") throw new Error("fallback 不应重复捕获");
    state = {
      mode: "fallback",
      renderCount: state.renderCount,
      captured: input.component + ":render-error",
    };
    transitions.push("captured");
    continue;
  }
  if (state.mode === "fallback") {
    state = {
      mode: "ready",
      renderCount: state.renderCount,
      captured: state.captured,
    };
    transitions.push("retry");
  }
}

assert.deepEqual(transitions, [
  "child",
  "captured",
  "fallback",
  "retry",
  "child",
]);
assert.equal(state.mode, "ready");
assert.equal(state.renderCount, 2);
assert.equal(state.captured, "CoursePanel:render-error");

console.log(JSON.stringify({ transitions, state }));
console.log("错误边界隔离与重试通过");`,
      checkpoint:
        '转场依次为 child、captured、fallback、retry、child，最终恢复 ready 且子组件只成功渲染两次；出现“错误边界隔离与重试通过”。若在 fallback 期间继续渲染子组件，断言必须失败。',
    }),
    task({
      id: 'react-last-rum-independent',
      title: '独立实践：RUM 脱敏、采样和批量',
      brief:
        'stdin 给出错误事件与采样率。脱敏邮箱和 bearer token，按事件 id 稳定采样，再以最多两件分批，保留丢弃计数。',
      stdin:
        '{"sampleRate":50,"batchSize":2,"events":[{"id":"e1","message":"用户 ada@example.com 失败","token":"Bearer secret-1","route":"/courses/1"},{"id":"e2","message":"超时","token":"Bearer secret-2","route":"/courses/2"},{"id":"e3","message":"空列表","token":"Bearer secret-3","route":"/courses/3"},{"id":"e4","message":"x@y.com 重复","token":"Bearer secret-4","route":"/courses/4"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type EventInput = {
  id: string;
  message: string;
  token: string;
  route: string;
};
type Payload = {
  sampleRate: number;
  batchSize: number;
  events: EventInput[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;

function bucket(id: string): number {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

const sanitized = input.events
  .filter((event) => bucket(event.id) < input.sampleRate)
  .map((event) => ({
    id: event.id,
    route: event.route,
    message: event.message
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")
      .replace(/^Bearer\\s+.*$/i, "[token]"),
  }));
const batches: typeof sanitized[] = [];
for (let index = 0; index < sanitized.length; index += input.batchSize) {
  batches.push(sanitized.slice(index, index + input.batchSize));
}

assert.equal(sanitized.length, 2);
assert.equal(batches.length, 1);
assert.equal(sanitized.some((event) => event.message.includes("@")), false);
assert.equal(sanitized.every((event) => !event.message.includes("secret")), true);
assert.deepEqual(
  sanitized.map((event) => event.id),
  ["e2", "e3"],
);

console.log(JSON.stringify({ sampled: sanitized, batches }));
console.log("RUM 脱敏与稳定采样通过");`,
      checkpoint:
        '稳定采样保留 e2、e3，邮箱与 token 均被占位符替换，两件事件形成 1 个批次；出现“RUM 脱敏与稳定采样通过”。若按数组下标而非事件 id 采样，修改输入顺序后结果会漂移并破坏稳定归因。',
    }),
  ),
  'programming:React · 测试、性能与可访问性：可访问性与性能联合验收': lab(
    'React 收尾代码台 03 · 键盘、对比度与渲染预算',
    '把键盘顺序、可访问名称、对比度和长任务放进同一份发布门禁，避免性能优化牺牲可操作性。',
    task({
      id: 'react-last-keyboard-guided',
      title: '跟做：键盘焦点顺序与名称',
      brief:
        'stdin 给出控件 DOM 顺序、tabIndex、禁用状态和可访问名称。过滤不可聚焦控件，按正向 tab 顺序输出焦点 id，并找出缺失名称的控件。',
      stdin:
        '{"controls":[{"id":"search","order":1,"tabIndex":0,"disabled":false,"name":"搜索课程"},{"id":"hidden","order":2,"tabIndex":-1,"disabled":false,"name":"内部锚点"},{"id":"submit","order":3,"tabIndex":0,"disabled":false,"name":""},{"id":"save","order":4,"tabIndex":0,"disabled":true,"name":"保存"},{"id":"next","order":5,"tabIndex":0,"disabled":false,"name":"下一页"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Control = {
  id: string;
  order: number;
  tabIndex: number;
  disabled: boolean;
  name: string;
};
type Payload = { controls: Control[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const focusable = input.controls
  .filter((control) => !control.disabled && control.tabIndex >= 0)
  .sort((left, right) => left.tabIndex - right.tabIndex || left.order - right.order);
const focusOrder = focusable.map((control) => control.id);
const missingNames = focusable
  .filter((control) => control.name.trim().length === 0)
  .map((control) => control.id);

assert.deepEqual(focusOrder, ["search", "submit", "next"]);
assert.deepEqual(missingNames, ["submit"]);
assert.equal(input.controls.find((control) => control.id === "hidden")?.tabIndex, -1);
assert.equal(focusable.at(-1)?.id, "next");

console.log(JSON.stringify({ focusOrder, missingNames }));
console.log("键盘顺序与名称审计通过");`,
      checkpoint:
        '焦点顺序为 search → submit → next，缺失可访问名称的控件仅为 submit；出现“键盘顺序与名称审计通过”。若把 tabIndex=-1 的 hidden 强制加入顺序，断言必须失败。',
    }),
    task({
      id: 'react-last-a11y-performance-independent',
      title: '独立实践：可访问性与性能联合门禁',
      brief:
        'stdin 给出对比度、最小触控尺寸、长任务数和关键流程键盘通过数。任一硬门槛失败即阻止发布，并同时保留性能与无障碍原因。',
      stdin:
        '{"contrast":4.9,"minTouchPx":40,"longTasks":2,"keyboard": {"passed":2,"total":2}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  contrast: number;
  minTouchPx: number;
  longTasks: number;
  keyboard: { passed: number; total: number };
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const blockers: string[] = [];
if (input.contrast < 4.5) blockers.push("contrast");
if (input.minTouchPx < 44) blockers.push("touch-target");
if (input.longTasks > 1) blockers.push("long-task-budget");
if (input.keyboard.passed !== input.keyboard.total) {
  blockers.push("keyboard-regression");
}

const result = {
  decision: blockers.length === 0 ? "ship" : "hold",
  blockers,
  a11yScore: Math.min(100, Math.round(input.contrast * 10 + input.minTouchPx)),
  interactionBudget: input.longTasks === 0 ? "good" : "watch",
};

assert.equal(result.decision, "hold");
assert.deepEqual(result.blockers, ["touch-target", "long-task-budget"]);
assert.equal(result.a11yScore, 89);
assert.equal(result.interactionBudget, "watch");

console.log(JSON.stringify(result));
console.log("性能与无障碍联合门禁通过");`,
      checkpoint:
        '发布决定为 hold，阻塞项为 touch-target 与 long-task-budget，a11yScore=89；出现“性能与无障碍联合门禁通过”。仅改善对比度不能清除两个阻塞项，联合门禁仍应失败。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：源码仓库、版本和入口': lab(
    'React 收尾代码台 04 · 仓库入口与版本条件',
    '解析 React monorepo 的源码入口、包导出条件和版本兼容矩阵，用证据定位构建实际加载的文件。',
    task({
      id: 'react-last-source-entry-guided',
      title: '跟做：依赖图入口与环检测',
      brief:
        'stdin 给出包模块依赖图与入口。从入口执行深度优先遍历，输出确定性的加载顺序，并把首个环作为构建错误。',
      stdin:
        '{"entry":"index","modules":{"index":["react","react-dom"],"react":["shared"],"react-dom":["shared"],"shared":[]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  entry: string;
  modules: Record<string, string[]>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const visiting: string[] = [];
const visited = new Set<string>();
const loadOrder: string[] = [];

function visit(moduleName: string): void {
  if (visiting.includes(moduleName)) {
    throw new Error("循环依赖：" + [...visiting, moduleName].join(" -> "));
  }
  if (visited.has(moduleName)) return;
  const dependencies = input.modules[moduleName];
  if (!dependencies) throw new Error("未知模块：" + moduleName);
  visiting.push(moduleName);
  for (const dependency of dependencies) visit(dependency);
  visiting.pop();
  visited.add(moduleName);
  loadOrder.push(moduleName);
}

visit(input.entry);
assert.deepEqual(loadOrder, ["shared", "react", "react-dom", "index"]);
assert.throws(
  () => {
    visiting.push("index");
    try {
      visit("index");
    } finally {
      visiting.pop();
    }
  },
  /循环依赖/,
);

console.log(JSON.stringify({ loadOrder }));
console.log("React 源码入口图断言通过");`,
      checkpoint:
        '加载顺序必须为 shared、react、react-dom、index；出现“React 源码入口图断言通过”。将 shared 的一个依赖改回 index 后必须抛出循环依赖，不能继续生成不完整产物。',
    }),
    task({
      id: 'react-last-source-exports-independent',
      title: '独立实践：解析 exports 条件与版本',
      brief:
        'stdin 给出 package.json exports、当前 conditions 和 peer 版本。按 conditions 优先顺序解析入口，并用简单 semver 范围判断 peer 是否兼容。',
      stdin:
        '{"conditions":["browser","development","default"],"version":"19.1.0","peerRange":">=18.0.0 <20.0.0","exports":{"browser":{"development":"./browser-dev.js","default":"./browser-prod.js"},"default":"./index.js"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Json = string | Json[] | { [key: string]: Json };
type Payload = {
  conditions: string[];
  version: string;
  peerRange: string;
  exports: Json;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;

function resolve(target: Json): string {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const candidate of target) {
      try {
        return resolve(candidate);
      } catch {
        // 继续尝试下一个合法候选。
      }
    }
    throw new Error("没有可用导出");
  }
  for (const condition of input.conditions) {
    if (condition in target) {
      try {
        return resolve(target[condition]);
      } catch {
        // 当前条件不适用，继续检查下一个。
      }
    }
  }
  throw new Error("条件未命中");
}

function inRange(version: string, range: string): boolean {
  const current = version.split(".").map(Number);
  const minimum = range.match(/>=([0-9.]+)/)?.[1].split(".").map(Number);
  const maximum = range.match(/<([0-9.]+)/)?.[1].split(".").map(Number);
  if (!minimum || !maximum) throw new Error("不支持的范围");
  const atLeast = current[0] > minimum[0] ||
    (current[0] === minimum[0] && current[1] > minimum[1]);
  const below = current[0] < maximum[0];
  return atLeast && below;
}

const entry = resolve(input.exports);
const compatible = inRange(input.version, input.peerRange);
assert.equal(entry, "./browser-dev.js");
assert.equal(compatible, true);
assert.throws(() => resolve({ browser: { production: "./prod.js" } }), /条件未命中/);

console.log(JSON.stringify({ entry, compatible, version: input.version }));
console.log("exports 条件与版本矩阵通过");`,
      checkpoint:
        '解析入口为 ./browser-dev.js，React 19.1.0 对 peer 范围兼容；出现“exports 条件与版本矩阵通过”。把 conditions 改为只有 production 后，输入必须无法命中而抛错。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：Fiber 节点和工作循环': lab(
    'React 收尾代码台 05 · Fiber 树与工作循环',
    '用最小 Fiber 模型验证树遍历、宿主节点统计、删除标记和时间切片让出。',
    task({
      id: 'react-last-fiber-tree-guided',
      title: '跟做：遍历 Fiber 与收集删除',
      brief:
        'stdin 给出 Fiber 树。深度优先输出节点、统计宿主节点标签，并收集 flaggedAsDeletion 的节点 id。',
      stdin:
        '{"tree":{"id":"root","type":"Root","kind":"host","children":[{"id":"header","type":"header","kind":"host","children":[]},{"id":"panel","type":"CoursePanel","kind":"composite","children":[{"id":"old","type":"li","kind":"host","flaggedAsDeletion":true,"children":[]},{"id":"row","type":"li","kind":"host","children":[]}]}]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Fiber = {
  id: string;
  type: string;
  kind: "host" | "composite";
  flaggedAsDeletion?: boolean;
  children: Fiber[];
};
type Payload = { tree: Fiber };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const traversal: string[] = [];
const deletions: string[] = [];
const hostTypes: string[] = [];

function walk(fiber: Fiber): void {
  if (fiber.flaggedAsDeletion) {
    deletions.push(fiber.id);
    return;
  }
  traversal.push(fiber.id);
  if (fiber.kind === "host") hostTypes.push(fiber.type);
  for (const child of fiber.children) walk(child);
}

walk(input.tree);
assert.deepEqual(traversal, ["root", "header", "panel", "row"]);
assert.deepEqual(deletions, ["old"]);
assert.deepEqual(hostTypes, ["Root", "header", "li"]);
assert.equal(traversal.includes("old"), false);

console.log(JSON.stringify({ traversal, deletions, hostTypes }));
console.log("Fiber 树遍历与删除标记通过");`,
      checkpoint:
        '遍历顺序为 root、header、panel、row，删除集合仅 old，宿主类型为 Root、header、li；出现“Fiber 树遍历与删除标记通过”。删除节点仍出现在普通遍历中即说明 Fiber flags 被忽略。',
    }),
    task({
      id: 'react-last-fiber-workloop-independent',
      title: '独立实践：带时间切片的 work loop',
      brief:
        'stdin 给出每项工作耗时和每片预算。按队列顺序执行，预算耗尽时让出控制权，下一轮继续；输出完成项、让出次数和总片数。',
      stdin:
        '{"sliceBudget":10,"work":[{"id":"begin-1","cost":4},{"id":"complete-1","cost":5},{"id":"begin-2","cost":3},{"id":"complete-2","cost":6},{"id":"commit","cost":2}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Unit = { id: string; cost: number };
type Payload = { sliceBudget: number; work: Unit[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const completed: string[] = [];
const slices: string[][] = [];
let index = 0;

while (index < input.work.length) {
  const slice: string[] = [];
  let used = 0;
  while (index < input.work.length) {
    const unit = input.work[index];
    if (slice.length > 0 && used + unit.cost > input.sliceBudget) break;
    slice.push(unit.id);
    used += unit.cost;
    completed.push(unit.id);
    index += 1;
  }
  if (slice.length === 0) throw new Error("单个任务永远无法让出");
  slices.push(slice);
}

assert.equal(slices.length, 3);
assert.deepEqual(slices, [
  ["begin-1", "complete-1"],
  ["begin-2", "complete-2"],
  ["commit"],
]);
assert.equal(slices.slice(0, -1).length, 2);
assert.equal(completed.at(-1), "commit");

console.log(JSON.stringify({ slices, yields: slices.length - 1 }));
console.log("Fiber work loop 时间切片通过");`,
      checkpoint:
        '工作被分为 3 片：begin-1/complete-1、begin-2/complete-2、commit，主动让出两次；出现“Fiber work loop 时间切片通过”。如果把预算改成 100，片数应降为 1，原断言会失败。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：Hooks 链表与更新队列': lab(
    'React 收尾代码台 06 · Hooks 槽位与更新队列',
    '模拟多次 render 中的 hook 链表、更新队列和 lane 优先级，验证顺序稳定与低优先级重放。',
    task({
      id: 'react-last-hooks-chain-guided',
      title: '跟做：Hook 槽位和动作队列',
      brief:
        'stdin 给出一组件若干轮 render 与 setState 动作。按 hook 槽位顺序执行动作，输出每轮状态快照和钩子数量。',
      stdin:
        '{"renders":[{"count":0,"name":"Ada"},{"count":1,"name":"Ada"},{"count":1,"name":"Lin"},{"count":2,"name":"Lin"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Snapshot = { count: number; name: string };
type Payload = { renders: Snapshot[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const hooks: Array<{ slot: number; value: unknown }> = [];
const snapshots: Snapshot[] = [];

function useSlot<T>(slot: number, initialValue: T): T {
  if (!hooks[slot]) hooks[slot] = { slot, value: initialValue };
  hooks[slot].value = initialValue;
  return hooks[slot].value as T;
}

for (const render of input.renders) {
  const count = useSlot(0, render.count);
  const name = useSlot(1, render.name);
  const hydrated = {
    count: typeof count === "number" ? count : 0,
    name: typeof name === "string" ? name : "",
  };
  snapshots.push(hydrated);
  hooks[0].value = render.count;
  hooks[1].value = render.name;
}

assert.deepEqual(snapshots, input.renders);
assert.equal(hooks.length, 2);
assert.deepEqual(hooks.map((hook) => hook.slot), [0, 1]);
assert.equal(snapshots.at(-1)?.count, 2);

console.log(JSON.stringify({ hooks, snapshots }));
console.log("Hooks 槽位顺序与快照通过");`,
      checkpoint:
        'hook 链只有槽位 0、1，四轮快照与输入一致；出现“Hooks 槽位顺序与快照通过”。若在条件分支中跳过一次 useSlot，后续槽位会错配且最后状态断言失败。',
    }),
    task({
      id: 'react-last-hooks-lanes-independent',
      title: '独立实践：lane 优先级与更新重放',
      brief:
        'stdin 给出同一 hook 的更新队列。先执行全部最高优先级 lane，再保留低优先级更新等待下一轮，计算每轮最终值。',
      stdin:
        '{"initial":0,"updates":[{"lane":"sync","value":1},{"lane":"transition","value":2},{"lane":"sync","value":3},{"lane":"transition","value":4}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Update = { lane: "sync" | "transition"; value: number };
type Payload = { initial: number; updates: Update[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
let base = input.initial;
let pending = [...input.updates];
const rounds: Array<{ lane: string; value: number; rebased: number }> = [];

while (pending.length > 0) {
  const processSync = pending.some((update) => update.lane === "sync");
  const selectedLane = processSync ? "sync" : "transition";
  const selected = pending.filter((update) => update.lane === selectedLane);
  const remaining = pending.filter((update) => update.lane !== selectedLane);
  for (const update of selected) base = update.value;
  rounds.push({
    lane: selectedLane,
    value: base,
    rebased: remaining.length,
  });
  pending = remaining;
}

assert.deepEqual(rounds, [
  { lane: "sync", value: 3, rebased: 2 },
  { lane: "transition", value: 4, rebased: 0 },
]);
assert.equal(base, 4);
assert.equal(rounds.reduce((sum, round) => sum + round.rebased, 0), 2);

console.log(JSON.stringify({ rounds, final: base }));
console.log("Hooks lane 更新重放通过");`,
      checkpoint:
        '第一轮只处理 sync，最终值 3 且保留 2 条 transition；第二轮处理 transition，最终值 4；出现“Hooks lane 更新重放通过”。先处理 transition 会改变轮次与最终路径并触发断言。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：Scheduler 优先级和可中断渲染': lab(
    'React 收尾代码台 07 · Scheduler 优先级与可中断任务',
    '比较回调优先级、过期时间和时间切片，验证紧急工作先执行而长任务可恢复。',
    task({
      id: 'react-last-scheduler-guided',
      title: '跟做：选择下一项 Scheduler 工作',
      brief:
        'stdin 给出任务优先级与过期时间。按过期任务优先、再按 priority 数值小者优先的规则排序，输出执行顺序。',
      stdin:
        '{"now":100,"tasks":[{"id":"transition","priority":3,"expiresAt":180},{"id":"blocking","priority":1,"expiresAt":160},{"id":"expired","priority":5,"expiresAt":90},{"id":"normal","priority":2,"expiresAt":140}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type SchedulerTask = {
  id: string;
  priority: number;
  expiresAt: number;
};
type Payload = { now: number; tasks: SchedulerTask[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const order = [...input.tasks]
  .sort((left, right) => {
    const leftExpired = left.expiresAt <= input.now;
    const rightExpired = right.expiresAt <= input.now;
    if (leftExpired !== rightExpired) return leftExpired ? -1 : 1;
    return left.priority - right.priority;
  })
  .map((task) => task.id);
const expired = input.tasks
  .filter((task) => task.expiresAt <= input.now)
  .map((task) => task.id);

assert.deepEqual(order, ["expired", "blocking", "normal", "transition"]);
assert.deepEqual(expired, ["expired"]);
assert.equal(order[0], "expired");

console.log(JSON.stringify({ order, expired }));
console.log("Scheduler 优先级排序通过");`,
      checkpoint:
        '执行顺序为 expired、blocking、normal、transition，过期集合仅 expired；出现“Scheduler 优先级排序通过”。若忽略过期标志，priority=1 的 blocking 会错误抢到第一。',
    }),
    task({
      id: 'react-last-scheduler-interrupt-independent',
      title: '独立实践：可中断渲染的恢复游标',
      brief:
        'stdin 给出不同优先级的 Fiber 工作单元与每片预算。高优任务插入后中断当前工作，先完成紧急树，再从未完成单元恢复旧树。',
      stdin:
        '{"budget":4,"low":[{"id":"low-a","cost":3},{"id":"low-b","cost":2},{"id":"low-c","cost":2}],"urgent":[{"id":"urgent-a","cost":2},{"id":"urgent-b","cost":1}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Unit = { id: string; cost: number };
type Payload = { budget: number; low: Unit[]; urgent: Unit[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;

function complete(work: Unit[]): { done: string[]; partial: Unit | null; slices: number } {
  const done: string[] = [];
  let index = 0;
  let slices = 0;
  while (index < work.length) {
    let used = 0;
    slices += 1;
    while (index < work.length) {
      const unit = work[index];
      if (used + unit.cost > input.budget) {
        if (done.length === 0) throw new Error("工作单元超过单次预算：" + unit.id);
        return { done, partial: unit, slices };
      }
      used += unit.cost;
      done.push(unit.id);
      index += 1;
    }
  }
  return { done, partial: null, slices };
}

const urgent = complete(input.urgent);
const resumed = complete(input.low);
assert.deepEqual(urgent.done, ["urgent-a", "urgent-b"]);
assert.equal(urgent.slices, 1);
assert.deepEqual(resumed.done, ["low-a"]);
assert.equal(resumed.partial?.id, "low-b");
assert.equal(resumed.slices, 1);

console.log(JSON.stringify({ urgent, resumed }));
console.log("Scheduler 中断与恢复游标通过");`,
      checkpoint:
        '紧急树在 1 片内完成 urgent-a、urgent-b；低优树完成 low-a 后停在 low-b 并保留恢复游标；出现“Scheduler 中断与恢复游标通过”。把 low-b 从恢复队列丢弃后，partial 断言必须失败。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：commit 阶段与副作用': lab(
    'React 收尾代码台 08 · commit 子阶段与副作用顺序',
    '验证 mutation、layout、passive 的提交顺序，以及删除、插入和清理函数的可观察行为。',
    task({
      id: 'react-last-commit-order-guided',
      title: '跟做：commit 子阶段执行顺序',
      brief:
        'stdin 给出 Fiber 节点及 insertion、layout、passive 副作用。按 mutation → layout → passive 顺序执行，子节点先于父节点完成 layout 清理。',
      stdin:
        '{"nodes":[{"id":"parent","effect":"update","insertion":false,"layout":"measure-parent","passive":"log-parent"},{"id":"child","effect":"insert","insertion":true,"layout":"measure-child","passive":"log-child"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Node = {
  id: string;
  effect: "insert" | "update" | "delete";
  insertion: boolean;
  layout: string;
  passive: string;
};
type Payload = { nodes: Node[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const log: string[] = [];

for (const node of input.nodes) {
  if (node.insertion) log.push("insert:" + node.id);
}
for (const node of [...input.nodes].reverse()) {
  if (node.effect !== "delete") log.push("layout:" + node.layout);
}
for (const node of input.nodes) log.push("passive:" + node.passive);

assert.deepEqual(log, [
  "insert:child",
  "layout:measure-child",
  "layout:measure-parent",
  "passive:log-parent",
  "passive:log-child",
]);
assert.equal(log.findIndex((entry) => entry.startsWith("layout:")), 1);
assert.equal(log.findIndex((entry) => entry.startsWith("passive:")), 3);

console.log(JSON.stringify({ log }));
console.log("commit 子阶段顺序断言通过");`,
      checkpoint:
        '日志先插入 child，再子后父执行 layout，最后父后子执行 passive；出现“commit 子阶段顺序断言通过”。把 passive 与 layout 对调会破坏阶段边界和索引断言。',
    }),
    task({
      id: 'react-last-commit-cleanup-independent',
      title: '独立实践：删除与重排时的副作用清理',
      brief:
        'stdin 给出旧、新子树。先对消失 key 执行 layout cleanup 和 passive cleanup，再为保留节点记录新位置，最后插入新节点；输出完整提交计划。',
      stdin:
        '{"old":["a","b","c"],"new":["c","a","d"],"cleanup":{"a":"close-a","b":"close-b","c":"close-c"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  old: string[];
  new: string[];
  cleanup: Record<string, string>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const oldKeys = new Set(input.old);
const newKeys = new Set(input.new);
const deleted = input.old.filter((id) => !newKeys.has(id));
const inserted = input.new.filter((id) => !oldKeys.has(id));
const moved = input.new.filter((id) => oldKeys.has(id));
const plan: string[] = [];

for (const id of deleted) plan.push("layout-cleanup:" + input.cleanup[id]);
for (const id of deleted) plan.push("passive-cleanup:" + input.cleanup[id]);
for (const id of moved) {
  const oldIndex = input.old.indexOf(id);
  const newIndex = input.new.indexOf(id);
  plan.push("move:" + id + ":" + oldIndex + "->" + newIndex);
}
for (const id of inserted) plan.push("insert:" + id);

assert.deepEqual(deleted, ["b"]);
assert.deepEqual(inserted, ["d"]);
assert.deepEqual(moved, ["c", "a"]);
assert.deepEqual(plan, [
  "layout-cleanup:close-b",
  "passive-cleanup:close-b",
  "move:c:2->0",
  "move:a:0->1",
  "insert:d",
]);

console.log(JSON.stringify({ deleted, inserted, moved, plan }));
console.log("commit 清理与重排计划通过");`,
      checkpoint:
        '删除 b 的两类清理先执行，随后记录 c 从 2→0、a 从 0→1，最后插入 d；出现“commit 清理与重排计划通过”。保留 c 的 cleanup 是错误所有权，应触发计划断言。',
    }),
  ),
  'programming:React · React 源码：Fiber、Hooks、Scheduler 与 Commit：React 企业应用毕业项目与源码答辩': lab(
    'React 收尾代码台 09 · 源码答辩与发布证据',
    '用证据矩阵审查源码答辩中的机制解释，并把测试、性能、可访问性、监控和回滚汇总为发布决定。',
    task({
      id: 'react-last-defense-guided',
      title: '跟做：答辩主张与源码证据核对',
      brief:
        'stdin 给出答辩主张和证据目录。每条主张只有同时引用存在的文件、符号和可复现命令才通过；输出缺失证据和通过率。',
      stdin:
        '{"claims":[{"id":"c1","topic":"Fiber","evidence":["fiber.ts#performUnitOfWork","pnpm test:fiber"]},{"id":"c2","topic":"Scheduler","evidence":["scheduler.ts#scheduleCallback","pnpm bench:scheduler"]},{"id":"c3","topic":"Commit","evidence":["commit.ts#commitMutationEffects","missing-command"]}],"available":["fiber.ts","pnpm test:fiber","scheduler.ts","pnpm bench:scheduler","commit.ts"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Claim = {
  id: string;
  topic: string;
  evidence: string[];
};
type Payload = { claims: Claim[]; available: string[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const available = new Set(input.available);

function evidenceFile(evidence: string): string {
  return evidence.split("#")[0];
}

const reviewed = input.claims.map((claim) => {
  const missing = claim.evidence.filter(
    (evidence) => !available.has(evidence) && !available.has(evidenceFile(evidence)),
  );
  return {
    id: claim.id,
    topic: claim.topic,
    passed: missing.length === 0 && claim.evidence.length >= 2,
    missing,
  };
});
const passed = reviewed.filter((claim) => claim.passed);

assert.equal(passed.length, 2);
assert.deepEqual(
  reviewed.find((claim) => claim.id === "c3")?.missing,
  ["missing-command"],
);
assert.equal(Math.round((passed.length / reviewed.length) * 100), 67);

console.log(JSON.stringify({ reviewed, passRate: 67 }));
console.log("源码答辩证据矩阵通过");`,
      checkpoint:
        'c1、c2 通过，c3 缺少可复现命令，通过率为 67%；出现“源码答辩证据矩阵通过”。只保留话题名而没有文件或命令不能算证据，应被标记缺失。',
    }),
    task({
      id: 'react-last-release-independent',
      title: '独立实践：生产发布与回滚证据门禁',
      brief:
        'stdin 给出测试、性能、可访问性、RUM 和回滚数据。任何 P0 回归必须 hold；否则按指标决定 canary 或 ship，并生成回滚目标。',
      stdin:
        '{"tests":{"passed":120,"total":120},"performance":{"inp75":180,"budget":200},"a11y":{"blockers":0,"contrast":4.8},"rum":{"errorRate":0.4,"sample":500},"rollback":{"available":true,"previous":"2026.11.20"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  tests: { passed: number; total: number };
  performance: { inp75: number; budget: number };
  a11y: { blockers: number; contrast: number };
  rum: { errorRate: number; sample: number };
  rollback: { available: boolean; previous: string };
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const blockers: string[] = [];
if (input.tests.passed !== input.tests.total) blockers.push("tests");
if (input.performance.inp75 > input.performance.budget) blockers.push("inp");
if (input.a11y.blockers > 0 || input.a11y.contrast < 4.5) blockers.push("a11y");
if (input.rum.errorRate >= 1) blockers.push("rum-error-rate");
if (!input.rollback.available) blockers.push("rollback-unavailable");

const decision =
  blockers.length > 0
    ? "hold"
    : input.rum.sample < 1000 || input.rum.errorRate > 0.2
      ? "canary"
      : "ship";
const result = {
  decision,
  blockers,
  rollbackTo: input.rollback.previous,
  reason:
    decision === "canary"
      ? "样本不足或观察错误率偏高"
      : decision === "ship"
        ? "全部证据达标"
        : "存在发布阻塞项",
};

assert.equal(result.decision, "canary");
assert.deepEqual(result.blockers, []);
assert.equal(result.rollbackTo, "2026.11.20");
assert.match(result.reason, /样本不足/);

console.log(JSON.stringify(result));
console.log("React 毕业项目发布门禁通过");`,
      checkpoint:
        '测试、INP、可访问性通过，但因 RUM 样本仅 500 且错误率 0.4%，发布决定必须是 canary，回滚目标为 2026.11.20；出现“React 毕业项目发布门禁通过”。把样本提高到 1000 且错误率降到 0.1% 后应改为 ship。',
    }),
  ),
  'programming:Vue 3 · 工程、测试、性能与可访问性：vue-tsc、ESLint 与提交门禁': lab(
    'Vue 收尾代码台 10 · 类型、Lint 与提交门禁',
    '把 vue-tsc 诊断、ESLint 严重级别和修复动作汇总为可解释的提交门禁，验证 fail-fast 与重跑条件。',
    task({
      id: 'vue-last-quality-gate-guided',
      title: '跟做：诊断分级与自动修复候选',
      brief:
        'stdin 给出规则严重级别和诊断命中。统计 error、warning、可自动修复项，只在没有 error 时允许提交，并输出修复优先顺序。',
      stdin:
        '{"rules":{"vue/no-mutating-props":"error","@typescript-eslint/no-unused-vars":"warn","vue/html-self-closing":"warn"},"findings":[{"file":"Card.vue","rule":"vue/no-mutating-props","fixable":false},{"file":"App.vue","rule":"vue/html-self-closing","fixable":true},{"file":"App.vue","rule":"@typescript-eslint/no-unused-vars","fixable":true},{"file":"Card.vue","rule":"vue/no-mutating-props","fixable":false}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Severity = "error" | "warn";
type Finding = { file: string; rule: string; fixable: boolean };
type Payload = {
  rules: Record<string, Severity>;
  findings: Finding[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const classified = input.findings.map((finding) => ({
  ...finding,
  severity: input.rules[finding.rule] ?? "error",
}));
const errors = classified.filter((finding) => finding.severity === "error");
const warnings = classified.filter((finding) => finding.severity === "warn");
const fixable = classified
  .filter((finding) => finding.fixable)
  .sort((left, right) =>
    left.file.localeCompare(right.file) || left.rule.localeCompare(right.rule),
  );

assert.equal(errors.length, 2);
assert.equal(warnings.length, 2);
assert.equal(fixable.length, 2);
assert.deepEqual(
  fixable.map((finding) => finding.file + ":" + finding.rule),
  [
    "App.vue:@typescript-eslint/no-unused-vars",
    "App.vue:vue/html-self-closing",
  ],
);
assert.equal(errors.length === 0 ? "pass" : "fail", "fail");

console.log(JSON.stringify({
  gate: errors.length === 0 ? "pass" : "fail",
  errors: errors.length,
  warnings: warnings.length,
  fixable: fixable.map((finding) => finding.rule),
}));
console.log("Vue 类型与 Lint 分级门禁通过");`,
      checkpoint:
        '门禁为 fail，错误 2 条、警告 2 条，可自动修复 2 项且 App.vue 的 unused-vars 排在 self-closing 前；出现“Vue 类型与 Lint 分级门禁通过”。把 no-mutating-props 降为 warn 后门禁应变为 pass。',
    }),
    task({
      id: 'vue-last-quality-pipeline-independent',
      title: '独立实践：vue-tsc、ESLint、测试流水线',
      brief:
        'stdin 给出类型检查、Lint 和测试步骤。按顺序 fail-fast，记录未执行项；若任一失败，输出最小重跑集合与最终提交结论。',
      stdin:
        '{"steps":[{"name":"vue-tsc","status":"pass","duration":9},{"name":"eslint","status":"fail","duration":4},{"name":"vitest","status":"not-run","duration":0},{"name":"build","status":"not-run","duration":0}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Step = {
  name: string;
  status: "pass" | "fail" | "not-run";
  duration: number;
};
type Payload = { steps: Step[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const executed: string[] = [];
const skipped: string[] = [];
let failed: string | null = null;

for (const step of input.steps) {
  if (failed) {
    skipped.push(step.name);
    continue;
  }
  executed.push(step.name);
  if (step.status === "fail") failed = step.name;
}

const rerun = input.steps
  .slice(input.steps.findIndex((step) => step.name === failed))
  .map((step) => step.name);
const result = {
  gate: failed ? "blocked" : "passed",
  failed,
  executed,
  skipped,
  rerun,
  duration: input.steps.reduce((sum, step) => sum + step.duration, 0),
};

assert.equal(result.gate, "blocked");
assert.equal(result.failed, "eslint");
assert.deepEqual(result.executed, ["vue-tsc", "eslint"]);
assert.deepEqual(result.skipped, ["vitest", "build"]);
assert.deepEqual(result.rerun, ["eslint", "vitest", "build"]);
assert.equal(result.duration, 13);

console.log(JSON.stringify(result));
console.log("Vue 提交流水线 fail-fast 通过");`,
      checkpoint:
        '流水线在 eslint 阻塞，vitest 与 build 未执行，重跑集合从 eslint 开始，总耗时 13ms；出现“Vue 提交流水线 fail-fast 通过”。修复后必须重跑失败步骤及其后续步骤，不能只重跑 eslint。',
    }),
  ),
  'programming:Vue 3 · 工程、测试、性能与可访问性：Playwright、键盘与移动流程': lab(
    'Vue 收尾代码台 11 · Playwright 键盘与移动流程',
    '用确定性事件流验证 Tab 顺序、路由切换、移动视口和触控目标，补齐只测 DOM 文本无法覆盖的交互边界。',
    task({
      id: 'vue-last-playwright-keyboard-guided',
      title: '跟做：Tab、Shift+Tab 与焦点恢复',
      brief:
        'stdin 给出焦点序列和键盘动作。执行 Tab、Shift+Tab 与 Escape，验证焦点跟随 DOM 顺序并在关闭对话框后回到打开按钮。',
      stdin:
        '{"focusables":["menu","search","open-dialog"],"actions":["Tab","Tab","Tab","Enter","Escape","Shift+Tab"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Action = "Tab" | "Shift+Tab" | "Enter" | "Escape";
type Payload = { focusables: string[]; actions: Action[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
let index = 0;
let dialogOpen = false;
let restoreFocus = "open-dialog";
const trail: string[] = [];

for (const action of input.actions) {
  if (action === "Tab") {
    index = dialogOpen ? index : Math.min(input.focusables.length - 1, index + 1);
  } else if (action === "Shift+Tab") {
    index = dialogOpen ? index : Math.max(0, index - 1);
  } else if (action === "Enter" && input.focusables[index] === "open-dialog") {
    dialogOpen = true;
    restoreFocus = "open-dialog";
  } else if (action === "Escape" && dialogOpen) {
    dialogOpen = false;
    index = input.focusables.indexOf(restoreFocus);
  }
  trail.push((dialogOpen ? "dialog:" : "page:") + input.focusables[index]);
}

assert.deepEqual(trail, [
  "page:search",
  "page:open-dialog",
  "page:open-dialog",
  "dialog:open-dialog",
  "page:open-dialog",
  "page:search",
]);
assert.equal(dialogOpen, false);
assert.equal(input.focusables[index], "search");

console.log(JSON.stringify({ trail, finalFocus: input.focusables[index] }));
console.log("Playwright 键盘焦点恢复通过");`,
      checkpoint:
        '轨迹包含两段用户 Tab、打开对话框、Escape 恢复 open-dialog、最终 Shift+Tab 到 search；出现“Playwright 键盘焦点恢复通过”。若 Escape 后焦点落到 body 而不是触发器，恢复断言必须失败。',
    }),
    task({
      id: 'vue-last-playwright-mobile-independent',
      title: '独立实践：移动视口、返回链与触控目标',
      brief:
        'stdin 给出移动页面栈和点击动作。模拟 browser back、底部导航切换和关闭详情，检查返回顺序、可触控尺寸及菜单始终可见。',
      stdin:
        '{"viewport":"320x720","pages":["overview","lesson","detail"],"actions":["tap-menu","tap-next","back","back","tap-menu"],"touchTargets":{"menu":44,"next":48,"back":40}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  viewport: string;
  pages: string[];
  actions: Array<"tap-menu" | "tap-next" | "back">;
  touchTargets: Record<string, number>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const stack = [input.pages[0]];
let pageIndex = 0;
const snapshots: string[] = [];
const menuHits: string[] = [];

for (const action of input.actions) {
  if (action === "tap-menu") {
    menuHits.push("menu");
  } else if (action === "tap-next") {
    pageIndex = Math.min(input.pages.length - 1, pageIndex + 1);
    stack.push(input.pages[pageIndex]);
  } else {
    if (stack.length > 1) {
      stack.pop();
      pageIndex = Math.max(0, pageIndex - 1);
    }
  }
  snapshots.push(stack.at(-1) ?? "overview");
}

const undersized = Object.entries(input.touchTargets)
  .filter(([, size]) => size < 44)
  .map(([name]) => name);

assert.deepEqual(snapshots, ["overview", "lesson", "overview", "overview", "overview"]);
assert.deepEqual(menuHits, ["menu", "menu"]);
assert.deepEqual(undersized, ["back"]);
assert.equal(input.viewport, "320x720");
assert.equal(stack.length, 1);

console.log(JSON.stringify({ snapshots, menuHits, undersized }));
console.log("Playwright 移动返回链与触控审计通过");`,
      checkpoint:
        '页面轨迹依次为 overview、lesson、overview、overview、overview，菜单在初始页和详情返回后均可点击，40px 的 back 被标记为过小；出现“Playwright 移动返回链与触控审计通过”。若详情页吞掉底栏点击，menuHits 不能达到两次。',
    }),
  ),
  'programming:Vue 3 · 工程、测试、性能与可访问性：错误监控与可访问性验收': lab(
    'Vue 收尾代码台 12 · Vue 错误监控与无障碍验收',
    '把 app.config.errorHandler、组件错误传播与 axe 阻断项放进同一发布证据链。',
    task({
      id: 'vue-last-error-handler-guided',
      title: '跟做：全局错误处理与组件降级',
      brief:
        'stdin 给出组件错误传播链。最内层先上报、逐层增加边界上下文，顶层记录最终 fallback；同一错误 id 不能重复上报。',
      stdin:
        '{"error":{"id":"err-7","message":"课程加载失败","component":"LessonPanel"},"chain":["LessonPanel","CoursePage","App"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  error: { id: string; message: string; component: string };
  chain: string[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const seen = new Set<string>();
const reports: Array<{ id: string; boundary: string; code: string }> = [];

for (const boundary of input.chain) {
  if (seen.has(input.error.id)) break;
  seen.add(input.error.id);
  reports.push({
    id: input.error.id,
    boundary,
    code: "VUE_COMPONENT_ERROR:" + input.error.component,
  });
}

const fallback = {
  title: "课程暂时不可用",
  retryAction: "retry:" + input.error.id,
  accessibleRole: "alert",
};

assert.equal(reports.length, 1);
assert.equal(reports[0].boundary, "LessonPanel");
assert.equal(reports[0].code, "VUE_COMPONENT_ERROR:LessonPanel");
assert.equal(fallback.accessibleRole, "alert");
assert.match(fallback.retryAction, /err-7$/);

console.log(JSON.stringify({ reports, fallback }));
console.log("Vue 全局错误处理去重通过");`,
      checkpoint:
        '错误只由最内层 LessonPanel 上报一次，fallback 使用 alert 角色并携带 err-7 重试动作；出现“Vue 全局错误处理去重通过”。若每一层重复上报，reports 长度会超过 1 并触发断言。',
    }),
    task({
      id: 'vue-last-axe-gate-independent',
      title: '独立实践：axe 问题分级与发布门禁',
      brief:
        'stdin 给出 axe 检查结果和错误监控状态。critical、serious 或未处理 Vue error 都阻止发布，并输出去重后的阻断规则。',
      stdin:
        '{"violations":[{"id":"color-contrast","impact":"serious","nodes":3},{"id":"button-name","impact":"critical","nodes":1},{"id":"label","impact":"moderate","nodes":2},{"id":"label","impact":"moderate","nodes":1}],"vueErrors":[{"code":"render","handled":true},{"code":"setup","handled":false}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Violation = { id: string; impact: string; nodes: number };
type Payload = {
  violations: Violation[];
  vueErrors: Array<{ code: string; handled: boolean }>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const merged = new Map<string, { impact: string; nodes: number }>();
for (const violation of input.violations) {
  const prior = merged.get(violation.id);
  merged.set(violation.id, {
    impact: prior?.impact === "critical" ? "critical" : violation.impact,
    nodes: (prior?.nodes ?? 0) + violation.nodes,
  });
}
const blockingViolations = [...merged.entries()]
  .filter(([, value]) => value.impact === "critical" || value.impact === "serious")
  .map(([id]) => id)
  .sort();
const unhandledErrors = input.vueErrors
  .filter((error) => !error.handled)
  .map((error) => error.code);
const blockers = [...blockingViolations, ...unhandledErrors];

assert.deepEqual(blockingViolations, ["button-name", "color-contrast"]);
assert.deepEqual(unhandledErrors, ["setup"]);
assert.deepEqual(blockers, ["button-name", "color-contrast", "setup"]);
assert.equal(merged.get("label")?.nodes, 3);
assert.equal(blockers.length > 0 ? "hold" : "ship", "hold");

console.log(JSON.stringify({ merged: [...merged], blockers, gate: "hold" }));
console.log("Vue axe 与错误监控联合门禁通过");`,
      checkpoint:
        'label 的 2+1 个节点被合并，阻断项为 button-name、color-contrast、setup，发布门禁为 hold；出现“Vue axe 与错误监控联合门禁通过”。把 setup 错误标记为 handled 后仍应被两个 axe 阻断项拦住。',
    }),
  ),
  'programming:Vue 3 · Nuxt SSR、部署与运行：缓存、CDN、Node 与边缘部署': lab(
    'Vue 收尾代码台 13 · CDN 缓存与边缘路由',
    '解析 Cache-Control 新鲜度、stale-while-revalidate、边缘区域选择和 tag purge，验证常见缓存边界。',
    task({
      id: 'vue-last-cache-policy-guided',
      title: '跟做：CDN 新鲜与陈旧窗口',
      brief:
        'stdin 给出响应年龄与 Cache-Control。判断 fresh、stale-revalidate 或 expired，并输出剩余新鲜秒数。',
      stdin:
        '{"samples":[{"id":"home","age":30,"cacheControl":"s-maxage=60, stale-while-revalidate=120"},{"id":"course","age":90,"cacheControl":"s-maxage=60, stale-while-revalidate=120"},{"id":"old","age":240,"cacheControl":"s-maxage=60, stale-while-revalidate=120"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Sample = { id: string; age: number; cacheControl: string };
type Payload = { samples: Sample[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;

function directive(header: string, name: string): number {
  const match = header.match(new RegExp(name + "=(\\\\d+)"));
  if (!match) throw new Error("缺少缓存指令：" + name);
  return Number(match[1]);
}

const decisions = input.samples.map((sample) => {
  const freshFor = directive(sample.cacheControl, "s-maxage");
  const staleFor = directive(sample.cacheControl, "stale-while-revalidate");
  const state =
    sample.age < freshFor
      ? "fresh"
      : sample.age < freshFor + staleFor
        ? "stale-revalidate"
        : "expired";
  return {
    id: sample.id,
    state,
    freshRemaining: Math.max(0, freshFor - sample.age),
  };
});

assert.deepEqual(decisions, [
  { id: "home", state: "fresh", freshRemaining: 30 },
  { id: "course", state: "stale-revalidate", freshRemaining: 0 },
  { id: "old", state: "expired", freshRemaining: 0 },
]);
assert.equal(decisions.filter((decision) => decision.state === "fresh").length, 1);
assert.equal(decisions.at(-1)?.state, "expired");

console.log(JSON.stringify({ decisions }));
console.log("CDN 新鲜与陈旧窗口通过");`,
      checkpoint:
        'home 为 fresh 且剩余 30 秒，course 为 stale-revalidate，old 为 expired；出现“CDN 新鲜与陈旧窗口通过”。把 course 年龄改成 59 秒后它会进入 fresh，原映射断言应失败。',
    }),
    task({
      id: 'vue-last-edge-routing-independent',
      title: '独立实践：区域路由与 tag purge',
      brief:
        'stdin 给出请求地区、边缘节点健康度和缓存 tag。选择健康且距离最近的节点，在发布后按 tag 只失效课程页面。',
      stdin:
        '{"requests":[{"id":"r1","region":"cn-east","tags":["course-list","course:7"]},{"id":"r2","region":"us-west","tags":["course:7","home"]}],"edges":[{"id":"shanghai","region":"cn-east","healthy":true,"latency":18},{"id":"hangzhou","region":"cn-east","healthy":true,"latency":12},{"id":"beijing","region":"cn-east","healthy":false,"latency":8},{"id":"oregon","region":"us-west","healthy":true,"latency":14}],"purgeTags":["course:7"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Edge = { id: string; region: string; healthy: boolean; latency: number };
type Request = { id: string; region: string; tags: string[] };
type Payload = {
  requests: Request[];
  edges: Edge[];
  purgeTags: string[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const purgeTags = new Set(input.purgeTags);

const routes = input.requests.map((request) => {
  const candidates = input.edges
    .filter((edge) => edge.region === request.region && edge.healthy)
    .sort((left, right) => left.latency - right.latency);
  if (candidates.length === 0) throw new Error("区域没有健康边缘节点");
  return {
    request: request.id,
    edge: candidates[0].id,
    purgedTags: request.tags.filter((tag) => purgeTags.has(tag)),
    retainedTags: request.tags.filter((tag) => !purgeTags.has(tag)),
  };
});

assert.deepEqual(routes, [
  {
    request: "r1",
    edge: "hangzhou",
    purgedTags: ["course:7"],
    retainedTags: ["course-list"],
  },
  {
    request: "r2",
    edge: "oregon",
    purgedTags: ["course:7"],
    retainedTags: ["home"],
  },
]);
assert.equal(routes.some((route) => route.edge === "beijing"), false);
assert.equal(routes[0].retainedTags.includes("course-list"), true);

console.log(JSON.stringify({ routes }));
console.log("边缘区域路由与 tag purge 通过");`,
      checkpoint:
        'cn-east 选择健康且更快的 hangzhou，不健康但更快的 beijing 被排除；两次请求仅清理 course:7，home 与 course-list 保留；出现“边缘区域路由与 tag purge 通过”。若把 purgeTags 改成空数组，purgedTags 断言应失败。',
    }),
  ),
  'programming:Vue 3 · Nuxt SSR、部署与运行：Nuxt 发布与回滚实验': lab(
    'Vue 收尾代码台 14 · Nuxt 灰度发布与原子回滚',
    '模拟版本清单、健康阈值和流量切换，验证发布失败时恢复到上一完整构建。',
    task({
      id: 'vue-last-nuxt-rollout-guided',
      title: '跟做：灰度阈值与自动回滚',
      brief:
        'stdin 给出多个灰度批次。错误率高于阈值或健康检查失败时立即回滚；否则推进到 100%，输出记录和最终版本。',
      stdin:
        '{"version":"2026.11.24-a","previous":"2026.11.23-c","errorBudget":1,"steps":[{"traffic":10,"errorRate":0.2,"health":"pass"},{"traffic":50,"errorRate":1.4,"health":"fail"},{"traffic":100,"errorRate":0.1,"health":"pass"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Step = { traffic: number; errorRate: number; health: "pass" | "fail" };
type Payload = {
  version: string;
  previous: string;
  errorBudget: number;
  steps: Step[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const history: string[] = [];
let active = input.version;
let reached = 0;

for (const step of input.steps) {
  if (step.health === "fail" || step.errorRate > input.errorBudget) {
    history.push("rollback@" + step.traffic + ":" + step.errorRate);
    active = input.previous;
    reached = 0;
    break;
  }
  reached = step.traffic;
  history.push("advance@" + step.traffic);
}

assert.deepEqual(history, ["advance@10", "rollback@50:1.4"]);
assert.equal(active, "2026.11.23-c");
assert.equal(reached, 0);
assert.equal(input.steps.at(-1)?.traffic, 100);
assert.notEqual(active, input.version);

console.log(JSON.stringify({ history, active, reached }));
console.log("Nuxt 灰度失败自动回滚通过");`,
      checkpoint:
        '第一批推进到 10%，第二批因 1.4% 错误率和健康失败立即回滚，最终 active 为 2026.11.23-c 且流量归零；出现“Nuxt 灰度失败自动回滚通过”。把错误预算改成 2 后流程会继续执行第三步，原断言失败。',
    }),
    task({
      id: 'vue-last-nuxt-manifest-independent',
      title: '独立实践：完整构建清单与原子切换',
      brief:
        'stdin 给出多个 Nuxt 构建清单。只有 server、client、public 三部分齐全且校验和一致才可切换；回滚选择最近完整版本。',
      stdin:
        '{"builds":[{"id":"v1","parts":{"server":"ok","client":"ok","public":"ok"},"checksum":"a1"},{"id":"v2","parts":{"server":"ok","client":"bad","public":"ok"},"checksum":"b2"},{"id":"v3","parts":{"server":"ok","client":"ok","public":"missing"},"checksum":"c3"}],"active":"v1","candidate":"v2"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Build = {
  id: string;
  parts: Record<"server" | "client" | "public", string>;
  checksum: string;
};
type Payload = {
  builds: Build[];
  active: string;
  candidate: string;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const required = ["server", "client", "public"] as const;

function validation(build: Build): { valid: boolean; missing: string[] } {
  const missing = required.filter((part) => build.parts[part] !== "ok");
  const checksumValid = /^[a-f0-9]{2}$/.test(build.checksum);
  return {
    valid: missing.length === 0 && checksumValid,
    missing: checksumValid ? missing : [...missing, "checksum"],
  };
}

const report = input.builds.map((build) => ({
  id: build.id,
  ...validation(build),
}));
const candidate = report.find((build) => build.id === input.candidate);
const fallback = [...report]
  .reverse()
  .find((build) => build.valid && build.id !== input.candidate);

assert.deepEqual(candidate, { id: "v2", valid: false, missing: ["client"] });
assert.deepEqual(
  report.map((build) => build.valid),
  [true, false, false],
);
assert.equal(fallback?.id, "v1");
assert.equal(candidate?.valid ? input.candidate : fallback?.id, "v1");

console.log(JSON.stringify({ report, rollout: "v1", candidateRejected: "v2" }));
console.log("Nuxt 原子清单与回滚目标通过");`,
      checkpoint:
        '只有 v1 的清单完整，v2 缺 client、v3 缺 public，candidate=v2 被拒绝并回滚到 v1；出现“Nuxt 原子清单与回滚目标通过”。不要把部分上传的 v3 当作可回滚版本。',
    }),
  ),
  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：源码仓库、版本和阅读入口': lab(
    'Vue 收尾代码台 15 · Vue 源码仓库入口与符号映射',
    '从 workspace 包、版本分支和 sourcemap 定位真实 Vue 源码，不把生成产物误当手写入口。',
    task({
      id: 'vue-last-repo-entry-guided',
      title: '跟做：workspace 包依赖与阅读入口',
      brief:
        'stdin 给出 Vue monorepo 包及依赖。从目标包逆推依赖顺序，输出稳定编译顺序，并把缺失 workspace 包作为错误。',
      stdin:
        '{"target":"runtime-dom","packages":{"reactivity":[],"runtime-core":["reactivity"],"runtime-dom":["runtime-core","shared"],"vue":["runtime-dom","compiler-dom"],"compiler-core":["shared"],"compiler-dom":["compiler-core"],"shared":[]}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  target: string;
  packages: Record<string, string[]>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const visited = new Set<string>();
const order: string[] = [];

function visit(name: string, path: string[]): void {
  if (path.includes(name)) {
    throw new Error("workspace 循环：" + [...path, name].join(" > "));
  }
  if (visited.has(name)) return;
  const dependencies = input.packages[name];
  if (!dependencies) throw new Error("缺失 workspace 包：" + name);
  for (const dependency of dependencies) visit(dependency, [...path, name]);
  visited.add(name);
  order.push(name);
}

visit(input.target, []);
assert.deepEqual(order.slice(0, 3), ["reactivity", "runtime-core", "shared"]);
assert.equal(order.at(-1), "runtime-dom");
assert.equal(order.includes("vue"), false);
assert.throws(() => visit("missing", []), /缺失 workspace 包/);

console.log(JSON.stringify({ order }));
console.log("Vue workspace 阅读入口通过");`,
      checkpoint:
        '目标 runtime-dom 的阅读顺序先 reactivity、runtime-core、shared，最后才是 runtime-dom，且不会把上层 vue 误放进依赖；出现“Vue workspace 阅读入口通过”。缺失包必须报错。',
    }),
    task({
      id: 'vue-last-repo-sourcemap-independent',
      title: '独立实践：版本与 sourcemap 符号还原',
      brief:
        'stdin 给出构建版本、压缩位置和 sourcemap 片段。校验版本标签，按行列选择最小包含区间并还原源文件与符号。',
      stdin:
        '{"buildVersion":"3.5.13","expectedPrefix":"3.5.","runtime":{"file":"runtime-dom.global.js","line":1,"column":48},"segments":[{"generatedColumn":20,"source":"runtime-dom/src/patchProp.ts","symbol":"patchProp"},{"generatedColumn":40,"source":"runtime-dom/src/nodeOps.ts","symbol":"insert"},{"generatedColumn":60,"source":"runtime-dom/src/modules/events.ts","symbol":"patchEvent"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Segment = {
  generatedColumn: number;
  source: string;
  symbol: string;
};
type Payload = {
  buildVersion: string;
  expectedPrefix: string;
  runtime: { file: string; line: number; column: number };
  segments: Segment[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const versionMatches = input.buildVersion.startsWith(input.expectedPrefix);
const candidates = input.segments
  .filter((segment) => segment.generatedColumn <= input.runtime.column)
  .sort((left, right) => right.generatedColumn - left.generatedColumn);
const resolved = candidates[0];

assert.equal(versionMatches, true);
assert.equal(input.runtime.line, 1);
assert.equal(resolved.source, "runtime-dom/src/nodeOps.ts");
assert.equal(resolved.symbol, "insert");
assert.equal(resolved.generatedColumn, 40);
assert.equal(input.segments.length, 3);

console.log(JSON.stringify({
  versionMatches,
  runtime: input.runtime,
  resolved,
}));
console.log("Vue sourcemap 版本与符号还原通过");`,
      checkpoint:
        '版本 3.5.13 命中 3.5. 前缀，runtime 第 48 列解析到 nodeOps.ts 的 insert；出现“Vue sourcemap 版本与符号还原通过”。不能把下一段 column=60 的 patchEvent 反向套到第 48 列。',
    }),
  ),
  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：effect、track 与 trigger': lab(
    'Vue 收尾代码台 16 · track、trigger 与嵌套 effect',
    '实现最小响应式依赖图，验证脏标记、清理旧依赖、嵌套 effect 和计算属性惰性求值。',
    task({
      id: 'vue-last-track-trigger-guided',
      title: '跟做：dependency map 与条件分支清理',
      brief:
        'stdin 给出 effect 读取序列与写入操作。重复运行 effect 时清除不再读取的旧依赖，输出每个 key 的订阅者及触发日志。',
      stdin:
        '{"operations":[{"type":"read","effect":"render","key":"flag"},{"type":"read","effect":"render","key":"left"},{"type":"write","key":"flag"},{"type":"rerun","effect":"render"},{"type":"read","effect":"render","key":"flag"},{"type":"read","effect":"render","key":"right"},{"type":"write","key":"left"},{"type":"write","key":"right"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Operation =
  | { type: "read"; effect: string; key: string }
  | { type: "write"; key: string }
  | { type: "rerun"; effect: string };
type Payload = { operations: Operation[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const dependencies = new Map<string, Set<string>>();
const active = new Map<string, Set<string>>();
const triggers: string[] = [];

for (const operation of input.operations) {
  if (operation.type === "read") {
    if (!dependencies.has(operation.key)) dependencies.set(operation.key, new Set());
    dependencies.get(operation.key)?.add(operation.effect);
    if (!active.has(operation.effect)) active.set(operation.effect, new Set());
    active.get(operation.effect)?.add(operation.key);
  } else if (operation.type === "write") {
    for (const effect of dependencies.get(operation.key) ?? []) {
      triggers.push(effect + ":" + operation.key);
    }
  } else {
    for (const effects of dependencies.values()) effects.delete(operation.effect);
    active.set(operation.effect, new Set());
  }
}

for (const [effect, keys] of active) {
  for (const [key, effects] of dependencies) {
    if (!keys.has(key) && effects.has(effect)) {
      effects.delete(effect);
    }
  }
}

assert.deepEqual(triggers, ["render:flag", "render:right"]);
assert.deepEqual([...dependencies.get("left") ?? []], []);
assert.deepEqual([...dependencies.get("right") ?? []], ["render"]);
assert.deepEqual([...active.get("render") ?? []].sort(), ["flag", "right"]);

console.log(JSON.stringify({
  triggers,
  dependencies: [...dependencies].map(([key, effects]) => [key, [...effects]]),
}));
console.log("Vue track trigger 与旧依赖清理通过");`,
      checkpoint:
        '触发日志为 render:flag、render:right；effect 重跑后最终只订阅 flag 与 right，旧的 left 订阅被清理，因此写 left 不再触发；出现“Vue track trigger 与旧依赖清理通过”。若 effect 重跑前不清旧依赖，left 会残留订阅者。',
    }),
    task({
      id: 'vue-last-computed-nested-independent',
      title: '独立实践：computed 脏标记与嵌套 effect',
      brief:
        'stdin 给出源值和读取、写入操作。computed 只在依赖变脏后首次读取时重算；内层 effect 先于外层执行，并记录重算次数。',
      stdin:
        '{"initial":{"price":100,"count":2},"operations":[{"type":"computed-read"},{"type":"computed-read"},{"type":"write","key":"price","value":120},{"type":"computed-read"},{"type":"write","key":"count","value":3},{"type":"computed-read"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Operation =
  | { type: "computed-read" }
  | { type: "write"; key: "price" | "count"; value: number };
type Payload = {
  initial: { price: number; count: number };
  operations: Operation[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const source = { ...input.initial };
let dirty = true;
let cached = 0;
let computedRuns = 0;
const runs: number[] = [];

function readComputed(): number {
  if (dirty) {
    cached = source.price * source.count;
    computedRuns += 1;
    dirty = false;
  }
  runs.push(cached);
  return cached;
}

for (const operation of input.operations) {
  if (operation.type === "write") {
    source[operation.key] = operation.value;
    dirty = true;
  } else {
    readComputed();
  }
}

assert.deepEqual(runs, [200, 200, 240, 360]);
assert.equal(computedRuns, 3);
assert.equal(runs.filter((value, index) => index === 0 || value !== runs[index - 1]).length, 3);
assert.equal(source.price, 120);
assert.equal(source.count, 3);

console.log(JSON.stringify({ runs, computedRuns, final: 360 }));
console.log("Vue computed 脏标记惰性重算通过");`,
      checkpoint:
        '读取序列为 200、200、240、360，缓存未变时重复读取不增加 computedRuns，最终只重算 3 次；出现“Vue computed 脏标记惰性重算通过”。每次读取都重算会得到 computedRuns=4 并失败。',
    }),
  ),
  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：renderer 的 mount 与 patch': lab(
    'Vue 收尾代码台 17 · renderer 的 mount、patch 与卸载',
    '用虚拟节点 diff 生成最小 DOM 操作序列，验证 key、元素类型、事件监听器和卸载清理。',
    task({
      id: 'vue-last-renderer-diff-guided',
      title: '跟做：按 key 和类型生成 patch 计划',
      brief:
        'stdin 给出旧、新子节点。同 key 同 type 更新文本，同 key 不同 type 替换，新增 key 插入，消失 key 卸载；输出有序操作。',
      stdin:
        '{"old":[{"key":"a","type":"h2","text":"旧标题"},{"key":"b","type":"p","text":"正文"},{"key":"c","type":"button","text":"保存"},{"key":"old","type":"span","text":"删除"}],"new":[{"key":"a","type":"h2","text":"新标题"},{"key":"d","type":"p","text":"提示"},{"key":"b","type":"section","text":"正文"},{"key":"c","type":"button","text":"保存"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Node = { key: string; type: string; text: string };
type Payload = { old: Node[]; new: Node[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const oldByKey = new Map(input.old.map((node) => [node.key, node]));
const newKeys = new Set(input.new.map((node) => node.key));
const operations: string[] = [];

for (const node of input.new) {
  const previous = oldByKey.get(node.key);
  if (!previous) {
    operations.push("mount:" + node.key + ":" + node.type);
  } else if (previous.type !== node.type) {
    operations.push("replace:" + node.key + ":" + previous.type + "->" + node.type);
  } else if (previous.text !== node.text) {
    operations.push("text:" + node.key + ":" + node.text);
  }
}
for (const node of input.old) {
  if (!newKeys.has(node.key)) operations.push("unmount:" + node.key);
}

assert.deepEqual(operations, [
  "text:a:新标题",
  "mount:d:p",
  "replace:b:p->section",
  "unmount:old",
]);
assert.equal(oldByKey.get("c")?.text, input.new.find((node) => node.key === "c")?.text);
assert.equal(input.new.length, 4);

console.log(JSON.stringify({ operations }));
console.log("Vue renderer patch 计划通过");`,
      checkpoint:
        '操作依次为更新 a 文本、挂载 d、替换 b 类型、卸载旧 other；出现“Vue renderer patch 计划通过”。若只按数组下标比较，a 的标题更新和 b 的类型替换会被错误合并。',
    }),
    task({
      id: 'vue-last-renderer-events-independent',
      title: '独立实践：事件监听器替换与卸载清理',
      brief:
        'stdin 给出节点事件映射变更。相同处理器保持监听，新处理器替换旧函数，空值移除监听；输出 mount、update、unmount 和实际监听数量。',
      stdin:
        '{"old":{"button":["click:save","keydown:submit"],"input":["change","keydown"]},"next":{"button":["click:save","click:cancel","keydown:submit"]},"removed":["input"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  old: Record<string, string[]>;
  next: Record<string, string[]>;
  removed: string[];
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const listeners = new Map<string, Set<string>>();
for (const [node, entries] of Object.entries(input.old)) {
  listeners.set(node, new Set(entries));
}
const log: string[] = [];

for (const [node, entries] of Object.entries(input.next)) {
  const current = listeners.get(node) ?? new Set<string>();
  const next = new Set(entries);
  const added = entries.filter((entry) => !current.has(entry));
  const removed = [...current].filter((entry) => !next.has(entry));
  for (const entry of removed) log.push("remove:" + node + ":" + entry);
  for (const entry of added) log.push("add:" + node + ":" + entry);
  listeners.set(node, next);
}
for (const node of input.removed) {
  for (const entry of listeners.get(node) ?? []) {
    log.push("cleanup:" + node + ":" + entry);
  }
  listeners.delete(node);
}

assert.deepEqual(log, [
  "add:button:click:cancel",
  "cleanup:input:change",
  "cleanup:input:keydown",
]);
assert.deepEqual([...listeners.get("button") ?? []], [
  "click:save",
  "click:cancel",
  "keydown:submit",
]);
assert.equal(listeners.has("input"), false);
assert.equal(log.filter((entry) => entry.startsWith("cleanup:input")).length, 2);

console.log(JSON.stringify({ log, listeners: [...listeners] }));
console.log("Vue 事件替换与卸载清理通过");`,
      checkpoint:
        'button 只新增 click:cancel，原有 save 与 submit 保持；input 的 change、keydown 均被卸载清理；出现“Vue 事件替换与卸载清理通过”。删除节点时不遍历旧监听器会让 cleanup 数量不足。',
    }),
  ),
  'programming:Vue 3 · Vue 源码：响应式、渲染器、调度与编译：Vue 企业应用毕业项目与源码答辩': lab(
    'Vue 收尾代码台 18 · Vue 源码答辩与生产发布',
    '把 effect、renderer、scheduler、compiler 的源码证据和 SSR、缓存、监控、回滚证据汇总为毕业项目验收。',
    task({
      id: 'vue-last-defense-guided',
      title: '跟做：Vue 源码机制证据矩阵',
      brief:
        'stdin 给出答辩主张、源码文件、符号和运行结果。要求每条主张至少有源码入口和测试命令，且命令状态 pass；输出未通过主题。',
      stdin:
        '{"claims":[{"id":"v1","topic":"effect","source":"packages/reactivity/src/effect.ts","symbol":"track","command":"pnpm test:reactivity"},{"id":"v2","topic":"renderer","source":"packages/runtime-core/src/renderer.ts","symbol":"patch","command":"pnpm test:renderer"},{"id":"v3","topic":"compiler","source":"packages/compiler-core/src/compile.ts","symbol":"baseCompile","command":"pnpm test:compiler"}],"commands":{"pnpm test:reactivity":"pass","pnpm test:renderer":"pass","pnpm test:compiler":"fail"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Claim = {
  id: string;
  topic: string;
  source: string;
  symbol: string;
  command: string;
};
type Payload = {
  claims: Claim[];
  commands: Record<string, "pass" | "fail" | "missing">;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const reviewed = input.claims.map((claim) => {
  const problems: string[] = [];
  if (!/^packages\\/[a-z-]+\\/src\\/.+\\.ts$/.test(claim.source)) problems.push("source");
  if (claim.symbol.trim().length === 0) problems.push("symbol");
  if (input.commands[claim.command] !== "pass") problems.push("command");
  return { ...claim, passed: problems.length === 0, problems };
});
const failedTopics = reviewed
  .filter((claim) => !claim.passed)
  .map((claim) => claim.topic);

assert.deepEqual(failedTopics, ["compiler"]);
assert.equal(reviewed.filter((claim) => claim.passed).length, 2);
assert.equal(reviewed[2].problems[0], "command");
assert.equal(reviewed.every((claim) => claim.source.startsWith("packages/")), true);

console.log(JSON.stringify({ reviewed, failedTopics }));
console.log("Vue 源码答辩证据矩阵通过");`,
      checkpoint:
        'effect 与 renderer 通过，compiler 因测试命令 fail 未通过；出现“Vue 源码答辩证据矩阵通过”。只写页面功能而没有源码文件和符号，不应通过机制答辩。',
    }),
    task({
      id: 'vue-last-production-independent',
      title: '独立实践：Vue 企业应用发布与故障处置',
      brief:
        'stdin 给出测试、LCP、SSR 错误率、hydration 告警、axe 阻断和回滚版本。按优先级选择 rollback、hold 或 ship，并输出处置理由。',
      stdin:
        '{"tests":{"passed":80,"total":80},"lcp":1900,"ssrErrorRate":2.1,"hydrationWarnings":3,"axeBlockers":0,"rollback":{"available":true,"version":"2026.11.22-b"},"candidate":"2026.11.24-d"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  tests: { passed: number; total: number };
  lcp: number;
  ssrErrorRate: number;
  hydrationWarnings: number;
  axeBlockers: number;
  rollback: { available: boolean; version: string };
  candidate: string;
};

const input = JSON.parse(readFileSync(0, "utf8")) as Payload;
const critical = [
  input.ssrErrorRate >= 2,
  input.hydrationWarnings >= 3,
  input.axeBlockers > 0,
];
const warnings = [
  input.tests.passed !== input.tests.total,
  input.lcp > 2500,
];
const action = critical.some(Boolean)
  ? input.rollback.available
    ? "rollback"
    : "hold"
  : warnings.some(Boolean)
    ? "hold"
    : "ship";
const result = {
  action,
  target:
    action === "rollback"
      ? input.rollback.version
      : action === "ship"
        ? input.candidate
        : null,
  reasons: [
    ...(input.ssrErrorRate >= 2 ? ["ssr-error-rate"] : []),
    ...(input.hydrationWarnings >= 3 ? ["hydration-warnings"] : []),
    ...(input.axeBlockers > 0 ? ["axe-blockers"] : []),
  ],
  healthyLcp: input.lcp <= 2500,
};

assert.equal(result.action, "rollback");
assert.equal(result.target, "2026.11.22-b");
assert.deepEqual(result.reasons, ["ssr-error-rate", "hydration-warnings"]);
assert.equal(result.healthyLcp, true);
assert.notEqual(result.target, input.candidate);

console.log(JSON.stringify(result));
console.log("Vue 毕业项目生产故障处置通过");`,
      checkpoint:
        'SSR 错误率 2.1% 与 3 条 hydration 告警构成关键故障，必须回滚到 2026.11.22-b，尽管 LCP 与测试正常；出现“Vue 毕业项目生产故障处置通过”。回滚不可用时同一输入应变为 hold。',
    }),
  ),
};
