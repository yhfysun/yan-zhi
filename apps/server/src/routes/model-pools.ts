// 模型候选池三层配置路由（model-candidate-pools P1）。
//
// 为什么集中一处而不是散进 agents/platforms 路由：
//   三层的读写 + 校验是**同一语义**（validateModelPools / parsePoolsJson / resolvePool 都在
//   services/model-pools.ts），散开必然各写一遍且口径漂移。agents/platforms 的既有 PATCH
//   只挂「随表单整体保存」的入口（modelPools 字段），独立配置页走本路由。
//
// 层与存储：
//   GET  /api/model-pools?agentId=&platformId=  三层合并视图 + 各槽位生效池（来源标注）
//   PUT  /api/model-pools/global                app_config key='model_pools'
//   PUT  /api/model-pools/platforms/:pid        platform.model_pools_json（内置平台也可改：使用偏好）
//   PUT  /api/model-pools/agents/:aid           agent.model_pools_json
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  SLOTS,
  readGlobalPools,
  resolvePool,
  validateModelPools,
  type ModelPools,
} from '../services/model-pools.js';

const router = Router();
router.use(authMiddleware);

const userId = (req: Request) => req.user!.userId;

function poolsToDto(p: ModelPools): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of SLOTS) out[s] = p[s] || [];
  return out;
}

// GET /api/model-pools —— 三层现状 + 各槽位生效池（前端配置页与下下拉数据源）
router.get('/', (req: Request, res: Response) => {
  const uid = userId(req);
  const agentId = typeof req.query.agentId === 'string' && req.query.agentId ? req.query.agentId : undefined;
  let platformId = typeof req.query.platformId === 'string' && req.query.platformId ? req.query.platformId : undefined;
  // 未显式给平台时，用智能体绑定的平台作为 L2 上下文（「智能体没配 → 用其平台的池」语义）
  if (!platformId && agentId) {
    platformId = (db.prepare('SELECT platform_id FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, uid) as any)?.platform_id || undefined;
  }

  const agentPools = agentId
    ? (db.prepare('SELECT model_pools_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, uid) as any)?.model_pools_json
    : undefined;
  const platformPools = platformId
    ? (db.prepare('SELECT model_pools_json FROM platform WHERE id = ? AND user_id = ?').get(platformId, uid) as any)?.model_pools_json
    : undefined;

  // 生效池条目只回前端需要的最小面（id/别名/平台/来源），避免整行 Model 对象泄漏内部字段
  const effective: Record<string, unknown[]> = {};
  for (const slot of SLOTS) {
    effective[slot] = resolvePool(db, { userId: uid, agentId, platformId }, slot).map((e) => ({
      modelId: e.model.id,
      platformId: e.platformId,
      platformName: e.platformName,
      alias: e.model.alias,
      modelApiId: e.model.modelId,
      type: e.model.type,
      capabilities: e.model.capabilities,
      source: e.source,
    }));
  }

  res.json({
    data: {
      global: poolsToDto(readGlobalPools(db)),
      platform: agentPools === undefined && platformPools === undefined ? null : poolsToDto(JSON.parse(platformPools || '{}') as ModelPools),
      agent: agentId ? poolsToDto(JSON.parse(agentPools || '{}') as ModelPools) : null,
      effective,
    },
  });
});

// PUT /api/model-pools/global —— 全局默认池（app_config）
router.put('/global', (req: Request, res: Response) => {
  const uid = userId(req);
  const v = validateModelPools(db, uid, req.body?.modelPools ?? req.body);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run('model_pools', JSON.stringify(v.pools || {}), Date.now());
  res.json({ data: poolsToDto(readGlobalPools(db)) });
});

// PUT /api/model-pools/platforms/:pid —— 平台默认池（内置平台也可改：与 llmEnabled 同属使用偏好）
router.put('/platforms/:pid', (req: Request, res: Response) => {
  const uid = userId(req);
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(pid, uid);
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  const v = validateModelPools(db, uid, req.body?.modelPools ?? req.body);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  db.prepare('UPDATE platform SET model_pools_json = ? WHERE id = ?').run(JSON.stringify(v.pools || {}), pid);
  const row = db.prepare('SELECT model_pools_json FROM platform WHERE id = ?').get(pid) as any;
  res.json({ data: poolsToDto(JSON.parse(row?.model_pools_json || '{}') as ModelPools) });
});

// PUT /api/model-pools/agents/:aid —— 智能体池
router.put('/agents/:aid', (req: Request, res: Response) => {
  const uid = userId(req);
  const aid = req.params.aid;
  const agent = db.prepare('SELECT id FROM agent WHERE id = ? AND user_id = ?').get(aid, uid);
  if (!agent) { res.status(404).json({ error: '智能体不存在或无权修改' }); return; }
  const v = validateModelPools(db, uid, req.body?.modelPools ?? req.body);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  db.prepare('UPDATE agent SET model_pools_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(v.pools || {}), Date.now(), aid);
  const row = db.prepare('SELECT model_pools_json FROM agent WHERE id = ?').get(aid) as any;
  res.json({ data: poolsToDto(JSON.parse(row?.model_pools_json || '{}') as ModelPools) });
});

export default router;
