// Word 导出（report-docx）单测：确保生成的是合法 zip（PK 头）且各块不抛错。
// 注：不校验 Word 内部 XML 细节，只守住「能生成、能带图、空文档不崩」。
import { describe, it, expect } from 'vitest';
import { buildReportDocx } from './report-docx';

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('buildReportDocx', () => {
  it('生成合法 docx（PK zip 头）', async () => {
    const blob = await buildReportDocx({
      title: '第 43 周数据周报',
      subtitle: '2026-10-20 ~ 2026-10-26',
      blocks: [
        { type: 'heading', level: 2, text: '本周概览' },
        { type: 'paragraph', text: '整体平稳。' },
        { type: 'metrics', items: [{ label: '对话数', value: '1,284', hint: '环比 +6.2%' }] },
        { type: 'table', columns: ['事项', '负责人'], rows: [['补齐埋点', '张三']] },
        { type: 'pageBreak' },
      ],
    });
    const bytes = await bytesOf(blob);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('图片块可以嵌入（信息图/图表导出的 PNG）', async () => {
    const without = await buildReportDocx({ title: 't', blocks: [] });
    const withImage = await buildReportDocx({
      title: 't',
      blocks: [{ type: 'image', dataUrl: PNG_1X1, caption: '图 1' }],
    });
    expect((await bytesOf(withImage)).length).toBeGreaterThan((await bytesOf(without)).length);
  });

  it('空文档不崩', async () => {
    const blob = await buildReportDocx({ title: '空', blocks: [] });
    expect((await bytesOf(blob)).length).toBeGreaterThan(500);
  });

  it('坏图片只跳过该图，不影响整份文档', async () => {
    const blob = await buildReportDocx({
      title: 't',
      blocks: [
        { type: 'paragraph', text: '正文' },
        { type: 'image', dataUrl: 'data:image/png;base64,%%%', caption: '坏图' },
      ],
    });
    expect((await bytesOf(blob)).length).toBeGreaterThan(500);
  });
});
