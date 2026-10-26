// 文档类型（DocumentType）与文档实例（DocumentInstance）
//
// 设计取向：**声明式结构 + 活数据**。
//   - 模型只产出结构与小体量文本；表格/图表用 contract + spec 引用取数，不内联行数据（省 token、可刷新）。
//   - 渲染层按 section 分派：文字/指标/表格/图表/信息图（AntV Infographic）/图片/分页。
//   - 导出层复用同一份实例，把图表与信息图落成 PNG 嵌入 Word。
//
// 模板（DocumentType）给模型看「这类文档该有哪些段」，实例（DocumentInstance）才是真正填充的内容。

import type { ChartSpec } from '../components/chat/chart-spec';

export interface DocumentFilter {
  col: string;
  op?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'notIn' | 'like';
  value?: unknown;
}

/** 文档内的取数引用（与 /api/query-contract/* 入参同形） */
export interface DocumentDataContract {
  datasourceId?: string;
  table?: string;
  base?: string;
  /** 取数通道：缺省按 table/base 走自由 SQL；ontology 按本体字段名取数（业务名，无 SQL） */
  mode?: 'table' | 'base' | 'ontology';
  /** mode=ontology 时的本体 code（或 id） */
  ontology?: string;
  filters?: DocumentFilter[];
}

export interface DocumentMetric {
  label: string;
  value: string;
  hint?: string;
}

export type DocumentSection =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'metrics'; items: DocumentMetric[] }
  | {
      kind: 'table';
      /** 二选一：contract 走参数化取数；columns/rows 直接内联小表 */
      contract?: DocumentDataContract;
      columns?: string[];
      rows?: Array<Array<string | number | null>>;
      caption?: string;
      /** contract 模式取数行数上限（默认 100） */
      limit?: number;
    }
  | { kind: 'chart'; contract: DocumentDataContract; spec: ChartSpec; caption?: string }
  | { kind: 'infographic'; syntax: string; title?: string; caption?: string }
  | { kind: 'image'; src: string; caption?: string }
  | { kind: 'pageBreak' };

export interface DocumentInstance {
  /** 文档类型 code（见 BUILTIN_DOCUMENT_TYPES） */
  type: string;
  title: string;
  subtitle?: string;
  author?: string;
  sections: DocumentSection[];
}

export type DocumentSectionKind = DocumentSection['kind'];

export interface DocumentTypeSectionSpec {
  kind: DocumentSectionKind;
  label: string;
  /** 给模型看的撰写要点 */
  hint?: string;
  required?: boolean;
}

export interface DocumentType {
  code: string;
  name: string;
  description: string;
  category: string;
  output: 'docx';
  sections: DocumentTypeSectionSpec[];
  /** 渲染前要用户填的变量（正文里的 {{key}} 占位符） */
  variables?: DocumentVariableSpec[];
  usage?: string;
  /** 内置类型不可删改（前端常量提供，不落库） */
  builtin?: boolean;
}

export interface DocumentVariableSpec {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select';
  default?: string;
  options?: string[];
}

export const BUILTIN_DOCUMENT_TYPES: DocumentType[] = [
  {
    code: 'data-report',
    name: '数据分析报告',
    description: '面向一次完整数据分析的正式报告：摘要、关键指标、趋势图、结构信息图、明细与结论。',
    category: '报告',
    output: 'docx',
    sections: [
      { kind: 'heading', label: '报告摘要', hint: '一段话说清结论与最重要的数字', required: true },
      { kind: 'metrics', label: '关键指标', hint: '3–5 个指标，值用已取到的数字', required: true },
      { kind: 'chart', label: '趋势', hint: '时间序列用折线/面积；给出 contract 与 spec', required: true },
      { kind: 'infographic', label: '结构洞察', hint: '把归因/构成做成信息图（list/compare/chart 模板）' },
      { kind: 'table', label: '明细', hint: 'contract 引用取数，或内联 ≤20 行小表', required: true },
      { kind: 'paragraph', label: '结论与建议', hint: '基于已取数据给行动建议，不编造数字', required: true },
    ],
    usage: '适合「分析一下 X 为什么下降」「出一份 X 的完整分析」这类请求。',
  },
  {
    code: 'weekly-report',
    name: '数据周报',
    description: '固定周期的数据周报：本周概览、核心指标趋势、结构信息图、异常归因、下周计划。',
    category: '报告',
    output: 'docx',
    sections: [
      { kind: 'paragraph', label: '本周概览', hint: '2–3 句：总量、环比、最值得注意的一点', required: true },
      { kind: 'metrics', label: '核心指标', hint: '本周值 + 环比（用已取到的数字）', required: true },
      { kind: 'chart', label: '指标趋势', hint: '按日/周粒度画折线', required: true },
      { kind: 'infographic', label: '渠道 / 构成', hint: '构成或对比用信息图，不要重复折线图' },
      { kind: 'paragraph', label: '异常与归因', hint: '峰值/谷值对应的业务事件；没有证据就写「待核实」', required: true },
      { kind: 'paragraph', label: '下周计划', hint: '1–3 条可执行事项' },
    ],
    usage: '适合「出本周数据周报」「把这周情况汇总一下」。',
  },
  {
    code: 'meeting-notes',
    name: '会议纪要',
    description: '结构化会议纪要：议题、结论（信息图）、待办（表格）、附录。',
    category: '纪要',
    output: 'docx',
    sections: [
      { kind: 'paragraph', label: '会议信息', hint: '时间、参会人、目标', required: true },
      { kind: 'heading', label: '议题与讨论', hint: '按议题分段，记录关键分歧' },
      { kind: 'infographic', label: '关键结论', hint: '用 list/sequence 模板把结论做成一张图', required: true },
      { kind: 'table', label: '待办', hint: '内联小表：事项 / 负责人 / 截止时间', required: true },
      { kind: 'paragraph', label: '遗留问题', hint: '未决事项与下次跟进时间' },
    ],
    usage: '适合「整理会议纪要」「把这段讨论变成纪要」。',
  },
];

export function documentTypeOf(code?: string): DocumentType | undefined {
  if (!code) return undefined;
  return BUILTIN_DOCUMENT_TYPES.find((t) => t.code === code);
}

/** 内置 + 自定义合并（内置在前，同 code 以自定义覆盖，便于用户改内置模板的副本） */
export function mergeDocumentTypes(custom: DocumentType[] = []): DocumentType[] {
  const map = new Map<string, DocumentType>();
  for (const t of BUILTIN_DOCUMENT_TYPES) map.set(t.code, { ...t, builtin: true });
  for (const t of custom) map.set(t.code, { ...t, builtin: false });
  return [...map.values()];
}

/** 按 code 找类型（自定义优先；实现与 mergeDocumentTypes 口径一致） */
export function findDocumentType(code: string | undefined, custom: DocumentType[] = []): DocumentType | undefined {
  if (!code) return undefined;
  const own = custom.find((t) => t.code === code);
  if (own) return { ...own, builtin: false };
  const builtin = documentTypeOf(code);
  return builtin ? { ...builtin, builtin: true } : undefined;
}

const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function fillVars(value: string, vars: Record<string, string>): string {
  return value.replace(VAR_RE, (whole, key: string) => (vars[key] !== undefined ? vars[key] : whole));
}

/**
 * 用变量值填充文档：只替换文本字段，不动 contract/spec/rows 里的数据引用。
 * 未提供的变量保留 {{key}} 原样，便于用户看出还没填。
 */
export function applyDocumentVariables(
  doc: DocumentInstance,
  vars: Record<string, string>,
): DocumentInstance {
  const keys = Object.keys(vars);
  if (!keys.length) return doc;
  const clone = JSON.parse(JSON.stringify(doc)) as DocumentInstance;
  clone.title = fillVars(clone.title, vars);
  if (clone.subtitle) clone.subtitle = fillVars(clone.subtitle, vars);
  if (clone.author) clone.author = fillVars(clone.author, vars);

  for (const s of clone.sections) {
    switch (s.kind) {
      case 'heading':
      case 'paragraph':
        s.text = fillVars(s.text, vars);
        break;
      case 'metrics':
        s.items = s.items.map((m) => ({
          label: fillVars(m.label, vars),
          value: fillVars(m.value, vars),
          ...(m.hint ? { hint: fillVars(m.hint, vars) } : {}),
        }));
        break;
      case 'table':
        if (s.caption) s.caption = fillVars(s.caption, vars);
        if (s.columns) s.columns = s.columns.map((c) => fillVars(c, vars));
        if (s.rows) {
          s.rows = s.rows.map((row) => row.map((cell) =>
            typeof cell === 'string' ? fillVars(cell, vars) : cell));
        }
        break;
      case 'chart':
        if (s.caption) s.caption = fillVars(s.caption, vars);
        break;
      case 'infographic':
        if (s.title) s.title = fillVars(s.title, vars);
        if (s.caption) s.caption = fillVars(s.caption, vars);
        s.syntax = fillVars(s.syntax, vars);
        break;
      case 'image':
        if (s.caption) s.caption = fillVars(s.caption, vars);
        break;
      default:
        break;
    }
  }
  return clone;
}
