/**
 * 发布安全闭环守门：
 *   ① 生产发布审批绑定完整计划指纹，计划变化必须重新审批；
 *   ② 备份失败必须阻断后续上传，不能带着旧包继续发布；
 *   ③ 健康检查失败要写进运行记录，并可执行配置的回滚命令。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CicdPipeline, DeployTarget } from '@yan-zhi/shared';

const state = vi.hoisted(() => ({
  execCalls: [] as string[],
  getSftpCalls: 0,
}));

vi.mock('../src/host-bridge.js', () => ({
  runCmd: vi.fn(async () => ({ ok: true, code: 0, stdout: '', stderr: '' })),
}));

vi.mock('../src/plugins/ops-shell.js', () => ({
  loadConnections: vi.fn(async () => [{
    id: 'c-prod', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
    username: 'deploy', authType: 'key', secretEnc: 'secret-material', tag: '生产', createdAt: 1,
  }]),
  getSsh: vi.fn(async () => ({})),
  execOnConnection: vi.fn(async (_conn: unknown, command: string) => {
    state.execCalls.push(command);
    if (command.includes('cp -r')) return { stdout: '', stderr: 'no such file', code: 1 };
    if (command.includes('curl -fsS')) return { stdout: '', stderr: 'health check failed', code: 7 };
    return { stdout: 'ok', stderr: '', code: 0 };
  }),
  getSftp: vi.fn(async () => {
    state.getSftpCalls += 1;
    return {};
  }),
  sftpFastPut: vi.fn(async () => undefined),
  ensureRemoteDir: vi.fn(async () => undefined),
  backupRemoteName: vi.fn((name: string) => `${name}.bak-20261102`),
  collectLocalFiles: vi.fn(() => []),
}));

import { PipelineExecutor, cicdModule } from '../src/plugins/cicd-pipeline.js';
import { releaseApprovalSubject } from '../src/plugins/cicd-release-policy.js';

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    },
  };
}

async function activateCicd() {
  const ctx = {
    id: 'cicd-pipeline',
    log: () => {},
    adapter: {},
    config: {},
    storage: makeStorage(),
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    emit: () => {},
    on: () => ({ dispose: () => {} }),
  };
  await cicdModule.activate(ctx as never);
}

const target = (extra: Partial<DeployTarget> = {}): DeployTarget => ({
  id: 'target-prod',
  name: '生产',
  connectionId: 'c-prod',
  remotePath: '/srv/app/app.jar',
  restartScript: 'sh restart.sh',
  ...extra,
});

const pipeline = (targets: DeployTarget[], steps: CicdPipeline['steps'] = []): CicdPipeline => ({
  id: 'pipeline-1',
  name: '订单服务',
  projectDir: process.cwd(),
  buildType: 'custom-command',
  steps,
  targets,
  trigger: 'manual',
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  state.execCalls.length = 0;
  state.getSftpCalls = 0;
  await activateCicd();
});

describe('发布审批指纹', () => {
  it('绑定流水线步骤与部署目标；任何计划字段变化都产生新指纹', () => {
    const conn = {
      id: 'c-prod', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
      username: 'deploy', authType: 'key', secretEnc: 'secret-material', tag: '生产', createdAt: 1,
    } as never;
    const t1 = target();
    const p1 = pipeline([t1]);
    const first = releaseApprovalSubject(p1, t1, conn);
    expect(first).toContain('发布审批');
    expect(first).not.toContain('secret-material');

    const t2 = target({ healthCheckCommand: 'curl -fsS http://127.0.0.1:8080/health' });
    const changedPlan = releaseApprovalSubject(pipeline([t2]), t2, conn);
    expect(changedPlan).not.toBe(first);

    const secretPlan = releaseApprovalSubject(pipeline([t1], [{
      id: 'push', type: 'docker-push', name: '推送镜像', enabled: true, continueOnError: false,
      config: { image: 'registry.example.com/order:latest', username: 'deploy', password: 's3cr3t' },
    }]), t1, conn);
    expect(secretPlan).toContain('registry.example.com/order:latest');
    expect(secretPlan).not.toContain('s3cr3t');
  });
});

describe('备份失败阻断', () => {
  it('备份命令失败时运行失败，且不打开 SFTP 进入上传步骤', async () => {
    const t = target();
    const p = pipeline([t], [
      {
        id: 'backup', type: 'backup', name: '备份', enabled: true, continueOnError: false,
        config: {
          connectionId: 'c-prod', remotePath: '/srv/app/app.jar', backupDir: '/srv/app/backups',
          strategy: 'copy', keepCount: 3,
        },
      },
      {
        id: 'upload', type: 'upload', name: '上传', enabled: true, continueOnError: false,
        config: {
          connectionId: 'c-prod', localPath: '/tmp/app.jar', remotePath: '/srv/app/app.jar',
          mode: 'overwrite',
        },
      },
    ]);

    const run = await new PipelineExecutor().execute(p, t, 'test', () => {});

    expect(run.status).toBe('failed');
    expect(run.stepResults[0]).toMatchObject({ stepName: '备份', status: 'failed' });
    expect(state.getSftpCalls).toBe(0);
    expect(state.execCalls.some((cmd) => cmd.includes('|| true'))).toBe(false);
  });
});

describe('健康检查与回滚', () => {
  it('健康检查失败时执行回滚，并把两项证据写入运行记录', async () => {
    const t = target({
      healthCheckCommand: 'curl -fsS http://127.0.0.1:8080/health',
      rollbackCommand: 'sh rollback.sh',
      autoRollback: true,
    });
    const p = pipeline([t]);

    const run = await new PipelineExecutor().execute(p, t, 'test', () => {});

    expect(run.status).toBe('failed');
    expect(run.rolledBack).toBe(true);
    expect(run.stepResults.map((s) => [s.stepName, s.status])).toEqual([
      ['健康检查', 'failed'],
      ['自动回滚', 'success'],
    ]);
    expect(state.execCalls.some((cmd) => cmd.includes('curl -fsS'))).toBe(true);
    expect(state.execCalls.some((cmd) => cmd.includes('sh rollback.sh'))).toBe(true);
  });
});
