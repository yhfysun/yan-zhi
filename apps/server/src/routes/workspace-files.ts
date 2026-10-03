// 本地（工作区/空间/产物）文件的**通用流式读取**端点。
//
// ★★★ 为什么必须有（2026-10-02 修「本地视频预览黑屏」）：
//   FilePreview 对视频/音频优先走 HTTP URL（blob: 媒体不支持 Range → 大码率视频黑屏），
//   但既有两条通道都只覆盖部分场景：
//     · /conversations/:id/file-stream —— 只认「登记进 conversation_file 的交付物」；
//     · /spaces/:id/resources/:dir/raw —— 只认 RESOURCE_DIR_NAMES 白名单目录、且只允许一层文件名。
//   用户在**工作区文件树**里点开任意嵌套目录（如 02-work/clip2/s_002.mp4）或未登记的
//   本地视频时，两条通道都拿不到 URL → 退回 Blob 兜底 → 高分辨率视频直接黑屏。
//
//   本端点按**绝对路径**流式读文件，允许范围用 path-guard 的「允许根」判：
//     全局工作目录 ∪ 用户的空间目录 ∪ 用户各会话的产物根/目录。
//   越界一律 403（防目录穿越/防读任意盘文件）；命中则 sendFile（原生 Range/206）。
//
// ★ 安全取向：只读（GET）、只允许 isFile、路径必须落在允许根内；
//   与 media 路由「单段文件名」的白名单口径相比，这里是**根级守卫**，
//   两者互补而不互代（媒体路由继续管它管得了的）。

import { Router, Request, Response } from 'express';
import { statSync } from 'node:fs';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { serverState } from '../state.js';
import { isWithinRoot, normalizeForCompare } from '../services/path-guard.js';
import { resolveArtifactDirFor } from '../services/artifact-dir.js';
import { resolveSpaceResourceRoot } from '../services/space-resources.js';

const router = Router();
router.use(authMiddleware);

/** 算出「本用户允许流式读取的根集合」（与 path-guard 的允许根同一套语义，禁止在调用方复刻）。 */
function allowedRootsForUser(userId: string): string[] {
  const roots: string[] = [];
  const gw = (serverState.workspaceDir || '').trim();
  if (gw) roots.push(gw);
  // 用户的空间目录（绑定的真实目录 + 未绑定的服务端内部空间目录都算）
  try {
    const spaces = db.prepare('SELECT id, dir_path FROM space WHERE user_id = ?').all(userId) as Array<{ id: string; dir_path: string | null }>;
    for (const s of spaces) {
      try { roots.push(resolveSpaceResourceRoot(s)); } catch { /* 忽略单个空间解析失败 */ }
    }
  } catch { /* 表不存在等极端情况 */ }
  // 用户各会话的产物根/目录（会话工作目录派生产物落在这里）
  try {
    const convs = db.prepare('SELECT id FROM conversation WHERE user_id = ?').all(userId) as Array<{ id: string }>;
    for (const c of convs) {
      for (const category of ['deliverable', 'intermediate', 'upload'] as const) {
        try {
          const r = resolveArtifactDirFor({ conversationId: c.id, category });
          if (r.root) roots.push(r.root);
          if (r.dir) roots.push(r.dir);
        } catch { /* 单个会话解析失败不阻断 */ }
      }
    }
  } catch { /* 忽略 */ }
  const deduped = new Set(
    roots
      .map((r) => normalizeForCompare(r.replace(/[\\/]+$/, '')))
      .filter(Boolean),
  );
  return [...deduped];
}

router.get('/file-stream', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const p = String(req.query.path || '').trim();
  if (!p || p.length > 1000) { res.status(400).json({ error: 'path 为必填项' }); return; }

  const norm = normalizeForCompare(p);
  const hit = allowedRootsForUser(userId).some((root) => root && isWithinRoot(norm, root));
  if (!hit) { res.status(403).json({ error: '路径不在允许范围内' }); return; }

  try {
    if (!statSync(p).isFile()) { res.status(404).json({ error: '文件不存在' }); return; }
  } catch {
    res.status(404).json({ error: '文件不存在' }); return;
  }
  // send 底层原生支持 Range/206/条件请求 —— <video>/<audio> 可边下边播、任意 seek
  res.sendFile(p);
});

export default router;
