// LLM 任务管理器 —— 后端独立运行 ReAct 循环，前端通过 SSE 订阅。
// 前端构建完整系统提示词 + 工具 schema 发给后端，后端负责 LLM 编排 + 工具执行。
// 内置工具（file/cmd/browser 等）后端直接执行，刷新不中断。
// UI 交互工具（ask_user/confirm_user 等）和 MCP/自定义工具委托前端，刷新时暂停等待重连。
// 注：web_search 已移除，联网查询统一委派 pageAgent（真实浏览器搜索引擎）。
import type { Platform, Model, Message, DeltaToolCall, TokenUsageDetail, ModelPricing } from '@yan-zhi/shared';
import { formatTaskTypeContext, formatTaskTypeSpecContext, formatParentTaskTypeSpecContext, DEFAULT_CONFIRM_BATCH_SIZE, formatCostNotice, isMissingUsage, estimateTokens } from '@yan-zhi/shared';
import { LlmClient, getToolRegistry, getApiToolRegistry, ContextWindow, adviceForTruncatedArgs, runCodeDiagnostics, invalidateDiagnosticsCache, resolveToolPath, setBrowserToolConversationId, DEFAULT_SKIP_DIRS, type SummaryCache } from '@yan-zhi/core';
import { db, MESSAGE_LIST_COLS, getLatestMessageSummary, loadEffectiveTaskTypes } from './db.js';
import { resolvePool, resolveFailoverChain, resolveFirstModel, selectSubAgentModelIdPriority, SLOTS, type Slot } from './services/model-pools.js';
import { shouldRetryStatus, TOKEN_DEAD_PLATFORM_IDS_SQL } from './services/token-pool.js';
import { normalizePermissionMode, checkToolPermission, filterToolsByPermission, permissionModePrompt, checkWorkflowPermission, parseToolAuthResult, type PermissionMode } from './tool-permission.js';
// ★ 安装类资源强制确认（2026-10-22）：任何权限模式都要问，与只读授权闸分离
import { getInstaller } from './services/installer-registry.js';
import { humanBytes } from '@yan-zhi/shared';
import { ensureToolsInitialized } from './mcp/index.js';
import { executeApiTool, isApiExecutableTool } from './mcp/api-tool-executor.js';
import { getToolsFromDb, mcpShortIdOf, resolveMcpToolName, callMcpTool } from './mcp/client-manager.js';
import {
  retrieveRelevantMemories, formatMemoryContext, bumpMemoryUsage,
  writeMemoryItems, flushMemoriesBeforeCompression, parseExtractedItems, type MemoryWriteItem,
} from './services/memory-service.js';
import { loadSpaceMemoryForConversation, formatSpaceMemoryContext, appendTaskDecision, loadTaskMemoryForConversation, formatTaskMemoryContext, appendTaskProgress, readTaskProgressForConversation, formatProgressContext } from './services/space-memory.js';
// 费用账本（2026-10-17）：会话级累计 + 逐次明细的唯一写入口；阈值**只提醒不停**（D4）
import {
  recordUsage, getConversationUsage, checkAndSaveNotice, getCostBudgetConfig, summarizeByModel, resolveModelPricing,
  recordStandaloneUsage, estimateUsageDetail,
} from './services/usage-ledger.js';
import {
  resolveExperienceBase, resolveSkillDraftsDir, appendExperienceEntry, buildExperienceContextForConversation,
  listExperienceSummaries, type ExperienceKind,
} from './services/experience.js';
// 安全经验库的注入闸门：只把**人工已批准**的条目拼进安全智能体的提示词（2026-10-17）
import { isSecExperienceAgent, buildSecExperiencePromptSection } from './services/sec-experience-gate.js';
import { proposeSkillDraft, skillDraftNotifyText } from './services/skill-distill.js';
import { insertSkillDraft } from './services/skill-draft-store.js';
import { backendTaskPlan, backendTaskStep, loadPlanJson, loadTaskPlanFromFile, savePlanJson } from './services/task-plan-file.js';
import { summarizeResourceDirsSync } from './services/space-resources.js';
// 提示词快照：构建（只存 id 引用）与按需回填的唯一定义处 —— 修单会话 O(n²) 的快照膨胀
import { toSnapshotMessages, buildSnapshotSystemFields, internSnapshotBlob, pruneOldSnapshots, SNAPSHOT_KEEP_PER_CONV } from './services/context-snapshot.js';
// 上下文组装的**唯一出口**（主循环与子智能体循环共用）—— 压缩落库 + 子智能体隔离 + 预算分配
import { buildContextView, mainlineMessages } from './services/context-view.js';
import { serverState } from './state.js';
// 运维现场注入（2026-10-21）：现场信息进**系统提示词**，用户回合只留用户原话。
import { buildOpsFieldContext, type OpsContextInput, type OpsConnectionInfo, type OpsReleaseProjectInfo } from './ops-context.js';
// 产物登记钩子（P2-3）：把 file_write / 媒体登记的副作用从主循环里搬出去
import { runAfterToolHooks, runBeforeToolHooks } from './services/tool-hooks.js';
// 防失控循环闸门（2026-10-09）：同名同参重复 / 单工具连刷，在 executeTool 漏斗拦截
import { checkToolLoop, FORCE_STOP_MARKER, neutralizeForceStopMarker, noteToolOutcome } from './services/tool-loop-guard.js';
// ★★★ 浏览器执行面直连化（2026-10-10）：主进程 loopback 端点客户端。
//   判定口径**只在本模块**（decideBrowserExecution），前端不得自行推断（防双执行 + 防 token 外泄）。
import { browserBridgeAvailable, decideBrowserExecution, callBrowserBridge, toolNameToAction, bridgeMode, isBridgeTransportError } from './browser-bridge.js';
import {
  createFlowLocks, flowLockFor, flowOwnerAt, tryAcquireFlow, acquireFlow, releaseFlow, flowOwnerOf,
  BROWSER_FLOW_WAIT_MS, SHARED_FLOW, type BrowserFlowLocks,
} from './services/browser-flow-lock.js';
// 子任务执行详情（2026-10-09）：get_sub_task_detail 的查询与排版（编排者分析子任务失败用）
import { loadSubTaskTrace, formatSubTaskTrace } from './services/sub-task-detail.js';
import { registerArtifactHooks } from './services/artifact-hooks.js';
// 工件协议 + 任务计划调度（2026-10-08 多智能体协同）
import { runWithArtifactCollector, formatSubAgentReturn, collectArtifact } from './services/artifacts.js';
import { createPlan, runPlanToCompletion, getPlanStatusText, reassignPlanItem, registerPlanRunnerDeps } from './services/plan-runner.js';
import { loadProjectSkills, truncateSkillBody } from './services/project-skills.js';
import { parseSkillFiles, skillDirName, syncSkillsToWorkspace } from './services/skill-files.js';
import { dirEntryFingerprint, makeFingerprintCache } from './services/fs-fingerprint.js';
import { repoMapPromptSection, DEV_REPO_MAP_AGENT_IDS } from './services/repo-map.js';
// 超大工具输出落盘（2026-10-19）：非 file_read 的大输出全文写中间产物目录，上下文只留首尾+路径
import { spillOversizedToolOutput } from './services/tool-output-spill.js';
// 会话提示词合成（2026-10-19）：会话里存的常是建会话时的 agent 提示词快照，
// 不能让旧快照永久遮蔽 agent 表里的新提示词（见 services/conv-prompt.ts 头注释）
import { composeConversationBasePrompt } from './services/conv-prompt.js';
import {
  canStartBackgroundSubAgent, makeBackgroundId, buildBackgroundReceipt, buildConcurrencyFullMessage,
  buildFinishNote, buildDeliveryText,
  type BackgroundSubAgentInfo,
} from './services/background-subagents.js';
import { matchUserHooks, denyOnlyToolNames } from './services/user-hooks.js';
import { guessMime } from './utils/mime.js';
import { resolveArtifactDirFor, ensureArtifactDirFor } from './services/artifact-dir.js';
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
  isDangerToolAuthorized,
  authorizeDangerTool,
  commandExecutionScope,
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
import { v4 as uuid } from 'uuid';
import { createLogger } from './services/logger.js';
import { gapBetweenToolHeadAndReceipt, shouldWarnOnGap } from './services/tool-receipt-adjacency.js';
// LLM 自动生成会话标题（2026-10-11）：首个任务 completed 时 fire-and-forget；
// 本模块是「调用方」，conversation-title 反向通过 setTitleChangeNotifier 拿事件回推能力
// （避免循环依赖 —— 那边绝不 import 这里）。
import { generateTitleFor, setTitleChangeNotifier } from './services/conversation-title.js';
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
 * 背景：原 P1-9 墙钟闸「每批一份」（每批重置基线）退役后（2026-10-18，"不要程序自动停"），
 *   接力批次数成了**唯一**的批次维度上限 —— 但批次数不足以兜底失控：
 *   - 计划已被清空的会话（见 clearPlan 自毁那类的后果）里 `readPlanRemainingSteps()===0`，
 *     停滞判定会判 `noPlanTracked && expectedContinue` ⇒ **永远算"有进展"** → 停滞闸失效；
 *   - 只剩 `autoContinueHardCap = 30 批` 兜底，而每批步数上限可被用户调得很大。
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
 * ★★★ P0（2026-10-10）：判定「本轮流是否未正常收尾」—— 抽成**纯函数**便于单测钉住。
 *
 * 背景（实据，2026-10-10 20:21 用户实测）：`finish_reason`/`terminated` 标记**并非总能送达**。
 *   代理以 TCP FIN 半途关流时，core 的 `terminated` 可能既不是 `true` 也不是 `false`
 *   （未收到标记，保持默认 `true`）→ 旧判据 `terminated === false` 不成立 → 三道防线全漏：
 *     · 续写分支: 条件② `!fullContent && !fullReasoning` 被 **reasoning 非空**否定；
 *     · 可见提示: 条件 `terminated === false` 不成立；
 *     · 空回复兜底: 条件 `!fullReasoning` 被否定 + `step > 0` 在首轮不成立。
 *   ⇒ 任务带着 `content='' + reasoning 半截` 被标 `completed`，用户体感"又断了"。
 *   ★ 关键盲点：**推理模型先吐 reasoning、后吐正文**，流在 reasoning 阶段被掐时
 *     content 必为空、reasoning 必为半截 —— 旧判据恰把这种**最典型**的截断当成正常完成。
 *
 * 判据（按可靠性排序，任一成立即认为未收尾）：
 *   ① core 明确报未收尾（`terminated === false`）；
 *   ② **没有 finish_reason**（未见 finish_reason/[DONE] 就是没收尾）**且**没有产出工具调用
 *      —— 这是**主判据**：正常流必带 finish_reason（stop/length/tool_calls），不带就是被掐；
 *   ③ 无任何产出（content 与 reasoning 皆空）—— 正常流不会"一个字不吐就结束"。
 *
 * ★ 为什么②要排除「有工具调用」：带 tool_calls 的流即使被截，也交给下层按 finish_reason
 *   走参数续跑/报错，不在此整轮重来（与既有实现同口径，防误伤）。
 * ★ 为什么②要排除「有 finish_reason」：finish_reason='length' 是**正常收尾**的一种
 *   （模型自己写完了，只是撞到长度上限），交给下游 `adviceForTruncatedArgs` 处理，不整轮重发。
 *
 * @param p.terminated   core 吐出的收尾标记（true=正常/false=明确截断/未收到时默认 true）
 * @param p.finishReason 本轮末次非空 finish_reason（undefined = 从未收到）
 * @param p.hasToolCalls 本轮是否累积到工具调用
 * @param p.contentLen   本轮正文长度
 * @param p.reasoningLen 本轮推理长度
 */
export function isStreamUnterminated(p: {
  terminated: boolean;
  finishReason?: string;
  hasToolCalls: boolean;
  contentLen: number;
  reasoningLen: number;
}): boolean {
  if (p.hasToolCalls) return false;              // 交给下层按 finish_reason 处理，不整轮重来
  if (p.terminated === false) return true;       // ① 明确截断
  if (p.finishReason) return false;              // ②' 有终态 = 正常收尾（length 也是收尾）
  if (p.contentLen === 0 && p.reasoningLen === 0) return true; // ③ 空产出
  // ② 主判据：无终态 → 未收尾（含"只有半截 reasoning、无正文"这一最典型形态）
  return true;
}

/**
 * 模型调用失败是否该走「候选池故障转移」（换一个候选模型重试本轮）。
 *
 * 判据与 token 池换 Key 重试同源（token-pool.shouldRetryStatus：401/403/429/5xx），
 * 另加网络层/超时错误 —— 这些才是「上游把这个模型打趴了」的信号。
 * 反之 400/404/参数错误换模型毫无意义（换了也一样错），直接抛出走既有错误落库。
 *
 * 抽成纯函数并单测（test/model-pool-failover.test.ts）：
 *   "该换没换" = 长任务白失败；"不该换乱换" = 掩盖真因（如参数错误被当成限流反复换模型）。
 */
export function isPoolFailoverable(e: unknown): boolean {
  const err = e as any;
  const status = Number(err?.status);
  if (Number.isFinite(status) && status > 0) return shouldRetryStatus(status);
  const msg = String(err?.message || e || '').toLowerCase();
  // ★ 2026-10-14：补「鉴权 / 配额」报文判据。生产里抛的是纯 Error（无 status），
  //   `403 insufficient_user_quota`（额度耗尽）/ `401 invalid_api_key` 此前**匹配不上**下面这行
  //   ⇒ 明明该换平台/模型，却直接判为不可恢复把长任务打死（实测会话 10-13 19:07 子智能体即如此）。
  //   LlmUpstreamError 已让主路径带 status（走上面的分支）；此处是双保险，也覆盖代理/子智能体把错误改写成字符串的情况。
  return /429|rate.?limit|timeout|timed out|econn|enetunreach|eai_again|socket|network|上游|401|403|forbidden|unauthorized|insufficient_user_quota|insufficient_quota|invalid_api_key|quota|额度|欠费/.test(msg);
}

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
  // 配方一次性跑完上传→转码→填表→发布，必须给足慢档（默认未登记也走慢档，这里显式登记）
  'browser_run_recipe',
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
  /** 工具的**原始超时**（`resolveFrontendToolTimeout` 定的那个）。只有它到点才该判工具失败。 */
  timer?: ReturnType<typeof setTimeout>;
  /**
   * ★★★ 「最后一个订阅者断开」时设的 15 秒**断连宽限期**定时器（2026-10-15 拆出）。
   *
   * 为什么必须与 `timer` 分开：此前两者共用同一个字段，于是 `subscribe()`（前端重连）里
   * 「清除断连宽限期」那一句 `if (pending.timer) clearTimeout(pending.timer)` 会把
   * **原始超时也一并清掉** —— 而且**不再恢复**。后果：任何一次 SSE 重连之后，那个 pending
   * 工具就**彻底没有超时**了；若它委托的前端结果又因故没回来（POST 重试 3 次后静默放弃），
   * 这一步只能等用户手动中止或 2 小时看门狗 —— 表现为"任务卡住不动、既不失败也不结束"。
   * 实测 10-14 单日 84 次流断连，重连是常态而非例外。
   */
  graceTimer?: ReturnType<typeof setTimeout>;
  args?: unknown;
}

/** 交互类工具：暂停等用户回答，没有"超时"语义 —— 用户隔天回来回答也应该有效。
 *  免 2 分钟创建超时、免 15 秒断连宽限（宽限 reject 会把挂着的问题杀掉）。 */
const INTERACTIVE_TOOLS = new Set(['ask_user', 'confirm_user']);

/**
 * 危险工具：**每次执行前都要用户点确认**（2026-10-21 用户拍板）。
 *
 * 为什么在权限层拦而不是在提示词里叮嘱：可发现 ≠ 可执行。工具一旦开放给模型，
 * 提示词被网页/文件内容注入就可能被拿来执行不可逆操作（跑命令、装东西、对外发布）。
 * 复用既有的 requestPathAuthorization（挂起式授权卡），无人值守时 fail-safe 拒绝。
 *
 * 清单口径：跑任意代码 / 安装运行时 / 对外发布与发消息。其余（读写文件、查数据、生成媒体）不拦。
 */
export const DANGEROUS_TOOLS = new Set([
  'cmd_exec', 'python_exec', 'js_exec',
  'media_install_ffmpeg', 'media_install_singing', 'whisper_install', 'media_install_ytdlp',
  'publish_enqueue', 'publish_mark_published',
  'tcp_send', 'udp_send',
]);

/** 危险工具判定（供执行器与测试共用）：外部 IM 发送类 API 同样按危险处理。 */
export function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOLS.has(name) || name.startsWith('api_im_');
}

/**
 * 危险工具是否还需要弹确认（2026-10-21）。
 *
 * ★ `all` = 用户已明确承担全部风险（PERMISSION_MATRIX['all'].approval = 'never'）。
 *   与危险**命令**护栏（checkDangerousCommand）同一口径：该护栏早已在 all 下跳过，
 *   而"危险工具默认确认"这条同日新增时漏了 —— 用户在 All 模式下调 python_exec 仍被反复弹窗。
 *
 * ★ 用户自己配的 confirm 规则不在此列：那是显式设置，任何档位都照常生效（由调用方前置处理）。
 */
export function needsDangerConfirm(params: {
  toolName: string;
  permissionMode?: string;
  /** 用户 confirm 规则已命中（前面的分支已问过/放行） */
  hasConfirmRules: boolean;
  /** 本会话已「允许该工具」 */
  alreadyAuthorized: boolean;
}): boolean {
  if (params.hasConfirmRules) return false;
  if (params.permissionMode === 'all') return false;
  if (params.alreadyAuthorized) return false;
  return isDangerousTool(params.toolName);
}

/**
 * 清掉一个 pending 工具调用的**全部**定时器（原始超时 + 断连宽限）。
 *
 * ★ 为什么要收口成一处：拆出 `graceTimer` 之前，这两类定时器共用一个字段，于是
 *   "清定时器"只要写一句就够；拆分后若各处仍各写一遍 `pending.timer`，**必然会漏掉一半**
 *   （本仓库多次吃过"同一语义多处判定/多处收尾"的亏）。收口后新增定时器只需改这一处。
 */
function clearPendingTimers(pending: PendingToolCall): void {
  if (pending.timer) { clearTimeout(pending.timer); pending.timer = undefined; }
  if (pending.graceTimer) { clearTimeout(pending.graceTimer); pending.graceTimer = undefined; }
}

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
  /**
   * ★ 只读会话授权制（2026-10-18）：本任务内已获用户批准放行的写类工具集合。
   *   首次调用写类工具 → `_tool_authorize` 授权卡 → 批准后记入本集合，后续调用直接放行
   *   （"批准一次，本任务内该工具放行"，与 pathGuard 的会话白名单同语义、粒度更细）。
   *   仅存内存（任务生命周期即授权生命周期），不落库不跨任务。
   */
  authorizedTools?: Set<string>;
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
  /** 任务级工具环境变量（2026-10-23）：页面设置随任务下发（如小说推文 YZ_TTS_CONCURRENCY），
   *  由工具并入子进程 env；只收 YZ_* 小整数（路由层已白名单化）。 */
  toolEnv?: Record<string, string>;
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
   * ★★★ 浏览器「执行流锁」按**标签页**分表（2026-10-15「导航跑偏」P0-① 第二层 → 同日升级为每页一把）。
   *   浏览器实际是**每标签页一个活动页状态机**：同一 tab 上两个流并发会互踩同一锚页（乒乓导航），
   *   而落在**不同 tab** 上是安全的。覆盖第一层（同批 call_agent 串行化）够不到的路径：
   *   后台 async 子智能体、PlanRunner 并行计划项、主循环自身的 browser_* 与后台流并发。
   *   ★ 缺省键 `SHARED_FLOW` = 所有流共用一把 ⇒ **今天的语义逐字不变**（不传 key 的调用点行为不变）。
   *   实现与"为什么粒度是每页一把"见 services/browser-flow-lock.ts。
   */
  browserFlows?: BrowserFlowLocks;
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
   *   `params.workspaceDir`（前端下发）> 会话绑定空间的 `space.dir_path` >
   *   `serverState.workspaceDir`（全局兜底）。
   *   两处不同源会出现"提示词里说工作目录是 A，工具却在 B 里找文件"这种最难查的不一致。
   *   ★ 2026-10-12：插入会话空间一级（resolveConversationWorkspaceDir），修「A 会话任务
   *     带 B 空间目录跑」—— 前端下发的是全局设置，切会话不同步，是串目录根因。
   */
  workspaceDir?: string;
  /**
   * 任务累计 token（输入+输出合计，usage 优先，缺失按内容长度粗估）。
   * ★ 只做**可观测**（2026-10-18）：原 P1-9 预算闸（token/墙钟触达自动停）已按用户决策退役
   *   ——「程序自动停」体感差（丢工作现场），停语义只剩费用硬停（hardStopCny，用户自填才启用）。
   */
  totalTokens?: number;
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
  /**
   * ★ 费用账本内存增量（2026-10-17，方案 §3.4）—— **仅用于展示与对账**。
   *
   * ★ 阈值判定**不读这里**，读库（`conversation_usage.cost_cny`）：
   *   内存值进程重启即归零 ⇒ 同一会话"刚超 ¥5、重启后又从 ¥0 开始"，
   *   阈值被绕过且极难复现（用户只会说"提醒时灵时不灵"）。
   *   本字段补的只是"调用已完成但尚未 upsert"的窗口（recordUsage 是同步的，窗口极小）。
   */
  costCnyTotal?: number;
  costUnpricedCalls?: number;
  /** 单价缓存（platformId::modelId → 单价）：避免每轮调用都读 model 表 */
  costPricingCache?: Map<string, ModelPricing | undefined>;
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
  // ★★★ 2026-10-11：**终态事件双发到会话级总线** —— 消除前端的 `/llm/tasks/active` 轮询。
  //
  //   ★ 为什么必须（用户实报「没有任务，禁用标志也一直存在着」+ 问「轮询不是早就去掉了？」）：
  //     任务级 SSE 只在**当前有订阅者**时送达。一旦前端订阅断掉（断流放弃重连 / 服务重启 /
  //     后端进程被替换），终态事件就**永远推不出去** → 前端 `runningConvIds` 残留在"运行中"
  //     → 输入框禁用标志一直挂着。
  //     唯一的兜底是 `sweepStaleBrowserTakeover()` **每 30s 轮询** `/llm/tasks/active` 去问
  //     —— 这正是"轮询"的根源，效率差且最长有 120s 盲区。
  //   ⇒ 终态事件**多推一份到会话级总线**（`subscribeConversation`）：前端只需挂一条**长活的
  //     会话级订阅**（与任务无关、任务结束后仍在），就能**实时**收到"任务结束了"，
  //     不必再轮询。总线在无人在线时静默（`emitConversation` 已处理），零额外成本。
  //   ★ 只双发**终态**（completed/aborted/error）—— 中间事件（chunk/tool:*）量极大且
  //     前端只在订阅期间需要，双发会造成无谓的重复开销。
  //   ★ 幂等：前端对重复终态已做去重（`dropStreamState` / `markRunEnd` 幂等），
  //     正常订阅期间会收到两份，不会出错。
  if (event.type === 'task:completed' || event.type === 'task:aborted' || event.type === 'task:error') {
    emitConversation(task.conversationId, { ...event });
    // ★ 会话标题自动生成（2026-10-11）：只在 completed（aborted/error 的首轮内容没营养）、
    //   只在 title_source='auto' 的会话生效（判据在 generateTitleFor 内），fire-and-forget
    //   绝不阻塞收尾；防重复/防覆盖/CAS 写库都在 conversation-title.ts 收口。
    if (event.type === 'task:completed') {
      void generateTitleFor(task.conversationId, task.userId, { platformId: task.platformId, modelId: task.modelId });
    }
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
  // ★ 禁用闸（2026-10-18）：llm_enabled=0 的平台对服务端一切调用不可用
  //   （定时任务/记忆抽取/压缩/子智能体等显式钉平台的路径）—— 视同不存在，
  //   由各调用方的既有「平台不存在」分支兜住，不再向上游发注定 401 的请求。
  //   各后台选模查询（scheduled-tasks / memory-dreaming / model-pools 等）本就带
  //   p.llm_enabled = 1，这里补的是"显式指定 platformId"这最后一类入口。
  if (!row || Number(row.llm_enabled ?? 1) === 0) return null;
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

/**
 * 校验前端下发的 platformId/modelId 组合（属于该用户的已配置平台且模型可用）。
 * 返回错误文案；合法返回 null。
 *
 * 供对话入口在建任务**之前**快速失败（400），避免先建出任务再异步报「模型不存在」。
 * 与运行时 loadModel 同源（findModelRow），但额外卡两点：模型必须属于所给平台、未停用。
 * 注意：findModelRow 按主键查时不带平台约束（存量裸名兼容），所以这里必须自己比对 platform_id。
 */
export function validateTaskModel(userId: string, platformId: string, modelId: string): string | null {
  if (!loadPlatform(platformId, userId)) return `平台不存在或已删除（platformId: ${platformId}）`;
  const row = findModelRow(db, modelId, userId, platformId) as
    | (ReturnType<typeof findModelRow> & { enabled?: number | null })
    | undefined;
  if (!row) return `模型不存在或已删除（modelId: ${modelId}）`;
  const label = row.alias || row.model_id || row.id;
  if (row.platform_id !== platformId) return `模型「${label}」不属于所选平台`;
  if (row.enabled === 0) return `模型「${label}」已停用`;
  return null;
}

/** list_models 工具执行：列出当前用户所有已启用且对模型可见的模型（可按 platformId/type/capability/category 过滤、分页），
 *  返回语义化文本，供 LLM 选型（图片/视频/视觉/向量化等任务指定模型）。
 *  可见性口径与前端模型下拉一致：查不到的平台/模型，智能体也不该动态选中。
 *  model-candidate-pools（2026-10-12）：
 *   - 传 `slot`（llm/vision/image/video）→ 只返回该槽位**生效池**（agent → 平台 → 全局 → 自动兜底）；
 *   - 不传 slot 的平铺返回 → 池是**用户配置的**（非 autoPool 兜底）时给 llm 池成员加 ★，
 *     引导模型优先选池内候选（池收敛了质量下限，"很多模型里选到差模型"的问题由此解决）。 */
function listAvailableModels(userId: string, args: Record<string, unknown>, task?: { agentId?: string | null; platformId?: string | null }): string {
  const platformId = args.platformId as string | undefined;
  const typeFilter = args.type as string | undefined;
  const capFilter = args.capability as string | undefined;
  const category = args.category as string | undefined;
  const limitRaw = Number(args.limit);
  const offsetRaw = Number(args.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  // ===== 候选池上下文（slot 直查 / llm 池打标）=====
  // ★ 不需要 platformId：候选池三层是 智能体 → 智能体平台 → 全局（后两层是应用级单例），
  //   与模型供应商无关。见 services/model-pools.ts 文件头。
  const poolCtx = { userId, agentId: task?.agentId || null };
  const slotFilter = typeof args.slot === 'string' && (SLOTS as readonly string[]).includes(args.slot) ? (args.slot as Slot) : undefined;
  const slotPoolIds = new Set<string>();
  let markIds: Set<string> | null = null;
  if (slotFilter) {
    for (const e of resolvePool(db, poolCtx, slotFilter)) slotPoolIds.add(e.model.id);
  } else {
    const llmPool = resolvePool(db, poolCtx, 'llm');
    if (llmPool.length && llmPool[0].source !== 'auto') {
      markIds = new Set(llmPool.map((e) => e.model.id));
    }
  }

  // 语义分类 → 等价 type/capability 谓词（与 type/capability 同时传时以 category 为准）
  const CATEGORY_MAP: Record<string, { type?: string; cap?: string }> = {
    llm: { type: 'llm' },
    image: { type: 'image' },
    video: { type: 'video' },
    vision: { cap: 'vision' },
    embedding: { type: 'embedding' },
    audio: { type: 'audio' },
  };
  const catRule = category ? CATEGORY_MAP[category] : undefined;
  const effType = catRule?.type ?? typeFilter;
  const effCap = catRule?.cap ?? capFilter;

  // 查平台（含过滤）：平台级总开关关掉即整平台不可见；
  // Token 池全停用的平台同样整个剔除 —— list_models 是大模型选模型的**唯一清单源**，
  // 在这里剔除 = 大模型根本选不到它（候选面过滤），而不是选了再报 401/403 让它重试。
  let platformRows: any[];
  if (platformId) {
    platformRows = db.prepare(`SELECT * FROM platform WHERE id = ? AND user_id = ? AND llm_enabled = 1 AND id NOT IN (${TOKEN_DEAD_PLATFORM_IDS_SQL})`).all(platformId, userId) as any[];
  } else {
    platformRows = db.prepare(`SELECT * FROM platform WHERE user_id = ? AND llm_enabled = 1 AND id NOT IN (${TOKEN_DEAD_PLATFORM_IDS_SQL})`).all(userId) as any[];
  }
  if (platformRows.length === 0) return platformId ? `平台不存在或未对模型开放: ${platformId}` : '当前用户未配置任何可用于大模型的模型平台';

  // 先摊平为「平台名 + 模型」扁平列表，便于统一分类过滤与分页
  type Row = { platformName: string; platformId: string; protocol: string; m: any };
  const all: Row[] = [];
  for (const p of platformRows) {
    const models = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ? AND enabled = 1 AND visible = 1').all(p.id, userId) as any[];
    for (const m of models) {
      const caps: string[] = (() => { try { return JSON.parse(m.capabilities_json || '[]'); } catch { return []; } })();
      if (effType && (m.type || 'llm') !== effType) continue;
      if (effCap && !caps.includes(effCap)) continue;
      // slot 直查模式：只保留生效池成员（池外模型对选型不可见）
      if (slotFilter && !slotPoolIds.has(m.id)) continue;
      all.push({ platformName: p.name, platformId: p.id, protocol: p.protocol || 'openai', m });
    }
  }
  all.sort((a, b) => a.platformName.localeCompare(b.platformName) || (a.m.alias || a.m.model_id).localeCompare(b.m.alias || b.m.model_id));

  const total = all.length;
  if (total === 0) {
    const hint = category || effType || effCap ? `（过滤条件 category=${category || '-'} type=${effType || '-'} capability=${effCap || '-'} 下无匹配）` : '';
    return `未找到可用模型${hint}。可用 list_models（不带过滤）查看全部模型。`;
  }

  const page = all.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  // 按平台分组输出当前页
  const lines: string[] = [];
  let lastPid = '';
  for (const r of page) {
    if (r.platformId !== lastPid) {
      lines.push(`**平台 ${r.platformName}** (id: \`${r.platformId}\`, protocol: ${r.protocol})`);
      lastPid = r.platformId;
    }
    const caps = (() => { try { return JSON.parse(r.m.capabilities_json || '[]'); } catch { return []; } })();
    const type = r.m.type || 'llm';
    const alias = r.m.alias || r.m.model_id;
    const desc = r.m.description ? ` | 描述: ${r.m.description}` : '';
    const capStr = caps.length ? ` | 能力: ${caps.join(',')}` : '';
    const star = markIds?.has(r.m.id) ? '★' : '';
    lines.push(`  - ${star}${alias} (model: \`${r.m.model_id}\`, id: \`${r.m.id}\`) [type=${type}${capStr}]${desc}`);
  }

  const pageLabel = `第 ${offset + 1}-${offset + page.length} 条 / 共 ${total} 条`;
  const moreHint = hasMore
    ? `\n（还有更多，传 offset=${offset + limit} 取下一页；limit 可调每页条数，最大 200）`
    : '';
  const starHint = markIds ? '\n（★ = 当前智能体候选池内模型，选型优先考虑）' : '';
  lines.unshift(`可用模型 ${pageLabel}：`);
  return lines.join('\n') + moreHint + starHint;
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
/**
 * @param spillCtx 超大输出落盘上下文（2026-10-19，对齐 Claude Code spill）：
 *   - 非 file_read 的工具（cmd_exec / python_exec / 页面正文）超过 16KB → 全文落盘，
 *     上下文只留首尾 + 落盘路径（file_read 可按路径回读）；
 *   - **file_read 不复制落盘**：原文本来就在盘上，截断时直接告诉模型原文件路径，
 *     用 offset/limit 分段读取 —— 复制一份既浪费磁盘，又会引出"读转储再转储"的递归。
 */
function capToolResult(result: string, spillCtx?: {
  conversationId: string; toolName: string; originalPath?: string;
}): string {
  if (!result) return result;
  if (spillCtx && result.length > MAX_TOOL_RESULT_CHARS) {
    if (spillCtx.toolName === 'file_read' && spillCtx.originalPath) {
      const head = 40000, tail = 6000;
      return result.slice(0, head)
        + `\n\n...[file_read 输出过长已截断：共 ${result.length} 字符；文件原文在 ${spillCtx.originalPath}，`
        + `请用 file_read 的 offset/limit 分段读取需要的区段]...\n`
        + result.slice(-tail);
    }
    const spilled = spillOversizedToolOutput({
      conversationId: spillCtx.conversationId,
      toolName: spillCtx.toolName,
      text: result,
    });
    if (spilled.spilled) return spilled.text;
  }
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result;
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
  /** 这条子智能体流在**浏览器**上占的标签页键（`shared` / `bg:<flowId>`）。
   *  ★ 一路带到桥调用（`executeTool` → `callBrowserBridge` 的 `flow`）：桌面端据此把
   *    「锚 / 归属」分到各自的流上。★ 与流锁的 tabKey **同源**（都来自 browserFlowKeyOf）。 */
  browserFlowKey: string;
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
  // ★ 可观测性（2026-10-12）：回执远离组头 → 打 warn（发送前 reorderToolGroups 会兜住，
  //   但"凭什么会被拉开这么远"需要现场证据，否则下次同类问题又要靠翻库反推）。
  if (!ownership) {
    try {
      const tail = db
        .prepare(
          `SELECT role, tool_call_id AS toolCallId, tool_calls_json AS tcJson
             FROM message WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 40`,
        )
        .all(convId) as any[];
      const shaped = tail
        .map((r) => ({
          role: r.role,
          toolCallId: r.toolCallId,
          toolCalls: r.tcJson ? (JSON.parse(r.tcJson) as any[]) : null,
        }))
        .reverse(); // DESC 取回 → 反转为旧→新，符合「tail 末尾是最近」
      const gap = gapBetweenToolHeadAndReceipt(shaped, toolCallId);
      if (shouldWarnOnGap(gap)) {
        logger.warn(
          `[llm-task] 回执与组头不相邻: conv=${convId} toolCallId=${toolCallId} gap=${gap} 条` +
            `（发送前 reorderToolGroups 会跨距归位；若频繁出现说明主循环推进点提前，需排查）`,
        );
      }
    } catch {
      /* 可观测性失败绝不影响落库主流程 */
    }
  }
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
  } else {
    emit(task, { type: 'tool:start', toolName, args, ...subEvt });
    try {
      result = await executeTool(task, registry, toolName, args, tcId, uiTools, depth, toolDefs, metaOut, ownership?.browserFlowKey);
    } catch (e: any) {
      if (isAbortError(e)) {
        try {
          insertToolMessageAndEmit(task, convId, userId, tcId, capToolResult('[已中止] 用户中断了工具执行'), ownership);
        } catch { /* 落库失败不影响中止流程（发送侧 sanitize 仍会兜底配对） */ }
        throw e;
      }
      result = await enrichToolErrorReceipt(task, toolName, args, e);
    }
  }

  // ★★★ 进事件缓冲前**先截断**（2026-10-15，内存）：
  //   `task.events` 的上限是按**条数**设的（MAX_EVENTS=10000），单条却可能是一份几十 KB 的
  //   读页/DOM 结果。此前 `tool:result` 推的是**未截断**的 result（只有落库那份走 capToolResult），
  //   于是缓冲里实际驻留的字节数没有上界，且每个订阅者都要把它重新序列化一遍。
  //   截断口径与落库**同一函数**（capToolResult → MAX_TOOL_RESULT_CHARS），保证
  //   "实时看到的"与"重载后落库的"一致（此前实时全量、重载截断，本身就是不一致）。
  const cappedResult = capToolResult(result, {
    conversationId: convId,
    toolName,
    originalPath: toolName === 'file_read' ? String((args as any)?.path || '') : undefined,
  });
  emit(task, { type: 'tool:result', toolName, result: cappedResult, ...subEvt });

  // ★★★ 工具执行完的"副作用"走钩子（P2-3）：产物登记等由 services/artifact-hooks.ts
  //   注册，这里只负责跑。钩子 fail-open：某个钩子出错只 warn，不影响工具结果。
  await runAfterToolHooks(toolName, args, result, {
    taskId: task.id,
    conversationId: convId,
    userId,
    assistantMsgId,
    meta: (metaOut.value || null) as Record<string, unknown> | null,
  });

  // 入库（与上面事件缓冲**同一份** cappedResult，防两处口径漂移）
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

/**
 * ★★★ 按会话解析空间工作目录（2026-10-12 修「串工作目录」）。
 *
 * 为什么需要：workspaceDir 此前的取值链是「前端下发 > serverState 全局兜底」，**从不查
 * conversation.space_id → space.dir_path**。而前端 workspaceDir 是全局单份设置（最后被
 * 点选的空间/目录），用户在 B 空间点过目录后切回 A 会话发消息 → 任务带着 B 的目录跑
 * → 全部工具（含子智能体）在 B 目录解析相对路径 —— 即「A 会话读写 B 空间文件」。
 *
 * 取值口径（createTask 与 buildSystemPromptForBackend 必须同源）：
 *   前端显式下发 > 会话绑定空间的 dir_path > serverState 全局兜底。
 *
 * ★ 只认有效值：dir_path 为空串/纯空白视为未绑定（返回 null，继续走下一级兜底）。
 *   查库失败 fail-safe 返回 null（不阻塞任务创建）。
 */
export function resolveConversationWorkspaceDir(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  try {
    const row = db.prepare(
      'SELECT s.dir_path AS dirPath FROM conversation c JOIN space s ON c.space_id = s.id WHERE c.id = ?',
    ).get(conversationId) as any;
    const dir = String(row?.dirPath || '').trim();
    return dir || null;
  } catch { return null; }
}

/** 会话所属模式（失败返回 null）。用于按模式收紧工作目录/经验的继承。 */
export function resolveConversationMode(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  try {
    const row = db.prepare('SELECT mode FROM conversation WHERE id = ?').get(conversationId) as
      | { mode: string | null }
      | undefined;
    return row?.mode ? String(row.mode) : null;
  } catch { return null; }
}

/**
 * 店铺运营模式**不继承**全局工作目录（2026-10-21 用户实报「切到店铺还关联其他目录」）：
 * 店铺会话通常不绑空间，此前会回退到 serverState 里最后一次点选的项目目录 ——
 * 用户在小说推文项目里切到店铺运营，助手一翻文件就看到小说项目的视频与文案，
 * 回复里开始聊别的项目的发布进度。这是串项目上下文，不是能力。
 * 收紧后店铺会话没有工作目录：取数走 pageAgent / 用户附件，不翻办公项目。
 */
export function isWorkspaceInheritingMode(mode: string | null | undefined): boolean {
  return mode !== 'shop';
}

/** 任务与提示词同源的有效工作目录：显式下发 > 会话空间 >（非店铺模式）全局兜底 */
export function resolveEffectiveWorkspaceDir(
  conversationId: string | null | undefined,
  explicit?: string | null,
): string | undefined {
  const given = String(explicit || '').trim();
  if (given) return given;
  const spaceDir = resolveConversationWorkspaceDir(conversationId);
  if (spaceDir) return spaceDir;
  if (!isWorkspaceInheritingMode(resolveConversationMode(conversationId))) return undefined;
  return serverState.workspaceDir || undefined;
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
  /** 任务级工具环境变量（2026-10-23）：页面设置随任务下发，工具并入子进程 env */
  toolEnv?: Record<string, string>;
  /**
   * 运维现场（2026-10-21）：AI 模式窗口下发的薄描述（连接 id + 终端尾部）。
   * 服务端回查连接/发布项目详情后注入**系统提示词** —— 用户回合只留用户原话。
   */
  opsContext?: OpsContextInput;
}): string {
  // 幂等保护：同 conversationId 已有 running 任务则复用（避免重连重试创建多任务）
  for (const [id, existing] of tasks) {
    if (existing.conversationId === params.conversationId && existing.status === 'running') {
      return id;
    }
  }

  // ── 会话生命周期拦截（2026-10-16「归档 + 回收站」）─────────────────────────
  // 开新任务 = 用户要"继续对话"，这正是归档/删除要拦住的动作。
  // 只在这里拦一次，覆盖全部入口（前端 SSE / IM / 定时任务 / 工作流）——
  // 逐入口补拦是必然漏的（本项目已因此类漂移出过多次事故）。
  // 错误码 CONVERSATION_ARCHIVED / CONVERSATION_TRASHED 由调用方映射 HTTP 状态。
  try {
    const life = db.prepare('SELECT archived_at, deleted_at FROM conversation WHERE id = ? AND user_id = ?')
      .get(params.conversationId, params.userId) as any;
    if (!life) {
      throw new Error('CONVERSATION_NOT_FOUND: 会话不存在');
    }
    if (life.deleted_at) {
      throw new Error('CONVERSATION_TRASHED: 会话已在回收站，请先从回收站恢复');
    }
    if (life.archived_at) {
      throw new Error('CONVERSATION_ARCHIVED: 会话已归档，请先恢复归档会话');
    }
  } catch (e: any) {
    if (String(e?.message || '').startsWith('CONVERSATION_')) throw e;
    // 查库本身失败（如列未迁移）不阻断任务：fail-open 会让老库照常跑，比全员 500 好
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
    authorizedTools: new Set<string>(),
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
    // ★ 工作目录：与提示词注入同源（前端下发 > 会话绑定空间 > 非店铺模式的全局兜底）。
    //   见 LlmTask.workspaceDir 注释 —— 两处不同源会产生"提示词说 A、工具在 B 找"的不一致。
    //   ★ 2026-10-12 插入「会话绑定空间」一级：前端 workspaceDir 是全局设置（最后一次点选的
    //     目录），切会话不同步它 → A 会话的任务曾带着 B 空间目录跑（串工作目录）。
    //   ★ 2026-10-21 店铺模式不再回退全局（resolveEffectiveWorkspaceDir）：
    //     否则切到店铺运营时，助手会用办公项目的目录翻文件、聊到别的项目进度。
    workspaceDir: resolveEffectiveWorkspaceDir(params.conversationId, params.workspaceDir),
    // ★ 越界守卫档位：非法/未下发 → ask（fail-safe，与 normalizePermissionMode 同取向）
    pathGuard: (params.pathGuard === 'strict' || params.pathGuard === 'off') ? params.pathGuard : 'ask',
    toolEnv: params.toolEnv,
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
    // 任务累计 token（只做可观测，2026-10-18 起不再参与任何停机判定）
    totalTokens: 0,
    specFingerprints: new Map<string, number>(),
    backgroundSubAgents: new Map<string, BackgroundSubAgentInfo>(),
  };
  tasks.set(taskId, task);
  // ★★★ 运行中任务必须落库（2026-10-07 修）：此前 llm_task 只有 UPDATE/UPSERT 收尾写入，
  //   createTask 从不 INSERT → 进程被重启（dev 退出、覆盖率 --force-exit 等）时，
  //   「启动回收孤儿任务」（markOrphanTasksInterrupted）查 llm_task 恒为空 → 任务静默消失、
  //   界面零提示（用户实测：任务跑到一半，UI 没跑完就没了）。落库后重启路径才能把它标 interrupted。
  persistTaskRow(task);
  emit(task, { type: 'task:created', taskId, conversationId: params.conversationId,
    // ★★★ 执行面判据「单一给出」（P1-4，2026-10-10）：前端据此决定"要不要本地执行 browser_*"。
    //   ★ 为什么由服务端下发而不是前端自己探端点：
    //     ① 前端探 == 第二份判据 → 与 decideBrowserExecution 必然漂移；
    //     ② 探端点需要 token → 会把凭据暴露到渲染层（安全边界禁止，见 browser-bridge 注释）。
    //   ★ 值里**绝不含** URL/token —— 只是个枚举标记。
    //   ★ 前端对未知事件字段容忍；老 frontend 忽略本字段 → 行为不变（不破坏兼容）。
    browserExecution: browserBridgeAvailable() ? 'bridge' : 'frontend' });
  void runReActLoop(task, params);
  return taskId;
}

/**
 * app_create_task —— 模型自建顶层任务（应用即工具，2026-10-17）。
 *
 * 与 call_agent 的区别：call_agent 是"任务内委派"，跑在父会话上下文里、结果回注父会话；
 * 本工具像用户手动新建一样**创建一个独立任务**：独立会话、独立任务列表条目、独立 SSE 流。
 * 数据链路与前端手动发起（POST /api/conversations + POST /api/llm/tasks）完全同源，
 * 服务端实现参照 runScheduledTask 的无人值守路径 —— 前端任务列表 / 执行窗口零改动即可展示。
 *
 * 权限策略（**不升级**）：新会话 permission_mode 与 pathGuard **继承父任务** ——
 * 用户给父任务什么档位，派生任务就最多什么档位；模型不能借派发自我提权。
 * 模型选择：智能体绑定 > 智能体候选池首选 > 父任务当前模型 > 默认模型（findDefaultModel 同款查询）。
 */
export async function appCreateTask(task: LlmTask, args: any): Promise<string> {
  const title = String(args?.title || '').trim();
  const instruction = String(args?.instruction || '').trim();
  if (!title) return '缺少 title（必填）：请给新任务一个简短标题，它会显示在任务列表。';
  if (!instruction) return '缺少 instruction（必填）：新任务看不到当前会话的上下文，指令必须自包含（目标 / 要求 / 交付物形态 / 验收标准）。';

  // ── 1. 解析执行智能体：显式指定 > 继承父任务 > 默认智能体 ──
  let agentId: string | null = null;
  const wantAgent = String(args?.agentId || '').trim();
  if (wantAgent) {
    const row = db.prepare('SELECT id, name, type FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(wantAgent, task.userId) as any;
    if (!row) return `agentId "${wantAgent}" 不存在或不可用。请先用 list_sub_agents 查询可用智能体，再重新调用。`;
    if (isWorkflowAgent(row)) return `「${row?.name || wantAgent}」是工作流型智能体，不能作为会话智能体跑任务（可改用 call_agent 委派它）。`;
    agentId = row.id;
  } else if (task.agentId) {
    agentId = task.agentId;
  } else {
    const def = db.prepare("SELECT id FROM agent WHERE id = 'a_default_assistant' AND (user_id = ? OR is_public = 1)").get(task.userId) as any;
    if (def) agentId = def.id;
  }

  // ── 2. 归属空间：显式指定 > 继承父任务所在空间 ──
  let spaceId: string | null = null;
  const wantSpace = String(args?.spaceId || '').trim();
  if (wantSpace) {
    const sp = db.prepare('SELECT id FROM space WHERE id = ? AND user_id = ?').get(wantSpace, task.userId) as any;
    if (!sp) return `spaceId "${wantSpace}" 不存在或不属于当前用户，任务未创建。`;
    spaceId = sp.id;
  } else {
    const sp = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(task.conversationId) as any;
    spaceId = sp?.space_id || null;
  }

  // ── 3. 解析模型：智能体绑定 > 智能体候选池首选 > 父任务当前模型 > 默认模型 ──
  let platformId: string | null = null;
  let modelId: string | null = null;
  if (agentId) {
    const agent = db.prepare('SELECT platform_id, model_id FROM agent WHERE id = ?').get(agentId) as any;
    if (agent) {
      platformId = agent.platform_id || null;
      modelId = agent.model_id || null;
      if (!modelId) {
        const poolFirst = resolveFirstModel(db, { userId: task.userId, agentId }, 'llm');
        if (poolFirst) { platformId = poolFirst.platformId; modelId = poolFirst.model.id; }
      }
    }
  }
  if (!platformId || !modelId) { platformId = task.platformId; modelId = task.modelId; }
  if (!platformId || !modelId) {
    const fallback = db.prepare(
      `SELECT m.id, m.platform_id FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm' AND m.visible = 1 AND p.llm_enabled = 1
         AND p.id NOT IN (${TOKEN_DEAD_PLATFORM_IDS_SQL})
       ORDER BY CASE WHEN m.is_default = 1 AND p.is_builtin = 0 THEN 0 WHEN m.is_default = 1 THEN 1 ELSE 2 END, m.created_at ASC
       LIMIT 1`,
    ).get(task.userId) as any;
    if (fallback) { platformId = fallback.platform_id; modelId = fallback.id; }
  }
  if (!platformId || !modelId) {
    return '未找到可用模型（请先在「设置 → 模型平台」配置并启用模型），任务未创建。';
  }

  // ── 4. 建会话（与前端 POST /api/conversations 同构；权限继承父任务，不升级）──
  const convId = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, permission_mode, mode, task_type, title_source, source, source_meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, 'office', NULL, 'auto', NULL, NULL, ?, ?)`,
  ).run(convId, task.userId, title, agentId, platformId, modelId, spaceId, task.permissionMode || 'readonly', now, now);

  // ── 5. 无人值守工具面 + 提示词（参照 runScheduledTask：排除 UI 工具，页面没开也能跑）──
  const systemPrompt = buildSystemPromptForBackend(agentId, task.userId, undefined, { conversationId: convId });
  const tools = buildToolsForBackend(agentId, task.userId, { conversationId: convId });
  const modelParams = loadAgentModelParams(agentId, task.userId);

  // ── 6. 建任务（createTask 起 ReAct 循环；进度落库 + 会话级 SSE，主列表天然可见）──
  try {
    const newTaskId = createTask({
      conversationId: convId,
      userId: task.userId,
      platformId,
      modelId,
      userContent: instruction,
      agentId,
      systemPrompt,
      tools,
      options: {
        temperature: modelParams.temperature,
        maxTokens: modelParams.maxTokens,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
      },
      maxSteps: modelParams.maxReActSteps || 500,
      // pathGuard 同样继承父任务档位（不升级）；createTask 会对非法值兜底 ask
      pathGuard: task.pathGuard,
    });
    logger.info(`[app_create_task] conv=${task.conversationId} 派发顶层任务「${title}」-> conv=${convId} task=${newTaskId}`);
    return [
      '✅ 任务已创建并开始后台执行：',
      `- 标题：${title}`,
      `- conversationId：${convId}`,
      `- taskId：${newTaskId}`,
      `- 执行智能体：${agentId || '默认智能体'}`,
      '',
      '它已出现在用户任务列表中（与手动新建的任务完全一致），执行进度可在「独立执行窗口」实时查看。',
      '注意：任务结果**不会**自动回注本会话；需要跟进时用 app_get_task_status 或 dataAgent 查询该任务状态。',
    ].join('\n');
  } catch (e: any) {
    // 建任务失败（会话被并发归档等极少数情况）→ 清掉刚建的空壳会话，不留垃圾条目
    try { db.prepare('DELETE FROM conversation WHERE id = ? AND user_id = ?').run(convId, task.userId); } catch { /* 忽略 */ }
    const msg = e instanceof Error ? e.message : String(e);
    return `任务创建失败：${msg}`;
  }
}

/**
 * app_get_task_status —— 查询顶层任务执行状态（纯读，readonly 会话可用）。
 * 缺省查当前会话；传 conversationId 查指定任务（app_create_task 的回执里有）。
 * 内存中活任务优先（实时 seq/pending），否则回落 llm_task 表（重启后仍能查到终态）。
 */
export function appGetTaskStatus(task: LlmTask, args: any): string {
  const convId = String(args?.conversationId || '').trim() || task.conversationId;
  const conv = db.prepare('SELECT id, title FROM conversation WHERE id = ? AND user_id = ?').get(convId, task.userId) as any;
  if (!conv) return `会话 "${convId}" 不存在或不属于当前用户。`;
  const row = db.prepare('SELECT id, status, step, error, created_at, updated_at FROM llm_task WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId) as any;
  if (!row) return `任务「${conv.title}」还没有执行记录（可能尚未发起过任务）。`;
  const live = getTask(row.id);
  const status = live?.status || row.status;
  const step = live?.step ?? row.step ?? 0;
  const pending = live ? [...live.pendingToolCalls.values()].map((p) => p.toolName).filter(Boolean) : [];
  const lines = [
    `任务「${conv.title}」（conversationId: ${convId}）`,
    `- 状态：${status}${status === 'running' ? `，已执行 ${step} 步` : ''}`,
  ];
  if (pending.length > 0) lines.push(`- 正在等待工具返回：${pending.join('、')}`);
  if (row.error) lines.push(`- 错误：${row.error}`);
  lines.push(`- 最近活动：${new Date(row.updated_at).toLocaleString('zh-CN')}`);
  if (status === 'running') lines.push('仍在后台执行中；需要结果请稍后再查，或让用户在任务列表里查看。');
  return lines.join('\n');
}

/**
 * app_open_window —— 请求主窗口弹出某任务的独立执行窗口（纯展示，readonly 可用）。
 * 链路：server 校验归属 → 发 app:open_window 任务事件 → 主窗口 SSE 处理器收到后
 * 调 child-window IPC 开 /task-window/:convId 子窗口（复用独立窗口设施）。
 * eventId 供前端去重：任务事件重连时会重放（subscribe(taskId, since)），不去重会弹两次。
 */
function appOpenWindow(task: LlmTask, args: any): string {
  const convId = String(args?.conversationId || '').trim() || task.conversationId;
  const conv = db.prepare('SELECT id, title FROM conversation WHERE id = ? AND user_id = ?').get(convId, task.userId) as any;
  if (!conv) return `会话 "${convId}" 不存在或不属于当前用户，无法弹出窗口。`;
  if (task.subscribers.size === 0) {
    return '主窗口当前不在线（没有前端订阅者），无法弹出窗口。请用户打开主窗口后再试，或提醒用户手动从任务行右键「独立窗口打开」。';
  }
  emit(task, {
    type: 'app:open_window',
    conversationId: convId,
    eventId: `ow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  });
  logger.info(`[app_open_window] conv=${task.conversationId} 请求弹出 ${convId} 的执行窗口`);
  return `已请求主窗口弹出任务「${conv.title}」的独立执行窗口（conversationId: ${convId}）。窗口弹出后即可实时查看该任务的执行进度；若用户没看到窗口，请提醒其检查主窗口是否打开。`;
}

const PUBLISH_PLATFORMS = new Set(['douyin', 'xiaohongshu', 'bilibili', 'wechat', 'csdn', 'juejin', 'zhihu']);
const PUBLISH_PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音', xiaohongshu: '小红书', bilibili: 'B站', wechat: '公众号',
  csdn: 'CSDN', juejin: '掘金', zhihu: '知乎',
};
/** 平台形态（派发发布任务时给 pageAgent 的动作提示）：视频 / 图文 / 文章 */
const PUBLISH_PLATFORM_KINDS: Record<string, string> = {
  douyin: '短视频（创作者中心上传页）', xiaohongshu: '图文笔记（创作者中心发布页）',
  bilibili: '视频（创作者中心投稿页）', wechat: '公众号文章（图文编辑器）',
  csdn: '技术文章（Markdown 编辑器，支持 MD 直接粘贴）', juejin: '技术文章（Markdown 编辑器，支持 MD 直接粘贴）',
  zhihu: '专栏文章（富文本编辑器）',
};

/**
 * publish_enqueue —— 内容入发布队列（只入队，绝不直接发布；2026-10-17 合规设计）。
 * 用户在发布面板确认（approved）后，发布执行由后续 pageAgent 流程承接。
 * 合规预检：极限词粗筛（最/第一/百分百/保证），命中则退回让模型改写。
 */
export function publishEnqueue(task: LlmTask, args: any): string {
  const platform = String(args?.platform || '').trim();
  const title = String(args?.title || '').trim();
  if (!PUBLISH_PLATFORMS.has(platform)) {
    return `platform 必须是 ${[...PUBLISH_PLATFORMS].join(' / ')} 之一，收到 "${platform || '(空)'}"。`;
  }
  if (!title) return '缺少 title（必填）：发布标题（≤30 字，不含极限词）。';
  // 极限词粗筛（合规红线提示，不做最终判定）
  const risky = ['最', '第一', '百分百', '保证', '国家级', '全网最低'];
  const hit = risky.filter((w) => title.includes(w));
  if (hit.length > 0) {
    return `标题含平台高危词（${hit.join('、')}），已拒绝入队。请改写标题后重新提交——发布内容含极限词可能导致限流/下架。`;
  }
  const id = uuid();
  const now = Date.now();
  const media = Array.isArray(args?.mediaPaths) ? args.mediaPaths.map(String).filter(Boolean) : [];
  const collection = typeof args?.collection === 'string' ? args.collection.trim() : '';
  db.prepare(
    `INSERT INTO publish_queue (id, user_id, conversation_id, platform, title, content, media_paths_json, tags, collection, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, task.userId, task.conversationId, platform, title,
    typeof args?.content === 'string' ? args.content : '',
    media.length ? JSON.stringify(media) : null,
    typeof args?.tags === 'string' ? args.tags : '',
    collection || null,
    now, now);
  logger.info(`[publish_enqueue] conv=${task.conversationId} 入队 ${platform}: ${title}`);
  return [
    '✅ 已加入发布队列（待用户确认）：',
    `- 平台：${PUBLISH_PLATFORM_LABELS[platform]}`,
    `- 标题：${title}`,
    collection ? `- 合集：${collection}` : '- 合集：未设置（系列内容建议指定合集名，引导连续订阅）',
    `- 队列 ID：${id}`,
    media.length ? `- 媒体：${media.length} 个文件` : '- 媒体：无',
    '',
    '用户会在「发布」面板看到这条待确认内容；确认后才进入发布执行。请告知用户去确认，不要重复入队。',
  ].join('\n');
}

/**
 * publish_mark_published —— 发布执行完成后回写队列状态（approved → published）。
 * 只认 approved 条目：pending 不能跳级（没确认就"已发布"是绕过人工确认的漏洞）；
 * rejected / published 不允许（published 已是终态，重发走 UI 的「撤回待确认」）。
 * note 记录发布结果（链接/平台稿件 ID），供发布面板展示与后续复盘。
 */
export function publishMarkPublished(task: LlmTask, args: any): string {
  const id = String(args?.id || '').trim();
  if (!id) return '缺少 id（必填）：发布任务指令里给出的队列条目 ID。';
  const row = db.prepare('SELECT * FROM publish_queue WHERE id = ? AND user_id = ?').get(id, task.userId) as any;
  if (!row) return `队列条目 "${id}" 不存在或不属于当前用户。`;
  if (row.status !== 'approved') {
    return `条目「${row.title}」状态是 ${row.status}，只有已确认（approved）的条目才能标记已发布——发布必须经用户在发布面板确认，不能跳级。`;
  }
  const note = typeof args?.note === 'string' && args.note.trim() ? args.note.trim() : null;
  db.prepare('UPDATE publish_queue SET status = ?, published_at = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?')
    .run('published', Date.now(), note, Date.now(), id);
  logger.info(`[publish_mark_published] conv=${task.conversationId} 条目 ${id} 标记已发布`);
  return `✅ 队列条目「${row.title}」已标记为已发布。请向用户汇报发布结果${note ? `（备注：${note}）` : ''}。`;
}

/**
 * publish_record_stats —— 发布后数据回传（复盘链路，P2）。
 * 数据必须来自 pageAgent 读到的平台创作者后台真实数字（模型编数据 = 谎报，提示词已禁）。
 * 累积语义：重复记录时数字字段覆盖、note 追加，供多时间点观察（48h/7d）。
 */
export function publishRecordStats(task: LlmTask, args: any): string {
  const id = String(args?.id || '').trim();
  if (!id) return '缺少 id（必填）：发布队列条目 ID。';
  const row = db.prepare('SELECT * FROM publish_queue WHERE id = ? AND user_id = ?').get(id, task.userId) as any;
  if (!row) return `队列条目 "${id}" 不存在或不属于当前用户。`;
  if (row.status !== 'published') {
    return `条目「${row.title}」状态是 ${row.status}，只有已发布（published）的内容才记录表现数据。`;
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
  const stats = {
    views: num(args?.views),
    likes: num(args?.likes),
    comments: num(args?.comments),
    shares: num(args?.shares),
    note: typeof args?.note === 'string' && args.note.trim() ? args.note.trim() : undefined,
    recordedAt: Date.now(),
  };
  if (stats.views === undefined && stats.likes === undefined && stats.comments === undefined && stats.shares === undefined) {
    return '至少提供一个数据字段（views/likes/comments/shares）。读不到真实数据就如实说明，不要编造数字。';
  }
  db.prepare('UPDATE publish_queue SET stats_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(stats), Date.now(), id);
  logger.info(`[publish_record_stats] conv=${task.conversationId} 条目 ${id} 回传数据`);
  return `✅ 已记录「${row.title}」的表现数据：${[
    stats.views !== undefined ? `播放 ${stats.views}` : '',
    stats.likes !== undefined ? `点赞 ${stats.likes}` : '',
    stats.comments !== undefined ? `评论 ${stats.comments}` : '',
    stats.shares !== undefined ? `转发 ${stats.shares}` : '',
  ].filter(Boolean).join('，')}。请向用户简要解读（如完播/互动水平与下一步改进方向）。`;
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

async function attachImagesToMessages(messages: Message[], task?: LlmTask): Promise<void> {
  try {
    // ★ 2026-10-12：相对路径基准用任务快照（task.workspaceDir）而非全局 serverState ——
    //   与工具执行同一口径，避免全局目录在任务运行期间被别的空间切换覆盖后，图片解析到错的目录。
    const baseDir = task?.workspaceDir?.trim() || currentWorkspaceDir();
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
          const abs = resolveToolPath(p, baseDir);
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

/**
 * 取出「seq 大于 since」的事件 —— 重连重放的**唯一判据**（纯函数，便于直接测）。
 *
 * ★ 为什么单独抽出来：这个判据的 bug（用数组下标当游标）只有在**事件缓冲被裁剪过**之后
 *   才显形，用真实任务触达 MAX_EVENTS 的代价太高、测试也跑不动。抽成纯函数后可以直接构造
 *   "已被裁剪的缓冲 + 客户端游标"来钉住行为（见 seq-replay-cursor.test.ts）。
 *
 * @param events 任务事件缓冲（可能已被 emit 裁剪过最旧事件）
 * @param since  客户端已收到的**最后一个事件的 seq**；0 = 从头全量重放
 */
export function eventsSince(events: SSEEvent[], since: number): SSEEvent[] {
  const from = Number.isFinite(since) && since > 0 ? since : 0;
  if (from === 0) return events.slice();
  return events.filter((ev) => (typeof ev.seq === 'number' ? ev.seq : 0) > from);
}

/**
 * 重放过滤：**已回收**的前端工具调用不再重放（2026-10-21 修，根因）。
 *
 * ★ 现场（用户实报「同一个问题又问一遍」「答完的确认框还挂在页面上」）：
 *   前端刷新/新开任务窗口时 `taskEventCounts`（游标）与 `executedToolCallIds`（去重集）
 *   都是**内存态**，一起归零 ⇒ 以 `since=0` 全量重放该任务的整段事件缓冲。
 *   缓冲里那条 `tool:execute`（confirm_user 三页向导）被原样再发一遍 → 前端重新弹出向导，
 *   而此时用户**早就答过**、服务端 `pendingToolCalls` 里已经没有这个 callId。
 *   结果是：任务继续跑到第 N 步，页面却停在「第 1 / 3 页」问第一页；
 *   再答一次也不生效（resolveToolResult 找不到 pending 直接 return）——纯粹的僵尸弹窗。
 *
 * ★ 判据用服务端的 `pendingToolCalls`（唯一权威），不在前端猜：
 *   callId 还在 ⇒ 真的还等着用户，必须重放（重连不能丢提问）；
 *   callId 没了 ⇒ 结果已回收，重放只会重复弹窗。
 *
 * @param isPending 该 callId 是否仍在等待前端结果
 */
export function dropResolvedToolExecutes(
  events: SSEEvent[],
  isPending: (callId: string) => boolean,
): SSEEvent[] {
  return events.filter((ev) => {
    if (ev.type !== 'tool:execute') return true;
    const callId = (ev as { callId?: unknown }).callId;
    if (!callId) return true;
    return isPending(String(callId));
  });
}

/**
 * 订阅任务事件（重放 seq > since 的事件 + 后续实时事件）。
 *
 * ★★★ `since` 的语义 =「客户端**已收到的最后一个事件的 seq**」（0 = 从头全量重放）。
 *
 * **必须用 seq，不能用数组下标**（2026-10-15 修，根因）：
 *   `emit` 在 `task.events.length > MAX_EVENTS` 时会 `splice(0, 超出量)` **丢弃最旧事件**，
 *   于是同一个事件的下标会**整体前移**；而客户端记的是"累计收到多少条"
 *   （`taskEventCounts`，见 chat.ts）—— 两者只在"从未裁剪过"时数值相等。
 *   而 `chunk` 事件按**每个流式增量**发一条，长任务必然越过 MAX_EVENTS(10000)。一旦裁剪：
 *   · 轻则重放窗口整体错位（漏掉 / 重复若干事件）；
 *   · 重则 `since`（= 累计条数）**大于** `task.events.length` → 循环一次都不执行 →
 *     **断连期间的事件一条都不补**。若漏掉的正是一条 `tool:execute`，则工具永不执行、
 *     无人 POST 结果 → 该步一直等到超时（用户看到的"卡住不动、任务跑不完"）。
 *   seq 单调递增且不受裁剪影响，是唯一稳定的游标。
 *
 * 兼容性：`since = 0`（默认，也是现有全部调用方的取值）行为完全不变。
 */
export function subscribe(taskId: string, since: number, onEvent: (event: SSEEvent) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  const replay = dropResolvedToolExecutes(eventsSince(task.events, since), (id) => task.pendingToolCalls.has(id));
  // ★ 2026-10-21：重放前先剔掉「已经答过」的前端工具调用 —— 否则刷新/重连会把
  //   早已回收的 confirm_user 向导再弹一遍（用户看到同一个问题被重复提问）。
  for (const ev of replay) {
    try { onEvent(ev); } catch {}
  }
  task.subscribers.add(onEvent);
  // 前端重连：只清**断连宽限期**定时器（工具调用继续等前端结果）。
  // ★★★ 绝不碰 `pending.timer`（工具原始超时）—— 此前两者共用一个字段，重连会把原始超时
  //   一并清掉且不恢复 ⇒ 一次重连之后该 pending 工具**永久失去超时**，只能等用户中止或
  //   2 小时看门狗（"卡住不动"的成因之一）。见 PendingToolCall.graceTimer 注释。
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.graceTimer) { clearTimeout(pending.graceTimer); pending.graceTimer = undefined; }
  }
  return () => {
    task.subscribers.delete(onEvent);
    // 最后一个订阅者断开：给 pendingToolCalls 设 15 秒宽限期，超时则 reject（避免等 2 分钟）。
    // ⚠️ paused 态跳过：任务挂起是用户主动行为，宽限 reject 会把恢复后的工具链误杀。
    // ⚠️ 交互类工具（ask_user/confirm_user）同样跳过：问题挂着等用户回答，断连不该杀。
    if (task.subscribers.size === 0 && task.status === 'running' && !task.paused) {
      for (const [id, pending] of task.pendingToolCalls) {
        if (INTERACTIVE_TOOLS.has(pending.toolName || '')) continue;
        if (pending.graceTimer) continue; // 已有宽限 timer 不重复设（注意：不是 pending.timer）
        pending.graceTimer = setTimeout(() => {
          const p = task.pendingToolCalls.get(id);
          if (p) {
            // ★ 2026-10-15：与"超时"走**同一个收口**（本地状态类改由服务端落库，其余仍报错）。
            //   两条路径原先各写一份，措辞也因此漂移；收口后由 reason 区分文案。
            void onFrontendToolTimeout(task, p.toolName || '', id, 15000, 'disconnect');
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
    clearPendingTimers(pending);
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
 * 区分「任务被用户终止」与「前端真的不可达」（2026-10-21 修，根因）。
 *
 * ★ 现场（用户实报「点了停止，助手却说前端不可达、还让我重试」）：
 *   `abortTask()` 用 `DOMException('Aborted', 'AbortError')` reject 掉**所有** pending，
 *   而授权弹窗的 catch 一律按"前端不可达"措辞回给模型，并附上一句"请稍后重试"。
 *   于是用户点停止 ⇒ 模型收到"重试"指引 ⇒ 再发一次工具 ⇒ 立刻又被 abort ——
 *   界面看起来就是"反复弹窗 / 一直卡着不动"。
 *
 * ★ 授权卡（`PATH_AUTH_TIMEOUT_MS = 0`）与工具授权（timeout 0）**都不设超时**，
 *   即这两处的 reject 只可能来自 abort 或无人值守 ⇒ 把它们说成"前端不可达"几乎恒为误判。
 */
export function isTaskAbort(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'AbortError') return true;
  const msg = String((e as { message?: unknown } | null)?.message ?? e ?? '').trim();
  return /^aborted$/i.test(msg);
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
  /** 非空 = 危险工具默认确认，可提供「本会话内允许该工具」选项（记在本参数的工具名下） */
  allowSessionTool?: string,
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
    // 前端据此决定是否显示「本会话内允许该工具」按钮（只在危险工具默认确认时给）
    allowSessionTool: allowSessionTool || '',
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
    // ★ 2026-10-21：用户点「停止」≠ 前端不可达。混为一谈会让模型照着"请稍后重试"再发一次，
    //   而任务已被 abort ⇒ 再次被拒 ⇒ 用户看到的就是"同一个授权卡反复弹"。
    if (isTaskAbort(e, task.abortController.signal)) {
      return {
        ok: false,
        reason: 'aborted',
        message: '任务已被用户终止，授权未完成。**不要重试**，直接结束本轮。',
      };
    }
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
  // 「本会话内允许该工具」（2026-10-21）：只在服务端主动发放了 allowSessionTool 时才认，
  // 否则降级为"仅此次"，防止旧前端/异常载荷凭一个 decision 值扩大授权。
  let effective = decision;
  if (decision === 'tool' && !allowSessionTool) {
    logger.warn(`[path-guard] decision=tool 但未提供 allowSessionTool，降级为 once conv=${task.conversationId}`);
    effective = 'once';
  } else if (decision === 'tool' && allowSessionTool) {
    authorizeDangerTool(task.conversationId, allowSessionTool);
    logger.warn(`[danger] 已记录「本会话内允许」conv=${task.conversationId} tool=${allowSessionTool}`);
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
    toolName, decision: 'allowed', reason: effective, items,
  });
  logger.warn(`[path-guard] 已授权 conv=${task.conversationId} tool=${toolName} scope=${effective} n=${items.length}`);
  return { ok: true, reason: effective, message: '' };
}

/** 解析前端授权卡的返回值。JSON 优先（`{decision}`），纯文本兜底（老前端/异常形态）。 */
function parsePathAuthResult(raw: string): 'once' | 'dir' | 'tool' | 'deny' | 'cancel' {
  const s = (raw || '').trim();
  if (!s) return 'deny';
  try {
    const obj = JSON.parse(s) as { decision?: string };
    const d = String(obj.decision || '');
    if (d === 'once' || d === 'dir' || d === 'tool' || d === 'deny' || d === 'cancel') return d;
  } catch { /* 非 JSON，走文本兜底 */ }
  if (/^allow(_once)?$/.test(s) || s === '允许' || s === '仅此次允许') return 'once';
  if (/^allow_dir$/.test(s) || s === '允许该目录') return 'dir';
  if (s === '取消' || /cancel/i.test(s)) return 'cancel';
  return 'deny';
}

// ============================================================
// 只读会话工具授权（2026-10-18，「只读 = 要授权，而不是不能执行」）
// ============================================================

/** 授权伪工具：与 `_path_authorize` 同机制 —— 不在 registry，由前端 tool:execute 通道拦截弹卡。 */
const TOOL_AUTH_TOOL = '_tool_authorize';

/**
 * 请求用户授权在只读会话中执行写类工具（复用 pathGuard 的「委托前端 → 弹卡 → POST 回传」通道）。
 *
 * 返回：
 *   { ok: true }           → 用户批准（已记入 task.authorizedTools，本任务内该工具放行）
 *   { ok: false, message } → 未获授权，message 是给模型的指引（措辞让它**换方案/问用户**，
 *                             而不是重试 —— 防止"反复弹卡"的骚扰循环）
 *
 * 无人值守（无前端订阅者）：fail-safe 直接拒绝且不挂起（与 requestPathAuthorization 同口径）。
 */
async function requestToolAuthorization(task: LlmTask, toolName: string, args: unknown): Promise<{ ok: boolean; message: string }> {
  // 已批准过：本任务内直接放行（调用方也查，这里兜底防重入）
  if (task.authorizedTools?.has(toolName)) return { ok: true, message: '' };

  if (task.subscribers.size === 0) {
    logger.warn(`[tool-auth] 无人值守拒绝: conv=${task.conversationId} tool=${toolName}`);
    return {
      ok: false,
      message: `[无人值守] 只读会话中工具 ${toolName} 需要用户授权，但当前无前端在线、无人可确认，已拒绝执行。`
        + `请在最终回复中说明需要用户授权该工具，或改用只读方案完成。`,
    };
  }

  const argsPreview = (() => {
    try {
      const s = JSON.stringify(args ?? {});
      return s.length > 600 ? s.slice(0, 600) + '…' : s;
    } catch { return '(参数不可序列化)'; }
  })();

  let raw: string;
  try {
    // 超时 0 = 不设超时（授权卡与 pathGuard 授权弹窗同性质：用户可能隔天才回）
    raw = await executeToolViaFrontend(task, TOOL_AUTH_TOOL, { toolName, argsPreview }, '', 0, 0);
  } catch (e: any) {
    // 同 requestPathAuthorization：用户终止与真故障必须分开报，否则模型会照着"重试"再弹一次。
    if (isTaskAbort(e, task.abortController.signal)) {
      return { ok: false, message: '任务已被用户终止，授权未完成。**不要重试**，直接结束本轮。' };
    }
    return {
      ok: false,
      message: `授权确认失败（前端不可达）：${e?.message || e}。本次未执行；请改用只读方案，或向用户说明后等待其放开会话权限。`,
    };
  }

  const decision = parseToolAuthResult(raw);
  if (decision === 'allow') {
    if (!task.authorizedTools) task.authorizedTools = new Set<string>();
    task.authorizedTools.add(toolName);
    logger.warn(`[tool-auth] 已授权 conv=${task.conversationId} tool=${toolName}（本任务内放行）`);
    return { ok: true, message: '' };
  }
  logger.warn(`[tool-auth] 用户拒绝: conv=${task.conversationId} tool=${toolName} decision=${decision}`);
  return {
    ok: false,
    message: `用户未授权执行工具 ${toolName}（只读会话写操作需授权）。**不要重试同一调用**；请改用只读方案，或先向用户说明为什么必须执行该操作并等待明确同意。`,
  };
}

/**
 * 安装类资源的**强制确认**（2026-10-22）。
 *
 * 设计要点（每条都对应一个真实风险）：
 * 1. **任何权限模式都问** —— 与 readonly 授权闸分离，见调用处注释。
 * 2. **已装不弹** —— 幂等判定放在确认之前，否则每次调用都弹一次，用户会烦到关掉确认。
 * 3. **确认卡必须给四样信息**：体积（多大）、来源（国内还是国外）、落地目录（放哪）、
 *    预计耗时（等多久）。少一样，用户就是在盲签。
 * 4. **拒绝后明确"别重试"** —— 否则模型会循环再弹，用户被反复骚扰
 *    （与 requestToolAuthorization 的措辞保持一致）。
 * 5. **无人值守直接拒** —— 没有前端就没人能确认，不能默认放行。
 */
async function confirmResourceInstall(
  task: LlmTask,
  args: unknown,
): Promise<{ ok: boolean; message: string }> {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const action = String(a.action ?? 'list');
  // list / status 不下载，不打扰用户
  if (action !== 'install') return { ok: true, message: '' };

  const resourceId = String(a.resource ?? '').trim();
  if (!resourceId) return { ok: true, message: '' }; // 让工具自己报参数错误

  const inst = getInstaller(resourceId);
  if (!inst) return { ok: true, message: '' }; // 未知资源交给工具报错

  const variant = typeof a.variant === 'string' && a.variant.trim() ? a.variant.trim() : undefined;

  // 幂等：已装则跳过确认（本任务内也记一次，避免重复查询）
  const key = `install:${resourceId}:${variant ?? ''}`;
  if (task.authorizedTools?.has(key)) return { ok: true, message: '' };
  try {
    if (await inst.isInstalled(variant)) {
      if (!task.authorizedTools) task.authorizedTools = new Set<string>();
      task.authorizedTools.add(key);
      logger.info(`[install-confirm] 已安装，跳过确认 resource=${resourceId}`);
      return { ok: true, message: '' };
    }
  } catch {
    // 探测失败（目录不可读等）继续走确认 —— 宁可多问一次，不要静默跳过
  }

  if (task.subscribers.size === 0) {
    logger.warn(`[install-confirm] 无人值守拒绝 resource=${resourceId}`);
    return {
      ok: false,
      message:
        `[无人值守] 安装 ${inst.title} 需要用户确认，但当前无前端在线、无人可确认，已跳过下载。` +
        `请在最终回复中告知用户：可在「设置」中自行下载安装（${inst.title}，${humanBytes(inst.bytes(variant))}），` +
        `或稍后在界面上重新发起本任务。`,
    };
  }

  const bytes = inst.bytes(variant);
  const sources = inst.sources();
  const srcText = sources.slice(0, 3).map((s) => `${s.label}`).join(' → ');
  const spec = {
    title: `需要下载：${inst.title}`,
    purpose: inst.purpose,
    size: humanBytes(bytes),
    sizeBytes: bytes,
    sources: srcText || '内置源',
    target: inst.targetDir(),
    eta: inst.eta(variant),
    manualHint: inst.manualHint(),
  };

  let raw: string;
  try {
    // 超时 0 = 不设超时（用户可能隔很久才回，与授权卡同性质）
    raw = await executeToolViaFrontend(task, TOOL_AUTH_TOOL, { toolName: 'install_resource', argsPreview: JSON.stringify(spec) }, '', 0, 0);
  } catch (e: any) {
    if (isTaskAbort(e, task.abortController.signal)) {
      return { ok: false, message: '任务已被用户终止，下载未开始。**不要重试**，直接结束本轮。' };
    }
    return {
      ok: false,
      message: `下载确认失败（前端不可达）：${e?.message || e}。本次未开始下载，请告知用户可在「设置」中自行安装。`,
    };
  }

  const decision = parseToolAuthResult(raw);
  if (decision === 'allow') {
    if (!task.authorizedTools) task.authorizedTools = new Set<string>();
    task.authorizedTools.add(key);
    logger.warn(`[install-confirm] 用户已批准 resource=${resourceId} bytes=${bytes}`);
    return { ok: true, message: '' };
  }
  logger.warn(`[install-confirm] 用户拒绝 resource=${resourceId}`);
  return {
    ok: false,
    message:
      `用户拒绝下载 ${inst.title}（${humanBytes(bytes)}）。**不要重试同一安装**；` +
      `请告知用户他可以在「设置」中自行下载安装，并继续用已有能力完成当前任务（不要因此停下）。`,
  };
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
/**
 * 累积流式 tool_call 分片（纯函数，可单测）。
 *
 * ★★★ 为什么必须存在这道防串位（2026-10-10 实测故障）：
 *   模型一批输出**两个工具**（`task_plan` + `call_agent`）时，实测 `call_agent` 的
 *   `arguments` 只收到 **30 个字符**（`{"agentId": "a_builtin_page_ag`）→
 *   `parseToolArguments` 报「不是合法 JSON」→ **工具未执行** →
 *   要派发的 pageAgent 从未被拉起（用户侧表现为「pageAgent 页面不显示」「接管没生效」）。
 *   根因：直接信任厂商给的 `tc.index`。而各网关对 index 的语义不一致 ——
 *   有的从 1 开始、有的每个分片都重复同一个 index、有的干脆不带 →
 *   后一个工具的**首个分片**会覆盖到前一个工具的槽位上，参数就此残缺。
 *
 * 判定优先级（从强到弱）：
 *   ① 带 `id` → 按 id 精确匹配既有槽位（最可靠，id 唯一）
 *   ② 槽位已有内容且 **id 或工具名冲突** → 判定为"另一个调用"，另起槽位（绝不覆盖）
 *   ③ 其余按 `tc.index` / 追加（保持既有行为）
 *
 * 拼接去重：正常是**增量**分片直接拼；少数网关会**重发完整 arguments**（非增量），
 *   此时按"以既有内容为前缀"识别并**替换**而非追加（否则拼成 `{...}{...}` 非法 JSON）。
 */
export function accumulateToolCallDeltas(acc: DeltaToolCall[], deltas: DeltaToolCall[]): void {
  // ★ lastIdx 必须**跨调用**保持（挂在 acc 对象上）—— 不能是函数内局部变量！
  //   否则每个 chunk 进来都重置为 -1，"无 id 的纯参数分片"就失去了归属依据，
  //   会退化成按 tc.index 走 → 又回到串位老问题（实测：call_agent 的分片粘到了
  //   同 index 的上一个工具 task_plan 上）。
  const accAny = acc as any;
  for (const tc of deltas) {
    const cur = { ...tc } as DeltaToolCall;
    // ── 定位目标槽位 ──────────────────────────────────────────────
    // ① 带 id 且能找到既有槽位 → 就用它（id 最可靠）
    // ② 不带 id（增量分片常如此）→ 粘住**上一次使用的槽位**（lastIdx）
    //    ★ 这是关键：不带 id 的分片属于"当前正在累积的那个调用"，
    //      不能被 tc.index 带偏（网关的 index 语义不可靠，实测同一批两个工具都报 0）。
    // ③ 都不行 → 按 index / 追加
    let idx: number;
    const byId = cur.id ? acc.findIndex((x) => x && x.id === cur.id) : -1;
    if (byId >= 0) {
      idx = byId;
    } else if (!cur.id && cur.function?.arguments && !cur.function?.name && (accAny.__lastIdx ?? -1) >= 0 && acc[accAny.__lastIdx ?? -1]) {
      // 纯参数增量分片（无 id、无工具名）→ 归属上一个槽位
      idx = accAny.__lastIdx ?? -1;
    } else if (cur.id) {
      // 新 id（新调用）→ 新槽位（先看 index 是否空着）
      idx = (cur.index !== undefined && !acc[cur.index]) ? cur.index : acc.length;
    } else if (cur.index !== undefined && acc[cur.index]) {
      idx = cur.index;
    } else if (cur.function?.name) {
      idx = acc.length;
    } else {
      idx = acc.length > 0 ? acc.length - 1 : 0;
    }

    // ── 槽位占用冲突检测（防线二）───────────────────────────────
    // 槽位已被"别的调用"占了 → 另起槽位，绝不覆盖
    const slot = acc[idx];
    if (slot) {
      const idConflict = !!cur.id && !!slot.id && cur.id !== slot.id;
      const nameConflict = !!cur.function?.name && !!slot.function?.name && cur.function.name !== slot.function.name;
      if (idConflict || nameConflict) {
        const sameId = cur.id ? acc.findIndex((x) => x && x.id === cur.id) : -1;
        idx = sameId >= 0 ? sameId : acc.length;
      }
    }

    // ── 写入 / 拼接 ────────────────────────────────────────────
    if (!acc[idx]) {
      acc[idx] = cur;
      accAny.__lastIdx = idx;
      continue;
    }
    const prev = acc[idx];
    const prevArgs = prev.function?.arguments || '';
    const incArgs = cur.function?.arguments || '';
    // 重发整段（以既有内容为前缀）→ 替换；正常增量 → 追加
    // ★ 等长也必须判重发（2026-10-18，mock server 真跑逼出的真实 bug）：
    //   OpenAI Responses 的 `response.output_item.done` 会带**完整** arguments
    //   （真实 API 也是如此），而此前的增量分片已拼出**同样长度**的完整串
    //   ⇒ 只判 `>` 时等长漏过 ⇒ 拼成 `{...}{...}` 非法 JSON ⇒ parseToolArguments 失败
    //   ⇒ **工具静默不执行**。等长且互为前缀 ⇒ 两者必然相同 ⇒ 替换是无操作，
    //   绝不会误伤正常增量（增量的下一片不会以既有全文开头）。
    const isResend = incArgs.length >= prevArgs.length && incArgs.startsWith(prevArgs);
    const merged: any = {
      ...prev, ...cur,
      function: cur.function
        ? { ...prev.function, ...cur.function, arguments: isResend ? incArgs : prevArgs + incArgs }
        : prev.function,
    };
    // 保留既有 id（增量分片不带 id 时别把 id 清掉 —— 否则 tool 结果无法配对）
    if (!merged.id && prev.id) merged.id = prev.id;
    acc[idx] = merged as DeltaToolCall;
    accAny.__lastIdx = idx;
  }
}

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
 * DSML 标记里的参数值还原类型（2026-10-13）。
 *
 * DSML 方言把参数写成 `value="…"` 的**字符串**，而工具 schema 常要 number/boolean
 * （如 browser_get_dom 的 depth、browser_scroll 的 y）。这里只对**明确的 JSON 字面量**
 * 还原类型，其余一律按原字符串 —— 不会把 `url="https://…"` 这种误判。
 */
function coerceDsmlValue(raw: string): unknown {
  const v = raw.trim();
  if (!v) return '';
  try {
    const j = JSON.parse(v);
    if (typeof j !== 'string') return j;   // 数字/布尔/null/数组/对象
  } catch { /* 不是 JSON 字面量 → 按字符串 */ }
  return raw;
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
  // ── 方言三：DSML 标记（2026-10-13）────────────────────────────────────────
  // ★ 实测（agnes-3.0-flash 经 apihub 中转到用户会话）：模型不吐 [TOOL_CALL]，而吐这串：
  //     <|DSML|tool_calls>
  //     <|DSML|invoke name="browser_navigate">
  //     <|DSML|parameter parameterName="url" value="https://…" />
  //     <|DSML|invoke>
  //     </|DSML|tool_calls>
  //   此前**全仓零识别**（grep DSML 为空）→ 既没变成工具调用、也没被清理 ⇒ 原样打印在
  //   回复正文里（用户实报「为啥会打印 <|DSML|tool_calls> 这个？」），任务表现为
  //   "模型只把要调用的工具复述了一遍，什么都没发生"。
  //   容错按实测输出：闭合 invoke **可能没有斜杠**（`<|DSML|invoke>`）、
  //   参数名两种写法（parameterName / name）、value 可能带单引号。
  const dsmlBlockRe = /<\|DSML\|tool_calls>([\s\S]*?)(?:<\/\|DSML\|tool_calls>|$)/gi;
  while ((m = dsmlBlockRe.exec(fullContent)) !== null) {
    const body = m[1];
    const invokeRe = /<\|DSML\|invoke\s+name\s*=\s*["']([^"']+)["']\s*\/?>/gi;
    const invokes: { name: string; start: number; end: number }[] = [];
    let inv: RegExpExecArray | null;
    while ((inv = invokeRe.exec(body)) !== null) invokes.push({ name: inv[1].trim(), start: inv.index, end: invokeRe.lastIndex });
    for (let i = 0; i < invokes.length; i++) {
      // ★ 工具名已 trim 到裸名（见上）：模型常写成 `name=" browser_navigate"` 或尾部带空白，
      //   而带空白的名字会**绕过**前端那些按严格相等判定的专用分支
      //   （如 `fullName === 'browser_navigate'`）→ 最终落到兜底报「未知工具: browser_navigate」。
      //   报错文案与正常名一模一样，极难查（2026-10-14 实测）。
      if (!invokes[i].name) continue;
      // 该次调用的参数取值范围：本 invoke 之后、下一个 invoke 之前
      const seg = body.slice(invokes[i].end, i + 1 < invokes.length ? invokes[i + 1].start : body.length);
      const args: Record<string, unknown> = {};
      const paramRe = /<\|DSML\|parameter\s+(?:parameterName|name)\s*=\s*["']([^"']+)["']\s+value\s*=\s*["']([\s\S]*?)["']\s*\/?>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = paramRe.exec(seg)) !== null) args[pm[1]] = coerceDsmlValue(pm[2]);
      // (A)/(B) 判据同 [TOOL_CALL] 方言：有没有写出参数体，而不是参数体是否为空对象
      const hasParamBlock = /<\|DSML\|parameter\s/i.test(seg);
      if (!hasParamBlock && needsArgs(invokes[i].name)) { skipped.push(invokes[i].name); continue; }
      toolCalls.push({
        id: `text_tc_${Date.now()}_${toolCalls.length}`,
        name: invokes[i].name,
        arguments: JSON.stringify(args),
      });
    }
  }
  // 始终清理 [TOOL_CALL] / <function=xxx> / <|DSML|…> 标记（含不完整块），
  // 避免前端"正在调用工具"chip 永驻、也避免标记原样漏进用户可见正文
  const cleanedContent = fullContent
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/gi, '')
    .replace(/<\|DSML\|[\s\S]*?<\/\|DSML\|tool_calls>/gi, '')
    .replace(/<\|DSML\|[\s\S]*$/gi, '')
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


/**
 * call_agent 子智能体 id 别名（pageAgent 系）。
 * ★ 2026-10-15 从 runSubAgentImpl 内提出为模块级：isBrowserCapableSubAgent 也要做同一
 *   归一化 —— 同一语义只有一处实现（本仓库多次吃过"平行实现漂移"的亏）。
 */
const SUBAGENT_ALIASES: Record<string, string> = {
  pageAgent: 'a_builtin_page_agent',
  page_agent: 'a_builtin_page_agent',
  pageagent: 'a_builtin_page_agent',
};

/**
 * call_agent 目标子智能体是否挂载了浏览器工具（「导航跑偏」P0-① 判据，2026-10-15）。
 *
 * ★ 背景（实测 10-14 晚 conv 13822a0d）：同批并发的两个 pageAgent 子智能体各自
 *   navigate，全部打到同一个会话锚 tab-1 上 —— A 刚导航完 B 立刻覆盖，A 读到 B 的页
 *   → 判定"我的导航没生效" → 再导航 → 乒乓 57 次。per-tab 动作串行化（8d32f6d）只保证
 *   "动作不并发"，管不了"两个逻辑流先后打到同一页"的互踩 —— 浏览器是单活动页状态机，
 *   **驱动它的执行流必须互斥**。
 *
 * ★ 为什么按"挂了 browser_* 工具"判：pageAgent 是浏览器操作助手，浏览器活全在子智能体里
 *   （库里实证 57 次 navigate 全带 sub_agent_name），"禁子智能体用浏览器"不可行；
 *   保留并发能力、只把"会碰浏览器的流"串行化，是行为面最小的修法。
 *
 * ★ 宁可串行不可漏判：agentId 解析不出 / 查不到行 / 配置损坏，一律按**会碰浏览器**处理。
 */
function isBrowserCapableSubAgent(agentId: unknown, userId: string): boolean {
  const raw = String(agentId ?? '').trim();
  if (!raw) return true;
  const resolvedId = SUBAGENT_ALIASES[raw] || raw;
  try {
    const row = db
      .prepare('SELECT builtin_tool_ids, workflow_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
      .get(resolvedId, userId) as any;
    if (!row) return true;
    let ids: string[] = [];
    try { ids = JSON.parse(row.builtin_tool_ids || '[]'); } catch { return true; }
    if (toolIdsIncludeBrowser(ids)) return true;
    // ★ 2026-10-15：工作流型子智能体的工具面在 workflow_json（builtin_tool_ids 为空）——
    //   含 browser_* 节点的流水线同样会驱动浏览器，一并按"浏览器型"处理（宁可串行不可漏判）。
    return !!row.workflow_json && String(row.workflow_json).includes('browser_');
  } catch { return true; }
}

/** 工具 id 列表里是否含浏览器工具 —— **唯一判据**（isBrowserCapableSubAgent 与
 *  runSubAgentImpl 的运行期记账共用，防两处漂移）。 */
function toolIdsIncludeBrowser(ids: unknown): boolean {
  return (Array.isArray(ids) ? ids : []).some((n) => String(n).startsWith('browser_'));
}

/** 浏览器流的**标签页键**：这个子智能体该在哪条流上驱动浏览器（2026-10-15 后台标签页方案 §4.2）。
 *
 *  · `SHARED_FLOW`（缺省）—— 与本会话共用"当前操作页"：一把锁、一份锚
 *    ⇒ 两个浏览器型子智能体**串行**（这正是"导航跑偏"要拦的那类互踩）；
 *  · `bg:<flowId>` —— 自己的**后台标签页**：锁独立、锚独立 ⇒ 可与另一条流**并行**（各读各的页），
 *    且**不抢**用户正在看的页（桌面端不会激活后台流建的页，见 main.cjs 的 createBrowserTab）。
 *
 *  ★ flowId 用**委派方的 toolCallId**（那次 `call_agent` 调用的 id）：它天然唯一，且与流锁里的
 *    `sub:<toolCallId>` 同源 —— 一处取值、两处共用（服务端锁 + 桌面端锚维度）。
 *  ★ `bg:` 前缀同时是**桌面端识别"这是后台流"的唯一依据**（main.cjs 的 isBackgroundFlow）：
 *    前后端不各写一份判据，避免"锁在后台、锚却在共享"这类查不出来的漂移。
 *
 *  ★ 导出供测试真跑（判据错了的表现是"以为各占一页、其实抢同一页"，不报错且难查）。
 */
export function browserFlowKeyOf(args: any, parentToolCallId: string, agentConf?: any): string {
  let conf = agentConf;
  if (typeof conf === 'string') {
    try { conf = JSON.parse(conf); } catch { conf = null; }
  }
  // call_agent 入参优先，其次子智能体配置（默认继承），最后回落共享页
  const t = String(
    args?.browserTarget ?? args?.browser_target
    ?? conf?.browserTarget ?? conf?.browser_target
    ?? '',
  ).trim().toLowerCase();
  return t === 'background' ? `bg:sub:${parentToolCallId}` : SHARED_FLOW;
}

/** 读取子智能体配置（供 browser_target 默认继承）；查不到/损坏一律返回 null */
function agentConfigOf(agentId: unknown, userId: string): any {
  const id = String(agentId ?? '').trim();
  if (!id) return null;
  try {
    const row = db.prepare('SELECT config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(id, userId) as any;
    return row?.config_json ? JSON.parse(row.config_json) : null;
  } catch {
    return null;
  }
}

/** 前端提交工具执行结果 */
export function resolveToolResult(taskId: string, callId: string, result: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  const pending = task.pendingToolCalls.get(callId);
  if (!pending) return;
  task.pendingToolCalls.delete(callId);
  clearPendingTimers(pending);
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

// ★ 标题变更回推（2026-10-11）：conversation-title 生成成功后经此把新标题推到会话级总线，
//   前端订阅处就地更新列表标题（与终态双发同一通道，无需轮询/刷新）。
//   模块加载即安装（emitConversation 是本模块私有函数，只能在这拿得到）。
setTitleChangeNotifier((conversationId, title) => {
  emitConversation(conversationId, { type: 'conversation:title', conversationId, title });
});

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
 * ★★★ 手动压缩（D3-转，2026-10-10）：用户主动「现在压一下」。
 *
 * ★ 为什么需要：自动压缩只在超过 `target`（有效窗口 = 标称×25%）时触发；
 *   用户有时**明知上下文很满**（想省钱/提速/避免触顶）却没有手段提前压缩。
 *
 * ★ 为什么放在本文件（而不是新写一份压缩）：这里能直接复用**同一套流水线**——
 *   `buildContextView` + `mainlineMessages`（剔除子智能体）+ `loadPlatform/loadModel`
 *   （解析摘要模型）+ `summaryCache` 语义（增量摘要）。**另写一份必然漂移**。
 *
 * ★ 与自动压缩的唯一差别：传 `forceCompress: true`（跳过阈值判定），
 *   其余（摘要/落库/兜底/配对保护）**完全同一条路径**。
 *
 * @returns 压缩摘要与统计（供前端回显）；失败返回 `{ ok: false, error }`
 */
export async function compressConversationNow(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; compacted?: boolean; summary?: string; coveredCount?: number; tokensBefore?: number; tokensAfter?: number }> {
  try {
    const conv = db.prepare('SELECT platform_id, model_id FROM conversation WHERE id = ?').get(conversationId) as
      | { platform_id?: string | null; model_id?: string | null } | undefined;
    if (!conv) return { ok: false, error: '会话不存在' };
    // 模型：优先会话自己的，回落第一个可用（与"记忆抽取/压缩前抢救"同一口径）
    const platform = conv.platform_id ? loadPlatform(conv.platform_id, userId) : null;
    const model = platform && conv.model_id ? loadModel(conv.model_id, userId, platform.id) : null;
    if (!platform || !model) return { ok: false, error: '该会话未绑定可用的模型平台，无法生成摘要（请先在会话里选择模型）' };

    const raw = mainlineMessages(loadMessages(conversationId))
      .filter((m) => m.content || m.toolCalls || m.role === 'tool' || (m as any).reasoningContent);
    if (!raw.length) return { ok: false, error: '会话没有可压缩的消息' };

    let captured = '';
    const view = await buildContextView({
      conversationId,
      userId,
      rawMessages: raw,
      model,
      keepRecent: 6,
      keepFirst: 2,
      summaryCache: { ids: [], summary: '' },
      setSummaryModel: (cw) => {
        cw.setSummaryModel(platform, model);
        // ★ 摘要记账（2026-10-18）：手动压缩也花钱，此前完全没进账本。
        //   无 task ⇒ 走 recordStandaloneUsage（会话账单里 source='summary'）。
        cw.setSummaryUsageHook((detail, info) => {
          recordStandaloneUsage({
            conversationId, userId,
            platformId: platform.id, modelId: model.modelId,
            source: 'summary', detail,
            inputText: info.inputText, outputText: info.outputText,
          });
        });
      },
      // ★ 手动触发：跳过阈值判定（其余走同一条流水线）
      forceCompress: true,
      beforeCompress: async (toCompress) => {
        // ★ 与自动路径一致：压缩前把即将被吞掉的细节先落盘（记忆抢救），失败不阻塞压缩。
        //   ★ 用**同一个** `flushMemoriesBeforeCompression`（真实签名：
        //     `(params, toCompress)`）—— 不另写一份（另写必然漂移）。
        try {
          await flushMemoriesBeforeCompression(
            { userId, conversationId, agentId: null, platform, model },
            toCompress,
          );
        } catch { /* 不阻塞 */ }
      },
    });
    const latest = getLatestMessageSummary(conversationId);
    captured = latest?.summary || '';
    return {
      ok: true,
      compacted: view.compacted,
      summary: captured,
      coveredCount: latest?.messageIds?.length || 0,
      tokensBefore: view.tokens,
      tokensAfter: view.tokens,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * 启动时回收上次进程遗留的孤儿任务：DB 里 running/waiting_tool → interrupted。
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
/**
 * 回查运维现场并组装成系统提示词片段（2026-10-21）。
 *
 * 前端只下发 **id + 终端尾部文本**（薄描述）；连接名称/主机/类型、发布项目详情
 * 一律按 id 回查 —— 前端传什么信什么会导致"显示 A 实际连 B"，且连接改名后旧值残留。
 * 插件未启用（ops-shell 不可用）时静默返回空串：不阻断任务，模型仍可 conn_list 自查。
 */
async function loadOpsFieldContext(input: OpsContextInput): Promise<string> {
  try {
    const mod = await import('./plugins/ops-shell.js');
    const conns = await mod.loadConnections();
    const connection = input.connectionId ? (conns.find((c) => c.id === input.connectionId) || null) : null;
    const project = input.releaseProjectId
      ? ((await mod.loadReleaseProjects()).find((p) => p.id === input.releaseProjectId) || null)
      : null;
    return buildOpsFieldContext({
      input,
      connection: connection as OpsConnectionInfo | null,
      releaseProject: project as OpsReleaseProjectInfo | null,
      resolveConnectionName: (id) => conns.find((c) => c.id === id)?.name,
    });
  } catch {
    // 插件未启用 / 存储不可用：不注入现场（模型仍可 conn_list 自查），不阻断任务
    return '';
  }
}

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
  /** 运维现场（AI 模式窗口）：服务端回查连接/发布项目后注入系统提示词，不进用户回合 */
  opsContext?: OpsContextInput;
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

    // let：故障转移换模型时会连同平台一起指向新候选（见下方 failoverChain）
    let platform = loadPlatform(params.platformId, userId);
    // 带上 platformId：存量裸名回退时限定平台，避免同 API 名跨平台误命中另一个模型
    let model = loadModel(params.modelId, userId, params.platformId);
    if (!platform || !model) {
      // 平台/模型失效：错误提示作为 assistant 消息落库+推送（刷新后仍可见），只发 task:error 前端仅 toast、刷新即丢
      const errMsg = `平台或模型不存在或已失效（platformId: ${params.platformId}），请在「设置 → 模型平台」重新选择可用模型后重试。`;
      const aid = insertMessage(convId, userId, 'assistant', errMsg);
      emit(task, { type: 'message:added', message: { id: aid, role: 'assistant', content: errMsg } });
      emit(task, { type: 'task:error', error: '平台或模型不存在' });
      task.status = 'failed';
      return;
    }

    // ★ let：故障转移（model-candidate-pools P3）会换模型，client 与 model 都要能重新指向
    let client = new LlmClient(platform, model);
    ensureToolsInitialized();
    const registry = getToolRegistry();
    const modelCaps = model.capabilities as string[] | undefined;
    const supportsTools = modelSupportsTools(modelCaps);

    // ===== 候选池故障转移链（model-candidate-pools P3）=====
    // 当前模型在首位，其后是池中其余候选：只有当前模型**真的失败**（429/5xx/网络/超时）才换。
    // 链随任务存活（不落库）—— 幂等只需覆盖本次运行期间的重试。
    const failoverChain = resolveFailoverChain(
      db,
      { userId, agentId: params.agentId ?? null },
      model.id,
      'llm',
    );
    let failoverCursor = 0;
    /** 换到链上下一个候选模型并重建 client；无可换返回 null */
    const switchToNextModel = (): string | null => {
      while (failoverCursor + 1 < failoverChain.length) {
        failoverCursor++;
        const next = failoverChain[failoverCursor];
        const nextPlatform = loadPlatform(next.platformId, userId);
        if (!nextPlatform) continue;
        model = next.model;
        platform = nextPlatform;
        client = new LlmClient(nextPlatform, next.model);
        return next.model.id;
      }
      return null;
    };

    // 后端统一构建 systemPrompt/tools（单一事实来源）：前端只传 agentId/appGuide。
    // 历史兼容：显式传 systemPrompt/tools 则优先（定时任务等场景）。
    // 模式开关（前端「+」菜单）：无论提示词来自哪条路径，模式指令统一由后端追加、工具统一由后端裁剪。
    const modeFlags = params.modeFlags || {};
    const modePrompt: string[] = [];
    if (modeFlags.thinking) {
      // ★ 2026-10-18 按用户定义重写：深度思考 ≠ "多想想"，而是**复杂任务的完整工作流** ——
      //   查证（主动用搜索工具，不臆造）→ 归纳分类 → 复杂任务拆计划/章节 → 逐项执行并汇报。
      //   与计划模式的关系：计划模式只管"先计划再动手"；本模式额外承担"主动查证 + 归类"，
      //   计划部分与其指令族相同（task_plan 可用则登记），两个开关同开不冲突（指令幂等）。
      modePrompt.push(
        '- 深度思考模式（复杂任务工作流）：' +
        '① 评估回答需要哪些信息，已有知识与上下文不够时，主动调用搜索/资料类工具查证，不凭空臆造；' +
        '② 对查到的材料去重、分类、归纳要点，引用时注明来源；' +
        '③ 若任务较大或可拆分（如撰写长文/报告），先给出章节或步骤计划——task_plan 工具可用则用 task_plan/task_step 登记并随进度更新，否则用编号列表；' +
        '④ 严格按计划逐项执行，每完成一项简要汇报进度；执行中发现新信息或偏差，先修订计划再继续；' +
        '⑤ 最终输出结构化成果，重点突出，关键结论标注依据。'
      );
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
      const convRow = db.prepare('SELECT space_id, task_type FROM conversation WHERE id = ?').get(convId) as
        | { space_id?: string | null; task_type?: string | null }
        | undefined;
      const spaceId = convRow?.space_id;
      if (spaceId) {
        const tRow = db.prepare('SELECT task_type, task_config_json FROM space WHERE id = ?').get(spaceId) as
          | { task_type?: string | null; task_config_json?: string | null }
          | undefined;
        // ★ 任务级优先于目录级（2026-10-14「父任务」层）：多任务目录（空间绑父类型）里
        //   每条任务各选一条子线，选中的线落在 conversation.task_type。
        //   顺序反了的后果：目录换了类型，老任务的线被悄悄改掉，且不报错。
        const taskType = convRow?.task_type || tRow?.task_type || null;
        if (taskType) {
          let batchSize = DEFAULT_CONFIRM_BATCH_SIZE;
          try {
            const cfg = tRow?.task_config_json ? JSON.parse(tRow.task_config_json) : null;
            if (cfg && Number.isFinite(Number(cfg.confirmBatchSize))) batchSize = Number(cfg.confirmBatchSize);
          } catch { /* 配置损坏按默认 */ }
          // 父任务类型本身没有 SOP —— 注入「选线」引导，让模型先问用户本条任务走哪条子线。
          // 不引导的后果：模型自己猜一条线一路跑完（用户想带货它给你做选题），且不报错。
          // ★ 配置表化后：以**库行**为准（用户在库里新建/改过的类型必须进得了提示词），
          //   库里没有的（首次启动未 seed / seed 失败）才退回内置 TASK_TYPES 补齐。
          //   只查内置数组 = 用户自建类型形同虚设；只查库 = seed 失败时 SOP 整体消失。
          const effective = loadEffectiveTaskTypes();
          const hit = effective.find((t) => t.id === taskType) || null;
          // 两种父（2026-10-17）：① 独立「父任务」类型（id=parent，容器语义，子线 = 全部具体类型）；
          //   ② 业务父类型（douyin_ops 等，子线 = 注册在它下面的几条）。
          const isConcrete = (t: { id: string }) =>
            t.id !== 'parent' && !effective.some((c) => c.parentId === t.id);
          const childTypes = taskType === 'parent'
            ? effective.filter(isConcrete)
            : effective.filter((t) => t.parentId === taskType);
          const parent = hit && (taskType === 'parent' || childTypes.length > 0);
          const ctx = parent && hit
            ? formatParentTaskTypeSpecContext(hit, childTypes)
            : hit
              ? formatTaskTypeSpecContext(hit, batchSize)
              // 库里查不到也不在内置清单里（如类型被删）：按 id 走内置薄壳，兜底为空串（不阻断）
              : formatTaskTypeContext(taskType, batchSize);
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
    // ★ 店铺模式且没有有效目录时不注入：否则会读到全局工作目录下**别的项目**的经验档案。
    try {
      const effDir = resolveEffectiveWorkspaceDir(convId, params.workspaceDir);
      const skipForShop = resolveConversationMode(convId) === 'shop' && !effDir;
      if (!skipForShop) {
        const expCtx = buildExperienceContextForConversation(convId, params.userContent, effDir);
        if (expCtx) {
          systemPromptBuilt += '\n\n' + expCtx;
        }
      }
    } catch { /* 经验注入失败不影响任务 */ }
    // 浏览器记忆不做自动注入：按需召回模式，智能体需要时调用 api_browser_memory_read 工具拉取
    if (modePrompt.length) {
      systemPromptBuilt += '\n\n## 模式指令（用户在输入框开启，优先级高于默认行为）\n' + modePrompt.join('\n');
    }
    // 运维现场注入（2026-10-21）：连接名/主机/终端现场/发布目标。
    // ★ 这些信息**只进系统提示词，不进用户回合** —— 用户消息保持原话入库，
    //   现场每轮现算（连接改名、终端输出变化都能立刻反映），历史不会被脏数据污染。
    if (params.opsContext) {
      try {
        const ctx = await loadOpsFieldContext(params.opsContext);
        if (ctx) systemPromptBuilt += '\n\n' + ctx;
      } catch { /* 现场注入失败不影响任务（模型仍可用 conn_list 自查） */ }
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
    // ★ 费用硬停触达（2026-10-17，D4 唯一例外）：用户自填 hardStopCny > 0 才会出现，
    //   出厂默认 0 ⇒ 本标记永远是 null。★ 2026-10-18：原 P1-9 预算闸（token/墙钟触达自动停）
    //   已按用户决策退役 ——「不要程序自动停」，停语义只剩这一处（自填才启用）。
    let costHardStop: { used: number; limit: number } | null = null;
    // 累计已消耗步数（跨自动接力批次），用于 step 事件与日志的连续计数
    let emittedStep = 0;
    // ★ 循环闸门硬停标记（2026-10-10）：同一工具被反复拦截达阈值 → 置位 → 跳出内层循环走收尾
    let forceStoppedByLoopGuard = false;

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
          setSummaryModel: (cw) => {
            cw.setSummaryModel(sumLlm.platform, sumLlm.model);
            // ★ 摘要记账（2026-10-18）：压缩摘要此前完全没进账本（会话账单对不上、
            //   ¥5 阈值对摘要无感）。走 recordTaskUsage（source='summary'），与其它环节同口径：
            //   单价任务内缓存解析、估算兜底（坑 #13）、失败不炸任务。
            cw.setSummaryUsageHook((detail, info) => {
              recordTaskUsage(task, 'summary', detail,
                { platformId: sumLlm.platform?.id, modelId: sumLlm.model?.modelId },
                { inputText: info.inputText, outputText: info.outputText });
            });
          },
          beforeCompress: async (toCompress) => {
            // ★★★ 抢救节流：**每个接力批次一次**，不是每个任务一次（2026-10-08 修）。
            //   此前 `flushedThisRun` 是 runReActLoop 的**函数级**变量，全程只置一次 →
            //   一个跑 3 个批次的长任务，只有**第一批**压缩时抢救了记忆，
            //   第二、三批的压缩**一路白压**：被摘要吞掉的细节既没进记忆、也没进计划。
            //   批次是"上下文事实上被结算"的自然边界（每批开头都会重算预算），
            //   按它节流既不会每次压缩都调 LLM，也不会漏掉整批。
            if (flushedBatch === batch) return;
            flushedBatch = batch;
            // platform/model 改为 let 后 TS 不再保留「上方 if (!platform || !model) 已返回」的窄化，
            // 这里两者必然非空（守卫在上面），用断言表达已知不变式
            const memLlm = resolveMemoryExtractLlm(task) || { platform, model };
            await flushMemoriesBeforeCompression(
              { userId, conversationId: convId, agentId: task.agentId ?? null, platform: memLlm.platform!, model: memLlm.model! },
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
        await attachImagesToMessages(llmMessages, task);

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
          // ★ 2026-10-12 P2：系统提示词已内联在 messages[0] 时**不再重复存顶层字段**
          //   （见 context-snapshot.ts 的 buildSnapshotSystemFields —— 每条省 11KB / 30%）。
          ...buildSnapshotSystemFields(llmMessages),
          // ★ 2026-10-12 P2：tools 在会话内跨步骤高度重复（实测单会话仅 4 个版本却存 491 次）
          //   → 存「内容哈希引用」，读侧 hydrateSnapshot 回填（展示零变化，每条省 ~9KB）。
          toolsRef: internSnapshotBlob('tools', JSON.stringify(toolsBuilt.map((t: any) => ({
            name: t.function?.name || t.name,
            description: t.function?.description || '',
            parameters: t.function?.parameters,
          })))),
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
              // ★ 累积逻辑抽到纯函数（见 accumulateToolCallDeltas）—— 便于单测钉住
              //   「两个工具的参数不互相覆盖」这条不变量（2026-10-10 实测踩到：
              //   call_agent 的 arguments 只收到 30 字符）。
              accumulateToolCallDeltas(toolCallAcc, chunk.delta.toolCalls);
              emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
            }
          }
        };

        // ★ 费用记账回调（2026-10-17）：本步所有 LLM 调用（含重试/降级路径）共用。
        //   meta 由 client 填**实际发出请求的**平台/模型 —— 候选池故障转移后也不会记错模型。
        //   三条重试路径的 opts 都必须带上它，漏一条那笔钱就静默不进账本。
        const usageRecorder = (source: 'main' | 'sub_agent' | 'summary' | 'judge') =>
          (detail: TokenUsageDetail | undefined, meta: { platformId?: string; modelId?: string }) =>
            recordTaskUsage(task, source, detail, meta, { messages: llmMessages, content: fullContent, reasoning: fullReasoning });

        const streamOpts = {
          tools: tools.length > 0 ? tools : undefined,
          temperature: effOpts.temperature,
          maxTokens: effOpts.maxTokens,
          topP: effOpts.topP,
          frequencyPenalty: effOpts.frequencyPenalty,
          presencePenalty: effOpts.presencePenalty,
          reasoningEffort: effOpts.reasoningEffort,
          signal: task.abortController.signal,
          onUsage: usageRecorder('main'),
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
              onUsage: usageRecorder('main'),
            });
          } else if (isPoolFailoverable(e)) {
            // ★ 候选池故障转移（model-candidate-pools P3）：长任务长时间打同一个模型
            //   会撞上游限流（429）或服务错误（5xx）—— 逐个换池中下一个候选重试本轮，
            //   换完仍失败才抛出（抛出的错误按原路径落库到助手占位消息）。
            const nextId = switchToNextModel();
            if (nextId) {
              logger.warn(
                `[llm-task] 模型调用失败，切换到候选池下一模型重试：${failoverChain[failoverCursor - 1]?.model.id} → ${nextId}` +
                `（第 ${failoverCursor + 1}/${failoverChain.length} 个候选）conv=${task.conversationId} err=${e?.message || e}`,
              );
              // 重置本轮累加器：失败那次可能已经吐了半截内容/工具调用残片
              fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
              streamFinish = undefined; streamFlag.terminated = true;
              await consumeStream(streamOpts);
            } else {
              logger.warn(`[llm-task] 候选池 ${failoverChain.length} 个模型全部失败，放弃故障转移 conv=${task.conversationId}`);
              throw e;
            }
          } else {
            throw e;
          }
        }

        // ★★★ P0（2026-10-09 引入 / 2026-10-10 校正判据）：流被上游/代理**提前掐断**的处置。
        //
        // ★ 判据抽到 `isStreamUnterminated()`（纯函数，可单测）—— **2026-10-10 实据修正**：
        //   旧判据 `(terminated === false || (!finish && !content && !reasoning)) && !toolCalls`
        //   在「代理半途关流、terminated 标记未送达」时**完全失效**（实测 20:21 用户现场：
        //   content='' + reasoning 7269 字半截 + 无终态 → 被判"正常完成"）。
        //   新判据以 **「无 finish_reason」** 为主（正常流必带终态），覆盖推理模型
        //   "reasoning 先吐、正文后吐"被拦腰掐断的典型形态。
        // 处置：先**就地续写**（把已产出内容当 assistant 前缀 prefill 重新发起，追加到尾部）。
        //   prefill **不带 tools**：部分 OpenAI 兼容端点在「assistant 前缀 + tools」下会 400（与既有
        //   "重试不带 tools" 同口径）。续写用尽仍失败 → 标截断，由下方落**可见**错误、绝不静默留白。
        const unterminated = isStreamUnterminated({
          terminated: streamFlag.terminated,
          finishReason: streamFinish,
          hasToolCalls: toolCallAcc.length > 0,
          contentLen: fullContent.length,
          reasoningLen: fullReasoning.length,
        });
        if (unterminated) {
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
        // 供可观测（task.totalTokens，只记不停 —— 2026-10-18 预算闸退役后不再参与判定）。
        // 粗估口径：内容长度 / 2（与 estTokens 一致）。
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
          const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION') || fullContent.toUpperCase().includes('<|DSML|');
          // ★ reasoning 兜底（2026-09-29 修正）：此前 content 里有工具块时**完全不看 reasoning**，
          //   而 content 与 reasoning 各有一部分工具输出（或参数只吐在 reasoning 里）的模型会漏解析。
          //   现在：content 解析结果**为空**或**存在空参**时，再从 reasoning 补一次。
          const hasToolInReasoning = fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION') || fullReasoning.toUpperCase().includes('<|DSML|');
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

        // ★★★ P0（2026-10-09 引入 / 2026-10-10 校正判据）不静默：续写仍失败且**正文为空**时，
        //   绝不留下"空气泡" —— 旧行为正是 content='' + reasoning 半截 直接落库，
        //   用户看到"转半天不出话"。
        //   ★ 判据从 `streamFlag.terminated === false` 改为 `unterminated`（见 isStreamUnterminated）：
        //     前者要求"明确收到截断标记"，代理半关 TCP 时标记常不送达 → 兜底静默失效（实测 10-10 20:21）。
        //     现在只要「本轮未正常收尾」且正文为空，就落可见提示（reasoning 原文仍在行内可供排查），
        //     让用户知道"被中断了、可重试"，而不是以为模型什么都没做。
        if (!fullContent.trim() && unterminated) {
          fullContent = TRUNCATED_STREAM_NOTICE;
          logger.warn(
            `[llm-task] 断流且无正文留痕（msg=${assistantMsgId} conv=${task.conversationId} ` +
            `reasoning=${fullReasoning.length} 字 finish=${streamFinish || '无'} terminated=${streamFlag.terminated}）—— 已落可见提示`,
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
          // 空回复兜底：模型返回空内容（常见于工具全失败，或首轮就被掐断）→ 补提示避免用户看到空白。
          // ★ 2026-10-10 修正两处（实测 20:21 用户现场"继续后又断了"）：
          //   ① 去掉 `step > 0` —— 旧条件让**首轮**（step=0）空回复完全不兜底，
          //      而"刚点继续就被掐"恰是首轮，最需要提示的场景反而没有；
          //   ② 覆盖「正文为空」全形态（含"只有半截 reasoning、无正文"这一推理模型典型截断）。
          //   注：若上方第一道防线已把正文替换为 TRUNCATED_STREAM_NOTICE，则此处不再重复覆盖
          //   （那句提示本身已足够可见、且信息更准）。
          // ★★★ 2026-10-10 二次修正：**必须按 finish_reason 分派文案**（实测复现根因）——
          //   直连上游实测：`deepseek-flash`（推理模型）在 `max_tokens=200` 时
          //   reasoning 吃满 313 字、**content 恒为空**、`finish_reason='length'`；
          //   调到 2048 即正常（reasoning 1311 字 + content 正常）。即"空正文"的**真因**
          //   多半是「推理 token 挤占了输出预算」，**不是**上游中断。
          //   旧文案一律说"上游中断或工具失败" → 把用户引向错误方向（实测用户已困惑）。
          if (!fullContent.trim()) {
            const isLengthCapped = streamFinish === 'length';
            const tip = isLengthCapped
              ? '（本轮**输出达到长度上限**，模型把预算全用在思考上、没来得及写正文。\n' +
                '这是推理模型（如 deepseek-flash）在「最大输出 tokens」偏小、或上下文过长时的典型表现。\n' +
                '建议：① 在模型设置里调大「最大输出 tokens」；② 或换一个非推理模型；③ 或把任务拆小/新开会话降低上下文。）'
              : (!streamFinish
                ? '（助手未返回有效内容：本轮上游输出被提前中断（没有正常收尾标记）。请重试，或换一种问法。）'
                : '（助手未返回有效内容，可能是工具调用失败导致。请重试或换一种问法。）');
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
        // ★★★ 2026-10-15「导航跑偏」P0-①：同批 call_agent 的**浏览器型**识别（每批算一次）。
        //   · 浏览器是**单活动页状态机** —— 两个**浏览器型**子智能体并发跑必然互踩：
        //     A 导航完 B 立刻覆盖同一锚 tab，A 读到 B 的页 → 判定"我的导航没生效" → 再导航
        //     → 乒乓（实测 10-14 晚单会话 57 次 navigate、5 个孤儿 tab、453:0 的 tabId 使用比）。
        //   · 判据**只针对"同批还有另一个浏览器型"**：非浏览器型兄弟（代码/检索类子智能体）
        //     与它并发是安全的（不碰浏览器），保留并发不牺牲既有收益。
        //   · 解析失败/查不到按"浏览器型"兜底（宁可串行不可漏判，见 isBrowserCapableSubAgent）。
        //
        // ★★★ 2026-10-15（后台标签页方案 §4.2）：串行化判据**从"同批有 ≥2 个浏览器型"收紧为
        //   "本批有另一个浏览器型**落在同一个标签页上**"**。
        //   为什么必须收紧：互斥的正确粒度是**标签页**（浏览器是每页一个活动页状态机）——
        //   两条流各自申请了后台页（不同 tabKey）时并发是安全的。不收紧的话
        //   `browserTarget:'background'` 会被这一层**无差别串行掉**，整个方案的收益归零。
        const batchCallAgentBrowser = new Map<any, boolean>();
        const batchCallAgentTabKey = new Map<any, string>();
        for (const tc of toolCallAcc) {
          const n = tc.function?.name || (tc as any).toolName || '';
          if (n !== 'call_agent') continue;
          const a = parseToolArguments(tc.function?.arguments).args as any;
          const capable = a === null ? true : isBrowserCapableSubAgent(a?.agentId ?? a?.agent_id ?? a?.id, task.userId);
          batchCallAgentBrowser.set(tc, capable);
          // 解析失败按"浏览器型 + 共享页"兜底（与上面的兜底同一取向）
          if (capable) batchCallAgentTabKey.set(tc, a === null ? SHARED_FLOW : browserFlowKeyOf(a, String(tc.id || ''), agentConfigOf(a?.agentId ?? a?.agent_id ?? a?.id, task.userId)));
        }
        // 每个 tabKey 上**只放一个**进并发批（同页的第二个改串行 —— 同一页上并发才会互踩）
        const tabKeyTaken = new Set<string>();

        const parallelizableCalls = toolCallAcc.filter((tc) => {
          const n = tc.function?.name || (tc as any).toolName || '';
          if (parseToolArguments(tc.function?.arguments).args === null) return false;
          if (n === 'call_agent') {
            if (batchCallAgentBrowser.get(tc) === true) {
              const key = batchCallAgentTabKey.get(tc) || SHARED_FLOW;
              if (tabKeyTaken.has(key)) {
                logger.warn(`[llm-task] 同批已有浏览器型子智能体占着同一个标签页（tab=${key}）→ 本个改串行（防两流抢同一页）conv=${task.conversationId}`);
                return false;
              }
              tabKeyTaken.add(key);
            }
            return true;
          }
          return READONLY_PARALLEL_TOOLS.has(n);
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
          const toolResult = await runToolCallAndPersist({
            task, registry, convId, userId, assistantMsgId,
            toolName, args, tcId: tc.id || '', depth: 0, toolDefs: toolsBuilt, uiTools: UI_TOOLS,
            precomputed: pre,
          });
          // ★★★ 循环闸门硬停（2026-10-10）：同一工具被拦到 TOOL_BLOCK_HARD_LIMIT 次后，
          //   闸门返回带 FORCE_STOP_MARKER 的文案。此处**跳出内层 ReAct 循环**，
          //   不再把控制权交回模型（它只会换参数继续试探 —— 实测 6 次拦截就是这么来的）。
          //   跳出后走与"步数上限"相同的收尾块（结账 → 自评 → 接力确认），保证任务能收敛。
          //
          // ★★★ 判据必须是 **startsWith**，不能是 includes（2026-10-14 实报，high）：
          //   闸门自己产出的串**必定以标记开头**；而工具结果里**提到**这四个字是常态 ——
          //   ① file_grep 搜到经验档里那句"[FORCE_STOP]…导致后续阶段全部中断"的历史笔记；
          //   ② 子智能体的收尾报告引用它收到的拦截原文，随后原样回传父任务。
          //   用 includes 时这两种都会**误伤**：实测 conv 96125908 于 16:02:10 只因 file_grep
          //   读到了那句笔记就把整个任务硬停；16:54:55 又因子报告引用该标记把父任务硬停 ——
          //   而那一刻合集弹窗已打开、3 条目标视频就在列表里，只差两步。
          if (String(toolResult || '').startsWith(FORCE_STOP_MARKER)) {
            logger.warn(
              `[llm-task] 循环闸门硬停: conv=${task.conversationId} tool=${toolName} ` +
              `→ 跳出内层循环走收尾（避免无休止换参数重试）`,
            );
            forceStoppedByLoopGuard = true;
            break;
          }
        }

        // 被循环闸门硬停 → 立刻跳出本轮，不再进入下一轮 ReAct
        if (forceStoppedByLoopGuard) break;

        // ── 轮末费用判定（D4：默认只提醒；用户自填 hardStopCny 才硬停）──────────
        //   ★ 2026-10-18：原轮首的 token/墙钟预算闸已退役，本判定是任务里**唯一**的
        //     费用类闸：提醒分支（emit task:cost_notice）不停任务，硬停分支只在
        //     用户自填了 hardStopCny 时才会走到（出厂 0 = 永不停）。
        //   ★ 提醒默认**不落会话消息**（emit task:cost_notice + 前端提示条）——
        //     落进消息会进上下文，后续每轮输入都多带这段，提醒自身在推高它提醒的数字（坑 #15）。
        if (noticeCostAtRoundEnd(task) === 'hard_stop') {
          const cfg = getCostBudgetConfig();
          costHardStop = { used: getConversationUsage(task.conversationId)?.costCny || 0, limit: cfg.hardStopCny };
          logger.warn(
            `[llm-task] 费用硬停（用户自填 hardStopCny）: conv=${task.conversationId} ` +
            `used=¥${costHardStop.used.toFixed(2)} limit=¥${costHardStop.limit.toFixed(2)}`,
          );
          break;
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
      let tipText = costHardStop
        // ★ D4 唯一例外：费用硬停（用户自填 hardStopCny，出厂默认 0 = 永不触发）。
        //   措辞必须点明"这是你自己设的上限"—— 默认配置下用户永远看不到这句。
        ? `已达到费用硬停上限（本会话累计约 ¥${costHardStop.used.toFixed(2)} / 上限 ¥${costHardStop.limit.toFixed(2)}），任务已停止。如需继续：调高「设置 → 费用预算 → 硬停上限」后把任务要求再发一次；设为 0 表示永不停（只提醒）。`
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
          // ★ 费用记账（2026-10-17）：结账自评也真花钱，source='judge'。
          //   注意它发生在**本批循环已结束**之后 ⇒ 轮末判定看不到这笔；
          //   这正是"库累计"口径要覆盖的场景（下一批轮末会读到）。
          onUsage: (detail, meta) => recordTaskUsage(task, 'judge', detail, meta, { messages: history }),
        });
        summaryText = judged.summary;
        if (summaryText) {
          // ★ 2026-10-09 修：原实现**无条件**把 tipText 覆盖成"单批最大循环步数"，
          //   把预算真因（墙钟/token）冲掉 → 库里只剩「注：本次任务已达到单批最大循环步数（200）」，
          //   用户拿到的是"步数不够"的错方向。改为按实际触达的闸门措辞。
          tipText = `${summaryText}\n\n（注：${costHardStop
            ? '本次任务已达到费用硬停上限（用户自设）'
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
        // ★★★ 接力决策（2026-10-18 修订）：原「预算触达 → 有限接力 + 基线重置」机制随
        //   P1-9 预算闸一并退役 —— 用户明确「不要程序自动停，效果不好，费用提醒就好」：
        //   token/墙钟只做可观测，不再参与停/续判定。
        //   防失控兜底不变：autoContinueHardCap(30 批) + 停滞判定 + 4h 总时长硬顶 + 2h 回收看门狗。
        //   费用硬停（costHardStop）是唯一例外：它本来就是用户自设的"到此为止"，不接力。
        if (expectedContinue && !aborted && !degenerate && !costHardStop) {
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
          // ★★★ 循环闸门硬停优先于一切接力决策（2026-10-10）：
          //   同一工具被反复拦截说明"这条路真的走不通"，此时**接力只会让它接着磨**
          //   （新批次带着同样的上下文与同样的工具，模型大概率继续换参数试探）。
          //   ⇒ 直接收尾并明确告知用户，而不是烧最坏 30 批 × 15 分钟 = 7.5 小时。
          if (forceStoppedByLoopGuard) {
            tipText = `${tipText}\n\n（任务已停止：检测到工具调用陷入循环，同一工具连续多次被防失控闸门拦截，已强制收尾。）`;
            const stopId = insertMessage(convId, userId, 'assistant', tipText);
            emit(task, { type: 'message:added', message: { id: stopId, role: 'assistant', content: tipText } });
            emit(task, { type: 'task:completed' });
            task.status = 'completed';
            void recordTaskProgress(task, 'loop_guard_stop', tipText, { steps: budgetReached });
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
            (judged.reason ? `（依据：${judged.reason}）` : '');
          const contId = insertMessage(convId, userId, 'assistant', contMsg);
          emit(task, { type: 'message:added', message: { id: contId, role: 'assistant', content: contMsg } });
          emit(task, { type: 'continuation', round: continuationCount, maxRounds: autoContinueHardCap, reason: judged.reason });
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
          : costHardStop ? '已达到费用硬停上限（用户自设，调高「设置 → 费用预算 → 硬停上限」后重发即可继续）'
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

  // ★★★ 2026-10-12（P2）：任务收尾**无条件**裁剪本会话的历史提示词快照。
  //
  //   为什么（实测铁证）：旧实现只在主循环 `step % 20 === 0` 时裁剪（见上方 insertMessage 处），
  //   而由许多**短任务**组成的会话（pageAgent 常态，单任务步数常 < 20）**永远不触发**
  //   ⇒ 快照无上限累积：实测会话 f0a901e3 = **491 条**、c11dfe7b = **463 条**，
  //     均**远超** `SNAPSHOT_KEEP_PER_CONV = 200`（即该上限根本没生效）；
  //     全库 `system_prompt_snapshot` 合计 **149.9MB**（占 data.db 约 60%）。
  //   ⇒ 在此处（completed / aborted / failed **所有出口共用的收尾点**）补一次。
  //     子智能体快照同属本会话（见下方 insertMessage 的子智能体分支），一并被裁。
  //   ★ try/catch：裁剪是"派生物治理"，绝不能影响任务结果与收尾上报。
  try { pruneOldSnapshots(convId, SNAPSHOT_KEEP_PER_CONV); } catch { /* 裁剪失败不影响任务 */ }
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
  /** 费用记账回调（2026-10-17；source='judge' —— 自评/接力判断也真花钱） */
  onUsage?: (detail: TokenUsageDetail | undefined, meta: { platformId?: string; modelId?: string }) => void;
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
    const r = await summarizeOnMaxSteps(args.client, args.systemPrompt, args.history, args.maxSteps, 'main', args.onUsage);
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
 * 写入走**既有单一出口** backendTaskPlan（写库 + 镜像 plan.md）；已完成步骤的计时通过
 * 服务端内部参数 preserved 原样搬入，避免重规划把耗时抹成 0。
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
  const replanMsgs: Message[] = [
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
  ];
  const resp = await client.chat(replanMsgs, {
    temperature: 0.2, maxTokens: 1024, responseFormat: { type: 'json_object' },
    // ★ 费用记账（2026-10-17）：计划重划是接力决策链的一环，source='judge'。
    onUsage: (detail, meta) => recordTaskUsage(args.task, 'judge', detail, meta, { messages: replanMsgs }),
  });
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
  // 保留已完成/失败步骤原状（状态 + 计时），替换剩余部分；一次写入，避免重置计时
  const doneOrFailed = plan.steps.filter((s) => s.status === 'done' || s.status === 'failed');
  const newSteps = [
    ...doneOrFailed.map((s) => ({ title: s.title, ...(s.note ? { note: s.note } : {}) })),
    ...revised,
  ];
  const preserved = doneOrFailed.map((s, i) => ({
    index: i + 1,
    status: s.status as 'done' | 'failed',
    ...(s.startedAt ? { startedAt: s.startedAt } : {}),
    ...(s.finishedAt ? { finishedAt: s.finishedAt } : {}),
    ...(s.activeMs ? { activeMs: s.activeMs } : {}),
  }));
  await backendTaskPlan(args.conversationId, { title: plan.title || '任务计划', steps: newSteps }, preserved);
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

/** 编排/交互类工具：不依赖智能体挂载也必须可用（与 buildToolsForBackend 的无条件暴露口径一致） */
const ALWAYS_ALLOWED_BUILTINS = new Set([
  'plan_tasks', 'get_plan_status', 'reassign_task', 'get_sub_task_detail',
  // 应用即工具：模型自建顶层任务（仅主智能体，executeTool 内 depth 拦截）+ 状态跟进（纯读）
  'app_create_task', 'app_get_task_status',
  // 独立窗口 / 录屏（应用即工具 P1）：弹执行窗口（纯展示）与录屏（前端委托）
  'app_open_window', 'screen_record',
  // 演示后期合成（P1：录屏 → 成片）
  'demo_compose',
  // 科普动画渲染 + 发布队列入队/回写/数据回传（P1 内容矩阵）
  'anim_compose', 'publish_enqueue', 'publish_mark_published', 'publish_record_stats',
  // 设计素材站点清单（纯读信息）
  'design_asset_sites',
  // buildToolsForBackend 无条件暴露的两条委派入口（不依赖挂载）
  'call_agent', 'list_sub_agents',
  ...INTERACTIVE_TOOLS,
]);

/**
 * 当前任务是否有权执行某个后端内置工具。
 * ★ 口径必须与 `buildToolsForBackend` 一致（那才是模型真正看到的工具面）：
 *   agent.builtin_tool_ids ∪ 会话挂载；无 agent 且无会话挂载时沿用兜底（全部非 plugin/非 UI 内置）。
 * ★ 取不到配置时 **fail-closed**（拒绝），不因 DB 抖动放行 —— 与 collectParentToolIds 同取向。
 */
function isBuiltinMountedForTask(task: LlmTask, toolName: string): boolean {
  if (ALWAYS_ALLOWED_BUILTINS.has(toolName)) return true;
  try {
    const convMounts = loadConversationMounts(task.conversationId);
    const isUi = UI_TOOL_NAMES.has(toolName);
    if (isUi && !task.includeUiTools) return false;
    if (!task.agentId && convMounts.builtinToolIds.length === 0) {
      // buildToolsForBackend 的兜底分支：无 agent 且无会话挂载 → 暴露全部非 UI、非 plugin 内置工具
      return !toolName.startsWith('plugin_');
    }
    let agentIds: string[] = [];
    if (task.agentId) {
      const row = db
        .prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
        .get(task.agentId, task.userId) as any;
      try { agentIds = row?.builtin_tool_ids ? JSON.parse(row.builtin_tool_ids) : []; } catch { agentIds = []; }
    }
    return new Set([...agentIds, ...convMounts.builtinToolIds]).has(toolName);
  } catch {
    return false;
  }
}

/**
 * 自定义工具是否挂载到当前智能体/会话（与 buildToolsForBackend 的自定义工具口径一致）。
 * ★ 自定义工具执行的是用户代码，未挂载却可按名字执行等于任意代码执行 —— 必须拦。
 */
function isCustomToolMountedForTask(task: LlmTask, toolName: string): boolean {
  try {
    if (!task.agentId) return true; // 无 agent 的兜底分支：全部自定义工具暴露
    const m = /^custom_([a-zA-Z0-9]{1,8})_(.+)$/.exec(toolName);
    if (!m) return false;
    const [, idTag, tName] = m;
    const rows = db.prepare('SELECT id, name FROM custom_tool WHERE user_id = ? AND enabled = 1').all(task.userId) as any[];
    const tool = rows.find((r: any) =>
      String(r.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) === idTag && r.name === tName);
    if (!tool) return false;
    const row = db
      .prepare('SELECT custom_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
      .get(task.agentId, task.userId) as any;
    let agentIds: string[] = [];
    try { agentIds = row?.custom_tool_ids ? JSON.parse(row.custom_tool_ids) : []; } catch { agentIds = []; }
    const convMounts = loadConversationMounts(task.conversationId);
    return agentIds.includes(tool.id) || convMounts.customToolIds.includes(tool.id);
  } catch {
    return false;
  }
}

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
  /**
   * 本执行流的**浏览器标签页键**（`shared` / `bg:<flowId>`）——透传到桥的 `flow`，
   * 桌面端据此把「锚 / 归属」分到各自流上。缺省 = 共享主面板流
   * （主循环与并发批都不传；子智能体由 `runToolCallAndPersist` 从 ownership 带下来）。
   */
  browserFlowKey?: string,
): Promise<string> {
  // 会话级权限闸（readonly）：写类/不可控工具**不再硬拒**（2026-10-18 授权制语义升级）——
  // 命中即走 `_tool_authorize` 授权卡请求用户批准，批准后本任务内该工具放行；
  // 拒绝/无人值守/前端不可达才拒绝执行。放在函数最顶端 —— 被拒时提前 return，
  // file_write/file_edit 的 file_change 快照钩子（registry.execute 前后那段）自然不会执行。
  // ★★★ 安装类资源：**任何权限模式都要确认**（2026-10-22）
  //
  // 背景（用户原话）：「这些需要下载别的应用也要弄成工具，这样大模型可以自己下载
  //   不用用户手动点击，但是要弹出让用户确认」。
  //
  // 为什么不能靠下面的 readonly 授权闸：
  //   ① 那个闸只在 permissionMode === 'readonly' 时生效，default/all 模式**完全不问**；
  //   ② 安装工具不在 WRITE_TOOLS 里（它的风险是流量/磁盘/时间，不是"写文件"），
  //      即使只读会话也不会触发。
  //   结果是「模型一句'装个 ffmpeg'就直接下 100MB」，用户完全无感知。
  //
  // 为什么放在权限闸之前：安装确认与读写权限是两件事 —— 全权限会话也该被告知
  //   "要下 8.9GB、从哪下、放哪里"。已装则直接跳过（幂等，避免每次调用都弹）。
  if (toolName === 'install_resource') {
    const confirmed = await confirmResourceInstall(task, args);
    if (!confirmed.ok) return confirmed.message;
  }

  const perm = checkToolPermission(task.permissionMode || 'readonly', toolName);
  if (!perm.allowed) {
    if (perm.needsAuthorization && (task.permissionMode || 'readonly') === 'readonly') {
      if (task.authorizedTools?.has(toolName)) {
        // 本任务内已批准过：直接放行（授权集合是唯一事实源）
      } else {
        const auth = await requestToolAuthorization(task, toolName, args);
        if (!auth.ok) {
          logger.warn(`[llm-task] 授权未通过: conv=${task.conversationId} mode=${task.permissionMode} tool=${toolName}`);
          return auth.message;
        }
        // 批准 → 落到下方正常执行
      }
    } else {
      // 非 readonly 的 !allowed（理论上不可达）或显式无授权语义的拒绝
      logger.warn(`[llm-task] 权限拦截: conv=${task.conversationId} mode=${task.permissionMode} tool=${toolName}`);
      return perm.reason || `工具 ${toolName} 已被会话权限拒绝执行`;
    }
  }
  const isUiTool = uiTools.has(toolName);
  const isMcp = toolName.startsWith('mcp_');
  const isCustom = toolName.startsWith('custom_');
  // ★ 不能用 startsWith('api_') 单独判定：media_compose/media_install_ffmpeg 不带前缀却由
  //   executeApiTool 实现。统一用 isApiExecutableTool（见其注释里的完整链路说明）。
  const isApi = isApiExecutableTool(toolName);

  // ★★★ 执行面必须与"模型实际看到的工具面"一致（2026-10-17，安全审查发现）：
  //   `registry.execute` 只按名字执行、不校验挂载。模型只要猜中/被注入一个未挂载的工具名
  //   （如 `http_request` / `browser_run_script`），就能直接执行 —— 实测可打本机无鉴权路由，
  //   进而触发人工审批入口。这里在**唯一执行出口**做挂载校验，与 buildToolsForBackend 同源。
  //   ★ 放在浏览器分支**之前**：browser_* 同为注册表工具，不能从这条路径漏过去。
  //   ★ API 工具走 executeApiTool（含自己的权限判定与 discovery 语义），不在此处裁。
  // ★ 模型实际看到的工具面优先（主循环与子智能体循环各自传入的 toolDefs）：
  //   子智能体的工具集来自它自己的 builtin_tool_ids，而 task.agentId 仍是父体 ——
  //   只查 DB 会误拒子体工具（如 recon 子体的 whois/subdomain）。
  const declaredTools = new Set<string>();
  for (const d of (toolDefs || [])) {
    const n = (d as any)?.function?.name || (d as any)?.name;
    if (typeof n === 'string' && n) declaredTools.add(n);
  }
  const alwaysAllowed = ALWAYS_ALLOWED_BUILTINS.has(toolName)
    && (depth === 0 || INTERACTIVE_TOOLS.has(toolName));
  // 主循环：按智能体/会话**挂载**判定（动态路由只隐藏工具、不改变挂载，不能因此拒绝）。
  // 子智能体：按它自己的 subTools 判定（task.agentId 仍是父体，查 DB 会误拒子体工具）。
  const toolAllowed = alwaysAllowed
    || (depth > 0 ? declaredTools.has(toolName) : isBuiltinMountedForTask(task, toolName));
  if (registry.has(toolName) && !isApi && !toolAllowed) {
    logger.warn(`[llm-task] 未挂载工具执行被拒: conv=${task.conversationId} agent=${task.agentId || '-'} depth=${depth} tool=${toolName}`);
    return `工具 \`${toolName}\` 未挂载到当前智能体/会话，拒绝执行。`
      + `请只使用工具列表中实际提供的工具；不要猜测或调用其它工具名。`;
  }

  if (isCustom && (depth > 0 || !isCustomToolMountedForTask(task, toolName))) {
    logger.warn(`[llm-task] 未挂载自定义工具执行被拒: conv=${task.conversationId} depth=${depth} tool=${toolName}`);
    return `自定义工具 \`${toolName}\` 未挂载到当前智能体/会话，拒绝执行。`;
  }

  // 子智能体的 API 工具也必须在它自己的工具面里（subTools）；否则可按名字执行未授予的接口。
  if (isApi && depth > 0 && !declaredTools.has(toolName)) {
    logger.warn(`[llm-task] 子智能体调用未授予 API 被拒: conv=${task.conversationId} tool=${toolName}`);
    return `API 工具 \`${toolName}\` 未授予当前子智能体，拒绝执行。`;
  }

  // ★ 安全域智能体额外收紧（2026-10-17）：API 工具只允许**只读**。
  //   写类 API（api_conversation_setup / api_experience_write / 智能体与模型增删改）
  //   能改变后续会话的智能体/工具/提示词 —— 那等于绕过经验库的人工审批闸门。
  if (isApi && isSecExperienceAgent(task.agentId) && !checkToolPermission('readonly', toolName).allowed) {
    logger.warn(`[llm-task] 安全智能体调用写类 API 被拒: conv=${task.conversationId} tool=${toolName}`);
    return `安全智能体只能调用只读 API 工具；\`${toolName}\` 属于写/不可控工具，已拒绝。`
      + `需要改配置/沉淀经验时，使用安全控制台的对应入口或 \`sec_experience\`（需人工审批）。`;
  }

  // 参数归一化兜底：模型文本模式工具调用常把 url 放到 target/address/link 等字段，补齐避免误报缺参
  args = normalizeToolArgs(toolName, args);

  // ★★★ 通用 before 钩子（P2-3 预留 → 2026-10-18 接线）：程序化前置钩子（services/tool-hooks.ts
  //   的 registerBeforeToolHook）在此真正生效，用于"危险命令黑名单"式的主动拦截。
  //   位置：参数归一化之后（钩子看到的是归一化后的 args）、循环防护之前（被钩子 block 的调用
  //   没有执行，不应计入循环防护的重复计数）。与用户钩子（下方 deny/confirm）的分工：
  //   这层是**代码注册**的钩子（如 path-guard 之外的扩展），用户层规则优先级语义见其自述段。
  //   fail-open 由 runBeforeToolHooks 自身保证（单个钩子抛错只 warn）。
  const beforeHook = await runBeforeToolHooks(toolName, args, {
    taskId: task.id,
    conversationId: task.conversationId,
    userId: task.userId,
  });
  if (beforeHook.block) {
    logger.warn(`[tool-hook] before 拦截: conv=${task.conversationId} tool=${toolName} 原因=${beforeHook.block}`);
    return `工具 \`${toolName}\` 的本次调用被前置钩子拦截：${beforeHook.block}。请不要原样重试；如认为拦截有误，向用户说明原因。`;
  }

  // ★ 防失控循环闸门（2026-10-09）：位置在归一化之后——key 按归一化后的参数算，
  //   模型把同一意图换字段名重发也能被识别为重复。放在缺参检查之前：连缺参调用
  //   都在刷屏的更该拦。被拦时提前 return，后续快照/权限副作用一律不发生。
  // ★ 读**外部可变状态**的工具（截图 / 读正文 / DOM / 标签页…）关掉 A 线：它们的输出是
  //   外部状态的快照，参数相同结果却不同，"同参重复 = 白重试"对它们不成立。
  //   判据取自**工具定义自身**（ToolDefinition.readsExternalState），此处只透传 ——
  //   绝不在闸门里另抄一份工具名单（本仓库多次吃过"同一语义两处判定"的亏）。
  const loopBlock = checkToolLoop(task, toolName, args, {
    readsExternalState: registry.get(toolName)?.readsExternalState,
  });
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
  // 命令类工具的执行目录信息（授权卡展示用）；非命令工具为空对象
  const guardRoots = allowedRootsFor(task.workspaceDir, task.conversationId);
  const commandScope = COMMAND_TOOLS.has(toolName)
    ? commandExecutionScope(args, guardRoots, task.workspaceDir || '')
    : {};
  const hookItem: PathAccessItem = {
    toolName, action: 'write', absPath: '', rawPath: summarizeCommandArgs(args) || JSON.stringify(args ?? {}).slice(0, 200),
    ...commandScope,
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
  // 危险工具默认确认（2026-10-21 用户拍板：「危险工具要么确认呗」）
  //   清单见 DANGEROUS_TOOLS：跑任意代码 / 安装运行时 / 对外发布与发消息。
  //   用户已配置的 confirm 规则若已放行则不重复弹窗；无人值守 fail-safe 拒绝。
  //   ★ 同日补（用户：「All 模式也不问」「能不能一次授权就好」）：
  //     · `all` 档位直接跳过（与危险命令护栏同口径：用户已明确承担风险）；
  //     · 用户选过「本会话内允许该工具」后，同工具不再问。
  // ══════════════════════════════════════════════════════════════════════════
  if (needsDangerConfirm({
    toolName,
    permissionMode: task.permissionMode,
    hasConfirmRules: hookVerdict.confirmRules.length > 0,
    alreadyAuthorized: isDangerToolAuthorized(task.conversationId, toolName),
  })) {
    auditPathAccess({
      userId: task.userId, conversationId: task.conversationId, taskId: task.id,
      toolName, decision: 'danger-confirm', reason: '危险工具默认需要确认', items: [hookItem],
    });
    const granted = await requestPathAuthorization(
      task, toolName, [hookItem], COMMAND_TOOLS.has(toolName), `危险操作需要确认：${toolName}`, toolName,
    );
    if (!granted.ok) {
      auditPathAccess({
        userId: task.userId, conversationId: task.conversationId, taskId: task.id,
        toolName, decision: 'user-hook-denied', reason: '危险工具未获确认', items: [hookItem],
      });
      logger.warn(`[danger] 未确认，拒绝 conv=${task.conversationId} tool=${toolName}`);
      return granted.message
        || `工具 \`${toolName}\` 属于危险操作（执行命令 / 安装运行时 / 对外发布），用户未确认，已取消。`;
    }
    logger.warn(`[danger] 已确认 conv=${task.conversationId} tool=${toolName}`);
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
  // ★★★ 2026-10-20 修正（用户实测「已经 all 权限了怎么还要确认」）：all 权限契约是
  //   danger-full-access + 从不询问（PERMISSION_MATRIX['all'].approval='never'），此前此处
  //   不看 permission_mode，all 会话里危险命令（递归删除/格式化/强推…）仍被单独弹窗。
  //   all = 用户已明确承担风险 → 跳过危险护栏。readonly / default 仍每次单独确认
  //   （危险命令不记入会话授权、永不记忆的语义不变）。
  const isCommandTool = COMMAND_TOOLS.has(toolName);
  const dangerHit = (isCommandTool && task.permissionMode !== 'all') ? checkDangerousCommand(summarizeCommandArgs(args)) : null;
  let dangerGranted = false;
  if (dangerHit) {
    const dangerItems: PathAccessItem[] = [{
      toolName, action: 'write', absPath: '', rawPath: summarizeCommandArgs(args),
      ...commandScope,
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
      allowedRoots: guardRoots,
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
    // ★★★ 计划类工具（task_plan / task_step）走**服务端直连**，不再委托渲染层（2026-10-15）。
    //
    // 为什么不委托（实测 conv 7e99207b，同日三次）：这两个工具此前"前端在线就委托前端、没响应才由
    //   服务端兜底"，而渲染层会被长任务周期性堵住（一次 120 秒、两次各 20 秒），于是每次计划更新
    //   都要等渲染层 ⇒ 模型干等、进度条不动（用户看到的"卡住"就是这么来的）。
    //   计划本来就是**服务端**的事（写 conversation.task_plan_json + 镜像 plan.md），前端只该展示。
    //   ⇒ 服务端做**唯一写者**；写成功后用 `plan:updated` 把新计划推给前端**只做展示**
    //     （沿用 PlanRunner 已有的展示通道，不新增 UI 元素；`persisted:true` ⇒ 前端**不回写**）。
    //   ★ 这条路径同时覆盖三种情形：前端在线 / 离线（定时任务、IM）/ 前端卡住 —— 只有一份实现。
    const isPlanTool = !isMcp && (toolName === 'task_plan' || toolName === 'task_step');
    if (isPlanTool) {
      try {
        const receipt = toolName === 'task_plan'
          ? await backendTaskPlan(task.conversationId, args || {})
          : await backendTaskStep(task.conversationId, args || {});
        try {
          const plan = loadPlanJson(task.conversationId);
          if (plan) emit(task, { type: 'plan:updated', plan, persisted: true });
        } catch { /* 推送失败只是卡片没刷新，不该让工具报错（计划已落库） */ }
        return receipt;
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

  // ── 应用即工具（2026-10-17）：模型自建顶层任务 / 查询任务状态 ──
  if (toolName === 'app_create_task') {
    if (depth >= 1) return '子智能体不能再创建顶层任务（仅主智能体可派发，防止任务树无限展开）';
    return appCreateTask(task, args || {});
  }
  if (toolName === 'app_get_task_status') {
    return appGetTaskStatus(task, args || {});
  }
  // ── 独立窗口 / 录屏（应用即工具 P1）──
  if (toolName === 'app_open_window') {
    return appOpenWindow(task, args || {});
  }
  if (toolName === 'screen_record') {
    // 录屏委托前端（桌面端主进程执行 capturePage + ffmpeg）；产物路径由服务端统一解析到
    // 本会话的产物目录（deliverable），录完天然出现在任务的文件面板里，不靠模型拼路径。
    if (task.subscribers.size === 0) return '录屏需要桌面端主窗口在线（当前没有前端订阅者），无法执行。';
    const a = (args || {}) as Record<string, unknown>;
    const action = String(a.action || 'start');
    let outPath = typeof a.outPath === 'string' ? a.outPath : undefined;
    if (action === 'start' && !outPath) {
      const dir = ensureArtifactDirFor({ conversationId: task.conversationId, category: 'deliverable' });
      const name = String(a.outName || '').trim().replace(/[\\/:*?"<>|]/g, '_') || `recording_${Date.now()}`;
      outPath = path.join(dir.dir, `${name}.mp4`);
    }
    return executeToolViaFrontend(task, toolName, { ...a, outPath }, toolCallId, depth);
  }
  // ── 发布队列（2026-10-17）：模型只入队，发布必须人工确认 ──
  if (toolName === 'publish_enqueue') {
    return publishEnqueue(task, args || {});
  }
  if (toolName === 'publish_mark_published') {
    return publishMarkPublished(task, args || {});
  }
  if (toolName === 'publish_record_stats') {
    return publishRecordStats(task, args || {});
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
  // model-candidate-pools：支持 slot 直查生效池；平铺返回给池内候选打 ★（引导优先选池内）
  if (toolName === 'list_models') {
    return listAvailableModels(task.userId, args, task);
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
  // ★★★ 执行面直连化（P1-2，2026-10-10）：浏览器工具**三档**分发。
  //
  // 为什么要直连：旧路径（下方 SSE 委托）要求**渲染层在线且有订阅者** ——
  //   订阅者缺失时要等 15s 重连窗口（`:3896`），失败再等 8s（`:3906`）⇒ 单次最坏卡 23s；
  //   无订阅者时更直接 `unattendedToolResult()`（**根本不执行**）。"一断全停"的根因就在这里。
  //   ⇒ 主进程新开 loopback 端点后由服务端**直连**（不经 UI 层），结构上去掉这条依赖。
  //
  // ★ 判定口径**只有一处**：`decideBrowserExecution()`（browser-bridge.ts）。
  //   前端不得自己探端点 —— 那会造出第二份判据（必然漂移），且会把 token 暴露到渲染层。
  //
  // ★ 灰度：off（本块整体跳过，行为逐字不变）/ shadow（只读走桥）/ on（读写走桥）
  //   / strict（读写走桥，SSE 委托视为错误）。
  //
  // ★★★ 2026-10-10 根因修复：**去掉 `on` 档的死降级**。
  //   旧行为：桥抛任何错 → `on` 档降级回 SSE 一次。但直连化后渲染层**已不再执行** browser_*
  //   （`decideBrowserExecution` 判给桥；渲染层的 `tool:execute` 守卫会跳过）⇒ SSE 路径
  //   **必然没有订阅者** ⇒ 必等 15s + 8s 才失败 ⇒ 一次 8s 的失败被拖成 23s，
  //   且最终文案是"前端暂时不可达"（把"主进程页面未就绪"误导成"前端断了"）。
  //   实测（2026-10-10 22:46）：桥报 `loadURL of null` → 降级 → 用户看到"前端不可达"。
  //   ⇒ 现在：只有**传输层**失败（桥端点不可达/超时/鉴权）才降级（那才是"桥没起来"）；
  //     其余失败直接回可诊断错误，让模型立刻换招或汇报，不再空转 23s。
  if (isBrowser) {
    // ★★★ 2026-10-15「导航跑偏」P0-③：**未知浏览器工具立即快速失败**。
    //
    //   实测（server-2026-10-14.log）：模型幻觉出 `browser_get_info`（全代码库无此工具），
    //   请求打到桥 → 桥按白名单判"不支持的浏览器 action"回 HTTP 400 → 调用方把它当**传输层**
    //   失败 → 降级 SSE 委托 → 前端也不认识这个工具 → 各挂满 480 秒，两次共 **16 分钟空转**。
    //
    //   修法：桥调用前先查工具注册表（浏览器工具全部在内置注册表里），未知就**当场**回明确
    //   错误 + 最接近的候选名 —— 模型下一步就能改口，不再有"降级 → 空等"这条路。
    //   ★ 只对 browser_ 前缀生效：其它前缀（mcp_/custom_/api_）的未知工具走原有兜底分支。
    if (!registry.has(toolName)) {
      const known = registry.names().filter((n) => n.startsWith('browser_')).sort();
      // 近似候选：按名字片段命中（`get_info` → `get_page_info`）——不需要编辑距离那么大动干戈
      const bits = toolName.replace(/^browser_/, '').split('_').filter((b) => b.length >= 3);
      const close = known.filter((k) => bits.some((b) => k.includes(b)));
      const hint = (close.length ? close : known).slice(0, 6).join(' / ');
      logger.warn(`[llm-task] 未知浏览器工具快速失败: ${toolName} conv=${task.conversationId}`);
      return `未知工具 \`${toolName}\`（不存在，重试不会成功）。` +
        `最接近的可用浏览器工具：${hint}。` +
        `请改用其中之一；若只是想读当前页，用 browser_get_page_content（正文+元素）或 browser_get_page_info（元素+坐标）。`;
    }
    // ★★★ 2026-10-15「导航跑偏」P0-①（第二层，主循环侧）：后台浏览器型子任务占用期间，
    //   主循环自己的 browser_* 动作**显式拒绝** —— 不选择"等待"，因为工具调用有超时上限
    //   （等下去只会把一次失败拖成一次超时），而"两个流并发驱动同一锚页"正是要消灭的行为。
    //   前台子任务是**阻塞**委派，那时主循环不会发浏览器动作 ⇒ 这里只会命中
    //   "主循环 vs 后台(async)子任务"这一类真并发。
    if (depth === 0) {
      const owner = flowOwnerAt(task.browserFlows);
      if (owner && owner.startsWith('sub:')) {
        logger.warn(`[llm-task] 主循环浏览器动作被拒（浏览器被后台子任务占用）conv=${task.conversationId} tool=${toolName} owner=${owner}`);
        return `浏览器正被后台子任务占用（占位者：${owner}）—— 浏览器是单活动页资源，同一任务的浏览器动作必须串行。`
          + `请等它完成后继续（可调用 get_sub_task_detail 查它的进度），期间不要重复调用 browser_* 工具。`;
      }
    }
    const exec = decideBrowserExecution(toolNameToAction(toolName));
    if (exec === 'bridge') {
      const bridgeTimeout = resolveFrontendToolTimeout(toolName);
      try {
        // ★ 末位 = 本流在桌面端的流键（锚/归属按它隔离，见 main.cjs 的 flowKeyOf）。
        //   主循环/并发批缺省 = 共享主面板流；子智能体由 ownership 带下来（可能是 bg:<flowId>）。
        const raw = await callBrowserBridge(task.conversationId, toolName, args, bridgeTimeout, browserFlowKey || SHARED_FLOW);
        // ★ 截图归档与 SSE 路径**共用同一后处理出口**（见 archiveDelegatedScreenshot 注释）——
        //   否则"截图进临时区但登记不进 conversation_file"会以新形态复发（C6 刚修过同一处）。
        if (toolName === 'browser_screenshot') {
          return await archiveDelegatedScreenshot(raw, task, metaOut);
        }
        return raw;
      } catch (e: any) {
        if (e?.name === 'AbortError' || task.abortController.signal.aborted) throw e;
        // strict：桥失败**不降级**（这条档位就是为了证明"零依赖渲染层"，静默降级会掩盖结论）
        if (bridgeMode() === 'strict') {
          return `浏览器工具 ${toolName} 直连执行面失败（strict 档不降级）：${e?.message || e}`;
        }
        // 业务错误（动作执行失败）：不是桥故障，直接回给模型 —— 换招由模型决定。
        if (!isBridgeTransportError(e)) {
          logger.warn(`[browser-bridge] 动作执行失败（非桥故障，不降级）: ${toolName} conv=${task.conversationId} err=${e?.message || e}`);
          return `浏览器操作失败: ${e?.message || e}`;
        }
        // 传输层失败（端点不可达/超时/鉴权）：桥本身没接上 —— 这时才降级回 SSE 一次。
        logger.warn(`[browser-bridge] 桥传输失败，降级回 SSE 委托: ${toolName} conv=${task.conversationId} err=${e?.message || e}`);
      }
    }
  }
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
    const toolCtx = { conversationId: task.conversationId, userId: task.userId, artifactDirs, workspaceDir: task.workspaceDir, signal: task.abortController.signal, ...(task.toolEnv ? { env: task.toolEnv } : {}) };

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
    // ★★★ A4 根治（2026-10-10）：把**当前会话**告知 core 的浏览器工具 ——
    //   它们据此把 `x-yz-conversation-id` 带给浏览器路由，服务端按会话隔离"活动页"，
    //   避免"A 会话导航中、B 会话读取/截图拿到 A 的页面"（且静默无报错）。
    //   ★ 放在**唯一工具出口**（registry.execute 之前），一处覆盖全部 browser_* 工具，
    //     不需要逐个改 33 个工具的 execute 签名（那必然漏）。
    //   ★ 每次调用前都设置（含非 browser 工具）—— 保证不会残留上一个会话的值。
    setBrowserToolConversationId(task.conversationId);
    const r = await registry.execute(toolName, args, toolCtx);
    let text = typeof r === 'string' ? r : (r.content?.map((c: any) => c.text || '').join('') || JSON.stringify(r));
    // ★ C 线（2026-10-21）：连续失败提醒 —— A 线（同参重复）/B 线（严格连续同工具）都抓不到
    //   「一直失败但每次换参数」的形态（实测 file_edit 5 次未命中、中间夹 file_read）。
    //   判定用**结构化 isError**，退回文本前缀兜底；只提示不硬停（失败是可自救的）。
    const failedResult = (r as any)?.isError === true
      || /^(Error|工具执行失败)/.test(String(text).trim());
    const failNudge = noteToolOutcome(task, toolName, !failedResult);
    if (failNudge) text = `${text}\n\n${failNudge}`;
    const meta = (r as any)?._meta as {
      path?: string;
      beforeContent?: string | null;
      /** apply_patch 多文件补丁：工具已回传每个文件的 before/after（整份补丁原子落盘） */
      changes?: Array<{ path: string; beforeContent: string | null; afterContent: string | null }>;
    } | undefined;
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
    } else if (Array.isArray(meta?.changes)) {
      // apply_patch（多文件补丁）：逐文件写快照。路径/before/after 全部来自工具回传
      // （调用方执行前不可能知道补丁会改哪些文件）；删除的文件 after=null。
      for (const c of meta.changes) {
        if (!c?.path || c.beforeContent === c.afterContent) continue;
        try {
          db.prepare('INSERT INTO file_change (id, user_id, conversation_id, task_id, path, before_content, after_content, tool, status, step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('fc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), task.userId, task.conversationId, task.id, c.path, c.beforeContent ?? null, c.afterContent ?? null, toolName, 'pending', task.step, Date.now());
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

/**
 * 前端委托工具**超时 / 断连**的统一收口（2026-10-15）。
 *
 * ★ 为什么必须收口成一处：收口原有两条路径（原始超时、最后一个订阅者断开后的 15 秒宽限），
 *   各写一份 ⇒ 措辞必然漂移，且"改了一处漏一处"（本项目反复栽过）。
 *   ⇒ 两条都走这里，用 `reason` 区分成因。
 * ★ 两种成因的措辞**必须可区分**（"前端掉了"与"工具卡了"是两回事，混成一句谁都定位不了）。
 * ★ 到点即 reject（"任务将以此错误继续"）：能不能继续由模型决定，不由我们替它假装成功。
 *   （计划类工具已改为**服务端直连**、根本不走这条路 —— 见 executeTool 里 isPlanTool 那段。）
 */
export async function onFrontendToolTimeout(
  task: LlmTask,
  toolName: string,
  callId: string,
  timeoutMs: number,
  /** 为什么收口：`timeout` = 原始超时到点；`disconnect` = 最后一个订阅者断开后的 15s 宽限到点。 */
  reason: 'timeout' | 'disconnect' = 'timeout',
): Promise<void> {
  const pending = task.pendingToolCalls.get(callId);
  if (!pending) return;
  task.pendingToolCalls.delete(callId);
  clearPendingTimers(pending);
  syncPendingToolsJson(task);
  const secs = Math.round(timeoutMs / 1000);
  const why = reason === 'disconnect'
    ? `前端断连，工具 ${toolName} 未在 ${secs} 秒内重连`
    : `工具 ${toolName} 执行超时`;
  logger.warn(`[llm-task] ${why} callId=${callId} conv=${task.conversationId}（任务将以此错误继续）`);
  // 超时**可见**（2026-10-09）：广播一条事件，前端据此把该工具条标为"超时未回执"，
  // 而不是让界面只是"停住不动"（与真卡死难以区分）。前端对未知事件类型容忍。
  try { emit(task, { type: 'tool:timeout', callId, toolName, conversationId: task.conversationId, timeoutMs, reason }); } catch { /* 观测事件失败不影响超时处理 */ }
  pending.reject(new Error(why));
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
      : setTimeout(() => { void onFrontendToolTimeout(task, toolName, callId, effectiveTimeout); }, effectiveTimeout);
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
  // model-candidate-pools（2026-10-15 同 ReAct 子智能体口径收紧）：父任务当前模型优先于候选池，
  // 候选池只作父模型缺失时的后备。
  const inputs: Record<string, unknown> = { ...mapped.inputs };
  const platformId = args.platformId || agent.platform_id || task.platformId;
  const wfPoolFirst = !args.modelId && !agent.model_id && !task.modelId
    ? resolveFirstModel(db, { userId: task.userId, agentId: resolvedId }, 'llm')
    : null;
  const modelId = args.modelId || agent.model_id || task.modelId || wfPoolFirst?.model.id;
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
    // 必须 path.join：产物目录在 Windows 下是反斜杠，用 `/` 手拼会产出
    // `C:\a/b\c` 混合路径，登记后交给资源管理器 /select 会被静默丢弃
    filePath = path.join(dir, item.name);
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

  // ★★★ 2026-10-15「导航跑偏」P0-①（第二层，后台路径）：**先占位**再启动。
  //   后台是 fire-and-forget：若等它真跑起来才发现浏览器被占，已经白跑一整轮。
  //   ⇒ 浏览器型后台子任务在别的流占用期间**直接拒绝**（不排队、更不静默并发驱动）。
  const bgFlowId = `sub:${toolCallId}`;
  // ★ 这条后台流要占的**标签页键**（与 runSubAgent 同源同值：一处取值、两处共用）
  const bgTabKey = browserFlowKeyOf(args, toolCallId, agentConfigOf(agentId, task.userId));
  const bgBrowserCapable = isBrowserCapableSubAgent(agentId, task.userId);
  if (bgBrowserCapable) {
    task.browserFlows ||= createFlowLocks();
    if (!tryAcquireFlow(flowLockFor(task.browserFlows, bgTabKey), bgFlowId)) {
      const holder = flowOwnerAt(task.browserFlows, bgTabKey);
      logger.warn(`[llm-task] 浏览器型后台子任务被拒（该标签页已被占）conv=${task.conversationId} tab=${bgTabKey} owner=${holder}`);
      return `浏览器正被另一个浏览器型子任务占用（占位者：${holder}；它占的是 ${bgTabKey === SHARED_FLOW ? '本会话共用页面' : '同一个标签页'}）——`
        + `同一个页面上两个流并发会互相覆盖页面（这正是"导航跑偏/打开别的页面"的成因）。`
        + `请等它完成后再委派；想让它**各占一页、真正并行**，给其中一个传 browserTarget:"background"；`
        + `或去掉 async 改**同步**委派（同步会排队等待，不会互踩）。`;
    }
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
      // ★ 浏览器流锁释放（非持有者 = 幂等 no-op：runSubAgent 正常收尾时已释放，
      //   异常路径由这里兜底，避免"锁被异常带走 → 后续浏览器任务全被挡"）。
      //   `task.browserFlows` 缺失时跳过（拿过锁就不可能缺失；这里只为不让 finally 抛错盖掉原异常）。
      if (bgBrowserCapable && task.browserFlows) releaseFlow(flowLockFor(task.browserFlows, bgTabKey), bgFlowId);
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
  // ★★★ 2026-10-15「导航跑偏」P0-①（第二层，任务级流锁）：
  //   浏览器是**单活动页资源** —— 浏览器型子智能体在**整个运行期**持有任务级锁，
  //   覆盖第一层（同批 call_agent 串行化）够不到的路径：后台 async 子智能体、
  //   PlanRunner 并行计划项、工作流型（含 browser_ 节点）子智能体。
  //   等待**有界**（BROWSER_FLOW_WAIT_MS）；拿不到就明确拒绝，绝不静默并发驱动浏览器。
  const flowId = `sub:${parentToolCallId}`;
  // ★ 本子智能体要占的**标签页键**：`shared`（缺省 = 与主面板共用同一个操作页）或 `bg:<flowId>`
  //   （自己一个后台页，可与别的流真正并行）。取值口径**只在 browserFlowKeyOf 一处**。
  const tabKey = browserFlowKeyOf(args, parentToolCallId, agentConfigOf((args as any)?.agentId ?? (args as any)?.agent_id ?? (args as any)?.id, task.userId));
  const browserCapable = specOverride
    ? toolIdsIncludeBrowser(specOverride.toolIds)
    : isBrowserCapableSubAgent((args as any)?.agentId ?? (args as any)?.agent_id ?? (args as any)?.id, task.userId);
  let flowAcquired = false;
  if (browserCapable) {
    task.browserFlows ||= createFlowLocks();
    const flowLock = flowLockFor(task.browserFlows, tabKey);
    flowAcquired = await acquireFlow(flowLock, flowId, task.abortController.signal);
    if (!flowAcquired) {
      logger.warn(`[llm-task] 浏览器流锁等待超时，子任务未启动 conv=${task.conversationId} flow=${flowId} tab=${tabKey} owner=${flowOwnerOf(flowLock)}`);
      return `浏览器正被同一任务内的另一个执行流占用（占位者：${flowOwnerOf(flowLock) || '未知'}），`
        + `已等待 ${Math.round(BROWSER_FLOW_WAIT_MS / 60000)} 分钟仍未释放 —— 本次子任务**未启动**。`
        + `浏览器是单活动页资源，两个流并发驱动会互相覆盖页面（这正是"导航跑偏/打开别的页面"的成因）。`
        + (tabKey === SHARED_FLOW
          ? `请等它结束后重新委派；有多个浏览器任务时**串行委派**（一次只跑一个）。`
          : `这条后台流等的是它自己要占的标签页（${tabKey}）。请等它结束，或改用同步委派（会排队等待）。`);
    }
  }
  try {
    const { result, artifacts } = await runWithArtifactCollector(() =>
      runSubAgentImpl(task, args, parentToolCallId, depth, uiTools, specOverride, runOpts));
    const withArtifacts = artifacts.length > 0 ? formatSubAgentReturn(result, artifacts) : result;
    // ★★★ 回传前去毒（2026-10-14 实报，high）：子智能体的收尾报告**必然**会引用它收到的
    //   [FORCE_STOP] 原文，而这里是它回到父任务的**唯一出口**。不去毒，父任务的硬停判据就会
    //   把"子智能体被停"读成"我也该停" —— 实测 conv 96125908 16:54:55 就是这么被连坐的，
    //   父任务当时在合集弹窗已打开、只差两步的收尾关头，剩余 4 个步骤一步没跑。
    //   ★ 子任务的停止**不应该**决定父任务是否停止：父任务收到报告后自行判断下一步。
    const sanitized = neutralizeForceStopMarker(withArtifacts);
    // ★ 子任务 ID 回执（2026-10-09）：parentToolCallId 天然唯一标识这次委派（子智能体
    //   落库的每条消息都带它）。追加在结果末尾，编排者后续可用 get_sub_task_detail
    //   按 ID 查执行轨迹分析失败原因。一行即止，不撑上下文。
    return `${sanitized}\n\n[子任务ID] ${parentToolCallId}（如需分析本任务执行过程，可调用 get_sub_task_detail 传入此 ID 查询）`;
  } finally {
    // 释放（非持有者 = 幂等 no-op）：异常/中止路径也必须还锁，否则后续浏览器任务全被挡
    // 释放（非持有者 = 幂等 no-op）：异常/中止路径也必须还锁，否则后续浏览器任务全被挡
    if (flowAcquired && task.browserFlows) releaseFlow(flowLockFor(task.browserFlows, tabKey), flowId);
  }
}

/** 父智能体声明的子智能体 ID（call_agent 的委派白名单） */
function parentAllowedSubAgentIds(task: LlmTask): string[] {
  try {
    let agentId = task.agentId || null;
    if (!agentId) {
      const conv = db.prepare('SELECT agent_id FROM conversation WHERE id = ?').get(task.conversationId) as any;
      agentId = conv?.agent_id || null;
    }
    if (!agentId) return [];
    const row = db
      .prepare('SELECT sub_agent_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
      .get(agentId, task.userId) as any;
    try { return JSON.parse(row?.sub_agent_ids || '[]'); } catch { return []; }
  } catch {
    return []; // fail-closed
  }
}

// ★★★ 子智能体系统提示词共享段注入（2026-10-18，开发模式"写码弱"根因修复之二）：
//   此前子级只拿 agent.system_prompt 裸串（runSubAgentImpl 内 `agent.system_prompt || '你是一个智能助手。'`）
//   —— 工作目录、项目规则（AGENTS.md / .yan-zhi/rules/）、工程记忆约定对子智能体**全部缺失**：
//   用户在 AGENTS.md 写的规范只给架构师看，真正写码的实现者反而看不见；实现者也不知道工作目录
//   （file_read 只能靠委派书里的绝对路径，委派书漏写就瞎找）。
//   这里按需补三段，内容与 buildSystemPromptForBackend 的对应段同源同格式（loadProjectRules 同一函数）。
//   刻意**不**整体复用 buildSystemPromptForBackend —— 那会连应用指引/工具描述/产物目录/浏览器收拾等
//   主循环专属段一起带进子级，撑大上下文还发矛盾指令。
function buildSubAgentSharedSections(resolvedId: string, conversationId: string): string {
  const dir = resolveConversationWorkspaceDir(conversationId) || serverState.workspaceDir;
  if (!dir || !dir.trim()) return '';
  const parts: string[] = [];
  parts.push(`## 工作目录\n当前工作目录：${dir}`);
  try {
    const rules = loadProjectRules(dir);
    if (rules.length) {
      parts.push([
        '## 项目规则（自动读取自工作目录，优先级高于默认行为；source 是相对路径，目录越深范围越窄，与上层冲突时以更深的为准）',
        '> 以下是本项目**用户自己写下的规则**。与默认做法冲突时以本节为准；',
        '> 若某条规则与任务要求冲突，在交付报告里说明你偏离了哪条规则。',
        '',
        ...rules.map((r) => `### ${r.source}\n${r.content}`),
      ].join('\n'));
    }
  } catch { /* 规则读取失败不影响委派（缺文件是常态） */ }
  // 工程记忆约定：只给挂了记忆工具的实现者子智能体（backend/frontend/java，工具清单 2026-10-18 起
  //   已含 api_space_memory_read/append）。架构师的工程记忆段走 buildSystemPromptForBackend
  //   （主循环那条路才走完整组装）。
  const IMPL_MEMORY_AGENTS = new Set(['a_builtin_backend_dev', 'a_builtin_frontend_dev', 'a_builtin_java_agent']);
  if (IMPL_MEMORY_AGENTS.has(resolvedId)) {
    parts.push([
      '## 工程记忆（开工必读，收尾必补）',
      '你有本项目共享的长期工程记忆：`api_space_memory_read`（读）/ `api_space_memory_append`（追加）。',
      '**开工先读**：先用 api_space_memory_read 读工程记忆 —— 项目结构、构建/测试命令、约定与已知坑都在里面，'
        + '能直接采用就不要重新探索；记忆与当前代码冲突时以代码为准，并写进交付报告。',
      '**收尾补写**（只写"下次还用得上"的，一条一行，用 api_space_memory_append）：',
      '- 踩到的坑与规避方式（这条最有价值，务必写）',
      '- 实测可用的构建/测试/lint 完整命令（记忆里没有或已失效时）',
      '- 委派任务书里没交代、但实际必须知道的约定',
      '不要写：本次改了哪些文件的流水账（那属于交付报告，不属于工程记忆）。',
    ].join('\n'));
  }
  // 仓库地图（repo map）：探索者 + 实现者同样常驻（架构师走 buildSystemPromptForBackend 那条路）。
  if (DEV_REPO_MAP_AGENT_IDS.has(resolvedId)) {
    const m = repoMapPromptSection(dir);
    if (m) parts.push(m);
  }
  return parts.join('\n\n');
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

  // 别名兜底（SUBAGENT_ALIASES 为模块级唯一实现 —— isBrowserCapableSubAgent 同源共用）
  const resolvedId = SUBAGENT_ALIASES[agentId] || agentId;

  // ★★★ 只允许委派给父智能体**声明过**的子智能体（2026-10-17 安全审查）：
  //   此前 call_agent 按 id 查任意 public agent —— 安全助手可以借一个挂载了
  //   http_request / cmd_exec 的通用子体，执行父体根本没有的能力，等于绕过工具挂载。
  //   运行时生成的子体（specOverride）由父体按"工具子集"创建，不走这张表。
  if (!specOverride) {
    const allowed = parentAllowedSubAgentIds(task);
    if (!allowed.includes(resolvedId)) {
      return `拒绝委派：${resolvedId} 不在当前智能体声明的子智能体列表中。`
        + `可用：${allowed.length ? allowed.join(' / ') : '(无)'}。`
        + `不要尝试调用未声明的子智能体。`;
    }
  }

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

  // 解析平台/模型（model-candidate-pools，2026-10-15 按用户规则收紧）：
  //   优先级 = 调用方指定 > 子智能体单模型绑定 > **父任务当前模型（对话的模型）** > 子智能体候选池首选
  //   用户规则：「除非对话的模型用不了了，才用候选模型」—— 父任务正在跑、已验证可用的模型必须优先，
  //   候选池只是它用不了时的后备，绝不能抢在它前面主动替换（旧逻辑把 poolFirst 放在 task.modelId 之前，
  //   等于一配池就无视父任务模型，与规则冲突）。
  //   候选池仍"生效"：仅当父任务模型缺失（task.modelId 为空，极少见）才回退池；runSubAgentImpl 内已挂
  //   故障转移链（见下方 subFailoverChain），父模型真失败时沿池续跑，池不是死代码。
  const platformId = args.platformId || (agent.platform_id || task.platformId);
  // 只在"调用方没指定、智能体没绑单模型、且父任务也没模型"时才取池首选（此时池是唯一候选）。
  // source==='auto' 仍排除：auto = 全部生效模型排序、永不为空，放进来会让 `|| task.modelId` 变死代码，
  // 与 2026-10-14 pageAgent 被挑到通道不可用模型的事故同理（只是搬到子智能体场景）。
  const poolFirstRaw = !args.modelId && !agent.model_id && !task.modelId
    ? resolveFirstModel(db, { userId: task.userId, agentId: resolvedId }, 'llm')
    : null;
  const poolFirst = poolFirstRaw && poolFirstRaw.source !== 'auto' ? poolFirstRaw : null;
  const modelId = selectSubAgentModelIdPriority({
    callerModelId: args.modelId,
    agentModelId: agent.model_id,
    parentModelId: task.modelId,
    poolFirstId: poolFirst?.model.id,
  });
  let platform = loadPlatform(platformId, task.userId);
  // modelId 可能为 null（未指定任何模型），loadModel 内部 findModelRow 已对空值早返回，
  // 这里用 `?? ''` 满足类型（不传 null），运行时与旧 `any` 入参行为一致：拿不到就返回 null。
  let model = loadModel(modelId ?? '', task.userId, platformId);
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

  // ===== 子智能体候选池故障转移链（model-candidate-pools，2026-10-15 用户规则）=====
  // 父任务（对话）模型 model.id 作为链首；只有它**真的失败**才沿候选池换下一个。
  // 当用户给子智能体配了池时，池作为父模型用不了时的后备，不抢父模型位。
  // client 在下方 5471 行以 `let` 声明，便于换模型时重建。
  const subFailoverChain = resolveFailoverChain(db, { userId: task.userId, agentId: resolvedId }, model?.id ?? '', 'llm');
  let subFailoverCursor = 0;
  const switchSubModel = (): string | null => {
    while (subFailoverCursor + 1 < subFailoverChain.length) {
      subFailoverCursor++;
      const next = subFailoverChain[subFailoverCursor];
      const nextPlatform = loadPlatform(next.platformId, task.userId);
      if (!nextPlatform) continue;
      model = next.model;
      platform = nextPlatform;
      client = new LlmClient(nextPlatform, next.model);
      return next.model.id;
    }
    return null;
  };

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
  //
  // ★ 站点经验两件套（2026-10-13）：与记忆四件套同批补上。
  //   病根：pageAgent 提示词有一整段【站点经验自进化（重要）】明确要求
  //   「需要更完整内容用 api_experience_read 查」「当场调 api_experience_write 记一条」
  //   （db.ts:1258-1259），但**子智能体工具面从来没补这两个** —— 只有 pageAgent 作为
  //   会话主智能体时才经 alwaysApiTools 兜底可见（本文件 :6867）。
  //   于是它作为子智能体被委派时（= 绝大多数真实调用），模型照提示词调用 → 撞
  //   「工具不存在」→ 白跑一轮。这正是 db.ts:1198-1200 那条铁律
  //   「提示词推荐了却没挂 = 最常见的白跑一轮来源」的又一实例。
  //   工具实现与注册早已齐备（mcp/api-tool-executor.ts:3554/3571、注册表 :338），
  //   且写侧已在 tool-permission 的 WRITE_TOOLS（只读会话运行时仍被拒，语义不变）。
  const hasOwnApiTools = builtinIds.some((n) => n.startsWith('api_'));
  const SUB_ALWAYS_API_TOOLS = hasOwnApiTools
    ? []
    : [
        'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
        'api_experience_read', 'api_experience_write',
      ];
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
    // ★ 这条流在浏览器上占哪一页（`shared` / `bg:<flowId>`）——一路带到桥调用，
    //   桌面端据此把「锚 / 归属」分到各自流上。取值与流锁同一处（browserFlowKeyOf）。
    browserFlowKey: browserFlowKeyOf(args, parentToolCallId, agent.config_json),
  };
  let client = new LlmClient(platform, model);
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
  const systemPromptBase = agent.system_prompt || '你是一个智能助手。';
  // ★ 共享段注入（2026-10-18）：工作目录 / 项目规则 / 工程记忆约定 —— 见 buildSubAgentSharedSections 注释。
  //   接力总结（summarizeOnMaxSteps）与 ReAct 循环共用这一份，保证口径一致。
  const systemPrompt = [systemPromptBase, buildSubAgentSharedSections(resolvedId, task.conversationId)]
    .filter(Boolean).join('\n\n');
  const modelCaps = model.capabilities as string[] | undefined;
  const supportsTools = modelSupportsTools(modelCaps);
  let tools = supportsTools ? subTools : [];

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
  // ★ 2026-10-18：原 D 方案的子智能体预算闸（subBudgets/subTokensTotal/subBudgetHit）已随
  //   P1-9 预算闸一并退役 ——「不要程序自动停」。子智能体用量仍同步进父任务 totalTokens
  //   （见循环内坑 #8 注），但只做可观测。
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
        // platform/model 经上方 `if (!platform || !model) return` 守卫后必为非空，
        // 但 TS 不收窄闭包捕获的 let，这里用断言保持类型干净（运行时契约不变）。
        setSummaryModel: (cw) => {
          cw.setSummaryModel(platform!, model!);
          // ★ 摘要记账（2026-10-18）：子智能体的压缩摘要同主循环口径（source='summary'，
          //   记在**父任务**上 —— 子智能体本来就是任务的延伸，坑 #8 同款收敛）。
          cw.setSummaryUsageHook((detail, info) => {
            recordTaskUsage(task, 'summary', detail,
              { platformId: platform!.id, modelId: model!.modelId },
              { inputText: info.inputText, outputText: info.outputText });
          });
        },
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
      await attachImagesToMessages(llmMessages, task);

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
        // ★ 2026-10-12 P2：同主循环 —— 已内联时不重复存顶层 systemPrompt（fallback 传原 agent 提示词）
        ...buildSnapshotSystemFields(llmMessages, systemPrompt),
        // ★ 2026-10-12 P2：tools 改存内容哈希引用（同主循环，读侧回填）
        toolsRef: internSnapshotBlob('tools', JSON.stringify(subTools.map((t: any) => ({ name: t.function.name, description: t.function.description })))),
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
      // ★ 费用记账回调（2026-10-17）：子智能体用量按**自己的**平台/模型单价计价，
      //   计进**同一会话账本**（source='sub_agent'）—— 与主循环同库不同源，对账时能分开看。
      const subUsageRecorder = (detail: TokenUsageDetail | undefined, meta: { platformId?: string; modelId?: string }) =>
        recordTaskUsage(task, 'sub_agent', detail, meta, { messages: llmMessages, content: fullContent, reasoning: fullReasoning });

      // 候选池故障转移（model-candidate-pools，2026-10-15 用户规则）：父模型失败才换候选
      let subStreamDone = false;
      while (!subStreamDone) {
        let streamOk = false;
        try {
          for await (const chunk of client.chatStream(llmMessages, {
          tools: tools.length > 0 ? tools : undefined,
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
          topP: agent.top_p,
          frequencyPenalty: agent.frequency_penalty,
          presencePenalty: agent.presence_penalty,
          signal: task.abortController.signal,
          onUsage: subUsageRecorder,
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
            // ★ 2026-10-18 收敛到**唯一实现** accumulateToolCallDeltas（此前这里是第二份
            //   内联累积：朴素拼接，没有"网关重发完整 arguments"的去重）⇒ Responses 的
            //   output_item.done 一带完整参数就拼成 `{...}{...}` 非法 JSON，工具静默不执行。
            //   同一语义两处实现必然漂移 —— 这是本项目用血换回来的判据。
            accumulateToolCallDeltas(toolCallAcc, chunk.delta.toolCalls);
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc], subAgentId: resolvedId, parentToolCallId });
          }
        }
        streamOk = true;
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
            onUsage: subUsageRecorder,
          })) {
            if (chunk.usage) { usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0); }
            if (chunk.delta?.content) { fullContent += chunk.delta.content; emit(task, { type: 'chunk', content: chunk.delta.content, subAgentId: resolvedId, parentToolCallId }); }
            if (chunk.delta?.reasoningContent) { fullReasoning += chunk.delta.reasoningContent; emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent, subAgentId: resolvedId, parentToolCallId }); }
          }
          streamOk = true; // 文本模式重试成功（再抛错会冒泡）
        } else if (isPoolFailoverable(e)) {
          // ★ 候选池故障转移：父模型真失败 → 换池中下一个候选重跑本轮
          const nextId = switchSubModel();
          if (nextId) {
            logger.warn(
              `[sub-agent] 模型调用失败，切换到候选池下一模型重试：${subFailoverChain[subFailoverCursor - 1]?.model.id} → ${nextId}` +
              `（第 ${subFailoverCursor + 1}/${subFailoverChain.length} 个候选）sub=${resolvedId} conv=${task.conversationId} err=${e?.message || e}`,
            );
            fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
            // 换模型后重算工具支持度，避免无工具模型被当纯对话降级（与主循环同口径）
            const st = modelSupportsTools((model.capabilities as string[] | undefined));
            tools = st ? subTools : [];
            continue; // 用新模型重跑本轮（streamOk 仍 false，循环继续）
          }
          throw e; // 候选耗尽，按原错误落库
        } else {
          throw e;
        }
      }
      subStreamDone = streamOk;
      }

      // 文本模式工具调用解析（同时检查 reasoning_content，某些模型把 [TOOL_CALL] 放在推理中）
      // function call 模式可能返回工具名但 arguments 为空，需从 reasoning 中提取完整参数
      // ★ 判据与补救逻辑**与主循环完全对齐**（2026-09-29）：
      //   此前这里是「全部空才处理 + 清空重解析」，主循环修了它没修 → 子智能体仍会带空参进执行。
      //   子智能体是开发模式的主要执行单元，**这条路径不修等于没修**。
      const isEmptyArgSub = (tc: any) => { const a = tc.function?.arguments; return !a || a === '{}' || a === ''; };
      const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.some(isEmptyArgSub);
      if (toolCallAcc.length === 0 || hasEmptyArgs) {
        const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION') || fullContent.toUpperCase().includes('<|DSML|');
        const hasToolInReasoning = fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION') || fullReasoning.toUpperCase().includes('<|DSML|');
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
      // ★ 坑 #8（2026-10-17 修）：子智能体用量必须同步累加进父任务
      //   （口径：子智能体的每次 LLM 调用都真实消耗父任务的配额）。
      //   ★ 2026-10-18：只做可观测 —— 原预算闸已退役，不再据此停子智能体。
      task.totalTokens = (task.totalTokens || 0) + (usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2));

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
      try {
        const hist = loadSubAgentMessages(task.conversationId, parentToolCallId).filter(m => m.content || m.toolCalls || m.role === 'tool');
        const history: Message[] = hist.map(m => ({
          id: m.id, conversationId: '', role: m.role,
          content: m.content, toolCalls: m.toolCalls,
          toolCallId: m.toolCallId, createdAt: m.createdAt,
        }));
        // kind='main' → 带 CONTINUE 自评指令（子智能体接力同样需要模型自评"还有活没干完"）
        // ★ 费用记账：子智能体的自评按**自己的**模型单价计入同一会话账本（source='sub_agent'）
        const r = await summarizeOnMaxSteps(client, systemPrompt, history, subStepBudget, 'main',
          (detail, meta) => recordTaskUsage(task, 'sub_agent', detail, meta, { messages: history }));
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
    let resultText = `子智能体已达到最大循环数（${maxSteps}）`;
    try {
      const hist = loadSubAgentMessages(task.conversationId, parentToolCallId).filter(m => m.content || m.toolCalls || m.role === 'tool');
      const history: Message[] = hist.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      }));
      // ★ 费用记账：给父智能体的收尾总结同样花钱（source='sub_agent'，同库同单价）
      const summary = await summarizeOnMaxSteps(client, systemPrompt, history, maxSteps, 'sub',
        (detail, meta) => recordTaskUsage(task, 'sub_agent', detail, meta, { messages: history }));
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
  /** 费用记账回调（2026-10-17；不传 = 不记账，如记忆抽取等不计入口径的调用） */
  onUsage?: (detail: TokenUsageDetail | undefined, meta: { platformId?: string; modelId?: string }) => void,
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
          onUsage,
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
    const resp = await client.chat(llmMessages, { temperature: 0.3, maxTokens: 1024, onUsage });
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
 * ═══════════════════════════════════════════════════════════════════════════
 * 费用账本接线（2026-10-17，方案 §3.4）—— **任务链路唯一的用量记录出口**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ 为什么必须收口成一个函数：主循环 / 子智能体 / 总结 / 自评判断各有调用点，
 *   在每处各算一遍乘法 = 必然漂移（本项目"同一语义多处实现"的老教训）。
 *   client 的 `onUsage` 钩子在**协议边界归一化后**回调一次（三协议同一结构），
 *   本函数负责：估算兜底 → 单价解析 → 落账本 → 内存增量。
 *
 * ★ 与阈值判定的关系：本函数只**记账**；"要不要提醒"在轮末由 checkAndSaveNotice
 *   单独判（D4：只提醒，程序不停）。两者刻意不耦合同一个函数。
 */
export function recordTaskUsage(
  task: LlmTask,
  source: 'main' | 'sub_agent' | 'summary' | 'judge',
  detail: TokenUsageDetail | undefined,
  meta: { platformId?: string; modelId?: string },
  ctx: { messages?: unknown[]; content?: string; reasoning?: string; inputText?: string; outputText?: string },
): void {
  try {
    const platformId = meta.platformId || task.platformId;
    const modelId = meta.modelId || task.modelId;
    let d = detail;
    let estimated = false;
    if (!d || isMissingUsage(d)) {
      // ★ 坑 #13：中转站乱报（usage 全 0 且响应非空）= **没给**，不是"免费"。
      //   按内容估算并标 estimated（UI 显示 ≈）—— 直接当 0 会让费用恒 ¥0、阈值永不触发。
      //   估算公式收口在 usage-ledger.estimateUsageDetail（probe / 手动压缩同款，别在这里另写）。
      d = estimateUsageDetail({
        inputText: ctx.inputText ?? (ctx.messages ? JSON.stringify(ctx.messages) : ''),
        outputText: ctx.outputText ?? `${ctx.content || ''}${ctx.reasoning || ''}`,
      });
      estimated = true;
    }
    const pricing = resolveTaskModelPricing(task, platformId, modelId);
    const { costCny, unpriced } = recordUsage({
      conversationId: task.conversationId,
      taskId: task.id,
      userId: task.userId,
      platformId,
      modelId,
      source,
      detail: d,
      pricing,
      // 美元平台按**调用当时**的汇率折算（改汇率不重算历史，见 CostBudgetConfig.usdToCny）
      usdToCny: getCostBudgetConfig().usdToCny,
      estimated,
    });
    // 内存增量**仅用于展示与对账**；阈值判定读库（进程重启不归零，见 usage-ledger 注释）
    task.costCnyTotal = (task.costCnyTotal || 0) + costCny;
    if (unpriced) task.costUnpricedCalls = (task.costUnpricedCalls || 0) + 1;
  } catch (e: any) {
    // 记账失败绝不能炸任务：用户的钱要紧，任务的现场更要紧
    logger.warn(`[llm-task] 费用记账失败（不影响任务继续）: conv=${task.conversationId} err=${e?.message || e}`);
  }
}

/** 单价解析（任务内缓存）：model 表用户配置 > 内置参考价；都没有 ⇒ undefined（unpriced 计数） */
function resolveTaskModelPricing(task: LlmTask, platformId: string, modelId: string): ModelPricing | undefined {
  try {
    task.costPricingCache ||= new Map();
    const key = `${platformId}::${modelId}`;
    if (task.costPricingCache.has(key)) return task.costPricingCache.get(key);
    // 先按任务用户找（用户自己配的价优先），找不到再按平台+模型找（种子/内置行）
    const row =
      (db.prepare('SELECT pricing_json FROM model WHERE platform_id = ? AND model_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(platformId, modelId, task.userId) as any) ||
      (db.prepare('SELECT pricing_json FROM model WHERE platform_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1').get(platformId, modelId) as any);
    const raw = row?.pricing_json ? JSON.parse(row.pricing_json) : undefined;
    const pricing = resolveModelPricing(modelId, raw);
    task.costPricingCache.set(key, pricing);
    return pricing;
  } catch {
    return undefined; // 查表失败 ⇒ 按未配价计（unpriced），不猜
  }
}

/**
 * 智能体级单任务费用上限（`agent.config_json.maxCostCny`，元；0/缺省 = 跟随会话档位）。
 *
 * ★ 与会话档位取**更严者**（方案 §3.5.1）：用户在智能体上配了更紧的上限，
 *   那个任务的提醒就该更早 —— 否则"给这个智能体设了 ¥1 上限"是一句空话。
 * ★ 判定前**现读**（与 `liveMaxSteps()` 同口径）：改完下一轮即生效，不等下一个任务。
 */
function resolveAgentCostLimit(task: LlmTask): number {
  try {
    if (!task.agentId) return 0;
    const row = db.prepare('SELECT config_json FROM agent WHERE id = ?').get(task.agentId) as any;
    const v = Number(JSON.parse(row?.config_json || '{}')?.maxCostCny);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0; // 读不到 ⇒ 只用会话档位（不猜）
  }
}

/**
 * 轮末费用判定（D4：**默认只提醒**；hardStopCny 用户自填 > 0 是唯一硬停例外）。
 *
 * ★ 2026-10-18：原轮首的 token/墙钟预算闸（checkTaskBudgetHit）已随"不要程序自动停"
 *   的决策退役，本函数现在是任务里**唯一**的费用类判定。
 *   语义隔离仍是硬约束：「提醒」（warn/exceeded）绝不产生停止信号 —— 下游收尾块
 *   只认 'hard_stop'，其他返回值一律继续跑。
 *
 * @returns 'hard_stop' 时调用方应走停止路径（D4 唯一例外，hardStopCny 默认 0 = 不启用）
 */
export function noticeCostAtRoundEnd(task: LlmTask): 'warn' | 'exceeded' | 'hard_stop' | null {
  try {
    const baseCfg = getCostBudgetConfig(); // ★ 判定前现读（用户调低阈值立即生效，勿快照）
    // 智能体级上限与会话档位取更严者（0 = 未配 ⇒ 只用会话档位）
    const agentLimit = resolveAgentCostLimit(task);
    const cfg: typeof baseCfg =
      agentLimit > 0 && agentLimit < baseCfg.limitCny ? { ...baseCfg, limitCny: agentLimit } : baseCfg;
    const notice = checkAndSaveNotice(task.conversationId, cfg);
    if (!notice.kind) {
      // 没提醒也推一次累计（驱动会话头金额小字）
      emit(task, { type: 'task:cost', kind: null, usedCny: getConversationUsage(task.conversationId)?.costCny || 0, limitCny: cfg.limitCny });
      return null;
    }
    if (notice.kind === 'hard_stop') {
      emit(task, { type: 'task:cost', kind: 'hard_stop', usedCny: getConversationUsage(task.conversationId)?.costCny || 0, limitCny: cfg.hardStopCny });
      return 'hard_stop';
    }
    // ★ 坑 #16：任务不停 ⇒ 文案里"进度已写入"必须**先真写**再发。
    //   ★ 这里直接调 appendTaskProgress 而**不是** recordTaskProgress：后者会顺带
    //     触发经验提炼/记忆蒸馏（收尾语义），每轮提醒都跑一遍既浪费又会 mid-task 调 LLM。
    const usage = getConversationUsage(task.conversationId);
    const usedCny = usage?.costCny || 0;
    const noticeText = formatCostNotice(usedCny, cfg.limitCny, {
      unpricedCalls: usage?.unpricedCalls || 0,
      byModel: summarizeByModel(task.conversationId),
      didWriteProgress: true,
    });
    void appendTaskProgress(task.conversationId, 'cost_notice', noticeText, { steps: task.step });
    emit(task, {
      type: 'task:cost_notice',
      kind: notice.kind,
      text: noticeText,
      usedCny,
      limitCny: cfg.limitCny,
      units: notice.units,
    });
    return notice.kind;
  } catch (e: any) {
    logger.warn(`[llm-task] 费用判定失败（不影响任务继续）: conv=${task.conversationId} err=${e?.message || e}`);
    return null;
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
  outcome: 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop' | 'loop_guard_stop',
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
      // ★ 2026-10-14：800 → 1600。抽取条目多时 800 会把 JSON 截断，而**截断的 JSON 必然
      //   解析失败** ⇒ 整批记忆被丢。截断是除"漏转义反斜杠"之外的另一条已知丢数据路径
      //   （见 memory-service.ts 里 repairInvalidEscapes 的头注）。
      //   ★ 同文件 6118 行那处「任务经验提炼」不用跟着改：它的提示词限死最多 3 条，800 够。
    ], { temperature: 0.2, maxTokens: 1600, responseFormat: { type: 'json_object' } });

    const text = resp.delta?.content || '';
    // 兼容数组 / {items:[...]} / 单对象（部分模型 json_object 模式下返回单个对象而非数组，
    // 此前只认数组导致抽取结果恒为 0 条且无任何日志）
    const items = parseExtractedItems(text);
    if (items.length) {
      logger.info(`[memory] 抽取: 模型返回 ${items.length} 条候选`);
    } else if (text.trim()) {
      // ★ 2026-10-14：INFO → WARN 并带上长度/截断线索。此前只是 INFO，静默丢记忆时日志里
      //   翻不到痕迹（实测两次：16:02:36、16:55:19，两次丢的还是最该记住的东西）。
      logger.warn(
        `[memory] 抽取: 模型输出无法解析为条目（len=${text.length}${text.length >= 1600 ? '，疑似被 maxTokens 截断' : ''}），本次记忆已丢弃。前120字:`,
        text.slice(0, 120),
      );
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
  outcome: 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop' | 'loop_guard_stop',
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
          // P2-13：自动草稿同时落 `skill_draft` 表，与手动蒸馏（蒸馏工作台）汇入同一个草稿列表。
          // 单独 try/catch：落库失败不能连带吞掉下面的会话内提示（此时 SKILL.md 文件其实已经写成功）。
          if (draft.ok && !draft.existed && draft.resultMd) {
            try {
              insertSkillDraft({
                userId: task.userId,
                title: draft.name || '自动蒸馏草稿',
                status: 'draft',
                sourceConvId: task.conversationId,
                resultMd: draft.resultMd,
              });
            } catch (e: any) {
              logger.warn('[skill-distill] 自动草稿落库失败:', e?.message || e);
            }
          }
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
  // 工作目录（会话指定 > 会话绑定空间 > 非店铺模式的全局兜底）——项目技能目录与 AGENTS.md/rules 段共用同一取值口径
  // ★ 2026-10-12：与 createTask 同源插入「会话绑定空间」一级（修串工作目录，见该函数注释）
  // ★ 2026-10-21：店铺模式不再回退全局（否则提示词/项目规则会读到别的项目目录）
  const effectiveWorkspaceDir = resolveEffectiveWorkspaceDir(opts?.conversationId, opts?.workspaceDir) || '';

  // 应用指引（用户在前端配置的全局上下文/行为约束）：无条件注入，保证三条入口行为一致
  if (appGuide && appGuide.trim()) {
    parts.push('---\n## 应用指引\n' + appGuide.trim());
  }

  // 系统提示词：会话级优先，其次 agent 级（与前端 conv.systemPrompt || agent.systemPrompt 一致）
  // ★ 2026-10-19：改为合成而非覆盖 —— 前端建会话时会写一份 agent+场景的快照，
  //   若直接 `conv || agent`，agent 提示词此后所有更新都会被旧快照永久遮蔽
  //   （实测开发模式新提示词完全没生效）。合成规则见 composeConversationBasePrompt。
  let basePrompt = '';
  if (agentId) {
    const agent = db.prepare('SELECT system_prompt, type, skill_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    basePrompt = composeConversationBasePrompt(convMounts.systemPrompt, agent?.system_prompt);
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

      // ★ deny 预过滤（2026-10-18）：与 buildToolsForBackend 的 6.5 段同源 ——
      //   提示词模式的工具清单也必须摘掉用户 deny 的工具，否则提示词模型看到"可用"
      //   却调不动（同一事实两处判定必须一致，canDelegate 教训的同类）。
      //   行格式统一为 `- \`工具名\`: 描述`，按行首反引号名提取比对；`### 分组头` 保留。
      const deniedNamesForPrompt = denyOnlyToolNames(userId);
      const sectionLines = toolLines.filter((l) => l.trim().length > 0).filter((l) => {
        if (deniedNamesForPrompt.size === 0) return true;
        const m = /^-\s*`([^`]+)`/.exec(l);
        return !(m && deniedNamesForPrompt.has(m[1]));
      });
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
          '它返回一段结构化结论（做了什么 / 关键结果 / 未完成部分），你据此继续。',
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

  // ★ 安全经验库（自学习）：只有**人工审批通过**的条目才会走到这里（2026-10-17）。
  //   为什么闸门放在提示词组装这一处：经验正文一旦进入系统提示词就能改变模型后续行为，
  //   所以"能不能进"必须由注入点统一判定，而不是各工具自己记得过滤。
  //   只对安全域智能体注入；其它模式（办公/代码/工作流）完全不受影响。
  //   无已批准条目时返回 ''，不产生空段落，也不影响提示词前缀缓存之外的任何东西。
  if (isSecExperienceAgent(agentId)) {
    try {
      const experience = buildSecExperiencePromptSection();
      if (experience) parts.push(experience);
    } catch { /* 经验库读失败不影响任务（缺表/坏 JSON 都按"没有经验"处理） */ }
  }

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
          '## 项目规则（自动读取自工作目录，优先级高于默认行为；source 是相对路径，目录越深范围越窄，与上层冲突时以更深的为准）',
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

  // ★★★ 仓库地图（repo map）常驻注入（2026-10-18，开发模式专项）：架构师 + 探索者 + 实现者。
  //   此前模型只有检索工具没有"地图"，长任务反复逐目录盲探烧步数；现在地图常驻提示词。
  //   段内容由 services/repo-map.ts 统一封装（含快照免责声明），失败静默降级不影响任务。
  if (agentId && DEV_REPO_MAP_AGENT_IDS.has(agentId)) {
    const repoMapSection = repoMapPromptSection(effectiveWorkspaceDir);
    if (repoMapSection) parts.push(repoMapSection);
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
      '## 浏览器页面收拾（收尾必做，不是可选）',
      '你在任务中打开过网页时，**收尾前必须**收拾页面，不要把一堆中间页留在用户的面板里。',
      '做法：',
      '1. 先 `browser_get_tabs` 看有哪些标签页（返回里 `agentOpened: true` 的是**你打开的**，可以关）。',
      '2. 用 `browser_close_tab` 的 `tabIds` 参数**一次关掉**那些"已完成使命的中间页"（搜索结果页、登录页、跳转中转页、你看完就够了的页）。',
      '3. **保留**该给用户看的页：最终成果页（报告/商品/订单/发布结果等用户会想接着看或操作的页），并在总结里说明"已为你保留 XX 页面"。',
      '★ 硬性判据：**任务结束时你自己开的页不得超过 2 个**（1 个交付页 + 至多 1 个仍需续用的页）。'
        + '收尾前数一遍 `browser_get_tabs` 的结果——还留着 3 个以上就是你没收干净。',
      '★ 为什么强调：留着的页**不会自己停**（视频页会继续自动播放/滚动，页面脚本照常跑），'
        + '用户看到的就是"任务早跑完了，后台还在动"。',
      '',
      '## 让用户看得见你在哪一页',
      '工具**操作**在哪个标签页，与面板**显示**哪个标签页，是两件事——不显式切换，就会出现"你在 A 页干活、用户盯着 B 页"。',
      '- 默认：`browser_new_tab` / `browser_navigate(openInNewTab)` 开的新页会切过去（用户能看到你在动哪页）。',
      '- 只是**你自己读写**的中间页、不想打断用户正在看的页面：传 `browser_new_tab { background: true }`。',
      '- 要把用户视线拉回某一页（交付页、正在填的表单、需要用户确认的页）：'
        + '用 `browser_switch_tab { tabId }` **显式切过去**，别指望它自己跟随。',
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
        '- 每开始一步，先用 task_step 把该步标记为 running（服务端据此记录该步耗时的起点）；',
        '  完成或失败后**立即**用 task_step 标记 done/failed，并写 note 概述结果 —— 计划与耗时统计都以它为准。',
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
 *  结构由服务端 task-plan-file 的 backendTaskPlan / backendTaskStep 写入（2026-10-23 起前端不再回写）：
 *  `{ title?, startedAt?, finishedAt?, steps: [{ title, status, note?, startedAt?, finishedAt?, activeMs? }] }`。
 *  ★ 跨会话回退（2026-09-30）：会话行没有计划时读工作目录 plan.md（新会话接续上一会话的长任务）。
 *    顺序：会话计划优先（本会话实时进度最新）→ 文件计划（跨会话共享，task_step 每步镜像）。 */
function loadTaskPlan(conversationId?: string | null): {
  title: string;
  steps: Array<{ title: string; status: string; note?: string; startedAt?: number; finishedAt?: number; activeMs?: number }>;
} | null {
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
            ...(Number(s?.startedAt) ? { startedAt: Number(s.startedAt) } : {}),
            ...(Number(s?.finishedAt) ? { finishedAt: Number(s.finishedAt) } : {}),
            ...(Number(s?.activeMs) ? { activeMs: Number(s.activeMs) } : {}),
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

// ── 嵌套 AGENTS.md 发现（2026-10-19，对标 Codex 的分层规则发现）──
// Codex 从仓库根一路读到当前工作目录，子目录的 AGENTS.md 只影响其子树。
// 我们的提示词是每轮固定构建的、不知道"下一步要改哪个文件"，所以采用**全量发现 + 标注目录**：
// 每个规则条目的 source 是相对路径（如 packages/ui/AGENTS.md），并明确"越深越优先"。
// ★ 发现结果按 60s TTL 缓存：目录遍历比读文件贵得多，不能每轮 ReAct 都走一遍；
//   新增的嵌套规则最多 60s 后生效（内容缓存仍按 mtime 指纹，改内容即时生效）。
const RULE_DISCOVERY_TTL_MS = 60_000;
const RULE_DISCOVERY_MAX_DEPTH = 3;
const RULE_DISCOVERY_MAX_DIRS = 400;
const AGENTS_DISCOVERY_CACHE = new Map<string, { at: number; files: string[] }>();

export function discoverNestedAgents(workspaceDir: string): string[] {
  const hit = AGENTS_DISCOVERY_CACHE.get(workspaceDir);
  if (hit && Date.now() - hit.at < RULE_DISCOVERY_TTL_MS) return hit.files;
  const files: string[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > RULE_DISCOVERY_MAX_DEPTH || visited >= RULE_DISCOVERY_MAX_DIRS) return;
    visited++;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as any;
    } catch { return; }
    // 根目录的 AGENTS.md 由 loadProjectRules 单独收（source 与既有行为保持一致：'AGENTS.md'）
    if (depth > 0) {
      const a = (entries as any[]).find((e) => e.isFile() && e.name.toLowerCase() === 'agents.md');
      if (a) files.push(path.join(dir, a.name));
    }
    const dirs = (entries as any[])
      .filter((e) => e.isDirectory() && !DEFAULT_SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
      .sort((x, y) => String(x.name).localeCompare(String(y.name)));
    for (const e of dirs) walk(path.join(dir, e.name), depth + 1);
  };
  walk(workspaceDir, 0);
  AGENTS_DISCOVERY_CACHE.set(workspaceDir, { at: Date.now(), files });
  return files;
}

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
  // ③ 子目录 AGENTS.md（深度 ≤ 3）：source 用相对路径，模型据此判断适用子目录
  try {
    for (const f of discoverNestedAgents(workspaceDir)) {
      const rel = path.relative(workspaceDir, f).replace(/\\/g, '/');
      candidates.push({ source: rel, path: f });
    }
  } catch { /* 遍历失败按"只有根规则"处理 */ }

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

  // 1.5) 多智能体规划工具（2026-10-08 收窄 2026-10-20）：只无条件暴露「规划三件套」——
  //      plan_tasks / get_plan_status / reassign_task 是主智能体长任务编排的通用能力，
  //      不随挂载变化（子智能体侧由 runSubAgent 的工具裁剪 + depth>=1 拦截双重排除）。
  // ★★★ 2026-10-20 收敛（用户实测：内容生产工具被无条件广播到所有智能体，编码助手/
  //    pageAgent 都背着 publish_enqueue / anim_compose / screen_record 等纯噪音）：
  //    应用编排（app_create_task / app_open_window / screen_record）、后期合成
  //    （demo_compose / anim_compose）、发布队列（publish_*）、设计素材（design_asset_sites）
  //    这套工具**已由「言智代言官」在 builtin-yanzhi-agent.ts 声明**，谁用谁挂，
  //    不再无条件广播（发布执行员走 browser_run_recipe，根本不碰 publish_*）。
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
  // 6.5) ★ deny 预过滤（2026-10-18，对标 CC 工具池装配管道）：用户 deny 规则里
  //    「精确工具名、无参数 pattern」的工具在装配期整体摘除 —— 模型看不到就不会调用，
  //    也省 schema token。pattern/'*' 规则依赖参数，装配期看不到参数，
  //    仍由 executeTool 的用户钩子段逐调用判定（denyOnlyToolNames 注释详述取舍）。
  const deniedByHook = denyOnlyToolNames(userId);
  const routedPool = deniedByHook.size
    ? tools.filter((t: any) => {
        const n = t?.function?.name || t?.name;
        return !(typeof n === 'string' && deniedByHook.has(n));
      })
    : tools;
  const routed = dynamicToolRoute(routedPool, opts?.userContent);
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
