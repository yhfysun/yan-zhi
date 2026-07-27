import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Platform, Model, ModelType } from '@yan-zhi/shared';
import { CHAT_MODEL_TYPES } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

function rowToPlatform(r: any): Platform {
  return {
    id: r.id,
    name: r.name,
    protocol: r.protocol,
    apiUrl: r.api_url,
    apiKeyEnc: r.api_key_enc,
    apiKeyDec: r.api_key_enc || '',
    headers: r.headers_json ? tryParse(r.headers_json) : {},
    status: r.status === 1 ? 'healthy' : r.status === 0 ? 'down' : 'unknown',
    lastHealthAt: r.last_health_at,
    createdAt: r.created_at,
  };
}

function rowToModel(r: any): Model {
  return {
    id: r.id,
    platformId: r.platform_id,
    modelId: r.model_id,
    alias: r.alias,
    type: r.type,
    contextWindow: r.context_window,
    enabled: !!r.enabled,
    isDefault: !!r.is_default,
    capabilities: r.capabilities_json ? tryParse(r.capabilities_json) : undefined,
    pricing: r.pricing_json ? tryParse(r.pricing_json) : undefined,
    lastChatTestAt: r.last_chat_test_at || undefined,
    lastChatTestOk: r.last_chat_test_ok === null ? undefined : !!r.last_chat_test_ok,
  };
}

function tryParse(v: string) {
  try { return JSON.parse(v); } catch { return {}; }
}

/** 从模型 ID 自动推断模型类型 */
function inferModelType(modelId: string, apiType?: string): ModelType {
  const id = modelId.toLowerCase();
  // 已知聊天 LLM 模式
  if (/^(gpt|claude|gemini|llama|mistral|qwen|deepseek|yi|moonshot|ernie|spark|hunyuan|chatglm|baichuan|phi|openchat|falcon|command|cohere)/.test(id)) return 'llm';
  // embedding
  if (/embed/.test(id) || /ada-002/.test(id)) return 'embedding';
  // rerank
  if (/rerank/.test(id)) return 'rerank';
  // image generation
  if (/dall-e|image|img|stable.diffusion|flux|midjourney/.test(id)) return 'image';
  // video generation
  if (/video|sora|kling|pika|gen-|runway/.test(id)) return 'video';
  // audio transcription/translation
  if (/whisper|speech|audio.transcri/.test(id)) return 'audio';
  // TTS
  if (/tts|text.to.speech|elevenlabs|bark/.test(id)) return 'tts';
  // API 返回的 type 字段
  if (apiType) {
    const t = apiType.toLowerCase();
    if (t === 'chat' || t === 'llm') return 'llm';
    if (t === 'embedding' || t === 'embeddings') return 'embedding';
    if (t === 'rerank') return 'rerank';
    if (t === 'image') return 'image';
    if (t === 'video') return 'video';
    if (t === 'audio' || t === 'speech-to-text') return 'audio';
    if (t === 'tts' || t === 'text-to-speech') return 'tts';
  }
  return 'llm';
}

export const usePlatformStore = defineStore('platform', () => {
  const platforms = ref<Platform[]>([]);
  const models = ref<Model[]>([]);
  const loading = ref(false);

  const on = () => !!useAuthStore().isLoggedIn;

  async function loadPlatforms() {
    loading.value = true;
    try {
      if (on()) {
        const r = await api.get<any[]>('/platforms');
        if ('data' in r) {
          platforms.value = (r.data as any[]).map(rowToPlatform);
          const adapter = getPlatformAdapter();
          for (const row of r.data as any[]) {
            if (row.api_key_enc) {
              await adapter.keyring.set(`platform:${row.id}:apikey`, row.api_key_enc);
            }
          }
        }
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>('SELECT * FROM platform ORDER BY created_at DESC');
        platforms.value = rows.map(rowToPlatform);
      }
    } finally { loading.value = false; }
  }

  async function loadModels(platformId?: string) {
    if (on()) {
      const url = platformId ? `/platforms/${platformId}/models` : '/platforms/all-models';
      const r = await api.get<any[]>(url);
      if ('data' in r) models.value = (r.data as any[]).map(rowToModel);
      return;
    }
    const adapter = getPlatformAdapter();
    const rows = platformId
      ? await adapter.db.query<any>('SELECT * FROM model WHERE platform_id = ? ORDER BY is_default DESC', [platformId])
      : await adapter.db.query<any>('SELECT * FROM model ORDER BY platform_id, is_default DESC');
    models.value = rows.map(rowToModel);
  }

  async function addPlatform(p: Omit<Platform, 'id' | 'createdAt'>): Promise<string> {
    if (on()) {
      const r = await api.post<any>('/platforms', {
        name: p.name, protocol: p.protocol, apiUrl: p.apiUrl,
        apiKeyEnc: p.apiKeyEnc, headers: p.headers,
      });
      if ('data' in r) {
        const row = rowToPlatform(r.data);
        if (p.apiKeyEnc) {
          const adapter = getPlatformAdapter();
          await adapter.keyring.set(`platform:${row.id}:apikey`, p.apiKeyEnc);
        }
        platforms.value.unshift(row);
        return row.id;
      }
      throw new Error('添加平台失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('p_');
    await adapter.db.exec(
      'INSERT INTO platform (id, name, protocol, api_url, api_key_enc, headers_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, p.name, p.protocol, p.apiUrl, p.apiKeyEnc, JSON.stringify(p.headers || {}), 1, Date.now()],
    );
    if (p.apiKeyEnc) await adapter.keyring.set(`platform:${id}:apikey`, p.apiKeyEnc);
    await loadPlatforms();
    return id;
  }

  async function deletePlatform(id: string) {
    if (on()) {
      await api.delete(`/platforms/${id}`);
      const adapter = getPlatformAdapter();
      await adapter.keyring.delete(`platform:${id}:apikey`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM model WHERE platform_id = ?', [id]);
      await adapter.db.exec('DELETE FROM platform WHERE id = ?', [id]);
      await adapter.keyring.delete(`platform:${id}:apikey`);
    }
    await loadPlatforms();
  }

  async function updatePlatform(id: string, patch: Partial<{ name: string; protocol: string; apiUrl: string; apiKeyEnc: string; headers: Record<string, string>; status: string }>) {
    if (on()) {
      const body: any = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.protocol !== undefined) body.protocol = patch.protocol;
      if (patch.apiUrl !== undefined) body.apiUrl = patch.apiUrl;
      if (patch.apiKeyEnc !== undefined) body.apiKeyEnc = patch.apiKeyEnc;
      if (patch.headers !== undefined) body.headers = patch.headers;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/platforms/${id}`, body);
      if (patch.apiKeyEnc) {
        const adapter = getPlatformAdapter();
        await adapter.keyring.set(`platform:${id}:apikey`, patch.apiKeyEnc);
      }
    } else {
      const adapter = getPlatformAdapter();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
      if (patch.protocol !== undefined) { sets.push('protocol = ?'); params.push(patch.protocol); }
      if (patch.apiUrl !== undefined) { sets.push('api_url = ?'); params.push(patch.apiUrl); }
      if (patch.apiKeyEnc !== undefined) { sets.push('api_key_enc = ?'); params.push(patch.apiKeyEnc); }
      if (patch.headers !== undefined) { sets.push('headers_json = ?'); params.push(JSON.stringify(patch.headers)); }
      if (sets.length === 0) return;
      params.push(id);
      await adapter.db.exec(`UPDATE platform SET ${sets.join(', ')} WHERE id = ?`, params);
      if (patch.apiKeyEnc) await adapter.keyring.set(`platform:${id}:apikey`, patch.apiKeyEnc);
    }
    await loadPlatforms();
  }

  async function addModel(m: Omit<Model, 'id'>): Promise<string> {
    if (on()) {
      const r = await api.post<any>(`/platforms/${m.platformId}/models`, {
        modelId: m.modelId, alias: m.alias, type: m.type,
        contextWindow: m.contextWindow, capabilities: m.capabilities, pricing: m.pricing,
        enabled: m.enabled, isDefault: m.isDefault,
      });
      if ('data' in r) { await loadModels(m.platformId); return (r.data as any).id; }
      throw new Error('添加模型失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('m_');
    await adapter.db.exec(
      'INSERT INTO model (id, platform_id, model_id, alias, type, context_window, enabled, is_default, capabilities_json, pricing_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, m.platformId, m.modelId, m.alias || null, m.type, m.contextWindow,
        m.enabled ? 1 : 0, m.isDefault ? 1 : 0,
        m.capabilities ? JSON.stringify(m.capabilities) : null,
        m.pricing ? JSON.stringify(m.pricing) : null],
    );
    await loadModels(m.platformId);
    return id;
  }

  async function updateModel(id: string, patch: Partial<Model>) {
    if (on()) {
      const body: any = {};
      if (patch.alias !== undefined) body.alias = patch.alias;
      if (patch.contextWindow !== undefined) body.contextWindow = patch.contextWindow;
      if (patch.enabled !== undefined) body.enabled = patch.enabled;
      if (patch.isDefault !== undefined) body.isDefault = patch.isDefault;
      if (patch.type !== undefined) body.type = patch.type;
      if (patch.capabilities !== undefined) body.capabilities = patch.capabilities;
      if (patch.pricing !== undefined) body.pricing = patch.pricing;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/platforms/models/${id}`, body);
      if (patch.platformId) await loadModels(patch.platformId);
      else await loadModels();
      return;
    }
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.alias !== undefined) { sets.push('alias = ?'); params.push(patch.alias); }
    if (patch.contextWindow !== undefined) { sets.push('context_window = ?'); params.push(patch.contextWindow); }
    if (patch.enabled !== undefined) { sets.push('enabled = ?'); params.push(patch.enabled ? 1 : 0); }
    if (patch.isDefault !== undefined) { sets.push('is_default = ?'); params.push(patch.isDefault ? 1 : 0); }
    if (patch.type !== undefined) { sets.push('type = ?'); params.push(patch.type); }
    if (patch.capabilities !== undefined) { sets.push('capabilities_json = ?'); params.push(JSON.stringify(patch.capabilities)); }
    if (patch.pricing !== undefined) { sets.push('pricing_json = ?'); params.push(JSON.stringify(patch.pricing)); }
    if (sets.length === 0) return;
    params.push(id);
    await adapter.db.exec(`UPDATE model SET ${sets.join(', ')} WHERE id = ?`, params);
    if (patch.isDefault) {
      const m = models.value.find((x) => x.id === id);
      if (m) await adapter.db.exec('UPDATE model SET is_default = 0 WHERE platform_id = ? AND id != ?', [m.platformId, id]);
    }
    if (patch.platformId !== undefined) await loadModels(patch.platformId);
    else await loadModels();
  }

  async function testModel(modelId: string): Promise<{ ok: boolean; msg: string; durationMs?: number }> {
    const m = models.value.find((x) => x.id === modelId);
    if (!m) return { ok: false, msg: '模型不存在' };
    const p = platforms.value.find((x) => x.id === m.platformId);
    if (!p) return { ok: false, msg: '平台不存在' };
    const client = new LlmClient(p, m);
    const r = await client.chatTest();
    return { ok: r.ok, durationMs: r.durationMs, msg: r.ok ? `连通正常（${r.durationMs}ms）` : (r.msg || '请求失败') };
  }

  async function deleteModel(id: string) {
    if (on()) {
      await api.delete(`/platforms/models/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      const m = models.value.find((x) => x.id === id);
      await adapter.db.exec('DELETE FROM model WHERE id = ?', [id]);
      if (m) await loadModels(m.platformId);
      return;
    }
    await loadModels();
  }

  async function fetchRemoteModels(platformId: string): Promise<string[]> {
    const p = platforms.value.find((x) => x.id === platformId);
    if (!p) throw new Error('平台不存在');
    const client = new LlmClient(p, {} as Model);
    const list = await client.listModels();
    if (on()) {
      await api.post('/platforms/models/batch', {
        platformId,
        models: list.map((m) => ({ modelId: m.id, type: m.type || 'llm', contextWindow: 131072 })),
      });
    } else {
      const adapter = getPlatformAdapter();
      const existing = new Map(
        models.value.filter((m) => m.platformId === platformId).map((m) => [m.modelId, m]),
      );
      const remoteIds = new Set(list.map((item) => item.id));
      // 新增或重新启用远程有的模型
      for (const item of list) {
        const local = existing.get(item.id);
        const type = inferModelType(item.id, item.type);
        if (local) {
          await adapter.db.exec(
            'UPDATE model SET type = ?, enabled = 1 WHERE id = ?',
            [type, local.id],
          );
        } else {
          await adapter.db.exec(
            'INSERT INTO model (id, platform_id, model_id, type, context_window, enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uid('m_'), platformId, item.id, type, 131072, 1, 0],
          );
        }
      }
      // 禁用本地有但远程已删除的模型
      for (const [modelId, m] of existing) {
        if (!remoteIds.has(modelId) && m.enabled) {
          await adapter.db.exec('UPDATE model SET enabled = 0 WHERE id = ?', [m.id]);
        }
      }
    }
    await loadModels(platformId);
    return list.map((x) => x.id);
  }

  async function testConnectivity(platformId: string): Promise<{ ok: boolean; msg: string; durationMs?: number }> {
    const p = platforms.value.find((x) => x.id === platformId);
    if (!p) return { ok: false, msg: '平台不存在' };
    const start = Date.now();
    try {
      const client = new LlmClient(p, {} as Model);
      const ok = await client.ping();
      const durationMs = Date.now() - start;
      return { ok, msg: ok ? '连通正常' : '请求失败', durationMs };
    } catch (e: any) {
      return { ok: false, msg: e?.message || '请求异常' };
    }
  }

  async function testPlatformConfig(config: { apiUrl: string; apiKey?: string; headers?: Record<string, string> }) {
    if (!config.apiUrl) return { ok: false, msg: 'API URL 必填' };
    const start = Date.now();
    try {
      const res = await fetch(`${config.apiUrl.replace(/\/$/, '')}/v1/models`, {
        headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...(config.headers || {}) },
        mode: 'cors',
      });
      const ms = Date.now() - start;
      if (!res.ok) return { ok: false, msg: `HTTP ${res.status} ${res.statusText}`, durationMs: ms };
      const data = await res.json();
      return { ok: true, msg: `连通正常，${(data.data || []).length} 个模型`, durationMs: ms };
    } catch (e: any) {
      let msg = e?.message || '请求异常';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = `请求被浏览器拦截，可能是 CORS 跨域问题。请在 ${config.apiUrl} 服务端添加响应头：Access-Control-Allow-Origin: *`;
      }
      return { ok: false, msg, durationMs: Date.now() - start };
    }
  }

  async function fetchModelsPreview(config: { apiUrl: string; apiKey?: string; headers?: Record<string, string> }) {
    if (!config.apiUrl) return { ok: false, models: [] as { id: string; type?: string }[], msg: 'API URL 必填' };
    try {
      const res = await fetch(`${config.apiUrl.replace(/\/$/, '')}/v1/models`, {
        headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...(config.headers || {}) },
        mode: 'cors',
      });
      if (!res.ok) return { ok: false, models: [], msg: `HTTP ${res.status} ${res.statusText}` };
      const data = await res.json();
      return { ok: true, models: (data.data || []).map((m: any) => ({ id: m.id, type: inferModelType(m.id, m.type) })), msg: `共 ${(data.data || []).length} 个` };
    } catch (e: any) {
      let msg = e?.message || '请求异常';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = `请求被浏览器拦截，可能是 CORS 跨域问题。请在 ${config.apiUrl} 服务端添加响应头：Access-Control-Allow-Origin: *`;
      }
      return { ok: false, models: [], msg };
    }
  }

  async function startHealthCheck() {
    if (platforms.value.length === 0) return;
    for (const p of platforms.value) {
      try {
        const ok = await testConnectivity(p.id);
        const current = platforms.value.find((x) => x.id === p.id);
        if (current) current.status = ok.ok ? 'healthy' : 'down';
      } catch {}
    }
  }

  return {
    platforms, models, loading,
    loadPlatforms, loadModels, addPlatform, updatePlatform, deletePlatform,
    addModel, updateModel, deleteModel,
    fetchRemoteModels, testConnectivity, testModel,
    testPlatformConfig, fetchModelsPreview, startHealthCheck,
  };
});
