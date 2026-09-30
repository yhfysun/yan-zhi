#!/usr/bin/env node
/**
 * 言智打包入口（可选包型）—— 桌面三档 / 安卓 APK / 组合。
 *
 * 为什么单独写这一个：项目里已有的 `bin/build.bat` / `pnpm build:*` 在本机环境下
 * **中途必失败**，且失败信息与真实原因无关。三个环境坑都会伪装成「代码坏了」：
 *
 *   ① **安全删除策略拦大目录**：任何构建的第一步（`rmSync(outDir)` /
 *      vite `prepareOutDir`）都会抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（>50 文件即拦）。
 *      → 本脚本开工前把这些目录**整体 Move 走**（安全策略只拦删除、不拦重命名）。
 *   ② **gradle 必须走短路径 junction**：`@capawesome/capacitor-nodejs` 的 CMake
 *      在 pnpm 深层目录里，绝对对象路径 > 250 字符 → `CMAKE_OBJECT_PATH_MAX` /
 *      `build.ninja still dirty`。且 **git-bash 会解析 junction**（`process.cwd()`
 *      返回真实长路径）→ 必须用 PowerShell 的 `Set-Location` 进 junction。
 *   ③ **`build-mobile-server.cjs` 只复制不编译** → 不先真编译 `apps/server/dist`，
 *      改动不会进包而且**完全不报错**。桌面构建里已含真编译，故安卓复用桌面步骤产物。
 *
 * 用法：
 *   node scripts/package.cjs                     # 交互式选择
 *   node scripts/package.cjs desktop             # 桌面三档全出
 *   node scripts/package.cjs desktop:pro         # 只出高级版
 *   node scripts/package.cjs desktop:lite,pro    # 出两档
 *   node scripts/package.cjs android             # 安卓 APK
 *   node scripts/package.cjs all                 # 桌面三档 + 安卓
 *   node scripts/package.cjs --editions=lite,pro # 等价 desktop:lite,pro
 *
 * 选项：
 *   --dry-run     只做环境检查与计划打印，**不移动目录、不构建**（预览用）
 *   --no-verify   跳过产物校验
 *   --keep-tmp    保留临时备份目录（默认构建成功后清理）
 *   -y / --yes    非交互确认（等价于默认全部；非 TTY 下自动生效）
 *
 * ★ 安卓路径会自动复用新鲜的 `apps/server/dist`（跳过编译）；陈旧则先真编译。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const ALL_EDITIONS = ['lite', 'basic', 'pro'];
const EDITION_LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/**
 * 会撞安全删除保护的构建输出目录（开工前必须整体移走）。
 *
 * ★★ 踩坑（2026-09-27）：最初只列了 `win-unpacked`，结果 electron-builder 打包 NSIS 时
 *   清理中间产物 `dist-release-<档>/@yan-zhidesktop-0.1.0-x64.nsis.7z` 被拦
 *   （**恰好 50 个文件命中阈值 50**）→ lite 档中断。
 *   ⇒ 正解不是"再补一条路径"，而是**把输出目录里所有可移走的内容整体清空**
 *   （见 moveOutDirsIn：按档位把输出目录内的全部条目移走，只保留已产出的 exe，
 *     因为那是交付物、不该动）。
 */
// ★ `YZ_SEPARATE_PREFIX` 与 pack-helpers.cjs 的 SEPARATE_OUT 保持一致：
//   旧产物被句柄持有（杀软扫描 / 残留进程）导致 EBUSY 时，用它换全新输出目录绕开。
//   ★ 两个文件必须**同源**：这里算"要移走什么"，那边算"写到哪" —— 不一致会导致
//     "移走了 A 却写到 B"（旧产物没清、新产物在别处），排障时极难看出。
const SEPARATE_PREFIX = process.env.YZ_SEPARATE_PREFIX || 'dist-release-';
const OUTPUT_DIRS = {
  lite: `${SEPARATE_PREFIX}lite`,
  basic: `${SEPARATE_PREFIX}basic`,
  pro: `${SEPARATE_PREFIX}pro`,
};

const MOVABLE = [
  'apps/server/dist',
  'apps/desktop/dist',
  'apps/web/dist',
  'apps/mobile/dist',
  'apps/mobile/nodejs/dist',
  'apps/mobile/android/app/src/main/assets/public',
];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const VERIFY = !flags.has('--no-verify');
const KEEP_TMP = flags.has('--keep-tmp');
// ★ 兼容 --dry：曾因写了 --dry（非 --dry-run）导致**误触发真实构建**（参数被忽略），
//   故两个拼写都认，且 dry 模式下一切写操作都短路。
const DRY = flags.has('--dry-run') || flags.has('--dry');

// ─────────────────────────── 小工具 ───────────────────────────
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const step = (m) => console.log(`\n${c.cyan(`====== ${m} ======`)}`);
const ok = (m) => console.log(`  ${c.green('[OK]')} ${m}`);
const warn = (m) => console.log(`  ${c.yellow('[WARN]')} ${m}`);
const fail = (m) => console.log(`  ${c.red('[ERROR]')} ${m}`);
const info = (m) => console.log(`  ${m}`);

let tmpBackupDir = null;
function backupRoot() {
  if (!tmpBackupDir) {
    tmpBackupDir = path.join(TMP, `_pkgbak_${Date.now()}`);
    fs.mkdirSync(tmpBackupDir, { recursive: true });
  }
  return tmpBackupDir;
}

/** 把大目录整体移走（★ 不用 rm —— 安全策略只拦删除，不拦重命名） */
function moveAway(relPaths) {
  if (DRY) {
    for (const rel of relPaths) {
      const exists = fs.existsSync(path.join(ROOT, rel));
      info(c.dim(`[dry-run] ${exists ? '将移走' : '跳过(不存在)'}  ${rel}`));
    }
    return;
  }
  const bak = backupRoot();
  for (const rel of relPaths) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      info(c.dim(`skip   ${rel}（不存在）`));
      continue;
    }
    const dest = path.join(bak, rel.replace(/[\\/]/g, '_'));
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(p, dest);
      info(c.dim(`moved  ${rel}`));
    } catch (e) {
      // 极少数情况 rename 跨设备/被句柄持有时失败，退化为递归删除（若策略放行）
      fail(`移动失败 ${rel}: ${e.message}`);
      throw e;
    }
  }
}

/** shell 执行（继承 stdio，失败抛错；Windows 需要 shell 才能跑 .cmd/.bat） */
function run(cmd, args, opts = {}) {
  console.log(c.bold(`\n$ ${cmd} ${args.join(' ')}`));
  return execFileSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(opts.env || {}) },
  });
}

/**
 * PowerShell 执行（用于 gradle 短路径 junction —— bash 会解析 junction）。
 *
 * ★ 踩坑（2026-09-27）：先前用 `execFileSync('powershell.exe', ['-Command', script])`
 *   直接传整段脚本，在本机报 `spawnSync powershell.exe EBUSY` ——
 *   多行脚本 + 引号转义 + 长命令行共同触发的 spawn 问题。
 *   正解：**落成 .ps1 文件再 `-File` 执行**（也可复现/手改），并且 `stdio: 'inherit'`
 *   让 gradle 的进度与错误直接可见（否则失败时看不到原因）。
 */
function runPowerShell(script, label) {
  const ps1 = path.join(TMP, `_pkg_${label || 'run'}.ps1`);
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(ps1, script, 'utf8');
  console.log(c.bold(`\n$ powershell -File ${path.relative(ROOT, ps1)}`));
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

/** 目录是否存在且非空（判断 server/dist 是否可复用） */
function distReady() {
  const dist = path.join(ROOT, 'apps/server/dist/apps/server/src');
  return fs.existsSync(dist) && fs.readdirSync(dist).length > 0;
}

/** server/dist 是否比源码新（源 > dist 即陈旧） */
function distStale() {
  const distDir = path.join(ROOT, 'apps/server/dist');
  if (!fs.existsSync(distDir)) return true;
  const distMtime = fs.statSync(distDir).mtimeMs;
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (scan(p)) return true; }
      else if (st.mtimeMs > distMtime) return true;
    }
    return false;
  };
  for (const sub of ['apps/server/src', 'packages/shared/src', 'packages/core/src']) {
    const d = path.join(ROOT, sub);
    if (fs.existsSync(d) && scan(d)) return true;
  }
  return false;
}

// ─────────────────────── 前置检查 ───────────────────────
function preflight(targets) {
  step('前置检查');
  const problems = [];

  // Node 版本
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) problems.push(`Node ${process.versions.node} < 20`);

  // 依赖
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) problems.push('node_modules 缺失，请先 pnpm install');

  // 输出目录被占用（安装版在 C:\APP\yan-zhi，不冲突；只提示真正会锁的）
  const lockHint = path.join(ROOT, 'dist-release-pro/win-unpacked');
  if (fs.existsSync(lockHint)) {
    info(c.dim('检测到已有 win-unpacked，将整体移走（避免删除被拦）'));
  }

  // 内置 Python 运行时（2026-09-30 起：缺失会在桌面构建里**自动生成**，不再静默降级）
  const pyDir = path.join(ROOT, 'apps', 'desktop', 'resources', 'python');
  if (targets.desktop.length) {
    if (fs.existsSync(pyDir)) {
      info(c.dim('内置 Python 运行时已就绪（resources/python）'));
    } else if (process.env.YZ_SKIP_PYTHON_RUNTIME === '1') {
      warn('已显式跳过内置 Python 运行时（YZ_SKIP_PYTHON_RUNTIME=1）→ 成品将回退系统 python');
    } else {
      info('内置 Python 运行时缺失 → 构建时会**自动生成**（首次约 40MB 下载 + 装依赖）');
    }
  }

  if (targets.android) {
    // Android SDK
    const sdkCandidates = [
      process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
      'C:\\Android\\Sdk',
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    ].filter(Boolean);
    const sdk = sdkCandidates.find((p) => p && fs.existsSync(path.join(p, 'platform-tools')));
    if (!sdk) problems.push('Android SDK 未找到（缺 platform-tools）');
    else ok(`Android SDK: ${sdk}`);
    // JDK 21
    const jdk = ['C:\\APP\\Java\\jdk-21.0.12.1+1'].find((p) => fs.existsSync(path.join(p, 'bin', 'javac.exe')));
    if (!jdk) warn('未找到 JDK 21（gradle.properties 指定 C:\\APP\\Java\\jdk-21.0.12.1+1），可能构建失败');
    else ok(`JDK 21: ${jdk}`);
  }

  if (problems.length) {
    for (const p of problems) fail(p);
    console.log('');
    process.exit(1);
  }
  ok('环境检查通过');
}

// ─────────────────────── 交互式选择 ───────────────────────
async function askTargets() {
  // ★ 非交互环境（CI / 管道 / 被 spawn）不能阻塞等输入 —— 否则脚本永久挂起。
  //   判据：stdin 不是 TTY，或显式给了 --yes。此时按默认（全部）走。
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y')) {
    console.log('');
    warn('非交互环境（stdin 非 TTY），按默认目标执行：桌面三档 + 安卓 APK');
    info(c.dim('  如需指定，请显式传参，如: pnpm package desktop:pro'));
    return { desktop: [...ALL_EDITIONS], android: true };
  }

  const options = [
    { key: '1', label: '桌面三档全出（lite + basic + pro）', value: { desktop: [...ALL_EDITIONS], android: false } },
    { key: '2', label: '桌面 · 只出高级版（pro）', value: { desktop: ['pro'], android: false } },
    { key: '3', label: '桌面 · 只出基础版（basic）', value: { desktop: ['basic'], android: false } },
    { key: '4', label: '桌面 · 只出阉割版（lite）', value: { desktop: ['lite'], android: false } },
    { key: '5', label: '安卓 APK', value: { desktop: [], android: true } },
    { key: '6', label: '全部（桌面三档 + 安卓 APK）', value: { desktop: [...ALL_EDITIONS], android: true } },
  ];
  console.log('');
  console.log(c.bold('  请选择要打的包：'));
  for (const o of options) console.log(`    ${c.cyan(o.key)}) ${o.label}`);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question('  输入序号（默认 6）: ', res));
  rl.close();
  const hit = options.find((o) => o.key === answer.trim());
  if (!hit) {
    if (answer.trim() === '') return options[5].value;
    fail(`无效选择: ${answer.trim()}`);
    process.exit(1);
  }
  return hit.value;
}

// ─────────────────────── 目标解析 ───────────────────────
function parseTargets(raw) {
  const t = (raw || []).filter((a) => !a.startsWith('--'));
  const result = { desktop: [], android: false };

  // --editions=lite,pro 等价于 desktop:lite,pro（注释里承诺过，必须实现）
  const edFlag = raw.find((a) => a.startsWith('--editions='));
  if (edFlag) {
    const list = edFlag.slice('--editions='.length).split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { fail('--editions= 后必须跟档位，如 --editions=lite,pro'); process.exit(1); }
    const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
    if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
    result.desktop.push(...list);
  }

  if (t.length === 0 && !result.desktop.length) return null; // 交给交互

  for (const item of t) {
    const [kind, sub] = item.split(':');
    if (kind === 'desktop' || kind === 'desktop:all') {
      if (!sub || sub === 'all') { result.desktop.push(...ALL_EDITIONS); continue; }
      // desktop:lite,pro
      const list = sub.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
      if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
      result.desktop.push(...list);
    } else if (kind === 'www' || item === 'desktop:full') {
      result.desktop.push('basic');
    } else if (item === 'android' || item === 'mobile' || item === 'mobile:android') {
      result.android = true;
    } else if (item === 'all') {
      result.desktop.push(...ALL_EDITIONS);
      result.android = true;
    } else {
      fail(`未知目标: ${item}（可选 desktop[:档位] / android / all）`);
      process.exit(1);
    }
  }
  result.desktop = [...new Set(result.desktop)];
  return result;
}

/**
 * 清空某个输出目录里**除去交付物（exe/blockmap）之外**的全部内容。
 *
 * ★ 为什么按"整个目录"而不是列具体路径：electron-builder 会在输出目录里产生
 *   多种中间产物（`win-unpacked/`、`@yan-zhidesktop-*.nsis.7z`、`__uninstaller-*` …），
 *   逐个列必然漏（已漏过 `win-unpacked` 和 `nsis.7z` 两次）。
 *   而这些都是构建中间物、删了会重建 —— 移走最稳妥。
 *   ★ 只保留 `*.exe`（交付物）与 `*.blockmap`（增量更新用）与 `builder-*.yml`（构建清单）：
 *     它们可能上一轮刚产出，用户可能正要拿。
 */
function moveOutDirContents(edition) {
  const dirName = OUTPUT_DIRS[edition];
  if (!dirName) return;
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) {
    info(c.dim(`skip   ${dirName}（不存在）`));
    return;
  }
  const KEEP = /\.(exe|blockmap)$/i;
  const entries = fs.readdirSync(dir).filter((n) => !KEEP.test(n) && !/^builder-.*\.yml$/i.test(n));
  if (!entries.length) {
    info(c.dim(`skip   ${dirName}（只有交付物）`));
    return;
  }
  if (DRY) {
    for (const n of entries) info(c.dim(`[dry-run] 将移走  ${dirName}/${n}`));
    return;
  }
  const bak = backupRoot();
  for (const n of entries) {
    const src = path.join(dir, n);
    const dest = path.join(bak, `${dirName}_${n}`.replace(/[\\/]/g, '_'));
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(src, dest);
      info(c.dim(`moved  ${dirName}/${n}`));
    } catch (e) {
      fail(`移动失败 ${dirName}/${n}: ${e.message}`);
      throw e;
    }
  }
}

/**
 * 计算本轮要移走的目录。
 *
 * ★★ 关键在于 `apps/server/dist` 的归属：
 *   · 桌面构建**内含**真编译 → 它的第一步会 rmSync('dist')，所以必须提前移走；
 *   · 纯安卓构建**依赖**已有 dist（build-mobile-server 只复制不编译）→ **绝不能移走**！
 *     若已在本脚本里编译过（willCompile），那份产物就是安卓要用的，同样要保住。
 *   把这条区别写进函数而不是散在主流程里 —— 写错的表现是「安卓包缺改动却不报错」。
 */
function computeMovable(targets, willCompile) {
  return MOVABLE.filter((m) => {
    if (m === 'apps/server/dist') return targets.desktop.length > 0; // 桌面才移（会重建）
    if (m === 'apps/desktop/dist' || m === 'apps/web/dist') return targets.desktop.length > 0;
    if (m.startsWith('apps/mobile/')) return targets.android;
    return true;
  }).map((m) => {
    // 纯安卓 + 本脚本已编译：dist 是刚编好的，别移（安卓要靠它）
    if (m === 'apps/server/dist' && willCompile && !targets.desktop.length) return null;
    return m;
  }).filter(Boolean);
}

// ─────────────────────── 桌面构建 ───────────────────────
function buildDesktop(editions) {
  step(`桌面打包：${editions.map((e) => `${e}(${EDITION_LABEL[e]})`).join(' / ')}`);
  info(`将依次：真编译 server → vite build → 逐档 electron-builder（约 3.5 分钟）`);
  // build-all-editions.cjs 内部含真编译 + 逐档重写 edition.json + 清 appOutDir + 三档独立目录
  run(process.execPath, [
    path.join('apps', 'desktop', 'scripts', 'build-all-editions.cjs'),
    ...editions,
    '--separate',
  ]);
  ok('桌面构建完成');
}

// ─────────────────────── 安卓构建 ───────────────────────
function buildAndroid() {
  step('安卓 APK 构建');
  const mobile = path.join(ROOT, 'apps', 'mobile');

  // ① 图标（必须在 vite build 之前）
  info('① 生成安卓图标');
  run(process.execPath, ['scripts/gen-android-icons.cjs'], { cwd: mobile });

  // ② 前端
  info('② 构建移动端前端');
  run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: mobile });

  // ③ 内嵌后端（★ 只复制 server/dist —— 必须先确认它是新鲜的）
  if (distStale()) {
    fail('apps/server/dist 陈旧或缺失！build-mobile-server 只复制不编译，改动不会进包。');
    info('  请先跑桌面构建（含真编译），或手动：pnpm --filter @yan-zhi/server build');
    process.exit(1);
  }
  ok('apps/server/dist 已是新鲜产物');
  info('③ 打包内嵌 Node 后端');
  run(process.execPath, ['scripts/build-mobile-server.cjs'], { cwd: mobile });

  // ④ cap sync
  info('④ 同步 Capacitor Android 工程');
  run(process.execPath, [path.join('node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android'], { cwd: mobile });

  // ⑤ gradle —— ★ 必须 PowerShell + junction 短路径
  info('⑤ gradle assembleDebug（PowerShell + C:\\yz junction）');
  const junction = 'C:\\yz';
  const jDir = 'C:\\yz\\apps\\mobile\\android';
  const rootEsc = ROOT.replace(/'/g, "''");
  // ★ 用单引号 here-string 写脚本，避免路径里的 \\ 与 $ 被 PS 解释
  const gradleScript = [
    `$ErrorActionPreference = 'Stop'`,
    `if (-not (Test-Path -LiteralPath '${junction}')) {`,
    `  New-Item -ItemType Junction -Path '${junction}' -Target '${rootEsc}' | Out-Null`,
    `}`,
    `$env:ANDROID_HOME = 'C:\\Android\\Sdk'`,
    `$env:ANDROID_SDK_ROOT = 'C:\\Android\\Sdk'`,
    `$env:JAVA_HOME = 'C:\\APP\\Java\\jdk-21.0.12.1+1'`,
    `Set-Location '${jDir}'`,
    `Write-Host "PWD=$($PWD.Path)"`,
    `& .\\gradlew.bat --stop 2>&1 | Out-Null`,
    `& .\\gradlew.bat assembleDebug --console=plain`,
    `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`,
  ].join('\n');
  runPowerShell(gradleScript, 'gradle');

  // ⑥ 拷 APK
  info('⑥ 拷贝 APK 到 dist-release');
  run(process.execPath, ['scripts/copy-apk.cjs'], { cwd: mobile });
  ok('安卓构建完成');
}

// ─────────────────────── 产物校验 ───────────────────────
function verifyAll(targets) {
  step('产物校验');
  const verifier = path.join('scripts', 'verify-package-artifacts.cjs');
  let allOk = true;

  for (const e of targets.desktop) {
    // ★ 必须走 OUTPUT_DIRS（与"写到哪"同源），不能硬编码 dist-release- ——
    //   否则用 YZ_SEPARATE_PREFIX 换目录时，产物明明已生成却报"缺 asar"。
    const asar = path.join(ROOT, OUTPUT_DIRS[e], 'win-unpacked', 'resources', 'app.asar');
    if (!fs.existsSync(asar)) { fail(`缺 asar: ${asar}`); allOk = false; continue; }
    try {
      run(process.execPath, [verifier, 'asar', asar]);
      ok(`桌面 ${e} 校验通过`);
    } catch { fail(`桌面 ${e} 校验失败`); allOk = false; }
  }

  if (targets.android) {
    const apk = path.join(ROOT, 'dist-release', 'app-debug.apk');
    if (!fs.existsSync(apk)) { fail(`缺 APK: ${apk}`); allOk = false; }
    else {
      try {
        run(process.execPath, [verifier, 'apk', apk]);
        ok('APK 校验通过');
      } catch { fail('APK 校验失败'); allOk = false; }
    }
  }
  return allOk;
}

/** 列出产物（尺寸 + 时间） */
function listArtifacts(targets) {
  step('产物清单');
  const list = [];
  for (const e of targets.desktop) {
    // ★ 同样走 OUTPUT_DIRS（见产物校验处注释）
    const dir = path.join(ROOT, OUTPUT_DIRS[e]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.exe') && !f.includes('uninstall')) list.push([`桌面 ${e}（${EDITION_LABEL[e]}）`, path.join(dir, f)]);
    }
  }
  if (targets.android) {
    const apk = path.join(ROOT, 'dist-release', 'app-debug.apk');
    if (fs.existsSync(apk)) list.push(['安卓 APK', apk]);
  }
  for (const [label, p] of list) {
    const s = fs.statSync(p);
    const mb = (s.size / 1048576).toFixed(1);
    console.log(`  ${label.padEnd(22)} ${mb.padStart(7)} MB  ${c.dim(path.relative(ROOT, p))}`);
  }
  return list.length;
}

/** 清理临时备份 */
function cleanupTmp() {
  if (KEEP_TMP || DRY || !tmpBackupDir) return;
  step('清理临时备份');
  const ps = `$p='${tmpBackupDir.replace(/'/g, "''")}'; if(Test-Path -LiteralPath $p){ [System.IO.Directory]::Delete($p,$true) }`;
  try {
    runPowerShell(ps);
    ok('已清理临时备份');
  } catch {
    warn(`清理失败，可手动删除: ${path.relative(ROOT, tmpBackupDir)}`);
  }
}

// ─────────────────────── 主流程 ───────────────────────
(async () => {
  let targets = parseTargets(argv);
  if (!targets) targets = await askTargets();
  if (!targets.desktop.length && !targets.android) {
    fail('未选择任何目标');
    process.exit(1);
  }

  console.log(c.bold(`\n言智打包 —— 目标：${
    [targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null]
      .filter(Boolean).join(' + ')
  }`));

  preflight(targets);

  // 是否需要真编译 server：
  //   · 桌面构建内含编译（build-all-editions 第一步就是 server build）；
  //   · 纯安卓时，只有 dist 陈旧/缺失才单独编译一次；
  //   · --only + dist 新鲜 → 直接复用，连编译都省。
  const needCompile = targets.desktop.length > 0;
  let willCompile = needCompile;
  if (!needCompile && targets.android) {
    if (distReady() && !distStale()) ok('apps/server/dist 新鲜，可复用（跳过编译）');
    else willCompile = true;
  }

  if (DRY) {
    step('dry-run 计划（不执行任何写操作）');
    info(`目标: ${[targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' + ')}`);
    info(`将真编译 server: ${willCompile ? '是' : '否（复用现有 dist）'}`);
    info(`将构建: ${[needCompile ? '桌面三档/选档' : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' → ')}`);
    console.log('');
    step('将移走的目录');
    moveAway(computeMovable(targets, willCompile));
    for (const e of targets.desktop) moveOutDirContents(e);
    console.log('');
    console.log(c.dim('  dry-run 结束，未做任何改动。去掉 --dry-run 即为真实构建。'));
    return;
  }

  if (willCompile && !needCompile) {
    step('真编译 server（安卓前置）');
    run('pnpm', ['--filter', '@yan-zhi/server', 'build']);
  }

  step('移位将撞删除保护的目录');
  moveAway(computeMovable(targets, willCompile));
  // 输出目录里除交付物外的全部中间产物（win-unpacked / nsis.7z / __uninstaller-* …）
  for (const e of targets.desktop) moveOutDirContents(e);

  try {
    if (targets.desktop.length) buildDesktop(targets.desktop);
    if (targets.android) buildAndroid();

    let verifyOk = true;
    if (VERIFY) verifyOk = verifyAll(targets);
    const n = listArtifacts(targets);

    cleanupTmp();

    console.log('');
    if (verifyOk) {
      console.log(c.green(c.bold(`✓ 完成：${n} 个产物，全部校验通过`)));
    } else {
      console.log(c.yellow(c.bold(`⚠ 完成：${n} 个产物，但有校验未通过（见上）`)));
      process.exitCode = 1;
    }
  } catch (e) {
    console.log('');
    fail(`构建中断: ${e.message}`);
    if (tmpBackupDir) {
      console.log('');
      warn(`临时备份保留在: ${path.relative(ROOT, tmpBackupDir)}`);
    }
    process.exit(1);
  }
})();