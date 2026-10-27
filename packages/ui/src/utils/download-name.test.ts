import { describe, it, expect } from 'vitest';
import { downloadStamp, safeBaseName, stampedFileName, exportFileName } from './download-name';

const D = new Date(2026, 9, 27, 14, 30, 5); // 2026-10-27 14:30:05 本地时间

describe('downloadStamp', () => {
  it('输出 YYYYMMDD-HHmmss 本地时间', () => {
    expect(downloadStamp(D)).toBe('20261027-143005');
  });

  it('补零到两位', () => {
    expect(downloadStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405');
  });
});

describe('safeBaseName', () => {
  it('非法字符换成下划线', () => {
    expect(safeBaseName('a/b:c*d?e"f<g>h|i', 'x')).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('去掉结尾的点和空格；空值回退', () => {
    expect(safeBaseName('报告. ', 'fallback')).toBe('报告');
    expect(safeBaseName('   ', 'fallback')).toBe('fallback');
  });

  it('换行/制表符压成空格', () => {
    expect(safeBaseName('月度\n报告\t汇总', 'x')).toBe('月度 报告 汇总');
  });
});

describe('stampedFileName', () => {
  it('时间戳插在扩展名前', () => {
    expect(stampedFileName('季度报告.ydoc', D)).toBe('季度报告-20261027-143005.ydoc');
    expect(stampedFileName('看板.ydash', D)).toBe('看板-20261027-143005.ydash');
  });

  it('保留 .ychart.json 复合扩展名', () => {
    expect(stampedFileName('销售图.ychart.json', D)).toBe('销售图-20261027-143005.ychart.json');
  });

  it('没有扩展名 / 空名也能生成', () => {
    expect(stampedFileName('README', D)).toBe('README-20261027-143005');
    expect(stampedFileName('', D)).toBe('download-20261027-143005');
  });
});

describe('exportFileName', () => {
  it('标题 + 标签 + 时间戳 + 扩展名', () => {
    expect(exportFileName('月度经营报告', '.docx', { label: '图片', date: D }))
      .toBe('月度经营报告-图片-20261027-143005.docx');
  });

  it('扩展名可省略前导点；空标题回退', () => {
    expect(exportFileName('', 'png', { fallback: 'chart', date: D })).toBe('chart-20261027-143005.png');
  });

  it('标题里的非法字符被净化', () => {
    expect(exportFileName('销售/毛利:汇总', '.docx', { date: D }))
      .toBe('销售_毛利_汇总-20261027-143005.docx');
  });
});
