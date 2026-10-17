<!--
  命令广播（7.14）：选多台 SSH/Docker 连接，把同一条命令并发发出去。
  护栏：危险命令黑名单整批拒绝；含生产连接必须二次确认；逐台展示结果与审计由后端写入。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="命令广播（多机执行）"
    width="660px"
    append-to-body
  >
    <div class="obd">
      <div class="obd-head">
        <span>目标连接</span>
        <span class="obd-tip">已选 {{ selected.length }} 台（最多 20 台）</span>
      </div>
      <div class="obd-targets">
        <label v-for="c in selectable" :key="c.id" class="obd-target">
          <el-checkbox :model-value="selectedIds.has(c.id)" @change="toggle(c.id, $event === true)" />
          <span class="obd-name">{{ c.name }}</span>
          <span class="obd-meta">{{ c.username }}@{{ c.host }}</span>
          <el-tag v-if="c.tag" size="small" :type="isProd(c) ? 'danger' : 'info'">{{ c.tag }}</el-tag>
        </label>
        <div v-if="!selectable.length" class="obd-empty">没有可用于广播的 SSH / Docker 连接</div>
      </div>

      <el-input
        v-model="command"
        type="textarea"
        :rows="3"
        placeholder="输入要广播到所有选中连接的命令（危险命令黑名单始终拒绝）"
      />
      <div v-if="prodNames.length" class="obd-warn">
        ⚠ 选中包含生产连接：{{ prodNames.join('、') }}。执行前会再次确认。
      </div>

      <div v-if="results.length" class="obd-results">
        <div class="obd-head">
          <span>执行结果</span>
          <span class="obd-tip">{{ okCount }} 成功 / {{ results.length - okCount }} 失败</span>
        </div>
        <div v-for="r in results" :key="r.connectionId" class="obd-result">
          <div class="obd-result-head">
            <el-tag size="small" :type="r.ok ? 'success' : 'danger'">{{ r.ok ? '成功' : '失败' }}</el-tag>
            <span class="obd-name">{{ r.name }}</span>
            <span v-if="r.code !== undefined" class="obd-code">exit={{ r.code }}</span>
            <span class="obd-spacer" />
            <el-button link size="small" @click="toggleExpand(r.connectionId)">
              {{ expanded.has(r.connectionId) ? '收起输出' : '查看输出' }}
            </el-button>
          </div>
          <pre v-if="expanded.has(r.connectionId)" class="obd-out">{{ outputOf(r) }}</pre>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button size="small" type="primary" :loading="running" :disabled="!canRun" @click="run">执行广播</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';
import type { OpsConn } from '../../views/plugin/OpsConnectionDialog.vue';

interface BroadcastResult {
  connectionId: string;
  name: string;
  ok: boolean;
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

const props = defineProps<{ modelValue: boolean; connections: OpsConn[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const selectable = computed(() => props.connections.filter((c) => (c.type || 'ssh') !== 'database'));
const selectedIds = ref<Set<string>>(new Set());
const command = ref('');
const running = ref(false);
const results = ref<BroadcastResult[]>([]);
const expanded = ref<Set<string>>(new Set());

const selected = computed(() => selectable.value.filter((c) => selectedIds.value.has(c.id)));
const prodNames = computed(() => selected.value.filter(isProd).map((c) => c.name));
const canRun = computed(() => selected.value.length > 0 && !!command.value.trim() && !running.value);
const okCount = computed(() => results.value.filter((r) => r.ok).length);

function isProd(c: OpsConn): boolean {
  return /生产|prod/i.test(c.tag || '');
}
function toggle(id: string, on: boolean): void {
  const s = new Set(selectedIds.value);
  if (on) s.add(id); else s.delete(id);
  selectedIds.value = s;
}
function toggleExpand(id: string): void {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  expanded.value = s;
}
function outputOf(r: BroadcastResult): string {
  const text = [r.stdout, r.stderr].filter(Boolean).join('\n');
  return (text || r.error || '（无输出）').slice(0, 8000);
}

// 每次打开清掉上次结果，避免把旧输出误当成本次
watch(() => props.modelValue, (open) => {
  if (!open) return;
  results.value = [];
  expanded.value = new Set();
});

async function run(): Promise<void> {
  if (!canRun.value) return;
  if (prodNames.value.length) {
    const ok = await ElMessageBox.confirm(
      `将向 ${selected.value.length} 台连接广播同一条命令，其中生产连接：${prodNames.value.join('、')}。确认执行？`,
      '生产广播确认',
      { type: 'warning', confirmButtonText: '广播执行', cancelButtonText: '取消' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  running.value = true;
  results.value = [];
  try {
    const r = await api.post<{ results: BroadcastResult[] }>('/plugin/ops-shell/broadcast', {
      connectionIds: selected.value.map((c) => c.id),
      command: command.value.trim(),
      confirmed: prodNames.value.length > 0,
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    results.value = Array.isArray(r.data?.results) ? r.data.results : [];
    const okN = results.value.filter((x) => x.ok).length;
    ElMessage.success(`广播完成：${okN} 成功 / ${results.value.length - okN} 失败`);
  } catch (e) {
    ElMessage.error(`广播失败：${(e as Error).message}`);
  } finally {
    running.value = false;
  }
}
</script>

<style scoped>
.obd { display: flex; flex-direction: column; gap: 10px; }
.obd-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-text-secondary); }
.obd-tip { font-size: 11px; color: var(--color-text-tertiary); }
.obd-targets {
  max-height: 200px; overflow: auto; display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--glass-border); border-radius: 8px; padding: 4px 8px;
}
.obd-target { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
.obd-name { font-weight: 500; }
.obd-meta { font-size: 11px; color: var(--color-text-tertiary); font-family: Consolas, monospace; }
.obd-spacer { flex: 1; }
.obd-warn { font-size: 11.5px; color: var(--el-color-danger, #d9534f); line-height: 1.5; }
.obd-empty { font-size: 11px; color: var(--color-text-tertiary); padding: 4px; }
.obd-results { display: flex; flex-direction: column; gap: 6px; }
.obd-result { border-top: 1px dashed var(--glass-border); padding-top: 6px; }
.obd-result-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.obd-code { font-size: 11px; color: var(--color-text-tertiary); font-family: Consolas, monospace; }
.obd-out {
  margin: 6px 0 0; padding: 8px; max-height: 220px; overflow: auto; border-radius: 6px;
  background: var(--skin-surface-sunken, #0f172a); color: var(--skin-text, #e2e8f0);
  font-family: Consolas, monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all;
}
</style>
