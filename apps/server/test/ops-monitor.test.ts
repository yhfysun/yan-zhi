/**
 * 运维常驻巡检 P1 守门：
 *   ① 单次 SSH 输出解析成结构化指标；
 *   ② 阈值配置安全归一化；
 *   ③ 同一异常按 fingerprint 去重，确认后保持确认态，恢复后自动 resolved。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  buildMonitorSignals,
  normalizeMonitorConfig,
  parseMonitorOutput,
  reconcileAlerts,
  type OpsAlertEvent,
  type OpsMonitorConfig,
} from '../src/plugins/ops-monitor.js';
import { createOpsMonitorStore } from '../src/plugins/ops-monitor-store.js';

const OUTPUT = `__YZ_LOAD__ 2.00 1.50 1.00 2/100 12345
__YZ_CPU__ 4
__YZ_MEM__ Mem:         1000         410         590         100         100         590
__YZ_DISK__ /dev/sda1 100G 86G 14G 86% /`;

describe('monitor · 指标解析与阈值', () => {
  it('一次采集输出解析为 load / CPU / memory / disk', () => {
    expect(parseMonitorOutput(OUTPUT)).toMatchObject({
      load1: 2,
      load5: 1.5,
      load15: 1,
      cpuCount: 4,
      loadPct: 50,
      memUsedPct: 41,
      diskUsedPct: 86,
    });
  });

  it('配置归一化：关闭是默认值，间隔和阈值被收进安全区间', () => {
    const config = normalizeMonitorConfig('conn-1', {
      enabled: true,
      intervalSec: 1,
      loadPct: 0,
      memPct: 101,
      diskPct: 80.4,
    });
    expect(config).toMatchObject({
      connectionId: 'conn-1',
      enabled: true,
      intervalSec: 30,
      loadPct: 1,
      memPct: 100,
      diskPct: 80.4,
    });
    expect(normalizeMonitorConfig('conn-2').enabled).toBe(false);
  });

  it('超过阈值产生告警，95% 以上升级为 critical', () => {
    const config = normalizeMonitorConfig('conn-1', { enabled: true, memPct: 40, diskPct: 85, loadPct: 80 });
    const snapshot = parseMonitorOutput(OUTPUT);
    const signals = buildMonitorSignals(snapshot!, config);
    expect(signals.map((s) => [s.metric, s.severity])).toEqual([
      ['memory', 'warning'],
      ['disk', 'warning'],
    ]);
  });
});

describe('monitor · 告警去重与恢复', () => {
  const config: OpsMonitorConfig = normalizeMonitorConfig('conn-1', {
    enabled: true, memPct: 70, diskPct: 85, loadPct: 80,
  });
  const signal = {
    fingerprint: 'conn-1:memory',
    connectionId: 'conn-1',
    metric: 'memory' as const,
    severity: 'warning' as const,
    value: 75,
    threshold: 70,
    title: '内存使用率偏高',
    detail: '当前 75%，阈值 70%',
  };
  const existing: OpsAlertEvent = {
    id: 'alert-1', ...signal, connectionName: 'prod-web', status: 'acknowledged',
    firstSeen: 1000, lastSeen: 1000, ackAt: 1100,
  };

  it('同一 fingerprint 更新原事件，不刷出新事件；已确认状态保持', () => {
    const result = reconcileAlerts([existing], [signal], 'conn-1', 'prod-web', 2000);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({ id: 'alert-1', status: 'acknowledged', ackAt: 1100, lastSeen: 2000 });
    expect(result.resolvedIds).toEqual([]);
  });

  it('指标恢复后自动关闭对应活动事件', () => {
    const result = reconcileAlerts([existing], [], 'conn-1', 'prod-web', 3000);
    expect(result.alerts).toEqual([]);
    expect(result.resolvedIds).toEqual(['alert-1']);
  });

  it('已确认事件升级为 critical 时重新回到活动态', () => {
    const critical = { ...signal, severity: 'critical' as const, value: 96 };
    const result = reconcileAlerts([existing], [critical], 'conn-1', 'prod-web', 2500);
    expect(result.alerts[0]).toMatchObject({ id: 'alert-1', status: 'active', severity: 'critical' });
    expect(result.alerts[0].ackAt).toBeUndefined();
  });

  it('采集失败时保留已有指标事件，只叠加 collector 事件', () => {
    const collector = {
      fingerprint: 'conn-1:collector',
      connectionId: 'conn-1',
      metric: 'collector' as const,
      severity: 'critical' as const,
      value: 0,
      threshold: 0,
      title: '指标采集失败',
      detail: 'timeout',
    };
    const result = reconcileAlerts([existing], [collector], 'conn-1', 'prod-web', 4000, { resolveMissing: false });
    expect(result.alerts.map((a) => a.metric)).toEqual(['collector', 'memory']);
    expect(result.resolvedIds).toEqual([]);
  });

  it('SQLite 仓库落样本、告警去重与确认可回读', () => {
    const db = new Database(':memory:');
    const store = createOpsMonitorStore(db);
    store.ensureSchema();
    store.saveConfig(config);
    store.recordSample({
      connectionId: 'conn-1', sampledAt: 2000, load1: 2, load5: 1, load15: 0.5,
      cpuCount: 4, loadPct: 50, memUsedPct: 75, diskUsedPct: 86,
    });
    store.reconcileAlerts('conn-1', 'prod-web', [signal], 2000);
    store.reconcileAlerts('conn-1', 'prod-web', [{ ...signal, value: 78 }], 2100);

    expect(store.getConfig('conn-1')).toMatchObject({ enabled: true, memPct: 70 });
    expect(store.listSamples('conn-1', 10)[0]).toMatchObject({ memUsedPct: 75, diskUsedPct: 86 });
    const alerts = store.listAlerts('open');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ fingerprint: 'conn-1:memory', value: 78, status: 'active' });

    store.acknowledgeAlert(alerts[0].id, 2200);
    expect(store.listAlerts('open')[0].status).toBe('acknowledged');
    db.close();
  });
});
