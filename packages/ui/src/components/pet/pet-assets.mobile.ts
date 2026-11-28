/**
 * Android 手机发行版不包含桌面桌宠。
 *
 * apps/mobile/vite.config.ts 会把 pet-assets.ts 重定向到这里，
 * 从而让 Rollup 不引用任何 spritesheet / VRM。学习、聊天等非桌宠功能不依赖这些资源。
 */
export interface PetPackMeta {
  id: string
  label: string
  file: string
}

export interface PetVrmMeta extends PetPackMeta {
  license?: string
}

export const PET_PACK_URLS: Record<string, string> = {}
export const PET_PACKS: readonly PetPackMeta[] = []
export const PET_VRM_MODELS: readonly PetVrmMeta[] = []
export const HAS_PET_ASSETS = false
