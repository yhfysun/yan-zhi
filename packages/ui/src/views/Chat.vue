<template>
  <div class="chat-page" :class="{ 'conv-collapsed': convCollapsed, 'drawer-open': drawerOpen }"
       :style="{ '--chat-sidebar-w': (convCollapsed ? 0 : sidebarW) + 'px', '--chat-context-w': contextMoved ? contextW + 'px' : '', '--chat-right-w': rightMoved ? rightW + 'px' : '' }">
    <div v-if="drawerOpen" class="drawer-overlay" @click="drawerOpen = false"></div>

    <ChatSidebar />

    <div v-if="!convCollapsed" class="rs-handle rs-handle-left" @mousedown="sidebarR.startDrag($event, 'left')"></div>

    <div class="conv-toggle" @click="convCollapsed = !convCollapsed">
      <el-icon><Fold v-if="!convCollapsed" /><Expand v-else /></el-icon>
    </div>

    <section class="chat-main">
      <div class="chat-column">
        <ChatTopbar />
        <ChatMessageList />
        <ChatInputArea />
      </div>
      <div v-if="contextSidebarOpen" class="rs-handle rs-handle-right" @mousedown="contextR.startDrag($event, 'right')"></div>
      <ChatContextSidebar />
      <div v-if="store.rightPanelOpen" class="rs-handle rs-handle-right" @mousedown="rightR.startDrag($event, 'right')"></div>
      <ChatPreviewPane />
    </section>

    <ChatMountDialog />
    <ChatSkillCards />
    <ChatDialogs />
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount, nextTick } from 'vue';
import { Fold, Expand } from '@element-plus/icons-vue';
import { useChat } from '../composables/chat/useChat';
import { useResizable } from '../composables/useResizable';
import ChatSidebar from '../components/chat/ChatSidebar.vue';
import ChatTopbar from '../components/chat/ChatTopbar.vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import ChatContextSidebar from '../components/chat/ChatContextSidebar.vue';
import ChatPreviewPane from '../components/chat/ChatPreviewPane.vue';
import ChatMountDialog from '../components/chat/ChatMountDialog.vue';
import ChatSkillCards from '../components/chat/ChatSkillCards.vue';
import ChatDialogs from '../components/chat/ChatDialogs.vue';

const { convCollapsed, drawerOpen, store, contextSidebarOpen } = useChat();
const sidebarR = useResizable('chat_sidebar', 280, 200, 460);
const contextR = useResizable('chat_context', 286, 240, 480);
const rightR = useResizable('chat_right', 480, 320, 1200);
const { width: sidebarW } = sidebarR;
const { width: contextW, moved: contextMoved } = contextR;
const { width: rightW, moved: rightMoved } = rightR;

// 弹窗避开右侧预览面板：面板展开时标记 body 并写入面板宽度，.el-overlay 据此收窄右边界
watch(
  () => [store.rightPanelOpen, rightW.value, rightMoved.value],
  async () => {
    await nextTick();
    const panel = document.querySelector('.right-panel.open') as HTMLElement | null;
    if (panel && panel.offsetWidth > 0) {
      document.body.classList.add('yz-right-panel-open');
      document.body.style.setProperty('--yz-right-w', panel.offsetWidth + 'px');
    } else {
      document.body.classList.remove('yz-right-panel-open');
      document.body.style.removeProperty('--yz-right-w');
    }
  },
  { flush: 'post', immediate: true },
);
// 离开对话页：隐藏原生 BrowserView，避免预览面板已随页面卸载而 BrowserView 仍残留在窗口上
onBeforeUnmount(() => {
  const api = (window as any).electronAPI?.browserView;
  if (api) { try { api.hide(); } catch { /* ignore */ } }
  document.body.classList.remove('yz-right-panel-open');
  document.body.style.removeProperty('--yz-right-w');
});
</script>

<style src="./chat.css"></style>
