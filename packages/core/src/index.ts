// @yan-zhi/core - 业务核心逻辑（平台无关）
export * from './platform/types';
export * from './llm/client';
export * from './llm/stream';
// 上游 URL 拼接的唯一实现（2026-10-17）：server 的 llm-proxy 与 core 的 LlmClient **必须共用**，
// 否则两端各拼一次迟早漂移成两套规则（国产厂商的路径问题是最大受害者）。
export * from './llm/api-path';
export { reorderToolGroups } from './llm/message-order';
export * from './llm/tool-args-advice';
export * from './mcp/client';
export * from './workflow/engine';
export * from './workflow/nodes';
export * from './compress/window';
export * from './db/schema';
// 会话来源标记（2026-10-16）：写入口与列表过滤的白名单唯一出口
export * from './db/conversation-source';
// 页面指令的导入校验（P3-2）：导出/导入共用，导入的脚本强制"每次确认"
export * from './db/page-command-import';
export * from './skill/loader';
export * from './tool';
export * from './plugin';
export * from './preview';
export {
  localListBases,
  localCreateBase,
  localUpdateBase,
  localDeleteBase,
  localListDocs,
  localAddDoc,
  localDeleteDoc,
  localSearch,
  localSearchAll,
  localEmbed,
} from './kb/local-knowledge';
