// @vitest-environment jsdom
/**
 * confirm_user 多页向导的「上一页」（2026-10-24，用户要求返回改答案）。
 *
 * ★ 为什么钉 store 而不是只断模板文本：返回键的错法是静默的 ——
 *   指针不后退、或回退时把 answers 清掉（上一页表单就回填成空白，等于没改），
 *   界面上都"还有个按钮"，但用户依然改不了上一页。这里只 mock HTTP 边界。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));
vi.mock('./platform', () => ({
  getWithRetry: vi.fn(async () => ({ data: [] })),
  usePlatformStore: () => ({ platforms: [], models: [], resolveModel: () => null }),
}));

import { useChatStore, SKIP_PAGE_SUPPLEMENT } from './chat';

function mountWizard(store: ReturnType<typeof useChatStore>) {
  const resolve = vi.fn();
  store.pendingConfirmation = {
    title: '测试向导',
    pages: [
      { question: 'Q1', options: ['A', 'B'] },
      { question: 'Q2', options: ['C', 'D'], multiSelect: true },
    ],
    index: 0,
    answers: [],
    resolve,
  };
  return resolve;
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('多页确认：返回上一页', () => {
  it('回退只移动指针，保留上一页已答内容（供表单回填）', () => {
    const store = useChatStore();
    mountWizard(store);
    store.submitPendingConfirmation('A', '补充一句');

    expect(store.pendingConfirmation!.index).toBe(1);

    store.prevPendingConfirmation();

    expect(store.pendingConfirmation!.index).toBe(0);
    expect(store.pendingConfirmation!.answers[0]).toMatchObject({
      question: 'Q1',
      answer: 'A',
      supplement: '补充一句',
    });
  });

  it('第一页再点上一页是空操作，不会越界', () => {
    const store = useChatStore();
    mountWizard(store);

    store.prevPendingConfirmation();

    expect(store.pendingConfirmation!.index).toBe(0);
  });

  it('回退后重新提交覆盖同一页答案，不会残留两份', () => {
    const store = useChatStore();
    mountWizard(store);
    store.submitPendingConfirmation('A');
    store.prevPendingConfirmation();
    store.submitPendingConfirmation('B');

    expect(store.pendingConfirmation!.index).toBe(1);
    expect(store.pendingConfirmation!.answers).toHaveLength(1);
    expect(store.pendingConfirmation!.answers[0].answer).toBe('B');
  });

  it('跳过的页写入固定标记，回填表单时可据此排除', () => {
    const store = useChatStore();
    mountWizard(store);

    store.skipPendingConfirmation();

    expect(store.pendingConfirmation!.answers[0]).toMatchObject({
      question: 'Q1',
      answer: '',
      supplement: SKIP_PAGE_SUPPLEMENT,
    });
    expect(store.pendingConfirmation!.index).toBe(1);
  });
});
