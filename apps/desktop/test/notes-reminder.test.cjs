/**
 * 笔记到期提醒锚点测试（docs/笔记功能方案-2026-11-14.md §4，范式照 desktop-shell / 源码锚点断言）。
 *
 * main.cjs 无法在 node:test 里 require（依赖 electron）—— 按 desktop 测试惯例抽**源码锚点**：
 * 「代码里明明写了」不信，但锚点钉的是**接线关系**（谁被并进同一个 interval、URL、事件名），
 * 这些恰恰是"拼错名 = 静默丢提醒"的事故面。纯逻辑（drain 幂等/时间判定）已由
 * apps/server/test/notes-*.test.ts 真跑覆盖，这里不重复。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(__dirname, '..', 'preload.cjs'), 'utf8');

test('笔记提醒轮询并入插件 15s interval（同一个 setInterval，不另起定时器）', () => {
  const m = MAIN.match(/setInterval\(\(\) => \{ void pollPluginReminders\(\); void pollNoteReminders\(\); \}, REMINDER_POLL_MS\)/);
  assert.ok(m, 'pollNoteReminders 必须与 pollPluginReminders 并入同一个 REMINDER_POLL_MS interval（拆两个定时器 = 双份轮询面）');
});

test('drain 端点接线：POST /api/notes/reminders/drain（免 JWT 本机回环，服务端已限 127.0.0.1）', () => {
  assert.ok(MAIN.includes("'/api/notes/reminders/drain'"), 'drain URL 拼错 = 提醒永远静默不响');
  const body = MAIN.match(/pollNoteReminders\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(/method:\s*'POST'/.test(body), 'drain 必须 POST（服务端按 POST 消费）');
});

test('投递链路：宠物气泡优先 → 系统 Notification 降级；点击通知发 notes:open 带 noteId', () => {
  const fn = MAIN.match(/function deliverNoteReminder\(item\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fn.includes("petWindow.webContents.send('pet:say'"), '宠物开着必须走气泡（优先级）');
  assert.ok(fn.includes('new Notification'), '宠物没开必须降级系统通知');
  assert.ok(fn.includes(".on('click'"), '通知必须可点击');
  assert.ok(fn.includes(".send('notes:open'"), '点击必须发 notes:open 事件（前端据此跳 /notes 定位）');
  assert.ok(fn.includes('noteId'), 'notes:open 必须带 noteId（/notes 定位该条）');
});

test('preload 暴露 electronAPI.notes.onOpenRequest（监听 notes:open，且注销监听器防泄漏）', () => {
  assert.ok(PRELOAD.includes("notes: {"), 'preload 未暴露 notes 桥');
  assert.ok(PRELOAD.includes("ipcRenderer.on('notes:open'"), 'notes:open 事件名两边必须逐字一致');
  assert.ok(/onOpenRequest[\s\S]*?removeListener/.test(PRELOAD), 'onOpenRequest 必须返回注销函数（监听器泄漏 = 主窗重复跳转）');
});
