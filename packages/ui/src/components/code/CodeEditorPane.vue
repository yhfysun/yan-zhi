<template>
  <div ref="hostRef" class="code-editor-pane"></div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { loadLanguage } from './codeLang';
import { breakpointGutter, syncBreakpoints, setActiveLine } from './cmBreakpoints';
import { useSettingsStore } from '../../stores/settings';

const props = withDefaults(defineProps<{
  /** 文件内容（受控） */
  value?: string;
  /** 文件名或路径，用于语言分派 */
  fileName?: string;
  readOnly?: boolean;
  dark?: boolean;
  /** 该文件的断点行号（1-based） */
  breakpoints?: number[];
  /** 调试命中行（1-based），null 清除 */
  activeLine?: number | null;
  /** 跳转请求：{ line, ts }，ts 变化即触发滚动 */
  reveal?: { line: number; column?: number; ts: number } | null;
}>(), {
  value: '',
  fileName: '',
  readOnly: false,
  dark: undefined,
  breakpoints: () => [],
  activeLine: null,
  reveal: null,
});

const emit = defineEmits<{
  'update:value': [value: string];
  save: [];
  'toggle-breakpoint': [line: number];
  ready: [view: EditorView];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const settingsStore = useSettingsStore();

const langCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

let suppressEmit = false;

function isDark() {
  return props.dark !== undefined ? props.dark : settingsStore.settings.darkMode;
}

onMounted(() => {
  if (!hostRef.value) return;
  const v = new EditorView({
    state: EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        Prec.highest(keymap.of([
          { key: 'Mod-s', run: () => { emit('save'); return true; }, preventDefault: true },
          { key: 'Mod-Shift-s', run: () => { emit('save'); return true; }, preventDefault: true },
        ])),
        keymap.of([indentWithTab]),
        langCompartment.of([]),
        themeCompartment.of(isDark() ? oneDark : []),
        readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly)),
        breakpointGutter({ onToggle: (line) => emit('toggle-breakpoint', line) }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || suppressEmit) return;
          emit('update:value', update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono, "JetBrains Mono", "Cascadia Code", Consolas, monospace)',
            lineHeight: '1.55',
          },
          '.cm-gutters': { borderRight: '1px solid var(--glass-border, #e7e4dc)', background: 'transparent' },
          '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--color-primary, #c2410c) 6%, transparent)' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-primary, #c2410c)' },
        }),
      ],
    }),
    parent: hostRef.value,
  });
  view.value = v;
  void applyLanguage(props.fileName);
  syncBreakpoints(v, props.breakpoints || []);
  emit('ready', v);
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});

async function applyLanguage(fileName: string) {
  const v = view.value;
  if (!v) return;
  const ext = await loadLanguage(fileName);
  if (view.value !== v) return; // 组件已卸载或已切换
  v.dispatch({ effects: langCompartment.reconfigure(ext ? [ext] : []) });
}

/** 外部内容变化（如重新读盘）→ 全量替换文档，并抑制回抛避免循环 */
watch(() => props.value, (val) => {
  const v = view.value;
  if (!v) return;
  if (v.state.doc.toString() === val) return;
  suppressEmit = true;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: val } });
  suppressEmit = false;
});

watch(() => props.fileName, (name) => void applyLanguage(name));

watch(() => isDark(), (dark) => {
  view.value?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) });
});

watch(() => props.readOnly, (ro) => {
  view.value?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(ro)) });
});

watch(() => props.breakpoints, (lines) => {
  if (view.value) syncBreakpoints(view.value, lines || []);
}, { deep: true });

watch(() => props.activeLine, (ln) => {
  if (view.value) setActiveLine(view.value, ln ?? null);
});

watch(() => props.reveal?.ts, async () => {
  const r = props.reveal;
  const v = view.value;
  if (!r || !v) return;
  await nextTick();
  const lineNo = Math.min(Math.max(r.line, 1), v.state.doc.lines);
  const line = v.state.doc.line(lineNo);
  const pos = line.from + Math.min(Math.max((r.column || 1) - 1, 0), line.length);
  v.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  });
  v.focus();
});

defineExpose({
  focus: () => view.value?.focus(),
  getView: () => view.value,
});
</script>

<style scoped>
.code-editor-pane {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-surface, #fff);
}
.code-editor-pane :deep(.cm-editor) {
  height: 100%;
}
.code-editor-pane :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
