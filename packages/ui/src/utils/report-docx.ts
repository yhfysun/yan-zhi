// 文档 → 原生 Word（.docx）
//
// 只吃「已解析好的块」：文字/指标/表格/图片。图表与信息图由渲染层先导出 PNG dataURL，
// 这里负责落成 Word 图片（按内容宽度等比缩放）。图表不存在服务端依赖 —— 前端 Chromium 出图。

import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { DocumentMetric } from './document-types';

export type DocxBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'metrics'; items: DocumentMetric[] }
  | { type: 'table'; columns: string[]; rows: Array<Array<string | number | null>>; caption?: string }
  | { type: 'image'; dataUrl: string; caption?: string }
  | { type: 'pageBreak' };

export interface ReportDocxInput {
  title: string;
  subtitle?: string;
  author?: string;
  blocks: DocxBlock[];
}

const MAX_IMAGE_WIDTH = 600;

/** PNG 宽高（IHDR 固定偏移）；非 PNG 返回 undefined */
function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fitImage(bytes: Uint8Array): { width: number; height: number } {
  const size = pngSize(bytes) || { width: 800, height: 450 };
  if (size.width <= MAX_IMAGE_WIDTH) return size;
  return {
    width: MAX_IMAGE_WIDTH,
    height: Math.round((size.height * MAX_IMAGE_WIDTH) / size.width),
  };
}

function captionParagraph(text?: string): Paragraph | null {
  if (!text) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text, italics: true, size: 18, color: '808080' })],
  });
}

function dataTable(columns: string[], rows: Array<Array<string | number | null>>): Table {
  const cell = (text: string, header: boolean) => new TableCell({
    shading: header ? { fill: 'F1F5F9' } : undefined,
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, bold: header, size: 20 })],
    })],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: columns.map((c) => cell(c, true)) }),
      ...rows.map((row) => new TableRow({
        children: columns.map((_, i) => cell(row[i] == null ? '' : String(row[i]), false)),
      })),
    ],
  });
}

function metricsTable(items: DocumentMetric[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: items.map((m) => new TableRow({
      children: [
        new TableCell({
          shading: { fill: 'F8FAFC' },
          children: [new Paragraph({ children: [new TextRun({ text: m.label, bold: true, size: 20 })] })],
        }),
        new TableCell({
          children: [new Paragraph({
            children: [
              new TextRun({ text: m.value, bold: true, size: 22 }),
              ...(m.hint ? [new TextRun({ text: `  ${m.hint}`, size: 18, color: '6B7280' })] : []),
            ],
          })],
        }),
      ],
    })),
  });
}

function headingLevel(level: 1 | 2 | 3) {
  return level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
}

/** 代码块：等宽字体 + 浅底，按行硬换行（Word 不会自动续行缩进） */
function codeParagraph(text: string): Paragraph {
  const lines = String(text || '').replace(/\s+$/, '').split('\n');
  const children: TextRun[] = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ text: line, font: 'Consolas', size: 17 }));
  });
  return new Paragraph({
    spacing: { before: 80, after: 160, line: 260 },
    shading: { type: ShadingType.CLEAR, fill: 'F6F8FA' },
    children,
  });
}

export async function buildReportDocx(input: ReportDocxInput): Promise<Blob> {
  const children: Array<Paragraph | Table> = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: input.title, bold: true, size: 36 })],
  }));
  if (input.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: input.subtitle, size: 20, color: '6B7280' })],
    }));
  }
  if (input.author) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: input.author, size: 18, color: '9CA3AF' })],
    }));
  }

  for (const block of input.blocks || []) {
    if (block.type === 'heading') {
      children.push(new Paragraph({ text: block.text, heading: headingLevel(block.level) }));
      continue;
    }
    if (block.type === 'paragraph') {
      children.push(new Paragraph({
        spacing: { after: 120, line: 320 },
        children: [new TextRun({ text: block.text, size: 21 })],
      }));
      continue;
    }
    if (block.type === 'code') {
      children.push(codeParagraph(block.text));
      continue;
    }
    if (block.type === 'metrics') {
      children.push(metricsTable(block.items || []));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }
    if (block.type === 'table') {
      if (block.columns?.length) {
        children.push(dataTable(block.columns, block.rows || []));
        const cap = captionParagraph(block.caption);
        if (cap) children.push(cap);
        else children.push(new Paragraph({ spacing: { after: 120 } }));
      }
      continue;
    }
    if (block.type === 'image') {
      try {
        const bytes = dataUrlToBytes(block.dataUrl);
        if (!bytes.length) continue;
        const { width, height } = fitImage(bytes);
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 60 },
          children: [new ImageRun({ type: 'png', data: bytes, transformation: { width, height } })],
        }));
        const cap = captionParagraph(block.caption);
        if (cap) children.push(cap);
      } catch {
        // 图片解析失败不阻断整份文档：跳过该图，其余照常导出
      }
      continue;
    }
    if (block.type === 'pageBreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  if (children.length === 0) children.push(new Paragraph({ text: '' }));

  const doc = new Document({
    creator: input.author || '言智',
    title: input.title,
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
