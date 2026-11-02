// @vitest-environment jsdom
/**
 * 巡检中心真实挂载：确认两个主区域、最新指标、活动事件和手动巡检按钮能渲染并触发 API。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));
const pollStop = vi.hoisted(() => vi.fn());

vi.mock('../../api/client', () => ({
  api: apiMock,
}));
vi.mock('../../utils/visible-polling', () => ({
  startVisiblePolling: () => pollStop,
}));

import OpsMonitorCenter from './OpsMonitorCenter.vue';

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountCenter(): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(OpsMonitorCenter as never, {
      connections: [
        { id: 'c1', name: 'prod-web', type: 'ssh', tag: '生产' },
        { id: 'db1', name: 'orders-db', type: 'database' },
      ],
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
  apiMock.get.mockResolvedValue({
    data: {
      connections: [{
        id: 'c1', name: 'prod-web', type: 'ssh', tag: '生产',
        config: {
          connectionId: 'c1', enabled: true, intervalSec: 60, loadPct: 80, memPct: 90, diskPct: 85,
          ports: [22, 8080], httpChecks: [],
          feishuConfigured: true, wecomConfigured: false,
          notifyMinSeverity: 'warning', notifyOnResolve: true,
          updatedAt: 1,
        },
        latestSample: {
          connectionId: 'c1', sampledAt: 1000, load1: 2, cpuCount: 4, loadPct: 50,
          memUsedPct: 76, diskUsedPct: 88,
        },
      }],
      alerts: [{
        id: 'a1', connectionName: 'prod-web', metric: 'disk', severity: 'critical', status: 'active',
        title: '磁盘使用率偏高', detail: '当前 96%，阈值 85%', lastSeen: 2000,
      }],
      activeCount: 1,
      acknowledgedCount: 0,
    },
  });
  apiMock.post.mockResolvedValue({ data: { checked: 1, sampled: 1, failed: 0 } });
  apiMock.put.mockResolvedValue({ data: { connectionId: 'c1' } });
});

describe('OpsMonitorCenter mount', () => {
  it('渲染配置、最新指标与活动事件，并排除数据库连接', async () => {
    const { app, host } = await mountCenter();
    expect(host.textContent).toContain('巡检配置');
    expect(host.textContent).toContain('事件中心');
    expect(host.textContent).toContain('50%');
    expect(host.textContent).toContain('76%');
    expect(host.textContent).toContain('88%');
    expect(host.textContent).toContain('飞书 Webhook');
    expect(host.textContent).toContain('已配置');
    expect(host.textContent).toContain('通知未静默');
    expect(host.textContent).toContain('磁盘使用率偏高');
    expect(host.textContent).toContain('prod-web');
    expect(host.textContent).not.toContain('orders-db');
    app.unmount();
  });

  it('点击立即巡检会调用 ops-shell monitor/run', async () => {
    const { app, host } = await mountCenter();
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('立即巡检'));
    expect(button).toBeTruthy();
    button!.click();
    await settle();
    expect(apiMock.post).toHaveBeenCalledWith('/plugin/ops-shell/monitor/run', { connectionId: 'c1' });
    app.unmount();
  });

  it('静默按钮调用连接级静默接口', async () => {
    const { app, host } = await mountCenter();
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('静默 1h'));
    expect(button).toBeTruthy();
    button!.click();
    await settle();
    expect(apiMock.post).toHaveBeenCalledWith('/plugin/ops-shell/monitor/config/c1/silence', { minutes: 60 });
    app.unmount();
  });
});
