// 对话定时任务：调度计算 + 任务执行器 + 60s 轮询调度器
// 说明：服务端不代理前端聊天（前端直连 LLM），因此这里用平台表里存储的
// apiUrl + apiKey 直接调用 OpenAI 兼容 /v1/chat/completions（非流式），
// Anthropic 协议平台走 /v1/messages。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

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

/** 计算任务下一次运行时间：interval_minutes 优先，其次 cron_expr；都没有返回 null */
export function computeNextRun(
  task: { interval_minutes?: number | null; cron_expr?: string | null },
  from = Date.now(),
): number | null {
  if (task.interval_minutes && task.interval_minutes > 0) {
    return from + task.interval_minutes * MINUTE_MS;
  }
  if (task.cron_expr && task.cron_expr.trim()) {
    return nextCronTime(task.cron_expr, from);
  }
  return null;
}

/** 选默认模型：优先用户自建的默认模型，其次内置默认模型，最后任意启用的 LLM */
function findDefaultModel(userId: string): any | null {
  return (
    db
      .prepare(
        `SELECT m.id, m.model_id, p.api_url, p.api_key_enc, p.protocol, p.headers_json
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
        `SELECT m.id, m.model_id, p.api_url, p.api_key_enc, p.protocol, p.headers_json
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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  let body: any;
  if (model.protocol === 'anthropic') {
    url = `${baseUrl}/v1/messages`;
    headers['x-api-key'] = model.api_key_enc || '';
    headers['anthropic-version'] = '2023-06-01';
    body = { model: model.model_id, max_tokens: 2048, messages, stream: false };
  } else {
    url = `${baseUrl}/v1/chat/completions`;
    if (model.api_key_enc) headers['Authorization'] = `Bearer ${model.api_key_enc}`;
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

/** 执行一次定时任务：复用/创建会话 → 写用户消息 → 调默认模型 → 写助手消息 → 更新运行状态 */
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

  // 2. 写入用户消息（带 [定时任务] 前缀）
  const userContent = `[定时任务] ${task.name}\n${task.prompt || ''}`.trim();
  db.prepare(INSERT_MESSAGE).run(uuid(), convId, userId, 'user', userContent, 0, now);

  // 3. 取最近上下文（含刚写入的用户消息）调用默认模型
  const historyRows = db
    .prepare(
      "SELECT role, content FROM message WHERE conversation_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL ORDER BY created_at DESC LIMIT 20",
    )
    .all(convId) as any[];
  const messages = historyRows.reverse().map((r) => ({ role: r.role, content: r.content || '' }));

  const finish = (ok: boolean, error?: string): ScheduledTaskRunResult => {
    db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(Date.now(), convId);
    // 停用状态的任务保持 next_run_at 为空，避免误恢复调度
    const next = task.enabled ? computeNextRun(task, now) : null;
    db.prepare('UPDATE scheduled_task SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?').run(
      now, next, now, task.id,
    );
    return { ok, error, conversationId: convId! };
  };

  try {
    const model = findTaskModel(userId, task.platform_id, task.model_id);
    if (!model) throw new Error('未找到可用的默认模型，请先在「设置 → 模型平台」配置并启用模型');
    const reply = await callModel(model, messages);
    if (!reply.content) throw new Error('模型返回了空回复');
    db.prepare(INSERT_MESSAGE).run(uuid(), convId, userId, 'assistant', reply.content, reply.tokens, Date.now());
    return finish(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scheduled-task] 任务「${task.name}」执行失败: ${msg}`);
    // 失败也落一条助手消息，用户在会话里可见
    db.prepare(INSERT_MESSAGE).run(uuid(), convId, userId, 'assistant', `[定时任务执行失败] ${msg}`, 0, Date.now());
    return finish(false, msg);
  }
}

// ===== 60s 轮询调度器 =====
let schedulerStarted = false;
let ticking = false;

async function tick() {
  if (ticking) return; // 上一轮未跑完时跳过，避免重叠
  ticking = true;
  try {
    const now = Date.now();
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

/** 启动调度器（模块级 guard，重复调用只启动一次） */
export function startScheduledTaskScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(() => {
    tick().catch(() => {});
  }, MINUTE_MS);
  // 启动 15s 后先跑一轮，补上停机期间到期的任务
  setTimeout(() => {
    tick().catch(() => {});
  }, 15_000);
  console.log('[scheduled-task] 定时任务调度器已启动（每 60s 轮询）');
}
