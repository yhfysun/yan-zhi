<template>
  <div class="rec-panel">
    <div class="rec-head">
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      <el-tag v-if="!recording" size="small" type="info">录制已关闭</el-tag>
      <span v-else class="rec-on"><span class="rec-dot" />录制中 —— 连上的会话会自动记录</span>
      <span class="rec-tip">asciinema .cast，逐字记录 PTY 输出与按键；最多保留最近 200 条，超出自动淘汰最旧的</span>
    </div>

    <el-table v-if="items.length" :data="items" size="small" height="100%" class="rec-table">
      <el-table-column prop="connectionName" label="连接" width="150" show-overflow-tooltip />
      <el-table-column label="开始时间" width="160">
        <template #default="{ row }">{{ fmtStamp(row.startedAt) }}</template>
      </el-table-column>
      <el-table-column label="时长" width="90">
        <template #default="{ row }">{{ fmtDur(row.durationSec) }}</template>
      </el-table-column>
      <el-table-column label="大小" width="90">
        <template #default="{ row }">{{ fmtSize(row.bytes) }}</template>
      </el-table-column>
      <el-table-column label="通道" width="100">
        <template #default="{ row }">{{ row.transport }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.truncated" size="small" type="warning">已截断</el-tag>
          <span v-else class="rec-ok">完整</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="play(row)">回放</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-else class="rec-empty">
      暂无录像 —— 在左侧连上一个 SSH / Docker 连接，终端会话会自动开始录制
    </div>

    <OpsRecordingPlayer ref="playerRef" />
  </div>
</template>

<script setup lang="ts">
// 会话录像列表：元数据来自 GET /recordings（不含正文），正文在点「回放」时单独取。
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';
import OpsRecordingPlayer from './OpsRecordingPlayer.vue';

interface RecordingMeta {
  id: string;
  connectionName: string;
  transport: string;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  bytes: number;
  truncated: boolean;
}

const items = ref<RecordingMeta[]>([]);
const loading = ref(false);
/** 服务端是否在录制（插件配置可关） */
const recording = ref(true);
const playerRef = ref<InstanceType<typeof OpsRecordingPlayer> | null>(null);

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** epoch ms → 本地「MM-DD HH:mm:ss」 */
function fmtStamp(ms: number): string {
  const d = new Date(ms || 0);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${pad(s % 60)}s`;
}

function fmtSize(bytes: number): string {
  const b = Math.max(0, bytes || 0);
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await api.get<RecordingMeta[]>('/plugin/ops-shell/recordings');
    if ('error' in r) { ElMessage.error(r.error); return; }
    items.value = r.data;
    // recording 字段由服务端附带（插件配置关掉录制时，列表会一直是空的）
    const flag = (r as unknown as { recording?: boolean }).recording;
    if (typeof flag === 'boolean') recording.value = flag;
  } finally {
    loading.value = false;
  }
}

function play(row: RecordingMeta): void {
  void playerRef.value?.open(row.id, `${row.connectionName} · ${fmtStamp(row.startedAt)}`);
}

async function remove(row: RecordingMeta): Promise<void> {
  const ok = await ElMessageBox.confirm(
    `删除「${row.connectionName} · ${fmtStamp(row.startedAt)}」这条录像？文件会一并删掉，不可恢复。`,
    '删除录像',
    { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  const r = await api.delete(`/plugin/ops-shell/recordings/${row.id}`);
  if ('error' in r) { ElMessage.error(r.error); return; }
  items.value = items.value.filter((x) => x.id !== row.id);
}

onMounted(() => { void load(); });
defineExpose({ load });
</script>

<style scoped>
.rec-panel { display: flex; flex-direction: column; height: 100%; }
.rec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.rec-tip { font-size: 12px; color: var(--color-text-tertiary); }
.rec-on { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary); }
.rec-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--el-color-danger);
  animation: rec-blink 1.6s ease-in-out infinite;
}
@keyframes rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.rec-table { flex: 1; min-height: 0; }
.rec-ok { font-size: 12px; color: var(--color-text-tertiary); }
.rec-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--color-text-tertiary);
}
</style>
