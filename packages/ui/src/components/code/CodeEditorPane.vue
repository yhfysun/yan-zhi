<template>
  <div class="code-editor-wrap">
    <div ref="hostRef" class="code-editor-pane"></div>
    <canvas
      v-show="minimap"
      ref="minimapRef"
      class="code-minimap"
      @mousedown="onMinimapDown"
    ></canvas>
  </div>
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
  /** 是否显示右侧小地图（代码概览） */
  minimap?: boolean;
}>(), {
  value: '',
  fileName: '',
  readOnly: false,
  dark: undefined,
  breakpoints: () => [],
  activeLine: null,
  reveal: null,
  minimap: false,
});

const emit = defineEmits<{
  'update:value': [value: string];
  save: [];
  'toggle-breakpoint': [line: number];
  cursor: [{ line: number; col: number }];
  ready: [view: EditorView];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const minimapRef = ref<HTMLCanvasElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const settingsStore = useSettingsStore();

// 小地图重绘（rAF 节流）
let minimapRaf = 0;
let minimapObs: ResizeObserver | null = null;

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
          if (update.docChanged && !suppressEmit) {
            emit('update:value', update.state.doc.toString());
          }
          // 光标/选择变化 → 上报行列给状态栏（仅在确有变化时）
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            emit('cursor', { line: line.number, col: head - line.from + 1 });
          }
          scheduleMinimap();
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono, "JetBrains Mono", "Cascadia Code", Consolas, monospace)',
            lineHeight: '1.55',
            backgroundColor: 'transparent',
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

  // 小地图：滚动时更新视口指示，尺寸变化时重绘
  v.scrollDOM.addEventListener('scroll', scheduleMinimap, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    minimapObs = new ResizeObserver(() => scheduleMinimap());
    minimapObs.observe(v.scrollDOM);
  }
  void nextTick(scheduleMinimap);
});

onBeforeUnmount(() => {
  view.value?.scrollDOM.removeEventListener('scroll', scheduleMinimap);
  if (minimapRaf) cancelAnimationFrame(minimapRaf);
  minimapRaf = 0;
  minimapObs?.disconnect();
  minimapObs = null;
  view.value?.destroy();
  view.value = null;
});

// ===== 小地图（代码概览）=====
const MINIMAP_PAD = 3;
const MINIMAP_MAX_CHARS = 160;

function scheduleMinimap() {
  if (!props.minimap) return;
  if (minimapRaf) return;
  minimapRaf = requestAnimationFrame(() => {
    minimapRaf = 0;
    drawMinimap();
  });
}

function drawMinimap() {
  const v = view.value;
  const cv = minimapRef.value;
  if (!v || !cv) return;
  const cssW = cv.clientWidth;
  const cssH = cv.clientHeight;
  if (cssW < 8 || cssH < 10) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const doc = v.state.doc;
  const total = doc.lines;
  const pad = MINIMAP_PAD;
  const usableH = cssH - pad * 2;
  if (total <= 0 || usableH <= 0) return;

  // 行高自适应：行少时每行 2px，行多时等比压缩并采样
  const lineH = Math.min(2, usableH / total);
  const step = lineH >= 1 ? 1 : Math.max(1, Math.ceil(1 / lineH));
  const maxW = Math.max(1, cssW - pad * 2 - 4);
  const dark = isDark();
  ctx.fillStyle = dark ? 'rgba(200,200,200,0.40)' : 'rgba(90,90,90,0.40)';
  for (let n = 1; n <= total; n += step) {
    const len = doc.line(n).length;
    if (!len) continue;
    const w = Math.min(1, len / MINIMAP_MAX_CHARS) * maxW;
    if (w < 0.6) continue;
    const y = pad + (n - 1) * lineH;
    const h = Math.max(1, lineH * step - 0.4);
    ctx.fillRect(pad, y, w, h);
  }

  // 视口指示器
  const scroller = v.scrollDOM;
  const contentH = scroller.scrollHeight || 1;
  const viewH = scroller.clientHeight;
  const topRatio = Math.min(1, Math.max(0, scroller.scrollTop / contentH));
  const indH = Math.max(10, Math.min(usableH, (viewH / contentH) * usableH));
  const indY = pad + Math.min(usableH - indH, topRatio * usableH);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, indY, cssW, indH);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
  ctx.strokeRect(0.5, indY + 0.5, cssW - 1, indH - 1);
}

function onMinimapDown(e: MouseEvent) {
  const v = view.value;
  const cv = minimapRef.value;
  if (!v || !cv) return;
  const rect = cv.getBoundingClientRect();
  const pad = MINIMAP_PAD;
  const usableH = Math.max(1, rect.height - pad * 2);
  const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top - pad) / usableH));
  const total = v.state.doc.lines;
  const lineNo = Math.max(1, Math.min(total, Math.round(ratio * (total - 1)) + 1));
  const line = v.state.doc.line(lineNo);
  v.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  v.focus();
  scheduleMinimap();
}

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
  scheduleMinimap();
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
.code-editor-wrap {
  display: flex;
  height: 100%;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.code-editor-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--glass-bg, #fff);
}
.code-editor-pane :deep(.cm-editor) {
  height: 100%;
  background: transparent !important;
}
.code-editor-pane :deep(.cm-editor.cm-focused) {
  outline: none;
}
.code-editor-pane :deep(.cm-scroller) {
  background: transparent !important;
}
.code-editor-pane :deep(.cm-gutters) {
  background: transparent !important;
}
.code-minimap {
  flex: 0 0 74px;
  width: 74px;
  height: 100%;
  cursor: pointer;
  background: var(--glass-bg-hover, #f1efe9);
  border-left: 1px solid var(--glass-border, #e7e4dc);
  opacity: 0.85;
}
.code-minimap:hover { opacity: 1; }
</style>
