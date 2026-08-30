<template>
  <div class="page im-hub-page">
    <header class="page-header">
      <div>
        <h2 class="page-title">消息</h2>
        <div class="page-sub">飞书 / 企业微信 会话</div>
      </div>
      <div class="header-actions">
        <el-select
          v-if="connectors.length > 0"
          v-model="activeConnectorId"
          style="width: 180px"
          @change="onConnectorChange"
        >
          <el-option v-for="c in connectors" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-button :icon="Refresh" @click="pollEvents" />
        <el-button :icon="Setting" @click="openSettingsDrawer('connections')">配置</el-button>
      </div>
    </header>

    <div v-if="connectors.length === 0" class="im-empty">
      <el-empty description="还没有可用的 IM 连接">
        <el-button type="primary" @click="openSettingsDrawer('connections')">去配置 IM 连接</el-button>
      </el-empty>
    </div>

    <div v-else class="im-layout">
      <aside class="im-list glass-card">
        <div class="panel-title">会话</div>
        <el-empty v-if="conversations.length === 0" description="暂无消息" :image-size="48" />
        <button
          v-for="c in conversations"
          :key="c.fromUser"
          type="button"
          class="conv-item"
          :class="{ active: activeFromUser === c.fromUser }"
          @click="selectConversation(c.fromUser)"
        >
          <span class="conv-avatar">{{ (c.fromUser || '?').slice(0, 1).toUpperCase() }}</span>
          <span class="conv-info">
            <span class="conv-name">{{ c.fromUser }}</span>
            <span class="conv-preview">{{ c.lastContent }}</span>
          </span>
        </button>
      </aside>

      <section class="im-chat glass-card">
        <div v-if="!activeFromUser" class="chat-empty">
          <el-empty description="选择左侧会话开始聊天" />
        </div>
        <template v-else>
          <div class="chat-head">
            <span class="chat-title">{{ activeFromUser }}</span>
            <span class="chat-sub">{{ activeConnector?.provider === 'feishu' ? '飞书' : '企业微信' }}</span>
          </div>

          <div ref="messageList" class="message-list">
            <div v-if="activeMessages.length === 0" class="message-empty">还没有消息，发送一条吧</div>
            <div
              v-for="m in activeMessages"
              :key="m.id"
              class="message-row"
              :class="{ mine: m.mine }"
            >
              <div class="message-bubble">{{ m.text }}</div>
            </div>
          </div>

          <form class="message-composer" @submit.prevent="sendMessage">
            <el-input v-model="draft" placeholder="输入消息..." />
            <el-button type="primary" :loading="sending" @click="sendMessage">发送</el-button>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Refresh, Setting } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client';
import { openSettingsDrawer } from '../composables/useSettingsDrawer';

interface ImEvent {
  id: string;
  connectorId: string;
  provider: string;
  externalId: string;
  fromUser: string;
  toUser: string;
  content: string;
  createdAt: number;
}

const connectors = ref<any[]>([]);
const activeConnectorId = ref('');
const events = ref<ImEvent[]>([]);
const activeFromUser = ref('');
const draft = ref('');
const sending = ref(false);
const lastSince = ref(0);
const outgoing = ref<{ id: string; to: string; content: string; createdAt: number }[]>([]);
const messageList = ref<HTMLElement | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const activeConnector = computed(() => connectors.value.find((c) => c.id === activeConnectorId.value));

function formatContent(raw: string): string {
  if (!raw) return '';
  let cur: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof cur !== 'string') break;
    try {
      cur = JSON.parse(cur as string);
    } catch {
      return cur as string;
    }
  }
  if (cur && typeof cur === 'object' && typeof (cur as any).text === 'string') return (cur as any).text;
  if (typeof cur === 'string') return cur;
  try {
    return JSON.stringify(cur);
  } catch {
    return String(cur);
  }
}

const conversations = computed(() => {
  const map = new Map<string, { fromUser: string; provider: string; lastContent: string; lastCreatedAt: number }>();
  for (const e of events.value) {
    if (!e.fromUser) continue;
    const exist = map.get(e.fromUser);
    if (!exist) {
      map.set(e.fromUser, {
        fromUser: e.fromUser,
        provider: e.provider,
        lastContent: formatContent(e.content),
        lastCreatedAt: e.createdAt,
      });
    } else if (e.createdAt > exist.lastCreatedAt) {
      exist.lastContent = formatContent(e.content);
      exist.lastCreatedAt = e.createdAt;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastCreatedAt - a.lastCreatedAt);
});

const activeMessages = computed(() => {
  if (!activeFromUser.value) return [];
  const incoming = events.value
    .filter((e) => e.fromUser === activeFromUser.value)
    .map((e) => ({ id: e.id, mine: false, text: formatContent(e.content), createdAt: e.createdAt }));
  const out = outgoing.value
    .filter((m) => m.to === activeFromUser.value)
    .map((m) => ({ id: m.id, mine: true, text: m.content, createdAt: m.createdAt }));
  return [...incoming, ...out].sort((a, b) => a.createdAt - b.createdAt);
});

onMounted(async () => {
  await loadConnectors();
  pollTimer = setInterval(pollEvents, 4000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

async function loadConnectors() {
  const res = await api.get<any[]>('/im/connectors');
  if ('error' in res) return;
  connectors.value = (res.data || []).filter((c) => c.enabled);
  if (connectors.value.length > 0) selectConnector(connectors.value[0]);
}

function selectConnector(c: any) {
  activeConnectorId.value = c.id;
  activeFromUser.value = '';
  events.value = [];
  outgoing.value = [];
  lastSince.value = 0;
  pollEvents();
}

function onConnectorChange(id: string) {
  const c = connectors.value.find((x) => x.id === id);
  if (c) selectConnector(c);
}

function selectConversation(fromUser: string) {
  activeFromUser.value = fromUser;
  scrollToBottom();
}

async function pollEvents() {
  if (!activeConnectorId.value) return;
  const res = await api.get<ImEvent[]>(
    `/im/events?connectorId=${encodeURIComponent(activeConnectorId.value)}&since=${lastSince.value}&limit=500`,
  );
  if ('error' in res) return;
  const next = res.data || [];
  if (next.length > 0) {
    const existing = new Set(events.value.map((e) => e.id));
    for (const e of next) if (!existing.has(e.id)) events.value.push(e);
    lastSince.value = Math.max(...next.map((e) => Number(e.createdAt) || 0), lastSince.value);
    if (activeFromUser.value) scrollToBottom();
  }
}

async function sendMessage() {
  if (!activeConnector.value || !activeFromUser.value || !draft.value.trim()) return;
  sending.value = true;
  const body: Record<string, unknown> = { to: activeFromUser.value, content: draft.value.trim() };
  if (activeConnector.value.provider === 'feishu') body.receiveIdType = 'open_id';
  const res = await api.post<any>(`/im/connectors/${activeConnector.value.id}/send`, body);
  sending.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  outgoing.value.push({
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    to: activeFromUser.value,
    content: draft.value.trim(),
    createdAt: Date.now(),
  });
  draft.value = '';
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
  });
}
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.im-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.im-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  min-height: 0;
}

.im-list,
.im-chat {
  min-height: 520px;
  border-radius: var(--radius-md);
  padding: 16px;
}

.im-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 4px;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.conv-item:hover {
  background: var(--glass-bg-hover);
}

.conv-item.active {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.08);
}

.conv-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  background: var(--gradient-primary);
  color: white;
}

.conv-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conv-name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-preview {
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.im-chat {
  display: flex;
  flex-direction: column;
}

.chat-empty {
  margin: auto;
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--glass-border);
}

.chat-title {
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
}

.message-empty {
  margin: auto;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.message-row {
  display: flex;
}

.message-row.mine {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 72%;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-row.mine .message-bubble {
  background: var(--color-primary);
  color: white;
}

.message-composer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}

@media (max-width: 767px) {
  .im-layout {
    grid-template-columns: 1fr;
  }
  .im-list,
  .im-chat {
    min-height: 0;
  }
}
</style>
