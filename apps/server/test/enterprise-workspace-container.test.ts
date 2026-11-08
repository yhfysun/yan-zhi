/**
 * Task 2 验收测试：容器化云工作区。
 *
 * ★ 为什么真跑：节点 Agent 是 .mjs 自启动脚本，vitest 无法直接 import。
 *   把容器生命周期抽到 enterprise-workspace-runtime.cjs 后，宿主与测试**都 require 同一份实现**，
 *   才能真实验证「带 image 优先容器」「无 Docker 明确失败不静默回落」「停止移除容器 + 目录保留策略」，
 *   而不是靠 readFileSync 锚点猜分支顺序。docker 命令通过可注入 runner 模拟，不依赖本机装 Docker。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  createRuntimeNode, enqueueExpiredWorkspaceStops, getWorkspace, registerRuntimeNode,
  stopWorkspace, updateWorkspaceState, createWorkspace,
} from '../src/enterprise/runtime.js';

const require = createRequire(import.meta.url);
const wr = require('../scripts/enterprise-workspace-runtime.cjs');

const UID = 'u_ws_container_test';
let nodeId = '';
let nodeToken = '';
const tempDirs: string[] = [];

function tmpRoot(tag: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `yz-ws-${tag}-`));
  tempDirs.push(dir);
  return dir;
}

/** 记录所有 docker 调用，按 args[0] 分发结果。 */
function makeRunner(handler: (sub: string, args: string[]) => { status: number; stdout?: string; stderr?: string }) {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const runner = (bin: string, args: string[]) => {
    calls.push({ bin, args });
    const r = handler(String(args[0] || ''), args);
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  return { runner, calls };
}

const dockerAvailable = makeRunner((sub) => sub === 'version'
  ? { status: 0, stdout: '27.3.1\n' }
  : sub === 'run' ? { status: 0, stdout: 'container-abc123\n' } : { status: 0, stdout: '' });

beforeAll(() => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM user WHERE id = ?').run(UID);
  db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'ws_container_test', '!test', Date.now());
  const created = createRuntimeNode(UID, { name: '容器测试节点', capabilities: ['command'] });
  nodeId = created.node.id;
  nodeToken = created.token;
  registerRuntimeNode(nodeToken, { platform: 'linux', arch: 'x64', version: 'v24', capabilities: ['command'] });
});

afterEach(() => {
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id = ?').run(UID);
});

describe('容器模式判定与安全约束', () => {
  it('带 image ⇒ container；无 image ⇒ directory（不改变原有目录模式）', () => {
    expect(wr.resolveWorkspaceMode({ image: 'ubuntu:22.04' })).toBe('container');
    expect(wr.resolveWorkspaceMode({ image: '  alpine:3.20  ' })).toBe('container');
    expect(wr.resolveWorkspaceMode({ image: '' })).toBe('directory');
    expect(wr.resolveWorkspaceMode({})).toBe('directory');
  });

  it('docker run 参数含非 root / 只读根 / cap-drop / CPU / 内存 / 工作目录挂载', () => {
    const hostDir = tmpRoot('args');
    const args = wr.buildDockerRunArgs({
      workspaceId: 'ws-1', image: 'ubuntu:22.04', hostDir, cpu: 1.5, memoryMb: 512,
    });
    const joined = args.join(' ');
    expect(args[0]).toBe('run');
    expect(args).toContain('-d');
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop');
    expect(args[args.indexOf('--cap-drop') + 1]).toBe('ALL');
    expect(args).toContain('--security-opt');
    expect(joined).toContain('no-new-privileges');
    expect(args).toContain('--user');
    expect(joined).toContain('--cpus 1.5');
    expect(joined).toContain('--memory 512m');
    expect(joined).toContain(`type=bind,source=${hostDir},target=/workspace`);
    expect(joined).toContain('yan-zhi.workspace=ws-1');
    expect(args[args.length - 1]).toBe('infinity');
  });

  it('无 CPU/内存限制时不注入限额参数', () => {
    const args = wr.buildDockerRunArgs({ workspaceId: 'ws-2', image: 'alpine', hostDir: tmpRoot('nolimit') });
    expect(args).not.toContain('--cpus');
    expect(args).not.toContain('--memory');
  });
});

describe('节点侧：创建容器工作区', () => {
  it('Docker 可用 ⇒ 先探测再 docker run，元数据落 containerId', () => {
    const hostDir = tmpRoot('create');
    const { runner, calls } = makeRunner((sub) => sub === 'version'
      ? { status: 0, stdout: '27.3.1\n' }
      : { status: 0, stdout: 'cid-123456\n' });
    const result = wr.createWorkspaceOnNode({
      workspaceId: 'ws-create-1', name: '测试容器', image: 'ubuntu:22.04',
      cpu: 1, memoryMb: 256, ttlMinutes: 30, hostDir,
    }, runner);
    expect(result.mode).toBe('container');
    expect(result.containerId).toBe('cid-123456');
    expect(result.path).toBe(path.resolve(hostDir));
    expect(calls[0].args[0]).toBe('version');
    expect(calls[1].args[0]).toBe('run');
    expect(calls.every((c) => c.bin === 'docker')).toBe(true);
    const meta = JSON.parse(readFileSync(path.join(hostDir, '.yan-zhi-workspace.json'), 'utf8'));
    expect(meta.mode).toBe('container');
    expect(meta.containerId).toBe('cid-123456');
    expect(meta.image).toBe('ubuntu:22.04');
  });

  it('★ 无 Docker 时明确失败，绝不静默回退成目录模式', () => {
    const hostDir = tmpRoot('nodocker');
    const { runner, calls } = makeRunner((sub) => sub === 'version'
      ? { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }
      : { status: 0, stdout: 'should-not-run\n' });
    expect(() => wr.createWorkspaceOnNode({
      workspaceId: 'ws-nodocker', image: 'ubuntu:22.04', hostDir,
    }, runner)).toThrow(/Docker|docker/);
    expect(calls.some((c) => c.args[0] === 'run')).toBe(false);
    expect(existsSync(path.join(hostDir, '.yan-zhi-workspace.json'))).toBe(false);
  });

  it('docker 二进制都不存在（runner 抛错）⇒ 可行动错误', () => {
    const runner = () => { throw new Error('spawn docker ENOENT'); };
    expect(() => wr.createWorkspaceOnNode({
      workspaceId: 'ws-enoent', image: 'alpine', hostDir: tmpRoot('enoent'),
    }, runner)).toThrow(/Docker|docker/);
  });

  it('docker run 失败 ⇒ 抛错且不留 running 状态', () => {
    const hostDir = tmpRoot('runfail');
    const { runner } = makeRunner((sub) => sub === 'version'
      ? { status: 0, stdout: '27.3.1' }
      : { status: 125, stdout: '', stderr: 'image not found' });
    expect(() => wr.createWorkspaceOnNode({
      workspaceId: 'ws-runfail', image: 'no-such-image', hostDir,
    }, runner)).toThrow(/Docker 启动容器失败/);
  });

  it('目录模式仍只建目录，不触碰 docker', () => {
    const hostDir = tmpRoot('plain');
    const { runner, calls } = dockerAvailable;
    calls.length = 0;
    const result = wr.createWorkspaceOnNode({ workspaceId: 'ws-plain', name: '目录工作区', hostDir }, runner);
    expect(result.mode).toBe('directory');
    expect(result.containerId).toBeNull();
    expect(calls).toHaveLength(0);
    const meta = JSON.parse(readFileSync(path.join(hostDir, '.yan-zhi-workspace.json'), 'utf8'));
    expect(meta.mode).toBe('directory');
  });
});

describe('节点侧：停止容器与目录保留策略', () => {
  function seededContainer(extra: Record<string, unknown> = {}) {
    const hostDir = tmpRoot('stop');
    const { runner, calls } = makeRunner((sub) => sub === 'rm'
      ? { status: 0, stdout: 'cid-xyz\n' }
      : { status: 0, stdout: '' });
    wr.createWorkspaceOnNode({
      workspaceId: 'ws-stop', image: 'ubuntu:22.04', hostDir,
    }, makeRunner((sub) => sub === 'version'
      ? { status: 0, stdout: '27.3.1' }
      : { status: 0, stdout: 'cid-xyz\n' }).runner);
    calls.length = 0;
    return { hostDir, runner, calls, ...extra };
  }

  it('停止容器模式 ⇒ docker rm -f 被调用，默认删除目录', () => {
    const { hostDir, runner, calls } = seededContainer();
    const result = wr.stopWorkspaceOnNode({
      workspaceId: 'ws-stop', hostDir, keepDir: false, containerId: 'cid-xyz', mode: 'container',
    }, runner);
    expect(result.removedContainer).toBe(true);
    expect(calls[0].args.slice(0, 3)).toEqual(['rm', '-f', 'cid-xyz']);
    expect(existsSync(hostDir)).toBe(false);
    expect(result.removedDirectory).toBe(true);
  });

  it('keepDir=true ⇒ 容器仍移除，目录保留', () => {
    const { hostDir, runner, calls } = seededContainer();
    const result = wr.stopWorkspaceOnNode({
      workspaceId: 'ws-stop', hostDir, keepDir: true, containerId: 'cid-xyz', mode: 'container',
    }, runner);
    expect(result.removedContainer).toBe(true);
    expect(calls.some((c) => c.args[0] === 'rm')).toBe(true);
    expect(existsSync(hostDir)).toBe(true);
    expect(result.removedDirectory).toBe(false);
  });

  it('任务未带 containerId ⇒ 从元数据文件回读，不会漏删容器', () => {
    const { hostDir, runner, calls } = seededContainer();
    const result = wr.stopWorkspaceOnNode({ workspaceId: 'ws-stop', hostDir, keepDir: true }, runner);
    expect(result.removedContainer).toBe(true);
    expect(calls[0].args).toContain('cid-xyz');
  });

  it('容器已不存在 ⇒ 视为已清理，不误报失败', () => {
    const hostDir = tmpRoot('gone');
    const { runner } = makeRunner((sub) => sub === 'rm'
      ? { status: 1, stdout: '', stderr: 'Error: No such container: cid-gone' }
      : { status: 0, stdout: '' });
    const result = wr.stopWorkspaceOnNode({
      workspaceId: 'ws-gone', hostDir, keepDir: true, containerId: 'cid-gone', mode: 'container',
    }, runner);
    expect(result.removedContainer).toBe(true);
  });

  it('parseContainerState 能识别 Up / Exited', () => {
    expect(wr.parseContainerState('cid-1\tUp 3 minutes\n')).toBe('running');
    expect(wr.parseContainerState('cid-1\tExited (0) 2 minutes ago\n')).toBe('stopped');
    expect(wr.parseContainerState('')).toBe('missing');
  });
});

describe('控制面：模式、策略与 TTL 都能传到节点', () => {
  it('带 image 创建 ⇒ runtime_mode=container，任务 payload 带模式与策略', () => {
    const ws = createWorkspace(UID, {
      nodeId, name: '容器工作区', image: 'ubuntu:22.04', cpu: 2, memoryMb: 1024,
      ttlMinutes: 30, keepDir: true,
    } as any);
    expect(ws.runtime_mode).toBe('container');
    expect(ws.keep_dir).toBe(true);
    const task = db.prepare("SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_create'").get(ws.id) as any;
    const payload = JSON.parse(task.payload_json);
    expect(payload.mode).toBe('container');
    expect(payload.image).toBe('ubuntu:22.04');
    expect(payload.keepDir).toBe(true);
    expect(payload.cpu).toBe(2);
  });

  it('节点回报 containerId / failed + error 能落库并在列表可见', () => {
    const ws = createWorkspace(UID, { nodeId, name: '失败工作区', image: 'ubuntu:22.04' } as any);
    const updated = updateWorkspaceState(nodeToken, ws.id, {
      status: 'failed',
      containerId: 'cid-live',
      error: '节点未安装 Docker 或 Docker 守护进程不可用',
    } as any);
    expect(updated.container_id).toBe('cid-live');
    expect(updated.last_error).toContain('Docker');
    expect(getWorkspace(ws.id, UID).last_error).toContain('Docker');
  });

  it('手动停止 ⇒ stop 任务带 containerId / mode / keepDir', () => {
    const ws = createWorkspace(UID, { nodeId, name: '容器工作区', image: 'alpine', keepDir: true } as any);
    updateWorkspaceState(nodeToken, ws.id, { status: 'running', containerId: 'cid-stop', path: '/tmp/ws' } as any);
    stopWorkspace(UID, ws.id);
    const task = db.prepare("SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'").get(ws.id) as any;
    const payload = JSON.parse(task.payload_json);
    expect(payload.containerId).toBe('cid-stop');
    expect(payload.mode).toBe('container');
    expect(payload.keepDir).toBe(true);
  });

  it('★ TTL 到期 ⇒ 下发清理容器的 stop 任务，并带 ttl_expired 原因', () => {
    const ws = createWorkspace(UID, { nodeId, name: 'TTL 工作区', image: 'alpine' } as any);
    updateWorkspaceState(nodeToken, ws.id, { status: 'running', containerId: 'cid-ttl' } as any);
    db.prepare('UPDATE runtime_workspace SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, ws.id);
    expect(enqueueExpiredWorkspaceStops()).toBeGreaterThanOrEqual(1);
    const task = db.prepare("SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'").get(ws.id) as any;
    const payload = JSON.parse(task.payload_json);
    expect(payload.reason).toBe('ttl_expired');
    expect(payload.containerId).toBe('cid-ttl');
    expect(payload.mode).toBe('container');
    expect(payload.keepDir).toBe(false);
  });
});

describe('接线守卫', () => {
  it('节点 Agent 必须引用同一份 .cjs 实现并上报容器能力', () => {
    const agent = readFileSync(path.join(__dirname, '..', 'scripts', 'enterprise-node-agent.mjs'), 'utf8');
    expect(agent).toContain('enterprise-workspace-runtime.cjs');
    expect(agent).toContain('createWorkspaceOnNode');
    expect(agent).toContain('stopWorkspaceOnNode');
    expect(agent).toContain('workspace_container');
  });
});

describe('cleanup', () => {
  it('临时目录清理', () => {
    for (const dir of tempDirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
    expect(true).toBe(true);
  });
});
