/**
 * 工具执行结果的展示口径（2026-10-21 用户实报「执行命令的结果展示啊这些」）。
 *
 * 现象：一条 `docker ps` 打出 40 行容器，整段原始输出直接铺满整屏，真正的结论被淹掉。
 *
 * 口径：
 *   - 短输出（≤12 行且 ≤1600 字符）→ 原样显示，不多点一次；
 *   - 长输出 → 折叠成「表头 + 前 6 行 + 还有 N 行」，**必须保留表头**
 *     （`docker ps` 砍掉表头就是一堆看不懂的 ID）；
 *   - meta 行给出「N 行数据 · X 字符」，表格类输出优先报**数据行数**而不是物理行数。
 *
 * 抽成纯函数是为了可单测：组件里内联的判定没法验证边界（12 行 / 1600 字符 / 表头识别）。
 */

export const LONG_LINES = 12;
export const LONG_CHARS = 1600;
/** 折叠态显示的表头 + 数据行数量 */
export const PREVIEW_LINES = 7;

export function isLongOutput(out: string): boolean {
  if (!out) return false;
  return out.length > LONG_CHARS || out.split('\n').length > LONG_LINES;
}

/** 表格类输出（首行像表头、后续行有 ≥2 个空白分隔字段）→ 数据行数；否则 0 */
export function countTableRows(text: string): number {
  const lines = (text || '').split('\n').filter((l) => l.trim());
  if (lines.length < 3) return 0;
  const looksTabular = /\S\s{2,}\S/.test(lines[0]);
  if (!looksTabular) return 0;
  let n = 0;
  for (let i = 1; i < lines.length; i++) if (/\S\s{2,}\S/.test(lines[i])) n += 1;
  return n >= 2 ? n : 0;
}

export function outputMeta(out: string): string {
  const text = (out || '').replace(/\s+$/, '');
  if (!text) return '';
  const lines = text.split('\n').length;
  const chars = text.length;
  const size = chars >= 10000 ? `${(chars / 10000).toFixed(1)} 万字符` : `${chars} 字符`;
  const rows = countTableRows(text);
  return rows > 0 ? `${rows} 行数据 · ${size}` : `${lines} 行 · ${size}`;
}

export function outputPreview(out: string): string {
  const lines = (out || '').replace(/\s+$/, '').split('\n');
  if (lines.length <= PREVIEW_LINES + 1) return lines.join('\n');
  const rest = lines.length - PREVIEW_LINES;
  return [...lines.slice(0, PREVIEW_LINES), `… 还有 ${rest} 行未显示`].join('\n');
}
