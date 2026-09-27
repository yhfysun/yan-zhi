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
        <!-- ★★ 操作排：图标按钮（用户 2026-09-26 反馈「右上角的按钮有问题而且很丑，改成图标按钮」）。
             历史问题：这里是 6 个**文字**按钮（− / 1:1 / + / 另存为 / 复制 / 关闭）横排 + 不换行，
             375px 屏上一排总宽超屏 → 左侧的「−」被挤出可视区（表现为「缩小按钮没有」），
             而「1:1」是重置钮的文字标签、被误当成了比例显示（「比例一直是 1:1」）。
             现在：图标 + title 提示，缩放到一组、文件操作到一组，窄屏自动换行。 -->
        <span class="media-viewer-actions" @click.stop>
          <template v-if="media.viewer.kind === 'image'">
            <span class="mv-group">
              <button class="mv-icon-btn" title="缩小" aria-label="缩小" @click="zoomMediaViewer(-0.25)">
                <el-icon><ZoomOut /></el-icon>
              </button>
              <button class="mv-icon-btn mv-reset-btn" :title="`重置为 1:1（当前 ${Math.round(media.viewerZoom * 100)}%）`" aria-label="重置缩放" @click="resetMediaViewerZoom">1:1</button>
              <button class="mv-icon-btn" title="放大" aria-label="放大" @click="zoomMediaViewer(0.25)">
                <el-icon><ZoomIn /></el-icon>
              </button>
            </span>
          </template>
          <span class="mv-group">
            <button class="mv-icon-btn" title="另存为" aria-label="另存为" @click="saveMediaAs(media.viewer)">
              <el-icon><Download /></el-icon>
            </button>
            <button v-if="media.viewer.kind === 'image'" class="mv-icon-btn" title="复制图片" aria-label="复制图片" @click="copyMedia(media.viewer)">
              <el-icon><CopyDocument /></el-icon>
            </button>
          </span>
          <button class="mv-icon-btn mv-close-btn" title="关闭 (Esc)" aria-label="关闭" @click="closeMediaViewer">
            <el-icon><Close /></el-icon>
          </button>
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
import { ZoomIn, ZoomOut, Download, CopyDocument, Close } from '@element-plus/icons-vue';
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
  /* ★ 窄屏允许换行：操作排图标化后总宽已大幅收窄，但极端窄屏 / 长文件名下仍需兜底，
     换行比「把左侧按钮挤出屏幕」可接受（本条与 .media-viewer-actions 的 wrap 成对）。 */
  flex-wrap: wrap;
  row-gap: 6px;
}
.media-viewer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* ★ 收窄上限：原来 46vw 会把操作排一直往右顶；配合 min-width:0 让它先让位给按钮组 */
  max-width: min(46vw, 320px);
  min-width: 0;
}
.media-viewer-zoom {
  color: rgba(255, 255, 255, 0.6);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.media-viewer-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
/* 按钮分组：缩放到一组、文件操作到一组，中间一条细分隔线（视觉上不再是一排等权文字） */
.mv-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}
.mv-group + .mv-group { margin-left: 2px; }

/* 图标按钮：正方形 + 居中图标，title/aria-label 提供语义 */
.mv-icon-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.mv-icon-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.32);
}
.mv-icon-btn:active { transform: scale(0.94); }
/* 重置钮：文字 1:1 比图标更能表达「回到原始比例」，单独按文字宽度布局 */
.mv-reset-btn {
  width: auto;
  min-width: 34px;
  padding: 0 7px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}
.mv-close-btn:hover {
  background: rgba(239, 68, 68, 0.28);
  border-color: rgba(239, 68, 68, 0.55);
  color: #fff;
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
