/**
 * scrcpy 镜像会话（真内嵌的第一层：服务端拿到 H.264 流，并能下发触控/按键）。
 *
 * 为什么自己实现而不是调 scrcpy.exe：scrcpy 的画面只能渲染在它自己的 SDL 窗口里
 * （5.0.1 没有把画面交给别的窗口/父窗口的参数，--no-window 是无画面），
 * 要嵌进我们自己的会话页，只能自己当 scrcpy 客户端。
 *
 * 实测协议（OnePlus PJZ110 / Android 16 / scrcpy-server 5.0.1）：
 *   ① 连接方向：**客户端监听 TCP，设备端连回来**
 *      —— `adb reverse localabstract:scrcpy_<scid> tcp:<port>`，
 *      服务端起的是 LocalSocket（abstract unix socket），不是 TCP（实测 Connection refused）。
 *   ② 握手：64B 设备名 → 16B 流头（codec[4] flags[4] width[4] height[4]）；
 *      v1 探针按 12B 解析会得到 width=0x80000000，是错的。
 *   ③ 视频包：12B 头（8B pts，bit63=CONFIG、bit62=KEY；4B size）+ Annex-B H.264。
 *   ④ 控制是**第二条连接**（control=true 时），同样连到那个 abstract socket。
 */
import net from 'node:net';
import { execFile, spawn, type ChildProcess } from 'node:child_process';

export interface ScrcpyMirrorOptions {
  adb: string;
  jar: string;
  serial: string;
  /** 最长边像素（scrcpy 的 max_size），默认 1280 */
  maxSize?: number;
  /** 视频码率 bps，默认 8Mbps */
  bitRate?: number;
  /** 首包超时（ms），默认 12s */
  firstFrameTimeoutMs?: number;
}

export interface ScrcpyVideoMeta {
  deviceName: string;
  /** 'h264' | 'h265' … */
  codec: string;
  width: number;
  height: number;
}

export type ScrcpyPacket = {
  /** 8 字节 pts + 标志位（bit63=CONFIG，bit62=KEY） */
  pts: bigint;
  isConfig: boolean;
  isKey: boolean;
  payload: Buffer;
};

const DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';
const SERVER_VERSION = '5.0.1';

function adbExec(adb: string, serial: string, args: string[], timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(adb, ['-s', serial, ...args], { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim() || 'adb 调用失败'));
      else resolve(String(stdout));
    });
  });
}

export class ScrcpyMirrorSession {
  private readonly opt: Required<Omit<ScrcpyMirrorOptions, 'serial'>> & { serial: string };
  private listener: net.Server | null = null;
  private videoSock: net.Socket | null = null;
  private controlSock: net.Socket | null = null;
  private proc: ChildProcess | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private deviceName = '';
  private meta: ScrcpyVideoMeta | null = null;
  private packets: ScrcpyPacket[] = [];
  private waiters: Array<() => void> = [];
  private closed = false;
  private readonly port: number;
  private readonly scid: string;

  constructor(options: ScrcpyMirrorOptions) {
    this.opt = {
      adb: options.adb,
      jar: options.jar,
      serial: options.serial,
      maxSize: options.maxSize ?? 1280,
      bitRate: options.bitRate ?? 8_000_000,
      firstFrameTimeoutMs: options.firstFrameTimeoutMs ?? 12_000,
    };
    // 端口与 scid 都随机：同一台机器可能同时镜像两台设备，避免互相顶掉
    this.port = 27200 + Math.floor(Math.random() * 300);
    this.scid = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }

  get info(): ScrcpyVideoMeta | null {
    return this.meta;
  }

  /** 取下一批视频包（没有就等），供 WS 转发用 */
  async nextPackets(): Promise<ScrcpyPacket[]> {
    if (this.packets.length) return this.takePackets();
    if (this.closed) return [];
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      setTimeout(resolve, 2000); // 兜底唤醒：让调用方有机会检查关闭状态
    });
    return this.takePackets();
  }

  private takePackets(): ScrcpyPacket[] {
    const out = this.packets;
    this.packets = [];
    return out;
  }

  private wake(): void {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  async start(): Promise<ScrcpyVideoMeta> {
    await adbExec(this.opt.adb, this.opt.serial, ['push', this.opt.jar, DEVICE_PATH], 30000);
    await adbExec(this.opt.adb, this.opt.serial, ['reverse', `localabstract:scrcpy_${this.scid}`, `tcp:${this.port}`]);

    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer((sock) => {
        sock.setNoDelay(true);
        if (!this.videoSock) {
          this.videoSock = sock;
          sock.on('data', (chunk) => this.onVideoData(chunk));
        } else if (!this.controlSock) {
          this.controlSock = sock;
        }
        sock.on('error', () => undefined);
      });
      srv.on('error', reject);
      srv.listen(this.port, '127.0.0.1', () => {
        this.listener = srv;
        resolve();
      });
    });

    const args = [
      'shell',
      `CLASSPATH=${DEVICE_PATH}`,
      'app_process', '/', 'com.genymobile.scrcpy.Server', SERVER_VERSION,
      'log_level=info',
      'audio=false',
      'video=true',
      'control=true',
      'send_device_meta=true',
      'send_stream_meta=true',
      'send_frame_meta=true',
      `scid=${this.scid}`,
      `max_size=${this.opt.maxSize}`,
      `video_bit_rate=${this.opt.bitRate}`,
    ];
    this.proc = spawn(this.opt.adb, ['-s', this.opt.serial, ...args], { windowsHide: true });
    this.proc.on('exit', () => this.stop());

    const meta = await this.waitForMeta(this.opt.firstFrameTimeoutMs);
    return meta;
  }

  private waitForMeta(timeoutMs: number): Promise<ScrcpyVideoMeta> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = (): void => {
        if (this.meta) return resolve(this.meta);
        if (this.closed) return reject(new Error('scrcpy 会话已结束'));
        if (Date.now() - started > timeoutMs) return reject(new Error('等待视频流超时（设备可能未解锁或未授权调试）'));
        setTimeout(tick, 60);
      };
      tick();
    });
  }

  private onVideoData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (!this.deviceName && this.buf.length >= 64) {
      this.deviceName = this.buf.subarray(0, 64).toString('utf8').replace(/\0.*$/, '');
      this.buf = this.buf.subarray(64);
    }
    if (this.deviceName && !this.meta && this.buf.length >= 16) {
      const codecId = this.buf.readUInt32BE(0);
      this.meta = {
        deviceName: this.deviceName,
        codec: Buffer.from([(codecId >>> 24) & 0xff, (codecId >>> 16) & 0xff, (codecId >>> 8) & 0xff, codecId & 0xff]).toString('latin1'),
        width: this.buf.readUInt32BE(8),
        height: this.buf.readUInt32BE(12),
      };
      this.buf = this.buf.subarray(16);
    }
    while (this.meta && this.buf.length >= 12) {
      const pts = this.buf.readBigUInt64BE(0);
      const size = this.buf.readUInt32BE(8);
      if (size <= 0 || this.buf.length < 12 + size) break;
      const payload = this.buf.subarray(12, 12 + size);
      this.buf = this.buf.subarray(12 + size);
      this.packets.push({
        pts,
        isConfig: (pts >> 63n) === 1n,
        isKey: ((pts >> 62n) & 1n) === 1n,
        payload,
      });
      if (this.packets.length > 240) this.packets.shift(); // 消费端慢时丢旧帧，别把内存吃满
    }
    this.wake();
  }

  /** 下发一条控制消息（scrcpy 控制协议；控制连接未就绪时静默丢弃） */
  sendControl(buf: Buffer): boolean {
    if (!this.controlSock || this.controlSock.destroyed) return false;
    try {
      this.controlSock.write(buf);
      return true;
    } catch {
      return false;
    }
  }

  tap(x: number, y: number, w: number, h: number): void {
    this.touch(0, 1, x, y, w, h); // ACTION_DOWN（主键按着）
    this.touch(1, 0, x, y, w, h); // ACTION_UP
  }

  swipe(x1: number, y1: number, x2: number, y2: number, w: number, h: number, steps = 12): void {
    this.touch(0, 1, x1, y1, w, h);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      this.touch(2, 0, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), w, h);
    }
    this.touch(1, 0, x2, y2, w, h);
  }

  /** scrcpy INJECT_TOUCH（type=2） */
  private touch(action: 0 | 1 | 2, actionButton: 0 | 1, x: number, y: number, w: number, h: number): void {
    const b = Buffer.alloc(1 + 1 + 8 + 4 + 4 + 2 + 2 + 2 + 4 + 4);
    let o = 0;
    b.writeUInt8(2, o); o += 1;
    b.writeUInt8(action, o); o += 1;
    b.writeBigUInt64BE(1n, o); o += 8;          // pointerId（单指固定 1）
    b.writeInt32BE(Math.round(x), o); o += 4;
    b.writeInt32BE(Math.round(y), o); o += 4;
    b.writeUInt16BE(w, o); o += 2;
    b.writeUInt16BE(h, o); o += 2;
    b.writeUInt16BE(action === 1 ? 0 : 0xffff, o); o += 2; // pressure（抬起为 0）
    b.writeUInt32BE(actionButton, o); o += 4;
    b.writeUInt32BE(action === 1 ? 0 : 1, o);              // buttons（抬起清空）
    this.sendControl(b);
  }

  /** scrcpy INJECT_KEYCODE（type=0）：按下+抬起 */
  key(code: number): void {
    for (const action of [0, 1]) {
      const b = Buffer.alloc(1 + 1 + 4 + 4 + 4);
      let o = 0;
      b.writeUInt8(0, o); o += 1;
      b.writeUInt8(action, o); o += 1;
      b.writeInt32BE(code, o); o += 4;
      b.writeInt32BE(0, o); o += 4;
      b.writeInt32BE(0, o);
      this.sendControl(b);
    }
  }

  /** scrcpy INJECT_TEXT（type=1）：整段文本交给手机输入法 */
  text(value: string): void {
    const payload = Buffer.from(value, 'utf8').subarray(0, 300);
    const b = Buffer.alloc(1 + 4 + payload.length);
    b.writeUInt8(1, 0);
    b.writeInt32BE(payload.length, 1);
    payload.copy(b, 5);
    this.sendControl(b);
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.proc?.kill('SIGKILL'); } catch { /* ignore */ }
    try { this.videoSock?.destroy(); } catch { /* ignore */ }
    try { this.controlSock?.destroy(); } catch { /* ignore */ }
    try { this.listener?.close(); } catch { /* ignore */ }
    void adbExec(this.opt.adb, this.opt.serial, ['reverse', '--remove', `localabstract:scrcpy_${this.scid}`], 5000).catch(() => undefined);
    this.wake();
  }
}
