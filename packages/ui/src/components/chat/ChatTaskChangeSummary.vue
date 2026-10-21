<!--
  ChatTaskChangeSummary.vue — 任务结束后的「本次改了哪些文件」汇总卡

  ★ 为什么存在（2026-10-21 用户实报）：「开发模式修改文件最后不会统计修改了哪些文件、
    哪些内容，人工可以回退确认，就像 trae 一样」。此前只有逐条工具卡片
    （ChatFileChangeCard）—— 任务跑了 25 步之后，用户要一屏屏翻聊天记录才知道模型动了什么。

  数据通路：GET /workspace/changes/summary?conversationId=
    → 按路径聚合的 pending 快照（文件数 / 写入次数 / 最新 id）
    → 展开某一行时再取 /workspace/changes/content?id=（大文件不进汇总响应）
    → buildUnifiedDiff + DiffBody 展示；接受/回退复用 /changes/:id/{apply,revert}
-->
<template>
  <div v-if="items.length" class="tcs">
    <div class="tcs-head">
      <el-icon :size="14" class="tcs-icon"><Files /></el-icon>
      <span class="tcs-title">本次修改 {{ totalFiles }} 个文件</span>
      <span class="tcs-sub">（{{ totalWrites }} 次写入 · 待确认）</span>
      <span class="tcs-spacer" />
      <el-button size="small" text :loading="loading" @click="load">刷新</el-button>
      <el-button size="small" :loading="revertingAll" :disabled="!!acting" @click="revertAll">全部撤销</el-button>
    </div>

    <div v-for="it in items" :key="it.id" class="tcs-row">
      <div class="tcs-row-head" @click="toggle(it)">
        <el-icon :size="12" class="tcs-chevron">
          <ArrowDown v-if="expanded[it.id]" /><ArrowRight v-else />
        </el-icon>
        <code class="tcs-path" :title="it.path">{{ shortPath(it.path) }}</code>
        <span v-if="it.writes > 1" class="tcs-badge">{{ it.writes }} 次</span>
        <span class="tcs-spacer" />
        <span class="tcs-time">{{ timeLabel(it.lastAt) }}</span>
        <el-button
          size="small" text type="primary"
          :disabled="!!acting"
          @click.stop="act(it, 'apply')"
        >保留</el-button>
        <el-button
          size="small" text type="warning"
          :disabled="!!acting"
          @click.stop="act(it, 'revert')"
        >撤销</el-button>
      </div>
      <div v-if="expanded[it.id]" class="tcs-row-body">
        <div v-if="detailState[it.id] === 'loading'" class="tcs-empty">加载中…</div>
        <div v-else-if="detailState[it.id] === 'gone'" class="tcs-empty">该修改已处理（或被后续修改覆盖）</div>
        <DiffBody
          v-else-if="detailText[it.id]"
          :diff-text="detailText[it.id]"
          :file-name="shortPath(it.path)"
          plain
        />
        <div v-else class="tcs-empty">（内容无差异）</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Files, ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { buildUnifiedDiff } from '../../utils/text-diff';
import DiffBody from './DiffBody.vue';

const props = defineProps<{
  /** 会话 id —— 快照按会话归属聚合 */
  conversationId: string;
  /** 会话是否仍在跑：跑的过程中不显示（避免半截清单），结束后加载一次 */
  streaming: boolean;
}>();

interface SummaryItem {
  id: string;
  path: string;
  tool: string;
  writes: number;
  firstAt: number;
  lastAt: number;
}

const items = ref<SummaryItem[]>([]);
const totalFiles = ref(0);
const totalWrites = ref(0);
const loading = ref(false);
const acting = ref<'' | 'apply' | 'revert' | 'all'>('');
const revertingAll = ref(false);
const expanded = reactive<Record<string, boolean>>({});
const detailState = reactive<Record<string, 'idle' | 'loading' | 'gone'>>({});
const detailText = reactive<Record<string, string>>({});

function shortPath(p: string): string {
  const parts = String(p || '').split(/[\\/]/);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : parts.join('/');
}

function timeLabel(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  if (!props.conversationId) { items.value = []; return; }
  loading.value = true;
  try {
    const r = await api.get<{ items: SummaryItem[]; totalFiles: number; totalWrites: number }>(
      `/workspace/changes/summary?conversationId=${encodeURIComponent(props.conversationId)}`,
    );
    if ('error' in r) { items.value = []; return; }
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    totalFiles.value = Number(r.data?.totalFiles) || items.value.length;
    totalWrites.value = Number(r.data?.totalWrites) || items.value.length;
    // 已不存在的行清掉展开态，避免下次同名行带着旧 diff
    for (const k of Object.keys(expanded)) {
      if (!items.value.some((i) => i.id === k)) delete expanded[k];
    }
  } finally {
    loading.value = false;
  }
}

async function ensureDetail(it: SummaryItem) {
  if (detailText[it.id] !== undefined || detailState[it.id] === 'loading') return;
  detailState[it.id] = 'loading';
  const r = await api.get<{ before: string | null; after: string | null }>(
    `/workspace/changes/content?id=${encodeURIComponent(it.id)}`,
  );
  if ('error' in r) {
    detailState[it.id] = 'gone';
    return;
  }
  detailState[it.id] = 'idle';
  detailText[it.id] = buildUnifiedDiff(r.data?.before ?? '', r.data?.after ?? '');
}

function toggle(it: SummaryItem) {
  expanded[it.id] = !expanded[it.id];
  if (expanded[it.id]) void ensureDetail(it);
}

async function act(it: SummaryItem, kind: 'apply' | 'revert') {
  acting.value = kind;
  try {
    const r = await api.post<{ item: unknown }>(`/workspace/changes/${encodeURIComponent(it.id)}/${kind}`, {});
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success(kind === 'apply' ? '已保留该文件的修改' : '已撤销该文件的修改');
    delete expanded[it.id];
    delete detailText[it.id];
    delete detailState[it.id];
    await load();
  } finally {
    acting.value = '';
  }
}

async function revertAll() {
  if (!items.value.length) return;
  try {
    await ElMessageBox.confirm(
      `将撤销本次对 ${items.value.length} 个文件的全部修改（新建文件会被删除），确定吗？`,
      '全部撤销',
      { type: 'warning', confirmButtonText: '全部撤销', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  revertingAll.value = true;
  let ok = 0;
  let failed = 0;
  try {
    for (const it of [...items.value]) {
      const r = await api.post<{ item: unknown }>(`/workspace/changes/${encodeURIComponent(it.id)}/revert`, {});
      if ('error' in r) failed += 1;
      else ok += 1;
    }
  } finally {
    revertingAll.value = false;
    await load();
  }
  if (failed) ElMessage.warning(`已撤销 ${ok} 个文件，${failed} 个失败（可能已被后续修改覆盖）`);
  else ElMessage.success(`已撤销 ${ok} 个文件`);
}

onMounted(() => { if (!props.streaming) void load(); });

// 会话切换 → 重新聚合；跑完的那一刻 → 加载本次清单
watch(() => props.conversationId, () => { items.value = []; void load(); });
watch(() => props.streaming, (now, before) => {
  if (before && !now) void load();
});
</script>

<style scoped>
.tcs {
  margin: 12px 16px 24px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 10px;
  background: var(--el-fill-color-blank, #fff);
  overflow: hidden;
}
.tcs-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
}
.tcs-icon { color: var(--el-color-primary, #409eff); }
.tcs-title { font-size: 13px; font-weight: 600; }
.tcs-sub { font-size: 12px; color: var(--el-text-color-secondary, #909399); }
.tcs-spacer { flex: 1; }
.tcs-row { border-top: 1px solid var(--el-border-color-lighter, #e4e7ed); }
.tcs-row:first-of-type { border-top: none; }
.tcs-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.tcs-row-head:hover { background: var(--el-fill-color-light, #f5f7fa); }
.tcs-chevron { color: var(--el-text-color-secondary, #909399); }
.tcs-path { font-size: 12px; font-family: ui-monospace, Menlo, Consolas, monospace; }
.tcs-badge {
  font-size: 11px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
}
.tcs-time { font-size: 11px; color: var(--el-text-color-secondary, #909399); }
.tcs-row-body { padding: 0 12px 8px; }
.tcs-empty { font-size: 12px; color: var(--el-text-color-secondary, #909399); padding: 6px 0; }
</style>
