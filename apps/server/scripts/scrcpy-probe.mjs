/**
 * scrcpy-server 协议探针 v2（一次性验证脚本，不属于运行时）。
 *
 * v1 的错：把 scrcpy 的连接方向搞反了。scrcpy 默认不是 `adb forward`，
 * 而是**客户端监听、设备端连回来**（`adb reverse tcp:P tcp:P`）。所以：
 *   - 客户端在 127.0.0.1:P 监听；
 *   - `adb reverse tcp:P tcp:P` 让设备上的 127.0.0.1:P 连回本机；
 *   - 先到的连接是视频，第二个是控制（control=true 时）。
 *
 * 用法：node apps/server/scripts/scrcpy-probe.mjs [serial]
 */
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ADB = path.join(ROOT, 'tools', 'scrcpy', 'adb.exe');
const SERVER_JAR = path.join(ROOT, 'tools', 'scrcpy', 'scrcpy-server');
const VERSION = '5.0.1';
const PORT = 27184;
const SCID = '00000001';
const DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';

const serial = process.argv[2] || 'adb-3B15B601AR700000-veRIo6._adb-tls-connect._tcp';
const adb = (...args) =>
  execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });

console.log('[1/4] 推 scrcpy-server →', serial);
adb('push', SERVER_JAR, DEVICE_PATH);

let video = null;
let control = null;
let buf = Buffer.alloc(0);
let deviceName = '';
let meta = null;
let frames = 0;
let sawConfig = false;
let proc = null;
let finished = false;

const server = net.createServer((sock) => {
  if (!video) {
    video = sock;
    console.log('[3/4] 视频连接已建立');
    sock.on('data', onData);
    sock.on('error', () => undefined);
    sock.on('close', () => console.log('[sock] 视频连接关闭'));
  } else if (!control) {
    control = sock;
    console.log('[3/4] 控制连接已建立（后续触控/按键走这条）');
  }
});

function onData(chunk) {
  buf = Buffer.concat([buf, chunk]);
  if (!deviceName && buf.length >= 64) {
    deviceName = buf.subarray(0, 64).toString('utf8').replace(/\0.*$/, '');
    buf = buf.subarray(64);
    console.log('设备名 =', JSON.stringify(deviceName));
  }
  if (deviceName && !meta && buf.length >= 16) {
    // 实测 5.0.1 的流头是 16 字节：codec(4) + 标志位(4) + width(4) + height(4)
    // （codec=68323634 'h264'，标志位常见 80000000，宽高按端口方向例如 464×1024）
    meta = { id: '0x' + buf.readUInt32BE(0).toString(16), w: buf.readUInt32BE(8), h: buf.readUInt32BE(12) };
    buf = buf.subarray(16);
    console.log('流元数据 =', meta);
  }
  while (meta && buf.length >= 12) {
    const ptsRaw = buf.readBigUInt64BE(0);
    const size = buf.readUInt32BE(8);
    if (size <= 0 || buf.length < 12 + size) break;
    const payload = buf.subarray(12, 12 + size);
    buf = buf.subarray(12 + size);
    frames += 1;
    const isConfig = (ptsRaw >> 63n) === 1n;
    const isKey = ((ptsRaw >> 62n) & 1n) === 1n;
    const annexB = payload.length >= 4 && payload[0] === 0 && payload[1] === 0
      && (payload[2] === 1 || (payload[2] === 0 && payload[3] === 1));
    if (isConfig && !sawConfig) {
      sawConfig = true;
      console.log('首包=CONFIG size=%d AnnexB=%s 前16字节=%s', size, annexB, payload.subarray(0, 16).toString('hex'));
    } else if (isKey) {
      console.log('关键帧 #%d size=%d annexB=%s', frames, size, annexB);
    }
    if (frames >= 30) {
      console.log('✅ 协议确认：收到 %d 包（含 CONFIG 与关键帧）', frames);
      finish(0);
      return;
    }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  // 设备端连的是 **abstract unix socket**（LocalSocket），不是 TCP：
  // 必须用 adb reverse 把 localabstract:scrcpy_<scid> 映射回本机 TCP 端口。
  console.log('[2/4] 本机监听 127.0.0.1:%d，reverse localabstract:scrcpy_%s', PORT, SCID);
  adb('reverse', `localabstract:scrcpy_${SCID}`, `tcp:${PORT}`);
  const args = [
    'shell',
    `CLASSPATH=${DEVICE_PATH}`,
    'app_process', '/', 'com.genymobile.scrcpy.Server', VERSION,
    'log_level=info',
    'audio=false',
    'video=true',
    'control=true',
    'send_device_meta=true',
    'send_stream_meta=true',
    'send_frame_meta=true',
    `scid=${SCID}`,
    'max_size=1024',
    'video_bit_rate=4000000',
  ];
  console.log('[4/4] 启动 scrcpy-server（默认连接方向：设备连回来）');
  proc = spawn(ADB, ['-s', serial, ...args], { windowsHide: true });
  proc.stdout?.on('data', (d) => console.log('[server]', String(d).trim()));
  proc.stderr?.on('data', (d) => console.log('[server:err]', String(d).trim()));
  proc.on('exit', (code) => {
    if (!finished) console.log('[server] 退出 code=%d', code);
  });
});

function finish(code) {
  if (finished) return;
  finished = true;
  try { proc?.kill('SIGKILL'); } catch { /* ignore */ }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* ignore */ }
  try { video?.destroy(); control?.destroy(); server.close(); } catch { /* ignore */ }
  setTimeout(() => process.exit(code), 120);
}

setTimeout(() => {
  console.error('❌ 超时：10s 没拿到有效视频包（设备名=%j meta=%j frames=%d 控制连接=%s）',
    deviceName, meta, frames, !!control);
  finish(2);
}, 12_000);
