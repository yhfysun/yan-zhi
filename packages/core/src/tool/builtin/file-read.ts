import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { decodeTextBytesAs, base64ToBytes } from '@yan-zhi/shared';
import { resolveToolPath } from './fs-walk';

const EXCEL_EXTENSIONS = ['xlsx', 'xls', 'csv'];
const WORD_EXTENSIONS = ['docx'];
const PPTX_EXTENSIONS = ['pptx'];
const PDF_EXTENSIONS = ['pdf'];
const LEGACY_OFFICE_EXTENSIONS = ['doc', 'ppt'];
const MAX_ROWS = 10000;
const OUTPUT_CAP = 64 * 1024;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** 统一输出截断：超 64KB 保留头部并提示分段读取 */
function capOutput(text: string): string {
  if (text.length <= OUTPUT_CAP) return text;
  return text.slice(0, OUTPUT_CAP)
    + `\n\n[output truncated: ${text.length} chars total, showing first 64KB. Use offset/limit to read in segments, or file_grep to locate content.]`;
}

// ── Word HTML → Markdown 轻量转换（mammoth 输出 HTML，保留标题/表格/列表结构） ──

function stripInline(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  let s = html;
  // 1) 表格 → 管道表
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (tbl) => {
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
      [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => (stripInline(c[1]) || ' ').replace(/\|/g, '\\|'))
        .join(' | '),
    ).filter((r) => r.length > 0);
    if (rows.length === 0) return '\n\n';
    const width = rows[0].split(' | ').length;
    const sep = Array(width).fill('---').join(' | ');
    return '\n\n' + [rows[0], sep, ...rows.slice(1)].map((r) => `| ${r} |`).join('\n') + '\n\n';
  });
  // 2) 标题
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl: string, inner: string) =>
    `\n\n${'#'.repeat(Number(lvl))} ${stripInline(inner)}\n\n`);
  // 3) 行内强调 / 代码 / 链接（先于剥标签处理）
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => `**${stripInline(inner)}**`);
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => `*${stripInline(inner)}*`);
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner: string) => `\`${stripInline(inner)}\``);
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) =>
    `[${stripInline(inner)}](${href})`);
  // 4) 列表项
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `- ${stripInline(inner)}\n`);
  // 5) 块级换行 / 换行符 / 丢弃图片（避免 base64 膨胀）
  s = s.replace(/<\/(p|blockquote|ul|ol|table|div)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<img[^>]*>/gi, '');
  // 6) 剥掉剩余标签 + 解码实体
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // 7) 收敛空行
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export class FileReadTool implements BuiltInTool {
  name = 'file_read';
  description = '读取文件内容。文本文件返回完整内容（支持 offset/limit 按行分段），**自动识别编码**（UTF-8 / GBK / UTF-16，GBK/ANSI 中文文件也能正确读出）；Excel（.xlsx/.xls/.csv）返回表格数据，支持按工作表/区间读取，输出 CSV 或 JSON；Word（.docx）与 PowerPoint（.pptx）输出结构化 Markdown（标题/表格/列表/分页）；PDF 输出分页文本（--- Page N ---）。旧格式 .doc/.ppt 不支持。大文件读取前可先用 file_grep 定位。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute or relative path to the file to read.',
      },
      encoding: {
        type: 'string',
        enum: ['auto', 'utf-8', 'gbk', 'gb18030', 'gb2312', 'utf-16le', 'utf-16be', 'base64'],
        description: 'Text encoding. Defaults to "auto" (auto-detect: BOM → strict UTF-8 → GB18030 fallback, so GBK/ANSI Chinese files read correctly). Use "base64" to get raw bytes. Specify explicitly only when auto-detection is wrong (e.g. Big5 Traditional Chinese).',
      },
      offset: {
        type: 'number',
        description: 'For text files: 0-based line number to start reading from. Omit to read from the beginning.',
      },
      limit: {
        type: 'number',
        description: 'For text files: max number of lines to return (default 2000 when offset is set).',
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

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    // ★★★ 必填校验必须看**原始入参**（2026-09-30）：`resolveToolPath('')` 会返回工作目录根，
    //   若先解析再判空 → "没给 path" 被变成 "读工作目录" → `required:['path']` 静默失效。
    //   （这正是本项目反复踩的"校验对象被上游改写"同类问题：**先校验原值，再解析**。）
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    if (!rawPath) {
      return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };
    }
    // ★ 相对路径基于**工作目录**解析（此前直接交给 fs → 落到进程 cwd → 报文件不存在）
    const path = resolveToolPath(rawPath, ctx?.workspaceDir);

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
    if (PDF_EXTENSIONS.includes(ext)) {
      return this.readPdf(path, fs);
    }
    if (LEGACY_OFFICE_EXTENSIONS.includes(ext)) {
      return {
        content: [{ type: 'text', text: `Error: 不支持老格式 .${ext}，请另存为 .${ext}x（Office 新格式）后再读取。` }],
        isError: true,
      };
    }

    try {
      // ★ encoding 参数此前**声明了却没人用**（静默失效）：README 说可指定编码，
      //   实际永远走 fs.readFile。这里补齐：
      //   - base64 → 返回原始字节的 base64（供调用方自行处理）
      //   - 显式编码 → 按指定编码解码（Big5 这类无法自动区分的场景靠它）
      //   - auto/未传 → fs.readFile（各端已实现自动识别编码）
      const enc = String(args.encoding || 'auto').trim().toLowerCase();
      if (enc === 'base64') {
        const b64 = await fs.readFileBase64(path);
        return { content: [{ type: 'text', text: `[base64 of ${path}]\n${b64}` }] };
      }
      let content: string;
      if (enc && enc !== 'auto' && enc !== 'utf-8') {
        const b64 = await fs.readFileBase64(path);
        const asEnc = decodeTextBytesAs(base64ToBytes(b64), enc);
        // 不认识的编码名 → 明确报错，不静默按 UTF-8 读（否则又是"看着成功实则是乱码"）
        if (asEnc === null) {
          return {
            content: [{ type: 'text', text: `Error: 不支持的编码 "${args.encoding}"（可选 auto/utf-8/gbk/gb18030/gb2312/utf-16le/utf-16be/base64）` }],
            isError: true,
          };
        }
        content = asEnc;
      } else {
        content = await fs.readFile(path);
      }
      return { content: [{ type: 'text', text: this.readTextLines(content, args) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading file: ${msg}` }], isError: true };
    }
  }

  /** 文本文件按行分段读取：offset/limit 以行为单位，总输出仍受 64KB 上限 */
  private readTextLines(content: string, args: Record<string, unknown>): string {
    const hasOffset = args.offset != null;
    if (!hasOffset) {
      // 保持原行为：无 offset 时全量读取，仅做 64KB 截断
      if (content.length > OUTPUT_CAP) {
        return capOutput(content);
      }
      return content;
    }
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
    const limit = Math.min(Math.max(Math.floor(Number(args.limit) || 2000), 1), 10000);
    const slice = lines.slice(offset, offset + limit);
    const header = `[lines ${offset + 1}-${Math.min(offset + slice.length, lines.length)} of ${lines.length}]`;
    let out = `${header}\n${slice.join('\n')}`;
    if (offset + slice.length < lines.length) {
      out += `\n\n[truncated: ${lines.length - offset - slice.length} more lines. Continue with offset=${offset + slice.length}.]`;
    }
    return capOutput(out);
  }

  private async readExcel(
    path: string,
    args: Record<string, unknown>,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      // xlsx/xls 是二进制 zip，必须 base64 读取后解析（UTF-8 文本读出来是乱码）
      const b64 = await fs.readFileBase64(path);
      const XLSX = await import('xlsx');

      const workbook = XLSX.read(b64, { type: 'base64' });
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
        return { content: [{ type: 'text', text: capOutput(JSON.stringify(result, null, 2)) }] };
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
      return { content: [{ type: 'text', text: capOutput(parts.join('\n\n')) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading Excel file: ${msg}` }], isError: true };
    }
  }

  /** Word → 结构化 Markdown（mammoth 转 HTML 后转 md，保留标题/表格/列表） */
  private async readDocx(
    path: string,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      const b64 = await fs.readFileBase64(path);
      const bytes = base64ToBytes(b64);
      const mammoth = await import('mammoth');
      // mammoth 双构建：Node 版(lib)只认 {buffer}/{path}，browser 版收 {arrayBuffer}
      const result = typeof Buffer !== 'undefined' && typeof Buffer.from === 'function'
        ? await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
        : await mammoth.convertToHtml({ arrayBuffer: (() => { const ab = new ArrayBuffer(bytes.byteLength); new Uint8Array(ab).set(bytes); return ab; })() });
      const md = htmlToMarkdown(result.value || '');
      const messages = (result.messages || []).filter((m) => m.type === 'warning');
      const note = messages.length ? `\n\n[converter warnings: ${messages.length}]` : '';
      return { content: [{ type: 'text', text: capOutput((md || '(文档为空)') + note) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading Word file: ${msg}` }], isError: true };
    }
  }

  /** PPTX → 结构化 Markdown（按形状/段落解析，标题占位符 → 二级标题，段落层级 → 缩进列表） */
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
        const idx = parseInt(name.match(/slide(\d+)\.xml/)![1], 10);
        const lines: string[] = [];
        // 逐形状解析（<p:sp> 不嵌套，非贪婪安全）
        const shapes = xml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) || [];
        for (const sp of shapes) {
          const isTitle = /<p:ph[^>]*type="(ctrTitle|title)"/.test(sp);
          const paras = sp.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
          for (const para of paras) {
            const lvl = Number(para.match(/<a:pPr[^>]*lvl="(\d+)"/)?.[1] || 0);
            const texts = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]).trim());
            const text = texts.filter(Boolean).join('');
            if (!text) continue;
            if (isTitle) {
              lines.push(`## ${text}`);
            } else {
              lines.push(`${'  '.repeat(Math.min(lvl, 4))}- ${text}`);
            }
          }
        }
        parts.push(`--- Slide ${idx} ---\n${lines.join('\n') || '(空幻灯片)'}`);
      }
      return { content: [{ type: 'text', text: capOutput(parts.join('\n\n')) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading PowerPoint file: ${msg}` }], isError: true };
    }
  }

  /** PDF → 分页文本（unpdf / pdfjs，纯 JS 实现，Node 与桌面端可用） */
  private async readPdf(
    path: string,
    fs: ReturnType<typeof getPlatformAdapter>['fs'],
  ): Promise<McpCallResult> {
    try {
      const b64 = await fs.readFileBase64(path);
      const bytes = base64ToBytes(b64);
      const { getDocumentProxy, extractText } = await import('unpdf');
      const pdf = await getDocumentProxy(bytes);
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(text) ? text : [String(text)];
      const parts = pages.map((pageText, i) => `--- Page ${i + 1}/${totalPages} ---\n${(pageText || '').trim() || '(本页无可提取文本，可能是扫描件/图片页)'}`);
      return { content: [{ type: 'text', text: capOutput(parts.join('\n\n')) }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading PDF file: ${msg}` }], isError: true };
    }
  }
}
