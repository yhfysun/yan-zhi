<template>
  <div class="sv">
    <div v-for="s in sections" :key="s.label" class="sv-section">
      <span class="sv-label">{{ s.label }}</span>
      <pre class="sv-pre" :style="preStyle">{{ s.text }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface SchemaSection {
  /** 段标题（如「入参」「出参」「错误」） */
  label: string;
  /** 预格式化文本（通常是 JSON.stringify(schema, null, 2)） */
  text: string;
}

const props = withDefaults(
  defineProps<{
    /** 只读文本段列表 */
    sections: SchemaSection[];
    /** pre 块最大高度；number 按 px，string 原样（如 32vh） */
    maxHeight?: string | number;
  }>(),
  { maxHeight: '32vh' },
);

const preStyle = computed(() => ({
  maxHeight: typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight,
}));
</script>

<style scoped>
.sv {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.sv-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.sv-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.85;
}
.sv-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-text);
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: var(--font-size-sm);
  line-height: 1.55;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
/* 暗色主题下的默认底衬。
   ⚠️ 必须 :not([data-skin="on"])：`:root[data-theme="dark"] .sv-pre` 特指度 (0,2,0)
   会盖掉 skin.css 的 [data-skin="on"] .sv-pre (0,1,0)，且组件样式后加载 →
   皮肤下 pre 会回落到近乎透明的底，压在壁纸弹窗图上 = 文字不可读。 */
:root[data-theme="dark"]:not([data-skin="on"]) .sv-pre { background: rgba(255, 255, 255, 0.06); }
</style>
