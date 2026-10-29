<template>
  <div class="browser-page">
    <BrowserPanel :scope="scope" />
    <!-- 游戏执行条（P2）：桌面端才有（Web 端没有 browserView IPC）。 -->
    <GameControlBar v-if="isElectron" :scope="scope" />
  </div>
</template>

<script setup lang="ts">
import BrowserPanel from '../components/BrowserPanel.vue';
import GameControlBar from '../components/browser/GameControlBar.vue';
import { isElectron } from '../api/client';
import { isGameWindow } from '../utils/modeWindow';

// 独立游戏窗（#/browser?window=game）用自己的 scope：既与主窗口 /browser 的 'page' 隔离，
// 也让 agent 必须经「显式移交」才能操作这一页（见 main.cjs 的 browserView:handoff）。
const scope = isGameWindow() ? 'game' : 'page';
</script>

<style scoped>
.browser-page { flex: 1; display: flex; flex-direction: column; padding: 0; box-sizing: border-box; min-height: 0; }
</style>
