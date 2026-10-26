/**
 * 建任务重发幂等记账（2026-10-26）。
 *
 * ★ 现场：dev 后端热重载重启恰好落在 create_task 往返中间 → WS 断开 → 前端
 *   「连接已断开，这条消息未发出」。此时前端**无法判断**服务端到底建没建任务。
 *   自动重发若碰上「其实已建」就会多出一条同内容 user 消息（模型执行两遍）。
 *   ⇒ 前端带稳定 clientMsgId，服务端按 (conversationId, clientMsgId) 记账去重。
 *
 * 本测试钉住记账的判定语义（纯函数，时间注入）：
 *   ① 同会话同 id → 命中，返回原 taskId；
 *   ② 跨会话 / 不同 id → 不命中（不能张冠李戴）；
 *   ③ 空 id → 一律不记也不命（老调用方兼容：没有幂等键就不去重）；
 *   ④ 超过 TTL → 过期失效（只服务网络重发，不做长期去重）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rememberCreatedTask, findCreatedTask, resetCreatedTaskLedger,
} from '../src/chat-ws-dedupe.js';

const T0 = 1_700_000_000_000;

describe('chat-ws 建任务重发幂等记账', () => {
  beforeEach(() => resetCreatedTaskLedger());

  it('同会话同 id 命中上一次的 taskId', () => {
    rememberCreatedTask('conv_1', 'm1', 'task_a', T0);
    expect(findCreatedTask('conv_1', 'm1', T0 + 1000)).toBe('task_a');
  });

  it('不同会话即使是同一个 id 也互不影响', () => {
    rememberCreatedTask('conv_1', 'm1', 'task_a', T0);
    expect(findCreatedTask('conv_2', 'm1', T0)).toBeNull();
  });

  it('同会话不同 id 不命中', () => {
    rememberCreatedTask('conv_1', 'm1', 'task_a', T0);
    expect(findCreatedTask('conv_1', 'm2', T0)).toBeNull();
  });

  it('没有 clientMsgId 时既不记也不命（旧调用方行为不变）', () => {
    rememberCreatedTask('conv_1', undefined, 'task_a', T0);
    expect(findCreatedTask('conv_1', undefined, T0)).toBeNull();
    expect(findCreatedTask('conv_1', '   ', T0)).toBeNull();
  });

  it('超过 TTL 即失效，且过期条目会被顺手清掉', () => {
    rememberCreatedTask('conv_1', 'm1', 'task_a', T0);
    const afterTtl = T0 + 10 * 60_000 + 1;
    expect(findCreatedTask('conv_1', 'm1', afterTtl)).toBeNull();
    // 清掉后重新记同一个键，仍能正常命中（不是"永久拉黑"）
    rememberCreatedTask('conv_1', 'm1', 'task_b', afterTtl);
    expect(findCreatedTask('conv_1', 'm1', afterTtl)).toBe('task_b');
  });

  it('同一 id 再次记账时以最新 taskId 为准（并入了新任务的情形）', () => {
    rememberCreatedTask('conv_1', 'm1', 'task_a', T0);
    rememberCreatedTask('conv_1', 'm1', 'task_b', T0 + 10);
    expect(findCreatedTask('conv_1', 'm1', T0 + 20)).toBe('task_b');
  });
});
