// 模型候选池三层配置路由（model-candidate-pools P1）。
//
// 为什么集中一处而不是散进 agents 路由：
//   三层的读写 + 校验是**同一语义**（validateModelPools / parsePoolsJson / resolvePool 都在
//   services/model-pools.ts），散开必然各写一遍且口径漂移。agents 的既有 PATCH
//   只挂「随表单整体保存」的入口（modelPools 字段），独立配置页走本路由。
//
// ★ 三层 = 智能体 → 智能体平台 → 全局（见 services/model-pools.ts 文件头）。
//   注意「智能体平台」≠「模型平台」：前者是 /agents 页（管理所有智能体，本层的池
//   对所有智能体生效、跨供应商选模型），后者是 /models 页（百炼/agnes 这类大模型供应商）。
//   第二层不隶属任何供应商，故存 app_config 而非 platform 表。
//
// 层与存储：
//   GET  /api/model-pools?agentId=     三层现状 + 各槽位生效池（来源标注）
//   PUT  /api/model-pools/global            app_config key='model_pools'
//   PUT  /api/model-pools/agent-platform    app_config key='agent_platform_model_pools'
//   PUT  /api/model-pools/agents/:aid       agent.model_pools_json
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  SLOTS,
  readGlobalPools,
  readAgentPlatformPools,
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

/** 写 app_config 的池（智能体平台层 / 全局层共用 —— 同构单例，口径必须一致） */
function writeConfigPools(key: string, pools: ModelPools): void {
  db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(key, JSON.stringify(pools || {}), Date.now());
}

// GET /api/model-pools —— 三层现状 + 各槽位生效池（前端配置页与下拉数据源）
router.get('/', (req: Request, res: Response) => {
  const uid = userId(req);
  const agentId = typeof req.query.agentId === 'string' && req.query.agentId ? req.query.agentId : undefined;

  const agentPools = agentId
    ? (db.prepare('SELECT model_pools_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, uid) as any)?.model_pools_json
    : undefined;

  // 生效池条目只回前端需要的最小面（id/别名/平台/来源），避免整行 Model 对象泄漏内部字段
  const effective: Record<string, unknown[]> = {};
  for (const slot of SLOTS) {
    effective[slot] = resolvePool(db, { userId: uid, agentId }, slot).map((e) => ({
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
      // 智能体平台层（所有智能体的默认池）；未配置则 null，前端据此显示"未配置"
      agentPlatform: poolsToDto(readAgentPlatformPools(db)),
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
  writeConfigPools('model_pools', v.pools || {});
  res.json({ data: poolsToDto(readGlobalPools(db)) });
});

// PUT /api/model-pools/agent-platform —— 智能体平台默认池（对所有智能体生效）
router.put('/agent-platform', (req: Request, res: Response) => {
  const uid = userId(req);
  const v = validateModelPools(db, uid, req.body?.modelPools ?? req.body);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  writeConfigPools('agent_platform_model_pools', v.pools || {});
  res.json({ data: poolsToDto(readAgentPlatformPools(db)) });
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