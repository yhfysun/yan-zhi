// PlanRunner —— 任务计划并行调度器（2026-10-08 多智能体协同 P2/P3）
//
// 职责：把主智能体 plan_tasks 提交的结构化 DAG 按依赖并行派发给子智能体执行。
//   · 执行体**复用 runSubAgent**（依赖注入，不 import llm-task-manager，避免循环依赖）
//     —— 上下文隔离 / 步数预算 / 截断 / 产物登记 / 摘要缓存全部继承；
//   · 工件协议：子任务返回值已被 runSubAgent 内部改写为「短结论+工件清单」，
//     这里再把 {{artifact:xx}} 引用解析成真实路径注入下游指令；
//   · 失败处理：同任务重试 MAX_RETRIES 次 → 耗尽标 failed 并级联 skip 下游 →
//     唤醒主智能体做 reassign_task 重分配；
//   · 状态全落 task_plan_item 表（可观测；P4 断点续跑的地基）。

import { db } from '../db.js';
import { createLogger } from './logger.js';
import { runWithArtifactCollector, type ArtifactBrief } from './artifacts.js';

const logger = createLogger('plan-runner');

/**
 * 同会话并行子任务上限（信号量闸）。
 * ★ 与主链路「同批 call_agent 并发」共享同一环境变量 `YANZHI_MAX_CONCURRENT_AGENTS`
 *   （1~8 钳位）—— 二者是**同一物理约束**（上游 LLM 配额），必须能一处统一调节，
 *   不能各自硬编码（本项目既有教训：同一语义两处判定 → 调了一个另一个不变）。
 * ★ 默认值有意高于主链路的 2：计划场景的诉求就是「无依赖任务异步并行」，且这些子任务
 *   各持独立上下文；但上限仍钳在 8 以内，避免并发把上游压出 429（2026-10-07 实测教训）。
 */
function resolvePlanConcurrency(): number {
  const v = Number(process.env.YANZHI_MAX_CONCURRENT_AGENTS);
  return Number.isFinite(v) && v >= 1 ? Math.min(8, Math.floor(v)) : 4;
}
/** 同一任务自动重试次数（耗尽后唤醒主智能体重分配） */
const MAX_RETRIES = 2;
/** 单计划任务项上限（防一次提交炸计划） */
const MAX_PLAN_ITEMS = 20;

export interface PlanItemRow {
  id: string;
  plan_id: string;
  conversation_id: string;
  task_id: string | null;
  item_key: string;
  seq: number;
  title: string;
  agent_id: string;
  platform_id: string | null;
  model_id: string | null;
  instruction: string;
  depends_on_json: string;
  max_steps: number | null;
  status: string;
  attempts: number;
  error_summary: string | null;
  artifact_ids_json: string;
  result_brief: string | null;
}

/** 依赖注入：执行体与投递通道由 llm-task-manager 提供（避免循环 import） */
interface PlanDeps {
  runSubAgent: (task: any, args: { agentId?: string; input?: unknown; platformId?: string; modelId?: string },
    parentToolCallId: string, depth: number, uiTools: Set<string>,
    specOverride?: any, runOpts?: { maxSteps?: number }) => Promise<string>;
  /** 计划状态变更通知（供前端"运行指示行"实时显示步骤进度）。可选：无则不发。 */
  onPlanChange?: (task: any, planId: string, plan: { title: string; steps: Array<{ id: string; title: string; status: string; note?: string }> }) => void;
}

let planDeps: PlanDeps | null = null;
export function registerPlanRunnerDeps(d: PlanDeps): void { planDeps = d; }

/** 同一计划同时只有一个活跃循环（跨调用去重）；value 为最终汇总文本 */
const activeRuns = new Map<string, Promise<string>>();

/** 全局递增执行序号：给每次子智能体执行生成唯一 parentToolCallId（隔离重试/重派的上下文） */
let execSeqCounter = 0;

// ══════════════════════════════════════════════════════════════════
// 行读写
// ══════════════════════════════════════════════════════════════════

function loadItems(planId: string): PlanItemRow[] {
  return db.prepare('SELECT * FROM task_plan_item WHERE plan_id = ? ORDER BY seq ASC').all(planId) as unknown as PlanItemRow[];
}

function depsOf(item: PlanItemRow): string[] {
  try { return JSON.parse(item.depends_on_json || '[]'); } catch { return []; }
}

function artifactsOf(item: PlanItemRow): string[] {
  try { return JSON.parse(item.artifact_ids_json || '[]'); } catch { return []; }
}

function updateItem(id: string, fields: Partial<Pick<PlanItemRow, 'status' | 'attempts' | 'error_summary' | 'artifact_ids_json' | 'result_brief'>>): void {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); vals.push(v); }
  sets.push('updated_at = ?');
  vals.push(Date.now(), id);
  db.prepare(`UPDATE task_plan_item SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

/**
 * 把计划项映射为前端「运行指示行」认的计划结构并发通知（2026-10-08）。
 * ★ 复用既有 plansByConv/task_plan 展示（输入区上方运行指示行），**不新增任何 UI 元素**；
 *   skipped 无对应 UI 态 → 归为 failed（带 note 说明是上游失败）。
 */
function notifyPlanChange(task: any, planId: string): void {
  if (!planDeps?.onPlanChange) return;
  try {
    const items = loadItems(planId);
    const plan = {
      title: items.length ? `${items.length} 个子任务（${items.filter((i) => i.status === 'done').length} 完成）` : '任务计划',
      steps: items.map((i) => ({
        id: i.item_key,
        title: i.title,
        status: i.status === 'skipped' ? 'failed' : (i.status as string),
        ...(i.status === 'skipped' ? { note: '上游失败未执行' } : (i.error_summary ? { note: i.error_summary.slice(0, 80) } : {})),
      })),
    };
    planDeps.onPlanChange(task, planId, plan);
  } catch { /* 通知失败不影响调度 */ }
}

// ══════════════════════════════════════════════════════════════════
// plan_tasks：校验 + 落库
// ══════════════════════════════════════════════════════════════════

export function createPlan(task: { id: string; conversationId: string; userId: string }, args: any): { ok: true; planId: string; message: string } | { ok: false; message: string } {
  const rawItems = Array.isArray(args?.items) ? args.items : [];
  if (rawItems.length === 0) return { ok: false, message: 'plan_tasks 需要 items 数组（至少 1 项）。每项须含 title / agentId / instruction；无依赖任务会并行执行，依赖用 dependsOn 引用任务 id。' };
  if (rawItems.length > MAX_PLAN_ITEMS) return { ok: false, message: `单份计划最多 ${MAX_PLAN_ITEMS} 项，请拆分提交。` };

  // 归一化 + 校验必填
  const items: Array<{ key: string; title: string; agentId: string; instruction: string; deps: string[]; maxSteps?: number; platformId?: string; modelId?: string }> = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i] || {};
    const title = String(it.title || '').trim();
    const agentId = String(it.agentId || it.agent_id || '').trim();
    const instruction = String(it.instruction || '').trim();
    if (!title) return { ok: false, message: `items[${i}] 缺 title。` };
    if (!agentId) return { ok: false, message: `items[${i}]（${title}）缺 agentId。可先调用 list_sub_agents 查询可用执行者。` };
    if (!instruction) return { ok: false, message: `items[${i}]（${title}）缺 instruction。` };
    let key = String(it.id || '').trim();
    if (!key) key = `t${i + 1}`;
    if (seenKeys.has(key)) return { ok: false, message: `任务 id「${key}」重复，请保证 id 唯一。` };
    seenKeys.add(key);
    const deps = Array.isArray(it.dependsOn) ? it.dependsOn.map((d: any) => String(d).trim()).filter(Boolean) : [];
    items.push({
      key, title, agentId, instruction, deps,
      maxSteps: Number.isFinite(Number(it.maxSteps)) && Number(it.maxSteps) > 0 ? Math.floor(Number(it.maxSteps)) : undefined,
      platformId: String(it.platformId || '').trim() || undefined,
      modelId: String(it.modelId || '').trim() || undefined,
    });
  }
  // 依赖引用必须存在
  for (const it of items) {
    for (const d of it.deps) {
      if (!seenKeys.has(d)) return { ok: false, message: `任务「${it.key}」依赖了不存在的 id「${d}」。有效 id：${[...seenKeys].join('、')}。` };
    }
  }
  // 环检测（Kahn）
  {
    const indeg = new Map<string, number>();
    const out = new Map<string, string[]>();
    for (const it of items) { indeg.set(it.key, it.deps.length); out.set(it.key, []); }
    for (const it of items) for (const d of it.deps) out.get(d)!.push(it.key);
    let queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([k]) => k);
    let visited = 0;
    while (queue.length) {
      const k = queue.shift()!;
      visited++;
      for (const nxt of out.get(k)!) {
        indeg.set(nxt, indeg.get(nxt)! - 1);
        if (indeg.get(nxt) === 0) queue.push(nxt);
      }
    }
    if (visited !== items.length) {
      const cyclic = items.filter((i) => (indeg.get(i.key) || 0) > 0).map((i) => i.key).join('、');
      return { ok: false, message: `任务依赖存在环（涉及：${cyclic}），DAG 不能有环。请修正 dependsOn。` };
    }
  }

  const planId = 'plan_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = Date.now();
  const insert = db.prepare(
    'INSERT INTO task_plan_item (id, plan_id, conversation_id, task_id, item_key, seq, title, agent_id, platform_id, model_id, instruction, depends_on_json, max_steps, status, attempts, error_summary, artifact_ids_json, result_brief, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?)',
  );
  const tx = db.transaction(() => {
    items.forEach((it, i) => {
      insert.run(
        'tpi_' + now.toString(36) + Math.random().toString(36).slice(2, 8),
        planId, task.conversationId, task.id, it.key, i + 1, it.title, it.agentId,
        it.platformId || null, it.modelId || null, it.instruction,
        JSON.stringify(it.deps), it.maxSteps ?? null, 'pending', '[]', now, now,
      );
    });
  });
  tx();

  const lines = items.map((it) => {
    const dep = it.deps.length ? `（依赖 ${it.deps.join('+')}）` : '（无依赖，并行）';
    const model = it.modelId ? `，模型 ${it.modelId}` : '';
    return `  ${it.key} 「${it.title}」 → ${it.agentId}${model} ${dep}`;
  }).join('\n');
  return {
    ok: true,
    planId,
    message: `✅ 任务计划已创建（${items.length} 项），调度器开始执行：\n${lines}\n\n规则：无依赖项并行（上限 ${resolvePlanConcurrency()} 个）；任务失败自动重试 ${MAX_RETRIES} 次，耗尽后回报你重新分配；全部完成也会回报。执行期间无需轮询，不要重复提交计划。`,
  };
}

// ══════════════════════════════════════════════════════════════════
// 调度循环
// ══════════════════════════════════════════════════════════════════

/**
 * 同步执行计划直到全部终态，返回汇总文本（供主智能体据此决策下一步）。
 *
 * ★★★ 为什么是**同步等待**（2026-10-08 修正，关键）：
 *   此前是 fire-and-forget（立即返回"已启动"回执 + 完成后投递回会话唤醒）。但主循环
 *   几乎总在计划完成**之前**就 finish —— plan_tasks 返回的只是一句启动回执，模型没有
 *   后续工具调用就直接结束本轮；之后计划完成时 injectUserMessage 找不到运行中任务，
 *   退化成"落库一条消息"→ **主智能体永远不会被唤醒** → 失败重分配形同虚设。
 *   改为同步等待后：主智能体在调用点阻塞（阻塞期间不调 LLM、不烧 token），拿到
 *   成功/失败汇总后继续规划或 reassign_task —— 与 call_agent 的同步语义一致。
 *   ★ 用户要的"无依赖任务异步并行"在**计划内部**照常生效（runPlanLoop 并发派发），
 *     同步的只是"主智能体等整份计划"，不是"子任务串行"。
 */
export async function runPlanToCompletion(task: any, planId: string): Promise<string> {
  if (!planDeps) return '任务调度器未初始化，无法执行计划。';
  const existing = activeRuns.get(planId);
  if (existing) return existing;
  const p = (async () => {
    await runPlanLoop(task, planId);
    return buildFinalSummaryText(task, planId);
  })();
  activeRuns.set(planId, p);
  try { return await p; } finally { activeRuns.delete(planId); }
}

async function runPlanLoop(task: any, planId: string): Promise<void> {
  const running = new Map<string, Promise<void>>();
  const maxConcurrency = resolvePlanConcurrency();
  try {
    for (;;) {
      const items = loadItems(planId);
      const byKey = new Map(items.map((i) => [i.item_key, i]));
      const ready = items.filter((i) => i.status === 'pending' && depsOf(i).every((d) => byKey.get(d)?.status === 'done'));

      for (const it of ready) {
        if (running.size >= maxConcurrency) break;
        if (running.has(it.id)) continue;
        running.set(it.id, runPlanItem(task, it).finally(() => running.delete(it.id)));
      }

      if (running.size === 0) {
        const stillPending = items.filter((i) => i.status === 'pending');
        if (stillPending.length === 0) break;
        // 有 pending 但无可运行：上游 failed/skipped → 级联 skip，防死锁
        for (const it of stillPending) {
          const depBad = depsOf(it).some((d) => ['failed', 'skipped'].includes(byKey.get(d)?.status || ''));
          if (depBad || ready.length === 0) {
            updateItem(it.id, { status: 'skipped', error_summary: '上游任务失败/被跳过，本任务未执行' });
            logger.warn(`[plan-runner] ${planId}/${it.item_key} 级联 skip`);
          }
        }
        notifyPlanChange(task, planId);
        continue;
      }
      await Promise.race(running.values());
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') { logger.warn(`[plan-runner] ${planId} 随任务中止`); return; }
    logger.warn(`[plan-runner] ${planId} 循环异常:`, e?.message || e);
  }
}

/** 执行单个计划项：派发子智能体 + 登记 + 失败重试判定 */
async function runPlanItem(task: any, item: PlanItemRow): Promise<void> {
  updateItem(item.id, { status: 'running', attempts: item.attempts + 1 });
  notifyPlanChange(task, item.plan_id);
  const attempt = item.attempts + 1;
  logger.warn(`[plan-runner] ${item.plan_id}/${item.item_key} 开始（第 ${attempt} 次）→ ${item.agent_id}`);

  const instruction = resolveArtifactRefs(task.conversationId, item, loadItems(item.plan_id)) + PRODUCE_HINT;
  try {
    // ★ uiTools 必须与主链路同源（见 llm-task-manager 顶层 UI_TOOLS 注释）：
    //   PlanRunner 不 import 它（会形成 plan-runner ↔ llm-task-manager 循环依赖），
    //   改由调用方（executeTool 所在模块）在 task 上挂 task.uiTools 透传；
    //   缺失时退回空集（最坏是 pageAgent 的 browser_navigate 走后端直调，不致命）。
    const uiTools: Set<string> = (task as any).uiTools || new Set();
    // ★ parentToolCallId 带**全局递增执行序号**（2026-10-08）：子智能体每步工具调用按此 id
    //   落 message，上下文也按此 id 读（loadSubAgentMessages）。若复用同一 id（同 item 的重试、
    //   或 reassign 后 attempts 归零回到 a1），第二次尝试会读到上次失败的完整过程（污染+膨胀）。
    //   用模块级递增序号保证每次执行绝对唯一（比 attempts/时间戳都可靠）；失败尝试的消息仍留库可审计。
    const execTag = `plan_${item.id}_e${++execSeqCounter}`;
    const { result, artifacts } = await runWithArtifactCollector(() =>
      planDeps!.runSubAgent(
        task,
        { agentId: item.agent_id, input: instruction, platformId: item.platform_id || undefined, modelId: item.model_id || undefined },
        execTag, 0, uiTools, undefined,
        { maxSteps: item.max_steps || undefined },
      ));
    if (isFailureResult(result)) {
      onItemFailure(task, item, attempt, result);
      return;
    }
    const brief = result.length > 800 ? result.slice(0, 800) + '…' : result;
    updateItem(item.id, {
      status: 'done',
      artifact_ids_json: JSON.stringify(artifacts.map((a: ArtifactBrief) => a.id)),
      result_brief: brief,
      error_summary: null,
    });
    notifyPlanChange(task, item.plan_id);
    logger.warn(`[plan-runner] ${item.plan_id}/${item.item_key} 完成（工件 ${artifacts.length} 个）`);
  } catch (e: any) {
    if (e?.name === 'AbortError') { updateItem(item.id, { status: 'failed', error_summary: '[已中止]' }); throw e; }
    onItemFailure(task, item, attempt, String(e?.message || e));
  }
}

function onItemFailure(task: any, item: PlanItemRow, attempt: number, reason: string): void {
  if (attempt >= MAX_RETRIES) {
    updateItem(item.id, { status: 'failed', error_summary: reason.slice(0, 500) });
    logger.warn(`[plan-runner] ${item.plan_id}/${item.item_key} 重试耗尽（${attempt}/${MAX_RETRIES}），标 failed`);
  } else {
    updateItem(item.id, { status: 'pending', error_summary: reason.slice(0, 500) });
    logger.warn(`[plan-runner] ${item.plan_id}/${item.item_key} 失败，将重试（${attempt}/${MAX_RETRIES}）：${reason.slice(0, 200)}`);
  }
  notifyPlanChange(task, item.plan_id);
}

/** 子智能体返回值是否表示失败（与 runSubAgent 的错误文案对齐） */
function isFailureResult(result: string): boolean {
  return /^(子智能体执行失败|子智能体不存在|子智能体未配置平台|指定的子智能体模型不可用|指定的模型已被设为不可见|agentId 为必填|input 为必填|子智能体不能再调用)/.test(result || '');
}

// ══════════════════════════════════════════════════════════════════
// 工件引用解析 + 汇总投递
// ══════════════════════════════════════════════════════════════════

/**
 * 解析 instruction 里的工件引用：
 *   {{artifact:<itemKey>}} → 该任务第一个产物路径；{{artifact:LAST}} → 最近完成任务的第一个产物。
 * 未命中时原样保留（子智能体可向用户说明）。
 */
function resolveArtifactRefs(conversationId: string, item: PlanItemRow, allItems: PlanItemRow[]): string {
  let text = item.instruction;
  const pathOfItem = (key: string): string | null => {
    const src = allItems.find((i) => i.item_key === key && i.status === 'done');
    if (!src) return null;
    const ids = artifactsOf(src);
    if (!ids.length) return null;
    const row = db.prepare('SELECT path FROM conversation_file WHERE id = ? AND conversation_id = ?').get(ids[0], conversationId) as any;
    return row?.path || null;
  };
  text = text.replace(/\{\{artifact:LAST\}\}/g, () => {
    const done = allItems.filter((i) => i.status === 'done' && artifactsOf(i).length).sort((a, b) => b.seq - a.seq);
    if (!done.length) return '{{artifact:LAST}}';
    return pathOfItem(done[0].item_key) || '{{artifact:LAST}}';
  });
  text = text.replace(/\{\{artifact:([^}]+)\}\}/g, (m, key: string) => pathOfItem(String(key).trim()) || m);
  return text;
}

const PRODUCE_HINT = '\n\n[调度器附加] 完成判定：把任务要求的结果**保存为文件**（file_write），最终回复只需简述做了什么与产出文件路径；不要在回复里粘贴大段文件内容。';

/** 构建计划最终汇总文本（重分配决策所需：成功清单+工件路径、失败项+原因、跳过项） */
function buildFinalSummaryText(task: any, planId: string): string {
  try {
    const items = loadItems(planId);
    const done = items.filter((i) => i.status === 'done');
    const failed = items.filter((i) => i.status === 'failed');
    const skipped = items.filter((i) => i.status === 'skipped');
    const parts: string[] = [`[任务计划 ${planId} 执行结束] 完成 ${done.length} / 失败 ${failed.length} / 跳过 ${skipped.length}（共 ${items.length} 项）`];
    for (const it of done) {
      const ids = artifactsOf(it);
      let files = '';
      if (ids.length) {
        const rows = ids.map((id) => db.prepare('SELECT name, path FROM conversation_file WHERE id = ?').get(id) as any).filter(Boolean);
        files = rows.length ? `，产出：${rows.map((r) => `${r.name} → ${r.path}`).join('；')}` : '';
      }
      parts.push(`✅ ${it.item_key}「${it.title}」${it.result_brief ? `：${it.result_brief.slice(0, 300)}` : ''}${files}`);
    }
    for (const it of failed) parts.push(`❌ ${it.item_key}「${it.title}」（重试 ${it.attempts} 次耗尽）：${it.error_summary || '未知原因'}。请用 reassign_task 重新分配（换执行者或改写指令），不要原样重试。`);
    for (const it of skipped) parts.push(`⏭️ ${it.item_key}「${it.title}」：因上游失败未执行`);
    return parts.join('\n');
  } catch (e: any) {
    logger.warn('[plan-runner] 汇总构建失败:', e?.message || e);
    return `[任务计划 ${planId} 执行结束]（汇总构建失败：${e?.message || e}）`;
  }
}

// ══════════════════════════════════════════════════════════════════
// 查询 / 重分配
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// 持久化 / 启动回收（P4）
// ══════════════════════════════════════════════════════════════════

/**
 * 启动回收：上次进程遗留的 'running' 计划项不会自己结束（PlanRunner 在内存里跑）。
 * 处理方式与 workflow_run / llm_task 一致 —— 标 failed + 补一条可见提示，
 * **不自动续跑**（子智能体副作用不可重放；用户看到提示可自行重发/重派）。
 * @returns 回收条数
 */
export function markOrphanPlanItemsInterrupted(): number {
  let n = 0;
  try {
    const rows = db.prepare("SELECT id, plan_id, conversation_id, item_key, title, attempts FROM task_plan_item WHERE status = 'running'").all() as any[];
    for (const r of rows) {
      try {
        updateItem(r.id, { status: 'failed', error_summary: '应用重启，任务中断' });
        const uid = (db.prepare('SELECT user_id FROM conversation WHERE id = ?').get(r.conversation_id) as any)?.user_id || 'guest';
        db.prepare(
          'INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          r.conversation_id, uid, 'assistant',
          `⚠️ 应用重启，任务计划中的「${r.title}」已中断（执行者进程退出）。已完成任务的产物仍在；需要继续可用 reassign_task 重派该任务，或把要求再发一次。`,
          Date.now(),
        );
      } catch { /* 单条失败不影响其余 */ }
      n++;
    }
  } catch { /* task_plan_item 表不存在则跳过 */ }
  return n;
}

export function getPlanStatusText(conversationId: string, planId?: string): string {
  const row = planId
    ? db.prepare('SELECT plan_id FROM task_plan_item WHERE plan_id = ? AND conversation_id = ?').get(planId, conversationId) as any
    : db.prepare('SELECT plan_id FROM task_plan_item WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(conversationId) as any;
  if (!row) return '本会话暂无任务计划（用 plan_tasks 提交）。';
  const items = loadItems(row.plan_id);
  const lines = items.map((i) => {
    const art = artifactsOf(i).length ? `，工件 ${artifactsOf(i).length} 个` : '';
    const err = i.error_summary ? `（${i.error_summary.slice(0, 120)}）` : '';
    return `  ${i.item_key}「${i.title}」→ ${i.agent_id}：${i.status}${art}${err}`;
  });
  return `计划 ${row.plan_id}（${items.length} 项）：\n${lines.join('\n')}`;
}

export function reassignPlanItem(
  task: { id: string; conversationId: string },
  args: { itemId?: string; agentId?: string; instruction?: string; maxSteps?: number; platformId?: string; modelId?: string },
): { ok: boolean; planId?: string; message: string } {
  const key = String(args.itemId || '').trim();
  if (!key) return { ok: false, message: 'reassign_task 需要 itemId（失败通知里会带）。' };
  const row = db.prepare(
    'SELECT * FROM task_plan_item WHERE conversation_id = ? AND (id = ? OR item_key = ?) ORDER BY created_at DESC LIMIT 1',
  ).get(task.conversationId, key, key) as any;
  if (!row) return { ok: false, message: `找不到任务「${key}」。用 get_plan_status 查看当前计划。` };
  if (!['failed', 'skipped', 'done', 'pending'].includes(row.status)) {
    return { ok: false, message: `任务「${key}」当前状态 ${row.status}，running 中不能重派。` };
  }
  const newAgent = String(args.agentId || '').trim();
  const newInstr = String(args.instruction || '').trim();
  if (!newAgent && !newInstr && !args.maxSteps && !args.platformId && !args.modelId) {
    return { ok: false, message: '重派必须至少改一样：agentId（换执行者）/ instruction（改指令）/ maxSteps / platformId / modelId。原样重试没有意义 —— 通知你失败时就说明自动重试已耗尽。' };
  }
  db.prepare(
    'UPDATE task_plan_item SET agent_id = COALESCE(?, agent_id), instruction = COALESCE(?, instruction), max_steps = COALESCE(?, max_steps), platform_id = COALESCE(?, platform_id), model_id = COALESCE(?, model_id), status = ?, attempts = 0, error_summary = NULL, updated_at = ? WHERE id = ?',
  ).run(newAgent || null, newInstr || null,
    Number.isFinite(Number(args.maxSteps)) && Number(args.maxSteps) > 0 ? Math.floor(Number(args.maxSteps)) : null,
    String(args.platformId || '').trim() || null, String(args.modelId || '').trim() || null,
    'pending', Date.now(), row.id);
  logger.warn(`[plan-runner] 重派 ${row.plan_id}/${row.item_key} → ${newAgent || row.agent_id}`);
  return { ok: true, planId: row.plan_id, message: `✅ 任务「${row.item_key}」已重置为待执行${newAgent ? `，执行者换为 ${newAgent}` : ''}${newInstr ? '，指令已改写' : ''}。调度器将重新执行，完成后回报。` };
}
