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
