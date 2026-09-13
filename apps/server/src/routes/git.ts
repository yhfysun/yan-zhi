import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { gitService } from '../services/git.js';
import { getPlatformAdapter } from '@yan-zhi/core';

const router = Router();
router.use(authMiddleware);

// 能力检测（始终可用，前端据此判断是否显示 Git 功能）
router.get('/capability', (_req: Request, res: Response) => {
  const adapter = getPlatformAdapter();
  res.json({ data: { supported: !!adapter.shell, platform: adapter.platform } });
});

// ===== 面板缓存：落在仓库内 .yan-zhi/git-cache.json（隐藏目录，应用独有）=====
// 纯文件读写，不依赖 shell，故放在 501 门禁之前
router.get('/cache', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.readCache(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/cache', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { repo?: string; data?: Record<string, unknown>; ui?: Record<string, unknown> };
    await gitService.writeCache(String(body.repo || ''), { data: body.data || {}, ui: body.ui || {} });
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.delete('/cache', async (req: Request, res: Response) => {
  try {
    await gitService.clearCache(String(req.query.repo || ''));
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 以下路由需 shell 能力（桌面端/服务端），Web/Mobile 返回 501
router.use((_req: Request, res: Response, next) => {
  if (!getPlatformAdapter().shell) {
    res.status(501).json({ error: 'GIT_UNSUPPORTED_ON_PLATFORM' });
    return;
  }
  next();
});

router.get('/discover', async (req: Request, res: Response) => {
  try {
    res.json({ data: { repo: await gitService.discover(String(req.query.dir || '')) } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.status(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/diff', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.diff(String(req.query.repo || ''), {
        file: req.query.file as string | undefined,
        staged: req.query.staged === '1',
      }),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/log', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.log(String(req.query.repo || ''), {
        branch: req.query.branch as string | undefined,
        n: Number(req.query.n) || 50,
      }),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/graph', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.graph(String(req.query.repo || ''), {
        n: Number(req.query.n) || 50,
      }),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/branches', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.branches(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/fileTree', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.fileTree(String(req.query.repo || ''), (req.query.path as string) || ''),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/add', async (req: Request, res: Response) => {
  try {
    await gitService.add(req.body.repo, req.body.files || []);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/commit', async (req: Request, res: Response) => {
  try {
    await gitService.commit(req.body.repo, req.body.message, req.body.files);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/commitAmend', async (req: Request, res: Response) => {
  try {
    await gitService.commitAmend(req.body.repo, req.body.message);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/pull', async (req: Request, res: Response) => {
  try {
    await gitService.pull(req.body.repo, req.body.branch);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/push', async (req: Request, res: Response) => {
  try {
    await gitService.push(req.body.repo, req.body.branch);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/checkout', async (req: Request, res: Response) => {
  try {
    await gitService.checkout(req.body.repo, req.body.branch);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/restore', async (req: Request, res: Response) => {
  try {
    await gitService.restore(req.body.repo, req.body.files || []);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/readFile', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.readFile(String(req.query.repo || ''), String(req.query.path || '')),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/show', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.show(
        String(req.query.repo || ''),
        String(req.query.path || ''),
        (req.query.ref as string) || 'HEAD',
      ),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/numstat', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.numstat(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/aheadBehind', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.aheadBehind(
        String(req.query.repo || ''),
        req.query.branch as string | undefined,
      ),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/lsTree', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.lsTree(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/unstage', async (req: Request, res: Response) => {
  try {
    await gitService.unstage(req.body.repo, req.body.files || []);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/createBranch', async (req: Request, res: Response) => {
  try {
    await gitService.createBranch(req.body.repo, req.body.name);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ===== 合并 / 冲突解决 =====

// GET /git/conflicts —— 未合并（冲突）文件清单
router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.conflicts(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /git/conflictVersions?repo=&path= —— 冲突文件 base/ours/theirs 三版本
router.get('/conflictVersions', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.conflictVersions(String(req.query.repo || ''), String(req.query.path || '')),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /git/merge —— 合并分支；冲突时 ok=false 并返回冲突清单
router.post('/merge', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.merge(req.body.repo, req.body.branch) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /git/abortMerge —— 中止合并
router.post('/abortMerge', async (req: Request, res: Response) => {
  try {
    await gitService.abortMerge(req.body.repo);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /git/resolve —— 冲突解决后标记（git add）
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    await gitService.resolveConflict(req.body.repo, req.body.file);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ===== fetch / stash / tag / blame / revert / reset / cherry-pick / rebase =====

router.post('/fetch', async (req: Request, res: Response) => {
  try {
    const out = await gitService.fetch(req.body.repo, req.body.remote, req.body.branch);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/stashSave', async (req: Request, res: Response) => {
  try {
    const out = await gitService.stashSave(req.body.repo, req.body.message);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/stashList', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.stashList(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/stashPop', async (req: Request, res: Response) => {
  try {
    const out = await gitService.stashPop(req.body.repo, req.body.index ?? 0);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/stashApply', async (req: Request, res: Response) => {
  try {
    const out = await gitService.stashApply(req.body.repo, req.body.index ?? 0);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/stashDrop', async (req: Request, res: Response) => {
  try {
    const out = await gitService.stashDrop(req.body.repo, req.body.index ?? 0);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/tagCreate', async (req: Request, res: Response) => {
  try {
    await gitService.tagCreate(req.body.repo, req.body.name, req.body.message, req.body.ref);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/tagList', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.tagList(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/tagDelete', async (req: Request, res: Response) => {
  try {
    await gitService.tagDelete(req.body.repo, req.body.name);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/blame', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.blame(String(req.query.repo || ''), String(req.query.file || '')),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/revert', async (req: Request, res: Response) => {
  try {
    const out = await gitService.revert(req.body.repo, req.body.commit);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const out = await gitService.reset(req.body.repo, req.body.mode, req.body.target);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/cherryPick', async (req: Request, res: Response) => {
  try {
    const out = await gitService.cherryPick(req.body.repo, req.body.commit);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/rebase', async (req: Request, res: Response) => {
  try {
    const out = await gitService.rebase(req.body.repo, req.body.branch);
    res.json({ data: { ok: true, message: out } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/rebaseAbort', async (req: Request, res: Response) => {
  try {
    await gitService.rebaseAbort(req.body.repo);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/remoteBranches', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.remoteBranches(String(req.query.repo || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/deleteBranch', async (req: Request, res: Response) => {
  try {
    await gitService.deleteBranch(req.body.repo, req.body.name);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/renameBranch', async (req: Request, res: Response) => {
  try {
    await gitService.renameBranch(req.body.repo, req.body.oldName, req.body.newName);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/diffTree', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.diffTree(String(req.query.repo || ''), String(req.query.commit || '')),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/commitDiff', async (req: Request, res: Response) => {
  try {
    res.json({
      data: await gitService.commitDiff(
        String(req.query.repo || ''),
        String(req.query.commit || ''),
        req.query.file as string | undefined,
      ),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/discoverAll', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.discoverAll(String(req.query.dir || '')) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/batchPull', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.batchPull(req.body.repos || []) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/batchPush', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.batchPush(req.body.repos || []) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/batchCheckout', async (req: Request, res: Response) => {
  try {
    res.json({ data: await gitService.batchCheckout(req.body.repos || [], req.body.branch) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;