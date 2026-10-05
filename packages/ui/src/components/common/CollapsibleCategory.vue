<template>
  <div class="cc">
    <span
      class="cc-tag"
      :class="{ collapsed }"
      @click="toggle"
    ><el-icon class="cc-arrow"><ArrowRight v-if="collapsed" /><ArrowDown v-else /></el-icon>{{ label }}<em v-if="count !== undefined">{{ count }}</em></span>
    <div v-show="!collapsed" class="cc-body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue';

const props = defineProps<{
  /** 分类名 */
  label: string;
  /** 条目计数；缺省不渲染 */
  count?: number;
  /** 折叠态（v-model:collapsed）；不传时组件内部自持 */
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:collapsed', v: boolean): void;
}>();

const inner = ref(false);
const collapsed = computed(() =>
  props.collapsed !== undefined ? props.collapsed : inner.value,
);

function toggle() {
  if (props.collapsed !== undefined) emit('update:collapsed', !collapsed.value);
  else inner.value = !inner.value;
}
</script>

<style scoped>
/* 分类折叠区块：短小 inline 标签 + 可折叠内容体 */
.cc { margin-bottom: 14px; }
.cc-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 12px; margin-bottom: 8px;
  font-size: var(--font-size-base); font-weight: 600; color: var(--color-text);
  cursor: pointer; user-select: none;
  background: transparent; border: 1px solid var(--color-border-light);
  /* 皮肤钩子：分类标签贴图由皮肤系统经 CSS 变量下发 */
  background-image: var(--skin-cat-tag-pattern, none); background-size: var(--skin-pattern-size, auto); background-repeat: var(--skin-pattern-repeat, repeat); background-position: center;
  border-radius: 16px; transition: all 0.15s;
}
.cc-tag:hover { border-color: var(--color-primary); color: var(--color-primary); }
.cc-tag.collapsed { opacity: 0.5; }
.cc-arrow { font-size: 12px; flex-shrink: 0; }
.cc-tag em { font-style: normal; font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-secondary); }
</style>
