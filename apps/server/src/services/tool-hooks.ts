import { createLogger } from './logger.js';
const logger = createLogger('tool-hooks');
// 工具调用前后置钩子（P2-3，对标 WorkBuddy / CodeBuddy 的 hook 机制）。
//
// ★★★ 为什么需要（2026-09-29，方案 P2-3）：
//   此前 `executeTool` 里**硬编码**了若干"工具执行完要做的副作用"：
//     · file_write 成功 → 登记 conversation_file（文件管理面板展示）；
//     · 媒体产物落盘 → 登记 conversation_file；
//     · （以及别的分支里还有几处 registerXxx）。
//   后果：每新增一个"产出文件"的工具，都要回到主循环里加一段 if ——
//   主循环越来越肿，且**必然漏**（本项目已多次踩到"某入口忘了登记 → 文件管理看不到"）。
//
//   钩子化之后：主循环只负责 `runBeforeToolHooks` → 执行 → `runAfterToolHooks`，
//   具体副作用各自的模块自己注册。加新工具时**不需要动主循环**。
//
// ★ 设计约束（与项目既有风格一致）：
//   · **fail-open**：钩子抛错绝不能影响工具本身的结果（工具已经执行完了，副作用是次要的）→
//     逐个 catch + console.warn，不让一个坏钩子带走整条链。
//   · **顺序稳定**：按注册顺序串行执行（副作用可能有依赖，并发跑顺序不确定）。
//   · **可观测**：`before` 钩子可返回 `{ block: reason }` 主动拦截（用于"危险命令黑名单"这类场景）。
//   · 不依赖 db / serverState → 纯逻辑，可被 core 或测试直接引用。

/** 工具调用的上下文（钩子据此做事，避免各自去重查一遍） */
export interface ToolHookContext {
  taskId: string;
  conversationId: string;
  userId: string;
  /** 本轮助手的占位消息 id（登记 conversation_file 时用作 message_id） */
  assistantMsgId?: string | null;
  /** 工具回传的 `_meta`（如 file_write 的 { path, name, category, bytes }） */
  meta?: Record<string, unknown> | null;
}

export interface BeforeToolResult {
  /** 非空表示**阻止**本次工具执行，值为拒绝原因（会作为工具结果回给模型） */
  block?: string;
}

export type BeforeToolHook = (
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolHookContext,
) => Promise<BeforeToolResult | void> | BeforeToolResult | void;

export type AfterToolHook = (
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  ctx: ToolHookContext,
) => Promise<void> | void;

const beforeHooks: Array<{ name: string; fn: BeforeToolHook }> = [];
const afterHooks: Array<{ name: string; fn: AfterToolHook }> = [];

/** 注册前置钩子。name 仅用于日志定位（哪个钩子出错了）。 */
export function registerBeforeToolHook(name: string, fn: BeforeToolHook): void {
  beforeHooks.push({ name, fn });
}

/** 注册后置钩子。 */
export function registerAfterToolHook(name: string, fn: AfterToolHook): void {
  afterHooks.push({ name, fn });
}

/** 清空全部钩子（仅测试用）。 */
export function clearToolHooks(): void {
  beforeHooks.length = 0;
  afterHooks.length = 0;
}

/**
 * 跑全部前置钩子。**串行**执行（顺序确定）；任一钩子返回 block 即停止并返回该原因。
 *
 * ★ fail-open：钩子自身抛错只 warn，不阻断工具（不能因为一个审计钩子坏了导致用户工具全废）。
 */
export async function runBeforeToolHooks(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolHookContext,
): Promise<BeforeToolResult> {
  for (const h of beforeHooks) {
    try {
      const r = await h.fn(toolName, args, ctx);
      if (r && typeof r === 'object' && typeof r.block === 'string' && r.block) {
        return { block: r.block };
      }
    } catch (e: any) {
      logger.warn(`[tool-hook] before 钩子「${h.name}」异常（已忽略）:`, e?.message || e);
    }
  }
  return {};
}

/**
 * 跑全部后置钩子。**串行**执行；各自 catch。
 *
 * ★ 为什么不并发：后置钩子常写同一张表（conversation_file），并发执行会撞写；
 *   而且它们都是"落库+emit"级别的轻操作，串行的代价可忽略。
 */
export async function runAfterToolHooks(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  ctx: ToolHookContext,
): Promise<void> {
  for (const h of afterHooks) {
    try {
      await h.fn(toolName, args, result, ctx);
    } catch (e: any) {
      logger.warn(`[tool-hook] after 钩子「${h.name}」异常（已忽略）:`, e?.message || e);
    }
  }
}

/** 已注册钩子数（供自检/日志） */
export function toolHookStats(): { before: string[]; after: string[] } {
  return { before: beforeHooks.map((h) => h.name), after: afterHooks.map((h) => h.name) };
}