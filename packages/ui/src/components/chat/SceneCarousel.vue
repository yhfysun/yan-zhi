<!--
  SceneCarousel.vue — 3D 循环场景轮播（openspec four-mode-workspace 决策 2）
  - N 张卡沿 Y 轴均分圆环（rotateY(i·θ) translateZ(R)），容器 perspective
  - 手动拖动（Pointer Events，鼠标 + 触摸统一）：angle += dx × 0.22
  - 惯性衰减（摩擦 0.94）+ 吸附最近卡位（260ms cubic 缯动）
  - 循环：角度累加不取模，无限正反向旋转
  - 不自动播放（无定时器、无 idle 自转）
  - 键盘：容器 tabindex=0，←/→ 转一档，Enter/空格 选中正面卡
  - 拖动 > 6px 视为拖拽，不触发点击
  - 降级（用户 2026-09-16 追加：「卡片宽度不够就变成轮播图或者按钮」）：
      容器 < 640px 或 prefers-reduced-motion → 横向 swipe 列表（scroll-snap），无 3D；
      < 400px → 卡片退化为图标+名称按钮行
  - ★ 卡片必须直接是 .stage 的子元素（不包一层容器）——
    中间层会断开 transform-style: preserve-3d 传递（历史坑：卡片叠在一起没立体感）
-->
<template>
  <div
    ref="rootEl"
    class="sc-root"
    :class="{ 'sc-root--reduced': reduced, 'sc-root--dense': dense }"
    tabindex="0"
    role="listbox"
    aria-label="场景选择"
    @keydown="onKeydown"
  >
    <!-- ===== 形态 1：3D 轮播（容器 ≥640px）===== -->
    <div v-if="mode === 'stage'" ref="stageWrapRef" class="sc-stage-wrap" :class="{ 'is-dragging': immediate }">
      <div class="sc-stage" :style="{ '--angle': angle + 'deg' }">
        <div
          v-for="(s, i) in scenes"
          :key="s.key"
          class="sc-card"
          :class="{
            'is-active': s.key === activeKey,
            'is-front': i === frontIndex,
          }"
          :style="{
            '--scene-color': s.color,
            transform: `rotateY(${i * theta}deg) translateZ(${radius}px)`,
            opacity: cardOpacity(i),
            filter: frontIndex >= 0 ? cardFilter(i) : undefined,
          }"
          role="option"
          :aria-selected="s.key === activeKey"
          @click="onCardClick(s, i, $event)"
        >
          <div class="sc-card-head">
            <span class="sc-card-icon"><el-icon :size="18"><component :is="s.icon" /></el-icon></span>
            <span class="sc-card-label">{{ s.label }}</span>
            <el-icon v-if="s.key === activeKey" class="sc-card-check"><Check /></el-icon>
          </div>
          <div class="sc-card-desc">{{ s.desc }}</div>
          <div class="sc-card-agent">
            <el-icon :size="10"><User /></el-icon>
            <span>{{ agentLabel(s.agentId) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 形态 2：横向卡片条（320~640px）—— 单行、不换行、隐藏滚动条、可拖动 ===== -->
    <div v-else-if="mode === 'strip'" ref="stripRef" class="sc-strip">
      <div
        v-for="s in scenes"
        :key="s.key"
        class="sc-card sc-strip-card"
        :class="{ 'is-active': s.key === activeKey }"
        :style="{ '--scene-color': s.color }"
        role="option"
        :aria-selected="s.key === activeKey"
        @click="emitPick(s.key)"
      >
        <div class="sc-card-head">
          <span class="sc-card-icon"><el-icon :size="16"><component :is="s.icon" /></el-icon></span>
          <span class="sc-card-label">{{ s.label }}</span>
          <el-icon v-if="s.key === activeKey" class="sc-card-check"><Check /></el-icon>
        </div>
        <div class="sc-card-desc">{{ s.desc }}</div>
      </div>
    </div>

    <!-- ===== 形态 3：按钮行（<320px）—— 单行、不换行、隐藏滚动条、可拖动 ===== -->
    <div v-else ref="stripRef" class="sc-btns">
      <button
        v-for="s in scenes"
        :key="s.key"
        type="button"
        class="sc-btn"
        :class="{ 'is-active': s.key === activeKey }"
        :style="{ '--scene-color': s.color }"
        :title="s.desc"
        @click="emitPick(s.key)"
      >
        <el-icon :size="13"><component :is="s.icon" /></el-icon>
        <span class="sc-btn-label">{{ s.label }}</span>
      </button>
    </div>

    <!-- 选中示例引导语：移到两种降级形态之下同样可用；固定占位高度避免布局跳动 -->
    <div ref="exRowRef" class="sc-ex-row" :class="{ 'is-empty': !activeScene }">
      <template v-if="activeScene">
        <button
          v-for="ex in activeScene.examples"
          :key="ex"
          type="button"
          class="sc-example"
          :style="{ '--scene-color': activeScene.color }"
          @click.stop="emitExample(ex)"
        >{{ ex }}</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import type { Component } from 'vue';
import { Check, User } from '@element-plus/icons-vue';

/**
 * 轮播场景的结构化类型：只依赖渲染所需字段，不绑死 scenes.ts 的 SceneKey。
 * 办公传 WELCOME_SCENES（SceneDef[]），开发模式传 DEV_TPLS（DevTpl[]），二者天然兼容。
 */
export interface CarouselScene {
  key: string;
  label: string;
  icon: Component;
  color: string;
  desc: string;
  agentId: string;
  examples: string[];
}

const props = withDefaults(defineProps<{
  scenes: CarouselScene[];
  activeKey: string;
  agentLabel: (id: string) => string;
  /** 紧凑尺寸：开发模式等空间较紧的场景用（卡片与字号整体小一号） */
  dense?: boolean;
}>(), { dense: false });

const emit = defineEmits<{
  (e: 'pick', key: string): void;
  (e: 'example', text: string): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const angle = ref(0); // 累加不取模（-∞ ~ +∞），天然无限正反向
const N = computed(() => Math.max(props.scenes.length, 1));
/** 容器实测宽度（ResizeObserver 写入）：半径自适应与降级判定都要用，故先声明 */
const containerW = ref(800);
const theta = computed(() => 360 / N.value);

// 半径自适应：既要让相邻卡不叠（下限 = 卡宽/2 / tan(π/N) × 留白），
// 又不能超出容器（上限 = 容器半宽）。卡片数量多时环形会变得很大，
// 若只按几何公式算固定半径，14 张卡时环宽可达 ~900px → 两侧卡片被裁切。
const cardW = computed(() => (props.dense ? 124 : 148));
const radius = computed(() => {
  const ideal = (cardW.value / 2) / Math.tan(Math.PI / N.value) * 1.42;
  // 可用半宽：容器宽的一半再留 12px 余量（给卡片自身宽度与阴影）
  const availHalf = Math.max(containerW.value, 320) / 2 - 18;
  // 上限 = 可用半宽；下限 = 卡宽 × 0.62（保证侧向卡仍能看见，不至于挤成一叠）
  return Math.round(Math.min(Math.max(ideal, cardW.value * 0.62), Math.max(availHalf, cardW.value * 0.62)));
});

// 正面卡索引：k = ((round(-angle/θ) % N) + N) % N
const frontIndex = computed(() => {
  const k = Math.round(-angle.value / theta.value);
  return ((k % N.value) + N.value) % N.value;
});

const activeScene = computed(() => props.scenes.find((s) => s.key === props.activeKey) || null);

// ===== 宽度降级（用户拍板 2026-09-16 二次确认）=====
// 容器不够宽时不要硬挤 3D 轮播（会横向溢出）：
//   ≥640px → 3D 轮播；240~640 → 横向卡片条（单行拖动，无滚动条）；<240 → 按钮行（单行拖动）
// 两者都**不换行**、**隐藏滚动条**、可用鼠标横向拖动（滚轮无法横向，故用指针拖动）。
// ★ 阈值 320 → 240（2026-09-17）：开发模式聊天列固定 420px，减去内边距后轮播容器实测 315px，
//   卡在旧的 320 阈值之下 → 直接掉到「按钮行」，用户完全看不到卡片、也就无从拖动
//   （表现为「开发里面卡片没有拖动效果」）。下调后 315px 走卡片条，卡片与拖动都回来了。
const reduced = ref(false);
const mode = computed<'stage' | 'strip' | 'buttons'>(() => {
  if (reduced.value) return 'strip';
  if (containerW.value >= 640) return 'stage';
  return containerW.value >= 240 ? 'strip' : 'buttons';
});

let ro: ResizeObserver | null = null;
let mql: MediaQueryList | null = null;

function refreshReduced() {
  reduced.value = !!mql?.matches;
}

onMounted(() => {
  if (rootEl.value) {
    ro = new ResizeObserver((entries) => {
      for (const en of entries) containerW.value = en.contentRect.width;
    });
    ro.observe(rootEl.value);
    containerW.value = rootEl.value.getBoundingClientRect().width || 800;
  }
  mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  refreshReduced();
  mql.addEventListener('change', refreshReduced);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  mql?.removeEventListener('change', refreshReduced);
  cancelAnimationFrame(raf);
});

// 挂 pointer 事件（addEventListener 对 pointer 事件的 ElementEventMap 类型不含 pointer* 键，
// 统一 cast 成 EventListener，运行时事件实例就是 PointerEvent）
// ★ 必须声明在下面的 watch(..., { immediate: true }) 之前，否则同步执行会命中 TDZ。
const PTR_EVENTS = [
  ['pointerdown', onPointerDown],
  ['pointermove', onPointerMove],
  ['pointerup', onPointerUp],
  ['pointercancel', onPointerUp],
] as Array<[string, (e: PointerEvent) => void]>;

function bindPointer(target: Element, add: boolean) {
  for (const [type, fn] of PTR_EVENTS) {
    if (add) target.addEventListener(type, fn as EventListener);
    else target.removeEventListener(type, fn as EventListener);
  }
}

// ===== 降级形态的「拖动横向滚动」挂载（须在 mode 定义之后）=====
/** strip / buttons 滚动容器（同一时刻只渲染一个，共用一个 ref） */
const stripRef = ref<HTMLElement | null>(null);
/** 3D 轮播的拖动宿主（形态会随容器宽度切换，故用 ref + watch 动态绑定） */
const stageWrapRef = ref<HTMLElement | null>(null);
let detachStrip: (() => void) | null = null;
let detachStage: (() => void) | null = null;
/** 示例行容器 */
const exRowRef = ref<HTMLElement | null>(null);
let detachEx: (() => void) | null = null;

watch([mode, stripRef], () => {
  detachStrip?.();
  detachStrip = null;
  if (mode.value !== 'stage' && stripRef.value) detachStrip = attachDragScroll(stripRef.value);
}, { flush: 'post', immediate: true });

/**
 * 3D 轮播的 pointer 绑定：**必须跟着形态走**。
 * 原实现只在 onMounted 里 querySelector 一次，而 .sc-stage-wrap 由 mode 决定是否渲染 ——
 * 开发模式（窄聊天列）挂载时是降级形态、用户拉宽窗口或切到 AI 居中后
 * 才出现 3D 轮播，此时绑定的旧元素已被卸载 → 卡片完全拖不动。
 * 现在改为 watch ref + mode，每次形态切换都重新绑定/解绑。
 */
watch([mode, stageWrapRef], () => {
  if (detachStage) { detachStage(); detachStage = null; }
  if (mode.value === 'stage' && stageWrapRef.value) {
    bindPointer(stageWrapRef.value, true);
    detachStage = () => bindPointer(stageWrapRef.value as Element, false);
  }
}, { flush: 'post', immediate: true });

watch([exRowRef, () => props.activeKey, mode], () => {
  detachEx?.();
  detachEx = null;
  if (exRowRef.value) detachEx = attachDragScroll(exRowRef.value);
}, { flush: 'post' });

onBeforeUnmount(() => {
  if (detachStage) { detachStage(); detachStage = null; }
  detachStrip?.(); detachEx?.();
  detachStrip = null; detachEx = null;
});

/** 横滑条拖动（strip / buttons 共用）：单向滚动，跟手，无滚动条。
 *  同时做「拖动 vs 点击」判定：位移 > 6px 的 pointerup 之后抑制一次 click，
 *  否则在卡片条上横拖会顺手选中松手位置下的那张卡（误操作）。 */
function attachDragScroll(el: HTMLElement) {
  let down = false; let startX = 0; let startLeft = 0; let dragged = false;
  const suppressClick = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
  const onDown = (e: PointerEvent) => {
    down = true; dragged = false; startX = e.clientX; startLeft = el.scrollLeft;
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) dragged = true;
    el.scrollLeft = startLeft - dx;
  };
  const onUp = () => {
    if (!down) return;
    down = false;
    if (dragged) {
      // 捕获阶段吞掉紧随其后的 click（卡片上的 @click 是冒泡阶段）
      el.addEventListener('click', suppressClick, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', suppressClick, true), 0);
    }
  };
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    el.removeEventListener('click', suppressClick, true);
  };
}

// ===== 视觉推导：透明度/灰度由法线与视线夹角（近似为 |rel|）决定 =====
function relAngle(i: number): number {
  // 卡片 i 当前朝向角 = i·θ + angle；取与 0° 的最短差
  const a = (i * theta.value + angle.value) % 360;
  const rel = ((a % 360) + 360) % 360;
  return rel > 180 ? rel - 360 : rel; // -180 ~ 180
}
function cardOpacity(i: number): number {
  const t = Math.min(Math.abs(relAngle(i)) / 180, 1);
  return 1 - t * 0.72;
}
function cardFilter(i: number): string | undefined {
  // |rel| > 92° 背向：变灰 + 不可点
  if (Math.abs(relAngle(i)) > 92) return 'saturate(0.55)';
  return undefined;
}

// ===== 拖动（Pointer Events 统一鼠标 + 触摸）=====
/**
 * 立即模式：拖动中 or 惯性滑行中。此期间关掉 CSS transform 过渡，
 * 由 JS 逐帧直接改 angle（跟手 / 顺滑）；其余时刻（吸附、键盘、外部选中）
 * 都靠 CSS transition 平滑过渡。
 */
const immediate = ref(false);
let lastX = 0;
let lastT = 0;
let vel = 0; // deg / ms
let moved = 0;
let raf = 0;

const DAMP = 0.22; // 阻尼：angle += dx × 0.22
const FRICTION = 0.94; // 惯性摩擦

function onPointerDown(e: PointerEvent) {
  if (reduced.value) return;
  cancelAnimationFrame(raf);
  immediate.value = true;
  moved = 0;
  lastX = e.clientX;
  lastT = performance.now();
  vel = 0;
  // ★ 不用 setPointerCapture：capture 会把后续 click 派发给捕获元素（wrap），
  //   卡片上的 @click 永远不触发 —— 这就是「单击没用」的真根因。
  //   改挂 window 监听，move/up 照样收得到，click 仍正常落在卡片上。
  window.addEventListener('pointermove', onWinPointerMove);
  window.addEventListener('pointerup', onWinPointerUp);
  window.addEventListener('pointercancel', onWinPointerUp);
}

function onWinPointerMove(e: PointerEvent) { onPointerMove(e); }
function onWinPointerUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onWinPointerMove);
  window.removeEventListener('pointerup', onWinPointerUp);
  window.removeEventListener('pointercancel', onWinPointerUp);
  onPointerUp(e);
}

function onPointerMove(e: PointerEvent) {
  if (!immediate.value) return;
  const now = performance.now();
  const dx = e.clientX - lastX;
  moved += Math.abs(dx);
  angle.value += dx * DAMP;
  const dt = Math.max(now - lastT, 1);
  vel = (dx * DAMP) / dt;
  lastX = e.clientX;
  lastT = now;
}

function onPointerUp(e: PointerEvent) {
  if (!immediate.value) return;
  if (Math.abs(vel) > 0.02) inertia();
  else { immediate.value = false; snap(); }
  // 点击判定用的 moved 延后一帧复位：click 在 pointerup 之后同帧派发，
  // 立即清零会让「拖动后松手落在卡片上」误触发选中。
  requestAnimationFrame(() => { moved = 0; });
}

function inertia() {
  const step = () => {
    vel *= FRICTION;
    angle.value += vel * 16; // 每帧 16ms 近似
    if (Math.abs(vel) > 0.02) raf = requestAnimationFrame(step);
    // ★ 惯性结束必须回到非立即态：否则 .is-dragging 常驻、CSS transition 永久关闭，
    //   后续吸附/键盘/外部选中的转动全变成生硬跳变（实测：拖动一次后转场动画再不复现）。
    else { immediate.value = false; snap(); }
  };
  raf = requestAnimationFrame(step);
}

// 吸附到最近卡位：直接落位，平滑由 CSS transition 承担（拖动中已关过渡）
function snap() {
  const target = Math.round(-angle.value / theta.value) * -theta.value;
  angle.value = target;
}

// ===== 点击 / 键盘 =====
/**
 * 点卡片：正面卡直接选中；侧向卡先转到该卡（CSS transition 平滑）再选中。
 * 背向卡（|rel|>92°，视觉上已不可见）忽略 —— 双面卡投影仍可能命中点击。
 */
function onCardClick(s: CarouselScene, i: number, e: MouseEvent) {
  if (moved > 6) return; // 拖动 > 6px 不触发点击
  e.stopPropagation();
  if (Math.abs(relAngle(i)) > 92) return;
  if (i !== frontIndex.value) {
    const target = -i * theta.value;
    const nearest = target - Math.round((target - angle.value) / 360) * 360;
    cancelAnimationFrame(raf);
    immediate.value = false; // 交给 CSS transition
    angle.value = nearest;
  }
  emitPick(s.key);
}

function emitPick(key: string) {
  emit('pick', key);
}

function emitExample(text: string) {
  emit('example', text);
}

function onKeydown(e: KeyboardEvent) {
  if (reduced.value) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    cancelAnimationFrame(raf);
    immediate.value = false; // 交给 CSS transition
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    angle.value = (Math.round(-angle.value / theta.value) - dir) * -theta.value;
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const s = props.scenes[frontIndex.value];
    if (s) emitPick(s.key);
  }
}

// 选中场景变化 → 平滑转到该卡（外部程序化调用 setScene 时）
watch(() => props.activeKey, (k) => {
  if (!k || reduced.value) return;
  const i = props.scenes.findIndex((s) => s.key === k);
  if (i < 0 || immediate.value) return;
  const target = -i * theta.value;
  // 取与当前角度最近的等价角（循环语义）
  const nearest = target - Math.round((target - angle.value) / 360) * 360;
  if (Math.abs(nearest - angle.value) < 0.5) return;
  cancelAnimationFrame(raf);
  angle.value = nearest; // 交给 CSS transition 平滑
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
});

defineExpose({
  /** 程序化转到指定卡 */
  rotateTo(key: string) {
    const i = props.scenes.findIndex((s) => s.key === key);
    if (i >= 0) angle.value = -i * theta.value;
  },
});
</script>

<style scoped>
.sc-root {
  outline: none;
  min-width: 0;
}

/* ===== 3D 轮播 ===== */
.sc-stage-wrap {
  position: relative;
  perspective: 1200px;
  perspective-origin: 50% 42%;
  /* 上下留出透视余量，避免 3D 放大后的卡片贴住相邻文字 */
  padding: 12px 0 10px;
  touch-action: pan-y; /* 横向拖动归轮播，纵向留给页面滚动 */
}

.sc-stage {
  position: relative;
  /* 高度须容下「卡片高度 × 透视放大 ≈1.11」：card 100 → ≈111px，给 118px 余量。
     曾经设 106px 导致侧向卡片溢出、压住下方示例文字。 */
  height: 118px;
  margin: 0 auto;
  width: 172px;
  transform-style: preserve-3d;
  transform: rotateY(var(--angle));
  /* 变换动画（用户要求）：吸附/键盘/外部选中的平滑转动。
     拖动期间由 JS 直接改 angle（无过渡），因此拖动跟手不粘滞。 */
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 拖动进行中：关掉过渡，保证跟手 */
.sc-stage-wrap.is-dragging .sc-stage {
  transition: none;
}

.sc-card {
  position: absolute;
  left: 0;
  top: 0;
  width: 148px;
  height: 100px;
  padding: 10px 10px 8px;
  border-radius: 12px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--el-bg-color, #fff);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  backface-visibility: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.sc-card.is-front:not(.is-active) {
  border-color: color-mix(in srgb, var(--scene-color) 45%, var(--glass-border, rgba(15, 23, 42, 0.1)));
}

.sc-card.is-active {
  border-color: var(--scene-color);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--scene-color) 22%, transparent);
}

/* 背向卡由 backface-visibility: hidden 隐藏；侧向可见卡可点（点了转到正面并选中） */

.sc-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sc-card-icon {
  width: 24px; height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: var(--scene-color);
  background: color-mix(in srgb, var(--scene-color) 12%, transparent);
}

.sc-card-label {
  flex: 1;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-card-check { color: var(--scene-color); flex-shrink: 0; }

.sc-card-desc {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--el-text-color-secondary, #64748b);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sc-card-agent {
  position: absolute;
  left: 10px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  color: var(--scene-color);
  opacity: 0.85;
  white-space: nowrap;
  max-width: 124px;
  overflow: hidden;
}

/* 选中场景的示例引导语：固定占位高度 + 单行不换行 + 无滚动条可拖动
   （曾因 v-if 动态增删导致点卡片后整个轮播区往上跳；也曾在窄宽时换行撑高）
   ★ 水平居中：内容不足一行时用 justify-content: center 居中；
     超出一行时 center 会导致左端被裁（无法滚到），故用 auto 边距方案：
     justify-content 保持 flex-start，靠 margin:auto 在「无溢出」时居中、
     有溢出时退化为正常起始对齐（现代浏览器的 safe center 行为）。 */
.sc-ex-row {
  display: flex;
  flex-wrap: nowrap;              /* 单行，不换行 */
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  margin-top: 14px;               /* 与卡片拉开距离 */
  min-height: 32px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  cursor: grab;
}
/* 居中：无溢出时两端留白相等；有溢出时不影响横向滚动可达性 */
.sc-ex-row > .sc-example:first-child { margin-left: auto; }
.sc-ex-row > .sc-example:last-child { margin-right: auto; }
.sc-ex-row::-webkit-scrollbar { display: none; }
.sc-ex-row:active { cursor: grabbing; }
.sc-ex-row.is-empty { visibility: hidden; }

.sc-example {
  all: unset;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular, #475569);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px dashed var(--glass-border, rgba(15, 23, 42, 0.14));
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.sc-example:hover {
  background: color-mix(in srgb, var(--scene-color) 10%, transparent);
  color: var(--scene-color);
  border-color: color-mix(in srgb, var(--scene-color) 40%, transparent);
}

.sc-examples-fade-enter-active,
.sc-examples-fade-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.sc-examples-fade-enter-from,
.sc-examples-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* ===== 形态 2：横向卡片条（单行 · 不换行 · 无滚动条 · 拖动横向滚动）===== */
.sc-strip {
  display: flex;
  flex-wrap: nowrap;            /* 绝不换行 */
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;        /* Firefox 隐藏滚动条 */
  -ms-overflow-style: none;
  padding: 2px 0 6px;
  cursor: grab;
  touch-action: pan-y;
}
.sc-strip::-webkit-scrollbar { display: none; }  /* Chromium 隐藏滚动条 */
.sc-strip:active { cursor: grabbing; }
.sc-strip-card {
  position: relative;
  flex: 0 0 auto;               /* 关键：不收缩，才能横向滚动 */
  width: 148px;
  height: 104px;
  opacity: 1;
  filter: none;
}
/* 窄容器（如开发模式 420px 聊天列）里卡片条也用紧凑尺寸，一屏能看到约 2 张卡 */
.sc-root--dense .sc-strip-card { width: 124px; height: 88px; }

/* ===== 形态 3：按钮行（单行 · 不换行 · 无滚动条 · 拖动横向滚动）===== */
.sc-btns {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 2px;
  cursor: grab;
  touch-action: pan-y;
}
.sc-btns::-webkit-scrollbar { display: none; }
.sc-btns:active { cursor: grabbing; }
.sc-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.12));
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #475569);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.sc-btn:hover {
  border-color: var(--scene-color, var(--color-primary));
  color: var(--scene-color, var(--color-primary));
}
.sc-btn.is-active {
  border-color: var(--scene-color, var(--color-primary));
  color: var(--scene-color, var(--color-primary));
  background: color-mix(in srgb, var(--scene-color, var(--color-primary)) 10%, transparent);
  font-weight: 600;
}
.sc-btn-label { white-space: nowrap; }

/* ===== prefers-reduced-motion：只关掉动画，保留 3D 排布 ===== */
.sc-root--reduced .sc-stage { transition: none; }
.sc-root--reduced .sc-card { transition: none; }

/* ===== 紧凑尺寸（dense，开发模式用）——整体小一号 + 间距收紧 =====
   ️ stage 高度必须容下「卡片高度 × 透视放大系数」：
   perspective 1200 + translateZ(radius≈123) → 视觉放大 ≈1.11×，
   card 80 → 视觉 ≈89px，故 stage 给 100px 留余量，否则卡片溢出压住下方示例文字。 */
.sc-root--dense .sc-stage { width: 146px; height: 100px; }
.sc-root--dense .sc-card { width: 124px; height: 80px; padding: 8px 9px 6px; border-radius: 11px; }
.sc-root--dense .sc-card-icon { width: 20px; height: 20px; border-radius: 6px; }
.sc-root--dense .sc-card-icon :deep(svg) { width: 14px; height: 14px; }
.sc-root--dense .sc-card-label { font-size: 11.5px; }
.sc-root--dense .sc-card-desc { margin-top: 4px; font-size: 9.5px; }
.sc-root--dense .sc-card-agent { left: 9px; bottom: 5px; font-size: 9px; max-width: 104px; }
.sc-root--dense .sc-ex-row { margin-top: 4px; min-height: 24px; }
.sc-root--dense .sc-example { font-size: 11px; padding: 3px 9px; }
.sc-root--dense .sc-stage-wrap { padding: 0; }
</style>