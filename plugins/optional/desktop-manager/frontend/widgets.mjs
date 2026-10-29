// 悬浮组件渲染页（P1）
//
// 运行环境：pluginWindow.open({ entry:'frontend/widgets.html?layer=desktop|overlay', placement })
// 数据面：/widgets（声明式实例）+ /widgets/data?contract=（只读契约）
// 交互：默认整窗穿透，仅 link 组件可点（避免挡住桌面与应用）
const api = window.electronAPI || null;
const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const qs = new URLSearchParams(location.search);
const LAYER = qs.get('layer') === 'overlay' ? 'overlay' : 'desktop';
const DEMO = qs.has('demo');

const S = { widgets: [], data: {}, rev: -1, windowId: null, clickThrough: false };
const COLORS = ['#5b8cff', '#37c98b', '#f0a03c', '#b07cff', '#2fc6c6', '#8ea3c4'];

async function request(path) {
  const r = await fetch(API_BASE + PLUGIN + path, { headers: { 'Content-Type': 'application/json' } });
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
    S.widgets = d.widgets.filter((w) => w.layer === LAYER);
    S.data = d.data;
    S.rev = 1;
    render();
    return;
  }
  const data = await request('/widgets');
  S.rev = Number(data.rev) || 0;
  S.widgets = (data.widgets || []).filter((w) => w.layer === LAYER);
  await loadData();
  render();
}

async function loadData() {
  const contracts = [...new Set(S.widgets.filter((w) => w.source).map((w) => w.source.contract))];
  for (const c of contracts) {
    try {
      S.data[c] = await request('/widgets/data?contract=' + encodeURIComponent(c));
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

function render() {
  const layer = document.getElementById('layer');
  layer.textContent = '';
  for (const w of S.widgets) {
    const el = document.createElement('div');
    el.className = 'widget ' + w.type;
    el.dataset.id = w.id;
    el.style.left = w.pos.x + 'px';
    el.style.top = w.pos.y + 'px';
    el.style.width = w.pos.w + 'px';
    el.style.height = w.pos.h + 'px';
    el.appendChild(buildBody(w));
    layer.appendChild(el);
  }
  if (!S.widgets.length) {
    const hint = document.createElement('div');
    hint.className = 'widget empty';
    hint.style.left = '40px';
    hint.style.top = '40px';
    hint.style.width = '280px';
    hint.style.height = '80px';
    hint.textContent = LAYER === 'overlay' ? '暂无悬浮层组件' : '暂无桌面层组件·可用智能体生成';
    layer.appendChild(hint);
  }
}

function buildBody(w) {
  const data = w.source ? S.data[w.source.contract] : null;
  const box = document.createElement('div');

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

/* ---------------- 穿透 / 生命周期 ---------------- */

function setClickThrough(v) {
  if (v === S.clickThrough) return;
  S.clickThrough = v;
  if (api && api.pluginWindow && S.windowId) {
    api.pluginWindow.update(S.windowId, { clickThrough: v }).catch(() => {});
  }
}

document.addEventListener('mousemove', (e) => {
  setClickThrough(!e.target.closest('.link'));
});

async function boot() {
  if (DEMO) {
    document.body.classList.add('demo');
    await loadWidgets();
    return;
  }
  if (api && api.pluginWindow) {
    try {
      const list = await api.pluginWindow.list();
      const mine = list.find((w) => w.placement === LAYER);
      if (mine) S.windowId = mine.windowId;
    } catch { /* ignore */ }
    setClickThrough(true);
  }
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
