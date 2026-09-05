export { FileReadTool } from './file-read';
export { FileWriteTool } from './file-write';
export { FileListTool } from './file-list';
export { CodeSearchTool } from './code-search';
export { CodeOutlineTool } from './code-outline';
export { JsExecTool } from './js-exec';
export { PortScanTool } from './port-scan';
export { HttpRequestTool } from './http-request';
export { TcpSendTool } from './tcp-send';
export { UdpSendTool } from './udp-send';
export { DnsLookupTool } from './dns-lookup';
export { WebSearchTool, FetchSearchBackend, DuckDuckGoSearchBackend, ServerSearchBackend } from './web-search';
export type { SearchBackend, SearchResult, FetchSearchConfig, SearchSummarizer } from './web-search';
export { WebFetchTool, extractMainContent, fetchPage } from './web-fetch';
export type { ExtractedPage } from './web-fetch';
export { CmdExecTool } from './cmd-exec';
export { PythonExecTool } from './python-exec';
export { BrowserToolClasses, BROWSER_TOOL_NAMES } from './browser';
export { CallAgentTool } from './call-agent';
export { ListSubAgentsTool } from './list-sub-agents';
export { AskUserTool } from './ask-user';
export { ConfirmUserTool } from './confirm-user';
export { TaskPlanTool, TaskStepTool } from './task-plan';
export { ConfigureModelPlatformTool } from './configure-model-platform';
export { ImageAnalyzeTool } from './image-analyze';
export { CompareProductsTool } from './compare-products';

import type { SearchBackend } from './web-search';
import { FileReadTool } from './file-read';
import { FileWriteTool } from './file-write';
import { FileListTool } from './file-list';
import { CodeSearchTool } from './code-search';
import { CodeOutlineTool } from './code-outline';
import { JsExecTool } from './js-exec';
import { PortScanTool } from './port-scan';
import { HttpRequestTool } from './http-request';
import { TcpSendTool } from './tcp-send';
import { UdpSendTool } from './udp-send';
import { DnsLookupTool } from './dns-lookup';
import { WebSearchTool } from './web-search';
import { WebFetchTool } from './web-fetch';
import { CmdExecTool } from './cmd-exec';
import { PythonExecTool } from './python-exec';
import { BrowserToolClasses } from './browser';
import { CallAgentTool } from './call-agent';
import { ListSubAgentsTool } from './list-sub-agents';
import { AskUserTool } from './ask-user';
import { ConfirmUserTool } from './confirm-user';
import { TaskPlanTool, TaskStepTool } from './task-plan';
import { ConfigureModelPlatformTool } from './configure-model-platform';
import { ImageAnalyzeTool } from './image-analyze';
import { CompareProductsTool } from './compare-products';
import type { ToolRegistry } from '../registry';

/** 注册所有内置工具到 registry，可选配置 web_search 后端 */
export function registerBuiltInTools(registry: ToolRegistry, searchBackend?: SearchBackend): void {
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  // 目录列表 + 源码查看/搜索 + JS 沙箱执行（代码工具族）
  registry.register(new FileListTool());
  registry.register(new CodeSearchTool());
  registry.register(new CodeOutlineTool());
  registry.register(new JsExecTool());
  // 网络安全工具族（端口扫描/HTTP/TCP/UDP/DNS —— 仅限授权目标使用）
  registry.register(new PortScanTool());
  registry.register(new HttpRequestTool());
  registry.register(new TcpSendTool());
  registry.register(new UdpSendTool());
  registry.register(new DnsLookupTool());
  const searchTool = new WebSearchTool();
  if (searchBackend) {
    searchTool.setBackend(searchBackend);
  }
  registry.register(searchTool);
  // 网页正文抓取（与 web_search 串成「搜索 → 详情」）
  registry.register(new WebFetchTool());
  registry.register(new CmdExecTool());
  registry.register(new PythonExecTool());
  // 浏览器自动化工具集（E3）
  for (const ToolClass of BrowserToolClasses) {
    registry.register(new ToolClass());
  }
  // 子智能体委派工具（E7）
  registry.register(new CallAgentTool());
  // 子智能体列表查询工具（E7b）—— 让 LLM 动态发现可用子智能体及其 ID
  registry.register(new ListSubAgentsTool());
  // 交互式工具（E12）：反问弹窗 + 任务规划进度（实际执行由 UI 层 dispatchToolCall 拦截）
  registry.register(new AskUserTool());
  registry.register(new ConfirmUserTool());
  registry.register(new TaskPlanTool());
  registry.register(new TaskStepTool());
  registry.register(new ConfigureModelPlatformTool());
  registry.register(new ImageAnalyzeTool());
  // 跨平台比价引擎（C10）—— pageAgent 多平台购物对比汇总
  registry.register(new CompareProductsTool());
}

/** 注册管理工具函数到 registry */
export async function registerManagementTools(registry: ToolRegistry, getDb: () => any): Promise<void> {
  const mod = await import('./management');
  mod.registerManagementTools(registry, getDb);
}
