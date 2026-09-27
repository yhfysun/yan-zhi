<template>
  <div class="audio-player" :class="{ compact }">
    <button
      class="ap-play"
      :title="playing ? '暂停' : '播放'"
      :aria-label="playing ? '暂停' : '播放'"
      @click="toggle"
    >
      <el-icon><VideoPause v-if="playing" /><VideoPlay v-else /></el-icon>
    </button>

    <div class="ap-main">
      <div v-if="name && !compact" class="ap-name" :title="name">{{ name }}</div>
      <div class="ap-track" @click="seekFromEvent" @mousedown="beginScrub">
        <div class="ap-track-bg"></div>
        <div class="ap-track-fill" :style="{ width: progressPct + '%' }"></div>
        <div class="ap-thumb" :style="{ left: progressPct + '%' }"></div>
      </div>
      <div class="ap-times">
        <span>{{ fmtTime(current) }}</span>
        <span class="ap-time-sep">/</span>
        <span>{{ duration ? fmtTime(duration) : '--:--' }}</span>
      </div>
    </div>

    <button class="ap-rate" :title="`播放速度（当前 ${rate}x）`" @click="cycleRate">{{ rate }}x</button>

    <button class="ap-download" title="另存为" aria-label="另存为" @click="$emit('save')">
      <el-icon><Download /></el-icon>
    </button>

    <!-- 真实媒体元素：隐藏但承担全部解码/播放职责 -->
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      @loadedmetadata="onLoadedMeta"
      @durationchange="onLoadedMeta"
      @timeupdate="onTimeUpdate"
      @play="playing = true"
      @pause="playing = false"
      @ended="onEnded"
      @error="onError"
    ></audio>
  </div>
</template>

<script setup lang="ts">
// 统一的音频播放器：消息媒体卡片、文件预览面板共用一套。
//
// 存在的理由（2026-09-27）：音频产物此前**完全没有播放 UI** ——
// 消息里 TTS 配音结果不渲染任何卡片，文件预览遇到 .wav/.mp3 直接落到
// 「暂不支持预览 + 用本机应用打开」。用户在应用内既看不见也听不到自己的配音产物。
//
// 播放互斥走 useAudioBus：一轮配音会产出几十条，不互斥会多路声音叠响。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { VideoPlay, VideoPause, Download } from '@element-plus/icons-vue';
import { registerAudio, unregisterAudio, pauseOtherAudio } from '../../composables/useAudioBus';

const props = withDefaults(defineProps<{
  src: string;
  name?: string;
  /** 紧凑态：媒体卡片用（不显示文件名条，高度更小） */
  compact?: boolean;
  /** 初始播放速度 */
  initialRate?: number;
}>(), { compact: false, initialRate: 1 });

const emit = defineEmits<{ (e: 'save'): void }>();

const audioEl = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const current = ref(0);
const duration = ref(0);
const rate = ref(props.initialRate);
const broken = ref(false);
/** 拖拽中：期间忽略 timeupdate，避免进度条被播放位置拽回去 */
const scrubbing = ref(false);

const RATES = [1, 1.25, 1.5, 2, 0.5];

const progressPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, Math.max(0, (current.value / duration.value) * 100));
});

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function onLoadedMeta() {
  const el = audioEl.value;
  if (!el) return;
  // 部分容器（如流式 wav）duration 先是 Infinity，durationchange 会再补一次
  duration.value = Number.isFinite(el.duration) ? el.duration : 0;
  broken.value = false;
}

function onTimeUpdate() {
  const el = audioEl.value;
  if (!el || scrubbing.value) return;
  current.value = el.currentTime;
  if (!duration.value && Number.isFinite(el.duration)) duration.value = el.duration;
}

function onEnded() {
  playing.value = false;
  current.value = 0;
  const el = audioEl.value;
  if (el) { try { el.currentTime = 0; } catch { /* 忽略 */ } }
}

function onError() {
  broken.value = true;
  playing.value = false;
}

async function toggle() {
  const el = audioEl.value;
  if (!el || broken.value) return;
  if (el.paused) {
    pauseOtherAudio(el);
    try {
      el.playbackRate = rate.value;
      await el.play();
    } catch { /* 自动播放策略拒绝或格式不支持 */ }
  } else {
    el.pause();
  }
}

function cycleRate() {
  const i = RATES.indexOf(rate.value);
  rate.value = RATES[(i + 1) % RATES.length];
  const el = audioEl.value;
  if (el) el.playbackRate = rate.value;
}

/** 按点击位置定位播放进度 */
function seekFromEvent(e: MouseEvent) {
  const el = audioEl.value;
  const bar = e.currentTarget as HTMLElement;
  if (!el || !duration.value || !bar) return;
  const r = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const t = ratio * duration.value;
  try { el.currentTime = t; } catch { /* 未就绪时忽略 */ }
  current.value = t;
}

/** 按下即开始拖拽：松手前不响应 timeupdate，拖动过程实时反映到进度条 */
function beginScrub(e: MouseEvent) {
  if (!duration.value) return;
  scrubbing.value = true;
  scrubMove(e);
  const move = (ev: MouseEvent) => scrubMove(ev);
  const up = () => {
    scrubbing.value = false;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function scrubMove(e: MouseEvent) {
  const el = audioEl.value;
  const bar = document.querySelector<HTMLElement>(`.audio-player .ap-track`);
  if (!el || !bar || !duration.value) return;
  const r = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const t = ratio * duration.value;
  current.value = t;
  try { el.currentTime = t; } catch { /* 未就绪时忽略 */ }
}

onMounted(() => {
  const el = audioEl.value;
  if (el) {
    el.playbackRate = rate.value;
    registerAudio(el);
    // ★★ 元数据可能**在挂载前就已加载完**（命中缓存 / preload 抢跑），
    //   此时 loadedmetadata 已经派发过，挂载后注册的监听器再也收不到 ——
    //   表现为「音频能播但时长一直显示 --:--」（2026-09-27 实测 readyState=4、
    //   duration 已就绪，而 UI 仍是 --:--）。这里按当前 readyState 补一次初始化。
    if (el.readyState >= 1) onLoadedMeta();
    // 已在播放（浏览器可能自动续播）时同步按钮状态
    if (!el.paused) playing.value = true;
  }
});

onBeforeUnmount(() => {
  const el = audioEl.value;
  if (el) {
    try { el.pause(); } catch { /* 忽略 */ }
    unregisterAudio(el);
  }
});
</script>

<style scoped>
.audio-player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--glass-border, var(--el-border-color-lighter));
  border-radius: 10px;
  background: var(--glass-bg, var(--el-bg-color));
  min-width: 0;
}
.audio-player.compact { padding: 6px 8px; gap: 8px; }

.ap-play {
  flex-shrink: 0;
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--el-color-primary, #7c3aed);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  /* ★ 图标（el-icon → svg）显式给尺寸，让组件自包含：
     正常环境里 ElementPlus 的 `.el-icon` 自带 1em 尺寸，不写也能显示；
     但宿主若未全局注册 ElementPlus（组件库被别处复用时会发生），
     `<el-icon>` 就成了未解析的自定义元素、svg 塌成 0×0（按钮变空白圆）。
     显式尺寸让本组件不依赖宿主的全局样式。 */
  padding: 0;
}
.ap-play > :deep(.el-icon),
.ap-play :deep(svg) {
  width: 17px;
  height: 17px;
  display: block;
}
.ap-play:hover { filter: brightness(1.08); }
.ap-play:active { transform: scale(0.94); }

.ap-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ap-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ap-track {
  position: relative;
  height: 14px;
  display: flex; align-items: center;
  cursor: pointer;
  user-select: none;
}
.ap-track-bg {
  position: absolute; left: 0; right: 0; height: 4px;
  border-radius: 2px;
  background: var(--el-border-color-lighter, rgba(15, 23, 42, 0.12));
}
.ap-track-fill {
  position: absolute; left: 0; height: 4px;
  border-radius: 2px;
  background: var(--el-color-primary, #7c3aed);
}
.ap-thumb {
  position: absolute;
  width: 10px; height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--el-color-primary, #7c3aed);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  pointer-events: none;
}
.ap-times {
  display: flex; gap: 3px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.ap-time-sep { opacity: 0.5; }

.ap-rate {
  flex-shrink: 0;
  min-width: 38px;
  padding: 2px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.ap-rate:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }

.ap-download {
  flex-shrink: 0;
  width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}
/* 同 .ap-play：显式给尺寸，不依赖宿主是否注册了 ElementPlus */
.ap-download :deep(svg) { width: 15px; height: 15px; display: block; }
.ap-download:hover { background: var(--el-fill-color-light); color: var(--el-color-primary); }
</style>