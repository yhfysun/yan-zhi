<template>
  <el-dialog
    v-model="visible"
    :title="title || '会话回放'"
    width="880px"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <div ref="hostEl" class="rec-term" />
    <div v-if="loadError" class="rec-error">{{ loadError }}</div>

    <div class="rec-bar">
      <el-button size="small" :disabled="!!loadError || !events.length" @click="toggle">{{ primaryLabel }}</el-button>
      <el-slider
        v-model="cursor"
        class="rec-slider"
        :max="duration || 0.001"
        :step="0.01"
        :format-tooltip="fmtClock"
        @change="onSeek"
      />
      <span class="rec-clock">{{ fmtClock(cursor) }} / {{ fmtClock(duration) }}</span>
      <el-select v-model="speed" size="small" class="rec-speed">
        <el-option v-for="s in SPEEDS" :key="s" :label="`${s}×`" :value="s" />
      </el-select>
    </div>

    <template #footer>
      <span class="rec-hint">
        按时间戳重放 PTY 输出；按键事件（命令审计用）与尺寸事件不参与回放，终端按当前窗口宽度渲染
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 会话回放器：把服务端解析好的 asciinema 事件按时间戳写进 xterm。
//
// 为什么自己实现而不是引 asciinema-player：① 不新增运行时依赖；
//   ② 回放本质上就是「按时间轴 term.write()」，xterm 本就在包里；
//   ③ 尺寸事件按容器宽度渲染（见下方注释），比原尺寸回放更适合嵌在对话框里。
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../../api/client';

export interface CastEvent { t: number; type: string; data: string }
interface PlayData { header: { width?: number; height?: number } | null; events: CastEvent[]; duration: number; skipped: number }

const SPEEDS = [1, 2, 4, 8];
/** 帧间隔：16ms ≈ 60fps，够跟手也不会把事件循环压满 */
const TICK_MS = 16;

const emit = defineEmits<{ (e: 'closed'): void }>();

const visible = ref(false);
const title = ref('');
const hostEl = ref<HTMLElement | null>(null);
const loadError = ref('');
const speed = ref(1);
const cursor = ref(0);
const duration = ref(0);
const playing = ref(false);
const ended = ref(false);
const events = ref<CastEvent[]>([]);

let term: Terminal | null = null;
let fit: FitAddon | null = null;
let idx = 0;
/** 播放基准：真实时钟起点与对应的录像时间点（用于倍速与中途起播） */
let baseWall = 0;
let baseOffset = 0;
let timer: number | null = null;

const primaryLabel = computed(() => (playing.value ? '暂停' : ended.value ? '重播' : '播放'));

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function ensureTerm(): void {
  if (term) return;
  const host = hostEl.value;
  if (!host) return;
  term = new Terminal({
    cursorBlink: false,
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    scrollback: 5000,
    disableStdin: true,
    theme: { background: '#141414', foreground: '#E5E5E0' },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  try { fit.fit(); } catch { /* 容器尚未布局 */ }
}

/** 把 idx 推进到 t 之前的所有事件（只重放输出） */
function writeUpTo(t: number): void {
  const list = events.value;
  while (idx < list.length && list[idx].t <= t) {
    const e = list[idx++];
    // 输入事件是给命令审计用的，回放时再写一遍会在屏幕上重复；
    // 尺寸事件忽略：容器宽度固定，按当时的行列 resize 反而会把布局撑坏。
    if (e.type === 'o') term?.write(e.data);
  }
}

function pause(): void {
  playing.value = false;
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
}

function tick(): void {
  if (!playing.value) return;
  const virtual = baseOffset + ((Date.now() - baseWall) / 1000) * speed.value;
  writeUpTo(virtual);
  cursor.value = Math.min(virtual, duration.value);
  if (idx >= events.value.length) {
    playing.value = false;
    ended.value = true;
    cursor.value = duration.value;
    timer = null;
    return;
  }
  timer = window.setTimeout(tick, TICK_MS);
}

function play(from = cursor.value): void {
  if (!events.value.length) return;
  if (from >= duration.value) { onSeek(0); return; }
  pause();
  baseWall = Date.now();
  baseOffset = from;
  ended.value = false;
  playing.value = true;
  timer = window.setTimeout(tick, TICK_MS);
}

function toggle(): void {
  if (playing.value) pause();
  else play();
}

/** 拖动进度条：清屏后快进重放到目标时间点（只在松手时触发，避免拖拽中反复重放） */
function onSeek(v: number): void {
  pause();
  term?.reset();
  idx = 0;
  writeUpTo(v);
  cursor.value = v;
  ended.value = v >= duration.value;
}

async function open(id: string, label: string): Promise<void> {
  title.value = label;
  loadError.value = '';
  visible.value = true;
  events.value = [];
  idx = 0;
  cursor.value = 0;
  duration.value = 0;
  ended.value = false;
  await nextTick();
  ensureTerm();
  term?.reset();

  const r = await api.get<PlayData>(`/plugin/ops-shell/recordings/${id}/play`);
  if ('error' in r) { loadError.value = r.error; return; }
  events.value = r.data.events || [];
  duration.value = r.data.duration || 0;
  if (!events.value.length) { loadError.value = '这条录像没有任何输出（会话可能刚连上就断了）'; return; }
  play(0);
}

function onClosed(): void {
  pause();
  try { term?.dispose(); } catch { /* ignore */ }
  term = null;
  fit = null;
  emit('closed');
}

onUnmounted(pause);

defineExpose({ open });
</script>

<style scoped>
.rec-term {
  height: 420px;
  padding: 6px;
  border-radius: 6px;
  overflow: hidden;
  background: #141414;
}
.rec-error { margin-top: 8px; font-size: 12px; color: var(--el-color-danger); }
.rec-bar { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.rec-slider { flex: 1; }
.rec-clock { flex-shrink: 0; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--color-text-secondary); }
.rec-speed { width: 78px; flex-shrink: 0; }
.rec-hint { font-size: 12px; color: var(--color-text-tertiary); }
</style>
