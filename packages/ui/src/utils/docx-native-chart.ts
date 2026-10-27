// 把 .docx 里的占位段落替换成 **Word 原生图表**（可在 Word 里编辑数据/切换图型）。
//
// 为什么不用 docx 库直接支持：docx@9 只提供图片，没有图表 API。做法是：
//   buildReportDocx 先写入一段带唯一标记的占位文本 → 这里用 JSZip 二次加工 zip：
//   ① 生成 word/charts/chartN.xml（ChartSpace：line/bar/area/pie）
//   ② 用 ExcelJS 生成内嵌工作簿 word/embeddings/WorkbookN.xlsx，供 Word「编辑数据」
//   ③ 补 document.xml.rels / [Content_Types].xml
//   ④ 把占位段落替换成 <w:drawing>（引用图表部件）
// 这样导出的 docx 里图表是真正的 Office 图表对象，可改数据、切图型。
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export type NativeChartKind = 'line' | 'area' | 'bar' | 'pie';

export interface NativeChartSeries {
  name: string;
  values: number[];
}

export interface NativeChartData {
  kind: NativeChartKind;
  categories: string[];
  series: NativeChartSeries[];
}

const PALETTE = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', '06B6D4', 'F43F5E', '84CC16', '6366F1', '14B8A6'];
// 图表尺寸：正文可用宽度（Letter 8.5in - 左右各 1in = 6.5in）的 80%，等比 1.714（对齐 harness）
const EMU_W = 4754880; // 5.2in
const EMU_H = 2773680; // 3.03in

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function u8(src: Uint8Array | ArrayBuffer): Uint8Array {
  return src instanceof Uint8Array ? src : new Uint8Array(src);
}

/** 一个系列的 <c:ser>（cat 是字符串缓存，val 是数值缓存） */
function seriesXml(
  s: NativeChartSeries,
  idx: number,
  col: number,
  rowCount: number,
  categories: string[],
  kind: NativeChartKind,
): string {
  const colLetter = String.fromCharCode(65 + col); // B, C, D…
  const last = rowCount + 1; // 行号：表头 1，数据 2..N+1
  const color = PALETTE[idx % PALETTE.length];
  const pts = s.values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`).join('');
  const catPts = categories.map((c, i) => `<c:pt idx="${i}"><c:v>${esc(c)}</c:v></c:pt>`).join('');
  const isLine = kind === 'line' || kind === 'area';
  const spPr = isLine
    ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>`
    : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`;
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>`
    + `<c:tx><c:strRef><c:f>Sheet1!$${colLetter}$1</c:f><c:strCache><c:ptCount val="1"/>`
    + `<c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    + spPr
    + `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${last}</c:f><c:strCache><c:ptCount val="${rowCount}"/>${catPts}</c:strCache></c:strRef></c:cat>`
    + `<c:val><c:numRef><c:f>Sheet1!$${colLetter}$2:$${colLetter}$${last}</c:f><c:numCache>`
    + `<c:formatCode>General</c:formatCode><c:ptCount val="${rowCount}"/>${pts}</c:numCache></c:numRef></c:val>`
    + (kind === 'line' ? '<c:marker><c:symbol val="none"/></c:marker><c:smooth val="1"/>' : '')
    + `</c:ser>`;
}

const AXIS_LINE = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9E1EC"/></a:solidFill></a:ln></c:spPr>';
const GRID_LINE = '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EEF2F7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
const CHART_FONT = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">'
  + '<a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:defRPr></a:pPr>'
  + '<a:endParaRPr lang="zh-CN"/></a:p></c:txPr>';

function catAxisXml(axId: number, crossId: number): string {
  return `<c:catAx><c:axId val="${axId}"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/>`
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + AXIS_LINE + CHART_FONT
    + `<c:crossAx val="${crossId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/>`
    + `<c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
}

function valAxisXml(axId: number, crossId: number): string {
  return `<c:valAx><c:axId val="${axId}"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="l"/>${GRID_LINE}`
    + `<c:numFmt formatCode="General" sourceLinked="1"/>`
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + AXIS_LINE + CHART_FONT
    + `<c:crossAx val="${crossId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
}

/** 生成一张图表的 ChartSpace XML */
export function buildChartSpaceXml(data: NativeChartData): string {
  const cats = data.categories.length ? data.categories : [''];
  const sers = data.series.length ? data.series : [{ name: '值', values: cats.map(() => 0) }];
  const n = cats.length;
  const serXml = sers.map((s, i) => seriesXml(s, i, i + 1, n, cats, data.kind)).join('');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:roundedCorners val="0"/><c:chart>';

  let plot: string;
  if (data.kind === 'pie') {
    plot = `<c:pieChart><c:varyColors val="1"/>${seriesXml(sers[0], 0, 1, n, cats, 'pie')}<c:firstSliceAng val="0"/></c:pieChart>`;
  } else if (data.kind === 'bar') {
    plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>`
      + `${serXml}<c:gapWidth val="120"/><c:axId val="100000001"/><c:axId val="100000002"/></c:barChart>`
      + catAxisXml(100000001, 100000002) + valAxisXml(100000002, 100000001);
  } else if (data.kind === 'area') {
    plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>`
      + `${serXml}<c:axId val="100000001"/><c:axId val="100000002"/></c:areaChart>`
      + catAxisXml(100000001, 100000002) + valAxisXml(100000002, 100000001);
  } else {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>`
      + `${serXml}<c:marker val="1"/><c:axId val="100000001"/><c:axId val="100000002"/></c:lineChart>`
      + catAxisXml(100000001, 100000002) + valAxisXml(100000002, 100000001);
  }

  return head
    + `<c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}</c:plotArea>`
    + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${CHART_FONT}</c:legend>`
    + `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>`
    + `</c:chart>${CHART_FONT}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

function chartParagraphXml(relId: string, n: number): string {
  return `<w:p><w:r><w:drawing>`
    + `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`
    + ` distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${EMU_W}" cy="${EMU_H}"/><wp:docPr id="${1000 + n}" name="Chart ${n}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">`
    + `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** 内嵌工作簿：Sheet1 第一行表头（类别 + 各系列名），其后逐行数据 */
async function buildWorkbook(data: NativeChartData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  const sers = data.series.length ? data.series : [{ name: '值', values: data.categories.map(() => 0) }];
  ws.addRow(['类别', ...sers.map((s) => s.name)]);
  data.categories.forEach((c, i) => ws.addRow([c, ...sers.map((s) => (Number.isFinite(s.values[i]) ? s.values[i] : 0))]));
  const buf = await wb.xlsx.writeBuffer();
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBufferLike);
}

/**
 * 把 docx 里 `__YZCHART_n__` 占位段落替换成原生图表。
 * charts 的 marker 与 buildReportDocx 写入的标记一一对应。
 */
export async function injectNativeCharts(
  docxBytes: Uint8Array | ArrayBuffer,
  charts: Array<{ marker: string; data: NativeChartData }>,
): Promise<Uint8Array> {
  if (!charts.length) return u8(docxBytes);
  const zip = await JSZip.loadAsync(docxBytes);
  let docXml = await zip.file('word/document.xml')!.async('string');
  let relsXml = await zip.file('word/_rels/document.xml.rels')!.async('string');
  let ctXml = await zip.file('[Content_Types].xml')!.async('string');

  for (let i = 0; i < charts.length; i++) {
    const c = charts[i];
    const n = i + 1;
    const relId = `rIdYzChart${n}`;
    const wb = await buildWorkbook(c.data);
    zip.file(`word/embeddings/Workbook${n}.xlsx`, wb);
    zip.file(`word/charts/chart${n}.xml`, buildChartSpaceXml(c.data));
    zip.file(
      `word/charts/_rels/chart${n}.xml.rels`,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Workbook${n}.xlsx"/>`
      + '</Relationships>',
    );
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${n}.xml"/></Relationships>`,
    );
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/word/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`,
    );

    const re = new RegExp(`<w:p\\b[^>]*>(?:(?!</w:p>)[\\s\\S])*?${escRe(c.marker)}(?:(?!</w:p>)[\\s\\S])*?</w:p>`);
    docXml = docXml.replace(re, chartParagraphXml(relId, n));
  }

  if (!/Extension="xlsx"/i.test(ctXml)) {
    ctXml = ctXml.replace(
      '</Types>',
      '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>',
    );
  }

  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('[Content_Types].xml', ctXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
