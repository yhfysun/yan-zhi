// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => {
  const get = vi.fn(async () => ({
    data: {
      index: 1,
      title: '提交表单',
      status: 'done',
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1000,
      activeMs: 0,
      waitMs: 0,
      timingAvailable: true,
      containsWait: false,
      toolCallCount: 0,
      toolCalls: [],
      truncated: false,
      evidence: [
        { kind: 'screenshot', summary: '成功提示可见', ref: '/tmp/success.png' },
        { kind: 'test', summary: '状态回读通过' },
      ],
    },
  }));
  return {
    api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

import { createApp, h, nextTick, ref, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import PlanStepDetailDialog from './PlanStepDetailDialog.vue';

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

describe('PlanStepDetailDialog evidence', () => {
  it('renders structured task evidence for a plan step', async () => {
    document.body.innerHTML = '';
    const pinia = createPinia();
    setActivePinia(pinia);
    const dialog = ref<{ open: (index: number) => Promise<void> } | null>(null);
    const app: App = createApp({
      render: () => h(PlanStepDetailDialog as never, { ref: dialog, convId: 'conv-1' }),
    });
    app.use(pinia);
    app.use(ElementPlus);
    for (const [name, component] of Object.entries(Icons)) app.component(name, component as never);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();

    await dialog.value!.open(1);
    await settle();
    const text = document.body.textContent || '';
    expect(text).toContain('验收证据');
    expect(text).toContain('成功提示可见');
    expect(text).toContain('状态回读通过');
    app.unmount();
  });
});
