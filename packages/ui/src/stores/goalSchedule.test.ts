import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({
      data: {
        id: 'goalsched_1',
        name: '每日经营巡检',
        objective: '核对经营数据',
        enabled: true,
        nextRunAt: 123,
      },
    })),
    patch: vi.fn(async () => ({
      data: {
        id: 'goalsched_1',
        name: '每日经营巡检',
        objective: '核对经营数据',
        enabled: false,
        nextRunAt: null,
      },
    })),
    delete: vi.fn(async () => ({ ok: true })),
  },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));

import { api } from '../api/client';
import { useGoalScheduleStore } from './goalSchedule';

const post = api.post as unknown as ReturnType<typeof vi.fn>;
const patch = api.patch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('goal schedule store', () => {
  it('creates a schedule from a saved goal template and keeps it in the list', async () => {
    const store = useGoalScheduleStore();
    const schedule = await store.createSchedule({
      name: '每日经营巡检',
      conversationId: 'conv_1',
      templateId: 'goaltpl_1',
      platformId: 'platform_1',
      modelId: 'model_1',
      cronExpr: '30 9 * * *',
    });

    expect(post.mock.calls[0][0]).toBe('/llm/goal-schedules');
    expect(post.mock.calls[0][1]).toMatchObject({
      templateId: 'goaltpl_1',
      cronExpr: '30 9 * * *',
    });
    expect(schedule.id).toBe('goalsched_1');
    expect(store.schedules[0].id).toBe('goalsched_1');
  });

  it('toggles a schedule through the update endpoint', async () => {
    const store = useGoalScheduleStore();
    store.schedules = [{
      id: 'goalsched_1',
      name: '每日经营巡检',
      objective: '核对经营数据',
      enabled: true,
    } as any];

    const updated = await store.updateSchedule('goalsched_1', { enabled: false });

    expect(patch.mock.calls[0][0]).toBe('/llm/goal-schedules/goalsched_1');
    expect(patch.mock.calls[0][1]).toEqual({ enabled: false });
    expect(updated.enabled).toBe(false);
    expect(store.schedules[0].enabled).toBe(false);
  });
});
