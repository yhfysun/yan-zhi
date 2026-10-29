// 确定性输入循环执行器（P1，2026-10-29）
//
// 从 main.cjs 抽取 ===RUNLOOP-START/END=== 的真实代码，用假 io 执行，钉住：
//   ① 长按（hold）语义：多键同时按下 → 保持 → 同时松开（斜向移动靠这个）；
//   ② key 的 holdMs 也是按住而不是点一下；
//   ③ 上限与中止：aborted 时**必须释放所有还按着的键**（否则角色会一直往前走）；
//   ④ rounds 重复、click/drag 顺序。
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainSrc.indexOf('// ===RUNLOOP-START===');
const end = mainSrc.indexOf('// ===RUNLOOP-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 RUNLOOP 哨兵块');
const block = mainSrc.slice(start, end);
const factory = new Function(block + '\nreturn executeRunLoop;');
const executeRunLoop = factory();

function makeIo(opts = {}) {
  const ev = [];
  let now = 0;
  return {
    ev,
    io: {
      sleep: async (ms) => { now += ms; ev.push('sleep:' + ms); },
      keyDown: (k) => ev.push('down:' + k),
      keyUp: (k) => ev.push('up:' + k),
      mouseDown: (x, y) => ev.push('mdown:' + x + ',' + y),
      mouseUp: (x, y) => ev.push('mup:' + x + ',' + y),
      mouseMove: (x, y) => ev.push('move:' + x + ',' + y),
      runScript: async (s) => { ev.push('script:' + s); return { ok: 1 }; },
      http: async (r) => { ev.push('http:' + r.url); return { status: 200 }; },
      isAborted: opts.isAborted || (() => false),
    },
    clock: () => now,
  };
}

describe('executeRunLoop（确定性输入循环）', () => {
  test('hold：两个方向键同时按下 → 保持 → 同时松开', async () => {
    const { io, ev } = makeIo();
    const r = await executeRunLoop({ steps: [{ type: 'hold', keys: ['ArrowRight', 'ArrowUp'], ms: 800 }] }, io);
    assert.strictEqual(r.aborted, null);
    assert.deepStrictEqual(ev, ['down:ArrowRight', 'down:ArrowUp', 'sleep:800', 'up:ArrowRight', 'up:ArrowUp']);
  });

  test('key + holdMs：按住 600ms 再松开（不是点一下）', async () => {
    const { io, ev } = makeIo();
    await executeRunLoop({ steps: [{ type: 'key', key: 'Space', holdMs: 600 }] }, io);
    assert.deepStrictEqual(ev, ['down:Space', 'sleep:600', 'up:Space']);
  });

  test('key 无 holdMs：短按仍要有按下/松开', async () => {
    const { io, ev } = makeIo();
    await executeRunLoop({ steps: [{ type: 'key', key: 'Enter' }] }, io);
    assert.deepStrictEqual(ev, ['down:Enter', 'sleep:30', 'up:Enter']);
  });

  test('★ 中止时必须释放所有按住的键（否则角色一直往前跑）', async () => {
    const { io, ev } = makeIo();
    let calls = 0;
    io.isAborted = () => (++calls > 2);
    const r = await executeRunLoop({
      steps: [
        { type: 'hold', keys: ['ArrowRight'], ms: 1000 },
        { type: 'wait', ms: 10 },
        { type: 'wait', ms: 10 },
      ],
    }, io);
    assert.ok(r.aborted, '应当被中止');
    const downs = ev.filter((e) => e.startsWith('down:')).length;
    const ups = ev.filter((e) => e.startsWith('up:')).length;
    assert.strictEqual(downs, ups, '按下与松开次数必须相等（不能有键残留按住）');
  });

  test('rounds 重复整串步骤', async () => {
    const { io, ev } = makeIo();
    await executeRunLoop({ steps: [{ type: 'key', key: 'ArrowDown' }], rounds: 3 }, io);
    assert.strictEqual(ev.filter((e) => e === 'down:ArrowDown').length, 3);
  });

  test('maxSteps 上限生效并中止', async () => {
    const { io } = makeIo();
    const r = await executeRunLoop({ steps: [{ type: 'wait', ms: 1 }], rounds: 50, maxSteps: 5 }, io);
    assert.strictEqual(r.steps, 5);
    assert.strictEqual(r.aborted, 'maxSteps');
  });

  test('click 与 drag 的事件顺序', async () => {
    const { io, ev } = makeIo();
    await executeRunLoop({
      steps: [
        { type: 'click', x: 10, y: 20, holdMs: 50 },
        { type: 'drag', fromX: 1, fromY: 2, toX: 3, toY: 4 },
      ],
    }, io);
    assert.deepStrictEqual(ev, [
      'mdown:10,20', 'sleep:50', 'mup:10,20',
      'mdown:1,2', 'sleep:60', 'move:3,4', 'sleep:60', 'mup:3,4',
    ]);
  });

  test('script / http 步会被执行（网页游戏调接口、本地游戏桥）', async () => {
    const { io, ev } = makeIo();
    await executeRunLoop({
      steps: [
        { type: 'script', script: 'return cc.director.getScene().name' },
        { type: 'http', url: 'http://127.0.0.1:5050/move' },
      ],
    }, io);
    assert.deepStrictEqual(ev, ['script:return cc.director.getScene().name', 'http:http://127.0.0.1:5050/move']);
  });

  test('未知步类型 → 明确中止而不是静默跳过', async () => {
    const { io } = makeIo();
    const r = await executeRunLoop({ steps: [{ type: 'jump' }] }, io);
    assert.match(String(r.aborted), /unknownStepType/);
  });

  test('脚本抛错 → aborted 带 error，不向上炸', async () => {
    const { io } = makeIo();
    io.runScript = async () => { throw new Error('boom'); };
    const r = await executeRunLoop({ steps: [{ type: 'script', script: 'x' }] }, io);
    assert.match(String(r.aborted), /^error:boom/);
  });

  test('★ 读状态也在循环里：script + as 把返回值放进 results', async () => {
    const { io } = makeIo();
    io.runScript = async (s) => (s === 'readBoard()' ? { score: 128, empty: 9 } : null);
    const r = await executeRunLoop({
      steps: [{ type: 'script', script: 'readBoard()', as: 'board' }],
    }, io);
    assert.deepStrictEqual(r.results.board, { score: 128, empty: 9 });
  });

  test('★ if 分支：条件为真走 then，为假走 else', async () => {
    const t = makeIo();
    t.io.runScript = async () => true;
    await executeRunLoop({
      steps: [{ type: 'if', script: 'isDangerous()', then: [{ type: 'key', key: 'Space' }], else: [{ type: 'key', key: 'ArrowUp' }] }],
    }, t.io);
    assert.deepStrictEqual(t.ev.filter((e) => e.startsWith('down:')), ['down:Space']);

    const f = makeIo();
    f.io.runScript = async () => false;
    await executeRunLoop({
      steps: [{ type: 'if', script: 'isDangerous()', then: [{ type: 'key', key: 'Space' }], else: [{ type: 'key', key: 'ArrowUp' }] }],
    }, f.io);
    assert.deepStrictEqual(f.ev.filter((e) => e.startsWith('down:')), ['down:ArrowUp']);
  });

  test('★ until：每轮后判断，命中即正常停止（aborted=until，不是错误）', async () => {
    const { io, ev } = makeIo();
    let score = 0;
    io.runScript = async () => (score += 100) >= 200;   // 第二轮命中
    const r = await executeRunLoop({
      steps: [{ type: 'key', key: 'ArrowDown' }],
      rounds: 10,
      until: 'score >= 200',
    }, io);
    assert.strictEqual(r.aborted, 'until');
    assert.strictEqual(ev.filter((e) => e === 'down:ArrowDown').length, 2, '命中后不应继续下一轮');
  });
});
