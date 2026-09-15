<template>
  <Teleport to="body">
    <div
      v-if="media.viewerVisible && media.viewer"
      class="media-viewer-mask"
      @click.self="closeMediaViewer"
      @wheel.prevent="onWheel"
    >
      <div class="media-viewer-bar">
        <span class="media-viewer-name" :title="media.viewer.name">{{ media.viewer.name || '预览' }}</span>
        <span v-if="media.viewer.kind === 'image'" class="media-viewer-zoom">{{ Math.round(media.viewerZoom * 100) }}%</span>
        <span class="media-viewer-actions" @click.stop>
          <button class="mv-btn" title="缩小" @click="zoomMediaViewer(-0.25)">−</button>
          <button class="mv-btn" title="重置" @click="resetMediaViewerZoom">1:1</button>
          <button class="mv-btn" title="放大" @click="zoomMediaViewer(0.25)">+</button>
          <button class="mv-btn" title="另存为" @click="saveMediaAs(media.viewer)">另存为</button>
          <button class="mv-btn" title="复制" @click="copyMedia(media.viewer)">复制</button>
          <button class="mv-btn" title="关闭 (Esc)" @click="closeMediaViewer">关闭</button>
        </span>
      </div>
      <div class="media-viewer-stage">
        <img
          v-if="media.viewer.kind === 'image'"
          class="media-viewer-img"
          :src="media.viewer.src"
          :style="{ transform: `scale(${media.viewerZoom})` }"
          :alt="media.viewer.name || '图片'"
          draggable="false"
        />
        <video v-else class="media-viewer-video" :src="media.viewer.src" controls autoplay />
      </div>
      <div v-if="media.viewer.description" class="media-viewer-desc">{{ media.viewer.description }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
// 灯箱：只负责「看」与取用（另存为/复制）。导出 Word 是整轮响应结果的导出，
// 入口在助手回复的操作条上（ChatMessageList），不在这里重复。
import {
  useMediaPreview,
  closeMediaViewer,
  zoomMediaViewer,
  resetMediaViewerZoom,
  saveMediaAs,
  copyMedia,
} from '../../composables/useMediaPreview';

const { media } = useMediaPreview();

function onWheel(e: WheelEvent) {
  if (media.viewer?.kind !== 'image') return;
  zoomMediaViewer(e.deltaY < 0 ? 0.25 : -0.25);
}

function onKey(e: KeyboardEvent) {
  if (!media.viewerVisible) return;
  if (e.key === 'Escape') closeMediaViewer();
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.media-viewer-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(0, 0, 0, 0.86);
  display: flex;
  flex-direction: column;
}
.media-viewer-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 12.5px;
  flex-shrink: 0;
}
.media-viewer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46vw;
}
.media-viewer-zoom {
  color: rgba(255, 255, 255, 0.6);
  font-variant-numeric: tabular-nums;
}
.media-viewer-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.mv-btn {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.mv-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.4);
}
.media-viewer-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 8px;
}
.media-viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.12s ease;
  transform-origin: center center;
  user-select: none;
}
.media-viewer-video {
  max-width: 100%;
  max-height: 100%;
}
.media-viewer-desc {
  flex-shrink: 0;
  padding: 8px 14px 14px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  line-height: 1.6;
  max-height: 18vh;
  overflow-y: auto;
}
</style>
