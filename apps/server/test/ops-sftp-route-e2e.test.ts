/**
 * 上传链路（**路由层**）的端到端验证：界面上点「暂停 / 继续」这条链真的走得通吗？
 *
 * 与 `ops-sftp-resume-e2e.test.ts` 的分工：
 *   · 那个文件验的是**传输原语** `sftpUploadRange`（断点算得对不对、续传带不带 TRUNC）；
 *   · 本文件验的是它上面那一层 —— 真实的 `POST /sftp/upload` → SSE 进度流 →
 *     `POST /sftp/job/pause` → worker 重试，整条链在**真 SFTP 服务器**上跑一遍。
 *   中间那层（暂停闸门、startedDests、每次尝试前重新 stat 远端算断点）只有在这里才验得到。
 *
 * 服务器是本机内存文件系统的真 SFTP（见 `fake-sftp-server.ts`），**不碰真机、不碰生产**。
 * 连接记录直接塞进插件的 storage（凭据加解密用假的 `ENC:` 版本，见下面的 vi.mock），
 * 走的是与生产完全相同的 `resolveSftpConn` → ssh2 Client 路径（含主机密钥 TOFU）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// crypto 依赖 data.db（取主密钥），测试里换成可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { opsShellModule } from '../src/plugins/ops-shell.js';
import { OPEN_MODE, startFakeSftp, type FakeSftp } from './fake-sftp-server.js';

type Handler = (req: unknown, res: unknown) => unknown;
type Route = { method: string; pattern: string; handler: Handler };

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}

/** 只挂路由的插件上下文（与 ops-sftp-dir-ops.test.ts 同一套口径） */
async function activate(storage: ReturnType<typeof makeStorage>): Promise<Route[]> {
  const routes: Route[] = [];
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (p: string, h: Handler) => routes.push({ method: 'GET', pattern: p, handler: h }),
        post: (p: string, h: Handler) => routes.push({ method: 'POST', pattern: p, handler: h }),
        put: (p: string, h: Handler) => routes.push({ method: 'PUT', pattern: p, handler: h }),
        delete: (p: string, h: Handler) => routes.push({ method: 'DELETE', pattern: p, handler: h }),
      };
      setup(app);
      return { dispose: () => {} };
    },
    registerWebSocket: () => ({ dispose: () => {} }),
    storage,
    emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
  return routes;
}

function mockRes() {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { res.statusCode = c; return res; },
    json(d: unknown) { res.body = d; return res; },
  };
  return res;
}
type MockRes = ReturnType<typeof mockRes>;
const errOf = (res: MockRes) => (res.body as { error?: string }).error;

let routes: Route[] = [];
const sseStops: Array<() => void> = [];

/** 按 pattern 找路由（支持 :param），找不到就抛 —— 路由没注册是测试自己的问题 */
function findRoute(method: string, path: string): { handler: Handler; params: Record<string, string> } {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  throw new Error(`路由未注册: ${method} ${path}`);
}

async function call(method: string, path: string, body: Record<string, unknown> = {}): Promise<MockRes> {
  const { handler, params } = findRoute(method, path);
  const res = mockRes();
  await handler({ body, params, query: {} }, res);
  return res;
}

/** 连上进度 SSE，把每帧 JSON 收进数组（界面就是这么看任务的） */
async function subscribeSse(jobId: string) {
  const { handler, params } = findRoute('GET', `/sftp/progress/${jobId}/stream`);
  const frames: Array<Record<string, unknown>> = [];
  let closeCb: (() => void) | null = null;
  let buf = '';
  const res = {
    setHeader: () => {},
    write: (d: string) => {
      buf += d;
      for (;;) {
        const i = buf.indexOf('\n\n');
        if (i < 0) break;
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = raw.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;                       // ':connected' 之类的注释帧
        try { frames.push(JSON.parse(line.slice(5).trim()) as Record<string, unknown>); } catch { /* 半截帧，跳过 */ }
      }
      return true;
    },
    end: () => {},
  };
  const on = (ev: string, cb: () => void) => { if (ev === 'close') closeCb = cb; };
  // 塞给路由的 req 要同时满足：读 params.id、能挂 'close' 收尾
  await handler({ params, on }, res as never);
  const stop = () => closeCb?.();
  sseStops.push(stop);
  return { frames, stop, last: () => frames[frames.length - 1] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (cond()) return;
    await sleep(5);
  }
  throw new Error(`等待超时：${label}`);
}

describe('上传路由 · 暂停 / 断点续传 端到端（真 SFTP 服务器）', () => {
  // 每次 WRITE 延迟 6ms ⇒ 吞吐压到约 10MB/s，好让"传到一半按暂停"确定性地发生，
  // 而不是靠抢那几十毫秒的时间窗口（抢窗口的测试迟早会 flaky）
  const fake: FakeSftp = startFakeSftp({ writeDelayMs: 6 });
  let dir: string;

  beforeAll(async () => {
    const port = await fake.listen();
    dir = mkdtempSync(join(tmpdir(), 'route-e2e-'));
    const storage = makeStorage();
    // sftpPath 直接给 '/upload'：省掉 realpath 探测，destDir 落点可预期
    await storage.set('connections', [{
      id: 'c1', type: 'ssh', name: 'local-fake', host: '127.0.0.1', port,
      username: 'tester', authType: 'password', secretEnc: 'ENC:secret', sftpPath: '/upload',
    }]);
    routes = await activate(storage);
  }, 30000);

  afterAll(() => {
    for (const stop of sseStops) { try { stop(); } catch { /* ignore */ } }
    fake.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('★★ 点「暂停」传输真的停住；点「继续」从断点续传 —— 最终逐字节一致', async () => {
    const local = join(dir, 'big.bin');
    const src = randomBytes(4 * 1024 * 1024);
    writeFileSync(local, src);
    const remote = '/upload/big.bin';

    // 1) 起上传（界面点上传按钮走的就是这条）
    const up = await call('POST', '/sftp/upload', {
      connectionId: 'c1', destDir: '/upload', files: [{ localPath: local }],
    });
    expect(up.statusCode, `上传接口没成功：${String(errOf(up))}`).toBe(200);
    const jobId = (up.body as { data: { jobId: string } }).data.jobId;
    expect(jobId, '上传没回 jobId，界面就没法订阅进度').toBeTruthy();

    // 2) 订阅进度
    const sse = await subscribeSse(jobId);

    // 3) 等它真的开始写（不等的话"暂停"可能落在传输之前，等于什么都没测）
    await waitFor(() => (fake.files.get(remote)?.length ?? 0) > 0, 5000, '上传开始写远端');

    // 4) 点「暂停」
    const paused = await call('POST', '/sftp/job/pause', { jobId, paused: true });
    expect(paused.statusCode).toBe(200);
    expect((paused.body as { data: { paused: boolean } }).data.paused).toBe(true);

    // 5) 暂停生效：等最多一个在飞分块落完，之后远端大小必须冻住
    await sleep(250);
    const atPause = fake.files.get(remote)?.length ?? 0;
    expect(atPause, '暂停时一个字节都没写，测不到"停在断点上"').toBeGreaterThan(0);
    expect(atPause, '暂停前就传完了，这次没测到中途暂停').toBeLessThan(src.length);
    await sleep(500);
    expect(fake.files.get(remote)?.length ?? 0, '★ 暂停后远端还在长 —— 暂停根本没生效').toBe(atPause);

    // 界面看到的也必须是"已暂停且仍在进行中"（被判成终态的话界面会显示成"已结束"）
    const pausedFrame = sse.last();
    expect(pausedFrame?.paused, 'SSE 没把「已暂停」推给界面').toBe(true);
    expect(pausedFrame?.state, '暂停被误当成终态').toBe('running');

    // 6) 点「继续」
    const resumed = await call('POST', '/sftp/job/pause', { jobId, paused: false });
    expect((resumed.body as { data: { paused: boolean } }).data.paused).toBe(false);

    // 7) 等跑完
    await waitFor(
      () => sse.frames.some((f) => f.state === 'done' || f.state === 'failed'),
      20000, '续传后任务结束',
    );
    const last = sse.last();
    expect(last?.state, `任务失败了：${String(last?.error)}`).toBe('done');
    expect(last?.doneCount, '任务说完成了，但条目数没走完').toBe(1);

    // 8) ★ 最终文件必须与源文件逐字节一致
    const got = fake.files.get(remote) ?? Buffer.alloc(0);
    expect(got.length, '续传后长度不对').toBe(src.length);
    expect(got.equals(src), '★★ 界面暂停/继续一轮之后，远端文件被写坏了').toBe(true);
  }, 60000);

  it('★★ 协议层：首传 OPEN 带 TRUNC，续传那次不带（续传不能把已传的冲掉）', async () => {
    const opens = fake.opens.filter((o) => o.path === '/upload/big.bin');
    expect(opens.length, '这个文件至少该有两次 OPEN（首传 + 续传）').toBeGreaterThanOrEqual(2);
    expect(opens[0].flags & OPEN_MODE.TRUNC, '首传没截断，会留下上次的残渣').toBeTruthy();
    expect(
      opens[opens.length - 1].flags & OPEN_MODE.TRUNC,
      '★★ 续传带了 TRUNC —— 前面传的那截会被清掉（"传了一半又从头来"的真实形态）',
    ).toBeFalsy();
  });

  it('★ 断点是"远端实际落盘的大小"，WRITE 一路向前不回退（不是从 0 重写）', async () => {
    // 只要续传是从 0 重写，WRITE 的偏移序列就会出现"回落"
    const mine = fake.writes.filter((w) => w.path === '/upload/big.bin');
    expect(mine.length).toBeGreaterThan(0);
    let maxSeen = 0;
    let fellBack = 0;
    for (const w of mine) {
      if (w.offset < maxSeen - 1024 * 1024) fellBack += 1;   // 容一点乱序，超过 1MB 的回退才算
      maxSeen = Math.max(maxSeen, w.offset + w.len);
    }
    expect(fellBack, `★ WRITE 偏移出现 ${fellBack} 次大幅回退 —— 续传是从头重写的`).toBe(0);
  });

  it('★★ 并发下多个文件进同一个**新**父目录：没人能抢在 mkdir 完成前开写', async () => {
    // 用户实报：上传目录到第 5 个文件失败「No such file」（任务行显示 4/27 · 失败）。
    // 根因是"建目录"被缓存成了布尔值：worker B 看到 A 已登记就直接开写，而此刻
    // A 的 mkdir 还没回来 —— 远端目录尚不存在，OPEN 立刻 NO_SUCH_FILE。
    // 这里把 mkdir 拖慢 80ms，让这个竞态**必然**发生（修好后所有 worker 等同一个 mkdir）。
    const sub = join(dir, 'newsub');
    mkdirSync(sub);
    for (let i = 0; i < 6; i++) writeFileSync(join(sub, `f${i}.bin`), randomBytes(48 * 1024));

    fake.setMkdirDelay(80);
    try {
      const up = await call('POST', '/sftp/upload', {
        connectionId: 'c1', destDir: '/upload', files: [{ localPath: sub, rel: 'newsub' }],
      });
      expect(up.statusCode, `上传接口失败：${String(errOf(up))}`).toBe(200);
      const jobId = (up.body as { data: { jobId: string } }).data.jobId;
      const sse = await subscribeSse(jobId);

      await waitFor(
        () => sse.frames.some((f) => f.state === 'done' || f.state === 'failed'),
        20000, '并发建目录的上传结束',
      );
      const last = sse.last();
      expect(last?.state, `任务失败了：${String(last?.error)}`).toBe('done');
      for (let i = 0; i < 6; i++) {
        const p = `/upload/newsub/f${i}.bin`;
        expect(fake.files.has(p), `缺文件 ${p} —— 并发抢在 mkdir 之前开写的典型症状`).toBe(true);
        expect(fake.files.get(p)?.length).toBe(48 * 1024);
      }
    } finally {
      fake.setMkdirDelay(0);
    }
  }, 40000);

  it('暂停接口的边界：不认识的任务 → 404；非上传任务 → 400', async () => {
    const missing = await call('POST', '/sftp/job/pause', { jobId: 'nope', paused: true });
    expect(missing.statusCode).toBe(404);

    // 删除任务不给暂停（中途停没有安全点）。这条有天然竞态：小文件可能瞬间就删完了，
    // 那时报的是"任务已结束"而不是"只有上传任务支持暂停"——两种都是 400，都算对。
    fake.files.set('/upload/small.bin', Buffer.from('x'));
    const del = await call('POST', '/sftp/unlink', { connectionId: 'c1', path: '/upload/small.bin' });
    expect(del.statusCode).toBe(200);
    const delJob = (del.body as { data: { jobId: string } }).data.jobId;
    const delPause = await call('POST', '/sftp/job/pause', { jobId: delJob, paused: true });
    expect(delPause.statusCode).toBe(400);
    expect(errOf(delPause)).toMatch(/只有上传任务支持暂停|任务已结束/);
  }, 30000);
});
