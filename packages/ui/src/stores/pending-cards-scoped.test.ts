// @vitest-environment jsdom
/**
 * 挂起卡必须按会话隔离（2026-10-27 实测：切到别的会话，上一会话的 ask/确认卡还在）。
 *
 * ★ 为什么钉 store：卡是「弹在某会话里等回答」的阻塞 UI，串台的表现是静默的 ——
 *   卡照样能点、答案照样被回传，只是回给了错的任务；并行会话各自提问时，后一个还会
 *   覆盖前一个的 Promise（前一个任务永久挂住），界面上完全看不出异常。
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

import { useChatStore } from './chat';

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('挂起卡按会话隔离', () => {
  it('反问卡只出现在发起它的会话里，切走看不到、切回来还在', () => {
    const store = useChatStore();
    store.currentConvId = 'conv-A';
    store.pendingQuestion = { question: '用哪种报告格式？', resolve: vi.fn() };
    expect(store.pendingQuestion?.question).toBe('用哪种报告格式？');

    store.currentConvId = 'conv-B';
    expect(store.pendingQuestion).toBeNull();

    store.currentConvId = 'conv-A';
    expect(store.pendingQuestion?.question).toBe('用哪种报告格式？');
  });

  it('并行两个会话各自提问时互不覆盖（旧实现后一个会顶掉前一个）', () => {
    const store = useChatStore();
    store.currentConvId = 'conv-A';
    store.pendingQuestion = { question: 'A 的问题', resolve: vi.fn() };
    store.currentConvId = 'conv-B';
    store.pendingQuestion = { question: 'B 的问题', resolve: vi.fn() };

    expect(store.pendingQuestion?.question).toBe('B 的问题');
    store.currentConvId = 'conv-A';
    expect(store.pendingQuestion?.question).toBe('A 的问题');
  });

  it('确认向导同样按会话隔离', () => {
    const store = useChatStore();
    store.currentConvId = 'conv-A';
    store.pendingConfirmation = {
      title: '确认',
      pages: [{ question: 'Q1' }],
      index: 0,
      answers: [],
      resolve: vi.fn(),
    };
    expect(store.pendingConfirmation?.title).toBe('确认');

    store.currentConvId = 'conv-B';
    expect(store.pendingConfirmation).toBeNull();
  });

  it('越界访问授权卡与工具授权卡不跨会话显示', () => {
    const store = useChatStore();
    store.currentConvId = 'conv-A';
    store.pendingPathAuth = {
      toolName: 'file_write',
      isCommand: false,
      workspaceDir: 'C:/ws',
      items: [{ action: 'write', rawPath: 'C:/other/x.txt', absPath: 'C:/other/x.txt' }],
      resolve: vi.fn(),
    };
    store.pendingToolAuth = { toolName: 'file_write', argsPreview: '{}', resolve: vi.fn() };

    expect(store.pendingPathAuth?.toolName).toBe('file_write');
    expect(store.pendingToolAuth?.toolName).toBe('file_write');

    store.currentConvId = 'conv-B';
    expect(store.pendingPathAuth).toBeNull();
    expect(store.pendingToolAuth).toBeNull();
  });

  it('提交只作用于当前会话的卡，别的会话的卡不受影响', () => {
    const store = useChatStore();
    const resolveA = vi.fn();
    const resolveB = vi.fn();
    store.currentConvId = 'conv-A';
    store.pendingQuestion = { question: 'A', resolve: resolveA };
    store.currentConvId = 'conv-B';
    store.pendingQuestion = { question: 'B', resolve: resolveB };

    store.submitPendingQuestion('答 B');
    expect(resolveB).toHaveBeenCalledWith('答 B', undefined);
    expect(resolveA).not.toHaveBeenCalled();
    expect(store.pendingQuestion).toBeNull();

    store.currentConvId = 'conv-A';
    expect(store.pendingQuestion?.question).toBe('A');
  });
});

describe('任务终态收掉待答卡', () => {
  it('会话没有活动任务后，挂着的提问卡被清掉并 settle（不再永久等一个不会来的回答）', () => {
    const store = useChatStore();
    const resolve = vi.fn();
    store.currentConvId = 'conv-A';
    store.pendingQuestion = { question: '还在吗？', resolve };

    store.dropPendingCards('conv-A');

    expect(store.pendingQuestion).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('向导以 cancelled 收尾，保留已答内容', () => {
    const store = useChatStore();
    const resolve = vi.fn();
    store.currentConvId = 'conv-A';
    store.pendingConfirmation = {
      title: '确认',
      pages: [{ question: 'Q1' }, { question: 'Q2' }],
      index: 1,
      answers: [{ question: 'Q1', answer: 'A' }],
      resolve,
    };

    store.dropPendingCards('conv-A');

    expect(store.pendingConfirmation).toBeNull();
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      cancelled: true,
      answers: [expect.objectContaining({ answer: 'A' })],
    }));
  });

  it('两张授权卡按拒绝收尾，且只影响指定会话', () => {
    const store = useChatStore();
    const denyPath = vi.fn();
    const denyTool = vi.fn();
    const otherResolve = vi.fn();
    store.currentConvId = 'conv-A';
    store.pendingPathAuth = {
      toolName: 'file_write',
      isCommand: false,
      workspaceDir: 'C:/ws',
      items: [],
      resolve: denyPath,
    };
    store.pendingToolAuth = { toolName: 'file_write', argsPreview: '', resolve: denyTool };
    store.pendingQuestion = { question: 'A 的问题', resolve: otherResolve };

    store.dropPendingCards('conv-B');
    expect(store.pendingPathAuth).not.toBeNull(); // 别的会话不受影响
    expect(otherResolve).not.toHaveBeenCalled();

    store.dropPendingCards('conv-A');
    expect(denyPath).toHaveBeenCalledWith('deny');
    expect(denyTool).toHaveBeenCalledWith('deny');
    expect(store.pendingPathAuth).toBeNull();
    expect(store.pendingToolAuth).toBeNull();
  });
});
