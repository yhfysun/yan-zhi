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

// ===== 目录递归列表（对话左侧资源管理器 / 文件搜索用）=====
// 返回 dir 下相对路径的扁平 entries，前端自行组树或按名过滤。
// 忽略常见非源码目录；限制总条数与深度，防止超大目录拖垮响应。
const TREE_IGNORED = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.gradle', 'target', 'coverage',
]);
const TREE_MAX_ENTRIES = 5000;
const TREE_MAX_DEPTH = 12;

router.get('/tree', (req, res) => {
  const dir = typeof req.query.dir === 'string' ? req.query.dir.trim() : '';
  if (!dir) return res.status(400).json({ error: '缺少 dir 参数' });
  let root: string;
  try {
    root = path.resolve(dir);
    const st = fs.statSync(root);
    if (!st.isDirectory()) return res.status(400).json({ error: '不是目录' });
  } catch {
    return res.status(404).json({ error: '目录不存在或不可访问' });
  }

  const entries: Array<{ name: string; relPath: string; isDir: boolean; size: number }> = [];
  let truncated = false;
  const walk = (abs: string, rel: string, depth: number) => {
    if (truncated || depth > TREE_MAX_DEPTH) return;
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
      if (entries.length >= TREE_MAX_ENTRIES) { truncated = true; return; }
      const childAbs = path.join(abs, d.name);
      const childRel = rel ? rel + '/' + d.name : d.name;
      const isDir = d.isDirectory();
      let size = 0;
      if (!isDir) {
        try { size = fs.statSync(childAbs).size; } catch { /* ignore */ }
      }
      entries.push({ name: d.name, relPath: childRel, isDir, size });
      if (isDir) walk(childAbs, childRel, depth + 1);
    }
  };
  walk(root, '', 1);

  res.json({ root, entries, truncated });
});

export default router;
