// 围栏数据/布局纯函数单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItems, cellsFor, colsFor, minHeightFor, sortItems, INBOX_ID } from './fences.js';

const FENCES = [
  { id: 'inbox', label: '待归类' },
  { id: 'f-doc', label: '文档' },
  { id: 'f-img', label: '图片' },
];

test('归属：同名文件夹优先', () => {
  const items = buildItems([
    { name: 'a.docx', rel: '文档/a.docx', path: '/d/文档/a.docx', mtimeMs: 1 },
  ], FENCES, {});
  assert.equal(items[0].fenceId, 'f-doc');
});

test('归属：显式指派 > 待归类；指派到不存在的围栏回落 inbox', () => {
  const items = buildItems([
    { name: 'b.png', rel: 'b.png', path: '/d/b.png', mtimeMs: 1 },
    { name: 'c.png', rel: 'c.png', path: '/d/c.png', mtimeMs: 1 },
  ], FENCES, { 'b.png': 'f-img', 'c.png': 'gone' });
  assert.equal(items[0].fenceId, 'f-img');
  assert.equal(items[1].fenceId, INBOX_ID);
});

test('归属：普通文件默认 inbox', () => {
  const items = buildItems([{ name: 'x.txt', rel: 'x.txt', path: '/d/x.txt', mtimeMs: 0 }], FENCES, {});
  assert.equal(items[0].fenceId, INBOX_ID);
});

test('网格：列数随宽度变化且封顶 4', () => {
  assert.equal(colsFor({ w: 400 }), 4);
  assert.equal(colsFor({ w: 220 }), 2);
  assert.equal(colsFor({ w: 120 }), 1);
  assert.equal(colsFor({ w: 900 }), 4);
});

test('网格：位置按行列排列且不越出围栏宽度', () => {
  const rect = { w: 400 };
  const cells = cellsFor(rect, 6);
  assert.equal(cells.length, 6);
  assert.equal(cells[0].y, cells[1].y);          // 同一行
  assert.ok(cells[4].y > cells[0].y);            // 第二行
  for (const c of cells) assert.ok(c.x >= 14 - 0.001 && c.x + 84 <= 400 - 14 + 0.001);
});

test('最小高度：按行数撑开', () => {
  const h1 = minHeightFor({ w: 400 }, 3);
  const h2 = minHeightFor({ w: 400 }, 9);
  assert.ok(h2 > h1);
});

test('排序：name/mtime 稳定，manual 保持原序', () => {
  const items = [
    { name: 'b.txt', mtimeMs: 1 },
    { name: 'a.txt', mtimeMs: 3 },
  ];
  assert.deepEqual(sortItems(items, 'name').map((i) => i.name), ['a.txt', 'b.txt']);
  assert.deepEqual(sortItems(items, 'mtime').map((i) => i.name), ['a.txt', 'b.txt']);
  assert.deepEqual(sortItems(items, 'manual').map((i) => i.name), ['b.txt', 'a.txt']);
});
