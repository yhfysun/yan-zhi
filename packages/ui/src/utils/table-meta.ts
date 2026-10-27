// 表格列元信息推断（纯函数，便于单测）
//
// 目标：不做重型单元格组件，只按抽样值决定「对齐 / 宽度 / 是否 ID 列」，
// 让明细表在窄面板里也能读：数字右对齐、ID 等宽、长文本给足宽度。

export interface ColumnMeta {
  align: 'left' | 'right' | 'center';
  width: number;
  kind: 'number' | 'boolean' | 'date' | 'id' | 'text' | 'empty';
}

const ID_NAME_RE = /(^id$|_id$|Id$)/;
const DATE_NAME_RE = /(_at$|_date$|date|time|day|month|year|created|updated)/i;

function isEmptyish(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

function sampleValues(rows: Array<Record<string, unknown>>, col: string, cap = 50): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) {
    const v = row?.[col];
    if (isEmptyish(v)) continue;
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

export function inferColumnMeta(columns: string[], rows: Array<Record<string, unknown>>): Record<string, ColumnMeta> {
  const meta: Record<string, ColumnMeta> = {};
  for (const col of columns) {
    const values = sampleValues(rows, col);
    if (!values.length) {
      meta[col] = { align: 'left', width: 120, kind: 'empty' };
      continue;
    }
    const allNum = values.every((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))));
    const allBool = values.every((v) => typeof v === 'boolean' || v === 0 || v === 1 || v === '0' || v === '1' || v === 'true' || v === 'false');
    const allDate = values.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v));
    const avgLen = values.reduce<number>((s, v) => s + String(v).length, 0) / values.length;

    if (allBool) { meta[col] = { align: 'center', width: 90, kind: 'boolean' }; continue; }
    if (allNum) { meta[col] = { align: 'right', width: 110, kind: 'number' }; continue; }
    if (allDate || DATE_NAME_RE.test(col)) { meta[col] = { align: 'left', width: 160, kind: 'date' }; continue; }
    if (ID_NAME_RE.test(col)) { meta[col] = { align: 'left', width: avgLen > 16 ? 190 : 150, kind: 'id' }; continue; }
    meta[col] = { align: 'left', width: avgLen > 24 ? 220 : 140, kind: 'text' };
  }
  return meta;
}

/** 表格数值展示：千分位，最多 4 位小数（4567864 → 4,567,864） */
const NUMBER_FORMAT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

/** 单元格展示：空 / 空数组对象统一显示「—」，布尔转中文，数字千分位，对象转 JSON */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? NUMBER_FORMAT.format(value) : String(value);
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value);
      return s === '[]' || s === '{}' ? '—' : s;
    } catch {
      return '—';
    }
  }
  return String(value);
}

/**
 * 列角色拆分（图表按「指标 × 维度」配置）：数值列 = 指标，文本/日期/ID/布尔 = 维度，空列两边都不要。
 * ★ 之前图表直接把任意列塞进 Y，文本列也能当度量 → 画出一排 1。
 */
export function splitColumnRoles(columns: string[], rows: Array<Record<string, unknown>>): { dims: string[]; measures: string[] } {
  const meta = inferColumnMeta(columns, rows);
  const dims: string[] = [];
  const measures: string[] = [];
  for (const c of columns) {
    const kind = meta[c]?.kind;
    if (kind === 'number') measures.push(c);
    else if (kind && kind !== 'empty') dims.push(c);
  }
  return { dims, measures };
}
