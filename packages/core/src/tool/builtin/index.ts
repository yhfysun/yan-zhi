export { FileReadTool } from './file-read';
export { FileToMarkdownTool } from './file-to-markdown';
export { FileWriteTool } from './file-write';
export { FileEditTool } from './file-edit';
export { FileGrepTool } from './file-grep';
export { FileListTool } from './file-list';
export { CodeSearchTool } from './code-search';
export { CodeOutlineTool } from './code-outline';
export { CodeRefsTool } from './code-refs';
export { CodeGraphTool } from './code-graph';
export { JsExecTool } from './js-exec';
export { setJsExecDataBridge, type JsDataBridge } from './js-exec';
export { PortScanTool } from './port-scan';
export { LanScanTool } from './net-scan';
export { HttpRequestTool } from './http-request';
export { TcpSendTool } from './tcp-send';
export { UdpSendTool } from './udp-send';
export { DnsLookupTool } from './dns-lookup';
export { CmdExecTool } from './cmd-exec';
export { PythonExecTool } from './python-exec';
export { DoyzTool } from './doyz';
export { SecurityTool } from './security';
export { BrowserToolClasses, BROWSER_TOOL_NAMES } from './browser';
export { CallAgentTool } from './call-agent';
export { ListSubAgentsTool } from './list-sub-agents';
export { ListModelsTool } from './list-models';
export { AskUserTool } from './ask-user';
export { ConfirmUserTool } from './confirm-user';
export { TaskPlanTool, TaskStepTool } from './task-plan';
export { ConfigureModelPlatformTool } from './configure-model-platform';
export { ImageAnalyzeTool } from './image-analyze';
export { CompareProductsTool } from './compare-products';

import { FileReadTool } from './file-read';
import { FileToMarkdownTool } from './file-to-markdown';
import { FileWriteTool } from './file-write';
import { FileEditTool } from './file-edit';
import { FileGrepTool } from './file-grep';
import { FileListTool } from './file-list';
import { CodeSearchTool } from './code-search';
import { CodeOutlineTool } from './code-outline';
import { CodeRefsTool } from './code-refs';
import { CodeGraphTool } from './code-graph';
import { JsExecTool } from './js-exec';
import { PortScanTool } from './port-scan';
import { LanScanTool } from './net-scan';
import { HttpRequestTool } from './http-request';
import { TcpSendTool } from './tcp-send';
import { UdpSendTool } from './udp-send';
import { DnsLookupTool } from './dns-lookup';
import { CmdExecTool } from './cmd-exec';
import { PythonExecTool } from './python-exec';
import { DoyzTool } from './doyz';
import { SecurityTool } from './security';
import { BrowserToolClasses } from './browser';
import { CallAgentTool } from './call-agent';
import { ListSubAgentsTool } from './list-sub-agents';
import { ListModelsTool } from './list-models';
import { AskUserTool } from './ask-user';
import { ConfirmUserTool } from './confirm-user';
import { TaskPlanTool, TaskStepTool } from './task-plan';
import { ConfigureModelPlatformTool } from './configure-model-platform';
import { ImageAnalyzeTool } from './image-analyze';
import { CompareProductsTool } from './compare-products';
import type { ToolRegistry } from '../registry';

/** 注册所有内置工具到 registry（web_search 已移除，联网查询统一委派 pageAgent） */
export function registerBuiltInTools(registry: ToolRegistry): void {
  registry.register(new FileReadTool());
  // 办公文档 → Markdown（LLM 先转 md 再用 file_read 分段读，避免直接读 office 文件）
  registry.register(new FileToMarkdownTool());
  registry.register(new FileWriteTool());
  // 文件编辑（局部替换）与文件内容搜索（正则+上下文）——补齐「精准编辑 + 定位」能力
  registry.register(new FileEditTool());
  registry.register(new FileGrepTool());
  // 目录列表 + 源码查看/搜索 + JS 沙箱执行（代码工具族）
  registry.register(new FileListTool());
  registry.register(new CodeSearchTool());
  registry.register(new CodeOutlineTool());
  // 符号定义/引用定位（对标 CodeBuddy go-to-definition / find-references 的启发式版）
  registry.register(new CodeRefsTool());
  // 仓库级符号依赖图（代码图：callers/callees/影响面评估）
  registry.register(new CodeGraphTool());
  registry.register(new JsExecTool());
  // 网络安全工具族（端口扫描/HTTP/TCP/UDP/DNS —— 仅限授权目标使用）
  registry.register(new PortScanTool());
  registry.register(new LanScanTool());
  registry.register(new HttpRequestTool());
  registry.register(new TcpSendTool());
  registry.register(new UdpSendTool());
  registry.register(new DnsLookupTool());
  registry.register(new CmdExecTool());
  registry.register(new PythonExecTool());
  registry.register(new DoyzTool());
  registry.register(new SecurityTool());
  // 浏览器自动化工具集（E3）
  for (const ToolClass of BrowserToolClasses) {
    registry.register(new ToolClass());
  }
  // 子智能体委派工具（E7）
  registry.register(new CallAgentTool());
  // 子智能体列表查询工具（E7b）—— 让 LLM 动态发现可用子智能体及其 ID
  registry.register(new ListSubAgentsTool());
  // 可用模型查询工具 —— 让 LLM 动态发现平台/模型/能力，为 call_agent 指定模型与多模态选型提供依据
  registry.register(new ListModelsTool());
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
