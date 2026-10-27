// 下载 / 导出的默认文件名：<标题>[-标签]-<YYYYMMDD-HHmmss><扩展名>
//
// 时间戳放最后（扩展名前）：同名看板/报告/图表重复导出时不会互相覆盖，
// 用户也省得每次在系统保存框里手动改名。

const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
/** 复合扩展名（按第一个点切会切错） */
const COMPOUND_EXTS = ['.ychart.json'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 本地时间戳：20261027-143005 */
export function downloadStamp(date: Date = new Date()): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
    + `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

/** 文件名主体净化：Windows/macOS 非法字符换成下划线，换行压成空格，去掉结尾的点与空格 */
export function safeBaseName(raw: string | null | undefined, fallback: string): string {
  const base = String(raw || '')
    .replace(ILLEGAL_CHARS, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return base || fallback;
}

/** 给已有文件名插入时间戳：报告.ydoc → 报告-20261027-143005.ydoc */
export function stampedFileName(filename: string, date: Date = new Date()): string {
  const name = String(filename || '').trim();
  const lower = name.toLowerCase();
  const ext = COMPOUND_EXTS.find((e) => lower.endsWith(e))
    || (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '');
  const stem = ext ? name.slice(0, -ext.length) : name;
  return `${safeBaseName(stem, 'download')}-${downloadStamp(date)}${ext}`;
}

/**
 * 生成导出默认名。
 * label 用来区分同一份内容的多种导出形态（如 Word 的「可编辑」「图片」），避免互相覆盖。
 */
export function exportFileName(
  title: string | null | undefined,
  ext: string,
  opts: { fallback?: string; label?: string; date?: Date } = {},
): string {
  const extension = ext.startsWith('.') ? ext : `.${ext}`;
  const label = opts.label ? `-${safeBaseName(opts.label, '')}` : '';
  return `${safeBaseName(title, opts.fallback || 'download')}${label}-${downloadStamp(opts.date)}${extension}`;
}
