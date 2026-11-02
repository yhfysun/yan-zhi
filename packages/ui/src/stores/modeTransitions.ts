// 模式切换记录（four-mode-workspace 2b.5）：
//   切模式时在消息流插入一条**轻量分隔提示**（仅 UI + 本轮 system prompt 追加），
//   **不伪造用户消息**。记录按会话隔离（模式共享同一会话时才有意义），
//   持久化到 localStorage，刷新后仍能看到「什么时候切到了哪个模式」。
import { ref, type Ref } from 'vue';

export interface ModeTransition {
  id: string;
  /** 切换后所在会话（空串 = 切换时还没有会话/草稿态） */
  convId: string;
  at: number;
  from: string;
  to: string;
}

const KEY = 'yz:mode:transitions';
const MAX_TOTAL = 200;
const MAX_PER_CONV = 20;

function read(): ModeTransition[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (t: any) => t && typeof t.id === 'string' && typeof t.at === 'number'
        && typeof t.from === 'string' && typeof t.to === 'string',
    );
  } catch {
    return [];
  }
}

const list: Ref<ModeTransition[]> = ref(read());

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.value.slice(-MAX_TOTAL)));
  } catch { /* 隐私模式忽略 */ }
}

/** 追加一条切换记录（同一会话最多保留 20 条，防止长会话无限增长） */
export function recordModeTransition(t: Omit<ModeTransition, 'id'>): void {
  if (!t || t.from === t.to) return;
  const entry: ModeTransition = { ...t, id: `mt_${t.at}_${Math.random().toString(36).slice(2, 8)}` };
  const next = [...list.value, entry];
  // 每个会话只留最近 N 条
  const byConv = new Map<string, number>();
  const kept: ModeTransition[] = [];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const c = next[i].convId || '';
    const n = byConv.get(c) || 0;
    if (n >= MAX_PER_CONV) continue;
    byConv.set(c, n + 1);
    kept.push(next[i]);
  }
  kept.reverse();
  list.value = kept;
  persist();
}

/** 某会话的切换记录（按时间升序）；空会话 id 视为草稿态共用一组 */
export function transitionsFor(convId: string | null | undefined): ModeTransition[] {
  const id = convId || '';
  return list.value.filter((t) => (t.convId || '') === id);
}

/** 最近一次切换（没有则 null） */
export function latestTransitionFor(convId: string | null | undefined): ModeTransition | null {
  const rows = transitionsFor(convId);
  return rows.length ? rows[rows.length - 1] : null;
}

/** 测试/清空用 */
export function clearModeTransitions(convId?: string): void {
  list.value = convId === undefined ? [] : list.value.filter((t) => (t.convId || '') !== (convId || ''));
  persist();
}
