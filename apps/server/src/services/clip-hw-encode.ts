// 硬件编码器探测（P1-9）。
//
// ★ 为什么必须"真编一帧"而不是只看 `ffmpeg -encoders`：
//   编译里有 h264_nvenc ≠ 这台机器能用（没有 N 卡 / 驱动太旧 / QSV 没启用都会失败），
//   而失败点在正式导出时，报错是 ffmpeg 的 "Cannot load nvcuda.dll" 之类，用户很难归因。
//   → 启动时用 160x120 两帧试编一次，成功才认为可用；结果按 ffmpeg 路径缓存。
//
// ★ 顺序 nvenc → qsv → amf：独显质量/速度通常最好，其次 Intel，最后 AMD。
//   （三者都编译进本机随包 ffmpeg，实际用时取决于硬件。）

import { runCmd } from './exec-cmd.js';
import { videoEncodeArgs, type HwEncoder } from './clip-render.js';

const CANDIDATES: HwEncoder[] = ['nvenc', 'qsv', 'amf'];

let cache: { key: string; promise: Promise<HwEncoder | null> } | null = null;

async function canEncode(ffmpeg: string, enc: HwEncoder): Promise<boolean> {
  const args = [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x120:r=30:d=0.2',
    '-frames:v', '2',
    ...videoEncodeArgs({ crf: 23, preset: 'veryfast' }, true, enc),
    '-f', 'null', '-',
  ];
  try {
    const r = await runCmd(ffmpeg, args, { timeoutMs: 15000, maxBuffer: 1024 * 1024 });
    return r.ok;
  } catch {
    return false;
  }
}

/** 探测本机可用的硬件编码器（缓存；失败/没有则返回 null = 走 CPU）。 */
export function detectHwEncoder(ffmpeg: string): Promise<HwEncoder | null> {
  if (cache && cache.key === ffmpeg) return cache.promise;
  const promise = (async () => {
    for (const enc of CANDIDATES) {
      if (await canEncode(ffmpeg, enc)) return enc;
    }
    return null;
  })();
  cache = { key: ffmpeg, promise };
  return promise;
}

/** 测试用：清缓存（模拟"第一次探测"）。 */
export function resetHwEncoderCache(): void {
  cache = null;
}
