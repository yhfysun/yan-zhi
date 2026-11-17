import { describe, expect, it } from 'vitest';
import { decodeBookBytes, parseBookText } from './library-import';

describe('learning library import', () => {
  it('splits common Chinese and English chapter headings', () => {
    const book = parseBookText(
      '第一卷 风起\n这是序章。\n\n第一章 夜航\n灯火亮起。\n\n第二章 归途\n船靠岸了。\n\nChapter 3 Home\nAt last.',
      'my-novel.txt',
    );

    expect(book.title).toBe('my-novel');
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      '第一卷 风起',
      '第一章 夜航',
      '第二章 归途',
      'Chapter 3 Home',
    ]);
    expect(book.chapters[1].paragraphs).toEqual(['灯火亮起。']);
  });

  it('decodes UTF-8 and falls back to GB18030 for local web novels', () => {
    expect(decodeBookBytes(new TextEncoder().encode('第一章 夜航'))).toBe('第一章 夜航');

    const gb18030 = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20]);
    expect(decodeBookBytes(gb18030)).toContain('第一章');
  });
});
