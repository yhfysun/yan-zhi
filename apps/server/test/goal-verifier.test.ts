import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  verifyDeterministicCriteria,
  verifyDeterministicCriterion,
} from '../src/services/goal-verifier.js';

let workspace = '';
let server: ReturnType<typeof createServer>;
let baseUrl = '';

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'yz-goal-verify-'));
  writeFileSync(join(workspace, 'deliverable.md'), '# 已完成\n');
  server = createServer((req, res) => {
    res.statusCode = req.url === '/ok' ? 200 : 404;
    res.end(req.url === '/ok' ? 'goal-ready' : 'missing');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  rmSync(workspace, { recursive: true, force: true });
});

describe('goal deterministic verifier', () => {
  it('文件存在检查限制在工作目录内，并拒绝路径穿越', async () => {
    const ok = await verifyDeterministicCriterion({
      id: 'file',
      title: '交付文件存在',
      kind: 'file_exists',
      path: 'deliverable.md',
    }, workspace);
    expect(ok).toMatchObject({ id: 'file', passed: true });

    const missing = await verifyDeterministicCriterion({
      id: 'missing',
      title: '缺失文件',
      kind: 'file_exists',
      path: 'missing.md',
    }, workspace);
    expect(missing).toMatchObject({ id: 'missing', passed: false });

    const escape = await verifyDeterministicCriterion({
      id: 'escape',
      title: '越界文件',
      kind: 'file_exists',
      path: '../outside.txt',
    }, workspace);
    expect(escape).toMatchObject({ id: 'escape', passed: false });
    expect(escape?.summary).toContain('越界');
  });

  it('命令检查验证退出码与 stdout 片段', async () => {
    const ok = await verifyDeterministicCriterion({
      id: 'cmd-ok',
      title: '构建输出',
      kind: 'command',
      command: 'node -e "process.stdout.write(\'built-ok\')"',
      expect: { exitCode: 0, stdoutIncludes: 'built-ok' },
    }, workspace);
    expect(ok).toMatchObject({ id: 'cmd-ok', passed: true });

    const failed = await verifyDeterministicCriterion({
      id: 'cmd-fail',
      title: '失败命令',
      kind: 'command',
      command: 'node -e "process.exit(7)"',
      expect: { exitCode: 0 },
    }, workspace);
    expect(failed).toMatchObject({ id: 'cmd-fail', passed: false });
    expect(failed?.evidence).toMatchObject({ exitCode: 7 });
  });

  it('HTTP 检查验证状态码与正文', async () => {
    const ok = await verifyDeterministicCriterion({
      id: 'http',
      title: '健康检查',
      kind: 'http',
      url: `${baseUrl}/ok`,
      expect: { status: 200, bodyIncludes: 'goal-ready' },
    }, workspace);
    expect(ok).toMatchObject({ id: 'http', passed: true });

    const bad = await verifyDeterministicCriterion({
      id: 'http-bad',
      title: '错误页',
      kind: 'http',
      url: `${baseUrl}/bad`,
      expect: { status: 200 },
    }, workspace);
    expect(bad).toMatchObject({ id: 'http-bad', passed: false });
  });

  it('文本与人工项不会伪装成自动通过，而是列为待处理', async () => {
    const result = await verifyDeterministicCriteria([
      { id: 'f', title: '文件', kind: 'file_exists', path: 'deliverable.md' },
      { id: 't', title: '文案质量', kind: 'text' },
      { id: 'h', title: '人工确认', kind: 'human' },
    ], workspace);
    expect(result.results).toHaveLength(1);
    expect(result.unresolved.map(c => c.id)).toEqual(['t', 'h']);
    expect(result.needsHuman).toBe(true);
  });
});
