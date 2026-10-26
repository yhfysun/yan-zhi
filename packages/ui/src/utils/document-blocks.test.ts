// 文档围栏块解析单测。
import { describe, it, expect } from 'vitest';
import { extractDocumentBlocks, stripDocumentBlocks } from './document-blocks';

const DOC = {
  type: 'weekly-report',
  title: '第 43 周数据周报',
  sections: [
    { kind: 'paragraph', text: '本周整体平稳。' },
    { kind: 'infographic', syntax: 'infographic list-row-horizontal-icon-arrow\ndata\n  title 渠道结构' },
  ],
};

const MD = ['摘要如下', '', '```document', JSON.stringify(DOC, null, 2), '```', '', '结尾'].join('\n');

describe('extractDocumentBlocks', () => {
  it('解析合法文档并保留信息图 section', () => {
    const blocks = extractDocumentBlocks(MD);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ok).toBe(true);
    if (!blocks[0].ok) return;
    expect(blocks[0].doc.type).toBe('weekly-report');
    expect(blocks[0].doc.sections).toHaveLength(2);
    expect(blocks[0].doc.sections[1].kind).toBe('infographic');
  });

  it('非法 JSON 返回可读错误', () => {
    const blocks = extractDocumentBlocks('```document\n{ 不是 json\n```');
    expect(blocks[0].ok).toBe(false);
    if (blocks[0].ok) return;
    expect(blocks[0].error).toMatch(/JSON 解析失败/);
  });

  it('缺 title / sections 被拒', () => {
    const noTitle = extractDocumentBlocks('```document\n{"type":"weekly-report","sections":[{"kind":"paragraph","text":"x"}]}\n```');
    expect(noTitle[0].ok).toBe(false);
    const noSections = extractDocumentBlocks('```document\n{"type":"weekly-report","title":"x","sections":[]}\n```');
    expect(noSections[0].ok).toBe(false);
  });

  it('未知 section kind 被拒并指出位置', () => {
    const bad = extractDocumentBlocks('```document\n{"type":"t","title":"x","sections":[{"kind":"video"}]}\n```');
    expect(bad[0].ok).toBe(false);
    if (bad[0].ok) return;
    expect(bad[0].error).toMatch(/第 1 段/);
  });

  it('流式未闭合的围栏不抽', () => {
    expect(extractDocumentBlocks('```document\n{"type":"t","title":"x"')).toEqual([]);
  });

  it('支持 ```ydoc 围栏别名（与文件同构）', () => {
    const blocks = extractDocumentBlocks('```ydoc\n' + JSON.stringify(DOC) + '\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ok).toBe(true);
  });
});

describe('stripDocumentBlocks', () => {
  it('剥掉围栏，保留前后正文', () => {
    expect(stripDocumentBlocks(MD)).toBe('摘要如下\n\n结尾');
  });
});
