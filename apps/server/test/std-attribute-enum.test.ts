/**
 * 标准属性枚举来源（P3.7）测试：
 *  ① 节点可保存/回读 enumSource / enumSql / enumDatasourceId；
 *  ② manual 不跑 SQL，refresh 明确拒绝；
 *  ③ 只读护栏：DELETE/UPDATE 等非 SELECT 被拒（在碰数据源之前）；
 *  ④ 缺 datasourceId / sql 给出可读错误。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-stdattr-'));

import { db } from '../src/db.js';
import { createStdAttrNode, updateStdAttrNode, getStdAttrById, previewEnum, refreshEnum } from '../src/services/std-attribute.js';

const UID = 'u_stdattr_test';

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'stdattr_u', NULL, 'x', ?)")
    .run(UID, Date.now());
});

describe('枚举来源字段', () => {
  it('创建/更新可保存并回读 enumSource / enumSql / enumDatasourceId', () => {
    const n = createStdAttrNode(UID, {
      kind: 'attr', key: 'order_status', name: '订单状态', dataType: 'enum',
      enumSource: 'sql', enumSql: 'SELECT status FROM orders', enumDatasourceId: 'ds1',
    });
    expect(n.enumSource).toBe('sql');
    expect(n.enumSql).toContain('SELECT status');
    expect(n.enumDatasourceId).toBe('ds1');

    const u = updateStdAttrNode(UID, n.id, { enumSource: 'distinct' });
    expect(u.enumSource).toBe('distinct');
    // 未传的字段保持原值
    expect(u.enumSql).toContain('SELECT status');
  });
});

describe('previewEnum / refreshEnum', () => {
  it('manual 枚举：预览与刷新都明确拒绝', async () => {
    const n = createStdAttrNode(UID, { kind: 'attr', key: 'sync_flag', name: '同步标记', enumSource: 'manual' });
    await expect(previewEnum(UID, { id: n.id })).rejects.toThrow(/手工枚举/);
    await expect(refreshEnum(UID, n.id)).rejects.toThrow(/手工枚举/);
  });

  it('缺 SQL / 缺数据源给出可读错误', async () => {
    const noSql = createStdAttrNode(UID, { kind: 'attr', key: 'no_sql', name: '无 SQL', enumSource: 'sql', enumDatasourceId: 'ds1' });
    await expect(previewEnum(UID, { id: noSql.id })).rejects.toThrow(/缺少枚举 SELECT/);

    const noDs = createStdAttrNode(UID, { kind: 'attr', key: 'no_ds', name: '无数据源', enumSource: 'sql', enumSql: 'SELECT 1' });
    await expect(previewEnum(UID, { id: noDs.id })).rejects.toThrow(/缺少数据源/);
  });

  it('非只读语句被护栏拒绝（不触达数据源）', async () => {
    const n = createStdAttrNode(UID, {
      kind: 'attr', key: 'bad_sql', name: '写语句', enumSource: 'sql', enumSql: 'DELETE FROM orders', enumDatasourceId: 'ds1',
    });
    await expect(previewEnum(UID, { id: n.id })).rejects.toThrow(/只允许只读 SELECT/);
  });

  it('只读 SELECT + 不存在的数据源：报数据源不存在', async () => {
    const n = createStdAttrNode(UID, {
      kind: 'attr', key: 'ds_missing', name: '数据源缺失', enumSource: 'sql', enumSql: 'SELECT 1 AS v', enumDatasourceId: 'ds_missing',
    });
    await expect(previewEnum(UID, { id: n.id })).rejects.toThrow(/数据源不存在/);
  });

  it('未知节点 id 报不存在', async () => {
    expect(getStdAttrById(UID, 'std_missing')).toBeUndefined();
  });
});
