import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
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

export default router;
