import { db } from '../db.js';

export const LOCAL_PLATFORM_NAME = '内置小模型';
export const LOCAL_MODEL_ID = 'qwen2.5-1.5b-instruct';

function port() {
  return process.env.PORT || '3001';
}

export function localModelBaseUrl() {
  return `http://127.0.0.1:${port()}/local-model`;
}

/**
 * 为当前用户惰性注册一个本地 OpenAI-compatible 平台和模型。
 * 使用确定性 id，重复调用只会修正配置而不会产生重复记录。
 */
export function ensureLocalModel(userId: string) {
  const platformId = `local-model-${userId}`;
  const now = Date.now();

  const existingPlatform = db.prepare('SELECT id FROM platform WHERE id = ?').get(platformId);
  if (!existingPlatform) {
    db.prepare(
      `INSERT INTO platform
        (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, is_builtin, created_at)
       VALUES (?, ?, ?, 'openai', ?, NULL, '{}', 1, 1, ?)`,
    ).run(platformId, userId, LOCAL_PLATFORM_NAME, localModelBaseUrl(), now);
  } else {
    // 端口可能变化，启动时或每次访问时保持 URL 与当前服务一致。
    db.prepare(
      `UPDATE platform
       SET name = ?, protocol = 'openai', api_url = ?, status = 1, is_builtin = 1
       WHERE id = ?`,
    ).run(LOCAL_PLATFORM_NAME, localModelBaseUrl(), platformId);
  }

  const llmModelId = `local-model-${userId}-llm`;
  const existingLlm = db.prepare('SELECT id FROM model WHERE id = ?').get(llmModelId);
  if (!existingLlm) {
    db.prepare(
      `INSERT INTO model
        (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, is_builtin, created_at)
       VALUES (?, ?, ?, ?, ?, 'llm', 8192, ?, '{}', 1, 1, 1, ?)`,
    ).run(llmModelId, platformId, userId, LOCAL_MODEL_ID, '本地小模型（Qwen2.5 1.5B）', JSON.stringify(['function_call']), now);
  } else {
    db.prepare(
      `UPDATE model
       SET platform_id = ?, model_id = ?, alias = ?, type = 'llm', context_window = 8192,
           capabilities_json = ?, enabled = 1, is_default = 1, is_builtin = 1
       WHERE id = ?`,
    ).run(platformId, LOCAL_MODEL_ID, '本地小模型（Qwen2.5 1.5B）', JSON.stringify(['function_call']), llmModelId);
  }

  // 旧版本可能残留本地 embedding 模型；这里统一清理，避免它出现在模型管理或知识库里。
  db.prepare("DELETE FROM model WHERE platform_id = ? AND type = 'embedding'").run(platformId);

  return { platformId, llmModelId };
}
