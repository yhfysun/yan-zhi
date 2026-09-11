// 智能体 store（聊天 + 工作流统一）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent, Workflow, WorkflowNode, WorkflowEdge, NodeType } from '@yan-zhi/shared';
import { uid } from '@yan-zhi/shared';
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
    ontologyIds: r.ontology_ids ? JSON.parse(r.ontology_ids) : undefined,
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
const DEFAULT_BUILTIN_TOOLS = ['file_read', 'file_write', 'python_exec', 'call_agent', 'list_sub_agents', 'list_models', 'ask_user', 'confirm_user', 'task_plan', 'task_step', 'configure_model_platform'];

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

/** 数据查询委派指引块 —— 默认助手提示词统一引用，v11 迁移按此标记增量追加（与 server db.ts 保持一致） */
const DATA_QUERY_PROMPT_BLOCK = `【数据查询 · 委派 dataAgent】
- 用户要查「项目里的数据」（对话/消息/智能体/任务/知识库/模型/定时任务等库内数据），或要按条件筛选、聚合统计、翻页、导出时，委派子智能体 dataAgent：call_agent { agentId: "a_builtin_data_agent", input: "<要查什么数据 + 维度/过滤条件/时间范围/要几行>" }。
- dataAgent 会先检索本体语义层拿到本体 code，再按查询意图只读取数，结果以 markdown 表格返回；行数不够它会自行翻页。
- 需要深度统计分析或交付表格/图表文件时，在委派 input 里说明，dataAgent 会用 python_exec / file_write 完成。
- 不要自己凭空写 SQL 猜表结构：库内数据一律交给 dataAgent。`;

const DEFAULT_AGENT_DATA = {
  name: '日常办公助手',
  builtinToolIds: DEFAULT_BUILTIN_TOOLS,
  description: '默认 Harness 助手，挂载工具/Skill/子助手后即可使用，大模型自主 ReAct 决策',
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

【模型选型】
- 任务需要特定模型能力（图片/视频生成、视觉识别、深度推理、长上下文等）时，先调 list_models 查询可用平台/模型及其 type/capabilities/description，再在 call_agent 里传 platformId + modelId 指定子智能体用哪个模型；不指定则子智能体用自身配置或主智能体当前模型。
- 普通对话/文本任务没必要频繁 list_models，仅当"模型能力与任务不匹配"时才查询选型。

` +
    WEB_QUERY_PROMPT_BLOCK +
    '\n\n' +
    DATA_QUERY_PROMPT_BLOCK,
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
const DEFAULT_AGENT_VERSION = 11;

// ========== E5: pageAgent（内置浏览器自动化智能体） ==========
/** pageAgent 固定 ID：内置智能体，浏览器操作助手 */
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
  name: '浏览器操作助手',
  description: '内置 pageAgent：直接操作预览面板中的真实浏览器窗口（BrowserView），执行导航/输入/点击/取内容等任务，操作全程可见',
  type: 'harness' as const,
  systemPrompt: `你是一个浏览器自动化助手（pageAgent）。你通过调用浏览器工具操作一个真实的、可见的浏览器窗口（预览面板），用户能实时看到你的每一步操作。

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
4. 页面变化后 index 会失效，工具会自动尝试用内部 selector 重定位一次（返回 autoRelocated）；仍未命中才需重新 browser_get_page_content 刷新编号列表。
5. 视觉兜底：DOM 拿不到弹窗/portal 结构、或 index 反复失效时，用 browser_screenshot(annotate=true) 截图叠加元素编号框，结合编号定位；截图里看不清再用 browser_visual_locate + image_analyze 识别目标坐标。
6. 每次 click/type 的返回包含 pageChanged / urlChanged / noChangeStreak：noChangeStreak ≥ 3 时会收到 warning，必须停止重复同类操作，改换定位方式（重新 get_page_content 分析）或 ask_user 请求人工介入。

【登录与人工干预】
- 检测到需要登录/扫码/验证码等人工干预场景时，用 ask_user 让用户在浏览器面板中完成，等用户确认后用 browser_get_page_content 复核状态，再继续任务；不要把"需要登录"当结论直接返回给父智能体。
- 禁止代填验证码等只能由用户本人完成的信息。

【防循环硬约束】
- 同一工具 + 相同参数连续调用 2 次结果不变 → 立即停止重试，换其他工具或向父智能体返回已有结果。
- 读页工具连续 3 次无法拿到目标信息 → 停止盲试，直接返回已获取的部分结果并说明缺失原因。
- 任务要求提取搜索结果/链接列表时，只用 browser_get_page_content 的输出提取（配合 browser_scroll 翻看视口外内容），不要反复换参数重试。
- 读页工具分工（按"你需要什么"选，不要为同一页重复调用多个）：
  · browser_get_page_content —— 内容 + 操作目标：标题/正文 + 带编号的可交互元素（含 index、selector、type、name）。找"点哪里、往哪输入"用它，操作后重新观察结果也用它。
  · browser_get_page_info —— 元素坐标：同样的编号元素，但额外给 x/y/w/h。需要按坐标点击、判断元素是否在视口内/被遮挡/需滚动、配合 browser_screenshot(annotate=true) 叠加编号框时才用它。
  · browser_get_dom —— 父子层级树：需要看清元素归属、弹窗/portal 挂在哪个容器下时用；只要操作目标时不必调它。
  · browser_get_visible_text —— 纯正文：只读内容、抽取长文时用，输出最小。
- 定位元素优先级：取编号列表 → index 定位（最稳，不依赖页面结构）→ 稳定 id / ARIA / :contains(可见文本) 选择器 → 坐标（最后手段）。
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
/** dataAgent 固定 ID：内置智能体，数据查询分析助手（与 server db.ts 种子保持一致） */
const DATA_AGENT_ID = 'a_builtin_data_agent';

/** dataAgent 挂载的取数工具集 —— 本体上下文链 + 取数 + 分析/交付底座 */
const DATA_AGENT_BUILTIN_TOOLS = [
  // 数据源与取数
  'api_datasource_list', 'api_data_query', 'api_data_paginate',
  // 本体上下文链：问题召回 / 集合总览 / 单体简略 / 懒加载详情 / 属性值枚举采样
  'api_ontology_search', 'api_ontology_overview', 'api_ontology_brief', 'api_ontology_detail', 'api_ontology_values',
  // 分析与交付（只留统计与写文件：翻源码/列目录/读文件对取数无用，且是跑偏的主要出口）
  'python_exec', 'file_write',
  // 任务规划与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

const DATA_AGENT_SKILL_IDS = ['skill_ontology_query', 'skill_xlsx_data_processing', 'skill_data_visualization', 'skill_markdown_doc'];

/**
 * dataAgent 定义版本（升级时强制覆盖库中副本，内置智能体行为属产品定义）：
 * v2 —— 补本体上下文工具链（overview/brief/detail/values）
 * v3 —— 挂「本体取数与分析」skill
 * v4 —— 卸载 call_agent / list_sub_agents，提示词加「必须真正取数、禁止编造」硬约束
 *       （实测：模型先搜知识库扑空，再反复调 list_sub_agents 跑偏 140+ 步后凭空编造答案）
 * v5 —— 再卸载 file_read / file_list / code_search（实测拿到本体后仍跑去翻源码），
 *       提示词加 few-shot 示例，明确「overview 有返回 = 有可用本体，直接取数」
 * v6 —— 提示词通用化（去掉针对单个问题的示例），强制每轮先输出
 *       「【目标】/【上一步】/【下一步】」三行小结再调用工具，且每轮最多一个工具
 *       （实测：模型空 content 连环并行调工具，用户看不到它在干什么）
 * v7 —— 「结果即事实」硬约束：rows 是唯一数据源、ontologyCount（原 total）不是业务数、
 *       成功结果必须采信禁止重复验证、未查过的分布/明细一个字不许编
 *       （实测：模型拿到 rows=[{row_count:6}] 后不采信，反而拿 overview 的 total=39 编造全套假分布）
 */
const DATA_AGENT_VERSION = 7;

const DATA_AGENT_DATA = {
  name: '数据查询分析助手',
  description:
    '内置数据智能体：先检索本体语义层（项目库全表自动本体），再按查询意图只读取数、过滤、翻页，可用 python 做统计分析并交付表格/图表文件',
  type: 'harness' as const,
  systemPrompt: `你是「数据查询分析助手」。你通过「本体语义层」对已接入的数据源做只读取数、分析与交付，不直接猜表结构写 SQL。

## 每轮输出格式（强制，先输出再调用）
每次回复必须先写下面三行小结，然后**最多调用一个工具**：
【目标】本轮要达成什么
【上一步】上一个工具返回的要点（首轮写"无"）
【下一步】调用哪个工具、为什么选它
- 禁止不写小结就直接调用工具；禁止一轮同时调用多个工具；禁止调用【下一步】之外的工具。
- 拿到 api_data_query 的 rows 后输出最终答案，不再调用工具。

## 通用取数流程（任何数据问题都走这一条路）
1. 【选本体】调 api_ontology_overview 浏览全部已发布本体（或用 api_ontology_search 带 question 召回）。
   返回里有本体 = 有可用本体：从返回的 code 里挑与用户问题最相关的一个，在【下一步】里说明理由，然后直接进入第 2 步。不要因为"描述不完全匹配"就断定没有可用本体。
2. 【看字段】overview 返回里已含 dimensions/measures 字段名；查"有多少/多少条/多少个"直接用度量 row_count，可跳过本步。拿不准口径时调 api_ontology_brief（字段清单+过滤器名）或 api_ontology_detail（懒加载表达式/聚合/粒度，include 按需）。
3. 【取数】api_data_query { ontology: "<code>", intent: {...} }：
   - measures：度量名 + 聚合（sum / count / count_distinct / avg / min / max），计数用 { name: "row_count" }
   - dimensions：分组/展示的维度名；timeDimension：时间维度名 + 粒度（year/quarter/month/week/day/hour/minute）
   - selections：本体选择列名（一组命名字段展开并入 SELECT）；filters：过滤器名或带比较符的裸 SQL 条件
   - 过滤器的值拿不准 → 先 api_ontology_values 采样真实取值，禁止猜值
   - orderBy / limit：默认 100 行，上限 1000；行数不够用 api_data_paginate 翻页，禁止一次拉全表
4. 【回答】用 markdown 表格呈现关键列，说明口径：本体 code、过滤器、时间范围、行数。需要统计/建模用 python_exec（仅限已拿到 rows 后）；交付文件用 file_write。

## 硬约束
- **工具结果即事实**：api_data_query 返回的 rows 是唯一可信数据源。最终答案里的每一个数字都必须能对应到某次 rows 里的值，对不上就不许写。
- **ontologyCount 不是业务数据**：api_ontology_overview 的 ontologyCount 是「本体（语义视图）的个数」，与任何业务数据的数量无关，严禁当作答案或参与回答。
- **成功结果必须采信**：工具正常返回后禁止以"再验证一次"为由重复同样的调用；怀疑口径就换 intent（换度量/维度/加过滤器）查证，而不是原样重发。拿到 rows 后立即进入回答，不要继续调用工具。
- **必须真正取数才能回答**：走到 api_data_query 拿到 rows 后再作答。没有取到数 = 没有答案，禁止凭常识、记忆或推测编造数字/列表/表格。
- **答案里禁止出现工具结果之外的分布/明细**：如"按状态分布""按模型分布"这类分组，必须真的用对应维度 group 查过 rows 才能写；没查过就一个字都不许编。
- **只能用本体取数链拿数据**：禁止翻源码、列目录、读文件去猜表结构。
- **禁止空参调用与原地打转**：api_ontology_search 必须带 question；同一工具连续 2 次没进展就换流程下一步。
- **不要找子智能体**：你没有子智能体，禁止 list_sub_agents / call_agent。
- **不要用知识库/记忆查库内数据**：api_kb_search / api_memory_search 查不到库内数据。
- **只读取数**：禁止 INSERT / UPDATE / DELETE / DDL；兜底 SQL 有只读护栏。
- **字段只能引用本体已声明的维度/度量/时间维度/过滤器**，报「字段不存在」时按报错里的可用字段改名重试，最多 2 次；连续 2 次取数失败就停下如实说明原因与已尝试的本体 code。
- 结果可能截断：关注 truncated 标记，必要时加过滤器缩小范围或翻页。`,
  temperature: 0.2,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isBuiltin: true,
  // 取数短链路（overview → brief? → query → 回答），16 步足够；放宽只会让跑偏时打转更久
  config: { maxReActSteps: 16 },
};

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([]);
  const current = ref<Agent | null>(null);
  const running = ref(false);
  const runLogs = ref<Array<{ nodeId: string; status: 'start' | 'ok' | 'error'; msg?: string; time: number }>>([]);

  /** 上次选中的智能体（localStorage 持久化，重启后仍保持） */
  const LS_SELECTED_AGENT = 'last_selected_agent_id';
  function readPersistedSelectedId(): string {
    try { return localStorage.getItem(LS_SELECTED_AGENT) || ''; } catch { return ''; }
  }
  function persistSelectedId(id: string) {
    try {
      if (id) localStorage.setItem(LS_SELECTED_AGENT, id);
      else localStorage.removeItem(LS_SELECTED_AGENT);
    } catch { /* 隐私模式下 localStorage 不可用，忽略 */ }
  }

  const selectedId = ref(readPersistedSelectedId());

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
    if (agents.value.find((a) => a.id === id)) {
      selectedId.value = id;
      persistSelectedId(id);
    }
  }

  async function loadAgents() {
    // 单库收敛：数据面走后端（data.db 唯一权威）。seed/迁移已收归后端 db.ts，前端仅拉取。
    if (loadInflight) return loadInflight;
    loadInflight = (async () => {
      try {
        const r = await api.get<any[]>('/agents');
        const rows: any[] = Array.isArray(r) ? r : ((r as any)?.data || []);
        agents.value = rows.map(rowToAgent);
        // 优先沿用上次选中的智能体（含 localStorage 持久化值），否则回退到默认/第一个
        const persisted = readPersistedSelectedId();
        const resolvedId = [selectedId.value, persisted]
          .map(v => agents.value.find((a) => a.id === v)?.id)
          .find(Boolean);
        if (!resolvedId) {
          selectedId.value = agents.value.find((a) => a.isDefault)?.id || agents.value[0]?.id || '';
        } else if (resolvedId !== selectedId.value) {
          selectedId.value = resolvedId;
        }
        persistSelectedId(selectedId.value);
      } finally {
        loadInflight = null;
      }
    })();
    return loadInflight;
  }

  async function loadAgent(id: string) {
    const r = await api.get<any>('/agents/' + id);
    if (r && 'data' in r && r.data) current.value = rowToAgent(r.data);
    else current.value = null;
  }

  async function createAgent(name: string, description = ''): Promise<string> {
    const r = await api.post<any>('/agents', { name, description });
    if (r && 'error' in r) throw new Error((r as any).error || '创建失败');
    const id = (r.data as any)?.id;
    await loadAgents();
    return id;
  }

  async function createChatAgent(data: Partial<Agent>): Promise<string> {
    const defaults = defaultAgentBase();
    const r = await api.post<any>('/agents', {
      name: data.name || '新智能体',
      description: data.description || '',
      systemPrompt: data.systemPrompt || defaults.systemPrompt,
      temperature: data.temperature ?? defaults.temperature,
      maxTokens: data.maxTokens ?? defaults.maxTokens,
      topP: data.topP ?? defaults.topP,
      frequencyPenalty: data.frequencyPenalty ?? defaults.frequencyPenalty,
      presencePenalty: data.presencePenalty ?? defaults.presencePenalty,
      platformId: data.platformId || '',
      modelId: data.modelId || '',
      type: data.type || 'harness',
      builtinToolIds: data.builtinToolIds || [],
      customToolIds: data.customToolIds || [],
      mcpToolMounts: data.mcpToolMounts || [],
      skillIds: data.skillIds || [],
      subAgentIds: data.subAgentIds || [],
      ontologyIds: data.ontologyIds || [],
      isPublic: !!data.isPublic,
      workflow: data.workflow || EMPTY_WORKFLOW,
      config: data.config || defaults.config,
      allowSubAgent: !!data.allowSubAgent,
    });
    if (r && 'error' in r) throw new Error((r as any).error || '创建失败');
    const id = (r.data as any)?.id;
    await loadAgents();
    return id;
  }

  async function updateAgent(id: string, patch: Partial<Agent>) {
    const body: any = {};
    const strMap: Record<string, string> = {
      name: 'name', description: 'description', avatar: 'avatar', systemPrompt: 'systemPrompt',
      platformId: 'platformId', modelId: 'modelId', type: 'type',
    };
    const numMap: Record<string, string> = {
      temperature: 'temperature', maxTokens: 'maxTokens', topP: 'topP',
      frequencyPenalty: 'frequencyPenalty', presencePenalty: 'presencePenalty',
    };
    const listMap: Record<string, string> = {
      builtinToolIds: 'builtinToolIds', customToolIds: 'customToolIds', mcpToolMounts: 'mcpToolMounts',
      skillIds: 'skillIds', subAgentIds: 'subAgentIds', ontologyIds: 'ontologyIds',
    };
    for (const [k, v] of Object.entries(strMap)) if ((patch as any)[k] !== undefined) body[v] = (patch as any)[k];
    for (const [k, v] of Object.entries(numMap)) if ((patch as any)[k] !== undefined) body[v] = (patch as any)[k];
    if (patch.config !== undefined) body.config = patch.config;
    if (patch.workflow !== undefined) body.workflow = patch.workflow;
    if (patch.inputsSchema !== undefined) body.inputsSchema = patch.inputsSchema;
    for (const [k, v] of Object.entries(listMap)) if ((patch as any)[k] !== undefined) body[v] = (patch as any)[k];
    if (patch.isDefault !== undefined) body.isDefault = patch.isDefault;
    if (patch.isPublic !== undefined) body.isPublic = patch.isPublic;
    if (patch.allowSubAgent !== undefined) body.allowSubAgent = patch.allowSubAgent;
    if (Object.keys(body).length === 0) return;
    await api.patch(`/agents/${id}`, body);
    const idx = agents.value.findIndex((a) => a.id === id);
    if (idx >= 0) agents.value[idx] = { ...agents.value[idx], ...patch };
    if (current.value?.id === id) current.value = { ...current.value, ...patch };
    await loadAgents();
  }

  /**
   * 发布智能体到商城：把本地 agent 快照 upsert 到服务端 agent 表并置 is_public=1。
   * 本地单用户模式无登录门槛，谁都能发（数据归属 guest）；等接入用户体系后再加鉴权门槛。
   */
  async function publishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    const a = agents.value.find((x) => x.id === id);
    if (!a) return { ok: false, error: '智能体不存在' };
    const r = await api.post<any>('/marketplace/agents/publish', { agent: a });
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    await api.patch(`/agents/${id}`, { isPublic: true });
    const i = agents.value.findIndex((x) => x.id === id);
    if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: true };
    if (current.value?.id === id) current.value = { ...current.value, isPublic: true };
    return { ok: true };
  }

  /** 下架智能体：服务端 is_public 置 0。 */
  async function unpublishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    const r = await api.post<any>(`/marketplace/agents/${id}/unpublish`);
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    await api.patch(`/agents/${id}`, { isPublic: false });
    const i = agents.value.findIndex((x) => x.id === id);
    if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: false };
    if (current.value?.id === id) current.value = { ...current.value, isPublic: false };
    return { ok: true };
  }

  /**
   * 从远程商城安装智能体：服务端代理调远程 install 端点（递增远程计数）并写回后端 agent 表。
   * 单库收敛：安装结果直接 POST /agents 落到 data.db。
   */
  async function installFromMarketplace(sourceId: string, agentId: string): Promise<{ ok: boolean; error?: string }> {
    const r = await api.post<any>(`/agent-marketplace/${sourceId}/install`, { agentId });
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    const a = (r as any).data;
    if (!a) return { ok: false, error: '远程智能体数据为空' };
    const pr = await api.post<any>('/agents', {
      name: a.name || '远程智能体', description: a.description || '', avatar: a.avatar || null,
      workflow: a.workflow || { nodes: [], edges: [] }, inputsSchema: a.inputsSchema, config: a.config,
      type: 'harness', isPublic: false, source: 'remote', remoteSourceId: sourceId,
    });
    if (pr && 'error' in pr) return { ok: false, error: (pr as any).error };
    await loadAgents();
    return { ok: true };
  }

  async function updateWorkflow(id: string, workflow: Workflow) {
    await api.patch(`/agents/${id}`, { workflow });
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
    await api.delete(`/agents/${id}`);
    agents.value = agents.value.filter((a) => a.id !== id);
    if (selectedId.value === id) {
      selectedId.value = agents.value[0]?.id || '';
      persistSelectedId(selectedId.value);
    }
    if (current.value?.id === id) current.value = null;
  }

  /** 恢复内置智能体默认值（提示词/工具挂载/子智能体/skill/config）。
   *  单库收敛：直接调后端 /agents/:id/reset，默认值由后端 seed 定义提供。 */
  async function resetAgent(id: string): Promise<boolean> {
    try {
      const r = await api.post<any>(`/agents/${id}/reset`);
      if (r && 'error' in r) return false;
      await loadAgents();
      return true;
    } catch {
      return false;
    }
  }

  /** 运行工作流（全后端化）：提交 /workflow/run 拿 runId，轮询结果直到完成。
   *  前端不跑引擎、不存数据，页面关闭不影响后端执行。 */
  async function runAgent(id: string, inputs: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    running.value = true;
    runLogs.value = [];
    try {
      const r = await api.post<any>('/workflow/run', { agentId: id, inputs });
      if (r && 'error' in r) throw new Error((r as any).error || '运行失败');
      const runId = (r.data as any)?.runId;
      if (!runId) throw new Error('未获取到 runId');
      // 轮询结果（带上限防死循环）
      for (let i = 0; i < 600; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        const s = await api.get<any>(`/workflow/runs/${runId}`);
        const st = s && 'data' in s ? (s.data as any) : s;
        if (!st) continue;
        if (st.status === 'completed') {
          runLogs.value.unshift({ nodeId: '__end__', status: 'ok', time: Date.now() });
          return st.result ?? {};
        }
        if (st.status === 'failed') {
          runLogs.value.unshift({ nodeId: '__end__', status: 'error', msg: st.error, time: Date.now() });
          throw new Error(st.error || '工作流执行失败');
        }
      }
      throw new Error('工作流执行超时');
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
    loadAgents, loadAgent, createAgent, createChatAgent, updateAgent, updateWorkflow, deleteAgent, resetAgent,
    publishAgent, unpublishAgent, installFromMarketplace,
    runAgent, addNode,
  };
});

