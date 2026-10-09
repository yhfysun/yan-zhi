/**
 * 桌面侧「按 tab 分桶的连续无变化计数」与服务端一致性（B7，2026-10-09）。
 *
 * ★★★ 为什么必须有这条测试：
 *   `main.cjs` 是 **CJS**（Electron 主进程），而 `@yan-zhi/shared` 是
 *   `type: module` + TS 源码（`main: ./src/index.ts`）→ **CJS require 不了**（实测）。
 *   所以桌面侧内联了一份等价实现（`recordNoChange`），而不是 require 共享类。
 *   ⇒ 内联就有漂移风险：**必须钉住"行为与文案都与服务端逐字一致"**，
 *     否则同一工具在两条链路上又给出不同反馈（那正是 B6/B7 要消灭的那类 bug）。
 *
 * 运行：node --test apps/desktop/test/keyed-streak-parity.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'src', 'routes', 'browser.ts'), 'utf8');
const SHARED = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'utils', 'keyed-streak.ts'), 'utf8');

/** 从 main.cjs 抽出 recordNoChange 的实现并**真跑**（避免只查字符串） */
function loadRecordNoChange() {
  const start = MAIN.indexOf('function recordNoChange(');
  assert.ok(start > -1, '★ main.cjs 里找不到 recordNoChange');
  // 取到函数结束：下一个顶层 `}` 后跟空行/注释的位置 —— 用花括号配平更稳
  let i = MAIN.indexOf('{', start), depth = 0, end = -1;
  for (; i < MAIN.length; i++) {
    if (MAIN[i] === '{') depth++;
    else if (MAIN[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > start, '★ 无法定位 recordNoChange 函数体结束');
  const fnSrc = MAIN.slice(start, end);
  const tableSrc = 'const noChangeStreaks = new Map();\nconst NO_CHANGE_THRESHOLD = 3;\n';
  // eslint-disable-next-line no-new-func
  return new Function(tableSrc + fnSrc + '\nreturn { recordNoChange, noChangeStreaks };')();
}

describe('① 桌面侧真跑：按 tab 分桶语义', () => {
  test('★★★ 两个 tab 互不影响（核心修复点）', () => {
    const { recordNoChange } = loadRecordNoChange();
    // 甲页连点 2 次无变化（**只 2 次**，未到阈值）
    assert.strictEqual(recordNoChange('A', false).streak, 1);
    const a2 = recordNoChange('A', false);
    assert.strictEqual(a2.streak, 2);
    assert.strictEqual(a2.warning, undefined, '★ 未到阈值就告警');
    // 乙页只点 1 次 → 必须是 1（单值实现下会变成 3 并误报）
    const b = recordNoChange('B', false);
    assert.strictEqual(b.streak, 1, '★ 乙页继承了甲页的计数（跨 tab 污染，正是本次修的缺陷）');
    assert.strictEqual(b.warning, undefined, '★ 乙页收到假告警');
  });

  test('★★★ 甲的真告警不会被乙的成功操作清零', () => {
    const { recordNoChange } = loadRecordNoChange();
    recordNoChange('A', false);
    recordNoChange('A', false);
    recordNoChange('B', true); // 乙成功 → 单值实现下会把全局 streak 清零
    const a = recordNoChange('A', false);
    assert.strictEqual(a.streak, 3, '★ 甲页的真告警被乙页的成功操作清零了（另一个方向的错）');
    assert.ok(a.warning, '★ 达到阈值未给告警');
  });

  test('★★ 成功操作只清自己那个桶', () => {
    const { recordNoChange } = loadRecordNoChange();
    recordNoChange('A', false);
    recordNoChange('A', true);
    assert.strictEqual(recordNoChange('A', false).streak, 1, '★ 成功操作未正确清零本桶');
  });

  test('★★ key 缺失时归到默认桶（退化为旧行为，不崩）', () => {
    const { recordNoChange } = loadRecordNoChange();
    assert.strictEqual(recordNoChange(null, false).streak, 1);
    assert.strictEqual(recordNoChange(undefined, false).streak, 2);
  });

  test('★★ 桶数上限兜底（防关 tab 路径漏网）', () => {
    const { recordNoChange, noChangeStreaks } = loadRecordNoChange();
    for (let i = 0; i < 260; i++) recordNoChange('tab' + i, false);
    assert.ok(noChangeStreaks.size <= 200, `★ 桶数无上限（当前 ${noChangeStreaks.size}）→ 慢泄漏`);
  });
});

describe('② 两链路一致性（防内联漂移）', () => {
  test('★★★ 告警文案必须逐字一致', () => {
    // ★ shared 的文案是**两段模板串用 `+` 拼接**（一段以 `：` 结尾、换行后 `` `改用 index …` ``）。
    //   第一版用非贪婪 `[\s\S]*?\`` 只截到第一段（假红）。
    //   ⇒ 这里直接取**两段**模板串内容再拼（不猜结构）。
    const norm = (s) => String(s).replace(/\s+/g, '');
    const tplSegs = SHARED.match(/`[^`]*连续 \$\{next\}[^`]*`/);
    assert.ok(tplSegs, '★ shared 里找不到告警文案第一段');
    // 第一段之后的第二段（下一处反引号对）
    const afterIdx = SHARED.indexOf(tplSegs[0]) + tplSegs[0].length;
    const second = SHARED.slice(afterIdx).match(/`([^`]*)`/);
    assert.ok(second, '★ shared 里找不到告警文案第二段');
    const shared = norm(
      (tplSegs[0].replace(/`/g, '').replace(/\$\{next\}/g, 'N') + second[1]).replace(/\s+/g, ''),
    );
    // 桌面：`'连续 ' + next + ' 次…'`（单段字符串拼接）
    const desktopPart = MAIN.match(/'连续 ' \+ next \+ ' 次操作页面无任何变化[\s\S]*?'/);
    assert.ok(desktopPart, '★ 桌面侧找不到告警文案');
    const desktop = norm('连续 N ' + desktopPart[0].replace(/'连续 ' \+ next \+ '/, '').replace(/^'/, '').replace(/'$/, ''));
    assert.strictEqual(desktop, shared, '★ 桌面与服务端的告警文案不一致（同工具两条链路给出不同反馈）');
  });

  test('★★ 阈值必须都是 3', () => {
    // ★ shared 的默认值是 `opts.threshold ?? 3`（不是字面量 `threshold: 3`）
    assert.match(SHARED, /threshold\s*\?\?\s*3/, '★ shared 默认阈值不是 3');
    assert.match(MAIN, /NO_CHANGE_THRESHOLD = 3/, '★ 桌面阈值不是 3');
    assert.match(SERVER, /new KeyedStreak\(\{\s*threshold:\s*3\s*\}\)/, '★ 服务端未按 3 建桶');
  });

  test('★★ 两侧都必须在 tab 关闭时删桶', () => {
    assert.match(MAIN, /noChangeStreaks\.delete\(/, '★ 桌面侧 tab 关闭未清理桶');
    assert.match(SERVER, /noChangeStreaks\.forget\(/, '★ 服务端 tab 关闭未清理桶');
  });

  test('★★★ 两侧都不得再出现模块级单值 noChangeStreak', () => {
    // 单值声明 `let noChangeStreak = 0;`（不带 s）必须消失
    assert.ok(!/let noChangeStreak\s*=/.test(MAIN), '★ 桌面侧仍有模块级单值 noChangeStreak');
    assert.ok(!/let noChangeStreak\s*=/.test(SERVER), '★ 服务端仍有模块级单值 noChangeStreak');
  });
});