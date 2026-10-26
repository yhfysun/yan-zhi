// 本体取数：意图拼装 + 结果行 → 图表数据。
// 工作台与看板组件共用同一套口径，避免两处各写一遍导致图表/明细表现不一致。
import type { ChartData, ChartPoint } from './chart-spec';

export type OntologyGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface OntologyIntentInput {
  /** 普通维度（可多个） */
  dimensions?: string[];
  /** 时间维度：服务端只接受一个（可带粒度） */
  timeDimension?: { name: string; grain?: OntologyGrain };
  /** 度量（可多个） */
  measures?: Array<{ name: string; agg?: string }>;
  /** 过滤器名（本体声明的，不是裸 SQL） */
  filters?: string[];
  limit?: number;
}

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

/** 意图只带白名单字段；limit 收敛到 1..1000，与服务端 sanitizeOntologyIntent 对齐 */
export function buildOntologyIntent(input: OntologyIntentInput): Record<string, unknown> {
  const raw = Number(input.limit);
  const limit = Math.min(Math.max(Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const intent: Record<string, unknown> = { limit };

  const dims = (input.dimensions || []).map((d) => String(d || '').trim()).filter(Boolean);
  if (dims.length) intent.dimensions = dims;

  const timeName = String(input.timeDimension?.name || '').trim();
  if (timeName) {
    intent.timeDimension = {
      name: timeName,
      ...(input.timeDimension?.grain ? { grain: input.timeDimension.grain } : {}),
    };
  }

  const measures = (input.measures || [])
    .map((m) => ({ name: String(m?.name || '').trim(), agg: m?.agg ? String(m.agg) : '' }))
    .filter((m) => m.name)
    .map((m) => (m.agg ? { name: m.name, agg: m.agg } : { name: m.name }));
  if (measures.length) intent.measures = measures;

  const filters = (input.filters || []).map((f) => String(f || '').trim()).filter(Boolean);
  if (filters.length) intent.filters = filters;

  return intent;
}

export interface OntologyChartOptions {
  /** X 轴字段（维度或时间维度的业务名） */
  xField: string;
  /** Y 轴度量（可多个 → 多系列） */
  measures: string[];
  /** 第二维度：按它的取值拆成多系列 */
  seriesField?: string;
  /** 只保留总值最大的前 N 个 X 值 */
  topN?: number;
  /** 按各系列合计换算成百分比 */
  percent?: boolean;
}

function toNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function labelOf(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * 本体取数结果（已按 X/系列分组聚合）→ ChartData。
 * - 无 seriesField：series = 度量名，points 按 X 值归并
 * - 有 seriesField：series = 「度量 · 系列值」组合，points 仍按 X 值归并
 */
export function ontologyRowsToChartData(
  rows: Record<string, unknown>[],
  opts: OntologyChartOptions,
): ChartData {
  const measures = (opts.measures || []).filter(Boolean);
  const seriesNames: string[] = [];
  const seriesValues: Array<{ measure: string; seriesValue?: string }> = [];

  if (!opts.seriesField) {
    for (const m of measures) {
      seriesNames.push(m);
      seriesValues.push({ measure: m });
    }
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      const sv = labelOf(row[opts.seriesField]);
      if (seen.has(sv)) continue;
      seen.add(sv);
      for (const m of measures) {
        seriesNames.push(`${m} · ${sv}`);
        seriesValues.push({ measure: m, seriesValue: sv });
      }
    }
  }

  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    const key = labelOf(row[opts.xField]);
    let values = byKey.get(key);
    if (!values) {
      values = new Array(seriesValues.length).fill(0);
      byKey.set(key, values);
    }
    const sv = opts.seriesField ? labelOf(row[opts.seriesField]) : undefined;
    seriesValues.forEach((s, i) => {
      if (opts.seriesField && s.seriesValue !== sv) return;
      values[i] += toNumber(row[s.measure]);
    });
  }

  let points: ChartPoint[] = [...byKey.entries()].map(([key, values]) => ({ key, values }));

  if (opts.topN && opts.topN > 0 && points.length > opts.topN) {
    const totalOf = (p: ChartPoint) => p.values.reduce((a, b) => a + b, 0);
    points = [...points].sort((a, b) => totalOf(b) - totalOf(a)).slice(0, opts.topN);
  }

  if (opts.percent) {
    seriesNames.forEach((_, i) => {
      const sum = points.reduce((a, p) => a + (p.values[i] || 0), 0);
      if (sum <= 0) return;
      for (const p of points) p.values[i] = Math.round(((p.values[i] || 0) / sum) * 10000) / 100;
    });
  }

  return {
    series: seriesNames,
    points,
    total: points.length,
    dim: opts.xField,
    measure: measures.join(', '),
    ...(opts.percent ? { agg: 'percent' } : {}),
  };
}
