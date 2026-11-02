// 标准属性库服务（P4.7 树结构版）：
// 节点两类——group（分组，可多级嵌套）/ attr（属性叶子：key/value/def 描述）。
// 本体字段通过 refAttr 引用属性的 key；带子节点的属性其子节点 value 即枚举取值（供智能体召回）。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { getConnector, type DataSourceRow } from './connector.js';
import { guardSqlConsole } from './sql-guard.js';

export type EnumSource = 'manual' | 'sql' | 'distinct';

export interface StdAttrNode {
  id: string;
  kind: 'group' | 'attr';
  parentId: string | null;
  key: string;
  name: string;
  value: string;
  dataType: string;
  unit: string;
  description: string;
  synonyms: string[];
  enums: string[];
  /** 枚举来源：manual 手填 / sql 只读 SELECT / distinct 对 SELECT 结果去重 */
  enumSource: EnumSource;
  enumSql: string;
  enumDatasourceId: string;
  children: StdAttrNode[];
}

interface StdAttrRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  key: string | null;
  name: string;
  value: string | null;
  data_type: string | null;
  unit: string | null;
  description: string | null;
  synonyms_json: string | null;
  enum_json: string | null;
  enum_source: string | null;
  enum_sql: string | null;
  enum_datasource_id: string | null;
  created_at: number;
  updated_at: number;
}

function parseList(s: string | null | undefined): string[] {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function toNode(row: StdAttrRow): StdAttrNode {
  return {
    id: row.id,
    kind: (row.kind === 'group' ? 'group' : 'attr'),
    parentId: row.parent_id ?? null,
    key: row.key || '',
    name: row.name,
    value: row.value || '',
    dataType: row.data_type || 'string',
    unit: row.unit || '',
    description: row.description || '',
    synonyms: parseList(row.synonyms_json),
    enums: parseList(row.enum_json),
    enumSource: (row.enum_source === 'sql' || row.enum_source === 'distinct' ? row.enum_source : 'manual') as EnumSource,
    enumSql: row.enum_sql || '',
    enumDatasourceId: row.enum_datasource_id || '',
    children: [],
  };
}

/** 扁平清单（前端可自行组树） */
export function listStdAttributes(userId: string): StdAttrNode[] {
  const rows = db
    .prepare('SELECT * FROM std_attribute WHERE user_id = ? ORDER BY kind DESC, created_at ASC')
    .all(userId) as StdAttrRow[];
  return rows.map(toNode);
}

/** 组装分类树（按创建序；孤儿节点挂根） */
export function listStdAttrTree(userId: string): StdAttrNode[] {
  const flat = listStdAttributes(userId);
  const byId = new Map<string, StdAttrNode>();
  for (const n of flat) byId.set(n.id, n);
  const roots: StdAttrNode[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export function getStdAttrById(userId: string, id: string): StdAttrNode | undefined {
  const row = db.prepare('SELECT * FROM std_attribute WHERE id = ? AND user_id = ?').get(id, userId) as StdAttrRow | undefined;
  return row ? toNode(row) : undefined;
}

/** 按 key 找属性节点（refAttr 引用入口） */
export function getStdAttribute(userId: string, key: string): StdAttrNode | undefined {
  const row = db
    .prepare("SELECT * FROM std_attribute WHERE user_id = ? AND key = ? AND kind = 'attr'")
    .get(userId, key) as StdAttrRow | undefined;
  return row ? toNode(row) : undefined;
}

function parentExists(userId: string, parentId: string | null): boolean {
  return !parentId || !!db.prepare('SELECT 1 FROM std_attribute WHERE id = ? AND user_id = ?').get(parentId, userId);
}

export interface StdAttrInput {
  kind?: 'group' | 'attr';
  parentId?: string | null;
  key?: string;
  name?: string;
  value?: string;
  dataType?: string;
  unit?: string;
  description?: string;
  synonyms?: string[];
  enums?: string[];
  enumSource?: EnumSource;
  enumSql?: string;
  enumDatasourceId?: string;
}

const DATA_TYPES = new Set(['string', 'number', 'date', 'boolean', 'enum']);

/** 新建节点（分组或属性） */
export function createStdAttrNode(userId: string, input: StdAttrInput): StdAttrNode {
  const kind = input.kind === 'group' ? 'group' : 'attr';
  const parentId = input.parentId ?? null;
  if (!parentExists(userId, parentId)) throw new Error('父级节点不存在');
  const now = Date.now();
  const id = `std_${uuid().slice(0, 12)}`;

  if (kind === 'group') {
    const name = (input.name || '').trim();
    if (!name) throw new Error('分组名称不能为空');
    db.prepare(
      'INSERT INTO std_attribute (id, user_id, kind, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, userId, 'group', parentId, name, now, now);
  } else {
    const key = (input.key || '').trim();
    if (!key) throw new Error('属性 key 不能为空');
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('key 只能用小写字母/数字/下划线，且以字母开头');
    const dataType = input.dataType && DATA_TYPES.has(input.dataType) ? input.dataType : 'string';
    try {
      db.prepare(
        'INSERT INTO std_attribute (id, user_id, kind, parent_id, key, name, value, data_type, unit, description, synonyms_json, enum_json, enum_source, enum_sql, enum_datasource_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id, userId, 'attr', parentId, key,
        input.name?.trim() || key, input.value?.trim() || null, dataType,
        input.unit?.trim() || null, input.description?.trim() || null,
        JSON.stringify((input.synonyms || []).map((s) => s.trim()).filter(Boolean)),
        JSON.stringify((input.enums || []).map((s) => String(s).trim()).filter((s) => s !== '')),
        input.enumSource === 'sql' || input.enumSource === 'distinct' ? input.enumSource : 'manual',
        input.enumSql?.trim() || null,
        input.enumDatasourceId?.trim() || null,
        now, now,
      );
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new Error(`key 已存在: ${key}`);
      throw e;
    }
  }
  return getStdAttrById(userId, id)!;
}

/** 更新节点（分组改名/移动；属性改 key/value/def/移动） */
export function updateStdAttrNode(userId: string, id: string, input: StdAttrInput): StdAttrNode {
  const node = getStdAttrById(userId, id);
  if (!node) throw new Error('标准属性节点不存在');

  if (input.parentId !== undefined) {
    const newParent = input.parentId ?? null;
    if (newParent === id) throw new Error('不能把节点移动到它自己下面');
    if (!parentExists(userId, newParent)) throw new Error('目标父级节点不存在');
    // 防环：新父级的祖先链不能包含自己
    let cur: string | null = newParent;
    const visited = new Set<string>();
    while (cur) {
      if (cur === id) throw new Error('不能把节点移动到它自己的子节点下（会形成环）');
      if (visited.has(cur)) break;
      visited.add(cur);
      cur = getStdAttrById(userId, cur)?.parentId ?? null;
    }
    db.prepare('UPDATE std_attribute SET parent_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(newParent, Date.now(), id, userId);
  }

  if (node.kind === 'group') {
    const name = (input.name || '').trim();
    if (name) {
      db.prepare('UPDATE std_attribute SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(name, Date.now(), id, userId);
    }
    return getStdAttrById(userId, id)!;
  }

  // 属性叶子
  const key = input.key?.trim();
  if (key !== undefined) {
    if (!key) throw new Error('属性 key 不能为空');
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('key 只能用小写字母/数字/下划线，且以字母开头');
  }
  const dataType = input.dataType && DATA_TYPES.has(input.dataType) ? input.dataType : undefined;
  const enums = input.enums !== undefined ? JSON.stringify(input.enums.map((s) => String(s).trim()).filter((s) => s !== '')) : undefined;
  const synonyms = input.synonyms !== undefined ? JSON.stringify(input.synonyms.map((s) => s.trim()).filter(Boolean)) : undefined;
  const enumSource = input.enumSource === 'sql' || input.enumSource === 'distinct'
    ? input.enumSource
    : input.enumSource === 'manual' ? 'manual' : undefined;
  try {
    db.prepare(
      `UPDATE std_attribute SET
         key = COALESCE(?, key), name = COALESCE(?, name), value = COALESCE(?, value),
         data_type = COALESCE(?, data_type), unit = COALESCE(?, unit), description = COALESCE(?, description),
         synonyms_json = COALESCE(?, synonyms_json), enum_json = COALESCE(?, enum_json),
         enum_source = COALESCE(?, enum_source), enum_sql = COALESCE(?, enum_sql),
         enum_datasource_id = COALESCE(?, enum_datasource_id), updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      key ?? null, input.name?.trim() ?? null, input.value?.trim() ?? null, dataType ?? null,
      input.unit?.trim() ?? null, input.description?.trim() ?? null, synonyms, enums,
      enumSource ?? null, input.enumSql?.trim() ?? null, input.enumDatasourceId?.trim() ?? null,
      Date.now(), id, userId,
    );
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new Error(`key 已存在: ${key}`);
    throw e;
  }
  return getStdAttrById(userId, id)!;
}

/** 删除节点：子节点上提一级（不级联删除，避免误删结构） */
export function deleteStdAttrNode(userId: string, id: string): void {
  const node = getStdAttrById(userId, id);
  if (!node) throw new Error('标准属性节点不存在');
  const now = Date.now();
  const children = db.prepare('SELECT id FROM std_attribute WHERE parent_id = ? AND user_id = ?').all(id, userId) as Array<{ id: string }>;
  for (const c of children) {
    db.prepare('UPDATE std_attribute SET parent_id = ?, updated_at = ? WHERE id = ?').run(node.parentId ?? null, now, c.id);
  }
  db.prepare('DELETE FROM std_attribute WHERE id = ? AND user_id = ?').run(id, userId);
}

export interface EnumPreview {
  values: string[];
  sql: string;
  source: EnumSource;
  datasourceId: string;
}

/**
 * 枚举预览（P3.7）：只读 SELECT → 首列去重值（最多 30）。
 * manual 不走 SQL；sql 原样执行；distinct 对结果整体去重。
 */
export async function previewEnum(
  userId: string,
  opts: { id?: string; datasourceId?: string; sql?: string; source?: EnumSource },
): Promise<EnumPreview> {
  let datasourceId = String(opts.datasourceId || '').trim();
  let sql = String(opts.sql || '').trim();
  let source: EnumSource = opts.source || 'sql';

  if (opts.id) {
    const node = getStdAttrById(userId, opts.id);
    if (!node) throw new Error('标准属性节点不存在');
    datasourceId = node.enumDatasourceId;
    sql = node.enumSql;
    source = node.enumSource;
  }
  if (source === 'manual') throw new Error('手工枚举无需预览，直接编辑取值');
  if (!datasourceId) throw new Error('缺少数据源（enumDatasourceId）');
  if (!sql) throw new Error('缺少枚举 SELECT（enumSql）');

  const guard = guardSqlConsole(sql, false);
  if (!guard.ok || !guard.reads.length) throw new Error('枚举来源只允许只读 SELECT 语句');
  const stat = guard.reads[0].text;
  const finalSql = source === 'distinct' ? `SELECT DISTINCT * FROM (${stat}) _enum LIMIT 30` : stat;

  const ds = db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(datasourceId, userId) as DataSourceRow | undefined;
  if (!ds) throw new Error('数据源不存在');
  const r = await getConnector(ds).query(finalSql, { maxRows: 30, timeoutMs: 15000 });
  const values = [...new Set(
    r.rows
      .map((row) => String(Object.values(row)[0] ?? '').trim())
      .filter(Boolean),
  )].slice(0, 30);
  return { values, sql: finalSql, source, datasourceId };
}

/** 刷新枚举：跑一次预览并写回 enum_json（人工可再改） */
export async function refreshEnum(userId: string, id: string): Promise<StdAttrNode> {
  const node = getStdAttrById(userId, id);
  if (!node) throw new Error('标准属性节点不存在');
  if (node.kind !== 'attr') throw new Error('只有属性节点才有枚举');
  if (node.enumSource === 'manual') throw new Error('手工枚举请直接编辑取值');
  const preview = await previewEnum(userId, { id });
  updateStdAttrNode(userId, id, { enums: preview.values });
  return getStdAttrById(userId, id)!;
}
