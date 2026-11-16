import type { Model, Platform } from '@yan-zhi/shared';
import type { YzSqliteDb } from './sqlite-driver.js';
import { resolvePool } from './model-pools.js';

export interface ResolvedGatewayModel {
  platform: Platform;
  model: Model;
  requestedModel: string;
}

export type GatewayModelPurpose = 'chat' | 'embedding';

function platformFromRow(row: any): Platform {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.headers_json || '{}') || {};
  } catch {
    headers = {};
  }
  return {
    id: String(row.id),
    name: String(row.name || ''),
    protocol: String(row.protocol || 'openai') as Platform['protocol'],
    apiUrl: String(row.api_url || ''),
    apiKeyEnc: String(row.api_key_enc || ''),
    headers,
    status: 'unknown',
  } as Platform;
}

function modelFromRow(row: any): Model {
  let capabilities: string[] = [];
  try {
    const parsed = JSON.parse(row.capabilities_json || '[]');
    if (Array.isArray(parsed)) capabilities = parsed;
  } catch {
    capabilities = [];
  }
  return {
    id: String(row.id),
    platformId: String(row.platform_id),
    modelId: String(row.model_id),
    alias: row.alias || undefined,
    type: row.type || 'llm',
    contextWindow: Number(row.context_window) || 32768,
    capabilities,
    enabled: Number(row.enabled) !== 0,
    isDefault: Number(row.is_default) === 1,
  } as Model;
}

function loadPlatformForModel(db: YzSqliteDb, userId: string, platformId: string): Platform | null {
  const row = db.prepare(`
    SELECT p.*
      FROM platform p
     WHERE p.id = ? AND p.llm_enabled = 1
       AND (p.user_id = ? OR p.is_public = 1)
  `).get(platformId, userId) as any;
  return row ? platformFromRow(row) : null;
}

function allowedModelIds(allowedModels: string[]): Set<string> {
  return new Set(allowedModels.map((item) => item.trim()).filter(Boolean));
}

function isAutoModel(value: string): boolean {
  return value === 'auto' || value === 'yanzhi/auto' || value === 'yz/auto';
}

export function resolveGatewayModel(
  db: YzSqliteDb,
  userId: string,
  requested: string,
  allowedModels: string[],
  purpose: GatewayModelPurpose = 'chat',
): ResolvedGatewayModel | { error: string; code: 'model_not_allowed' | 'model_not_found' } {
  const modelName = String(requested || '').trim();
  const allowed = allowedModelIds(allowedModels);
  if (isAutoModel(modelName)) {
    if (!allowed.has('*') && !allowed.has('auto')) {
      return { error: `模型不在该密钥白名单内: ${modelName}`, code: 'model_not_allowed' };
    }
    if (purpose === 'chat') {
      const first = resolvePool(db, { userId }, 'llm')[0];
      if (!first) return { error: '当前账号没有可用的对话模型', code: 'model_not_found' };
      const platform = loadPlatformForModel(db, userId, first.platformId);
      if (!platform) return { error: '自动路由命中的模型平台不可用', code: 'model_not_found' };
      return { platform, model: first.model, requestedModel: modelName };
    }
    const embedding = db.prepare(`
      SELECT m.*
        FROM model m
        JOIN platform p ON p.id = m.platform_id
       WHERE m.type = 'embedding' AND m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1
         AND (m.user_id = ? OR p.is_public = 1 OR m.is_public = 1)
       ORDER BY m.is_default DESC, m.created_at DESC
       LIMIT 1
    `).get(userId) as any;
    if (!embedding) return { error: '当前账号没有可用的 Embedding 模型', code: 'model_not_found' };
    const platform = loadPlatformForModel(db, userId, String(embedding.platform_id));
    if (!platform) return { error: 'Embedding 模型平台不可用', code: 'model_not_found' };
    return { platform, model: modelFromRow(embedding), requestedModel: modelName };
  }

  const row = db.prepare(`
    SELECT m.*, p.name AS platform_name, p.protocol, p.api_url, p.api_key_enc,
           p.headers_json, p.llm_enabled
      FROM model m
      JOIN platform p ON p.id = m.platform_id
     WHERE (m.id = ? OR m.model_id = ? OR m.alias = ?)
       AND m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1
       AND (m.user_id = ? OR p.is_public = 1 OR m.is_public = 1)
     ORDER BY m.is_default DESC, m.created_at DESC
     LIMIT 1
  `).get(modelName, modelName, modelName, userId) as any;
  if (!row) return { error: `模型不存在或不可用: ${modelName}`, code: 'model_not_found' };

  const model = modelFromRow(row);
  if (purpose === 'embedding' && model.type !== 'embedding') {
    return { error: `模型不是 Embedding 模型: ${modelName}`, code: 'model_not_found' };
  }
  if (purpose === 'embedding' && row.protocol === 'anthropic') {
    return { error: 'Anthropic 协议不支持 Embeddings', code: 'model_not_found' };
  }
  if (!allowed.has('*') && !allowed.has(model.id) && !allowed.has(model.modelId) && !allowed.has(model.alias || '')) {
    return { error: `模型不在该密钥白名单内: ${modelName}`, code: 'model_not_allowed' };
  }
  return { platform: platformFromRow(row), model, requestedModel: modelName };
}

export function listGatewayModels(
  db: YzSqliteDb,
  userId: string,
  allowedModels: string[],
): Array<{ id: string; object: 'model'; owned_by: string; yanzhi_id: string }> {
  const allowed = allowedModelIds(allowedModels);
  const out: Array<{ id: string; object: 'model'; owned_by: string; yanzhi_id: string }> = [];
  if (allowed.has('*') || allowed.has('auto')) {
    out.push({ id: 'auto', object: 'model', owned_by: 'yanzhi', yanzhi_id: 'auto' });
  }
  const rows = db.prepare(`
    SELECT m.id, m.model_id, m.alias, p.name AS platform_name
      FROM model m
      JOIN platform p ON p.id = m.platform_id
     WHERE m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1
       AND (m.user_id = ? OR p.is_public = 1 OR m.is_public = 1)
       AND NOT EXISTS (
         SELECT 1 FROM platform_api_key k
          WHERE k.platform_id = p.id
          GROUP BY k.platform_id
         HAVING COUNT(*) > 0 AND SUM(CASE WHEN k.enabled = 1 THEN 1 ELSE 0 END) = 0
       )
     ORDER BY p.name, m.is_default DESC, m.created_at DESC
  `).all(userId) as any[];
  const seen = new Set(out.map((item) => item.id));
  for (const row of rows) {
    if (allowed.size > 0 && !allowed.has('*') && !allowed.has(row.id) && !allowed.has(row.model_id) && !allowed.has(row.alias || '')) {
      continue;
    }
    const publicId = String(row.model_id || row.id);
    if (seen.has(publicId)) continue;
    seen.add(publicId);
    out.push({
      id: publicId,
      object: 'model',
      owned_by: String(row.platform_name || 'yanzhi'),
      yanzhi_id: String(row.id),
    });
  }
  return out;
}
