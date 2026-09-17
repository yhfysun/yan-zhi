<!--
  OpsMetricsPanel.vue — 运维左栏底部实时面板（openspec four-mode-workspace 任务 7.4）
  - 复用 ops-shell 既有远程执行能力（GET /plugin/ops-shell/metrics），不新增后端
  - 轮询当前激活连接（SSH / Docker），展示 CPU 负载 / 内存 / 磁盘 / 进程 TOP4
  - 只读遥测，无任何写操作；数据库连接不显示本面板（由父级控制）
-->
<template>
  <div class="omp">
    <div class="omp-head">
      <span class="omp-title">实时面板</span>
      <span class="omp-conn" :title="connName">{{ connName }}</span>
      <span v-if="error" class="omp-err" :title="error">采集失败</span>
      <span v-else-if="loading" class="omp-loading">采集中…</span>
    </div>

    <div class="omp-grid">
      <div class="omp-cell">
        <span class="omp-k">负载</span>
        <span class="omp-v" :title="loadTitle">{{ load1 }} <i>/ {{ load5 }} / {{ load15 }}</i></span>
      </div>
      <div class="omp-cell">
        <span class="omp-k">内存</span>
        <span class="omp-v">{{ memPct }}%</span>
        <div class="omp-bar"><i :style="{ width: memPct + '%' }" /></div>
      </div>
      <div class="omp-cell">
        <span class="omp-k">根盘</span>
        <span class="omp-v">{{ diskUsePct }}%</span>
        <div class="omp-bar"><i :class="{ warn: diskUsePct >= 85 }" :style="{ width: diskUsePct + '%' }" /></div>
      </div>
    </div>

    <div v-if="topRows.length" class="omp-procs">
      <div v-for="(p, i) in topRows" :key="i" class="omp-proc" :title="p.cmd">
        <span class="omp-proc-cmd">{{ p.cmd }}</span>
        <span class="omp-proc-val">{{ p.val }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '../../api/client';

const props = defineProps<{
  connectionId: string;
  connName: string;
}>();

interface MetricsRaw { loadavg: string; mem: string; disk: string; topCpu: string; topMem: string }
const raw = ref<MetricsRaw | null>(null);
const loading = ref(false);
const error = ref('');
let timer: number | null = null;

async function fetchOnce() {
  if (!props.connectionId || loading.value) return;
  loading.value = true;
  try {
    const r = await api.get<MetricsRaw>(`/plugin/ops-shell/metrics?connectionId=${encodeURIComponent(props.connectionId)}`);
    if ('data' in r) { raw.value = r.data; error.value = ''; }
    else error.value = r.error;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function startPoll() {
  stopPoll();
  void fetchOnce();
  timer = window.setInterval(() => void fetchOnce(), 10000);
}
function stopPoll() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
}

watch(() => props.connectionId, () => { if (props.connectionId) startPoll(); else stopPoll(); });
onMounted(() => { if (props.connectionId) startPoll(); });
onUnmounted(stopPoll);

// ---- 解析（后端返回原始文本，这里做轻量解析，解析失败显示 --）----
const loadParts = computed(() => (raw.value?.loadavg || '').split(/\s+/).slice(0, 3));
const load1 = computed(() => loadParts.value[0] || '--');
const load5 = computed(() => loadParts.value[1] || '--');
const load15 = computed(() => loadParts.value[2] || '--');
const loadTitle = computed(() => (raw.value?.loadavg || '').trim());

/** free -m 的 Mem: 行：total used free shared buff/cache available */
const memPct = computed(() => {
  const line = (raw.value?.mem || '').split('\n').find((l) => l.startsWith('Mem:'));
  if (!line) return '--';
  const n = line.split(/\s+/).filter((x) => x !== 'Mem:').map(Number).filter((x) => !Number.isNaN(x));
  if (n.length < 2 || !n[0]) return '--';
  const total = n[0];
  // 优先 available（第 7 列），退化 used/total
  const used = n.length >= 7 && n[6] > 0 ? Math.max(0, total - n[6]) : n[1];
  return String(Math.min(100, Math.round((used / total) * 100)));
});

/** df -hP / 单行：Filesystem Size Used Avail Use% Mounted（解析失败返回 0，仅影响进度条） */
const diskUsePct = computed<number>(() => {
  const line = (raw.value?.disk || '').trim().split('\n').pop() || '';
  const m = line.match(/(\d+)%/);
  return m ? Number(m[1]) : 0;
});

interface ProcRow { cmd: string; val: string }
/** ps aux 表：USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND（取前 4 行，去掉表头） */
function parseProcs(text: string, valIdx: 2 | 3): ProcRow[] {
  const lines = text.split('\n').filter(Boolean);
  const out: ProcRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 11) continue;
    const cmd = cols.slice(10).join(' ');
    const val = Number(cols[valIdx]);
    if (Number.isNaN(val)) continue;
    out.push({ cmd: cmd.length > 46 ? cmd.slice(0, 46) + '…' : cmd, val: `${val}%` });
    if (out.length >= 4) break;
  }
  return out;
}
const topRows = computed<ProcRow[]>(() => {
  if (!raw.value) return [];
  const cpu = parseProcs(raw.value.topCpu, 2);
  return cpu.length ? cpu : parseProcs(raw.value.topMem, 3);
});
</script>

<style scoped>
.omp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 2px 4px;
  font-size: 11.5px;
}

.omp-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.omp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.omp-conn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, monospace;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.omp-loading, .omp-err { font-size: 10.5px; flex-shrink: 0; }
.omp-loading { color: var(--color-text-tertiary); }
.omp-err { color: var(--el-color-danger, #dc2626); }

.omp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.omp-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 7px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 70%, transparent);
  min-width: 0;
}

.omp-k { font-size: 10px; color: var(--color-text-tertiary); }

.omp-v {
  font-size: 12.5px;
  font-weight: 600;
  font-family: Consolas, monospace;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omp-v i { font-style: normal; font-weight: 400; font-size: 10px; color: var(--color-text-tertiary); }

.omp-bar {
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-text) 10%, transparent);
  overflow: hidden;
}

.omp-bar i { display: block; height: 100%; border-radius: 2px; background: var(--color-primary); transition: width 0.4s ease; }
.omp-bar i.warn { background: var(--el-color-warning, #c2740b); }

.omp-procs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.omp-proc {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 5px;
}

.omp-proc:hover { background: var(--glass-bg-hover); }

.omp-proc-cmd {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, monospace;
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.omp-proc-val { flex-shrink: 0; font-size: 10.5px; font-weight: 600; color: var(--color-primary); font-family: Consolas, monospace; }
</style>
