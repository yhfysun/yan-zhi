<!--
  效果卡片网格 —— 剪辑工作台里「效果库」的统一呈现。

  ★★★ 为什么要有这个组件（2026-10-21 用户：「剪辑模式可以向剪映、pr 靠齐…搞点效果库？」）：
    此前调色是 <select>、转场是 <select>、字幕模板是一排文字按钮 ——
    用户只能凭名字猜「暖阳」和「黄昏」差在哪。商用剪辑软件的效果面板之所以好用，
    前提就是**每个效果都有画面**。这里把注册表里的每一项渲染成"缩略图 + 名称"的卡片，
    转场卡片悬停播放真实过渡动效（服务端用 xfade 现渲的 1.2s 循环 mp4）。

  ★ 预览图来自 /api/clip/effect-preview（服务端用**导出同一套滤镜**渲染），
    不是另画的示意图 —— 卡片上看到的就是成片里的样子。

  ★ 懒加载：缩略图走 loading="lazy"（一次开面板要几十张，全量请求会明显卡）；
    转场视频只取 metadata，悬停才播。
-->
<template>
  <div class="ecg">
    <div v-for="g in groups" :key="g.group" class="ecg-group">
      <div v-if="groups.length > 1" class="ecg-gtitle">{{ g.group }}</div>
      <div class="ecg-grid">
        <button
          v-for="it in g.items"
          :key="it.id"
          type="button"
          class="ecg-card"
          :class="{ on: value === it.id, failed: failed.has(it.id) }"
          :title="it.desc ? `${it.label} — ${it.desc}` : it.label"
          @click="$emit('pick', it.id)"
          @mouseenter="cardEnter($event)"
          @mouseleave="cardLeave($event)"
        >
          <span class="ecg-thumb">
            <img
              v-if="!isMotion && !failed.has(it.id)"
              :src="urlOf(it.id)"
              :alt="it.label"
              loading="lazy"
              decoding="async"
              @load="markLoaded(it.id)"
              @error="markFailed(it.id)"
            />
            <video
              v-else-if="isMotion && ready.has(it.id) && !failed.has(it.id)"
              :src="urlOf(it.id)"
              muted
              loop
              playsinline
              preload="metadata"
              @loadeddata="markLoaded(it.id)"
              @error="onMediaError(it.id)"
            ></video>
            <span v-if="!loaded.has(it.id) && !failed.has(it.id)" class="ecg-shimmer"></span>
            <span v-if="failed.has(it.id)" class="ecg-noimg">无预览</span>
            <span v-if="value === it.id" class="ecg-check">✓</span>
          </span>
          <span class="ecg-label">{{ it.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue';
import { API_BASE, getLicenseCode } from '../../api/client';

const props = withDefaults(defineProps<{
  /** 预览种类（与 /api/clip/effect-preview 的 kind 一致） */
  kind: 'color' | 'fx' | 'mask' | 'style' | 'transition';
  /** 按 group 分好组的效果项（来自 @yan-zhi/shared 的效果库，单一真相源） */
  groups: Array<{ group: string; items: Array<{ id: string; label: string; desc?: string }> }>;
  /** 当前选中 id */
  value?: string;
  /** 会话 id：服务端据此取"当前工程画面"当样例；为空则用合成样张 */
  conversationId?: string;
  /** 缩略图尺寸（卡片宽度决定清晰度，默认 320×180） */
  width?: number;
  height?: number;
}>(), { value: '', conversationId: '', width: 320, height: 180 });

defineEmits<{ (e: 'pick', id: string): void }>();

/** 转场与动态特效出的是 mp4（悬停播放）；其余是单帧缩略图。 */
const isMotion = computed(() => props.kind === 'transition' || props.kind === 'fx');

/** 已加载 / 已失败的效果 id。失败只显示"无预览"，**不重试** —— 避免坏一次就刷屏请求。 */
const loaded = reactive(new Set<string>());
const failed = reactive(new Set<string>());
/**
 * 错峰挂载集合（只对 mp4 卡片）。
 * ★★★ 为什么不能一次性挂 13 个 <video>（2026-10-21 实测）：
 *   同时发 13 个 ffmpeg 渲染请求，浏览器会中止其中一部分 → 触发 error →
 *   卡片永久显示"无预览"（柔光/马赛克就中过招）。每批 3 个能稳定出首帧。
 */
const ready = reactive(new Set<string>());
/** 每个 id 已自动重试次数（最多 2 次；再多就是真坏了，显示"无预览"） */
const attempts = reactive(new Map<string, number>());

const allIds = computed(() => props.groups.flatMap((g) => g.items.map((i) => i.id)));

function staggerMount() {
  const ids = allIds.value;
  let i = 0;
  const tick = () => {
    for (const id of ids.slice(i, i + 2)) ready.add(id);
    i += 2;
    if (i < ids.length) setTimeout(tick, 250);
  };
  tick();
}
onMounted(staggerMount);

function urlOf(id: string): string {
  const code = getLicenseCode();
  const qs = code ? `&license=${encodeURIComponent(code)}` : '';
  // 重试时带 r=n：URL 变了浏览器才会丢掉上一次失败的缓存重新拉
  const n = attempts.get(id) || 0;
  const rq = n ? `&r=${n}` : '';
  return `${API_BASE}/clip/effect-preview?conversationId=${encodeURIComponent(props.conversationId || '')}` +
    `&kind=${props.kind}&id=${encodeURIComponent(id)}&w=${props.width}&h=${props.height}${rq}${qs}`;
}

function markLoaded(id: string) { loaded.add(id); }
function markFailed(id: string) { failed.add(id); }

/**
 * 动效加载失败 → 自动重试（最多 2 次）。
 * ★ 为什么会失败：首次打开面板要现渲十几条 mp4，并发下偶发被中断/超时；
 *   重试基本都能成功。两次仍失败才显示"无预览"。
 */
function onMediaError(id: string) {
  const n = attempts.get(id) || 0;
  if (n < 2) {
    attempts.set(id, n + 1);
    ready.delete(id);
    setTimeout(() => ready.add(id), 600 * (n + 1));
    return;
  }
  markFailed(id);
}

/** 悬停播/离开复位：转场卡片靠它出"动"的观感。 */
function cardEnter(e: MouseEvent) {
  const v = (e.currentTarget as HTMLElement | null)?.querySelector('video');
  if (v) { v.currentTime = 0; void v.play().catch(() => undefined); }
}
function cardLeave(e: MouseEvent) {
  const v = (e.currentTarget as HTMLElement | null)?.querySelector('video');
  if (v) { v.pause(); v.currentTime = 0; }
}

// 会话切换（换了工程 = 换了样例画面）时重置状态，否则会沿用上一个工程的"已加载"标记
watch(() => props.conversationId, () => {
  loaded.clear();
  failed.clear();
  attempts.clear();
  ready.clear();
  staggerMount();
});
</script>

<style scoped>
.ecg { display: flex; flex-direction: column; gap: 8px; }
.ecg-group { display: flex; flex-direction: column; gap: 4px; }
.ecg-gtitle {
  font-size: 10px; color: var(--el-text-color-secondary);
  letter-spacing: .04em; padding-left: 1px;
}
.ecg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
  gap: 6px;
}
.ecg-card {
  display: flex; flex-direction: column; gap: 3px;
  padding: 0; border: 0; background: none; cursor: pointer;
  text-align: left; font: inherit; color: inherit;
}
.ecg-thumb {
  position: relative; display: block; width: 100%;
  aspect-ratio: 16 / 9; overflow: hidden;
  border-radius: 5px; background: var(--el-fill-color);
  border: 1.5px solid transparent;
  transition: border-color .12s, transform .12s;
}
.ecg-card:hover .ecg-thumb { transform: translateY(-1px); border-color: var(--el-border-color-darker); }
.ecg-card.on .ecg-thumb { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
.ecg-thumb img, .ecg-thumb video {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.ecg-shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 12%), transparent);
  background-size: 200% 100%;
  animation: ecg-shimmer 1.1s ease-in-out infinite;
}
@keyframes ecg-shimmer { from { background-position: 150% 0 } to { background-position: -50% 0 } }
.ecg-noimg {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 10px; color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-light);
}
.ecg-check {
  position: absolute; right: 3px; top: 2px;
  width: 13px; height: 13px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 9px; line-height: 1; color: #fff;
  background: var(--el-color-primary);
}
.ecg-label {
  font-size: 11px; line-height: 1.2;
  color: var(--el-text-color-regular);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ecg-card.on .ecg-label { color: var(--el-color-primary); font-weight: 600; }
</style>
