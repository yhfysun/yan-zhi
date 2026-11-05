import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  activatePageAsset,
  archivePageAsset,
  createPageAssetDraft,
  ensurePageAssetsSchema,
  getPageAsset,
  listPageAssets,
  listPageAssetVersions,
  probePageAsset,
  resolvePageAssets,
  rollbackPageAssetDraft,
  updatePageAssetDraft,
  validateStoredPageAsset,
  type StoredPageAsset,
} from '../services/page-assets.js';

const router = Router();
router.use(authMiddleware);

try {
  ensurePageAssetsSchema();
} catch (error) {
  console.warn('[page-assets] 建表/内置种子失败:', error);
}

function errorCode(message: string): string {
  return message.split(':', 1)[0] || 'PAGE_ASSET_ERROR';
}

function sendError(res: Response, error: unknown, status = 400): void {
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({ error: message, code: errorCode(message) });
}

function summary(asset: StoredPageAsset) {
  return {
    id: asset.id,
    title: asset.title,
    platform: asset.platform,
    scope: asset.scope,
    status: asset.status,
    version: asset.version,
    capabilities: asset.capabilities,
    operationIds: asset.spec.operations.map((operation) => operation.id),
    draftVersion: asset.draft?.version ?? null,
    hasDraft: !!asset.draft,
    source: asset.source,
    health: asset.spec.health || {},
    updatedAt: asset.updatedAt,
  };
}

function full(asset: StoredPageAsset) {
  return {
    ...asset.spec,
    draft: asset.draft
      ? {
          version: asset.draft.version,
          baseVersion: asset.draft.baseVersion,
          contractHash: asset.draft.contractHash,
          spec: asset.draft.spec,
          createdAt: asset.draft.createdAt,
          updatedAt: asset.draft.updatedAt,
        }
      : null,
    ownerUserId: asset.userId,
    source: asset.source,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

router.get('/', (req: Request, res: Response) => {
  try {
    const result = listPageAssets(req.user!.userId, {
      query: req.query.query ? String(req.query.query) : undefined,
      platform: req.query.platform ? String(req.query.platform) : undefined,
      capability: req.query.capability ? String(req.query.capability) : undefined,
      status: req.query.status ? String(req.query.status) as any : undefined,
      includeDrafts: String(req.query.includeDrafts || '') === 'true',
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    });
    res.json({
      data: result.data.map(summary),
      pagination: result.pagination,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/resolve', (req: Request, res: Response) => {
  try {
    const data = resolvePageAssets(req.user!.userId, {
      capability: req.query.capability ? String(req.query.capability) : undefined,
      platform: req.query.platform ? String(req.query.platform) : undefined,
      url: req.query.url ? String(req.query.url) : undefined,
    });
    res.json({ data: data.map(summary) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post('/drafts', (req: Request, res: Response) => {
  try {
    const asset = createPageAssetDraft(req.user!.userId, {
      spec: req.body?.spec,
      expectedVersion: req.body?.expectedVersion === undefined ? undefined : Number(req.body.expectedVersion),
      changeSummary: req.body?.changeSummary,
    });
    res.status(201).json({ data: full(asset) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const asset = getPageAsset(req.user!.userId, req.params.id);
    if (!asset) {
      res.status(404).json({ error: `PAGE_ASSET_NOT_FOUND: ${req.params.id}`, code: 'PAGE_ASSET_NOT_FOUND' });
      return;
    }
    res.json({ data: full(asset) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/:id/versions', (req: Request, res: Response) => {
  try {
    res.json({ data: listPageAssetVersions(req.user!.userId, req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id/draft', (req: Request, res: Response) => {
  try {
    const asset = updatePageAssetDraft(req.user!.userId, req.params.id, {
      spec: req.body?.spec,
      expectedVersion: Number(req.body?.expectedVersion),
      changeSummary: req.body?.changeSummary,
    });
    res.json({ data: full(asset) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/validate', (req: Request, res: Response) => {
  try {
    res.json({ data: validateStoredPageAsset(req.user!.userId, req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/probe', (req: Request, res: Response) => {
  try {
    res.json({
      data: probePageAsset(
        req.user!.userId,
        req.params.id,
        req.body?.operationId ? String(req.body.operationId) : undefined,
        req.body?.params && typeof req.body.params === 'object' ? req.body.params : {},
        req.body?.url ? String(req.body.url) : undefined,
      ),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/rollback', (req: Request, res: Response) => {
  try {
    const asset = rollbackPageAssetDraft(
      req.user!.userId,
      req.params.id,
      Number(req.body?.targetVersion),
    );
    res.json({ data: full(asset) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/activate', (req: Request, res: Response) => {
  try {
    const asset = activatePageAsset(
      req.user!.userId,
      req.params.id,
      Number(req.body?.expectedVersion),
      req.body?.changeSummary,
    );
    res.json({ data: full(asset) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/archive', (req: Request, res: Response) => {
  try {
    const asset = archivePageAsset(req.user!.userId, req.params.id);
    res.json({ data: full(asset) });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
