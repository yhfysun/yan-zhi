<template>
  <div class="kh-panel">
    <div class="kh-head">
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      <el-tag size="small" :type="modeType">{{ modeLabel }}</el-tag>
      <span class="kh-tip">{{ modeTip }}</span>
    </div>

    <el-table v-if="items.length" :data="items" size="small" height="100%" class="kh-table">
      <el-table-column prop="host" label="主机" width="180" show-overflow-tooltip />
      <el-table-column prop="keyType" label="类型" width="130" show-overflow-tooltip />
      <el-table-column prop="fingerprint" label="指纹（SHA256）" min-width="330" show-overflow-tooltip />
      <el-table-column label="首次记录" width="160">
        <template #default="{ row }">{{ fmtStamp(row.firstSeenAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button link type="danger" size="small" @click="forget(row)">忘记</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-else class="kh-empty">
      还没有记录任何主机密钥 —— 连一次服务器后，它当时的密钥指纹会出现在这里
    </div>
  </div>
</template>

<script setup lang="ts">
// 主机密钥（known_hosts）：看清「这台机器被我信任的密钥是哪一把」，并在服务器合法换过
// 密钥之后把它忘掉（下次连接重新 TOFU）。刻意不做手工导入，理由见服务端路由注释。
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';

interface KnownHost {
  host: string;
  keyType: string;
  fingerprint: string;
  firstSeenAt: number;
}
type Mode = 'tofu' | 'strict' | 'off';

const items = ref<KnownHost[]>([]);
const loading = ref(false);
const mode = ref<Mode>('tofu');

const modeLabel = computed(() => ({ tofu: 'TOFU 模式', strict: '严格模式', off: '不校验' }[mode.value]));
const modeType = computed(
  () => (mode.value === 'strict' ? 'success' : mode.value === 'off' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning',
);
const modeTip = computed(() => ({
  tofu: '首次连接记录指纹，之后每次连接必须一致；不一致会拒绝并提示（可在插件配置里改）',
  strict: '只允许已记录的主机连接；新主机会被直接拒绝',
  off: '当前不校验主机密钥 —— 中间人可顶替服务器，仅建议在自建测试环境使用',
}[mode.value]));

function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtStamp(ms: number): string {
  const d = new Date(ms || 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await api.get<KnownHost[]>('/plugin/ops-shell/known-hosts');
    if ('error' in r) { ElMessage.error(r.error); return; }
    items.value = r.data;
    const m = (r as unknown as { mode?: Mode }).mode;
    if (m) mode.value = m;
  } finally {
    loading.value = false;
  }
}

async function forget(row: KnownHost): Promise<void> {
  const ok = await ElMessageBox.confirm(
    `忘记「${row.host}」的主机密钥？下次连接会重新信任当时拿到的密钥 —— `
    + '只有在确认服务器确实换过密钥（重装 / 迁移）时才这么做。',
    '忘记主机密钥',
    { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  const r = await api.delete(`/plugin/ops-shell/known-hosts/${encodeURIComponent(row.host)}`);
  if ('error' in r) { ElMessage.error(r.error); return; }
  items.value = items.value.filter((x) => x.host !== row.host);
}

onMounted(() => { void load(); });
defineExpose({ load });
</script>

<style scoped>
.kh-panel { display: flex; flex-direction: column; height: 100%; }
.kh-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.kh-tip { font-size: 12px; color: var(--color-text-tertiary); }
.kh-table { flex: 1; min-height: 0; }
.kh-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--color-text-tertiary);
}
</style>
