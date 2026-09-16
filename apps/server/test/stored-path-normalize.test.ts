/**
 * 历史相对路径的读取侧兼容 —— 单测。
 *
 * 背景：早期 resolveArtifactRoot 在三级全空时返回空串，落盘与登记的 path 都成了相对路径
 * （`.yan-zhi\tasks\<convId>\deliverables\xxx.png`）。根因已在 artifact-dir 修掉，
 * 但**已入库的历史记录**仍是相对的 —— 渲染层 readFileBase64 会 ENOENT。
 * files.ts 的 normalizeStoredPath 负责在读取时补成绝对路径。
 *
 * 这里钉死三类行为：
 *   1. 产物目录形态的相对路径 → 补成绝对（用该会话的产物根）
 *   2. 已是绝对路径 / 非产物形态的相对路径 → 原样返回（不误伤用户自己的路径）
 *   3. 空值安全
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

const hoisted = vi.hoisted(() => ({
  db: { prepare: () => ({ get: () => ({ title: 't', created_at: 0, space_dir: '' }), all: () => [], run: () => {} }), exec: () => {}, pragma: () => {} },
  serverState: { workspaceDir: '' },
  dataDir: 'C:\\fake-data-root',
}));

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  hasSqliteVec: false,
  get dataDir() { return hoisted.dataDir; },
}));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));
vi.mock('../src/auth.js', () => ({ authMiddleware: (_r: any, _s: any, n: any) => n() }));

const { normalizeStoredPathForTest } = await import('../src/routes/files.js');

beforeEach(() => {
  hoisted.serverState.workspaceDir = '';
});

describe('normalizeStoredPath · 历史相对路径补全', () => {
  it('产物形态的相对路径补成绝对路径', () => {
    const rel = '.yan-zhi\\tasks\\conv-1\\deliverables\\image-1.png';
    const out = normalizeStoredPathForTest(rel, 'conv-1', 'deliverable');
    expect(path.isAbsolute(out)).toBe(true);
    expect(out.endsWith('image-1.png')).toBe(true);
    expect(out).toContain('.yan-zhi');
  });

  it('以 ./ 开头的产物相对路径同样补全', () => {
    const out = normalizeStoredPathForTest('./.yan-zhi/tasks/c1/deliverables/a.png', 'c1', 'deliverable');
    expect(path.isAbsolute(out)).toBe(true);
  });

  it('Windows 盘符绝对路径原样返回', () => {
    const abs = 'C:\\Users\\me\\pic.png';
    expect(normalizeStoredPathForTest(abs, 'c1', 'deliverable')).toBe(abs);
  });

  it('POSIX 绝对路径原样返回', () => {
    const abs = '/home/me/pic.png';
    expect(normalizeStoredPathForTest(abs, 'c1', 'deliverable')).toBe(abs);
  });

  it('非产物形态的相对路径不误伤（如用户自己的 ./report.md）', () => {
    const raw = './2024年中秋礼品与手机选购指南.md';
    expect(normalizeStoredPathForTest(raw, 'c1', 'intermediate')).toBe(raw);
  });

  it('空值安全', () => {
    expect(normalizeStoredPathForTest('', 'c1', 'deliverable')).toBe('');
    expect(normalizeStoredPathForTest(null as any, 'c1', 'deliverable')).toBe('');
  });
});