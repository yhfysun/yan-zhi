// 数据产物文件（P1 契约）的前端读取与图表映射。
// 文件由 py_save_exec / data_save 落在会话工作目录，结构 { columns, rows, total }。
import { apiFetch } from '../api/client';
import type { ChartData } from '../components/chat/chart-spec';
import { ontologyRowsToChartData } from '../components/chat/ontology-view';

export interface DataFileEnvelope {
  columns: string[];
  rows: unknown[][];
  total: number;
  status?: string;
  message?: string;
}

/** 读数据产物 JSON（走 workspace-files 流式端点；失败返回 null，不抛） */
export async function loadDataFile(path: string): Promise<DataFileEnvelope | null> {
  const p = String(path || '').trim();
  if (!p) return null;
  const r = await apiFetch<DataFileEnvelope>(`/workspace-files/file-stream?path=${encodeURIComponent(p)}`);
  if ('error' in r) return null;
  const d = r.data as DataFileEnvelope | undefined;
  if (!d || !Array.isArray(d.columns) || !Array.isArray(d.rows)) return null;
  return {
    columns: d.columns.map(String),
    rows: d.rows,
    total: Number.isFinite(Number(d.total)) ? Number(d.total) : d.rows.length,
    ...(typeof d.status === 'string' ? { status: d.status } : {}),
    ...(typeof d.message === 'string' ? { message: d.message } : {}),
  };
}

/** 二维行 → 对象行（图表映射与明细渲染共用） */
export function envelopeToObjects(env: DataFileEnvelope): Array<Record<string, unknown>> {
  return env.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    env.columns.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

/** 数据产物 → ChartData（多度量 = 多系列，与本体取数同一套映射） */
export function envelopeToChartData(
  env: DataFileEnvelope,
  opts: { xField: string; measures: string[]; seriesField?: string; topN?: number; percent?: boolean },
): ChartData {
  return ontologyRowsToChartData(envelopeToObjects(env), opts);
}
