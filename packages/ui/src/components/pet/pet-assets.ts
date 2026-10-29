// 宠物素材注册表（2D 精灵图 + 3D VRM 清单）。
//
// 真相源是 catalog.json（打包 --pets 选择集、--list-plugins、设置页选项共用一份）。
// 默认（web / mobile / 测试）用 import.meta.glob 全量装载；**桌面打包**会按
// `--pets` 选择集把本模块整体替换成只含选中资源的版本（apps/desktop/vite.config.ts），
// 未选的 webp 根本不会被 Rollup 引用 → 不进产物。
//
// ★ 为什么要这样生成而不是运行时过滤：静态 import 一旦写死，资源就一定会被 emit，
//   运行时再"不显示"也还是会随包分发（9.8MB 精灵图 + 33MB VRM 白给）。
import catalog from '../../assets/pet-packs/catalog.json'

export interface PetPackMeta {
  id: string
  label: string
  file: string
}

export interface PetVrmMeta extends PetPackMeta {
  license?: string
}

const MODULES = import.meta.glob('../../assets/pet-packs/*-spritesheet.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const URL_BY_FILE: Record<string, string> = {}
for (const [p, url] of Object.entries(MODULES)) {
  const name = p.split('/').pop()
  if (name) URL_BY_FILE[name] = url
}

/** 已随包打包的 2D 宠物包 → 精灵图 URL（未随包的 id 不在这里，UI 要按它降级） */
export const PET_PACK_URLS: Record<string, string> = {}
const AVAILABLE_PACKS: PetPackMeta[] = []
for (const p of (catalog as { packs?: PetPackMeta[] }).packs || []) {
  const url = URL_BY_FILE[p.file]
  if (!url) continue
  PET_PACK_URLS[p.id] = url
  AVAILABLE_PACKS.push(p)
}

/** 随包的 2D 宠物包（设置页选项 / 菜单名称都用它） */
export const PET_PACKS: readonly PetPackMeta[] = AVAILABLE_PACKS

/** 随包的 3D 模型（未随包时设置页隐藏 3D 选项，避免选了必然失败） */
export const PET_VRM_MODELS: readonly PetVrmMeta[] = ((catalog as { vrms?: PetVrmMeta[] }).vrms || []).slice()

/** 本包是否带任何宠物资源；false 时宠物入口整体降级隐藏 */
export const HAS_PET_ASSETS = PET_PACKS.length > 0 || PET_VRM_MODELS.length > 0
