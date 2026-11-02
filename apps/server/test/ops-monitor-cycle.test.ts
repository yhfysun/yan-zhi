/**
 * 常驻巡检周期真跑：假 SSH 返回固定指标，验证样本落库、告警生成与去重。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (value: string) => `ENC:${value}`,
  decrypt: (value: string) => String(value).replace(/^ENC:/, ''),
}));

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeClient {
    handlers: Record<string, Array<(...args: any[]) => void>> = {};
    on(event: string, callback: (...args: any[]) => void) {
      (this.handlers[event] ||= []).push(callback);
      return this;
    }
    once(event: string, callback: (...args: any[]) => void) { return this.on(event, callback); }
    emit(event: string, ...args: any[]) {
      for (const callback of this.handlers[event] || []) callback(...args);
      return this;
    }
    connect() { queueMicrotask(() => this.emit('ready')); return this; }
    exec(_command: string, callback: (error: Error | null, channel: any) => void) {
      const channel: any = new EventEmitter();
      channel.stderr = new EventEmitter();
      channel.close = () => {};
      channel.setWindow = () => {};
      queueMicrotask(() => {
        channel.emit('data', Buffer.from(`__YZ_LOAD__ 4.00 3.00 2.00 1/100 1
__YZ_CPU__ 4
__YZ_MEM__ Mem: 1000 950 50 0 0 50
__YZ_DISK__ /dev/sda1 100G 96G 4G 96% /`));
        channel.emit('close', 0);
      });
      callback(null, channel);
    }
    end() { this.emit('close'); }
  }
  return { Client: FakeClient };
});

import { runOpsMonitorCycle, opsShellModule } from '../src/plugins/ops-shell.js';
import { db } from '../src/db.js';
import { createOpsMonitorStore } from '../src/plugins/ops-monitor-store.js';
import { normalizeMonitorConfig } from '../src/plugins/ops-monitor.js';

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    },
  };
}

async function activate(storage: ReturnType<typeof makeStorage>) {
  await opsShellModule.activate({
    id: 'ops-shell',
    log: () => {},
    adapter: {},
    config: {},
    storage,
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    emit: () => {},
    on: () => ({ dispose: () => {} }),
  } as never);
}

const conn = {
  id: 'c1', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
  username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
};

beforeEach(async () => {
  const storage = makeStorage();
  await storage.set('connections', [conn]);
  await activate(storage);
  const store = createOpsMonitorStore(db);
  store.ensureSchema();
  db.exec('DELETE FROM ops_monitor_config; DELETE FROM ops_metric_sample; DELETE FROM ops_alert_event;');
  store.saveConfig(normalizeMonitorConfig('c1', {
    enabled: true, intervalSec: 30, loadPct: 80, memPct: 80, diskPct: 80,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runOpsMonitorCycle', () => {
  it('采样成功写入指标，并按阈值生成三组告警', async () => {
    const result = await runOpsMonitorCycle({ connectionId: 'c1', force: true });
    expect(result).toMatchObject({ checked: 1, sampled: 1, failed: 0 });
    const store = createOpsMonitorStore(db);
    expect(store.listSamples('c1', 1)[0]).toMatchObject({ loadPct: 100, memUsedPct: 95, diskUsedPct: 96 });
    expect(store.listAlerts('open').map((alert) => alert.metric).sort()).toEqual(['disk', 'load', 'memory']);
  });

  it('重复采样更新同一批事件，不重复刷屏', async () => {
    await runOpsMonitorCycle({ connectionId: 'c1', force: true });
    await runOpsMonitorCycle({ connectionId: 'c1', force: true });
    const store = createOpsMonitorStore(db);
    expect(store.listSamples('c1', 10)).toHaveLength(2);
    expect(store.listAlerts('open')).toHaveLength(3);
  });

  it('通知成功后记录 notifiedSeverity，下一轮不重复发送', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = createOpsMonitorStore(db);
    store.saveConfig(normalizeMonitorConfig('c1', {
      enabled: true,
      loadPct: 80,
      memPct: 80,
      diskPct: 80,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/fake',
      notifyMinSeverity: 'warning',
    }));

    await runOpsMonitorCycle({ connectionId: 'c1', force: true });
    await runOpsMonitorCycle({ connectionId: 'c1', force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.listAlerts('open').every((alert) => alert.notifiedSeverity === 'critical')).toBe(true);
  });
});
