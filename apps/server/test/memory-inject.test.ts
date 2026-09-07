/**
 * 记忆注入集成测试 —— 验证完整链路：
 *   createTask(userContent) → runReActLoop → retrieveRelevantMemories →
 *   formatMemoryContext → system prompt 注入 → systemPromptSnapshot 可见
 *
 * 同时覆盖 memory-service 的：
 *   - 向量检索（余弦相关性 + MIN_REL 下限过滤）
 *   - 降级检索（embedding 不可用 → 词面命中，零命中不注入）
 *   - 语义去重（余弦 > 0.92 保留分高者）
 *   - 命中反馈（last_used_at 刷新 + use_count 递增）
 *   - 无关查询不注入噪声
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
  // 可变 app_config 存储（验证 enabled=false 关闭注入路径）
  const appConfig: Record<string, string> = {};

  // ── 内存 memory 表 ──
  const memories: any[] = [];
  // 受控 embedding mock：按关键词返回固定向量（深色主题→[1,0,0]，工作流→[0,1,0]），可返回 null 模拟降级
  let embedMode: 'theme' | 'workflow' | 'none' = 'theme';

  function noop() { return { get: () => undefined, all: () => [], run: () => {} }; }

  const db = {
    prepare(sql: string): any {
      if (/FROM\s+platform/i.test(sql)) {
        return { get: (...p: any[]) => platforms[p[0]], all: () => [], run: () => {} };
      }
      if (/FROM\s+model/i.test(sql)) {
        return { get: (...p: any[]) => models[p[0]], all: () => [], run: () => {} };
      }
      if (/FROM\s+agent/i.test(sql)) {
        return { get: (...p: any[]) => agents[p[0]], all: () => [], run: () => {} };
      }
      if (/FROM\s+app_config/i.test(sql)) {
        return {
          get: (key: string) => (appConfig[key] !== undefined ? { value: appConfig[key] } : undefined),
          all: () => [],
          run: () => {},
        };
      }
      // memory-service 的候选加载（含 COALESCE use_count）
      if (/FROM\s+memory\b/i.test(sql) && /^SELECT/i.test(sql.trim())) {
        return {
          get: () => undefined,
          all: (...p: any[]) => memories.filter((m) => m.user_id === p[0]),
          run: () => {},
        };
      }
      // bumpMemoryUsage：UPDATE ... WHERE id IN (...)
      if (/UPDATE\s+memory\s+SET\s+last_used_at/i.test(sql)) {
        return {
          get: () => undefined, all: () => [],
          run: (...p: any[]) => {
            const ts = p[0];
            const ids: string[] = p.slice(1);
            for (const m of memories) {
              if (ids.includes(m.id)) {
                m.last_used_at = ts;
                m.use_count = (m.use_count || 0) + 1;
              }
            }
          },
        };
      }
      if (/FROM\s+message/i.test(sql) && !sql.includes('parent_tool_call_id')) {
        return {
          get: () => undefined,
          all: (...p: any[]) => messages.filter((m) => m.conversation_id === p[0]).sort((a, b) => a.created_at - b.created_at),
          run: () => {},
        };
      }
      if (/FROM\s+message/i.test(sql) && sql.includes('parent_tool_call_id')) {
        return {
          get: () => undefined,
          all: (...p: any[]) => messages.filter((m) => m.conversation_id === p[0] && m.parent_tool_call_id === p[1]),
          run: () => {},
        };
      }
      if (/FROM\s+conversation/i.test(sql)) {
        return { get: (...p: any[]) => conversations[p[0]] || { agent_id: 'a_default_assistant' }, all: () => [], run: () => {} };
      }
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
      return noop();
    },
    exec: () => {},
    pragma: () => {},
  };

  // ── mock LlmClient：直接回复 ──
  const llmChunksQueue: ChatChunk[][] = [];
  const capturedSystemPrompts: string[] = [];
  class MockLlmClient {
    constructor(private platform: any, private model: any) {}
    async *chatStream(_messages: any[], _options?: any): AsyncGenerator<ChatChunk> {
      const sysMsg = _messages.find((m: any) => m.role === 'system');
      if (sysMsg) capturedSystemPrompts.push(sysMsg.content || '');
      const chunks = llmChunksQueue.shift() || [{ delta: { content: '好的。' } }];
      for (const c of chunks) yield c;
    }
    get supportsEmbeddings() { return false; }
  }

  class MockContextWindow {
    constructor(private w: number, private r: number) {}
    needsCompression(_m: any[]) { return false; }
    compress(m: any[]) { return m; }
    setSummaryModel(_p: any, _m: any) {}
  }

  function vecToBytes(v: number[] | null): Buffer | null {
    if (!v) return null;
    return Buffer.from(new Float32Array(v).buffer);
  }

  return { db, MockLlmClient, MockContextWindow, llmChunksQueue, capturedSystemPrompts, conversations, messages, memories, platforms, models, appConfig, get embedMode() { return embedMode; }, set embedMode(v) { embedMode = v; }, vecToBytes };
});

vi.mock('../src/db.js', () => ({ db: hoisted.db, hasSqliteVec: false }));
vi.mock('@yan-zhi/core', () => ({
  LlmClient: hoisted.MockLlmClient,
  getToolRegistry: () => ({ has: () => false, get: () => undefined, names: () => [], execute: async () => { throw new Error('no tool'); } }),
  getApiToolRegistry: () => new Map(),
  ContextWindow: hoisted.MockContextWindow,
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/mcp/api-tool-executor.js', () => ({ executeApiTool: vi.fn(), SUPPORTED_API_TOOLS: [] }));
vi.mock('../src/services/ollama-embed.js', () => ({
  embedText: vi.fn(async (text: string) => {
    if (hoisted.embedMode === 'none') return null;
    if (hoisted.embedMode === 'theme') return String(text).includes('深色主题') ? [1, 0, 0] : [0, 1, 0];
    return [0, 1, 0];
  }),
}));

import { createTask, subscribe, getTask } from '../src/llm-task-manager.js';
import { retrieveRelevantMemories, formatMemoryContext, bumpMemoryCache } from '../src/services/memory-service.js';

const USER_ID = 'u_test';
const PLATFORM_ID = 'p_test';
const MODEL_ID = 'agnes-2.5-flash';
const AGENT_ID = 'a_default_assistant';

function waitForTaskDone(taskId: string, timeout = 8000): Promise<{ status: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const task = getTask(taskId);
      if (task && task.status !== 'running') return resolve({ status: task.status, error: task.error });
      if (Date.now() - start > timeout) return reject(new Error(`任务超时，状态: ${task?.status || 'N/A'}`));
      setTimeout(check, 30);
    };
    check();
  });
}

/** 种入一条记忆。vec 传 null 则无 embedding（走降级路径） */
function seedMemory(id: string, content: string, type: string, agentId: string | null, vec: number[] | null, createdAt = Date.now() - 3600_000): void {
  hoisted.memories.push({
    id, user_id: USER_ID, agent_id: agentId, content, tags_json: '[]',
    embedding: hoisted.vecToBytes(vec),
    metadata_json: JSON.stringify(type === 'daily' ? { date: '2026-09-06' } : type === 'session' ? { conversationId: 'conv_other' } : {}),
    created_at: createdAt, last_used_at: createdAt, type, use_count: 0,
  });
}

beforeEach(() => {
  hoisted.llmChunksQueue.length = 0;
  hoisted.messages.length = 0;
  hoisted.memories.length = 0;
  hoisted.capturedSystemPrompts.length = 0;
  for (const k of Object.keys(hoisted.appConfig)) delete hoisted.appConfig[k];
  hoisted.embedMode = 'theme';
  bumpMemoryCache(USER_ID); // 每个用例重置 memory-service 的进程内缓存
});

describe('记忆注入（端到端）', () => {
  it('相关查询：记忆被检索并注入 system prompt，快照可见', async () => {
    seedMemory('mem_theme', '用户偏好深色主题，常用 Vue3 + Tauri', 'agent', null, [1, 0, 0]);
    seedMemory('mem_wf', '项目使用 pnpm workspace 管理工作流', 'agent', null, [0, 1, 0]);
    const convId = 'conv_inject_1';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, agent_id: AGENT_ID };

    const taskId = createTask({
      conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '帮我配置深色主题', agentId: AGENT_ID,
    });
    const unsub = subscribe(taskId, () => {});
    const result = await waitForTaskDone(taskId);
    unsub();
    expect(result.status).toBe('completed');

    // system prompt 出现「相关记忆」段，且包含相关记忆、不包含无关记忆
    const sys = hoisted.capturedSystemPrompts[0] || '';
    expect(sys).toContain('## 相关记忆');
    expect(sys).toContain('深色主题');
    expect(sys).not.toContain('pnpm workspace');

    // systemPromptSnapshot（前端「查看提示词」）同样可见
    const snapMsg = hoisted.messages.find((m) => m.role === 'assistant' && m.system_prompt_snapshot);
    const snap = JSON.parse(snapMsg.system_prompt_snapshot);
    expect(snap.systemPrompt).toContain('## 相关记忆');
    expect(snap.systemPrompt).toContain('深色主题');

    // 命中反馈闭环：被注入的 use_count +1，未注入的不变
    const hit = hoisted.memories.find((m) => m.id === 'mem_theme');
    const miss = hoisted.memories.find((m) => m.id === 'mem_wf');
    expect(hit.use_count).toBe(1);
    expect(hit.last_used_at).toBeGreaterThan(hit.created_at);
    expect(miss.use_count).toBe(0);
  });

  it('无关查询（端到端 MIN_REL）：余弦过低的记忆不注入 system prompt', async () => {
    // 只种 [1,0,0]（深色主题）记忆；查询不含关键词 → [0,1,0]，余弦 0 < 0.25 → 不注入
    seedMemory('mem_theme', '用户偏好深色主题', 'agent', null, [1, 0, 0]);
    const convId = 'conv_inject_2';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, agent_id: AGENT_ID };

    const taskId = createTask({
      conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '今天天气怎么样', agentId: AGENT_ID,
    });
    const unsub = subscribe(taskId, () => {});
    const result = await waitForTaskDone(taskId);
    unsub();
    expect(result.status).toBe('completed');

    const sys = hoisted.capturedSystemPrompts[0] || '';
    expect(sys).not.toContain('## 相关记忆');
    expect(sys).not.toContain('深色主题');
    // 未注入 → use_count 不变
    expect(hoisted.memories[0].use_count).toBe(0);
  });

  it('降级检索：embedding 不可用时按词面命中注入，零命中不注入', async () => {
    hoisted.embedMode = 'none';
    seedMemory('mem_theme', '用户偏好深色主题，常用 Vue3', 'agent', null, null);
    seedMemory('mem_wf', '项目使用 pnpm workspace', 'agent', null, null);

    // 词面命中
    const hit = await retrieveRelevantMemories(USER_ID, null, '深色主题怎么开');
    expect(hit.length).toBe(1);
    expect(hit[0].id).toBe('mem_theme');
    // agent_id 为空的记忆归一化为 profile 维度 → 标签 [画像]
    expect(formatMemoryContext(hit)).toContain('[画像] 用户偏好深色主题');

    // 词面零命中 → 不注入
    const miss = await retrieveRelevantMemories(USER_ID, null, '明天股票行情');
    expect(miss.length).toBe(0);
    expect(formatMemoryContext(miss)).toBe('');
  });

  it('语义去重：余弦 > 0.92 的重复记忆只注入分高者', async () => {
    seedMemory('mem_a', '用户偏好深色主题界面', 'agent', null, [1, 0, 0]);
    seedMemory('mem_b', '用户喜欢深色主题的界面风格', 'agent', null, [1, 0, 0]);
    const items = await retrieveRelevantMemories(USER_ID, null, '深色主题');
    expect(items.length).toBe(1);
  });

  it('MIN_REL 下限：与查询主题无关（余弦 < 0.25）的记忆被过滤', async () => {
    // 查询「深色主题」→ [1,0,0]；记忆 [0,1,0] 余弦 0 → 过滤
    seedMemory('mem_wf', '项目使用 pnpm workspace', 'agent', null, [0, 1, 0]);
    const items = await retrieveRelevantMemories(USER_ID, null, '深色主题');
    expect(items.length).toBe(0);
  });

  it('维度可见性：其他 agent 的记忆不参与检索', async () => {
    seedMemory('mem_other_agent', '深色主题相关的其他智能体记忆', 'agent', 'a_other_agent', [1, 0, 0]);
    seedMemory('mem_mine', '深色主题的当前智能体记忆', 'agent', AGENT_ID, [1, 0, 0]);
    const items = await retrieveRelevantMemories(USER_ID, AGENT_ID, '深色主题');
    expect(items.some((m) => m.id === 'mem_other_agent')).toBe(false);
    expect(items.some((m) => m.id === 'mem_mine')).toBe(true);
  });

  it('注入配置关闭（enabled=false）：相关记忆也不注入', async () => {
    hoisted.appConfig['memory_injection_config'] = JSON.stringify({ enabled: false });
    seedMemory('mem_theme', '用户偏好深色主题', 'agent', null, [1, 0, 0]);
    const convId = 'conv_inject_3';
    hoisted.conversations[convId] = { id: convId, user_id: USER_ID, agent_id: AGENT_ID };

    const taskId = createTask({
      conversationId: convId, userId: USER_ID, platformId: PLATFORM_ID, modelId: MODEL_ID,
      userContent: '帮我配置深色主题', agentId: AGENT_ID,
    });
    const unsub = subscribe(taskId, () => {});
    const result = await waitForTaskDone(taskId);
    unsub();
    expect(result.status).toBe('completed');

    const sys = hoisted.capturedSystemPrompts[0] || '';
    expect(sys).not.toContain('## 相关记忆');
  });
});
