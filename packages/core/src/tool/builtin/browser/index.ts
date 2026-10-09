// 浏览器自动化内置工具集 —— 调用服务端 /api/browser/* 端点（Playwright）
// 包含：navigate / click / type / press_key / scroll / hover / get_text / get_dom / wait / screenshot
import type { BuiltInTool } from '../../types';
import type { McpCallResult } from '../../../mcp/client';
import { toolError } from '../../result';
// ★ 不直接 import node:fs —— core 是平台无关层（三端可用），文件系统一律走
//   getPlatformAdapter().fs（与 file-write.ts 同一约定）。此前误引 node:fs 会破坏
//   该原则：core 被前端/bundle 引用时静态解析失败。
import { getPlatformAdapter } from '../../../platform/types';
import { joinPath } from '../fs-walk';

/** 获取 auth token（浏览器/web/桌面端均可访问 localStorage） */
function getAuthToken(): string | null {
  try { return localStorage.getItem('auth_token'); } catch { return null; }
}

/** 调用浏览器 API 端点 */
async function callBrowserApi(path: string, method: 'GET' | 'POST' = 'POST', body?: unknown): Promise<unknown> {
  // 桌面端：将 /navigate 和 /action 转发到 IPC 直接操作可见的 BrowserView（含虚拟鼠标光标）
  const electron = (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) ? (window as any).electronAPI : null;
  if (electron && method === 'POST' && (path === '/navigate' || path === '/action')) {
    let ipcAction = path === '/navigate' ? 'navigate' : (body as any)?.action;
    let ipcArgs = path === '/navigate' ? (body as any) : (() => { const { action, ...rest } = body as any; return rest; })();
    const result = await electron.browserView.action(null, ipcAction, ipcArgs);
    if (result?.error) throw new Error(result.error);
    return result;
  }
  // Web 端或非 action 路径（/screenshot、/passwords 等）：走 server Playwright
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // 后端 Node.js 环境用绝对 URL，前端用相对 URL
  const baseUrl = typeof window !== 'undefined' ? '' : `http://127.0.0.1:${process.env.PORT || 3001}`;
  // 内置工具发起的导航/操作打上 agent 标记：服务端据此把智能体操作沉淀进浏览器记忆文件（区别于用户手动浏览）
  const isAgentAction = path === '/navigate' || path === '/action';
  const url = baseUrl + '/api/browser' + path + (isAgentAction ? (path.includes('?') ? '&' : '?') + 'src=agent' : '');
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) {
    throw new Error(json.error || `请求失败 (${res.status})`);
  }
  return json.data ?? json;
}

/**
 * 把浏览器截图落到本机临时区，让会话界面能把它显示出来。
 *
 * 为什么要落盘而不是直接塞 base64：桌面端一次全页截图常在数百 KB~数 MB，
 * 若内联进工具结果会跟着消息一起持久化到数据库，体积和内存都不划算。
 * 统一走 computer-use 那套「临时区 + 30 分钟回收」规则（同目录、同命名
 * screenshot-<时间戳>.png），由插件的清理器回收；插件没启用时这里自带轻量清理。
 *
 * 失败一律返回 null：展示是增强能力，不能因为它让"截图"这个动作本身失败。
 */
async function saveShotToTemp(base64: string): Promise<{ file: string; screenshotUrl: string } | null> {
  try {
    if (!base64 || typeof window !== 'undefined') return null;
    const fsp = await import('node:fs/promises');
    const nodePath = await import('node:path');
    const dir = process.env.DATA_DIR
      ? nodePath.join(process.env.DATA_DIR, 'screenshots')
      : nodePath.resolve('screenshots');
    await fsp.mkdir(dir, { recursive: true });
    // 顺带回收过期文件（computer-use 插件未启用时没人扫这个目录）
    try {
      for (const name of await fsp.readdir(dir)) {
        if (!/^screenshot-\d+\.png$/.test(name)) continue;
        const f = nodePath.join(dir, name);
        const st = await fsp.stat(f);
        if (st.isFile() && Date.now() - st.mtimeMs > 30 * 60 * 1000) await fsp.rm(f, { force: true });
      }
    } catch { /* 清理失败不影响本次保存 */ }
    const file = nodePath.join(dir, `screenshot-${Date.now()}.png`);
    await fsp.writeFile(file, Buffer.from(base64, 'base64'));
    return { file, screenshotUrl: `/api/plugin/computer-use/screenshots/${nodePath.basename(file)}` };
  } catch {
    return null;
  }
}

function ok(text: string): McpCallResult {
  return { content: [{ type: 'text', text }] };
}
/** 带 _meta 的成功返回（供执行循环做副作用：登记 conversation_file / 工件采集） */
function okWithMeta(text: string, meta: Record<string, unknown>): McpCallResult {
  return { content: [{ type: 'text', text }], _meta: meta };
}
function err(msg: string): McpCallResult {
  return toolError(msg);
}

/** 从工具参数中健壮提取 URL —— 模型常把 URL 放在非 url 字段（target/address/link/href/page 等），
 *  或直接把 arguments 写成 JSON 字符串。只认 args.url 会误报「url is required」。 */
function extractUrlFromArgs(args: unknown): string {
  if (typeof args === 'string') return args.trim();
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>;
    for (const k of ['url', 'target', 'address', 'link', 'href', 'page', 'site', 'to', 'uri', 'location', 'query', 'q']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const strVals = Object.values(o).filter((v) => typeof v === 'string' && (v as string).trim());
    if (strVals.length === 1) return String(strVals[0]).trim();
  }
  return '';
}

/** click/type 空参兜底：自动拉取当前页面编号元素清单，引导模型下一步用 index 定位 */
async function emptyTargetHint(): Promise<McpCallResult> {
  let list = '';
  try {
    const data = await callBrowserApi('/action', 'POST', { action: 'get_page_info' }) as any;
    const elems = (data?.interactive || []).slice(0, 25).map((e: any) => {
      let s = `[${e.index}] ${e.tag}`;
      if (e.iframe) s += ' (in iframe)';
      if (e.text) s += ` "${e.text.slice(0, 30)}"`;
      if (e.placeholder) s += ` [ph:${e.placeholder}]`;
      if (e.ariaLabel) s += ` [aria:${e.ariaLabel}]`;
      return s;
    }).join('\n');
    if (elems) list = `\n当前页面可交互元素（前 25 个，用 index 参数重试）：\n${elems}`;
  } catch { /* 页面不可用时忽略 */ }
  return err(`未提供定位参数（index / selector / x+y）${list}\n请从上方编号列表中选择目标元素，以 { "index": <编号> } 形式重新调用。`);
}

// ========== 导航 ==========
export class BrowserNavigateTool implements BuiltInTool {
  name = 'browser_navigate';
  description = 'Navigate the in-app browser preview panel to a URL (renders inside the app, not a system browser). 注意：一次只调用一个 browser_navigate，不要在同一批并行调用多个导航（浏览器是单活动页状态机，多个导航会互相覆盖，只有最后一个页面留存）。需要同时打开多个页面时：先调用一次本工具打开第一个，其余页面改用 browser_new_tab 新开标签页（返回 tabId），读取内容时给读取类工具传对应 tabId。';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to.' },
      tabId: { type: 'number', description: '可选：目标标签页 id（来自 browser_new_tab / browser_get_tabs），缺省为当前活动标签页。' },
      openInNewTab: { type: 'boolean', description: '编排层内部参数：同一批出现多个导航时，第 2 个及之后的导航会自动转为新开标签页并返回 tabId，无需手动传。' },
    },
    required: ['url'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const url = extractUrlFromArgs(args);
      if (!url) return err('url is required');
      // 同批多次导航：第 2+ 次转为新开标签页（避免互相覆盖）；桌面端单视图不支持 new_tab 时回退当前页导航
      if (args.openInNewTab) {
        try {
          const nt = await callBrowserApi('/action', 'POST', { action: 'new_tab', url }) as any;
          if (nt && nt.tabId !== undefined) {
            return ok(`已在新标签页打开（同批多次导航，转为独立标签页避免互相覆盖）。\ntabId=${nt.tabId}\nURL: ${nt.url}\nTitle: ${nt.title || ''}\n后续读取该页内容时，给 browser_get_page_content / browser_get_page_info 等读取工具传 tabId=${nt.tabId}`);
          }
        } catch { /* 单视图环境（桌面端 BrowserView）不支持多标签页，回退当前页导航 */ }
      }
      const tabId = args.tabId != null ? Number(args.tabId) : undefined;
      const data = await callBrowserApi('/navigate', 'POST', { url, tabId }) as any;
      return ok(`Navigated to ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '导航失败'); }
  }
}

// ========== 在系统浏览器中打开（原生预览，非 iframe/弹窗） ==========
export class BrowserOpenExternalTool implements BuiltInTool {
  name = 'browser_open_external';
  description = 'Open a URL in the system default browser (desktop) or a new browser tab (web). Native preview, not an in-app iframe or popup dialog.';
  inputSchema = {
    type: 'object',
    properties: { url: { type: 'string', description: 'The URL to open externally.' } },
    required: ['url'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const url = args.url as string;
    if (!url) return err('url is required');
    if (!/^https?:\/\//i.test(url)) return err('url 需以 http:// 或 https:// 开头');
    try {
      const w = (typeof window !== 'undefined' ? window : null) as any;
      const electronShell = w?.electronAPI?.shell;
      if (electronShell?.openExternal) {
        await electronShell.openExternal(url);
        return ok(`Opened externally (system browser): ${url}`);
      }
      if (w?.open) {
        w.open(url, '_blank', 'noopener,noreferrer');
        return ok(`Opened externally (new tab): ${url}`);
      }
      return err('当前环境无法打开外部浏览器');
    } catch (e: any) { return err(e?.message || '外部打开失败'); }
  }
}

// ========== 点击 ==========
export class BrowserClickTool implements BuiltInTool {
  name = 'browser_click';
  description = 'Click an element in the browser. 三种定位方式任选其一：index（元素编号，来自 browser_get_page_content / browser_get_page_info 返回的列表）、selector（CSS 选择器）、x+y（页面坐标）。index 对动态 hash class、iframe 内元素最稳；坐标仅在前两者都拿不到时使用。Uses real mouse movement. Returns pageChanged/noChangeStreak feedback; if ambiguous, a candidate list with indexes is returned.';
  inputSchema = {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Element index from the numbered interactive-element list returned by browser_get_page_content / browser_get_page_info / browser_get_dom. 比 selector 更稳（不受动态 class、iframe 影响）。失效时重新读取页面刷新列表。' },
      selector: { type: 'string', description: 'CSS selector of the element to click. Supports :contains("text") pseudo-selector to match elements by visible text, e.g. button:contains("登录"). If multiple elements match, an ambiguous candidate list with indexes is returned.' },
      x: { type: 'number', description: 'X coordinate (last resort, if no index/selector).' },
      y: { type: 'number', description: 'Y coordinate (last resort, if no index/selector).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      // 空参兜底：自动返回页面编号元素清单，引导模型用 index 重试
      if (args.index === undefined && !args.selector && args.x === undefined && args.y === undefined) {
        return await emptyTargetHint();
      }
      const data = await callBrowserApi('/action', 'POST', { action: 'click', index: args.index, selector: args.selector, x: args.x, y: args.y }) as any;
      return ok(JSON.stringify(data));
    } catch (e: any) { return err(e?.message || '点击失败'); }
  }
}

// ========== 输入文本 ==========
export class BrowserTypeTool implements BuiltInTool {
  name = 'browser_type';
  description = 'Type text into an element. 定位方式：index（元素编号，来自 browser_get_page_content / browser_get_page_info）、selector（CSS 选择器），或省略两者直接输入到当前焦点元素。输入框目标不明确时先用 browser_get_page_content 找到 textarea/input 的 index。要提交表单/搜索时传 pressEnter:true（等价于输入后按 Enter，不要用 text:"" 来表示回车）。\n'
    + '★ 走**真实键盘输入**（桌面端经 CDP `Input.insertText`，会派发 beforeinput/input 等编辑事件）：'
    + '对受控组件（React/Vue）、富文本编辑器（ProseMirror/Slate/Draft.js）、中文输入法场景都有效 —— '
    + '评论框、发帖框、搜索框这类"看着填了、提交却是空的"问题由它解决。\n'
    + '★ 参数 text 是**替换**语义（先清空再输入），不是追加。返回里的 applied 字段表示回读核验是否一致；'
    + '若 applied:false，请用 browser_get_page_content 核验输入框当前值，不要盲目重复调用。';
  inputSchema = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to type. 替换语义（先清空再输入）。省略且 pressEnter:true 时只按回车不输入文本。' },
      index: { type: 'number', description: 'Element index from the numbered interactive-element list returned by browser_get_page_content / browser_get_page_info / browser_get_dom. 比 selector 更稳（不受动态 class、iframe 影响）。省略时输入到当前焦点元素。' },
      selector: { type: 'string', description: 'CSS selector to focus before typing (optional). Supports :contains("text") pseudo-selector. If multiple elements match, an ambiguous candidate list with indexes is returned.' },
      pressEnter: { type: 'boolean', description: '输入完成后按一次 Enter（提交搜索/表单）。text 与 pressEnter 至少给一个。真实的 Enter 按键事件，不是 JS 合成的。' },
    },
    required: [],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const text = args.text as string | undefined;
      const pressEnter = args.pressEnter === true;
      if (!text && !pressEnter) {
        return err('text is required（或传 pressEnter:true 仅回车提交）。要按回车请传 pressEnter:true，不要传 text:""');
      }
      // 注意：无 index/selector 时合法——输入到当前聚焦元素（先 click 聚焦再 type）
      const data = await callBrowserApi('/action', 'POST', { action: 'type', index: args.index, selector: args.selector, text: text || '', pressEnter }) as any;
      if (data?.error === '无聚焦元素') {
        // 无聚焦目标时给出引导，而非裸报错
        const hint = await emptyTargetHint();
        return err(`无聚焦元素（需先用 browser_click 聚焦输入框，或直接传 index/selector）${(hint.content?.[0]?.text || '').replace(/^未提供定位参数（index \/ selector \/ x\+y）/, '')}`);
      }
      return ok(JSON.stringify(data));
    } catch (e: any) { return err(e?.message || '输入失败'); }
  }
}

// ========== 按键 ==========
export class BrowserPressKeyTool implements BuiltInTool {
  name = 'browser_press_key';
  description = 'Press a keyboard key (e.g. Enter, Tab, Escape). Uses real keyboard input.';
  inputSchema = {
    type: 'object',
    properties: { key: { type: 'string', description: 'Key name: Enter, Tab, Escape, ArrowDown, etc.' } },
    required: ['key'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const key = args.key as string;
      if (!key) return err('key is required');
      await callBrowserApi('/action', 'POST', { action: 'press', key });
      return ok(`Pressed key: ${key}`);
    } catch (e: any) { return err(e?.message || '按键失败'); }
  }
}

// ========== 滚动 ==========
export class BrowserScrollTool implements BuiltInTool {
  name = 'browser_scroll';
  description = 'Scroll the browser page or a specific element into view.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to scroll into view (optional).' },
      x: { type: 'number', description: 'Horizontal scroll delta (default 0).' },
      y: { type: 'number', description: 'Vertical scroll delta (default 300).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'scroll', selector: args.selector, x: args.x, y: args.y });
      return ok(`Scrolled ${args.selector ? 'to ' + args.selector : `by (${args.x || 0}, ${args.y || 300})`}`);
    } catch (e: any) { return err(e?.message || '滚动失败'); }
  }
}

// ========== 悬停 ==========
export class BrowserHoverTool implements BuiltInTool {
  name = 'browser_hover';
  description = 'Hover over an element by selector or coordinates. Uses real mouse movement.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to hover. Supports :contains("text") pseudo-selector.' },
      x: { type: 'number', description: 'X coordinate (if no selector).' },
      y: { type: 'number', description: 'Y coordinate (if no selector).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'hover', selector: args.selector, x: args.x, y: args.y });
      return ok(`Hovered ${args.selector || `(${args.x}, ${args.y})`}`);
    } catch (e: any) { return err(e?.message || '悬停失败'); }
  }
}

// ========== 获取文本 ==========
export class BrowserGetTextTool implements BuiltInTool {
  name = 'browser_get_text';
  description = 'Get text content of an element by selector, or the entire page HTML. 传 selector：只取该元素的文本；不传 selector：返回整页原始 HTML 源码（含标签，非清洗文本）。用途：核对某个元素的文本、或需要看 HTML 源码/属性值。要"页面上人能看到的文字"改用 browser_get_visible_text；要元素编号与结构改用 browser_get_page_content。可传 tabId 读取指定标签页。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      selector: { type: 'string', description: 'CSS selector to get text from (omit for full page content).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_text', tabId: args.tabId, selector: args.selector });
      const text = typeof data === 'string' ? data : ((data as any)?.text ?? JSON.stringify(data));
      return ok(text.slice(0, 8000));
    } catch (e: any) { return err(e?.message || '获取文本失败'); }
  }
}

// ========== 获取 DOM ==========
export class BrowserGetDomTool implements BuiltInTool {
  name = 'browser_get_dom';
  description = 'Get a structured DOM tree of visible elements (excludes script/style/svg), penetrating same-origin iframes and Shadow DOM. 返回带父子层级的树形结构，每个节点含 tag, id, class, role, aria-label, text, href, placeholder, type, name, value, children；可交互节点（a/button/input/select/textarea 等）带 index 编号，可直接用于 browser_click/browser_type。用途：需要看清元素的层级归属、容器关系、弹窗/portal 挂在哪个父节点下时用它——browser_get_page_content 的元素清单是扁平的，判断不了归属。参数：selector 收窄到某个子树，depth 限制树深，maxNodes 限制节点数（默认较大，长页面建议设 depth 防止输出过长）。可传 tabId 读取指定标签页。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      selector: { type: 'string', description: 'CSS selector to scope the DOM tree (default: entire body).' },
      depth: { type: 'number', description: 'Max tree depth (default 12).' },
      maxNodes: { type: 'number', description: 'Max number of nodes to return (default 1000).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_dom', tabId: args.tabId, selector: args.selector, depth: args.depth, maxNodes: args.maxNodes }) as any;
      if (data.error) return err(data.error);
      const iframes = data.iframes ? `\nIframes: sameOrigin=${data.iframes.sameOrigin}, crossOriginSkipped=${data.iframes.crossOriginSkipped}` : '';
      return ok(`URL: ${data.url}\nTitle: ${data.title}\nNodes: ${data.nodeCount}${iframes}\nDOM tree (interactive nodes carry "index" for browser_click/browser_type):\n${JSON.stringify(data.dom, null, 2)}`);
    } catch (e: any) { return err(e?.message || '获取 DOM 失败'); }
  }
}

// ========== 等待 ==========
export class BrowserWaitTool implements BuiltInTool {
  name = 'browser_wait';
  description = 'Wait for a specified duration (milliseconds, max 10000).';
  inputSchema = {
    type: 'object',
    properties: { timeout: { type: 'number', description: 'Duration in milliseconds (default 1000, max 10000).' } },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'wait', timeout: args.timeout }) as any;
      return ok(`Waited ${data.waited}ms`);
    } catch (e: any) { return err(e?.message || '等待失败'); }
  }
}

// ========== 截图 ==========
export class BrowserScreenshotTool implements BuiltInTool {
  name = 'browser_screenshot';
  description = 'Take a screenshot of the current browser page. Returns base64 image data. 可传 tabId 截取指定标签页。fullPage=true 截整页长图（滚动拼接整个页面，不受窗口/面板显示不全影响）；默认只截当前可视区域。传 annotate=true 时会在截图中给每个可交互元素叠加编号框（index 编号），方便视觉精确定位后按 index 操作（annotate 与 fullPage 互斥，annotate 优先）。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      fullPage: { type: 'boolean', description: '是否截整页长图（默认 false 只截视口）。需要完整页面内容（报告配图、长文存档）时传 true。' },
      annotate: { type: 'boolean', description: '是否在截图中叠加可交互元素编号框（默认 false）。用于视觉定位难以用 DOM 描述的元素。' },
    },
  };
  async execute(args: Record<string, unknown> = {}): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'screenshot', tabId: args.tabId, annotate: args.annotate, fullPage: args.fullPage }) as any;
      const b64 = String(data.base64 || '');
      const detail = data.annotated
        ? '（已叠加元素编号框，编号对应 browser_click/browser_type 的 index 参数）'
        : (data.fullPage ? '（整页长图）' : '');
      // 落一份到临时区：让用户能在会话里看到这一张图（模型依旧通过 image_analyze 识别）
      const saved = await saveShotToTemp(b64);
      const shotUrl = saved?.screenshotUrl || (b64 ? `data:image/png;base64,${b64}` : '');
      const payload: Record<string, unknown> = {
        captured: true,
        bytes: b64.length,
        ...detail ? { detail } : {},
        ...(saved?.file ? { file: saved.file } : {}),
        ...(shotUrl ? { screenshotUrl: shotUrl } : {}),
        note: '截图已保存，screenshotUrl 供界面展示；你本身看不到画面，需要理解页面内容或定位元素时，请继续调用 image_analyze 工具分析这张图',
        ...(saved?.file ? { nextStep: `你看不到画面，需要识别页面内容时调用 image_analyze(path="${saved.file}", prompt="描述页面内容并给出目标元素的位置")` } : {}),
      };
      // 保持返回结果是可被界面解析的 JSON：ChatMessageList 会读 screenshotUrl 把图显示在工具卡片下
      return ok(JSON.stringify(payload));
    } catch (e: any) { return err(e?.message || '截图失败'); }
  }
}

// ========== 批量填写表单 ==========
export class BrowserFillFormTool implements BuiltInTool {
  name = 'browser_fill_form';
  description = 'Fill multiple form fields at once. Each field: {selector, value, type?} where type is "text"|"select"|"checkbox"|"radio". For select use label or value. For checkbox/radio set value true/false.';
  inputSchema = {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'Array of {selector, value, type?, label?} to fill.',
        items: { type: 'object' },
      },
    },
    required: ['fields'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'fill_form', fields: args.fields }) as any;
      return ok(`Filled ${data.filled} fields: ${JSON.stringify(data.fields)}`);
    } catch (e: any) { return err(e?.message || '填表单失败'); }
  }
}

// ========== 提交表单 ==========
export class BrowserSubmitFormTool implements BuiltInTool {
  name = 'browser_submit_form';
  description = 'Submit a form by clicking a submit button (selector) or pressing Enter, then wait for navigation.';
  inputSchema = {
    type: 'object',
    properties: { selector: { type: 'string', description: 'CSS selector of submit button (optional, defaults to Enter).' } },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'submit_form', selector: args.selector }) as any;
      return ok(`Form submitted. URL: ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '提交失败'); }
  }
}

// ========== 页面搜索 ==========
export class BrowserSearchTool implements BuiltInTool {
  name = 'browser_search';
  description = 'Search on the current page: fill the search box with query and submit. Auto-detects search input if input_selector not given.';
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text.' },
      input_selector: { type: 'string', description: 'CSS selector of search input (optional, auto-detected).' },
      submit_selector: { type: 'string', description: 'CSS selector of submit button (optional, defaults to Enter).' },
    },
    required: ['query'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'search', query: args.query, input_selector: args.input_selector, submit_selector: args.submit_selector }) as any;
      return ok(`Searched "${data.searched}". URL: ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '搜索失败'); }
  }
}

// ========== 翻页 ==========
export class BrowserNextPageTool implements BuiltInTool {
  name = 'browser_next_page';
  description = 'Go to the next page by clicking "下一页/›/Next" link or a custom selector.';
  inputSchema = { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector of next-page element (optional, auto-detected).' } } };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'next_page', selector: args.selector }) as any;
      return ok(`Paged next. URL: ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '翻页失败'); }
  }
}
export class BrowserPrevPageTool implements BuiltInTool {
  name = 'browser_prev_page';
  description = 'Go to the previous page by clicking "上一页/‹/Prev" link or a custom selector.';
  inputSchema = { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector of prev-page element (optional, auto-detected).' } } };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'prev_page', selector: args.selector }) as any;
      return ok(`Paged prev. URL: ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '翻页失败'); }
  }
}

// ========== 智能等待 ==========
export class BrowserWaitForTool implements BuiltInTool {
  name = 'browser_wait_for';
  description = 'Wait for a condition: selector appearing, URL matching, or text appearing. Smarter than fixed wait.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Wait for this CSS selector to appear.' },
      url: { type: 'string', description: 'Wait for URL to match (string/regex).' },
      text: { type: 'string', description: 'Wait for this text to appear on page.' },
      timeout: { type: 'number', description: 'Max wait ms (default 10000, max 30000).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'wait_for', selector: args.selector, url: args.url, text: args.text, timeout: args.timeout }) as any;
      return ok(`Waited for ${data.waited}: ${data.selector || data.url || data.text || data.ms + 'ms'}`);
    } catch (e: any) { return err(e?.message || '等待失败'); }
  }
}

// ========== 获取可见文本 ==========
export class BrowserGetVisibleTextTool implements BuiltInTool {
  name = 'browser_get_visible_text';
  description = 'Get visible text content of the page or an element (filters hidden elements, returns clean text). 只返回人眼可见的纯文本：不含元素编号、不含 DOM 结构。用途：阅读正文、抽取长文、总结页面内容，比 browser_get_page_content 省 token。传 selector 可只取某个容器内的文本。需要操作页面（点击/输入）时改用 browser_get_page_content 或 browser_get_page_info。可传 tabId 读取指定标签页。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      selector: { type: 'string', description: 'CSS selector (optional, defaults to full body).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_visible_text', tabId: args.tabId, selector: args.selector });
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      return ok(text.slice(0, 8000));
    } catch (e: any) { return err(e?.message || '获取文本失败'); }
  }
}

/**
 * ★ P1-6（2026-10-07）：页面状态签名（Skyvern validator 思路，导出供测试）。
 * url + title + 编号元素清单（index:tag 序列）的 djb2 轻量哈希 + 元素数。
 * pageAgent 每步对比两次读取的 pageState：相同 = 操作未生效（index 清单也没变），
 * 把"页面变没变"的判据**硬编码进回执**，不再依赖提示词软约束。
 */
export function computePageStateSignature(data: { url?: string; title?: string; interactive?: any[]; interactiveCount?: number }): string {
  const sigSrc = `${data.url || ''}|${data.title || ''}|${(data.interactive || []).map((e: any) => `${e.index}:${e.tag}`).join(',')}`;
  let sig = 5381;
  for (let i = 0; i < sigSrc.length; i++) { sig = ((sig << 5) + sig + sigSrc.charCodeAt(i)) >>> 0; }
  return `sig${sig.toString(16)}#${data.interactiveCount ?? (data.interactive || []).length}`;
}

// ========== 获取页面内容（pageAgent 四件套之"读页"，聚合一次给齐） ==========
export class BrowserGetPageContentTool implements BuiltInTool {
  name = 'browser_get_page_content';
  description = 'Get the current page content in one call: url + title + visible text body + numbered interactive elements. 一次拿齐"内容 + 操作目标"：页面标题/URL、可见正文、以及带编号的可交互元素清单（每个元素含 index、tag、selector、type、name、placeholder、aria-label、value；输入框标注 ←可输入）。用途：既要看页面说了什么、又要知道点哪里/往哪输入时用它；click/type 之后想重新观察页面结果也用它。元素编号 index 可直接作为 browser_click / browser_type 的 index 参数，selector 也可直接作为 selector 参数。只看纯文本用 browser_get_visible_text；只要元素坐标用 browser_get_page_info；要看父子层级结构用 browser_get_dom。可传 tabId 读取指定标签页（来自 browser_new_tab / browser_get_tabs），用于多页并行场景，不必先切换标签页。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      maxTextLength: { type: 'number', description: 'Max visible-text length in characters (default 5000, max 20000).' },
      maxInteractive: { type: 'number', description: 'Max interactive elements to return (default 50, max 300).' },
    },
  };
  async execute(args: Record<string, unknown>, ctx?: import('../../types').ToolContext): Promise<McpCallResult> {
    try {
      const maxTextLength = Math.min(Number(args.maxTextLength) || 5000, 20000);
      const maxInteractive = Math.min(Number(args.maxInteractive) || 50, 300);
      const data = await callBrowserApi('/action', 'POST', { action: 'get_page_content', tabId: args.tabId, maxTextLength, maxInteractive }) as any;
      if (data.error) return err(data.error);
      // ★ 工件协议（2026-10-08）：正文疑似被截断（长度顶到请求上限）时以更大上限重取全文；
      //   超长正文落盘为文件，上下文只留预览 + 路径 —— 解决「抓章节全文被 20K 截断」。
      let bodyText: string = data.text || '';
      let savedPath = '';
      if (bodyText.length >= maxTextLength && maxTextLength < 20000) {
        try {
          const data2 = await callBrowserApi('/action', 'POST', { action: 'get_page_content', tabId: args.tabId, maxTextLength: 20000, maxInteractive: 0 }) as any;
          if (!data2.error && (data2.text || '').length > bodyText.length) bodyText = data2.text;
        } catch { /* 重取失败用原文 */ }
      }
      if (bodyText.length > 8000) {
        const dir = ctx?.artifactDirs?.intermediate || ctx?.workspaceDir || '';
        if (dir) {
          try {
            const { fs } = getPlatformAdapter();
            // 幂等建目录：产物目录通常已由服务端建好，已存在/建不动都不阻断落盘
            try { await fs.mkdir(dir); } catch { /* 已存在或权限受限，交给 writeFile 暴露 */ }
            const safeTitle = String(data.title || 'page').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'page';
            savedPath = joinPath(dir, `${safeTitle}-${Date.now()}.txt`);
            await fs.writeFile(savedPath, bodyText);
          } catch { savedPath = ''; /* 落盘失败退回截断行为 */ }
        }
      }
      // ★ P1-6（2026-10-07）：页面状态签名——判据硬编码进回执（实现见 computePageStateSignature）
      const pageState = computePageStateSignature(data);
      const elems = (data.interactive || []).map((e: any) => {
        let s = `[${e.index}] ${e.tag}`;
        if (e.type) s += `[type=${e.type}]`;
        if (e.selector) s += ` <${e.selector}>`;
        if (e.name) s += ` [name:${e.name}]`;
        if (e.role) s += ` [role:${e.role}]`;
        // P1-7：计算后 ARIA 角色（隐式语义，如 <div onclick> → button）；与 tag 不同才展示
        if (e.axRole && e.axRole !== e.tag && e.axRole !== e.role) s += ` [ax:${e.axRole}]`;
        if (e.ariaLabel) s += ` [aria:${e.ariaLabel}]`;
        if (e.text) s += ` "${e.text.slice(0, 40)}"`;
        if (e.placeholder) s += ` [ph:${e.placeholder}]`;
        if (e.value) s += ` [val:${e.value}]`;
        if (e.options) s += ` [opts:${e.options.length}]`;
        if (e.checked !== undefined) s += ` [checked:${e.checked}]`;
        if (e.href) s += ` →${e.href.slice(0, 80)}`;
        if (e.tag === 'input' || e.tag === 'textarea' || e.role === 'textbox') s += ' ←可输入';
        if (e.iframe) s += ' (in iframe)';
        return s;
      }).join('\n');
      const header = `URL: ${data.url}\nTitle: ${data.title}\nPageState: ${pageState}（页面状态签名；与上次读取相同 = 操作未生效，需换定位方式重新观察）\n\n【页面可见文本】\n`;
      if (savedPath) {
        const preview = bodyText.slice(0, 4000);
        const more = bodyText.length > 4000 ? `\n…[正文过长已截断：全文 ${bodyText.length} 字符已保存到文件 ${savedPath}，后续处理用 file_read 按此路径读取，不要重复抓取]` : '';
        // ★ 必须回传 _meta.path：否则服务端通用钩子接不到该路径 → 落盘文件不登记
        //   conversation_file / 不进工件清单（等于白落盘）。category=intermediate（原始抓取）。
        return okWithMeta(
          `${header}${preview}${more}\n\n【可交互元素】(${data.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数；也可直接用 <selector> 作为 selector 参数)\n${elems}`,
          { path: savedPath, name: savedPath.split(/[/\\]/).pop() || 'page.txt', category: 'intermediate', bytes: bodyText.length },
        );
      }
      return ok(
        `${header}${bodyText}\n\n【可交互元素】(${data.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数；也可直接用 <selector> 作为 selector 参数)\n${elems}`
      );
    } catch (e: any) { return err(e?.message || '获取页面内容失败'); }
  }
}

// ========== 下拉选择 ==========
export class BrowserSelectOptionTool implements BuiltInTool {
  name = 'browser_select_option';
  description = 'Select an option in a <select> dropdown by value or label.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the <select> element.' },
      value: { type: 'string', description: 'Option value to select.' },
      label: { type: 'string', description: 'Option label (visible text) to select.' },
    },
    required: ['selector'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'select_option', selector: args.selector, value: args.value, label: args.label });
      return ok(`Selected option in ${args.selector}`);
    } catch (e: any) { return err(e?.message || '选择失败'); }
  }
}

// ========== 勾选/取消 ==========
export class BrowserCheckTool implements BuiltInTool {
  name = 'browser_check';
  description = 'Check a checkbox or radio button.';
  inputSchema = { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector of the checkbox/radio.' } }, required: ['selector'] };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'check', selector: args.selector });
      return ok(`Checked ${args.selector}`);
    } catch (e: any) { return err(e?.message || '勾选失败'); }
  }
}
export class BrowserUncheckTool implements BuiltInTool {
  name = 'browser_uncheck';
  description = 'Uncheck a checkbox.';
  inputSchema = { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector of the checkbox.' } }, required: ['selector'] };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'uncheck', selector: args.selector });
      return ok(`Unchecked ${args.selector}`);
    } catch (e: any) { return err(e?.message || '取消勾选失败'); }
  }
}

// ========== 页面信息 ==========
export class BrowserGetPageInfoTool implements BuiltInTool {
  name = 'browser_get_page_info';
  description = 'Get current page url, title, and a numbered list of interactive elements with their on-screen coordinates (x/y/w/h), penetrating same-origin iframes and Shadow DOM, up to 300. 与 browser_get_page_content 的区别：本工具不返回正文文本，但每个元素额外带屏幕坐标和 bbox 尺寸。用途：需要坐标时用——按 x+y 点击、判断元素在视口内还是被遮挡/需滚动、配合 browser_screenshot 的 annotate=true 做截图编号框叠加、按位置筛选（如"右上角的按钮"）。元素属性同样齐全（index、selector、tag、text、type、name、placeholder、value、ariaLabel、role、select 的 options、checkbox 的 checked）。可传 tabId 读取指定标签页，不必先切换标签页。';
  inputSchema = {
    type: 'object',
    properties: { tabId: { type: 'number', description: '可选：目标标签页 id（来自 browser_new_tab / browser_get_tabs），缺省为当前活动标签页。' } },
  };
  async execute(args: Record<string, unknown> = {}): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_page_info', tabId: args.tabId }) as any;
      if (data.error) return err(data.error);
      const elems = (data.interactive || []).slice(0, 120).map((e: any) => {
        let s = `[${e.index}] ${e.tag}`;
        if (e.iframe) s += ' (in iframe)';
        if (e.text) s += ` "${e.text.slice(0, 40)}"`;
        if (e.placeholder) s += ` [ph:${e.placeholder}]`;
        if (e.value) s += ` [val:${e.value}]`;
        if (e.ariaLabel) s += ` [aria:${e.ariaLabel}]`;
        if (e.options) s += ` [opts:${e.options.length}]`;
        if (e.checked !== undefined) s += ` [checked:${e.checked}]`;
        s += ` <${e.selector}>`;
        return s;
      }).join('\n');
      return ok(`URL: ${data.url}\nTitle: ${data.title}\nInteractive elements (${data.interactiveCount}, numbered — use index in browser_click/browser_type):\n${elems}${(data.interactive || []).length > 120 ? '\n(only first 120 shown)' : ''}`);
    } catch (e: any) { return err(e?.message || '获取页面信息失败'); }
  }
}

// ========== 用已存密码登录 ==========
export class BrowserLoginSavedTool implements BuiltInTool {
  name = 'browser_login_saved';
  description = 'Log into a site using a saved password. Pass host or url; auto-finds the login form, fills credentials, submits, and reports success. Requires the password to be saved first via the browser password manager.';
  inputSchema = {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Site host (e.g. example.com) to match saved credential.' },
      url: { type: 'string', description: 'Login page URL to navigate first (optional). If given, host is derived from it.' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/login-saved', 'POST', { host: args.host, url: args.url }) as any;
      return ok(`Login ${data.loggedIn ? 'succeeded' : 'may have failed (login form still present)'}. URL: ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '登录失败'); }
  }
}

// ========== C4 多标签页管理 ==========
export class BrowserNewTabTool implements BuiltInTool {
  name = 'browser_new_tab';
  description = 'Open a new browser tab and optionally navigate to a URL. Returns the new tab id. 新开标签页并导航（可选 url），返回标签页 id。需要同时打开/对比多个页面时用本工具（不要并行调用多个 browser_navigate）；拿到 tabId 后可用读取类工具（browser_get_page_content 等）的 tabId 参数直接读取该页，无需切换标签页。';
  inputSchema = {
    type: 'object',
    properties: { url: { type: 'string', description: 'Optional URL to navigate the new tab to. 不传则打开空白标签页。' } },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'new_tab', url: args.url }) as any;
      return ok(`新标签页已打开。tabId=${data.tabId}${args.url ? `, url=${data.url}` : ''}`);
    } catch (e: any) { return err(e?.message || '新开标签页失败'); }
  }
}
export class BrowserSwitchTabTool implements BuiltInTool {
  name = 'browser_switch_tab';
  description = 'Switch to a browser tab by tabId. 切换到指定标签页。';
  inputSchema = {
    type: 'object',
    properties: { tabId: { type: 'number', description: 'The tab id to switch to (from browser_get_tabs).' } },
    required: ['tabId'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      if (args.tabId === undefined || args.tabId === null) return err('tabId 为必填项');
      const data = await callBrowserApi('/action', 'POST', { action: 'switch_tab', tabId: args.tabId }) as any;
      return ok(`已切换到标签页 tabId=${data.tabId}, url=${data.url}, title=${data.title}`);
    } catch (e: any) { return err(e?.message || '切换标签页失败'); }
  }
}
export class BrowserCloseTabTool implements BuiltInTool {
  name = 'browser_close_tab';
  description = 'Close browser tab(s). 关闭标签页。\n'
    + '★ 任务收尾时**应主动调用**本工具收拾页面：任务已完成、且某标签页不再需要给用户看时关掉它，'
    + '别把 agent 打开的一堆中间页留在面板里。若该页是**交付给用户看的成果**（最终报告页/用户要接着操作的页），保留并说明原因。\n'
    + '用法：tabIds 传数组一次关多个（推荐，收尾时先用 browser_get_tabs 看有哪些）；tabId 传单个；都不传则关当前活动标签页。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '单个标签页 id（来自 browser_get_tabs）。' },
      tabIds: { type: 'array', items: { type: 'number' }, description: '要关闭的标签页 id 数组 —— 收尾时批量关闭用这个，避免逐个调用。' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      // 批量优先：收尾时通常要一次关掉多个中间页
      const ids = Array.isArray(args.tabIds)
        ? (args.tabIds as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [];
      if (ids.length) {
        const closed: number[] = [];
        const failed: number[] = [];
        for (const tabId of ids) {
          try {
            const d = await callBrowserApi('/action', 'POST', { action: 'close_tab', tabId }) as any;
            if (d?.error) failed.push(tabId); else closed.push(tabId);
          } catch { failed.push(tabId); }
        }
        // 关完后回报剩余页，模型可据此决定是否继续收尾
        let remaining = '';
        try {
          const t = await callBrowserApi('/action', 'POST', { action: 'get_tabs' }) as any;
          const list = Array.isArray(t?.tabs) ? t.tabs : [];
          remaining = `\n剩余标签页 ${list.length} 个：${list.map((x: any) => `tabId=${x.tabId}(${x.title || x.url || '空白'})`).join('、') || '（无）'}`;
        } catch { /* 查询失败不影响关闭结果 */ }
        return ok(`已关闭 ${closed.length} 个标签页${closed.length ? `（${closed.join(', ')}）` : ''}`
          + (failed.length ? `；${failed.length} 个关闭失败（${failed.join(', ')}）` : '')
          + remaining);
      }
      const data = await callBrowserApi('/action', 'POST', { action: 'close_tab', tabId: args.tabId }) as any;
      if (data?.error) return err(data.error);
      return ok(`已关闭标签页 tabId=${data.closedTabId}。剩余标签页数=${data.remaining}`);
    } catch (e: any) { return err(e?.message || '关闭标签页失败'); }
  }
}
export class BrowserGetTabsTool implements BuiltInTool {
  name = 'browser_get_tabs';
  description = 'List all open browser tabs (id/url/title/active). 列出所有标签页。';
  inputSchema = { type: 'object', properties: {} };
  async execute(): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_tabs' }) as any;
      return ok(`标签页列表（共 ${data.tabs.length} 个）：\n${JSON.stringify(data.tabs, null, 2)}`);
    } catch (e: any) { return err(e?.message || '获取标签页列表失败'); }
  }
}

// ========== C5 网络请求监听 ==========
export class BrowserWaitForRequestTool implements BuiltInTool {
  name = 'browser_wait_for_request';
  description = 'Wait for a network request matching urlPattern to finish (includes XHR/fetch). Returns request url/status/method. 等待匹配 URL 模式的网络请求完成。';
  inputSchema = {
    type: 'object',
    properties: {
      urlPattern: { type: 'string', description: 'URL substring or regex pattern to match (e.g. "/api/list" or ".*\\.json").' },
      timeout: { type: 'number', description: 'Max wait ms (default 10000, max 30000).' },
    },
    required: ['urlPattern'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const urlPattern = args.urlPattern as string;
      if (!urlPattern) return err('urlPattern 为必填项');
      const data = await callBrowserApi('/action', 'POST', { action: 'wait_for_request', urlPattern, timeout: args.timeout }) as any;
      if (data?.error) return err(data.error);
      return ok(`等待到匹配请求: ${JSON.stringify(data)}`);
    } catch (e: any) { return err(e?.message || '等待网络请求失败'); }
  }
}
export class BrowserGetNetworkLogTool implements BuiltInTool {
  name = 'browser_get_network_log';
  description = 'Get recent network request log (url/status/method/responseSize). 获取最近的网络请求日志（内存缓冲最近 100 条）。';
  inputSchema = {
    type: 'object',
    properties: {
      urlPattern: { type: 'string', description: 'Optional URL substring to filter log entries.' },
      lastN: { type: 'number', description: 'Return the last N entries (default 20, max 100).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_network_log', urlPattern: args.urlPattern, lastN: args.lastN }) as any;
      return ok(`网络日志（${data.entries.length} 条）：\n${JSON.stringify(data.entries, null, 2)}`);
    } catch (e: any) { return err(e?.message || '获取网络日志失败'); }
  }
}

// ========== C6 结构化数据提取 ==========
export class BrowserExtractListTool implements BuiltInTool {
  name = 'browser_extract_list';
  description = 'Extract a list of structured data from the page as JSON array. 按模板从页面批量提取列表数据。selector 指定列表项容器，fields 描述每项要提取的字段（字段名→{selector,attr}）。attr 为 "text" 取文本，"html" 取 innerHTML，其他值取对应属性（如 href/src）。若不传 fields，自动识别常见列表项（商品卡片：标题/价格/链接）。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      selector: { type: 'string', description: 'CSS selector of the list item container (e.g. ".goods-item"). 列表项容器选择器。' },
      fields: {
        type: 'object',
        description: 'Map of field name → { selector, attr }. attr: "text"=textContent, "html"=innerHTML, other=getAttribute(attr). e.g. { title: { selector: ".title", attr: "text" }, price: { selector: ".price", attr: "text" }, link: { selector: "a", attr: "href" } }.',
      },
      limit: { type: 'number', description: 'Max number of items to extract (default 20).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'extract_list', tabId: args.tabId, selector: args.selector, fields: args.fields, limit: args.limit }) as any;
      if (data?.error) return err(data.error);
      return ok(`提取到 ${data.count} 条数据：\n${JSON.stringify(data.items, null, 2)}`);
    } catch (e: any) { return err(e?.message || '结构化提取失败'); }
  }
}

// ========== C9 视觉定位闭环 ==========
export class BrowserVisualLocateTool implements BuiltInTool {
  name = 'browser_visual_locate';
  description = 'Screenshot the page and return the saved image path, then use image_analyze to locate target elements by vision (fallback when get_page_info/get_dom cannot capture popup/portal structure). 截图后用视觉模型识别目标元素坐标/文本，作为 get_page_info/get_dom 拿不到弹窗结构时的兜底。本工具完成截图并返回路径，需紧接着调用 image_analyze(path=<返回路径>, prompt="找出所有 <target> 元素的位置和文本，返回候选列表含坐标/文本/置信度") 完成视觉识别闭环。';
  inputSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Description of the target element to locate (e.g. "登录按钮" / "关闭弹窗的 X 图标").' },
      screenshot: { type: 'boolean', description: 'Whether to take a fresh screenshot (default true).' },
    },
    required: ['target'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const target = args.target as string;
      if (!target) return err('target 为必填项');
      const take = args.screenshot !== false;
      const data = await callBrowserApi('/action', 'POST', { action: 'visual_locate', target, screenshot: take }) as any;
      if (data?.error) return err(data.error);
      const path = data.path;
      const hint = `已截图保存到 ${path}。请紧接着调用 image_analyze 工具完成视觉识别：\nimage_analyze(path="${path}", prompt="找出页面中所有「${target}」元素的位置（坐标）和文本，返回候选列表（每项含坐标 x/y/width/height、文本、置信度）。若无匹配返回空列表。")`;
      return ok(JSON.stringify({ screenshotPath: path, target, nextStep: 'call image_analyze', hint })) ;
    } catch (e: any) { return err(e?.message || '视觉定位截图失败'); }
  }
}

// ========== C11 文件上传/下载 ==========
export class BrowserUploadTool implements BuiltInTool {
  name = 'browser_upload';
  description = 'Upload a local file into a web page. 上传本地文件到网页。两种用法：①【推荐·filechooser 模式】若「上传」按钮点击后弹出系统文件选择框、页面上看不到 input[type=file]（如抖音创作者平台/番茄等），用 clickSelector 或 clickIndex 指定这个按钮，工具会拦截文件选择器并投递文件；②若页面上有裸露的 input[type=file]，用 index 或 selector 直接定位。';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to the local file to upload. 要上传的本地文件绝对路径（必填）。' },
      clickSelector: { type: 'string', description: '【filechooser 模式·首选】「上传」按钮的 CSS 选择器（支持 :contains("文本")），点击后拦截系统文件选择框并自动投递文件——适合按钮不暴露裸 input 的站点（抖音创作者平台等）。' },
      clickIndex: { type: 'number', description: '【filechooser 模式】「上传」按钮的元素编号（来自 browser_get_page_info 的编号列表）。' },
      clickX: { type: 'number', description: '【filechooser 模式·兜底】上传按钮的 X 坐标（与 clickY 搭配，用于选择器/编号都定位不到时）。' },
      clickY: { type: 'number', description: '【filechooser 模式·兜底】上传按钮的 Y 坐标。' },
      index: { type: 'number', description: '【直接模式】页面上裸露 input[type=file] 的元素编号（来自 browser_get_page_info）。' },
      selector: { type: 'string', description: '【直接模式】页面上裸露 input[type=file] 的 CSS 选择器。' },
    },
    required: ['filePath'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const filePath = args.filePath as string;
      if (!filePath) return err('filePath 为必填项');
      const hasClick = args.clickSelector !== undefined || args.clickIndex !== undefined
        || (args.clickX !== undefined && args.clickY !== undefined);
      if (args.index === undefined && !args.selector && !hasClick) return err('需要 clickSelector/clickIndex（filechooser 模式，推荐）或 index/selector（直接定位 input[type=file]）');
      const data = await callBrowserApi('/action', 'POST', {
        action: 'upload', index: args.index, selector: args.selector, filePath,
        clickSelector: args.clickSelector, clickIndex: args.clickIndex, clickX: args.clickX, clickY: args.clickY,
      }) as any;
      if (data?.error) return err(data.error);
      return ok(`已上传文件: ${filePath}${data?.via === 'filechooser' ? '（filechooser 模式）' : ''}`);
    } catch (e: any) { return err(e?.message || '文件上传失败'); }
  }
}
export class BrowserDownloadTool implements BuiltInTool {
  name = 'browser_download';
  description = 'Trigger a download (click a link or navigate to url) and wait for it to finish, returns the saved path. 触发下载并等待完成，返回保存路径。savePath 不传则用默认下载目录。';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to trigger download (optional if using selector).' },
      selector: { type: 'string', description: 'CSS selector of a link/button to click to trigger download (optional if using url).' },
      savePath: { type: 'string', description: 'Path to save the downloaded file (optional, defaults to workspace/downloads/).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      if (!args.url && !args.selector) return err('需要 url 或 selector 来触发下载');
      const data = await callBrowserApi('/action', 'POST', { action: 'download', url: args.url, selector: args.selector, savePath: args.savePath }) as any;
      if (data?.error) return err(data.error);
      return ok(`下载完成: ${data.filename}\n保存路径: ${data.savedPath}`);
    } catch (e: any) { return err(e?.message || '文件下载失败'); }
  }
}

// ========== C12 滚动到元素 / 可见性检测 ==========
export class BrowserScrollIntoViewTool implements BuiltInTool {
  name = 'browser_scroll_into_view';
  description = 'Scroll an element into the viewport. 滚动使元素进入视口。用 index 或 selector 定位。';
  inputSchema = {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Element index from browser_get_page_info numbered list.' },
      selector: { type: 'string', description: 'CSS selector of the element to scroll into view.' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      if (args.index === undefined && !args.selector) return err('需要 index 或 selector 来定位元素');
      const data = await callBrowserApi('/action', 'POST', { action: 'scroll_into_view', index: args.index, selector: args.selector }) as any;
      if (data?.error) return err(data.error);
      return ok(`已滚动到元素${args.index !== undefined ? ` (index=${args.index})` : ` (${args.selector})`}`);
    } catch (e: any) { return err(e?.message || '滚动到元素失败'); }
  }
}
export class BrowserIsVisibleTool implements BuiltInTool {
  name = 'browser_is_visible';
  description = 'Check whether an element is visible. Returns { visible: boolean, reason }. 返回元素是否可见及原因。用 index 或 selector 定位。';
  inputSchema = {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Element index from browser_get_page_info numbered list.' },
      selector: { type: 'string', description: 'CSS selector of the element to check.' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      if (args.index === undefined && !args.selector) return err('需要 index 或 selector 来定位元素');
      const data = await callBrowserApi('/action', 'POST', { action: 'is_visible', index: args.index, selector: args.selector }) as any;
      if (data?.error) return err(data.error);
      return ok(`元素可见性: ${JSON.stringify(data)}`);
    } catch (e: any) { return err(e?.message || '可见性检测失败'); }
  }
}

// ========== C13 拖拽 ==========
export class BrowserDragTool implements BuiltInTool {
  name = 'browser_drag';
  description = 'Drag from a start point to an end point. 从起点拖到终点。起点/终点均可用 index/selector/坐标(x/y)指定。';
  inputSchema = {
    type: 'object',
    properties: {
      fromIndex: { type: 'number', description: 'Element index of drag source (from browser_get_page_info).' },
      fromSelector: { type: 'string', description: 'CSS selector of drag source.' },
      fromX: { type: 'number', description: 'X coordinate of drag source.' },
      fromY: { type: 'number', description: 'Y coordinate of drag source.' },
      toIndex: { type: 'number', description: 'Element index of drop target (from browser_get_page_info).' },
      toSelector: { type: 'string', description: 'CSS selector of drop target.' },
      toX: { type: 'number', description: 'X coordinate of drop target.' },
      toY: { type: 'number', description: 'Y coordinate of drop target.' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const hasFrom = args.fromIndex !== undefined || args.fromSelector || (args.fromX !== undefined && args.fromY !== undefined);
      const hasTo = args.toIndex !== undefined || args.toSelector || (args.toX !== undefined && args.toY !== undefined);
      if (!hasFrom || !hasTo) return err('需要起点（fromIndex/fromSelector/fromX+fromY）和终点（toIndex/toSelector/toX+toY）');
      const data = await callBrowserApi('/action', 'POST', {
        action: 'drag',
        fromIndex: args.fromIndex, fromSelector: args.fromSelector, fromX: args.fromX, fromY: args.fromY,
        toIndex: args.toIndex, toSelector: args.toSelector, toX: args.toX, toY: args.toY,
      }) as any;
      if (data?.error) return err(data.error);
      return ok(`拖拽完成: ${JSON.stringify(data)}`);
    } catch (e: any) { return err(e?.message || '拖拽失败'); }
  }
}

// ========== P1-5 代码模式（2026-10-07） ==========
export class BrowserRunScriptTool implements BuiltInTool {
  name = 'browser_run_script';
  description = 'Execute a JavaScript snippet in the current page context and return its JSON-serializable result. 代码模式：把多步固定操作收敛为一段脚本一次执行（如"滚动到底触发懒加载→收集全部列表项→返回 JSON"），替代多轮 click/scroll/get_page_content，大幅省步数与 token。脚本在页面主世界运行，可用 document / window / fetch；返回值必须可 JSON 序列化，用 return 返回（例：return JSON.stringify([...]) 或 return {...}）。★ 直接写 `const x=...; return x;` 即可（工具会自动包一层函数）；也可自己写成 (() => {...})() 或 (async () => {...})()。超时 30s，脚本长度上限 64000 字符。适用：重复性流程、批量提取、条件循环；需要看页面再决策时仍用 browser_get_page_content。可传 tabId 在指定标签页执行。';
  inputSchema = {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'JavaScript 源码。可直接写语句加 return（会自动作成函数），或写 IIFE / 表达式。异步逻辑用 (async () => { ... })().' },
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
    },
    required: ['script'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const script = String(args.script || '');
      if (!script.trim()) return err('script is required');
      if (script.length > 64000) return err('script too long (max 64000 chars)');
      const data = await callBrowserApi('/action', 'POST', { action: 'run_script', script, tabId: args.tabId }) as any;
      if (data?.error) return err(`${data.error}${data.hint ? `\n提示：${data.hint}` : ''}`);
      let resultText = '';
      try { resultText = JSON.stringify(data.result); } catch { resultText = String(data.result); }
      if (resultText.length > 8000) resultText = resultText.slice(0, 8000) + `…(截断，原长 ${resultText.length})`;
      return ok(`Executed in page. URL: ${data.url || ''}\nTitle: ${data.title || ''}\nResult: ${resultText || '(undefined)'}`);
    } catch (e: any) { return err(e?.message || '脚本执行失败'); }
  }
}

/** 所有浏览器工具类列表 */
export const BrowserToolClasses = [
  BrowserNavigateTool,
  BrowserOpenExternalTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserPressKeyTool,
  BrowserScrollTool,
  BrowserHoverTool,
  BrowserGetTextTool,
  BrowserGetDomTool,
  BrowserWaitTool,
  BrowserScreenshotTool,
  BrowserFillFormTool,
  BrowserSubmitFormTool,
  BrowserSearchTool,
  BrowserNextPageTool,
  BrowserPrevPageTool,
  BrowserWaitForTool,
  BrowserGetVisibleTextTool,
  BrowserGetPageContentTool,
  BrowserSelectOptionTool,
  BrowserCheckTool,
  BrowserUncheckTool,
  BrowserGetPageInfoTool,
  BrowserLoginSavedTool,
  // C4 多标签页管理
  BrowserNewTabTool,
  BrowserSwitchTabTool,
  BrowserCloseTabTool,
  BrowserGetTabsTool,
  // C5 网络请求监听
  BrowserWaitForRequestTool,
  BrowserGetNetworkLogTool,
  // C6 结构化数据提取
  BrowserExtractListTool,
  // C9 视觉定位闭环
  BrowserVisualLocateTool,
  // C11 文件上传/下载
  BrowserUploadTool,
  BrowserDownloadTool,
  // C12 滚动到元素 / 可见性检测
  BrowserScrollIntoViewTool,
  BrowserIsVisibleTool,
  // C13 拖拽
  BrowserDragTool,
  // P1-5 代码模式（2026-10-07）
  BrowserRunScriptTool,
];

/** 所有浏览器工具的暴露名（裸名） */
export const BROWSER_TOOL_NAMES = [
  'browser_navigate', 'browser_open_external', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom',
  'browser_wait', 'browser_screenshot',
  'browser_fill_form', 'browser_submit_form', 'browser_search',
  'browser_next_page', 'browser_prev_page', 'browser_wait_for', 'browser_get_visible_text',
  'browser_get_page_content',
  'browser_select_option', 'browser_check', 'browser_uncheck', 'browser_get_page_info',
  'browser_login_saved',
  // C4 多标签页管理
  'browser_new_tab', 'browser_switch_tab', 'browser_close_tab', 'browser_get_tabs',
  // C5 网络请求监听
  'browser_wait_for_request', 'browser_get_network_log',
  // C6 结构化数据提取
  'browser_extract_list',
  // C9 视觉定位闭环
  'browser_visual_locate',
  // C11 文件上传/下载
  'browser_upload', 'browser_download',
  // C12 滚动到元素 / 可见性检测
  'browser_scroll_into_view', 'browser_is_visible',
  // C13 拖拽
  'browser_drag',
  // P1-5 代码模式（2026-10-07）
  'browser_run_script',
];
