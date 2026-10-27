// build_chart_dsl 的产物（图表定义）与前端识别。
// 工具把定义写进 .ychart.json，并在结果文本里带一段 [ychart]{...}[/ychart] 标记；
// 前端从工具结果里解析标记，按定义读数据文件渲染 —— 数据不经过模型上下文。

export type ChartDslKind = 'line' | 'area' | 'bar' | 'pie' | 'scatter' | 'table';

export interface ChartDslFile {
  version: 1;
  title: string;
  kind: ChartDslKind;
  dataPath: string;
  columns: string[];
  dim: string;
  measures: string[];
  series?: string;
  topN?: number;
  percent?: boolean;
  total: number;
  createdAt: number;
}

const KINDS = new Set<ChartDslKind>(['line', 'area', 'bar', 'pie', 'scatter', 'table']);

/** 从工具结果文本解析图表定义（缺失/不合法返回 null） */
export function parseChartDslMarker(text: string): ChartDslFile | null {
  const m = String(text || '').match(/\[ychart\]([\s\S]*?)\[\/ychart\]/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Partial<ChartDslFile>;
    if (!raw || typeof raw.dataPath !== 'string' || !raw.dataPath.trim()) return null;
    const kind = raw.kind as ChartDslKind;
    if (!KINDS.has(kind)) return null;
    return {
      version: 1,
      title: String(raw.title || '图表'),
      kind,
      dataPath: raw.dataPath,
      columns: Array.isArray(raw.columns) ? raw.columns.map(String) : [],
      dim: String(raw.dim || ''),
      measures: Array.isArray(raw.measures) ? raw.measures.map(String) : [],
      ...(raw.series ? { series: String(raw.series) } : {}),
      ...(Number.isFinite(Number(raw.topN)) && Number(raw.topN) > 0 ? { topN: Number(raw.topN) } : {}),
      ...(raw.percent === true ? { percent: true } : {}),
      total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : 0,
      createdAt: Number(raw.createdAt) || 0,
    };
  } catch {
    return null;
  }
}

/** 一轮回复里的多个工具结果 → 去重后的图表定义（同一 chart_file 只渲染一次） */
export function collectChartDsls(texts: Array<string | undefined | null>): ChartDslFile[] {
  const seen = new Set<string>();
  const out: ChartDslFile[] = [];
  for (const text of texts) {
    if (!text) continue;
    const dsl = parseChartDslMarker(text);
    if (!dsl || seen.has(dsl.dataPath + dsl.title)) continue;
    seen.add(dsl.dataPath + dsl.title);
    out.push(dsl);
  }
  return out;
}
