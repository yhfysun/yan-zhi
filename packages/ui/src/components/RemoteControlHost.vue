<template>
  <!-- 被控端伴生组件：确认弹窗（Web UI 即被控端确认面） -->
  <el-dialog
    v-model="promptVisible"
    class="compact-dialog"
    title="远程控制请求"
    width="360px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="rcp-body">
      <div class="rcp-device">{{ pendingDevice }}</div>
      <div class="rcp-tip">请求远程观看并操作本机。拒绝将直接断开；允许后可在设置 → 远程控制查看会话记录。</div>
      <div v-if="displays.length > 1" class="rcp-disp">
        <div class="rcp-label">采集显示器（控制端看到哪块屏）</div>
        <select v-model="captureDisplayId" class="rcp-select">
          <option v-for="d in displays" :key="d.id" :value="d.id">
            {{ (d.primary ? '主显示器 · ' : '') + d.label }}（{{ d.w }}×{{ d.h }}）
          </option>
        </select>
      </div>
      <el-checkbox v-model="trustDevice">信任此设备，之后免确认直连</el-checkbox>
      <el-checkbox v-model="viewOnly">仅观看（不授予操作本机的权限）</el-checkbox>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { API_BASE, buildRequestHeaders, wsUrl } from '../api/client';

/** 多显示器：主进程枚举的单屏信息（bounds 为虚拟屏物理像素，与注入坐标同系） */
interface RcDisplayInfo { id: string; label: string; primary: boolean; x: number; y: number; w: number; h: number }
interface RcElectronAPI {
  rcPrivacy?: (on: boolean) => Promise<unknown>;
  rcDisplays?: () => Promise<{ ok: boolean; displays?: RcDisplayInfo[] }>;
  rcSetCaptureDisplay?: (id: string) => Promise<{ ok: boolean }>;
  /** 会话开始系统通知（明示原则：远控不静默） */
  rcNotify?: (title: string, body: string) => Promise<unknown>;
  /** 托盘「远控中」状态上报（提示 + 一键断开菜单项随之更新） */
  rcSessionState?: (active: boolean, device: string) => Promise<unknown>;
  /** 托盘一键断开 → 在 host WS 上发 session.stop {all:true} */
  onRcDisconnectAll?: (cb: () => void) => void;
  /** 确认弹窗需要被看见：主窗口抬到前台并短暂置顶（远控页是独立子窗口，会压在弹窗上） */
  rcRaisePrompt?: (on: boolean) => Promise<unknown>;
}
const electron = (): RcElectronAPI | null =>
  (window as unknown as { electronAPI?: RcElectronAPI }).electronAPI || null;

/**
 * 只有主窗口承担被控端职责。
 * ★ 独立子窗口（会话/差异/模式窗口，URL 带 szwin=1）也挂 App 因而会渲染本组件：
 *   它们同样轮询 /status，一旦有会话就再开一条 host WS —— 插件侧 hostConn 只有一条，
 *   新连接会把主窗口那条顶掉，主窗口 onclose 随即 teardownPcs()，正在跑的 WebRTC
 *   画面当场冻住，后续「切换显示器」等信令也发到了没有 PeerConnection 的窗口上
 *   （表现为：切屏不生效 / 点一下就卡住）。子窗口只做好自己的事，不碰远控。
 */
const isChildWindow = typeof location !== 'undefined' && /[?&]szwin=1(&|$)/.test(location.hash);

const promptVisible = ref(false);
const pendingDevice = ref('');
const trustDevice = ref(true);
/** 仅观看：允许看画面但不注入输入（会话级，控制端可再请求升级） */
const viewOnly = ref(false);
const pluginEnabled = ref(false);
const connected = ref(false);
const displays = ref<RcDisplayInfo[]>([]);
const captureDisplayId = ref('');
/** 跨公网 ICE 配置（rtc.start 下发；LAN 会话为空数组 = 纯 host candidate 直连） */
const rtcIceServers = ref<{ urls: string[]; username?: string; credential?: string }[]>([]);

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
    syncSessionUi(d.session as Record<string, unknown> | null | undefined);
    const needsWs = !!d.pendingCount || !!d.session;
    if (needsWs && !connected.value) openHostWs();
    else if (!needsWs && connected.value && !pcs.size) teardownWs();
  } catch {
    pluginEnabled.value = false;
  }
}

/** 上次通知过的会话设备（只在空 → 有 的跳变时弹系统通知，避免每轮轮询轰炸） */
let notifiedDevice = '';
/**
 * 会话明示（护栏 10「明示原则」）+ 托盘「远控中」状态（护栏 13）。
 * 以 /status 轮询为唯一真相源：渲染层重载、会话结束、插件停用都会在下一轮自愈，
 * 不依赖 session.started/ended 消息（白名单直连不经过确认弹窗也覆盖）。
 */
function syncSessionUi(sess: Record<string, unknown> | null | undefined): void {
  const api = electron();
  if (!api) return;
  const device = String((sess as { device?: string })?.device || '');
  try {
    void api.rcSessionState?.(!!device, device);
    if (device && device !== notifiedDevice) {
      notifiedDevice = device;
      void api.rcNotify?.('远程控制', `${device} 正在远程观看并操作本机（托盘可一键断开）`);
    } else if (!device) {
      notifiedDevice = '';
    }
  } catch { /* ignore */ }
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
    rtcIceServers.value = [];
    // 会话随 host WS 断开全部结束（服务端同口径）→ 托盘状态立即校正
    try { electron()?.rcSessionState?.(false, ''); } catch { /* ignore */ }
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
      viewOnly.value = false;
      promptVisible.value = true;
      try { void electron()?.rcRaisePrompt?.(true); } catch { /* ignore */ }
      void refreshDisplays(); // 弹窗里的采集显示器下拉框（仅 Electron 宿主有数据）
      break;
    case 'rtc.start':
      // 会话 granted 且走 WebRTC：等控制端的 rtc.offer。跨公网 ICE 配置随本消息下发
      rtcIceServers.value = Array.isArray(msg.iceServers)
        ? (msg.iceServers as { urls: string[]; username?: string; credential?: string }[])
        : [];
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
        electron()?.rcPrivacy?.(on);
      } catch { /* ignore */ }
      ElMessage({ message: on ? '隐私屏已开启（本机屏幕已遮黑）' : '隐私屏已关闭', type: 'info', duration: 2000 });
      break;
    }
    case 'input.request':
      // 只读会话里对方请求操作权限：必须本人当场确认，绝不做静默放行
      void (async () => {
        const sessionId = String(msg.sessionId || '');
        try {
          await ElMessageBox.confirm(
            '对方请求操作本机的权限（当前会话为仅观看）。允许后可移动鼠标、键盘输入。',
            '远程控制 · 请求操作权限',
            { confirmButtonText: '允许操作', cancelButtonText: '保持只读', type: 'warning' },
          );
          ws?.send(JSON.stringify({ type: 'input.grant', sessionId, allow: true }));
        } catch {
          ws?.send(JSON.stringify({ type: 'input.grant', sessionId, allow: false }));
        }
      })();
      break;
    case 'displays.request':
      // 控制端主动要清单：重新枚举后回推（原来只在协商完成时推一次，推丢就没了「显示器」入口）
      void refreshDisplays().then(() => announceDisplays(String(msg.sessionId || '')));
      break;
    case 'display.select':
      // 控制端切换采集显示器：重新采集并 replaceTrack（无需重协商）
      void switchCaptureDisplay(String(msg.sessionId || ''), String(msg.displayId || ''));
      break;
    default:
      break;
  }
}

const pendingConfirmId = ref('');

async function decide(allow: boolean): Promise<void> {
  promptVisible.value = false;
  try { void electron()?.rcRaisePrompt?.(false); } catch { /* ignore */ }
  const confirmId = pendingConfirmId.value;
  pendingConfirmId.value = '';
  if (!confirmId || !ws || ws.readyState !== 1) return;
  if (allow) await applyCaptureDisplay(); // 弹窗选的采集源先对主进程生效，随后 handler 按此挑源
  try {
    ws.send(JSON.stringify({
      type: 'decision',
      confirmId,
      action: allow ? 'allow' : 'deny',
      trust: allow && trustDevice.value,
      readOnly: allow && viewOnly.value,
      ...(allow && captureDisplayId.value ? { displayId: captureDisplayId.value } : {}),
    }));
  } catch { /* ignore */ }
}

/** 显示器枚举（仅 Electron 宿主）：填充弹窗下拉框并把默认选择钉在主屏 */
async function refreshDisplays(): Promise<void> {
  const api = electron();
  if (!api?.rcDisplays) return;
  try {
    const r = await api.rcDisplays();
    if (r?.ok && Array.isArray(r.displays) && r.displays.length) {
      displays.value = r.displays;
      // 记忆的选择已失效（显示器拔掉）→ 回主屏
      if (!r.displays.some((d) => d.id === captureDisplayId.value)) {
        captureDisplayId.value = (r.displays.find((d) => d.primary) || r.displays[0]).id;
      }
    }
  } catch { /* ignore */ }
}

/** 把弹窗/切换菜单选择的采集目标设置给主进程（''=主屏兜底） */
async function applyCaptureDisplay(): Promise<void> {
  const api = electron();
  if (!api?.rcSetCaptureDisplay) return;
  try {
    await api.rcSetCaptureDisplay(captureDisplayId.value);
  } catch { /* ignore */ }
}

/** 采集画面对应的屏幕几何（物理像素）+ 显示器清单 → 插件 → 控制端坐标换算 */
function sendScreenAndDisplays(sessionId: string): void {
  if (!ws || ws.readyState !== 1) return;
  const d = displays.value.find((x) => x.id === captureDisplayId.value)
    || displays.value.find((x) => x.primary)
    || null;
  if (d) {
    ws.send(JSON.stringify({ type: 'rtc.screen', sessionId, x: d.x, y: d.y, w: d.w, h: d.h }));
    ws.send(JSON.stringify({ type: 'displays', sessionId, list: displays.value, current: captureDisplayId.value }));
  } else {
    // 非 Electron 宿主拿不到显示器清单：沿用渲染层 window.screen（主屏假设）
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
}

/** 系统弹条「停止共享」→ 结束会话。用 onended 属性挂接，切换显示器时置 null 防误报 */
function guardTrackEnd(sessionId: string, track: MediaStreamTrack): void {
  track.onended = () => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'session.stop', sessionId }));
    teardownPc(sessionId);
  };
}

/** WebRTC 采集端：getDisplayMedia（主进程 handler 给选中显示器+系统声音）→ 应答 */
async function handleOffer(sessionId: string, sdp: string): Promise<void> {
  if (!sdp) return;
  try {
    await applyCaptureDisplay();
    await refreshDisplays();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    // 重连场景同一会话可能已有一条旧连接：先拆再建，避免泄漏
    teardownPc(sessionId);
    // LAN：host candidate 直连；跨公网：STUN 打洞 / TURN 中继（配置随 rtc.start 下发）
    const conn = new RTCPeerConnection(rtcIceServers.value.length ? { iceServers: rtcIceServers.value } : {});
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
    const vt = stream.getVideoTracks()[0];
    if (vt) {
      // 屏幕内容：让编码器按「细节优先」并保住帧率 —— 默认降级策略会先砍帧率/分辨率，观感就是卡与糊
      try { (vt as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail'; } catch { /* ignore */ }
      guardTrackEnd(sessionId, vt);
    }
    await conn.setRemoteDescription({ type: 'offer', sdp });
    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);
    try {
      for (const sender of conn.getSenders()) {
        if (sender.track?.kind !== 'video') continue;
        const p = sender.getParameters();
        p.degradationPreference = 'maintain-framerate';
        await sender.setParameters(p);
      }
    } catch { /* 个别内核不支持该参数：用默认策略 */ }
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'rtc.answer', sessionId, sdp: conn.localDescription?.sdp || answer.sdp }));
      sendScreenAndDisplays(sessionId);
    }
  } catch (e) {
    // 采集/协商失败：不要直接 session.stop（那会把整个会话断掉），把原因转给控制端，
    // 由它立即改用兼容模式（JPEG），用户至少还有画面可用。
    const reason = (e as Error)?.message || '屏幕采集失败';
    ElMessage.warning(`屏幕采集失败，远控将使用兼容模式（JPEG）：${reason}`);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'rtc.failed', sessionId, reason }));
    }
  }
}

/** 把「当前真实采集目标」回推给控制端（切屏失败时让下拉回退到实际画面） */
function announceDisplays(sessionId: string): void {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'displays', sessionId, list: displays.value, current: captureDisplayId.value }));
}

/** 采集请求兜底超时：Electron 的 getDisplayMedia 偶发不回调，不能让它把切换流程永远挂住 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** 会话中切换采集显示器（控制端发起）：重新采集 → replaceTrack（无需重协商）→ 推新几何 */
async function switchCaptureDisplay(sessionId: string, displayId: string): Promise<void> {
  if (!displayId) return;
  const prevId = captureDisplayId.value;
  const conn = pcs.get(sessionId);
  if (!conn) {
    // 没有 PeerConnection = 本条信令落到了不持有画面的窗口（或会话已重连）
    announceDisplays(sessionId);
    ElMessage.warning('当前窗口没有这条远控连接，切屏未执行');
    return;
  }
  captureDisplayId.value = displayId;
  await applyCaptureDisplay();
  try {
    const stream = await withTimeout(
      navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }),
      8000,
      '重新采集超时',
    );
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      for (const t of stream.getTracks()) t.stop();
      throw new Error('采集流无视频轨');
    }
    // 新采集附带的音轨直接停掉：沿用原会话音轨，避免系统声音被二次回采
    for (const t of stream.getAudioTracks()) t.stop();
    const sender = conn.getSenders().find((x) => x.track?.kind === 'video');
    if (!sender) {
      for (const t of stream.getTracks()) t.stop();
      throw new Error('连接上没有视频发送器');
    }
    const old = sender.track;
    await sender.replaceTrack(videoTrack);
    if (old) {
      old.onended = null;
      try { old.stop(); } catch { /* ignore */ }
    }
    guardTrackEnd(sessionId, videoTrack);
    await refreshDisplays();
    sendScreenAndDisplays(sessionId);
    ElMessage({ message: '采集显示器已切换', type: 'success', duration: 2000 });
  } catch (e) {
    // 回滚采集目标：否则下次重连会采到用户并没选中的那块屏
    captureDisplayId.value = prevId;
    await applyCaptureDisplay();
    announceDisplays(sessionId);
    ElMessage.warning(`切换显示器失败：${(e as Error)?.message || '采集不可用'}`);
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
  if (isChildWindow) return; // 子窗口不参与被控端（见 isChildWindow 注释）
  // 托盘「一键断开」：主进程菜单 → 这里在 host WS 上发 session.stop {all:true}
  electron()?.onRcDisconnectAll?.(() => {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'session.stop', all: true }));
      } catch { /* ignore */ }
    }
  });
  void poll();
  pollTimer = window.setInterval(() => void poll(), 6000);
});
onBeforeUnmount(() => {
  if (isChildWindow) return; // 子窗口从未登记，别把主窗口的「远控中」状态清掉
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  // 组件卸载后没人再轮询上报 → 托盘状态必须立刻清掉（防「远控中」角标永久残留）
  try { electron()?.rcSessionState?.(false, ''); } catch { /* ignore */ }
  teardownWs();
  teardownPcs();
});
</script>

<style scoped>
.rcp-body { display: flex; flex-direction: column; gap: 10px; }
.rcp-device { font-size: 15px; font-weight: 600; }
.rcp-tip { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
.rcp-disp { display: flex; flex-direction: column; gap: 6px; }
.rcp-label { font-size: 12px; color: var(--el-text-color-secondary); }
.rcp-select { width: 100%; }
</style>
