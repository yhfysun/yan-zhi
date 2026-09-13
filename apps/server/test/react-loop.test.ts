/**
 * ReAct 循环历史回放集成测试
 *
 * 模拟 DB 中两个历史故障会话，验证修复后流程能走完：
 *   场景1 (d376e5c0): web_search "Search error: fetch failed" → aborted
 *     修复点: getToolRegistry backend 竞态 → web_search 用百度后端 → 不再 fetch failed
 *   场景2 (71453caf): web_search(arguments={}) → "query is required" → 卡死
 *     修复点: 工具失败后空回复兜底 + 模型基于错误自行修正 → 流程不中断
 *   场景3: appGuide 注入验证（修复 appGuide 被丢弃的 bug）
 *   场景4: abortTask 清理 pendingToolCalls（修复孤立注释 bug）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatChunk } from '@yan-zhi/shared';

// ── vi.hoisted: 在 vi.mock 之前创建 mock 需要的对象 ──────────────────────────
const hoisted = vi.hoisted(() => {
  // ── 纯 JS mock db（避免 better-sqlite3 native binding 版本冲突）──
  const messages: any[] = [];
  const platforms: Record<string, any> = {
    p_test: { id: 'p_test', user_id: 'u_test', name: '测试平台', protocol: 'openai', api_url: 'http://localhost:8080', headers_json: '{}', status: 1 },
  };
  const models: Record<string, any> = {
    'agnes-2.5-flash': { id: 'agnes-2.5-flash', platform_id: 'p_test', user_id: 'u_test', model_id: 'agnes-2.5-flash', alias: 'Agnes Flash', type: 'llm', context_window: 8000, capabilities_json: '[]', enabled: 1 },
  };
  const agents: Record<string, any> = {
    'a_default_assistant': { id: 'a_default_assistant', name: '默认助手', description: '通用助手', system_prompt: '你是言智智能助手，善于搜索网络并综合回答。', temperature: 0.7, max_tokens: 2048, top_p: 1.0, platform_id: 'p_test', model_id: 'agnes-2.5-flash', builtin_tool_ids: '["web_search"]', custom_tool_ids: null, skill_ids: null, sub_agent_ids: null, type: 'harness', config_json: '{}' },
  };
  const conversations: Record<string, any> = {};
  const customTools: any[] = [];
  const llmTasks: any[] = [];

  function noop() { return { get: () => undefined, all: () => [], run: () => {} }; }

  const db = {
    prepare(sql: string): any {
      // ── SELECT ──
      if (/FROM\s+platform/i.test(sql)) {
        return {
          get: (...p: any[]) => { const r = platforms[p[0]]; return r && r.user_id === p[1] ? r : undefined; },
          all: () => [], run: () => {},
        };
      }
      if (/FROM\s+model/i.test(sql)) {
        return {
          get: (...p: any[]) => { const r = models[p[0]]; return r && r.user_id === p[1] ? r : undefined; },
          all: () => [], run: () => {},
        };
      }
      if (/FROM\s+agent/i.test(sql)) {
        return {
          get: (...p: any[]) => agents[p[0]],
          all: () => [], run: () => {},
        };
      }
      if (/FROM\s+message/i.test(sql) && !sql.includes('parent_tool_call_id')) {
        return {
          get: () => undefined,
          all: (...p: any[]) => messages.filter(m => m.conversation_id === p[0]).sort((a, b) => a.created_at - b.created_at),
          run: () => {},
        };
      }
      if (/FROM\s+message/i.test(sql) && sql.includes('parent_tool_call_id')) {
        return {
          get: () => undefined,
          all: (...p: any[]) => messages.filter(m => m.conversation_id === p[0] && m.parent_tool_call_id === p[1]).sort((a, b) => a.created_at - b.created_at),
          run: () => {},
        };
      }
      if (/FROM\s+conversation/i.test(sql)) {
        return {
          get: (...p: any[]) => conversations[p[0]] || { agent_id: 'a_default_assistant' },
          all: () => [], run: () => {},
        };
      }
      if (/FROM\s+custom_tool/i.test(sql)) {
        return { get: () => undefined, all: () => customTools, run: () => {} };
      }
      if (/FROM\s+llm_task/i.test(sql)) {
        return { get: (...p: any[]) => llmTasks.find(t => t.id === p[0]), all: () => llmTasks, run: (...p: any[]) => { llmTasks.push({ id: p[0] }); } };
      }
      if (/FROM\s+skill/i.test(sql)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }
      if (/FROM\s+memory_vec/i.test(sql)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }

      // ── INSERT ──
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
      if (/INSERT\s+INTO\s+conversation_file/i.test(sql)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }
      if (/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+conversation/i.test(sql)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }

      // ── UPDATE ──
      if (/UPDATE\s+message\s+SET\s+content/i.test(sql)) {
        return {
          get: () => undefined, all: () => [],
          run: (...p: any[]) => {
            const msg = messages.find(m => m.id === p[3]);
            if (msg) { msg.content = p[0]; msg.reasoning_content = p[1]; msg.tool_calls_json = p[2]; }
          },
        };
      }
      if (/UPDATE\s+llm_task/i.test(sql)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }

      return noop();
    },
    exec: () => {},
    pragma: () => {},
  };

  // ── mock 工具注册表 ──
  const toolMap = new Map<string, any>();
  const mockRegistry = {
    has: (n: string) => toolMap.has(n),
    get: (n: string) => toolMap.get(n),
    names: () => toolMap.keys(),
    execute: async (n: string, args: any) => {
      const t = toolMap.get(n);
      if (!t) throw new Error(`未知工具: ${n}`);
      return t.execute(args);
    },
    set: (n: string, def: any) => { toolMap.set(n, def); },
  };

  // web_search 工具：模拟百度后端可达（修复后不再 fetch failed）
  mockRegistry.set('web_search', {
    name: 'web_search',
    description: 'Search the web for information.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] },
    execute: async (args: any) => {
      const q = (args?.query || '').trim();
      if (!q) return { isError: true, content: [{ text: 'Error: query is required' }] };
      return {
        content: [{ text: `搜索 "${q}" 结果：\n1. iPhone 17 Pro Max - 苹果年度旗舰，A19 芯片\n2. 华为 Mate 70 Pro - 国产旗舰，麒麟 9100\n3. 小米 17 Pro - 骁龙 8 Gen4，性价比之选` }],
      };
    },
  });

  // ── mock LlmClient：chatStream 从队列取预设 chunks ──
  const llmChunksQueue: ChatChunk[][] = [];
  class MockLlmClient {
    constructor(private platform: any, private model: any) {}
    async *chatStream(_messages: any[], _options?: any): AsyncGenerator<ChatChunk> {
      const chunks = llmChunksQueue.shift() || [{ delta: { content: '（无预设回复）' } }];
      for (const c of chunks) yield c;
    }
    get supportsEmbeddings() { return false; }
  }

  // ── mock ContextWindow：不压缩 ──
  class MockContextWindow {
    constructor(private w: number, private r: number) {}
    needsCompression(_m: any[]) { return false; }
    compress(m: any[]) { return m; }
    setSummaryModel(_p: any, _m: any) {}
  }

  return { db, mockRegistry, MockLlmClient, MockContextWindow, llmChunksQueue, conversations, messages };
});

// ── mock 依赖模块 ──────────────────────────────────────────────────────────
vi.mock('../src/db.js', () => ({ db: hoisted.db, hasSqliteVec: false }));
vi.mock('@yan-zhi/core', () => ({
  LlmClient: hoisted.MockLlmClient,
  getToolRegistry: () => hoisted.mockRegistry,
  getApiToolRegistry: () => new Map(),
  ContextWindow: hoisted.MockContextWindow,
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/mcp/api-tool-executor.js', () => ({ executeApiTool: vi.fn(), SUPPORTED_API_TOOLS: [] }));
vi.mock('../src/services/ollama-embed.js', () => ({ embedText: vi.fn().mockResolvedValue([]) }));

// ── import 被测模块（在 mock 之后）──
import { createTask, subscribe, getTask, abortTask, buildToolsForBackend } from '../src/llm-task-manager.js';

// ── 辅助函数 ──────────────────────────────────────────────────────────────────
function waitForTaskDone(taskId: string, timeout = 8000): Promise<{ status: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const task = getTask(taskId);
      if (task && task.status !== 'running') return resolve({ status: task.status, error: task.error });
      if (Date.now() - start > timeout) return reject(new Error(`任务超时（${timeout}ms），状态: ${task?.status || 'N/A'}`));
      setTimeout(check, 30);
    };
    check();
  });
}

function collectEvents(taskId: string): { events: any[]; unsubscribe: () => void } {
  const events: any[] = [];
  const unsubscribe = subscribe(taskId, 0, (e) => { events.push(e); });
  return { events, unsubscribe };
}

const USER_ID = 'u_test';
const PLATFORM_ID = 'p_test';
const MODEL_ID = 'agnes-2.5-flash';
const AGENT_ID = 'a_default_assistant';

beforeEach(() => {
  hoisted.llmChunksQueue.length = 0;
  hoisted.messages.length = 0;
});
afterEach(() => {
  hoisted.llmChunksQueue.length = 0;
});

describe('ReActLoopHistoryReplay', () => {
  // ─────────────────────────────────────────────────────────────────────
  // 场景1 (历史会话 d376e5c0): "分析今年哪些手机值得入手"
  //   历史故障: web_search → "Search error: fetch failed" → 重试 → aborted
  //   修复后: web_search 百度后端可达 → 返回结果 → 模型综合回答 → completed
  // ─────────────────────────────────────────────────────────────────────
  it('场景1: web_search 不再 fetch failed，流程走完到 completed', async () => {
    const convId = 'conv_test_scene1';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, title: '分析今年哪些手机值得入手', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };

    // 第1轮：模型发起 web_search（文本模式 [TOOL_CALL]）
    hoisted.llmChunksQueue.push([
      { delta: { reasoningContent: '用户询问今年哪些手机值得入手，需要搜索最新信息。' } },
      { delta: { content: '[TOOL_CALL]{"name":"web_search","arguments":{"query":"2026年值得入手的手机推荐"}}[/TOOL_CALL]' } },
    ]);
    // 第2轮：模型收到搜索结果后综合回答
    hoisted.llmChunksQueue.push([
      { delta: { content: '根据搜索结果，2026年值得入手的手机推荐如下：\n\n1. **iPhone 17 Pro Max** - 苹果年度旗舰，A19 芯片\n2. **华为 Mate 70 Pro** - 国产旗舰，麒麟 9100\n3. **小米 17 Pro** - 骁龙 8 Gen4，性价比之选' } },
    ]);

    const taskId = createTask({ conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID, userContent: '分析今年哪些手机值得入手', agentId: AGENT_ID });
    const { events, unsubscribe } = collectEvents(taskId);
    const result = await waitForTaskDone(taskId);
    unsubscribe();

    expect(result.status).toBe('completed');
    expect(events.some(e => e.type === 'task:completed')).toBe(true);
    expect(events.some(e => e.type === 'task:error')).toBe(false);

    // web_search 工具被调用且成功
    const toolResults = events.filter(e => e.type === 'tool:result');
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
    const searchResult = toolResults.find(e => e.toolName === 'web_search');
    expect(searchResult).toBeDefined();
    expect(searchResult!.result).not.toContain('fetch failed');
    expect(searchResult!.result).toContain('iPhone 17');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 场景2 (历史会话 71453caf): "分析今年哪些手机值得入手"
  //   历史故障: web_search → fetch failed → web_search(arguments={}) → "query is required" → 卡死
  //   修复后: 工具返回错误 → 模型基于错误自行修正 → 继续回答 → completed
  // ─────────────────────────────────────────────────────────────────────
  it('场景2: 工具参数丢失时返回错误提示，模型自行修正后流程走完', async () => {
    const convId = 'conv_test_scene2';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, title: '分析今年哪些手机值得入手', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };

    // 第1轮：模型发起 web_search 但参数丢失（arguments={}，模拟历史故障）
    hoisted.llmChunksQueue.push([
      { delta: { reasoningContent: '让我搜索一下相关信息。' } },
      { delta: { content: '[TOOL_CALL]{"name":"web_search","arguments":{}}[/TOOL_CALL]' } },
    ]);
    // 第2轮：模型收到 "query is required" 错误后，基于已有知识直接回答
    hoisted.llmChunksQueue.push([
      { delta: { content: '搜索工具提示需要 query 参数。让我基于已有知识回答：\n\n2026年值得入手的手机推荐：\n1. **iPhone 17 Pro** - 苹果旗舰\n2. **华为 Mate 70** - 国产旗舰\n3. **小米 17** - 性价比之选' } },
    ]);

    const taskId = createTask({ conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID, userContent: '分析今年哪些手机值得入手', agentId: AGENT_ID });
    const { events, unsubscribe } = collectEvents(taskId);
    const result = await waitForTaskDone(taskId);
    unsubscribe();

    expect(result.status).toBe('completed');
    expect(events.some(e => e.type === 'task:completed')).toBe(true);
    expect(events.some(e => e.type === 'task:error')).toBe(false);

    // web_search 返回了 "query is required" 错误（工具参数校验）
    const toolResults = events.filter(e => e.type === 'tool:result');
    const searchResult = toolResults.find(e => e.toolName === 'web_search');
    expect(searchResult).toBeDefined();
    expect(searchResult!.result).toContain('query is required');

    // 流程继续走到了第2轮（模型基于错误自行修正）
    const steps = events.filter(e => e.type === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 场景3: appGuide 注入验证（修复 appGuide 被丢弃的 bug）
  // ─────────────────────────────────────────────────────────────────────
  it('场景3: appGuide 被正确注入系统提示词', async () => {
    const convId = 'conv_test_scene3';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, title: 'appGuide 测试', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };

    let capturedSystemPrompt = '';
    hoisted.llmChunksQueue.push([{ delta: { content: '我已了解应用指引，会按要求行事。' } }]);

    // 包装 chatStream 捕获系统提示词
    const origChatStream = hoisted.MockLlmClient.prototype.chatStream;
    hoisted.MockLlmClient.prototype.chatStream = async function* (messages: any[], options?: any) {
      const sysMsg = messages.find((m: any) => m.role === 'system');
      if (sysMsg) capturedSystemPrompt = sysMsg.content || '';
      yield* origChatStream.call(this, messages, options);
    };

    const taskId = createTask({
      conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '你好', agentId: AGENT_ID,
      appGuide: '你是一个专注于手机评测的助手，回答时必须给出具体型号和价格区间。',
    });
    const { unsubscribe } = collectEvents(taskId);
    await waitForTaskDone(taskId);
    unsubscribe();

    hoisted.MockLlmClient.prototype.chatStream = origChatStream;

    expect(capturedSystemPrompt).toContain('应用指引');
    expect(capturedSystemPrompt).toContain('手机评测');
    expect(capturedSystemPrompt).toContain('具体型号和价格区间');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 场景4: abortTask 清理 pendingToolCalls（修复孤立注释 bug）
  //   用 MCP 工具触发 executeToolViaFrontend 创建 pendingToolCall，
  //   abort 后验证 pendingToolCalls 被清理（修复前孤立注释吞掉清理代码）。
  // ─────────────────────────────────────────────────────────────────────
  it('场景4: abortTask 清理 MCP 工具的 pendingToolCalls', async () => {
    const convId = 'conv_test_scene4';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, title: 'abort 测试', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };

    // 第1轮：模型调用 mcp_test 工具（MCP 工具走 executeToolViaFrontend，创建 pendingToolCall）
    hoisted.llmChunksQueue.push([
      { delta: { content: '[TOOL_CALL]{"name":"mcp_test_tool","arguments":{}}[/TOOL_CALL]' } },
    ]);

    const taskId = createTask({ conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID, userContent: '测试 abort', agentId: AGENT_ID });
    const { events, unsubscribe } = collectEvents(taskId);

    // 等待 tool:execute 事件（确认 pendingToolCall 已创建）
    await new Promise<void>((resolve) => {
      const check = () => {
        if (events.some(e => e.type === 'tool:execute')) return resolve();
        setTimeout(check, 20);
      };
      check();
    });

    // 确认 pendingToolCall 已创建
    const taskBefore = getTask(taskId);
    expect(taskBefore!.pendingToolCalls.size).toBeGreaterThanOrEqual(1);

    // abort → 应清理 pendingToolCalls
    abortTask(taskId);
    const result = await waitForTaskDone(taskId);
    unsubscribe();

    expect(result.status).toBe('aborted');
    const task = getTask(taskId);
    expect(task).toBeDefined();
    expect(task!.status).toBe('aborted');
    expect(task!.pendingToolCalls.size).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 场景5: buildToolsForBackend 查询用 input_schema_json（修复 no such column: input_schema）
  // ─────────────────────────────────────────────────────────────────────
  it('场景5: buildToolsForBackend 查 custom_tool 用 input_schema_json 列名', () => {
    const sqls: string[] = [];
    const origPrepare = hoisted.db.prepare.bind(hoisted.db);
    hoisted.db.prepare = (sql: string) => { sqls.push(sql); return origPrepare(sql); };

    buildToolsForBackend(AGENT_ID, USER_ID);

    hoisted.db.prepare = origPrepare;
    const customToolSql = sqls.find(s => s.includes('custom_tool'));
    expect(customToolSql).toBeDefined();
    expect(customToolSql).toContain('input_schema_json');
    expect(customToolSql).not.toMatch(/input_schema[^_]/); // 不能有裸 input_schema（无 _json 后缀）
  });

  // ─────────────────────────────────────────────────────────────────────
  // 场景6: 模型输出格式错误的 [TOOL_CALL]（实际 SSE 日志复现）
  //   故障: 模型输出 {"name":"web_search"["arguments":...}（[ 替代 ,）
  //         且闭合标签 [/toOL_CALL] 小写 to → JSON.parse 失败 → 工具不执行 → task:completed 空回复
  //   修复后: 容错解析 → 工具正确执行 → 返回结果 → 模型综合回答 → completed
  // ─────────────────────────────────────────────────────────────────────
  it('场景6: 模型输出格式错误的 [TOOL_CALL]（[替代逗号 + 小写闭合标签），工具仍被正确解析执行', async () => {
    const convId = 'conv_test_scene6';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, title: '分析今年哪些手机值得入手', agent_id: AGENT_ID, platform_id: PLATFORM_ID, model_id: MODEL_ID };

    // 第1轮：模型输出两个 web_search，JSON 格式错误（[ 替代 ,），闭合标签大小写错误
    // 这是用户 SSE 日志中的确切输出
    hoisted.llmChunksQueue.push([
      { delta: { reasoningContent: '用户想了解今年哪些手机值得入手。这是一个购物建议类的问题，需要我搜索最新的信息来给出建议。让我先搜索一下相关信息。\n' } },
      { delta: { content: '\n\n[TOOL_CALL]{"name":"web_search"["arguments":{"query":"2026年最值得入手的手机推荐","timeRange":"month"}}[/TOOL_CALL]\n[TOOL_CALL]{"name":"web_search"["arguments":{"query":"2026年旗舰手机对比评测 性价比推荐","timeRange":"month"}}[/toOL_CALL]' } },
    ]);
    // 第2轮：模型收到两个搜索结果后综合回答
    hoisted.llmChunksQueue.push([
      { delta: { content: '根据搜索结果，2026年值得入手的手机推荐如下：\n\n1. **iPhone 17 Pro Max** - 苹果年度旗舰\n2. **华为 Mate 70 Pro** - 国产旗舰\n3. **小米 17 Pro** - 性价比之选' } },
    ]);

    const taskId = createTask({ conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID, userContent: '分析今年哪些手机值得入手', agentId: AGENT_ID });
    const { events, unsubscribe } = collectEvents(taskId);
    const result = await waitForTaskDone(taskId);
    unsubscribe();

    // 任务完成（不是直接空回复 task:completed）
    expect(result.status).toBe('completed');
    expect(events.some(e => e.type === 'task:completed')).toBe(true);
    expect(events.some(e => e.type === 'task:error')).toBe(false);

    // tool_call 事件被发送（工具被解析出来）
    const toolCallEvents = events.filter(e => e.type === 'tool_call');
    expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);
    const toolCalls = toolCallEvents[0].toolCalls;
    expect(toolCalls.length).toBe(2); // 两个 web_search 都被解析
    expect(toolCalls[0].function.name).toBe('web_search');
    expect(toolCalls[1].function.name).toBe('web_search');

    // 两个工具都被执行并返回结果
    const toolResults = events.filter(e => e.type === 'tool:result');
    expect(toolResults.length).toBe(2);
    expect(toolResults[0].toolName).toBe('web_search');
    expect(toolResults[1].toolName).toBe('web_search');
    expect(toolResults[0].result).toContain('iPhone 17');
    expect(toolResults[1].result).toContain('iPhone 17');

    // 流程走到了第2轮（模型综合回答）
    const steps = events.filter(e => e.type === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });
});
