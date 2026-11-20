import { describe, expect, it } from 'vitest';
import { createExecutionReceipt } from '@yan-zhi/shared';
import { listExecutionCheckpoints, recordExecutionCheckpoint } from '../src/services/execution-checkpoints';

describe('execution checkpoints', () => {
  it('persists revision and evidence receipts by task', () => {
    const taskId = `task_ck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const receipt = createExecutionReceipt({
      target: 'browser',
      action: 'browser_click',
      ok: true,
      beforeRevision: 'state-a',
      afterRevision: 'state-b',
      changed: true,
      evidence: [{ kind: 'text', summary: '页面出现成功提示' }],
    });
    const id = recordExecutionCheckpoint({
      userId: 'u_exec_ck',
      conversationId: 'conv_exec_ck',
      taskId,
      step: 3,
      receipt,
    });
    const rows = listExecutionCheckpoints('u_exec_ck', taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      taskId,
      step: 3,
      target: 'browser',
      action: 'browser_click',
      ok: true,
      beforeRevision: 'state-a',
      afterRevision: 'state-b',
      changed: true,
    });
    expect(rows[0].receipt?.evidence[0].summary).toBe('页面出现成功提示');
  });
});
