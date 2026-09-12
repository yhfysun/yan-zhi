// Excel 带样式解析：用 exceljs 读取单元格的字体/颜色/对齐/填充/合并单元格/列宽，
// 返回结构化数据供前端按样式渲染。与 core 的 extractExcelSheets（仅取值，供服务端"文件转 Markdown"）解耦。
import ExcelJS from 'exceljs';

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  color?: string; // #rrggbb
  bg?: string; // #rrggbb
  fontSize?: number;
  wrap?: boolean;
}

export interface StyledCell {
  v: string;
  s: CellStyle;
}

export interface ExcelMerge {
  /** 0 基，左上角行 */
  r: number;
  /** 0 基，左上角列 */
  c: number;
  /** 跨行数 */
  rs: number;
  /** 跨列数 */
  cs: number;
}

export interface ExcelStyledSheet {
  name: string;
  /** 二维单元格（含表头行），0 基 */
  cells: StyledCell[][];
  merges: ExcelMerge[];
  /** 每列宽度（px，约数） */
  colWidths: number[];
  truncated: boolean;
}

export interface ExcelStyledBook {
  sheets: ExcelStyledSheet[];
}

const MAX_ROWS = 500;
const MAX_COLS = 64;

function argbToHex(argb?: string): string | undefined {
  if (!argb) return undefined;
  // exceljs 颜色多为 AARRGGBB；去掉 alpha，保留 RRGGBB
  if (argb.length === 8) return '#' + argb.slice(2).toLowerCase();
  if (argb.length === 6) return '#' + argb.toLowerCase();
  return undefined;
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

// 列字母 → 列号（1 基），如 "AB" → 28
function colLettersToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// 解析合并单元格范围字符串（如 "A1:C3"）→ 0 基 ExcelMerge
function parseMergeRange(range: string): ExcelMerge | null {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  const left = colLettersToNum(m[1]) - 1;
  const top = parseInt(m[2], 10) - 1;
  const right = colLettersToNum(m[3]) - 1;
  const bottom = parseInt(m[4], 10) - 1;
  return { r: top, c: left, rs: bottom - top + 1, cs: right - left + 1 };
}

function formatCellValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())} ${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  }
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('text' in o && o.text != null) return String(o.text);
    if ('result' in o && o.result != null) return String(o.result);
    if ('formula' in o) return '';
    return '';
  }
  return String(v);
}

export async function parseExcelStyled(b64: string): Promise<ExcelStyledBook> {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

  const wb = new ExcelJS.Workbook();
  // exceljs 浏览器构建的 load 接收 Buffer/ArrayBuffer/Uint8Array；此处为满足其 .d.ts 类型做透传转换
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheets: ExcelStyledSheet[] = [];
  for (const ws of wb.worksheets) {
    const dims = ws.dimensions;
    const maxRow = Math.min(dims ? dims.bottom : ws.rowCount, MAX_ROWS);
    const maxCol = Math.min(dims ? dims.right : ws.columnCount, MAX_COLS);

    const cells: StyledCell[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const row: StyledCell[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = ws.getCell(r, c);
        const style: CellStyle = {};
        const f = cell.font;
        if (f) {
          if (f.bold) style.bold = true;
          if (f.italic) style.italic = true;
          if (f.underline) style.underline = true;
          if (f.strike) style.strike = true;
          if (f.size) style.fontSize = f.size;
          const col = f.color && f.color.argb ? argbToHex(f.color.argb) : undefined;
          if (col) style.color = col;
        }
        const al = cell.alignment;
        if (al) {
          if (al.horizontal) style.align = al.horizontal as CellStyle['align'];
          if (al.vertical) style.valign = al.vertical as CellStyle['valign'];
          if (al.wrapText) style.wrap = true;
        }
        const fill = cell.fill;
        if (fill && fill.type === 'pattern' && fill.fgColor && fill.fgColor.argb) {
          const bg = argbToHex(fill.fgColor.argb);
          if (bg) style.bg = bg;
        }
        row.push({ v: formatCellValue(cell), s: style });
      }
      cells.push(row);
    }

    // 合并单元格：exceljs 模型里是范围字符串数组
    const merges: ExcelMerge[] = [];
    const model = (ws as unknown as { model?: { merges?: string[] } }).model;
    if (model && Array.isArray(model.merges)) {
      for (const range of model.merges) {
        const m = parseMergeRange(range);
        if (m) merges.push(m);
      }
    }

    // 列宽（字符数 → px 约数）
    const colWidths: number[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const col = ws.getColumn(c);
      const w = col.width ? Math.round(col.width * 7) : 80;
      colWidths.push(Math.max(w, 40));
    }

    sheets.push({
      name: ws.name,
      cells,
      merges,
      colWidths,
      truncated: (dims ? dims.bottom : ws.rowCount) > MAX_ROWS,
    });
  }
  return { sheets };
}

/** 单元格编辑：sheet 为工作簿序号，r/c 为 0 基行/列 */
export interface ExcelCellEdit {
  sheet: number;
  r: number;
  c: number;
  v: string | null;
}

function u8ToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

/**
 * 应用单元格值编辑并写回 .xlsx（base64）。
 * 基于 exceljs 原地修改 value，保留原有样式/合并/列宽等；空串清空单元格，纯数字串转为数值。
 */
export async function applyExcelEdits(sourceB64: string, edits: ExcelCellEdit[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(b64ToU8(sourceB64) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  for (const e of edits) {
    const ws = wb.worksheets[e.sheet];
    if (!ws) continue;
    const cell = ws.getCell(e.r + 1, e.c + 1);
    if (e.v === null || e.v === '') cell.value = null;
    else if (typeof e.v === 'string' && e.v.trim() !== '' && !isNaN(Number(e.v)) && isFinite(Number(e.v))) cell.value = Number(e.v);
    else cell.value = e.v;
  }
  const out = await wb.xlsx.writeBuffer();
  return u8ToB64(new Uint8Array(out as ArrayBuffer));
}
