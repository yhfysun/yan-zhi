// 待办提醒纯函数单测（到点规则 / 一天一次 / 不补旧账）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDue, describeDue, parseHm, batchTimeOf, dayKey, BATCH_KEY,
} from './reminders.js';

const at = (h, m, day = 30) => new Date(2026, 9, day, h, m, 0, 0).getTime();

test('parseHm / batchTimeOf：下班 18:00 → 汇总提醒 16:30（提前 90 分钟）', () => {
  assert.deepEqual(parseHm('18:00'), { h: 18, m: 0 });
  assert.deepEqual(parseHm(' 9：30 '), { h: 9, m: 30 });
  assert.equal(parseHm('25:00'), null);
  assert.equal(parseHm('abc'), null);
  assert.deepEqual(batchTimeOf('18:00'), { h: 16, m: 30 });
  assert.deepEqual(batchTimeOf('8:00'), { h: 6, m: 30 });
  assert.deepEqual(batchTimeOf('乱写'), { h: 16, m: 30 }, '非法下班时间回落默认 18:00');
});

test('有开始时间：到点才提醒，同一天只提醒一次，过期不补', () => {
  const todos = [{ id: 'a', text: '开会', startAt: at(10, 0) }];

  const before = computeDue(todos, at(9, 59), {});
  assert.equal(before.due.length, 0, '没到点不提醒');

  const onTime = computeDue(todos, at(10, 0), { fired: before.fired });
  assert.equal(onTime.due.length, 1);
  assert.equal(onTime.due[0].kind, 'start');
  assert.equal(onTime.due[0].todo.id, 'a');

  const repeat = computeDue(todos, at(10, 30), { fired: onTime.fired });
  assert.equal(repeat.due.length, 0, '当天重复轮询不重复提醒');

  const stale = computeDue([{ id: 'a', text: '开会', startAt: at(1, 0) }], at(9, 0), {});
  assert.equal(stale.due.length, 0, '到点超过 3 小时不补提醒');
});

test('没排时间：默认 16:30 汇总一次；已完成的待办不参与', () => {
  const todos = [
    { id: 'a', text: '写周报', startAt: 0 },
    { id: 'b', text: '回邮件', startAt: 0, done: true },
    { id: 'c', text: '整理桌面', startAt: 0 },
  ];

  const early = computeDue(todos, at(16, 29), { workEnd: '18:00' });
  assert.equal(early.due.length, 0);

  const batch = computeDue(todos, at(16, 30), { fired: early.fired, workEnd: '18:00' });
  assert.equal(batch.due.length, 1);
  assert.equal(batch.due[0].kind, 'batch');
  assert.equal(batch.due[0].todos.length, 2);
  assert.equal(batch.fired[BATCH_KEY], dayKey(at(16, 30)));

  assert.equal(computeDue(todos, at(17, 0), { fired: batch.fired }).due.length, 0, '当天只汇总一次');

  const nextDay = computeDue(todos, at(16, 31, 31), { fired: batch.fired });
  assert.equal(nextDay.due.length, 1, '第二天重新提醒');
});

test('下班时间可配：9:00 下班 → 7:30 汇总', () => {
  const todos = [{ id: 'a', text: 'x', startAt: 0 }];
  assert.equal(computeDue(todos, at(7, 29), { workEnd: '9:00' }).due.length, 0);
  assert.equal(computeDue(todos, at(7, 30), { workEnd: '9:00' }).due.length, 1);
});

test('没有待办就不提醒；已读标记会随待办删除而清理（汇总标记保留当天）', () => {
  assert.equal(computeDue([], at(16, 30), {}).due.length, 0);
  const { fired } = computeDue([{ id: 'a', text: 'x', startAt: 0 }], at(16, 30), {});
  assert.equal(fired[BATCH_KEY], dayKey(at(16, 30)), '当天汇总只算一次');
  const afterDelete = computeDue([{ id: 'b', text: 'y', startAt: 0 }], at(16, 31), { fired });
  assert.deepEqual(Object.keys(afterDelete.fired), [BATCH_KEY], '删掉的待办不留在标记里；汇总标记保留');
  assert.equal(afterDelete.due.length, 0, '当天不会再汇总一次');
});

test('describeDue：文案短且带内容', () => {
  assert.equal(describeDue({ kind: 'start', todo: { text: '开会' } }), '该开始了：开会');
  assert.equal(describeDue({ kind: 'batch', todos: [{ text: '写周报' }] }), '还有 1 项待办没排时间：写周报');
  assert.match(describeDue({ kind: 'batch', todos: [{ text: 'a' }, { text: 'b' }] }), /还有 2 项待办/);
});
