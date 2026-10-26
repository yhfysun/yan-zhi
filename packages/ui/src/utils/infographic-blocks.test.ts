// 信息图围栏块解析单测。
import { describe, it, expect } from 'vitest';
import { extractInfographicBlocks, stripInfographicBlocks } from './infographic-blocks';

const SAMPLE = [
  '正文开头',
  '',
  '```infographic',
  'infographic list-row-horizontal-icon-arrow',
  'data',
  '  title 客户增长引擎',
  '  lists',
  '    - label 获客',
  '      value 18.6',
  '```',
  '',
  '正文结尾',
].join('\n');

describe('extractInfographicBlocks', () => {
  it('抽出围栏块并取 data.title 作为卡片标题', () => {
    const blocks = extractInfographicBlocks(SAMPLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe('客户增长引擎');
    expect(blocks[0].syntax.startsWith('infographic list-row')).toBe(true);
  });

  it('没有 data.title 时退回模板名', () => {
    const blocks = extractInfographicBlocks('```infographic\ninfographic sequence-timeline-simple\ndata\n  sequences\n    - label 一\n```');
    expect(blocks[0].title).toBe('sequence-timeline-simple');
  });

  it('支持一条消息里多个围栏块', () => {
    const md = `${SAMPLE}\n\n${SAMPLE}`;
    expect(extractInfographicBlocks(md)).toHaveLength(2);
  });

  it('流式未闭合的围栏不抽（原样留给正文）', () => {
    const md = '```infographic\ninfographic list-row\n data\n  title 半截';
    expect(extractInfographicBlocks(md)).toEqual([]);
  });

  it('空语法块被忽略', () => {
    expect(extractInfographicBlocks('```infographic\n\n```')).toEqual([]);
  });
});

describe('stripInfographicBlocks', () => {
  it('剥掉围栏，保留前后正文', () => {
    const text = stripInfographicBlocks(SAMPLE);
    expect(text).toBe('正文开头\n\n正文结尾');
    expect(text).not.toContain('infographic');
  });

  it('没有围栏时原样返回', () => {
    expect(stripInfographicBlocks('普通正文\n\n第二段')).toBe('普通正文\n\n第二段');
  });
});
