#!/usr/bin/env node
/**
 * 一次构建三档包（lite / basic / pro），三档**统一输出到同一个目录**。
 *
 * 为什么要单独一个脚本：三档共用同一份源码与同一份 yml，差异只在
 * `edition.json`（构建档 + 预置码档）与产物名后缀。逐个手跑三条命令不仅繁琐，
 * 还容易漏跑某一步导致「edition.json 还停在上一次的档位」——
 * 那会打出产物名与实际档位不一致的包（后缀写 -lite、里面却是 basic），
 * 是最难查的一类错。这里串行跑完整链路，每档之间强制重写 edition.json。
 *
 * ★★ 为什么必须「逐档重编」—— 这是本脚本存在的根本原因，也是最反直觉的一点：
 *   `edition.json` 被登记在 yml 的 `files:` 段里，会被**打进 app.asar 内部**；
 *   main.cjs 用 `path.join(__dirname, 'edition.json')` 读它（__dirname 即 asar 内路径）。
 *   因此档位是**编译期固化的**，不是运行时外壳读配置。
 *   想「编一次源码 → 复用作三个档位壳」在当前架构下**做不到**：
 *   逐个拷贝改 app.asar 需要重写 asar 打包/校验/签名，比直接重跑一遍
 *   electron-builder（约 3 分钟/档）更慢也更脆。
 *   ⇒ 结论：三档 = 三次完整 electron-builder 调用，别无捷径。
 *
 * 为什么串行而不是并行：三档都写同一个 `edition.json` 与同一个输出目录，
 * 并行会互相覆盖。加锁不如串行简单可靠。
 *
 * ★ 三档各自独立目录（dist-release/desktop/<档>/<版本>/）：安装包名带档位后缀
 *   （-lite / -basic / -pro），目录与目录之间互不复用任何文件；
 *   同档重跑时会被复用/需清空的只有 electron-builder 的 appOutDir（`win-unpacked/`），
 *   所以每档构建前显式清掉它。
 *
 * ★ 清理失败怎么办（残留进程 / 杀软扫描持有 app.asar → EBUSY）：**明确报错并给出处置步骤**，
 *   不静默改用时间戳目录 —— 静默换目录会把产物散到多个目录，正是本脚本要避免的结果。
 *   每档天生写独立目录（dist-release/desktop/<档>/<版本>/），档与档互不干扰；
 *   同档重跑被旧产物锁住时，用 YZ_ALL_OUT_DIR 换产物根目录绕开。
 *
 * 用法：
 *   node scripts/build-all-editions.cjs              # 三档全出
 *   node scripts/build-all-editions.cjs pro          # 只出指定档（最常用）
 *   node scripts/build-all-editions.cjs lite pro     # 只出指定多档
 *   YZ_ALL_OUT_DIR=out-x node scripts/build-all-editions.cjs   # 换产物根目录（绕 EBUSY 锁）
 *
 * 产物目录（统一树，路径定义在 lib/pack-helpers.cjs，单一真相源）：
 *   dist-release/desktop/<档>/<版本>/    ← 每档独立目录，安装包与 win-unpacked/ 并列
 *   （版本取自 apps/desktop/package.json）
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ALL_EDITIONS,
  EDITION_CONFIG,
  EDITION_LABEL,
  DEFAULT_RELEASE_ROOT,
  checkOutputDirReady,
  clearAppOutDirs,
  parseEditionsArgv,
  outDirForEdition,
  resolvePkgVersion,
} = require('./lib/pack-helpers.cjs');

const { editions, separate, invalid } = parseEditionsArgv(process.argv.slice(2));

if (invalid.length) {
  console.error(`[build-all] 未知档位: ${invalid.join(', ')}（可选: ${ALL_EDITIONS.join(' / ')}）`);
  process.exit(1);
}

// ★ --separate 曾表示「每档写独立目录」；现在每档天生独立目录，该旗标只是向后兼容的 no-op。
if (separate) {
  console.log('[build-all] --separate 已是默认行为（每档写 dist-release/desktop/<档>/<版本>/），忽略。');
}

const desktopDir = path.join(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');

const CONFIG = EDITION_CONFIG;
const LABEL = EDITION_LABEL;

/**
 * 产物根目录（默认 dist-release/），可用 YZ_ALL_OUT_DIR 覆盖 ——
 * 用途：旧产物被句柄持有（EBUSY）清不掉时，换个根目录绕开，无需等锁释放。
 */
const OUT_ROOT = process.env.YZ_ALL_OUT_DIR || DEFAULT_RELEASE_ROOT;
/** 桌面版本号（apps/desktop/package.json），目录路径的 <版本> 段。 */
const DESKTOP_VERSION = resolvePkgVersion({ pkgPath: path.join(desktopDir, 'package.json') });

const rel = (p) => path.relative(repoRoot, p) || p;

function run(cmd, args, extraEnv) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(extraEnv || {}) },
  });
}

/** 清理上一档留下的 appOutDir；失败时明确报错并给出处置步骤（不静默换目录）。 */
function clearOutputDir(outDir) {
  const { removed, failed } = clearAppOutDirs(outDir);
  for (const p of removed) {
    console.log(`[build-all] 已清理 ${rel(p)}`);
  }
  if (!failed.length) return;

  const first = failed[0];
  console.error('');
  console.error('========================================================');
  console.error(`  ✗ 无法清理 ${rel(first.dir)}  （${first.code}）`);
  console.error('--------------------------------------------------------');
  console.error('  常见原因：');
  console.error('    · 言智应用仍在运行（请彻底退出，含托盘图标）');
  console.error('    · 杀毒软件正在扫描上一轮产物（实时防护持有 app.asar 句柄）');
  console.error('    · 另有构建进程在跑（同一输出目录不能并发构建）');
  console.error('  处置（任选其一）：');
  console.error('    1) 彻底退出言智与其它构建终端后重跑本脚本');
  console.error(`    2) 换产物根目录：YZ_ALL_OUT_DIR=${OUT_ROOT}-new node scripts/build-all-editions.cjs`);
  console.error('========================================================');
  console.error('');
  throw new Error(`清理失败: ${first.dir}`);
}

/**
 * 前置体检 + **内置 Python 运行时自动生成**。
 *
 * ★★ 2026-09-30 用户拍板「自动生成」：此前 `resources/python` / `python-tools` 缺失时
 *   只打警告、构建照常成功 → 成品静默少能力（`python_*` 工具回退系统 python，
 *   用户机器没装就直接不可用）。现在改为**缺失即自动生成**，不再静默降级：
 *     · `python-tools`（随包脚本，轻量）缺失 → 必生成；
 *     · `python`（解释器，~400MB）缺失 → 默认生成；
 *       网络不可达等无法生成时**明确报错**（而不是继续打出一个能力残缺的包）；
 *       确需跳过（如离线环境已有系统 Python）用 `YZ_SKIP_PYTHON_RUNTIME=1` 显式声明。
 *   ★ 生成失败**不静默**：这正对应 issues/打包前置资源缺失静默降级-20260919.md 的核心诉求。
 */
function preflight() {
  const pyDir = path.join(desktopDir, 'resources', 'python');
  const toolsDir = path.join(desktopDir, 'resources', 'python-tools');
  const hasPython = fs.existsSync(pyDir);
  const hasTools = fs.existsSync(toolsDir);

  if (!hasPython || !hasTools) {
    const skip = process.env.YZ_SKIP_PYTHON_RUNTIME === '1';
    if (skip) {
      console.warn('');
      console.warn('==================================================================');
      console.warn('  ⚠ 已按 YZ_SKIP_PYTHON_RUNTIME=1 **显式跳过**内置 Python 运行时');
      console.warn('    → 本次成品不含内置 Python，python 类工具将回退系统 python');
      console.warn('    （这是显式声明，非静默降级）');
      console.warn('==================================================================');
    } else {
      console.log('');
      console.log('==================================================================');
      console.log('  内置 Python 运行时缺失 → **自动生成**（首次约需下载 40MB + 装依赖）');
      console.log(`    · ${hasPython ? '✓ 解释器已存在' : '✗ 解释器缺失'}`);
      console.log(`    · ${hasTools ? '✓ 随包脚本已存在' : '✗ 随包脚本缺失'}`);
      console.log('  如需跳过（离线/自带系统 Python）: YZ_SKIP_PYTHON_RUNTIME=1 重新运行');
      console.log('==================================================================');
      // ★ 生成失败必须中断：否则会打出"看着成功、实则缺能力"的包（本 issue 的原始病灶）
      run(process.execPath, [path.join(repoRoot, 'scripts', 'build-python-runtime.mjs')]);
      console.log('  ✓ 内置 Python 运行时已生成');
    }
  }

  const warn = [];
  if (!fs.existsSync(path.join(repoRoot, 'assets', 'icons', 'icon.ico'))) {
    warn.push('assets/icons/icon.ico 不存在 → 安装包图标将退化为 Electron 默认图标。');
  }
  if (warn.length) {
    console.warn('');
    console.warn('========================================================');
    console.warn('  ⚠ 前置检查提示（不影响出包，但成品会缺相应能力）');
    console.warn('--------------------------------------------------------');
    for (const w of warn) console.warn('  · ' + w);
    console.warn('========================================================');
  }
}

// ① 开工前先探输出目录：被占用的 appOutDir 能提前几十秒发现，
//    不必等到 electron-builder 删文件时才炸（那时错误信息看不出是锁）。
const outDirFor = (edition) =>
  outDirForEdition(edition, { repoRoot, version: DESKTOP_VERSION, outRoot: OUT_ROOT });

console.log('=== [1/3] 检查输出目录可写性 ===');
for (const edition of editions) {
  const outDir = outDirFor(edition);
  const { ok, blockers } = checkOutputDirReady(outDir);
  if (!ok) {
    console.error('');
    console.error('========================================================');
    console.error(`  ✗ 输出目录里的旧产物无法清理（${blockers[0].code}）`);
    console.error(`    ${rel(blockers[0].dir)}`);
    console.error('--------------------------------------------------------');
    console.error('  常见原因：');
    console.error('    · 言智应用仍在运行（请彻底退出，含托盘图标）');
    console.error('    · 杀毒软件正在扫描上一轮产物（实时防护持有 app.asar 句柄）');
    console.error('    · 另有构建进程在跑（同一输出目录不能并发构建）');
    console.error('  处置（任选其一）：');
    console.error('    1) 彻底退出言智与其它构建终端后重跑本脚本');
    console.error(`    2) 换产物根目录：YZ_ALL_OUT_DIR=${OUT_ROOT}-new node scripts/build-all-editions.cjs`);
    console.error('========================================================');
    console.error('');
    process.exit(1);
  }
  console.log(`  ✓ ${rel(outDir)} 就绪`);
}

// ② 后端与前端只编一次：三档的**代码完全相同**（本轮不做按档裁剪）。
//    注意：这里「只编一次」省的是 tsc + vite（源码产物），
//    electron-builder 仍需**逐档各跑一次**（edition.json 打进 asar，档位是编译期固化的）。
console.log('\n=== [2/3] 编译后端与前端（源码产物共用，只跑一次）===');
preflight();
run('pnpm', ['--filter', '@yan-zhi/server', 'build']);
// 直接用包内 vite 可执行文件：不依赖 shell PATH，也不会像 npx 那样在受限网络下回源探测。
run(process.execPath, [path.join(desktopDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
run(process.execPath, ['./scripts/prepare-server-runtime.cjs']);
run(process.execPath, ['./scripts/clean-broken-symlinks.cjs']);

// ② 逐档打包：每档先重写 edition.json、清掉复用的 appOutDir，再交给 electron-builder
console.log(`\n=== [3/3] 逐档打包：${editions.join(' → ')} ===`);
console.log(`输出目录：${rel(path.resolve(repoRoot, OUT_ROOT, 'desktop'))}/<档>/${DESKTOP_VERSION}/（每档独立）`);

for (const edition of editions) {
  console.log(`\n──────── ${edition}（${LABEL[edition]}）────────`);
  // ★ 必须先写 edition.json：electron-build.cjs 读它注入 YZ_ARTIFACT_SUFFIX 与档位 env，
  //   顺序颠倒会打出「产物名与内容档位不一致」的包。
  run(process.execPath, ['./scripts/set-edition.cjs', edition]);

  const outDir = outDirFor(edition);
  clearOutputDir(outDir);

  // 显式传 YZ_OUTPUT_DIR + YZ_ARTIFACT_SUFFIX：
  //   · 输出目录严格落在期望位置，不会散落；
  //   · 后缀直传，避免读不到 edition.json 时回落到 -basic（档位与文件名不一致）。
  run(process.execPath, ['./scripts/electron-build.cjs', CONFIG[edition]], {
    YZ_OUTPUT_DIR: outDir,
    YZ_ARTIFACT_SUFFIX: `-${edition}`,
  });
}

console.log(`\n=== 完成：已产出 ${editions.length} 个包 ===`);
for (const e of editions) {
  console.log(`  · ${LABEL[e]}（${e}）→ ${rel(outDirFor(e))}/  （产物名以 -${e} 结尾）`);
}
console.log(
  '\n提示：最后写入的 edition.json 是 ' +
    editions[editions.length - 1] +
    ' 档；若要接着跑单档构建，请先执行 pnpm --filter @yan-zhi/desktop electron:build:<档>。',
);