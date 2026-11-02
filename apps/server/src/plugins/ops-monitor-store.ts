import {
  normalizeMonitorConfig,
  reconcileAlerts,
  type OpsAlertEvent,
  type OpsAlertSeverity,
  type OpsAlertSignal,
  type OpsAlertStatus,
  type OpsMetricSample,
  type OpsMonitorConfig,
} from './ops-monitor.js';

interface Statement {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

export interface MonitorDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): Statement;
}

export interface SecretCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

const sampleLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function parseJsonArray(raw: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createOpsMonitorStore(
  database: MonitorDatabase,
  codec: SecretCodec = { encrypt: (value) => value, decrypt: (value) => value },
) {
  const decryptSecret = (value: unknown): string | undefined => {
    if (!value) return undefined;
    try { return codec.decrypt(String(value)); } catch { return undefined; }
  };

  const ensureSchema = () => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ops_monitor_config (
        connection_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        interval_sec INTEGER NOT NULL DEFAULT 60,
        load_pct REAL NOT NULL DEFAULT 80,
        mem_pct REAL NOT NULL DEFAULT 90,
        disk_pct REAL NOT NULL DEFAULT 85,
        ports_json TEXT NOT NULL DEFAULT '[]',
        http_checks_json TEXT NOT NULL DEFAULT '[]',
        feishu_webhook_enc TEXT,
        wecom_webhook_enc TEXT,
        notify_min_severity TEXT NOT NULL DEFAULT 'warning',
        notify_on_resolve INTEGER NOT NULL DEFAULT 0,
        silence_until INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ops_metric_sample (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id TEXT NOT NULL,
        sampled_at INTEGER NOT NULL,
        load1 REAL NOT NULL,
        load5 REAL NOT NULL,
        load15 REAL NOT NULL,
        cpu_count INTEGER NOT NULL,
        load_pct REAL NOT NULL,
        mem_used_pct REAL NOT NULL,
        disk_used_pct REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ops_metric_conn_time
        ON ops_metric_sample(connection_id, sampled_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ops_metric_time
        ON ops_metric_sample(sampled_at);
      CREATE TABLE IF NOT EXISTS ops_alert_event (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        metric TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        value REAL NOT NULL,
        threshold REAL NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        ack_at INTEGER,
        resolved_at INTEGER,
        notified_at INTEGER,
        notified_severity TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ops_alert_conn_status
        ON ops_alert_event(connection_id, status, last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_ops_alert_fingerprint
        ON ops_alert_event(fingerprint, status);
      CREATE INDEX IF NOT EXISTS idx_ops_alert_resolved
        ON ops_alert_event(status, resolved_at);
    `);
    for (const sql of [
      "ALTER TABLE ops_monitor_config ADD COLUMN ports_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE ops_monitor_config ADD COLUMN http_checks_json TEXT NOT NULL DEFAULT '[]'",
      'ALTER TABLE ops_monitor_config ADD COLUMN feishu_webhook_enc TEXT',
      'ALTER TABLE ops_monitor_config ADD COLUMN wecom_webhook_enc TEXT',
      "ALTER TABLE ops_monitor_config ADD COLUMN notify_min_severity TEXT NOT NULL DEFAULT 'warning'",
      'ALTER TABLE ops_monitor_config ADD COLUMN notify_on_resolve INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE ops_monitor_config ADD COLUMN silence_until INTEGER',
      'ALTER TABLE ops_alert_event ADD COLUMN notified_at INTEGER',
      'ALTER TABLE ops_alert_event ADD COLUMN notified_severity TEXT',
    ]) {
      try { database.exec(sql); } catch { /* 列已存在 */ }
    }
  };

  const saveConfig = (config: OpsMonitorConfig) => {
    database.prepare(`
      INSERT INTO ops_monitor_config
        (connection_id, enabled, interval_sec, load_pct, mem_pct, disk_pct, ports_json, http_checks_json,
         feishu_webhook_enc, wecom_webhook_enc, notify_min_severity, notify_on_resolve, silence_until, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connection_id) DO UPDATE SET
        enabled=excluded.enabled,
        interval_sec=excluded.interval_sec,
        load_pct=excluded.load_pct,
        mem_pct=excluded.mem_pct,
        disk_pct=excluded.disk_pct,
        ports_json=excluded.ports_json,
        http_checks_json=excluded.http_checks_json,
        feishu_webhook_enc=excluded.feishu_webhook_enc,
        wecom_webhook_enc=excluded.wecom_webhook_enc,
        notify_min_severity=excluded.notify_min_severity,
        notify_on_resolve=excluded.notify_on_resolve,
        silence_until=excluded.silence_until,
        updated_at=excluded.updated_at
    `).run(
      config.connectionId,
      config.enabled ? 1 : 0,
      config.intervalSec,
      config.loadPct,
      config.memPct,
      config.diskPct,
      JSON.stringify(config.ports || []),
      JSON.stringify(config.httpChecks || []),
      config.feishuWebhook ? codec.encrypt(config.feishuWebhook) : null,
      config.wecomWebhook ? codec.encrypt(config.wecomWebhook) : null,
      config.notifyMinSeverity,
      config.notifyOnResolve ? 1 : 0,
      config.silenceUntil || null,
      config.updatedAt,
    );
    if (!config.enabled) {
      database.prepare(`
        UPDATE ops_alert_event SET status='resolved', resolved_at=?
        WHERE connection_id=? AND status IN ('active','acknowledged')
      `).run(config.updatedAt, config.connectionId);
    }
  };

  const getConfig = (connectionId: string): OpsMonitorConfig | null => {
    const row = database.prepare('SELECT * FROM ops_monitor_config WHERE connection_id=?').get(connectionId) as any;
    return row ? normalizeMonitorConfig(connectionId, {
      enabled: row.enabled === 1,
      intervalSec: row.interval_sec,
      loadPct: row.load_pct,
      memPct: row.mem_pct,
      diskPct: row.disk_pct,
      ports: parseJsonArray(row.ports_json) as number[],
      httpChecks: parseJsonArray(row.http_checks_json) as OpsMonitorConfig['httpChecks'],
      feishuWebhook: decryptSecret(row.feishu_webhook_enc),
      wecomWebhook: decryptSecret(row.wecom_webhook_enc),
      notifyMinSeverity: row.notify_min_severity === 'critical' ? 'critical' : 'warning',
      notifyOnResolve: row.notify_on_resolve === 1,
      silenceUntil: row.silence_until || undefined,
      updatedAt: row.updated_at,
    }, row.updated_at) : null;
  };

  const listConfigs = (): OpsMonitorConfig[] => {
    const rows = database.prepare('SELECT * FROM ops_monitor_config ORDER BY updated_at DESC').all() as any[];
    return rows.map((row) => normalizeMonitorConfig(row.connection_id, {
      enabled: row.enabled === 1,
      intervalSec: row.interval_sec,
      loadPct: row.load_pct,
      memPct: row.mem_pct,
      diskPct: row.disk_pct,
      ports: parseJsonArray(row.ports_json) as number[],
      httpChecks: parseJsonArray(row.http_checks_json) as OpsMonitorConfig['httpChecks'],
      feishuWebhook: decryptSecret(row.feishu_webhook_enc),
      wecomWebhook: decryptSecret(row.wecom_webhook_enc),
      notifyMinSeverity: row.notify_min_severity === 'critical' ? 'critical' : 'warning',
      notifyOnResolve: row.notify_on_resolve === 1,
      silenceUntil: row.silence_until || undefined,
      updatedAt: row.updated_at,
    }, row.updated_at));
  };

  const recordSample = (sample: OpsMetricSample) => {
    database.prepare(`
      INSERT INTO ops_metric_sample
        (connection_id, sampled_at, load1, load5, load15, cpu_count, load_pct, mem_used_pct, disk_used_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sample.connectionId, sample.sampledAt, sample.load1, sample.load5, sample.load15,
      sample.cpuCount, sample.loadPct, sample.memUsedPct, sample.diskUsedPct,
    );
    database.prepare('DELETE FROM ops_metric_sample WHERE sampled_at < ?')
      .run(sample.sampledAt - sampleLifetimeMs);
  };

  const rowToSample = (row: any): OpsMetricSample => ({
    connectionId: row.connection_id,
    sampledAt: row.sampled_at,
    load1: row.load1,
    load5: row.load5,
    load15: row.load15,
    cpuCount: row.cpu_count,
    loadPct: row.load_pct,
    memUsedPct: row.mem_used_pct,
    diskUsedPct: row.disk_used_pct,
  });

  const listSamples = (connectionId: string, limit = 60): OpsMetricSample[] => {
    const n = Math.max(1, Math.min(500, Math.floor(limit) || 60));
    return (database.prepare(`
      SELECT * FROM ops_metric_sample WHERE connection_id=? ORDER BY sampled_at DESC LIMIT ?
    `).all(connectionId, n) as any[]).map(rowToSample);
  };

  const rowToAlert = (row: any): OpsAlertEvent => ({
    id: row.id,
    fingerprint: row.fingerprint,
    connectionId: row.connection_id,
    connectionName: row.connection_name,
    metric: row.metric,
    severity: row.severity,
    status: row.status,
    value: row.value,
    threshold: row.threshold,
    title: row.title,
    detail: row.detail,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    ackAt: row.ack_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    notifiedAt: row.notified_at ?? undefined,
    notifiedSeverity: row.notified_severity ?? undefined,
  });

  const reconcile = (
    connectionId: string,
    connectionName: string,
    signals: OpsAlertSignal[],
    now: number,
    options: { resolveMissing?: boolean } = {},
  ) => {
    const existing = (database.prepare(`
      SELECT * FROM ops_alert_event
      WHERE connection_id=? AND status IN ('active','acknowledged')
    `).all(connectionId) as any[]).map(rowToAlert);
    const result = reconcileAlerts(existing, signals, connectionId, connectionName, now, options);
    const resolve = database.prepare(`
      UPDATE ops_alert_event SET status='resolved', resolved_at=? WHERE id=?
    `);
    for (const id of result.resolvedIds) resolve.run(now, id);
    const upsert = database.prepare(`
      INSERT INTO ops_alert_event
        (id, fingerprint, connection_id, connection_name, metric, severity, status, value, threshold,
         title, detail, first_seen, last_seen, ack_at, resolved_at, notified_at, notified_severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        value=excluded.value,
        threshold=excluded.threshold,
        severity=excluded.severity,
        title=excluded.title,
        detail=excluded.detail,
        last_seen=excluded.last_seen,
        status=excluded.status,
        ack_at=excluded.ack_at,
        resolved_at=NULL,
        notified_at=excluded.notified_at,
        notified_severity=excluded.notified_severity
    `);
    for (const alert of result.alerts) {
      upsert.run(
        alert.id, alert.fingerprint, alert.connectionId, alert.connectionName, alert.metric,
        alert.severity, alert.status, alert.value, alert.threshold, alert.title, alert.detail,
        alert.firstSeen, alert.lastSeen, alert.ackAt ?? null, null,
        alert.notifiedAt ?? null, alert.notifiedSeverity ?? null,
      );
    }
    database.prepare(`
      DELETE FROM ops_alert_event
      WHERE status='resolved' AND resolved_at < ?
    `).run(now - 90 * 24 * 60 * 60 * 1000);
    return result;
  };

  const listAlerts = (filter: 'open' | 'all' | OpsAlertStatus = 'open'): OpsAlertEvent[] => {
    const rows = filter === 'all'
      ? database.prepare('SELECT * FROM ops_alert_event ORDER BY last_seen DESC LIMIT 500').all()
      : filter === 'open'
        ? database.prepare(`SELECT * FROM ops_alert_event WHERE status IN ('active','acknowledged') ORDER BY last_seen DESC LIMIT 500`).all()
        : database.prepare('SELECT * FROM ops_alert_event WHERE status=? ORDER BY last_seen DESC LIMIT 500').all(filter);
    return (rows as any[]).map(rowToAlert);
  };

  const acknowledgeAlert = (id: string, now = Date.now()): boolean => {
    const result = database.prepare(`
      UPDATE ops_alert_event SET status='acknowledged', ack_at=?
      WHERE id=? AND status='active'
    `).run(now, id) as { changes?: number };
    return (result.changes || 0) > 0;
  };

  const markAlertsNotified = (ids: string[], severity: OpsAlertSeverity, now = Date.now()): void => {
    const update = database.prepare(`
      UPDATE ops_alert_event SET notified_at=?, notified_severity=? WHERE id=?
    `);
    for (const id of ids) update.run(now, severity, id);
  };

  return {
    ensureSchema,
    saveConfig,
    getConfig,
    listConfigs,
    recordSample,
    listSamples,
    reconcileAlerts: reconcile,
    listAlerts,
    acknowledgeAlert,
    markAlertsNotified,
  };
}
