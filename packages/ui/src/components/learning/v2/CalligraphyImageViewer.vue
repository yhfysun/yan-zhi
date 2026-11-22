<script setup lang="ts">
// 书法真迹查看器：整张碑帖自由放大 / 拖拽平移 / 双击聚焦 / 移动端双指缩放。
// 设计准则：沉浸学习台内“需要时再显示辅助说明”，查看器默认整图呈现，不额外占阅读区；
// 触控目标 ≥44px（移动端）；缩放/平移以 pointer events 统一鼠标与触摸，无第三方依赖。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-vue-next';

type Props = {
  image: string;
  title: string;
  source?: string;
  /** 可选的初始聚焦位置（图片内相对坐标 0~100）；点范字时传入 */
  focus?: { x: number; y: number; width?: number; height?: number } | null;
};

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const STEP = 1.35;

const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const viewportEl = ref<HTMLElement | null>(null);
const imageEl = ref<HTMLImageElement | null>(null);
const dragging = ref(false);

// 单指/鼠标拖拽与双指 pinch 共用一组 pointer 状态
const pointers = new Map<number, { x: number; y: number }>();
let dragStart = { x: 0, y: 0, ox: 0, oy: 0 };
let pinchStart = { dist: 0, scale: 1, cx: 0, cy: 0 };

const transformStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}));
const zoomPercent = computed(() => Math.round(scale.value * 100));

function clampScale(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
}

/** 以视口内某点为锚点缩放：缩放后该点下的图片内容保持不动 */
function zoomAt(nextScaleRaw: number, anchorClientX?: number, anchorClientY?: number): void {
  const vp = viewportEl.value;
  if (!vp) return;
  const next = clampScale(nextScaleRaw);
  if (next === scale.value) return;
  const rect = vp.getBoundingClientRect();
  const ax = anchorClientX === undefined ? rect.left + rect.width / 2 : anchorClientX;
  const ay = anchorClientY === undefined ? rect.top + rect.height / 2 : anchorClientY;
  // 视口中心为坐标系原点时的锚点位置
  const px = ax - rect.left - rect.width / 2;
  const py = ay - rect.top - rect.height / 2;
  const ratio = next / scale.value;
  offsetX.value = px - (px - offsetX.value) * ratio;
  offsetY.value = py - (py - offsetY.value) * ratio;
  scale.value = next;
  clampOffset();
}

function zoomBy(factor: number): void {
  zoomAt(scale.value * factor);
}

function resetView(): void {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

/** 适应窗口：把整张真迹缩放/居中到刚好铺满视口（移动端首屏关键：一打开就看全图） */
function fitToViewport(): void {
  const vp = viewportEl.value;
  const img = imageEl.value;
  if (!vp || !img) return;
  const rect = vp.getBoundingClientRect();
  const naturalW = img.naturalWidth || img.clientWidth || 1;
  const naturalH = img.naturalHeight || img.clientHeight || 1;
  const fit = Math.min((rect.width * 0.92) / naturalW, (rect.height * 0.92) / naturalH);
  scale.value = clampScale(fit);
  offsetX.value = 0;
  offsetY.value = 0;
}

/** 平移边界夹紧：图片始终至少有一角留在视口内，避免拖到完全看不见 */
function clampOffset(): void {
  const vp = viewportEl.value;
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const margin = Math.min(rect.width, rect.height) * 0.4 * scale.value;
  const maxX = rect.width / 2 + margin;
  const maxY = rect.height / 2 + margin;
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value));
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value));
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  zoomAt(scale.value * (e.deltaY < 0 ? STEP : 1 / STEP), e.clientX, e.clientY);
}

function onDblClick(e: MouseEvent): void {
  if (Math.abs(scale.value - 1) < 0.01) zoomAt(2.5, e.clientX, e.clientY);
  else resetView();
}

function onPointerDown(e: PointerEvent): void {
  // 老 WebView 可能没有 setPointerCapture（移动端兼容）
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragging.value = true;
    dragStart = { x: e.clientX, y: e.clientY, ox: offsetX.value, oy: offsetY.value };
  } else if (pointers.size === 2) {
    dragging.value = false;
    const [a, b] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      scale: scale.value,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    // 以双指中点为锚点缩放
    const next = clampScale(pinchStart.scale * (dist / pinchStart.dist));
    const ratio = next / scale.value;
    if (ratio !== 1) {
      const vp = viewportEl.value;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const px = pinchStart.cx - rect.left - rect.width / 2;
      const py = pinchStart.cy - rect.top - rect.height / 2;
      offsetX.value = px - (px - offsetX.value) * ratio;
      offsetY.value = py - (py - offsetY.value) * ratio;
      scale.value = next;
      clampOffset();
    }
    return;
  }
  if (dragging.value) {
    offsetX.value = dragStart.ox + (e.clientX - dragStart.x);
    offsetY.value = dragStart.oy + (e.clientY - dragStart.y);
    clampOffset();
  }
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) dragging.value = false;
  else if (pointers.size === 1) {
    const [p] = [...pointers.values()];
    dragStart = { x: p.x, y: p.y, ox: offsetX.value, oy: offsetY.value };
    dragging.value = true;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key === '+' || e.key === '=') { zoomBy(STEP); e.preventDefault(); }
  else if (e.key === '-') { zoomBy(1 / STEP); e.preventDefault(); }
  else if (e.key === '0') { resetView(); e.preventDefault(); }
  else if (e.key.startsWith('Arrow')) {
    const d = 40;
    if (e.key === 'ArrowLeft') offsetX.value += d;
    else if (e.key === 'ArrowRight') offsetX.value -= d;
    else if (e.key === 'ArrowUp') offsetY.value += d;
    else if (e.key === 'ArrowDown') offsetY.value -= d;
    clampOffset();
    e.preventDefault();
  }
}

/** 把 focus 区域居中并放大到合适尺寸（点范字时定位，坐标容错） */
function applyFocus(f: Props['focus']): void {
  if (!f || f.x < 0 || f.x > 100 || f.y < 0 || f.y > 100) return;
  const target = f.width && f.width > 0 ? Math.min(MAX_SCALE, Math.max(2.2, 100 / f.width * 0.35)) : 3;
  scale.value = clampScale(target);
  // 相对坐标 → 视口偏移：让焦点落在视口中心
  offsetX.value = -(f.x - 50) / 100 * scale.value * 6;
  offsetY.value = -(f.y - 50) / 100 * scale.value * 6;
  clampOffset();
}

// ★ 组件由 v-if 挂载，focus 是初始 prop：watch 非 immediate 时首次不触发，
//   必须在 onMounted 里主动应用一次（否则点范字打开后仍是 100%，测试曾因此失败）。
onMounted(() => {
  applyFocus(props.focus);
});
watch(() => props.focus, (f) => { applyFocus(f); });

// 查看器是 fixed 全屏覆盖层：锁背景滚动，避免移动端拖动真迹时带动底层页面滚动。
let prevBodyOverflow = '';
onMounted(() => {
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
});
onBeforeUnmount(() => {
  pointers.clear();
  document.body.style.overflow = prevBodyOverflow;
});
</script>

<template>
  <div class="calligraphy-viewer" role="dialog" aria-modal="true" :aria-label="`真迹查看器：${title}`" @keydown="onKeydown">
    <header class="calligraphy-viewer-bar">
      <div class="calligraphy-viewer-title">
        <b>{{ title }}</b>
        <span v-if="source">{{ source }}</span>
      </div>
      <button type="button" class="calligraphy-viewer-close-top" aria-label="关闭查看器" @click="emit('close')"><X :size="20" /></button>
      <div class="calligraphy-viewer-tools">
        <button type="button" data-viewer="zoom-out" aria-label="缩小" @click="zoomBy(1 / STEP)"><Minus :size="16" /></button>
        <output data-viewer="zoom-level" aria-live="polite">{{ zoomPercent }}%</output>
        <button type="button" data-viewer="zoom-in" aria-label="放大" @click="zoomBy(STEP)"><Plus :size="16" /></button>
        <button type="button" data-viewer="reset" aria-label="复位 100%" @click="resetView"><RotateCcw :size="16" /></button>
        <button type="button" data-viewer="fullscreen" aria-label="适应窗口" @click="fitToViewport"><Maximize2 :size="16" /></button>
        <button type="button" data-viewer="close" aria-label="关闭查看器" @click="emit('close')"><X :size="16" /></button>
      </div>
    </header>
    <div
      ref="viewportEl"
      class="calligraphy-viewer-viewport"
      data-viewer="viewport"
      :class="{ 'is-dragging': dragging }"
      tabindex="0"
      @wheel="onWheel"
      @dblclick="onDblClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="calligraphy-viewer-stage" :style="transformStyle" data-viewer="stage">
        <img ref="imageEl" :src="image" :alt="`${title} 真迹扫描图`" draggable="false" data-viewer="image" />
      </div>
    </div>
    <footer class="calligraphy-viewer-hint">
      <span class="hint-desktop">滚轮 / 双指缩放 · 拖动平移 · 双击放大复位 · 方向键移动 · Esc 关闭</span>
      <span class="hint-mobile">双指缩放 · 拖动平移 · 双击放大</span>
    </footer>
  </div>
</template>

<style scoped>
.calligraphy-viewer {
  position: fixed; inset: 0; z-index: 4000; display: flex; flex-direction: column;
  background: rgba(18, 22, 20, .94); color: #f2f5f3;
}
.calligraphy-viewer-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-bottom: 1px solid rgba(255, 255, 255, .14);
}
.calligraphy-viewer-title { display: flex; flex-direction: column; min-width: 0; }
.calligraphy-viewer-title b { font-size: 14px; }
.calligraphy-viewer-title span { color: #a8b3ac; font-size: 10px; }
.calligraphy-viewer-close-top { display: none; }
.calligraphy-viewer-tools { display: flex; align-items: center; gap: 6px; }
.calligraphy-viewer-tools button {
  display: inline-grid; place-items: center; width: 40px; height: 40px;
  border: 1px solid rgba(255, 255, 255, .22); border-radius: 8px;
  background: rgba(255, 255, 255, .08); color: #f2f5f3; cursor: pointer;
}
.calligraphy-viewer-tools button:hover { background: rgba(255, 255, 255, .18); }
.calligraphy-viewer-tools output { min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; font-size: 12px; }
.calligraphy-viewer-viewport {
  flex: 1; min-height: 0; overflow: hidden; position: relative;
  display: grid; place-items: center; cursor: grab; touch-action: none; outline: none;
}
.calligraphy-viewer-viewport.is-dragging { cursor: grabbing; }
.calligraphy-viewer-stage { transform-origin: center center; will-change: transform; }
.calligraphy-viewer-stage img {
  display: block; max-width: min(92vw, 1400px); max-height: 78vh;
  object-fit: contain; user-select: none; -webkit-user-drag: none;
}
.calligraphy-viewer-hint {
  padding: 8px 14px; border-top: 1px solid rgba(255, 255, 255, .14);
  color: #a8b3ac; font-size: 10px; text-align: center;
}
.hint-mobile { display: none; }

/* 移动端：顶部只留标题 + 关闭；缩放工具吸底成拇指热区，按钮 ≥44px */
@media (max-width: 900px) {
  .calligraphy-viewer-bar { padding: calc(8px + env(safe-area-inset-top)) 10px 10px; gap: 8px; }
  .calligraphy-viewer-title b { font-size: 13px; }
  .calligraphy-viewer-title span { font-size: 9px; }
  .calligraphy-viewer-close-top {
    display: inline-grid; place-items: center; flex: 0 0 auto;
    width: 44px; height: 44px; margin-left: auto;
    border: 1px solid rgba(255, 255, 255, .22); border-radius: 10px;
    background: rgba(255, 255, 255, .08); color: #f2f5f3; cursor: pointer;
  }
  /* 顶部栏里的缩放工具组在移动端隐藏，改由下方吸底条承载 */
  .calligraphy-viewer-tools {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2;
    display: grid; grid-template-columns: repeat(4, 1fr) 1.2fr; align-items: center; gap: 6px;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid rgba(255, 255, 255, .16);
    background: rgba(18, 22, 20, .98);
  }
  .calligraphy-viewer-tools button { width: 100%; height: 48px; border-radius: 10px; }
  .calligraphy-viewer-tools output { min-width: 0; width: 100%; font-size: 13px; }
  /* 移动端不显示重复的关闭按钮（顶部已有） */
  .calligraphy-viewer-tools button[data-viewer="close"] { display: none; }
  /* 图片区与提示区给吸底条让位 */
  .calligraphy-viewer-stage img { max-width: 98vw; max-height: 70vh; }
  .calligraphy-viewer-hint {
    padding: 6px 10px 70px; font-size: 9px;
  }
  .hint-desktop { display: none; }
  .hint-mobile { display: inline; }
}
</style>
