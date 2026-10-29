// 围栏渲染页（P0-B）
//
// 运行环境：electronAPI.pluginWindow.open({ placement:'desktop' }) 打开的独立窗口。
// 数据面：插件自己的后端路由 /api/plugin/desktop-manager/{state,fences,assign}。
// 交互：双击打开、拖拽图标改归属、拖标题移动围栏、右下角缩放、空白区点击穿透。
import { cellsFor, minHeightFor, sortItems, extOf } from '../shared/fences.js';

const api = window.electronAPI || null;
const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const INBOX = 'inbox';
// 演示模式：浏览器里直接看版式（无 Electron / 无后端）。真实窗口不会带这个参数。
const DEMO = new URLSearchParams(location.search).has('demo');

function demoState() {
  const mk = (name, fenceId, mtimeMs) => ({ name, rel: name, path: '/' + name, mtimeMs, isDir: false, fenceId });
  return {
    fences: [
      { id: 'inbox', label: '待归类', color: '#9aa6ba', sort: 'name', rect: { x: 40, y: 40, w: 400, h: 300 } },
      { id: 'f-work', label: '工作文档', color: '#5b8cff', sort: 'name', rect: { x: 456, y: 40, w: 400, h: 320 } },
      { id: 'f-img', label: '图片截图', color: '#b07cff', sort: 'name', rect: { x: 40, y: 360, w: 400, h: 280 } },
      { id: 'f-setup', label: '安装包', color: '#f0a03c', sort: 'name', rect: { x: 456, y: 380, w: 400, h: 200 } },
      { id: 'f-proj', label: '项目·星图', color: '#2fc6c6', sort: 'name', rect: { x: 40, y: 660, w: 400, h: 240 } },
    ],
    items: [
      mk('未命名文档 (3)', 'inbox', 1), mk('scan_0031', 'inbox', 2), mk('新建文件夹 (2)', 'inbox', 3),
      mk('需求说明.docx', 'f-work', 4), mk('报价单-final.xlsx', 'f-work', 5), mk('合同扫描.pdf', 'f-work', 6),
      mk('技术方案.pptx', 'f-work', 7), mk('接口文档.pdf', 'f-work', 8), mk('预算表.xlsx', 'f-work', 9),
      mk('截图 2026-10-26 151203.png', 'f-img', 10), mk('截图 2026-10-25 094412.png', 'f-img', 11),
      mk('产品原型-v3.png', 'f-img', 12), mk('设计稿-首页.png', 'f-img', 13),
      mk('Node-setup.exe', 'f-setup', 14), mk('微信安装包.exe', 'f-setup', 15), mk('VSCodeSetup.exe', 'f-setup', 16),
      mk('星图-立项书.docx', 'f-proj', 17), mk('星图-接口约定.md', 'f-proj', 18), mk('星图-里程碑.xlsx', 'f-proj', 19),
    ],
  };
}

const S = { fences: [], items: [], windowId: null, clickThrough: true, dragging: false, sig: '', rev: -1 };
const iconCache = new Map();
const EMOJI = {
  doc: '📄', docx: '📄', pdf: '📕', md: '🗒️', txt: '📄', rtf: '📄',
  xls: '📊', xlsx: '📊', csv: '📋', ppt: '📽️', pptx: '📽️',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️',
  mp4: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  exe: '⚙️', msi: '⚙️', lnk: '🔗', js: '📜', ts: '📜', json: '🧾',
};

async function request(path, opts) {
  const r = await fetch(API_BASE + PLUGIN + path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('on'), 2600);
}

async function refresh(force) {
  if (DEMO) {
    if (force || !S.sig) {
      const d = demoState();
      S.fences = d.fences;
      S.items = d.items;
      S.sig = 'demo';
      render();
    }
    return;
  }
  const data = await request('/state');
  S.rev = Number(data.rev) || 0;
  const sig = JSON.stringify([
    data.fences.map((f) => [f.id, f.label, f.rect.x, f.rect.y, f.rect.w, f.rect.h, f.sort, f.color]),
    data.items.map((i) => [i.name, i.fenceId, i.mtimeMs]),
  ]);
  S.fences = data.fences;
  S.items = data.items;
  if (force || sig !== S.sig) {
    S.sig = sig;
    render();
  }
}

/* ---------------- 渲染 ---------------- */

function render() {
  const layer = document.getElementById('layer');
  layer.textContent = '';
  for (const fence of S.fences) {
    const items = sortItems(S.items.filter((i) => i.fenceId === fence.id), fence.sort);
    const el = document.createElement('div');
    el.className = 'fence';
    el.dataset.fid = fence.id;
    el.style.left = fence.rect.x + 'px';
    el.style.top = fence.rect.y + 'px';
    el.style.width = fence.rect.w + 'px';
    el.style.height = Math.max(fence.rect.h, minHeightFor(fence.rect, items.length)) + 'px';

    const head = document.createElement('div');
    head.className = 'fh';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = fence.color;
    dot.style.color = fence.color;
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = fence.label;
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    cnt.textContent = String(items.length);
    head.append(dot, lbl, cnt);
    if (fence.id !== INBOX) {
      const del = document.createElement('button');
      del.className = 'fx';
      del.textContent = '✕';
      del.title = '移除围栏（不删除文件）';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await removeFence(fence);
      });
      head.appendChild(del);
    }
    el.appendChild(head);

    const cells = cellsFor(fence.rect, items.length);
    items.forEach((item, i) => el.appendChild(makeIcon(item, cells[i])));
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '拖文件到这里';
      el.appendChild(empty);
    }

    const rs = document.createElement('div');
    rs.className = 'rs';
    el.appendChild(rs);

    bindFenceDrag(el, head, fence);
    bindResize(el, rs, fence);

    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drop');
      const name = e.dataTransfer.getData('text/plain');
      if (name) await assign(name, fence.id);
    });

    layer.appendChild(el);
  }
}

function makeIcon(item, cell) {
  const d = document.createElement('div');
  d.className = 'icon';
  d.draggable = item.rel.indexOf('/') < 0; // 文件夹内文件不参与拖拽改归属
  d.style.left = cell.x + 'px';
  d.style.top = cell.y + 'px';

  const tile = document.createElement('div');
  tile.className = 'tile';
  const key = item.path + '|' + item.mtimeMs;
  const cached = iconCache.get(key);
  if (cached) {
    const img = document.createElement('img');
    img.src = cached;
    tile.appendChild(img);
  } else {
    tile.textContent = item.isDir ? '📁' : (EMOJI[extOf(item.name)] || '📄');
    if (api && api.desktopShell) {
      api.desktopShell.fileIcon(item.path).then((r) => {
        if (r && r.ok && r.dataUrl) {
          iconCache.set(key, r.dataUrl);
          tile.textContent = '';
          const img = document.createElement('img');
          img.src = r.dataUrl;
          tile.appendChild(img);
        }
      }).catch(() => { /* 图标取不到就用 emoji 兜底 */ });
    }
  }

  const nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = item.name;
  d.append(tile, nm);

  d.addEventListener('dblclick', () => {
    if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {});
  });
  d.addEventListener('dragstart', (e) => {
    if (!d.draggable) return;
    e.dataTransfer.setData('text/plain', item.name);
    e.dataTransfer.effectAllowed = 'move';
    S.dragging = true;
  });
  d.addEventListener('dragend', () => { S.dragging = false; });
  d.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, item);
  });
  return d;
}

/* ---------------- 围栏拖动 / 缩放 ---------------- */

function bindFenceDrag(el, head, fence) {
  head.addEventListener('mousedown', (ev) => {
    if (ev.target.closest('.fx')) return;
    ev.preventDefault();
    S.dragging = true;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = fence.rect.x;
    const oy = fence.rect.y;

    const move = (e2) => {
      fence.rect.x = Math.max(0, ox + e2.clientX - sx);
      fence.rect.y = Math.max(0, oy + e2.clientY - sy);
      el.style.left = fence.rect.x + 'px';
      el.style.top = fence.rect.y + 'px';
    };
    const up = async () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      S.dragging = false;
      try {
        await request('/fences/' + fence.id, { method: 'PATCH', body: JSON.stringify({ rect: fence.rect }) });
      } catch (e) { toast('保存位置失败：' + e.message); }
      refresh();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

function bindResize(el, handle, fence) {
  handle.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    S.dragging = true;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ow = fence.rect.w;
    const oh = fence.rect.h;
    const count = el.querySelectorAll('.icon').length;

    const move = (e2) => {
      fence.rect.w = Math.max(160, ow + e2.clientX - sx);
      fence.rect.h = Math.max(120, oh + e2.clientY - sy);
      el.style.width = fence.rect.w + 'px';
      el.style.height = Math.max(fence.rect.h, minHeightFor(fence.rect, count)) + 'px';
    };
    const up = async () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      S.dragging = false;
      try {
        await request('/fences/' + fence.id, { method: 'PATCH', body: JSON.stringify({ rect: fence.rect }) });
      } catch (e) { toast('保存尺寸失败：' + e.message); }
      refresh(true);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

/* ---------------- 归属 / 菜单元 ---------------- */

async function assign(name, fenceId) {
  if (String(name).includes('/')) {
    toast('文件夹内的文件请用「让智能体整理」移动');
    return;
  }
  try {
    await request('/assign', { method: 'POST', body: JSON.stringify({ name, fenceId }) });
    await refresh(true);
  } catch (e) {
    toast('移动失败：' + e.message);
  }
}

async function removeFence(fence) {
  if (!window.confirm('移除围栏「' + fence.label + '」？只移除围栏，不删除文件。')) return;
  try {
    await request('/fences/' + fence.id, { method: 'DELETE' });
    await refresh(true);
  } catch (e) {
    toast('移除失败：' + e.message);
  }
}

function openMenu(x, y, item) {
  const menu = document.getElementById('menu');
  menu.textContent = '';
  const add = (label, fn) => {
    const it = document.createElement('div');
    it.className = 'it';
    it.textContent = label;
    it.addEventListener('click', () => { menu.classList.remove('on'); fn(); });
    menu.appendChild(it);
  };
  add('打开', () => {
    if (api && api.desktopShell) api.desktopShell.openPath(item.path).catch(() => {});
  });
  if (item.fenceId !== INBOX) add('移出围栏', () => assign(item.name, INBOX));

  const sep = document.createElement('div');
  sep.className = 'sep';
  menu.appendChild(sep);
  const hd = document.createElement('div');
  hd.className = 'hd';
  hd.textContent = '移入围栏';
  menu.appendChild(hd);
  for (const f of S.fences) {
    if (f.id === item.fenceId) continue;
    add('→ ' + f.label, () => assign(item.name, f.id));
  }

  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 260) + 'px';
  menu.classList.add('on');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu')) document.getElementById('menu').classList.remove('on');
});

/* ---------------- 穿透 ---------------- */

function setClickThrough(v) {
  if (v === S.clickThrough) return;
  S.clickThrough = v;
  if (api && api.pluginWindow && S.windowId) {
    api.pluginWindow.update(S.windowId, { clickThrough: v }).catch(() => {});
  }
}

document.addEventListener('mousemove', (e) => {
  if (S.dragging) return;
  setClickThrough(!e.target.closest('.fence, .topbar, .menu'));
});

/* ---------------- 顶栏 ---------------- */

document.getElementById('btnNew').addEventListener('click', async () => {
  const label = window.prompt('围栏名称（也是对应文件夹名）');
  if (!label) return;
  try {
    await request('/fences', { method: 'POST', body: JSON.stringify({ label }) });
    await refresh(true);
  } catch (e) {
    toast('新建失败：' + e.message);
  }
});

document.getElementById('btnSettings').addEventListener('click', async () => {
  if (!api || !api.pluginWindow) { toast('仅桌面端可打开设置'); return; }
  try {
    const r = await api.pluginWindow.open({
      pluginId: 'desktop-manager',
      entry: 'frontend/settings.html',
      placement: 'normal',
      rect: { x: 120, y: 120, w: 620, h: 680 },
      resizable: true,
    });
    if (!r.ok) toast('打开设置失败：' + r.error);
  } catch (e) {
    toast('打开设置失败：' + e.message);
  }
});

document.getElementById('btnExit').addEventListener('click', async () => {
  try {
    if (api && api.desktopShell) await api.desktopShell.setIconsVisible(true);
  } catch { /* 基座退出时也会兜底恢复 */ }
  if (api && api.pluginWindow && S.windowId) {
    try { await api.pluginWindow.close(S.windowId); } catch { /* ignore */ }
  } else {
    window.close();
  }
});

/* ---------------- 启动 ---------------- */

async function boot() {
  if (DEMO) {
    document.body.classList.add('demo');
    document.getElementById('hint').textContent = '演示数据 · 新版围栏渲染（非 Electron 环境）';
    await refresh(true);
    return;
  }
  if (!api) {
    document.getElementById('hint').textContent = '非 Electron 环境：仅预览布局，无桌面集成';
  } else if (api.pluginWindow) {
    try {
      const list = await api.pluginWindow.list();
      const mine = list.find((w) => w.placement === 'desktop');
      if (mine) S.windowId = mine.windowId;
    } catch { /* ignore */ }
    if (api.desktopShell) {
      try { await api.desktopShell.setIconsVisible(false); } catch (e) { toast('隐藏系统图标失败：' + e.message); }
    }
  }
  try {
    await refresh(true);
  } catch (e) {
    toast('加载失败：' + e.message);
  }
  // 版本轮询：整理/指派/改围栏都会 bumpRev → 变了才拉全量（比整包 2.5s 轮询省得多）
  setInterval(async () => {
    if (S.dragging) return;
    try {
      const { rev } = await request('/rev');
      if (Number(rev) !== S.rev) await refresh(true);
    } catch { /* 后端重启中，下一轮再试 */ }
  }, 1200);
  window.addEventListener('beforeunload', () => {
    if (api && api.desktopShell) api.desktopShell.setIconsVisible(true).catch(() => {});
  });
}

boot();
