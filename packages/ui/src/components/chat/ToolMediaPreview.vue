<template>
  <div class="tool-item-media">
    <!-- 图片：hover 唤起 body 级浮层原位放大（不占布局、不被容器裁剪）；单击选中（Ctrl+C 复制）、双击进灯箱（滚轮缩放）、右键媒体菜单 -->
    <img
      v-if="media.kind === 'image'"
      ref="mediaEl"
      class="tool-item-image"
      :src="media.src"
      :alt="media.name || '图片'"
      draggable="false"
      @click="select"
      @dblclick="zoom"
      @contextmenu="menu"
      @mouseenter="enter"
      @mouseleave="leave"
    />
    <!-- 视频卡片：静止显示首帧（#t=0.1 媒体片段 + preload=metadata 即渲染帧）；
         hover 唤起浮层放大并静音自动播 5 秒（浮层内播放，本体不动）；单击进灯箱全屏播放；
         右键走媒体菜单（播放/另存为/打开所在目录）。操作条已删——取用走右键菜单。 -->
    <video
      v-else-if="media.kind === 'video'"
      ref="mediaEl"
      class="tool-item-video"
      :src="srcWithFragment"
      preload="metadata"
      muted
      playsinline
      draggable="false"
      @click="zoom"
      @contextmenu="menu"
      @mouseenter="enter"
      @mouseleave="leave"
    ></video>
  </div>
</template>

<script setup lang="ts">
// 工具结果里的媒体产物预览（生图 / 生视频）。
//
// 卡片极简：只有媒体本体，不放文件名条与「另存为」按钮 —— 取用统一走右键菜单
// （另存为 / 打开所在目录 / 复制图片；放大查看走灯箱，滚轮缩放）。
//
// hover 放大走 MediaHoverFloat（body 级浮层）：消息容器有 overflow/contain 裁剪，
// 在容器内做 transform 放大必然被裁、还会扩大滚动区（撑高父盒子）——所以本体保持
// 原样不动，浮层按本体 getBoundingClientRect 复位放大 1.8x，pointer-events:none
// 纯视觉展示，移开即消失。
import { computed, ref } from 'vue';
import {
  openMediaViewer,
  openMediaMenu,
  selectMedia,
  openMediaHover,
  closeMediaHover,
  type MediaTarget,
} from '../../composables/useMediaPreview';

const props = defineProps<{ media: MediaTarget }>();

const mediaEl = ref<HTMLElement | null>(null);

/** 首帧显示：URL 追加 #t=0.1 媒体片段（无片段时），preload=metadata 即可渲染出画面 */
const srcWithFragment = computed(() => {
  const src = props.media.kind === 'video' ? props.media.src : '';
  if (!src || src.includes('#')) return src;
  return `${src}#t=0.1`;
});

function enter() {
  if (mediaEl.value) openMediaHover(mediaEl.value, props.media);
}
function leave() {
  closeMediaHover();
}
function select() {
  if (props.media.kind === 'image') selectMedia(props.media);
}
function zoom() {
  openMediaViewer(props.media);
}
function menu(e: MouseEvent) {
  e.preventDefault();
  openMediaMenu(e, props.media);
}
</script>

<style scoped>
.tool-item-media {
  margin-top: 6px;
}
.tool-item-image {
  max-height: 96px;
  max-width: min(220px, 100%);
  border-radius: 6px;
  border: 1px solid var(--glass-border);
  cursor: zoom-in;
  display: block;
  object-fit: contain;
  user-select: none;
}
.tool-item-video {
  max-height: 96px;
  max-width: min(220px, 100%);
  border-radius: 6px;
  border: 1px solid var(--glass-border);
  cursor: pointer;
  display: block;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.35);
  user-select: none;
}
</style>
