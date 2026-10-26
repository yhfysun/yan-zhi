// Excel 导出（report-xlsx）单测：用 exceljs 回读生成的字节，校验 sheet / 表头 / 行值与名称净化。
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookXlsx, sanitizeSheetName } from './report-xlsx';

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

describe('sanitizeSheetName', () => {
  it('把非法字符替换为下划线', () => {
    expect(sanitizeSheetName('明细/汇总[1]')).toBe('明细_汇总_1_');
  });

  it('截断到 31 字符，空名回退', () => {
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName('   ')).toBe('Sheet');
  });
});

describe('buildWorkbookXlsx', () => {
  it('多 sheet 各就位，表头与行值可回读', async () => {
    const bytes = await buildWorkbookXlsx([
      {
        name: '明细',
        columns: ['城市', '金额', '备注'],
        rows: [['杭州', 1280, null], ['上海', 960, '补录']],
      },
      {
        name: '聚合',
        columns: ['日期', '销售', '退货'],
        rows: [['2026-10-01', 10, 1]],
      },
    ]);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K

    const wb = await readBack(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['明细', '聚合']);

    const detail = wb.getWorksheet('明细')!;
    expect([1, 2, 3].map((c) => detail.getRow(1).getCell(c).value)).toEqual(['城市', '金额', '备注']);
    // exceljs 回读时会裁掉尾部的空单元格，所以逐格取值断言空值
    expect(detail.getRow(2).getCell(1).value).toBe('杭州');
    expect(detail.getRow(2).getCell(2).value).toBe(1280);
    expect(detail.getRow(2).getCell(3).value ?? null).toBeNull();
    expect([1, 2, 3].map((c) => detail.getRow(3).getCell(c).value)).toEqual(['上海', 960, '补录']);
  });

  it('同名 sheet 自动去重，不留 exceljs 的静默后缀', async () => {
    const bytes = await buildWorkbookXlsx([
      { name: '数据', columns: ['a'], rows: [[1]] },
      { name: '数据', columns: ['b'], rows: [[2]] },
    ]);
    const wb = await readBack(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['数据', '数据_2']);
  });

  it('空列 sheet 跳过，不生成空页', async () => {
    const bytes = await buildWorkbookXlsx([
      { name: '空', columns: [], rows: [] },
      { name: '实', columns: ['a'], rows: [[1]] },
    ]);
    const wb = await readBack(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['实']);
  });
});
