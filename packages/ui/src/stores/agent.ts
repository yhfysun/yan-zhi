// 智能体 store（聊天 + 工作流统一）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent, Workflow, WorkflowNode, WorkflowEdge, NodeType } from '@yan-zhi/shared';
import { getPlatformAdapter, WorkflowEngine, LlmNodeHandler, ToolNodeHandler } from '@yan-zhi/core';
import { uid, now } from '@yan-zhi/shared';

function rowToAgent(r: any): Agent {
  const wf: Workflow = r.workflow_json ? JSON.parse(r.workflow_json) : { nodes: [], edges: [] };
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    avatar: r.avatar,
    systemPrompt: r.system_prompt || '',
    temperature: r.temperature ?? 0.7,
    maxTokens: r.max_tokens ?? 2048,
    topP: r.top_p ?? 1.0,
    frequencyPenalty: r.frequency_penalty ?? 0,
    presencePenalty: r.presence_penalty ?? 0,
    platformId: r.platform_id || '',
    modelId: r.model_id || '',
    type: (r.type as Agent['type']) || 'harness',
    builtinToolIds: r.builtin_tool_ids ? JSON.parse(r.builtin_tool_ids) : undefined,
    customToolIds: r.custom_tool_ids ? JSON.parse(r.custom_tool_ids) : undefined,
    mcpToolMounts: r.mcp_tool_mounts ? JSON.parse(r.mcp_tool_mounts) : undefined,
    skillIds: r.skill_ids ? JSON.parse(r.skill_ids) : undefined,
    subAgentIds: r.sub_agent_ids ? JSON.parse(r.sub_agent_ids) : undefined,
    workflow: wf,
    inputsSchema: r.inputs_schema_json ? JSON.parse(r.inputs_schema_json) : undefined,
    config: r.config_json ? JSON.parse(r.config_json) : undefined,
    parentAgentId: r.parent_agent_id,
    allowSubAgent: !!r.allow_sub_agent,
    isDefault: !!r.is_default,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EMPTY_WORKFLOW: Workflow = { nodes: [], edges: [] };

const DEFAULT_AGENT_DATA = {
  name: 'AI 助手',
  description: '默认 Harness 智能体，挂载工具/Skill/子智能体后即可使用，大模型自主 ReAct 决策',
  type: 'harness' as const,
  systemPrompt: `你是一个 ReAct（推理-行动）智能体。遵循以下规则：

1. **思考**：分析用户需求并决定下一步操作。
2. **行动**：调用可用工具获取信息或执行操作。
3. **观察**：分析工具返回结果，判断是否满足需求。
4. **循环**：重复 思考→行动→观察 直到任务完成。

行为准则：
- 尽量在一次响应中完成简单任务
- 需要外部信息时主动调用工具
- 工具返回的信息可能不完整，多轮调用获取全面数据
- 用中文回复，代码需标注语言
- 回复简洁有效，不输出无关内容`,
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isDefault: true,
  config: { maxReActSteps: 10 },
};

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([]);
  const current = ref<Agent | null>(null);
  const running = ref(false);
  const runLogs = ref<Array<{ nodeId: string; status: 'start' | 'ok' | 'error'; msg?: string; time: number }>>([]);

  const selectedId = ref('');

  const selectedAgent = computed(() =>
    agents.value.find((a) => a.id === selectedId.value)
    || agents.value.find((a) => a.isDefault)
    || agents.value[0]
  );

  function defaultAgentBase() {
    const def = agents.value.find((a) => a.isDefault);
    return {
      systemPrompt: def?.systemPrompt || DEFAULT_AGENT_DATA.systemPrompt,
      temperature: def?.temperature ?? DEFAULT_AGENT_DATA.temperature,
      maxTokens: def?.maxTokens ?? DEFAULT_AGENT_DATA.maxTokens,
      topP: def?.topP ?? DEFAULT_AGENT_DATA.topP,
      frequencyPenalty: def?.frequencyPenalty ?? DEFAULT_AGENT_DATA.frequencyPenalty,
      presencePenalty: def?.presencePenalty ?? DEFAULT_AGENT_DATA.presencePenalty,
      config: def?.config ?? DEFAULT_AGENT_DATA.config,
    };
  }

  function selectAgent(id: string) {
    if (agents.value.find((a) => a.id === id)) selectedId.value = id;
  }

  let engine: WorkflowEngine | null = null;
  function getEngine(): WorkflowEngine {
    if (!engine) {
      engine = new WorkflowEngine();
      engine.register(new LlmNodeHandler());
      engine.register(new ToolNodeHandler());
      engine.register(new InputNodeHandler());
      engine.register(new OutputNodeHandler());
      engine.register(new CodeNodeHandler());
      engine.register(new ConditionNodeHandler());
      engine.register(new LoopNodeHandler());
      engine.register(new SubAgentNodeHandler());
      engine.register(new MemoryReadNodeHandler());
      engine.register(new MemoryWriteNodeHandler());
    }
    return engine;
  }

  async function loadAgents() {
    const adapter = getPlatformAdapter();
    let rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
    if (rows.length === 0) {
      const id = uid('a_');
      const ts = now();
      await adapter.db.exec(
        `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, is_default, workflow_json, config_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, DEFAULT_AGENT_DATA.name, DEFAULT_AGENT_DATA.description, DEFAULT_AGENT_DATA.systemPrompt,
         DEFAULT_AGENT_DATA.temperature, DEFAULT_AGENT_DATA.maxTokens, DEFAULT_AGENT_DATA.topP,
         DEFAULT_AGENT_DATA.frequencyPenalty, DEFAULT_AGENT_DATA.presencePenalty, 1,
         JSON.stringify(EMPTY_WORKFLOW), JSON.stringify(DEFAULT_AGENT_DATA.config), 1, ts, ts],
      );
      rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
    }
    agents.value = rows.map(rowToAgent);
    if (!selectedId.value || !agents.value.find((a) => a.id === selectedId.value)) {
      selectedId.value = agents.value.find((a) => a.isDefault)?.id || agents.value[0]?.id || '';
    }
  }

  async function loadAgent(id: string) {
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [id]);
    if (rows.length > 0) current.value = rowToAgent(rows[0]);
    else current.value = null;
  }

  async function createAgent(name: string, description = ''): Promise<string> {
    const adapter = getPlatformAdapter();
    const id = uid('a_');
    const ts = now();
    await adapter.db.exec(
      'INSERT INTO agent (id, name, description, workflow_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, description, JSON.stringify(EMPTY_WORKFLOW), 1, ts, ts],
    );
    await loadAgents();
    return id;
  }

  async function createChatAgent(data: Partial<Agent>): Promise<string> {
    const adapter = getPlatformAdapter();
    const id = uid('a_');
    const ts = now();
    const defaults = defaultAgentBase();
    const systemPrompt = data.systemPrompt || defaults.systemPrompt;
    const config = data.config && Object.keys(data.config).length > 0
      ? data.config
      : (defaults.config ? { ...defaults.config, ...data.config } : data.config);
    await adapter.db.exec(
      `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, platform_id, model_id, type, builtin_tool_ids, custom_tool_ids, mcp_tool_mounts, skill_ids, sub_agent_ids, is_default, workflow_json, config_json, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name || '新智能体',
        data.description || '',
        systemPrompt,
        data.temperature ?? defaults.temperature,
        data.maxTokens ?? defaults.maxTokens,
        data.topP ?? defaults.topP,
        data.frequencyPenalty ?? defaults.frequencyPenalty,
        data.presencePenalty ?? defaults.presencePenalty,
        data.platformId || '',
        data.modelId || '',
        data.type || 'harness',
        data.builtinToolIds?.length ? JSON.stringify(data.builtinToolIds) : null,
        data.customToolIds?.length ? JSON.stringify(data.customToolIds) : null,
        data.mcpToolMounts?.length ? JSON.stringify(data.mcpToolMounts) : null,
        data.skillIds?.length ? JSON.stringify(data.skillIds) : null,
        data.subAgentIds?.length ? JSON.stringify(data.subAgentIds) : null,
        0,
        data.workflow ? JSON.stringify(data.workflow) : JSON.stringify(EMPTY_WORKFLOW),
        config ? JSON.stringify(config) : null,
        1, ts, ts,
      ],
    );
    await loadAgents();
    return id;
  }

  async function updateAgent(id: string, patch: Partial<Agent>) {
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: [unknown, string][] = [
      [patch.name, 'name'],
      [patch.description, 'description'],
      [patch.avatar, 'avatar'],
      [patch.systemPrompt, 'system_prompt'],
      [patch.temperature, 'temperature'],
      [patch.maxTokens, 'max_tokens'],
      [patch.topP, 'top_p'],
      [patch.frequencyPenalty, 'frequency_penalty'],
      [patch.presencePenalty, 'presence_penalty'],
      [patch.platformId, 'platform_id'],
      [patch.modelId, 'model_id'],
      [patch.type, 'type'],
    ];
    for (const [val, col] of map) {
      if (val !== undefined) { sets.push(`${col} = ?`); params.push(val); }
    }
    if (patch.config !== undefined) {
      sets.push('config_json = ?');
      params.push(JSON.stringify(patch.config));
    }
    if (patch.builtinToolIds !== undefined) {
      sets.push('builtin_tool_ids = ?');
      params.push(patch.builtinToolIds.length ? JSON.stringify(patch.builtinToolIds) : null);
    }
    if (patch.customToolIds !== undefined) {
      sets.push('custom_tool_ids = ?');
      params.push(patch.customToolIds.length ? JSON.stringify(patch.customToolIds) : null);
    }
    if (patch.mcpToolMounts !== undefined) {
      sets.push('mcp_tool_mounts = ?');
      params.push(patch.mcpToolMounts.length ? JSON.stringify(patch.mcpToolMounts) : null);
    }
    if (patch.skillIds !== undefined) {
      sets.push('skill_ids = ?');
      params.push(patch.skillIds.length ? JSON.stringify(patch.skillIds) : null);
    }
    if (patch.subAgentIds !== undefined) {
      sets.push('sub_agent_ids = ?');
      params.push(patch.subAgentIds.length ? JSON.stringify(patch.subAgentIds) : null);
    }
    if (patch.isDefault !== undefined) { sets.push('is_default = ?'); params.push(patch.isDefault ? 1 : 0); }
    if (patch.allowSubAgent !== undefined) { sets.push('allow_sub_agent = ?'); params.push(patch.allowSubAgent ? 1 : 0); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(now());
    params.push(id);
    await adapter.db.exec(`UPDATE agent SET ${sets.join(', ')} WHERE id = ?`, params);
    const idx = agents.value.findIndex((a) => a.id === id);
    if (idx >= 0) agents.value[idx] = { ...agents.value[idx], ...patch };
    if (current.value?.id === id) current.value = { ...current.value, ...patch };
    await loadAgents();
  }

  async function updateWorkflow(id: string, workflow: Workflow) {
    const adapter = getPlatformAdapter();
    await adapter.db.exec(
      'UPDATE agent SET workflow_json = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(workflow), now(), id],
    );
    if (current.value?.id === id) current.value = { ...current.value, workflow };
    const idx = agents.value.findIndex((a) => a.id === id);
    if (idx >= 0) agents.value[idx] = { ...agents.value[idx], workflow };
  }

  async function deleteAgent(id: string) {
    const agent = agents.value.find((a) => a.id === id);
    if (!agent || agent.isDefault) return;
    if (agents.value.length <= 1) return;
    const adapter = getPlatformAdapter();
    await adapter.db.exec('DELETE FROM agent WHERE id = ?', [id]);
    agents.value = agents.value.filter((a) => a.id !== id);
    if (selectedId.value === id) {
      selectedId.value = agents.value[0]?.id || '';
    }
    if (current.value?.id === id) current.value = null;
  }

  async function runAgent(id: string, inputs: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [id]);
    if (rows.length === 0) throw new Error('智能体不存在');
    const agent = rowToAgent(rows[0]);
    running.value = true;
    runLogs.value = [];
    try {
      const eng = getEngine();
      const result = await eng.run(agent, inputs, { callStack: [id] });
      runLogs.value.unshift({ nodeId: '__end__', status: 'ok', time: Date.now() });
      return result;
    } catch (e: any) {
      runLogs.value.unshift({ nodeId: '__end__', status: 'error', msg: e?.message, time: Date.now() });
      throw e;
    } finally {
      running.value = false;
    }
  }

  function addNode(type: NodeType, position = { x: 100, y: 100 }): WorkflowNode {
    const node: WorkflowNode = {
      id: uid('n_'),
      type,
      config: defaultNodeConfig(type),
      position,
    };
    return node;
  }

  function defaultNodeConfig(type: NodeType): Record<string, unknown> {
    switch (type) {
      case 'llm': return { platformId: '', modelId: '', systemPrompt: '', temperature: 0.7, maxTokens: 2048 };
      case 'tool': return { toolSource: 'mcp', mcpServerId: '', toolName: '', arguments: {} };
      case 'input': return { schema: {} };
      case 'output': return { key: 'result' };
      case 'code': return { expression: 'return ctx.input;' };
      case 'condition': return { expression: 'return true;', branches: ['true', 'false'] };
      case 'loop': return { maxIterations: 5, iterateKey: 'item', bodyExpr: 'return ctx.input;' };
      case 'sub_agent': return { subAgentId: '', inputsMapping: {} };
      case 'memory_read': return { agentId: '', query: '', topK: 3 };
      case 'memory_write': return { agentId: '', contentKey: 'content', tags: [] };
      default: return {};
    }
  }

  return {
    agents, current, running, runLogs,
    selectedId, selectedAgent, selectAgent,
    loadAgents, loadAgent, createAgent, createChatAgent, updateAgent, updateWorkflow, deleteAgent,
    runAgent, addNode,
  };
});

// 内置节点 handler
import type { NodeHandler, RunContext, NodeResult } from '@yan-zhi/core';

class InputNodeHandler implements NodeHandler {
  type = 'input';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    return { output: ctx.inputs };
  }
}

class OutputNodeHandler implements NodeHandler {
  type = 'output';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const key = (config.key as string) || 'result';
    return { output: ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs[key] };
  }
}

class CodeNodeHandler implements NodeHandler {
  type = 'code';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const expr = (config.expression as string) || 'return null;';
    try {
      // 沙箱：屏蔽危险全局对象
      const sandboxed = `"use strict"; const window=void 0,document=void 0,fetch=void 0,XMLHttpRequest=void 0,eval=void 0,Function=void 0,setTimeout=void 0,setInterval=void 0; return (function(ctx){ ${expr} })(ctx);`;
      const fn = new Function('ctx', sandboxed);
      const out = await Promise.race([
        Promise.resolve(fn(ctx)),
        new Promise<null>((_, rej) => setTimeout(() => rej(new Error('代码节点超时（3s）')), 3000)),
      ]);
      return { output: out };
    } catch {
      return { output: null };
    }
  }
}

class ConditionNodeHandler implements NodeHandler {
  type = 'condition';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const expr = (config.expression as string) || 'return true;';
    try {
      const fn = new Function('ctx', expr);
      const result = fn(ctx);
      return { output: { matched: !!result, value: result } };
    } catch {
      return { output: { matched: false, value: false } };
    }
  }
}

class LoopNodeHandler implements NodeHandler {
  type = 'loop';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    // 引擎层已处理子图循环，这里做单机回退逻辑
    const maxIter = Number(config.maxIterations) || 5;
    const key = (config.iterateKey as string) || 'item';
    const bodyExpr = (config.bodyExpr as string) || '';
    const source = ctx.outputs.size > 0
      ? Array.from(ctx.outputs.values()).pop()
      : ctx.inputs;
    const arr: unknown[] = Array.isArray(source) ? source : (source ? [source] : []);
    const results: unknown[] = [];
    if (bodyExpr) {
      try {
        const fn = new Function('ctx', `"use strict"; const window=void 0,document=void 0,fetch=void 0; return (function(ctx){ ${bodyExpr} })(ctx);`);
        const limit = Math.min(arr.length, maxIter);
        for (let i = 0; i < limit; i++) {
          results.push(fn({ ...ctx, [key]: arr[i], index: i }));
        }
      } catch {}
    }
    return { output: results.length > 0 ? results : source };
  }
}

class SubAgentNodeHandler implements NodeHandler {
  type = 'sub_agent';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const subAgentId = config.subAgentId as string;
    if (!subAgentId) throw new Error('子智能体节点缺少 subAgentId');
    const mapping = (config.inputsMapping as Record<string, unknown>) || {};
    const subInputs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (typeof v === 'string' && v.startsWith('${') && v.endsWith('}')) {
        const path = v.slice(2, -1).split('.').slice(1);
        let cur: any = ctx;
        for (const p of path) cur = cur?.[p];
        subInputs[k] = cur;
      } else {
        subInputs[k] = v;
      }
    }
    const adapter = getPlatformAdapter();
    const [row] = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [subAgentId]);
    if (!row) throw new Error(`子智能体不存在: ${subAgentId}`);
    const wf: Workflow = row.workflow_json ? JSON.parse(row.workflow_json) : { nodes: [], edges: [] };
    const subAgent: Agent = {
      id: row.id, name: row.name, description: row.description,
      workflow: wf, allowSubAgent: !!row.allow_sub_agent, isDefault: false, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
    const eng = new WorkflowEngine();
    eng.register(new LlmNodeHandler());
    eng.register(new ToolNodeHandler());
    eng.register(new InputNodeHandler());
    eng.register(new OutputNodeHandler());
    eng.register(new CodeNodeHandler());
    eng.register(new ConditionNodeHandler());
    eng.register(new LoopNodeHandler());
    eng.register(new MemoryReadNodeHandler());
    eng.register(new MemoryWriteNodeHandler());
    const nextStack = ctx.callStack ? [...ctx.callStack, subAgentId] : [subAgentId];
    const result = await eng.run(subAgent, subInputs, { callStack: nextStack });
    return { output: result };
  }
}

class MemoryReadNodeHandler implements NodeHandler {
  type = 'memory_read';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const agentId = (config.agentId as string) || '';
    const query = (config.query as string) || '';
    const topK = Number(config.topK) || 3;
    const adapter = getPlatformAdapter();
    let rows: any[] = [];
    if (agentId) {
      rows = await adapter.db.query<any>(
        'SELECT * FROM memory WHERE agent_id = ? ORDER BY last_used_at DESC LIMIT ?',
        [agentId, topK],
      );
    } else {
      rows = await adapter.db.query<any>(
        'SELECT * FROM memory ORDER BY last_used_at DESC LIMIT ?',
        [topK],
      );
    }
    if (query) {
      const q = query.toLowerCase();
      rows = rows
        .map((r) => ({ r, score: (r.content || '').toLowerCase().includes(q) ? 1 : 0 }))
        .filter((x) => x.score > 0)
        .map((x) => x.r);
    }
    return { output: rows.map((r) => ({ id: r.id, content: r.content, tags: r.tags_json ? JSON.parse(r.tags_json) : [] })) };
  }
}

class MemoryWriteNodeHandler implements NodeHandler {
  type = 'memory_write';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const agentId = (config.agentId as string) || '';
    const contentKey = (config.contentKey as string) || 'content';
    const tags = (config.tags as string[]) || [];
    const upstream = ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs;
    let content = '';
    if (typeof upstream === 'string') content = upstream;
    else if (upstream && typeof upstream === 'object' && contentKey in (upstream as any)) {
      content = String((upstream as any)[contentKey]);
    } else {
      content = JSON.stringify(upstream);
    }
    const adapter = getPlatformAdapter();
    const id = uid('mem_');
    const ts = now();
    await adapter.db.exec(
      'INSERT INTO memory (id, agent_id, content, tags_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, agentId, content, JSON.stringify(tags), ts, ts],
    );
    return { output: { id, content, tags } };
  }
}
