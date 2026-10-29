/**
 * 宠物素材选择集（--pets）—— 与插件维度正交。
 *
 * 宠物不是插件：2D 精灵图随前端构建进包、3D VRM 从 publicDir 原样拷进 dist/vrm，
 * 都不走 build/plugins.catalog.json 那套插件包。所以选择集单独一层，规则与插件选择集同构：
 *   · all（默认）：全量；
 *   · none：一个宠物资源都不随包（UI 层宠物入口降级隐藏）；
 *   · <id,...>：点名（2D 包 id 与 3D 模型 id 都能点）；
 *   · 未知 id 一律抛错 —— 静默忽略会打出"名字说没宠物、包里却有 9.8MB 精灵图"的包。
 *
 * 清单真相源 = packages/ui/src/assets/pet-packs/catalog.json（UI 与打包共用一份）。
 */
const fsDefault = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PET_CATALOG_PATH = path.join(REPO_ROOT, 'packages', 'ui', 'src', 'assets', 'pet-packs', 'catalog.json');
const NONE_TOKEN = 'none';

function parseList(raw) {
  if (raw === undefined || raw === null) return null;
  const list = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : null;
}

function loadPetCatalog(fs = fsDefault) {
  return JSON.parse(fs.readFileSync(PET_CATALOG_PATH, 'utf8'));
}

/** catalog 里的全部宠物资源条目（2D 包 + 3D 模型），带 kind 标注。 */
function petEntries(catalog) {
  const packs = (catalog?.packs || []).map((p) => ({ ...p, kind: '2d' }));
  const vrms = (catalog?.vrms || []).map((v) => ({ ...v, kind: '3d' }));
  return [...packs, ...vrms];
}

/**
 * 解析宠物选择集。不传 = 全量（与现有行为一致）。
 * @returns {{ids: string[], packs: object[], vrms: object[], excluded: string[], source: 'pets'|'all'}}
 */
function resolvePetSelection({ catalog, pets } = {}) {
  const entries = petEntries(catalog);
  const allIds = entries.map((e) => e.id);
  const tokens = parseList(pets);

  if (!tokens) {
    return { ids: allIds, packs: entries.filter((e) => e.kind === '2d'), vrms: entries.filter((e) => e.kind === '3d'), excluded: [], source: 'all' };
  }

  const noneTokens = tokens.filter((t) => t.toLowerCase() === NONE_TOKEN);
  if (noneTokens.length) {
    if (tokens.length > 1) throw new Error('--pets=none 不能与具体宠物 id 同时使用');
    return { ids: [], packs: [], vrms: [], excluded: allIds, source: 'pets' };
  }

  const picked = new Set();
  for (const token of tokens) {
    if (!allIds.includes(token)) {
      throw new Error(`未知宠物: ${token}（可选: ${allIds.join(' / ')} / all / none）`);
    }
    picked.add(token);
  }
  const selected = entries.filter((e) => picked.has(e.id));
  return {
    ids: selected.map((e) => e.id),
    packs: selected.filter((e) => e.kind === '2d'),
    vrms: selected.filter((e) => e.kind === '3d'),
    excluded: allIds.filter((id) => !picked.has(id)),
    source: 'pets',
  };
}

module.exports = {
  REPO_ROOT,
  PET_CATALOG_PATH,
  NONE_TOKEN,
  parseList,
  loadPetCatalog,
  petEntries,
  resolvePetSelection,
};
