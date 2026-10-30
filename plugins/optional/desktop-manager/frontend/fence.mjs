// 桌面整理 · 桌面层（Win+D 之后仍在的那一层）
//
// 架构：**一个分组一个窗口**（OpenFences / Stardock Fences 同思路）。
// 窗口边界就是命中边界，所以不需要「整屏窗口 + 局部穿透」——
// 钉到 Progman 子层的窗口收不到转发的 mousemove，穿透永远不可靠，
// 表现就是「要么吞点击、要么点不到按钮」。空白桌面现在根本不归我们管。
//
// 两种角色：
//  · frontend/fence.html               工具条（宿主）：隐藏系统图标、按数据拉起/收掉子窗口
//  · frontend/fence.html?fence=<id>    单个分组窗口：只渲染这一组，拖标题栏移动窗口、双击折叠
// 组件同样一个窗口一个（frontend/widgets.html?id=…），避免整屏遮挡。
const api = window.electronAPI || null;
import { openWidgetMenu } from './widget-create.mjs';
import {
  fenceEntry,
  isChildEntry,
  desiredWindows,
  diffWindows,
  fenceWindowRect,
} from '../shared/desktop-windows.js';

const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const SNAP = 8;

const qs = new URLSearchParams(location.search);
const FENCE_ID = String(qs.get('fence') || '').trim();
const MODE = FENCE_ID ? 'fence' : 'toolbar';
const SELF_ENTRY = MODE === 'fence' ? fenceEntry(FENCE_ID) : 'frontend/fence.html';

const EMOJI = {
  png: '🖼', jpg: '🖼', jpeg: '🖼', webp: '🖼', gif: '🖼', bmp: '🖼', svg: '🖼',
  pdf: '📕', doc: '📄', docx: '📄', txt: '📄', md: '📄', ppt: '📽', pptx: '📽',
  xls: '📊', xlsx: '📊', csv: '📊', zip: '🗜', rar: '🗜', '7z': '🗜',
  exe: '📦', msi: '📦', mp4: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
};
const extOf = (name) => String(name || '').split('.').pop().toLowerCase();
const snap8 = (v) => Math.round(Number(v) / SNAP) * SNAP;

const S = {
  fences: [], items: [], widgets: [], sel: new Set(), rev: -1,
  windowId: null, rect: null, loaded: false, dragging: false,
  syncing: false, opening: new Set(),
};
const iconCache = new Map();

async function request(path, opts) {
  const r = await fetch(API_BASE + PLUGIN + path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data;
}

function toast(msg, isErr) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2200);
}

const countIn = (id) => S.items.filter((i) => i.fenceId === id).length;

/* ---------------- 窗口自我定位 ---------------- */

/** 从主进程窗口清单里认出「我自己」（入口串含 query，和别组的窗口互不干扰） */
async function identifyWindow() {
  if (!api || !api.pluginWindow) return;
  try {
    const list = await api.pluginWindow.list();
    const mine = list.find((w) => w.pluginId === 'desktop-manager' && w.entry === SELF_ENTRY);
    if (mine) { S.windowId = mine.windowId; S.rect = mine.rect || null; }
  } catch { /* 主进程重启中 */ }
}

/** 移动/缩放自己的窗口（分组的 rect 由数据决定；工具条由内容决定） */
function applyWindowRect(rect) {
  if (!api || !api.pluginWindow || !S.windowId || !rect) return;
  S.rect = { ...rect };
  api.pluginWindow.update(S.windowId, { rect }).catch(() => {});
}

function raiseSelf() {
  if (!api || !api.pluginWindow || !S.windowId) return;
  if (typeof api.pluginWindow.raise !== 'function') return;
  api.pluginWindow.raise(S.windowId).catch(() => {});
}

/* ---------------- 图标 ---------------- */

function imgOf(src) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  return img;
}

function paintIcon(host, item) {
  const key = item.path + '|' + (item.mtimeMs || 0);
  host.textContent = item.isDir ? '📁' : (EMOJI[extOf(item.name)] || '📄');
  const cached = iconCache.get(key);
  if (cached) { host.textContent = ''; host.appendChild(imgOf(cached)); return; }
  if (!api || !api.desktopShell || !api.desktopShell.fileIcon) return;
  // 256px jumbo 原生图标（主进程 SHGetImageList + 缓存），按 48px 1:1 渲染；
  // 助手不可用时主进程自动回落 app.getFileIcon(48px)。
  api.desktopShell.fileIcon(item.path).then((r) => {
    if (!r || !r.ok || !r.dataUrl) return;
    iconCache.set(key, r.dataUrl);
    host.textContent = '';
    host.appendChild(imgOf(r.dataUrl));
  }).catch(() => {});
}

/* ---------------- 右键菜单 ---------------- */

let menuEl = null;
function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}
document.addEventListener('mousedown', (e) => {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); }, true);

function buildMenu(x, y, rows) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  for (const row of rows) {
    if (row === '-') { const sep = document.createElement('div'); sep.className = 'sep'; m.appendChild(sep); continue; }
    if (row.header) { const h = document.createElement('div'); h.className = 'hd'; h.textContent = row.header; m.appendChild(h); continue; }
    const it = document.createElement('div');
    it.className = 'mi';
    it.textContent = row.label;
    it.addEventListener('click', () => { closeMenu(); row.onClick(); });
    m.appendChild(it);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(Math.max(6, x), window.innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(Math.max(6, y), window.innerHeight - r.height - 6) + 'px';
  menuEl = m;
  return m;
}

/* ---------------- 数据 ---------------- */

async function refresh() {
  const d = await request('/state');
  S.fences = d.fences || [];
  S.items = d.items || [];
  S.rev = d.rev;
  S.loaded = true;
}

async function assign(names, fenceId) {
  for (const name of names) {
    await request('/assign', { method: 'POST', body: JSON.stringify({ name, fenceId }) });
  }
  S.sel.clear();
  await refresh();
  if (MODE === 'fence') renderFence(); else renderBar();
  const label = (S.fences.find((f) => f.id === fenceId) || {}).label || '分组';
  toast(`已移入「${label}」`);
}

/* =====================================================================
   角色 A：单个分组窗口
   ===================================================================== */

const myFence = () => S.fences.find((f) => f.id === FENCE_ID) || null;
const myItems = () => S.items.filter((i) => i.fenceId === FENCE_ID);

function renderFence() {
  const f = myFence();
  if (!f) return;
  const items = myItems();
  const grp = document.getElementById('grp');
  grp.classList.toggle('collapsed', !!f.collapsed);
  document.getElementById('grpDot').style.background = f.color || '#8ea3c4';
  document.getElementById('grpName').textContent = f.label;
  document.getElementById('grpName').title = f.label;
  document.getElementById('grpCount').textContent = items.length ? String(items.length) : '';
  document.getElementById('btnCollapse').textContent = f.collapsed ? '+' : '–';

  const grid = document.getElementById('grpGrid');
  grid.textContent = '';
  for (const it of items) grid.appendChild(itemEl(it));
  if (!items.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px 4px;font-size:12px;color:rgba(255,255,255,.45)';
    empty.textContent = '把文件拖进来，或右键文件「移入」';
    grid.appendChild(empty);
  }

  const n = S.sel.size;
  document.getElementById('bulk').classList.toggle('show', n > 0);
  document.getElementById('bulkN').textContent = `已选 ${n} 项`;
  const sel = document.getElementById('moveSel');
  const keep = sel.value;
  const others = S.fences.filter((x) => x.id !== FENCE_ID);
  sel.innerHTML = others.map((x) => `<option value="${x.id}"></option>`).join('');
  [...sel.options].forEach((o, i) => { o.textContent = others[i].label; });
  if (others.some((x) => x.id === keep)) sel.value = keep;
}

function itemEl(item) {
  const el = document.createElement('div');
  el.className = 'ic' + (S.sel.has(item.name) ? ' sel' : '');
  el.dataset.name = item.name;

  const ico = document.createElement('span');
  ico.className = 'ico';
  paintIcon(ico, item);

  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = item.name;
  nm.title = item.rel || item.name;

  el.append(ico, nm);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) S.sel.has(item.name) ? S.sel.delete(item.name) : S.sel.add(item.name);
    else { S.sel.clear(); S.sel.add(item.name); }
    renderFence();
  });
  el.addEventListener('dblclick', () => {
    if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {});
  });
  // 跨窗口没法用 HTML5 拖放（两个独立 BrowserWindow 之间传不了 dataTransfer），
  // 所以「移入别的分组」走右键菜单。
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rows = [{
      label: '打开',
      onClick: () => { if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {}); },
    }, '-', { header: '移入分组' }];
    for (const f of S.fences) {
      if (f.id === FENCE_ID) continue;
      rows.push({ label: `→ ${f.label}`, onClick: () => assign([item.name], f.id).catch((err) => toast('移动失败：' + err.message, true)) });
    }
    buildMenu(e.clientX, e.clientY, rows);
  });
  return el;
}

/* ---- 拖标题栏移动窗口（拖动中移动窗口，松手才落库） ---- */

let drag = null;
let rafId = null;
let pendingRect = null;

function scheduleRect(rect) {
  pendingRect = rect;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const r = pendingRect;
    pendingRect = null;
    if (r) applyWindowRect(r);
  });
}

function bindDrag() {
  const head = document.getElementById('grpHead');
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    raiseSelf();
    const base = S.rect || fenceWindowRect(myFence() || {});
    drag = {
      id: e.pointerId, sx: e.screenX, sy: e.screenY,
      x: base.x, y: base.y, w: base.w, h: base.h, moved: false, nx: base.x, ny: base.y,
    };
    try { head.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.screenX - drag.sx;
    const dy = e.screenY - drag.sy;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;
    S.dragging = true;
    drag.nx = snap8(drag.x + dx);
    drag.ny = snap8(drag.y + dy);
    scheduleRect({ x: drag.nx, y: drag.ny, w: drag.w, h: drag.h });
  });
  const end = async (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    S.dragging = false;
    try { head.releasePointerCapture(d.id); } catch { /* ignore */ }
    if (!d.moved) return;
    const rect = { x: d.nx, y: d.ny, w: d.w, h: d.h };
    applyWindowRect(rect);
    try {
      await request('/fences/' + encodeURIComponent(FENCE_ID), { method: 'PATCH', body: JSON.stringify({ rect }) });
    } catch (err) {
      toast('保存位置失败：' + err.message, true);
    }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

/** 数据里的 rect 才是权威：别处改了尺寸（AI/设置页）要跟上；拖动中不抢 */
function followRect(force) {
  const f = myFence();
  if (!f || !S.windowId) return;
  const want = fenceWindowRect(f);
  const cur = S.rect;
  if (!force && cur
    && Math.abs(cur.x - want.x) <= 2 && Math.abs(cur.y - want.y) <= 2
    && Math.abs(cur.w - want.w) <= 2 && Math.abs(cur.h - want.h) <= 2) return;
  applyWindowRect(want);
}

async function toggleCollapse() {
  const f = myFence();
  if (!f) return;
  const next = !f.collapsed;
  f.collapsed = next; // 先本地生效，避免来回闪
  renderFence();
  applyWindowRect(fenceWindowRect(f));
  try {
    await request('/fences/' + encodeURIComponent(FENCE_ID), {
      method: 'PATCH', body: JSON.stringify({ collapsed: next }),
    });
  } catch (err) {
    toast('折叠状态没保存：' + err.message, true);
  }
}

function bindBulk() {
  document.getElementById('btnClear').addEventListener('click', () => { S.sel.clear(); renderFence(); });
  document.getElementById('btnMove').addEventListener('click', async () => {
    const fenceId = document.getElementById('moveSel').value;
    if (!fenceId || !S.sel.size) return;
    try { await assign([...S.sel], fenceId); } catch (e) { toast('移动失败：' + e.message, true); }
  });
}

async function fenceBoot() {
  document.body.classList.add('mode-fence');
  await identifyWindow();
  bindDrag();
  bindBulk();
  document.getElementById('btnCollapse').addEventListener('click', (e) => { e.stopPropagation(); toggleCollapse(); });
  document.getElementById('grpHead').addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    toggleCollapse();
  });
  // 空白处（组内没图标的区域）右击 → 新建组件
  document.getElementById('grpGrid').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.ic')) return;
    e.preventDefault();
    addWidgetMenu(e.clientX, e.clientY);
  });

  try {
    await refresh();
  } catch (e) {
    toast('加载失败：' + e.message, true);
  }
  if (!myFence()) {
    // 这一组已被删掉：关掉自己的窗口（工具条不会再拉起）
    if (api && api.pluginWindow && S.windowId) { try { await api.pluginWindow.close(S.windowId); } catch { /* ignore */ } }
    return;
  }
  renderFence();
  followRect(true);
  setInterval(async () => {
    try {
      await refresh();
      if (!myFence()) {
        if (api && api.pluginWindow && S.windowId) await api.pluginWindow.close(S.windowId);
        return;
      }
      renderFence();
      followRect(false);
    } catch { /* 后端重启中 */ }
  }, 1500);
}

/* =====================================================================
   角色 B：工具条（宿主）—— 负责按数据拉起/收掉每个分组、每个组件的窗口
   ===================================================================== */

let baseRect = null;
let expanded = false;

function renderBar() {
  const inbox = countIn('inbox');
  document.getElementById('stat').textContent = `${S.items.length} 个文件 · ${inbox} 个待归类`;
}

/** 工具条窗口只覆盖「工具条」这一小条，空白桌面留给系统。
 *  放右上角：分组默认从左上角 40,40 开始铺，两者不打架。 */
function fitToolbarWindow() {
  if (expanded) return;
  const bar = document.getElementById('bar').getBoundingClientRect();
  const w = Math.max(260, Math.ceil(bar.right + 10));
  const h = Math.max(50, Math.ceil(bar.bottom + 8));
  const screenW = Number(window.screen && window.screen.availWidth) || 1920;
  const rect = { x: Math.max(0, Math.round(screenW - w - 16)), y: 12, w, h };
  baseRect = rect;
  applyWindowRect(rect);
}

/** 弹层（确认整理 / 新建分组 / 组件菜单）要空间：临时把工具条窗口放大 */
function expandForDialog(on) {
  if (MODE !== 'toolbar') return;
  if (expanded === on) return;
  expanded = on;
  if (!baseRect) fitToolbarWindow();
  applyWindowRect(on
    ? { x: baseRect.x, y: baseRect.y, w: Math.max(520, baseRect.w), h: 480 }
    : baseRect);
}

async function syncChildren() {
  if (!api || !api.pluginWindow || S.syncing) return;
  S.syncing = true;
  try {
    const list = await api.pluginWindow.list();
    const mine = list.filter((w) => w.pluginId === 'desktop-manager' && isChildEntry(w.entry));
    const { open, close } = diffWindows(mine, desiredWindows({
      fences: S.fences, items: S.items, widgets: S.widgets,
    }));

    let opened = 0;
    for (const d of open) {
      if (S.opening.has(d.entry)) continue;
      S.opening.add(d.entry);
      opened += 1;
      api.pluginWindow.open({
        pluginId: 'desktop-manager',
        entry: d.entry,
        placement: 'desktop',
        rect: d.rect,
      }).catch(() => {}).finally(() => S.opening.delete(d.entry));
    }
    for (const w of close) {
      api.pluginWindow.close(w.windowId).catch(() => {});
    }
    // 新钉上去的子窗口会盖在工具条上面 → 工具条重新提到最前，否则按钮点不到
    if (opened) {
      await new Promise((r) => setTimeout(r, 260));
      raiseSelf();
    }
  } finally {
    S.syncing = false;
  }
}

/* ---- 一键整理 ---- */

let pendingPlan = null;

async function organize() {
  try {
    const plan = await request('/plan', { method: 'POST', body: JSON.stringify({}) });
    if (!plan.total) { toast('桌面已经很整齐了：没有需要整理的文件'); return; }
    pendingPlan = plan;
    document.getElementById('dlgSub').textContent =
      `将把 ${plan.total} 个桌面文件归入以下分组；只移动、不删除，执行后可整批撤销。`;
    const list = document.getElementById('dlgList');
    list.textContent = '';
    for (const g of plan.groups) {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = g.target;
      const b = document.createElement('span'); b.textContent = g.count + ' 个'; b.style.color = '#7ef0b0';
      li.append(a, b);
      list.appendChild(li);
    }
    showMask(true);
  } catch (e) {
    toast('生成方案失败：' + e.message, true);
  }
}

function showMask(v) {
  document.getElementById('mask').classList.toggle('show', v);
  expandForDialog(v);
}

async function applyPending() {
  if (!pendingPlan) return;
  const plan = pendingPlan;
  pendingPlan = null;
  showMask(false);
  try {
    const out = await request('/apply', { method: 'POST', body: JSON.stringify({ planId: plan.planId, confirmed: true }) });
    const skipped = (out.skipped || []).length;
    toast(`已整理 ${out.moved} 个文件${skipped ? `（跳过 ${skipped} 个）` : ''}`);
    await refresh();
    renderBar();
  } catch (e) {
    toast('执行失败：' + e.message, true);
  }
}

/* ---- 输入对话框（Electron 不支持 window.prompt） ---- */

function askText({ title, sub, placeholder, value }) {
  return new Promise((resolve) => {
    const mask = document.getElementById('askMask');
    const ok = document.getElementById('askOk');
    const cancel = document.getElementById('askCancel');
    const input = document.getElementById('askInput');
    document.getElementById('askTitle').textContent = title || '';
    document.getElementById('askSub').textContent = sub || '';
    input.value = value || '';
    input.placeholder = placeholder || '';
    mask.classList.add('show');
    expandForDialog(true);
    setTimeout(() => input.focus(), 30);

    const finish = (v) => {
      mask.classList.remove('show');
      expandForDialog(false);
      ok.onclick = null;
      cancel.onclick = null;
      input.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim()); }
      if (e.key === 'Escape') finish('');
    };
    ok.onclick = () => finish(input.value.trim());
    cancel.onclick = () => finish('');
    input.addEventListener('keydown', onKey);
  });
}

/* ---- 新建组件菜单（菜单是 DOM，工具条窗口装不下 → 临时放大） ---- */

function addWidgetMenu(x, y) {
  expandForDialog(true);
  openWidgetMenu({
    request,
    x,
    y,
    onDone: () => toast('已新建组件'),
    onError: (e) => toast('新建失败：' + (e && e.message ? e.message : e), true),
  });
  const menu = document.body.lastElementChild;
  const obs = new MutationObserver(() => {
    if (menu && menu.isConnected) return;
    obs.disconnect();
    expandForDialog(false);
  });
  obs.observe(document.body, { childList: true });
}

function bindToolbar() {
  document.getElementById('btnOrganize').addEventListener('click', organize);
  document.getElementById('dlgCancel').addEventListener('click', () => { pendingPlan = null; showMask(false); });
  document.getElementById('dlgOk').addEventListener('click', applyPending);
  document.getElementById('btnNew').addEventListener('click', async () => {
    const label = await askText({
      title: '新建分组',
      sub: '只改显示分组，不移动任何文件。',
      placeholder: '分组名称，如：工作',
    });
    if (!label) return;
    try {
      await request('/fences', { method: 'POST', body: JSON.stringify({ label }) });
      await refresh();
      renderBar();
      await syncChildren();
      toast(`已新建「${label}」`);
    } catch (e) { toast('新建失败：' + e.message, true); }
  });
  document.getElementById('btnAddWidget').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    addWidgetMenu(r.left, r.bottom + 6);
  });
  // 右击工具条 → 新建组件菜单
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.bar')) return;
    e.preventDefault();
    addWidgetMenu(e.clientX, e.clientY);
  });
  document.getElementById('btnSettings').addEventListener('click', async () => {
    if (!api || !api.pluginWindow) return;
    const r = await api.pluginWindow.open({
      pluginId: 'desktop-manager',
      entry: 'frontend/settings.html',
      placement: 'normal',
      rect: { x: 220, y: 110, w: 640, h: 720 },
      resizable: true,
    });
    if (r && r.ok === false) toast('打开设置失败：' + r.error, true);
  });
  document.getElementById('btnExit').addEventListener('click', async () => {
    try { if (api && api.desktopShell) await api.desktopShell.setIconsVisible(true); } catch { /* 基座兜底 */ }
    if (api && api.pluginWindow) {
      try { await api.pluginWindow.closeAll('desktop-manager'); } catch { /* ignore */ }
    } else { window.close(); }
  });
}

async function toolbarBoot() {
  document.body.classList.add('mode-toolbar');
  await identifyWindow();
  bindToolbar();

  // 隐藏系统图标：这一层接管桌面；退出/关窗时恢复（主进程还有一次兜底）
  if (api && api.desktopShell) {
    try { await api.desktopShell.setIconsVisible(false); } catch (e) { toast('隐藏系统图标失败：' + e.message, true); }
  }

  const tick = async (hard) => {
    try {
      const [st, wd] = await Promise.all([
        request('/state'),
        request('/widgets').catch(() => null),
      ]);
      S.fences = st.fences || [];
      S.items = st.items || [];
      S.rev = st.rev;
      if (wd) S.widgets = (wd.widgets || []).filter((w) => w.layer === 'desktop');
      renderBar();
      if (hard) fitToolbarWindow();
      await syncChildren();
    } catch { /* 后端重启中 */ }
  };

  await tick(true);
  window.addEventListener('resize', () => { baseRect = null; fitToolbarWindow(); });
  setInterval(() => tick(false), 1500);
}

/* ---------------- 启动 ---------------- */

if (MODE === 'fence') fenceBoot();
else toolbarBoot();
