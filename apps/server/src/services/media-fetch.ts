// 媒体字节下载（带本机代理兜底）
//
// 背景：agnes 产物 CDN（platform-outputs.agnes-ai.space）在部分网络下**直连超时**——
// DNS 正常、主域（www.agnes-ai.com / apihub）也正常，只有这个 CDN 域被挡；
// 而本机通常挂着 Clash/FlClash 之类的代理，渲染层（Chromium）走系统代理能显示图片，
// 服务端 Node 的 fetch 却不走系统代理 —— 于是「图能看，但落不到本地盘」：
// file 字段失踪 → 交付目录没文件 → 消息末尾的交付卡片空着。
//
// 这里按「直连 → 失败则经本机代理 CONNECT 隧道重试」的顺序拿字节，
// 隧道用 node:net + node:tls 手写，不引入 undici 之类的新依赖。
// 直连已被证明超时的 host 会记进黑名单，后续该 host 直接走代理，不再白等一个超时。

import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export interface ProxyEndpoint {
  host: string;
  port: number;
}

/** 环境变量里显式配置的代理优先（大小写都认） */
const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy'];
/** 没配环境变量时探测的本机代理端口：Clash/FlClash 7890、Clash Verge 7897、V2Ray 10809、通用 1080/8080/8888 */
const LOCAL_PROXY_PORTS = [7890, 7897, 10809, 1080, 8080, 8888];

/** 直连媒体域的超时：媒体多为几 MB，20s 足够；超了就直接转代理，不白等半分钟 */
const DIRECT_TIMEOUT_MS = 20000;

let proxyCandidates: ProxyEndpoint[] | null = null;
/**
 * 直连已验证不通的 host → 记录时刻。
 *
 * 带 TTL 而不是永久拉黑：直连失败可能是**偶发**的（网络抖动、代理刚起来、CDN 临时不可达），
 * 永久拉黑会让该 host 在本进程余下的生命周期里永远只走代理 —— 而代理也未必一直可用。
 * 过期后重新尝试直连，网络恢复时能自动回到最快路径。
 */
const directBlockedHosts = new Map<string, number>();
const DIRECT_BLOCK_TTL_MS = 10 * 60 * 1000; // 10 分钟

/** 该 host 是否处于「直连冷却」中（未过期） */
function isDirectBlocked(host: string): boolean {
  const at = directBlockedHosts.get(host);
  if (at === undefined) return false;
  if (Date.now() - at > DIRECT_BLOCK_TTL_MS) {
    directBlockedHosts.delete(host);
    return false;
  }
  return true;
}

/** 解析代理 URL；支持带/不带 scheme 的写法（http://127.0.0.1:7890 与 127.0.0.1:7890） */
export function parseProxyUrl(raw: string | undefined): ProxyEndpoint | null {
  const s = (raw || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes('://') ? s : `http://${s}`);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    if (!u.hostname) return null;
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

/** 端口是否在监听（800ms 内没连上就认为没开） */
export function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}

/** 环境变量里声明的代理候选（多个 key 可能给出不同值，去重后按优先级） */
function proxiesFromEnv(): ProxyEndpoint[] {
  const out: ProxyEndpoint[] = [];
  const seen = new Set<string>();
  for (const key of PROXY_ENV_KEYS) {
    const p = parseProxyUrl(process.env[key]);
    if (!p) continue;
    const k = `${p.host}:${p.port}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * 代理候选链：环境变量声明的代理在前（可能有多个来源，如 shell 注入 + 用户自配），
 * 本机常见端口探测到的在后。逐个尝试而不是「选中一个就用到底」——
 * 环境变量里的代理未必有效（可能指向已退出的进程），失败时要能落到真实在听的那个端口。
 * 结果缓存，避免每次下载都探测。
 */
export async function resolveMediaProxyCandidates(): Promise<ProxyEndpoint[]> {
  if (proxyCandidates) return proxyCandidates;
  const env = proxiesFromEnv();
  const envKeys = new Set(env.map((p) => `${p.host}:${p.port}`));
  const local: ProxyEndpoint[] = [];
  for (const port of LOCAL_PROXY_PORTS) {
    if (envKeys.has(`127.0.0.1:${port}`)) continue;
    if (await portOpen('127.0.0.1', port)) local.push({ host: '127.0.0.1', port });
  }
  proxyCandidates = [...env, ...local];
  return proxyCandidates;
}

/** 兼容单值调用：取候选链的第一个 */
export async function resolveMediaProxy(): Promise<ProxyEndpoint | null> {
  const list = await resolveMediaProxyCandidates();
  return list[0] || null;
}

/**
 * 直连以字节形式取回（走全局 fetch）。仅在 downloadMediaBinary 内部使用，
 * 导出是为了让单测能单独钉住「超时上限」的实现细节。
 */
export async function directFetch(url: string, timeoutMs: number): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('下载到空内容');
  return buf;
}

/** 记录：该 host 直连不通（TTL 内后续同 host 直接走代理，过期后重新尝试直连） */
export function markDirectBlocked(url: string) {
  try { directBlockedHosts.set(new URL(url).hostname, Date.now()); } catch { /* 非法 url 忽略 */ }
}

/**
 * 从 CONNECT 响应字节流里分离出「状态码」与「响应头之后的剩余字节」。
 *
 * 为什么需要单独成函数：CONNECT 响应头与 TLS ServerHello 常在同一 TCP 包里到达，
 * 剩余字节必须 unshift 回 socket，否则等于丢掉 TLS 握手数据 ——
 * 症状是小文件偶尔能过、大文件必然 ECONNRESET，在真实网络里几乎无法复现验证，故用纯函数钉住。
 * status=0 表示响应头尚未收全，调用方应继续累积。
 */
export function splitConnectResponse(head: Buffer): { status: number; leftover: Buffer } {
  const text = head.toString('latin1');
  const idx = text.indexOf('\r\n\r\n');
  if (idx === -1) return { status: 0, leftover: Buffer.alloc(0) };
  const status = Number((/HTTP\/\d(?:\.\d)? (\d+)/.exec(text) || [])[1] || 0);
  // latin1 是单字节编码，字符下标即字节偏移
  return { status, leftover: head.subarray(idx + 4) };
}

/**
 * 经本机代理 CONNECT 隧道 + TLS 发起 GET。
 * 隧道建好后交给 node:https 的标准响应解析（chunked / content-length 都不用自己处理）。
 * 会跟随 3xx 重定向 —— 下载源（gyan.dev / GitHub releases / evermeet 等）普遍先回 303/302，
 * 不跟随就会拿到一个空 body 并误报成「下载失败 HTTP 303」。
 */
function proxyTunnelGet(url: string, proxy: ProxyEndpoint, timeoutMs: number, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try { target = new URL(url); } catch { reject(new Error('非法媒体地址')); return; }
    if (target.protocol !== 'https:') { reject(new Error('代理隧道仅支持 https 媒体地址')); return; }
    const port = Number(target.port) || 443;
    const req = https.request(
      {
        host: target.hostname,
        port,
        path: target.pathname + target.search,
        method: 'GET',
        // 不经连接池：隧道 socket 用完即断，避免 keep-alive 把进程吊住
        agent: false,
        headers: { Host: target.hostname, 'User-Agent': 'yan-zhi-media/1.0' },
        // 隧道建好后再回传 socket（createConnection 的异步交付形态），故用 any 落类型
        createConnection: (_opts: any, cb: any): any => {
          const socket = net.connect({ host: proxy.host, port: proxy.port });
          socket.once('connect', () => {
            socket.write(`CONNECT ${target.hostname}:${port} HTTP/1.1\r\nHost: ${target.hostname}:${port}\r\n\r\n`);
          });
          let head = Buffer.alloc(0);
          const onData = (chunk: Buffer) => {
            head = Buffer.concat([head, chunk]);
            const { status, leftover } = splitConnectResponse(head);
            if (status === 0) return; // 响应头还没收全，继续累积
            socket.removeListener('data', onData);
            if (status !== 200) {
              socket.destroy();
              cb(new Error(`代理 CONNECT 失败 HTTP ${status}`));
              return;
            }
            // 关键：把「响应头之后」的字节还回 socket。CONNECT 响应头与 TLS ServerHello 常同包到达，
            // 丢掉剩余字节 = 丢 TLS 握手数据 → 小文件偶尔能过、大文件必然 ECONNRESET（极难定位）。
            if (leftover.length > 0) socket.unshift(leftover);
            const tlsSocket = tls.connect({ socket, servername: target.hostname });
            tlsSocket.once('secureConnect', () => cb(null, tlsSocket));
            tlsSocket.once('error', (e) => cb(e));
          };
          socket.on('data', onData);
          socket.once('error', (e) => cb(e));
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        // 跟随重定向（相对 Location 也要能解析）
        if (code >= 300 && code < 400) {
          const loc = res.headers.location;
          res.resume();
          if (!loc) { reject(new Error(`代理下载收到 ${code} 但无 Location`)); return; }
          if (redirectsLeft <= 0) { reject(new Error('代理下载重定向次数过多')); return; }
          let next: string;
          try { next = new URL(loc, url).toString(); } catch { reject(new Error(`重定向地址非法: ${loc}`)); return; }
          proxyTunnelGet(next, proxy, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`下载失败 HTTP ${code}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (!buf.length) { reject(new Error('下载到空内容')); return; }
          resolve(buf);
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('下载超时')));
    req.end();
  });
}

/**
 * 下载媒体字节：直连优先；直连失败（或该 host 已记录直连不通）时依次尝试代理候选链。
 * 两条路都失败时抛最后的错误，由调用方决定降级（例如只留远端 URL）。
 */
export async function downloadMediaBinary(url: string, timeoutMs = 180000): Promise<Buffer> {
  const s = (url || '').trim();
  if (!s) throw new Error('媒体地址为空');
  let host = '';
  try { host = new URL(s).hostname; } catch { /* 非法 url 交给直连去报错 */ }

  const blocked = !!host && isDirectBlocked(host);

  if (!blocked) {
    try {
      return await directFetch(s, Math.min(timeoutMs, DIRECT_TIMEOUT_MS));
    } catch (e: unknown) {
      // 直连不通（该网络被挡）：记下并进入冷却期（TTL 内不再重试直连，避免白等超时）
      if (host) markDirectBlocked(s);
      console.warn(
        `[media] 直连 ${host || s} 失败（${e instanceof Error ? e.message : String(e)}），尝试本机代理`,
      );
    }
  }

  const candidates = await resolveMediaProxyCandidates();
  if (!candidates.length) {
    throw new Error(`媒体下载失败且未找到可用代理（${host || s}）：本机常见代理端口均未监听，可配 HTTPS_PROXY 后重试`);
  }
  let lastErr: unknown = null;
  for (const proxy of candidates) {
    try {
      const buf = await proxyTunnelGet(s, proxy, timeoutMs);
      if (proxy !== candidates[0]) {
        // 候选链里前面几个不通（常见于环境变量指向已退出的代理）：把它提到首位，后续直接用
        proxyCandidates = [proxy, ...candidates.filter((p) => p !== proxy)];
      }
      return buf;
    } catch (e: unknown) {
      lastErr = e;
      console.warn(`[media] 经代理 ${proxy.host}:${proxy.port} 下载失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`媒体下载失败（${host || s}）：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
