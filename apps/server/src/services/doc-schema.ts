// 文档型数据源的弱 schema 推导（P5.1）：采样文档 → 拍平嵌套字段（a.b.c）+ 推断类型。
// 纯函数，便于单测；连接器只负责取样。
import type { SchemaColumn } from './connector.js';

type DocPrimitive = string | number | boolean | null | undefined;
export type DocType = 'string' | 'number' | 'boolean' | 'date' | 'json';

const MAX_DEPTH = 4;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?.*)?$/;

function typeOfValue(v: unknown): DocType {
  if (v === null || v === undefined) return 'json';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return ISO_DATE.test(v) ? 'date' : 'string';
  return 'json';
}

/** 把一条文档拍平成 path → value（数组按 JSON 处理；嵌套对象递归） */
export function flattenDocument(doc: Record<string, unknown>, prefix = '', depth = 0, out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(doc || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < MAX_DEPTH) {
      flattenDocument(value as Record<string, unknown>, path, depth + 1, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * 多条样本 → 列清单。同名路径类型冲突时归为 json；从未出现 null 的列 nullable=false。
 */
export function inferDocSchema(samples: Record<string, unknown>[]): SchemaColumn[] {
  const types = new Map<string, Set<DocType>>();
  const seenNull = new Set<string>();
  const allPaths = new Set<string>();

  for (const doc of samples || []) {
    const flat = flattenDocument(doc);
    for (const [path, value] of Object.entries(flat)) {
      allPaths.add(path);
      if (value === null || value === undefined) { seenNull.add(path); continue; }
      if (!types.has(path)) types.set(path, new Set());
      types.get(path)!.add(typeOfValue(value));
    }
  }

  return [...allPaths].sort().map((path) => {
    const set = types.get(path);
    let type: DocType = 'json';
    if (set && set.size === 1) type = [...set][0];
    return {
      name: path,
      type,
      pk: path === '_id' || path.endsWith('._id'),
      nullable: seenNull.has(path) || !set,
    };
  });
}

/** 按投影路径从拍平文档里取子集（不传投影 = 全部字段） */
export function projectFlat(flat: Record<string, unknown>, projection?: string[]): Record<string, unknown> {
  if (!projection?.length) return flat;
  const out: Record<string, unknown> = {};
  for (const key of projection) if (key in flat) out[key] = flat[key];
  return out;
}

export function flattenDocuments(docs: Record<string, unknown>[], projection?: string[]): { columns: string[]; rows: Record<string, unknown>[] } {
  const rows = (docs || []).map((d) => projectFlat(flattenDocument(d), projection));
  const columns = projection?.length
    ? projection
    : [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  return { columns, rows };
}

export type { DocPrimitive };
