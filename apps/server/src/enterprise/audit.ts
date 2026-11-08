import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { db } from '../db.js';
import './schema.js';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  method?: string | null;
  path?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  traceId?: string | null;
}

function safeJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

export function recordAdminAudit(input: AuditInput): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO admin_audit
      (id, actor_user_id, action, resource_type, resource_id, method, path,
       before_json, after_json, ip, trace_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.actorUserId || null,
    input.action,
    input.resourceType || null,
    input.resourceId || null,
    input.method || null,
    input.path || null,
    safeJson(input.before),
    safeJson(input.after),
    input.ip || null,
    input.traceId || null,
    Date.now(),
  );
  return id;
}

export function auditRequest(
  req: Request,
  action: string,
  opts: {
    resourceType?: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
  } = {},
): string {
  return recordAdminAudit({
    actorUserId: (req as any).realUser?.userId || req.user?.userId,
    action,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    method: req.method,
    path: req.originalUrl,
    before: opts.before,
    after: opts.after,
    ip: req.ip,
    traceId: String((req.headers['x-request-id'] || req.headers['traceparent'] || '') || '') || null,
  });
}

export function listAdminAudit(opts: {
  limit?: number;
  offset?: number;
  actorUserId?: string;
  resourceType?: string;
  action?: string;
} = {}): { items: any[]; total: number } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.actorUserId) { where.push('actor_user_id = ?'); args.push(opts.actorUserId); }
  if (opts.resourceType) { where.push('resource_type = ?'); args.push(opts.resourceType); }
  if (opts.action) { where.push('action = ?'); args.push(opts.action); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 500));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const items = db.prepare(
    `SELECT * FROM admin_audit ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(...args, limit, offset) as any[];
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM admin_audit ${clause}`).get(...args) as any)?.n || 0);
  return {
    total,
    items: items.map((r) => ({
      ...r,
      before: r.before_json ? safeParse(r.before_json) : null,
      after: r.after_json ? safeParse(r.after_json) : null,
    })),
  };
}

function safeParse(v: string): unknown {
  try { return JSON.parse(v); } catch { return null; }
}
