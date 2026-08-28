import { Router, Request, Response } from 'express';
import { guestOrAuth } from '../auth.js';
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
  searchAllKnowledgeBases,
  listKnowledgeChunks,
  multiHopSearchKnowledge,
  getKnowledgeGraph,
  extractEntityGraph,
  getEntityGraph,
  entityGraphSearch,
  ensureBuiltinAppGuide,
  resetBuiltinAppGuide,
} from '../services/kb.js';

const router = Router();
router.use(guestOrAuth);

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

// POST /api/kb/builtin-guide —— 确保内置「应用使用说明」库存在（首次用 docs[一个功能一个文档] 种子化并切分）
router.post('/builtin-guide', async (req: Request, res: Response) => {
  try {
    const data = await ensureBuiltinAppGuide(req.user!.userId, req.body?.docs || []);
    // 首次种子化后，异步自动抽取内置库的实体图谱（本地模型，不阻塞）
    if (data.seeded) extractEntityGraph('guest', 'builtin-app-guide').catch(() => undefined);
    res.json({ data });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// POST /api/kb/builtin-guide/reset —— 重置内置「应用使用说明」为默认 docs
router.post('/builtin-guide/reset', async (req: Request, res: Response) => {
  try {
    const data = await resetBuiltinAppGuide(req.user!.userId, req.body?.docs || []);
    // 重置后异步重新抽取实体图谱（本地模型，不阻塞）
    extractEntityGraph('guest', 'builtin-app-guide').catch(() => undefined);
    res.json({ data });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/search-all?query=... —— 跨所有库检索（prompt 命中注入用）。须在 /:id 之前注册，避免被当 id
router.get('/search-all', (req: Request, res: Response) => {
  try {
    res.json({
      data: searchAllKnowledgeBases(
        req.user!.userId,
        String(req.query.query || ''),
        Number(req.query.topK) || 5,
      ),
    });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/multi-hop?query=&topK=&hops= —— 跨库多跳检索（知识查询工具）。须在 /:id 之前注册
router.get('/multi-hop', (req: Request, res: Response) => {
  try {
    res.json({
      data: multiHopSearchKnowledge(
        req.user!.userId,
        String(req.query.query || ''),
        Number(req.query.topK) || 3,
        Number(req.query.hops) || 2,
      ),
    });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/entity-search?query=&hops=&topK= —— 实体导向多跳查询：问题匹配实体→取其切片→沿关系BFS最多hops级取关联实体切片。须在 /:id 之前注册
router.get('/entity-search', (req: Request, res: Response) => {
  try {
    res.json({
      data: entityGraphSearch(
        req.user!.userId,
        String(req.query.query || ''),
        Number(req.query.hops) || 3,
        Number(req.query.topK) || 3,
      ),
    });
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

// POST /api/kb/:id/documents —— 添加文档（切块），随后异步自动增量提取实体图谱
router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    const data = await addKnowledgeDoc(req.user!.userId, req.params.id, req.body || {});
    // 自动增量提取（fire-and-forget，不阻塞响应；本地模型慢）
    extractEntityGraph(req.user!.userId, req.params.id).catch(() => undefined);
    res.json({ data });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id/chunks?docId=... —— 列出分片节点（关系/可视化用），可按文档过滤
router.get('/:id/chunks', (req: Request, res: Response) => {
  try {
    res.json({
      data: listKnowledgeChunks(req.user!.userId, req.params.id, req.query.docId ? String(req.query.docId) : undefined),
    });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id/graph —— 知识库关系图谱（节点=库/文档/分片，边=归属），供前端 Vue Flow 渲染
router.get('/:id/graph', (req: Request, res: Response) => {
  try {
    res.json({ data: getKnowledgeGraph(req.user!.userId, req.params.id) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// GET /api/kb/:id/entity-graph —— 实体关系图谱（节点=实体，边=关系，实体带来源切片）
router.get('/:id/entity-graph', (req: Request, res: Response) => {
  try {
    res.json({ data: getEntityGraph(req.user!.userId, req.params.id) });
  } catch (e: unknown) {
    handleError(res, e);
  }
});

// POST /api/kb/:id/graph/extract —— 增量提取/融合实体图谱（用本地大模型），未处理文档自动处理
router.post('/:id/graph/extract', async (req: Request, res: Response) => {
  try {
    const r = await extractEntityGraph(req.user!.userId, req.params.id);
    res.json({ data: r });
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
