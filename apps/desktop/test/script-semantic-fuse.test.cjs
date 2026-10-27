// run_script 语义熔断 单元测试（2026-10-27，P0）
//
// 背景（用户实报，conv c79811d2）：抖音编辑页把纯文本话题升级成 chip，模型反复写
// 「清空末行 → insertText #周报 → 回读」的脚本。脚本每次只改一个字符/一句 log，
// tool-loop-guard 的"参数完全一致"命中不了；换 URL 加 &t=2 又能把按 href 计数的
// scriptGateCheck 清零 ⇒ 一小时 96 次 run_script，同一段话题被反复擦除重写。
//
// 本测试从 main.cjs 的 ===YZ-SCRIPT-FUSE-START/END=== 哨兵块抽取**真实代码**执行
// （与 page-fill-idempotence.test.cjs 同款手法），并静态钉住两处接线。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = MAIN.indexOf('// ===YZ-SCRIPT-FUSE-START===');
const end = MAIN.indexOf('// ===YZ-SCRIPT-FUSE-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 YZ-SCRIPT-FUSE 哨兵块');

const { yzScriptFuseCheck, yzScriptFuseKey, yzFuseNormUrl } = new Function(
  MAIN.slice(start, end) + '\nreturn { yzScriptFuseCheck, yzScriptFuseKey, yzFuseNormUrl };',
)();

const PAGE = 'https://creator.douyin.com/creator-micro/content/post/video?mid=7700959060102794505&enter_from=edit_item';
const EDITOR_SEL = 'div[data-slate-editor="true"]';

const destructive = (topic, log = '') =>
  `const ed=document.querySelector('${EDITOR_SEL}');`
  + `ed.focus();document.execCommand('delete');`
  + `document.execCommand('insertText',false,'#${topic}');`
  + (log ? `log.push('${log}');` : '');

test('只读脚本不参与熔断', () => {
  const script = `return document.querySelector('${EDITOR_SEL}').innerText;`;
  assert.equal(yzScriptFuseKey(script), null);
  const st = new Map();
  for (let i = 0; i < 10; i++) {
    assert.equal(yzScriptFuseCheck(script, PAGE, st).blocked, false);
  }
});

test('光标定位（selectNodeContents 建 Range + 插入）不算破坏性脚本', () => {
  // 话题配方正是这么定位光标的：只建 Range + insertText，没有任何删除/整段赋值
  const script = `const ed=document.querySelector('${EDITOR_SEL}');`
    + `const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);`
    + `const s=window.getSelection();s.removeAllRanges();s.addRange(r);`
    + `document.execCommand('insertText',false,'#');`;
  assert.equal(yzScriptFuseKey(script), null);
  const st = new Map();
  for (let i = 0; i < 5; i++) {
    assert.equal(yzScriptFuseCheck(script, PAGE, st).blocked, false);
  }
});

test('同目标 + 同载荷：第 2 次即拒绝', () => {
  const st = new Map();
  const r1 = yzScriptFuseCheck(destructive('周报'), PAGE, st);
  assert.equal(r1.blocked, false, '第一次应放行');
  const r2 = yzScriptFuseCheck(destructive('周报'), PAGE, st);
  assert.equal(r2.blocked, true, '第二次必须拦下');
  assert.match(r2.message, /同一编辑目标/);
});

test('脚本微调（log/等待/变量名变化）仍识别为同一目标', () => {
  const st = new Map();
  yzScriptFuseCheck(destructive('周报', '第一版日志文案比较长，超过二十个字符就会被排除在载荷之外'), PAGE, st);
  const r = yzScriptFuseCheck(
    destructive('周报', '第二版日志文案同样很长，换了措辞和标点，不应该改变指纹')
      + 'await new Promise(r=>setTimeout(r,300));',
    PAGE,
    st,
  );
  assert.equal(r.blocked, true, '换 log / 加等待不能绕过指纹');
});

test('同目标换文案：第 4 次拒绝（不是文案问题）', () => {
  const st = new Map();
  assert.equal(yzScriptFuseCheck(destructive('周报'), PAGE, st).blocked, false);
  assert.equal(yzScriptFuseCheck(destructive('Excel技巧'), PAGE, st).blocked, false);
  assert.equal(yzScriptFuseCheck(destructive('职场'), PAGE, st).blocked, false);
  const r = yzScriptFuseCheck(destructive('打工人'), PAGE, st);
  assert.equal(r.blocked, true);
  assert.match(r.message, /换了不同文案/);
});

test('URL 缓存参数 &t=2 不再能重置计数', () => {
  const st = new Map();
  yzScriptFuseCheck(destructive('周报'), PAGE, st);
  const r = yzScriptFuseCheck(destructive('周报'), PAGE + '&t=2', st);
  assert.equal(r.blocked, true, '&t=2 归一化后仍是同一页');
  assert.equal(yzFuseNormUrl(PAGE + '&t=2&_t=99'), yzFuseNormUrl(PAGE));
});

test('不同作品（mid 不同）各自独立计数', () => {
  const st = new Map();
  const other = PAGE.replace('7700959060102794505', '7700901457016425754');
  yzScriptFuseCheck(destructive('周报'), PAGE, st);
  const r = yzScriptFuseCheck(destructive('周报'), other, st);
  assert.equal(r.blocked, false, '换作品不应继承上一个作品的计数');
});

test('同一页不同字段各自独立计数', () => {
  const st = new Map();
  const titleScript = (topic) =>
    `const el=document.querySelector('input[placeholder*="填写作品标题"]');`
    + `el.value='';el.value='${topic}';`;
  yzScriptFuseCheck(destructive('周报'), PAGE, st);
  const r = yzScriptFuseCheck(titleScript('标题'), PAGE, st);
  assert.equal(r.blocked, false, '描述框的计数不应误伤标题框');
});

test('接线契约：run_script 接入语义熔断并返回专用错误码', () => {
  const i = MAIN.indexOf("case 'run_script':");
  assert.ok(i > 0, '未找到 run_script 分支');
  const body = MAIN.slice(i, i + 3000);
  assert.match(body, /yzScriptFuseCheck\(/, 'run_script 未调用语义熔断');
  assert.match(body, /script_semantic_loop/, '未返回 script_semantic_loop 错误码');
});

test('接线契约：reload 先查已填字段，force 才放行', () => {
  // main.cjs 里有两个 reload：browser:call 已废弃通道（无校验）与 browserView:action
  // 在用通道（本改动）。取最后一个，钉住真正生效的那处。
  const i = MAIN.lastIndexOf("case 'reload':");
  assert.ok(i > 0, '未找到 reload 分支');
  const body = MAIN.slice(i, i + 1200);
  assert.match(body, /拒绝刷新/, 'reload 未复用已填字段保护');
  assert.match(body, /args\.force/, 'reload 缺少 force 出口');
});
