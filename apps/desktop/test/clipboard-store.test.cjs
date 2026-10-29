/**
 * clipboard-store 纯逻辑测试(2026-10-29)。
 * 重点覆盖会丢数据的那条:超期清理只能删非置顶、retention=0 不删任何东西。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { normalizeGroupName, normalizeTags, pruneByAge } = require('../clipboard-store.cjs');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

describe('pruneByAge', () => {
  test('retention 为 0 时不做任何清理(永久保留)', () => {
    const items = [{ id: 'a', createdAt: NOW - 999 * DAY }, { id: 'b', createdAt: NOW, pinned: true }];
    const { kept, removed } = pruneByAge(items, 0, NOW);
    assert.strictEqual(removed.length, 0);
    assert.strictEqual(kept.length, 2);
  });

  test('只清理超期的非置顶条目', () => {
    const items = [
      { id: 'old', createdAt: NOW - 40 * DAY },
      { id: 'oldPin', createdAt: NOW - 40 * DAY, pinned: true },
      { id: 'fresh', createdAt: NOW - 29 * DAY },
    ];
    const { kept, removed } = pruneByAge(items, 30, NOW);
    assert.deepStrictEqual(removed.map((i) => i.id), ['old']);
    assert.deepStrictEqual(kept.map((i) => i.id), ['oldPin', 'fresh']);
  });

  test('恰好落在截止时间上的条目保留(边界不误删)', () => {
    const items = [{ id: 'edge', createdAt: NOW - 30 * DAY }];
    const { removed } = pruneByAge(items, 30, NOW);
    assert.strictEqual(removed.length, 0);
  });

  test('非法入参不抛错', () => {
    assert.deepStrictEqual(pruneByAge(null, 7, NOW).kept, []);
    assert.strictEqual(pruneByAge([{ id: 'x', createdAt: 0 }], 'abc', NOW).removed.length, 0);
    // 脏条目(没有 createdAt)保持不动:时间未知时宁可留着,也不替用户删数据
    assert.strictEqual(pruneByAge([{ id: 'noTs' }], 1, NOW).removed.length, 0);
  });
});

describe('normalizeTags', () => {
  test('支持字符串分隔与数组两种入参,去 # 前缀', () => {
    assert.deepStrictEqual(normalizeTags('工作, #话术  、代码'), ['工作', '话术', '代码']);
    assert.deepStrictEqual(normalizeTags(['#工作', ' 话术 ']), ['工作', '话术']);
  });

  test('大小写不敏感去重且保留首个写法', () => {
    assert.deepStrictEqual(normalizeTags(['API', 'api', 'Api']), ['API']);
  });

  test('限制数量与单标签长度', () => {
    const many = Array.from({ length: 20 }, (_, i) => 't' + i);
    assert.strictEqual(normalizeTags(many).length, 8);
    const long = normalizeTags(['x'.repeat(50)]);
    assert.strictEqual(long[0].length, 20);
  });

  test('空值返回空数组', () => {
    assert.deepStrictEqual(normalizeTags(''), []);
    assert.deepStrictEqual(normalizeTags(null), []);
    assert.deepStrictEqual(normalizeTags(['  ', '#']), []);
  });
});

describe('normalizeGroupName', () => {
  test('折叠空白并截断超长名', () => {
    assert.strictEqual(normalizeGroupName('  工作   话术 '), '工作 话术');
    assert.strictEqual(normalizeGroupName('名'.repeat(40)).length, 24);
  });

  test('空名返回空串', () => {
    assert.strictEqual(normalizeGroupName('   '), '');
    assert.strictEqual(normalizeGroupName(null), '');
  });
});
