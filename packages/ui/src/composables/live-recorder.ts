/**
 * 直播舞台录制（2026-10-29）。
 *
 * 复用选区录屏那条已验证的管线（getDisplayMedia → canvas 裁剪 → MediaRecorder → 主进程落盘），
 * 只把「采集目标」从整块屏幕换成**本应用窗口**：
 *   - 主进程 screen-record:select-live-window 指定下一次 getDisplayMedia 抓本窗口；
 *   - 窗口流的尺寸对应窗口内容区（innerWidth/innerHeight），
 *     所以裁剪算法与选区录屏共用同一套 computeRegionCrop，不用另写一套坐标换算。
 *
 * 为什么不录整屏再裁：窗口外的东西（桌面、别的应用）根本不该进采集流，
 * 而且窗口被遮挡时整屏采集会录到遮挡物。
 */
import {
  computeRegionCrop,
  startRegionRecording,
  type RegionCrop,
  type RegionDisplay,
  type RegionRect,
  type RegionRecorderHandle,
} from './region-recorder'

/** 窗口内容区的逻辑尺寸 → 采集流裁剪用的 display 描述 */
export function windowDisplay(innerWidth: number, innerHeight: number): RegionDisplay {
  return {
    bounds: { x: 0, y: 0, width: Math.max(1, innerWidth), height: Math.max(1, innerHeight) },
    scaleFactor: 1,
  }
}

/** 元素在页面里的矩形 → 采集流里的裁剪参数（纯函数，便于单测） */
export function stageCropPlan(
  videoWidth: number,
  videoHeight: number,
  innerWidth: number,
  innerHeight: number,
  rect: RegionRect,
): RegionCrop {
  return computeRegionCrop(videoWidth, videoHeight, windowDisplay(innerWidth, innerHeight), rect)
}

export interface StartStageOptions {
  el: HTMLElement
  fps?: number
  maxMs?: number
  onAutoStop?: (file: string | null) => void
}

export interface StageCapture {
  canvas: HTMLCanvasElement
  stop(): void
}

/**
 * 打开「本窗口采集 → 舞台裁剪」的画布。
 * 录制与推流共用：两者只是对同一路画面的不同消费方式（一个存盘、一个进 ffmpeg）。
 */
export async function openStageCapture(el: HTMLElement, fps = 20): Promise<StageCapture> {
  const api = (window as any).electronAPI
  if (!api?.screenRecord?.selectLiveWindow) {
    throw new Error('当前环境不支持窗口采集（仅桌面端）')
  }

  try { el.scrollIntoView({ block: 'center', inline: 'center' }) } catch { /* ignore */ }
  await new Promise<void>((r) => requestAnimationFrame(() => r()))

  const sel = await api.screenRecord.selectLiveWindow()
  if (!sel?.ok) throw new Error(sel?.error || '无法定位本应用窗口')

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: false })
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream

  try {
    await video.play()
    for (let i = 0; i < 80 && !video.videoWidth; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    if (!video.videoWidth) throw new Error('窗口采集未就绪（拿不到画面尺寸）')

    const crop = stageCropPlan(
      video.videoWidth,
      video.videoHeight,
      window.innerWidth,
      window.innerHeight,
      elementRect(el),
    )
    const canvas = document.createElement('canvas')
    canvas.width = crop.width
    canvas.height = crop.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('创建采集画布失败')

    let raf = 0
    let stopped = false
    const draw = () => {
      if (stopped) return
      try {
        ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
      } catch { /* 单帧失败忽略 */ }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return {
      canvas,
      stop() {
        if (stopped) return
        stopped = true
        cancelAnimationFrame(raf)
        for (const t of stream.getTracks()) { try { t.stop() } catch { /* ignore */ } }
      },
    }
  } catch (err) {
    for (const t of stream.getTracks()) { try { t.stop() } catch { /* ignore */ } }
    throw err
  }
}

/** 元素当前矩形（相对视口），已四舍五入到整数像素 */
export function elementRect(el: HTMLElement): RegionRect {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.max(1, Math.round(r.width)),
    height: Math.max(1, Math.round(r.height)),
  }
}

export async function startStageRecording(opts: StartStageOptions): Promise<RegionRecorderHandle> {
  const api = (window as any).electronAPI
  if (!api?.screenRecord?.selectLiveWindow || !api?.screenRecord?.saveBlob) {
    throw new Error('当前环境不支持录制（仅桌面端）')
  }

  // 记录必须完整入镜：先滚到视口中央，等布局稳定再取矩形
  try { opts.el.scrollIntoView({ block: 'center', inline: 'center' }) } catch { /* ignore */ }
  await new Promise<void>((r) => requestAnimationFrame(() => r()))

  const sel = await api.screenRecord.selectLiveWindow()
  if (!sel?.ok) throw new Error(sel?.error || '无法定位本应用窗口')

  return startRegionRecording({
    rect: elementRect(opts.el),
    display: windowDisplay(window.innerWidth, window.innerHeight),
    fps: opts.fps ?? 20,
    maxMs: opts.maxMs,
    onAutoStop: opts.onAutoStop,
  })
}
