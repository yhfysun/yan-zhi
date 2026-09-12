<template>
  <div class="ai-diff">
    <!-- 头部：说明 + 应用 / 回退 / 忽略 -->
    <div class="ai-diff-head">
      <span class="ai-diff-title">
        <el-icon :size="13"><MagicStick /></el-icon>
        模型修改对比
        <span v-if="meta" class="ai-diff-meta">{{ meta.tool }} · {{ timeLabel }}</span>
        <span v-if="isNewFile" class="ai-diff-new">新建文件</span>
      </span>
      <span class="ai-diff-spacer"></span>
      <button class="ai-diff-btn" :disabled="acting" @click="act('revert')">回退修改</button>
      <button class="ai-diff-btn primary" :disabled="acting" @click="act('apply')">应用修改</button>
      <button class="ai-diff-btn" :disabled="acting" @click="act('dismiss')">忽略</button>
      <button class="ai-diff-btn icon" title="关闭" @click="emit('close')">
        <el-icon :size="13"><Close /></el-icon>
      </button>
    </div>

    <div v-if="error" class="ai-diff-state err">{{ error }}</div>
    <div v-else-if="loading" class="ai-diff-state">
      <el-icon :size="20" class="spin"><Loading /></el-icon>
      加载快照中…
    </div>
    <div ref="hostRef" v-show="!loading && !error" class="ai-diff-body"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, Loading, MagicStick } from '@element-plus/icons-vue';
import { MergeView } from '@codemirror/merge';
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { api } from '../../api/client';

const props = defineProps<{ changeId: string; path: string }>();
const emit = defineEmits<{
  close: [];
  acted: [kind: 'apply' | 'revert' | 'dismiss', info?: { deleted?: boolean }];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const loading = ref(true);
const error = ref('');
const acting = ref(false);
const meta = ref<{ tool: string; createdAt: number } | null>(null);
const before = ref('');
const after = ref('');
const isNewFile = ref(false);

const timeLabel = computed(() => {
  if (!meta.value) return '';
  const d = new Date(meta.value.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

let mv: MergeView | null = null;

onMounted(async () => {
  const r = await api.get<{ path: string; tool: string; createdAt: number; before: string | null; after: string | null }>(
    `/workspace/changes/content?id=${encodeURIComponent(props.changeId)}`,
  );
  if ('error' in r) {
    error.value = r.error;
    loading.value = false;
    return;
  }
  meta.value = { tool: r.data.tool, createdAt: r.data.createdAt };
  before.value = r.data.before ?? '';
  after.value = r.data.after ?? '';
  isNewFile.value = r.data.before == null;
  loading.value = false;
  await nextTick();
  if (!hostRef.value) return;
  const readOnly = [EditorState.readOnly.of(true), EditorView.editable.of(false)];
  mv = new MergeView({
    a: { doc: before.value, extensions: [lineNumbers(), ...readOnly] },
    b: { doc: after.value, extensions: [lineNumbers(), ...readOnly] },
    parent: hostRef.value,
  });
});

onBeforeUnmount(() => {
  mv?.destroy();
  mv = null;
});

async function act(kind: 'apply' | 'revert' | 'dismiss') {
  acting.value = true;
  try {
    const r = await api.post<{ item: unknown; deleted?: boolean }>(`/workspace/changes/${props.changeId}/${kind}`, {});
    if ('error' in r) {
      ElMessage.error(r.error);
      return;
    }
    const labels: Record<string, string> = { apply: '已应用模型修改', revert: '已回退到修改前', dismiss: '已忽略，不再提示' };
    ElMessage.success(labels[kind]);
    emit('acted', kind, { deleted: kind === 'revert' && isNewFile.value });
  } finally {
    acting.value = false;
  }
}
</script>

<style scoped>
.ai-diff {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-diff-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: color-mix(in srgb, var(--color-primary, #c2410c) 6%, var(--el-fill-color-lighter, #faf9f6));
  font-size: 12px;
}
.ai-diff-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--color-text, #1a1a1a);
}
.ai-diff-meta { font-weight: 400; color: var(--color-text-tertiary, #9c9b94); }
.ai-diff-new {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-primary, #c2410c) 14%, transparent);
  color: var(--color-primary, #c2410c);
}
.ai-diff-spacer { flex: 1; }
.ai-diff-btn {
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  border: 1px solid var(--glass-border-strong, #d8d5cc);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1a1a);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ai-diff-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.ai-diff-btn.primary {
  background: var(--color-primary, #c2410c);
  border-color: var(--color-primary, #c2410c);
  color: #fff;
}
.ai-diff-btn.primary:hover:not(:disabled) { color: #fff; filter: brightness(1.06); }
.ai-diff-btn:disabled { opacity: 0.5; cursor: default; }
.ai-diff-btn.icon { width: 24px; padding: 0; justify-content: center; }
.ai-diff-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--color-surface, #fff);
}
.ai-diff-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary, #9c9b94);
}
.ai-diff-state.err { color: var(--el-color-danger); }
.spin { animation: ai-diff-spin 0.9s linear infinite; }
@keyframes ai-diff-spin { to { transform: rotate(360deg); } }
</style>

<style>
/* MergeView 内部滚动区铺满（非 scoped，组件注入的类名） */
.ai-diff-body .cm-mergeView,
.ai-diff-body .cm-mergeViewEditors {
  height: 100%;
  overflow: auto;
}
.ai-diff-body .cm-mergeViewEditor {
  height: 100%;
}
</style>
