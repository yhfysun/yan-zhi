<!--
  ChatTaskChangeSummary.vue — 任务结束后的「本次改了哪些文件」汇总卡

  ★ 为什么存在（2026-10-21 用户实报）：「开发模式修改文件最后不会统计修改了哪些文件、
    哪些内容，人工可以回退确认，就像 trae 一样」。

  ★★ 交互形态（2026-10-21 用户第二次实报：「这个交互模式不太好，应该是预览编辑页面
    看文件修改情况，聊天框只是有文件路径、修改行数；点击预览页面打开文件，还要有个
    全部保存按钮」）：
      · 聊天流里**只做指针**：每行 = 路径 + `+N −M`（+ 写入次数 / 时间），不放 diff；
      · 点一行 → 交给代码工作台的编辑器打开该文件并直接进 diff 视图
        （code.openDiff → CodeEditorArea 里 showDiff=true，复用 AiDiffView 的应用/回退）；
      · 「全部保存」= 把所有待审改动标记为已接受（保留磁盘现状，不重写文件），
        「全部撤销」= 逐个写回 before —— 两者都留在卡片头部（全局操作）。
      · 非代码模式（普通聊天 / 办公模式）没有编辑器可跳转 → 兜底保留原地展开 diff，
        避免"能力倒退"（旧版能看 diff，新版点了没反应是最糟的体验）。

  数据通路：GET /workspace/changes/summary?conversationId=
    → 按路径聚合的 pending 快照（文件数 / 写入次数 / 最新 id / 增删行数）
    → 兜底展开时才取 /workspace/changes/content?id=（大文件正文不进汇总响应）
    → 接受/撤销复用 /changes/:id/{apply,revert}
-->
<template>
  <div v-if="items.length" class="tcs">
    <div class="tcs-head">
      <el-icon :size="14" class="tcs-icon"><Files /></el-icon>
      <span class="tcs-title">本次修改 {{ totalFiles }} 个文件</span>
      <span class="tcs-stat">
        <em class="tcs-add">+{{ totalAdded }}</em>
        <em class="tcs-del">−{{ totalDeleted }}</em>
      </span>
      <span class="tcs-sub">{{ totalWrites }} 次写入 · 待确认</span>
      <span class="tcs-spacer" />
      <el-button size="small" text :loading="loading" @click="load">刷新</el-button>
      <el-button size="small" type="primary" :loading="savingAll" :disabled="!!acting" @click="saveAll">全部保存</el-button>
      <el-button size="small" :loading="revertingAll" :disabled="!!acting" @click="revertAll">全部撤销</el-button>
    </div>

    <template v-for="it in items" :key="it.id">
      <div
        class="tcs-row"
        :class="{ clickable: canOpenEditor }"
        :title="rowTitle(it)"
        @click="onRowClick(it)"
      >
        <!-- 代码模式：箭头表示「去编辑器看」；否则表示「就地展开」 -->
        <el-icon :size="12" class="tcs-chevron">
          <ArrowDown v-if="!canOpenEditor && expanded[it.id]" />
          <ArrowRight v-else />
        </el-icon>
        <code class="tcs-path">{{ shortPath(it.path) }}</code>
        <span class="tcs-stat">
          <em v-if="it.truncated" class="tcs-approx">大改动</em>
          <template v-else>
            <em class="tcs-add">+{{ it.added }}</em>
            <em class="tcs-del">−{{ it.deleted }}</em>
          </template>
        </span>
        <span v-if="it.writes > 1" class="tcs-badge">{{ it.writes }} 次</span>
        <span class="tcs-spacer" />
        <span class="tcs-time">{{ timeLabel(it.lastAt) }}</span>
      </div>

      <!-- 兜底：没有编辑器可跳转时，仍在原地看 diff（不倒退能力） -->
      <div v-if="!canOpenEditor && expanded[it.id]" class="tcs-row-body">
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Files, ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { buildUnifiedDiff } from '../../utils/text-diff';
import { useCodeStore } from '../../stores/code';
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
  /** 新增行数（后端用 hunk-apply 的 LCS 算，与 diff 口径一致） */
  added: number;
  /** 删除行数 */
  deleted: number;
  /** 文件大到算不了行数（超 LCS 护栏） */
  truncated: boolean;
}

const code = useCodeStore();
const items = ref<SummaryItem[]>([]);
const totalFiles = ref(0);
const totalWrites = ref(0);
const totalAdded = ref(0);
const totalDeleted = ref(0);
const loading = ref(false);
const acting = ref<'' | 'apply' | 'revert' | 'all'>('');
const savingAll = ref(false);
const revertingAll = ref(false);
const expanded = reactive<Record<string, boolean>>({});
const detailState = reactive<Record<string, 'idle' | 'loading' | 'gone'>>({});
const detailText = reactive<Record<string, string>>({});

/** 有代码工作台的编辑器可跳转时才走「点开预览」，否则兜底就地展开 */
const canOpenEditor = computed(() => Boolean(code.codeModeActive));

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

function rowTitle(it: SummaryItem): string {
  const stat = it.truncated ? '大改动（行数未统计）' : `+${it.added} −${it.deleted}`;
  const hint = canOpenEditor.value ? '点击在编辑器中查看改动' : '点击展开改动内容';
  return `${it.path}\n${stat} · ${hint}`;
}

async function load() {
  if (!props.conversationId) { items.value = []; return; }
  loading.value = true;
  try {
    const r = await api.get<{
      items: SummaryItem[]; totalFiles: number; totalWrites: number;
      totalAdded?: number; totalDeleted?: number;
    }>(
      `/workspace/changes/summary?conversationId=${encodeURIComponent(props.conversationId)}`,
    );
    if ('error' in r) { items.value = []; return; }
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    totalFiles.value = Number(r.data?.totalFiles) || items.value.length;
    totalWrites.value = Number(r.data?.totalWrites) || items.value.length;
    totalAdded.value = Number(r.data?.totalAdded) || items.value.reduce((n, i) => n + (i.added || 0), 0);
    totalDeleted.value = Number(r.data?.totalDeleted) || items.value.reduce((n, i) => n + (i.deleted || 0), 0);
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

/**
 * 点一行：
 *  · 代码模式 → 打开编辑器并直接进 diff（用户要的「点击预览页面打开文件」）；
 *  · 其它模式 → 就地展开（没有编辑器可跳，展开是唯一能看内容的方式）。
 */
function onRowClick(it: SummaryItem) {
  if (canOpenEditor.value) {
    code.openDiff(it.path, it.id);
    return;
  }
  expanded[it.id] = !expanded[it.id];
  if (expanded[it.id]) void ensureDetail(it);
}

/** 全部保存 = 全部确认（保留磁盘现状）；与「全部撤销」相对 */
async function saveAll() {
  if (!items.value.length) return;
  try {
    await ElMessageBox.confirm(
      `将保留本次对 ${items.value.length} 个文件的修改（只是确认，不会重写文件内容）。`,
      '全部保存',
      { type: 'info', confirmButtonText: '全部保存', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  savingAll.value = true;
  try {
    const r = await code.applyAiChanges(items.value.map((i) => i.id));
    await load();
    if (r.failed) ElMessage.warning(`已保存 ${r.ok} 个文件，${r.failed} 个失败（可能已被后续修改覆盖）`);
    else ElMessage.success(`已保存 ${r.ok} 个文件的修改`);
  } finally {
    savingAll.value = false;
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
    return;
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
/* 行数：绿加红减 —— 与 diff 着色一致（此处是"改动量"，不是行情涨跌） */
.tcs-stat { display: inline-flex; align-items: center; gap: 4px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
.tcs-add { font-style: normal; color: #22a06b; }
.tcs-del { font-style: normal; color: #e5484d; }
.tcs-approx { font-style: normal; color: var(--el-text-color-secondary, #909399); }
.tcs-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-top: 1px solid var(--el-border-color-lighter, #e4e7ed);
}
.tcs-row:first-of-type { border-top: none; }
.tcs-row.clickable { cursor: pointer; }
.tcs-row.clickable:hover { background: var(--el-fill-color-light, #f5f7fa); }
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
