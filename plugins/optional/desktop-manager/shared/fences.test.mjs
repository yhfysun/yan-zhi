// 围栏数据/布局纯函数单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItems, cellsFor, colsFor, minHeightFor, sortItems, INBOX_ID } from './fences.js';

const FENCES = [
  { id: 'inbox', label: '待归类' },
  { id: 'f-doc', label: '文档' },
  { id: 'f-img', label: '图片' },
];

test('归属：目录默认进「文件夹」栏，文件默认待归类（不再按文件夹同名展开）', () => {
  const fences = [...FENCES, { id: 'f-folders', label: '文件夹' }];
  const items = buildItems([
    { name: 'proj', rel: 'proj', path: '/d/proj', mtimeMs: 1, isDir: true },
    { name: 'proj2', rel: 'proj2', path: '/d/proj2', mtimeMs: 1, isDir: true },
    // 桌面上的文件夹里再有同名目录，也不该改变归属（内容不展开）
    { name: 'a.docx', rel: '文档/a.docx', path: '/d/文档/a.docx', mtimeMs: 1 },
  ], fences, { proj2: 'f-doc' });
  assert.equal(items[0].fenceId, 'f-folders');
  assert.equal(items[1].fenceId, 'f-doc', '显式指派优先于目录默认');
  assert.equal(items[2].fenceId, INBOX_ID, '文件不再因为同名文件夹而自动归属');
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

test('归属：扩展名栏（kind:ext）自动接管文件，目录仍归「文件夹」栏', () => {
  const fences = [
    { id: 'f-folders', kind: 'folders', label: '文件夹' },
    { id: 'f-doc', kind: 'ext', label: '文档', exts: ['docx', 'pdf'] },
    { id: 'f-image', kind: 'ext', label: '图片', exts: ['PNG', 'jpg'] },
    { id: INBOX_ID, kind: 'inbox', label: '待归类' },
  ];
  const items = buildItems([
    { name: 'a.DOCX', rel: 'a.DOCX', path: '/d/a.DOCX', mtimeMs: 1 },
    { name: 'b.png', rel: 'b.png', path: '/d/b.png', mtimeMs: 1 },
    { name: 'c.lnk', rel: 'c.lnk', path: '/d/c.lnk', mtimeMs: 1 },
    { name: 'dir', rel: 'dir', path: '/d/dir', mtimeMs: 1, isDir: true },
    { name: 'd.pdf', rel: 'd.pdf', path: '/d/d.pdf', mtimeMs: 1 },
  ], fences, { 'd.pdf': 'f-image' });
  const by = Object.fromEntries(items.map((i) => [i.name, i.fenceId]));
  assert.equal(by['a.DOCX'], 'f-doc', '扩展名大小写不敏感');
  assert.equal(by['b.png'], 'f-image', '围栏 exts 大小写不敏感');
  assert.equal(by['c.lnk'], INBOX_ID);
  assert.equal(by.dir, 'f-folders');
  assert.equal(by['d.pdf'], 'f-image', '显式指派优先于扩展名栏');
});

test('归属：显式指派到「待归类」能压住扩展名规则（拖回去不会被立刻带走）', () => {
  const fences = [
    { id: 'f-image', kind: 'ext', label: '图片', exts: ['png'] },
    { id: INBOX_ID, kind: 'inbox', label: '待归类' },
  ];
  const items = buildItems(
    [{ name: 'a.png', rel: 'a.png', path: '/d/a.png', mtimeMs: 1 }],
    fences,
    { 'a.png': INBOX_ID },
  );
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
