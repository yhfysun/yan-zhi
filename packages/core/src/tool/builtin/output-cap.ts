// 内置工具输出截断助手 —— 防止超大输出（日志/大文件/冗长 stdout）撑爆 LLM 上下文。
// 与 web_search「整页文本塞一条」同类问题的通用防线：所有工具文本输出必须有界。

/** 工具层单字段输出上限（字符数）。64KB ≈ 1.6万~3万 token，单次调用可接受。 */
export const MAX_TOOL_OUTPUT_CHARS = 64 * 1024;

/**
 * 截断超长文本：保留头部 75% + 尾部 25%（错误信息常在末尾），
 * 中间以截断标记连接。未超限原样返回。
 */
export function capToolOutput(text: string, max: number = MAX_TOOL_OUTPUT_CHARS): string {
  if (!text || text.length <= max) return text;
  const marker = `\n…[output truncated: ${text.length} chars total]…\n`;
  const head = Math.max(Math.floor((max - marker.length) * 0.75), 0);
  const tail = Math.max(max - head - marker.length, 0);
  if (head + tail <= 0) return text.slice(0, max);
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}
