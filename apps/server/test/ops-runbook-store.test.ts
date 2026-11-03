import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { buildRunbook, normalizeRunbookInput } from '../src/plugins/ops-runbook.js';
import { createOpsRunbookStore } from '../src/plugins/ops-runbook-store.js';

describe('ops runbook store', () => {
  it('版本递增、快照运行记录和中断恢复状态可落库', () => {
    const db = new Database(':memory:');
    const store = createOpsRunbookStore(db);
    store.ensureSchema();
    const input = normalizeRunbookInput({
      name: '巡检脚本', connectionId: 'c1',
      steps: [{ type: 'exec', name: '检查', command: 'uptime' }],
    }).value!;
    const v1 = buildRunbook(input);
    store.save(v1);
    const v2Input = normalizeRunbookInput({
      name: '巡检脚本 v2', connectionId: 'c1',
      steps: [{ type: 'exec', name: '检查', command: 'uptime -p' }],
    }).value!;
    const v2 = buildRunbook(v2Input, v1);
    store.save(v2);
    expect(store.list()[0]).toMatchObject({ id: v1.id, version: 2, name: '巡检脚本 v2' });
    expect(store.listVersions(v1.id).map((item) => item.version)).toEqual([2, 1]);
    expect(store.getVersion(v1.id, 1)?.snapshot).toMatchObject({
      name: '巡检脚本',
      version: 1,
      steps: [{ command: 'uptime' }],
    });
    db.exec('DELETE FROM ops_runbook_version');
    store.ensureSchema();
    expect(store.listVersions(v1.id).map((item) => item.version)).toEqual([2]);

    const run = store.createRun(v2, 'prod-web', 'approval-1', { service: 'api' }, 'st-1');
    expect(run).toMatchObject({
      runbookId: v1.id, runbookVersion: 2, status: 'running',
      inputParams: { service: 'api' }, scheduledTaskId: 'st-1',
    });
    store.updateRun(run.id, {
      status: 'success',
      finishedAt: Date.now(),
      stepResults: [{ id: 's1', name: '检查', status: 'success', output: 'ok' }],
      rollbackResults: [],
    });
    expect(store.getRun(run.id)).toMatchObject({ status: 'success', runbookVersion: 2 });
    expect(store.getLatestRunByScheduledTask('st-1')).toMatchObject({
      id: run.id,
      status: 'success',
      scheduledTaskId: 'st-1',
    });

    const stale = store.createRun(v2, 'prod-web');
    store.markInterruptedRuns();
    expect(store.getRun(stale.id)?.status).toBe('failed');
    db.close();
  });
});
