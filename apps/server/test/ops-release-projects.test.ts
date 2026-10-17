/**
 * 发布项目（four-mode-workspace 7b）测试类。
 *
 * 守护：
 *   ① 本地目录必须绝对路径、不能含 ..；
 *   ② 部署目标必须引用真实连接，env 归一化为字符串；
 *   ③ 三种创建模式：existing / empty / scaffold（scaffold 必须确认）；
 *   ④ 编辑保留未传字段，删除清掉会话绑定；
 *   ⑤ 目录初始化幂等（不覆盖已有文件）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 导入 ops-shell 会经 crypto 连带加载 better-sqlite3（取主密钥），单测里换成可逆假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import {
  opsShellModule,
  releaseProjectPathError,
  normalizeReleaseTargets,
  buildReleaseProject,
  scaffoldLocalProject,
} from '../src/plugins/ops-shell.js';
import { readFileSync as readSrc } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

describe('cicd-pipeline · 侧栏入口 + 生产发布确认', () => {
  const SRC = readSrc(resolvePath(__dirname, '../src/plugins/cicd-pipeline.ts'), 'utf8');
  it('7b.14：插件有「更多 → 运维」侧栏入口', () => {
    expect(SRC).toContain("moreGroup: 'ops'");
    expect(SRC).toContain("route: '/cicd'");
  });
  it('7b.12：生产连接的 cicd_run_pipeline 必须 confirmed', () => {
    expect(SRC).toMatch(/isProductionTag\(conn\.tag\) && args\.confirmed !== true/);
    expect(SRC).toContain('发布目录：${target.remotePath');
  });
});

describe('releaseProjectPathError · 本地目录安全', () => {
  it('必须是绝对路径', () => {
    expect(releaseProjectPathError('')).toMatch(/必填/);
    expect(releaseProjectPathError('work/app')).toMatch(/绝对路径/);
    expect(releaseProjectPathError('./app')).toMatch(/绝对路径/);
  });

  it('允许 Unix / Windows 绝对路径', () => {
    expect(releaseProjectPathError('/opt/app')).toBeNull();
    expect(releaseProjectPathError('D:/work/app')).toBeNull();
    expect(releaseProjectPathError('C:\\work\\app')).toBeNull();
  });

  it('拒绝路径穿越', () => {
    expect(releaseProjectPathError('/opt/../etc')).toMatch(/\.\./);
    expect(releaseProjectPathError('D:/work/../../Windows')).toMatch(/\.\./);
  });
});

describe('normalizeReleaseTargets · 部署目标', () => {
  const conns = [{ id: 'c1' }, { id: 'c2' }];

  it('连接必须存在', () => {
    expect(normalizeReleaseTargets([{ connectionId: '' }], conns).error).toMatch(/选择连接/);
    expect(normalizeReleaseTargets([{ connectionId: 'nope' }], conns).error).toMatch(/连接不存在/);
  });

  it('归一化字段与 env（只收字符串值）', () => {
    const r = normalizeReleaseTargets([{
      connectionId: 'c1', name: '生产', remotePath: '/app', restartScript: 'sh restart.sh',
      env: { PORT: 8080, MODE: 'prod' },
    }], conns);
    expect(r.error).toBeUndefined();
    expect(r.targets).toHaveLength(1);
    expect(r.targets![0].name).toBe('生产');
    expect(r.targets![0].env).toEqual({ PORT: '8080', MODE: 'prod' });
  });

  it('未传 targets 表示「保持原值」（返回 targets=undefined）', () => {
    expect(normalizeReleaseTargets(undefined, conns).targets).toBeUndefined();
    expect(normalizeReleaseTargets('x', conns).error).toMatch(/数组/);
  });
});

describe('buildReleaseProject · 编辑保留字段', () => {
  it('新建生成 id/createdAt；编辑保留 id 与旧字段', () => {
    const base = buildReleaseProject({ name: 'A', localDir: '/a', targets: [], pipelineIds: ['p1'] }, undefined);
    const next = buildReleaseProject({ name: 'B', localDir: '/b' }, undefined, base);
    expect(next.id).toBe(base.id);
    expect(next.createdAt).toBe(base.createdAt);
    expect(next.name).toBe('B');
    expect(next.pipelineIds).toEqual(['p1']); // 未传 = 保留
  });
});

describe('scaffoldLocalProject · 目录初始化', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'relp-')); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('空目录模式只写 README', () => {
    const dir = join(root, 'app');
    scaffoldLocalProject(dir, 'empty');
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
    expect(existsSync(join(dir, 'package.json'))).toBe(false);
  });

  it('node/maven/docker 写最小骨架', () => {
    const node = join(root, 'n'); scaffoldLocalProject(node, 'node');
    expect(JSON.parse(readFileSync(join(node, 'package.json'), 'utf8')).private).toBe(true);

    const mvn = join(root, 'm'); scaffoldLocalProject(mvn, 'maven');
    expect(readFileSync(join(mvn, 'pom.xml'), 'utf8')).toMatch(/<artifactId>/);

    const docker = join(root, 'd'); scaffoldLocalProject(docker, 'docker');
    expect(readFileSync(join(docker, 'Dockerfile'), 'utf8')).toMatch(/^FROM /);
  });

  it('★ 幂等：已有文件不被覆盖', () => {
    const dir = join(root, 'keep');
    scaffoldLocalProject(dir, 'node');
    writeFileSync(join(dir, 'package.json'), '{"name":"手写"}', 'utf8');
    scaffoldLocalProject(dir, 'node');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe('{"name":"手写"}');
  });
});

// ---------- 路由 CRUD ----------

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}
function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { res.statusCode = c; return res; },
    json(d: unknown) { res.body = d; return res; },
  };
  return res;
}
let routes: Array<{ method: string; pattern: string; handler: Handler }>;
async function activate() {
  routes = [];
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (p: string, h: Handler) => routes.push({ method: 'GET', pattern: p, handler: h }),
        post: (p: string, h: Handler) => routes.push({ method: 'POST', pattern: p, handler: h }),
        put: (p: string, h: Handler) => routes.push({ method: 'PUT', pattern: p, handler: h }),
        delete: (p: string, h: Handler) => routes.push({ method: 'DELETE', pattern: p, handler: h }),
      };
      setup(app);
      return { dispose: () => {} };
    },
    registerWebSocket: () => ({ dispose: () => {} }),
    storage: makeStorage(), emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}
async function call(method: string, path: string, body: Record<string, unknown> = {}) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (!ok) continue;
    const res = mockRes();
    await r.handler({ body, params, query: {} }, res);
    return res;
  }
  throw new Error(`路由未注册: ${method} ${path}`);
}
const dataOf = (res: ReturnType<typeof mockRes>) => (res.body as { data: any }).data;

const CONN_BODY = {
  type: 'ssh', name: '发布目标机', host: '127.0.0.1', port: 22,
  username: 'root', authType: 'password', secret: 'pw', tag: '生产',
};

describe('发布项目 REST CRUD', () => {
  let root: string;
  beforeEach(async () => { root = mkdtempSync(join(tmpdir(), 'relp-api-')); await activate(); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  async function createConn() {
    const r = await call('POST', '/connections', CONN_BODY);
    expect(r.statusCode).toBe(200);
    return String(dataOf(r).id);
  }

  it('existing：选已有目录 + 检测技术栈 + 部署目标', async () => {
    const connId = await createConn();
    writeFileSync(join(root, 'package.json'), '{"name":"demo"}', 'utf8');
    const res = await call('POST', '/release-projects', {
      name: '订单服务', mode: 'existing', localDir: root,
      targets: [{ connectionId: connId, name: '生产', remotePath: '/app', restartScript: 'sh restart.sh' }],
    });
    expect(res.statusCode).toBe(200);
    const p = dataOf(res);
    expect(p.localDir).toBe(root.replace(/\\/g, '/'));
    expect(p.techStack.buildTool).toBe('npm');
    expect(p.targets[0].name).toBe('生产');
  });

  it('empty：新建空目录 + README', async () => {
    const res = await call('POST', '/release-projects', { name: '空项目', mode: 'empty', parentDir: root });
    expect(res.statusCode).toBe(200);
    const dir = dataOf(res).localDir as string;
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
  });

  it('★ scaffold 未确认 → 428；确认后写入骨架', async () => {
    const denied = await call('POST', '/release-projects', { name: '骨架', mode: 'scaffold', parentDir: root, scaffold: 'node' });
    expect(denied.statusCode).toBe(428);
    const ok = await call('POST', '/release-projects', { name: '骨架', mode: 'scaffold', parentDir: root, scaffold: 'node', confirmed: true });
    expect(ok.statusCode).toBe(200);
    expect(existsSync(join(dataOf(ok).localDir, 'package.json'))).toBe(true);
  });

  it('非法目录 / 非法目标 → 400', async () => {
    expect((await call('POST', '/release-projects', { name: 'x', mode: 'existing', localDir: 'rel/path' })).statusCode).toBe(400);
    expect((await call('POST', '/release-projects', { name: 'y', mode: 'existing', localDir: join(root, 'nope') })).statusCode).toBe(400);
    const dir = mkdtempSync(join(tmpdir(), 'relp-ok-'));
    const bad = await call('POST', '/release-projects', {
      name: 'z', mode: 'existing', localDir: dir,
      targets: [{ connectionId: 'missing' }],
    });
    expect(bad.statusCode).toBe(400);
    rmSync(dir, { recursive: true, force: true });
  });

  it('编辑保留未传字段；删除后列表为空并写审计', async () => {
    const res = await call('POST', '/release-projects', { name: 'A', mode: 'existing', localDir: root });
    expect(res.statusCode).toBe(200);
    const id = dataOf(res).id as string;
    const upd = await call('PUT', `/release-projects/${id}`, { name: 'A2', description: '改个名' });
    expect(upd.statusCode).toBe(200);
    expect(dataOf(upd).name).toBe('A2');
    expect(dataOf(upd).localDir).toBe(root.replace(/\\/g, '/'));

    const del = await call('DELETE', `/release-projects/${id}`);
    expect(del.statusCode).toBe(200);
    expect(dataOf(await call('GET', '/release-projects'))).toEqual([]);
    const audit = dataOf(await call('GET', '/audit')) as Array<{ action: string }>;
    expect(audit.some((a) => a.action === 'release_project.create')).toBe(true);
    expect(audit.some((a) => a.action === 'release_project.delete')).toBe(true);
  });
});
