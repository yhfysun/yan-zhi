// SVG 围栏块解析单测。
import { describe, it, expect } from 'vitest';
import { extractSvgBlocks, stripSvgBlocks, svgToDataUrl } from './svg-blocks';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="10" height="10"/></svg>';
const MD = ['趋势如下', '', '```svg', SVG, '```', '', '结论'].join('\n');

describe('svg-blocks', () => {
  it('抽出以 <svg 开头的围栏', () => {
    expect(extractSvgBlocks(MD)).toEqual([SVG]);
  });

  it('非 SVG 的 ```svg 代码片段原样保留', () => {
    const md = '```svg\nconst x = 1;\n```';
    expect(extractSvgBlocks(md)).toEqual([]);
    expect(stripSvgBlocks(md)).toBe(md);
  });

  it('剥掉 SVG 围栏，保留前后正文', () => {
    expect(stripSvgBlocks(MD)).toBe('趋势如下\n\n结论');
  });

  it('未闭合围栏不抽', () => {
    expect(extractSvgBlocks('```svg\n<svg xmlns="x">')).toEqual([]);
  });

  it('data URL 可编码中文与特殊字符', () => {
    const url = svgToDataUrl('<svg><text>对话量 & 增长</text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',')[1])).toContain('对话量 & 增长');
  });
});
