// 用户工具钩子（P2-7 P2a，2026-10-04）—— 设置页里用户声明的「工具调用前规则」。
//
// ★ 定位（与既有机制的关系，别混淆）：
//   · 内置危险命令护栏（path-guard.checkDangerousCommand）= 平台兜底，用户不可关；
//   · path-guard 授权 = 针对「越出工作目录」的弹窗；
//   · **本模块 = 用户自己写规则**：某工具（可选匹配参数内容）要么直接拒（deny）、
//     要么每次调用弹窗确认（confirm）——对标 Claude Code hooks 的声明式子集（P2a）。
//
// ★ P2a 边界（刻意收窄，见 docs/开发模式-P2新增能力-方案.md P2-7）：
//   · trigger 只有 'before'；action 只有 deny/confirm（纯声明式，零执行风险）；
//   · pattern 是**大小写不敏感的子串**，不是正则 —— 声明式规则的可预测性优先，
//     写错正则的静默不匹配比"匹配不上"更糟（fail 方向不可见）。正则/脚本留 P2b。
//   · script 类型不做 —— 允许用户脚本就等于自己开了一条绕过危险命令护栏的后门。
//
// ★ 匹配文本的口径：命令类工具（cmd_exec/python_exec）用 summarizeCommandArgs 拼命令行
//   （跟危险命令护栏同一份摘要，规则写 "npm publish" 能命中）；其他工具把参数序列化成
//   文本再匹配（file_write 的 pattern 写文件名子串也有效）。工具名本身**永远参与匹配**，
//   所以 pattern 可以只写工具名做"全参数匹配"。
//
// ★ 缓存：规则表极小（用户手建，个位数），进程内全量缓存、写操作时失效 ——
//   executeTool 是每轮必经的热路径，不能每次 prepare。

import { db } from '../db.js';
import { COMMAND_TOOLS, summarizeCommandArgs } from './path-guard.js';

export type UserHookAction = 'deny' | 'confirm';

export interface UserHook {
  id: string;
  userId: string;
  name: string;
  /** P2a 只有 'before'；保留字段名给 P2b 的 'after' 留路 */
  trigger: 'before';
  /** '*' 或空 = 匹配所有工具 */
  tool: string;
  /** 大小写不敏感子串；空 = 只按工具名匹配 */
  pattern: string | null;
  action: UserHookAction;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

function rowToHook(r: any): UserHook {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    trigger: 'before',
    tool: r.tool || '*',
    pattern: r.pattern || null,
    action: r.action === 'confirm' ? 'confirm' : 'deny',
    enabled: !!r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

let cache: UserHook[] | null = null;
function loadAll(): UserHook[] {
  if (cache) return cache;
  try {
    cache = (db.prepare('SELECT * FROM user_hook ORDER BY created_at ASC').all() as any[]).map(rowToHook);
  } catch {
    // 读失败不缓存空结果（db 恢复后下次调用自然重试），仅本次按"无规则"处理 —— fail-open
    return [];
  }
  return cache!;
}
function invalidate(): void {
  cache = null;
}

/** 主动失效缓存（测试用；进程内单实例，写路径已自动失效） */
export function invalidateUserHookCache(): void {
  invalidate();
}

// ── CRUD（routes/user-hooks.ts 用）──

/** 保存前校验，返回错误信息或 null（与 scheduled-tasks.validateSchedule 同风格） */
export function validateUserHook(input: { name?: unknown; tool?: unknown; pattern?: unknown; action?: unknown }): string | null {
  const name = String(input.name ?? '').trim();
  if (!name) return '规则名称不能为空';
  const action = String(input.action ?? '');
  if (action !== 'deny' && action !== 'confirm') return 'action 只支持 deny（直接拒绝）或 confirm（每次弹窗确认）';
  const tool = String(input.tool ?? '*').trim() || '*';
  if (tool !== '*' && !/^[a-zA-Z_][\w-]*$/.test(tool)) return '工具名不合法（应为工具标识或 *）';
  return null;
}

export function listUserHooks(userId: string): UserHook[] {
  return loadAll().filter((h) => h.userId === userId);
}

export function createUserHook(userId: string, input: { name: string; tool: string; pattern?: string | null; action: UserHookAction; enabled?: boolean }): UserHook {
  const ts = Date.now();
  const id = 'uh_' + ts.toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(
    'INSERT INTO user_hook (id, user_id, name, trigger, tool, pattern, action, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, input.name.trim(), 'before', (input.tool || '*').trim() || '*', input.pattern?.trim() || null, input.action, input.enabled === false ? 0 : 1, ts, ts);
  invalidate();
  const row = db.prepare('SELECT * FROM user_hook WHERE id = ?').get(id) as any;
  return rowToHook(row);
}

/** 不存在的 id 返回 null；只允许改自己的规则 */
export function updateUserHook(userId: string, id: string, patch: { name?: string; tool?: string; pattern?: string | null; action?: UserHookAction; enabled?: boolean }): UserHook | null {
  const cur = db.prepare('SELECT * FROM user_hook WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!cur) return null;
  db.prepare(
    'UPDATE user_hook SET name = ?, tool = ?, pattern = ?, action = ?, enabled = ?, updated_at = ? WHERE id = ?',
  ).run(
    patch.name !== undefined ? String(patch.name).trim() : cur.name,
    patch.tool !== undefined ? ((String(patch.tool).trim() || '*')) : cur.tool,
    patch.pattern !== undefined ? (patch.pattern ? String(patch.pattern).trim() : null) : cur.pattern,
    patch.action !== undefined ? String(patch.action) : cur.action,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : cur.enabled,
    Date.now(),
    id,
  );
  invalidate();
  const row = db.prepare('SELECT * FROM user_hook WHERE id = ?').get(id) as any;
  return rowToHook(row);
}

export function deleteUserHook(userId: string, id: string): boolean {
  const r = db.prepare('DELETE FROM user_hook WHERE id = ? AND user_id = ?').run(id, userId);
  invalidate();
  return r.changes > 0;
}

// ── 匹配（executeTool 热路径）──

export interface UserHookVerdict {
  /** 命中的 deny 规则 —— 任一命中即拒绝（fail-safe：规则冲突时从紧） */
  denyRules: UserHook[];
  /** 命中的 confirm 规则 —— 与 deny 并存时被 deny 覆盖（deny 优先） */
  confirmRules: UserHook[];
}

/** 工具参数 → 参与匹配的文本（命令类用命令行摘要，其余序列化参数；工具名永远在内） */
export function userHookMatchText(toolName: string, args: Record<string, unknown> | null | undefined): string {
  const argText = COMMAND_TOOLS.has(toolName)
    ? summarizeCommandArgs(args)
    : JSON.stringify(args ?? {});
  return `${toolName}\n${argText}`;
}

/**
 * 求当前用户在该工具调用上命中的规则。
 * ★ 只读缓存，不抛错（db 坏了返回空 → 钩子层 fail-open，绝不能因钩子挂掉废掉所有工具）。
 */
export function matchUserHooks(userId: string | undefined | null, toolName: string, args: Record<string, unknown> | null | undefined): UserHookVerdict {
  const verdict: UserHookVerdict = { denyRules: [], confirmRules: [] };
  if (!userId) return verdict;
  let hooks: UserHook[];
  try {
    hooks = loadAll();
  } catch {
    return verdict;
  }
  // 匹配文本惰性构建：只有真的存在 pattern 规则时才把参数序列化（无 pattern 规则的会话零开销）
  let matchText: string | null = null;
  for (const h of hooks) {
    if (!h.enabled || h.trigger !== 'before') continue;
    if (h.userId !== userId) continue;
    if (h.tool !== '*' && h.tool !== toolName) continue;
    if (h.pattern) {
      if (matchText === null) matchText = userHookMatchText(toolName, args).toLowerCase();
      if (!matchText.includes(h.pattern.toLowerCase())) continue;
    }
    (h.action === 'deny' ? verdict.denyRules : verdict.confirmRules).push(h);
  }
  // deny 与 confirm 并存 → deny 优先（fail-safe：冲突从紧；confirm 弹窗被 deny 短路）
  if (verdict.denyRules.length > 0) verdict.confirmRules = [];
  return verdict;
}
