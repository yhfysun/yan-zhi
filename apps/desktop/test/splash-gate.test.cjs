/**
 * 启动加载壳（splash）守门测试（2026-10-12）。
 *
 * ★★ 背景：旧健康检查逻辑 30 秒超时后**强制 createWindow()** → 前端在 tsx 冷启动
 *    未完成时请求全被拒（license/plugins ERR_CONNECTION_REFUSED、白屏）。
 *    本次改造：启动即显示 splash；超时（120s）不再建窗，改在 splash 上显示失败态；
 *    主窗 ready-to-show 后才销毁 splash（无缝衔接）。
 *
 * 钉住的三个不变量：
 *   ① 超时分支绝不再调用 createWindow()（变异：还原强制建窗 → 必须红）；
 *   ② destroySplashWindow() 只出现在主窗 ready-to-show 回调内（建窗 ≠ 可见）；
 *   ③ splash.html / splash-preload.cjs 必须登记进 yml files:（漏 = 打包版 splash 白壳）。
 *
 * 运行：node --test apps/desktop/test/splash-gate.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
// 四份打包配置都要登记 splash 资源（壳包同样在 Windows 上出 NSIS 安装包）
const YMLS = [
  'electron-builder.full.yml',
  'electron-builder.lite.yml',
  'electron-builder.shell.yml',
  'electron-builder.mac.yml',
];

/** 剥块注释与行注释（统一行尾，CRLF 下 $ 不匹配 \r 的坑已在 send-reentry-lock 踩过） */
function stripComments(src) {
  return src
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}
const mainCode = stripComments(MAIN);

describe('splash：超时不得强制创建主窗', () => {
  test('★ 超时分支内不再出现 createWindow()（2026-10-12 根因，变异验证点）', () => {
    // 定位超时分支：从「启动超时」错误日志到分支结束（下一个顶层 const/function 或闭包收口）
    const anchor = mainCode.indexOf("启动超时（120 秒），不创建主窗");
    assert.ok(anchor > 0, 'main.cjs 中找不到超时分支锚点 —— 逻辑被改动了？');
    const branch = mainCode.slice(anchor, anchor + 1500);
    const forbidden = branch.indexOf('createWindow()');
    assert.strictEqual(
      forbidden, -1,
      '超时分支内仍调用 createWindow() —— 这会把必然白屏/拒连的窗口丢给用户（本次修复的原始缺陷）',
    );
  });

  test('★ 反向校验：超时分支必须推失败态（经 reportBootFailure 唯一出口）', () => {
    const anchor = mainCode.indexOf("启动超时（120 秒），不创建主窗");
    const branch = mainCode.slice(anchor, anchor + 1500);
    assert.ok(
      branch.includes('reportBootFailure('),
      '超时分支未推送失败态 —— 用户将面对静止的进度条，无任何失败提示',
    );
    // failed:true 由纯函数真实返回，在 splash-progress.test.cjs 里真跑断言（不是文本存在性）
    assert.ok(MAIN.includes('function reportBootFailure(caption)'), '缺少失败态唯一出口');
  });

  test('健康检查超时上限为 120 秒常量（不再硬编码 30s）', () => {
    assert.ok(mainCode.includes('SPLASH_HEALTH_TIMEOUT_MS = 120000'), '缺少 120s 常量');
    assert.ok(!mainCode.includes('retries > 60'), '旧的 60 次重试硬上限仍在');
  });
});

describe('splash：生命周期收口', () => {
  test('★ destroySplashWindow 只在首屏闸门里、show 之后调用（建窗 ≠ 可见 ≠ 渲染层已挂载）', () => {
    // 排除函数定义行（`function destroySplashWindow() {`），只看调用点
    const calls = [...mainCode.matchAll(/(?<!function )destroySplashWindow\(\)/g)].map((m) => m.index);
    assert.ok(calls.length >= 1, '找不到 destroySplashWindow 调用');
    const gate = mainCode.indexOf('const revealMainWindow = () => {');
    assert.ok(gate > 0, '找不到首屏闸门 revealMainWindow —— 逻辑被改动了？');
    const gateEnd = mainCode.indexOf('mainRevealTimer = setTimeout', gate);
    assert.ok(gateEnd > gate, '找不到首屏闸门结束锚点');
    for (const i of calls) {
      // 2026-11-02：ready-to-show 在 dev 下可能只画出背景色就触发 → 提前销毁 splash = 黑窗。
      // 现在只允许在闸门内（show 之后）销毁，闸门外任何调用都视为回归。
      assert.ok(
        i > gate && i < gateEnd,
        `destroySplashWindow 调用点(${i})不在首屏闸门内(${gate}..${gateEnd}) —— 提前销毁会黑窗`,
      );
      const showIdx = mainCode.lastIndexOf('mainWindow.show()', i);
      assert.ok(
        showIdx > gate && showIdx < i,
        'destroySplashWindow 必须在 mainWindow.show() 之后 —— 否则用户会看到桌面空窗',
      );
    }
  });

  test('★ 首屏闸门必须由 ready-to-show ∩ ui-ready 双闸放行', () => {
    assert.ok(mainCode.includes("ipcMain.on('ui-ready'"), 'main.cjs 未监听渲染层 ui-ready 信号');
    assert.ok(
      mainCode.includes('if (!mainReadyToShow || !mainUiReady) return;'),
      '首屏闸门缺少双条件判定 —— 任一信号单独到达就放行会退回黑窗',
    );
    // 兜底：渲染层异常时不能让 splash 常驻
    assert.ok(mainCode.includes('MAIN_REVEAL_TIMEOUT_MS'), '缺少首屏闸门超时兜底');
  });

  test('健康检查通过后、ready-to-show 前不得销毁 splash', () => {
    const ready = mainCode.indexOf('健康检查通过');
    assert.ok(ready > 0);
    const seg = mainCode.slice(ready, ready + 400);
    assert.ok(!seg.includes('destroySplashWindow'), '健康检查回调内提前销毁了 splash');
  });
});

describe('splash：打包登记', () => {
  test('★ splash.html 与 splash-preload.cjs 登记进四份 yml 的 files:', () => {
    for (const yml of YMLS) {
      const src = fs.readFileSync(path.join(DESKTOP, yml), 'utf8');
      for (const f of ['splash.html', 'splash-preload.cjs']) {
        assert.ok(
          new RegExp(`^\\s*-\\s+${f.replace('.', '\\.')}\\s*$`, 'm').test(src),
          `${yml} 未登记 ${f} —— 打包版 splash 加载失败（白壳）`,
        );
      }
    }
  });

  test('★ 反向自证：随机不存在的文件不应通过登记检查（防正则恒真）', () => {
    const src = fs.readFileSync(path.join(DESKTOP, YMLS[0]), 'utf8');
    assert.ok(
      !new RegExp(`^\\s*-\\s+splash-not-exist\\.cjs\\s*$`, 'm').test(src),
      '正则对不存在的文件返回了 true —— 检查失效',
    );
  });
});

describe('splash：preload 契约与渲染层', () => {
  test('splash-preload.cjs 暴露 onUpdate / getLastUpdate，频道名与 main.cjs 一致', () => {
    const pre = fs.readFileSync(path.join(DESKTOP, 'splash-preload.cjs'), 'utf8');
    assert.ok(pre.includes('splashAPI'), 'preload 未暴露 splashAPI');
    assert.ok(pre.includes('onUpdate'), 'preload 缺 onUpdate');
    assert.ok(pre.includes('getLastUpdate'), 'preload 缺 getLastUpdate');
    assert.ok(pre.includes("'splash:update'"), 'preload 缺 splash:update 频道');
    assert.ok(MAIN.includes("'splash:update'"), 'main.cjs 缺 splash:update 频道');
    assert.ok(MAIN.includes("'splash:get-last-update'"), 'main.cjs 缺 get-last-update handle');
  });

  test('★ 首屏就绪信号链路完整：preload 暴露 notifyUiReady → 渲染层 mount 后调用', () => {
    const pre = fs.readFileSync(path.join(DESKTOP, 'preload.cjs'), 'utf8');
    assert.ok(pre.includes('notifyUiReady'), 'preload 未暴露 notifyUiReady');
    assert.ok(pre.includes("ipcRenderer.send('ui-ready')"), 'preload 未发送 ui-ready');
    const renderer = fs.readFileSync(path.join(DESKTOP, 'src', 'main.ts'), 'utf8');
    const mounts = renderer.match(/app\.mount\('#app'\)/g) || [];
    const calls = renderer.match(/notifyUiReady\(\)/g) || [];
    assert.ok(mounts.length >= 1, '渲染层找不到 app.mount');
    // 两处挂载（正常 / 降级）都必须发信号，否则降级路径会卡在 splash
    assert.ok(
      calls.length >= mounts.length,
      `渲染层 notifyUiReady 调用(${calls.length})少于 app.mount(${mounts.length}) —— 降级路径会卡 splash`,
    );
  });

  test('★ splash.html 把真实 pct 绑定到进度条宽度，且失败态会终止', () => {
    const html = fs.readFileSync(path.join(DESKTOP, 'splash.html'), 'utf8');
    assert.ok(html.includes('splashAPI'), 'splash.html 未使用 splashAPI');
    assert.match(html, /bar\.style\.width = pct \+ '%'/, '进度条没有绑定真实 pct（又退回假滑条）');
    assert.ok(html.includes('pctEl.textContent'), '缺少百分比数字');
    assert.ok(html.includes('pending'), '缺少「未收到数据」的 indeterminate 兜底');
    assert.ok(html.includes('animation'), '缺少兜底滑条动画');
    assert.ok(html.includes('terminated'), '失败态没有终止标志，会被普通 update 冲回蓝条');
    assert.ok(html.includes('failed'), 'splash.html 缺失败态样式');
  });

  test('main.cjs 引用 splash.html / splash-preload.cjs 的路径真实存在', () => {
    assert.ok(MAIN.includes("'splash.html'"), 'main.cjs 未加载 splash.html');
    assert.ok(MAIN.includes("'splash-preload.cjs'"), 'main.cjs 未加载 splash-preload.cjs');
    assert.ok(fs.existsSync(path.join(DESKTOP, 'splash.html')));
    assert.ok(fs.existsSync(path.join(DESKTOP, 'splash-preload.cjs')));
  });
});

describe('splash：真实进度上报链路', () => {
  test('主进程 require 同一份纯函数实现（不是另写一份）', () => {
    assert.ok(MAIN.includes("require('./splash-progress.cjs')"), 'main.cjs 未接入进度模块');
    assert.ok(fs.existsSync(path.join(DESKTOP, 'splash-progress.cjs')));
  });

  test('★ splash 存活期间必须有阶段内定时刷新，销毁时停止', () => {
    assert.ok(MAIN.includes('SPLASH_PROGRESS_TICK_MS'), '缺少阶段内刷新间隔');
    assert.ok(MAIN.includes('splashBoot.refresh()'), '进度心跳未调用纯函数 refresh');
    const create = mainCode.indexOf('function createSplashWindow()');
    const destroy = mainCode.indexOf('function destroySplashWindow()');
    assert.ok(create > 0 && destroy > create);
    assert.ok(mainCode.slice(create, destroy).includes('startSplashProgressTicker()'));
    assert.ok(mainCode.slice(destroy, destroy + 500).includes('stopSplashProgressTicker()'));
  });

  test('★ 六个阶段都在真实启动事件上打点', () => {
    for (const phase of ['prepare', 'backend', 'connect', 'window', 'render', 'done']) {
      assert.ok(
        mainCode.includes(`reportBootPhase('${phase}'`),
        `缺少 ${phase} 阶段上报 —— 进度条会在该阶段停住`,
      );
    }
  });

  test('★ 满格帧：show 之后推 done，延后销毁让用户真的看到 100%', () => {
    const gate = mainCode.indexOf('const revealMainWindow = () => {');
    assert.ok(gate > 0);
    const seg = mainCode.slice(gate, gate + 1200);
    const showIdx = seg.indexOf('mainWindow.show()');
    const doneIdx = seg.indexOf("reportBootPhase('done')");
    const destroyIdx = seg.indexOf('destroySplashWindow();');
    assert.ok(showIdx > 0 && doneIdx > showIdx, 'done 必须在 mainWindow.show() 之后');
    assert.ok(destroyIdx > doneIdx, '必须先推满格再销毁 splash');
    assert.ok(seg.includes('SPLASH_FINISH_HOLD_MS'), '缺少满格停留时长');
    const hold = Number((MAIN.match(/SPLASH_FINISH_HOLD_MS = (\d+)/) || [])[1]);
    assert.ok(hold >= 260, `满格停留 ${hold}ms 小于进度条 CSS 过渡 260ms，用户看不到走满`);
  });

  test('★ 后端启动失败也推失败态（原来只弹模态框，splash 永久转圈）', () => {
    const anchor = mainCode.indexOf("后端] 启动失败:");
    assert.ok(anchor > 0, '找不到后端启动失败分支');
    assert.ok(
      mainCode.slice(anchor, anchor + 500).includes('reportBootFailure('),
      '后端启动失败时 splash 没有停下来',
    );
  });

  test('★ splash-progress.cjs 登记进四份 yml 的 files:', () => {
    for (const yml of YMLS) {
      const src = fs.readFileSync(path.join(DESKTOP, yml), 'utf8');
      assert.ok(
        /^\s*-\s+splash-progress\.cjs\s*$/m.test(src),
        `${yml} 未登记 splash-progress.cjs —— 打包版启动即崩`,
      );
    }
  });
});
