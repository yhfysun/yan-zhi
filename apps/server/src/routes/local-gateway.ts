import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { LlmClient } from '@yan-zhi/core';
import { isMissingUsage, type TokenUsageDetail } from '@yan-zhi/shared';
import { db } from '../db.js';
import {
  checkGatewayKeyLimits,
  consumeGatewayRate,
  gatewayUsageToday,
  recordGatewayUsage,
  resolveGatewayClientKey,
  type GatewayClientKeyRecord,
} from '../services/gateway-client-keys.js';
import { listGatewayModels, resolveGatewayModel } from '../services/gateway-model-resolver.js';
import {
  GatewayRequestError,
  normalizeGatewayChat,
  openAiError,
} from '../services/gateway-openai-chat.js';
import { estimateUsageDetail, recordStandaloneUsage } from '../services/usage-ledger.js';

const router = Router();

function isLoopback(address: string | undefined): boolean {
  const value = String(address || '').toLowerCase();
  return value === '127.0.0.1'
    || value === '::1'
    || value === '::ffff:127.0.0.1';
}

router.use((req: Request, res: Response, next: () => void) => {
  if (process.env.YZ_GATEWAY_ALLOW_REMOTE === '1') {
    next();
    return;
  }
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  if (isLoopback(req.socket.remoteAddress) && (!forwarded || isLoopback(forwarded))) {
    next();
    return;
  }
  res.status(403).json(openAiError(403, 'gateway_local_only', '本地模型网关默认只允许本机访问'));
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'yan-zhi-local-gateway', version: 1 });
});

function gatewayAuth(req: Request, res: Response, next: () => void): void {
  const key = resolveGatewayClientKey(db, req.headers.authorization);
  if (!key) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json(openAiError(401, 'invalid_api_key', '网关密钥无效、已停用或已过期'));
    return;
  }
  res.locals.gatewayKey = key;
  next();
}

function enforceGatewayLimits(req: Request, res: Response, next: () => void): void {
  const key = res.locals.gatewayKey as GatewayClientKeyRecord;
  const rate = consumeGatewayRate(key.id, key.rpmLimit);
  if (!rate.ok) {
    res.setHeader('Retry-After', '60');
    res.status(429).json(openAiError(429, rate.code, rate.message));
    return;
  }
  const usage = gatewayUsageToday(db, key.id);
  const limits = checkGatewayKeyLimits({
    dailyTokenLimit: key.dailyTokenLimit,
    dailyCostLimitCny: key.dailyCostLimitCny,
    rpmLimit: key.rpmLimit,
  }, usage);
  if (!limits.ok) {
    res.status(limits.code === 'daily_cost_limit' ? 402 : 429)
      .json(openAiError(limits.code === 'daily_cost_limit' ? 402 : 429, limits.code, limits.message));
    return;
  }
  next();
}

function gatewayError(res: Response, error: unknown): void {
  if (res.headersSent) {
    try {
      res.write(`data: ${JSON.stringify(openAiError(502, 'gateway_error', '模型调用中断'))}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch { /* client disconnected */ }
    return;
  }
  if (error instanceof GatewayRequestError) {
    res.status(error.status).json(openAiError(error.status, error.code, error.message));
    return;
  }
  const status = Number((error as any)?.status);
  // 上游鉴权/模型不存在不能伪装成“网关密钥无效”，否则 OpenAI 客户端会直接停止重试。
  const safeStatus = status === 400 || status === 409 || status === 422 || status === 429
    ? status
    : 502;
  const code = String((error as any)?.code || (safeStatus === 502 ? 'upstream_error' : 'gateway_error'));
  const message = String((error as any)?.message || '模型调用失败').slice(0, 1_000);
  res.status(safeStatus).json(openAiError(safeStatus, code, message));
}

function usageDetail(
  detail: TokenUsageDetail | undefined,
  requestBody: unknown,
  outputText: string,
): { detail: TokenUsageDetail; estimated: boolean } {
  if (detail && !isMissingUsage(detail)) return { detail, estimated: false };
  return {
    detail: estimateUsageDetail({ inputText: JSON.stringify(requestBody), outputText }),
    estimated: true,
  };
}

function usagePayload(detail: TokenUsageDetail): Record<string, unknown> {
  const prompt = detail.inputTokens;
  const completion = detail.outputTokens;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: {
      cached_tokens: detail.cacheReadTokens,
    },
  };
}

function writeSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function recordGatewayCall(input: {
  key: GatewayClientKeyRecord;
  requestId: string;
  requestedModel: string;
  platformId: string;
  apiModelId: string;
  status: 'ok' | 'error' | 'aborted';
  detail?: TokenUsageDetail;
  requestBody: unknown;
  outputText: string;
  startedAt: number;
  errorCode?: string;
}): { detail: TokenUsageDetail; costCny: number; estimated: boolean } {
  const normalized = usageDetail(input.detail, input.requestBody, input.outputText);
  const billed = input.status === 'ok'
    ? recordStandaloneUsage({
        conversationId: '',
        userId: input.key.userId,
        platformId: input.platformId,
        modelId: input.apiModelId,
        source: 'gateway',
        detail: normalized.detail,
        inputText: JSON.stringify(input.requestBody),
        outputText: input.outputText,
      })
    : { costCny: 0, unpriced: false };
  recordGatewayUsage(db, {
    keyId: input.key.id,
    userId: input.key.userId,
    requestId: input.requestId,
    protocol: 'openai-chat',
    requestedModel: input.requestedModel,
    platformId: input.platformId,
    modelId: input.apiModelId,
    status: input.status,
    inputTokens: normalized.detail.inputTokens,
    cacheReadTokens: normalized.detail.cacheReadTokens,
    cacheWriteTokens: normalized.detail.cacheWriteTokens,
    outputTokens: normalized.detail.outputTokens,
    costCny: billed.costCny,
    estimated: normalized.estimated || billed.unpriced,
    latencyMs: Date.now() - input.startedAt,
    errorCode: input.errorCode,
  });
  return { detail: normalized.detail, costCny: billed.costCny, estimated: normalized.estimated || billed.unpriced };
}

router.get('/v1/models', gatewayAuth, (req: Request, res: Response) => {
  const key = res.locals.gatewayKey as GatewayClientKeyRecord;
  res.json({
    object: 'list',
    data: listGatewayModels(db, key.userId, key.allowedModels),
  });
});

router.post('/v1/chat/completions', gatewayAuth, enforceGatewayLimits, async (req: Request, res: Response) => {
  const key = res.locals.gatewayKey as GatewayClientKeyRecord;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  res.setHeader('X-Yanzhi-Request-Id', requestId);
  try {
    const body = req.body as Record<string, unknown>;
    const normalized = normalizeGatewayChat(body);
    const requestedModel = String(body.model || 'auto');
    const resolved = resolveGatewayModel(db, key.userId, requestedModel, key.allowedModels);
    if ('error' in resolved) {
      const status = resolved.code === 'model_not_allowed' ? 403 : 404;
      res.status(status).json(openAiError(status, resolved.code, resolved.error));
      return;
    }

    const client = new LlmClient(resolved.platform, resolved.model);
    const stream = body.stream === true;
    const options = {
      tools: normalized.tools,
      temperature: normalized.temperature,
      maxTokens: normalized.maxTokens,
      topP: normalized.topP,
      frequencyPenalty: normalized.frequencyPenalty,
      presencePenalty: normalized.presencePenalty,
      toolChoice: normalized.toolChoice,
      responseFormat: normalized.responseFormat,
    };

    if (!stream) {
      const chunk = await client.chat(normalized.messages, options);
      const outputText = `${chunk.delta?.content || ''}${chunk.delta?.reasoningContent || ''}`;
      const recorded = recordGatewayCall({
        key, requestId, requestedModel, platformId: resolved.platform.id,
        apiModelId: resolved.model.modelId, status: 'ok', detail: chunk.usage?.detail,
        requestBody: body, outputText, startedAt,
      });
      res.json({
        id: `chatcmpl_${requestId}`,
        object: 'chat.completion',
        created: Math.floor(startedAt / 1000),
        model: requestedModel,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: chunk.delta?.content || '',
            ...(chunk.delta?.reasoningContent ? { reasoning_content: chunk.delta.reasoningContent } : {}),
            ...(chunk.delta?.toolCalls?.length ? { tool_calls: chunk.delta.toolCalls } : {}),
          },
          finish_reason: chunk.finishReason || 'stop',
        }],
        usage: usagePayload(recorded.detail),
      });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const chunkId = `chatcmpl_${requestId}`;
    const created = Math.floor(startedAt / 1000);
    let outputText = '';
    let lastDetail: TokenUsageDetail | undefined;
    let finishReason = 'stop';
    let failed = false;
    writeSse(res, {
      id: chunkId, object: 'chat.completion.chunk', created, model: requestedModel,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    });
    try {
      for await (const chunk of client.chatStream(normalized.messages, { ...options, signal: abort.signal })) {
        if (chunk.usage?.detail) lastDetail = chunk.usage.detail;
        if (chunk.delta?.content) outputText += chunk.delta.content;
        if (chunk.delta?.reasoningContent) outputText += chunk.delta.reasoningContent;
        if (chunk.delta?.content || chunk.delta?.reasoningContent || chunk.delta?.toolCalls?.length) {
          writeSse(res, {
            id: chunkId, object: 'chat.completion.chunk', created, model: requestedModel,
            choices: [{
              index: 0,
              delta: {
                ...(chunk.delta?.content ? { content: chunk.delta.content } : {}),
                ...(chunk.delta?.reasoningContent ? { reasoning_content: chunk.delta.reasoningContent } : {}),
                ...(chunk.delta?.toolCalls?.length ? { tool_calls: chunk.delta.toolCalls } : {}),
              },
              finish_reason: null,
            }],
          });
        }
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
    } catch (error) {
      if (abort.signal.aborted) {
        recordGatewayCall({
          key, requestId, requestedModel, platformId: resolved.platform.id,
          apiModelId: resolved.model.modelId, status: 'aborted', detail: lastDetail,
          requestBody: body, outputText, startedAt, errorCode: 'client_disconnected',
        });
        return;
      }
      failed = true;
      recordGatewayCall({
        key, requestId, requestedModel, platformId: resolved.platform.id,
        apiModelId: resolved.model.modelId, status: 'error', detail: lastDetail,
        requestBody: body, outputText, startedAt,
        errorCode: String((error as any)?.code || 'upstream_error'),
      });
      gatewayError(res, error);
      return;
    }
    if (!failed) {
      const recorded = recordGatewayCall({
        key, requestId, requestedModel, platformId: resolved.platform.id,
        apiModelId: resolved.model.modelId, status: 'ok', detail: lastDetail,
        requestBody: body, outputText, startedAt,
      });
      writeSse(res, {
        id: chunkId, object: 'chat.completion.chunk', created, model: requestedModel,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        usage: usagePayload(recorded.detail),
      });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    gatewayError(res, error);
  }
});

export default router;
