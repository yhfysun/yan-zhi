// 围栏条目归属与网格计算（前后端共用纯函数：无 DOM、无宿主依赖，可直接 node --test）
//
// ★ 归属优先级是**唯一出口**，别在别处再写一遍：
//     显式指派 > 目录归「文件夹」栏 > 文件按扩展名栏 > 待归类
//   两个容易写错的点：
//   ① 显式指派到「待归类」必须能压住扩展名规则 —— 用户把文件拖回待归类后，
//      下一次扫描不该被扩展名规则立刻抓回去（否则表现为"拖了没用"）。
//   ② 目录只归「文件夹」栏，**不按目录名建栏**（旧版按文件夹名建栏已被迁移掉）。

export const INBOX_ID = 'inbox';

/** 图标网格：与 layout.js 的 CELL_* 保持同一套尺寸，只是内边距不同（网格 14 / 卡片 12） */
export const CELL_W = 84;
export const CELL_H = 104;
/** 卡片标题栏高度：layout.js 算卡片高度时也要加它，故在此唯一出口导出（别在别处重定义） */
export const HEADER = 34;
const GRID_PAD = 14;
const GRID_GAP = 2;
const MAX_COLS = 4;

/** 取扩展名（小写，无扩展名返回 ''） */
export function extOf(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  // 点开头（.gitignore）视为无扩展名，不当成 ext 归类
  if (i <= 0) return '';
  return s.slice(i + 1).toLowerCase();
}

/** 卡片宽度能放下几列图标（封顶 4 列，太窄至少 1 列） */
export function colsFor(rect) {
  const w = Number(rect && rect.w) || 0;
  const inner = w - 2 * GRID_PAD + GRID_GAP;
  return Math.max(1, Math.min(MAX_COLS, Math.floor(inner / (CELL_W + GRID_GAP))));
}

/** 前 count 个图标在围栏内的相对位置（左上角起点，单位 px） */
export function cellsFor(rect, count) {
  const cols = colsFor(rect);
  const n = Math.max(0, Number(count) || 0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({
      x: GRID_PAD + c * (CELL_W + GRID_GAP),
      y: GRID_PAD + r * (CELL_H + GRID_GAP),
    });
  }
  return out;
}

/** 放 count 个图标所需的最小高度（按行数撑开，至少一行，便于拖入） */
export function minHeightFor(rect, count) {
  const cols = colsFor(rect);
  const rows = Math.max(1, Math.ceil((Number(count) || 0) / cols));
  return 2 * GRID_PAD + rows * CELL_H + (rows - 1) * GRID_GAP;
}

/**
 * 排序：name / mtime / type / manual。
 * manual 保持原序（用户自己摆的）；其余按规则升序/降序，稳定排序。
 */
export function sortItems(items, mode) {
  const list = Array.isArray(items) ? [...items] : [];
  if (mode === 'manual') return list;
  if (mode === 'mtime') {
    return list.sort((a, b) => (Number(b.mtimeMs) || 0) - (Number(a.mtimeMs) || 0));
  }
  if (mode === 'type') {
    return list.sort((a, b) => {
      const ea = extOf(a.name);
      const eb = extOf(b.name);
      if (ea !== eb) return ea.localeCompare(eb, 'zh');
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
  }
  return list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
}

/**
 * 给桌面条目判定归属围栏。
 * @param {Array} entries [{ name, rel, path, mtimeMs, isDir }]
 * @param {Array} fences  [{ id, kind: 'folders'|'ext'|'inbox'|'portal'|'custom', label, exts? }]
 * @param {Object} assign { 条目名: fenceId }
 */
export function buildItems(entries, fences, assign = {}) {
  const list = Array.isArray(fences) ? fences : [];
  const map = new Map(list.map((f) => [f.id, f]));
  const folders = list.find((f) => f.kind === 'folders' || f.label === '文件夹');
  const extFences = list.filter((f) => f.kind === 'ext' && Array.isArray(f.exts) && f.exts.length > 0);

  return (Array.isArray(entries) ? entries : []).map((e) => {
    const name = String(e.name || '');
    const wanted = assign[name];
    let fenceId = null;

    // 1) 显式指派优先（含指派到待归类）；指向已删除的围栏时回落 inbox，不静默丢条目
    if (wanted && map.has(wanted)) fenceId = wanted;

    // 2) 目录 → 「文件夹」栏（内容不展开）
    if (!fenceId && e.isDir && folders) fenceId = folders.id;

    // 3) 文件 → 扩展名栏（围栏 exts 与文件扩展名都按小写比较）
    if (!fenceId && !e.isDir) {
      const ext = extOf(name);
      if (ext) {
        const hit = extFences.find((f) => f.exts.some((x) => String(x).toLowerCase() === ext));
        if (hit) fenceId = hit.id;
      }
    }

    return { ...e, fenceId: fenceId || INBOX_ID };
  });
}
