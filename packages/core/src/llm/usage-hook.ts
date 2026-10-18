/**
 * 用量回调钩子（2026-10-17）—— 把「一次 LLM 调用的归一化用量」回调给记账方。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 为什么单独一个文件（而不是 LlmClient 的私有方法）
 *
 * vitest 加载不了 LlmClient（构造依赖 `getPlatformAdapter()`：electron / keyring / 授权码）。
 * 而这段逻辑**有真实判据必须钉住**：
 *   · 一次调用只能回调**一次**（流式路径 usage 会在多个 chunk 重复出现，逐 chunk 回调 = 重复计费）；
 *   · 取**最后一份** detail（三个协议都只在收敛帧带 usage）；
 *   · 中途抛错**不回调**（失败尝试没有可信 usage，估一笔钱出来只会污染阈值判据）。
 * ⇒ 抽成纯函数，测试用普通 AsyncIterable 就能全覆盖（本项目既定套路）。
 *
 * 客户端（LlmClient）与测试共用这一个实现 —— 别在别处再写一份"记账回调"。
 */

import type { TokenUsageDetail } from '@yan-zhi/shared';

/** 实际发出请求的平台/模型（故障转移后与任务快照可能不同，必须按实际的记） */
export interface UsageMeta {
  platformId?: string;
  modelId?: string;
}

/** 用量回调：detail 为 undefined = 上游没给可用 usage，调用方应自行估算并标 estimated */
export type UsageCallback = (detail: TokenUsageDetail | undefined, meta: UsageMeta) => void;

/**
 * 包装一段 ChatChunk 流：原样 yield 每一个 chunk，流**正常结束后**回调最后一次用量。
 *
 * @param iter   底层流（三协议解析器的产物）
 * @param onUsage 回调；传 undefined 时零开销直通（不建包装层）
 * @param meta   回调附带的平台/模型信息
 */
export async function* withUsageHook<T extends { usage?: { detail?: TokenUsageDetail } }>(
  iter: AsyncIterable<T>,
  onUsage: UsageCallback | undefined,
  meta: UsageMeta,
): AsyncIterable<T> {
  if (!onUsage) {
    yield* iter;
    return;
  }
  let last: TokenUsageDetail | undefined;
  for await (const chunk of iter) {
    if (chunk.usage?.detail) last = chunk.usage.detail;
    yield chunk;
  }
  // 走到这里 = 流正常走完。中途抛错会被 for-await 直接向上抛，**不会**执行到这行
  //   ⇒ 失败尝试不记账（没有 usage 可依，估出来的数字不可信）。
  // 注意：回调本身抛错不能炸掉生成（记账是旁路，不是主路径）。
  try {
    onUsage(last, meta);
  } catch {
    /* 记账失败静默：任务/生成的现场比一笔钱更要紧 */
  }
}
