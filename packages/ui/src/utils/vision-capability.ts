/**
 * 视觉能力**三态**与探测缓存（C3，2026-10-10）。
 *
 * ★★★ 为什么必须有（实测缺口）：
 *   `model.capabilities_json` 的语义是「**测出来才勾的累加集合**」
 *   （`services/model-caps.ts` 开头明确写了），**不是**「完整能力清单」
 *   ⇒ **不能把"未标注 vision"当作"不支持 vision"** —— 否则大量多模态模型会被误判、
 *     对话模型的工具面被无辜裁掉（`model-caps.ts` 记录过这类事故）。
 *
 *   于是运行时只能"试错"：`runImageAnalyze` 的 `attemptVision` **每次识图都逐个候选真发请求**，
 *   失败的候选**不被记住**（`platform.ts` 只写回**成功**的 capability：
 *   `if (r.ok && r.capability)`）⇒ **每次都白试一遍**（长任务里反复发生，纯浪费）。
 *
 * ★ 本模块给出三态语义（把"未知"与"已证不支持"区分开）：
 *   · `yes` —— 已探明**支持**（真人/自动探测确认）
 *   · `no`  —— 已探明**不支持**（探测到拒答/报错）⇒ **不再重试**
 *   · 未记录 —— **未知**（默认态，允许尝试）
 *
 * ★ 为什么是**内存缓存**而不是落库：
 *   ① 落库要改 `capabilities_json` 语义（正是 model-caps 警告的坑）；
 *     或加新列（迁移成本 + 语义扩张），而收益只是省几次请求；
 *   ② 探测结论与"本次运行的环境/额度/网络"相关，跨重启复用未必可靠；
 *   ③ 会话内避免重复试错**已经足够**（同一次任务里同一候选会被试很多次）。
 *   ⇒ 先做内存版（零迁移、可回退）；若将来确需跨会话，再考虑落库。
 *
 * ★ 可回退：`no` 记录带**过期时间**（默认 30 分钟），到期自动允许重试 ——
 *   避免"一次网络抖动被永久记成不支持"（fail-open：宁可多试一次，不可永久误判）。
 */

export type VisionCapability = 'yes' | 'no' | 'unknown';

/** 否定结论的有效期（毫秒）：到期后允许重试（防"一次抖动被永久记成不支持"） */
export const VISION_NO_TTL_MS = 30 * 60 * 1000;

interface Entry {
  state: 'yes' | 'no';
  at: number;
}

/** 缓存：`platformId/modelId` → 探测结论 */
const cache = new Map<string, Entry>();

/** 缓存键（与运行时候选的标识口径一致） */
export function visionCapKey(platformId: string, modelId: string): string {
  return `${platformId}/${modelId}`;
}

/**
 * 查某模型的视觉能力（**三态**）。
 * @param now 注入时间以便测试（默认真实时间）
 */
export function getVisionCapability(platformId: string, modelId: string, now = Date.now()): VisionCapability {
  const e = cache.get(visionCapKey(platformId, modelId));
  if (!e) return 'unknown';
  // ★ 否定结论过期 → 回到 unknown（允许重试；防"抖动被永久记成不支持"）
  if (e.state === 'no' && now - e.at > VISION_NO_TTL_MS) return 'unknown';
  return e.state;
}

/** 记录探测结论（`yes` 永久有效；`no` 带 TTL） */
export function setVisionCapability(
  platformId: string,
  modelId: string,
  state: 'yes' | 'no',
  now = Date.now(),
): void {
  cache.set(visionCapKey(platformId, modelId), { state, at: now });
}

/**
 * 从一次识图**结果**推断并记录结论（调用方在每次尝试后调用）。
 *
 * @param ok 本次是否成功拿到非空文本
 * @param errMsg 失败时的错误信息（用于区分"不支持视觉"与"网络抖动"）
 * @returns 是否记录了"不支持"
 *
 * ★ 只有**明确的能力性失败**才记 `no`（不支持的措辞 / 明确的 4xx）；
 *   **网络类错误不记**（超时/断连 ≠ 不支持 —— 记了会造成"一次抖动永久误判"）。
 */
export function recordVisionAttempt(
  platformId: string,
  modelId: string,
  ok: boolean,
  errMsg?: string,
  now = Date.now(),
): boolean {
  if (ok) {
    setVisionCapability(platformId, modelId, 'yes', now);
    return false;
  }
  const msg = String(errMsg || '');
  // 网络/超时类 → 不记（这些与"模型是否支持视觉"无关）
  if (/timeout|timed out|超时|ECONNREFUSED|ECONNRESET|network|fetch failed|socket hang up|429|Too Many Requests/i.test(msg)) {
    return false;
  }
  // 明确的能力性失败：不支持的措辞 / 4xx（400/404/422 常见于"不接受图片输入"）
  if (/不支持|无法(查看|识别|看到|处理)|看不到|不是图片|没有图|i can'?t see|i cannot see|unable to (see|view)|no image|text only|4(00|04|22)/i.test(msg)) {
    setVisionCapability(platformId, modelId, 'no', now);
    return true;
  }
  return false;
}

/** 清空缓存（测试 / 用户手动重探） */
export function clearVisionCapabilityCache(): void {
  cache.clear();
}

/** 缓存规模（观测用） */
export function visionCapabilityCacheSize(): number {
  return cache.size;
}