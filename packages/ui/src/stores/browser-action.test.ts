import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBrowserDownloadAction } from './browser-action';

describe('normalizeBrowserDownloadAction', () => {
  it('无参数调用 browser_download 时改走 downloads 查询', () => {
    expect(normalizeBrowserDownloadAction('browser_download', {}, 'download')).toBe('downloads');
  });

  it('只传 limit 时仍走 downloads 查询', () => {
    expect(normalizeBrowserDownloadAction('browser_download', { limit: 10 }, 'download')).toBe('downloads');
  });

  it('显式 url / selector / index 时保留 download 触发动作', () => {
    expect(normalizeBrowserDownloadAction('browser_download', { url: 'https://a.test/a.xlsx' }, 'download')).toBe('download');
    expect(normalizeBrowserDownloadAction('browser_download', { selector: 'button:contains(下载)' }, 'download')).toBe('download');
    expect(normalizeBrowserDownloadAction('browser_download', { index: 36 }, 'download')).toBe('download');
  });

  it('暂停/恢复下载改走 download_control，不能被无参查询规则吞掉', () => {
    expect(normalizeBrowserDownloadAction('browser_download', { operation: 'pause' }, 'download')).toBe('download_control');
    expect(normalizeBrowserDownloadAction('browser_download', { operation: 'resume', downloadId: 4 }, 'download')).toBe('download_control');
  });

  it('其他工具动作不受影响', () => {
    expect(normalizeBrowserDownloadAction('browser_click', {}, 'click')).toBe('click');
  });

  it('downloads.waitMs 的 IPC 超时预算必须覆盖主进程等待窗口', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'chat.ts'), 'utf8');
    expect(source).toContain("action === 'downloads'");
    expect(source).toContain('Number((args as any)?.waitMs)');
    expect(source).toContain('Math.min(Math.max(Number((args as any)?.waitMs) || 0, 0), 30000) + 5000');
  });
});
