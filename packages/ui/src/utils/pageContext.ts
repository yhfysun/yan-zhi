// 页面内对话的「页面上下文」采集（P0）。
//
// 分四级（方案 §4.2）：L0 URL/标题/host（宿主常备）· L1 选区 · L2 可见文本 · L3 结构（由模型用工具取）。
// 本文件负责 L0~L2。
//
// ★ 为什么走渲染层自己读页（而不是让 agent 调 browser_get_visible_text）：
//   桌面端执行面按「会话流键」认页（`apps/desktop/browser-target.cjs:109-175`）——
//   显式传不属于本会话的 tabId 会被**拒绝**，未锚定时只有建页类动作能回落建锚。
//   而渲染层路径（convId 为空）是**原样透传**（同文件 :112-113）：用户自己看的这一页，
//   宿主读它不需要任何锚。⇒ "问这一页"零依赖执行面归属，只有"动手点它"才需要（见提示词）。
//
// 读取失败（非 Electron 端 / 脚本被拦 / 超时）**不抛异常**：降级成"只有 L0"，由调用方决定怎么提示。

/** 页面可见文本注入上限（字符）：整页灌进 prompt 太贵，超出的截断 */
export const PAGE_CTX_TEXT_LIMIT = 8000;
/** 选中文字注入上限（字符） */
export const PAGE_CTX_SELECTION_LIMIT = 4000;

export interface PageContext {
  url: string;
  title: string;
  host: string;
  /** L1 用户在页面里选中的文字（可能为空） */
  selection: string;
  /** L2 页面可见文本（截断后；读取失败为空） */
  visibleText: string;
  /** 页面内容读取失败（降级为只有 L0）—— 提示词里要如实说明，别让模型以为"页面是空的" */
  readFailed: boolean;
}

/** host（取不到返回空串，绝不抛） */
export function hostOf(url: string): string {
  try { return new URL(String(url || '')).host; } catch { return ''; }
}

/** 这个 URL 算不算"有一个页面"（about:blank / 起始主页 / 空 ⇒ false） */
export function isRealPageUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/** 截断到 n 字符（超出加省略标记） */
export function truncate(s: string, n: number): string {
  const v = String(s || '');
  return v.length > n ? v.slice(0, n) + `…（已截断，原长 ${v.length} 字）` : v;
}

/** 空上下文（L0 之外都没有） */
export function emptyContext(url = '', title = ''): PageContext {
  return { url, title, host: hostOf(url), selection: '', visibleText: '', readFailed: false };
}

/**
 * 把页面上下文 + 用户问题拼成任务的 userContent。
 * ★ 这里的「执行面提示」是 P0 的关键：页面内对话要求"动手就动用户正看的那一页"，
 *   而执行面认页规则（browser-target.cjs）决定了模型**不能传 tabId**（page 空间的 tab 永不被
 *   任何会话认领，传了必被判"不属于本会话"）。口径必须写进提示词，否则模型会新开页/打错页且不报错。
 */
export function buildPageTaskPrompt(input: { question: string; ctx: PageContext }): string {
  const { question, ctx } = input;
  const lines: string[] = [];
  lines.push('【当前页面（用户正在浏览器里看着的页）】');
  lines.push(`标题：${ctx.title || '(无标题)'}`);
  lines.push(`地址：${ctx.url}`);
  if (ctx.host) lines.push(`站点：${ctx.host}`);
  if (ctx.readFailed) {
    lines.push('（页面正文读取失败：宿主没取到可见文本。需要内容时请用浏览器读取类工具现取。）');
  } else if (ctx.visibleText) {
    lines.push('');
    lines.push('【页面可见文本（宿主已抓取，可直接依据它回答，无需再读一次）】');
    lines.push(truncate(ctx.visibleText, PAGE_CTX_TEXT_LIMIT));
  }
  if (ctx.selection) {
    lines.push('');
    lines.push('【用户在这页上选中的文字】');
    lines.push(truncate(ctx.selection, PAGE_CTX_SELECTION_LIMIT));
  }
  lines.push('');
  lines.push('【用户的问题】');
  lines.push(question);
  lines.push('');
  lines.push('【执行面约束（务必遵守）】');
  lines.push('1. 上面这一页**已经打开**，就是用户正在看的页。不要新开标签页（不要 browser_new_tab），不要改变地址。');
  lines.push('2. 调用浏览器工具时**不要传 tabId**：页面内对话的操作目标已绑定为当前页，显式传 tabId 会被判成"访问其它会话的页面"而被拒绝。');
  lines.push('3. 若工具提示「该会话尚未绑定浏览器页面」：先调用一次 browser_navigate 打开**同一个地址**建立绑定（会原地重载一次，属正常），然后再继续读取/点击。');
  lines.push('4. 只做用户要求的这件事；做完给结论，不要把页面留在别的地址上。');
  return lines.join('\n');
}

/** 宿主在页面里跑的读取脚本（只读：不改 DOM、不发请求） */
export const READ_PAGE_SCRIPT = `(() => {
  let sel = '';
  try { sel = String((window.getSelection && window.getSelection()) || ''); } catch (e) { sel = ''; }
  let text = '';
  try { text = String((document.body && document.body.innerText) || ''); } catch (e) { text = ''; }
  return { selection: sel, text };
})()`;

/** 采集用的最小入参（浏览器 tab 的子集，避免与 store 类型耦合） */
export interface ContextTabLike {
  url?: string;
  title?: string;
}

/**
 * 采集页面上下文：Electron 端经 `browserView.action(tabId,'run_script')` 在页面主世界读一次
 * （渲染层路径，不受会话归属限制）；任何一步失败 → 降级为只有 L0。
 */
export async function collectPageContext(tabId: string, tab: ContextTabLike): Promise<PageContext> {
  const url = String(tab?.url || '');
  const base = emptyContext(url, String(tab?.title || ''));
  if (!tabId || !isRealPageUrl(url)) return base;   // 起始主页 / about:blank：没有正文可读
  const api = (globalThis as any)?.window?.electronAPI;
  if (!api?.browserView?.action) { base.readFailed = true; return base; }
  try {
    const r = await api.browserView.action(tabId, 'run_script', { script: READ_PAGE_SCRIPT });
    if (!r || r.error) { base.readFailed = true; return base; }
    const result = r.result || {};
    const realUrl = String(r.url || url);
    return {
      ...base,
      // 读取期间页面可能已跳转：以页面自报的 URL 为准
      url: realUrl,
      host: hostOf(realUrl),
      selection: truncate(String(result.selection || ''), PAGE_CTX_SELECTION_LIMIT),
      visibleText: truncate(String(result.text || ''), PAGE_CTX_TEXT_LIMIT),
    };
  } catch {
    base.readFailed = true;
    return base;
  }
}
