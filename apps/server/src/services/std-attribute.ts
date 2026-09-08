// 标准属性库服务（P4.7 树结构版）：
// 节点两类——group（分组，可多级嵌套）/ attr（属性叶子：key/value/def 描述）。
// 本体字段通过 refAttr 引用属性的 key；带子节点的属性其子节点 value 即枚举取值（供智能体召回）。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

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
        'INSERT INTO std_attribute (id, user_id, kind, parent_id, key, name, value, data_type, unit, description, synonyms_json, enum_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id, userId, 'attr', parentId, key,
        input.name?.trim() || key, input.value?.trim() || null, dataType,
        input.unit?.trim() || null, input.description?.trim() || null,
        JSON.stringify((input.synonyms || []).map((s) => s.trim()).filter(Boolean)),
        JSON.stringify((input.enums || []).map((s) => String(s).trim()).filter((s) => s !== '')),
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
  try {
    db.prepare(
      `UPDATE std_attribute SET
         key = COALESCE(?, key), name = COALESCE(?, name), value = COALESCE(?, value),
         data_type = COALESCE(?, data_type), unit = COALESCE(?, unit), description = COALESCE(?, description),
         synonyms_json = COALESCE(?, synonyms_json), enum_json = COALESCE(?, enum_json), updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      key ?? null, input.name?.trim() ?? null, input.value?.trim() ?? null, dataType ?? null,
      input.unit?.trim() ?? null, input.description?.trim() ?? null, synonyms, enums, Date.now(), id, userId,
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
