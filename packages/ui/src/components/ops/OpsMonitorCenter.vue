<template>
  <div class="omc">
    <aside class="omc-config">
      <div class="omc-head">
        <span>巡检配置</span>
        <span class="omc-head-actions">
          <span v-if="error" class="omc-error">{{ error }}</span>
          <el-button size="small" :icon="Refresh" text title="刷新" @click="load" />
        </span>
      </div>

      <el-select v-model="selectedId" size="small" placeholder="选择连接" class="omc-select">
        <el-option
          v-for="conn in monitorConnections"
          :key="conn.id"
          :value="conn.id"
          :label="`${conn.name}${conn.tag ? ` · ${conn.tag}` : ''}`"
        />
      </el-select>

      <div class="omc-switch">
        <span>常驻巡检</span>
        <el-switch v-model="config.enabled" size="small" />
      </div>

      <div class="omc-fields">
        <label>
          <span>间隔（秒）</span>
          <el-input-number v-model="config.intervalSec" :min="30" :max="3600" :step="30" size="small" controls-position="right" />
        </label>
        <label>
          <span>负载阈值（%）</span>
          <el-input-number v-model="config.loadPct" :min="1" :max="500" :step="5" size="small" controls-position="right" />
        </label>
        <label>
          <span>内存阈值（%）</span>
          <el-input-number v-model="config.memPct" :min="1" :max="100" :step="5" size="small" controls-position="right" />
        </label>
        <label>
          <span>磁盘阈值（%）</span>
          <el-input-number v-model="config.diskPct" :min="1" :max="100" :step="5" size="small" controls-position="right" />
        </label>
        <label class="omc-wide">
          <span>监听端口</span>
          <el-input v-model="portsText" size="small" placeholder="22, 443, 8080" />
        </label>
        <label class="omc-wide">
          <span>HTTP 检查</span>
          <el-input v-model="httpChecksText" type="textarea" :rows="3" size="small" placeholder="api|http://127.0.0.1:8080/health|200" />
        </label>
      </div>

      <div class="omc-actions">
        <el-button size="small" type="primary" :loading="saving" :disabled="!selectedId" @click="save">保存</el-button>
        <el-button size="small" :loading="running" :disabled="!selectedId" @click="runNow">立即巡检</el-button>
      </div>

      <div class="omc-latest">
        <div class="omc-metric" :class="{ warn: latest && latest.loadPct >= config.loadPct }">
          <span>负载</span>
          <strong>{{ latest ? `${latest.loadPct}%` : '—' }}</strong>
          <small>{{ latest ? `${latest.load1} / ${latest.cpuCount} 核` : '暂无采样' }}</small>
        </div>
        <div class="omc-metric" :class="{ warn: latest && latest.memUsedPct >= config.memPct }">
          <span>内存</span>
          <strong>{{ latest ? `${latest.memUsedPct}%` : '—' }}</strong>
          <small>{{ latest ? formatTime(latest.sampledAt) : '暂无采样' }}</small>
        </div>
        <div class="omc-metric" :class="{ warn: latest && latest.diskUsedPct >= config.diskPct }">
          <span>根盘</span>
          <strong>{{ latest ? `${latest.diskUsedPct}%` : '—' }}</strong>
          <small>{{ latest ? formatTime(latest.sampledAt) : '暂无采样' }}</small>
        </div>
      </div>
    </aside>

    <section class="omc-alerts">
      <div class="omc-head">
        <span>事件中心</span>
        <span class="omc-head-actions">
          <span class="omc-counts">{{ activeCount }} 活动 · {{ acknowledgedCount }} 已确认</span>
          <el-select v-model="alertFilter" size="small" class="omc-filter">
            <el-option value="open" label="活动" />
            <el-option value="all" label="全部" />
          </el-select>
        </span>
      </div>
      <div v-if="!alerts.length" class="omc-empty">暂无活动事件</div>
      <article v-for="alert in alerts" :key="alert.id" class="omc-alert" :data-severity="alert.severity">
        <span class="omc-dot" />
        <div class="omc-alert-body">
          <div class="omc-alert-line">
            <strong>{{ alert.title }}</strong>
            <span class="omc-alert-status">{{ alert.status === 'acknowledged' ? '已确认' : alert.status === 'resolved' ? '已恢复' : '活动' }}</span>
          </div>
          <span class="omc-alert-meta">{{ alert.connectionName }} · {{ alert.detail }}</span>
          <span class="omc-alert-time">{{ formatTime(alert.lastSeen) }}</span>
        </div>
        <el-button
          v-if="alert.status === 'active'"
          size="small"
          text
          :loading="ackingId === alert.id"
          @click="acknowledge(alert)"
        >确认</el-button>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { startVisiblePolling } from '../../utils/visible-polling';

interface MonitorConnection {
  id: string;
  name: string;
  type?: string;
  tag?: string;
}

interface MonitorConfig {
  connectionId: string;
  enabled: boolean;
  intervalSec: number;
  loadPct: number;
  memPct: number;
  diskPct: number;
  ports: number[];
  httpChecks: Array<{ name: string; url: string; expectedStatus: number }>;
  updatedAt: number;
}

interface MetricSample {
  connectionId: string;
  sampledAt: number;
  load1: number;
  cpuCount: number;
  loadPct: number;
  memUsedPct: number;
  diskUsedPct: number;
}

interface AlertEvent {
  id: string;
  connectionName: string;
  metric: 'load' | 'memory' | 'disk' | 'collector' | 'port' | 'http';
  severity: 'warning' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  title: string;
  detail: string;
  lastSeen: number;
}

interface OverviewConnection extends MonitorConnection {
  config: MonitorConfig | null;
  latestSample: MetricSample | null;
}

interface MonitorOverview {
  connections: OverviewConnection[];
  alerts: AlertEvent[];
  activeCount: number;
  acknowledgedCount: number;
}

const props = defineProps<{
  connections: MonitorConnection[];
  activeConnectionId?: string;
}>();

const overview = ref<MonitorOverview>({ connections: [], alerts: [], activeCount: 0, acknowledgedCount: 0 });
const selectedId = ref('');
const saving = ref(false);
const running = ref(false);
const ackingId = ref('');
const error = ref('');
const alertFilter = ref<'open' | 'all'>('open');
const portsText = ref('');
const httpChecksText = ref('');
let poll: (() => void) | null = null;

const monitorConnections = computed(() => props.connections.filter((conn) => conn.type !== 'database'));
const selectedOverview = computed(() => overview.value.connections.find((conn) => conn.id === selectedId.value));
const latest = computed(() => selectedOverview.value?.latestSample || null);
const alerts = computed(() => overview.value.alerts);
const activeCount = computed(() => overview.value.activeCount);
const acknowledgedCount = computed(() => overview.value.acknowledgedCount);
const config = ref<MonitorConfig>({
  connectionId: '', enabled: false, intervalSec: 60, loadPct: 80, memPct: 90, diskPct: 85,
  ports: [], httpChecks: [], updatedAt: 0,
});

function applyConfig(): void {
  const item = selectedOverview.value;
  config.value = item?.config
    ? { ...item.config }
    : {
        connectionId: selectedId.value,
        enabled: false,
        intervalSec: 60,
        loadPct: 80,
        memPct: 90,
        diskPct: 85,
        ports: [],
        httpChecks: [],
        updatedAt: Date.now(),
      };
  portsText.value = (config.value.ports || []).join(', ');
  httpChecksText.value = (config.value.httpChecks || [])
    .map((check) => `${check.name}|${check.url}|${check.expectedStatus}`)
    .join('\n');
}

async function load(): Promise<void> {
  const result = await api.get<MonitorOverview>('/plugin/ops-shell/monitor/overview');
  if ('error' in result) {
    error.value = result.error;
    return;
  }
  error.value = '';
  overview.value = result.data;
  if (alertFilter.value === 'all') {
    const allAlerts = await api.get<AlertEvent[]>('/plugin/ops-shell/monitor/alerts?status=all');
    if ('data' in allAlerts) overview.value.alerts = allAlerts.data;
  }
  const available = monitorConnections.value.some((conn) => conn.id === selectedId.value);
  if (!available) {
    selectedId.value = props.activeConnectionId
      || result.data.connections.find((conn) => conn.type !== 'database')?.id
      || '';
    applyConfig();
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

async function save(): Promise<void> {
  if (!selectedId.value) return;
  const ports = [...new Set(portsText.value.split(/[\s,，]+/).map(Number)
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535))];
  const httpChecks = httpChecksText.value.split(/\r?\n/).flatMap((line) => {
    const [name, url, status] = line.split('|').map((part) => part.trim());
    if (!url) return [];
    return [{
      name: name || url,
      url,
      expectedStatus: Number(status) || 200,
    }];
  });
  saving.value = true;
  try {
    const result = await api.put<MonitorConfig>(`/plugin/ops-shell/monitor/config/${selectedId.value}`, {
      enabled: config.value.enabled,
      intervalSec: config.value.intervalSec,
      loadPct: config.value.loadPct,
      memPct: config.value.memPct,
      diskPct: config.value.diskPct,
      ports,
      httpChecks,
    });
    if ('error' in result) {
      ElMessage.error(result.error);
      return;
    }
    config.value = { ...result.data };
    portsText.value = (result.data.ports || []).join(', ');
    httpChecksText.value = (result.data.httpChecks || [])
      .map((check) => `${check.name}|${check.url}|${check.expectedStatus}`)
      .join('\n');
    await load();
  } finally {
    saving.value = false;
  }
}

async function runNow(): Promise<void> {
  if (!selectedId.value) return;
  running.value = true;
  try {
    const result = await api.post<{ checked: number; sampled: number; failed: number }>(
      '/plugin/ops-shell/monitor/run',
      { connectionId: selectedId.value },
    );
    if ('error' in result) {
      ElMessage.error(result.error);
      return;
    }
    await load();
  } finally {
    running.value = false;
  }
}

async function acknowledge(alert: AlertEvent): Promise<void> {
  ackingId.value = alert.id;
  try {
    const result = await api.post(`/plugin/ops-shell/monitor/alerts/${alert.id}/ack`, {});
    if ('error' in result) {
      ElMessage.error(result.error);
      return;
    }
    await load();
  } finally {
    ackingId.value = '';
  }
}

watch(selectedId, () => applyConfig());
watch(alertFilter, () => { void load(); });
watch(() => props.activeConnectionId, (id) => {
  if (id && monitorConnections.value.some((conn) => conn.id === id)) selectedId.value = id;
});
watch(() => props.connections, () => {
  void load();
}, { deep: true });

onMounted(() => {
  void load();
  poll = startVisiblePolling(load, { intervalMs: 10000 });
});
onUnmounted(() => {
  poll?.();
  poll = null;
});
</script>

<style scoped>
.omc { height: 100%; flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(260px, 0.9fr) minmax(0, 1.4fr); gap: 10px; overflow: hidden; }
.omc-config, .omc-alerts { min-height: 0; overflow: auto; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); background: var(--glass-bg); }
.omc-config { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.omc-alerts { padding: 10px; display: flex; flex-direction: column; gap: 7px; }
.omc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.omc-head-actions { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.omc-error { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 400; color: var(--color-danger); }
.omc-select { width: 100%; }
.omc-switch { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.omc-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.omc-fields label { min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-text-secondary); }
.omc-wide { grid-column: 1 / -1; }
.omc-fields :deep(.el-input-number) { width: 100%; }
.omc-actions { display: flex; gap: 8px; }
.omc-latest { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.omc-metric { min-width: 0; padding: 8px; border-radius: 6px; background: var(--color-surface); border: 1px solid var(--color-border); }
.omc-metric span, .omc-metric small { display: block; font-size: 10px; color: var(--color-text-tertiary); }
.omc-metric strong { display: block; margin: 2px 0; font-size: 19px; color: var(--color-text-primary); }
.omc-metric.warn strong { color: var(--color-warning); }
.omc-counts { font-size: 11px; font-weight: 400; color: var(--color-text-tertiary); }
.omc-filter { width: 74px; }
.omc-empty { padding: 32px 0; text-align: center; font-size: 12px; color: var(--color-text-tertiary); }
.omc-alert { display: flex; align-items: flex-start; gap: 8px; padding: 9px 10px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface); }
.omc-alert[data-severity="critical"] { border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border)); }
.omc-dot { width: 7px; height: 7px; margin-top: 5px; border-radius: 50%; flex: none; background: var(--color-warning); }
.omc-alert[data-severity="critical"] .omc-dot { background: var(--color-danger); }
.omc-alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.omc-alert-line { display: flex; align-items: center; gap: 8px; }
.omc-alert-line strong { font-size: 12px; color: var(--color-text-primary); }
.omc-alert-status { font-size: 10px; color: var(--color-text-tertiary); }
.omc-alert-meta, .omc-alert-time { font-size: 11px; color: var(--color-text-secondary); overflow-wrap: anywhere; }
.omc-alert-time { color: var(--color-text-tertiary); }
@media (max-width: 900px) {
  .omc { grid-template-columns: 1fr; overflow: auto; }
  .omc-config, .omc-alerts { overflow: visible; }
}
</style>
