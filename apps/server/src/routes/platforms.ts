import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

import {
  listApiKeys,
  addApiKey,
  updateApiKey,
  deleteApiKey,
  resetFailCount,
  recordSuccess,
  recordFailure,
} from '../services/token-pool.js';


const router = Router();
router.use(authMiddleware);

/** 内置「本地模型」(Ollama) 平台的确定性 ID：任何机器一致（与 ollama-embed.ts 的特判/内存兜底对齐）。
 *  注意避开 local-model-% 前缀——index.ts 启动清理会删除该前缀的残留行。 */
export const LOCAL_MODEL_PLATFORM_ID = 'ollama-local';
const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

const rowToP = (r: any) => ({
  id: r.id,
  name: r.name,
  protocol: r.protocol,
  api_url: r.api_url,
  api_key_enc: r.api_key_enc,
  headers_json: r.headers_json,
  status: r.status,
  last_health_at: r.last_health_at,
  is_builtin: !!r.is_builtin,
  pause_min_ms: r.pause_min_ms || 0,
  pause_max_ms: r.pause_max_ms || 0,
  created_at: r.created_at,
});

const rowToKey = (r: any) => ({
  id: r.id,
  platform_id: r.platform_id,
  api_key: r.api_key,
  label: r.label,
  fail_count: r.fail_count,
  last_fail_at: r.last_fail_at,
  enabled: !!r.enabled,
});

const rowToM = (r: any) => ({
  id: r.id,
  platform_id: r.platform_id,
  model_id: r.model_id,
  alias: r.alias,
  type: r.type,
  context_window: r.context_window,
  capabilities_json: r.capabilities_json,
  pricing_json: r.pricing_json,
  description: r.description,
  enabled: r.enabled,
  is_default: r.is_default,
  is_builtin: !!r.is_builtin,
  created_at: r.created_at,
});

const userId = (req: Request) => req.user!.userId;

// === Platforms ===

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM platform WHERE user_id = ? AND id NOT LIKE 'local-model-%' ORDER BY created_at DESC").all(userId(req));
  res.json({ data: rows.map(rowToP) });
});

router.post('/', (req: Request, res: Response) => {
  const { name, protocol, apiUrl, apiKeyEnc, headers, pauseMinMs, pauseMaxMs } = req.body || {};
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, is_builtin, pause_min_ms, pause_max_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
  ).run(id, userId(req), name, protocol || 'openai', apiUrl || null, apiKeyEnc || null, JSON.stringify(headers || {}), 1, pauseMinMs || 0, pauseMaxMs || 0, now);
  if (apiKeyEnc) {
    try { addApiKey(id, userId(req), apiKeyEnc, '默认Key'); } catch {}
  }
  const row = db.prepare('SELECT * FROM platform WHERE id = ?').get(id);
  res.json({ data: rowToP(row) });
});

// POST /ensure-local —— 幂等创建内置「本地模型」(Ollama) 平台，确定性 ID：ollama-local。
// 前端本地模型商城接入 Ollama 时调用，替代随机 ID 的 POST /（跨机器 ID 一致）。
router.post('/ensure-local', (req: Request, res: Response) => {
  const uid = userId(req);
  db.prepare(
    `INSERT OR IGNORE INTO platform (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, is_builtin, pause_min_ms, pause_max_ms, created_at)
     VALUES (?, ?, '本地模型', 'openai', ?, '', '{}', 1, 0, 0, 0, ?)`,
  ).run(LOCAL_MODEL_PLATFORM_ID, uid, OLLAMA_DEFAULT_URL, Date.now());
  const row = db.prepare('SELECT * FROM platform WHERE id = ?').get(LOCAL_MODEL_PLATFORM_ID);
  res.json({ data: rowToP(row) });
});

router.delete('/:id', (req: Request, res: Response) => {
  const pid = req.params.id;
  const existing = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!existing) { res.status(404).json({ error: '平台不存在' }); return; }

  db.prepare('DELETE FROM model WHERE platform_id = ?').run(pid);
  db.prepare('DELETE FROM platform WHERE id = ?').run(pid);
  res.json({ ok: true });
});

router.patch('/:id', (req: Request, res: Response) => {
  const pid = req.params.id;
  const existing = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!existing) { res.status(404).json({ error: '平台不存在' }); return; }
  if ((existing as any).is_builtin) { res.status(403).json({ error: '内置平台不可编辑' }); return; }
  const { name, protocol, apiUrl, apiKeyEnc, headers, pauseMinMs, pauseMaxMs } = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (protocol !== undefined) { sets.push('protocol = ?'); vals.push(protocol); }
  if (apiUrl !== undefined) { sets.push('api_url = ?'); vals.push(apiUrl); }
  if (apiKeyEnc !== undefined) { sets.push('api_key_enc = ?'); vals.push(apiKeyEnc); }
  if (headers !== undefined) { sets.push('headers_json = ?'); vals.push(JSON.stringify(headers)); }
  if (pauseMinMs !== undefined) { sets.push('pause_min_ms = ?'); vals.push(pauseMinMs); }
  if (pauseMaxMs !== undefined) { sets.push('pause_max_ms = ?'); vals.push(pauseMaxMs); }
  if (sets.length === 0) { res.json({ data: rowToP(existing) }); return; }
  vals.push(pid);
  db.prepare(`UPDATE platform SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM platform WHERE id = ?').get(pid);
  res.json({ data: rowToP(updated) });
});

// === Models (platform-scoped + global) ===

router.get('/all-models', (req: Request, res: Response) => {

  const rows = db.prepare("SELECT * FROM model WHERE user_id = ? AND id NOT LIKE 'local-model-%' AND platform_id NOT LIKE 'local-model-%' ORDER BY platform_id, is_default DESC").all(userId(req));
  res.json({ data: rows.map(rowToM) });
});

router.get('/:pid/models', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  const rows = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ? ORDER BY is_default DESC').all(pid, userId(req));
  res.json({ data: rows.map(rowToM) });
});

router.post('/:pid/models', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id, is_builtin FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  if ((platform as any).is_builtin) { res.status(403).json({ error: '内置平台不可添加模型' }); return; }
  const { modelId, alias, type, contextWindow, capabilities, pricing, enabled, isDefault, description } = req.body || {};
  if (!modelId) { res.status(400).json({ error: 'modelId 为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, description, enabled, is_default, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, pid, userId(req), modelId, alias || null, type || 'llm', contextWindow || 8000,
    JSON.stringify(capabilities || []), JSON.stringify(pricing || {}), description || null,
    enabled !== undefined ? (enabled ? 1 : 0) : 1, isDefault ? 1 : 0, now);
  res.json({ data: rowToM(db.prepare('SELECT * FROM model WHERE id = ?').get(id)) });
});

router.patch('/models/:mid', (req: Request, res: Response) => {
  const mid = req.params.mid;
  const row = db.prepare('SELECT * FROM model WHERE id = ? AND user_id = ?').get(mid, userId(req)) as any;
  if (!row) { res.status(404).json({ error: '模型不存在' }); return; }
  if (row.is_builtin) { res.status(403).json({ error: '内置模型不可编辑' }); return; }
  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.alias !== undefined) { sets.push('alias = ?'); vals.push(req.body.alias); }
  if (req.body.isDefault !== undefined) { sets.push('is_default = ?'); vals.push(req.body.isDefault ? 1 : 0); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.contextWindow !== undefined) { sets.push('context_window = ?'); vals.push(req.body.contextWindow); }
  if (req.body.capabilities !== undefined) { sets.push('capabilities_json = ?'); vals.push(JSON.stringify(req.body.capabilities)); }
  if (req.body.pricing !== undefined) { sets.push('pricing_json = ?'); vals.push(JSON.stringify(req.body.pricing)); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description); }
  if (sets.length === 0) { res.json({ data: rowToM(row) }); return; }
  vals.push(mid);
  db.prepare(`UPDATE model SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: rowToM(db.prepare('SELECT * FROM model WHERE id = ?').get(mid)) });
});

router.delete('/models/:mid', (req: Request, res: Response) => {
  const mid = req.params.mid;
  const row = db.prepare('SELECT id, is_builtin FROM model WHERE id = ? AND user_id = ?').get(mid, userId(req));
  if (!row) {
    res.status(404).json({ error: '模型不存在' }); return;
  }

  db.prepare('DELETE FROM model WHERE id = ?').run(mid);
  res.json({ ok: true });
});

router.post('/models/batch', (req: Request, res: Response) => {
  const { platformId, models } = req.body || {};
  if (!platformId || !Array.isArray(models)) { res.status(400).json({ error: 'platformId 和 models 为必填项' }); return; }
  const platform = db.prepare('SELECT id, is_builtin FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  if ((platform as any).is_builtin) { res.status(403).json({ error: '内置平台不可拉取或修改模型' }); return; }
  const uid = userId(req);
  const now = Date.now();

  const existingRows = db.prepare('SELECT model_id, is_builtin FROM model WHERE platform_id = ? AND user_id = ?').all(platformId, uid) as any[];
  const existingIds = new Set(existingRows.map((r: any) => r.model_id));
  const remoteIds = new Set(models.map((m: any) => m.modelId));

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  );
  const updateStmt = db.prepare(
    'UPDATE model SET type = ?, enabled = 1 WHERE platform_id = ? AND user_id = ? AND model_id = ? AND is_builtin = 0',
  );
  // 内置本地模型平台的模型行使用确定性 ID（ollama-local__<model_id>），跨机器一致
  const newRowId = (modelId: string) =>
    platformId === LOCAL_MODEL_PLATFORM_ID ? `${LOCAL_MODEL_PLATFORM_ID}__${modelId}` : uuid();

  db.transaction(() => {
    for (const m of models) {
      if (existingIds.has(m.modelId)) {
        updateStmt.run(m.type || 'llm', platformId, uid, m.modelId);
      } else {
        insertStmt.run(newRowId(m.modelId), platformId, uid, m.modelId, m.alias || null, m.type || 'llm', m.contextWindow || 8000,
          JSON.stringify(m.capabilities || []), JSON.stringify(m.pricing || {}),
          m.enabled !== undefined ? (m.enabled ? 1 : 0) : 1, m.isDefault ? 1 : 0, now);
      }
    }
    for (const existingId of existingIds) {
      if (!remoteIds.has(existingId)) {
        db.prepare('UPDATE model SET enabled = 0 WHERE platform_id = ? AND user_id = ? AND model_id = ? AND is_builtin = 0').run(platformId, uid, existingId);
      }
    }
  })();

  const rows = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ?').all(platformId, uid);
  res.json({ data: rows.map(rowToM) });
});

// === Platform API Keys（多 Token 池） ===

router.get('/:pid/keys', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  res.json({ data: listApiKeys(pid).map(rowToKey) });
});

router.post('/:pid/keys', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id, is_builtin FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  if ((platform as any).is_builtin) { res.status(403).json({ error: '内置平台不可添加 Key' }); return; }
  const { apiKey, label } = req.body || {};
  if (!apiKey) { res.status(400).json({ error: 'apiKey 为必填项' }); return; }
  const row = addApiKey(pid, userId(req), apiKey, label);
  res.json({ data: rowToKey(row) });
});

router.patch('/keys/:kid', (req: Request, res: Response) => {
  const kid = req.params.kid;
  const row = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid) as any;
  if (!row) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const platform = db.prepare('SELECT user_id FROM platform WHERE id = ?').get(row.platform_id) as any;
  if (!platform || platform.user_id !== userId(req)) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const { apiKey, label, enabled } = req.body || {};
  updateApiKey(kid, { apiKey, label, enabled });
  const updated = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid);
  res.json({ data: rowToKey(updated) });
});

router.delete('/keys/:kid', (req: Request, res: Response) => {
  const kid = req.params.kid;
  const row = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid) as any;
  if (!row) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const platform = db.prepare('SELECT user_id FROM platform WHERE id = ?').get(row.platform_id) as any;
  if (!platform || platform.user_id !== userId(req)) { res.status(404).json({ error: 'Key 不存在' }); return; }
  deleteApiKey(kid);
  res.json({ ok: true });
});

router.post('/keys/:kid/reset', (req: Request, res: Response) => {
  const kid = req.params.kid;
  const row = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid) as any;
  if (!row) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const platform = db.prepare('SELECT user_id FROM platform WHERE id = ?').get(row.platform_id) as any;
  if (!platform || platform.user_id !== userId(req)) { res.status(404).json({ error: 'Key 不存在' }); return; }
  resetFailCount(kid);
  const updated = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid);
  res.json({ data: rowToKey(updated) });
});

// POST /keys/:kid/test —— 单 Key 连通性测试：用该 Key 直连平台上游 /v1/models，
// 结果回写 token 池成功/失败记录（与代理轮换共用同一份 fail_count）。
// 始终返回 200 + ok 标志，避免前端把上游错误当请求异常抛出。
router.post('/keys/:kid/test', async (req: Request, res: Response) => {
  const kid = req.params.kid;
  const row = db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(kid) as any;
  if (!row) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const platform = db.prepare('SELECT user_id, api_url, protocol, headers_json FROM platform WHERE id = ?').get(row.platform_id) as any;
  if (!platform || platform.user_id !== userId(req)) { res.status(404).json({ error: 'Key 不存在' }); return; }
  const base = (platform.api_url || '').replace(/\/$/, '');
  if (!base) { res.json({ ok: false, status: 0, message: '平台未配置 API URL', durationMs: 0 }); return; }
  const anthropic = (platform.protocol || 'openai') === 'anthropic';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (anthropic) {
    headers['x-api-key'] = row.api_key || '';
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${row.api_key || ''}`;
  }
  try { Object.assign(headers, JSON.parse(platform.headers_json || '{}')); } catch {}
  const started = Date.now();
  try {
    const upstream = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(15000) });
    const text = await upstream.text().catch(() => '');
    const durationMs = Date.now() - started;
    if (upstream.ok) {
      recordSuccess(kid);
      res.json({ ok: true, status: upstream.status, message: 'Key 有效', durationMs });
    } else {
      recordFailure(kid);
      res.json({ ok: false, status: upstream.status, message: `HTTP ${upstream.status} ${text.slice(0, 160)}`, durationMs });
    }
  } catch (e: any) {
    res.json({ ok: false, status: 0, message: `网络错误: ${e?.message || e}`, durationMs: Date.now() - started });
  }
});

/** 历史版本给内置「本地模型」(Ollama) 平台生成过随机 ID（uuid / p_ / m_ 前缀行），
 *  导致不同电脑上的内置数据 ID 不一致、悬空引用无法对账。
 *  启动时统一迁移为确定性 ID：平台 ollama-local、模型行 ollama-local__<model_id>，
 *  并同步全部引用（model / conversation / scheduled_task / agent / platform_api_key / app_config）。
 *  幂等：无旧平台行时直接返回；目标行已存在时合并删除旧行。 */
export function migrateLegacyLocalPlatformRows(): void {
  const legacy = db.prepare(
    "SELECT id FROM platform WHERE id != ? AND api_url LIKE '%11434%'",
  ).all(LOCAL_MODEL_PLATFORM_ID) as any[];
  for (const p of legacy) {
    const oldId = p.id;
    db.transaction(() => {
      // 平台/模型 ID 改名过程中存在中间悬挂态（子表先指向新 ID、父行后改名），
      // 延迟外键约束到 COMMIT 时统一校验（此时所有行已一致）
      db.pragma('defer_foreign_keys = ON');
      // 模型行 → 确定性 ID（ollama-local__<model_id>）
      const models = db.prepare('SELECT id FROM model WHERE platform_id = ?').all(oldId) as any[];
      for (const m of models) {
        const modelId = (db.prepare('SELECT model_id FROM model WHERE id = ?').get(m.id) as any)?.model_id;
        if (!modelId) continue;
        const newId = `${LOCAL_MODEL_PLATFORM_ID}__${modelId}`;
        const dup = db.prepare('SELECT id FROM model WHERE id = ?').get(newId);
        if (dup) {
          db.prepare('UPDATE conversation SET model_id = ? WHERE model_id = ?').run(newId, m.id);
          db.prepare('UPDATE scheduled_task SET model_id = ? WHERE model_id = ?').run(newId, m.id);
          db.prepare('UPDATE agent SET model_id = ? WHERE model_id = ?').run(newId, m.id);
          db.prepare('DELETE FROM model WHERE id = ?').run(m.id);
        } else {
          db.prepare('UPDATE conversation SET model_id = ?, platform_id = ? WHERE model_id = ?').run(newId, LOCAL_MODEL_PLATFORM_ID, m.id);
          db.prepare('UPDATE scheduled_task SET model_id = ?, platform_id = ? WHERE model_id = ?').run(newId, LOCAL_MODEL_PLATFORM_ID, m.id);
          db.prepare('UPDATE agent SET model_id = ?, platform_id = ? WHERE model_id = ?').run(newId, LOCAL_MODEL_PLATFORM_ID, m.id);
          db.prepare('UPDATE model SET id = ?, platform_id = ? WHERE id = ?').run(newId, LOCAL_MODEL_PLATFORM_ID, m.id);
        }
      }
      // 平台行：目标行不存在则原地改名；已存在（如 ensure-local 先建）则合并删除旧行
      const target = db.prepare('SELECT id FROM platform WHERE id = ?').get(LOCAL_MODEL_PLATFORM_ID);
      if (!target) {
        db.prepare('UPDATE platform SET id = ? WHERE id = ?').run(LOCAL_MODEL_PLATFORM_ID, oldId);
      } else {
        db.prepare('DELETE FROM model WHERE platform_id = ?').run(oldId);
        db.prepare('DELETE FROM platform WHERE id = ?').run(oldId);
      }
      db.prepare('UPDATE platform_api_key SET platform_id = ? WHERE platform_id = ?').run(LOCAL_MODEL_PLATFORM_ID, oldId);
      // app_config.embedding_config 里的 platformId 引用同步
      try {
        const row = db.prepare("SELECT value FROM app_config WHERE key = 'embedding_config'").get() as any;
        if (row?.value) {
          const cfg = JSON.parse(row.value);
          if (cfg?.platformId === oldId) {
            cfg.platformId = LOCAL_MODEL_PLATFORM_ID;
            db.prepare("UPDATE app_config SET value = ? WHERE key = 'embedding_config'").run(JSON.stringify(cfg));
          }
        }
      } catch { /* 配置损坏不阻塞迁移主流程 */ }
    })();
    console.log(`[migrate] 本地模型平台已迁移为确定性 ID: ${oldId} -> ${LOCAL_MODEL_PLATFORM_ID}`);
  }
}

export default router;
