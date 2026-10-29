/**
 * 可选插件清单（plugins/optional/<目录>/manifest.json）。
 *
 * 可选插件 = **可后装**的插件：源码手写（不走 catalog 的构建器），默认不随安装包分发；
 * 用户点了名（`--plugins=desktop-manager`）才在打包前原样拷进
 * `apps/server/plugins/builtin/<id>/`，与内置插件走同一条裁剪/拷贝链路。
 *
 * 为什么不塞进 build/plugins.catalog.json：catalog 是**构建器**的输入（backendEntry /
 * manifestExport / frontendViews 全部由它驱动 esbuild 构建）。可选插件没有构建步骤，
 * 混进去会让 build-plugins 去"构建"一个没有入口的插件，还把默认全量撑大。
 *
 * 本文件只读文件系统，不做选择集判断（规则在 scripts/lib/plugin-selection.cjs）。
 */
const fsDefault = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** 可选插件根目录（仓库根 plugins/optional）。 */
function optionalPluginsRoot(repoRoot = REPO_ROOT) {
  return path.join(repoRoot, 'plugins', 'optional');
}

/**
 * 扫描可选插件。
 * 没有 manifest.json / 清单坏掉的目录直接跳过 —— 它不是（或还不算）可选插件，
 * 不该阻断整条打包链。
 *
 * @returns {Array<{id:string, kind:'optional', optional:true, label:string, version:string,
 *                  desc:string, dir:string, relDir:string}>}
 */
function loadOptionalPlugins({ repoRoot = REPO_ROOT, fs = fsDefault } = {}) {
  const dir = optionalPluginsRoot(repoRoot);
  let names = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }

  const out = [];
  for (const name of names) {
    const pluginDir = path.join(dir, name);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!manifest || typeof manifest !== 'object') continue;
    const id = typeof manifest.id === 'string' && manifest.id ? manifest.id : name;
    out.push({
      id,
      kind: 'optional',
      optional: true,
      label: typeof manifest.name === 'string' && manifest.name ? manifest.name : id,
      version: typeof manifest.version === 'string' ? manifest.version : '',
      desc: typeof manifest.description === 'string' ? manifest.description : '',
      dir: pluginDir,
      relDir: `plugins/optional/${name}`,
    });
  }
  return out;
}

module.exports = { REPO_ROOT, optionalPluginsRoot, loadOptionalPlugins };
