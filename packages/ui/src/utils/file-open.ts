/**
 * 本机路径的识别与打开分流 —— 单一约定。
 *
 * 三处共用同一份口径，避免各写各的正则：
 *  1. 正文渲染：把文本里的绝对路径转成可点链接（useChat 的 md renderer）
 *  2. 消息「浏览文件」入口：从工具结果里捞出路径
 *  3. 打开分流：文件 → 预览（FilePreview 通用阅读），目录 → 目录树
 *
 * 只认**绝对路径**（Windows 盘符 / 常见 unix 根），相对路径与网页 URL 不参与，
 * 否则正文里满屏 `src/index.ts` 被链接化，误伤远大于收益。
 */

/** 路径主体：到空白、引号、尖括号、管道、反引号或中文标点为止 */
const PATH_BODY = '[^\\s"\'<>|`，。；：！？（）【】]+';

/**
 * 绝对路径片段正则源。两条负向约束都是被测试抓出来的真实误判：
 *  - `(?<![\\w/\\\\])`：盘符/根路径前不能是字母、下划线或斜杠 —— 否则
 *    `http://x.cn/c:/d` 里的 `c:/d` 会被当成盘符路径。
 *  - `(?![\\\\/])`：盘符后不能紧跟另一个斜杠 —— 否则 `https://a/b` 的 `s:/` 会被当成盘符。
 */
export const LOCAL_PATH_RE_SRC = `(?<![\\w/\\\\])(?:[A-Za-z]:[\\\\/](?![\\\\/])|/(?:home|Users|root|tmp|opt|var|mnt|srv|data|workspace)/)${PATH_BODY}`;

/** 文本里是否含绝对路径 */
export function hasLocalPath(text: string): boolean {
  return new RegExp(LOCAL_PATH_RE_SRC).test(String(text || ''));
}

/** 整段文本是否恰好就是一条绝对路径（用于行内代码 `` `C:\a\b.md` ``） */
export function isLocalPath(text: string): boolean {
  return new RegExp(`^${LOCAL_PATH_RE_SRC}$`).test(String(text || '').trim());
}

export interface PathSegment {
  type: 'text' | 'path';
  value: string;
}

/** 把一段文本切成「文本 / 路径」交替片段，供渲染层在路径处插入链接 */
export function splitLocalPaths(text: string): PathSegment[] {
  const src = String(text || '');
  const out: PathSegment[] = [];
  const re = new RegExp(LOCAL_PATH_RE_SRC, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ type: 'text', value: src.slice(last, m.index) });
    out.push({ type: 'path', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

/** 取路径末段作为展示名（去掉尾部斜杠后取最后一段） */
export function baseNameOf(p: string): string {
  const t = String(p || '').trim().replace(/[\\/]+$/, '');
  return t.split(/[\\/]/).pop() || t;
}

export interface OpenTarget {
  kind: 'file' | 'dir';
  path: string;
  name: string;
}

/** 归一化路径：去首尾空白、去被正文顺带带来的尾随标点（逗号/引号） */
export function normalizePath(p: string): string {
  return String(p || '').trim().replace(/^["'`]+/, '').replace(/["',`]+$/, '');
}

/**
 * 打开分流：文件交给通用预览，目录交给目录树。
 * stat 不可用的端（Web/OPFS）由调用方传 false，落到文件分支 —— FilePreview 自身会给出结果或报错。
 */
export function resolveOpenTarget(path: string, isDir: boolean): OpenTarget {
  const p = normalizePath(path);
  return { kind: isDir ? 'dir' : 'file', path: p, name: baseNameOf(p) };
}
