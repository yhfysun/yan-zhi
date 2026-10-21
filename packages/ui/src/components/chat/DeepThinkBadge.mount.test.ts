// @vitest-environment jsdom
// 「深度思考」徽标的行为契约（2026-10-21 用户：「就跟 workbuddy 一样啊，有个深度思考标志然后跑马灯啊」）
//
// ★ 为什么单测这个小组件：它是**用户唯一能看出"模型在想"的视觉信号**。
//   样式类名/状态类一旦写错（比如 thinking 态没挂 is-thinking），跑马灯就不动，
//   而界面看起来仍然"有个标签"—— 属于典型的"断言存在 ≠ 断言生效"，必须钉到 class 与文案。
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import DeepThinkBadge from './DeepThinkBadge.vue';

function mount(props: Record<string, unknown>): { host: HTMLElement; app: App; clicks: () => number } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let clicks = 0;
  const app = createApp({
    render: () => h(DeepThinkBadge as never, { ...props, onToggle: () => { clicks += 1; } }),
  });
  app.use(ElementPlus);
  app.mount(host);
  return { host, app, clicks: () => clicks };
}

const tick = async () => { for (let i = 0; i < 4; i++) await nextTick(); };

describe('DeepThinkBadge · 深度思考标识 + 跑马灯', () => {
  it('★ 思考中：文案「深度思考中」且挂 is-thinking（跑马灯动画的开关）', async () => {
    const { host, app } = mount({ state: 'thinking', chars: 320 });
    await tick();
    const btn = host.querySelector('.dtb') as HTMLElement;
    expect(btn).toBeTruthy();
    expect(btn.className).toContain('is-thinking');
    expect(host.textContent || '').toContain('深度思考中');
    expect(host.textContent || '').toContain('320 字');
    // 呼吸点只在思考中出现
    expect(host.querySelector('.dtb-pulse')).toBeTruthy();
    app.unmount();
  });

  it('★ 思考结束：文案回到「深度思考」，不再有 is-thinking / 呼吸点', async () => {
    const { host, app } = mount({ state: 'done', chars: 1204 });
    await tick();
    const btn = host.querySelector('.dtb') as HTMLElement;
    expect(btn.className).toContain('is-done');
    expect(btn.className).not.toContain('is-thinking');
    expect(host.textContent || '').toContain('深度思考');
    expect(host.textContent || '').not.toContain('深度思考中');
    expect(host.textContent || '').toContain('1.2k 字');
    expect(host.querySelector('.dtb-pulse')).toBeNull();
    app.unmount();
  });

  it('★ 点击整行触发 toggle（展开/收起全文的唯一入口）', async () => {
    const { host, app, clicks } = mount({ state: 'done' });
    await tick();
    (host.querySelector('.dtb') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(clicks()).toBe(1);
    app.unmount();
  });

  it('展开时箭头翻转（open → class open，视觉上"点开了"）', async () => {
    const closed = mount({ state: 'done', open: false });
    await tick();
    const opened = mount({ state: 'done', open: true });
    await tick();
    expect((closed.host.querySelector('.dtb') as HTMLElement).className).not.toContain('open');
    expect((opened.host.querySelector('.dtb') as HTMLElement).className).toContain('open');
    closed.app.unmount();
    opened.app.unmount();
  });

  it('没有字数时不渲染 0 字（避免历史消息出现"0 字"噪声）', async () => {
    const { host, app } = mount({ state: 'done', chars: 0 });
    await tick();
    expect(host.querySelector('.dtb-meta')).toBeNull();
    app.unmount();
  });
});
