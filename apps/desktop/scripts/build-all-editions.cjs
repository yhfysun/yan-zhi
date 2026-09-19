#!/usr/bin/env node
/**
 * 一次构建三档包（lite / basic / pro）。
 *
 * 为什么要单独一个脚本：三档共用同一份源码与同一份 yml，差异只在
 * `edition.json`（构建档 + 预置码档）与产物名后缀。逐个手跑三条命令不仅繁琐，
 * 还容易漏跑某一步导致「edition.json 还停在上一次的档位」——
 * 那会打出产物名与实际档位不一致的包（后缀写 -lite、里面却是 basic），
 * 是最难查的一类错。这里串行跑完整链路，每档之间强制重写 edition.json。
 *
 * 为什么串行而不是并行：三档都写同一个 `edition.json` 与同一个 `dist-release/` 输出目录，
 * 并行会互相覆盖。加锁不如串行简单可靠。
 *
 * 用法：
 *   node scripts/build-all-editions.cjs            # 三档全出
 *   node scripts/build-all-editions.cjs lite pro   # 只出指定档
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ALL = ['lite', 'basic', 'pro'];
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const editions = requested.length ? requested : ALL;

const invalid = editions.filter((e) => !ALL.includes(e));
if (invalid.length) {
  console.error(`[build-all] 未知档位: ${invalid.join(', ')}（可选: ${ALL.join(' / ')}）`);
  process.exit(1);
}

const desktopDir = path.join(__dirname, '..');
/** 各档对应的 electron-builder 配置（目前两份内容等价，保留映射以便日后分叉）。 */
const CONFIG = { lite: 'electron-builder.lite.yml', basic: 'electron-builder.full.yml', pro: 'electron-builder.full.yml' };
const LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/**
 * 每档输出到**独立目录**（`dist-release-<档>`）。
 *
 * 为什么不用同一个 dist-release：electron-builder 每档都会清空 `win-unpacked` 重写 app.asar，
 * 而上一档刚生成的 app.asar（200MB+）常被实时杀软扫描或残留进程短暂持有 →
 * 表现为 `EBUSY: resource busy or locked, unlink ...app.asar` 直接中断后续档位。
 * 独立目录让各档互不干扰，也便于比对包内容。
 */
const OUT_DIR = { lite: 'dist-release-lite', basic: 'dist-release-basic', pro: 'dist-release-pro' };

function run(cmd, args, extraEnv) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(extraEnv || {}) },
  });
}

// ① 后端与前端只编一次：三档的**代码完全相同**（本轮不做按档裁剪），
//    差异只在运行期的 edition.json，所以不必重编三遍。
console.log('=== [1/2] 编译后端与前端（三档共用，只跑一次）===');
run('pnpm', ['--filter', '@yan-zhi/server', 'build']);
run('npx', ['vite', 'build']);
run('node', ['./scripts/prepare-server-runtime.cjs']);
run('node', ['./scripts/clean-broken-symlinks.cjs']);

// ② 逐档打包：每档先重写 edition.json 再交给 electron-builder
console.log(`\n=== [2/2] 逐档打包：${editions.join(' → ')} ===`);
for (const edition of editions) {
  console.log(`\n──────── ${edition}（${LABEL[edition]}）────────`);
  // ★ 必须先写 edition.json：electron-build.cjs 读它注入 YZ_ARTIFACT_SUFFIX 与档位 env，
  //   顺序颠倒会打出「产物名与内容档位不一致」的包。
  run('node', ['./scripts/set-edition.cjs', edition]);
  const outDir = path.resolve(desktopDir, '..', '..', OUT_DIR[edition]);
  run('node', ['./scripts/electron-build.cjs', CONFIG[edition]], { YZ_OUTPUT_DIR: outDir });
}

console.log(`\n=== 完成：已产出 ${editions.length} 个包 ===`);
for (const e of editions) {
  console.log(`  · ${LABEL[e]}（${e}）→ ${OUT_DIR[e]}/  （产物名以 -${e} 结尾）`);
}
console.log('\n提示：最后写入的 edition.json 是 ' + editions[editions.length - 1] + ' 档；'
  + '若要接着跑单档构建，请先执行 pnpm --filter @yan-zhi/desktop electron:build:<档>。');