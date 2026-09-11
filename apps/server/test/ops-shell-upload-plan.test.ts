/**
 * SFTP 上传清单展开（buildUploadPlan）单元测试
 *
 * 背景：拖拽/选择上传时，前端只传本地绝对路径（文件或文件夹），
 * 目录结构由后端递归展开，保证：
 *  - 文件夹拖入后远端保留完整目录树
 *  - 多文件/文件夹上传的进度基数（totalBytes）正确，进度条不会来回跳
 *
 * 覆盖：单文件 / 自定义 rel 前缀 / 目录递归 / 多层嵌套 / 空目录 /
 *       路径不存在抛错 / Windows 反斜杠归一化 / 混合多项 / 空 localPath 跳过
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// crypto→db 会在模块加载时打开 sqlite，单测里替换为可逆假实现
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { buildUploadPlan } from '../src/plugins/ops-shell.js';

/** 统一转正斜杠，规避 Windows 分隔符差异 */
const fwd = (p: string) => p.replace(/\\/g, '/');

let root = '';
let singleFile = '';
let treeDir = '';
let emptyDir = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ops-upload-plan-'));
  singleFile = join(root, 'app.log');
  writeFileSync(singleFile, 'x'.repeat(10)); // 10 字节

  // 目录树：treeDir/{a.txt, sub/{b.txt, deep/{c.txt}}, empty/}
  treeDir = join(root, 'tree');
  mkdirSync(join(treeDir, 'sub', 'deep'), { recursive: true });
  mkdirSync(join(treeDir, 'empty'), { recursive: true });
  writeFileSync(join(treeDir, 'a.txt'), 'aaaa');       // 4
  writeFileSync(join(treeDir, 'sub', 'b.txt'), 'bbbbb'); // 5
  writeFileSync(join(treeDir, 'sub', 'deep', 'c.txt'), 'cc'); // 2

  emptyDir = join(root, 'blank');
  mkdirSync(emptyDir, { recursive: true });
});

afterAll(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('buildUploadPlan 单文件', () => {
  it('缺省 rel 取 basename，dest 拼到目标目录下', () => {
    const { plan, totalBytes } = buildUploadPlan([{ localPath: singleFile }], '/upload');
    expect(plan).toHaveLength(1);
    expect(plan[0].src).toBe(fwd(singleFile));
    expect(plan[0].dest).toBe('/upload/app.log');
    expect(plan[0].size).toBe(10);
    expect(totalBytes).toBe(10);
  });

  it('显式 rel 前缀生效（可落到子目录）', () => {
    const { plan } = buildUploadPlan([{ localPath: singleFile, rel: 'logs/2026/app.log' }], '/upload');
    expect(plan[0].dest).toBe('/upload/logs/2026/app.log');
  });

  it('rel 的 Windows 反斜杠与首部斜杠被归一化', () => {
    const { plan } = buildUploadPlan([{ localPath: singleFile, rel: '\\logs\\app.log' }], '/upload');
    expect(plan[0].dest).toBe('/upload/logs/app.log');
  });

  it('空 localPath 项被跳过（不抛错）', () => {
    const { plan, totalBytes } = buildUploadPlan([{ localPath: '' }, { localPath: '   ' }], '/upload');
    expect(plan).toHaveLength(0);
    expect(totalBytes).toBe(0);
  });
});

describe('buildUploadPlan 目录递归', () => {
  it('保留完整目录树，rel 前缀取目录名', () => {
    const { plan, totalBytes } = buildUploadPlan([{ localPath: treeDir }], '/upload');
    const dests = plan.map((p) => p.dest).sort();
    expect(dests).toEqual([
      '/upload/tree/a.txt',
      '/upload/tree/sub/b.txt',
      '/upload/tree/sub/deep/c.txt',
    ]);
    // 空目录不会产出条目
    expect(dests.some((d) => d.includes('/empty'))).toBe(false);
    expect(totalBytes).toBe(4 + 5 + 2);
  });

  it('显式 rel 覆盖目录名前缀', () => {
    const { plan } = buildUploadPlan([{ localPath: treeDir, rel: 'release/v1' }], '/upload');
    const dests = plan.map((p) => p.dest).sort();
    expect(dests).toEqual([
      '/upload/release/v1/a.txt',
      '/upload/release/v1/sub/b.txt',
      '/upload/release/v1/sub/deep/c.txt',
    ]);
  });

  it('空目录展开为空清单', () => {
    const { plan, totalBytes } = buildUploadPlan([{ localPath: emptyDir }], '/upload');
    expect(plan).toHaveLength(0);
    expect(totalBytes).toBe(0);
  });

  it('src 均为文件绝对路径（正斜杠）', () => {
    const { plan } = buildUploadPlan([{ localPath: treeDir }], '/upload');
    for (const p of plan) {
      expect(p.src.startsWith(fwd(root))).toBe(true);
      expect(p.src).not.toContain('\\');
    }
  });
});

describe('buildUploadPlan 混合与异常', () => {
  it('多文件 + 目录混合时 totalBytes 累加', () => {
    const { plan, totalBytes } = buildUploadPlan(
      [{ localPath: singleFile }, { localPath: treeDir }],
      '/upload',
    );
    expect(plan).toHaveLength(4);
    expect(totalBytes).toBe(10 + 4 + 5 + 2);
  });

  it('路径不存在 → 抛错（由调用方转 400，而不是静默跳过）', () => {
    expect(() => buildUploadPlan([{ localPath: join(root, 'not-exist.txt') }], '/upload')).toThrow();
  });

  it('目标目录为根时不产生重复斜杠', () => {
    const { plan } = buildUploadPlan([{ localPath: singleFile }], '/');
    expect(plan[0].dest).toBe('/app.log');
  });
});
