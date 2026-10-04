<!--
  ChatFileChangeCard.vue — 聊天流内嵌的「模型改了这个文件」diff 卡片

  ★ 为什么存在（2026-10-03 P0）：此前 AI 改文件在消息流里只是一张折叠的工具卡片，
    diff 与「应用/回退」只存在于工作台编辑器的提示条（AiDiffView）—— 用户在对话流里
    无法直接 review。本卡片把 review 搬进聊天流：file_write / file_edit 工具卡片下方
    内联展示 before/after diff + 应用 / 回退按钮（对齐 Cline 的消息内 diff 体验）。

  数据通路：卡片只有「工具结果文本里的路径」→ GET /workspace/changes/latest
    （按会话+路径反查最新 pending 快照，斜杠方向归一化）→ before/after
    → buildUnifiedDiff → DiffBody(plain)。应用/回退复用既有 /changes/:id/{apply,revert}。
-->
<template>
  <div class="cfc">
    <div class="cfc-head" @click="open = !open">
      <el-icon :size="13" class="cfc-dot">
        <CircleCheck v-if="state === 'idle'" />
        <Loading v-else-if="state === 'loading'" class="is-loading" />
        <CircleClose v-else-if="state === 'gone'" />
        <Document v-else />
      </el-icon>
      <code class="cfc-path" :title="change?.path">{{ fileName }}</code>
      <span v-if="change" class="cfc-stat">
        <em class="cfc-add">+{{ stat.added }}</em>
        <em class="cfc-del">−{{ stat.deleted }}</em>
      </span>
      <span v-if="change && change.count > 1" class="cfc-count">{{ change.count }} 次修改</span>
      <span v-if="change && change.tool === 'file_write' && isNewFile" class="cfc-tag">新文件</span>
      <span class="cfc-spacer" />
      <el-icon :size="12" class="cfc-chevron">
        <ArrowDown v-if="open" /><ArrowRight v-else />
      </el-icon>
    </div>
    <div v-show="open && change" class="cfc-body">
      <DiffBody v-if="diffText" :diff-text="diffText" :file-name="fileName" plain />
      <div v-else class="cfc-empty">（内容无差异）</div>
      <div v-if="change" class="cfc-actions">
        <el-button size="small" type="primary" :loading="acting === 'apply'" :disabled="!!acting" @click="act('apply')">接受修改</el-button>
        <el-button size="small" :loading="acting === 'revert'" :disabled="!!acting" @click="act('revert')">回退</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { CircleCheck, CircleClose, Document, Loading, ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { buildUnifiedDiff } from '../../utils/text-diff';
import DiffBody from './DiffBody.vue';

const props = defineProps<{
  /** 目标文件绝对路径（来自工具结果文本） */
  path: string;
  /** 会话 id —— 快照按会话归属反查，避免跨会话串数据 */
  conversationId: string;
}>();

const emit = defineEmits<{ (e: 'acted', kind: 'apply' | 'revert'): void }>();

const state = ref<'idle' | 'loading' | 'gone' | 'error'>('idle');
const open = ref(false);
const acting = ref<'apply' | 'revert' | ''>('');
const change = ref<{ id: string; path: string; tool: string; createdAt: number; before: string | null; after: string | null; count: number } | null>(null);

const fileName = computed(() => (change.value?.path || props.path || '').split(/[\\/]/).pop() || '');
const isNewFile = computed(() => change.value?.before == null);
const diffText = computed(() => (change.value ? buildUnifiedDiff(change.value.before ?? '', change.value.after ?? '') : ''));
const stat = computed(() => {
  let added = 0, deleted = 0;
  for (const line of diffText.value.split('\n')) {
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) deleted++;
  }
  return { added, deleted };
});

onMounted(async () => {
  if (!props.path || !props.conversationId) { state.value = 'gone'; return; }
  state.value = 'loading';
  const r = await api.get<{ id: string; path: string; tool: string; createdAt: number; before: string | null; after: string | null; count: number }>(
    `/workspace/changes/latest?conversationId=${encodeURIComponent(props.conversationId)}&path=${encodeURIComponent(props.path)}`,
  );
  if ('error' in r) {
    state.value = 'gone'; // 没有待审快照（已被处理/已被审计收口）→ 卡片自然退化成一行
    return;
  }
  change.value = r.data;
  state.value = 'idle';
  open.value = true;
});

async function act(kind: 'apply' | 'revert') {
  if (!change.value) return;
  acting.value = kind;
  try {
    const r = await api.post<{ item: unknown; deleted?: boolean }>(`/workspace/changes/${change.value.id}/${kind}`, {});
    if ('error' in r) {
      ElMessage.error(r.error);
      return;
    }
    ElMessage.success(kind === 'apply' ? '已接受模型修改' : '已回退到修改前');
    change.value = null;
    state.value = 'gone';
    emit('acted', kind);
  } finally {
    acting.value = '';
  }
}
</script>

<style scoped>
.cfc { margin: 6px 0; border: 1px solid color-mix(in srgb, var(--color-primary, #4f46e5) 18%, transparent); border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--color-primary, #4f46e5) 3%, transparent); }
.cfc-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; color: var(--color-text-secondary); }
.cfc-head:hover { background: color-mix(in srgb, var(--color-primary, #4f46e5) 6%, transparent); }
.cfc-dot { color: var(--color-primary, #4f46e5); }
.cfc-path { font-size: 12px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
.cfc-stat em { font-style: normal; margin-right: 4px; font-family: monospace; }
.cfc-add { color: #22a06b; }
.cfc-del { color: #e5484d; }
.cfc-count, .cfc-tag { font-size: 11px; padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent); }
.cfc-spacer { flex: 1; }
.cfc-chevron { color: var(--color-text-secondary); }
.cfc-body { border-top: 1px solid color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent); padding: 8px 10px; }
.cfc-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
.cfc-empty { font-size: 12px; color: var(--color-text-secondary); padding: 4px 0; }
</style>
