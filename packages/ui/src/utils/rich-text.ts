// 行内富文本（.ydoc 文本框里的受限 HTML）
//
// 只允许 B/STRONG/I/EM/U/BR —— 与 Word 导出、预览渲染能一一对应的最小集合。
// 存两份：text（纯文本，给搜索/旧渲染）+ html（有格式时才有）。
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  br?: boolean;
}

const TAG_RE = /<\/?(?:b|strong|i|em|u|br)\b[^>]*>/gi;

/** 去掉不支持的任何标签与全部属性（属性是 XSS 的主要入口） */
export function sanitizeRichHtml(html: string): string {
  const src = String(html || '');
  return src
    .replace(/<(?!\/?(?:b|strong|i|em|u|br)\b)[^>]*>/gi, '')
    .replace(/<(b|strong|i|em|u|br)\b[^>]*>/gi, (_m, t: string) => `<${t.toLowerCase()}>`)
    .replace(/<\/(b|strong|i|em|u)>/gi, (_m, t: string) => `</${t.toLowerCase()}>`);
}

export function htmlHasMarkup(html: string): boolean {
  return /<\/?(?:b|strong|i|em|u)\b/i.test(html);
}

/** HTML → 纯文本（<br> 变换行） */
export function richHtmlToText(html: string): string {
  return sanitizeRichHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** HTML → Word 的 TextRun 序列（保留 b/i/u 与换行） */
export function richHtmlToRuns(html: string): RichRun[] {
  const src = sanitizeRichHtml(html);
  const runs: RichRun[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const decoded = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    runs.push({ text: decoded, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}), ...(underline ? { underline: true } : {}) });
  };
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src))) {
    push(src.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[0].startsWith('</');
    const name = (m[0].match(/[a-z]+/i)?.[0] || '').toLowerCase();
    if (name === 'br') { runs.push({ text: '', br: true }); continue; }
    const delta = closing ? -1 : 1;
    if (name === 'b' || name === 'strong') bold = Math.max(0, bold + delta);
    else if (name === 'i' || name === 'em') italic = Math.max(0, italic + delta);
    else if (name === 'u') underline = Math.max(0, underline + delta);
  }
  push(src.slice(last));
  return runs;
}

/** 纯文本里的 **加粗** / *斜体* → HTML（兼容旧文档与模型输出） */
export function plainToRichHtml(text: string): string {
  const esc = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre: string, body: string) => `${pre}<i>${body}</i>`)
    .replace(/\n/g, '<br>');
}
