/**
 * 防失控循环闸门（2026-10-09）。
 *
 * ★ 背景：模型可能陷入"换着花样重试同一目标"的死循环 —— 实例：让浏览器助手核实
 *   抖音评论区置顶入口（入口本不存在），模型连续几十次 browser_run_script 换脚本
 *   硬试，token 疯狂燃烧、任务永不收敛。提示词约束（"找不到入口如实报告别死磕"）
 *   实测压不住，必须在工具执行漏斗上做代码级拦截。
 *
 * 两条触发线：
 *   A) 同名同参重复 —— 同一 key 在近期窗口内已出现 ≥ TOOL_DUP_LIMIT 次 → 拦截。
 *      留 1 次重试余量：前端委托 SSE 瞬断等瞬时失败后原样重试一次是合法的。
 *   B) 单工具连刷 —— 同一工具"严格连续" ≥ TOOL_CONSEC_LIMIT 次（中间无任何其他
 *      工具）→ 拦截。用严格连续而非窗口占比：批量正流程（逐章 run_script 抓正文 +
 *      逐章 file_write 落盘）天然被其他工具打断，不会误伤；纯刷同一工具的才是失控。
 *
 * 只拦不罚：返回的是指引文本（让模型"停止重试、汇报结论"），不是抛错 ——
 * 任务循环把工具文本原样回灌模型，模型看到后走正常收口路径。
 *
 * 状态放 WeakMap（key=task 对象）：任务结束对象被 GC，历史自动清零，无需手动清理。
 */

export const TOOL_HISTORY_WINDOW = 16;
export const TOOL_DUP_LIMIT = 2;
export const TOOL_CONSEC_LIMIT = 8;
/**
 * 同一工具**累计被拦截**多少次后，判定"说不动了"→ 走强制收口（2026-10-10 新增）。
 *
 * ★★★ 为什么需要（实测）：`server.log` 里某会话 15 分钟内出现 **6 次循环拦截**
 *   （`browser_get_page_content`×3 / `browser_navigate`×2 / `browser_run_script`×1），
 *   任务在「等超时 → 被拦 → 换参数再试」里空转，用户等不下去只能手动 abort。
 *   原实现「只拦不罚」——模型看到指引文本后**仍可能继续换花样试探**（提示词约束压不住，已被实证）。
 *   ⇒ 加一道硬闸：同一工具被拦到本阈值后，除了返回文案，还会带上
 *   `FORCE_STOP_MARKER` 前缀，由调用方识别并**终止内层 ReAct 循环**、强制走收尾。
 */
export const TOOL_BLOCK_HARD_LIMIT = 3;
/** 强制收口标记：调用方（llm-task-manager）据此终止内层循环，而不是继续把文本回灌给模型 */
export const FORCE_STOP_MARKER = '[FORCE_STOP]';

const taskToolHistory = new WeakMap<object, Array<{ name: string; key: string }>>();
/** 每任务、每工具的**累计拦截次数**（与历史窗口无关 —— 窗口会滑动，拦截计数不该被滑走） */
const taskBlockCounts = new WeakMap<object, Map<string, number>>();

/** 归一化 key：工具名 + 排序后的参数 JSON（截断 600 字符，防超长脚本撑爆内存） */
export function toolCallKey(toolName: string, args: unknown): string {
  let s = '';
  try {
    const o = (args && typeof args === 'object') ? args as Record<string, unknown> : { v: args };
    s = JSON.stringify(o, Object.keys(o).sort());
  } catch { s = String(args); }
  return `${toolName}::${s.length > 600 ? s.slice(0, 600) : s}`;
}

/** 取该工具累计被拦次数（供调用方/测试观察） */
export function toolBlockCount(task: object, toolName: string): number {
  return taskBlockCounts.get(task)?.get(toolName) || 0;
}

/**
 * 记录本次调用并判定是否拦截。返回 null = 放行；返回字符串 = 给模型看的拦截文案。
 * ★ 返回串以 `FORCE_STOP_MARKER` 开头时 = 已达硬闸，调用方应**终止内层循环**（不再回灌模型）。
 * @param task  任务对象（仅作 WeakMap key，不读字段）
 */
export function checkToolLoop(task: object, toolName: string, args: unknown): string | null {
  const hist = taskToolHistory.get(task) || [];
  const key = toolCallKey(toolName, args);
  const dupCount = hist.filter((h) => h.key === key).length;
  // 严格连续数：从历史尾部往前数同名调用
  let consec = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i].name === toolName; i--) consec++;
  taskToolHistory.set(task, [...hist, { name: toolName, key }].slice(-TOOL_HISTORY_WINDOW));

  const bump = () => {
    const m = taskBlockCounts.get(task) || new Map<string, number>();
    const n = (m.get(toolName) || 0) + 1;
    m.set(toolName, n);
    taskBlockCounts.set(task, m);
    return n;
  };
  /** 达到硬闸 → 前缀标记，调用方终止内层循环 */
  const withHardStop = (text: string, n: number) =>
    n >= TOOL_BLOCK_HARD_LIMIT
      ? `${FORCE_STOP_MARKER} 工具 ${toolName} 已被拦截 ${n} 次，判定当前路径不可行。**立即停止所有工具调用**，` +
        `直接输出结论性汇报（已尝试什么 / 为什么不可行 / 建议下一步）。`
      : text;

  if (dupCount >= TOOL_DUP_LIMIT) {
    const n = bump();
    return withHardStop(
      `⛔ 重复调用拦截：工具 ${toolName} 用相同参数已执行过 ${dupCount} 次（本次是第 ${dupCount + 1} 次），相同输入不会产生新结果。请立即停止重试：若目标已尽力而为，直接输出结论性汇报（已核实什么 / 什么不存在或做不到 / 建议下一步），不要再发起同类工具调用。`,
      n,
    );
  }
  if (consec + 1 >= TOOL_CONSEC_LIMIT) {
    const n = bump();
    return withHardStop(
      `⛔ 循环失控拦截：工具 ${toolName} 已连续 ${consec + 1} 次调用且中间无任何其他工具/动作，当前路径大概率走不通。请立即停止该路径：换用其他工具核实、或直接输出结论性汇报（已尝试什么 / 为什么失败 / 建议下一步），不要再连续发起同类调用。`,
      n,
    );
  }
  return null;
}
