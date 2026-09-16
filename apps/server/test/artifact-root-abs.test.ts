/**
 * 产物根解析（resolveArtifactRoot）的绝对路径保证 —— 单测。
 *
 * 背景（真实 bug）：`resolveArtifactRoot` 的注释写「兜底到数据根」，但实现是
 * `return (process.env.DATA_DIR || '').trim()` —— dev 模式不注入 DATA_DIR，
 * 于是三级全空时返回**空串**，`joinArtifactPath('', rel)` 产出**相对路径**：
 *   1. 落盘位置随服务端进程 cwd 漂移
 *   2. 登记进 conversation_file 的 path 也是相对的
 *   3. 渲染层按自己的 cwd 去 readFileBase64 必 ENOENT
 *      （表现为「图片已落盘但预览窗/另存为报文件不存在」）
 *
 * 修复后用 db.ts 的 dataDir（绝对路径）兜底。这里钉死：
 *   - 三级都空 → 仍返回绝对路径（非空、非相对）
 *   - 空间目录 / 工作目录的优先级不变
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

const hoisted = vi.hoisted(() => ({
  db: { prepare: () => ({ get: () => undefined, all: () => [], run: () => {} }), exec: () => {}, pragma: () => {} },
  serverState: { workspaceDir: '' },
  /** 模拟 db.ts 的 dataDir：绝对路径（写死 Windows 风格，避免 hoisted 里引用 import 的 path） */
  fakeDataDir: 'C:\\fake-data-root',
}));

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  hasSqliteVec: false,
  get dataDir() { return hoisted.fakeDataDir; },
}));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

const { resolveArtifactRoot } = await import('../src/services/artifact-dir.js');

beforeEach(() => {
  hoisted.serverState.workspaceDir = '';
});
afterEach(() => {
  delete process.env.DATA_DIR;
});

describe('resolveArtifactRoot · 绝对路径保证', () => {
  it('三级全空（无空间/无工作目录/未设 DATA_DIR）仍返回绝对路径', () => {
    delete process.env.DATA_DIR;
    const root = resolveArtifactRoot(null);
    expect(root.length).toBeGreaterThan(0);
    expect(path.isAbsolute(root)).toBe(true);
  });

  it('空串 / 空白 / undefined 的 spaceDir 都走兜底，不产生空根', () => {
    for (const v of [null, undefined, '', '   ']) {
      const root = resolveArtifactRoot(v as any);
      expect(path.isAbsolute(root)).toBe(true);
    }
  });

  it('工作目录优先于数据根，且不会被再次相对化', () => {
    hoisted.serverState.workspaceDir = path.resolve('C:/ws-root');
    expect(resolveArtifactRoot(null)).toBe(path.resolve('C:/ws-root'));
  });

  it('空间目录优先级最高（工作目录存在也不影响）', () => {
    hoisted.serverState.workspaceDir = path.resolve('C:/ws-root');
    const spaceDir = path.resolve('C:/space-root');
    expect(resolveArtifactRoot(spaceDir)).toBe(spaceDir);
  });

  it('空间目录为空白时回落工作目录', () => {
    hoisted.serverState.workspaceDir = path.resolve('C:/ws-root');
    expect(resolveArtifactRoot('  ')).toBe(path.resolve('C:/ws-root'));
  });
});