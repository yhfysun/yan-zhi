// 「新任务继续」的首条消息预填文案（纯函数，便于单测）。
//
// 定位（用户 2026-10-24 拍板）：右键任务 → 新任务继续时，**属性靠会话字段继承**
// （空间 / 子线 / 智能体 / 模型），这里只负责「从哪断的」这一段一次性上下文。
// ★ 只预填、不自动发送：用户改完再发，避免模型拿着他不要的摘要直接开跑。
// ★ 不复制源任务的 taskPlan 对象 —— 新任务要自己重新规划，复制旧计划会顶着
//   「已完成」的假进度卡住新任务（进度卡与实际执行状态脱节）。
// ★ 口径类信息不写在这里：同一目录本来就有跨会话任务记忆 + 空间记忆，
//   塞进消息里只会重复；这里只留「进度快照 + 从哪一步接」。
import type { Conversation } from '@yan-zhi/shared';
import { getTaskType } from '@yan-zhi/shared';

export interface ContinueTaskSource {
  title?: string | null;
  taskType?: string | null;
  taskPlan?: Conversation['taskPlan'] | null;
}

/**
 * 生成「新任务继续」的预填文案。
 *
 * @param src 源任务的标题 / 任务线 / 计划快照（缺计划时只给一句接续说明）
 */
export function formatContinueTaskPrefill(src: ContinueTaskSource): string {
  const title = (src.title || '').trim() || '上一个任务';
  const typeLabel = src.taskType ? getTaskType(src.taskType).label : '';
  const head = `接续自任务《${title}》${typeLabel ? `（${typeLabel}）` : ''}，接着往下做。`;

  const steps = src.taskPlan?.steps || [];
  const done = steps.filter((s) => s.status === 'done').map((s) => s.title);
  const todo = steps.filter((s) => s.status !== 'done').map((s) => s.title);

  const lines = [head];
  if (done.length) lines.push(`已完成：${done.join('、')}`);
  if (todo.length) lines.push(`未完成：${todo.join('、')}`);

  if (todo.length) {
    lines.push(`请从「${todo[0]}」继续；已经确认过的口径沿用，不要重复追问。`);
  } else if (done.length) {
    lines.push('原任务的计划已全部走完，按下面的新要求继续这个方向；已经确认过的口径沿用，不要重复追问。');
  } else {
    lines.push('请继续这个任务未完成的工作；已经确认过的口径沿用，不要重复追问。');
  }
  return lines.join('\n');
}
