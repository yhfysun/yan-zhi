import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { aclExistsSql } from '../services/resource-acl.js';
import './schema.js';

export type DesignResourceKind = 'template' | 'style' | 'design-system' | 'direction';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function view(row: any) {
  if (!row) return null;
  return {
    ...row,
    content: parseJson(row.content_json, {}),
    tags: parseJson(row.tags_json, []),
    is_public: !!row.is_public,
    enabled: !!row.enabled,
    content_json: undefined,
    tags_json: undefined,
  };
}

export function listDesignResources(opts: { userId?: string; all?: boolean; kind?: string } = {}): any[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (!opts.all && opts.userId) {
    where.push(`(owner_user_id = ? OR is_public = 1 OR owner_user_id IS NULL OR ${aclExistsSql('design', 'design_resource.id')})`);
    args.push(opts.userId, opts.userId, opts.userId, opts.userId);
  }
  if (opts.kind) { where.push('kind = ?'); args.push(opts.kind); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(
    `SELECT * FROM design_resource ${clause} ORDER BY enabled DESC, kind ASC, name ASC`,
  ).all(...args).map(view);
}

export function createDesignResource(userId: string, input: Record<string, any>): any {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('设计资源名称不能为空');
  const id = randomUUID();
  const now = Date.now();
  const kind: DesignResourceKind = ['template', 'style', 'design-system', 'direction'].includes(String(input.kind))
    ? input.kind : 'template';
  db.prepare(
    `INSERT INTO design_resource
      (id, owner_user_id, kind, name, description, content_json, preview_url,
       tags_json, is_public, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, userId, kind, name, input.description || null,
    JSON.stringify(input.content || {}), input.previewUrl || null,
    JSON.stringify(input.tags || []), input.isPublic ? 1 : 0,
    input.enabled === false ? 0 : 1, now, now,
  );
  return view(db.prepare('SELECT * FROM design_resource WHERE id = ?').get(id));
}

export function updateDesignResource(userId: string, id: string, input: Record<string, any>): any {
  const row = db.prepare('SELECT * FROM design_resource WHERE id = ?').get(id) as any;
  if (!row) throw new Error('设计资源不存在');
  if (row.owner_user_id && row.owner_user_id !== userId) throw new Error('无权修改该设计资源');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (input.kind !== undefined) put('kind', input.kind);
  if (input.name !== undefined) put('name', String(input.name).trim());
  if (input.description !== undefined) put('description', input.description || null);
  if (input.content !== undefined) put('content_json', JSON.stringify(input.content || {}));
  if (input.previewUrl !== undefined) put('preview_url', input.previewUrl || null);
  if (input.tags !== undefined) put('tags_json', JSON.stringify(input.tags || []));
  if (input.isPublic !== undefined) put('is_public', input.isPublic ? 1 : 0);
  if (input.enabled !== undefined) put('enabled', input.enabled ? 1 : 0);
  if (!sets.length) return view(row);
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE design_resource SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return view(db.prepare('SELECT * FROM design_resource WHERE id = ?').get(id));
}

export function deleteDesignResource(userId: string, id: string): void {
  const row = db.prepare('SELECT owner_user_id FROM design_resource WHERE id = ?').get(id) as any;
  if (!row) throw new Error('设计资源不存在');
  if (row.owner_user_id && row.owner_user_id !== userId) throw new Error('无权删除该设计资源');
  db.prepare('DELETE FROM design_resource WHERE id = ?').run(id);
}
