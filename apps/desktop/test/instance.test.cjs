/**
 * 实例隔离单测（apps/desktop/instance.cjs）。
 *
 * ★★★ 为什么必须测（2026-09-27 用户报障：
 *   「我都安装好了这个软件了，但是你在修改代码的时候这个软件还会变化？」）：
 *   安装包本体是静态的，真因是**开发版与安装版共用运行期资源** ——
 *   旧版 dev 编排器把「正在运行的正式版」列入可杀名单并强杀，再用自己的后端占用同一端口，
 *   于是安装版窗口前端虽旧、所有 /api 请求却打到开发版后端。
 *
 *   修法 = 让两个实例在**端口 / 数据目录 / 实例标识**三处都分开。
 *   这三处都属于「写错不报错、只在真机表现为串台」的类型（静默失效），
 *   所以必须有守门断言把它们钉住，而不是靠"我改过了"。
 *
 * 运行：node --test apps/desktop/test/instance.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const inst = require('../instance.cjs');
// 本文件在 apps/desktop/test/ → 仓库根要上溯三层
const ROOT = path.resolve(__dirname, '..', '..', '..');

describe('端口解析：开发与生产同端口（2026-10-10 共用一套库口径）', () => {
  test('生产（无 env）用 3001', () => {
    assert.strictEqual(inst.resolveApiPort({}), inst.DEFAULT_API_PORT);
    assert.strictEqual(inst.resolveApiPort({}), 3001);
  });

  test('★ 开发实例（YANZHI_DEV_INSTANCE=1）与生产**同端口 3001**', () => {
    const p = inst.resolveApiPort({ YANZHI_DEV_INSTANCE: '1' });
    assert.strictEqual(p, inst.DEV_API_PORT);
    // ★★★ 2026-10-10 口径反转：此前要求"必须错开"，现按用户诉求改为"必须相同"。
    //   理由：dev 与安装版共用同一套 data.db，端口不同会让前端连着另一个库，
    //   用户诉求是「dev 启动就能测真实数据」。
    assert.strictEqual(p, 3001);
    assert.strictEqual(inst.DEV_API_PORT, inst.DEFAULT_API_PORT,
      'dev 与生产端口必须相同（共用一套库的前提）');
  });

  test('显式 YANZHI_API_PORT 优先于实例默认（临时并存时用它错开）', () => {
    assert.strictEqual(inst.resolveApiPort({ YANZHI_API_PORT: '4001' }), 4001);
    assert.strictEqual(inst.resolveApiPort({ YANZHI_DEV_INSTANCE: '1', YANZHI_API_PORT: '4001' }), 4001);
  });

  test('非法端口值回落实例默认，不得透传（写错端口不能变成监听随机口）', () => {
    for (const bad of ['abc', '0', '-1', '70000', '1.5', ' ', '', null, undefined]) {
      assert.strictEqual(
        inst.resolveApiPort({ YANZHI_API_PORT: bad }),
        inst.DEFAULT_API_PORT,
        `YANZHI_API_PORT=${String(bad)} 应回落默认`
      );
      assert.strictEqual(
        inst.resolveApiPort({ YANZHI_DEV_INSTANCE: '1', YANZHI_API_PORT: bad }),
        inst.DEV_API_PORT,
        `dev 下 YANZHI_API_PORT=${String(bad)} 应回落 dev 默认`
      );
    }
  });

  test('边界值 1 / 65535 合法', () => {
    assert.strictEqual(inst.resolveApiPort({ YANZHI_API_PORT: '1' }), 1);
    assert.strictEqual(inst.resolveApiPort({ YANZHI_API_PORT: '65535' }), 65535);
  });
});

describe('实例判定：判据是显式环境变量而非 app.isPackaged', () => {
  test('YANZHI_DEV_INSTANCE=1 → 开发实例', () => {
    assert.strictEqual(inst.isDevInstance({ YANZHI_DEV_INSTANCE: '1' }), true);
  });

  test('缺省 / 其它值 → 生产实例', () => {
    for (const v of [undefined, '', '0', 'true', 'yes', null]) {
      assert.strictEqual(inst.isDevInstance({ YANZHI_DEV_INSTANCE: v }), false, `值 ${String(v)} 不应判为开发实例`);
    }
  });

  test('★ userData 目录名两实例**必须相同**（共用一套数据）', () => {
    assert.strictEqual(inst.userDataName(false), 'yan-zhi');
    // ★★★ 2026-10-10 口径反转：此前是 'yan-zhi-dev'（隔离），现按用户诉求共用。
    assert.strictEqual(inst.userDataName(true), 'yan-zhi');
    assert.strictEqual(inst.userDataName(true), inst.userDataName(false),
      'dev 与安装版必须共用同一 userData（库/密钥/localStorage 同一份）');
  });
});

describe('目录解析：状态隔离，大文件缓存共用', () => {
  const APP_DATA = 'C:\\Fake\\Roaming';

  test('生产实例：userData 与共享目录重合', () => {
    const d = inst.resolveUserDataDirs(APP_DATA, false);
    assert.strictEqual(d.userData, path.join(APP_DATA, 'yan-zhi'));
    assert.strictEqual(d.shared, path.join(APP_DATA, 'yan-zhi'));
    assert.strictEqual(d.seedFrom, null, '生产实例不应从任何地方引导复制');
  });

  test('★ 开发实例：userData 与共享目录**都指向生产的 yan-zhi**（共用）', () => {
    const d = inst.resolveUserDataDirs(APP_DATA, true);
    // ★★★ 2026-10-10：dev 不再用 yan-zhi-dev，与生产同为 yan-zhi（用户诉求：共用一套库）
    assert.strictEqual(d.userData, path.join(APP_DATA, 'yan-zhi'));
    // models / bin 仍走生产目录 → 不因切实例而丢 1.1GB 模型
    assert.strictEqual(d.shared, path.join(APP_DATA, 'yan-zhi'));
    assert.strictEqual(d.shared, inst.sharedDataName() && path.join(APP_DATA, inst.sharedDataName()));
  });

  test('共享目录恒为生产目录名（与实例无关）', () => {
    assert.strictEqual(inst.sharedDataName(), 'yan-zhi');
  });

  test('★ 开发实例 userData 与生产重合 → seedFrom 为 null（已是同一份，无需引导复制）', () => {
    const d = inst.resolveUserDataDirs(APP_DATA, true);
    assert.strictEqual(d.seedFrom, null, 'userData 与 shared 重合时不应再 seedFrom（会自我复制）');
  });
});

describe('静态守门：源码里不得再出现「把正式版列入可杀名单」', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  /** 剥注释 —— 本项目已多次踩「断言命中注释」导致假红/假绿 */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  test('dev.mjs 的 SAFE_TO_KILL 不含 yan-zhi / 言智', () => {
    const src = strip(read('bin/dev.mjs'));
    const m = /const SAFE_TO_KILL\s*=\s*(\/.*?\/i)/.exec(src);
    assert.ok(m, '未找到 SAFE_TO_KILL 声明');
    const re = m[1];
    // 这是本次 bug 的根因：正式版被当成"残留进程"杀掉
    assert.ok(!/yan-zhi/i.test(re), `SAFE_TO_KILL 不得含 yan-zhi（否则启动 dev 会杀掉用户正在用的正式版）：${re}`);
    assert.ok(!/言智/.test(re), `SAFE_TO_KILL 不得含 言智：${re}`);
    // 仍需保留 dev 工具链
    for (const name of ['node', 'electron', 'tsx', 'vite']) {
      assert.ok(new RegExp(name).test(re), `SAFE_TO_KILL 应保留 ${name}`);
    }
  });

  test('★ dev.mjs 的端口治理走 DEV_API_PORT 常量（2026-10-10 起该常量 = 3001）', () => {
    const src = strip(read('bin/dev.mjs'));
    // ★★★ 口径反转：此前断言"不得写 3001、必须错开"，现 dev 与生产**同为 3001**。
    //   仍要求：一律走常量而非裸字面量（便于临时用 YANZHI_API_PORT 错开）。
    assert.match(src, /freePort\(\s*DEV_API_PORT/, '应按 DEV_API_PORT 清理 dev 残留');
    assert.match(src, /waitForPort\(\s*DEV_API_PORT/, '应探测 DEV_API_PORT 就绪');
    assert.match(src, /guardProductionPort\(\s*DEV_API_PORT/, '应按 DEV_API_PORT 守卫正式版占用');
    const m = /const DEV_API_PORT\s*=\s*(\d+)/.exec(src);
    assert.ok(m, '未找到 DEV_API_PORT 声明');
    assert.strictEqual(m[1], '3001', 'dev 端口须与生产同为 3001（共用一套库的前提）');
  });

  test('dev.mjs 启动 Electron 时注入了实例隔离两件套', () => {
    const src = strip(read('bin/dev.mjs'));
    assert.match(src, /YANZHI_DEV_INSTANCE\s*=\s*'1'/, 'dev 必须注入 YANZHI_DEV_INSTANCE=1（否则共用生产 userData）');
    assert.match(src, /YANZHI_API_PORT\s*=\s*String\(DEV_API_PORT\)|YANZHI_API_PORT\s*=\s*'3002'/, 'dev 必须下发 YANZHI_API_PORT');
  });

  test('main.cjs 的 userData / 端口 / CSP 一律走 instance.cjs，不硬编码 3001 逻辑', () => {
    const src = strip(read('apps/desktop/main.cjs'));
    assert.match(src, /require\('\.\/instance\.cjs'\)/, 'main.cjs 必须引用实例配置');
    assert.match(src, /const API_PORT\s*=\s*inst\.resolveApiPort\(/, '端口必须由 instance.cjs 解析');
    // 逻辑代码里不应再出现裸的 127.0.0.1:3001（注释里解释背景是允许的，故上面已剥注释）
    assert.ok(!/127\.0\.0\.1:3001/.test(src), 'main.cjs 逻辑里不得再硬编码 127.0.0.1:3001');
  });

  test('preload.cjs 通过 additionalArguments 读取端口并暴露给渲染层', () => {
    const src = strip(read('apps/desktop/preload.cjs'));
    assert.match(src, /--yz-api-port=/, 'preload 必须解析主进程下发的 --yz-api-port');
    assert.match(src, /apiPort:\s*API_PORT/, '必须把 apiPort 暴露到 electronAPI');
    assert.match(src, /apiBase:/, '必须暴露 apiBase（含 /api 前缀）');
  });

  test('main.cjs 通过 additionalArguments 下发端口（与 preload 的对端）', () => {
    const src = strip(read('apps/desktop/main.cjs'));
    assert.match(src, /additionalArguments:\s*\['--yz-api-port='\s*\+\s*API_PORT/, 'main 必须下发 --yz-api-port');
  });

  test('dev-desktop.bat 的清理逻辑显式排除安装版进程名', () => {
    const src = read('bin/dev-desktop.bat');
    // 该 bat 自己有一段 PowerShell 清理（不走 dev.mjs）→ 必须同样排除 yan-zhi/言智
    assert.match(src, /Name -notmatch 'yan-zhi|言智'/, 'bat 清理必须显式排除 yan-zhi / 言智 进程名');
    assert.ok(
      !/CommandLine -match 'yan-zhi\|/.test(src),
      'bat 不得再以「命令行含 yan-zhi」作为唯一杀进程依据（会连安装版一起杀）'
    );
  });
});

describe('静态守门：前端不得再硬编码本机后端端口', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  const FRONTEND_FILES = [
    'packages/ui/src/api/client.ts',
    'packages/core/src/tool/builtin/web-search.ts',
    'apps/desktop/src/main.ts',
    'apps/desktop/src/platform.ts',
    'apps/mobile/src/platform.ts',
  ];

  test('五个前端文件都不再出现 127.0.0.1:3001 字面量', () => {
    for (const rel of FRONTEND_FILES) {
      const src = strip(read(rel));
      assert.ok(
        !/127\.0\.0\.1:3001/.test(src),
        `${rel} 仍硬编码 127.0.0.1:3001 —— 开发实例会请求到安装版后端（数据串台）`
      );
    }
  });

  test('前端端口解析统一走 @yan-zhi/shared（单一出口，避免各写一套漂移）', () => {
    const client = read('packages/ui/src/api/client.ts');
    assert.match(client, /resolveLocalApiPort|localApiBase/, 'client.ts 应走 shared 的端口解析');
    const shared = read('packages/shared/src/utils/index.ts');
    assert.match(shared, /resolveLocalApiPort/, 'shared 必须导出 resolveLocalApiPort');
    assert.match(shared, /localApiBase/, 'shared 必须导出 localApiBase');
  });

  test('两个 vite.config 的 /api 代理目标都随实例端口，不写死 3001', () => {
    for (const rel of ['apps/desktop/vite.config.ts', 'apps/web/vite.config.ts']) {
      const src = strip(read(rel));
      assert.match(src, /YANZHI_API_PORT/, `${rel} 的 proxy target 应读 YANZHI_API_PORT`);
      assert.ok(!/target:\s*'http:\/\/localhost:3001'/.test(src), `${rel} 不得写死 proxy target=3001`);
    }
  });

  test('三个视图的回调地址用 LOCAL_API_BASE 推导，不写死 3001', () => {
    for (const rel of ['packages/ui/src/views/ChatHub.vue', 'packages/ui/src/views/Connections.vue', 'packages/ui/src/views/Peers.vue']) {
      const src = strip(read(rel));
      assert.ok(!/127\.0\.0\.1:3001/.test(src), `${rel} 仍写死 3001`);
      assert.match(src, /LOCAL_API_BASE/, `${rel} 应用 LOCAL_API_BASE 推导回调基址`);
    }
  });
});

describe('shared/local-server.ts 的解析规则（与 instance.cjs 口径一致）', () => {
  // shared 是 TS，这里只做静态断言（运行期由前端构建保证）
  const src = fs.readFileSync(path.join(ROOT, 'packages/shared/src/utils/local-server.ts'), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const code = strip(src);

  test('★ 端口常量与 instance.cjs 一致（dev 与生产同为 3001）', () => {
    assert.match(code, /DEFAULT_API_PORT\s*=\s*3001/);
    assert.match(code, /DEV_API_PORT\s*=\s*DEFAULT_API_PORT/);
    assert.strictEqual(inst.DEFAULT_API_PORT, 3001);
    assert.strictEqual(inst.DEV_API_PORT, 3001);
  });

  test('优先级：electronAPI.apiPort → env → 默认', () => {
    const iBridge = code.indexOf('electronAPI');
    const iEnv = code.indexOf('YANZHI_API_PORT');
    const iDefault = code.indexOf('return DEFAULT_API_PORT');
    assert.ok(iBridge >= 0 && iEnv >= 0 && iDefault >= 0, '三处取值都应存在');
    assert.ok(iBridge < iEnv && iEnv < iDefault, '取值顺序必须是 bridge → env → 默认（保证主进程下发的权威值优先）');
  });

  test('端口合法性校验存在（非法值不参与）', () => {
    assert.match(code, /65535/, '应有端口上界校验');
    assert.match(code, /Number\.isInteger/, '应校验整数');
  });
});
// ══════════════════════════════════════════════════════════════════════════
// 端口冲突防护（2026-10-10，同端口口径下的必需配套）
//
// ★★★ 为什么必须钉住：dev 与安装版**同端口 3001** 后，若安装版正在运行，
//   dev 后端 listen(3001) 会命中 EADDRINUSE。实测故障链（logs/server-error.log）：
//     app.listen 无 error 处理 → `Unhandled 'error' event` → **进程崩溃**
//     → 前端 SSE 全断 → 启动时 reapRunningTasks 把 running 任务标 interrupted
//     → 用户看到「任务执行不下去」。
//   两处必须同时成立，缺一不可：
//     ① server 侧：listen 必须有 EADDRINUSE 处理（明确报错 + exit，不崩得莫名其妙）
//     ② dev 编排：guardProductionPort 的返回值必须**真的生效**（被占则中止启动）
// ══════════════════════════════════════════════════════════════════════════
describe('端口冲突防护（同端口 3001 的必需配套）', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  test('★ server 的 app.listen 必须处理 EADDRINUSE（否则 Unhandled error 崩进程）', () => {
    const src = strip(read('apps/server/src/index.ts'));
    // 必须把 listen 的返回值接住并挂 error 监听
    assert.match(src, /(const|let)\s+\w*(httpServer|server)\w*\s*=\s*app\.listen\(/,
      '★ app.listen 的返回值必须接住（否则无法挂 error 监听）');
    assert.match(src, /\.on\(\s*['"]error['"]/, '★ 必须监听 listen 的 error 事件');
    assert.match(src, /EADDRINUSE/, '★ 必须显式识别 EADDRINUSE 并给可行动提示');
  });

  test('★ bin/dev.mjs 必须让 guardProductionPort 的返回值生效（被占则中止）', () => {
    const src = strip(read('bin/dev.mjs'));
    // 必须把返回值接住
    assert.match(src, /const\s+\w+\s*=\s*await\s+guardProductionPort\(/,
      '★ guardProductionPort 的返回值必须被接住（旧实现直接忽略 → 明知端口被占仍继续启动）');
    // 且必须据此中止
    assert.match(src, /if\s*\(\s*!\s*\w+\s*\)\s*\{[\s\S]{0,400}?process\.exit\(/,
      '★ 端口被正式版占用时必须中止启动（不能继续跑到 EADDRINUSE）');
  });
});
