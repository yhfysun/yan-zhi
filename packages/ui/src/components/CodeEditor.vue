<template>
  <div ref="containerRef" class="code-editor" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSettingsStore } from '../stores/settings';

const props = withDefaults(defineProps<{
  modelValue?: string;
  readOnly?: boolean;
  language?: 'javascript' | 'json' | 'markdown' | null;
  dark?: boolean;
}>(), {
  modelValue: '',
  readOnly: false,
  language: null,
  dark: undefined,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const containerRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const settingsStore = useSettingsStore();

const langCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

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

function buildExtensions() {
  return [
    basicSetup,
    langCompartment.of(langExtension()),
    themeCompartment.of(isDark() ? oneDark : []),
    readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString());
      }
    }),
  ];
}

onMounted(() => {
  if (!containerRef.value) return;
  view.value = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions: buildExtensions() }),
    parent: containerRef.value,
  });
});

onBeforeUnmount(() => {
  view.value?.destroy();
});

watch(() => props.modelValue, (val) => {
  const v = view.value;
  if (!v) return;
  if (v.state.doc.toString() === val) return;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: val } });
});

watch(() => props.language, () => {
  view.value?.dispatch({ effects: langCompartment.reconfigure(langExtension()) });
});

watch(() => isDark(), (dark) => {
  view.value?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) });
});

watch(() => props.readOnly, (ro) => {
  view.value?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(ro)) });
});
</script>

<style scoped>
.code-editor {
  height: 100%;
  overflow: hidden;
}
.code-editor :deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}
.code-editor :deep(.cm-scroller) {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}
</style>