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
    '返回可直接阅读的文本摘要。适合先看清结构再决定怎么改；纯文本文件请用 file_read。';

  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（绝对路径，或相对工作目录），支持 .docx/.xlsx/.pptx' },
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
      const r = await runPythonScript(script, ['read', '--path', p], { timeout: 60000 });
      if (r.exitCode !== 0) return toolError(`解析失败：${(r.stderr || r.stdout || '').slice(0, 400)}`);
      const parsed = lastJsonLine(r.stdout);
      if (parsed?.ok === false) return toolError(String(parsed.error || '解析失败'));
      return { content: [{ type: 'text', text: capToolOutput(formatContent(p, parsed?.data)) }] };
    } catch (e) {
      return toolError(`解析异常：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** 把 Python 的解析结果整理成模型易读的文本（控制行/列数量，避免超长） */function formatContent(filePath: string, data: any): string {
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
      const rows = (s.rows || []).slice(0, 30);
      rows.forEach((row: Array<string | number>, i: number) => {
        lines.push('| ' + row.slice(0, 12).map((c) => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
        if (i === 0) lines.push('| ' + row.slice(0, 12).map(() => '---').join(' | ') + ' |');
      });
      if ((s.rows || []).length > rows.length) lines.push(`（共 ${s.rows.length} 行，已截断）`);
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
    '写前建议先用 office_read 看清结构；纯文本文件请用 file_write / file_edit。';

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

    const mode = args.mode === 'replace' ? 'replace' : 'append';
    const payload: Record<string, unknown> = {};
    if (Array.isArray(args.blocks)) payload.blocks = args.blocks;
    if (Array.isArray(args.rows)) payload.rows = args.rows;
    if (Array.isArray(args.slides)) payload.slides = args.slides;
    if (typeof args.sheet === 'string' && args.sheet.trim()) payload.sheet = args.sheet.trim();
    if (Object.keys(payload).length === 0) {
      return toolError('需要提供 blocks（docx）/ rows（xlsx）/ slides（pptx）之一');
    }

    const script = scriptPath();
    if (!script) return toolError('办公文档脚本缺失（office/office_docs.py）');
    const tmpJson = path.join(os.tmpdir(), `yz_office_write_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    try {
      fs.writeFileSync(tmpJson, JSON.stringify(payload), 'utf8');
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
