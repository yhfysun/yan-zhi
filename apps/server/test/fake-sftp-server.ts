/**
 * 测试用的**真 SFTP 服务器**（内存文件系统），给断点续传相关的端到端测试共用。
 *
 * 为什么要真服务器而不是假 `sftp` 对象：续传的对错全在协议层 —— 续传那次 OPEN 带不带
 * TRUNC、WRITE 落在什么偏移上，只有真服务器看得见。假对象只能断言"参数长得对"，
 * 测不出"接着传把前半截冲掉了"，而那正是这个功能唯一会出事的地方（把远端文件写坏）。
 *
 * 服务器是 ssh2 自带的 `Server`（与生产客户端同一个库），监在 127.0.0.1 的随机端口，
 * **不碰真机、不碰生产连接**。
 */
import { generateKeyPairSync } from 'node:crypto';
import { Server, utils } from 'ssh2';

const { STATUS_CODE, OPEN_MODE } = utils.sftp;

/** 服务端主机密钥：用 RSA/PKCS#1。ssh2 1.17 解析不了 ed25519 的 PKCS#8 PEM
 *  （报 "Cannot parse privateKey: Unsupported key format"）。 */
function hostKeyPem(): string {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
}

export interface FakeSftp {
  server: Server;
  /** 内存文件系统：路径 → 内容（`get()` 返回的 Buffer 可当普通 Buffer 用：`.length`/`.equals()` 都行） */
  files: Map<string, Buffer>;
  /** 每次 OPEN 的原始 flags（★ 断言 TRUNC 就在这里看） */
  opens: Array<{ path: string; flags: number }>;
  /** 每次 WRITE 的偏移与长度（★ 断言"续传是从断点处写的"） */
  writes: Array<{ path: string; offset: number; len: number }>;
  /** 监听并返回端口 */
  listen(): Promise<number>;
  /** 关掉服务器与所有还开着的客户端连接（不留开放句柄，否则 vitest 收不了尾） */
  close(): void;
}

/**
 * @param opts.writeDelayMs 每次 WRITE 回 status 前的人为延迟。
 *   加它是为了让"传到一半按暂停"这件事**确定性地发生**，而不是靠抢时间窗口 ——
 *   SFTP 客户端是一条接一条地发 WRITE（上一条的 status 回来才发下一条），
 *   所以延迟回包就等于把吞吐压到约 (64KB / writeDelayMs) 每秒。
 */
export function startFakeSftp(opts: { writeDelayMs?: number } = {}): FakeSftp {
  const writeDelayMs = opts.writeDelayMs ?? 0;
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>(['/']);
  const handles = new Map<number, string>();
  const opens: FakeSftp['opens'] = [];
  const writes: FakeSftp['writes'] = [];
  let handleSeq = 0;
  const clients: Array<{ end: () => void }> = [];

  const server = new Server({ hostKeys: [hostKeyPem()] }, (client) => {
    clients.push(client as unknown as { end: () => void });
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
          // ★ ssh2 服务端 OPEN 回调里的 flags 是**裸 uint32**，不是 `{ flags }` 对象
          //   （SFTP.js 里 `const pflags = bufferParser.readUInt32BE()`）——写成属性访问会永远
          //   拿到 undefined，于是每个 CREAT 文件都被判成"不存在"，第一次 OPEN 就 NO_SUCH_FILE。
          sftp.on('OPEN', (reqid: number, filename: string, flags: number) => {
            opens.push({ path: filename, flags });
            const exists = files.has(filename);
            if (!exists && !(flags & OPEN_MODE.CREAT)) { sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE); return; }
            if ((flags & OPEN_MODE.TRUNC) || !exists) files.set(filename, Buffer.alloc(0));
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
            if (writeDelayMs > 0) setTimeout(() => sftp.status(reqid, STATUS_CODE.OK), writeDelayMs);
            else sftp.status(reqid, STATUS_CODE.OK);
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
  });

  return {
    server,
    files,
    opens,
    writes,
    listen: () => new Promise<number>((res) =>
      server.listen(0, '127.0.0.1', () => res((server.address() as { port: number }).port))),
    close: () => {
      for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
      try { server.close(); } catch { /* ignore */ }
    },
  };
}

export { OPEN_MODE, STATUS_CODE };
