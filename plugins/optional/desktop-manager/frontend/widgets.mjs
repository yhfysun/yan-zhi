// 悬浮组件渲染页（P1）
//
// 运行环境：
//   frontend/widgets.html?id=<组件id>&layer=desktop  → 单个组件一个窗口（桌面层由工具条拉起）
//   frontend/widgets.html?layer=overlay              → 悬浮层：整层一窗，窗口缩到内容包围盒
// 数据面：/widgets（声明式实例）+ /widgets/data?contract=（只读契约）
// 交互：窗口只覆盖自己的内容，不做整窗穿透（钉在桌面层的子窗口收不到转发的 mousemove）
const api = window.electronAPI || null;
const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const qs = new URLSearchParams(location.search);
const LAYER = qs.get('layer') === 'overlay' ? 'overlay' : 'desktop';
const WIDGET_ID = String(qs.get('id') || '');
const SINGLE = !!WIDGET_ID;
const SELF_ENTRY = SINGLE
  ? 'frontend/widgets.html?id=' + encodeURIComponent(WIDGET_ID) + '&layer=desktop'
  : 'frontend/widgets.html?layer=' + LAYER;
const DEMO = qs.has('demo');

const S = { widgets: [], data: {}, rev: -1, windowId: null, rect: null, dragging: false };
const SNAP = 8;
const snap8 = (v) => Math.round(Number(v) / SNAP) * SNAP;
const COLORS = ['#5b8cff', '#37c98b', '#f0a03c', '#b07cff', '#2fc6c6', '#8ea3c4'];

async function request(path, opts) {
  const r = await fetch(API_BASE + PLUGIN + path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data;
}

function ago(ms) {
  const d = Date.now() - Number(ms || 0);
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  return Math.floor(d / 86400000) + ' 天前';
}

function demoSample() {
  return {
    widgets: [
      { id: 'w-clock', type: 'clock', layer: 'desktop', pos: { x: 40, y: 40, w: 280, h: 120 }, source: { contract: 'clock' }, config: { showDate: true } },
      { id: 'w-recent', type: 'list', layer: 'desktop', pos: { x: 40, y: 180, w: 320, h: 240 }, source: { contract: 'desktop.recent' }, config: { max: 6, title: '桌面最近文件' } },
      { id: 'w-fences', type: 'status', layer: 'desktop', pos: { x: 380, y: 40, w: 300, h: 240 }, source: { contract: 'fences.summary' }, config: { max: 5, title: '围栏' } },
      { id: 'w-total', type: 'metric', layer: 'desktop', pos: { x: 380, y: 300, w: 300, h: 110 }, source: { contract: 'fences.summary' }, config: { label: '围栏内文件' } },
      { id: 'w-note', type: 'text', layer: 'desktop', pos: { x: 40, y: 440, w: 320, h: 80 }, source: null, config: { text: '桌面整洁，今天专注方案评审。', size: 'm' } },
      { id: 'w-link', type: 'link', layer: 'desktop', pos: { x: 40, y: 540, w: 220, h: 60 }, source: null, config: { label: '打开工作文档', path: '' } },
    ],
    data: {
      clock: { now: new Date().toISOString() },
      'desktop.recent': { files: [
        { name: '需求说明.docx', mtimeMs: Date.now() - 15 * 60000 },
        { name: '截图 2026-10-26 151203.png', mtimeMs: Date.now() - 2 * 3600000 },
        { name: '星图-评审记录.docx', mtimeMs: Date.now() - 26 * 3600000 },
      ] },
      'fences.summary': { fences: [
        { id: 'inbox', label: '待归类', count: 3 },
        { id: 'f-work', label: '工作文档', count: 6 },
        { id: 'f-img', label: '图片截图', count: 4 },
      ] },
      'oplog.last': { at: new Date().toISOString(), moved: 12, undone: false },
    },
  };
}

async function loadWidgets() {
  if (DEMO) {
    const d = demoSample();
    S.widgets = d.widgets.filter((w) => w.layer === LAYER && (!SINGLE || w.id === WIDGET_ID));
    S.data = d.data;
    S.rev = 1;
    render();
    return;
  }
  const data = await request('/widgets');
  S.rev = Number(data.rev) || 0;
  S.widgets = (data.widgets || []).filter((w) => w.layer === LAYER && (!SINGLE || w.id === WIDGET_ID));
  await loadData();
  render();
}

/** 数据键：同一契约可能带参数（天气按城市 / 便签按 id / 文件夹按路径），键里要带参数 */
function sourceKey(w) {
  if (!w || !w.source) return '';
  const c = w.source.contract;
  if (c === 'weather.current') return c + '|' + String((w.config && w.config.city) || '');
  if (c === 'memo.text') return c + '|' + w.id;
  if (c === 'folder.items') return c + '|' + String((w.config && w.config.rel) || '');
  return c;
}

/** 契约的查询参数（渲染页按组件配置拼） */
function sourceQuery(w) {
  const c = w.source && w.source.contract;
  if (c === 'weather.current' && w.config && w.config.city) return '&city=' + encodeURIComponent(w.config.city);
  if (c === 'memo.text') return '&id=' + encodeURIComponent(w.id);
  if (c === 'folder.items' && w.config && w.config.rel) return '&rel=' + encodeURIComponent(w.config.rel);
  return '';
}

function dataOf(w) {
  const k = sourceKey(w);
  return k ? S.data[k] : null;
}

async function loadData() {
  const seen = new Set();
  for (const w of S.widgets) {
    const key = sourceKey(w);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const url = '/widgets/data?contract=' + encodeURIComponent(w.source.contract) + sourceQuery(w);
    try {
      S.data[key] = await request(url);
    } catch { /* 单个契约失败不影响其它组件 */ }
  }
}

function rowsFor(contract, data) {
  if (!data) return [];
  if (contract === 'tasks.today') {
    return (data || []).map((t) => ({ label: t.title, sub: t.status === 'running' ? '进行中' : '待处理' }));
  }
  if (contract === 'agents.running') {
    return (data || []).map((a) => ({ label: a.name, sub: (a.runningCount || 0) + ' 个' }));
  }
  if (contract === 'conversations.recent') {
    return (data || []).map((c) => ({ label: c.title, sub: ago(c.updatedAt) }));
  }
  if (contract === 'desktop.recent') {
    return (data.files || []).map((f) => ({ label: f.name, sub: ago(f.mtimeMs) }));
  }
  if (contract === 'fences.summary') {
    return (data.fences || []).map((f) => ({ label: f.label, sub: f.count + ' 个' }));
  }
  if (contract === 'oplog.last') {
    return data.at
      ? [{ label: data.undone ? '最近一次已撤销' : '最近一次整理', sub: data.moved + ' 个文件' }]
      : [{ label: '还没有整理记录', sub: '' }];
  }
  return [];
}

function metricFor(contract, data) {
  if (!data) return { value: '-', cap: '数据源不可用' };
  if (contract === 'tasks.today') return { value: (data || []).length, cap: '今日待处理计划项' };
  if (contract === 'agents.running') return { value: (data || []).length, cap: '运行中的智能体' };
  if (contract === 'conversations.recent') return { value: (data || []).length, cap: '最近会话' };
  if (contract === 'desktop.recent') return { value: (data.files || []).length, cap: '桌面文件（最近）' };
  if (contract === 'fences.summary') {
    const total = (data.fences || []).reduce((a, f) => a + f.count, 0);
    return { value: total, cap: '围栏内文件' };
  }
  if (contract === 'oplog.last') return { value: data.moved || 0, cap: data.at ? '最近一次整理' : '暂无记录' };
  return { value: '-', cap: '' };
}

/** 把窗口挪到 rect（只覆盖内容，绝不整屏遮挡） */
function fitWindow(rect) {
  if (!api || !api.pluginWindow || !S.windowId) return;
  const cur = S.rect;
  if (cur && Math.abs(cur.x - rect.x) <= 2 && Math.abs(cur.y - rect.y) <= 2
    && Math.abs(cur.w - rect.w) <= 2 && Math.abs(cur.h - rect.h) <= 2) return;
  S.rect = { ...rect };
  api.pluginWindow.update(S.windowId, { rect }).catch(() => {});
}

function buildWidgetEl(w, left, top) {
  const el = document.createElement('div');
  el.className = 'widget ' + w.type + (['todos', 'memo', 'folder'].includes(w.type) ? ' interactive' : '');
  el.dataset.id = w.id;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = w.pos.w + 'px';
  el.style.height = w.pos.h + 'px';
  el.appendChild(buildBody(w));
  if (SINGLE) bindDrag(el, w);
  return el;
}

/* ---------------- 拖动组件 = 移动它自己的窗口 ---------------- */

// 交互控件（勾选/输入/按钮/链接/文件夹行）不参与拖动，按在卡片其余位置即可拖。
const INTERACTIVE = 'input, textarea, button, select, a, .link, .fr, .cb';

function bindDrag(el, w) {
  let drag = null;
  let raf = null;
  let pending = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest(INTERACTIVE)) return;
    raiseSelf();
    const win = S.rect || { x: w.pos.x, y: w.pos.y, w: w.pos.w, h: w.pos.h };
    drag = {
      id: e.pointerId, sx: e.screenX, sy: e.screenY,
      x: win.x, y: win.y, w: win.w, h: win.h, moved: false, nx: win.x, ny: win.y,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.screenX - drag.sx;
    const dy = e.screenY - drag.sy;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    drag.moved = true;
    S.dragging = true;
    drag.nx = snap8(drag.x + dx);
    drag.ny = snap8(drag.y + dy);
    pending = { x: drag.nx, y: drag.ny, w: drag.w, h: drag.h };
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const r = pending;
      pending = null;
      if (!r || !api || !api.pluginWindow || !S.windowId) return;
      S.rect = { ...r };
      api.pluginWindow.update(S.windowId, { rect: r }).catch(() => {});
    });
  });

  const end = async (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    S.dragging = false;
    try { el.releasePointerCapture(d.id); } catch { /* ignore */ }
    if (!d.moved) return;
    S.rect = { x: d.nx, y: d.ny, w: d.w, h: d.h };
    await saveWidgetPos(w.id, d.nx, d.ny);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** 把新位置写回 /widgets（整体替换语义：先取最新再改自己那一条） */
async function saveWidgetPos(id, x, y) {
  try {
    const data = await request('/widgets');
    const list = (data.widgets || []).map((it) => (
      it.id === id ? { ...it, pos: { ...it.pos, x, y } } : it
    ));
    await request('/widgets', {
      method: 'PUT',
      body: JSON.stringify({ widgets: list, bounds: { w: window.screen.width, h: window.screen.height } }),
    });
  } catch (err) {
    flashToast('位置没保存：' + (err && err.message ? err.message : err));
  }
}

function flashToast(msg) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function render() {
  // 拖动中重建 DOM 会丢 pointer capture（卡片会「脱手」），先跳过；松手后下一次 render 补齐
  if (S.dragging) return;
  const layer = document.getElementById('layer');
  layer.textContent = '';

  if (!S.widgets.length) {
    const hint = document.createElement('div');
    hint.className = 'widget empty';
    hint.style.left = '0px';
    hint.style.top = '0px';
    hint.style.width = '300px';
    hint.style.height = '80px';
    hint.textContent = LAYER === 'overlay' ? '暂无悬浮层组件' : '暂无桌面层组件·可用智能体或工具条生成';
    layer.appendChild(hint);
    fitWindow({ x: 40, y: 40, w: 320, h: 110 });
    return;
  }

  // 单组件窗口：窗口 = 组件的 pos，卡片铺满窗口
  if (SINGLE) {
    const w = S.widgets[0];
    layer.appendChild(buildWidgetEl(w, 0, 0));
    fitWindow({ x: w.pos.x, y: w.pos.y, w: w.pos.w, h: w.pos.h });
    return;
  }

  // 整层一窗（悬浮层）：缩到组件包围盒，坐标整体平移 —— 否则透明窗口照样吃掉整屏点击
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const w of S.widgets) {
    minX = Math.min(minX, w.pos.x);
    minY = Math.min(minY, w.pos.y);
    maxX = Math.max(maxX, w.pos.x + w.pos.w);
    maxY = Math.max(maxY, w.pos.y + w.pos.h);
  }
  for (const w of S.widgets) layer.appendChild(buildWidgetEl(w, w.pos.x - minX, w.pos.y - minY));
  fitWindow({ x: minX, y: minY, w: Math.max(80, maxX - minX), h: Math.max(60, maxY - minY) });
}

function buildBody(w) {
  const data = dataOf(w);
  const box = document.createElement('div');

  if (w.type === 'weather') return weatherBody(box, w, data);
  if (w.type === 'todos') return todosBody(box, w, data);
  if (w.type === 'memo') return memoBody(box, w, data);
  if (w.type === 'folder') return folderBody(box, w, data);

  if (w.type === 'clock') {
    const hm = document.createElement('div');
    hm.className = 'hm';
    const dt = document.createElement('div');
    dt.className = 'dt';
    const tick = () => {
      const d = new Date();
      hm.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      dt.textContent = String(d.getFullYear()) + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · '
        + ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    };
    tick();
    setInterval(tick, 15000);
    box.append(hm, dt);
    return box;
  }

  if (w.type === 'text') {
    const t = document.createElement('div');
    t.className = 'text ' + (w.config.size || 'm');
    t.textContent = w.config.text || '';
    box.appendChild(t);
    return box;
  }

  if (w.type === 'link') {
    const a = document.createElement('div');
    a.className = 'link';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '🔗';
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = w.config.label || '打开';
    a.append(ic, lb);
    a.addEventListener('click', () => {
      if (api && api.desktopShell && w.config.path) api.desktopShell.openPath(w.config.path).catch(() => {});
    });
    box.appendChild(a);
    return box;
  }

  if (w.config && w.config.title) {
    const title = document.createElement('div');
    title.className = 'wt';
    title.textContent = w.config.title;
    box.appendChild(title);
  }

  if (w.type === 'metric') {
    const m = metricFor(w.source && w.source.contract, data);
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = String(m.value) + (w.config.unit || '');
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = w.config.label || m.cap;
    box.append(big, cap);
    return box;
  }

  if (w.type === 'status') {
    const rows = rowsFor(w.source && w.source.contract, data).slice(0, w.config.max || 5);
    const wrap = document.createElement('div');
    wrap.className = 'status';
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'st';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = COLORS[i % COLORS.length];
      dot.style.boxShadow = '0 0 8px ' + COLORS[i % COLORS.length];
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = r.label;
      const pg = document.createElement('span');
      pg.className = 'pg';
      pg.textContent = r.sub;
      row.append(dot, nm, pg);
      wrap.appendChild(row);
    });
    if (!rows.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '暂无数据';
      wrap.appendChild(e);
    }
    box.appendChild(wrap);
    return box;
  }

  // list（默认）
  const ul = document.createElement('ul');
  ul.className = 'rows';
  const rows = rowsFor(w.source && w.source.contract, data).slice(0, w.config.max || 6);
  rows.forEach((r) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = r.label;
    const s = document.createElement('span');
    s.className = 's';
    s.textContent = r.sub;
    li.append(n, s);
    ul.appendChild(li);
  });
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '暂无数据';
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

/* ---------------- 天气 / 待办 ---------------- */

function weatherBody(box, w, data) {
  const title = document.createElement('div');
  title.className = 'wt';
  title.textContent = w.config.title || '天气';
  box.appendChild(title);

  if (!data || data.temp === null || data.temp === undefined) {
    const err = document.createElement('div');
    err.className = 'wx-err';
    err.textContent = '天气取不到：设置页填个城市（Open-Meteo，无需 key）后稍等重试';
    box.appendChild(err);
    return box;
  }

  const top = document.createElement('div');
  top.className = 'wx-top';
  const ic = document.createElement('span');
  ic.className = 'wx-ic';
  ic.textContent = data.icon || '🌡';
  const temp = document.createElement('div');
  temp.className = 'wx-temp';
  temp.textContent = data.temp === null ? '--' : String(data.temp);
  const unit = document.createElement('small');
  unit.textContent = '°C';
  temp.appendChild(unit);
  const desc = document.createElement('div');
  desc.className = 'wx-desc';
  desc.textContent = `${data.text || ''}`;
  const city = document.createElement('div');
  city.textContent = data.city || '';
  desc.appendChild(city);
  top.append(ic, temp, desc);

  const meta = document.createElement('div');
  meta.className = 'wx-meta';
  meta.textContent = [
    data.feels !== null ? `体感 ${data.feels}°` : '',
    data.humidity ? `湿度 ${data.humidity}%` : '',
    data.wind !== null ? `风 ${data.wind}km/h` : '',
  ].filter(Boolean).join(' · ');

  box.append(top, meta);

  const days = (data.days || []).slice(0, Math.max(1, w.config.days || 2));
  if (days.length) {
    const wrap = document.createElement('div');
    wrap.className = 'wx-days';
    for (const d of days) {
      const cell = document.createElement('div');
      cell.className = 'wx-day';
      const lbl = document.createElement('div');
      lbl.className = 'd';
      lbl.textContent = d.label || d.date;
      const di = document.createElement('div');
      di.className = 'i';
      di.textContent = d.icon || '';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = `${Math.round(d.max)}° / ${Math.round(d.min)}°`;
      cell.append(lbl, di, t);
      wrap.appendChild(cell);
    }
    box.appendChild(wrap);
  }
  return box;
}

function hhmm(ms) {
  const d = new Date(Number(ms) || 0);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** 快速添加里支持「写周报 17:30」这种尾巴时间；今天已经过了就顺延到明天 */
function parseQuickAdd(raw) {
  const text = String(raw || '').trim();
  const m = /^(.*?)[\s　]+(\d{1,2})\s*[:：]\s*(\d{2})$/.exec(text);
  if (!m) return { text, startAt: 0 };
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 23 || min > 59) return { text, startAt: 0 };
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return { text: m[1].trim() || text, startAt: d.getTime() };
}

function todosBody(box, w, data) {
  const title = document.createElement('div');
  title.className = 'wt';
  const items = ((data && data.items) || []);
  const undone = items.filter((t) => !t.done).length;
  title.textContent = (w.config.title || '待办') + (undone ? ` · ${undone}` : '');
  box.appendChild(title);

  const list = document.createElement('div');
  list.className = 'todos';
  const shown = items.slice(0, Math.max(1, w.config.max || 6));

  for (const t of shown) {
    const row = document.createElement('div');
    row.className = 'td' + (t.done ? ' done' : '');
    const cb = document.createElement('span');
    cb.className = 'cb';
    cb.textContent = t.done ? '✓' : '';
    const tx = document.createElement('span');
    tx.className = 'tx';
    tx.textContent = t.text;
    tx.title = t.text;
    const tm = document.createElement('span');
    tm.className = 'tm';
    tm.textContent = t.startAt ? hhmm(t.startAt) : '';
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await request('/todos/' + encodeURIComponent(t.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: !t.done }),
        });
        await loadData();
        render();
      } catch { /* 勾选失败保持原样 */ }
    });
    row.append(cb, tx, tm);
    list.appendChild(row);
  }
  if (!shown.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '今天没有待办';
    list.appendChild(e);
  }

  const add = document.createElement('div');
  add.className = 'add';
  const input = document.createElement('input');
  input.placeholder = '加一条，如：写周报 17:30';
  input.maxLength = 120;
  const btn = document.createElement('button');
  btn.textContent = '添加';
  const submit = async () => {
    const { text, startAt } = parseQuickAdd(input.value);
    if (!text) return;
    input.value = '';
    try {
      await request('/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, startAt }),
      });
      await loadData();
      render();
    } catch { /* 失败保留输入 */ input.value = text; }
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); void submit(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
  });
  add.append(input, btn);
  list.appendChild(add);
  box.appendChild(list);
  return box;
}

/* ---------------- 备忘录 / 文件夹块 ---------------- */

function memoBody(box, w, data) {
  const title = document.createElement('div');
  title.className = 'wt';
  title.textContent = w.config.title || '备忘录';
  box.appendChild(title);

  const ta = document.createElement('textarea');
  ta.className = 'memo-ta ' + (w.config.size || 'm');
  ta.value = (data && data.text) || '';
  ta.placeholder = '写点什么…（失焦自动保存）';
  let timer = 0;
  const save = async () => {
    clearTimeout(timer);
    try {
      await request('/memo/' + encodeURIComponent(w.id), {
        method: 'PUT',
        body: JSON.stringify({ text: ta.value }),
      });
      if (data) data.text = ta.value;
    } catch { /* 保存失败保留内容：下次失真再试 */ }
  };
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  });
  ta.addEventListener('blur', () => { void save(); });
  ta.addEventListener('mousedown', (e) => e.stopPropagation());
  box.appendChild(ta);
  return box;
}

function folderBody(box, w, data) {
  const title = document.createElement('div');
  title.className = 'wt';
  title.textContent = w.config.title || (data && data.rel) || '文件夹';
  box.appendChild(title);

  if (!data) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '没绑定文件夹：把组件配置 rel 填成桌面上的文件夹名（如 文档）';
    box.appendChild(e);
    return box;
  }

  const list = document.createElement('div');
  list.className = 'fold';
  const items = (data.items || []).slice(0, Math.max(1, w.config.max || 8));
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'fr';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = it.isDir ? '📁' : '📄';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = it.name;
    nm.title = it.name;
    row.append(ic, nm);
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (api && api.desktopShell && api.desktopShell.openPath) {
        api.desktopShell.openPath(it.path).catch(() => {});
      }
    });
    list.appendChild(row);
  }
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '文件夹是空的';
    list.appendChild(e);
  }
  box.appendChild(list);

  const foot = document.createElement('div');
  foot.className = 'cap';
  foot.textContent = `共 ${data.total || 0} 项` + ((data.total || 0) > items.length ? ' · 只显示前几项' : '');
  box.appendChild(foot);
  return box;
}

/* ---------------- 生命周期 ---------------- */

let lastRaise = 0;
function raiseSelf() {
  if (!api || !api.pluginWindow || !S.windowId) return;
  if (typeof api.pluginWindow.raise !== 'function') return;
  // 每次点击都重钉一次太贵（要起一次 Win32 助手），600ms 内只提一次
  const now = Date.now();
  if (now - lastRaise < 600) return;
  lastRaise = now;
  api.pluginWindow.raise(S.windowId).catch(() => {});
}

async function boot() {
  if (DEMO) {
    document.body.classList.add('demo');
    await loadWidgets();
    return;
  }
  if (api && api.pluginWindow) {
    try {
      const list = await api.pluginWindow.list();
      // 只认自己这个入口：一个组件一个窗口，退回「随便挑一个桌面窗口」会把别人挪走
      const mine = list.find((w) => w.pluginId === 'desktop-manager' && w.entry === SELF_ENTRY);
      if (mine) { S.windowId = mine.windowId; S.rect = mine.rect || null; }
    } catch { /* ignore */ }
  }
  // 覆盖到的组件窗口被点一下就先提到最前（独立窗口之间没有父子层级，靠置顶解决遮挡）
  document.addEventListener('pointerdown', raiseSelf, true);

  await loadWidgets().catch(() => {});
  // 组件定义变了（rev）→ 重载；契约数据 30s 刷一次
  setInterval(async () => {
    try {
      const { rev } = await request('/rev');
      if (Number(rev) !== S.rev) await loadWidgets();
    } catch { /* 后端重启中 */ }
  }, 2000);
  setInterval(() => { loadData().then(render).catch(() => {}); }, 30000);
}

boot();
