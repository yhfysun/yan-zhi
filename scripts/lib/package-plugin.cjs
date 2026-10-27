/**
 * 单独打包 .yzp：目录读取/校验/文件清单（纯逻辑，无落盘、无 zip 依赖 —— 可 node --test）。
 *
 * ★ 唯一约定：.yzp 就是 `apps/server/plugins/builtin/<id>/` 目录的 zip。
 *   不另建构建路径 —— 内置产物与分发产物必须**同源**，否则「装回来的插件」与
 *   「随包内置的插件」会悄悄跑两份不同的代码。
 *
 * 三种清单形态都要接受（见 inspectManifest）：
 *   · 单清单对象           { id, name, version, … }
 *   · 旧数组形态           [ { id, … }, … ]
 *   · 多清单包装（skins）  { multi: true, count, manifests: [ … ] }
 * 目录名与清单 id 必须一致（多清单包以**目录名**为分发单元，无单一 id 可比）。
 */

/** 任何一段目录名为这些值即整棵子树跳过：构建暂存、裁剪暂存、依赖、版本库 */
const EXCLUDED_SEGMENTS = new Set(['.yz-tmp', '.prune-hold', 'node_modules', '.git']);
/** 构建器历史遗留的临时入口（曾落在产物根被拷进安装包），以及系统垃圾文件 */
const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const TEMP_ENTRY_PREFIX = '__frontend-entry-';

class PluginPackageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PluginPackageError';
  }
}

function toPosix(relPath) {
  return relPath.split('\\').join('/');
}

/** 该相对路径是否属于暂存残留/垃圾文件（relPath 用 / 分隔） */
function isExcludedPath(relPath) {
  const segments = relPath.split('/');
  for (const seg of segments) {
    if (EXCLUDED_SEGMENTS.has(seg)) return true;
  }
  const base = segments[segments.length - 1] || '';
  if (EXCLUDED_BASENAMES.has(base)) return true;
  // `__frontend-entry-*` 只在**包根**是历史残留（旧版构建器把临时入口落在产物根）。
  // ★ frontend/ 里的同名文件是 vite lib 产物分块，index.mjs 会 import 它 ——
  //   按任意层级排除会把插件前端打残（实测 frontend/index.mjs → ./__frontend-entry-*.mjs）。
  return segments.length === 1 && base.startsWith(TEMP_ENTRY_PREFIX);
}

/**
 * 递归列出插件目录内的可分发包文件（排序稳定：目录按字典序、文件在前）。
 * @returns {Array<{ path: string, size: number }>} path 为 / 分隔的包内相对路径
 */
function collectPluginFiles(pluginDir, fsImpl) {
  const fs = fsImpl || require('node:fs');
  const out = [];

  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (e) {
      throw new PluginPackageError(`读取目录失败: ${absDir}（${e && e.message}）`);
    }
    const files = [];
    const dirs = [];
    for (const ent of entries) {
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (isExcludedPath(rel)) continue;
      if (ent.isDirectory()) dirs.push({ abs: `${absDir}/${ent.name}`, rel, name: ent.name });
      else if (ent.isFile()) files.push({ abs: `${absDir}/${ent.name}`, rel, name: ent.name });
    }
    files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    dirs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const f of files) {
      out.push({ path: toPosix(f.rel), size: fs.statSync(f.abs).size });
    }
    for (const d of dirs) walk(d.abs, d.rel);
  }

  walk(pluginDir, '');
  return out;
}

/**
 * 解析 manifest.json 并归类形态。
 * @returns {{ kind: 'single'|'multi', manifest: object, manifests: object[], ids: string[], version: string, packageId: string|null }}
 */
function inspectManifest(raw, dirId) {
  if (Array.isArray(raw)) return classifyMulti(raw, dirId, '数组', null);
  if (raw && typeof raw === 'object' && Array.isArray(raw.manifests)) {
    const wrapperId = typeof raw.id === 'string' && raw.id ? raw.id : null;
    if (wrapperId && dirId && wrapperId !== dirId) {
      throw new PluginPackageError(`多清单包的 id（${wrapperId}）与目录名（${dirId}）不一致`);
    }
    return classifyMulti(raw.manifests, dirId, '包装', wrapperId);
  }
  if (!raw || typeof raw !== 'object') {
    throw new PluginPackageError('manifest.json 必须是对象');
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    throw new PluginPackageError('manifest.json 缺少 id');
  }
  if (raw.id !== dirId) {
    throw new PluginPackageError(`manifest.json 的 id（${raw.id}）与目录名（${dirId}）不一致`);
  }
  if (typeof raw.version !== 'string' || !raw.version) {
    throw new PluginPackageError('manifest.json 缺少 version（.yzp 文件名需要它）');
  }
  return { kind: 'single', manifest: raw, manifests: [raw], ids: [raw.id], version: raw.version, packageId: raw.id };
}

function classifyMulti(manifests, dirId, form, wrapperId) {
  if (!manifests.length) {
    throw new PluginPackageError(`manifest.json 是${form}形态但没有清单条目`);
  }
  for (const m of manifests) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) {
      throw new PluginPackageError(`manifest.json 的${form}形态中有条目缺少 id`);
    }
  }
  const first = manifests[0];
  return {
    kind: 'multi',
    manifest: first,
    manifests,
    ids: manifests.map((m) => m.id),
    version: typeof first.version === 'string' && first.version ? first.version : '0.0.0',
    // 安装端用 packageId 当安装目录名；老式数组/无 id 包装为 null（装不回来，CLI 会警告）
    packageId: wrapperId || null,
  };
}

/**
 * 校验并汇总一个插件目录的可分发内容。
 * @returns {{ id: string, dir: string, kind: string, version: string, ids: string[], files: Array, totalBytes: number }}
 */
function preparePluginPackage({ pluginDir, id, fsImpl }) {
  const fs = fsImpl || require('node:fs');
  const path = require('node:path');
  const dirId = id || path.basename(pluginDir);
  if (!fs.existsSync(pluginDir) || !fs.statSync(pluginDir).isDirectory()) {
    throw new PluginPackageError(`插件目录不存在: ${pluginDir}（先跑 build-plugins 生成内置产物）`);
  }
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new PluginPackageError(`插件目录缺少 manifest.json: ${pluginDir}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    throw new PluginPackageError(`manifest.json 不是合法 JSON: ${manifestPath}（${e && e.message}）`);
  }
  const meta = inspectManifest(raw, dirId);
  const files = collectPluginFiles(pluginDir, fs);
  if (!files.some((f) => f.path === 'manifest.json')) {
    throw new PluginPackageError('文件清单里没有 manifest.json（不应发生：已确认存在）');
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  return {
    id: dirId,
    dir: pluginDir,
    kind: meta.kind,
    version: meta.version,
    ids: meta.ids,
    packageId: meta.packageId,
    files,
    totalBytes,
  };
}

/** .yzp 文件名：<id>-<version>.yzp（多清单包用目录名 + 首条清单版本） */
function archiveName(id, version) {
  return `${id}-${version}.yzp`;
}

/** 纯 JS 的 zip 条目顺序：先 manifest.json，再其余（按 path 升序） */
function sortForArchive(files) {
  return files.slice().sort((a, b) => {
    if (a.path === 'manifest.json') return -1;
    if (b.path === 'manifest.json') return 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

module.exports = {
  PluginPackageError,
  EXCLUDED_SEGMENTS,
  EXCLUDED_BASENAMES,
  TEMP_ENTRY_PREFIX,
  isExcludedPath,
  collectPluginFiles,
  inspectManifest,
  preparePluginPackage,
  archiveName,
  sortForArchive,
};
