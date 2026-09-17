<template>
  <div class="chat-welcome">
    <div class="cw-greeting">
      <div class="cw-avatar"><el-icon :size="26"><ChatDotRound /></el-icon></div>
      <h2 class="cw-title">{{ greeting }}，今天想做什么？</h2>
      <p class="cw-sub">选择一个场景开始，或直接在下方输入你的任务</p>
    </div>

    <!-- 3D 循环轮播（容器不够宽自动降级为横向列表 / 按钮行） -->
    <SceneCarousel
      :scenes="WELCOME_SCENES"
      :active-key="sceneMode"
      :agent-label="agentLabel"
      @pick="pickScene"
      @example="applyExample"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { ChatDotRound } from '@element-plus/icons-vue';
import { WELCOME_SCENES, type SceneKey } from '../../config/scenes';
import SceneCarousel from './SceneCarousel.vue';
import { useChat } from '../../composables/chat/useChat';

const { sceneMode, setScene, clearScene, input, agentStore } = useChat();

function agentLabel(id: string): string {
  return agentStore.agents.find((a) => a.id === id)?.name || '日常办公助手';
}

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

function pickScene(key: string) {
  if (sceneMode.value === key) {
    // 再次点击已选中的场景 = 取消
    clearScene();
    return;
  }
  setScene(key as Exclude<SceneKey, ''>);
  focusInput();
}

async function applyExample(text: string) {
  input.value = text;
  await focusInput();
}

async function focusInput() {
  await nextTick();
  const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement | null;
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
</script>

<style scoped>
/* 整块在可视区上下居中（不缩尺寸，只是垂直位置下移） */
.chat-welcome {
  max-width: 720px;
  margin: 0 auto;
  min-height: 100%;
  justify-content: center;
  padding: 20px;
  /* 底部多留一段：内容盒变小 → 居中点随之上移，问候语「稍微往上点」。
     （不用 translateY 改视觉位置，避免影响本块高度与滚动计算） */
  padding-bottom: 76px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cw-greeting { text-align: center; }

.cw-avatar {
  width: 44px; height: 44px;
  margin: 0 auto 10px;
  border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary, #7c3aed);
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}

.cw-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.cw-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary, #64748b);
}

@media (max-width: 767px) {
  .chat-welcome { padding: 20px 12px 8px; gap: 14px; }
  .cw-title { font-size: 18px; }
}
</style>
