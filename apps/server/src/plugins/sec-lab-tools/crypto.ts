// 编解码 / 哈希 / JWT 工具箱（sec-lab P1，2026-10-17）—— 零依赖、纯函数。
//
// ★ 为什么单开一个模块：这些操作在渗透过程里出现频率极高（看到一串 base64、
//   一个 JWT、一个哈希就想知道是什么），让模型"猜编码再手写脚本"既慢又不可靠。
// ★ 全部是**纯函数**：没有网络、没有文件、没有子进程 ⇒ 不碰护栏、好测。
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export const CODEC_OPS = [
  'base64', 'base32', 'base58', 'hex', 'url', 'html', 'unicode', 'rot13', 'caesar', 'morse',
] as const;
export type CodecOp = (typeof CODEC_OPS)[number];

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
  J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};
const MORSE_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
);

function bytesToBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  while (out.length % 8) out += '=';
  return out;
}

function base32ToBytes(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error(`base32 含非法字符：${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function bytesToBase58(buf: Buffer): string {
  if (!buf.length) return '';
  let num = BigInt('0x' + buf.toString('hex'));
  let out = '';
  while (num > 0n) {
    out = B58[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

function base58ToBytes(s: string): Buffer {
  let num = 0n;
  for (const ch of s) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error(`base58 含非法字符：${ch}`);
    num = num * 58n + BigInt(idx);
  }
  let hex = num === 0n ? '' : num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = hex ? Buffer.from(hex, 'hex') : Buffer.alloc(0);
  let zeros = 0;
  for (const ch of s) {
    if (ch !== '1') break;
    zeros++;
  }
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function caesar(s: string, shift: number): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base + shift) % 26) + 26) % 26 + base);
  });
}

function toMorse(s: string): string {
  return s.toUpperCase().split('').map((ch) => {
    if (ch === ' ') return '/';
    return MORSE[ch] ?? ch;
  }).join(' ');
}

function fromMorse(s: string): string {
  return s.trim().split(/\s+/).map((code) => (code === '/' ? ' ' : (MORSE_REV[code] ?? code))).join('');
}

/** 编码。`data` 按 UTF-8 处理（中文往返不乱码）。 */
export function encodeData(op: CodecOp, data: string): string {
  switch (op) {
    case 'base64': return Buffer.from(data, 'utf8').toString('base64');
    case 'base32': return bytesToBase32(Buffer.from(data, 'utf8'));
    case 'base58': return bytesToBase58(Buffer.from(data, 'utf8'));
    case 'hex': return Buffer.from(data, 'utf8').toString('hex');
    case 'url': return encodeURIComponent(data);
    case 'html': return data.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
    )[c]);
    case 'unicode': return Array.from(data).map((c) => (
      c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c
    )).join('');
    case 'rot13': return rot13(data);
    case 'caesar': return caesar(data, 3);
    case 'morse': return toMorse(data);
    default: throw new Error(`不支持的编码：${op}`);
  }
}

/** 解码。base64 同时接受 URL-safe 变体。 */
export function decodeData(op: CodecOp, data: string): string {
  switch (op) {
    case 'base64': {
      const s = data.trim().replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(s, 'base64').toString('utf8');
    }
    case 'base32': return base32ToBytes(data).toString('utf8');
    case 'base58': return base58ToBytes(data.trim()).toString('utf8');
    case 'hex': return Buffer.from(data.replace(/\s+/g, ''), 'hex').toString('utf8');
    case 'url': return decodeURIComponent(data);
    case 'html': return data
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    case 'unicode': return data.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    case 'rot13': return rot13(data);
    case 'caesar': return caesar(data, -3);
    case 'morse': return fromMorse(data);
    default: throw new Error(`不支持的解码：${op}`);
  }
}

function out(tool: string, text: string, findings: Finding[] = []): ToolOutput {
  return { tool, target: '', risk: 'passive', summary: text, findings };
}

export function runEncode(op: string, data: string): ToolOutput {
  const o = String(op || '').toLowerCase() as CodecOp;
  if (!CODEC_OPS.includes(o)) throw new Error(`op 必须是：${CODEC_OPS.join(' / ')}`);
  const encoded = encodeData(o, data);
  return out('crypto_encode', `${o} 编码结果：\n${encoded}`, [{
    title: `已按 ${o} 编码`, severity: 'info', detail: `${data.length} 字符 → ${encoded.length} 字符`,
  }]);
}

export function runDecode(op: string, data: string): ToolOutput {
  const o = String(op || '').toLowerCase() as CodecOp;
  if (!CODEC_OPS.includes(o)) throw new Error(`op 必须是：${CODEC_OPS.join(' / ')}`);
  return out('crypto_decode', `${o} 解码结果：\n${decodeData(o, data)}`, [{
    title: `已按 ${o} 解码`, severity: 'info', detail: `输入 ${data.length} 字符`,
  }]);
}

/** JWT 解析与**风险信号**（只解码与判断，不尝试破解密钥）。 */
export function inspectJwt(token: string): ToolOutput {
  const parts = String(token || '').trim().split('.');
  if (parts.length < 2) throw new Error('不是 JWT：应为 header.payload.signature 三段（允许无签名）');
  const dec = (s: string) => JSON.parse(
    Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  );
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try { header = dec(parts[0]); } catch { throw new Error('header 不是合法 base64url JSON'); }
  try { payload = dec(parts[1]); } catch { throw new Error('payload 不是合法 base64url JSON'); }

  const findings: Finding[] = [];
  const alg = String(header.alg || '');
  if (/^none$/i.test(alg) || parts.length < 3) {
    findings.push({
      title: 'JWT 未签名（alg=none 或缺少签名段）', severity: 'critical',
      detail: '攻击者可任意改写 payload。服务端必须拒绝 alg=none，并固定校验期望算法。',
      remediation: '服务端显式白名单算法（如仅 RS256），忽略 token 自称的 alg。',
    });
  } else if (/^HS/i.test(alg)) {
    findings.push({
      title: `对称算法 ${alg}：弱密钥可被离线爆破`, severity: 'low',
      detail: 'HS256/384/512 的安全性完全取决于密钥强度；常见弱口令（secret、changeme）可离线验证。',
      remediation: '使用 ≥32 字节随机密钥；或改用非对称算法并用公钥校验。',
    });
  }
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
  if (!exp) {
    findings.push({ title: 'payload 没有 exp（永不过期）', severity: 'medium', detail: '令牌一旦泄露永久有效。' });
  } else {
    const left = exp * 1000 - Date.now();
    if (left <= 0) findings.push({ title: '令牌已过期', severity: 'info', detail: `exp=${new Date(exp * 1000).toISOString()}` });
    else if (left > 30 * 86400000) {
      findings.push({ title: `有效期过长（还剩 ${Math.floor(left / 86400000)} 天）`, severity: 'low', detail: '建议缩短有效期并配合刷新机制。' });
    }
  }

  const pretty = JSON.stringify({ header, payload, signatureLength: (parts[2] || '').length }, null, 2);
  return {
    tool: 'jwt_inspect', target: '', risk: 'passive',
    summary: `JWT 解析成功（alg=${alg || '?'}，签名段 ${(parts[2] || '').length} 字符）\n${pretty}`,
    findings,
  };
}

const HASH_RULES: Array<{ re: RegExp; name: string }> = [
  { re: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, name: 'bcrypt' },
  { re: /^\$argon2(id|i|d)\$/, name: 'Argon2' },
  { re: /^\$6\$/, name: 'sha512crypt（Linux /etc/shadow）' },
  { re: /^\$5\$/, name: 'sha256crypt' },
  { re: /^\$1\$/, name: 'md5crypt' },
  { re: /^[a-f0-9]{32}$/i, name: 'MD5 / NTLM / MD4（32 位十六进制）' },
  { re: /^[a-f0-9]{40}$/i, name: 'SHA-1 / MySQL 旧版 password()' },
  { re: /^[a-f0-9]{56}$/i, name: 'SHA-224' },
  { re: /^[a-f0-9]{64}$/i, name: 'SHA-256 / SHA3-256' },
  { re: /^[a-f0-9]{96}$/i, name: 'SHA-384' },
  { re: /^[a-f0-9]{128}$/i, name: 'SHA-512' },
  { re: /^[A-Za-z0-9./]{13}$/, name: 'DES crypt（旧 Unix）' },
];

/** 哈希类型识别（按长度与字符集；不确定时明说）。 */
export function identifyHash(hash: string): ToolOutput {
  const h = String(hash || '').trim();
  if (!h) throw new Error('hash 不能为空');
  const hits = HASH_RULES.filter((r) => r.re.test(h)).map((r) => r.name);
  const findings: Finding[] = [];
  if (!hits.length) {
    findings.push({ title: '无法识别的哈希格式', severity: 'info', detail: '长度或字符集不匹配常见算法。' });
  } else if (hits.length > 1) {
    findings.push({
      title: `可能是 ${hits.length} 种算法之一`, severity: 'info',
      detail: `${hits.join(' / ')}。长度相同的算法无法只凭字符串区分，需结合来源（/etc/shadow、数据库列名）判断。`,
    });
  }
  return {
    tool: 'hash_id', target: '', risk: 'passive',
    summary: `长度 ${h.length}\n可能类型：${hits.length ? hits.join(' / ') : '未知'}`,
    findings,
    raw: { length: h.length, candidates: hits },
  };
}
