/**
 * 插件包构建器（mode-pluginization P0）。
 *
 * 把 build/plugins.catalog.json 里的一个插件构建成统一的"插件包"目录：
 *   <out>/<id>/
 *     manifest.json       # 从插件源码的 manifest 导出常量提取（经 esbuild 打包临时入口动态 import）
 *     backend/index.js    # esbuild 打包的后端入口（bare import 全部 external，靠目录布局上溯解析）
 *     frontend/…          # vite lib 打包的前端 bundle（--with-frontend；P1 起随视图迁移启用）
 *     assets/…            # 皮肤壁纸等静态资源（catalog.assetsDir）
 *
 * 关键机制：
 *  · `*host-bridge.js` 的 import 在打包时重定向到 host-shims/__server-host__.mjs（读
 *    globalThis.__YZ_SERVER_HOST__，由服务端 injectServerHostBridge 注入）——源码形态则
 *    直接解析 apps/server/src/host-bridge.ts，两种形态共享同一份桥面。
 *  · packages:'external'：node 内置与 npm 依赖不打进插件包，运行时由 PLUGINS_DIR 目录布局
 *    上溯解析到 resources/server/node_modules（原生依赖零复制）。
 *
 * 用法:
 *   node scripts/build-plugins.mjs --id=git-explorer
 *   node scripts/build-plugins.mjs --id=skins
 *   node scripts/build-plugins.mjs --all
 *   选项: --out=<dir>（默认 apps/server/plugins/build）  --with-frontend（P1 起用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'build', 'plugins.catalog.json');

function parseArgs(argv) {
  const args = { out: path.join(REPO_ROOT, 'apps', 'server', 'plugins', 'build'), withFrontend: false, ids: [] };
  for (const a of argv) {
    if (a.startsWith('--id=')) args.ids.push(a.slice(5));
    else if (a === '--all') args.all = true;
    else if (a.startsWith('--out=')) args.out = path.resolve(a.slice(6));
    else if (a === '--with-frontend') args.withFrontend = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

async function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

/** host-bridge import 重定向插件：宿主单例模块 → 静态 shim（读 globalThis.__YZ_SERVER_HOST__）。
 *  ★ 宿主边界硬闸（2026-10-25 P3）：不止 host-bridge.js —— db/state/plugin-audit/logger/
 *    crypto/path-guard/exec-cmd/git 这些宿主单例的**任何**导入形态（含动态 import()、
 *    经由插件自有 service 转发，如 sec-experience-gate→db）一律重定向到 shim。
 *    漏网的新宿主依赖（shim 未导出的名字）会在构建期报 "No matching export" —— 强制
 *    显式扩桥，而不是静默把宿主单例复制进插件包（第二个 SQLite 实例那类事故）。 */
function hostBridgeRewritePlugin(shimPath) {
  const REPO = path.resolve(path.dirname(DESKTOP_DIR), '..');
  const SERVER_SRC = path.join(REPO, 'apps', 'server', 'src');
  const HOST_MODULES = [
    'db', 'state',
    'services/plugin-audit', 'services/logger', 'services/git', 'services/path-guard', 'services/exec-cmd',
    'utils/crypto',
    'host-bridge',
  ].map((rel) => path.join(SERVER_SRC, ...rel.split('/')).replace(/\.(js|ts)$/, '').replace(/\\/g, '/'));
  const HOST_SET = new Set(HOST_MODULES);
  const norm = (p) => p.replace(/\.(js|ts)$/, '').replace(/\\/g, '/');

  return {
    name: 'yz-host-bridge-rewrite',
    setup(build) {
      build.onResolve({ filter: /\.(js|ts)$/ }, (args) => {
        if (!args.path.startsWith('.') || !args.importer) return null;
        const resolved = norm(path.resolve(path.dirname(args.importer), args.path));
        if (HOST_SET.has(resolved)) return { path: shimPath };
        return null;
      });
    },
  };
}

/** 提取 manifest：临时入口 re-export manifest 常量 → esbuild bundle → 动态 import 求值 */
async function extractManifest(absBackendEntry, manifestExport, tmpDir) {
  const esbuild = require('esbuild');
  const stub = path.join(tmpDir, `__manifest-stub-${Date.now()}.mjs`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    stub,
    `import { ${manifestExport} as __m } from ${JSON.stringify(absBackendEntry.replace(/\\/g, '/'))};\nexport default __m;\n`,
    'utf8',
  );
  const outFile = stub.replace(/\.mjs$/, '.bundle.mjs');
  await esbuild.build({
    entryPoints: [stub],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    sourcemap: false,
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outFile).href);
  fs.rmSync(stub, { force: true });
  fs.rmSync(outFile, { force: true });
  return mod.default;
}

/** 写 manifest.json：单清单原样；多清单（skins 的 27 套皮肤）包一层 multi */
function writeManifest(pkgDir, id, manifestValue) {
  const value = Array.isArray(manifestValue)
    ? { multi: true, count: manifestValue.length, manifests: manifestValue }
    : manifestValue;
  const file = path.join(pkgDir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return file;
}

/** 后端 bundle：bare import 全 external；host-bridge 重定向到 shim。
 *  ★ 入口包装：插件源文件是"清单 + 模块"的具名导出（gitExplorerModule 等），
 *    而装载器约定 default 导出 PluginModule —— 打包时套一层薄入口自动挑出
 *    含 activate 的导出作为 default（无 activate 的声明式插件回落 default/命名空间）。 */
async function buildBackend(absBackendEntry, pkgDir, serverShimPath, tmpDir) {
  const esbuild = require('esbuild');
  const outfile = path.join(pkgDir, 'backend', 'index.js');
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  const wrapper = path.join(tmpDir, `__backend-entry-${path.basename(pkgDir)}-${Date.now()}.mjs`);
  fs.writeFileSync(
    wrapper,
    `import * as __m from ${JSON.stringify(absBackendEntry.replace(/\\/g, '/'))};\n` +
      `const __pick = Object.values(__m).find((v) => v && typeof v.activate === 'function');\n` +
      `export default __pick ?? __m.default ?? __m;\n`,
    'utf8',
  );
  try {
    await esbuild.build({
      entryPoints: [wrapper],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      packages: 'external',
      plugins: [hostBridgeRewritePlugin(serverShimPath)],
      sourcemap: false,
      minify: false,
      legalComments: 'none',
      logLevel: 'warning',
    });
  } finally {
    fs.rmSync(wrapper, { force: true });
  }
  return outfile;
}

/** 前端 bundle（P1 起随视图迁移启用；视图 import 改走桥之前打出的包会复制 store 代码，勿分发） */
async function buildFrontend(entry, pkgDir, tempDir) {
  const viteBuild = (await import('vite')).build;
  const vue = (await import('@vitejs/plugin-vue')).default;
  const sharedPaths = {
    vue: 'yz://shared/vue.mjs',
    'vue-router': 'yz://shared/vueRouter.mjs',
    pinia: 'yz://shared/pinia.mjs',
    'element-plus': 'yz://shared/elementPlus.mjs',
    '@element-plus/icons-vue': 'yz://shared/elementPlusIcons.mjs',
  };
  const externals = Object.keys(sharedPaths);
  const entryFile = path.join(tempDir, `__frontend-entry-${path.basename(pkgDir)}.mjs`);
  const viewNames = entry.frontendViews.filter((v) => v.endsWith('.vue'));
  fs.writeFileSync(
    entryFile,
    viewNames
      .map((v, i) => `import View${i} from ${JSON.stringify(path.join(REPO_ROOT, 'packages', 'ui', 'src', v).replace(/\\/g, '/'))};`)
      .join('\n') +
      `\nexport default { views: { ${viewNames.map((v, i) => `${JSON.stringify(v)}: View${i}`).join(', ')} } };\n`,
    'utf8',
  );
  await viteBuild({
    configFile: false,
    root: path.join(REPO_ROOT, 'packages', 'ui'),
    logLevel: 'warn',
    plugins: [vue()],
    resolve: {
      alias: {
        '@yan-zhi/ui': path.join(REPO_ROOT, 'packages', 'ui', 'src'),
        '@yan-zhi/core': path.join(REPO_ROOT, 'packages', 'core', 'src'),
        '@yan-zhi/shared': path.join(REPO_ROOT, 'packages', 'shared', 'src'),
      },
    },
    build: {
      outDir: path.join(pkgDir, 'frontend'),
      emptyOutDir: true,
      target: 'es2022',
      minify: false,
      rollupOptions: {
        external: (id) => externals.includes(id),
        output: {
          entryFileNames: 'index.mjs',
          chunkFileNames: '[name].mjs',
          assetFileNames: '[name][extname]',
          paths: sharedPaths,
        },
      },
    },
  });
  return path.join(pkgDir, 'frontend', 'index.mjs');
}

/** 组包单个插件。返回构建摘要。 */
async function buildOne(catalog, id, opts, serverShimPath) {
  const entry = catalog.plugins[id];
  if (!entry) throw new Error(`plugins.catalog.json 无此插件: ${id}`);
  const pkgDir = path.join(opts.out, id);
  fs.rmSync(pkgDir, { recursive: true, force: true });
  fs.mkdirSync(pkgDir, { recursive: true });

  const summary = { id, backend: null, frontend: null, assets: null, manifest: null };

  if (entry.backendEntry && entry.manifestExport) {
    const absBackendEntry = path.join(REPO_ROOT, entry.backendEntry);
    const manifestValue = await extractManifest(absBackendEntry, entry.manifestExport, opts.out);
    summary.manifest = writeManifest(pkgDir, id, manifestValue);
    if (entry.backendNoop) {
      // 纯声明式插件（skins 等 27 套皮肤）：数据全在 manifest.json，入口只补 activate 空实现
      // —— 打 skins.ts 本体会把 getPluginManager 等宿主链拉进包，没有必要。
      const outfile = path.join(pkgDir, 'backend', 'index.js');
      fs.mkdirSync(path.dirname(outfile), { recursive: true });
      fs.writeFileSync(outfile, '// 声明式插件：contributes 全在 manifest.json，入口为空实现\nexport default { async activate() {} };\n', 'utf8');
      summary.backend = outfile;
    } else {
      summary.backend = await buildBackend(absBackendEntry, pkgDir, serverShimPath, opts.out);
    }
  } else if (entry.backendEntry) {
    throw new Error(`插件 ${id} 缺 manifestExport（catalog 需声明 manifest 常量导出名）`);
  }

  if (opts.withFrontend && (entry.frontendViews || []).length) {
    summary.frontend = await buildFrontend(entry, pkgDir, opts.out);
  }

  if (entry.assetsDir) {
    const srcAssets = path.join(REPO_ROOT, entry.assetsDir);
    const dst = path.join(pkgDir, 'assets');
    if (fs.existsSync(srcAssets)) {
      fs.cpSync(srcAssets, dst, { recursive: true });
      summary.assets = dst;
    }
  }

  console.log(
    `[build-plugins] ${id} ✓  manifest=${!!summary.manifest} backend=${summary.backend ? path.relative(opts.out, summary.backend) : '-'} ` +
      `frontend=${summary.frontend ? path.relative(opts.out, summary.frontend) : '-'} assets=${summary.assets ? '✓' : '-'}`,
  );
  return summary;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('用法: node scripts/build-plugins.mjs --id=<id> | --all [--out=<dir>] [--with-frontend]');
    return;
  }
  const catalog = await loadCatalog();
  const ids = args.all ? Object.keys(catalog.plugins) : args.ids;
  if (!ids.length) throw new Error('未指定插件：--id=<id> 或 --all');

  // shim 就绪（幂等，缺则现场生成）
  const { generateHostShims, shimsDir } = await import('./lib/host-shims.mjs');
  const shims = await generateHostShims(DESKTOP_DIR);
  const serverShimPath = path.join(shimsDir(DESKTOP_DIR), '__server-host__.mjs');
  if (!fs.existsSync(serverShimPath)) throw new Error('server-host shim 生成失败: ' + serverShimPath);

  fs.mkdirSync(args.out, { recursive: true });
  const results = [];
  for (const id of ids) {
    results.push(await buildOne(catalog, id, args, serverShimPath));
  }
  console.log(`[build-plugins] 完成 ${results.length} 个插件 → ${args.out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
