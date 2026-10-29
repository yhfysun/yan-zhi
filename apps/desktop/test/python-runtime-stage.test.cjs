// Python 运行时随 computer-use 插件裁剪：移动/留空壳/恢复。
//
// 错了的代价：① 未选 computer-use 的包仍塞进 ~400MB 解释器（extraResources 无条件拷贝）；
// ② 裁完不恢复 → 开发机的 python 运行时被搬走，后续构建/调试全线"找不到 Python"；
// ③ 目录整个删掉 → electron-builder 对缺失的 extraResources.from 直接报错。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { stagePythonRuntime, restorePythonRuntime, HOLD_DIR_NAME } = require('../scripts/lib/python-runtime-stage.cjs');

function tmpResources() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-py-'));
  fs.mkdirSync(path.join(dir, 'python'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'python', 'python.exe'), 'bin');
  fs.mkdirSync(path.join(dir, 'python-tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'python-tools', 'tool.py'), 'print(1)');
  return dir;
}

const isEmptyDir = (p) => fs.existsSync(p) && fs.readdirSync(p).length === 0;

test('未选 computer-use：内容移到暂存区，留空壳（extraResources 有源可拷）', () => {
  const dir = tmpResources();
  const r = stagePythonRuntime({ resourcesDir: dir, keep: false });
  assert.deepEqual(r.moved.sort(), ['python', 'python-tools']);
  assert.ok(isEmptyDir(path.join(dir, 'python')), '空壳目录必须存在（否则 electron-builder 报 missing from）');
  assert.ok(isEmptyDir(path.join(dir, 'python-tools')));
  assert.ok(fs.existsSync(path.join(dir, HOLD_DIR_NAME, 'python', 'python.exe')));
  assert.ok(fs.existsSync(path.join(dir, HOLD_DIR_NAME, 'python-tools', 'tool.py')));
});

test('恢复：内容原样移回、暂存区清空', () => {
  const dir = tmpResources();
  stagePythonRuntime({ resourcesDir: dir, keep: false });
  restorePythonRuntime({ resourcesDir: dir });
  assert.ok(fs.existsSync(path.join(dir, 'python', 'python.exe')));
  assert.ok(fs.existsSync(path.join(dir, 'python-tools', 'tool.py')));
  assert.ok(!fs.existsSync(path.join(dir, HOLD_DIR_NAME)));
});

test('选中 computer-use：不裁剪，但会先恢复上次崩溃残留', () => {
  const dir = tmpResources();
  // 制造"上次裁剪后崩溃"的现场
  stagePythonRuntime({ resourcesDir: dir, keep: false });
  const r = stagePythonRuntime({ resourcesDir: dir, keep: true });
  assert.equal(r.skipped, true);
  assert.ok(fs.existsSync(path.join(dir, 'python', 'python.exe')));
  assert.ok(fs.existsSync(path.join(dir, 'python-tools', 'tool.py')));
});

test('从未生成过：也建空壳，保证打包不因缺源中断', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-py-empty-'));
  stagePythonRuntime({ resourcesDir: dir, keep: false });
  assert.ok(isEmptyDir(path.join(dir, 'python')));
  assert.ok(isEmptyDir(path.join(dir, 'python-tools')));
});
