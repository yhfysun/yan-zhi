<!--
  AiChangesReviewPanel.vue — 模型修改汇总 review 面板（代码工作台侧栏「审查」视图）

  ★ 为什么存在（2026-10-03 P0）：code.aiChanges 一直有按路径聚合的数据，但 UI 只在
    「当前打开的文件恰有未处理修改」时弹单文件提示条 —— 没有多文件修改的汇总入口
    （对齐 Cursor 的 Review changes 面板）。本面板补上：全部待审文件列表 + 逐文件
    diff（复用 AiDiffView 的应用/回退/忽略）。

  数据：fetchAiChanges（GET /workspace/changes?dir=项目目录，按路径合并取最新）。
-->
<template>
  <div class="rvw">
    <div class="rvw-head">
      <span class="rvw-title">模型修改审查</span>
      <span v-if="changes.length" class="rvw-badge">{{ changes.length }}</span>
      <span class="rvw-spacer" />
      <el-button v-if="changes.length" size="small" text type="danger" :loading="rollbackAll" @click="onRollbackAll">全部回退</el-button>
      <el-button size="small" text :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <div v-if="!changes.length && !loading" class="rvw-empty">
      <el-icon :size="22"><CircleCheck /></el-icon>
      <span>没有待审查的模型修改</span>
      <span class="rvw-empty-hint">模型改文件后会出现在这里（按 路径 聚合，处理过的自动消失）</span>
    </div>

    <div v-else class="rvw-list">
      <div
        v-for="c in changes"
        :key="c.id"
        class="rvw-item"
        :class="{ on: selectedId === c.id }"
        @click="select(c)"
      >
        <el-icon :size="13" class="rvw-item-icon"><Document /></el-icon>
        <span class="rvw-item-name" :title="c.path">{{ baseName(c.path) }}</span>
        <span class="rvw-item-dir" :title="c.path">{{ dirName(c.path) }}</span>
        <span v-if="c.count > 1" class="rvw-item-count">×{{ c.count }}</span>
        <span class="rvw-item-tool">{{ c.tool === 'file_write' ? '写入' : '编辑' }}</span>
      </div>
    </div>

    <div v-if="selected" class="rvw-diff">
      <AiDiffView :change-id="selected.id" :path="selected.path" @acted="onActed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CircleCheck, Document, Refresh } from '@element-plus/icons-vue';
import { useCodeStore } from '../../../stores/code';
import { api } from '../../../api/client';
import AiDiffView from '../AiDiffView.vue';

const code = useCodeStore();
const loading = ref(false);
const rollbackAll = ref(false);
const selectedId = ref('');
const changes = computed(() => code.aiChanges);
const selected = computed(() => changes.value.find((c) => c.id === selectedId.value) || null);

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const dirName = (p: string) => {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts.slice(0, -1).join('/');
};

async function refresh() {
  loading.value = true;
  try { await code.fetchAiChanges(); } finally { loading.value = false; }
  if (!changes.value.some((c) => c.id === selectedId.value)) selectedId.value = '';
}

function select(c: { id: string }) {
  selectedId.value = c.id;
}

function onActed() {
  // 应用/回退/忽略后刷新列表（处理过的文件从待审里消失）
  void refresh();
}

/** 项目级整体回滚：目录下全部待审修改退回 before（新建文件删除），二次确认后执行 */
async function onRollbackAll() {
  if (!code.projectDir) return;
  try {
    await ElMessageBox.confirm(
      `将把 ${code.projectDir} 下全部 ${changes.value.length} 个文件的模型修改退回到修改前（新建文件将被删除）。此操作不可撤销，确认继续？`,
      '全部回退',
      { confirmButtonText: '全部回退', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  rollbackAll.value = true;
  try {
    const r = await api.post<{ reverted: number; deleted: number; failed: number; total: number; errors: string[] }>(
      `/workspace/changes/rollback-all?dir=${encodeURIComponent(code.projectDir)}`,
      {},
    );
    if ('error' in r) {
      ElMessage.error(r.error);
      return;
    }
    if (r.data.failed > 0) ElMessage.warning(`已回退 ${r.data.reverted + r.data.deleted} 个，失败 ${r.data.failed} 个`);
    else ElMessage.success(`已回退 ${r.data.reverted + r.data.deleted} 个文件（含新建删除）`);
    selectedId.value = '';
    await refresh();
  } finally {
    rollbackAll.value = false;
  }
}

onMounted(() => { void refresh(); });
</script>

<style scoped>
.rvw { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.rvw-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px 6px; }
.rvw-title { font-size: 12px; font-weight: 600; color: var(--color-text); }
.rvw-badge { font-size: 11px; padding: 0 7px; border-radius: 9px; background: color-mix(in srgb, var(--color-primary, #4f46e5) 15%, transparent); color: var(--color-primary, #4f46e5); }
.rvw-spacer { flex: 1; }
.rvw-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 16px; color: var(--color-text-secondary); font-size: 12px; }
.rvw-empty-hint { font-size: 11px; opacity: 0.7; text-align: center; }
.rvw-list { flex: 0 0 auto; max-height: 42%; overflow-y: auto; padding: 0 6px; }
.rvw-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.rvw-item:hover { background: color-mix(in srgb, var(--color-primary, #4f46e5) 6%, transparent); }
.rvw-item.on { background: color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent); }
.rvw-item-icon { color: var(--color-text-secondary); flex: 0 0 auto; }
.rvw-item-name { color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto; }
.rvw-item-dir { color: var(--color-text-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; direction: rtl; text-align: left; }
.rvw-item-count { font-size: 11px; color: var(--color-primary, #4f46e5); flex: 0 0 auto; }
.rvw-item-tool { font-size: 11px; color: var(--color-text-secondary); flex: 0 0 auto; }
.rvw-diff { flex: 1 1 auto; min-height: 0; border-top: 1px solid color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent); display: flex; flex-direction: column; }
</style>
