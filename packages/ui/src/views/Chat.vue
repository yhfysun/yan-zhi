<template>
  <div class="chat-page" :class="{ 'conv-collapsed': convCollapsed, 'drawer-open': drawerOpen }"
       :style="{ '--chat-sidebar-w': (convCollapsed ? 0 : sidebarW) + 'px', '--chat-context-w': contextMoved ? contextW + 'px' : '', '--chat-right-w': rightMoved ? rightW + 'px' : '' }">
    <div v-if="drawerOpen" class="drawer-overlay" @click="drawerOpen = false"></div>

    <!-- 窄屏（≤1199px 或移动外壳）下，上下文栏/预览栏为右侧覆盖抽屉：
         统一遮罩 = 点击遮罩关闭抽屉（此前无遮罩，抽屉又盖住了顶栏切换按钮，导致「关不了」）。
         >1199px 的桌面宽屏面板是常驻分栏，不需要遮罩（CSS 控制 display）。 -->
    <div
      v-if="contextSidebarOpen || store.rightPanelOpen"
      class="drawer-scrim"
      role="button"
      aria-label="点击关闭面板"
      @click="closeAllDrawers"
    ></div>

    <ChatSidebar />

    <div v-if="!convCollapsed" class="rs-handle rs-handle-left" @mousedown="sidebarR.startDrag($event, 'left')"></div>

    <div class="conv-toggle" @click="convCollapsed = !convCollapsed">
      <el-icon><Fold v-if="!convCollapsed" /><Expand v-else /></el-icon>
    </div>

    <section class="chat-main">
      <div class="chat-column">
        <!-- 归档会话只读横幅（2026-10-16）：归档后可查看历史，但不能再发消息
             （对齐 ChatGPT：必须 Unarchive 才能继续）。按钮一步恢复，不用去侧栏翻。 -->
        <div v-if="currentConvArchived" class="conv-archived-banner">
          <el-icon><FolderChecked /></el-icon>
          <span>该会话已归档，历史记录可查看但不能再发送消息</span>
          <el-button size="small" type="primary" @click="unarchiveCurrent()">取消归档，继续对话</el-button>
        </div>
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
import { watch, onBeforeUnmount, nextTick, computed } from 'vue';
import { Fold, Expand, FolderChecked } from '@element-plus/icons-vue';
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

const { convCollapsed, drawerOpen, store, contextSidebarOpen, currentConvArchived, currentConv, archiveConv } = useChat();
const sidebarR = useResizable('chat_sidebar', 280, 200, 460);
const contextR = useResizable('chat_context', 286, 240, 480);
const rightR = useResizable('chat_right', 480, 320, 1200);
const { width: sidebarW } = sidebarR;
const { width: contextW, moved: contextMoved } = contextR;
const { width: rightW, moved: rightMoved } = rightR;

/** 点击遮罩：收起所有覆盖式抽屉（上下文栏 + 右侧预览栏） */
function closeAllDrawers() {
  if (contextSidebarOpen.value) contextSidebarOpen.value = false;
  if (store.rightPanelOpen) store.rightPanelOpen = false;
}

/** 归档横幅的「取消归档，继续对话」：恢复后横幅自动消失（currentConvArchived 变 false） */
async function unarchiveCurrent() {
  const c = currentConv.value;
  if (!c) return;
  try {
    await archiveConv(c, false);
  } catch { /* 失败时横幅仍在，用户可重试 */ }
}

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
