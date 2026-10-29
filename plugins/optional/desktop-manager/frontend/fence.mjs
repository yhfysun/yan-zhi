// 桌面整理 · 桌面层（Win+D 之后仍在的那一层）
//
// 运行环境：pluginWindow.open({ entry:'frontend/fence.html', placement:'desktop' })
//  • 窗口被钉到壁纸层（WorkerW），Win+D 不会把它最小化 —— 这就是"我们的桌面"
//  • 打开时隐藏系统图标，退出/关窗时恢复（基座在主进程侧还兜底恢复一次）
//  • 分组是半透明圆角区域，壁纸透出来；图标直接铺在桌面上，不是一个个带边框的面板
//  • 一键整理 = /plan（只算不动）→ 确认 → /apply（只移不删、可撤销）
const api = window.electronAPI || null;
const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const INBOX = 'inbox';

const EMOJI = {
  png: '🖼', jpg: '🖼', jpeg: '🖼', webp: '🖼', gif: '🖼', bmp: '🖼', svg: '🖼',
  pdf: '📕', doc: '📄', docx: '📄', txt: '📄', md: '📄', ppt: '📽', pptx: '📽',
  xls: '📊', xlsx: '📊', csv: '📊', zip: '🗜', rar: '🗜', '7z': '🗜',
  exe: '📦', msi: '📦', mp4: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
};
const extOf = (name) => String(name || '').split('.').pop().toLowerCase();

const S = { fences: [], items: [], sel: new Set(), rev: -1, windowId: null, clickThrough: true, busy: false };
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

/* ---------------- 渲染 ---------------- */

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

function render() {
  document.getElementById('stat').textContent =
    `${S.items.length} 个文件 · ${countIn(INBOX)} 个待归类`;

  const board = document.getElementById('board');
  board.textContent = '';
  let shown = 0;
  for (const f of S.fences) {
    const items = S.items.filter((i) => i.fenceId === f.id);
    if (!items.length && f.id !== INBOX) continue;
    shown += 1;

    const grp = document.createElement('div');
    grp.className = 'grp';
    grp.dataset.fence = f.id;

    const head = document.createElement('div');
    head.className = 'grp-head';
    head.innerHTML = '<span class="dot" style="background:' + (f.color || '#8ea3c4') + '"></span>'
      + '<span class="n"></span><span class="c">' + items.length + '</span><span class="sp"></span>';
    head.querySelector('.n').textContent = f.label;
    grp.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of items) grid.appendChild(itemEl(it));
    grp.appendChild(grid);
    board.appendChild(grp);
  }
  if (!shown) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '桌面很干净，没有可整理的文件';
    board.appendChild(empty);
  }

  const n = S.sel.size;
  document.getElementById('bulk').classList.toggle('show', n > 0);
  document.getElementById('bulkN').textContent = `已选 ${n} 项`;
  const sel = document.getElementById('moveSel');
  const keep = sel.value;
  sel.innerHTML = S.fences.map((f) => `<option value="${f.id}"></option>`).join('');
  [...sel.options].forEach((o, i) => { o.textContent = S.fences[i].label; });
  if (S.fences.some((f) => f.id === keep)) sel.value = keep;
}

function itemEl(item) {
  const el = document.createElement('div');
  el.className = 'ic' + (S.sel.has(item.name) ? ' sel' : '');
  el.dataset.name = item.name;
  el.draggable = true;

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
    render();
  });
  el.addEventListener('dblclick', () => {
    if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {});
  });
  el.addEventListener('dragstart', (e) => {
    const names = S.sel.has(item.name) ? [...S.sel] : [item.name];
    e.dataTransfer.setData('text/plain', names.join('\n'));
    e.dataTransfer.effectAllowed = 'move';
  });
  return el;
}

/* ---------------- 数据 ---------------- */

async function refresh(hard) {
  const d = await request('/state');
  if (!hard && d.rev === S.rev) return;
  S.fences = d.fences || [];
  S.items = d.items || [];
  S.rev = d.rev;
  render();
}

async function assign(names, fenceId) {
  for (const name of names) {
    await request('/assign', { method: 'POST', body: JSON.stringify({ name, fenceId }) });
  }
  S.sel.clear();
  await refresh(true);
  const label = (S.fences.find((f) => f.id === fenceId) || {}).label || '分组';
  toast(`已移入「${label}」`);
}

/* ---------------- 桌面交互 ---------------- */

// 空白处穿透（壁纸/桌面右键交给系统），只有分组与工具条吃鼠标
function setClickThrough(v) {
  if (v === S.clickThrough) return;
  S.clickThrough = v;
  if (api && api.pluginWindow && S.windowId) {
    api.pluginWindow.update(S.windowId, { clickThrough: v }).catch(() => {});
  }
}
document.addEventListener('mousemove', (e) => {
  setClickThrough(!e.target.closest('.grp, .bar, .bulk, .mask'));
});

function bindDrops() {
  const board = document.getElementById('board');
  board.addEventListener('dragover', (e) => {
    const grp = e.target.closest('.grp');
    if (!grp) return;
    e.preventDefault();
    board.querySelectorAll('.grp').forEach((g) => g.classList.toggle('hot', g === grp));
  });
  board.addEventListener('dragleave', () => {
    board.querySelectorAll('.grp').forEach((g) => g.classList.remove('hot'));
  });
  board.addEventListener('drop', async (e) => {
    const grp = e.target.closest('.grp');
    if (!grp) return;
    e.preventDefault();
    board.querySelectorAll('.grp').forEach((g) => g.classList.remove('hot'));
    const names = String(e.dataTransfer.getData('text/plain') || '').split('\n').filter(Boolean);
    if (!names.length) return;
    try { await assign(names, grp.dataset.fence); } catch (err) { toast('移动失败：' + err.message, true); }
  });
}

/* ---------------- 一键整理 ---------------- */

let pendingPlan = null;

async function organize() {
  if (S.busy) return;
  S.busy = true;
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
    document.getElementById('mask').classList.add('show');
  } catch (e) {
    toast('生成方案失败：' + e.message, true);
  } finally {
    S.busy = false;
  }
}

async function applyPending() {
  if (!pendingPlan) return;
  const plan = pendingPlan;
  pendingPlan = null;
  document.getElementById('mask').classList.remove('show');
  try {
    const out = await request('/apply', { method: 'POST', body: JSON.stringify({ planId: plan.planId, confirmed: true }) });
    const skipped = (out.skipped || []).length;
    toast(`已整理 ${out.moved} 个文件${skipped ? `（跳过 ${skipped} 个）` : ''}`);
    await refresh(true);
  } catch (e) {
    toast('执行失败：' + e.message, true);
  }
}

/* ---------------- 启动 ---------------- */

document.getElementById('btnOrganize').addEventListener('click', organize);
document.getElementById('dlgCancel').addEventListener('click', () => {
  pendingPlan = null;
  document.getElementById('mask').classList.remove('show');
});
document.getElementById('dlgOk').addEventListener('click', applyPending);
document.getElementById('btnNew').addEventListener('click', async () => {
  const label = window.prompt('新分组名称（不删任何文件）');
  if (!label) return;
  try {
    await request('/fences', { method: 'POST', body: JSON.stringify({ label }) });
    await refresh(true);
    toast(`已新建「${label}」`);
  } catch (e) { toast('新建失败：' + e.message, true); }
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
  if (api && api.pluginWindow && S.windowId) {
    try { await api.pluginWindow.close(S.windowId); } catch { /* ignore */ }
  } else { window.close(); }
});
document.getElementById('btnClear').addEventListener('click', () => { S.sel.clear(); render(); });
document.getElementById('btnMove').addEventListener('click', async () => {
  const fenceId = document.getElementById('moveSel').value;
  if (!fenceId || !S.sel.size) return;
  try { await assign([...S.sel], fenceId); } catch (e) { toast('移动失败：' + e.message, true); }
});

bindDrops();
(async () => {
  if (api && api.pluginWindow) {
    try {
      const list = await api.pluginWindow.list();
      const mine = list.find((w) => w.placement === 'desktop');
      if (mine) S.windowId = mine.windowId;
    } catch { /* ignore */ }
  }
  // 隐藏系统图标：这一层接管桌面；退出/关窗时恢复（主进程还有一次兜底）
  if (api && api.desktopShell) {
    try { await api.desktopShell.setIconsVisible(false); } catch (e) { toast('隐藏系统图标失败：' + e.message, true); }
  }
  try { await refresh(true); } catch (e) { toast('加载失败：' + e.message, true); }
  setInterval(() => { refresh(false).catch(() => {}); }, 1500);
})();
