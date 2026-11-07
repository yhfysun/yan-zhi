import { db } from '../db.js';
import {
  abortTask,
  buildSystemPromptForBackend,
  createTask,
  emitConversationEvent,
  getTask,
  insertMessage,
  loadMessages,
  loadModel,
  loadPlatform,
  pauseTask,
  resolveEffectiveWorkspaceDir,
  resumeTask,
  subscribe,
} from '../llm-task-manager.js';
import {
  appendGoalEvent,
  attachGoalBatchTask,
  createGoal,
  finishGoalBatch,
  getActiveGoalForConversation,
  getGoal,
  listGoalBatches,
  recoverInterruptedGoals,
  startGoalBatch,
  transitionGoal,
  type GoalCreateInput,
  type GoalRun,
} from './goal-store.js';
import {
  verifyDeterministicCriteria,
  type GoalCriterionResult,
} from './goal-verifier.js';
import { listUnknownGoalOperations } from './goal-operation.js';
import { acquireGoalResource, releaseGoalResourceLocks } from './goal-resource-lock.js';

type BatchStatus = 'completed' | 'failed' | 'aborted';

export interface GoalBatchResult {
  taskId: string;
  status: BatchStatus;
  summary: string;
  error?: string;
}

export interface GoalVerifyResult {
  passed: boolean;
  summary: string;
  unmet: string[];
  needsApproval?: boolean;
  checks?: GoalCriterionResult[];
}

export interface GoalRunnerDeps {
  launchBatch: (goal: GoalRun, batch: { id: string; seq: number }) => Promise<GoalBatchResult>;
  verify: (goal: GoalRun, outcome: GoalBatchResult) => Promise<GoalVerifyResult>;
  notify: (goal: GoalRun, text: string) => void;
}

const RUNNING = new Set<string>();
const TERMINAL_EVENTS = new Set(['task:completed', 'task:aborted', 'task:error']);
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

function goalContext(goal: GoalRun, feedback?: string): string {
  const criteria = goal.criteria.length
    ? goal.criteria.map((c, i) => `${i + 1}. [${c.kind || 'text'}] ${c.title}`).join('\n')
    : '无自动验收标准，完成后必须请求人工验收。';
  const unknownOperations = listUnknownGoalOperations(goal.id);
  return [
    '---',
    '## 目标模式',
    `目标：${goal.objective}`,
    '验收标准：',
    criteria,
    goal.constraints.length ? `约束：\n${goal.constraints.map(v => `- ${v}`).join('\n')}` : '',
    goal.approvalRequired.length
      ? `必须先征求用户同意：${goal.approvalRequired.join('、')}`
      : '',
    '规则：',
    '- 目标跨批次持续存在，按未完成步骤继续，不重做已完成工作。',
    '- 不要仅凭“我觉得完成”结束目标；必须产出可核验证据。',
    '- 无自动验收标准时，完成前必须明确请求用户验收。',
    feedback ? `\n上一次验收未通过，必须优先修正：\n${feedback}` : '',
    unknownOperations.length
      ? `\n以下外部操作上次执行结果不明，禁止盲目重放；先回到原处核实，确认未生效后才能重试：\n${
          unknownOperations.slice(-20).map(op => `- ${op.toolName} (${op.argsHash.slice(0, 12)})`).join('\n')
        }`
      : '',
  ].filter(Boolean).join('\n');
}

function lastAssistantText(conversationId: string): string {
  const messages = loadMessages(conversationId);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && String(messages[i].content || '').trim()) {
      return String(messages[i].content).trim();
    }
  }
  return '';
}

async function waitForTaskResult(taskId: string): Promise<GoalBatchResult> {
  const current = getTask(taskId);
  if (!current) return { taskId, status: 'failed', summary: '', error: '任务不存在' };

  const settled = await new Promise<string>((resolve) => {
    let done = false;
    let unsub: (() => void) | null = null;
    const finish = (status: string) => {
      if (done) return;
      done = true;
      unsub?.();
      resolve(status);
    };
    unsub = subscribe(taskId, 0, (event) => {
      if (TERMINAL_EVENTS.has(event.type)) finish(event.type);
    });
    if (done) unsub();
  });

  const task = getTask(taskId);
  const status: BatchStatus = settled === 'task:completed'
    ? 'completed'
    : settled === 'task:aborted' ? 'aborted' : 'failed';
  return {
    taskId,
    status,
    summary: lastAssistantText(task?.conversationId || ''),
    ...(status === 'failed' ? { error: task?.error || '任务执行失败' } : {}),
  };
}

async function defaultLaunchBatch(goal: GoalRun, batch: { id: string; seq: number }): Promise<GoalBatchResult> {
  if (!goal.platformId || !goal.modelId) {
    throw new Error('目标未绑定可用模型');
  }
  const basePrompt = buildSystemPromptForBackend(goal.agentId, goal.userId, undefined, {
    conversationId: goal.conversationId,
  });
  const batches = listGoalBatches(goal.id);
  const previous = batches.filter(b => b.id !== batch.id).at(-1);
  const feedback = goal.lastError || (previous ? JSON.stringify(previous.checkpoint || '') : '');
  const systemPrompt = [basePrompt, goalContext(goal, feedback)].filter(Boolean).join('\n\n');
  const userContent = batch.seq === 1
    ? goal.objective
    : `继续执行目标：${goal.objective}\n\n请读取当前计划、进度和验收反馈，从断点继续，不要重做已完成部分。`;
  const taskId = createTask({
    conversationId: goal.conversationId,
    userId: goal.userId,
    platformId: goal.platformId,
    modelId: goal.modelId,
    userContent,
    agentId: goal.agentId,
    systemPrompt,
    modeFlags: { goal: true, plan: true },
    goalId: goal.id,
    goalBatchId: batch.id,
  });
  return waitForTaskResult(taskId);
}

function parseJsonObject(text: string): Record<string, any> | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced);
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function defaultVerify(goal: GoalRun, outcome: GoalBatchResult): Promise<GoalVerifyResult> {
  if (!goal.criteria.length) {
    return {
      passed: false,
      needsApproval: true,
      summary: '目标没有设置自动验收标准，需要人工确认',
      unmet: ['人工验收'],
    };
  }
  if (outcome.status !== 'completed') {
    return { passed: false, summary: outcome.error || '批次未完成', unmet: [outcome.error || '批次未完成'] };
  }
  if (!goal.platformId || !goal.modelId) {
    return {
      passed: false,
      needsApproval: true,
      summary: '目标未绑定可用模型，无法自动验收',
      unmet: ['人工验收'],
    };
  }
  const workspaceDir = resolveEffectiveWorkspaceDir(goal.conversationId) || '';
  const deterministic = await verifyDeterministicCriteria(goal.criteria, workspaceDir);
  const failed = deterministic.results.filter(c => !c.passed);
  if (failed.length) {
    return {
      passed: false,
      summary: failed[0].summary,
      unmet: failed.map(c => `${c.title}：${c.summary}`),
      checks: deterministic.results,
    };
  }
  if (deterministic.needsHuman) {
    return {
      passed: false,
      needsApproval: true,
      summary: '目标包含人工验收项，需要用户确认',
      unmet: deterministic.unresolved.map(c => c.title),
      checks: deterministic.results,
    };
  }
  if (!deterministic.unresolved.length) {
    return {
      passed: true,
      summary: `全部 ${deterministic.results.length} 项自动验收通过`,
      unmet: [],
      checks: deterministic.results,
    };
  }
  const platform = loadPlatform(goal.platformId, goal.userId);
  const model = platform ? loadModel(goal.modelId, goal.userId, platform.id) : null;
  if (!platform || !model) {
    return {
      passed: false,
      needsApproval: true,
      summary: '验收模型不可用，需要人工确认',
      unmet: ['人工验收'],
    };
  }
  const transcript = loadMessages(goal.conversationId)
    .slice(-40)
    .map(m => `【${m.role}】${String(m.content || '').slice(0, 4_000)}`)
    .join('\n\n')
    .slice(-40_000);
  const criteria = deterministic.unresolved.map((c, i) => `${i + 1}. [${c.kind || 'text'}] ${c.title}`).join('\n');
  const evidence = JSON.stringify(deterministic.results, null, 2).slice(0, 20_000);
  try {
    const { LlmClient } = await import('@yan-zhi/core');
    const client = new LlmClient(platform, model);
    const resp = await client.chat([
      {
        id: 'sys', conversationId: '', role: 'system', createdAt: 0,
        content: '你是目标验收器。只根据对话、工具结果和交付证据判断，不根据模型自称完成判断。'
          + '输出 JSON：{"passed":true|false,"summary":"一句话","unmet":["未满足项"]}。'
          + '证据不足、无法核实或存在失败项时必须 passed=false。',
      },
      {
        id: 'usr', conversationId: '', role: 'user', createdAt: 0,
        content: `目标：${goal.objective}\n\n仍未自动判定的验收标准：\n${criteria}\n\n已通过的确定性证据：\n${evidence || '无'}\n\n约束：\n${goal.constraints.join('\n') || '无'}\n\n任务记录：\n${transcript}`,
      },
    ], { temperature: 0.1, maxTokens: 1200, responseFormat: { type: 'json_object' } });
    const parsed = parseJsonObject(resp.delta?.content || '');
    const passed = parsed?.passed === true;
    const unmet = Array.isArray(parsed?.unmet) ? parsed.unmet.map(String).slice(0, 20) : [];
    const summary = typeof parsed?.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 1_000)
      : passed ? '验收通过' : '验收未通过';
    return { passed, summary, unmet, checks: deterministic.results };
  } catch (error: any) {
    return {
      passed: false,
      summary: `自动验收暂时失败：${error?.message || error}`,
      unmet: ['验收模型调用失败'],
    };
  }
}

function notifyConversation(goal: GoalRun, text: string): void {
  try {
    const msgId = insertMessage(goal.conversationId, goal.userId, 'assistant', text);
    emitConversationEvent(goal.conversationId, {
      type: 'message:added',
      message: { id: msgId, role: 'assistant', content: text },
    });
    emitConversationEvent(goal.conversationId, {
      type: 'goal:updated',
      goalId: goal.id,
      status: goal.status,
    });
  } catch {
    // Goal state is already persisted; notification failure must not break scheduling.
  }
}

function retryDelay(goal: GoalRun): number {
  return RETRY_DELAYS_MS[Math.min(goal.currentBatch, RETRY_DELAYS_MS.length - 1)];
}

function scheduleRetry(goal: GoalRun, summary: string): GoalRun {
  const next = Date.now() + retryDelay(goal);
  transitionGoal(goal.id, 'retry_wait', {
    lastError: summary,
    result: { summary, retryAt: next },
    nextRunAt: next,
    leaseOwner: null,
    leaseUntil: null,
    heartbeatAt: Date.now(),
  });
  appendGoalEvent(goal.id, 'retry.scheduled', { at: next, reason: summary });
  return getGoal(goal.id)!;
}

function createApproval(goal: GoalRun, summary: string, unmet: string[]): void {
  const approvalId = `goalapproval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO goal_approval (id, goal_id, kind, title, detail_json, status, requested_at)
    VALUES (?, ?, 'manual_acceptance', '目标完成待确认', ?, 'open', ?)
  `).run(approvalId, goal.id, JSON.stringify({ summary, unmet }), Date.now());
  appendGoalEvent(goal.id, 'approval.requested', { approvalId, summary, unmet });
}

export async function runGoalOnce(
  goalId: string,
  deps: GoalRunnerDeps = {
    launchBatch: defaultLaunchBatch,
    verify: defaultVerify,
    notify: notifyConversation,
  },
): Promise<GoalRun> {
  let goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  if (RUNNING.has(goalId)) return goal;
  if (['completed', 'failed', 'cancelled', 'blocked', 'paused', 'needing_approval'].includes(goal.status)) {
    return goal;
  }
  RUNNING.add(goalId);
  let resourceHeld = false;
  try {
    if (goal.currentBatch >= goal.maxBatches) {
      transitionGoal(goal.id, 'blocked', {
        lastError: `已达到最大批次数 ${goal.maxBatches}`,
        result: { summary: '达到最大批次数，目标仍未完成' },
      });
      appendGoalEvent(goal.id, 'goal.blocked', { reason: 'max_batches' });
      return getGoal(goal.id)!;
    }

    const workspaceDir = resolveEffectiveWorkspaceDir(goal.conversationId);
    if (workspaceDir) {
      const resource = acquireGoalResource(goal.id, 'workspace', workspaceDir, workspaceDir);
      if (!resource.acquired) {
        const next = Date.now() + 30_000;
        transitionGoal(goal.id, 'retry_wait', {
          nextRunAt: next,
          lastError: `工作目录正被另一个目标使用${resource.holder?.goalId ? `（${resource.holder.goalId}）` : ''}`,
          leaseOwner: null,
          leaseUntil: null,
        });
        appendGoalEvent(goal.id, 'resource.wait', {
          kind: 'workspace',
          holderGoalId: resource.holder?.goalId || null,
          nextAt: next,
        });
        return getGoal(goal.id)!;
      }
      resourceHeld = true;
      appendGoalEvent(goal.id, 'resource.acquired', {
        kind: 'workspace',
        resourceKey: resource.resourceKey,
        label: workspaceDir,
      });
    }

    goal = transitionGoal(goal.id, 'running', {
      leaseOwner: 'goal-runner',
      leaseUntil: Date.now() + 2 * 60_000,
      heartbeatAt: Date.now(),
      nextRunAt: null,
    });
    appendGoalEvent(goal.id, 'goal.started', { batch: goal.currentBatch + 1 });
    const batch = startGoalBatch(goal.id, {
      prompt: { objective: goal.objective, criteria: goal.criteria },
    });
    let outcome: GoalBatchResult;
    try {
      outcome = await deps.launchBatch(goal, { id: batch.id, seq: batch.seq });
    } catch (error: any) {
      finishGoalBatch(batch.id, 'failed', { error: error?.message || String(error) });
      throw error;
    }
    attachGoalBatchTask(batch.id, outcome.taskId);
    finishGoalBatch(batch.id, outcome.status, outcome);

    if (outcome.status === 'aborted') {
      transitionGoal(goal.id, 'cancelled', {
        result: { summary: outcome.summary || '用户已停止目标' },
        leaseOwner: null,
        leaseUntil: null,
      });
      appendGoalEvent(goal.id, 'goal.cancelled', { reason: 'task_aborted' });
      return getGoal(goal.id)!;
    }
    if (outcome.status === 'failed') {
      goal = scheduleRetry(goal, outcome.error || outcome.summary || '批次执行失败');
      deps.notify(goal, `目标批次执行失败，已安排自动重试：${goal.lastError}`);
      return goal;
    }

    goal = transitionGoal(goal.id, 'verifying', {
      heartbeatAt: Date.now(),
    });
    appendGoalEvent(goal.id, 'verification.started', { batchId: batch.id });
    const verification = await deps.verify(goal, outcome);
    if (verification.passed) {
      transitionGoal(goal.id, 'completed', {
        result: verification,
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
      });
      appendGoalEvent(goal.id, 'verification.passed', verification);
      goal = getGoal(goal.id)!;
      deps.notify(goal, `目标已完成并通过验收：${verification.summary}`);
      return goal;
    }

    if (verification.needsApproval) {
      createApproval(goal, verification.summary, verification.unmet);
      transitionGoal(goal.id, 'needing_approval', {
        result: verification,
        lastError: verification.summary,
        leaseOwner: null,
        leaseUntil: null,
      });
      goal = getGoal(goal.id)!;
      deps.notify(goal, `目标等待人工验收：${verification.summary}`);
      return goal;
    }

    const stallCount = goal.stallCount + 1;
    if (stallCount >= goal.maxStallBatches) {
      transitionGoal(goal.id, 'blocked', {
        stallCount,
        result: verification,
        lastError: verification.summary,
        leaseOwner: null,
        leaseUntil: null,
      });
      appendGoalEvent(goal.id, 'goal.blocked', { reason: 'no_progress', verification });
      goal = getGoal(goal.id)!;
      deps.notify(goal, `目标连续 ${stallCount} 批未通过验收，已停止自动重试：${verification.summary}`);
      return goal;
    }
    const next = Date.now() + retryDelay(goal);
    transitionGoal(goal.id, 'retry_wait', {
      stallCount,
      result: verification,
      lastError: verification.unmet.join('；') || verification.summary,
      nextRunAt: next,
      leaseOwner: null,
      leaseUntil: null,
    });
    appendGoalEvent(goal.id, 'verification.failed', { ...verification, nextAt: next });
    appendGoalEvent(goal.id, 'retry.scheduled', { at: next, reason: 'verification_failed' });
    goal = getGoal(goal.id)!;
    deps.notify(goal, `目标尚未通过验收，将自动继续：${goal.lastError}`);
    return goal;
  } catch (error: any) {
    const latest = getGoal(goalId);
    if (latest && !['completed', 'cancelled', 'blocked'].includes(latest.status)) {
      transitionGoal(goalId, 'retry_wait', {
        lastError: error?.message || String(error),
        nextRunAt: Date.now() + 60_000,
        leaseOwner: null,
        leaseUntil: null,
      });
      appendGoalEvent(goalId, 'retry.scheduled', { reason: 'runner_error' });
    }
    throw error;
  } finally {
    if (resourceHeld) releaseGoalResourceLocks(goalId);
    RUNNING.delete(goalId);
  }
}

export function createAndStartGoal(input: GoalCreateInput): GoalRun {
  const goal = createGoal(input);
  queueMicrotask(() => {
    void runGoalOnce(goal.id).catch(() => {
      // runGoalOnce persists retry state. Scheduler will pick it up later.
    });
  });
  return goal;
}

export function pauseGoal(goalId: string): GoalRun {
  const goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  if (['completed', 'failed', 'cancelled', 'blocked'].includes(goal.status)) {
    throw new Error('目标已结束，不能暂停');
  }
  const task = db.prepare(
    "SELECT id FROM llm_task WHERE goal_id = ? AND status IN ('running','waiting_tool') ORDER BY created_at DESC LIMIT 1",
  ).get(goalId) as { id?: string } | undefined;
  if (task?.id) {
    pauseTask(task.id);
    try {
      db.prepare("UPDATE llm_task SET status = 'paused', updated_at = ? WHERE id = ?").run(Date.now(), task.id);
    } catch { /* 状态投影失败不阻塞暂停 */ }
  }
  transitionGoal(goalId, 'paused', { nextRunAt: null, leaseOwner: null, leaseUntil: null });
  appendGoalEvent(goalId, 'goal.paused', {});
  return getGoal(goalId)!;
}

export function resumeGoal(goalId: string): GoalRun {
  const goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  if (goal.status !== 'paused') throw new Error('目标未处于暂停态');
  const task = db.prepare(
    "SELECT id FROM llm_task WHERE goal_id = ? AND status IN ('running','waiting_tool') ORDER BY created_at DESC LIMIT 1",
  ).get(goalId) as { id?: string } | undefined;
  if (task?.id && resumeTask(task.id)) {
    try {
      db.prepare("UPDATE llm_task SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), task.id);
    } catch { /* 状态投影失败不阻塞恢复 */ }
    transitionGoal(goalId, 'running', { lastError: null, heartbeatAt: Date.now() });
    appendGoalEvent(goalId, 'goal.resumed', { taskId: task.id });
    return getGoal(goalId)!;
  }
  transitionGoal(goalId, 'queued', { nextRunAt: Date.now(), lastError: null });
  appendGoalEvent(goalId, 'goal.resumed', {});
  queueMicrotask(() => { void runGoalOnce(goalId).catch(() => {}); });
  return getGoal(goalId)!;
}

export function cancelGoal(goalId: string, reason = '用户取消了目标'): GoalRun {
  const goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  if (['completed', 'failed', 'cancelled', 'blocked'].includes(goal.status)) {
    throw new Error('目标已结束，不能重复取消');
  }
  const task = db.prepare(
    "SELECT id FROM llm_task WHERE goal_id = ? AND status IN ('running','waiting_tool') ORDER BY created_at DESC LIMIT 1",
  ).get(goalId) as { id?: string } | undefined;
  if (task?.id) abortTask(task.id);
  transitionGoal(goalId, 'cancelled', {
    result: { summary: reason },
    nextRunAt: null,
    leaseOwner: null,
    leaseUntil: null,
  });
  appendGoalEvent(goalId, 'goal.cancelled', { reason });
  return getGoal(goalId)!;
}

export function approveGoal(goalId: string, note: string): GoalRun {
  const goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  if (goal.status !== 'needing_approval') throw new Error('目标不处于待验收状态');
  const now = Date.now();
  db.prepare(
    "UPDATE goal_approval SET status = 'approved', answer_json = ?, answered_at = ? WHERE goal_id = ? AND status = 'open'",
  ).run(JSON.stringify({ note, approvedAt: now }), now, goalId);
  transitionGoal(goalId, 'completed', {
    result: { passed: true, summary: note || '用户已验收', unmet: [] },
    lastError: null,
    leaseOwner: null,
    leaseUntil: null,
  });
  appendGoalEvent(goalId, 'approval.answered', { approved: true, note });
  appendGoalEvent(goalId, 'verification.passed', { by: 'user', note });
  notifyConversation(getGoal(goalId)!, `目标已由用户验收完成${note ? `：${note}` : ''}`);
  return getGoal(goalId)!;
}

export async function tickDueGoals(now = Date.now()): Promise<number> {
  const rows = db.prepare(
    `SELECT id FROM goal_run
     WHERE status IN ('queued','retry_wait')
       AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY COALESCE(next_run_at, created_at) ASC
     LIMIT 8`,
  ).all(now) as Array<{ id: string }>;
  let ran = 0;
  for (const row of rows) {
    if (RUNNING.has(row.id)) continue;
    try {
      await runGoalOnce(row.id);
      ran++;
    } catch {
      // Retry state is persisted inside runGoalOnce or by the next tick.
    }
  }
  return ran;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startGoalScheduler(): void {
  if (schedulerTimer) return;
  const recovered = recoverInterruptedGoals();
  if (recovered > 0) {
    // Recovery only requeues; the first tick below starts due goals.
  }
  void tickDueGoals();
  schedulerTimer = setInterval(() => { void tickDueGoals(); }, 15_000);
  schedulerTimer.unref?.();
}

export function stopGoalScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

export { defaultVerify as verifyGoalBatch, defaultLaunchBatch as launchGoalBatch };
