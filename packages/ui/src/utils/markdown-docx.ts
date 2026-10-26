// markdown → docx 块
//
// 聊天正文导出（exportMarkdownDocx）用：把模型输出的 markdown 解析成 report-docx 的块序列，
// 交给 buildReportDocx 生成原生 Word。只覆盖聊天里实际会出现的语法，不做完整 CommonMark。
//
// 图片需要先取字节再转 dataURL，因此解析是异步的；取不到时降级为文字占位，不中断整篇导出。

import type { DocxBlock } from './report-docx';

export interface MarkdownParseOptions {
  /** 图片地址 → dataURL；返回 null 表示跳过（导出为文字占位） */
  resolveImage?: (src: string, alt: string) => Promise<string | null>;
}

/** 去掉行内标记，只留可见文本 */
export function inlineToText(raw: string): string {
  return String(raw || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

const CJK_RE = /[㐀-鿿　-〿＀-￯]/;

/** 段落内多行合并：中日文之间不插空格，西文之间插一个空格 */
function joinLines(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!out) { out = part; continue; }
    const needSpace = !CJK_RE.test(out.slice(-1)) && !CJK_RE.test(part.slice(0, 1));
    out += (needSpace ? ' ' : '') + part;
  }
  return out;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => inlineToText(cell.replace(/\\\|/g, '|')));
}

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const IMAGE_ONLY_RE = /^\s*(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)\s*)+$/;
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** 可视卡片围栏（无法在 Word 里还原交互）→ 占位说明 */
const VISUAL_FENCES = new Set(['infographic', 'ydash']);

function numericCell(text: string): string | number | null {
  if (text === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

async function emitTextWithImages(
  text: string,
  blocks: DocxBlock[],
  opts: MarkdownParseOptions,
): Promise<void> {
  const matches = [...text.matchAll(IMAGE_RE)];
  if (!matches.length) {
    if (text.trim()) blocks.push({ type: 'paragraph', text });
    return;
  }
  let cursor = 0;
  for (const m of matches) {
    const before = text.slice(cursor, m.index ?? 0).trim();
    if (before) blocks.push({ type: 'paragraph', text: before });
    const alt = inlineToText(m[1] || '');
    const dataUrl = opts.resolveImage ? await opts.resolveImage(m[2], alt) : null;
    if (dataUrl) blocks.push({ type: 'image', dataUrl, caption: alt || undefined });
    else blocks.push({ type: 'paragraph', text: `[图片${alt ? '：' + alt : ''}]` });
    cursor = (m.index ?? 0) + m[0].length;
  }
  const tail = text.slice(cursor).trim();
  if (tail) blocks.push({ type: 'paragraph', text: tail });
}

/** 解析 markdown 为 docx 块序列（图片按出现顺序内嵌） */
export async function markdownToDocxBlocks(
  markdown: string,
  opts: MarkdownParseOptions = {},
): Promise<DocxBlock[]> {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: DocxBlock[] = [];
  let para: string[] = [];

  const flushPara = async () => {
    if (!para.length) return;
    const text = joinLines(para.map((l) => l.trim()).filter(Boolean));
    para = [];
    await emitTextWithImages(text, blocks, opts);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(FENCE_RE);
    if (fence) {
      await flushPara();
      const mark = fence[1][0];
      const lang = (fence[2] || '').toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${mark}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾围栏
      if (VISUAL_FENCES.has(lang)) {
        blocks.push({ type: 'paragraph', text: `[${lang} 卡片，请在应用内查看]` });
      } else {
        blocks.push({ type: 'code', text: body.join('\n'), lang });
      }
      continue;
    }

    if (!line.trim()) {
      await flushPara();
      i++;
      continue;
    }

    // 表格：当前行含 | 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      await flushPara();
      const columns = splitTableRow(line);
      const rows: Array<Array<string | number | null>> = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = splitTableRow(lines[i]);
        rows.push(columns.map((_, c) => numericCell(cells[c] ?? '')));
        i++;
      }
      blocks.push({ type: 'table', columns, rows });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      await flushPara();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: inlineToText(heading[2]) });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      await flushPara();
      i++;
      continue;
    }

    // 整行只有图片 → 直接出图块，避免被吞进段落
    if (IMAGE_ONLY_RE.test(line)) {
      await flushPara();
      await emitTextWithImages(line.trim(), blocks, opts);
      i++;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      await flushPara();
      const text = inlineToText(quote[1]);
      if (text) blocks.push({ type: 'paragraph', text: `│ ${text}` });
      i++;
      continue;
    }

    const item = line.match(LIST_ITEM_RE);
    if (item) {
      await flushPara();
      const depth = Math.floor(item[1].replace(/\t/g, '  ').length / 2);
      const marker = /^\d/.test(item[2]) ? item[2].replace(/[.)]$/, '.') : '·';
      const indent = '    '.repeat(depth);
      blocks.push({ type: 'paragraph', text: `${indent}${marker} ${inlineToText(item[3])}` });
      i++;
      continue;
    }

    para.push(line);
    i++;
  }

  await flushPara();
  return blocks;
}
