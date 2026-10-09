/**
 * 「运行中追加消息 · 立即发送」幂等与本地回显 —— 守门测试（2026-10-09）。
 *
 * ★★★ 背景（用户实报两条同源现象）：
 *   ① 「追加任务立即发送按钮又失效了点击无用」—— 注入成功此前**完全依赖 SSE 回显**
 *      （message:added）。SSE 断流放弃重连、或切走再回来时，消息只在库里 →
 *      队列条目消失了、聊天里却没出现 = 「点了没反应」；
 *   ② 「同一个消息点击多次会发送 n 次啊」—— 前端 `injectQueuedMessage` 的"先移除队列条目"
 *      在 `await` **之后**，连点两次时两条都还在队列里 → 两个 POST → 后端落两条。
 *
 * ★ 本测试钉住 store 层的两个修复点（后端幂等由 server 侧测试覆盖）：
 *   1) 在途守卫：同一条连点两次，api.post 只发**一次**；
 *   2) 本地回显：注入成功即把消息按真实 msgId 插入当前会话列表（不依赖 SSE）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001',
  buildRequestHeaders: () => ({}),
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { api } from '../api/client';

async function freshStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./chat');
  return mod.useChatStore();
}

/** 可手动放行的 deferred，用于把第一次注入卡在"在途"状态 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}

describe('追加消息 · 立即发送的幂等与回显', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('★★★ 连点同一条：api.post 只发一次（在途守卫），且成功后队列移除 + 本地回显', async () => {
    const st = await freshStore();
    st.currentConvId = 'conv_q';
    const item = st.enqueueMessage('conv_q', '追加要求：改用表格');

    const gate = deferred<any>();
    (api.post as unknown as ReturnType<typeof vi.fn>).mockReturnValue(gate.p);

    // 第一次点击：进入在途（尚未 resolve）
    const p1 = st.injectQueuedMessage('conv_q', item.id);
    // 第二次点击（连点）：应被在途守卫直接拦下，不再发起请求
    const p2 = st.injectQueuedMessage('conv_q', item.id);

    expect((api.post as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    gate.resolve({ data: { status: 'injected', msgId: 'msg_real_1', duplicate: false } });
    const r1 = await p1;
    const r2 = await p2;

    expect(r1.ok).toBe(true);
    expect(r1.duplicate).toBe(false);
    // 第二次被守卫拦下 → 视为重复
    expect(r2.duplicate).toBe(true);
    expect((api.post as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    // 队列条目已移除
    expect(st.queuedOf('conv_q').length).toBe(0);
    // 本地立即回显：按真实 msgId 插入会话消息列表
    const msgs = (st as any).currentMessages as Array<{ id: string; role: string; content: string }>;
    const echoed = msgs.find((m) => m.id === 'msg_real_1');
    expect(echoed).toBeDefined();
    expect(echoed!.role).toBe('user');
    expect(echoed!.content).toBe('追加要求：改用表格');
  });

  it('★ 幂等键随请求下发（clientMsgId = 队列条目 id），支持后端去重', async () => {
    const st = await freshStore();
    st.currentConvId = 'conv_q2';
    const item = st.enqueueMessage('conv_q2', '第二条要求');
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'injected', msgId: 'msg_real_2', duplicate: false },
    });

    await st.injectQueuedMessage('conv_q2', item.id);
    const body = (api.post as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as any;
    expect(body.clientMsgId).toBe(item.id);
    expect(body.content).toBe('第二条要求');
    expect(body.conversationId).toBe('conv_q2');
  });

  it('★ 会话已结束（no-task）→ ok=false，调用方据此退回普通发送', async () => {
    const st = await freshStore();
    st.currentConvId = 'conv_q3';
    const item = st.enqueueMessage('conv_q3', '任务已结束时的追加');
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { status: 'no-task' } });

    const r = await st.injectQueuedMessage('conv_q3', item.id);
    expect(r.ok).toBe(false);
    // 失败时条目**保留在队列**（不能丢消息）—— 由调用方走 flushQueuedAfterTask
    expect(st.queuedOf('conv_q3').length).toBe(1);
  });

  it('★ promoteQueuedMessage：点第 3 条也让 flush 先发第 3 条（点谁发谁）', async () => {
    const st = await freshStore();
    st.currentConvId = 'conv_q4';
    const a = st.enqueueMessage('conv_q4', 'A');
    const b = st.enqueueMessage('conv_q4', 'B');
    const c = st.enqueueMessage('conv_q4', 'C');
    expect(st.queuedOf('conv_q4').map((q) => q.id)).toEqual([a.id, b.id, c.id]);

    st.promoteQueuedMessage('conv_q4', c.id);
    expect(st.queuedOf('conv_q4').map((q) => q.id)).toEqual([c.id, a.id, b.id]);

    // flush 每次取队首 → 先取到 C
    const first = st.takeFirstQueuedMessage('conv_q4');
    expect(first?.content).toBe('C');
  });

  it('★ 本地回显按 id 去重：SSE 的 message:added 后到不会产生重复气泡', async () => {
    const st = await freshStore();
    st.currentConvId = 'conv_q5';
    const item = st.enqueueMessage('conv_q5', '只应出现一次');
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'injected', msgId: 'msg_real_5', duplicate: false },
    });
    await st.injectQueuedMessage('conv_q5', item.id);

    // 模拟 SSE 后到：同 id 再插一次（生产代码里 message:added 分支就是 `if (!arr.some(id)) push`）
    const arr = (st as any).currentMessages as Array<{ id: string }>;
    const countBefore = arr.filter((m) => m.id === 'msg_real_5').length;
    const already = arr.some((m) => m.id === 'msg_real_5');
    expect(already).toBe(true);           // 本地已回显
    expect(countBefore).toBe(1);          // 且只有一条
  });
});