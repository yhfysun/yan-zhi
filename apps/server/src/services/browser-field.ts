// 浏览器现场上下文（办公模式「浏览器现场」注入）—— 服务端组装的**唯一定义处**。
//
// ★★★ 设计与运维现场（ops-context.ts，2026-10-21）同型：
//   · 现场**只进系统提示词，不进用户回合** —— 用户消息保持原话入库；系统提示词每轮
//     重新组装，面板开合、tab 增删/导航的变马上就能反映，历史不被污染；
//   · 数据走 browser-bridge 直连桌面主进程（不依赖渲染层在线，与执行面直连化同路）；
//   · 任何失败（桥不可用 / 超时 / 业务错）→ 返回 ''，**绝不阻断任务** —— 与记忆 /
//     经验 / 运维现场注入同一容错风格；模型仍可用 browser_get_tabs 自查最新状态。
//
// 注入范围（模式门控在调用方 llm-task-manager，用 resolveConversationMode 判 office ——
// 本模块刻意不 import llm-task-manager，避免环）：
//   · 主循环 createTask：任务开始时的快照；
//   · 子智能体 runSubAgentImpl 合流点：每次 spawn 现拉（pageAgent 等浏览器型子体是主要消费者）。
//
// 桌面端字段来源（main.cjs 的 get_tabs）：
//   · tabs[]：tabId / url / title / scope / agentOpened / active / suspended / loading；
//   · panelVisible：预览面板可见性（主进程 webviewPanelVisible：resize 非零尺寸=true / hide=false）。
import { browserBridgeAvailable, callBrowserBridgeRaw, formatBridgeResult } from '../browser-bridge.js';

/** 桥调用超时：现场是"锦上添花"的上下文，不值得为它拖住任务创建 */
const BRIDGE_TIMEOUT_MS = 2000;

/**
 * 组装「浏览器现场」提示词段。返回 '' = 不注入（桥不可用 / 调用失败 / 业务错）。
 *
 * ★ tab 清单格式**复用** formatBridgeResult('get_tabs') —— 与 browser_get_tabs 工具结果
 *   同一份实现（同一语义只有一处实现；为提示词另写一份清单格式必然漂移）。
 * ★ 面板收起时的指引与 main.cjs 隐藏态告警（截图分支）同一口径：收起 ≠ 关闭，
 *   页面仍在但可能不渲染 —— 模型该做的是引导用户展开，而不是反复重试读取。
 */
export async function loadBrowserFieldContext(conversationId: string): Promise<string> {
  if (!browserBridgeAvailable()) return '';
  let json: any;
  try {
    json = await callBrowserBridgeRaw(conversationId, 'browser_get_tabs', {}, BRIDGE_TIMEOUT_MS);
  } catch {
    return ''; // 桥不可达/超时/鉴权失败：不注入，也不降级走 SSE —— 现场注入不值得引入渲染层依赖
  }
  if (!json || typeof json !== 'object' || json.error) return '';
  // 字段缺失（旧版桌面端未带）按可见兜底：宁可漏报"收起"，不误报（误报会诱导模型反复请用户展开）
  const panelVisible = json.panelVisible !== false;
  const panelLine = panelVisible
    ? '预览面板：展开（页面用户当前可见，可直接读取/操作）'
    : '预览面板：收起（页面处于隐藏态：部分站点不渲染、截图可能失败 —— 需要看页面时先请用户展开预览面板，纯取数可改用 browser_run_script 在页内 fetch）';
  return [
    '---\n## 浏览器现场（桌面预览面板，组装本提示词时的快照）',
    panelLine,
    formatBridgeResult('get_tabs', json),
    '说明：以上为快照，随操作变化；需要最新列表用 browser_get_tabs；对指定标签页读取/操作可直接传 tabId，不必先切换标签页。',
  ].join('\n');
}
