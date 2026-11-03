// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../api/client', () => ({ api: apiMock }));

import OpsRunbookCenter from './OpsRunbookCenter.vue';

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountCenter(): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(OpsRunbookCenter as never, {
      connections: [{ id: 'c1', name: 'prod-web', type: 'ssh', tag: '生产' }],
      activeConnectionId: 'c1',
    }),
  });
  app.use(ElementPlus);
  for (const [name, component] of Object.entries(Icons)) app.component(name, component as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  apiMock.get.mockImplementation(async (path: string) => {
    if (path === '/plugin/ops-shell/runbooks') {
      return {
        data: [{
          id: 'rb1', name: '发布检查', description: '检查服务', connectionId: 'c1',
          enabled: true, version: 2,
          steps: [{ id: 's1', type: 'exec', name: '检查', command: 'uptime' }],
          rollbackSteps: [{ id: 'r1', type: 'exec', name: '恢复', command: 'sh rollback.sh' }],
          createdAt: 1, updatedAt: 2,
        }],
      };
    }
    return {
      data: [{
        id: 'run1', runbookId: 'rb1', runbookName: '发布检查', runbookVersion: 2,
        status: 'success', stepResults: [{ id: 's1', name: '检查', status: 'success', startedAt: 1, finishedAt: 2 }],
        rollbackResults: [], startedAt: 1, finishedAt: 2,
      }],
    };
  });
});

describe('OpsRunbookCenter mount', () => {
  it('渲染 Runbook 列表、版本、步骤与历史', async () => {
    const { app, host } = await mountCenter();
    expect(host.textContent).toContain('发布检查');
    expect(host.textContent).toContain('v2');
    expect(host.textContent).toContain('执行步骤');
    expect(host.textContent).toContain('回滚步骤');
    expect(host.textContent).toContain('运行历史');
    expect(host.textContent).toContain('成功');
    app.unmount();
  });
});
