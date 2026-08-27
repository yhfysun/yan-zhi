// 智能体 store（聊天 + 工作流统一）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent, Workflow, WorkflowNode, WorkflowEdge, NodeType } from '@yan-zhi/shared';
import { getPlatformAdapter, WorkflowEngine, LlmNodeHandler, ToolNodeHandler } from '@yan-zhi/core';
import { uid, now } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

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
    isBuiltin: !!r.is_builtin,
    isPublic: !!r.is_public,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EMPTY_WORKFLOW: Workflow = { nodes: [], edges: [] };

// 默认 agent 自动挂载的常用内置工具。
// cmd_exec 涉及系统 shell 执行（仅桌面端可用且有安全风险），不自动挂载，留给用户按需开启。
// call_agent 用于委派子智能体（如 pageAgent）。
const DEFAULT_BUILTIN_TOOLS = ['file_read', 'file_write', 'web_search', 'call_agent', 'ask_user', 'confirm_user', 'task_plan', 'task_step', 'configure_model_platform'];

const DEFAULT_AGENT_DATA = {
  name: 'AI 助手',
  builtinToolIds: DEFAULT_BUILTIN_TOOLS,
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

/**
 * 默认智能体固定 ID：保证幂等插入。
 * Tauri 客户端启动时 webview 常发生一次重载（vite dev server 就绪前后各加载一次），
 * 两次 onMounted 各自的 loadAgents 都会看到空表 → 各插一条 → 重复。
 * 用固定 ID + 冲突忽略，无论并发/重载多少次都只会有一条默认智能体。
 */
const DEFAULT_AGENT_ID = 'a_default_assistant';

/** 默认 agent 结构版本：作为一次性迁移门槛。
 *  version < N 时执行迁移，迁移后置为 N，避免反复覆盖用户后续对工具挂载的修改（如手动清空）。 */
const DEFAULT_AGENT_VERSION = 5;

// ========== E5: pageAgent（内置浏览器自动化智能体） ==========
/** pageAgent 固定 ID：内置智能体，浏览器操作专家 */
const PAGE_AGENT_ID = 'a_builtin_page_agent';

/** pageAgent 挂载的浏览器工具集 */
const PAGE_AGENT_BUILTIN_TOOLS = [
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom',
  'browser_wait', 'browser_screenshot',
];

const PAGE_AGENT_DATA = {
  name: '浏览器操作专家',
  description: '内置 pageAgent：通过 Playwright 驱动真实浏览器，执行导航/点击/输入/截图等自动化任务',
  type: 'harness' as const,
  systemPrompt: `你是一个浏览器自动化专家（pageAgent）。你通过调用浏览器工具来操作一个真实的、可见的浏览器窗口。

能力：
- browser_navigate: 导航到指定 URL
- browser_click: 点击元素（CSS 选择器或坐标）
- browser_type: 在输入框输入文本
- browser_press_key: 按键（Enter/Tab/Escape 等）
- browser_scroll: 滚动页面
- browser_hover: 悬停元素
- browser_get_text: 获取元素文本
- browser_get_dom: 获取页面 DOM 摘要
- browser_wait: 等待指定时间
- browser_screenshot: 截图

工作流程：
1. 分析委派给你的任务（如"打开某网站搜索某关键词"）
2. browser_navigate 导航到目标页面
3. 用 browser_get_text/get_dom 了解页面结构，找到目标元素的 CSS 选择器
4. 用 browser_click/type/press_key 执行操作
5. 必要时 browser_wait 等待页面加载
6. 用 browser_get_text 获取最终结果
7. 返回任务结果摘要

注意：
- 使用 CSS 选择器定位元素（如 input.search-box、button#submit）
- 如果选择器找不到元素，用 get_dom 查看页面结构后调整
- 每步操作后观察结果，确认是否成功
- 用中文返回结果摘要`,
  temperature: 0.3,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isBuiltin: true,
  config: { maxReActSteps: 15 },
};

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([]);
  const current = ref<Agent | null>(null);
  const running = ref(false);
  const runLogs = ref<Array<{ nodeId: string; status: 'start' | 'ok' | 'error'; msg?: string; time: number }>>([]);

  const selectedId = ref('');

  /**
   * loadAgents 进行中的 Promise：防止同一 store 实例内并发触发重复插入。
   * 并发的调用方共享同一个 Promise，避免两个 loadAgents 同时看到空表。
   */
  let loadInflight: Promise<void> | null = null;

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
    // inflight 去重：同一 store 实例内并发调用共享同一个 Promise，
    // 避免两个 loadAgents 同时 SELECT 空表后各自 INSERT 造成重复。
    if (loadInflight) return loadInflight;
    loadInflight = (async () => {
      try {
        const adapter = getPlatformAdapter();
        let rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
        if (rows.length === 0) {
          const ts = now();
          // 固定 ID 插入：跨会话（如 webview 重载）的并发下，主键冲突会被 catch 忽略，
          // 保证默认智能体全局唯一。兼容 web 端 Dexie（table.add 主键冲突抛错亦被 catch）。
          try {
            await adapter.db.exec(
              `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, is_default, builtin_tool_ids, workflow_json, config_json, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [DEFAULT_AGENT_ID, DEFAULT_AGENT_DATA.name, DEFAULT_AGENT_DATA.description, DEFAULT_AGENT_DATA.systemPrompt,
               DEFAULT_AGENT_DATA.temperature, DEFAULT_AGENT_DATA.maxTokens, DEFAULT_AGENT_DATA.topP,
               DEFAULT_AGENT_DATA.frequencyPenalty, DEFAULT_AGENT_DATA.presencePenalty, 1,
               JSON.stringify(DEFAULT_AGENT_DATA.builtinToolIds),
               JSON.stringify(EMPTY_WORKFLOW), JSON.stringify(DEFAULT_AGENT_DATA.config), DEFAULT_AGENT_VERSION, ts, ts],
            );
          } catch {
            // 主键冲突：已被并发调用或前一次会话插入，忽略
          }
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
        }
        // 清理历史遗留的重复默认智能体（修复前已产生的重复数据）：
        // 只在"名为默认 AI 助手且 is_default=1"的记录中保留 created_at 最早的一条，
        // 其余降级为普通智能体。收窄到 name 匹配，避免误伤用户主动设为默认的其他智能体。
        // 不直接 DELETE，避免破坏 conversation.agent_id 引用；用户可手动删除降级后的项。
        const dupDefaults = rows.filter((r: any) => r.is_default === 1 && r.name === DEFAULT_AGENT_DATA.name);
        if (dupDefaults.length > 1) {
          const keepId = dupDefaults[0].id; // ORDER BY created_at ASC 后第一条
          for (const r of dupDefaults) {
            if (r.id !== keepId) {
              // 用占位符传值（而非字面量 0），兼容 web 端 Dexie 的 UPDATE 实现
              await adapter.db.exec('UPDATE agent SET is_default = ? WHERE id = ?', [0, r.id]);
            }
          }
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
        }

        // 一次性迁移（v2）：为历史默认 agent 补挂常用内置工具。
        // 门槛：version < DEFAULT_AGENT_VERSION 且 builtin_tool_ids 为空（从未显式挂载过）。
        // 迁移后 version 升级，后续即使用户清空工具也不会被反复覆盖。
        const defRow = rows.find((r: any) => r.is_default === 1);
        if (defRow && (defRow.version === null || defRow.version === undefined || Number(defRow.version) < DEFAULT_AGENT_VERSION) && !defRow.builtin_tool_ids) {
          await adapter.db.exec(
            'UPDATE agent SET builtin_tool_ids = ?, version = ? WHERE id = ?',
            [JSON.stringify(DEFAULT_BUILTIN_TOOLS), DEFAULT_AGENT_VERSION, defRow.id],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
        }

        // E5: seed pageAgent（内置浏览器自动化智能体）—— 若不存在则插入
        const hasPageAgent = rows.some((r: any) => r.id === PAGE_AGENT_ID);
        if (!hasPageAgent) {
          const ts = now();
          try {
            await adapter.db.exec(
              `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, type, is_builtin, builtin_tool_ids, workflow_json, config_json, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [PAGE_AGENT_ID, PAGE_AGENT_DATA.name, PAGE_AGENT_DATA.description, PAGE_AGENT_DATA.systemPrompt,
               PAGE_AGENT_DATA.temperature, PAGE_AGENT_DATA.maxTokens, PAGE_AGENT_DATA.topP,
               PAGE_AGENT_DATA.frequencyPenalty, PAGE_AGENT_DATA.presencePenalty, 'harness', 1,
               JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS),
               JSON.stringify(EMPTY_WORKFLOW), JSON.stringify(PAGE_AGENT_DATA.config), 1, ts, ts],
            );
          } catch {
            // 主键冲突：已被并发调用插入，忽略
          }
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // E6: v3 迁移 —— 为历史默认 agent 补挂 pageAgent 为子智能体 + call_agent 工具
        // 门槛：version < 3 且 sub_agent_ids 为空（从未显式挂载过子智能体）
        const defRowV3 = rows.find((r: any) => r.is_default === 1);
        if (defRowV3 && (defRowV3.version === null || defRowV3.version === undefined || Number(defRowV3.version) < 3) && !defRowV3.sub_agent_ids) {
          // 确保 call_agent 在 builtin_tool_ids 中
          let builtinIds: string[] = defRowV3.builtin_tool_ids ? JSON.parse(defRowV3.builtin_tool_ids) : DEFAULT_BUILTIN_TOOLS;
          if (!builtinIds.includes('call_agent')) {
            builtinIds = [...builtinIds, 'call_agent'];
          }
          await adapter.db.exec(
            'UPDATE agent SET builtin_tool_ids = ?, sub_agent_ids = ?, version = ? WHERE id = ?',
            [JSON.stringify(builtinIds), JSON.stringify([PAGE_AGENT_ID]), 3, defRowV3.id],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // E12b: v4 迁移 —— 为历史默认 agent 补挂 confirm_user（多页确认向导）。
        // 只追加缺失的 confirm_user，不覆盖用户后续手动调整过的其他工具挂载。
        const defRowV4 = rows.find((r: any) => r.is_default === 1);
        if (defRowV4 && (defRowV4.version === null || defRowV4.version === undefined || Number(defRowV4.version) < 4)) {
          let builtinIds: string[] = [];
          try {
            builtinIds = defRowV4.builtin_tool_ids ? JSON.parse(defRowV4.builtin_tool_ids) : [];
          } catch {
            builtinIds = [];
          }
          if (!Array.isArray(builtinIds)) builtinIds = [];
          if (!builtinIds.includes('confirm_user')) {
            builtinIds = [...builtinIds, 'confirm_user'];
            await adapter.db.exec(
              'UPDATE agent SET builtin_tool_ids = ?, version = ? WHERE id = ?',
              [JSON.stringify(builtinIds), 4, defRowV4.id],
            );
            rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
          } else if (Number(defRowV4.version) < 4) {
            await adapter.db.exec('UPDATE agent SET version = ? WHERE id = ?', [4, defRowV4.id]);
          }
        }

        // v5 迁移 —— 为历史默认 agent 补挂 configure_model_platform（模型平台配置弹窗）。
        // 只追加缺失的 configure_model_platform，不覆盖用户后续手动调整过的其他工具挂载。
        const defRowV5 = rows.find((r: any) => r.is_default === 1);
        if (defRowV5 && (defRowV5.version === null || defRowV5.version === undefined || Number(defRowV5.version) < 5)) {
          let builtinIds: string[] = [];
          try {
            builtinIds = defRowV5.builtin_tool_ids ? JSON.parse(defRowV5.builtin_tool_ids) : [];
          } catch {
            builtinIds = [];
          }
          if (!Array.isArray(builtinIds)) builtinIds = [];
          if (!builtinIds.includes('configure_model_platform')) {
            builtinIds = [...builtinIds, 'configure_model_platform'];
            await adapter.db.exec(
              'UPDATE agent SET builtin_tool_ids = ?, version = ? WHERE id = ?',
              [JSON.stringify(builtinIds), 5, defRowV5.id],
            );
            rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
          } else if (Number(defRowV5.version) < 5) {
            await adapter.db.exec('UPDATE agent SET version = ? WHERE id = ?', [5, defRowV5.id]);
          }
        }

        agents.value = rows.map(rowToAgent);
        if (!selectedId.value || !agents.value.find((a) => a.id === selectedId.value)) {
          selectedId.value = agents.value.find((a) => a.isDefault)?.id || agents.value[0]?.id || '';
        }
      } finally {
        loadInflight = null;
      }
    })();
    return loadInflight;
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
      `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, platform_id, model_id, type, builtin_tool_ids, custom_tool_ids, mcp_tool_mounts, skill_ids, sub_agent_ids, is_default, is_public, workflow_json, config_json, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.isPublic ? 1 : 0,
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
    if (patch.isPublic !== undefined) { sets.push('is_public = ?'); params.push(patch.isPublic ? 1 : 0); }
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

  /**
   * 发布智能体到商城：把本地 agent 快照 upsert 到服务端 agent 表并置 is_public=1。
   * 本地表 is_public 同步置 1。需登录（JWT 鉴权），未登录时静默跳过。
   * agent 由本地 adapter 管理、商城读服务端 DB，故发布 = 跨库同步定义。
   */
  async function publishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!useAuthStore().isLoggedIn) return { ok: false, error: '未登录，无法发布' };
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [id]);
    if (rows.length === 0) return { ok: false, error: '智能体不存在' };
    const a = rowToAgent(rows[0]);
    const r = await api.post<any>('/marketplace/agents/publish', { agent: a });
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    await adapter.db.exec('UPDATE agent SET is_public = 1, updated_at = ? WHERE id = ?', [now(), id]);
    const i = agents.value.findIndex((x) => x.id === id);
    if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: true };
    if (current.value?.id === id) current.value = { ...current.value, isPublic: true };
    return { ok: true };
  }

  /** 下架智能体：服务端 is_public 置 0，本地同步。 */
  async function unpublishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!useAuthStore().isLoggedIn) return { ok: false, error: '未登录' };
    const r = await api.post<any>(`/marketplace/agents/${id}/unpublish`);
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    const adapter = getPlatformAdapter();
    await adapter.db.exec('UPDATE agent SET is_public = 0, updated_at = ? WHERE id = ?', [now(), id]);
    const i = agents.value.findIndex((x) => x.id === id);
    if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: false };
    if (current.value?.id === id) current.value = { ...current.value, isPublic: false };
    return { ok: true };
  }

  /**
   * 从远程商城安装智能体：服务端代理调远程 install 端点（递增远程计数）并返回完整定义，
   * 客户端再写入本地 adapter 表（agent 由本地 adapter 管理，服务端表仅做中转）。
   */
  async function installFromMarketplace(sourceId: string, agentId: string): Promise<{ ok: boolean; error?: string }> {
    const r = await api.post<any>(`/agent-marketplace/${sourceId}/install`, { agentId });
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    const a = (r as any).data;
    if (!a) return { ok: false, error: '远程智能体数据为空' };
    const adapter = getPlatformAdapter();
    const id = uid('a_');
    const ts = now();
    // 写入本地 adapter 表（列名与 core schema 一致，snake_case）
    await adapter.db.exec(
      `INSERT INTO agent (id, name, description, avatar, workflow_json, inputs_schema_json, config_json,
       type, is_default, is_public, source, remote_source_id, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'harness', 0, 0, 'remote', ?, 1, ?, ?)`,
      [
        id, a.name || '远程智能体', a.description || null, a.avatar || null,
        JSON.stringify(a.workflow || { nodes: [], edges: [] }),
        a.inputsSchema ? JSON.stringify(a.inputsSchema) : null,
        a.config ? JSON.stringify(a.config) : null,
        sourceId, ts, ts,
      ],
    );
    await loadAgents();
    return { ok: true };
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
    // E8: 内置智能体（如 pageAgent）不可删除
    if (agent.isBuiltin) return;
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
    publishAgent, unpublishAgent, installFromMarketplace,
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
