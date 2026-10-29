/**
 * 用户导入的 2D 形象（形象工坊）——注册表 + 加载/导入/删除
 *
 * 文件存在 userData/pet-packs/<id>/sheet.<ext>（主进程写），渲染层只拿 blob URL：
 * 这样打包版 file:// 与 dev http 都能用，也不需要额外协议。
 *
 * 两种形态：
 *   - GIF / 单图：导入时已平铺成单行 webp，所有状态共用第 0 行
 *   - 精灵图集：原图原样存盘，manifest.states 记录每行动作（§7.1 社区标准行序）
 */
import { reactive } from 'vue'
import { buildAtlasPack, buildSheetFromBytes, STATE_ROW_ORDER, type UserPackManifest, type UserPackState } from './import-pack'

export interface UserPackEntry {
  manifest: UserPackManifest
  /** blob: URL，供 CSS background-image 直接用 */
  url: string
}

export interface ImportOptions {
  /** auto = GIF/单图拍平成单行；atlas = 按网格切帧 */
  mode?: 'auto' | 'atlas'
  cols?: number
  rows?: number
  fps?: number
}

export const userPacks = reactive<Record<string, UserPackEntry>>({})

const api = () => (window as any).electronAPI?.pet

function toBlobUrl(data: any, type = 'image/webp'): string {
  const blob = new Blob([data], { type })
  return URL.createObjectURL(blob)
}

function mimeOfFile(file?: string): string {
  const ext = String(file || '').split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  return 'image/webp'
}

export function isUserPack(id: string): boolean {
  return !!userPacks[id]
}

/** 某只形象的帧宽高比（设置页写入 settings.packAspect，主进程按它算窗口宽度） */
export function packAspectOf(id: string): number {
  const m = userPacks[id]?.manifest
  if (!m) return 192 / 208
  return m.frameWidth / m.frameHeight
}

/** 用户包 → Pet2D 认的配置；图集按 manifest.states 分行，旧包按单行兼容 */
export function userPackConfig(id: string) {
  const entry = userPacks[id]
  if (!entry) return null
  const m = entry.manifest
  const cols = Math.max(1, m.cols || m.frames || 1)
  const rows = Math.max(1, m.rows || 1)
  const fps = Math.min(24, Math.max(2, m.fps || 6))
  const single = { r: 0, n: cols, fps }
  const states: Record<string, UserPackState> = {}
  for (const name of STATE_ROW_ORDER) {
    const s = m.states?.[name]
    states[name] = s ? { r: s.r, n: Math.max(1, Math.min(cols, s.n || cols)), fps: s.fps || fps } : single
  }
  // 「逗一下」动作没有独立动作行时回落到对应状态行，避免播到空行
  const rowOf = (name: string) => states[name] || states.idle
  const actions = {
    pet: { ...rowOf('idle'), dur: 2300 },
    wave: { ...rowOf('ready'), dur: 2400 },
    look: { ...rowOf('paused'), dur: 2600 },
    nap: { ...rowOf('paused'), dur: 3000 },
    spin: { ...rowOf('idle'), dur: 1100 },
    hop: { ...rowOf('idle'), dur: 900 },
  }
  return {
    name: m.label,
    img: entry.url,
    fw: m.frameWidth,
    fh: m.frameHeight,
    cols,
    rows,
    states,
    actions,
  }
}

/** 启动/打开设置页时同步一次（幂等：已有的不重复读） */
export async function loadUserPacks(): Promise<void> {
  const r = await api()?.listPacks?.()
  const list: UserPackManifest[] = (r && r.packs) || []
  for (const m of list) {
    if (!m?.id || userPacks[m.id]) continue
    const asset = await api()?.readPackAsset?.(m.id)
    if (!asset?.ok) continue
    userPacks[m.id] = { manifest: m, url: toBlobUrl(asset.data, mimeOfFile(m.file)) }
  }
}

/**
 * 导入：字节 → 精灵表/图集 → 落盘 → 注册（返回新包 id，调用方负责选中）
 * atlas 模式要求显式给 cols/rows；auto 模式由 GIF 帧数或静图单帧决定。
 */
export async function importUserPack(
  bytes: ArrayBuffer,
  label: string,
  opts: ImportOptions = {}
): Promise<string> {
  const built =
    opts.mode === 'atlas'
      ? await buildAtlasPack(bytes, label, Number(opts.cols) || 1, Number(opts.rows) || 1, opts.fps ?? 6)
      : await buildSheetFromBytes(bytes, label)
  const { data, manifest, ext } = built
  const r = await api()?.importPack?.({ id: manifest.id, data, manifest, ext })
  if (!r?.ok) throw new Error((r && r.msg) || '导入失败')
  const pack: UserPackManifest = { ...manifest, ...(r.pack || {}) }
  userPacks[pack.id] = {
    manifest: pack,
    url: toBlobUrl(data, opts.mode === 'atlas' ? mimeOfFile(pack.file) : 'image/webp'),
  }
  return pack.id
}

export async function deleteUserPack(id: string): Promise<void> {
  try {
    await api()?.deletePack?.(id)
  } catch {
    /* 文件删不掉也把入口摘掉，避免显示一个点不开的形象 */
  }
  const e = userPacks[id]
  if (e) {
    try {
      URL.revokeObjectURL(e.url)
    } catch {
      /* 忽略 */
    }
    delete userPacks[id]
  }
}
