/**
 * 形象工坊：把用户给的 GIF / 静态图变成一只可用的 2D 形象（2026-10-29）
 *
 * 产出是一张**横向单行精灵表** + manifest：
 *   - GIF：逐帧解码 → 平铺成一行，帧率取 GIF 平均帧间隔
 *   - 静态图（PNG/WebP/JPEG）：单帧，等于一张静止形象
 *
 * v1 限制（写进设置页说明）：所有动作行都指向这一行，所以导入的形象只有
 * 一个循环动画（待机/跑/等待都用它）；行映射编辑器留到 v2。
 */

export interface UserPackManifest {
  id: string
  label: string
  frameWidth: number
  frameHeight: number
  /** 横向帧数（= GIRD 列数） */
  frames: number
  fps: number
  source: 'gif' | 'image'
  createdAt?: number
}

/** 单帧最大边长与整表最大宽度：宠物窗很小，再大只是浪费显存 */
const MAX_FRAME_HEIGHT = 256
const MAX_SHEET_WIDTH = 4096
const MAX_FRAMES = 32

/** id 只留安全字符（同时用作目录名） */
export function sanitizePackId(name: string): string {
  const base = String(name || 'pack')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return (base || 'pack') + '-' + Date.now().toString(36)
}

/** 按"帧高上限 + 整表宽度上限"算缩放与可用帧数 */
export function planSheet(
  frameW: number,
  frameH: number,
  frameCount: number
): { scale: number; frames: number; sheetWidth: number; sheetHeight: number } {
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.floor(frameCount) || 1))
  let scale = Math.min(1, MAX_FRAME_HEIGHT / Math.max(1, frameH))
  if (frameW * count * scale > MAX_SHEET_WIDTH) scale = MAX_SHEET_WIDTH / (frameW * count)
  const fw = Math.max(1, Math.round(frameW * scale))
  const fh = Math.max(1, Math.round(frameH * scale))
  return { scale, frames: count, sheetWidth: fw * count, sheetHeight: fh }
}

export function manifestFor(
  label: string,
  info: { frames: number; frameWidth: number; frameHeight: number; fps: number; source: 'gif' | 'image' }
): UserPackManifest {
  return {
    id: sanitizePackId(label),
    label: String(label || '自定义形象').slice(0, 24),
    frames: Math.max(1, Math.round(info.frames)),
    frameWidth: Math.max(1, Math.round(info.frameWidth)),
    frameHeight: Math.max(1, Math.round(info.frameHeight)),
    fps: Math.min(24, Math.max(2, Math.round(info.fps))),
    source: info.source,
  }
}

function sniffType(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))
  const ascii = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len))
  if (ascii(0, 3) === 'GIF') return 'image/gif'
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png'
  if (ascii(0, 2) === '\xff\xd8') return 'image/jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  return ''
}

/** 解码 + 拼表。返回可直接交给主进程落盘的 webp bytes 与 manifest 数据 */
export async function buildSheetFromBytes(
  bytes: ArrayBuffer,
  label: string
): Promise<{ data: Uint8Array; manifest: UserPackManifest }> {
  const type = sniffType(bytes)
  if (!type) throw new Error('不支持的图片格式（请用 GIF / PNG / WebP / JPEG）')
  const Decoder = (window as any).ImageDecoder
  if (!Decoder) throw new Error('当前环境不支持图片解码（需要 Electron 内置 Chromium）')

  const decoder = new Decoder({ data: bytes, type })
  const track = await decoder.tracks?.ready
  const sel = track?.selectedTrack
  const frameCount = Math.max(1, Math.min(MAX_FRAMES, Number(sel?.frameCount) || 1))

  const frames: Array<{ bitmap: ImageBitmap | VideoFrame; duration: number }> = []
  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true })
    frames.push({ bitmap: image, duration: Number(image.duration) || 0 })
  }
  const first = frames[0].bitmap as any
  const fw = first.displayWidth || first.codedWidth || 1
  const fh = first.displayHeight || first.codedHeight || 1

  const plan = planSheet(fw, fh, frames.length)
  const fwS = Math.max(1, Math.round(fw * plan.scale))
  const fhS = Math.max(1, Math.round(fh * plan.scale))

  const canvas = document.createElement('canvas')
  canvas.width = fwS * Math.min(frames.length, plan.frames)
  canvas.height = fhS
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.imageSmoothingEnabled = true
  frames.slice(0, plan.frames).forEach((f, i) => {
    ctx.drawImage(f.bitmap as any, i * fwS, 0, fwS, fhS)
  })

  // fps：GIF 用平均帧间隔（微秒），静态图给 6
  const durs = frames.map((f) => f.duration).filter((d) => d > 0)
  const avgUs = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0
  const fps = avgUs ? 1_000_000 / avgUs : 6

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/webp', 0.92)
  })
  const data = new Uint8Array(await blob.arrayBuffer())
  const manifest = manifestFor(label, {
    frames: Math.min(frames.length, plan.frames),
    frameWidth: fwS,
    frameHeight: fhS,
    fps,
    source: type === 'image/gif' ? 'gif' : 'image',
  })
  // 释放解码资源
  frames.forEach((f) => {
    try {
      (f.bitmap as any).close?.()
    } catch {
      /* 忽略 */
    }
  })
  try {
    decoder.close?.()
  } catch {
    /* 忽略 */
  }
  return { data, manifest }
}
