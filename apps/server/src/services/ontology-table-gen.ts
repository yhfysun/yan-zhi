// 表 → 本体规格生成器（纯函数，无 db 依赖，可单测）。
// 用户诉求：大部分本体就是单表——选数据源的表直接生成，描述默认取表备注。
// 启发式：文本/日期类列 → 维度；日期时间列 → 时间维度；数值列 → 度量（sum）；主键列 → 主实体。
import type { OntologyDimension, OntologyMeasure, OntologyTimeDimension, OntologyEntity, OntologySelection } from './ontology-compiler.js';
import { BUILTIN_TABLE_DOCS, COMMON_FIELD_DOCS } from './ontology-docs.js';

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
  /** 默认选择列：自动生成的本体把所有维度/度量/时间维度设为默认，未指定列时全选 */
  selections: OntologySelection[];
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
  // 内置词典优先：表名（code）命中的业务描述/中文名；未命中走表备注/模板
  const doc = BUILTIN_TABLE_DOCS[table.name] || BUILTIN_TABLE_DOCS[sanitizeCode(table.name)];
  const name = doc?.name || comment || table.name;
  const description = doc?.description
    || (comment ? `${comment}（来自 ${dsName}.${table.name}，按表备注生成，业务口径可继续补充）`
      : `${dsName}.${table.name} 的${table.kind === 'view' ? '视图' : '表'}本体（${cols.length} 列，自动生成，业务口径待补充）`);

  /** 字段描述：表词典 → 通用列词典 → 类型兜底 */
  const fieldDesc = (col: string, t: string): string | undefined => {
    return doc?.fields?.[col] || COMMON_FIELD_DOCS[col] || (t ? `类型 ${t}` : undefined);
  };

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
      timeDimensions.push({ name: c.name, expr: c.name, description: fieldDesc(c.name, t) });
    } else if (NUM_TYPE.test(t) && !/^(id|.*_id|.*_no|.*_num|.*_code)$/i.test(c.name)) {
      // 数值列 → sum 度量；但 *_id/_no/_code 等标识列虽为数值也归维度（SUM(user_id) 无意义）
      measures.push({ name: `${c.name}_sum`, expr: c.name, agg: 'sum', description: fieldDesc(c.name, t) });
    } else {
      // 文本/标识/其他类型 → 维度（含枚举/布尔，富化阶段再收敛）
      dimensions.push({ name: c.name, expr: c.name, description: fieldDesc(c.name, t) });
    }
  }

  // 行计数度量：expr='*' + agg='count' 才会编译成 COUNT(*)。
  // 「有多少条/多少个」是最常见的数据问法，只给 *_sum 的话模型只能拿 SUM(某列) 凑数或退化写裸 SQL。
  measures.unshift({
    name: 'row_count',
    expr: '*',
    agg: 'count',
    additive: 'additive',
    description: '行数（记录条数）：回答「有多少/多少个/多少条」时用它',
  });

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

  // 选择列：单组「全部字段」（fields = 全部维度/度量/时间维度），语义与字段演进由用户在编辑区维护
  const selections: OntologySelection[] = [
    { name: '全部字段', fields: [...dimensions.map((d) => d.name), ...timeDimensions.map((t) => t.name), ...measures.map((m) => m.name)] },
  ];

  return { code: sanitizeCode(table.name), name, description, sourceSql, entities, dimensions, timeDimensions, measures, selections };
}

function tableNameToEntity(t: string): string {
  return sanitizeCode(t).replace(/s$/, '');
}
