/**
 * 选区录屏（2026-10-26）：像独立录屏软件一样，框选屏幕任意区域录制**电脑操作**
 * （不限本应用，任何窗口都能录）。
 *
 * 管线选择：
 *   - 不能用 capturePage —— 它只能抓 Electron 自己的窗口；
 *   - 走 getDisplayMedia（主进程 setDisplayMediaRequestHandler 授权并选定屏幕）
 *     → <video> 播放 → canvas 按选区裁剪 → canvas.captureStream → MediaRecorder(webm)
 *     → 字节交主进程落盘（有 ffmpeg 就转 mp4）。
 *
 * 本模块只依赖 DOM 与 preload 暴露的 screenRecord.saveBlob；裁剪换算是纯函数，便于单测。
 */

export interface RegionRect { x: number; y: number; width: number; height: number }
export interface RegionDisplay { bounds: RegionRect; scaleFactor: number }
export interface RegionCrop { x: number; y: number; width: number; height: number; scale: number }

/**
 * 选区（显示器逻辑像素）→ 视频帧（物理像素）裁剪参数。
 * videoWidth 与 display.bounds.width 的比例就是实际缩放（Chromium 可能压过分辨率，
 * 所以不能用 scaleFactor 硬算）。
 */
export function computeRegionCrop(
  videoWidth: number,
  videoHeight: number,
  display: RegionDisplay,
  rect: RegionRect,
): RegionCrop {
  const baseW = display && display.bounds ? Number(display.bounds.width) : 0;
  const baseH = display && display.bounds ? Number(display.bounds.height) : 0;
  const scaleX = baseW > 0 ? videoWidth / baseW : 1;
  const scaleY = baseH > 0 ? videoHeight / baseH : 1;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const x = clamp(Math.round(rect.x * scaleX), 0, Math.max(0, videoWidth - 1));
  const y = clamp(Math.round(rect.y * scaleY), 0, Math.max(0, videoHeight - 1));
  const width = clamp(Math.round(rect.width * scaleX), 1, Math.max(1, videoWidth - x));
  const height = clamp(Math.round(rect.height * scaleY), 1, Math.max(1, videoHeight - y));
  return { x, y, width, height, scale: scaleX };
}

/** 选一个当前环境支持的 webm 编码（Electron/Chromium 一般都有 vp9 或 vp8） */
export function pickRecorderMime(
  supported: (mime: string) => boolean = (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
): string {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try { if (supported(m)) return m; } catch { /* 继续试下一个 */ }
  }
  return '';
}

export interface RegionRecorderHandle { stop(): Promise<string | null> }

export interface StartRegionOptions {
  rect: RegionRect;
  display: RegionDisplay;
  fps?: number;
  maxMs?: number;
  /** 达到时长上限自动结束时的回调（返回已保存路径） */
  onAutoStop?: (file: string | null) => void;
}

/**
 * 开始录制选区。返回 stop()：停止 → 等 MediaRecorder 收尾 → 交给主进程落盘。
 * 调用方负责 UI 状态；本函数失败时抛错（getDisplayMedia 被拒 / 采集无画面等）。
 */
export async function startRegionRecording(opts: StartRegionOptions): Promise<RegionRecorderHandle> {
  const fps = Math.min(Math.max(Number(opts.fps) || 15, 5), 30);

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: false });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    for (let i = 0; i < 80 && !video.videoWidth; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!video.videoWidth) throw new Error('屏幕采集未就绪（拿不到画面尺寸）');

    const crop = computeRegionCrop(video.videoWidth, video.videoHeight, opts.display, opts.rect);
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('创建录制画布失败');

    let raf = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      try { ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height); } catch { /* 单帧失败忽略 */ }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const outStream = canvas.captureStream(fps);
    const mime = pickRecorderMime();
    const rec = new MediaRecorder(outStream, mime
      ? { mimeType: mime, videoBitsPerSecond: 4_000_000 }
      : { videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const finished = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' })); });
    rec.start(1000);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = async (): Promise<string | null> => {
      if (stopped) return null;
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      cancelAnimationFrame(raf);
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ }
      const blob = await finished;
      for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } }
      for (const t of outStream.getTracks()) { try { t.stop(); } catch { /* ignore */ } }
      if (!blob.size) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const r: any = await (window as any).electronAPI?.screenRecord?.saveBlob?.(bytes, blob.type);
      return r && r.ok ? String(r.file) : null;
    };

    timer = setTimeout(() => {
      void finish().then((file) => opts.onAutoStop?.(file));
    }, Math.min(Math.max(Number(opts.maxMs) || 0, 0) || 10 * 60 * 1000, 60 * 60 * 1000));

    return { stop: finish };
  } catch (err) {
    for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } }
    throw err;
  }
}
