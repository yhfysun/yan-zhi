/**
 * 费用提醒器 —— **只提醒，程序不停**（D4，2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么是"提醒"而不是"闸门"
 *
 * 成本阈值是**给用户看的仪表**，不是**给程序用的刹车**：
 * ① 花的是用户的钱，只有他自己能判断"这个任务值不值得继续"；
 * ② 程序自停会丢掉已完成的工作现场，代价比多花几块钱高得多；
 * ③ 与 Claude Code 等同类产品同口径。
 *
 * ⇒ 本模块**只产出"该不该提醒、提醒什么"**，**不产出任何停止信号**（hardStopCny 是
 *   D4 唯一例外，且只在用户自填非零值时出现）。
 *   ★ 2026-10-18：原 P1-9 预算闸（token/墙钟触达自动停）已随"不要程序自动停"的决策退役，
 *     "提醒"与"停止"的语义隔离依旧必须保持 —— 停止判定不得从本模块取信号。
 *
 * ---
 * ## ★ 去重为什么必须落库（不能放内存、不能靠前端）
 *
 * 长任务可能跑几百轮，**每轮结束都会判定一次**；自动接力的每个批次也要判。
 * 不去重 ⇒ 一个任务弹几十次提醒，用户只能关掉整个功能。
 *
 * · 放内存：进程/后端重启即归零 ⇒ 重新弹一遍，且极难复现（"提醒时灵时不灵"）
 * · 靠前端去重：刷新页面即丢、多窗口各弹一次
 * ⇒ `noticedUnits` / `warned` **必须落库**（`conversation_usage` 的两列），由调用方持久化。
 *
 * ---
 * ## hardStopCny：D4 的唯一例外
 *
 * 默认 **0 = 永不停**；只有用户自己填了非零值才会产生 `hard_stop`。
 * 这条分支存在的意义是给"无人值守长任务"留一个兜底，而不是把它变成默认行为。
 */

export interface CostBudgetConfig {
  /** 总开关。**关闭后仍要统计**，只是不提醒（别做成"关了就不记账"） */
  enabled: boolean;
  /** 提醒档位（元）。**0 = 关闭提醒**（仍统计） */
  limitCny: number;
  /** 预警比例（0~1）：累计到 `limitCny × warnRatio` 时先提醒一次 */
  warnRatio: number;
  /** 硬停上限（元）。**0 = 永不停** */
  hardStopCny: number;
  /**
   * 美元平台汇率（USD → CNY，默认 7.1）。
   *
   * ★ 历史按**调用当时**的汇率固化（`usage_event.cost_cny` 落的是人民币）：
   *   改汇率不重算历史 —— 否则用户改一次汇率，过去的账单数字全部变样，无法对账。
   */
  usdToCny: number;
  persistWarningInChat?: boolean;
}

export const DEFAULT_COST_BUDGET: CostBudgetConfig = {
  enabled: true,
  limitCny: 5,
  warnRatio: 0.8,
  hardStopCny: 0,
  usdToCny: 7.1,
  persistWarningInChat: false,
};

/** 提醒类型。`null` = 这次不用提醒 */
export type CostNoticeKind = 'warn' | 'exceeded' | 'hard_stop' | null;

/** 去重状态（**由调用方落库**，本模块不持有） */
export interface CostNoticeState {
  /** 已经提醒过的档位（`floor(used / limitCny)` 的历史最大值） */
  noticedUnits: number;
  /** 是否已发过预警 */
  warned: boolean;
}

export interface CostNoticeResult {
  kind: CostNoticeKind;
  /** 去重状态的新值（调用方据此落库）；没变化也返回，便于统一写回 */
  next: CostNoticeState;
  /** 当前档位（供展示/调试） */
  units: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 判定「本次要不要提醒」。
 *
 * @param usedCny 当前会话累计花费（**库累计 + 内存增量**，见 token-usage 的读取口径）
 * @param cfg     预算配置（**判定前现读**，不要快照 —— 否则用户调低阈值后要等下一个任务才生效）
 * @param state   上次提醒后的去重状态（落库值）
 */
export function maybeNoticeCost(
  usedCny: number,
  cfg: CostBudgetConfig | undefined,
  state: CostNoticeState,
): CostNoticeResult {
  const used = Math.max(0, num(usedCny));
  const cur: CostNoticeState = {
    noticedUnits: Math.max(0, Math.floor(num(state?.noticedUnits))),
    warned: Boolean(state?.warned),
  };
  const limit = Math.max(0, num(cfg?.limitCny));
  const next: CostNoticeState = { ...cur };

  // 关闭 / 未配档位 ⇒ 不提醒（但调用方**仍要继续记账**）
  if (!cfg || !cfg.enabled || limit <= 0) {
    return { kind: null, next, units: cur.noticedUnits };
  }

  // ① 硬停：D4 的唯一例外，默认 0 ⇒ 出厂配置下这条分支永不执行
  const hardStop = Math.max(0, num(cfg.hardStopCny));
  if (hardStop > 0 && used >= hardStop) {
    // 硬停是终态：每次都返回（调用方收到就该停），但仍同步去重状态，避免随后又弹 exceeded
    next.noticedUnits = Math.max(cur.noticedUnits, Math.floor(used / limit));
    next.warned = true;
    return { kind: 'hard_stop', next, units: next.noticedUnits };
  }

  // ② 跨档位：¥5 → ¥10 → ¥15 … 每跨一个档位提醒一次（整倍数去重，防刷屏）
  const units = Math.floor(used / limit);
  if (units > cur.noticedUnits) {
    next.noticedUnits = units;
    // 已经跨档了，预警就没必要再发（exceeded 是更强的信号）
    next.warned = true;
    return { kind: 'exceeded', next, units };
  }

  // ③ 预警：只在还没跨档、且首次触达 `limit × warnRatio` 时发一次
  const ratio = num(cfg.warnRatio);
  const warnAt = limit * (ratio > 0 && ratio <= 1 ? ratio : 0.8);
  if (!cur.warned && warnAt > 0 && used >= warnAt) {
    next.warned = true;
    return { kind: 'warn', next, units };
  }

  return { kind: null, next, units };
}

/**
 * 提醒文案（**模板生成，零额外模型调用**）。
 *
 * ★ 为什么不能"让模型总结一下花了多少钱"：为了报告花费再花一笔是荒谬的，
 *   而且这条路径会在每次触达时都触发一次调用，等于提醒越多花得越多。
 */
export function formatCostNotice(
  usedCny: number,
  limitCny: number,
  opts?: { unpricedCalls?: number; byModel?: Array<{ label: string; cny: number }>; didWriteProgress?: boolean },
): string {
  const fmt = (n: number) => (Math.abs(n) < 1 ? n.toFixed(4) : n.toFixed(2));
  const lines: string[] = [];
  lines.push(
    `本会话累计花费约 ¥${fmt(usedCny)}，已超过你设置的 ¥${fmt(limitCny)} —— 任务继续运行，不会自动停止。`,
  );
  const byModel = (opts?.byModel || []).filter((m) => m.cny > 0);
  if (byModel.length) {
    const total = byModel.reduce((s, m) => s + m.cny, 0) || 1;
    lines.push(`花费构成：${byModel.map((m) => `${m.label} ¥${fmt(m.cny)}（${Math.round((m.cny / total) * 100)}%）`).join(' · ')}`);
  }
  if (opts?.unpricedCalls) {
    // ★ 必须恒定带这句：换未配价模型会让数字停止增长，用户据此以为"没花钱"
    lines.push(`另有 ${opts.unpricedCalls} 次调用未配置价格，实际金额可能更高`);
  }
  lines.push('提示：本会话的历史会随每轮重复计入输入，开新会话继续会更省。');
  if (opts?.didWriteProgress === false) {
    // ★ 任务不停 ⇒ 不能说"进度已写入"除非真的写了（v1 的写法依赖"马上要收尾"，D4 下该前提没了）
    lines.push('（注意：任务仍在运行，进度尚未写入空间记忆）');
  }
  return lines.join('\n');
}
