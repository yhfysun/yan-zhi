#!/usr/bin/env node
/**
 * 三协议 mock LLM server —— 为「模型平台三协议」方案提供**真跑**地基（2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 为什么需要它（而不是在单测里拼 SSE 字符串）
 *
 * 方案验收标准 3/5 要求的都是**端到端真跑**：建平台 → 连通性测试 → 一轮对话 →
 * 一次工具调用，且阈值触发时要断言「mock server 的请求次数**继续增长**」。
 * 这些判据只有**真起一个 HTTP server**、让真实 `fetch` 打上去才能验。
 *
 * ---
 * ## 三条协议的返回格式（与 core 侧三个解析器严格对齐）
 *
 * | 路径                  | 帧格式                              | 终态事件                    |
 * | ------------------- | ------------------------------- | ----------------------- |
 * | `/v1/chat/completions` | 只有 `data:` 行，`data: [DONE]` 收尾   | `finish_reason` + `[DONE]` |
 * | `/v1/responses`       | `event:` + `data:`               | `response.completed`    |
 * | `/v1/messages`        | `event:` + `data:`               | `message_stop`          |
 *
 * ★ 故意让**同一个逻辑用量**在三家有**三种不同的线上表示**（见 MOCK_USAGE）——
 *   这正是归一化要解决的核心问题：OpenAI 把 cached 放进 prompt（子集），
 *   Anthropic 把 cache_read 放在 input 之外。三家的 detail 必须殊途同归。
 *
 * ---
 * ## 两种用法
 *
 * ```
 * node tools/mock-llm-server.cjs [port]     # 独立跑（默认 4599）
 * const { createMockLlmServer } = require('./tools/mock-llm-server.cjs');  // 测试内嵌
 * ```
 */

const http = require('node:http');

/** 模型 ID（建平台时填这个） */
const MOCK_MODEL_ID = 'mock-chat-v1';

/** 工具调用固定返回（验收标准 3 的「一次工具调用」） */
const MOCK_TOOL = Object.freeze({
  name: 'get_time',
  arguments: '{"tz":"UTC"}',
  callId: 'call_mock_1',
});

/**
 * 固定用量 —— **精确值**，不是估算（验收标准 4 的等式断言依赖它）：
 *   实际输入 1000（其中缓存命中 400）· 输出 200
 * ⇒ 归一化后三家都必须得到 detail = { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 }
 */
const MOCK_USAGE = Object.freeze({
  /** 归一化后期望值（三协议一致） */
  normalized: Object.freeze({
    inputTokens: 600,
    cacheReadTokens: 400,
    cacheWriteTokens: 0,
    outputTokens: 200,
  }),
  /** OpenAI Chat Completions 线上表示（cached 是 prompt 的子集） */
  openai: Object.freeze({
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400 },
  }),
  /** OpenAI Responses 线上表示（字段挂在 input_tokens_details） */
  responses: Object.freeze({
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 400 },
    output_tokens: 200,
  }),
  /** Anthropic 线上表示（cache_read **不在** input_tokens 里；cache_creation 可经 header 注入） */
  anthropic: Object.freeze({
    input_tokens: 600,
    cache_read_input_tokens: 400,
    output_tokens: 200,
  }),
});

/** 文本回复的前缀（测试断言用） */
const MOCK_TEXT_PREFIX = 'MOCK_OK';

// ─────────────────────────────────────────────────────────────────────────────
// 请求解析
// ─────────────────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ __raw: raw });
      }
    });
    req.on('error', reject);
  });
}

/** 取最后一条用户文本（三协议的消息结构不同，各自提取） */
function lastUserText(body, protocol) {
  let texts = [];
  if (protocol === 'openai') {
    texts = (body.messages || []).filter((m) => m?.role === 'user').map((m) => contentToText(m.content));
  } else if (protocol === 'responses') {
    // toResponsesInput 的产物：{ role:'user', content:[{type:'input_text',text}] }
    texts = (body.input || []).filter((i) => i?.role === 'user').map((i) => contentToText(i.content));
  } else {
    texts = (body.messages || []).filter((m) => m?.role === 'user').map((m) => contentToText(m.content));
  }
  const last = texts.filter(Boolean).pop() || '';
  return String(last).slice(0, 32);
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c?.type === 'text' || c?.type === 'input_text' || c?.type === 'output_text' ? String(c.text || '') : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/**
 * 这轮该回文本还是回工具调用。
 *
 * 判据（确定性的，不随机）：**已经出现过工具结果** ⇒ 回文本收尾；
 * 否则**请求带了 tools** ⇒ 回工具调用；否则回文本。
 * ⇒ 一轮「对话 + 工具调用」就是两次请求：第一次触发工具，第二次（带工具结果）收尾。
 */
function wantsToolCall(body, protocol) {
  const hasToolResult =
    protocol === 'openai'
      ? (body.messages || []).some((m) => m?.role === 'tool')
      : protocol === 'responses'
        ? (body.input || []).some((i) => i?.type === 'function_call_output')
        : (body.messages || []).some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'tool_result'));
  if (hasToolResult) return false;
  return Array.isArray(body.tools) && body.tools.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE 写出
// ─────────────────────────────────────────────────────────────────────────────

function sseHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

/** 带 event: 行的帧（Responses / Anthropic） */
function writeEvent(res, eventType, data) {
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 只有 data: 行的帧（OpenAI Chat Completions） */
function writeData(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 三条协议的响应体
// ─────────────────────────────────────────────────────────────────────────────

function openAiStream(res, body) {
  sseHead(res);
  const tool = wantsToolCall(body, 'openai');
  const echo = lastUserText(body, 'openai');
  const id = 'chatcmpl-mock-1';
  if (tool) {
    writeData(res, { id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: MOCK_TOOL.callId, type: 'function', function: { name: MOCK_TOOL.name, arguments: '{"tz":' } }] } }] });
    writeData(res, { id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"UTC"}' } }] } }] });
    writeData(res, { id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: MOCK_USAGE.openai });
  } else {
    for (const piece of [`${MOCK_TEXT_PREFIX}`, ': ', echo]) {
      if (!piece) continue;
      writeData(res, { id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: piece } }] });
    }
    writeData(res, { id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: MOCK_USAGE.openai });
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

function openAiJson(res, body) {
  const tool = wantsToolCall(body, 'openai');
  const echo = lastUserText(body, 'openai');
  const message = tool
    ? { role: 'assistant', tool_calls: [{ id: MOCK_TOOL.callId, type: 'function', function: { name: MOCK_TOOL.name, arguments: MOCK_TOOL.arguments } }] }
    : { role: 'assistant', content: `${MOCK_TEXT_PREFIX}: ${echo}` };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'chatcmpl-mock-1',
      object: 'chat.completion',
      model: body.model || MOCK_MODEL_ID,
      choices: [{ index: 0, message, finish_reason: tool ? 'tool_calls' : 'stop' }],
      usage: MOCK_USAGE.openai,
    }),
  );
}

function responsesStream(res, body) {
  sseHead(res);
  const tool = wantsToolCall(body, 'responses');
  const echo = lastUserText(body, 'responses');
  if (tool) {
    writeEvent(res, 'response.output_item.added', {
      type: 'response.output_item.added',
      item: { type: 'function_call', id: 'fc_mock_1', call_id: MOCK_TOOL.callId, name: MOCK_TOOL.name },
    });
    writeEvent(res, 'response.function_call_arguments.delta', {
      type: 'response.function_call_arguments.delta',
      item_id: 'fc_mock_1',
      delta: '{"tz":',
    });
    writeEvent(res, 'response.function_call_arguments.delta', {
      type: 'response.function_call_arguments.delta',
      item_id: 'fc_mock_1',
      delta: '"UTC"}',
    });
    writeEvent(res, 'response.output_item.done', {
      type: 'response.output_item.done',
      item: { type: 'function_call', id: 'fc_mock_1', call_id: MOCK_TOOL.callId, name: MOCK_TOOL.name, arguments: MOCK_TOOL.arguments },
    });
  } else {
    for (const piece of [`${MOCK_TEXT_PREFIX}`, ': ', echo]) {
      if (!piece) continue;
      writeEvent(res, 'response.output_text.delta', { type: 'response.output_text.delta', delta: piece });
    }
  }
  writeEvent(res, 'response.completed', {
    type: 'response.completed',
    response: { id: 'resp_mock_1', object: 'response', model: body.model || MOCK_MODEL_ID, usage: MOCK_USAGE.responses },
  });
  res.end();
}

function responsesJson(res, body) {
  const tool = wantsToolCall(body, 'responses');
  const echo = lastUserText(body, 'responses');
  const output = tool
    ? [{ type: 'function_call', id: 'fc_mock_1', call_id: MOCK_TOOL.callId, name: MOCK_TOOL.name, arguments: MOCK_TOOL.arguments }]
    : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${MOCK_TEXT_PREFIX}: ${echo}` }] }];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'resp_mock_1',
      object: 'response',
      model: body.model || MOCK_MODEL_ID,
      status: 'completed',
      output,
      usage: MOCK_USAGE.responses,
    }),
  );
}

function anthropicStream(res, body, cacheWrite) {
  sseHead(res);
  const tool = wantsToolCall(body, 'anthropic');
  const echo = lastUserText(body, 'anthropic');
  const startUsage = {
    input_tokens: MOCK_USAGE.anthropic.input_tokens,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: MOCK_USAGE.anthropic.cache_read_input_tokens,
    output_tokens: 0,
  };
  writeEvent(res, 'message_start', {
    type: 'message_start',
    message: { id: 'msg_mock_1', type: 'message', role: 'assistant', content: [], usage: startUsage },
  });
  if (tool) {
    writeEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_mock_1', name: MOCK_TOOL.name, input: {} } });
    writeEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"tz":' } });
    writeEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"UTC"}' } });
    writeEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    writeEvent(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: MOCK_USAGE.anthropic.output_tokens } });
  } else {
    writeEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    for (const piece of [`${MOCK_TEXT_PREFIX}`, ': ', echo]) {
      if (!piece) continue;
      writeEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } });
    }
    writeEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    writeEvent(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: MOCK_USAGE.anthropic.output_tokens } });
  }
  writeEvent(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

function anthropicJson(res, body, cacheWrite) {
  const tool = wantsToolCall(body, 'anthropic');
  const echo = lastUserText(body, 'anthropic');
  const content = tool
    ? [{ type: 'tool_use', id: 'toolu_mock_1', name: MOCK_TOOL.name, input: { tz: 'UTC' } }]
    : [{ type: 'text', text: `${MOCK_TEXT_PREFIX}: ${echo}` }];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'msg_mock_1',
      type: 'message',
      role: 'assistant',
      model: body.model || MOCK_MODEL_ID,
      content,
      stop_reason: tool ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: MOCK_USAGE.anthropic.input_tokens,
        cache_creation_input_tokens: cacheWrite,
        cache_read_input_tokens: MOCK_USAGE.anthropic.cache_read_input_tokens,
        output_tokens: MOCK_USAGE.anthropic.output_tokens,
      },
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// server
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建 mock server（**不 listen**，由调用方决定端口；测试用 0 = 随机端口）。
 *
 * 附加能力（挂在返回的 server 对象上）：
 * - `server.mockStats` —— 请求计数（验收 5b「任务继续跑 ⇒ 请求数继续增长」）
 * - `GET  /__stats`  —— 计数查询
 * - `POST /__reset`  —— 计数归零
 *
 * header 开关（测试特定坑位用）：
 * - `x-mock-cache-write: N` —— Anthropic 注入 cache_creation_input_tokens（坑 #2：缓存写入漏计）
 * - `x-mock-usage-missing: 1` —— 模拟中转站乱报（usage 全 0，坑 #13：必须走估算而不是当免费）
 */
function createMockLlmServer() {
  const stats = { total: 0, byPath: {} };
  const server = http.createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    stats.total += 1;
    stats.byPath[path] = (stats.byPath[path] || 0) + 1;

    try {
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'mock-llm' }));
        return;
      }
      if (req.method === 'GET' && path === '/__stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
        return;
      }
      if (req.method === 'POST' && path === '/__reset') {
        stats.total = 0;
        stats.byPath = {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && path === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: MOCK_MODEL_ID, object: 'model', created: 0, owned_by: 'mock' }],
          }),
        );
        return;
      }
      if (req.method === 'POST' && path === '/v1/embeddings') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }],
            model: 'mock-embed-v1',
            usage: { prompt_tokens: 8, total_tokens: 8 },
          }),
        );
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'method not allowed' } }));
        return;
      }

      const body = await readBody(req);
      const stream = body.stream === true;
      const cacheWrite = Math.max(0, Number(req.headers['x-mock-cache-write'] || 0) || 0);
      const usageMissing = req.headers['x-mock-usage-missing'] === '1';

      // 中转站乱报模式（坑 #13）：usage 全 0 —— 上层必须走估算，不能当免费
      const zero = { prompt_tokens: 0, completion_tokens: 0 };
      const zeroR = { input_tokens: 0, output_tokens: 0 };
      const zeroA = { input_tokens: 0, output_tokens: 0 };

      if (path === '/v1/chat/completions') {
        if (stream) {
          if (usageMissing) {
            sseHead(res);
            writeData(res, { id: 'chatcmpl-mock-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: `${MOCK_TEXT_PREFIX}` } }] });
            writeData(res, { id: 'chatcmpl-mock-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: zero });
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            openAiStream(res, body);
          }
        } else {
          openAiJson(res, body);
        }
        return;
      }
      if (path === '/v1/responses') {
        if (stream) {
          if (usageMissing) {
            sseHead(res);
            writeEvent(res, 'response.output_text.delta', { type: 'response.output_text.delta', delta: MOCK_TEXT_PREFIX });
            writeEvent(res, 'response.completed', { type: 'response.completed', response: { id: 'resp_mock_1', usage: zeroR } });
            res.end();
          } else {
            responsesStream(res, body);
          }
        } else {
          responsesJson(res, body);
        }
        return;
      }
      if (path === '/v1/messages') {
        if (stream) {
          if (usageMissing) {
            sseHead(res);
            writeEvent(res, 'message_start', { type: 'message_start', message: { usage: zeroA } });
            writeEvent(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } });
            writeEvent(res, 'message_stop', { type: 'message_stop' });
            res.end();
          } else {
            anthropicStream(res, body, cacheWrite);
          }
        } else {
          anthropicJson(res, body, cacheWrite);
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `mock-llm: unknown path ${path}` } }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: String(e && e.message ? e.message : e) } }));
    }
  });
  server.mockStats = stats;
  return server;
}

module.exports = { createMockLlmServer, MOCK_MODEL_ID, MOCK_TOOL, MOCK_USAGE, MOCK_TEXT_PREFIX };

if (require.main === module) {
  const port = Number(process.argv[2]) || 4599;
  const server = createMockLlmServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`[mock-llm] listening on http://127.0.0.1:${port}`);
    console.log(`[mock-llm] protocols: /v1/chat/completions  /v1/responses  /v1/messages  (model: ${MOCK_MODEL_ID})`);
  });
}
