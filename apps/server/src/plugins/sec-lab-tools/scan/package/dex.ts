// DEX 字符串池解析（P1）。
//
// ★ 只读字符串表，不做指令级反编译：目标是"发现线索"（密钥、端点、危险 API 名），
//   不是"证明漏洞"。深度分析交给 apktool / jadx（检测到才用）。
// ★ 纯函数 + Buffer，便于用合成数据做单测，不依赖真实 APK。

const MAGIC = 'dex\n';

export interface DexStrings {
  strings: string[];
  truncated: boolean;
}

function readUleb128(buf: Buffer, start: number, end: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  let p = start;
  while (p < end && shift < 35) {
    const b = buf[p++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: value >>> 0, next: p };
    shift += 7;
  }
  return null;
}

/** 从 DEX 的 string_ids 表里读出字符串；返回空数组表示不是合法 DEX */
export function readDexStrings(buf: Buffer, maxStrings = 200_000, maxLen = 512): DexStrings {
  if (buf.length < 0x70) return { strings: [], truncated: false };
  if (buf.toString('ascii', 0, 4) !== MAGIC) return { strings: [], truncated: false };

  const size = buf.readUInt32LE(0x38);
  const off = buf.readUInt32LE(0x3c);
  if (size === 0 || off <= 0 || off >= buf.length) return { strings: [], truncated: false };
  if (off + size * 4 > buf.length) return { strings: [], truncated: false };

  const limit = Math.min(size, maxStrings);
  const strings: string[] = [];
  for (let i = 0; i < limit; i++) {
    const dataOff = buf.readUInt32LE(off + i * 4);
    if (dataOff <= 0 || dataOff >= buf.length) continue;
    const ule = readUleb128(buf, dataOff, Math.min(buf.length, dataOff + 5));
    if (!ule) continue;
    let p = ule.next;
    const end = Math.min(buf.length, p + Math.min(maxLen, buf.length - p));
    let q = p;
    while (q < end && buf[q] !== 0) q++;
    if (q === p) { strings.push(''); continue; }
    strings.push(buf.toString('utf8', p, q));
  }
  return { strings, truncated: size > limit };
}
