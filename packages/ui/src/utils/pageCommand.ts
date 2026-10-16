// 页面指令的**纯逻辑**（2026-10-16 · 页面内对话与页面指令方案 §5，P1）：
// 站点匹配（match_url 正则 > match_host 通配 > '*'）+ 模板插值（${url} ${title} ${host} ${selection} ${input:提示}）。
//
// ★ 为什么抽成纯模块：匹配优先级与"非法正则要降级而不是抛"都是**行为**，
//   写错的表现是"指令出现在不该出现的站点上 / 该出现的不出现"，用户看不出来（静默错行为）。
//   抽出来 → 单测真跑（见 pageCommand.test.ts）。
// ★ host 的取法复用 utils/pageContext（同一个 hostOf，避免两处解析口径漂移）。

import { hostOf, truncate } from './pageContext';

/** 一条页面指令（与 DB 表 browser_page_command 同行结构；enabled/need_confirm 兼容 0|1） */
export interface PageCommand {
  id: string;
  name: string;
  description?: string | null;
  /** 'task' = 自然语言任务描述（P1 唯一可执行）；'script' = 页面脚本（P2，P1 不执行） */
  kind: 'task' | 'script';
  body: string;
  /** 站点匹配：'*' 全局 / 'www.baidu.com' / '*.fanqieopen.com' */
  match_host: string;
  /** 可选 URL 正则：设了它就**只**按它判（优先于 match_host） */
  match_url?: string | null;
  source?: 'user' | 'builtin' | string;
  enabled?: number | boolean;
  need_confirm?: number | boolean;
  run_count?: number;
  last_used_at?: number | null;
  created_at?: number;
}

/** 模板可用变量 */
export interface PageCommandVars {
  url: string;
  title: string;
  host: string;
  selection: string;
}

/** 是否启用（后端给 0/1，前端给 boolean，缺省视为启用） */
export function isCommandEnabled(c: Pick<PageCommand, 'enabled'>): boolean {
  return c.enabled === undefined || c.enabled === null ? true : !!Number(c.enabled);
}

/** host 去掉端口（'localhost:5173' 才能与 'localhost' 匹配上） */
function hostOnly(host: string): string {
  return String(host || '').toLowerCase().split(':')[0];
}

/**
 * 站点通配匹配：'*' 全通过；'*.example.com' 匹配 example.com 与其所有子域；
 * 其余按**精确 host** 比（大小写不敏感、忽略端口）。
 */
export function matchHostPattern(pattern: string, host: string): boolean {
  const p = String(pattern ?? '*').trim().toLowerCase();
  const h = hostOnly(host);
  if (!p || p === '*') return true;
  if (!h) return false;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith('.' + base);
  }
  return h === p;
}

/**
 * URL 正则判定。
 * @returns true 命中 / false 明确不命中 / null **无法判定**（未设正则，或正则非法 —— 非法一律降级为"不参与判定"，绝不抛）
 */
export function matchUrlPattern(pattern: string | null | undefined, url: string): boolean | null {
  const p = String(pattern ?? '').trim();
  if (!p) return null;
  try { return new RegExp(p, 'i').test(String(url || '')); }
  catch { return null; }
}

/** 排序权重：URL 正则命中(0) > 站点专属(1) > 全局 '*'(2) */
function rankOf(c: PageCommand, urlHit: boolean): number {
  if (urlHit) return 0;
  return String(c.match_host ?? '*').trim() === '*' ? 2 : 1;
}

/**
 * 取当前页命中的指令（按"URL 正则命中 → 站点专属 → 全局"排序，同档按创建时间）。
 * 规则（方案 §5.2，与后端写入校验同口径）：
 *   · 设了 match_url 的：**只**按正则判（正则非法 → 不命中，不因此把 host 规则漏进来）；
 *   · 没设的：按 match_host 通配判；
 *   · 未启用的不出现；任务型与脚本型都出现（脚本型执行前会弹确认，见 needsConfirm）。
 */
export function matchPageCommands<T extends PageCommand>(list: T[], url: string): T[] {
  const host = hostOf(url);
  const hits: Array<{ c: T; rank: number; created: number }> = [];
  for (const c of list || []) {
    if (!c || !c.id || !isCommandEnabled(c)) continue;
    const urlHit = matchUrlPattern(c.match_url, url);
    if (urlHit === false) continue;                 // 明确不命中：host 不参与（正则优先）
    if (urlHit === null && !matchHostPattern(c.match_host, host)) continue;
    hits.push({ c, rank: rankOf(c, urlHit === true), created: Number(c.created_at || 0) });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.created - b.created).map((x) => x.c);
}

/** 该指令执行前是否需要人工确认（★ 脚本型默认**每次**都要；task 型不需要） */
export function needsConfirm(c: Pick<PageCommand, 'kind' | 'need_confirm'>): boolean {
  if (c.kind !== 'script') return false;
  return Number(c.need_confirm ?? 1) !== 0;
}

/**
 * 组装要送进 `run_script` 的脚本源码：模板插值 + 注入**只读** `ctx`。
 * ctx = { url, title, host, selection }，Object.freeze 之后脚本改不动它；
 * 脚本里的 `return` 结果就是 run_script 的返回值（外层箭头函数把它透出去）。
 */
export function buildScriptSource(
  body: string,
  vars: PageCommandVars,
  inputs: Record<string, string> = {},
): string {
  const rendered = renderCommandBody(body, vars, inputs);
  const ctx = JSON.stringify({
    url: vars.url || '',
    title: vars.title || '',
    host: vars.host || '',
    selection: truncate(vars.selection || '', 2000),
  });
  return `(() => { const ctx = Object.freeze(${ctx});\n${rendered}\n})()`;
}

/**
 * 摘要（审计用）：长度 + 稳定短哈希。
 * ★ 审计只存**摘要**不存内容 —— 脚本结果里可能带页面正文/表单值，那属于用户数据，不该落库。
 */
export function digestOf(value: unknown, maxHashInput = 20000): string {
  let s: string;
  try { s = typeof value === 'string' ? value : JSON.stringify(value); } catch { s = String(value); }
  s = s || '';
  const head = s.slice(0, maxHashInput);
  let h = 5381;
  for (let i = 0; i < head.length; i++) h = ((h * 33) ^ head.charCodeAt(i)) >>> 0;
  return `len=${s.length} hash=${h.toString(16)}`;
}

/** 把脚本结果格式化成面板里的一条消息（JSON 用代码块，便于复制） */
export function formatScriptResult(name: string, result: unknown, durationMs: number): string {
  let body: string;
  try { body = typeof result === 'string' ? result : JSON.stringify(result, null, 2); } catch { body = String(result); }
  body = (body || '').trim();
  if (!body || body === 'undefined') body = '(脚本没有返回值)';
  const truncated = body.length > 6000 ? body.slice(0, 6000) + `\n…（已截断，原长 ${body.length} 字）` : body;
  const isJson = /^[[{]/.test(truncated.trim());
  const head = `**${name}** · 用时 ${durationMs}ms`;
  return isJson ? `${head}\n\n\`\`\`json\n${truncated}\n\`\`\`` : `${head}\n\n${truncated}`;
}

/** 抽出 `${input:提示}` 的提示文案（按出现顺序、去重）——UI 据此逐个弹输入框 */
export function inputPromptsOf(body: string): string[] {
  const out: string[] = [];
  const re = /\$\{input:([^}]*)\}/g;
  const s = String(body || '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const p = m[1].trim() || '请输入';
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** 该指令正文用到了哪些变量（UI 据此决定要不要为 ${selection} 现采一次选区） */
export function usedVarsOf(body: string): string[] {
  const names = ['url', 'title', 'host', 'selection'];
  return names.filter((n) => String(body || '').includes('${' + n + '}'));
}

/**
 * 渲染指令正文：已知变量按 vars 替换，`${input:提示}` 按 inputs 替换
 * （缺省留空 —— 用户跳过输入时不硬塞占位串，否则模型会把占位符当真实要求）。
 * 选区超长时截断（指令正文要进 prompt，几千字选区只会挤占预算）。
 */
export function renderCommandBody(
  body: string,
  vars: PageCommandVars,
  inputs: Record<string, string> = {},
): string {
  return String(body || '')
    .replace(/\$\{url\}/g, vars.url || '')
    .replace(/\$\{title\}/g, vars.title || '')
    .replace(/\$\{host\}/g, vars.host || '')
    .replace(/\$\{selection\}/g, truncate(vars.selection || '', 2000))
    .replace(/\$\{input:([^}]*)\}/g, (_m: string, p: string) => String(inputs[String(p).trim() || '请输入'] ?? '').trim());
}
