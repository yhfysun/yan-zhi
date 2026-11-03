// 办公三件套（docx / xlsx / pptx）统一文件接口（2026-11-02，P2）。
//
// 为什么放在服务端：生成/解析都依赖 Python 的 python-docx / openpyxl / python-pptx
// （已预烤进随包解释器）。AI 与人工操作共用这一套接口 —— AI 只是在更上层发起同样的请求。
//
// 安全：所有路径必须落在「本用户允许的根」内（allowed-roots 与 workspace/file-stream 同源），
//      新建文件名做字符清洗，不允许带路径分隔符。
//
// 端点：
//   POST /api/office/create  { dir, name, kind: 'doc'|'sheet'|'slides' } → { data: { path } }
//   GET  /api/office/content?path=...                                   → { data: 结构化内容 }
//   GET  /api/office/export?path=...                                    → 文件流（下载）
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authMiddleware } from '../auth.js';
import { getPythonScript, runPythonScript } from '@yan-zhi/core';
import { isAllowedPathForUser } from '../services/allowed-roots.js';
import { serverState } from '../state.js';

const router = Router();
router.use(authMiddleware);

const KIND_EXT = { doc: '.docx', sheet: '.xlsx', slides: '.pptx' } as const;
type OfficeKind = keyof typeof KIND_EXT;
const READABLE_EXT = new Set(['.docx', '.xlsx', '.xlsm', '.pptx']);

function isOfficeKind(v: unknown): v is OfficeKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KIND_EXT, v);
}

/** 文件名清洗：去掉路径分隔符与 Windows 非法字符，避免穿越与创建失败 */
function safeBaseName(raw: string): string {
  return String(raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

function lastJsonLine(stdout: string): any {
  const line = (stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
  return JSON.parse(line);
}

/** 同名时生成「名称 (2).ext」而不覆盖既有文件 */
function availablePath(dir: string, base: string, ext: string): string {
  let candidate = path.join(dir, base + ext);
  let n = 2;
  while (fs.existsSync(candidate) && n < 100) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

/** 模板目录：<工作区>/.office-templates —— 按 kind 找 default.<ext> / <kind>.<ext> 或用户指定名 */
function resolveTemplate(kind: OfficeKind, requested: string): string | null {
  const ws = (serverState.workspaceDir || '').trim();
  if (!ws) return null;
  const dir = path.join(ws, '.office-templates');
  if (!fs.existsSync(dir)) return null;
  const ext = KIND_EXT[kind];
  const candidates: string[] = [];
  if (requested) {
    const b = safeBaseName(requested);
    if (b) candidates.push(path.join(dir, /\.[a-z0-9]+$/i.test(b) ? b : b + ext));
  }
  candidates.push(path.join(dir, `default${ext}`));
  candidates.push(path.join(dir, `${kind}${ext}`));
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* ignore */ }
  }
  return null;
}

router.post('/create', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { dir, name, kind } = (req.body || {}) as { dir?: string; name?: string; kind?: string };
  if (!dir || !isOfficeKind(kind)) { res.status(400).json({ error: 'dir 与 kind（doc/sheet/slides）为必填项' }); return; }
  if (!isAllowedPathForUser(userId, dir)) { res.status(403).json({ error: '目录不在允许范围内' }); return; }
  let isDir = false;
  try { isDir = fs.statSync(dir).isDirectory(); } catch { isDir = false; }
  if (!isDir) { res.status(404).json({ error: '目录不存在' }); return; }

  const base = safeBaseName(name || '未命名');
  if (!base) { res.status(400).json({ error: '名称无效' }); return; }
  const ext = KIND_EXT[kind];
  const out = availablePath(dir, base, ext);
  if (!isAllowedPathForUser(userId, out)) { res.status(403).json({ error: '目标路径不在允许范围内' }); return; }

  // 模板优先：<工作区>/.office-templates 里有对应模板就复制，否则回落空白文档
  const requested = typeof req.body?.template === 'string' ? req.body.template : '';
  const templatePath = resolveTemplate(kind, requested);
  if (templatePath) {
    try {
      fs.copyFileSync(templatePath, out);
      res.json({ data: { path: out, name: path.basename(out), template: path.basename(templatePath) } });
      return;
    } catch { /* 模板复制失败 → 继续走空白文档 */ }
  }

  const script = getPythonScript('office/office_docs.py');
  if (!script) { res.status(501).json({ error: '办公文档脚本缺失（office/office_docs.py）' }); return; }

  try {
    const r = await runPythonScript(script, ['create', '--kind', kind, '--path', out, '--title', base], { timeout: 60000 });
    if (r.exitCode !== 0) {
      const msg = (r.stderr || r.stdout || '').slice(0, 500);
      res.status(500).json({ error: `创建失败：${msg}` }); return;
    }
    res.json({ data: { path: out, name: path.basename(out) } });
  } catch (e: unknown) {
    res.status(500).json({ error: `创建异常：${e instanceof Error ? e.message : String(e)}` });
  }
});

router.get('/content', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const p = String(req.query.path || '').trim();
  if (!p || p.length > 1000) { res.status(400).json({ error: 'path 为必填项' }); return; }
  if (!isAllowedPathForUser(userId, p)) { res.status(403).json({ error: '路径不在允许范围内' }); return; }
  const ext = path.extname(p).toLowerCase();
  if (!READABLE_EXT.has(ext)) { res.status(400).json({ error: `不支持的格式：${ext || '未知'}` }); return; }
  try {
    if (!fs.statSync(p).isFile()) { res.status(404).json({ error: '文件不存在' }); return; }
  } catch {
    res.status(404).json({ error: '文件不存在' }); return;
  }

  const script = getPythonScript('office/office_docs.py');
  if (!script) { res.status(501).json({ error: '办公文档脚本缺失（office/office_docs.py）' }); return; }
  try {
    const r = await runPythonScript(script, ['read', '--path', p], { timeout: 60000 });
    if (r.exitCode !== 0) {
      const msg = (r.stderr || r.stdout || '').slice(0, 500);
      res.status(500).json({ error: `解析失败：${msg}` }); return;
    }
    const parsed = lastJsonLine(r.stdout);
    if (parsed?.ok === false) { res.status(500).json({ error: parsed.error || '解析失败' }); return; }
    res.json({ data: parsed.data });
  } catch (e: unknown) {
    res.status(500).json({ error: `解析异常：${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/office/save
//   pptx: { path, slides: [{ index, shapes: [{ shape, text }] }] } —— 只改指定形状的文本
//   docx: { path, blocks: [{ type:'heading'|'paragraph', text } | { type:'table', rows }] }
//         按块序号回写标题/段落/表格，保留段落样式与版式
router.post('/save', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { path: p, slides, blocks } = (req.body || {}) as { path?: string; slides?: unknown; blocks?: unknown };
  if (!p) { res.status(400).json({ error: 'path 为必填项' }); return; }
  if (!isAllowedPathForUser(userId, p)) { res.status(403).json({ error: '路径不在允许范围内' }); return; }
  const ext = path.extname(p).toLowerCase();
  if (ext !== '.pptx' && ext !== '.docx') { res.status(400).json({ error: '目前仅支持写回 .docx / .pptx' }); return; }
  if (ext === '.pptx' && !Array.isArray(slides)) { res.status(400).json({ error: 'pptx 保存需要 slides' }); return; }
  if (ext === '.docx' && !Array.isArray(blocks)) { res.status(400).json({ error: 'docx 保存需要 blocks' }); return; }
  try {
    if (!fs.statSync(p).isFile()) { res.status(404).json({ error: '文件不存在' }); return; }
  } catch {
    res.status(404).json({ error: '文件不存在' }); return;
  }

  const script = getPythonScript('office/office_docs.py');
  if (!script) { res.status(501).json({ error: '办公文档脚本缺失（office/office_docs.py）' }); return; }
  const tmpJson = path.join(os.tmpdir(), `yz_office_save_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    fs.writeFileSync(tmpJson, JSON.stringify(ext === '.pptx' ? { slides } : { blocks }), 'utf8');
    const r = await runPythonScript(script, ['save', '--path', p, '--json-file', tmpJson], { timeout: 60000 });
    if (r.exitCode !== 0) {
      const msg = (r.stderr || r.stdout || '').slice(0, 500);
      res.status(500).json({ error: `保存失败：${msg}` }); return;
    }
    res.json({ data: { path: p } });
  } catch (e: unknown) {
    res.status(500).json({ error: `保存异常：${e instanceof Error ? e.message : String(e)}` });
  } finally {
    try { fs.rmSync(tmpJson, { force: true }); } catch { /* ignore */ }
  }
});

router.get('/export', (req: Request, res: Response) => {  const userId = req.user!.userId;
  const p = String(req.query.path || '').trim();
  if (!p || p.length > 1000) { res.status(400).json({ error: 'path 为必填项' }); return; }
  if (!isAllowedPathForUser(userId, p)) { res.status(403).json({ error: '路径不在允许范围内' }); return; }
  try {
    if (!fs.statSync(p).isFile()) { res.status(404).json({ error: '文件不存在' }); return; }
  } catch {
    res.status(404).json({ error: '文件不存在' }); return;
  }
  res.download(p, path.basename(p));
});

export default router;
