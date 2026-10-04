// 后台并行子智能体的纯逻辑（P2-6，2026-10-04）：并发闸与三段对外文案。
//
// ★ 为什么单独一层（与 path-guard「判定纯逻辑 / 弹窗在主链路」同风格）：
//   主循环文件已 4800+ 行，把「闸门 + 文案」抽出来才能做行为级测试
//   （真实调用 LLM 的后台循环没法在单测里跑，但闸门与文案可以）。
// ★ 故意不做队列：并发满时直接返回引导文案 —— 排队会让模型在回执里看不到
//   自己的任务排在谁后面，状态不可见；引导"等一个或改同步"比静默排队诚实。

export interface BackgroundSubAgentInfo {
  bgId: string;
  agentId: string;
  agentName: string;
  /** 父侧工具调用 id（子智能体消息流按它归组，SSE 渲染已有） */
  toolCallId: string;
  startedAt: number;
}

/** 同一会话后台子智能体并发上限（P2-6 方案拍板：超出直接引导，不排队） */
export const MAX_BACKGROUND_SUBAGENTS = 3;

/** 并发闸：允许再启动一个后台子智能体？ */
export function canStartBackgroundSubAgent(current: ReadonlyMap<string, BackgroundSubAgentInfo>): boolean {
  return current.size < MAX_BACKGROUND_SUBAGENTS;
}

/** 生成后台任务号（可读前缀 + 时间 + 随机，避免同毫秒并发撞号） */
export function makeBackgroundId(now = Date.now()): string {
  return 'bg_' + now.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 启动回执（给模型）：明确"不要空转等待"，并给同步调用的退路 */
export function buildBackgroundReceipt(agentName: string, bgId: string): string {
  return `后台子智能体「${agentName}」已启动（${bgId}）。它在后台独立执行，完成后结果会自动发回本会话 —— `
    + `你可以继续其他工作或正常收尾，**不要为等待它而空转**；如需立即拿到结果请去掉 async 改用同步调用。`;
}

/** 并发满的引导文案（不排队，直接引导） */
export function buildConcurrencyFullMessage(current: ReadonlyMap<string, BackgroundSubAgentInfo>): string {
  const names = [...current.values()].map((b) => b.agentName).join('、');
  return `后台并发已满（上限 ${MAX_BACKGROUND_SUBAGENTS} 个，当前在跑：${names}）。`
    + `请等待其中一个完成（结果会自动发回），或去掉 async 参数改用同步调用。`;
}

/** 主循环收尾提示（用户可见消息）：任务结束但后台仍在跑的明示 */
export function buildFinishNote(current: ReadonlyMap<string, BackgroundSubAgentInfo>): string {
  const names = [...current.values()].map((b) => `「${b.agentName}」`).join('、');
  return `（本次收尾时仍有 ${current.size} 个后台子智能体在运行：${names}。它们完成后结果会自动发回本会话，无需等待。）`;
}

/** 结果投递文案（任务在跑 → 注入唤醒下一轮；已收尾 → 落库普通消息） */
export function buildDeliveryText(agentName: string, result: string): string {
  return `【后台子智能体「${agentName}」完成】\n\n${result}`;
}