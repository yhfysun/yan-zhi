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
import { isAllowedPathForUser } from '../services/allowed-roots.js';

const router = Router();
router.use(authMiddleware);

router.get('/file-stream', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const p = String(req.query.path || '').trim();
  if (!p || p.length > 1000) { res.status(400).json({ error: 'path 为必填项' }); return; }

  if (!isAllowedPathForUser(userId, p)) { res.status(403).json({ error: '路径不在允许范围内' }); return; }

  try {
    if (!statSync(p).isFile()) { res.status(404).json({ error: '文件不存在' }); return; }
  } catch {
    res.status(404).json({ error: '文件不存在' }); return;
  }
  // send 底层原生支持 Range/206/条件请求 —— <video>/<audio> 可边下边播、任意 seek
  res.sendFile(p);
});

export default router;
