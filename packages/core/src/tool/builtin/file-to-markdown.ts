// file_to_markdown：办公文档 → Markdown 文件（docx/xlsx/xls/pptx/pdf）。
// 工作流：LLM 先调用本工具得到 .md 路径，再用 file_read / file_grep 分段读取。
// 转换基于 core 内置的 mammoth/xlsx/jszip/unpdf，纯 JS、无 Python 依赖，离线可用。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { extractDocxHtml, extractPdfPages, extractExcelSheets } from '../../preview';
import { htmlToMarkdown } from './file-read';

const DOCX_EXTS = ['docx'];
const EXCEL_EXTS = ['xlsx', 'xls'];
const PPTX_EXTS = ['pptx'];
const PDF_EXTS = ['pdf'];
const LEGACY_EXTS = ['doc', 'ppt', 'rtf'];
const MD_TABLE_MAX_ROWS = 500;

function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Excel → Markdown（每个工作表一个管道表格） */
async function excelToMarkdown(b64: string): Promise<string> {
  const sheets = await extractExcelSheets(b64);
  const parts: string[] = [];
  for (const sheet of sheets) {
    parts.push(`## Sheet: ${sheet.name}\n`);
    const rows = sheet.rows;
    if (rows.length === 0) { parts.push('(空工作表)\n'); continue; }
    const width = Math.max(...rows.map((r) => r.length));
    const lines: string[] = [];
    lines.push('| ' + rows[0].concat(Array(width).fill('')).slice(0, width).map(escapeCell).join(' | ') + ' |');
    lines.push('|' + Array(width).fill(' --- ').join('|') + '|');
    for (const row of rows.slice(1)) {
      lines.push('| ' + row.concat(Array(width).fill('')).slice(0, width).map(escapeCell).join(' | ') + ' |');
    }
    parts.push(lines.join('\n') + '\n');
    if (sheet.truncated) parts.push(`\n[注意: 工作表 "${sheet.name}" 超过 ${MD_TABLE_MAX_ROWS} 行，已截断。]`);
  }
  return parts.join('\n');
}

/** PPTX → Markdown（标题占位符 → 二级标题，段落层级 → 缩进列表） */
async function pptxToMarkdown(b64: string): Promise<string> {
  const bytes = base64ToBytes(b64);
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)![1], 10) - parseInt(b.match(/slide(\d+)\.xml/)![1], 10));
  if (slideNames.length === 0) return '(未找到幻灯片)';
  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)!.async('string');
    const idx = parseInt(name.match(/slide(\d+)\.xml/)![1], 10);
    parts.push(`## Slide ${idx}\n`);
    const lines: string[] = [];
    const shapes = xml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) || [];
    for (const sp of shapes) {
      const isTitle = /<p:ph[^>]*type="(ctrTitle|title)"/.test(sp);
      const paras = sp.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
      for (const para of paras) {
        const lvl = Number(para.match(/<a:pPr[^>]*lvl="(\d+)"/)?.[1] || 0);
        const texts = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]).trim());
        const text = texts.filter(Boolean).join('');
        if (!text) continue;
        if (isTitle) lines.push(`### ${text}`);
        else lines.push(`${'  '.repeat(Math.min(lvl, 4))}- ${text}`);
      }
    }
    parts.push((lines.join('\n') || '(空幻灯片)') + '\n');
  }
  return parts.join('\n');
}

/** PDF → Markdown（分页文本，每页一节） */
async function pdfToMarkdown(b64: string): Promise<string> {
  const { totalPages, pages } = await extractPdfPages(b64);
  const parts = pages.map((t, i) => `## 第 ${i + 1} / ${totalPages} 页\n\n${t || '（本页无可提取文本，可能是扫描件/图片页）'}`);
  return parts.join('\n\n');
}

export class FileToMarkdownTool implements BuiltInTool {
  name = 'file_to_markdown';
  description = '将办公文档转换为 Markdown 文件并返回 .md 路径。支持 .docx（标题/段落/表格/列表）、.xlsx/.xls（每个工作表一个 Markdown 表格）、.pptx（按幻灯片分节）、.pdf（分页文本）。转换后先用 file_read 读取 .md 内容，再用 file_grep 定位。旧格式 .doc/.ppt/.rtf 不支持，请另存为新格式。output 可指定 .md 输出路径，默认写到源文件同目录同名 .md（覆盖）。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the office document to convert.',
      },
      output: {
        type: 'string',
        description: 'Optional output .md path. Defaults to the source directory with a .md extension.',
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
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const exists = await fs.exists(path);
    if (!exists) {
      return { content: [{ type: 'text', text: `Error: file not found: ${path}` }], isError: true };
    }
    if (LEGACY_EXTS.includes(ext)) {
      return { content: [{ type: 'text', text: `Error: 不支持旧格式 .${ext}，请另存为 .${ext === 'rtf' ? 'docx' : ext + 'x'} 后再转换。` }], isError: true };
    }
    if (!DOCX_EXTS.includes(ext) && !EXCEL_EXTS.includes(ext) && !PPTX_EXTS.includes(ext) && !PDF_EXTS.includes(ext)) {
      return { content: [{ type: 'text', text: `Error: 不支持的格式 .${ext}。支持 docx/xlsx/xls/pptx/pdf；纯文本类文件直接用 file_read 读取即可。` }], isError: true };
    }

    try {
      const b64 = await fs.readFileBase64(path);
      let md: string;
      if (DOCX_EXTS.includes(ext)) {
        md = htmlToMarkdown(await extractDocxHtml(b64));
      } else if (EXCEL_EXTS.includes(ext)) {
        md = await excelToMarkdown(b64);
      } else if (PPTX_EXTS.includes(ext)) {
        md = await pptxToMarkdown(b64);
      } else {
        md = await pdfToMarkdown(b64);
      }
      if (!md || !md.trim()) {
        return { content: [{ type: 'text', text: 'Error: 文档内容为空或无法提取（可能是扫描件）。' }], isError: true };
      }

      const dot = path.lastIndexOf('.');
      const outPath = (args.output as string) || (dot > 0 ? path.slice(0, dot) + '.md' : path + '.md');
      await fs.writeFile(outPath, md);
      return {
        content: [{ type: 'text', text: `Markdown 已生成: ${outPath}（${md.length} 字符，源: ${ext}）。接下来用 file_read 读取该文件。` }],
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error converting document: ${msg}` }], isError: true };
    }
  }
}
