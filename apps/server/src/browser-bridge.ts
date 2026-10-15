// 浏览器桥客户端 —— 服务端侧（「执行面直连化」P1-1，2026-10-10）
//
// ★ 对面是 `apps/desktop/browser-bridge.cjs`（主进程里的 loopback HTTP 端点）。
//   URL / token 由主进程 `spawn` 后端时经 env 注入（`YZ_BROWSER_BRIDGE_URL` / `YZ_BROWSER_BRIDGE_TOKEN`），
//   **不落盘、不进渲染层**（安全边界见桥文件头部注释）。
//
// ★ 灰度档位 `YZ_BROWSER_BRIDGE`：off | shadow | on | strict
//   · off     —— 不用桥（`available()` 恒 false）→ 服务端走原有 SSE 委托路径（行为逐字不变）
//   · shadow  —— **只读 action** 走桥，写 action 仍走 SSE（不改用户可见行为，先验连通性）
//   · on      —— 读写全走桥；桥失败自动降级回 SSE 一次（打点）  ← **默认档（2026-10-10 起）**
//   · strict  —— 全走桥；SSE 委托视为错误（用于证明"零依赖渲染层"）
//
// ★★★ 为什么默认从 off 改为 on（2026-10-10）：off 下浏览器工具全走 SSE 委托前端，
//   而这条链路要求「渲染层在线且有订阅者」—— 前端一卡就回执超时（快档 150s / 慢档 8min，
//   最坏单次卡 23s）→ 模型换招重试 → 撞 tool-loop-guard → 任务空转。
//   实测证据：server.log 的 6 次「循环拦截」+ llm_task 表里 15 分钟后被 abort 的任务。
//   `on` 直连主进程**去掉对前端的依赖**，且**保留了失败降级**（下端 catch 里降级回 SSE），
//   因此即使桥有异常也只是退化为原行为，不会比 off 更糟。
//
//   ★ 为什么不直接 strict：strict 桥失败**不降级**，会把"桥小问题"放大成"工具全挂"。
//     它只用于验证"零依赖渲染层"这个结论，不适合做默认档。
//
// ★ 为什么档位判定放在**服务端**：桥"在不在"（主进程起没起端点）与"用不用桥"（灰度）是两个正交问题。
//   切档只需重启后端（dev 下 tsx watch 自动），**不需要重启 Electron 主进程**。

import { createLogger } from './services/logger.js';

const logger = createLogger('browser-bridge');

/** 桥文件里定义的路径与 header 名 —— **必须逐字一致**（守门测试会比对两处） */
export const BRIDGE_PATH = '/v1/browser/action';
export const TOKEN_HEADER = 'x-yz-bridge-token';

/** 默认档位（2026-10-10 从 off 提为 on —— 见上方长注释） */
export const DEFAULT_BRIDGE_MODE: BridgeMode = 'on';

/** 档位（非法值一律回落默认 —— 写错档位不能变成"意外改变执行面"这种更难查的故障） */
export type BridgeMode = 'off' | 'shadow' | 'on' | 'strict';
export function bridgeMode(): BridgeMode {
  const v = String(process.env.YZ_BROWSER_BRIDGE || DEFAULT_BRIDGE_MODE).trim().toLowerCase();
  return (['off', 'shadow', 'on', 'strict'].includes(v) ? v : DEFAULT_BRIDGE_MODE) as BridgeMode;
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

/** 工具名（browser_xxx）→ 桥 action 名（xxx）的**例外表**（默认只去掉 browser_ 前缀）。
 *
 *  ★ 2026-10-15（「导航跑偏」复审 MEDIUM）：`browser_press_key` 的桥 action 是 `press`
 *    —— 桌面端能力清单（DESKTOP_BROWSER_ACTIONS）与主进程 `case 'press'` 用的都是 `press`；
 *    不登记这条映射，桥会判「不支持的 action」，该工具在直连档下形同不可用。
 *  ★ 判据单一：本表是**唯一**例外源；新增例外必须在此登记（并同步桌面端白名单）。
 */
const TOOL_ACTION_ALIASES: Record<string, string> = {
  press_key: 'press',
};

/** 工具名（browser_xxx）→ 桥 action 名（xxx）。与渲染层 actionMap 的推导规则一致。 */
export function toolNameToAction(toolName: string): string {
  const raw = toolName.startsWith('browser_') ? toolName.slice('browser_'.length) : toolName;
  return TOOL_ACTION_ALIASES[raw] || raw;
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
      const err = new Error('浏览器桥鉴权失败（端点重解析后 token 可能已变）');
      (err as any).bridgeTransport = true;
      throw err;
    }
    if (res.status === 413) {
      const err = new Error('浏览器桥请求体过大');
      (err as any).bridgeTransport = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`浏览器桥返回 HTTP ${res.status}`);
      (err as any).bridgeTransport = true;
      throw err;
    }
    const json: any = await res.json().catch(() => ({}));
    // ★★★ HTTP 200 + `{error}` 是**动作执行失败**（业务错误），不是桥故障 —— 见 isBridgeTransportError 注释。
    //   直接作为工具结果返回给模型（保留原始文案，模型据此换招），**不抛异常、不触发降级**。
    //   ★★ 2026-10-12（诊断报告 P0-1）：超时/仍在加载（`timedOut`）**不是失败** ——
    //     绝不能加"失败"前缀（"失败"二字会诱导模型重试，正是"pageAgent 一跑就卡"的成因之一）。
    //     直接保留 main.cjs 原文案（其中已写明"不代表失败、不要重复调用同一动作"）。
    if (json && json.error) {
      // ★★★ 2026-10-15：非超时的失败必须**带上 hint**。此前只取 `json.error`，把 main.cjs
      //   精心写的可自纠指引（`hint`：点击"元素不可见已按 DOM 点击"、输入"受控组件拦截、
      //   建议截图核验"、脚本"选择器失效先重新读页"…）**整条丢在桥这一层** —— 模型只看得到
      //   "失败了"，看不到"下一步该怎么试"，于是换着选择器盲试（"步骤不准、重复操作多"）。
      //   ★ 超时路径（`timedOut`）**不追加**：那一条已写明"不代表失败、不要重复调用同一动作"，
      //     且**绝不能**出现"失败"二字（会诱导重试，见上一条注释）。
      if (json.timedOut) return String(json.error);
      const hint = json.hint ? `\n${String(json.hint)}` : '';
      return `浏览器操作失败: ${String(json.error)}${hint}`;
    }
    // ★ 桥返回与 `browserView:action` 逐字同构 ⇒ 走**同一份**结果格式化（见 llm-task-manager 的 bridge 分支）
    return formatBridgeResult(action, json);
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err = new Error(`浏览器桥调用超时（${Math.round(timeoutMs / 1000)}s）`);
      (err as any).bridgeTransport = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 桥调用失败是否属于**传输层**失败（端点不可达 / 超时 / 鉴权）。
 *
 * ★★★ 为什么必须区分（2026-10-10 根因修复）：
 *   桥把「动作执行失败」也编码成 HTTP **200** + `{error: "..."}`（见 `browser-bridge.cjs`）——
 *   这是**正常业务返回**，与"桥连不上"是两回事。
 *   而调用方此前只看 `catch` 就降级回 SSE ⇒ **任何**业务失败（如"页面未就绪"）都会被
 *   当成桥故障去走 SSE —— 而 `on` 档下渲染层已不执行浏览器工具，SSE 必失败
 *   ⇒ 8s 的失败被拖成 23s 的失败，且最终文案指向"前端不可达"（指向错误方向）。
 *   ⇒ 判据：只有传输层异常才返回 true（值得降级）；业务错误返回 false（直接回给模型）。
 */
export function isBridgeTransportError(e: any): boolean {
  return !!(e && (e as any).bridgeTransport);
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
  if (action === 'navigate' || action === 'new_tab') {
    // ★★★ 2026-10-15「导航跑偏」P1-④：navigate 此前**没有专属分支** → 落最后的
    //   `JSON.stringify(r).slice(0,500)`，长 note（隐藏态引导等）会被截断吞掉。
    //   显式渲染 url/title/loading/visibilityState/note，让每一条都给到模型。
    const lines: string[] = [];
    if (action === 'new_tab' && r.tabId) lines.push(`已在新标签页打开（tabId=${r.tabId}）。后续读取该页用读取类工具的 tabId=${r.tabId}。`);
    if (r.url) lines.push(`URL: ${r.url}`);
    if (r.title) lines.push(`Title: ${r.title}`);
    if (r.loading) lines.push('状态: 仍在加载（不是失败——用 browser_wait_for / browser_get_page_content 等待，不要换 URL 重试）。');
    if (r.visibilityState) lines.push(`页面可见性: ${r.visibilityState}`);
    // ★ 2026-10-15（复审 LOW）：`warning` 是"连续 N 次操作页面无任何变化"的纠偏信号
    //   （main.cjs 通用赋值）—— 此前 navigate 落 JSON 兜底时它还可能在，显式分支必须带上，
    //   否则最该看到它的动作（navigate）反而收不到。
    if (r.warning) lines.push(`⚠ ${r.warning}`);
    if (r.note) lines.push(r.note);
    return lines.length ? lines.join('\n') : JSON.stringify(r).slice(0, 500);
  }
  if (action === 'get_tabs') {
    // ★ 2026-10-15「导航跑偏」P1-⑤：明确标注"哪些页可以关" —— 模型才会用 close_tab 清场
    //   （实测两天 close_tab 调用 = 0，卡死页一直留着污染后续任务）。
    const tabs = Array.isArray(r.tabs) ? r.tabs : [];
    const lines = tabs.map((t: any) =>
      `- tabId=${t.tabId}${t.active ? ' [当前]' : ''} ${t.agentOpened ? '[可关]' : '[用户页·勿关]'} ${t.loading ? '[加载中]' : ''} ${t.title || t.url || '空白'}` +
      `${t.url && t.title ? ` (${String(t.url).slice(0, 100)})` : ''}`);
    const closable = tabs.filter((t: any) => t.agentOpened).map((t: any) => String(t.tabId));
    const stuck = tabs.filter((t: any) => t.loading && t.agentOpened).map((t: any) => t.tabId);
    const hint = closable.length
      // ★ 2026-10-15（复审 HIGH）：示例必须是**合法 JSON**且 id 带引号 —— 此前 `[tab-1, tab-2]`
      //   既不是合法 JSON，照着抄还会因 id 类型不对而落到"关当前活动页"（执行侧已修，
      //   但示例本身也得对：模型会逐字照抄）。
      ? `\n\n可用 browser_close_tab({ "tabIds": [${closable.map((id: string) => JSON.stringify(id)).join(', ')}] }) 一次关掉这些 agent 打开的页（任务收尾或页面卡死时清理）。`
      : '';
    const stuckHint = stuck.length
      ? `\n⚠ tabId=${stuck.join(', ')} 处于**加载中**：若长时间不变即为卡死页，会拖慢/污染本会话后续导航 —— 不需要它时用 browser_close_tab 关掉（不要靠反复导航去"唤醒"它）。`
      : '';
    return `浏览页 ${tabs.length} 个：\n${lines.join('\n') || '(无)'}${hint}${stuckHint}`;
  }
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
    if (!r.uploaded) return r.error || '文件注入失败';
    const base = `已注入本地文件（${r.via || 'cdp'}）: ${r.filePath}${r.inputCount > 1 ? `（页面有 ${r.inputCount} 个 file input，用第一个）` : ''}`;
    // ★ 2026-10-12（诊断报告 P0-3）：带上"页面是否回读到该文件"的核验结论。
    //   此前只报"已注入"，模型拿不到成功证据 ⇒ 反复重传（用户实报"上传重试多"）。
    if (r.note) return `${base}\n${r.verified === true ? '✔ ' : 'ℹ '}${r.note}`;
    return base;
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