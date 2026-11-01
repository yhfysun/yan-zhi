// 直播模式开关（thin route）。
//
// 为什么由服务端持有状态：工具判定发生在服务端，渲染层只是开关的发起方。
// 进程内状态即可 —— 应用重启后直播模式自动回到关闭，这是安全的默认值。
import { Router, type Request, type Response } from 'express';
import { isLiveMode, liveAllowRules, setLiveMode } from '../live-mode.js';
import { ingestDanmaku, pullDanmaku } from '../live-danmaku.js';
import { askLiveQuestion } from '../live-ask.js';
import { synthesizeLiveSpeech } from '../live-tts.js';
import { liveSourceState, startReplaySource, stopLiveSource } from '../live-source.js';
import { startWebSource, stopWebSource, webSourceState, type WebSourceKind } from '../live-web-source.js';

const router = Router();

// GET /api/live —— 当前状态 + 白名单（排障/前端展示用）
router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, on: isLiveMode(), ...liveAllowRules() });
});

// POST /api/live —— { on: boolean } 开/关直播模式
router.post('/', (req: Request, res: Response) => {
  const on = Boolean(req.body?.on);
  setLiveMode(on);
  // 下播顺带停源：不让定时器在离线状态空转（网页抓取源连带关直播间标签页）
  if (!on) {
    stopLiveSource();
    void stopWebSource();
  }
  res.json({ ok: true, on: isLiveMode() });
});

// GET /api/live/source —— 当前弹幕源状态（网页抓取源优先：它在跑就说明 replay 一定没跑）
router.get('/source', (_req: Request, res: Response) => {
  const web = webSourceState();
  if (web.kind) {
    res.json({ ok: true, kind: web.kind, sent: web.sent, startedAt: web.startedAt, lastError: web.lastError });
    return;
  }
  res.json({ ok: true, ...liveSourceState() });
});

// POST /api/live/source —— 切换弹幕源
// kind: off 关 / replay 脚本演示 / douyin|kuaishou 网页抓取（需浏览器桥，body.url = 直播间链接）
router.post('/source', async (req: Request, res: Response) => {
  const kind = String(req.body?.kind || 'off');
  const url = String(req.body?.url || '');
  if (kind === 'replay') {
    if (!isLiveMode()) {
      res.status(409).json({ ok: false, error: '未开播' });
      return;
    }
    await stopWebSource();
    res.json({ ok: true, ...startReplaySource() });
    return;
  }
  if (kind === 'douyin' || kind === 'kuaishou') {
    const r = await startWebSource(kind as WebSourceKind, url);
    if (!r.ok) {
      res.status(400).json({ ok: false, error: r.error });
      return;
    }
    res.json({ ok: true, ...r.snapshot });
    return;
  }
  await stopWebSource();
  stopLiveSource();
  res.json({ ok: true, ...liveSourceState() });
});

// POST /api/live/danmaku —— 投递一条弹幕（未开播直接拒绝，避免空闲期被灌数据）
// 谁投递都行：平台桥、浏览器抓取脚本、手动测试；客户端不关心来源。
router.post('/danmaku', (req: Request, res: Response) => {
  const r = ingestDanmaku({ text: req.body?.text, from: req.body?.from });
  if (!r.ok) {
    res.status(r.reason === '未开播' ? 409 : 400).json({ ok: false, error: r.reason });
    return;
  }
  res.json({ ok: true, item: r.item });
});

// GET /api/live/danmaku?since=N —— 拉取 seq 之后的新弹幕
router.get('/danmaku', (req: Request, res: Response) => {
  const r = pullDanmaku(Number(req.query.since || 0));
  res.json({ ok: true, ...r });
});

// POST /api/live/ask —— 把观众的提问派成任务（落到调用方指定的会话里）
router.post('/ask', (req: Request, res: Response) => {
  const r = askLiveQuestion({
    text: req.body?.text,
    convId: req.body?.convId,
    // 桌面端默认身份是 guest；路由若在鉴权链之后则用具名用户
    userId: (req as any).user?.userId || 'guest',
  });
  if (!r.ok) {
    res.status(r.error === '未开播' ? 409 : 400).json({ ok: false, error: r.error });
    return;
  }
  res.json({ ok: true, taskId: r.taskId });
});

// GET /api/live/tts/voices —— Edge 在线音色列表（中文优先，10 分钟缓存）。
// 供前端音色下拉；失败不报 5xx —— 前端拿到 ok:false 就地隐藏下拉即可。
let voicesCache: { at: number; voices: Array<{ name: string; display: string; gender: string }> } | null = null
router.get('/tts/voices', async (_req: Request, res: Response) => {
  if (voicesCache && Date.now() - voicesCache.at < 10 * 60_000) {
    res.json({ ok: true, voices: voicesCache.voices });
    return;
  }
  try {
    const { listEdgeVoices } = await import('../mcp/edge-tts.js');
    const all = await listEdgeVoices();
    const voices = all
      .filter((v) => String(v.culture).startsWith('zh'))
      .map((v) => ({ name: v.name, display: v.display || v.name, gender: v.gender }));
    voicesCache = { at: Date.now(), voices };
    res.json({ ok: true, voices });
  } catch (e: any) {
    res.json({ ok: false, error: e?.message || String(e), voices: [] });
  }
});

// POST /api/live/tts —— 播报合成：模型层（与视频配音同链）→ 本地包 → Edge → 系统
router.post('/tts', async (req: Request, res: Response) => {
  const r = await synthesizeLiveSpeech({
    text: req.body?.text,
    packId: req.body?.packId,
    voice: req.body?.voice,
    model: req.body?.model,
    rate: Number(req.body?.rate) || 0,
  });
  if (!r.ok) {
    res.status(400).json({ ok: false, error: r.error });
    return;
  }
  res.json(r);
});

export default router;
