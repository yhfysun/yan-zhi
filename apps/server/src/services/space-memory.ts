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
  await ensureParentDir(filePath);
  let existing = '';
  try { existing = await readFile(filePath, 'utf-8'); } catch { /* 新文件 */ }
  if (!existing.trim()) {
    const header = `# ${space.name} · 空间记忆\n\n> 跨会话、所有智能体共享的长期记忆。每行一条，格式：- [日期] 内容\n`;
    const date = new Date().toISOString().slice(0, 10);
    await writeFile(filePath, `${header}\n- [${date}] ${line}\n`, 'utf-8');
  } else {
    const date = new Date().toISOString().slice(0, 10);
    const base = existing.endsWith('\n') ? existing : `${existing}\n`;
    await writeFile(filePath, base, 'utf-8');
    await appendFile(filePath, `- [${date}] ${line}\n`, 'utf-8');
  }
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
    await ensureParentDir(filePath);
    const date = new Date().toISOString().slice(0, 10);
    let existing = '';
    try { existing = await readFile(filePath, 'utf-8'); } catch { /* 新文件 */ }
    if (!existing.trim()) {
      const header = `# ${space.name} · 任务决策记录\n\n> 用户已确认过的设定。同目录新任务先对照本文件，已确认过的事项不要重复询问。\n`;
      await writeFile(filePath, `${header}\n- [${date}] 问：${q} → 答：${a}\n`, 'utf-8');
    } else {
      const base = existing.endsWith('\n') ? existing : `${existing}\n`;
      await writeFile(filePath, base, 'utf-8');
      await appendFile(filePath, `- [${date}] 问：${q} → 答：${a}\n`, 'utf-8');
    }
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
