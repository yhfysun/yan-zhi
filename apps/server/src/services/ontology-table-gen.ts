// 表 → 本体规格生成器（纯函数，无 db 依赖，可单测）。
// 用户诉求：大部分本体就是单表——选数据源的表直接生成，描述默认取表备注。
// 启发式：文本/日期类列 → 维度；日期时间列 → 时间维度；数值列 → 度量（sum）；主键列 → 主实体。
import type { OntologyDimension, OntologyMeasure, OntologyTimeDimension, OntologyEntity } from './ontology-compiler.js';

export interface TableSchemaLite {
  name: string;
  kind: 'table' | 'view';
  comment?: string;
  columns: { name: string; type: string; pk: boolean }[];
}

export interface TableGenResult {
  code: string;
  name: string;
  description: string;
  sourceSql: string;
  entities: OntologyEntity[];
  dimensions: OntologyDimension[];
  timeDimensions: OntologyTimeDimension[];
  measures: OntologyMeasure[];
}

const TEXT_TYPE = /char|text|clob|enum|json|uuid/i;
const TIME_TYPE = /date|time|year/i; // date/datetime/timestamp/time/year
const NUM_TYPE = /int|decimal|numeric|float|double|real|money|number/i;

function quoteCol(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** code 净化：小写 + 非法字符转下划线 + 数字开头补前缀（本体 code 规则 ^[a-z][a-z0-9_]*$） */
export function sanitizeCode(raw: string): string {
  let code = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (/^\d/.test(code)) code = `t_${code}`;
  return code || 'table';
}

/**
 * 从表结构构建本体规格。
 * @param dsName 数据源显示名（用于描述文案）
 */
export function buildTableOntologySpec(table: TableSchemaLite, dsName: string): TableGenResult {
  const cols = table.columns.filter((c) => c.name);
  if (!cols.length) throw new Error(`表 ${table.name} 没有可用列`);

  const sourceSql = `SELECT\n${cols.map((c) => `  ${quoteCol(c.name)} AS ${quoteCol(c.name)}`).join(',\n')}\nFROM ${quoteCol(table.name)}`;

  const comment = (table.comment || '').trim();
  const name = comment || table.name;
  const description = comment
    ? `${comment}（来自 ${dsName}.${table.name}，按表备注生成，业务口径可继续补充）`
    : `${dsName}.${table.name} 的${table.kind === 'view' ? '视图' : '表'}本体（${cols.length} 列，自动生成，业务口径待补充）`;

  const dimensions: OntologyDimension[] = [];
  const timeDimensions: OntologyTimeDimension[] = [];
  const measures: OntologyMeasure[] = [];
  const entities: OntologyEntity[] = [];
  const seen = new Set<string>();

  for (const c of cols) {
    const t = c.type || '';
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    if (c.pk) {
      // 主键只做实体：SUM(id) 无意义
      entities.push({ name: tableNameToEntity(table.name), type: 'primary', expr: c.name });
      continue;
    }
    if (TIME_TYPE.test(t)) {
      timeDimensions.push({ name: c.name, expr: c.name, description: t ? `时间列，类型 ${t}` : undefined });
    } else if (NUM_TYPE.test(t) && !/^(id|.*_id|.*_no|.*_num|.*_code)$/i.test(c.name)) {
      // 数值列 → sum 度量；但 *_id/_no/_code 等标识列虽为数值也归维度（SUM(user_id) 无意义）
      measures.push({ name: `${c.name}_sum`, expr: c.name, agg: 'sum', description: t ? `数值列，类型 ${t}` : undefined });
    } else {
      // 文本/标识/其他类型 → 维度（含枚举/布尔，富化阶段再收敛）
      dimensions.push({ name: c.name, expr: c.name, description: t ? `类型 ${t}` : undefined });
    }
  }

  // 兜底：没有任何维度时把第一个文本/时间列补成维度，保证可分组
  if (!dimensions.length && !timeDimensions.length && cols.length) {
    dimensions.push({ name: cols[0].name, expr: cols[0].name });
  }
  // 数值列的 *_sum 与列同名冲突风险：列名恰好叫 xxx_sum 会被双重使用——保证度量名唯一
  const used = new Set(dimensions.map((d) => d.name).concat(timeDimensions.map((d) => d.name)));
  for (const m of measures) {
    while (used.has(m.name)) m.name = `${m.name}_sum`;
    used.add(m.name);
  }

  return { code: sanitizeCode(table.name), name, description, sourceSql, entities, dimensions, timeDimensions, measures };
}

function tableNameToEntity(t: string): string {
  return sanitizeCode(t).replace(/s$/, '');
}
