// 新建组件（围栏页 / 设置页共用）
//
// 组件的权威定义在 /widgets（整体替换语义），所以"新建"= GET 现有 → 追加 → PUT 回去。
// 这里只负责：类型预设、找空位、把菜单画出来（菜单样式写死在本模块，页面上不必各自加 CSS）。
import { uniqueKeyOf } from '../shared/widgets.js';

export const WIDGET_PRESETS = [
  { type: 'weather', label: '天气', hint: '当前天气 + 未来两天', size: { w: 330, h: 250 }, source: { contract: 'weather.current' }, config: {} },
  { type: 'todos', label: '待办', hint: '勾选 / 快速添加 · 到点让宠物提醒', size: { w: 330, h: 260 }, source: { contract: 'todos.list' }, config: { max: 6 } },
  { type: 'memo', label: '备忘录', hint: '桌面直接写，自动保存', size: { w: 300, h: 210 }, source: { contract: 'memo.text' }, config: {} },
  { type: 'folder', label: '文件夹', hint: '预览桌面上某个文件夹', size: { w: 320, h: 280 }, source: { contract: 'folder.items' }, config: { rel: '', max: 8 } },
  { type: 'clock', label: '时钟', hint: '大号时间 + 日期', size: { w: 280, h: 130 }, source: null, config: { showDate: true } },
];

const GAP = 18;
const START = { x: 40, y: 64 };

function overlaps(a, b) {
  return !(a.x + a.w + GAP <= b.x || b.x + b.w + GAP <= a.x
    || a.y + a.h + GAP <= b.y || b.y + b.h + GAP <= a.y);
}

/** 从左上角按列找第一个放得下的空位（3 列网格，出屏就换列） */
export function nextSpot(widgets, size, bounds) {
  const W = Math.max(320, Number(bounds && bounds.w) || 1920);
  const H = Math.max(240, Number(bounds && bounds.h) || 1080);
  const cols = Math.max(1, Math.floor((W - START.x * 2) / (size.w + GAP)));
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const spot = { x: START.x + col * (size.w + GAP), y: START.y + row * 300, w: size.w, h: size.h };
      if (spot.x + spot.w > W - 20) continue;
      if (!(widgets || []).some((w) => w && w.pos && overlaps(spot, w.pos))) return spot;
    }
  }
  // 兜底：网格排满就叠在右下角
  return { x: Math.max(20, W - size.w - 40), y: Math.max(20, H - size.h - 60), w: size.w, h: size.h };
}

export async function createWidget(request, type, extra = {}) {
  const preset = WIDGET_PRESETS.find((p) => p.type === type);
  if (!preset) throw new Error('未知组件类型：' + type);
  const data = await request('/widgets');
  const list = (data && data.widgets) || [];
  if (list.length >= 12) throw new Error('组件最多 12 个，先删掉几个');
  const config = { ...preset.config, ...(extra && extra.config ? extra.config : {}) };
  // 时钟/待办/同城天气全局只能有一个：与其再建一份重复渲染，不如直接说清楚
  const ukey = uniqueKeyOf({ type: preset.type, config });
  if (ukey && list.some((w) => uniqueKeyOf(w) === ukey)) {
    throw new Error(preset.label + ' 全局只能有一个（桌面上已经有了）');
  }
  const bounds = { w: window.screen.width, h: window.screen.height };
  const id = type + '-' + Date.now().toString(36).slice(-5);
  const widget = {
    id,
    type,
    layer: 'desktop',
    pos: nextSpot(list, preset.size, bounds),
    source: preset.source,
    config,
  };
  const out = await request('/widgets', {
    method: 'PUT',
    body: JSON.stringify({ widgets: [...list, widget], bounds }),
  });
  return { widget, widgets: (out && out.widgets) || [] };
}

export async function removeWidget(request, id) {
  const data = await request('/widgets');
  const list = ((data && data.widgets) || []).filter((w) => w.id !== id);
  const bounds = { w: window.screen.width, h: window.screen.height };
  const out = await request('/widgets', { method: 'PUT', body: JSON.stringify({ widgets: list, bounds }) });
  return (out && out.widgets) || [];
}

/**
 * 画一个「新建组件」菜单（就近弹出）。
 * @returns 关闭函数
 */
export function openWidgetMenu({ request, x, y, onDone, onError }) {
  const menu = document.createElement('div');
  menu.style.cssText = [
    'position:fixed', 'z-index:999', 'min-width:212px', 'padding:6px',
    'background:#1b2230', 'border:1px solid rgba(255,255,255,.14)', 'border-radius:12px',
    'box-shadow:0 16px 40px rgba(0,0,0,.45)', 'font-family:"Microsoft YaHei",system-ui,sans-serif',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '新建组件';
  title.style.cssText = 'padding:6px 10px 8px;font-size:11.5px;color:#8d99ad;letter-spacing:.4px';
  menu.appendChild(title);

  for (const p of WIDGET_PRESETS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:7px 10px;border-radius:8px;cursor:pointer';
    const name = document.createElement('span');
    name.textContent = p.label;
    name.style.cssText = 'font-size:12.5px;color:#e6ecf8';
    const hint = document.createElement('span');
    hint.textContent = p.hint;
    hint.style.cssText = 'font-size:11px;color:#8d99ad';
    row.append(name, hint);
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(122,150,255,.16)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      close();
      try {
        const r = await createWidget(request, p.type);
        if (onDone) onDone(r);
      } catch (err) {
        if (onError) onError(err);
      }
    });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);
  // 贴边时往回收，别飘出屏幕
  const rect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(8, x), window.innerWidth - rect.width - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - rect.height - 8);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  function close() {
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    menu.remove();
  }
  function onDocDown(ev) {
    if (!menu.contains(ev.target)) close();
  }
  function onKey(ev) {
    if (ev.key === 'Escape') close();
  }
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  return close;
}
