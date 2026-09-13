// 对话定时任务：调度计算 + 任务执行器 + 60s 轮询调度器
// 定时任务通过后端 createTask 走完整 ReAct 循环（含工具执行），
// 排除 UI 交互工具（ask_user 等），页面没开也能独立运行。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { createTask, buildSystemPromptForBackend, buildToolsForBackend, loadAgentModelParams } from '../llm-task-manager.js';
import { buildAnthropicBody } from './anthropic-body.js';

const MINUTE_MS = 60_000;

// 解析 cron 单字段（支持 * 、星号步进 /n、a、a-b、a-b/n、逗号列表），返回允许值列表；非法返回 null
function parseCronField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const m = part.trim().match(/^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/);
    if (!m) return null;
    const [, range, stepRaw] = m;
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    if (!step || step < 1) return null;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      if (range.includes('-')) {
        const [a, b] = range.split('-').map((x) => parseInt(x, 10));
        lo = a;
        hi = b;
      } else {
        lo = hi = parseInt(range, 10);
      }
      if (lo < min || hi > max || lo > hi) return null;
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values.size ? [...values].sort((a, b) => a - b) : null;
}

/**
 * 计算 5 字段（分 时 日 月 周，分钟粒度）cron 表达式在 from 之后的下一次触发时间。
 * 轻量实现：日/周为 AND 语义（本项目的"每天 HH:MM"场景不受影响）；非法返回 null。
 */
export function nextCronTime(expr: string, from: number): number | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const days = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  let dows = parseCronField(fields[4], 0, 7);
  if (dows) dows = [...new Set(dows.map((v) => v % 7))]; // cron 的 7 也表示周日
  if (!minutes || !hours || !days || !months || !dows) return null;

  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1); // 从下一分钟边界开始
  // 最多向后扫描一年，覆盖"2月30日"这类永不匹配的表达式
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      minutes.includes(cursor.getMinutes()) &&
      hours.includes(cursor.getHours()) &&
      days.includes(cursor.getDate()) &&
      months.includes(cursor.getMonth() + 1) &&
      dows.includes(cursor.getDay())
    ) {
      return cursor.getTime();
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

// ===== 新调度模型（对齐 WorkBuddy：周期 / 间隔 + 有效期） =====
interface ScheduleConfig {
  mode: 'cycle' | 'interval';
  type?: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  datetime?: number;
  time?: string; // "HH:mm"
  dayOfWeek?: number; // 0-6，0=周日（JS getDay 语义）
  anchor?: number; // 双周基准时间戳（创建时间）
  dayOfMonth?: number;
  month?: number; // 1-12
  days?: number;
  hours?: number;
  minutes?: number;
  daysOfWeek?: number[]; // 0-6 白名单
}

function parseTime(time?: string): { h: number; m: number } | null {
  if (!time) return null;
  const mm = time.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!mm) return null;
  const h = parseInt(mm[1], 10);
  const m = parseInt(mm[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** 解析 schedule_json；非法返回 null */
export function parseSchedule(raw?: string | null): ScheduleConfig | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s === 'object' ? (s as ScheduleConfig) : null;
  } catch {
    return null;
  }
}

/** 计算 schedule 在 from 之后的下一次触发时间；无效返回 null */
export function computeNextFromSchedule(schedule: ScheduleConfig, from: number): number | null {
  if (!schedule) return null;
  if (schedule.mode === 'interval') {
    const totalMin = (schedule.days || 0) * 24 * 60 + (schedule.hours || 0) * 60 + (schedule.minutes || 0);
    if (totalMin <= 0) return null;
    const stepMs = totalMin * MINUTE_MS;
    let t = from + stepMs;
    const dows = schedule.daysOfWeek && schedule.daysOfWeek.length ? schedule.daysOfWeek : null;
    if (!dows) return t;
    for (let i = 0; i < 366 * 24 * 60; i++) {
      if (dows.includes(new Date(t).getDay())) return t;
      t += stepMs;
    }
    return null;
  }
  if (schedule.type === 'once') {
    return schedule.datetime && schedule.datetime > from ? schedule.datetime : null;
  }
  const tp = parseTime(schedule.time);
  if (!tp) return null;
  const base = new Date(from);
  switch (schedule.type) {
    case 'daily': {
      const d = new Date(base);
      d.setHours(tp.h, tp.m, 0, 0);
      if (d.getTime() <= from) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case 'weekly': {
      const dow = (((schedule.dayOfWeek ?? 0) % 7) + 7) % 7;
      const d = new Date(base);
      d.setHours(tp.h, tp.m, 0, 0);
      let diff = (dow - d.getDay() + 7) % 7;
      if (diff === 0 && d.getTime() <= from) diff = 7;
      d.setDate(d.getDate() + diff);
      return d.getTime();
    }
    case 'biweekly': {
      const dow = (((schedule.dayOfWeek ?? 0) % 7) + 7) % 7;
      const anchor = schedule.anchor || base.getTime();
      const a = new Date(anchor);
      a.setHours(tp.h, tp.m, 0, 0);
      const diff = (dow - a.getDay() + 7) % 7;
      a.setDate(a.getDate() + diff);
      let t = a.getTime();
      while (t <= from) t += 14 * 24 * 60 * MINUTE_MS;
      return t;
    }
    case 'monthly': {
      const dom = schedule.dayOfMonth ?? 1;
      let d = new Date(base.getFullYear(), base.getMonth(), dom, tp.h, tp.m, 0, 0);
      if (d.getTime() <= from) d = new Date(base.getFullYear(), base.getMonth() + 1, dom, tp.h, tp.m, 0, 0);
      return d.getTime();
    }
    case 'yearly': {
      const month = schedule.month ?? 1;
      const dom = schedule.dayOfMonth ?? 1;
      let d = new Date(base.getFullYear(), month - 1, dom, tp.h, tp.m, 0, 0);
      if (d.getTime() <= from) d = new Date(base.getFullYear() + 1, month - 1, dom, tp.h, tp.m, 0, 0);
      return d.getTime();
    }
  }
  return null;
}

/** 计算任务下一次运行时间：interval_minutes 优先，其次 cron_expr；都没有返回 null */
export function computeNextRun(
  task: { interval_minutes?: number | null; cron_expr?: string | null; schedule_json?: string | null; expire_at?: number | null },
  from = Date.now(),
): number | null {
  let next: number | null = null;
  const schedule = parseSchedule(task.schedule_json);
  if (schedule) {
    next = computeNextFromSchedule(schedule, from);
  } else if (task.interval_minutes && task.interval_minutes > 0) {
    next = from + task.interval_minutes * MINUTE_MS;
  } else if (task.cron_expr && task.cron_expr.trim()) {
    next = nextCronTime(task.cron_expr, from);
  }
  if (next !== null && task.expire_at && next > task.expire_at) return null;
  return next;
}

/** 选默认模型：优先用户自建的默认模型，其次内置默认模型，最后任意启用的 LLM */
function findDefaultModel(userId: string): any | null {
  return (
    db
      .prepare(

        `SELECT m.id, m.platform_id, m.model_id, p.api_url, p.api_key_enc, p.protocol, p.headers_json, p.pause_min_ms, p.pause_max_ms
         FROM model m JOIN platform p ON p.id = m.platform_id
         WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm'
         ORDER BY CASE
           WHEN m.is_default = 1 AND p.is_builtin = 0 THEN 0
           WHEN m.is_default = 1 THEN 1
           ELSE 2
         END, m.created_at ASC
         LIMIT 1`,
      )
      .get(userId) || null
  );
}

/** 取任务绑定的模型：优先 task.platform_id + task.model_id 指定的模型，找不到则回退默认模型 */
function findTaskModel(userId: string, platformId?: string | null, modelId?: string | null): any | null {
  if (platformId && modelId) {
    const m = db
      .prepare(
        `SELECT m.id, m.platform_id, m.model_id, p.api_url, p.api_key_enc, p.protocol, p.headers_json, p.pause_min_ms, p.pause_max_ms
         FROM model m JOIN platform p ON p.id = m.platform_id
         WHERE m.id = ? AND m.platform_id = ? AND m.user_id = ? AND m.enabled = 1 AND m.type = 'llm'`,
      )
      .get(modelId, platformId, userId);
    if (m) return m;
  }
  return findDefaultModel(userId);
}

/** 用平台存储的 apiUrl/apiKey 直接调用模型（非流式） */
async function callModel(
  model: any,
  messages: Array<{ role: string; content: string }>,
): Promise<{ content: string; tokens: number }> {
  const baseUrl = String(model.api_url || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('平台未配置 API URL');

  let apiKey = model.api_key_enc || '';
  try {
    const { pickToken, pauseIfNeeded } = await import('./token-pool.js');
    await pauseIfNeeded(model);
    const token = pickToken(model.platform_id);
    if (token) apiKey = token.apiKey;
  } catch {}

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  let body: any;
  if (model.protocol === 'anthropic') {
    url = `${baseUrl}/v1/messages`;
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = buildAnthropicBody(messages, model.model_id, 2048);
  } else {
    url = `${baseUrl}/v1/chat/completions`;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    body = { model: model.model_id, messages, stream: false };
  }
  try {
    const extra = model.headers_json ? JSON.parse(model.headers_json) : {};
    Object.assign(headers, extra || {});
  } catch { /* headers_json 非法时忽略 */ }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (model.protocol === 'anthropic') {
    const content = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text || '')
      .join('\n');
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return { content, tokens };
  }
  const content = data.choices?.[0]?.message?.content || '';
  const tokens = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  return { content, tokens };
}

export interface ScheduledTaskRunResult {
  ok: boolean;
  error?: string;
  conversationId?: string;
}

const INSERT_MESSAGE =
  'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)';

/** 执行一次定时任务：复用/创建会话 → 创建后端任务走 ReAct 循环 → 更新调度状态 */
export async function runScheduledTask(task: any): Promise<ScheduledTaskRunResult> {
  const now = Date.now();
  const userId = task.user_id;

  // 1. 会话：优先复用绑定的会话；绑定会话已被删则新建
  let convId: string | null = task.conversation_id || null;
  if (convId) {
    const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(convId, userId);
    if (!conv) convId = null;
  }
  if (!convId) {
    convId = uuid();
    db.prepare(
      "INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, scheduled_task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?, ?)",
    ).run(
      convId, userId, `定时任务：${task.name}`,
      task.agent_id || null, task.platform_id || null, task.model_id || null, task.space_id || null,
      task.id, now, now,
    );
    db.prepare('UPDATE scheduled_task SET conversation_id = ?, updated_at = ? WHERE id = ?').run(convId, now, task.id);
  }

  // 2. 确定模型：优先 task 指定，其次 agent 默认，最后任意启用 LLM
  let platformId = task.platform_id || null;
  let modelId = task.model_id || null;
  if ((!platformId || !modelId) && task.agent_id) {
    const agent = db.prepare('SELECT platform_id, model_id FROM agent WHERE id = ? AND user_id = ?').get(task.agent_id, userId) as any;
    if (agent) {
      platformId = platformId || agent.platform_id;
      modelId = modelId || agent.model_id;
    }
  }
  if (!platformId || !modelId) {
    const fallback = findDefaultModel(userId);
    if (fallback) {
      platformId = fallback.platform_id;
      modelId = fallback.id;
    }
  }
  if (!platformId || !modelId) {
    const errorMsg = '未找到可用的模型，请先在「设置 → 模型平台」配置并启用模型';
    db.prepare(INSERT_MESSAGE).run(uuid(), convId, userId, 'assistant', `[定时任务执行失败] ${errorMsg}`, 0, Date.now());
    return finishTask(task, convId, now, false, errorMsg);
  }

  // 3. 后端构建系统提示词 + 工具 schema（排除 UI 工具，页面没开也能跑）
  const systemPrompt = buildSystemPromptForBackend(task.agent_id || null, userId);
  const tools = buildToolsForBackend(task.agent_id || null, userId);
  const modelParams = loadAgentModelParams(task.agent_id || null, userId);

  // 4. 创建后端任务 —— ReAct 循环独立运行，消息持久化到 DB
  const userContent = `[定时任务] ${task.name}\n${task.prompt || ''}`.trim();
  try {
    createTask({
      conversationId: convId,
      userId,
      platformId,
      modelId,
      userContent,
      systemPrompt,
      tools,
      options: {
        temperature: modelParams.temperature,
        maxTokens: modelParams.maxTokens,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
      },
      maxSteps: modelParams.maxReActSteps || 100,
    });
    return finishTask(task, convId, now, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scheduled-task] 任务「${task.name}」创建失败: ${msg}`);
    db.prepare(INSERT_MESSAGE).run(uuid(), convId, userId, 'assistant', `[定时任务执行失败] ${msg}`, 0, Date.now());
    return finishTask(task, convId, now, false, msg);
  }
}

/** 更新任务调度状态（last_run_at, next_run_at, conversation updated_at） */
function finishTask(task: any, convId: string, now: number, ok: boolean, error?: string): ScheduledTaskRunResult {
  db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(Date.now(), convId);
  const schedule = parseSchedule(task.schedule_json);
  const isOnce = schedule?.mode === 'cycle' && schedule?.type === 'once';
  const stillEnabled = task.enabled && !isOnce;
  const next = stillEnabled ? computeNextRun(task, now) : null;
  db.prepare('UPDATE scheduled_task SET last_run_at = ?, next_run_at = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    now, next, stillEnabled ? 1 : 0, now, task.id,
  );
  return { ok, error, conversationId: convId };
}

// ===== 60s 轮询调度器（按需启停：仅当存在启用中的任务时才轮询） =====
let schedulerTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick() {
  if (ticking) return; // 上一轮未跑完时跳过，避免重叠
  ticking = true;
  try {
    const now = Date.now();
    const expired = db
      .prepare('SELECT id FROM scheduled_task WHERE enabled = 1 AND expire_at IS NOT NULL AND expire_at <= ?')
      .all(now) as any[];
    for (const t of expired) {
      db.prepare('UPDATE scheduled_task SET enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?').run(now, t.id);
    }
    const due = db
      .prepare('SELECT * FROM scheduled_task WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?')
      .all(now) as any[];
    for (const task of due) {
      try {
        const r = await runScheduledTask(task);
        if (r.ok) console.log(`[scheduled-task] 任务「${task.name}」已执行`);
      } catch (e) {
        console.error(`[scheduled-task] 任务「${task.name}」执行异常: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    ticking = false;
  }
}

function hasEnabledTask(): boolean {
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM scheduled_task WHERE enabled = 1').get() as any;
    return !!(row && row.c > 0);
  } catch {
    return false;
  }
}

function startSchedulerTimer() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => { tick().catch(() => {}); }, MINUTE_MS);
  // 启动 15s 后先跑一轮，补上停机期间到期的任务
  startupTimer = setTimeout(() => { tick().catch(() => {}); }, 15_000);
  console.log('[scheduled-task] 定时任务调度器已启动（每 60s 轮询）');
}

function stopSchedulerTimer() {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  console.log('[scheduled-task] 无启用任务，调度器已停止');
}

/** 按需启停：仅当存在启用中的任务时才运行轮询，全部停用/删除时停止，避免空轮询 */
export function refreshScheduledTaskScheduler() {
  if (hasEnabledTask()) startSchedulerTimer();
  else stopSchedulerTimer();
}

/** 兼容旧入口：启动时按需启停调度器 */
export function startScheduledTaskScheduler() {
  refreshScheduledTaskScheduler();
}
