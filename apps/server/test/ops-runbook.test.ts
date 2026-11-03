/**
 * Runbook 核心守门：
 *   ① 输入归一化/版本递增；
 *   ② 步骤按顺序执行，非 continueOnError 失败即停止；
 *   ③ 失败执行同版本 rollbackSteps，并记录每个结果。
 */
import { describe, it, expect } from 'vitest';
import {
  buildRunbook,
  buildRunbookApprovalSubject,
  executeRunbook,
  normalizeRunbookInput,
  renderRunbook,
  resolveRunbookParams,
  type OpsRunbook,
} from '../src/plugins/ops-runbook.js';

const conn = {
  id: 'c1', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
  username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
} as never;

function runbook(): OpsRunbook {
  return {
    id: 'rb1', name: '发布检查', connectionId: 'c1', enabled: true, version: 3,
    parameters: [],
    steps: [
      { id: 's1', type: 'exec', name: '检查版本', command: 'cat VERSION' },
      { id: 's2', type: 'wait', name: '等待', seconds: 1 },
      { id: 's3', type: 'http', name: '健康检查', url: 'http://127.0.0.1:8080/health', expectedStatus: 200 },
    ],
    rollbackSteps: [
      { id: 'r1', type: 'exec', name: '恢复旧版本', command: 'sh rollback.sh' },
    ],
    createdAt: 1, updatedAt: 1,
  };
}

describe('Runbook 归一化与版本', () => {
  it('创建为 v1，编辑同一 Runbook 自动递增版本并保留 id/createdAt', () => {
    const normalized = normalizeRunbookInput({
      name: ' 发布检查 ',
      connectionId: 'c1',
      steps: [{ type: 'exec', name: '检查', command: 'uptime' }],
      rollbackSteps: [{ type: 'exec', name: '恢复', command: 'sh rollback.sh' }],
    });
    expect(normalized.error).toBeUndefined();
    const v1 = buildRunbook(normalized.value!);
    expect(v1).toMatchObject({ version: 1, name: '发布检查' });
    const v2 = buildRunbook(normalized.value!, v1);
    expect(v2).toMatchObject({ id: v1.id, version: 2, createdAt: v1.createdAt });
  });

  it('参数默认值与运行输入通过 ${key} 替换进入步骤', () => {
    const normalized = normalizeRunbookInput({
      name: '重启服务', connectionId: 'c1',
      parameters: [
        { key: 'service', label: '服务名', required: true, defaultValue: 'nginx' },
        { key: 'port', label: '端口', required: true },
      ],
      steps: [
        { type: 'exec', name: '重启', command: 'systemctl restart ${service}' },
        { type: 'http', name: '检查', url: 'http://127.0.0.1:${port}/health', expectedStatus: 200 },
      ],
    });
    expect(normalized.error).toBeUndefined();
    const rb = buildRunbook(normalized.value!);
    expect(resolveRunbookParams(rb, { port: '8080' })).toEqual({
      params: { service: 'nginx', port: '8080' },
    });
    expect(resolveRunbookParams(rb, {})?.error).toContain('port');
    const rendered = renderRunbook(rb, { service: 'api', port: '8080' });
    expect(rendered.steps[0]).toMatchObject({ command: 'systemctl restart api' });
    expect(rendered.steps[1]).toMatchObject({ url: 'http://127.0.0.1:8080/health' });
  });

  it('步骤引用未声明参数时拒绝保存', () => {
    const normalized = normalizeRunbookInput({
      name: 'bad', connectionId: 'c1',
      steps: [{ type: 'exec', name: 'x', command: 'echo ${missing}' }],
    });
    expect(normalized.error).toContain('未声明参数');
  });

  it('拒绝原型污染参数键和含 shell 元字符的运行值', () => {
    const reserved = normalizeRunbookInput({
      name: 'bad-key', connectionId: 'c1',
      parameters: [{ key: '__proto__', label: '危险键' }],
      steps: [{ type: 'exec', name: 'x', command: 'echo ${__proto__}' }],
    });
    expect(reserved.error).toContain('key 非法');

    const normalized = normalizeRunbookInput({
      name: 'safe', connectionId: 'c1',
      parameters: [{ key: 'branch', label: '分支', required: true }],
      steps: [{ type: 'exec', name: 'x', command: 'deploy ${branch}' }],
    });
    const rb = buildRunbook(normalized.value!);
    expect(resolveRunbookParams(rb, { branch: 'main; rm -rf /' }).error).toContain('不安全字符');
    expect(resolveRunbookParams(rb, { branch: 'main', extra: 'ignored' }).error).toContain('未声明');
  });

  it('拒绝非法步骤与空步骤', () => {
    expect(normalizeRunbookInput({ name: 'x', connectionId: 'c1', steps: [] }).error).toContain('至少');
    expect(normalizeRunbookInput({
      name: 'x', connectionId: 'c1',
      steps: [{ type: 'evil', name: 'x' }],
    }).error).toContain('类型');
    expect(normalizeRunbookInput({
      name: 'x', connectionId: 'c1',
      steps: [{ type: 'wait', name: 'x', seconds: 9999 }],
    }).error).toContain('等待');
    expect(normalizeRunbookInput({
      name: 'x', connectionId: 'c1',
      steps: [
        { id: 'same', type: 'exec', name: 'a', command: 'a' },
        { id: 'same', type: 'exec', name: 'b', command: 'b' },
      ],
    }).error).toContain('id 重复');
  });

  it('审批指纹绑定版本、步骤和回滚计划，且不泄露密钥', () => {
    const subject = buildRunbookApprovalSubject(runbook(), conn);
    expect(subject).toContain('发布检查');
    expect(subject).toContain('v3');
    expect(subject).toContain('健康检查');
    expect(subject).toContain('恢复旧版本');
    expect(subject).not.toContain('ENC:secret');
  });
});

describe('Runbook 执行与回滚', () => {
  it('按顺序执行 exec/wait/http，全部成功时状态 success', async () => {
    const calls: string[] = [];
    const result = await executeRunbook(runbook(), {
      execRemote: async (command) => {
        calls.push(command);
        if (command.includes('curl')) return { code: 0, stdout: '200', stderr: '' };
        return { code: 0, stdout: 'ok', stderr: '' };
      },
      wait: async () => undefined,
    });
    expect(result.status).toBe('success');
    expect(result.stepResults.map((step) => step.status)).toEqual(['success', 'success', 'success']);
    expect(calls[0]).toBe('cat VERSION');
    expect(calls.at(-1)).toContain('curl');
  });

  it('普通步骤失败后停止并执行回滚', async () => {
    const calls: string[] = [];
    const rb = runbook();
    rb.steps = [
      { id: 's1', type: 'exec', name: '部署', command: 'deploy.sh' },
      { id: 's2', type: 'exec', name: '不应执行', command: 'never.sh' },
    ];
    const result = await executeRunbook(rb, {
      execRemote: async (command) => {
        calls.push(command);
        if (command === 'deploy.sh') return { code: 1, stdout: '', stderr: 'boom' };
        return { code: 0, stdout: 'restored', stderr: '' };
      },
      wait: async () => undefined,
    });
    expect(result.status).toBe('rolled_back');
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]).toMatchObject({ name: '部署', status: 'failed' });
    expect(result.rollbackResults[0]).toMatchObject({ name: '恢复旧版本', status: 'success' });
    expect(calls).toEqual(['deploy.sh', 'sh rollback.sh']);
  });

  it('回滚失败时状态保持 failed 并记录回滚错误', async () => {
    const rb = runbook();
    rb.steps = [{ id: 's1', type: 'exec', name: '部署', command: 'deploy.sh' }];
    const result = await executeRunbook(rb, {
      execRemote: async (command) => ({ code: 1, stdout: '', stderr: `${command} failed` }),
      wait: async () => undefined,
    });
    expect(result.status).toBe('failed');
    expect(result.rollbackResults[0].status).toBe('failed');
  });

  it('取消在步骤边界生效，当前步骤完成但不启动下一步', async () => {
    const rb = runbook();
    rb.steps = [
      { id: 's1', type: 'wait', name: '等待', seconds: 1 },
      { id: 's2', type: 'exec', name: '不应执行', command: 'never.sh' },
    ];
    let cancelled = false;
    const calls: string[] = [];
    const result = await executeRunbook(rb, {
      execRemote: async (command) => { calls.push(command); return { code: 0, stdout: '', stderr: '' }; },
      wait: async () => { cancelled = true; },
      shouldCancel: () => cancelled,
    });
    expect(result.status).toBe('cancelled');
    expect(result.stepResults).toHaveLength(1);
    expect(calls).toEqual([]);
  });
});
