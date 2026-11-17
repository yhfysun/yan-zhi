<template>
  <aside class="bap" aria-label="页面批注">
    <header class="bap-head">
      <div>
        <strong>页面批注</strong>
        <span>{{ annotations.length }} 条 · {{ draftCount }} 条待发送</span>
      </div>
      <button type="button" class="bap-icon" title="关闭批注侧栏" @click="$emit('close')">
        <el-icon><Close /></el-icon>
      </button>
    </header>

    <div v-if="!annotations.length" class="bap-empty">
      <p>还没有批注</p>
      <span>开启批注后点选元素、选中文字，或在页面空白处拖拽框选。</span>
    </div>

    <div v-else class="bap-list">
      <article v-for="(item, index) in annotations" :key="item.id" class="bap-item">
        <div class="bap-item-head">
          <span class="bap-index">{{ index + 1 }}</span>
          <span class="bap-kind">{{ kindLabel(item.type) }}</span>
          <span class="bap-status" :class="statusOf(item)">{{ statusLabel(item) }}</span>
          <span class="bap-label" :title="item.label">{{ item.label }}</span>
        </div>

        <p v-if="item.componentFile" class="bap-path">{{ item.componentFile }}</p>
        <p v-else-if="item.selector" class="bap-selector">{{ item.selector }}</p>
        <p class="bap-page">{{ pageHost(item.pageUrl) }}</p>

        <textarea
          v-if="editingId === item.id"
          v-model="draft"
          class="bap-editor"
          rows="3"
          placeholder="补充这条批注"
          @keydown.ctrl.enter.prevent="saveEdit(item)"
          @keydown.meta.enter.prevent="saveEdit(item)"
        ></textarea>
        <p v-else class="bap-comment">{{ item.comment }}</p>

        <div class="bap-actions">
          <button type="button" title="在页面中定位" @click="$emit('focus', item)">
            <el-icon><Aim /></el-icon>定位
          </button>
          <button v-if="editingId === item.id" type="button" class="is-primary" @click="saveEdit(item)">
            <el-icon><Check /></el-icon>保存
          </button>
          <button v-else type="button" @click="startEdit(item)">
            <el-icon><EditPen /></el-icon>编辑
          </button>
          <button
            v-if="statusOf(item) !== 'resolved'"
            type="button"
            @click="$emit('resolve', item)"
          >
            <el-icon><CircleCheck /></el-icon>解决
          </button>
          <button type="button" class="is-danger" @click="$emit('remove', item)">
            <el-icon><Delete /></el-icon>删除
          </button>
        </div>
      </article>
    </div>

    <footer v-if="annotations.length" class="bap-foot">
      <button type="button" @click="$emit('clear-draft')">清除待发送</button>
      <button type="button" class="is-danger" @click="$emit('clear-page')">清除本页全部</button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Aim, Check, CircleCheck, Close, Delete, EditPen } from '@element-plus/icons-vue';
import type { BrowserAnnotation, BrowserAnnotationStatus } from '@yan-zhi/shared';

const props = defineProps<{
  annotations: BrowserAnnotation[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'focus', item: BrowserAnnotation): void;
  (event: 'update', item: BrowserAnnotation, comment: string): void;
  (event: 'remove', item: BrowserAnnotation): void;
  (event: 'resolve', item: BrowserAnnotation): void;
  (event: 'clear-draft'): void;
  (event: 'clear-page'): void;
}>();

const editingId = ref('');
const draft = ref('');
const draftCount = computed(() =>
  props.annotations.filter((item) => (item.status || 'draft') === 'draft').length,
);

function statusOf(item: BrowserAnnotation): BrowserAnnotationStatus {
  return item.status || 'draft';
}

function statusLabel(item: BrowserAnnotation): string {
  const status = statusOf(item);
  if (status === 'sent') return '已发送';
  if (status === 'resolved') return '已解决';
  return '待发送';
}

function kindLabel(type: BrowserAnnotation['type']): string {
  if (type === 'text') return '文字';
  if (type === 'region') return '区域';
  return '元素';
}

function pageHost(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}

function startEdit(item: BrowserAnnotation) {
  editingId.value = item.id;
  draft.value = item.comment;
}

function saveEdit(item: BrowserAnnotation) {
  const comment = draft.value.trim();
  if (!comment) return;
  emit('update', item, comment);
  editingId.value = '';
  draft.value = '';
}
</script>

<style scoped>
.bap {
  width: 300px;
  flex: 0 0 300px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.bap-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.bap-head strong { display: block; font-size: 13px; color: var(--el-text-color-primary); }
.bap-head span { display: block; margin-top: 2px; font-size: 11px; color: var(--el-text-color-secondary); }
.bap-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.bap-icon:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
.bap-empty {
  flex: 1;
  display: grid;
  place-content: center;
  gap: 4px;
  padding: 24px;
  text-align: center;
}
.bap-empty p { margin: 0; font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.bap-empty span { max-width: 220px; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
.bap-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.bap-item {
  padding: 9px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid #f97316;
  border-radius: 8px;
}
.bap-item + .bap-item { margin-top: 8px; }
.bap-item-head { display: flex; align-items: center; gap: 5px; min-width: 0; }
.bap-index {
  width: 18px;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: #f97316;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.bap-kind,
.bap-status {
  flex: none;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 10px;
}
.bap-status.sent { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.bap-status.resolved { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.bap-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.bap-path,
.bap-selector {
  margin: 5px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
}
.bap-path { color: var(--el-color-primary); }
.bap-selector { color: var(--el-text-color-placeholder); }
.bap-page {
  margin: 3px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}
.bap-comment {
  margin: 7px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.bap-editor {
  width: 100%;
  box-sizing: border-box;
  margin-top: 7px;
  resize: vertical;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
}
.bap-editor:focus { border-color: var(--el-color-primary); }
.bap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 7px;
}
.bap-actions button,
.bap-foot button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  border-radius: 5px;
  padding: 3px 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 10.5px;
  cursor: pointer;
}
.bap-actions button:hover,
.bap-foot button:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
.bap-actions button.is-primary { color: var(--el-color-primary); }
.bap-actions button.is-danger:hover,
.bap-foot button.is-danger:hover { color: var(--el-color-danger); }
.bap-foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 7px 9px;
  border-top: 1px solid var(--el-border-color-lighter);
}
@media (max-width: 900px) {
  .bap { width: 260px; flex-basis: 260px; }
}
</style>
