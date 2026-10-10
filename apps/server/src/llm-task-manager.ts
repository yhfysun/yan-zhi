// LLM 任务管理器 —— 后端独立运行 ReAct 循环，前端通过 SSE 订阅。
// 前端构建完整系统提示词 + 工具 schema 发给后端，后端负责 LLM 编排 + 工具执行。
// 内置工具（file/cmd/browser 等）后端直接执行，刷新不中断。
// UI 交互工具（ask_user/confirm_user 等）和 MCP/自定义工具委托前端，刷新时暂停等待重连。
// 注：web_search 已移除，联网查询统一委派 pageAgent（真实浏览器搜索引擎）。
import type { Platform, Model, Message, DeltaToolCall } from '@yan-zhi/shared';
import { formatTaskTypeContext, DEFAULT_CONFIRM_BATCH_SIZE, resolveTaskBudgets, checkTaskBudgetHit as sharedCheckTaskBudgetHit, addWaitCredit } from '@yan-zhi/shared';
import { LlmClient, getToolRegistry, getApiToolRegistry, ContextWindow, adviceForTruncatedArgs, runCodeDiagnostics, invalidateDiagnosticsCache, resolveToolPath, setBrowserToolConversationId, type SummaryCache } from '@yan-zhi/core';
import { db, MESSAGE_LIST_COLS } from './db.js';
import { normalizePermissionMode, checkToolPermission, filterToolsByPermission, permissionModePrompt, checkWorkflowPermission, type PermissionMode } from './tool-permission.js';
import { ensureToolsInitialized } from './mcp/index.js';
import { executeApiTool, isApiExecutableTool } from './mcp/api-tool-executor.js';
import { getToolsFromDb, mcpShortIdOf, resolveMcpToolName, callMcpTool } from './mcp/client-manager.js';
import {
  retrieveRelevantMemories, formatMemoryContext, bumpMemoryUsage,
  writeMemoryItems, flushMemoriesBeforeCompression, parseExtractedItems, type MemoryWriteItem,
} from './services/memory-service.js';
import { loadSpaceMemoryForConversation, formatSpaceMemoryContext, appendTaskDecision, loadTaskMemoryForConversation, formatTaskMemoryContext, appendTaskProgress, readTaskProgressForConversation, formatProgressContext } from './services/space-memory.js';
import {
  resolveExperienceBase, resolveSkillDraftsDir, appendExperienceEntry, buildExperienceContextForConversation,
  listExperienceSummaries, type ExperienceKind,
} from './services/experience.js';
import { proposeSkillDraft, skillDraftNotifyText } from './services/skill-distill.js';
import { backendTaskPlan, backendTaskStep, loadTaskPlanFromFile, savePlanJson } from './services/task-plan-file.js';
import { summarizeResourceDirsSync } from './services/space-resources.js';
// 提示词快照：构建（只存 id 引用）与按需回填的唯一定义处 —— 修单会话 O(n²) 的快照膨胀
import { toSnapshotMessages, pruneOldSnapshots, SNAPSHOT_KEEP_PER_CONV } from './services/context-snapshot.js';
// 上下文组装的**唯一出口**（主循环与子智能体循环共用）—— 压缩落库 + 子智能体隔离 + 预算分配
import { buildContextView, mainlineMessages } from './services/context-view.js';
import { serverState } from './state.js';
// 产物登记钩子（P2-3）：把 file_write / 媒体登记的副作用从主循环里搬出去
import { runAfterToolHooks } from './services/tool-hooks.js';
// 防失控循环闸门（2026-10-09）：同名同参重复 / 单工具连刷，在 executeTool 漏斗拦截
import { checkToolLoop } from './services/tool-loop-guard.js';
// 子任务执行详情（2026-10-09）：get_sub_task_detail 的查询与排版（编排者分析子任务失败用）
import { loadSubTaskTrace, formatSubTaskTrace } from './services/sub-task-detail.js';
import { registerArtifactHooks } from './services/artifact-hooks.js';
// 工件协议 + 任务计划调度（2026-10-08 多智能体协同）
import { runWithArtifactCollector, formatSubAgentReturn, collectArtifact } from './services/artifacts.js';
import { createPlan, runPlanToCompletion, getPlanStatusText, reassignPlanItem, registerPlanRunnerDeps } from './services/plan-runner.js';
import { loadProjectSkills, truncateSkillBody } from './services/project-skills.js';
import { parseSkillFiles, skillDirName, syncSkillsToWorkspace } from './services/skill-files.js';
import { dirEntryFingerprint, makeFingerprintCache } from './services/fs-fingerprint.js';
import {
  canStartBackgroundSubAgent, makeBackgroundId, buildBackgroundReceipt, buildConcurrencyFullMessage,
  buildFinishNote, buildDeliveryText,
  type BackgroundSubAgentInfo,
} from './services/background-subagents.js';
import { matchUserHooks } from './services/user-hooks.js';
import { guessMime } from './utils/mime.js';
import { resolveArtifactDirFor } from './services/artifact-dir.js';
// 工作目录边界守卫：判定在 path-guard（纯逻辑），这里只做"拿到 need-auth 后弹窗授权"
import {
  checkPathAccess,
  checkDangerousCommand,
  summarizeCommandArgs,
  allowedRootsFor,
  COMMAND_TOOLS,
  getAuthorizedDirs,
  authorizeDir,
  isCommandAuthorized,
  authorizeCommand,
  type PathAccessItem,
} from './services/path-guard.js';
import { modelSupportsTools } from './services/model-caps.js';
import { dynamicToolRoute } from './services/tool-router.js';
// 模型标识解析：统一走 services/model-resolve（主键优先 + 存量裸名回退），
// 不在此另写查询 —— 同一件事两处实现必然漂移。
import { findModelRow, rowToModel } from './services/model-resolve.js';
import { DEFAULT_CONTEXT_WINDOW, resolveContextWindow } from './constants.js';
import {
  startWorkflowRun, subscribeWorkflowRun, getWorkflowRun, resolveBundleFromDb,
  markWorkflowDelivered, loadPendingWorkflowDeliveries, type WorkflowDeliveryCtx,
} from './workflow-runner.js';
import {
  isWorkflowAgent, extractWorkflowInputFields, mapWorkflowInputs,
  classifyWorkflowOutput, buildWorkflowReceipt, withAbortAndTimeout,
  buildWorkflowInputFieldDefs,
} from './services/workflow-delegate.js';
import {
  isWorkflowToolName, workflowAgentIdOfTool,
} from './services/workflow-tool-registry.js';
import { promises as fsp } from 'node:fs';
// 运行时生成子智能体（AOrchestra 对齐）：四元组归一化 / 工具三重裁剪 / 预算闸 / 提示词渲染
import {
  normalizeSubAgentSpec, resolveSpecTools, renderSpecSystemPrompt, checkSpawnBudget,
  specFingerprint, shouldSuggestPersist,
  DEFAULT_MAX_SPAWN_PER_TASK, DEFAULT_SPEC_MAX_STEPS,
  type SubAgentSpec, type ResolvedSubAgentSpec,
} from './services/subagent-spec.js';
// 同步 fs / path：项目规则（AGENTS.md）读取走同步路径（提示词构建是同步函数），
// 且带 mtime 缓存，开销可忽略。
import { statSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from './services/logger.js';
const logger = createLogger('llm-task-manager');

/** 工作流结果反写的 I/O 上限：反写本身很快，超时只为防异常挂住。 */
const WORKFLOW_DELIVERY_TIMEOUT_MS = 30 * 1000;

/**
 * 单轮 ReAct 最大步数的**默认值**（智能体未配置 maxReActSteps 时生效）。
 *
 * ★ 2026-09-29：100 → 500（用户诉求「默认 500 步吧，50 步不太够啊」）。
 *   实测长任务（《驭兽斋》有声小说多章流水线）跑满 100 步后仍有大量未完成步骤 ——
 *   默认值偏小 → 频繁触顶 → 即使有自动接力也来回停顿，用户体感就是"老断"。
 * ★ 2026-10-09：500 → 1000（推文产线实测主任务 500 步也会撞顶）。用户显式配更小的值仍须尊重。
 */
const DEFAULT_MAX_REACT_STEPS = 1000;

/**
 * 空转断路器阈值（P6 提升为模块级导出，2026-10-04）：连续 N 次空参调用判定为退化。
 * ★ 曾因「断路器 >=3 vs 接力闸门 >0」各写字面量漂移出真实事故 —— 现在两处判定共用本常量，
 *   子智能体等新循环入口也必须接这里，禁止再写字面量。
 */
export const EMPTY_ARGS_THRESHOLD = 3;

/**
 * ★★★ 自动接力两条上限（2026-10-09，P1 重设计）。
 *
 * 背景（实据诊断）：达单批步数上限后走「结账 → 决策 → 接力」，但原实现的**总批次数**被
 *   `autoContinueMaxRounds`（默认 3）一刀切死 → 长任务（推文产线：选书→抓正文→出片→上传→回填）
 *   跑到 3 批就必然终止，用户体感就是"老断"。而库内实测有 9 条「自动接力第 N/3 批」，
 *   说明**接力本身在用**，但 3 批的额度太小。
 *
 * 新语义（两个数，别混）：
 *   · `autoContinueHardCap`（=30）= **总批次数**硬顶 —— 防真正失控（纯烧 token 不产出）。
 *     仅此一个数才是"绝对上限"，正常任务几乎不会撞到（撞到说明前 30 批都在空转）。
 *   · `autoContinueMaxRounds`（默认 3）= **连续无进展批次数**上限（停滞上限）——
 *     只要每批仍有**机械进展**（计划剩余步骤下降 / 模型自评有未完成事项），
 *     停滞计数清零、继续接力；连续 N 批毫无进展才停。
 *   ⇒ 有活干就一直干，干不动了才停 —— 与用户「不要一直断」的诉求一致。
 */
export const autoContinueHardCap = 30;

/**
 * ★★★ 任务**总时长**硬顶（2026-10-09 新增，弹性墙钟的必要兜底）。
 *
 * 背景：2026-10-09 起墙钟预算改为「每批一份」（见 TASK_WAIT_CREDIT_CAP_MS 与接力块的基线重置），
 *   目的是让"单批必然超 15 分钟"的出片类长任务能一趟跑完。但这样一来：
 *   - 计划已被清空的会话（见 clearPlan 自毁那类的后果）里 `readPlanRemainingSteps()===0`，
 *     停滞判定会判 `noPlanTracked && expectedContinue` ⇒ **永远算"有进展"** → 停滞闸失效；
 *   - 只剩 `autoContinueHardCap = 30 批` 兜底，按每批 15 分钟算 = **最坏 7.5 小时**。
 * ⇒ 必须有独立于"批次数"的**总墙钟**上限。
 *
 * ★ 这是"失控兜底"，不是"任务预算"：正常任务不该撞到（撞到说明 3 小时里没干成一件事）。
 *   与 autoContinueHardCap 是**两个正交维度**（批次 vs 时长），少一个都能被绕过。
 *   4 小时 = 用户"长任务"的心理上限，也远高于任何单章推文出片（实测 ~20 分钟）。
 */
export const TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS = 4 * 60 * 60 * 1000;

/**
 * ★★★ P0（2026-10-09）：流式断流判据 + 自动续写参数。
 *
 * 背景（实据诊断）：上游/代理常以 **TCP FIN 半途关闭 SSE**，此时 `reader.read()` 是
 *   **正常结束**而非抛错 → 旧代码把半截流当"本轮完成"落库：content 为空、reasoning 只有一半，
 *   却 emit `task:completed`（实测库内 12 条 assistant 记录正是此形状，用户体感"转半天不出话"＝卡死）。
 *
 * 判据（由 core 的 parseSSE 吐出的 `terminated` 标记承载）：
 *   **见到 finish_reason 或 [DONE] 才算正常收尾**；未见而流结束 = 截断。
 * 处置：先**就地续写**（把已产出内容当 assistant 前缀重新发起，追加到尾部），
 *   续写用尽仍失败 → 落**可见**错误文案并保留部分内容，**绝不留下空 content 的 assistant 消息**。
 */
export const STREAM_TRUNCATE_MAX_RETRY = 2;

/** 是否需要为「流被掐断」补写一轮（吞掉残缺的 reasoning，见循环内用法） */
export const TRUNCATED_STREAM_NOTICE =
  '（本轮上游输出被提前中断。已保留已生成的部分内容；如不完整请重新发送或继续。）';

/**
 * ★ P0-4（2026-10-07）：可**并行**执行的只读工具白名单。
 *
 * 为什么要有这个白名单而不是"全并行"：与 call_agent 并行的既有判据一致 ——
 *   · 浏览器工具是单活动页状态机（同批多操作互相覆盖）→ 绝不并行；
 *   · UI 工具会同时弹两个框 → 绝不并行；
 *   · 文件写类工具有先后依赖 → 绝不并行；
 *   · 只有**无副作用、无共享状态**的读类工具才安全。
 * 白名单必须显式列举（宁可漏进串行，不可错放写工具）；新增只读工具时在此登记。
 */
const READONLY_PARALLEL_TOOLS = new Set<string>([
  'file_read',
  'file_list',
  'code_search',
  'web_search',
]);
/** 兼容旧名（runTask 内多处引用）—— 新代码一律用 EMPTY_ARGS_THRESHOLD */
const EMPTY_ARGS_DEGENERATE_THRESHOLD = EMPTY_ARGS_THRESHOLD;
/** 前端委托工具的**默认**超时上限：2 分钟（此前裸写魔数，日志文案也硬编码 "2min"） */
export const FRONTEND_TOOL_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * ★★★ 浏览器工具的**分档超时** + 串行排队宽限（2026-10-09，P1 实据修复）。
 *
 * 背景：`browser_*` 全部委托前端 BrowserView 执行，此前**一刀切**套 `FRONTEND_TOOL_TIMEOUT_MS`（2 分钟），
 *   但它们的耗时天然分化：
 *   · `browser_get_page_content` / `get_visible_text` / `get_page_info` / `check` —— 通常秒级；
 *   · `browser_navigate` —— 慢站 + 代理（FlClash 7890）+ 等 `domcontentloaded`，**常超 2 分钟**；
 *   · `browser_click / type / upload / wait_for` —— 含前端等待，也可能超。
 *   实测 `server.log`：某会话 15:17~17:28 连续 2 分钟超时，清一色是这几种。
 *
 * 更隐蔽的一层：前端用 `browser-op-queue`（`chainBrowserOp`）把浏览器操作**按会话串行化**，
 *   服务端 7 个写路由另有 `withBrowserLock` —— 于是「排队等待」的时间也被计进了这 2 分钟。
 *   慢站场景下"排队 + 执行"极易越界 → 工具被 reject，**但浏览器动作其实还在跑**，
 *   界面因此停住不动 —— 与真卡死难以区分（用户口中的另一种"卡死"）。
 *
 * 处置：① 按工具分档（只读快、导航/交互慢）；② 超时时间**额外放宽排队余量**（`BROWSER_QUEUE_GRACE_MS`）。
 */
const BROWSER_SLOW_TOOLS = new Set([
  'browser_navigate', 'browser_click', 'browser_type', 'browser_upload',
  'browser_submit_form', 'browser_fill_form', 'browser_action_and_observe',
  'browser_login_saved', 'browser_download', 'browser_wait_for', 'browser_drag',
]);
const BROWSER_FAST_TOOLS = new Set([
  'browser_get_page_content', 'browser_get_visible_text', 'browser_get_page_info',
  'browser_check', 'browser_screenshot', 'browser_run_script', 'browser_scroll',
  'browser_hover', 'browser_press_key', 'browser_select_option', 'browser_uncheck',
  'browser_scroll_into_view', 'browser_open_external',
]);
/** 慢档：导航/交互（含慢站加载 + 排队余量） */
export const BROWSER_SLOW_TIMEOUT_MS = 7 * 60 * 1000;
/** 快档：只读/轻交互（页面内容、可见文本、截图、脚本） */
export const BROWSER_FAST_TIMEOUT_MS = 90 * 1000;
/** 串行排队宽限：浏览器操作会被前端按会话串行化，排队时间不应算作"执行超时" */
export const BROWSER_QUEUE_GRACE_MS = 60 * 1000;

/** 按工具名解析前端委托超时（未登记的 browser_* 走默认慢档 —— 宁可等久也别误杀） */
export function resolveFrontendToolTimeout(toolName: string): number {
  if (BROWSER_SLOW_TOOLS.has(toolName)) return BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS;
  if (BROWSER_FAST_TOOLS.has(toolName)) return BROWSER_FAST_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS;
  if (toolName.startsWith('browser_')) return BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS;
  return FRONTEND_TOOL_TIMEOUT_MS;
}

export type TaskStatus = 'running' | 'completed' | 'failed' | 'aborted' | 'paused';

export interface SSEEvent {
  type: string;
  [key: string]: any;
}

interface PendingToolCall {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  toolName?: string;
  callId?: string;
  requestedAt?: number;
  timer?: ReturnType<typeof setTimeout>;
  /** 工具入参（ask_user/confirm_user 记录决策、/tasks/active 回显 pending 详情用） */
  args?: unknown;
}

/** 交互类工具：暂停等用户回答，没有"超时"语义 —— 用户隔天回来回答也应该有效。
 *  免 2 分钟创建超时、免 15 秒断连宽限（宽限 reject 会把挂着的问题杀掉）。 */
const INTERACTIVE_TOOLS = new Set(['ask_user', 'confirm_user']);

interface LlmTask {
  id: string;
  conversationId: string;
  userId: string;
  status: TaskStatus;
  platformId: string;
  modelId: string;
  events: SSEEvent[];
  subscribers: Set<(event: SSEEvent) => void>;
  abortController: AbortController;
  createdAt: number;
  error?: string;
  pendingToolCalls: Map<string, PendingToolCall>;
  seq: number;
  step: number;
  origin?: string;
  offlinePolicy?: string;
  /**
   * 最近一轮 LLM 调用的 finish_reason。
   *
   * ★ 2026-09-29：主循环此前**从不读** finish_reason，导致「模型没生成参数（干净的 {}）」
   *   与「生成到一半被输出上限切断（半截 JSON）」被混为一谈，统一给出「怀疑 max_tokens /
   *   模型能力」的错误归因，且对截断场景建议"重试"（必然再次截断）。
   *   这里存下来是为了让工具执行层（`executeTool` 的空参拦截）能按真实原因分派文案。
   */
  lastFinishReason?: string;
  agentId?: string | null;
  includeUiTools?: boolean;
  /** 会话级 MCP 挂载的 serverId 集合（无人值守时后端直连 MCP 兜底用） */
  mountedMcpServerIds?: string[];
  /** 记忆抽取/抢救用模型（前端设置页下发；空则回退任务自身的平台/模型） */
  memoryExtractPlatformId?: string;
  memoryExtractModelId?: string;
  /** 智能体挂载的本体 id 集合（前端随任务下发；空/未设置 = 取数不限本体范围） */
  ontologyIds?: string[];
  /** 会话级工具权限：readonly=只读（写类工具构建期裁剪+运行时拦截）/ default=正常 / full=全部放行 */
  permissionMode?: 'readonly' | 'default' | 'full' | 'all';
  /** 工作目录边界守卫档位（2026-10-01）：ask（默认）/ strict / off */
  pathGuard?: 'ask' | 'strict' | 'off';
  /** 暂停旗标（工具边界暂停语义）：置位后主循环/子智能体循环/前端委托入口在边界处挂起，
   *  正在执行的单个动作不打断（原子操作，中途掐断会留半状态页面）。resume 后从边界继续。 */
  paused?: boolean;
  /** 暂停挂起点：resumeTask 时逐个 resolve 放行 */
  pauseWaiters?: Array<() => void>;
  /** 运行中由前端「立即发送」注入的追加用户消息 id（已落库）。
   *  非空即表示还有未消费的用户输入：本轮模型即便不再调工具，也不能直接 finish，
   *  必须再跑一轮把这些消息带进上下文。 */
  pendingInjects: string[];
  /**
   * 注入幂等记账：前端队列条目 id（clientMsgId）→ 本任务内该条注入产生的真实消息 id。
   *
   * ★★★ 为什么需要（2026-10-09 用户实报「同一个消息点击多次会发送 n 次」）：
   *   「立即发送」此前完全无幂等 —— 连点几下就是一个 POST 一次落库，库里出现多条同内容
   *   user 消息，模型下一轮把它们当多条指令重复执行。有 confidence 的幂等键后：
   *   同一 clientMsgId 第二次直接返回既有 msgId（duplicate=true），**不再落库、不再 emit**。
   *   ★ 随任务存活（收尾即随 task 一起被回收），不落库 —— 幂等只需覆盖"本次运行期间"的连点/重试。
   */
  injectedByClientId: Map<string, string>;
  /** 运行时生成子智能体的预算闸（AOrchestra 对齐，见 services/subagent-spec.ts）。
   *  上限来自 agent.config_json.maxSpawnPerTask，缺省 DEFAULT_MAX_SPAWN_PER_TASK。 */
  spawnBudget?: number;
  /** 本任务内已现场生成的子智能体次数（与 spawnBudget 配对做闸门） */
  spawnCount?: number;
  /**
   * ★ 后台并行子智能体（P2-6，2026-10-04）：`call_agent` 带 `async: true` 启动的
   * 未完成后台任务（bgId → 元信息）。用途：① 并发闸（≥3 拒绝新任务）；
   * ② 主循环收尾时提示"仍有 N 个在跑"。完成回投走 `deliverSubAgentResult`，
   * 不等待 —— 主循环照常 finish（防"空轮等待"烧 token）。
   */
  backgroundSubAgents: Map<string, BackgroundSubAgentInfo>;
  /**
   * 后台子智能体「结果已回、等待主循环消费」缓冲（2026-10-09）。
   *
   * ★★★ 为什么必须有无阻塞唤醒（用户实测缺陷的根因修复）：
   *   后台子智能体（`call_agent async:true`）跑完后，主智能体常常已到"本轮无工具调用"的收尾点。
   *   若此时直接 finish：前端收到 `task:completed` → **关闭 SSE 流** → `task.subscribers` 归零 →
   *   之后所有 `browser_*` 只能回退**服务端 Playwright**（另一个浏览器，预览面板看不到）
   *   → pageAgent 等于停摆。表现就是用户说的「异步执行，主智能体一停，子智能体也不工作」。
   *   ⇒ 收尾时若 `backgroundSubAgents` 非空，则**不结束任务**（保持前端流开着、工具通道可用），
   *   把任务**挂起在等待点**（零 token，不空转），等后台结果到齐后唤醒主循环继续决策。
   */
  /** 已回待消费的后台结果（消费即清空） */
  pendingBackgroundResults: Array<{ agentName: string; text: string }>;
  /** 「等后台子智能体跑完」的挂起点；后台任务结束时（成功/失败）调用它唤醒主循环 */
  backgroundDrainWaiter?: () => void;
  /** 本任务内「子任务指纹 → 出现次数」：同类子任务反复现场生成时提示固化（见 shouldSuggestPersist）。
   *  任务级而非全局，是刻意的 —— 跨任务的重复统计靠空间记忆（见 recordSpawnedSubAgent）。 */
  specFingerprints?: Map<string, number>;
  /**
   * ★★★ 上下文压缩的摘要缓存（2026-10-01 加）。
   *
   * 为什么必须挂在 task 上：ReAct 主循环**每一步**都重新 loadMessages + 判超限 + compress，
   * 而 compress 对"保留窗口之外的整段前文"每次都要调一次 LLM 生成摘要 ——
   * 于是上下文越长，**每个 step 都白付一次摘要调用**（实测长会话每步都触发）。
   * 把「上次摘要覆盖的消息 id 前缀 + 摘要文本」缓存在任务上，下一步即可命中前缀、
   * 只对新增部分做增量摘要（甚至零调用），把 O(步数) 次摘要降到 O(1)。
   * 见 core `SummaryCache` 注释。
   */
  summaryCache?: SummaryCache;
  /** 子智能体各自的摘要缓存（key = parentToolCallId）—— 与主循环隔离，见子循环处注释。 */
  subSummaryCaches?: Map<string, SummaryCache>;
  /**
   * ★★★ 本任务的工作目录（绝对路径，2026-09-30 加）。
   *
   * 为什么必须挂在 task 上：工具执行时要把"工作目录"传给 `ToolContext.workspaceDir`，
   * 否则 file_read / file_list / code_search 等所有读类工具的**相对路径会解析到进程 cwd**
   * （用户报：「不是工作目录是当前目录？」—— 实测 `02-work` 一律 directory not found）。
   *
   * ★ 取值口径与提示词注入**必须一致**（`buildSystemPromptForBackend` 的 effectiveWorkspaceDir）：
   *   `params.workspaceDir`（前端下发）> `serverState.workspaceDir`（全局）。
   *   两处不同源会出现"提示词里说工作目录是 A，工具却在 B 里找文件"这种最难查的不一致。
   */
  workspaceDir?: string;
  /**
   * ★ P1-9（2026-10-07）：任务预算四件套里的 ② token 总预算 与 ③ 墙钟预算。
   * totalTokens 每步 LLM 调用后累加（usage 优先）；budgets 在 createTask 时从
   * 智能体 config_json 解析（resolveTaskBudgets，@yan-zhi/shared 唯一定义处）。
   * 触达预算**不硬杀**：跳出内层循环走与步数上限相同的「结账 → 自评 → 接力确认」块。
   */
  totalTokens?: number;
  budgets?: { tokenBudget: number; wallClockMs: number };
  /**
   * ★★★ 墙钟**预算基线**（2026-10-09）：预算判定用 `budgetBaselineAt`，**不是** `createdAt`。
   *
   * 为什么必须拆成两个字段（不要合并回 createdAt）：
   *   · `createdAt` 兼着两个**互斥**语义 —— ① 展示/审计的任务创建时刻；
   *     ② `cleanupTasks()` 的任务回收看门狗基准（`now - createdAt > 2h` 强杀）。
   *   · 预算接力需要**每批重置起点**（`budgetBaselineAt = Date.now()`），
   *     若直接改 createdAt，看门狗基准被一起前移 → 任务**永远收不回** → 内存泄漏。
   *   ★ 判据：一个字段被两处用**不同语义**读，改之前必须拆字段，不能复用。
   */
  budgetBaselineAt?: number;
  /**
   * ★★★ 等待抵扣累计（2026-10-09，见 shared/context-policy 的 TASK_WAIT_CREDIT_CAP_MS）：
   *   工具执行耗时里"等外部子进程/网络"的部分（如 python_exec 出片 5~8 分钟）不计入墙钟。
   *   由 executeTool 在**唯一工具出口**累加；预算判定时扣除。随任务对象回收，不落库。
   */
  waitCreditMs?: number;
  /**
   * ★ D1 可观测（2026-10-09）：prompt 缓存命中量。
   * · `lastCachedTokens` / `lastPromptTokens`：**最近一轮**的命中与总 prompt 量
   *   （判据：同会话连续两轮，`lastCachedTokens > 0` 说明前缀缓存生效）。
   * · `cachedTokensTotal`：本任务累计命中量（用于估算省了多少全价 token）。
   * 只做观测，不参与任何判定 —— 加它是为了"先能看见再优化"。
   */
  lastCachedTokens?: number;
  lastPromptTokens?: number;
  cachedTokensTotal?: number;
}

const tasks = new Map<string, LlmTask>();
const MAX_EVENTS = 10000; // SSE 事件缓冲上限，防止长任务内存泄漏
let playwrightAvailable: boolean | null = null; // Playwright 可用性缓存（null=未检测）

function emit(task: LlmTask, event: SSEEvent) {
  task.seq++;
  event.seq = task.seq;
  task.events.push(event);
  // 超出上限时丢弃最旧的事件（重连重放只保留最近 MAX_EVENTS 条）
  if (task.events.length > MAX_EVENTS) {
    task.events.splice(0, task.events.length - MAX_EVENTS);
  }
  for (const sub of task.subscribers) {
    try { sub(event); } catch {}
  }
}

function rowToMsg(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content || '',
    toolCalls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : undefined,
    toolCallId: row.tool_call_id || undefined,
    reasoningContent: row.reasoning_content || undefined,
    parentToolCallId: row.parent_tool_call_id || undefined,
    subAgentId: row.sub_agent_id || undefined,
    subAgentName: row.sub_agent_name || undefined,
    subAgentDepth: row.sub_agent_depth ?? undefined,
    createdAt: row.created_at,
  } as any;
}

function loadPlatform(platformId: string, userId: string): Platform | null {
  const row = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol || 'openai',
    apiUrl: row.api_url || '',
    headers: (() => { try { return JSON.parse(row.headers_json || '{}'); } catch { return {}; } })(),
  } as any;
}

/**
 * 按标识取模型。**复用 services/model-resolve 的 findModelRow**，不要在这里另写一套查询。
 *
 * ★ 为什么必须两种标识都认：一个模型有两个标识 —— 主键 `model.id`（如
 *   `agens-guest-agnes-3.0-flash`）与业务名 `model.model_id`（如 `agnes-3.0-flash`）。
 *   历史上写库用的是业务名，后来统一改成写主键（避免同业务名跨平台歧义），
 *   **但存量会话没有回填迁移** —— 那些老会话里存的还是业务名。
 *   只按主键查会让它们一律报「平台或模型不存在」，而前端下拉、模型平台测试都正常
 *   （它们走的是主键），表现为「模型明明在、点测试也通，就是发不出去」这种极难归因的现象。
 *
 * ★ 这里曾一度手写了「主键查不到就按 model_id 查」的兜底，但那是**重复造轮子且更弱**：
 *   findModelRow 除了两种标识，还处理了「同 API 名跨平台不串用」（带 platformId 时加平台约束）
 *   与「命中存量裸名时打 warn 提示迁移」，并有 test/model-resolve.test.ts 守着。
 *   同一件事在两处实现必然漂移，故改为直接调用。
 */
function loadModel(modelId: string, userId: string, platformId?: string): Model | null {
  const row = findModelRow(db, modelId, userId, platformId);
  if (!row) return null;
  return rowToModel(row, DEFAULT_CONTEXT_WINDOW);
}

/** list_models 工具执行：列出当前用户所有已启用且对模型可见的模型（可按 platformId/type/capability 过滤），
 *  返回语义化文本，供 LLM 选型（图片/视频/视觉/推理等任务指定模型）。
 *  可见性口径与前端模型下拉一致：查不到的平台/模型，智能体也不该动态选中。 */
function listAvailableModels(userId: string, args: Record<string, unknown>): string {
  const platformId = args.platformId as string | undefined;
  const typeFilter = args.type as string | undefined;
  const capFilter = args.capability as string | undefined;

  // 查平台（含过滤）：平台级总开关关掉即整平台不可见
  let platformRows: any[];
  if (platformId) {
    platformRows = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ? AND llm_enabled = 1').all(platformId, userId) as any[];
  } else {
    platformRows = db.prepare('SELECT * FROM platform WHERE user_id = ? AND llm_enabled = 1').all(userId) as any[];
  }
  if (platformRows.length === 0) return platformId ? `平台不存在或未对模型开放: ${platformId}` : '当前用户未配置任何可用于大模型的模型平台';

  const lines: string[] = [];
  let total = 0;
  for (const p of platformRows) {
    const models = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ? AND enabled = 1 AND visible = 1').all(p.id, userId) as any[];
    let matched: any[] = models;
    if (typeFilter) matched = matched.filter((m: any) => (m.type || 'llm') === typeFilter);
    if (capFilter) {
      matched = matched.filter((m: any) => {
        try { return (JSON.parse(m.capabilities_json || '[]')).includes(capFilter); } catch { return false; }
      });
    }
    if (matched.length === 0) continue;

    lines.push(`**平台 ${p.name}** (id: \`${p.id}\`, protocol: ${p.protocol || 'openai'})`);
    for (const m of matched) {
      total++;
      const caps = (() => { try { return JSON.parse(m.capabilities_json || '[]'); } catch { return []; } })();
      const type = m.type || 'llm';
      const alias = m.alias || m.model_id;
      const desc = m.description ? ` | 描述: ${m.description}` : '';
      const capStr = caps.length ? ` | 能力: ${caps.join(',')}` : '';
      lines.push(`  - ${alias} (model: \`${m.model_id}\`, id: \`${m.id}\`) [type=${type}${capStr}]${desc}`);
    }
  }

  if (total === 0) {
    const hint = typeFilter || capFilter ? `（过滤条件 type=${typeFilter || '-'} capability=${capFilter || '-'} 下无匹配）` : '';
    return `未找到可用模型${hint}。可用 list_models（不带过滤）查看全部模型。`;
  }
  lines.unshift(`共 ${total} 个可用模型：`);
  return lines.join('\n');
}

function loadMessages(convId: string): Message[] {
  // ★★★ 必须用白名单列（不含 system_prompt_snapshot）—— 见 db.ts:MESSAGE_LIST_COLS 注释。
  //   SELECT * 会把单条可达 200KB 的快照读进来，而 rowToMsg 立刻丢弃它：
  //   实测会话 deed2862 每步白读 183MB（快照占 99.8%），是「上下文越长越慢」的头号成因。
  const rows = db.prepare(`SELECT ${MESSAGE_LIST_COLS} FROM message WHERE conversation_id = ? ORDER BY created_at ASC`).all(convId) as any[];
  return rows.map(rowToMsg);
}

/** 加载子智能体消息：按 parent_tool_call_id 过滤，只取该子智能体自己的消息 */
function loadSubAgentMessages(convId: string, parentToolCallId: string): Message[] {
  // 同上：白名单列，避免每步把快照读进来又丢弃
  const rows = db.prepare(`SELECT ${MESSAGE_LIST_COLS} FROM message WHERE conversation_id = ? AND parent_tool_call_id = ? ORDER BY created_at ASC`).all(convId, parentToolCallId) as any[];
  return rows.map(rowToMsg);
}

// 工具结果单条上限：极端结果（如整页 DOM/网络日志几十上百 KB）入库和进入下轮上下文前先压缩，
// 保留头尾（头部通常是关键摘要，尾部常有分页/汇总信息），中段丢弃并在原位标注。
const MAX_TOOL_RESULT_CHARS = 48000;
function capToolResult(result: string): string {
  if (!result || result.length <= MAX_TOOL_RESULT_CHARS) return result;
  const head = 40000, tail = 6000;
  return result.slice(0, head)
    + `\n\n...[工具结果过长已压缩：原文 ${result.length} 字符，保留头 ${head} / 尾 ${tail}，中段省略]...\n`
    + result.slice(-tail);
}

function insertMessage(convId: string, userId: string, role: string, content: string, extra?: any): string {
  const id = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ts = Date.now();
  db.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id, convId, userId, role, content || null,
    extra?.toolCalls ? JSON.stringify(extra.toolCalls) : null,
    extra?.toolCallId || null,
    extra?.reasoningContent || null,
    extra?.systemPromptSnapshot || null,
    extra?.tokens || 0,
    extra?.parentToolCallId || null,
    extra?.subAgentId || null,
    extra?.subAgentName || null,
    extra?.subAgentDepth ?? null,
    ts,
  );
  return id;
}

function updateMessageContent(msgId: string, content: string, reasoning?: string, toolCalls?: any[], tokens?: number) {
  db.prepare(
    'UPDATE message SET content = ?, reasoning_content = ?, tool_calls_json = ?, tokens = COALESCE(?, tokens) WHERE id = ?',
  ).run(content, reasoning || null, toolCalls ? JSON.stringify(toolCalls) : null, tokens ?? null, msgId);
}

// ══════════════════════════════════════════════════════════════════════════
// 工具调用统一执行出口（P1 收敛，2026-10-04）
//
// ★ 为什么必须单点：主循环与子智能体循环各写一份 ~60 行的
//   「emit start → executeTool → 中止分支 → 错误串 → 钩子 → cap → 落库 → emit」，
//   已两次发生入口漂移（子智能体侧漏跑 runAfterToolHooks / 漏接权限），代码注释自认。
//   判据：凡是"工具执行完要做的事"，**每个执行工具的地方**都要跑到 —— 单点化后加新
//   副作用只改这里。
// ★ 中止必须落库 tool 结果（'[已中止]'）：否则库里留下孤儿 assistant.tool_calls
//   （无对应 tool 消息），本会话下次重放历史时上游 400 配对校验失败。
// ══════════════════════════════════════════════════════════════════════════

/** 子智能体归属字段（主循环不传 = 无归属） */
interface SubAgentOwnership {
  parentToolCallId: string;
  subAgentId: string;
  subAgentName: string;
  subAgentDepth: number;
}

/** 落库一条 tool 消息并向会话流推送 message:added（归属字段两处口径在这里对齐） */
function insertToolMessageAndEmit(
  task: LlmTask,
  convId: string,
  userId: string,
  toolCallId: string,
  content: string,
  ownership?: SubAgentOwnership,
): string {
  const extra = ownership
    ? {
        toolCallId,
        parentToolCallId: ownership.parentToolCallId,
        subAgentId: ownership.subAgentId,
        subAgentName: ownership.subAgentName,
        subAgentDepth: ownership.subAgentDepth,
      }
    : { toolCallId };
  const msgId = insertMessage(convId, userId, 'tool', content, extra);
  emit(task, {
    type: 'message:added',
    message: { id: msgId, role: 'tool', content, toolCallId, ...(ownership || {}) },
  });
  return msgId;
}

/**
 * 工具调用统一出口：执行（或取并发预执行结果）→ 事件 → 钩子 → 压缩落库 → 事件。
 * 主循环与子智能体循环共用；差异只通过 ownership 表达。
 * 中止异常在落库兜底消息后**原样上抛**，由调用方决定整体中止语义。
 */
/**
 * ★ P0-3（2026-10-07）：工具错误回执**带有效候选**。
 *
 * 2026 生产共识（function calling 最佳实践）：错误信息必须自带「怎么改」的上下文 ——
 *   「Error: no file at 'src/main.ts'. Files in src/: index.ts, app.ts」比光秃秃的
 *   「ENOENT」让模型当场自纠，省掉一轮盲试。pageAgent 的 emptyTargetHint 已是该模式
 *   （拉编号清单引导重试），这里把它推广为**全部工具的统一出口**。
 *
 * 当前覆盖：路径类错误（文件/目录不存在）→ 附上同目录现存条目（前 20 项）。
 * 取不到候选（目录也读不到等）就退回原始错误文本，绝不因补提示再抛错。
 */
async function enrichToolErrorReceipt(task: LlmTask, toolName: string, args: any, e: any): Promise<string> {
  const msg = e?.message || String(e);
  let hint = '';
  try {
    const p = typeof args?.path === 'string' ? args.path.trim() : '';
    if (p && /ENOENT|no such file|not found|不存在|cannot find|EISDIR|is not a/i.test(msg)) {
      const abs = resolveToolPath(p, task.workspaceDir);
      const { dirname } = await import('node:path');
      const dir = dirname(abs);
      const entries = await fsp.readdir(dir);
      const shown = entries.slice(0, 20).join('、');
      hint = `\n有效候选：目录 ${dir} 下现有 ${entries.length} 项${entries.length > 20 ? '（截取前 20）' : ''}：${shown}`;
    }
  } catch { /* 目录也读不到 → 不补提示，保留原始错误 */ }
  return `工具执行失败: ${msg}${hint}`;
}

async function runToolCallAndPersist(opts: {
  task: LlmTask;
  registry: ReturnType<typeof getToolRegistry>;
  convId: string;
  userId: string;
  /** 产物登记归属的助手消息 id（当前轮） */
  assistantMsgId: string;
  toolName: string;
  args: any;
  tcId: string;
  depth: number;
  toolDefs: any[];
  uiTools: Set<string>;
  /** 主循环并发 call_agent 已执行完的结果：跳过执行与 tool:start，仅走事件/钩子/落库 */
  precomputed?: string;
  ownership?: SubAgentOwnership;
}): Promise<string> {
  const { task, registry, convId, userId, assistantMsgId, toolName, args, tcId, depth, toolDefs, uiTools, precomputed, ownership } = opts;
  const subEvt = ownership ? { subAgentId: ownership.subAgentId } : {};
  // ★ 与主循环对齐：收集工具回传的 _meta（file_write 的落盘路径在这里），
  //   供产物登记钩子使用。用出参而非改返回类型（见 executeTool 参数注释）。
  const metaOut: { value?: Record<string, unknown> | null } = {};

  let result: string;
  if (precomputed !== undefined) {
    result = precomputed;
    emit(task, { type: 'tool:result', toolName, result, ...subEvt });
  } else {
    emit(task, { type: 'tool:start', toolName, args, ...subEvt });
    try {
      result = await executeTool(task, registry, toolName, args, tcId, uiTools, depth, toolDefs, metaOut);
    } catch (e: any) {
      if (isAbortError(e)) {
        try {
          insertToolMessageAndEmit(task, convId, userId, tcId, capToolResult('[已中止] 用户中断了工具执行'), ownership);
        } catch { /* 落库失败不影响中止流程（发送侧 sanitize 仍会兜底配对） */ }
        throw e;
      }
      result = await enrichToolErrorReceipt(task, toolName, args, e);
    }
    emit(task, { type: 'tool:result', toolName, result, ...subEvt });
  }

  // ★★★ 工具执行完的"副作用"走钩子（P2-3）：产物登记等由 services/artifact-hooks.ts
  //   注册，这里只负责跑。钩子 fail-open：某个钩子出错只 warn，不影响工具结果。
  await runAfterToolHooks(toolName, args, result, {
    taskId: task.id,
    conversationId: convId,
    userId,
    assistantMsgId,
    meta: (metaOut.value || null) as Record<string, unknown> | null,
  });

  // 入库前压缩，防止单条极端大结果撑爆消息表与下轮上下文
  const cappedResult = capToolResult(result);
  insertToolMessageAndEmit(task, convId, userId, tcId, cappedResult, ownership);
  return cappedResult;
}

/** 创建任务并启动 ReAct 循环 */
/**
 * 是否有用户任务正在执行（running 或 waiting_tool）。
 *
 * ★ 用途（2026-10-07 用户报「模型请求频率过高」）：后台 LLM 调用方（记忆整理/记忆抽取等）
 *   与主任务**共用同一个上游配额**，长任务运行期间并发打过去会叠加限流（429）。
 *   后台任务应主动避让，而不是和用户任务抢配额。
 */
export function hasActiveUserTasks(): boolean {
  for (const t of tasks.values()) {
    if (t.status === 'running' || (t.status as string) === 'waiting_tool') return true;
  }
  return false;
}

export function createTask(params: {
  conversationId: string;
  userId: string;
  platformId: string;
  modelId: string;
  userContent?: string;
  agentId?: string | null;
  appGuide?: string;
  systemPrompt?: string;
  tools?: any[];
  options?: { temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string };
  modeFlags?: { thinking?: boolean; plan?: boolean; answerOnly?: boolean };
  maxSteps?: number;
  origin?: string;
  offlinePolicy?: string;
  /** 交互式任务（前端在线，走 SSE）：UI 工具（ask_user 等）纳入工具列表，无人值守任务排除 */
  includeUiTools?: boolean;
  memoryExtractPlatformId?: string;
  memoryExtractModelId?: string;
  ontologyIds?: string[];
  /** 前端显式下发的工作目录：优先于全局 serverState.workspaceDir 注入 system prompt */
  workspaceDir?: string;
  /**
   * 工作目录边界守卫档位（2026-10-01）。前端随任务下发（与 workspaceDir 同一份设置来源）。
   * ask（默认）/ strict / off；未下发或非法值一律按 **ask**（fail-safe：宁可多问一次，不静默放行）。
   */
  pathGuard?: 'ask' | 'strict' | 'off';
}): string {
  // 幂等保护：同 conversationId 已有 running 任务则复用（避免重连重试创建多任务）
  for (const [id, existing] of tasks) {
    if (existing.conversationId === params.conversationId && existing.status === 'running') {
      return id;
    }
  }

  const taskId = 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // 会话级权限模式：以 conversation 表持久化值为准（前端下拉选择后随会话保存）
  // ★ 查不到/异常时兜底 readonly（fail-safe）：宁可误收窄也不静默放行写操作
  let permissionMode: PermissionMode = 'readonly';
  try {
    const row = db.prepare('SELECT permission_mode FROM conversation WHERE id = ?').get(params.conversationId) as any;
    permissionMode = normalizePermissionMode(row?.permission_mode);
  } catch { /* 列未迁移等异常时按只读收窄 */ }
  const task: LlmTask = {
    id: taskId,
    conversationId: params.conversationId,
    userId: params.userId,
    status: 'running',
    platformId: params.platformId,
    modelId: params.modelId,
    events: [],
    subscribers: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
    pendingToolCalls: new Map(),
    seq: 0,
    step: 0,
    origin: params.origin || 'chat',
    offlinePolicy: params.offlinePolicy,
    agentId: params.agentId ?? null,
    includeUiTools: !!params.includeUiTools,
    memoryExtractPlatformId: params.memoryExtractPlatformId || undefined,
    memoryExtractModelId: params.memoryExtractModelId || undefined,
    ontologyIds: params.ontologyIds,
    permissionMode,
    // ★ 工作目录：与提示词注入同源（前端下发 > 全局），供工具解析相对路径用。
    //   见 LlmTask.workspaceDir 注释 —— 两处不同源会产生"提示词说 A、工具在 B 找"的不一致。
    workspaceDir: params.workspaceDir?.trim() || serverState.workspaceDir || undefined,
    // ★ 越界守卫档位：非法/未下发 → ask（fail-safe，与 normalizePermissionMode 同取向）
    pathGuard: (params.pathGuard === 'strict' || params.pathGuard === 'off') ? params.pathGuard : 'ask',
    pendingInjects: [],
    injectedByClientId: new Map<string, string>(),
    pendingBackgroundResults: [],
    // 运行时生成子智能体的预算闸：智能体可配 maxSpawnPerTask（0 = 关闭该能力）
    spawnBudget: (() => {
      try {
        if (!params.agentId) return DEFAULT_MAX_SPAWN_PER_TASK;
        const row = db.prepare('SELECT config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(params.agentId, params.userId) as any;
        const cfg = row?.config_json ? JSON.parse(row.config_json) : {};
        const v = Number(cfg?.maxSpawnPerTask);
        if (Number.isFinite(v) && v >= 0) return Math.floor(v);
      } catch { /* 读不到用默认 */ }
      return DEFAULT_MAX_SPAWN_PER_TASK;
    })(),
    spawnCount: 0,
    // ★ P1-9：任务预算（token 总预算 + 墙钟）。agent.config_json.totalTokenBudget /
    //   wallClockMinutes 可覆盖；无智能体或非法值 → 默认（resolveTaskBudgets 内兜底）。
    totalTokens: 0,
    budgetBaselineAt: Date.now(),
    waitCreditMs: 0,
    budgets: (() => {
      try {
        if (!params.agentId) return resolveTaskBudgets(undefined);
        const row = db.prepare('SELECT config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(params.agentId, params.userId) as any;
        const cfg = (() => { try { return JSON.parse(row?.config_json || '{}'); } catch { return {}; } })();
        return resolveTaskBudgets(cfg);
      } catch { return resolveTaskBudgets(undefined); }
    })(),
    specFingerprints: new Map<string, number>(),
    backgroundSubAgents: new Map<string, BackgroundSubAgentInfo>(),
  };
  tasks.set(taskId, task);
  // ★★★ 运行中任务必须落库（2026-10-07 修）：此前 llm_task 只有 UPDATE/UPSERT 收尾写入，
  //   createTask 从不 INSERT → 进程被重启（dev 退出、覆盖率 --force-exit 等）时，
  //   「启动回收孤儿任务」（markOrphanTasksInterrupted）查 llm_task 恒为空 → 任务静默消失、
  //   界面零提示（用户实测：任务跑到一半，UI 没跑完就没了）。落库后重启路径才能把它标 interrupted。
  persistTaskRow(task);
  emit(task, { type: 'task:created', taskId, conversationId: params.conversationId });
  void runReActLoop(task, params);
  return taskId;
}

/**
 * ★★★ 多模态「注入期展开」（C1，2026-10-09）。
 *
 * ★ 背景：`Message.content` 只能是 string，`toApiMessage` 从不组装 `image_url`
 *   → **模型从未真正收到过图像**。截图分析此前是"假的"：靠模型自觉再调 `image_analyze`
 *   （而那个工具只在**前端**可执行，服务端全仓无 vision 调用）。
 *
 * ★ 设计取舍（**不把 content 改成 ContentBlock[] 落库**）：
 *   持久化仍存**纯字符串**（图片引用以 `已存档: <path>` 形式留在正文里 —— 人类可读可审计）；
 *   发送前把标记展开为 `imageParts`，`toApiMessage` 再组装成 `image_url` 块。
 *   理由见 `shared/types` 里 `imageParts` 的注释（content 被字符串拼接/估算/渲染三处消费，
 *   改成数组会静默产出 `[object Object]` 或抛错，牵动 db/压缩/前端）。
 *
 * ★★★ 只注入**最近 N 条**（历史图降级的简化版，C4 的先行部分）：
 *   图像块在历史里**全量回放**会让每轮请求都背着几十张图（vision token 与像素面积成正比）
 *   —— 长任务几十步下来成本爆炸。⇒ 只给最近 `IMAGE_INJECT_MAX_MESSAGES` 条带图，
 *   更早的**保持文本形态**（正文里的路径仍在，模型需要时可判断是否再读）。
 *
 * ★ 幂等与一次性：解析成功的消息不带 `imagePartsTried`（下次仍可注入，但只在最近 N 条内）；
 *   解析**失败**的标 `imagePartsTried=true` → 不再重试（避免每步都 stat 失效路径）。
 */
const IMAGE_INJECT_MAX_MESSAGES = 3;
/** 单次请求最多注入多少张图（多条消息各带图时合计上限） */
const IMAGE_INJECT_MAX_TOTAL = 4;
/** 图片标记：`已存档: <path>`（与 C6 归档正则同一格式） */
const IMAGE_ARCHIVE_MARK_RE = /已存档:\s*([^\n）)]+\.(?:png|jpe?g|webp|gif|bmp))/gi;
/**
 * ★★★ 工具结果里的 JSON 图片字段（C5 补齐，2026-10-10）。
 *
 * ★ 缺口（实测）：`computer_screenshot` 的返回是 `JSON.stringify(data, null, 2)`
 *   （形如 `"file": "C:\\...\\screenshot-123.png"`），**不含** `已存档: <path>` 文本标记
 *   ⇒ C1 的注入链路**接不到** computer-use 截图（视觉模型仍看不到，得靠 `image_analyze`）。
 * ★ 只认**已知字段名**（`file` / `keptTo`）—— 不泛匹配所有 ".png" 字符串，
 *   否则会把 `screenshotUrl`（URL）之类的也当路径去读（必然 stat 失败，白开销）。
 */
const IMAGE_JSON_FIELD_RE = /"(?:file|keptTo)"\s*:\s*"((?:[^"\\]|\\.)+\.(?:png|jpe?g|webp|gif|bmp))"/gi;

/**
 * 从一段文本里提取**图片文件路径**（单一实现，认多种形态）。
 *
 * ★ 为什么要抽函数而不是在注入处内联正则：图片路径在工具结果里的形态天然多样
 *   （`已存档:` 文本、JSON 的 `file` 字段…），若各处各写一份正则**必然漂移**——
 *   表现为"某种产出的图接不进来"（静默）。收口成一个纯函数，新增形态只改这里，
 *   且可直接真跑测试。
 * ★ 去重保序：同一路径出现两次只取一次（避免同图注入两遍、白耗 vision token）。
 */
export function extractImagePaths(text: string): string[] {
  const src = String(text || '');
  if (!src) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    // JSON 里的反斜杠转义需还原（`C:\\a\\b.png` → `C:\a\b.png`）
    const p = String(raw || '').replace(/\\\\/g, '\\').trim();
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  let hit: RegExpExecArray | null;
  IMAGE_ARCHIVE_MARK_RE.lastIndex = 0;
  while ((hit = IMAGE_ARCHIVE_MARK_RE.exec(src)) !== null) push(hit[1]);
  IMAGE_JSON_FIELD_RE.lastIndex = 0;
  while ((hit = IMAGE_JSON_FIELD_RE.exec(src)) !== null) push(hit[1]);
  return out;
}

async function attachImagesToMessages(messages: Message[]): Promise<void> {
  try {
    // 从后往前找"含标记且未尝试过"的消息，最多处理 N 条
    const candidates: Message[] = [];
    for (let i = messages.length - 1; i >= 0 && candidates.length < IMAGE_INJECT_MAX_MESSAGES; i--) {
      const m = messages[i];
      if (m.imagePartsTried) continue;
      // ★ C5：用共享提取函数判"这条消息里有没有图片路径"（认 `已存档:` 与 JSON file 两种形态）
      if (!extractImagePaths(m.content || '').length) continue;
      candidates.push(m);
    }
    if (!candidates.length) return;

    // 取 fs 适配器（core 内已在用；服务端 Electron 环境有实现）
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    let fs: any;
    try { fs = getPlatformAdapter().fs; } catch { return; } // 无适配器（如纯 Web 端）→ 跳过，保持现状
    if (!fs?.readFileBase64) return;

    let injected = 0;
    for (const m of candidates) {
      if (injected >= IMAGE_INJECT_MAX_TOTAL) break;
      // ★ C5：共享提取函数（认 `已存档:` 文本 与 JSON `file`/`keptTo` 字段）
      const paths = extractImagePaths(m.content || '');
      if (!paths.length) continue;
      const parts: Array<{ mime: string; base64: string }> = [];
      for (const p of paths) {
        if (injected + parts.length >= IMAGE_INJECT_MAX_TOTAL) break;
        try {
          const abs = resolveToolPath(p, currentWorkspaceDir());
          const exists = await fs.exists(abs).catch(() => false);
          if (!exists) continue; // 文件已清理/路径失效 → 跳过（不标记 tried，可能是别的工作目录）
          const base64 = await fs.readFileBase64(abs);
          if (!base64) continue;
          parts.push({ mime: mimeOfPath(abs), base64 });
        } catch { /* 单张失败不影响其它 */ }
      }
      if (parts.length) {
        m.imageParts = parts;
        injected += parts.length;
      } else {
        // ★ 一个都没读到 → 标记"已尝试"，避免每步重复 stat 同一批失效路径
        m.imagePartsTried = true;
      }
    }
  } catch (e: any) {
    // ★ fail-safe：注入图片失败**绝不能**影响主链路（退化为现状：纯文本发送）
    logger.warn('[llm-task] 图片注入失败（降级为纯文本）:', e?.message || e);
  }
}

/** 由扩展名推 MIME（只处理图片；其它返回 image/jpeg 兜底） */
function mimeOfPath(p: string): string {
  const ext = String(p).split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  };
  return map[ext] || 'image/jpeg';
}

/** 当前工作目录（用于把相对路径解析成绝对路径）；取不到返回 null（resolveToolPath 会自行兜底） */
function currentWorkspaceDir(): string | null {
  return serverState.workspaceDir || null;
}

/** `injectUserMessage` 的返回契约 */
export interface InjectResult {
  status: 'injected' | 'no-task';
  /** 命中幂等键（或本次落库）的真实消息 id —— 前端据此**本地立即回显**，不依赖 SSE 回放 */
  msgId?: string;
  /** 本次调用是否命中已有幂等记录（true=重复点击/重试，未新增消息） */
  duplicate?: boolean;
}

/** 该会话是否有运行中任务（有则返回 taskId）—— 供路由层在创建前做「注入复用」判定 */
export function findRunningTaskId(conversationId: string, userId?: string): string | null {
  for (const t of tasks.values()) {
    if (t.conversationId === conversationId && t.status === 'running' && (!userId || t.userId === userId)) return t.id;
  }
  return null;
}

/** 运行中注入用户追加消息（输入框「立即发送」）。
 *  语义：消息立即落库并推送给前端可见，模型在**下一轮** LLM 调用时从 loadMessages 读到它；
 *  为此把 msgId 记进 task.pendingInjects —— 本轮即便模型不再调工具也不 finish，多跑一轮把消息带上。
 *  与「排队等任务结束」的区别就在这里：排队消息不落库、不打断本轮，等任务结束后由前端起新任务。
 *
 *  ★★★ 幂等（2026-10-09 用户实报「同一个消息点击多次会发送 n 次」）：
 *    「立即发送」按钮此前无任何幂等 —— 用户连点几下就真的注入几条（库里多条同内容 user 消息，
 *    模型下一轮看到重复指令）。三层一起收口：
 *      ① 前端按 clientMsgId 做在途守卫（第二轮点击直接忽略）；
 *      ② 前端把队列条目 id 当幂等键随请求下发；
 *      ③ 本函数按 clientMsgId 去重（也覆盖网络重试：同一 id 第二次直接返回既有结果，不再落库）。
 *  @param clientMsgId 前端队列条目 id（幂等键）；缺省时退化为"不去重"（旧调用方兼容）。
 *  @returns {status:'injected', msgId, duplicate} | {status:'no-task'}（前端应走正常发送） */
export function injectUserMessage(conversationId: string, content: string, userId: string, clientMsgId?: string): InjectResult {
  const text = String(content || '');
  if (!text.trim()) return { status: 'no-task' };
  let target: LlmTask | undefined;
  for (const t of tasks.values()) {
    // 只注入到「本用户的、该会话的、运行中」任务：既防越权，也保证 pendingInjects 生效
    if (t.conversationId === conversationId && t.status === 'running' && t.userId === userId) { target = t; break; }
  }
  if (!target) return { status: 'no-task' };
  const key = String(clientMsgId || '').trim();
  // ★ 幂等命中（{clientMsgId → msgId} 记账，随任务存活）：重复点击 / 网络重试第二次直接复用同一 msgId，
  //   **不重复落库、不重复 emit**。命中即说明该内容早已进过 pendingInjects（或被消费过），
  //   直接回既有 msgId 让前端回显即可。
  if (key) {
    const hit = target.injectedByClientId.get(key);
    if (hit) return { status: 'injected', msgId: hit, duplicate: true };
  }
  const msgId = insertMessage(conversationId, target.userId, 'user', text);
  emit(target, { type: 'message:added', message: { id: msgId, role: 'user', content: text } });
  target.pendingInjects.push(msgId);
  if (key) target.injectedByClientId.set(key, msgId);
  return { status: 'injected', msgId };
}

/** 订阅任务事件（从 since 索引开始重放 + 后续实时事件） */
export function subscribe(taskId: string, since: number, onEvent: (event: SSEEvent) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  for (let i = since; i < task.events.length; i++) {
    try { onEvent(task.events[i]); } catch {}
  }
  task.subscribers.add(onEvent);
  // 前端重连：清除所有 pendingToolCalls 的断连宽限期 timer，工具调用继续等待前端结果
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.timer) { clearTimeout(pending.timer); pending.timer = undefined; }
  }
  return () => {
    task.subscribers.delete(onEvent);
    // 最后一个订阅者断开：给 pendingToolCalls 设 15 秒宽限期，超时则 reject（避免等 2 分钟）。
    // ⚠️ paused 态跳过：任务挂起是用户主动行为，宽限 reject 会把恢复后的工具链误杀。
    // ⚠️ 交互类工具（ask_user/confirm_user）同样跳过：问题挂着等用户回答，断连不该杀。
    if (task.subscribers.size === 0 && task.status === 'running' && !task.paused) {
      for (const [id, pending] of task.pendingToolCalls) {
        if (INTERACTIVE_TOOLS.has(pending.toolName || '')) continue;
        if (pending.timer) continue; // 已有 timer 不重复设
        pending.timer = setTimeout(() => {
          const p = task.pendingToolCalls.get(id);
          if (p) {
            task.pendingToolCalls.delete(id);
            p.reject(new Error(`前端断连，工具 ${p.toolName || id} 未在 15 秒内重连`));
          }
        }, 15000);
      }
    }
  };
}

/** 终止任务 */
export function abortTask(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.abortController.abort();
  task.status = 'aborted';
  // 放行「收尾等后台子智能体」的挂起点（否则它挂到后台任务自然结束才醒，abort 应立刻响应）
  try { task.backgroundDrainWaiter?.(); } catch {}
  task.backgroundDrainWaiter = undefined;
  // abort 优先于暂停：先放行所有暂停挂起者（它们醒来后看到 aborted 信号即退出）
  if (task.pauseWaiters) {
    for (const w of task.pauseWaiters) { try { w(); } catch {} }
    task.pauseWaiters = [];
  }
  task.paused = false;
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.timer) clearTimeout(pending.timer);
    // ★ 交互类工具在终止时也要落决策记录：用户在等回答的向导里可能已经答过几页
    //   （前端 cancelPendingConfirmation 会把已作答部分放进 summary 随结果回传）。
    //   但 abort 是"任务被终止"，前端此后不会再 POST tool-result ——
    //   所以这里只能记下"这个确认点曾被问到、任务在此终止"，避免事后完全无痕。
    if (INTERACTIVE_TOOLS.has(pending.toolName || '')) {
      const question = extractPendingQuestion(pending.args);
      if (question) {
        void appendTaskDecision(task.userId, task.conversationId, question, '[任务被用户终止，该项未完成确认]');
      }
    }
    pending.reject(new DOMException('Aborted', 'AbortError'));
  }
  task.pendingToolCalls.clear();
  syncPendingToolsJson(task);
}

/** 工具边界暂停：边界处（主循环迭代/子智能体循环/前端委托入口）挂起，正在执行的动作跑完为止。
 *  status 标记 paused 并广播 SSE，前端据此切按钮态 + 解除输入锁定。 */
export function pauseTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task || task.status !== 'running') return false;
  if (task.paused) return true;
  task.paused = true;
  task.status = 'paused';
  emit(task, { type: 'task:paused' });
  return true;
}

/** 恢复执行：放行所有挂起者，回到 running 并广播 SSE。 */
export function resumeTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task || !task.paused) return false;
  task.paused = false;
  task.status = 'running';
  emit(task, { type: 'task:resumed' });
  const waiters = task.pauseWaiters || [];
  task.pauseWaiters = [];
  for (const w of waiters) { try { w(); } catch {} }
  return true;
}

/**
 * 边界等待：task.paused 时挂起当前异步流程直到 resume / abort。
 * 每次醒来后复检 aborted —— abort 时已放行所有 waiter，这里做二次确认。
 * 必须在「每轮迭代开头 / 每个工具发起前」调用，保证挂起点之间没有半途动作。
 */
async function waitIfPaused(task: LlmTask): Promise<void> {
  if (!task.paused) return;
  await new Promise<void>((resolve) => {
    const waiter = () => resolve();
    (task.pauseWaiters ||= []).push(waiter);
  });
  if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  // resume 后若再次被 pause（快速往返），递归等待下一次放行
  if (task.paused) return waitIfPaused(task);
}

/**
 * 等待「在跑的后台子智能体跑完」（2026-10-09）：收尾时若还有后台任务，主循环挂在这里
 * 而不是直接 finish —— 保住前端 SSE 订阅（= 保住 browser_* 的前端执行通道）。
 *
 * ★ 零 token：只是等 promise，不调 LLM。
 * ★ abort 可打断；暂停（paused）也尊重 —— 复用 waitIfPaused 的挂起语义。
 * ★ 每有一个后台任务结束就唤醒一次，醒来复检：仍有人在跑 → 继续等（新启动的也算）。
 */
async function waitForBackgroundSubAgents(task: LlmTask): Promise<void> {
  while (task.backgroundSubAgents.size > 0) {
    if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await waitIfPaused(task);
    await new Promise<void>((resolve) => {
      task.backgroundDrainWaiter = resolve;
      // abort 时立刻放行（否则挂到天荒地老）
      const onAbort = () => { task.backgroundDrainWaiter = undefined; resolve(); };
      task.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
    task.backgroundDrainWaiter = undefined;
  }
}

function unattendedToolResult(toolName: string): string {
  return `[无人值守] 工具 ${toolName} 需要前端交互（用户输入/确认/浏览器界面），但当前没有任何前端在线，无法执行。`
    + `请基于已有信息自行决策并继续完成任务；如果确实必须用户参与，请在最终回复中明确说明需要用户补充什么。`;
}

// ══════════════════════════════════════════════════════════════════════════
// 工作目录边界守卫（2026-10-01）—— 允许根集合 / 弹窗授权 / 结果解析
// 判定逻辑在 services/path-guard.ts（纯判定，无 IO）；这里只做「拿到 need-auth 后怎么办」。
// ══════════════════════════════════════════════════════════════════════════

/** 授权弹窗在工具面上的保留名（前端 dispatchToolCall 按它出授权卡） */
const PATH_AUTH_TOOL = '_path_authorize';
/** 交互类工具集合之外单独管理：授权弹窗**必须无超时**（用户可能在忙别的，隔天回来也要能答） */
const PATH_AUTH_TIMEOUT_MS = 0;

/**
 * 越界访问审计（决策：越界**允许/拒绝都记**）。
 * fire-and-forget：审计失败绝不能影响主链路（与 appendTaskDecision 同取向）。
 */
function auditPathAccess(opts: {
  userId?: string;
  conversationId?: string;
  taskId?: string;
  toolName: string;
  decision: string;
  reason?: string;
  items: PathAccessItem[];
}): void {
  try {
    const stmt = db.prepare(
      `INSERT INTO path_access_audit
       (id, user_id, conversation_id, task_id, tool_name, action, target_path, raw_path, decision, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ts = Date.now();
    // 一次调用可能有多条越界项（doyz 的 file+out）→ 逐条落，便于按路径查询
    for (let i = 0; i < opts.items.length; i++) {
      const it = opts.items[i];
      stmt.run(
        'pa_' + ts.toString(36) + Math.random().toString(36).slice(2, 8) + i,
        opts.userId || null,
        opts.conversationId || null,
        opts.taskId || null,
        opts.toolName,
        it.action,
        it.absPath || null,
        it.rawPath || null,
        opts.decision,
        opts.reason || null,
        ts,
      );
    }
  } catch (e: any) {
    logger.warn('[path-guard] 审计写入失败（不影响主链路）:', e?.message || e);
  }
}

/**
 * 请求用户授权越界访问（复用 ask_user 那套「委托前端 → 弹窗 → POST 回传」通道）。
 *
 * 返回值：
 *   { ok: true }            → 用户已允许（白名单已写入）
 *   { ok: false, message }  → 未获授权，message 是给**模型**的指引（措辞要让模型**换路径**，
 *                             而不是重试 —— 否则形成"反复弹窗"的骚扰循环）
 */
async function requestPathAuthorization(
  task: LlmTask,
  toolName: string,
  items: PathAccessItem[],
  isCommand: boolean,
  /** 危险命令命中原因（危险命令单独授权时展示，普通路径授权为空） */
  dangerWhy?: string,
): Promise<{ ok: boolean; reason: string; message: string }> {
  // 无人值守（定时任务/后台工作流）：fail-safe **直接拒绝**，且**不挂起**。
  // 与 unattendedToolResult 既有口径一致 —— 定时任务没人守着，挂起 = 任务永久卡住。
  if (task.subscribers.size === 0) {
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'unattended', reason: '无前端在线，无法取得授权', items,
    });
    return {
      ok: false,
      reason: 'unattended',
      message: (dangerWhy ? `[无人值守] 危险命令（${dangerWhy}）需要人工确认，` : `[无人值守] 工具 ${toolName} 试图访问工作目录外的位置，`)
        + `无人可确认授权，已拒绝。请改用更安全的替代方案；若确实需要执行，请在最终回复中说明需要用户授权哪条命令/目录。`,
    };
  }

  const payload = {
    toolName,
    isCommand,
    dangerWhy: dangerWhy || '',
    workspaceDir: task.workspaceDir || '',
    items: items.map((it) => ({
      action: it.action,
      rawPath: it.rawPath,
      absPath: it.absPath,
    })),
  };

  let raw: string;
  try {
    raw = await executeToolViaFrontend(task, PATH_AUTH_TOOL, payload, '', 0, PATH_AUTH_TIMEOUT_MS);
  } catch (e: any) {
    return {
      ok: false,
      reason: 'frontend-error',
      message: `授权确认失败（前端不可达）：${e?.message || e}。本次未执行，请稍后重试或改用工作目录内的路径。`,
    };
  }

  const decision = parsePathAuthResult(raw);
  if (decision === 'deny' || decision === 'cancel') {
    const what = isCommand ? `命令 ${toolName}` : `${items.map((i) => i.rawPath).join(', ')}`;
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'denied', reason: decision, items,
    });
    return {
      ok: false,
      reason: decision,
      message: `用户未授权访问：${what}。请改用工作目录内的路径，或先向用户说明为什么要访问该位置并征求同意。`,
    };
  }
  // 允许：落白名单（会话级，父目录粒度）
  if (isCommand) {
    authorizeCommand(task.conversationId);
  } else {
    for (const it of items) {
      if (it.absPath) authorizeDir(task.conversationId, it.absPath);
    }
  }
  auditPathAccess({
    userId: task.userId, conversationId: task.conversationId, taskId: task.id,
    toolName, decision: 'allowed', reason: decision, items,
  });
  logger.warn(`[path-guard] 已授权 conv=${task.conversationId} tool=${toolName} scope=${decision} n=${items.length}`);
  return { ok: true, reason: decision, message: '' };
}

/** 解析前端授权卡的返回值。JSON 优先（`{decision}`），纯文本兜底（老前端/异常形态）。 */
function parsePathAuthResult(raw: string): 'once' | 'dir' | 'deny' | 'cancel' {
  const s = (raw || '').trim();
  if (!s) return 'deny';
  try {
    const obj = JSON.parse(s) as { decision?: string };
    const d = String(obj.decision || '');
    if (d === 'once' || d === 'dir' || d === 'deny' || d === 'cancel') return d;
  } catch { /* 非 JSON，走文本兜底 */ }
  if (/^allow(_once)?$/.test(s) || s === '允许' || s === '仅此次允许') return 'once';
  if (/^allow_dir$/.test(s) || s === '允许该目录') return 'dir';
  if (s === '取消' || /cancel/i.test(s)) return 'cancel';
  return 'deny';
}

/**
 * 从工具调用参数中健壮地提取 URL —— 模型常把 URL 放在非 url 字段（target/address/link/href/page 等），
 * 或直接把 arguments 写成 JSON 字符串。只认 args.url 会导致「缺少 url 参数」误报。
 * 与前端 stores/chat.ts extractUrlFromArgs 保持一致，迁移后端时遗漏，现补齐。
 */
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

/**
 * 容错解析 [TOOL_CALL] 内的 JSON —— 小模型常输出格式错误的 JSON（如 [" 替代 ,"、单引号替代双引号），
 * 严格 JSON.parse 会失败导致工具不执行。此函数尝试多种修复策略，最后用正则提取 name/arguments 兜底。
 */
function parseLenientToolCall(jsonStr: string): { name: string; arguments: any } | null {
  // 策略1：直接解析
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  // 策略2：修复常见 JSON 格式错误
  try {
    const fixed = jsonStr
      .replace(/"\s*\[\s*"/g, '","')   // [" → ,"（模型混淆 [ 和 ,）
      .replace(/'\s*:\s*'/g, '":"')    // 单引号键值 → 双引号
      .replace(/'\s*:\s*"/g, '":"')    // ': → ":
      .replace(/"\s*:\s*'/g, '":"')    // :' → :"
      .replace(/,\s*}/g, '}');          // 尾逗号
    const parsed = JSON.parse(fixed);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  // 策略3：正则提取 name 和 arguments 兜底
  const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/i);
  const argsMatch = jsonStr.match(/"arguments"\s*:\s*(\{[\s\S]*?\})/i);
  if (nameMatch) {
    let args: any = {};
    if (argsMatch) {
      try { args = JSON.parse(argsMatch[1]); } catch {
        try { args = JSON.parse(argsMatch[1].replace(/'\s*:\s*'/g, '":"').replace(/'\s*:/g, '":').replace(/:\s*'/g, ':"')); } catch {}
      }
    }
    return { name: nameMatch[1], arguments: args };
  }
  return null;
}

/**
 * 解析工具调用的 arguments 字符串。历史上这里直接 JSON.parse + 空 catch：
 * 流式拼接被截断/格式错误时静默回退 {}，工具以空参数执行，报
 * "code is required / path is required / command is required" —— 参数明明传了却像没传。
 * 现改为：直接解析 → 剥 markdown 代码围栏再解析 → 提取首个平衡 {...} 块；全部失败返回 null + 错误说明，
 * 由调用方落库 tool 结果消息（保持 tool_calls 配对）并提示模型重试，绝不带着空参数硬执行。
 */
function parseToolArguments(raw: string | undefined | null): { args: any; err?: string } {
  const s = String(raw || '').trim();
  if (!s || s === '{}') return { args: {} };
  try { return { args: JSON.parse(s) }; } catch {}
  // 剥 ```json ... ``` 围栏后重试
  const unfenced = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (unfenced && unfenced !== s) {
    try { return { args: JSON.parse(unfenced) }; } catch {}
  }
  // 提取首个平衡的 {...} 块（正确处理字符串内的引号/转义/嵌套）
  const start = unfenced.indexOf('{');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < unfenced.length; i++) {
      const ch = unfenced[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return { args: JSON.parse(unfenced.slice(start, i + 1)) }; } catch {}
          break;
        }
      }
    }
  }
  return { args: null, err: `arguments 不是合法 JSON（原始片段: ${s.slice(0, 200)}${s.length > 200 ? '…' : ''}）` };
}

/**
 * 检查工具调用是否缺少 schema 声明的必填参数，返回缺失的参数名列表。
 * 找不到工具定义或无 required 声明时返回空数组（不拦截）。
 * 兼容两种定义形态：OpenAI function 格式 {function:{name, parameters}} 与 {name, inputSchema}。
 * 背景：模型输出的 tool_call arguments 为空/残缺（输出被 maxTokens 截断、流中断、小模型幻觉）时，
 * 历史上会带着 {} 硬执行，报 "keys 不能为空 / 参数 x 必须是数字 / path 为必填项" 这类对模型无指导性的错误，
 * 模型盲目重试同样截断 → 死循环。在 executeTool 统一出口先拦一道，给出可行动的重试指引。
 *
 * ★ 导出（2026-09-29）是为了让测试类**直接调用真实实现**，而不是在测试里复刻一份 ——
 *   复刻版本改坏了测试也不会红，等于没测（与 tool-args-fidelity.test.ts 同一手法）。
 */
export function missingRequiredArgs(toolDefs: any[] | undefined, toolName: string, args: any): string[] {
  try {
    if (!Array.isArray(toolDefs) || !toolName) return [];
    const def = toolDefs.find((t: any) => t?.function?.name === toolName || t?.name === toolName);
    if (!def) return [];
    const schema = def.function?.parameters || def.inputSchema;
    const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
    if (required.length === 0) return [];
    const o = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    return required.filter((k) => {
      const v = (o as Record<string, unknown>)[k];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    });
  } catch {
    return [];
  }
}

/**
 * 原地给缺少 id 的工具调用补一个稳定 id。
 *
 * ★ 背景（2026-09-28 排障）：部分模型/网关在流式 function call 里不回 id，导致
 *   ① 落库的 tool 结果消息 tool_call_id 为空，assistant.tool_calls 与 tool 消息**无法配对**；
 *   ② client.sanitizeToolMessages 会剥掉「id 为空」的 tool_call 与对应 tool 消息，
 *      模型下一轮**看不到自己刚调用过什么、也看不到工具结果** → 反复重做同一调用：
 *      典型表现是「工具明明成功执行（文件也生成了），模型却以为没做，接着空转重试」。
 *   这里在落库前给每个缺失 id 的调用补一个合成 id，让配对完整、历史可见。
 */
function ensureToolCallIds(toolCalls: any[]): void {
  (toolCalls || []).forEach((tc, i) => {
    if (!tc) return;
    if (typeof tc.id === 'string' && tc.id.trim()) return;
    tc.id = `call_local_${Date.now().toString(36)}_${i}`;
  });
}

/**
 * 判定是否为中止类错误。client.ts 会把 fetch 流中断包装成普通 Error("请求被中止（…）")，
 * parseSSE 抛出的 DOMException 消息为 "This operation was aborted"——两者 name 都可能不是
 * 'AbortError'，只判 name 会把用户主动中止/流中断误标为「任务失败」。
 */
function isAbortError(e: any): boolean {
  if (e?.name === 'AbortError') return true;
  const msg = String(e?.message || e || '');
  return /请求被中止|operation was aborted|was aborted/i.test(msg);
}

/**
 * 从 content 中解析所有 [TOOL_CALL] 块和 <function=xxx> XML 块（大小写不敏感），
 * 返回工具调用数组 + 清理后的 content + 被跳过的「只有名字没参数」的工具名。
 *
 * ★★★ 空参防护（2026-09-29，与 `client.ts:toApiMessage` 的主因修复配套）：
 *   ★★★ 必须区分两种"空"，它们的正确处置**相反**（2026-09-29 第二次修正，我第一版搞混了）：
 *
 *   (A) **模型显式写了空参数体** —— `[TOOL_CALL]{"name":"web_search","arguments":{}}[/TOOL_CALL]`。
 *       → **照常产出调用**。理由：这是一次"意图明确但参数没给全"的调用，
 *         放行后由 `missingRequiredArgs` 拦下并回一条**可自纠**的提示
 *         （"缺 query 参数，请重调 web_search"）→ 模型据此修正 → 任务继续。
 *         这是**既有且正确**的行为（react-loop 场景2/4 守护的正是它），
 *         跳掉它反而会让模型拿不到任何反馈 → 只能干等或重说一遍。
 *
 *   (B) **模型根本没写出参数体** —— `<function=python_exec></function>`，
 *       或被输出上限截断的 `[TOOL_CALL]{"name":"python_exec"}[/TOOL_CALL]`（连 `arguments` 键都没有）。
 *       → 若该工具**声明了必填参数**，记入 `skipped` 而**不产出调用**。
 *         理由：这不是"调用缺参"，而是**输出没生成完**。产出空参调用会被落库、
 *         下一轮回放时被模型模仿成"原来可以不带参数"→ 自我强化退化。
 *         交给调用方提示"请补上参数体重发"，比落一条空参历史干净。
 *
 *   ⇒ 判据是**参数键是否存在**（`arguments` 字段有没有），**不是值是否为空对象**。
 *
 *   无必填参数的工具（`list_sub_agents` 等）与"拿不到工具定义"的情况**一律照常产出** ——
 *   否则会把合法的无参调用误杀（这个副作用比假空参更严重）。
 */
export function parseTextModeToolCalls(
  fullContent: string,
  toolDefs?: any[],
): {
  toolCalls: { id: string; name: string; arguments: string }[];
  cleanedContent: string;
  /** 只写了工具名、**连参数体都没写**（非"写了空对象"），且该工具有必填参数 → 工具名列表 */
  skipped: string[];
} {
  const toolCalls: { id: string; name: string; arguments: string }[] = [];
  const skipped: string[] = [];
  /** 该工具是否声明了必填参数。拿不到定义时返回 false → 保守产出，绝不误杀无参工具。 */
  const needsArgs = (name: string) => missingRequiredArgs(toolDefs, name, {}).length > 0;

  // 大小写不敏感匹配 [TOOL_CALL]...[/TOOL_CALL]，容忍模型输出 [/toOL_CALL] 等变体
  const re = /\[TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[\/TOOL_CALL\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullContent)) !== null) {
    const rawJson = m[1];
    const parsed = parseLenientToolCall(rawJson);
    if (!parsed) continue;
    // ★ (B) 判据：原文里**根本没有 arguments 键**（不是"值为 {}"）→ 视为输出未生成完
    const hasArgsKey = /"arguments"\s*:/.test(rawJson);
    if (!hasArgsKey && needsArgs(parsed.name)) { skipped.push(parsed.name); continue; }
    toolCalls.push({
      id: `text_tc_${Date.now()}_${toolCalls.length}`,
      name: parsed.name,
      arguments: JSON.stringify(parsed.arguments || {}),
    });
  }
  // 兼容 <function=tool_name>{"arguments":...}</function> XML 格式（某些模型用这种格式）
  const xmlRe = /<function\s*=\s*(\w+)\s*>\s*(\{[\s\S]*?\})?\s*<\/function>/gi;
  while ((m = xmlRe.exec(fullContent)) !== null) {
    const toolName = m[1];
    // ★ (B) 判据：**参数体整体缺失**（`<function=x></function>`）→ 输出未生成完。
    //   注意 `{}` 这种"显式空对象"仍算"写了参数体"，按 (A) 产出（让后端给自纠提示）。
    if (!m[2] || !m[2].trim()) {
      if (needsArgs(toolName)) { skipped.push(toolName); continue; }
    }
    let args: any = {};
    if (m[2] && m[2].trim()) {
      try { args = JSON.parse(m[2]); } catch { args = parseLenientToolCall(m[2])?.arguments || {}; }
    }
    toolCalls.push({
      id: `text_tc_${Date.now()}_${toolCalls.length}`,
      name: toolName,
      arguments: JSON.stringify(args),
    });
  }
  // 始终清理 [TOOL_CALL] 和 <function=xxx> 标记（含不完整块），避免前端"正在调用工具"chip 永驻
  const cleanedContent = fullContent
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/gi, '')
    .trim();
  return { toolCalls, cleanedContent, skipped };
}

/** 工具参数归一化兜底：模型文本模式工具调用常把必填参数放错字段或漏字段名，按工具语义补齐。 */
function normalizeToolArgs(toolName: string, args: any): any {
  if (!args || typeof args !== 'object') return args;
  const a: Record<string, unknown> = { ...args };
  if (toolName === 'browser_navigate' || toolName === 'browser_open_external') {
    if (!a.url || !(a.url as string).trim()) {
      const u = extractUrlFromArgs(a);
      if (u) a.url = u;
    }
  }
  return a;
}

/**
 * 同批多导航守卫：浏览器是单活动页状态机，同一批工具调用里出现多个 browser_navigate
 * 会互相覆盖，只有最后一个页面留存，中途的读取也只能读到当前页。
 * 处理：只保留第一个在当前页执行，其余标记 openInNewTab —— BrowserNavigateTool 会将其
 * 转为新开标签页（返回 tabId），模型可用读取工具的 tabId 参数分别读取各页内容。
 */
function markDuplicateNavigations(toolCalls: any[]): Set<string> {
  const ids = new Set<string>();
  let seen = 0;
  for (const tc of toolCalls || []) {
    const name = tc?.function?.name || tc?.toolName || '';
    if (name === 'browser_navigate') {
      seen++;
      if (seen > 1 && tc?.id) ids.add(String(tc.id));
    }
  }
  return ids;
}


/** 前端提交工具执行结果 */
export function resolveToolResult(taskId: string, callId: string, result: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  const pending = task.pendingToolCalls.get(callId);
  if (!pending) return;
  task.pendingToolCalls.delete(callId);
  if (pending.timer) clearTimeout(pending.timer);
  syncPendingToolsJson(task);
  pending.resolve(result);
  // ★ 交互类工具的回答必须落「任务决策记录」（硬性要求：用户确认过的内容写入空间记忆，
  //   同目录新会话不再重复询问）。fire-and-forget：落盘失败不影响回答主链路。
  if (INTERACTIVE_TOOLS.has(pending.toolName || '')) {
    const question = extractPendingQuestion(pending.args);
    // 记录"答了什么"：优先用结果里的 summary（前端在向导中途关闭时会把**已作答的部分**
    // 以文本回传 —— 那几页同样是用户拍板过的决定，不能因为没走完就丢掉）；
    // 否则退回原始 result（ask_user 的回答本身就是纯文本）。
    const answer = extractAnswerText(result);
    if (question && answer) {
      void appendTaskDecision(task.userId, task.conversationId, question, answer);
    }
  }
}

/** 从工具结果里取出「用户答了什么」的可读文本。
 *  confirm_user 的结果可能是 {cancelled, title, answers, summary} 形状；
 *  中途关闭向导时 summary 只含已作答的部分（前端刻意保留）。 */
export function extractAnswerText(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') {
    const raw = result.trim();
    if (!raw) return '';
    // 前端把结果统一字符串化（JSON.stringify）后才 POST，这里还原成对象再取可读文本
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        const fromObj = extractAnswerText(parsed);
        if (fromObj) return fromObj;
      } catch { /* 非 JSON，按纯文本处理 */ }
    }
    return raw;
  }
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
    if (summary) return summary;
    // 没有 summary：从 answers 数组自己拼（兜底，防前端漏传字段）
    if (Array.isArray(r.answers)) {
      return (r.answers as Record<string, unknown>[])
        .map((a) => {
          const q = String(a?.question || '').trim();
          const ans = String(a?.answer || '').trim();
          if (!q && !ans) return '';
          return `Q: ${q}\nA: ${ans || '(未作答)'}`;
        })
        .filter(Boolean)
        .join('\n\n');
    }
    return '';
  }
  return '';
}

/** 从交互工具的入参提取"问了什么"（ask_user 取 question；confirm_user 取标题+各页问题）。导出供测试 */
export function extractPendingQuestion(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  if (typeof a.question === 'string' && a.question.trim()) return a.question;
  if (Array.isArray(a.pages)) {
    const qs = (a.pages as Record<string, unknown>[])
      .map((p) => String(p?.question || '').trim())
      .filter(Boolean);
    const title = typeof a.title === 'string' ? a.title.trim() : '';
    return [title, ...qs].filter(Boolean).join(' / ');
  }
  return '';
}

/** 运行中任务落库（INSERT OR REPLACE）：重启回收与被中断提示都依赖这一行存在。 */
function persistTaskRow(task: LlmTask): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO llm_task (id, user_id, conversation_id, origin, status, step, error, pending_tool_json, params_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      task.id, task.userId, task.conversationId, task.origin || 'chat', task.status, task.step || 0,
      task.error || null, null, null, task.createdAt, Date.now(),
    );
  } catch (e) { logger.warn('[task] 任务落库失败（不阻塞执行）:', e); }
}

/** 状态变更同步落库（完成/失败/中断都调它，保证 DB 行与内存一致）。 */
function persistTaskStatus(task: LlmTask): void {
  try {
    db.prepare('UPDATE llm_task SET status = ?, step = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(task.status, task.step || 0, task.error || null, Date.now(), task.id);
  } catch { /* 落库失败不阻塞 */ }
}

/** 把当前 pending 工具调用写进 llm_task.pending_tool_json（服务重启后仍能查到"卡在等谁"） */
function syncPendingToolsJson(task: LlmTask): void {
  try {
    const arr = [...task.pendingToolCalls.values()].map((p) => ({
      callId: p.callId,
      toolName: p.toolName,
      requestedAt: p.requestedAt,
    }));
    db.prepare('UPDATE llm_task SET pending_tool_json = ? WHERE id = ?')
      .run(JSON.stringify(arr), task.id);
  } catch { /* 列未迁移等异常不阻塞工具链 */ }
}

/** 获取用户的活动任务 */
export function getActiveTasks(userId: string, conversationId?: string): any[] {
  const result: any[] = [];
  for (const task of tasks.values()) {
    if (task.userId !== userId) continue;
    if (task.status !== 'running') continue;
    if (conversationId && task.conversationId !== conversationId) continue;
    result.push({
      id: task.id,
      conversationId: task.conversationId,
      status: task.status,
      eventCount: task.events.length,
      createdAt: task.createdAt,
      // 等待中的前端工具（供前端 reconnectActiveTask 判断会话是否卡在等用户输入）
      pendingTools: [...task.pendingToolCalls.values()].map((p) => ({ callId: p.callId, toolName: p.toolName })),
    });
  }
  return result;
}

/** 获取任务信息 */
export function getTask(taskId: string): LlmTask | undefined {
  return tasks.get(taskId);
}

// ── 会话级通知总线 ──
// 为什么需要：原先只有「任务级」SSE，任务一结束就没有任何订阅方了。
// 后台工作流跑完时那一轮对话往往早已结束，反写内容只能等下次刷新才可见。
// 这层总线让「不属于任何运行中任务的消息」也能实时推给在线前端，
// 同时作为后续其他通知类能力（定时提醒、异步工具回调、外部事件入站等）的公共底座。
const conversationListeners = new Map<string, Set<(e: SSEEvent) => void>>();

/** 订阅某个会话的事件（与任务无关）。返回取消订阅函数。 */
export function subscribeConversation(conversationId: string, onEvent: (e: SSEEvent) => void): () => void {
  let set = conversationListeners.get(conversationId);
  if (!set) { set = new Set(); conversationListeners.set(conversationId, set); }
  set.add(onEvent);
  return () => {
    set!.delete(onEvent);
    if (set!.size === 0) conversationListeners.delete(conversationId);
  };
}

/** 向会话的所有在线订阅方推事件；无人在线时静默（内容已落库，刷新即可见）。 */
function emitConversation(conversationId: string, event: SSEEvent): void {
  const set = conversationListeners.get(conversationId);
  if (!set) return;
  for (const cb of [...set]) {
    try { cb(event); } catch { /* 单个订阅者异常不影响其他人 */ }
  }
}

/** 清理已完成的任务（定期调用） */
export function cleanupTasks(maxAgeMs: number = 30 * 60 * 1000) {
  const now = Date.now();
  const maxRunMs = 2 * 60 * 60 * 1000; // running 任务最大运行时长 2 小时
  for (const [id, task] of tasks) {
    if (task.status !== 'running' && now - task.createdAt > maxAgeMs) {
      tasks.delete(id);
      forgetTaskScopedState(id); // ★ A5：一并清任务级 Map（此前**永不清理** → 无界增长）
    }
    // running 任务超 2 小时强制中止并清理（防内存泄漏）
    if (task.status === 'running' && now - task.createdAt > maxRunMs) {
      try { task.abortController.abort(); } catch {}
      task.status = 'failed';
      task.error = '任务运行超时（超过 2 小时）';
      tasks.delete(id);
      forgetTaskScopedState(id); // ★ A5：同上
    }
  }
  // ★★★ A5（2026-10-09）：`autoDiagnoseLastAt` 是**会话级 45s 节流**表，
  //   键是 conversationId（不是 taskId）⇒ **不能在任务终态删**（删了节流失效、
  //   同一会话连续编辑会重复跑诊断）。它按**时间**淘汰：只保留仍在节流窗口内的条目。
  //   ★ 用 `pruneAutoDiagnoseThrottle()`（函数调用）而非直接引用 —— 该 Map 声明在文件
  //     更靠后处，直接引用虽在"定时器 5 分钟后才跑"的时序下不会触发 TDZ，
  //     但那依赖时序巧合；走函数调用则**完全不依赖声明位置**（本仓踩过 TDZ 类问题）。
  pruneAutoDiagnoseThrottle(now);
}

/**
 * ★★★ A5（2026-10-09）：清理**任务级**辅助状态。
 *
 * ★ 为什么必须（实测）：`verifyStateByTask`（key = `task.id`）此前**只有写入、从不删除**
 *   → 每个跑过的任务永久留一条（`{touched, verified, nudges}`）→ 长跑进程/高频会话下
 *   **无界增长**（内存缓慢泄漏，且不可观测）。
 * ★ 为什么只清 `verifyStateByTask`：另一个 Map `autoDiagnoseLastAt` 的键是
 *   **conversationId**（会话级节流表），语义不同 —— 在任务终态删它会**破坏节流**
 *   （见 `pruneAutoDiagnoseThrottle` 的时间淘汰）。
 * ★ 判据：**同一处声明、键语义不同的两个 Map，清理策略必须分别定** ——
 *   "顺手一起删"会把节流表删坏（那是另一个方向的 bug）。
 */
function forgetTaskScopedState(taskId: string): void {
  verifyStateByTask.delete(taskId);
}

/** 按时间淘汰会话级自动诊断节流表（见 `autoDiagnoseLastAt` 注释） */
function pruneAutoDiagnoseThrottle(now: number): void {
  for (const [convKey, at] of autoDiagnoseLastAt) {
    if (now - at > AUTO_DIAGNOSE_INTERVAL_MS) autoDiagnoseLastAt.delete(convKey);
  }
}

/**
 * ★★ A5（2026-10-09）：辅助状态的**规模观测出口**（供守门测试与运维排查）。
 *
 * ★ 为什么必须导出：这两个 Map 此前**没有任何可观测手段** —— 泄漏是"看不见"的
 *   （与"记忆体积可观测"同族：先能看见，才谈治理）。规模可观测后，
 *   守门测试才能**真跑**断言"清理真的生效"，而不是只查源码字符串。
 * ★ 只读（返回数字），不改任何状态。
 */
export function auxStateSizes(): { verifyState: number; autoDiagnoseThrottle: number } {
  return { verifyState: verifyStateByTask.size, autoDiagnoseThrottle: autoDiagnoseLastAt.size };
}

/**
 * ★★★ 启动时回收上次进程遗留的孤儿任务：DB 里 running/waiting_tool → interrupted。
 *
 * ★★★ 区分「开发热重载」与「真实重启」（2026-10-09，high）：
 *   背景（实据）：实测 16 次任务中断里 **13 次是「服务重启，任务被中断」**，且时间**聚集在开发日**
 *   （10-07 一天 9 次）—— `apps/server/scripts/dev.cjs:101` 用 `tsx watch` 启动，
 *   **每改一次源码就重启一次进程**，正在跑的任务被整批标 interrupted。用户体感就是
 *   「任务老是跑不起来 / 后面的任务执行不了」，而归因却是"会话太多"（相关而非因果）。
 *
 *   两种重启的**后果完全不同**：
 *     · 开发热重载：任务计划（DB 的 task_plan_json）、进度明细（工作目录 progress.md）、
 *       成片等产物**全都在**，用户发一句「继续」就能接上 → 应提示"可继续"而非"重发"。
 *     · 真实重启/崩溃：用户主动退出或进程被系统杀掉，同样有落盘产物，但语义上更接近"意外"。
 *
 *   ⇒ 判据不是"重启了就一律 interrupted"，而是**告诉用户"东西还在、能接着做"**。
 *   ★ 标记来源：`YZ_HOT_RELOAD=1`（由 `apps/server/scripts/dev.cjs` 注入；生产路径不设）
 *     —— 与启动器同源，不臆造判据。生产行为**完全不变**（未设该变量时走原分支）。
 *
 * @returns 回收条数
 */
export function markOrphanTasksInterrupted(): number {
  let n = 0;
  // ★ 只认显式注入的标记：未设 = 生产/真实重启 → 保持既有行为（零风险）
  const hotReload = process.env.YZ_HOT_RELOAD === '1';
  try {
    const rows = db.prepare("SELECT id, conversation_id, user_id FROM llm_task WHERE status IN ('running','waiting_tool')").all() as Array<{ id: string; conversation_id: string; user_id?: string }>;
    for (const r of rows) {
      try {
        const errText = hotReload
          ? '开发热重载（tsx watch）中断，计划与进度已保留，可直接继续'
          : '服务重启，任务被中断';
        // ★ 热重载不再叫「interrupted」——它**不是失败**，而是一次可续的暂停。
        //   用独立状态让前端/查询能区分「可继续」与「已中断」，避免用户以为要重头再来。
        const nextStatus = hotReload ? 'resumable' : 'interrupted';
        db.prepare('UPDATE llm_task SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(nextStatus, errText, Date.now(), r.id);
        // ★ 可见提示（2026-10-07）：重启把任务打断时，此前**界面零痕迹**（用户只看到任务凭空消失）。
        //   这里往原会话补一条说明，用户知道发生了什么、能直接重发。
        try {
          const uid = r.user_id || (db.prepare('SELECT user_id FROM conversation WHERE id = ?').get(r.conversation_id) as any)?.user_id || 'guest';
          const note = hotReload
            ? '⚡ 开发热重载（改代码触发）暂停了正在运行的任务。**任务计划与进度均已保留**，直接发一句「继续」即可接着做（不必重发原要求）。'
            : '⚠️ 应用重启，正在运行的任务已中断。需要继续的话把要求再发一次即可（已完成的工作产物仍在）。';
          insertMessage(r.conversation_id, uid, 'assistant', note);
        } catch { /* 补提示失败不影响回收 */ }
        n++;
      } catch {}
    }
  } catch { /* llm_task 表不存在则跳过 */ }
  // 内存中的任务本次启动不会有孤儿（新进程），清空即可
  return n;
}

/** ★ 该任务是否处于「可继续」状态（开发热重载暂停；计划/进度/产物都在）。
 *  供前端与后续「一键继续」入口判断：resumable 与 interrupted 的 UX 不同 —— 前者应给"继续"，
 *  后者才需要"重发」。 */
export function isResumableTask(taskId: string): boolean {
  try {
    const row = db.prepare('SELECT status FROM llm_task WHERE id = ?').get(taskId) as { status?: string } | undefined;
    return row?.status === 'resumable';
  } catch { return false; }
}

/** 从 DB 查 llm_task 行（任务不在内存时，前端仍能查到"已中断"而不是 404） */
export function getTaskRow(taskId: string): any | undefined {
  try {
    return db.prepare('SELECT id, conversation_id, status, step, error, created_at, pending_tool_json FROM llm_task WHERE id = ?').get(taskId) as any | undefined;
  } catch {
    return undefined;
  }
}

// ============================================================
// ReAct 循环（后端独立运行）
// ============================================================
async function runReActLoop(task: LlmTask, params: {
  conversationId: string;
  userId: string;
  platformId: string;
  modelId: string;
  userContent?: string;
  agentId?: string | null;
  appGuide?: string;
  systemPrompt?: string;
  tools?: any[];
  options?: { temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string };
  modeFlags?: { thinking?: boolean; plan?: boolean; answerOnly?: boolean };
  maxSteps?: number;
  includeUiTools?: boolean;
  workspaceDir?: string;
}) {
  const { conversationId: convId, userId, options } = params;
  // ★★★ 运行参数（温度/最大输出/最大步数）**每轮实时读库**，不再用创建任务时的快照。
  //
  // 为什么必须这样（用户 2026-09-28 报「编辑智能体改了最大步数/最大 Token 不立刻生效」）：
  //   params.options / params.maxSteps 由前端在**点发送那一刻**组装（`useChat.ts:2454-2461`、
  //   `chat.ts:1757`），而 maxSteps 在循环开始前就被烧成常量。用户任务跑着去编辑智能体改参数，
  //   改动只落库、发不到已经启动的任务 → 这一轮继续用旧值（表现为"要重发/刷新才生效"）。
  //   改成每轮现读后：**下一轮 LLM 调用即用新值**，无需重发、无需刷新。
  //
  // 语义边界（刻意保留）：
  //   · 前端/定时任务**显式传入**的值优先（`params.options.xxx !== undefined`）——它们是"本次任务的
  //     调用方意图"（如定时任务读库后显式下发），不应被后续编辑悄悄改写；
  //   · 未显式传入的项 → 回落到「智能体现值」→ 再回落到原有默认。
  //     `params.options` 存在但某字段为 undefined 时（前端就是只传了非空字段），仍然回落实时读。
  const readLiveParams = () => {
    if (!params.agentId) return { temperature: undefined as number | undefined, maxTokens: undefined as number | undefined,
      topP: undefined as number | undefined, frequencyPenalty: undefined as number | undefined,
      presencePenalty: undefined as number | undefined, reasoningEffort: undefined as string | undefined,
      maxReActSteps: undefined as number | undefined };
    try {
      // 参数列 + config_json 一次读全（reasoningEffort / maxReActSteps 在 config_json 里）
      const row = db.prepare(
        'SELECT temperature, max_tokens, top_p, frequency_penalty, presence_penalty, config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)',
      ).get(params.agentId, userId) as any;
      if (!row) return { temperature: undefined, maxTokens: undefined, topP: undefined,
        frequencyPenalty: undefined, presencePenalty: undefined, reasoningEffort: undefined, maxReActSteps: undefined };
      const cfg = (() => { try { return JSON.parse(row.config_json || '{}'); } catch { return {}; } })();
      return {
        temperature: typeof row.temperature === 'number' ? row.temperature : undefined,
        maxTokens: typeof row.max_tokens === 'number' ? row.max_tokens : undefined,
        topP: typeof row.top_p === 'number' ? row.top_p : undefined,
        frequencyPenalty: typeof row.frequency_penalty === 'number' ? row.frequency_penalty : undefined,
        presencePenalty: typeof row.presence_penalty === 'number' ? row.presence_penalty : undefined,
        reasoningEffort: typeof cfg?.reasoningEffort === 'string' ? cfg.reasoningEffort : undefined,
        maxReActSteps: typeof cfg?.maxReActSteps === 'number' && cfg.maxReActSteps > 0 ? cfg.maxReActSteps : undefined,
      };
    } catch { /* 读库失败按显式传入值 */ return { temperature: undefined, maxTokens: undefined, topP: undefined,
      frequencyPenalty: undefined, presencePenalty: undefined, reasoningEffort: undefined, maxReActSteps: undefined }; }
  };

  /** 合并出一轮的生效参数：显式传入 > 智能体现值 */
  const effectiveOptions = () => {
    const live = readLiveParams();
    return {
      temperature: options?.temperature !== undefined ? options.temperature : live.temperature,
      maxTokens: options?.maxTokens !== undefined ? options.maxTokens : live.maxTokens,
      topP: options?.topP !== undefined ? options.topP : live.topP,
      frequencyPenalty: (options as any)?.frequencyPenalty !== undefined ? (options as any).frequencyPenalty : live.frequencyPenalty,
      presencePenalty: (options as any)?.presencePenalty !== undefined ? (options as any).presencePenalty : live.presencePenalty,
      reasoningEffort: options?.reasoningEffort !== undefined ? options.reasoningEffort : live.reasoningEffort,
    };
  };
  /** 每轮的步数预算：显式传入 > 智能体现值 > 500 */
  const liveMaxSteps = () => {
    const live = readLiveParams().maxReActSteps;
    // ★ 默认 100 → 500（2026-09-29 用户诉求：「默认 500 步吧，50 步不太够啊」）。
    //   实测长任务（有声小说多章流水线）跑满 100 步仍有大量未完成步骤 →
    //   默认值偏小会让任务**频繁触顶**，即使有自动接力也来回停顿。
    //   上限仍是 500（见 clampMaxSteps），这里只是把"未配置时"的默认抬到上限。
    return params.maxSteps || live || DEFAULT_MAX_REACT_STEPS;
  };
  // 当前轮的助手占位消息 id：LLM 调用失败（429/超时/网络错误等）时把错误写进该占位消息落库，
  // 否则刷新后占位消息内容为空，用户看不到"调用失败"的痕迹。
  let activeAssistantMsgId: string | null = null;

  try {
    // 用户消息无条件先落库并推送：消息显示不应依赖平台/模型有效性（平台失效时用户消息也必须可见）
    if (params.userContent !== undefined) {
      const msgId = insertMessage(convId, userId, 'user', params.userContent);
      emit(task, { type: 'message:added', message: { id: msgId, role: 'user', content: params.userContent } });
    }

    // 工作流型智能体不能当会话智能体跑 ReAct。
    //
    // **必须放在平台/模型校验之前**：绑定错类型是比「平台没配好」更根本的错误。
    // 若放在后面，平台失效时会先报「平台或模型不存在」，把用户引向错误的排查方向
    // （去设置里反复换模型），而真正的原因（选错了智能体类型）被完全掩盖。
    //
    // 背景：会话直接绑定 workflow 型智能体时，agent.system_prompt 为 NULL、builtin_tool_ids 为 []，
    // 于是系统提示词里既没有角色定义也没有「## 可用工具」段，工具表更是几乎为空
    // （连 ask_user/confirm_user 都进不来 —— 兜底分支要求 agentId 为空才触发）。
    // 结果是模型拿到一句闲聊就按闲聊答，表现为「不反问、不产出、DAG 也永不启动」，
    // 而且全程不报错、日志无痕，极难归因。
    //
    // 正常入口有三条，都不经过会话智能体：① 智能体页画布「运行」；
    // ② 定时任务 taskType='workflow'；③ 对话智能体用 call_agent 委派（走 runWorkflowSubAgent）。
    if (params.agentId) {
      const boundAgent = db.prepare('SELECT id, name, type, workflow_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(params.agentId, userId) as any;
      if (isWorkflowAgent(boundAgent)) {
        const wfName = boundAgent?.name || params.agentId;
        const errMsg = [
          `「${wfName}」是**工作流型智能体**，不能作为会话智能体对话 —— 它跑的是固定流程（DAG），没有对话提示词与工具集。`,
          '',
          '请改用以下任一方式触发：',
          '1. **直接运行**：到「智能体」页打开它的画布，点右上角「运行」并填写入参；',
          '2. **定时触发**：新建定时任务时把类型选为「工作流」，绑定该工作流；',
          '3. **让对话智能体委派**：在「AI 短剧导演」等对话智能体的会话里说明需求，由它通过 call_agent 启动该工作流（完成结果会自动写回本对话）。',
          '',
          '如果想做「一句话主题 → 分镜/出图/配音/成片」，请直接切到 **AI 短剧导演** 智能体再描述需求。',
        ].join('\n');
        const aid = insertMessage(convId, userId, 'assistant', errMsg);
        emit(task, { type: 'message:added', message: { id: aid, role: 'assistant', content: errMsg } });
        emit(task, { type: 'task:error', error: '工作流型智能体不能作为会话智能体' });
        task.status = 'failed';
        return;
      }
    }

    const platform = loadPlatform(params.platformId, userId);
    // 带上 platformId：存量裸名回退时限定平台，避免同 API 名跨平台误命中另一个模型
    const model = loadModel(params.modelId, userId, params.platformId);
    if (!platform || !model) {
      // 平台/模型失效：错误提示作为 assistant 消息落库+推送（刷新后仍可见），只发 task:error 前端仅 toast、刷新即丢
      const errMsg = `平台或模型不存在或已失效（platformId: ${params.platformId}），请在「设置 → 模型平台」重新选择可用模型后重试。`;
      const aid = insertMessage(convId, userId, 'assistant', errMsg);
      emit(task, { type: 'message:added', message: { id: aid, role: 'assistant', content: errMsg } });
      emit(task, { type: 'task:error', error: '平台或模型不存在' });
      task.status = 'failed';
      return;
    }

    const client = new LlmClient(platform, model);
    ensureToolsInitialized();
    const registry = getToolRegistry();
    const modelCaps = model.capabilities as string[] | undefined;
    const supportsTools = modelSupportsTools(modelCaps);

    // 后端统一构建 systemPrompt/tools（单一事实来源）：前端只传 agentId/appGuide。
    // 历史兼容：显式传 systemPrompt/tools 则优先（定时任务等场景）。
    // 模式开关（前端「+」菜单）：无论提示词来自哪条路径，模式指令统一由后端追加、工具统一由后端裁剪。
    const modeFlags = params.modeFlags || {};
    const modePrompt: string[] = [];
    if (modeFlags.thinking) {
      modePrompt.push('- 深度思考模式：回答前先在内部充分推理，从多个角度权衡方案、核对关键假设后，再给出结论；正文保持结构化、重点突出。');
    }
    if (modeFlags.plan) {
      modePrompt.push('- 计划模式：动手执行前先制定完整分步计划。若 task_plan 工具可用，优先用 task_plan/task_step 登记计划与进度；否则以编号列表先给出计划，再按计划逐项执行并在每步完成后简要汇报。');
    }
    if (modeFlags.answerOnly) {
      modePrompt.push('- 仅回答模式：本次任务禁止调用任何工具（包括搜索、文件、代码执行与子智能体），直接依据已有知识与上下文用文字回答；若信息不足，明确说明缺什么，而不是尝试调用工具。');
    }
    // 会话级只读权限：模式指令告知模型按只读方式规划（工具列表已在下方同步裁剪，双保险）
    const permPrompt = permissionModePrompt(task.permissionMode || 'readonly');
    if (permPrompt) modePrompt.push(permPrompt);
    let systemPromptBuilt = params.systemPrompt !== undefined
      ? params.systemPrompt
      : buildSystemPromptForBackend(params.agentId ?? null, userId, params.appGuide, {
          conversationId: convId,
          includeUiTools: !!params.includeUiTools,
          userContent: params.userContent,
          workspaceDir: params.workspaceDir,
          // 只读会话：委派/编排工具会被裁掉 → 提示词改注入"分步规划 + 需放开权限"，
          // 避免"用 plan_tasks 编排"与只读权限**互相矛盾**（同一事实两处判定必须同源）。
          canDelegate: (task.permissionMode || 'readonly') !== 'readonly',
        });
    // 记忆注入：按用户当前输入检索相关记忆（recency×relevancy×type 加权、token 预算内），
    // 拼在 system prompt 尾部。检索失败绝不阻塞任务。
    if (params.userContent) {
      try {
        const mems = await retrieveRelevantMemories(userId, params.agentId ?? null, params.userContent, {
          conversationId: convId,
        });
        if (mems.length) {
          systemPromptBuilt += '\n\n' + formatMemoryContext(mems);
          bumpMemoryUsage(mems.map((m) => m.id));
        }
      } catch { /* 记忆注入失败不影响任务 */ }
    }
    // 空间记忆文件注入：会话归属空间时，读取空间 MEMORY.md（跨会话、所有智能体共享同一份），失败不阻塞
    try {
      const spaceMem = loadSpaceMemoryForConversation(convId);
      if (spaceMem) {
        systemPromptBuilt += '\n\n' + formatSpaceMemoryContext(spaceMem.spaceName, spaceMem.content);
      }
    } catch { /* 空间记忆注入失败不影响任务 */ }
    // 任务决策记录注入：用户历史上在 ask_user/confirm_user 确认过的内容（硬性验收项：
    // 同目录新开会话模型不再重复询问已确认的人物/格式/风格等）
    try {
      const taskMem = loadTaskMemoryForConversation(convId);
      if (taskMem) {
        systemPromptBuilt += '\n\n' + formatTaskMemoryContext(taskMem);
      }
    } catch { /* 决策记录注入失败不影响任务 */ }
    // ★★★ 任务进展「最近一批」注入（D5，2026-10-09）：progress.md 此前**完全不注入**，
    //   而它是跨会话接力的**主要线索**（上一批做到哪、还剩什么）。按需读的设计导致
    //   "长任务跑偏时模型不会主动去读"→ 换会话只能从头再来。
    //   这里只注入**最近 3 条 / 1200 字**（是"接力棒"不是"流水账"），整份明细仍按需读。
    try {
      const prog = readTaskProgressForConversation(convId);
      if (prog?.content) {
        const block = formatProgressContext(prog.content);
        if (block) systemPromptBuilt += '\n\n' + block;
      }
    } catch { /* 进展注入失败不影响任务 */ }
    // 任务类型 SOP 注入（「目录即任务」）：目录绑定了类型时，把类型执行手册 + 资源目录现状
    // 注入提示词，让模型按 SOP 分步引导用户，并知道 00-source 里已有哪些素材。
    try {
      const convRow = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(convId) as { space_id?: string | null } | undefined;
      const spaceId = convRow?.space_id;
      if (spaceId) {
        const tRow = db.prepare('SELECT task_type, task_config_json FROM space WHERE id = ?').get(spaceId) as
          | { task_type?: string | null; task_config_json?: string | null }
          | undefined;
        const taskType = tRow?.task_type;
        if (taskType) {
          let batchSize = DEFAULT_CONFIRM_BATCH_SIZE;
          try {
            const cfg = tRow?.task_config_json ? JSON.parse(tRow.task_config_json) : null;
            if (cfg && Number.isFinite(Number(cfg.confirmBatchSize))) batchSize = Number(cfg.confirmBatchSize);
          } catch { /* 配置损坏按默认 */ }
          const ctx = formatTaskTypeContext(taskType, batchSize);
          if (ctx) {
            systemPromptBuilt += '\n\n' + ctx;
            // 资源目录现状：让模型知道用户已放了什么（有素材就直接开工，没有就引导上传）
            const dirs = summarizeResourceDirsSync(spaceId);
            const lines = dirs.map((d) => `- ${d.dir}（${d.label}）：${d.count} 项${d.names.length ? `，如 ${d.names.join('、')}` : ''}`);
            systemPromptBuilt += '\n\n### 目录资源现状\n' + lines.join('\n');
          }
        }
      }
    } catch { /* 任务类型注入失败不影响任务 */ }
    // 领域经验注入（自进化经验层）：按任务文本匹配 .yan-zhi/experience/ 档案（索引 + 命中正文）。
    // 历史任务的坑/验证过的步骤在此进入上下文 —— 同主题任务不再从零摸索。失败不阻塞。
    try {
      const expCtx = buildExperienceContextForConversation(convId, params.userContent, params.workspaceDir);
      if (expCtx) {
        systemPromptBuilt += '\n\n' + expCtx;
      }
    } catch { /* 经验注入失败不影响任务 */ }
    // 浏览器记忆不做自动注入：按需召回模式，智能体需要时调用 api_browser_memory_read 工具拉取
    if (modePrompt.length) {
      systemPromptBuilt += '\n\n## 模式指令（用户在输入框开启，优先级高于默认行为）\n' + modePrompt.join('\n');
    }
    let toolsBuilt = params.tools !== undefined
      ? params.tools
      : buildToolsForBackend(params.agentId ?? null, userId, {
          conversationId: convId,
          includeUiTools: !!params.includeUiTools,
          userContent: params.userContent, // P2-1：动态工具路由的任务文本
        });
    if (modeFlags.answerOnly) toolsBuilt = [];
    // 只读权限：构建期就把写类工具从列表里摘掉，模型根本看不到（运行时 executeTool 还有拦截兜底）。
    // 注意：显式传入 params.tools 的场景（定时任务等）同样按会话权限裁剪，权限不因调用来源放松。
    toolsBuilt = filterToolsByPermission(task.permissionMode || 'readonly', toolsBuilt);
    const tools = supportsTools ? toolsBuilt : [];
    // 记录会话级 MCP 挂载 serverId：无人值守（前端不在线）时后端直连 MCP 兜底
    task.mountedMcpServerIds = getMergedMcpServerIds(params.agentId ?? null, userId, convId);

    // UI 交互工具 —— 必须委托前端执行（需要用户输入/确认）。
    // 定义在模块顶层（导出的 UI_TOOLS），此处直接复用：PlanRunner 派发计划项时
    // 也传同一份，避免"主链路与调度器两套 uiTools 口径"（见顶层 UI_TOOLS 注释）。

    // 媒体生成工具（后端直执行，产物落会话交付目录）：成功后要登记到 conversation_file，
    // 否则产物只存在于对话气泡里，文件管理列表看不到。
    // api_video_status：视频任务超时后模型用它补查，补查命中时同样会就地落盘并返回完整媒体契约，
    // 不登记的话这条补落盘的产物同样进不了交付目录。
    // 媒体生成工具集合已迁移到 services/artifact-hooks.ts（MEDIA_TOOLS）——
    // 登记副作用改由钩子实现（P2-3），主循环不再自己判断哪些工具会产文件。

    // 连续「参数为空」的工具调用计数：用于空转断路（见循环内对 consecutiveArgFailures 的处理）
    let consecutiveArgFailures = 0;
    /**
     * 「判定为空转退化」的连续空参步数阈值。
     *
     * ★★★ 必须由**同一个常量**同时供两处使用（2026-09-29 修，high）：
     *   · 断路器（循环内）：达到本阈值 → 停机并给诊断；
     *   · 接力闸门（循环外）：达到本阈值 → 拒绝接力。
     *
     *   此前两处**各写各的**：断路器判 `>= 3`，接力闸门判 `> 0` ——
     *   后果是**末尾只要有一次空参就否决接力**，即使任务跑了 100 步、
     *   即使计划里还剩 7 个未完成步骤。用户看到的是自相矛盾的一句
     *   「（未自动续跑：任务计划尚有 7 个未完成步骤）」：reason 说"该继续"、闸门说"不许"。
     *   实测（生产库 aaa84c6c 会话）：22:03 起跑满 100 步 → 末尾一次空参 → 接力被拒 → 任务终止。
     *
     *   ★ 判据：**同一个语义在两处判定，就必须共享同一个常量**。
     *     各写一遍字面量必然漂移，而且这种漂移**不报错**，只表现为"功能时好时坏"。
     */
    // 「只写了工具名、没写参数体」且该工具声明了必填参数 → 文本模式解析时记到这里，
    // 在本轮末尾给模型一条**准确**提示（"你只给了工具名，缺参数"，而不是误导成"输出被截断"）。
    // 见 parseTextModeToolCalls 的空参防护注释。
    let skippedArgTools: string[] = [];
    // 自动接力轮次计数（达 maxSteps 后接着跑的批次数，见循环结束后与 P0-2 决策分支）
    let continuationCount = 0;
    // ★★★ 停滞计数（2026-10-09，P1）：连续多少批**没有机械进展**（计划剩余步骤未下降）。
    //   有进展就清零，连续 autoContinueMaxRounds 批无进展才停 —— 替代旧的"总批次数一刀切"。
    let stallCount = 0;
    // 上一批结束时计划的剩余步骤数（用于判定本批是否有机械进展；首次为 Infinity 让首批算"有进展"）
    let lastPlanRemaining = Number.POSITIVE_INFINITY;
    // 自动接力总开关与**停滞上限**：达单轮步数上限后自动接着做（用户可在智能体 config_json 里
    // 设 autoContinueMaxRounds=0 关掉；默认 3 = **连续 3 批无进展**就停，不是总共 3 批）。
    // ★ 总批次数另有硬顶 autoContinueHardCap，见常量定义块。
    const autoContinueMaxRounds = (() => {
      if (!params.agentId) return 3;
      try {
        const row = db.prepare('SELECT config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(params.agentId, userId) as any;
        const cfg = (() => { try { return JSON.parse(row?.config_json || '{}'); } catch { return {}; } })();
        return typeof cfg?.autoContinueMaxRounds === 'number' && cfg.autoContinueMaxRounds >= 0 ? cfg.autoContinueMaxRounds : 3;
      } catch { return 3; }
    })();
    // 本轮步数预算：每轮现读，允许跑中途调大/调小立即生效（见 readLiveParams 注释）
    let stepBudget = liveMaxSteps();
    // ★ P1-9：任务预算触达状态（null=未触达）。token/墙钟触达时内层 break 跳出，
    //   收尾块按 kind 生成对应文案，且**拒绝自动接力**（预算已尽，接力只会立刻再触达）。
    let taskBudgetHit: { kind: 'tokens' | 'wallclock'; used: number; limit: number } | null = null;
    // 累计已消耗步数（跨自动接力批次），用于 step 事件与日志的连续计数
    let emittedStep = 0;

    // ★ 外层 = 自动接力批次；内层 = 单批 ReAct 步数。
    //   到达单批上限后不终止，而是决策「是否接着做」：接力 → 继续外层；否则 return 收尾。
    //   总批次硬顶 autoContinueHardCap（防失控）；"何时停"由**停滞判定**决定（连续 N 批无进展）。
    for (let batch = 0; batch <= autoContinueHardCap; batch++) {
      for (let step = 0; step < stepBudget; step++) {
        if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await waitIfPaused(task); // 工具边界暂停：挂起时停在这里，resume/abort 后继续
        // ★ 每轮重算步数预算：用户在任务运行中把「最大循环步数」调大，本轮即可续跑更多步
        //   （不必等任务结束重发）。调小则本轮在到达新上限后进入收尾决策。
        const budgetNow = liveMaxSteps();
        if (budgetNow !== stepBudget) stepBudget = budgetNow;
        // ★ P1-9（2026-10-07）：任务预算闸（token 总预算 + 墙钟）。触达**不硬杀**，
        //   跳出内层循环，走与步数上限相同的「结账 → 自评 → 接力确认」收尾块。
        taskBudgetHit = checkTaskBudgetHit(task);
        if (taskBudgetHit) break;
        task.step = step;
        emit(task, { type: 'step', step: emittedStep, batch });

        // ── 上下文组装：走**唯一出口** buildContextView（2026-10-02）──────────────
        //  此前这里是「loadMessages 全量 + 判超限 + compress」，与子智能体循环各写一遍。
        //  现在收敛为一处，且带来两个实质变化：
        //   ① **剔除子智能体消息**（此前混杂进主上下文，破坏隔离语义）；
        //   ② **压缩结果落库**（message_summary）→ 下一步读到的是"摘要 + 增量"，
        //      而不是每步把全量重新压一遍（旧实现只改局部变量，等于没压）。
        // 抢救节流游标：记录**已抢救过的批次号**（-1 = 尚未抢救）。
        // ★ 不能是布尔量 —— 那会让长任务第一批量之后就再也不抢救（见 beforeCompress 注释）。
        let flushedBatch = -1;
        const sumLlm = resolveMemoryExtractLlm(task) || { platform, model };
        const ctxView = await buildContextView({
          conversationId: convId,
          userId,
          rawMessages: mainlineMessages(loadMessages(convId))
            .filter(m => m.content || m.toolCalls || m.role === 'tool' || (m as any).reasoningContent),
          model,
          maxTokens: effectiveOptions().maxTokens,
          keepRecent: 6,
          keepFirst: 2,
          summaryCache: task.summaryCache ||= { ids: [], summary: '' },
          setSummaryModel: (cw) => cw.setSummaryModel(sumLlm.platform, sumLlm.model),
          beforeCompress: async (toCompress) => {
            // ★★★ 抢救节流：**每个接力批次一次**，不是每个任务一次（2026-10-08 修）。
            //   此前 `flushedThisRun` 是 runReActLoop 的**函数级**变量，全程只置一次 →
            //   一个跑 3 个批次的长任务，只有**第一批**压缩时抢救了记忆，
            //   第二、三批的压缩**一路白压**：被摘要吞掉的细节既没进记忆、也没进计划。
            //   批次是"上下文事实上被结算"的自然边界（每批开头都会重算预算），
            //   按它节流既不会每次压缩都调 LLM，也不会漏掉整批。
            if (flushedBatch === batch) return;
            flushedBatch = batch;
            const memLlm = resolveMemoryExtractLlm(task) || { platform, model };
            await flushMemoriesBeforeCompression(
              { userId, conversationId: convId, agentId: task.agentId ?? null, platform: memLlm.platform, model: memLlm.model },
              toCompress,
            );
          },
        });
        const messagesToSend = ctxView.messages;
        // 压缩事件上报（对齐 Claude Code 的 compact_boundary）：前端据此显示「此处已压缩」，
        // 否则用户完全看不出"上下文发生了什么"。
        if (ctxView.compacted) {
          emit(task, {
            type: 'context:compacted',
            coveredCount: ctxView.coveredIds.length,
            keptCount: messagesToSend.length,
            tokens: ctxView.tokens,
          });
        }

        // 使用后端统一构建的系统提示词（或历史兼容的前端传入）
        const systemPrompt = systemPromptBuilt;
        const llmMessages: Message[] = [];
        if (systemPrompt) {
          llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
        }
        llmMessages.push(...messagesToSend.map(m => ({
          id: m.id, conversationId: '', role: m.role,
          content: m.content, toolCalls: m.toolCalls,
          toolCallId: m.toolCallId, createdAt: m.createdAt,
        })));

        // ★★★ C1：发送前把 `已存档: <path>` 标记展开为图片块（视觉模型据此**真正看到**截图）。
        //   放在这里（构建完 llmMessages 之后、发请求之前）—— 是主循环**唯一**的发送前时点。
        //   ★ 只注入最近几条（见 attachImagesToMessages 的 C4 简化版说明）。
        await attachImagesToMessages(llmMessages);

        // 文本模式工具调用：模型不支持 function calling 时，在 system prompt 注入 [TOOL_CALL] 格式说明
        const hasToolsToExpose = toolsBuilt.length > 0;
        if (tools.length === 0 && hasToolsToExpose && llmMessages[0]?.role === 'system') {
          const toolList = toolsBuilt.map((t: any) => {
            const props = t.function.parameters?.properties || {};
            const req = t.function.parameters?.required || [];
            const params = Object.entries(props).map(([k, v]: [string, any]) =>
              `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
            ).join('\n');
            return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
          }).join('\n');
          llmMessages[0].content += `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
        }

        // 本轮生效参数（显式传入 > 智能体现值），供快照展示与 LLM 调用共用
        const effOpts = effectiveOptions();
        // 构建完整提示词快照（供前端"查看提示词"展示）
        const snap = JSON.stringify({
          step,
          timestamp: new Date().toISOString(),
          model: { id: model.modelId || model.id, alias: model.alias, contextWindow: model.contextWindow },
          platform: { id: platform.id, name: platform.name, protocol: platform.protocol },
          parameters: {
            temperature: effOpts.temperature,
            maxTokens: effOpts.maxTokens,
            topP: effOpts.topP,
            reasoningEffort: effOpts.reasoningEffort,
          },
          systemPrompt: llmMessages[0]?.role === 'system' ? llmMessages[0].content : '',
          tools: toolsBuilt.map((t: any) => ({
            name: t.function?.name || t.name,
            description: t.function?.description || '',
            parameters: t.function?.parameters,
          })),
          // ★★★ messages 只存 **id 引用**，不存正文（2026-10-02）。
          //   此前存正文 → 每步一份全量历史 → 单会话 O(n²)（实测 1156 条消息 → 174.9MB）。
          //   实测最大快照 546KB 中 messages 占 **73.5%**（1154 条）→ 改引用后降到约 2%。
          //   读取时由服务端 `hydrateSnapshot` 回填成旧结构 → **前端零改动**。
          //   见 services/context-snapshot.ts。
          messages: toSnapshotMessages(llmMessages),
        }, null, 2);

        // 添加助手占位消息
        const assistantMsgId = insertMessage(convId, userId, 'assistant', '', { systemPromptSnapshot: snap });
        // ★ 每会话只保留最近 N 条快照（删最旧的派生物，不删 message 行）。
        //   快照是纯调试产物（模型与业务逻辑都不读），保留策略把单会话上限从 ~175MB 收到 ~17MB。
        //   ★ 必须 try/catch：清理失败不该让整个生成失败（本项目既有约定）。
        if (step > 0 && step % 20 === 0) {
          try { pruneOldSnapshots(convId, SNAPSHOT_KEEP_PER_CONV); } catch {}
        }
        activeAssistantMsgId = assistantMsgId;
        // ★★★ SSE 事件**不带** systemPromptSnapshot（2026-10-01）：
        //   快照单条可达 86KB（含 systemPrompt+tools，实测占快照 59.5%），而它只在用户点
        //   「查看提示词」时才需要 —— 前端 openSnapshotDialog 走 fetchSnapshotFor：
        //   内存没有（历史消息必有此情况）就按需拉 GET /api/messages/:mid/snapshot。
        //   此前每个 step 都把这个大对象经 SSE 推一次，纯属为极低频操作付高频代价。
        //   ★ 注意前端 message:added 分支只取 role/id/content，不读该字段，去掉无副作用。
        emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '' } });

        // 流式请求
        let fullContent = '';
        let fullReasoning = '';
        let usageTokens = 0; // 本轮 LLM 调用 token 用量（provider 返回 usage 时累计，供 LLM 交互日志统计）
        const toolCallAcc: DeltaToolCall[] = [];
        /**
         * 本轮的 finish_reason（末次非空值）。
         *
         * ★★★ 2026-09-29 排障新增：此前**完全没读**它（`grep -c finishReason` = 0），
         *   于是代码分不清两种截然不同的失败：
         *     · 模型压根没生成参数 → arguments 是**干净的 `{}`**；
         *     · 生成到一半被**输出上限切断** → finish_reason='length'，arguments 是**半截 JSON**。
         *   两者被一视同仁地丢进 missingRequiredArgs，并统一给出「怀疑 max_tokens / 模型能力」
         *   的归因 —— 而实测这两者常都不是真因（真因见 toApiMessage 的历史参数清洗）。
         *   更要命的是：**截断时提示"重试同样的调用"是无效建议** —— 同样长度必然再截断一次。
         *   所以必须把 finish_reason 带下去，让截断走独立分支。
         */
        let streamFinish: string | undefined;
        // ★★★ P0（2026-10-09）：本轮流是否**正常收尾**。core parseSSE 会在流结束时吐
        //   一个 `terminated` 标记：见到 finish_reason/[DONE] → true，被掐断 → false。
        //   默认 true（未收到标记时按正常处理，避免误判）；只有明确 false 才判截断。
        //   此前无此判据 → 半截流被当"本轮完成"落库（content 空、reasoning 一半），
        //   emit task:completed，用户看到的就是"转半天不出话"＝卡死。
        // ★ 用持有对象而非裸 let：TS 不跟踪嵌套函数（consumeStream）内的赋值，
        //   裸变量会被流分析收窄成字面量 `true` → `=== false` 被判"无重叠"而报错。
        const streamFlag = { terminated: true };

        // 把「消费一个流」抽成局部函数：正常路径与**断流重试**路径共用同一段累加逻辑
        // （重复写两遍必然漂移 —— 本项目已有多次"平行实现行为漂移"教训）。
        const consumeStream = async (opts: Parameters<typeof client.chatStream>[1], msgs: any[] = llmMessages) => {
          for await (const chunk of client.chatStream(msgs, opts)) {
            if (chunk.finishReason) streamFinish = chunk.finishReason;
            if (chunk.terminated !== undefined) streamFlag.terminated = chunk.terminated;
            if (chunk.usage) {
              usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0);
              // ★ D1 可观测（2026-10-09）：缓存命中的 token 数落日志 —— 先能看见才谈优化。
              //   判据：**同会话连续两轮，第二轮 cachedTokens 应 > 0**；恒为 0 说明前缀不稳定
              //   （最常见原因就是 system prompt 里的动态内容，如已被移除的尾部时间戳）。
              if (chunk.usage.cachedTokens) {
                task.cachedTokensTotal = (task.cachedTokensTotal || 0) + chunk.usage.cachedTokens;
              }
              task.lastPromptTokens = chunk.usage.promptTokens || 0;
              task.lastCachedTokens = chunk.usage.cachedTokens || 0;
            }
            if (chunk.delta?.content) {
              fullContent += chunk.delta.content;
              emit(task, { type: 'chunk', content: chunk.delta.content });
            }
            if (chunk.delta?.reasoningContent) {
              fullReasoning += chunk.delta.reasoningContent;
              emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent });
            }
            if (chunk.delta?.toolCalls) {
              for (const tc of chunk.delta.toolCalls) {
                let idx = tc.index;
                if (idx === undefined) {
                  if (tc.id) {
                    const existById = toolCallAcc.findIndex(x => x.id === tc.id);
                    idx = existById >= 0 ? existById : toolCallAcc.length;
                  } else if (tc.function?.name) {
                    idx = toolCallAcc.length;
                  } else {
                    idx = toolCallAcc.length > 0 ? toolCallAcc.length - 1 : 0;
                  }
                }
                if (!toolCallAcc[idx]) {
                  toolCallAcc[idx] = { ...tc };
                } else {
                  const prev = toolCallAcc[idx];
                  toolCallAcc[idx] = {
                    ...prev, ...tc,
                    function: tc.function
                      ? { ...prev.function, ...tc.function, arguments: (prev.function?.arguments || '') + (tc.function!.arguments || '') }
                      : prev.function,
                  };
                }
              }
              emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
            }
          }
        };

        const streamOpts = {
          tools: tools.length > 0 ? tools : undefined,
          temperature: effOpts.temperature,
          maxTokens: effOpts.maxTokens,
          topP: effOpts.topP,
          frequencyPenalty: effOpts.frequencyPenalty,
          presencePenalty: effOpts.presencePenalty,
          reasoningEffort: effOpts.reasoningEffort,
          signal: task.abortController.signal,
        };

        try {
          await consumeStream(streamOpts);
        } catch (e: any) {
          if (isAbortError(e)) throw e;
          // 重试不带 tools
          if (/does not support tools|not support.*tool/i.test(e?.message || '') && tools.length > 0) {
            // 追加文本模式工具调用格式说明后重试
            const sysMsg = llmMessages[0];
            if (sysMsg?.role === 'system' && !(sysMsg.content || '').includes('[TOOL_CALL]')) {
              const toolList = tools.map((t: any) => {
                const props = t.function.parameters?.properties || {};
                const req = t.function.parameters?.required || [];
                const params = Object.entries(props).map(([k, v]: [string, any]) =>
                  `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
                ).join('\n');
                return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
              }).join('\n');
              sysMsg.content = (sysMsg.content || '') + `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
            }
            fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
            streamFlag.terminated = true; // 文本模式重试同样重置收尾判定
            // 文本模式重试不带 tools（端点不支持 tools 时的降级路径）
            await consumeStream({
              temperature: effOpts.temperature, maxTokens: effOpts.maxTokens,
              signal: task.abortController.signal,
            });
          } else {
            throw e;
          }
        }

        // ★★★ P0（2026-10-09）：流被上游/代理**提前掐断**的处置。
        //
        // 判据（三重，宁可保守不误伤正常流）：
        //   ① core 明确报告未收尾（`terminated === false`）；**或**
        //   ② finish_reason 为空、且**完全没有任何产出**（content/reasoning 皆空、无工具）——
        //      正常流不会"一个字都不吐就结束"；
        //   ③ 尚未进入工具调用（有 tool_calls 时就算被截断也交给下层按 finish_reason 处理续跑，不在此重来）。
        // 处置：先**就地续写**（把已产出内容当 assistant 前缀 prefill 重新发起，追加到尾部）。
        //   prefill **不带 tools**：部分 OpenAI 兼容端点在「assistant 前缀 + tools」下会 400（与既有
        //   "重试不带 tools" 同口径）。续写用尽仍失败 → 标截断，由下方落**可见**错误、绝不静默留白。
        if (
          (streamFlag.terminated === false || (!streamFinish && !fullContent && !fullReasoning)) &&
          toolCallAcc.length === 0
        ) {
          for (let attempt = 1; attempt <= STREAM_TRUNCATE_MAX_RETRY; attempt++) {
            if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            logger.warn(
              `[llm-task] 流被提前中断（未收尾${streamFinish ? `, finish=${streamFinish}` : ''}），` +
              `尝试续写 ${attempt}/${STREAM_TRUNCATE_MAX_RETRY}：已产出 content=${fullContent.length} 字 / reasoning=${fullReasoning.length} 字 ` +
              `conv=${task.conversationId}`,
            );
            const prefill: Message[] = [...llmMessages];
            const partial = fullContent || fullReasoning;
            if (partial.trim()) prefill.push({ id: 'prefill', conversationId: '', role: 'assistant', content: partial, createdAt: 0 });
            else prefill.push({ id: 'prefill', conversationId: '', role: 'user', content: '（上一轮响应中断，请继续完成你刚才的回复。）', createdAt: 0 });
            // 续写前清标记：只认可本次续写是否收尾
            streamFlag.terminated = true;
            try {
              await consumeStream({
                temperature: effOpts.temperature,
                maxTokens: effOpts.maxTokens,
                signal: task.abortController.signal,
              }, prefill); // 续写用临时 prefill（不改 llmMessages 本身，不动持久上下文）
            } catch (e2: any) {
              if (isAbortError(e2)) throw e2;
              logger.warn('[llm-task] 续写调用失败：', e2?.message || e2);
              break;
            }
            // 续写拿到终态、或有产出 → 视为修复成功，跳出重试
            if (streamFlag.terminated && (fullContent.trim() || fullReasoning.trim() || toolCallAcc.length > 0)) break;
          }
        }

        // 把本轮 finish_reason 落到任务上，供工具执行层的空参拦截按真实原因分派文案
        // （见 LlmTask.lastFinishReason 注释：截断与"没生成"必须区别对待）
        // ★ P0（2026-10-09）：流被掐断而 finish_reason 为空时，显式标 'truncated' ——
        //   否则下游看到 `undefined` 会归因成"模型没生成/参数被截断"，指向错误方向。
        task.lastFinishReason = streamFlag.terminated === false ? 'truncated' : streamFinish;
        // ★ P1-9：累计本任务 token 消耗（usage 优先，缺失时与 estTokens 同口径粗估），
        // 供预算闸判定（checkTaskBudgetHit）。粗估口径：内容长度 / 2（与 estTokens 一致）。
        task.totalTokens = (task.totalTokens || 0) + (usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2));

        // 文本模式工具调用解析：模型输出 [TOOL_CALL]...[/TOOL_CALL] 或 <function=xxx> 时转结构化 toolCalls
        // 某些模型（如 agnes-2.5-flash）会把 [TOOL_CALL] 放在 reasoning_content 中，需同时检查
        // function call 模式可能返回工具名但 arguments 为空，需从 reasoning 中提取完整参数
        //
        // ★★★ 判据从"**全部**空"改为"**有任一空**"（2026-09-29 修正）：
        //   此前只要一批里有一个调用带参数，`every(...)` 即为假 → 整批跳过文本补救 →
        //   那个空参调用就带着 `{}` 进入执行被拦（用户侧表现为"偶尔又空参"）。
        //   现在只要存在空参就走补救流程（补救是**逐个**进行，不会误伤有参数的调用）。
        const isEmptyArg = (tc: any) => { const a = tc.function?.arguments; return !a || a === '{}' || a === ''; };
        const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.some(isEmptyArg);
        if (toolCallAcc.length === 0 || hasEmptyArgs) {
          const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION');
          // ★ reasoning 兜底（2026-09-29 修正）：此前 content 里有工具块时**完全不看 reasoning**，
          //   而 content 与 reasoning 各有一部分工具输出（或参数只吐在 reasoning 里）的模型会漏解析。
          //   现在：content 解析结果**为空**或**存在空参**时，再从 reasoning 补一次。
          const hasToolInReasoning = fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION');
          if (hasToolInContent || hasToolInReasoning) {
            const sources: string[] = [];
            if (hasToolInContent) sources.push(fullContent);
            if (hasToolInReasoning && (sources.length === 0 || fullReasoning !== fullContent)) sources.push(fullReasoning);
            // 原模原样保留模型原始输出（content/reasoning 不做剥离），仅解析出结构化 toolCalls；
            // 前端展示时再隐藏工具块，模型下一轮也能看到自己上一轮的原始调用文本
            //
            // ★★★ 去重键必须是「工具名 + 参数」而**不是**只按工具名（2026-09-29 修，我引入的回归）：
            //   同一批里**同一工具被合法调用多次（参数不同）**是常见形态 ——
            //   实测场景：一次输出两个 web_search（"2026年手机推荐" + "旗舰对比评测"）。
            //   只按名字去重会把第二个**直接吃掉** → 用户少搜一半、模型也困惑。
            //   只有"名字与参数完全相同"才是同一次调用的重复解析（多来源合并时的真实重复）。
            const parsed: { id: string; name: string; arguments: string }[] = [];
            const skipped: string[] = [];
            const seenKeys = new Set<string>();
            for (const src of sources) {
              const r = parseTextModeToolCalls(src, toolsBuilt);
              for (const tc of r.toolCalls) {
                const key = `${tc.name}\u0000${tc.arguments}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                parsed.push(tc);
              }
              for (const s of r.skipped) skipped.push(s);
            }
            // ★★★ 逐个补救（2026-09-29 修正）：此前是「**全部** tc 都空才清空重解析」，
            //   一批里"1 个有参数 + 1 个空参"时**空的不会被补救** → 带着 `{}` 进执行 → 被拦。
            //   现在：逐个判定 —— 空的那个（且文本模式能补出参数）**原地**替换掉（保留原 id）；
            //   有参数的**原样保留**（不要整批清空，否则把原生解析出来的正确参数也丢了）。
            //   仅当该空参调用在文本里补不到参数时，才把文本解析结果追加为**新**调用。
            if (hasEmptyArgs) {
              // ★ 补救用的候选必须**按名字取用后即删**（与下面 recovered.values() 追加互斥），
              //   否则同一份文本结果会被既"原地补参"又"追加为新调用" → 调用数翻倍。
              const recovered = new Map<string, { id: string; name: string; arguments: string }[]>();
              for (const p of parsed) {
                if (!recovered.has(p.name)) recovered.set(p.name, []);
                recovered.get(p.name)!.push(p);
              }
              for (const tc of toolCallAcc) {
                if (!isEmptyArg(tc)) continue; // 非空的不动
                const nm = tc.function?.name || '';
                const pool = nm ? recovered.get(nm) : undefined;
                if (pool && pool.length) {
                  tc.function!.arguments = pool.shift()!.arguments; // 原地补参（id 不变 → 配对仍完整）
                }
              }
              // 剩下没被补救的解析结果（说明是文本里**另一次**调用）才追加
              for (const pool of recovered.values()) {
                for (const p of pool) {
                  toolCallAcc.push({ id: p.id, function: { name: p.name, arguments: p.arguments } } as DeltaToolCall);
                }
              }
            } else {
              // 原生完全没有工具调用（或没有空参）→ 文本模式解析结果直接追加
              for (const tc of parsed) {
                toolCallAcc.push({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } } as DeltaToolCall);
              }
            }
            if (skipped.length > 0) skippedArgTools = [...new Set([...skippedArgTools, ...skipped])];
            if (toolCallAcc.length > 0) {
              emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
            }
          }
        }

        // ★★★ P0（2026-10-09）不静默：续写仍失败且**正文为空**时，绝不留下"空气泡"
        //   —— 旧行为正是 content='' + reasoning 半截 直接落库，用户看到"转半天不出话"。
        //   落一条可见提示（reasoning 原文仍在行内可供排查），让用户知道"被中断了、可重试"，
        //   而不是以为模型什么都没做。
        if (!fullContent.trim() && streamFlag.terminated === false) {
          fullContent = TRUNCATED_STREAM_NOTICE;
          logger.warn(
            `[llm-task] 断流且无正文留痕（msg=${assistantMsgId} conv=${task.conversationId} ` +
            `reasoning=${fullReasoning.length} 字）—— 已落可见提示`,
          );
        }

        // 更新助手消息（tokens：provider usage 优先，缺失时按内容长度粗估，供 LLM 交互日志统计）
        const estTokens = usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2);
        // 落库前补齐缺失的 call id：避免 assistant.tool_calls 与 tool 消息无法配对而被 sanitize 剥掉，
        // 导致模型下一轮看不到自己调用过什么（详见 ensureToolCallIds 注释）。
        if (toolCallAcc.length > 0) ensureToolCallIds(toolCallAcc);
        updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined, estTokens);
        emit(task, { type: 'message:updated', messageId: assistantMsgId, content: fullContent, reasoning: fullReasoning, toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined });

        // 无工具调用 → 完成
        if (toolCallAcc.length === 0) {
          // ★ 优先处理「只写了工具名、没写参数体」（2026-09-29）：这不是"任务做完了"，
          //   而是模型把工具名吐出来了却忘了/没来得及给参数。此前这种情形**要么**产出假空参调用
          //   （被 missingRequiredArgs 拦下）、**要么**（本次修复后不再产出调用）被当成"无工具调用"
          //   → 直接完成任务，用户看到"啥也没干就结束了"。两者都不对。
          //   正解：给模型一条明确提示，让它**只补参数重发**，而不是从头重来。
          if (skippedArgTools.length > 0 && step < stepBudget - 1) {
            const tip = `你只给出了工具名（${skippedArgTools.join('、')}）但没有写出参数，因此这些调用**未被执行**。` +
              `请重新输出完整调用，**必须带上参数体**，例如：\n` +
              `[TOOL_CALL]{"name":"${skippedArgTools[0]}","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n` +
              `只补这一次参数即可，不要解释、不要重头再来。`;
            insertMessage(convId, userId, 'user', tip);
            emit(task, { type: 'message:added', message: { id: '', role: 'user', content: tip } } as any);
            skippedArgTools = [];
            continue; // 下一轮模型能看到提示
          }
          // 「立即发送」的追加消息还没被消费：不能在此 finish，再跑一轮让模型看到它们。
          // 消息已由 injectUserMessage 落库，下一轮 loadMessages(convId) 自然带上，这里只清标记并续循环。
          if (task.pendingInjects.length > 0) {
            task.pendingInjects = [];
            continue;
          }
          // ★★★ 后台子智能体仍在跑 → 不能在此 finish（2026-10-09，用户实测缺陷修复）。
          //   直接 finish 会让前端关流 → task.subscribers 归零 → browser_* 失去前端执行通道
          //   （回退服务端 Playwright = 另一个浏览器，预览面板看不到）→ pageAgent 停摆。
          //   正解：**挂起等它们跑完**（零 token，不空转），拿到结果后唤醒本循环继续决策。
          if (task.backgroundSubAgents.size > 0) {
            const pending = task.backgroundSubAgents.size;
            const holdMsg = `（本次收尾时仍有 ${pending} 个后台子智能体在运行，已就地等待它们完成，随后继续处理结果。）`;
            try {
              const hid = insertMessage(convId, userId, 'assistant', holdMsg);
              emit(task, { type: 'message:added', message: { id: hid, role: 'assistant', content: holdMsg } });
            } catch { /* 提示落库失败不影响等待 */ }
            await waitForBackgroundSubAgents(task);
            // 被终止：不再继续，走下方 abort 分支由外层收尾
            if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            // 把结果作为 user 消息灌进下一轮上下文（loadMessages 会带上），唤醒主智能体继续决策
            const drained = task.pendingBackgroundResults.splice(0);
            for (const r of drained) {
              const id = insertMessage(convId, userId, 'user', r.text);
              emit(task, { type: 'message:added', message: { id, role: 'user', content: r.text } });
            }
            continue; // 下一轮模型能看到后台结果并继续
          }
          // 空回复兜底：上一轮工具调用后模型返回空内容（常见于工具全失败），补提示避免用户看到空白
          if (!fullContent && !fullReasoning && step > 0) {
            const tip = '（助手未返回有效内容，可能是工具调用失败导致。请重试或换一种问法。）';
            updateMessageContent(assistantMsgId, tip);
            emit(task, { type: 'message:updated', messageId: assistantMsgId, content: tip });
          }
          // ★ 自动验证循环（P1）：改过代码但从未验证 → 收尾前注入一次验证提醒（每任务最多 2 次）
          const verifyTip = takeVerifyNudge(task);
          if (verifyTip) {
            insertMessage(convId, userId, 'user', verifyTip);
            emit(task, { type: 'message:added', message: { id: '', role: 'user', content: verifyTip } } as any);
            continue; // 下一轮模型能看到提醒并补跑验证
          }
          // 后台子智能体仍在跑（P2-6）：主循环**照常收尾**（不等待 —— 等待会造成空转烧 token），
          // 但给用户一条明示消息，避免"任务结束了但活还没干完"的错觉。
          if (task.backgroundSubAgents.size > 0) {
            const note = buildFinishNote(task.backgroundSubAgents);
            try {
              const noteId = insertMessage(convId, userId, 'assistant', note);
              emit(task, { type: 'message:added', message: { id: noteId, role: 'assistant', content: note } });
            } catch { /* 提示落库失败不影响收尾 */ }
          }
          emit(task, { type: 'task:completed' });
          task.status = 'completed';
          // 长任务收尾：把本轮结论沉淀进空间记忆（跨会话可见），见 recordTaskProgress
          void recordTaskProgress(task, 'completed', fullContent || fullReasoning || '');
          void extractMemoryFromConversation(task);
          return;
        }

        // 执行工具调用（同批多导航：第 2+ 个 browser_navigate 转为新开标签页）
        const newTabNavIds = markDuplicateNavigations(toolCallAcc);

        // ★ 空转断路器：连续多步「所有工具调用都参数为空」说明模型已进入退化循环。
        //   ★ 此前注释把成因写成"输出长度上限偏低"，2026-09-29 实测证伪（见下方 diag 文案的说明）；
        //   真根因是历史回放丢参 → 模型模仿。断路本身仍有价值（防继续烧 token），只是归因要准。
        //   召回：主循环每轮 `loadMessages` 会带上本会话全部历史，空参样本一旦落库就会持续被回放，
        //   所以**旧会话**即使代码已修也可能因历史污染继续空转 —— 文案里明确引导换新会话。
        // ★ 空转断路器：连续多步「所有工具调用都参数为空」说明模型已进入退化循环。
        //   ★★★ 文案已于 2026-09-29 修正 —— 此前断言"输出被长度上限截断"并让用户换模型/调 max_tokens，
        //   但实测证伪：`file_read` 的必填参数 `path` 只需几十字符同样出现空参，
        //   且空参轮 completion_tokens 很小、reasoning_len = 0，不存在上限压力；
        //   直连上游 A/B（历史带空参样本）会让同一模型对同一工具开始吐空参。
        //   真根因（已修）是**历史回放把参数洗成 `{}`** → 模型模仿 → 自我强化退化。
        const allEmptyArgs = toolCallAcc.length > 0 &&
          toolCallAcc.every(tc => { const a = tc.function?.arguments; return !a || a === '{}'; });
        consecutiveArgFailures = allEmptyArgs ? consecutiveArgFailures + 1 : 0;
        if (consecutiveArgFailures >= EMPTY_ARGS_DEGENERATE_THRESHOLD) {
          const diag = '检测到工具调用连续多步参数为空（arguments 一直为 {}），已停止以免继续消耗。\n\n' +
            '原因（按实际发生概率排序）：\n' +
            '1. **本会话历史里已存在"参数为空"的工具调用记录**，模型正在模仿它 —— 这是最常见的原因。' +
            '本框架已修复历史回放丢参的问题，但**旧会话**里已落库的空参记录仍会被回放；' +
            '处理：在当前会话里明确指出正确参数重试一次，或**新开一个会话**继续该任务（推荐）。\n' +
            '2. **参数被模型写在了 reasoning/正文里而未被识别**：换一个原生支持 tools 的模型通常即可解决。\n' +
            '3. 输出确实被长度上限截断（较少见）：把参数写简短，或在模型设置里调大「最大输出 tokens」。\n' +
            '4. 任务过长导致上下文被压缩：把任务拆小，或让我先整理一份任务计划再分批执行。';
          updateMessageContent(assistantMsgId, diag);
          emit(task, { type: 'message:updated', messageId: assistantMsgId, content: diag });
          emit(task, { type: 'task:completed' });
          task.status = 'completed';
          void recordTaskProgress(task, 'empty_args_loop', diag, { steps: step });
          return;
        }

        // ★★★ P2-4：同批多个 call_agent **并发**执行（2026-09-29）。
        //
        // 为什么：长任务里"3 个子任务分别调研"是典型场景，串行执行会让每个子智能体
        // 各跑几十步 → 主任务的 100 步预算很快被烧光（用户看到的正是"跑了很久没产出"）。
        //
        // ★ 为什么**只**并发 call_agent，别的工具一律不并发：
        //   · UI 工具（ask_user/confirm_user）→ 会同时弹出两个对话框，用户没法答；
        //   · 浏览器工具 → 单活动页状态机，同批多导航会互相覆盖（见 markDuplicateNavigations
        //     专门为此做的守卫）；
        //   · 文件类工具（file_write → file_read）→ 有先后依赖，并发会读到旧内容；
        //   · 子智能体之间**无共享状态**（各自按 parentToolCallId 隔离消息），天生可并发。
        //
        // ★ 深度仍限 1 层（`depth >= 1` 拒绝），这里只放宽"同批并发"，不放宽嵌套。
        // ★ 结果按**原顺序**取用（下面主循环按 tc 顺序读 concurrentResults）——
        //   OpenAI 协议要求 tool 消息与 assistant.tool_calls **一一对应且同序**，
        //   乱序落库会让下次重放历史时上游 400。
        const concurrentResults = new Map<string, string>();
        // ★ P0-4（2026-10-07）：并行面从 call_agent 推广为「call_agent ∪ 只读白名单」。
        //   READONLY_PARALLEL_TOOLS 的取舍判据见其定义处注释（无副作用 + 无共享状态才放行）。
        const parallelizableCalls = toolCallAcc.filter((tc) => {
          const n = tc.function?.name || (tc as any).toolName || '';
          if (parseToolArguments(tc.function?.arguments).args === null) return false;
          return n === 'call_agent' || READONLY_PARALLEL_TOOLS.has(n);
        });
        // ★ 并发上限（2026-10-07 调整）：默认 2（原 4）。实测并发 4 时上游 429
        //   （Too Many Requests / system overloaded）明显高发 —— 并发数直接把请求压到上游配额上。
        //   可用环境变量 YANZHI_MAX_CONCURRENT_AGENTS 覆盖（1~8，钳位）。
        //   超过上限的仍走下面的串行路径，不会丢调用。
        const MAX_CONCURRENT_AGENTS = (() => {
          const v = Number(process.env.YANZHI_MAX_CONCURRENT_AGENTS);
          return Number.isFinite(v) && v >= 1 ? Math.min(8, Math.floor(v)) : 2;
        })();
        if (parallelizableCalls.length >= 2) {
          const batchToRun = parallelizableCalls.slice(0, MAX_CONCURRENT_AGENTS);
          emit(task, { type: 'tool:concurrent', toolName: 'parallel', count: batchToRun.length });
          await Promise.all(batchToRun.map(async (tc) => {
            const name = tc.function?.name || (tc as any).toolName || '';
            const cArgs = parseToolArguments(tc.function?.arguments).args as any;
            emit(task, { type: 'tool:start', toolName: name, args: cArgs });
            try {
              const r = await executeTool(task, registry, name, cArgs, tc.id || '', UI_TOOLS, 0, toolsBuilt, {});
              concurrentResults.set(String(tc.id || ''), r);
            } catch (e: any) {
              // 中止要整体上抛（与串行路径一致）；其余错误记为结果，让主循环按序落库
              if (isAbortError(e)) throw e;
              concurrentResults.set(String(tc.id || ''), `工具执行失败: ${e?.message || e}`);
            }
          }));
        }

        for (const tc of toolCallAcc) {
          const toolName = tc.function?.name || (tc as any).toolName || '';
          const parsedArgs = parseToolArguments(tc.function?.arguments);
          if (parsedArgs.args === null) {
            // 参数解析失败：必须落库 tool 结果保持配对，并明确告诉模型重试（绝不带空参数硬执行）
            const errMsg = capToolResult(`参数解析失败，本工具未执行。${parsedArgs.err}\n请重新调用 ${toolName}，确保 arguments 是完整、合法的 JSON 对象。`);
            insertToolMessageAndEmit(task, convId, userId, tc.id || '', errMsg);
            continue;
          }
          const args: any = parsedArgs.args;
          if (newTabNavIds.has(String(tc.id || ''))) args.openInNewTab = true;

          // 已并发跑过的（call_agent）直接取结果，不重复执行（统一出口里跳过执行、保留钩子/落库）
          const pre = concurrentResults.get(String(tc.id || ''));
          await runToolCallAndPersist({
            task, registry, convId, userId, assistantMsgId,
            toolName, args, tcId: tc.id || '', depth: 0, toolDefs: toolsBuilt, uiTools: UI_TOOLS,
            precomputed: pre,
          });
        }

        // 继续下一轮 ReAct
        emittedStep++;
      }

    // ═══ 本批步数用完（或本轮预算被调小后耗尽）═══
      //
      // ★★★ 达上限不再"就地终止"，而是走「结账 → 决策 → 接力」（用户 2026-09-28 诉求：
      //   「100 步就自动总结…应该有个记忆整理，然后根据整理的记忆进行任务，不要一直断」）。
      //   此前这里只有一句总结 + task:completed，用户必须手动再说一句"继续"。
      //
      // 注意：这一步只有在**真的跑到预算上限**时才执行；正常完成（无工具调用）在循环内
      // 已 return，不会到这里。
      // ★ P1-9 修正（2026-10-09）：**预算口径优先于步数口径**。
      //   原实现在预算触达时仍是 `budgetReached = stepBudget`（=最大循环数）走 else 分支，
      //   于是落库文案永远是「已达到最大循环数（200）」—— 把真因（墙钟 15 分钟）掩盖成"步数不够"，
      //   用户照着去加步数（错方向）。这里让预算触达时**先说预算**，步数信息并列为补充。
      const budgetReached = stepBudget;
      let tipText = taskBudgetHit?.kind === 'tokens'
        ? `已达到任务 token 总预算（累计 ${taskBudgetHit.used} / 上限 ${taskBudgetHit.limit}），请检查任务是否需要拆分，或在智能体 config_json 调高 totalTokenBudget。`
        : taskBudgetHit?.kind === 'wallclock'
        ? `已达到任务墙钟时间上限（${Math.round(taskBudgetHit.limit / 60000)} 分钟，已扣除等外部进程的时间），请检查任务是否需要拆分，或在智能体 config_json 调高 wallClockMinutes。`
        : `已达到最大循环数（${budgetReached}），请检查任务是否需要拆分或调高工具配置。`;
      let summaryText = '';
      try {
        const hist = loadMessages(convId).filter(m => m.content || m.toolCalls || m.role === 'tool');
        const history: Message[] = hist.map(m => ({
          id: m.id, conversationId: '', role: m.role,
          content: m.content, toolCalls: m.toolCalls,
          toolCallId: m.toolCallId, createdAt: m.createdAt,
        }));
        // 先请模型做一次无工具总结（已完成/关键结果/未完成原因/后续建议），
        // 同时让它自评「是否还有活没干完」（CONTINUE 行），作为是否接力的判据之一。
        const judged = await decideAutoContinue({
          client, systemPrompt: systemPromptBuilt, history,
          maxSteps: budgetReached,
          continuationCount,
          autoContinueMaxRounds,
          conversationId: convId,
        });
        summaryText = judged.summary;
        if (summaryText) {
          // ★ 2026-10-09 修：原实现**无条件**把 tipText 覆盖成"单批最大循环步数"，
          //   把预算真因（墙钟/token）冲掉 → 库里只剩「注：本次任务已达到单批最大循环步数（200）」，
          //   用户拿到的是"步数不够"的错方向。改为按实际触达的闸门措辞。
          tipText = `${summaryText}\n\n（注：${taskBudgetHit
            ? (taskBudgetHit.kind === 'tokens'
              ? `本次任务已达到 token 总预算（${taskBudgetHit.used}/${taskBudgetHit.limit}）`
              : `本次任务已达到墙钟时间上限（${Math.round(taskBudgetHit.limit / 60000)} 分钟，已扣除等外部进程的时间）`)
            : `本次任务已达到单批最大循环步数（${budgetReached}）`}。）`;
        }

        // ── 决策：该不该自动接力 ──
        // 四个前置闸（不在 decideAutoContinue 里判，因为它不持有 task 状态）：
        //   · 用户已终止 → 不接力；
        //   · 已**深度**空转退化（连续空参达阈值）→ 不接力；
        //   · 已到接力轮次上限 / 用户关闭了自动接力 → 不接力。
        const aborted = task.abortController.signal.aborted;
        // ★★★ 判据必须与断路器**一致**（2026-09-29 修，high）：此前这里是 `> 0`，
        //   而断路器是 `>= 3` —— 于是"末尾偶发一次空参"就会否决整个接力。
        //   实测后果：跑满 100 步、计划还剩 7 步的任务被直接终止，
        //   且给出一句自相矛盾的「未自动续跑：任务计划尚有 7 个未完成步骤」。
        //   现在统一用 EMPTY_ARGS_DEGENERATE_THRESHOLD：**只有真正持续空转才拒绝接力**，
        //   偶发空参不再阻断（那正是最需要接力纠偏的场景）。
        const expectedContinue = judged.shouldContinue;
        const degenerate = consecutiveArgFailures >= EMPTY_ARGS_DEGENERATE_THRESHOLD;
        // ★★★ P1-9 修正（2026-10-09，high）：预算触达**不再无条件否决接力**。
        //
        //   原实现 `!budgetExhausted` 横在接力分支前 → 触达墙钟/token 后**一次都不接力**，
        //   即使计划里还剩 7 步也照样「未自动续跑：任务墙钟时间已耗尽」。实测（会话 84412558）：
        //   17.2 分钟触达 15 分钟墙钟 → 自动接力 0 次 → 用户体感"不能一趟跑出来"。
        //   这与 2026-09-29 修掉的「reason 说该继续、结论却不续」是**同类毛病换了个闸门复发**。
        //
        //   ★ 新语义：预算是"该结账了"的信号，不是"该放弃"的信号 —— 只要
        //     (a) 机械信号说还有活（计划有剩余步骤 / 模型自评未完成）且
        //     (b) 不是真失控（未中止、未空转退化）
        //   就**允许有限接力**；失控兜底由 autoContinueHardCap(30) + 停滞判定负责。
        //
        //   ★ 但必须防"预算已尽 → 接力立刻再触达 → 无限空转"：
        //     · token 预算：接力前把**累计值对齐到预算**（否则下一批第一步就再次触发），
        //       相当于"本任务已用满配额，这批是最后一次"；
        //     · 墙钟：把**起点前移**为下批开始时刻，即"每批给一份完整墙钟预算"。
        const budgetExhausted = !!taskBudgetHit;
        if (expectedContinue && !aborted && !degenerate) {
          continuationCount++;
          // ★★★ 总时长失控闸（2026-10-09）：弹性墙钟（每批一份）之后，批次数不足以兜底 ——
          //   计划已被清空的会话里停滞闸会失效（noPlanTracked 恒真），只剩 30 批 × 15 分钟 = 最坏 7.5h。
          //   这里按**任务总墙钟**（含等待，不做抵扣 —— 抵扣是给预算用的"干活时长"口径，
          //   这里要的是"这台机器被占多久"）硬停。
          const totalElapsedMs = Date.now() - (task.createdAt || Date.now());
          if (totalElapsedMs >= TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS) {
            tipText = `${tipText}\n\n（接力已停止：任务总时长已达 ${Math.round(TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS / 3600000)} 小时上限，为避免占用资源已终止。建议把任务拆成多次执行。）`;
            const capId = insertMessage(convId, userId, 'assistant', tipText);
            emit(task, { type: 'message:added', message: { id: capId, role: 'assistant', content: tipText } });
            emit(task, { type: 'task:completed' });
            task.status = 'completed';
            void recordTaskProgress(task, 'max_steps', tipText, { steps: budgetReached });
            void consolidateOnTaskEnd(task, summaryText || tipText);
            void extractMemoryFromConversation(task);
            return;
          }
          // 停滞判定（见 autoContinueHardCap 说明）：autoContinueMaxRounds 是"连续无进展"上限
          const planRemainingNow = readPlanRemainingSteps(convId);
          // ★ 无计划时的语义（2026-10-09 复核后**保持不变**，理由如下）：
          //   原判据 `(noPlanTracked && expectedContinue)` 让"没计划"的会话算作有进展（停滞闸不生效）。
          //   曾考虑改成"无计划 + 本批无产出 ⇒ 计入停滞"，但那需要引入新的数据源
          //   （conversation_file 增量）与"本批区间"的新语义 —— 为一个次要改进引入两个新概念不划算，
          //   且难以验证。当前兜底是**三层**：autoContinueHardCap(30 批) + TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS
          //   (4h) + cleanupTasks 的 2h 运行看门狗 ⇒ 不会失控。
          //   ★ 真正的解药在别处：**修好计划落盘**（clearPlan 自毁）后，"无计划"不再长期存在，
          //     停滞闸对本就最需要它的长任务恢复生效。
          const noPlanTracked = lastPlanRemaining === 0 && planRemainingNow === 0;
          const progressed = planRemainingNow < lastPlanRemaining || (noPlanTracked && expectedContinue);
          if (progressed) stallCount = 0; else stallCount++;
          lastPlanRemaining = planRemainingNow;
          if (autoContinueMaxRounds > 0 && stallCount >= autoContinueMaxRounds) {
            // 连续 N 批无进展 → 判定停滞，收尾（不再接力）
            // 复用 tipText（既有契约：max_steps 必须复用已有总结，不重花一次 LLM）
            tipText = `${tipText}\n\n（接力已停止：连续 ${stallCount} 批无新进展，判定已停滞。）`;
            const stallId = insertMessage(convId, userId, 'assistant', tipText);
            emit(task, { type: 'message:added', message: { id: stallId, role: 'assistant', content: tipText } });
            emit(task, { type: 'task:completed' });
            task.status = 'completed';
            void recordTaskProgress(task, 'max_steps', tipText, { steps: budgetReached });
            void consolidateOnTaskEnd(task, summaryText || tipText);
            void extractMemoryFromConversation(task);
            return;
          }
          // 结构化记账：把「做到哪 + 还剩什么」落进空间记忆与进度明细（跨会话可见），
          // 再续下一批 —— 这就是用户说的"根据整理的记忆进行任务"。
          void recordTaskProgress(task, 'max_steps', tipText, {
            steps: budgetReached,
            continuation: `自动接力第 ${continuationCount}/${autoContinueHardCap} 批`,
          });
          // 通知前端：不是结束，而是接着做（前端据此保持"运行中"态、不清输入锁）
          const contMsg = `已达单批步数上限（${budgetReached} 步），**自动接力第 ${continuationCount} 批**继续推进（停滞计数 ${stallCount}/${autoContinueMaxRounds}）。` +
            (budgetExhausted ? `（本批为预算触达后的有限接力：${taskBudgetHit!.kind === 'tokens' ? 'token 已达上限' : '墙钟已达上限'}，接力只做最后一批）` : '') +
            (judged.reason ? `（依据：${judged.reason}）` : '');
          const contId = insertMessage(convId, userId, 'assistant', contMsg);
          emit(task, { type: 'message:added', message: { id: contId, role: 'assistant', content: contMsg } });
          emit(task, { type: 'continuation', round: continuationCount, maxRounds: autoContinueHardCap, reason: judged.reason });
          // ★★★ 预算基线重置（2026-10-09）：预算触达后仍接力一次，必须让下一批有可用额度，
          //   否则下一批第一步立刻再次触达 → 无限"接力-触达"空转。
          //   · token：对齐到上限（这批是本任务最后一次）。
          //   · 墙钟：起点前移为**此刻**（每批给一份完整墙钟预算）—— 对长任务这是关键：
          //     出片这类任务单批就要 15 分钟以上，只有"每批一份预算"才能一趟跑完。
          if (budgetExhausted) {
            if (taskBudgetHit!.kind === 'tokens') {
              task.totalTokens = taskBudgetHit!.limit;
            } else {
              task.budgetBaselineAt = Date.now();
              task.waitCreditMs = 0;
            }
          }
          // ★ P1-8（2026-10-07）：接力前检查计划是否已与现实脱节 —— 现实变了计划不跟着变，
          //   下一批就会按过期计划做错事（planner-executor 共识：plan 会 stale，必须有 re-planning）。
          //   失败绝不阻塞接力（replan 是增强能力）。
          try {
            const replanned = await maybeReplanOnContinue({ task, conversationId: convId, summary: summaryText });
            if (replanned) {
              const rpMsg = '已根据最新进展**修订任务计划**（剩余步骤已更新），下一批按新计划继续。';
              const rpId = insertMessage(convId, userId, 'assistant', rpMsg);
              emit(task, { type: 'message:added', message: { id: rpId, role: 'assistant', content: rpMsg } });
            }
          } catch { /* replan 失败不影响接力 */ }
          // 重算步数预算（用户中途调大则用新值），继续外层批次循环
          stepBudget = liveMaxSteps();
          continue;
        }

        // 不接力 → 说明是**哪一道闸**挡住的（按真实原因分支，不能只回放 judged.reason ——
        // 那会出上面那种"reason 说该继续、结论却不续"的自相矛盾文案）。
        tipText += `\n\n（未自动续跑：${!expectedContinue
          ? (judged.reason || '模型判定任务已完成')
          : aborted ? '用户已中止'
          : degenerate ? `连续 ${consecutiveArgFailures} 步工具参数为空，判定为空转退化，为免继续消耗已停止`
          : budgetExhausted ? (taskBudgetHit!.kind === 'tokens' ? '任务 token 总预算已耗尽' : '任务墙钟时间已耗尽')
          : (judged.blockedBy || '自动接力未开启')}）`;
      } catch { /* 总结失败回退固定文案 */ }

      const tipId = insertMessage(convId, userId, 'assistant', tipText);
      emit(task, { type: 'message:added', message: { id: tipId, role: 'assistant', content: tipText } });
      // ★★★ 后台子智能体仍在跑 → 不 finish（2026-10-09，与"无工具调用收尾"同一闸）：
      //   直接 emit task:completed 会让前端关流 → browser_* 失去前端执行通道 → pageAgent 停摆。
      //   就地等待后把结果回灌、**继续外层接力批次**（等价于一次自动接力），让主智能体整合结果。
      if (task.backgroundSubAgents.size > 0) {
        const hold = `（仍有 ${task.backgroundSubAgents.size} 个后台子智能体在运行，已就地等待其完成后继续处理。）`;
        try {
          const hid = insertMessage(convId, userId, 'assistant', hold);
          emit(task, { type: 'message:added', message: { id: hid, role: 'assistant', content: hold } });
        } catch { /* 忽略 */ }
        await waitForBackgroundSubAgents(task);
        if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const drained = task.pendingBackgroundResults.splice(0);
        for (const r of drained) {
          const id = insertMessage(convId, userId, 'user', r.text);
          emit(task, { type: 'message:added', message: { id, role: 'user', content: r.text } });
        }
        // 把步数预算还给这一批，让外层批次继续跑（bounded by autoContinueHardCap）
        stepBudget = liveMaxSteps();
        continuationCount++;
        continue;
      }
      emit(task, { type: 'task:completed' });
      task.status = 'completed';
      // 达最大步数 = 长任务最常见的"没跑完"形态：总结必须进空间记忆，
      // 否则同目录新开会话不知道上一批做到哪。复用上面的总结文本，不额外多花一次 LLM 调用。
      void recordTaskProgress(task, 'max_steps', tipText, { steps: budgetReached });
      // 收尾记忆整理（P0-4）：把本批新增记忆做一次轻量整理（light 扫描 + 合并去重），
      // 把「已完成 / 待办」拆出来，别让收尾只剩一团流水账。
      void consolidateOnTaskEnd(task, summaryText || tipText);
      void extractMemoryFromConversation(task);
      return;
    } // ← 自动接力批次循环

    // ★★ 兜底收尾（2026-10-09）：批次循环**跑尽**时仍可能处于 running。
    //   为什么会有这条路径：两个收尾点引入"后台子智能体还在跑 → continue 等它"后，
    //   若这类 continue 把 autoContinueMaxRounds 轮次消耗完，外层 for 会自然退出而**没有任何
    //   emit task:completed** → 前端流永不关闭、任务永远显示"运行中"。原代码靠"收尾点都 return"
    //   绕过了这点，现在必须显式兜底（同时也修复了原设计"最后一轮还在接力就无 finish"的隐患）。
    if (task.status === 'running' && !task.abortController.signal.aborted) {
      if (task.backgroundSubAgents.size > 0) {
        try { await waitForBackgroundSubAgents(task); } catch { /* abort 时忽略，走 catch 收尾 */ }
      }
      const leftover = task.pendingBackgroundResults.splice(0);
      for (const r of leftover) {
        try {
          const id = insertMessage(convId, userId, 'assistant', r.text);
          emit(task, { type: 'message:added', message: { id, role: 'assistant', content: r.text } });
        } catch { /* 忽略 */ }
      }
      if (!task.abortController.signal.aborted) {
        emit(task, { type: 'task:completed' });
        task.status = 'completed';
        void recordTaskProgress(task, 'completed', lastAssistantText(convId));
        void extractMemoryFromConversation(task);
      }
    }

  } catch (e: any) {
    if (isAbortError(e)) {
      task.status = 'aborted';
      emit(task, { type: 'task:aborted' });
      // 被终止的长任务同样要留痕：此前 abort 连一条总结消息都没有，
      // 空间记忆里完全无痕 → 同目录新会话读到的还是"从没做过这个任务"。
      // 取最后一条助手消息当"做到哪"的线索（不额外调 LLM，终止路径要快）。
      void recordTaskProgress(task, 'aborted', lastAssistantText(convId));
    } else {
      task.status = 'failed';
      task.error = e?.message || String(e);
      void recordTaskProgress(task, 'failed', `${task.error}｜${lastAssistantText(convId)}`);
      // 失败留痕：LLM 调用失败（429/401/超时/网络错误等）也要落库——本轮助手占位消息
      // 内容为空时直接把错误写进去，前端实时可见、刷新后也有记录；无占位消息则新增一条。
      const errText = `（调用失败：${task.error}）`;
      try {
        if (activeAssistantMsgId) {
          updateMessageContent(activeAssistantMsgId, errText);
          emit(task, { type: 'message:updated', messageId: activeAssistantMsgId, content: errText });
        } else {
          const failId = insertMessage(convId, userId, 'assistant', errText);
          emit(task, { type: 'message:added', message: { id: failId, role: 'assistant', content: errText } });
        }
      } catch { /* 落库失败不影响错误上报 */ }
      emit(task, { type: 'task:error', error: task.error });
    }
  }
}

/**
 * ★ P1-9：任务预算判定——**实现下沉到 @yan-zhi/shared/context-policy 的 checkTaskBudgetHit**
 * （预算策略与常量同源，避免"判定逻辑复刻"）。此处只做 task 对象的取参适配。
 */
function checkTaskBudgetHit(task: LlmTask): { kind: 'tokens' | 'wallclock'; used: number; limit: number } | null {
  return sharedCheckTaskBudgetHit(task.budgets, task.totalTokens || 0, task.budgetBaselineAt || task.createdAt || Date.now(), Date.now(), task.waitCreditMs || 0);
}

/**
 * ★★★ 达步数上限后的「自动接力」决策（用户 2026-09-28 诉求：
 *   「100 步就自动总结（达到最大步数）应该有个记忆整理，然后根据整理的记忆进行任务，不要一直断」）。
 *
 * 此前这段是**纯收尾**：总结一句 → task:completed → 用户必须手动再说一句"继续"。
 * 现在改为：结账（结构化记账）→ 决策（该不该接着做）→ 接力（同一任务继续跑下一批）。
 *
 * 决策依据（全部满足才接力，宁可少接力也不无限烧 token）：
 *   ① 轮次未超上限 `autoContinueMaxRounds`（默认 3，智能体 config_json 可调；0 = 关闭）；
 *   ② 未被用户终止（由调用方判，本函数不持有 task）；
 *   ③ 未处于空转退化状态（同上，调用方判）；
 *   ④ 模型自评「还有活没干完」（CONTINUE: yes）**或** 任务计划里还有未完成步骤。
 */
async function decideAutoContinue(args: {
  client: LlmClient;
  systemPrompt: string;
  history: Message[];
  maxSteps: number;
  /** 已接力批次数（第 0 批是首次执行） */
  continuationCount: number;
  /** 允许的最大接力批次数；0 = 关闭自动接力 */
  autoContinueMaxRounds: number;
  conversationId: string;
}): Promise<{ shouldContinue: boolean; summary: string; reason: string; /** 该继续但被闸门挡住的真实原因（无则空） */ blockedBy?: string }> {
  const { continuationCount, autoContinueMaxRounds, conversationId } = args;
  // ★★★ 轮次上限 / 总开关不再**提前 return**（2026-09-29 修）：
  //   提前 return 会让后面的 `summarizeOnMaxSteps` 整段跳过 →
  //   用户拿到的是**一行干巴巴的固定文案**，而模型本该给出的"进展总结
  //   （已完成/关键结果/未完成原因/后续建议）"**全部丢失** —— 这正是长任务收尾
  //   看起来"什么都没产出"的原因之一。
  //   改为：照常生成总结（这是用户最需要的产出），只是把"不接力"登记到 blockedBy。
  const disabled = autoContinueMaxRounds <= 0;
  // 见 autoContinueHardCap：autoContinueMaxRounds 是停滞上限（调用方按进展判），这里只判硬顶
  const hardCapped = !disabled && continuationCount >= autoContinueHardCap;

  // ④-a 任务计划里还有未完成步骤 → 直接判定该继续（机械信号比模型自评可靠）
  const planRemaining = readPlanRemainingSteps(conversationId);

  // ④-b 模型自评：复用 summarizeOnMaxSteps 那一轮调用（不额外多花一次 LLM）
  let summary = '';
  let modelSaysContinue = false;
  try {
    const r = await summarizeOnMaxSteps(args.client, args.systemPrompt, args.history, args.maxSteps, 'main');
    summary = r.text || '';
    modelSaysContinue = r.shouldContinue;
  } catch { /* 总结失败不接力（保守） */ }

  // 模型/计划认为该继续 → 但可能被闸门挡住，blockedBy 说明是哪个闸
  const wanted = modelSaysContinue || planRemaining > 0;
  const shouldContinue = wanted && !disabled && !hardCapped;
  const reason = planRemaining > 0
    ? `任务计划尚有 ${planRemaining} 个未完成步骤`
    : modelSaysContinue ? '模型自评任务未完成' : '模型自评任务已完成';
  const blockedBy = !wanted ? undefined
    : disabled ? '自动接力已关闭（autoContinueMaxRounds=0）'
    : hardCapped ? `已达自动接力硬顶（${autoContinueHardCap} 批）`
    : undefined;
  return { shouldContinue, summary, reason, blockedBy };
}

/**
 * ★ P1-8（2026-10-07）：接力边界的**计划中途修订**（re-planning checkpoint）。
 *
 * 背景：task_plan 只在创建时规划一次，接力时仅作为"接力棒"回注 —— 世界变了计划不跟着变，
 * 下一批会按过期计划做错事（外部共识：planner-executor 的计划必然 stale，需要 re-planner）。
 *
 * 流程（只在自动接力被接受时触发，频率可控）：
 *   ① 无计划 / 无剩余步骤 → 直接跳过（零成本）；
 *   ② 用小模型（记忆抽取模型，回落任务主模型）判一次：剩余步骤是否仍有效；
 *   ③ 仅当「计划已失效且给出了修订步骤」才改写 —— 保留已完成步骤原状，替换剩余部分为 pending。
 *
 * 写入走**既有单一出口** backendTaskPlan + backendTaskStep（写库 + 镜像 plan.md），不另起炉灶。
 * 任何失败由调用方 catch（本函数允许抛出，调用方已 try/catch 包住）。
 * @returns 是否实际改写了计划
 */
async function maybeReplanOnContinue(args: { task: LlmTask; conversationId: string; summary: string }): Promise<boolean> {
  const plan = loadTaskPlan(args.conversationId);
  if (!plan) return false;
  const remaining = plan.steps.filter((s) => s.status === 'pending' || s.status === 'running');
  if (remaining.length === 0) return false;
  const summary = String(args.summary || '').trim();
  if (!summary) return false; // 没有总结就没法判断计划是否过期，宁可保留原计划
  const llm = resolveMemoryExtractLlm(args.task);
  if (!llm) return false;
  const client = new LlmClient(llm.platform, llm.model);
  const planText = remaining.map((s, i) => `${i + 1}. [${s.status}] ${s.title}${s.note ? ` —— ${s.note}` : ''}`).join('\n');
  const resp = await client.chat([
    { id: 'sys', conversationId: '', role: 'system', content: '你是任务计划的 re-planner。根据最新进展判断剩余步骤是否仍然有效，只输出 JSON。', createdAt: 0 },
    {
      id: 'usr', conversationId: '', role: 'user', createdAt: 0,
      content: [
        `## 任务计划剩余步骤（共 ${remaining.length} 步）`,
        planText,
        '',
        '## 本批执行后的最新进展总结',
        summary.slice(0, 4000),
        '',
        '请判断：这些剩余步骤按原样继续执行是否仍能达成任务目标？输出 JSON 对象：',
        '{"planStillValid":true或false,"reason":"一句话理由（为什么有效/失效）","revisedSteps":[{"title":"修订后的步骤标题","description":"可选，步骤说明"}]}',
        '规则：计划仍有效 → planStillValid=true，revisedSteps 给空数组；',
        '已部分失效或需要增删步骤 → planStillValid=false，revisedSteps 给出**完整的剩余步骤修订版**（未提到的步骤将被丢弃）。',
      ].join('\n'),
    },
  ], { temperature: 0.2, maxTokens: 1024, responseFormat: { type: 'json_object' } });
  const raw = (resp.delta?.content || '').trim();
  if (!raw) return false;
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch { return false; }
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.planStillValid !== false) return false; // 计划仍有效 → 不动
  const revised = Array.isArray(parsed.revisedSteps)
    ? parsed.revisedSteps.filter((s: any) => s && typeof s.title === 'string' && s.title.trim())
      .map((s: any) => ({ title: String(s.title).trim(), ...(s.description ? { note: String(s.description) } : {}) }))
    : [];
  if (!revised.length) return false; // 判失效却没给修订版 → 保守保留原计划（宁可过期也别清空）
  // 保留已完成/失败步骤原状（含状态），替换剩余部分；写入走 backendTaskPlan + 状态回填
  const doneOrFailed = plan.steps.filter((s) => s.status === 'done' || s.status === 'failed');
  const newSteps = [
    ...doneOrFailed.map((s) => ({ title: s.title, ...(s.note ? { note: s.note } : {}) })),
    ...revised,
  ];
  await backendTaskPlan(args.conversationId, { title: plan.title || '任务计划', steps: newSteps });
  for (let i = 0; i < doneOrFailed.length; i++) {
    await backendTaskStep(args.conversationId, { index: i + 1, status: doneOrFailed[i].status });
  }
  return true;
}

/**
 * 读会话任务计划里「未完成步骤」的条数（pending / running）。
 * 计划由前端 task_plan/task_step 落盘到 conversation.task_plan_json（结构 { title, steps: [...] }）。
 * 读不到/无计划 → 0（不据此接力）。
 */
function readPlanRemainingSteps(conversationId: string): number {
  // 统一走 loadTaskPlan（含工作目录 plan.md 文件回退）—— 别再手写一遍 JSON 解析，
  // 两处各写一遍必然漂移（库/文件回退加在一处时另一处就漏了）。
  try {
    const plan = loadTaskPlan(conversationId);
    if (!plan) return 0;
    return plan.steps.filter((s) => {
      const st = String(s?.status || 'pending');
      return st === 'pending' || st === 'running';
    }).length;
  } catch { return 0; }
}

/**
 * 任务收尾的「轻量记忆整理」（P0-4）。用户诉求原话：
 *   「100 步就自动总结…应该有个记忆整理，然后根据整理的记忆进行任务，不要一直断」。
 *
 * 与 `services/memory-dreaming.ts` 的区别（**不要混用**）：
 *   · dreaming：每日 02:30 后台全量三阶段（light 扫描 → REM 打分 → deep 落盘），重、慢、但彻底；
 *   · 本函数：任务收尾时只做 **light 扫描 + 合并去重**（不跑 REM 打分），轻、快、不阻塞收尾。
 * 目标是把本次任务的新增记忆"结账"成结构化两行（已完成 / 待办），而不是一团流水账。
 *
 * fire-and-forget：任何异常都静默（收尾路径不能因整理失败而报错给用户）。
 */
async function consolidateOnTaskEnd(task: LlmTask, summary: string): Promise<void> {
  try {
    const text = String(summary || '').trim();
    if (!text) return;
    // 只对**本任务新增的短期记忆**做整理：session/daily 且本会话产生
    const rows = db.prepare(
      `SELECT id, content FROM memory
       WHERE user_id = ? AND type IN ('session','daily')
         AND (metadata_json LIKE ? OR conversation_id = ?)
         AND (metadata_json IS NULL OR metadata_json NOT LIKE '%"digested":1%')
       ORDER BY created_at DESC LIMIT 50`,
    ).all(task.userId, `%"${task.conversationId}"%`, task.conversationId) as Array<{ id: string; content: string }>;
    if (!rows.length) return;
    // 标记已消化（避免下次收尾重复整理）；真正的"提拔为长期/合并"仍交每日 dreaming 处理
    const mark = db.prepare(`UPDATE memory SET metadata_json = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        const cur = db.prepare('SELECT metadata_json FROM memory WHERE id = ?').get(r.id) as any;
        let meta: any = {};
        try { meta = JSON.parse(cur?.metadata_json || '{}'); } catch { meta = {}; }
        if (meta?.digested === 1) continue;
        meta.digested = 1;
        meta.digestedAt = Date.now();
        mark.run(JSON.stringify(meta), r.id);
      } catch { /* 单条失败跳过 */ }
    }
    logger.info(`[memory] 收尾整理: 消化 ${rows.length} 条本任务短期记忆 (conv=${task.conversationId})`);
  } catch { /* 收尾整理失败不影响任务状态 */ }
}

/**
 * 执行一个自定义工具（含依赖按需安装）—— 见 `services/tool-deps.ts` 的 runCustomTool 说明。
 * 抽到 services 是为了让 **两条入口**（ReAct 主循环的 custom_ 分支、`api_custom_tool_execute`）
 * 共享同一套「装依赖 → 注模块/站点包 → 执行」语义（此前各写一遍、两处都漏了依赖安装）。
 */
async function runCustomToolCode(tool: any, args: Record<string, unknown>): Promise<string> {
  const { runCustomTool } = await import('./services/tool-deps.js');
  return runCustomTool(tool, args);
}

/** 读文件文本用于修改快照；不存在/不可读返回 null（新文件场景），存在但超大返回 undefined（跳过快照防误回退）。 */
const FILE_SNAPSHOT_MAX_BYTES = 1024 * 1024;
async function readFileOrNull(p: string): Promise<string | null | undefined> {
  try {
    const stat = await fsp.stat(p);
    if (!stat.isFile()) return undefined;
    if (stat.size > FILE_SNAPSHOT_MAX_BYTES) return undefined;
    return await fsp.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ★★★ 编辑后自动诊断（2026-10-03，P0 反馈闭环，对齐 Cursor/Cline 的"改完自动 lint"）
//
// 痛点实测：模型用 file_write/file_edit 改完代码后经常不跑类型检查就宣布完成，
// 类型/语法错误直接交付给用户。本钩子在代码文件被成功改写后自动跑一轮静态诊断
// （code_diagnostics 的 tsc / node --check 通道），把问题回喂到工具结果尾部，
// 模型在下一轮 ReAct 里当场看到并自修 —— 不依赖模型"自觉跑 tsc"。
//
// 控制噪声与延迟的三道闸：
//   · 只对代码扩展名生效（md/图片/产物文档不触发）；
//   · 每会话 45s 节流（连续多次编辑只跑一次，模型可显式调 code_diagnostics 补查）；
//   · 只突出**刚改的文件**的问题，项目级其他问题给汇总数（避免历史错误每轮刷屏）。
// YZ_AUTO_DIAGNOSE=0 可整体关闭。
// ══════════════════════════════════════════════════════════════════════════
const AUTO_DIAGNOSE_INTERVAL_MS = 45_000;
const AUTO_DIAGNOSE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue']);
const autoDiagnoseLastAt = new Map<string, number>();

// ══════════════════════════════════════════════════════════════════════════
// ★★★ 自动验证循环（2026-10-03，P1，对齐 Claude Code hooks / Cline auto-test）
//
// 痛点：模型改完代码直接宣布完成，构建/测试/类型检查全没跑 —— "改完即报喜"。
// 机制：任务里只要**碰过代码文件**（file_write/file_edit 的代码扩展名）且**从未验证过**
//   （没跑过成功的构建/测试命令、也没跑过零问题的 code_diagnostics），
//   在模型宣称完成时注入一条「完成前验证」提醒，逼它补跑验证 —— 最多提醒 2 次
//   （防死循环烧 token），第 3 次宣称完成就放行并在提醒历史里留痕。
// ══════════════════════════════════════════════════════════════════════════
const VERIFY_NUDGE_MAX = 2;
/** 算"验证"的命令特征：构建/测试/类型检查/lint（cmd_exec 成功退出 + 命中即算） */
const VERIFY_CMD_RE = /(tsc|vue-tsc|eslint|pylint|ruff|mypy|pytest|unittest|npm(\.cmd)?\s+(run\s+)?(build|test)|pnpm(\s+run)?\s+(build|test)|yarn\s+(build|test)|mvn\b|gradle\b|go\s+(build|test|vet)|cargo\s+(build|test)|dotnet\s+build|\bmake\s)/i;
interface VerifyState { touched: boolean; verified: boolean; nudges: number }
const verifyStateByTask = new Map<string, VerifyState>();

function verifyStateOf(task: LlmTask): VerifyState {
  let s = verifyStateByTask.get(task.id);
  if (!s) { s = { touched: false, verified: false, nudges: 0 }; verifyStateByTask.set(task.id, s); }
  return s;
}
function markCodeTouched(task: LlmTask): void {
  verifyStateOf(task).touched = true;
}
function markTaskVerified(task: LlmTask): void {
  verifyStateOf(task).verified = true;
}

/** 完成前应注入验证提醒则返回提醒文本，否则 null（并自增提醒计数） */
function takeVerifyNudge(task: LlmTask): string | null {
  if (!task.workspaceDir) return null;
  const s = verifyStateOf(task);
  if (!s.touched || s.verified || s.nudges >= VERIFY_NUDGE_MAX) return null;
  s.nudges++;
  return [
    '【完成前验证】本次任务修改过代码文件，但还没跑过任何构建/测试/类型检查。',
    '请先验证再收尾：调用 code_diagnostics 工具（推荐），或用 cmd_exec 跑一次项目的构建/测试命令。',
    '发现问题就修复后复查；确认无问题（或本次改动无需验证）后，直接给出最终回复即可。',
  ].join('\n');
}

async function maybeAutoDiagnose(task: LlmTask, filePath: string, toolText: string): Promise<string | null> {
  try {
    if (process.env.YZ_AUTO_DIAGNOSE === '0') return null;
    if (!task.workspaceDir) return null; // 没有工作目录（纯聊天会话）不跑
    if (!filePath || toolText.startsWith('Error') || toolText.startsWith('工具执行失败')) return null;
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    if (!AUTO_DIAGNOSE_EXTS.has(ext)) return null;
    const convKey = task.conversationId || task.id;
    const now = Date.now();
    const last = autoDiagnoseLastAt.get(convKey) || 0;
    if (now - last < AUTO_DIAGNOSE_INTERVAL_MS) return null;
    autoDiagnoseLastAt.set(convKey, now);
    // 刚改过文件，项目级 tsc 缓存必失效
    invalidateDiagnosticsCache();
    const res = await runCodeDiagnostics({
      workspaceDir: task.workspaceDir,
      targetPath: filePath,
      checks: ['tsc', 'syntax'],
      timeoutMs: 90_000,
      maxProblems: 10,
    });
    if (!res.ran.length || !res.problems.length) return null;
    const base = filePath.replace(/\\/g, '/').toLowerCase();
    const mine = res.problems.filter((p) => p.file.replace(/\\/g, '/').toLowerCase() === base);
    const others = res.problems.length - mine.length;
    if (mine.length === 0 && others === 0) return null;
    const parts: string[] = [];
    if (mine.length > 0) {
      parts.push(`[自动诊断] 刚修改的文件有 ${mine.length} 个问题（检查: ${res.ran.join('+')}）：`);
      for (const p of mine.slice(0, 10)) {
        parts.push(`  ${p.file}:${p.line}${p.col ? ':' + p.col : ''}  ${p.severity}${p.code ? ' ' + p.code : ''}: ${p.message}`);
      }
      if (others > 0) parts.push(`（另：项目内其他文件还有 ${others}+ 处问题，可用 code_diagnostics 查看）`);
      parts.push('请先用 file_edit 修复以上问题再继续，修复后可调 code_diagnostics 复查。');
    } else {
      parts.push(`[自动诊断] 当前文件无问题；项目内其他文件还有 ${others}+ 处问题（检查: ${res.ran.join('+')}，可用 code_diagnostics 查看）。`);
    }
    return parts.join('\n');
  } catch {
    return null; // 诊断失败绝不影响工具调用本身
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ★ 防失控循环闸门（2026-10-09）：见 services/tool-loop-guard.ts 顶部注释。
//   实例：浏览器助手核实抖音评论区置顶入口（入口不存在），模型连续几十次
//   browser_run_script 换脚本硬试。两条线：同名同参重复 ≥3 次拦 / 同一工具
//   严格连续 ≥8 次拦。只拦不罚，返回指引文本让模型走汇报收口路径。

async function executeTool(
  task: LlmTask,
  registry: ReturnType<typeof getToolRegistry>,
  toolName: string,
  args: any,
  toolCallId: string,
  uiTools: Set<string>,
  depth: number = 0,
  toolDefs: any[] = [],
  /**
   * 出参：工具回传的 `_meta`（如 file_write 的 { path, name, category, bytes, beforeContent }）。
   * ★ 为什么用出参而不是改返回类型：本函数返回的是**给模型看的文本**，
   *   而 `_meta` 是给**调用方做副作用**的（登记 conversation_file / 写 Diff 快照）。
   *   混在一起会让"模型看到盘上路径"（不希望），也让改返回类型牵动两个调用点。
   *   file_write 的落盘路径只有工具自己知道（目录来自 ctx、文件名由它推导），
   *   所以必须由它回传，调用方才能登记到正确位置。
   */
  metaOut?: { value?: Record<string, unknown> | null },
): Promise<string> {
  // 会话级权限拦截（readonly）：写类/不可控工具在此硬拒绝。
  // 放在函数最顶端 —— 被拒时提前 return，file_write/file_edit 的 file_change 快照钩子
  // （registry.execute 前后那段）自然不会执行，不会残留无意义的 pending 记录。
  const perm = checkToolPermission(task.permissionMode || 'readonly', toolName);
  if (!perm.allowed) {
    logger.warn(`[llm-task] 权限拦截: conv=${task.conversationId} mode=${task.permissionMode} tool=${toolName}`);
    return perm.reason || `工具 ${toolName} 已被会话权限拒绝执行`;
  }
  const isUiTool = uiTools.has(toolName);
  const isMcp = toolName.startsWith('mcp_');
  const isCustom = toolName.startsWith('custom_');
  // ★ 不能用 startsWith('api_') 单独判定：media_compose/media_install_ffmpeg 不带前缀却由
  //   executeApiTool 实现。统一用 isApiExecutableTool（见其注释里的完整链路说明）。
  const isApi = isApiExecutableTool(toolName);

  // 参数归一化兜底：模型文本模式工具调用常把 url 放到 target/address/link 等字段，补齐避免误报缺参
  args = normalizeToolArgs(toolName, args);

  // ★ 防失控循环闸门（2026-10-09）：位置在归一化之后——key 按归一化后的参数算，
  //   模型把同一意图换字段名重发也能被识别为重复。放在缺参检查之前：连缺参调用
  //   都在刷屏的更该拦。被拦时提前 return，后续快照/权限副作用一律不发生。
  const loopBlock = checkToolLoop(task, toolName, args);
  if (loopBlock) {
    logger.warn(`[llm-task] 循环拦截: conv=${task.conversationId} tool=${toolName}`);
    return loopBlock;
  }

  // 必填参数防护：arguments 为空/残缺时不带空参硬执行，直接给模型可行动的指引。
  // ★★★ 文案已于 2026-09-29 修正：此前写"可能原因：输出被长度上限截断 / 模型不擅长工具调用"，
  //   实测**两者都不是主因**（`file_read` 的 path 仅几十字符也空参；干净上下文下同一模型
  //   对同一工具能稳定吐出 ~2000 字符的完整参数）。真主因是**历史回放把参数洗成 `{}`**
  //   → 模型模仿 → 自我强化退化（已修 `client.ts:toApiMessage`）。
  //   按错的归因引导，会把用户推去换模型/调 max_tokens，永远修不好。
  const missingArgs = missingRequiredArgs(toolDefs, toolName, args);
  if (missingArgs.length > 0) {
    // ★ 带上 finish_reason 做截断分派（2026-09-29）：截断时**不能**建议"重试同样长度"，
    //   必须改成"落盘 + 短参数引用"两步走（详见 tool-args-advice.ts）。
    return adviceForTruncatedArgs({
      toolName,
      finishReason: task.lastFinishReason,
      missingArgs,
      rawArguments: (args && typeof args === 'object') ? JSON.stringify(args) : args,
    }).message;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ★ 用户钩子（P2-7 P2a）：设置页里用户声明的 before 规则（deny=直接拒绝 / confirm=每次弹窗确认）
  //
  // 位置：缺参检查之后（空参调用不该触发规则）、内置危险命令护栏之前（用户显式规则
  // 优先级更高，deny 短路还省一次弹窗）。confirm 复用 path-guard 的弹窗通道
  // （requestPathAuthorization），无人值守 fail-safe 拒绝、授权**不记忆** ——
  // 与危险命令护栏同口径：用户规则要的就是"每次都问我"，记忆了规则就失效了。
  // 匹配逻辑只有一份（services/user-hooks.ts），与「判定/执行分离」的既有风格一致。
  // ══════════════════════════════════════════════════════════════════════════
  const hookVerdict = matchUserHooks(task.userId, toolName, args);
  const hookItem: PathAccessItem = {
    toolName, action: 'write', absPath: '', rawPath: summarizeCommandArgs(args) || JSON.stringify(args ?? {}).slice(0, 200),
  };
  if (hookVerdict.denyRules.length > 0) {
    const why = hookVerdict.denyRules.map((r) => `「${r.name}」`).join('、');
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'user-hook-denied', reason: `命中用户规则 ${why}`, items: [hookItem],
    });
    logger.warn(`[user-hook] deny conv=${task.conversationId} tool=${toolName} 规则=${hookVerdict.denyRules.map((r) => r.name).join(',')}`);
    return `用户规则 ${why} 拒绝了工具 \`${toolName}\` 的本次调用。这是用户在设置中明确配置的拦截规则，请不要尝试绕过或重试；如认为该规则阻碍了任务，请向用户说明原因，由用户自行调整规则。`;
  }
  if (hookVerdict.confirmRules.length > 0) {
    const why = hookVerdict.confirmRules.map((r) => `「${r.name}」`).join('、');
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'user-hook-confirm', reason: `命中用户规则 ${why}`, items: [hookItem],
    });
    const granted = await requestPathAuthorization(task, toolName, [hookItem], COMMAND_TOOLS.has(toolName), `用户规则 ${why} 要求确认`);
    if (!granted.ok) {
      auditPathAccess({
        userId: task.userId, conversationId: task.conversationId, taskId: task.id,
        toolName, decision: 'user-hook-denied', reason: `用户规则 ${why} 未获确认`, items: [hookItem],
      });
      logger.warn(`[user-hook] confirm 拒绝 conv=${task.conversationId} tool=${toolName} 规则=${hookVerdict.confirmRules.map((r) => r.name).join(',')}`);
      return granted.message;
    }
    logger.warn(`[user-hook] confirm 通过 conv=${task.conversationId} tool=${toolName} 规则=${hookVerdict.confirmRules.map((r) => r.name).join(',')}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ★★★ 工作目录边界守卫（2026-10-01，用户报「访问其他目录需要用户授权」→ 决策「弹窗授权」）
  //
  // 位置刻意放在「缺参检查之后、工具分发之前」：
  //   · 放缺参之前 → 缺 path 的调用也会弹窗（噪音，且那本该由 missingRequiredArgs 引导）；
  //   · 放分发之后 → 四类分支（UI/MCP / API / 内置 / 委派）各要接一遍，必漏（本项目既有教训）。
  //
  // 判定只有一份（services/path-guard），三种执行入口各自决定拿到 need-auth 后的动作；
  // 这里（ReAct 主链路）有前端在线 → 弹窗授权。
  // ══════════════════════════════════════════════════════════════════════════
  // 档位（设置项 pathGuard，默认 ask）：off 明示不检查；strict 越界直接拒（不给授权入口）。

  // ── 危险命令护栏（2026-10-03，P1）：与路径守卫独立，pathGuard=off 也拦 ──
  // 破坏性命令（递归删除/格式化/强推/关机…）**每次调用单独弹窗**，不复用"首次授权"，
  // 且授权通过也不记入会话授权集合 —— 单独点头，永不记忆。
  const isCommandTool = COMMAND_TOOLS.has(toolName);
  const dangerHit = isCommandTool ? checkDangerousCommand(summarizeCommandArgs(args)) : null;
  let dangerGranted = false;
  if (dangerHit) {
    const dangerItems: PathAccessItem[] = [{
      toolName, action: 'write', absPath: '', rawPath: summarizeCommandArgs(args),
    }];
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'danger-confirm', reason: dangerHit.why, items: dangerItems,
    });
    const granted = await requestPathAuthorization(task, toolName, dangerItems, true, dangerHit.why);
    if (!granted.ok) {
      logger.warn(`[danger-guard] 拒绝 conv=${task.conversationId} tool=${toolName} 原因=${granted.reason} 危险=${dangerHit.why}`);
      auditPathAccess({
        userId: task.userId, conversationId: task.conversationId, taskId: task.id,
        toolName, decision: 'danger-denied', reason: granted.reason, items: dangerItems,
      });
      return granted.message;
    }
    dangerGranted = true; // 本次调用放行，但**不写** commandAuthorizedConvs
    logger.warn(`[danger-guard] 危险命令已单独授权 conv=${task.conversationId} tool=${toolName} 危险=${dangerHit.why}`);
  }

  if (task.pathGuard !== 'off') {
    const pathVerdict = checkPathAccess({
      toolName,
      args,
      workspaceDir: task.workspaceDir,
      allowedRoots: allowedRootsFor(task.workspaceDir, task.conversationId),
      authorizedDirs: getAuthorizedDirs(task.conversationId),
    });
    if (pathVerdict.kind === 'need-auth') {
      // 命令类工具：按**会话**记「首次授权」（用户决策：首次授权 + 全量审计）
      const isCommand = COMMAND_TOOLS.has(toolName);
      if (task.pathGuard === 'strict') {
        auditPathAccess({
          userId: task.userId, conversationId: task.conversationId, taskId: task.id,
          toolName, decision: 'strict-denied', reason: 'strict 档位下越界直接拒绝', items: pathVerdict.items,
        });
        return `越界访问已被「严格模式」拒绝：${pathVerdict.items.map((i) => i.rawPath || i.toolName).join(', ')}。`
          + `请在设置里把「工作目录守卫」改为「询问」或直接使用工作目录内的路径。`;
      }
      if (isCommand && dangerGranted) {
        // 危险命令已在上面单独授权过本次调用，路径授权不再重复弹（弹两次 = 骚扰）
        logger.warn(`[path-guard] 放行(危险命令已单独授权) conv=${task.conversationId} tool=${toolName}`);
      } else if (isCommand && isCommandAuthorized(task.conversationId)) {
        logger.warn(`[path-guard] 放行(命令已授权) conv=${task.conversationId} tool=${toolName}`);
      } else {
        const granted = await requestPathAuthorization(task, toolName, pathVerdict.items, isCommand);
        if (!granted.ok) {
          logger.warn(`[path-guard] 拒绝 conv=${task.conversationId} tool=${toolName} 原因=${granted.reason}`);
          return granted.message;
        }
      }
    }
  }

  // UI 工具 → 委托前端（需要用户交互）；MCP 工具 → 优先委托前端（连接在前端，所见即所得），
  // 无人值守（定时任务/IM，无 SSE 订阅者）时后端直连 MCP 兜底，避免工具永远拿不到结果
  if (isUiTool || isMcp) {
    // ★ task_plan / task_step 无人值守兜底（2026-09-30）：这两个工具此前纯委托前端，
    //   前端不在线（定时任务/后端直跑/刷新间隙）时走 unattendedToolResult 空转 ——
    //   计划落不下来，自动接力的机械信号（readPlanRemainingSteps）随之失效。
    //   后端直接写 conversation.task_plan_json + 镜像工作目录 plan.md；前端在线时仍走前端
    //   （UI 卡片实时渲染 + persistPlan PATCH → 路由层镜像写文件），两条路共享同一落盘格式。
    if (!isMcp && (toolName === 'task_plan' || toolName === 'task_step') && task.subscribers.size === 0) {
      try {
        return toolName === 'task_plan'
          ? await backendTaskPlan(task.conversationId, args || {})
          : await backendTaskStep(task.conversationId, args || {});
      } catch (e: any) {
        return `${toolName} 执行失败: ${e?.message || e}`;
      }
    }
    if (task.subscribers.size > 0) {
      return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
    }
    if (isMcp) {
      const resolved = resolveMcpToolName(task.mountedMcpServerIds || [], toolName);
      if (resolved) {
        try {
          return await callMcpTool(resolved.serverId, resolved.toolName, args);
        } catch (e: any) {
          return `MCP 工具执行失败: ${e?.message || e}`;
        }
      }
    }
    return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
  }

  // API 工具（api_memory_search/api_kb_search/api_data_* 等）→ 后端直接执行；agentId 用于本体挂载范围过滤
  if (isApi) {
    try {
      const result = await executeApiTool(toolName, args, task.userId, task.agentId ?? undefined, task.ontologyIds, task.conversationId, task.workspaceDir);
      return result.content?.map((c: any) => c.text || '').join('') || JSON.stringify(result);
    } catch (e: any) {
      return `API 工具执行失败: ${e?.message || e}`;
    }
  }

  // ── 多智能体编排（2026-10-08）：plan_tasks / get_plan_status / reassign_task ──
  // 仅主智能体（depth 0）可编排：子智能体再规划会造成 DAG 无限展开。
  // plan_tasks 异步启动 PlanRunner，主循环不阻塞 —— 结果/失败由调度器投递回会话唤醒。
  if (toolName === 'plan_tasks') {
    if (depth >= 1) return '子智能体不能再做任务规划（仅主智能体可编排，防止 DAG 无限展开）';
    const r = createPlan(task, args);
    if (!r.ok) return r.message;
    // 把本次任务的 uiTools 挂到 task 上：PlanRunner 派发计划项时透传给 runSubAgent，
    // 保证子智能体工具面裁剪口径与主链路一致（pageAgent 的 browser_navigate 等）。
    (task as any).uiTools = uiTools;
    // ★ 同步等待计划跑完（见 runPlanToCompletion 注释：fire-and-forget 会导致主智能体
    //   在计划完成前就 finish、唤醒失效）。阻塞期间不调 LLM；计划内部仍并行派发子任务。
    const summary = await runPlanToCompletion(task, r.planId);
    return `${r.message}\n\n${summary}`;
  }
  if (toolName === 'get_plan_status') {
    return getPlanStatusText(task.conversationId, args?.planId);
  }
  if (toolName === 'reassign_task') {
    if (depth >= 1) return '子智能体不能再重分配任务（仅主智能体可编排）';
    const r = reassignPlanItem(task, args || {});
    if (!r.ok || !r.planId) return r.message;
    (task as any).uiTools = uiTools;
    const summary = await runPlanToCompletion(task, r.planId);
    return `${r.message}\n\n${summary}`;
  }

  // call_agent → 后端直接执行子 ReAct 循环（仅主智能体可调用，子智能体深度=1 不可再嵌套）
  if (toolName === 'call_agent') {
    if (depth >= 1) return '子智能体不能再调用子智能体（深度仅允许 1 层）';
    // async: true → 后台并行（P2-6）：立即返回回执，完成后结果注入本会话
    if ((args as any).async === true || (args as any).async === 'true') {
      return startBackgroundSubAgent(task, args, toolCallId, depth, uiTools);
    }
    return runSubAgent(task, args, toolCallId, depth, uiTools);
  }

  // spawn_subagent → **运行时现场生成**专项子智能体（对齐 AOrchestra 的四元组 Φ=(I,C,T,M)）
  // 与 call_agent 的区别：call_agent 调**已存在**的角色，spawn_subagent 现场给一个临时执行者填配置。
  if (toolName === 'spawn_subagent') {
    if (depth >= 1) return '子智能体不能再生成子智能体（深度仅允许 1 层，防递归自增殖）';
    return runSpawnedSubAgent(task, args, toolCallId, depth, uiTools);
  }

  // wf_<agentId> → 工作流工具（工作流模式：AI 模式下的主要调用通道）
  //
  // 与 call_agent 的关键区别：参数已是结构化对象（工具 schema 由 input 节点生成），
  // 不需要 mapWorkflowInputs 那套「文本 → 结构化」的猜法，所以不做别名解析、不做单键兜底。
  // 缺必填项就直接退回让模型补参 —— 静默兜底会跑出一份看似正常、实则无意义的产出。
  if (isWorkflowToolName(toolName)) {
    if (depth >= 1) return '子智能体不能再调用工作流（深度仅允许 1 层）';
    const wfAgentId = workflowAgentIdOfTool(toolName);
    const row = db
      .prepare('SELECT id, name, inputs_schema_json, workflow_json FROM agent WHERE id = ?')
      .get(wfAgentId) as any;
    if (!row) return `工作流不存在或已被删除: ${wfAgentId}`;

    // 只读会话下按**实际节点内容**判定（含 tool 写工具 / sub_agent / code 里的 fs、child_process）。
    // 不能只靠 checkToolPermission 的前缀拦截：会把纯取数的流水线一并误伤。
    const wfPerm = checkWorkflowPermission(task.permissionMode || 'readonly', (() => {
      try { return JSON.parse(row.workflow_json || '{}'); } catch { return null; }
    })(), toolName);
    if (!wfPerm.allowed) {
      logger.warn(`[llm-task] 工作流权限拦截: conv=${task.conversationId} mode=${task.permissionMode} wf=${wfAgentId}`);
      return wfPerm.reason || `工作流 ${wfAgentId} 已被会话权限拒绝执行`;
    }

    const fields = buildWorkflowInputFieldDefs(row);
    const argsObj = (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
    // 只认 schema 里声明过的键，避免模型把 toolName/agentId 之类的杂项也塞进 inputs
    const inputs: Record<string, unknown> = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(argsObj, f.key)) inputs[f.key] = argsObj[f.key];
    }
    const missing = fields.filter((f) => f.required && (inputs[f.key] === undefined || inputs[f.key] === '')).map((f) => f.key);
    if (missing.length > 0) {
      return `缺少必填入参：${missing.join('、')}。该工作流需要：${JSON.stringify(
        Object.fromEntries(fields.map((f) => [f.key, f.required ? '<必填>' : '<可选>'])),
      )}`;
    }
    // 未声明入参的工作流：把对象原样透传（保持与 /workflow/run 一致的行为）
    const finalInputs = fields.length === 0 ? argsObj : inputs;

    const bundle = resolveBundleFromDb(wfAgentId);
    if (!bundle) return `工作流定义解析失败: ${wfAgentId}`;

    const delivery: WorkflowDeliveryCtx = {
      conversationId: task.conversationId,
      userId: task.userId,
      taskId: task.id,
      agentId: task.agentId || '',
      agentName: row.name || wfAgentId,
      parentToolCallId: toolCallId,
    };
    const runId = startWorkflowRun(bundle, finalInputs, task.userId, delivery);

    // ★ 必须订阅终态，否则「跑完了但没人通知」。
    //
    // 这里漏过一次（真实故障）：只调了 startWorkflowRun 传 delivery，没有 watchWorkflowRun。
    // 表现为——运行能正常跑完、status=completed、delivery_json 也落了库，
    // 但**对话里永远收不到完成通知**（deliverWorkflowResult 从来没有被调用过），
    // 用户看到的就是「启动了，然后没有下文」。
    //
    // 两条链路的分工：
    //   delivery（第 4 参）→ 落 workflow_run.delivery_json，供**重启后**补投；
    //   watchWorkflowRun   → 当前进程内订阅事件，跑完**立刻**反写。
    // 少任何一条都会漏：只有 delivery 要等重启，只有 watch 则进程重启就丢。
    //
    // 长流程（十几分钟）不必担心任务已经结束 —— notifyConversation 会在
    // 任务不再 running 时自动改走会话级 SSE 总线，前端照样收得到。
    watchWorkflowRun(runId, delivery);

    return buildWorkflowReceipt(row.name || wfAgentId, runId);
  }

  // list_sub_agents → 后端直接查 DB
  if (toolName === 'list_sub_agents') {
    const conv = db.prepare('SELECT agent_id FROM conversation WHERE id = ?').get(task.conversationId) as any;
    // 会话未绑定智能体时 fallback 到 a_default_assistant，确保始终能列出公开子智能体
    let agentId = conv?.agent_id;
    if (!agentId) {
      const def = db.prepare("SELECT 1 FROM agent WHERE id = 'a_default_assistant' AND (user_id = ? OR is_public = 1)").get(task.userId);
      if (def) agentId = 'a_default_assistant';
    }
    if (!agentId) return '当前会话未绑定智能体，且系统未配置默认智能体';
    const agent = db.prepare('SELECT sub_agent_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, task.userId) as any;
    const subIds: string[] = (() => { try { return JSON.parse(agent?.sub_agent_ids || '[]'); } catch { return []; } })();
    if (subIds.length === 0) return '当前智能体未挂载任何子智能体';
    const lines: string[] = [];
    for (const id of subIds) {
      const sub = db.prepare('SELECT name, description, platform_id, model_id, type, inputs_schema_json, workflow_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(id, task.userId) as any;
      if (!sub) { lines.push(`- id: \`${id}\`（该子智能体已被删除）`); continue; }
      // 类型标注：工作流型是跑固定 DAG 的流水线，入参形态与对话型不同。
      // 不标注的话模型只能靠名字猜，会把工作流当对话型委派，拿到一段无关空谈。
      if (isWorkflowAgent(sub)) {
        // 用 extractWorkflowInputFields：内置工作流的 inputs_schema_json 为 NULL，
        // 真正 schema 在 workflow_json 的 input 节点里。只读列的话这里会显示「未声明」，
        // 模型就不知道要传 topic，委派必然传成 key=input 而 DAG 读 ctx.inputs.topic。
        const fields = extractWorkflowInputFields(sub);
        const inputsNote = fields.length > 0 ? `入参: {${fields.join(', ')}}` : '入参: 未声明';
        lines.push(`- **${sub.name}** (id: \`${id}\`, 类型: 工作流): ${sub.description || ''} | ${inputsNote}`);
        continue;
      }
      // 附带子智能体当前绑定的模型信息，供 call_agent 决策是否覆盖
      let modelNote = '';
      if (sub.platform_id || sub.model_id) {
        const mp = sub.platform_id ? db.prepare('SELECT name FROM platform WHERE id = ?').get(sub.platform_id) as any : null;
        const mm = sub.model_id ? db.prepare('SELECT alias, model_id, type FROM model WHERE id = ?').get(sub.model_id) as any : null;
        const pn = mp?.name || sub.platform_id;
        const mn = mm ? (mm.alias || mm.model_id) : sub.model_id;
        const mt = mm?.type ? `(${mm.type})` : '';
        modelNote = ` | 模型: ${pn}/${mn}${mt}`;
      }
      lines.push(`- **${sub.name}** (id: \`${id}\`): ${sub.description || ''}${modelNote}`);
    }
    return lines.join('\n');
  }

  // get_sub_task_detail → 后端直接查 DB：子任务执行详情（编排者分析子智能体失败原因用）
  if (toolName === 'get_sub_task_detail') {
    const runId = String(args?.runId || '');
    if (!runId) return 'runId 为必填项。子任务 ID 在 call_agent / spawn_subagent 返回结果末尾的「子任务ID」处获取。';
    const trace = loadSubTaskTrace(runId);
    if (trace.length === 0) return `未找到子任务 ${runId} 的执行记录（可能：ID 抄错 / 子任务尚未开始落库 / 属于另一会话）。`;
    return formatSubTaskTrace(trace, Math.min(Number(args?.maxSteps) || 40, 200));
  }

  // list_models → 后端直接查 DB，返回语义化的可用模型清单（平台 + type + capabilities + description）
  if (toolName === 'list_models') {
    return listAvailableModels(task.userId, args);
  }

  // 自定义工具 → 后端直接执行（node:vm 沙箱，避免后端→前端→后端绕圈）
  if (isCustom) {
    const m = toolName.match(/^custom_([a-zA-Z0-9]{1,8})_(.+)$/);
    if (m) {
      const idTag = m[1];
      const tName = m[2];
      const rows = db.prepare('SELECT id, name, code, entry, timeout, enabled, runtime, dependencies_json FROM custom_tool WHERE user_id = ? AND enabled = 1').all(task.userId) as any[];
      const tool = rows.find((r: any) => (r.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) === idTag && r.name === tName);
      if (tool) {
        try {
          return await runCustomToolCode(tool, args);
        } catch (e: any) {
          return `工具执行失败: ${e?.message || e}`;
        }
      }
    }
    return `自定义工具不存在或未启用: ${toolName}`;
  }

  // 浏览器工具 → 在线（有 SSE 订阅者）全量委托前端 BrowserView 桥接（所见即所操作，
  // 预览面板可见虚拟鼠标/输入）。单一执行面：桌面在线时绝不回退服务端 Playwright，
  // 否则操作与预览分裂 + headless 被风控弹验证码。委托失败直接报错让模型重试。
  // 注意：白名单必须是全部 browser_* 前缀。若只放行 browser_navigate，会出现
  // navigate 打预览 BrowserView、click/type 等打服务端 headless Playwright 的双浏览器分裂
  // （Playwright 页面从未被导航 → locator.fill 30s 超时死循环）。
  const isBrowser = toolName.startsWith('browser_');
  // SSE 瞬断兜底（2026-10-09）：订阅者暂缺时先等一个重连窗口（前端 0.5s→5s 退避重连），
  // 恢复就继续走前端执行面；仍无人订阅才落回原有离线路径。
  // 原实现 subscribers=0 立即落到离线 Playwright/报错 —— 产线长任务表现为「一断全停」。
  if (isBrowser && task.subscribers.size === 0) {
    await waitForFrontendSubscriber(task, 15000);
  }
  if (isBrowser && task.subscribers.size > 0) {
    let delegated: string;
    try {
      delegated = await executeToolViaFrontend(task, toolName, args, toolCallId, depth);
    } catch (e: any) {
      if (e?.name === 'AbortError' || task.abortController.signal.aborted) throw e;
      // 前端委托超时/断连（SSE 瞬断、页面关闭）→ 再等一个重连窗口重试一次，仍失败才报错
      if (!(await waitForFrontendSubscriber(task, 8000))) {
        return `浏览器工具 ${toolName} 前端暂时不可达（SSE 断连或超时），本次未执行。请稍后重试，或告知用户检查应用窗口是否开启。`;
      }
      try {
        delegated = await executeToolViaFrontend(task, toolName, args, toolCallId, depth);
      } catch (e2: any) {
        if (e2?.name === 'AbortError' || task.abortController.signal.aborted) throw e2;
        return `浏览器工具 ${toolName} 前端暂时不可达（SSE 断连或超时，等待重连后重试仍失败），本次未执行。请稍后重试，或告知用户检查应用窗口是否开启。`;
      }
    }
    // 截图归档：main.cjs 已落盘，这里复制进会话产物目录并登记 conversation_file
    if (toolName === 'browser_screenshot') {
      return await archiveDelegatedScreenshot(delegated, task, metaOut);
    }
    return delegated;
  }
  // 离线浏览器工具 → 检测 Playwright 可用性
  if (isBrowser) {
    if (playwrightAvailable === null) {
      try { await import('playwright'); playwrightAvailable = true; }
      catch { playwrightAvailable = false; }
    }
    if (!playwrightAvailable) {
      return `浏览器工具不可用：Playwright 未安装。请在 apps/server 执行 pnpm add playwright && npx playwright install chromium`;
    }
  }

  // 内置工具 → 后端直接执行
  if (registry.has(toolName)) {
    // ★★★ 代码层面把产物目录算好直接传给工具（2026-09-23，用户口径：
    //     「路径不应该方法里面自己判断？还用大模型传？」「代码层面直接传入啊」）。
    //
    //   此前 file_write 的 path 是**必填、由模型编**：文件被写到工作区任意位置，
    //   服务端静态媒体路由只认规范目录 → 登记进 conversation_file 的文件
    //   预览/另存为一律 404（"能看到但预览不行"）。
    //
    //   这里用与媒体产物**同一个** resolveArtifactDirFor（单一出口）算出两个分类目录，
    //   工具只负责拼文件名 —— core 侧零业务知识，也不做回调注入。
    const artifactDirs = (() => {
      const convId = task.conversationId;
      if (!convId) return undefined;
      try {
        return {
          intermediate: resolveArtifactDirFor({ conversationId: convId, category: 'intermediate' }).dir,
          deliverable: resolveArtifactDirFor({ conversationId: convId, category: 'deliverable' }).dir,
          upload: resolveArtifactDirFor({ conversationId: convId, category: 'upload' }).dir,
        };
      } catch (e: any) {
        // 目录解析失败不能静默：否则又退回"按模型给的 path 写"，问题原样复现。
        logger.warn('[llm-task] 产物目录解析失败，file_write 将退回旧行为:', e?.message || e);
        return undefined;
      }
    })();
    // ★ workspaceDir 必须传：工具用它把**相对路径**解析到工作目录（否则落到进程 cwd，
//   实测 `02-work` / `.yan-zhi/tasks/<convId>` 一律 directory not found）。
//   子智能体走同一个 executeTool → 自动同样受益。
    const toolCtx = { conversationId: task.conversationId, userId: task.userId, artifactDirs, workspaceDir: task.workspaceDir };

    // 文件修改快照：file_edit 落盘前记下原内容，供前端 Diff 对比 / 应用 / 回退。
    // ★ file_write 不走这里 —— 它的落盘路径由工具按会话目录决定，调用方执行前无法预知，
    //   故由工具自身在落盘前读原内容并经 _meta.beforeContent 回传（见 file-write.ts）。
    // ★ snapPath 必须先解析成**绝对路径**（相对路径以工作目录为基准）：此前直接存模型给的
    //   原始路径 —— readFileOrNull 相对进程 cwd 读（before 快照错位），且 file_change.path
    //   是相对路径导致 /workspace/changes 按目录前缀过滤永远匹配不上（编辑器提示条不出现）。
    const snapPath = (toolName === 'file_edit')
      ? resolveToolPath(String(args?.path || ''), task.workspaceDir)
      : '';
    const before = snapPath ? await readFileOrNull(snapPath) : null;
    // ★★★ 等待抵扣（2026-10-09，见 shared/context-policy 的 TASK_WAIT_CREDIT_CAP_MS）：
    //   工具执行耗时里的大头是**等外部子进程**（如 python_exec 跑 novel_tuiwen 出片 5~8 分钟）。
    //   把它计入墙钟 = 惩罚"用外部工具干活"，长任务必然每批超时。此处累计抵扣，预算判定时扣除。
    //   ★ 放在**唯一工具出口**（registry.execute 两侧），覆盖原生/API/MCP/自定义全部工具，零遗漏。
    const execStartedAt = Date.now();
    // ★★★ A4 根治（2026-10-10）：把**当前会话**告知 core 的浏览器工具 ——
    //   它们据此把 `x-yz-conversation-id` 带给浏览器路由，服务端按会话隔离"活动页"，
    //   避免"A 会话导航中、B 会话读取/截图拿到 A 的页面"（且静默无报错）。
    //   ★ 放在**唯一工具出口**（registry.execute 之前），一处覆盖全部 browser_* 工具，
    //     不需要逐个改 33 个工具的 execute 签名（那必然漏）。
    //   ★ 每次调用前都设置（含非 browser 工具）—— 保证不会残留上一个会话的值。
    setBrowserToolConversationId(task.conversationId);
    const r = await registry.execute(toolName, args, toolCtx);
    try {
      task.waitCreditMs = addWaitCredit(task.waitCreditMs || 0, Date.now() - execStartedAt);
    } catch { /* 记账失败不影响工具结果 */ }
    let text = typeof r === 'string' ? r : (r.content?.map((c: any) => c.text || '').join('') || JSON.stringify(r));
    const meta = (r as any)?._meta as { path?: string; beforeContent?: string | null } | undefined;
    // 把 _meta 交给调用方（供登记 conversation_file / 写 Diff 快照）
    if (metaOut) metaOut.value = (meta as Record<string, unknown> | undefined) || null;
    if (toolName === 'file_write' && meta?.path) {
      // file_write：路径与 before 都来自工具回传（落盘即权威）
      const after = await readFileOrNull(meta.path);
      if (meta.beforeContent !== after) {
        try {
          db.prepare('INSERT INTO file_change (id, user_id, conversation_id, task_id, path, before_content, after_content, tool, status, step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('fc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), task.userId, task.conversationId, task.id, meta.path, meta.beforeContent ?? null, after, toolName, 'pending', task.step, Date.now());
        } catch { /* 快照失败不影响工具结果 */ }
      }
    } else if (snapPath && before !== undefined && !text.startsWith('Error') && !text.startsWith('工具执行失败')) {
      const after = await readFileOrNull(snapPath);
      if (before !== after) {
        try {
          db.prepare('INSERT INTO file_change (id, user_id, conversation_id, task_id, path, before_content, after_content, tool, status, step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('fc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), task.userId, task.conversationId, task.id, snapPath, before, after, toolName, 'pending', task.step, Date.now());
        } catch { /* 快照失败不影响工具结果 */ }
      }
    }
    // ★ 编辑后自动诊断（P0 反馈闭环）：代码文件被成功改写 → 静态诊断结果附加到工具结果尾部，
    //   模型当场看到类型/语法错误并自修（详见 maybeAutoDiagnose 注释）。
    const autoDiag = await maybeAutoDiagnose(task, meta?.path || snapPath, text);
    if (autoDiag) text = `${text}\n\n${autoDiag}`;
    // ★ 自动验证循环的记账：碰过代码文件 / 跑过有效验证（详见 takeVerifyNudge 注释）
    if ((toolName === 'file_write' || toolName === 'file_edit') && !text.startsWith('Error') && !text.startsWith('工具执行失败')) {
      const touchedPath = meta?.path || snapPath;
      const touchedExt = (touchedPath.split('.').pop() || '').toLowerCase();
      if (AUTO_DIAGNOSE_EXTS.has(touchedExt)) markCodeTouched(task);
    }
    if (toolName === 'code_diagnostics' && text.includes('✅ 未发现问题')) {
      markTaskVerified(task);
    } else if (toolName === 'cmd_exec' && !text.startsWith('Error') && !text.startsWith('工具执行失败')) {
      const cmdText = [args?.command, ...(Array.isArray(args?.args) ? args.args : [])].filter(Boolean).join(' ');
      if (VERIFY_CMD_RE.test(cmdText) && /Exit code:\s*0\b/.test(text)) markTaskVerified(task);
    }
    return text;
  }

  // 未知工具 → 尝试前端兜底
  return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
}

/** 通过 SSE 委托前端执行工具，等待前端 POST 结果回来。
 *  事件有缓冲：前端刷新断开时事件不丢失，重连后重放并执行。
 *  @param timeoutMsOverride 覆盖默认超时；传 0 表示**不设超时**（授权弹窗等"可能隔很久才答"的场景） */
/**
 * 等待前端 SSE 订阅者回归（断连重连窗口）。返回 true=已有订阅者；false=超时或任务已中止。
 * 前端断流后按 0.5s→5s 指数退避重连（最多 8 次），这里轮询等待即可衔接上。
 */
async function waitForFrontendSubscriber(task: LlmTask, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (task.abortController.signal.aborted) return false;
    if (task.subscribers.size > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return task.subscribers.size > 0;
}

/**
 * browser_screenshot 归档后处理（2026-10-09）：桌面端 main.cjs 截图时已同步落
 * userData/screenshots/screenshot-<ts>.png，前端把存档路径带回结果文本。
 * 这里把文件复制进会话中间产物目录并设置 _meta → artifact-hooks 统一登记
 * conversation_file（文件管理可见、工件清单可引用）。无存档路径（旧版 main /
 * 落盘失败）时原样返回，行为不变；归档失败不影响截图本身。
 */
async function archiveDelegatedScreenshot(
  result: string,
  task: LlmTask,
  metaOut?: { value?: Record<string, unknown> | null },
): Promise<string> {
  try {
    // ★★★ 2026-10-09 修（C6）：原正则 `/已存档: (.+)/` 是**贪婪**的，而前端回传的文本是
    //   `截图已捕获（已存档: <path>）`，结尾是**全角右括号** → `）` 被一起吞进路径
    //   → `fsp.stat(src)` 报 ENOENT → 被下面的 catch 静默吞掉 → **截图能存临时区，但登记不进
    //   conversation_file**（文件管理里看不到）。而失败是静默的，只表现为"截图没了"。
    //   ★ 记忆曾误记"已复用 SCREENSHOT_NAME_RE 修过"—— 实测 `SCREENSHOT_NAME_RE` 只存在于
    //     `plugins/computer-use.ts`，本函数从未使用它（记忆是线索不是结论，已回源码核实）。
    //   改为**排除全角/半角右括号与换行**，从根上不受收尾标点影响。
    const src = result.match(/已存档:\s*([^\n）)]+)/)?.[1]?.trim();
    if (!src || !task.conversationId) return result;
    const fsp = await import('node:fs/promises');
    const nodePath = await import('node:path');
    const size = (await fsp.stat(src)).size;
    const dir = resolveArtifactDirFor({ conversationId: task.conversationId, category: 'intermediate' }).dir;
    await fsp.mkdir(dir, { recursive: true });
    const dest = nodePath.join(dir, nodePath.basename(src));
    if (dest !== src) await fsp.copyFile(src, dest);
    if (metaOut) metaOut.value = { path: dest, name: nodePath.basename(dest), category: 'intermediate', bytes: size };
    return `截图已捕获并归档: ${dest}\n你看不到画面；需要理解页面内容或定位元素时，调用 image_analyze(path="${dest}", prompt="描述页面内容并给出目标元素的位置")`;
  } catch (e: any) {
    logger.warn('[llm-task] 截图归档失败（不影响截图本身）:', e?.message || e);
    return result;
  }
}

async function executeToolViaFrontend(task: LlmTask, toolName: string, args: any, toolCallId: string, depth: number = 0, timeoutMsOverride?: number): Promise<string> {
  // 工具发起前的暂停边界：暂停中不发新工具（正在跑的前一个动作已在各自的 await 里自然跑完）
  await waitIfPaused(task);
  // 无人值守（无前端 SSE 订阅者）：UI/MCP 工具无法委托前端，直接返回提示让模型自行决策
  if (task.subscribers.size === 0) {
    return unattendedToolResult(toolName);
  }
  return new Promise<string>((resolve, reject) => {
    const callId = 'tc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const interactive = INTERACTIVE_TOOLS.has(toolName);
    // 交互类工具不设超时（用户可能在"思考要不要确认"，隔天回来也要能继续答）
    // ★ timeoutMsOverride === 0 → 显式要求不设超时（授权弹窗同性质）。
    const noTimeout = timeoutMsOverride === 0;
    // ★ P1（2026-10-09）：分档超时 —— browser_* 按慢/快档解析（含串行排队宽限），
    //   不再一刀切 2 分钟。见 resolveFrontendToolTimeout 注释（慢站/代理下误杀的真实来源）。
    const effectiveTimeout = timeoutMsOverride && timeoutMsOverride > 0
      ? timeoutMsOverride
      : resolveFrontendToolTimeout(toolName);
    const timer = (interactive || noTimeout)
      ? undefined
      : setTimeout(() => {
          const pending = task.pendingToolCalls.get(callId);
          if (pending) {
            task.pendingToolCalls.delete(callId);
            logger.warn(`[llm-task] 前端工具执行超时(${Math.round(effectiveTimeout / 1000)}s): ${toolName} callId=${callId} conv=${task.conversationId}（前端刷新/断连时常见，任务将以此错误继续）`);
            // 超时**可见**（2026-10-09）：广播一条事件，前端据此把该工具条标为"超时未回执"，
            // 而不是让界面只是"停住不动"（与真卡死难以区分）。前端对未知事件类型容忍。
            try { emit(task, { type: 'tool:timeout', callId, toolName, conversationId: task.conversationId, timeoutMs: effectiveTimeout }); } catch { /* 观测事件失败不影响超时处理 */ }
            pending.reject(new Error(`工具 ${toolName} 执行超时`));
          }
        }, effectiveTimeout);
    task.pendingToolCalls.set(callId, { resolve, reject, toolName, callId, requestedAt: Date.now(), timer, args });
    syncPendingToolsJson(task);
    // 通知前端执行工具。
    // conversationId 必须随事件下发：多会话并行时前端要据此把工具路由到「发起它的那个会话」
    // 的执行面（浏览器 tab / 工作目录等），否则会打到用户当前正在看的会话上，造成跨会话串数据。
    emit(task, { type: 'tool:execute', callId, toolName, args, toolCallId, depth, conversationId: task.conversationId });
  });
}

/**
 * 工作流型子智能体：后台启动一次 DAG，立即返回回执，完成后把结果反写回对话。
 *
 * 为什么不同步等：一条流水线可能跑几分钟，同步 await 会把主智能体的 ReAct 循环挂死，
 * 用户在这期间什么都做不了。异步化后 call_agent 立刻返回，流水线在后台跑完再回调，
 * 这才是长任务该有的形态（与 startWorkflowRun 的落库 + SSE 机制天然契合）。
 */
async function runWorkflowSubAgent(
  task: LlmTask,
  agent: any,
  args: { agentId?: string; input?: unknown; platformId?: string; modelId?: string },
  parentToolCallId: string,
  depth: number,
): Promise<string> {
  const resolvedId = String(agent.id || '');
  const subAgentName = agent.name || resolvedId;

  const fields = extractWorkflowInputFields(agent);
  const mapped = mapWorkflowInputs(args.input, fields);
  if (!mapped.ok) return mapped.error;

  // 模型回退上下文：工作流 llm 节点未配置模型时用它兜底（见 ServerLlmNodeHandler）
  const inputs: Record<string, unknown> = { ...mapped.inputs };
  const platformId = args.platformId || agent.platform_id || task.platformId;
  const modelId = args.modelId || agent.model_id || task.modelId;
  if (platformId) inputs.__platformId = platformId;
  if (modelId) inputs.__modelId = modelId;

  const bundle = resolveBundleFromDb(resolvedId);
  if (!bundle) return `[工作流启动失败] 工作流智能体不存在: ${resolvedId}`;

  // 后台执行：startWorkflowRun 内部就是 fire-and-forget，落 workflow_run 表 + 发 SSE。
  // 绝不能 await —— 否则整轮对话会被一条流水线挂死。
  const runId = startWorkflowRun(bundle, inputs, task.userId);

  emit(task, { type: 'sub_agent:start', agentId: resolvedId, agentName: subAgentName, parentToolCallId, depth: depth + 1, runId });

  watchWorkflowRun(runId, {
    conversationId: task.conversationId,
    userId: task.userId,
    taskId: task.id,
    agentId: resolvedId,
    agentName: subAgentName,
    parentToolCallId,
  });

  return buildWorkflowReceipt(subAgentName, runId);
}

/** 订阅一次运行，终态时把产物反写回对话。 */
function watchWorkflowRun(runId: string, ctx: WorkflowDeliveryCtx): void {
  const unsub = subscribeWorkflowRun(runId, 0, (ev) => {
    if (ev.type !== 'run:completed' && ev.type !== 'run:failed') return;
    unsub();
    const failedMsg = ev.type === 'run:failed' ? (ev.msg || '未知错误') : undefined;
    void deliverWorkflowResult(runId, ctx, failedMsg);
  });
}

/** 反写调度：失败要可见（产物跑出来了却没进对话，用户会以为没执行）。 */
async function deliverWorkflowResult(runId: string, ctx: WorkflowDeliveryCtx, failedMsg?: string): Promise<void> {
  try {
    // 用一个「永不中止」的 signal，只为套超时：反写不该被任务中止波及 ——
    // 流水线已经跑完了，结果值得留下。
    await withAbortAndTimeout(
      writeBackWorkflow(runId, ctx, failedMsg),
      new AbortController().signal,
      WORKFLOW_DELIVERY_TIMEOUT_MS,
    );
    // 成功才清除待投递标记；失败保留，重启后由 resumeWorkflowDeliveries 重试
    markWorkflowDelivered(runId);
  } catch (e: any) {
    logger.warn('[workflow] 结果反写失败（保留待重启补投）:', e?.message || e);
  }
}

/** 文字 → 直接输出成消息；文件 → 落盘 + 登记交付物 + 输出引用。 */
export async function writeBackWorkflow(runId: string, ctx: WorkflowDeliveryCtx, failedMsg?: string): Promise<void> {
  if (failedMsg) {
    pushConversationMessage(ctx, `[工作流执行失败] ${failedMsg}`, 'assistant');
    return;
  }
  const output = loadWorkflowOutput(runId);
  for (const item of classifyWorkflowOutput(output)) {
    if (item.kind === 'text') pushConversationMessage(ctx, item.text, 'assistant');
    else await deliverWorkflowFile(ctx, item);
  }
}

/** 运行产物：优先内存（本进程内跑完的），回落 DB（重启后补投的场景）。 */
function loadWorkflowOutput(runId: string): Record<string, unknown> {
  const run = getWorkflowRun(runId);
  if (run?.result) return run.result as Record<string, unknown>;
  try {
    const row = db.prepare('SELECT result_json FROM workflow_run WHERE id = ?').get(runId) as any;
    if (row?.result_json) return JSON.parse(row.result_json);
  } catch { /* 解析失败按空产物处理，反写时会给明确提示 */ }
  return {};
}

/**
 * 服务启动补偿：上次进程遗留的待反写运行统一补投。
 * 必须在 markOrphanWorkflowRunsInterrupted() 之后调用 —— running 先被标 failed，这里才有失败可写；
 * 跑完但没来得及反写的（completed + delivery_json 非空）则按成功补投。
 */
export function resumeWorkflowDeliveries(): number {
  let scheduled = 0;
  try {
    for (const r of loadPendingWorkflowDeliveries()) {
      let ctx: WorkflowDeliveryCtx;
      try { ctx = JSON.parse(r.delivery_json); } catch { markWorkflowDelivered(r.id); continue; }
      const failedMsg = r.status === 'completed' ? undefined : (r.error || '服务重启导致运行中断');
      void deliverWorkflowResult(r.id, ctx, failedMsg);
      scheduled++;
    }
    if (scheduled > 0) logger.info(`[workflow] 已调度 ${scheduled} 条遗留工作流结果的补投`);
  } catch (e: any) {
    logger.warn('[workflow] 补投调度失败:', e?.message || e);
  }
  return scheduled;
}

async function deliverWorkflowFile(ctx: WorkflowDeliveryCtx, item: { name: string; path?: string; content?: string; encoding?: 'utf8' | 'base64' }): Promise<void> {
  let filePath = item.path || '';
  // 只有内容没有路径 → 写进会话交付目录（产物必须是真实文件，不能只躺在消息里）
  if (!filePath && item.content) {
    const { dir } = resolveArtifactDirFor({ conversationId: ctx.conversationId, category: 'deliverable' });
    await fsp.mkdir(dir, { recursive: true });
    filePath = `${dir}/${item.name}`;
    await fsp.writeFile(filePath, item.content, item.encoding === 'base64' ? 'base64' : 'utf8');
  }
  if (!filePath) return;

  let size = 0;
  try { size = (await fsp.stat(filePath)).size; } catch { /* 取不到就留 0 */ }

  const msgId = pushConversationMessage(ctx, `[工作流交付文件] ${item.name}\n路径：${filePath}`, 'assistant');
  try {
    const cfId = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    db.prepare('INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(cfId, ctx.conversationId, ctx.userId, null, item.name, filePath, 'deliverable', guessMime(item.name), size, 'agent', msgId, Date.now());
    notifyConversation(ctx, { type: 'file:registered', conversationId: ctx.conversationId });
    // ★ 工件采集（2026-10-08）：工作流型子智能体的交付文件也走这里登记，但**不经**
    //   artifact-hooks.registerFile 单点（本身直接 INSERT），故显式采一次 ——
    //   否则它作为计划项执行时产物不进工件清单，下游 {{artifact}} 引用解析不到。
    //   无采集作用域（普通工作流调用）时 collectArtifact 为空操作。
    collectArtifact({ id: cfId, path: filePath, name: item.name, category: 'deliverable', size });
  } catch (e: any) {
    // 落盘已成功，这里只丢登记：不能静默，打印出来便于定位
    logger.warn('[workflow] 交付文件登记失败:', e?.message || e);
  }
}


/** 往会话里写一条消息：先落库（保证刷新可见），再推给在线订阅方。 */
function pushConversationMessage(ctx: WorkflowDeliveryCtx, content: string, role: string): string {
  const extra = {
    parentToolCallId: ctx.parentToolCallId,
    subAgentId: ctx.agentId,
    subAgentName: ctx.agentName,
    subAgentDepth: 1,
  };
  const msgId = insertMessage(ctx.conversationId, ctx.userId, role, content, extra);
  notifyConversation(ctx, {
    type: 'message:added',
    message: { id: msgId, role, content, ...extra },
  });
  return msgId;
}

/** 通知会话：任务还活着就复用任务 SSE（前端已在订阅）；任务已结束则走会话级总线。 */
function notifyConversation(ctx: WorkflowDeliveryCtx, event: SSEEvent): void {
  const task = getTask(ctx.taskId);
  if (task && task.status === 'running') { emit(task, event); return; }
  emitConversation(ctx.conversationId, event);
}

/**
 * ★★★ `spawn_subagent` 的后端实现：**运行时现场生成**专项子智能体。
 *
 * 对齐 AOrchestra (ICML 2026) 的核心抽象 Φ = (Instruction, Context, Tools, Model)：
 * 主智能体发现"手头没有合适的执行者"时，**现场填四元组**造一个临时子智能体，
 * 让它带着**刚好够用**的指令/上下文/工具/模型去执行，返回结论后即完成使命。
 *
 * ═══ 与 call_agent 的分工 ═══
 *  · `call_agent(agentId)` —— 调用**已存在**的静态角色（预设的 pageAgent 等）
 *  · `spawn_subagent(spec)` —— 现场**定制**一个，库里不留痕，用完即弃
 *
 * ═══ 三道安全闸（缺一即等于把权限体系开了口子）═══
 * ① **不得提权**：T 必须是父智能体当前可用工具的子集（`resolveSpecTools` 里过 parentToolIds）
 * ② **黑名单**：不给派生/定义类工具（防递归自增殖 + 防自我提权），见 SPEC_TOOL_BLACKLIST
 * ③ **预算闸**：单任务内最多 DEFAULT_MAX_SPAWN_PER_TASK 次（防"打不过就再叫一个"）
 *
 * 执行上**复用** runSubAgent 的同一条 ReAct 循环（合成虚拟 agent 行注入），
 * 不另起执行器 —— 否则消息归属、深度限制、上下文隔离这些语义必然漂移。
 */
async function runSpawnedSubAgent(
  task: LlmTask,
  args: any,
  parentToolCallId: string,
  depth: number,
  uiTools: Set<string>,
): Promise<string> {
  // ── ③ 预算闸 ──
  const budget = typeof task.spawnBudget === 'number' ? task.spawnBudget : DEFAULT_MAX_SPAWN_PER_TASK;
  const used = task.spawnCount || 0;
  const gate = checkSpawnBudget(used, budget);
  if (!gate.allowed) return gate.reason;

  // ── 四元组归一化（I 必填且要够具体，否则子智能体两眼一抹黑）──
  const normalized = normalizeSubAgentSpec((args || {}) as Partial<SubAgentSpec>);
  if ('error' in normalized) return `${normalized.error}\n\n示例：{"instruction":"抓取 A/B/C 三个页面的报价并整理成三列表格","context":"目标 URL：...；我们关心字段：单价/起订量/交期","tools":["browser_*","file_read"],"deliverable":"markdown 三列表格，含页面出处"}`;

  // ── ① 工具裁剪：父级可用工具为全集，模型只能"少要" ──
  const parentToolIds = collectParentToolIds(task, uiTools);
  // ★ fail-safe（2026-09-27 拍板）：档位缺失必须落 readonly，落 default = 查不到就放行写权限
  const permissionMode = task.permissionMode || 'readonly';
  const { pinned, dropped } = resolveSpecTools({
    requested: normalized.tools || [],
    excluded: normalized.toolExclude,
    parentToolIds,
    isAllowed: (n) => checkToolPermission(permissionMode, n),
  });

  if (pinned.length === 0 && (normalized.tools || []).length > 0) {
    // 要了工具但一个都没批下来 —— 大概率是提权尝试或名字写错，明确回显而不是静默变纯推理
    const why = dropped.map((d) => `  · ${d.name}：${d.reason}`).join('\n');
    return `你请求的工具全部不可用，子智能体未创建。原因：\n${why}\n请改为父智能体已挂载的工具，或不要 tools（纯推理/整理），或用 call_agent 调用已有子智能体。`;
  }

  // ── M：模型解析（子任务可选轻量模型省钱；缺省沿用父任务）──
  const platformId = normalized.platformId || task.platformId;
  const modelId = normalized.modelId || task.modelId;

  // ── 组装四元组 → 虚拟 agent 配置 ──
  const resolved: ResolvedSubAgentSpec = {
    spec: normalized,
    pinnedToolIds: pinned,
    dropped,
    platformId,
    modelId,
    maxSteps: normalized.maxSteps || DEFAULT_SPEC_MAX_STEPS,
  };
  const systemPrompt = renderSpecSystemPrompt(resolved);
  const synthId = `spawn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const synthName = normalized.purpose?.slice(0, 20) || '临时子智能体';

  // 预算与留痕（用户要能在对话里看到"它开了个子智能体"以及为什么）
  task.spawnCount = used + 1;
  // 同类子任务反复现场生成 → 提示固化成正式子智能体（只建议，不自动建）
  const fp = specFingerprint(normalized.instruction);
  const fpCount = (task.specFingerprints?.get(fp) || 0) + 1;
  task.specFingerprints?.set(fp, fpCount);
  const suggestPersist = shouldSuggestPersist(fpCount - 1);
  emit(task, {
    type: 'sub_agent:spawn', specId: synthId, name: synthName,
    purpose: normalized.purpose || '', toolIds: pinned,
    dropped: dropped.map((d) => d.name), count: task.spawnCount, budget,
    suggestPersist,
  });
  void recordSpawnedSubAgent(task, synthId, resolved);

  const input = [
    normalized.instruction,
    normalized.context ? `\n\n【上下文】\n${normalized.context}` : '',
    normalized.deliverable ? `\n\n【期望产出】\n${normalized.deliverable}` : '',
  ].join('');

  const result = await runSubAgent(
    task,
    { agentId: synthId, input, platformId, modelId },
    parentToolCallId,
    depth,
    uiTools,
    {
      agentId: synthId,
      agentName: synthName,
      systemPrompt,
      toolIds: pinned,
      platformId,
      modelId,
      maxSteps: resolved.maxSteps,
    },
  );

  const tail = dropped.length
    ? `\n\n（注：以下工具按安全策略未开放 —— ${dropped.map((d) => `${d.name}：${d.reason}`).join('；')}）`
    : '';
  const budgetNote = task.spawnCount >= budget
    ? `\n（本任务现场生成子智能体已达上限 ${budget} 次，后续请自行完成或改用 call_agent）`
    : '';
  // 同类子任务反复现场生成 → 提示模型（并让它转告用户）值得固化
  const persistNote = suggestPersist
    ? `\n\n（提示：这次已是第 ${fpCount} 次生成「${normalized.purpose || normalized.instruction.slice(0, 20)}」这类子智能体。`
      + '如果这类活会经常做，建议固化成正式子智能体（用 api_agent_create 建，配好系统提示词与工具，'
      + '之后用 call_agent 直接点名调用）——可以在结论里向用户提一句。）'
    : '';
  return `${result}${tail}${budgetNote}${persistNote}`;
}

/**
 * 收集"父智能体当前可用的工具全集" —— 这是"不得提权"的判定基准。
 *
 * ★ 口径与 `buildToolsForBackend` 保持一致（那才是模型真正看到的工具面）：
 *   只收**父级实际已挂载**的内置/API 工具，外加一小撮"按需发现"的 API 工具
 *   （模型本来就是通过 get_api_tools 动态拿到它们的，理应能转授给子智能体）。
 *   MCP 挂载不在其中 —— 那些工具的副作用不可判定，不该被随手转授。
 */
function collectParentToolIds(task: LlmTask, uiTools: Set<string>): string[] {
  const ids = new Set<string>();
  try {
    const convMounts = loadConversationMounts(task.conversationId);
    let agentIds: string[] = [];
    if (task.agentId) {
      const row = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(task.agentId, task.userId) as any;
      try { agentIds = JSON.parse(row?.builtin_tool_ids || '[]'); } catch { agentIds = []; }
    }
    for (const n of [...agentIds, ...convMounts.builtinToolIds]) ids.add(n);
    // UI 工具（无人值守时本就不该给）
    if (!task.includeUiTools) for (const n of UI_TOOL_NAMES) ids.delete(n);
    // 会话级权限：只读会话里，写类工具**不进全集**（否则子智能体就绕开了权限分级）
    // ★ fail-safe：同上，缺失档位按 readonly 裁剪（写类工具不进子智能体全集）
    const mode = task.permissionMode || 'readonly';
    for (const n of [...ids]) if (!checkToolPermission(mode, n).allowed) ids.delete(n);
  } catch { /* 见下：取不到就 fail-closed */ }

  // ★★★ 这里**不能有兜底放行**（我第一版加过，自检时判定为安全缺陷已删除）。
  //
  //   第一版写的是「ids 为空时填入一份通用工具清单（file_write/cmd_exec/...）」，
  //   理由是"避免 DB 抖动导致链路不可用"。但那是 **fail-open**：
  //     · 会话未绑定智能体（agentId 为空）+ 无会话级挂载 → ids 为空 → 兜底生效
  //       → 子智能体凭空拿到 file_write / cmd_exec / python_exec
  //       → **完全绕过"不得提权"这条边界**（父级没有的能力，子级反而有了）。
  //   安全闸的正确方向是 **fail-closed**：拿不到父级能力集，就什么都不转授。
  //   代价是"链路不可用"，但可用性不该以安全边界为代价 —— 何况父级本来没能力时，
  //   子智能体纯推理（不给工具）也是正确行为，不是故障。
  for (const n of INTERACTIVE_TOOLS) ids.delete(n);
  for (const n of UI_TOOL_NAMES) if (!task.includeUiTools) ids.delete(n);
  return [...ids];
}

/**
 * 留痕：把本次现场生成的子智能体记进空间记忆（**轻量、异步、失败不影响任务**）。
 *
 * 为什么值得记：用户事后看到"它自己开了个子智能体"想知道**为什么开、开了什么能力**；
 * 反复出现的同一类 spec 也提示"该把它固化成正式子智能体了"（见 shouldSuggestPersist）。
 */
async function recordSpawnedSubAgent(task: LlmTask, specId: string, resolved: ResolvedSubAgentSpec): Promise<void> {
  try {
    const desc = resolved.spec.purpose || resolved.spec.instruction.slice(0, 40);
    const tools = resolved.pinnedToolIds.length ? resolved.pinnedToolIds.join('、') : '（无工具，纯推理）';
    const line = `- [${new Date().toLocaleString('zh-CN')}] 现场生成子智能体「${desc}」（${specId}）：开放工具 ${tools}；模型 ${resolved.modelId || resolved.platformId || '继承父级'}`;
    const { resolveConversationSpaceId, appendSpaceMemory } = await import('./services/space-memory.js');
    const spaceId = resolveConversationSpaceId(task.conversationId);
    if (spaceId) await appendSpaceMemory(task.userId, spaceId, line);
  } catch { /* 留痕失败不影响子智能体执行 */ }
}

/** call_agent 后端执行：查 DB agent 配置，按智能体类型分派。
 *  - workflow 型 → 跑一次 DAG，把 output 节点产物作为工具结果返回；
 *  - 其余（harness 型）→ 递归跑子 ReAct 循环，子智能体消息写入同一会话，
 *    带 parent_tool_call_id/sub_agent_id 归属字段。
 *  两条路共用前奏（参数校验 / 别名解析 / 查 agent 行），调用方 dispatchToolCall 无需感知差异。 */
// ══════════════════════════════════════════════════════════════════════════
// 后台并行子智能体（P2-6，2026-10-04）—— `call_agent` 带 `async: true` 时走这里：
// 立即返回回执，子 ReAct 在后台跑完由 deliverSubAgentResult 投递回会话。
//
// ★ 完成语义刻意对齐工作流子智能体（runWorkflowSubAgent 的 fire-and-forget + 反写）：
//   不发明第三种语义。区别只在"结果怎么回来"——
//   · 主循环**仍在跑** → injectUserMessage 注入通道（落库 + pendingInjects，模型下一轮看到）；
//   · 主循环**已收尾** → 普通消息落库（用户回会话可见，与 writeBackWorkflow 同口径）。
// ★ 主循环**不等待**后台任务（finish 检查处不阻塞）：等待会造成"模型不调工具 → 检测到
//   后台任务 → 续跑 → 又不调工具"的空转烧 token 循环。结果靠注入消息唤醒下一轮。
// ★ 权限/护栏无旁路：后台子任务与同步调用走**同一个 executeTool**，readonly 裁剪、
//   path-guard 弹窗（无人值守 fail-safe）、危险命令护栏、用户钩子全部生效；
//   用户关掉页面后后台子任务的写操作自然落入无人值守拒绝。
// ★ 重启不恢复（方案拍板）：状态在内存，服务重启即丢 —— 落库全状态成本远超收益，
//   用户看到子智能体消息流中断即"丢失"信号；远期可落 llm_task 子任务行（表已有 origin）。
// ══════════════════════════════════════════════════════════════════════════

async function startBackgroundSubAgent(
  task: LlmTask,
  args: Record<string, unknown>,
  toolCallId: string,
  depth: number,
  uiTools: Set<string>,
): Promise<string> {
  const agentId = String((args as any).agentId || (args as any).agent_id || (args as any).id || '').trim();
  const rawInput = (args as any).input || (args as any).sub_task || (args as any).task || (args as any).query;
  const input = typeof rawInput === 'string' ? rawInput : rawInput ? JSON.stringify(rawInput) : '';
  // 前置校验与 runSubAgent 同文案：回执必须诚实 —— 缺参不启动，否则"已启动"是骗人的
  if (!agentId) return 'agentId 为必填项。请先调用 list_sub_agents 工具查看可用子智能体及其 ID，然后在 call_agent 的 arguments 中传入 agentId（如 "a_builtin_page_agent"）和 input（任务描述）参数。';
  if (!input) return 'input 为必填项。请在 call_agent 的 arguments 中传入 input 参数（描述要让子智能体执行的任务）。';

  // 工作流型子智能体**本来就是** fire-and-forget（跑完反写对话）——直接走原路径。
  // 若在这里再包一层，会出现双重投递（runWorkflowSubAgent 的反写 + 本函数的投递）。
  const agentRow = db.prepare('SELECT id, name, type, workflow_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, task.userId) as any;
  if (agentRow && isWorkflowAgent(agentRow)) {
    return runSubAgent(task, args, toolCallId, depth, uiTools);
  }

  if (!canStartBackgroundSubAgent(task.backgroundSubAgents)) {
    return buildConcurrencyFullMessage(task.backgroundSubAgents);
  }

  const bgId = makeBackgroundId();
  const agentName = agentRow?.name || agentId;
  task.backgroundSubAgents.set(bgId, { bgId, agentId, agentName, toolCallId, startedAt: Date.now() });
  logger.warn(`[bg-subagent] 启动 conv=${task.conversationId} bg=${bgId} agent=${agentId}（在跑 ${task.backgroundSubAgents.size} 个）`);

  void (async () => {
    let result: string;
    try {
      result = await runSubAgent(task, args, toolCallId, depth, uiTools);
    } catch (e: any) {
      result = isAbortError(e)
        ? '[已中止] 后台子智能体随任务中止。'
        : `后台子智能体执行异常：${e?.message || e}`;
    } finally {
      task.backgroundSubAgents.delete(bgId);
      logger.warn(`[bg-subagent] 结束 conv=${task.conversationId} bg=${bgId} agent=${agentId}`);
      // ★ 唤醒「收尾时就地等待」的主循环（2026-10-09）：它醒来会复检是否还有人跑。
      try { task.backgroundDrainWaiter?.(); } catch {}
    }
    await deliverSubAgentResult(task, agentName, result);
  })();

  return buildBackgroundReceipt(agentName, bgId);
}

/**
 * 后台子智能体结果投递。
 *
 * ★ 2026-10-09 改为「唤醒优先」：主 task 仍在跑时把结果推进 `pendingBackgroundResults`
 *   —— 若主循环正挂在收尾等待点（waitForBackgroundSubAgents），`backgroundDrainWaiter`
 *   已把它叫醒；醒来后会把结果作为 user 消息灌进下一轮并 continue，由主智能体整合。
 *   任务已终态（aborted/completed）时才落库成普通消息（此时无人唤醒，SSE 也大概率不在）。
 */
async function deliverSubAgentResult(task: LlmTask, agentName: string, result: string): Promise<void> {
  if (task.abortController.signal.aborted) return; // 整体中止：不投递，避免噪音
  const text = buildDeliveryText(agentName, capToolResult(result));
  // 主任务仍在跑（含"挂在收尾等待点"）：入队等主循环消费 —— 这条路径保住前端订阅与工具通道
  if (task.status === 'running') {
    task.pendingBackgroundResults.push({ agentName, text });
    try { task.backgroundDrainWaiter?.(); } catch {}
    return;
  }
  // 主任务已终态：落库普通消息（用户刷新可见；无在线订阅者，SSE 推不到也没关系）
  try {
    if (injectUserMessage(task.conversationId, text, task.userId).status === 'injected') return;
    const msgId = insertMessage(task.conversationId, task.userId, 'assistant', text);
    emit(task, { type: 'message:added', message: { id: msgId, role: 'assistant', content: text } });
  } catch (e: any) {
    logger.warn('[bg-subagent] 结果投递失败:', e?.message || e);
  }
}

/** PlanRunner 依赖注入（避免 plan-runner ↔ llm-task-manager 循环 import）：
 *  执行体复用 runSubAgent（包装版 —— 工件协议生效）。计划结果由 runPlanToCompletion
 *  同步返回给 plan_tasks / reassign_task 的调用点，**不再走后台投递**。 */
registerPlanRunnerDeps({
  runSubAgent: (task, args, parentToolCallId, depth, uiTools, specOverride, runOpts) =>
    runSubAgent(task, args, parentToolCallId, depth, uiTools, specOverride, runOpts),
  // 计划状态 → 前端「运行指示行」（2026-10-08）：
  //   ① 落 conversation.task_plan_json（刷新/重连后消息流能从历史恢复出计划）；
  //   ② 发 plan:updated —— 前端把它当 task_plan 应用进 plansByConv（**零新增 UI**，
  //      复用输入区上方运行指示行的步骤详情与进度条）。
  onPlanChange: (task, _planId, plan) => {
    try { savePlanJson(task.conversationId, plan as any); } catch { /* 落库失败不阻断 */ }
    emit(task, { type: 'plan:updated', plan });
  },
});

/**
 * runSubAgent（工件协议包装，2026-10-08）：真正执行在 runSubAgentImpl。
 * 包装做两件事：
 *   ① 开启工件采集器作用域 —— 期间所有经 artifact-hooks 登记的产物被收集；
 *   ② 有产物时把返回值改写为「短结论 + 工件清单」，全文不回流主上下文。
 * ★ 嵌套安全：PlanRunner 包住本函数时，采集器复用外层 store（见 runWithArtifactCollector）。
 */
async function runSubAgent(
  task: LlmTask,
  args: { agentId?: string; input?: unknown; platformId?: string; modelId?: string },
  parentToolCallId: string,
  depth: number,
  uiTools: Set<string>,
  specOverride?: {
    agentId: string;
    agentName: string;
    systemPrompt: string;
    toolIds: string[];
    platformId?: string;
    modelId?: string;
    maxSteps?: number;
  },
  runOpts?: { maxSteps?: number },
): Promise<string> {
  const { result, artifacts } = await runWithArtifactCollector(() =>
    runSubAgentImpl(task, args, parentToolCallId, depth, uiTools, specOverride, runOpts));
  const withArtifacts = artifacts.length > 0 ? formatSubAgentReturn(result, artifacts) : result;
  // ★ 子任务 ID 回执（2026-10-09）：parentToolCallId 天然唯一标识这次委派（子智能体
  //   落库的每条消息都带它）。追加在结果末尾，编排者后续可用 get_sub_task_detail
  //   按 ID 查执行轨迹分析失败原因。一行即止，不撑上下文。
  return `${withArtifacts}\n\n[子任务ID] ${parentToolCallId}（如需分析本任务执行过程，可调用 get_sub_task_detail 传入此 ID 查询）`;
}

async function runSubAgentImpl(
  task: LlmTask,
  args: { agentId?: string; input?: unknown; platformId?: string; modelId?: string },
  parentToolCallId: string,
  depth: number,
  uiTools: Set<string>,
  specOverride?: {
    agentId: string;
    agentName: string;
    systemPrompt: string;
    toolIds: string[];
    platformId?: string;
    modelId?: string;
    maxSteps?: number;
  },
  runOpts?: { maxSteps?: number },
): Promise<string> {
  const agentId = args.agentId || (args as any).agent_id || (args as any).id;
  // input 允许是对象（多入参工作流的推荐用法）；harness 分支一律按文本处理
  const rawInput = args.input || (args as any).sub_task || (args as any).task || (args as any).query;
  const input = typeof rawInput === 'string' ? rawInput : rawInput ? JSON.stringify(rawInput) : '';
  if (!agentId) return 'agentId 为必填项。请先调用 list_sub_agents 工具查看可用子智能体及其 ID，然后在 call_agent 的 arguments 中传入 agentId（如 "a_builtin_page_agent"）和 input（任务描述）参数。';
  if (!input) return 'input 为必填项。请在 call_agent 的 arguments 中传入 input 参数（描述要让子智能体执行的任务），例如 {"agentId":"a_builtin_page_agent","input":"打开网站并执行操作"}';
  if (depth >= 1) return '子智能体不能再调用子智能体（深度仅允许 1 层）';

  // 别名兜底
  const SUBAGENT_ALIASES: Record<string, string> = {
    pageAgent: 'a_builtin_page_agent',
    page_agent: 'a_builtin_page_agent',
    pageagent: 'a_builtin_page_agent',
  };
  const resolvedId = SUBAGENT_ALIASES[agentId] || agentId;

  // ★★★ 运行时生成的临时子智能体：它在 agent 表里**没有行**。
  //   做法是**合成一份「虚拟 agent 配置」**，后续走**完全同一条** ReAct 循环
  //   （消息归属、上下文隔离、工具执行、深度限制、最大步数收尾全部复用）。
  //   为什么不合另起一套执行器：本项目已因"同一件事多个入口各写一遍"漂移过 5 次
  //   （见 memory 里 P1-4 的入口漂移事故），能复用就绝不复刻。
  const specRow = specOverride
    ? {
        id: specOverride.agentId,
        name: specOverride.agentName,
        system_prompt: specOverride.systemPrompt,
        builtin_tool_ids: JSON.stringify(specOverride.toolIds),
        platform_id: specOverride.platformId || null,
        model_id: specOverride.modelId || null,
        type: 'harness',
        config_json: specOverride.maxSteps ? JSON.stringify({ maxReActSteps: specOverride.maxSteps }) : null,
      }
    : null;

  // 查 DB agent 配置
  const agent = specRow
    || (db.prepare('SELECT * FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(resolvedId, task.userId) as any);
  if (!agent) return `子智能体不存在: ${agentId}（可调用 list_sub_agents 工具查询可用子智能体及其 ID）`;

  // 按智能体类型分派：工作流型跑 DAG，其余走 ReAct。
  // 必须在这里分（在解析平台/模型之前）—— 工作流没有 system_prompt / builtin_tool_ids，
  // 走 ReAct 会退化成「你是一个智能助手」+ 零工具，返回一段无关空谈且完全不报错。
  if (isWorkflowAgent(agent)) {
    return runWorkflowSubAgent(task, agent, args, parentToolCallId, depth);
  }

  // 解析平台/模型：调用方指定 > 子智能体配置 > 父任务（主智能体当前模型）
  const platformId = args.platformId || (agent.platform_id || task.platformId);
  const modelId = args.modelId || (agent.model_id || task.modelId);
  let platform = loadPlatform(platformId, task.userId);
  let model = loadModel(modelId, task.userId, platformId);
  if (!platform && modelId) {
    // 仅指定了 modelId 而未指定 platformId，或 platformId 无效：尝试按 model 反查平台
    // ★ 这里也必须走 findModelRow（两种标识都认）：子智能体配置里存的可能是业务名，
    //   裸查主键会查不到 → 平台反查失败 → 整个子智能体调用报「模型不存在」。
    const mRow = findModelRow(db, modelId, task.userId);
    if (mRow) {
      platform = loadPlatform(mRow.platform_id, task.userId);
      model = loadModel(mRow.id, task.userId, mRow.platform_id);
    }
  }
  if (!platform || !model) {
    if (args.platformId || args.modelId) {
      return `指定的子智能体模型不可用（platformId=${args.platformId || '-'}, modelId=${args.modelId || '-'}）。请先调用 list_models 工具查询可用平台与模型。`;
    }
    return '子智能体未配置平台/模型，无法执行';
  }
  // 智能体显式点名的模型必须是「可见」的：用户把模型/平台设为不可见后，list_models 已不再返回它，
  // 这里再兜一道，防止模型凭上下文记忆硬点一个已隐藏的模型。
  // 子智能体自身配置的模型（agent.model_id）不受此限 —— 那是用户在智能体配置里显式选过的。
  if (args.modelId) {
    const vis = db.prepare(
      'SELECT m.visible, p.llm_enabled FROM model m JOIN platform p ON p.id = m.platform_id WHERE m.id = ?',
    ).get(model.id) as any;
    if (vis && (Number(vis.visible) === 0 || Number(vis.llm_enabled) === 0)) {
      return `指定的模型已被设为不可见（modelId=${model.id}），不能动态调用。请调用 list_models 重新选择可用模型。`;
    }
  }

  // 构建子智能体工具列表
  const registry = getToolRegistry();
  const builtinIds: string[] = (() => { try { return JSON.parse(agent.builtin_tool_ids || '[]'); } catch { return []; } })();
  const subTools: any[] = [];
  const seen = new Set<string>();
  for (const name of builtinIds) {
    if (seen.has(name)) continue;
    // 子智能体不能再派生（深度仅 1 层）：排除委派类工具。
    // ★ spawn_subagent 必须一起排除 —— 它已挂在内置智能体的清单里（office/task-mode/db），
    //   而那些智能体也可能被 call_agent 当成子智能体调用：不排除的话工具会**暴露给子智能体**。
    //   运行时虽有 `depth >= 1` 兜底拒绝，但"先暴露再拒绝"会白烧 token、还会诱导模型反复尝试。
    if (name === 'call_agent' || name === 'list_sub_agents' || name === 'spawn_subagent') continue;
    // 子任务详情查询（2026-10-09）：只读但属编排者专属——子智能体查兄弟任务的轨迹
    // 没有意义且会污染自己的上下文，从子工具面摘掉。
    if (name === 'get_sub_task_detail') continue;
    // 编排类（plan_tasks / reassign_task / get_plan_status）同属委派族：子智能体不再做规划
    //（executeTool 的 depth>=1 已运行时拦截，这里提前从工具面摘掉，避免"先暴露再拒绝"白烧 token）
    if (name === 'plan_tasks' || name === 'reassign_task' || name === 'get_plan_status') continue;
    seen.add(name);
    // 内置工具
    if (registry.has(name)) {
      const def = registry.get(name)!;
      subTools.push({ type: 'function', function: { name, description: def.description, parameters: def.inputSchema } });
      continue;
    }
    // API 工具（api_memory_search / api_media_fetch / media_compose 等）
    // ★ 用 isApiExecutableTool：media_compose / media_install_ffmpeg 不带 api_ 前缀，
    //   只判前缀会让子智能体与工作流**看不到**这两个工具（拿不到 = 拼不了成片）。
    if (isApiExecutableTool(name)) {
      for (const tools of getApiToolRegistry().values()) {
        const def = tools.find(t => t.name === name);
        if (def) {
          subTools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
          break;
        }
      }
    }
  }

  // 记忆四件套：未挂载专属 api_* 工具链的智能体默认可用。
  // 与 buildToolsForBackend 的「挂载优先」口径一致：挂了专属 api_* 工具（数据查询链）的
  // 只用它挂载的，避免记忆类工具分走去取数链的注意力。
  const hasOwnApiTools = builtinIds.some((n) => n.startsWith('api_'));
  const SUB_ALWAYS_API_TOOLS = hasOwnApiTools
    ? []
    : ['api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete'];
  const apiRegistrySub = getApiToolRegistry();
  for (const tName of SUB_ALWAYS_API_TOOLS) {
    if (seen.has(tName)) continue;
    for (const apiTools of apiRegistrySub.values()) {
      const def = apiTools.find(t => t.name === tName);
      if (def) {
        seen.add(tName);
        subTools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
        break;
      }
    }
  }

  const subAgentName = agent.name || resolvedId;
  // 子智能体归属字段（P1 收敛）：工具消息/事件统一从这里取，替代各处手写四连字段
  const subOwnership: SubAgentOwnership = {
    parentToolCallId,
    subAgentId: resolvedId,
    subAgentName,
    subAgentDepth: depth + 1,
  };
  const client = new LlmClient(platform, model);
  // 子智能体步数上限：尊重 agent 配置的 maxReActSteps（如 pageAgent 的 50），
  // 未配置时兜底 500（2026-10-05 用户拍板：长任务靠上下文压缩承载，不靠截断；
  // 旧兜底 100 频繁触发「已达到最大循环数」）。修复：旧写法 Math.max(x, 100) 把任何配置值强制抬到 ≥100，
  // pageAgent 配置 25 步失效，子智能体陷入循环时跑满 100 步，用户只能手动终止 —— 配置值仍原样尊重，不强制抬高。
  const cfgSteps = (() => { try { return agent.config_json ? JSON.parse(agent.config_json).maxReActSteps : undefined; } catch { return undefined; } })();
  // runOpts.maxSteps（2026-10-08）：PlanRunner 按计划项指定步数预算（如抓取类限 10），
  // 优先于 agent 配置 —— 编排者对单任务的成本约束应压过角色默认值。
  const maxSteps = typeof runOpts?.maxSteps === 'number' && runOpts.maxSteps > 0
    ? Math.min(Math.floor(runOpts.maxSteps), 1000)
    : typeof cfgSteps === 'number' && cfgSteps > 0 ? Math.min(Math.floor(cfgSteps), 1000) : 1000;
  const systemPrompt = agent.system_prompt || '你是一个智能助手。';
  const modelCaps = model.capabilities as string[] | undefined;
  const supportsTools = modelSupportsTools(modelCaps);
  const tools = supportsTools ? subTools : [];

  emit(task, { type: 'sub_agent:start', agentId: resolvedId, agentName: subAgentName, parentToolCallId, depth: depth + 1 });

  // 插入子智能体用户消息
  const userMsgId = insertMessage(task.conversationId, task.userId, 'user', input, {
    parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
  });
  emit(task, { type: 'message:added', message: { id: userMsgId, role: 'user', content: input, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });

  // ★★★ P1-1 子智能体自动接力（2026-09-29）：
  //   此前子智能体达 maxSteps 只做一次总结就返回 —— 对**委派型**智能体是致命的：
  //   开发模式「代码编写助手」把重活全派给 7 个子智能体，子智能体 30~40 步被截断 →
  //   父智能体拿到半成品 → 用户看到"跑完了但没做完"。
  //   ★ 主循环虽有自动接力，但 `call_agent` 是**阻塞**的，父级接力救不了子级
  //     （父级只在子级**返回之后**才走它的接力决策）—— 必须子级自己分批跑完。
  //   轮次取**小值**（默认 1，即最多再跑 1 批）：子智能体既不该半途而废，也不该无限占父预算。
  const subAutoRounds = (() => {
    try {
      const cfg = agent.config_json ? JSON.parse(agent.config_json) : {};
      return typeof cfg?.autoContinueMaxRounds === 'number' && cfg.autoContinueMaxRounds >= 0
        ? cfg.autoContinueMaxRounds
        : 1;
    } catch { return 1; }
  })();
  // 单批步数预算（接力时重置为 maxSteps）
  let subStepBudget = maxSteps;
  // ★ D（2026-10-07）：子智能体自身预算（token/墙钟）—— 此前只有主循环有，子智能体跑几百步无人管。
  //   预算从子智能体 agent.config_json 解析（resolveTaskBudgets，可与父任务独立配置），失败回落默认。
  const subBudgets = (() => {
    try { return resolveTaskBudgets(agent.config_json ? JSON.parse(agent.config_json) : undefined); }
    catch { return resolveTaskBudgets(undefined); }
  })();
  let subTokensTotal = 0;
  let subBudgetHit: { kind: 'tokens' | 'wallclock'; used: number; limit: number } | null = null;
  const subStartedAt = Date.now();
  // 「只写了工具名、没写参数体」的工具（见 parseTextModeToolCalls 空参防护）
  let skippedArgToolsSub: string[] = [];

  try {
    // ★ 外层 = 子智能体接力批次；内层 = 单批 ReAct 步数（与主循环同构）
    for (let subBatch = 0; subBatch <= subAutoRounds; subBatch++) {
    for (let step = 0; step < subStepBudget; step++) {
      if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await waitIfPaused(task); // 子智能体循环同样尊重任务级暂停（pageAgent 常由 call_agent 委派）

      // ── 上下文组装：与主循环**同一个出口** buildContextView（2026-10-02）────────
      //  此前这里是第二份「loadSubAgentMessages + 判超限 + compress」实现 —— 与主循环
      //  各写一遍必然漂移（本项目经典坑）。收敛后行为差异只在入参：
      //   · rawMessages 只含该子智能体的消息（已按 parent_tool_call_id 过滤）；
      //   · persist:false —— 子智能体的摘要**不写 message_summary 表**，
      //     否则主循环读该会话的"最新摘要"会读到子智能体的，直接把主上下文带偏。
      const subCache = (task.subSummaryCaches ||= new Map()).get(parentToolCallId)
        || (() => { const c = { ids: [] as string[], summary: '' }; (task.subSummaryCaches!).set(parentToolCallId, c); return c; })();
      const subView = await buildContextView({
        conversationId: task.conversationId,
        userId: task.userId,
        rawMessages: loadSubAgentMessages(task.conversationId, parentToolCallId)
          .filter(m => m.content || m.toolCalls || m.role === 'tool' || (m as any).reasoningContent),
        model,
        maxTokens: agent.max_tokens,
        keepRecent: 6,
        keepFirst: 2,
        summaryCache: subCache,
        setSummaryModel: (cw) => cw.setSummaryModel(platform, model),
        persist: false,
      });
      const messagesToSend = subView.messages;

      const llmMessages: Message[] = [];
      llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
      llmMessages.push(...messagesToSend.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      })));

      // ★★★ C1（2026-10-09）：子智能体循环同样要能"看到图" ——
      //   pageAgent/子智能体常是产出截图的那一方，若只有主循环注入，
      //   "委派子智能体看图"这条最自然的用法反而不成立（子智能体看不到自己截的图）。
      await attachImagesToMessages(llmMessages);

      // 文本模式工具调用
      const hasToolsToExpose = subTools.length > 0;
      if (tools.length === 0 && hasToolsToExpose) {
        const toolList = subTools.map((t: any) => {
          const props = t.function.parameters?.properties || {};
          const req = t.function.parameters?.required || [];
          const params = Object.entries(props).map(([k, v]: [string, any]) =>
            `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
          ).join('\n');
          return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
        }).join('\n');
        llmMessages[0].content += `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
      }

      // 快照（与主智能体格式对齐：包含本轮实际发给大模型的完整消息历史，内容超长截断）
      const snap = JSON.stringify({
        step, subAgent: { id: resolvedId, name: subAgentName, depth: depth + 1 },
        timestamp: new Date().toISOString(),
        model: { id: model.modelId || model.id, alias: model.alias, contextWindow: model.contextWindow },
        platform: { id: platform.id, name: platform.name },
        parameters: {
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
          topP: agent.top_p,
          frequencyPenalty: agent.frequency_penalty,
          presencePenalty: agent.presence_penalty,
        },
        systemPrompt,
        tools: subTools.map((t: any) => ({ name: t.function.name, description: t.function.description })),
        // messages 只存 id 引用（同主循环，见 services/context-snapshot.ts 的 O(n²) 说明）
        messages: toSnapshotMessages(llmMessages),
      }, null, 2);

      // 助手占位消息
      const assistantMsgId = insertMessage(task.conversationId, task.userId, 'assistant', '', {
        systemPromptSnapshot: snap, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
      });
      // SSE 不推快照（同主循环：按需拉取即可，见该处注释）
      emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '', parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });

      // 流式请求
      let fullContent = '';
      let fullReasoning = '';
      let usageTokens = 0;
      const toolCallAcc: DeltaToolCall[] = [];

      try {
        for await (const chunk of client.chatStream(llmMessages, {
          tools: tools.length > 0 ? tools : undefined,
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
          topP: agent.top_p,
          frequencyPenalty: agent.frequency_penalty,
          presencePenalty: agent.presence_penalty,
          signal: task.abortController.signal,
        })) {
          if (chunk.usage) {
            usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0);
          }
          if (chunk.delta?.content) {
            fullContent += chunk.delta.content;
            emit(task, { type: 'chunk', content: chunk.delta.content, subAgentId: resolvedId, parentToolCallId });
          }
          if (chunk.delta?.reasoningContent) {
            fullReasoning += chunk.delta.reasoningContent;
            emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent, subAgentId: resolvedId, parentToolCallId });
          }
          if (chunk.delta?.toolCalls) {
            for (const tc of chunk.delta.toolCalls) {
              let idx = tc.index;
              if (idx === undefined) {
                if (tc.id) {
                  const existById = toolCallAcc.findIndex(x => x.id === tc.id);
                  idx = existById >= 0 ? existById : toolCallAcc.length;
                } else if (tc.function?.name) {
                  idx = toolCallAcc.length;
                } else {
                  idx = toolCallAcc.length > 0 ? toolCallAcc.length - 1 : 0;
                }
              }
              if (!toolCallAcc[idx]) {
                toolCallAcc[idx] = { ...tc };
              } else {
                const prev = toolCallAcc[idx];
                toolCallAcc[idx] = {
                  ...prev, ...tc,
                  function: tc.function
                    ? { ...prev.function, ...tc.function, arguments: (prev.function?.arguments || '') + (tc.function!.arguments || '') }
                    : prev.function,
                };
              }
            }
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc], subAgentId: resolvedId, parentToolCallId });
          }
        }
      } catch (e: any) {
        if (isAbortError(e)) throw e;
        // 重试不带 tools
        if (/does not support tools|not support.*tool/i.test(e?.message || '') && tools.length > 0) {
          const sysMsg = llmMessages[0];
          if (sysMsg?.role === 'system' && !(sysMsg.content || '').includes('[TOOL_CALL]')) {
            const toolList = tools.map((t: any) => {
              const props = t.function.parameters?.properties || {};
              const req = t.function.parameters?.required || [];
              const params = Object.entries(props).map(([k, v]: [string, any]) =>
                `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
              ).join('\n');
              return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
            }).join('\n');
            sysMsg.content = (sysMsg.content || '') + `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
          }
          fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
          for await (const chunk of client.chatStream(llmMessages, {
            temperature: agent.temperature, maxTokens: agent.max_tokens,
            signal: task.abortController.signal,
          })) {
            if (chunk.usage) { usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0); }
            if (chunk.delta?.content) { fullContent += chunk.delta.content; emit(task, { type: 'chunk', content: chunk.delta.content, subAgentId: resolvedId, parentToolCallId }); }
            if (chunk.delta?.reasoningContent) { fullReasoning += chunk.delta.reasoningContent; emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent, subAgentId: resolvedId, parentToolCallId }); }
          }
        } else {
          throw e;
        }
      }

      // 文本模式工具调用解析（同时检查 reasoning_content，某些模型把 [TOOL_CALL] 放在推理中）
      // function call 模式可能返回工具名但 arguments 为空，需从 reasoning 中提取完整参数
      // ★ 判据与补救逻辑**与主循环完全对齐**（2026-09-29）：
      //   此前这里是「全部空才处理 + 清空重解析」，主循环修了它没修 → 子智能体仍会带空参进执行。
      //   子智能体是开发模式的主要执行单元，**这条路径不修等于没修**。
      const isEmptyArgSub = (tc: any) => { const a = tc.function?.arguments; return !a || a === '{}' || a === ''; };
      const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.some(isEmptyArgSub);
      if (toolCallAcc.length === 0 || hasEmptyArgs) {
        const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION');
        const hasToolInReasoning = fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION');
        if (hasToolInContent || hasToolInReasoning) {
          const sources: string[] = [];
          if (hasToolInContent) sources.push(fullContent);
          if (hasToolInReasoning && fullReasoning !== fullContent) sources.push(fullReasoning);
          const parsed: { id: string; name: string; arguments: string }[] = [];
          const skipped: string[] = [];
          // ★ 去重键 = 名字 + 参数（只按名字会吃掉"同一工具多次调用"，见主循环处说明）
          const seenKeys = new Set<string>();
          let cleanedOf: string | null = null;
          for (const src of sources) {
            const r = parseTextModeToolCalls(src, subTools);
            if (!cleanedOf && r.cleanedContent !== src) cleanedOf = r.cleanedContent;
            for (const tc of r.toolCalls) {
              const key = `${tc.name}\u0000${tc.arguments}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);
              parsed.push(tc);
            }
            for (const s of r.skipped) skipped.push(s);
          }
          // 与原实现一致：把标记从正文里剥掉（避免前端 chip 永驻）
          if (hasToolInContent && cleanedOf !== null) fullContent = cleanedOf;
          else if (hasToolInReasoning && cleanedOf !== null) fullReasoning = cleanedOf;
          if (hasEmptyArgs) {
            // 逐个补救（原地补参、保留原 id → 配对完整），未补到的才追加为新调用。
            // ★ 候选按名字分池、取用即移除，避免同一结果既补参又追加（调用数翻倍）。
            const recovered = new Map<string, { id: string; name: string; arguments: string }[]>();
            for (const p of parsed) {
              if (!recovered.has(p.name)) recovered.set(p.name, []);
              recovered.get(p.name)!.push(p);
            }
            for (const tc of toolCallAcc) {
              if (!isEmptyArgSub(tc)) continue;
              const nm = tc.function?.name || '';
              const pool = nm ? recovered.get(nm) : undefined;
              if (pool && pool.length) tc.function!.arguments = pool.shift()!.arguments;
            }
            for (const pool of recovered.values()) {
              for (const p of pool) {
                toolCallAcc.push({ id: p.id, function: { name: p.name, arguments: p.arguments } } as DeltaToolCall);
              }
            }
          } else {
            for (const tc of parsed) {
              toolCallAcc.push({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } } as DeltaToolCall);
            }
          }
          if (skipped.length > 0) skippedArgToolsSub = [...new Set([...skippedArgToolsSub, ...skipped])];
          if (toolCallAcc.length > 0) {
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc], subAgentId: resolvedId, parentToolCallId });
          }
        }
      }

      // 更新助手消息（tokens 同主循环：usage 优先，缺失按内容长度粗估）
      if (toolCallAcc.length > 0) ensureToolCallIds(toolCallAcc);
      updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined, usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2));
      emit(task, { type: 'message:updated', messageId: assistantMsgId, content: fullContent, reasoning: fullReasoning, toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined });
      // ★ D（2026-10-07）：累计子智能体自身 token 消耗（与主循环同口径粗估），供预算闸判定
      subTokensTotal += usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2);
      // ★ D：子智能体预算闸（token/墙钟）。触达不硬杀——跳出内层，走与步数上限相同的接力决策，
      //   只是在接力判定处**拒绝续批**（预算已尽，续批只会立刻再触达）。
      subBudgetHit = sharedCheckTaskBudgetHit(subBudgets, subTokensTotal, subStartedAt);
      if (subBudgetHit) break;

      // 无工具调用 → 子智能体完成
      if (toolCallAcc.length === 0) {
        // ★ 「只写了工具名、没写参数体」优先于"完成"（与主循环同口径）：这不是做完了，
        //   是模型忘了给参数。给一条明确提示让它**只补参数重发**，而不是当成任务结束。
        if (skippedArgToolsSub.length > 0 && step < subStepBudget - 1) {
          const tip = `你只给出了工具名（${skippedArgToolsSub.join('、')}）但没有写出参数，因此这些调用**未被执行**。` +
            `请重新输出完整调用，**必须带上参数体**，例如：\n` +
            `[TOOL_CALL]{"name":"${skippedArgToolsSub[0]}","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n` +
            `只补这一次参数即可，不要解释、不要重头再来。`;
          const tipId = insertMessage(task.conversationId, task.userId, 'user', tip, {
            parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
          });
          emit(task, { type: 'message:added', message: { id: tipId, role: 'user', content: tip, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });
          skippedArgToolsSub = [];
          continue;
        }
        emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
        return fullContent || '(无输出)';
      }

      // 执行工具调用（同批多导航：第 2+ 个 browser_navigate 转为新开标签页）
      const newTabNavIds = markDuplicateNavigations(toolCallAcc);
      for (const tc of toolCallAcc) {
        const toolName = tc.function?.name || (tc as any).toolName || '';
        const parsedArgs = parseToolArguments(tc.function?.arguments);
        if (parsedArgs.args === null) {
          // 参数解析失败：同样落库 tool 结果（带子智能体归属字段）保持配对，并提示模型重试
          const errMsg = capToolResult(`参数解析失败，本工具未执行。${parsedArgs.err}\n请重新调用 ${toolName}，确保 arguments 是完整、合法的 JSON 对象。`);
          insertToolMessageAndEmit(task, task.conversationId, task.userId, tc.id || '', errMsg, subOwnership);
          continue;
        }
        const toolArgs: any = parsedArgs.args;
        if (newTabNavIds.has(String(tc.id || ''))) toolArgs.openInNewTab = true;
        // 统一出口（P1）：执行/中止/钩子/落库与主循环同源 —— 此前这里各写一份已两次漂移
        //（漏跑 runAfterToolHooks 导致子智能体产物不登记等）。
        await runToolCallAndPersist({
          task, registry,
          convId: task.conversationId, userId: task.userId, assistantMsgId,
          toolName, args: toolArgs, tcId: tc.id || '', depth: depth + 1, toolDefs: subTools, uiTools,
          ownership: subOwnership,
        });
      }
    }  // ← 子智能体单批步数循环

    // ★★★ 达单批上限 → 决策是否接力下一批（对齐主循环；见函数头 P1-1 注释）。
    //   子智能体的接力**不向用户抛总结消息**（用户看的是父智能体的产出），
    //   只在内部续一批；轮次上限 subAutoRounds 保证不会无限跑。
    if (subBatch < subAutoRounds && !task.abortController.signal.aborted) {
      let shouldContinue = false;
      // ★ D：预算已耗尽 → 不再征求模型意见直接不接力（续批只会立刻再触达，白烧一次总结调用）
      if (subBudgetHit) shouldContinue = false;
      else try {
        const hist = loadSubAgentMessages(task.conversationId, parentToolCallId).filter(m => m.content || m.toolCalls || m.role === 'tool');
        const history: Message[] = hist.map(m => ({
          id: m.id, conversationId: '', role: m.role,
          content: m.content, toolCalls: m.toolCalls,
          toolCallId: m.toolCallId, createdAt: m.createdAt,
        }));
        // kind='main' → 带 CONTINUE 自评指令（子智能体接力同样需要模型自评"还有活没干完"）
        const r = await summarizeOnMaxSteps(client, systemPrompt, history, subStepBudget, 'main');
        shouldContinue = r.shouldContinue;
        if (r.text) {
          // 总结落库在**子智能体自己的上下文**里（带 parentToolCallId），
          // 既让接力轮看得到"上一批做到哪"，也不污染父智能体的消息流。
          const sumId = insertMessage(task.conversationId, task.userId, 'assistant', r.text, {
            parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
          });
          emit(task, { type: 'message:added', message: { id: sumId, role: 'assistant', content: r.text, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });
        }
      } catch { /* 总结失败 → 不接力（保守） */ }
      if (shouldContinue) {
        emit(task, { type: 'sub_agent:continuation', agentId: resolvedId, agentName: subAgentName, parentToolCallId, round: subBatch + 1, maxRounds: subAutoRounds });
        subStepBudget = maxSteps; // 重置单批预算，继续外层批次
        continue;
      }
    }
    break; // 不接力 → 退出批次循环，走下面的收尾
    }  // ← 子智能体批次循环

    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    // 达到最大步数：先请模型总结进展再返回给父智能体（父智能体可基于总结决策下一步），
    // 总结失败回退到固定文案。
    let resultText = subBudgetHit
      ? (subBudgetHit.kind === 'tokens'
        ? `子智能体已达到自身 token 预算（累计 ${subBudgetHit.used} / 上限 ${subBudgetHit.limit}）`
        : `子智能体已达到自身墙钟时间上限（${Math.round(subBudgetHit.limit / 60000)} 分钟）`)
      : `子智能体已达到最大循环数（${maxSteps}）`;
    try {
      const hist = loadSubAgentMessages(task.conversationId, parentToolCallId).filter(m => m.content || m.toolCalls || m.role === 'tool');
      const history: Message[] = hist.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      }));
      const summary = await summarizeOnMaxSteps(client, systemPrompt, history, maxSteps, 'sub');
      if (summary.text) {
        resultText = `${summary.text}\n\n（注：子智能体已达到最大循环步数（${maxSteps}），以上为阶段总结。）`;
      }
    } catch { /* 总结失败回退固定文案 */ }
    return resultText;
  } catch (e: any) {
    if (isAbortError(e)) throw e;
    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    return `子智能体执行失败: ${e?.message || e}`;
  }
}

/** 达到最大循环步数时的兜底总结：不带 tools 追加一轮对话，请模型基于已执行的操作与
 *  结果输出进展总结（已完成 / 关键结果 / 未完成原因 / 后续建议），替代生硬的报错文案。
 *
 *  ★ 同时让模型**自评「是否还有活没干完」**（末尾 `CONTINUE: yes|no` 一行），
 *    作为「达上限自动接力」的判据之一（见 decideAutoContinue）。
 *    复用这一轮调用而不是再多花一次 LLM —— 长任务本来就贵，能省一次是一次。
 *
 *  调用方需自行 catch；本函数内部已兜底，失败时返回 { text: null, shouldContinue: false }。 */
async function summarizeOnMaxSteps(
  client: LlmClient,
  systemPrompt: string,
  history: Message[],
  maxSteps: number,
  kind: 'main' | 'sub',
): Promise<{ text: string | null; shouldContinue: boolean; /** 结构化 critic 的置信度（P1-10；文本兜底路径无此值） */ confidence?: number }> {
  try {
    const llmMessages: Message[] = [];
    if (systemPrompt) {
      llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
    }
    llmMessages.push(...history);
    // CONTINUE 行：主循环与**子智能体接力**都需要（子智能体接力由 runSubAgent 调用，传 kind='main'
    // 以拿到 CONTINUE 自评；真正返回给父智能体的收尾总结仍传 kind='sub'，只要正文）。
    const continueInstruction = kind === 'main'
      ? '\n\n最后另起一行输出 CONTINUE: yes 或 CONTINUE: no —— 如果你的任务目标**还没全部完成、且不需要用户补充信息**就能继续做，输出 yes；若任务已完成、或必须等用户提供信息/做决定才能继续，输出 no。这一行必须是最后一行，格式严格为 `CONTINUE: yes` 或 `CONTINUE: no`。'
      : '';
    const bodyInstruction = kind === 'sub'
      ? `你已执行 ${maxSteps} 步，达到本子任务的最大步数限制。这是最后一轮，不能再调用任何工具。请基于以上已执行的操作与获得的结果，输出一段给父智能体的进展总结：1) 已完成的工作；2) 关键结果/数据（附来源 URL 或文件路径）；3) 未完成的部分与原因；4) 建议的后续步骤。直接输出总结正文，不要调用工具，不要输出 JSON。`
      : `你已执行 ${maxSteps} 步，达到本次任务的最大步数限制。这是最后一轮，不能再调用任何工具。请基于以上对话与工具执行结果，向用户输出一份任务进展总结：1) 已完成的工作；2) 关键结果/数据（附来源 URL 或文件路径）；3) 未完成的部分与原因；4) 建议用户如何继续。直接输出总结正文，不要调用工具。${continueInstruction}`;

    // ★ P1-10（2026-10-07）：主路径自评升级为**结构化 critic**（json_object 强制），
    //   输出 {summary, continue, confidence, reason}。
    //   为什么：纯文本 `CONTINUE: yes` 没有置信度 —— 模型"猜还能继续"与"确信还能继续"
    //   给出同样的信号，接力决策拿不到区分度（2026 共识：无进度检测 + 置信度阈值双保险）。
    //   ★ 降级路径必须保留：端点不支持 json_object（或模型不配合）→ 回退**原文本 CONTINUE**
    //     解析，接力能力不能因这次升级而丢失。
    if (kind === 'main') {
      // 结构化尝试
      try {
        const sMsgs: Message[] = llmMessages.slice(); // 复用（system + history）
        sMsgs.push({
          id: 'sum', conversationId: '', role: 'user', createdAt: 0,
          content: `${bodyInstruction.replace(continueInstruction, '')}\n\n不要直接输出总结正文。改为输出一个 JSON 对象（不要输出其他文字）：\n{"summary":"给用户看的任务进展总结（markdown 正文，覆盖上述 1-4 点）","continue":true或false,"confidence":0到1的小数（你对"还能继续推进"的把握）,"reason":"一句话理由"}\n判定规则：任务目标还没全部完成、且不需要用户补充信息 → continue=true；任务已完成、或必须等用户决定 → continue=false。`,
        });
        const resp = await client.chat(sMsgs, {
          temperature: 0.3, maxTokens: 2048,
          responseFormat: { type: 'json_object' },
        });
        const raw = (resp.delta?.content || '').trim();
        const parsed = raw ? JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) : null;
        if (parsed && typeof parsed === 'object') {
          const text = typeof parsed.summary === 'string' ? parsed.summary.trim() : null;
          const conf = Number(parsed.confidence);
          return {
            text: text || null,
            shouldContinue: parsed.continue === true && (Number.isFinite(conf) ? conf >= 0.6 : true),
            confidence: Number.isFinite(conf) ? conf : undefined,
          };
        }
      } catch { /* 结构化失败 → 走下面的文本 CONTINUE 兜底（接力能力不能丢） */ }
    }

    llmMessages.push({
      id: 'sum', conversationId: '', role: 'user', createdAt: 0,
      content: bodyInstruction,
    });
    const resp = await client.chat(llmMessages, { temperature: 0.3, maxTokens: 1024 });
    const raw = (resp.delta?.content || '').trim();
    if (!raw) return { text: null, shouldContinue: false };
    // 剥离 CONTINUE 行：它是指令信号，不该出现在给用户看的总结正文里
    const m = raw.match(/^\s*CONTINUE\s*:\s*(yes|no)\s*$/im);
    const shouldContinue = !!m && m[1].toLowerCase() === 'yes';
    const text = raw.replace(/^\s*CONTINUE\s*:\s*(yes|no)\s*$/im, '').trim();
    return { text: text || null, shouldContinue };
  } catch {
    return { text: null, shouldContinue: false };
  }
}

/** 解析记忆抽取/压缩前抢救用模型：任务携带的「记忆抽取模型」配置（前端设置页下发）优先，
 *  未配置、已失效或误配为非 LLM 模型时回退任务自身的平台/模型。 */
function resolveMemoryExtractLlm(task: LlmTask): { platform: Platform; model: Model } | null {
  if (task.memoryExtractPlatformId && task.memoryExtractModelId) {
    const p = loadPlatform(task.memoryExtractPlatformId, task.userId);
    const m = loadModel(task.memoryExtractModelId, task.userId, task.memoryExtractPlatformId);
    if (p && m && (m.type || 'llm') === 'llm') return { platform: p, model: m };
  }
  const p = loadPlatform(task.platformId, task.userId);
  const m = loadModel(task.modelId, task.userId, task.platformId);
  return p && m ? { platform: p, model: m } : null;
}

/** 会话里最后一条非空助手消息 —— 终止/失败路径用它当「做到哪」的线索。
 *  floor 是为了跳过本次刚写的失败兜底文案（否则记的是"调用失败"而非真实进展）。 */
function lastAssistantText(convId: string, floor = 0): string {
  try {
    const msgs = loadMessages(convId).filter((m) => m.role === 'assistant' && (m.content || '').trim());
    const hit = msgs.filter((m) => (m.createdAt || 0) >= floor).pop() || msgs.pop();
    return (hit?.content || '').trim();
  } catch {
    return '';
  }
}

/**
 * 长任务收尾 → 空间记忆。
 *
 * ★★★ 为什么必须有这个函数（用户 2026-09-27 报「长任务没完整需要总结记忆进入空间记忆」）：
 *   此前四条任务出口**没有一条**把结论写进空间记忆：
 *     · 正常完成 / 达最大步数 → 只写 memory 表（user/agent 维度）与一条对话消息；
 *     · 被终止 / 失败 → 连对话消息都没有（失败只有错误文案）。
 *   而空间 MEMORY.md 是**唯一**跨会话注入的记忆文件 → 同目录新会话读到的永远是空的，
 *   用户"换会话继续同一个长任务"时模型不知道上一批做到哪。
 *
 * fire-and-forget：写记忆失败绝不阻塞收尾（appendTaskProgress 内部已 fail-safe）。
 */
async function recordTaskProgress(
  task: LlmTask,
  outcome: 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop',
  summary: string,
  extra?: { steps?: number; continuation?: string },
): Promise<void> {
  persistTaskStatus(task);
  // 非正常结束（被中断/失败）时补一条可见提示：此前这类收尾在对话里没有留痕，
  // 用户只看到"任务没了"，不知道发生了什么、要不要重发（2026-10-07）。
  if (outcome === 'aborted' || outcome === 'failed') {
    try {
      const note = outcome === 'aborted'
        ? `⚠️ 任务已中断（${task.error || '服务重启或手动终止'}）。需要继续的话把要求再发一次即可。`
        : `⚠️ 任务失败：${task.error || '未知错误'}`;
      const msgId = insertMessage(task.conversationId, task.userId, 'assistant', note);
      emit(task, { type: 'message:added', message: { id: msgId, role: 'assistant', content: note } });
    } catch { /* 补提示失败不影响收尾 */ }
  }
  try {
    let agentName = '';
    if (task.agentId) {
      try {
        const row = db.prepare('SELECT name FROM agent WHERE id = ?').get(task.agentId) as { name?: string } | undefined;
        agentName = row?.name || '';
      } catch { /* 取不到就不写智能体名 */ }
    }
    // 自动接力时，把「第几批」一并写进记忆行（同目录新会话能看出这是接力的中间批，不是首轮）
    const note = extra?.continuation ? `${summary}（${extra.continuation}）` : summary;
    await appendTaskProgress(task.conversationId, outcome, note, { steps: extra?.steps, agentName });
    // ★★★ 记忆蒸馏（M5，2026-10-09）：收尾时顺手把**超期的明细条目**蒸馏进 MEMORY.md 并删原条目。
    //   —— 对齐 WorkBuddy 的「蒸馏 + 删除」治理闭环（此前 yan-zhi 只有"截断"：
    //   超出上限的内容要么被静默丢掉、要么堆在文件里永不清理）。
    //   ★ 放在收尾路径的理由：收尾是**天然低频**时机（一次任务一次），且此刻明细刚写完；
    //     加定时器反而会引入"与写入竞争"的新问题。
    //   ★ 门控（都不满足就零成本跳过）：① 有空间 ② 有可用 LLM ③ 超期条目 ≥ 阈值。
    //   ★ fail-safe：任何失败只 warn，绝不影响任务收尾。
    void maybeDistillStaleMemory(task);
  } catch { /* 收尾留痕失败不影响任务状态上报 */ }
  // 经验提炼（自进化经验层）：成功挖步骤/事实，失败挖坑与规避。非阻塞，失败不影响收尾。
  void distillExperienceFromTask(task, outcome);
}

/**
 * 收尾时的记忆蒸馏触发（M5）——「超期明细 → LLM 蒸馏成要点 → 写 MEMORY.md → 删原条目」。
 *
 * ★ 为什么模型从 task 解析而不是硬编码：与"记忆抽取/压缩前抢救"同一口径
 *   （`resolveMemoryExtractLlm`，用户可在设置页配专用小模型），避免三处各写一遍模型来源。
 * ★ 为什么用 `new LlmClient(platform, model)`：与本文件 `maybeReplanOnContinue`（2977 行）
 *   完全同一范式 —— 那里也是"解析出 {platform,model} → 建 client → 非流式 chat"。
 *   （`services/llm-call.ts` 的 chatViaRow 吃的是 **DB 行**，此处手上是已解析的 {platform,model}，
 *    形状不符，故不用它；★ 别为了"统一出口"硬套一个签名不匹配的函数。）
 */
async function maybeDistillStaleMemory(task: LlmTask): Promise<void> {
  try {
    const { resolveConversationSpaceId, distillStaleProgress } = await import('./services/space-memory.js');
    const spaceId = resolveConversationSpaceId(task.conversationId);
    if (!spaceId) return; // 未挂空间 → 没有 space 级记忆文件可蒸馏
    const llm = resolveMemoryExtractLlm(task);
    if (!llm) return; // 没有可用模型 → 不蒸馏（保持"能跑就跑"的降级）
    const client = new LlmClient(llm.platform, llm.model);
    await distillStaleProgress(task.userId, spaceId, async (entries) => {
      // 蒸馏提示词：要求**压缩成要点**并**保留可操作信息**（路径/命令/结论）——
      // ★ 与压缩摘要是同一原则：不透明标识符（路径/命令/ID）一旦被改写就不可恢复。
      const resp = await client.chat([
        {
          id: 'sys', conversationId: '', role: 'system', createdAt: 0,
          content: '你是长期记忆的蒸馏器。把多条历史任务明细压缩成尽量少的要点，只输出要点本身，不要客套。',
        },
        {
          id: 'usr', conversationId: '', role: 'user', createdAt: 0,
          content: [
            `以下是一个项目 ${entries.length} 条**已超过 30 天**的历史任务明细（原文将被删除，只保留你给出的要点）：`,
            '',
            ...entries,
            '',
            '请输出**压缩要点**，要求：',
            '1. 合并同类项，丢掉过程中的试错与重复；',
            '2. **必须原样保留**：产物路径、关键命令、文件/接口名、结论性的参数与决策 —— 这类信息一改就不可恢复；',
            '3. 只保留"以后还会用到"的内容；一次性的临时进展不必保留；',
            '4. 用「- 」开头的若干行输出，总长不超过 600 字。',
          ].join('\n'),
        },
      ], { temperature: 0.2, maxTokens: 800 });
      return resp.delta?.content || '';
    });
  } catch (e: any) {
    logger.warn('[llm-task] 记忆蒸馏失败（不影响收尾）:', e?.message || e);
  }
}

/** 记忆抽取：任务完成后从会话中抽取值得长期记住的信息，写入 memory 表。
 *  非阻塞（void 调用），不影响 task:completed 事件时序。 */
async function extractMemoryFromConversation(task: LlmTask): Promise<void> {
  try {
    const msgs = loadMessages(task.conversationId);
    const recent = msgs.filter(m => m.content || m.toolCalls?.length).slice(-20);
    if (recent.length < 4) return;

    const transcript = recent.map(m => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
      return `【${role}】\n${m.content || (m.toolCalls?.length ? '(调用工具)' : '')}`;
    }).join('\n\n---\n\n');

    const llm = resolveMemoryExtractLlm(task);
    if (!llm) return;

    // 避让上游配额（2026-10-07）：任务刚结束时同会话常有接力任务已在跑；此时再打一次
    // 抽取调用会与主任务叠加限流（429 Too Many Requests）。有其它任务在跑就跳过本轮抽取
    // （对话原文仍在，下轮或手动整理时补抽，不丢数据）。
    if (hasActiveUserTasks()) {
      logger.info('[memory] 抽取跳过：有任务运行中（避让上游配额）');
      return;
    }

    const client = new LlmClient(llm.platform, llm.model);
    const resp = await client.chat([
      { id: 'sys', conversationId: '', role: 'system', content: '你是记忆抽取助手。从对话中抽取「值得长期记住的用户信息」，输出 JSON 数组，每项形如 {"type":"agent|session|daily","content":"一句话事实"}。agent=稳定的用户偏好/背景；daily=当天的重要事件/进展；session=本会话的上下文结论。若新信息与既有认知矛盾（如用户纠正了之前的偏好），可加 "conflictsWith" 字段说明被推翻的旧结论内容。相对日期（如"昨天"）转为绝对日期。只输出 JSON，不要解释。若没有值得记的返回 []。', createdAt: 0 },
      { id: 'usr', conversationId: '', role: 'user', content: transcript, createdAt: 0 },
    ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } });

    const text = resp.delta?.content || '';
    // 兼容数组 / {items:[...]} / 单对象（部分模型 json_object 模式下返回单个对象而非数组，
    // 此前只认数组导致抽取结果恒为 0 条且无任何日志）
    const items = parseExtractedItems(text);
    if (items.length) {
      logger.info(`[memory] 抽取: 模型返回 ${items.length} 条候选`);
    } else if (text.trim()) {
      logger.info('[memory] 抽取: 模型输出无法解析为条目, 前120字:', text.slice(0, 120));
    }

    // 统一走 memory-service 写入：语义去重（余弦>0.92 更新原行）、冲突标记（superseded_by）、
    // daily 按天合并、session 带会话 id、agent 记忆带 agent 归属（修复此前全部 agent_id IS NULL 的 bug）
    const writeItems: MemoryWriteItem[] = items
      .filter((x) => x?.content && typeof x.content === 'string')
      .map((x) => ({
        type: x.type === 'daily' ? 'daily' : x.type === 'session' ? 'session' : 'agent',
        content: String(x.content),
        metadata: x.type === 'session' ? { conversationId: task.conversationId } : {},
        conflictsWith: typeof x.conflictsWith === 'string' && x.conflictsWith ? x.conflictsWith : undefined,
      }));
    if (writeItems.length) {
      const r = await writeMemoryItems(task.userId, task.agentId ?? null, writeItems, 'extract');
      logger.info(`[memory] 抽取写入: +${r.created} 新增 / ${r.updated} 去重更新 / ${r.merged} 合并 / ${r.superseded} 冲突取代`);
    }
  } catch (e: any) {
    logger.error('[memory] 抽取失败:', e?.message || e);
  }
}

/**
 * 经验提炼（自进化经验层，2026-10-09）：任务收尾时从会话里提炼「可复用的操作经验」，
 * 追加进 .yan-zhi/experience/<topic>.md（坑/步骤/事实，服务端去重计数）。
 *
 * ★ 与 extractMemoryFromConversation 的分工：那边记「用户是谁/发生了什么」（memory 表），
 *   这里记「下次同类任务怎么做」（坑的规避、验证过的步骤）——失败/中断的任务**尤其要提炼**，
 *   卡住的坑恰是最值钱的经验（用户明确要求开发任务、bug 排障也要自进化）。
 *
 * 调用点：recordTaskProgress（任务 5 个出口的唯一收口）——所有任务类型通用，不只浏览器。
 * 非阻塞 + 全程 fail-safe：提炼失败绝不影响任务收尾。
 */
async function distillExperienceFromTask(
  task: LlmTask,
  outcome: 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop',
): Promise<void> {
  try {
    // 素材门槛：至少 8 条有内容的消息（真实任务过程），一问一答的闲聊不值得提炼
    const msgs = loadMessages(task.conversationId);
    const recent = msgs.filter((m) => m.content || m.toolCalls?.length).slice(-24);
    if (recent.length < 8) return;

    // 避让上游配额（同 extractMemoryFromConversation 口径）：有任务在跑就跳过本轮
    if (hasActiveUserTasks()) {
      logger.info('[experience] 提炼跳过：有任务运行中（避让上游配额）');
      return;
    }
    const llm = resolveMemoryExtractLlm(task);
    if (!llm) return;

    // 已有档案给模型当 topic 参考（让它往既有主题归档，而不是每任务开新文件）
    const { base } = resolveExperienceBase(task.conversationId);
    const knownTopics = listExperienceSummaries(base).map((s) => s.topic);
    const topicHint = knownTopics.length ? `已有档案主题（优先归到这里）：${knownTopics.join('、')}` : '尚无档案';

    const transcript = recent.map((m) => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
      return `【${role}】\n${m.content || (m.toolCalls?.length ? '(调用工具)' : '')}`;
    }).join('\n\n---\n\n');

    // 出口形态决定提炼侧重：成功挖可复用步骤，失败/中断挖坑与规避
    const focus = outcome === 'completed'
      ? '任务成功完成。重点提炼：验证过的可复用操作步骤（step）、过程中确认的环境/配置/路径事实（fact)。'
      : '任务未顺利完成（失败/中断/超步数）。重点提炼：踩到的坑与规避方法（pit）——是什么导致卡住、下次怎么绕开。';

    const client = new LlmClient(llm.platform, llm.model);
    const resp = await client.chat([
      {
        id: 'sys', conversationId: '', role: 'system', createdAt: 0,
        content: '你是任务经验提炼助手。从对话记录中提炼「可复用的操作经验」，输出 JSON 对象 {"items":[{"kind":"pit|step|fact","topic":"主题","title":"一句话标题","detail":"详情"}]}。'
          + '\nkind 定义：pit=踩过的坑（detail 写规避方法）；step=验证过的做法/步骤序列；fact=环境/配置/路径事实。'
          + `\ntopic 是档案归档主题（即文件名），小写英文或中文短语：浏览器站点用 sites/<域名>；开发类 dev-<主题>（如 dev-打包、dev-依赖）；部署运维 ops-<主题>；办公流程 workflow-<主题>。${topicHint}。`
          + `\n${focus}`
          + '\n要求：只提炼有普适复用价值的（下次同类任务能直接用），最多 3 条，没有值得记的返回 {"items":[]}。标题要具体可区分，禁止空泛（如"注意细节"这种不要）。只输出 JSON。',
      },
      { id: 'usr', conversationId: '', role: 'user', content: transcript, createdAt: 0 },
    ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } });

    const text = resp.delta?.content || '';
    let items: any[] = [];
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    } catch { /* 解析失败当无条目 */ }

    const valid = items
      .filter((x) => x && typeof x.title === 'string' && x.title.trim())
      .filter((x) => ['pit', 'step', 'fact'].includes(x.kind))
      .slice(0, 3);
    if (!valid.length) return;

    let written = 0;
    for (const it of valid) {
      try {
        const r = await appendExperienceEntry(base, {
          kind: it.kind as ExperienceKind,
          topic: String(it.topic || 'misc'),
          title: String(it.title),
          detail: typeof it.detail === 'string' ? it.detail : '',
          source: `任务收尾（${outcome}）`,
        });
        written++;
        logger.info(`[experience] 提炼写入: ${r.topic}${r.deduped ? '（去重计数+1）' : '（新条目）'}`);
        // P1 自进化升级链：同一验证过的步骤**恰好第 2 次**成功 → 该流程值得固化，自动生成 skill 草稿
        // （===2 只触发一次，后续计数增长不再重复提炼；草稿不静默生效，会话内轻提示，用户确认后才启用）
        if (it.kind === 'step' && r.deduped && r.entryCount === 2) {
          const draft = await proposeSkillDraft({
            llm,
            transcript,
            triggerTopic: r.topic,
            triggerTitle: String(it.title),
            draftsRoot: resolveSkillDraftsDir(task.conversationId),
          });
          const notify = skillDraftNotifyText(draft);
          if (notify) {
            const msgId = insertMessage(task.conversationId, task.userId, 'assistant', notify);
            emit(task, { type: 'message:added', message: { id: msgId, role: 'assistant', content: notify } });
          }
        }
      } catch (e: any) {
        logger.warn('[experience] 单条写入失败:', e?.message || e);
      }
    }
    if (written) logger.info(`[experience] 本轮提炼共写入 ${written} 条`);
  } catch (e: any) {
    logger.error('[experience] 提炼失败:', e?.message || e);
  }
}

// 定期清理已完成任务
setInterval(() => cleanupTasks(), 5 * 60 * 1000);

// ============================================================
// 后端独立构建系统提示词 + 工具 schema（供定时任务等无前端场景使用）
// ============================================================

/** UI 交互工具集合 —— 定时任务等无前端场景下排除 */
const UI_TOOL_NAMES = new Set([
  'ask_user', 'confirm_user', 'configure_model_platform', 'task_plan', 'task_step',
  'image_analyze',
  'browser_navigate', 'browser_open_external',
]);

/**
 * UI 交互工具（必须委托前端执行：需要用户输入/确认）。
 * ★ 2026-10-08 提到模块顶层并导出：PlanRunner 派发计划项时**必须传同一份** ——
 *   此前传空 Set 会让 pageAgent 的 browser_navigate 走错执行通道，且工具面裁剪
 *   口径与主链路不一致。同一语义的常量只能有一处定义（本项目既有教训）。
 */
export const UI_TOOLS = new Set([
  'ask_user', 'confirm_user', 'configure_model_platform', 'task_plan', 'task_step',
  'image_analyze',
]);

// ============================================================
// 会话级挂载（conversation 表）—— 与前端 getMergedMounts 的会话来源对齐，
// 保证"前端交互 / 定时任务 / IM"三条入口按同一套规则构建提示词与工具列表。
// ============================================================

interface ConvMounts {
  systemPrompt?: string;
  builtinToolIds: string[];
  /** 会话级自定义工具挂载（api_conversation_setup 传 customToolIds 写入） */
  customToolIds: string[];
  skillIds: string[];
  mcpMounts: { serverId: string; toolName: string }[];
}

function loadConversationMounts(conversationId?: string | null): ConvMounts {
  const empty: ConvMounts = { builtinToolIds: [], customToolIds: [], skillIds: [], mcpMounts: [] };
  if (!conversationId) return empty;
  const conv = db.prepare('SELECT system_prompt, builtin_tool_ids_json, custom_tool_ids_json, skill_ids_json, mcp_servers_json FROM conversation WHERE id = ?').get(conversationId) as any;
  if (!conv) return empty;
  const builtinToolIds: string[] = (() => { try { return JSON.parse(conv.builtin_tool_ids_json || '[]'); } catch { return []; } })();
  const customToolIds: string[] = (() => { try { return JSON.parse(conv.custom_tool_ids_json || '[]'); } catch { return []; } })();
  const skillIds: string[] = (() => { try { return JSON.parse(conv.skill_ids_json || '[]'); } catch { return []; } })();
  // mcp_servers_json：string[]（旧格式，全量暴露）或 [{serverId, disabledTools}]（细粒度，与前端 rowToConv 一致）
  const mcpMounts: { serverId: string; toolName: string }[] = [];
  try {
    const parsed = JSON.parse(conv.mcp_servers_json || '[]');
    if (Array.isArray(parsed)) {
      for (const x of parsed) {
        const sid = typeof x === 'string' ? x : (x?.serverId || x?.id || '');
        if (!sid) continue;
        const disabled: string[] = typeof x === 'object' && x ? (x.disabledTools || []) : [];
        for (const t of getToolsFromDb(sid)) {
          if (t.enabled === false || disabled.includes(t.name)) continue;
          mcpMounts.push({ serverId: sid, toolName: t.name });
        }
      }
    }
  } catch { /* 解析失败按无挂载处理 */ }
  return { systemPrompt: conv.system_prompt || undefined, builtinToolIds, customToolIds, skillIds, mcpMounts };
}

/** agent.mcp_tool_mounts ∪ 会话级 MCP 挂载：agent 中 toolName='*' 的 server 覆盖会话级同 server 细粒度挂载（与前端规则一致） */
function mergeMcpMounts(agentMounts: any[], convMounts: { serverId: string; toolName: string }[]): { serverId: string; toolName: string }[] {
  const merged: { serverId: string; toolName: string }[] = [...(agentMounts || [])];
  const starServers = new Set(merged.filter((m: any) => m.toolName === '*').map((m: any) => m.serverId));
  for (const c of convMounts) {
    if (!starServers.has(c.serverId) && !merged.some((m: any) => m.serverId === c.serverId && m.toolName === c.toolName)) {
      merged.push(c);
    }
  }
  return merged;
}

/** 合并后的 MCP serverId 集合（executeTool 无人值守后端直连 MCP 兜底用） */
export function getMergedMcpServerIds(agentId: string | null, userId: string, conversationId?: string | null): string[] {
  let agentMounts: any[] = [];
  if (agentId) {
    const agent = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { agentMounts = JSON.parse(agent?.mcp_tool_mounts || '[]'); } catch { agentMounts = []; }
  }
  const convMounts = loadConversationMounts(conversationId);
  return [...new Set(mergeMcpMounts(agentMounts, convMounts.mcpMounts).map((m) => m.serverId))];
}

/** 从 DB 加载 agent + 会话挂载，构建系统提示词（单一事实来源：前端交互/定时任务/IM 共用同一套规则）。
 *  提示词始终注入「## 可用工具」（带完整入参定义）；原生 function calling 模型同时拿到 tools schema，
 *  文本模式模型由 runReActLoop 追加 [TOOL_CALL] 调用格式说明。 */
/** 运行中任务权限实时更新（2026-10-06）：会话权限下拉变更后，同会话的 running 任务
 *  立即按新模式执行运行时拦截（executeTool 的 checkToolPermission 读 task.permissionMode）。
 *  此前模式在任务创建时捕获、变更只写库 → 长任务期间改权限「不是实时的」。
 *  局限说明：任务启动时 filterToolsByPermission 已构建的工具清单不回补（只读收窄过
 *  的工具不恢复），但运行时拦截以新模式实时放行/拒绝 —— 安全边界仍生效。
 *  @returns 更新的任务数 */
export function setRunningTaskPermissionMode(conversationId: string, mode: PermissionMode): number {
  let n = 0;
  for (const [, t] of tasks) {
    if (t.conversationId === conversationId && t.status === 'running') {
      t.permissionMode = mode;
      n++;
    }
  }
  return n;
}

export function buildSystemPromptForBackend(agentId: string | null, userId: string, appGuide?: string, opts?: {
  conversationId?: string | null;
  includeUiTools?: boolean;
  userContent?: string;
  workspaceDir?: string;
  /**
   * 是否可委派/编排（2026-10-09）。只读权限会话为 false —— 此时 plan_tasks/reassign_task
   * 已被 filterToolsByPermission 从工具面摘除，若仍注入"用 plan_tasks 编排"的协议，
   * 模型会收到**相互矛盾**的指令（编排 vs 只读）并反复撞墙。默认 true（向后兼容其余调用点）。
   */
  canDelegate?: boolean;
}): string {
  const parts: string[] = [];
  const convMounts = loadConversationMounts(opts?.conversationId);
  const includeUiTools = !!opts?.includeUiTools;
  // 工作目录（会话指定 > 全局兜底）——项目技能目录与 AGENTS.md/rules 段共用同一取值口径
  const effectiveWorkspaceDir = (opts?.workspaceDir && opts.workspaceDir.trim()) || serverState.workspaceDir;

  // 应用指引（用户在前端配置的全局上下文/行为约束）：无条件注入，保证三条入口行为一致
  if (appGuide && appGuide.trim()) {
    parts.push('---\n## 应用指引\n' + appGuide.trim());
  }

  // 系统提示词：会话级优先，其次 agent 级（与前端 conv.systemPrompt || agent.systemPrompt 一致）
  let basePrompt = '';
  if (agentId) {
    const agent = db.prepare('SELECT system_prompt, type, skill_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    basePrompt = convMounts.systemPrompt || agent?.system_prompt || '';
    const isHarness = !agent?.type || agent.type === 'harness';

    // 工具描述（提示词模式才注入；原生 tools 模型走 schema）
    {
      const registry = getToolRegistry();
      const toolLines: string[] = [];

      // 内置工具：agent ∪ 会话挂载（与 buildToolsForBackend 同一套合并规则）
      let toolIds: string[] = [];
      const agentRow = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
      const agentToolIds: string[] = agentRow?.builtin_tool_ids ? JSON.parse(agentRow.builtin_tool_ids) : [];
      toolIds = [...new Set([...agentToolIds, ...convMounts.builtinToolIds])];
      for (const name of toolIds) {
        if (!includeUiTools && UI_TOOL_NAMES.has(name)) continue;
        const tool = registry.get(name);
        if (!tool) continue;
        toolLines.push(`- \`${name}\`: ${tool.description}${formatSchemaParams(tool.inputSchema)}`);
      }

      // MCP 工具（按 server 分组，暴露名与执行路由一致：mcp_{shortId}__{toolName}）
      const mergedMcp = mergeMcpMounts((() => {
        const row = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
        try { return JSON.parse(row?.mcp_tool_mounts || '[]'); } catch { return []; }
      })(), convMounts.mcpMounts);
      for (const m of mergedMcp) {
        const serverName = (db.prepare('SELECT name FROM mcp_server WHERE id = ?').get(m.serverId) as any)?.name || m.serverId;
        toolLines.push(`### ${serverName}`);
        const tools = m.toolName === '*'
          ? getToolsFromDb(m.serverId).filter((t: any) => t.enabled !== false)
          : getToolsFromDb(m.serverId).filter((t: any) => t.name === m.toolName && t.enabled !== false);
        for (const t of tools) {
          toolLines.push(`- \`mcp_${mcpShortIdOf(m.serverId)}__${t.name}\`: ${t.alias || t.description || t.name}${formatSchemaParams(t.inputSchema)}`);
        }
      }

      // 自定义工具（与 buildToolsForBackend 同一过滤规则）
      toolLines.push(...buildCustomToolDescLines(agentId, userId, includeUiTools, convMounts.customToolIds));

      // 多智能体编排工具（2026-10-08）：与 buildToolsForBackend 的 1.5 段同口径 —— 提示词模式
      // 模型也要知道这些工具存在。★ 权限感知（2026-10-09）：plan_tasks/reassign_task 是委派类，
      // 只读会话会被裁掉 —— 此处的文本清单也必须同步（否则提示词模式模型看到"可用"却调不动）。
      // get_plan_status 是纯读，只读会话仍可用。
      const orchestrationTools = opts?.canDelegate === false
        ? ['get_plan_status']
        : ['plan_tasks', 'get_plan_status', 'reassign_task'];
      for (const name of orchestrationTools) {
        const t = registry.get(name);
        if (t) toolLines.push(`- \`${name}\`: ${t.description}${formatSchemaParams(t.inputSchema)}`);
      }

      const sectionLines = toolLines.filter((l) => l.trim().length > 0);
      if (sectionLines.length > 0) {
        parts.push('---\n## 可用工具\n' + sectionLines.join('\n'));
      }
    }

    // 子智能体描述
    const subAgentIds: string[] = agent?.sub_agent_ids ? JSON.parse(agent.sub_agent_ids) : [];
    if (subAgentIds.length > 0) {
      const subLines: string[] = [];
      for (const sid of subAgentIds) {
        const sub = db.prepare('SELECT name, description FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(sid, userId) as any;
        if (sub) subLines.push(`- **${sub.name}** (id: \`${sid}\`): ${sub.description || ''}`);
      }
      if (subLines.length > 0) parts.push('---\n## 可调用子智能体\n' + subLines.join('\n'));
    }

    // 运行时生成子智能体（对齐 AOrchestra Φ=(I,C,T,M)）的使用引导。
    //
    // ★ 为什么必须显式写进提示词：这个能力**天然反直觉** —— 模型的默认反应是"我自己硬做"，
    //   而不是"先造一个专项执行者"。不点明适用场景，工具挂着也不会被用（本项目已有先例：
    //   自举工具集挂上之前，模型遇到缺工具只会空转）。
    // ★ 也要写清"什么时候**不要**用"：否则会滥用（每件小事都开一个子智能体，烧 token 且更慢）。
    const hasSpawnTool = (() => { try { const r = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any; const ids: string[] = r?.builtin_tool_ids ? JSON.parse(r.builtin_tool_ids) : []; return ids.includes('spawn_subagent') || convMounts.builtinToolIds.includes('spawn_subagent'); } catch { return false; } })();
    if (hasSpawnTool) {
      parts.push(
        [
          '---',
          '## 缺少合适执行者时：现场生成子智能体（spawn_subagent）',
          '你不必只用「已有」的子智能体。当发现手头没有对口的执行能力时，可以**现场定制**一个专项子智能体去干这件事。',
          '',
          '**适合用的场景**（满足其一即值得考虑）：',
          '- 子任务需要的能力组合与现有角色都不对口（如"按错误类型聚类这批日志"、"逐个核验这 12 条链接是否失效"）；',
          '- 子任务上下文高度独立（只需要少量输入、产出一段结论）—— 交给子智能体可避免把大量中间过程塞进你的上下文；',
          '- 子任务可批量并行（同类活分给多个子智能体，比你自己串行做快得多）；',
          '- 子任务简单且重复（用轻量模型跑，省成本）。',
          '',
          '**不要用的场景**（滥用会变慢变贵）：',
          '- 你一两步就能做完的事；',
          '- 已经有现成子智能体能干的活 —— 那用 `call_agent`（更省，且它有预设的专业提示词）；',
          '- 需要边做边和用户确认的活（子智能体看不到用户，`ask_user` 也不会转给它）。',
          '',
          '**你现场要填四个要素**：',
          '- `instruction`：做什么 + 什么算完成（**必须自包含**，它看不到你们的对话历史）；',
          '- `context`：**只给相关背景**（关键数据/路径/URL/约束）。别粘贴整段历史 —— 无关信息会分散它的注意力；',
          '- `tools`：**只开需要的工具**（支持 `browser_*` 这类通配）。★ 只能是**你已挂载工具的子集**，多要会被拒绝并告诉你原因；',
          '- `platformId`/`modelId`：可选。简单活用轻量模型更划算（可先 `list_models` 查）。',
          '',
          `'它返回一段结构化结论（做了什么 / 关键结果 / 未完成部分），你据此继续。',`,
        ].join('\n'),
      );
    }

    // Skills 描述 + 流程指引：agent ∪ 会话挂载
    //
    // ★ 两级注入（用户 2026-09-28 诉求「发现没有对应 skill 会去下载？」的配套改造）：
    //   · **命中触发词**（triggers 与当前输入有交集）→ 注入完整 body（流程指引），模型照做；
    //   · **未命中** → 只注入 name+description（"我有这个技能，需要时可让我用"）。
    //   此前是**无差别全量注入 body**（每个截断 2000 字）：挂 8 个 skill ≈ 硬塞 16000 字，
    //   既把上下文预算吃光、又让模型在无关流程上分心 —— 而 `triggers` 字段**后端从未被消费**。
    const agentSkillIds: string[] = agent?.skill_ids ? JSON.parse(agent.skill_ids) : [];
    const skillIds = [...new Set([...agentSkillIds, ...convMounts.skillIds])];
    // 项目技能目录（.yan-zhi/skills 下的 .md，P2-8）：优先级**高于**同名挂载技能 ——
    // 项目自带的 SOP 是团队为这个仓库定制的，比通用/商城技能更贴近当前工作区。
    const projectSkills = effectiveWorkspaceDir ? loadProjectSkills(effectiveWorkspaceDir) : [];
    const projectSkillNames = new Set(projectSkills.map((s) => s.name.toLowerCase()));
    if (skillIds.length > 0 || projectSkills.length > 0) {
      const userQuery = String(opts?.userContent || '');
      const skillLines: string[] = [];
      const flowParts: string[] = [];
      for (const skId of skillIds) {
        const sk = db.prepare('SELECT name, description, body, triggers_json, enabled, files_json FROM skill WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(skId, userId) as any;
        if (!sk || !sk.enabled) continue;
        // 项目技能目录里有同名技能 → 跳过 DB 版（项目 SOP 覆盖通用技能）
        if (projectSkillNames.has(String(sk.name || '').toLowerCase())) continue;
        let triggers: string[] = [];
        try { triggers = JSON.parse(sk.triggers_json || '[]'); } catch { triggers = []; }
        const hit = matchSkillTriggers(triggers, userQuery);
        skillLines.push(`- **${sk.name}**: ${sk.description || ''}${hit ? ' ← **本次命中，按它的流程执行**' : ''}`);
        // 命中 → 注入完整流程；未命中 → 不注入 body（省预算，也避免模型被无关流程带偏）。
        // 用户输入为空（定时任务/IM 无正文）时退化为全量注入：没有触发词可判，宁多勿漏。
        const shouldInjectBody = hit || !userQuery.trim();
        // ★ 截断走 truncateSkillBody 单点（口径/文案与项目技能共用）——此前内联 2000
        //   与项目技能各自的常量/文案已出现半角-全角漂移，不再各写一份。
        const body = truncateSkillBody(sk.body || '');
        if (body && shouldInjectBody) {
          // ★ 子目录文件落盘（2026-10-06）：skill 支持层级目录（references/ 等），
          //   DB files_json 是真相源，这里同步到 <工作目录>/.yan-zhi/skills/<名>/，
          //   模型按 SKILL.md 里的引用用 file_read 按需读取（幂等：内容一致跳过写）。
          const refFiles = parseSkillFiles(sk.files_json);
          logger.info(`[skill-files] 注入 ${sk.name}: files=${refFiles.length} ws=${effectiveWorkspaceDir}`);
          if (effectiveWorkspaceDir) syncSkillsToWorkspace(effectiveWorkspaceDir, [{ name: sk.name, body: sk.body || '', filesJson: sk.files_json }]);
          const refNote = refFiles.length
            ? `\n> 📁 参考资料（按需 file_read，别一次全读）：<工作目录>/.yan-zhi/skills/${skillDirName(sk.name)}/ 下的 ${refFiles.map((f) => f.path).join('、')}`
            : '';
          flowParts.push(`### Skill 流程指引：${sk.name}\n${body}${refNote}`);
        }
      }
      // 项目技能（.yan-zhi/skills 下的 .md）：与 DB skill 同一份注入格式与触发词口径，
      // 仅多一个来源标注（让模型知道可以从工作目录直接读到完整文件）。
      for (const ps of projectSkills) {
        const hit = matchSkillTriggers(ps.triggers, userQuery);
        skillLines.push(`- **${ps.name}**（项目技能，来自 ${ps.source}）: ${ps.description || ''}${hit ? ' ← **本次命中，按它的流程执行**' : ''}`);
        if (ps.body && (hit || !userQuery.trim())) {
          flowParts.push(`### Skill 流程指引：${ps.name}\n${ps.body}`);
        }
      }
      if (skillLines.length > 0) parts.push('---\n## 可用 Skills\n' + skillLines.join('\n'));
      // 缺技能时的"自己去找"指引：让模型知道没有对应方法论时可以先去商城找装，
      // 而不是硬编一套流程或干脆放弃（`api_marketplace_browse` / `api_skill_install` 已挂载）。
      parts.push(
        '---\n## 技能缺失时的处理\n' +
        '做任务前先看上面的「可用 Skills」：若任务的**方法论/规范**明显缺失（例如要做某领域的专项评审、' +
        '某类文档的固定格式、某平台的接口约定，但没有任何 Skill 覆盖），按这个顺序处理：\n' +
        '1. 先用 `api_marketplace_sources` + `api_marketplace_browse` 去商城搜有没有现成 Skill；\n' +
        '2. 找到匹配的用 `api_skill_install` 装上，再用 `api_conversation_setup` 把它挂到当前会话（下轮生效）；\n' +
        '3. 商城没有、但这类工作你会反复做 → 用 `api_skill_create` 把这次的做法沉淀成本地 Skill（含 triggers），下次自动命中；\n' +
        '3.5. 团队级规范（整个项目都会用到的评审/部署/接口约定）→ 建议让用户放进工作目录 `.yan-zhi/skills`（放 .md 文件，自动发现，所有会话生效，优先级高于商城技能）；\n' +
        '4. 都没有且不值得沉淀 → 按通用最佳实践做，并在回复里说明"这一步没有专门规范，我按 X 处理"。\n' +
        '不要因为"没有对应 Skill"就降低产出质量或停下来问用户。',
      );
      // ★★ 当前会话身份：模型得知道自己"现在是谁、挂了什么、在哪个模式"。
      //   不注入的后果（2026-09-27 用户要求「智能体可以自己设置当前会话的智能体和 skill 和工作流程」）：
      //     · 用户问"你现在是什么智能体" → 模型只能照系统提示词猜，答不出会话里实际挂的 agent；
      //     · 模型用 api_conversation_setup 换了智能体后，**自己不知道已经换了**，
      //       下一轮仍按旧身份说话（换了等于没换）。
      //   放在 Skills 之后：先给"我是谁"，再给"我有哪些技能与流程"。
      const sessionIdentity: string[] = [];
      const sidForIdentity = opts?.conversationId || '';
      if (agentId) {
        // 该作用域此前只查了 system_prompt/type，名字要另取（用于"你现在是谁"）
        const idRow = db.prepare('SELECT name FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
        if (idRow?.name) sessionIdentity.push(`- 当前智能体：**${idRow.name}**（${agentId}）`);
      }
      if (convMounts.skillIds.length > 0) {
        const convSkillNames = convMounts.skillIds
          .map((id) => (db.prepare('SELECT name FROM skill WHERE id = ?').get(id) as any)?.name || id)
          .filter(Boolean);
        sessionIdentity.push(`- 本会话额外挂载的技能：${convSkillNames.join('、')}`);
      }
      if (sidForIdentity) {
        const convMode = (db.prepare('SELECT mode FROM conversation WHERE id = ?').get(sidForIdentity) as any)?.mode;
        if (convMode) sessionIdentity.push(`- 工作模式：${convMode === 'wf' ? '工作流模式' : convMode}`);
      }
      if (sessionIdentity.length > 0) {
        parts.push(
          '---\n## 当前会话身份（回答"你是谁/你挂了什么"时按这里说，不要凭系统提示词猜）\n' +
          sessionIdentity.join('\n') +
          '\n\n用户要求你换身份 / 改技能 / 切模式时，用 api_conversation_setup 直接落地（默认作用于当前会话），改完如实告知已生效。',
        );
      }
      if (flowParts.length > 0) {
        parts.push('---\n## 当前任务流程指引（按 Skill 流程执行：该 ask_user 时 ask_user，该委派 pageAgent 时委派 pageAgent 并在 input 中传入流程要求）\n' + flowParts.join('\n\n'));
      }
    }

    // 文件产出分类规范
    if (isHarness) {
      parts.push([
        '---',
        '## 文件产出分类规范',
        '你可通过 file_write 工具产出文件，必须用 category 参数正确分类：',
        '- category="deliverable"：最终交付给用户的成果（报告、最终文档、生成的源代码、数据导出、图片成品等用户会直接使用或保存的文件）。',
        '- category="intermediate"：过程性中间产物（调试输出、临时草稿、中间计算结果、将被后续步骤覆盖或删除的临时文件）。',
        '规则：凡是用户最终想要的结果文件，必须显式传 category="deliverable"；只有过程性临时文件才用 intermediate。不要省略 category，也不要把交付物误标为 intermediate。',
      ].join('\n'));
    }
  } else {
    // 无 agent：会话级系统提示词仍然生效
    if (convMounts.systemPrompt) basePrompt = convMounts.systemPrompt;
  }
  if (basePrompt) parts.unshift(basePrompt);

  // 工作目录：优先使用请求显式下发的 workspaceDir，回退到全局 serverState.workspaceDir
  if (effectiveWorkspaceDir && effectiveWorkspaceDir.trim()) {
    parts.push(`---\n## 工作目录\n当前工作目录：${effectiveWorkspaceDir}`);
  }

  // ★★★ 项目规则文件（AGENTS.md）—— 对齐 WorkBuddy / Trae 的「项目规则」能力。
  //
  // 为什么补（2026-09-29）：此前 `grep AGENTS.md` 在 apps/server + packages **零命中** ——
  //   用户在项目里写好的规则（编码规范、目录约定、禁止事项）模型完全看不到，
  //   每次都得在会话里重复交代，或写进 appGuide 变成全局污染。
  //
  // 读取范围（按优先级，先读到的先注入）：
  //   1) <workspaceDir>/AGENTS.md
  //   2) <workspaceDir>/.yan-zhi/rules/ 下的 .md   （本项目的约定目录，可放多条规则）
  // 只读工作目录根一层（不做递归）：递归扫全仓库既慢又会把 node_modules 里的说明文档吸进来。
  if (effectiveWorkspaceDir && effectiveWorkspaceDir.trim()) {
    try {
      const rules = loadProjectRules(effectiveWorkspaceDir);
      if (rules.length) {
        parts.push([
          '---',
          '## 项目规则（自动读取自工作目录，优先级高于默认行为）',
          '> 以下是本项目**用户自己写下的规则**。与默认做法冲突时以本节为准；',
          '> 若某条规则与用户当前明确要求冲突，以用户当前要求为准并说明你偏离了哪条规则。',
          '',
          ...rules.map((r) => `### ${r.source}\n${r.content}`),
        ].join('\n'));
      }
    } catch { /* 规则读取失败不影响任务（缺文件是常态） */ }
  }

  // ★★★ 开发模式（/code，绑定代码编写助手）专属：工程记忆的读写约定。
  //
  // 为什么单独加（2026-09-29，对齐 CodeBuddy 的"项目长期记忆"）：
  //   开发场景真正需要被记住的不是"流水账"，而是**工程事实**——
  //   项目结构、构建/测试/启动命令、包管理器、代码风格约定、已知的坑。
  //   这些每轮重新探索一遍会白白烧掉大量步数（长任务里尤其致命）。
  //   把「往哪写、什么时候读、写什么」讲清楚，工程记忆才会真正积累起来。
  if (agentId === 'a_builtin_code_agent') {
    parts.push([
      '---',
      '## 工程记忆（本模式专属）',
      '你有一个随空间/工作目录共享的长期记忆（`api_space_memory_read` / `api_space_memory_append`）。',
      '**开工前先读它**：若里面有本项目的工程记忆，直接采用，不要重新探索；与当前代码冲突时以代码为准并更新记忆。',
      '**收尾时写它**（只写"下次还用得上"的，一条一行，简洁）：',
      '- 项目结构：语言/框架/构建工具/包管理器（一句话）',
      '- 关键命令：构建、测试、启动、lint（写实际可用的完整命令）',
      '- 约定：目录分层、命名、错误处理与横切能力的接入位置（认证/日志/异常在哪）',
      '- 已知坑：踩过的坑与规避方式（**这条最有价值，务必写**）',
      '不要写：本次改了哪些文件的流水账（那属于任务计划与交付报告，不属于工程记忆）。',
    ].join('\n'));
  }

  // 产物目录规范：直接把解析好的目录交给模型，省掉模型自己拼「日期-任务名」的出错空间。
  // 与文件产出分类规范（category）配套：category 决定落在哪个目录。
  {
    const convId = opts?.conversationId || '';
    const uploadDir = resolveArtifactDirFor({ conversationId: convId, category: 'upload' }).dir;
    const intermediateDir = resolveArtifactDirFor({ conversationId: convId, category: 'intermediate' }).dir;
    const deliverableDir = resolveArtifactDirFor({ conversationId: convId, category: 'deliverable' }).dir;
    parts.push([
      '---',
      '## 产物目录',
      '所有产出按分类归档，file_write 的 path 必须写在下面对应目录内（不要写到工作目录根、临时目录或其他位置）：',
      `- 用户上传文件目录：${uploadDir}`,
      `- 中间产物目录：${intermediateDir}`,
      `- 交付文件目录：${deliverableDir}`,
      '需与 category 参数保持一致：category="deliverable" 写交付目录，category="intermediate" 写中间目录。',
      '界面已内置「导出 Word」：把回复正文（markdown，含图片）直接转成 .docx，因此不需要自己用 python_exec 生成 Word 文件；',
      '需要交付 Word 时，把内容写成规范的 markdown 正文（图片用 ![](url)）即可。',
    ].join('\n'));
  }

  // ★★★ 浏览器页面收拾（2026-10-08 用户诉求「pageAgent 执行完了不会关闭页面？」）
  //
  // 问题：任务收尾时**不动任何页面**，agent 开的中间页全留在右侧面板里 ——
  //   用户既不知道"这些是 agent 留的、可以关"，也分不清哪些还有用。
  // 取向（用户拍板）：**不写死自动关**，而是把"收拾页面"变成模型收尾时的**明确动作** ——
  //   它知道任务完成没完成、哪些页是交付物（该留）、哪些是中间过程（该关）。
  //
  // ★ 权限边界（安全，必须写清，因为执行侧也已强制）：
  //   agent **只能关闭自己打开的**标签页。用户手动打开的页面关不掉，主进程会直接拒绝
  //   （见 main.cjs close_tab 的 agentOpened 闸门）。所以这里必须讲清"别去关用户的页"，
  //   否则模型会反复尝试、白烧步数。
  if (opts?.includeUiTools) {
    parts.push([
      '---',
      '## 浏览器页面收拾（收尾必做）',
      '你在任务中打开过网页时，**收尾前**要主动收拾页面，不要把一堆中间页留在用户的面板里。',
      '做法：',
      '1. 先 `browser_get_tabs` 看有哪些标签页（返回里 `agentOpened: true` 的是**你打开的**，可以关）。',
      '2. 用 `browser_close_tab` 的 `tabIds` 参数**一次关掉**那些"已完成使命的中间页"（搜索结果页、登录页、跳转中转页、你看完就够了的页）。',
      '3. **保留**该给用户看的页：最终成果页（报告/商品/订单/发布结果等用户会想接着看或操作的页），并在总结里说明"已为你保留 XX 页面"。',
      '',
      '★ 权限边界：你**只能关闭自己打开的**标签页（`agentOpened: true`）。用户手动打开的页面关不掉，'
        + '尝试关闭会被拒绝 —— 不要去关它们，也不要在被拒后反复重试。',
      '★ 若任务还没跑完（还要继续操作同一个页面），不要提前关闭它。',
    ].join('\n'));
  }

  // ★★★ 当前任务计划（接力棒）—— 用户 2026-09-28 诉求「根据整理的记忆继续任务，不要一直断」。
  //
  // 为什么必须有：`conversation.task_plan_json` 一直**落盘但从不回注**（前端 task_plan/task_step
  // 写进去，后端提示词里一个字节都没有，`grep -c taskPlan llm-task-manager.ts` = 0）。
  // 后果：模型从空间记忆里知道"上一批做到第 3 章"，却看不到"原计划还剩第 4-10 章"，
  // 于是要么从头再来、要么乱做 —— 这正是长任务"断"的技术根因。
  //
  // 与空间记忆的分工：空间 MEMORY.md 说"做过什么"（流水），本节说"原本计划做什么、还剩什么"（结构）。
  {
    const plan = loadTaskPlan(opts?.conversationId);
    if (plan) {
      const done = plan.steps.filter((s) => s.status === 'done').length;
      const lines = plan.steps.map((s, i) => {
        const mark = s.status === 'done' ? '[x]' : s.status === 'running' ? '[~]' : '[ ]';
        return `${i + 1}. ${mark} ${s.title}${s.note ? ` —— ${s.note}` : ''}`;
      });
      const remaining = plan.steps.length - done;
      parts.push([
        '---',
        `## 当前任务计划（接力棒${plan.title ? `：${plan.title}` : ''}）`,
        `进度：${done}/${plan.steps.length} 步已完成${remaining > 0 ? `，还剩 ${remaining} 步` : '（已全部完成）'}`,
        lines.join('\n'),
        '',
        '★ 用法（长任务接力规则）：',
        '- 这份计划是**同一任务跨轮次的接力棒**。开工前先看它，按未完成（[ ]/[~]）的步骤接着做。',
        '- **不要重做已完成（[x]）的步骤**；也不要因为"上下文里没有前面的过程"就从头再来 ——',
        '  已完成步骤的结论可从「空间记忆」与产物文件中获取。',
        '- 每完成一步，用 task_step 把该步标记为 done（保持这份计划与实际进度一致，供下一批接力）。',
        '- 计划与用户最新要求冲突时以用户为准，并用 task_plan 更新计划（而不是默默偏离）。',
      ].join('\n'));
    }
  }

  // 长任务编排协议（2026-10-08，2026-10-09 修正为**两条路径**）。
  // ★★ 修正原因（用户指出）：此前把"编排"写成"优先 plan_tasks、不要串行 call_agent"，等于低估了
  //   `call_agent` —— 而 call_agent **同样能编排**：① 它就在主循环并发白名单里（同一轮发多个
  //   call_agent → 真并发）；② 它走的就是 runSubAgent 包装版，**工件协议一样生效**。
  //   所以"没有 plan_tasks 就不能并行编排"是错的 —— 两条路径都要写清楚。
  // ★ 权限感知（2026-10-09）：只读会话委派/编排工具已被裁掉 → 注入不矛盾的说明而非空头指令。
  const canDelegate = opts?.canDelegate !== false;
  if (canDelegate) {
    parts.push(
      [
        '---',
        '## 长任务的编排（两条路径，按需选）',
        '子智能体有两个用途截然不同的入口，**都支持并行**：',
        '',
        '**路径一：`call_agent`（你自己充当调度器）**',
        '- 你亲手安排任务、自己读结果、自己决定下一步 —— 适合步骤不多、需要边走边看结果调整的活。',
        '- **并行**：把多个互相独立、不依赖彼此结果的 `call_agent` **放在同一轮里一起发出**，会被并发执行（默认上限 2，超出的按序执行），比一个个等快得多。',
        '- 例：同时委派 A 查资料、B 写初稿（两者互不依赖）→ 同一轮发两个 call_agent。',
        '- 需要"先把活派下来、不等它、继续干别的"时，用 `call_agent` 的 `async:true`（后台跑，完成后结果注入本会话）。',
        '',
        '**路径二：`plan_tasks`（交给调度器）**',
        '- 当任务步骤多、依赖关系明确、或你想把"选模型/重试/失败重派"交给调度器统一兜底时用它 —— 一次提交整张 DAG。',
        '- **无依赖的任务 = 并行**：同一批提交、不写 `dependsOn`，调度器并发跑（默认上限 4）；',
        '- **有依赖的**用 `dependsOn:["上游id"]`；下游指令里引用上游产物写 `{{artifact:上游id}}` 或 `{{artifact:LAST}}`（调度器替换成真实文件路径）；',
        '- **按任务特质选模型**：机械活（格式转换/分词/取数）在任务项里指定 `modelId` 用小模型省配额，难的用强模型；抓取类把 `maxSteps` 设小（如 10）避免跑飞。',
        '- 失败会自动重试 2 次；仍失败在返回汇总里列出（附原因）→ 用 `reassign_task` **换执行者/改指令/调步数** 重派（不要原样重试）。',
        '- **`plan_tasks` 是同步阻塞的**：你会一等到底拿到「完成/失败汇总」，计划内部仍并行；不需要轮询、不要重复提交。',
        '',
        '**共同点（关键）**：无论走哪条路，子智能体产出的大文件**都不会回到你的上下文** —— 只回报「结论摘要 + 文件路径」。你据此推进即可，需要细节时用 `file_read` 按路径读。',
        '**怎么选**：步骤少 / 要亲手调度 / 边走边看 → `call_agent`（记得同轮并发）；步骤多 / 依赖复杂 / 要自动重试重派 → `plan_tasks`。执行者用 `list_sub_agents` 查，缺合适的可用 `spawn_subagent` 现场定制。',
      ].join('\n'),
    );
  } else {
    parts.push(
      [
        '---',
        '## 长任务的规划方式（当前会话为只读权限）',
        '当前会话是**只读权限**：委派/编排类工具（`plan_tasks` / `reassign_task` / `call_agent`）已禁用，你也不能写文件或执行命令。',
        '因此长任务**不要**尝试编排并行子智能体，改为：把任务拆成清晰的编号分步计划并逐项推进，能读就查证、能算就演算；',
        '凡需要写入、执行或委派的步骤，直接告诉用户「这一步需要放开权限」并说明原因，**不要反复尝试被禁用/被拒的工具**。',
      ].join('\n'),
    );
  }

  // ★★★ 2026-10-09 删（D1，成本修复，重要）：
  //   此前这里 `parts.push('---\n当前时间：' + new Date().toLocaleString('zh-CN'))`。
  //   它拼接在 system prompt 的**最尾部**，且**每次构建必变**（精确到秒的本地时间字符串）。
  //
  //   ★ 为什么这是成本杀手：Anthropic 前缀缓存（client.ts:120-130 的 cache_control 断点）
  //     要求被缓存的前缀**逐字节稳定**；OpenAI 的自动缓存同理。而 system prompt 是在
  //     `buildSystemPromptForBackend` 里每次**新任务**重建的（任务内复用，跨任务不复用）
  //     → 时间戳一变，**跨任务的前缀缓存 100% 失效**。
  //     长任务（200 步循环）里每步都要重发 system + 历史，缓存失效意味着**首段全价计费**，
  //     这是数量级的成本差距（Anthropic 缓存命中价约为原价的 1/10）。
  //
  //   ★ 为什么可以安全删除：模型**不需要**知道精确到秒的当前时间——
  //     · 需要日期的场景（"今天几号"）由用户提问时自带，或走工具查询；
  //     · system prompt 里没有任何逻辑依赖这个时间戳（全仓 grep 仅此一处拼接）。
  //
  //   ⇒ 结论：删掉它，让 system prompt 的**尾部稳定**。这是"稳定前缀/变动尾部"原则的
  //     最小落地（进一步把记忆/计划等变动段彻底后置是后续优化，见方案文档 D1）。
  //
  //   ★ 副作用补救：若确实需要时间感知，应放在**首条 user 消息**（不参与前缀缓存），
  //     而不是 system prompt 尾部。当前没有这种需求，故不引入。

  return parts.join('\n\n');
}

/** 读会话任务计划（供提示词回注 / 自动接力判定）。读不到或结构非法返回 null。
 *  结构由前端 stores/chat.ts 的 persistPlan 写入：`{ title?, steps: [{ title, status, note? }] }`。
 *  ★ 跨会话回退（2026-09-30）：会话行没有计划时读工作目录 plan.md（新会话接续上一会话的长任务）。
 *    顺序：会话计划优先（本会话实时进度最新）→ 文件计划（跨会话共享，task_step 每步镜像）。 */
function loadTaskPlan(conversationId?: string | null): { title: string; steps: Array<{ title: string; status: string; note?: string }> } | null {
  if (!conversationId) return null;
  try {
    const row = db.prepare('SELECT task_plan_json FROM conversation WHERE id = ?').get(conversationId) as
      | { task_plan_json?: string | null }
      | undefined;
    if (row?.task_plan_json) {
      const raw = JSON.parse(row.task_plan_json);
      const steps: any[] = Array.isArray(raw?.steps) ? raw.steps : [];
      if (steps.length) {
        return {
          title: String(raw?.title || ''),
          steps: steps.map((s) => ({
            title: String(s?.title || s?.description || '(未命名步骤)'),
            status: String(s?.status || 'pending'),
            note: s?.note ? String(s.note) : undefined,
          })),
        };
      }
    }
  } catch { /* 库读取失败继续走文件回退 */ }
  // 文件回退：工作目录 .yan-zhi/task-memory/plan.md（task_plan/task_step 每次更新都镜像写入）
  const fromFile = loadTaskPlanFromFile(conversationId);
  if (!fromFile?.steps?.length) return null;
  return {
    title: String(fromFile.title || ''),
    steps: fromFile.steps.map((s) => ({
      title: String(s?.title || '(未命名步骤)'),
      status: String(s?.status || 'pending'),
      note: s?.note ? String(s.note) : undefined,
    })),
  };
}

/**
 * 读工作目录下的项目规则文件（对齐 WorkBuddy / Trae 的「项目规则」）。
 *
 * 读取位置（只读根一层，**不递归** —— 递归扫全仓库既慢又会把 node_modules 里的
 * README 吸进来）：
 *   1) `<dir>/AGENTS.md`（跨工具事实标准，与 CodeBuddy/Claude 生态一致）
 *   2) `<dir>/.yan-zhi/rules/ 下的 .md`（本项目自己的约定目录，可放多条）
 *
 * ⚠️ 避坑：下面注释里不要写「星号紧跟斜杠」那个两字符序列（会被当块注释结束符）——
 *   本文件踩过一次：规则段的字符串被整段吞进注释，表现是"代码写了却不生效"。
 * ⚠️ 避坑：下面注释里不要写「星号紧跟斜杠」那个两字符序列（会被当块注释结束符）——
 *   本文件踩过一次：规则段的字符串被整段吞进注释，表现是"代码写了却不生效"。
 * ★ mtime 缓存：提示词构建在**每一轮 ReAct 都会跑**，每次都 readdir+stat+readFile 是浪费；
 *   按「目录 + 各文件 mtime」做指纹，没变就复用上次结果。
 * ★ 长度上限：单文件 8000 字符（超长截断并注明），总上限 20000 —— 规则不该吃掉提示词预算。
 * ★ 读不到文件是**常态**（多数项目没有 AGENTS.md），所以静默返回空数组，不报错不打扰。
 */
// ★ 指纹缓存：唯一实现在 services/fs-fingerprint.ts（project-skills 共用同一套）。
const PROJECT_RULES_CACHE = makeFingerprintCache<Array<{ source: string; content: string }>>();
const RULE_FILE_MAX_CHARS = 8000;
const RULE_TOTAL_MAX_CHARS = 20000;

function loadProjectRules(workspaceDir: string): Array<{ source: string; content: string }> {
  const candidates: Array<{ source: string; path: string }> = [];
  // ① AGENTS.md（根）
  candidates.push({ source: 'AGENTS.md', path: path.join(workspaceDir, 'AGENTS.md') });
  // ② .yan-zhi/rules/ 下的 .md
  try {
    const rulesDir = path.join(workspaceDir, '.yan-zhi', 'rules');
    if (existsSync(rulesDir) && statSync(rulesDir).isDirectory()) {
      for (const f of readdirSync(rulesDir).filter((n) => n.toLowerCase().endsWith('.md')).sort()) {
        candidates.push({ source: `.yan-zhi/rules/${f}`, path: path.join(rulesDir, f) });
      }
    }
  } catch { /* rules 目录不存在/不可读，正常 */ }

  // 指纹：存在的文件 + 各自 mtime + size（变了才重读）
  const existing = candidates.filter((c) => { try { return statSync(c.path).isFile(); } catch { return false; } });
  if (!existing.length) return [];
  const fingerprint = dirEntryFingerprint(existing.map((c) => ({ key: c.path, path: c.path })));
  return PROJECT_RULES_CACHE.get(workspaceDir, fingerprint, () => {
    const rules: Array<{ source: string; content: string }> = [];
    let total = 0;
    for (const c of existing) {
      try {
        let text = readFileSync(c.path, 'utf-8').trim();
        if (!text) continue;
        if (text.length > RULE_FILE_MAX_CHARS) {
          text = `${text.slice(0, RULE_FILE_MAX_CHARS)}\n\n…（该规则文件过长已截断，完整内容可直接读 ${c.source}）`;
        }
        if (total + text.length > RULE_TOTAL_MAX_CHARS) {
          rules.push({ source: c.source, content: '（规则总量已达上限，此文件未注入；需要时请模型自行 file_read 读取）' });
          break;
        }
        total += text.length;
        rules.push({ source: c.source, content: text });
      } catch { /* 单文件读失败跳过 */ }
    }
    return rules;
  });
}

/** JSON Schema → 参数清单（与前端 formatToolParamsBlock 同一格式） */
function formatSchemaParams(schema: any): string {
  const props = schema?.properties || {};
  const req: string[] = schema?.required || [];
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  const lines = entries.map(([k, v]: [string, any]) =>
    `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v?.description || v?.type || ''}`
  );
  return '\n  参数：\n' + lines.join('\n');
}

/**
 * Skill 触发词匹配（大小写不敏感的子串命中）。
 *
 * 为什么要它：`skill.triggers_json` 字段一直存在、前端也写了，但**后端注入时从未消费**
 * （此前是无差别把每个已挂 skill 的 body 全量拼进提示词）→ 触发词形同虚设，
 * 而且挂多了会把上下文预算吃光（每个截断 2000 字）。
 *
 * 命中判定刻意宽松（子串即可）：宁可在"可能相关"时多注入一份流程指引，
 * 也不要在用户明确说了触发词时漏掉 —— 漏掉的代价是模型不按流程做，用户侧感受更差。
 */
function matchSkillTriggers(triggers: string[], query: string): boolean {
  const q = String(query || '').toLowerCase();
  if (!q.trim()) return false;
  for (const t of triggers || []) {
    const kw = String(t || '').trim().toLowerCase();
    if (kw && q.includes(kw)) return true;
  }
  return false;
}

/** 自定义工具描述行：agentId 给定时按 agent.custom_tool_ids 过滤（与前端挂载规则一致），否则全量（无人值守兜底） */
function buildCustomToolDescLines(agentId: string | null, userId: string, includeUiTools: boolean, convCustomToolIds: string[] = []): string[] {
  const allowed: string[] | null = (() => {
    if (!agentId) return null;
    const agent = db.prepare('SELECT custom_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { const ids = JSON.parse(agent?.custom_tool_ids || '[]'); return Array.isArray(ids) ? ids : []; } catch { return []; }
  })();
  const rows = db.prepare('SELECT id, name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId) as any[];
  const lines: string[] = [];
  for (const ct of rows) {
    const viaAgent = !allowed || allowed.includes(ct.id);
    const viaConv = convCustomToolIds.includes(ct.id);
    if (!viaAgent && !viaConv) continue;
    const exposedName = 'custom_' + (ct.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + ct.name;
    lines.push(`- \`${exposedName}\`: ${ct.description || ct.name}${formatSchemaParams(ct.input_schema_json ? JSON.parse(ct.input_schema_json) : null)}`);
  }
  return lines;
}

/** 从 DB 加载 agent + 会话挂载，构建工具 schema（三条入口共用的单一事实来源，与前端 getMergedMounts 同规则）。
 *  opts.includeUiTools：交互式任务（前端在线）纳入 UI 工具；定时/IM 等无人值守任务排除。 */
export function buildToolsForBackend(agentId: string | null, userId: string, opts?: {
  conversationId?: string | null;
  includeUiTools?: boolean;
  /** P2-1 动态工具路由：任务文本（无则不裁，见 services/tool-router.ts） */
  userContent?: string;
}): any[] {
  ensureToolsInitialized();
  const registry = getToolRegistry();
  const tools: any[] = [];
  const seen = new Set<string>();
  const convMounts = loadConversationMounts(opts?.conversationId);
  const includeUiTools = !!opts?.includeUiTools;
  const skipUi = (name: string) => !includeUiTools && UI_TOOL_NAMES.has(name);

  // 1) 内置工具：agent 挂载 ∪ 会话级挂载
  let toolIds: string[] = [];
  if (agentId) {
    const agent = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    toolIds = agent?.builtin_tool_ids ? JSON.parse(agent.builtin_tool_ids) : [];
  }
  toolIds = [...new Set([...toolIds, ...convMounts.builtinToolIds])];
  for (const name of toolIds) {
    if (skipUi(name)) continue;
    if (!registry.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const def = registry.get(name)!;
    tools.push({
      type: 'function',
      function: { name, description: def.description, parameters: def.inputSchema },
    });
  }

  // 无 agent 且无会话挂载时兜底：暴露所有非 UI 内置工具
  if (tools.length === 0 && !agentId && convMounts.builtinToolIds.length === 0) {
    for (const name of registry.names()) {
      if (skipUi(name)) continue;
      if (name.startsWith('plugin_')) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const def = registry.get(name)!;
      tools.push({
        type: 'function',
        function: { name, description: def.description, parameters: def.inputSchema },
      });
    }
  }

  // 1.5) 多智能体编排工具（2026-10-08）：无条件暴露 —— 长任务规划是主智能体的通用能力，
  //      不随挂载变化（子智能体侧由 runSubAgent 的工具裁剪 + depth>=1 拦截双重排除）。
  for (const name of ['plan_tasks', 'get_plan_status', 'reassign_task']) {
    if (seen.has(name) || !registry.has(name)) continue;
    const def = registry.get(name)!;
    seen.add(name);
    tools.push({
      type: 'function',
      function: { name, description: def.description, parameters: def.inputSchema },
    });
  }

  // 2) MCP 工具：agent.mcp_tool_mounts ∪ 会话级挂载（agent '*' 覆盖会话细粒度），暴露名与执行路由一致
  const agentMcpMounts: any[] = (() => {
    if (!agentId) return [];
    const agent = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { return JSON.parse(agent?.mcp_tool_mounts || '[]'); } catch { return []; }
  })();
  const mergedMcp = mergeMcpMounts(agentMcpMounts, convMounts.mcpMounts);
  const toolsByServer = new Map<string, any[]>();
  const toolsOf = (sid: string) => {
    if (!toolsByServer.has(sid)) toolsByServer.set(sid, getToolsFromDb(sid));
    return toolsByServer.get(sid)!;
  };
  for (const m of mergedMcp) {
    const shortId = mcpShortIdOf(m.serverId);
    if (!shortId) continue;
    const serverTools = m.toolName === '*'
      ? toolsOf(m.serverId).filter((t: any) => t.enabled !== false)
      : toolsOf(m.serverId).filter((t: any) => t.name === m.toolName && t.enabled !== false);
    for (const t of serverTools) {
      const exposedName = `mcp_${shortId}__${t.name}`;
      if (seen.has(exposedName)) continue;
      seen.add(exposedName);
      tools.push({
        type: 'function',
        function: {
          name: exposedName,
          description: t.alias || t.description || t.name,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }

  // 3) API 工具（后端直查类：记忆/知识库/数据查询，后端直接执行）
  // 固定暴露记忆四件套 + 知识库两个通用工具；其余 api_*（如 api_data_query）按 agent 挂载 + 会话挂载动态暴露，
  // 保证「挂载即可调用」与「没挂就不占上下文」。
  const apiRegistry = getApiToolRegistry();
  const alwaysApiTools = [
    'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
    'api_kb_search', 'api_kb_list',
    // 语义代码检索（P1，2026-10-03）：只读、有工作目录才有意义，默认暴露给所有智能体
    //（mountedApiTools 非空时本组被整组替换 —— 挂载了专属 api 工具链的智能体按需自行加挂）
    'api_code_semantic_search',
    // 精确跳转定义（P2-5，tsserver）：只读、re-export 场景补 AST 的短板，默认暴露
    'api_code_definition',
    // AI 媒体生成：文生图/文生视频（agnes 平台专用端点），默认暴露让所有智能体都能直接出图/出片
    'api_image_generate', 'api_video_generate', 'api_video_status',
    // 短信验证码中继：手机上收到验证码后自动转发到本节点，默认暴露让所有智能体都能直接取用
    'api_verification_code_latest', 'api_verification_code_list',
    // 领域经验档案（自进化经验层，2026-10-09）：读=查历史坑/步骤/事实；写=当场沉淀经验。
    // 默认暴露给所有智能体 —— 自进化要求"任何任务都能记经验、都能查经验"，不随挂载变化。
    'api_experience_read', 'api_experience_write',
  ];
  const mountedApiTools = [...toolIds, ...convMounts.builtinToolIds].filter((n) => isApiExecutableTool(n));
  // 已挂载专属 api_* 工具链的（数据查询智能体等）只暴露它挂载的工具：记忆/知识库这类通用工具
  // 对它属于干扰源 —— 实测会先去搜知识库扑空、再乱调子智能体工具，最终编造答案。
  const apiToolNames = mountedApiTools.length ? mountedApiTools : alwaysApiTools;
  for (const tName of apiToolNames) {
    if (seen.has(tName)) continue;
    for (const apiTools of apiRegistry.values()) {
      const def = apiTools.find(t => t.name === tName);
      if (def) {
        seen.add(tName);
        tools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
        break;
      }
    }
  }

  // 4) 自定义工具（后端沙箱直接执行）：agent 挂载 ∪ 会话级挂载（二者取并集）
  //   ★ 会话级来源（convMounts.customToolIds）是 api_conversation_setup 写入的 —— 让模型
  //     用 api_custom_tool_create 造的工具能"只作用于当前会话"，不必改智能体全局挂载。
  const allowedCustom: string[] | null = (() => {
    if (!agentId) return null;
    const agent = db.prepare('SELECT custom_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { const ids = JSON.parse(agent?.custom_tool_ids || '[]'); return Array.isArray(ids) ? ids : []; } catch { return []; }
  })();
  const customTools = db.prepare('SELECT id, name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId) as any[];
  for (const ct of customTools) {
    const viaAgent = !allowedCustom || allowedCustom.includes(ct.id);
    const viaConv = convMounts.customToolIds.includes(ct.id);
    // agentId 为空（无人值守兜底）时全量暴露；否则 agent 白名单 ∪ 会话白名单
    if (!viaAgent && !viaConv) continue;
    const exposedName = 'custom_' + (ct.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + ct.name;
    if (seen.has(exposedName)) continue;
    seen.add(exposedName);
    tools.push({
      type: 'function',
      function: {
        name: exposedName,
        description: ct.description || ct.name,
        parameters: ct.input_schema_json ? JSON.parse(ct.input_schema_json) : { type: 'object', properties: {} },
      },
    });
  }

  // 5) call_agent + list_sub_agents（后端直接执行）
  if (!seen.has('call_agent') && registry.has('call_agent')) {
    const def = registry.get('call_agent')!;
    tools.push({ type: 'function', function: { name: 'call_agent', description: def.description, parameters: def.inputSchema } });
  }
  if (!seen.has('list_sub_agents') && registry.has('list_sub_agents')) {
    const def = registry.get('list_sub_agents')!;
    tools.push({ type: 'function', function: { name: 'list_sub_agents', description: def.description, parameters: def.inputSchema } });
  }
  // 5b) get_sub_task_detail（2026-10-09）：与 list_sub_agents 同族挂载——编排者必备，
  //     不依赖各 agent 手动挂载；子任务失败后据此查执行轨迹做根因分析。
  if (!seen.has('get_sub_task_detail') && registry.has('get_sub_task_detail')) {
    const def = registry.get('get_sub_task_detail')!;
    tools.push({ type: 'function', function: { name: 'get_sub_task_detail', description: def.description, parameters: def.inputSchema } });
  }

  // 6) ★ P2-1 动态工具路由（2026-10-07）：工具面超阈值时按任务相关性裁剪。
  //    规则与三道防线见 services/tool-router.ts；被裁工具只在本任务的工具面不可见，
  //    registry 执行面不受影响。裁剪结果打日志供「工具太多反而变笨」类问题排查。
  const routed = dynamicToolRoute(tools, opts?.userContent);
  if (routed.dropped.length) {
    logger.info(`[tool-router] 工具面 ${tools.length} > 阈值，按任务相关性裁剪 ${routed.dropped.length} 个: ${routed.dropped.join('、')}`);
  }
  return routed.tools;
}

/** 从 DB 加载 agent 的模型参数 */
export function loadAgentModelParams(agentId: string | null, userId: string): {
  temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string; maxReActSteps?: number;
} {
  if (!agentId) return {};
  const agent = db.prepare('SELECT temperature, max_tokens, top_p, config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
  if (!agent) return {};
  let config: any = {};
  try { config = JSON.parse(agent.config_json || '{}'); } catch {}
  return {
    temperature: agent.temperature,
    maxTokens: agent.max_tokens,
    topP: agent.top_p,
    reasoningEffort: config?.reasoningEffort,
    maxReActSteps: config?.maxReActSteps || DEFAULT_MAX_REACT_STEPS,
  };
}

// ────────────────────────────────────────────────────────────
// 产物登记钩子的注册（P2-3）
//
// ★ 为什么用「taskId 反查 task」的桥而不是直接传 task 给钩子：
//   钩子接口刻意不依赖 LlmTask 类型（那是本模块的内部结构），只收一个扁平的 ToolHookContext。
//   这里做一次映射，让钩子保持可独立测试（services/artifact-hooks.ts 能脱离本模块跑）。
//
// ★ 为什么放在模块末尾而不是顶部：`emit` / `tasks` 都在本文件前面定义，
//   顶层调用时若顺序颠倒会拿到 undefined（本项目踩过同类 TDZ 问题）。
registerArtifactHooks((ctx, event) => {
  try {
    const t = tasks.get(ctx.taskId);
    // 任务已结束（内存里没了）时不广播 —— 事件已无接收方，且 conversation_file 行已落库，
    // 前端下次拉列表就能看到，不会丢数据。
    if (t) emit(t, event as SSEEvent);
  } catch { /* 广播失败不影响登记（行已入库） */ }
});
