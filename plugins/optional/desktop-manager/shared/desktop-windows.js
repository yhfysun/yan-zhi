// 桌面层子窗口的「应该有哪几个 / 该开该关」计算（纯函数）
//
// ★ 为什么抽出来：主进程开窗口是副作用（Electron IPC），而"该不该开"是可算的纯逻辑。
//   放这里才能单测；主进程只负责按 diff 结果执行开关。

/** 折叠后只留标题栏的高度（持久化 rect 不变，展开时按原高度复原） */
export const COLLAPSED_H = 44;
/** 桌面层工具条（整屏那块透明窗口）：它是"容器"，不是子窗口 */
export const TOOLBAR_ENTRY = 'frontend/layer.html';
const DEFAULT_RECT = { x: 40, y: 40, w: 400, h: 320 };

export function fenceEntry(id) {
  return `frontend/fence.html?fence=${encodeURIComponent(id)}`;
}

export function widgetEntry(id) {
  return `frontend/widgets.html?id=${encodeURIComponent(id)}&layer=desktop`;
}

/**
 * 是否属于「钉在桌面上的子窗口」。
 * 只有带具体 fence / widget id 的才算；工具条、设置页、纯浮层都不是 ——
 * 清理时不能把它们一起关掉。
 */
export function isChildEntry(entry) {
  const e = String(entry || '');
  if (e.startsWith('frontend/fence.html?fence=')) return true;
  if (e.startsWith('frontend/widgets.html?') && /[?&]id=/.test(e)) return true;
  return false;
}

export function fenceWindowRect(fence) {
  const f = fence && typeof fence === 'object' ? fence : {};
  const rect = f.rect && typeof f.rect === 'object'
    ? { x: Number(f.rect.x) || 0, y: Number(f.rect.y) || 0, w: Number(f.rect.w) || 0, h: Number(f.rect.h) || 0 }
    : { ...DEFAULT_RECT };
  // 缺 rect 的老数据用默认值，别开出 0×0 的窗口
  if (!rect.w || !rect.h) return { ...DEFAULT_RECT };
  return f.collapsed ? { ...rect, h: COLLAPSED_H } : rect;
}

export function widgetWindowRect(widget) {
  const w = widget && typeof widget === 'object' ? widget : {};
  const p = w.pos && typeof w.pos === 'object' ? w.pos : {};
  return {
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
    w: Number(p.w) || DEFAULT_RECT.w,
    h: Number(p.h) || 200,
  };
}

/**
 * 当前"应该有"的窗口清单：组件排前面（先钉 = 在下面），分组后钉压在上面。
 * 空分组不开窗（省一个渲染进程）；「待归类」与 pinned 的分组始终开。
 */
export function desiredWindows(state = {}) {
  const fences = Array.isArray(state.fences) ? state.fences : [];
  const items = Array.isArray(state.items) ? state.items : [];
  const widgets = Array.isArray(state.widgets) ? state.widgets : [];

  const out = [];
  for (const w of widgets) {
    if (w && w.layer === 'desktop') {
      out.push({ entry: widgetEntry(w.id), rect: widgetWindowRect(w) });
    }
  }

  const countOf = new Map();
  for (const it of items) {
    const k = it && it.fenceId;
    if (k) countOf.set(k, (countOf.get(k) || 0) + 1);
  }
  for (const f of fences) {
    if (!f || !f.id) continue;
    const has = (countOf.get(f.id) || 0) > 0;
    const always = f.id === 'inbox' || f.pinned === true;
    if (!has && !always) continue;
    out.push({ entry: fenceEntry(f.id), rect: fenceWindowRect(f) });
  }
  return out;
}

/**
 * 与已开窗口对比：缺的开、多的收。
 * ★ 只动子窗口（isChildEntry），工具条/设置页不在管辖内。
 */
export function diffWindows(open = [], desired = []) {
  const openList = Array.isArray(open) ? open : [];
  const wantList = Array.isArray(desired) ? desired : [];
  const have = new Set(openList.map((o) => String(o && o.entry)));
  const want = new Set(wantList.map((d) => String(d && d.entry)));

  // close 返回**完整的已开窗口对象**（含 windowId 与 entry），由调用方自己取 id ——
  // 主进程关窗需要 windowId，排查日志需要 entry，只给一个 id 会让排障时无从下手。
  return {
    open: wantList.filter((d) => !have.has(String(d.entry))),
    close: openList.filter((o) => isChildEntry(o && o.entry) && !want.has(String(o.entry))),
  };
}
