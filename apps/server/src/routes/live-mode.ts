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

const router = Router();

// GET /api/live —— 当前状态 + 白名单（排障/前端展示用）
router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, on: isLiveMode(), ...liveAllowRules() });
});

// POST /api/live —— { on: boolean } 开/关直播模式
router.post('/', (req: Request, res: Response) => {
  const on = Boolean(req.body?.on);
  setLiveMode(on);
  // 下播顺带停源：不让定时器在离线状态空转
  if (!on) stopLiveSource();
  res.json({ ok: true, on: isLiveMode() });
});

// GET /api/live/source —— 当前弹幕源状态
router.get('/source', (_req: Request, res: Response) => {
  res.json({ ok: true, ...liveSourceState() });
});

// POST /api/live/source —— { kind: 'off' | 'replay' } 切换弹幕源
// 真实抓取适配器落地前，replay 用来喂演示流；抓取器接进来时在这里加一个 kind 即可。
router.post('/source', (req: Request, res: Response) => {
  const kind = String(req.body?.kind || 'off');
  if (kind === 'replay') {
    if (!isLiveMode()) {
      res.status(409).json({ ok: false, error: '未开播' });
      return;
    }
    res.json({ ok: true, ...startReplaySource() });
    return;
  }
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

// POST /api/live/tts —— 播报合成：本地语音包优先，没有就用 Edge 在线兜底
router.post('/tts', async (req: Request, res: Response) => {
  const r = await synthesizeLiveSpeech({
    text: req.body?.text,
    packId: req.body?.packId,
    voice: req.body?.voice,
  });
  if (!r.ok) {
    res.status(400).json({ ok: false, error: r.error });
    return;
  }
  res.json(r);
});

export default router;
