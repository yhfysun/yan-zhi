// 只读数据契约（宿主能力）—— 插件/模型的唯一取数口，固定 SQL + 固定字段 + 用户隔离。
//
// ★ 为什么不是「给插件 db 权限」：插件读主库等于把 60 张表的结构与敏感字段全暴露。
//   契约把「能读什么」钉死：每条 = 一段固定 SQL + 固定输出字段 + 钳制后的参数。
// ★ 只读：本文件不提供任何写接口；userId 必填，未带用户直接拒绝。

import { db } from '../db.js';

export interface ReadContractParam {
  type: 'number';
  min: number;
  max: number;
  default: number;
}

export interface ReadContractDef {
  name: string;
  description: string;
  params: Record<string, ReadContractParam>;
  run: (userId: string, p: Record<string, number>) => unknown;
}

const LIMIT: ReadContractParam = { type: 'number', min: 1, max: 50, default: 10 };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const CONTRACTS: ReadContractDef[] = [
  {
    name: 'tasks.today',
    description: '今天创建或更新、尚未完成的计划项（标题 / 状态 / 所属会话 / 更新时间）',
    params: { limit: LIMIT },
    run: (userId, p) =>
      db.prepare(
        `SELECT id, title, status, conversation_id AS conversationId, updated_at AS updatedAt
         FROM task_plan_item
         WHERE status IN ('pending', 'running')
           AND updated_at >= ?
           AND conversation_id IN (SELECT id FROM conversation WHERE user_id = ?)
         ORDER BY updated_at DESC LIMIT ?`,
      ).all(startOfToday(), userId, p.limit),
  },
  {
    name: 'agents.running',
    description: '正在执行计划项的智能体及其数量',
    params: { limit: LIMIT },
    run: (userId, p) =>
      db.prepare(
        `SELECT a.id AS agentId, a.name AS name, COUNT(*) AS runningCount
         FROM task_plan_item t JOIN agent a ON a.id = t.agent_id
         WHERE t.status = 'running'
           AND t.conversation_id IN (SELECT id FROM conversation WHERE user_id = ?)
         GROUP BY a.id, a.name
         ORDER BY runningCount DESC LIMIT ?`,
      ).all(userId, p.limit),
  },
  {
    name: 'conversations.recent',
    description: '最近更新的会话（标题 / 模式 / 更新时间）',
    params: { limit: LIMIT },
    run: (userId, p) =>
      db.prepare(
        `SELECT id, title, mode, updated_at AS updatedAt
         FROM conversation WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT ?`,
      ).all(userId, p.limit),
  },
];

export function listReadContracts(): Array<{ name: string; description: string; params: Record<string, ReadContractParam> }> {
  return CONTRACTS.map((c) => ({ name: c.name, description: c.description, params: c.params }));
}

export type ReadContractResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** 执行契约：未知契约 / 缺用户 / SQL 异常一律结构化返回，不抛 */
export function runReadContract(
  name: string,
  userId: string,
  params?: Record<string, unknown>,
): ReadContractResult {
  if (!userId) return { ok: false, error: 'missing-user' };
  const def = CONTRACTS.find((c) => c.name === name);
  if (!def) return { ok: false, error: 'unknown-contract' };

  const p: Record<string, number> = {};
  for (const [key, rule] of Object.entries(def.params)) {
    const n = Number(params ? params[key] : NaN);
    p[key] = Number.isFinite(n)
      ? Math.min(rule.max, Math.max(rule.min, Math.round(n)))
      : rule.default;
  }
  try {
    return { ok: true, data: def.run(String(userId), p) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
