/**
 * 可选插件进包：把选中的 plugins/optional/<id>/ **原样拷贝**到 builtin/<id>/。
 *
 * 为什么不走 build-plugins：可选插件是手写 ESM（没有 esbuild 构建步骤、没有 catalog 条目），
 * 但 electron-builder 只认 `apps/server/plugins/builtin` 这一棵目录树（extraResources 整体拷）。
 * 所以进包的唯一办法就是打包前把源码目录搬进 builtin，打包后再删掉 —— 与 stage-plugins
 * 的 prune/restore 是同一套思路（移动/复制而非就地裁剪源目录）。
 *
 * 两条硬约定：
 *   · 只拷**选中**的：未选的可选插件如果 builtin 里有旧副本，直接清掉（否则会被打进包里）；
 *   · 打完必须 removeStaged：builtin 是构建产物目录，源码留在那里会让下一次构建"莫名其妙
 *     多一个插件"（它不在 catalog 里，build-plugins 不会重建也不会清）。
 */
const fsDefault = require('fs');
const path = require('path');

/**
 * 拷贝选中的可选插件；清掉未选的旧副本。
 * @param {object} opts
 * @param {string} opts.root      builtin 目录
 * @param {Array}  opts.optional  loadOptionalPlugins() 的结果
 * @param {string[]} opts.selected 本次选择集（含可选插件 id）
 * @returns {{copied: string[], removed: string[]}}
 */
function stageOptionalPlugins({ root, optional = [], selected = [], fs = fsDefault, log = () => {} } = {}) {
  const selectedSet = new Set(selected);
  const copied = [];
  const removed = [];

  for (const plugin of optional) {
    const dest = path.join(root, plugin.id);
    if (selectedSet.has(plugin.id)) {
      if (!fs.existsSync(plugin.dir)) {
        throw new Error(`可选插件源码目录缺失: ${plugin.relDir || plugin.dir}`);
      }
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(root, { recursive: true });
      fs.cpSync(plugin.dir, dest, { recursive: true });
      copied.push(plugin.id);
      log(`stage  ${plugin.id} ← ${plugin.relDir || plugin.dir}`);
      continue;
    }
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      removed.push(plugin.id);
      log(`clear  ${plugin.id}（未选，清掉 builtin 里的旧副本）`);
    }
  }
  return { copied, removed };
}

/** 打包结束清理：把 builtin 里的可选插件副本删掉（它们是拷贝出来的构建输入，不是产物）。 */
function removeStagedOptional({ root, ids = [], fs = fsDefault, log = () => {} } = {}) {
  const removed = [];
  for (const id of ids) {
    const dest = path.join(root, id);
    if (!fs.existsSync(dest)) continue;
    fs.rmSync(dest, { recursive: true, force: true });
    removed.push(id);
    log(`clean  ${id}（可选插件临时副本已移除）`);
  }
  return removed;
}

module.exports = { stageOptionalPlugins, removeStagedOptional };
