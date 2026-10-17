// 高危动作逐条审批门（ExecutionGate，2026-10-17）。
//
// 要解决的问题：原来高危动作只靠模型自己传 `confirmed: true` —— 模型下一轮把参数补上就过了，
// 人在环路里其实是空的。现在高危动作（shell 执行 / 侵入验证 / 靶场容器）必须拿到一张
// **绑定内容哈希的一次性批准票**：
//   · 逐条：批准的是"这一次、这一组参数"，不是"以后这类动作都行"；
//   · 内容哈希：模型改一个参数就是另一条动作，必须重新批准；
//   · 超时自动拒：票 10 分钟内有效，过期不补；
//   · 无确认通道 fail-closed：没有人批就是 pending，永远不会自动变成 approved。
//
// 三档与 engagementMode **合并而非并列**：
//   · engagementMode 仍决定"能不能做侵入级动作"（风险闸门）；
//   · approvalMode 决定"高危动作要不要逐条人工批"（人手闸门）：
//       ask          所有高危动作逐条人工批准（默认）
//       auto_review  只读外部工具（nmap/nuclei 等）自动复核；侵入级与靶场 shell 仍逐条批准
//       full_access  高危动作不再逐条批准（仍受授权范围/风险级/黑名单/HUMAN_ONLY 约束）
//   · 人工在控制台直接点击执行（requester=human）不重复走逐条审批 —— 点击本身就是批准。
import { createHash } from 'node:crypto';
import { normalizeTarget } from '../sec-lab-guard.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type HighRiskKind = 'shell' | 'intrusive';
export type ApprovalMode = 'ask' | 'auto_review' | 'full_access';

export interface ExecutionApproval {
  id: string;
  tool: string;
  kind: HighRiskKind;
  target: string;
  /** 动作内容哈希（tool + 规范化参数），批准票与它绑定 */
  argsHash: string;
  /** 给人看的动作摘要（不含凭据） */
  summary: string;
  /** 为什么需要审批 */
  reason: string;
  status: ApprovalStatus;
  requestedAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
  rejectReason?: string;
}

/** 票据有效期：超时即失效（手工批准也只用一次 / 10 分钟） */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;
/** 记录上限：超出丢最旧的已决记录，pending 优先保留 */
export const MAX_APPROVALS = 100;

/** 靶场/本机 shell 类工具：docker / adb 执行 */
const SHELL_TOOLS = new Set(['range_deploy', 'range_stop', 'android_launch']);
/** 侵入验证类工具 */
const INTRUSIVE_TOOLS = new Set(['verify_sqli', 'verify_ssrf', 'brute']);
/** 外部工具链里属于侵入级的工具（与 toolchain.ts 的 INTRUSIVE_TOOLS 同口径） */
const INTRUSIVE_TOOLCHAIN = new Set(['sqlmap', 'hydra']);

/**
 * 是否属于"高危动作"。返回 null = 不需要逐条审批。
 * ★ 只收"shell/脚本/侵入验证"三类；普通 active 扫描（portscan/webprobe/爬虫）不进这道门，
 *   否则每一步都弹审批，用户会关掉整个机制 —— 那比没有更糟。
 */
export function highRiskKind(tool: string, args: Record<string, unknown>): HighRiskKind | null {
  if (tool === 'toolchain' && String(args.action || '') === 'run') return 'shell';
  if (SHELL_TOOLS.has(tool)) return 'shell';
  if (INTRUSIVE_TOOLS.has(tool)) return 'intrusive';
  return null;
}

/** auto_review 档自动复核的**唯一**白名单：只读外部工具（不碰 sqlmap/hydra） */
export function autoReviewAllowed(tool: string, args: Record<string, unknown>): boolean {
  if (tool !== 'toolchain' || String(args.action || '') !== 'run') return false;
  const external = String(args.tool || '').trim().toLowerCase();
  return !!external && !INTRUSIVE_TOOLCHAIN.has(external);
}

/** 需要逐条审批吗（与档位无关，只看动作） */
export function requiresExecutionApproval(tool: string, args: Record<string, unknown>): boolean {
  return highRiskKind(tool, args) !== null;
}

/** 稳定序列化：忽略确认标记与内部字段，对象键排序，保证同一条动作哈希恒定 */
export function canonicalAction(tool: string, args: Record<string, unknown>): string {
  const ignore = new Set(['confirmed', '__sec_runner', '__submitted_by', '__approval']);
  const pick = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(pick);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        if (!ignore.has(k)) out[k] = pick((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  const target = normalizeTarget(String(args.target || args.domain || args.value || ''));
  // ★ 参数本身保持原样参与哈希（URL 的路径/查询串对 verify_sqli 等就是动作的一部分）；
  //   只对"键顺序"和 `confirmed` 这类非动作字段做归一。任何参数变化都必须重新批准。
  return JSON.stringify(pick({ tool, target, args }));
}

/** 动作内容哈希（16 位 hex，足够区分且便于界面展示） */
export function approvalHash(tool: string, args: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalAction(tool, args)).digest('hex').slice(0, 16);
}

/** 稳定 id：同一动作恒定，便于幂等与界面去重 */
export function approvalId(hash: string): string {
  return `apr-${hash.slice(0, 12)}`;
}

/** 给人看的动作摘要：说清"对什么、做什么"，不展开整段参数 */
export function describeAction(tool: string, args: Record<string, unknown>): string {
  const target = normalizeTarget(String(args.target || args.domain || args.value || ''));
  switch (tool) {
    case 'toolchain': {
      const ext = String(args.tool || '').trim();
      return `外部工具 ${ext || '(未指定)'} 执行${target ? ` · 目标 ${target}` : ''}`;
    }
    case 'range_deploy':
      return `部署靶场容器 ${String(args.template || '(未指定)')}${args.hostPort ? ` · 端口 ${args.hostPort}` : ''}`;
    case 'range_stop':
      return `停止靶场容器 ${String(args.name || '(未指定)')}`;
    case 'android_launch':
      return `启动 Android 模拟器 ${String(args.avd || '(未指定)')}`;
    case 'verify_sqli':
      return `SQL 注入验证${target ? ` · ${target}` : ''}`;
    case 'verify_ssrf':
      return `SSRF 验证${target ? ` · ${target}` : ''}`;
    case 'brute':
      return `默认口令自查${target ? ` · ${target}` : ''}`;
    default:
      return `${tool}${target ? ` · ${target}` : ''}`;
  }
}

function reasonOf(kind: HighRiskKind): string {
  return kind === 'intrusive'
    ? '侵入性验证会发送攻击性载荷，必须逐条人工批准'
    : 'shell / 容器 / 外部工具执行会在本机运行命令，必须逐条人工批准';
}

/** 新建一条待批准记录 */
export function makeApproval(
  tool: string,
  args: Record<string, unknown>,
  now = Date.now(),
): ExecutionApproval {
  const kind = highRiskKind(tool, args) || 'shell';
  const argsHash = approvalHash(tool, args);
  return {
    id: approvalId(argsHash),
    tool,
    kind,
    target: normalizeTarget(String(args.target || args.domain || args.value || '')),
    argsHash,
    summary: describeAction(tool, args),
    reason: reasonOf(kind),
    status: 'pending',
    requestedAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
  };
}

/** 把过期 pending 转成 expired（不删，保留最近记录供界面/审计查看） */
export function pruneApprovals(list: ExecutionApproval[], now = Date.now()): ExecutionApproval[] {
  return (Array.isArray(list) ? list : []).map((a) =>
    a.status === 'pending' && a.expiresAt < now ? { ...a, status: 'expired' as const } : a);
}

/** 按上限裁剪：pending 优先保留，其余按时间从旧到新丢 */
export function capApprovals(list: ExecutionApproval[]): ExecutionApproval[] {
  if (list.length <= MAX_APPROVALS) return list;
  const sorted = [...list].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return b.requestedAt - a.requestedAt;
  });
  return sorted.slice(0, MAX_APPROVALS);
}

export function findPending(list: ExecutionApproval[], hash: string): ExecutionApproval | null {
  return list.find((a) => a.argsHash === hash && a.status === 'pending') || null;
}

export interface TakeResult {
  hit: ExecutionApproval | null;
  rest: ExecutionApproval[];
}

/**
 * 取出并**消费**一张与动作哈希匹配的已决票。
 * ★ 批准/拒绝都一次性消费：同一张票不能给第二次执行背书。
 */
export function takeApproval(
  list: ExecutionApproval[],
  hash: string,
  now = Date.now(),
): TakeResult {
  const idx = list.findIndex((a) =>
    a.argsHash === hash && (a.status === 'approved' || a.status === 'rejected') && a.expiresAt >= now);
  if (idx < 0) {
    // 顺手清掉同一动作已过期的已决票（避免它以后被翻出来）
    const rest = list.filter((a) => !(a.argsHash === hash && a.expiresAt < now && (a.status === 'approved' || a.status === 'rejected')));
    return { hit: null, rest };
  }
  const hit = list[idx];
  return { hit, rest: list.filter((_, i) => i !== idx) };
}

export type DecideResult =
  | { ok: true; entry: ExecutionApproval; list: ExecutionApproval[] }
  | { ok: false; reason: string };

/** 人工决策：只有 pending 能批；批准/拒绝都绑定内容哈希，10 分钟过期 */
export function decideApproval(
  list: ExecutionApproval[],
  id: string,
  decision: 'approve' | 'reject',
  decidedBy: string,
  rejectReason?: string,
  now = Date.now(),
): DecideResult {
  const entry = list.find((a) => a.id === id);
  if (!entry) return { ok: false, reason: `没有 id 为 ${id} 的审批请求` };
  if (entry.status !== 'pending') {
    return { ok: false, reason: `审批 ${id} 当前状态为 ${entry.status}，不能重复决策。` };
  }
  const by = String(decidedBy || '').trim();
  if (!by) return { ok: false, reason: 'decidedBy 必填：审批必须可追溯到具体的人' };
  const decided: ExecutionApproval = {
    ...entry,
    status: decision === 'approve' ? 'approved' : 'rejected',
    decidedAt: now,
    decidedBy: by,
    // 人工批准后 10 分钟内原样重试有效；超时自动拒
    expiresAt: now + APPROVAL_TTL_MS,
  };
  if (decision === 'reject') {
    decided.rejectReason = String(rejectReason || '').trim() || '未说明原因';
  } else {
    delete decided.rejectReason;
  }
  return { ok: true, entry: decided, list: list.map((a) => (a.id === id ? decided : a)) };
}

/** 给模型的待批准回执：明确要求停下，不要改写参数或换工具绕过 */
export function pendingApprovalMessage(a: ExecutionApproval): string {
  return [
    '⏸ 高危动作需要人工逐条批准，尚未执行。',
    `动作：${a.summary}`,
    `审批 ID：${a.id}（内容哈希 ${a.argsHash}）`,
    '已提交到安全控制台「结果 → 执行审批」。',
    '请**停止**在此等待：不要改写参数重试、不要换用其它工具绕过、不要假定它已获批准。',
    '人工批准后，**原样**重新调用本工具即可执行（参数必须完全一致；一张批准票只用一次，10 分钟过期）。',
  ].join('\n');
}

/** 给模型的被拒绝回执 */
export function rejectedApprovalMessage(a: ExecutionApproval): string {
  return [
    '⛔ 该高危动作已被人工**拒绝**。',
    `动作：${a.summary}`,
    a.rejectReason ? `原因：${a.rejectReason}` : '原因：未说明',
    '不要换写法重试或改用其它工具绕过；如确需执行，请向用户说明必要性，由用户重新发起审批。',
  ].join('\n');
}

/** 审批门判定结果（withGuard 用） */
export type ApprovalGateResult =
  | { kind: 'none' | 'approved' }
  | { kind: 'auto'; via: 'auto_review' | 'full_access' }
  | { kind: 'pending'; approval: ExecutionApproval }
  | { kind: 'rejected'; approval: ExecutionApproval };

/**
 * 解析本次高危动作该不该放行。
 * ★ 纯逻辑部分（档位/哈希/匹配）与存储分离：调用方传入当前列表，返回新列表与判定。
 */
export function resolveApprovalGate(
  list: ExecutionApproval[],
  tool: string,
  args: Record<string, unknown>,
  mode: ApprovalMode,
  now = Date.now(),
): { result: ApprovalGateResult; list: ExecutionApproval[] } {
  if (!requiresExecutionApproval(tool, args)) return { result: { kind: 'none' }, list };
  const pruned = pruneApprovals(list, now);
  const effective: ApprovalMode = mode === 'auto_review' || mode === 'full_access' ? mode : 'ask';
  if (effective === 'full_access') return { result: { kind: 'auto', via: 'full_access' }, list: pruned };
  if (effective === 'auto_review' && autoReviewAllowed(tool, args)) {
    return { result: { kind: 'auto', via: 'auto_review' }, list: pruned };
  }

  const hash = approvalHash(tool, args);
  const taken = takeApproval(pruned, hash, now);
  if (taken.hit) {
    return {
      result: taken.hit.status === 'approved'
        ? { kind: 'approved' }
        : { kind: 'rejected', approval: taken.hit },
      list: taken.rest,
    };
  }
  const pending = findPending(taken.rest, hash);
  if (pending) return { result: { kind: 'pending', approval: pending }, list: taken.rest };

  const created = makeApproval(tool, args, now);
  return { result: { kind: 'pending', approval: created }, list: capApprovals([created, ...taken.rest]) };
}
