import { randomUUID } from 'node:crypto';
import type {
  AutomationRunRecord,
  AutomationRunStatus,
  AutomationScriptDraft,
  AutomationScriptRecord,
  AutomationScriptStatus,
  AutomationStepResult,
} from '@yan-zhi/shared';
import { validateAutomationScriptDraft } from '@yan-zhi/shared';
import { db } from '../db.js';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function runRowToRecord(row: any): AutomationRunRecord {
  return {
    id: String(row.id),
    scriptId: String(row.script_id),
    scriptName: String(row.script_name || row.script_id),
    scriptVersion: Number(row.script_version),
    userId: String(row.user_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    status: String(row.status) as AutomationRunStatus,
    triggerType: String(row.trigger_type || 'manual'),
    input: parseJson<Record<string, unknown>>(row.input_json, {}),
    steps: parseJson<AutomationStepResult[]>(row.steps_json, []),
    checkpoint: parseJson<unknown>(row.checkpoint_json, null),
    error: row.error ? String(row.error) : null,
    startedAt: row.started_at == null ? null : Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    createdAt: Number(row.created_at),
  };
}

function rowToScript(row: any, snapshot?: AutomationScriptDraft, versionOverride?: number): AutomationScriptRecord {
  const script = snapshot || parseJson<AutomationScriptDraft>(row.script_json, row.script_json);
  const version = versionOverride ?? Number(row.current_version);
  const publishedVersion = row.published_version == null ? null : Number(row.published_version);
  const status: AutomationScriptStatus =
    versionOverride != null && versionOverride === publishedVersion
      ? 'published'
      : versionOverride != null
        ? 'draft'
        : (String(row.status) as AutomationScriptStatus);
  let lastRun: AutomationScriptRecord['lastRun'] = null;
  try {
    const latest = db.prepare(
      'SELECT id, script_id, script_name, script_version, status, trigger_type, error, started_at, finished_at, created_at FROM automation_run WHERE script_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(row.id, row.user_id) as any;
    if (latest) {
      lastRun = {
        id: String(latest.id),
        scriptId: String(latest.script_id),
        scriptName: String(latest.script_name),
        scriptVersion: Number(latest.script_version),
        status: String(latest.status) as AutomationRunStatus,
        triggerType: String(latest.trigger_type || 'manual'),
        error: latest.error ? String(latest.error) : null,
        startedAt: latest.started_at == null ? null : Number(latest.started_at),
        finishedAt: latest.finished_at == null ? null : Number(latest.finished_at),
        createdAt: Number(latest.created_at),
      };
    }
  } catch {
    lastRun = null;
  }
  return {
    ...script,
    id: String(row.id),
    userId: String(row.user_id),
    status,
    version,
    publishedVersion,
    lastRun,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function assertValid(input: unknown): AutomationScriptDraft {
  const result = validateAutomationScriptDraft(input);
  if (!result.ok) throw new Error(`自动化脚本校验失败：${result.errors.join('；')}`);
  return result.value;
}

function insertVersion(scriptId: string, version: number, script: AutomationScriptDraft, userId: string, now: number): void {
  db.prepare(
    'INSERT OR REPLACE INTO automation_script_version (script_id, version, snapshot_json, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(scriptId, version, JSON.stringify(script), userId, now);
}

export function createAutomationScript(userId: string, input: unknown): AutomationScriptRecord {
  const script = assertValid(input);
  const id = `auto_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO automation_script
        (id, user_id, name, description, kind, status, current_version, published_version,
         script_json, permissions_json, approval_policy_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', 1, NULL, ?, '{}', '{}', ?, ?)
    `).run(
      id,
      userId,
      script.name,
      script.description || null,
      script.kind,
      JSON.stringify(script),
      now,
      now,
    );
    insertVersion(id, 1, script, userId, now);
  });
  tx();
  return getAutomationScript(userId, id)!;
}

export function updateAutomationScript(userId: string, id: string, input: unknown): AutomationScriptRecord {
  const script = assertValid(input);
  const existing = db.prepare('SELECT * FROM automation_script WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!existing) throw new Error('自动化脚本不存在');
  const version = Number(existing.current_version) + 1;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE automation_script SET
        name = ?, description = ?, kind = ?, status = 'draft', current_version = ?,
        script_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      script.name,
      script.description || null,
      script.kind,
      version,
      JSON.stringify(script),
      now,
      id,
      userId,
    );
    insertVersion(id, version, script, userId, now);
  });
  tx();
  return getAutomationScript(userId, id)!;
}

export function publishAutomationScript(userId: string, id: string): AutomationScriptRecord {
  const existing = db.prepare('SELECT * FROM automation_script WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!existing) throw new Error('自动化脚本不存在');
  const version = Number(existing.current_version);
  const snapshot = db.prepare(
    'SELECT snapshot_json FROM automation_script_version WHERE script_id = ? AND version = ?',
  ).get(id, version) as any;
  if (!snapshot) throw new Error('自动化脚本当前版本快照不存在');
  const now = Date.now();
  db.prepare(`
    UPDATE automation_script SET status = 'published', published_version = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(version, now, id, userId);
  return getAutomationScript(userId, id)!;
}

export function getAutomationScript(
  userId: string,
  id: string,
  opts: { version?: number } = {},
): AutomationScriptRecord | null {
  const row = db.prepare('SELECT * FROM automation_script WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) return null;
  if (opts.version == null) return rowToScript(row);
  const versionRow = db.prepare(
    'SELECT version, snapshot_json FROM automation_script_version WHERE script_id = ? AND version = ?',
  ).get(id, opts.version) as any;
  if (!versionRow) return null;
  const snapshot = parseJson<AutomationScriptDraft>(versionRow.snapshot_json, row.script_json);
  return rowToScript(row, snapshot, Number(versionRow.version));
}

export function listAutomationScripts(userId: string): AutomationScriptRecord[] {
  const rows = db.prepare(
    'SELECT * FROM automation_script WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC',
  ).all(userId) as any[];
  return rows.map((row) => rowToScript(row));
}

export function deleteAutomationScript(userId: string, id: string): boolean {
  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM automation_script_version WHERE script_id IN (SELECT id FROM automation_script WHERE id = ? AND user_id = ?)',
    ).run(id, userId);
    return db.prepare('DELETE FROM automation_script WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  });
  return tx();
}

export interface CreateAutomationRunInput {
  userId: string;
  scriptId: string;
  scriptVersion: number;
  conversationId?: string;
  triggerType?: string;
  input?: Record<string, unknown>;
}

export function createAutomationRunRecord(input: CreateAutomationRunInput): AutomationRunRecord {
  const versioned = getAutomationScript(input.userId, input.scriptId, { version: input.scriptVersion });
  if (!versioned) throw new Error('自动化脚本版本不存在');
  const id = `autorun_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO automation_run
      (id, script_id, script_version, script_name, user_id, conversation_id, trigger_type,
       status, input_json, steps_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, '[]', ?, ?)
  `).run(
    id,
    input.scriptId,
    input.scriptVersion,
    versioned.name,
    input.userId,
    input.conversationId || null,
    input.triggerType || 'manual',
    JSON.stringify(input.input || {}),
    now,
    now,
  );
  return getAutomationRun(input.userId, id)!;
}

export function updateAutomationRun(
  userId: string,
  runId: string,
  patch: {
    status?: AutomationRunStatus;
    steps?: AutomationStepResult[];
    result?: unknown;
    checkpoint?: unknown;
    error?: string | null;
    startedAt?: number | null;
    finishedAt?: number | null;
  },
): AutomationRunRecord {
  const existing = db.prepare('SELECT * FROM automation_run WHERE id = ? AND user_id = ?').get(runId, userId) as any;
  if (!existing) throw new Error('自动化运行不存在');
  const now = Date.now();
  db.prepare(`
    UPDATE automation_run SET
      status = ?, steps_json = ?, result_json = ?, checkpoint_json = ?, error = ?,
      started_at = ?, finished_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.status || existing.status,
    JSON.stringify(patch.steps ?? parseJson(existing.steps_json, [])),
    patch.result === undefined ? existing.result_json : JSON.stringify(patch.result),
    patch.checkpoint === undefined ? existing.checkpoint_json : JSON.stringify(patch.checkpoint),
    patch.error === undefined ? existing.error : patch.error,
    patch.startedAt === undefined ? existing.started_at : patch.startedAt,
    patch.finishedAt === undefined ? existing.finished_at : patch.finishedAt,
    now,
    runId,
    userId,
  );
  return getAutomationRun(userId, runId)!;
}

export function getAutomationRun(userId: string, runId: string): AutomationRunRecord | null {
  const row = db.prepare('SELECT * FROM automation_run WHERE id = ? AND user_id = ?').get(runId, userId) as any;
  return row ? runRowToRecord(row) : null;
}

export function listAutomationRuns(userId: string, scriptId?: string, limit = 50): AutomationRunRecord[] {
  const capped = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = scriptId
    ? db.prepare(
        'SELECT * FROM automation_run WHERE user_id = ? AND script_id = ? ORDER BY created_at DESC LIMIT ?',
      ).all(userId, scriptId, capped) as any[]
    : db.prepare(
        'SELECT * FROM automation_run WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      ).all(userId, capped) as any[];
  return rows.map(runRowToRecord);
}

export function appendAutomationRunEvent(
  runId: string,
  type: string,
  payload: unknown,
): number {
  const row = db.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM automation_run_event WHERE run_id = ?',
  ).get(runId) as any;
  const seq = Number(row?.seq || 0) + 1;
  db.prepare(
    'INSERT INTO automation_run_event (run_id, seq, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(runId, seq, type, JSON.stringify(payload ?? null), Date.now());
  return seq;
}

export function listAutomationRunEvents(runId: string, since = 0): Array<{
  seq: number;
  type: string;
  payload: unknown;
  createdAt: number;
}> {
  const rows = db.prepare(
    'SELECT seq, type, payload_json, created_at FROM automation_run_event WHERE run_id = ? AND seq > ? ORDER BY seq ASC',
  ).all(runId, Math.max(0, since)) as any[];
  return rows.map((row) => ({
    seq: Number(row.seq),
    type: String(row.type),
    payload: parseJson(row.payload_json, null),
    createdAt: Number(row.created_at),
  }));
}
