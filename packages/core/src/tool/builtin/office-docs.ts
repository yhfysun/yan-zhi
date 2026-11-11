// office_create / office_read —— 办公三件套的 AI 侧入口（2026-11-02）
//
// 与办公工作台共用同一套文件格式：AI 只是在上层发起「新建 / 读取」，
// 生成与解析仍由 Python（python-docx / openpyxl / python-pptx）完成。
// 工作台的人工侧走服务端 /api/office/*，路径与文件名规则保持一致。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPythonScript, runPythonScript } from './python-runtime';
import { resolveToolPath, walkFiles } from './fs-walk';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

const KIND_EXT = { doc: '.docx', sheet: '.xlsx', slides: '.pptx' } as const;
type OfficeKind = keyof typeof KIND_EXT;

function isKind(v: unknown): v is OfficeKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KIND_EXT, v);
}

function safeBaseName(raw: unknown): string {
  return String(raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

function availablePath(dir: string, base: string, ext: string): string {
  let candidate = path.join(dir, base + ext);
  let n = 2;
  while (fs.existsSync(candidate) && n < 100) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function lastJsonLine(stdout: string): any {
  const line = (stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
  return JSON.parse(line);
}

function scriptPath(): string | null {
  return getPythonScript('office/office_docs.py');
}

export class OfficeCreateTool implements BuiltInTool {
  name = 'office_create';
  description =
    '新建一份办公文档并落盘：doc=Word(.docx)、sheet=Excel(.xlsx)、slides=PPT(.pptx)。' +
    '返回创建后的绝对路径；之后可用 file_write / python_exec 填充内容，或用 office_read 查看。' +
    '默认建在当前工作目录，可用 dir 指定子目录（相对工作目录）。';

  inputSchema = {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['doc', 'sheet', 'slides'], description: '文档类型：doc/sheet/slides' },
      name: { type: 'string', description: '文件名（不含扩展名），如“第06期发布说明”' },
      dir: { type: 'string', description: '目标目录（相对工作目录，可省略=工作目录根）' },
    },
    required: ['kind', 'name'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const kind = args.kind;
    if (!isKind(kind)) return toolError('kind 必须是 doc / sheet / slides');
    const base = safeBaseName(args.name);
    if (!base) return toolError('name 不能为空');

    const ws = ctx?.workspaceDir;
    const dir = resolveToolPath(typeof args.dir === 'string' ? args.dir : '', ws);
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.statSync(dir).isDirectory()) return toolError('目标不是目录：' + dir);
    } catch (e) {
      return toolError(`无法创建目录 ${dir}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const script = scriptPath();
    if (!script) return toolError('办公文档脚本缺失（office/office_docs.py）');
    const out = availablePath(dir, base, KIND_EXT[kind]);
    try {
      const r = await runPythonScript(script, ['create', '--kind', kind, '--path', out, '--title', base], { timeout: 60000 });
      if (r.exitCode !== 0) {
        return toolError(`创建失败：${(r.stderr || r.stdout || '').slice(0, 400)}`);
      }
      return { content: [{ type: 'text', text: `已创建：${out}` }] };
    } catch (e) {
      return toolError(`创建异常：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export class OfficeReadTool implements BuiltInTool {
  name = 'office_read';
  description =
    '读取 Word / Excel / PPT 的结构化内容（标题、段落、表格、工作表、幻灯片文字），' +
    'Excel 会返回真实使用范围、列字母、首行值和单元格预览。预览截断不代表后面的列不存在；' +
    '需要确认远列时看列字母和首行值，或指定 sheet。纯文本文件请用 file_read。';

  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（绝对路径，或相对工作目录），支持 .docx/.xlsx/.pptx' },
      sheet: { type: 'string', description: 'Excel 工作表名（省略=读取全部工作表）' },
      maxRows: { type: 'number', description: 'Excel 每个工作表最多预览多少行（默认 40，上限 400）' },
      maxCols: { type: 'number', description: 'Excel 单元格预览最多显示多少列（默认 40，上限 200；完整列字母和表头另返回到 2048 列）' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const p = resolveToolPath(args.path, ctx?.workspaceDir);
    try {
      if (!fs.statSync(p).isFile()) return toolError('不是文件：' + p);
    } catch {
      return toolError('文件不存在：' + p);
    }
    const script = scriptPath();
    if (!script) return toolError('办公文档脚本缺失（office/office_docs.py）');
    try {
      const cliArgs = ['read', '--path', p];
      if (typeof args.sheet === 'string' && args.sheet.trim()) cliArgs.push('--sheet', args.sheet.trim());
      if (args.maxRows != null) cliArgs.push('--max-rows', String(args.maxRows));
      if (args.maxCols != null) cliArgs.push('--max-cols', String(args.maxCols));
      const r = await runPythonScript(script, cliArgs, { timeout: 60000 });
      if (r.exitCode !== 0) return toolError(`解析失败：${(r.stderr || r.stdout || '').slice(0, 400)}`);
      const parsed = lastJsonLine(r.stdout);
      if (parsed?.ok === false) return toolError(String(parsed.error || '解析失败'));
      return { content: [{ type: 'text', text: capToolOutput(formatContent(p, parsed?.data)) }] };
    } catch (e) {
      return toolError(`解析异常：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function excelColumnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function compactCell(value: unknown, max = 60): string {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function fullHeaderCell(value: unknown): string {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** 把 Python 的解析结果整理成模型易读的文本（控制行/列数量，避免超长） */
function formatContent(filePath: string, data: any): string {
  const kind = data?.kind;
  const lines: string[] = [`文件：${filePath}`];

  if (kind === 'doc') {
    for (const b of data.blocks || []) {
      if (b.type === 'heading') lines.push(`${'#'.repeat(Math.min(6, Math.max(1, Number(b.level) || 1)))} ${b.text}`);
      else if (b.type === 'paragraph') lines.push(b.text);
      else if (b.type === 'table') {
        const rows = (b.rows || []).slice(0, 30);
        rows.forEach((row: string[], i: number) => {
          lines.push('| ' + row.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          if (i === 0) lines.push('| ' + row.map(() => '---').join(' | ') + ' |');
        });
        if ((b.rows || []).length > rows.length) lines.push(`（表格共 ${b.rows.length} 行，已截断）`);
      }
    }
    return lines.join('\n');
  }

  if (kind === 'sheet') {
    for (const s of data.sheets || []) {
      lines.push('', `## 工作表：${s.name}`);
      const columns = Array.isArray(s.columns) ? s.columns : [];
      const maxColumn = Math.max(1, Number(s.maxColumn) || columns.length || 1);
      const maxRow = Math.max(1, Number(s.maxRow) || 1);
      const range = s.range || `A1:${excelColumnName(maxColumn - 1)}${maxRow}`;
      lines.push(`范围：${range}（${maxRow} 行 × ${maxColumn} 列）`);
      if (columns.length > 0) {
        const letters = columns.map((c: any) => String(c.letter || '')).filter(Boolean).join(' ');
        const headers = columns
          .map((c: any) => `${c.letter}=${fullHeaderCell(c.header) || '（空）'}`)
          .join(' | ');
        lines.push(`完整列字母：${letters}`);
        lines.push(`第 1 行（表头/首行数据，完整）：${headers}`);
        if (s.columnsTruncated) {
          lines.push('（列元数据只展开到前 2048 列；更靠后的列仍存在，请指定工作表处理。）');
        }
      }
      const rows = (s.rows || []).slice(0, 30);
      const previewCols = Math.max(
        0,
        Number(s.previewColumns) || 0,
        ...rows.map((row: unknown[]) => Array.isArray(row) ? row.length : 0),
      );
      if (previewCols > 0) {
        const previewLetters = Array.from({ length: previewCols }, (_, i) =>
          String(columns[i]?.letter || excelColumnName(i)));
        lines.push('', `| 行 | ${previewLetters.join(' | ')} |`);
        lines.push(`| --- | ${previewLetters.map(() => '---').join(' | ')} |`);
      }
      rows.forEach((row: Array<string | number>, i: number) => {
        const cells = Array.from({ length: previewCols }, (_, c) => compactCell(row[c]));
        lines.push(`| ${i + 1} | ${cells.join(' | ')} |`);
      });
      if ((s.rows || []).length > rows.length) lines.push(`（预览 ${rows.length} 行，工作表共 ${maxRow} 行）`);
      if (maxColumn > previewCols) {
        lines.push(
          `（单元格预览只显示 ${excelColumnName(0)}:${excelColumnName(previewCols - 1)}；` +
          `工作表实际到 ${excelColumnName(maxColumn - 1)}，后面的列并未缺失。）`,
        );
      }
    }
    return lines.join('\n');
  }

  if (kind === 'slides') {
    for (const s of data.slides || []) {
      lines.push('', `## 第 ${s.index} 页：${s.title || '（无标题）'}`);
      for (const t of s.texts || []) lines.push(t);
      if (s.notes) lines.push(`（备注）${s.notes}`);
    }
    return lines.join('\n');
  }

  return lines.concat('（暂不支持的内容类型）').join('\n');
}

// ============================================================================
// office_write —— 向已有文档追加 / 替换内容（2026-11-03，P1）
// 与 office_create/office_read 共用 office_docs.py：写回逻辑只在 Python 一处。
// ============================================================================
export class OfficeWriteTool implements BuiltInTool {
  name = 'office_write';
  description =
    '向已存在的 Word/Excel/PPT 追加或替换内容：docx 用 blocks（标题/段落/表格），' +
    'xlsx 用 rows（行数组，可指定 sheet），pptx 用 slides（append: [{title,texts}]；replace: [{index,title?,texts}]）。' +
    'mode=append 追加；mode=replace 按序号替换已有内容（docx 块序号 / xlsx 清空重写 / pptx 页序号）。' +
    'Excel 删除整列用 deleteColumns（如 "EV:FV"），用户已给出明确列范围时直接执行；' +
    '成功回执会返回工作表、删除范围、列数和删除后范围。纯文本文件请用 file_write / file_edit。';

  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目标文件路径（绝对路径或相对工作目录），须已存在' },
      mode: { type: 'string', enum: ['append', 'replace'], description: 'append=追加（默认），replace=替换' },
      blocks: {
        type: 'array',
        description: 'docx 内容块：[{type:"heading",level?,text}|{type:"paragraph",text}|{type:"table",rows:[[...]]}]',
        items: { type: 'object' },
      },
      rows: {
        type: 'array',
        description: 'xlsx 行数据：[[单元格,...],...]',
        items: { type: 'array' },
      },
      deleteColumns: {
        type: 'string',
        description: 'xlsx 删除整列，支持字母范围或单列，如 "EV:FV" / "EV"。与 rows 互斥；省略 sheet 时删除活动工作表。',
      },
      sheet: { type: 'string', description: 'xlsx 工作表名（省略=活动工作表）' },
      slides: {
        type: 'array',
        description: 'pptx：append=[{title,texts}]；replace=[{index,title?,texts}]',
        items: { type: 'object' },
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const p = resolveToolPath(args.path, ctx?.workspaceDir);
    if (!p) return toolError('path 不能为空');
    const ext = path.extname(p).toLowerCase();
    if (!['.docx', '.xlsx', '.xlsm', '.pptx'].includes(ext)) {
      return toolError('仅支持 .docx / .xlsx / .pptx');
    }
    try {
      if (!fs.statSync(p).isFile()) return toolError('不是文件：' + p);
    } catch {
      return toolError('文件不存在：' + p);
    }

    const deleteColumns = typeof args.deleteColumns === 'string' ? args.deleteColumns.trim() : '';
    const mode = args.mode === 'replace' ? 'replace' : 'append';
    const payload: Record<string, unknown> = {};
    if (typeof args.sheet === 'string' && args.sheet.trim()) payload.sheet = args.sheet.trim();
    if (deleteColumns) {
      if (!['.xlsx', '.xlsm'].includes(ext)) return toolError('deleteColumns 仅支持 .xlsx / .xlsm');
      if (Array.isArray(args.blocks) || Array.isArray(args.rows) || Array.isArray(args.slides)) {
        return toolError('deleteColumns 不能与 blocks / rows / slides 同时使用');
      }
      payload.deleteColumns = deleteColumns;
    } else {
      if (Array.isArray(args.blocks)) payload.blocks = args.blocks;
      if (Array.isArray(args.rows)) payload.rows = args.rows;
      if (Array.isArray(args.slides)) payload.slides = args.slides;
      if (!payload.blocks && !payload.rows && !payload.slides) {
        return toolError('需要提供 blocks（docx）/ rows（xlsx）/ slides（pptx）之一，Excel 删除整列请传 deleteColumns');
      }
    }

    const script = scriptPath();
    if (!script) return toolError('办公文档脚本缺失（office/office_docs.py）');
    const tmpJson = path.join(os.tmpdir(), `yz_office_write_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    try {
      fs.writeFileSync(tmpJson, JSON.stringify(payload), 'utf8');
      if (deleteColumns) {
        const r = await runPythonScript(
          script,
          ['delete-columns', '--path', p, '--json-file', tmpJson],
          { timeout: 60000 },
        );
        if (r.exitCode !== 0) return toolError(`删除列失败：${(r.stderr || r.stdout || '').slice(0, 400)}`);
        const parsed = lastJsonLine(r.stdout);
        if (parsed?.ok === false) return toolError(String(parsed.error || '删除列失败'));
        const result = parsed?.result || {};
        const verified = result.verified === true ? '已回读确认' : '已保存，但回读范围与预期不一致，请打开文件核对';
        return {
          content: [{
            type: 'text',
            text:
              `已删除工作表「${result.sheet}」的 ${result.deletedRange} 列，共 ${result.deletedColumns} 列；` +
              `删除前范围 ${result.beforeRange}，删除后 ${result.afterRange}（${verified}）。`,
          }],
        };
      }
      const r = await runPythonScript(script, ['write', '--path', p, '--json-file', tmpJson, '--mode', mode], { timeout: 60000 });
      if (r.exitCode !== 0) return toolError(`写入失败：${(r.stderr || r.stdout || '').slice(0, 400)}`);
      const parsed = lastJsonLine(r.stdout);
      if (parsed?.ok === false) return toolError(String(parsed.error || '写入失败'));
      return { content: [{ type: 'text', text: `已写入：${p}（mode=${mode}）` }] };
    } catch (e) {
      return toolError(`写入异常：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      try { fs.rmSync(tmpJson, { force: true }); } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// office_search —— 工作区按文件名 / 内容搜索（与办公工作台搜索同一口径）
// 复用 fs-walk 的目录遍历（跳过 node_modules/.git/dist 等噪声目录），三端可用。
// ============================================================================
const SEARCH_MAX_FILE_SIZE = 2 * 1024 * 1024;

export class OfficeSearchTool implements BuiltInTool {
  name = 'office_search';
  description =
    '在工作区按文件名或内容搜索（与办公工作台同一口径），返回文件路径与命中行预览。' +
    'query 匹配文件名或正文；可用 include 过滤扩展名（如 "*.docx,*.md"）；默认搜索当前工作目录。';

  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键字（文件名或内容，大小写不敏感）' },
      path: { type: 'string', description: '搜索根目录（绝对路径或相对工作目录，默认=工作目录）' },
      include: { type: 'string', description: '扩展名过滤，逗号分隔，如 "*.docx,*.xlsx" 或 "docx,xlsx"' },
      maxResults: { type: 'number', description: '最多返回多少条（默认 60，上限 300）' },
    },
    required: ['query'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const query = String(args.query || '').trim();
    if (!query) return toolError('query 不能为空');
    const root = resolveToolPath(typeof args.path === 'string' ? args.path : '', ctx?.workspaceDir);
    if (!root) return toolError('未设置工作目录，请提供 path');

    const include = typeof args.include === 'string' && args.include.trim()
      ? args.include.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const maxResults = Math.min(Math.max(Math.floor(Number(args.maxResults) || 60), 1), 300);

    const exists = await fs.exists(root).catch(() => false);
    if (!exists) return toolError('路径不存在：' + root);

    let isDir = false;
    if (fs.stat) {
      try { isDir = (await fs.stat(root)).isDir; } catch { isDir = false; }
    } else {
      isDir = await fs.readDir(root).then(() => true).catch(() => false);
    }
    const files = isDir ? await walkFiles(fs, root, { globFilter: include }) : [root];

    const lower = query.toLowerCase();
    const hits: Array<{ file: string; line: number; preview: string }> = [];
    let truncated = false;
    for (const file of files) {
      if (hits.length >= maxResults) { truncated = true; break; }
      const nameHit = path.basename(file).toLowerCase().includes(lower);
      let content: string;
      try {
        content = await fs.readFile(file);
      } catch {
        if (nameHit) hits.push({ file, line: 0, preview: '（文件名匹配）' });
        continue;
      }
      if (content.includes('\0') || content.length > SEARCH_MAX_FILE_SIZE) {
        if (nameHit) hits.push({ file, line: 0, preview: '（文件名匹配）' });
        continue;
      }
      if (nameHit) hits.push({ file, line: 0, preview: '（文件名匹配）' });
      if (hits.length >= maxResults) { truncated = true; break; }
      const lines = content.replace(/\r\n/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].toLowerCase().includes(lower)) continue;
        hits.push({ file, line: i + 1, preview: lines[i].trim().slice(0, 200) });
        if (hits.length >= maxResults) { truncated = true; break; }
      }
    }

    if (hits.length === 0) return { content: [{ type: 'text', text: `未找到与「${query}」匹配的文件或内容（搜索根：${root}）` }] };
    const out = hits.map((h) => (h.line > 0 ? `${h.file}:${h.line}: ${h.preview}` : `${h.file} ${h.preview}`)).join('\n');
    const tail = truncated ? `\n\n[已截断到 ${maxResults} 条，请缩小范围或提高 maxResults]` : '';
    return { content: [{ type: 'text', text: capToolOutput(out + tail) }] };
  }
}
