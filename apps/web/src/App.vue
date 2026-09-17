<!--
  Web 端本地根组件：顶部 WebTopBar + 共享应用外壳
  与 apps/desktop/src/App.vue 结构对称，区别仅是不挂载 BrowserView。

  bare 路由（如 /diff-window 独立窗口视图）不渲染 WebTopBar：
  那条路由的定位就是「整窗自绘标题栏」，再叠一条应用顶栏会变成
  「窗口里还有一整套应用导航」的错位；桌面端开独立窗口时同理。
-->
<template>
  <div class="web-root">
    <WebTopBar v-if="!isBareRoute" />
    <div class="web-body">
      <SharedApp />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WebTopBar from '@yan-zhi/ui/components/WebTopBar.vue';
import SharedApp from '@yan-zhi/ui/App.vue';

const route = useRoute();
/** 独立窗口视图：不套应用顶栏（与 packages/ui 的 App.vue 同一判定口径） */
const isBareRoute = computed(() => route.meta?.bare === true);
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