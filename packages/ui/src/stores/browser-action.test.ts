import { describe, expect, it } from 'vitest';
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

  it('其他工具动作不受影响', () => {
    expect(normalizeBrowserDownloadAction('browser_click', {}, 'click')).toBe('click');
  });
});
