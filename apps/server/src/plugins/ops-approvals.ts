// 命令审批闸门（结构化人工批准）。
//
// 为什么必须重做：原来的「二次确认」是**模型自己传 `confirmed: true`** —— 也就是说，
// 只要 LLM 在下一轮把参数补上，生产库上的 `systemctl restart` 就直接执行了。所谓确认
// 全靠模型自觉，人在环路里其实是空的。而且前端那个「需确认」黄标是靠正则匹配输出里的
// 「确认」字样推断的，措辞一变就消失，同时输入框并不锁定。
//
// 现在的口径：生产连接上的非只读命令，**模型传什么都执行不了** —— 必须由人在界面上
// 点批准，批准记录与「连接 + 命令原文」绑定，用一次即失效。模型只拿到一个待批准的结果，
// 批准后原样重试才放行；被拒绝则明确禁止它换写法绕。
import { createHash } from 'node:crypto';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  connectionId: string;
  connectionName: string;
  /** 命令原文 —— 批准绑定到这一条，不允许「批准 A 执行 B」 */
  command: string;
  /** 触发原因（如「命令模式默认命令」「容器重启」），用于界面展示 */
  reason: string;
  status: ApprovalStatus;
  requestedAt: number;
  decidedAt?: number;
  /** 决策人；本地单机模式恒 operator，留着是为了将来接多用户时不改结构 */
  decidedBy?: string;
}

/** 待批准/已批准记录的存活时长：超时后即失效，免得一条陈旧批准被翻出来用 */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;
/** 记录条数上限（超出丢最旧的） */
export const MAX_APPROVALS = 100;

/** 幂等键：同一连接 + 同一条命令算同一次请求（模型重试不该刷出多条待批准） */
export function approvalKey(connectionId: string, command: string): string {
  return `${connectionId}\u0000${command.trim()}`;
}

/** 稳定 id（同一连接 + 同一命令恒定，便于幂等与界面去重） */
export function approvalId(connectionId: string, command: string): string {
  const h = createHash('sha256').update(approvalKey(connectionId, command)).digest('hex').slice(0, 12);
  return `apr-${h}`;
}

/** 清掉过期记录（超时即失效，无论当时批准与否） */
export function pruneApprovals(list: ApprovalRequest[], now = Date.now()): ApprovalRequest[] {
  return list.filter((a) => now - a.requestedAt < APPROVAL_TTL_MS);
}

/** 按上限裁剪，保留最新的（list 约定为新在前） */
export function capApprovals(list: ApprovalRequest[]): ApprovalRequest[] {
  return list.slice(0, MAX_APPROVALS);
}

export interface TakeResult {
  /** 取到的记录（可能是批准，也可能是拒绝） */
  hit: ApprovalRequest | null;
  /** 移除该记录后的列表（无论批准还是拒绝都消费掉） */
  rest: ApprovalRequest[];
}

/**
 * 取出并消费一条已决记录。
 * ★ 命令必须**原文一致**（trim 后）才认：模型把命令改一个字就是另一条命令，
 *   必须重新批准 —— 否则「批准 ls」会被用来给「rm -rf」背书。
 */
export function takeApproval(list: ApprovalRequest[], connectionId: string, command: string): TakeResult {
  const want = approvalKey(connectionId, command);
  const hit = list.find((a) => approvalKey(a.connectionId, a.command) === want && a.status !== 'pending') ?? null;
  if (!hit) return { hit: null, rest: list };
  return { hit, rest: list.filter((a) => a.id !== hit.id) };
}

/** 是否已有同一连接 + 同一命令的待批准项（用于幂等，不重复创建） */
export function hasPending(list: ApprovalRequest[], connectionId: string, command: string): boolean {
  const want = approvalKey(connectionId, command);
  return list.some((a) => approvalKey(a.connectionId, a.command) === want && a.status === 'pending');
}

/** 新建一条待批准记录 */
export function makeRequest(
  connectionId: string,
  connectionName: string,
  command: string,
  reason: string,
  now = Date.now(),
): ApprovalRequest {
  return {
    id: approvalId(connectionId, command),
    connectionId,
    connectionName,
    command,
    reason,
    status: 'pending',
    requestedAt: now,
  };
}

/**
 * 给模型的工具结果（待批准）。
 * ★ 措辞是这套闸门的一部分：必须让模型明白「停在这里」，
 *   既不能当成失败去重试改写，也不能自己编一个「已批准」继续。
 */
export function pendingMessage(a: ApprovalRequest): string {
  return [
    '⏸ 该命令需要人工批准，尚未执行。',
    `连接：${a.connectionName}（标记为生产环境）`,
    `命令：${a.command}`,
    '已把这条命令提交给运维人员审批。',
    '请**停止**在此等待，不要改写命令、不要换用其它工具绕过、不要假定它已获批准。',
    '人工批准后，原样重新调用本工具即可继续。',
  ].join('\n');
}

/** 给模型的工具结果（被拒绝） */
export function rejectedMessage(a: ApprovalRequest): string {
  return [
    '⛔ 该命令已被运维人员**拒绝**执行。',
    `连接：${a.connectionName}`,
    `命令：${a.command}`,
    '不要再重试这条命令，也不要尝试用其它写法（拆分、改参数、换工具、换连接）达成同样效果。',
    '如果确有需要，请向用户说明目的并等待其明确指示。',
  ].join('\n');
}
