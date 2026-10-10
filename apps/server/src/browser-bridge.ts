// 浏览器桥客户端 —— 服务端侧（「执行面直连化」P1-1，2026-10-10）
//
// ★ 对面是 `apps/desktop/browser-bridge.cjs`（主进程里的 loopback HTTP 端点）。
//   URL / token 由主进程 `spawn` 后端时经 env 注入（`YZ_BROWSER_BRIDGE_URL` / `YZ_BROWSER_BRIDGE_TOKEN`），
//   **不落盘、不进渲染层**（安全边界见桥文件头部注释）。
//
// ★ 灰度档位 `YZ_BROWSER_BRIDGE`：off | shadow | on | strict
//   · off     —— 不用桥（`available()` 恒 false）→ 服务端走原有 SSE 委托路径（行为逐字不变）
//   · shadow  —— **只读 action** 走桥，写 action 仍走 SSE（不改用户可见行为，先验连通性）
//   · on      —— 读写全走桥；桥失败自动降级回 SSE 一次（打点）
//   · strict  —— 全走桥；SSE 委托视为错误（用于证明"零依赖渲染层"）
//
// ★ 为什么档位判定放在**服务端**：桥"在不在"（主进程起没起端点）与"用不用桥"（灰度）是两个正交问题。
//   切档只需重启后端（dev 下 tsx watch 自动），**不需要重启 Electron 主进程**。

import { createLogger } from './services/logger.js';

const logger = createLogger('browser-bridge');

/** 桥文件里定义的路径与 header 名 —— **必须逐字一致**（守门测试会比对两处） */
export const BRIDGE_PATH = '/v1/browser/action';
export const TOKEN_HEADER = 'x-yz-bridge-token';

/** 档位（非法值一律回落 off —— 写错档位不能变成"意外开启直连"这种更难查的故障） */
export type BridgeMode = 'off' | 'shadow' | 'on' | 'strict';
export function bridgeMode(): BridgeMode {
  const v = String(process.env.YZ_BROWSER_BRIDGE || 'off').trim().toLowerCase();
  return (['off', 'shadow', 'on', 'strict'].includes(v) ? v : 'off') as BridgeMode;
}

/**
 * 只读 action 白名单（shadow 档只放这些走桥）。
 * ★ 划法刻意选的：只读**不改页面状态**，即使桥有 bug 也不会把用户的页面搞乱 ——
 *   与 `routes/browser.ts` 的"读写分治"（写路由才串行）同一思路。
 * ★ 与 `DESKTOP_BROWSER_ACTIONS` 的关系：这里是它的**只读子集**。
 *   新增只读 action 时两处都要看（但**判定口径只在本文件**，防漂移）。
 */
export const READONLY_BRIDGE_ACTIONS = new Set([
  'get_page_info', 'get_page_content', 'get_dom', 'get_visible_text', 'get_text',
  'screenshot', 'get_tabs', 'get_url', 'is_visible', 'get_network_log', 'wait_for_request',
  'wait', 'wait_for', 'extract_list',
]);

/** 桥是否**配置可用**（主进程起了端点 + token 注入到位 + 档位不是 off） */
export function browserBridgeAvailable(): boolean {
  if (bridgeMode() === 'off') return false;
  return !!(process.env.YZ_BROWSER_BRIDGE_URL && process.env.YZ_BROWSER_BRIDGE_TOKEN);
}

/** 本次该由谁执行这个 browser action（**唯一判定口径**，前端不得自行推断 —— 防双执行） */
export function decideBrowserExecution(action: string): 'bridge' | 'frontend' {
  if (!browserBridgeAvailable()) return 'frontend';
  const mode = bridgeMode();
  if (mode === 'shadow') return READONLY_BRIDGE_ACTIONS.has(action) ? 'bridge' : 'frontend';
  return 'bridge'; // on / strict
}

/** 工具名（browser_xxx）→ 桥 action 名（xxx）。与渲染层 actionMap 的推导规则一致。 */
export function toolNameToAction(toolName: string): string {
  return toolName.startsWith('browser_') ? toolName.slice('browser_'.length) : toolName;
}

/** 调用桥。失败抛错，由调用方决定是否降级。 */
export async function callBrowserBridge(
  convId: string,
  toolName: string,
  args: unknown,
  timeoutMs: number,
): Promise<string> {
  const url = process.env.YZ_BROWSER_BRIDGE_URL as string;
  const token = process.env.YZ_BROWSER_BRIDGE_TOKEN as string;
  const action = toolNameToAction(toolName);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs > 0 ? timeoutMs : 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: token },
      body: JSON.stringify({ convId, action, args: args || {} }),
      signal: ac.signal,
    });
    // 404 = 鉴权失败/路径不对（桥刻意不区分，见桥文件）→ 明确报错而非静默
    if (res.status === 404) {
      throw new Error('浏览器桥鉴权失败（端点重解析后 token 可能已变，桥未就绪时会自动降级）');
    }
    if (res.status === 413) throw new Error('浏览器桥请求体过大');
    if (!res.ok) throw new Error(`浏览器桥返回 HTTP ${res.status}`);
    const json: any = await res.json().catch(() => ({}));
    if (json && json.error) throw new Error(String(json.error));
    // ★ 桥返回与 `browserView:action` 逐字同构 ⇒ 走**同一份**结果格式化（见 llm-task-manager 的 bridge 分支）
    return formatBridgeResult(action, json);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`浏览器桥调用超时（${Math.round(timeoutMs / 1000)}s）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把桥返回格式化成模型可读文本。
 *
 * ★★★ 这里是**唯一**的格式化实现（两侧共用）：SSE 委托路径的格式化在渲染层
 *   `chat.ts:1656-1695`，桥路径在服务端 —— 若各自写一份，必然漂移（"同一语义只有一处实现"）。
 *   ⇒ 渲染层那份**保留**（web 端/桥不可用时仍用），但**关键分支（get_page_content / screenshot）
 *   的口径以本函数为准**，两处若有差异以这里为准并在渲染层注释标注。
 */
export function formatBridgeResult(action: string, r: any): string {
  if (!r || typeof r !== 'object') return String(r ?? '');
  if (action === 'get_page_info') {
    const ic = (r.interactive || []).length;
    const lines = (r.interactive || []).slice(0, 20).map((e: any) => `[${e.index}] ${e.tag}${e.text ? ': ' + e.text : ''}`).join('\n');
    return `页面: ${r.title || r.url}\n可交互元素: ${ic}${ic > 0 ? '\n' + lines : ''}`;
  }
  if (action === 'get_visible_text' || action === 'get_text') return r.text || '';
  if (action === 'screenshot') {
    // ★ 与渲染层同口径：main.cjs 截图时已落盘存档，把路径带回 —— 服务端据此复制进会话产物目录
    //   并登记 conversation_file（关键节点归档留证）。正则容错见 archiveDelegatedScreenshot。
    return r.file ? `截图已捕获（已存档: ${r.file}）` : '截图已捕获';
  }
  if (action === 'get_dom') {
    return `DOM 节点数: ${r.nodeCount || 0}（桌面端不返回 DOM 明细。请改用 browser_get_page_content 获取页面可见正文与带编号的可交互元素列表，不要用不同 depth/maxNodes 参数重试本工具）`;
  }
  if (action === 'get_page_content') {
    const elems = (r.interactive || []).map((e: any) => {
      let s = `[${e.index}] ${e.tag}`;
      if (e.type) s += `[type=${e.type}]`;
      if (e.axRole && e.axRole !== e.tag) s += ` [ax:${e.axRole}]`;
      if (e.ariaLabel) s += ` [aria:${e.ariaLabel}]`;
      if (e.text) s += ` "${String(e.text).slice(0, 40)}"`;
      if (e.placeholder) s += ` [ph:${e.placeholder}]`;
      if (e.href) s += ` →${String(e.href).slice(0, 80)}`;
      return s;
    }).join('\n');
    return `URL: ${r.url}\nTitle: ${r.title}\n\n【页面可见文本】\n${r.text || '(空)'}\n\n【可交互元素】(${r.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数)\n${elems}`;
  }
  if (action === 'upload') {
    return r.uploaded
      ? `已注入本地文件（${r.via || 'cdp'}）: ${r.filePath}${r.inputCount > 1 ? `（页面有 ${r.inputCount} 个 file input，用第一个）` : ''}`
      : (r.error || '文件注入失败');
  }
  if (action === 'run_script') {
    let rt = '';
    try { rt = JSON.stringify(r.result); } catch { rt = String(r.result); }
    if (rt.length > 8000) rt = rt.slice(0, 8000) + `…(截断，原长 ${rt.length})`;
    return `Executed in page. URL: ${r.url || ''}\nResult: ${rt || '(undefined)'}`;
  }
  if (r.success) return `${action} 执行成功`;
  return JSON.stringify(r).slice(0, 500);
}