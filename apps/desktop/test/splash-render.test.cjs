/**
 * splash 渲染层正式测试：用 vm 真跑 splash.html 里的 <script>。
 *
 * ★ 为什么不用文本断言：splash-gate.test.cjs 里的 include 断言只能证明「代码里写了」，
 *   证明不了「收到 pct 后进度条真的动了」「失败态真的不会被冲掉」。
 *   这里注入最小 DOM stub + splashAPI，把真实脚本执行一遍再断言 DOM 结果。
 *
 * 运行：node --test apps/desktop/test/splash-render.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DESKTOP = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(DESKTOP, 'splash.html'), 'utf8');
const SCRIPT = (HTML.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
assert.ok(SCRIPT, 'splash.html 里找不到可执行脚本');

function fakeEl() {
  const classes = new Set();
  return {
    textContent: '',
    style: { width: '' },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
  };
}

function boot(lastUpdate = null) {
  const els = { bar: fakeEl(), phase: fakeEl(), pct: fakeEl(), detail: fakeEl() };
  els.bar.classList.add('pending');
  els.bar.style.width = '';
  let listener = null;
  const sandbox = {
    document: { getElementById: (id) => els[id] },
    window: {
      splashAPI: {
        onUpdate(fn) { listener = fn; },
        getLastUpdate() { return Promise.resolve(lastUpdate); },
      },
    },
    Promise,
    Math,
    isFinite,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  assert.ok(typeof listener === 'function', '脚本没有注册 onUpdate 监听器');
  return { els, emit: (u) => listener(u) };
}

describe('splash 渲染层：真实进度绑定', () => {
  test('初始是 indeterminate 兜底态', () => {
    const { els } = boot();
    assert.ok(els.bar.classList.contains('pending'), '未收到数据时应保留兜底动画');
    assert.strictEqual(els.bar.style.width, '', '未收到数据时不该写死宽度');
  });

  test('★ 收到 pct 后进度条真的按百分比改写，且切离兜底动画', () => {
    const { els, emit } = boot();
    emit({ phase: 'connect', pct: 42, caption: '正在连接后端服务…', detail: '已等待 3 秒', failed: false });
    assert.strictEqual(els.bar.style.width, '42%');
    assert.strictEqual(els.pct.textContent, '42%');
    assert.strictEqual(els.phase.textContent, '正在连接后端服务…');
    assert.strictEqual(els.detail.textContent, '已等待 3 秒');
    assert.ok(!els.bar.classList.contains('pending'), '收到真实进度后必须停掉 indeterminate');
  });

  test('★ 后端回退的数值被前端钳制，进度条不倒退', () => {
    const { els, emit } = boot();
    emit({ pct: 60, caption: '正在加载界面…' });
    emit({ pct: 25, caption: '正在连接后端服务…' });
    assert.strictEqual(els.bar.style.width, '60%');
    assert.strictEqual(els.pct.textContent, '60%');
  });

  test('pct 始终夹在 0～100', () => {
    const { els, emit } = boot();
    emit({ pct: 999 });
    assert.strictEqual(els.bar.style.width, '100%');
    emit({ pct: -20 });
    assert.strictEqual(els.bar.style.width, '100%');
  });

  test('旧式只有 caption 的 update 仍能显示文案，不改宽度', () => {
    const { els, emit } = boot();
    emit({ caption: '正在启动后端服务…' });
    assert.strictEqual(els.phase.textContent, '正在启动后端服务…');
    assert.strictEqual(els.bar.style.width, '');
  });
});

describe('splash 渲染层：失败态终止', () => {
  test('★ 失败态铺满红条、显示原因、百分比改为占位符', () => {
    const { els, emit } = boot();
    emit({ pct: 55, caption: '正在连接后端服务…' });
    emit({ failed: true, caption: '启动失败', detail: '后端服务未能启动\n请查看 server.log' });
    assert.strictEqual(els.bar.style.width, '100%', 'inline width 优先于 .failed，必须显式铺满');
    assert.ok(els.bar.classList.contains('failed'));
    assert.strictEqual(els.pct.textContent, '—');
    assert.strictEqual(els.phase.textContent, '启动失败');
    assert.match(els.detail.textContent, /server\.log/);
    assert.ok(els.detail.classList.contains('failed-text'));
  });

  test('★ 失败态之后的普通 update 全部被忽略（红条不会被冲回蓝条）', () => {
    const { els, emit } = boot();
    emit({ failed: true, caption: '启动失败', detail: '120 秒超时' });
    emit({ pct: 100, caption: '即将完成…', detail: '恢复中' });
    assert.strictEqual(els.bar.style.width, '100%');
    assert.ok(els.bar.classList.contains('failed'));
    assert.strictEqual(els.phase.textContent, '启动失败');
    assert.strictEqual(els.detail.textContent, '120 秒超时');
  });

  test('getLastUpdate 回拉的状态也会立即渲染', async () => {
    const { els } = boot({ pct: 30, caption: '正在启动后端服务…', detail: '', failed: false });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(els.bar.style.width, '30%');
    assert.strictEqual(els.phase.textContent, '正在启动后端服务…');
  });
});
