// 语音包（本地 TTS 模型）路由：清单 / 安装 / 卸载 / 下载进度。
// 与 ollama-market 同构：路由薄，逻辑在 services/tts-packs.ts。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { listTtsPacks, installTtsPack, removeTtsPack, getDownloadState, previewTtsPack } from '../services/tts-packs.js';
import { resolveSherpaLib, installSherpaEngine } from '../mcp/sherpa-tts.js';

const router = Router();
router.use(authMiddleware);

// POST /api/tts-packs/engine/install —— 安装推理引擎（原生二进制按平台下载）
// 注意：必须注册在 /:id 之前，否则 "engine" 会被当成语音包 id 匹配走
router.post('/engine/install', async (_req: Request, res: Response) => {
  const r = await installSherpaEngine((msg) => console.log(`[sherpa] ${msg}`));
  if (!r.ok) { res.status(400).json({ error: r.message }); return; }
  res.json({ ok: true, message: r.message, dir: r.dir });
});

// GET /api/tts-packs —— 清单 + 安装状态 + 推理引擎可用性
router.get('/', async (_req: Request, res: Response) => {
  const engine = resolveSherpaLib();
  res.json({
    data: {
      items: await listTtsPacks(),
      // 推理引擎不可用时前端要提示「需先装引擎」，否则用户装了模型也用不了
      engine: { available: engine.available, source: engine.source, error: engine.error },
    },
  });
});

// GET /api/tts-packs/:id/progress —— 下载进度轮询
router.get('/:id/progress', (req: Request, res: Response) => {
  res.json({ data: getDownloadState(req.params.id) });
});

// POST /api/tts-packs/:id/install —— 下载并安装
router.post('/:id/install', async (req: Request, res: Response) => {
  const r = await installTtsPack(req.params.id, (msg) => console.log(`[tts-pack] ${req.params.id}: ${msg}`));
  if (!r.ok) { res.status(400).json({ error: r.message }); return; }
  res.json({ ok: true, message: r.message, dir: r.dir });
});

// POST /api/tts-packs/:id/preview —— 试听：用该语音包合成一句样例，返回可播放的音频地址
// （不存在的通用「工具执行」HTTP 端点，故这里直接给试听专用接口）
router.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    const r = await previewTtsPack(req.params.id, {
      text: typeof req.body?.text === 'string' ? req.body.text : undefined,
      speakerId: typeof req.body?.speakerId === 'number' ? req.body.speakerId : undefined,
    });
    if (!r.ok) { res.status(400).json({ error: r.message }); return; }
    res.json({ ok: true, url: r.url, file: r.file, speakerId: r.speakerId, bytes: r.bytes });
  } catch (e: any) {
    // 不吞堆栈：试听失败要能定位到具体步骤（此前只看到一句 napi 报错，无从下手）
    console.error('[tts-pack] 试听失败:', e?.stack || e?.message || e);
    res.status(400).json({ error: e?.message || '试听失败', stack: String(e?.stack || '').split('\n').slice(0, 6).join(' | ') });
  }
});

// DELETE /api/tts-packs/:id —— 卸载（释放磁盘）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await removeTtsPack(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '卸载失败' });
  }
});

export default router;