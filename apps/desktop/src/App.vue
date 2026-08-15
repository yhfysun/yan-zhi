<template>
  <!-- 桌面端本地根组件：自定义标题栏 + 共享应用外壳 -->
  <div class="desktop-root">
    <TitleBar />
    <div class="desktop-body">
      <SharedApp />
    </div>
  </div>
</template>

<script setup lang="ts">
// 自定义标题栏（窗口控制 + 拖拽区）
import TitleBar from './components/TitleBar.vue';
// 共享应用外壳（web/mobile/desktop 三端共用）
import SharedApp from '@yan-zhi/ui/App.vue';
</script>

<style>
/* 桌面端标题栏高度变量：仅当本组件挂载时生效；
   web/mobile 不挂载本组件，无该变量即回退为 0。 */
:root {
  --titlebar-h: 36px;
}

/* 根容器：纵向铺满整屏，标题栏固定高度 + 主体自适应填充 */
.desktop-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 主体区域：吃掉剩余高度，内部共享 .app-shell 以 height:100% 填满 */
.desktop-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
</style>
