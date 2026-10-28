// 浏览器自动化内置工具集 —— 调用服务端 /api/browser 下的端点（Playwright）
// 包含：navigate / click / type / press_key / scroll / hover / get_text / get_dom / wait / screenshot
import type { BuiltInTool } from '../../types';
import type { McpCallResult } from '../../../mcp/client';
import { toolError } from '../../result';
// ★ 不直接 import node:fs —— core 是平台无关层（三端可用），文件系统一律走
//   getPlatformAdapter().fs（与 file-write.ts 同一约定）。此前误引 node:fs 会破坏
//   该原则：core 被前端/bundle 引用时静态解析失败。
import { getPlatformAdapter } from '../../../platform/types';
import { joinPath } from '../fs-walk';
import { getRecipe, listRecipes, runRecipe, findRecipesForHost, allRecipes, loadFileRecipes, type RecipeApi } from './recipes';

/** 获取 auth token（浏览器/web/桌面端均可访问 localStorage） */
function getAuthToken(): string | null {
  try { return localStorage.getItem('auth_token'); } catch { return null; }
}

/**
 * ★★★ 会话标识透传（A4 根治，2026-10-10）：把「这次浏览器操作属于哪个会话」带给后端。
 *
 * ★ 为什么必须（实测缺陷）：服务端 Playwright 是**进程级单例** ——
 *   `pageInstance` / `activeTabId` 全局单值，读路由（`GET /state`、`GET /screenshot`）
 *   直接读它 ⇒ **A 会话导航中、B 会话截图会拿到 A 的页面**，且**静默无报错**
 *   （模型据此继续决策，全在错页面上）。
 * ★ 会话标识从哪来：`ToolContext.conversationId` **早已存在**（`tool/types.ts`），
 *   服务端执行工具时也已构造（`llm-task-manager` 的 `toolCtx`）——只是**浏览器工具收不到**
 *   （34 个工具里 33 个 `execute` 还写在用旧的单参签名）。
 *   ⇒ 本模块用**模块级"当前会话"变量**承载：由调用方（执行器）在每次执行前设置，
 *     工具内部无需逐个改签名即可透传（改动面最小、且天然覆盖全部 browser_* 工具）。
 *   ★ 为什么不用"改 33 个 execute 签名"：改动面大、且**必然漏**（本项目一贯判据）。
 *     模块级变量在此是安全的：工具执行本身是**串行**的（见 `llm-task-manager` 的工具执行出口），
 *     且每个工具内部读完即用（不存在跨 await 的错配窗口）——
 *     实际读值发生在 `callBrowserApi` 同步取 header 的那一刻。
 */
let currentConversationId: string | null = null;

/** 由执行器在调用 browser_* 工具前设置「当前会话」（见 `tool/types.ts` 的 ctx.conversationId） */
export function setBrowserToolConversationId(convId: string | null | undefined): void {
  currentConversationId = convId ? String(convId) : null;
}

/** 读取当前会话标识（供守门测试与排障） */
export function getBrowserToolConversationId(): string | null {
  return currentConversationId;
}

/**
 * 当前任务的**工作目录**（与 currentConversationId 同一套模块级透传）。
 *
 * ★ 为什么（2026-10-26）：`browser_*` 触发的下载（页面「导出」按钮 = blob 下载）需要
 *   落到 <工作目录>/downloads/ 才能被模型后续的文件工具直接读取；服务端 Playwright
 *   链路的路由层拿不到 ToolContext，只能由执行器在每次任务执行前设置。
 */
let currentWorkspaceDir = '';

/** 由执行器在调用 browser_* 工具前设置「当前工作目录」 */
export function setBrowserToolWorkspaceDir(dir: string | null | undefined): void {
  currentWorkspaceDir = dir ? String(dir) : '';
}

/** 读取当前工作目录（供守门测试与排障） */
export function getBrowserToolWorkspaceDir(): string {
  return currentWorkspaceDir;
}

/**
 * 语义定位参数（2026-10-27）：模型说得出「点带某文字的按钮」，却猜不出动态 class 选择器。
 *
 * ★ 为什么是嵌套对象而不是扁平 text/role：`browser_type` 的 `text` 已是「要输入的内容」、
 *   `browser_select_option` 的 `label` 已是「选项文本」—— 扁平新增会撞名，
 *   于是所有动作统一用 `target:{...}`，跨工具参数一致。
 * ★ 与 index/selector 的关系：同时给出时 index/selector 优先（显式路径不该被覆盖）。
 */
function semanticTargetSchema() {
  return {
    type: 'object',
    properties: {
      text: { type: 'string', description: '可见文本 / accessible name（默认允许包含与近似；exact:true 时须完全相等）。' },
      role: { type: 'string', description: '语义角色，如 button / link / textbox / checkbox / combobox / menuitem / tab。' },
      label: { type: 'string', description: '关联标签文本（aria-label / aria-labelledby / label[for] / 就近 label / placeholder）。' },
      exact: { type: 'boolean', description: 'text/label 是否要求完全相等（默认 false）。' },
      near: { type: 'string', description: '邻近约束：候选项自身或附近（≤4 层祖先 / 前序兄弟）须含这段文字，用于同名按钮消歧。' },
    },
    description: '语义定位（text / role / label 至少一项）。同时给 index 或 selector 时以它们为先（target 只在没给显式定位时生效）。命中多个元素时不执行，返回 candidates —— 选一个 index 重试或加 exact/role/near 收窄。当前仅桌面应用可用。',
  };
}

/** 本次调用是否用了语义定位 */
function usesSemanticTarget(args: Record<string, unknown>): boolean {
  const t = args?.target as Record<string, unknown> | undefined;
  return !!t && typeof t === 'object' && !!(t.text || t.role || t.label);
}

/**
 * 导航回执的「本站可用配方」提示（2026-10-28，任务 4）。
 *
 * ★ 为什么：配方清单只写在 browser_run_recipe 的工具描述里，模型经常忘了先查配方就
 *   开始手工试错（抖音发布页反复填表 2 小时的根因之一）。把「先试配方」从软约束变成
 *   每次导航的强提醒 —— host 匹配到配方就列出来，任何站点都补一句 form-fill 通用配方。
 *   提示是增强能力：匹配失败静默返回空串，绝不影响导航本身。
 */
function buildRecipeHint(url: string): string {
  try {
    const matched = findRecipesForHost(url);
    const lines = matched.map((r) => `- ${r.id}：${r.description}（参数：${Object.keys(r.params).join('、') || '无'}）`);
    // form-fill 是通用配方（hosts 为空 = 任意站点），单独补上表单提醒
    const formFill = allRecipes().find((r) => r.id === 'form-fill');
    if (formFill && !matched.some((r) => r.id === 'form-fill')) {
      lines.push(`- form-fill：${formFill.description}（参数：fields、submit?、submitText?）—— 字段 ≥2 的任何表单都先考虑它`);
    }
    if (!lines.length) return '';
    return `\n【本站可用配方】操作前优先调用 browser_run_recipe：\n${lines.join('\n')}`
      + `\n（配方在代码里确定性执行"填表/核验/提交"全流程，失败会返回失败步骤与页面现场，比手工试错快得多）`;
  } catch { return ''; }
}

/**
 * 语义定位只在桌面端（Electron 直连 / 桌面桥）实现；服务端 Playwright 链路的规则对齐是下一步。
 * 这里提前给明确错误，避免模型收到服务端的 not_found 后误判「页面上真没这个元素」。
 */
function semanticGuard(args: Record<string, unknown>): McpCallResult | null {
  if (!usesSemanticTarget(args)) return null;
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
  if (isElectron) return null;
  return toolError('语义定位（target）当前仅在桌面应用可用；请改用 index 或 selector（动态页面可先用 browser_get_page_content 拿编号）。');
}

/** 绑定语义参数到 action payload（未提供时保持原样，确保旧调用零变化） */
function withTarget<T extends Record<string, unknown>>(payload: T, args: Record<string, unknown>): T {
  return (usesSemanticTarget(args) ? { ...payload, target: args.target } : payload) as T;
}

/** 调用浏览器 API 端点 */
async function callBrowserApi(path: string, method: 'GET' | 'POST' = 'POST', body?: unknown): Promise<unknown> {
  // 桌面端：将 /navigate 和 /action 转发到 IPC 直接操作可见的 BrowserView（含虚拟鼠标光标）
  const electron = (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) ? (window as any).electronAPI : null;
  if (electron && method === 'POST' && (path === '/navigate' || path === '/action')) {
    let ipcAction = path === '/navigate' ? 'navigate' : (body as any)?.action;
    let ipcArgs = path === '/navigate' ? (body as any) : (() => { const { action, ...rest } = body as any; return rest; })();
    // 工作目录随动作下发（2026-10-26）：桌面端据此把下载落进 <工作目录>/downloads/
    if (currentWorkspaceDir && ipcArgs && typeof ipcArgs === 'object') {
      ipcArgs = { ...ipcArgs, __workspaceDir: currentWorkspaceDir };
    }
    const result = await electron.browserView.action(null, ipcAction, ipcArgs);
    if (result?.error) throw new Error(result.error);
    return result;
  }
  // Web 端或非 action 路径（/screenshot、/passwords 等）：走 server Playwright
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // ★★★ A4 根治（2026-10-10）：带上会话标识 —— 服务端据此把"活动页"按会话隔离，
  //   避免 A 会话导航中、B 会话读取拿到 A 的页面（且静默无报错）。
  //   ★ header 名与 `apps/server/src/routes/browser.ts` 的读取处必须逐字一致。
  if (currentConversationId) headers['x-yz-conversation-id'] = currentConversationId;
  // 后端 Node.js 环境用绝对 URL，前端用相对 URL
  const baseUrl = typeof window !== 'undefined' ? '' : `http://127.0.0.1:${process.env.PORT || 3001}`;
  // 内置工具发起的导航/操作打上 agent 标记：服务端据此把智能体操作沉淀进浏览器记忆文件（区别于用户手动浏览）
  const isAgentAction = path === '/navigate' || path === '/action';
  const url = baseUrl + '/api/browser' + path + (isAgentAction ? (path.includes('?') ? '&' : '?') + 'src=agent' : '');
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined
      ? JSON.stringify(
        isAgentAction && currentWorkspaceDir && body && typeof body === 'object'
          ? { ...(body as Record<string, unknown>), __workspaceDir: currentWorkspaceDir }
          : body,
      )
      : undefined,
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
async function saveShotToTemp(base64: string): Promise<{ file: string; screenshotUrl: string; size: number } | null> {
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
    const buf = Buffer.from(base64, 'base64');
    await fsp.writeFile(file, buf);
    return { file, screenshotUrl: `/api/plugin/computer-use/screenshots/${nodePath.basename(file)}`, size: buf.length };
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
  return err(`未提供定位参数（index / selector / target / x+y）${list}\n请从上方编号列表中选择目标元素，以 { "index": <编号> } 形式重新调用；或用 target:{text:"元素上的文字"} 语义定位。`);
}

// ========== 导航 ==========
export class BrowserNavigateTool implements BuiltInTool {
  name = 'browser_navigate';
  description = 'Navigate the in-app browser preview panel to a URL (renders inside the app, not a system browser). 浏览器面板未打开时会自动拉起并打开目标页，无需请用户手动展开面板。注意：一次只调用一个 browser_navigate，不要在同一批并行调用多个导航（浏览器是单活动页状态机，多个导航会互相覆盖，只有最后一个页面留存）。需要同时打开多个页面时：先调用一次本工具打开第一个，其余页面改用 browser_new_tab 新开标签页（返回 tabId），读取内容时给读取类工具传对应 tabId。';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to.' },
      tabId: { type: 'number', description: '可选：目标标签页 id（来自 browser_new_tab / browser_get_tabs），缺省为当前活动标签页。' },
      openInNewTab: { type: 'boolean', description: '编排层内部参数：同一批出现多个导航时，第 2 个及之后的导航会自动转为新开标签页并返回 tabId，无需手动传。' },
      force: { type: 'boolean', description: '强制重新加载：目标 URL 与当前页面相同时默认不重复导航（返回 alreadyOpen，避免重置页面/清空已填表单）；确需刷新该页时才传 true。' },
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
      // ★ 幂等：URL 与当前页相同时主进程不再重复导航（返回 alreadyOpen），
      //   避免"填好的表单被重置、任务反复重来"；确需刷新才传 force:true。
      const force = args.force === true ? true : undefined;
      const data = await callBrowserApi('/navigate', 'POST', { url, tabId, force }) as any;
      if (data && data.alreadyOpen) {
        return ok(`当前页面已经就是该 URL，未重复导航（alreadyOpen —— 重复导航会重置页面/清空已填表单）。\nURL: ${data.url}\nTitle: ${data.title || ''}\n${data.note || ''}${buildRecipeHint(data?.url || url)}`);
      }
      return ok(`Navigated to ${data.url}\nTitle: ${data.title}${buildRecipeHint(data?.url || url)}`);
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
  description = 'Click an element in the browser. 四种定位方式：index（元素编号，来自 browser_get_page_content / browser_get_page_info 返回的列表）、selector（CSS 选择器）、target（语义定位：按可见文本/role/label 找元素）、x+y（页面坐标）。index 对动态 hash class、iframe 内元素最稳；选择器猜不到时**优先用 target**（例 target:{text:"发布",role:"button"}），不要用 run_script 穷举 DOM；坐标仅在前三者都拿不到时使用。Uses real mouse movement. 返回统一结构：status（ok / ambiguous / not_found / stale_index / invalid_args / rejected / failed）、pageChanged、urlChanged；歧义时附 candidates（可直接选 index 重试），失败时附 hint。★ 点击原生 checkbox 会被拒绝（status=rejected，附整页 checkbox 候选清单）：改用 browser_fill_form 一次勾选，不要逐个点；同一目标被拒 2 次后放行，自定义控件不受限。选择器文本漂移时会自动按「同标签 + 相似文本」重定位（autoRelocated=fuzzy-text），index 失效时先按 selector 快照、再按文本模糊降级。★ 原生表单控件（checkbox / radio / select）不要用它逐个点：原生控件一律用 browser_fill_form —— 可一次填多个、有回读核验与幂等保护，逐个点既多花步数又容易漏勾。本工具用于：自定义下拉/组件库伪控件展开、联想输入选建议项、普通按钮与链接、以及 fill_form 不适用时的兜底。★ 点击「导出 / 下载 / 生成报表」类按钮时，文件会自动落盘（不弹系统保存框），保存路径写在本回执的 downloaded 字段里 —— 直接用文件工具按该路径读取，不要重复点击导出。';
  inputSchema = {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Element index from the numbered interactive-element list returned by browser_get_page_content / browser_get_page_info / browser_get_dom. 比 selector 更稳（不受动态 class、iframe 影响）。失效时重新读取页面刷新列表。' },
      selector: { type: 'string', description: 'CSS selector of the element to click. Supports :contains("text") pseudo-selector to match elements by visible text, e.g. button:contains("登录"). If multiple elements match, an ambiguous candidate list with indexes is returned.' },
      target: semanticTargetSchema(),
      x: { type: 'number', description: 'X coordinate (last resort, if no index/selector/target).' },
      y: { type: 'number', description: 'Y coordinate (last resort, if no index/selector/target).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      // 空参兜底：自动返回页面编号元素清单，引导模型用 index 重试
      if (args.index === undefined && !args.selector && !usesSemanticTarget(args) && args.x === undefined && args.y === undefined) {
        return await emptyTargetHint();
      }
      const data = await callBrowserApi('/action', 'POST', withTarget({ action: 'click', index: args.index, selector: args.selector, x: args.x, y: args.y }, args)) as any;
      const text = JSON.stringify(data);
      if (data?.downloaded?.savedPath) {
        return ok(`${text}\n\n已自动下载：${data.downloaded.savedPath}（文件已落盘，后续直接用文件工具按此路径读取，不要重复点击导出）`);
      }
      return ok(text);
    } catch (e: any) { return err(e?.message || '点击失败'); }
  }
}

// ========== 输入文本 ==========
export class BrowserTypeTool implements BuiltInTool {
  name = 'browser_type';
  description = 'Type text into an element. 定位方式：index（元素编号，来自 browser_get_page_content / browser_get_page_info）、selector（CSS 选择器）、target（语义定位：按可见文本/role/label 找输入框）、或省略三者直接输入到当前焦点元素。选择器猜不到时优先用 target（例 target:{label:"标题"}），不要用 run_script 穷举 DOM；命中多个时返回 candidates 而不输入。输入框目标不明确时先用 browser_get_page_content 找到 textarea/input 的 index。要提交表单/搜索时传 pressEnter:true（等价于输入后按 Enter，不要用 text:"" 来表示回车）。\n'
    + '★ 走**真实键盘输入**（桌面端经 CDP `Input.insertText`，会派发 beforeinput/input 等编辑事件）：'
    + '对受控组件（React/Vue）、富文本编辑器（ProseMirror/Slate/Draft.js）、中文输入法场景都有效 —— '
    + '评论框、发帖框、搜索框这类"看着填了、提交却是空的"问题由它解决。\n'
    + '★ 参数 text 是**替换**语义（先清空再输入），不是追加。返回里的 applied 字段表示回读核验是否一致；'
    + '★ 幂等保护（2026-10-19）：写前先读 —— 当前值规范化后已等于/包含目标文本时**不会清空重填**，直接返回 unchanged:true；'
    + '同一字段连续 2 次未生效会返回 forceStop:true，此时**必须停止重填**，回读一次确认现场并向用户报告，不要换写法继续试。\n'
    + '★ 返回统一结构：status（ok / ambiguous / not_found / stale_index / failed）、pageChanged、urlChanged；'
    + 'selector 文本漂移时会按「同标签 + 相似文本」自动重定位（autoRelocated=fuzzy-text）。';
  inputSchema = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to type. 替换语义（先清空再输入）。省略且 pressEnter:true 时只按回车不输入文本。' },
      index: { type: 'number', description: 'Element index from the numbered interactive-element list returned by browser_get_page_content / browser_get_page_info / browser_get_dom. 比 selector 更稳（不受动态 class、iframe 影响）。省略时输入到当前焦点元素。' },
      selector: { type: 'string', description: 'CSS selector to focus before typing (optional). Supports :contains("text") pseudo-selector. If multiple elements match, an ambiguous candidate list with indexes is returned.' },
      target: semanticTargetSchema(),
      pressEnter: { type: 'boolean', description: '输入完成后按一次 Enter（提交搜索/表单）。text 与 pressEnter 至少给一个。真实的 Enter 按键事件，不是 JS 合成的。' },
    },
    required: [],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      const text = args.text as string | undefined;
      const pressEnter = args.pressEnter === true;
      if (!text && !pressEnter) {
        return err('text is required（或传 pressEnter:true 仅回车提交）。要按回车请传 pressEnter:true，不要传 text:""');
      }
      // 注意：无 index/selector/target 时合法——输入到当前聚焦元素（先 click 聚焦再 type）
      const data = await callBrowserApi('/action', 'POST', withTarget({ action: 'type', index: args.index, selector: args.selector, text: text || '', pressEnter }, args)) as any;
      if (data?.error === '无聚焦元素') {
        // 无聚焦目标时给出引导，而非裸报错
        const hint = await emptyTargetHint();
        return err(`无聚焦元素（需先用 browser_click 聚焦输入框，或直接传 index/selector/target）${(hint.content?.[0]?.text || '').replace(/^未提供定位参数（[^）]*）/, '')}`);
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
  description = 'Scroll the browser page or a specific element into view. 指定元素用 selector / index / target（语义定位）三者之一；都不给则按 x/y 滚动页面。';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to scroll into view (optional).' },
      index: { type: 'number', description: '元素编号（来自 browser_get_page_content），滚到该元素。' },
      target: semanticTargetSchema(),
      x: { type: 'number', description: 'Horizontal scroll delta (default 0).' },
      y: { type: 'number', description: 'Vertical scroll delta (default 300).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      await callBrowserApi('/action', 'POST', withTarget({ action: 'scroll', selector: args.selector, index: args.index, x: args.x, y: args.y }, args));
      const where = args.selector ? `to ${args.selector}`
        : args.index != null ? `to index ${args.index}`
          : usesSemanticTarget(args) ? `to target ${JSON.stringify(args.target)}`
            : `by (${args.x || 0}, ${args.y || 300})`;
      return ok(`Scrolled ${where}`);
    } catch (e: any) { return err(e?.message || '滚动失败'); }
  }
}

// ========== 悬停 ==========
export class BrowserHoverTool implements BuiltInTool {
  name = 'browser_hover';
  description = 'Hover over an element by selector / index / target（语义定位）or coordinates. Uses real mouse movement.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to hover. Supports :contains("text") pseudo-selector.' },
      index: { type: 'number', description: '元素编号（来自 browser_get_page_content）。' },
      target: semanticTargetSchema(),
      x: { type: 'number', description: 'X coordinate (if no element given).' },
      y: { type: 'number', description: 'Y coordinate (if no element given).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      await callBrowserApi('/action', 'POST', withTarget({ action: 'hover', selector: args.selector, index: args.index, x: args.x, y: args.y }, args));
      const where = args.selector ? args.selector
        : args.index != null ? `index ${args.index}`
          : usesSemanticTarget(args) ? `target ${JSON.stringify(args.target)}`
            : `(${args.x}, ${args.y})`;
      return ok(`Hovered ${where}`);
    } catch (e: any) { return err(e?.message || '悬停失败'); }
  }
}

// ========== 获取文本 ==========
export class BrowserGetTextTool implements BuiltInTool {
  name = 'browser_get_text';
  // 读**页面当前快照**：入参（selector / tabId）只决定"读哪块、读哪页"，结果随页面变化
  readsExternalState = true;
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
  // 读**页面当前快照**：DOM 树随页面变化，同参重复调用结果可能不同
  readsExternalState = true;
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
  // 读**页面当前快照**：截图拿到的是"此刻"的画面，与入参无关
  readsExternalState = true;
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
      // ★ _meta（2026-10-09）：落盘成功时回传 path → artifact-hooks 统一登记 conversation_file
      //   （离线 Playwright 路径此前只落临时区不登记，文件管理/工件清单看不到）
      const meta = saved?.file
        ? { path: saved.file, name: saved.file.split(/[/\\]/).pop() || 'screenshot.png', category: 'intermediate', bytes: saved.size }
        : undefined;
      return meta ? okWithMeta(JSON.stringify(payload), meta) : ok(JSON.stringify(payload));
    } catch (e: any) { return err(e?.message || '截图失败'); }
  }
}

// ========== 批量填写表单 ==========
export class BrowserFillFormTool implements BuiltInTool {
  name = 'browser_fill_form';
  description = 'Fill multiple form fields at once. Each field: {selector?, index?, value, type?} where type is "text"|"select"|"checkbox"|"radio". index 与高亮编号 / browser_click 同源，可直接替代 selector。For select use label or value. For checkbox/radio set value true/false. 普通输入框与富文本编辑器（contenteditable，如 Slate/ProseMirror/Draft.js）都支持：富文本字段直接传 selector（或 index）指向该 div，value 为要填的纯文本。可选 submit：true=填完点页面上的提交按钮；{selector|index}=点指定按钮；不传=只填不提交。返回 state 数组 = 各字段填写后的当前值（回读核验）+ submit 结果。★ 批量效率硬规则（决定快慢）：① 同一页面 2 个及以上待填字段必须一次调用填完，禁止逐个 browser_type；② 原生 checkbox 勾选两个以上必须把全部 index 放进同一次调用（value 传 "true"/"false"），禁止用 browser_click 逐个勾；③ 原生 select 与 radio 并入同一批，替代「点开下拉→再点一项」的两步；④ 已经是目标值的字段不要动它。★ 不适用的控件（保持单步、别浪费调用）：自定义下拉/组件库伪控件（role=combobox|listbox|checkbox|radio|switch，class 含 el-select/ant-select/n-select/select2）、带联想输入（aria-autocomplete）、只读字段——这些用 browser_click 展开后按 index 选。★ 返回分三档：failed=真失败（按原因换定位重试）；deferred=依赖未就绪（上游字段没填/选项异步加载，先填上游再回头补这一项，严禁原样重试）；skipped=fill_form 不支持的控件（改用 browser_click 展开后选）。★ 幂等保护（2026-10-19）：已等于/包含目标值的字段会跳过（不清空重填）；同一字段连续 2 次未生效会标记 forceStop，此时停止重填并汇报，不要用 run_script 反复清空重写。';
  inputSchema = {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'Array of {selector?, index?, value, type?, label?} to fill. 优先用 index（来自 get_page_info / 页面高亮编号）。',
        items: { type: 'object' },
      },
      submit: {
        description: '可选：填完后提交。true=点页面上的提交按钮；对象 {selector|index}=点指定按钮；不传=不提交。发布类动作仅当指令明确授权时才传 true。',
        anyOf: [{ type: 'boolean' }, { type: 'object' }],
      },
    },
    required: ['fields'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'fill_form', fields: args.fields, submit: args.submit }) as any;
      // ★★★ B3（2026-10-10）：必须**透传逐字段失败原因**。
      //   此前只回 `Filled N fields: [...]` —— 而桌面端元素找不到时是**静默跳过**
      //   （不计数、不报错），于是"只填上 1 个、其余全没找到"在模型看来与
      //   "全部填好"**完全一样**（都是 `Filled 1 fields`）。这正是本项目
      //   「静默失效」家族：不报错、只是结果不对。
      //   ⇒ 有 failed 时**明确列出**（含 selector 与原因），让模型能重试/换选择器。
      const failed = Array.isArray(data?.failed) ? data.failed : [];
      const deferred = Array.isArray(data?.deferred) ? data.deferred : [];
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
      const listOf = (arr: any[]) => arr
        .map((f: any) => `  - ${f?.selector || '(无选择器)'}: ${f?.reason || '未知原因'}${f?.hint ? `（${f.hint}）` : ''}`)
        .join('\n');
      const deferredNote = deferred.length
        ? `\n未填写（依赖未就绪 ${deferred.length} 个 —— 先填上游字段再回头补这些，不要原样重试）：\n${listOf(deferred)}`
        : '';
      const skippedNote = skipped.length
        ? `\n已跳过（fill_form 不支持的控件 ${skipped.length} 个）：\n${listOf(skipped)}`
        : '';
      // ★ P1-3 熔断：同页连续 2 次真失败后，回执里明确要求改走单步，不再让模型硬试批量
      const degradeNote = data?.degraded
        ? `\n⚠ ${data?.degradeNote || '批量填表在本页已降级：改用单步工具，或先重新获取元素编号再试一次。'}`
        : '';
      // ★ P2-1（2026-10-24）观察内联：把回读值直接带进回执。此前实现返回了 state、工具层却丢掉，
      //   模型只能"再读一次页面"才能核对是否生效 —— 这正是每次填表多一轮的成因。
      const state = Array.isArray(data?.state) ? data.state : [];
      const readback = state.length
        ? `\n回读：${state.map((s: any) => `${s?.selector || ''}=${String(s?.value ?? '').slice(0, 40) || '(空)'}`).join(' | ')}`
        : '';
      if (failed.length) {
        return err(
          `部分字段未填写成功（成功 ${data?.filled ?? 0} 个，失败 ${failed.length} 个）：\n${listOf(failed)}\n` +
          `建议：用 browser_get_page_info 重新获取元素编号与 selector 后重试失败项。` +
          deferredNote + skippedNote + degradeNote + readback,
        );
      }
      const sub = data?.submit;
      const subLine = sub
        ? (sub.submitted ? `；已提交（via ${sub.via || 'click'}）` : `；提交未成功：${sub.error || '未知原因'}`)
        : '';
      return ok(`Filled ${data.filled} fields: ${JSON.stringify(data.fields)}${deferredNote}${skippedNote}${degradeNote}${readback}${subLine}`);
    } catch (e: any) { return err(e?.message || '填表单失败'); }
  }
}

// ========== 提交表单 ==========
export class BrowserSubmitFormTool implements BuiltInTool {
  name = 'browser_submit_form';
  description = 'Submit a form by clicking a submit button (selector) or pressing Enter, then wait for navigation. ★ 提交成功不等于按钮点到了：提交后用 browser_get_page_content 重读页面 —— 离开表单（URL 变化或表单被列表/详情页取代）或出现成功提示才算成功；表单仍在且出现校验提示（请填写/请选择/必填/格式不正确/保存失败）时，照原话引用该提示、补上它点名的字段后再提交；同一提示连续出现 2 次就停止重试并如实汇报卡在哪个字段。';
  inputSchema = {
    type: 'object',
    properties: { selector: { type: 'string', description: 'CSS selector of submit button (optional, defaults to Enter).' } },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'submit_form', selector: args.selector }) as any;
      // ★ P2-1 观察内联：提交后附页面判定（成功提示 / 校验提示 / 是否还有表单），模型据此判断，不必再读一次页面
      const v = data?.verdict;
      const vLine = v
        ? (v.successText
          ? `；页面提示「${v.successText}」`
          : v.validText
            ? `；页面出现校验提示「${v.validText}」—— 提交多半未通过，按提示补填后重提`
            : v.forms > 0
              ? `；页面仍有 ${v.forms} 个表单，无法确认已离开表单（未见成功提示）`
              : '；未发现成功提示（页面已变化，请结合任务判断）')
        : '';
      return ok(`Form submitted. URL: ${data.url}\nTitle: ${data.title}${vLine}`);
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
  // 等的是"条件在未来某刻成立"：同参重放是天然轮询（现在超时、两秒后成功），
  // 结果取决于页面演进而非入参 —— 代码审查 2026-10-14 指出本条漏标
  readsExternalState = true;
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
  // 读**页面当前快照**：可见正文随页面变化
  readsExternalState = true;
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
  // ★ 本工具就是 2026-10-14 实报的当事人：模型带 maxTextLength 连调 3 次读的是页面
  //   三个不同时刻的状态 —— "相同输入不会产生新结果"对它不成立（见 ToolDefinition 该字段注释）
  readsExternalState = true;
  description = 'Get the current page content in one call: url + title + visible text body + numbered interactive elements + form state. 一次拿齐"内容 + 操作目标 + 表单状态"：页面标题/URL、可见正文、带编号的可交互元素清单（每个元素含 index、tag、selector（仅高质量选择器：id/testid/aria/name/placeholder；hash class/路径式省略——定位用 index）、type、name、placeholder、aria-label、value；输入框标注 ←可输入），以及【表单状态】段（页面上每个输入框/文本域/富文本/下拉的字段名、类型、是否必填、**当前值**）与【自上次读取的变化】段（哪些字段从什么变成了什么）。用途：既要看页面说了什么、又要知道点哪里/往哪输入时用它；click/type/fill_form 之后想确认结果也用它 —— **填完表单请以【表单状态】的值为准判断是否生效，不要重复填写**；【自上次读取的变化】为"无"说明上一步动作没改变任何字段，应换定位方式而不是重复同一动作。元素编号 index 可直接作为 browser_click / browser_type 的 index 参数，selector 也可直接作为 selector 参数。只看纯文本用 browser_get_visible_text；只要元素坐标用 browser_get_page_info；要看父子层级结构用 browser_get_dom。可传 tabId 读取指定标签页（来自 browser_new_tab / browser_get_tabs），用于多页并行场景，不必先切换标签页。';
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
        // 快照瘦身（2026-10-28）：selector 只回显高质量选择器（id/testid/aria/name/placeholder），
        // hash class/路径式为空串——展示行随之省略该段；定位主力是 index，不受影响
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
      // ★★★ 表单语义段（2026-10-13）：把"表单现在是什么状态"和"自上次读取以来哪些字段变了"
      //   直接喂给模型 —— 这是治「反复填同一个表单」的关键。
      //   此前模型填完只能自己从上百条可交互元素清单里比对当前值（值还常被截断/顺序漂移），
      //   判错就再填一遍（实测同一段文字填 2~3 次、大量 run_script 用于手写回读）。
      //   现在一次读页给出「字段=当前值」+「谁从什么变成了什么」，无需再猜。
      const formFields: any[] = Array.isArray(data.formFields) ? data.formFields : [];
      const formChanges: any[] = Array.isArray(data.formChanges) ? data.formChanges : [];
      let formSection = '';
      if (formFields.length > 0) {
        const lines = formFields.map((f: any) => {
          const label = f.label || f.selector || `#${f.index}`;
          const kind = f.kind === 'richtext' ? '富文本' : (f.kind || 'text');
          const meta: string[] = [kind];
          if (f.required) meta.push('必填');
          if (f.maxLength) meta.push(`${f.valueLen}/${f.maxLength}`);
          const val = (f.value === '' || f.value == null) ? '(空)' : `"${String(f.value).slice(0, 60)}"`;
          return `- ${label} (${meta.join(', ')})[index=${f.index}]: ${val}`;
        }).join('\n');
        formSection = `\n\n【表单状态】(${formFields.length} 个字段；值已逐字段回读，"已填/为空"以此为准 —— 已是目标值的字段不要重复填写)\n${lines}`;
        if (formChanges.length > 0) {
          const cl = formChanges.map((c: any) => `- ${c.field}: "${c.from}" → ${c.to === '' ? '(空)' : `"${c.to}"`}`).join('\n');
          formSection += `\n\n【自上次读取的变化】(${formChanges.length} 个字段变了)\n${cl}`;
        } else {
          formSection += `\n\n【自上次读取的变化】无。若上一步刚做过填写/点击，说明它**没有改变任何字段**：不要再重复同一动作，改换定位方式（重新读页取新 index / 先滚动到元素 / 检查是否被遮挡）或说明卡点。`;
        }
      }
      if (savedPath) {
        const preview = bodyText.slice(0, 4000);
        const more = bodyText.length > 4000 ? `\n…[正文过长已截断：全文 ${bodyText.length} 字符已保存到文件 ${savedPath}，后续处理用 file_read 按此路径读取，不要重复抓取]` : '';
        // ★ 必须回传 _meta.path：否则服务端通用钩子接不到该路径 → 落盘文件不登记
        //   conversation_file / 不进工件清单（等于白落盘）。category=intermediate（原始抓取）。
        return okWithMeta(
          `${header}${preview}${more}${formSection}\n\n【可交互元素】(${data.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数；也可直接用 <selector> 作为 selector 参数（瘦身：只有高质量选择器（id/testid/aria/name/placeholder）才回显，hash class/路径式省略 —— 该类元素请用 index 定位）)\n${elems}`,
          { path: savedPath, name: savedPath.split(/[/\\]/).pop() || 'page.txt', category: 'intermediate', bytes: bodyText.length },
        );
      }
      return ok(
        `${header}${bodyText}${formSection}\n\n【可交互元素】(${data.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数；也可直接用 <selector> 作为 selector 参数（瘦身：只有高质量选择器（id/testid/aria/name/placeholder）才回显，hash class/路径式省略 —— 该类元素请用 index 定位）)\n${elems}`
      );
    } catch (e: any) { return err(e?.message || '获取页面内容失败'); }
  }
}

// ========== 下拉选择 ==========
export class BrowserSelectOptionTool implements BuiltInTool {
  name = 'browser_select_option';
  description = 'Select an option in a native <select> dropdown by value or label. 控件定位用 selector / index / target（语义定位）三者之一。自定义下拉（role=combobox 弹层）不适用：先用 browser_click 展开，再点 option。';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the <select> element.' },
      index: { type: 'number', description: '元素编号（来自 browser_get_page_content）。' },
      target: semanticTargetSchema(),
      value: { type: 'string', description: 'Option value to select.' },
      label: { type: 'string', description: 'Option label (visible text) to select.' },
    },
    required: [],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      if (!args.selector && args.index == null && !usesSemanticTarget(args)) {
        return err('需要 selector / index / target 三者之一来指定下拉控件。');
      }
      const data = await callBrowserApi('/action', 'POST', withTarget({ action: 'select_option', selector: args.selector, index: args.index, value: args.value, label: args.label }, args)) as any;
      return ok(JSON.stringify(data));
    } catch (e: any) { return err(e?.message || '选择失败'); }
  }
}

// ========== 勾选/取消 ==========
export class BrowserCheckTool implements BuiltInTool {
  name = 'browser_check';
  description = 'Check a checkbox or radio button. 定位用 selector / index / target（语义定位）三者之一；自定义控件未生效时改用 browser_click。';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the checkbox/radio.' },
      index: { type: 'number', description: '元素编号（来自 browser_get_page_content）。' },
      target: semanticTargetSchema(),
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      if (!args.selector && args.index == null && !usesSemanticTarget(args)) {
        return err('需要 selector / index / target 三者之一来指定勾选项。');
      }
      const data = await callBrowserApi('/action', 'POST', withTarget({ action: 'check', selector: args.selector, index: args.index }, args)) as any;
      return ok(JSON.stringify(data));
    } catch (e: any) { return err(e?.message || '勾选失败'); }
  }
}
export class BrowserUncheckTool implements BuiltInTool {
  name = 'browser_uncheck';
  description = 'Uncheck a checkbox. 定位用 selector / index / target（语义定位）三者之一；自定义控件未生效时改用 browser_click。';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the checkbox.' },
      index: { type: 'number', description: '元素编号（来自 browser_get_page_content）。' },
      target: semanticTargetSchema(),
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const blocked = semanticGuard(args);
      if (blocked) return blocked;
      if (!args.selector && args.index == null && !usesSemanticTarget(args)) {
        return err('需要 selector / index / target 三者之一来指定勾选项。');
      }
      const data = await callBrowserApi('/action', 'POST', withTarget({ action: 'uncheck', selector: args.selector, index: args.index }, args)) as any;
      return ok(JSON.stringify(data));
    } catch (e: any) { return err(e?.message || '取消勾选失败'); }
  }
}

// ========== 页面信息 ==========
export class BrowserGetPageInfoTool implements BuiltInTool {
  name = 'browser_get_page_info';
  // 读**页面当前快照**（元素坐标/编号随页面布局变化）
  readsExternalState = true;
  description = 'Get current page url, title, and a numbered list of interactive elements with their on-screen coordinates (x/y/w/h), penetrating same-origin iframes and Shadow DOM, up to 300. 与 browser_get_page_content 的区别：本工具不返回正文文本，但每个元素额外带屏幕坐标和 bbox 尺寸。用途：需要坐标时用——按 x+y 点击、判断元素在视口内还是被遮挡/需滚动、配合 browser_screenshot 的 annotate=true 做截图编号框叠加、按位置筛选（如"右上角的按钮"）。元素属性同样齐全（index、selector（仅高质量选择器回显，hash/路径式省略——定位用 index）、tag、text、type、name、placeholder、value、ariaLabel、role、select 的 options、checkbox 的 checked）。可传 tabId 读取指定标签页，不必先切换标签页。';
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
        // 快照瘦身：selector 为空串（hash/路径式）时省略该段，只展示高质量选择器
        if (e.selector) s += ` <${e.selector}>`;
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
  description = 'Open a new browser tab and optionally navigate to a URL. Returns the new tab id. 新开标签页并导航（可选 url），返回标签页 id。浏览器面板/标签页未打开时会自动拉起并打开目标页，无需请用户手动展开面板。需要同时打开/对比多个页面时用本工具（不要并行调用多个 browser_navigate）；拿到 tabId 后可用读取类工具（browser_get_page_content 等）的 tabId 参数直接读取该页，无需切换标签页。'
    + ' 默认开新页会切到新页（用户能看到你在动哪页）；若这一页只是你自用的中间页、不想打断用户当前正在看的页面，传 background:true。'
    + ' ★ 要让用户看到某页，用 browser_switch_tab 显式切过去 —— 不要指望它自己跟着走。';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Optional URL to navigate the new tab to. 不传则打开空白标签页。' },
      background: {
        type: 'boolean',
        description: 'true = 后台开页（不抢用户当前视图），适合只供自己读写的中间页；缺省 false = 开新页并切过去。需要用户看见结果（填充/提交/交付页）时用缺省值。',
      },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'new_tab', url: args.url, background: args.background === true }) as any;
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
      // ★★★ 2026-10-15（复审 HIGH）：id 归一化 —— 接受 `tab-N` 与纯数字两种写法。
      //   旧实现 `(x) => Number(x)` + `Number.isFinite` 会把 `'tab-1'` 变成 NaN 后**静默过滤**
      //   → ids 为空 → 退回单数分支且 tabId 为 undefined → 主进程按"当前活动页"关闭：
      //   **关错页**（真正要关的卡死页还留着）。归一化后两种写法都指向同一个 tab。
      const normId = (x: unknown): string => {
        const s = String(x ?? '').trim();
        if (!s) return '';
        return /^\d+$/.test(s) ? 'tab-' + s : s;
      };
      const ids = Array.isArray(args.tabIds)
        ? (args.tabIds as unknown[]).map(normId).filter(Boolean)
        : [];
      if (ids.length) {
        const closed: string[] = [];
        const failed: string[] = [];
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
  // 读**当前标签页集合**：agent 自己开/关页就会改变结果
  readsExternalState = true;
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
  // 同 browser_wait_for：等网络请求在未来某刻完成，同参重复是合法的轮询
  readsExternalState = true;
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
  // 读**累计的网络记录**：日志只增不减，后一次调用必然可能包含新条目
  readsExternalState = true;
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
  // 读**页面当前快照**（列表项随页面/懒加载变化）
  readsExternalState = true;
  description = 'Extract a list of structured data from the page as JSON array. 按模板从页面批量提取列表数据，支持一次调用翻多页（翻页循环在代码里确定性执行，替代"extract→next_page→extract"的 2N 次调用）。selector 指定列表项容器，fields 描述每项要提取的字段（字段名→{selector,attr}）。attr 为 "text" 取文本，"html" 取 innerHTML，其他值取对应属性（如 href/src）。若不传 fields，自动识别常见列表项（商品卡片：标题/价格/链接）。★ 多页采集：pages 传要采集的总页数（默认 1 只取当前页）；nextSelector 传翻页控件的 CSS 选择器（默认自动找「下一页/Next/›」）；untilText 传停止文本（页面出现即提前停，如「没有更多了」）。每页之间自动等待内容刷新，采集失败返回已拿到的部分 + 失败页码，不要整批重试。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页。' },
      selector: { type: 'string', description: 'CSS selector of the list item container (e.g. ".goods-item"). 列表项容器选择器。' },
      fields: {
        type: 'object',
        description: 'Map of field name → { selector, attr }. attr: "text"=textContent, "html"=innerHTML, other=getAttribute(attr). e.g. { title: { selector: ".title", attr: "text" }, price: { selector: ".price", attr: "text" }, link: { selector: "a", attr: "href" } }.',
      },
      limit: { type: 'number', description: 'Max items per page (default 20). 单页条数；多页采集时总量 = limit × pages。' },
      pages: { type: 'number', description: '要连续采集的页数（默认 1 = 只取当前页）。翻页循环在工具内确定性执行，一次调用拿全。' },
      nextSelector: { type: 'string', description: '翻页控件的 CSS 选择器（可选，默认自动识别「下一页/Next/›/»」按钮或链接）。' },
      untilText: { type: 'string', description: '提前停止的页面文本（可选）：出现即停止翻页（如「没有更多」「到底了」）。' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', {
        action: 'extract_list', tabId: args.tabId, selector: args.selector, fields: args.fields, limit: args.limit,
        pages: args.pages, nextSelector: args.nextSelector, untilText: args.untilText,
      }) as any;
      if (data?.error) return err(data.error);
      // ★ 多页回执内联（2026-10-28）：采集了多少页、停在哪儿、有没有提前停 —— 模型据此
      //   决定续采还是收工，不必再读一次页面核对。
      const pageMeta = data?.pagesCollected > 1
        ? `\n已连续采集 ${data.pagesCollected} 页${data.stoppedByUntil ? `（第 ${data.stoppedPage} 页出现「${args.untilText}」提前停止）` : ''}${data.failedPage ? `；第 ${data.failedPage} 页翻页失败，以上为已采集部分，续采请传 pages 继续或换 nextSelector` : ''}`
        : '';
      return ok(`提取到 ${data.count} 条数据（${data.pagesCollected || 1} 页）：\n${JSON.stringify(data.items, null, 2)}${pageMeta}`);
    } catch (e: any) { return err(e?.message || '结构化提取失败'); }
  }
}

// ========== 任务 1（2026-10-28）网络 JSON 响应直采 ==========
export class BrowserGetApiDataTool implements BuiltInTool {
  name = 'browser_get_api_data';
  // 读**累计的接口响应缓冲**：页面继续浏览会有新条目进缓冲
  readsExternalState = true;
  description = 'Get captured JSON API responses from the page\'s own network traffic, by URL pattern. 直接读取页面自然发生的 XHR/fetch JSON 响应体（结构化数据），替代"读 DOM 猜结构"或"手写 fetch 脚本"——列表页、搜索页、分页数据的取数首选。urlPattern 为 URL 子串或正则（如 "/api/search" 或 "list\\?page="）；缺省返回最新一条匹配，all:true 返回最多 5 条。★ 响应必须在页面自然发生时被捕获（页面打开后浏览器自己发过的请求）：刚打开的新页先等加载、或 browser_scroll 触发懒加载后再取；不确定有哪些接口时先用 browser_get_network_log 看请求 URL 列表。取不到时回退 browser_extract_list（DOM 提取）或 browser_get_page_content，不要反复换 urlPattern 空试。';
  inputSchema = {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: '可选：目标标签页 id，缺省为当前活动标签页（桌面端多标签页时缓冲按页面各自累积）。' },
      urlPattern: { type: 'string', description: 'URL substring or regex to match (e.g. "/api/list" or "search\\?keyword="). URL 子串或正则。' },
      all: { type: 'boolean', description: 'true = 返回最多 5 条匹配（默认只回最新 1 条）。需要对比多次响应（如逐页 JSON）时开。' },
    },
    required: ['urlPattern'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const urlPattern = args.urlPattern as string;
      if (!urlPattern) return err('urlPattern 为必填项');
      const data = await callBrowserApi('/action', 'POST', { action: 'get_api_data', tabId: args.tabId, urlPattern, all: args.all === true }) as any;
      if (data?.error) return err(`${data.error}${data.hint ? `\n提示：${data.hint}` : ''}`);
      let text = '';
      try { text = JSON.stringify(data.entries, null, 2); } catch { text = String(data.entries); }
      if (text.length > 8000) text = text.slice(0, 8000) + `…(截断，原长 ${text.length}；响应体过大时建议传更精确的 urlPattern 或分页取)`;
      return ok(`捕获到 ${data.count} 条匹配的 JSON 响应（返回 ${data.returned} 条）：\n${text}`);
    } catch (e: any) { return err(e?.message || '读取接口数据失败'); }
  }
}

// ========== C9 视觉定位闭环 ==========
export class BrowserVisualLocateTool implements BuiltInTool {
  name = 'browser_visual_locate';
  // 读**页面当前快照**（按截图做视觉定位，画面变了结果就变）
  readsExternalState = true;
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
  description = 'Upload a local file into a web page. 上传本地文件到网页。两种用法：①【推荐·filechooser 模式】若「上传」按钮点击后弹出系统文件选择框、页面上看不到 input[type=file]（如抖音创作者平台/番茄等），用 clickSelector 或 clickIndex 指定这个按钮，工具会拦截文件选择器并投递文件；②若页面上有裸露的 input[type=file]，用 index 或 selector 直接定位（多上传口页面——头像/封面/视频——必须用 index 指定目标，别让工具猜）。★ 结果语义：uploaded=true 只代表 CDP 投递完成；verified=true 才代表页面已接管（出现文件名/进度，或网络层有上传请求）。返回 uploaded=false + code=not_started 表示页面没接收：按 fileInputs（index/accept/near/visible）用 index 精确指定再试，或改用 clickSelector 指向上传按钮；同一文件在同一页连续 2 次这种情况会直接熔断（code=upload_loop），此时应停下来换入口或用 index 指定，不要原样重试。';
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
  description = '触发下载并等待完成，返回保存路径；不传 url/selector 时列出最近的下载记录。'
    + '★ 点「导出/下载」类按钮时，文件会**自动落盘**（不会弹系统「另存为」框），保存路径已直接写进 browser_click 回执的 downloaded 字段 —— 拿到路径就用文件工具读取，不要重复点导出。'
    + '本工具的 list 模式用于事后查询（例如下载是页面异步生成、点击时还没开始）。';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to trigger download (optional if using selector).' },
      selector: { type: 'string', description: 'CSS selector of a link/button to click to trigger download (optional if using url).' },
      savePath: { type: 'string', description: 'Path to save the downloaded file (optional). 相对路径基于工作目录；不传则存到 <工作目录>/downloads/（无工作目录时存到系统下载目录）。' },
      limit: { type: 'number', description: '仅查询模式：返回最近的 N 条下载记录（默认 10，最多 50）。' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      if (!args.url && !args.selector) {
        const data = await callBrowserApi('/action', 'POST', { action: 'downloads', limit: args.limit }) as any;
        if (data?.error) return err(data.error);
        const records = Array.isArray(data?.records) ? data.records : [];
        if (!records.length) return ok(`最近没有下载记录。下载目录: ${data?.dir || '(未知)'}`);
        const lines = records.map((r: any) =>
          `- ${r.filename}（${r.state}${r.bytes ? `，${Math.round(Number(r.bytes) / 1024)}KB` : ''}）\n  ${r.savedPath}`);
        return ok(`最近下载（目录: ${data?.dir || '(未知)'}）：\n${lines.join('\n')}`);
      }
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
  // 读**当前布局快照**（元素可见性随滚动/弹层/加载变化）
  readsExternalState = true;
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
  description = 'Execute a JavaScript snippet in the current page context and return its JSON-serializable result. 代码模式：把多步固定操作收敛为一段脚本一次执行（如"滚动到底触发懒加载→收集全部列表项→返回 JSON"），替代多轮 click/scroll/get_page_content。脚本在页面主世界运行，可用 document / window / fetch；返回值必须可 JSON 序列化，用 return 返回（例：return JSON.stringify([...]) 或 return {...}）。★ 直接写 `const x=...; return x;` 即可（工具会自动包一层函数）；也可自己写成 (() => {...})() 或 (async () => {...})()。超时 30s，脚本长度上限 64000 字符。可传 tabId 在指定标签页执行。\n★ 同页连续执行 8 次会附 warning、12 次直接拒绝（code=script_loop）：脚本是用来批量提取/循环的，不是用来试探"哪个元素能点"；找元素请用 browser_get_page_content 拿编号后 browser_click。\n★ 适用边界（重要）：脚本只用于【批量提取数据 / 循环检查 / 一次脚本内自洽的多步流程】。查找并点击某个按钮、往输入框填文字这类单点交互请用 browser_click / browser_type / browser_fill_form —— 它们有元素重定位、防循环计数、回读核验等保护，脚本是裸奔的（选择器失效直接抛错、无任何防护）。页面找不到目标时先用 browser_get_page_content 重新定位，不要写脚本穷举选择器。';
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
export class BrowserRunRecipeTool implements BuiltInTool {
  name = 'browser_run_recipe';
  // 读+写页面：结果取决于外部站点状态；且内部会做多次动作
  readsExternalState = true;
  description = 'Run a deterministic site recipe in ONE call. 用确定性配方完成整站流程：模型只传参数，'
    + '上传/等待转码/填表/回读核验/合集（系列任务首集必选）/可选点发布全部由代码按固定步骤执行，避免在页面上反复试错。'
    + `可用配方：${listRecipes().join('、')}。`
    + 'douyin-publish-video 参数：{ videoPath, title, description, collectionName?, submit? }；'
    + 'douyin-set-cover 参数：{ coverPath }（视频已上传后、点发布前调用）；'
    + 'douyin-post-comment 参数：{ videoTitle, comment }（发布后发引导评论）；'
    + 'douyin-insert-topics 参数：{ editUrl, topics }（作品编辑页把纯文本话题升级成真话题 chip；'
    + 'topics 为 JSON 数组或空格分隔；幂等、失败即停、不保存 —— 禁止自己写脚本反复清空描述框）。'
    + 'form-fill 参数：{ fields, submit?, submitText? } —— 任意站点的表单都优先用它：'
    + 'fields 为 JSON 数组 [{selector, selectors?, value, label?}]（selector 用 get_page_content 编号元素自带的 selector，selectors 是备用选择器），'
    + '代码会做备用选择器回退与回读核验，一次调用完成填写；submit=true 时还要传 submitText（按钮文本）。'
    + '★ 发布/封面/评论这三个环节一律先试配方，不要自己逐页点：配方失败返回的现场比手工试错快得多。'
    + '★ submit 默认 false，只做前置步骤；仅当用户明确要求发布时传 submit:true。'
    + '★ 文件配方（2026-10-28 任务 2）：除内置配方外，本工具还会加载 <工作目录>/recipes/*.json 里的文件配方'
    + '（id=文件名；kind 白名单 navigate/upload/fill/fillFromJson/clickText/waitText，≤30 步；内置优先，同名文件被忽略）。'
    + '★ 沉淀闭环：任务中验证出的多步固定流程（某站签到路径、后台三连点等）建议用 file_write 写成配方 JSON 落盘，'
    + '下次同站任务直接 browser_run_recipe 一步执行；JSON 字段与内置配方同构（id/description/params/steps/hosts）。'
    + '★ 被验证码/滑块拦住时返回 blockedByVerification + resumeStep：先 ask_user 请用户完成验证，'
    + '用户确认后带同一个 resumeStep 再调用本工具续跑（不要重跑全流程、不要重新上传）。'
    + '★ 配方失败会返回失败步骤与页面现场，**不要重复运行同一配方**，先按原因处理或向用户报告。';
  inputSchema = {
    type: 'object',
    properties: {
      recipe: { type: 'string', enum: listRecipes(), description: 'Recipe id.' },
      params: { type: 'object', description: 'Recipe parameters (see recipe description).' },
      resumeStep: {
        type: 'number',
        description: '可选：用户完成安全验证后续跑的步骤下标（0 基）。只能用上一次 blockedByVerification 返回的 resumeStep；普通执行不要传。',
      },
    },
    required: ['recipe'],
  };
  async execute(args: Record<string, unknown>, ctx?: import('../../types').ToolContext): Promise<McpCallResult> {
    return BrowserRunRecipeTool.run(args, {
      navigate: (url: string) => callBrowserApi('/navigate', 'POST', { url }),
      action: (action: string, actionArgs: Record<string, unknown>) =>
        callBrowserApi('/action', 'POST', { action, ...actionArgs }),
    }, { workspaceDir: ctx?.workspaceDir });
  }

  /**
   * 执行体（动作通道可注入）。
   *
   * ★ 为什么必须可注入（2026-10-26 实报「发布页表单反复填」）：
   *   桌面直连档下 `browser_*` 工具全部由桥转发给主进程执行，而 `run_recipe` **不是**
   *   桌面 action（它内部要再发一整套动作）⇒ 桥直接判「不支持的 action」，
   *   配方在桌面上等于不存在 —— 而配方正是为"填→读→再填"造的确定性解药（见 recipes.ts 头注）。
   *   ⇒ 执行器（llm-task-manager）在直连档把「每个子动作走桥」的 api 注进来，
   *     编排留在服务端、动作仍在主进程，单一执行面不变。
   */
  static async run(args: Record<string, unknown>, api: RecipeApi, ctx?: { workspaceDir?: string }): Promise<McpCallResult> {
    try {
      const recipeId = String(args.recipe || '').trim();
      // ★ 任务 2（2026-10-28）：内置查不到 → 扫 <工作目录>/recipes/*.json 合并文件配方。
      //   内置优先由 loadFileRecipes 保证（同名文件配方被屏蔽——内置带验证码续跑等安全语义）。
      let recipe = getRecipe(recipeId);
      let fileRecipeErrors: string[] = [];
      if (!recipe && ctx?.workspaceDir) {
        const loaded = await loadFileRecipes(ctx.workspaceDir);
        fileRecipeErrors = loaded.errors;
        recipe = loaded.recipes.get(recipeId);
      }
      if (!recipe) return err(`未知配方「${recipeId}」。可用：${listRecipes().join('、')}${fileRecipeErrors.length ? `\n（注：${fileRecipeErrors.length} 个文件配方加载失败：${fileRecipeErrors.slice(0, 3).join('；')}）` : ''}`);
      const params = (args.params && typeof args.params === 'object')
        ? args.params as Record<string, unknown>
        : {};
      const missing = Object.entries(recipe.params)
        .filter(([key, def]) => def.required && (params[key] == null || String(params[key]).trim() === ''))
        .map(([key]) => key);
      if (missing.length) return err(`缺少必填参数：${missing.join('、')}`);

      const resumeStep = Number.isFinite(Number(args.resumeStep)) ? Number(args.resumeStep) : undefined;
      if (resumeStep !== undefined && (resumeStep < 0 || resumeStep >= recipe.steps.length)) {
        return err(`resumeStep 越界：${resumeStep}（配方共 ${recipe.steps.length} 步，下标 0 基）。` +
          '应使用上一次 blockedByVerification 返回的 resumeStep；普通执行不要传该参数。');
      }

      const result = await runRecipe(recipe, params, {
        navigate: (url: string) => callBrowserApi('/navigate', 'POST', { url }),
        action: (action: string, actionArgs: Record<string, unknown>) =>
          callBrowserApi('/action', 'POST', { action, ...actionArgs }),
      }, { resumeStep });
      const lines = result.steps
        .map((s, i) => `${i + 1}. ${s.ok ? '✅' : '⛔'} ${s.step}: ${s.detail}`)
        .join('\n');
      if (result.blockedByVerification) {
        return err(
          `配方 ${recipe.id} 被安全验证拦住：${result.verificationText}\n${lines}\n`
          + `页面现场：${result.title || '(无标题)'} ${result.url || ''}\n\n`
          + '下一步（**不要重跑全流程，不要重新上传**）：\n'
          + `1) 立即调用 ask_user：请用户在浏览器面板完成滑块/验证码，完成后回复"继续"；\n`
          + `2) 用户确认后，再次调用 browser_run_recipe：params 保持不变，并加 resumeStep: ${result.resumeStep}；\n`
          + `3) 续跑会从第 ${(result.resumeStep ?? 0) + 1} 步继续`
          + `${result.submitted ? '（发布已点过，只等验证结果，不会重复点）' : '（不会重新上传/填表）'}。`,
        );
      }
      if (!result.ok) {
        return err(
          `配方 ${recipe.id} 失败：${result.error}\n${lines}\n`
          + `页面现场：${result.title || '(无标题)'} ${result.url || ''}\n${result.pageSnippet || ''}\n`
          + '★ 不要重复运行同一配方。先按失败步骤处理（补登录 / 等上传完成 / 换参数），仍不行就向用户报告现场。',
        );
      }
      const tail = result.submitted
        ? (result.verified
            ? '发布已点击，页面出现成功判据。'
            : '发布已点击，但未在页面看到成功判据 —— 请到「内容管理」核实，**不要重复点发布**。')
        : (result.readyToSubmit
            ? '前置步骤已完成，未点发布（submit=false）。用户确认后请直接 browser_click 页面上的「发布」按钮；**不要重新运行配方**（会重新上传视频并重置表单）。'
            : '配方执行完成。');
      return ok(`配方 ${recipe.id} 执行完成\n${lines}\n\n${tail}\n最终页面：${result.title || ''} ${result.url || ''}`);
    } catch (e: any) {
      return err(e?.message || '配方执行失败');
    }
  }
}

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
  // 任务 1（2026-10-28）网络 JSON 直采
  BrowserGetApiDataTool,
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
  // P1 站点配方（2026-10-19）
  BrowserRunRecipeTool,
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
  // 任务 1（2026-10-28）网络 JSON 直采
  'browser_get_api_data',
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
  // P1 站点配方（2026-10-19）
  'browser_run_recipe',
];
