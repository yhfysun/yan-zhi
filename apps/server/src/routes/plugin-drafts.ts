// 插件草稿 API（P2）：创建/列表/详情/删除/审核通过
//
// ★ 审核通过 = 从 plugins/drafts 移动到 plugins/installed 并注册（物理隔离，不是标志位）。
// ★ approve 要求确认串 `approve <id>`：审核按钮生成，agent 工具面不提供该动作。
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pathToFileURL } from 'node:url';
import { getPluginManager } from '@yan-zhi/core';
import { createDraft, listDrafts, getDraft, deleteDraft, approveDraft } from '../services/plugin-drafts.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.json({ data: await listDrafts() });
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const meta = await createDraft({
      manifest: req.body?.manifest,
      files: req.body?.files,
      source: String(req.body?.source || 'agent'),
    });
    res.json({ data: meta, note: '草稿写在隔离目录，不会运行；需在插件管理页人工审核通过后启用' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const draft = await getDraft(req.params.id);
  if (!draft) { res.status(404).json({ error: 'draft-not-found' }); return; }
  res.json({ data: draft });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const ok = await deleteDraft(req.params.id);
  if (!ok) { res.status(404).json({ error: 'draft-not-found' }); return; }
  res.json({ data: { ok: true } });
});

router.post('/:id/approve', async (req: Request, res: Response) => {
  const approved = await approveDraft(req.params.id, String(req.body?.confirmation || ''));
  if (!approved.ok) { res.status(400).json({ error: approved.error }); return; }
  try {
    const mgr = getPluginManager();
    await mgr.registerInstalled(approved.manifest as never, pathToFileURL(approved.entryPath).href);
    await mgr.enable(approved.pluginId);
    res.json({ data: { pluginId: approved.pluginId } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
