import {
  type OpsRunbook,
  type OpsRunbookRun,
  type OpsRunbookRunStatus,
  type OpsRunbookStepResult,
} from './ops-runbook.js';

interface Statement {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}

export interface RunbookDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): Statement;
}

export interface OpsRunbookVersion {
  runbookId: string;
  version: number;
  snapshot: OpsRunbook;
  createdAt: number;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    const value = JSON.parse(String(raw || ''));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function createOpsRunbookStore(database: RunbookDatabase) {
  const ensureSchema = () => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ops_runbook (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        connection_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        parameters_json TEXT NOT NULL DEFAULT '[]',
        steps_json TEXT NOT NULL,
        rollback_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ops_runbook_updated ON ops_runbook(updated_at DESC);
      CREATE TABLE IF NOT EXISTS ops_runbook_version (
        runbook_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(runbook_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_ops_runbook_version_created
        ON ops_runbook_version(runbook_id, version DESC);
      CREATE TABLE IF NOT EXISTS ops_runbook_run (
        id TEXT PRIMARY KEY,
        runbook_id TEXT NOT NULL,
        runbook_name TEXT NOT NULL,
        runbook_version INTEGER NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        status TEXT NOT NULL,
        approval_id TEXT,
        scheduled_task_id TEXT,
        input_params_json TEXT NOT NULL DEFAULT '{}',
        snapshot_json TEXT NOT NULL,
        step_results_json TEXT NOT NULL DEFAULT '[]',
        rollback_results_json TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_ops_runbook_run_started ON ops_runbook_run(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ops_runbook_run_active ON ops_runbook_run(runbook_id, status);
    `);
    for (const sql of [
      "ALTER TABLE ops_runbook ADD COLUMN parameters_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE ops_runbook_run ADD COLUMN input_params_json TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE ops_runbook_run ADD COLUMN scheduled_task_id TEXT",
    ]) {
      try { database.exec(sql); } catch { /* 列已存在 */ }
    }
    const rows = database.prepare('SELECT * FROM ops_runbook').all() as any[];
    for (const row of rows) recordVersion(rowToRunbook(row));
  };

  const rowToRunbook = (row: any): OpsRunbook => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    connectionId: row.connection_id,
    enabled: row.enabled === 1,
    version: row.version,
    parameters: parseJson(row.parameters_json, []),
    steps: parseJson(row.steps_json, []),
    rollbackSteps: parseJson(row.rollback_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const rowToRun = (row: any): OpsRunbookRun => ({
    id: row.id,
    runbookId: row.runbook_id,
    runbookName: row.runbook_name,
    runbookVersion: row.runbook_version,
    connectionId: row.connection_id,
    connectionName: row.connection_name,
    status: row.status as OpsRunbookRunStatus,
    approvalId: row.approval_id || undefined,
    scheduledTaskId: row.scheduled_task_id || undefined,
    inputParams: parseJson(row.input_params_json, {}),
    snapshot: parseJson(row.snapshot_json, {} as OpsRunbook),
    stepResults: parseJson(row.step_results_json, []),
    rollbackResults: parseJson(row.rollback_results_json, []),
    error: row.error || undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at || undefined,
  });

  const rowToVersion = (row: any): OpsRunbookVersion => ({
    runbookId: row.runbook_id,
    version: row.version,
    snapshot: parseJson(row.snapshot_json, {} as OpsRunbook),
    createdAt: row.created_at,
  });

  function recordVersion(runbook: OpsRunbook) {
    database.prepare(`
      INSERT OR IGNORE INTO ops_runbook_version
        (runbook_id, version, snapshot_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(runbook.id, runbook.version, JSON.stringify(runbook), runbook.updatedAt);
  }

  const list = (): OpsRunbook[] => (database.prepare('SELECT * FROM ops_runbook ORDER BY updated_at DESC').all() as any[])
    .map(rowToRunbook);
  const get = (id: string): OpsRunbook | null => {
    const row = database.prepare('SELECT * FROM ops_runbook WHERE id=?').get(id) as any;
    return row ? rowToRunbook(row) : null;
  };
  const save = (runbook: OpsRunbook) => {
    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO ops_runbook
          (id, name, description, connection_id, enabled, version, parameters_json, steps_json, rollback_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          description=excluded.description,
          connection_id=excluded.connection_id,
          enabled=excluded.enabled,
          version=excluded.version,
          parameters_json=excluded.parameters_json,
          steps_json=excluded.steps_json,
          rollback_json=excluded.rollback_json,
          updated_at=excluded.updated_at
      `).run(
        runbook.id, runbook.name, runbook.description || null, runbook.connectionId,
        runbook.enabled ? 1 : 0, runbook.version, JSON.stringify(runbook.parameters),
        JSON.stringify(runbook.steps),
        JSON.stringify(runbook.rollbackSteps), runbook.createdAt, runbook.updatedAt,
      );
      recordVersion(runbook);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };
  const remove = (id: string): boolean => {
    database.exec('BEGIN');
    try {
      database.prepare('DELETE FROM ops_runbook_version WHERE runbook_id=?').run(id);
      const result = database.prepare('DELETE FROM ops_runbook WHERE id=?').run(id) as { changes?: number };
      database.exec('COMMIT');
      return (result.changes || 0) > 0;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };
  const listVersions = (runbookId: string): OpsRunbookVersion[] => (
    database.prepare(
      'SELECT * FROM ops_runbook_version WHERE runbook_id=? ORDER BY version DESC',
    ).all(runbookId) as any[]
  ).map(rowToVersion);
  const getVersion = (runbookId: string, version: number): OpsRunbookVersion | null => {
    const row = database.prepare(
      'SELECT * FROM ops_runbook_version WHERE runbook_id=? AND version=?',
    ).get(runbookId, version) as any;
    return row ? rowToVersion(row) : null;
  };

  const createRun = (
    runbook: OpsRunbook,
    connectionName: string,
    approvalId?: string,
    inputParams: Record<string, string> = {},
    scheduledTaskId?: string,
  ): OpsRunbookRun => {
    const run: OpsRunbookRun = {
      id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      runbookId: runbook.id,
      runbookName: runbook.name,
      runbookVersion: runbook.version,
      connectionId: runbook.connectionId,
      connectionName,
      status: 'running',
      approvalId,
      scheduledTaskId,
      inputParams,
      snapshot: JSON.parse(JSON.stringify(runbook)),
      stepResults: [],
      rollbackResults: [],
      startedAt: Date.now(),
    };
    database.prepare(`
      INSERT INTO ops_runbook_run
        (id, runbook_id, runbook_name, runbook_version, connection_id, connection_name, status,
         approval_id, scheduled_task_id, input_params_json, snapshot_json, step_results_json, rollback_results_json, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?)
    `).run(
      run.id, run.runbookId, run.runbookName, run.runbookVersion, run.connectionId,
      run.connectionName, run.status, run.approvalId || null, run.scheduledTaskId || null,
      JSON.stringify(run.inputParams),
      JSON.stringify(run.snapshot), run.startedAt,
    );
    return run;
  };

  const updateRun = (id: string, patch: {
    status: OpsRunbookRunStatus;
    stepResults: OpsRunbookStepResult[];
    rollbackResults: OpsRunbookStepResult[];
    error?: string;
    finishedAt?: number;
  }) => {
    database.prepare(`
      UPDATE ops_runbook_run SET
        status=?, step_results_json=?, rollback_results_json=?, error=?, finished_at=?
      WHERE id=?
    `).run(
      patch.status, JSON.stringify(patch.stepResults), JSON.stringify(patch.rollbackResults),
      patch.error || null, patch.finishedAt || null, id,
    );
  };

  const getRun = (id: string): OpsRunbookRun | null => {
    const row = database.prepare('SELECT * FROM ops_runbook_run WHERE id=?').get(id) as any;
    return row ? rowToRun(row) : null;
  };

  const listRuns = (runbookId?: string, limit = 50): OpsRunbookRun[] => {
    const n = Math.max(1, Math.min(200, Math.floor(limit) || 50));
    const rows = runbookId
      ? database.prepare('SELECT * FROM ops_runbook_run WHERE runbook_id=? ORDER BY started_at DESC LIMIT ?').all(runbookId, n)
      : database.prepare('SELECT * FROM ops_runbook_run ORDER BY started_at DESC LIMIT ?').all(n);
    return (rows as any[]).map(rowToRun);
  };

  const hasRunning = (runbookId: string): boolean => (
    database.prepare("SELECT 1 FROM ops_runbook_run WHERE runbook_id=? AND status='running' LIMIT 1").get(runbookId)
  ) != null;

  const markInterruptedRuns = (): number => {
    const result = database.prepare(`
      UPDATE ops_runbook_run SET status='failed', error='服务重启，运行已中断', finished_at=?
      WHERE status='running'
    `).run(Date.now()) as { changes?: number };
    return result.changes || 0;
  };

  return {
    ensureSchema,
    list,
    get,
    save,
    remove,
    listVersions,
    getVersion,
    createRun,
    updateRun,
    getRun,
    listRuns,
    hasRunning,
    markInterruptedRuns,
  };
}
