// 剪辑工程接口 —— 剪辑模式（/clip）的前端读写通道。
//
// 为什么单独一个路由文件（而不是塞进 conversations.ts）：
//   工程文件按会话存放、读写逻辑与 clip_project 工具**共用同一份目录解析**
//   （services/clip-store.ts），这里只做 HTTP 薄壳。
//
// ★ 会话归属校验：conversationId 必须真实存在，否则会往「未命名任务」目录落文件
//   —— 前端一个拼错的 id 就能在工作目录里留下垃圾工程，且不会报错。

import { Router, Request, Response } from 'express';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
// ★ P4（clip-mode 插件包）：宿主能力一律经 host-bridge —— 打包时这些 import 被重定向到
//   __YZ_SERVER_HOST__ shim，插件包里不会出现第二份 db / 第二套目录解析。
import {
  authMiddleware, db, hardDeleteRow, ensureArtifactDirFor, runCmd,
} from '../host-bridge.js';
import { readClipProject, writeClipProject, clipProjectPath as clipProjectPathOf } from '../services/clip-store.js';
import { summarizeProject, type ClipProject } from '../services/clip-project.js';
import { listAllRecipes } from '../services/clip-recipe-store.js';
import { parseProbeJson, probeArgs, segmentDuration } from '../services/clip-render.js';
import { renderPreviewFrame, locateTimeline } from '../services/clip-preview.js';
import { ensureSegmentProxy } from '../services/clip-proxy.js';
import { isProjectSourcePath } from '../services/clip-layer-media.js';
import { ensureEffectPreview } from '../services/clip-effect-preview.js';
import { analyzeBeats } from '../services/clip-beats.js';
import { planBeatCut } from '../services/clip-beat-cut.js';
import { TRANSITIONS } from '@yan-zhi/shared';
import { SFX_LIBRARY, sfxById, searchSfxLibrary } from '../services/sfx-library.js';
import { STICKER_LIBRARY, stickerById, stickerArgs } from '../services/sticker-library.js';
import { clipProjectTool } from '../mcp/api-tool-executor.js';
import {
  setRenderQueueRunner, enqueueRenderJob, listRenderJobs, cancelRenderJob, clearFinishedRenderJobs,
} from '../services/clip-render-queue.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { executeApiTool } from '../mcp/api-tool-executor.js';
import { transcribeClipAudio } from '../services/clip-asr.js';
import { reframeVertical, parseTargetAspect } from '../services/clip-reframe.js';
import { probeMatteRuntime } from '../services/clip-matte.js';
import {
  planTalkingCut, splitSegmentByKeeps, sourceCutsToFilm, rippleTimelineLayers, TALKING_CUT_DEFAULTS,
} from '../services/clip-talking-cut.js';
import { applyMulticamBoundaries, rebuildMulticamGroup } from '../services/clip-multicam.js';

/** 跑 ffmpeg（复用既有 exec-cmd 的 runCmd，与其它媒体链路同一实现）。 */
async function runFfmpeg(bin: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; stderr: string }> {
  const r = await runCmd(bin, args, { timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  return { ok: r.ok, stderr: r.ok ? '' : (r.stderr || r.error).slice(-1200) };
}
import fs from 'node:fs';

/**
 * 探测一个媒体文件（时长/分辨率/音轨）—— 异步版。
 *
 * ★ ffprobe 的路径**必须走 resolveFfmpeg()**（env > 数据目录 > 随包 > PATH 的既有解析），
 *   不要在这里手拼候选路径 —— 那是第二份定位逻辑，随包/开发环境一变就失效。
 * ★ 解析口径共用 parseProbeJson/probeArgs（那才是会漂移的地方）。
 * ★ 失败返回全 0 而非抛错：素材被移走/格式怪时前端按"未知"展示，不该阻塞编辑。
 */
function probeMediaAsync(ffprobe: string, file: string): Promise<{ duration: number; width: number; height: number; hasVideo: boolean; hasAudio: boolean; ok: boolean }> {
  return new Promise((resolve) => {
    execFile(ffprobe, probeArgs(file), { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve({ duration: 0, width: 0, height: 0, hasVideo: false, hasAudio: false, ok: false }); return; }
      const p = parseProbeJson(String(stdout || ''));
      resolve({ duration: p.durationSec, width: p.width, height: p.height, hasVideo: p.height > 0, hasAudio: p.hasAudio, ok: p.durationSec > 0 });
    });
  });
}

/** 图片扩展名（与 clip-render 的 imageFiles 口径一致；命中走 kenburns/图片分支）。 */
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/**
 * 代理预览的探测行（durations/hasAudio/imageFiles 一次探齐）。
 * ★ hasAudio 是渲染计划的必要输入（决定补静音还是透传原声）—— /frame 只需要时长，
 *   代理要真渲染，必须与 api-tool-executor 的 probeClipSegments 同口径。
 */
async function buildProxyProbeRow(
  ffprobe: string,
  project: ClipProject,
): Promise<{ durations: Record<string, number>; hasAudio: Record<string, number | boolean>; imageFiles: string[] }> {
  const durations: Record<string, number> = {};
  const hasAudio: Record<string, number | boolean> = {};
  const imageFiles: string[] = [];
  const uniq: string[] = [];
  for (const c of project.clips) if (!uniq.includes(c.file)) uniq.push(c.file);
  const CONC = 4;
  for (let i = 0; i < uniq.length; i += CONC) {
    const batch = uniq.slice(i, i + CONC);
    const rs = await Promise.all(batch.map((p) => probeMediaAsync(ffprobe, p)));
    rs.forEach((r, k) => {
      const p = batch[k];
      const img = IMAGE_EXT_RE.test(p);
      if (img) imageFiles.push(p);
      durations[p] = img ? 0 : r.duration;
      const seg = project.clips.find((c) => c.file === p);
      if (seg) {
        durations[seg.id] = durations[p];
        hasAudio[seg.id] = img ? false : r.hasAudio;
        hasAudio[p] = img ? false : r.hasAudio;
      }
    });
  }
  return { durations, hasAudio, imageFiles };
}

const router = Router();
router.use(authMiddleware);

/**
 * 探工程里每个素材的真实时长：键**同时挂 clip.id 与 file**。
 * ★ 单一实现：/frame 定位播放头、/freeze 抽定格帧都要用，各写一份必然漂移
 *   （症状是"预览定位到的段与定格抽到的段不是同一段"）。
 * ★ 并发 4：素材多时串行探测会让拖动播放头明显卡顿。
 */
async function probeProjectDurations(ffprobe: string, project: ClipProject): Promise<Record<string, number>> {
  const durations: Record<string, number> = {};
  const uniq: string[] = [];
  for (const c of project.clips) if (!uniq.includes(c.file)) uniq.push(c.file);
  const CONC = 4;
  for (let i = 0; i < uniq.length; i += CONC) {
    const batch = uniq.slice(i, i + CONC);
    const rs = await Promise.all(batch.map((p) => probeMediaAsync(ffprobe, p)));
    rs.forEach((r, k) => {
      durations[batch[k]] = r.duration;
      const seg = project.clips.find((c) => c.file === batch[k]);
      if (seg) durations[seg.id] = r.duration;
    });
  }
  return durations;
}

function conversationExists(id: string): boolean {
  if (!id) return false;
  try {
    // ★ 对齐业界稳定语义（ChatGPT：归档后从一切列表消失，只能在归档区找到）：
    //   归档/回收站的剪辑项目都不再出现在剪辑首页、不可再操作工程。
    //   找回入口 = 侧栏「已归档」分组取消归档（此前我给归档留的「剪辑首页仍可见」是自创语义）。
    return !!db.prepare('SELECT id FROM conversation WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL').get(id);
  } catch {
    return false;
  }
}

// GET /api/plugin/clip-mode/projects?userId=...
//
// 剪辑项目管理：列出**全部剪辑任务（= 一个剪辑项目 = 一条时间线）**及工程摘要。
//
// ★ 为什么必须有这个接口（而不是复用 /api/conversations?mode=clip）：
//   剪映式首页要一屏看到「每个项目有几段、多长、字幕几条、最后改于何时」，
//   这些只有读工程文件才知道；让前端逐会话去 GET 工程会变成 N+1 次请求。
//   摘要口径与 clip_project op=get 一致（同一个 summarizeProject），不另建一套。
router.get('/projects', (req: Request, res: Response) => {
  const userId = String(req.user?.userId || 'guest');
  let rows: Array<{ id: string; title?: string; updated_at?: number; created_at?: number }> = [];
  try {
    rows = db
      .prepare(
        `SELECT id, title, created_at, updated_at FROM conversation
         WHERE user_id = ? AND COALESCE(NULLIF(mode, ''), 'office') = 'clip'
           AND deleted_at IS NULL AND archived_at IS NULL
         ORDER BY updated_at DESC`,
      )
      .all(userId) as typeof rows;
  } catch {
    return res.json({ projects: [] });
  }
  const projects = rows.map((r) => {
    const project = readClipProject(r.id);
    const s = project ? summarizeProject(project) : null;
    return {
      conversationId: r.id,
      title: r.title || project?.name || '未命名剪辑',
      createdAt: r.created_at || 0,
      updatedAt: r.updated_at || 0,
      projectUpdatedAt: project?.updatedAt || 0,
      clipCount: (s?.clipCount as number) || 0,
      textCount: ((s?.texts as unknown[]) || []).length,
      totalDuration: (s?.totalDuration as number) || 0,
      hasBgm: !!(s?.bgm),
      output: (s?.output as { size: string; fps: number }) || null,
      // 素材缺失警示：引用式工程（与 Premiere/FCP External 同模型）会有 Offline 素材
      missingClips: project ? project.clips.filter((c) => {
        try { return !fs.existsSync(c.file); } catch { return true; }
      }).length : 0,
    };
  });
  return res.json({ projects });
});

// DELETE /api/plugin/clip-mode/projects/:conversationId —— 删项目 = 删该会话及其产物目录
//
// ★ 只删**本会话自己的**文件（工程 + 会话产物目录），不碰素材源文件：
//   素材是用户/其它任务的文件，删项目不该连带删掉它们（与剪映"删草稿不删素材"一致）。
router.delete('/projects/:conversationId', (req: Request, res: Response) => {
  const userId = String(req.user?.userId || 'guest');
  const cid = String(req.params.conversationId || '').trim();
  if (!cid) return res.status(400).json({ error: 'conversationId 必填' });
  let row: { id: string } | undefined;
  try {
    row = db.prepare("SELECT id FROM conversation WHERE id = ? AND user_id = ? AND COALESCE(NULLIF(mode,''),'office') = 'clip'").get(cid, userId) as { id: string } | undefined;
  } catch {
    return res.status(500).json({ error: '查询失败' });
  }
  if (!row) return res.status(404).json({ error: '剪辑项目不存在' });
  // 先删工程文件，再删会话行（顺序反了会留下"没有会话的孤儿工程"）
  let removedFiles = 0;
  try {
    const { file } = clipProjectPathOf(cid);
    if (fs.existsSync(file)) { fs.rmSync(file, { force: true }); removedFiles++; }
  } catch { /* 文件删不掉不阻塞会话删除，但如实回报 */ }
  // ★ 走统一的真删出口（2026-10-16）：剪辑项目的删除此前是自己手写一行
  //   DELETE FROM conversation，漏掉了 message / message_summary / task_plan_item /
  //   path-guard 授权这批派生物清理 —— 同一个会话的派生物清理清单却有两份实现，
  //   将来新增派生表必有一边漏。这里不再自己删。
  try {
    hardDeleteRow(cid);
  } catch {
    return res.status(500).json({ error: '删除会话失败' });
  }
  return res.json({ ok: true, removedFiles, note: '已删除项目（素材源文件未动）' });
});

// POST /api/plugin/clip-mode/probe —— 批量探测媒体时长（前端时间轴要按真实时长排布）
//
// ★★★ 为什么必须由服务端探（2026-10-07 用户报"10s 的素材只当 3s"）：
//   前端拿到的是素材的**本机路径**，但要读时长只能靠 <video> 元数据 —— 对每个素材
//   建 DOM 元素逐个 load 既慢又会在素材多时卡顿，而且图片/音频要分别走 <img>/<audio>。
//   服务端本来就有 ffprobe（渲染链路依赖它），一次批量探完返回，前端直接用。
//   ★ 探测失败（素材已被移走/格式怪）返回 0 而不是报错 —— 前端按"未知"展示，不阻塞编辑。
router.post('/probe', async (req: Request, res: Response) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.json({ data: [] });
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.json({ data: [], error: 'ffprobe 不可用（媒体功能需要 ffmpeg）' });
  const out: Array<{ path: string; duration: number; width: number; height: number; hasVideo: boolean; ok: boolean }> = [];
  // 并发探测但限制在 4 路：一次性开几十个 ffprobe 进程会把 CPU 打满（Windows 上尤其明显）
  const list: string[] = items.slice(0, 200).map((it: { path?: string }) => String(it?.path || '').trim()).filter((s2: string) => s2.length > 0);
  const CONCURRENCY = 4;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p: string) => probeMediaAsync(ff.ffprobe, p)));
    results.forEach((r, k) => out.push({ path: batch[k], ...r }));
  }
  return res.json({ data: out });
});

// GET /api/plugin/clip-mode/library —— 内置音效库清单（合成式，免版权）
//
// ★ 诚实说明为什么只有"音效 + 氛围垫"没有旋律 BGM：
//   合成器做不出编曲；打包真实音乐又涉及版权与体积。详见 services/sfx-library.ts 顶部注释。
router.get('/library', (req: Request, res: Response) => {
  const note = '音效为 ffmpeg 实时合成（免版权）。旋律性配乐请自备或从素材市场获取。';
  const q = String(req.query.q || '').trim();
  // ★ 带 q = 按描述排序返回（与工具 sfx.search / 工作台搜索框同一份匹配器）；
  //   不带 q 保持原样返回全库（老调用方不受影响）。
  if (q) {
    const r = searchSfxLibrary(q, 12);
    return res.json({
      sfx: r.hits.map((h) => ({ ...h.item, score: h.score, reason: h.reason })),
      matched: r.matched,
      query: q,
      note,
    });
  }
  res.json({
    sfx: SFX_LIBRARY.map((s) => ({ id: s.id, label: s.label, desc: s.desc, group: s.group, maxSec: s.maxSec })),
    matched: true,
    query: '',
    note,
  });
});

// POST /api/plugin/clip-mode/library/sfx —— 生成一个音效到会话素材库
// body: { conversationId, id }
router.post('/library/sfx', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const id = String(req.body?.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  const item = sfxById(id);
  if (!item) return res.status(404).json({ error: `音效不存在：${id}` });
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（音效生成需要它）' });
  const cid = conversationId;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(cid) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const dirInfo = ensureArtifactDirFor({ conversationId: cid, category: 'upload' });
  const fileName = `sfx-${item.id}-${Date.now()}.m4a`;
  const outFile = path.join(dirInfo.dir, fileName);
  try {
    const r = await runFfmpeg(ff.ffmpeg, ['-y', '-v', 'error', ...item.input, '-af', item.af, '-t', String(item.maxSec), '-c:a', 'aac', '-ar', '44100', '-ac', '2', outFile], 60000);
    if (!r.ok) return res.status(500).json({ error: `生成失败：${r.stderr.slice(-300)}` });
  } catch (e: unknown) {
    return res.status(500).json({ error: `生成异常：${e instanceof Error ? e.message : String(e)}` });
  }
  const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const fileId = `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(fileId, cid, String(req.user?.userId || 'guest'), null, fileName, outFile, 'upload', 'audio/mp4', size, 'user', null, Date.now());
  return res.json({ ok: true, name: fileName, path: outFile, bytes: size, label: item.label });
});

// GET /api/plugin/clip-mode/library/sfx-preview?id=whoosh —— **试听**（不落素材库）
//
// ★★★ 为什么单独一条（2026-10-21 用户：「搞点音效库？」）：
//   此前想听一个音效只能先"生成"——它会写进会话素材库，试五个就多五个垃圾文件。
//   试听是一次性的，产物落临时缓存即可，不进 conversation_file。
// ★ 缓存键 = id + 参数版本：合成参数改了必须改 SFX_CACHE_VERSION，否则用户一直听到旧音。
const SFX_CACHE_VERSION = 'v1';

router.get('/library/sfx-preview', async (req: Request, res: Response) => {
  const id = String(req.query.id || '').trim();
  const item = sfxById(id);
  if (!item) return res.status(404).json({ error: `音效不存在：${id}` });
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用' });

  const dir = path.join(tmpdir(), `yz-sfx-preview-${SFX_CACHE_VERSION}`);
  const file = path.join(dir, `${id}.m4a`);
  if (!fs.existsSync(file)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-v', 'error', ...item.input,
        '-af', item.af, '-t', String(item.maxSec),
        '-c:a', 'aac', '-ar', '44100', '-ac', '2', file,
      ], 60000);
      if (!r.ok) return res.status(500).json({ error: `试听生成失败：${r.stderr.slice(-300)}` });
    } catch (e: unknown) {
      return res.status(500).json({ error: `试听生成异常：${e instanceof Error ? e.message : String(e)}` });
    }
  }
  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(file);
});

// GET /api/plugin/clip-mode/library/stickers —— 内置贴纸库（程序化生成 PNG，免版权）
router.get('/library/stickers', (_req: Request, res: Response) => {
  res.json({
    stickers: STICKER_LIBRARY.map((s) => ({ id: s.id, label: s.label, desc: s.desc, group: s.group })),
    note: '贴纸由 ffmpeg 实时合成（透明 PNG，免版权）。插画级贴纸请用「设为贴纸」导入本地图片。',
  });
});

// GET /api/plugin/clip-mode/library/sticker-preview?id=check —— 缩略图（不落素材库）
const STICKER_CACHE_VERSION = 'v1';
router.get('/library/sticker-preview', async (req: Request, res: Response) => {
  const id = String(req.query.id || '').trim();
  const item = stickerById(id);
  if (!item) return res.status(404).json({ error: `贴纸不存在：${id}` });
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用' });
  const dir = path.join(tmpdir(), `yz-sticker-preview-${STICKER_CACHE_VERSION}`);
  const file = path.join(dir, `${id}.png`);
  if (!fs.existsSync(file)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const r = await runFfmpeg(ff.ffmpeg, stickerArgs(item, file), 60000);
      if (!r.ok) return res.status(500).json({ error: `贴纸生成失败：${r.stderr.slice(-300)}` });
    } catch (e: unknown) {
      return res.status(500).json({ error: `贴纸生成异常：${e instanceof Error ? e.message : String(e)}` });
    }
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(file);
});

// POST /api/plugin/clip-mode/library/sticker  body: { conversationId, id }
// 生成一张贴纸并登记到会话素材库（用户随后可"设为贴纸"或让智能体 add_sticker）。
router.post('/library/sticker', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const id = String(req.body?.id || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  const item = stickerById(id);
  if (!item) return res.status(404).json({ error: `贴纸不存在：${id}` });
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(conversationId) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（贴纸生成需要它）' });

  const dirInfo = ensureArtifactDirFor({ conversationId, category: 'upload' });
  const fileName = `sticker-${item.id}-${Date.now()}.png`;
  const outFile = path.join(dirInfo.dir, fileName);
  try {
    const r = await runFfmpeg(ff.ffmpeg, stickerArgs(item, outFile), 60000);
    if (!r.ok) return res.status(500).json({ error: `生成失败：${r.stderr.slice(-300)}` });
  } catch (e: unknown) {
    return res.status(500).json({ error: `生成异常：${e instanceof Error ? e.message : String(e)}` });
  }
  const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const fileId = `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(fileId, conversationId, String(req.user?.userId || 'guest'), null, fileName, outFile, 'upload', 'image/png', size, 'user', null, Date.now());
  return res.json({ ok: true, name: fileName, path: outFile, bytes: size, label: item.label });
});

// POST /api/plugin/clip-mode/asr —— 语音转字幕（本地 whisper.cpp）
//
// ★★★ 为什么要有这条（2026-10-08）：ASR 能力此前只能从**对话**触发
//   （模型调 media_asr_transcribe）。剪辑工作台里"素材只有音频、想自动打轴"时
//   却没有任何入口 —— 能力有了、用户用不上。本端点补这个入口。
//
// 与工具的关系：共用同一套 runtime（whisper-runtime），只是换成 HTTP 薄壳，
// 免得前端为了转一次字幕还得绕去对话。返回的 cues 直接就是 ClipText 的
// {start,end,text} 形态（复用 subtitle-style 的 parseSrt 解析），前端零转换。
router.post('/asr', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const inputRaw = String(req.body?.path || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!inputRaw) return res.status(400).json({ error: 'path 必填（音频或视频文件路径）' });
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(conversationId) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const input = path.isAbsolute(inputRaw) ? inputRaw : path.resolve(inputRaw);
  if (!fs.existsSync(input)) return res.status(404).json({ error: `文件不存在：${input}` });

  // 识别编排（依赖分诊 + 临时文件清理）在 services/clip-asr：与智能剪口播共用同一份
  const r = await transcribeClipAudio({ input, model: req.body?.model, language: req.body?.language });
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error, ...(r.extra || {}) });
  // ★ 返回形态对齐 /clip/probe 的 `{data: ...}`（前端 apiFetch 解包后 r.data 即数组本身）
  //   model 用**实际使用**的档位（请求 small 但本机只有 base 时会自动降级，如实回报）
  return res.json({ data: r.cues, ok: true, model: r.model, requestedModel: r.requestedModel, language: r.language, source: r.source });
});

// POST /api/plugin/clip-mode/talking-cut —— 智能剪口播（P2-5）
//
// body: { conversationId, clipId, minSilence?, padding?, removeFillers?, model?, language?, apply? }
//
// 流程：按片段范围截取音轨 → 本地 whisper 识别 → 规划静音/语气词删除 → 切成多个保留片段 →
// 把字幕/画中画/贴纸/音频/特效层按删除量整体前移（ripple）→ 落盘。
// ★ 只处理恒定倍速、原声未关闭、无段级关键帧的片段（否则切分会错位/重复，直接拒绝并说明原因）。
// ★ apply=false 只出计划不落盘（给未来做预览弹窗留的口子；当前 UI 直接 apply）。
router.post('/talking-cut', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const clipId = String(req.body?.clipId || '').trim();
  if (!conversationId || !clipId) return res.status(400).json({ error: 'conversationId 与 clipId 为必填项' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  const idx = project.clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return res.status(404).json({ error: `片段 ${clipId} 不存在` });
  const seg = project.clips[idx];

  // 先做"切了会错"的守卫（在跑 ASR 之前，别让用户等几十秒才看到报错）
  if (seg.speedCurve?.length) {
    return res.status(409).json({ error: '该片段用了曲线变速：时间映射非线性，切开后音画会错位。请先改成恒定速度' });
  }
  if (seg.kenburns || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(seg.file)) {
    return res.status(409).json({ error: '图片/定格片段没有口播音频，无法智能剪口播' });
  }
  if (seg.audioFile) {
    return res.status(409).json({ error: '该片段换成配音文件了：配音与画面时间轴的口径未验证，暂不支持自动剪口播' });
  }
  if (seg.keepOriginalAudio === false) {
    return res.status(409).json({ error: '该片段已关闭原声：没有可识别的语音（如需按配音剪，请先处理配音轨）' });
  }
  if (seg.keyframes?.length || seg.mask?.keyframes?.length) {
    return res.status(409).json({ error: '该片段带段级/蒙版关键帧：切开后动画会在每段重复。请先清除关键帧再剪' });
  }

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: ff.error, need: 'ffmpeg', hint: '可调用 media_install_ffmpeg。' });

  // 片段在成片时间轴上的起点 + 源文件真实时长（定位靠它们，猜错会 ripple 到错误位置）
  const durations = await probeProjectDurations(ff.ffprobe, project);
  let clipStart = 0;
  for (let i = 0; i < idx; i++) {
    const prev = project.clips[i];
    const raw = durations[prev.id] ?? durations[prev.file] ?? 0;
    const d = prev.kenburns ? (prev.kenburns.duration || 0) : (raw > 0 ? segmentDuration(prev, raw) : 0);
    if (!(d > 0)) {
      return res.status(409).json({ error: `前序片段 ${i + 1} 时长未知（素材可能被移动），无法计算时间轴位置` });
    }
    clipStart += d;
  }
  const sourceDur = durations[seg.id] ?? durations[seg.file] ?? 0;
  const trimStart = Math.max(0, Number(seg.trimStart ?? 0));
  const trimEnd = Number(seg.trimEnd ?? sourceDur);
  if (!(trimEnd > trimStart + 0.1)) {
    return res.status(409).json({ error: '无法确定该片段的裁剪范围（素材时长未知或区间为空）' });
  }

  // 只转写片段范围（源文件时间）—— 长素材不整条跑
  const asr = await transcribeClipAudio({
    input: seg.file,
    model: req.body?.model,
    language: req.body?.language,
    ss: trimStart,
    duration: trimEnd - trimStart,
  });
  if (!asr.ok) {
    return res.status(asr.status || 500).json({ error: asr.error, ...(asr.extra || {}) });
  }
  // whisper 时间是**截取区间内**的相对时间 → 加回 trimStart 变回源文件时间
  const cues = (asr.cues || []).map((c) => ({
    text: c.text,
    start: Number((c.start + trimStart).toFixed(3)),
    end: Number((c.end + trimStart).toFixed(3)),
  }));

  const plan = planTalkingCut(
    cues,
    { start: trimStart, end: trimEnd },
    {
      ...(req.body?.minSilence != null ? { minSilence: Number(req.body.minSilence) } : {}),
      ...(req.body?.padding != null ? { padding: Number(req.body.padding) } : {}),
      ...(req.body?.removeFillers != null ? { removeFillers: req.body.removeFillers !== false } : {}),
    },
  );
  if (!plan.ok) return res.status(422).json({ error: plan.error, cues: cues.length });

  const base = {
    ok: true,
    cues: cues.length,
    cuts: plan.cuts,
    keptSec: plan.speechSec,
    removedSec: plan.removedSec,
    model: asr.model,
  };
  if (!plan.cuts.length) {
    const minSilence = Number(req.body?.minSilence ?? TALKING_CUT_DEFAULTS.minSilence);
    return res.json({
      ...base, applied: false,
      note: `没有可剪的静音（阈值 ${minSilence}s，检测到 ${plan.keeps.length} 段连续语音）`,
    });
  }
  if (req.body?.apply === false) {
    return res.json({ ...base, applied: false, keeps: plan.keeps });
  }

  // 新片段 id：保证与工程内已有 id 不撞
  const used = new Set(project.clips.map((c) => c.id));
  const makeId = (i: number) => {
    const baseId = `${seg.id}-k${i + 1}`;
    let id = baseId;
    let n = 1;
    while (used.has(id)) id = `${baseId}-${n++}`;
    used.add(id);
    return id;
  };
  const split = splitSegmentByKeeps(seg, plan.keeps, makeId);
  if (!split.ok) return res.status(409).json({ error: split.error });

  // 删除区间换算到成片时间，搬动图层（字幕/画中画/贴纸/音频/特效）
  const removals = sourceCutsToFilm(plan.cuts, {
    trimStart,
    speed: seg.speed ?? 1,
    clipStartFilm: clipStart,
  });
  project.clips.splice(idx, 1, ...split.segments);
  const ripple = rippleTimelineLayers(project, removals);
  project.updatedAt = Date.now();
  writeClipProject(conversationId, project);

  return res.json({
    ...base,
    applied: true,
    segments: split.segments.length,
    shiftedLayers: ripple.shifted,
    droppedLayers: ripple.dropped,
    note: `切掉 ${plan.cuts.length} 处（静音/语气词），共 ${plan.removedSec.toFixed(1)}s；片段分成 ${split.segments.length} 段`,
  });
});

// POST /api/plugin/clip-mode/reframe-vertical —— 智能竖屏重构（P2-4）
//
// body: { conversationId, clipId, targetAspect?: '9:16'|'1:1'|'16:9', zoom?,
//         mode?: 'static'|'track' }
//
// ★ 默认 static：**静态人脸居中裁切，不是跟踪**（旧行为，逐字节不变）。
//   mode=track：额外生成平滑的人脸中心轨迹写进 `crop.track`，渲染时用 crop 的 x/y
//   表达式做分段线性移动裁切。非 AI（Haar 正脸抽样），侧脸/遮挡会漏检。
// ★ 检测不到人脸 → 服务层回退画面中心并带 warning（如实告知，不静默成功）。
// ★ 目标画幅与工程输不一致时只在 note 里提示，绝不擅自改 output（输出规格是建项目时定的）。
router.post('/reframe-vertical', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const clipId = String(req.body?.clipId || '').trim();
  if (!conversationId || !clipId) return res.status(400).json({ error: 'conversationId 与 clipId 为必填项' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const modeRaw = String(req.body?.mode ?? 'static').trim();
  if (modeRaw !== 'static' && modeRaw !== 'track') {
    return res.status(400).json({ error: `mode 无效：${modeRaw}（可选 static / track）` });
  }
  const mode = modeRaw as 'static' | 'track';
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  const seg = project.clips.find((c) => c.id === clipId);
  if (!seg) return res.status(404).json({ error: `片段 ${clipId} 不存在` });

  if (seg.kenburns || IMAGE_EXT_RE.test(seg.file)) {
    return res.status(409).json({ error: '图片/定格片段没有可检测的人脸（智能竖屏只支持视频段）' });
  }
  if (seg.rotate || seg.flip) {
    // 渲染时 rotate/flip 在 crop 之前作用于画面，按原始素材算出的裁切坐标会错位
    return res.status(409).json({ error: '该片段带旋转/镜像：在旋转/镜像后的画面上手工裁切更可靠（自动裁切会错位）' });
  }
  const aspectKey = String(req.body?.targetAspect ?? '9:16').trim();
  const targetAspect = parseTargetAspect(aspectKey);
  if (targetAspect == null) {
    return res.status(400).json({ error: `targetAspect 无效：${aspectKey}（可选 9:16 / 1:1 / 16:9）` });
  }

  // 只在片段实际使用的区间里抽样：长素材的其它镜头（别的人/没人）不该拉偏构图
  const trimStart = Math.max(0, Number(seg.trimStart ?? 0));
  const trimEnd = Number(seg.trimEnd ?? 0);
  const r = await reframeVertical({
    file: seg.file,
    targetAspect,
    mode,
    ...(req.body?.zoom == null ? {} : { zoom: Number(req.body.zoom) }),
    start: trimStart,
    ...(trimEnd > trimStart ? { duration: trimEnd - trimStart } : {}),
  });
  if (!r.ok || !r.crop) {
    return res.status(r.status || 500).json({
      error: r.error,
      ...(r.need ? { need: r.need } : {}),
      ...(r.hint ? { hint: r.hint } : {}),
    });
  }

  // 与 normalizeCrop 同口径：整幅无裁剪 = 不写 crop
  const fullFrame = r.crop.w >= 0.999 && r.crop.h >= 0.999;
  const track = mode === 'track' && (r.track?.length ?? 0) >= 2 ? r.track : undefined;
  if (fullFrame) delete seg.crop;
  else {
    seg.crop = {
      x: r.crop.x, y: r.crop.y, w: r.crop.w, h: r.crop.h,
      ...(track ? { track } : {}),
    };
  }
  project.updatedAt = Date.now();
  writeClipProject(conversationId, project);

  const faceFrames = r.faces?.length ?? 0;
  const parts: string[] = [];
  parts.push(fullFrame
    ? '目标画幅与素材一致，无需裁切（已清除该片段的裁剪）'
    : track
      ? `已写入动态跟随裁切（${track.length} 个轨迹点；非 AI 人脸跟随，侧脸可能漏检）`
      : mode === 'track'
        ? `已写入静态裁切窗口 ${r.crop.w.toFixed(2)}×${r.crop.h.toFixed(2)}（动态跟随不可用，已回退静态）`
        : `已写入裁切窗口 ${r.crop.w.toFixed(2)}×${r.crop.h.toFixed(2)}（静态裁切，非跟踪）`);
  parts.push(`抽样 ${r.sampleCount ?? 0} 帧，${faceFrames} 帧检到人脸`);
  if (r.confidence != null && faceFrames > 0) parts.push(`检脸占比 ${Math.round(r.confidence * 100)}%`);

  // 画幅一致性提示：只提示，不改工程输出（规格建项目时确定）
  const [outW, outH] = String(project.output?.size || '').split('x').map(Number);
  const outAspect = outW > 0 && outH > 0 ? outW / outH : 0;
  if (outAspect > 0 && Math.abs(outAspect - targetAspect) / targetAspect > 0.02) {
    parts.push(`注意：工程输出 ${project.output.size} 的画幅是 ${outAspect.toFixed(3)}，与目标 ${aspectKey}（${targetAspect.toFixed(3)}）不一致 —— 本次只改了片段裁切，未改输出；要竖屏成片请在新建项目时选 1080x1920`);
  }
  if (r.warning) parts.push(r.warning);

  return res.json({
    ok: true,
    mode,
    crop: fullFrame ? null : { ...r.crop, ...(track ? { track } : {}) },
    faces: r.faces || [],
    sampleCount: r.sampleCount,
    confidence: r.confidence,
    ...(track ? { track, trackPoints: track.length } : {}),
    ...(r.warning ? { warning: r.warning } : {}),
    note: parts.join('；'),
    width: r.width,
    height: r.height,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 智能抠像（P2-1）—— **运行时骨架**：只探测 + 生成蒙版，未接渲染
// ════════════════════════════════════════════════════════════════════════════

// GET /api/plugin/clip-mode/matte/probe —— Python / onnxruntime / 模型探测
// ★ 结果必须真实：缺模型就是 ok:false + 可执行指引（模型放哪、约多大、侧车 JSON 示例），
//   绝不自动下载、绝不假装可用。
router.get('/matte/probe', async (_req: Request, res: Response) => {
  try {
    const r = await probeMatteRuntime();
    return res.json({
      ok: r.ok,
      python: r.python,
      modelId: r.modelId,
      modelPath: r.modelPath,
      preset: r.preset,
      guidance: r.guidance,
      onnxruntime: r.onnxruntime,
    });
  } catch (e: unknown) {
    return res.status(500).json({
      ok: false,
      python: '', modelId: '', modelPath: '', preset: null, onnxruntime: '',
      guidance: [`探测失败：${e instanceof Error ? e.message : String(e)}`],
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// POST /api/plugin/clip-mode/matte/apply —— 骨架阶段**不提供**渲染应用
// ★ 不把半成品伪装成可用：抠像要产出透明视频/替换片段画面，需要渲染管线接入，
//   本轮明确未做。前端据此不展示可用按钮。
router.post('/matte/apply', (_req: Request, res: Response) => {
  return res.status(501).json({
    ok: false,
    skeleton: true,
    error: '骨架阶段：仅运行时探测与蒙版生成，尚未接入渲染',
  });
});

// POST /api/plugin/clip-mode/tts —— 字幕转配音（文本 → 定时音频层）
//
// ★ 与 /asr 对称：ASR 是「语音 → 字幕」，这里是「字幕 → 语音」。
//   实现直接调 clip_project 的 add_tts —— 那个 op 在执行器层（合成要起 TTS、量时长要 ffprobe，
//   都是 IO，不进纯函数 applyClipOp）；这里只做 HTTP 薄壳，避免前端为配一句音绕去对话。
router.post('/tts', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!text) return res.status(400).json({ error: 'text 必填（要读出来的台词）' });
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(conversationId) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const r = await executeApiTool('clip_project', {
    op: 'add_tts',
    text,
    ...(req.body?.start == null ? {} : { start: Number(req.body.start) }),
    ...(req.body?.voice ? { voice: String(req.body.voice) } : {}),
    ...(req.body?.character ? { character: String(req.body.character) } : {}),
    ...(req.body?.rate == null ? {} : { rate: Number(req.body.rate) }),
    ...(req.body?.volume == null ? {} : { volume: Number(req.body.volume) }),
    ...(req.body?.subtitle === true ? { subtitle: true } : {}),
  }, undefined, undefined, undefined, conversationId);
  if (r.isError) return res.status(500).json({ error: r.content?.[0]?.text || '配音失败' });
  try {
    return res.json(JSON.parse(r.content?.[0]?.text || '{}'));
  } catch {
    return res.json({ ok: true, raw: r.content?.[0]?.text || '' });
  }
});

// POST /api/plugin/clip-mode/multicam —— 多机位编排（声音对齐 + 一键交替切换）
//
// body: { conversationId, files: string[], switchEvery?, duration?, start?, switchOnBeat? }
//
// ★ 薄壳：真正的对齐/规划/拍平都在 clip_project 的 add_multicam（执行器层），
//   与智能体调工具走**同一条路径** —— 避免 UI 与模型两套实现漂移。
// ★ switchOnBeat=true：切点跟第 1 个机位的音频节拍（不足时回退等间隔，warnings 说明原因）。
// ★ 这里只做 HTTP 级校验（会话、工程、文件存在性），错误直接给可读中文。
router.post('/multicam', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const files = (Array.isArray(req.body?.files) ? req.body.files : [])
    .map((f: unknown) => String(f ?? '').trim())
    .filter(Boolean);
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (files.length < 2) return res.status(400).json({ error: '多机位至少需要勾选 2 个视频文件' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  if (!readClipProject(conversationId)) return res.status(404).json({ error: '工程不存在（先在剪辑工作台建工程）' });
  for (let i = 0; i < files.length; i++) {
    try {
      if (!fs.statSync(files[i]).isFile()) return res.status(400).json({ error: `机位 ${i + 1} 不是文件：${files[i]}` });
    } catch {
      return res.status(400).json({ error: `机位 ${i + 1} 文件不存在：${files[i]}` });
    }
  }

  const r = await executeApiTool('clip_project', {
    op: 'add_multicam',
    files,
    ...(req.body?.switchEvery == null ? {} : { switchEvery: Number(req.body.switchEvery) }),
    ...(req.body?.duration == null ? {} : { duration: Number(req.body.duration) }),
    ...(req.body?.start == null ? {} : { start: Number(req.body.start) }),
    ...(req.body?.switchOnBeat === true ? { switchOnBeat: true } : {}),
  }, undefined, undefined, undefined, conversationId);
  if (r.isError) return res.status(500).json({ error: r.content?.[0]?.text || '多机位生成失败' });
  try {
    return res.json(JSON.parse(r.content?.[0]?.text || '{}'));
  } catch {
    return res.json({ ok: true, raw: r.content?.[0]?.text || '' });
  }
});

// POST /api/plugin/clip-mode/multicam/rebuild —— 手动切换机位（原地重建组内片段）
//
// body: { conversationId, groupId, slotAngles: number[] }
//
// ★ 薄壳：校验存在性 → 纯函数重建 → 写盘；组时长不变，其他片段与图层不动。
router.post('/multicam/rebuild', (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const groupId = String(req.body?.groupId || '').trim();
  const rawSlots = req.body?.slotAngles;
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!groupId) return res.status(400).json({ error: 'groupId 必填' });
  if (!Array.isArray(rawSlots)) return res.status(400).json({ error: 'slotAngles 必须是机位下标的数组' });
  const slotAngles = rawSlots.map((v: unknown) => Number(v));
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在（先在剪辑工作台建工程）' });
  if (!(project.multicamGroups || []).some((g) => g.id === groupId)) {
    return res.status(404).json({ error: `多机位组不存在：${groupId}` });
  }

  const r = rebuildMulticamGroup(project, groupId, slotAngles);
  if (!r.ok) return res.status(400).json({ error: r.error });
  writeClipProject(conversationId, r.project);
  return res.json({ ok: true, groupId: r.groupId, segments: r.segments, note: r.note });
});

// POST /api/plugin/clip-mode/multicam/boundaries —— 逐切点拖拽（按新切点原地重建组内片段）
//
// body: { conversationId, groupId, boundariesSec: number[], slotAngles?: number[] }
//
// ★ 薄壳：服务层 normalizeMulticamBoundaries 规整（越界/过近/乱序）→ 更新组 → rebuildMulticamGroup。
// ★ 组时长不变；其他片段与图层不动。等间隔组也可借此转为边界模式（边界数需与原片段数匹配）。
router.post('/multicam/boundaries', (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const groupId = String(req.body?.groupId || '').trim();
  const rawBoundaries = req.body?.boundariesSec;
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!groupId) return res.status(400).json({ error: 'groupId 必填' });
  if (!Array.isArray(rawBoundaries)) return res.status(400).json({ error: 'boundariesSec 必须是切点的秒数数组' });
  const slotAngles = req.body?.slotAngles == null
    ? undefined
    : Array.isArray(req.body.slotAngles)
      ? req.body.slotAngles.map((v: unknown) => Number(v))
      : null;
  if (slotAngles === null) return res.status(400).json({ error: 'slotAngles 必须是机位下标的数组' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在（先在剪辑工作台建工程）' });
  if (!(project.multicamGroups || []).some((g) => g.id === groupId)) {
    return res.status(404).json({ error: `多机位组不存在：${groupId}` });
  }

  const r = applyMulticamBoundaries(
    project,
    groupId,
    rawBoundaries.map((v: unknown) => Number(v)),
    slotAngles,
  );
  if (!r.ok) return res.status(400).json({ error: r.error });
  writeClipProject(conversationId, r.project);
  return res.json({
    ok: true,
    groupId: r.groupId,
    boundaries: r.boundaries,
    slotAngles: r.slotAngles,
    segments: r.segments,
    warnings: r.warnings,
    note: r.note,
  });
});

// GET /api/plugin/clip-mode/recipes —— 配方清单（内置 + 自建）
//
// ★ 与对话里的 op=list_recipes 同源（services/clip-recipe-store），UI 与智能体看到的是同一份。
router.get('/recipes', (_req: Request, res: Response) => {
  const { recipes, errors } = listAllRecipes();
  return res.json({
    ok: true,
    recipes: recipes.map((r) => ({
      id: r.id, name: r.name, desc: r.desc, builtin: !!r.builtin,
      steps: r.steps.length, params: r.params || [],
    })),
    ...(errors.length ? { warnings: errors } : {}),
  });
});

// POST /api/plugin/clip-mode/recipe/apply  body: { conversationId, recipe, params? }
router.post('/recipe/apply', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const recipe = String(req.body?.recipe || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!recipe) return res.status(400).json({ error: 'recipe 必填（配方 id）' });
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(conversationId) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const params = (req.body?.params && typeof req.body.params === 'object') ? req.body.params : {};
  const r = await executeApiTool('clip_project', { op: 'apply_recipe', recipe, params }, undefined, undefined, undefined, conversationId);
  if (r.isError) return res.status(400).json({ error: r.content?.[0]?.text || '套用失败' });
  try {
    return res.json(JSON.parse(r.content?.[0]?.text || '{}'));
  } catch {
    return res.json({ ok: true, raw: r.content?.[0]?.text || '' });
  }
});

// GET /api/plugin/clip-mode/frame?conversationId=xxx&t=1.234
//
// **实时预览帧**：拖动播放头时前端按 t 请求，返回 PNG 二进制。
//
// ★★★ 为什么用 GET + 直接返回图片（2026-10-07「边剪辑边预览」）：
//   <img src> 能直接消费二进制，无需前端做 base64 转换 → 拖动时更跟得上；
//   返回 JSON+base64 会多一层 33% 体积和一次解码。
//   ★ 缓存由服务端的 clip-preview 负责（含工程指纹），并用 Cache-Control 让浏览器也缓存
//     —— 同一帧反复拖动不会重复起 ffmpeg。
router.get('/frame', async (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  const t = Number(req.query.t);
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!Number.isFinite(t) || t < 0) return res.status(400).json({ error: 't 必须是非负数字（秒）' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (!project.clips.length) return res.status(409).json({ error: '工程还没有片段' });

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（媒体功能需要它）' });

  // 每段真实时长（并发探测，供时间轴定位）
  const durations = await probeProjectDurations(ff.ffprobe, project);

  const out = await renderPreviewFrame({ project, timeSec: t, durations, ffmpeg: ff.ffmpeg });
  if (!out.ok || !out.png) return res.status(500).json({ error: out.error || '取帧失败' });
  res.setHeader('Content-Type', 'image/png');
  // ★★ 必须 no-store 而不是 max-age（2026-10-07 实测踩到）：
  //   浏览器缓存只认 **URL**，而本接口的 URL 只有 conversationId + t ——
  //   同一时间点改了参数（调色/蒙版…）后 URL 没变 → 浏览器直接回**旧图**，
  //   表现是「改了参数预览不动」（前端看起来像实时预览坏了）。
  //   服务端自己的缓存已带工程指纹（clip-preview 的 projectFingerprint），
  //   所以这里禁掉浏览器缓存不影响性能。
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Segment-Index', String(out.segmentIndex || 0));
  res.setHeader('X-Frame-Cached', out.cached ? '1' : '0');
  return res.end(out.png);
});

// GET /api/plugin/clip-mode/proxy?conversationId=xxx&i=段下标&v=工程版本
//
// **段代理预览**（P0-10）：返回某一段的 480p 代理 mp4（命中回文件，未命中同步生成）。
//
// ★★★ 缓存失效口径：真实缓存键由服务端按「段指纹 + 代理画幅 + fps」计算
//   （ensureSegmentProxy → proxyCacheKey）—— 改一段只有那一段的键变。
//   URL 里的 v= 是**缓存穿透保险**：前端在段指纹变化时换 URL，
//   即使中间有浏览器/代理缓存层也不会拿旧片骗人（与 /frame 的 v= 同一双保险手法）。
// ★ Cache-Control no-store：与 /frame 同一理由 —— 浏览器缓存层不认识段指纹，
//   真正的缓存由服务端磁盘 LRU（clip-proxy 的 pruneProxyCache）负责。
router.get('/proxy', async (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  const i = Math.round(Number(req.query.i));
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!Number.isInteger(i) || i < 0) return res.status(400).json({ error: '段下标 i 必须是非负整数' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (!project.clips.length) return res.status(409).json({ error: '工程还没有片段' });
  if (i >= project.clips.length) return res.status(404).json({ error: `段下标越界（共 ${project.clips.length} 段）` });

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（代理预览需要它）' });

  const probe = await buildProxyProbeRow(ff.ffprobe, project);
  const out = await ensureSegmentProxy({ project, segIndex: i, probe, ffmpeg: ff.ffmpeg });
  if (!out.ok || !out.file) return res.status(500).json({ error: out.error || '代理生成失败' });
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Proxy-Cached', out.cached ? '1' : '0');
  res.setHeader('X-Proxy-Key', out.key || '');
  return res.sendFile(out.file);
});

// GET /api/plugin/clip-mode/layer-media?conversationId=..&path=..
//
// **矢量图层素材流**（P1-10）：贴纸/画中画由前端 DOM 实时合成，需要浏览器能直接播的 URL。
// ★ 只放行**当前工程真实引用**的路径（services/clip-layer-media 白名单），
//   不放开"任意本机路径"——否则浏览器侧的 <img>/<video> 等于读整台机器。
// ★ sendFile 原生支持 Range/206：画中画 <video> 可边下边播、任意 seek。
router.get('/layer-media', (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  const p = String(req.query.path || '').trim();
  if (!conversationId || !p) return res.status(400).json({ error: 'conversationId 与 path 为必填项' });
  if (p.length > 1000) return res.status(400).json({ error: 'path 过长' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (!isProjectSourcePath(project, p)) return res.status(403).json({ error: '该路径未被当前工程引用' });
  try {
    if (!fs.statSync(p).isFile()) return res.status(404).json({ error: '文件不存在' });
  } catch {
    return res.status(404).json({ error: '文件不存在' });
  }
  return res.sendFile(path.resolve(p));
});

// POST /api/plugin/clip-mode/beat-cut  body: { conversationId, everyNth?, transition?, minPiece? }
//
// **一键卡点**：分析 BGM 节拍 → 在每个拍点切开时间轴（后一段可挂转场）。
//
// ★ 为什么"节拍不明显"要直接拒绝：自研检测器只抓鼓点/重音，连绵弦乐会漏。
//   硬凑出一堆点让用户逐个删，比直接说"换一首"糟糕得多（与 clip-beats 的 MIN_BEATS 同一条纪律）。
router.post('/beat-cut', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (!project.clips.length) return res.status(409).json({ error: '工程还没有片段' });

  const bgmFile = String(req.body?.bgmFile || project.bgm?.file || '').trim();
  if (!bgmFile) return res.status(409).json({ error: '还没有 BGM —— 卡点要基于一首音乐，先把音乐设为 BGM' });
  if (!fs.existsSync(bgmFile)) return res.status(409).json({ error: 'BGM 文件不存在（可能被移动了）' });

  const txType = String(req.body?.transition || '').trim();
  if (txType && !TRANSITIONS.some((t) => t.id === txType)) {
    return res.status(400).json({ error: `未知转场：${txType}` });
  }

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（节拍分析需要它）' });

  const beat = await analyzeBeats(ff.ffmpeg, bgmFile);
  if (!beat.ok) return res.status(422).json({ error: beat.error });
  if (!beat.beats.length) {
    return res.status(422).json({ error: '这段音乐节拍不明显（检出不到 6 个拍点），建议换一首鼓点清晰的' });
  }

  const durations = await probeProjectDurations(ff.ffprobe, project);
  const plan = planBeatCut(project, durations, {
    beatTimes: beat.beats,
    ...(req.body?.everyNth == null ? {} : { everyNth: Number(req.body.everyNth) }),
    ...(req.body?.minPiece == null ? {} : { minPieceSec: Number(req.body.minPiece) }),
    ...(txType ? { transition: { type: txType, duration: req.body?.transitionDuration == null ? 0.15 : Number(req.body.transitionDuration) } } : {}),
  });
  if (!plan.cuts) {
    return res.status(409).json({ error: '没有可切的拍点（拍点都落在段边界附近，或每段都太短）' });
  }

  const next = { ...project, clips: plan.clips, updatedAt: Date.now() };
  writeClipProject(conversationId, next);
  return res.json({
    ok: true, cuts: plan.cuts, skipped: plan.skipped, dropped: plan.dropped,
    bpm: beat.bpm, beats: beat.beats.length, note: plan.note,
  });
});

// POST /api/plugin/clip-mode/freeze  body: { conversationId, timeSec }
//
// **定格抽帧**：把成片时间轴上某一时刻的画面抽成 PNG，落到会话素材目录并登记素材库，
// 返回绝对路径 —— 前端拿它插入一个图片段（图片段 + kenburns.direction="none" 就是"静止 N 秒"）。
//
// ★ 为什么落盘而不是直接回图：定格要变成**时间轴上的一个可编辑片段**（能改时长、能前移后移），
//   内存里的字节没法被工程文件引用；落盘 + 登记 conversation_file 后它同时出现在素材库里。
// ★ 抽的是**素材原始帧**，不是套过滤镜后的画面：新片段继承源段的调色/特效/裁剪/mask，
//   成片观感与定格前一致，而同一张 PNG 还能复用到别处。
router.post('/freeze', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const t = Number(req.body?.timeSec);
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!Number.isFinite(t) || t < 0) return res.status(400).json({ error: 'timeSec 必须是非负数字（秒）' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (!project.clips.length) return res.status(409).json({ error: '工程还没有片段' });

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（媒体功能需要它）' });

  const durations = await probeProjectDurations(ff.ffprobe, project);
  const loc = locateTimeline(project, t, durations);
  if (!loc) return res.status(409).json({ error: '该时间点不在成片范围内' });
  const seg = project.clips[loc.segIndex];
  if (seg.kenburns) return res.status(409).json({ error: '这一刻时间轴上是静态图片，不需要定格' });
  const raw = durations[seg.id] ?? durations[seg.file] ?? 0;
  if (raw <= 0) return res.status(409).json({ error: '该段素材时长未知（文件可能已被移动）' });

  // 段内输出偏移 → 素材内时间（变速后时长 = 素材时长 ÷ speed）
  const inSource = Math.max(0, Math.min(raw, (seg.trimStart ?? 0) + loc.offsetInSeg * loc.speed));

  const dirInfo = ensureArtifactDirFor({ conversationId, category: 'upload' });
  const fileName = `freeze-${Date.now().toString(36)}.png`;
  const outFile = path.join(dirInfo.dir, fileName);
  const r = await runFfmpeg(ff.ffmpeg, ['-y', '-v', 'error', '-ss', inSource.toFixed(3), '-i', seg.file, '-frames:v', '1', outFile], 60000);
  if (!r.ok) return res.status(500).json({ error: `抽帧失败：${r.stderr.slice(-300)}` });
  let bytes = 0;
  try { bytes = fs.statSync(outFile).size; } catch { bytes = 0; }
  if (!bytes) return res.status(500).json({ error: '抽帧产物为空' });

  const fileId = `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(fileId, conversationId, String(req.user?.userId || 'guest'), null, fileName, outFile, 'upload', 'image/png', bytes, 'user', null, Date.now());

  return res.json({
    ok: true,
    name: fileName,
    path: outFile,
    bytes,
    // 源段信息：前端据此把调色/特效/裁剪/mask 继承到新片段，观感才接得上
    from: { clipId: seg.id, offsetInSeg: Number(loc.offsetInSeg.toFixed(3)), sourceSec: Number(inSource.toFixed(3)) },
  });
});

// GET /api/plugin/clip-mode/effect-preview?conversationId=xxx&kind=color&id=warm&w=320&h=180
//
// **效果卡片缩略图**：调色/蒙版/字幕模板出 jpg，转场出 1.2s 循环 mp4。
//
// ★★★ 为什么样例来自"当前工程"而不是固定样张（2026-10-21）：
//   用户是在自己这条片子上去挑效果的 —— 拿同一帧自家画面做对比，比通用风景样张
//   更能判断"这个滤镜上我的脸会不会发灰"。取帧失败/没有工程时才退到合成测试图。
// ★ 与 /frame 一样用 no-store：URL 里没有工程指纹，浏览器缓存会拿旧图骗人；
//   真正的缓存由服务端落盘（键含样例文件 mtime），重复打开面板不会重复起 ffmpeg。
router.get('/effect-preview', async (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  const kind = String(req.query.kind || '').trim() as 'color' | 'fx' | 'mask' | 'style' | 'transition';
  const id = String(req.query.id || '').trim();
  const w = Math.max(120, Math.min(640, Math.round(Number(req.query.w) || 320)));
  const h = Math.max(68, Math.min(640, Math.round(Number(req.query.h) || 180)));
  if (!kind || !id) return res.status(400).json({ error: 'kind 与 id 必填' });
  if (!['color', 'fx', 'mask', 'style', 'transition'].includes(kind)) {
    return res.status(400).json({ error: `未知 kind：${kind}` });
  }
  if (conversationId && !conversationExists(conversationId)) {
    return res.status(404).json({ error: '会话不存在' });
  }

  // 样例：工程里前两段不同素材的同位置帧（转场需要两个不同画面）
  let sample: { file: string; atSec: number } | null = null;
  let sampleB: { file: string; atSec: number } | null = null;
  if (conversationId) {
    try {
      const project = readClipProject(conversationId);
      const picks = (project?.clips || []).filter((c) => !!c.file);
      if (picks[0]) sample = { file: picks[0].file, atSec: (picks[0].trimStart ?? 0) + 0.5 };
      const other = picks.find((c) => c.file !== picks[0]?.file);
      if (other) sampleB = { file: other.file, atSec: (other.trimStart ?? 0) + 0.5 };
    } catch { /* 工程读不出来就退合成样张，不该因此看不到缩略图 */ }
  }

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用（效果预览需要它）' });

  const out = await ensureEffectPreview({ kind, id, ffmpeg: ff.ffmpeg, sample, sampleB, width: w, height: h });
  if (!out.ok || !out.file) return res.status(500).json({ error: out.error || '预览生成失败' });
  res.setHeader('Content-Type', out.mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Preview-Cached', out.cached ? '1' : '0');
  return res.sendFile(out.file);
});

// POST /api/plugin/clip-mode/beats  body: { conversationId, path }
//
// **智能踩点**：分析一段音频（通常是 BGM）的节拍点，前端据此自动切分片段。
//
// ★ 安全边界与 /waveform 一致：path 必须是本会话工程引用或素材库登记的文件，
//   否则这个接口就成了"任意路径音频解析器"。
// ★ 结果少于 6 个点会返回空数组 + 说明 —— 硬凑出来的点会让用户切出一堆碎段。
router.post('/beats', async (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  const p = String(req.body?.path || '').trim();
  if (!conversationId || !p) return res.status(400).json({ error: 'conversationId 与 path 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });

  const project = readClipProject(conversationId);
  const referenced =
    !!project &&
    (project.clips.some((c) => c.file === p || c.audioFile === p) ||
      project.bgm?.file === p ||
      (project.audios || []).some((a) => a.file === p));
  let registered = false;
  try {
    registered = !!db.prepare('SELECT id FROM conversation_file WHERE conversation_id = ? AND path = ?').get(conversationId, p);
  } catch { /* 表查询失败按未登记处理 */ }
  if (!referenced && !registered) return res.status(403).json({ error: '该文件不属于当前会话（未在工程或素材库中引用）' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: '文件不存在' });

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用' });

  const r = await analyzeBeats(ff.ffmpeg, p);
  if (!r.ok) return res.status(500).json({ error: r.error || '节拍分析失败' });
  if (!r.beats.length) {
    return res.json({ ok: true, beats: [], bpm: 0, duration: r.duration, note: '这段音频的节拍不明显（少于 6 个点），不做自动切分' });
  }
  return res.json({ ok: true, beats: r.beats, bpm: r.bpm, duration: r.duration });
});

// GET /api/plugin/clip-mode/project?conversationId=xxx
router.get('/project', (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  return res.json({ exists: !!project, project });
});

// PUT /api/plugin/clip-mode/project  body: { conversationId, project }
//
// ★ 这里**不做编辑语义校验**：写入的是前端从 GET 拿到的工程 + 本地改动的整体覆盖，
//   结构校验由 services/clip-project.ts 的 op 层负责（前端保存前已用同一套规则）。
//   服务端只做"能不能解析成合法工程"的底线校验 —— 落一份坏 json 比报错更难查。
router.put('/project', (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = req.body?.project;
  if (!project || typeof project !== 'object') return res.status(400).json({ error: 'project 必填' });
  if (!Array.isArray((project as { clips?: unknown }).clips) || !Array.isArray((project as { texts?: unknown }).texts)) {
    return res.status(400).json({ error: 'project 结构非法（需要 clips/texts 数组）' });
  }
  const file = writeClipProject(conversationId, project as Parameters<typeof writeClipProject>[1]);
  return res.json({ ok: true, file });
});

// GET /api/plugin/clip-mode/waveform?conversationId=xxx&path=...&w=600&h=64
//
// 音频波形图（PNG）—— BGM 轨与片段块的背景波形。
//
// ★★★ 安全边界（这不是普通的图片接口）：
//   path 是本机绝对路径，绝不能"给什么读什么"—— 必须先校验该路径确实被本会话工程引用
//   （clips/audioFile/bgm/overlays）或登记在会话素材库（conversation_file），否则直接 403。
//   否则任意路径探测/整盘读文件就开了个口子。
// ★ 缓存按「路径 + mtime + 尺寸」落盘：音频没变就不再起 ffmpeg（波形生成不便宜）。
router.get('/waveform', async (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  const p = String(req.query.path || '').trim();
  const w = Math.max(60, Math.min(2000, Math.round(Number(req.query.w) || 600)));
  const h = Math.max(20, Math.min(200, Math.round(Number(req.query.h) || 64)));
  if (!conversationId || !p) return res.status(400).json({ error: 'conversationId 与 path 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });

  // 引用校验：工程引用 or 会话素材库登记，二满足其一
  const project = readClipProject(conversationId);
  const referenced =
    !!project &&
    (project.clips.some((c) => c.file === p || c.audioFile === p) ||
      project.bgm?.file === p ||
      (project.overlays || []).some((o) => o.file === p) ||
      (project.audios || []).some((a) => a.file === p));
  let registered = false;
  try {
    registered = !!db.prepare('SELECT id FROM conversation_file WHERE conversation_id = ? AND path = ?').get(conversationId, p);
  } catch { /* 表查询失败按未登记处理（引用校验仍可能通过） */ }
  if (!referenced && !registered) return res.status(403).json({ error: '该文件不属于当前会话（未在工程或素材库中引用）' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: '文件不存在' });

  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: 'ffmpeg 不可用' });

  const mtime = fs.statSync(p).mtimeMs;
  const crypto = await import('node:crypto');
  const cacheKey = crypto.createHash('sha1').update(`${p}|${mtime}|${w}x${h}`).digest('hex').slice(0, 24);
  const cacheFile = path.join(tmpdir(), `yz-wave-${cacheKey}.png`);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.end(fs.readFileSync(cacheFile));
  }
  const r = await runFfmpeg(ff.ffmpeg, ['-y', '-v', 'error', '-i', p, '-filter_complex', `showwavespic=s=${w}x${h}:colors=0x8a8a8a`, '-frames:v', '1', cacheFile], 30000);
  if (!r.ok || !fs.existsSync(cacheFile)) return res.status(500).json({ error: `波形生成失败：${r.stderr.slice(-200)}` });
  res.setHeader('Content-Type', 'image/png');
  // mtime 进了缓存键 → 文件变了 URL 虽然相同但内容会重新生成；短期浏览器缓存可接受
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.end(fs.readFileSync(cacheFile));
});

// ===== 后台渲染队列（P1-9）=====
// ★ 执行器在本层注入：路由层同时认识 HTTP 与智能体执行层，服务层不需要反向依赖 mcp。
//   队列顺序执行 —— 连续导出两个不会再互相抢 CPU/显存。
setRenderQueueRunner(async (job) => {
  const r = await clipProjectTool({
    op: 'render',
    ...(job.preview ? { preview: true } : {}),
    ...(job.quality ? { quality: job.quality } : {}),
    ...(job.output ? { output: job.output } : {}),
  }, job.conversationId, null);
  const text = r.content?.[0]?.text || '';
  if (r.isError) return { ok: false, error: text };
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; file?: string; note?: string };
    if (parsed.ok === false) return { ok: false, error: parsed.note || text };
    return { ok: true, ...(parsed.file ? { file: parsed.file } : {}), ...(parsed.note ? { note: parsed.note } : {}) };
  } catch {
    return { ok: true, note: text };
  }
});

router.post('/render-queue', (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const quality = String(req.body?.quality || '').trim().toLowerCase();
  if (quality && !['low', 'std', 'high'].includes(quality)) {
    return res.status(400).json({ error: 'quality 只能是 low / std / high' });
  }
  const job = enqueueRenderJob({
    conversationId,
    ...(req.body?.title ? { title: String(req.body.title) } : {}),
    preview: req.body?.preview === true,
    ...(quality ? { quality: quality as 'low' | 'std' | 'high' } : {}),
    ...(req.body?.output ? { output: String(req.body.output) } : {}),
  });
  return res.json({ ok: true, job });
});

router.get('/render-queue', (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  return res.json({ jobs: listRenderJobs(conversationId || undefined) });
});

router.post('/render-queue/cancel', (req: Request, res: Response) => {
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id 必填' });
  // 只能取消"还在排队"的；已开始渲染的不中断（杀 ffmpeg 会留半成品）
  return res.json({ ok: cancelRenderJob(id) });
});

router.post('/render-queue/clear', (req: Request, res: Response) => {
  const conversationId = String(req.body?.conversationId || '').trim();
  return res.json({ ok: true, removed: clearFinishedRenderJobs(conversationId || undefined) });
});

export default router;