/**
 * 模型能力 → 运行时行为的口径（单一真相源）。
 *
 * 背景：能力（model.capabilities_json）是「测出来才勾」的累加集合，
 * 平台目录接口不返回值时我们按模型名自动带上媒体能力（见 agens-platform/service.ts），
 * UI 的「自动检测全部并勾选」也会把通过项写回。因此能力集合的语义是
 * 「已确认具备的能力」，而**不是**「完整的能力清单」。
 *
 * 由此推论（本文件的核心约定）：
 *   不能把「能力非空但不含 function_call」当作「不支持工具调用」——
 *   一次自动勾选（勾上 vision）就会把对话模型的工具全裁掉，智能体直接失能。
 */

/** 媒体生成能力标记：带这些标记的模型是生图/生视频专用，不参与 ReAct 工具调用 */
export const MEDIA_CAPABILITIES = ['image', 'video'];

/**
 * 模型是否走工具调用通道：
 * - 能力为空（未标注）或标了 function_call → 支持
 * - 只标了 image/video 的媒体模型 → 不支持（它们本是生图/生视频专用）
 * - 只标了 vision/reasoning 的对话模型 → 仍支持
 */
export function modelSupportsTools(modelCaps?: string[] | null): boolean {
  if (!modelCaps || modelCaps.length === 0) return true;
  if (modelCaps.includes('function_call')) return true;
  return !modelCaps.some((c) => MEDIA_CAPABILITIES.includes(c));
}
