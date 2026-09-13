<template>
  <div class="chat-welcome">
    <div class="cw-greeting">
      <div class="cw-avatar"><el-icon :size="26"><ChatDotRound /></el-icon></div>
      <h2 class="cw-title">{{ greeting }}，今天想做什么？</h2>
      <p class="cw-sub">选择一个场景开始，或直接在下方输入你的任务</p>
    </div>

    <div class="cw-cards">
      <div
        v-for="s in SCENES"
        :key="s.key"
        class="cw-card"
        :class="{ 'is-active': sceneMode === s.key }"
        :style="{ '--scene-color': s.color }"
        @click="pickScene(s.key)"
      >
        <div class="cw-card-head">
          <span class="cw-card-icon"><el-icon :size="20"><component :is="s.icon" /></el-icon></span>
          <span class="cw-card-label">{{ s.label }}</span>
          <el-icon v-if="sceneMode === s.key" class="cw-card-check"><Check /></el-icon>
        </div>
        <div class="cw-card-desc">{{ s.desc }}</div>
        <div class="cw-card-agent">
          <el-icon :size="11"><User /></el-icon>
          <span>{{ agentLabel(s.agentId) }}接手</span>
        </div>
        <transition name="cw-examples-fade">
          <div v-if="sceneMode === s.key" class="cw-examples">
            <button
              v-for="ex in s.examples"
              :key="ex"
              type="button"
              class="cw-example"
              @click.stop="applyExample(ex)"
            >{{ ex }}</button>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { ChatDotRound, Check, User } from '@element-plus/icons-vue';
import { SCENES, type SceneKey } from '../../config/scenes';
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

function pickScene(key: Exclude<SceneKey, ''>) {
  if (sceneMode.value === key) {
    // 再次点击已选中的场景 = 取消
    const { clearScene } = useChat();
    clearScene();
    return;
  }
  setScene(key);
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
.chat-welcome {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cw-greeting { text-align: center; }

.cw-avatar {
  width: 48px; height: 48px;
  margin: 0 auto 14px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary, #7c3aed);
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}

.cw-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.cw-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary, #64748b);
}

.cw-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.cw-card {
  position: relative;
  padding: 16px 14px;
  border-radius: 14px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--el-bg-color, #fff);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.cw-card:hover {
  border-color: var(--scene-color);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--scene-color) 16%, transparent);
  transform: translateY(-2px);
}

.cw-card.is-active {
  border-color: var(--scene-color);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--scene-color) 20%, transparent);
}

.cw-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cw-card-icon {
  width: 34px; height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--scene-color);
  background: color-mix(in srgb, var(--scene-color) 12%, transparent);
}

.cw-card-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.cw-card-check { color: var(--scene-color); }

.cw-card-desc {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #64748b);
  line-height: 1.5;
}

.cw-card-agent {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--scene-color);
  opacity: 0.85;
}

.cw-examples {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--glass-border, rgba(15, 23, 42, 0.1));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-example {
  all: unset;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular, #475569);
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s ease, color 0.15s ease;
}

.cw-example:hover {
  background: color-mix(in srgb, var(--scene-color) 10%, transparent);
  color: var(--scene-color);
}

.cw-examples-fade-enter-active,
.cw-examples-fade-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.cw-examples-fade-enter-from,
.cw-examples-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 767px) {
  .chat-welcome { padding: 20px 12px 8px; gap: 16px; }
  .cw-cards { grid-template-columns: 1fr; }
  .cw-title { font-size: 18px; }
}
</style>
