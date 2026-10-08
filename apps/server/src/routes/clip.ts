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
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { readClipProject, writeClipProject, clipProjectPath as clipProjectPathOf } from '../services/clip-store.js';
import { summarizeProject } from '../services/clip-project.js';
import { ensureArtifactDirFor } from '../services/artifact-dir.js';
import { parseProbeJson, probeArgs } from '../services/clip-render.js';
import { renderPreviewFrame } from '../services/clip-preview.js';
import { SFX_LIBRARY, sfxById } from '../services/sfx-library.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { runCmd } from '../services/exec-cmd.js';

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
function probeMediaAsync(ffprobe: string, file: string): Promise<{ duration: number; width: number; height: number; hasVideo: boolean; ok: boolean }> {
  return new Promise((resolve) => {
    execFile(ffprobe, probeArgs(file), { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve({ duration: 0, width: 0, height: 0, hasVideo: false, ok: false }); return; }
      const p = parseProbeJson(String(stdout || ''));
      resolve({ duration: p.durationSec, width: p.width, height: p.height, hasVideo: p.height > 0, ok: p.durationSec > 0 });
    });
  });
}

const router = Router();
router.use(authMiddleware);

function conversationExists(id: string): boolean {
  if (!id) return false;
  try {
    return !!db.prepare('SELECT id FROM conversation WHERE id = ?').get(id);
  } catch {
    return false;
  }
}

// GET /api/clip/projects?userId=...
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

// DELETE /api/clip/projects/:conversationId —— 删项目 = 删该会话及其产物目录
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
  try {
    db.prepare('DELETE FROM conversation WHERE id = ?').run(cid);
  } catch {
    return res.status(500).json({ error: '删除会话失败' });
  }
  return res.json({ ok: true, removedFiles, note: '已删除项目（素材源文件未动）' });
});

// POST /api/clip/probe —— 批量探测媒体时长（前端时间轴要按真实时长排布）
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

// GET /api/clip/library —— 内置音效库清单（合成式，免版权）
//
// ★ 诚实说明为什么只有"音效 + 氛围垫"没有旋律 BGM：
//   合成器做不出编曲；打包真实音乐又涉及版权与体积。详见 services/sfx-library.ts 顶部注释。
router.get('/library', (_req: Request, res: Response) => {
  res.json({
    sfx: SFX_LIBRARY.map((s) => ({ id: s.id, label: s.label, desc: s.desc, group: s.group, maxSec: s.maxSec })),
    note: '音效为 ffmpeg 实时合成（免版权）。旋律性配乐请自备或从素材市场获取。',
  });
});

// POST /api/clip/library/sfx —— 生成一个音效到会话素材库
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

// GET /api/clip/frame?conversationId=xxx&t=1.234
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
  const durations: Record<string, number> = {};
  const uniq: string[] = [];
  for (const c of project.clips) if (!uniq.includes(c.file)) uniq.push(c.file);
  const CONC = 4;
  for (let i = 0; i < uniq.length; i += CONC) {
    const batch = uniq.slice(i, i + CONC);
    const rs = await Promise.all(batch.map((p) => probeMediaAsync(ff.ffprobe, p)));
    rs.forEach((r, k) => {
      durations[batch[k]] = r.duration;
      // 同时按段 id 存一份，便于 locateTimeline 两种键都能查到
      const seg = project.clips.find((c) => c.file === batch[k]);
      if (seg) durations[seg.id] = r.duration;
    });
  }

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

// GET /api/clip/project?conversationId=xxx
router.get('/project', (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '').trim();
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!conversationExists(conversationId)) return res.status(404).json({ error: '会话不存在' });
  const project = readClipProject(conversationId);
  return res.json({ exists: !!project, project });
});

// PUT /api/clip/project  body: { conversationId, project }
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

// GET /api/clip/waveform?conversationId=xxx&path=...&w=600&h=64
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
      (project.overlays || []).some((o) => o.file === p));
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

export default router;