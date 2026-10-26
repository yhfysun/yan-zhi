// 内嵌数据看板契约的持久化（按 会话 + 消息 id）
//
// 主通道是服务端 message.data_view_json（跨端同步）；localStorage 只作兜底 ——
// 服务端写入失败、或老数据还没回填时，刷新后仍能看到内嵌看板。
// 回填时服务端值优先：localStorage 只在消息上没有 dataView 时补。
// 上限 80 条/会话，防止长期使用无限增长。

import type { InlineDataView, Message } from '@yan-zhi/shared';

const MAX_PER_CONV = 80;
const keyOf = (convId: string) => `yz:inline-views:${convId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveInlineDataView(convId: string, messageId: string, view: InlineDataView): void {
  const s = storage();
  if (!s || !convId || !messageId || !view) return;
  try {
    const map = loadInlineDataViews(convId);
    map[messageId] = view;
    const entries = Object.entries(map);
    const trimmed = entries.slice(Math.max(0, entries.length - MAX_PER_CONV));
    s.setItem(keyOf(convId), JSON.stringify(Object.fromEntries(trimmed)));
  } catch { /* 配额/隐私模式失败时静默：看板只是展示态 */ }
}

export function loadInlineDataViews(convId: string): Record<string, InlineDataView> {
  const s = storage();
  if (!s || !convId) return {};
  try {
    const raw = s.getItem(keyOf(convId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, InlineDataView> : {};
  } catch {
    return {};
  }
}

/** 历史消息回填：服务端没有 dataView 时，用本地保存的契约补上（就地修改） */
export function applyInlineDataViews(msgs: Message[], convId: string): void {
  const map = loadInlineDataViews(convId);
  if (!Object.keys(map).length) return;
  for (const m of msgs) {
    if (m.dataView) continue; // 服务端已落库，以它为准
    const v = map[m.id];
    if (v) (m as Message).dataView = v;
  }
}

export function clearInlineDataViews(convId: string): void {
  const s = storage();
  if (!s) return;
  try { s.removeItem(keyOf(convId)); } catch { /* ignore */ }
}
