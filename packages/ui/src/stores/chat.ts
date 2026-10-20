// 聊天 store
import { defineStore } from 'pinia';
import { ref, computed, nextTick, watch } from 'vue';
import type { Conversation, Message, Platform, Model, DeltaToolCall, InlineDataView } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient, ContextWindow, getToolRegistry, resolveToolPath, parseSourceMeta, CONV_SOURCE_BROWSER_PAGE, excludeSourceClause } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { useMcpStore } from './mcp';
import { useAgentStore } from './agent';
import { useCostStore } from './cost';
import { useToolsStore } from './tools';
import { useSettingsStore } from './settings';
import { useFileStore } from './file';
import { chainBrowserOp, dropBrowserOpChain, type BrowserOpChains } from './browser-op-queue';
import { useBrowserStore } from './browser';
import { api } from '../api/client';
import { getWithRetry } from './platform';
// ★ 2026-10-20：聊天主链路事件流已从 SSE 切到 WebSocket（utils/chat-ws 单一长连接）。
//   cicd / page-chat 等其余面板仍走 utils/sse，那条通道不受影响。
import { requestChatWs, sendChatWs, onTaskEvent, onConvEvent, onChatWsClose } from '../utils/chat-ws';
import { useAuthStore } from './auth';
// 会话按模式隔离：loadConversations / createConversation 都要知道"当前在哪个模式"
import { activeMode } from './mode';

// 从工具调用参数中健壮地提取 URL —— 模型常把 URL 放在非 url 字段（target/address/link/href/page 等），
// 或直接把 arguments 写成 JSON 字符串。只认 args.url 会导致「缺少 url 参数」误报。
function extractUrlFromArgs(args: unknown): string {
  if (typeof args === 'string') return args.trim();
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>;
    for (const k of ['url', 'target', 'address', 'link', 'href', 'page', 'site', 'to', 'uri', 'location', 'query', 'q']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const strVals = Object.values(o).filter((v) => typeof v === 'string' && (v as string).trim());
    if (strVals.length === 1) return String(strVals[0]).trim();
  }
  return '';
}

// ── 预览空间 tab 解析（agent 浏览器操作统一入口）──
// agent 的浏览器操作必须打在预览面板**当前正在显示**的 tab 上：若让主进程按 LRU 猜
// （ensureActiveTab），可能猜中面板旧 tab 或别的空间 tab —— 导航进了那个 tab，页面加载了
// 但预览 UI 不跟随（onNavigated 里 tid !== activeTabId 被忽略，永远显示首页），后续
// get_page_content 读的也不是用户看到的页面。
/**
 * agent 自己导航打开的 tab（会话级锚定，2026-10-07）。
 *
 * ★ 为什么需要：此前 agent 的每个动作都取「面板当前活动 tab」，而该值会被**用户手动切换**
 *   或 agent 中途导航别的页面改写 → 后续动作落到错误的页（实测：agent 操作跑到了
 *   用户停留的番茄达人中心，而目标是抖音）。锚定后 agent 全程锁定它自己开的那个 tab。
 * 只在 tab 仍存在时生效；tab 被关则自动失效回退。
 */
const agentAnchoredTabs = new Map<string, string>(); // convId → tabId

/**
 * 浏览器操作**会话级串行锁**（2026-10-09）。
 *
 * ★★★ 为什么 pageAgent 需要特殊处理：浏览器是**单活动页状态机**（前端 `ensureActiveTab(scope)`
 *   每 scope 单值、主进程 `activeTabId` 全局单值、服务端 Playwright 的 `activeTabId` 进程级单值）。
 *   同一会话里若多个 pageAgent（或一次并发派发的多个 browser_* 调用）同时操作，
 *   会互相抢同一个活动页 —— 后到的 navigate 覆盖前一个的页面，读取也只能读到"当前页"，
 *   表现为「多个 pageAgent 只有一个在动 / 结果错乱」（实测：agent 的操作跑到用户停留的页面上）。
 *   ⇒ 会话内把 browser_* 调用**串行化**（队尾等待），每个操作完整跑完再放下一个。
 *   ★ 只在**同一会话内**串行：不同会话有各自的锚定 tab（agentAnchoredTabs 按 convId 隔离），
 *     互不阻塞 —— 与既有 scope 隔离口径一致。
 *   ★ 排队逻辑收敛在 `browser-op-queue.ts`（纯函数，可脱离 store 单测）。
 */
const browserOpChains: BrowserOpChains = new Map();

/** 把一次浏览器操作挂到本会话的串行链尾（前一个跑完才轮到它）。无 convId 时不串行（退化旧行为）。 */
function serializeBrowserOp<T>(convId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return chainBrowserOp(browserOpChains, convId, fn);
}

/**
 * agent 在本次任务中**打开过的**所有 tab（会话级，2026-10-08）。
 *
 * ★ 为什么需要（用户诉求「pageAgent 执行完了不会关闭页面？」）：
 *   收尾时要知道"还剩几个 agent 开的页没收拾" —— 模型没关干净时给用户一条提示，
 *   而不是把一堆中间页留在面板里无人知晓。
 * ★ 与 `agentAnchoredTabs` 的区别：后者是"当前操作目标"（单值、会随锚定切换），
 *   本集合是"开过的全部"（累积、只增不减直到任务收尾清空）。
 * ★ 只记 agent 通过工具链打开的 tab，**不记用户手开的** —— 与主进程 close_tab 的
 *   agentOpened 闸门同一口径（用户手开的页 agent 无权关，也不该算作"待收拾"）。
 */
const agentOpenedTabs = new Map<string, Set<string>>(); // convId → tabIds

/** 登记 agent 打开了一个 tab（幂等） */
function markAgentOpenedTab(convId: string, tabId: string | number | null | undefined): void {
  if (!convId || tabId === null || tabId === undefined || tabId === '') return;
  const key = String(tabId);
  let set = agentOpenedTabs.get(convId);
  if (!set) { set = new Set(); agentOpenedTabs.set(convId, set); }
  set.add(key);
}

/** 取本会话 agent 打开过、且**仍存在**的 tab 列表（收尾提示用） */
function remainingAgentOpenedTabs(convId: string): string[] {
  const set = agentOpenedTabs.get(convId);
  if (!set || set.size === 0) return [];
  try {
    // ★ 2026-10-15：浏览器改为**应用级单例**（三级归属模型）⇒ 一律读全局 preview store。
    //   此前按 `preview:${convId}` 读动态 store，与面板（scope='preview'）脱节 ⇒ 永远空。
    const bs: any = useBrowserStore('preview');
    const alive = new Set<string>((bs.tabs || []).map((t: any) => String(t.id)));
    return [...set].filter((id) => alive.has(id));
  } catch { return [...set]; }
}

/** 清掉某会话（或全部）的 agent tab 记账 —— 任务收尾/reset 时调用 */
function clearAgentOpenedTabs(convId?: string): void {
  if (!convId) { agentOpenedTabs.clear(); return; }
  agentOpenedTabs.delete(convId);
}

async function resolvePreviewTabId(convId?: string): Promise<string> {
  const electron = (window as any).electronAPI;
  // ★ 2026-10-15：浏览器是**应用级**资源（三级归属：浏览器=整个应用一份；
  //   Git/文件=工作空间级；控制台=会话级）⇒ 执行面固定为裸 'preview'，
  //   与 BrowserPanel（scope='preview'）和主进程广播（main.cjs 用 'preview'）同源。
  //   此前按 `preview:${convId}` 分 store：切会话后面板重建到新 scope，agent 侧
  //   读到的却是旧/空 store ⇒ 锚定 tab 失效、轮询 4s 后主进程再自建一个 scope 的
  //   tab（壳还被面板 scope 挡掉）⇒ waitForGuest 30s 超时 ⇒ 任务断。
  //   convId 仍参与「哪个 tab 属于哪个会话」的归属记账（agentAnchoredTabs /
  //   agentTouchedTabs），与浏览器是否全局无关。
  const scope = 'preview';
  const bs: any = useBrowserStore(scope);
  const exists = (id: string) => !!id && bs.tabs.some((t: any) => t.id === id);
  // ① agent 锚定 tab 优先（跨调用保持，不受用户切换影响）
  const anchored = convId ? agentAnchoredTabs.get(convId) : undefined;
  if (anchored && exists(anchored)) return anchored;
  if (anchored) agentAnchoredTabs.delete(convId as string); // 已被关闭
  const current = () =>
    bs.activeTabId && bs.tabs.some((t: any) => t.id === bs.activeTabId) ? bs.activeTabId : '';
  const tid = current();
  if (tid) return tid;
  // 预览面板刚被 openTab 挂载：等它 onMounted 自建首个 tab（最多 ~4s）
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const t = current();
    if (t) return t;
  }
  // 兜底：主进程自建并广播（preview 面板的 onTabCreated 会补壳并激活）
  return await electron.browserView.ensureActiveTab(scope);
}

function rowToConv(r: any): Conversation {
  let mcpServerIds: string[] = [];
  let convMcpDisabled: Record<string, string[]> = {};
  let convMcpAliases: Record<string, Record<string, string>> = {};
  if (r.mcp_servers_json) {
    try {
      const parsed = JSON.parse(r.mcp_servers_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          mcpServerIds = parsed;
        } else {
          mcpServerIds = parsed.map((x: any) => x.serverId || x.id || '').filter(Boolean);
          for (const x of parsed) {
            if (x.disabledTools?.length) convMcpDisabled[x.serverId || x.id] = x.disabledTools;
            if (x.aliases && typeof x.aliases === 'object') convMcpAliases[x.serverId || x.id] = x.aliases;
          }
        }
      }
    } catch {}
  }
  return {
    id: r.id,
    title: r.title,
    agentId: r.agent_id,
    platformId: r.platform_id,
    modelId: r.model_id,
    spaceId: r.space_id,
    // 任务级任务类型（「父任务」层）：多任务目录里本条任务选的子线；空 = 跟随目录
    taskType: r.task_type ?? r.taskType ?? null,
    scheduledTaskId: r.scheduled_task_id ?? r.scheduledTaskId,
    mcpServerIds,
    _mcpDisabledTools: convMcpDisabled,
    _mcpToolAliases: convMcpAliases,
    skillIds: r.skill_ids_json ? JSON.parse(r.skill_ids_json) : [],
    builtinToolIds: r.builtin_tool_ids_json ? JSON.parse(r.builtin_tool_ids_json) : [],
    // 会话级自定义工具挂载（2026-09-29 补：此前只有 agent 级，会话级链路是半套）
    customToolIds: r.custom_tool_ids_json ? JSON.parse(r.custom_tool_ids_json) : [],
    systemPrompt: r.system_prompt,
    pinned: !!r.pinned,
    // 'full' 已并入 'all'（语义重复；存量 full 会话读到即迁移）
    permissionMode: (r.permission_mode === 'readonly' || r.permission_mode === 'full' || r.permission_mode === 'all') ? (r.permission_mode === 'full' ? 'all' : r.permission_mode) : 'default',
    taskPlan: (() => {
      if (!r.task_plan_json) return null;
      try {
        const parsed = JSON.parse(r.task_plan_json);
        return parsed && Array.isArray(parsed.steps) ? parsed : null;
      } catch { return null; }
    })(),
    // 归属模式。空值按 office 兜底（与后端迁移口径一致），
    // 否则老数据会在所有模式下都"隐身"——列表按 mode 过滤，NULL 匹配不上任何模式。
    // ★ 白名单必须与后端 routes/conversations.ts 的 VALID_MODES 同集：
    //   漏一个模式会让后端已正确落库的会话在前端被**静默改判成 office**（列表里看不到）。
    //   douyin 已于 2026-10-16 下线；库里存量 mode='douyin' 的行由 db.ts 的迁移改判 office，
    //   迁移先于本白名单生效，故这里少一项不会造成遗漏。
    mode: (['office', 'dev', 'ops', 'sec', 'wf', 'clip', 'shop'].includes(r.mode) ? r.mode : 'office') as Conversation['mode'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // ── 生命周期三列（2026-10-16「归档 + 回收站」）──────────────────────────
    // ★ 必须同时认蛇形（server 库）与驼峰（某些 IPC 通道直接回对象）两种写法：
    //   只认一种时，另一条链路读到的会话会**全是 undefined** ⇒ 前端判成活/归档/删除全错，
    //   而且不报错（"会话莫名其妙出现在回收站/主列表"）。
    archivedAt: r.archived_at ?? r.archivedAt ?? null,
    deletedAt: r.deleted_at ?? r.deletedAt ?? null,
    lastActivityAt: r.last_activity_at ?? r.lastActivityAt ?? null,
    // ── 来源标记（2026-10-16）：空 = 普通会话；'browser-page' = 浏览器页面对话 ──────
    // ★ 不做白名单收窄（与 mode 的处理相反）：来源在这里只用于**展示**（列表徽标），
    //   收窄的收益是"未知来源不显示徽标"，代价是"以后新加来源要记得同步改这里"——
    //   而这个文件正是历史上漂移过好几处的地方（见上面 mode 的注释）。
    //   写入口的白名单收窄在 core 的 normalizeConversationSource，一处就够。
    source: r.source ?? null,
    sourceMeta: (() => {
      if (!r.source_meta_json) return null;
      try { return parseSourceMeta(r.source_meta_json); } catch { return null; }
    })(),
  };
}

function rowToMsg(r: any): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
    toolCallId: r.tool_call_id,
    reasoningContent: r.reasoning_content,
    systemPromptSnapshot: r.system_prompt_snapshot,
    tokens: r.tokens,
    createdAt: r.created_at,
    parentToolCallId: r.parent_tool_call_id,
    subAgentId: r.sub_agent_id,
    subAgentName: r.sub_agent_name,
    subAgentDepth: r.sub_agent_depth,
  };
}

/**
 * 工具回执正文懒加载（2026-10-20）：列表下发时把**普通工具回执**（非子智能体结果）的
 * content 掏空，展开工具卡片时按需拉取（见 fetchToolResult）。
 *
 * ★ 为什么子智能体结果（subAgentId 非空）保留正文：call_agent 的最终答案会被提升到主内容区
 *   直接展示（message-rounds 的 subAgentResults），是交付物而非"过程细节"；且子智能体回执
 *   通常短小。真正的大文本（浏览器页面正文 / file_read / code_search）都在主智能体的普通回执里。
 */
function stripToolResultContent(msg: Message): Message {
  if (msg.role === 'tool' && !msg.subAgentId && msg.content) {
    return { ...msg, content: '' };
  }
  return msg;
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return {}; }
}

export interface PendingQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
  allowSupplement?: boolean;
  resolve: (answer: string, supplement?: string) => void;
}

/**
 * 越界访问授权卡（2026-10-01）。
 * 由服务端 path-guard 判定越界后，经 `_path_authorize` 工具走 tool:execute 通道下发。
 * 形状刻意贴近 PendingQuestion（同样的"弹卡 → await → 回传"语义），但**不复用**它：
 * 授权卡的返回值是**决策枚举**（once/dir/deny），而问答卡是自由文本，混在一起会让
 * 后端 parsePathAuthResult 的语义边界变模糊（本项目既有教训：同一语义要显式区分）。
 */
export interface PendingPathAuthItem {
  action: 'read' | 'write';
  /** 模型原始给的路径（弹窗里要让用户看到"它想访问什么"） */
  rawPath: string;
  /** 解析后的绝对路径（可能为空：命令类工具） */
  absPath: string;
  /** 命令类：执行目录（省略时默认会话工作目录；无工作目录时为空串） */
  cwd?: string;
  /** 命令类：执行目录是否在允许根内；undefined = 无法判定 */
  cwdInside?: boolean;
  /** 命令类：是否显式给了 cwd */
  cwdExplicit?: boolean;
}

export interface PendingPathAuth {
  toolName: string;
  /** 命令类工具（cmd_exec/python_exec）：路径抽不到，展示的是整条命令 */
  isCommand: boolean;
  /** 危险命令命中原因（非空 = 破坏性命令单独授权：无"记住本会话"选项） */
  dangerWhy?: string;
  workspaceDir: string;
  items: PendingPathAuthItem[];
  /** 决议回传：once=仅此次 / dir=允许该目录且本会话记住 / deny=拒绝 */
  resolve: (decision: 'once' | 'dir' | 'deny') => void;
}

/**
 * 只读会话工具授权卡（2026-10-18，「只读 = 要授权，而不是不能执行」）。
 * 由服务端只读权限闸命中写类工具后，经 `_tool_authorize` 工具走 tool:execute 通道下发。
 * 与 PendingPathAuth 同机制（弹卡 → await → 回传决策），不复用：决策枚举不同
 * （allow/deny，无 dir —— 授权粒度是"本任务内该工具放行"，由服务端 authorizedTools 记账）。
 */
export interface PendingToolAuth {
  /** 请求授权的工具名 */
  toolName: string;
  /** 参数摘要（服务端已截断到 600 字符，仅展示帮助用户决策） */
  argsPreview: string;
  resolve: (decision: 'allow' | 'deny') => void;
}

export interface ConfirmationPage {
  question: string;
  description?: string;
  options?: string[];
  multiSelect?: boolean;
  allowText?: boolean;
  allowSupplement?: boolean;
  required?: boolean;
}

export interface ConfirmationAnswer {
  question: string;
  answer: string;
  supplement?: string;
}

// ===== 右栏多 tab 数据模型（Phase B1）=====
// 替换旧三态互斥模型（rightPanelTab 单枚举 + previewingFile 单值）：
// 旧模型物理上无法同时打开 2 个文件。新模型 previewTabs[] 并存 + activeTabId 激活。
// file tab 可多开（按 path 幂等）；browser/git 为单例（内容组件单实例，浏览器内部自管多 tab）。
export type PreviewTabKind = 'file' | 'browser' | 'git' | 'data' | 'console';
/** 数据浏览契约：与 shared.InlineDataView 对齐（聊天内嵌与右栏面板公用同一结构） */
export type DataTabContract = InlineDataView;
export interface PreviewTab {
  id: string;
  kind: PreviewTabKind;
  name: string;        // tab 标题（browser 实际标题渲染时优先取 currentBrowserUrl 的 hostname）
  path?: string;       // file：文件绝对路径（幂等 key）
  /** file：所属会话 id。★ 必须随交付/登记文件一起传 —— FilePreview 的会话产物通道
   *  （conversations/:id/file-stream：跨根探测 + 登记路径兜底）以它为前提，
   *  漏传会退化到 workspace/file-stream，少一层兜底（2026-10-04 修「预览 MP4 报格式不支持」）。 */
  conversationId?: string;
  url?: string;        // browser：打开时的初始 URL
  repoPath?: string;   // git：仓库路径
  contract?: DataTabContract; // data：待浏览的查询契约
  /** file：目录级资源文件（在空间目录下、未登记 conversation_file）。
   *  带上 spaceId + resourceDir 后，预览可退化到「服务端按空间读」——
   *  Web 端 fs 适配器读不到服务端绝对路径，这是唯一可用的通道。 */
  spaceId?: string;
  resourceDir?: string;
  createdAt: number;
}

export interface PendingConfirmation {
  title: string;
  pages: ConfirmationPage[];
  index: number;
  answers: ConfirmationAnswer[];
  resolve: (result: Record<string, unknown>) => void;
}

/** 任务运行期间用户追加的消息（输入框上方的待发队列条目） */
export interface QueuedMessage {
  id: string;
  content: string;
  createdAt: number;
}

export interface PendingPlatformConfig {
  prefill: {
    name?: string;
    protocol?: 'openai' | 'anthropic' | 'custom';
    apiUrl?: string;
    apiKey?: string;
    modelId?: string;
    alias?: string;
    contextWindow?: number;
  };
  resolve: (result: { cancelled: boolean; platformId?: string; modelId?: string; message?: string }) => void;
}

// 任务计划的类型与分桶逻辑收敛在 plan-buckets（纯函数，可脱离 pinia 单测）。
// 这里 re-export 保持既有导入路径不变（外部有 `import type { PlanStep } from '../stores/chat'`）。
export type { PlanStep, PlanStepStatus } from './plan-buckets';
import {
  planKeyOf as resolvePlanKey,
  readPlan,
  removePlan,
  syncPlan,
  DRAFT_PLAN_KEY,
  type PlanMap,
  type PlanStep as PlanStepT,
} from './plan-buckets';
// ★ 残留自愈判定的常量与纯函数抽到独立文件（与 plan-buckets 同模式：可脱离 pinia 单测）。
//   见该文件顶部注释：这是"禁用标志挂多久"的唯一判定，必须能被行为测试真跑验证。
export { SWEEP_INTERVAL_MS, BROWSER_SWEEP_GRACE_MS, shouldSweepConv } from './stale-run-sweep';
import { SWEEP_INTERVAL_MS, shouldSweepConv } from './stale-run-sweep';

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  // 费用账本（2026-10-17）：SSE 的 task:cost / task:cost_notice 转调它。
  // ★ 只在此 store 内持有一个实例：Pinia 单例，组件侧 useCostStore() 拿到的是同一份。
  const costStore = useCostStore();

  /**
   * 「显示浏览器页面对话」偏好（2026-10-16）：默认**隐藏**。
   * ★ 为什么默认隐藏：页面对话是"问一句就走"的（/browser 每个 tab 一条），
   *   混进任务列表后噪声远大于信息量；它们有自己的管理入口（浏览器面板「历史」）。
   * ★ 为什么还要有这个开关：藏起来不等于不存在 —— 用户可能就是想在这个列表里看到全部会话。
   *   打开时列表会多出带「页面」徽标的行，且**服务端**才做过滤（前端过滤只是"看不见"，
   *   批量删除/导出这类扫全量的逻辑仍会把它们扫到）。
   * ★ 存 localStorage 而不是服务端：这是**本设备的视图偏好**，不是账号数据
   *   （与 yz_conv_root_collapsed 同口径）。
   */
  const SHOW_PAGE_CONVS_KEY = 'yz_show_page_convs';
  function readShowPageConvs(): boolean {
    // localStorage 在部分环境（隐私模式 / 个别单测的 node 环境）不可用 —— 失败即按默认（隐藏）
    try { return localStorage.getItem(SHOW_PAGE_CONVS_KEY) === '1'; } catch { return false; }
  }
  const showPageConvs = ref(readShowPageConvs());
  function setShowPageConvs(v: boolean) {
    showPageConvs.value = !!v;
    try { localStorage.setItem(SHOW_PAGE_CONVS_KEY, showPageConvs.value ? '1' : '0'); } catch { /* 忽略 */ }
  }

  const currentConvId = ref('');
  // 会话级消息缓存：每个会话独立一份消息数组，支持多会话并行（后台会话流式时不会污染当前会话视图）
  const messagesByConv = ref<Record<string, Message[]>>({});
  // 当前会话视图：始终指向 messagesByConv 里当前会话的数组（会话未加载/不存在时为空）
  const currentMessages = computed<Message[]>(() => messagesByConv.value[currentConvId.value] || []);
  // 当前会话是否流式/跑任务（多会话可并行，此值只反映用户当前查看的会话）
  const streaming = computed(() => runningConvIds.value.has(currentConvId.value));
  // 正在运行的会话集合：支持不同会话同时跑任务（真并行），同一会话仍互斥
  const runningConvIds = ref<Set<string>>(new Set());
  function isConvStreaming(convId: string) {
    return runningConvIds.value.has(convId);
  }
  // 会话级最近一次任务运行记录（2026-10-07）：驱动输入区上方运行指示的进度条 / 已用时 / 结束状态。
  //   status=running 期间由 UI 自行走秒；结束态（completed/aborted/error）由 SSE 终态事件或
  //   callLlm 的 catch/finally 落定（markRunEnd 幂等：先到者为准，finally 只兜底补 endedAt）。
  const runStatsByConv = ref<Record<string, { status: 'running' | 'completed' | 'aborted' | 'error'; startedAt: number; endedAt?: number }>>({});
  /** 落定运行结束态：已结束（endedAt 已有）则不动，避免 finally 覆盖 SSE 终态 */
  function markRunEnd(convId: string, status: 'completed' | 'aborted' | 'error' = 'completed') {
    const rec = runStatsByConv.value[convId];
    if (!rec || rec.endedAt) return;
    rec.status = status;
    rec.endedAt = Date.now();
  }
  // 正在执行的 call_agent 工具调用 id 集合：用于跨层强制展开对应工具项，
  // 让 SubAgentRoundView 实时露出子智能体每一步；执行结束移除即自动折叠回简洁态。
  const runningToolCallIds = ref<Set<string>>(new Set());
  function isToolCallRunning(toolCallId: string) {
    return runningToolCallIds.value.has(toolCallId);
  }
  const mountedMcpServers = ref<string[]>([]);
  const mcpDisabledTools = ref<Record<string, string[]>>({});
  const mcpToolAliases = ref<Record<string, Record<string, string>>>({});
  // E11: 浏览器面板步骤日志 —— dispatchToolCall 中 browser_* 工具执行后推送
  const browserSteps = ref<Array<{ action: string; result: string; time: number }>>([]);

  /**
   * 步骤日志容量与单条长度上限（2026-10-10，用户实报「pageAgent 一跑整个页面卡死」）。
   *
   * ★★★ 为什么必须有上限：`browserSteps` 此前是**只增不减、无上限**的数组（8 个 push
   *   点、零处裁剪）。pageAgent 长任务轻松跑出上百步，且 `result` 直接塞工具返回原文
   *   —— `browser_get_page_content` 返回整页结构化文本，单条可达数十 KB。结果：
   *   ① 数组无限膨胀 → 内存持续涨；② 每次 push 都触发依赖它的 computed/watch；
   *   ③ 面板渲染时 v-for 全量遍历。三者叠加就是「越跑越卡」。
   *
   * 保留策略：只留最近 MAX 条（步骤清单/进度是「最近发生了什么」，历史不需要无限回溯）；
   *   单条 result 超 MAX_LEN 就截断并标注 —— 面板本就不展示全文，截断不影响可读性。
   *
   * ★★★ 2026-10-12 上限 120 → 20（方案 A，见 docs/plan-browser-steps-retention-2026-10-12.md）：
   *   查证结论：`browserSteps` **已无任何 UI 渲染它**（全仓库无 `v-for` 遍历 / 无取
   *   `step.result`；只剩 3 处 `length > 0` 布尔判据）。它已从"步骤清单数据源"退化为
   *   "控制信号的载体"（真正的步骤清单走 `chatStore.planSteps`，由 task_plan 驱动）。
   *   ⇒ 为不展示的数组保留 120 条没有任何用户价值，只放大开销：
   *     · 超限后每次 push 都多一次 `splice(0, len-MAX)`（O(n) 元素搬移）—— 120 → 20 是 **6 倍**削减
   *     · 内存最坏 120×600 ≈ 72KB → 20×600 ≈ 12KB
   *   ⇒ 只留最近 20 条供**排障**（排障主路径其实是 `%APPDATA%\yan-zhi\logs\main-*.log`
   *     的 `[browser-action]` 日志，含完整 args，比这个数组更全）。
   *   ⚠️ 上限**不得再被"顺手调大"**——守门测试 `browser-step-liveness.test.ts` 钉死 ≤20。
   *      若将来真需要更长的可回溯历史，应新建**带事件索引的独立结构**，
   *      而不是复活这个已被证明"不该承载语义"的数组（见方案 D）。
   */
  const BROWSER_STEPS_MAX = 20;
  const BROWSER_STEP_RESULT_MAX = 600;

  // ★★★ 控制信号（两个）—— **必须声明在 pushBrowserStep 之前**（2026-10-12）。
  //
  // ★★★ 为什么不能从 `browserSteps.length` 差分推导（本次事故根因，用户实报）：
  //   上面 `BROWSER_STEPS_MAX` 的裁剪是 `push` + `splice`，**净长度恒为 120**。
  //   于是 `watch(() => browserSteps.value.length, ...)` 在数组填满后**永不再触发**
  //   ⇒ `lastBrowserToolAt` 冻结在"首次填满那一刻" ⇒ `BrowserPanel` 的 5 分钟硬上限
  //   兜底把它判成"残留" ⇒ `inputLocked` / `liveControlVisible` / `agentCursorVisible`
  //   三个 computed **同时被否决** ⇒ **禁用标志 / Agent 接管条 / 暂停恢复按钮 / 虚拟鼠标
  //   一起消失**，而任务其实还在跑。
  //   实测铁证（CDP 直连渲染进程读 pinia）：`browserStepsLen=120`、`lastStepAgoSec=12`
  //   但 `agoSec=754`、`lockStaleByHardLimit=true`、`inputLockedShouldBe=false`。
  //
  // ★ 修法：**push 点就是活性点，显式登记，唯一真相**。绝不再依赖数组长度这一
  //   "可被裁剪破坏的代理信号"（与 `stale-run-sweep.ts` 里"别拿浏览器静默时长当
  //   任务是否在跑的代理"同一教训家族）。
  //
  // ⚠️⚠️ **声明顺序是硬约束**：原实现把 `lastBrowserToolAt` 放在 pushBrowserStep **之后**
  //   （靠 watch 回调的延迟求值避开 TDZ）。改成 pushBrowserStep 内**同步**赋值后，
  //   若仍放在后面 → `ReferenceError: Cannot access 'lastBrowserToolAt' before initialization`
  //   → setup 直接抛异常。本项目已栽过两次同款 TDZ（见 browserPanelNowTickOrder.test.ts
  //   记录的那次 setup 崩溃）。守门测试：`browser-step-liveness.test.ts` 的声明顺序断言。
  /** 浏览器工具活性时间戳：最后一次 browser_* 工具事件的时间（由 pushBrowserStep 显式写入） */
  const lastBrowserToolAt = ref(0);
  /** 浏览器步骤**单调序号**（只增不减，不受 BROWSER_STEPS_MAX 裁剪影响）。
   *  ★ 用途：`useChat` 里"首个步骤出现就打开预览面板 / 锁输入"的两个 watch 判据。
   *    它们原用 `browserSteps.length` 的 0→N 跳变，数组填满后同样**永不触发**
   *    （与 lastBrowserToolAt 同一根因）。改用本序号：语义就是"第几个浏览器步骤"，
   *    天然单调，裁剪动不了它。
   *  ★ 生命周期与 `browserSteps` 对齐：`browserSteps.length = 0`（跨会话 reset）后必须一起归零，
   *    否则新会话第一个步骤时 `o !== 0` ⇒ 两个 watch 都不触发（新任务面板不弹）。
   *    `browserSteps` 靠 `length = 0` 归零，序号没有等价手段 ⇒ 提供 `resetBrowserStepSeq()`。 */
  const browserStepSeq = ref(0);
  /** 归零步骤序号（与 `browserSteps.length = 0` 成对调用，见 useChat resetTaskScopedState） */
  function resetBrowserStepSeq() {
    browserStepSeq.value = 0;
    lastBrowserToolAt.value = 0;
  }

  function pushBrowserStep(action: string, result: unknown) {
    let text = typeof result === 'string' ? result : String(result ?? '');
    if (text.length > BROWSER_STEP_RESULT_MAX) {
      text = text.slice(0, BROWSER_STEP_RESULT_MAX) + `…（已省略 ${text.length - BROWSER_STEP_RESULT_MAX} 字）`;
    }
    const now = Date.now();
    browserSteps.value.push({ action, result: text, time: now });
    if (browserSteps.value.length > BROWSER_STEPS_MAX) {
      browserSteps.value.splice(0, browserSteps.value.length - BROWSER_STEPS_MAX);
    }
    // ★ 两个控制信号在此**显式**登记 —— 见上方长注释：绝不能从 length 差分推导。
    lastBrowserToolAt.value = now;
    browserStepSeq.value += 1;
  }

  // Agent 浏览器实况控制：agent 驱动浏览器期间的状态旗标。
  // expanded：预览面板全屏放大（原地 fixed class，DOM 不动 —— Teleport 会搬 webview 导致页面重载）；
  // userDismissed：用户手动收起后本次浏览器任务内不再自动展开（不跟人抢 UI，按钮仍可手动开合）；
  // lockInput：agent 操作期间锁住网页视口的鼠标/键盘（工具条不盖，暂停/停止/收起始终可点）。
  const browserExpanded = ref(false);
  const browserUserDismissed = ref(false);
  const browserLockInput = ref(false);
  /**
   * 会话级「正在跑浏览器任务」记账（2026-10-08）。
   *
   * ★★★ 为什么不能拿 `browserSteps.length > 0` 当判据：`browserSteps` 是**事件日志**，
   *   只在收到 `tool:start` / `tool:result` / `tool:execute` 帧时增长。而它偏偏是
   *   SSE 断流时**最先归零**的东西 —— 断流 → 前端重连 → 重连拿到 `connected` 就干净了，
   *   steps 为空 → `BrowserPanel` 的 `inputLocked` / `liveControlVisible` /
   *   `agentCursorVisible` 三个 computed **同时失效**。实测表现（用户实报）：
   *   「pageAgent 在执行吗？啥进度没有？而且用户还能操作页面？」—— 三个症状同源。
   *
   * ★ 与 `browserSteps` 的分工：steps 管**展示**（步骤清单/进度条），本记账管**控制**
   *   （锁定/实况态）。控制信号必须来自**任务运行态与工具类型的单调事实**，而不是
   *   可被断流清空的日志缓冲。
   * ★ 只增不减（任务收尾时整表清空）：一旦本会话出现过 browser_* 工具调用，就认定
   *   这个会话本任务期间是"浏览器任务"，中途不再因为 steps 抖动而反复解锁。
   * ★ 键是 convId：多会话并行时 A 会话的浏览器任务不得锁住 B 会话的面板。
   */
  const browserTaskConvs = ref<Set<string>>(new Set());
  // ★ 浏览器工具活性时间戳与步骤序号 **已上移到 pushBrowserStep 之前声明**
  //   （2026-10-12，见该处长注释：本次"禁用标志/接管条/虚拟鼠标/暂停集体消失"的根因修复）。
  //   此处原有两个东西，均已移除：
  //     ① `const lastBrowserToolAt = ref(0);` —— 上移（TDZ 硬约束）
  //     ② `watch(() => browserSteps.value.length, ...)` 推导链 —— **删除**。
  //        正是它把活性判定绑到"可被 BROWSER_STEPS_MAX 裁剪破坏的长度"上：
  //        数组填满后 push+splice 净长度不变 → watch 永不触发 → 时间戳冻结 12 分钟
  //        → 5min 硬上限误判"残留" → 四样 UI 一起消失。
  /** 接管条活性宽限：最后一次浏览器工具事件后，条子保留多久（覆盖 wait_for 30s 类长工具） */
  const BROWSER_LIVE_GRACE_MS = 45000;
  /** 登记「本会话正在跑浏览器任务」（幂等；由工具事件驱动，见 subscribeTaskWs 的 tool 分支） */
  function markBrowserTaskActive(convId: string) {
    if (!convId) return;
    if (browserTaskConvs.value.has(convId)) return;
    // Set 是浅响应，必须整体换引用才能触发依赖它的 computed
    browserTaskConvs.value = new Set(browserTaskConvs.value).add(convId);
  }
  /** 清空指定会话（或全部）的浏览器任务记账 —— 任务收尾/切会话/reset 时调用 */
  function clearBrowserTaskActive(convId?: string) {
    if (!convId) {
      if (browserTaskConvs.value.size) browserTaskConvs.value = new Set();
      return;
    }
    if (!browserTaskConvs.value.has(convId)) return;
    const next = new Set(browserTaskConvs.value);
    next.delete(convId);
    browserTaskConvs.value = next;
  }
  /** 当前会话是否正在跑浏览器任务（BrowserPanel 的锁定/实况判据） */
  const browserTaskActive = computed(() => !!currentConvId.value && browserTaskConvs.value.has(currentConvId.value));

  // ★★★ 浏览器执行面判据（「执行面直连化」P2-1，2026-10-10）：由**服务端单一给出**。
  //
  // ★ 为什么必须由服务端下发、前端**不得自己探**（两条硬理由）：
  //   ① 前端探端点 = 第二份判据 → 与 `decideBrowserExecution`（server/src/browser-bridge.ts）
  //      必然漂移（本项目一贯判据：同一语义只能有一处实现）；
  //   ② 探端点需要 token → 会把凭据暴露到渲染层/网页上下文（安全边界明令禁止）。
  //   ⇒ 服务端在 `task:created` 里下发枚举标记（**不含 URL/token**）。
  //
  // ★ 语义：`bridge` = 本次任务的浏览器工具由**服务端直连主进程**执行，前端**只展示不执行**
  //   （否则同一次调用会打两遍页面 = 双执行）。`frontend` = 前端照旧本地执行（既有行为）。
  // ★ 键是 convId：多会话并行时各会话的档位可以不同（灰度期尤其可能混合）。
  const browserExecutionByConv = ref<Map<string, 'bridge' | 'frontend'>>(new Map());
  /** 本会话的浏览器工具是否由服务端直连执行（前端据此**跳过本地执行**） */
  function isBrowserExecutionByBridge(convId?: string | null): boolean {
    const cid = convId || currentConvId.value;
    if (!cid) return false;
    return browserExecutionByConv.value.get(cid) === 'bridge';
  }
  /** 登记/清理某会话的执行面（任务创建时写入；任务收尾时清理，避免残留影响下一任务） */
  function setBrowserExecution(convId: string, exec: 'bridge' | 'frontend') {
    if (!convId) return;
    const next = new Map(browserExecutionByConv.value);
    next.set(convId, exec);
    browserExecutionByConv.value = next;
  }
  function clearBrowserExecution(convId?: string) {
    if (!convId) {
      if (browserExecutionByConv.value.size) browserExecutionByConv.value = new Map();
      return;
    }
    if (!browserExecutionByConv.value.has(convId)) return;
    const next = new Map(browserExecutionByConv.value);
    next.delete(convId);
    browserExecutionByConv.value = next;
  }
  // Agent 虚拟鼠标（宿主层渲染）：主进程 browserView:action 动作完成后广播 guest 坐标，
  // BrowserPanel 在 webview 上方画常驻光标（webview 引擎下 guest 内瞬时光标会被 shield
  // 盖住且只闪现 0.5s，等于看不见）。tabId 用于多面板实例归属判断；at 用于重触发 CSS 动画。
  const agentCursor = ref<{ tabId: string | null; x: number; y: number; label: string; kind: string; at: number } | null>(null);
  let agentCursorHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最后一次动作后光标停留多久淡出 */
  const AGENT_CURSOR_LINGER_MS = 1200;
  function onAgentCursor(tabId: string | null, x: number, y: number, label: string, kind: string) {
    agentCursor.value = { tabId, x, y, label, kind, at: Date.now() };
    if (agentCursorHideTimer) clearTimeout(agentCursorHideTimer);
    agentCursorHideTimer = setTimeout(() => { agentCursor.value = null; }, AGENT_CURSOR_LINGER_MS);
  }
  function clearAgentCursor() {
    if (agentCursorHideTimer) { clearTimeout(agentCursorHideTimer); agentCursorHideTimer = null; }
    agentCursor.value = null;
  }
  // 右侧预览面板是否展开；默认**关闭**（进入聊天页先看到纯聊天区，点了文件/网站才展开右栏）
  const rightPanelOpen = ref(false);
  // 输入框「+」菜单模式开关（对齐 WorkBuddy）：随请求透传 modeFlags，后端统一追加指令/裁剪工具
  const thinkingMode = ref(false);   // 深度思考：提示词要求充分推理后再作答
  const planMode = ref(false);       // 计划模式：先用 task_plan 登记计划再执行
  const answerOnly = ref(false);     // 仅回答：后端清空工具列表，禁一切工具调用
  // 思考强度（reasoning_effort API 参数）—— 注意与上面的「深度思考」是两回事：
  //   深度思考 = 提示词模式；思考强度 = 真正下发给 LLM 的 reasoning_effort / reasoning.effort。
  //   null = 跟随智能体配置（默认：请求不带该参数，后端回退 agent.config.reasoningEffort）；
  //   '' = 本会话强制关闭（后端 options.reasoningEffort='' 优先于智能体配置）；
  //   'low' | 'medium' | 'high' = 会话级覆盖。切会话/刷新不持久（与 thinkingMode 同口径）。
  const reasoningEffortOverride = ref<string | null>(null);
  // 会话级工具权限：readonly=只读（写类工具被后端硬拦截）/ default=标准 / full=全部放行。
  // 持久化在 conversation.permission_mode；新会话草稿态先存本地，创建会话时随 POST 落库。
  // ★★ 默认档是 readonly（2026-09-27 用户拍板：默认全放行太危险）——
  //     新任务一律先只读，需要写入/执行时由用户在权限胶囊（移动端在「+」菜单）手动放开；
  //     模型撞到拦截会收到明确原因并提示用户放开（见后端 permissionModePrompt）。
  type PermissionMode = 'readonly' | 'default' | 'all';
  const permissionMode = ref<PermissionMode>('readonly');
  /** 切换权限并持久化：已有会话立即 PATCH；草稿态只记本地（创建会话时随 POST 落库） */
  async function setPermissionMode(mode: PermissionMode) {
    permissionMode.value = mode;
    const cid = currentConvId.value;
    if (!cid) return;
    const r = await api.patch(`/conversations/${cid}`, { permissionMode: mode });
    if ((r as any)?.error) console.warn('[Chat] 权限模式保存失败:', (r as any).error);
  }
  /** 任务运行期间用户追加的消息（输入框上方的队列）。
   *  按 conversationId 分桶——多会话并行时各会话的追加列表互不干扰。
   *  默认等当前任务结束后由前端逐条串行发送（每轮只发一条，链式排空）；
   *  点「立即发送」则 POST /llm/tasks/inject，立即落库并在下一轮 LLM 调用时带上（不等整个任务结束）。 */
  const queuedByConv = ref<Record<string, QueuedMessage[]>>({});

  /** 取某会话的追加队列（只读视图，空数组兜底） */
  function queuedOf(convId: string): QueuedMessage[] {
    if (!convId) return [];
    return queuedByConv.value[convId] || [];
  }

  /** 任务结束（completed/aborted/error）回调。供上层在任务收尾后自动发出排队的追加消息。
   *  异步派发（宏任务）——调用点位于 SSE 消费栈内，此时 runningConvIds 尚未清理，
   *  同步派发会让随后的 callLlm 撞上「同会话互斥」直接 return，追加消息被静默丢弃。 */
  const taskFinishHooks = new Set<(convId: string) => void>();
  function onTaskFinished(fn: (convId: string) => void): () => void {
    taskFinishHooks.add(fn);
    return () => { taskFinishHooks.delete(fn); };
  }
  function emitTaskFinished(convId: string) {
    if (taskFinishHooks.size === 0) return;
    setTimeout(() => {
      for (const fn of [...taskFinishHooks]) {
        try { fn(convId); } catch (e) { console.error('[Chat] 任务结束回调异常:', e); }
      }
    }, 30);
  }

  /** 入队一条追加消息。返回新条目（便于 UI 定位/滚动）。 */
  function enqueueMessage(convId: string, content: string): QueuedMessage {
    const text = String(content ?? '');
    const item: QueuedMessage = {
      id: 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      content: text,
      createdAt: Date.now(),
    };
    (queuedByConv.value[convId] ||= []).push(item);
    return item;
  }

  function removeQueuedMessage(convId: string, id: string) {
    const arr = queuedByConv.value[convId];
    if (!arr) return;
    queuedByConv.value[convId] = arr.filter((q) => q.id !== id);
  }

  function updateQueuedMessage(convId: string, id: string, content: string) {
    const arr = queuedByConv.value[convId];
    if (!arr) return;
    const hit = arr.find((q) => q.id === id);
    if (hit) hit.content = content;
  }

  /** 把某条追加消息**提到队首**（「立即发送」在任务已结束、退回普通发送时用）。
   *  flushQueuedAfterTask 每次只取队首一条 —— 不提前，用户点第 3 条却发了第 1 条，
   *  与"点谁发谁"的直觉相悖。 */
  function promoteQueuedMessage(convId: string, id: string) {
    const arr = queuedByConv.value[convId];
    if (!arr) return;
    const idx = arr.findIndex((q) => q.id === id);
    if (idx <= 0) return;
    const [item] = arr.splice(idx, 1);
    arr.unshift(item);
  }

  /** 取出并清空某会话的全部待发消息（保留给需要一次性排空的场景） */
  function takeQueuedMessages(convId: string): QueuedMessage[] {
    const arr = queuedByConv.value[convId] || [];
    delete queuedByConv.value[convId];
    return arr;
  }

  /** 只取出队首一条待发消息（逐条发送模式：发完这条任务收尾后由回调再取下一条，链式排空队列） */
  function takeFirstQueuedMessage(convId: string): QueuedMessage | null {
    const arr = queuedByConv.value[convId];
    if (!arr || arr.length === 0) return null;
    const [first] = arr.splice(0, 1);
    if (arr.length === 0) delete queuedByConv.value[convId];
    return first;
  }

  /**
   * 「立即发送」：注入到运行中的任务，模型下一轮带上。
   *
   * ★★★ 幂等与"点击即见"（2026-10-09 用户实报）：
   *   · 「同一个消息点击多次会发送 n 次」→ 用具队列条目 id 当幂等键：
   *     在途守卫（injecting）挡住第二次点击，clientMsgId 让后端也能去重（覆盖网络重试）。
   *   · 「点击无用 / 聊天里看不到」→ 注入成功时后端**回传真实 msgId**，这里**本地立即插入**
   *     该条 user 消息（SSE 的 message:added 后到会被 id 去重挡住，不会重复）。
   *     此前完全依赖 SSE 回显 —— 断流或切走再回来时就"点了没反应、队列条目还消失了"。
   *
   * @returns { ok, duplicate } —— ok=false 表示该会话已无运行中任务（调用方退回普通发送）
   */
  const injectingQueued = ref<Set<string>>(new Set());
  async function injectQueuedMessage(convId: string, id: string): Promise<{ ok: boolean; duplicate: boolean }> {
    const arr = queuedByConv.value[convId];
    const hit = arr?.find((q) => q.id === id);
    if (!hit) return { ok: false, duplicate: false };
    // 在途守卫：同一条已在发送中 → 直接忽略第二次点击（防连点落多条）
    if (injectingQueued.value.has(id)) return { ok: true, duplicate: true };
    injectingQueued.value = new Set(injectingQueued.value).add(id);
    try {
      let data: any = {};
      try {
        const r = await requestChatWs<any>('inject', {
          conversationId: convId,
          content: hit.content,
          clientMsgId: id, // 幂等键：后端据此去重（连点 / 网络重试同一 id 只落一条）
        });
        data = r?.data || {};
      } catch {
        return { ok: false, duplicate: false };
      }
      if (data.status === 'injected') {
        removeQueuedMessage(convId, id);
        // ★ 本地立即回显：不依赖 SSE。按真实 id 去重（后到的 message:added 会被挡住）。
        const realId = typeof data.msgId === 'string' && data.msgId ? data.msgId : null;
        if (realId) {
          const list = (messagesByConv.value[convId] ||= []);
          if (!list.some((m) => m.id === realId)) {
            list.push({
              id: realId, conversationId: convId, role: 'user', content: hit.content,
              createdAt: Date.now(),
            } as any);
          }
        }
        return { ok: true, duplicate: !!data.duplicate };
      }
      return { ok: false, duplicate: false };
    } finally {
      const next = new Set(injectingQueued.value);
      next.delete(id);
      injectingQueued.value = next;
    }
  }

  // 文件管理弹窗（el-dialog）是否显示——左侧栏「文件管理」按钮触发
  const showFilePopup = ref(false);
  // ===== 多 tab 数据模型（Phase B1）：previewTabs 并存 + activeTabId 激活 =====
  const previewTabs = ref<PreviewTab[]>([]);
  const activeTabId = ref<string | null>(null);
  let previewTabSeq = 0;
  const activeTab = computed<PreviewTab | null>(
    () => previewTabs.value.find((t) => t.id === activeTabId.value) || null,
  );

  /** 打开（或激活已存在的）预览 tab。file 按 path 幂等复用；browser/git 单例复用；data 单例并覆盖其契约内容 */
  function openTab(tab: Omit<PreviewTab, 'id' | 'createdAt'>): string {
    const existing =
      tab.kind === 'file' && tab.path
        ? previewTabs.value.find((t) => t.kind === 'file' && t.path === tab.path)
        : previewTabs.value.find((t) => t.kind === tab.kind);
    if (existing) {
      if (existing.kind === 'data') {
        // 重新打开数据浏览：沿用同一 tab，替换为最新契约，触发面板刷新
        Object.assign(existing, {
          name: tab.name,
          contract: tab.contract,
        });
      } else if (existing.kind === 'browser' && tab.url) {
        existing.url = tab.url;
      }
      activeTabId.value = existing.id;
      rightPanelOpen.value = true;
      return existing.id;
    }
    const id = 'pv-' + ++previewTabSeq;
    previewTabs.value.push({ ...tab, id, createdAt: Date.now() });
    activeTabId.value = id;
    rightPanelOpen.value = true;
    return id;
  }
  /** 激活指定 tab（id 不存在时 no-op） */
  function activatePreviewTab(id: string) {
    if (previewTabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
      rightPanelOpen.value = true;
    }
  }
  /** 关闭 tab；关的是激活项则激活左邻 → 右邻 → 无 */
  function closePreviewTab(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx < 0) return;
    previewTabs.value.splice(idx, 1);
    if (activeTabId.value === id) {
      const next = previewTabs.value[idx - 1] || previewTabs.value[idx] || null;
      activeTabId.value = next ? next.id : null;
    }
  }
  /**
   * 全部关闭（面板保持展开，内容区显示空态）。
   *
   * ★ `keepBrowser: true` 用于「任务级清理」（新建任务 / 切换会话）：
   *   浏览器是**应用级**资源（2026-10-15 用户三级归属模型：浏览器=整个应用一份，
   *   Git/文件=工作空间级，控制台=会话级）。此前任务级清理把 browser tab 一起清掉，
   *   → ChatPreviewPane 的 BrowserPanel 卸载 → 主进程 closeAllTabs 真销毁 BrowserView
   *   → 正在跑的 pageAgent 失去目标 webContents，任务直接中断（用户实报：
   *   「A 任务在执行 pageAgent，点了别的工作空间，预览浏览器就没了」）。
   *   ⇒ 任务级清理必须保留 browser tab；只有用户显式「关闭全部」才真关。
   */
  function closeAllPreviewTabs(opts?: { keepBrowser?: boolean }) {
    if (opts?.keepBrowser) {
      const kept = previewTabs.value.filter((t) => t.kind === 'browser');
      previewTabs.value = kept;
      if (kept.length === 0) { activeTabId.value = null; return; }
      if (!kept.some((t) => t.id === activeTabId.value)) activeTabId.value = kept[0].id;
      return;
    }
    previewTabs.value = [];
    activeTabId.value = null;
  }
  /** 关闭指定 tab 左侧的所有 tab；若激活项被关闭则激活锚点 tab */
  function closePreviewTabsLeft(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    previewTabs.value.splice(0, idx);
    if (!previewTabs.value.some((t) => t.id === activeTabId.value)) activeTabId.value = id;
  }
  /** 关闭指定 tab 右侧的所有 tab；若激活项被关闭则激活锚点 tab */
  function closePreviewTabsRight(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx < 0 || idx === previewTabs.value.length - 1) return;
    previewTabs.value.splice(idx + 1);
    if (!previewTabs.value.some((t) => t.id === activeTabId.value)) activeTabId.value = id;
  }

  // ===== 兼容层：旧三态字段改为派生只读（迁移期读取点不改可跑通）=====
  const rightPanelTab = computed<PreviewTabKind>(() => activeTab.value?.kind || 'file');
  const previewingFile = computed<{ name: string; path: string } | null>(() => {
    const t = activeTab.value;
    return t && t.kind === 'file' && t.path ? { name: t.name, path: t.path } : null;
  });
  // currentBrowserUrl 保持可写（BrowserPanel 写入更新标题 / browser_navigate 写入触发导航）
  const currentBrowserUrl = ref('');
  // pageAgent 导航时置 true，BrowserPanel watch(currentUrl) 跳过一次 recordVisit（不记录智能体浏览历史）
  const skipNextRecordVisit = ref(false);


  // E12: 智能体反问弹窗 —— 等待用户回答的待处理问题（dispatchToolCall 中 await 此 Promise 以暂停 ReAct 循环）
  const pendingQuestion = ref<PendingQuestion | null>(null);
  // E12b: 多页用户确认向导 —— confirm_user 工具逐页收集选择/文字/补充说明
  const pendingConfirmation = ref<PendingConfirmation | null>(null);
  // 越界访问授权卡 —— 服务端 path-guard 判定越界后下发，用户点同意才放行（2026-10-01）
  const pendingPathAuth = ref<PendingPathAuth | null>(null);
  // 只读会话工具授权卡 —— 服务端只读权限闸命中写类工具后下发（2026-10-18 授权制）
  const pendingToolAuth = ref<PendingToolAuth | null>(null);
  // E12c: 模型平台配置弹窗 —— configure_model_platform 工具触发，等待用户填写并保存平台/模型
  const pendingPlatformConfig = ref<PendingPlatformConfig | null>(null);
  /**
   * 跨页预填聊天输入框（2026-10-15，Skill 蒸馏「去调试」P2-10）。
   * 为什么要走 store 中转：输入框内容 `input` 是 useChat() 内的**局部 ref**，别的视图够不到；
   * 而「去调试」建完调试会话后要预填一条测试 prompt 再跳过去。
   * 语义：置入后由 useChat 的 watcher 取走并**立即清空** —— 不清空的话，用户下次进聊天页
   * 会被同一条 prompt 再灌一次（输入框里凭空多出上次的测试语句，且看不出是哪来的）。
   */
  const pendingPrefill = ref('');
  function prefillInput(text: string) { pendingPrefill.value = String(text || ''); }
  // E12: 任务规划进度 —— task_plan / task_step 工具写入，UI 渲染 todo 卡片。
  // **必须按会话分桶**：计划是「某一次任务的执行清单」，归属产生它的那个会话。
  // 早先用 planTitle / planSteps 两个全局 ref，A 会话登记的计划会原样出现在 B 会话里（串台）。
  // 分桶与变更规则在 plan-buckets.ts（纯函数），此处只做响应式包装。
  const plansByConv = ref<PlanMap>({});
  /** 当前查看会话的计划键；也可显式传会话 id 取别的会话 */
  function planKeyOf(convId?: string | null): string {
    return resolvePlanKey(currentConvId.value, convId);
  }

  /**
   * ★★★ 2026-10-15：这里原有的 `hydratePlan`（改动计划前先把内存补齐）**已随直连化删除**。
   *
   * 它当年修的是一类真 bug（2026-10-14 实测 conv 96125908）：App 重启/页面重载后**前端内存为空**、
   * 而会话行里已有落盘计划 ⇒ `task_step` 误报「当前会话还没有任务计划」⇒ 模型重建计划 ⇒
   * `applyTaskPlan` 把已完成步骤重置为 pending（进度作废），界面停在「步骤 0/5、已用时 22:02」。
   *
   * 直连化后这类问题**结构性消失**：计划由**服务端**读写（每次都从 `conversation.task_plan_json` 取），
   * 前端内存空不空都不影响推进 —— 前端只按服务端推来的 `plan:updated` 渲染，不再自己 apply。
   * ⇒ 前端不再需要"改动前补内存"这道防御（没有本地改动点了）。
   */
  /** 当前查看会话的计划标题（无计划时为空串，卡片侧兜底为「任务计划」） */
  const planTitle = computed(() => readPlan(plansByConv.value, planKeyOf())?.title || '');
  /** 当前查看会话的计划步骤（其他会话的计划不会出现在这里） */
  const planSteps = computed<PlanStepT[]>(() => readPlan(plansByConv.value, planKeyOf())?.steps || []);

  /** 用户提交越界访问授权卡的决议（once=仅此次 / dir=允许该目录且本会话记住 / deny=拒绝） */
  function submitPendingPathAuth(decision: 'once' | 'dir' | 'deny') {
    const card = pendingPathAuth.value;
    if (!card) return;
    pendingPathAuth.value = null;
    card.resolve(decision);
  }

  /** 用户提交只读会话工具授权卡的决议（allow=批准，本任务内该工具放行 / deny=拒绝） */
  function submitPendingToolAuth(decision: 'allow' | 'deny') {
    const card = pendingToolAuth.value;
    if (!card) return;
    pendingToolAuth.value = null;
    card.resolve(decision);
  }

  /** 用户提交反问弹窗的回答（或在未提供选项时填入文本）；答案作为该工具调用的 result 回写并继续循环 */
  function submitPendingQuestion(answer: string, supplement?: string) {
    if (pendingQuestion.value) {
      const resolve = pendingQuestion.value.resolve;
      pendingQuestion.value = null;
      resolve(answer, supplement?.trim() || undefined);
    }
  }
  /** 提交当前确认向导页；非最后一页时前进，最后一页汇总全部回答并恢复 ReAct 循环 */
  function submitPendingConfirmation(answer: string, supplement?: string) {
    const wizard = pendingConfirmation.value;
    if (!wizard) return;
    const page = wizard.pages[wizard.index];
    if (!page) return;
    wizard.answers[wizard.index] = {
      question: page.question,
      answer,
      supplement: supplement?.trim() || undefined,
    };
    if (wizard.index < wizard.pages.length - 1) {
      wizard.index += 1;
      return;
    }
    const resolve = wizard.resolve;
    pendingConfirmation.value = null;
    resolve({
      cancelled: false,
      title: wizard.title,
      answers: wizard.answers,
      summary: wizard.answers
        .map((a) => `Q: ${a.question}\nA: ${a.answer || '(未作答)'}${a.supplement ? `\n补充: ${a.supplement}` : ''}`)
        .join('\n\n'),
    });
  }
  /** 跳过当前确认页：把这一页标记为跳过并进入下一页 */
  function skipPendingConfirmation() {
    submitPendingConfirmation('', '[用户跳过该问题]');
  }
  /** 用户关闭向导：以取消结果结束本次 confirm_user 调用。
   *  ★ 必须带上**已作答的部分**（2026-09-27 修的真实缺陷）：
   *    用户答到第 3 页才关掉向导时，前两页的确认结果同样是"用户拍板过的决定"，
   *    后端要把它们落进任务决策记录（硬性要求）——此前只回 `cancelled:true` +
   *    一个后端不认的 answers 数组，等于这几页白答了：同目录下次任务还会重复问。
   */
  function cancelPendingConfirmation() {
    const wizard = pendingConfirmation.value;
    if (!wizard) return;
    const resolve = wizard.resolve;
    pendingConfirmation.value = null;
    const answered = (wizard.answers || []).filter((a) => (a.answer || '').trim() || (a.supplement || '').trim());
    const summary = answered
      .map((a) => `Q: ${a.question}\nA: ${a.answer || '(未作答)'}${a.supplement ? `\n补充: ${a.supplement}` : ''}`)
      .join('\n\n');
    resolve({
      cancelled: true,
      title: wizard.title,
      answers: wizard.answers,
      // 把已答内容以文本形式回传：后端 extractPendingQuestion 取不到时靠它兜底记录
      summary: summary
        ? `${summary}\n\n[用户在向导中途关闭；以上是关闭前已确认的内容]`
        : '',
    });
  }
  /** 用户提交模型平台配置弹窗：将保存结果回写为 configure_model_platform 工具结果 */
  function submitPlatformConfig(result: { cancelled: boolean; platformId?: string; modelId?: string; message?: string }) {
    const pending = pendingPlatformConfig.value;
    if (!pending) return;
    const resolve = pending.resolve;
    pendingPlatformConfig.value = null;
    resolve(result);
  }
  /** 用户关闭模型平台配置弹窗：以取消结果结束本次工具调用 */
  function cancelPlatformConfig() {
    submitPlatformConfig({ cancelled: true, message: '用户关闭了模型平台配置弹窗' });
  }
  /** 清空当前任务计划（用户关闭进度卡片 / 新任务开跑时调用）。只清指定会话，别会话的计划不受影响。
   *  ★ 落盘写的是「防抖到期时的最新状态」而非 null：新任务开跑清旧计划后，若 800ms 窗口内
   *    新任务已登记新计划，落盘的是新计划，不会把它误抹成 null。 */
  function clearPlan(convId?: string | null) {
    const key = planKeyOf(convId);
    plansByConv.value = removePlan(plansByConv.value, key);
    if (!key || key === DRAFT_PLAN_KEY || !isServerMode()) return;
    if (planSaveTimer) clearTimeout(planSaveTimer);
    planSaveTimer = setTimeout(() => {
      planSaveTimer = null;
      const plan = readPlan(plansByConv.value, key) || null;
      void api.patch(`/conversations/${key}`, { taskPlan: plan });
    }, 800);
  }

  /**
   * ★★★ 只清**界面展示**，不落盘（2026-10-09 修，high —— 跨会话接力被这里整条抹掉）。
   *
   * 背景（实据）：`send()` 开跑新任务时会调 `clearPlan(convId)`，而 clearPlan 的防抖回调是
   *   `readPlan(plansByConv, key)` —— 它读的是**自己刚清空的 map**，因此取到的永远是 `null`，
   *   于是**每次发消息都 PATCH taskPlan:null**。服务端收到 null 会
   *   ① 把 `conversation.task_plan_json` 置空 ② **unlink 工作目录的 plan.md**。
   *   后果（与 §计划接力棒跨会话 的"三处落盘点全空"完全吻合）：
   *   · 跨会话接力彻底不成立 —— 计划刚登记就被下一次发消息删掉；
   *   · 收尾时 `readPlanRemainingSteps()` = 0 → 机械接力信号丢失，只剩模型自评（倾向"已完成"）。
   *
   * ★ 判据：**"清展示"与"清持久化"是两件事，必须分开**。
   *   TaskPlanCard 的「清除计划」按钮是用户显式动作 → 走 clearPlan（要落盘 null，合理）；
   *   新任务开跑只是"别让上一轮的卡片残留在进度行上" → 走本函数（只清内存）。
   *   把两者塞进同一个函数，就会让"顺带清一下显示"演变成"删掉用户的跨会话计划"。
   */
  function clearPlanDisplayOnly(convId?: string | null) {
    const key = planKeyOf(convId);
    plansByConv.value = removePlan(plansByConv.value, key);
  }

  /** 计划落盘：写入 conversation.task_plan_json（刷新/换设备后 TaskPlanCard 可恢复）。
   *  task_plan/task_step 在一轮任务里高频更新 → 800ms 防抖合并 PATCH。 */
  let planSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function persistPlan(convId: string, plan: unknown) {
    // 草稿键（会话未建立）没有行可写；等会话创建后由下次 task_plan/task_step 落到真实键
    if (!convId || convId === DRAFT_PLAN_KEY || !isServerMode()) return;
    if (planSaveTimer) clearTimeout(planSaveTimer);
    planSaveTimer = setTimeout(() => {
      planSaveTimer = null;
      void api.patch(`/conversations/${convId}`, { taskPlan: plan });
    }, 800);
  }
  let abortControllers = new Map<string, AbortController>();
  const taskIds = new Map<string, string>(); // convId → backend taskId（用于 abort）
  const taskEventCounts = new Map<string, number>(); // taskId → 已收到的**最后一个事件的 seq**（重连时作为 since）
  // app_open_window 已处理过的 eventId（跨重连去重：任务事件重连会重放，不去重会弹两次窗口）
  const openedWindowEventIds = new Set<string>();

  /**
   * 跨重连的**流内状态**（2026-10-08）。
   *
   * ★★★ 为什么必须外提：此前这些状态全是 `subscribeTaskWs`（原 subscribeTaskSse）的**函数内局部变量** ——
   *   每次重连都新建一套，于是：
   *   ① `executedToolCallIds` 重置 → 服务端重放同一 `tool:execute` 会被**再执行一次**
   *      （同一动作在页面上做两遍；浏览器点击重复提交、文件重复上传）；
   *   ② `assistantMsgId` 重置 → 重连后 `message:updated` 找不到目标消息，流式正文丢失；
   *   ③ `subAgentMsgIds` 重置 → 子智能体 token 流合流进错误的（或新建的）消息；
   *   ④ `chunkBuffer` / `flushTimer` 重置 → 上一段未提交的增量被 `flushNow` 丢在旧闭包里。
   *   重连是**同一条流的续订**，语义上就是同一个会话的延续 → 状态必须跟着 taskId 走。
   *
   * ★ 按 taskId 分桶（而非 convId）：同一会话可以先后跑多个任务，旧任务的残留不得
   *   污染新任务；且 `since` 游标本就是按 taskId 记的（`taskEventCounts`），口径一致。
   * ★ 清理时机：任务进入终态（`task:completed` / `aborted` / `error`）与用户主动 stop 时删除，
   *   避免长期运行积累死键。
   */
  interface SseStreamState {
    assistantMsgId: string;
    subAgentMsgIds: Map<string, string>;
    executedToolCallIds: Set<string>;
    chunkBuffer: Map<string, { content: string; reasoning: string }>;
    flushTimer: ReturnType<typeof setTimeout> | null;
  }
  const sseStreamStates = new Map<string, SseStreamState>();
  function streamStateOf(taskId: string): SseStreamState {
    let st = sseStreamStates.get(taskId);
    if (!st) {
      st = {
        assistantMsgId: '',
        subAgentMsgIds: new Map(),
        executedToolCallIds: new Set(),
        chunkBuffer: new Map(),
        flushTimer: null,
      };
      sseStreamStates.set(taskId, st);
    }
    return st;
  }
  function dropStreamState(taskId: string) {
    const st = sseStreamStates.get(taskId);
    if (st?.flushTimer !== null && st?.flushTimer !== undefined) clearTimeout(st.flushTimer);
    sseStreamStates.delete(taskId);
  }
  /** 子智能体消息复合键：同一 agent 可以有两个后台并行任务（P2-6 async call_agent），
   *  只按 subAgentId 存会让两路 token 流合流进同一条消息。 */
  const subAgentKeyOf = (subAgentId: string, parentToolCallId?: string | null) => `${parentToolCallId || ''}::${subAgentId}`;

  // 单库收敛：数据面恒走后端（与 auth.useServerApi 一致）。后端 authMiddleware 本地模式已屏蔽鉴权，
  // 无 token 也回退 guest 放行，故前端登录态不影响数据归属。本地 adapter.db 分支已废弃。
  const isServerMode = () => useAuthStore().useServerApi; // 恒 true

  function activeAgent() {
    const agentStore = useAgentStore();
    return agentStore.selectedAgent;
  }

  function activeAgentId() {
    const agentStore = useAgentStore();
    return agentStore.selectedId;
  }

  // 上一次成功加载会话列表时的模式（loadConversations 失败时判断能否保留现有列表，防串模式）
  let conversationsLoadedMode: string | null = null;

  /**
 * 加载会话列表。
 *
 * ★ 按**当前模式**过滤（用户拍板 2026-09-18）：会话是分模式隔离的，
 * 工作流模式不该看到办公/开发的会话。过滤条件下推到后端（SQL 层），
 * 不是前端"看不见"——前端过滤仍会把别的模式的会话带进批量删除/计数这类循环。
 *
 * 读的是 `activeMode` 的**当前值**而不是缓存的快照：切模式后 App.vue 会重新调用本函数，
 * 若这里捕获的是旧模式，列表会串。
 */
async function loadConversations(scope: 'active' | 'archived' | 'trashed' | 'all' = 'active') {
    const mode = activeMode.value;
    if (isServerMode()) {
      // ★ 2026-10-09 改走 getWithRetry + 失败不清空：更新安装后首启竞态下，
      //   单发请求失败会把会话列表洗成 [] ——「记录忽有忽无」的直接来源。
      //   重试窗口（~10.5s）覆盖后端 seed/迁移冷启；仍失败则保留现有列表等下次刷新。
      // ★ scope（2026-10-16）：默认 active = 只拿正常会话。归档/回收站由专门的
      //   loadLifecycle 拉取（不进 conversations 主数组，否则主列表会串）。
      // ★ excludeSource（2026-10-16）：默认把浏览器页面对话排除在外（见 showPageConvs 的说明）。
      //   过滤必须下推到后端：前端过滤只是"看不见"，批量删除/计数这类扫全量的逻辑仍会扫到。
      const q = new URLSearchParams({ mode, scope });
      if (!showPageConvs.value) q.set('excludeSource', CONV_SOURCE_BROWSER_PAGE);
      const r = await getWithRetry<any[]>(`/conversations?${q.toString()}`);
      if ('data' in r && Array.isArray(r.data)) {
        conversations.value = (r.data as any[]).map(rowToConv);
        conversationsLoadedMode = mode; // 成功才记录：失败时仅同模式列表可保留（防串模式）
      } else if (conversationsLoadedMode !== mode) {
        // 失败且现有列表属于别的模式 → 宁可清空也不串模式展示
        conversations.value = [];
      }
      return;
    }
    // 本地（Electron IPC）通道：同样按模式过滤 + 生命周期过滤。
    // 用 COALESCE 兜空值，与后端 GET /conversations 的口径保持一致。
    const adapter = getPlatformAdapter();
    // ★ 生命周期 SQL 与后端 lifecycleClause 严格同口径（拼串变量在下一个常量里，
    //   单一来源）：两边写错任意一处 = 归档/回收站的会话在主列表里"复活"。
    const LOCAL_LIFECYCLE: Record<string, string> = {
      active: 'deleted_at IS NULL AND archived_at IS NULL',
      archived: 'deleted_at IS NULL AND archived_at IS NOT NULL',
      trashed: 'deleted_at IS NOT NULL',
      all: '1=1',
    };
    const rows = await adapter.db.query<any>(
      `SELECT * FROM conversation
       WHERE COALESCE(NULLIF(mode, ''), 'office') = ? AND ${LOCAL_LIFECYCLE[scope] ?? LOCAL_LIFECYCLE.active}
         ${showPageConvs.value ? '' : `AND ${excludeSourceClause(CONV_SOURCE_BROWSER_PAGE)}`}
       ORDER BY pinned DESC, updated_at DESC`,
      [mode],
    );
    conversations.value = rows.map(rowToConv);
  }

  // ═══ 会话生命周期：归档 / 回收站（2026-10-16）══════════════════════════════
  /** 归档 / 取消归档。后端只认 archived 布尔；失败（如已在回收站）会抛错由调用方提示 */
  async function archiveConversation(id: string, archived: boolean) {
    if (isServerMode()) {
      await api.post(`/conversations/${id}/archive`, { archived });
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec(
        'UPDATE conversation SET archived_at = ? WHERE id = ? AND deleted_at IS NULL',
        [archived ? Math.floor(Date.now()) : null, id],
      );
    }
    await loadConversations();
  }

  /**
   * 从回收站恢复。
   * ★ 同时清 archived_at（与服务端 restoreRow 同口径，2026-10-16 缺陷 H2）：
   *   「恢复」的直觉是回到可用状态 —— 归档后删除再恢复的会话必须回主列表，
   *   否则前端提示「已恢复到主列表」而会话实际在归档区，用户会以为丢了。
   */
  async function restoreConversation(id: string) {
    if (isServerMode()) {
      await api.post(`/conversations/${id}/restore`, {});
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE conversation SET deleted_at = NULL, archived_at = NULL WHERE id = ?', [id]);
    }
    await loadConversations();
    await loadLifecycleCounts();
  }

  /** 永久删除（绕过回收站）。真删路径服务端已收口到 conversation-lifecycle.ts；
   *  本地模式只有 message/conversation 两张表（conversation_file 走 FK CASCADE），
   *  内存半边统一走 dropConvRuntime（与删除收口同源，勿再各写一份） */
  async function purgeConversation(id: string) {
    if (isServerMode()) {
      await api.delete(`/conversations/${id}/permanent`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM message WHERE conversation_id = ?', [id]);
      await adapter.db.exec('DELETE FROM conversation WHERE id = ?', [id]);
    }
    dropConvRuntime(id);
    await loadConversations();
    await loadLifecycleCounts();
  }

  /** 清空回收站（永久）。返回删除条数 */
  async function emptyTrash(): Promise<number> {
    let ids: Array<{ id: string }> = [];
    if (isServerMode()) {
      const r = await api.delete<{ removed: number }>('/conversations/trash');
      return ('data' in r && r.data) ? (r.data.removed ?? 0) : 0;
    }
    const adapter = getPlatformAdapter();
    ids = await adapter.db.query<any>('SELECT id FROM conversation WHERE deleted_at IS NOT NULL');
    for (const r of ids) {
      await adapter.db.exec('DELETE FROM message WHERE conversation_id = ?', [r.id]);
      await adapter.db.exec('DELETE FROM conversation WHERE id = ?', [r.id]);
    }
    // ★ 内存半边一个都不能少（2026-10-16 缺陷 H1：此前这里什么都不清）
    for (const r of ids) dropConvRuntime(r.id);
    await loadConversations();
    await loadLifecycleCounts();
    return ids.length;
  }

  /** 一键归档某空间下的全部 active 会话（侧栏空间右键菜单）。返回归档条数 */
  async function archiveAllInSpace(spaceId: string): Promise<number> {
    let n = 0;
    if (isServerMode()) {
      const r = await api.post<{ archived: number }>('/conversations/archive-all', { spaceId });
      n = ('data' in r && r.data) ? (r.data.archived ?? 0) : 0;
    } else {
      const adapter = getPlatformAdapter();
      const res = await adapter.db.exec(
        'UPDATE conversation SET archived_at = ? WHERE space_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
        [Math.floor(Date.now()), spaceId],
      );
      n = (res as any)?.changes ?? 0;
    }
    await loadConversations();
    await loadLifecycleCounts();
    return n;
  }

  /** 侧栏角标：已归档 / 回收站 / 被收起来的页面对话（server 模式走后端计数，本地模式自己数） */
  const lifecycleCounts = ref<{ archived: number; trashed: number; pageSessions: number }>({ archived: 0, trashed: 0, pageSessions: 0 });
  async function loadLifecycleCounts() {
    if (!isServerMode()) {
      const adapter = getPlatformAdapter();
      const rows = await adapter.db.query<any>(
        `SELECT
           SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed,
           SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived,
           SUM(CASE WHEN deleted_at IS NULL AND archived_at IS NULL AND source = '${CONV_SOURCE_BROWSER_PAGE}' THEN 1 ELSE 0 END) AS page_sessions
         FROM conversation`,
      );
      lifecycleCounts.value = {
        archived: Number(rows[0]?.archived || 0),
        trashed: Number(rows[0]?.trashed || 0),
        pageSessions: Number(rows[0]?.page_sessions || 0),
      };
      return;
    }
    try {
      const r = await api.get<{ archived: number; trashed: number; pageSessions?: number }>('/conversations/counts');
      if ('data' in r && r.data) {
        lifecycleCounts.value = {
          archived: r.data.archived ?? 0,
          trashed: r.data.trashed ?? 0,
          pageSessions: r.data.pageSessions ?? 0,
        };
      }
    } catch { /* 计数失败不阻塞主流程 */ }
  }

  /**
   * 按 scope 拉会话列表但**不写入 conversations 主数组**（2026-10-16 归档/回收站用）。
   *
   * ★ 为什么不复用 loadConversations(scope)：那个函数会把 store.conversations
   *   **整体替换**（切模式时正是靠它防串模式）。归档/回收站如果也往里写，
   *   主列表、批量选择、导出这些"扫全量"的逻辑立刻就会看到它们 —— 归档的意义就没了。
   *   （同一个坑在候选池下拉上真实发生过：共享缓存被单实体加载整体替换。）
   */
  async function loadConversationsByScope(scope: 'archived' | 'trashed' | 'all'): Promise<Conversation[]> {
    const mode = activeMode.value;
    if (isServerMode()) {
      const r = await getWithRetry<any[]>(`/conversations?mode=${encodeURIComponent(mode)}&scope=${scope}`);
      return 'data' in r && Array.isArray(r.data) ? (r.data as any[]).map(rowToConv) : [];
    }
    const adapter = getPlatformAdapter();
    const LOCAL_LIFECYCLE: Record<string, string> = {
      archived: 'deleted_at IS NULL AND archived_at IS NOT NULL',
      trashed: 'deleted_at IS NOT NULL',
      all: '1=1',
    };
    const rows = await adapter.db.query<any>(
      `SELECT * FROM conversation
       WHERE COALESCE(NULLIF(mode, ''), 'office') = ? AND ${LOCAL_LIFECYCLE[scope] ?? LOCAL_LIFECYCLE.all}
       ORDER BY updated_at DESC`,
      [mode],
    );
    return rows.map(rowToConv);
  }

  // ═══ 历史消息懒加载（2026-10-11，治"403 条消息全量拉取拖死渲染"主链路）═══
  // 首次打开会话只拉最近 N 条；更早的历史靠顶部哨兵触发 loadMoreHistory 向前翻页。
  const HISTORY_PAGE_SIZE = 50;
  /** 每会话翻页状态：hasMore=是否还有更早历史；loading=去重并发；cursor=向前翻页游标 */
  const historyPagingByConv = ref<Record<string, { hasMore: boolean; loading: boolean; cursor: { createdAt: number; id: string } | null }>>({});
  function historyPagingOf(convId: string) {
    let p = historyPagingByConv.value[convId];
    if (!p) {
      p = { hasMore: false, loading: false, cursor: null };
      historyPagingByConv.value[convId] = p;
    }
    return p;
  }
  /** 会话删除时清理翻页状态（与 messagesByConv 同生命周期） */
  function clearHistoryPaging(convId: string) {
    delete historyPagingByConv.value[convId];
  }

  /** 非当前会话的消息驻留上限（B2，2026-10-13，内存治理）。
   *  后台会话的消息数组只保留尾部这么多条：流式期间消息照常追加（SSE 在写尾部，
   *  裁剪只丢头部旧条目），切回去时再按需向前翻页（loadMoreHistory）补。
   *  ★ 只在"切走"时裁 —— 当前会话不裁（视图正渲染它，裁了会闪）。 */
  const MESSAGE_RESIDENCY_LIMIT = 200;
  /** 当前会话的消息驻留上限（2026-10-19，修「长会话把渲染进程主线程压死」）。
   *  实测：同一会话开了一整天、累积 1423 条消息（18 轮）后，流式 flush 每 160ms
   *  重算/重渲整棵列表，渲染进程主线程被占死（CDP Runtime.evaluate 8s 无响应），
   *  而抖音 webview 仍正常 —— 说明卡的是应用聊天 UI，不是目标网页。
   *  这里只裁**内存**数组头部；更早历史仍可从服务端翻页（hasMore=true）。
   *  ★ 只在用户位于底部时裁：正在向上翻历史时裁剪会把他正在读的内容抽走。 */
  const CURRENT_MESSAGE_RESIDENCY_LIMIT = 600;
  let chatAtBottom = true;
  function setChatAtBottom(v: boolean): void {
    chatAtBottom = v;
  }
  function trimCurrentResidency(convId: string): void {
    // 只裁"当前正在看的会话"；后台会话由 pruneMessageResidency 在切走时裁到 200 条
    if (convId !== currentConvId.value) return;
    if (!chatAtBottom) return;
    const arr = messagesByConv.value[convId];
    if (!arr || arr.length <= CURRENT_MESSAGE_RESIDENCY_LIMIT) return;
    messagesByConv.value[convId] = arr.slice(arr.length - CURRENT_MESSAGE_RESIDENCY_LIMIT);
    historyPagingOf(convId).hasMore = true;
  }
  function pruneMessageResidency(exceptConvId: string) {
    for (const convId of Object.keys(messagesByConv.value)) {
      if (convId === exceptConvId) continue;
      const arr = messagesByConv.value[convId];
      if (arr && arr.length > MESSAGE_RESIDENCY_LIMIT) {
        messagesByConv.value[convId] = arr.slice(arr.length - MESSAGE_RESIDENCY_LIMIT);
        // 裁剪后该会话的 hasMore 置真（头部被丢了，向前翻页才能补回）
        const p = historyPagingOf(convId);
        p.hasMore = true;
      }
    }
  }

  async function loadMessages(convId: string) {
    currentConvId.value = convId;
    // ★ 切会话时裁剪其它会话的驻留消息（B2）：长会话多开时驻留线性膨胀
    //   （实测 5 个会话共 4000+ 条消息对象常驻），裁到尾部 200 条/会话。
    pruneMessageResidency(convId);
    if (isServerMode()) {
      // ★ 2026-10-09 同 loadConversations：失败不清空已加载的历史消息（瞬态失败
      //   把消息洗成空 = 「会话还在、点开记录没了」的表象）。
      // ★ 2026-10-11 改分页首拉：只取最近 N 条（旧全量行为后端保留但前端不再用）。
      //   403 条 / 122K 字符全量灌入是"任务一跑页面就卡死"的主链路之一。
      const p = historyPagingOf(convId);
      const r = await api.get<any[]>(`/conversations/${convId}/messages?limit=${HISTORY_PAGE_SIZE}`);
      if ('data' in r) {
        messagesByConv.value[convId] = (r.data as any[]).map(rowToMsg).map(stripToolResultContent);
        // hasMore / oldestCursor 经 apiFetch 顶层字段透传（见 client.ts），不再是 data 内字段
        p.hasMore = (r as any).hasMore === true;
        p.cursor = (r as any).oldestCursor ?? null;
      } else if (messagesByConv.value[convId] === undefined) {
        messagesByConv.value[convId] = [];
      }
      const conv = conversations.value.find((c) => c.id === convId);
      mountedMcpServers.value = conv?.mcpServerIds || [];
      mcpDisabledTools.value = conv?._mcpDisabledTools ? { ...conv._mcpDisabledTools } : {};
      // 任务计划恢复：DB 里有落盘的计划且内存还没有时（刷新/换设备），还原进度卡片
      if (conv?.taskPlan && !plansByConv.value[convId]) {
        plansByConv.value = { ...plansByConv.value, [convId]: conv.taskPlan };
      }
      mcpToolAliases.value = conv?._mcpToolAliases ? JSON.parse(JSON.stringify(conv._mcpToolAliases)) : {};
      // 回填会话级权限模式（下拉显示与后端拦截以 conversation.permission_mode 为准）；full 并入 all
      permissionMode.value = conv?.permissionMode === 'all' || conv?.permissionMode === 'full' ? 'all'
        : conv?.permissionMode === 'readonly' ? 'readonly' : 'default';
      void reconnectActiveTask(convId);
      return;
    }
    const adapter = getPlatformAdapter();
    // 与服务端对齐：历史还原不携带 system_prompt_snapshot（按需走 GET /messages/:mid/snapshot 或本地直查）
    // ★ 本地（Electron IPC）通道同样只取最近 N 条（与 LIMIT ? 组合的 ORDER BY DESC 取页后前端反转为 ASC）
    const rows = await adapter.db.query<any>(
      'SELECT id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at FROM message WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [convId, HISTORY_PAGE_SIZE],
    );
    const page = rows.slice().reverse();
    messagesByConv.value[convId] = page.map(rowToMsg).map(stripToolResultContent);
    const pLocal = historyPagingOf(convId);
    pLocal.hasMore = rows.length === HISTORY_PAGE_SIZE; // 恰好取满一页才可能有更多（本地无游标探测，够用）
    pLocal.cursor = page.length > 0 ? { createdAt: page[0].created_at, id: page[0].id } : null;
    const conv = conversations.value.find((c) => c.id === convId);
    mountedMcpServers.value = conv?.mcpServerIds || [];
    mcpDisabledTools.value = conv?._mcpDisabledTools ? { ...conv._mcpDisabledTools } : {};
    mcpToolAliases.value = conv?._mcpToolAliases ? JSON.parse(JSON.stringify(conv._mcpToolAliases)) : {};
    // full 并入 all（语义重复，存量 full 会话读到即迁移）
    permissionMode.value = conv?.permissionMode === 'all' || conv?.permissionMode === 'full' ? 'all'
      : conv?.permissionMode === 'readonly' ? 'readonly' : 'default';
  }

  /**
   * 向前翻页加载更早的历史消息（prepend 到已有消息头部）。
   *
   * ★ 调用方：ChatMessageList 顶部哨兵（IntersectionObserver）。去重三闸门：
   *   hasMore=false（翻到底）/ loading=true（翻页进行中）/ cursor=null（无游标可翻）。
   */
  async function loadMoreHistory(convId: string): Promise<void> {
    if (!convId) return;
    const p = historyPagingOf(convId);
    if (!p.hasMore || p.loading || !p.cursor) return;
    p.loading = true;
    try {
      if (isServerMode()) {
        const q = `limit=${HISTORY_PAGE_SIZE}&before=${p.cursor.createdAt}&beforeId=${encodeURIComponent(p.cursor.id)}`;
        const r = await api.get<any[]>(`/conversations/${convId}/messages?${q}`);
        if ('data' in r && Array.isArray(r.data) && r.data.length > 0) {
          const older = (r.data as any[]).map(rowToMsg).map(stripToolResultContent);
          const cur = messagesByConv.value[convId];
          if (cur) messagesByConv.value[convId] = [...older, ...cur];
          p.hasMore = (r as any).hasMore === true;
          p.cursor = (r as any).oldestCursor ?? null;
        } else {
          p.hasMore = false; // 空页 = 到底（防哨兵反复打接口）
        }
        return;
      }
      const adapter = getPlatformAdapter();
      const rows = await adapter.db.query<any>(
        'SELECT id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at FROM message WHERE conversation_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?',
        [convId, p.cursor.createdAt, p.cursor.createdAt, p.cursor.id, HISTORY_PAGE_SIZE],
      );
      if (rows.length > 0) {
        const older = rows.slice().reverse().map(rowToMsg).map(stripToolResultContent);
        const cur = messagesByConv.value[convId];
        if (cur) messagesByConv.value[convId] = [...older, ...cur];
        const first = older[0];
        p.cursor = first ? { createdAt: (first as any).created_at, id: first.id } : null;
        p.hasMore = rows.length === HISTORY_PAGE_SIZE;
      } else {
        p.hasMore = false;
      }
    } finally {
      p.loading = false;
    }
  }

  /** 按需拉取单条工具回执正文（2026-10-20 懒加载）。写入对应 role='tool' 消息的 content，
   *  触发 messageRounds / toolResultIndex 重算，工具卡片随即展示。幂等：content 已非空则直接返回。 */
  async function fetchToolResult(convId: string, toolCallId: string): Promise<void> {
    if (!convId || !toolCallId) return;
    const arr = messagesByConv.value[convId];
    if (!arr) return;
    const existing = arr.find((m) => m.role === 'tool' && m.toolCallId === toolCallId);
    if (!existing || existing.content) return;
    let content = '';
    try {
      if (isServerMode()) {
        const r = await api.get<{ toolCallId: string; content: string }>(`/conversations/${convId}/tool-result/${toolCallId}`);
        if ('data' in r && r.data) content = r.data.content || '';
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>(
          'SELECT content FROM message WHERE conversation_id = ? AND tool_call_id = ? AND role = ? ORDER BY created_at ASC, id ASC LIMIT 1',
          [convId, toolCallId, 'tool'],
        );
        if (rows.length) content = rows[0].content || '';
      }
    } catch { /* 拉取失败保持空，用户可再点 */ }
    if (!content) return;
    const target = messagesByConv.value[convId]?.find((m) => m.role === 'tool' && m.toolCallId === toolCallId);
    if (target && !target.content) target.content = content;
  }

  async function createConversation(title: string, opts?: { platformId?: string; modelId?: string; skillIds?: string[]; spaceId?: string; agentId?: string; taskType?: string | null; source?: string; sourceMeta?: { url?: string; host?: string; scope?: string } }): Promise<string> {
    // 未显式指定时记录当前选中的智能体，保证会话打开时能还原
    let agentId = opts?.agentId;
    if (!agentId) {
      try {
        const { useAgentStore } = await import('./agent');
        const agentStore = useAgentStore();
        agentId = agentStore.selectedId || agentStore.selectedAgent?.id || undefined;
      } catch { /* agent store 未加载则忽略 */ }
    }
    // 默认挂到当前选中的空间（null 表示"全部"则不归类，即 spaceId=null）
    let spaceId = opts?.spaceId;
    if (spaceId === undefined) {
      try {
        const { useSpaceStore } = await import('./space');
        spaceId = useSpaceStore().currentSpaceId ?? undefined;
      } catch { /* space store 未加载则忽略 */ }
    }
    if (isServerMode()) {
      const r = await api.post<any>('/conversations', {
        title, platformId: opts?.platformId, modelId: opts?.modelId,
        skillIds: opts?.skillIds || [], spaceId: spaceId || null,
        agentId: agentId || null,
        permissionMode: permissionMode.value,
        // 归属模式：会话按模式隔离，建的时候定归属（之后不可改）
        mode: activeMode.value,
        // 任务级任务类型（「父任务」层）：多任务目录里本条任务选的子线
        taskType: opts?.taskType || null,
        // 来源标记（2026-10-16）：只有页面对话会传；不传 = 普通会话（服务端落 NULL）
        source: opts?.source,
        sourceMeta: opts?.sourceMeta,
      });
      if ('data' in r) {
        const row = r.data as any;
        const conv = rowToConv(row);
        conversations.value.unshift(conv);
        return conv.id;
      }
      throw new Error('创建会话失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('c_');
    const ts = Date.now();
    const skillIdsJson = JSON.stringify(opts?.skillIds || []);
    await adapter.db.exec(
      'INSERT INTO conversation (id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, mode, task_type, source, source_meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, agentId || null, opts?.platformId || null, opts?.modelId || null, spaceId || null, '[]', skillIdsJson, 0, activeMode.value, opts?.taskType || null,
        opts?.source || null, opts?.sourceMeta ? JSON.stringify(opts.sourceMeta) : null, ts, ts],
    );
    await loadConversations();
    return id;
  }

  async function updateConversation(id: string, patch: Partial<Conversation>) {
    if (isServerMode()) {
      const body: any = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.platformId !== undefined) body.platformId = patch.platformId;
      if (patch.modelId !== undefined) body.modelId = patch.modelId;
      if (patch.pinned !== undefined) body.pinned = patch.pinned;
      if (patch.mcpServerIds !== undefined) body.mcpServerIds = patch.mcpServerIds;
      if (patch._mcpDisabledTools !== undefined) body.mcpDisabledTools = patch._mcpDisabledTools;
      if (patch.skillIds !== undefined) body.skillIds = patch.skillIds;
      if (patch.builtinToolIds !== undefined) body.builtinToolIds = patch.builtinToolIds;
      if (patch.systemPrompt !== undefined) body.systemPrompt = patch.systemPrompt;
      if (patch.agentId !== undefined) body.agentId = patch.agentId;
      if (patch.spaceId !== undefined) body.spaceId = patch.spaceId || null;
      // 任务级任务类型（「父任务」层）：给本条任务换一条子线；null = 清掉，回落跟随目录
      if (patch.taskType !== undefined) body.taskType = patch.taskType || null;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/conversations/${id}`, body);
      await loadConversations();
      return;
    }
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title); }
    if (patch.platformId !== undefined) { sets.push('platform_id = ?'); params.push(patch.platformId); }
    if (patch.modelId !== undefined) { sets.push('model_id = ?'); params.push(patch.modelId); }
    if (patch.pinned !== undefined) { sets.push('pinned = ?'); params.push(patch.pinned ? 1 : 0); }
    if (patch.spaceId !== undefined) { sets.push('space_id = ?'); params.push(patch.spaceId || null); }
    if (patch.taskType !== undefined) { sets.push('task_type = ?'); params.push(patch.taskType || null); }
    if (patch.mcpServerIds !== undefined || patch._mcpDisabledTools !== undefined || patch._mcpToolAliases !== undefined) {
      const serverIds = patch.mcpServerIds ?? mountedMcpServers.value;
      const disabled = patch._mcpDisabledTools ?? mcpDisabledTools.value;
      const aliases = patch._mcpToolAliases ?? mcpToolAliases.value;
      const serversJson = serverIds.map(sid => ({
        serverId: sid,
        disabledTools: disabled[sid] || [],
        aliases: aliases[sid] || {},
      }));
      sets.push('mcp_servers_json = ?');
      params.push(JSON.stringify(serversJson));
    }
    if (patch.skillIds !== undefined) { sets.push('skill_ids_json = ?'); params.push(JSON.stringify(patch.skillIds)); }
    if (patch.systemPrompt !== undefined) { sets.push('system_prompt = ?'); params.push(patch.systemPrompt); }
    if (patch.agentId !== undefined) { sets.push('agent_id = ?'); params.push(patch.agentId || null); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now()));
    params.push(id);
    await adapter.db.exec(`UPDATE conversation SET ${sets.join(', ')} WHERE id = ?`, params);
    await loadConversations();
  }

  /**
   * 抹掉一个会话的**全部内存态**（删除收口的内存半边，2026-10-16 缺陷 H1）。
   * ★ DB 半边：服务端收口在 conversation-lifecycle.ts；本地只有 message/conversation 两张表
   *   （conversation_file 有 FK CASCADE）。内存半边此前只有 deleteConversations 清全了，
   *   purge/emptyTrash 都漏 —— browserOpChains 留着已抹会话的串行链、currentConvId 指向幽灵会话。
   * ★ 任何「会话从列表里消失」的路径（软删/真删/清空回收站）都必须走这里，新增内存键也要补进来。
   */
  function dropConvRuntime(id: string) {
    if (currentConvId.value === id) currentConvId.value = '';
    delete messagesByConv.value[id];
    delete queuedByConv.value[id];
    clearHistoryPaging(id);
    plansByConv.value = removePlan(plansByConv.value, id);
    // 浏览器操作串行链同样按会话清（防内存泄漏；进行中的操作不受影响）
    dropBrowserOpChain(browserOpChains, id);
  }

  async function deleteConversation(id: string) {
    // ★ 2026-10-16：删除改为**软删进回收站**（后端同一口径，本地模式同步）。
    //   此前这里是真删 message + conversation，点错一下全部不可恢复。
    if (isServerMode()) {
      await api.delete(`/conversations/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE conversation SET deleted_at = ? WHERE id = ?', [Math.floor(Date.now()), id]);
    }
    dropConvRuntime(id);
    await loadConversations();
    await loadLifecycleCounts();
  }

  async function deleteConversations(ids: string[]) {
    if (ids.length === 0) return;
    // 同上：批量删除 = 批量移入回收站（可在回收站整体恢复）
    if (isServerMode()) {
      await Promise.all(ids.map((id) => api.delete(`/conversations/${id}`)));
    } else {
      const adapter = getPlatformAdapter();
      for (const id of ids) {
        await adapter.db.exec('UPDATE conversation SET deleted_at = ? WHERE id = ?', [Math.floor(Date.now()), id]);
      }
    }
    for (const id of ids) dropConvRuntime(id);
    await loadConversations();
    await loadLifecycleCounts();
  }

  async function addMessage(msg: Omit<Message, 'id' | 'createdAt'>): Promise<string> {
    const targetConvId = msg.conversationId || currentConvId.value;
    if (isServerMode()) {
      const r = await api.post<any>(`/conversations/${targetConvId}/messages`, {
        role: msg.role, content: msg.content, toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId, reasoningContent: msg.reasoningContent, tokens: msg.tokens,
        parentToolCallId: msg.parentToolCallId, subAgentId: msg.subAgentId,
        subAgentName: msg.subAgentName, subAgentDepth: msg.subAgentDepth,
      });
      if ('data' in r) {
        const row = r.data as any;
        const m = rowToMsg(row);
        (messagesByConv.value[targetConvId] ||= []).push(m);
        trimCurrentResidency(targetConvId);
        return m.id;
      }
      throw new Error('添加消息失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('msg_');
    const ts = Date.now();
    // 兜底：旧库若未跑完 migration（无新列）或某端 SQL 解析不兼容，INSERT 会抛错打断主对话发送；
    // 落库失败时降级只 push 内存缓存，保证发送流程不中断（与 appendTransientMessage 一致）。
    try {
      await adapter.db.exec(
        'INSERT INTO message (id, conversation_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id, targetConvId, msg.role, msg.content || null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          msg.toolCallId || null, msg.reasoningContent || null,
          msg.systemPromptSnapshot || null,
          msg.tokens || 0,
          msg.parentToolCallId || null, msg.subAgentId || null,
          msg.subAgentName || null, msg.subAgentDepth ?? null,
          ts,
        ],
      );
      // ★ last_activity_at 与 updated_at 同步更新（2026-10-16 缺陷 M4）：
      //   它是自动归档（P2）的「真实对话活动」判据，本地模式漏更会让判据永远停在创建时间。
      await adapter.db.exec('UPDATE conversation SET updated_at = ?, last_activity_at = ? WHERE id = ?', [ts, ts, targetConvId]);
    } catch (e) {
      console.warn('[Chat] addMessage 落库失败，降级仅存内存:', e);
    }
    (messagesByConv.value[targetConvId] ||= []).push({ ...msg, id, createdAt: ts });
    trimCurrentResidency(targetConvId);
    return id;
  }

  /** 乐观添加消息：先 push 到内存（UI 立即显示），再异步落库（不经过 addMessage，避免重复 push）。
   *  返回 { id, dbPromise }：id 是前端临时 ID（内存中用），dbPromise resolve 为后端真实 ID。 */
  function pushMessageOptimistic(msg: Omit<Message, 'id' | 'createdAt'>): { id: string; dbPromise: Promise<string> } {
    const targetConvId = msg.conversationId || currentConvId.value;
    const id = uid('msg_');
    const ts = Date.now();
    (messagesByConv.value[targetConvId] ||= []).push({ ...msg, id, createdAt: ts });
    trimCurrentResidency(targetConvId);
    const dbPromise = (async (): Promise<string> => {
      if (isServerMode()) {
        const r = await api.post<any>(`/conversations/${targetConvId}/messages`, {
          role: msg.role, content: msg.content, toolCalls: msg.toolCalls,
          toolCallId: msg.toolCallId, reasoningContent: msg.reasoningContent, tokens: msg.tokens,
          parentToolCallId: msg.parentToolCallId, subAgentId: msg.subAgentId,
          subAgentName: msg.subAgentName, subAgentDepth: msg.subAgentDepth,
        });
        if ('data' in r) {
          const realId = (r.data as any).id;
          const arr = messagesByConv.value[targetConvId];
          const idx = arr.findIndex(m => m.id === id);
          if (idx >= 0) arr[idx] = { ...arr[idx], id: realId };
          return realId;
        }
        throw new Error('添加消息失败');
      }
      try {
        const adapter = getPlatformAdapter();
        await adapter.db.exec(
          'INSERT INTO message (id, conversation_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id, targetConvId, msg.role, msg.content || null,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            msg.toolCallId || null, msg.reasoningContent || null,
            msg.systemPromptSnapshot || null,
            msg.tokens || 0,
            msg.parentToolCallId || null, msg.subAgentId || null,
            msg.subAgentName || null, msg.subAgentDepth ?? null,
            ts,
          ],
        );
        await adapter.db.exec('UPDATE conversation SET updated_at = ?, last_activity_at = ? WHERE id = ?', [ts, ts, targetConvId]);
      } catch (e) {
        console.warn('[Chat] pushMessageOptimistic 落库失败:', e);
      }
      return id;
    })();
    return { id, dbPromise };
  }

  async function updateMessage(id: string, patch: Partial<Message>) {
    // 定位该消息所在会话缓存并原地更新，支持后台会话并发流式
    const updateInPlace = () => {
      for (const convId of Object.keys(messagesByConv.value)) {
        const arr = messagesByConv.value[convId];
        const idx = arr.findIndex((m) => m.id === id);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...patch };
          return;
        }
      }
    };
    if (isServerMode()) {
      const body: any = {};
      if (patch.content !== undefined) body.content = patch.content;
      if (patch.reasoningContent !== undefined) body.reasoningContent = patch.reasoningContent;
      if (patch.tokens !== undefined) body.tokens = patch.tokens;
      if (patch.toolCalls !== undefined) body.toolCalls = patch.toolCalls;
      if (patch.systemPromptSnapshot !== undefined) body.systemPromptSnapshot = patch.systemPromptSnapshot;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/messages/${id}`, body);
      updateInPlace();
      return;
    }
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.content !== undefined) { sets.push('content = ?'); params.push(patch.content); }
    if (patch.reasoningContent !== undefined) { sets.push('reasoning_content = ?'); params.push(patch.reasoningContent); }
    if (patch.tokens !== undefined) { sets.push('tokens = ?'); params.push(patch.tokens); }
    if (patch.toolCalls !== undefined) { sets.push('tool_calls_json = ?'); params.push(JSON.stringify(patch.toolCalls)); }
    if (patch.systemPromptSnapshot !== undefined) { sets.push('system_prompt_snapshot = ?'); params.push(patch.systemPromptSnapshot); }
    if (sets.length === 0) return;
    params.push(id);
    await adapter.db.exec(`UPDATE message SET ${sets.join(', ')} WHERE id = ?`, params);
    updateInPlace();
  }

  async function deleteMessage(id: string) {
    if (isServerMode()) {
      await api.delete(`/messages/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM message WHERE id = ?', [id]);
    }
    for (const convId of Object.keys(messagesByConv.value)) {
      messagesByConv.value[convId] = messagesByConv.value[convId].filter((m) => m.id !== id);
    }
  }

  function getMergedMounts(): {
    builtinToolIds: string[];
    customToolIds: string[];
    mcpToolMounts: { serverId: string; toolName: string }[];
    skillIds: string[];
    subAgentIds: string[];
  } {
    const agent = activeAgent();
    const conv = conversations.value.find(c => c.id === currentConvId.value);
    const isHarness = !agent || !agent.type || agent.type === 'harness';

    // 智能体挂载（仅 harness）
    const agentBuiltin = isHarness && agent?.builtinToolIds ? agent.builtinToolIds : [];
    const agentCustom = isHarness && agent?.customToolIds ? agent.customToolIds : [];
    const agentMcp = isHarness && agent?.mcpToolMounts ? agent.mcpToolMounts : [];
    const agentSkills = isHarness && agent?.skillIds ? agent.skillIds : [];
    const agentSubs = isHarness && agent?.subAgentIds ? agent.subAgentIds : [];

    // 会话挂载
    const convSkills = conv?.skillIds || [];
    const convMcp: { serverId: string; toolName: string }[] = [];
    for (const sid of mountedMcpServers.value) {
      const disabled = mcpDisabledTools.value[sid] || [];
      const mcpStore = useMcpStore();
      const tools = mcpStore.tools[sid] || [];
      for (const t of tools) {
        if (!disabled.includes(t.name)) {
          convMcp.push({ serverId: sid, toolName: t.name });
        }
      }
    }

    // 合并取并集（MCP: agent 中 server "*" 覆盖 conv 的细粒度）
    const mergedMcp: { serverId: string; toolName: string }[] = [...agentMcp];
    const agentStarServers = new Set(agentMcp.filter(m => m.toolName === '*').map(m => m.serverId));
    for (const c of convMcp) {
      if (!agentStarServers.has(c.serverId) &&
          !mergedMcp.some(m => m.serverId === c.serverId && m.toolName === c.toolName)) {
        mergedMcp.push(c);
      }
    }

    return {
      builtinToolIds: [...new Set([...agentBuiltin, ...(conv?.builtinToolIds || [])])],
      // 会话级自定义工具也要并进来（否则 api_conversation_setup 挂上的工具，
      // 前端在解析 custom_ 暴露名时找不到 → 调用被判为"未挂载"）
      customToolIds: [...new Set([...agentCustom, ...(conv?.customToolIds || [])])],
      mcpToolMounts: mergedMcp,
      skillIds: [...new Set([...agentSkills, ...convSkills])],
      subAgentIds: [...new Set([...agentSubs])],
    };
  }

  // ============ 工具命名与分发（A 组重构：内置裸名 / MCP shortId / 自定义 id 化） ============

  // 保留前缀：内置工具裸名不得以此开头，避免与 MCP/自定义工具路由冲突
  const MCP_PREFIX = 'mcp_';
  const CUSTOM_PREFIX = 'custom_';

  /** MCP serverId → 8 位 shortId：去掉 mcp_ 前缀后取前 8 个字母数字。
   *  desktop 用 uid('mcp_') 生成 mcp_xxxxxxxx；server 用 uuid() 生成 UUID，
   *  两种格式统一处理，修复旧代码 mcp_mcp_ 双前缀问题（A3）。 */
  function mcpShortIdOf(serverId: string): string {
    const base = serverId.startsWith('mcp_') ? serverId.slice(4) : serverId;
    return base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  }

  /** 构建 shortId→serverId 精确映射表：仅当某 shortId 唯一对应一个 serverId 时才登记，
   *  避免前缀碰撞导致工具调用误路由到错误的服务（A3 精确映射）。 */
  function buildMcpShortIdMap(): Map<string, string> {
    const groups = new Map<string, string[]>();
    for (const sid of mountedMcpServers.value) {
      const shortId = mcpShortIdOf(sid);
      if (!shortId) continue;
      if (!groups.has(shortId)) groups.set(shortId, []);
      groups.get(shortId)!.push(sid);
    }
    const result = new Map<string, string>();
    for (const [shortId, sids] of groups) {
      if (sids.length === 1) result.set(shortId, sids[0]); // 仅唯一时精确映射
    }
    return result;
  }

  /** 自定义工具暴露名：custom_{id前8位}_{name}，按 id 反查分发，避免裸 name 与内置/MCP 重名（A2） */
  function customToolExposedName(id: string, name: string): string {
    const idTag = (id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `${CUSTOM_PREFIX}${idTag}_${name}`;
  }

  /** 解析 MCP 工具暴露名 → { serverId, toolName } | null（shortId→serverId 精确映射 + 工具存在性校验） */
  function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
    const m = fullName.match(/^mcp_([a-zA-Z0-9]{1,8})__(.+)$/);
    if (!m) return null;
    const shortId = m[1];
    const toolName = m[2];
    const serverId = buildMcpShortIdMap().get(shortId);
    if (!serverId) return null;
    const mcpStore = useMcpStore();
    const list = mcpStore.tools[serverId] || [];
    if (!list.some(t => t.name === toolName)) return null; // 防止幽灵调用
    return { serverId, toolName };
  }

  /** 解析自定义工具暴露名 → { id, name } | null（精确字符串匹配已挂载工具，无碰撞风险） */
  function parseCustomToolName(fullName: string): { id: string; name: string } | null {
    if (!fullName.startsWith(CUSTOM_PREFIX)) return null;
    const merged = getMergedMounts();
    const toolsStore = useToolsStore();
    for (const id of merged.customToolIds) {
      const ct = toolsStore.customTools.find(t => t.id === id);
      if (!ct) continue;
      if (customToolExposedName(ct.id, ct.name) === fullName) {
        return { id: ct.id, name: ct.name };
      }
    }
    return null;
  }

  /** 把数据浏览契约内嵌到当前会话最后一条助手消息（聊天流程里直接出动态看板） */
  function nestDataViewIntoChat(view: InlineDataView): boolean {
    const convId = currentConvId.value;
    const msgs = convId ? messagesByConv.value[convId] : undefined;
    if (!msgs?.length) return false;
    // 取最后一条 assistant 消息（同一次回复里可先后多次 data_query_view，均挂到最后一条正文消息）
    let target: Message | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        // 优先存在正文或正是正在被渲染的那条（含流式中）；避免附到纯推理/空 content 中转
        target = msgs[i];
        break;
      }
    }
    // 若没有 assistant，仍给用户消息后的首个空 slot 兜底——正常至少有一条 assistant
    if (!target) return false;
    // 复用已有 dataView（一个消息同源多列合约少见，直接覆盖为最新）
    target.dataView = { ...target.dataView, ...view };
    return true;
  }

  /** data_query_view：把模型产出的数据浏览契约【内嵌到当前聊天流程的助手消息】出动态看板。
   *  取数完全由 DataQueryWorkbench 内 /run 参数化完成，不经大模型。 */
  async function openDataViewFromArgs(args: unknown): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const a = (args || {}) as Record<string, unknown>;
    const table = typeof a.table === 'string' && a.table.trim() ? a.table.trim() : undefined;
    const base = typeof a.base === 'string' && a.base.trim() ? a.base.trim() : undefined;
    if (!table && !base) {
      return { ok: false, msg: 'data_query_view 需要 table（表名）或 base（只读 SQL）之一。取数后端参数化执行，不改此处猜数据。' };
    }
    const contract: DataTabContract = {
      datasourceId: (typeof a.datasourceId === 'string' && a.datasourceId.trim()) ? a.datasourceId.trim() : undefined,
      table,
      base,
      title: (typeof a.title === 'string' && a.title.trim()) ? a.title.trim() : (table || '数据浏览'),
      filterCols: Array.isArray(a.filterCols) ? (a.filterCols as unknown[]).filter((c): c is string => typeof c === 'string') : undefined,
    };
    const dsInfo = (typeof a.datasourceId === 'string' && a.datasourceId.trim()) ? `（数据源 ${a.datasourceId}）` : '';
    // 优先内嵌到聊天流程（用户对「动态看板」的定位）：消息区直接出现可交互看板
    if (nestDataViewIntoChat(contract)) {
      return { ok: true, result: `已在本条回复内嵌数据看板：${contract.title || table}${dsInfo}。可直接翻页/加过滤器/切表格·折线·柱·饼，全程参数化，不经大模型。` };
    }
    // 兜底：无助手消息上下文时开右栏数据面板
    openTab({ kind: 'data', name: contract.title || '数据浏览', contract });
    return { ok: true, result: `已在数据浏览面板打开：${contract.title}${table ? `（表 ${table}）` : ''}${dsInfo}。可在此翻页、加过滤器、切表格/折线/柱/饼。` };
  }

  /** 统一工具调用分发（A4 分发顺序）：
   *  1) mcp_{shortId}__{toolName} → MCP callTool
   *  2) custom_{idTag}_{name}     → 服务端沙箱 /api/tools/:id/execute（沙箱依赖 node:vm，仅服务端可用）
   *  3) 裸名                       → ToolRegistry.execute（内置工具，经平台适配器执行）
   *  重名不误路由：三类前缀互斥，裸名不得以 mcp_/custom_ 开头。 */
  /**
 * 工具分发入口。**browser_\* 本会话内串行**（2026-10-09），其余工具直通：
 * 把 `dispatchToolCall` 的实现体整体收进 `dispatchToolCallInner`，本函数只做一层
 * 「会话级串行锁」包装 —— 零改动内部 30+ 个 return 点，也避免将来漏包某个分支。
 */
async function dispatchToolCall(fullName: string, args: unknown, ctx?: { parentToolCallId?: string; depth?: number; convId?: string }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  if (fullName.startsWith('browser_')) {
    return serializeBrowserOp(ctx?.convId, () => dispatchToolCallInner(fullName, args, ctx));
  }
  return dispatchToolCallInner(fullName, args, ctx);
}

async function dispatchToolCallInner(fullName: string, args: unknown, ctx?: { parentToolCallId?: string; depth?: number; convId?: string }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const mcpStore = useMcpStore();
    const registry = getToolRegistry();

    // 0) 越界访问授权卡（2026-10-01）—— 服务端 path-guard 判定越界后下发，等用户点头才放行。
    //    ★ 放在最前：它不是真工具（registry 里没有），也不该被 MCP/自定义前缀逻辑碰到。
    //    ★ 返回 JSON `{decision}`：服务端 parsePathAuthResult 优先按 JSON 解析（文本兜底兼容老形态）。
    if (fullName === '_path_authorize') {
      const raw = (args || {}) as Record<string, unknown>;
      const items = Array.isArray(raw.items)
        ? (raw.items as Record<string, unknown>[]).map((it) => ({
            action: (String(it.action) === 'write' ? 'write' : 'read') as 'read' | 'write',
            rawPath: String(it.rawPath || ''),
            absPath: String(it.absPath || ''),
            // 命令类执行目录：cwdInside 只在服务端判定得出时才有（相对/未指定 → undefined）
            cwd: typeof it.cwd === 'string' ? it.cwd : undefined,
            cwdInside: typeof it.cwdInside === 'boolean' ? it.cwdInside : undefined,
            cwdExplicit: typeof it.cwdExplicit === 'boolean' ? it.cwdExplicit : undefined,
          }))
        : [];
      if (items.length === 0) return { ok: true, result: JSON.stringify({ decision: 'deny' }) };
      const authSignal = abortControllers.get(currentConvId.value || '')?.signal;
      return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
        if (authSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
        const onAuthAbort = () => {
          authSignal?.removeEventListener('abort', onAuthAbort);
          pendingPathAuth.value = null;
          resolve({ ok: false, msg: '用户已终止' });
        };
        authSignal?.addEventListener('abort', onAuthAbort);
        pendingPathAuth.value = {
          toolName: String(raw.toolName || ''),
          isCommand: !!raw.isCommand,
          dangerWhy: String(raw.dangerWhy || '') || undefined,
          workspaceDir: String(raw.workspaceDir || ''),
          items,
          resolve: (decision) => {
            authSignal?.removeEventListener('abort', onAuthAbort);
            pendingPathAuth.value = null;
            resolve({ ok: true, result: JSON.stringify({ decision }) });
          },
        };
      });
    }

    // 0.5) 只读会话工具授权卡（2026-10-18 授权制）—— 服务端只读权限闸命中写类工具后下发，
    //      等用户批准才放行执行。返回 JSON `{decision: 'allow'|'deny'}`，服务端 parseToolAuthResult 解析。
    if (fullName === '_tool_authorize') {
      const raw = (args || {}) as Record<string, unknown>;
      const toolName = String(raw.toolName || '');
      if (!toolName) return { ok: true, result: JSON.stringify({ decision: 'deny' }) };
      const authSignal = abortControllers.get(currentConvId.value || '')?.signal;
      return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
        if (authSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
        const onAuthAbort = () => {
          authSignal?.removeEventListener('abort', onAuthAbort);
          pendingToolAuth.value = null;
          resolve({ ok: false, msg: '用户已终止' });
        };
        authSignal?.addEventListener('abort', onAuthAbort);
        pendingToolAuth.value = {
          toolName,
          argsPreview: String(raw.argsPreview || ''),
          resolve: (decision) => {
            authSignal?.removeEventListener('abort', onAuthAbort);
            pendingToolAuth.value = null;
            resolve({ ok: true, result: JSON.stringify({ decision }) });
          },
        };
      });
    }

    // 1) MCP 工具
    if (fullName.startsWith(MCP_PREFIX) && fullName.includes('__')) {
      const parsed = parseMcpToolName(fullName);
      if (!parsed) return { ok: false, msg: '无法解析 MCP 工具或工具不存在: ' + fullName };
      // 人机交互类 MCP 工具路由到内置拦截：ask_user/confirm_user 需在前端等待用户回答，不能直接调服务端
      if (parsed.toolName === 'ask_user' || parsed.toolName === 'confirm_user') {
        return dispatchToolCall(parsed.toolName, args, ctx);
      }
      return mcpStore.callTool(parsed.serverId, parsed.toolName, args);
    }

    // 1.5) 桌面录屏（2026-10-17）：screen_record 由服务端委托前端执行（主进程 capturePage+ffmpeg）。
    //      必须在 registry 分支之前拦截 —— registry 里注册的是占位实现，直接执行会返回占位文本。
    if (fullName === 'screen_record') {
      const electron = (window as any).electronAPI;
      if (!electron?.screenRecord) {
        return { ok: false, msg: '当前环境不支持录屏（仅桌面端可用）' };
      }
      const a = (args || {}) as Record<string, unknown>;
      const action = String(a.action || 'start');
      try {
        const r = action === 'stop'
          ? await electron.screenRecord.stop({ recordId: String(a.recordId || '') })
          : await electron.screenRecord.start({
              outPath: String(a.outPath || ''),
              target: String(a.target || ''),
              fps: Number(a.fps) || undefined,
            });
        if (!r?.ok) return { ok: false, msg: r?.error || '录屏失败' };
        const text = action === 'stop'
          ? `录屏完成。\n文件：${r.outPath}\n时长：${Math.round((r.durationMs || 0) / 100) / 10}s，帧数：${r.frames || 0}`
          : `录屏已开始。\nrecordId=${r.recordId}\n产物路径：${r.outPath}\n（停止时传 action="stop" + recordId）`;
        return { ok: true, result: text };
      } catch (e: any) {
        return { ok: false, msg: `录屏失败: ${e?.message || e}` };
      }
    }

    // 2) 内置工具裸名（经 ToolRegistry + 平台适配器执行）
    // 注意：custom_/call_agent/list_sub_agents 已由后端直接执行，不再委托前端
    if (registry.has(fullName)) {
      if (fullName.startsWith(MCP_PREFIX) || fullName.startsWith(CUSTOM_PREFIX)) {
        return { ok: false, msg: '内置工具名与保留前缀冲突: ' + fullName };
      }
      // E12: 移动端无内置浏览器容器，也不走服务端 Playwright——所有 browser_* 工具统一拦截并提示
      let browserPlatform = 'web';
      try { browserPlatform = getPlatformAdapter().platform; } catch { /* 兜底按 web */ }
      if (browserPlatform === 'mobile' && fullName.startsWith('browser_')) {
        const msgText = `当前平台（移动端）不支持内置浏览器工具 ${fullName}，无法打开/操作网页。请改用 web_search 等方式获取网络信息`;
        pushBrowserStep(fullName, msgText);
        return { ok: false, msg: msgText };
      }
      // B 方案：智能体调 browser_navigate 时，桌面端桥接到预览面板的 BrowserView（共用同一浏览器）。
      // 通过 store.currentBrowserUrl 命令 BrowserPanel 导航，模型打开的页面在预览面板同步显示。
      if (fullName === 'browser_navigate') {
        const isElectronDesktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
        const rawUrl = extractUrlFromArgs(args);
        if (isElectronDesktop) {
          if (!rawUrl) return { ok: false, msg: 'browser_navigate 缺少 url 参数' };
          const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
          let host = target;
          try { host = new URL(target).hostname; } catch { /* keep raw */ }
          // openInNewTab：真新建 host 标签页返回 tabId（不再退化成覆盖当前页）
          if ((args as any).openInNewTab === true) {
            let nt: any = null;
            try {
              nt = await (window as any).electronAPI.browserView.action(null, 'new_tab', { url: target });
            } catch { /* ignore */ }
            if (nt && nt.tabId !== undefined) {
              // 新 host 已由主进程广播 tabCreated、渲染层补壳并用 :src=target 拉取页面
              // ★ 记账（2026-10-08）：这条分支是 agent 真新建 tab，收尾时据它判断"还剩几个没收拾"
              markAgentOpenedTab(ctx?.convId || '', nt.tabId);
              const text = `已在新标签页打开。\ntabId=${nt.tabId}\nURL: ${target}\n后续读取该页内容时给 browser_get_page_content / browser_get_page_info 等读取工具传 tabId=${nt.tabId}`;
              pushBrowserStep('browser_navigate(openInNewTab)', text);
              return { ok: true, result: text };
            }
            // 引擎不支持则回退原覆盖导航
          }
          openTab({ kind: 'browser', name: host, url: target });
          // 用预览面板当前显示的 tab 导航（面板未就绪时轮询等待其自建，见 resolvePreviewTabId）。
          // 多会话隔离：按当前任务所属 convId 取 scope，避免与其它会话的浏览器面板互相串台。
          const navTabId = await resolvePreviewTabId(ctx?.convId);
          // 锚定：agent 打开的这个 tab 就是它本次任务的操作目标（后续动作不再受用户切换影响）
          if (ctx?.convId && navTabId) agentAnchoredTabs.set(ctx.convId, navTabId);
          // ★ 记账（2026-10-08）：navigate 若在预览面板自建的 tab 上就地导航，该 tab 同样是
          //   "agent 用过、收尾该考虑收拾"的页 → 一并计入。用户手开的 tab 不会走到这里
          //   （这条路径只在 agent 调 browser_navigate 时执行）。
          markAgentOpenedTab(ctx?.convId || '', navTabId);
          skipNextRecordVisit.value = true;
          try {
            const result = await Promise.race([
              (window as any).electronAPI.browserView.action(navTabId, 'navigate', { url: target }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('IPC 导航超时（20s）')), 20000)),
            ]) as any;
            const ok = !result?.error;
            const text = ok ? `已导航到 ${result.url || target}` : (result?.error || '导航失败');
            pushBrowserStep('browser_navigate', text);
            return { ok, result: text, msg: ok ? undefined : text };
          } catch (e: any) {
            return { ok: false, msg: `IPC 导航失败: ${e?.message || e}` };
          }
        }
        // Web 端走后端 Playwright
        const res = await registry.execute('browser_navigate', args as Record<string, unknown>);
        const text = res.content?.[0]?.text ?? '';
        pushBrowserStep('browser_navigate', text);
        return { ok: !res.isError, result: text, msg: res.isError ? text : undefined };
      }

      // 桌面端其它 browser_* 工具：统一走 browserView:action（25 action，__yzElements 注册表）
      const isElectronDesktopBrowser = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
      if (isElectronDesktopBrowser && fullName.startsWith('browser_')) {
        // browser_* 工具名 → browserView:action action 名（统一通道，废弃 browser:call 的 10-action 子集）
        const actionMap: Record<string, string> = {
          // ★★★ 2026-10-14：补 browser_navigate —— 它是**唯一**有专用分支（上方
          //   `fullName === 'browser_navigate'`）却没进本表的工具。专用分支用的是**严格相等**，
          //   一旦传进来的名字有变体（前后空格 / 大小写 / 前后缀），分支不命中就会掉进本表，
          //   而本表没有它 ⇒ 直落末尾兜底报「未知工具: browser_navigate」（用户实报）。
          //   主进程早已实现该 action（DESKTOP_BROWSER_ACTIONS 含 'navigate'，main.cjs 有
          //   case 'navigate'），补上映射即成为一条可靠的兜底路径，不再死。
          'browser_navigate': 'navigate',
          'browser_get_page_info': 'get_page_info',
          'browser_get_page_content': 'get_page_content',
          'browser_get_dom': 'get_dom',
          'browser_click': 'click',
          'browser_type': 'type',
          'browser_press_key': 'press',
          'browser_screenshot': 'screenshot',
          'browser_get_visible_text': 'get_visible_text',
          'browser_get_text': 'get_text',
          'browser_wait': 'wait',
          'browser_wait_for': 'wait_for',
          'browser_scroll': 'scroll',
          'browser_hover': 'hover',
          'browser_back': 'back',
          'browser_forward': 'forward',
          'browser_reload': 'reload',
          'browser_fill_form': 'fill_form',
          'browser_submit_form': 'submit_form',
          'browser_search': 'search',
          'browser_next_page': 'next_page',
          'browser_prev_page': 'prev_page',
          'browser_select_option': 'select_option',
          'browser_check': 'check',
          'browser_uncheck': 'uncheck',
          'browser_extract_list': 'extract_list',
          // P1-5 代码模式（2026-10-07）：页面上下文执行受限 JS
          'browser_run_script': 'run_script',
          // 文件上传（2026-10-07）：桌面端走 CDP DOM.setFileInputFiles 注入本地文件
          'browser_upload': 'upload',
          // ★★★ B5（2026-10-10）：补齐 11 个**主进程早已实现**但这里漏映射的 action。
          //   ★ 缺口（实测）：主进程 `browserView:action` 实现了 **40 个 action**，而本表只映射 27 个
          //     ⇒ 下面 11 个会落到末尾兜底、报「桌面端暂不支持 XX」——
          //     但它们**在主进程里明明已经实现**（能力在、入口断，属"静默失效"家族）。
          //   ★ 实测差集（主进程 case 列表 vs 本表值）逐项核对得到，非推测。
          'browser_new_tab': 'new_tab',
          'browser_switch_tab': 'switch_tab',
          'browser_close_tab': 'close_tab',
          'browser_get_tabs': 'get_tabs',
          'browser_download': 'download',
          'browser_drag': 'drag',
          'browser_scroll_into_view': 'scroll_into_view',
          'browser_is_visible': 'is_visible',
          'browser_wait_for_request': 'wait_for_request',
          'browser_get_network_log': 'get_network_log',
          'browser_visual_locate': 'visual_locate',
        };
        // ★★★ B5 根治（2026-10-10）：**优先用主进程的能力清单推导**映射，`actionMap` 退为兜底。
        //
        // ★ 为什么（实测缺口）：主进程的 action 分发是 `switch`（无法枚举），而本表是**另一份
        //   硬编码清单** ⇒ 两份必然失同步：实测主进程已实现 40 个 action，本表只映射 27 个 →
        //   11 个**明明已实现**的能力落到兜底、报「桌面端暂不支持 XX」（**能力在、入口断**）。
        // ★ 推导规则：`browser_xxx` → `xxx`（与主进程 case 名逐字对应），仅当
        //   `xxx` 出现在主进程公布的能力清单里才采用 —— 这样"以后主进程新增 action"
        //   前端**自动支持**，不再需要同步两份清单。
        // ★ 拿不到清单时（非桌面端 / 旧 preload）退回 `actionMap`，行为不变。
        let action = actionMap[fullName];
        if (!action && fullName.startsWith('browser_')) {
          const derived = fullName.slice('browser_'.length);
          try {
            const supported: string[] | undefined = await (window as any).electronAPI?.browserView?.actions?.();
            if (Array.isArray(supported) && supported.includes(derived)) action = derived;
          } catch { /* 查询失败 → 退回兜底（不影响既有行为） */ }
        }
        if (action) {
          try {
            const actTabId = await resolvePreviewTabId(ctx?.convId);
            // ★ 2026-10-08：upload/screenshot 放宽竞速窗口到 65s —— 主进程对这两个 action 的总闸
            //   已提到 60s（视频投递后等页面处理）。若这里仍是 20s，会在主进程返回前先判超时，
            //   用户看到"上传不顺"。其它 action 维持 20s（主进程 18s 总闸留 2s 余量）。
            const ipcTimeout = (action === 'upload' || action === 'screenshot') ? 65000 : 20000;
            const result = await Promise.race([
              (window as any).electronAPI.browserView.action(actTabId, action, args),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`IPC 调用超时（${ipcTimeout / 1000}s）: ${action}`)), ipcTimeout)),
            ]) as any;
            // browserView:action 返回 { error } 表示失败，否则成功
            const ok = !result?.error;
            let text = '';
            if (ok) {
              if (action === 'get_page_info') {
                const ic = (result.interactive || []).length;
                text = `页面: ${result.title || result.url}\n可交互元素: ${ic}${ic > 0 ? '\n' + (result.interactive || []).slice(0, 20).map((e: any) => `[${e.index}] ${e.tag}${e.text ? ': ' + e.text : ''}`).join('\n') : ''}`;
              } else if (action === 'get_visible_text' || action === 'get_text') {
                text = result.text || '';
              } else if (action === 'screenshot') {
                // 2026-10-09：main.cjs 截图时已落盘存档，把路径带回 —— 服务端据此
                // 复制进会话产物目录并登记 conversation_file（关键节点归档留证）。
                text = result.file ? `截图已捕获（已存档: ${result.file}）` : '截图已捕获';
              } else if (action === 'get_dom') {
                // 桌面端不把完整 DOM 回传模型（体积大且无必要）。若只回 "DOM 节点数"，
                // 模型会因拿不到链接/文本内容而无限换参重试。给出可行动提示引导改用四件套。
                text = `DOM 节点数: ${result.nodeCount || 0}（桌面端不返回 DOM 明细。请改用 browser_get_page_content 获取页面可见正文与带编号的可交互元素列表，不要用不同 depth/maxNodes 参数重试本工具）`;
              } else if (action === 'get_page_content') {
                // 聚合读页：正文 + 编号元素直接给模型（不截断，否则模型拿不到搜索结果页内容）
                const elems = (result.interactive || []).map((e: any) => {
                  let s = `[${e.index}] ${e.tag}`;
                  if (e.type) s += `[type=${e.type}]`;
                  // P1-7：计算后 ARIA 角色（隐式语义），与 tag 不同才展示
                  if (e.axRole && e.axRole !== e.tag) s += ` [ax:${e.axRole}]`;
                  if (e.ariaLabel) s += ` [aria:${e.ariaLabel}]`;
                  if (e.text) s += ` "${String(e.text).slice(0, 40)}"`;
                  if (e.placeholder) s += ` [ph:${e.placeholder}]`;
                  if (e.href) s += ` →${String(e.href).slice(0, 80)}`;
                  return s;
                }).join('\n');
                text = `URL: ${result.url}\nTitle: ${result.title}\n\n【页面可见文本】\n${result.text || '(空)'}\n\n【可交互元素】(${result.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数)\n${elems}`;
              } else if (action === 'upload') {
                // ★ 2026-10-12（诊断报告 P0-3）：与 server 的 formatBridgeResult 同口径 ——
                //   带上"页面是否回读到该文件"的核验结论，避免模型因无成功证据而反复重传。
                text = result.uploaded
                  ? `已注入本地文件（${result.via || 'cdp'}）: ${result.filePath}${result.inputCount > 1 ? `（页面有 ${result.inputCount} 个 file input，用第一个）` : ''}`
                    + ((result as any).note ? `\n${(result as any).verified === true ? '✔ ' : 'ℹ '}${(result as any).note}` : '')
                  : (result.error || '文件注入失败');
              } else if (action === 'run_script') {
                // P1-5：脚本执行结果 JSON 序列化回给模型（截断 8K）
                let rt = '';
                try { rt = JSON.stringify((result as any).result); } catch { rt = String((result as any).result); }
                if (rt.length > 8000) rt = rt.slice(0, 8000) + `…(截断，原长 ${rt.length})`;
                text = `Executed in page. URL: ${(result as any).url || ''}\nResult: ${rt || '(undefined)'}`;
              } else if (action === 'navigate' || action === 'new_tab') {
                // ★★★ 2026-10-15「导航跑偏」：与 server 的 formatBridgeResult **同口径**新增本分支。
                //   此前 navigate 落末尾的 `JSON.stringify(result).slice(0, 500)` 兜底 —— 长 note
                //   （隐藏态出路、接口地址引导等）会被截断吞掉，而那正是模型最需要的纠偏信息。
                const nr = result as any;
                const parts: string[] = [];
                if (action === 'new_tab' && nr.tabId) parts.push(`已在新标签页打开（tabId=${nr.tabId}）。后续读取该页用读取类工具的 tabId=${nr.tabId}。`);
                if (nr.url) parts.push(`URL: ${nr.url}`);
                if (nr.title) parts.push(`Title: ${nr.title}`);
                if (nr.loading) parts.push('状态: 仍在加载（不是失败——用 browser_wait_for / browser_get_page_content 等待，不要换 URL 重试）。');
                if (nr.visibilityState) parts.push(`页面可见性: ${nr.visibilityState}`);
                if (nr.warning) parts.push(`⚠ ${nr.warning}`);
                if (nr.note) parts.push(nr.note);
                text = parts.length ? parts.join('\n') : JSON.stringify(result).slice(0, 500);
              } else if (action === 'get_tabs') {
                // ★ 同上：标注哪些页可关（agent 打开的）+ 卡死页出路 —— 模型才会真的用 close_tab 清场
                const tabs = Array.isArray((result as any).tabs) ? (result as any).tabs : [];
                const lines = tabs.map((t: any) =>
                  `- tabId=${t.tabId}${t.active ? ' [当前]' : ''} ${t.agentOpened ? '[可关]' : '[用户页·勿关]'} ${t.loading ? '[加载中]' : ''} ${t.title || t.url || '空白'}`);
                const closable = tabs.filter((t: any) => t.agentOpened).map((t: any) => String(t.tabId));
                const hint = closable.length
                  ? `\n\n可用 browser_close_tab({ "tabIds": [${closable.map((id: string) => JSON.stringify(id)).join(', ')}] }) 一次关掉这些 agent 打开的页（任务收尾或页面卡死时清理）。`
                  : '';
                const stuck = tabs.filter((t: any) => t.loading && t.agentOpened).map((t: any) => t.tabId);
                const stuckHint = stuck.length
                  ? `\n⚠ tabId=${stuck.join(', ')} 处于**加载中**：若长时间不变即为卡死页，不要靠反复导航"唤醒"，不需要时用 browser_close_tab 关掉。`
                  : '';
                text = `浏览页 ${tabs.length} 个：\n${lines.join('\n') || '(无)'}${hint}${stuckHint}`;
              } else {
                text = result.success ? `${action} 执行成功` : JSON.stringify(result).slice(0, 500);
              }
            } else {
              text = result?.error || `${action} 执行失败`;
            }
            pushBrowserStep(fullName, text);
            return { ok, result: text, msg: ok ? undefined : text };
          } catch (e: any) {
            return { ok: false, msg: `IPC 调用失败 (${fullName}): ${e?.message || e}` };
          }
        }
        // 未映射的 browser_* 工具：桌面端单一执行面（预览 BrowserView），绝不静默回退
        // 后端 Playwright——那会造成操作与预览两套分裂 + headless 被风控弹验证码。
        return { ok: false, msg: `桌面端暂不支持 ${fullName}。请改用四件套工具：browser_navigate / browser_type / browser_click / browser_get_page_content` };
      }


      // image_analyze 拦截 —— 优先 vision 多模态模型，降级服务端 Tesseract OCR
      if (fullName === 'image_analyze') {
        return runImageAnalyze(args as { path?: string; prompt?: string; platformId?: string; modelId?: string });
      }
      // data_query_view —— 数据分析链路的前端收口：把数据明细/视图开进右侧「数据浏览」面板。
      // 该工具由主智能体/子智能体在“要展示明细数据时可翻页/可切图表”时调用；取数本身由面板内的
      // /api/query-contract/run 按参数化方式完成（不经 LLM）。这里只负责“开面板”，不做数据执行。
      if (fullName === 'data_query_view') {
        return await openDataViewFromArgs(args);
      }
      // E12: ask_user —— 弹出反问对话框，await 用户回答后再继续（暂停 ReAct 循环）
      if (fullName === 'ask_user') {
        const q = String((args as Record<string, unknown>).question || '');
        if (!q) return { ok: false, msg: 'ask_user 缺少 question 参数' };
        const askSignal = abortControllers.get(currentConvId.value || '')?.signal;
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          if (askSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
          const onAskAbort = () => {
            askSignal?.removeEventListener('abort', onAskAbort);
            pendingQuestion.value = null;
            resolve({ ok: false, msg: '用户已终止' });
          };
          askSignal?.addEventListener('abort', onAskAbort);
          pendingQuestion.value = {
            question: q,
            options: Array.isArray((args as Record<string, unknown>).options)
              ? ((args as Record<string, unknown>).options as unknown[]).map(String)
              : undefined,
            multiSelect: !!(args as Record<string, unknown>).multiSelect,
            allowSupplement: (args as Record<string, unknown>).allowSupplement !== false,
            resolve: (answer: string, supplement?: string) => {
              askSignal?.removeEventListener('abort', onAskAbort);
              pendingQuestion.value = null;
              const result = supplement
                ? `${answer}\n\n补充说明：${supplement}`
                : answer;
              resolve({ ok: true, result });
            },
          };
        });
      }
      // E12b: confirm_user —— 多页确认向导，逐页收集回答与补充说明
      if (fullName === 'confirm_user') {
        const rawArgs = args as Record<string, unknown>;
        const rawPages = Array.isArray(rawArgs.pages) ? (rawArgs.pages as Record<string, unknown>[]) : [];
        if (rawPages.length === 0) return { ok: false, msg: 'confirm_user 缺少 pages 参数' };
        const pages: ConfirmationPage[] = rawPages.map((p, index) => {
          const question = String(p.question || '');
          return {
            question,
            description: p.description != null ? String(p.description) : undefined,
            options: Array.isArray(p.options) ? p.options.map(String) : undefined,
            multiSelect: !!p.multiSelect,
            allowText: p.allowText !== false,
            allowSupplement: p.allowSupplement !== false,
            required: !!p.required,
          };
        });
        if (pages.some((p) => !p.question.trim())) {
          return { ok: false, msg: 'confirm_user 每个 page 都必须包含 question' };
        }
        const confirmSignal = abortControllers.get(currentConvId.value || '')?.signal;
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          if (confirmSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
          const onConfirmAbort = () => {
            confirmSignal?.removeEventListener('abort', onConfirmAbort);
            pendingConfirmation.value = null;
            resolve({ ok: false, msg: '用户已终止' });
          };
          confirmSignal?.addEventListener('abort', onConfirmAbort);
          pendingConfirmation.value = {
            title: String(rawArgs.title || '用户确认'),
            pages,
            index: 0,
            answers: [],
            resolve: (result) => {
              confirmSignal?.removeEventListener('abort', onConfirmAbort);
              pendingConfirmation.value = null;
              resolve({ ok: true, result });
            },
          };
        });
      }
      // E12: task_plan —— 创建/替换任务计划，渲染进度卡片
      // 计划写入【发起该任务的会话】而非当前查看的会话：多会话并行时 A 会话的
      // 计划不得跑到 B 会话的卡片里（ctx.convId 由 SSE tool:execute 透传）。
      // ★★★ task_plan / task_step 已**直连化**（2026-10-15）：服务端独占写入（conversation.task_plan_json
      //   + 镜像 plan.md），并通过 `plan:updated`（persisted:true）把新计划推给前端展示。
      //   ⇒ 前端**不再执行**这两个工具（此前那段"本地 apply + PATCH 回写"已删除）。
      //   删掉的理由（实测 conv 7e99207b，同日三次）：委托渲染层意味着每次计划更新都要等它回执，
      //   而渲染层会被长任务周期性堵住（120 秒 1 次、20 秒 2 次）⇒ 模型干等、进度条不动。
      //   现在这条路径不复存在：服务端写完就推，前端只渲染。若这里再看到它们，说明有别的派发路径漏了。
      const res = await registry.execute(fullName, args as Record<string, unknown>);
      const text = res.content?.[0]?.text ?? '';
      // E11: browser_* 工具执行后推送步骤日志到浏览器面板
      if (fullName.startsWith('browser_')) {
        if (ctx?.convId) markBrowserTaskActive(ctx.convId);
        pushBrowserStep(fullName, text);
      }
      return { ok: !res.isError, result: text, msg: res.isError ? text : undefined };
    }

    return { ok: false, msg: '未知工具: ' + fullName };
  }

  /** image_analyze 实际执行：优先 vision 模型，降级服务端 OCR */
  async function runImageAnalyze(args: { path?: string; prompt?: string; platformId?: string; modelId?: string }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    // ★★ 必填校验看**原始入参**，再解析路径（2026-09-30）
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    if (!rawPath) return { ok: false, msg: 'path 为必填项' };
    const prompt = args.prompt || '请详细描述这张图片的内容，包括其中的文字、物体、场景等信息。';

    // ★★★ 相对路径必须基于**工作目录**解析（2026-09-30 修）：
    //   此前直接把模型给的路径交给 fs → 落到进程 cwd → 相对路径一律"图片不存在"。
    //   与 core 侧工具同因（见 packages/core/src/tool/builtin/fs-walk.ts 的 resolveToolPath），
    //   前端这条通道是它在前端的对应实现 —— 两面都要改，否则"换个工具又不行"。
    const workspaceDir = useSettingsStore().settings.workspaceDir || '';
    const imgPath = resolveToolPath(rawPath, workspaceDir);

    const { fs } = getPlatformAdapter();
    const exists = await fs.exists(imgPath).catch(() => false);
    if (!exists) return { ok: false, msg: '图片不存在: ' + imgPath };

    const ext = imgPath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    const mime = mimeMap[ext];
    if (!mime) return { ok: false, msg: `不支持的图片格式 .${ext}（支持 png/jpg/jpeg/gif/webp/bmp）` };

    let base64: string;
    try {
      base64 = await fs.readFileBase64(imgPath);
    } catch (e: any) {
      return { ok: false, msg: '读取图片失败: ' + (e?.message || e) };
    }

    // ★★★ 图片压缩与预算闸（C2，2026-10-09）——此前这里是**原图直发**：
    //   `browser_screenshot` 的整页 PNG 常数 MB → 上游 400（Anthropic 单图 base64 约 5MB）
    //   或一张图吃爆 token。压缩放在**这一处**是因为它是 UI 侧唯一的 vision 入口，
    //   且 `LlmClient.visionAnalyze` 对两种协议共用 —— 改这里覆盖全部调用方。
    //   ★ fail-open：压缩失败一律回退原图（压缩是优化，不能变成"图片用不了"）。
    let sendMime = mime;
    try {
      const { downscaleImageBase64 } = await import('../utils/image-compress');
      const c = await downscaleImageBase64(base64, mime);
      if (c.compressed) {
        console.info(`[image_analyze] 图片压缩: ${(c.originalBytes / 1048576).toFixed(2)}MB → ${(c.resultBytes / 1048576).toFixed(2)}MB (${c.width}x${c.height})`);
        base64 = c.base64;
        sendMime = c.mime;
      }
      if (c.note && c.resultBytes > 0 && c.note.includes('仍超预算')) {
        console.warn('[image_analyze]', c.note);
      }
    } catch (e: any) {
      console.warn('[image_analyze] 压缩流程异常，使用原图:', e?.message || e);
    }

    const { usePlatformStore } = await import('./platform');
    const platformStore = usePlatformStore();

    // 依次尝试多个 vision 候选：capabilities 元数据经常缺标记（多模态模型被误判为纯文本），
    // 所以当前会话模型也要尝试——看图失败会在这里自然降级到下一候选，最终才落 OCR。
    const tried = new Set<string>();
    const attemptVision = async (p: Platform | undefined, m: Model | undefined): Promise<string | null> => {
      if (!p || !m) return null;
      const key = `${p.id}/${m.id}`;
      if (tried.has(key)) return null;
      tried.add(key);
      // ★★★ C3（2026-10-10）：**已探明不支持的直接跳过** —— 此前失败结论不被记住
      //   （`platform.ts` 只写回成功项 `if (r.ok && r.capability)`），于是每次识图都
      //   逐个候选**真发请求**白试一遍（长任务里反复发生，纯浪费）。
      //   ★ 三态语义：`no` = 已探明不支持（跳过）；`unknown` = 允许尝试（默认）。
      //     `no` 有 30 分钟 TTL，到期回到 unknown（防"一次抖动被永久记成不支持"）。
      try {
        const { getVisionCapability, recordVisionAttempt } = await import('../utils/vision-capability');
        if (getVisionCapability(p.id, m.id) === 'no') {
          console.info('[image_analyze] 跳过已探明不支持视觉的候选:', m.modelId);
          return null;
        }
        try {
          const client = new LlmClient(p, m);
          // ★ 必须用 sendMime（压缩后可能是 image/jpeg；报原 mime 上游会解码失败）
          // ★★ 单候选 45s 限时（无内置超时的挂起候选拖爆 120s 前端工具闸，实测三次）
          const text = await client.visionAnalyze(base64, sendMime, prompt, {
            signal: AbortSignal.timeout(45_000),
          });
          if (text) {
            recordVisionAttempt(p.id, m.id, true);
            return text;
          }
          // 返回空文本：记 10 分钟短 TTL 负缓存（稳定空响应不记则每次白烧一次请求）
          recordVisionAttempt(p.id, m.id, false);
          console.warn('[image_analyze] vision 返回空，换下一候选（10min内跳过）:', m.modelId);
          return null;
        } catch (e: any) {
          // ★ 只把能力性失败记成 no（网络/超时类不记，防抖动被永久误判）
          const marked = recordVisionAttempt(p.id, m.id, false, e?.message || String(e));
          console.warn(`[image_analyze] vision 失败，换下一候选: ${m.modelId}${marked ? '（已记为不支持）' : ''}`, e?.message || e);
          return null;
        }
      } catch (e: any) {
        // 缓存异常 → fail-open
        console.warn('[image_analyze] 能力缓存异常，按原有试错继续:', e?.message || e);
        try {
          const client = new LlmClient(p, m);
          // 与上方主路径同口径：单候选 45s 限时（防单个挂起候选拖爆 120s 前端工具闸）
          const text = await client.visionAnalyze(base64, sendMime, prompt, {
            signal: AbortSignal.timeout(45_000),
          });
          if (text) return text;
        } catch (e2: any) {
          console.warn('[image_analyze] vision 失败（无缓存路径）:', m.modelId, e2?.message || e2);
        }
        return null;
      }
    };

    if (args.platformId && args.modelId) {
      const p = platformStore.platforms.find((p) => p.id === args.platformId);
      const m = platformStore.models.find((m) => m.id === args.modelId && m.platformId === args.platformId);
      if (m && !(m.capabilities || []).includes('vision')) {
        return { ok: false, msg: `模型 ${m.modelId} 不支持 vision（capabilities 未含 vision）` };
      }
      const viaExplicit = await attemptVision(p, m);
      if (viaExplicit) return { ok: true, result: viaExplicit };
    } else {
      // 1) 当前会话模型优先： capabilities 未回填的平台很多，不能因缺标记就把多模态模型跳过。
      //    当前模型看图成功 = 主对话模型直接"看见"，无需额外配置任何独立 vision 模型。
      const conv = conversations.value.find((c) => c.id === currentConvId.value);
      if (conv?.platformId && conv?.modelId) {
        const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
        if (resolved) {
          const viaConv = await attemptVision(platformStore.platforms.find((p) => p.id === conv.platformId), resolved);
          if (viaConv) return { ok: true, result: viaConv };
        }
      }
      // 2) 任一启用且显式标记 vision 的模型
      const visionModel = platformStore.models.find((m) => m.enabled && (m.capabilities || []).includes('vision'));
      if (visionModel) {
        const viaAny = await attemptVision(platformStore.platforms.find((p) => p.id === visionModel.platformId), visionModel);
        if (viaAny) return { ok: true, result: viaAny };
      }
      // 2.5) ★ 生效 vision 候选池（2026-10-13）：GET /api/model-pools 的 effective.vision
      //   （后端 agent→platform→global→autoPool 解析的**有序**候选，[0] 首选）。
      //   此前只试 1)+2) 两个候选就落 OCR —— 会话模型对图片返回空（如 deepseek-flash，
      //   实测 253bd3f4 三连空）+ 无显标 vision 模型时，明明池里配好的视觉模型却永远轮不到。
      //   ★ 用户语义："image_analyze 不行就换池里的模型，不一定非用会话的"。这里按池顺序
      //     逐个真试（tried 去重 + 能力负缓存跳过 + 45s 限时都在 attemptVision 内生效）。
      try {
        const { useModelPoolStore } = await import('./model-pool');
        const poolStore = useModelPoolStore();
        await Promise.all([poolStore.load().catch(() => {}), poolStore.ensureModels().catch(() => {})]);
        for (const entry of poolStore.effectiveVision()) {
          if (!entry?.modelId || !entry?.platformId) continue;
          const pm = platformStore.platforms.find((p) => p.id === entry.platformId);
          const mm = poolStore.allModels.find((m) => m.id === entry.modelId && m.platformId === entry.platformId)
            || platformStore.models.find((m) => m.id === entry.modelId && m.platformId === entry.platformId);
          const viaPool = await attemptVision(pm, mm);
          if (viaPool) return { ok: true, result: viaPool };
        }
      } catch (e: any) {
        // 池链路任何异常都不阻断 —— 回退 OCR（fail-open，与能力缓存同哲学）
        console.warn('[image_analyze] 候选池链路异常，跳过池降级:', e?.message || e);
      }
    }

    // 3) 全部 vision 候选失败/不存在 → OCR 降级
    try {
      const r = await api.post<any>('/tools/ocr', { image: base64, lang: 'chi_sim+eng' });
      if ('error' in r) return { ok: false, msg: r.error };
      const text = r.data?.text || '';
      const note = '\n\n[注: 所有 vision 候选均不可用或看图失败，本次为 OCR 降级，仅提取文字。中文界面/高分辨率截图下 OCR 乱码率高，结果仅供参考]';
      return { ok: true, result: (text || '(OCR 未识别到文字)') + note };
    } catch (e: any) {
      return { ok: false, msg: '图片识别失败（vision 与 OCR 均不可用）: ' + (e?.message || e) };
    }
  }

  function getMaxReActSteps(): number {
    const agentStore = useAgentStore();
    const agent = agentStore.selectedAgent;
    const steps = agent?.config?.maxReActSteps;
    // ★ 下限 1、上限 1000（用户 2026-09-28：「改了最大步数不立刻生效」顺带暴露的硬抬问题）。
    //   此前写的是 `if (steps >= 100) return steps; return 100;` —— 把一切 <100 的配置**静默抬到 100**，
    //   用户想把步数调小（快速迭代/省钱）根本做不到，且界面不提示，属于静默失效。
    //   现在：显式配置直接采纳（只做合法性夹取），未配置才回落到默认。
    // ★ 2026-09-29：默认 100 → 500（用户：「默认 500 步吧，50 步不太够啊」）。
    // ★★ 2026-10-09（本次修复）：500 → 1000。后端 `DEFAULT_MAX_REACT_STEPS` 已提到 1000
    //   （推文产线实测主任务 500 步也撞顶），而后端 `liveMaxSteps()` 的语义是
    //   「显式传入 > 智能体现值 > 默认」—— 前端回落 500 会被当成**显式传入**，从而把后端
    //   已经生效的 1000 默认**覆盖回 500**。⇒ 两处必须**同值**，否则"默认 1000 步"根本
    //   从 UI 生效不了（这正是上次提默认值时漏改的那一半）。
    if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) {
      return Math.min(Math.floor(steps), 1000);
    }
    return 1000; // 默认 1000（与后端 DEFAULT_MAX_REACT_STEPS 同值）
  }

  /** 业务终态错误（task:error）：重连包装必须原样上抛（任务真失败了，重试无意义） */
  function taskFinalError(msg: string): Error {
    const e = new Error(msg);
    (e as any).taskFinal = true;
    return e;
  }

  /**
   * 订阅后端任务事件流（WS 版），更新前端消息状态。callLlm 和重连均使用此函数。
   *
   * ★ 2026-10-20 SSE→WS 迁移：GET /llm/tasks/:id/stream（fetch+consumeSseStream）→
   *   `requestChatWs('subscribe_task', { taskId, since })` + `onTaskEvent` 回调。
   *   事件处理（processEvent）与原 SSE 帧回调**逐字同义**，只是传输层换了。
   *
   * ★ 跨重连状态（`assistantMsgId` / `subAgentMsgIds` / `executedToolCallIds` / `chunkBuffer`）
   *   保存在模块级 `sseStreamStates`（按 taskId 分桶），**不随函数返回而丢失** ——
   *   否则重连会把已执行的 tool:execute 再执行一遍。详见 `SseStreamState` 注释。
   */
  async function subscribeTaskWs(
    convId: string,
    taskId: string,
    signal: AbortSignal,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    since: number = 0,
  ): Promise<void> {
    // 跨重连状态（外提见 SseStreamState）
    const st = streamStateOf(taskId);
    const chunkBuffer = st.chunkBuffer;
    // ★ 自适应 flush 间隔（2026-10-11）：固定 50ms 在大会话（400+ 条消息）下每秒 20 次全树
    //   patch，是"任务一跑页面就卡"的推手之一。间隔随**当前会话消息数**分档：
    //   小会话保持 50ms（打字机体验），大会话拉长到 160ms（肉眼仍接近实时，重渲频率降 3 倍）。
    //   chunk 在 buffer 里只累积不丢 —— 间隔拉长不吞内容，只合并 patch。
    const FLUSH_BASE_MS = 50;
    const FLUSH_LARGE_MS = 160;
    const FLUSH_LARGE_THRESHOLD = 120; // 消息数阈值：超过视为大会话
    // ★ 2026-10-19：超大会话再降一档。实测同一会话累积 1400+ 条时，160ms 的 flush
    //   仍会把渲染进程主线程压死（CDP 探测都进不去）。320ms 肉眼仍接近实时。
    const FLUSH_HUGE_MS = 320;
    const FLUSH_HUGE_THRESHOLD = 500;
    function flushIntervalMs(convId: string): number {
      const n = messagesByConv.value[convId]?.length || 0;
      if (n >= FLUSH_HUGE_THRESHOLD) return FLUSH_HUGE_MS;
      return n >= FLUSH_LARGE_THRESHOLD ? FLUSH_LARGE_MS : FLUSH_BASE_MS;
    }
    function scheduleFlush(convId: string) {
      if (st.flushTimer !== null) return;
      st.flushTimer = setTimeout(() => {
        st.flushTimer = null;
        const arr = messagesByConv.value[convId];
        if (!arr) { chunkBuffer.clear(); return; }
        // 定位启发：chunk 的目标消息几乎总在数组尾部附近（流式只追加尾部），
        // 从尾向前找 —— 平均接近 O(1)，避免大会话每帧 findIndex 全表扫（400 条 × 20 帧/s）
        for (const [msgId, buf] of chunkBuffer) {
          let idx = -1;
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].id === msgId) { idx = i; break; }
          }
          if (idx < 0) continue;
          if (buf.content) arr[idx].content = (arr[idx].content || '') + buf.content;
          if (buf.reasoning) arr[idx].reasoningContent = (arr[idx].reasoningContent || '') + buf.reasoning;
        }
        chunkBuffer.clear();
      }, flushIntervalMs(convId));
    }
    function flushNow(convId: string) {
      if (st.flushTimer !== null) { clearTimeout(st.flushTimer); st.flushTimer = null; }
      const arr = messagesByConv.value[convId];
      if (!arr) { chunkBuffer.clear(); return; }
      for (const [msgId, buf] of chunkBuffer) {
        let idx = -1;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].id === msgId) { idx = i; break; }
        }
        if (idx < 0) continue;
        if (buf.content) arr[idx].content = (arr[idx].content || '') + buf.content;
        if (buf.reasoning) arr[idx].reasoningContent = (arr[idx].reasoningContent || '') + buf.reasoning;
      }
      chunkBuffer.clear();
    }

    // ★ WS 版事件处理（processEvent）：与原 SSE 帧回调逐字同义 —— 游标口径、各事件分支、
    //   终态 return false、task:error 抛出全部保留，只是传输层换成 WS。
    //   显式标注 `Promise<void | false>`：函数体内既有 `break`（→ undefined）又有
    //   `return false`（→ false），不标注会被 TS 推断成 `Promise<boolean>`，与下方
    //   drain 循环的「返回 false 停止消费」契约不兼容。
    const processEvent = async (event: any): Promise<void | false> => {
        // ★ 追踪事件数（重连时作为 since 参数，避免重放旧事件）。
        // ★★★ 游标口径必须是**事件自己的 seq**，不能是"累计收到多少条"（2026-10-15 修，根因）：
        //   服务端 `subscribe(taskId, since, ...)` 按 `seq > since` 重放，而 `emit` 在
        //   `task.events` 超过 MAX_EVENTS(10000) 时会丢弃最旧事件 —— 于是"下标"会整体前移，
        //   与"条数"不再相等。`chunk` 事件按每个流式增量发一条，**长任务必然越过 10000**，
        //   一旦错位：轻则重放窗口错位，重则 since > 事件数 → 断连期间一条都不补
        //   （漏掉 `tool:execute` → 工具不执行 → 该步卡到超时）。故取 `max(旧值, event.seq)`：
        //   `connected` 帧不计入（见下），重放的历史事件 seq 更小也不会让游标倒退。
        // ★ `connected` 帧**绝不能计入**（2026-10-08 修根因，high）：
        //   它由 `sseStream` 直接写 header 后即发，**不进 task.events**
        //   （services/sse.ts 与 routes/llm-tasks.ts 双处注释都明确写了"前端也不要为它累加游标"）。
        //   此前无条件 +1 → 每次重连的游标 **+1** → **恒定漏掉一条事件**。
        //   漏掉的若正好是 `tool:execute`，则：工具永不执行 → 不 POST /tool-result →
        //   服务端 2 分钟超时判「前端暂时不可达」；配合 `executedToolCallIds` 重放去重，
        //   还会出现"重连后把已执行的调用再执行一遍"的重复动作。这是"长任务经常断"的直接来源。
        if (event.type !== 'connected') {
          taskEventCounts.set(taskId, Math.max(taskEventCounts.get(taskId) || 0, typeof event.seq === 'number' ? event.seq : 0));
        }

        switch (event.type) {
          case 'connected': break;
          // ★ 费用账本（2026-10-17，方案 §3.7）：两个事件都只进 cost store，
          //   **不进消息流** —— 落进消息会进上下文，提醒自身在推高它提醒的数字（坑 #15）。
          case 'task:cost': {
            costStore.applyCostEvent(convId, event);
            break;
          }
          case 'task:cost_notice': {
            costStore.applyNoticeEvent(convId, event);
            break;
          }
          // ★★★ 执行面判据（P2-1，2026-10-10）：服务端单一给出，前端只服从。
          //   收到 bridge ⇒ 本任务的 browser_* 由服务端直连主进程执行，前端**跳过本地执行**
          //   （否则双执行：同一次调用打两遍页面）。老 server 不发本字段 → 不进入本分支 → 行为不变。
          case 'task:created': {
            const exec = event.browserExecution === 'bridge' ? 'bridge' : 'frontend';
            setBrowserExecution(convId, exec as any);
            break;
          }
          case 'message:added': {
            const msg = event.message;
            const arr = messagesByConv.value[convId] || [];
            if (!arr.some(m => m.id === msg.id)) {
              arr.push({
                id: msg.id, conversationId: convId, role: msg.role,
                content: (msg.role === 'tool' && !msg.subAgentId) ? '' : (msg.content || ''), toolCallId: msg.toolCallId,
                parentToolCallId: msg.parentToolCallId,
                reasoningContent: msg.role === 'assistant' ? '' : undefined,
                toolCalls: msg.role === 'assistant' ? [] : undefined,
                systemPromptSnapshot: msg.systemPromptSnapshot,

                subAgentId: msg.subAgentId,
                subAgentName: msg.subAgentName,
                subAgentDepth: msg.subAgentDepth,
                createdAt: Date.now(),
              } as any);
            }
            trimCurrentResidency(convId);
            if (msg.role === 'assistant') {
              if (msg.subAgentId) st.subAgentMsgIds.set(subAgentKeyOf(msg.subAgentId, msg.parentToolCallId), msg.id);
              else st.assistantMsgId = msg.id;
            }
            break;
          }
          case 'chunk': {
            if (event.content || event.reasoning) {
              const arr = messagesByConv.value[convId] || [];
              const targetId = event.subAgentId ? st.subAgentMsgIds.get(subAgentKeyOf(event.subAgentId, event.parentToolCallId)) : st.assistantMsgId;
              const idx = targetId ? arr.findIndex(m => m.id === targetId) : arr.length - 1;
              if (idx >= 0 && arr[idx].role === 'assistant') {
                const msgId = arr[idx].id;
                const buf = chunkBuffer.get(msgId) || { content: '', reasoning: '' };
                if (event.content) buf.content += event.content;
                if (event.reasoning) buf.reasoning += event.reasoning;
                chunkBuffer.set(msgId, buf);
                scheduleFlush(convId);
              }
            }
            if (onChunk && !event.subAgentId) onChunk({ content: event.content, reasoning: event.reasoning });
            break;
          }
          case 'tool_call': {
            flushNow(convId);
            const targetId = event.subAgentId ? st.subAgentMsgIds.get(subAgentKeyOf(event.subAgentId, event.parentToolCallId)) : st.assistantMsgId;
            if (targetId) {
              const arr = messagesByConv.value[convId] || [];
              const idx = arr.findIndex(m => m.id === targetId);
              if (idx >= 0) arr[idx].toolCalls = event.toolCalls;
            }
            break;
          }
          case 'message:updated': {
            flushNow(convId);
            const arr = messagesByConv.value[convId] || [];
            const idx = arr.findIndex(m => m.id === event.messageId);
            if (idx >= 0) {
              arr[idx] = {
                ...arr[idx],
                content: event.content ?? arr[idx].content,
                reasoningContent: event.reasoning ?? arr[idx].reasoningContent,
                toolCalls: event.toolCalls ?? arr[idx].toolCalls,
              };
            }
            break;
          }
          // 计划状态更新（后端 PlanRunner 编排的并行子任务）——复用 task_plan 的展示通道
          // （输入区上方运行指示行的步骤详情 + 进度条），**不新增任何 UI 元素**。
          case 'plan:updated': {
            const key = planKeyOf(convId);
            // 用 syncPlan（保留 steps 自带状态），而非 applyTaskPlan（会把状态强制成 pending）
            plansByConv.value = syncPlan(plansByConv.value, key, event.plan as any);
            // ★★★ 2026-10-15：`persisted:true` = 服务端**已经写好**了这份计划
            //   （task_plan / task_step 已直连化，服务端是唯一写者）⇒ 前端**只展示、不回写**。
            //   回写不只是多一次 PATCH：它会让"计划写者"变成两个，正是要消掉的那类漂移；
            //   而这条推送的目的就是让卡片刷新**不再依赖渲染层往返**。
            //   ★ PlanRunner 的 plan:updated 不带这个标记 → 维持原样回写（那条链路的写者仍是前端）。
            if (event.persisted !== true) void persistPlan(key, plansByConv.value[key]);
            break;
          }
          case 'tool:start': {
            // 仅浏览器类工具推送步骤日志，避免非浏览器工具污染右侧浏览器面板
            if (event.toolName?.startsWith('browser_')) {
              // ★ 控制信号先于展示信号登记（2026-10-08）：即使下面的步骤数组因断流/重放
              //   被清空，会话级的"浏览器任务进行中"事实也不会丢 → 输入锁不放。
              markBrowserTaskActive(convId);
              pushBrowserStep(event.toolName, '执行中...');
            }
            break;
          }
          case 'tool:result': {
            if (event.toolName?.startsWith('browser_')) {
              markBrowserTaskActive(convId);
              pushBrowserStep(event.toolName, event.result);
            }
            break;
          }
          case 'tool:timeout': {
            // ★★★ 2026-10-10 补：服务端**早就在发**这个事件（见 llm-task-manager 的
            //   `emit(task, { type: 'tool:timeout', ... })`），注释写着「前端据此把该工具条
            //   标为"超时未回执"，而不是让界面只是"停住不动"（与真卡死难以区分）」——
            //   但**前端一行都没处理** → 事件被静默丢弃，用户看到的就是"卡住没反应"。
            //   实测：`browser_navigate` 慢档超时 **8 分钟**（7min + 1min 排队余量），
            //   这 8 分钟里界面毫无提示，用户只能以为死机。
            //   现在：把超时事实**写进浏览器步骤日志**（与 tool:start/result 同一展示面），
            //   用户能立刻看出"某工具等了 N 秒没回执"，而不是干等。
            markBrowserTaskActive(convId);
            const secs = Math.round((Number(event.timeoutMs) || 0) / 1000);
            pushBrowserStep(
              String(event.toolName || ''),
              `⏱ 已等待 ${secs}s 仍未收到执行回执（超时）。可能原因：浏览器面板未就绪 / 页面加载极慢 / 前端与后端连接不稳。任务会继续，不必重启。`,
            );
            break;
          }
          case 'sub_agent:start': {
            if (event.parentToolCallId) runningToolCallIds.value.add(event.parentToolCallId);
            break;
          }
          case 'sub_agent:end': {
            if (event.parentToolCallId) runningToolCallIds.value.delete(event.parentToolCallId);
            if (event.agentId) st.subAgentMsgIds.delete(subAgentKeyOf(event.agentId, event.parentToolCallId));
            break;
          }
          case 'app:open_window': {
            // 模型请求弹出某任务的独立执行窗口（app_open_window 工具，2026-10-17）。
            // 重连重放按 eventId 去重；桌面端开真子窗口，Web 端降级新标签页。
            const owEventId = String(event.eventId || '');
            if (owEventId) {
              if (openedWindowEventIds.has(owEventId)) break;
              openedWindowEventIds.add(owEventId);
              if (openedWindowEventIds.size > 100) {
                const first = openedWindowEventIds.values().next().value;
                if (first) openedWindowEventIds.delete(first);
              }
            }
            const targetConvId = String(event.conversationId || '');
            if (!targetConvId) break;
            void (async () => {
              try {
                const api = (window as any).electronAPI?.childWindow;
                if (!api) {
                  window.open(`${location.origin}${location.pathname}#/task-window/${targetConvId}`, '_blank');
                  return;
                }
                await api.open({ key: `task-run-${targetConvId}`, route: `/task-window/${targetConvId}`, width: 520, height: 760 });
              } catch (e) {
                console.warn('[Chat] app_open_window 弹窗失败:', e);
              }
            })();
            break;
          }
          case 'tool:execute': {
            const { callId, toolName, args, toolCallId: ptcId, depth: evtDepth } = event;
            // 去重：重放时跳过已执行的 tool:execute（避免重复调工具/弹窗）
            if (st.executedToolCallIds.has(callId)) break;
            st.executedToolCallIds.add(callId);
            // ★★★ 执行面直连化（P2-1，2026-10-10）：桥生效时**前端不执行** browser_* ——
            //   服务端已直连主进程执行（结果不经这里回传），前端只负责展示（tool:start/result 事件照旧）。
            //   ★ 若这里仍执行 ⇒ **双执行**（同一次调用打两遍页面：重复点击/重复输入/重复导航）。
            //   ★ 判据来自服务端下发的 `browserExecution`（见 isBrowserExecutionByBridge 注释），
            //     **前端不得自己探端点**（否则造第二份判据 + 泄露 token）。
            if (typeof toolName === 'string' && toolName.startsWith('browser_') && isBrowserExecutionByBridge(convId)) {
              // 仅登记"本会话在跑浏览器任务"（接管条/输入锁仍要亮），然后**直接返回**不执行。
              markBrowserTaskActive(convId);
              break;
            }
            // 多会话隔离：把当前任务所属 convId 传给工具分发（浏览器工具按 convId 取 scope，
            // 不同会话的 tab/激活/历史互不串台，避免会话 A 调 browser_get_page_content 读到会话 B 的页面）。
            const ctx = ptcId
              ? { parentToolCallId: ptcId, depth: evtDepth ?? 1, convId }
              : { convId };
            // ★ 控制信号登记（2026-10-08）：这条路径是前端**真正动手**执行浏览器操作的入口，
            //   不依赖后端是否额外发了 tool:start（两者独立）→ 任一到达都能点亮输入锁。
            if (typeof toolName === 'string' && toolName.startsWith('browser_')) {
              markBrowserTaskActive(convId);
            }
            // ★★ 即发即忘（2026-10-08）：**绝不能 await dispatchToolCall**。
            //   工具执行可能耗时数十秒（浏览器导航/截图/上传、用户确认弹窗）。此前在帧循环里 await，
            //   会让 consumeSseStream 停止 reader.read() → TCP 缓冲打满 → 服务端 SSE 写阻塞 →
            //   连接被中间层当空闲掐断 → 前端读到 done 且无重连 → 后端后续工具报「前端暂时不可达」。
            //   改为后台执行后，帧循环持续消费（心跳/stream 帧即时读走），连接不再假死。
            //   工具结果仍由各自的 postResult/postError 回传服务端，语义不变。
            void (async () => {
              try {
                const r = await dispatchToolCall(toolName, args, ctx);
                const resultStr = r.ok
                  ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result || ''))
                  : (r.msg || '工具执行失败');
                sendChatWs('tool_result', { taskId, callId, result: resultStr });
              } catch (e: any) {
                sendChatWs('tool_result', { taskId, callId, result: `工具执行失败: ${e?.message || e}` });
              }
            })();
            break;
          }
          case 'file:registered': {
            try { await useFileStore().loadConversationFiles(event.conversationId || convId); } catch {}
            break;
          }
          // ★★ 必须 return false（不是裸 return）——drain 循环的契约是「processEvent 返回 false
          //   才停止消费并收尾」。WS 下服务端订阅在连接存续期间一直活着，所以这是客户端唯一的收尾时机。
          //   历史缺陷（2026-10-04，SSE 时代）：此处原是裸 `return`（= undefined）→ 流不停 → reader.read()
          //   永久挂起 → 订阅循环不返回 → callLlm 的 finally 不执行 →
          //   runningConvIds 里的会话 id 永不删除 → store.streaming 恒 true，
          //   表现为「回答已完整输出（含生成的图片）却一直显示『任务运行中』+ 停止按钮」。
          // ★ 终态必须清掉跨重连状态（否则 sseStreamStates 无界增长；且同 taskId 不会被复用，
          //   留着只是内存垃圾）。放在 markRunEnd 之前 —— 清状态不影响消息列表内容。
          // ★ 任务收尾清理执行面标记：避免残留在下一任务上（与 browserSteps / browserTaskConvs
          //   同族，本文件多处收尾都做同样的清理）。放在**三态共同出口**（completed/aborted/error）。
          case 'task:completed': flushNow(convId); dropStreamState(taskId); taskEventCounts.delete(taskId); clearBrowserExecution(convId); markRunEnd(convId, 'completed'); emitTaskFinished(convId); return false;
          case 'task:aborted': flushNow(convId); dropStreamState(taskId); taskEventCounts.delete(taskId); clearBrowserExecution(convId); markRunEnd(convId, 'aborted'); emitTaskFinished(convId); return false;
          case 'task:error': flushNow(convId); dropStreamState(taskId); taskEventCounts.delete(taskId); clearBrowserExecution(convId); markRunEnd(convId, 'error'); emitTaskFinished(convId); throw taskFinalError(event.error || '任务执行失败');
          case 'task:paused': pausedConvIds.value.add(convId); browserLockInput.value = false; break;
          case 'task:resumed': pausedConvIds.value.delete(convId); break;
          case 'context:compacted': {
            // ★ 压缩事件（2026-10-02，对齐 Claude Code 的 compact_boundary）。
            //   后端把「本轮把多少条压成了摘要」推过来 → 前端在消息流里落一条分隔标记。
            //   ★ 为什么要给用户看：压缩是**有损**的（前文被摘要替换），而此前它完全隐形 ——
            //   用户只会觉得"模型怎么忘了前面说的"，却看不到任何解释。
            //   标记落在 `assistantMsgId` 之后（= 本次压缩实际生效的位置）。
            const marker = {
              id: `compact_${taskId}_${Date.now()}`,
              conversationId: convId,
              role: 'system',
              content: '',
              createdAt: Date.now(),
              compactMarker: {
                coveredCount: Number(event.coveredCount) || 0,
                keptCount: Number(event.keptCount) || 0,
                tokens: Number(event.tokens) || 0,
                afterMessageId: st.assistantMsgId || undefined,
                subAgentId: event.subAgentId,
              },
            } as any;
            const arr = messagesByConv.value[convId] || [];
            arr.push(marker);
            break;
          }
        }
    };

    // ★ 订阅生命周期（WS 版）：requestChatWs('subscribe_task') 建立服务端订阅
    //   （服务端重放 seq>since 的事件）→ onTaskEvent 收事件 → 串行队列逐条消费。
    //   退出路径（全部经 finish，顺带把节流缓冲尾巴落进消息列表 —— 对齐原 SSE 版 try/finally，
    //   否则 task:error 抛出会跳过 flushNow，最后 ~50ms 的流式增量永久丢失）：
    //   ① 终态（processEvent 返回 false）→ resolve；
    //   ② task:error → reject（错误带 taskFinal 标记 → 重连包装原样上抛，不重试业务终态）；
    //   ③ AbortSignal（用户停止）→ reject(AbortError)（对齐 SSE 版 fetch reader 中止语义）；
    //   ④ WS 断开 → reject('WS 连接断开')：服务端订阅已随连接释放，
    //     由外层重连包装按 taskEventCounts 的 since 续传重订（socket 重连由 chat-ws 模块负责）。
    await new Promise<void>((resolve, reject) => {
      let unsubEvent: () => void = () => {};
      let unsubClose: () => void = () => {};
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        try { unsubEvent(); } catch { /* 已释放 */ }
        try { unsubClose(); } catch { /* 已释放 */ }
        flushNow(convId);
        if (err) reject(err); else resolve();
      };

      // ★ 串行队列：WS 事件回调是即发即弃的，这里必须保持「逐条 await」的串行语义
      //   （与原 consumeSseStream 一致）—— file:registered 分支有 await（等文件列表刷新）、
      //   tool:execute 依赖「先登记 executedToolCallIds 再放行下一个事件」的去重顺序，
      //   并行消费会让重放窗口内的同一调用被并发执行两遍。
      const queue: any[] = [];
      let draining = false;
      const drain = async () => {
        if (draining) return;
        draining = true;
        try {
          while (queue.length && !settled) {
            const r = await processEvent(queue.shift()!);
            if (settled) return; // processEvent 内部触发了 finish（终态/错误/中止）
            if (r === false) { finish(); return; }
          }
        } catch (e: any) {
          finish(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        draining = false;
      };

      unsubEvent = onTaskEvent((tid, event) => {
        if (settled || tid !== taskId) return;
        queue.push(event);
        void drain();
      });

      unsubClose = onChatWsClose(() => {
        if (settled) return;
        finish(new Error('WS 连接断开'));
      });

      const abortErr = () => new DOMException('The operation was aborted', 'AbortError');
      signal.addEventListener('abort', () => finish(abortErr()), { once: true });

      requestChatWs('subscribe_task', { taskId, since })
        .then(() => { if (signal.aborted) finish(abortErr()); })
        .catch((e: any) => finish(e instanceof Error ? e : new Error(String(e))));
    });
  }

  /**
   * WS 断连自动续传重订包装（原 SSE 断连重连包装，2026-10-08 建，2026-10-20 随迁移改 WS）。
   *
   * ★ 为什么必须（用户实报「长任务经常断，一个会话执行不下去」+ 日志「浏览器工具前端暂时不可达」）：
   *   WS 断开 ⇒ 服务端订阅已随连接释放（chat-ws 模块会自动重连 socket，但**不会**重发
   *   subscribe_task —— 订阅生命周期归本 store 管），「订阅结束」有三种含义：
   *   ① 任务真到终态（task:completed/aborted/error）——已由各分支收尾（resolve / 抛 taskFinal）；
   *   ② WS 断开 / 订阅请求失败 —— subscribeTaskWs 以传输层错误 reject；
   *   ③ 用户停止（AbortSignal）—— reject(AbortError)。
   *   对 ②：查一次任务是否仍在运行（GET /llm/tasks/active），仍在运行 → 按 taskEventCounts
   *   记录的**最后一个事件 seq** 做 since **续传重订**（服务端重放 `seq > since` 的事件，不丢帧）；
   *   指数退避重试，上限 8 次。任务已终态或查询失败 → 正常返回，交由调用方 finally 收尾。
   *   对 ①③：AbortError / taskFinal（业务终态 task:error）**原样上抛** —— 保持调用方
   *   markRunEnd('aborted'/'error') 的既有语义，重试反而会把真失败掩盖成"还在跑"。
   */
  async function subscribeTaskWsWithReconnect(
    convId: string,
    taskId: string,
    signal: AbortSignal,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
  ): Promise<void> {
    const MAX_RETRY = 8;
    for (let attempt = 0; ; attempt++) {
      try {
        await subscribeTaskWs(convId, taskId, signal, onChunk, taskEventCounts.get(taskId) || 0);
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;   // 用户停止 → 调用方落 aborted 态
        if (e?.taskFinal) throw e;               // 业务终态错误（task:error）→ 不重试
        if (signal.aborted) return;
        if (attempt >= MAX_RETRY) {
          console.warn(`[Chat] WS 重订超过 ${MAX_RETRY} 次仍未完成，放弃（任务仍在后端运行，可切走再切回恢复）`);
          return;
        }
        // 指数退避：0.5s → 1s → 2s → 4s，封顶 5s（瞬断立刻回来，真故障不空转）
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => {
          const t = setTimeout(resolve, delay);
          signal.addEventListener('abort', () => { clearTimeout(t); resolve(null); }, { once: true });
        });
        if (signal.aborted) return;
        console.log(`[Chat] WS 断连，第 ${attempt + 1} 次续传重订 (since=${taskEventCounts.get(taskId) || 0})`);
        continue;
      }
      if (signal.aborted) return;
      // 订阅正常结束 → 判定任务是否仍在运行（终态时 active 查询为空，直接收工）
      let stillRunning = false;
      try {
        const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
        stillRunning = !('error' in r) && Array.isArray(r.data)
          && r.data.some((t: any) => t.id === taskId && t.status === 'running');
      } catch { /* 查询失败按结束了处理，避免无限重连 */ }
      if (!stillRunning) return;
      if (attempt >= MAX_RETRY) {
        console.warn(`[Chat] WS 重订超过 ${MAX_RETRY} 次仍未完成，放弃（任务仍在后端运行，可切走再切回恢复）`);
        return;
      }
      // 指数退避：0.5s → 1s → 2s → 4s，封顶 5s（瞬断立刻回来，真故障不空转）
      const delay = Math.min(500 * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => {
        const t = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => { clearTimeout(t); resolve(null); }, { once: true });
      });
      if (signal.aborted) return;
      console.log(`[Chat] WS 断连，第 ${attempt + 1} 次续传重订 (since=${taskEventCounts.get(taskId) || 0})`);
    }
  }

  /** 检查会话是否有未完成的后端任务，如有则重新订阅 SSE 恢复流式输出。 */
  async function reconnectActiveTask(convId: string): Promise<void> {
    if (!isServerMode()) return;
    // ★★★ 2026-10-11：**先挂会话级长连订阅**（与任务无关，见 subscribeConversationEvents）。
    //   这是"任务结束实时感知"的主路径 —— 挂上之后，即便任务级 SSE 完全断了，
    //   终态事件也会从会话级总线送达 ⇒ 不再依赖 `/llm/tasks/active` 轮询。
    //   ★ 位置：放在最前面（先建立推送通道，再校准状态），且**不 await**（长活，不能阻塞本函数）。
    void subscribeConversationEvents(convId);
    // ★ 2026-10-09 假运行态自愈：SSE 终态事件丢失（断流放弃重连 / 服务重启把任务标
    //   interrupted）时，runningConvIds / browserTaskConvs 永远没人清 → 前端永远显示
    //   「任务运行中 / Agent 接管中」。旧实现 has() 提前 return（UI 认为在跑就连服务端
    //   都不问）、active 为空也只 return 不清理，没有任何自愈出口。
    //   现在每次切回会话都问一次服务端：确认无活动任务且 UI 仍认为在跑 → 清残留。
    //   查询本身失败（网络抖动）不动残留态，避免误清真正在跑的任务。
    const wasUiRunning = runningConvIds.value.has(convId);
    let activeTasks: any[] = [];
    try {
      const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
      if ('error' in r || !r.data) return;
      activeTasks = r.data;
    } catch (e) {
      console.error('[Chat] 检查活动任务失败:', e);
      return;
    }
    if (activeTasks.length === 0) {
      if (wasUiRunning) {
        // 服务端已无此会话的活动任务 → 前端运行态是残留，落结束态并清浏览器任务记账
        markRunEnd(convId, 'aborted');
        runningConvIds.value.delete(convId);
        clearBrowserTaskActive(convId);
        abortControllers.delete(convId);
        taskIds.delete(convId);
      }
      return;
    }
    if (wasUiRunning) return; // 已有订阅在跑，不重复订阅
    const task = activeTasks[0];
    const taskId = task.id;
    taskIds.set(convId, taskId);
    runningConvIds.value.add(convId);
    // 重连恢复：真实起点未知，用后端任务的 createdAt 兜底（缺省退化为当前时间）
    runStatsByConv.value[convId] = { status: 'running', startedAt: Number(task.createdAt) || Date.now() };
    const abortController = new AbortController();
    abortControllers.set(convId, abortController);
    void (async () => {
      try {
        // ★★★ 走带重连的包装（2026-10-08 修，high）：此前这里直接调单次订阅（不带重连），
        //   于是**手动重连（切走再切回）拿到的流一旦再被掐断就永久停了** —— 而且它拿到的
        //   `connected` 帧会把 `taskEventCounts` 虚高 1，使该任务**之后所有自动重连
        //   都从错位下标开始**（漏事件 → 工具不执行 → 报「前端暂时不可达」）。
        //   与 callLlm 走同一条路径，行为才一致。
        await subscribeTaskWsWithReconnect(convId, taskId, abortController.signal, undefined);
      } catch (e: any) {
        markRunEnd(convId, e?.name === 'AbortError' ? 'aborted' : 'error');
        if (e?.name === 'AbortError') return;
        console.error('[Chat] 重连 SSE 失败:', e);
      } finally {
        markRunEnd(convId);
        abortControllers.delete(convId);
        taskIds.delete(convId);
        runningConvIds.value.delete(convId);
      }
    })();
  }

  // ★★★ 假运行态残留自愈巡检（2026-10-09；2026-10-09 扩到全部会话；2026-10-11 消除 120s 盲区）：
  //   SSE 终态事件丢失（断流放弃重连 / 服务重启把任务标 interrupted）时 runningConvIds
  //   永远没人清 → ①「Agent 接管中 · 执行中」整条挂着不掉（用户实报「pageAgent结束了…这个一直在？」）；
  //   ② **输入锁（禁用标志）一直挂着**（用户实报「没有任务也一直存在」）；
  //   ③ 该会话之后**发不出任何消息**（callLlm 同会话守卫命中；旧版是静默 return → 消息凭空消失）。
  //   原有自愈只挂在「切回会话」（reconnectActiveTask），用户不切会话就永远不触发。
  //
  // ★★★ 2026-10-11 根因修复（用户实报「没有任务，禁用标志也一直存在着」）：
  //   旧实现有一道 `browserIdle` 宽限 —— 浏览器工具事件静默 **120s** 才允许查服务端：
  //     `const browserIdle = now - lastBrowserToolAt > 120000;`
  //     `if (browserTaskConvs.has(convId) && !browserIdle) continue;`
  //   ⇒ 只要本会话跑过浏览器工具，**任务结束后最长 120s 内禁用标志一定挂着**
  //     （若任务恰在 wait_for(30s) 之后结束，用户感受到的是 120s+ 的"没有任务还锁着"）。
  //   ★ 旧宽限的**理由成立但手段错了**：它想避免"长任务编排间隙浏览器空闲 2 分钟"被误清，
  //     于是拿"浏览器工具静默时长"当"任务是否还在跑"的**代理信号**。
  //     而任务是否在跑，服务端 `/llm/tasks/active` **一句话就能问清** —— 不需要靠猜。
  //   ⇒ 现在（2026-10-11 二次修订）：**主路径改为会话级长连订阅**（服务端终态双发），
  //     巡检降级为"最后一道保险"，间隔 60s、宽限 30s（常量与判定见 store 外的
  //     `SWEEP_INTERVAL_MS` / `BROWSER_SWEEP_GRACE_MS` / `shouldSweepConv`）。
  //     两种情况都不会被误清：① 真在跑 → 服务端有活动任务；② 刚结束 → 宽限内不动。

  async function sweepStaleBrowserTakeover(): Promise<void> {
    if (runningConvIds.value.size === 0) return;
    const sinceLastBrowserToolMs = Date.now() - lastBrowserToolAt.value;
    for (const convId of Array.from(runningConvIds.value)) {
      // ★★★ 2026-10-09：**不再只扫浏览器会话**（"B 会话发不出消息"修复的一环）。
      //   此前是 `if (!browserTaskConvs.value.has(convId)) continue;` —— 把**纯文本会话整个
      //   排除在自愈之外**。于是纯文本任务一旦丢了 SSE 终态事件，该会话的 runningConvIds
      //   永久残留 → 之后每次发送都被 callLlm 的同会话守卫命中。
      //   纯文本会话没有"浏览器事件"这个活性信号，只能以服务端活动任务为准。
      //   ★ 判定抽到 `shouldSweepConv()`（见上方，纯函数、可单测）。
      //   真在跑 → 服务端有活动任务 → 不清（安全）。
      if (!shouldSweepConv(browserTaskConvs.value.has(convId), sinceLastBrowserToolMs)) continue;
      try {
        const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
        // ★ 单会话查询失败**只跳过本会话**（此前是 return，一个失败会让其余会话的自愈整轮失效）
        if ('error' in (r as any) || !(r as any).data) continue;
        const act = (r as any).data as any[];
        if (act.length === 0) {
          // 服务端已无活动任务 → 前端运行态是残留，落结束态并清记账（与切会话自愈同口径）
          markRunEnd(convId, 'aborted');
          runningConvIds.value.delete(convId);
          clearBrowserTaskActive(convId);
          abortControllers.delete(convId);
          taskIds.delete(convId);
          emitTaskFinished(convId);
        }
      } catch { /* 查询失败（网络抖动）不动残留态，避免误清真正在跑的任务 */ }
    }
  }

  // ★★★ 2026-10-11：**用「会话级长连订阅」替代「每 30s 轮询 /llm/tasks/active」**。
  //
  //   ★ 用户原话：「轮询？这个不是早就去掉了？不是改成 websocket 双向通讯了？轮询效率肯定差啊」
  //     查证结果：业务主链路**从来没有 WebSocket**（任务流是 `fetch` + `ReadableStream` 手读 SSE）；
  //     而轮询确实还有一处 —— 就是上面这个 `sweepStaleBrowserTakeover` 每 30s 拉 `/llm/tasks/active`。
  //     它的存在只是因为**终态事件可能推不出去**（前端订阅断了）。**问题的根不在轮询，在推送缺口。**
  //
  //   ⇒ 正确修法：让服务端把**终态事件多推一份到会话级总线**（已改 llm-task-manager 的 `emit`），
  //     前端在这里挂一条**与任务无关、长活的会话级订阅**，任务结束的瞬间就能收到
  //     `task:completed/aborted/error` ⇒ **不再需要任何轮询**。
  //
  //   ★ 为什么这条订阅能覆盖"订阅断掉"的场景：会话级总线（2026-10-20 起走 WS 的
  //     `subscribe_conversation`）是独立于任务的通道，不随任务终态关闭；它有自己的断线重订
  //     （onChatWsClose 钩子 + 指数退避）。服务端 `emitConversation` 在无人在线时静默（内容已落库），零额外成本。
  //
  //   ★ 保留的角色分工：
  //     · 本订阅 —— **实时**告知"任务结束了"（主路径，毫秒级）
  //     · `reconnectActiveTask`（切回会话时查一次）—— 冷启动/断线期间的**校准**（幂等，不是轮询）
  //     · `sweepStaleBrowserTakeover` —— **降级为最后一道保险**（间隔拉长、仅兜底极端情况）
  const conversationSseAborts = new Map<string, AbortController>();
  /** 是否已就该会话建立过会话级订阅（避免重复挂；切会话时复用） */
  const conversationSseSubscribed = new Set<string>();

  /**
   * 订阅会话级事件总线（长活，断线自动重订）。
   *
   * ★ 生命周期：**跟随会话**，不跟随任务 —— 任务结束、WS 断连、切会话都不影响它继续活着。
   *   因此它能收到"任务级订阅已经断掉时"的终态事件，这正是消除轮询的关键。
   *
   * ★ 2026-10-20 迁 WS：GET /llm/conversations/:id/stream（SSE while 重连循环）→
   *   requestChatWs('subscribe_conversation')。WS 断开后服务端订阅随连接释放 →
   *   在 onChatWsClose 里重订（socket 重连由 chat-ws 模块负责，订阅重挂归本函数）。
   */
  async function subscribeConversationEvents(convId: string): Promise<void> {
    if (!isServerMode() || !convId) return;
    if (conversationSseSubscribed.has(convId)) return;
    conversationSseSubscribed.add(convId);
    const ac = new AbortController();
    conversationSseAborts.set(convId, ac);

    // 事件处理：与原 SSE 版逐字同义（message:added 补漏 / 标题生成 / 终态清运行态），全幂等。
    const unsubConv = onConvEvent((cid, event) => {
      if (cid !== convId) return;
      // ★ 2026-10-11 消费 `message:added`（服务端 notifyConversation 在任务**已结束**
      //   时把落库消息推到会话总线 —— 典型场景：任务收尾的"完成提示"消息、
      //   注入的追加消息）。收到的就是双通道都没赶上时的漏网消息 ⇒ 直接补进本地
      //   列表，替代"等轮询兜底来补"的场景（双向通信改造的最后一环）。
      //   ★ 幂等：任务级流正常时会先送达同一 id，`some(m => m.id === ...)` 去重挡住。
      if (event.type === 'message:added' && event.message?.id) {
        const msg = event.message;
        const arr = messagesByConv.value[convId];
        if (arr && !arr.some(m => m.id === msg.id)) {
          arr.push({
            id: msg.id,
            conversationId: convId,
            role: msg.role,
            content: msg.content || '',
            toolCallId: msg.toolCallId,
            parentToolCallId: msg.parentToolCallId,
            subAgentId: msg.subAgentId,
            subAgentName: msg.subAgentName,
            subAgentDepth: msg.subAgentDepth,
            createdAt: msg.createdAt || Date.now(),
          } as any);
        }
        return;
      }
      // ★ 会话标题自动生成（2026-10-11）：服务端首个任务 completed 后由 LLM 生成标题，
      //   经会话级总线推过来 —— 就地更新列表里的标题（无轮询、无刷新）。
      //   只更新内存与本地视图，不再回写服务端（服务端已落库，回写反而会把 title_source 洗成 'user'）。
      if (event.type === 'conversation:title' && event.conversationId === convId && typeof event.title === 'string' && event.title) {
        const conv = conversations.value.find((c) => c.id === convId);
        if (conv && conv.title !== event.title) conv.title = event.title;
        return;
      }
      // ★ 处理**终态**（服务端在任务结束时任一双通道都会送达）。
      //   收到即意味着"该会话的任务已结束" → 清残留运行态与浏览器记账。
      //   ★ 幂等：正常订阅期间任务流也会送达同一事件；此处的清理操作全是幂等的
      //     （`markRunEnd` / `delete` / `clearBrowserTaskActive` 重复调用无副作用）。
      if (event.type === 'task:completed' || event.type === 'task:aborted' || event.type === 'task:error') {
        if (runningConvIds.value.has(convId)) {
          markRunEnd(convId, event.type === 'task:completed' ? 'completed'
            : event.type === 'task:aborted' ? 'aborted' : 'error');
          runningConvIds.value.delete(convId);
          abortControllers.delete(convId);
          taskIds.delete(convId);
          clearBrowserTaskActive(convId);
          emitTaskFinished(convId);
          // ★ 可观测（排障命门）：这条是"禁用标志凭什么解除"的**唯一现场证据**。
          //   此前该路径零日志 → 「没有任务但输入框还锁着」只能靠读代码猜。
          console.log(`[Chat] 会话级终态推送：${event.type} conv=${convId} → 已清运行态与浏览器记账（输入锁将解除）`);
        }
      }
    });

    // 初订 + 断线重订：指数退避 0.5s → 5s 封顶（与原 SSE 会话流同口径），直到成功或被退订
    const resubscribe = async (): Promise<void> => {
      let attempt = 0;
      for (;;) {
        if (ac.signal.aborted) return;
        try {
          await requestChatWs('subscribe_conversation', { conversationId: convId });
          return;
        } catch {
          if (ac.signal.aborted) return;
          attempt++;
          const delay = Math.min(500 * Math.pow(2, Math.min(attempt, 4)), 5000);
          // ★ 可观测：重订是"推送通道健康度"的唯一线索（首页打开后若一直刷这条，说明通道有问题）
          console.warn(`[Chat] 会话级 WS 订阅失败，第 ${attempt} 次重试（${delay}ms 后）conv=${convId}`);
          await new Promise((r) => { const t = setTimeout(r, delay); ac.signal.addEventListener('abort', () => { clearTimeout(t); r(null); }, { once: true }); });
        }
      }
    };
    // WS 断开 → 服务端订阅已释放 → socket 重连后必须重挂订阅
    const unsubClose = onChatWsClose(() => { if (!ac.signal.aborted) void resubscribe(); });

    // 显式退订（unsubscribeConversationEvents abort）：释放本地回调 + 精确退订服务端订阅
    ac.signal.addEventListener('abort', () => {
      unsubConv();
      unsubClose();
      sendChatWs('unsubscribe_conversation', { conversationId: convId });
    }, { once: true });

    await resubscribe();
  }

  /** 退订会话级事件总线（会话被删除/切换清理时调用） */
  function unsubscribeConversationEvents(convId: string): void {
    conversationSseSubscribed.delete(convId);
    const ac = conversationSseAborts.get(convId);
    if (ac) { try { ac.abort(); } catch { /* ignore */ } conversationSseAborts.delete(convId); }
  }

  // ★ 最后一道保险的调度（60s 一跳）。
  //   ★ 2026-10-11 刻意**保留 setInterval 而非 visible-polling**，理由：
  //     ① 它是**全局 store 级**兜底（不属任何组件），而 visible-polling 是组件生命周期的用法；
  //     ② 它一进来就 `if (runningConvIds.size === 0) return` —— **平时零开销**（没有任务在跑就不查）；
  //     ③ 语义上它是"补漏"：恰恰在"用户切走、前端没注意"时也该发现残留，被可见性门控反而削弱兜底。
  //   ⇒ 真正承担主路径的是会话级长连订阅（实时），本处只在双向都断时兜底。
  setInterval(() => { void sweepStaleBrowserTakeover(); }, SWEEP_INTERVAL_MS);

  async function callLlm(
    platform: Platform,
    model: Model,
    options: {
      userContent?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      reasoningEffort?: string;
    },
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    convIdOverride?: string,
  ): Promise<void> {
    // convIdOverride：发送流程跨越多个 await，期间用户可能切换会话。
    // 调用方可显式锁定目标会话，避免消息/任务落到「发送开始时」之外的会话上（多会话并行时必现串台）。
    const convId = convIdOverride || currentConvId.value;
    if (!convId) throw new Error('未选择会话');
    // ★★★ 同会话互斥 —— **绝不静默吞消息**（2026-10-09 实据修复，high）。
    //
    // 症状（用户实报）：多会话下 A 会话在跑，B 会话发消息后**页面上没有这条消息**，
    //   输入框显示「任务运行中」，内容区毫无反应。
    //   真因：本行此前是裸 `if (runningConvIds.value.has(convId)) return;` —— 直接返回，
    //   既**不落库、不发 SSE、也不给任何提示**，用户消息凭空消失（与「输入框空了」（调用方
    //   已清）、「显示运行中」（确有任务在跑）三者叠加，观感就是"点了没反应"）。
    //
    // 正确语义（两种"在跑"要分清，不能一律吞）：
    //   ① 真在跑（服务端确有该会话的活动任务）→ 走「注入复用」：消息落库 + message:added
    //      回显 + 模型下一轮带上（后端 /llm/tasks 的复用保护已实现并已进安装包）。
    //      注入失败再退回"明确提示"，**仍不吞**（消息留在输入框里由调用方恢复）。
    //   ② 假运行态残留（前端 runningConvIds 挂着，服务端其实没有活动任务）——SSE 终态事件
    //      丢失（断流放弃重连 / 服务重启把任务标 interrupted）时的常见形态 →
    //      先清残留运行态，再**继续正常起新任务**（不能因为一个死记账让该会话永久发不出消息）。
    const runningId = taskIds.get(convId);
    if (runningConvIds.value.has(convId)) {
      // ★ 无条件查服务端（不依赖本地 taskIds —— 残留态下 taskIds 可能已被清，只有
      //   runningConvIds 还挂着；不查就永远判不出"假运行态"）。
      let activeTaskId: string | null = null;
      try {
        const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
        if (!('error' in r) && Array.isArray(r.data)) {
          activeTaskId = r.data.find((t: any) => t.status === 'running')?.id ?? null;
        } else {
          activeTaskId = runningId ?? null; // 查询返回异常：退回本地记账（有记账即视为在跑）
        }
      } catch {
        // 查询失败（网络抖动）→ 退回本地记账：有记账视为在跑（宁可提示，也不重复起任务）
        activeTaskId = runningId ?? null;
      }
      if (activeTaskId) {
        // 真在跑 → 注入复用（后端落库 + 推送 message:added，前端立即可见）
        const content = options.userContent;
        if (content && content.trim()) {
          try {
            const inj = await requestChatWs<any>('inject', {
              conversationId: convId,
              content,
              // 幂等键：任务 id + 内容长度，覆盖"连点/网络重试"重复下单
              clientMsgId: `${activeTaskId}:${content.length}`,
            });
            if (inj?.data?.status === 'injected') {
              try {
                const { ElMessage } = await import('element-plus');
                ElMessage.info('已并入运行中的任务，将在下一轮执行时生效');
              } catch { /* 提示失败不影响订阅 */ }
              return;
            }
          } catch { /* 注入失败 → 落到下面的明确提示，绝不静默 */ }
        }
        // 注入不成（无内容 / 后端拒绝）→ **明确告知**，不吞（消息已由调用方负责留在输入框）
        try {
          const { ElMessage } = await import('element-plus');
          ElMessage.warning('该会话正在执行任务，本条未发送：请等任务结束，或用「立即发送」把它并入下一轮');
        } catch { /* ignore */ }
        return;
      }
      // 假运行态残留 → 清掉死记账，继续正常起新任务
      runningConvIds.value.delete(convId);
      runStatsByConv.value[convId] = { status: 'aborted', startedAt: 0, endedAt: Date.now() };
      clearBrowserTaskActive(convId);
      abortControllers.delete(convId);
      taskIds.delete(convId);
    }

    runningConvIds.value.add(convId);
    runStatsByConv.value[convId] = { status: 'running', startedAt: Date.now() };
    // ★ 清掉上一轮任务在**界面上**残留的旧计划：计划按会话持久保留（plansByConv / task_plan_json），
    //   不清的话新任务运行指示会显示旧计划的「步骤 3/3 全完成」，看起来像已完成的任务卡在运行中。
    //   新任务若做规划，task_plan/task_step 会重新登记。复用运行中任务（下方 has 提前 return）不受影响。
    // ★★★ 2026-10-09 修：这里必须用 **clearPlanDisplayOnly**（只清内存），不能用 clearPlan ——
    //   后者会 PATCH taskPlan:null，把工作目录的 plan.md 一并删掉，**跨会话接力当场失效**
    //   （实测：发一条消息 → task_plan_json 变 NULL、plan.md 消失）。详见 clearPlanDisplayOnly 注释。
    clearPlanDisplayOnly(convId);
    const abortController = new AbortController();
    abortControllers.set(convId, abortController);

    try {
      // 单一事实来源：后端统一构建 systemPrompt + tools（含 agent/会话级挂载、原生/文本模式区分）。
      // 前端只传 agentId/appGuide 等参数，不再自建提示词与工具表（避免双轨不一致）。
      const conv = conversations.value.find(c => c.id === convId);
      const agent = activeAgent();
      const appSettings = useSettingsStore().settings;
      const appGuide = appSettings.appGuide;
      const maxSteps = getMaxReActSteps();

      const taskRes = await requestChatWs<any>('create_task', {
        conversationId: convId,
        platformId: platform.id,
        modelId: model.id,
        userContent: options.userContent,
        agentId: conv?.agentId || agent?.id || null,
        // 智能体本体挂载：随任务下发（智能体编辑存本地库，server 端按此收敛取数范围）
        ontologyIds: agent?.ontologyIds?.length ? agent.ontologyIds : undefined,
        appGuide,
        // 记忆抽取/压缩前抢救用的模型（设置页配置；留空则后端回退任务自身模型）
        memoryExtractPlatformId: appSettings.memoryExtractPlatformId || undefined,
        memoryExtractModelId: appSettings.memoryExtractModelId || undefined,
        maxSteps,
        // 显式下发工作目录：后端优先使用此值注入 system prompt，避免多会话/多项目并发时全局单例互相覆盖
        workspaceDir: appSettings.workspaceDir || undefined,
        // 工作目录边界守卫档位（2026-10-01）：后端据此决定越界时弹窗 / 直接拒绝 / 不检查。
        // 与 workspaceDir 同一条下发通道（同一份设置来源，避免"两处不同源"漂移）。
        // ★ all 档（2026-10-07）：跨目录访问 / 脚本执行不再逐次弹窗 → 直接下发 off 跳过路径守卫。
        pathGuard: permissionMode.value === 'all' ? 'off' : (appSettings.pathGuard || 'ask'),
        modeFlags: {
          thinking: thinkingMode.value,
          plan: planMode.value,
          answerOnly: answerOnly.value,
        },
        options: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          reasoningEffort: options.reasoningEffort,
        },
      });
      const taskId = taskRes.data.taskId;
      taskIds.set(convId, taskId);

      // ★ 复用运行中任务（2026-10-07）：后端把新消息注入老任务（落库 + message:added 回显），
      // 这里给出可见反馈 —— 此前是静默吞掉，用户以为「发消息没反应」。
      if (taskRes.data.reused) {
        try {
          const { ElMessage } = await import('element-plus');
          ElMessage.info(taskRes.data.injected ? '已并入运行中的任务，将在下一轮执行时生效' : '已接入当前运行中的任务');
        } catch { /* 提示失败不影响订阅 */ }
      }

      await subscribeTaskWsWithReconnect(convId, taskId, abortController.signal, onChunk);
    } catch (e: any) {
      markRunEnd(convId, e?.name === 'AbortError' ? 'aborted' : 'error');
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);
      throw e;
    } finally {
      markRunEnd(convId); // 幂等兜底：SSE 终态已落的先到者为准
      // 跨重连状态随任务收尾一起清（见 SseStreamState 注释）。
      // ★ 这里从 taskIds 反查而不是直接用 taskId —— taskId 在 try 块内声明，
      //   finally 作用域取不到（catch 分支（建任务失败）时本就没有 taskId）。
      const tid = taskIds.get(convId);
      if (tid) { dropStreamState(tid); taskEventCounts.delete(tid); }
      abortControllers.delete(convId);
      taskIds.delete(convId);
      runningConvIds.value.delete(convId);
    }
  }

  async function sendMessage(
    userContent: string,
    platform: Platform,
    model: Model,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    options?: { temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string },
    convIdOverride?: string,
  ): Promise<void> {
    return callLlm(platform, model, { userContent, ...options }, onChunk, convIdOverride);
  }

  function stop(convId?: string) {
    const target = convId || currentConvId.value;
    if (!target) return;
    const controller = abortControllers.get(target);
    if (controller) controller.abort();
    // 终止后端任务
    const taskId = taskIds.get(target);
    if (taskId) {
      sendChatWs('abort', { taskId });
      dropStreamState(taskId);
      taskEventCounts.delete(taskId);
    }
    abortControllers.delete(target);
    taskIds.delete(target);
    // ★ 本地兜底（2026-10-19）：渲染层重载 / SSE 断连后，controller 与 taskId 可能都已为空，
    //   但 runningConvIds 仍挂着 → 点「停止」毫无反应。无条件清本地运行态，
    //   保证停止按钮在任何状态下都能把 UI 拉回可输入。
    const wasRunning = runningConvIds.value.has(target);
    runningConvIds.value.delete(target);
    if (wasRunning) markRunEnd(target, 'aborted');
    // 手动终止时 SSE 连接已被 abort，后端随后的「task:aborted」事件不会再到达前端，
    // task:aborted 分支里的 emitTaskFinished 走不到 → 排队的追加消息不会自动发送。
    // 这里手动补发一次结束回调；即便与 task:completed 双发也安全
    // （flushQueuedAfterTask 有按会话在途守卫，重复触发只处理一条，不会撞同会话互斥丢消息）。
    if (controller || taskId || wasRunning) emitTaskFinished(target);
    if (pendingPlatformConfig.value) {
      cancelPlatformConfig();
    }
  }

  // ── Agent 浏览器实况控制：暂停 / 恢复 ──
  // 语义（后端同步实现）：工具边界暂停 —— 当前动作跑完即挂起，不发起下一个工具/下一轮模型请求。
  // 暂停即自动解除输入锁定（用户点暂停的意图就是接管），恢复后重新锁定。
  const pausedConvIds = ref<Set<string>>(new Set());
  const browserPaused = computed(() => !!currentConvId.value && pausedConvIds.value.has(currentConvId.value));

  async function pauseTask(convId?: string) {
    const target = convId || currentConvId.value;
    const taskId = target ? taskIds.get(target) : undefined;
    if (!taskId) return;
    pausedConvIds.value.add(target!);
    browserLockInput.value = false; // 暂停 = 用户接管
    sendChatWs('pause', { taskId });
  }

  async function resumeTask(convId?: string) {
    const target = convId || currentConvId.value;
    const taskId = target ? taskIds.get(target) : undefined;
    if (!taskId) return;
    pausedConvIds.value.delete(target!);
    if (runningConvIds.value.has(target!) && browserSteps.value.length > 0) {
      browserLockInput.value = true; // 恢复 = agent 继续驾驶
    }
    sendChatWs('resume', { taskId });
  }

  async function ensureMcpConnections() {
    const mcpStore = useMcpStore();
    for (const sid of mountedMcpServers.value) {
      const result = await mcpStore.connect(sid);
      if (!result.ok) {
        console.warn('[Chat] MCP 连接失败:', sid, result.msg);
      }
    }
  }

  async function regenerate(
    platform: Platform,
    model: Model,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    options?: { temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string },
    convIdOverride?: string,
  ): Promise<void> {
    const cid = convIdOverride || currentConvId.value;
    if (!cid) throw new Error('未选择会话');
    const lastAssistant = [...(messagesByConv.value[cid] || [])].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      await deleteMessage(lastAssistant.id);
    }
    return callLlm(platform, model, { ...options }, onChunk, cid);
  }

  /**
   * ★★★ 手动压缩（D3-转，2026-10-10）：用户主动「现在压一下」。
   *
   * ★ 为什么需要：自动压缩只在超过有效窗口（标称×25%）时触发；用户有时**明知上下文很满**
   *   （想省钱/提速/避免触顶）却没有手段提前压 —— 这是**便利性增强，非缺陷**。
   * ★ 与自动压缩的关系：**同一条流水线**（服务端 `forceCompress` 只跳过阈值判定，
   *   摘要/落库/记忆抢救全部不变）⇒ 压完能在「压缩历史」里看到、也可回退。
   * ★ 冲突防护：任务运行中会被服务端拒绝（409）—— 手动压缩与主循环每步的压缩并发会互相干扰。
   */
  async function compactNow(convId?: string | null): Promise<{ ok: boolean; msg: string }> {
    const cid = convId || currentConvId.value;
    if (!cid) return { ok: false, msg: '未选择会话' };
    if (runningConvIds.value.has(cid)) return { ok: false, msg: '任务运行中，无需手动压缩（自动压缩已覆盖）' };
    try {
      const r = await api.post<any>(`/conversations/${encodeURIComponent(cid)}/compact`);
      if ('error' in r) return { ok: false, msg: r.error };
      const d = (r as any).data || {};
      if (!d.compacted) return { ok: true, msg: '暂无可压缩的内容（或已压到最小）' };
      return { ok: true, msg: `已压缩（覆盖 ${d.coveredCount} 条消息，可在「压缩历史」查看/回退）` };
    } catch (e: any) {
      return { ok: false, msg: e?.message || '压缩失败' };
    }
  }

  return {
    conversations, currentMessages, streaming, currentConvId, mountedMcpServers, mcpDisabledTools, mcpToolAliases,
    runningConvIds, isConvStreaming, runStatsByConv,
    browserExpanded, browserUserDismissed, browserLockInput, browserPaused, pausedConvIds,
    browserTaskActive, markBrowserTaskActive, clearBrowserTaskActive,
    lastBrowserToolAt, browserStepSeq, resetBrowserStepSeq, BROWSER_LIVE_GRACE_MS,
    // 会话级长连订阅（2026-10-11：替代 /llm/tasks/active 轮询的主路径）
    subscribeConversationEvents, unsubscribeConversationEvents,
    // 执行面判据（服务端下发；前端只读服从）—— 见 isBrowserExecutionByBridge 注释
    browserExecutionByConv, isBrowserExecutionByBridge, setBrowserExecution, clearBrowserExecution,
    remainingAgentOpenedTabs, clearAgentOpenedTabs, markAgentOpenedTab,
    agentCursor, onAgentCursor, clearAgentCursor,
    pauseTask, resumeTask,
    compactNow,
    queuedByConv, queuedOf, enqueueMessage, removeQueuedMessage, updateQueuedMessage, promoteQueuedMessage, takeQueuedMessages, takeFirstQueuedMessage, injectQueuedMessage,
    onTaskFinished,
    runningToolCallIds, isToolCallRunning,
    browserSteps, pushBrowserStep, rightPanelOpen, thinkingMode, planMode, answerOnly,
    reasoningEffortOverride,
    permissionMode, setPermissionMode,
    showFilePopup, previewingFile, rightPanelTab, currentBrowserUrl, skipNextRecordVisit,
    previewTabs, activeTabId, activeTab,
    openTab, activatePreviewTab, closePreviewTab, closeAllPreviewTabs, closePreviewTabsLeft, closePreviewTabsRight,
    pendingQuestion, pendingConfirmation, pendingPlatformConfig, submitPendingQuestion,
    pendingPathAuth, submitPendingPathAuth,
    pendingToolAuth, submitPendingToolAuth,
    pendingPrefill, prefillInput,
    submitPendingConfirmation, skipPendingConfirmation, cancelPendingConfirmation,
    submitPlatformConfig, cancelPlatformConfig,
    planSteps, planTitle, clearPlan, clearPlanDisplayOnly,
    activeAgent, activeAgentId,
    loadConversations, loadMessages, createConversation, updateConversation, deleteConversation, deleteConversations,
    // 会话生命周期（2026-10-16 归档 + 回收站）
    archiveConversation, restoreConversation, purgeConversation, emptyTrash, loadLifecycleCounts, lifecycleCounts,
    /** 「显示浏览器页面对话」偏好与开关（侧栏搜索行那个图标按钮用） */
    showPageConvs, setShowPageConvs,
    archiveAllInSpace, dropConvRuntime,
    loadConversationsByScope,
    loadMoreHistory, historyPagingByConv, HISTORY_PAGE_SIZE,
    fetchToolResult,
    /** 当前会话消息驻留裁剪的开关：UI 滚到底部时置 true，向上翻历史时置 false */
    setChatAtBottom,
    addMessage, updateMessage, deleteMessage, sendMessage, regenerate, stop,
    getMergedMounts,
  };
});
