<template>
  <div class="page im-hub-page">
    <header class="page-header">
      <div class="header-left">
        <el-dropdown trigger="click" @command="onChannelCommand">
          <button class="channel-trigger" type="button">
            <el-icon :size="16"><component :is="channel === 'node' ? Connection : Promotion" /></el-icon>
            <span class="channel-label">{{ currentChannelLabel }}</span>
            <el-icon :size="14" class="channel-caret"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="node" :class="{ 'is-active': channel === 'node' }">
                <el-icon><Connection /></el-icon> 言智节点
              </el-dropdown-item>
              <el-dropdown-item
                v-for="c in connectors"
                :key="c.id"
                :command="c.id"
                :class="{ 'is-active': channel === c.id }"
              >
                <el-icon><Promotion /></el-icon> {{ c.name }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div class="channel-sub">{{ currentChannelSub }}</div>
      </div>
      <div class="header-actions">
        <el-button
          v-if="channel !== 'node'"
          :icon="Refresh"
          @click="pollEvents"
        />
        <el-button v-else :icon="Refresh" @click="loadPeers" />
        <el-button v-if="channel === 'node'" :icon="Setting" @click="showRegister = true">节点设置</el-button>
        <el-button v-else :icon="Setting" @click="router.push('/connections')">配置</el-button>
      </div>
    </header>

    <!-- 言智节点：和其它言智客户端互发消息 -->
    <div v-if="channel === 'node'" class="peer-layout">
      <aside class="peer-list glass-card">
        <div class="panel-title-row">
          <span class="panel-title">在线节点</span>
          <span class="my-nickname">
            <span class="nickname-label">昵称</span>
            <span class="nickname-value">{{ myNickname || '未设置' }}</span>
            <el-button size="small" text type="primary" :icon="Edit" @click="openNickname" />
          </span>
        </div>
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
            <div v-if="peerMessages.length === 0" class="message-empty">还没有消息，发送一条吧</div>
            <div
              v-for="m in peerMessages"
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

          <form class="message-composer" @submit.prevent="sendNodeMessage">
            <el-input v-model="nodeDraft" placeholder="输入消息..." />
            <el-button type="primary" :loading="sendingNodeMessage" @click="sendNodeMessage">发送</el-button>
          </form>
        </template>
      </section>
    </div>

    <!-- IM 渠道：无连接器 -->
    <div v-else-if="connectors.length === 0" class="im-empty">
      <el-empty description="还没有可用的 IM 连接">
        <el-button type="primary" @click="router.push('/connections')">去配置 IM 连接</el-button>
      </el-empty>
    </div>

    <!-- IM 渠道：会话 -->
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

          <div ref="imMessageList" class="message-list">
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

          <form class="message-composer" @submit.prevent="sendImMsg">
            <el-input v-model="draft" placeholder="输入消息..." />
            <el-button type="primary" :loading="sending" @click="sendImMsg">发送</el-button>
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
import { useRouter } from 'vue-router';
import { Refresh, Document, Edit, Setting, ArrowDown, Connection, Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client';

const router = useRouter();

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

// ===== 渠道 =====
/** 当前渠道：'node' 表示言智节点聊天，否则为 IM connector id */
const channel = ref<'node' | string>('node');

const connectors = ref<any[]>([]);
const activeConnectorId = ref('');
const events = ref<ImEvent[]>([]);
const activeFromUser = ref('');
const draft = ref('');
const sending = ref(false);
const lastSince = ref(0);
const outgoing = ref<{ id: string; to: string; content: string; createdAt: number }[]>([]);
const imMessageList = ref<HTMLElement | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const currentChannelLabel = computed(() => {
  if (channel.value === 'node') return '言智节点';
  return connectors.value.find((c) => c.id === channel.value)?.name || '消息';
});
const currentChannelSub = computed(() => {
  if (channel.value === 'node') return '和其它言智客户端互发消息';
  return '飞书 / 企业微信 会话';
});

const activeConnector = computed(() => connectors.value.find((c) => c.id === activeConnectorId.value));

// ===== 言智节点聊天（Peers）状态 =====
const peers = ref<any[]>([]);
const activePeer = ref<any | null>(null);
const peerMessages = ref<any[]>([]);
const ownNodeId = ref('');
const nodeDraft = ref('');
const loading = ref(false);
const sendingNodeMessage = ref(false);
const lastPeerSince = ref(0);
const messageList = ref<HTMLElement | null>(null);
const myNickname = ref('');

const showNickname = ref(false);
const nicknameInput = ref('');
const savingNickname = ref(false);
const showRegister = ref(false);
const savingRegister = ref(false);
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
  await loadConnectors();
  pollTimer = setInterval(dispatchPoll, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

function dispatchPoll() {
  if (channel.value === 'node') {
    pollPeerMessages();
  } else {
    pollEvents();
  }
}

function onChannelCommand(cmd: string) {
  if (cmd === 'node') {
    channel.value = 'node';
    return;
  }
  channel.value = cmd;
  const c = connectors.value.find((x) => x.id === cmd);
  if (c) selectConnector(c);
}

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
  peerMessages.value = [];
  lastPeerSince.value = 0;
  pollPeerMessages();
}

async function reloadMessages() {
  if (!activePeer.value || !ownNodeId.value) return;
  lastPeerSince.value = 0;
  peerMessages.value = [];
  await pollPeerMessages();
}

async function pollPeerMessages() {
  if (!activePeer.value || !ownNodeId.value) return;
  const res = await api.get<any[]>(
    `/peers/chat/poll?peerId=${encodeURIComponent(ownNodeId.value)}&since=${lastPeerSince.value}&limit=100`,
  );
  if ('error' in res) return;
  const next = res.data || [];
  if (next.length > 0) {
    const existing = new Set(peerMessages.value.map((m) => m.id));
    for (const msg of next) {
      // 仅显示与当前节点相关的消息
      if (msg.fromPeerId !== activePeer.value.nodeId && msg.toPeerId !== activePeer.value.nodeId) continue;
      if (!existing.has(msg.id)) peerMessages.value.push(msg);
    }
    lastPeerSince.value = Math.max(...next.map((m) => Number(m.createdAt) || 0), lastPeerSince.value);
    scrollPeerToBottom();
  }
}

async function sendNodeMessage() {
  if (!activePeer.value || !ownNodeId.value || !nodeDraft.value.trim()) return;
  sendingNodeMessage.value = true;
  const res = await api.post<any>('/peers/chat/send', {
    fromPeerId: ownNodeId.value,
    toPeerId: activePeer.value.nodeId,
    content: nodeDraft.value.trim(),
    senderName: myNickname.value,
  });
  sendingNodeMessage.value = false;
  if ('error' in res) {
    ElMessage.error(res.error);
    return;
  }
  nodeDraft.value = '';
  await pollPeerMessages();
}

function scrollPeerToBottom() {
  requestAnimationFrame(() => {
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
  });
}

// ===== IM 渠道 =====
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

async function loadConnectors() {
  const res = await api.get<any[]>('/im/connectors');
  if ('error' in res) return;
  connectors.value = (res.data || []).filter((c) => c.enabled);
}

function selectConnector(c: any) {
  activeConnectorId.value = c.id;
  activeFromUser.value = '';
  events.value = [];
  outgoing.value = [];
  lastSince.value = 0;
  pollEvents();
}

function selectConversation(fromUser: string) {
  activeFromUser.value = fromUser;
  scrollImToBottom();
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
    if (activeFromUser.value) scrollImToBottom();
  }
}

async function sendImMsg() {
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
  scrollImToBottom();
}

function scrollImToBottom() {
  requestAnimationFrame(() => {
    if (imMessageList.value) imMessageList.value.scrollTop = imMessageList.value.scrollHeight;
  });
}
</script>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.channel-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg-hover);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}
.channel-trigger:hover {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.08);
}
.channel-caret {
  color: var(--color-text-secondary);
}
.channel-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.my-nickname {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
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

.peer-layout,
.im-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  min-height: 0;
}

.peer-list,
.chat-panel,
.im-list,
.im-chat {
  min-height: 520px;
  border-radius: var(--radius-md);
  padding: 16px;
}

.peer-list,
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

.panel-state {
  padding: 16px 0;
}

.peer-item,
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

.peer-item:hover,
.conv-item:hover {
  background: var(--glass-bg-hover);
}

.peer-item.active,
.conv-item.active {
  border-color: var(--color-primary);
  background: rgba(124, 58, 237, 0.08);
}

.peer-avatar,
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

.peer-info,
.conv-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.peer-name,
.conv-name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-meta,
.conv-preview {
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

.chat-panel,
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
  justify-content: space-between;
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
  .peer-layout,
  .im-layout {
    grid-template-columns: 1fr;
  }
  .peer-list,
  .chat-panel,
  .im-list,
  .im-chat {
    min-height: 0;
  }
}
</style>
