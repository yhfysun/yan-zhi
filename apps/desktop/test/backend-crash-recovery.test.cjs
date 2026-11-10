/**
 * 后端异常退出恢复回归测试。
 *
 * 现场：tesseract 依赖在 Node 24 下解析失败，后端进程 code=1 退出；主窗口仍开着，
 * 前端不断重连但永远等不到后端，最终表现为卡死白屏，只能手动重启应用。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

function functionBody(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  assert.ok(start > -1, `找不到 ${name}`);
  const next = MAIN.indexOf('\nfunction ', start + 1);
  const end = next > -1 ? next : MAIN.length;
  return MAIN.slice(start, end);
}

test('★ 非守护模式的后端异常退出必须触发受控自动重启', () => {
  const exitAt = MAIN.indexOf("serverProcess.on('exit', (code) => {");
  assert.ok(exitAt > -1, '找不到生产后端 exit 监听');
  const exitBody = MAIN.slice(exitAt, MAIN.indexOf("if (detached && serverProcess)", exitAt));
  assert.match(exitBody, /scheduleBackendRestart\(code, detached\)/);
});

test('★ 重启有次数上限，用户主动退出和守护模式不得拉起新进程', () => {
  const body = functionBody('scheduleBackendRestart');
  assert.match(body, /isQuitting/);
  assert.match(body, /detached/);
  assert.match(body, /BACKEND_AUTO_RESTART_MAX/);
});

test('★ 重启成功后主动刷新渲染层，避免继续停在白屏/死重连状态', () => {
  const body = functionBody('scheduleBackendRestart');
  assert.match(body, /isServerAlive\(\)/);
  assert.match(body, /reloadIgnoringCache\(\)/);
});
