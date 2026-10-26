// .ydash —— 言智看板中间格式（v1）
//
// 纯文本 JSON：可 diff、可校验、可导入导出。一个看板 = 标题 + 可选变量 + 若干 widget。
// widget 只存「取数引用 + 图表定义 + 位置」，不存行数据 —— 打开时按 contract 活取数。
// 位置用 12 列网格（与常见 BI 一致），x/y 从 0 起，w 1..12，h 为行数。

import type { ChartSpec } from '../components/chat/chart-spec';
import type { DocumentDataContract, DocumentMetric } from './document-types';

export const YDASH_VERSION = 1;
export const YDASH_EXT = '.ydash';
export const MAX_YDASH_WIDGETS = 40;

export type YdashWidgetKind = 'chart' | 'table' | 'metric' | 'text' | 'infographic';

export interface YdashPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface YdashWidget {
  id: string;
  kind: YdashWidgetKind;
  title?: string;
  /** chart / table / metric 的取数引用 */
  contract?: DocumentDataContract;
  /** kind=chart */
  spec?: ChartSpec;
  /** kind=infographic */
  syntax?: string;
  /** kind=text */
  text?: string;
  /** kind=metric */
  metrics?: DocumentMetric[];
  pos: YdashPosition;
}

export interface YdashVariable {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select';
  default?: string;
  options?: string[];
}

export interface YdashFile {
  version: number;
  title: string;
  description?: string;
  variables?: YdashVariable[];
  widgets: YdashWidget[];
}

export type YdashResult =
  | { ok: true; dash: YdashFile }
  | { ok: false; error: string };

const KINDS = new Set<YdashWidgetKind>(['chart', 'table', 'metric', 'text', 'infographic']);

function isPos(v: unknown): v is YdashPosition {
  const p = v as Record<string, unknown> | undefined;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w) && Number.isFinite(p.h)
    && (p.x as number) >= 0 && (p.y as number) >= 0 && (p.w as number) >= 1 && (p.w as number) <= 12 && (p.h as number) >= 1;
}

/** 校验并裁剪一个看板定义（导入/导出共用） */
export function normalizeYdash(raw: unknown): YdashResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '看板必须是 JSON 对象' };
  const d = raw as Record<string, unknown>;
  if (typeof d.title !== 'string' || !d.title.trim()) return { ok: false, error: '缺少 title' };
  if (!Array.isArray(d.widgets) || d.widgets.length === 0) return { ok: false, error: 'widgets 必须是非空数组' };
  if (d.widgets.length > MAX_YDASH_WIDGETS) return { ok: false, error: `widgets 超过 ${MAX_YDASH_WIDGETS} 个，请精简` };

  const ids = new Set<string>();
  const widgets: YdashWidget[] = [];
  for (let i = 0; i < d.widgets.length; i++) {
    const w = d.widgets[i] as Record<string, unknown> | undefined;
    if (!w || typeof w !== 'object') return { ok: false, error: `第 ${i + 1} 个 widget 不是对象` };
    const id = typeof w.id === 'string' ? w.id.trim() : '';
    if (!id) return { ok: false, error: `第 ${i + 1} 个 widget 缺少 id` };
    if (ids.has(id)) return { ok: false, error: `widget id 重复：${id}` };
    ids.add(id);
    const kind = w.kind as YdashWidgetKind;
    if (!KINDS.has(kind)) return { ok: false, error: `widget ${id} 的 kind 非法：${String(w.kind)}` };
    if (!isPos(w.pos)) return { ok: false, error: `widget ${id} 的 pos 非法（x/y≥0，1≤w≤12，h≥1）` };
    if (kind === 'chart') {
      const spec = w.spec as Record<string, unknown> | undefined;
      if (!spec || typeof spec.dim !== 'string' || typeof spec.measure !== 'string') {
        return { ok: false, error: `widget ${id} 的 chart 需要 spec.dim 与 spec.measure` };
      }
    }
    if (kind === 'infographic' && (typeof w.syntax !== 'string' || !w.syntax.trim())) {
      return { ok: false, error: `widget ${id} 的 infographic 缺少 syntax` };
    }
    widgets.push({
      id,
      kind,
      ...(typeof w.title === 'string' && w.title.trim() ? { title: w.title.trim() } : {}),
      ...(w.contract && typeof w.contract === 'object' ? { contract: w.contract as DocumentDataContract } : {}),
      ...(w.spec && typeof w.spec === 'object' ? { spec: w.spec as ChartSpec } : {}),
      ...(typeof w.syntax === 'string' ? { syntax: w.syntax } : {}),
      ...(typeof w.text === 'string' ? { text: w.text } : {}),
      ...(Array.isArray(w.metrics) ? { metrics: w.metrics as DocumentMetric[] } : {}),
      pos: w.pos as YdashPosition,
    });
  }

  return {
    ok: true,
    dash: {
      version: YDASH_VERSION,
      title: d.title.trim(),
      ...(typeof d.description === 'string' && d.description.trim() ? { description: d.description.trim() } : {}),
      ...(Array.isArray(d.variables) ? { variables: d.variables as YdashVariable[] } : {}),
      widgets,
    },
  };
}

export function parseYdash(text: string): YdashResult {
  let data: unknown;
  try {
    data = JSON.parse(String(text || ''));
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (data && typeof data === 'object') {
    const v = Number((data as Record<string, unknown>).version);
    if (Number.isFinite(v) && v > YDASH_VERSION) {
      return { ok: false, error: `.ydash 版本 ${v} 高于当前支持的 ${YDASH_VERSION}` };
    }
  }
  return normalizeYdash(data);
}

export function toYdash(dash: Omit<YdashFile, 'version'>): string {
  const file: YdashFile = { version: YDASH_VERSION, ...dash };
  return JSON.stringify(file, null, 2);
}
