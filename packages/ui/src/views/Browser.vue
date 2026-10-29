<template>
  <div class="browser-page">
    <BrowserPanel />
    <!-- 游戏执行条（P2）：桌面端才有（Web 端没有 browserView IPC）。 -->
    <GameControlBar v-if="isElectron" />
  </div>
</template>

<script setup lang="ts">
import BrowserPanel from '../components/BrowserPanel.vue';
import GameControlBar from '../components/browser/GameControlBar.vue';
import { isElectron } from '../api/client';
</script>

<style scoped>
.browser-page { flex: 1; display: flex; flex-direction: column; padding: 0; box-sizing: border-box; min-height: 0; }
</style>
