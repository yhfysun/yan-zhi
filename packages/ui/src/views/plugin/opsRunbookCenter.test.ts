/**
 * Runbook UI 契约：版本化列表、审批后运行、步骤/回滚结果与历史记录都要有入口。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONSOLE = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
const RUNBOOK = readFileSync(resolve(__dirname, '../../components/ops/OpsRunbookCenter.vue'), 'utf8');

describe('OpsRunbookCenter', () => {
  it('接入运维控制台 Runbook 页签', () => {
    expect(CONSOLE).toContain('label="Runbook"');
    expect(CONSOLE).toContain('<OpsRunbookCenter');
    expect(CONSOLE).toContain("from '../../components/ops/OpsRunbookCenter.vue'");
  });

  it('CRUD、审批、运行与轮询都走 ops-shell API', () => {
    expect(RUNBOOK).toContain('/plugin/ops-shell/runbooks');
    expect(RUNBOOK).toContain('/approval');
    expect(RUNBOOK).toContain('/run');
    expect(RUNBOOK).toContain('/runbooks/runs/');
    expect(RUNBOOK).toContain('/plugin/ops-shell/approvals/');
  });

  it('展示版本、步骤结果、回滚结果与历史', () => {
    expect(RUNBOOK).toContain('version');
    expect(RUNBOOK).toContain('stepResults');
    expect(RUNBOOK).toContain('rollbackResults');
    expect(RUNBOOK).toContain('运行历史');
  });

  it('参数化运行与步骤边界取消都有完整入口', () => {
    expect(RUNBOOK).toContain('parameters');
    expect(RUNBOOK).toContain('inputParams');
    expect(RUNBOOK).toContain('/runbooks/runs/${');
    expect(RUNBOOK).toContain('/cancel');
    expect(RUNBOOK).toContain("cancelled: '已取消'");
  });
});
