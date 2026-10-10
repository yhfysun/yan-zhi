/**
 * 「运行中追加消息」幂等 + 落库语义 —— 守门测试（2026-10-09）。
 *
 * ★★★ 背景（用户实报，两条现象同源）：
 *   ① 「追加任务立即发送按钮又失效了点击无用」；
 *   ② 「同一个消息点击多次会发送 n 次啊」。
 *   此前 `injectUserMessage` **完全无幂等** ——「立即发送」按钮连点几下就是一个 POST 一次落库，
 *   库里出现多条同内容 user 消息，模型下一轮把它们当多条指令重复执行。
 *
 * ★ 本测试钉住三件事（都在生产路径 `createTask → injectUserMessage` 上跑，不是源码字符串断言）：
 *   1) 首次注入：落库 + 回传真实 msgId + 记入 pendingInjects；
 *   2) 同一 clientMsgId 重复注入：**不再新增消息**、返回同一 msgId、duplicate=true；
 *   3) 不同 clientMsgId：各落一条（正常多轮追加不受幂等误伤）。
 *
 * ★ 为什么用 react-loop 那一套内存 db mock：`injectUserMessage` 直接打 message 表 +
 *   tasks 内存表，没有"纯逻辑可注入"的切面。这里复用同一份 mock（含 insertMessage 的
 *   INSERT INTO message 落内存），才能真看到"库里几条"。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatChunk } from '@yan-zhi/shared';

const hoisted = vi.hoisted(() => {
  const messages: any[] = [];
  const platforms: Record<string, any> = {
    p_test: { id: 'p_test', user_id: 'u_test', name: '测试平台', protocol: 'openai', api_url: 'http://localhost:8080', headers_json: '{}', status: 1 },
  };
  const models: Record<string, any> = {
    'agnes-2.5-flash': { id: 'agnes-2.5-flash', platform_id: 'p_test', user_id: 'u_test', model_id: 'agnes-2.5-flash', alias: 'Agnes Flash', type: 'llm', context_window: 8000, capabilities_json: '[]', enabled: 1 },
  };
  const agents: Record<string, any> = {
    'a_default_assistant': { id: 'a_default_assistant', name: '默认助手', description: '通用助手', system_prompt: '你是言智智能助手。', temperature: 0.7, max_tokens: 2048, top_p: 1.0, platform_id: 'p_test', model_id: 'agnes-2.5-flash', builtin_tool_ids: '[]', custom_tool_ids: null, skill_ids: null, sub_agent_ids: null, type: 'harness', config_json: '{}' },
  };
  const conversations: Record<string, any> = {};
  const llmTasks: any[] = [];

  function noop() { return { get: () => undefined, all: () => [], run: () => {} }; }

  const db = {
    prepare(sql: string): any {
      if (/FROM\s+platform/i.test(sql)) {
        return { get: (...p: any[]) => { const r = platforms[p[0]]; return r && r.user_id === p[1] ? r : undefined; }, all: () => [], run: () => {} };
      }
      if (/FROM\s+model/i.test(sql)) {
        return { get: (...p: any[]) => { const r = models[p[0]]; return r && r.user_id === p[1] ? r : undefined; }, all: () => [], run: () => {} };
      }
      if (/FROM\s+agent/i.test(sql)) {
        return { get: (...p: any[]) => agents[p[0]], all: () => [], run: () => {} };
      }
      if (/FROM\s+message/i.test(sql) && !sql.includes('parent_tool_call_id')) {
        return { get: () => undefined, all: (...p: any[]) => messages.filter(m => m.conversation_id === p[0]).sort((a, b) => a.created_at - b.created_at), run: () => {} };
      }
      if (/FROM\s+message/i.test(sql) && sql.includes('parent_tool_call_id')) {
        return { get: () => undefined, all: (...p: any[]) => messages.filter(m => m.conversation_id === p[0] && m.parent_tool_call_id === p[1]).sort((a, b) => a.created_at - b.created_at), run: () => {} };
      }
      if (/FROM\s+conversation/i.test(sql)) {
        return { get: (...p: any[]) => conversations[p[0]] || { agent_id: 'a_default_assistant' }, all: () => [], run: () => {} };
      }
      if (/FROM\s+llm_task/i.test(sql)) {
        return { get: (...p: any[]) => llmTasks.find(t => t.id === p[0]), all: () => llmTasks, run: (...p: any[]) => { llmTasks.push({ id: p[0] }); } };
      }
      if (/FROM\s+skill/i.test(sql)) return { get: () => undefined, all: () => [], run: () => {} };
      if (/FROM\s+memory_vec/i.test(sql)) return { get: () => undefined, all: () => [], run: () => {} };
      if (/INSERT\s+INTO\s+message/i.test(sql)) {
        return {
          get: () => undefined, all: () => [],
          run: (...p: any[]) => {
            messages.push({
              id: p[0], conversation_id: p[1], user_id: p[2], role: p[3],
              content: p[4], tool_calls_json: p[5], tool_call_id: p[6],
              reasoning_content: p[7], system_prompt_snapshot: p[8],
              tokens: p[9], parent_tool_call_id: p[10], sub_agent_id: p[11],
              sub_agent_name: p[12], sub_agent_depth: p[13], created_at: p[14],
            });
          },
        };
      }
      if (/UPDATE\s+message\s+SET\s+content/i.test(sql)) {
        return {
          get: () => undefined, all: () => [],
          run: (...p: any[]) => { const msg = messages.find(m => m.id === p[3]); if (msg) { msg.content = p[0]; msg.reasoning_content = p[1]; msg.tool_calls_json = p[2]; } },
        };
      }
      if (/UPDATE\s+llm_task/i.test(sql)) return { get: () => undefined, all: () => [], run: () => {} };
      return noop();
    },
    exec: () => {},
    pragma: () => {},
  };

  // 阻塞型 LlmClient：让任务停在"正在调 LLM"状态，好让注入发生在任务运行中。
  // 用 Promise 闸门控制放行，测试结束前释放。
  let releaseLlm!: () => void;
  let llmEntered!: () => void;
  const llmGate = new Promise<void>((r) => { releaseLlm = r; });
  const llmEnteredPromise = new Promise<void>((r) => { llmEntered = r; });
  class BlockingLlmClient {
    constructor(private platform: any, private model: any) {}
    async *chatStream(): AsyncGenerator<ChatChunk> {
      llmEntered();
      await llmGate;
      yield { delta: { content: '好的，处理完毕。' } };
    }
    get supportsEmbeddings() { return false; }
  }

  return { db, messages, conversations, BlockingLlmClient, releaseLlm: () => releaseLlm(), llmEntered: llmEnteredPromise, noop };
});

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  MESSAGE_LIST_COLS:
  'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  hasSqliteVec: false,
}));
vi.mock('@yan-zhi/core', () => ({
  runCodeDiagnostics: async () => ({ ran: [], projectRoot: null, problems: [], notes: [], durationMs: 0, text: '' }),
  invalidateDiagnosticsCache: () => {},
  SYNTHETIC_MESSAGE_IDS: new Set(['sys', 'summary', '__summary__']),
  isSyntheticMessageId: (id: string) => ['sys', 'summary', '__summary__'].includes(id),
  adviceForTruncatedArgs: () => ({ truncated: false, message: '' }),
  LlmClient: hoisted.BlockingLlmClient,
  getToolRegistry: () => ({ has: () => false, get: () => undefined, names: () => [], execute: async () => '', set: () => {} }),
  getApiToolRegistry: () => new Map(),
  ContextWindow: class {
    static forContextWindow() { return new this(); }
    static forBudget() { return new this(); }
    tokenCount() { return 0; }
    needsCompression() { return false; }
    compress(m: any[]) { return m; }
    setSummaryModel() {}
  },
  resolveToolPath: (input: unknown, ws?: string | null) => (typeof input === 'string' && input.trim()) || ws || '.',
  isAbsolutePath: (p: string) => /^([a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(String(p || '')),
  visibleMessages: (ms: any[]) => (ms || []).filter((m) => !(m && (m.parentToolCallId ?? m.parent_tool_call_id))),
  resolveContextWindow: (n: any) => (typeof n === 'number' && n > 0 ? n : 32768),
  // ★ 2026-10-10 补：D4 工具结果常态裁剪（capStaleToolResults）被主链路/context-view 用到，
  //   白名单 mock 未同步 → 任务加载即 failed（报 No "capStaleToolResults" export）。
  //   透传实现：与生产同语义（只裁 content 长度、不动结构、幂等）。
  capStaleToolResults: (ms) => ms,
  // ★ 2026-10-10 补：A4（读路由按会话隔离）新增 setBrowserToolConversationId 到 core 主链路/白名单，
  //   本手工白名单 mock 未同步 → 浏览器类工具报 No "setBrowserToolConversationId" export。
  setBrowserToolConversationId: () => {},
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/mcp/api-tool-executor.js', () => ({
  executeApiTool: vi.fn(),
  SUPPORTED_API_TOOLS: [],
  isApiExecutableTool: (name: string) => typeof name === 'string' && name.startsWith('api_'),
}));
vi.mock('../src/services/ollama-embed.js', () => ({ embedText: vi.fn().mockResolvedValue([]) }));

import { createTask, injectUserMessage, findRunningTaskId } from '../src/llm-task-manager.js';

const USER_ID = 'u_test';
const PLATFORM_ID = 'p_test';
const MODEL_ID = 'agnes-2.5-flash';
const AGENT_ID = 'a_default_assistant';
const CONV = 'conv_inject_idem';

/** 轮询等待某条件成立（避免依赖固定 sleep） */
async function waitUntil(fn: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return fn();
}

/** 该会话里出现在"注入"之后新增的 user 消息（排除 createTask 落的首条 userContent） */
function userMsgs() {
  return hoisted.messages.filter((m) => m.conversation_id === CONV && m.role === 'user');
}

describe('运行中追加消息 · 幂等与落库', () => {
  beforeEach(() => {
    hoisted.messages.length = 0;
    hoisted.conversations[CONV] = { id: CONV, user_id: USER_ID, title: '追加消息幂等', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };
  });

  it('★★★ 同一 clientMsgId 连点多次：只落一条，返回同一 msgId，duplicate=true', async () => {
    const taskId = createTask({
      conversationId: CONV, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '原始任务', agentId: AGENT_ID,
    });
    // 等任务真的进入 LLM 调用（status=running 且已订阅），确保注入打到"运行中"任务上
    expect(await waitUntil(() => findRunningTaskId(CONV, USER_ID) === taskId)).toBe(true);
    expect(await hoisted.llmEntered).toBeUndefined(); // 仅确保 promise 已 resolve
    const before = userMsgs().length;

    // 模拟"连点 3 次"：同一条消息、同一个幂等键
    const r1 = injectUserMessage(CONV, '追加要求：改用表格输出', USER_ID, 'q_abc');
    const r2 = injectUserMessage(CONV, '追加要求：改用表格输出', USER_ID, 'q_abc');
    const r3 = injectUserMessage(CONV, '追加要求：改用表格输出', USER_ID, 'q_abc');

    expect(r1.status).toBe('injected');
    expect(r1.duplicate).toBeFalsy();
    expect(r1.msgId).toBeTruthy();

    // ★ 关键断言：后两次不再落库、不再新增消息
    expect(r2.duplicate).toBe(true);
    expect(r3.duplicate).toBe(true);
    expect(r2.msgId).toBe(r1.msgId);
    expect(r3.msgId).toBe(r1.msgId);

    const after = userMsgs().length;
    expect(after - before).toBe(1); // ← 只多了一条（修复前会是 +3）

    hoisted.releaseLlm();
  });

  it('★ 不同 clientMsgId：各自落一条（幂等不误伤正常多轮追加）', async () => {
    createTask({
      conversationId: CONV, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '原始任务', agentId: AGENT_ID,
    });
    expect(await waitUntil(() => findRunningTaskId(CONV, USER_ID) !== null)).toBe(true);
    expect(await hoisted.llmEntered).toBeUndefined();
    const before = userMsgs().length;

    const a = injectUserMessage(CONV, '要求 A：加个目录', USER_ID, 'q_a');
    const b = injectUserMessage(CONV, '要求 B：再补张图', USER_ID, 'q_b');

    expect(a.status).toBe('injected');
    expect(b.status).toBe('injected');
    expect(a.duplicate).toBeFalsy();
    expect(b.duplicate).toBeFalsy();
    expect(a.msgId).not.toBe(b.msgId);
    expect(userMsgs().length - before).toBe(2);

    hoisted.releaseLlm();
  });

  it('★ 无 clientMsgId 时退化为"不去重"（旧调用方兼容，行为与修复前一致）', async () => {
    createTask({
      conversationId: CONV, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '原始任务', agentId: AGENT_ID,
    });
    expect(await waitUntil(() => findRunningTaskId(CONV, USER_ID) !== null)).toBe(true);
    expect(await hoisted.llmEntered).toBeUndefined();
    const before = userMsgs().length;

    injectUserMessage(CONV, '无键追加', USER_ID);
    injectUserMessage(CONV, '无键追加', USER_ID);
    expect(userMsgs().length - before).toBe(2);

    hoisted.releaseLlm();
  });

  it('★ 无运行中任务 → no-task（前端据此退回普通发送）', () => {
    const r = injectUserMessage('conv_nobody', '随手一句', USER_ID, 'q_x');
    expect(r.status).toBe('no-task');
    expect(r.msgId).toBeUndefined();
  });
});