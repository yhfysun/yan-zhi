// 固定脚本路径（GameControlBar「开跑」= browser_run_loop）的**场景级真跑**测试。
//
// ★ 与 fast-click.test.cjs 的静态抽取不同，这里把 main.cjs 的 ===RUNLOOP-START/END===
//   真实 executeRunLoop 放进**真 Electron + 真页面**里跑（test/fixtures/game-loop-runner.cjs）：
//   被测页是秘境挑战的 DOM 模拟（fixtures/game-sc33-sim.html）—— 初始有礼包弹窗遮挡、
//   「下一关」只在结算期出现、战斗期点击无效。plan 全程**无模型参与**：
//   关弹窗 → 「结算期才点」的 if 分支 → 坐标点击 → until 达标即停。
//
// 钉住四条（都是游戏模式可用性的关键行为）：
//   ① 纯脚本能把弹窗关掉并把关卡一路点上去（模拟真实"一直点下一关"）；
//   ② until 条件生效：达到目标层即停（aborted='until'），不会无限刷；
//   ③ 战斗期不误点（模拟页在 fight 期吞点击，层级数只能由 settle 期点击推进）；
//   ④ 坐标点击走真实输入事件路径（sendInputEvent），与 fast-click 通道一致。
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const MAIN_CJS = path.join(DESKTOP, 'main.cjs');
const FIXTURE = path.join(__dirname, 'fixtures', 'game-sc33-sim.html');
const RUNNER = path.join(__dirname, 'fixtures', 'game-loop-runner.cjs');

// electron 包在纯 node 环境下 require 返回二进制路径字符串
const ELECTRON_BIN = require('electron');

const START_LEVEL = 396;
const TARGET_LEVEL = 400;   // 刷 4 层即停

/** 跑一份 plan，返回执行器结果 + 页面终态 */
function runPlan(plan) {
  return new Promise((resolve, reject) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-runloop-'));
    const planFile = path.join(tmp, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify(plan));
    const childEnv = { ...process.env };
    // ★ WorkBuddy 等宿主会全局注入 ELECTRON_RUN_AS_NODE=1，不删掉的话
    //   electron.exe 会按纯 node 启动（require('electron').app 为 undefined）。
    //   必须从 env 里**删除**键 —— 置空串在 Windows 上仍是"已设置"。
    delete childEnv.ELECTRON_RUN_AS_NODE;
    childEnv.ELECTRON_ENABLE_LOGGING = '0';
    childEnv.YZ_MAIN_CJS = MAIN_CJS;
    childEnv.YZ_FIXTURE = FIXTURE;
    childEnv.YZ_PLAN = planFile;
    execFile(ELECTRON_BIN, [RUNNER], {
      timeout: 90_000,
      env: childEnv,
    }, (err, stdout) => {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
      const line = String(stdout || '').split('\n').find((l) => l.startsWith('RESULT:'));
      if (!line) return reject(new Error('执行器没有输出 RESULT：' + String(err || stdout).slice(0, 300)));
      resolve(JSON.parse(line.slice('RESULT:'.length)));
    });
  });
}

describe('固定脚本路径 · run_loop 秘境挑战场景（真 Electron 真跑）', () => {
  before(() => {
    assert.ok(fs.existsSync(MAIN_CJS), '缺少 main.cjs');
    assert.ok(fs.existsSync(FIXTURE), '缺少模拟游戏页');
    assert.ok(fs.existsSync(RUNNER), '缺少 electron 执行器');
  });

  test('关弹窗 + 结算期点「下一关」+ until 到 400 层即停', async () => {
    const res = await runPlan({
      steps: [
        // 关弹窗：模拟页的礼包弹窗盖住全屏，不关掉点不到任何按钮
        { type: 'script', script: "var p=document.getElementById('popup'); if(p){document.getElementById('popup-close').click(); 'closed'} else {'none'}", as: 'popup' },
        // 结算期才点：if 分支保证战斗期不空点（真实游戏在战斗期点击会吞掉/误触）
        {
          type: 'if',
          script: "var n=document.getElementById('next'); !!(n && n.style.display !== 'none')",
          then: [{ type: 'click', x: 410, y: 420, holdMs: 40 }],
          else: [{ type: 'wait', ms: 120 }],
          gapMs: 60,
        },
      ],
      rounds: 40,
      until: `window.__game.level >= ${TARGET_LEVEL}`,
      maxSeconds: 60,
    });

    assert.strictEqual(res.fatal, undefined, '执行器不应报错：' + JSON.stringify(res));
    assert.strictEqual(res.level, TARGET_LEVEL, `★ 应从 ${START_LEVEL} 刷到 ${TARGET_LEVEL} 层`);
    assert.strictEqual(res.popupGone, true, '★ 弹窗必须被脚本步关掉（不关就点不到下一关）');
    assert.strictEqual(res.aborted, 'until', '★ 到达目标层后 until 必须正常停（不无限刷）');
    assert.ok(res.rounds >= 4, '至少跑了 4 轮才到目标层');
    assert.ok(res.elapsedMs < 60_000, '整个循环不得撞 maxSeconds 上限');
  });

  test('步数超上限被 maxSteps 兜底停住（不挂死、不无限刷）', async () => {
    // ★ 不用 maxSeconds 测兜底：执行器对它有 50s 下限（Math.max(50, …)，防误传 1s 空跑），
    //   等满 50s 太慢；maxSteps 是同级的另一道守卫，毫秒级即可验证"到限即停"。
    const res = await runPlan({
      steps: [{ type: 'wait', ms: 30 }],
      rounds: 200,
      maxSteps: 25,           // 200 轮 × 1 步，跑到 25 步必须停
      maxSeconds: 60,
    });
    assert.strictEqual(res.fatal, undefined, '执行器不应报错：' + JSON.stringify(res));
    assert.strictEqual(res.aborted, 'maxSteps', '★ 步数到上限必须兜底中止（aborted=maxSteps）');
    assert.ok(res.steps <= 26, `步数不得明显越界（实际 ${res.steps}）`);
    assert.strictEqual(res.level, START_LEVEL, '未点击，关卡数不变');
  });
});
