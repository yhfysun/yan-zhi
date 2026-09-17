// Edge TTS 音色层 —— 通过微软 Edge 的在线合成服务（Edge Read Aloud）取得高质量多音色语音。
//
// 为什么需要它：系统语音（WinRT/SAPI）本机只有 3 个中文音色，且「男女老少」凑不齐；
// Edge TTS 免费、无需 API Key，中文普通话有 8 个音色（4 男 4 女，含方言），质量远高于系统语音。
//
// 实现要点（都是实测踩出来的）：
//  1. **零依赖**：不装 edge-tts（Python 包），直接用 Node 的 tls + 手写 WebSocket 帧。
//  2. **Sec-MS-GEC 签名**：服务端强校验，算法见 genSecMsGec()。漏掉 `× 1e9/100` 或版本号过旧 → 403。
//  3. **版本号必须与 Sec-MS-GEC-Version 一致**且够新，否则 403。
//  4. **不声明压缩**（Accept-Encoding: identity）：自写帧解析器不处理 gzip/br。
//  5. 离线会失败 → 调用方需回落到系统语音，**不能因为网络不可用导致完全没产出**。
import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const HOST = 'speech.platform.bing.com';
const VOICE_LIST_PATH = `/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_TOKEN}`;

export type EdgeVoice = { name: string; culture: string; gender: string; display: string };

/**
 * Sec-MS-GEC 签名（对应 edge-tts 官方 drm.py 的 generate_sec_ms_gec）。
 * unix秒 + WIN_EPOCH(11644473600) → 整除 300（5 分钟窗口）→ × 1e9/100（转 100ns 刻度）
 * → SHA256(`${ticks}${TOKEN}`) 大写十六进制。
 * ⚠️ `× 1e9/100` 这步极易漏（漏了签名错 → 403）；整除 300 是为了让同一 5 分钟内的签名稳定。
 */
export function genSecMsGec(nowMs: number = Date.now()): string {
  let ticks = nowMs / 1000 + 11644473600;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  const str = `${ticks.toFixed(0)}${TRUSTED_TOKEN}`;
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

/** 纯函数：构造 SSML。文本里的 XML 特殊字符必须转义，否则服务端解析失败。 */
export function buildSsml(text: string, voice: string, ratePercent = 0, pitchHz = 0): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${esc(voice)}'><prosody rate='${sign(ratePercent)}%' pitch='${sign(pitchHz)}Hz'>${esc(text)}</prosody></voice></speak>`;
}

/** 纯函数：把 SAPI 风格的 -10~10 语速映射为 Edge 的百分比（-50%~+100%）。 */
export function mapRate(rate: number): number {
  const r = Math.max(-10, Math.min(10, Math.round(rate || 0)));
  return r >= 0 ? Math.round(r * 10) : Math.round(r * 5);
}

// ── 极简 WebSocket（只需文本帧发送 + 文本/二进制帧接收，避免引入 ws 依赖）──

function frame(payload: Buffer | string, opcode: number): Buffer {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = data.length;
  const mask = crypto.randomBytes(4);
  let header: Buffer;
  if (len < 126) header = Buffer.from([0x80 | opcode, 0x80 | len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
  const out = Buffer.concat([header, mask, data]);
  for (let i = 0; i < len; i++) out[header.length + 4 + i] ^= mask[i % 4];
  return out;
}

/** 解析服务端帧（服务端不掩码）。onMessage(opcode, payload) */
function makeFrameParser(onMessage: (opcode: number, payload: Buffer) => void) {
  let buf = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);
      onMessage(opcode, payload);
    }
  };
}

/** 建立到 Edge 服务的 TLS 连接；可经代理 CONNECT 隧道（复用本机代理设置，直连不通时用）。 */
function openTls(proxy?: { host: string; port: number } | null, timeoutMs = 20000): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    // 已 settled 后 socket 仍可能报错（如 destroy 时的 ECONNRESET），必须吞掉，
    // 否则会变成 unhandled error 把整个进程带崩
    const swallow = () => { /* 连接已交付或已失败，后续错误忽略 */ };
    if (!proxy) {
      const t = tls.connect({ host: HOST, port: 443, servername: HOST });
      t.setTimeout(timeoutMs, () => t.destroy(new Error('Edge TTS 连接超时')));
      t.once('secureConnect', () => done(() => resolve(t)));
      t.once('error', (e) => { if (settled) swallow(); else done(() => reject(e)); });
      return;
    }
    const sock = net.connect({ host: proxy.host, port: proxy.port });
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error('代理连接超时')));
    sock.once('connect', () => sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`));
    let head = Buffer.alloc(0);
    const onData = (c: Buffer) => {
      head = Buffer.concat([head, c]);
      const idx = head.indexOf('\r\n\r\n');
      if (idx === -1) return;
      sock.removeListener('data', onData);
      const text = head.subarray(0, idx).toString('latin1');
      const st = Number((/HTTP\/\d(?:\.\d)? (\d+)/.exec(text) || [])[1] || 0);
      if (st !== 200) { sock.destroy(); done(() => reject(new Error(`代理 CONNECT 失败 HTTP ${st}`))); return; }
      const leftover = head.subarray(idx + 4);
      if (leftover.length) sock.unshift(leftover);
      const t = tls.connect({ socket: sock, servername: HOST });
      t.once('secureConnect', () => done(() => resolve(t)));
      t.once('error', (e) => { if (settled) swallow(); else done(() => reject(e)); });
    };
    sock.on('data', onData);
    sock.once('error', (e) => { if (settled) swallow(); else done(() => reject(e)); });
  });
}

function wsHandshake(socket: tls.TLSSocket, path: string): Promise<void> {
  const key = crypto.randomBytes(16).toString('base64');
  const req = [
    `GET ${path} HTTP/1.1`,
    `Host: ${HOST}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Pragma: no-cache',
    'Cache-Control: no-cache',
    `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
    // 自写帧解析器不处理压缩，必须声明 identity，否则收到压缩帧会解析失败
    'Accept-Encoding: identity',
    'Accept-Language: en-US,en;q=0.9',
    '\r\n',
  ].join('\r\n');
  return new Promise((resolve, reject) => {
    let head = Buffer.alloc(0);
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const onData = (c: Buffer) => {
      head = Buffer.concat([head, c]);
      const idx = head.indexOf('\r\n\r\n');
      if (idx === -1) return;
      socket.removeListener('data', onData);
      const text = head.subarray(0, idx).toString('latin1');
      const st = Number((/HTTP\/\d(?:\.\d)? (\d+)/.exec(text) || [])[1] || 0);
      if (st !== 101) { done(() => reject(new Error(`Edge TTS 握手失败 HTTP ${st}`))); return; }
      const leftover = head.subarray(idx + 4);
      if (leftover.length) socket.unshift(leftover);
      done(() => resolve());
    };
    socket.on('data', onData);
    // 握手完成后的 error 交给主流程的监听器处理，这里只负责握手阶段
    socket.once('error', (e) => done(() => reject(e)));
    socket.write(req);
  });
}

/**
 * 代理候选（按尝试顺序）。**直连排第一** —— 实测 Edge TTS 直连可用，
 * 而环境变量里的代理（如 HTTP_PROXY=127.0.0.1:8080）常指向未监听的端口，
 * 排前面会白白等一次 ECONNREFUSED 甚至把错误抛穿。
 * null 表示直连。
 */
function proxyCandidates(): Array<{ host: string; port: number } | null> {
  const out: Array<{ host: string; port: number } | null> = [null];
  const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (env) {
    try {
      const u = new URL(env.includes('://') ? env : `http://${env}`);
      const port = Number(u.port) || 8080;
      // 跳过明显未监听的常见占位端口不现实，交给连接失败自然跳过即可
      out.push({ host: u.hostname, port });
    } catch { /* 忽略非法值 */ }
  }
  for (const port of [7890, 10809, 1080]) {
    out.push({ host: '127.0.0.1', port });
  }
  return out;
}

/**
 * 列出 Edge TTS 音色（含中文普通话全部音色）。
 *
 * ⚠️ 这是 **REST 接口**（HTTPS GET 返回 JSON 数组），**不是 WebSocket** ——
 * 用 WebSocket 去连会拿到 HTTP 200（而非 101 升级），报「握手失败」。
 * 实测：直连可用（约 1 秒），失败时依次尝试代理。
 */
export async function listEdgeVoices(timeoutMs = 15000): Promise<EdgeVoice[]> {
  const errors: string[] = [];
  for (const proxy of proxyCandidates()) {
    const label = proxy ? `代理 ${proxy.host}:${proxy.port}` : '直连';
    try {
      const raw = await httpGet(VOICE_LIST_PATH, proxy, timeoutMs);
      const arr = JSON.parse(raw);
      const mapped = (Array.isArray(arr) ? arr : [])
        .filter((v: any) => v && v.ShortName)
        .map((v: any) => ({
          name: String(v.ShortName),
          culture: String(v.Locale || ''),
          gender: String(v.Gender || ''),
          display: String(v.FriendlyName || v.ShortName),
        }));
      if (!mapped.length) throw new Error('音色列表为空');
      return mapped;
    } catch (e: unknown) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Edge 音色列表获取失败 —— ${errors.join(' | ')}`);
}

/**
 * HTTPS GET（直连或经代理 CONNECT 隧道）→ 响应体字符串。
 * 只处理 Content-Length / chunked 两种，够用（该接口是普通 JSON 响应）。
 */
function httpGet(pathname: string, proxy: { host: string; port: number } | null, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const run = (socket: tls.TLSSocket) => {
      const req = `GET ${pathname} HTTP/1.1\r\nHost: ${HOST}\r\nAccept: application/json\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`;
      socket.write(req);
      const chunks: Buffer[] = [];
      let done = false;
      const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };
      socket.on('data', (c: Buffer) => chunks.push(c));
      socket.on('end', () => {
        const buf = Buffer.concat(chunks);
        const headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd === -1) { finish(() => reject(new Error('响应头不完整'))); return; }
        const head = buf.subarray(0, headEnd).toString('latin1');
        const status = Number((/HTTP\/\d(?:\.\d)? (\d+)/.exec(head) || [])[1] || 0);
        if (status !== 200) { finish(() => reject(new Error(`HTTP ${status}`))); return; }
        let body: Buffer = buf.subarray(headEnd + 4);
        // 处理 chunked（服务端可能不声明 Content-Length）
        if (/transfer-encoding:\s*chunked/i.test(head)) {
          body = dechunk(body);
        }
        finish(() => resolve(body.toString('utf8')));
      });
      socket.on('error', (e) => finish(() => reject(e)));
      socket.on('close', () => finish(() => reject(new Error('连接提前关闭'))));
      socket.setTimeout(timeoutMs, () => { socket.destroy(); finish(() => reject(new Error('请求超时'))); });
    };
    openTls(proxy, timeoutMs).then(run, (e) => reject(e));
  });
}

/** 解析 chunked 编码（纯函数，便于单测）。 */
export function dechunk(buf: Buffer): Buffer {
  const out: Buffer[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const lineEnd = buf.indexOf('\r\n', pos);
    if (lineEnd === -1) break;
    const size = parseInt(buf.subarray(pos, lineEnd).toString('latin1').split(';')[0].trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    if (start + size > buf.length) break;
    out.push(buf.subarray(start, start + size));
    pos = start + size + 2; // 跳过块尾的 \r\n
  }
  return Buffer.concat(out);
}

export interface EdgeSpeakResult { buffer: Buffer; voice: string; ratePercent: number; }

/**
 * 按角色挑 Edge 音色 —— 纯函数。
 *
 * 与系统语音层的 pickVoiceForRole 分开，因为**音色名是两套体系**
 * （Edge 是 zh-CN-YunxiNeural 这种，系统是 Microsoft Huihui），混用必然选不中。
 * 中文普通话可用音色（Edge 官方）：4 男 4 女，含辽宁/陕西方言。
 * 优先按推断性别挑，且尽量不与已分配重复。
 */
export function pickEdgeVoiceForRole(
  voices: EdgeVoice[],
  roleName: string,
  assigned: Map<string, string>,
  wantGender: string,
): string {
  const existing = assigned.get(roleName);
  if (existing) return existing;
  // 只考虑普通话（zh-CN 开头且非方言），方言音色需用户显式指定
  const base = voices.filter((v) => v.culture === 'zh-CN');
  const pool = base.length ? base : voices.filter((v) => String(v.culture).startsWith('zh'));
  const usable = pool.length ? pool : voices;
  let candidates = usable;
  if (wantGender) {
    const byGender = usable.filter((v) => v.gender.toLowerCase() === wantGender.toLowerCase());
    if (byGender.length) candidates = byGender;
  }
  // 优先未占用的，保证不同角色声音不同
  const taken = new Set(assigned.values());
  const free = candidates.filter((v) => !taken.has(v.name));
  const finalPool = free.length ? free : candidates;
  const chosen = finalPool[assigned.size % finalPool.length].name;
  assigned.set(roleName, chosen);
  return chosen;
}

/** 从 Edge 音色里推断默认音色：按性别偏好挑，找不到就用第一个中文音色。 */
export function defaultEdgeVoice(voices: EdgeVoice[], wantGender: string): string {
  const zh = voices.filter((v) => v.culture === 'zh-CN');
  const pool = zh.length ? zh : voices;
  if (wantGender) {
    const g = pool.find((v) => v.gender.toLowerCase() === wantGender.toLowerCase());
    if (g) return g.name;
  }
  return pool[0]?.name || '';
}

/**
 * 合成语音，返回 MP3 字节。
 * 失败抛错（调用方回落到系统语音）—— 离线环境下这里必然失败，属预期。
 */
export async function edgeSpeak(
  text: string,
  opts: { voice: string; rate?: number; pitchHz?: number; timeoutMs?: number },
): Promise<EdgeSpeakResult> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const ratePercent = mapRate(opts.rate ?? 0);
  const ssml = buildSsml(text, opts.voice, ratePercent, opts.pitchHz ?? 0);
  const gec = genSecMsGec();
  const path = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  const errors: string[] = [];
  for (const proxy of proxyCandidates()) {
    const label = proxy ? `代理 ${proxy.host}:${proxy.port}` : '直连';
    let socket: tls.TLSSocket | null = null;
    const audioChunks: Buffer[] = [];
    try {
      socket = await openTls(proxy, 20000);
      await wsHandshake(socket, path);
      let done = false;
      const parser = makeFrameParser((op, payload) => {
        if (op === 0x1) {
          const t = payload.toString('utf8');
          if (t.includes('Path:turn.end')) done = true;
        } else if (op === 0x2) {
          // 二进制帧：前 2 字节是大端头长度，音频在头之后
          const headerLen = payload.readUInt16BE(0);
          audioChunks.push(payload.subarray(2 + headerLen));
        } else if (op === 0x8) done = true;
      });
      socket.on('data', (c: Buffer) => parser(c));
      // socket 错误只记原因、置 done（收尾统一在主循环判断，避免 unhandled）
      socket.on('error', (e) => { errors.push(`${label}(传输): ${e.message}`); done = true; });

      const now = new Date().toISOString();
      // 1) 合成配置
      socket.write(frame(
        `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}',
        0x1,
      ));
      // 2) SSML
      socket.write(frame(
        `X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n${ssml}`,
        0x1,
      ));

      await new Promise<void>((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const iv = setInterval(() => { if (done || Date.now() > deadline) { clearInterval(iv); resolve(); } }, 150);
      });
    } catch (e: unknown) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // destroy 前摘掉监听，避免关闭过程的错误冒泡成 unhandled
      if (socket) {
        try { socket.removeAllListeners('error'); } catch { /* 忽略 */ }
        try { socket.destroy(); } catch { /* 忽略 */ }
      }
    }
    const buffer = Buffer.concat(audioChunks);
    if (buffer.length > 100) return { buffer, voice: opts.voice, ratePercent };
    errors.push(`${label}: 未取得音频（${buffer.length} 字节）`);
  }
  throw new Error(`Edge TTS 合成失败 —— ${errors.join(' | ')}`);
}