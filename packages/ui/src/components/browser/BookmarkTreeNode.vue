<template>
  <div v-if="node.type === 'folder'" class="bm-node-folder">
    <button class="bm-node-row" :class="{ open: expanded }" @click="expanded = !expanded">
      <svg class="bm-node-caret" viewBox="0 0 24 24" width="12" height="12">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg class="bm-node-icon" viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
      </svg>
      <span class="bm-node-title">{{ node.title }}</span>
      <span v-if="childCount" class="bm-node-count">{{ childCount }}</span>
    </button>
    <div v-if="expanded" class="bm-node-children">
      <BookmarkTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        @open="emit('open', $event)"
      />
    </div>
  </div>
  <button
    v-else
    class="bm-node-row bm-node-url"
    :title="node.url"
    @click="emit('open', node.url || '')"
  >
    <span class="bm-node-favicon" :style="{ background: faviconColor }">{{ initial }}</span>
    <span class="bm-node-title">{{ node.title }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { countUrls, hostOfUrl, type BookmarkNode } from '../../utils/browserBookmarks';

const props = defineProps<{ node: BookmarkNode }>();
const emit = defineEmits<{ open: [url: string] }>();

const expanded = ref(false);
const childCount = computed(() => countUrls(props.node.children || []));
const initial = computed(() => {
  const label = props.node.title || hostOfUrl(props.node.url || '') || '?';
  return label.trim().slice(0, 1).toUpperCase();
});
const faviconColor = computed(() => {
  const host = hostOfUrl(props.node.url || '');
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) % 360;
  return `hsl(${hash}, 55%, 55%)`;
});
</script>

<style scoped>
.bm-node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--el-text-color-regular, #5f6368);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.bm-node-row:hover { background: rgba(0, 0, 0, 0.06); }
[data-theme="dark"] .bm-node-row:hover { background: rgba(255, 255, 255, 0.1); }
.bm-node-caret { flex-shrink: 0; transition: transform 0.15s; }
.bm-node-row.open .bm-node-caret { transform: rotate(90deg); }
.bm-node-icon { flex-shrink: 0; color: var(--el-color-warning, #e6a23c); }
.bm-node-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bm-node-count { flex-shrink: 0; font-size: 11px; opacity: 0.6; }
.bm-node-children { padding-left: 14px; }
.bm-node-favicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  flex-shrink: 0;
}
</style>
