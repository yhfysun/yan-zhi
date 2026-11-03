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
    const v2 = buildRunbook(input, v1);
    store.save(v2);
    expect(store.list()[0]).toMatchObject({ id: v1.id, version: 2, name: '巡检脚本' });

    const run = store.createRun(v2, 'prod-web', 'approval-1');
    expect(run).toMatchObject({ runbookId: v1.id, runbookVersion: 2, status: 'running' });
    store.updateRun(run.id, {
      status: 'success',
      finishedAt: Date.now(),
      stepResults: [{ id: 's1', name: '检查', status: 'success', output: 'ok' }],
      rollbackResults: [],
    });
    expect(store.getRun(run.id)).toMatchObject({ status: 'success', runbookVersion: 2 });

    const stale = store.createRun(v2, 'prod-web');
    store.markInterruptedRuns();
    expect(store.getRun(stale.id)?.status).toBe('failed');
    db.close();
  });
});
