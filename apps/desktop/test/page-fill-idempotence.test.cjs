// 填表幂等 + 失败熔断 单元测试（2026-10-19，P0）
//
// 背景（用户实报，conv cd857565）：抖音发布页描述框是 Draft.js contenteditable，
// 模型反复「清空—重填—回读」2 小时，出现「拜师那天拜师那天，师父递给我…」重复前缀，
// 表单看着填好了却始终没点发布，最后任务超时。
//
// 本测试从 main.cjs 的 ===YZ-FILL-RULES-START/END=== 哨兵块抽取**真实代码**执行
// （与 click-occlusion.test.cjs 同款手法），并静态钉住三处接线，防止修复被删。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = MAIN.indexOf('// ===YZ-FILL-RULES-START===');
const end = MAIN.indexOf('// ===YZ-FILL-RULES-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 YZ-FILL-RULES 哨兵块');

const { yzNormText, yzFillCompare, yzNextFillState } = new Function(
  MAIN.slice(start, end) + '\nreturn { yzNormText, yzFillCompare, yzNextFillState };',
)();

test('规范化：去零宽字符、折叠空白、trim', () => {
  assert.equal(yzNormText('  第一行\n第二行\t  '), '第一行 第二行');
  assert.equal(yzNormText('ab​c﻿'), 'abc');
  assert.equal(yzNormText(null), '');
});

test('已填判定：完全相等 → applied，unchanged', () => {
  const r = yzFillCompare('拜师那天，师父递给我一杯黑茶。', '拜师那天，师父递给我一杯黑茶。');
  assert.equal(r.applied, true);
  assert.equal(r.equal, true);
});

test('已填判定：页面追加话题/格式（包含关系）→ applied，不算重复', () => {
  const r = yzFillCompare('拜师那天，师父递给我一杯黑茶。#番茄小说', '拜师那天，师父递给我一杯黑茶。');
  assert.equal(r.applied, true);
  assert.equal(r.equal, false);
  assert.equal(r.contains, true);
});

test('已填判定：当前为空、期望非空 → 未填（不会被 indexOf("") 误判）', () => {
  const r = yzFillCompare('', '拜师那天');
  assert.equal(r.applied, false);
});

test('重复前缀不算已填（本次抖音现场的真实坏值）', () => {
  // got =「拜师那天」+ 完整目标：虽然 includes(want)，但内容是坏的 → 必须允许一次修复
  const bad = '拜师那天拜师那天，师父递给我一杯黑茶，说喝下去才算入门。';
  const want = '拜师那天，师父递给我一杯黑茶，说喝下去才算入门。';
  const r = yzFillCompare(bad, want);
  assert.equal(r.equal, false);
  assert.equal(r.contains, true, '坏值确实包含目标文本（这正是不能只看 contains 的原因）');
  assert.equal(r.duplicatePrefix, true, '未识别出重复前缀');
  assert.equal(r.applied, false, '重复前缀被误判为已填 → 坏内容会被保留');
});

test('边界：目标后面追加话题（正常页面行为）仍算已填', () => {
  const got = '拜师那天，师父递给我一杯黑茶。#番茄小说 #推文';
  const want = '拜师那天，师父递给我一杯黑茶。';
  const r = yzFillCompare(got, want);
  assert.equal(r.duplicatePrefix, false);
  assert.equal(r.applied, true);
});

test('普通输入框是替换语义：当前长值包含目标 → 不能算已填', () => {
  // 想把「hello world」改成「hello」，不能因为 contains 就跳过
  const r = yzFillCompare('hello world', 'hello');
  assert.equal(r.applied, true, '富文本口径允许包含（页面加话题）');
  assert.equal(r.appliedForm, false, '普通输入框必须允许缩短替换');
  assert.equal(yzFillCompare('hello', 'hello').appliedForm, true);
});

test('普通输入框：maxlength 截断（当前是目标的真前缀）仍算已填', () => {
  const r = yzFillCompare('拜师那天，师父递给我一', '拜师那天，师父递给我一杯黑茶。');
  assert.equal(r.truncated, true);
  assert.equal(r.appliedForm, true);
});

test('失败熔断：同一字段连续 2 次未生效 → forceStop', () => {
  const key = yzNormText('目标文本');
  let state = null;
  let g = yzNextFillState(state, key, false);
  assert.equal(g.forceStop, false, '第一次失败只记录，不熔断');
  state = g.state;
  g = yzNextFillState(state, key, false);
  assert.equal(g.fails, 2);
  assert.equal(g.forceStop, true, '第二次同字段失败必须熔断');
});

test('失败熔断：成功即清零；换期望文本重新计数', () => {
  const k1 = yzNormText('文本一');
  let g = yzNextFillState(null, k1, false);
  g = yzNextFillState(g.state, k1, true);
  assert.equal(g.state, null);
  assert.equal(g.forceStop, false);

  // 换了一个期望文本：不能沿用旧 key 的失败次数
  const k2 = yzNormText('文本二');
  const before = { key: k1, fails: 1 };
  const next = yzNextFillState(before, k2, false);
  assert.equal(next.fails, 1);
  assert.equal(next.forceStop, false);
});

test('接线契约：typeIn 写前先读（幂等短路）', () => {
  const i = MAIN.indexOf('function typeIn(el,text){');
  assert.ok(i > 0, '未找到 typeIn');
  const body = MAIN.slice(i, i + 4000);
  assert.match(body, /yzFillCompare\(_cur,t\)/, 'typeIn 未在写入前比较当前值');
  assert.match(body, /unchanged:_pre\.equal/, 'typeIn 未返回 unchanged 标记');
  assert.match(body, /yzFillGuard\(el,t,_ok\)/, 'typeIn 未接失败熔断');
});

test('接线契约：cdpTypeText 命中已填时不清空编辑器', () => {
  const i = MAIN.indexOf('async function cdpTypeText(');
  assert.ok(i > 0, '未找到 cdpTypeText');
  const body = MAIN.slice(i, i + 16000);
  assert.match(body, /already:true/, '焦点脚本未返回 already 短路标记');
  assert.match(body, /via: 'idempotent-skip'/, 'cdpTypeText 未在已填时跳过打字');
  assert.match(body, /A\.yzFillGuard\(el,/, 'cdpTypeText 未接失败熔断');
});

test('接线契约：fill_form 不得在 typeIn 之前预全选（会破坏 Draft.js 内部状态）', () => {
  const i = MAIN.indexOf("case 'fill_form': {");
  assert.ok(i > 0, '未找到 fill_form');
  const body = MAIN.slice(i, i + 9000);
  assert.ok(
    !body.includes('sel2.selectAllChildren(el)'),
    'fill_form 仍保留预全选：它发生在 typeIn 的幂等判断之前，会让已填短路永远命中不了',
  );
});

test('接线契约：注入版本存在且不低于基线（旧页面必须重新注入新脚本）', () => {
  // ★ 不钉死具体数字：版本号随注入脚本每次变更递增，钉死会把"改了脚本忘了同步测试"
  //   和"真的忘了递增"混成一件事（2026-10-29 实测：脚本已到 9，此处仍断言 7 → 误报失败）。
  //   这里只保证标记存在、是数字、且不低于基线 7。
  const m = MAIN.match(/__yzVersion:(\d+)/);
  assert.ok(m, '注入脚本缺少 __yzVersion 标记');
  assert.ok(
    Number(m[1]) >= 7,
    `__yzVersion=${m[1]} 低于基线 7：注入脚本内容变了却没递增，旧页面不会重新注入`,
  );
});
