// 录音（MediaRecorder）相关的纯函数：MIME 选择 / 文件名 / 计时格式。
//
// ★ 为什么单独抽出来：UI 里直接写"audio/webm"会在 Safari/Firefox/Chromium 之间漂移
//   （有的不支持 webm/opus，有的只给 mp4/aac）。候选顺序与扩展名映射是**可测的口径**，
//   不依赖浏览器也能单测；真正录制仍在组件里做。

/** 从优到劣的录音容器候选（Chromium/Electron 实际给 webm/opus）。 */
export const REC_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

/** 选第一个被浏览器支持的 MIME；一个都不支持返回 ''（交给 MediaRecorder 默认值）。 */
export function pickRecorderMime(supported: (mime: string) => boolean): string {
  for (const m of REC_MIME_CANDIDATES) {
    try {
      if (supported(m)) return m;
    } catch {
      // isTypeSupported 在个别环境会抛：当作不支持
    }
  }
  return '';
}

/** MIME → 文件扩展名（mp4 容器里的音频用 m4a，便于其它工具识别）。 */
export function recordingExt(mime: string): string {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

/** 录音文件名：录音-YYYYMMDD-HHmmss.<ext>（同一秒重录会带序号由服务端去重）。 */
export function recordingFileName(d: Date, mime: string): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  return `录音-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.${recordingExt(mime)}`;
}

/** 录音计时显示：m:ss.s（例 0:05.3 / 12:30.0）。 */
export function formatRecTime(ms: number): string {
  const s = Math.max(0, Number(ms) || 0) / 1000;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

/** 单次录音上限（毫秒）：防止忘记录音把内存/磁盘占满。 */
export const RECORDING_MAX_MS = 30 * 60 * 1000;
