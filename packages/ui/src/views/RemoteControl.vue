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
          <button class="rc-btn" :disabled="pairing" @click="startScan">📷 扫码连接</button>
          <div class="rc-hint">首次连接需要在被控端电脑上点击确认；可勾选「信任此设备」后免确认直连。</div>
          <div class="rc-hint">跨公网：这里填被控端的公网地址（端口需放行或走内网穿透），并在被控端插件设置开启「允许非内网配对」。</div>
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

      <!-- 扫码浮层：摄像头取景解码（jsQR），对准被控端设置页二维码即可直达连接 -->
      <div v-if="scanning" class="rc-scan" @click.self="stopScan">
        <div class="rc-scan-box">
          <video ref="scanVideoRef" class="rc-scan-video" autoplay playsinline muted></video>
          <div class="rc-scan-tip">对准被控端「设置 → 局域网」的二维码</div>
          <div v-if="scanError" class="rc-scan-err">{{ scanError }}</div>
          <button class="rc-btn" @click="stopScan">取消</button>
        </div>
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
      @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onFileDrop"
    >
      <video
        v-show="mode === 'webrtc'" ref="videoRef" class="rc-video" autoplay playsinline muted
        :style="mediaStyle" @loadedmetadata="syncNativeFromVideo" @resize="syncNativeFromVideo"
      ></video>
      <canvas v-show="mode === 'jpeg'" ref="canvasRef" class="rc-video" :style="mediaStyle"></canvas>

      <!-- JPEG 模式远端光标（GDI 采集不含指针，客户端自绘） -->
      <div class="rc-cursor" :style="cursorStyle">
        <svg width="18" height="24" viewBox="0 0 18 24"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.5 L10 13 L16 13 Z" fill="#fff" stroke="#000" stroke-width="1.4"/></svg>
      </div>

      <!-- 顶部工具条：普通模式可见，全屏沉浸时隐藏 -->
      <div class="rc-toolbar" :class="{ hidden: immersive && !toolbarPeek }">
        <button class="rc-tbtn" @click="disconnect">← 断开</button>
        <span class="rc-status">{{ statusText }}</span>
        <select v-if="mode === 'jpeg'" v-model="qualityPreset" class="rc-select" @change="applyQuality">
          <option value="smooth">流畅</option>
          <option value="balance">均衡</option>
          <option value="sharp">清晰</option>
        </select>
        <select
          v-if="displays.length > 1" v-model="currentDisplay"
          class="rc-select" title="采集显示器" @change="selectDisplay(currentDisplay)"
        >
          <option v-for="d in displays" :key="d.id" :value="d.id">{{ displayLabel(d) }}</option>
        </select>
        <button class="rc-tbtn" @click="toggleZoom">{{ zoomLabel }}</button>
        <button class="rc-tbtn" @click="toggleFullscreen">{{ immersive ? '退出全屏' : '全屏' }}</button>
      </div>

      <!-- 悬浮球：全屏沉浸时的唯一常驻控件（拖动定位，点按呼出菜单，3s 无操作自动隐藏） -->
      <div
        v-show="immersive" ref="ballRef" class="rc-ball" :class="{ hidden: ballHidden }"
        @pointerdown.stop="onBallPointerDown"
      >⚙</div>
      <div v-if="immersive && ballMenuOpen" class="rc-ball-menu" :style="ballMenuStyle" @pointerdown.stop>
        <button class="rc-mbtn" @click.stop="openKeyboardPanel">⌨ 键盘输入</button>
        <button class="rc-mbtn" @click.stop="openFilePanel">🗂 文件传输</button>
        <button class="rc-mbtn" @click.stop="openClipboardPanel">📋 剪贴板</button>
        <button class="rc-mbtn" @click.stop="toggleAudio">{{ audioOn ? '🔊 音频转发：开' : '🔇 音频转发：关' }}</button>
        <template v-if="displays.length > 1">
          <div class="rc-menu-label">🖥 采集显示器</div>
          <button
            v-for="d in displays" :key="d.id" class="rc-mbtn disp"
            :class="{ active: currentDisplay === d.id }" @click.stop="selectDisplay(d.id)"
          >{{ displayLabel(d) }}</button>
        </template>
        <button class="rc-mbtn" @click.stop="toggleZoom">{{ zoomLabel }}</button>
        <button class="rc-mbtn" @click.stop="toggleFullscreen">{{ immersive ? '⛶ 退出全屏' : '⛶ 全屏' }}</button>
        <button class="rc-mbtn danger" @click.stop="disconnect">✕ 断开连接</button>
      </div>

      <!-- 键盘整串输入面板（软键盘组字完成后一次性发送） -->
      <div v-if="kbPanelOpen" class="rc-panel" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">键盘输入<button class="rc-panel-x" @click="kbPanelOpen = false">✕</button></div>
        <textarea v-model="kbText" class="rc-panel-text" rows="3" placeholder="输入文字（支持中文输入法），发送后整串注入被控端"></textarea>
        <div class="rc-panel-actions">
          <button class="rc-btn rc-btn-primary" @click="sendKbText">发送 (Enter)</button>
        </div>
      </div>

      <!-- 剪贴板面板（纯文本；全屏下 Ctrl+V 直通注入 = 用被控端剪贴板粘贴） -->
      <div v-if="clipPanelOpen" class="rc-panel" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">剪贴板互通<button class="rc-panel-x" @click="clipPanelOpen = false">✕</button></div>
        <textarea v-model="clipText" class="rc-panel-text" rows="4" placeholder="把要发送的内容粘贴到这里；「取远端」会把被控端剪贴板填进来"></textarea>
        <div class="rc-panel-actions">
          <button class="rc-btn rc-btn-primary" :disabled="!clipText.trim() || clipBusy" @click="sendClipboard">发送到被控端</button>
          <button class="rc-btn" :disabled="clipBusy" @click="pullClipboard">取被控端剪贴板</button>
          <span v-if="clipBusy" class="rc-busy">…</span>
        </div>
        <div class="rc-hint">全屏下直接 Ctrl+V 会把按键注入被控端（粘贴其本地剪贴板）。</div>
      </div>

      <!-- 文件面板（发送 → 被控端接收目录；列表/下载 ← 接收目录） -->
      <div v-if="filePanelOpen" class="rc-panel rc-panel-wide" @pointerdown.stop @click.stop>
        <div class="rc-panel-head">文件传输<button class="rc-panel-x" @click="filePanelOpen = false">✕</button></div>
        <div
          class="rc-file-drop" :class="{ over: fileDrag }"
          @dragover.prevent="fileDrag = true" @dragleave.prevent="fileDrag = false" @drop.prevent="onPanelFileDrop"
          @click="fileInputRef?.click()"
        >拖文件到这里发送，或点击选择（≤500MB/个）</div>
        <input ref="fileInputRef" type="file" multiple style="display: none" @change="onFilePick" />
        <div class="rc-file-list">
          <div v-if="files.length === 0 && !fileBusy" class="rc-file-empty">接收目录暂无文件</div>
          <div v-for="f in files" :key="f.name" class="rc-file-item">
            <span class="rc-file-name" :title="f.name">{{ f.name }}</span>
            <span class="rc-file-size">{{ fmtSize(f.size) }}</span>
            <button class="rc-tbtn" @click="downloadFile(f.name)">下载</button>
          </div>
        </div>
        <div v-if="fileBusy" class="rc-hint">传输中，请稍候…</div>
      </div>

      <!-- 拖拽投递遮罩 -->
      <div v-if="dragOver" class="rc-drop-hint">松开发送到被控端「言智远控」目录</div>
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
 * P1：音频转发开关 / 剪贴板互通 / 文件收发 / 适应窗口与 1:1 缩放（捏合缩放+平移）/
 *     JPEG 模式远端光标自绘 / 多显示器切换（displays.info + display.select，悬浮球/顶栏）。
 *
 * ★ 坐标映射（自算显示矩形）：视频/画布按「contain」几何手工定位（object-fit:fill +
 *   显式 left/top/width/height），toScreen 全程用 displayedRect 换算 —— 不依赖
 *   getBoundingClientRect 与 object-fit 的组合行为，缩放/平移/黑边下都精确。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { CSSProperties } from 'vue';
import { ElMessage } from 'element-plus';
import jsQR from 'jsqr';
import { parseRcScanPayload } from '../utils/rcScan';

type Phase = 'setup' | 'pending' | 'live' | 'ended';
interface ScreenRect { x: number; y: number; w: number; h: number }
interface FileEntry { name: string; size: number; mtime: number }
/** 被控端显示器（displays.info；坐标为虚拟屏物理像素，与注入坐标同系） */
interface RcDisplayInfo { id: string; label: string; primary: boolean; x: number; y: number; w: number; h: number }
/** ICE 服务器（跨公网打洞/中继；结构同 RTCIceServer） */
interface RcIceServer { urls: string[]; username?: string; credential?: string }

const RC_FILE_MAX = 500 * 1024 * 1024;

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
const clipPanelOpen = ref(false);
const clipText = ref('');
const clipBusy = ref(false);
const filePanelOpen = ref(false);
const fileDrag = ref(false);
const fileBusy = ref(false);
const files = ref<FileEntry[]>([]);
const audioOn = ref(false);
const dragOver = ref(false);
const qualityPreset = ref<'smooth' | 'balance' | 'sharp'>('balance');
const displays = ref<RcDisplayInfo[]>([]);
const currentDisplay = ref('');
const iceServers = ref<RcIceServer[]>([]);

// ---- 缩放几何 ----
const viewport = reactive({ w: 0, h: 0 });
const native = reactive({ w: 0, h: 0 });
const zoomMode = ref<'fit' | 'free'>('fit');
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });

const statusText = computed(() => {
  if (mode.value === 'webrtc') return zoomMode.value === 'free' ? `WebRTC · ${Math.round(zoom.value * 100)}%` : 'WebRTC 已连接';
  if (mode.value === 'jpeg') return zoomMode.value === 'free' ? `兼容模式 · ${Math.round(zoom.value * 100)}%` : '兼容模式已连接';
  return '连接中…';
});
const zoomLabel = computed(() => (zoomMode.value === 'fit' ? '1:1' : '适应窗口'));

const form = reactive({ host: window.location.origin, code: '' });
const route = useRoute();
const stageRef = ref<HTMLElement>();
const videoRef = ref<HTMLVideoElement>();
const canvasRef = ref<HTMLCanvasElement>();
const ballRef = ref<HTMLElement>();
const fileInputRef = ref<HTMLInputElement>();
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
const cursor = reactive({ x: 0, y: 0, visible: false });

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

// ================= 几何：显示矩形自算 =================
function syncViewport(): void {
  const el = stageRef.value;
  if (el) {
    viewport.w = el.clientWidth;
    viewport.h = el.clientHeight;
  }
}
function syncNativeFromVideo(): void {
  const v = videoRef.value;
  if (v && v.videoWidth > 0) {
    native.w = v.videoWidth;
    native.h = v.videoHeight;
  }
}
function syncNativeFromScreen(): void {
  // 元数据未到前的宽高兜底：直接用屏幕几何（宽高比正确即可）
  if (screen.value.w > 0 && screen.value.h > 0) {
    native.w = screen.value.w;
    native.h = screen.value.h;
  }
}
/** contain 适配盒（未缩放） */
function fitBox(): { w: number; h: number; x: number; y: number } {
  if (!native.w || !native.h || !viewport.w || !viewport.h) return { w: 0, h: 0, x: 0, y: 0 };
  let w = viewport.w;
  let h = viewport.w * (native.h / native.w);
  if (h > viewport.h) {
    h = viewport.h;
    w = viewport.h * (native.w / native.h);
  }
  return { w, h, x: (viewport.w - w) / 2, y: (viewport.h - h) / 2 };
}
/** 当前显示矩形（含缩放/平移，已夹取在视口内） */
const displayedRect = computed(() => {
  const b = fitBox();
  if (!b.w) return { x: 0, y: 0, w: 0, h: 0 };
  if (zoomMode.value === 'fit') return b;
  const w = b.w * zoom.value;
  const h = b.h * zoom.value;
  const cx = (viewport.w - w) / 2;
  const cy = (viewport.h - h) / 2;
  const xMin = Math.min(0, viewport.w - w);
  const xMax = Math.max(0, viewport.w - w);
  const yMin = Math.min(0, viewport.h - h);
  const yMax = Math.max(0, viewport.h - h);
  return {
    w,
    h,
    x: Math.min(xMax, Math.max(xMin, cx + pan.x)),
    y: Math.min(yMax, Math.max(yMin, cy + pan.y)),
  };
});
const mediaStyle = computed<CSSProperties>(() => {
  const r = displayedRect.value;
  return {
    position: 'absolute',
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    objectFit: 'fill',
  };
});
function panBy(dx: number, dy: number): void {
  const b = fitBox();
  const w = b.w * zoom.value;
  const h = b.h * zoom.value;
  const xMinOff = Math.min(0, viewport.w - w) - (viewport.w - w) / 2;
  const xMaxOff = Math.max(0, viewport.w - w) - (viewport.w - w) / 2;
  const yMinOff = Math.min(0, viewport.h - h) - (viewport.h - h) / 2;
  const yMaxOff = Math.max(0, viewport.h - h) - (viewport.h - h) / 2;
  pan.x = Math.min(xMaxOff, Math.max(xMinOff, pan.x + dx));
  pan.y = Math.min(yMaxOff, Math.max(yMinOff, pan.y + dy));
}
function setZoom(z: number, anchorX?: number, anchorY?: number): void {
  const before = displayedRect.value;
  zoomMode.value = 'free';
  zoom.value = Math.min(8, Math.max(1, z));
  if (zoom.value <= 1.01) {
    zoomMode.value = 'fit';
    zoom.value = 1;
    pan.x = 0;
    pan.y = 0;
    return;
  }
  // 以锚点（捏合中点/光标）为不动点：让锚点下的内容点缩放后仍停在锚点下
  if (anchorX != null && anchorY != null && before.w > 0 && before.h > 0) {
    const after = displayedRect.value;
    const ux = (anchorX - before.x) / before.w;
    const uy = (anchorY - before.y) / before.h;
    pan.x += (anchorX - ux * after.w) - after.x;
    pan.y += (anchorY - uy * after.h) - after.y;
    panBy(0, 0); // 夹取越界
  }
}
function toggleZoom(): void {
  if (zoomMode.value === 'fit') {
    // 1:1：显示像素 = 内容原生像素
    const b = fitBox();
    if (b.w > 0 && native.w > 0) {
      setZoom(Math.min(8, native.w / b.w));
    }
  } else {
    zoomMode.value = 'fit';
    zoom.value = 1;
    pan.x = 0;
    pan.y = 0;
  }
}

// ---- JPEG 远端光标（显示坐标 = 显示矩形反算）----
const cursorStyle = computed<CSSProperties>(() => {
  const r = displayedRect.value;
  const s = screen.value;
  if (!cursor.visible || !r.w || !s.w) return { display: 'none' };
  const px = r.x + ((cursor.x - s.x) / s.w) * r.w;
  const py = r.y + ((cursor.y - s.y) / s.h) * r.h;
  return { display: 'block', left: `${px}px`, top: `${py}px` };
});

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

// ---- 扫码连接（jsQR 摄像头解码；载荷解析见 utils/rcScan.ts）----
// 被控端二维码 = http://ip:port/remote?code=授权码：系统相机扫 → 打开本页自动连接；
// 本页「扫码连接」按钮 → 摄像头取景反扫，双向都不用手敲地址和授权码。
const scanning = ref(false);
const scanError = ref('');
const scanVideoRef = ref<HTMLVideoElement>();
let scanStream: MediaStream | null = null;
let scanTimer = 0;

async function startScan(): Promise<void> {
  scanError.value = '';
  scanning.value = true;
  await nextTick();
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    scanError.value = `相机不可用：${(e as Error)?.message || e}。也可以用系统相机扫二维码（会直接打开本页并自动连接）。`;
    return;
  }
  await nextTick();
  const video = scanVideoRef.value;
  if (!video) {
    stopScan();
    return;
  }
  video.srcObject = scanStream;
  try { await video.play(); } catch { /* 个别浏览器需要手势，浮层里有取景画面即可 */ }
  // 解码循环：降采样到 480 宽提帧率，250ms 一帧足够（二维码是静态的）
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  scanTimer = window.setInterval(() => {
    if (!scanning.value || !video.videoWidth || !ctx) return;
    const w = 480;
    const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (found?.data) onScanPayload(found.data);
  }, 250);
}

function onScanPayload(text: string): void {
  const t = parseRcScanPayload(text);
  stopScan();
  if (t.host) form.host = t.host;
  if (t.code) {
    form.code = t.code;
    void pair();
  } else {
    ElMessage.info('二维码里没有授权码：已填入地址，请再输入授权码');
  }
}

function stopScan(): void {
  scanning.value = false;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = 0;
  }
  if (scanStream) {
    for (const track of scanStream.getTracks()) track.stop();
    scanStream = null;
  }
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
      if (Array.isArray(msg.iceServers)) iceServers.value = msg.iceServers as RcIceServer[];
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) setScreen(msg.screen as ScreenRect);
      if (m === 'webrtc') startWebRtc();
      break;
    }
    case 'session.resume':
      phase.value = 'live';
      if (Array.isArray(msg.iceServers)) iceServers.value = msg.iceServers as RcIceServer[];
      {
        const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
        setMode(m);
        // 白名单直连/断线重连走 resume：WebRTC 也要补发 offer，否则画面永远起不来
        if (m === 'webrtc' && !videoRef.value?.srcObject) startWebRtc();
      }
      break;
    case 'session.mode': {
      const m = String(msg.mode || '') as 'webrtc' | 'jpeg';
      setMode(m);
      if (msg.screen) setScreen(msg.screen as ScreenRect);
      break;
    }
    case 'screen.info':
      setScreen(msg.screen as ScreenRect);
      break;
    case 'displays.info': {
      // 被控端显示器清单（WebRTC=Electron 枚举；JPEG=代理枚举+整个桌面项）
      const list = Array.isArray(msg.list) ? (msg.list as RcDisplayInfo[]) : [];
      displays.value = list.filter((d) => d && d.id);
      if (msg.current) currentDisplay.value = String(msg.current);
      break;
    }
    case 'cursor':
      cursor.x = Number(msg.x) || 0;
      cursor.y = Number(msg.y) || 0;
      cursor.visible = !!msg.visible;
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
    case 'clipboard.done':
      clipBusy.value = false;
      if (msg.ok) {
        ElMessage.success('已发送到被控端剪贴板');
        clipPanelOpen.value = false;
      } else {
        ElMessage.warning(String(msg.error || '剪贴板操作失败'));
      }
      break;
    case 'clipboard.text':
      clipBusy.value = false;
      clipText.value = String(msg.text ?? '');
      try {
        await navigator.clipboard.writeText(clipText.value);
        ElMessage.success('已取到被控端剪贴板并写入本机');
      } catch {
        ElMessage.info('已取到被控端剪贴板（非安全上下文无法自动写入，请在文本框复制）');
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

function setScreen(s: ScreenRect): void {
  screen.value = s;
  syncNativeFromScreen();
  syncViewport();
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
  // LAN：host candidate 直连无需任何服务器；跨公网：经 STUN 打洞 / TURN 中继（服务端下发）
  const conn = new RTCPeerConnection(iceServers.value.length ? { iceServers: iceServers.value } : {});
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
    if (native.w !== bmp.width || native.h !== bmp.height) {
      native.w = bmp.width;
      native.h = bmp.height;
    }
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

// ================= 输入：指针（触屏=鼠标 / 双指=缩放·平移·滚动）=================
interface ActivePointer { x: number; y: number }
const pointers = new Map<number, ActivePointer>();
let downPos: { x: number; y: number } | null = null;
let dragging = false;
let suppressUp = false;
let longPressTimer: number | null = null;
let lastMoveSent = 0;
let pinchPrev: { dist: number; midX: number; midY: number; active: boolean } | null = null;

const toScreen = (clientX: number, clientY: number): { x: number; y: number } | null => {
  if (screen.value.w <= 0 || screen.value.h <= 0) return null; // 屏幕几何未知时禁输入
  const r = displayedRect.value;
  if (!r.w || !r.h) return null;
  const nx = Math.max(0, Math.min(1, (clientX - r.x) / r.w));
  const ny = Math.max(0, Math.min(1, (clientY - r.y) / r.h));
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
  if (pointers.size === 2) {
    // 进入双指模式：撤掉已按下的左键，避免误点
    if (dragging && !suppressUp && downPos) input({ action: 'up', ...toScreen(downPos.x, downPos.y)!, button: 'left' });
    dragging = false;
    suppressUp = false;
    clearLongPress();
    downPos = null;
    const pts = [...pointers.values()];
    pinchPrev = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
      active: true,
    };
    return;
  }
  if (pointers.size > 2) return;
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
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    if (pinchPrev?.active) {
      const ratio = dist / Math.max(1, pinchPrev.dist);
      if (Math.abs(ratio - 1) > 0.02) {
        // 捏合 → 缩放（以中点为锚）
        setZoom(zoom.value * ratio, midX, midY);
        pinchPrev.dist = dist;
      } else if (zoomMode.value === 'free' && zoom.value > 1) {
        panBy(midX - pinchPrev.midX, midY - pinchPrev.midY);
      } else {
        // 适应窗口下的双指平移退化为滚动（并行位移）
        const dy = midY - pinchPrev.midY;
        if (Math.abs(dy) > 2) {
          const p = toScreen(midX, midY);
          if (p) input({ action: 'wheel', ...p, delta: Math.max(-400, Math.min(400, -Math.round(dy))) });
        }
      }
    }
    pinchPrev = { dist, midX, midY, active: true };
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
  if (pointers.size < 2) pinchPrev = null;
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
  // Ctrl+滚轮 = 缩放（桌面端）
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    return;
  }
  // 缩放态下滚轮 = 平移（纵向），Shift 平移横向
  if (zoomMode.value === 'free' && zoom.value > 1) {
    if (e.shiftKey) panBy(-e.deltaY, 0);
    else panBy(0, -e.deltaY);
    return;
  }
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

// ================= 输入：键盘（直通 + 整串）=================
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

// ================= 面板 =================
function openKeyboardPanel(): void {
  kbPanelOpen.value = true;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
  ballMenuOpen.value = false;
}
function openClipboardPanel(): void {
  clipPanelOpen.value = true;
  kbPanelOpen.value = false;
  filePanelOpen.value = false;
  ballMenuOpen.value = false;
}
function openFilePanel(): void {
  filePanelOpen.value = true;
  kbPanelOpen.value = false;
  clipPanelOpen.value = false;
  ballMenuOpen.value = false;
  void refreshFiles();
}
function toggleAudio(): void {
  audioOn.value = !audioOn.value;
  send({ type: 'audio.state', on: audioOn.value });
  ballMenuOpen.value = false;
}

// ================= 多显示器切换 =================
function displayLabel(d: RcDisplayInfo): string {
  return `${(d.primary ? '主屏 · ' : '') + d.label} ${d.w}×${d.h}`;
}
function selectDisplay(id: string): void {
  ballMenuOpen.value = false;
  if (!id || id === currentDisplay.value) return;
  // 乐观更新（host 切换成功后会回发 displays.info 校准），JPEG 模式服务端直接切
  currentDisplay.value = id;
  send({ type: 'display.select', displayId: id });
}

async function sendClipboard(): Promise<void> {
  const t = clipText.value;
  if (!t) return;
  clipBusy.value = true;
  send({ type: 'clipboard.set', text: t.slice(0, 100_000) });
  // 成功/失败提示由 clipboard.done 回执驱动；这里仅兜底防卡死
  window.setTimeout(() => {
    clipBusy.value = false;
  }, 6000);
}
async function pullClipboard(): Promise<void> {
  clipBusy.value = true;
  send({ type: 'clipboard.get' });
  window.setTimeout(() => {
    if (clipBusy.value) {
      clipBusy.value = false;
      ElMessage.warning('被控端剪贴板读取超时');
    }
  }, 8000);
}

// ================= 文件收发 =================
function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
async function refreshFiles(): Promise<void> {
  if (!sessionToken) return;
  try {
    const res = await fetch(apiOf(base, `/file/list?token=${encodeURIComponent(sessionToken)}`));
    const body = await res.json();
    if (body.error) {
      ElMessage.warning(body.error);
      return;
    }
    files.value = (body.data || []) as FileEntry[];
  } catch {
    ElMessage.warning('文件列表获取失败');
  }
}
async function uploadFiles(list: FileList | File[]): Promise<void> {
  if (!sessionToken || fileBusy.value) return;
  const arr = [...list].filter((f) => f.size <= RC_FILE_MAX);
  if (!arr.length) {
    ElMessage.warning('没有可发送的文件（单个 ≤500MB）');
    return;
  }
  fileBusy.value = true;
  try {
    for (const f of arr) {
      const res = await fetch(
        apiOf(base, `/file/upload?token=${encodeURIComponent(sessionToken)}&name=${encodeURIComponent(f.name)}`),
        { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: f },
      );
      const body = await res.json();
      if (body.error) ElMessage.warning(`${f.name}: ${body.error}`);
    }
    ElMessage.success('发送完成');
    await refreshFiles();
  } catch {
    ElMessage.error('发送失败');
  } finally {
    fileBusy.value = false;
  }
}
function onFilePick(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void uploadFiles(input.files);
  input.value = '';
}
function onFileDrop(e: DragEvent): void {
  dragOver.value = false;
  fileDrag.value = false;
  if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
}
function onPanelFileDrop(e: DragEvent): void {
  fileDrag.value = false;
  if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
}
async function downloadFile(name: string): Promise<void> {
  if (!sessionToken) return;
  try {
    const res = await fetch(apiOf(base, `/file/download?token=${encodeURIComponent(sessionToken)}&name=${encodeURIComponent(name)}`));
    const body = await res.json().catch(() => null);
    if (body?.error) {
      ElMessage.warning(body.error);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    ElMessage.error('下载失败');
  }
}

// ================= 全屏沉浸 + 悬浮球 =================
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
  syncViewport();
}
function onFullscreenChange(): void {
  immersive.value = !!document.fullscreenElement;
  if (!immersive.value) {
    ballMenuOpen.value = false;
    kbPanelOpen.value = false;
    clipPanelOpen.value = false;
    filePanelOpen.value = false;
  }
  window.setTimeout(syncViewport, 60);
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
  audioOn.value = false;
  cursor.visible = false;
  displays.value = [];
  currentDisplay.value = '';
  iceServers.value = [];
  zoomMode.value = 'fit';
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
  kbPanelOpen.value = false;
  clipPanelOpen.value = false;
  filePanelOpen.value = false;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  immersive.value = false;
}
function onResize(): void {
  syncViewport();
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('compositionend', onCompositionEnd, true);
  window.addEventListener('resize', onResize);
  syncViewport();
  syncNativeFromScreen();
  // 扫码/邀请链接直达：?code= 授权码 → 预填并直接发起配对（被控端确认弹窗照常把关）。
  // 裸路径引导（router/barePathHash.ts）会把 ?code= 原样带进 hash query。
  const qc = route?.query?.code;
  if (typeof qc === 'string' && qc && !form.code && phase.value === 'setup') {
    form.code = qc;
    void pair();
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('compositionend', onCompositionEnd, true);
  window.removeEventListener('resize', onResize);
  stopScan();
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
/* ★ 显示矩形由 JS 自算（mediaStyle 内联定位），这里只留外观——不再用 inset:100% + contain，
   否则 letterbox 黑边会算进坐标映射（点边缘会偏）。 */
.rc-video { position: absolute; object-fit: fill; touch-action: none; background: #000; }
.rc-cursor { position: absolute; z-index: 4; pointer-events: none; transform: translate(-2px, -2px); filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.rc-toolbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0)); transition: opacity 0.25s; z-index: 5; }
.rc-toolbar.hidden { opacity: 0; pointer-events: none; }
.rc-status { font-size: 12px; color: #b9c2cf; flex: 1; }
.rc-tbtn { background: rgba(23,28,35,0.8); border: 1px solid #2a323e; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.rc-tbtn:hover { border-color: #4c8dff; }
.rc-select { background: #171c23; color: inherit; border: 1px solid #2a323e; border-radius: 8px; padding: 5px 8px; font-size: 13px; }

.rc-ball { position: absolute; right: 24px; bottom: 96px; width: 44px; height: 44px; border-radius: 50%; background: rgba(47,107,255,0.85); display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: grab; box-shadow: 0 4px 16px rgba(0,0,0,0.45); transition: opacity 0.3s; z-index: 8; user-select: none; touch-action: none; }
.rc-ball.hidden { opacity: 0.12; }
.rc-ball-menu { position: absolute; display: flex; flex-direction: column; gap: 6px; background: #171c23; border: 1px solid #2a323e; border-radius: 10px; padding: 8px; z-index: 9; min-width: 170px; max-height: 70vh; overflow-y: auto; }
.rc-mbtn { background: transparent; border: none; color: inherit; text-align: left; padding: 8px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.rc-mbtn:hover { background: #232b36; }
.rc-mbtn.active { color: #7fa8ff; }
.rc-mbtn.disp { padding: 6px 10px; font-size: 12px; color: #b9c2cf; }
.rc-menu-label { font-size: 11px; color: #6d7684; padding: 4px 10px 0; border-top: 1px solid #232b36; margin-top: 2px; }
.rc-mbtn.danger { color: #f0909d; }

.rc-panel { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(480px, 92%); background: #171c23; border: 1px solid #2a323e; border-radius: 12px; padding: 12px; z-index: 10; }
.rc-panel-wide { width: min(560px, 94%); }
.rc-panel-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.rc-panel-x { background: transparent; border: none; color: #8a94a3; cursor: pointer; font-size: 14px; }
.rc-panel-text { width: 100%; background: #10151b; border: 1px solid #2a323e; border-radius: 8px; color: inherit; padding: 8px 10px; font-size: 14px; resize: none; outline: none; box-sizing: border-box; }
.rc-panel-actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
.rc-panel-actions .rc-btn { padding: 7px 12px; }
.rc-busy { color: #8a94a3; font-size: 13px; }

.rc-file-drop { border: 1.5px dashed #2a323e; border-radius: 8px; padding: 14px; text-align: center; font-size: 13px; color: #8a94a3; cursor: pointer; margin-bottom: 10px; }
.rc-file-drop.over { border-color: #4c8dff; color: #9dc0ff; background: #16233a; }
.rc-file-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.rc-file-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 2px; }
.rc-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-file-size { color: #6d7684; font-size: 12px; flex-shrink: 0; }
.rc-file-empty { color: #6d7684; font-size: 13px; text-align: center; padding: 10px; }
.rc-file-item .rc-tbtn { padding: 3px 10px; font-size: 12px; }

.rc-drop-hint { position: absolute; inset: 12px; border: 2px dashed #4c8dff; border-radius: 14px; background: rgba(22, 35, 58, 0.72); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #bcd2ff; z-index: 12; pointer-events: none; }

/* 扫码浮层（setup 阶段）：摄像头取景 + jsQR 解码 */
.rc-scan { position: fixed; inset: 0; background: rgba(8, 11, 15, 0.86); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
.rc-scan-box { width: min(440px, 100%); background: #171c23; border: 1px solid #2a323e; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.rc-scan-video { width: 100%; max-width: 400px; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; background: #000; }
.rc-scan-tip { font-size: 13px; color: #8a94a3; text-align: center; }
.rc-scan-err { font-size: 12.5px; color: #f0b6c2; line-height: 1.6; text-align: center; }
</style>
