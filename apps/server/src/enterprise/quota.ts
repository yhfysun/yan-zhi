import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import './schema.js';

export type QuotaPeriod = 'day' | 'week' | 'month';
export type QuotaSubjectType = 'user' | 'org';

export interface QuotaStatus {
  allowed: boolean;
  policy: any | null;
  account: any | null;
  usedCny: number;
  limitCny: number | null;
  remainingCny: number | null;
}

function periodRange(period: QuotaPeriod, at = Date.now()): { start: number; end: number } {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
  } else if (period === 'month') {
    d.setDate(1);
  }
  const start = d.getTime();
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return { start, end: d.getTime() };
}

function periodRank(period: string): number {
  return period === 'month' ? 3 : period === 'week' ? 2 : 1;
}

function orgChain(userId: string): Array<{ id: string; depth: number }> {
  const direct = db.prepare('SELECT org_id FROM user_org WHERE user_id = ?').all(userId) as Array<{ org_id: string }>;
  const out = new Map<string, number>();
  for (const { org_id } of direct) {
    let cursor: string | null = org_id;
    let depth = 0;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const current = out.get(cursor);
      if (current === undefined || depth < current) out.set(cursor, depth);
      const row = db.prepare('SELECT parent_id FROM org WHERE id = ?').get(cursor) as { parent_id?: string | null } | undefined;
      cursor = row?.parent_id || null;
      depth += 1;
    }
  }
  return [...out.entries()].map(([id, depth]) => ({ id, depth })).sort((a, b) => a.depth - b.depth);
}

export function resolveEffectiveQuotaPolicy(userId: string): any | null {
  const direct = db.prepare(
    'SELECT * FROM quota_policy WHERE subject_type = ? AND subject_id = ? AND enabled = 1',
  ).all('user', userId) as any[];
  if (direct.length) return direct.sort((a, b) => periodRank(b.period) - periodRank(a.period))[0];
  for (const org of orgChain(userId)) {
    const policies = db.prepare(
      'SELECT * FROM quota_policy WHERE subject_type = ? AND subject_id = ? AND enabled = 1',
    ).all('org', org.id) as any[];
    if (policies.length) return policies.sort((a, b) => periodRank(b.period) - periodRank(a.period))[0];
  }
  return null;
}

export function ensureQuotaAccount(policy: any, at = Date.now()): any {
  const period = (policy.period === 'day' || policy.period === 'week' || policy.period === 'month')
    ? policy.period as QuotaPeriod : 'month';
  const range = periodRange(period, at);
  const existing = db.prepare(
    `SELECT * FROM quota_account
      WHERE subject_type = ? AND subject_id = ? AND period = ? AND period_start = ?`,
  ).get(policy.subject_type, policy.subject_id, period, range.start) as any;
  if (existing) {
    if (Number(existing.limit_cny) !== Number(policy.limit_cny)) {
      db.prepare('UPDATE quota_account SET policy_id = ?, limit_cny = ?, updated_at = ? WHERE id = ?')
        .run(policy.id, Number(policy.limit_cny), Date.now(), existing.id);
      return db.prepare('SELECT * FROM quota_account WHERE id = ?').get(existing.id);
    }
    return existing;
  }
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO quota_account
      (id, policy_id, subject_type, subject_id, period, period_start, period_end,
       limit_cny, used_cny, reserved_cny, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?)`,
  ).run(
    id, policy.id, policy.subject_type, policy.subject_id, period,
    range.start, range.end, Number(policy.limit_cny), now,
  );
  return db.prepare('SELECT * FROM quota_account WHERE id = ?').get(id);
}

export function getQuotaStatus(userId: string, at = Date.now()): QuotaStatus {
  const policy = resolveEffectiveQuotaPolicy(userId);
  if (!policy) {
    return { allowed: true, policy: null, account: null, usedCny: 0, limitCny: null, remainingCny: null };
  }
  const account = ensureQuotaAccount(policy, at);
  const used = Number(account.used_cny || 0) + Number(account.reserved_cny || 0);
  const limit = Number(account.limit_cny || 0);
  return {
    allowed: used < limit,
    policy,
    account,
    usedCny: Number(account.used_cny || 0),
    limitCny: limit,
    remainingCny: Math.max(0, limit - used),
  };
}

export function quotaGuardMessage(userId: string): string | null {
  const s = getQuotaStatus(userId);
  if (s.allowed) return null;
  return `团队额度已用尽：已用 ¥${s.usedCny.toFixed(4)} / 上限 ¥${Number(s.limitCny || 0).toFixed(2)}`;
}

export function recordQuotaUsage(
  userId: string | undefined,
  amountCny: number,
  ref: { type?: string; id?: string; note?: string } = {},
): void {
  if (!userId || userId === 'guest' || !Number.isFinite(amountCny) || amountCny <= 0) return;
  const policy = resolveEffectiveQuotaPolicy(userId);
  if (!policy) return;
  const account = ensureQuotaAccount(policy);
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE quota_account SET used_cny = used_cny + ?, updated_at = ? WHERE id = ?',
    ).run(amountCny, now, account.id);
    db.prepare(
      `INSERT INTO credit_entry
        (id, account_id, kind, amount_cny, frozen_cny, ref_type, ref_id, note, created_at)
       VALUES (?, ?, 'consume', ?, 0, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), account.id, amountCny,
      ref.type || null, ref.id || null, ref.note || null, now,
    );
  });
  tx();
}

export function upsertQuotaPolicy(input: {
  id?: string;
  subjectType: QuotaSubjectType;
  subjectId: string;
  period?: QuotaPeriod;
  limitCny: number;
  enabled?: boolean;
}): any {
  const subjectType = input.subjectType === 'org' ? 'org' : 'user';
  const subjectId = String(input.subjectId || '').trim();
  if (!subjectId) throw new Error('额度对象不能为空');
  const exists = subjectType === 'user'
    ? db.prepare('SELECT 1 FROM user WHERE id = ?').get(subjectId)
    : db.prepare('SELECT 1 FROM org WHERE id = ?').get(subjectId);
  if (!exists) throw new Error(subjectType === 'user' ? '用户不存在' : '组织不存在');
  const period: QuotaPeriod = input.period === 'day' || input.period === 'week' ? input.period : 'month';
  const limit = Number(input.limitCny);
  if (!Number.isFinite(limit) || limit < 0) throw new Error('额度必须为非负数字');
  const now = Date.now();
  const existing = db.prepare(
    'SELECT * FROM quota_policy WHERE subject_type = ? AND subject_id = ? AND period = ?',
  ).get(subjectType, subjectId, period) as any;
  const id = input.id || existing?.id || randomUUID();
  if (existing) {
    db.prepare(
      'UPDATE quota_policy SET limit_cny = ?, enabled = ?, updated_at = ? WHERE id = ?',
    ).run(limit, input.enabled === false ? 0 : 1, now, id);
  } else {
    db.prepare(
      `INSERT INTO quota_policy
        (id, subject_type, subject_id, period, limit_cny, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, subjectType, subjectId, period, limit, input.enabled === false ? 0 : 1, now, now);
  }
  return db.prepare('SELECT * FROM quota_policy WHERE id = ?').get(id);
}

export function deleteQuotaPolicy(id: string): boolean {
  return db.prepare('DELETE FROM quota_policy WHERE id = ?').run(id).changes > 0;
}

export function listQuotaPolicies(): any[] {
  return db.prepare(
    `SELECT p.*,
            CASE p.subject_type
              WHEN 'user' THEN (SELECT username FROM user WHERE id = p.subject_id)
              ELSE (SELECT name FROM org WHERE id = p.subject_id)
            END AS subject_name
       FROM quota_policy p
      ORDER BY p.subject_type, p.subject_id, p.period`,
  ).all();
}

export function listQuotaAccounts(limit = 200): any[] {
  return db.prepare(
    `SELECT a.*,
            CASE a.subject_type
              WHEN 'user' THEN (SELECT username FROM user WHERE id = a.subject_id)
              ELSE (SELECT name FROM org WHERE id = a.subject_id)
            END AS subject_name
       FROM quota_account a
      ORDER BY a.period_start DESC, a.updated_at DESC
      LIMIT ?`,
  ).all(Math.max(1, Math.min(Number(limit) || 200, 1000)));
}

export function resetQuotaAccount(accountId: string, note = '管理员重置'): any {
  const row = db.prepare('SELECT * FROM quota_account WHERE id = ?').get(accountId) as any;
  if (!row) throw new Error('额度账户不存在');
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare("UPDATE quota_account SET used_cny = 0, reserved_cny = 0, status = 'active', updated_at = ? WHERE id = ?")
      .run(now, accountId);
    db.prepare(
      `INSERT INTO credit_entry
        (id, account_id, kind, amount_cny, frozen_cny, ref_type, ref_id, note, created_at)
       VALUES (?, ?, 'reset', 0, 0, 'manual', NULL, ?, ?)`,
    ).run(randomUUID(), accountId, note, now);
  });
  tx();
  return db.prepare('SELECT * FROM quota_account WHERE id = ?').get(accountId);
}

export function quotaAccountEntries(accountId: string, limit = 200): any[] {
  return db.prepare(
    'SELECT * FROM credit_entry WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(accountId, Math.max(1, Math.min(Number(limit) || 200, 1000)));
}

export function primaryOrgOfUser(userId: string): string | null {
  return (db.prepare('SELECT org_id FROM user_org WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId) as any)?.org_id || null;
}
