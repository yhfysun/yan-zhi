<!--
  Web 端本地根组件：顶部 WebTopBar + 共享应用外壳
  与 apps/desktop/src/App.vue 结构对称，区别仅是不挂载 BrowserView。
-->
<template>
  <div class="web-root">
    <WebTopBar />
    <div class="web-body">
      <SharedApp />
    </div>
  </div>
</template>

<script setup lang="ts">
import WebTopBar from '@yan-zhi/ui/components/WebTopBar.vue';
import SharedApp from '@yan-zhi/ui/App.vue';
</script>

<style>
/* 根容器：纵向铺满整屏，WebTopBar 固定 36px + 主体自适应填充 */
.web-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 主体区域：吃掉剩余高度，内部共享 .app-shell 以 height:100% 填满 */
.web-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
</style>