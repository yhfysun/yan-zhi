// 空间记忆文件 —— 每个空间一份 MEMORY.md，跨会话、跨智能体共享。
// 与 memory 表（按 user/agent/type 组织）互补：空间记忆挂在 space 维度上，
// 该空间下的所有会话、任意智能体都会在系统提示词中收到同一份记忆文件。
// 文件位置：
//   - 空间绑定了本地目录（dir_path）→ <dir_path>/MEMORY.md（跟随空间目录，用户可直接编辑）
//   - 未绑定目录 → <serverState.workspaceDir>/spaces/<spaceId>/MEMORY.md
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { serverState } from '../state.js';
import { estimateTokens } from '@yan-zhi/shared';

const MEMORY_FILE_NAME = 'MEMORY.md';

/** 注入上下文时的单文件字符上限（防止空间记忆无限膨胀撑爆提示词） */
const INJECT_MAX_CHARS = 6000;

interface SpaceRow {
  id: string;
  user_id: string;
  name: string;
  dir_path: string | null;
}

function getSpaceRow(userId: string | null, spaceId: string): SpaceRow | null {
  const row = userId
    ? db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(spaceId, userId)
    : db.prepare('SELECT * FROM space WHERE id = ?').get(spaceId);
  return (row as SpaceRow) || null;
}

/** 解析空间记忆文件的落盘路径 */
export function getSpaceMemoryPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, MEMORY_FILE_NAME);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, MEMORY_FILE_NAME);
}

/** 确保父目录存在（未绑定目录的空间按需创建 workspace/spaces/<id>/） */
async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/** 读取空间记忆（带归属校验）。文件不存在时 exists=false、content='' */
export async function readSpaceMemory(
  userId: string,
  spaceId: string,
): Promise<{ spaceId: string; spaceName: string; path: string; content: string; exists: boolean }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const filePath = getSpaceMemoryPath(space);
  let content = '';
  let exists = false;
  try {
    content = await readFile(filePath, 'utf-8');
    exists = true;
  } catch { /* 文件不存在，返回空内容 */ }
  return { spaceId: space.id, spaceName: space.name, path: filePath, content, exists };
}

/** 空间记忆文件的标准头部（新建时写入；与 appendSpaceMemory 保持同一格式） */
function spaceMemoryHeader(spaceName: string): string {
  return `# ${spaceName} · 空间记忆\n\n> 跨会话、所有智能体共享的长期记忆。每行一条，格式：- [日期] 内容`;
}

/** 日期（YYYY-MM-DD），既有空间记忆的条目格式 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 带时刻的戳（YYYY-MM-DD HH:mm）—— 任务进展多次追加，只有日期分不清先后 */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 往「一行一条」的记忆文件追加一行；文件不存在/为空时先写标准头部。
 *
 * 抽出来的原因：空间 MEMORY.md 与 .yan-zhi/task-memory/*.md 必须**同一套格式**，
 * 各自实现一份必然漂移（头部不同、换行处理不同）。
 */
async function appendLineWithHeader(filePath: string, header: string, line: string): Promise<void> {
  await ensureParentDir(filePath);
  let existing = '';
  try { existing = await readFile(filePath, 'utf-8'); } catch { /* 新文件 */ }
  if (!existing.trim()) {
    await writeFile(filePath, `${header}\n\n- ${line}\n`, 'utf-8');
    return;
  }
  const base = existing.endsWith('\n') ? existing : `${existing}\n`;
  await writeFile(filePath, base, 'utf-8');
  await appendFile(filePath, `- ${line}\n`, 'utf-8');
}

/** 整体写入空间记忆文件（覆盖） */
export async function writeSpaceMemory(
  userId: string,
  spaceId: string,
  content: string,
): Promise<{ spaceId: string; path: string; size: number }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const filePath = getSpaceMemoryPath(space);
  await ensureParentDir(filePath);
  const text = String(content || '').replace(/\r\n/g, '\n');
  await writeFile(filePath, text, 'utf-8');
  return { spaceId: space.id, path: filePath, size: Buffer.byteLength(text, 'utf-8') };
}

/** 追加一条记忆（一行一条，带日期前缀）。文件不存在时先建标准头部 */
export async function appendSpaceMemory(
  userId: string,
  spaceId: string,
  entry: string,
): Promise<{ spaceId: string; path: string; appended: boolean }> {
  const space = getSpaceRow(userId, spaceId);
  if (!space) throw new Error('空间不存在或不属于当前用户');
  const line = String(entry || '').trim().replace(/\s*\n+\s*/g, ' '); // 追加语义=一行一条，压平换行
  if (!line) throw new Error('content 为必填项');
  const filePath = getSpaceMemoryPath(space);
  await appendLineWithHeader(filePath, spaceMemoryHeader(space.name), `[${today()}] ${line}`);
  return { spaceId: space.id, path: filePath, appended: true };
}

/** 任务侧（服务端上下文，免归属校验）：按会话解析所属空间并读取记忆文件 */
export function loadSpaceMemoryForConversation(
  conversationId: string | null | undefined,
): { spaceId: string; spaceName: string; content: string } | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  if (!conv?.space_id) return null;
  const space = getSpaceRow(null, conv.space_id);
  if (!space) return null;
  try {
    // 同步读（任务组装提示词是同步路径）；文件不存在或读失败都视为无空间记忆
    const content = readFileSync(getSpaceMemoryPath(space), 'utf-8');
    if (!content.trim()) return null;
    return { spaceId: space.id, spaceName: space.name, content: content.slice(0, INJECT_MAX_CHARS) };
  } catch {
    return null;
  }
}

/** 空间记忆 → 系统提示词片段（截断到安全长度，超限提示"内容过长"） */
export function formatSpaceMemoryContext(name: string, content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  const clipped = trimmed.length > INJECT_MAX_CHARS
    ? `${trimmed.slice(0, INJECT_MAX_CHARS)}\n…（空间记忆过长已截断，完整内容可用 api_space_memory_read 查看）`
    : trimmed;
  return [
    '## 空间记忆（本空间跨会话长期记忆，所有智能体共享）',
    `> 空间「${name}」的记忆文件，跨会话有效。与当前任务相关的条目应遵守；需要沉淀新的长期事实时可调用 api_space_memory_append 追加。`,
    '> ★ 条目里的「任务…【已完成/达最大步数中断/被用户终止/失败中断】」是系统自动记录的任务收尾进展' +
    '（做到哪、还剩什么）—— **继续本空间的长任务前先看这些条目**，别从头再来；' +
    '更细的逐批流水可用 api_space_memory_read 读（会一并返回进展明细）。',
    '',
    clipped,
  ].join('\n');
}

/** 注入用 token 预算参考（供上层决定是否跳过） */
export function estimateSpaceMemoryTokens(content: string): number {
  return estimateTokens(content || '');
}

// ── 任务决策记录（task-memory）────────────────────────────────────────────
// 用户在 ask_user / confirm_user 里确认过的内容必须落盘（硬性验收项）：
// 同一目录新开会话时注入摘要，模型先对照已确认设定再继续 —— 不再重复询问
// 人物形象、响应格式、风格等已经拍板过的东西。
// 文件位置（与空间记忆同规则）：
//   - 空间绑定目录 → <dir_path>/.yan-zhi/task-memory/decisions.md
//   - 未绑定目录   → <workspaceDir>/spaces/<spaceId>/.yan-zhi/task-memory/decisions.md

const TASK_MEMORY_DIR = '.yan-zhi/task-memory';
const DECISIONS_FILE = 'decisions.md';
/** 决策注入的字符上限（正文长任务确认多，但提示词预算有限；完整文件可用 api_space_memory_read 读） */
const DECISIONS_INJECT_MAX_CHARS = 3000;

function getTaskDecisionsPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, TASK_MEMORY_DIR, DECISIONS_FILE);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, TASK_MEMORY_DIR, DECISIONS_FILE);
}

/** 压平多行文本（决策记录一行一条） */
function flattenForDecision(s: string): string {
  return String(s || '').trim().replace(/\s*\n+\s*/g, ' ').slice(0, 500);
}

/**
 * 记录一条用户确认结果（服务端在 ask_user / confirm_user 结果回传时调用）。
 * 会话未挂空间（无 dir_path 且 spaceId 为空）时静默跳过 —— 长任务引导挂空间才有意义。
 */
export async function appendTaskDecision(
  userId: string,
  conversationId: string,
  question: string,
  answer: string,
): Promise<{ ok: boolean; path?: string }> {
  try {
    const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
      | { space_id: string | null }
      | undefined;
    if (!conv?.space_id) return { ok: false };
    const space = userId
      ? getSpaceRow(userId, conv.space_id)
      : getSpaceRow(null, conv.space_id);
    if (!space) return { ok: false };
    const q = flattenForDecision(question);
    const a = flattenForDecision(answer);
    if (!q || !a) return { ok: false };
    const filePath = getTaskDecisionsPath(space);
    await appendLineWithHeader(
      filePath,
      `# ${space.name} · 任务决策记录\n\n> 用户已确认过的设定。同目录新任务先对照本文件，已确认过的事项不要重复询问。`,
      `[${today()}] 问：${q} → 答：${a}`,
    );
    return { ok: true, path: filePath };
  } catch {
    // 决策落盘失败不阻塞用户回答主链路（回答已经送达模型）
    return { ok: false };
  }
}

/** 会话任务决策摘要（同步读，注入系统提示词用）。文件不存在返回 null */
export function loadTaskMemoryForConversation(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  if (!conv?.space_id) return null;
  const space = getSpaceRow(null, conv.space_id);
  if (!space) return null;
  try {
    const content = readFileSync(getTaskDecisionsPath(space), 'utf-8');
    if (!content.trim()) return null;
    return content.slice(0, DECISIONS_INJECT_MAX_CHARS);
  } catch {
    return null;
  }
}

/** 决策记录 → 系统提示词片段 */
export function formatTaskMemoryContext(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  const clipped = trimmed.length > DECISIONS_INJECT_MAX_CHARS
    ? `${trimmed.slice(0, DECISIONS_INJECT_MAX_CHARS)}\n…（决策记录过长已截断）`
    : trimmed;
  return [
    '## 任务决策记录（用户已确认过的内容）',
    '> 以下是本目录历史上用户在「向你提问/确认」环节拍板过的决定。继续任务或开新任务时先对照这里，已确认过的事项直接沿用，不要重复询问；除非用户主动要求更改。',
    '',
    clipped,
  ].join('\n');
}

// ── 任务进展（progress）──────────────────────────────────────────────────
// ★★★ 为什么必须补这块（2026-09-27，用户报「长任务没完整需要总结记忆进入空间记忆」）：
//   此前长任务收尾只有两条通路，**都不进空间记忆**：
//     ① 正常完成 → extractMemoryFromConversation 只写 memory 表（user/agent 维度），
//        空间 MEMORY.md 一个字节都不写；
//     ② 达最大步数 / 被终止 / 失败 → 只往**对话**里塞一条总结消息
//        （被终止时连消息都没有）→ 同目录新开会话读到的仍是"空记忆"。
//   而 docs/目录任务模式-方案.md 设计里的 progress.md（做到第几段/第几镜）**从未实现**。
//   后果：用户换会话继续同一个长任务时，模型不知道上一批做到哪、还剩多少没做。
//
// 落盘位置：
//   · 空间 MEMORY.md（**注入**，所有会话/智能体共享）
//   · <dir>/.yan-zhi/task-memory/progress.md（**明细**，按需读，不自动注入 —— 防爆窗）
// 两条都写而不是只写一条：只写 MEMORY.md 会让主记忆被逐批流水账撑爆（注入上限 6000 字），
// 只写 progress.md 则同目录新会话根本看不到（它不参与注入）。

const PROGRESS_FILE = 'progress.md';
/** 进度明细文件的读取上限（按需读，不在注入路径上） */
const PROGRESS_READ_MAX_CHARS = 8000;

/** 任务终结形态 —— 决定写入的措辞（模型据此判断"能不能接着做"） */
export type TaskProgressOutcome = 'completed' | 'max_steps' | 'aborted' | 'failed' | 'empty_args_loop';

const OUTCOME_LABEL: Record<TaskProgressOutcome, string> = {
  completed: '已完成',
  max_steps: '达最大步数中断',
  aborted: '被用户终止',
  failed: '失败中断',
  // 空转断路器停下（连续多步工具参数为空）——也是一种"没跑完"，必须留痕否则同目录新会话
  // 完全不知道上一批是因为退化停下的（会以为任务从未开始）。
  empty_args_loop: '空转中断',
};

function getTaskProgressPath(space: Pick<SpaceRow, 'id' | 'dir_path'>): string {
  if (space.dir_path) return path.join(space.dir_path, TASK_MEMORY_DIR, PROGRESS_FILE);
  return path.join(serverState.workspaceDir || process.cwd(), 'spaces', space.id, TASK_MEMORY_DIR, PROGRESS_FILE);
}

/** 会话 → 所属空间 id（服务端上下文免归属校验）；未挂空间返回 '' */
export function resolveConversationSpaceId(conversationId: string | null | undefined): string {
  if (!conversationId) return '';
  try {
    const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
      | { space_id: string | null }
      | undefined;
    return conv?.space_id || '';
  } catch {
    return '';
  }
}

/** 摘要压成一行（记忆文件一行一条，换行会把一条切成多条） */
function flattenForProgress(s: string, max: number): string {
  return String(s || '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, max);
}

/**
 * 记录一次任务收尾（进展摘要 → 空间记忆 + 进度明细）。
 *
 * ★ 由服务端在任务出口**自动调用**，不依赖模型主动调 `api_space_memory_append` ——
 *   实测那条路是断的：两个空间记忆工具虽然注册了 schema 也实现了 executor case，
 *   却**没挂给任何智能体**（`builtin_tool_ids` 里没有）→ 模型根本看不到这两个工具，
 *   提示词里那句"可调用 api_space_memory_append 追加"是**空指令**。
 *   靠提示词约束"自己记得总结"永远不可靠，机械保证必须落在代码里。
 *
 * 设计取舍：
 *   · fail-safe：任何异常都静默返回 ok:false（收尾路径不能因为写记忆失败而报错给用户）；
 *   · 未挂空间的会话静默跳过（**绝不能**因此创建目录 —— 用户明确「没有任务类型默认目录不需要建立」）；
 *   · 只压一行、截断长度：MEMORY.md 是**注入**文件，写长了会把提示词预算吃掉。
 */
export async function appendTaskProgress(
  conversationId: string | null | undefined,
  outcome: TaskProgressOutcome,
  summary: string,
  extra?: { steps?: number; agentName?: string },
): Promise<{ ok: boolean; path?: string }> {
  try {
    const spaceId = resolveConversationSpaceId(conversationId);
    if (!spaceId) return { ok: false };
    const space = getSpaceRow(null, spaceId);
    if (!space) return { ok: false };
    const line = flattenForProgress(summary, 400);
    if (!line) return { ok: false };

    const stamp = nowStamp();
    const bits = [`【${OUTCOME_LABEL[outcome] ?? outcome}】`];
    if (extra?.steps) bits.push(`(${extra.steps} 步)`);
    if (extra?.agentName) bits.push(`${extra.agentName}：`);
    const entry = `${stamp} 任务${bits.join('')}${line}`;

    // ① 明细：按需读、不参与注入
    await appendLineWithHeader(
      getTaskProgressPath(space),
      `# ${space.name} · 任务进展\n\n> 每个长任务收尾时自动追加一条（做到哪、还剩什么）。按需读取，不自动注入。`,
      entry,
    );
    // ② 空间记忆：真正被注入系统提示词的那份（同一条，保持两处一致）
    await appendLineWithHeader(getSpaceMemoryPath(space), spaceMemoryHeader(space.name), entry);

    return { ok: true, path: getTaskProgressPath(space) };
  } catch {
    return { ok: false };
  }
}

/** 任务进展明细（同步读，供按需读取工具用）。文件不存在返回 null */
export function readTaskProgressForConversation(
  conversationId: string | null | undefined,
): { spaceId: string; spaceName: string; path: string; content: string; exists: boolean } | null {
  const spaceId = resolveConversationSpaceId(conversationId);
  if (!spaceId) return null;
  const space = getSpaceRow(null, spaceId);
  if (!space) return null;
  const filePath = getTaskProgressPath(space);
  try {
    const content = readFileSync(filePath, 'utf-8').slice(0, PROGRESS_READ_MAX_CHARS);
    return { spaceId: space.id, spaceName: space.name, path: filePath, content, exists: !!content.trim() };
  } catch {
    return { spaceId: space.id, spaceName: space.name, path: filePath, content: '', exists: false };
  }
}
