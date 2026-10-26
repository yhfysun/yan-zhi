/**
 * scrcpy 视频帧的浏览器侧转换（2026-10-26，真内嵌镜像）。
 *
 * scrcpy 推给我们的是 **Annex-B** 形式的 H.264（NAL 之间用 00 00 01 / 00 00 00 01 分隔），
 * 而 WebCodecs 的 VideoDecoder 要的是 **AVCC**（每个 NAL 前面 4 字节大端长度）+ 一份
 * AVCDecoderConfigurationRecord（description，含 SPS/PPS）。
 * 这三件事都在这里做掉，全部是纯函数，便于单测。
 */

/** 按 Annex-B 起始码切出 NAL 单元（不含起始码本身） */
export function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = -1;
  const isStart = (i: number): number => {
    if (i + 3 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) return 3;
    if (i + 4 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) return 4;
    return 0;
  };
  for (let i = 0; i < data.length; i += 1) {
    const len = isStart(i);
    if (!len) continue;
    if (start >= 0) out.push(data.subarray(start, i));
    i += len - 1;
    start = i + 1;
  }
  if (start >= 0 && start < data.length) out.push(data.subarray(start));
  return out.filter((n) => n.length > 0);
}

/** Annex-B → AVCC：每个 NAL 前补 4 字节长度 */
export function annexBToAvcc(data: Uint8Array): Uint8Array {
  const nals = splitAnnexB(data);
  let total = 0;
  for (const n of nals) total += 4 + n.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const n of nals) {
    out[o] = (n.length >>> 24) & 0xff;
    out[o + 1] = (n.length >>> 16) & 0xff;
    out[o + 2] = (n.length >>> 8) & 0xff;
    out[o + 3] = n.length & 0xff;
    out.set(n, o + 4);
    o += 4 + n.length;
  }
  return out;
}

/** 从一帧 CONFIG 数据里取出 SPS(7) 与 PPS(8) */
export function extractSpsPps(config: Uint8Array): { sps: Uint8Array | null; pps: Uint8Array | null } {
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  for (const nal of splitAnnexB(config)) {
    const type = nal[0] & 0x1f;
    if (type === 7 && !sps) sps = nal;
    else if (type === 8 && !pps) pps = nal;
  }
  return { sps, pps };
}

/**
 * WebCodecs 的 codec 串：avc1.PPCCLL（profile / constraint flags / level，取自 SPS 第 1–3 字节）。
 * 拿不到 SPS 时给一个兼容性最好的兜底（Baseline 3.1）。
 */
export function avcCodecString(sps: Uint8Array | null): string {
  if (!sps || sps.length < 4) return 'avc1.42E01F';
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `avc1.${hex(sps[1])}${hex(sps[2])}${hex(sps[3])}`;
}

/** AVCDecoderConfigurationRecord（VideoDecoder.configure 的 description） */
export function buildAvcDescription(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.length + pps.length);
  let o = 0;
  out[o++] = 1;                     // configurationVersion
  out[o++] = sps[1] ?? 0x42;        // AVCProfileIndication
  out[o++] = sps[2] ?? 0xe0;        // profile_compatibility
  out[o++] = sps[3] ?? 0x1f;        // AVCLevelIndication
  out[o++] = 0xff;                  // lengthSizeMinusOne = 3（4 字节装长度）
  out[o++] = 0xe1;                  // numOfSequenceParameterSets = 1
  out[o++] = (sps.length >>> 8) & 0xff;
  out[o++] = sps.length & 0xff;
  out.set(sps, o); o += sps.length;
  out[o++] = 1;                     // numOfPictureParameterSets
  out[o++] = (pps.length >>> 8) & 0xff;
  out[o++] = pps.length & 0xff;
  out.set(pps, o);
  return out;
}

/** 12 字节视频包头的解析结果 */
export interface ScrcpyPacketHeader {
  /** 去掉标志位后的显示时间戳（微秒） */
  pts: number;
  isConfig: boolean;
  isKey: boolean;
  size: number;
}

/** 解析 12 字节包头：8B pts（bit63=CONFIG，bit62=KEY）+ 4B size */
export function parsePacketHeader(head: Uint8Array): ScrcpyPacketHeader {
  let ptsRaw = 0n;
  for (let i = 0; i < 8; i += 1) ptsRaw = (ptsRaw << 8n) | BigInt(head[i] ?? 0);
  const size = ((head[8] << 24) | (head[9] << 16) | (head[10] << 8) | head[11]) >>> 0;
  const isConfig = (ptsRaw >> 63n) === 1n;
  const isKey = ((ptsRaw >> 62n) & 1n) === 1n;
  const pts = Number(ptsRaw & 0x3fffffffffffffffn);
  return { pts, isConfig, isKey, size };
}
