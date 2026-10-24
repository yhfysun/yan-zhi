// @vitest-environment jsdom
// 子智能体过程卡的默认折叠契约（2026-10-24 用户实报，两轮反馈）：
//   ①「子智能体的工具调用、思考内容这里也放出来啊，要不然都不知道在干啥」→ 主内容区要有它；
//   ②「不要默认展开啊，和外面智能体一样概览就好了，要不然应用又容易卡死」→ 只给概览行。
//
// ★ 为什么必须挂载跑真组件：默认折叠是性能契约，写错的表现是**看起来正常但卡**
//   （步骤树整棵进 DOM，流式期间每帧重渲）。只能钉 DOM 事实：body 到底在不在。
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';

const state = vi.hoisted(() => ({ running: true }));

vi.mock('../../composables/chat/useChat', () => ({
  useChat: () => ({
    renderMarkdown: (s: string) => s,
    resolveToolDisplay: (tc: any) => ({ server: 'MCP', tool: tc?.function?.name || 'tool' }),
    resolveToolArgs: (tc: any) => tc?.function?.arguments || '{}',
    toolTargetHint: () => '',
  }),
}));
vi.mock('../../stores', () => ({
  useChatStore: () => ({ isToolCallRunning: () => state.running }),
}));

import SubAgentRoundView from './SubAgentRoundView.vue';

const tick = async () => { for (let i = 0; i < 4; i++) await nextTick(); };

function makeRound() {
  return {
    toolCallId: 'call-1',
    subAgentId: 'a_builtin_page_agent',
    subAgentName: '浏览器操作助手',
    depth: 1,
    steps: [
      {
        reasoningContent: '先看看当前页面有没有登录',
        toolCalls: [{ id: 'c1', function: { name: 'browser_snapshot', arguments: '{"tabId":1}' } }],
        toolResults: [],
        partialContent: '我正在打开合集创建页',
      },
    ],
  };
}

function mount(round = makeRound()): { host: HTMLElement; app: App } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(SubAgentRoundView as never, { round, idPrefix: 'sub-0' }) });
  app.use(ElementPlus);
  app.mount(host);
  return { host, app };
}

describe('子智能体卡：默认只给概览（步骤树不进 DOM）', () => {
  it('★★★ 运行中默认收起：头行有名字/执行中/计数，但没有任何步骤节点', async () => {
    state.running = true;
    const { host, app } = mount();
    await tick();
    const text = host.textContent || '';
    expect(text, '★ 概览行必须说明是谁在跑').toContain('浏览器操作助手');
    expect(text, '★ 概览行必须说明还在跑').toContain('执行中');
    expect(text, '★ 概览行必须给出规模').toMatch(/1 次推理，1 个工具调用/);
    expect(text, '★ 概览行要写出正在跑的工具（不然又回到"不知道在干啥"）').toContain('browser_snapshot');
    // 收起 ≠ 隐形：思考摘要与正文要能看到（用户：「思考内容也要能看到，还有响应内容」）
    expect(host.querySelector('.sub-agent-tail'), '★ 收起态没有实时片段 ⇒ 又只剩一行数字').toBeTruthy();
    expect(host.querySelector('.dtb-peek')?.textContent || '', '★ 看不到子智能体在想什么').toContain('先看看当前页面有没有登录');
    expect(host.querySelector('.sub-agent-tail-content')?.textContent || '', '★ 看不到子智能体的响应正文').toContain('我正在打开合集创建页');
    expect(
      host.querySelector('.sub-agent-body'),
      '★ 子智能体步骤树默认展开 = 一次长任务上百步全进 DOM，流式每帧重渲（用户实报卡死）',
    ).toBeNull();
    app.unmount();
  });

  it('★★ 点概览行才展开：推理与工具参数此时才渲染', async () => {
    state.running = true;
    const { host, app } = mount();
    await tick();
    (host.querySelector('.sub-agent-header') as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(host.querySelector('.sub-agent-body'), '★ 点了还是展不开 ⇒ 用户永远看不到子智能体细节').toBeTruthy();
    expect(host.querySelectorAll('.sub-agent-body .tool-item').length, '★ 展开后要能看到每一步的工具调用').toBeGreaterThan(0);
    expect(host.querySelector('.sub-agent-tail'), '★ 展开态不该再挂实时片段（同一段推理会画两遍）').toBeNull();
    app.unmount();
  });

  it('★ 已结束：同样收起，且没有「执行中」标记', async () => {
    state.running = false;
    const { host, app } = mount();
    await tick();
    expect(host.querySelector('.sub-agent-body')).toBeNull();
    expect(host.querySelector('.sub-agent-status.running')).toBeNull();
    app.unmount();
  });
});
