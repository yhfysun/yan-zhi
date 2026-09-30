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

export interface TaskPlan {
  title?: string;
  steps: Array<{ title: string; status?: string; note?: string }>;
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

/**
 * 跨会话播种：会话行没有计划时，把工作目录 plan.md 回填进该会话（写库）。
 *
 * ★ 为什么必须有：loadTaskPlan 的文件回退只解决"模型看得到计划"，但前端 task_step
 *   写的是**当前会话**的 conversation.task_plan_json —— 新会话里它还是空的，
 *   task_step 会报「当前会话还没有任务计划」→ 模型只能 task_plan 重建（进度归零）。
 *   播种后新会话拥有一份真实结构的计划副本，task_step 正常推进、每步镜像回文件。
 *
 * 调用时机：GET /conversations（列表）与 GET /conversations/:id —— 前端恢复计划卡片
 * 与 task_step 依赖这两处的行数据。会话行已有计划（本会话实时进度）时**绝不覆盖**。
 * 同步实现（readFileSync + better-sqlite3），可在同步路由里直接用。
 */
export function seedTaskPlanFromFile(conversationId: string): TaskPlan | null {
  try {
    const row = db.prepare('SELECT task_plan_json FROM conversation WHERE id = ?').get(conversationId) as
      | { task_plan_json?: string | null }
      | undefined;
    if (!row) return null;
    if (row.task_plan_json) return null; // 本会话已有计划（优先级高于文件），不覆盖
    const plan = loadTaskPlanFromFile(conversationId);
    if (!plan?.steps?.length) return null;
    db.prepare('UPDATE conversation SET task_plan_json = ? WHERE id = ?').run(JSON.stringify(plan), conversationId);
    return plan;
  } catch {
    return null;
  }
}

// ── 无人值守兜底：后端直接执行 task_plan / task_step（写库 + 写文件） ──
// 与前端 plan-buckets.ts 的 applyTaskPlan/applyTaskStep 语义对齐（边界显式报错不静默）。

function savePlanJson(conversationId: string, plan: TaskPlan): boolean {
  try {
    db.prepare('UPDATE conversation SET task_plan_json = ? WHERE id = ?').run(JSON.stringify(plan), conversationId);
    return true;
  } catch {
    return false;
  }
}

function loadPlanJson(conversationId: string): TaskPlan | null {
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

/** 无人值守 task_plan：创建/整体替换计划。返回给模型的回执文本。 */
export async function backendTaskPlan(conversationId: string, args: Record<string, unknown>): Promise<string> {
  const rawSteps = Array.isArray(args?.steps) ? (args.steps as any[]) : [];
  const steps = rawSteps
    .filter((s: any) => s && s.title)
    .map((s: any) => ({
      title: String(s.title),
      ...(s.description ? { note: String(s.description) } : {}),
      status: 'pending',
    }));
  if (!steps.length) return 'task_plan 失败：steps 里没有有效步骤（每项需要 title）';
  const plan: TaskPlan = { title: String(args?.title || '任务计划'), steps };
  if (!savePlanJson(conversationId, plan)) return 'task_plan 失败：写库失败';
  const ok = await writeTaskPlanFile(conversationId, plan);
  return `已创建任务计划「${plan.title}」，共 ${steps.length} 步${ok ? '' : '（工作目录计划文件写入失败，跨会话接力可能不可用）'}`;
}

/** 无人值守 task_step：推进某一步。返回给模型的回执文本。 */
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
  step.status = status;
  if (args?.note != null) step.note = String(args.note);
  if (!savePlanJson(conversationId, plan)) return 'task_step 失败：写库失败';
  const ok = await writeTaskPlanFile(conversationId, plan);
  return `已更新第 ${idx} 步状态为 ${status}${ok ? '' : '（工作目录计划文件写入失败）'}`;
}
