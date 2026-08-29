// Embedding 服务：支持从任意已配置平台的 embedding 模型生成向量，未配置时兜底 Ollama。
// 知识库向量化 / 向量检索 / 实体抽取均经此模块。

import { db } from '../db.js';

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';

const EMBEDDING_MODEL_PREFERENCE = [
  'nomic-embed-text',
  'bge-m3',
  'bge-large-zh-v1.5',
  'bge-small-zh-v1.5',
  'mxbai-embed-large',
  'snowflake-arctic-embed',
];

// ── 配置读写（app_config 表）──

export interface EmbeddingConfig {
  platformId: string;
  modelId: string;
}

export function getEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('embedding_config') as any;
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value);
    return parsed?.platformId && parsed?.modelId ? parsed : null;
  } catch { return null; }
}

export function setEmbeddingConfig(cfg: EmbeddingConfig): void {
  db.prepare(
    'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
  ).run('embedding_config', JSON.stringify(cfg), Date.now());
}

// ── 列出所有平台的 embedding 模型（供前端选择）──

export function listEmbeddingModels() {
  const platforms = db.prepare('SELECT id, name, api_url, protocol FROM platform').all() as any[];
  const models = db.prepare(
    "SELECT id, platform_id, model_id, alias, type, enabled FROM model WHERE type = 'embedding' OR model_id LIKE '%embed%' OR model_id LIKE '%bge%'",
  ).all() as any[];
  return { platforms, models };
}

// ── 平台 embedding 调用（OpenAI 兼容 /v1/embeddings）──

async function embedViaPlatform(text: string, platformId: string, modelRowId: string): Promise<number[] | null> {
  const platform = db.prepare('SELECT api_url, api_key_enc, protocol, headers_json FROM platform WHERE id = ?').get(platformId) as any;
  if (!platform?.api_url) return null;
  const model = db.prepare('SELECT model_id FROM model WHERE id = ? AND platform_id = ?').get(modelRowId, platformId) as any;
  if (!model?.model_id) return null;
  const baseUrl = String(platform.api_url).replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (platform.api_key_enc) headers['Authorization'] = `Bearer ${platform.api_key_enc}`;
  try {
    const extra = platform.headers_json ? JSON.parse(platform.headers_json) : {};
    Object.assign(headers, extra || {});
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: model.model_id, input: String(text).slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const vec = data?.data?.[0]?.embedding || data?.embeddings?.[0] || data?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch { return null; }
}

// ── Ollama 兜底 ──

interface OllamaModel { name: string; type?: string }
let cachedModels: { list: OllamaModel[]; at: number } | null = null;
const MODEL_CACHE_TTL = 30_000;

async function fetchOllamaModels(): Promise<OllamaModel[]> {
  if (cachedModels && Date.now() - cachedModels.at < MODEL_CACHE_TTL) return cachedModels.list;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    const list: OllamaModel[] = (data?.models || []).map((m: any) => ({ name: m.name, type: m?.details?.type }));
    cachedModels = { list, at: Date.now() };
    return list;
  } catch { return []; }
}

function pickEmbeddingModel(models: OllamaModel[]): string | null {
  for (const pref of EMBEDDING_MODEL_PREFERENCE) {
    const hit = models.find((m) => m.name.toLowerCase() === pref || m.name.toLowerCase().startsWith(pref));
    if (hit) return hit.name;
  }
  const embedLike = models.find((m) => /embed|bge|e5/i.test(m.name));
  return embedLike ? embedLike.name : null;
}

function pickChatModel(models: OllamaModel[]): string | null {
  const nonEmbed = models.find((m) => !/embed|bge|e5/i.test(m.name));
  return nonEmbed ? nonEmbed.name : (models[0]?.name || null);
}

export async function isOllamaAvailable(): Promise<boolean> {
  try { const resp = await fetch(`${OLLAMA_BASE}/api/tags`); return resp.ok; } catch { return false; }
}

async function embedViaOllama(text: string): Promise<number[] | null> {
  const models = await fetchOllamaModels();
  if (models.length === 0) return null;
  const model = pickEmbeddingModel(models);
  if (!model) return null;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: String(text).slice(0, 8000) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const vec = data?.embeddings?.[0] || data?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch { return null; }
}

// ── 统一 embedText：优先用配置的平台 embedding，兜底 Ollama ──

export async function embedText(text: string): Promise<number[] | null> {
  const cfg = getEmbeddingConfig();
  if (cfg) {
    const vec = await embedViaPlatform(text, cfg.platformId, cfg.modelId);
    if (vec) return vec;
  }
  return embedViaOllama(text);
}

export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (const t of texts) out.push(await embedText(t));
  return out;
}

// ── Ollama chat（实体抽取用）──

export interface OllamaChatMessage { role: string; content: string }
export interface OllamaChatOptions { temperature?: number; maxTokens?: number; signal?: AbortSignal }
export interface OllamaChatResult { content: string; finishReason?: string }

export async function ollamaChat(
  messages: OllamaChatMessage[],
  options: OllamaChatOptions = {},
): Promise<OllamaChatResult | null> {
  const models = await fetchOllamaModels();
  if (models.length === 0) return null;
  const model = pickChatModel(models);
  if (!model) return null;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.filter((m) => m.content).map((m) => ({ role: m.role || 'user', content: String(m.content) })),
        stream: false,
        options: { temperature: options.temperature, num_predict: options.maxTokens },
      }),
      signal: options.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const content = data?.message?.content || '';
    if (!content) return null;
    return { content, finishReason: data?.done_reason };
  } catch { return null; }
}

export function getEmbeddingModelStatus() {
  const cfg = getEmbeddingConfig();
  return {
    backend: cfg ? 'platform' : 'ollama' as const,
    baseUrl: OLLAMA_BASE,
    config: cfg,
  };
}
