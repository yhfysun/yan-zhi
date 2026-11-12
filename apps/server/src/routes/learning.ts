// 学习模式接口（docs/英语学习模式方案-2026-11-08.md）。
// 业务规则唯一实现在 ../learning/srs.ts（纯）+ ../learning/service.ts（读写编排）；
// 本文件只做参数校验与 HTTP 编排，禁止自己复算盒数/星级/切关。
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import {
  upsertProfile, getProfileWithStreak,
  listWordBooks, createCustomBook, addWordToBook,
  getLevels, getDrill, submitDrill,
  countDueWords, getReviewDrill, submitReviewDrill,
  listErrors, addError,
  listBookWords, deleteCustomBook,
  getLearningContext, getCourses, getSubjects,
  checkDrillAnswer, checkReviewAnswer,
} from '../learning/service.js';
import { listSceneCards, GRAMMAR_POINTS, READING_PASSAGES } from '../learning/curriculum.js';
import { getEnglishPath } from '../learning/english-path.js';
import { aiExtractWords, aiLookupWord } from '../learning/ai.js';
import { listExamPapers, getExamPaper, submitExamPaper, type ExamType } from '../learning/exams.js';
import { SOFT_MATERIALS, getSoftMaterial } from '../learning/exam-papers-extra.js';
import { SOFT_EXAM_REGIONS, getSoftExamLiveInfo } from '../learning/soft-exam-live.js';
import { listSecurityPaths, getSecurityPath } from '../learning/security-curriculum.js';
import { transcribeClipAudio } from '../services/clip-asr.js';
import { scorePronunciation } from '../learning/pronunciation.js';
import type { DrillAnswer } from '../learning/srs.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const router = Router();
router.use(authMiddleware);

function userIdOf(req: { user?: { userId?: string } }): string {
  const uid = req.user?.userId;
  if (!uid) throw new Error('未登录');
  return uid;
}

// GET /api/learning/profile —— 学习档案（带 streakDays，前端头部火焰位）
router.get('/profile', (req, res) => {
  try { res.json({ data: getProfileWithStreak(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// PUT /api/learning/profile —— 更新档案（cefr / goals）
router.put('/profile', (req, res) => {
  try {
    const body = req.body as { cefr?: string | null; goals?: string | null };
    res.json({ data: upsertProfile(userIdOf(req), body) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/context —— 学习上下文摘要（前端创建学习会话时拼进 system_prompt 快照）
router.get('/context', (req, res) => {
  try { res.json({ data: getLearningContext(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/books —— 词书列表（内置 + 自定义），含关卡数与闯关进度
router.get('/books', (req, res) => {
  try { res.json({ data: listWordBooks(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/books —— 建自定义词书 { name, words: [{word, gloss, phonetic?, example?}] }
router.post('/books', (req, res) => {
  try {
    const body = req.body as { name?: string; subject?: string; words?: Array<{ word?: string; gloss?: string; phonetic?: string; example?: string }> };
    const name = String(body.name || '').trim();
    const words = (body.words || [])
      .map((w) => ({ word: String(w.word || '').trim(), gloss: String(w.gloss || '').trim(), phonetic: w.phonetic ? String(w.phonetic) : undefined, example: w.example ? String(w.example) : undefined }))
      .filter((w) => w.word && w.gloss);
    if (!name) { res.status(400).json({ error: '词书名称必填' }); return; }
    if (words.length < 1) { res.status(400).json({ error: '至少需要 1 个有效词条（word + gloss）' }); return; }
    const id = createCustomBook(userIdOf(req), name, words, String(body.subject || '英语'));
    res.json({ data: { id } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/books/:bookId/words —— 向自定义词书添加单词（幂等）
router.post('/books/:bookId/words', (req, res) => {
  try {
    const body = req.body as { word?: string; gloss?: string; phonetic?: string; example?: string };
    const word = String(body.word || '').trim();
    const gloss = String(body.gloss || '').trim();
    if (!word || !gloss) { res.status(400).json({ error: 'word 与 gloss 必填' }); return; }
    addWordToBook(userIdOf(req), String(req.params.bookId), { word, gloss, phonetic: body.phonetic, example: body.example });
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// DELETE /api/learning/books/:bookId —— 删除自定义词书（连词行与关卡进度；内置词书不可删）
router.delete('/books/:bookId', (req, res) => {
  try {
    deleteCustomBook(userIdOf(req), String(req.params.bookId));
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/books/:bookId/words —— 词书全量词汇浏览（?page=&size=&q=，分页+搜索）
router.get('/books/:bookId/words', (req, res) => {
  try {
    const page = Number(req.query.page ?? 0) || 0;
    const size = Number(req.query.size ?? 50) || 50;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ data: listBookWords(userIdOf(req), String(req.params.bookId), page, size, q) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/books/:bookId/levels —— 关卡地图（星级/通过/解锁）
router.get('/books/:bookId/levels', (req, res) => {
  try { res.json({ data: getLevels(userIdOf(req), String(req.params.bookId)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/books/:bookId/levels/:no/drill —— 生成答题卷（答案不下发）
router.get('/books/:bookId/levels/:no/drill', (req, res) => {
  try {
    const no = Number(req.params.no);
    if (!Number.isInteger(no) || no < 1) { res.status(400).json({ error: '关卡号无效' }); return; }
    res.json({ data: getDrill(userIdOf(req), String(req.params.bookId), no) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/books/:bookId/levels/:no/drill/submit —— 交卷判分（服务端握答案）
router.post('/books/:bookId/levels/:no/drill/submit', (req, res) => {
  try {
    const no = Number(req.params.no);
    if (!Number.isInteger(no) || no < 1) { res.status(400).json({ error: '关卡号无效' }); return; }
    const body = req.body as { questions?: unknown; answers?: unknown };
    if (!Array.isArray(body.questions) || !Array.isArray(body.answers)) {
      res.status(400).json({ error: 'questions 与 answers 必为数组（答案判定在服务端，答题卷从 GET drill 获取）' });
      return;
    }
    const result = submitDrill(
      userIdOf(req), String(req.params.bookId), no,
      body.answers as DrillAnswer[], body.questions as Parameters<typeof submitDrill>[4],
    );
    res.json({ data: result });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/review —— 到期复习答题卷（跨词书取 due 词，不挂关卡）
router.get('/review', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const due = countDueWords(userIdOf(req));
    res.json({ data: { due, ...getReviewDrill(userIdOf(req), limit) } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/review/submit —— 复习交卷（只更新 SRS，不记关卡）
router.post('/review/submit', (req, res) => {
  try {
    const body = req.body as { questions?: unknown; answers?: unknown };
    if (!Array.isArray(body.questions) || !Array.isArray(body.answers)) {
      res.status(400).json({ error: 'questions 与 answers 必为数组' });
      return;
    }
    res.json({ data: submitReviewDrill(userIdOf(req), body.answers as DrillAnswer[], body.questions as Parameters<typeof submitReviewDrill>[2]) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/answer/check —— 单词/复习逐题判题（只给反馈，不改 SRS）
router.post('/answer/check', (req, res) => {
  try {
    const body = req.body as { question?: unknown; answer?: unknown; bookId?: unknown; review?: unknown };
    const question = body.question as Parameters<typeof checkDrillAnswer>[2] | undefined;
    const answer = body.answer as DrillAnswer | undefined;
    if (!question || !answer || !['choice', 'spelling', 'dictation', 'cloze'].includes(String(question.kind))
      || typeof question.qid !== 'string' || typeof question.wordId !== 'string') {
      res.status(400).json({ error: 'question 与 answer 必填，且题型有效' });
      return;
    }
    const feedback = body.review === true
      ? checkReviewAnswer(userIdOf(req), question, answer)
      : checkDrillAnswer(userIdOf(req), String(body.bookId || ''), question, answer);
    res.json({ data: feedback });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/exams —— 历年真题目录（可选 ?type=考研|高考|软考）
router.get('/exams', (req, res) => {
  try {
    const type = String(req.query.type || '');
    if (type && type !== '考研' && type !== '高考' && type !== '软考') {
      res.status(400).json({ error: 'type 只能是考研、高考或软考' });
      return;
    }
    res.json({ data: listExamPapers((type || undefined) as ExamType | undefined) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/exams/:id —— 取卷（答案与解析不下发）
router.get('/exams/:id', (req, res) => {
  try {
    const paper = getExamPaper(String(req.params.id));
    if (!paper) { res.status(404).json({ error: '真题不存在' }); return; }
    res.json({ data: paper });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/soft-exam/materials —— 软考近三年学习资料目录
router.get('/soft-exam/materials', (_req, res) => {
  res.json({ data: SOFT_MATERIALS });
});

// GET /api/learning/soft-exam/materials/:id —— 下载内容（前端转 Blob 保存）
router.get('/soft-exam/materials/:id', (req, res) => {
  const material = getSoftMaterial(String(req.params.id));
  if (!material) { res.status(404).json({ error: '软考资料不存在' }); return; }
  res.json({ data: material });
});

// GET /api/learning/soft-exam/regions —— 地区与官方入口（静态白名单）
router.get('/soft-exam/regions', (_req, res) => {
  res.json({ data: SOFT_EXAM_REGIONS });
});

// GET /api/learning/soft-exam/live?region=北京 —— 全国 + 地区官方动态，10 分钟缓存
router.get('/soft-exam/live', async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region || region.length > 20) {
      res.status(422).json({ error: 'region 无效' });
      return;
    }
    res.json({ data: await getSoftExamLiveInfo(region) });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '官方动态获取失败' });
  }
});

// GET /api/learning/security/paths —— 网络安全分支路线与模块
router.get('/security/paths', (_req, res) => {
  res.json({ data: listSecurityPaths() });
});

// GET /api/learning/security/paths/:id —— 单条安全路线
router.get('/security/paths/:id', (req, res) => {
  const path = getSecurityPath(String(req.params.id));
  if (!path) { res.status(404).json({ error: '安全路线不存在' }); return; }
  res.json({ data: path });
});

// POST /api/learning/exams/:id/submit —— 客观题判分；上机题保留作答并返回参考要点
router.post('/exams/:id/submit', (req, res) => {
  try {
    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      res.status(400).json({ error: 'answers 必须是 { questionId: optionIndex } 对象' });
      return;
    }
    const normalized: Record<string, number> = {};
    for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
      if (Number.isInteger(value)) normalized[key] = Number(value);
    }
    const texts: Record<string, string> = {};
    const rawTexts = req.body?.texts;
    if (rawTexts && typeof rawTexts === 'object' && !Array.isArray(rawTexts)) {
      for (const [key, value] of Object.entries(rawTexts as Record<string, unknown>)) {
        if (typeof value === 'string') texts[key] = value;
      }
    }
    res.json({ data: submitExamPaper(userIdOf(req), String(req.params.id), normalized, texts) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/errors —— 错误本
router.get('/errors', (req, res) => {
  try { res.json({ data: listErrors(userIdOf(req)) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/errors —— 手动加入错误本（P1 由对话结束 LLM 抽取自动写入）
router.post('/errors', (req, res) => {
  try {
    const body = req.body as { wrong?: string; right?: string; reason?: string; grammarPoint?: string; sourceConv?: string };
    const wrong = String(body.wrong || '').trim();
    const right = String(body.right || '').trim();
    if (!wrong || !right) { res.status(400).json({ error: 'wrong 与 right 必填' }); return; }
    res.json({ data: addError(userIdOf(req), { wrong, right, reason: body.reason, grammarPoint: body.grammarPoint, sourceConv: body.sourceConv }) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/books/import —— 词书导入：{url} 下载 JSON 内容包 或 {json} 直接导入
// 内容包格式与内置词书一致：{name,course?,level?,words:[{word,gloss,phonetic?,example?}]}
router.post('/books/import', async (req, res) => {
  try {
    const uid = userIdOf(req);
    const body = req.body as { url?: string; json?: unknown; subject?: string };
    let pack: unknown;
    if (typeof body.json !== 'undefined') {
      pack = body.json;
    } else if (typeof body.url === 'string' && /^https?:\/\//.test(body.url)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const resp = await fetch(body.url, { signal: ctrl.signal });
        if (!resp.ok) { res.status(400).json({ error: `下载失败：HTTP ${resp.status}` }); return; }
        pack = await resp.json();
      } finally {
        clearTimeout(timer);
      }
    } else {
      res.status(400).json({ error: '需要 url（http/https）或 json 字段' });
      return;
    }
    const p = pack as { name?: unknown; course?: unknown; level?: unknown; words?: unknown };
    const name = String(p?.name || '').trim();
    const rawWords = Array.isArray(p?.words) ? p.words : [];
    const words = rawWords
      .map((w: unknown) => {
        const o = w as Record<string, unknown>;
        return {
          word: String(o?.word || '').trim(),
          gloss: String(o?.gloss || '').trim(),
          phonetic: o?.phonetic ? String(o.phonetic).trim() : undefined,
          example: o?.example ? String(o.example).trim() : undefined,
        };
      })
      .filter((w) => w.word && w.gloss);
    if (!name) { res.status(400).json({ error: '内容包缺少 name' }); return; }
    if (words.length < 1) { res.status(400).json({ error: '内容包没有有效词条（word + gloss）' }); return; }
    const id = createCustomBook(uid, name, words, String(body.subject || '英语'));
    // 标记来源：course/level 透传（建书走 custom 类型，词全量落库——与内置包词表不进库不同）
    res.json({ data: { id, name, wordCount: words.length } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/subjects —— 科目清单（前端科目分段由服务端驱动，不写死）
router.get('/subjects', (_req, res) => {
  res.json({ data: getSubjects() });
});

// GET /api/learning/courses —— 课程学段总览（按 ?subject= 过滤，默认英语）
router.get('/courses', (req, res) => {
  try { res.json({ data: getCourses(userIdOf(req), String(req.query.subject || '英语')) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/learning/scenes —— 课程专属场景任务（?courseId= 过滤）
router.get('/scenes', (req, res) => {
  res.json({ data: listSceneCards(String(req.query.courseId || '')) });
});

// GET /api/learning/path —— 零基础英语主线（拼读 / 词根 / 语法 / 故事 / 输出）
router.get('/path', (_req, res) => {
  res.json({ data: getEnglishPath() });
});

// GET /api/learning/grammar —— 语法点目录（列表：id/标题/级别/分组/一句话规则）
router.get('/grammar', (_req, res) => {
  res.json({
    data: GRAMMAR_POINTS.map((g) => ({ id: g.id, title: g.title, cefr: g.cefr, group: g.group, rule: g.rule })),
  });
});

// GET /api/learning/grammar/:id —— 语法微课卡（完整预写讲解）
router.get('/grammar/:id', (req, res) => {
  const g = GRAMMAR_POINTS.find((x) => x.id === req.params.id);
  if (!g) { res.status(404).json({ error: '语法点不存在' }); return; }
  res.json({ data: g });
});

// GET /api/learning/readings —— 分级范文库（内置）
router.get('/readings', (_req, res) => {
  res.json({
    data: READING_PASSAGES.map((r) => ({
      id: r.id, title: r.title, cefr: r.cefr, topic: r.topic, paraCount: r.paras.length,
    })),
  });
});

// GET /api/learning/readings/:id —— 范文全文（中英逐段对齐）
router.get('/readings/:id', (req, res) => {
  const r = READING_PASSAGES.find((x) => x.id === req.params.id);
  if (!r) { res.status(404).json({ error: '范文不存在' }); return; }
  res.json({ data: r });
});

// POST /api/learning/words/extract —— AI 收词（粘贴导入：文章/词列表 → 词条数组）
router.post('/words/extract', async (req, res) => {
  try {
    const body = req.body as { text?: string };
    const text = String(body.text || '').trim();
    if (text.length < 10) { res.status(400).json({ error: '文本太短（至少 10 个字符）' }); return; }
    res.json({ data: await aiExtractWords(userIdOf(req), text) });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/readings/:id/collect —— 阅读收词：查释义后收进「阅读生词」词书（无则自建）
router.post('/readings/:id/collect', async (req, res) => {
  try {
    const uid = userIdOf(req);
    const word = String(req.body?.word || '').trim();
    if (!word || /[^A-Za-z'’\- ]/.test(word)) { res.status(400).json({ error: '请提供英文单词' }); return; }
    const entry = await aiLookupWord(uid, word);
    let book = (await listWordBooks(uid)).find((b) => b.kind === 'custom' && b.name === '阅读生词');
    if (!book) {
      const id = createCustomBook(uid, '阅读生词', [{ word: entry.word, gloss: entry.gloss, phonetic: entry.phonetic, example: entry.example }]);
      res.json({ data: { ok: true, created: true, bookId: id, entry } });
      return;
    }
    addWordToBook(uid, book.id, entry);
    res.json({ data: { ok: true, created: false, bookId: book.id, entry } });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/learning/voice —— 口语跟读识别：{audioBase64, mime, expected?, language?} → whisper 转写
// 复用剪辑模式的 whisper 基建（clip-asr）——同一套依赖解析与错误指引，不另起炉灶。
// 带 expected（目标句）时返回词级对齐发音打分（learning/pronunciation.ts 唯一实现）。
router.post('/voice', async (req, res) => {
  let tmpFile: string | null = null;
  try {
    const body = req.body as { audioBase64?: string; mime?: string; expected?: string; language?: string };
    const b64 = String(body.audioBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!b64) { res.status(400).json({ error: 'audioBase64 必填' }); return; }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 15 * 1024 * 1024) { res.status(400).json({ error: '录音太大（>15MB）' }); return; }
    const mime = String(body.mime || 'audio/webm');
    const ext = mime.includes('wav') ? '.wav' : mime.includes('mp4') ? '.m4a' : mime.includes('ogg') ? '.ogg' : '.webm';
    tmpFile = path.join(os.tmpdir(), `learning-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    await fsp.writeFile(tmpFile, buf);
    // 场景对练允许中英混说：没有发音目标时交给 whisper 自动判定语言；
    // 跟读评分必须锁 en，否则中文口音提示会被识别成汉字，词级对齐失去意义。
    const expected = String(body.expected || '').trim();
    const language = expected ? 'en' : (String(body.language || '').trim() || 'auto');
    const r = await transcribeClipAudio({ input: tmpFile, language, duration: 60 });
    if (!r.ok || !r.cues?.length) {
      res.status(r.status || 400).json({ error: r.error || '识别失败', ...(r.extra || {}) });
      return;
    }
    const text = r.cues.map((c) => c.text).join(' ').trim();
    res.json({
      data: {
        text,
        model: r.model,
        // 目标句对齐打分（P2 发音打分）；不传 expected 维持纯转写旧行为
        ...(expected ? { pronunciation: scorePronunciation(expected, text) } : {}),
      },
    });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
  finally {
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch { /* 临时文件清理失败不阻塞 */ } }
  }
});

export default router;
