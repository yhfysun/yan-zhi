#!/usr/bin/env node
/**
 * 单独打包一个插件为 .yzp（P6）。
 *
 * 做的事只有三件：读 `apps/server/plugins/builtin/<id>/` → 校验 manifest → zip 落盘。
 * ★ **不另建构建路径**：分发产物 = 内置产物本身（见 design §1）。
 *   插件包要先 `build-plugins.mjs --id=<id> --with-frontend` 生成，本脚本只负责打包。
 * ★ 纯逻辑（目录遍历/排除规则/清单校验/文件名）在 `scripts/lib/package-plugin.cjs`，
 *   这里只解析参数、调 zip、写盘、打印 sha256。
 *
 * 用法：
 *   node scripts/package-plugin.cjs --id=git-explorer
 *   node scripts/package-plugin.cjs --id=skins --out=D:/pkg
 *   node scripts/package-plugin.cjs --help
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const {
  preparePluginPackage,
  archiveName,
  sortForArchive,
  PluginPackageError,
} = require('./lib/package-plugin.cjs');

const ROOT = path.resolve(__dirname, '..');
const BUILTIN_DIR = path.join(ROOT, 'apps', 'server', 'plugins', 'builtin');
const DEFAULT_OUT = path.join(ROOT, 'dist-plugins');

// 根 package.json 不依赖 adm-zip（只有 apps/server / apps/desktop 有）。
// 为一条打包命令往根加依赖会动锁文件与 node_modules，故复用 server 已装的同一份。
const serverRequire = createRequire(path.join(ROOT, 'apps', 'server', 'package.json'));

const USAGE = `用法: node scripts/package-plugin.cjs --id=<插件id> [--out=<目录>]

  --id=<id>     必填。内置插件 id（apps/server/plugins/builtin/<id>/）
  --out=<dir>   输出目录，默认 dist-plugins/
  --help        显示本帮助

产物: <out>/<id>-<version>.yzp（与内置产物同源，可直接在「插件管理」页安装）
`;

function parseArgs(argv) {
  const opts = { id: '', out: DEFAULT_OUT, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--id=')) opts.id = arg.slice('--id='.length).trim();
    else if (arg.startsWith('--out=')) opts.out = path.resolve(ROOT, arg.slice('--out='.length).trim());
    else throw new PluginPackageError(`未知参数: ${arg}（--help 查看用法）`);
  }
  return opts;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!opts.id) {
    console.error('✗ 缺少 --id=<插件id>');
    process.stderr.write(USAGE);
    return 2;
  }

  const pluginDir = path.join(BUILTIN_DIR, opts.id);
  let pkg;
  try {
    pkg = preparePluginPackage({ pluginDir, id: opts.id });
  } catch (e) {
    console.error(`✗ ${e instanceof PluginPackageError ? e.message : e && e.stack}`);
    return 1;
  }

  const AdmZip = serverRequire('adm-zip');
  const zip = new AdmZip();
  for (const f of sortForArchive(pkg.files)) {
    zip.addLocalFile(path.join(pluginDir, f.path), path.posix.dirname(f.path) === '.' ? '' : path.posix.dirname(f.path), path.posix.basename(f.path));
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const outFile = path.join(opts.out, archiveName(pkg.id, pkg.version));
  zip.writeZip(outFile);

  const size = fs.statSync(outFile).size;
  const digest = sha256File(outFile);

  console.log(`✓ ${archiveName(pkg.id, pkg.version)}`);
  if (pkg.kind === 'multi') {
    if (!pkg.packageId) {
      console.warn('  ⚠ 多清单包缺少包 id（manifest.json 顶层无 id）：安装端会拒绝，请先用当前构建器重新生成');
    } else {
      console.log(`  多清单包: packageId=${pkg.packageId}（安装后共 ${pkg.ids.length} 个插件）`);
    }
  }
  console.log(`  来源: ${path.relative(ROOT, pluginDir) || pluginDir}（${pkg.kind === 'multi' ? `多清单 ${pkg.ids.length} 条` : `id=${pkg.ids[0]}`}）`);
  console.log(`  输出: ${outFile}`);
  console.log(`  大小: ${humanSize(size)}（未压缩 ${humanSize(pkg.totalBytes)}，${pkg.files.length} 个文件）`);
  console.log(`  sha256: ${digest}`);
  console.log('  文件清单:');
  for (const f of sortForArchive(pkg.files)) {
    console.log(`    ${f.path}  ${humanSize(f.size)}`);
  }
  return 0;
}

process.exitCode = main();
