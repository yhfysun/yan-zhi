/**
 * 按 key 分桶的「连续无变化计数」（B7，2026-10-09）。
 *
 * ★★★ 为什么必须有（实测缺陷）：
 *   `noChangeStreak` 在**服务端**（`browser.ts:634`）与**桌面**（`main.cjs:2261`）
 *   都是**模块级单值** —— 而它的语义是"**这个页面**连续几次操作后毫无变化"。
 *   单值意味着：A 会话在页面甲连续点 2 次没反应、B 会话在页面乙点 1 次
 *   → 计数器变成 3 → **B 会话收到"连续 3 次无变化，请停止重复操作"的假告警**
 *   （B 其实只操作了一次）。反过来 A 的 streak 也会被 B 的成功操作**清零**，
 *   于是"真的卡住了"反而收不到告警 —— **两个方向都会错**，且不报错。
 *
 * ★ 为什么按 **tab（页面）** 分桶，而不是按会话：
 *   ① 语义上这是"页面的状态"（页面没变就是没变，与谁点的无关）；
 *   ② **服务端 `/action` 路由拿不到会话标识**（实测：`browser.ts` 全文件无
 *      `conversationId` 读取，服务端是"单活动页"架构）—— 按会话分桶在服务端**做不到**；
 *   ③ 两链路都**能拿到 tabId**（服务端 `args.tabId`、桌面 `browserView:action` 的首参）。
 *   ⇒ 这是"语义正确"与"两链路都能实现"的交集。
 *
 * ★ 不做定时清理，只做**显式删除 + 上限兜底**：
 *   tab 关闭时调用 `forget()`（两链路都有明确的关闭点）；另设 `maxKeys` 防"关 tab
 *   路径有漏网"导致的缓慢增长（超出时淘汰**最早插入**的桶 —— Map 迭代序即插入序）。
 */

export interface KeyedStreakOptions {
  /** 达到该值即视为"卡住"（调用方据此给告警） */
  threshold?: number;
  /** 桶数上限（防关 tab 路径漏网导致缓慢增长） */
  maxKeys?: number;
}

export class KeyedStreak {
  private map = new Map<string, number>();
  private readonly threshold: number;
  private readonly maxKeys: number;

  constructor(opts: KeyedStreakOptions = {}) {
    this.threshold = Math.max(1, opts.threshold ?? 3);
    this.maxKeys = Math.max(1, opts.maxKeys ?? 200);
  }

  /**
   * 记录一次操作结果并返回**该桶**的最新计数与是否需要告警。
   * @param key 桶键（用 tabId；拿不到时用固定占位符，退化为旧行为而不是崩）
   * @param changed 本次操作后页面是否有变化
   * @returns `{ streak, warning }` —— `warning` 仅在达到阈值时非空
   */
  record(key: string, changed: boolean): { streak: number; warning?: string } {
    const k = String(key || 'default');
    if (changed) {
      this.map.set(k, 0);
      return { streak: 0 };
    }
    const next = (this.map.get(k) ?? 0) + 1;
    this.map.set(k, next);
    this.evictIfNeeded();
    if (next >= this.threshold) {
      return {
        streak: next,
        warning:
          `连续 ${next} 次操作页面无任何变化，操作可能未生效。请停止重复同类操作：` +
          `改用 index 精确定位（先 browser_get_page_info 获取最新编号）、重新分析页面、或 ask_user 请求人工介入。`,
      };
    }
    return { streak: next };
  }

  /** 取当前计数（不增） */
  get(key: string): number {
    return this.map.get(String(key || 'default')) ?? 0;
  }

  /** **tab 关闭时调用** —— 删除该桶，避免"复用了同一个 tabId"时继承旧计数 */
  forget(key: string): void {
    this.map.delete(String(key || 'default'));
  }

  /** 清空（测试 / 重置用） */
  clear(): void {
    this.map.clear();
  }

  /** 当前桶数（便于观测与守门测试） */
  get size(): number {
    return this.map.size;
  }

  private evictIfNeeded(): void {
    // Map 迭代序 = 插入序 → 删最早的
    while (this.map.size > this.maxKeys) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}