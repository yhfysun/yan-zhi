// markdown → docx 块 单测：守住聊天导出会用到的语法（标题/列表/表格/代码/图片）。
import { describe, it, expect } from 'vitest';
import { markdownToDocxBlocks, inlineToText } from './markdown-docx';

describe('inlineToText', () => {
  it('去掉强调/行内代码/链接，图片保留 alt', () => {
    expect(inlineToText('**加粗** 和 `code`')).toBe('加粗 和 code');
    expect(inlineToText('见 [文档](https://x.y)')).toBe('见 文档');
    expect(inlineToText('![趋势图](a.png)')).toBe('趋势图');
  });
});

describe('markdownToDocxBlocks', () => {
  it('标题按层级映射，超过 3 级降为 3 级', async () => {
    const blocks = await markdownToDocxBlocks('# 一级\n\n#### 四级');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: '一级' },
      { type: 'heading', level: 3, text: '四级' },
    ]);
  });

  it('中日文段落合并时不插空格', async () => {
    const blocks = await markdownToDocxBlocks('第一行\n第二行');
    expect(blocks).toEqual([{ type: 'paragraph', text: '第一行第二行' }]);
  });

  it('西文段落合并时插一个空格', async () => {
    const blocks = await markdownToDocxBlocks('hello\nworld');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'hello world' }]);
  });

  it('列表项保留层级缩进与有序编号', async () => {
    const blocks = await markdownToDocxBlocks('- 甲\n  - 乙\n1. 丙');
    expect(blocks).toEqual([
      { type: 'paragraph', text: '· 甲' },
      { type: 'paragraph', text: '    · 乙' },
      { type: 'paragraph', text: '1. 丙' },
    ]);
  });

  it('GFM 表格：识别分隔行，纯数字转数值，空单元格为 null', async () => {
    const md = '| 城市 | 金额 |\n| --- | ---: |\n| 杭州 | 1280 |\n| 上海 |  |';
    const blocks = await markdownToDocxBlocks(md);
    expect(blocks).toHaveLength(1);
    const table = blocks[0] as Extract<(typeof blocks)[number], { type: 'table' }>;
    expect(table.columns).toEqual(['城市', '金额']);
    expect(table.rows).toEqual([['杭州', 1280], ['上海', null]]);
  });

  it('代码围栏输出 code 块，保留语言', async () => {
    const blocks = await markdownToDocxBlocks('```ts\nconst a = 1;\n```');
    expect(blocks).toEqual([{ type: 'code', text: 'const a = 1;', lang: 'ts' }]);
  });

  it('ydash / infographic 围栏降级为占位说明，不塞 JSON 进正文', async () => {
    const blocks = await markdownToDocxBlocks('```ydash\n{"widgets":[]}\n```');
    expect(blocks).toEqual([{ type: 'paragraph', text: '[ydash 卡片，请在应用内查看]' }]);
  });

  it('图片通过 resolveImage 内嵌，取不到则降级为文字占位', async () => {
    const ok = await markdownToDocxBlocks('![图](a.png)', {
      resolveImage: async () => 'data:image/png;base64,AAA',
    });
    expect(ok).toEqual([{ type: 'image', dataUrl: 'data:image/png;base64,AAA', caption: '图' }]);

    const missing = await markdownToDocxBlocks('前 ![图](a.png) 后');
    expect(missing).toEqual([
      { type: 'paragraph', text: '前' },
      { type: 'paragraph', text: '[图片：图]' },
      { type: 'paragraph', text: '后' },
    ]);
  });

  it('分隔线与引用不产生空块', async () => {
    const blocks = await markdownToDocxBlocks('---\n\n> 结论\n\n---');
    expect(blocks).toEqual([{ type: 'paragraph', text: '│ 结论' }]);
  });

  it('空文本返回空数组', async () => {
    expect(await markdownToDocxBlocks('')).toEqual([]);
  });
});
