// 笔记接口（docs/笔记功能方案-2026-11-14.md §2）。业务规则唯一实现在 ../notes/service.ts，
// 本文件只做参数校验与 HTTP 编排。媒体上传见 ../notes/media.ts（音乐双方向重构方案 §3.5）。
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { saveNoteMedia } from '../notes/media.js';
import {
  listCategories, ensureCategory, renameCategory, deleteCategory, moveCategory,
  listNotes, createNote, updateNote, toggleStar, togglePin, deleteNote, getNote,
  toggleTaskDone, getNoteAnalytics,
  dueReminders, drainReminders, ackReminders,
  listNoteTemplates, createNoteTemplate, updateNoteTemplate, deleteNoteTemplate,
  listNoteDictionaries, createNoteDictionary, updateNoteDictionary, deleteNoteDictionary,
  type NoteKind,
} from '../notes/service.js';

const router = Router();

// 鉴权分界：reminders/drain 与 ack 是**桌面主进程轮询专用**，main.cjs 的 fetch 不带 JWT
//（/api/plugin 提醒 drain 先例同款）。但必须收敛暴露面：仅放行本机回环请求，
// 服务端对外部署时远程调用直接 403 —— drain 会消费数据，不能对公网裸奔。
router.use((req, res, next) => {
  if (req.path.startsWith('/reminders/')) {
    const ip = String(req.ip || '');
    const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!local) { res.status(403).json({ error: 'reminders 仅限本机调用' }); return; }
    next();
    return;
  }
  authMiddleware(req, res, next);
});

function userIdOf(req: { user?: { userId?: string } }): string {
  const uid = req.user?.userId;
  if (!uid) throw new Error('未登录');
  return uid;
}

function errOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── 分类 ──

// GET /api/notes/categories —— 分类列表 + 每类计数（含虚拟「未分类」）
router.get('/categories', (req, res) => {
  try { res.json({ data: listCategories(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/categories —— 幂等创建（存在即返回既有）
router.post('/categories', (req, res) => {
  try {
    const body = req.body as any;
    const name = String(body?.name || '');
    const parentId = body?.parentId != null && String(body.parentId) ? String(body.parentId) : null;
    res.json({ data: ensureCategory(userIdOf(req), name, parentId) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// PATCH /api/notes/categories/:id —— 重命名（撞唯一索引给明确错误）
router.patch('/categories/:id', (req, res) => {
  try {
    const body = req.body as any;
    const id = String(req.params.id);
    let item = body?.name != null
      ? renameCategory(userIdOf(req), id, String(body.name))
      : listCategories(userIdOf(req)).find((category) => category.id === id);
    if (!item) { res.status(404).json({ error: '分类不存在' }); return; }
    if (body?.parentId !== undefined) {
      item = moveCategory(
        userIdOf(req),
        id,
        body.parentId == null || String(body.parentId) === '' ? null : String(body.parentId),
      );
    }
    res.json({ data: item });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// DELETE /api/notes/categories/:id —— 删除（笔记迁到未分类，不丢数据）
router.delete('/categories/:id', (req, res) => {
  try {
    deleteCategory(userIdOf(req), String(req.params.id));
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// ── 笔记 ──

// GET /api/notes/templates —— 内置模板 + 用户模板
router.get('/templates', (req, res) => {
  try { res.json({ data: listNoteTemplates(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/templates —— 创建自定义模板
router.post('/templates', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: createNoteTemplate(userIdOf(req), {
      name: String(b?.name || ''),
      description: b?.description != null ? String(b.description) : '',
      icon: b?.icon != null ? String(b.icon) : 'NotebookPen',
      tone: b?.tone != null ? String(b.tone) : 'slate',
      kind: b?.kind != null ? String(b.kind) as any : 'custom',
      fields: Array.isArray(b?.fields) ? b.fields : [],
      titleField: b?.titleField != null ? String(b.titleField) : undefined,
      contentField: b?.contentField != null ? String(b.contentField) : undefined,
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// PATCH /api/notes/templates/:id —— 修改自定义模板；内置模板拒绝
router.patch('/templates/:id', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: updateNoteTemplate(userIdOf(req), String(req.params.id), {
      name: String(b?.name || ''),
      description: b?.description != null ? String(b.description) : '',
      icon: b?.icon != null ? String(b.icon) : 'NotebookPen',
      tone: b?.tone != null ? String(b.tone) : 'slate',
      kind: b?.kind != null ? String(b.kind) as any : 'custom',
      fields: Array.isArray(b?.fields) ? b.fields : [],
      titleField: b?.titleField != null ? String(b.titleField) : undefined,
      contentField: b?.contentField != null ? String(b.contentField) : undefined,
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.delete('/templates/:id', (req, res) => {
  try {
    deleteNoteTemplate(userIdOf(req), String(req.params.id));
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// GET /api/notes/dictionaries —— 内置字典 + 用户字典
router.get('/dictionaries', (req, res) => {
  try { res.json({ data: listNoteDictionaries(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.post('/dictionaries', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: createNoteDictionary(userIdOf(req), {
      name: String(b?.name || ''),
      description: b?.description != null ? String(b.description) : '',
      items: Array.isArray(b?.items) ? b.items : [],
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.patch('/dictionaries/:id', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: updateNoteDictionary(userIdOf(req), String(req.params.id), {
      name: b?.name != null ? String(b.name) : undefined,
      description: b?.description != null ? String(b.description) : undefined,
      items: Array.isArray(b?.items) ? b.items : undefined,
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.delete('/dictionaries/:id', (req, res) => {
  try {
    deleteNoteDictionary(userIdOf(req), String(req.params.id));
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// GET /api/notes/notes?kind=&category=&starred=&q=&sort= —— 列表（q 全文搜 title+content）
router.get('/notes', (req, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const kind: NoteKind | undefined = q.kind === 'plan' ? 'plan' : q.kind === 'note' ? 'note' : undefined;
    res.json({
      data: listNotes(userIdOf(req), {
        kind,
        categoryId: q.category || undefined,
        starred: q.starred === '1' || q.starred === 'true',
        q: q.q || undefined,
        sort: q.sort === 'created' ? 'created' : q.sort === 'plan' ? 'plan' : 'updated',
      }),
    });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/notes —— 创建（category_name 直传，不存在自动创建）
router.post('/notes', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: createNote(userIdOf(req), {
      title: String(b?.title || ''),
      content: b?.content != null ? String(b.content) : '',
      kind: b?.kind === 'plan' ? 'plan' : 'note',
      categoryId: b?.categoryId != null && String(b.categoryId) ? String(b.categoryId) : undefined,
      templateId: b?.templateId != null ? String(b.templateId) : undefined,
      data: b?.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : undefined,
      occurredAt: b?.occurredAt != null && Number(b.occurredAt) ? Number(b.occurredAt) : null,
      categoryName: b?.categoryName != null ? String(b.categoryName) : undefined,
      planAt: b?.planAt != null && Number(b.planAt) ? Number(b.planAt) : null,
      remindAt: b?.remindAt != null && Number(b.remindAt) ? Number(b.remindAt) : null,
      source: b?.source != null ? String(b.source) : 'manual',
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// GET /api/notes/notes/:id —— 详情
router.get('/notes/:id', (req, res) => {
  try {
    const item = getNote(userIdOf(req), String(req.params.id));
    if (!item) { res.status(404).json({ error: '笔记不存在' }); return; }
    res.json({ data: item });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// PATCH /api/notes/notes/:id —— 改标题/内容/分类/计划/提醒/星标/置顶
router.patch('/notes/:id', (req, res) => {
  try {
    const b = req.body as any;
    res.json({ data: updateNote(userIdOf(req), String(req.params.id), {
      title: b?.title != null ? String(b.title) : undefined,
      content: b?.content != null ? String(b.content) : undefined,
      templateId: b?.templateId !== undefined ? (b.templateId === null ? null : String(b.templateId)) : undefined,
      data: b?.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : undefined,
      occurredAt: b?.occurredAt !== undefined ? (b.occurredAt === null ? null : Number(b.occurredAt) || null) : undefined,
      categoryId: b?.categoryId !== undefined ? (b.categoryId === null ? null : String(b.categoryId)) : undefined,
      categoryName: b?.categoryName !== undefined ? String(b.categoryName ?? '') : undefined,
      starred: typeof b?.starred === 'boolean' ? b.starred : undefined,
      pinned: typeof b?.pinned === 'boolean' ? b.pinned : undefined,
      planAt: b?.planAt !== undefined ? (b.planAt === null ? null : Number(b.planAt) || null) : undefined,
      remindAt: b?.remindAt !== undefined ? (b.remindAt === null ? null : Number(b.remindAt) || null) : undefined,
    }) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/notes/:id/star · /pin —— 收藏 / 置顶切换
router.post('/notes/:id/star', (req, res) => {
  try { res.json({ data: { starred: toggleStar(userIdOf(req), String(req.params.id)) } }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});
router.post('/notes/:id/pin', (req, res) => {
  try { res.json({ data: { pinned: togglePin(userIdOf(req), String(req.params.id)) } }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});
router.post('/notes/:id/task-done', (req, res) => {
  try { res.json({ data: toggleTaskDone(userIdOf(req), String(req.params.id)) }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// DELETE /api/notes/notes/:id —— 删除
router.delete('/notes/:id', (req, res) => {
  try {
    deleteNote(userIdOf(req), String(req.params.id));
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// GET /api/notes/analytics?from=&to= —— 账本、库存、时间和任务区间汇总
router.get('/analytics', (req, res) => {
  try {
    const from = Number((req.query as any)?.from) || (Date.now() - 86_400_000);
    const to = Number((req.query as any)?.to) || Date.now();
    res.json({ data: getNoteAnalytics(userIdOf(req), from, to) });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// ── 到期提醒（drain 范式：取走即标记，天然幂等不重复）──

// GET /api/notes/reminders/due —— 到期待提醒（只读；Web 端红点/列表高亮用）
router.get('/reminders/due', (req, res) => {
  try { res.json({ data: { items: dueReminders() } }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/reminders/drain —— 桌面主进程 15s 轮询消费（取走即标记；两次 drain 第二次必空）
router.post('/reminders/drain', (req, res) => {
  try { res.json({ data: { items: drainReminders() } }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /api/notes/reminders/ack —— Web 端先查 due、处理后显式确认
router.post('/reminders/ack', (req, res) => {
  try {
    const ids = Array.isArray((req.body as any)?.ids) ? (req.body as any).ids.map(String) : [];
    res.json({ data: { acked: ackReminders(ids) } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// ── 媒体上传（笔记插图 / 曲谱图 · docs/音乐双方向重构方案-2026-11-15.md §3.5）──
// POST /api/notes/media { name, base64 } —— 业务规则唯一实现在 ../notes/media.ts

router.post('/media', (req, res) => {
  try {
    const { name, base64 } = (req.body ?? {}) as { name?: string; base64?: string };
    if (!name || typeof base64 !== 'string' || !base64) { res.status(400).json({ error: 'name 与 base64 为必填项' }); return; }
    res.json({ data: saveNoteMedia(String(name), base64) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
