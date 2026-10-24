<template>
  <!-- 被控端伴生组件：确认弹窗（Web UI 即被控端确认面） -->
  <el-dialog
    v-model="promptVisible"
    title="远程控制请求"
    width="360px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="rcp-body">
      <div class="rcp-device">{{ pendingDevice }}</div>
      <div class="rcp-tip">请求远程观看并操作本机。拒绝将直接断开；允许后可在设置 → 远程控制查看会话记录。</div>
      <el-checkbox v-model="trustDevice">信任此设备，之后免确认直连</el-checkbox>
    </div>
    <template #footer>
      <el-button @click="decide(false)">拒绝</el-button>
      <el-button type="primary" @click="decide(true)">允许</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 远程控制 · 被控端伴生组件（挂在 App.vue，桌面/Web 端常驻）。
 *
 * 职责：
 *  1. 新设备配对 → 弹「允许/拒绝」确认框（可勾选信任 → 写入白名单，之后免确认）
 *  2. WebRTC 主通道的采集与应答：渲染层 getDisplayMedia（主进程 handler 选主屏 +
 *     Windows 系统声音回采），ICE/SDP 经插件 WS 中转给控制端
 *  3. hostKey 生命周期管理：/hostkey 拉取一次，WS 握手与 /status 携带
 *
 * 连接策略：轮询 /status（6s）发现「插件启用或有待确认会话」才建立 WS；
 * 空闲断开，避免每个打开着的窗口都挂着一条常驻连接。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { API_BASE, buildRequestHeaders, wsUrl } from '../api/client';

const promptVisible = ref(false);
const pendingDevice = ref('');
const trustDevice = ref(true);
const pluginEnabled = ref(false);
const connected = ref(false);

let hostKey = '';
let ws: WebSocket | null = null;
let pollTimer: number | null = null;
let pingTimer: number | null = null;
/** 进行中的 WebRTC 连接：sessionId → RTCPeerConnection */
const pcs = new Map<string, RTCPeerConnection>();

const fetchJson = async (path: string, init?: RequestInit): Promise<Record<string, unknown>> => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), ...buildRequestHeaders() },
  });
  return (await res.json()) as Record<string, unknown>;
};

async function ensureHostKey(): Promise<void> {
  if (hostKey) return;
  try {
    const res = await fetchJson('/plugin/remote-control/hostkey', { method: 'GET' });
    if (res.error) return;
    hostKey = String((res.data as { key?: string })?.key || '');
  } catch {
    /* 服务端不可用/插件未注册：轮询下轮再试 */
  }
}

async function poll(): Promise<void> {
  try {
    await ensureHostKey();
    if (!hostKey) return;
    const res = await fetchJson('/plugin/remote-control/status', {
      method: 'GET',
      headers: { 'x-rc-host-key': hostKey },
    });
    if (res.error) {
      pluginEnabled.value = false;
      teardownWs();
      return;
    }
    const d = (res.data || {}) as Record<string, unknown>;
    pluginEnabled.value = true;
    const needsWs = !!d.pendingCount || !!d.session;
    if (needsWs && !connected.value) openHostWs();
    else if (!needsWs && connected.value && !pcs.size) teardownWs();
  } catch {
    pluginEnabled.value = false;
  }
}

function openHostWs(): void {
  if (ws) return;
  let sock: WebSocket;
  try {
    sock = new WebSocket(wsUrl(`/plugin/remote-control/session/ws?role=host&key=${encodeURIComponent(hostKey)}`));
  } catch {
    return;
  }
  ws = sock;
  sock.onopen = () => {
    connected.value = true;
    try {
      sock.send(JSON.stringify({ type: 'rtc.ready' }));
    } catch { /* ignore */ }
    pingTimer = window.setInterval(() => {
      try {
        sock.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      } catch { /* ignore */ }
    }, 10_000);
  };
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    void onMessage(msg);
  };
  sock.onclose = () => {
    connected.value = false;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    ws = null;
    teardownPcs();
  };
  sock.onerror = () => { /* onclose 统一收尾 */ };
}

function teardownWs(): void {
  if (ws) {
    try {
      ws.close();
    } catch { /* ignore */ }
    ws = null;
  }
  connected.value = false;
}

async function onMessage(msg: Record<string, unknown>): Promise<void> {
  const type = String(msg.type || '');
  switch (type) {
    case 'host.hello':
      // 待确认会话随后逐条以 session.pending 下发，这里无需处理
      break;
    case 'session.pending':
      pendingDevice.value = String(msg.device || '未命名设备');
      pendingConfirmId.value = String(msg.confirmId || '');
      trustDevice.value = true;
      promptVisible.value = true;
      break;
    case 'rtc.start':
      // 会话 granted 且走 WebRTC：等控制端的 rtc.offer
      break;
    case 'rtc.offer':
      await handleOffer(String(msg.sessionId || ''), String(msg.sdp || ''));
      break;
    case 'rtc.stop': {
      const id = String(msg.sessionId || '');
      const conn = pcs.get(id);
      if (conn) {
        try {
          conn.close();
        } catch { /* ignore */ }
        pcs.delete(id);
      }
      break;
    }
    case 'audio.state': {
      // 音频转发开关：启停音频轨道发送（轨道存在但不发数据；关闭≠销毁，重新打开免重协商）
      const conn = pcs.get(String(msg.sessionId || ''));
      const on = !!msg.on;
      for (const sender of conn?.getSenders() || []) {
        if (sender.track?.kind === 'audio') sender.track.enabled = on;
      }
      ElMessage({ message: on ? '音频转发已开启' : '音频转发已关闭', type: 'info', duration: 2000 });
      break;
    }
    case 'privacy.on':
    case 'privacy.off': {
      // 隐私屏：主进程在所有显示器上铺全黑点击穿透窗；仅桌面端可用（Web 宿主无 electronAPI 自动跳过）
      const on = type === 'privacy.on';
      try {
        (window as unknown as { electronAPI?: { rcPrivacy?: (on: boolean) => Promise<unknown> } }).electronAPI?.rcPrivacy?.(on);
      } catch { /* ignore */ }
      ElMessage({ message: on ? '隐私屏已开启（本机屏幕已遮黑）' : '隐私屏已关闭', type: 'info', duration: 2000 });
      break;
    }
    default:
      break;
  }
}

const pendingConfirmId = ref('');

async function decide(allow: boolean): Promise<void> {
  promptVisible.value = false;
  const confirmId = pendingConfirmId.value;
  pendingConfirmId.value = '';
  if (!confirmId || !ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify({ type: 'decision', confirmId, action: allow ? 'allow' : 'deny', trust: allow && trustDevice.value }));
  } catch { /* ignore */ }
}

/** WebRTC 采集端：getDisplayMedia（主进程 handler 给主屏+系统声音）→ 应答 */
async function handleOffer(sessionId: string, sdp: string): Promise<void> {
  if (!sdp) return;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    const conn = new RTCPeerConnection(); // LAN 直连，无需 STUN
    pcs.set(sessionId, conn);
    for (const track of stream.getTracks()) {
      // 音频轨道默认不发送（隐私优先：控制端显式开启后才传出系统声音）
      if (track.kind === 'audio') track.enabled = false;
      conn.addTrack(track, stream);
    }
    conn.onicecandidate = (e) => {
      if (ws && ws.readyState === 1 && e.candidate) {
        ws.send(JSON.stringify({ type: 'rtc.ice', sessionId, candidate: e.candidate.toJSON() }));
      }
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      // 用户在系统弹条里停止共享：通知插件结束会话
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'session.stop', sessionId }));
      teardownPc(sessionId);
    });
    await conn.setRemoteDescription({ type: 'offer', sdp });
    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'rtc.answer', sessionId, sdp: conn.localDescription?.sdp || answer.sdp }));
      // 屏幕几何（物理像素）：控制端据此把画面坐标换算成屏幕坐标（主屏假设，见方案 4.2）
      const dpr = window.devicePixelRatio || 1;
      ws.send(JSON.stringify({
        type: 'rtc.screen',
        sessionId,
        x: 0,
        y: 0,
        w: Math.round(window.screen.width * dpr),
        h: Math.round(window.screen.height * dpr),
      }));
    }
  } catch (e) {
    ElMessage.warning('屏幕采集未授权，远控将使用兼容模式（JPEG）');
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'session.stop', sessionId }));
  }
}

function teardownPc(sessionId: string): void {
  const conn = pcs.get(sessionId);
  if (conn) {
    try {
      conn.close();
    } catch { /* ignore */ }
    pcs.delete(sessionId);
  }
}
function teardownPcs(): void {
  for (const id of [...pcs.keys()]) teardownPc(id);
}

onMounted(() => {
  void poll();
  pollTimer = window.setInterval(() => void poll(), 6000);
});
onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  teardownWs();
  teardownPcs();
});
</script>

<style scoped>
.rcp-body { display: flex; flex-direction: column; gap: 10px; }
.rcp-device { font-size: 15px; font-weight: 600; }
.rcp-tip { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
</style>
