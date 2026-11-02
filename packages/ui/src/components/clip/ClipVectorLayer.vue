<!--
  矢量图层实时合成层（P1-10 / 方案 4.3 的 C-1）。

  ★★★ 为什么要有这一层：代理视频只含「段画面」，不含字幕/贴纸（clip-proxy 派生工程时
    清空 texts/overlays/stickers/effects），所以矢图层必须在前端 DOM 上自己画。
    这样拖动贴纸/文字**不经过服务端**，松手才落盘 —— 这才是"真·实时"的手感。

  ★ 底座分工（诚实边界，UI 角标必须写明）：
    - live  模式：底图是服务端抽的合成帧（含画中画），本层只叠文字/贴纸；
                 画中画只给一个透明命中框用于拖动，松手后重取帧。
    - proxy 模式：底图是 480p 段代理，本层叠文字/贴纸，**并用第二个 <video> 独立播画中画**，
                 便于单独拖动/后续做独立控件。
    - clip  模式：不叠（成片里已经烤好）。

  ★ 所有坐标换算走 utils/clip-stage-geometry（与 clip-render 同口径，有单测钉住），
    这里只负责 DOM 事件与视频同步，不重新发明公式。
-->
<template>
  <div ref="rootEl" class="cp-vec">
    <!-- 画中画：proxy = 真 <video>；live = 透明命中框（画面本身已烤进底图） -->
    <div
      v-for="it in pipItems"
      :key="`ov-${it.id}`"
      class="cp-vec-item cp-vec-pip"
      :class="{ sel: it.id === selectedOverlayId }"
      :style="it.style"
      :title="pipMode === 'video' ? '拖动可改画中画位置' : '拖动改画中画位置（松手后重取预览帧）'"
      @pointerdown.prevent.stop="onItemDown($event, 'overlay', it.id)"
    >
      <!-- 视频叠 <video>；图片叠 <img>（导出对图片画中画是 -loop 1，没有时间轴可同步） -->
      <video
        v-if="!it.isImage"
        :ref="(el) => setPipEl(it.id, el as HTMLVideoElement | null)"
        class="cp-vec-media"
        :class="{ probe: pipMode !== 'video' }"
        :src="it.src"
        :preload="pipMode === 'video' ? 'auto' : 'metadata'"
        muted
        playsinline
        @loadedmetadata="onPipMeta(it.id, $event)"
      ></video>
      <img
        v-else
        class="cp-vec-media"
        :class="{ probe: pipMode !== 'video' }"
        :src="it.src"
        alt=""
        draggable="false"
        @load="onPipImgLoad(it.id, $event)"
      />
    </div>

    <!-- 贴纸（PNG/WebP，宽度按画面宽比例） -->
    <div
      v-for="it in stickerItems"
      :key="`st-${it.id}`"
      class="cp-vec-item cp-vec-sticker"
      :class="{ sel: it.id === selectedStickerId }"
      :style="it.style"
      title="拖动可改贴纸位置"
      @pointerdown.prevent.stop="onItemDown($event, 'sticker', it.id)"
    >
      <img class="cp-vec-media" :src="it.src" alt="" draggable="false" />
    </div>

    <!-- 文字（字号/描边/底板/字距/变换全部按 1920 基准还原） -->
    <div
      v-for="it in textItems"
      :key="`tx-${it.id}`"
      class="cp-vec-item cp-vec-text"
      :class="{ sel: it.id === selectedTextId }"
      :style="it.style"
      title="拖动可改文字位置"
      @pointerdown.prevent.stop="onItemDown($event, 'text', it.id)"
    >{{ it.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  buildLayerBoxCss, buildTextCss, hasOffsetMode, layerCenterPx, layerVisibleAt,
  layerWidthPx, localLayerT, round2, sampleLayerTf,
  type LayerKf, type LayerTf,
} from '../../utils/clip-stage-geometry';

export type VectorKind = 'text' | 'sticker' | 'overlay';

interface VecText {
  id: string; text: string; start: number; end: number;
  fontSizePx?: number; color?: string; outlineColor?: string; outlinePx?: number;
  backColor?: string; plateColor?: string; platePaddingPx?: number;
  letterSpacingPx?: number; lineSpacingPx?: number; fontFamily?: string;
  bold?: boolean; italic?: boolean; position?: string; safeArea?: boolean;
  transform?: LayerTf; keyframes?: LayerKf[];
}

interface VecSticker {
  id: string; file: string; start: number; end: number;
  scale?: number; x?: number; y?: number; rotation?: number; opacity?: number;
  keyframes?: LayerKf[];
}

interface VecOverlay {
  id: string; file: string; start: number; end: number;
  pos?: string; scale?: number; blend?: string;
  x?: number; y?: number; rotation?: number; opacity?: number;
  keyframes?: LayerKf[];
}

const props = defineProps<{
  /** 画面窗口尺寸（px）——父组件按 <img>/<video> 实际渲染框测量后传入 */
  boxWidth: number;
  boxHeight: number;
  playhead: number;
  texts: VecText[];
  stickers: VecSticker[];
  overlays: VecOverlay[];
  /** video = proxy 模式叠第二路 <video>；hit = live 模式只放透明命中框 */
  pipMode: 'video' | 'hit';
  playing: boolean;
  selectedTextId: string;
  selectedStickerId: string;
  selectedOverlayId: string;
  /** 工程内的本机绝对路径 → 浏览器可播的 URL（由父组件按会话/工程白名单生成） */
  srcOf: (file: string) => string;
}>();

const emit = defineEmits<{
  (e: 'select', kind: VectorKind, id: string): void;
  (e: 'commit', kind: VectorKind, id: string, x: number, y: number): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const box = computed(() => ({ width: props.boxWidth, height: props.boxHeight }));

/** 画中画固有宽高比（宽/高）。视频元数据到位前先按 16:9，避免上下锚点算不出位置。 */
const pipAspect = reactive<Record<string, number>>({});
const pipEls = new Map<string, HTMLVideoElement>();

function setPipEl(id: string, el: HTMLVideoElement | null) {
  if (!el) { pipEls.delete(id); return; }
  pipEls.set(id, el);
  // 播放中跨段/新图层挂载时立即接上：否则新挂的 <video> 会停在首帧（画面看起来"少了画中画"）
  if (props.playing && props.pipMode === 'video') {
    void el.play().catch(() => { /* 加载未就绪：元数据到位后由 onPipMeta 再同步 */ });
  }
}

function onPipMeta(id: string, ev: Event) {
  const v = ev.target as HTMLVideoElement;
  if (v?.videoWidth > 0 && v?.videoHeight > 0) pipAspect[id] = v.videoWidth / v.videoHeight;
  void nextTick(() => syncPips(true));
}

/** 图片画中画：宽高比来自自然尺寸（导出侧图片是 -loop 1，无需同步时间）。 */
function onPipImgLoad(id: string, ev: Event) {
  const img = ev.target as HTMLImageElement;
  if (img?.naturalWidth > 0 && img?.naturalHeight > 0) pipAspect[id] = img.naturalWidth / img.naturalHeight;
}

const IMG_FILE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

// ===== 拖动（松手才提交，拖动过程只改本地覆盖值） =====
interface DragState {
  kind: VectorKind; id: string;
  startClientX: number; startClientY: number;
  ox: number; oy: number;   // 指针按下时的中心（画面 px）
  cx: number; cy: number;   // 当前中心（画面 px）
  moved: boolean;
}
const drag = ref<DragState | null>(null);

const clampPx = (v: number, max: number) => Math.max(0, Math.min(max, v));

function dragging(kind: VectorKind, id: string): boolean {
  return !!drag.value && drag.value.kind === kind && drag.value.id === id;
}

function onItemDown(e: PointerEvent, kind: VectorKind, id: string) {
  emit('select', kind, id);
  if (e.button !== 0) return;
  const root = rootEl.value;
  const el = e.currentTarget as HTMLElement | null;
  if (!root || !el || !(props.boxWidth > 0) || !(props.boxHeight > 0)) return;
  const rr = root.getBoundingClientRect();
  const ir = el.getBoundingClientRect();
  const cx = clampPx(ir.left - rr.left + ir.width / 2, props.boxWidth);
  const cy = clampPx(ir.top - rr.top + ir.height / 2, props.boxHeight);
  drag.value = {
    kind, id, startClientX: e.clientX, startClientY: e.clientY,
    ox: cx, oy: cy, cx, cy, moved: false,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp, { once: true });
  window.addEventListener('pointercancel', onDragUp, { once: true });
}

function onDragMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  const dx = e.clientX - d.startClientX;
  const dy = e.clientY - d.startClientY;
  if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
  d.cx = clampPx(d.ox + dx, props.boxWidth);
  d.cy = clampPx(d.oy + dy, props.boxHeight);
}

function onDragUp() {
  const d = drag.value;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragUp);
  drag.value = null;
  if (!d || !d.moved) return;
  const x = d.cx / props.boxWidth - 0.5;
  const y = d.cy / props.boxHeight - 0.5;
  emit('commit', d.kind, d.id, x, y);
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragUp);
  pipEls.clear();
});

// ===== 图层列表（按播放头过滤 + 采样关键帧） =====
const textItems = computed(() => {
  if (!(props.boxWidth > 0) || !(props.boxHeight > 0)) return [];
  const out: Array<{ id: string; text: string; style: Record<string, string | number>; selected: boolean }> = [];
  for (const t of props.texts) {
    if (!layerVisibleAt(props.playhead, t.start, t.end)) continue;
    const sampled = sampleLayerTf(t.transform, t.keyframes, localLayerT(props.playhead, t.start, t.end));
    const r = buildTextCss(t, box.value, sampled);
    const style: Record<string, string | number> = { ...r.style };
    if (dragging('text', t.id) && drag.value) {
      // 拖动中强制走「中心定位」——落点就是指针位置，不改变字号/底板等排版
      delete style.bottom;
      style.left = `${round2(drag.value.cx)}px`;
      style.top = `${round2(drag.value.cy)}px`;
      style.transform = `translate(-50%, -50%) rotate(${round2(Number(sampled.eff.rotation ?? 0))}deg) scale(${Number(sampled.eff.scale ?? 1)})`;
      style.opacity = String(Math.max(0, Math.min(1, Number(sampled.eff.opacity ?? 1))));
    }
    out.push({ id: t.id, text: t.text, style, selected: t.id === props.selectedTextId });
  }
  return out;
});

const stickerItems = computed(() => {
  if (!(props.boxWidth > 0) || !(props.boxHeight > 0)) return [];
  const out: Array<{ id: string; src: string; style: Record<string, string | number> }> = [];
  for (const s of props.stickers) {
    if (!layerVisibleAt(props.playhead, s.start, s.end)) continue;
    const sampled = sampleLayerTf(s, s.keyframes, localLayerT(props.playhead, s.start, s.end));
    const width = layerWidthPx(props.boxWidth, s.scale ?? 0.3, sampled.kf.scale);
    const rotation = Number(sampled.eff.rotation ?? 0) || 0;
    const g = layerCenterPx({
      box: box.value, width, height: 0, anchor: 'center', rotation,
      hasOffset: hasOffsetMode(s, s.keyframes),
      offsetX: Number(sampled.eff.x ?? 0), offsetY: Number(sampled.eff.y ?? 0),
    });
    const cx = dragging('sticker', s.id) && drag.value ? drag.value.cx : g.cx;
    const cy = dragging('sticker', s.id) && drag.value ? drag.value.cy : g.cy;
    out.push({
      id: s.id,
      src: props.srcOf(s.file),
      style: buildLayerBoxCss({
        box: box.value, centerX: cx, centerY: cy, width,
        rotation, opacity: Number(sampled.eff.opacity ?? 1),
      }),
    });
  }
  return out;
});

const pipItems = computed(() => {
  if (!(props.boxWidth > 0) || !(props.boxHeight > 0)) return [];
  const out: Array<{ id: string; start: number; end: number; src: string; isImage: boolean; style: Record<string, string | number> }> = [];
  for (const o of props.overlays) {
    if (!layerVisibleAt(props.playhead, o.start, o.end)) continue;
    const sampled = sampleLayerTf(o, o.keyframes, localLayerT(props.playhead, o.start, o.end));
    const width = layerWidthPx(props.boxWidth, o.scale ?? 0.35, sampled.kf.scale);
    const aspect = pipAspect[o.id] || 16 / 9;
    const height = width / (Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9);
    const rotation = Number(sampled.eff.rotation ?? 0) || 0;
    const g = layerCenterPx({
      box: box.value, width, height, anchor: o.pos || 'bottomright', rotation,
      hasOffset: hasOffsetMode(o, o.keyframes),
      offsetX: Number(sampled.eff.x ?? 0), offsetY: Number(sampled.eff.y ?? 0),
    });
    const cx = dragging('overlay', o.id) && drag.value ? drag.value.cx : g.cx;
    const cy = dragging('overlay', o.id) && drag.value ? drag.value.cy : g.cy;
    out.push({
      id: o.id, start: o.start, end: o.end,
      src: props.srcOf(o.file),
      isImage: IMG_FILE_RE.test(o.file),
      style: buildLayerBoxCss({
        box: box.value, centerX: cx, centerY: cy, width, height,
        rotation, opacity: Number(sampled.eff.opacity ?? 1),
        blend: props.pipMode === 'video' ? o.blend : undefined,
      }),
    });
  }
  return out;
});

// ===== 画中画 <video> 与主时钟（playhead）同步 =====
/**
 * 只在漂移超阈值时 seek：逐帧写 currentTime 会让解码器反复重新定位（卡顿）。
 * 播放中阈值放宽（两路同速推进，漂移增长很慢）；暂停拖动播放头时阈值收紧（要跟手）。
 */
function syncPips(force = false) {
  if (props.pipMode !== 'video') return;
  for (const it of pipItems.value) {
    const v = pipEls.get(it.id);
    if (!v) continue;
    const srcDur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Number.POSITIVE_INFINITY;
    const target = Math.max(0, Math.min(props.playhead - it.start, srcDur - 0.02));
    const threshold = props.playing ? 0.35 : 0.08;
    if (force || Math.abs((v.currentTime || 0) - target) > threshold) {
      try { v.currentTime = target; } catch { /* 元数据未就绪：下一次同步再试 */ }
    }
  }
}

watch(() => props.playhead, () => { void nextTick(() => syncPips(false)); }, { flush: 'post' });
watch(() => props.playing, (p) => {
  if (props.pipMode !== 'video') return;
  for (const v of pipEls.values()) {
    if (p) void v.play().catch(() => { /* 浏览器策略/加载中断：静默，画面仍停在当前帧 */ });
    else v.pause();
  }
  if (p) void nextTick(() => syncPips(true));
}, { flush: 'post' });
watch(() => props.pipMode, () => {
  pipEls.clear();
  void nextTick(() => syncPips(true));
});
watch(() => pipItems.value.length, () => { void nextTick(() => syncPips(false)); }, { flush: 'post' });
</script>

<style scoped>
.cp-vec { position: absolute; inset: 0; overflow: hidden; pointer-events: none; user-select: none; z-index: 3; }
.cp-vec-item { position: absolute; cursor: grab; }
.cp-vec-item:active { cursor: grabbing; }
.cp-vec-item.sel { outline: 1px dashed rgb(96 165 250 / 92%); outline-offset: 3px; }
.cp-vec-item:hover:not(.sel) { outline: 1px dashed rgb(255 255 255 / 45%); outline-offset: 3px; }
.cp-vec-media { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
/* live 模式下只借 <video> 的元数据量宽高比（拿到后命中框才贴得住烤进底图的画面） */
.cp-vec-media.probe { opacity: 0; }
.cp-vec-sticker .cp-vec-media { height: auto; }
</style>
