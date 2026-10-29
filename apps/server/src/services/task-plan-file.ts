// 任务计划文件 —— 把 conversation.task_plan_json 镜像落盘到工作目录，实现"跨会话接力"。
//
// ★ 为什么必须有（2026-09-30 用户拍板「跨会话就写到工作目录里面去」）：
//   task_plan_json 挂在 conversation 行上，**换会话就读不到** —— 生产库实证：
//   会话 aaa84c6c 有《驭兽斋》第二章计划（8 步），用户在新会话 061202ec 说
//   「之前第二章的任务没有完成你完成下」，loadTaskPlan(新会话 id) 返回 null，
//   接力棒直接断掉。计划必须像 decisions.md / progress.md 一样落在目录维度上。
//
// 文件位置（与任务决策/进展同族，别另起炉灶）：
//   - 空间绑定了本地目录（dir_path）→ <dir_path>/.yan-zhi/task-memory/plan.md
//   - 未绑定目录 → <serverState.workspaceDir>/spaces/<spaceId>/.yan-zhi/task-memory/plan.md
//
// 两个写入入口（都收敛到 writeTaskPlanFile）：
//   a) 前端 task_plan/task_step → PATCH /conversations/:id（persistPlan 800ms 防抖）
//      → routes/conversations.ts 落库后镜像写文件；
//   b) 无人值守（无 SSE 订阅者）→ llm-task-manager.ts 后端兜底执行，写库 + 写文件。
//
// fail-safe：写/读/删文件任何失败都静默（计划文件是增强能力，不能拖垮任务主链路）。
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { serverState } from '../state.js';

const TASK_MEMORY_DIR = '.yan-zhi/task-memory';
const PLAN_FILE = 'plan.md';

interface SpaceRow {
  id: string;
  dir_path: string | null;
}

export interface TaskPlanStep {
  title: string;
  status?: string;
  note?: string;
  /** 首次进入 running 的毫秒时间戳（幂等，重复 running 不覆盖） */
  startedAt?: number;
  /** 进入 done / failed 的毫秒时间戳 */
  finishedAt?: number;
  /** 返工时已累计的活跃时长（毫秒） */
  activeMs?: number;
  /** 结算时统计的「等待时长」（毫秒）：该步时间窗内没有任何活动的长间隙之和（等用户/等外部） */
  waitMs?: number;
}

export interface TaskPlan {
  title?: string;
  /** 计划创建时间（步骤未标 running 时的耗时兜底起点；重规划沿用原值） */
  createdAt?: number;
  /** 计划级开始时间 = 首个步骤开始的时间 */
  startedAt?: number;
  /** 计划级结束时间 = 全部步骤进入终态的时间 */
  finishedAt?: number;
  steps: TaskPlanStep[];
}

/** 重规划时保留已完成步骤的计时（服务端内部参数，绝不来自模型入参） */
export interface PreservedStepTiming {
  /** 从 1 起，与新计划 steps 的下标一致 */
  index: number;
  status: 'done' | 'failed';
  startedAt?: number;
  finishedAt?: number;
  activeMs?: number;
  waitMs?: number;
}

/** 步骤耗时：返工前的累计活跃时长 + 本轮时间窗 */
export function stepElapsedMs(step: TaskPlanStep | null | undefined): number {
  if (!step) return 0;
  const active = Number(step.activeMs) || 0;
  const started = Number(step.startedAt) || 0;
  const finished = Number(step.finishedAt) || 0;
  const current = started && finished > started ? finished - started : 0;
  return active + current;
}

/** 步骤的「干活时长」= 墙钟耗时 − 等待时长（Top3 排序口径，见 2026-10-27 C） */
export function stepBusyMs(step: TaskPlanStep | null | undefined): number {
  return Math.max(0, stepElapsedMs(step) - (Number(step?.waitMs) || 0));
}

/**
 * 单次「没有任何活动」超过这么久才记为等待。
 * 依据：浏览器动作硬超时 ≤60s、一次模型推理通常也在分钟级 —— 3 分钟以上没动静，
 * 基本就是等用户确认 / 等外部系统 / 页面卡死，不是这一步在干活。
 */
const WAIT_GAP_MS = 3 * 60 * 1000;
const WAIT_SCAN_LIMIT = 5000;

/** 读时间窗内的活动时间点（assistant / tool 消息即一次活动）；失败返回空数组 */
function activityTimestamps(conversationId: string, from: number, to: number): number[] {
  try {
    const rows = db
      .prepare(
        `SELECT created_at FROM message
          WHERE conversation_id = ? AND created_at >= ? AND created_at <= ?
            AND role IN ('assistant', 'tool')
          ORDER BY created_at ASC LIMIT ?`,
      )
      .all(conversationId, from, to, WAIT_SCAN_LIMIT) as Array<{ created_at?: number }>;
    return rows.map((r) => Number(r.created_at) || 0).filter((n) => n > 0);
  } catch {
    return [];
  }
}

/** 步骤时间窗内的等待时长：首尾与相邻活动之间的长间隙之和 */
function computeWaitMs(conversationId: string, from: number, to: number): number {
  if (!(to > from)) return 0;
  const points = activityTimestamps(conversationId, from, to);
  let wait = 0;
  let cursor = from;
  for (const at of points) {
    if (at - cursor > WAIT_GAP_MS) wait += at - cursor;
    if (at > cursor) cursor = at;
  }
  if (to - cursor > WAIT_GAP_MS) wait += to - cursor;
  return wait;
}

/** 由步骤时间戳推导计划级时间（steps 是唯一真相源） */
function derivePlanTiming(plan: TaskPlan): void {
  const started = plan.steps.map((s) => Number(s.startedAt) || 0).filter((n) => n > 0);
  plan.startedAt = started.length ? Math.min(...started) : undefined;
  const allTerminal = plan.steps.every((s) => s.status === 'done' || s.status === 'failed');
  const finished = plan.steps.map((s) => Number(s.finishedAt) || 0).filter((n) => n > 0);
  plan.finishedAt = allTerminal && finished.length === plan.steps.length ? Math.max(...finished) : undefined;
}

function getSpaceRowByConversation(conversationId: string): SpaceRow | null {
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  if (!conv?.space_id) return null;
  const space = db.prepare('SELECT id, dir_path FROM space WHERE id = ?').get(conv.space_id) as
    | SpaceRow
    | undefined;
  return space || null;
}

/** 解析计划文件落盘路径；会话未挂空间返回 null（调用方跳过，不建目录） */
export function getTaskPlanPath(conversationId: string): string | null {
  const space = getSpaceRowByConversation(conversationId);
  if (space) {
    if (space.dir_path) return path.join(space.dir_path, TASK_MEMORY_DIR, PLAN_FILE);
    return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, TASK_MEMORY_DIR, PLAN_FILE);
  }
  // 未挂空间的会话：回退全局工作目录（只要配置了就写，让"跨会话"在未挂空间时也能成立）
  const ws = (serverState.workspaceDir || '').trim();
  return ws ? path.join(ws, TASK_MEMORY_DIR, PLAN_FILE) : null;
}

function nowStamp(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

const STATUS_MARK: Record<string, string> = { done: '[x]', running: '[~]', failed: '[-]', pending: '[ ]' };

/** 结构化计划 → markdown（勾选框格式，与提示词回注的「接力棒」渲染一致） */
export function renderTaskPlanMarkdown(plan: TaskPlan): string {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const lines = steps.map((s) => {
    const mark = STATUS_MARK[String(s?.status || 'pending')] || '[ ]';
    const title = String(s?.title || '(未命名步骤)');
    return `- ${mark} ${title}${s?.note ? ` —— ${String(s.note)}` : ''}`;
  });
  return [
    `# 任务计划${plan?.title ? `：${plan.title}` : ''}`,
    '',
    `> 由 task_plan / task_step 自动维护，跨会话共享；最近更新：${nowStamp()}`,
    '',
    ...(lines.length ? lines : ['（空计划）']),
    '',
  ].join('\n');
}

/** markdown → 结构化计划（loadTaskPlan 的文件回退用）；解析不出步骤返回 null */
export function parseTaskPlanMarkdown(md: string): TaskPlan | null {
  if (!md || !md.trim()) return null;
  let title = '';
  const steps: TaskPlan['steps'] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const titleMatch = line.match(/^#\s*任务计划[：:]\s*(.*)$/);
    if (titleMatch && !title) { title = titleMatch[1].trim(); continue; }
    const stepMatch = line.match(/^- \[(x|X|~|-| )\]\s+(.+)$/);
    if (!stepMatch) continue;
    const mark = stepMatch[1];
    const body = stepMatch[2];
    const sep = body.indexOf(' —— ');
    const stepTitle = (sep >= 0 ? body.slice(0, sep) : body).trim();
    const note = sep >= 0 ? body.slice(sep + 4).trim() : '';
    if (!stepTitle) continue;
    steps.push({
      title: stepTitle,
      status: mark.toLowerCase() === 'x' ? 'done' : mark === '~' ? 'running' : mark === '-' ? 'failed' : 'pending',
      ...(note ? { note } : {}),
    });
  }
  return steps.length ? { title, steps } : null;
}

/** 写（或清除）计划文件。plan=null 删除文件。返回是否成功（失败 false，不抛）。 */
export async function writeTaskPlanFile(conversationId: string, plan: TaskPlan | null): Promise<boolean> {
  try {
    const filePath = getTaskPlanPath(conversationId);
    if (!filePath) return false;
    if (!plan) {
      try { await unlink(filePath); } catch { /* 本就不存在 */ }
      return true;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, renderTaskPlanMarkdown(plan), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** 读计划文件原文（供提示词回注回退）。读不到/为空返回 null。 */
export function readTaskPlanFileMarkdown(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  try {
    const filePath = getTaskPlanPath(conversationId);
    if (!filePath) return null;
    const content = readFileSync(filePath, 'utf-8');
    return content.trim() ? content : null;
  } catch {
    return null;
  }
}

/** 读计划文件为结构化计划；无有效步骤返回 null。 */
export function loadTaskPlanFromFile(conversationId: string | null | undefined): TaskPlan | null {
  const md = readTaskPlanFileMarkdown(conversationId);
  if (!md) return null;
  try {
    return parseTaskPlanMarkdown(md);
  } catch {
    return null;
  }
}

// ── 无人值守兜底：后端直接执行 task_plan / task_step（写库 + 写文件） ──
// 与前端 plan-buckets.ts 的 applyTaskPlan/applyTaskStep 语义对齐（边界显式报错不静默）。
//
// ★ 跨会话播种（seedTaskPlanFromFile）已于 2026-10-05 删除（用户拍板「任务规划是
//   单会话的」）：UI 不再向新会话还原旧计划；新会话靠 loadTaskPlan 的**文件回退**
//   让模型「找到之前的任务记录」，由模型 task_plan 重新规划，而非复用旧计划对象。

/** 写会话计划到 DB 行。★ 2026-10-08 导出：压缩前抢救的待办并入路径需要它。 */
export function savePlanJson(conversationId: string, plan: TaskPlan): boolean {
  try {
    db.prepare('UPDATE conversation SET task_plan_json = ? WHERE id = ?').run(JSON.stringify(plan), conversationId);
    return true;
  } catch {
    return false;
  }
}

/** 读会话计划（DB 行）。★ 2026-10-08 导出：压缩前抢救需要读计划现状，
 *  以便①喂给 LLM 判增量待办 ②把抢救出的 todo 并入现有步骤（而不是覆盖）。
 *  ★ 只读 DB 行（不回落文件）—— 抢救是"追加到**本会话**计划"，跨会话的 plan.md
 *    属于另一条链，混进来会让抢救把步骤追加到别的会话的计划里。 */
export function loadPlanJson(conversationId: string): TaskPlan | null {
  try {
    const row = db.prepare('SELECT task_plan_json FROM conversation WHERE id = ?').get(conversationId) as
      | { task_plan_json?: string | null }
      | undefined;
    if (!row?.task_plan_json) return null;
    const raw = JSON.parse(row.task_plan_json);
    const steps = Array.isArray(raw?.steps) ? raw.steps : [];
    return steps.length ? raw as TaskPlan : null;
  } catch {
    return null;
  }
}

/** 步骤开始时间兜底 —— 模型常跳过 running 直接标 done（2026-10-23 实测：6 步计划全在
 *  结束时一次性标记，每步 startedAt===finishedAt，界面耗时全是「—」）。
 *  时间线连续地取「最近一个已结算的前序步骤的结束点」；没有则退回计划创建时间。 */
function fallbackStepStart(plan: TaskPlan, index: number, now: number): number {
  for (let i = index - 2; i >= 0; i--) {
    const prevFinished = Number(plan.steps[i]?.finishedAt) || 0;
    if (prevFinished > 0) return Math.min(prevFinished, now);
  }
  const created = Number(plan.createdAt) || 0;
  return created > 0 ? Math.min(created, now) : now;
}

/** 标题归一化：只用于把「重规划前后的同一步」认出来（忽略空白差异） */
function normalizeStepTitle(t: unknown): string {
  return String(t ?? '').replace(/\s+/g, ' ').trim();
}

/** 计划是否已全部终态（done/failed） */
function isPlanTerminal(plan: TaskPlan): boolean {
  return plan.steps.length > 0 && plan.steps.every((s) => s.status === 'done' || s.status === 'failed');
}

/** 最近一条用户消息时间（毫秒）；查不到/表不存在返回 0 */
function lastUserMessageAt(conversationId: string): number {
  try {
    const row = db
      .prepare("SELECT created_at FROM message WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1")
      .get(conversationId) as { created_at?: number } | undefined;
    return Number(row?.created_at) || 0;
  } catch {
    return 0;
  }
}

/**
 * 模型再次 task_plan 时，判断这是「同一轮内重规划/继续」还是「用户提了新任务」。
 *
 * ★ 2026-10-27 实报（conv c79811d2）：18:52 建 4 步计划 → 干了 3 分钟 → 18:55 又建 5 步计划，
 *   旧实现直接把 createdAt 重置成"现在"，前 3 分钟耗时凭空消失，且旧计划里已完成步骤的
 *   计时全部作废（界面总耗时对不上实际，Top3 也跟着失真）。
 *   判据只认**用户是否在本计划之后又说过话**：没说过 ⇒ 还是同一轮任务，沿用旧计划计时；
 *   说过 ⇒ 新任务，按新计划重新起算（跨任务的耗时不该累加）。
 *   计划已终态但用户没再说话同样算"继续"——模型只是把后续阶段补进计划。
 */
function isSameTaskTurn(previous: TaskPlan, conversationId: string): boolean {
  const anchor = Number(previous.finishedAt) || Number(previous.createdAt) || 0;
  if (!anchor) return true;
  return lastUserMessageAt(conversationId) <= anchor;
}

/** 重规划时按标题把已完成步骤的状态与计时搬到新计划（同一步改了序号也能认出来） */
function carriedStepTimings(previous: TaskPlan, steps: TaskPlanStep[]): PreservedStepTiming[] {
  const used = new Set<number>();
  const out: PreservedStepTiming[] = [];
  steps.forEach((step, i) => {
    const title = normalizeStepTitle(step.title);
    if (!title) return;
    const found = previous.steps.findIndex((p, pi) => {
      if (used.has(pi)) return false;
      if (p.status !== 'done' && p.status !== 'failed') return false;
      return normalizeStepTitle(p.title) === title;
    });
    if (found < 0) return;
    used.add(found);
    const p = previous.steps[found];
    out.push({
      index: i + 1,
      status: p.status as 'done' | 'failed',
      ...(Number(p.startedAt) ? { startedAt: Number(p.startedAt) } : {}),
      ...(Number(p.finishedAt) ? { finishedAt: Number(p.finishedAt) } : {}),
      ...(Number(p.activeMs) ? { activeMs: Number(p.activeMs) } : {}),
      ...(Number(p.waitMs) ? { waitMs: Number(p.waitMs) } : {}),
    });
  });
  return out;
}

/** 无人值守 task_plan：创建/整体替换计划。返回给模型的回执文本。
 *  ★ preserved 仅供服务端内部（重规划）使用：把已完成步骤的状态与计时原样搬进新计划，
 *    避免「重规划把已完成步骤的耗时抹成 0」。模型入参永远不会走到这里。
 *  ★ 模型自己二次调用时（preserved 未传）：同一轮内同样按重规划处理（见 isSameTaskTurn），
 *    否则旧计划已完成步骤的计时与 createdAt 会被一并清空（2026-10-27 实报）。 */
export async function backendTaskPlan(
  conversationId: string,
  args: Record<string, unknown>,
  preserved?: PreservedStepTiming[],
): Promise<string> {
  const rawSteps = Array.isArray(args?.steps) ? (args.steps as any[]) : [];
  const steps: TaskPlanStep[] = rawSteps
    .filter((s: any) => s && s.title)
    .map((s: any) => ({
      title: String(s.title),
      ...(s.description ? { note: String(s.description) } : {}),
      status: 'pending',
    }));
  if (!steps.length) return 'task_plan 失败：steps 里没有有效步骤（每项需要 title）';
  // ★ 2026-10-27：模型二次 task_plan 不再清空计时。同一轮内（用户没再说话）视为重规划/继续：
  //   沿用旧计划的 createdAt，并按标题把已完成步骤的状态与耗时搬过来；用户发过新消息才是新任务。
  const existing = loadPlanJson(conversationId);
  const replan = preserved === undefined && existing !== null && isSameTaskTurn(existing, conversationId);
  const effectivePreserved = replan ? carriedStepTimings(existing!, steps) : preserved;
  for (const p of effectivePreserved || []) {
    const step = steps[p.index - 1];
    if (!step) continue;
    step.status = p.status;
    if (p.startedAt) step.startedAt = p.startedAt;
    if (p.finishedAt) step.finishedAt = p.finishedAt;
    if (p.activeMs) step.activeMs = p.activeMs;
    if (p.waitMs) step.waitMs = p.waitMs;
  }
  // 重规划（传了 preserved，可能为空数组）沿用原计划的创建时间；
  // 新任务的新计划才以此刻为起点 —— 否则兜底起点会被重置成"现在"，新步骤耗时又归零。
  const carriedCreatedAt = effectivePreserved !== undefined
    ? Number(existing?.createdAt) || undefined
    : undefined;
  const plan: TaskPlan = { title: String(args?.title || '任务计划'), steps, createdAt: carriedCreatedAt ?? Date.now() };
  derivePlanTiming(plan);
  if (!savePlanJson(conversationId, plan)) return 'task_plan 失败：写库失败';
  // ★★ 2026-10-26：区分「真的写失败」与「本就没配工作目录」。
  //   `getTaskPlanPath` 在既未挂空间、也没设全局工作目录时返回 null ——
  //   那是**按设计跳过**（见该函数注释），但旧代码把 false 一律渲染成
  //   「工作目录计划文件写入失败」⇒ 未设工作目录的会话每推进一步就收到一次
  //   "失败"回执（实测任务 ba426984 连刷 3 次），模型会以为计划没保存而反复补救。
  const canPersist = getTaskPlanPath(conversationId) !== null;
  const ok = await writeTaskPlanFile(conversationId, plan);
  const warn = canPersist && !ok ? '（工作目录计划文件写入失败，跨会话接力可能不可用）' : '';
  const kept = replan ? (effectivePreserved?.length || 0) : 0;
  const replanNote = replan
    ? `（同一轮内重规划，沿用原计划计时${kept ? `，已保留 ${kept} 个已完成步骤的耗时` : ''}）`
    : '';
  return `已创建任务计划「${plan.title}」，共 ${steps.length} 步${replanNote}${warn}`;
}

/**
 * 无人值守 task_step：推进某一步。返回给模型的回执文本。
 *
 * ★ 计划计时**唯一写入点**（2026-10-23）：
 *   running → startedAt ??= now（幂等）；done/failed → finishedAt = now；
 *   done 后又 running（返工）→ 把上一轮时长并入 activeMs、重置 startedAt。
 *   计划级 startedAt/finishedAt 由步骤时间推导，不单独记账。
 */
export async function backendTaskStep(conversationId: string, args: Record<string, unknown>): Promise<string> {
  const plan = loadPlanJson(conversationId);
  if (!plan) return '当前会话还没有任务计划，请先调用 task_plan 建立计划再推进步骤';
  const steps = plan.steps || [];
  const idx = Number(args?.index);
  if (!Number.isFinite(idx) || idx < 1 || idx > steps.length) {
    return `task_step 的 index 超出范围（1-${steps.length}）`;
  }
  const status = String(args?.status || 'done');
  if (!['pending', 'running', 'done', 'failed'].includes(status)) {
    return `task_step 的 status 非法（${status}），应为 pending/running/done/failed`;
  }
  const step = steps[idx - 1];
  const now = Date.now();
  // ★ 2026-10-27 推进守卫（B）：只拦两类会把耗时记歪的明确错误，其余一律放行（兼容小模型）。
  //   ① 同一时刻只允许一个步骤 running。别的步骤还开着时不许动另一个步骤；
  //      目标步骤自己正 running 时放行 —— 关掉它是合法动作，也避免历史多 running 的脏数据把计划锁死。
  //   ② 已结算（done/failed）的步骤重新打开 = 返工，必须带 note 说明原因。
  //      实报 conv c79811d2：18:56 全标 done 后**无 note** 重开第 4 步，之后 14 分钟没人再动它，
  //      空窗全记在第 4 步头上（界面显示「保存合集并等成功提示 14 分 52 秒」）。
  const otherRunning = steps.findIndex((s, i) => i !== idx - 1 && s.status === 'running');
  if (step.status !== 'running' && otherRunning >= 0) {
    return `第 ${otherRunning + 1} 步仍在进行中：同一时刻只允许一个步骤 running。请先把它 task_step 成 done/failed，再推进第 ${idx} 步。`;
  }
  if (status === 'running' && (step.status === 'done' || step.status === 'failed') && !String(args?.note ?? '').trim()) {
    return `第 ${idx} 步已完成，重新打开视为返工：请在 note 里写明返工原因（例如「公开页验证发现顺序不对」）后再标 running。`;
  }
  if (status === 'running') {
    if (step.finishedAt) {
      // 返工：上一轮已结算 → 累计活跃时长，重新起算本轮
      step.activeMs = (Number(step.activeMs) || 0) + stepElapsedMs({ ...step, activeMs: 0 });
      step.startedAt = now;
      step.finishedAt = undefined;
    } else if (!step.startedAt) {
      step.startedAt = now;
    }
  } else if (status === 'done' || status === 'failed') {
    // 模型没标 running（常见于小模型）：起点回退到上一个已结算步骤的结束点，
    // 保证完成的步骤仍有耗时记录，而不是 startedAt===finishedAt 的 0 秒。
    if (!step.startedAt) step.startedAt = fallbackStepStart(plan, idx, now);
    if (!step.finishedAt) {
      step.finishedAt = now;
      // ★ 2026-10-27（C）：结算时把「时间窗里没有任何活动」的长间隙记为等待，
      //   界面用它把「这步干了多久」和「其中等了多久」分开（Top3 按干活时长排序）。
      const waited = computeWaitMs(conversationId, Number(step.startedAt) || 0, now);
      if (waited > 0) step.waitMs = (Number(step.waitMs) || 0) + waited;
    }
  }
  step.status = status;
  if (args?.note != null) step.note = String(args.note);
  derivePlanTiming(plan);
  if (!savePlanJson(conversationId, plan)) return 'task_step 失败：写库失败';
  // 与 task_plan 同口径：未配工作目录 = 按设计跳过，不算失败（见上方 ★★ 2026-10-26 注释）
  const canPersist = getTaskPlanPath(conversationId) !== null;
  const ok = await writeTaskPlanFile(conversationId, plan);
  const warn = canPersist && !ok ? '（工作目录计划文件写入失败）' : '';
  return `已更新第 ${idx} 步状态为 ${status}${warn}`;
}
