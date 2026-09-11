// 文档内容提取（预览用）：xlsx → 表格数据，docx → HTML，pdf → 分页文本。
// 全部纯 JS（xlsx/mammoth/unpdf），不依赖原生模块；调用方对失败自行降级为「暂不支持预览」。

const EXCEL_MAX_ROWS = 500;
const EXCEL_MAX_COLS = 64;

function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface ExcelSheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

/** Excel（.xlsx/.xls）→ 每个工作表的二维字符串表（首行即表头行），用于前端表格渲染 */
export async function extractExcelSheets(b64: string): Promise<ExcelSheet[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(b64, { type: 'base64' });
  const sheets: ExcelSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    const truncated = raw.length > EXCEL_MAX_ROWS;
    const rows = raw
      .slice(0, EXCEL_MAX_ROWS)
      .map((r) => (r as unknown[]).slice(0, EXCEL_MAX_COLS).map((c) => String(c ?? '')));
    sheets.push({ name, rows, truncated });
  }
  return sheets;
}

/** Word（.docx）→ mammoth HTML（保留标题/表格/列表结构），供前端 v-html 渲染。
 *  mammoth 双构建：browser 版收 {arrayBuffer}，Node 版只认 {buffer}/{path}，按环境分流 */
export async function extractDocxHtml(b64: string): Promise<string> {
  const bytes = base64ToBytes(b64);
  const mammoth = await import('mammoth');
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    return result.value || '';
  }
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const result = await mammoth.convertToHtml({ arrayBuffer: ab });
  return result.value || '';
}

/** PDF → 分页纯文本（unpdf 内置 pdfjs）。浏览器端 worker 不可用时抛错，调用方降级为暂不支持 */
export async function extractPdfPages(b64: string): Promise<{ totalPages: number; pages: string[] }> {
  const bytes = base64ToBytes(b64);
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text)]).map((t) => (t || '').trim());
  return { totalPages, pages };
}
