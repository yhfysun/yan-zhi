/**
 * 扫描入口卡（安全控制台）单测。
 *
 * 钉住：卡片数量与命令名、带空格路径的引号、自有资产可空目标、以及「非自有资产必须填目标」。
 * 这些拼错 typecheck 抓不到，点下去才发现——所以放在纯函数层测。
 */
import { describe, it, expect } from 'vitest';
import { SCAN_ENTRIES, buildScanCommand, findScanEntry } from './scanEntries';

describe('扫描入口卡 · 元数据', () => {
  it('四类入口，key 与命令一一对应', () => {
    expect(SCAN_ENTRIES.map((e) => e.key)).toEqual(['source', 'url', 'package', 'self']);
    expect(SCAN_ENTRIES.map((e) => e.cmd)).toEqual(['scan-source', 'scan-url', 'scan-package', 'scan-self']);
  });

  it('每张卡都有面板需要的说明与剖面', () => {
    for (const e of SCAN_ENTRIES) {
      expect(e.label).toBeTruthy();
      expect(e.sub).toBeTruthy();
      expect(e.placeholder).toBeTruthy();
      expect(e.note).toBeTruthy();
      expect(e.profiles.length).toBeGreaterThan(0);
      expect(e.profiles).toContain('quick');
    }
  });
});

describe('扫描入口卡 · 命令拼装', () => {
  const source = findScanEntry('source')!;
  const self = findScanEntry('self')!;

  it('带空格的路径加引号', () => {
    expect(buildScanCommand(source, 'C:\\work\\my repo', 'quick'))
      .toBe('/scan-source "C:\\work\\my repo" --profile=quick');
  });

  it('URL 与普通路径同样处理', () => {
    const url = findScanEntry('url')!;
    expect(buildScanCommand(url, 'https://example.com/a?b=1', 'deep'))
      .toBe('/scan-url "https://example.com/a?b=1" --profile=deep');
  });

  it('目标里的双引号会被移除，避免截断命令', () => {
    expect(buildScanCommand(source, 'C:\\a"b', 'quick')).toBe('/scan-source "C:\\ab" --profile=quick');
  });

  it('自有资产体检允许空目标', () => {
    expect(buildScanCommand(self, '   ', 'standard')).toBe('/scan-self --profile=standard');
  });

  it('非自有资产必须填目标', () => {
    expect(() => buildScanCommand(source, '', 'quick')).toThrow('请先填写扫描目标');
    expect(() => buildScanCommand(source, '   ', 'quick')).toThrow();
  });

  it('未知 key 返回 null', () => {
    expect(findScanEntry('nope')).toBeNull();
  });
});
