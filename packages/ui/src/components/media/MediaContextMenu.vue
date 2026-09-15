<template>
  <Teleport to="body">
    <div v-if="media.menuVisible" class="media-ctx-layer" @click="closeMediaMenu" @contextmenu.prevent="closeMediaMenu">
      <ul class="media-ctx-menu" :style="{ left: media.menuX + 'px', top: media.menuY + 'px' }" @click.stop>
        <li v-if="media.menuTarget?.kind === 'image'" class="media-ctx-item" @click="run(openMediaViewer)">放大查看</li>
        <li v-else-if="media.menuTarget?.kind === 'video'" class="media-ctx-item" @click="run(openMediaViewer)">播放</li>
        <li v-if="media.menuTarget?.kind !== 'file'" class="media-ctx-sep"></li>
        <li class="media-ctx-item" @click="run(saveMediaAs)">另存为…</li>
        <li v-if="media.menuTarget?.path" class="media-ctx-item" @click="run(revealMedia)">打开所在目录</li>
        <li v-if="media.menuTarget?.kind === 'image'" class="media-ctx-item" @click="run(copyMedia)">复制图片</li>
        <li class="media-ctx-item" @click="run(copyMediaPath)">{{ media.menuTarget?.path ? '复制路径' : '复制地址' }}</li>
      </ul>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// 媒体右键菜单：只放「对这一个媒体文件」的操作。
// 导出 Word 是整轮响应结果的导出（含正文与全部附图），入口在助手回复的操作条上，
// 不属于单个媒体的操作，故不在此重复。
import {
  useMediaPreview,
  closeMediaMenu,
  openMediaViewer,
  saveMediaAs,
  revealMedia,
  copyMedia,
  copyMediaPath,
  type MediaTarget,
} from '../../composables/useMediaPreview';

const { media } = useMediaPreview();

/** 菜单项点击后统一关闭菜单 */
function run(action: (t: MediaTarget) => void | Promise<void>) {
  const target = media.menuTarget;
  closeMediaMenu();
  if (!target) return;
  void action(target);
}
</script>

<style scoped>
.media-ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 4100;
}
.media-ctx-menu {
  position: fixed;
  min-width: 168px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg, #fff);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}
.media-ctx-item {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
}
.media-ctx-item:hover {
  background: var(--glass-bg-hover);
}
.media-ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-border-tertiary, rgba(15, 23, 42, 0.08));
}
</style>
