<script setup lang="ts">
import { computed } from 'vue';
import { Clock3, MessageSquareText, Plus } from 'lucide-vue-next';
import type { Conversation } from '@yan-zhi/shared';

const props = defineProps<{
  conversations: readonly Conversation[];
  currentId: string;
}>();

const emit = defineEmits<{
  create: [];
  select: [conversationId: string];
}>();

const sortedConversations = computed(() =>
  [...props.conversations].sort((left, right) => {
    if (!!left.pinned !== !!right.pinned) return left.pinned ? -1 : 1;
    return conversationTime(right) - conversationTime(left);
  }),
);

function conversationTime(conversation: Conversation): number {
  return conversation.lastActivityAt || conversation.updatedAt || conversation.createdAt || 0;
}

function formatConversationTime(conversation: Conversation): string {
  const timestamp = conversationTime(conversation);
  if (!timestamp) return '刚刚';
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
</script>

<template>
  <section class="lv2-conversation-rail" aria-label="学习会话列表">
    <header>
      <div>
        <MessageSquareText :size="16" />
        <span>
          <b>学习会话</b>
          <small>{{ conversations.length }} 条记录</small>
        </span>
      </div>
      <button type="button" title="新建学习会话" aria-label="新建学习会话" @click="emit('create')">
        <Plus :size="16" />
      </button>
    </header>

    <div v-if="sortedConversations.length" class="lv2-conversation-list">
      <button
        v-for="conversation in sortedConversations"
        :key="conversation.id"
        type="button"
        class="lv2-conversation-item"
        :class="{ active: conversation.id === currentId }"
        :aria-current="conversation.id === currentId ? 'page' : undefined"
        @click="emit('select', conversation.id)"
      >
        <span class="lv2-conversation-title">{{ conversation.title || '未命名学习会话' }}</span>
        <span class="lv2-conversation-time">
          <Clock3 :size="11" />
          {{ formatConversationTime(conversation) }}
        </span>
      </button>
    </div>

    <div v-else class="lv2-conversation-empty">
      <MessageSquareText :size="22" />
      <b>还没有学习会话</b>
      <span>发送第一个问题后，问答记录会保存在这里。</span>
    </div>
  </section>
</template>

<style scoped>
.lv2-conversation-rail {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  color: inherit;
}

.lv2-conversation-rail > header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 12px 10px 36px;
  border-bottom: 1px solid var(--lv2-line, #d8ded9);
}

.lv2-conversation-rail > header > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.lv2-conversation-rail > header span,
.lv2-conversation-rail > header b,
.lv2-conversation-rail > header small {
  display: block;
}

.lv2-conversation-rail > header b {
  font-size: 12px;
}

.lv2-conversation-rail > header small {
  margin-top: 2px;
  color: var(--lv2-muted, #748078);
  font-size: 9px;
}

.lv2-conversation-rail > header button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border: 1px solid var(--lv2-line, #d8ded9);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: var(--lv2-accent, #3f8a67);
  cursor: pointer;
}

.lv2-conversation-rail > header button:hover {
  border-color: var(--lv2-accent, #3f8a67);
}

.lv2-conversation-list {
  display: grid;
  min-height: 0;
  gap: 3px;
  padding: 8px;
  overflow-y: auto;
  align-content: start;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.lv2-conversation-list::-webkit-scrollbar {
  display: none;
}

.lv2-conversation-item {
  display: grid;
  width: 100%;
  min-height: 52px;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.lv2-conversation-item:hover {
  background: color-mix(in srgb, var(--lv2-accent, #3f8a67) 7%, transparent);
}

.lv2-conversation-item.active {
  border-color: color-mix(in srgb, var(--lv2-accent, #3f8a67) 34%, var(--lv2-line, #d8ded9));
  background: color-mix(in srgb, var(--lv2-accent, #3f8a67) 11%, transparent);
}

.lv2-conversation-title {
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 650;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lv2-conversation-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--lv2-muted, #748078);
  font-size: 8.5px;
}

.lv2-conversation-empty {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 16px;
  color: var(--lv2-muted, #748078);
  text-align: center;
}

.lv2-conversation-empty b {
  color: inherit;
  font-size: 11px;
}

.lv2-conversation-empty span {
  max-width: 150px;
  font-size: 9px;
  line-height: 1.55;
}
</style>
