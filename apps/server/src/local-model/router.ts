import { Router, type Request, type Response } from 'express';
import { LOCAL_MODEL_ID } from './service.js';
import { generateLocalChat, getLocalModelStatus } from './engine.js';
import { embedTexts, getEmbeddingModelStatus } from './embedding-engine.js';
import type { OpenAiTool, OpenAiToolCall } from './tool-call-adapter.js';

const router = Router();

interface OpenAiMessage {
  role?: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

interface LocalReply {
  content?: string;
  toolCalls?: OpenAiToolCall[];
}

function hasDeterministicToolTrigger(messages: OpenAiMessage[], tools: OpenAiTool[] | undefined) {
  const text = lastUserText(messages);
  return Boolean(
    (hasTool(tools, 'task_plan') && /计划|规划|步骤|安排/.test(text)) ||
    (hasTool(tools, 'confirm_user') && /确认|收集|逐项/.test(text)),
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lastUserText(messages: OpenAiMessage[] = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.content) return message.content;
  }
  return messages.at(-1)?.content || '';
}

function hasTool(tools: OpenAiTool[] | undefined, name: string) {
  return Boolean(tools?.some((tool) => tool.type === 'function' && tool.function?.name === name));
}

function tryArithmetic(input: string): string | null {
  const expression = input.trim();
  if (!/^[\d\s+\-*/%().^]+$/.test(expression)) return null;
  if (!/[\d]/.test(expression) || !/[+\-*/%^]/.test(expression)) return null;
  try {
    const normalized = expression.replace(/\^/g, '**');
    const value = Function(`"use strict"; return (${normalized});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value * 10000) / 10000;
    return `${expression} = ${rounded}`;
  } catch {
    return null;
  }
}

function planStepsFrom(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)、]\s*/, ''))
    .filter(Boolean);

  if (lines.length >= 2) {
    return lines.slice(1, 7).map((line) => ({ title: line }));
  }

  return [
    { title: '梳理需求与目标' },
    { title: '拆解任务并执行' },
    { title: '汇总结果与交付物' },
  ];
}

function buildReply(messages: OpenAiMessage[], tools: OpenAiTool[] | undefined): LocalReply {
  const text = lastUserText(messages);
  const arithmetic = tryArithmetic(text);
  if (arithmetic) return { content: arithmetic };

  const lower = text.toLowerCase();

  if (hasTool(tools, 'task_plan') && /计划|规划|步骤|安排/.test(text)) {
    const firstLine = text.split(/\n+/)[0]?.trim() || '任务计划';
    return {
      toolCalls: [
        {
          id: 'call_local_plan',
          type: 'function',
          function: {
            name: 'task_plan',
            arguments: JSON.stringify({
              title: firstLine.replace(/^[。，,:\s]+/, ''),
              steps: planStepsFrom(text),
            }),
          },
        },
      ],
    };
  }

  if (hasTool(tools, 'confirm_user') && /确认|收集|逐项/.test(text)) {
    return {
      toolCalls: [
        {
          id: 'call_local_confirm',
          type: 'function',
          function: {
            name: 'confirm_user',
            arguments: JSON.stringify({
              title: '需求确认',
              pages: [
                {
                  question: '请确认你的需求，并补充必要说明：',
                  description: text,
                  allowText: true,
                  allowSupplement: true,
                  required: true,
                },
              ],
            }),
          },
        },
      ],
    };
  }

  if (/(几点|时间|日期|今天)/.test(text)) {
    return {
      content: `现在是 ${new Date().toLocaleString('zh-CN', {
        hour12: false,
        timeZone: 'Asia/Shanghai',
      })}。`,
    };
  }

  if (/(你是谁|你能做什么|能力|介绍)/.test(text)) {
    return {
      content:
        '我是项目内置的本地规则小模型。当前版本没有加载真实权重，主要用来验证聊天、计划、确认向导和 OpenAI 兼容接口已经贯通。\n\n' +
        '我可以做简单算术、查看时间、识别“计划/确认”需求并触发对应工具；后续替换为 node-llama-cpp、ONNX 或 Python transformers 推理即可获得真实语义能力。',
    };
  }

  const toolNames = (tools || [])
    .map((tool) => tool.function?.name)
    .filter(Boolean);
  const toolHint = toolNames.length
    ? `\n\n当前可用工具：${toolNames.slice(0, 12).join('、')}。`
    : '';

  return {
    content: `已收到你的消息：${text || '(空消息)'}。${toolHint}`,
  };
}

function splitIntoChunks(text: string, size = 6) {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(''));
  }
  return chunks.length ? chunks : [''];
}

function estimateTokens(text: string) {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = text.replace(/[\u4e00-\u9fff]/g, '').length;
  return Math.max(1, chinese + Math.ceil(ascii / 4));
}

function hashEmbedding(text: string, dimensions = 384) {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length === 0) tokens.push(text.toLowerCase());

  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

router.get('/status', (_req: Request, res: Response) => {
  res.json(getLocalModelStatus());
});

router.get('/v1/models', (_req: Request, res: Response) => {
  res.json({
    object: 'list',
    data: [{ id: LOCAL_MODEL_ID, type: 'llm' }],
  });
});

// 内置 embedding（OpenAI 兼容）：POST /v1/embeddings { input: string|string[] }
router.post('/v1/embeddings', async (req: Request, res: Response) => {
  const body = (req.body || {}) as { input?: string | string[] };
  const input = body.input;
  const inputs = Array.isArray(input) ? input : [input ?? ''];
  const cleaned = inputs.map((t) => String(t || '').trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) {
    res.status(400).json({ error: 'input 不能为空' });
    return;
  }
  const embeddings = await embedTexts(cleaned);
  if (embeddings.some((v) => v === null)) {
    res.status(503).json({ error: getEmbeddingModelStatus().error || '内置 embedding 模型不可用' });
    return;
  }
  res.json({
    object: 'list',
    model: LOCAL_MODEL_ID,
    data: embeddings.map((vec, i) => ({ object: 'embedding', index: i, embedding: vec })),
    usage: { prompt_tokens: cleaned.reduce((s, t) => s + Math.ceil(t.length / 2), 0), total_tokens: cleaned.length },
  });
});

router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    model?: string;
    messages?: OpenAiMessage[];
    tools?: OpenAiTool[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = body.model || LOCAL_MODEL_ID;
  const deterministicReply = hasDeterministicToolTrigger(messages, body.tools)
    ? buildReply(messages, body.tools)
    : null;
  const promptTokens = messages.reduce(
    (sum, message) => sum + estimateTokens(message.content || ''),
    0,
  );

  const sendJson = (content: string, toolCalls: LocalReply['toolCalls'], finishReason: string) => {
    res.json({
      id: `chatcmpl-local-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: toolCalls && toolCalls.length
            ? { role: 'assistant', content: null, tool_calls: toolCalls }
            : { role: 'assistant', content },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: estimateTokens(content || JSON.stringify(toolCalls || [])),
      },
    });
  };

  const streamHeaders = () => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  };

  const writeDelta = (delta: Record<string, unknown>, finishReason: string | null = null, usage?: Record<string, number>) => {
    res.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl-local-stream',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
        usage,
      })}\n\n`,
    );
  };

  const finishStream = (finishReason: string, completionTokens: number) => {
    writeDelta({}, finishReason, {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    });
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const streamToolCalls = async (toolCalls: OpenAiToolCall[]) => {
    for (const [index, toolCall] of toolCalls.entries()) {
      writeDelta({
        role: index === 0 ? 'assistant' : undefined,
        tool_calls: [
          {
            index,
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          },
        ],
      });
      await delay(8);
    }
  };

  if (body.stream) {
    streamHeaders();
    let first = true;
    let streamedCompletionTokens = 0;
    let real;
    try {
      real = await generateLocalChat(messages, {
        temperature: body.temperature,
        maxTokens: body.max_tokens,
        tools: body.tools,
        onTextChunk: (text) => {
          streamedCompletionTokens += estimateTokens(text);
          writeDelta({ role: first ? 'assistant' : undefined, content: text });
          first = false;
        },
      });
    } catch (error) {
      console.error(`[local-model] 推理失败，回退到规则回复: ${error instanceof Error ? error.message : String(error)}`);
      real = null;
    }

    if (real) {
      if (real.toolCalls.length > 0) {
        await streamToolCalls(real.toolCalls);
        finishStream('tool_calls', Math.max(1, estimateTokens(JSON.stringify(real.toolCalls))));
      } else {
        finishStream(real.finishReason, Math.max(1, streamedCompletionTokens));
      }
      return;
    }

    const fallback = deterministicReply || buildReply(messages, body.tools);
    const content = fallback.content || '';
    const toolCalls = fallback.toolCalls || [];
    const finishReason = toolCalls.length ? 'tool_calls' : 'stop';
    if (toolCalls.length > 0) {
      await streamToolCalls(toolCalls);
    } else {
      let fallbackFirst = true;
      for (const part of splitIntoChunks(content, 6)) {
        writeDelta({ role: fallbackFirst ? 'assistant' : undefined, content: part });
        fallbackFirst = false;
        await delay(8);
      }
    }
    finishStream(finishReason, estimateTokens(content || JSON.stringify(toolCalls)));
    return;
  }

  let real;
  try {
    real = await generateLocalChat(messages, {
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      tools: body.tools,
    });
  } catch (error) {
    console.error(`[local-model] 推理失败，回退到规则回复: ${error instanceof Error ? error.message : String(error)}`);
    real = null;
  }
  if (real) {
    if (real.toolCalls.length > 0) {
      sendJson(real.content, real.toolCalls, 'tool_calls');
      return;
    }
    if (deterministicReply) {
      const toolCalls = deterministicReply.toolCalls || [];
      sendJson(deterministicReply.content || '', toolCalls, toolCalls.length ? 'tool_calls' : 'stop');
      return;
    }
    sendJson(real.content, [], real.finishReason);
    return;
  }

  const fallback = deterministicReply || buildReply(messages, body.tools);
  const toolCalls = fallback.toolCalls || [];
  sendJson(fallback.content || '', toolCalls, toolCalls.length ? 'tool_calls' : 'stop');
});

export default router;
