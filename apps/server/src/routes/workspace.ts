import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { serverState } from '../state.js';

const router = Router();

// UI 选定工作目录后推送到 server，作为 cmd_exec / 目录工具 的默认 cwd 兜底
router.post('/dir', (req, res) => {
  const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : '';
  serverState.workspaceDir = dir;
  res.json({ ok: true, workspaceDir: dir });
});

router.get('/dir', (_req, res) => {
  res.json({ workspaceDir: serverState.workspaceDir });
});

// ===== 目录列表（对话左侧资源管理器 / 文件搜索用）=====
// 两种模式：
//  - recursive=1（默认）：返回 dir 下相对路径的扁平 entries（DFS 全量递归），分页供兼容旧调用
//  - recursive=0：仅列出 sub（相对 dir 的子目录路径，''=根）的【直接子项】，前端按需逐级懒加载
// 忽略常见非源码目录；深度限制防超大目录拖垮响应；offset/limit 分页。
const TREE_IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.gradle', 'target', 'coverage',
]);
const TREE_PAGE_MAX = 5000;
const TREE_MAX_DEPTH = 12;

router.get('/tree', (req, res) => {
  const dir = typeof req.query.dir === 'string' ? req.query.dir.trim() : '';
  if (!dir) return res.status(400).json({ error: '缺少 dir 参数' });
  const sub = String(req.query.sub ?? '').trim();
  const recursive = String(req.query.recursive ?? '1') !== '0';
  const offset = Math.max(0, parseInt(String(req.query.offset ?? ''), 10) || 0);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || TREE_PAGE_MAX, 1), TREE_PAGE_MAX);
  let root: string;
  try {
    root = path.resolve(dir);
    const st = fs.statSync(root);
    if (!st.isDirectory()) return res.status(400).json({ error: '不是目录' });
  } catch {
    return res.status(404).json({ error: '目录不存在或不可访问' });
  }

  // 非递归：仅列 sub 目录的直接子项（逐级懒加载）
  if (!recursive) {
    let target = root;
    if (sub) {
      target = path.resolve(root, sub);
      // 防目录穿越：必须仍在 root 内
      if (target !== root && !target.startsWith(root + path.sep)) {
        return res.status(400).json({ error: 'sub 超出根目录范围' });
      }
    }
    let dirents: fs.Dirent[] = [];
    try {
      dirents = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return res.json({ root, parent: sub, entries: [], hasMore: false });
    }
    dirents = dirents
      .filter((d) => !TREE_IGNORED.has(d.name))
      .sort((a, b) =>
        (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name),
      );
    const entries: Array<{ name: string; relPath: string; isDir: boolean; size: number }> = [];
    let hasMore = false;
    for (let i = offset; i < dirents.length; i++) {
      if (entries.length >= limit) { hasMore = true; break; }
      const d = dirents[i];
      const childAbs = path.join(target, d.name);
      const childRel = sub ? sub + '/' + d.name : d.name;
      const isDir = d.isDirectory();
      let size = 0;
      if (!isDir) {
        try { size = fs.statSync(childAbs).size; } catch { /* ignore */ }
      }
      entries.push({ name: d.name, relPath: childRel, isDir, size });
    }
    return res.json({ root, parent: sub, entries, hasMore });
  }

  // 递归：扁平 entries（兼容旧调用 / 全量搜索）
  const entries: Array<{ name: string; relPath: string; isDir: boolean; size: number }> = [];
  let skipped = 0;
  let hasMore = false;
  const walk = (abs: string, rel: string, depth: number) => {
    if (hasMore || depth > TREE_MAX_DEPTH) return;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // 无权限等：跳过该目录
    }
    dirents = dirents
      .filter((d) => !TREE_IGNORED.has(d.name))
      .sort((a, b) =>
        (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name),
      );
    for (const d of dirents) {
      const childAbs = path.join(abs, d.name);
      const childRel = rel ? rel + '/' + d.name : d.name;
      const isDir = d.isDirectory();
      if (skipped < offset) {
        // 跳过阶段目录仍要下钻，保证跨页 DFS 顺序一致
        skipped++;
        if (isDir) walk(childAbs, childRel, depth + 1);
        continue;
      }
      if (entries.length >= limit) { hasMore = true; return; }
      let size = 0;
      if (!isDir) {
        try { size = fs.statSync(childAbs).size; } catch { /* ignore */ }
      }
      entries.push({ name: d.name, relPath: childRel, isDir, size });
      if (isDir) walk(childAbs, childRel, depth + 1);
    }
  };
  walk(root, '', 1);

  res.json({ root, entries, hasMore });
});

// ============================================================================
// 代码模式（IDE）文件面：读/写/新建/重命名/删除/内容搜索/在资源管理器中显示
// 与 /tree 共用 TREE_IGNORED；路径必须绝对路径，目录操作同样防穿越。
// ============================================================================

/** 把入参解析为绝对路径；空串 → 400 */
function toAbs(p: unknown): string | null {
  if (typeof p !== 'string' || !p.trim()) return null;
  return path.resolve(p.trim());
}

/** 单文件二进制探测：读前 8KB，出现 NUL 即视为二进制 */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'properties', 'env', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'jsx',
  'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte', 'py', 'pyw', 'java', 'kt', 'kts', 'go', 'rs',
  'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'rb', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'sql', 'gradle', 'gitignore', 'dockerfile', 'makefile', 'lua', 'r', 'scala', 'swift', 'dart',
]);

/** 根据扩展名判断是否为文本文件（未知扩展名回退二进制探测） */
function isTextFile(filePath: string, buf: Buffer): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (TEXT_EXT.has(ext)) return !looksBinary(buf);
  return !looksBinary(buf);
}

// GET /api/workspace/file?path=xxx —— 读取文本文件内容
router.get('/file', (req, res) => {
  const abs = toAbs(req.query.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) return res.status(400).json({ error: '目标是目录，不是文件' });
    if (st.size > 8 * 1024 * 1024) return res.status(413).json({ error: '文件超过 8MB，代码编辑器暂不支持打开' });
    const buf = fs.readFileSync(abs);
    if (!isTextFile(abs, buf)) return res.status(415).json({ error: '二进制文件，无法在编辑器中打开' });
    res.json({ path: abs, name: path.basename(abs), content: buf.toString('utf8'), size: st.size, mtime: st.mtimeMs });
  } catch (err) {
    res.status(404).json({ error: `读取失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// PUT /api/workspace/file  { path, content } —— 写回文件（自动按原换行风格）
router.put('/file', (req, res) => {
  const abs = toAbs(req.body?.path);
  const content = req.body?.content;
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content 必须是字符串' });
  try {
    fs.writeFileSync(abs, content, 'utf8');
    res.json({ ok: true, path: abs, size: Buffer.byteLength(content, 'utf8'), mtime: fs.statSync(abs).mtimeMs });
  } catch (err) {
    res.status(500).json({ error: `保存失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/workspace/mkdir  { path } —— 新建目录（含父级）
router.post('/mkdir', (req, res) => {
  const abs = toAbs(req.body?.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  try {
    fs.mkdirSync(abs, { recursive: true });
    res.json({ ok: true, path: abs });
  } catch (err) {
    res.status(500).json({ error: `创建失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/workspace/create  { path, isDir? } —— 新建空文件 / 目录
router.post('/create', (req, res) => {
  const abs = toAbs(req.body?.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  const isDir = req.body?.isDir === true;
  try {
    if (fs.existsSync(abs)) return res.status(409).json({ error: '目标已存在' });
    if (isDir) fs.mkdirSync(abs, { recursive: true });
    else {
      const parent = path.dirname(abs);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(abs, '', 'utf8');
    }
    res.json({ ok: true, path: abs, isDir });
  } catch (err) {
    res.status(500).json({ error: `创建失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/workspace/rename  { from, to } —— 重命名 / 移动
router.post('/rename', (req, res) => {
  const from = toAbs(req.body?.from);
  const to = toAbs(req.body?.to);
  if (!from || !to) return res.status(400).json({ error: '缺少 from / to 参数' });
  if (from === to) return res.json({ ok: true, path: to });
  if (fs.existsSync(to)) return res.status(409).json({ error: '目标已存在' });
  try {
    fs.renameSync(from, to);
    res.json({ ok: true, path: to });
  } catch (err) {
    res.status(500).json({ error: `重命名失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/workspace/delete  { path } —— 删除文件 / 递归删除目录
router.post('/delete', (req, res) => {
  const abs = toAbs(req.body?.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  if (abs === path.parse(abs).root) return res.status(400).json({ error: '拒绝删除磁盘根目录' });
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true, path: abs });
  } catch (err) {
    res.status(500).json({ error: `删除失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/workspace/reveal  { path } —— 在系统文件管理器中显示（Windows  explorer /select,）
router.post('/reveal', (req, res) => {
  const abs = toAbs(req.body?.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  try {
    if (process.platform === 'win32') spawn('explorer.exe', ['/select,', abs], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', ['-R', abs], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [path.dirname(abs)], { detached: true, stdio: 'ignore' }).unref();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `打开失败：${err instanceof Error ? err.message : String(err)}` });
  }
});

// ===== 文件内容搜索（IDE 左栏搜索面板）=====
// GET /api/workspace/search?dir=&q=&include=&caseSensitive=0&wholeWord=0&regex=0&maxResults=500
// 逐目录 DFS，跳过 TREE_IGNORED 与二进制，单文件上限 2MB，命中行截断到 220 字符。
const SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024;
const SEARCH_MAX_DEPTH = 14;

interface SearchHit { file: string; relPath: string; line: number; column: number; preview: string }

router.get('/search', (req, res) => {
  const dir = typeof req.query.dir === 'string' ? req.query.dir.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!dir) return res.status(400).json({ error: '缺少 dir 参数' });
  if (!q) return res.json({ root: path.resolve(dir), hits: [], truncated: false, scanned: 0 });

  let root: string;
  try {
    root = path.resolve(dir);
    if (!fs.statSync(root).isDirectory()) return res.status(400).json({ error: '不是目录' });
  } catch {
    return res.status(404).json({ error: '目录不存在或不可访问' });
  }

  const include = typeof req.query.include === 'string' && req.query.include.trim() ? req.query.include.trim() : '';
  const caseSensitive = String(req.query.caseSensitive ?? '') === '1';
  const wholeWord = String(req.query.wholeWord ?? '') === '1';
  const useRegex = String(req.query.regex ?? '') === '1';
  const maxResults = Math.min(Math.max(parseInt(String(req.query.maxResults ?? ''), 10) || 500, 1), 5000);

  // 匹配器：正则模式先编译，失败直接回 400（避免静默搜不到）
  let matcher: RegExp;
  try {
    if (useRegex) matcher = new RegExp(q, caseSensitive ? '' : 'i');
    else {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matcher = new RegExp(`${wholeWord ? '\\b' : ''}${escaped}${wholeWord ? '\\b' : ''}`, caseSensitive ? '' : 'gi');
    }
  } catch (err) {
    return res.status(400).json({ error: `搜索表达式无效：${err instanceof Error ? err.message : String(err)}` });
  }
  // include 支持逗号分隔的 glob-ish 后缀过滤，如 "*.ts,*.vue" 或 "ts,vue"
  const includeExts = include
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, ''))
    .filter(Boolean);

  const hits: SearchHit[] = [];
  let truncated = false;
  let scanned = 0;

  const walk = (abs: string, rel: string, depth: number) => {
    if (truncated || depth > SEARCH_MAX_DEPTH) return;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (truncated) return;
      if (TREE_IGNORED.has(d.name)) continue;
      const childAbs = path.join(abs, d.name);
      const childRel = rel ? rel + '/' + d.name : d.name;
      if (d.isDirectory()) { walk(childAbs, childRel, depth + 1); continue; }
      if (includeExts.length && !includeExts.includes(path.extname(d.name).slice(1).toLowerCase())) continue;
      let size = 0;
      try { size = fs.statSync(childAbs).size; } catch { continue; }
      if (size === 0 || size > SEARCH_MAX_FILE_BYTES) continue;
      let buf: Buffer;
      try { buf = fs.readFileSync(childAbs); } catch { continue; }
      if (looksBinary(buf)) continue;
      scanned++;
      const text = buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        matcher.lastIndex = 0;
        const m = matcher.exec(lines[i]);
        if (!m) continue;
        hits.push({
          file: childAbs,
          relPath: childRel,
          line: i + 1,
          column: m.index + 1,
          preview: lines[i].trim().slice(0, 220),
        });
        if (!useRegex && !wholeWord) matcher.lastIndex = 0;
        if (hits.length >= maxResults) { truncated = true; return; }
      }
    }
  };
  walk(root, '', 1);

  res.json({ root, query: q, hits, truncated, scanned });
});

// GET /api/workspace/stat?path= —— 单条路径的存在性/类型（前端校验用）
router.get('/stat', (req, res) => {
  const abs = toAbs(req.query.path);
  if (!abs) return res.status(400).json({ error: '缺少 path 参数' });
  try {
    const st = fs.statSync(abs);
    res.json({ path: abs, exists: true, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
  } catch {
    res.json({ path: abs, exists: false, isDir: false, size: 0, mtime: 0 });
  }
});

export default router;
