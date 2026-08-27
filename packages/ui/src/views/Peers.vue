<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">客户端节点</h2>
        <div class="page-sub">注册节点，发现其他客户端并互发消息</div>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="loadPeers" />
        <el-button type="primary" :icon="Plus" @click="showRegister = true">注册节点</el-button>
      </div>
    </header>

    <div class="peer-layout">
      <aside class="peer-list glass-card">
        <div class="panel-title">在线节点</div>
        <div v-if="loading" class="panel-state">
          <el-skeleton :rows="5" animated />
        </div>
        <el-empty v-else-if="peers.length === 0" description="暂未发现节点" :image-size="64" />
        <button
          v-for="peer in peers"
          :key="peer.nodeId"
          class="peer-item"
          :class="{ active: activePeer?.nodeId === peer.nodeId }"
          type="button"
          @click="selectPeer(peer)"
        >
          <span class="peer-avatar">{{ peer.name.slice(0, 1) }}</span>
          <span class="peer-info">
            <span class="peer-name">{{ peer.name }}</span>
            <span class="peer-meta">{{ peer.nodeId }}</span>
          </span>
          <span class="online-dot" />
        </button>
      </aside>

      <section class="chat-panel glass-card">
        <div v-if="!activePeer" class="chat-empty">
          <el-empty description="选择左侧节点开始聊天" />
        </div>
        <template v-else>
          <div class="chat-head">
            <div>
              <span class="chat-title">{{ activePeer.name }}</span>
              <span class="chat-sub">{{ activePeer.baseUrl }}</span>
            </div>
            <el-button size="small" :icon="Refresh" @click="reloadMessages" />
          </div>

          <div ref="messageList" class="message-list">
            <div v-if="messages.length === 0" class="message-empty">还没有消息，发送一条吧</div>
            <div
              v-for="m in messages"
              :key="m.id"
              class="message-row"
              :class="{ mine: m.fromPeerId === ownNodeId }"
            >
              <div class="message-bubble">
                <div class="message-sender">{{ m.senderName || m.fromPeerId }}</div>
                <div class="message-text">{{ m.content }}</div>
                <div v-if="m.file" class="message-file">
                  <el-icon><Document /></el-icon>
                  {{ m.file.name || '附件' }}
                </div>
              </div>
            </div>
          </div>

          <form class="message-composer" @submit.prevent="sendMessage">
            <el-input v-model="draft" placeholder="输入消息..." />
            <el-button type="primary" :loading="sendingMessage" @click="sendMessage">发送</el-button>
          </form>
        </template>
      </section>
    </div>

    <el-dialog v-model="showRegister" title="注册客户端节点" width="480px">
      <el-form label-width="100px">
        <el-form-item label="节点 ID"><el-input v-model="registerForm.nodeId" placeholder="唯一标识，如 desktop-mac" /></el-form-item>
        <el-form-item label="显示名称"><el-input v-model="registerForm.name" /></el-form-item>
        <el-form-item label="回调地址"><el-input v-model="registerForm.baseUrl" placeholder="http://host:port" /></el-form-item>
        <el-form-item label="能力"><el-input v-model="registerForm.capabilities" placeholder="逗号分隔，如 chat,files" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegister = false">取消</el-button>
        <el-button type="primary" :loading="savingRegister" @click="registerPeer">注册</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Plus, Refresh, Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client';

const peers = ref<any[]>([]);
const activePeer = ref<any | null>(null);
const messages = ref<any[]>([]);
const ownNodeId = ref('');
const draft = ref('');
const loading = ref(false);
const showRegister = ref(false);
const savingRegister = ref(false);
const sendingMessage = ref(false);
const lastSince = ref(0);
const messageList = ref<HTMLElement | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const registerForm = ref({ nodeId: '', name: '', baseUrl: '', capabilities: '' });

onMounted(() => {
  loadPeers();
  pollTimer = setInterval(pollMessages, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

async function loadPeers() {
  loading.value = true;
  const res = await api.get<any[]>('/peers');
  loading.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  peers.value = res.data || [];
}

async function registerPeer() {
  if (!registerForm.value.nodeId.trim() || !registerForm.value.name.trim() || !registerForm.value.baseUrl.trim()) {
    ElMessage.warning('节点 ID、名称和回调地址为必填项');
    return;
  }
  savingRegister.value = true;
  const res = await api.post<any>('/peers/register', {
    nodeId: registerForm.value.nodeId,
    name: registerForm.value.name,
    baseUrl: registerForm.value.baseUrl,
    capabilities: registerForm.value.capabilities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  });
  savingRegister.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ownNodeId.value = res.data.nodeId;
  ElMessage.success('节点已注册');
  showRegister.value = false;
  await loadPeers();
}

function selectPeer(peer: any) {
  activePeer.value = peer;
  messages.value = [];
  lastSince.value = 0;
  reloadMessages();
}

async function reloadMessages() {
  if (!activePeer.value || !ownNodeId.value) return;
  lastSince.value = 0;
  messages.value = [];
  await pollMessages();
}

async function pollMessages() {
  if (!activePeer.value || !ownNodeId.value) return;
  const res = await api.get<any[]>(
    `/peers/chat/poll?peerId=${encodeURIComponent(ownNodeId.value)}&since=${lastSince.value}&limit=100`,
  );
  if ('error' in res) return;
  const next = res.data || [];
  if (next.length > 0) {
    const existing = new Set(messages.value.map((m) => m.id));
    for (const msg of next) {
      if (!existing.has(msg.id)) {
        messages.value.push(msg);
      }
    }
    lastSince.value = Math.max(...next.map((m) => Number(m.createdAt) || 0), lastSince.value);
    scrollToBottom();
  }
}

async function sendMessage() {
  if (!activePeer.value || !ownNodeId.value || !draft.value.trim()) return;
  sendingMessage.value = true;
  const res = await api.post<any>('/peers/chat/send', {
    fromPeerId: ownNodeId.value,
    toPeerId: activePeer.value.nodeId,
    content: draft.value.trim(),
  });
  sendingMessage.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  draft.value = '';
  await pollMessages();
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
  gap: 8px;
}

.peer-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  min-height: 0;
}

.peer-list,
.chat-panel {
  min-height: 520px;
  border-radius: var(--radius-md);
  padding: 16px;
}

.peer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
}

.panel-state {
  padding: 16px 0;
}

.peer-item {
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
}

.peer-item:hover {
  background: var(--glass-bg-hover);
}

.peer-item.active {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.08);
}

.peer-avatar {
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

.peer-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.peer-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-meta {
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.8);
}

.chat-panel {
  display: flex;
  flex-direction: column;
}

.chat-empty {
  margin: auto;
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--glass-border);
}

.chat-title {
  font-weight: 700;
}

.chat-sub {
  margin-left: 8px;
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
}

.message-row.mine .message-bubble {
  background: var(--color-primary);
  color: white;
}

.message-sender {
  font-size: 11px;
  margin-bottom: 4px;
  color: var(--color-text-secondary);
}

.message-row.mine .message-sender {
  color: rgba(255, 255, 255, 0.7);
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-file {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
}

.message-composer {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}

@media (max-width: 767px) {
  .peer-layout {
    grid-template-columns: 1fr;
  }
  .peer-list,
  .chat-panel {
    min-height: 0;
  }
}
</style>
