// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: null })),
    post: vi.fn(async () => ({
      data: { id: 'goal_template_policy', conversationId: 'conv_template_policy', status: 'running' },
    })),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));
vi.mock('./platform', () => ({
  getWithRetry: vi.fn(async () => ({ data: [] })),
  usePlatformStore: () => ({ platforms: [], models: [], resolveModel: () => null }),
}));

import { api } from '../api/client';
import { useChatStore } from './chat';

const post = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('goal template policy wiring', () => {
  it('passes every saved policy field to the goal creation API', async () => {
    const store = useChatStore();
    await store.startGoal({
      conversationId: 'conv_template_policy',
      objective: '生成周报',
      platformId: 'platform_1',
      modelId: 'model_1',
      criteria: [{ id: 'report', title: '周报存在', kind: 'file_exists' }],
      constraints: ['只读源数据'],
      approvalRequired: ['对外发送'],
      maxBatches: 12,
      maxStallBatches: 4,
    });

    const body = post.mock.calls[0][1];
    expect(body.constraints).toEqual(['只读源数据']);
    expect(body.approvalRequired).toEqual(['对外发送']);
    expect(body.maxBatches).toBe(12);
    expect(body.maxStallBatches).toBe(4);
  });

  it('send flow forwards the active template policy snapshot', () => {
    const source = readFileSync(join(__dirname, '../composables/chat/useChat.ts'), 'utf8');
    const start = source.indexOf('if (store.goalMode)');
    const block = source.slice(start, start + 600);

    expect(block).toContain('criteria: store.goalTemplateDraft?.criteria');
    expect(block).toContain('constraints: store.goalTemplateDraft?.constraints');
    expect(block).toContain('approvalRequired: store.goalTemplateDraft?.approvalRequired');
    expect(block).toContain('maxBatches: store.goalTemplateDraft?.maxBatches');
    expect(block).toContain('maxStallBatches: store.goalTemplateDraft?.maxStallBatches');
  });
});
