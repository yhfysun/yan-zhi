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
import { parseProbeJson, probeArgs } from '../services/clip-render.js';
import { renderPreviewFrame, locateTimeline } from '../services/clip-preview.js';
import { ensureEffectPreview } from '../services/clip-effect-preview.js';
import { analyzeBeats } from '../services/clip-beats.js';
import { SFX_LIBRARY, sfxById } from '../services/sfx-library.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import {
  resolveWhisper, ensureWav16k, runWhisperToSrt,
  WHISPER_MODELS, DEFAULT_WHISPER_MODEL,
} from '../mcp/whisper-runtime.js';
import { parseSrt } from '../mcp/subtitle-style.js';

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
router.get('/library', (_req: Request, res: Response) => {
  res.json({
    sfx: SFX_LIBRARY.map((s) => ({ id: s.id, label: s.label, desc: s.desc, group: s.group, maxSec: s.maxSec })),
    note: '音效为 ffmpeg 实时合成（免版权）。旋律性配乐请自备或从素材市场获取。',
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
  const model = String(req.body?.model || '').trim() || DEFAULT_WHISPER_MODEL;
  const language = String(req.body?.language || '').trim() || 'zh';
  if (!conversationId) return res.status(400).json({ error: 'conversationId 必填' });
  if (!inputRaw) return res.status(400).json({ error: 'path 必填（音频或视频文件路径）' });
  if (!WHISPER_MODELS[model]) {
    return res.status(400).json({ error: `未知模型 ${model}，可选：${Object.keys(WHISPER_MODELS).join(' / ')}` });
  }
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ?').get(conversationId) as { id?: string } | undefined;
  if (!conv) return res.status(404).json({ error: '会话不存在' });

  const input = path.isAbsolute(inputRaw) ? inputRaw : path.resolve(inputRaw);
  if (!fs.existsSync(input)) return res.status(404).json({ error: `文件不存在：${input}` });

  // 依赖分诊：四类缺失各自给不同指引（前端原样展示，不让用户猜）
  const wh = await resolveWhisper(model);
  if (!wh.ok) {
    return res.status(503).json({
      error: wh.error,
      need: 'whisper',
      model, installDir: wh.installDir, modelsDir: wh.modelsDir,
      // 前端据此给出「去装」的动作（调 whisper_install 走对话，或手动放置）
      hint: '可在对话里让剪辑师调用 whisper_install 安装，或按上面目录手动放置。',
    });
  }
  const ff = await resolveFfmpeg();
  if (!ff.ok) return res.status(503).json({ error: ff.error, need: 'ffmpeg', hint: '可调用 media_install_ffmpeg。' });

  const wav = await ensureWav16k(input, ff.ffmpeg);
  if (!wav.ok) return res.status(500).json({ error: `音频准备失败：${wav.error || '未知错误'}` });

  try {
    const workPrefix = path.join(path.dirname(wav.wav), 'out');
    const run = await runWhisperToSrt({
      bin: wh.bin, model: wh.model, wav: wav.wav, outPrefix: workPrefix, language,
    });
    if (!run.ok) {
      return res.status(500).json({ error: run.error || 'whisper 执行失败' });
    }
    const content = fs.readFileSync(run.srt, 'utf8');
    const cues = parseSrt(content).map((c) => ({ text: c.text, start: c.start, end: c.end }));
    if (!cues.length) {
      return res.status(422).json({
        error: '未检测到可用语音内容（识别结果为空）',
        hint: `可能原因：① 音频没有说话声；② 语言参数与实际不符（当前 ${language}）；③ 音频过短。可换 medium 模型重试。`,
      });
    }
    // ★ 返回形态对齐 /clip/probe 的 `{data: ...}`（前端 apiFetch 解包后 r.data 即数组本身）
    //   model 用**实际使用**的档位（请求 small 但本机只有 base 时会自动降级，如实回报）
    return res.json({ data: cues, ok: true, model: wh.modelName || model, requestedModel: model, language, source: wh.source });
  } catch (e: unknown) {
    return res.status(500).json({ error: `转写异常：${e instanceof Error ? e.message : String(e)}` });
  } finally {
    // 临时音频清理失败不该让请求失败
    try { fs.rmSync(path.dirname(wav.wav), { recursive: true, force: true }); } catch { /* ignore */ }
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
    (project.clips.some((c) => c.file === p || c.audioFile === p) || project.bgm?.file === p);
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