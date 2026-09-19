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
 * ★ 三档同目录为什么可行：安装包名带档位后缀（-lite / -basic / -pro），彼此不冲突；
 *   真正会被复用的只有 electron-builder 的 appOutDir（`win-unpacked/`），
 *   所以每档构建前显式清掉它。
 *
 * ★ 清理失败怎么办（残留进程 / 杀软扫描持有 app.asar → EBUSY）：**明确报错并给出处置步骤**，
 *   不静默改用时间戳目录 —— 静默换目录会把产物散到多个目录，正是本脚本要避免的结果。
 *   实在清理不掉时，用 --separate 让每档写独立目录（互不干扰，且不需要清理 appOutDir）。
 *
 * 用法：
 *   node scripts/build-all-editions.cjs              # 三档全出 → dist-release/
 *   node scripts/build-all-editions.cjs pro          # 只出指定档（最常用）
 *   node scripts/build-all-editions.cjs lite pro     # 只出指定多档
 *   node scripts/build-all-editions.cjs --separate   # 每档独立目录 dist-release-<档>
 *   YZ_ALL_OUT_DIR=out-x node scripts/build-all-editions.cjs   # 自定义统一输出目录
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ALL_EDITIONS,
  EDITION_CONFIG,
  EDITION_LABEL,
  checkOutputDirReady,
  clearAppOutDirs,
  parseEditionsArgv,
  outDirForEdition,
} = require('./lib/pack-helpers.cjs');

const { editions, separate, invalid } = parseEditionsArgv(process.argv.slice(2));

if (invalid.length) {
  console.error(`[build-all] 未知档位: ${invalid.join(', ')}（可选: ${ALL_EDITIONS.join(' / ')}）`);
  process.exit(1);
}

const desktopDir = path.join(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');

const CONFIG = EDITION_CONFIG;
const LABEL = EDITION_LABEL;

/** 统一输出目录名（默认 dist-release/），可用 YZ_ALL_OUT_DIR 覆盖。 */
const SINGLE_OUT = process.env.YZ_ALL_OUT_DIR || 'dist-release';

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
  console.error('    2) 换统一输出目录：YZ_ALL_OUT_DIR=dist-release-new node scripts/build-all-editions.cjs');
  console.error('    3) 每档独立目录：node scripts/build-all-editions.cjs --separate');
  console.error('========================================================');
  console.error('');
  throw new Error(`清理失败: ${first.dir}`);
}

/** 前置体检：这些目录缺失不会让构建失败，但会让成品缺能力（只警告，不阻断）。 */
function preflight() {
  const warn = [];
  if (!fs.existsSync(path.join(desktopDir, 'resources', 'python'))) {
    warn.push(
      'apps/desktop/resources/python 不存在 → 成品不内置 Python 运行时，python 类工具会回退系统 python。\n' +
        '       如需内置，先跑: node scripts/build-python-runtime.mjs',
    );
  }
  if (!fs.existsSync(path.join(desktopDir, 'resources', 'python-tools'))) {
    warn.push('apps/desktop/resources/python-tools 不存在 → 随包 Python 脚本（doyz/security/pdf_preview）缺失。');
  }
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
  outDirForEdition(edition, { separate, singleOut: SINGLE_OUT, repoRoot });

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
    console.error('    2) 换统一输出目录：YZ_ALL_OUT_DIR=dist-release-new node scripts/build-all-editions.cjs');
    console.error('    3) 每档独立目录：node scripts/build-all-editions.cjs --separate');
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
console.log(
  `输出目录：${
    separate ? '各档独立（dist-release-<档>/）' : rel(path.resolve(repoRoot, SINGLE_OUT)) + '/（三档同目录）'
  }`,
);

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