// 智能抠像（P2-1）服务薄层 —— 路由只依赖这里，运行时细节在 clip-matte-runtime。
//
// ★ 骨架阶段（2026-11-02）：只有「探测运行时」与「生成蒙版视频」两个能力；
//   **没有接入渲染管线**（不产生透明视频、不替换片段）。POST /matte/apply 返回 501。
// ★ probe 结果必须真实：缺模型就 ok:false + 可执行指引，不自动下载、不伪造成功。
import {
  resolveMatteRuntime,
  type MatteRuntime,
} from './clip-matte-runtime.js';

export {
  MATTE_MODELS,
  DEFAULT_MATTE_MODEL,
  parseMatteSidecar,
  matteModelDir,
  matteSidecarExample,
  generatePortraitMatte,
  resetMatteRuntimeCache,
  type MatteModelSpec,
  type MatteSidecarResult,
  type MatteRuntime,
  type GeneratePortraitMatteInput,
  type GeneratePortraitMatteResult,
} from './clip-matte-runtime.js';

/**
 * 探测抠像运行时（Python / onnxruntime / ONNX 模型）。
 * 成功结果在 runtime 层缓存；失败不缓存，用户放好模型后重试立即生效。
 */
export async function probeMatteRuntime(): Promise<MatteRuntime> {
  return resolveMatteRuntime();
}
