// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus, { ElMessageBox } from 'element-plus';
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

function versionSummaries() {
  return [
    {
      runbookId: 'rb1', version: 2, name: '发布检查', connectionId: 'c1', enabled: true,
      parameterCount: 1, stepCount: 1, rollbackStepCount: 1, createdAt: 2,
    },
    {
      runbookId: 'rb1', version: 1, name: '发布检查旧版', connectionId: 'c1', enabled: true,
      parameterCount: 0, stepCount: 1, rollbackStepCount: 0, createdAt: 1,
    },
  ];
}

beforeEach(() => {
  document.body.innerHTML = '';
  apiMock.get.mockImplementation(async (path: string) => {
    if (path === '/plugin/ops-shell/runbooks') {
      return {
        data: [{
          id: 'rb1', name: '发布检查', description: '检查服务', connectionId: 'c1',
          enabled: true, version: 2,
          parameters: [{ key: 'service', label: '服务名', required: true, defaultValue: 'api' }],
          steps: [{ id: 's1', type: 'exec', name: '检查', command: 'uptime' }],
          rollbackSteps: [{ id: 'r1', type: 'exec', name: '恢复', command: 'sh rollback.sh' }],
          createdAt: 1, updatedAt: 2,
        }],
      };
    }
    if (path.endsWith('/versions')) return { data: versionSummaries() };
    if (path.includes('/versions/')) {
      return {
        data: {
          runbookId: 'rb1', version: 1, createdAt: 1,
          snapshot: {
            id: 'rb1', name: '发布检查旧版', connectionId: 'c1', enabled: true, version: 1,
            parameters: [], steps: [{ id: 's1', type: 'exec', name: '检查', command: 'uptime' }],
            rollbackSteps: [], createdAt: 1, updatedAt: 1,
          },
        },
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
    expect(host.textContent).toContain('版本历史');
    expect(host.textContent).toContain('运行历史');
    expect(host.textContent).toContain('成功');
    app.unmount();
  });

  it('运行前展示参数并把同一组参数传给审批与启动接口', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    apiMock.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/approval')) {
        return { data: { required: false, plan: '执行检查' } };
      }
      if (path.endsWith('/run')) {
        return {
          data: {
            id: 'run-param', runbookId: 'rb1', runbookName: '发布检查', runbookVersion: 2,
            status: 'running', inputParams: { service: 'api' }, stepResults: [], rollbackResults: [],
            startedAt: 3,
          },
        };
      }
      return { data: {} };
    });
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/plugin/ops-shell/runbooks') {
        return {
          data: [{
            id: 'rb1', name: '发布检查', connectionId: 'c1', enabled: true, version: 2,
            parameters: [{ key: 'service', label: '服务名', required: true, defaultValue: 'api' }],
            steps: [{ id: 's1', type: 'exec', name: '检查', command: 'systemctl status ${service}' }],
            rollbackSteps: [], createdAt: 1, updatedAt: 2,
          }],
        };
      }
      if (path.endsWith('/versions')) return { data: versionSummaries() };
      if (path.includes('/versions/')) {
        return { data: { runbookId: 'rb1', version: 1, createdAt: 1, snapshot: {} } };
      }
      if (path.includes('/runbooks/runs/run-param')) {
        return {
          data: {
            id: 'run-param', runbookId: 'rb1', runbookName: '发布检查', runbookVersion: 2,
            status: 'success', inputParams: { service: 'api' }, stepResults: [], rollbackResults: [],
            startedAt: 3, finishedAt: 4,
          },
        };
      }
      return { data: [] };
    });

    const { app, host } = await mountCenter();
    const runButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '运行') as HTMLButtonElement | undefined;
    expect(runButton).toBeTruthy();
    runButton!.click();
    await settle();

    expect(document.body.textContent).toContain('运行参数');
    expect(document.body.textContent).toContain('服务名');
    const continueButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '继续运行') as HTMLButtonElement | undefined;
    expect(continueButton).toBeTruthy();
    continueButton!.click();
    await settle(8);

    expect(confirm).toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledWith(
      '/plugin/ops-shell/runbooks/rb1/approval',
      { params: { service: 'api' } },
    );
    expect(apiMock.post).toHaveBeenCalledWith(
      '/plugin/ops-shell/runbooks/rb1/run',
      { params: { service: 'api' } },
    );
    confirm.mockRestore();
    app.unmount();
  });

  it('运行中的记录可请求取消并保持轮询到终态', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    apiMock.get.mockImplementation(async (path: string) => {
      if (path === '/plugin/ops-shell/runbooks') {
        return {
          data: [{
            id: 'rb1', name: '发布检查', connectionId: 'c1', enabled: true, version: 2,
            parameters: [], steps: [{ id: 's1', type: 'wait', name: '等待', seconds: 30 }],
            rollbackSteps: [], createdAt: 1, updatedAt: 2,
          }],
        };
      }
      if (path.endsWith('/versions')) return { data: versionSummaries() };
      if (path.includes('/versions/')) {
        return { data: { runbookId: 'rb1', version: 1, createdAt: 1, snapshot: {} } };
      }
      if (path.includes('/runbooks/runs/run-live')) {
        return {
          data: {
            id: 'run-live', runbookId: 'rb1', runbookName: '发布检查', runbookVersion: 2,
            status: 'cancelled', inputParams: {}, stepResults: [], rollbackResults: [],
            startedAt: 3, finishedAt: 4,
          },
        };
      }
      return {
        data: [{
          id: 'run-live', runbookId: 'rb1', runbookName: '发布检查', runbookVersion: 2,
          status: 'running', inputParams: {}, stepResults: [], rollbackResults: [], startedAt: 3,
        }],
      };
    });
    apiMock.post.mockResolvedValue({ data: { cancelRequested: true } });

    const { app, host } = await mountCenter();
    const historyRow = host.querySelector('.orbc-history-row') as HTMLButtonElement | null;
    expect(historyRow).toBeTruthy();
    historyRow!.click();
    await settle();

    const cancelButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '取消运行') as HTMLButtonElement | undefined;
    expect(cancelButton).toBeTruthy();
    cancelButton!.click();
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledWith('/plugin/ops-shell/runbooks/runs/run-live/cancel');
    confirm.mockRestore();
    app.unmount();
  });

  it('版本历史可恢复旧版为新的当前版本', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    apiMock.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/versions/1/restore')) {
        return {
          data: {
            id: 'rb1', name: '发布检查旧版', connectionId: 'c1', enabled: true, version: 3,
            parameters: [], steps: [{ id: 's1', type: 'exec', name: '检查', command: 'uptime' }],
            rollbackSteps: [], createdAt: 1, updatedAt: 4,
          },
        };
      }
      return { data: {} };
    });

    const { app, host } = await mountCenter();
    expect(host.textContent).toContain('版本历史');
    expect(host.textContent).toContain('发布检查旧版');
    const restoreButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '恢复此版本') as HTMLButtonElement | undefined;
    expect(restoreButton).toBeTruthy();
    restoreButton!.click();
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledWith('/plugin/ops-shell/runbooks/rb1/versions/1/restore');
    confirm.mockRestore();
    app.unmount();
  });
});
