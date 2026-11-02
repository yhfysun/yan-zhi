export type OpsAlertMetric = 'load' | 'memory' | 'disk' | 'collector';
export type OpsAlertSeverity = 'warning' | 'critical';
export type OpsAlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface OpsMonitorConfig {
  connectionId: string;
  enabled: boolean;
  intervalSec: number;
  loadPct: number;
  memPct: number;
  diskPct: number;
  updatedAt: number;
}

export interface OpsMetricSample {
  connectionId: string;
  sampledAt: number;
  load1: number;
  load5: number;
  load15: number;
  cpuCount: number;
  loadPct: number;
  memUsedPct: number;
  diskUsedPct: number;
}

export interface OpsAlertSignal {
  fingerprint: string;
  connectionId: string;
  metric: OpsAlertMetric;
  severity: OpsAlertSeverity;
  value: number;
  threshold: number;
  title: string;
  detail: string;
}

export interface OpsAlertEvent extends OpsAlertSignal {
  id: string;
  connectionName: string;
  status: OpsAlertStatus;
  firstSeen: number;
  lastSeen: number;
  ackAt?: number;
  resolvedAt?: number;
}

export const DEFAULT_MONITOR_CONFIG = {
  enabled: false,
  intervalSec: 60,
  loadPct: 80,
  memPct: 90,
  diskPct: 85,
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
};

export function normalizeMonitorConfig(
  connectionId: string,
  raw: Partial<OpsMonitorConfig> = {},
  now = Date.now(),
): OpsMonitorConfig {
  return {
    connectionId,
    enabled: raw.enabled === true,
    intervalSec: Math.round(clamp(raw.intervalSec, 30, 3600, DEFAULT_MONITOR_CONFIG.intervalSec)),
    loadPct: clamp(raw.loadPct, 1, 500, DEFAULT_MONITOR_CONFIG.loadPct),
    memPct: clamp(raw.memPct, 1, 100, DEFAULT_MONITOR_CONFIG.memPct),
    diskPct: clamp(raw.diskPct, 1, 100, DEFAULT_MONITOR_CONFIG.diskPct),
    updatedAt: Number(raw.updatedAt) || now,
  };
}

function section(output: string, name: string): string {
  const match = output.match(new RegExp(`__YZ_${name}__\\s*([\\s\\S]*?)(?=\\n__YZ_[A-Z]+__|$)`));
  return match?.[1]?.trim() || '';
}

export function parseMonitorOutput(output: string): OpsMetricSample | null {
  const load = section(output, 'LOAD').split(/\s+/).map(Number);
  const cpuCount = Number(section(output, 'CPU').split(/\s+/)[0]);
  const mem = section(output, 'MEM').match(/Mem:\s+(\d+)\s+(\d+)/i);
  const diskLine = section(output, 'DISK').split(/\r?\n/).filter(Boolean).at(-1) || '';
  const diskPct = Number(diskLine.match(/(\d+(?:\.\d+)?)%/)?.[1]);
  if (load.length < 3 || !load.slice(0, 3).every(Number.isFinite)) return null;
  if (!Number.isFinite(cpuCount) || cpuCount <= 0 || !mem) return null;
  if (!Number.isFinite(diskPct)) return null;
  const memTotal = Number(mem[1]);
  const memUsed = Number(mem[2]);
  if (!memTotal || !Number.isFinite(memUsed)) return null;
  return {
    connectionId: '',
    sampledAt: Date.now(),
    load1: load[0],
    load5: load[1],
    load15: load[2],
    cpuCount,
    loadPct: Math.round((load[0] / cpuCount) * 1000) / 10,
    memUsedPct: Math.round((memUsed / memTotal) * 1000) / 10,
    diskUsedPct: Math.round(diskPct * 10) / 10,
  };
}

function severityOf(pct: number): OpsAlertSeverity {
  return pct >= 95 ? 'critical' : 'warning';
}

export function buildMonitorSignals(snapshot: OpsMetricSample, config: OpsMonitorConfig): OpsAlertSignal[] {
  if (!config.enabled) return [];
  const signals: OpsAlertSignal[] = [];
  const add = (
    metric: OpsAlertMetric,
    value: number,
    threshold: number,
    title: string,
  ) => {
    if (value < threshold) return;
    signals.push({
      fingerprint: `${config.connectionId}:${metric}`,
      connectionId: config.connectionId,
      metric,
      severity: severityOf(value),
      value,
      threshold,
      title,
      detail: `当前 ${value}%，阈值 ${threshold}%`,
    });
  };
  add('load', snapshot.loadPct, config.loadPct, 'CPU 负载偏高');
  add('memory', snapshot.memUsedPct, config.memPct, '内存使用率偏高');
  add('disk', snapshot.diskUsedPct, config.diskPct, '磁盘使用率偏高');
  return signals;
}

export function collectorFailureSignal(connectionId: string, error: string): OpsAlertSignal {
  return {
    fingerprint: `${connectionId}:collector`,
    connectionId,
    metric: 'collector',
    severity: 'critical',
    value: 0,
    threshold: 0,
    title: '指标采集失败',
    detail: error.slice(0, 300),
  };
}

export function reconcileAlerts(
  existing: OpsAlertEvent[],
  signals: OpsAlertSignal[],
  connectionId: string,
  connectionName: string,
  now: number,
  options: { resolveMissing?: boolean } = {},
): { alerts: OpsAlertEvent[]; resolvedIds: string[] } {
  const byFingerprint = new Map(existing.map((alert) => [alert.fingerprint, alert]));
  const next: OpsAlertEvent[] = [];
  const seen = new Set<string>();
  for (const signal of signals.filter((item) => item.connectionId === connectionId)) {
    seen.add(signal.fingerprint);
    const old = byFingerprint.get(signal.fingerprint);
    if (old) {
      const escalated = old.status === 'acknowledged'
        && old.severity === 'warning'
        && signal.severity === 'critical';
      next.push({
        ...old,
        ...signal,
        connectionName,
        status: escalated ? 'active' : old.status,
        ackAt: escalated ? undefined : old.ackAt,
        lastSeen: now,
        resolvedAt: undefined,
      });
    } else {
      next.push({
          ...signal,
          id: `alert-${connectionId}-${signal.metric}-${now}`,
          connectionName,
          status: 'active',
          firstSeen: now,
          lastSeen: now,
      });
    }
  }
  if (options.resolveMissing === false) {
    for (const alert of existing) {
      if (!seen.has(alert.fingerprint)) next.push(alert);
    }
  }
  return {
    alerts: next,
    resolvedIds: options.resolveMissing === false
      ? []
      : existing.filter((alert) => !seen.has(alert.fingerprint)).map((alert) => alert.id),
  };
}
