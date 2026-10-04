// 工具结果构造助手（P3 收敛，2026-10-04）—— 与 apps/server mcp/api-tool-executor.ts
// 的 ok()/fail() 同一形状的唯一 core 实现。
//
// ★ 为什么必须单点：`{ content: [{ type: 'text', text: X }], isError: true }` 这套
//   手写结构此前在 packages/core 有 ~97 处、27 个文件（file-read 单文件 11 处），
//   改结果形状（如加 _meta、换 content 类型）时不可能逐处同步。
//   工具返回给模型看的文本放 text；isError=true 时文本是**给模型的错误说明**，
//   应包含可行动的重试指引（文案怎么写是各工具的事，形状统一归这里）。

export interface ToolTextResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

/** 成功结果：文本内容（默认 'ok'） */
export function toolOk(text: string = 'ok'): ToolTextResult {
  return { content: [{ type: 'text', text }], isError: false };
}

/** 失败结果：msg 是给模型看的错误说明（建议含可行动的重试指引） */
export function toolError(msg: string): ToolTextResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}
