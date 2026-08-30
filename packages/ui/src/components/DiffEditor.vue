<template>
  <div ref="containerRef" class="diff-editor" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import { MergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSettingsStore } from '../stores/settings';

const props = withDefaults(defineProps<{
  original?: string;
  modified?: string;
  language?: 'javascript' | 'json' | 'markdown' | null;
  dark?: boolean;
}>(), {
  original: '',
  modified: '',
  language: null,
  dark: undefined,
});

const containerRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<MergeView | null>(null);
const settingsStore = useSettingsStore();

function langExtension() {
  switch (props.language) {
    case 'javascript': return javascript();
    case 'json': return json();
    case 'markdown': return markdown();
    default: return [];
  }
}

function isDark() {
  return props.dark !== undefined ? props.dark : settingsStore.settings.darkMode;
}

function buildView() {
  if (!containerRef.value) return;
  view.value?.destroy();
  const ext = [basicSetup, langExtension(), EditorView.editable.of(false)];
  if (isDark()) ext.push(oneDark);
  view.value = new MergeView({
    parent: containerRef.value,
    a: { doc: props.original, extensions: ext },
    b: { doc: props.modified, extensions: ext },
    gutter: true,
    highlightChanges: true,
  });
}

onMounted(buildView);
onBeforeUnmount(() => view.value?.destroy());
watch(() => [props.original, props.modified, props.language, isDark()], buildView);
</script>

<style scoped>
.diff-editor {
  height: 100%;
  overflow: hidden;
}
.diff-editor :deep(.cm-mergeView) {
  height: 100%;
  font-size: 13px;
}
.diff-editor :deep(.cm-scroller) {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}
</style>