// 关联推断（P2.5.3 命名部分）：不读外键元数据也能给出候选 JOIN，交给人工确认。
//
// ★ 只产出 suggested（不落库、不自动编译）：命名推断会有假阳性，宁可让用户勾一下。
// ★ 规则从保守到激进只有一条链：`xxx_id` → 名字对得上的表 → 该表主键（或 id / xxx_id）。
//   多个候选表同名匹配 = 有歧义，直接不猜（返回空），避免把两套主键不同的表硬接起来。
import type { TableSchemaLite } from './ontology-table-gen.js';

export interface RelationSuggestion {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: 'N:1';
  /** 0~1：名字精确匹配 +0.2，目标列是主键 +0.1 */
  confidence: number;
  reason: string;
}

const COL_ID_RE = /^(.+)_id$/i;

/** 表名归一化：去 schema 前缀 / t_ tb_ tbl_ 前缀 / 小写 */
export function normalizeTableName(raw: string): string {
  const name = String(raw || '').trim().toLowerCase();
  const bare = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  return bare.replace(/^(t_|tb_|tbl_)/, '');
}

/** 复数/单数变体：orders → order；categories → category */
export function nameVariants(word: string): string[] {
  const w = normalizeTableName(word);
  if (!w) return [];
  const out = new Set<string>([w]);
  if (/ies$/.test(w)) out.add(`${w.slice(0, -3)}y`);
  if (/es$/.test(w)) out.add(w.slice(0, -2));
  if (/s$/.test(w)) out.add(w.slice(0, -1));
  // 反向：单数前缀 → 复数表
  if (/y$/.test(w)) out.add(`${w.slice(0, -1)}ies`);
  else out.add(`${w}s`);
  out.add(`${w}es`);
  return [...out].filter(Boolean);
}

/** 在候选表里找目标主键：主键列优先，其次 id / <前缀>_id */
function pickTargetColumn(table: TableSchemaLite, prefix: string): string | null {
  const pk = table.columns.find((c) => c.pk);
  if (pk) return pk.name;
  const id = table.columns.find((c) => c.name.toLowerCase() === 'id');
  if (id) return id.name;
  const prefixed = table.columns.find((c) => c.name.toLowerCase() === `${prefix}_id`);
  return prefixed ? prefixed.name : null;
}

/**
 * 纯函数：根据表结构推断 N:1 关联候选。
 * @param tables schemaInfo 的同构输入（name/columns{pk}）
 */
export function inferRelations(tables: TableSchemaLite[]): RelationSuggestion[] {
  const list = Array.isArray(tables) ? tables : [];
  const normalized = list.map((t) => ({ table: t, name: normalizeTableName(t.name) }));
  const out: RelationSuggestion[] = [];
  const seen = new Set<string>();

  for (const source of list) {
    for (const col of source.columns || []) {
      if (col.pk) continue; // 主键不是关联列
      const m = COL_ID_RE.exec(String(col.name || '').trim());
      if (!m) continue;
      const prefix = normalizeTableName(m[1]);
      if (!prefix) continue;

      const wanted = new Set(nameVariants(prefix));
      const hits = normalized.filter(({ name }) => wanted.has(name));
      // 多于一个候选 = 命名歧义（user / users 并存），不猜
      if (hits.length !== 1) continue;
      const target = hits[0].table;
      const targetColumn = pickTargetColumn(target, prefix);
      if (!targetColumn) continue;
      if (target === source && targetColumn === col.name) continue;

      // 精确单数名 +0.2，复数变体 +0.1；目标列是主键 +0.1（保留两位小数，避免 0.7999 这类浮点尾巴）
      const confidence = Math.round(Math.min(1, 0.6
        + (hits[0].name === prefix ? 0.2 : 0.1)
        + (target.columns.some((c) => c.pk && c.name === targetColumn) ? 0.1 : 0)) * 100) / 100;
      const key = `${source.name}.${col.name}->${target.name}.${targetColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        sourceTable: source.name,
        sourceColumn: col.name,
        targetTable: target.name,
        targetColumn,
        type: 'N:1',
        confidence,
        reason: `${col.name} 命名匹配表 ${target.name}（${targetColumn}${target.columns.some((c) => c.pk && c.name === targetColumn) ? '，主键' : ''}）`,
      });
    }
  }
  return out.sort((a, b) => a.sourceTable.localeCompare(b.sourceTable) || a.sourceColumn.localeCompare(b.sourceColumn));
}
