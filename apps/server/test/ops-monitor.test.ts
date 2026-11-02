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
  buildHttpSignals,
  buildPortSignals,
  buildMonitorNotificationText,
  normalizeMonitorConfig,
  parseListeningPorts,
  parseMonitorOutput,
  publicMonitorConfig,
  reconcileAlerts,
  webhookUrlError,
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

  it('解析监听端口，并只对配置中未监听端口告警', () => {
    const ports = parseListeningPorts(`LISTEN 0 128 0.0.0.0:22 0.0.0.0:*
LISTEN 0 128 *:443 *:*
LISTEN 0 128 127.0.0.1:8080 0.0.0.0:*`);
    expect(ports).toEqual([22, 443, 8080]);
    const config = normalizeMonitorConfig('conn-1', { enabled: true, ports: [22, 3306, 8080] });
    expect(buildPortSignals(ports, config).map((signal) => signal.fingerprint)).toEqual(['conn-1:port:3306']);
  });

  it('HTTP 状态不等于配置值时产生独立事件', () => {
    const config = normalizeMonitorConfig('conn-1', {
      enabled: true,
      httpChecks: [
        { name: 'api', url: 'http://127.0.0.1:8080/health', expectedStatus: 200 },
        { name: 'web', url: 'https://example.com/', expectedStatus: 302 },
      ],
    });
    const signals = buildHttpSignals([
      { name: 'api', url: 'http://127.0.0.1:8080/health', status: 503 },
      { name: 'web', url: 'https://example.com/', status: 302 },
    ], config);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ metric: 'http', severity: 'critical' });
    expect(signals[0].fingerprint).toContain('/health');
  });

  it('Webhook 只允许官方 HTTPS 地址，公开配置不泄露地址', () => {
    expect(webhookUrlError('https://open.feishu.cn/open-apis/bot/v2/hook/token', 'feishu')).toBeNull();
    expect(webhookUrlError('http://open.feishu.cn/open-apis/bot/v2/hook/token', 'feishu')).toContain('HTTPS');
    expect(webhookUrlError('https://evil.example/hook', 'feishu')).toContain('域名');
    expect(webhookUrlError('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x', 'wecom')).toBeNull();

    const config = normalizeMonitorConfig('conn-1', {
      enabled: true,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      wecomWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret',
    });
    const view = publicMonitorConfig(config);
    expect(view).toMatchObject({ feishuConfigured: true, wecomConfigured: true });
    expect(JSON.stringify(view)).not.toContain('token');
    expect(JSON.stringify(view)).not.toContain('key=secret');
  });

  it('通知文本包含连接、严重级别和当前值', () => {
    const config = normalizeMonitorConfig('conn-1', { enabled: true });
    const text = buildMonitorNotificationText('prod-web', [{
      id: 'a1', fingerprint: 'conn-1:disk', connectionId: 'conn-1', connectionName: 'prod-web',
      metric: 'disk', severity: 'critical', status: 'active', value: 96, threshold: 85,
      title: '磁盘使用率偏高', detail: '当前 96%，阈值 85%', firstSeen: 1000, lastSeen: 2000,
    }], config);
    expect(text).toContain('prod-web');
    expect(text).toContain('严重');
    expect(text).toContain('当前 96%');
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
    expect(result.notifyCandidates.map((item) => item.id)).toEqual(['alert-1']);
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

  it('Webhook 在 SQLite 中加密保存，读取时还原', () => {
    const db = new Database(':memory:');
    const store = createOpsMonitorStore(db, {
      encrypt: (value) => `enc:${Buffer.from(value).toString('base64')}`,
      decrypt: (value) => Buffer.from(value.replace(/^enc:/, ''), 'base64').toString(),
    });
    store.ensureSchema();
    store.saveConfig(normalizeMonitorConfig('conn-1', {
      enabled: true,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/TEST_SECRET',
      notifyMinSeverity: 'critical',
      notifyOnResolve: true,
    }));
    const raw = db.prepare('SELECT feishu_webhook_enc FROM ops_monitor_config WHERE connection_id=?').get('conn-1') as any;
    expect(raw.feishu_webhook_enc).toContain('enc:');
    expect(raw.feishu_webhook_enc).not.toContain('TEST_SECRET');
    expect(store.getConfig('conn-1')).toMatchObject({
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/TEST_SECRET',
      notifyMinSeverity: 'critical',
      notifyOnResolve: true,
    });
    db.close();
  });
});
