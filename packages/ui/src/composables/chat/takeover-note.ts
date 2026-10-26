/**
 * 「用户接管」快照 → 注入任务的一条观察文本。
 *
 * 参考 AgentScope 客户端 `page-agent-takeover-recorder.ts` 的 `formatTakeoverObservation`：
 * 暂停期间用户手填/手改的内容，恢复时必须告诉 agent「以现值为准、别覆盖」，
 * 否则下一轮它会把用户刚填好的字段再写一遍。
 */
export interface TakeoverSnapshot {
  /** 暂停期间是否发生过用户操作（含无法归因到具体字段的点击） */
  interacted: boolean;
  /** 被用户改动过的字段标签（去重、保序） */
  fields: string[];
  /** 超出上限未列出的字段数 */
  omitted: number;
}

const MAX_LIST = 12;

/** 用户什么都没做 → 返回 undefined（不注入、不打扰） */
export function formatTakeoverNote(s: TakeoverSnapshot): string | undefined {
  if (!s.interacted && s.fields.length === 0) return undefined;
  const guidance = '页面当前值以用户输入为准：不要覆盖已经正确的值，除非它与任务目标冲突。';
  if (s.fields.length === 0) {
    return '【用户接管】暂停期间用户在页面上进行了操作（未能定位到具体字段）。请先重新读取页面状态再继续，不要重复执行已经完成的步骤。';
  }
  const listed = s.fields.slice(0, MAX_LIST).map(f => `「${f}」`).join('、');
  const more = s.omitted > 0 ? `（另有 ${s.omitted} 项未列出）` : '';
  return `【用户接管】暂停期间用户手动修改了这些字段：${listed}${more}。${guidance}`;
}
