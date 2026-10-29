/**
 * 用户导入的 2D 形象（形象工坊）——注册表 + 加载/导入/删除
 *
 * 图片存在 userData/pet-packs/<id>/sheet.webp（主进程写），渲染层只拿 blob URL：
 * 这样打包版 file:// 与 dev http 都能用，也不需要额外协议。
 */
import { reactive } from 'vue'
import { buildSheetFromBytes, type UserPackManifest } from './import-pack'

export interface UserPackEntry {
  manifest: UserPackManifest
  /** blob: URL，供 CSS background-image 直接用 */
  url: string
}

export const userPacks = reactive<Record<string, UserPackEntry>>({})

const api = () => (window as any).electronAPI?.pet

function toBlobUrl(data: any): string {
  const blob = new Blob([data], { type: 'image/webp' })
  return URL.createObjectURL(blob)
}

export function isUserPack(id: string): boolean {
  return !!userPacks[id]
}

/** 用户包 → Pet2D 认的配置；v1 只有一行，所有状态共用同一套帧 */
export function userPackConfig(id: string) {
  const entry = userPacks[id]
  if (!entry) return null
  const m = entry.manifest
  const frames = Math.max(1, m.frames)
  const row = { r: 0, n: frames, fps: Math.min(24, Math.max(2, m.fps)) }
  return {
    name: m.label,
    img: entry.url,
    fw: m.frameWidth,
    fh: m.frameHeight,
    cols: frames,
    rows: 1,
    states: {
      idle: row,
      walking: row,
      running: row,
      ready: row,
      'needs-input': row,
      error: row,
      paused: row,
    },
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
    userPacks[m.id] = { manifest: m, url: toBlobUrl(asset.data) }
  }
}

/** 导入：字节 → 精灵表 → 落盘 → 注册（返回新包 id，调用方负责选中） */
export async function importUserPack(bytes: ArrayBuffer, label: string): Promise<string> {
  const { data, manifest } = await buildSheetFromBytes(bytes, label)
  const r = await api()?.importPack?.({ id: manifest.id, data, manifest })
  if (!r?.ok) throw new Error((r && r.msg) || '导入失败')
  userPacks[manifest.id] = { manifest: { ...manifest, ...(r.pack || {}) }, url: toBlobUrl(data) }
  return manifest.id
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
