/**
 * 断点续传的**真机验证**：本机起一台真正的 SFTP 服务器，走真实协议往返。
 *
 * 为什么不能只用假 sftp 对象（`ops-sftp-dir-ops.test.ts` 里那些）：续传方案的对错全在
 * **协议层** —— 续传那一次 OPEN 到底带不带 TRUNC、WRITE 落在什么偏移上，只有真服务器看得见。
 * 拿假对象断言"参数长得对"，测不出"接着传把前半截冲掉了"这类事故，而那正是这个功能
 * 唯一会出事的地方（把远端文件写坏）。
 *
 * 服务器用 ssh2 自带的 `Server`（内存文件系统，端口 0 自动分配，不碰真机、不碰生产），
 * 客户端用 ssh2 的 `Client` —— 与运维模式上传走的是同一套协议实现。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server, Client, utils } from 'ssh2';

import { sftpUploadRange } from '../src/plugins/ops-shell.js';

const { STATUS_CODE, OPEN_MODE } = utils.sftp;

/** 一台内存文件系统的 SFTP 服务器；顺便把协议层的动作记下来给断言用 */
function startFakeSftp() {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>(['/']);
  const handles = new Map<number, string>();
  /** 每次 OPEN 的原始 flags（★ 断言 TRUNC 就在这里看） */
  const opens: Array<{ path: string; flags: number }> = [];
  /** 每次 WRITE 的偏移与长度（★ 断言"续传是从 offset 处写的"） */
  const writes: Array<{ path: string; offset: number; len: number }> = [];
  let handleSeq = 0;

  // 主机密钥用 RSA/PKCS#1：ssh2 1.17 解析不了 ed25519 的 PKCS#8 PEM
  //（"Cannot parse privateKey: Unsupported key format"），RSA 的经典 PEM 一定能吃。
  const hostKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
  const server = new Server(
    { hostKeys: [hostKey] },
    (client) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'secret') ctx.accept();
        else ctx.reject();
      });
      client.on('ready', () => {
        client.on('session', (accept) => {
          const session = accept();
          session.on('sftp', (acceptSftp) => {
            const sftp = acceptSftp() as unknown as {
              on: (ev: string, cb: (...a: never[]) => void) => void;
              status: (reqid: number, code: number) => void;
              handle: (reqid: number, h: Buffer) => void;
              name: (reqid: number, n: unknown[]) => void;
              attrs: (reqid: number, a: unknown) => void;
            };
            const pathOf = (h: Buffer) => handles.get(h.readUInt32BE(0)) ?? '';
            const attrsOf = (p: string) => ({
              mode: dirs.has(p) ? 0o040755 : 0o100644,
              uid: 0, gid: 0, size: files.get(p)?.length ?? 0, atime: 0, mtime: 0,
            });
            const replyAttrs = (reqid: number, p: string) => {
              if (!files.has(p) && !dirs.has(p)) { sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE); return; }
              sftp.attrs(reqid, attrsOf(p));
            };

            sftp.on('REALPATH', (reqid: number, p: string) => {
              const rp = !p || p === '.' ? '/' : p;
              sftp.name(reqid, [{ filename: rp, longname: rp, attrs: attrsOf(rp) }]);
            });
            sftp.on('STAT', (reqid: number, p: string) => replyAttrs(reqid, p));
            sftp.on('LSTAT', (reqid: number, p: string) => replyAttrs(reqid, p));
            // ★ ssh2 服务端 OPEN 回调里的 flags 是**裸的 uint32**，不是 `{ flags }` 对象
            //   （SFTP.js 里 `const pflags = bufferParser.readUInt32BE()`）——写成属性访问会
            //   永远拿到 undefined，于是每个 CREAT 文件都被判成"不存在"，第一次 OPEN 就 NO_SUCH_FILE。
            sftp.on('OPEN', (reqid: number, filename: string, flags: number) => {
              const f = flags;
              opens.push({ path: filename, flags: f });
              const exists = files.has(filename);
              if (!exists && !(f & OPEN_MODE.CREAT)) { sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE); return; }
              if ((f & OPEN_MODE.TRUNC) || !exists) files.set(filename, Buffer.alloc(0));
              const id = ++handleSeq;
              handles.set(id, filename);
              const h = Buffer.alloc(4);
              h.writeUInt32BE(id, 0);
              sftp.handle(reqid, h);
            });
            sftp.on('WRITE', (reqid: number, h: Buffer, offset: number, data: Buffer) => {
              const p = pathOf(h);
              const base = files.get(p) ?? Buffer.alloc(0);
              // 偏移写法对错在这里露馅：落在 base.length 之后就是"中间留洞"
              const out = Buffer.alloc(Math.max(base.length, offset + data.length));
              base.copy(out, 0);
              data.copy(out, offset);
              files.set(p, out);
              writes.push({ path: p, offset, len: data.length });
              sftp.status(reqid, STATUS_CODE.OK);
            });
            sftp.on('FSTAT', (reqid: number, h: Buffer) => replyAttrs(reqid, pathOf(h)));
            sftp.on('CLOSE', (reqid: number, h: Buffer) => {
              handles.delete(h.readUInt32BE(0));
              sftp.status(reqid, STATUS_CODE.OK);
            });
            sftp.on('MKDIR', (reqid: number, p: string) => { dirs.add(p); sftp.status(reqid, STATUS_CODE.OK); });
            sftp.on('OPENDIR', (reqid: number, p: string) => {
              if (!dirs.has(p) && !files.has(p)) { sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE); return; }
              const id = ++handleSeq;
              handles.set(id, p);
              const h = Buffer.alloc(4);
              h.writeUInt32BE(id, 0);
              sftp.handle(reqid, h);
            });
            sftp.on('READDIR', (reqid: number) => { sftp.name(reqid, []); sftp.status(reqid, STATUS_CODE.EOF); });
            sftp.on('REMOVE', (reqid: number, p: string) => { files.delete(p); sftp.status(reqid, STATUS_CODE.OK); });
            sftp.on('RMDIR', (reqid: number, p: string) => { dirs.delete(p); sftp.status(reqid, STATUS_CODE.OK); });
          });
        });
      });
    },
  );
  return { server, files, opens, writes };
}

describe('断点续传 · 对着真正的 SFTP 服务器跑一遍', () => {
  const state = startFakeSftp();
  let client: Client;
  let sftp: never;
  let dir: string;

  beforeAll(async () => {
    const port = await new Promise<number>((res) =>
      state.server.listen(0, '127.0.0.1', () => res((state.server.address() as { port: number }).port)));
    client = new Client();
    await new Promise<void>((res, rej) => {
      client.on('ready', () => res()).on('error', rej);
      client.connect({ host: '127.0.0.1', port, username: 'tester', password: 'secret' });
    });
    sftp = (await new Promise((res, rej) => client.sftp((e, s) => (e ? rej(e) : res(s))))) as never;
    dir = mkdtempSync(join(tmpdir(), 'resume-e2e-'));
  }, 30000);

  afterAll(() => {
    try { client.end(); } catch { /* ignore */ }
    try { state.server.close(); } catch { /* ignore */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('★★ 传到一半被打断、再从断点续传 —— 最终文件与源文件逐字节一致', async () => {
    const local = join(dir, 'big.bin');
    const src = randomBytes(3 * 1024 * 1024);          // 3MB，远大于 64KB 的分块
    writeFileSync(local, src);
    const remote = '/resume/big.bin';

    // 第一趟：读到约 500KB 就"按下暂停"
    let read = 0;
    const first = await sftpUploadRange(sftp, local, remote, 0, (n) => { read = n; }, () => read > 500 * 1024);
    expect(first.cancelled, '没停下来（shouldAbort 根本没生效）').toBe(true);
    expect(first.written, '说停却把整个文件传完了').toBeLessThan(src.length);

    // 断点取远端**实际落盘**的大小 —— 这正是方案里刻意不信内存计数的原因
    const partial = state.files.get(remote);
    expect(partial, '远端没留下半个文件，续传无从谈起').toBeTruthy();
    const offset = partial?.length ?? 0;
    expect(offset, '断了却没写进去一个字节').toBeGreaterThan(0);

    // 第二趟：从断点接着传
    const second = await sftpUploadRange(sftp, local, remote, offset, () => {}, () => false);
    expect(second.cancelled).toBe(false);

    const got = state.files.get(remote) ?? Buffer.alloc(0);
    expect(got.length, '续传后长度不对（拼接位置错了）').toBe(src.length);
    expect(got.equals(src), '★★ 续传后内容与源文件不一致 —— 典型的"接着传把前面冲掉了"').toBe(true);
  }, 30000);

  it('★★ 续传那次 OPEN 绝不能带 TRUNC（带了就等于把已传的那截删了重来）', async () => {
    const a = join(dir, 'a.bin');
    const srcA = randomBytes(200 * 1024);
    writeFileSync(a, srcA);
    const remote = '/flags/size.bin';
    await sftpUploadRange(sftp, a, remote, 0, () => {}, () => false);
    expect(state.files.get(remote)?.length).toBe(200 * 1024);

    // 换一个**不同的**源文件、从 100KB 处续写：这样"前半截有没有被保住"一眼可判
    //（用同一个文件续传的话，就算前半截被冲掉了内容也看不出来）
    const b = join(dir, 'b.bin');
    const srcB = randomBytes(300 * 1024);
    writeFileSync(b, srcB);
    state.opens.length = 0;
    await sftpUploadRange(sftp, b, remote, 100 * 1024, () => {}, () => false);

    expect(state.opens, '续传没发 OPEN').toHaveLength(1);
    expect(state.opens[0].flags & OPEN_MODE.TRUNC, '★★ 续传带了 TRUNC，前面传的那截会被清掉').toBeFalsy();
    const got = state.files.get(remote) ?? Buffer.alloc(0);
    expect(got.length).toBe(300 * 1024);
    expect(
      got.subarray(0, 100 * 1024).equals(srcA.subarray(0, 100 * 1024)),
      '★★ 续传把前 100KB 的旧内容冲掉了 —— TRUNC 造成的破坏就是长这样',
    ).toBe(true);
    expect(got.subarray(100 * 1024).equals(srcB.subarray(100 * 1024)), '断点之后的内容不对').toBe(true);
  }, 30000);

  it('★★ 续传的 WRITE 落在断点偏移上（不是从 0 重写）', async () => {
    const local = join(dir, 'off.bin');
    const src = randomBytes(80 * 1024);
    writeFileSync(local, src);
    const remote = '/offsets/x.bin';
    // 先摆出"上次传到一半"的现场：远端已有这个文件的前 40KB（生产中就是上一次尝试留下的残留）
    state.files.set(remote, Buffer.from(src.subarray(0, 40 * 1024)));
    state.writes.length = 0;

    await sftpUploadRange(sftp, local, remote, 40 * 1024, () => {}, () => false);

    const mine = state.writes.filter((w) => w.path === remote);
    expect(mine.length, '没有产生任何 WRITE').toBeGreaterThan(0);
    expect(mine[0].offset, '★ 第一个 WRITE 不在断点上 —— 会把前面 40KB 覆盖掉').toBe(40 * 1024);
    expect(state.files.get(remote)?.equals(src), '续传拼出来的文件与源文件不一致').toBe(true);
  }, 30000);

  it('★ 首传（offset=0）必须带 TRUNC + CREAT，不留上次的残渣', async () => {
    const local = join(dir, 'fresh.bin');
    writeFileSync(local, randomBytes(1024));
    state.opens.length = 0;
    await sftpUploadRange(sftp, local, '/fresh/new.bin', 0, () => {}, () => false);
    expect(state.opens).toHaveLength(1);
    expect(state.opens[0].flags & OPEN_MODE.TRUNC, '首传没截断').toBeTruthy();
    expect(state.opens[0].flags & OPEN_MODE.CREAT, '首传没带 CREAT，远端不存在时建不出来').toBeTruthy();
  }, 30000);

  it('★ 空文件也要在远端落成一个 0 字节文件', async () => {
    const local = join(dir, 'empty.txt');
    writeFileSync(local, '');
    await sftpUploadRange(sftp, local, '/fresh/empty.txt', 0, () => {}, () => false);
    expect(state.files.has('/fresh/empty.txt'), '空文件被跳过了，远端不会出现它').toBe(true);
    expect(state.files.get('/fresh/empty.txt')?.length).toBe(0);
  }, 30000);

  it('★ 反复暂停/继续（多次中断）最终仍然逐字节正确', async () => {
    const local = join(dir, 'multi.bin');
    const src = randomBytes(1024 * 1024);
    writeFileSync(local, src);
    const remote = '/multi/x.bin';
    let offset = 0;
    let rounds = 0;
    let cancelledAny = false;
    while (offset < src.length) {
      const base = offset;
      let lastRead = base;
      // 每趟只让传 120KB 就又"按暂停"，逼出多次续传拼接
      const r = await sftpUploadRange(
        sftp, local, remote, offset,
        (n) => { lastRead = n; },
        () => lastRead - base > 120 * 1024,
      );
      rounds += 1;
      cancelledAny = cancelledAny || r.cancelled;
      const now = state.files.get(remote)?.length ?? 0;
      expect(now, '续传一轮下来断点没前进（会死循环）').toBeGreaterThan(offset);
      offset = now;
      if (!r.cancelled) break;
      if (rounds > 50) throw new Error('循环没有收敛');
    }
    expect(cancelledAny, '一次都没被打断，这个用例没测到"反复续传"').toBe(true);
    expect(rounds, '只跑了一轮，没测到反复续传').toBeGreaterThan(1);
    expect(state.files.get(remote)?.equals(src), '★ 反复断点续传后内容损坏').toBe(true);
  }, 30000);
});
