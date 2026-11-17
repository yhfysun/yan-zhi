/**
 * 启动加载壳进度计算的正式单测。
 *
 * ★ 为什么是「真跑纯函数」而不是源码文本断言：进度回退、提前满格、失败态被冲掉
 *   都是运行时行为，静态 include 断言抓不住。主进程 require 的也是同一份实现
 *   （apps/desktop/splash-progress.cjs），测试与生产共用，不存在「测的是另一份」。
 *
 * 运行：node --test apps/desktop/test/splash-progress.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { createBootProgress, PHASES, BOUNDARIES } = require('../splash-progress.cjs');

/** 可注入时钟，让所有断言确定性 */
function clock(start = 0) {
  let t = start;
  return {
    now: () => t,
    tick: (ms) => { t += ms; },
  };
}

describe('启动进度：阶段定义', () => {
  test('六阶段权重累计恰好到 100', () => {
    assert.strictEqual(PHASES.length, 6);
    assert.deepStrictEqual(BOUNDARIES, [8, 30, 60, 75, 95, 100]);
    assert.strictEqual(BOUNDARIES[BOUNDARIES.length - 1], 100);
  });

  test('每个阶段都有中文文案', () => {
    for (const p of PHASES) {
      assert.ok(p.id && p.weight > 0 && p.caption.length > 0, `阶段 ${p.id} 定义不完整`);
    }
  });
});

describe('启动进度：单调与满格判据', () => {
  test('按阶段顺序推进，pct 单调不减', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    const seen = [];
    for (const phase of ['prepare', 'backend', 'connect', 'window', 'render', 'done']) {
      c.tick(500);
      const u = p.advance(phase);
      assert.ok(u, `${phase} 阶段应产生一次更新`);
      seen.push(u.pct);
      assert.strictEqual(u.failed, false);
    }
    for (let i = 1; i < seen.length; i += 1) {
      assert.ok(seen[i] >= seen[i - 1], `进度在 ${i} 处回退：${seen.join(' → ')}`);
    }
    assert.strictEqual(seen[seen.length - 1], 100);
  });

  test('★ 未进入 done 阶段时永远不到 100（不能假完成）', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now, tauMs: 1000 });
    p.advance('connect');
    for (let i = 0; i < 60; i += 1) {
      c.tick(1000); // 阶段内等满 60 秒
      const u = p.advance('connect');
      if (u) assert.ok(u.pct < 100, `阶段内衰减不该到 100，实际 ${u.pct}`);
    }
    assert.ok(p.state.pct < 100, `衰减曲线必须只逼近阶段上限，实际 ${p.state.pct}`);
    // connect 阶段上限是 60，不该跨到下一阶段
    assert.ok(p.state.pct < 60, `阶段内不该跨过本阶段上限 60，实际 ${p.state.pct}`);
  });

  test('★ 100 只能由 done 阶段（mainWindow.show 的真实事件）触发', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    for (const phase of ['prepare', 'backend', 'connect', 'window', 'render']) {
      p.advance(phase);
      c.tick(200);
    }
    assert.ok(p.state.pct < 100, 'show 之前不得满格');
    const done = p.advance('done');
    assert.strictEqual(done.pct, 100);
    assert.strictEqual(done.phase, 'done');
  });

  test('★ 回退到更早阶段被拒绝，且不产生任何更新', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('window');
    const before = p.state.pct;
    assert.strictEqual(p.advance('backend'), null);
    assert.strictEqual(p.advance('prepare'), null);
    assert.strictEqual(p.state.pct, before, '回退请求不得改动进度');
  });

  test('阶段内衰减只逼近上限，不跳到下一阶段', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now, tauMs: 1000 });
    p.advance('connect'); // base=30, weight=30, 上限 59
    c.tick(3000);
    const u = p.advance('connect');
    assert.ok(u, '阶段内进度变化应产生更新');
    assert.ok(u.pct >= 30 && u.pct < 60, `应落在 [30,60) 区间，实际 ${u.pct}`);
  });

  test('节流：pct 与 detail 都没变时不重复发 IPC', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    assert.ok(p.advance('connect'), '首次进入阶段应发一次');
    assert.strictEqual(p.advance('connect'), null, '同一时刻重复调用不该刷屏');
  });

  test('★ 细小增量按“上次已发送值”累计，不能被逐次状态更新吞掉', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now, tauMs: 6000 });
    assert.strictEqual(p.advance('prepare').pct, 0);
    c.tick(250);
    assert.strictEqual(p.advance('prepare'), null, '单次增量不足阈值时不发 IPC');
    c.tick(250);
    const u = p.advance('prepare');
    assert.ok(u, '累计变化超过阈值后必须发送，否则会永久停在 0%');
    assert.ok(u.pct > 0, `累计后的进度应大于 0，实际 ${u.pct}`);
  });

  test('refresh() 在当前阶段内持续推进，不依赖再次上报阶段名', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now, tauMs: 6000 });
    p.advance('backend');
    c.tick(500);
    const first = p.refresh();
    assert.ok(first, '阶段内刷新应产生进度');
    assert.strictEqual(first.phase, 'backend');
    const before = first.pct;
    c.tick(1500);
    const second = p.refresh();
    assert.ok(second, '继续刷新应产生新进度');
    assert.ok(second.pct > before, '同一阶段内百分比必须持续增长');
  });
});

describe('启动进度：当前动作与失败态', () => {
  test('detail() 只改文案，不推进阶段也不改 pct', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('connect');
    const beforePct = p.state.pct;
    const u = p.detail('已等待 3 秒');
    assert.ok(u);
    assert.strictEqual(u.pct, beforePct);
    assert.strictEqual(u.phase, 'connect');
    assert.strictEqual(u.detail, '已等待 3 秒');
    assert.strictEqual(p.detail('已等待 3 秒'), null, '相同文案不该重复发');
  });

  test('完成态不再接受 detail 改写（防满格帧被旁路事件改花）', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('done');
    assert.strictEqual(p.detail('后端服务异常退出'), null);
  });

  test('★ 失败态返回 failed:true 并保留当前进度', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('window');
    const before = p.state.pct;
    const u = p.fail('后端服务未能启动');
    assert.strictEqual(u.failed, true);
    assert.strictEqual(u.pct, Math.round(before * 10) / 10);
    assert.match(u.detail, /后端服务未能启动/);
    assert.strictEqual(u.caption, '启动失败');
  });

  test('★ 失败态终止后不再接受任何普通更新（红条不会被冲回蓝条）', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('render');
    p.fail('120 秒超时');
    c.tick(5000);
    assert.strictEqual(p.advance('done'), null);
    assert.strictEqual(p.detail('恢复中'), null);
    assert.strictEqual(p.fail('又一次失败'), null, '失败态只能发一次');
  });

  test('★ current() 在失败后仍返回失败态，不能在 splash 重放时复活', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    p.advance('backend');
    p.fail('后端启动失败');
    assert.strictEqual(p.current().failed, true);
    assert.match(p.current().detail, /后端启动失败/);
  });

  test('current() 在尚未打点时返回 null（渲染层保留 indeterminate 兜底）', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    assert.strictEqual(p.current(), null);
    p.advance('backend');
    assert.strictEqual(p.current().phase, 'backend');
    assert.strictEqual(p.current().failed, false);
  });

  test('refresh() 在尚未进入阶段或失败终止后返回 null', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    assert.strictEqual(p.refresh(), null);
    p.advance('connect');
    p.fail('启动失败');
    c.tick(5000);
    assert.strictEqual(p.refresh(), null);
  });

  test('未知阶段名被忽略，不产生更新', () => {
    const c = clock();
    const p = createBootProgress({ now: c.now });
    assert.strictEqual(p.advance('not-a-phase'), null);
    assert.strictEqual(p.state.phaseIndex, -1);
  });
});
