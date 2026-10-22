// 本地资源安装路由（2026-10-22）—— 通道 A（用户点击）的统一后端
//
// ★ 与 tts-packs / ollama-market 同构：路由薄，逻辑在 services/installer-registry.ts。
//
// ★★ 为什么要有这条路由（而不是让前端各调各的）：
//   安装类资源此前每个都有独立接口（/tts-packs/:id/install、ffmpeg 走工具、
//   whisper 走工具…），UI 想做一个「本地模型」总览页就得逐个适配。
//   现在统一到 /api/install/*，与 install_resource 工具**共用同一个 install()**，
//   保证「UI 装的」和「模型装的」是同一份产物（这是双通道设计的核心约束）。
//
// ★ 安全：安装会下载大文件，这里**不做二次确认** —— 前端按钮本身就是用户的明确意图
//   （与模型通道不同：模型调用必须弹确认卡，见 llm-task-manager.confirmResourceInstall）。

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { INSTALLERS, listInstallers, getInstaller } from '../services/installer-registry.js';
import { acestepStatus } from '../services/music-acestep.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('install');
const router = Router();
router.use(authMiddleware);

/** 进行中的安装（防止同一资源被并发触发两次下载）。 */
const inflight = new Map<string, { startedAt: number; log: string[] }>();

// GET /api/install/list —— 全部可安装资源及状态
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const items = await listInstallers();
    // ★ ACE-Step 单独补详细状态：它可能是"权重大小看着全、torch 却是 CPU 版"，
    //   listInstallers 的 installed 布尔不够解释原因。
    const acestep = await Promise.resolve(acestepStatus()).catch(() => null);
    res.json({
      data: {
        items,
        acestepDetail: acestep,
        inflight: [...inflight.keys()],
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/install/:id/status —— 单个资源状态（含体积/来源/落地目录）
router.get('/:id/status', async (req: Request, res: Response) => {
  const inst = getInstaller(req.params.id);
  if (!inst) {
    res.status(404).json({ error: `未知资源：${req.params.id}`, available: Object.keys(INSTALLERS) });
    return;
  }
  try {
    const installed = await inst.isInstalled();
    res.json({
      data: {
        id: inst.id,
        title: inst.title,
        purpose: inst.purpose,
        installed,
        bytes: inst.bytes(),
        sources: inst.sources().map((s) => ({ id: s.id, label: s.label, region: s.region })),
        targetDir: inst.targetDir(),
        eta: inst.eta(),
        manualHint: inst.manualHint(),
        inflight: inflight.has(inst.id),
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/install/:id —— 开始安装（幂等；已装直接返回）
router.post('/:id', async (req: Request, res: Response) => {
  const inst = getInstaller(req.params.id);
  if (!inst) {
    res.status(404).json({ error: `未知资源：${req.params.id}`, available: Object.keys(INSTALLERS) });
    return;
  }
  // 并发保护：同一资源同时只跑一个安装
  if (inflight.has(inst.id)) {
    res.status(409).json({ error: `${inst.title} 正在安装中，请等待完成`, inflight: true });
    return;
  }

  const variant = typeof req.body?.variant === 'string' ? req.body.variant : undefined;
  try {
    if (await inst.isInstalled(variant)) {
      res.json({ ok: true, alreadyInstalled: true, message: `${inst.title} 已就绪`, targetDir: inst.targetDir() });
      return;
    }
  } catch { /* 探测失败继续装 */ }

  const rec = { startedAt: Date.now(), log: [] as string[] };
  inflight.set(inst.id, rec);
  logger.info(`[install] 开始 resource=${inst.id}`);

  // ★ 长任务（8.9GB 可能 40 分钟）不在请求里等 —— 立即返回，前端轮询 status。
  //   这与「模型通道同步等结果」不同：模型要拿到路径才能继续，用户只需要知道进度。
  void (async () => {
    try {
      const r = await inst.install(variant, (msg) => {
        rec.log.push(msg);
        if (rec.log.length > 50) rec.log.shift();
      });
      if (r.ok) logger.info(`[install] 完成 resource=${inst.id} path=${r.path ?? ''}`);
      else logger.warn(`[install] 失败 resource=${inst.id} error=${r.error}`);
    } catch (e: unknown) {
      logger.warn(`[install] 异常 resource=${inst.id} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      inflight.delete(inst.id);
    }
  })();

  res.json({ ok: true, started: true, message: `开始安装 ${inst.title}`, bytes: inst.bytes(variant) });
});

// GET /api/install/:id/progress —— 轮询进度（安装中/已完成/失败）
router.get('/:id/progress', async (req: Request, res: Response) => {
  const inst = getInstaller(req.params.id);
  if (!inst) {
    res.status(404).json({ error: `未知资源：${req.params.id}` });
    return;
  }
  const rec = inflight.get(inst.id);
  const own = inst.progress?.();
  let installed = false;
  try { installed = await inst.isInstalled(); } catch { /* ignore */ }

  res.json({
    data: {
      state: rec ? 'downloading' : installed ? 'done' : own?.state === 'error' ? 'error' : 'idle',
      progress: own?.progress ?? (rec ? 50 : installed ? 100 : 0),
      message: rec ? (rec.log[rec.log.length - 1] || '安装中…') : installed ? '已就绪' : (own?.message || ''),
      installed,
      elapsedSec: rec ? Math.round((Date.now() - rec.startedAt) / 1000) : 0,
      log: rec ? rec.log.slice(-8) : [],
    },
  });
});

export default router;
