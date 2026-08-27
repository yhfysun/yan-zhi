<template>
  <div class="chat-page" :class="{ 'conv-collapsed': convCollapsed, 'drawer-open': drawerOpen }">
    <div v-if="drawerOpen" class="drawer-overlay" @click="drawerOpen = false"></div>

    <ChatSidebar />

    <div class="conv-toggle" @click="convCollapsed = !convCollapsed">
      <el-icon><Fold v-if="!convCollapsed" /><Expand v-else /></el-icon>
    </div>

    <section class="chat-main">
      <div class="chat-column">
        <ChatTopbar />
        <ChatMessageList />
        <ChatInputArea />
      </div>
      <ChatPreviewPane />
    </section>

    <ChatMountDialog />
    <ChatSkillCards />
    <ChatDialogs />
  </div>
</template>

<script setup lang="ts">
import { Fold, Expand } from '@element-plus/icons-vue';
import { useChat } from '../composables/chat/useChat';
import ChatSidebar from '../components/chat/ChatSidebar.vue';
import ChatTopbar from '../components/chat/ChatTopbar.vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import ChatPreviewPane from '../components/chat/ChatPreviewPane.vue';
import ChatMountDialog from '../components/chat/ChatMountDialog.vue';
import ChatSkillCards from '../components/chat/ChatSkillCards.vue';
import ChatDialogs from '../components/chat/ChatDialogs.vue';

const { convCollapsed, drawerOpen } = useChat();
</script>

<style src="./chat.css"></style>
