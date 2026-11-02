// office_create / office_read —— 办公三件套的 AI 侧入口（2026-11-02）
//
// 与办公工作台共用同一套文件格式：AI 只是在上层发起「新建 / 读取」，
// 生成与解析仍由 Python（python-docx / openpyxl / python-pptx）完成。
// 工作台的人工侧走服务端 /api/office/*，路径与文件名规则保持一致。
import fs from 'node:fs';
import path from 'node:path';
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPythonScript, runPythonScript } from './python-runtime';
import { resolveToolPath } from './fs-walk';
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
