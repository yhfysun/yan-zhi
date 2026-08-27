import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeDocs,
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  searchKnowledgeBase,
} from '../services/kb.js';

const router = Router();
router.use(authMiddleware);

function handleError(res: Response, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  res.status(400).json({ error: message });
}

// GET /api/kb
router.get('/', (req: Request, res: Response) => {
  res.json({ data: listKnowledgeBases(req.user!.userId) });
});

// POST /api/kb
router.post('/', (req: Request, res: Response) => {
  try {
    res.json({ data: createKnowledgeBase(req.user!.userId, req.body || {}) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    res.json({ data: getKnowledgeBase(req.user!.userId, req.params.id) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// PATCH /api/kb/:id
router.patch('/:id', (req: Request, res: Response) => {
  try {
    res.json({ data: updateKnowledgeBase(req.user!.userId, req.params.id, req.body || {}) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// DELETE /api/kb/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteKnowledgeBase(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id/documents
router.get('/:id/documents', (req: Request, res: Response) => {
  try {
    res.json({ data: listKnowledgeDocs(req.user!.userId, req.params.id) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// POST /api/kb/:id/documents
router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    res.json({ data: await addKnowledgeDoc(req.user!.userId, req.params.id, req.body || {}) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id/search?query=...
router.get('/:id/search', (req: Request, res: Response) => {
  try {
    res.json({
      data: searchKnowledgeBase(
        req.user!.userId,
        req.params.id,
        String(req.query.query || ''),
        Number(req.query.topK) || 5,
      ),
    });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// DELETE /api/kb/documents/:docId
router.delete('/documents/:docId', (req: Request, res: Response) => {
  try {
    deleteKnowledgeDoc(req.user!.userId, req.params.docId);
    res.json({ ok: true });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

export default router;
