<template>
  <aside class="office-ai-sidebar" aria-label="办公 AI 工作区">
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
      <button type="button" :class="{ active: route.path === '/pet-settings' }" @click="openPet">
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
      aria-label="最近任务"
    >
      <header><span>最近任务</span><small>{{ recentTasks.length }}</small></header>
      <div class="oai-recent-list">
        <button
          v-for="task in visibleRecentTasks"
          :key="task.id"
          class="oai-recent-task"
          type="button"
          :title="task.title || '未命名任务'"
          @click="openConversation(task.id)"
        >
          <MessageSquare :size="13" />
          <span>{{ task.title || '未命名任务' }}</span>
          <i v-if="chat.store.runningConvIds.has(task.id)"></i>
        </button>
        <button
          v-if="remainingRecentTasks"
          class="oai-recent-more"
          type="button"
          @click="loadMoreRecentTasks"
        >
          加载更多
          <span>剩余 {{ remainingRecentTasks }}</span>
        </button>
      </div>
    </section>

    <div class="oai-directory">
      <ChatSidebar
        :show-tabs="false"
        :show-page-conversation-toggle="false"
      />
    </div>

  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Brain, Clipboard, Clock3, MessageSquare, PawPrint, Send } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { useChat } from '../../composables/chat/useChat';
import { setOfficePanel } from '../../stores/officeWorkbench';
import { setMode } from '../../stores/mode';
import ChatSidebar from '../chat/ChatSidebar.vue';

const route = useRoute();
const router = useRouter();
const chat = useChat();
const RECENT_TASK_PAGE_SIZE = 20;
const recentTaskLimit = ref(RECENT_TASK_PAGE_SIZE);

onMounted(() => {
  chat.sideTab.value = 'chat';
});

const recentTasks = computed(() => [...(chat.store.conversations || [])]
  .filter((task) => !task.archivedAt && !task.deletedAt)
  .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));
const visibleRecentTasks = computed(() => recentTasks.value.slice(0, recentTaskLimit.value));
const remainingRecentTasks = computed(() => Math.max(0, recentTasks.value.length - visibleRecentTasks.value.length));

function loadMoreRecentTasks(): void {
  recentTaskLimit.value += RECENT_TASK_PAGE_SIZE;
}

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

function openPet(): void {
  if (route.path !== '/pet-settings') void router.push('/pet-settings').catch(() => {});
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
.oai-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 10px 8px;
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
  flex: 0 1 auto;
  min-height: 0;
  max-height: min(280px, 42vh);
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
.oai-recent-list {
  max-height: calc(min(280px, 42vh) - 29px);
  overflow-y: auto;
}
.oai-recent-task {
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
.oai-recent-task:hover { background: var(--el-fill-color-light); }
.oai-recent-task span {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oai-recent-task i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-warning);
}
.oai-recent-more {
  display: flex;
  width: 100%;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.oai-recent-more:hover {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color);
}
.oai-recent-more span {
  color: var(--el-text-color-placeholder);
  font-size: 9px;
}
.oai-directory {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--el-border-color-lighter);
}
.oai-directory :deep(.sidebar) {
  width: 100%;
  height: auto;
  min-height: 0;
  flex: 1 1 0;
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
