/**
 * 内置插件目录的「暂存 / 恢复 / 断言」纯逻辑（P5 打包可选）。
 *
 * 为什么需要这一层：`build-plugins.mjs --plugins=` 只构建选中插件，但**不会删除**
 * 未选插件的旧目录（构建器删东西是不可接受的副作用）。而 electron-builder 是按目录
 * 整体拷贝 `apps/server/plugins/builtin` 的 —— 旧目录在，就会被打进"精简包"。
 * 于是打包时把未选目录**移**到同级的 `.prune-hold/`，打完再移回来：
 *   · 移动（rename）而不是删除，任何时刻都可恢复；
 *   · 上次构建崩溃留下的暂存区，本次一开始先恢复，不会累积；
 *   · 未知目录（不在 plugins.catalog.json 里）一律不动 —— 可能是人放的/别的会话的。
 *
 * 三个动作的语义：
 *   prune   先恢复残留 → 把「清单已知但未选」的目录移入 hold；
 *   restore 把 hold 里的目录移回 builtin（目标已存在则丢弃暂存副本，见下）；
 *   verify  断言未选 id 目录不存在、选中 id 目录（含 manifest.json）存在。
 *
 * 本文件只做纯逻辑，所有 fs 可注入（守门测试用临时目录 + 假 fs）。
 */
const fsDefault = require('fs');
const path = require('path');

const HOLD_DIR_NAME = '.prune-hold';
/** 办公基座：没有独立插件包（无 backendEntry / manifest），永远不参与 prune / 存在性断言。 */
const OFFICE_ID = 'office-core';

/** 暂存区目录：与 builtin 同级（<server>/plugins/.prune-hold），避免被 extraResources 拷进包。 */
function holdDirFor(root) {
  return path.join(path.dirname(root), HOLD_DIR_NAME);
}

function listDirs(dir, fs = fsDefault) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/**
 * 把暂存区里的目录移回 builtin。
 *
 * 目标已存在时**丢弃暂存副本**：说明这一轮 build-plugins 已经把该插件重新构建出来了，
 * 暂存里那份是被移走的旧产物（构建目录本身是产物、可随时重建），留着只会越积越多。
 */
function restoreHeld({ root, fs = fsDefault, log = () => {} } = {}) {
  const hold = holdDirFor(root);
  const restored = [];
  const dropped = [];
  if (!fs.existsSync(hold)) return { holdDir: hold, restored, dropped };

  for (const name of listDirs(hold, fs)) {
    const src = path.join(hold, name);
    const dest = path.join(root, name);
    if (fs.existsSync(dest)) {
      fs.rmSync(src, { recursive: true, force: true });
      dropped.push(name);
      log(`drop   ${name}（builtin 已有新构建，丢弃暂存副本）`);
      continue;
    }
    fs.mkdirSync(root, { recursive: true });
    fs.renameSync(src, dest);
    restored.push(name);
    log(`restore ${name}`);
  }
  return { holdDir: hold, restored, dropped };
}

/**
 * 把「清单已知但未选」的目录移入暂存区（先恢复上次残留）。
 *
 * @param {object} opts
 * @param {string} opts.root      builtin 目录绝对路径
 * @param {string[]} opts.allIds  plugins.catalog.json 的全部 id（只处理这些，未知目录不动）
 * @param {string[]} opts.selected 本次选中 id
 * @returns {{holdDir: string, restored: string[], dropped: string[], moved: string[]}}
 */
function prunePlugins({ root, allIds = [], selected = [], fs = fsDefault, log = () => {} } = {}) {
  const { holdDir, restored, dropped } = restoreHeld({ root, fs, log });
  const selectedSet = new Set(selected);
  const moved = [];
  if (!fs.existsSync(root)) return { holdDir, restored, dropped, moved };

  for (const id of allIds) {
    if (id === OFFICE_ID || selectedSet.has(id)) continue;
    const src = path.join(root, id);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(holdDir, { recursive: true });
    const dest = path.join(holdDir, id);
    // 上一次崩溃可能留下同名暂存（未被 restore 成功）——先清掉再移，保证 rename 不撞名
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(src, dest);
    moved.push(id);
    log(`prune  ${id} → ${path.basename(holdDir)}/`);
  }
  return { holdDir, restored, dropped, moved };
}

/**
 * 断言目录状态符合选择集。
 *
 * @returns {{ok: boolean, leaked: string[], missing: string[]}}
 *   leaked  未选 id 的目录还在 builtin（会被打进包）
 *   missing 选中 id 的目录 / manifest.json 缺失（包里会缺件）
 */
function verifyStaged({ root, allIds = [], selected = [], fs = fsDefault } = {}) {
  const selectedSet = new Set(selected);
  const leaked = [];
  const missing = [];
  for (const id of allIds) {
    const dir = path.join(root, id);
    if (selectedSet.has(id)) {
      if (id === OFFICE_ID) continue; // 基座无独立包，不做存在性要求
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) missing.push(id);
    } else if (fs.existsSync(dir)) {
      leaked.push(id);
    }
  }
  return { ok: !leaked.length && !missing.length, leaked, missing };
}

/** 唯一标记串：只用**视图组件名**（非 glob 的 frontendViews 文件名去扩展名）。
 *
 * ★ 不用插件 id 当标记：`/plugin/ops-shell/...` 这类接口字面量会出现在别的插件
 *   （如 cicd 的发布面板）与注释里，按 id 扫产物会误报；视图组件名（OpsConsole /
 *   SecConsole / ClipWorkbench…）才是"该插件的界面被编进包"的可靠证据。
 * ★ 太短的串（<6）容易撞普通单词，一律不取；没有视图的插件（skins/computer-use）
 *   只靠目录断言守卫。
 */
function pluginMarkers(catalog, id) {
  const views = (catalog?.plugins?.[id]?.frontendViews || []);
  const out = new Set();
  for (const view of views) {
    if (typeof view !== 'string' || view.includes('*')) continue;
    const base = path.basename(view).replace(/\.(vue|ts|tsx|js)$/, '');
    if (base.length >= 6) out.add(base);
  }
  return [...out];
}

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.txt', '.map']);

function walkFiles(dir, fs = fsDefault, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, fs, out);
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

/**
 * 在产物目录里找未选插件的标记串。
 *
 * @param {object} opts
 * @param {string[]} opts.dirs       产物目录（绝对路径）
 * @param {Record<string,string[]>} opts.markersByPlugin  未选插件 → 标记串
 * @param {string} [opts.baseDir]    报告里用的相对根（默认 dirs 的父级无关紧要，仅美观）
 * @returns {Array<{file: string, pluginId: string, marker: string}>}
 */
function scanProductForLeaks({ dirs = [], markersByPlugin = {}, fs = fsDefault, baseDir } = {}) {
  const pairs = Object.entries(markersByPlugin).flatMap(([pluginId, list]) =>
    (list || []).map((marker) => ({ pluginId, marker })),
  );
  if (!pairs.length) return [];
  const hits = [];
  const seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walkFiles(dir, fs)) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const rel = baseDir ? path.relative(baseDir, file).replace(/\\/g, '/') : file;
      for (const { pluginId, marker } of pairs) {
        if (!text.includes(marker)) continue;
        const key = `${rel}|${marker}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ file: rel, pluginId, marker });
      }
    }
  }
  return hits;
}

module.exports = {
  HOLD_DIR_NAME,
  OFFICE_ID,
  holdDirFor,
  listDirs,
  restoreHeld,
  prunePlugins,
  verifyStaged,
  pluginMarkers,
  scanProductForLeaks,
  TEXT_EXT,
  walkFiles,
};
