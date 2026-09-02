// 智能体 store（聊天 + 工作流统一）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent, Workflow, WorkflowNode, NodeType } from '@yan-zhi/shared';
import { getPlatformAdapter } from '@yan-zhi/core';
import { uid, now } from '@yan-zhi/shared';
import { api, API_BASE } from '../api/client';
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
const DEFAULT_BUILTIN_TOOLS = ['file_read', 'file_write', 'web_search', 'call_agent', 'list_sub_agents', 'ask_user', 'confirm_user', 'task_plan', 'task_step', 'configure_model_platform'];

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
const DEFAULT_AGENT_VERSION = 7;

// ========== E5: pageAgent（内置浏览器自动化智能体） ==========
/** pageAgent 固定 ID：内置智能体，浏览器操作专家 */
const PAGE_AGENT_ID = 'a_builtin_page_agent';

/** pageAgent 挂载的浏览器工具集 */
const PAGE_AGENT_BUILTIN_TOOLS = [
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom',
  'browser_wait', 'browser_screenshot',
  'browser_fill_form', 'browser_submit_form', 'browser_search',
  'browser_next_page', 'browser_prev_page', 'browser_wait_for', 'browser_get_visible_text',
  'browser_select_option', 'browser_check', 'browser_uncheck', 'browser_get_page_info',
  'browser_login_saved',
  // C4 多标签页管理
  'browser_new_tab', 'browser_switch_tab', 'browser_close_tab', 'browser_get_tabs',
  // C5 网络请求监听
  'browser_wait_for_request', 'browser_get_network_log',
  // C6 结构化数据提取
  'browser_extract_list',
  // C9 视觉定位闭环
  'browser_visual_locate',
  // C11 文件上传/下载
  'browser_upload', 'browser_download',
  // C12 滚动到元素 / 可见性检测
  'browser_scroll_into_view', 'browser_is_visible',
  // C13 拖拽
  'browser_drag',
  // C14 Accessibility Tree
  'browser_get_a11y_tree',
  'ask_user',
];

const PAGE_AGENT_DATA = {
  name: '浏览器操作专家',
  description: '内置 pageAgent：通过 Playwright 驱动真实浏览器，执行导航/点击/输入/截图等自动化任务',
  type: 'harness' as const,
  systemPrompt: `你是一个浏览器自动化专家（pageAgent）。你通过调用浏览器工具来操作一个真实的、可见的浏览器窗口。

能力：
- browser_navigate: 导航到指定 URL
- browser_click: 点击元素（优先用元素编号 index，其次 CSS 选择器或坐标）
- browser_type: 在输入框输入文本（优先用元素编号 index 定位输入框）
- browser_press_key: 按键（Enter/Tab/Escape 等）
- browser_scroll: 滚动页面
- browser_hover: 悬停元素
- browser_get_text: 获取元素文本
- browser_get_dom: 获取页面 DOM 摘要
- browser_wait: 等待指定时间
- browser_screenshot: 截图
- browser_fill_form: 批量填写表单（支持 text/select/checkbox/radio）
- browser_submit_form: 提交表单（点提交按钮或回车，等待导航）
- browser_search: 在页面搜索框输入并提交（自动识别搜索框）
- browser_next_page / browser_prev_page: 翻页（自动识别"下一页/上一页"）
- browser_wait_for: 智能等待（等元素/URL/文本出现）
- browser_get_visible_text: 获取干净可见文本（过滤隐藏元素）
- browser_select_option: 下拉选择
- browser_check / browser_uncheck: 勾选/取消勾选
- browser_get_page_info: 返回当前 url/title/可交互元素摘要（理解页面状态）
- browser_login_saved: 用已保存的密码自动登录站点（需先用浏览器密码管理保存）
- ask_user: 向用户提问/请求确认（用于扫码登录等需要人工干预的场景）

工作流程：
1. 分析委派给你的任务（如"打开某网站搜索某关键词"、"每日签到领取积分"、"输入文案制作视频"）
2. 若目标站点需要登录，优先用 browser_login_saved（传 host 或 url）自动登录已保存密码的站点
   - 若 browser_login_saved 报未找到凭证，提示用户先在浏览器密码管理中保存该站点密码
3. 若站点是扫码登录/验证码登录（如即梦、抖音、微信等），无法用 browser_login_saved 自动登录：
   - browser_navigate 打开登录页（用户在浏览器面板可见）
   - 用 ask_user 弹窗提示用户："请在浏览器面板中扫码登录/输入验证码，登录完成后点击确认"
   - 用户在可见的浏览器面板上完成扫码/验证码登录后点击确认
   - 用 browser_get_page_info 检查登录状态（有用户头像/昵称=已登录）
4. browser_navigate 导航到目标页面
5. 用 browser_get_page_info / browser_get_visible_text 了解页面结构与状态，找到目标元素
6. 用 browser_fill_form / browser_click / browser_search / browser_select_option / browser_check 执行操作
7. 用 browser_submit_form 提交表单，browser_next_page / browser_prev_page 翻页
8. 必要时 browser_wait_for 等待页面加载或元素出现
9. 用 browser_get_visible_text / browser_get_page_info 获取最终结果
10. 返回任务结果摘要

注意：
- 优先用高级工具（fill_form/search/next_page/get_page_info），它们比逐个 click+type 更可靠
- 使用 CSS 选择器定位元素（如 input.search-box、button#submit）
- 如果选择器找不到元素，用 get_page_info 查看可交互元素后调整
- 每步操作后观察结果，确认是否成功
- 用中文返回结果摘要

【核心工作方式 — 元素编号定位（最重要）】
1. 每到一个新页面或弹窗出现后，先调用 browser_get_page_info（或 browser_get_dom）获取带编号（index）的可交互元素列表，已穿透 iframe/Shadow DOM（含登录弹窗内的元素）。
2. 用列表中的 index 直接调用 browser_click / browser_type（传 index 参数）操作目标元素。不要自己猜动态 hash class 选择器（如 input-xrB84C），不要凭截图猜坐标。
3. 若 selector 匹配到多个元素，工具会返回 ambiguous 和候选列表（带编号），从中选一个 index 重试。
4. 页面变化后 index 会失效，此时重新调用 browser_get_page_info 刷新编号列表。
5. 每次 click/type 的返回包含 pageChanged / urlChanged / noChangeStreak：noChangeStreak ≥ 3 时会收到 warning，必须停止重复同类操作，改换定位方式（重新 get_page_info 分析）或 ask_user 请求人工介入。

【硬约束 — 即梦签到类任务】
- 目标站固定：即梦签到只允许访问 https://jimeng.jianying.com/，禁止访问 dreamina.ai / dreamina.com 等国际版（国际版无中文签到入口）。
- 登录流程：检测到未登录 → 必须 ask_user 提示用户在浏览器面板扫码登录 → 等用户确认 → browser_get_page_info 复核已登录。禁止代填手机号、禁止代填验证码（验证码需用户手机接收，代填必死循环）。
- 登录闭环职责（最重要）：检测到未登录时，pageAgent 必须自己调 ask_user 提示用户在浏览器面板扫码/验证码登录，等用户确认后用 browser_get_page_info 复核已登录，然后继续任务。**严禁返回"需要登录"/"未登录"/"请登录"等结论给父智能体而自己停下**——登录闭环必须在 pageAgent 内完成，父智能体不参与登录决策、不会帮你扫码。ask_user 的 question 中要明确说明"请在浏览器面板中完成登录后点击确认"。即梦签到类任务在 pageAgent 内完成全部登录→签到→领取闭环。
- 已知稳定选择器：即梦"领积分"入口 #SiderMenuCredit；登录弹窗出现后用 browser_get_page_info / browser_get_dom（已穿透 iframe/Shadow DOM）抓弹窗结构，用返回的 index 定位。
- 定位优先级：browser_get_page_info / browser_get_dom 获取编号列表 → index 参数定位（首选）→ 稳定 id / ARIA / :contains(可见文本) 选择器 → 坐标（最后手段）。
- 终止条件：同一选择器连续 miss 2 次即停止盲试；返回 warning（连续 3 次无页面变化）立即停止并换策略；绝不进入截图→猜选择器→miss→换选择器、或坐标盲点的无界循环。`,
  temperature: 0.3,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  isBuiltin: true,
  config: { maxReActSteps: 25 },
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

  async function loadAgents() {
    // inflight 去重：同一 store 实例内并发调用共享同一个 Promise，
    // 避免两个 loadAgents 同时 SELECT 空表后各自 INSERT 造成重复。
    if (loadInflight) return loadInflight;
    loadInflight = (async () => {
      try {
        // 数据面统一后端：有 server 可用时智能体全部读 server（guest 默认身份）。
        // 本地 Dexie/IPC 仅在后端不可用（web 未登录无 guest token）时兜底。
        const useServer = useAuthStore().useServerApi;
        if (useServer) {
          const r = await api.get<any[]>('/agents');
          if ('data' in r) {
            const serverRows = r.data as any[];
            // 数据迁移（一次性）：本地 Dexie/IPC 是历史遗留数据源，后端才是唯一数据源。
            // 首次切到后端时，若 server 端该用户没有任何私有自定义智能体、而本地库存在私有智能体，
            // 则把本地定义导入 server（保留原 id，保证会话/子智能体引用稳定）。幂等：server 已有则跳过。
            const hasPrivateOnServer = serverRows.some((x) => !x.is_public && x.user_id === 'guest');
            if (!hasPrivateOnServer) {
              await migrateLocalAgentsToServer();
            }
            agents.value = serverRows.map(rowToAgent);
            if (!selectedId.value || !agents.value.find((a) => a.id === selectedId.value)) {
              selectedId.value = agents.value.find((a) => a.isDefault)?.id || agents.value[0]?.id || '';
            }
            return;
          }
          // 后端不可达：回退本地库
        }
        const adapter = getPlatformAdapter();
        let rows = await adapter.db.query<any>('SELECT * FROM agent ORDER BY is_default DESC, created_at ASC');
        if (rows.length === 0) {
          const ts = now();
          // 固定 ID 插入：跨会话（如 webview 重载）的并发下，主键冲突会被 catch 忽略，
          // 保证默认智能体全局唯一。兼容 web 端 Dexie（table.add 主键冲突抛错亦被 catch）。
          try {
            await adapter.db.exec(
              `INSERT INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, is_default, builtin_tool_ids, sub_agent_ids, workflow_json, config_json, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [DEFAULT_AGENT_ID, DEFAULT_AGENT_DATA.name, DEFAULT_AGENT_DATA.description, DEFAULT_AGENT_DATA.systemPrompt,
               DEFAULT_AGENT_DATA.temperature, DEFAULT_AGENT_DATA.maxTokens, DEFAULT_AGENT_DATA.topP,
               DEFAULT_AGENT_DATA.frequencyPenalty, DEFAULT_AGENT_DATA.presencePenalty, 1,
               JSON.stringify(DEFAULT_AGENT_DATA.builtinToolIds),
               JSON.stringify([PAGE_AGENT_ID]),
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

  /**
   * 一次性数据迁移：把本地 Dexie/IPC 库中的私有自定义智能体导入 server（保留原 id）。
   * 默认 AI 助手与内置 pageAgent 由 server 侧 seed 提供，不迁移；仅迁移 is_default=0 且 is_builtin=0
   * 的用户自定义智能体，避免与 server 内置智能体冲突。幂等：失败静默，下次 loadAgents 再触发。
   */
  async function migrateLocalAgentsToServer() {
    try {
      const adapter = getPlatformAdapter();
      const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE is_default = 0 AND is_builtin = 0');
      if (!rows || rows.length === 0) return;
      for (const r of rows) {
        const a = rowToAgent(r);
        const body: Record<string, unknown> = {
          id: a.id,
          name: a.name || '迁移智能体',
          description: a.description || '',
          avatar: a.avatar || null,
          systemPrompt: a.systemPrompt || '',
          temperature: a.temperature ?? 0.7,
          maxTokens: a.maxTokens ?? 2048,
          topP: a.topP ?? 1.0,
          frequencyPenalty: a.frequencyPenalty ?? 0,
          presencePenalty: a.presencePenalty ?? 0,
          platformId: a.platformId || null,
          modelId: a.modelId || null,
          type: a.type || 'harness',
          builtinToolIds: a.builtinToolIds || [],
          customToolIds: a.customToolIds || [],
          mcpToolMounts: a.mcpToolMounts || [],
          skillIds: a.skillIds || [],
          subAgentIds: a.subAgentIds || [],
          parentAgentId: a.parentAgentId || null,
          allowSubAgent: !!a.allowSubAgent,
          isDefault: false,
          isPublic: false,
          workflow: a.workflow || EMPTY_WORKFLOW,
          inputsSchema: a.inputsSchema || null,
          config: a.config || null,
          version: a.version ?? 1,
        };
        const rr = await api.post<any>('/agents', body);
        if (rr && 'error' in rr) {
          // 已存在（幂等）或 server 拒绝，忽略该条
          continue;
        }
      }
    } catch {
      // 迁移失败不阻塞主流程，下次 loadAgents 再试
    }
  }

  async function loadAgent(id: string) {    if (useAuthStore().useServerApi) {
      const r = await api.get<any>(`/agents/${id}`);
      if (r && 'data' in r) {
        current.value = rowToAgent((r as any).data);
      } else {
        current.value = null;
      }
      return;
    }
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [id]);
    if (rows.length > 0) current.value = rowToAgent(rows[0]);
    else current.value = null;
  }

  async function createAgent(name: string, description = ''): Promise<string> {
    if (useAuthStore().useServerApi) {
      const r = await api.post<any>('/agents', { name, description, workflow: EMPTY_WORKFLOW, version: 1 });
      const id = (r && 'data' in r) ? (r as any).data?.id : '';
      await loadAgents();
      return id || '';
    }
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
    if (useAuthStore().useServerApi) {
      const defaults = defaultAgentBase();
      const systemPrompt = data.systemPrompt || defaults.systemPrompt;
      const config = data.config && Object.keys(data.config).length > 0
        ? data.config
        : (defaults.config ? { ...defaults.config, ...data.config } : data.config);
      const body: Record<string, unknown> = {
        name: data.name || '新智能体',
        description: data.description || '',
        systemPrompt,
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
        isDefault: false,
        isPublic: !!data.isPublic,
        workflow: data.workflow || EMPTY_WORKFLOW,
        config,
        version: 1,
      };
      const r = await api.post<any>('/agents', body);
      const id = (r && 'data' in r) ? (r as any).data?.id : '';
      await loadAgents();
      return id || '';
    }
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
    if (useAuthStore().useServerApi) {
      const body: Record<string, unknown> = { ...patch };
      // 移除 undefined 字段，server 端按提供的字段动态 SET
      for (const k of Object.keys(body)) {
        if (body[k] === undefined) delete body[k];
      }
      const r = await api.patch<any>(`/agents/${id}`, body);
      if (r && 'data' in r) {
        const updated = rowToAgent((r as any).data);
        const idx = agents.value.findIndex((a) => a.id === id);
        if (idx >= 0) agents.value[idx] = updated;
        else agents.value.push(updated);
        if (current.value?.id === id) current.value = updated;
      }
      await loadAgents();
      return;
    }
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
   * 发布智能体到商城：把 agent 定义置 is_public=1（后端唯一数据源）。
   * 需登录（JWT 鉴权），未登录时静默跳过。server 模式下直接 PATCH /api/agents/:id；
   * 本地兜底模式下保留原跨库同步逻辑。
   */
  async function publishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!useAuthStore().isLoggedIn) return { ok: false, error: '未登录，无法发布' };
    if (useAuthStore().useServerApi) {
      const r = await api.patch<any>(`/agents/${id}`, { isPublic: true });
      if (r && 'error' in r) return { ok: false, error: (r as any).error };
      const i = agents.value.findIndex((x) => x.id === id);
      if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: true };
      if (current.value?.id === id) current.value = { ...current.value, isPublic: true };
      return { ok: true };
    }
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

  /** 下架智能体：is_public 置 0（后端唯一数据源）。 */
  async function unpublishAgent(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!useAuthStore().isLoggedIn) return { ok: false, error: '未登录' };
    if (useAuthStore().useServerApi) {
      const r = await api.patch<any>(`/agents/${id}`, { isPublic: false });
      if (r && 'error' in r) return { ok: false, error: (r as any).error };
      const i = agents.value.findIndex((x) => x.id === id);
      if (i >= 0) agents.value[i] = { ...agents.value[i], isPublic: false };
      if (current.value?.id === id) current.value = { ...current.value, isPublic: false };
      return { ok: true };
    }
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
   * 再写入 server agent 表（后端唯一数据源，保留原 id 由本地生成）。
   */
  async function installFromMarketplace(sourceId: string, agentId: string): Promise<{ ok: boolean; error?: string }> {
    const r = await api.post<any>(`/agent-marketplace/${sourceId}/install`, { agentId });
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    const a = (r as any).data;
    if (!a) return { ok: false, error: '远程智能体数据为空' };
    if (useAuthStore().useServerApi) {
      const id = uid('a_');
      const body: Record<string, unknown> = {
        id,
        name: a.name || '远程智能体',
        description: a.description || '',
        avatar: a.avatar || null,
        workflow: a.workflow || EMPTY_WORKFLOW,
        inputsSchema: a.inputsSchema || null,
        config: a.config || null,
        type: 'harness',
        isDefault: false,
        isPublic: false,
        version: 1,
      };
      const rr = await api.post<any>('/agents', body);
      if (rr && 'error' in rr) return { ok: false, error: (rr as any).error };
      await loadAgents();
      return { ok: true };
    }
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
    if (useAuthStore().useServerApi) {
      const r = await api.patch<any>(`/agents/${id}`, { workflow });
      if (r && 'data' in r) {
        const updated = rowToAgent((r as any).data);
        if (current.value?.id === id) current.value = updated;
        const idx = agents.value.findIndex((a) => a.id === id);
        if (idx >= 0) agents.value[idx] = updated;
      }
      return;
    }
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
    if (useAuthStore().useServerApi) {
      await api.delete(`/agents/${id}`);
      agents.value = agents.value.filter((a) => a.id !== id);
      if (selectedId.value === id) {
        selectedId.value = agents.value[0]?.id || '';
      }
      if (current.value?.id === id) current.value = null;
      return;
    }
    const adapter = getPlatformAdapter();
    await adapter.db.exec('DELETE FROM agent WHERE id = ?', [id]);
    agents.value = agents.value.filter((a) => a.id !== id);
    if (selectedId.value === id) {
      selectedId.value = agents.value[0]?.id || '';
    }
    if (current.value?.id === id) current.value = null;
  }

  /**
   * 运行工作流（后端执行）：智能体定义存前端本地库，把定义 + sub_agent 引用的子智能体
   * 打成 bundle 提交 POST /api/workflow/run 创建运行（server 落库 workflow_run + 异步执行），
   * 再订阅 SSE 拿节点级进度；断线用 since=最后 seq 续传，运行结束取最终结果。
   * 前端关闭不影响执行；MCP 连接复用后端 client-manager。
   */
  async function collectWorkflowBundle(row: any): Promise<{ agent: any; subAgents: Record<string, any> }> {
    const agent = {
      id: row.id,
      name: row.name,
      workflow: row.workflow_json ? JSON.parse(row.workflow_json) : { nodes: [], edges: [] },
    };
    const subAgents: Record<string, any> = {};
    const seen = new Set<string>([agent.id]);
    const queue: Workflow[] = [agent.workflow];
    const useServer = useAuthStore().useServerApi;
    while (queue.length > 0) {
      const wf = queue.shift()!;
      for (const n of wf.nodes || []) {
        if (n.type !== 'sub_agent') continue;
        const sid = (n.config?.subAgentId as string) || '';
        if (!sid || seen.has(sid)) continue;
        seen.add(sid);
        // server 模式：后端唯一数据源，子智能体定义从后端读
        if (useServer) {
          const sr = await api.get<any>(`/agents/${sid}`);
          if (sr && 'data' in sr && sr.data) {
            const s = sr.data as any;
            const swf: Workflow = s.workflow_json ? JSON.parse(s.workflow_json) : { nodes: [], edges: [] };
            subAgents[sid] = { id: s.id, name: s.name, workflow: swf };
            queue.push(swf);
          }
          continue;
        }
        const adapter = getPlatformAdapter();
        const srows = await adapter.db.query<any>('SELECT id, name, workflow_json FROM agent WHERE id = ?', [sid]);
        if (srows.length === 0) continue;
        const swf: Workflow = srows[0].workflow_json ? JSON.parse(srows[0].workflow_json) : { nodes: [], edges: [] };
        subAgents[sid] = { id: srows[0].id, name: srows[0].name, workflow: swf };
        queue.push(swf);
      }
    }
    return { agent, subAgents };
  }

  /** 消费运行事件流：节点 start/ok/error → runLogs；run:completed/failed → 最终状态。
   *  断线自动用 since=最后 seq 重连（最多 10 次），运行结束正常返回。 */
  async function consumeRunEvents(runId: string, signal: AbortSignal): Promise<'completed' | 'failed'> {
    let since = 0;
    let retries = 0;
    for (;;) {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch(`${API_BASE}/workflow/runs/${runId}/stream?since=${since}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok || !res.body) {
        // 内存态被清理/重启 → 回查 DB 状态兜底
        const r = await api.get<any>(`/workflow/runs/${runId}`);
        if ('data' in r && r.data?.status && r.data.status !== 'running') {
          for (const log of r.data.logs || []) runLogs.value.unshift(log);
          if (r.data.status === 'completed') return 'completed';
          throw new Error(r.data.error || '工作流运行失败');
        }
        throw new Error('SSE 连接失败');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let runEnded = false;
      let ended: 'completed' | 'failed' | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          let ev: any;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (typeof ev.seq === 'number') since = ev.seq;
          switch (ev.type) {
            case 'connected': break;
            case 'node:start':
              runLogs.value.unshift({ nodeId: ev.nodeId, status: 'start', time: Date.now() });
              break;
            case 'node:ok':
              runLogs.value.unshift({ nodeId: ev.nodeId, status: 'ok', time: Date.now() });
              break;
            case 'node:error':
              runLogs.value.unshift({ nodeId: ev.nodeId, status: 'error', msg: ev.msg, time: Date.now() });
              break;
            case 'run:completed':
              ended = 'completed';
              runEnded = true;
              break;
            case 'run:failed':
              ended = 'failed';
              runEnded = true;
              runLogs.value.unshift({ nodeId: '__end__', status: 'error', msg: ev.msg, time: Date.now() });
              break;
          }
        }
        if (runEnded) break;
      }
      if (ended === 'completed') return 'completed';
      if (ended === 'failed') throw new Error('工作流运行失败');
      // 流断开但运行未结束（网络闪断）→ since 续传重连
      if (++retries > 10) throw new Error('SSE 多次断开，放弃续传');
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  async function runAgent(id: string, inputs: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    // 后端唯一数据源：server 模式下 agent 定义从后端读
    let agentRow: any;
    if (useAuthStore().useServerApi) {
      const r = await api.get<any>(`/agents/${id}`);
      if (!r || !('data' in r) || !r.data) throw new Error('智能体不存在');
      agentRow = r.data;
    } else {
      const adapter = getPlatformAdapter();
      const rows = await adapter.db.query<any>('SELECT * FROM agent WHERE id = ?', [id]);
      if (rows.length === 0) throw new Error('智能体不存在');
      agentRow = rows[0];
    }
    const { agent, subAgents } = await collectWorkflowBundle(agentRow);
    running.value = true;
    runLogs.value = [];
    const ctrl = new AbortController();
    try {
      const r = await api.post<any>('/workflow/run', { agent, subAgents, inputs });
      if ('error' in r) throw new Error(r.error);
      const runId = r.data?.runId as string;
      if (!runId) throw new Error('创建运行失败：未返回 runId');
      const outcome = await consumeRunEvents(runId, ctrl.signal);
      // 拉最终结果（SSE 完成事件不带全量 result，统一回查一次）
      const rr = await api.get<any>(`/workflow/runs/${runId}`);
      if ('error' in rr) throw new Error(rr.error);
      if (outcome === 'failed') throw new Error(rr.data?.error || '工作流运行失败');
      return rr.data?.result || {};
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        runLogs.value.unshift({ nodeId: '__end__', status: 'error', msg: e?.message, time: Date.now() });
      }
      throw e;
    } finally {
      ctrl.abort();
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
    collectWorkflowBundle, runAgent, addNode,
  };
});
