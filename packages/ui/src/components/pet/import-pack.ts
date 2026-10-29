/**
 * 形象工坊：把用户给的 GIF / 静态图 / 精灵图集变成一只可用的 2D 形象
 *
 * 两条导入路径：
 *   1. GIF / 单张静图 —— 逐帧解码后平铺成**横向单行精灵表**（webp），
 *      帧率取 GIF 平均帧间隔；所有状态共用这一行动画
 *   2. 精灵图集（PNG/WebP/JPEG 网格）—— 原图原样存盘（不重编码），
 *      按 cols×rows 切帧，行顺序即动作行（§7.1 社区标准 9 态）
 *
 * 校验（图集）：尺寸必须能被 cols×rows 整除、帧不能太小、行列数有上限；
 * 动作行是否为空只做警告（透明占位行很常见，不拦导入）。
 */

/** 动作行顺序：与 Pet2D 内置包的 STD / pet 包 manifest 一致 */
export const STATE_ROW_ORDER = [
  'idle',
  'walking',
  'running',
  'ready',
  'needs-input',
  'error',
  'paused',
] as const
export type PetStateName = (typeof STATE_ROW_ORDER)[number]

export const STATE_ROW_LABELS: Record<PetStateName, string> = {
  idle: '待机',
  walking: '踱步',
  running: '跑动',
  ready: '完成',
  'needs-input': '等你输入',
  error: '出错',
  paused: '暂停',
}

/** 单帧最大高与整表最大宽度：宠物窗很小，再大只是浪费显存 */
const MAX_FRAME_HEIGHT = 256
const MAX_SHEET_WIDTH = 4096
const MAX_FRAMES = 32
/** 图集行列上限：9 态之外再留两行备用 */
const MAX_ATLAS_COLS = 32
const MAX_ATLAS_ROWS = STATE_ROW_ORDER.length + 2
const MIN_FRAME_SIDE = 8

export type UserPackSource = 'gif' | 'image' | 'sheet'

export interface UserPackState {
  /** 行号（图集） */
  r: number
  /** 该行动画帧数 */
  n: number
  fps: number
}

export interface UserPackManifest {
  id: string
  label: string
  frameWidth: number
  frameHeight: number
  /** 图集列数（GIF/单图为平铺后的帧数）；v1 老 manifest 没有这个字段，按 frames 兼容 */
  cols?: number
  /** 图集行数；v1 老 manifest 没有这个字段，按 1 行兼容 */
  rows?: number
  /** 总帧数 cols*rows（v1 manifest 里等于单行帧数） */
  frames: number
  fps: number
  source: UserPackSource
  /** 行 → 状态映射；v1 manifest 没有这个字段，按单行处理 */
  states?: Record<string, UserPackState>
  /** 落盘文件名（主进程写入，如 sheet.webp） */
  file?: string
  createdAt?: number
}

/** id 只留安全字符（同时用作目录名） */
export function sanitizePackId(name: string): string {
  const base = String(name || 'pack')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return (base || 'pack') + '-' + Date.now().toString(36)
}

/** 按"帧高上限 + 整表宽度上限"算缩放与可用帧数（GIF 平铺用） */
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

/** 图集校验结果：errors 非空即不能导入，warnings 只是提示 */
export interface AtlasPlan {
  ok: boolean
  errors: string[]
  warnings: string[]
  cols: number
  rows: number
  frameWidth: number
  frameHeight: number
  frames: number
  /** 是否要 CSS 侧缩小（帧高 > 256） */
  scale: number
  states: Record<string, UserPackState>
}

/** 校验 cols×rows 是否真的能把这张图切成整齐的帧 */
export function planAtlas(
  imgWidth: number,
  imgHeight: number,
  cols: number,
  rows: number,
  fps = 6
): AtlasPlan {
  const errors: string[] = []
  const warnings: string[] = []
  const c = Math.max(0, Math.floor(Number(cols) || 0))
  const r = Math.max(0, Math.floor(Number(rows) || 0))
  if (!c || !r) errors.push('列数与行数都要 ≥ 1')
  if (c > MAX_ATLAS_COLS) errors.push(`列数上限 ${MAX_ATLAS_COLS}`)
  if (r > MAX_ATLAS_ROWS) errors.push(`行数上限 ${MAX_ATLAS_ROWS}`)
  const w = Math.max(1, Math.floor(imgWidth))
  const h = Math.max(1, Math.floor(imgHeight))
  const fw = c ? w / c : 0
  const fh = r ? h / r : 0
  if (c && r) {
    if (!Number.isInteger(fw)) errors.push(`宽度 ${w} 不能被 ${c} 列整除`)
    if (!Number.isInteger(fh)) errors.push(`高度 ${h} 不能被 ${r} 行整除`)
    if (fw && fw < MIN_FRAME_SIDE) errors.push(`帧宽 ${Math.round(fw)}px 太小（至少 ${MIN_FRAME_SIDE}px）`)
    if (fh && fh < MIN_FRAME_SIDE) errors.push(`帧高 ${Math.round(fh)}px 太小（至少 ${MIN_FRAME_SIDE}px）`)
  }
  const scale = fh ? Math.min(1, MAX_FRAME_HEIGHT / fh) : 1
  if (fh > 512) warnings.push(`单帧 ${Math.round(fh)}px 偏高，桌面上会缩到 118px 显示`)
  if (r >= 2 && r < STATE_ROW_ORDER.length) {
    warnings.push(`只映射前 ${r} 行动作：${STATE_ROW_ORDER.slice(0, r).map((s) => STATE_ROW_LABELS[s]).join(' / ')}`)
  }
  const states: Record<string, UserPackState> = {}
  if (!errors.length) {
    STATE_ROW_ORDER.forEach((name, i) => {
      if (i < r) states[name] = { r: i, n: c, fps }
    })
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    cols: c,
    rows: r,
    frameWidth: Math.round(fw),
    frameHeight: Math.round(fh),
    frames: c * r,
    scale,
    states,
  }
}

/** 建议列数：帧是正方形时最自然；单行图集再按常见帧高 208/192/128/96/64 倒推 */
export function suggestCols(imgWidth: number, imgHeight: number): number {
  const square = Math.round(imgWidth / imgHeight)
  if (square >= 1 && square <= MAX_ATLAS_COLS && imgWidth % square === 0) return square
  for (const fh of [208, 192, 128, 96, 64]) {
    if (imgHeight % fh !== 0) continue
    const cols = imgWidth / fh
    if (Number.isInteger(cols) && cols >= 1 && cols <= MAX_ATLAS_COLS) return cols
  }
  return 1
}

export function manifestFor(
  label: string,
  info: {
    cols: number
    rows: number
    frameWidth: number
    frameHeight: number
    fps: number
    source: UserPackSource
    states?: Record<string, UserPackState>
  }
): UserPackManifest {
  const cols = Math.max(1, Math.round(info.cols))
  const rows = Math.max(1, Math.round(info.rows))
  const states: Record<string, UserPackState> = {}
  for (const [k, v] of Object.entries(info.states || {})) {
    states[k] = {
      r: Math.max(0, Math.min(rows - 1, Math.round(v.r))),
      n: Math.max(1, Math.min(cols, Math.round(v.n))),
      fps: Math.min(24, Math.max(2, Math.round(v.fps))),
    }
  }
  return {
    id: sanitizePackId(label),
    label: String(label || '自定义形象').slice(0, 24),
    cols,
    rows,
    frames: Math.max(1, cols * rows),
    frameWidth: Math.max(1, Math.round(info.frameWidth)),
    frameHeight: Math.max(1, Math.round(info.frameHeight)),
    fps: Math.min(24, Math.max(2, Math.round(info.fps))),
    source: info.source,
    ...(Object.keys(states).length ? { states } : {}),
  }
}

export function sniffType(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))
  const ascii = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len))
  if (ascii(0, 3) === 'GIF') return 'image/gif'
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png'
  if (ascii(0, 2) === '\xff\xd8') return 'image/jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  return ''
}

/** 落盘扩展名（主进程按它写 sheet.<ext>） */
export function extOfType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/gif') return 'gif'
  return 'webp'
}

/** 只读图片头：尺寸 + 帧数 + 平均帧率（最多拆 12 帧估帧率） */
export async function inspectBytes(
  bytes: ArrayBuffer
): Promise<{ type: string; width: number; height: number; frameCount: number; fps: number }> {
  const type = sniffType(bytes)
  if (!type) throw new Error('不支持的图片格式（请用 GIF / PNG / WebP / JPEG 或精灵图集）')
  const Decoder = (window as any).ImageDecoder
  if (!Decoder) throw new Error('当前环境不支持图片解码（需要 Electron 内置 Chromium）')
  const decoder = new Decoder({ data: bytes, type })
  try {
    // ready 解析的是 undefined（不是 track 列表），帧数要从 decoder.tracks 上读
    await decoder.tracks?.ready
    const frameCount = Math.max(1, Number(decoder.tracks?.selectedTrack?.frameCount) || 1)
    let width = 1
    let height = 1
    let totalUs = 0
    let counted = 0
    for (let i = 0; i < Math.min(frameCount, 12); i++) {
      const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true })
      const f = image as any
      if (i === 0) {
        width = f.displayWidth || f.codedWidth || 1
        height = f.displayHeight || f.codedHeight || 1
      }
      const d = Number(f.duration) || 0
      if (d > 0) {
        totalUs += d
        counted++
      }
      try {
        f.close?.()
      } catch {
        /* 忽略 */
      }
    }
    const fps = counted ? 1_000_000 / (totalUs / counted) : 6
    return { type, width, height, frameCount, fps: Math.min(24, Math.max(2, Math.round(fps))) }
  } finally {
    try {
      decoder.close?.()
    } catch {
      /* 忽略 */
    }
  }
}

/**
 * GIF / 静态图 → 横向单行精灵表（webp）
 * 返回可直接交给主进程落盘的 bytes 与 manifest 数据
 */
export async function buildSheetFromBytes(
  bytes: ArrayBuffer,
  label: string
): Promise<{ data: Uint8Array; manifest: UserPackManifest; ext: string }> {
  const type = sniffType(bytes)
  if (!type) throw new Error('不支持的图片格式（请用 GIF / PNG / WebP / JPEG）')
  const Decoder = (window as any).ImageDecoder
  if (!Decoder) throw new Error('当前环境不支持图片解码（需要 Electron 内置 Chromium）')

  const decoder = new Decoder({ data: bytes, type })
  // ready 解析的是 undefined（不是 track 列表），帧数要从 decoder.tracks 上读
  await decoder.tracks?.ready
  const frameCount = Math.max(1, Math.min(MAX_FRAMES, Number(decoder.tracks?.selectedTrack?.frameCount) || 1))

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
  const container = Math.min(frames.length, plan.frames)
  // 单行平铺：所有状态共用第 0 行
  const states: Record<string, UserPackState> = {}
  for (const name of STATE_ROW_ORDER) states[name] = { r: 0, n: container, fps: Math.min(24, Math.max(2, Math.round(fps))) }
  const manifest = manifestFor(label, {
    cols: container,
    rows: 1,
    frameWidth: fwS,
    frameHeight: fhS,
    fps,
    source: type === 'image/gif' ? 'gif' : 'image',
    states,
  })
  // 释放解码资源
  frames.forEach((f) => {
    try {
      ;(f.bitmap as any).close?.()
    } catch {
      /* 忽略 */
    }
  })
  try {
    decoder.close?.()
  } catch {
    /* 忽略 */
  }
  return { data, manifest, ext: 'webp' }
}

/** 精灵图集 → 原图原样存盘（不重编码），只生成行映射 manifest */
export async function buildAtlasPack(
  bytes: ArrayBuffer,
  label: string,
  cols: number,
  rows: number,
  fps = 6
): Promise<{ data: Uint8Array; manifest: UserPackManifest; ext: string; plan: AtlasPlan }> {
  const type = sniffType(bytes)
  if (!type) throw new Error('不支持的图片格式（请用 PNG / WebP / JPEG）')
  if (type === 'image/gif') {
    throw new Error('GIF 走「动画导入」，不要当图集切帧（请导出成 PNG 图集）')
  }
  const info = await inspectBytes(bytes)
  const plan = planAtlas(info.width, info.height, cols, rows, fps)
  if (!plan.ok) throw new Error(plan.errors[0])
  const manifest = manifestFor(label, {
    cols: plan.cols,
    rows: plan.rows,
    frameWidth: plan.frameWidth,
    frameHeight: plan.frameHeight,
    fps,
    source: 'sheet',
    states: plan.states,
  })
  return { data: new Uint8Array(bytes.slice(0)), manifest, ext: extOfType(type), plan }
}
