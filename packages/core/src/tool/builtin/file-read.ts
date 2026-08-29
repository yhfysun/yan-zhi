import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

const EXCEL_EXTENSIONS = ['xlsx', 'xls', 'csv'];
const WORD_EXTENSIONS = ['docx'];
const PPTX_EXTENSIONS = ['pptx'];
const LEGACY_OFFICE_EXTENSIONS = ['doc', 'ppt'];
const MAX_ROWS = 10000;

function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class FileReadTool implements BuiltInTool {
  name = 'file_read';
  description = 'Read the contents of a file. For text files returns the full content. For Excel files (.xlsx/.xls/.csv) returns tabular data — supports sheet selection, range filtering, and CSV/JSON output formats. For Word (.docx) returns extracted text. For PowerPoint (.pptx) returns text per slide. Legacy .doc/.ppt are not supported.';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute or relative path to the file to read.',
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'base64'],
        description: 'Encoding to use when reading text files. Defaults to utf-8.',
      },
      sheet: {
        type: 'string',
        description: 'Sheet name or 0-based index for Excel files. Omit to read all sheets.',
      },
      range: {
        type: 'string',
        description: 'Cell range for Excel files, e.g. "A1:D100". Omit for entire sheet (capped).',
      },
      format: {
        type: 'string',
        enum: ['csv', 'json'],
        description: 'Output format for Excel files. Defaults to csv.',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const path = args.path as string;

    if (!path) {
      return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };
    }

    const exists = await fs.exists(path);
    if (!exists) {
      return { content: [{ type: 'text', text: `Error: file not found: ${path}` }], isError: true };
    }

    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (EXCEL_EXTENSIONS.includes(ext)) {
      return this.readExcel(path, args, fs);
    }
    if (WORD_EXTENSIONS.includes(ext)) {
      return this.readDocx(path, fs);
    }
    if (PPTX_EXTENSIONS.includes(ext)) {
      return this.readPptx(path, fs);
    }
    if (LEGACY_OFFICE_EXTENSIONS.includes(ext)) {
      return {
        content: [{ type: 'text', text: `Error: 不支持老格式 .${ext}，请另存为 .${ext}x（Office 新格式）后再读取。` }],
        isError: true,
      };
    }

    try {
      const content = await fs.readFile(path);
      return { content: [{ type: 'text', text: content }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading file: ${msg}` }], isError: true };
    }
  }

  private async readExcel(
    path: string,
    args: Record<string, unknown>,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      const content = await fs.readFile(path);
      const XLSX = await import('xlsx');

      const workbook = XLSX.read(content, { type: 'string' });
      const sheetParam = args.sheet as string | undefined;
      const rangeParam = args.range as string | undefined;
      const formatParam = (args.format as string) || 'csv';

      let sheetNames: string[];
      if (sheetParam !== undefined && sheetParam !== '') {
        if (workbook.SheetNames.includes(sheetParam)) {
          sheetNames = [sheetParam];
        } else {
          const idx = parseInt(sheetParam, 10);
          if (!isNaN(idx) && idx >= 0 && idx < workbook.SheetNames.length) {
            sheetNames = [workbook.SheetNames[idx]];
          } else {
            return {
              content: [{ type: 'text', text: `Error: sheet "${sheetParam}" not found. Available: ${workbook.SheetNames.join(', ')}` }],
              isError: true,
            };
          }
        }
      } else {
        sheetNames = workbook.SheetNames;
      }

      const sheetOpts: Record<string, unknown> = {};
      if (rangeParam) {
        try {
          sheetOpts.range = XLSX.utils.decode_range(rangeParam);
        } catch {
          return {
            content: [{ type: 'text', text: `Error: invalid range "${rangeParam}". Use format like "A1:D100".` }],
            isError: true,
          };
        }
      }

      if (formatParam === 'json') {
        const result: Record<string, unknown[]> = {};
        for (const sn of sheetNames) {
          const ws = workbook.Sheets[sn];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
          let rows = json;
          if (rows.length > MAX_ROWS && !rangeParam) {
            rows = rows.slice(0, MAX_ROWS);
          }
          const headers = (rows[0] || []) as string[];
          const data = rows.slice(1).map(r => {
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => { obj[h] = (r as unknown[])[i]; });
            return obj;
          });
          const truncatedNote = json.length > MAX_ROWS && !rangeParam
            ? ` (truncated from ${json.length} rows)` : '';
          result[sn + truncatedNote] = data;
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Default: CSV
      const parts: string[] = [];
      for (const sn of sheetNames) {
        const ws = workbook.Sheets[sn];
        const csv = XLSX.utils.sheet_to_csv(ws, { RS: '\n' });
        const lines = csv.split('\n');
        let truncated = false;
        if (lines.length > MAX_ROWS && !rangeParam) {
          lines.length = MAX_ROWS;
          truncated = true;
        }
        let output = lines.join('\n');
        if (truncated) {
          output += `\n\n[Truncated: showing ${MAX_ROWS} rows. Use range to read more.]`;
        }
        parts.push(`--- Sheet: ${sn} ---\n${output}`);
      }
      return { content: [{ type: 'text', text: parts.join('\n\n') }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading Excel file: ${msg}` }], isError: true };
    }
  }

  private async readDocx(
    path: string,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      const b64 = await fs.readFileBase64(path);
      const bytes = base64ToBytes(b64);
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: ab });
      const text = result.value || '';
      return { content: [{ type: 'text', text: text || '(文档为空)' }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading Word file: ${msg}` }], isError: true };
    }
  }

  private async readPptx(
    path: string,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      const b64 = await fs.readFileBase64(path);
      const bytes = base64ToBytes(b64);
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(bytes);
      const slideNames = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => {
          const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
          const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
          return na - nb;
        });
      if (slideNames.length === 0) {
        return { content: [{ type: 'text', text: '(未找到幻灯片)' }] };
      }
      const parts: string[] = [];
      for (const name of slideNames) {
        const xml = await zip.file(name)!.async('string');
        const texts: string[] = [];
        const re = /<a:t>([\s\S]*?)<\/a:t>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(xml)) !== null) {
          const t = m[1]
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          if (t) texts.push(t);
        }
        const idx = parseInt(name.match(/slide(\d+)\.xml/)![1], 10);
        parts.push(`--- Slide ${idx} ---\n${texts.join(' ') || '(空幻灯片)'}`);
      }
      return { content: [{ type: 'text', text: parts.join('\n\n') }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading PowerPoint file: ${msg}` }], isError: true };
    }
  }
}
