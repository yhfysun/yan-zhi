// 残留运行态自愈判定 —— 纯函数（可脱离 pinia / 网络单测）。
//
// ★★★ 为什么抽成独立文件（而不是写在 stores/chat.ts 里）：
//   这是"禁用标志挂多久"的**唯一判定** —— 错了的表现要么是
//   「没有任务还锁着输入框」（用户实报「没有任务，禁用标志也一直存在着」），
//   要么是「任务在跑却被误清」（更糟：用户的操作被打断）。
//   两者都只能靠**行为测试**抓，不能只看源码里有没有那个表达式
//   （本项目反复栽过"断言存在 ≠ 断言生效"）。
//   而 stores/chat.ts 顶层会 import pinia/API（拉起一片依赖），测试里加载代价大且易耦合，
//   故与 `plan-buckets.ts` 同一模式：抽出来，main 侧 import 它（唯一实现），测试也 import 它（真跑行为）。
//
// ★ 历史教训（2026-10-11 修）：旧实现把宽限写成 **120s** 且直接内联在
//   `sweepStaleBrowserTakeover` 里 —— 只要会话跑过浏览器工具，任务结束后最长 120s
//   禁用标志都挂着；且因为不可单测，这个数字一直被当成"合理的编排间隙宽限"。
//   实际上它拿"浏览器工具静默时长"当"任务是否还在跑"的**代理信号** ——
//   而任务是否在跑，服务端 `/llm/tasks/active` 一句话就能问清，不需要靠猜。

/** 自愈巡检周期（ms）。
 *  ★★★ 2026-10-11：**降级为"最后一道保险"** —— 主路径已改为会话级长连订阅
 *  （服务端终态双发到会话总线，见 apps/server/src/llm-task-manager.ts 的 emit），
 *  任务结束是**实时**感知的。巡检只兜两种极端：
 *    ① 会话级流也一直连不上（双向都断）；② 服务端版本较老、不发双发事件。
 *  ⇒ 间隔 30s → **60s**（不再承担主路径，无需高频）。 */
export const SWEEP_INTERVAL_MS = 60000;

/** 浏览器会话的查询宽限（ms）。
 *  ★ 只用于合并"终态事件仍在路上"的抖动，**不再**当"任务是否在跑"的代理。
 *  120s → 30s。 */
export const BROWSER_SWEEP_GRACE_MS = 30000;

/**
 * 判定某会话的残留是否需要**这一轮**去查服务端。
 *
 * @param hasBrowserTask 该会话是否登记过"跑过浏览器工具"（browserTaskConvs）
 * @param sinceLastBrowserToolMs 距最后一次浏览器工具事件的毫秒数
 * @param graceMs 宽限（BROWSER_SWEEP_GRACE_MS）
 * @returns true = 本轮应查服务端；false = 本轮跳过（仍在宽限内）
 */
export function shouldSweepConv(
  hasBrowserTask: boolean,
  sinceLastBrowserToolMs: number,
  graceMs: number = BROWSER_SWEEP_GRACE_MS,
): boolean {
  // 非浏览器会话：没有"浏览器事件"这个活性信号 → 永远可查（以服务端为准）
  if (!hasBrowserTask) return true;
  // 浏览器会话：宽限内跳过（刚结束的终态事件可能还在路上），超宽限即查
  return sinceLastBrowserToolMs > graceMs;
}
