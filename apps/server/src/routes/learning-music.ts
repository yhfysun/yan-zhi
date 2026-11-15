// 音乐接口 v2（docs/音乐双方向重构方案-2026-11-15.md §3.2/§3.4/§七）。
// 内容包在 ../learning/music/（只读下发）；判分（quickCheck）在前端；编曲作品入库 learning_composition。
// AI 辅助编曲走 llm-call.ts 唯一出口（loadModelRow + chatViaRow），不新写 callModel。
// 渲染真音频复用 services/music-render.ts composeMusic（完全本地），产物落 mediaTarget 规范目录，
// 不另拼路径（music-render.ts:3-4 判据）。
import { Router } from 'express';
import path from 'node:path';
import { authMiddleware } from '../auth.js';
import { MUSIC_LEVELS, MUSIC_LESSONS, lessonsByTrack, getMusicLesson } from '../learning/music/curriculum.js';
import { scoresByTrack, getMusicScore } from '../learning/music/scores.js';
import { PENTA_VIEW, modeLabel, noteToTrad } from '../learning/music/scale.js';
import type { MusicTrack, ScoreMode } from '../learning/music/types.js';
import {
  listCompositions, getComposition, createComposition, updateComposition, deleteComposition,
} from '../learning/music/compositions.js';
import { autoArrange, scoreToSpec, specToScore, validateAiSpec } from '../learning/music/arrange.js';
import { loadModelRow } from '../services/model-row.js';
import { chatViaRow } from '../services/llm-call.js';
import { composeMusic } from '../services/music-render.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { mediaTarget } from '../mcp/api-tool-executor.js';

const router = Router();
router.use(authMiddleware);

const TRACKS: MusicTrack[] = ['western', 'traditional'];

function userIdOf(req: { user?: { userId?: string } }): string {
  const uid = req.user?.userId;
  if (!uid) throw new Error('未登录');
  return uid;
}
function errOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function asTrack(v: unknown): MusicTrack | undefined {
  return v === 'western' || v === 'traditional' ? v : undefined;
}
/** 宽松取 JSON 对象：容忍 ```json 围栏与前后废话（学习 ai.ts 的 extractJsonArray 同款口径） */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}
function modeFromBody(track: MusicTrack, v: unknown): ScoreMode {
  const o = (v ?? {}) as Record<string, unknown>;
  if (track === 'traditional') {
    const tonic = typeof o.tonic === 'string' && o.tonic in PENTA_VIEW ? (o.tonic as 'gong') : 'gong';
    return { kind: 'pentatonic', tonic };
  }
  const tonic = (['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(String(o.tonic)) ? String(o.tonic) : 'C') as 'C';
  return { kind: o.kind === 'minor' ? 'minor' : 'major', tonic };
}

// ── 内容下发 ─────────────────────────────────────────────────────────────────────

// GET /api/learning/music/paths?track= —— 两方向路线（课时按阶分组；track 过滤可选）
router.get('/paths', (req, res) => {
  const track = asTrack(req.query.track);
  const lessons = track ? lessonsByTrack(track) : MUSIC_LESSONS;
  const stages = MUSIC_LEVELS.map((level) => ({
    level,
    lessons: lessons.filter((l) => l.level === level).map((l) => ({
      id: l.id, kind: l.kind, title: l.title, goal: l.goal, minutes: l.minutes, steps: l.steps, track: l.track,
    })),
  })).filter((s) => s.lessons.length > 0);
  res.json({ data: { stages } });
});

// GET /api/learning/music/lessons/:id —— 课时（五步 + 自测题口径随包下发）
router.get('/lessons/:id', (req, res) => {
  const lesson = getMusicLesson(String(req.params.id));
  if (!lesson) { res.status(404).json({ error: '课时不存在' }); return; }
  res.json({ data: lesson });
});

// GET /api/learning/music/scores/:id —— 曲目 NoteEvent[]（四记法同源数据）
router.get('/scores/:id', (req, res) => {
  const score = getMusicScore(String(req.params.id));
  if (!score) { res.status(404).json({ error: '曲目不存在' }); return; }
  res.json({ data: score });
});

// GET /api/learning/music/scale —— 两方向映射与调式定义（前端内置同口径副本，此端点供核对）
router.get('/scale', (_req, res) => {
  res.json({
    data: {
      pentaView: PENTA_VIEW,
      tracks: TRACKS.map((t) => ({
        track: t,
        scores: scoresByTrack(t).map((s) => ({ id: s.id, title: s.title, mode: s.mode, meter: s.meter, key: s.key })),
      })),
    },
  });
});

// ── 编曲作品 CRUD ────────────────────────────────────────────────────────────────

router.get('/compositions', (req, res) => {
  try { res.json({ data: listCompositions(userIdOf(req), asTrack(req.query.track)) }); }
  catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.post('/compositions', (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const track = asTrack(b.track);
    if (!track) { res.status(400).json({ error: 'track 必须是 western | traditional' }); return; }
    const score = b.score as { title?: string; notes?: unknown } | undefined;
    if (!score || !Array.isArray(score.notes)) { res.status(400).json({ error: 'score.notes 必填' }); return; }
    const item = createComposition(userIdOf(req), {
      track,
      title: String(b.title ?? score.title ?? '未命名小曲'),
      spec: (b.spec ?? {}) as Record<string, unknown>,
      score: score as never,
      ...(typeof b.audioUrl === 'string' ? { audioUrl: b.audioUrl } : {}),
      origin: b.origin === 'auto' || b.origin === 'ai' ? b.origin : 'manual',
      seed: Number(b.seed) || 1,
    });
    res.json({ data: item });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.patch('/compositions/:id', (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const item = updateComposition(userIdOf(req), String(req.params.id), {
      ...(typeof b.title === 'string' ? { title: b.title } : {}),
      ...(b.spec && typeof b.spec === 'object' ? { spec: b.spec as Record<string, unknown> } : {}),
      ...(b.score && typeof b.score === 'object' ? { score: b.score as never } : {}),
      ...(b.audioUrl !== undefined ? { audioUrl: b.audioUrl === null ? null : String(b.audioUrl) } : {}),
      ...(b.origin === 'manual' || b.origin === 'auto' || b.origin === 'ai' ? { origin: b.origin } : {}),
      ...(b.seed !== undefined ? { seed: Number(b.seed) } : {}),
    });
    if (!item) { res.status(404).json({ error: '作品不存在' }); return; }
    res.json({ data: item });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

router.delete('/compositions/:id', (req, res) => {
  try {
    const ok = deleteComposition(userIdOf(req), String(req.params.id));
    if (!ok) { res.status(404).json({ error: '作品不存在' }); return; }
    res.json({ data: { ok: true } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// ── 三种编曲模式 ─────────────────────────────────────────────────────────────────

// POST /compose/auto —— 规则自动编曲（离线、零 LLM、同 seed 可复现）
router.post('/compose/auto', (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const track = asTrack(b.track);
    if (!track) { res.status(400).json({ error: 'track 必须是 western | traditional' }); return; }
    const mode = modeFromBody(track, b.mode);
    const score = autoArrange({
      track, mode,
      bars: Number(b.bars) || 8, seed: Number(b.seed) || 1,
      ...(typeof b.title === 'string' ? { title: b.title } : {}),
    });
    res.json({ data: { score, spec: scoreToSpec(score, score.seed), origin: 'auto' } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /compose/assist —— AI 辅助编曲：LLM 只产 MusicSpec 决定，分域硬闸校验，非法回落规则生成
router.post('/compose/assist', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const track = asTrack(b.track);
    if (!track) { res.status(400).json({ error: 'track 必须是 western | traditional' }); return; }
    const mode = modeFromBody(track, b.mode);
    const prompt = String(b.prompt ?? '').slice(0, 500);
    const seed = Number(b.seed) || Math.floor(Math.random() * 100000) + 1;
    const trackName = track === 'western' ? '现代通用乐理（西方体系）' : '中国传统音乐';
    const domainRule = track === 'western'
      ? '调式只允许 C/G/F 大调或 a/e/d 小调（白键根）；style 从 gentle/ballad/pop/lofi/folk 里选；旋律用音名如 C5 / F#5'
      : '风格必须国风（style 用 cn）；旋律只能用宫商角徵羽五个音（C D E G A，可到高八度 C5）；乐器默认古筝/笛子/二胡';
    let fallbackReason = '';
    let score: import('../learning/music/types.js').Score | null = null;
    let origin: 'ai' | 'auto' = 'ai';
    let spec: Record<string, unknown> = {};
    try {
      const model = loadModelRow(userIdOf(req));
      if (!model) throw new Error('没有可用的 LLM（请先在「模型平台」配置并启用一个对话模型）');
      const sys = `你是编曲助手。只输出一个 JSON 对象，不要解释、不要代码块。当前体系方向：${trackName}。
格式：{"title":"曲名","bpm":60~180,"bars":2~16,"style":"...","chords":["每小节和弦"],"seed":整数,"melody":[{"start":起始拍,"len":时值拍,"pitch":"C5"}]}
硬规则：${domainRule}。${track === 'traditional' ? '旋律只能用 C D E G A 这五个音（含高八度）。' : ''}melody 必须是完整旋律，铺满所有小节。`;
      const { content } = await chatViaRow(model, [
        { role: 'system', content: sys },
        { role: 'user', content: prompt || (track === 'western' ? '编一段 8 小节明亮的大调小曲' : '编一段 8 小节婉转的五声小曲') },
      ], { maxTokens: 1500, signal: AbortSignal.timeout(90_000) });
      const parsed = extractJsonObject(content);
      const v = validateAiSpec(parsed, track);
      if (v.spec) {
        spec = v.spec as unknown as Record<string, unknown>;
        score = specToScore(v.spec, track, `comp_ai_${seed}`, String(v.spec.title ?? 'AI 小曲'), mode);
      } else {
        fallbackReason = v.fallbackReason ?? '模型输出未通过校验';
      }
    } catch (e) {
      fallbackReason = errOf(e);
    }
    if (!score) {
      // 分域硬闸/LLM 不可用：回落规则生成并如实告知，绝不静默采用错误体系
      origin = 'auto';
      score = autoArrange({ track, mode: modeFromBody(track, b.mode), bars: Number(b.bars) || 8, seed, title: 'AI 未过校验 · 已按规则生成' });
      spec = scoreToSpec(score, seed) as unknown as Record<string, unknown>;
    }
    res.json({ data: { score, spec, origin, fallbackReason: fallbackReason || undefined } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// POST /compose/render —— 真音频成品：composeMusic 本地合成 → mediaTarget 规范目录 → URL
router.post('/compose/render', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const track = asTrack(b.track);
    if (!track) { res.status(400).json({ error: 'track 必须是 western | traditional' }); return; }
    const score = b.score as { title?: string; notes?: unknown[] } | undefined;
    if (!score || !Array.isArray(score.notes)) { res.status(400).json({ error: 'score.notes 必填' }); return; }
    const spec = (b.spec && typeof b.spec === 'object' ? b.spec : scoreToSpec(score as never, Number(b.seed) || 1)) as never;
    let ffmpeg = '';
    try {
      const ff = await resolveFfmpeg();
      if (ff.ok) ffmpeg = ff.ffmpeg;
    } catch { /* 解析失败按不可用处理（降级 wav） */ }
    const target = mediaTarget({ kind: 'audios' });
    const out = await composeMusic({ spec, dir: target.dir, ffmpeg, baseName: String(score.title ?? 'composition').slice(0, 40) });
    if (!out.ok || !out.file) { res.status(400).json({ error: out.error ?? '渲染失败' }); return; }
    const url = `${target.urlBase}/${encodeURIComponent(path.basename(out.file))}`;
    let compositionId: string | undefined;
    if (typeof b.compositionId === 'string' && b.compositionId) {
      const updated = updateComposition(userIdOf(req), b.compositionId, { audioUrl: url });
      if (updated) compositionId = updated.id;
    }
    res.json({
      data: {
        url, file: out.file, bytes: out.bytes,
        duration: out.duration, audioSeconds: out.audioSeconds, bpm: out.bpm, style: out.style,
        warnings: out.warnings, ...(compositionId ? { compositionId } : {}),
      },
    });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

// GET /compose/mode-label —— 调式显示名核对（分域硬闸的只读出口）
router.get('/compose/mode-label', (req, res) => {
  try {
    const score = getMusicScore(String(req.query.scoreId ?? ''));
    if (!score) { res.status(404).json({ error: '曲目不存在' }); return; }
    const note0 = score.notes.find((n) => !n.rest);
    res.json({ data: { label: modeLabel(score.mode), track: score.track, firstTrad: note0 ? (noteToTrad(note0) ?? null) : null } });
  } catch (e) { res.status(400).json({ error: errOf(e) }); }
});

export default router;
