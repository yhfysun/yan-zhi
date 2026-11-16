/**
 * 移动端「精简包」构建（仅办公 + 学习两模式）。
 *
 * 目标（2026-11-16 用户诉求）：
 *   移动端 APK 约 500MB，用户要求**只保留办公模式(office) 与学习模式(learning)**
 *   的功能代码和静态资源，移除冗余内容以减小体积，且**不能影响现有移动端功能**。
 *
 * ★ 为什么用「物理裁剪」而不是运行时开关：
 *   仓库已有成熟的两级裁剪机制（桌面打包链在用）：
 *     ① 前端：scripts/select-modes.cjs 重写 packages/ui/src/generated/build-modes.ts，
 *        未选模式的 **动态 import 表达式在源码层就不存在** ⇒ Rollup 根本不产出
 *        对应 chunk（不是「打进去再隐藏」，是真的不进包）。
 *     ② 后端：YZ_BUILD_PLUGINS_EXCLUDED 环境变量 ⇒ 内嵌后端跳过未选插件的注册
 *        （含「源码兜底注册」那条路径，否则目录没了、插件却还在）。
 *   移动端此前没接这两条 ⇒ 全量 16 个插件包 + 全模式前端 chunk 都进了 APK。
 *
 * ★ 体积账（实测本仓）：
 *   apps/server/plugins/builtin 共 107MB —— 其中与移动端无关的
 *   clip-mode 12.2 + shop-ops 11.6 + dev-mode 9.3 + ops-shell 6.8 + rpa-mode 6.7
 *   + wf-mode 6.2 + cicd-pipeline 5.4 + sec-lab 1.9 + git-explorer 1.3 ≈ 61MB；
 *   前端 dist/assets 34.3MB 里也有各模式的独立 chunk。
 *
 * ★ 安全约束：
 *   - 只裁**移动端**，桌面/网页端完全不受影响（本脚本只写移动端产物 + 临时改
 *     生成文件，构建结束无条件 --restore）。
 *   - 移动端本来就只支持 office/learning 两个模式（mode.ts MOBILE_ALLOWED_MODES），
 *     其它模式在移动端 UI 上本就不可见 ⇒ 裁掉它们**不改变移动端的用户可见功能**。
 *   - office-core / learning-mode / skins 必须保留：
 *     office-core 是基座（永不裁剪），learning-mode 是学习模式的唯一入口插件，
 *     skins 是皮肤/壁纸资源（用户明确要求 3D 冰砖墙纸皮肤）。
 *   - git-explorer 体积小（1.3MB）且办公模式可能用到，保留更安全。
 *
 * 用法：
 *   node scripts/build-android-slim.cjs            # 构建精简包
 *   YZ_SLIM_SKIP_GRADLE=1 node scripts/build-android-slim.cjs   # 只出 dist 不打 APK（排障用）
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MOBILE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MOBILE_DIR, '..', '..');

/** 精简包保留的模式（移动端唯一支持的两个）。 */
const SLIM_MODES = ['office', 'learning'];
/** 精简包保留的后端插件包（其余裁掉）。skins = 皮肤壁纸资源，必须留。 */
const SLIM_PLUGINS = ['office-core', 'learning-mode', 'skins', 'git-explorer'];
/**
 * 精简包保留的 ABI（真机）。裁掉 x86/x86_64（模拟器）—— libnode.so 单份 44~52MB，
 * x86_64 那份在 APK 里占 55.6MB，纯冗余。
 * ⚠ 精简包**不能装模拟器**（普通构建 build:android 不受此影响，仍带全 ABI）。
 */
const SLIM_ABIS = 'arm64-v8a,armeabi-v7a';

function log(msg) { console.log('[build-android-slim]', msg); }

function run(cmd, args, opts = {}) {
  // ★ shell:false：node.exe 的路径含空格（"C:\Program Files\nodejs\node.exe"），
  //   走 shell 会被 cmd 拆成两段 → "'C:\Program' 不是内部或外部命令"。
  //   直接 spawn 绝对路径即可，不需要 shell。
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || REPO_ROOT,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...(opts.env || {}) },
  });
  if (r.error) {
    console.error('[build-android-slim][ERROR] 启动失败:', cmd, r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error('[build-android-slim][ERROR] 命令失败:', cmd, args.join(' '));
    process.exit(r.status || 1);
  }
}

const SELECT_MODES = path.join(REPO_ROOT, 'scripts', 'select-modes.cjs');

/** 生成只含 office/learning 的前端模式表（物理裁剪前端 chunk）。 */
function selectSlimModes() {
  log(`选择模式: ${SLIM_MODES.join(', ')}（前端 chunk 物理裁剪）`);
  run(process.execPath, [SELECT_MODES, `--modes=${SLIM_MODES.join(',')}`, `--plugins=${SLIM_PLUGINS.join(',')}`]);
}

/** 还原全量模式表（必须在 finally 里无条件调用，否则污染工作区）。 */
function restoreModes() {
  log('还原全量模式表（--restore）');
  run(process.execPath, [SELECT_MODES, '--restore']);
}

/**
 * 幂等铺设 android/app/build.gradle 的 ABI 过滤块。
 *
 * ★ android/ 是 gitignore 生成目录（cap add 产物 + apply-native-*.cjs 幂等铺设）：
 *   build.gradle 的 `if (project.hasProperty('yanZhiAbiFilters'))` 块属于「手工改动」，
 *   换机器 / 重 cap add 后不存在 ⇒ gradle 收到 -PyanZhiAbiFilters 也无人消费 ⇒
 *   精简包静默打回全 ABI（+57.7MB 而不自知）。所以精简构建前必须确保这段在。
 */
function ensureAbiFilterBlock() {
  const gradleFile = path.join(MOBILE_DIR, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(gradleFile)) {
    console.error('[build-android-slim][ERROR] 未找到 ' + gradleFile + '（先跑一次普通 build:android 生成 android 工程）');
    process.exit(1);
  }
  const src = fs.readFileSync(gradleFile, 'utf8');
  if (src.includes("hasProperty('yanZhiAbiFilters')")) return; // 已铺设，幂等退出
  const block = [
    '        // ★★ ABI 裁剪（由 build-android-slim.cjs 幂等铺设）：',
    '        //     普通构建不传 -PyanZhiAbiFilters ⇒ 不裁（保留 x86_64 供模拟器调试）；',
    '        //     精简包传 -PyanZhiAbiFilters=arm64-v8a,armeabi-v7a 只留真机 ABI',
    '        //     （x86_64 的 libnode.so 单份 55.6MB，模拟器专用，真机用不到）。',
    "        if (project.hasProperty('yanZhiAbiFilters') && yanZhiAbiFilters) {",
    '            ndk {',
    "                abiFilters.addAll(yanZhiAbiFilters.split(',').collect { it.trim() }.findAll { it })",
    '            }',
    '        }',
  ].join('\n');
  // 插在 defaultConfig 内 testInstrumentationRunner 之后（Capacitor 工程该行恒存在）
  const anchor = /testInstrumentationRunner "[^"]+"\r?\n/;
  if (!anchor.test(src)) {
    console.error('[build-android-slim][ERROR] build.gradle 未找到 testInstrumentationRunner 锚点，无法铺设 ABI 块');
    process.exit(1);
  }
  fs.writeFileSync(gradleFile, src.replace(anchor, (m0) => m0 + block + '\n'), 'utf8');
  log('已在 android/app/build.gradle 铺设 ABI 过滤块（幂等）');
}

/** 移动端各构建步骤（顺序照搬 package.json 的 build:android，只在需要处插入裁剪）。 */
function buildAll() {
  const pkg = path.join(MOBILE_DIR, 'package.json');
  const scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts;
  const chain = scripts['build:android'];
  // build:android 是一条以 && 串起来的长命令，这里按 && 拆开逐步执行，
  // 以便在 vite build 之前插入 select-modes、在最后插入 --restore。
  const steps = chain.split('&&').map((s) => s.trim()).filter(Boolean);
  for (const step of steps) {
    if (/^vite build/.test(step)) {
      // 前端裁剪必须发生在 vite build 之前（生成表是 Rollup 的输入）
      selectSlimModes();
      log('执行:', step);
      run(process.execPath, [path.join(MOBILE_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: MOBILE_DIR });
      continue;
    }
    if (/^node scripts\/build-mobile-server\.cjs/.test(step)) {
      log('执行:', step);
      run(process.execPath, [path.join(__dirname, 'build-mobile-server.cjs')], {
        cwd: MOBILE_DIR,
        // 后端裁剪：未选插件不随包 + 内嵌后端跳过注册
        env: { YZ_BUILD_PLUGIN_KEEP: SLIM_PLUGINS.join(',') },
      });
      continue;
    }
    if (/^node scripts\/assemble-debug\.cjs/.test(step)) {
      if (process.env.YZ_SLIM_SKIP_GRADLE === '1') {
        log('跳过 gradle 打包（YZ_SLIM_SKIP_GRADLE=1）');
        continue;
      }
      // ★ 幂等铺设 ABI 过滤块（android/ 是 gitignore 生成目录，换机器重建后
      //   build.gradle 没有这段 ⇒ -PyanZhiAbiFilters 传了也无人消费 ⇒ 静默打回全 ABI）。
      ensureAbiFilterBlock();
      log('执行:', step);
      run(process.execPath, [path.join(__dirname, 'assemble-debug.cjs')], {
        cwd: MOBILE_DIR,
        // ★ ABI 裁剪：只留真机 ABI（x86_64 的 libnode.so 单独就 55.6MB，模拟器专用）。
        //   保守起见默认只裁 x86/x86_64，保留 arm64-v8a + armeabi-v7a。
        env: { YZ_GRADLE_PROPS: `yanZhiAbiFilters=${SLIM_ABIS}` },
      });
      continue;
    }
    if (/^node scripts\/copy-apk\.cjs/.test(step)) {
      log('执行:', step);
      run(process.execPath, [path.join(__dirname, 'copy-apk.cjs')], { cwd: MOBILE_DIR });
      continue;
    }
    // 其余步骤（icons / apply-native-* / cap sync / shortpath）原样执行
    const m = step.match(/^node\s+(.+)$/);
    if (m) {
      const scriptPath = path.resolve(MOBILE_DIR, m[1].trim());
      if (!fs.existsSync(scriptPath)) {
        console.error('[build-android-slim][ERROR] 步骤脚本不存在:', scriptPath);
        process.exit(1);
      }
      log('执行:', step);
      run(process.execPath, [scriptPath], { cwd: MOBILE_DIR });
      continue;
    }
    log('执行(外部命令):', step);
    // 外部命令（cap sync）：走 shell（.cmd 包装器需要）。
    // ★ 两个要点：
    //   ① cap 不在全局 PATH ⇒ 用本地 node_modules/.bin 下的可执行文件；
    //   ② shell:true 时**参数必须拼进命令字符串**（spawnSync(cmd, [], shell) 会丢参数，
    //      cap 会只打印帮助文本、什么都不做 —— 表现为「同步静默跳过」）。
    const parts = step.split(/\s+/).filter(Boolean);
    const binName = parts[0];
    const args = parts.slice(1);
    const localBin = path.join(MOBILE_DIR, 'node_modules', '.bin', binName + (process.platform === 'win32' ? '.cmd' : ''));
    const useLocal = fs.existsSync(localBin);
    const commandLine = [useLocal ? localBin : binName, ...args].join(' ');
    const r = spawnSync(commandLine, [], {
      cwd: MOBILE_DIR,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PATH: `${path.join(MOBILE_DIR, 'node_modules', '.bin')};${process.env.PATH || ''}` },
    });
    if (r.status !== 0) {
      console.error('[build-android-slim][ERROR] 外部命令失败:', step, useLocal ? '(本地 .bin)' : '(PATH)');
      process.exit(r.status || 1);
    }
  }
}

function reportSize() {
  const dist = path.join(MOBILE_DIR, 'dist');
  if (!fs.existsSync(dist)) return;
  let total = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dist);
  log(`dist 合计: ${(total / 1024 / 1024).toFixed(1)} MB`);
}

log('===== 移动端精简包构建（office + learning）=====');
try {
  buildAll();
  reportSize();
  log('完成。APK 见 android/app/build/outputs/apk/debug/');
} finally {
  // 无论成败都必须还原生成文件，否则工作区被裁剪态污染（后续普通构建会缺模式）
  try { restoreModes(); } catch (e) { console.error('[build-android-slim] 还原模式表失败:', e); }
}
