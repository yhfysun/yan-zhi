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
 *   node scripts/build-plugins.mjs --plugins=office-core,skins,dev-mode   # P5：按选择集构建
 *   node scripts/build-plugins.mjs --plugins=mode                         # 分组关键字（all/mode/feature/skins）
 *   选项: --out=<dir>（默认 apps/server/plugins/build）  --with-frontend（P1 起用）
 *
 * ★ --plugins（P5）：选择集解析走 scripts/lib/plugin-selection.cjs（office 锁定 / requires 闭包 /
 *   非法 id 报错），构建完成后写 build/build-plugins.json 记录本次 included / excluded。
 *   **未选插件的目录原样保留**（构建器只重建选中的，绝不删除未选 —— 删除是可恢复 prune 的活，
 *   由 stage-plugins.mjs 负责）。--id 是单插件调试入口，不写选择集文件（避免覆盖打包选择）。
 *   临时入口文件落在 `<out>/.yz-tmp/`（bare import 要靠 out 上溯解析 node_modules），
 *   构建结束整目录删除 —— 不落在产物根，否则会被原样拷进安装包。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'build', 'plugins.catalog.json');
const SELECTION_PATH = path.join(REPO_ROOT, 'build', 'build-plugins.json');
const UI_SRC = path.join(REPO_ROOT, 'packages', 'ui', 'src');
const { resolvePluginSelection } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'plugin-selection.cjs'));

/** 解析 ui 源码里的相对 import（无扩展名 / index）/ 返回绝对文件或 null */
function resolveUiModule(absBase) {
  for (const cand of [absBase, `${absBase}.ts`, `${absBase}.tsx`, path.join(absBase, 'index.ts')]) {
    try {
      if (fs.statSync(cand).isFile()) return cand;
    } catch {
      /* 继续试下一个 */
    }
  }
  return null;
}

/**
 * 宿主模块的真实命名导出面（用于生成 shim）。用 esbuild 打一遍该模块拿 metafile.exports：
 *  · `.vue` 与工作区包视为 external（我们只要该模块自身的导出清单，不解析组件树）；
 *  · 拿不到（exports 为空）时回落到源码正则 —— 宁可多导出，也不让插件 import undefined。
 */
async function hostModuleExportNames(esbuild, absFile) {
  try {
    const r = await esbuild.build({
      entryPoints: [absFile],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      packages: 'external',
      external: [...WORKSPACE_PACKAGES],
      logLevel: 'silent',
      plugins: [
        {
          name: 'yz-skip-vue',
          setup(build) {
            build.onResolve({ filter: /\.vue(\?.*)?$/ }, (args) => ({ path: args.path, external: true }));
          },
        },
      ],
    });
    const out = Object.keys(r.metafile.outputs).find((k) => /\.(m?js)$/.test(k));
    const names = out ? r.metafile.outputs[out].exports || [] : [];
    if (names.length) return names;
  } catch {
    /* 落到源码正则 */
  }
  const src = fs.readFileSync(absFile, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|async\s+function|class|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n && !n.startsWith('type ')) names.add(n);
    }
  }
  return [...names];
}

function parseArgs(argv) {
  const args = {
    out: path.join(REPO_ROOT, 'apps', 'server', 'plugins', 'build'),
    withFrontend: false,
    ids: [],
    plugins: null,
    modes: null,
  };
  for (const a of argv) {
    if (a.startsWith('--id=')) args.ids.push(a.slice(5));
    else if (a === '--all') args.all = true;
    else if (a.startsWith('--out=')) args.out = path.resolve(a.slice(6));
    else if (a === '--with-frontend') args.withFrontend = true;
    else if (a.startsWith('--plugins=')) args.plugins = a.slice('--plugins='.length);
    else if (a.startsWith('--modes=')) args.modes = a.slice('--modes='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  // 临时入口文件放产物目录下的隐藏子目录：**不能放系统临时目录** —— 入口 stub 用
  // packages:'external' 打，bare import（simple-git 等）要靠目录上溯解析到 server 的
  // node_modules，放到系统 temp 就解析不到。放在 out 内的隐藏目录可随 out 解析，
  // 且 finally 里整目录删除（绝不落在产物根，否则会被 extraResources 拷进安装包）。
  args.tmp = path.join(args.out, '.yz-tmp');
  return args;
}

async function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

/** host-bridge import 重定向插件：宿主单例模块 → 静态 shim（读 globalThis.__YZ_SERVER_HOST__）。
 *  ★ 宿主边界硬闸（2026-10-25 P3，2026-10-26 P4 扩面）：不止 host-bridge.js —— db/state/
 *    plugin-audit/logger/crypto/path-guard/exec-cmd/git/artifact-dir 这些
 *    宿主单例的**任何**导入形态（含动态 import()、经由插件自有 service 转发，如 sec-experience-gate→db）一律重定向到 shim。
 *    漏网的新宿主依赖（shim 未导出的名字）会在构建期报 "No matching export" —— 强制
 *    显式扩桥，而不是静默把宿主单例复制进插件包（第二个 SQLite 实例那类事故）。 */
function hostBridgeRewritePlugin(shimPath) {
  const REPO = path.resolve(path.dirname(DESKTOP_DIR), '..');
  const SERVER_SRC = path.join(REPO, 'apps', 'server', 'src');
  const HOST_MODULES = [
    'db', 'state',
    'services/plugin-audit', 'services/logger', 'services/git', 'services/path-guard', 'services/exec-cmd',
    'services/artifact-dir',
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

/** 工作区源码包（@yan-zhi/*）必须留在运行时解析，不许打进插件包。
 *  ★ 实报（2026-10-25）：esbuild 会应用 tsconfig.base.json 的 paths（@yan-zhi/core →
 *    packages/core/src），解析后变成普通相对路径 ⇒ `packages:'external'` **拦不住**
 *    ⇒ core 整包被打进插件 bundle（远控包里有 83 个 core 模块）⇒ 插件拿到**第二个**
 *    core 实例 ⇒ `getPluginManager()` 读的是自己那份空的 `_mgr` ⇒
 *    /api/plugin/remote-control/hostkey 500「PluginManager 未初始化，请先传入 adapter」
 *    （现象：插件明明已启用，前端却报"插件未启用"、二维码不渲染）。
 *    必须在 external 里按**原始 specifier**显式声明（external 先于路径解析生效）。 */
const WORKSPACE_PACKAGES = ['@yan-zhi/core', '@yan-zhi/shared', '@yan-zhi/ui'];

/** 构建期硬闸：产物里出现内联的工作区源码即失败 —— 运行期静默多实例比构建期报错贵得多。 */
function assertNoBundledWorkspaceSources(outfile) {
  const src = fs.readFileSync(outfile, 'utf8');
  const hits = WORKSPACE_PACKAGES
    .map((p) => ({ p, n: src.split(`// ${p.replace('@yan-zhi/', 'packages/')}/src`).length - 1 }))
    .filter((h) => h.n > 0);
  if (!hits.length) return;
  throw new Error(
    `[build-plugins] ${path.basename(path.dirname(path.dirname(outfile)))}：工作区源码被打包进插件包（` +
      hits.map((h) => `${h.p} ×${h.n}`).join('、') +
      `）—— 会在插件里复制出第二份宿主单例。请让它走 ${JSON.stringify(WORKSPACE_PACKAGES)} 外部化或宿主桥。`,
  );
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
      // ★ 工作区包按原始 specifier 外部化（见 WORKSPACE_PACKAGES 注释：paths 会让
      //   packages:'external' 失效，必须显式声明，否则插件里会多出一份 core 单例）
      external: [...WORKSPACE_PACKAGES],
      plugins: [hostBridgeRewritePlugin(serverShimPath)],
      sourcemap: false,
      minify: false,
      legalComments: 'none',
      logLevel: 'warning',
    });
  } finally {
    fs.rmSync(wrapper, { force: true });
  }
  assertNoBundledWorkspaceSources(outfile);
  return outfile;
}

/** 前端 bundle（P4：视图已 bundle 化；宿主内部模块外置为 yz://shared/host/*）
 *
 * ★ 为什么要把 stores/composables/api/utils 外置（而不是打进包）：
 *   这些模块里有模块级单例（stores/mode 的 activeMode/leads、api/client 的 API_BASE 等）。
 *   打进插件包 = 复制一份 ⇒ 插件里的 activeMode 与宿主是两个 ref，切模式对不上（静默错乱）。
 *   外置后 shim 从 `window.__YZ_HOST__.mods[key]` 取回宿主真实模块实例，全局单例不破。
 *
 * ★ 外置清单在构建中**动态收集**（resolveId 命中即记），构建完生成 shim —— 视图 import
 *   什么就生成什么，不会出现"宿主加了模块但忘了登记 shim"。
 */
async function buildFrontend(entry, pkgDir, tempDir) {
  const viteBuild = (await import('vite')).build;
  const vue = (await import('@vitejs/plugin-vue')).default;
  const { isHostModuleRel, hostModuleKey, generateHostModuleShims } = await import('./lib/host-shims.mjs');
  const sharedPaths = {
    vue: 'yz://shared/vue.mjs',
    'vue-router': 'yz://shared/vueRouter.mjs',
    pinia: 'yz://shared/pinia.mjs',
    'element-plus': 'yz://shared/elementPlus.mjs',
    '@element-plus/icons-vue': 'yz://shared/elementPlusIcons.mjs',
  };
  const externals = Object.keys(sharedPaths);
  const hostModules = new Set();
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
    plugins: [
      vue(),
      {
        // 宿主内部模块外置：相对 import → yz://shared/host/<key>.mjs（external，不参与打包）
        name: 'yz-host-modules',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer || !source.startsWith('.')) return null;
          const cleanImporter = importer.split('?')[0];
          const file = resolveUiModule(path.resolve(path.dirname(cleanImporter), source));
          if (!file) return null;
          const rel = path.relative(UI_SRC, file).replace(/\\/g, '/');
          if (!isHostModuleRel(rel)) return null;
          const key = hostModuleKey(rel);
          hostModules.add(key);
          return { id: `yz://shared/host/${key}.mjs`, external: true };
        },
      },
    ],
    resolve: {
      // ★ 扩展名优先 .ts：工作区源码目录里残留过编译产物（packages/shared/src/*.js），
      //   Vite 默认把 .js 排在 .ts 前面 —— 命中陈旧 .js 会让新导出（如 findProviderPreset）消失。
      extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        '@yan-zhi/ui': path.join(REPO_ROOT, 'packages', 'ui', 'src'),
        '@yan-zhi/core': path.join(REPO_ROOT, 'packages', 'core', 'src'),
        '@yan-zhi/shared': path.join(REPO_ROOT, 'packages', 'shared', 'src'),
      },
    },
    build: {
      // ★ lib 模式（此前未配 lib，vite 会去找 index.html → 构建直接失败）
      lib: { entry: entryFile, formats: ['es'], fileName: () => 'index.mjs' },
      outDir: path.join(pkgDir, 'frontend'),
      emptyOutDir: true,
      target: 'es2022',
      minify: false,
      rollupOptions: {
        external: (id) => externals.includes(id) || id.startsWith('yz://shared/'),
        output: {
          chunkFileNames: '[name].mjs',
          assetFileNames: '[name][extname]',
          paths: sharedPaths,
        },
      },
    },
  });

  // 外置出来的宿主模块 → shim（导出面按真实模块计算）
  const esbuild = require('esbuild');
  const modules = [];
  for (const key of [...hostModules].sort()) {
    const abs = resolveUiModule(path.join(UI_SRC, key));
    if (!abs) throw new Error(`[build-plugins] 宿主模块外置后找不到源码: ${key}`);
    modules.push({ key, names: await hostModuleExportNames(esbuild, abs) });
  }
  if (modules.length) {
    const { written } = generateHostModuleShims(DESKTOP_DIR, modules);
    console.log(`[build-plugins]   宿主模块外置 ${written.length} 个 → yz://shared/host/*`);
  }
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
    const manifestValue = await extractManifest(absBackendEntry, entry.manifestExport, opts.tmp);
    summary.manifest = writeManifest(pkgDir, id, manifestValue);
    if (entry.backendNoop) {
      // 纯声明式插件（skins 等 27 套皮肤）：数据全在 manifest.json，入口只补 activate 空实现
      // —— 打 skins.ts 本体会把 getPluginManager 等宿主链拉进包，没有必要。
      const outfile = path.join(pkgDir, 'backend', 'index.js');
      fs.mkdirSync(path.dirname(outfile), { recursive: true });
      fs.writeFileSync(outfile, '// 声明式插件：contributes 全在 manifest.json，入口为空实现\nexport default { async activate() {} };\n', 'utf8');
      summary.backend = outfile;
    } else {
      summary.backend = await buildBackend(absBackendEntry, pkgDir, serverShimPath, opts.tmp);
    }
  } else if (entry.backendEntry) {
    throw new Error(`插件 ${id} 缺 manifestExport（catalog 需声明 manifest 常量导出名）`);
  }

  // 前端 bundle：随视图迁移逐插件启用（catalog.frontendBundle=true），或显式 --id 指定时构建。
  // ★ 不默认全量：还没迁移的插件视图直接打 bundle 会把宿主模块复制进包（状态双份），
  //   所以"打包时全量构建"只覆盖已标 frontendBundle 的插件。
  const wantFrontend = opts.withFrontend && (entry.frontendBundle || opts.ids.includes(id));
  if (wantFrontend && (entry.frontendViews || []).length) {
    summary.frontend = await buildFrontend(entry, pkgDir, opts.tmp);
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

/** 解析本次要构建的插件 id（以及选择集元数据）。
 *
 * ★ 三种入口的语义差别（写错就是"包名说精简、内容全量"）：
 *   · --plugins / --modes：**选择集**，office 恒在 + requires 闭包，命中结果写 build-plugins.json；
 *   · --id：单插件调试，不写选择集文件（否则会覆盖打包选择，断言读到错误基准）；
 *   · --all：全量，也写选择集（included=全部、excluded=[]），让下游断言有统一真相源。
 */
function resolveBuildIds(catalog, args) {
  if (args.plugins || args.modes) {
    if (args.plugins && args.modes) {
      console.warn('[build-plugins] --plugins 与 --modes 同时给出：按约定以 --plugins 为准');
    }
    const selection = resolvePluginSelection({ catalog, plugins: args.plugins, modes: args.modes });
    return { ids: selection.ids, selection };
  }
  if (args.ids.length && !args.all) return { ids: args.ids, selection: null };
  const all = Object.keys(catalog.plugins);
  return { ids: all, selection: { ids: all, excluded: [], source: 'all' } };
}

function writeSelectionFile(selection, outDir) {
  const payload = {
    included: selection.ids,
    excluded: selection.excluded,
    source: selection.source,
    out: path.relative(REPO_ROOT, outDir).replace(/\\/g, '/'),
    builtAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(SELECTION_PATH), { recursive: true });
  fs.writeFileSync(SELECTION_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return SELECTION_PATH;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      '用法: node scripts/build-plugins.mjs --id=<id> | --all | --plugins=<csv|all|mode|feature|skins> ' +
        '[--modes=<mode,csv>] [--out=<dir>] [--with-frontend]',
    );
    return;
  }
  try {
    const catalog = await loadCatalog();
    const { ids, selection } = resolveBuildIds(catalog, args);
    if (!ids.length) throw new Error('未指定插件：--id=<id> / --all / --plugins=<选择集>');

    // shim 就绪（幂等，缺则现场生成）
    const { generateHostShims, shimsDir } = await import('./lib/host-shims.mjs');
    const shims = await generateHostShims(DESKTOP_DIR);
    const serverShimPath = path.join(shimsDir(DESKTOP_DIR), '__server-host__.mjs');
    if (!fs.existsSync(serverShimPath)) throw new Error('server-host shim 生成失败: ' + serverShimPath);

    fs.mkdirSync(args.out, { recursive: true });
    fs.mkdirSync(args.tmp, { recursive: true });
    const results = [];
    for (const id of ids) {
      results.push(await buildOne(catalog, id, args, serverShimPath));
    }
    if (selection) {
      const file = writeSelectionFile(selection, args.out);
      const excluded = selection.excluded.length ? selection.excluded.join(', ') : '(无)';
      console.log(`[build-plugins] 选择集 → ${path.relative(REPO_ROOT, file)}  来源=${selection.source}`);
      console.log(`[build-plugins] 未选（目录保留，由 stage-plugins prune 移出）: ${excluded}`);
    }
    console.log(`[build-plugins] 完成 ${results.length} 个插件 → ${args.out}`);
  } finally {
    // 临时入口文件（manifest 桩 / 后端包装入口 / 前端 lib 入口）在系统临时目录，
    // 不能留在产物目录 —— 那会被 extraResources 原样拷进安装包。
    fs.rmSync(args.tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
