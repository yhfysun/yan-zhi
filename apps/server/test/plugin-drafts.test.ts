// 插件草稿（P2）：隔离目录 + 人工审核
//
// 关键断言：草稿物理上不在 installed 目录 → 装载器不可能扫到（未审核不可执行）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDraft, listDrafts, getDraft, deleteDraft, approveDraft,
  draftsDir, installedDir,
} from '../src/services/plugin-drafts.js';

const MANIFEST = {
  id: 'demo-widget',
  name: '示例组件',
  version: '0.1.0',
  main: 'backend/index.js',
  permissions: ['fs'],
};

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-drafts-'));
  process.env.YZ_DRAFTS_DIR = path.join(root, 'drafts');
  process.env.YZ_INSTALLED_DIR = path.join(root, 'installed');
});

afterEach(() => {
  delete process.env.YZ_DRAFTS_DIR;
  delete process.env.YZ_INSTALLED_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('插件草稿', () => {
  it('创建：写在隔离目录，不在已安装目录', async () => {
    const meta = await createDraft({
      manifest: MANIFEST,
      files: { 'backend/index.js': 'export function activate() {}' },
      source: 'agent',
    });
    expect(meta.id).toBe('demo-widget');
    expect(meta.source).toBe('agent');
    expect(fs.existsSync(path.join(draftsDir(), 'demo-widget', 'backend', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir(), 'demo-widget'))).toBe(false);
  });

  it('拒绝：路径穿越 / 缺入口 / 非法清单', async () => {
    await expect(createDraft({
      manifest: MANIFEST,
      files: { '../evil.js': 'x', 'backend/index.js': '' },
    })).rejects.toThrow(/非法文件路径/);

    await expect(createDraft({
      manifest: MANIFEST,
      files: { 'other.js': 'x' },
    })).rejects.toThrow(/入口文件缺失/);

    await expect(createDraft({
      manifest: { id: 'Bad Id', name: 'x', version: '1' },
      files: { 'index.js': 'x' },
    })).rejects.toThrow();
  });

  it('审核：确认串必须精确匹配', async () => {
    await createDraft({ manifest: MANIFEST, files: { 'backend/index.js': 'x' } });
    const r1 = await approveDraft('demo-widget', 'approve');
    expect(r1.ok).toBe(false);
    const r2 = await approveDraft('demo-widget', 'approve other');
    expect(r2.ok).toBe(false);
    // 未通过时草稿仍在隔离目录
    expect(fs.existsSync(path.join(draftsDir(), 'demo-widget'))).toBe(true);
  });

  it('审核通过：移动到已安装目录并清掉草稿元数据', async () => {
    await createDraft({ manifest: MANIFEST, files: { 'backend/index.js': 'x' } });
    const r = await approveDraft('demo-widget', 'approve demo-widget');
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(draftsDir(), 'demo-widget'))).toBe(false);
    expect(fs.existsSync(path.join(installedDir(), 'demo-widget', 'backend', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir(), 'demo-widget', '.draft.json'))).toBe(false);
  });

  it('审核通过：同名已安装时拒绝', async () => {
    fs.mkdirSync(path.join(installedDir(), 'demo-widget'), { recursive: true });
    await createDraft({ manifest: MANIFEST, files: { 'backend/index.js': 'x' } });
    const r = await approveDraft('demo-widget', 'approve demo-widget');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('already-installed');
  });

  it('列表 / 详情 / 删除', async () => {
    await createDraft({ manifest: MANIFEST, files: { 'backend/index.js': 'code' } });
    const list = await listDrafts();
    expect(list).toHaveLength(1);
    expect(list[0].meta.id).toBe('demo-widget');

    const detail = await getDraft('demo-widget');
    expect(detail?.files['backend/index.js']).toBe('code');

    expect(await deleteDraft('demo-widget')).toBe(true);
    expect(await listDrafts()).toHaveLength(0);
  });
});
