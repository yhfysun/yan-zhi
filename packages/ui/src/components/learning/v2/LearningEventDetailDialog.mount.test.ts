// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import type { LearningV2EventDetail } from '@yan-zhi/shared';
import LearningEventDetailDialog from './LearningEventDetailDialog.vue';

const event: LearningV2EventDetail = {
  id: 'zunyi',
  title: '遵义会议全过程',
  period: '1934—1935',
  summary: '连续会议与会后落实共同构成转折。',
  background: '第五次反围剿失败后被迫长征。',
  timeline: [
    {
      date: '1935-01-15',
      title: '会议召开',
      body: '中央政治局扩大会议在遵义召开。',
      sourceIds: ['source-1'],
    },
  ],
  outcome: '会议调整组织和军事领导关系。',
  significance: '转折需要会后行动检验。',
  sourceCards: [{
    id: 'source-1',
    title: '遵义会议伟大转折',
    issuer: '遵义会议纪念馆',
    url: 'https://www.zunyihy.cn/n181/index.html',
    usedFor: '核对会议过程和决定。',
  }],
};

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

async function mount(open: boolean) {
  const visible = ref(open);
  const closed = ref(0);
  app = createApp({
    render: () => h(LearningEventDetailDialog as never, {
      event,
      open: visible.value,
      onClose: () => {
        closed.value += 1;
        visible.value = false;
      },
    }),
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { closed };
}

describe('LearningEventDetailDialog', () => {
  it('renders the complete event process and source cards', async () => {
    await mount(true);

    const dialog = document.body.querySelector('[data-learning-event-dialog]');
    expect(dialog?.textContent).toContain('从开始到结局');
    expect(dialog?.textContent).toContain('会议召开');
    expect(dialog?.textContent).toContain('事件结局');
    expect(dialog?.textContent).toContain('始末来源');
    expect(dialog?.querySelector('a[href="https://www.zunyihy.cn/n181/index.html"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    await nextTick();
    expect(document.activeElement?.getAttribute('aria-label')).toContain('关闭事件档案');
  });

  it('closes with Escape without closing the lesson', async () => {
    const { closed } = await mount(true);

    document.body.querySelector('[data-learning-event-dialog] section')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();

    expect(closed.value).toBe(1);
    expect(document.body.querySelector('[data-learning-event-dialog]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
