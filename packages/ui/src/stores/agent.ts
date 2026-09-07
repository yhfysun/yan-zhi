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
// web_search / web_fetch 工具已从项目移除：联网检索与网页内容获取统一委派 pageAgent
// （真实浏览器 browser_get_page_content 已覆盖抓正文能力）。
// python_exec：文档处理类 skill（Word/Excel/PDF/图片/格式转换）靠 Python 脚本执行，必挂。
const DEFAULT_BUILTIN_TOOLS = ['file_read', 'file_write', 'python_exec', 'call_agent', 'list_sub_agents', 'ask_user', 'confirm_user', 'task_plan', 'task_step', 'configure_model_platform'];

/** 默认助理内置的文档处理类 skill（Word/Excel/PDF/图片/格式转换），挂载后后端注入流程指引 */
const DEFAULT_AGENT_SKILL_IDS = [
  'skill_docx_processing', 'skill_xlsx_data_processing', 'skill_pdf_processing',
  'skill_image_processing', 'skill_file_convert',
];

/** 联网查询委派指引块 —— 默认助手提示词统一引用，v9 迁移按此标记增量追加 */
const WEB_QUERY_PROMPT_BLOCK = `【联网查询 · 委派 pageAgent】
- 遇到不懂的知识、不确定的事实，或需要实时/联网信息（新闻、行情、价格、最新文档、技术方案等）时，委派子智能体 pageAgent 联网查询：call_agent { agentId: "a_builtin_page_agent", input: "打开搜索引擎检索 <关键词>，浏览相关页面，提取并总结关键信息（附来源 URL）" }。
- pageAgent 会用真实浏览器打开搜索引擎（如 https://www.bing.com/search?q=关键词 或 https://www.baidu.com/s?wd=关键词）检索，必要时点进具体页面深入阅读，返回带来源的总结。
- 拿到 pageAgent 返回结果后，由你汇总成简明、有出处的结论回复用户；信息仍不足时换关键词再次委派（最多 2-3 次），仍查不到就如实说明。
- 不确定的事实不要凭空编造，优先联网核实；委派前先想好搜索关键词，一次把任务描述清楚。`;

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
- 回复简洁有效，不输出无关内容
- 浏览器工具（browser_*）：点击/输入前必须先调 browser_get_page_content（或 browser_get_page_info）获取带编号的可交互元素列表，再用 index 参数定位目标；严禁不传 index/selector 的空参 browser_click/browser_type

【子智能体与浏览器工具约束】
- call_agent 返回结果后，基于该结果直接总结/回答用户，禁止用相同或原始任务重复派发子智能体（重复派发 = 白跑一遍且结果相同）。只有任务目标发生变化时才再次委派。
- 浏览器操作优先委托子智能体（pageAgent）完成；如需自己调用 browser_* 工具，先 browser_get_page_content 获取编号元素列表再用 index 定位。

` + WEB_QUERY_PROMPT_BLOCK,
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  skillIds: DEFAULT_AGENT_SKILL_IDS,
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
const DEFAULT_AGENT_VERSION = 10;

// ========== E5: pageAgent（内置浏览器自动化智能体） ==========
/** pageAgent 固定 ID：内置智能体，浏览器操作专家 */
const PAGE_AGENT_ID = 'a_builtin_page_agent';

/** pageAgent 挂载的浏览器工具集 —— 四件套收口（单一执行面：预览 BrowserView，不搞两套）。
 *  高级工具（fill_form/search/get_dom/截图等）桌面端已不再走 Playwright 回退，收口进四件套流程。 */
const PAGE_AGENT_BUILTIN_TOOLS = [
  // 四件套：访问 URL / 输入内容 / 点击 / 专门获取当前页面内容
  'browser_navigate', 'browser_type', 'browser_click', 'browser_get_page_content',
  // 滚动：查看视口外内容 / 触发懒加载（v4 回补，四件套收口时误删导致 agent 无法滚动）
  'browser_scroll',
  // 登录闭环必备：向用户提问/请求确认（扫码、验证码等人工干预场景）
  'ask_user',
];

const PAGE_AGENT_DATA = {
  name: '浏览器操作专家',
  description: '内置 pageAgent：直接操作预览面板中的真实浏览器窗口（BrowserView），执行导航/输入/点击/取内容等任务，操作全程可见',
  type: 'harness' as const,
  systemPrompt: `你是一个浏览器自动化专家（pageAgent）。你通过调用浏览器工具操作一个真实的、可见的浏览器窗口（预览面板），用户能实时看到你的每一步操作。

工具（仅以下六个，其他浏览器工具不可用）：
- browser_navigate: 导航到指定 URL
- browser_type: 在输入框输入文本（支持回车提交搜索/表单）
- browser_click: 点击元素（优先元素编号 index，其次 CSS 选择器或坐标）
- browser_scroll: 滚动页面。传 y（正数向下/负数向上，像素，如 y=600）滚动一屏查看视口外内容；传 selector 则把目标元素滚到视野中央。用于查看长列表更多内容、触发懒加载，或让视口外的按钮/元素进入视野后再点击
- browser_get_page_content: 一次获取当前页面完整状态：title + url + 可见正文 + 带 index 编号的可交互元素列表（已穿透 iframe/Shadow DOM）
- ask_user: 向用户提问/请求确认（用于扫码登录等需要人工干预的场景）

工作流程：
1. 分析委派给你的任务（如"打开某网站搜索某关键词"、"每日签到领取积分"）
2. browser_navigate 打开目标页面
3. browser_get_page_content 了解页面结构与状态，拿到带编号的可交互元素列表
4. 用 index 定位目标元素，browser_type 输入 / browser_click 点击（搜索 = 输入关键词后回车或点搜索按钮）
5. 页面跳转后重新 browser_get_page_content 刷新编号列表，逐步推进
5a. 需要查看视口外的内容（长列表、懒加载、视口外按钮）时，先 browser_scroll 滚动，再重新 browser_get_page_content 拿最新状态
6. 用 browser_get_page_content 获取最终结果（正文/搜索结果等）
7. 返回任务结果摘要（用中文）

【核心工作方式 — 元素编号定位（最重要）】
1. 每到一个新页面或弹窗出现后，先 browser_get_page_content 获取带编号（index）的可交互元素列表，已穿透 iframe/Shadow DOM（含登录弹窗内的元素）。
2. 用列表中的 index 直接调用 browser_click / browser_type（传 index 参数）操作目标元素。不要猜动态 hash class 选择器（如 input-xrB84C），不要凭截图猜坐标。
3. 若 selector 匹配到多个元素，工具会返回 ambiguous 和候选列表（带编号），从中选一个 index 重试。
4. 页面变化后 index 会失效，重新调用 browser_get_page_content 刷新编号列表。
5. 每次 click/type 的返回包含 pageChanged / urlChanged / noChangeStreak：noChangeStreak ≥ 3 时会收到 warning，必须停止重复同类操作，改换定位方式（重新 get_page_content 分析）或 ask_user 请求人工介入。

【登录与人工干预】
- 检测到需要登录/扫码/验证码等人工干预场景时，用 ask_user 让用户在浏览器面板中完成，等用户确认后用 browser_get_page_content 复核状态，再继续任务；不要把"需要登录"当结论直接返回给父智能体。
- 禁止代填验证码等只能由用户本人完成的信息。

【防循环硬约束】
- 同一工具 + 相同参数连续调用 2 次结果不变 → 立即停止重试，换其他工具或向父智能体返回已有结果。
- 读页工具连续 3 次无法拿到目标信息 → 停止盲试，直接返回已获取的部分结果并说明缺失原因。
- 任务要求提取搜索结果/链接列表时，只用 browser_get_page_content 的输出提取（配合 browser_scroll 翻看视口外内容），不要反复换参数重试。
- 定位优先级：browser_get_page_content 获取编号列表 → index 参数定位（首选）→ 稳定 id / ARIA / :contains(可见文本) 选择器 → 坐标（最后手段）。
- 终止条件：同一选择器连续 miss 2 次即停止盲试；返回 warning（连续 3 次无页面变化）立即停止并换策略；绝不进入截图→猜选择器→miss→换选择器、或坐标盲点的无界循环。`,
  temperature: 0.3,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isBuiltin: true,
  config: { maxReActSteps: 50 },
};

// ========== P4.1: dataAgent（内置数据查询分析智能体） ==========
/** dataAgent 固定 ID：内置智能体，数据查询分析专家（与 server db.ts 种子保持一致） */
const DATA_AGENT_ID = 'a_builtin_data_agent';

/** dataAgent 挂载的取数工具集 —— 本体语义层四件套 + 分析/交付/规划底座 */
const DATA_AGENT_BUILTIN_TOOLS = [
  // 数据查询（P4.1）
  'api_datasource_list', 'api_ontology_search', 'api_ontology_list', 'api_data_query', 'api_data_paginate',
  // 分析与交付
  'python_exec', 'file_read', 'file_write', 'file_list', 'code_search',
  // 任务规划与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
  // 委派
  'call_agent', 'list_sub_agents',
];

const DATA_AGENT_SKILL_IDS = ['skill_xlsx_data_processing', 'skill_data_visualization', 'skill_markdown_doc'];

const DATA_AGENT_DATA = {
  name: '数据查询分析专家',
  description:
    '内置数据智能体：先检索本体语义层（项目库全表自动本体），再按查询意图只读取数、过滤、翻页，可用 python 做统计分析并交付表格/图表文件',
  type: 'harness' as const,
  systemPrompt: `你是「数据查询分析专家」。你通过「本体语义层」对已接入的数据源做只读取数、分析与交付，不直接猜表结构写 SQL。

## 可用工具与职责
- api_datasource_list：列出可用数据源。不传数据源 id 时默认用内置「言智项目库」（本项目自身数据库，只读）。
- api_ontology_search：**取数第一步**，用用户的自然语言问题检索最相关的已发布本体，返回本体 code、维度/时间维度/度量/过滤器/默认选择列与语义摘要。
- api_ontology_list：按数据源或关键字浏览本体候选（检索无果时用）。
- api_data_query：取数。优先传 ontology（本体 code）+ intent 走语义层编译；没有合适本体时才用 sql 兜底（单条只读 SELECT）。
- api_data_paginate：翻页（offset/limit），单页上限 200 行。
- python_exec：对查询结果做统计/建模/计算；file_write：把结果落成交付文件。

## 标准取数流程
1. 用户问数据 → 先 api_ontology_search 找本体（看 code、默认选择列、过滤器、语义摘要）。
2. api_data_query 传 { ontology: "<code>", intent: {...} }：
   - dimensions：要分组/展示的**维度名**（必须是本体维度或时间维度名）
   - measures：要聚合的**度量名** + 聚合函数（sum / count / count_distinct / avg / min / max）
   - timeDimension：时间维度名 + 粒度（year / quarter / month / week / day / hour / minute）
   - filters：本体**过滤器名**（或带比较符的裸 SQL 条件）
   - orderBy / limit：默认 100 行，单次上限 1000
3. 行数不够就 api_data_paginate 翻页，禁止一次拉全表。
4. 回答用 markdown 表格呈现（列多时只展示关键列），并说明取数口径：用了哪个本体 code、哪些过滤器、时间范围与行数。

## 硬约束
- **只能只读**：禁止 INSERT / UPDATE / DELETE / DDL；兜底 SQL 有只读护栏，写语句会被直接拦截。
- **字段只能引用本体已声明的维度/度量/时间维度/过滤器**，禁止凭空编造列名。工具报「字段不存在」时按报错里的可用字段改名重试，最多 2 次。
- 找不到合适本体时，如实说明并用 api_ontology_list 给出候选本体，不要瞎写 SQL 猜表结构。
- 结果可能截断：关注返回的 truncated 标记，必要时加过滤器缩小范围或翻页。
- 需要深度统计分析时用 python_exec；需要交付表格/图表文件时用 file_write（category=deliverable）。`,
  temperature: 0.2,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isBuiltin: true,
  config: { maxReActSteps: 30 },
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
              `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, is_default, builtin_tool_ids, sub_agent_ids, skill_ids, workflow_json, config_json, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [DEFAULT_AGENT_ID, DEFAULT_AGENT_DATA.name, DEFAULT_AGENT_DATA.description, DEFAULT_AGENT_DATA.systemPrompt,
               DEFAULT_AGENT_DATA.temperature, DEFAULT_AGENT_DATA.maxTokens, DEFAULT_AGENT_DATA.topP,
               DEFAULT_AGENT_DATA.frequencyPenalty, DEFAULT_AGENT_DATA.presencePenalty, 1,
               JSON.stringify(DEFAULT_AGENT_DATA.builtinToolIds),
               // pageAgent（联网/浏览器）+ dataAgent（库内数据只读取数）
               JSON.stringify([PAGE_AGENT_ID, DATA_AGENT_ID]),
               JSON.stringify(DEFAULT_AGENT_DATA.skillIds),
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

        // E13: pageAgent v2 迁移 —— 更新内置 systemPrompt（元素编号 index 定位 + 变化反馈工作流）。
        // pageAgent 为内置智能体（不可编辑/删除），systemPrompt 属产品内置行为，版本升级时覆盖。
        const paRow = rows.find((r: any) => r.id === PAGE_AGENT_ID);
        if (paRow && (paRow.version === null || paRow.version === undefined || Number(paRow.version) < 2)) {
          await adapter.db.exec(
            'UPDATE agent SET system_prompt = ?, config_json = ?, version = ? WHERE id = ?',
            [PAGE_AGENT_DATA.systemPrompt, JSON.stringify(PAGE_AGENT_DATA.config), 2, PAGE_AGENT_ID],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // pageAgent v3 迁移 —— 工具收口四件套：操作与预览单一执行面（BrowserView 桥接），
        // 覆盖 systemPrompt + builtin_tool_ids（剔除 Playwright 专属高级工具与 browser_login_saved）。
        const paRowV3 = rows.find((r: any) => r.id === PAGE_AGENT_ID);
        if (paRowV3 && (paRowV3.version === null || paRowV3.version === undefined || Number(paRowV3.version) < 3)) {
          await adapter.db.exec(
            'UPDATE agent SET system_prompt = ?, builtin_tool_ids = ?, version = ? WHERE id = ?',
            [PAGE_AGENT_DATA.systemPrompt, JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS), 3, PAGE_AGENT_ID],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // pageAgent v4 迁移 —— 回补 browser_scroll：四件套收口时误删滚动工具，
        // 导致 agent 在预览面板无法滚动（只能点击/输入，长页面内容看不全）。
        // 内置智能体行为属产品定义，版本升级直接覆盖（与 v2/v3 同模式）。
        const paRowV4 = rows.find((r: any) => r.id === PAGE_AGENT_ID);
        if (paRowV4 && (paRowV4.version === null || paRowV4.version === undefined || Number(paRowV4.version) < 4)) {
          await adapter.db.exec(
            'UPDATE agent SET system_prompt = ?, builtin_tool_ids = ?, version = ? WHERE id = ?',
            [PAGE_AGENT_DATA.systemPrompt, JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS), 4, PAGE_AGENT_ID],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // pageAgent v5 迁移 —— 剥离【硬约束 — 即梦签到类任务】：pageAgent 是通用浏览器
        // 操作智能体，不携带具体站点业务规则；即梦约束已随「即梦每日签到」Skill 注入。
        // 内置智能体行为属产品定义，版本升级直接覆盖（与 v2/v3/v4 同模式）。
        const paRowV5 = rows.find((r: any) => r.id === PAGE_AGENT_ID);
        if (paRowV5 && (paRowV5.version === null || paRowV5.version === undefined || Number(paRowV5.version) < 5)) {
          await adapter.db.exec(
            'UPDATE agent SET system_prompt = ?, builtin_tool_ids = ?, version = ? WHERE id = ?',
            [PAGE_AGENT_DATA.systemPrompt, JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS), 5, PAGE_AGENT_ID],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // pageAgent v6 迁移 —— 最大循环步数 25 → 50：浏览器任务 25 步仍偏紧，
        // 子智能体常因步数耗尽提前返回。内置智能体行为属产品定义，版本升级直接覆盖 config。
        const paRowV6 = rows.find((r: any) => r.id === PAGE_AGENT_ID);
        if (paRowV6 && (paRowV6.version === null || paRowV6.version === undefined || Number(paRowV6.version) < 6)) {
          await adapter.db.exec(
            'UPDATE agent SET config_json = ?, version = ? WHERE id = ?',
            [JSON.stringify(PAGE_AGENT_DATA.config), 6, PAGE_AGENT_ID],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // P4.1: seed dataAgent（内置数据查询分析智能体）—— 若不存在则插入，存在则不动（用户可自行调整挂载）
        const hasDataAgent = rows.some((r: any) => r.id === DATA_AGENT_ID);
        if (!hasDataAgent) {
          const ts = now();
          try {
            await adapter.db.exec(
              `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, type, is_builtin, builtin_tool_ids, skill_ids, workflow_json, config_json, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [DATA_AGENT_ID, DATA_AGENT_DATA.name, DATA_AGENT_DATA.description, DATA_AGENT_DATA.systemPrompt,
               DATA_AGENT_DATA.temperature, DATA_AGENT_DATA.maxTokens, DATA_AGENT_DATA.topP,
               DATA_AGENT_DATA.frequencyPenalty, DATA_AGENT_DATA.presencePenalty, 'harness', 1,
               JSON.stringify(DATA_AGENT_BUILTIN_TOOLS), JSON.stringify(DATA_AGENT_SKILL_IDS),
               JSON.stringify(EMPTY_WORKFLOW), JSON.stringify(DATA_AGENT_DATA.config), 1, ts, ts],
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

        // v6 迁移 —— 为历史默认 agent 补挂 list_sub_agents（子智能体列表查询工具，E7b）。
        // 只追加缺失的 list_sub_agents，不覆盖用户后续手动调整过的其他工具挂载。
        const defRowV6 = rows.find((r: any) => r.is_default === 1);
        if (defRowV6 && (defRowV6.version === null || defRowV6.version === undefined || Number(defRowV6.version) < 6)) {
          let builtinIds: string[] = [];
          try {
            builtinIds = defRowV6.builtin_tool_ids ? JSON.parse(defRowV6.builtin_tool_ids) : [];
          } catch {
            builtinIds = [];
          }
          if (!Array.isArray(builtinIds)) builtinIds = [];
          if (!builtinIds.includes('list_sub_agents')) {
            builtinIds = [...builtinIds, 'list_sub_agents'];
            await adapter.db.exec(
              'UPDATE agent SET builtin_tool_ids = ?, version = ? WHERE id = ?',
              [JSON.stringify(builtinIds), 6, defRowV6.id],
            );
            rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
          } else if (Number(defRowV6.version) < 6) {
            await adapter.db.exec('UPDATE agent SET version = ? WHERE id = ?', [6, defRowV6.id]);
          }
        }

        // v7 迁移 —— 为默认 agent 补挂 pageAgent 子智能体 + call_agent 工具。
        // 修复：seed 直接写入 version=DEFAULT_AGENT_VERSION，导致 v3 补挂逻辑（门槛 version<3）被跳过，
        // 默认 agent 的 sub_agent_ids 一直为空，list_sub_agents 工具查询返回空。
        // 门槛：version < 7 且 sub_agent_ids 为空（从未显式挂载过子智能体），不覆盖用户手动清空（'[]'）。
        const defRowV7 = rows.find((r: any) => r.is_default === 1);
        if (defRowV7 && (defRowV7.version === null || defRowV7.version === undefined || Number(defRowV7.version) < 7)) {
          if (!defRowV7.sub_agent_ids) {
            let builtinIds: string[] = [];
            try { builtinIds = defRowV7.builtin_tool_ids ? JSON.parse(defRowV7.builtin_tool_ids) : []; } catch { builtinIds = []; }
            if (!Array.isArray(builtinIds)) builtinIds = [];
            if (!builtinIds.includes('call_agent')) builtinIds = [...builtinIds, 'call_agent'];
            await adapter.db.exec(
              'UPDATE agent SET builtin_tool_ids = ?, sub_agent_ids = ?, version = ? WHERE id = ?',
              [JSON.stringify(builtinIds), JSON.stringify([PAGE_AGENT_ID]), 7, defRowV7.id],
            );
            rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
          } else {
            await adapter.db.exec('UPDATE agent SET version = ? WHERE id = ?', [7, defRowV7.id]);
          }
        }

        // v8 迁移 —— 默认 agent 追加「子智能体与浏览器工具」使用约束。
        // 修复：子智能体返回结果后主 agent 用原任务重复派发（白跑一遍且结果相同）。
        // 只追加缺失的约束块（按标记字符串检测），不覆盖用户对提示词的其他编辑。
        const DEF_PROMPT_RULES_MARKER = '【子智能体与浏览器工具约束】';
        const defRowV8 = rows.find((r: any) => r.is_default === 1);
        if (defRowV8 && (defRowV8.version === null || defRowV8.version === undefined || Number(defRowV8.version) < 8)) {
          if (!(defRowV8.system_prompt || '').includes(DEF_PROMPT_RULES_MARKER)) {
            await adapter.db.exec(
              'UPDATE agent SET system_prompt = ?, version = ? WHERE id = ?',
              [(defRowV8.system_prompt || '') + `

【子智能体与浏览器工具约束】
- call_agent 返回结果后，基于该结果直接总结/回答用户，禁止用相同或原始任务重复派发子智能体（重复派发 = 白跑一遍且结果相同）。只有任务目标发生变化时才再次委派。
- 浏览器操作优先委托子智能体（pageAgent）完成；如需自己调用 browser_* 工具，先 browser_get_page_content 获取编号元素列表再用 index 定位。`, 8, defRowV8.id],
            );
          } else {
            await adapter.db.exec('UPDATE agent SET version = ? WHERE id = ?', [8, defRowV8.id]);
          }
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // v9 迁移 —— 联网查询改由 pageAgent 承担：
        // 1) 默认 agent 移除 web_search 工具挂载（搜索摘要质量差，联网检索统一走 pageAgent 真实浏览器）；
        // 2) 追加【联网查询 · 委派 pageAgent】指引块（按标记增量追加，不覆盖用户对提示词的其他编辑）。
        const WEB_QUERY_MARKER = '【联网查询 · 委派 pageAgent】';
        const defRowV9 = rows.find((r: any) => r.is_default === 1);
        if (defRowV9 && (defRowV9.version === null || defRowV9.version === undefined || Number(defRowV9.version) < 9)) {
          let builtinIds: string[] = [];
          try {
            builtinIds = defRowV9.builtin_tool_ids ? JSON.parse(defRowV9.builtin_tool_ids) : [];
          } catch {
            builtinIds = [];
          }
          if (!Array.isArray(builtinIds)) builtinIds = [];
          const nextIds = builtinIds.filter((n) => n !== 'web_search');
          let promptChanged = false;
          let nextPrompt = defRowV9.system_prompt || '';
          if (!nextPrompt.includes(WEB_QUERY_MARKER)) {
            nextPrompt = (nextPrompt || DEFAULT_AGENT_DATA.systemPrompt) + '\n\n' + WEB_QUERY_PROMPT_BLOCK;
            promptChanged = true;
          }
          await adapter.db.exec(
            'UPDATE agent SET builtin_tool_ids = ?, version = ? WHERE id = ?',
            [JSON.stringify(nextIds), 9, defRowV9.id],
          );
          if (promptChanged) {
            await adapter.db.exec(
              'UPDATE agent SET system_prompt = ? WHERE id = ?',
              [nextPrompt, defRowV9.id],
            );
          }
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // v10 迁移 —— 默认助理工具/技能内置升级：
        // 1) 卸载 web_fetch（pageAgent 的 browser_get_page_content 已覆盖抓正文，对默认助理冗余）；
        // 2) 补挂 python_exec（文档处理类 skill 靠 Python 脚本执行）；
        // 3) 内置文档处理类 skill（Word/Excel/PDF/图片/格式转换）。只追加缺失项，不覆盖用户手动调整。
        const DOC_SKILL_IDS = DEFAULT_AGENT_SKILL_IDS;
        const defRowV10 = rows.find((r: any) => r.is_default === 1);
        if (defRowV10 && (defRowV10.version === null || defRowV10.version === undefined || Number(defRowV10.version) < 10)) {
          let builtinIds: string[] = [];
          try {
            builtinIds = defRowV10.builtin_tool_ids ? JSON.parse(defRowV10.builtin_tool_ids) : [];
          } catch {
            builtinIds = [];
          }
          if (!Array.isArray(builtinIds)) builtinIds = [];
          const nextIds = builtinIds
            .filter((n) => n !== 'web_search' && n !== 'web_fetch');
          if (!nextIds.includes('python_exec')) nextIds.push('python_exec');
          let skillIds: string[] = [];
          try {
            skillIds = defRowV10.skill_ids ? JSON.parse(defRowV10.skill_ids) : [];
          } catch {
            skillIds = [];
          }
          if (!Array.isArray(skillIds)) skillIds = [];
          for (const sid of DOC_SKILL_IDS) {
            if (!skillIds.includes(sid)) skillIds.push(sid);
          }
          await adapter.db.exec(
            'UPDATE agent SET builtin_tool_ids = ?, skill_ids = ?, version = ? WHERE id = ?',
            [JSON.stringify(nextIds), JSON.stringify(skillIds), 10, defRowV10.id],
          );
          rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
        }

        // 同步 server seed 的公共内置智能体（内置工作流智能体等）到本地库。
        // 根因：server 启动时 seedBuiltinWorkflowAgents 写的是 server 的 data.db，
        // 而 UI 智能体列表读的是本地库（桌面 yan-zhi.db / web Dexie）——双库分裂导致
        // server 侧 seed 的工作流智能体 UI 永远看不到。此处拉取 /api/agents 公共行：
        // 本地缺失则插入；本地存在且 server 版本更高则按 seed 语义覆盖定义（与 server 的
        // WF_DEF_VERSION 版本覆盖机制对齐，server 侧只升版本时本地跟随更新）。
        try {
          const remote = await api.get<any>('/agents');
          const remoteRows: any[] = Array.isArray(remote) ? remote : ((remote as any)?.data || []);
          const publicWf = remoteRows.filter((r: any) => r.is_public === 1 && r.type === 'workflow');
          for (const r of publicWf) {
            const local = rows.find((x: any) => x.id === r.id);
            const ts = now();
            try {
              if (!local) {
                await adapter.db.exec(
                  `INSERT INTO agent (id, name, description, type, is_public, is_builtin, version, workflow_json, inputs_schema_json, config_json, created_at, updated_at)
                   VALUES (?, ?, ?, 'workflow', 1, 0, ?, ?, ?, ?, ?, ?)`,
                  [r.id, r.name, r.description || '', r.version ?? 1, r.workflow_json || '{"nodes":[],"edges":[]}', r.inputs_schema_json || null, r.config_json || null, r.created_at || ts, ts],
                );
                console.log('[agent] 已同步 server 内置工作流智能体:', r.name);
              } else if ((r.version ?? 1) > (local.version ?? 1)) {
                await adapter.db.exec(
                  'UPDATE agent SET name = ?, description = ?, version = ?, workflow_json = ?, updated_at = ? WHERE id = ?',
                  [r.name, r.description || '', r.version ?? 1, r.workflow_json || '{"nodes":[],"edges":[]}', ts, r.id],
                );
                console.log('[agent] server 内置工作流定义升级，已同步:', r.name);
              }
            } catch { /* 主键冲突等单条失败忽略 */ }
          }
          if (publicWf.length > 0) {
            rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, is_builtin DESC, created_at ASC');
          }
        } catch { /* server 不可达（离线/后端未起）时跳过，不影响本地列表 */ }

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
