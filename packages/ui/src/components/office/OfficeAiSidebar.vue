<template>
  <aside class="office-ai-sidebar" aria-label="办公 AI 工作区">
    <header class="oai-head">
      <div>
        <span class="oai-head-mark">AI</span>
        <div>
          <strong>办公 · {{ officePanel === 'ai' ? 'AI' : '工作区' }}</strong>
          <small>{{ officePanel === 'ai' ? currentAgentName : '导航、任务与文件' }}</small>
        </div>
      </div>
    </header>

    <nav class="oai-nav" aria-label="AI 功能">
      <button type="button" :class="{ active: route.path === '/chat' && chat.sideTab.value === 'chat' }" @click="openSidePanel('chat')">
        <MessageSquare :size="15" />
        <span>对话</span>
      </button>
      <button type="button" :class="{ active: route.path === '/scheduled-tasks' }" @click="openScheduledTasks">
        <Clock3 :size="15" />
        <span>定时任务</span>
      </button>
      <button type="button" :class="{ active: route.path === '/publish-queue' }" @click="openPublishQueue">
        <Send :size="15" />
        <span>发布</span>
      </button>
      <button type="button" @click="openClipboard">
        <Clipboard :size="15" />
        <span>剪贴板</span>
      </button>
      <button type="button" @click="openPet">
        <PawPrint :size="15" />
        <span>宠物</span>
      </button>
      <button type="button" :class="{ active: route.path === '/memory' }" @click="router.push('/memory')">
        <Brain :size="15" />
        <span>记忆</span>
      </button>
    </nav>

    <section
      v-if="recentTasks.length"
      class="oai-recent"
      :style="{ height: recentHeight + 'px' }"
      aria-label="最近任务"
    >
      <header><span>最近任务</span><small>{{ recentTasks.length }}</small></header>
      <div>
        <button
          v-for="task in recentTasks.slice(0, 6)"
          :key="task.id"
          type="button"
          :title="task.title || '未命名任务'"
          @click="openConversation(task.id)"
        >
          <MessageSquare :size="13" />
          <span>{{ task.title || '未命名任务' }}</span>
          <i v-if="chat.store.runningConvIds.has(task.id)"></i>
        </button>
      </div>
    </section>
    <button
      v-if="recentTasks.length"
      type="button"
      class="oai-recent-resize"
      role="separator"
      aria-label="上下拖动调整最近任务高度"
      aria-orientation="horizontal"
      :aria-valuenow="recentHeight"
      :aria-valuemin="RECENT_MIN_HEIGHT"
      :aria-valuemax="RECENT_MAX_HEIGHT"
      @pointerdown="startRecentResize"
      @keydown="resizeRecentWithKeyboard"
    ></button>

    <ChatSidebar
      class="oai-directory"
      :show-tabs="false"
      :show-page-conversation-toggle="false"
    />

  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Brain, Clipboard, Clock3, MessageSquare, PawPrint, Send } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { useChat } from '../../composables/chat/useChat';
import { useAgentStore } from '../../stores/agent';
import { officePanel, setOfficePanel } from '../../stores/officeWorkbench';
import { setMode } from '../../stores/mode';
import ChatSidebar from '../chat/ChatSidebar.vue';

const route = useRoute();
const router = useRouter();
const chat = useChat();
const agentStore = useAgentStore();
const RECENT_HEIGHT_KEY = 'yz.office.ai.recent-height';
const RECENT_MIN_HEIGHT = 92;
const RECENT_MAX_HEIGHT = 320;
const recentHeight = ref(readRecentHeight());
let recentResizeStartY = 0;
let recentResizeStartHeight = recentHeight.value;

onMounted(() => {
  chat.sideTab.value = 'chat';
});
onBeforeUnmount(stopRecentResize);

function readRecentHeight(): number {
  try {
    const value = Number(localStorage.getItem(RECENT_HEIGHT_KEY));
    if (Number.isFinite(value)) return Math.min(RECENT_MAX_HEIGHT, Math.max(RECENT_MIN_HEIGHT, value));
  } catch { /* use default */ }
  return 174;
}

function persistRecentHeight(): void {
  try { localStorage.setItem(RECENT_HEIGHT_KEY, String(recentHeight.value)); } catch { /* optional */ }
}

function onRecentResize(event: PointerEvent): void {
  recentHeight.value = Math.min(
    RECENT_MAX_HEIGHT,
    Math.max(RECENT_MIN_HEIGHT, recentResizeStartHeight + event.clientY - recentResizeStartY),
  );
}

function stopRecentResize(): void {
  window.removeEventListener('pointermove', onRecentResize);
  window.removeEventListener('pointerup', stopRecentResize);
  window.removeEventListener('pointercancel', stopRecentResize);
  persistRecentHeight();
}

function startRecentResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  recentResizeStartY = event.clientY;
  recentResizeStartHeight = recentHeight.value;
  window.addEventListener('pointermove', onRecentResize);
  window.addEventListener('pointerup', stopRecentResize, { once: true });
  window.addEventListener('pointercancel', stopRecentResize, { once: true });
}

function resizeRecentWithKeyboard(event: KeyboardEvent): void {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowUp') recentHeight.value -= 16;
  if (event.key === 'ArrowDown') recentHeight.value += 16;
  if (event.key === 'Home') recentHeight.value = RECENT_MIN_HEIGHT;
  if (event.key === 'End') recentHeight.value = RECENT_MAX_HEIGHT;
  recentHeight.value = Math.min(RECENT_MAX_HEIGHT, Math.max(RECENT_MIN_HEIGHT, recentHeight.value));
  persistRecentHeight();
}

const recentTasks = computed(() => [...(chat.store.conversations || [])]
  .filter((task) => !task.archivedAt && !task.deletedAt)
  .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

const currentAgentName = computed(() => agentStore.selectedAgent?.name || '日常办公助手');

function openClipboard(): void {
  const api = (window as unknown as { electronAPI?: { clipboardPanel?: { toggle?: () => void } } }).electronAPI;
  if (api?.clipboardPanel?.toggle) {
    api.clipboardPanel.toggle();
    return;
  }
  ElMessage.info('超级剪贴板仅在桌面端提供独立窗口');
}

async function openSidePanel(tab: 'chat'): Promise<void> {
  chat.sideTab.value = tab;
  setOfficePanel('ai');
  setMode('office');
  if (route.path !== '/chat') await router.push('/chat');
}

async function openScheduledTasks(): Promise<void> {
  chat.sideTab.value = 'chat';
  if (route.path !== '/scheduled-tasks') await router.push('/scheduled-tasks');
}

async function openPublishQueue(): Promise<void> {
  chat.sideTab.value = 'chat';
  if (route.path !== '/publish-queue') await router.push('/publish-queue');
}

async function openConversation(id: string): Promise<void> {
  if (!id) return;
  chat.sideTab.value = 'chat';
  setOfficePanel('ai');
  setMode('office');
  if (route.path !== '/chat') await router.push('/chat');
  if (id !== chat.store.currentConvId) await chat.selectConv(id);
}

async function openPet(): Promise<void> {
  const api = (window as unknown as {
    electronAPI?: {
      pet?: {
        toggle?: () => Promise<{ open?: boolean; reason?: string }>;
        isOpen?: () => Promise<boolean>;
      };
    };
  }).electronAPI;
  if (api?.pet?.toggle) {
    const wasOpen = await api.pet.isOpen?.().catch(() => false);
    const result = await api.pet.toggle().catch(() => ({ open: false, reason: '宠物窗口打开失败' }));
    if (!wasOpen && !result.open) {
      ElMessage.warning(result.reason || '当前发行包未包含宠物资源');
    }
    return;
  }
  ElMessage.info('宠物窗口仅在桌面端可用');
}
</script>

<style scoped>
.office-ai-sidebar {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.oai-head {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px 12px;
}
.oai-head > div { display: flex; min-width: 0; align-items: center; gap: 8px; }
.oai-head-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #23342d;
  color: #fff;
  font-family: Georgia, serif;
  font-size: 12px;
  font-weight: 700;
}
.oai-head strong, .oai-head small { display: block; }
.oai-head strong { color: var(--el-text-color-primary); font-size: 13px; }
.oai-head small {
  margin-top: 1px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oai-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 0 8px 10px;
}
.oai-nav button {
  display: flex;
  min-width: 0;
  min-height: 38px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 3px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 9.5px;
  text-align: center;
  cursor: pointer;
}
.oai-nav button span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oai-nav button:hover { background: var(--el-fill-color-light); }
.oai-nav button.active { background: #f1f4f2; color: #23342d; font-weight: 650; }
.oai-recent {
  flex: none;
  min-height: 92px;
  overflow: hidden;
  padding: 7px 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.oai-recent > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5px 5px;
  color: var(--el-text-color-placeholder);
  font-size: 9.5px;
  font-weight: 650;
}
.oai-recent > div {
  max-height: calc(100% - 22px);
  overflow-y: auto;
}
.oai-recent > div > button {
  display: grid;
  width: 100%;
  min-height: 30px;
  grid-template-columns: 14px minmax(0, 1fr) 6px;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
}
.oai-recent > div > button:hover { background: var(--el-fill-color-light); }
.oai-recent > div > button span {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oai-recent > div > button i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-warning);
}
.oai-recent-resize {
  position: relative;
  flex: 0 0 7px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: row-resize;
  touch-action: none;
}
.oai-recent-resize::after {
  position: absolute;
  top: 2px;
  left: 50%;
  width: 34px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-border-color) 72%, transparent);
  content: "";
  transform: translateX(-50%);
}
.oai-recent-resize:hover::after,
.oai-recent-resize:focus-visible::after {
  background: var(--el-color-primary);
}
.oai-directory {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border-top: 1px solid var(--el-border-color-lighter);
}
.oai-directory :deep(.sidebar) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-right: 0;
}
.oai-directory :deep(.sidebar-tabs) { display: none; }
.oai-directory :deep(.conv-list) {
  height: 100%;
  min-height: 0;
}
.oai-directory :deep(.conv-tree) {
  min-height: 0;
  overflow-y: auto;
}
@media (max-width: 1100px) {
  .office-ai-sidebar { width: 204px; }
}
</style>
