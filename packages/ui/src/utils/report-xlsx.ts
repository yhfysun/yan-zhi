// 工作台 → Excel（.xlsx）
//
// 只吃「已经拿到的行」：明细与聚合各一 sheet。取数由调用方通过 /query-contract/export
// 或 /query-contract/aggregate 完成，这里不做任何查询。
// 依赖 exceljs（浏览器构建，已有依赖），样式只做表头、冻结首行、列宽与数字右对齐。

import ExcelJS from 'exceljs';

export interface XlsxSheet {
  /** sheet 名（超长/非法字符会净化） */
  name: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 42;
const SHEET_NAME_MAX = 31;

/** Excel sheet 名限制：≤31 字符，且不能含 \ / ? * [ ] : */
export function sanitizeSheetName(raw: string, fallback = 'Sheet'): string {
  const cleaned = String(raw || '').replace(/[\\/?*[\]:]/g, '_').trim();
  return (cleaned || fallback).slice(0, SHEET_NAME_MAX);
}

/** 显示宽度：CJK 按 2 个字符计，用于估算列宽 */
function displayWidth(value: unknown): number {
  if (value == null) return 0;
  let width = 0;
  for (const ch of String(value)) width += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return width;
}

function styleSheet(ws: ExcelJS.Worksheet, sheet: XlsxSheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  header.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.columns.forEach((col, i) => {
    let width = displayWidth(col);
    for (const row of sheet.rows) width = Math.max(width, displayWidth(row[i]));
    ws.getColumn(i + 1).width = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width + 2));

    // 整列都是数字（或空）→ 右对齐，便于对账
    const numeric = sheet.rows.every((row) => row[i] == null || typeof row[i] === 'number');
    if (!numeric) return;
    for (let r = 2; r <= sheet.rows.length + 1; r++) {
      ws.getRow(r).getCell(i + 1).alignment = { horizontal: 'right' };
    }
  });
}

export async function buildWorkbookXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '言智';

  const used = new Set<string>();
  for (const sheet of sheets) {
    if (!sheet.columns.length) continue;
    // sheet 名去重，否则 exceljs 会静默追加序号，用户看不出对应关系
    let name = sanitizeSheetName(sheet.name);
    for (let n = 2; used.has(name); n++) name = sanitizeSheetName(`${sheet.name}_${n}`);
    used.add(name);

    const ws = wb.addWorksheet(name);
    ws.columns = sheet.columns.map((c) => ({ header: c, key: c }));
    for (const row of sheet.rows) ws.addRow(row);
    styleSheet(ws, sheet);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
