import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIALOG = readFileSync(resolve(__dirname, 'ScheduledTaskDialog.vue'), 'utf8');
const STORE = readFileSync(resolve(__dirname, '../../stores/scheduledTask.ts'), 'utf8');

describe('ScheduledTaskDialog · Runbook 定时任务', () => {
  it('可选择 Runbook、固定版本并填写参数', () => {
    expect(DIALOG).toContain('Runbook 任务');
    expect(DIALOG).toContain('/plugin/ops-shell/runbooks');
    expect(DIALOG).toContain('runbookId');
    expect(DIALOG).toContain('runbookVersion');
    expect(DIALOG).toContain('runbookInputs');
    expect(DIALOG).toContain('lastRunbookRun');
  });

  it('store 与服务端读写 runbook 调度字段', () => {
    expect(STORE).toContain("'runbook'");
    expect(STORE).toContain('runbookName');
    expect(STORE).toContain('runbookInputsJson');
  });
});
