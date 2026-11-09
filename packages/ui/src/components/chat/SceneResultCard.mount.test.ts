// @vitest-environment jsdom
// SceneResultCard（场景结算卡）的行为契约：星级/分数/纠错表 + P2 重练按钮的显示与事件。
//
// ★ 为什么单测：重练按钮的可见性由 canRetry 控制（仅 learning 模式且会话带场景元数据时），
//   挂错闸会出现在办公模式的历史会话里（会话落错模式列表的同族事故），必须钉住。
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import SceneResultCard from './SceneResultCard.vue';

const RESULT = {
  score: 86,
  stars: 3,
  keyPhrases: ['I have a reservation under the name of...'],
  corrections: [{ wrong: 'I am agree', right: 'I agree', why: 'agree 是动词', grammarPoint: '主谓结构' }],
};

function mount(props: Record<string, unknown>): { host: HTMLElement; app: App; retries: () => number } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let retries = 0;
  const app = createApp({
    render: () => h(SceneResultCard as never, { ...props, onRetry: () => { retries += 1; } }),
  });
  app.mount(host);
  return { host, app, retries: () => retries };
}

const tick = async () => { for (let i = 0; i < 4; i++) await nextTick(); };

describe('SceneResultCard · 场景结算卡', () => {
  it('渲染星级、分数与纠错表（错句删除线 + 母语者说法）', async () => {
    const { host, app } = mount({ result: RESULT });
    await tick();
    expect(host.querySelector('.sr-head')?.textContent).toContain('86 分');
    expect(host.querySelector('.sr-stars')?.textContent).toContain('★★★');
    expect(host.querySelector('.sr-corrections')?.textContent).toContain('I am agree');
    expect(host.querySelector('.sr-corrections')?.textContent).toContain('I agree');
    app.unmount();
  });

  it('★ 重练按钮：默认不渲染（canRetry 缺省=false）', async () => {
    const { host, app } = mount({ result: RESULT });
    await tick();
    expect(host.querySelector('.sr-retry')).toBeNull();
    app.unmount();
  });

  it('★ canRetry=true 显示重练按钮并 emit retry', async () => {
    const { host, app, retries } = mount({ result: RESULT, canRetry: true });
    await tick();
    const btn = host.querySelector('.sr-retry') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('重练');
    btn.click();
    await tick();
    expect(retries()).toBe(1);
    app.unmount();
  });

  it('retrying=true：按钮禁用并显示进行中文案', async () => {
    const { host, app } = mount({ result: RESULT, canRetry: true, retrying: true });
    await tick();
    const btn = host.querySelector('.sr-retry') as HTMLButtonElement;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toContain('创建重练会话中');
    app.unmount();
  });
});
