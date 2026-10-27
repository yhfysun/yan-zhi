// 数据产物契约（P1）：任何取数方式（Python / SQL / JS）的结果都收敛成同一份 json 落盘，
// 下游图表/看板只认文件，不把行数据塞进模型上下文。
//
// 文件结构（与参考包 pySaveAndExecute 的 data_path json 同构）：
//   { columns: string[], rows: unknown[][], total: number, status, message, createdAt }
// 落点：会话工作目录 <name>_<8位短码>.json
import fs from 'node:fs';
import path from 'node:path';

export interface DataEnvelope {
  columns: string[];
  rows: unknown[][];
  total: number;
  status: 'success' | 'error';
  message?: string;
  createdAt: number;
}

export interface RawDataInput {
  columns?: unknown;
  rows?: unknown;
  total?: unknown;
  status?: unknown;
  message?: unknown;
}

const MAX_NAME_LEN = 60;

function shortCode(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

/** 文件名净化：去掉路径分隔符与非法字符，防目录穿越；空则回退 data */
export function safeArtifactName(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const cleaned = s
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_NAME_LEN);
  return cleaned || 'data';
}

/** 产物绝对路径：<工作目录>/<name>_<短码>.<ext> */
export function artifactPath(workspaceDir: string, name: string, ext: string): string {
  return path.join(workspaceDir, `${safeArtifactName(name)}_${shortCode()}.${ext.replace(/^\./, '')}`);
}

/** 单元格归一：对象/数组转 JSON 字符串，undefined 转 null（保证可按行下标取值） */
export function normalizeCell(v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * 归一化行数据：
 * - rows 为对象数组（SQL / JS 常见）→ 用列名取值
 * - rows 为二维数组（Python 常见）→ 原样按列序
 * - 列缺失时从对象键推导；都推导不出就报错
 */
export function normalizeRows(input: RawDataInput): { columns: string[]; rows: unknown[][] } {
  const rawRows = Array.isArray(input.rows) ? input.rows : [];
  let columns = Array.isArray(input.columns)
    ? (input.columns as unknown[]).map((c) => String(c)).filter(Boolean)
    : [];

  const isObjectRows = rawRows.length > 0 && rawRows[0] !== null && typeof rawRows[0] === 'object' && !Array.isArray(rawRows[0]);
  if (!columns.length && isObjectRows) {
    columns = Object.keys(rawRows[0] as Record<string, unknown>);
  }

  const rows: unknown[][] = rawRows.map((r) => {
    if (Array.isArray(r)) return r.map(normalizeCell);
    if (r && typeof r === 'object') {
      if (!columns.length) columns = Object.keys(r as Record<string, unknown>);
      return columns.map((c) => normalizeCell((r as Record<string, unknown>)[c]));
    }
    return [normalizeCell(r)];
  });

  if (!columns.length && rows.length) columns = rows[0].map((_, i) => `c${i + 1}`);
  return { columns, rows };
}

export interface WriteResult {
  dataPath: string;
  envelope: DataEnvelope;
}

/**
 * 写数据产物：截断到 size（首屏），total 独立保留全量条数。
 * @param size 首屏行数上限（默认 500）；<=0 表示不截断
 */
export function writeDataEnvelope(workspaceDir: string, name: string, input: RawDataInput, size = 500): WriteResult {
  const ws = String(workspaceDir || '').trim();
  if (!ws) throw new Error('没有会话工作目录，无法落盘数据文件');

  const { columns, rows } = normalizeRows(input);
  const rawTotal = Number(input.total);
  const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : rows.length;
  const limit = Number.isFinite(size) && size > 0 ? Math.trunc(size) : rows.length;
  const kept = rows.slice(0, limit);

  const envelope: DataEnvelope = {
    columns,
    rows: kept,
    total,
    status: input.status === 'error' ? 'error' : 'success',
    ...(typeof input.message === 'string' && input.message ? { message: input.message } : {}),
    createdAt: Date.now(),
  };

  fs.mkdirSync(ws, { recursive: true });
  const dataPath = artifactPath(ws, name, 'json');
  fs.writeFileSync(dataPath, JSON.stringify(envelope), 'utf-8');
  return { dataPath, envelope };
}

/** 读回数据产物（图表工具消费）；结构不合法直接抛错，不猜 */
export function readDataEnvelope(filePath: string): DataEnvelope {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('缺少数据文件路径');
  if (!fs.existsSync(p)) throw new Error(`数据文件不存在：${p}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    throw new Error(`数据文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  const obj = (parsed || {}) as Record<string, unknown>;
  if (!Array.isArray(obj.columns) || !Array.isArray(obj.rows)) {
    throw new Error('数据文件缺少 columns/rows（应为本契约落盘的 json）');
  }
  return {
    columns: (obj.columns as unknown[]).map((c) => String(c)),
    rows: obj.rows as unknown[][],
    total: Number.isFinite(Number(obj.total)) ? Number(obj.total) : (obj.rows as unknown[][]).length,
    status: obj.status === 'error' ? 'error' : 'success',
    ...(typeof obj.message === 'string' && obj.message ? { message: obj.message } : {}),
    createdAt: Number(obj.createdAt) || 0,
  };
}

/** 返回给模型的摘要：只给路径/条数/列名，不回行数据 */
export function summarizeEnvelope(env: DataEnvelope, dataPath: string, scriptFile?: string): string {
  return [
    `已保存数据产物：${path.basename(dataPath)}`,
    `data_path: ${dataPath}`,
    ...(scriptFile ? [`script_file: ${scriptFile}`] : []),
    `total: ${env.total}`,
    `columns: ${env.columns.join(', ') || '(无)'}`,
    `rows_kept: ${env.rows.length}`,
    ...(env.status === 'error' ? [`status: error${env.message ? ` — ${env.message}` : ''}`] : []),
  ].join('\n');
}
