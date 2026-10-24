<template>
  <div class="rc-page" :class="{ immersive: immersive }">
    <!-- ============ 配对/设置阶段 ============ -->
    <div v-if="phase === 'setup' || phase === 'pending' || phase === 'ended'" class="rc-setup">
      <div class="rc-card">
        <div class="rc-brand">
          <span class="rc-logo">言智 · 远程控制</span>
          <span class="rc-sub">连接到局域网内运行言智的电脑</span>
        </div>

        <template v-if="phase === 'setup' || phase === 'ended'">
          <div v-if="phase === 'ended'" class="rc-end-reason">{{ endedReason || '会话已结束' }}</div>
          <label class="rc-label">被控端地址</label>
          <input v-model="form.host" class="rc-input" placeholder="http://192.168.1.100:3001（同源时无需修改）" spellcheck="false" />
          <label class="rc-label">授权码</label>
          <input
            v-model="form.code" class="rc-input rc-code" placeholder="被控端「设置 → 局域网」或插件页查看"
            spellcheck="false" autocomplete="off" @keyup.enter="pair" />
          <button class="rc-btn rc-btn-primary" :disabled="pairing || !form.code.trim()" @click="pair">
            {{ pairing ? '配对中…' : '连接' }}
          </button>
          <div class="rc-hint">首次连接需要在被控端电脑上点击确认；可勾选「信任此设备」后免确认直连。</div>
        </template>

        <template v-else-if="phase === 'pending'">
          <div class="rc-waiting">
            <div class="rc-spinner"></div>
            <div class="rc-wait-title">正在等待被控端确认…</div>
            <div class="rc-wait-sub">请在电脑上查看「远程控制」确认弹窗，点击允许</div>
          </div>
          <button class="rc-btn" @click="abortPair">取消</button>
        </template>
      </div>
    </div>

    <!-- ============ 会话中 ============ -->
    <div
      v-show="phase === 'live'" ref="stageRef" class="rc-stage"
      @contextmenu.prevent
      @pointerdown="onStagePointerDown" @pointermove="onStagePointerMove" @pointerup="onStagePointerUp" @pointercancel="onStagePointerUp"
      @wheel.prevent="onStageWheel"
      @dblclick="toggleFullscreen"
      @touchstart.passive="markTouch" @touchmove.passive="markTouch" @touchend.passive="markTouch"
    >
      <video v-show="mode === 'webrtc'" ref="videoRef" class="rc-video" autoplay playsinline muted></video>
      <canvas v-show="mode === 'jpeg'" ref="canvasRef" class="rc-video"></canvas>

      <!-- 顶部工具条：普通模式可见，全屏沉浸时隐藏 -->
      <div class="rc-toolbar" :class="{ hidden: immersive && !toolbarPeek }">
        <button class="rc-tbtn" @click="disconnect">← 断开</button>
        <span class="rc-status">{{ statusText }}</span>
        <select v-if="mode === 'jpeg'" v-model="qualityPreset" class="rc-select" @change="applyQuality">
          <option value="smooth">流畅</option>
          <option value="balance">均衡</option>
          <option value="sharp">清晰</option>
        </select>
        <button class="rc-tbtn" @click="toggleFullscreen">{{ immersive ? '退出全屏' : '全屏' }}</button>
      </div>

      <!-- 悬浮球：全屏沉浸时的唯一常驻控件（点按呼出，3s 无操作自动隐藏） -->
      <div
        v-show="immersive" ref="ballRef" class="rc-ball" :class="{ hidden: ballHidden }"
        @pointerdown.stop="onBallPointerDown" @click.stop="ballMenuOpen = !ballMenuOpen"
      >⌨</div>
      <div v-if="immersive && ballMenuOpen" class="rc-ball-menu" :style="ballMenuStyle">
        <button class="rc-mbtn" @click.stop="openKeyboardPanel">键盘输入</button>
        <button class="rc-mbtn" @click.stop="toggleFullscreen">{{ immersive ? '退出全屏' : '全屏' }}</button>
        <button class="rc-mbtn danger" @click.stop="disconnect">断开连接</button>
      </div>

      <!-- 键盘整串输入面板（软键盘组字完成后一次性发送） -->
      <div v-if="kbPanelOpen" class="rc-kbpanel" @pointerdown.stop @click.stop>
        <textarea v-model="kbText" class="rc-kb-text" rows="3" placeholder="输入文字（支持中文输入法），发送后注入到被控端"></textarea>
        <div class="rc-kb-actions">
          <button class="rc-btn rc-btn-primary" @click="sendKbText">发送 (Enter)</button>
          <button class="rc-btn" @click="kbPanelOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 远程控制 · 控制端页（/remote，bare+guest 路由）。
 *
 * 通道：配对（授权码/设备令牌）→ WS（信令 + 输入 + JPEG 回退帧）→ WebRTC 视频主通道。
 * 沉浸模式：Fullscreen + 隐藏全部 UI，仅剩可拖动悬浮球（点按呼出 / 3s 自动隐藏）——
 * 「放大后跟直接操作电脑一样」的落点在本页。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

type Phase = 'setup' | 'pending' | 'live' | 'ended';
interface ScreenRect { x: number; y: number; w: number; h: number }

const phase = ref<Phase>('setup');
const pairing = ref(false);
const endedReason = ref('');
const mode = ref<'' | 'webrtc' | 'jpeg'>('');
const screen = ref<ScreenRect>({ x: 0, y: 0, w: 0, h: 0 });
const immersive = ref(false);
const toolbarPeek = ref(false);
const ballHidden = ref(false);
const ballMenuOpen = ref(false);
const kbPanelOpen = ref(false);
const kbText = ref('');
const qualityPreset = ref<'smooth' | 'balance' | 'sharp'>('balance');
const statusText = computed(() => {
  if (mode.value === 'webrtc') return 'WebRTC 已连接';
  if (mode.value === 'jpeg') return '兼容模式已连接';
  return '连接中…';
});

const form = reactive({ host: window.location.origin, code: '' });
const stageRef = ref<HTMLElement>();
const videoRef = ref<HTMLVideoElement>();
const canvasRef = ref<HTMLCanvasElement>();
const ballRef = ref<HTMLElement>();
const ballMenuStyle = ref<Record<string, string>>({ right: '24px', bottom: '96px' });

let ws: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let remoteStream: MediaStream | null = null;
let sessionToken = '';
let sessionId = '';
let base = window.location.origin;
let webrtcWatchdog: number | null = null;
let pingTimer: number | null = null;
let ballHideTimer: number | null = null;
let jpegBitmap: ImageBitmap | null = null;

// ---- 设备身份（每个被控端一套 deviceId/deviceToken，存 localStorage）----
const identityKey = (b: string) => `rc:identity:${b}`;
function loadIdentity(b: string): { deviceId: string; deviceToken?: string } {
  try {
    const raw = localStorage.getItem(identityKey(b));
    if (raw) return JSON.parse(raw);
  } catch { /* 损坏则重建 */ }
  const id = crypto.randomUUID();
  localStorage.setItem(identityKey(b), JSON.stringify({ deviceId: id }));
  return { deviceId: id };
}
function saveIdentity(b: string, token?: string): void {
  const id = loadIdentity(b);
  if (token) {
    localStorage.setItem(identityKey(b), JSON.stringify({ ...id, deviceToken: token }));
  }
}
function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : '浏览器';
  return (/Mobi|Android|iPhone/.test(ua) ? '移动端 ' : '桌面 ') + os;
}

const normBase = (b: string) => b.trim().replace(/\/+$/, '') || window.location.origin;
const apiOf = (b: string, p: string) => `${normBase(b)}/api/plugin/remote-control${p}`;
const wsOf = (b: string, p: string) => {
  const u = new URL(normBase(b));
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${u.origin}/api/plugin/remote-control${p}`;
};

// ---- 配对 ----
async function pair(): Promise<void> {
  const code = form.code.trim();
  if (!code) return;
  pairing.value = true;
  base = normBase(form.host);
  const id = loadIdentity(base);
  try {
    const res = await fetch(apiOf(base, '/pair'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        deviceId: id.deviceId,
        deviceToken: id.deviceToken,
        deviceName: deviceName(),
      }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    const d = body.data || {};
    if (d.deviceToken) saveIdentity(base, d.deviceToken);
    if (d.status === 'granted' && d.token) {
      sessionToken = d.token;
      openWs(`token=${encodeURIComponent(sessionToken)}`);
    } else if (d.status === 'pending' && d.confirmId) {
      phase.value = 'pending';
      openWs(`confirmId=${encodeURIComponent(d.confirmId)}`);
    } else {
      throw new Error('配对响应异常');
    }
  } catch (e) {
    ElMessage.error((e as Error)?.message || '配对失败');
  } finally {
    pairing.value = false;
  }
}
function abortPair(): void {
  cleanup();
  phase.value = 'setup';
}

// ---- WS ----
function openWs(qs: string): void {
  cleanupSocket();
  let sock: WebSocket;
  try {
    sock = new WebSocket(wsOf(base, `/session/ws?${qs}`));
  } catch (e) {
    ElMessage.error((e as Error)?.message || '连接失败');
    phase.value = 'setup';
    return;
  }
  sock.binaryType = 'arraybuffer';
  ws = sock;
  sock.onopen = () => {
    if (phase.value === 'setup' && sessionToken) phase.value = 'live';
    pingTimer = window.setInterval(() => send({ type: 'ping', t: Date.now() }), 10_000);
  };
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      onJpegFrame(ev.data as ArrayBuffer);
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    void onWsMessage(msg);
  };
  sock.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (phase.value !== 'ended' && phase.value !== 'setup') {
      phase.value = 'setup';
      ElMessage.error('连接已断开');
    }
  };
  sock.onerror = () => { /* onclose 统一收尾 */ };
}

async function onWsMessage(msg: Record<string, unknown>): Promise<void> {
  const type = String(msg.type || '');
  switch (type) {
    case 'pair.pending':
      phase.value = 'pending';
      break;
    case 'session.granted': {
      phase.value = 'live';
      sessionId = String(msg.sessionId || '');
      if (!sessionToken) sessionToken = String(msg.token || '');
      if (msg.deviceToken) saveIdentity(base, String(msg.deviceToken));
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) screen.value = msg.screen as ScreenRect;
      if (m === 'webrtc') startWebRtc();
      break;
    }
    case 'session.resume':
      phase.value = 'live';
      setMode(String(msg.mode || '') as 'webrtc' | 'jpeg');
      break;
    case 'session.mode': {
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) screen.value = msg.screen as ScreenRect;
      break;
    }
    case 'screen.info':
      screen.value = msg.screen as ScreenRect;
      break;
    case 'rtc.answer':
      if (pc) {
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: String(msg.sdp || '') });
        } catch (e) {
          console.warn('[rc] setRemoteDescription 失败', e);
        }
      }
      break;
    case 'rtc.ice':
      if (pc && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
        } catch { /* LAN 直连下个别 candidate 失败可忽略 */ }
      }
      break;
    case 'input.rejected':
      ElMessage.warning(String(msg.reason || '输入被拒绝'));
      break;
    case 'session.ended':
      endedReason.value = String(msg.reason || '会话已结束');
      cleanup();
      phase.value = 'ended';
      break;
    default:
      break;
  }
}

function setMode(m: 'webrtc' | 'jpeg'): void {
  mode.value = m;
  if (m === 'jpeg') {
    teardownWebRtc();
  } else {
    // WebRTC 起不来（无 host 渲染层 / 全被拦）时 12s 无画面自动降级 JPEG
    if (webrtcWatchdog) clearTimeout(webrtcWatchdog);
    webrtcWatchdog = window.setTimeout(() => {
      if (mode.value === 'webrtc' && !videoRef.value?.srcObject) send({ type: 'use.jpeg' });
    }, 12_000);
  }
}

// ---- WebRTC（主通道）----
function startWebRtc(): void {
  teardownWebRtc();
  const conn = new RTCPeerConnection(); // LAN 内 host candidate 直连，无需 STUN
  pc = conn;
  conn.ontrack = (e) => {
    remoteStream = e.streams[0] || new MediaStream([e.track]);
    if (videoRef.value) {
      videoRef.value.srcObject = remoteStream;
      void videoRef.value.play().catch(() => undefined);
    }
    if (webrtcWatchdog) {
      clearTimeout(webrtcWatchdog);
      webrtcWatchdog = null;
    }
  };
  conn.onicecandidate = (e) => {
    if (e.candidate) send({ type: 'rtc.ice', candidate: e.candidate.toJSON() });
  };
  conn.addTransceiver('video', { direction: 'recvonly' });
  conn.addTransceiver('audio', { direction: 'recvonly' });
  void conn.createOffer().then(async (offer) => {
    await conn.setLocalDescription(offer);
    send({ type: 'rtc.offer', sdp: conn.localDescription?.sdp || offer.sdp || '' });
  });
}

function teardownWebRtc(): void {
  if (webrtcWatchdog) {
    clearTimeout(webrtcWatchdog);
    webrtcWatchdog = null;
  }
  try {
    pc?.close();
  } catch { /* ignore */ }
  pc = null;
  remoteStream = null;
}

// ---- JPEG 回退通道 ----
function onJpegFrame(data: ArrayBuffer): void {
  if (mode.value !== 'jpeg' || !canvasRef.value) return;
  void createImageBitmap(new Blob([data], { type: 'image/jpeg' })).then((bmp) => {
    if (jpegBitmap) jpegBitmap.close();
    jpegBitmap = bmp;
    const c = canvasRef.value;
    if (!c) return;
    if (c.width !== bmp.width || c.height !== bmp.height) {
      c.width = bmp.width;
      c.height = bmp.height;
    }
    const ctx = c.getContext('2d');
    ctx?.drawImage(bmp, 0, 0);
  }).catch(() => undefined);
}

const QUALITY_PRESETS: Record<string, { fps: number; scale: number; quality: number }> = {
  smooth: { fps: 8, scale: 0.6, quality: 50 },
  balance: { fps: 10, scale: 0.8, quality: 60 },
  sharp: { fps: 12, scale: 1, quality: 70 },
};
function applyQuality(): void {
  const p = QUALITY_PRESETS[qualityPreset.value];
  if (p) send({ type: 'set.quality', ...p });
}
watch(qualityPreset, applyQuality);

// ---- 输入：指针（触屏=鼠标）----
interface ActivePointer { x: number; y: number }
const pointers = new Map<number, ActivePointer>();
let downPos: { x: number; y: number } | null = null;
let dragging = false;
let suppressUp = false;
let longPressTimer: number | null = null;
let lastMoveSent = 0;
let pinchLastDy: number | null = null;

const toScreen = (clientX: number, clientY: number): { x: number; y: number } | null => {
  const el = (mode.value === 'webrtc' ? videoRef.value : canvasRef.value) as HTMLElement | null;
  if (!el) return null;
  if (screen.value.w <= 0 || screen.value.h <= 0) return null; // 屏幕几何未知时禁输入
  const r = el.getBoundingClientRect();
  const nx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  const ny = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  return {
    x: Math.round(screen.value.x + nx * screen.value.w),
    y: Math.round(screen.value.y + ny * screen.value.h),
  };
};
const input = (msg: Record<string, unknown>): void => {
  if (phase.value !== 'live') return;
  send({ type: 'input', ...msg });
};

function onStagePointerDown(e: PointerEvent): void {
  ballMenuOpen.value = false;
  peekToolbar();
  wakeBall();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size > 1) {
    // 双指 = 滚动模式：撤掉已按下的左键，避免误点
    if (dragging && !suppressUp && downPos) input({ action: 'up', ...toScreen(downPos.x, downPos.y), button: 'left' });
    dragging = false;
    pinchLastDy = null;
    clearLongPress();
    return;
  }
  const p = toScreen(e.clientX, e.clientY);
  if (!p) return;
  downPos = { x: e.clientX, y: e.clientY };
  suppressUp = false;
  dragging = false;
  input({ action: 'down', ...p, button: 'left' });
  clearLongPress();
  longPressTimer = window.setTimeout(() => {
    // 长按 = 右键：补抬左键 + 右键单击
    suppressUp = true;
    if (navigator.vibrate) navigator.vibrate(30);
    input({ action: 'up', ...p, button: 'left' });
    input({ action: 'click', ...p, button: 'right' });
  }, 550);
}

function onStagePointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    // 双指滚动：取第一根手指的纵向位移（手指下滑 = 内容下滚 = 注入负 delta）
    const pts = [...pointers.values()];
    if (pinchLastDy !== null) {
      const dy = pts[0].y - pinchLastDy;
      if (dy !== 0) {
        const p = toScreen(e.clientX, e.clientY);
        if (p) input({ action: 'wheel', ...p, delta: Math.max(-400, Math.min(400, -Math.round(dy))) });
      }
    }
    pinchLastDy = pts[0].y;
    return;
  }
  if (!downPos) return;
  const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  if (!dragging && dist > 6) {
    dragging = true;
    clearLongPress();
  }
  if (dragging) {
    const now = Date.now();
    if (now - lastMoveSent < 30) return; // 30ms 节流，注入速率上限 ~33/s
    lastMoveSent = now;
    const p = toScreen(e.clientX, e.clientY);
    if (p) input({ action: 'move', ...p });
  }
}

function onStagePointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchLastDy = null;
  clearLongPress();
  if (suppressUp) {
    suppressUp = false;
    downPos = null;
    dragging = false;
    return;
  }
  if (downPos) {
    const p = toScreen(e.clientX, e.clientY) || { x: screen.value.x, y: screen.value.y };
    input({ action: 'up', ...p, button: 'left' });
  }
  downPos = null;
  dragging = false;
}

function onStageWheel(e: WheelEvent): void {
  const p = toScreen(e.clientX, e.clientY);
  if (!p) return;
  const delta = Math.max(-400, Math.min(400, -Math.round(e.deltaY)));
  input({ action: 'wheel', ...p, delta });
}

function clearLongPress(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}
function markTouch(): void {
  wakeBall();
  peekToolbar();
}

// ---- 输入：键盘（直通 + 整串）----
const KEY_MAP: Record<string, string> = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'esc', Delete: 'delete',
  Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
function onKeyDown(e: KeyboardEvent): void {
  if (phase.value !== 'live') return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
  const inImmersive = immersive.value;
  // 修饰组合键：ctrl/alt/meta + 任意键 → 组合键注入
  if (e.ctrlKey || e.altKey || e.metaKey) {
    const keys: string[] = [];
    if (e.ctrlKey || e.metaKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    const k = e.key.length === 1 ? e.key.toLowerCase() : KEY_MAP[e.key];
    if (!k) return;
    keys.push(k);
    e.preventDefault();
    e.stopPropagation();
    input({ action: 'key', keys });
    return;
  }
  // 功能键/导航键直通
  if (KEY_MAP[e.key] || /^F\d{1,2}$/.test(e.key)) {
    if (!inImmersive) return;
    e.preventDefault();
    input({ action: 'key', keys: [KEY_MAP[e.key] || e.key.toLowerCase()] });
    return;
  }
  // 普通字符（含中文输入法组字完成后的单发）：整串注入
  if (e.key.length === 1 && inImmersive) {
    e.preventDefault();
    input({ action: 'type', text: e.key });
  }
}
function onCompositionEnd(e: CompositionEvent): void {
  if (phase.value !== 'live' || !e.data) return;
  input({ action: 'type', text: e.data });
}
function sendKbText(): void {
  const t = kbText.value;
  if (!t) return;
  input({ action: 'type', text: t });
  kbText.value = '';
  kbPanelOpen.value = false;
}
function openKeyboardPanel(): void {
  kbPanelOpen.value = true;
  ballMenuOpen.value = false;
}

// ---- 全屏沉浸 + 悬浮球 ----
async function toggleFullscreen(): Promise<void> {
  const el = stageRef.value;
  if (!el) return;
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // iOS Safari 不支持 Fullscreen API：降级为「伪全屏」（本页是 bare 路由，藏 UI 即可）
    immersive.value = !immersive.value;
  }
}
function onFullscreenChange(): void {
  immersive.value = !!document.fullscreenElement;
  if (!immersive.value) {
    ballMenuOpen.value = false;
    kbPanelOpen.value = false;
  }
}
function peekToolbar(): void {
  if (!immersive.value) return;
  toolbarPeek.value = true;
  window.setTimeout(() => {
    toolbarPeek.value = false;
  }, 2500);
}
function wakeBall(): void {
  ballHidden.value = false;
  if (ballHideTimer) clearTimeout(ballHideTimer);
  ballHideTimer = window.setTimeout(() => {
    ballHidden.value = true;
    ballMenuOpen.value = false;
  }, 3000);
}
// 悬浮球拖动（吸附左右边缘）
let ballDrag: { startX: number; startY: number; left: number; top: number } | null = null;
function onBallPointerDown(e: PointerEvent): void {
  const ball = ballRef.value;
  if (!ball) return;
  const r = ball.getBoundingClientRect();
  ballDrag = { startX: e.clientX, startY: e.clientY, left: r.left, top: r.top };
  ball.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent): void => {
    if (!ballDrag) return;
    const dx = ev.clientX - ballDrag.startX;
    const dy = ev.clientY - ballDrag.startY;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const left = Math.max(8, Math.min(w - 64, ballDrag.left + dx));
    const top = Math.max(8, Math.min(h - 64, ballDrag.top + dy));
    ball.style.left = `${left}px`;
    ball.style.top = `${top}px`;
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
  };
  const up = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    // 移动量很小才算「点按」
    if (ballDrag && Math.hypot(ev.clientX - ballDrag.startX, ev.clientY - ballDrag.startY) < 6) {
      ballMenuOpen.value = !ballMenuOpen.value;
      positionBallMenu();
    }
    ballDrag = null;
    wakeBall();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
function positionBallMenu(): void {
  const ball = ballRef.value;
  if (!ball) return;
  const r = ball.getBoundingClientRect();
  const nearBottom = r.top > window.innerHeight / 2;
  ballMenuStyle.value = {
    left: `${Math.max(8, r.left - 90)}px`,
    [nearBottom ? 'bottom' : 'top']: nearBottom
      ? `${window.innerHeight - r.bottom + 52}px`
      : `${r.bottom + 8}px`,
  };
}

// ---- 生命周期 ----
function send(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* ignore */ }
  }
}
function cleanupSocket(): void {
  if (ws) {
    try {
      ws.close();
    } catch { /* ignore */ }
    ws = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}
function disconnect(): void {
  endedReason.value = '已断开连接';
  cleanup();
  phase.value = 'ended';
}
function cleanup(): void {
  cleanupSocket();
  teardownWebRtc();
  if (videoRef.value) videoRef.value.srcObject = null;
  if (jpegBitmap) {
    jpegBitmap.close();
    jpegBitmap = null;
  }
  sessionToken = '';
  sessionId = '';
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  immersive.value = false;
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('compositionend', onCompositionEnd, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('compositionend', onCompositionEnd, true);
  cleanup();
  if (ballHideTimer) clearTimeout(ballHideTimer);
});
</script>

<style scoped>
.rc-page { position: fixed; inset: 0; background: #101418; color: #e6eaf0; font-family: inherit; z-index: 100; }
.rc-setup { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
.rc-card { width: min(420px, 100%); background: #171c23; border: 1px solid #262d38; border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
.rc-brand { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.rc-logo { font-size: 20px; font-weight: 700; }
.rc-sub { font-size: 13px; color: #8a94a3; }
.rc-label { font-size: 12px; color: #8a94a3; }
.rc-input { background: #10151b; border: 1px solid #2a323e; border-radius: 8px; padding: 10px 12px; color: inherit; font-size: 14px; outline: none; }
.rc-input:focus { border-color: #4c8dff; }
.rc-code { letter-spacing: 2px; font-size: 18px; text-align: center; }
.rc-btn { border: 1px solid #2a323e; background: #1d242e; color: inherit; border-radius: 8px; padding: 10px 14px; font-size: 14px; cursor: pointer; }
.rc-btn:disabled { opacity: 0.5; cursor: default; }
.rc-btn-primary { background: #2f6bff; border-color: #2f6bff; }
.rc-btn-primary:disabled { background: #2f6bff55; }
.rc-hint { font-size: 12px; color: #6d7684; line-height: 1.6; }
.rc-end-reason { background: #2a1f22; border: 1px solid #4a3038; color: #f0b6c2; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.rc-waiting { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 0 6px; }
.rc-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #2a323e; border-top-color: #4c8dff; animation: rc-spin 0.9s linear infinite; }
@keyframes rc-spin { to { transform: rotate(360deg); } }
.rc-wait-title { font-size: 15px; font-weight: 600; }
.rc-wait-sub { font-size: 12px; color: #8a94a3; }

.rc-stage { position: absolute; inset: 0; overflow: hidden; background: #000; }
.rc-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; touch-action: none; }
.rc-toolbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0)); transition: opacity 0.25s; z-index: 5; }
.rc-toolbar.hidden { opacity: 0; pointer-events: none; }
.rc-status { font-size: 12px; color: #b9c2cf; flex: 1; }
.rc-tbtn { background: rgba(23,28,35,0.8); border: 1px solid #2a323e; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.rc-tbtn:hover { border-color: #4c8dff; }
.rc-select { background: #171c23; color: inherit; border: 1px solid #2a323e; border-radius: 8px; padding: 5px 8px; font-size: 13px; }

.rc-ball { position: absolute; right: 24px; bottom: 96px; width: 44px; height: 44px; border-radius: 50%; background: rgba(47,107,255,0.85); display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: grab; box-shadow: 0 4px 16px rgba(0,0,0,0.45); transition: opacity 0.3s; z-index: 8; user-select: none; touch-action: none; }
.rc-ball.hidden { opacity: 0.12; }
.rc-ball-menu { position: absolute; display: flex; flex-direction: column; gap: 6px; background: #171c23; border: 1px solid #2a323e; border-radius: 10px; padding: 8px; z-index: 9; min-width: 130px; }
.rc-mbtn { background: transparent; border: none; color: inherit; text-align: left; padding: 8px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.rc-mbtn:hover { background: #232b36; }
.rc-mbtn.danger { color: #f0909d; }

.rc-kbpanel { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(480px, 92%); background: #171c23; border: 1px solid #2a323e; border-radius: 12px; padding: 12px; z-index: 10; }
.rc-kb-text { width: 100%; background: #10151b; border: 1px solid #2a323e; border-radius: 8px; color: inherit; padding: 8px 10px; font-size: 14px; resize: none; outline: none; box-sizing: border-box; }
.rc-kb-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
</style>
