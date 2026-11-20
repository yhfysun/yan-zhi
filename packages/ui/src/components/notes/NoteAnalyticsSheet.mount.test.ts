// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import NoteAnalyticsSheet from './NoteAnalyticsSheet.vue';
import { NOTE_BUILTIN_DICTIONARIES } from '@yan-zhi/shared';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(async () => ({
    data: {
      from: Date.now() - 3600_000,
      to: Date.now(),
      totals: {
        expense: 28.5,
        income: 120,
        purchase: 50,
        sale: 24,
        net: 65.5,
        minutes: 90,
        tasksDone: 1,
        tasksOpen: 2,
        tasksOverdue: 1,
      },
      daily: [],
      expenseByCategory: [{ key: 'food', amount: 28.5 }],
      timeByCategory: [{ key: 'business', minutes: 90 }],
      inventory: [{ product: '红富士苹果', category: 'fresh', quantityOnHand: 7, purchaseAmount: 50, saleAmount: 24 }],
    },
  })),
}));
vi.mock('../../api/client', () => ({ api: { get: apiGet } }));

const mounted: Array<() => void> = [];

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(NoteAnalyticsSheet as unknown as App, {
    visible: true,
    dictionaries: NOTE_BUILTIN_DICTIONARIES,
  });
  app.mount(host);
  mounted.push(() => app.unmount());
  await nextTick();
  return host;
}

afterEach(() => {
  mounted.splice(0).forEach((unmount) => unmount());
  document.body.innerHTML = '';
  apiGet.mockClear();
});

describe('记录统计报告', () => {
  it('渲染金额、分类、时间和库存结余，字典 id 显示为中文', async () => {
    await mount();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('账本与时间报告');
      expect(document.body.textContent).toContain('¥28.50');
      expect(document.body.textContent).toContain('餐饮');
      expect(document.body.textContent).toContain('1h 30m');
      expect(document.body.textContent).toContain('红富士苹果');
      expect(document.body.textContent).toContain('7 件');
    });
  });

  it('切换统计范围会重新请求对应区间', async () => {
    await mount();
    const week = [...document.querySelectorAll('.nas-ranges button')]
      .find((button) => button.textContent?.includes('近 7 天')) as HTMLButtonElement;
    week.click();
    await vi.waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/notes/analytics?from='));
      expect(apiGet.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
