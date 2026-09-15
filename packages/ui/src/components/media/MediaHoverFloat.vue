<template>
  <Teleport to="body">
    <div v-if="media.hoverVisible && media.hoverTarget" class="media-hover-float" aria-hidden="true">
      <!-- 图片浮层：按缩略图矩形放大复位，纯视觉（pointer-events:none），不接交互 -->
      <img
        v-if="media.hoverTarget.kind === 'image'"
        class="media-hover-float-img"
        :src="media.hoverTarget.src"
        :alt="media.hoverTarget.name || '图片'"
        :style="floatStyle"
        draggable="false"
      />
      <!-- 视频浮层：hover 进入即静音自动播，5 秒后停（hoverPlaying 由 composable 控制） -->
      <video
        v-else
        class="media-hover-float-video"
        :src="videoSrc"
        :style="floatStyle"
        preload="metadata"
        muted
        playsinline
        draggable="false"
      ></video>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// 媒体 hover 浮层（body 级）。
//
// 为什么不在缩略图上做 transform 放大：消息容器有 overflow-x:hidden /
// .agent-process-steps 有 max-height+overflow-y:auto+contain:content —— 容器内放大
// 必然被裁剪、还会把滚动区撑大（用户看到的是「父盒子高度被影响」「被主智能体卡片盖住」）。
// 浮层渲染在 body 上彻底脱离这些容器：位置按缩略图 getBoundingClientRect 复位，
// pointer-events:none 不挡任何操作，移开即消失（closeMediaHover）。
import { computed, watch } from 'vue';
import { useMediaPreview, HOVER_SCALE, HOVER_FLOAT_AR } from '../../composables/useMediaPreview';

const { media } = useMediaPreview();

/** 首帧显示：视频地址补 #t=0.1 媒体片段 */
const videoSrc = computed(() => {
  const src = media.hoverTarget?.kind === 'video' ? media.hoverTarget.src : '';
  if (!src || src.includes('#')) return src;
  return `${src}#t=0.1`;
});

/** 浮层几何：由 composable 钳制好位置，这里只算宽高 */
const floatStyle = computed(() => {
  const w = media.hoverW * HOVER_SCALE;
  const h = media.hoverTarget?.kind === 'video' ? w / HOVER_FLOAT_AR : media.hoverH * HOVER_SCALE;
  return {
    left: `${media.hoverX}px`,
    top: `${media.hoverY}px`,
    width: `${w}px`,
    height: `${h}px`,
  };
});

// 浮层播放控制：hoverPlaying=true 时播，false/关闭时停回首帧
watch(
  () => [media.hoverVisible, media.hoverPlaying] as const,
  ([visible, playing]) => {
    const v = document.querySelector<HTMLVideoElement>('.media-hover-float video');
    if (!v) return;
    if (visible && playing) {
      try { v.currentTime = 0; } catch { /* 未加载完 seek 可能抛错，忽略 */ }
      v.play().catch(() => { /* 自动播放被策略拒绝时保持首帧 */ });
    } else {
      v.pause();
      try { v.currentTime = 0.1; } catch { /* 同上 */ }
    }
  },
  { flush: 'post' },
);
</script>

<style scoped>
.media-hover-float {
  position: fixed;
  inset: 0;
  z-index: 3900; /* 高于主智能体卡片，低于右键菜单(4100)与灯箱(4000) */
  pointer-events: none; /* 纯视觉，不挡点击/右键 */
}
.media-hover-float-img,
.media-hover-float-video {
  position: fixed;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.3);
}
</style>
