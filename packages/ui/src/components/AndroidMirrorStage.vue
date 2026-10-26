<template>
  <div ref="hostRef" class="ams" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onCancel">
    <canvas ref="canvasRef" class="ams-canvas"></canvas>
    <div v-if="!hasFrame" class="ams-wait">
      <div class="ams-spinner"></div>
      <div class="ams-wait-title">{{ error || '正在建立手机画面…' }}</div>
      <div v-if="!error" class="ams-wait-sub">{{ hint }}</div>
      <button v-if="error" class="ams-retry" @click="reconnect">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 安卓镜像画面（真内嵌：不依赖 scrcpy 的 SDL 窗口）。
 *
 * 数据面：/api/plugin/android-mirror/mirror/ws?serial=… —— 服务端自己当 scrcpy 客户端，
 * 推 H.264（12B 包头 + Annex-B），这里用 WebCodecs 解码上屏；
 * 控制面：同一条 WS 回传 {type:'tap'|'swipe'|'key'|'text'}，由服务端写成 scrcpy 控制包。
 *
 * 只负责「画面 + 触控」，工具栏/权限/只读那一层由外层会话壳统一提供（见 RemoteControl.vue）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { API_BASE } from '../api/client';
import {
  annexBToAvcc, avcCodecString, buildAvcDescription, extractSpsPps, parsePacketHeader,
} from '../utils/scrcpyFrames';

const props = defineProps<{ serial: string; interactive?: boolean }>();
const emit = defineEmits<{ (e: 'meta', m: { deviceName: string; width: number; height: number }): void }>();

const hostRef = ref<HTMLElement>();
const canvasRef = ref<HTMLCanvasElement>();
const hasFrame = ref(false);
const error = ref('');
const hint = ref('首次连接可能需要手机上确认调试授权');

let ws: WebSocket | null = null;
let decoder: VideoDecoder | null = null;
let latest: VideoFrame | null = null;
let drawQueued = false;
let deviceW = 0;
let deviceH = 0;
let descriptionReady = false;
let closed = false;

const wsBase = computed(() => {
  const base = API_BASE || window.location.origin;
  return base.replace(/^http/i, 'ws');
});

function draw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    const c = canvasRef.value;
    const f = latest;
    if (!c || !f) return;
    if (c.width !== f.displayWidth || c.height !== f.displayHeight) {
      c.width = f.displayWidth;
      c.height = f.displayHeight;
    }
    const ctx = c.getContext('2d');
    ctx?.drawImage(f, 0, 0);
  });
}

function ensureDecoder(): VideoDecoder | null {
  if (decoder && decoder.state !== 'closed') return decoder;
  if (typeof VideoDecoder === 'undefined') {
    error.value = '当前内核不支持 WebCodecs，无法解码手机画面';
    return null;
  }
  decoder = new VideoDecoder({
    output: (frame) => {
      latest?.close();
      latest = frame;
      hasFrame.value = true;
      draw();
    },
    error: (e) => {
      error.value = `解码失败：${e.message}`;
    },
  });
  return decoder;
}

/** CONFIG 包 → 配解码器（description 必须来自 SPS/PPS，否则黑屏不报错） */
function configureFrom(configPacket: Uint8Array): void {
  const { sps, pps } = extractSpsPps(configPacket);
  const d = ensureDecoder();
  if (!d || !sps || !pps) {
    error.value = '视频流缺少 SPS/PPS，无法初始化解码器';
    return;
  }
  d.configure({
    codec: avcCodecString(sps),
    description: buildAvcDescription(sps, pps),
    optimizeForLatency: true,
  });
  descriptionReady = true;
}

function onBinary(buf: ArrayBuffer): void {
  if (buf.byteLength < 12) return;
  const bytes = new Uint8Array(buf);
  const head = parsePacketHeader(bytes.subarray(0, 12));
  if (!head.size || bytes.byteLength < 12 + head.size) return;
  const payload = bytes.subarray(12, 12 + head.size);
  if (head.isConfig) {
    configureFrom(payload);
    return;
  }
  const d = ensureDecoder();
  if (!d || !descriptionReady) return;
  try {
    d.decode(new EncodedVideoChunk({
      type: head.isKey ? 'key' : 'delta',
      timestamp: head.pts,
      data: annexBToAvcc(payload),
    }));
  } catch {
    /* 丢一帧不致命：下一帧通常是关键帧或能继续解 */
  }
}

function reconnect(): void {
  teardown();
  closed = false;
  error.value = '';
  hasFrame.value = false;
  connect();
}

function connect(): void {
  if (closed) return;
  const url = `${wsBase.value}/api/plugin/android-mirror/mirror/ws?serial=${encodeURIComponent(props.serial)}`;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    error.value = (e as Error)?.message || '无法建立镜像通道';
    return;
  }
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data) as Record<string, unknown>;
        if (msg.type === 'video.meta') {
          deviceW = Number(msg.width) || 0;
          deviceH = Number(msg.height) || 0;
          hint.value = '轻点=点击，拖动=滑动';
          emit('meta', { deviceName: String(msg.deviceName || ''), width: deviceW, height: deviceH });
        } else if (msg.type === 'error') {
          error.value = String(msg.error || '镜像启动失败');
        }
      } catch { /* 忽略非 JSON 文本 */ }
      return;
    }
    onBinary(ev.data as ArrayBuffer);
  };
  ws.onerror = () => {
    if (!closed && !hasFrame.value) error.value = '镜像通道连接失败（后端插件是否启用？）';
  };
}

// ---- 触控 → 设备像素 ----
function toDevice(ev: PointerEvent): { x: number; y: number } | null {
  const c = canvasRef.value;
  if (!c || !deviceW || !deviceH) return null;
  const r = c.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * deviceW;
  const y = ((ev.clientY - r.top) / r.height) * deviceH;
  return { x: Math.round(x), y: Math.round(y) };
}
let downAt: { x: number; y: number; t: number } | null = null;

function sendControl(msg: Record<string, unknown>): void {
  // 只读会话（外层壳的权限两档）：本端直接不发，避免把拒绝提示刷成噪音
  if (props.interactive === false) return;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onDown(ev: PointerEvent): void {
  const p = toDevice(ev);
  if (!p) return;
  downAt = { ...p, t: performance.now() };
}

function onMove(ev: PointerEvent): void {
  // 拖动过程不连续发 move：抬手时一次性按起止点做 swipe（scrcpy 控制包更稳、也不刷爆通道）
}

function onUp(ev: PointerEvent): void {
  const p = toDevice(ev);
  if (!p || !downAt) return;
  const dx = p.x - downAt.x;
  const dy = p.y - downAt.y;
  const moved = Math.hypot(dx, dy) > 12;
  if (moved) sendControl({ type: 'swipe', x1: downAt.x, y1: downAt.y, x2: p.x, y2: p.y });
  else sendControl({ type: 'tap', x: p.x, y: p.y });
  downAt = null;
}

function onCancel(): void {
  downAt = null;
}

function teardown(): void {
  closed = true;
  try { ws?.close(); } catch { /* ignore */ }
  ws = null;
  try { decoder?.close(); } catch { /* ignore */ }
  decoder = null;
  latest?.close();
  latest = null;
  descriptionReady = false;
  hasFrame.value = false;
}

onMounted(connect);
onBeforeUnmount(teardown);

// 供外层会话壳调用（工具栏的返回/Home/任务键）
defineExpose({
  key(code: number) { sendControl({ type: 'key', keycode: code }); },
  text(value: string) { sendControl({ type: 'text', text: value }); },
});
</script>

<style scoped>
.ams { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #05070a; touch-action: none; }
.ams-canvas { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.ams-wait { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #cfd9e6; text-align: center; padding: 0 24px; }
.ams-spinner { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.16); border-top-color: #4c8dff; animation: ams-spin .9s linear infinite; }
@keyframes ams-spin { to { transform: rotate(360deg); } }
.ams-wait-title { font-size: 13px; }
.ams-wait-sub { font-size: 11.5px; color: #8b98ab; }
.ams-retry { margin-top: 6px; border: 0; border-radius: 9px; padding: 7px 14px; background: #2f6bff; color: #fff; font-size: 12px; cursor: pointer; }
</style>
