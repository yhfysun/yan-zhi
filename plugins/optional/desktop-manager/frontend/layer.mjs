// 桌面层（单窗口）：整屏一块透明窗口，所有分组/组件画在同一个 DOM 里。
//
// 为什么不再「一个分组一个窗口」：
//   · 每个 Electron 窗口是一个独立渲染进程，6 组 + 3 组件 ≈ 9 份 Chromium（~400MB）
//   · 跨分组拖拽在两个窗口之间传不了 dataTransfer，只能右键「移入」
//   · 每个窗口各拉一遍 /state、各建一份图标缓存，空闲也在跑
// 现在由主进程按光标位置切穿透（pluginWindow.setHotspots），空白桌面照常归系统。
//
// 数据：首帧拉 /state，之后只问 /rev；变了才拉全量 → 没变化就零渲染。
const API_BASE = (window.electronAPI && window.electronAPI.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const api = window.electronAPI || null;

const qs = new URLSearchParams(location.search);
const DEMO = qs.get('demo') === '1';
const SELF_ENTRY = 'frontend/layer.html';

const S = {
  windowId: null,
  rev: -1,
  fences: [],
  items: [],
  sel: new Set(),
  cards: new Map(),      // fenceId -> { el, grid, items: Map(path -> node), sig }
  dragging: null,
  resizing: null,
  moving: null,
  plan: null,
  modes: { files: true, layout: true, neat: true },
  busy: false,
  last: null,
};

const EMOJI = {
  png: '🖼', jpg: '🖼', jpeg: '🖼', webp: '🖼', gif: '🖼', bmp: '🖼', svg: '🖼',
  pdf: '📕', doc: '📄', docx: '📄', txt: '📄', md: '📄', ppt: '📽', pptx: '📽',
  xls: '📊', xlsx: '📊', csv: '📊', zip: '🗜', rar: '🗜', '7z': '🗜',
  exe: '📦', msi: '📦', mp4: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
};
const extOf = (name) => String(name || '').split('.').pop().toLowerCase();
const $ = (s, r = document) => r.querySelector(s);

/* ---------------- 数据 ---------------- */

async function request(path, opts) {
  const r = await fetch(API_BASE + PLUGIN + path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data;
}

const DEMO_DATA = () => ({
  rev: 1,
  fences: [
    { id: 'apps', label: '应用', color: '#5b8cff', rect: { x: 40, y: 76, w: 400, h: 320 } },
    { id: 'docs', label: '文档', color: '#f0a03c', rect: { x: 40, y: 412, w: 400, h: 220 } },
    { id: 'pics', label: '图片', color: '#37c98b', rect: { x: 460, y: 76, w: 360, h: 320 } },
  ],
  items: [
    ...['Chrome', 'VS Code', '网易云音乐', '微信', 'Figma', 'Obsidian'].map((n) => ({ name: n, path: '/demo/' + n, rel: n, isDir: false, fenceId: 'apps' })),
    ...['季度复盘.docx', '预算表.xlsx', '合同.pdf', '需求.md'].map((n) => ({ name: n, path: '/demo/' + n, rel: n, isDir: false, fenceId: 'docs' })),
    ...['截图1.png', '设计稿.png', '壁纸.jpg'].map((n) => ({ name: n, path: '/demo/' + n, rel: n, isDir: false, fenceId: 'pics' })),
  ],
});

async function refresh(force) {
  if (DEMO) {
    if (S.rev < 0) {
      const d = DEMO_DATA();
      applyState(d.fences, d.items, d.rev);
    }
    return;
  }
  if (!force) {
    try {
      const { rev } = await request('/rev');
      if (rev === S.rev) return;   // 没变化 → 一个 DOM 都不碰
    } catch { return; }
  }
  const d = await request('/state');
  applyState(d.fences || [], d.items || [], d.rev);
}

function applyState(fences, items, rev) {
  S.fences = fences;
  S.items = items;
  S.rev = rev;
  renderCards();
  reportHotspots();
}

const itemsOf = (id) => S.items.filter((i) => i.fenceId === id);

/** 空分组不占桌面：「待归类」和用户手动建的分组（pinned）除外，空着也看得见才好往里放东西 */
function visibleFences() {
  const counts = new Map();
  for (const it of S.items) counts.set(it.fenceId, (counts.get(it.fenceId) || 0) + 1);
  return S.fences.filter((f) => (counts.get(f.id) || 0) > 0 || f.id === 'inbox' || f.pinned);
}

/* ---------------- 渲染 ---------------- */

function renderCards() {
  const host = $('#cards');
  const alive = new Set();

  for (const f of visibleFences()) {
    alive.add(f.id);
    let rec = S.cards.get(f.id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.fence = f.id;
      el.innerHTML = '<div class="head" data-head><span class="dot"></span><span class="name"></span>'
        + '<span class="badge portal" hidden>传送门</span>'
        + '<span class="badge pin" hidden>置顶</span><span class="badge lock" hidden>已锁定</span>'
        + '<span class="count"></span><span class="sp"></span>'
        + '<button class="act fold" data-act="fold" title="折叠 / 展开">⌃</button>'
        + '<button class="act" data-act="menu" title="分组菜单">⋯</button></div>'
        + '<div class="grid" data-grid></div><div class="grip"></div>';
      host.appendChild(el);
      rec = { el, grid: el.querySelector('[data-grid]'), items: new Map(), sig: '' };
      S.cards.set(f.id, rec);
      bindCard(rec, f);
    }
    paintCard(rec, f);
  }

  for (const [id, rec] of [...S.cards]) {
    if (alive.has(id)) continue;
    rec.el.remove();
    S.cards.delete(id);
  }
}

function paintCard(rec, f) {
  const r = f.rect || {};
  const el = rec.el;
  const h = f.collapsed ? 34 : Math.max(120, r.h || 320);
  el.style.setProperty('--x', Math.round(r.x || 40) + 'px');
  el.style.setProperty('--y', Math.round(r.y || 40) + 'px');
  el.style.setProperty('--w', Math.max(160, Math.round(r.w || 400)) + 'px');
  el.style.setProperty('--h', h + 'px');
  el.style.setProperty('--full-h', Math.max(120, r.h || 320) + 'px');
  el.classList.toggle('rolled', !!f.collapsed);
  el.classList.toggle('locked', !!f.locked);
  el.querySelector('.dot').style.background = f.color || '#8ea3c4';
  el.querySelector('.name').textContent = f.label;
  el.querySelector('.badge.pin').hidden = !f.pinned;
  el.querySelector('.badge.lock').hidden = !f.locked;
  const portalBadge = el.querySelector('.badge.portal');
  portalBadge.hidden = !f.portal;
  if (f.portal) portalBadge.title = f.portal;
  paintItems(rec, f);
}

function paintItems(rec, f) {
  const list = itemsOf(f.id);
  const sig = list.map((i) => i.path).join('|');
  rec.el.querySelector('.count').textContent = list.length ? String(list.length) : '';
  if (sig === rec.sig) return;
  rec.sig = sig;
  rec.grid.textContent = '';
  rec.items.clear();
  for (const it of list) {
    const node = itemNode(it);
    rec.grid.appendChild(node);
    rec.items.set(it.path, node);
  }
}

function itemNode(it) {
  const el = document.createElement('div');
  el.className = 'ic';
  el.dataset.path = it.path;
  const art = document.createElement('div');
  art.className = 'art';
  art.textContent = it.isDir ? '📁' : (EMOJI[extOf(it.name)] || '📄');
  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = it.name;
  nm.title = it.rel || it.name;
  el.append(art, nm);
  paintIcon(art, it);
  return el;
}

const iconCache = new Map();
/** 这些类型优先向系统要缩略图；拿不到再回落文件图标 */
const THUMB_EXT = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic',
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'pdf',
]);

function paintIcon(host, it) {
  if (DEMO || !api || !api.desktopShell || !api.desktopShell.fileIcon) return;
  const key = it.path + '|' + (it.mtimeMs || 0) + '|' + (it.isDir ? 'd' : 'f');
  const put = (url) => {
    host.textContent = '';
    const img = document.createElement('img');
    img.src = url;
    host.appendChild(img);
  };
  const hit = iconCache.get(key);
  if (hit) { put(hit); return; }
  const ext = String(it.name || '').split('.').pop().toLowerCase();
  const wantThumb = !it.isDir && THUMB_EXT.has(ext) && typeof api.desktopShell.thumb === 'function';
  const first = wantThumb
    ? api.desktopShell.thumb(it.path, 96).then((r) => (r && r.ok && r.dataUrl ? r.dataUrl : null)).catch(() => null)
    : Promise.resolve(null);
  first
    .then((url) => (url ? url : api.desktopShell.fileIcon(it.path).then((r) => (r && r.ok ? r.dataUrl : null))))
    .then((url) => {
      if (!url) return;
      iconCache.set(key, url);
      put(url);
    })
    .catch(() => {});
}

/* ---------------- 命中测试热区 ---------------- */

let rafHot = 0;
function reportHotspots() {
  if (!api || !api.pluginWindow || !api.pluginWindow.setHotspots || !S.windowId) return;
  if (rafHot) return;
  rafHot = requestAnimationFrame(() => {
    rafHot = 0;
    const rects = [];
    for (const rec of S.cards.values()) {
      const r = rec.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    const m = $('#menu');
    if (m.classList.contains('on')) {
      const r = m.getBoundingClientRect();
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    const org = $('#org');
    if (org.classList.contains('on')) {
      const r = org.getBoundingClientRect();
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    const corner = $('#corner');
    if (corner) {
      const r = corner.getBoundingClientRect();
      rects.push({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 });
    }
    api.pluginWindow.setHotspots(S.windowId, rects).catch(() => {});
  });
}

function suspendHit(on) {
  if (!api || !api.pluginWindow || !api.pluginWindow.suspendHitTest || !S.windowId) return;
  api.pluginWindow.suspendHitTest(S.windowId, on).catch(() => {});
}

/* ---------------- 卡片交互 ---------------- */

function bindCard(rec, f) {
  const el = rec.el;
  const head = el.querySelector('[data-head]');

  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || e.target.closest('input')) return;
    if (f.locked) { toast('「' + f.label + '」已锁定，拖不动；右键解锁后才能移动'); return; }
    const base = { ...(f.rect || {}) };
    S.moving = { fence: f, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, base, next: null, moved: false };
    el.classList.add('dragging');
    el.style.zIndex = 30;
    suspendHit(true);
    try { head.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });

  head.addEventListener('pointermove', (e) => {
    const m = S.moving;
    if (!m || e.pointerId !== m.id) return;
    const dx = e.clientX - m.sx;
    const dy = e.clientY - m.sy;
    if (!m.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    m.moved = true;
    const x = m.base.x + dx;
    const y = m.base.y + dy;
    el.style.setProperty('--x', Math.round(x) + 'px');
    el.style.setProperty('--y', Math.round(y) + 'px');
    m.next = { x: Math.round(x), y: Math.round(y) };
    showGuides(f, m.next);
  });

  const endMove = async (e) => {
    const m = S.moving;
    if (!m || (e && e.pointerId !== m.id)) return;
    S.moving = null;
    el.classList.remove('dragging');
    el.style.zIndex = '';
    showGuides(null);
    suspendHit(false);
    try { head.releasePointerCapture(m.id); } catch { /* ignore */ }
    if (!m.moved || !m.next) return;
    f.rect = { ...f.rect, x: m.next.x, y: m.next.y };
    await patchFence(f.id, { rect: f.rect }).catch((err) => toast('保存位置失败：' + err.message));
    reportHotspots();
  };
  head.addEventListener('pointerup', endMove);
  head.addEventListener('pointercancel', endMove);

  head.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    toggleCollapse(f);
  });

  el.querySelector('.act[data-act="fold"]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCollapse(f);
  });
  el.querySelector('.act[data-act="menu"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openCardMenu(f, r.right - 6, r.bottom + 4);
  });

  const grip = el.querySelector('.grip');
  grip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    S.resizing = { fence: f, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, base: { ...(f.rect || {}) } };
    suspendHit(true);
    try { grip.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    const r = S.resizing;
    if (!r || e.pointerId !== r.id) return;
    const w = Math.max(240, r.base.w + (e.clientX - r.sx));
    const h = Math.max(120, r.base.h + (e.clientY - r.sy));
    r.next = { w: Math.round(w), h: Math.round(h) };
    r.el.style.setProperty('--w', r.next.w + 'px');
    r.el.style.setProperty('--h', r.next.h + 'px');
    r.el.style.setProperty('--full-h', r.next.h + 'px');
  });
  grip.addEventListener('pointerup', async (e) => {
    const r = S.resizing;
    if (!r || e.pointerId !== r.id) return;
    S.resizing = null;
    suspendHit(false);
    if (!r.next) return;
    r.fence.rect = { ...r.fence.rect, ...r.next };
    await patchFence(r.fence.id, { rect: r.fence.rect }).catch(() => {});
    reportHotspots();
  });
}

function showGuides(f, next) {
  const gv = $('#gv');
  const gh = $('#gh');
  if (!f || !next) {
    gv.style.display = 'none';
    gh.style.display = 'none';
    return;
  }
  const SNAP = 7;
  let vx = null;
  let hy = null;
  for (const o of S.fences) {
    if (o.id === f.id) continue;
    const r = o.rect || {};
    if (Math.abs(next.x - r.x) < SNAP) { next.x = r.x; vx = r.x; }
    else if (Math.abs(next.x + f.rect.w - (r.x + r.w)) < SNAP) { next.x = r.x + r.w - f.rect.w; vx = r.x + r.w; }
    if (Math.abs(next.y - r.y) < SNAP) { next.y = r.y; hy = r.y; }
    else if (Math.abs(next.y + f.rect.h - (r.y + r.h)) < SNAP) { next.y = r.y + r.h - f.rect.h; hy = r.y + r.h; }
  }
  if (Math.abs(next.x - 40) < SNAP) { next.x = 40; vx = 40; }
  if (Math.abs(next.y - 40) < SNAP) { next.y = 40; hy = 40; }
  gv.style.display = vx == null ? 'none' : 'block';
  gh.style.display = hy == null ? 'none' : 'block';
  if (vx != null) gv.style.left = vx + 'px';
  if (hy != null) gh.style.top = hy + 'px';
  const el = S.cards.get(f.id);
  if (el) {
    el.el.style.setProperty('--x', next.x + 'px');
    el.el.style.setProperty('--y', next.y + 'px');
  }
}

async function patchFence(id, patch) {
  if (DEMO) return;
  await request('/fences/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) });
}

async function toggleCollapse(f) {
  f.collapsed = !f.collapsed;
  const rec = S.cards.get(f.id);
  if (rec) paintCard(rec, f);
  reportHotspots();
  await patchFence(f.id, { collapsed: f.collapsed }).catch(() => {});
}

/* ---------------- 图标拖拽（同一 DOM，跨分组天然可用） ---------------- */

function cardAt(x, y, exceptId) {
  for (const [id, rec] of S.cards) {
    if (id === exceptId) continue;
    const r = rec.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { id, rec };
  }
  return null;
}

document.addEventListener('pointerdown', (e) => {
  ensureFocus();
  const node = e.target.closest('.ic');
  if (!node || e.button !== 0) return;
  const card = node.closest('.card');
  const fence = S.fences.find((f) => f.id === card.dataset.fence);
  const item = S.items.find((i) => i.path === node.dataset.path);
  if (!fence || !item) return;
  S.last = item;
  S.dragging = { node, fence, item, sx: e.clientX, sy: e.clientY, moved: false, target: null, slot: null, index: -1 };
  if (!e.ctrlKey) clearSel();
  select(node, true);
}, true);

/** 桌面层是 Progman 的子窗口，点进来不一定被激活 —— 要键盘操作前先要一次焦点 */
function ensureFocus() {
  if (!S.windowId || !api || !api.pluginWindow || typeof api.pluginWindow.focus !== 'function') return;
  if (document.hasFocus()) return;
  api.pluginWindow.focus(S.windowId).catch(() => {});
}

document.addEventListener('pointermove', (e) => {
  const d = S.dragging;
  if (!d) return;
  if (!d.moved) {
    if (Math.abs(e.clientX - d.sx) < 4 && Math.abs(e.clientY - d.sy) < 4) return;
    d.moved = true;
    suspendHit(true);
    const g = $('#ghost');
    g.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'g';
    wrap.appendChild(d.node.querySelector('.art').cloneNode(true));
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.style.cssText = 'font-size:11px;text-align:center;max-width:80px;color:#fff';
    nm.textContent = d.item.name;
    wrap.appendChild(nm);
    g.appendChild(wrap);
    g.classList.add('on');
    d.node.classList.add('dim');
    document.body.style.cursor = 'grabbing';
  }
  const g = $('#ghost');
  g.style.left = e.clientX + 'px';
  g.style.top = e.clientY + 'px';
  g.style.transform = 'translate(-50%,-46%)';

  document.querySelectorAll('.card.drop').forEach((n) => n.classList.remove('drop'));
  if (d.slot) { d.slot.remove(); d.slot = null; }
  const hit = cardAt(e.clientX, e.clientY, null);
  if (!hit || hit.id === d.fence.id) { d.target = null; return; }
  d.target = hit.id;
  hit.rec.el.classList.add('drop');
  const idx = insertIndex(hit.rec.grid, e.clientX, e.clientY);
  const kids = [...hit.rec.grid.querySelectorAll('.ic')];
  const slot = document.createElement('div');
  slot.className = 'slot';
  if (idx >= kids.length) hit.rec.grid.appendChild(slot);
  else hit.rec.grid.insertBefore(slot, kids[idx]);
  d.slot = slot;
  d.index = idx;
}, true);

document.addEventListener('pointerup', (e) => {
  const d = S.dragging;
  if (!d) return;
  S.dragging = null;
  $('#ghost').classList.remove('on');
  document.body.style.cursor = '';
  if (d.node) d.node.classList.remove('dim');
  document.querySelectorAll('.card.drop').forEach((n) => n.classList.remove('drop'));
  if (d.slot) { d.slot.remove(); d.slot = null; }
  if (!d.moved) return;
  suspendHit(false);
  if (!d.target) {
    const inside = cardAt(e.clientX, e.clientY, null);
    if (!inside) toast('拖出分组 = 移出到桌面（真实实现会移动文件）');
    return;
  }
  assign(d.item.name, d.target).catch((err) => toast('移动失败：' + err.message));
}, true);

function insertIndex(grid, x, y) {
  const items = [...grid.querySelectorAll('.ic')];
  if (!items.length) return 0;
  let best = 0;
  let bestD = Infinity;
  items.forEach((n, i) => {
    const r = n.getBoundingClientRect();
    const d = (x - (r.left + r.width / 2)) ** 2 + (y - (r.top + r.height / 2)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  const r = items[best].getBoundingClientRect();
  return best + (x > r.left + r.width / 2 ? 1 : 0);
}

async function assign(name, fenceId) {
  if (DEMO) {
    const it = S.items.find((i) => i.name === name);
    if (it) { it.fenceId = fenceId; renderCards(); reportHotspots(); }
    toast('已移入（演示）');
    return;
  }
  await request('/assign', { method: 'POST', body: JSON.stringify({ name, fenceId }) });
  await refresh(true);
}

/* ---------------- 选中 ---------------- */

function select(node, on) {
  if (on) { S.sel.add(node.dataset.path); node.classList.add('selection'); }
  else { S.sel.delete(node.dataset.path); node.classList.remove('selection'); }
}
function clearSel() {
  S.sel.clear();
  document.querySelectorAll('.ic.selection').forEach((n) => n.classList.remove('selection'));
}

/* ---------------- 右键菜单 ---------------- */

function closeMenu() {
  const m = $('#menu');
  m.classList.remove('on');
  m.innerHTML = '';
  reportHotspots();
}

function showMenu(x, y, rows) {
  const m = $('#menu');
  m.innerHTML = '';
  for (const row of rows) {
    if (row === '-') { const s = document.createElement('div'); s.className = 'sep'; m.appendChild(s); continue; }
    if (row.header) { const h = document.createElement('div'); h.className = 'hd'; h.textContent = row.header; m.appendChild(h); continue; }
    const it = document.createElement('div');
    it.className = 'mi';
    it.appendChild(document.createTextNode(row.label));
    if (row.hint) { const k = document.createElement('span'); k.className = 'k'; k.textContent = row.hint; it.appendChild(k); }
    it.addEventListener('click', () => { closeMenu(); if (row.onClick) row.onClick(); });
    m.appendChild(it);
  }
  m.classList.add('on');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px';
  m.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
  reportHotspots();
}

function openCardMenu(f, x, y) {
  showMenu(x, y, [
    { header: f.label },
    { label: '重命名分组', hint: 'F2', onClick: () => renameCard(f) },
    { label: f.locked ? '解锁位置（可以拖动了）' : '锁定位置（拖不动）', onClick: () => toggleLock(f) },
    '-',
    { label: '一键整理', onClick: () => openOrganize() },
    { label: '删除分组', onClick: () => removeFence(f) },
  ]);
}

function openItemMenu(f, item, x, y) {
  showMenu(x, y, [
    { header: item.name },
    { label: '打开', onClick: () => openItem(item) },
    { label: '重命名', hint: 'F2', onClick: () => renameItem(f, item) },
    { label: '在资源管理器中显示', onClick: () => toast('打开资源管理器并选中') },
    '-',
    { label: '移到回收站', hint: 'Del', onClick: () => { S.sel.clear(); S.sel.add(item.path); trashSelected(); } },
    '-',
    { header: '移入分组' },
    ...S.fences.filter((k) => k.id !== f.id).map((k) => ({ label: '→ ' + k.label, onClick: () => assign(item.name, k.id) })),
  ]);
}

document.addEventListener('contextmenu', (e) => {
  const ic = e.target.closest('.ic');
  const card = e.target.closest('.card');
  if (ic && card) {
    e.preventDefault();
    const f = S.fences.find((x) => x.id === card.dataset.fence);
    const item = S.items.find((i) => i.path === ic.dataset.path);
    if (f && item) openItemMenu(f, item, e.clientX, e.clientY);
    return;
  }
  if (card) {
    e.preventDefault();
    const f = S.fences.find((x) => x.id === card.dataset.fence);
    if (f) openCardMenu(f, e.clientX, e.clientY);
    return;
  }
  // 空白桌面：不接管，让系统菜单出来（窗口此刻是穿透状态）
}, true);

document.addEventListener('pointerdown', (e) => {
  if (!$('#menu').classList.contains('on')) return;
  if (e.target.closest('#menu')) return;
  closeMenu();
}, true);

/* ---------------- 重命名 / 锁定 / 删除 ---------------- */

function renameCard(f) {
  const rec = S.cards.get(f.id);
  if (!rec) return;
  const nameEl = rec.el.querySelector('.head .name');
  const inp = document.createElement('input');
  inp.className = 'rename';
  inp.value = f.label;
  nameEl.replaceWith(inp);
  inp.focus();
  inp.select();
  const done = async (ok) => {
    const v = inp.value.trim();
    const span = document.createElement('span');
    span.className = 'name';
    span.textContent = ok && v ? v : f.label;
    if (inp.isConnected) inp.replaceWith(span);
    if (ok && v && v !== f.label) {
      f.label = v;
      await patchFence(f.id, { label: v }).catch((err) => toast('改名失败：' + err.message));
    }
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  });
  inp.addEventListener('blur', () => done(true));
}

function renameItem(f, item) {
  const rec = S.cards.get(f.id);
  if (!rec) return;
  const node = rec.items.get(item.path);
  if (!node) return;
  const nm = node.querySelector('.nm');
  const inp = document.createElement('input');
  inp.className = 'rename';
  inp.value = item.name;
  inp.style.width = '80px';
  nm.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const finish = async (ok) => {
    if (done) return;
    done = true;
    const v = inp.value.trim();
    const span = document.createElement('div');
    span.className = 'nm';
    span.textContent = item.name;
    if (inp.isConnected) inp.replaceWith(span);
    if (!ok || !v || v === item.name) return;
    try {
      await request('/items/rename', { method: 'POST', body: JSON.stringify({ path: item.path, name: v }) });
      await refresh(true);
      toast('已重命名为「' + v + '」');
    } catch (e) {
      toast('重命名失败：' + e.message);
    }
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('pointerdown', (e) => e.stopPropagation());
}

async function toggleLock(f) {
  f.locked = !f.locked;
  const rec = S.cards.get(f.id);
  if (rec) paintCard(rec, f);
  toast(f.locked ? '「' + f.label + '」已锁定，拖不动了' : '「' + f.label + '」已解锁，可以拖动');
  await patchFence(f.id, { locked: f.locked }).catch(() => {});
}

/** 删除分组：不弹确认框 —— 只取消分组、文件不动，所以直接做，靠提示兜底 */
async function removeFence(f) {
  try {
    await request('/fences/' + encodeURIComponent(f.id), { method: 'DELETE' });
    await refresh(true);
    toast('已删除分组「' + f.label + '」，' + f.items.length + ' 个文件留在桌面');
  } catch (e) {
    toast('删除失败：' + e.message);
  }
}

function openItem(item) {
  if (DEMO) { toast('打开「' + item.name + '」'); return; }
  if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {});
}

/* ---------------- 一键整理 ---------------- */

function orgModes() {
  return { ...S.modes };
}

async function openOrganize() {
  if (DEMO) { toast('演示模式：一键整理需要后端'); return; }
  try {
    const d = await request('/organize/plan', {
      method: 'POST',
      body: JSON.stringify({
        width: Math.round(window.screen.availWidth || 1440),
        height: Math.round(window.screen.availHeight || 900),
        modes: orgModes(),
      }),
    });
    S.plan = d;
    const before = d.layout.before.bottom;
    const after = d.layout.after.bottom;
    $('#orgLayoutInfo').textContent =
      (d.layout.changes.length ? d.layout.changes.length + ' 张卡片会挪位置；' : '位置已经合理；')
      + '占用高度 ' + before + 'px → ' + after + 'px';
    $('#orgLayoutTag').textContent = Math.max(0, before - after) + 'px';
    $('#orgFilesInfo').textContent = d.files
      ? (d.files.total ? d.files.total + ' 个散落文件会归入分组' : '桌面没有需要归类的文件')
      : '未勾选';
    $('#orgFilesTag').textContent = d.files ? '规则' : '';
    refreshOrgRows();
    $('#org').classList.add('on');
    reportHotspots();
  } catch (e) {
    toast('生成方案失败：' + e.message);
  }
}

function refreshOrgRows() {
  document.querySelectorAll('#orgPanel .orow').forEach((row) => {
    const on = !!S.modes[row.dataset.k];
    row.querySelector('.chk').classList.toggle('on', on);
  });
}

function previewPlan() {
  if (!S.plan) return;
  for (const c of S.plan.layout.changes) {
    const rec = S.cards.get(c.id);
    if (!rec) continue;
    rec.el.style.setProperty('--x', c.to.x + 'px');
    rec.el.style.setProperty('--y', c.to.y + 'px');
    rec.el.style.setProperty('--w', c.to.w + 'px');
    rec.el.style.setProperty('--h', c.to.h + 'px');
    rec.el.style.setProperty('--full-h', c.to.h + 'px');
  }
  toast('这是整理后的位置，满意就点「开始整理」');
}

async function applyOrganize() {
  if (!S.plan) return;
  try {
    await request('/organize/apply', {
      method: 'POST',
      body: JSON.stringify({ planId: S.plan.planId, confirmed: true }),
    });
    $('#org').classList.remove('on');
    S.plan = null;
    await refresh(true);
    toast('已整理，可整批撤销');
  } catch (e) {
    toast('执行失败：' + e.message);
  }
}

$('#corner').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'organize') openOrganize();
  if (b.dataset.act === 'portal') createPortal();
  if (b.dataset.act === 'close') {
    if (S.windowId && api && api.pluginWindow) api.pluginWindow.close(S.windowId).catch(() => {});
  }
});

/** 新建文件夹传送门：选一个真实目录，镜像到桌面（文件仍在原处） */
async function createPortal() {
  if (!api || !api.desktopShell || typeof api.desktopShell.pickFolder !== 'function') {
    toast('当前环境不支持选择文件夹');
    return;
  }
  const r = await api.desktopShell.pickFolder();
  if (!r || !r.ok) return;
  const label = String(r.path).split(/[\\/]/).filter(Boolean).pop() || '传送门';
  try {
    await request('/fences', { method: 'POST', body: JSON.stringify({ label, portal: r.path }) });
    await refresh(true);
    toast('已创建传送门「' + label + '」→ ' + r.path);
  } catch (e) {
    toast('创建失败：' + e.message);
  }
}

document.querySelectorAll('#orgPanel .orow').forEach((row) => {
  row.addEventListener('click', () => {
    const k = row.dataset.k;
    S.modes[k] = !S.modes[k];
    refreshOrgRows();
  });
});
$('#orgPanel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.org === 'cancel') { $('#org').classList.remove('on'); reportHotspots(); }
  if (b.dataset.org === 'preview') previewPlan();
  if (b.dataset.org === 'apply') applyOrganize();
});

/* ---------------- 提示 ---------------- */

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2000);
}

/** 删除 = 移到系统回收站（可还原）。没有确认弹窗，删完直接给出结果。 */
async function trashSelected() {
  if (!S.sel.size) return;
  if (!api || !api.desktopShell || typeof api.desktopShell.trash !== 'function') {
    toast('当前环境不支持回收站操作');
    return;
  }
  const paths = [...S.sel];
  S.sel.clear();
  try {
    const r = await api.desktopShell.trash(paths);
    await refresh(true);
    if (r && r.trashed) toast('已移到回收站 ' + r.trashed + ' 项（可从回收站还原）');
    else toast('删除失败：' + ((r && r.failed && r.failed[0] && r.failed[0].error) || '未知原因'));
  } catch (e) {
    toast('删除失败：' + e.message);
  }
}

document.addEventListener('keydown', (e) => {
  if (searchState.open) return;
  if (e.key === 'F2') {
    // 有选中项就重命名它；否则重命名鼠标所在的分组
    if (S.sel.size === 1) {
      const path = [...S.sel][0];
      const item = S.items.find((i) => i.path === path);
      const fence = item && S.fences.find((f) => f.id === item.fenceId);
      if (item && fence) { e.preventDefault(); renameItem(fence, item); return; }
    }
    const hovered = document.querySelector('.card:hover');
    if (hovered) {
      const f = S.fences.find((x) => x.id === hovered.dataset.fence);
      if (f) { e.preventDefault(); renameCard(f); }
    }
    return;
  }
  if (e.key !== 'Delete') return;
  const path = S.sel.size ? [...S.sel][0] : (S.last && S.last.path);
  if (!path) return;
  e.preventDefault();
  if (!S.sel.size) S.sel.add(path);
  trashSelected();
});

/* ---------------- 全桌面搜索 ---------------- */
const searchState = { open: false, q: '', idx: 0, hits: [] };

function openSearch() {
  searchState.open = true;
  searchState.q = '';
  searchState.idx = 0;
  $('#search').classList.add('on');
  $('#searchInput').value = '';
  renderSearchResults();
  setTimeout(() => $('#searchInput').focus(), 20);
  reportHotspots();
}

function closeSearch() {
  searchState.open = false;
  $('#search').classList.remove('on');
  reportHotspots();
}

function renderSearchResults() {
  const q = searchState.q.trim().toLowerCase();
  const box = $('#searchResults');
  box.innerHTML = '';
  const hits = [];
  for (const it of S.items) {
    if (q && !it.name.toLowerCase().includes(q)) continue;
    if (!q && hits.length >= 12) break;
    hits.push(it);
  }
  searchState.hits = hits.slice(0, 50);
  if (searchState.idx >= searchState.hits.length) searchState.idx = 0;
  if (!searchState.hits.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = q ? '没有匹配「' + q + '」的文件' : '输入文件名开始搜索，会同时搜所有分组';
    box.appendChild(e);
    return;
  }
  searchState.hits.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'r' + (i === searchState.idx ? ' act' : '');
    const art = document.createElement('div');
    art.className = 'art';
    art.textContent = it.isDir ? '📁' : (EMOJI[extOf(it.name)] || '📄');
    const t = document.createElement('div');
    t.className = 't';
    const name = it.name;
    if (q) {
      const at = name.toLowerCase().indexOf(q);
      t.append(document.createTextNode(name.slice(0, at)));
      const b = document.createElement('b');
      b.textContent = name.slice(at, at + q.length);
      t.appendChild(b);
      t.append(document.createTextNode(name.slice(at + q.length)));
    } else {
      t.textContent = name;
    }
    const f = document.createElement('div');
    f.className = 'f';
    const fence = S.fences.find((x) => x.id === it.fenceId);
    f.textContent = fence ? fence.label : '';
    row.append(art, t, f);
    row.addEventListener('click', () => activateHit(it));
    box.appendChild(row);
  });
}

/** 选中结果：收起搜索 → 展开所在分组 → 滚动到该项并高亮 pulse 一下 */
async function activateHit(it) {
  closeSearch();
  ensureFocus();
  const fence = S.fences.find((f) => f.id === it.fenceId);
  if (!fence) return;
  if (fence.collapsed) await toggleCollapse(fence);
  const rec = S.cards.get(fence.id);
  const node = rec && rec.items.get(it.path);
  clearSel();
  if (!node) return;
  S.sel.add(it.path);
  node.classList.add('selection');
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  node.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' },
  );
}

$('#searchInput').addEventListener('input', (e) => {
  searchState.q = e.target.value;
  searchState.idx = 0;
  renderSearchResults();
});

$('#searchInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') { closeSearch(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = searchState.hits.length;
    if (!n) return;
    searchState.idx = (searchState.idx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    renderSearchResults();
    const act = $('#searchResults .r.act');
    if (act) act.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    const hit = searchState.hits[searchState.idx];
    if (hit) activateHit(hit);
  }
});

$('#search').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'search') closeSearch();
});

/* `/` 或 Ctrl+F 唤起搜索（在输入框里打字不触发） */
document.addEventListener('keydown', (e) => {
  if (searchState.open) return;
  const tag = (e.target && e.target.tagName) || '';
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    e.preventDefault();
    openSearch();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    openSearch();
  }
}, true);

/* 逃生口：Esc 依次关菜单 → 关面板 → 收掉桌面层窗口（避免全屏层挡住桌面时无法退出） */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || searchState.open) return;
  if ($('#menu').classList.contains('on')) { closeMenu(); return; }
  if ($('#org').classList.contains('on')) { $('#org').classList.remove('on'); reportHotspots(); return; }
  if (S.windowId && api && api.pluginWindow) {
    api.pluginWindow.close(S.windowId).catch(() => {});
  }
});

/* ---------------- 启动 ---------------- */

async function identifyWindow() {
  if (!api || !api.pluginWindow) return;
  try {
    const list = await api.pluginWindow.list();
    const mine = list.find((w) => w.pluginId === 'desktop-manager' && w.entry === SELF_ENTRY);
    if (mine) S.windowId = mine.windowId;
  } catch { /* 主进程重启中 */ }
}

async function boot() {
  await identifyWindow();
  if (!DEMO && api && api.desktopShell) {
    try { await api.desktopShell.setIconsVisible(false); } catch { /* 基座兜底 */ }
  }
  await refresh(true).catch((e) => toast('加载失败：' + e.message));
  startPush();
  // 兜底：SSE 断了（代理/休眠）时每 20s 问一次 rev，只回一个数字，没变化零渲染
  setInterval(() => { refresh(false).catch(() => {}); }, 20000);
  window.addEventListener('resize', reportHotspots);
}

/** 变更推送：后端 fs.watch 桌面目录 → SSE 推 rev → 这里拉一次全量。没有轮询。 */
function startPush() {
  if (DEMO || typeof EventSource === 'undefined') return;
  try {
    const es = new EventSource(API_BASE + PLUGIN + '/events');
    es.addEventListener('rev', () => { refresh(true).catch(() => {}); });
  } catch { /* 建不起来就靠兜底轮询 */ }
}

boot();
