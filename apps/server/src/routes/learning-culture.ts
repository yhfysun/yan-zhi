// 传统文化接口（docs/传统文化与音乐学习模式方案-2026-11-14.md §4.3）。
// 精读层内容在 ../learning/culture/curriculum.ts（人工预写，只读下发）；
// 文库层检索走 ../learning/culture/canon-store.ts（SQL，不做前端全量过滤）。
// 判分在前端（quickCheck 与对句判卷口径随内容包下发，对齐英语主线做法）。
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import {
  CULTURE_LEVELS, CULTURE_LESSONS, CULTURE_COUPLET_LESSONS,
  getCultureLesson, getCultureCouplet,
} from '../learning/culture/curriculum.js';
import {
  searchCanonWorks, getCanonWork, canonCollections, dailyCanonWork, ensureCanonSeedImported,
} from '../learning/culture/canon-store.js';

const router = Router();
router.use(authMiddleware);

// GET /api/learning/culture/paths —— 四阶路线（课时列表按阶分组，对句台并入「蒙学·对韵」）
router.get('/paths', (_req, res) => {
  const stages = CULTURE_LEVELS.map((level) => ({
    level,
    lessons: CULTURE_LESSONS.filter((l) => l.level === level).map((l) => ({
      id: l.id, kind: l.kind, title: l.title, goal: l.goal, minutes: l.minutes, steps: l.steps,
    })),
    couplets: CULTURE_COUPLET_LESSONS.filter((c) => c.level === level).map((c) => ({
      id: c.id, title: c.title, prompt: c.prompt, promptTone: c.promptTone,
    })),
  }));
  res.json({ data: { stages } });
});

// GET /api/learning/culture/lessons/:id —— 精读课（原文 + 四层注解 + 脉络 + 自测）
router.get('/lessons/:id', (req, res) => {
  const lesson = getCultureLesson(String(req.params.id));
  if (!lesson) { res.status(404).json({ error: '课时不存在' }); return; }
  res.json({ data: lesson });
});

// GET /api/learning/culture/couplet/:id —— 对句题（候选字块服务端打乱，判卷口径同包下发）
router.get('/couplet/:id', (req, res) => {
  const c = getCultureCouplet(String(req.params.id));
  if (!c) { res.status(404).json({ error: '对句题不存在' }); return; }
  const shuffled = [...c.candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  res.json({ data: { ...c, candidates: shuffled } });
});

// GET /api/learning/culture/canon/collections —— 五维计数（文库筛选器数据源）
router.get('/canon/collections', (_req, res) => {
  try { ensureCanonSeedImported(); res.json({ data: canonCollections() }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/culture/canon/works —— 万级检索（genre/dynasty/tag/collection/popularity/q/page）
router.get('/canon/works', (req, res) => {
  try {
    ensureCanonSeedImported();
    const q = req.query as Record<string, string | undefined>;
    res.json({ data: searchCanonWorks({
      genre: q.genre, dynasty: q.dynasty, tag: q.tag, collection: q.collection,
      popularity: q.popularity, difficulty: q.difficulty, q: q.q,
      page: q.page ? Number(q.page) : 1, pageSize: q.pageSize ? Number(q.pageSize) : 50,
    }) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/culture/canon/works/:id —— 篇目详情（含注解缓存 origin 标记）
router.get('/canon/works/:id', (req, res) => {
  try {
    ensureCanonSeedImported();
    const work = getCanonWork(String(req.params.id));
    if (!work) { res.status(404).json({ error: '篇目不存在' }); return; }
    res.json({ data: work });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/culture/canon/daily —— 每日一首（按日期 seed 轮换）
router.get('/canon/daily', (_req, res) => {
  try {
    ensureCanonSeedImported();
    res.json({ data: dailyCanonWork() });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /culture/canon/ask —— P1：LLM 生成注解落 canon_gloss（assisted，明标「AI 生成 · 供参考」）
router.post('/canon/ask', (_req, res) => {
  res.status(501).json({ error: 'AI 注解将在 P1 提供' });
});

export default router;
