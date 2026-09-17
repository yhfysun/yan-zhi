<template>
  <!-- 桌面端本地根组件：自定义标题栏 + 共享应用外壳 -->
  <div class="desktop-root">
    <!--
      bare 路由（独立子窗口视图，如 /diff-window）不渲染 WebTopBar：
      子窗口自己画标题栏（含拖拽区与窗口控制），再叠一条应用标题栏就会出现
      「两条标题栏 / 窗口里还有一整套应用导航」的错位。
      注意主窗口自己的标题栏不受影响（只有 bare 路由才跳过）。
    -->
    <WebTopBar v-if="!isBareRoute" />
    <div class="desktop-body">
      <SharedApp />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
// 自定义标题栏（窗口控制 + 顶部横排菜单），desktop 与 web 共用同一份
import WebTopBar from '@yan-zhi/ui/components/WebTopBar.vue';
// 共享应用外壳（web/mobile/desktop 三端共用）
import SharedApp from '@yan-zhi/ui/App.vue';

const route = useRoute();
/** 独立窗口视图：不套应用标题栏（与 packages/ui / apps/web 同一判定口径） */
const isBareRoute = computed(() => route.meta?.bare === true);
</script>

<style>
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