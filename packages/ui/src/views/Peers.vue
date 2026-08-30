<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">聊天</h2>
        <div class="page-sub">和其它客户端互发消息</div>
      </div>
      <div class="header-actions">
        <div class="my-nickname">
          <span class="nickname-label">昵称</span>
          <span class="nickname-value">{{ myNickname || '未设置' }}</span>
          <el-button size="small" :icon="Edit" @click="openNickname">设置</el-button>
        </div>
        <el-button :icon="Refresh" @click="loadPeers" />
        <el-button :icon="Setting" @click="showRegister = true">节点设置</el-button>
      </div>
    </header>

    <div class="peer-layout">
      <aside class="peer-list glass-card">
        <div class="panel-title">在线节点</div>
        <div v-if="loading" class="panel-state">
          <el-skeleton :rows="5" animated />
        </div>
        <el-empty v-else-if="otherPeers.length === 0" description="暂无其他在线节点" :image-size="64" />
        <button
          v-for="peer in otherPeers"
          :key="peer.nodeId"
          type="button"
          class="peer-item"
          :class="{ active: activePeer?.nodeId === peer.nodeId }"
          @click="selectPeer(peer)"
        >
          <span class="peer-avatar">{{ (peer.name || '?').slice(0, 1) }}</span>
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
              :class="{ mine: m.direction === 'outgoing' || m.fromPeerId === ownNodeId }"
            >
              <div class="message-bubble">
                <div v-if="m.direction === 'incoming'" class="message-sender">{{ m.senderName || m.fromPeerId }}</div>
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

    <el-dialog v-model="showNickname" title="设置昵称" width="360px">
      <el-input v-model="nicknameInput" placeholder="输入你的昵称" maxlength="20" show-word-limit />
      <template #footer>
        <el-button @click="showNickname = false">取消</el-button>
        <el-button type="primary" :loading="savingNickname" @click="saveNickname">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRegister" title="节点设置" width="480px">
      <el-form label-width="100px">
        <el-form-item label="节点 ID"><el-input v-model="registerForm.nodeId" disabled /></el-form-item>
        <el-form-item label="回调地址"><el-input v-model="registerForm.baseUrl" placeholder="http://host:port" /></el-form-item>
        <el-form-item label="能力"><el-input v-model="registerForm.capabilities" placeholder="逗号分隔，如 chat,files" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegister = false">取消</el-button>
        <el-button type="primary" :loading="savingRegister" @click="saveRegister">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Refresh, Document, Edit, Setting } from '@element-plus/icons-vue';
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

const showNickname = ref(false);
const nicknameInput = ref('');
const savingNickname = ref(false);
const myNickname = ref('');

const registerForm = ref({ nodeId: '', baseUrl: '', capabilities: 'chat' });

const otherPeers = computed(() => peers.value.filter((p) => p.nodeId !== ownNodeId.value));

function callbackBase(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file')) {
    return window.location.origin;
  }
  return 'http://127.0.0.1:3001';
}

function genNodeId(): string {
  const g = (globalThis as any).crypto;
  if (g?.randomUUID) return `peer-${g.randomUUID()}`;
  return `peer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function lsGet(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

onMounted(async () => {
  await ensureSelf();
  loadPeers();
  pollTimer = setInterval(pollMessages, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

async function ensureSelf() {
  let nodeId = lsGet('peer_node_id');
  let name = lsGet('peer_name');
  let baseUrl = lsGet('peer_base_url');
  if (!nodeId) {
    nodeId = genNodeId();
    name = `用户${Math.floor(Math.random() * 9000 + 1000)}`;
    baseUrl = callbackBase();
    lsSet('peer_node_id', nodeId);
    lsSet('peer_name', name);
    lsSet('peer_base_url', baseUrl);
  }
  const res = await api.post<any>('/peers/register', {
    nodeId,
    name: name || '匿名',
    baseUrl: baseUrl || callbackBase(),
    capabilities: ['chat'],
  });
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  ownNodeId.value = nodeId;
  myNickname.value = res.data?.name || name;
  registerForm.value = { nodeId, baseUrl: baseUrl || callbackBase(), capabilities: 'chat' };
}

async function loadPeers() {
  loading.value = true;
  const res = await api.get<any[]>('/peers');
  loading.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  peers.value = res.data || [];
  const me = peers.value.find((p) => p.nodeId === ownNodeId.value);
  if (me) myNickname.value = me.name;
}

function openNickname() {
  nicknameInput.value = myNickname.value;
  showNickname.value = true;
}

async function saveNickname() {
  if (!nicknameInput.value.trim()) {
    ElMessage.warning('昵称不能为空');
    return;
  }
  savingNickname.value = true;
  const baseUrl = registerForm.value.baseUrl || callbackBase();
  const res = await api.post<any>('/peers/register', {
    nodeId: ownNodeId.value,
    name: nicknameInput.value.trim(),
    baseUrl,
    capabilities: ['chat'],
  });
  savingNickname.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  myNickname.value = nicknameInput.value.trim();
  lsSet('peer_name', myNickname.value);
  ElMessage.success('昵称已更新');
  showNickname.value = false;
  await loadPeers();
}

async function saveRegister() {
  savingRegister.value = true;
  const res = await api.post<any>('/peers/register', {
    nodeId: ownNodeId.value,
    name: myNickname.value || '匿名',
    baseUrl: registerForm.value.baseUrl,
    capabilities: registerForm.value.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
  });
  savingRegister.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  lsSet('peer_base_url', registerForm.value.baseUrl);
  ElMessage.success('已保存');
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
    for (const msg of next) if (!existing.has(msg.id)) messages.value.push(msg);
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
    senderName: myNickname.value,
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
  align-items: center;
  gap: 8px;
}

.my-nickname {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  font-size: 13px;
}

.nickname-label {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.nickname-value {
  font-weight: 600;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
