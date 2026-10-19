// 按模型 ID 推断上下文窗口（2026-10-19）——三端共用。
//
// 背景（实测事故）：拉取远程模型时前端把所有模型一律写成 DEFAULT_CONTEXT_WINDOW(1M)，
// 而服务端 resolveContextWindow 把"恰好等于默认值"判定为"用户没填"→ 按 32K 保守估算。
// 结果：看起来有 1M、实际压缩在 ~24K 就触发，长任务反复丢工具结果。
//
// 这里按**已知模型家族**给出真实窗口（公开资料值）；不认识的返回 undefined，
// 调用方写入 NULL（=未声明），由 resolveContextWindow 走保守兜底 —— 宁可早压，不可 400。
//
// ★ 维护约定：新增模型家族时在这里补一行，并留来源注释；不要把"不知道"猜成 1M。
export function inferContextWindow(modelId: string): number | undefined {
  const id = String(modelId || '').toLowerCase();
  if (!id) return undefined;

  // OCR 专用模型：窗口很小
  if (id.includes('deepseek-ocr')) return 8192;

  // R1 蒸馏系列：继承底座窗口（先于通用 r1 判断，避免误中）
  if (id.includes('distill-qwen')) return 32768;   // Qwen2.5 原生 32K（YaRN 可扩，保守取原生）
  if (id.includes('distill-llama')) return 131072; // Llama 3.1 128K

  // DeepSeek V2 / V3 / V3.1 / V3.2 / chat / reasoner / R1：官方 128K
  if (/deepseek-(v2|v3|v3\.1|v3\.2|chat|reasoner|r1)/.test(id)) return 131072;

  // 未知家族（含 V4 等新系列、第三方网关自有命名）：不猜
  return undefined;
}
