// server 端「用 DB 平台/模型行做一次非流式 LLM 调用」的唯一出口（P2 收敛，2026-10-04）。
//
// ★ 为什么要存在：memory-dreaming 与 scheduled-tasks 各自手写了一份 callModel
//   （拼 URL + 鉴权头 + 请求体 + 错误文案），**都不走 LlmClient** —— 于是 client.ts
//   后来修的 sanitize/自愈/错误 hint 全都吃不到，属典型"平行实现行为漂移"。
//   收口后：协议头走 buildProtocolHeaders（与 LlmClient 同源），请求走 LlmClient.chat
//   （401/404/429 hint、URL 透出、清洗逻辑统一受益）。
//
// ★ API Key 取值：走 nodeAdapter.keyring（`platform:<id>:apikey`），其内部已实现
//   token-pool 的 getActiveApiKey 回退 —— 平行实现里手写的 pickToken 逻辑因此可删
//   （pauseIfNeeded 限速停顿不在 keyring 职责内，由调用方自行决定是否执行）。

import { LlmClient } from '@yan-zhi/core';
import type { Platform, Model, Message } from '@yan-zhi/shared';

/** DB 联查行（platform ⋈ model）的最小字段面：两处调用方的 SELECT 口径略有差异，字段都可选 */
export interface PlatformModelRow {
  /** 平台 id（keyring 按 id 取 key；memory-dreaming 的联查需补 `p.id AS pid`） */
  platform_id?: string;
  pid?: string;
  model_id?: string;
  api_url?: string;
  api_key_enc?: string;
  protocol?: string;
  headers_json?: string | null;
}

function parseExtraHeaders(row: PlatformModelRow): Record<string, string> {
  try {
    return JSON.parse(row.headers_json || '{}') || {};
  } catch {
    return {};
  }
}

/** 由 DB 行组装 LlmClient（server 端直连上游，无代理；key 由 nodeAdapter.keyring 解析） */
export function buildClientFromRow(row: PlatformModelRow): LlmClient {
  const platformId = row.platform_id || row.pid || '';
  if (!platformId) throw new Error('平台行缺少 id（联查需带 p.id）');
  const platform = {
    id: platformId,
    name: '',
    protocol: (row.protocol || 'openai') as Platform['protocol'],
    apiUrl: String(row.api_url || ''),
    apiKeyEnc: row.api_key_enc || '',
    headers: parseExtraHeaders(row),
    status: 'unknown' as const,
  } as Platform;
  const model = {
    id: '',
    platformId,
    modelId: String(row.model_id || ''),
    type: 'llm',
    contextWindow: 0,
    enabled: true,
    isDefault: false,
  } as unknown as Model;
  return new LlmClient(platform, model);
}

export interface ChatViaRowOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

/** 非流式调用：返回文本 + token 用量（usage 缺失时 tokens=0） */
export async function chatViaRow(
  row: PlatformModelRow,
  messages: Array<{ role: string; content: string }>,
  options?: ChatViaRowOptions,
): Promise<{ content: string; tokens: number }> {
  if (!String(row.api_url || '').trim()) throw new Error('平台未配置 API URL');
  const client = buildClientFromRow(row);
  const chunk = await client.chat(
    messages.map((m) => ({
      id: '', conversationId: '', role: m.role as Message['role'], content: m.content, createdAt: 0,
    })) as unknown as Message[],
    { maxTokens: options?.maxTokens, signal: options?.signal },
  );
  const content = chunk.delta?.content || '';
  const tokens = (chunk.usage?.promptTokens || 0) + (chunk.usage?.completionTokens || 0);
  return { content, tokens };
}
