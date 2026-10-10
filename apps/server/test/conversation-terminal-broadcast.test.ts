/**
 * 会话级终态广播（消除 `/llm/tasks/active` 轮询）语义测试
 *
 * 背景（用户实报）：
 *   「没有任务，禁用标志也一直存在着」+「轮询？这个不是早就去掉了？轮询效率肯定差啊」
 *
 * 根因：任务级 SSE 只在**当前有订阅者**时送达。一旦前端订阅断掉（断流放弃重连 /
 *   服务重启 / 后端进程被替换），终态事件永远推不出去 → 前端 `runningConvIds` 残留
 *   在"运行中" → 输入框禁用标志一直挂着。唯一兜底是**每 30s 轮询** `/llm/tasks/active`。
 *
 * 修复：`emit()` 里把**终态事件**（completed/aborted/error）**多推一份到会话级总线**
 *   （`emitConversation`）→ 前端只需挂一条**长活的会话级订阅**就能实时收到"任务结束了"
 *   → 不再需要轮询。
 *
 * 测试策略（与 task-pause.test.ts 同模式）：
 *   llm-task-manager 顶层 import 会拉起 db/express 等重依赖，无法直接 import，
 *   故：
 *     ① 用**源码提取**的本地副本做 `emit()` 的**行为级**验证（双发判据真的生效）；
 *     ② 对源码做**静态断言**防漂移（双发点存在、只发终态、conversationId 取自 task）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MGR_PATH = join(__dirname, '..', 'src', 'llm-task-manager.ts');
const mgrSrc = readFileSync(MGR_PATH, 'utf8');

// ── 与实现保持行为一致的本地副本（逐行对照源码的 emit）──────────────────────────
// 实现见 llm-task-manager.ts 的 `function emit(task, event)`：
//   task.seq++ / push events（含 MAX_EVENTS 截断）/ 遍历 subscribers / **终态双发到会话总线**
function makeEmitHarness(maxEvents = Number.MAX_SAFE_INTEGER) {
  const conversations: Array<{ convId: string; event: any }> = [];
  const emitConversation = (convId: string, event: any) => {
    conversations.push({ convId, event });
  };
  function emit(task: any, event: any) {
    task.seq++;
    event.seq = task.seq;
    task.events.push(event);
    if (task.events.length > maxEvents) {
      task.events.splice(0, task.events.length - maxEvents);
    }
    for (const sub of task.subscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
    // ★ 被测行为：终态双发
    if (event.type === 'task:completed' || event.type === 'task:aborted' || event.type === 'task:error') {
      emitConversation(task.conversationId, { ...event });
    }
  }
  return { emit, conversations };
}

function makeTask(overrides: Partial<{ id: string; conversationId: string; subscribers: Set<(e: any) => void> }> = {}) {
  return {
    id: overrides.id ?? 't1',
    conversationId: overrides.conversationId ?? 'c1',
    seq: 0,
    events: [] as any[],
    subscribers: overrides.subscribers ?? new Set<(e: any) => void>(),
  };
}

describe('会话级终态广播：行为级验证', () => {
  it('★★★ task:completed 必须双发到会话总线（订阅断了也能送达）', () => {
    const { emit, conversations } = makeEmitHarness();
    const task = makeTask({ conversationId: 'c1' });
    // 模拟"任务级订阅已断"：subscribers 为空
    emit(task, { type: 'task:completed' });
    expect(conversations.length, '★ 终态未双发 → 前端订阅断了就永远收不到 → 只能轮询').toBe(1);
    expect(conversations[0].convId).toBe('c1');
    expect(conversations[0].event.type).toBe('task:completed');
  });

  it('★★★ task:aborted / task:error 同样双发（三类终态都要覆盖）', () => {
    const { emit, conversations } = makeEmitHarness();
    const task = makeTask({ conversationId: 'c2' });
    emit(task, { type: 'task:aborted' });
    emit(task, { type: 'task:error', error: 'boom' });
    expect(conversations.map((c) => c.event.type)).toEqual(['task:aborted', 'task:error']);
    expect(conversations.every((c) => c.convId === 'c2')).toBe(true);
  });

  it('★★★ 非终态事件**不得**双发（chunk/tool:* 量极大，双发是纯浪费）', () => {
    const { emit, conversations } = makeEmitHarness();
    const task = makeTask({ conversationId: 'c1' });
    for (const type of ['chunk', 'tool:start', 'tool:result', 'message:added', 'plan:updated', 'task:paused']) {
      emit(task, { type });
    }
    expect(conversations.length, '★ 非终态被双发 → 会话总线被高频事件淹没').toBe(0);
  });

  it('★★ 双发不影响原有任务级送达（subscribers 照常收到）', () => {
    const got: any[] = [];
    const task = makeTask({ conversationId: 'c1', subscribers: new Set([(e: any) => got.push(e)]) });
    const { emit, conversations } = makeEmitHarness();
    emit(task, { type: 'task:completed' });
    expect(got.length, '★ 双发改坏了原路径（订阅者没收到）').toBe(1);
    expect(conversations.length).toBe(1);
  });

  it('★★ 双发的是**副本**（改副本不污染 task.events 里那条）', () => {
    const { emit, conversations } = makeEmitHarness();
    const task = makeTask({ conversationId: 'c1' });
    emit(task, { type: 'task:completed' });
    // 序列化对比：两者内容一致但非同一对象引用
    expect(conversations[0].event).not.toBe(task.events[0]);
    expect(JSON.stringify(conversations[0].event)).toBe(JSON.stringify(task.events[0]));
  });
});

describe('会话级终态广播：源码静态断言（防漂移）', () => {
  it('★★★ emit() 内必须有终态双发块', () => {
    const i = mgrSrc.indexOf('function emit(task: LlmTask, event: SSEEvent)');
    expect(i, '★ 找不到 emit 定义').toBeGreaterThan(-1);
    const seg = mgrSrc.slice(i, i + 2200);
    expect(seg, '★ 缺少终态双发 → 前端订阅断了只能轮询').toMatch(/emitConversation\(task\.conversationId/);
    // 三类终态都要判到
    for (const t of ['task:completed', 'task:aborted', 'task:error']) {
      expect(seg, `★ 漏判终态 ${t}`).toContain(t);
    }
  });

  it('★★★ 双发块必须在 emit 的**末尾**（不能在 subscribers 循环之前，否则终态会在通道未占时先发）', () => {
    const i = mgrSrc.indexOf('function emit(task: LlmTask, event: SSEEvent)');
    const seg = mgrSrc.slice(i, i + 2200);
    const subLoop = seg.indexOf('for (const sub of task.subscribers)');
    const dual = seg.indexOf('emitConversation(task.conversationId');
    expect(subLoop, '★ 找不到 subscribers 循环').toBeGreaterThan(-1);
    expect(dual, '★ 找不到双发点').toBeGreaterThan(-1);
    expect(dual, '★ 双发在 subscribers 循环之前 → 顺序不符合预期').toBeGreaterThan(subLoop);
  });

  it('★★ 会话级总线路由必须存在（前端才有得订阅）', () => {
    const routes = readFileSync(join(__dirname, '..', 'src', 'routes', 'llm-tasks.ts'), 'utf8');
    expect(routes, '★ 缺 /conversations/:id/stream → 前端无从订阅会话级终态')
      .toMatch(/router\.get\('\/conversations\/:id\/stream'/);
    expect(routes, '★ 路由未接 subscribeConversation').toMatch(/subscribeConversation\(conversationId/);
  });

  it('★★ subscribeConversation / emitConversation 必须成对存在（半套=死代码）', () => {
    expect(mgrSrc).toMatch(/export function subscribeConversation\(/);
    expect(mgrSrc).toMatch(/function emitConversation\(/);
  });
});
