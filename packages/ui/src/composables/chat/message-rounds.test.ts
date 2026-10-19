/**
 * 消息分轮（`buildMessageRounds`）行为测试 —— 回归「任务后期内容区整页空白」（2026-10-12）
 *
 * 背景（用户实报）：
 *   「还有这个内容区域不显示了？」（截图：任务运行中 · 已用时 26:48，左侧聊天区空白）
 *
 * 根因（CDP 直连渲染进程 + 后端接口对照，双重实测）：
 *   前端首拉 50 条（`HISTORY_PAGE_SIZE`）。子智能体（`call_agent`）执行期会产生**海量子消息**
 *   （`parent_tool_call_id` 非空），把"最新 50 条"填满 ⇒ 首页里**没有任何主链路 `user`**。
 *   旧分轮逻辑只在 `role === 'user'` 时建 `currentRound` ⇒ `currentRound` 恒为 null ⇒
 *   下面的 `if (!currentRound) continue` **把整页消息全部丢弃** ⇒ `rounds = 0` ⇒ 白屏。
 *
 * 实测铁证（会话 c11dfe7b）：
 *   · 渲染层：`store.currentMessages.length = 353` 而 `messageRounds.length = 0`；
 *     `.messages` 容器只剩一个 `history-sentinel`，一条消息都没渲染。
 *   · 接口 `limit=50`（前端首拉值）：返回 50 条 = `assistant+sub: 25` + `tool+sub: 25`，
 *     **0 条主链路 user、0 条主链路 assistant**。
 *   · 对照 `limit=400`：才有 1 条主链路 user（idx 10）。
 *
 * ★★★ 为什么必须行为级跑真函数、而不是 grep 源码：
 *   本项目反复栽在"断言存在 ≠ 断言生效"（见 browser-bridge-direct.test.ts 的变异实测：
 *   只断言符号时把条件改成 `if (false)` 仍通过）。本 bug 恰恰是**分支全在、逻辑失效**
 *   —— `if (!currentRound) continue` 那行在旧实现里确实存在，grep 必然全绿却抓不到东西。
 *   ⇒ 必须真的喂"无 user 的一页"进去，看 rounds 出来几个。
 */
import { describe, it, expect } from 'vitest';
import { buildMessageRounds, stepRenderRange, ROUND_STEP_RENDER_LIMIT, type MessageRound } from './message-rounds';

/** 宽松构造消息（只给被测逻辑关心的字段） */
const M = (over: Record<string, any>) => ({ id: 'm' + Math.random().toString(36).slice(2, 8), role: 'assistant', content: '', ...over }) as any;
const isToolError = (c: string) => /error|失败/i.test(c || '');

const build = (msgs: any[]): MessageRound[] => buildMessageRounds(msgs, isToolError);

describe('① ★★★ 页内没有主链路 user 时，必须仍能分轮（本次白屏根因）', () => {
  it('★★★ 全是「主链路 assistant + tool」（无 user）→ rounds 必须为 1，不能为 0', () => {
    const msgs = [
      M({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1', function: { name: 'browser_click' } }] }),
      M({ id: 't1', role: 'tool', toolCallId: 'c1', content: 'ok' }),
      M({ id: 'a2', role: 'assistant', content: '完成' }),
    ];
    const rounds = build(msgs);
    expect(
      rounds.length,
      '★★★ rounds=0 ⇒ 内容区整页空白（用户实报"内容区域不显示了"）。' +
      '根因：分轮逻辑把"页内有 user"当成了开轮的必要条件 —— 而分页首拉不保证这一点。',
    ).toBe(1);
    expect(rounds[0].user, '★ 无轮头时 user 应为 null（渲染层已 v-if 守卫，不会出空气泡）').toBeNull();
    expect(rounds[0].steps.length, '★ 页内的 assistant 步骤应被完整保留').toBeGreaterThanOrEqual(1);
  });

  it('★★★ 复刻本次现场：50 条全是子智能体消息 → 不崩、不抛异常、rounds 为 0 但**不白屏**（无主链路消息可渲染）', () => {
    // 25 组 assistant+sub / tool+sub（子消息的父 step 不在本页 → 无处安放）
    const msgs: any[] = [];
    for (let i = 0; i < 25; i++) {
      msgs.push(M({ id: 'as' + i, role: 'assistant', parentToolCallId: 'parent-missing', toolCalls: [{ id: 'sc' + i }] }));
      msgs.push(M({ id: 'ts' + i, role: 'tool', parentToolCallId: 'parent-missing', toolCallId: 'sc' + i, content: 'x' }));
    }
    let rounds: MessageRound[] = [];
    expect(() => { rounds = build(msgs); }, '★ 不得抛异常（分轮里任何未捕获异常都会让 computed 抛 → 整块 UI 崩）').not.toThrow();
    // 本页确实没有"可归属的主链路内容" → 0 轮是正确的（不该硬造空轮）
    expect(rounds.length, '★ 纯子消息页无可渲染内容，0 轮合理 —— 关键是下面的混合页必须能渲染').toBe(0);
  });

  it('★★★ 子智能体消息 + 主链路消息混合（真实场景）→ 主链路部分必须渲染出来', () => {
    const msgs = [
      // 前 6 条是子消息（父 step 不在本页）
      M({ id: 'as1', role: 'assistant', parentToolCallId: 'gone', toolCalls: [{ id: 'c9' }] }),
      M({ id: 'ts1', role: 'tool', parentToolCallId: 'gone', toolCallId: 'c9', content: 'r' }),
      M({ id: 'as2', role: 'assistant', parentToolCallId: 'gone', toolCalls: [{ id: 'c10' }] }),
      M({ id: 'ts2', role: 'tool', parentToolCallId: 'gone', toolCallId: 'c10', content: 'r' }),
      // 主链路（无 user 轮头）
      M({ id: 'ma1', role: 'assistant', toolCalls: [{ id: 'mc1', function: { name: 'browser_navigate' } }] }),
      M({ id: 'mt1', role: 'tool', toolCallId: 'mc1', content: '已导航' }),
      M({ id: 'ma2', role: 'assistant', content: '好的，已完成' }),
    ];
    const rounds = build(msgs);
    expect(rounds.length, '★★★ 主链路消息必须能渲染（本次白屏的直接表现就是它们被整片丢弃）').toBe(1);
    expect(rounds[0].user).toBeNull();
    const allToolCallIds = rounds[0].allToolCalls.map((tc: any) => tc.id);
    expect(allToolCallIds, '★ 主链路的工具调用应保留').toContain('mc1');
    expect(rounds[0].finalAssistant?.content, '★ 收尾的纯文本 assistant 应被提为 finalAssistant').toBe('好的，已完成');
  });
});

describe('② 有 user 轮头时行为必须与旧实现逐字等价（防回归）', () => {
  it('★★ user 在首位 → 1 轮，且 user 正确挂上', () => {
    const msgs = [
      M({ id: 'u1', role: 'user', content: '帮我查一下' }),
      M({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1' }] }),
      M({ id: 't1', role: 'tool', toolCallId: 'c1', content: 'ok' }),
      M({ id: 'a2', role: 'assistant', content: '查完了' }),
    ];
    const rounds = build(msgs);
    expect(rounds.length).toBe(1);
    expect(rounds[0].user?.id, '★ 正常页的轮头不得被兜底分支覆盖').toBe('u1');
  });

  it('★★ 两个 user → 2 轮，各自归属正确', () => {
    const msgs = [
      M({ id: 'u1', role: 'user', content: 'q1' }),
      M({ id: 'a1', role: 'assistant', content: 'a1' }),
      M({ id: 'u2', role: 'user', content: 'q2' }),
      M({ id: 'a2', role: 'assistant', content: 'a2' }),
    ];
    const rounds = build(msgs);
    expect(rounds.length).toBe(2);
    expect(rounds[0].user?.id).toBe('u1');
    expect(rounds[1].user?.id).toBe('u2');
  });

  it('★★★ 页首有孤儿 assistant、页中才有 user → 孤儿归兜底轮，user 之后开新轮', () => {
    const msgs = [
      M({ id: 'a0', role: 'assistant', content: '上一轮的尾巴' }),
      M({ id: 'u1', role: 'user', content: '新问题' }),
      M({ id: 'a1', role: 'assistant', content: '新回答' }),
    ];
    const rounds = build(msgs);
    expect(rounds.length, '★ 孤儿 + 正常轮 = 2 轮（孤儿不得被丢弃，否则页首内容凭空消失）').toBe(2);
    expect(rounds[0].user, '★ 第一轮是兜底轮').toBeNull();
    expect(rounds[1].user?.id, '★ 第二轮是真正的轮头').toBe('u1');
  });
});

describe('③ 边界：空 / system / 压缩标记', () => {
  it('★ 空数组 → 0 轮（不硬造空轮）', () => {
    expect(build([]).length).toBe(0);
  });

  it('★ 只有 system（无 user 无 assistant）→ 0 轮', () => {
    expect(build([M({ role: 'system', content: 'sys' })]).length).toBe(0);
  });

  it('★★ 压缩标记（system+compactMarker）附到当前轮，不单独成轮', () => {
    const msgs = [
      M({ id: 'u1', role: 'user', content: 'q' }),
      M({ id: 's1', role: 'system', compactMarker: { coveredCount: 10, keptCount: 2, tokens: 100 } }),
      M({ id: 'a1', role: 'assistant', content: 'a' }),
    ];
    const rounds = build(msgs);
    expect(rounds.length).toBe(1);
    expect(rounds[0].compactMarkers?.length, '★ 压缩标记必须被提到轮上（压缩有损，不该隐形）').toBe(1);
  });

  it('★ 页首孤立 tool（无任何 assistant）→ 丢弃且不崩（tool 必属于某个 assistant）', () => {
    const msgs = [M({ id: 't0', role: 'tool', toolCallId: 'nope', content: 'x' })];
    let rounds: MessageRound[] = [];
    expect(() => { rounds = build(msgs); }).not.toThrow();
    expect(rounds.length, '★ 无归属的 tool 不该开轮').toBe(0);
  });

  it('★ 工具结果错误标记按注入的 isToolError 判定', () => {
    const msgs = [
      M({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1' }] }),
      M({ id: 't1', role: 'tool', toolCallId: 'c1', content: '执行失败 error' }),
    ];
    const rounds = build(msgs);
    const res = rounds[0]?.steps[0]?.toolResults?.[0];
    expect(res?.isError, '★ 注入的 isToolError 必须被真正使用').toBe(true);
  });
});

describe('④ 源码契约：不得退回"必须有 user 才开轮"', () => {
  it('★★★ 主链路 assistant 分支必须有兜底建轮（防回归到本次白屏）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'message-rounds.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // ★ 锚点选法：文件里有两处 `msg.role === 'assistant'`（子智能体分支 + 主链路分支）。
    //   不去数第几处 —— 改用**主链路独有的后续标记** `currentRound.allToolCalls.push` 反推：
    //   主链路 assistant 分支必然在它之前、且是距离它最近的 assistant 分支。
    const push = src.indexOf('currentRound.allToolCalls.push');
    expect(push, '未找到主链路标记 allToolCalls.push').toBeGreaterThanOrEqual(0);
    const mainIdx = src.lastIndexOf("msg.role === 'assistant'", push);
    expect(mainIdx, '未定位到主链路 assistant 分支').toBeGreaterThanOrEqual(0);
    const seg = src.slice(mainIdx, push);
    expect(
      seg,
      '★★★ 主链路 assistant 分支缺"无轮时兜底建轮" —— 分页首拉不保证页内有 user，' +
      '退回 `if (!currentRound) continue` 会让整页消息被丢弃 ⇒ 内容区白屏（2026-10-12 实锤）。',
    ).toMatch(/if\s*\(!currentRound\)\s*currentRound\s*=\s*\{/);
  });

  it('★★ useChat 不得再内联分轮实现（唯一实现必须在 message-rounds.ts）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'useChat.ts'), 'utf8');
    expect(src, '★ 未调用抽出的纯函数').toMatch(/buildMessageRounds\(/);
    expect(
      src,
      '★ useChat 里又出现了 `const stepByToolCallId = new Map` —— 分轮实现被复制回来了（两份实现必然漂移）',
    ).not.toMatch(/stepByToolCallId/);
  });
});

describe('⑤ 单轮步骤渲染窗口（长任务一跑界面卡死）', () => {
  it('步骤数不超过上限时全量渲染', () => {
    // Arrange
    const total = 12;

    // Act
    const range = stepRenderRange(total, false, 40);

    // Assert
    expect(range).toEqual({ start: 0, end: 12 });
  });

  it('步骤数超过上限时只渲染末尾 limit 步', () => {
    // Arrange
    const total = 193;

    // Act
    const range = stepRenderRange(total, false, 40);

    // Assert
    expect(range).toEqual({ start: 153, end: 193 });
  });

  it('用户主动展开后恢复全量', () => {
    // Arrange
    const total = 193;

    // Act
    const range = stepRenderRange(total, true, 40);

    // Assert
    expect(range).toEqual({ start: 0, end: 193 });
  });

  it('空轮次返回空区间', () => {
    expect(stepRenderRange(0, false, 40)).toEqual({ start: 0, end: 0 });
  });

  it('负数步骤数按 0 处理（脏数据不产生负下标）', () => {
    expect(stepRenderRange(-5, false, 40)).toEqual({ start: 0, end: 0 });
  });

  it('limit 非法（0 / 负数）时至少渲染最后 1 步，避免整轮变空', () => {
    expect(stepRenderRange(10, false, 0)).toEqual({ start: 9, end: 10 });
    expect(stepRenderRange(10, false, -3)).toEqual({ start: 9, end: 10 });
  });

  it('默认上限是 ROUND_STEP_RENDER_LIMIT（40）', () => {
    const range = stepRenderRange(100, false);
    expect(range.end - range.start).toBe(ROUND_STEP_RENDER_LIMIT);
  });
});
