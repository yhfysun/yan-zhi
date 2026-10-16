/**
 * 运维交互终端的 WebSocket 协议（handleTerminalWs）正式测试类。
 *
 * 背景：终端原先走「SSE 收输出 + POST 送按键」，每个键一次 HTTP 往返，输入延迟叠加、
 * Ctrl-C 与刷屏输出的时序很脆。现在改走一条双向 WebSocket：
 *   服务端 → 客户端：二进制帧 = PTY 原始输出；文本帧 = JSON 控制消息（ready / exit / error）
 *   客户端 → 服务端：二进制帧 = 按键原样字节；文本帧 = JSON 控制消息（resize）
 * 本文件守住这套帧约定与各条错误路径 —— 协议一旦漂移，前端会「连上但没反应」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { sshClients, shellCalls, channels } = vi.hoisted(() => ({
  sshClients: [] as any[],
  shellCalls: [] as any[],
  channels: [] as any[],
}));

// crypto 依赖 data.db（app_config 取主密钥），单测里替换为可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

// 假 ssh2：shell() 返回一条假的 PTY 通道，用来观察双向字节流
vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeChannel extends EventEmitter {
    writes: Buffer[] = [];
    windows: Array<[number, number]> = [];
    closed = false;
    write(d: unknown) { this.writes.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))); return true; }
    // 幂等：真实的 ssh2 channel 关过之后再 close 不会再发 'close'
    close() { if (this.closed) return; this.closed = true; this.emit('close'); }
    setWindow(rows: number, cols: number) { this.windows.push([rows, cols]); }
  }
  class FakeClient {
    cfg: any = null;
    handlers: Record<string, Array<(...a: any[]) => void>> = {};
    constructor() { sshClients.push(this); }
    on(ev: string, cb: any) { (this.handlers[ev] ||= []).push(cb); return this; }
    once(ev: string, cb: any) { return this.on(ev, cb); }
    emit(ev: string, ...a: any[]) { for (const f of this.handlers[ev] || []) f(...a); return this; }
    connect(cfg: any) { this.cfg = cfg; queueMicrotask(() => this.emit('ready')); return this; }
    forwardOut(_srcIP: string, _srcPort: number, _host: string, _port: number, cb: any) {
      cb(null, new FakeChannel());
    }
    shell(opts: any, cb: any) {
      shellCalls.push(opts);
      const ch = new FakeChannel();
      channels.push(ch);
      cb(null, ch);
    }
    end() { this.ended = true; this.emit('close'); }
  }
  return { Client: FakeClient };
});

import { handleTerminalWs, opsShellModule } from '../src/plugins/ops-shell.js';
import type { PluginWebSocket, PluginWsRequest } from '@yan-zhi/core';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCast, setRecordingsDirForTest } from '../src/plugins/ops-recordings.js';

/** 假 WebSocket：记录发出的帧，并可手动触发事件 */
class FakeWs implements PluginWebSocket {
  sent: Array<string | Buffer> = [];
  readyState = 1;
  closed = false;
  pings = 0;
  private handlers: Record<string, Array<(...a: any[]) => void>> = {};
  send(data: string | Buffer) { this.sent.push(data); }
  close() { if (this.closed) return; this.closed = true; this.emit('close'); }
  ping() { this.pings += 1; }
  on(ev: string, cb: any) { (this.handlers[ev] ||= []).push(cb); return this; }
  emit(ev: string, ...a: any[]) { for (const f of this.handlers[ev] || []) f(...a); return this; }
  /** 收到的 JSON 文本帧 */
  json(): any[] { return this.sent.filter((s) => typeof s === 'string').map((s) => JSON.parse(s as string)); }
  /** 收到的二进制帧 */
  binary(): Buffer[] { return this.sent.filter((s) => Buffer.isBuffer(s)) as Buffer[]; }
  of(type: string): any[] { return this.json().filter((m) => m.type === type); }
}

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    },
  };
}

/** 造一条最小可用的 ssh 连接（与生产种子同结构） */
function conn(over: Record<string, unknown> = {}) {
  return {
    id: 'ops-1', type: 'ssh', name: 'web-1', host: '10.0.0.1', port: 22,
    username: 'root', authType: 'password', secretEnc: 'ENC:pw', createdAt: 0,
    ...over,
  };
}

async function activate(storage: ReturnType<typeof makeStorage>) {
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    storage, emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}

function req(query: string): PluginWsRequest {
  return { url: `/api/plugin/ops-shell/term/ws?${query}`, headers: {} };
}

let storage: ReturnType<typeof makeStorage>;

/** 起一个已连上 PTY 的终端，返回 ws 与那条假通道 */
async function open(seed: unknown[], query = 'connectionId=ops-1&cols=100&rows=40') {
  await activate(storage);
  await storage.set('connections', seed);
  const ws = new FakeWs();
  await handleTerminalWs(ws, req(query));
  return { ws, ch: channels[channels.length - 1] };
}

let recDir: string;

beforeEach(() => {
  sshClients.length = 0;
  shellCalls.length = 0;
  channels.length = 0;
  storage = makeStorage();
  // 录像落临时目录，避免污染真实 DATA_DIR
  recDir = mkdtempSync(join(tmpdir(), 'ops-term-rec-'));
  setRecordingsDirForTest(recDir);
});

afterEach(() => {
  setRecordingsDirForTest(null);
  try { rmSync(recDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('WS 终端 · 握手', () => {
  it('连上后先发 ready 帧，并用请求里的行列开 PTY', async () => {
    const { ws } = await open([conn()]);
    expect(ws.of('ready')).toHaveLength(1);
    expect(shellCalls[0]).toEqual({ cols: 100, rows: 40 });
  });

  it('ready 帧带上默认命令信息，前端据此提示「已自动执行」', async () => {
    const { ws } = await open([conn({ defaultCommand: 'cd /data/app' })]);
    expect(ws.of('ready')[0]).toMatchObject({ autoRun: true, defaultCommand: 'cd /data/app' });
  });

  it('未配默认命令时 autoRun=false（前端不该弹提示）', async () => {
    const { ws } = await open([conn()]);
    expect(ws.of('ready')[0]).toMatchObject({ autoRun: false, defaultCommand: null });
  });

  it('连接不存在 → error 帧并关闭', async () => {
    const { ws } = await open([], 'connectionId=ghost');
    expect(ws.of('error')[0].message).toMatch(/连接不存在/);
    expect(ws.closed).toBe(true);
  });

  it('数据库连接不支持终端 → error 帧', async () => {
    const { ws } = await open([conn({ id: 'db', type: 'database' })], 'connectionId=db');
    expect(ws.of('error')[0].message).toMatch(/数据库连接/);
    expect(shellCalls).toHaveLength(0);
  });
});

describe('WS 终端 · 双向数据', () => {
  it('★ PTY 输出以二进制帧原样下发（不经 base64）', async () => {
    const { ws, ch } = await open([conn()]);
    const out = Buffer.from('total 0\ndrwxr-xr-x\r\n', 'utf8');
    ch.emit('data', out);
    expect(ws.binary()).toEqual([out]);
  });

  it('★ 按键按原始字节写进 PTY（控制字符不能走文本解码）', async () => {
    const { ws, ch } = await open([conn()]);
    const ctrlC = Buffer.from([0x03]);
    ws.emit('message', ctrlC, true);
    expect(ch.writes).toEqual([ctrlC]);
  });

  it('resize 文本帧 → setWindow(rows, cols)', async () => {
    const { ws, ch } = await open([conn()]);
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 132, rows: 43 })), false);
    expect(ch.windows).toEqual([[43, 132]]);
  });

  it('非法 JSON 文本帧被忽略，不会抛错也不会污染通道', async () => {
    const { ws, ch } = await open([conn()]);
    expect(() => ws.emit('message', Buffer.from('not json'), false)).not.toThrow();
    expect(ch.windows).toHaveLength(0);
    expect(ch.writes).toHaveLength(0);
  });

  it('resize 里非法行列（0 / 缺省）被丢弃', async () => {
    const { ws, ch } = await open([conn()]);
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 0, rows: 0 })), false);
    expect(ch.windows).toHaveLength(0);
  });
});

describe('WS 终端 · 生命周期', () => {
  it('PTY 结束 → 发 exit 帧并关闭 ws', async () => {
    const { ws, ch } = await open([conn()]);
    ch.close();
    expect(ws.of('exit')).toHaveLength(1);
    expect(ws.closed).toBe(true);
  });

  it('★ exit 帧只发一次（流重复 close / ws 先断开等重入路径不得重复收尾）', async () => {
    const { ws, ch } = await open([conn()]);
    ch.emit('close');
    ch.emit('close');
    ws.emit('close');
    expect(ws.of('exit')).toHaveLength(1);
  });

  it('客户端断开 → 关掉服务端 PTY（否则会话泄漏）', async () => {
    const { ws, ch } = await open([conn()]);
    ws.close();
    expect(ch.closed).toBe(true);
  });

  it('默认命令在 shell 就绪后自动写入一次', async () => {
    const { ch } = await open([conn({ defaultCommand: 'cd /data/app && ls' })]);
    expect(ch.writes).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 700));
    expect(ch.writes.map((b) => b.toString()).join('')).toContain('cd /data/app && ls');
  });

  it('autoRun=false 时不自动执行默认命令', async () => {
    const { ch } = await open([conn({ defaultCommand: 'rm -rf /tmp/x' })], 'connectionId=ops-1&autoRun=false');
    await new Promise((r) => setTimeout(r, 700));
    expect(ch.writes).toHaveLength(0);
  });

  it('心跳走协议级 ping（浏览器会自动回 pong，前端无需写代码）', async () => {
    vi.useFakeTimers();
    try {
      const { ws, ch } = await open([conn()]);
      expect(ws.pings).toBe(0);
      await vi.advanceTimersByTimeAsync(31000);
      expect(ws.pings).toBeGreaterThan(0);
      // 回一个 pong → 连接被视为存活，不应被断开
      ws.emit('pong');
      await vi.advanceTimersByTimeAsync(31000);
      expect(ws.closed).toBe(false);
      ws.close();
      expect(ch.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WS 终端 · 会话录制', () => {
  /** 等异步落库（persistRecording 是 fire-and-forget） */
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('★ 一次会话产出一条录像：索引落库 + .cast 可回放', async () => {
    const { ws, ch } = await open([conn()]);
    ch.emit('data', Buffer.from('$ ls\r\nfile.txt\r\n'));
    ws.emit('message', Buffer.from('ls\r'), true);
    ws.close();                       // 客户端断开 → cleanup 收尾录像
    await settle();

    const idx = (await storage.get('recordings')) as any[];
    expect(idx).toHaveLength(1);
    expect(idx[0]).toMatchObject({ connectionName: 'web-1', transport: 'websocket', cols: 100, rows: 40 });
    expect(idx[0].truncated).toBe(false);
    expect(idx[0].endedAt).toBeGreaterThanOrEqual(idx[0].startedAt);

    const file = join(recDir, `${idx[0].id}.cast`);
    expect(existsSync(file)).toBe(true);
    const { header, events } = parseCast(readFileSync(file, 'utf8'));
    expect(header).toMatchObject({ version: 2, width: 100, height: 40 });
    // 输出用于回放、输入用于命令审计，两者都要在
    expect(events.filter((e) => e.type === 'o').map((e) => e.data).join('')).toContain('file.txt');
    expect(events.filter((e) => e.type === 'i').map((e) => e.data).join('')).toContain('ls');
  });

  it('ready 帧告诉前端这次会话在录制', async () => {
    const { ws } = await open([conn()]);
    expect(ws.of('ready')[0]).toMatchObject({ recording: true });
    ws.close();
  });

  it('resize 也进录像（回放时按时间点重排，避免长行错位）', async () => {
    const { ws } = await open([conn()]);
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 132, rows: 43 })), false);
    ws.close();
    await settle();

    const idx = (await storage.get('recordings')) as any[];
    const { events } = parseCast(readFileSync(join(recDir, `${idx[0].id}.cast`), 'utf8'));
    expect(events.some((e) => e.type === 'r' && e.data === '132x43')).toBe(true);
  });

  it('★ 会话尚未产生任何输出时也有录像（只有头行的合法 .cast）', async () => {
    const { ws } = await open([conn()]);
    ws.close();
    await settle();

    const idx = (await storage.get('recordings')) as any[];
    expect(idx).toHaveLength(1);
    const { header, events } = parseCast(readFileSync(join(recDir, `${idx[0].id}.cast`), 'utf8'));
    expect(header?.version).toBe(2);
    expect(events).toHaveLength(0);
  });
});
