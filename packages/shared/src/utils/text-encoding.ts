// 文本编码自动识别 —— 三端共用（桌面 IPC / Web File System Access / 移动 Capacitor / 服务端 Node）
//
// ★ 为什么必须有（2026-09-27 用户反馈）：
//   「txt 不支持别的中文格式？电脑的软件打开正常啊，这个应用打开乱码？？」
//   根因：所有文本读取路径都**写死 UTF-8** —— Node 侧 `fsp.readFile(p,'utf-8')`、
//   桌面 IPC 同一个口径、浏览器侧 `file.text()`、Capacitor `Encoding.UTF8`、
//   预览面板 `new TextDecoder('utf-8')`。
//   GBK/GB2312 编码的中文 txt（Windows 记事本「ANSI」另存、老程序/老系统导出）
//   一旦用 UTF-8 去解，每个汉字都落到非法序列上变成 U+FFFD 替换符 →
//   满屏「锟斤拷 / 」。而记事本、Word 会自己猜编码，所以「电脑的软件打开正常」。
//
// 识别策略（顺序即优先级，先权威后推断）：
//   ① **BOM 优先**：EF BB BF → utf-8，FF FE → utf-16le，FE FF → utf-16be。
//      有 BOM 就是写入方明确的声明，不需要猜。
//   ② **UTF-8 严格解码（fatal: true）能过 → 判为 UTF-8**。
//      UTF-8 的结构约束很强（多字节序列的起始/后续字节范围受限、禁止过长编码），
//      GBK 的中文字节几乎必然违反它 —— 因此这是一个**可靠判别器**。
//      （实测：GBK「中文测试」8 字节 100% 抛错；UTF-8 中文 100% 通过。）
//   ③ **兜底 GB18030**：它是 GBK / GB2312 的**超集**，且对任意字节流几乎不抛错
//      （实测随机高位字节 300/300 通过），作为「非 UTF-8 的中文」的最终兜底最稳。
//
// ⚠️ 已知局限（不要试图「优化」掉，会把好文件猜坏）：
//   Big5（中国台湾/中国香港）与 GB18030 互相解码**都不抛错**（解出来只是另一种错字），
//   无法用「是否抛错」区分，只能靠人工指定编码。
//   所以这里**不做**启发式打分猜 Big5 —— 那样反而会把正常的 GBK 文件猜成乱码。
//   需要 Big5 时请调用方显式传 encoding。

/** 支持的文本编码 */
export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';

/** 解码结果：文本 + 实际判定的编码（编码用于界面如实告知用户，别偷偷改了还不说） */
export interface DecodedText {
  text: string;
  encoding: TextEncoding;
}

/** 判定为二进制的控制符占比阈值（见 looksBinaryBytes） */
const CONTROL_RATIO_MAX = 0.05;

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * 探测某编码在本环境是否可用（服务端精简 ICU 构建、老 WebView 都可能缺 gb18030）。
 * 只探测一次并缓存 —— 避免每个文件都白白抛一次 RangeError。
 */
const supportCache = new Map<string, boolean>();
function isEncodingSupported(encoding: string): boolean {
  const hit = supportCache.get(encoding);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    // 构造本身就会在编码名不被识别时抛 RangeError
    new TextDecoder(encoding);
    ok = true;
  } catch {
    ok = false;
  }
  supportCache.set(encoding, ok);
  return ok;
}

/** 严格解码：任何非法字节序列都抛错，返回 null 表示「这些字节不是该编码」 */
function tryDecodeStrict(encoding: string, bytes: Uint8Array): string | null {
  if (!isEncodingSupported(encoding)) return null;
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 宽松解码：非法序列替换为 U+FFFD，绝不抛错（最终兜底用） */
function decodeLenient(encoding: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * 把字节流解码成文本，自动识别 UTF-8 / GBK(GB18030) / UTF-16 并返回判定结果。
 *
 * 调用方拿到 `encoding` 后应告知用户（例如预览面板显示「GB18030」徽标），
 * 否则用户改完保存、文件变成 UTF-8 时会觉得莫名其妙。
 */
export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (!bytes.length) return { text: '', encoding: 'utf-8' };

  // ① BOM 是写入方的显式声明，最高优先级
  if (startsWith(bytes, UTF16LE_BOM)) {
    return { text: decodeLenient('utf-16le', bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return { text: decodeLenient('utf-16be', bytes.subarray(2)), encoding: 'utf-16be' };
  }
  if (startsWith(bytes, UTF8_BOM)) {
    return { text: decodeLenient('utf-8', bytes.subarray(3)), encoding: 'utf-8' };
  }

  // ② 严格 UTF-8 能过 → 就是 UTF-8（判别力强，见文件头说明）
  const utf8 = tryDecodeStrict('utf-8', bytes);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };

  // ③ 兜底 GB18030（GBK/GB2312 超集）
  const gb = tryDecodeStrict('gb18030', bytes);
  if (gb !== null) return { text: gb, encoding: 'gb18030' };

  // ④ 极端环境（无 gb18030 解码器）：宽松 UTF-8，至少不抛错
  return { text: decodeLenient('utf-8', bytes), encoding: 'utf-8' };
}

/**
 * 按**指定编码**解码（调用方明确知道编码时用，例如 file_read 的 encoding 参数）。
 * 返回 null 表示不支持该编码名，调用方应回落自动识别。
 */
export function decodeTextBytesAs(bytes: Uint8Array, encoding: string): string | null {
  const enc = String(encoding || '').trim().toLowerCase();
  if (!enc) return null;
  // 别名归一：gbk/gb2312 都走 gb18030（超集，解出来一致）
  const normalized: Record<string, TextEncoding> = {
    'utf-8': 'utf-8', utf8: 'utf-8',
    'utf-16le': 'utf-16le', 'utf-16': 'utf-16le', utf16le: 'utf-16le',
    'utf-16be': 'utf-16be', utf16be: 'utf-16be',
    gb18030: 'gb18030', gbk: 'gb18030', gb2312: 'gb18030', 'gb-2312': 'gb18030', cp936: 'gb18030',
  };
  const target = normalized[enc];
  if (!target) return null;
  if (!isEncodingSupported(target)) return null;
  return decodeLenient(target, bytes);
}

/**
 * 二进制判定（供「扩展名白名单外也试着当文本读」的分支使用）。
 *
 * ★ 为什么必须单独判，不能沿用旧写法（2026-09-27 引入自动编码后新增）：
 *   旧代码靠「UTF-8 解码产生多少 U+FFFD 替换符」判二进制。
 *   但自动识别改成 GB18030 兜底后，**任意字节流几乎都能被 GB18030 解成功**
 *   （实测随机高位字节 300/300 不抛错）→ U+FFFD 变 0 → 所有二进制文件
 *   都会被当成「GBK 文本」显示一堆乱字。
 *   所以这里改从**字节本身**判：NUL 字节、或解出大量不可打印控制符。
 */
export function looksBinaryBytes(bytes: Uint8Array, sampleSize = 8000): boolean {
  if (!bytes.length) return false;
  const n = Math.min(bytes.length, sampleSize);
  const head = bytes.subarray(0, n);

  // ① NUL 字节是二进制最可靠的信号（合法文本文件不含 NUL）。
  //    实测：png/jpg/ico/icns/exe 都在前 9 字节内出现 NUL。
  for (let i = 0; i < n; i += 1) {
    if (head[i] === 0) return true;
  }

  // ② 取文本：严格 UTF-8 优先，否则 GB18030，最后宽松兜底
  const strictUtf8 = tryDecodeStrict('utf-8', head);
  const text = strictUtf8 ?? tryDecodeStrict('gb18030', head) ?? decodeLenient('gb18030', head);
  if (!text.length) return false;

  // ③ 控制符占比过高 → 二进制。
  //    ★ 这一步必须**在所有解码尝试之后**无条件执行：
  //    纯控制字节（如 0x01 填充）本身是合法 UTF-8/ASCII，若因「UTF-8 能过」就提前
  //    返回"文本"，这类数据会被当成文本渲染（本函数初版就踩了这个坑）。
  let control = 0;
  const limit = Math.min(text.length, sampleSize);
  for (let i = 0; i < limit; i += 1) {
    const c = text.charCodeAt(i);
    // 允许 \t(9) \n(10) \r(13)；其余 C0/C1 控制符、替换符、零宽字符都算「不像文本」
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xfffd || c === 0x200b) control += 1;
  }
  return control / limit > CONTROL_RATIO_MAX;
}

/**
 * base64 → 字节。
 *
 * ★ 这里刻意不写 `Buffer.from(...)` 的字面量：packages/shared 不依赖 @types/node
 *   （面向三端 + 浏览器），直接引用 Buffer 会 TS2580。改从 globalThis 上探测，
 *   既避免类型依赖，也不影响三端任一环境的行为（浏览器走 atob）。
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bufCtor = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  const bin = typeof atob === 'function'
    ? atob(b64)
    : (bufCtor ? bufCtor.from(b64, 'base64').toString('binary') : '');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 编码的展示名（给界面用）。GB 系统一显示 GB18030 会更让人困惑，
 * 因为用户手上的文件自称 GBK/ANSI —— 这里显示更贴近用户认知的写法。
 */
export function encodingLabel(encoding: TextEncoding): string {
  switch (encoding) {
    case 'gb18030': return 'GBK';
    case 'utf-16le': return 'UTF-16 LE';
    case 'utf-16be': return 'UTF-16 BE';
    default: return 'UTF-8';
  }
}